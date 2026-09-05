const Project = require("../../models/Project");
const constants = require("../../constants");
const apiServices = require("../../services/API");
const userRolePerprojectServices = require("../../services/UserRolePerProject");
const { sequelize } = require("../../config/database");
const { Op } = require("sequelize");
const tableServices = require("../Table");
const APIKey = require("../../models/APIKey");
const UserRolePerProject = require("../../models/UserRolePerProject");

const getAll = async ({ userId, fields = undefined }) => {
  try {
    const roleRows = await UserRolePerProject.findAll({
      where: { userId },
      raw: true,
    });
    const projectIds = roleRows.map((roleRow) => roleRow.projectId);
    if (projectIds.length === 0) {
      return [];
    }
    const userProjects = await Project.findAll({
      where: {
        id: { [Op.in]: projectIds },
      },
      raw: true,
      attributes: fields,
    });

    const roleByProjectId = roleRows.reduce((acc, roleRow) => {
      acc[roleRow.projectId] = roleRow.role;
      return acc;
    }, {});

    const userSharedProjects = (userProjects || [])
      .filter(
        (project) => roleByProjectId[project.id] !== constants.roles.OWNER
      )
      .map((project) => ({
        ...project,
        role: roleByProjectId[project.id],
      }));

    const userOwnedProjects = (userProjects || [])
      .filter(
        (project) => roleByProjectId[project.id] === constants.roles.OWNER
      )
      .sort((project1, project2) => project1.order - project2.order)
      .map((project, index) => ({
        ...project,
        order: index,
        role: roleByProjectId[project.id],
      }));

    return [...userOwnedProjects, ...userSharedProjects];
  } catch (err) {
    console.error(err);
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

const create = async ({ title, icon, databaseUrl, userId }) => {
  const transaction = await sequelize.transaction();
  try {
    const options = {};
    if (databaseUrl) {
      options["databaseURL"] = databaseUrl;
    } else {
      options["databaseURL"] = "db1";
    }
    options["isDatabaseHostedInternally"] = !databaseUrl;

    const newProjectOrder = await Project.count({
      where: { userId },
      transaction: transaction,
    });

    const createProjectResult = await Project.create(
      {
        title: title,
        icon: icon,
        userId: userId,
        order: newProjectOrder,
        ...options,
      },
      { transaction: transaction }
    );

    const makeUserOwnerResult = await userRolePerprojectServices.create({
      userId: userId,
      projectId: createProjectResult.id,
      role: constants.roles["OWNER"],
      transaction: transaction,
    });

    const createAPIKeyforCreatedProjectResult =
      await apiServices.getOrCreateAPIKey({
        projectId: createProjectResult.id,
        externalTransaction: transaction,
      });

    if (createAPIKeyforCreatedProjectResult?.error) {
      throw new Error("Error create API key for the new project");
    }

    await transaction.commit();

    return createProjectResult;
  } catch (err) {
    console.error(err);
    await transaction.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

const update = async ({ userId, id, newData }) => {
  const transaction = await sequelize.transaction();
  try {
    const allowedFieldsToUpdate = ["title", "icon", "order"];
    const newDataFields = Object.keys(newData);
    if (
      newDataFields.filter((key) => allowedFieldsToUpdate.indexOf(key) < 0)
        .length > 0
    ) {
      await transaction.rollback();
      return {
        error: true,
        errorCode: 401,
        errorMessage: "Unautorized",
      };
    }

    // if order of a project updated, it will affect other projects order
    if (newDataFields.indexOf("order") >= 0) {
      const targetProject = await Project.findByPk(id, {
        transaction: transaction,
      });

      const whereClose = {};
      const fromOrder = targetProject.order,
        toOrder = newData.order;

      if (fromOrder < toOrder) {
        whereClose["order"] = {
          [Op.gt]: fromOrder,
          [Op.lte]: toOrder,
        };
      } else {
        whereClose["order"] = {
          [Op.lt]: fromOrder,
          [Op.gte]: toOrder,
        };
      }

      await Project[fromOrder < toOrder ? "decrement" : "increment"](
        ["order"],
        {
          where: {
            ...whereClose,
          },
          transaction: transaction,
        }
      );
    }

    const updatedProject = await Project.update(newData, {
      where: {
        id: id,
      },
      returning: true,
      raw: true,
      transaction: transaction,
    });

    await transaction.commit();

    return updatedProject[1];
  } catch (err) {
    console.error(err);
    await transaction.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

const remove = async ({ userId, id }) => {
  const transaction = await sequelize.transaction();
  try {
    const projectToDelete = await Project.findByPk(id, {
      raw: true,
      transaction: transaction,
    });
    if (!projectToDelete) throw new Error("Project not found!");

    const deleteAllProjectTablesResult =
      await tableServices.removeProjectTables({
        userId,
        projectId: id,
      });
    const deleteUserRolePerProjectResult = await UserRolePerProject.destroy({
      where: { projectId: id },
      raw: true,
      transaction: transaction,
    });
    const deleteProjectAPIKeysResult = await APIKey.destroy({
      where: {
        projectId: id,
      },
      raw: true,
      transaction: transaction,
    });
    const deleteProjectResult = await Project.destroy({
      where: {
        id: id,
      },
      raw: true,
      transaction: transaction,
    });
    const updateRemainingProjectsOrderResult = await Project.decrement(
      ["order"],
      {
        where: {
          order: {
            [Op.gt]: projectToDelete.order,
          },
        },
      }
    );
    await transaction.commit();
    return true;
  } catch (err) {
    console.error(err);
    await transaction.rollback();
    return { error: true, errorCode: 500, errorMessage: "Server error" };
  }
};

const removeAll = async ({ userId, externalTransaction = undefined }) => {
  const transaction = externalTransaction | (await sequelize.transaction());
  try {
    const projectsToDelete =
      (await Project.findAll({
        where: {
          userId,
        },
        raw: true,
        transaction: transaction,
      })) || [];

    for (let i = 0; i < projectsToDelete.length; i++) {
      const projectToDelete = projectsToDelete[i];
      const id = projectToDelete.id;
      const deleteAllProjectTablesResult =
        await tableServices.removeProjectTables({
          userId,
          projectId: id,
          externalTransaction: transaction,
        });
      const deleteUserRolePerProjectResult = await UserRolePerProject.destroy({
        where: { projectId: id },
        raw: true,
        transaction: transaction,
      });
      const deleteProjectAPIKeysResult = await APIKey.destroy({
        where: {
          projectId: id,
        },
        raw: true,
        transaction: transaction,
      });
      const deleteProjectResult = await Project.destroy({
        where: {
          userId: userId,
          id: id,
        },
        raw: true,
        transaction: transaction,
      });
    }

    if (!externalTransaction) {
      await transaction.commit();
    }
    return true;
  } catch (err) {
    console.error("project-services > removeAll:: ", err);
    if (externalTransaction) {
      throw new Error(err.toString());
    }
    await transaction.rollback();
    return { error: true, errorCode: 500, errorMessage: "Server error" };
  }
};

const projectServices = {
  getAll,
  create,
  update,
  remove,
  removeAll,
};

module.exports = projectServices;
