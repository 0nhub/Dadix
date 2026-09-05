const { sequelizeUserProjects, sequelize } = require("../../config/database");
const APIKeyPermissionPerTable = require("../../models/APIKeyPermissionPerTable");
const Table = require("../../models/Table");
const columnService = require("../../services/Column");
const recordService = require("../../services/Record");
const apiServices = require("../../services/API");
const viewService = require("../../services/View");
const { Op } = require("sequelize");
const { availableViews } = require("../../constants");

const create = async ({
  userId,
  projectId,
  name,
  icon,
  order = -1,
  columns = [],
  recordsData = [],
}) => {
  const transaction = await sequelize.transaction();
  const userProjectsDBTransaction = await sequelizeUserProjects.transaction();
  try {
    const allTables = await Table.findAll({
      where: {
        projectId: projectId,
      },
      transaction: transaction,
    });

    if (allTables.filter((table) => table.name === name).length > 0) {
      throw new Error("Table name already exist");
    }

    if (order === -1) {
      order = allTables.length;
    }

    const createdTable = await Table.create(
      {
        name: name,
        icon: icon || "Database",
        projectId: projectId,
        userId: userId,
        order: order,
        isVisible: true,
      },
      { transaction: transaction }
    );

    const projectApiKey = await apiServices.getProjectAPIKey({
      projectId: projectId,
    });

    if (projectApiKey?.error) {
      throw new Error("Error getting project API key");
    }

    // create table API key permission
    await APIKeyPermissionPerTable.create(
      { tableId: createdTable.id, APIKeyId: projectApiKey.id },
      { transaction: transaction }
    );

    // create table columns
    await columnService.createMany({
      userId: userId,
      tableId: createdTable.id,
      columns: columns,
      isNewTable: true, // true means create the table along with columns
      externalTransaction: transaction,
      externalUserProjectsDBTransaction: userProjectsDBTransaction,
    });

    // create new grid view
    await viewService.create({
      userId: userId,
      tableId: createdTable.id,
      viewData: {
        name: "All",
        type: availableViews.gridView,
        icon: "defaultIcon",
      },
      externalTransaction: transaction,
    });

    if (recordsData.length > 0) {
      await recordService.createMany({
        tableId: createdTable.id,
        recordsData,
        externalTransaction: userProjectsDBTransaction,
      });
    }

    await userProjectsDBTransaction.commit();
    await transaction.commit();

    return createdTable;
  } catch (err) {
    console.error(err);

    await userProjectsDBTransaction.rollback();
    await transaction.rollback();

    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : ("" + err).split("\n")[0] || `Server error`,
    };
  }
};

const get = async ({
  userId = undefined,
  projectId = undefined,
  id,
  noFields = false,
}) => {
  const transaction = await sequelize.transaction();
  try {
    const table = await Table.findByPk(id, {
      raw: true,
      transaction: transaction,
    });

    if (!table) {
      await transaction.rollback();
      return {
        error: true,
        errorCode: 404,
        errorMessage: `Table not found`,
      };
    }

    if (projectId && `${table.projectId}` !== `${projectId}`) {
      await transaction.rollback();
      return {
        error: true,
        errorCode: 401,
        errorMessage: `Unautorized`,
      };
    }

    const tableColumns = noFields
      ? []
      : await columnService.getAll({
          userId: userId,
          tableId: table.id,
          externalTransaction: transaction,
        });

    await transaction.commit();

    return {
      ...table,
      fields: [
        ...tableColumns.map((column) => ({
          ...column,
          userId: undefined,
          projectId: undefined,
          tableId: undefined,
        })),
      ],
    };
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

const getAll = async ({ userId, projectId }) => {
  try {
    const tables = await Table.findAll({
      where: {
        projectId: projectId,
      },
      raw: true,
    });
    return (tables || [])
      .sort((table1, table2) => table1.order - table2.order)
      .map((table, index) => ({ ...table, order: index }));
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

const update = async ({ userId, projectId, id, newData }) => {
  const transaction = await sequelize.transaction();
  try {
    const allowedFieldsToUpdate = ["name", "icon", "order", "isVisible"];
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

    const tablesToUpdateOrder = [];
    const targetTable = await Table.findByPk(id, {
      transaction,
      raw: true,
    });
    if (!targetTable) {
      await transaction.rollback();
      return {
        error: true,
        errorCode: 404,
        errorMessage: "Table not found",
      };
    }
    if (projectId && `${targetTable.projectId}` !== `${projectId}`) {
      await transaction.rollback();
      return {
        error: true,
        errorCode: 401,
        errorMessage: "Unautorized",
      };
    }
    // if order of a table updated, it will affect other tables order
    if (newDataFields.indexOf("order") >= 0) {
      // get all tables (of same project)
      const allTables = await getAll({ userId: userId, projectId: projectId });
      // add "epsilon" to the target table new order value, to avoid having 2 tables with same order value
      // and the sign of "epsilon" (- or +) will ditermin the exact new position of the table
      // here epsilon can be -0.1 or +0.1
      for (let i = 0; i < allTables.length; i++) {
        if (`${allTables[i].id}` !== `${id}`) {
          continue;
        }
        const oldOrder = allTables[i].order;
        const epsilon = oldOrder < newData.order ? 0.1 : -0.1;
        allTables[i].order = newData.order + epsilon;
      }
      allTables
        .sort((table1, table2) => table1.order - table2.order)
        .map((table, index) => {
          if (table.order !== index && `${table.id}` !== `${id}`) {
            const updatedTable = {};
            newDataFields.map((field) => {
              updatedTable[field] = table[field];
              return null;
            });
            tablesToUpdateOrder.push({
              ...updatedTable,
              userId: table.userId,
              projectId: projectId,
              id: table.id,
              order: index,
            });
          }
          return null;
        })
        .filter((elm) => elm !== null);
    }

    // Table.bulkCreate will not create new table if exist but it will update fields you sprecify in "updateOnDuplicate"
    const updatedTables = await Table.bulkCreate(
      [
        {
          userId: targetTable.userId,
          projectId: projectId,
          id: id,
          ...newData,
        },
        ...tablesToUpdateOrder,
      ],
      {
        updateOnDuplicate: newDataFields,
        transaction: transaction,
        raw: true,
      }
    );
    await transaction.commit();

    return updatedTables[0];
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

const remove = async ({ userId, projectId, id }) => {
  const transaction = await sequelize.transaction();
  const userProjectsDBTransaction = await sequelizeUserProjects.transaction();

  try {
    const tableToDelete = await Table.findByPk(id, {
      raw: true,
      transaction: transaction,
    });
    if (!tableToDelete) {
      await transaction.rollback();
      await userProjectsDBTransaction.rollback();
      return { error: true, errorCode: 404, errorMessage: "Table not found" };
    }
    if (projectId && `${tableToDelete.projectId}` !== `${projectId}`) {
      await transaction.rollback();
      await userProjectsDBTransaction.rollback();
      return { error: true, errorCode: 401, errorMessage: "Unautorized" };
    }
    await columnService.cleanupAfterTablesRemove({
      tablesIds: [id],
    });
    await Table.destroy({
      where: {
        projectId: projectId,
        id: id,
      },
      transaction: transaction,
    });

    // update remaining tables order
    const tablesToUpdateOrder = [];
    // get all tables (of same project)
    const allTables = await getAll({ userId: userId, projectId: projectId });
    // get new order for remaining tables
    allTables
      .filter((table) => `${table.id}` !== `${id}`)
      .sort((table1, table2) => table1.order - table2.order)
      .map((table, index) => {
        if (table.order !== index && `${table.id}` !== `${id}`) {
          tablesToUpdateOrder.push({
            userId: table.userId,
            projectId: table.projectId,
            id: table.id,
            order: index,
          });
        }
        return null;
      });
    if (tablesToUpdateOrder.length > 0) {
      // Table.bulkCreate will not create new table if exist but it will update fields you sprecify in "updateOnDuplicate"
      await Table.bulkCreate(tablesToUpdateOrder, {
        updateOnDuplicate: ["order"],
        transaction: transaction,
        raw: true,
      });
    }

    await sequelizeUserProjects.query(`DROP TABLE IF EXISTS "${id}" CASCADE;`, {
      transaction: userProjectsDBTransaction,
    });
    await transaction.commit();
    await userProjectsDBTransaction.commit();

    return { message: "Table removed successfuly!" };
  } catch (err) {
    console.error(err);
    await transaction.rollback();
    await userProjectsDBTransaction.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

const removeProjectTables = async ({
  userId,
  projectId,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  const userProjectsDBTransaction = await sequelizeUserProjects.transaction();

  try {
    // step 1 remove project tables from "project map" database
    const projectTables = await Table.findAll({
      where: { userId, projectId },
      raw: true,
      transaction,
    });
    const projectTablesIds = projectTables.map((table) => table.id);

    await columnService.cleanupAfterTablesRemove({
      tablesIds: projectTablesIds,
    });

    await Table.destroy({
      where: {
        userId: userId,
        projectId: projectId,
        id: {
          [Op.in]: projectTablesIds,
        },
      },
      transaction: transaction,
    });

    // step 2 remove project tables from "project data" database
    await sequelizeUserProjects.query(
      `
        ${projectTablesIds.map((id) => `DROP TABLE "${id}" CASCADE;`).join("\n")}
      `,
      {
        transaction: userProjectsDBTransaction,
      }
    );

    if (!externalTransaction) {
      await transaction.commit();
    }
    await userProjectsDBTransaction.commit();

    return { message: "Project tables removed successfuly!" };
  } catch (err) {
    console.error("table-services > removeProjectTables:: ", err);
    await userProjectsDBTransaction.rollback();
    if (externalTransaction) {
      throw new Error(err.toString());
    }
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

const checkTableBelongToUser = async ({
  userId,
  id,
  externalTransaction = undefined,
}) => {
  try {
    const table = await Table.findByPk(id, {
      transaction: externalTransaction,
    });
    return !!table;
  } catch (err) {
    if (externalTransaction) {
      throw new Error(err);
    }
    return false;
  }
};

module.exports = {
  create,
  get,
  getAll,
  update,
  remove,
  removeProjectTables,
  checkTableBelongToUser,
};
