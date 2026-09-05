const { sequelize, sequelizeUserProjects } = require("../../config/database");
const { Op } = require("sequelize");
const RelationColumnOptions = require("../../models/RelationColumnOptions");
const relationTableViewColumnsService = require("./RelationTableViewColumns");

const create = async ({ columnId, externalTransaction = undefined }) => {
  let transaction = null;
  try {
    if (!columnId) throw new Error();
    transaction = externalTransaction || (await sequelize.transaction());

    const createRelationColumnOptionsResult =
      await RelationColumnOptions.create(
        { columnId },
        { transaction, raw: true, returning: true }
      );

    if (!externalTransaction) {
      await transaction.commit();
    }

    return (
      createRelationColumnOptionsResult?.dataValues ||
      createRelationColumnOptionsResult
    );
  } catch (err) {
    if (externalTransaction) {
      throw err;
    }

    console.error("relationColumnOptionsService.create", err);
    await transaction?.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error creating relationColumn Options",
    };
  }
};

const createMany = async ({ columnsIds, externalTransaction = undefined }) => {
  let transaction = null;
  try {
    if (!columnsIds || columnsIds.length === 0) throw new Error();
    transaction = externalTransaction || (await sequelize.transaction());

    const createManyRelationColumnOptionsResult =
      await RelationColumnOptions.bulkCreate(
        columnsIds.map((columnId) => ({ columnId })),
        { transaction, raw: true, returning: true }
      );

    if (!externalTransaction) {
      await transaction.commit();
    }

    return createManyRelationColumnOptionsResult || [];
  } catch (err) {
    if (externalTransaction) {
      throw err;
    }

    console.error("relationColumnOptionsService.createMany", err);
    await transaction?.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error creating many relation column options",
    };
  }
};

const update = async ({
  userId,
  tableId,
  columnId,
  data,
  externalTransaction = undefined,
}) => {
  let transaction = null;
  let userProjectsTransaction = null;

  try {
    if (!columnId || !data) throw new Error();
    // check if updates are allowed
    const allowedFieldsToUpdates = [
      "allowMultipleRelations",
      "showAddNewButton",
      "relatedToTableWithId",
    ];
    const fieldsToBeUpdated = Object.keys(data);
    if (
      fieldsToBeUpdated.filter(
        (field) => allowedFieldsToUpdates.indexOf(field) < 0
      ).length > 0
    ) {
      throw new Error("unauthorized");
    }

    transaction = externalTransaction || (await sequelize.transaction());
    const currentRelationColumnOptions = await RelationColumnOptions.findOne({
      where: {
        columnId: columnId,
      },
      raw: true,
      transaction: transaction,
    });
    if (!currentRelationColumnOptions)
      throw new Error("Relation doesn't exist");

    const relationTableName = `relation_${currentRelationColumnOptions.id}`;

    if (fieldsToBeUpdated.indexOf("relatedToTableWithId") >= 0) {
      // check if a table is already related
      if (
        !currentRelationColumnOptions ||
        currentRelationColumnOptions.relatedToTableWithId
      )
        throw new Error("You can't change related table");

      // remove existing relation tableView columns
      await relationTableViewColumnsService.removeAll({
        relationId: currentRelationColumnOptions.id,
        externalTransaction: transaction,
      });
      // initialize relation tableView columns
      await relationTableViewColumnsService.initializeRelationTableViewColumns({
        userId,
        tableId: data.relatedToTableWithId,
        relationId: currentRelationColumnOptions.id,
        externalTransaction: transaction,
      });
      // create a new table to make the relation (N:N or 1:N) between the 2 tables
      userProjectsTransaction = await sequelizeUserProjects.transaction();
      const allowMultipleRelations =
        data.allowMultipleRelations ??
        currentRelationColumnOptions.allowMultipleRelations;
      const query = `
        DROP TABLE IF EXISTS "${relationTableName}";
        CREATE TABLE "${relationTableName}" (
          id SERIAL PRIMARY KEY,
          left_relation INTEGER NOT NULL,
          right_relation INTEGER NOT NULL,
        ${
          !allowMultipleRelations
            ? `
          CONSTRAINT ${relationTableName}_left_relation_unique UNIQUE (left_relation),
          `
            : ""
        }
          CONSTRAINT fk_left_relation
              FOREIGN KEY (left_relation)
              REFERENCES "${tableId}"(id)
              ON DELETE CASCADE,
          CONSTRAINT fk_right_relation
              FOREIGN KEY (right_relation)
              REFERENCES "${data.relatedToTableWithId}"(id)
              ON DELETE CASCADE
        );
      `;
      await sequelizeUserProjects.query(query, {
        transaction: userProjectsTransaction,
      });
    } else if (
      fieldsToBeUpdated.indexOf("allowMultipleRelations") >= 0 &&
      currentRelationColumnOptions.relatedToTableWithId
    ) {
      const allowMultipleRelations = data.allowMultipleRelations;

      const removeMultipleRelationsQuery = `
        DELETE FROM "${relationTableName}"
        WHERE "left_relation" IN (
            SELECT "left_relation"
            FROM "${relationTableName}"
            GROUP BY "left_relation"
            HAVING count(*) > 1
        );
        ALTER TABLE "${relationTableName}"
        ADD CONSTRAINT ${relationTableName}_left_relation_unique UNIQUE (left_relation);
        `;

      const addMultipleRelationsQuery = `
        ALTER TABLE "${relationTableName}"
        DROP CONSTRAINT ${relationTableName}_left_relation_unique;
        `;

      const query = allowMultipleRelations
        ? addMultipleRelationsQuery
        : removeMultipleRelationsQuery;

      await sequelizeUserProjects.query(query, {
        transaction: userProjectsTransaction,
      });
    }

    // update relation column options
    const updateRelationColumnOptionsResult =
      await RelationColumnOptions.update(
        { ...data },
        { where: { columnId }, raw: true, transaction }
      );

    if (!externalTransaction) {
      await transaction.commit();
    }
    await userProjectsTransaction?.commit();

    return updateRelationColumnOptionsResult;
  } catch (err) {
    await userProjectsTransaction?.rollback();
    if (externalTransaction) {
      throw err;
    }

    console.error("relationColumnOptionsService.update", err);
    await transaction?.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error updating relation column options",
    };
  }
};

const get = async ({ columnId, externalTransaction = undefined }) => {
  let transaction = null;
  try {
    if (!columnId) throw new Error();

    transaction = externalTransaction || (await sequelize.transaction());

    // get relation field options
    const getRelationColumnOptions = await RelationColumnOptions.findOne({
      where: { columnId },
      raw: true,
      transaction,
    });

    if (!externalTransaction) {
      await transaction.commit();
    }

    return getRelationColumnOptions?.[0];
  } catch (err) {
    if (externalTransaction) {
      throw err;
    }

    console.error("relationColumnOptionsService.get", err);
    await transaction?.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error getting relation column oprions",
    };
  }
};

const getMany = async ({ columnsIds, externalTransaction = undefined }) => {
  try {
    if (!columnsIds || columnsIds.length === 0) throw new Error();

    // get many relation columns options
    const getManyRelationColumnsOptionsResult =
      await RelationColumnOptions.findAll({
        where: {
          columnId: {
            [Op.in]: columnsIds,
          },
        },
        raw: true,
        transaction: externalTransaction,
      });

    return getManyRelationColumnsOptionsResult || [];
  } catch (err) {
    if (externalTransaction) {
      throw err;
    }

    console.error("relationColumnOptionsService.get", err);
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error getting relation columns options",
    };
  }
};

const remove = async ({ columnId, externalTransaction = undefined }) => {
  let transaction = null;
  try {
    if (!columnId) throw new Error();

    transaction = externalTransaction || (await sequelize.transaction());

    // get relation field options
    const getRelationColumnOptions = await RelationColumnOptions.findOne({
      where: { columnId },
      raw: true,
      transaction,
    });

    if (!getRelationColumnOptions) return;

    const relationTableName = `relation_${getRelationColumnOptions.id}`;
    const query = `
      DROP TABLE IF EXISTS "${relationTableName}";
      `;
    await sequelizeUserProjects.query(query);

    if (!externalTransaction) {
      await transaction.commit();
    }

    return;
  } catch (err) {
    if (externalTransaction) {
      throw err;
    }

    console.error("relationColumnOptionsService.get", err);
    await transaction?.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error getting relation column oprions",
    };
  }
};

const removeMany = async ({ columnsIds, externalTransaction = undefined }) => {
  let transaction = null;
  try {
    if (!columnsIds) throw new Error();

    transaction = externalTransaction || (await sequelize.transaction());

    // get relation fields options
    const getRelationColumnsOptions = await RelationColumnOptions.findAll({
      where: {
        columnId: {
          [Op.in]: columnsIds,
        },
      },
      raw: true,
      transaction,
    });

    if (!getRelationColumnsOptions) return;
    const deleteRelationsTablesQuery = getRelationColumnsOptions
      .map((getRelationColumnOptions) => {
        const relationTableName = `relation_${getRelationColumnOptions.id}`;
        return `
      DROP TABLE IF EXISTS "${relationTableName}";
      `;
      })
      .join("\n");
    await sequelizeUserProjects.query(deleteRelationsTablesQuery);

    if (!externalTransaction) {
      await transaction.commit();
    }

    return;
  } catch (err) {
    if (externalTransaction) {
      throw err;
    }

    console.error("relationColumnOptionsService.get", err);
    await transaction?.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error getting relation column oprions",
    };
  }
};

const relationColumnOptionsService = {
  create,
  createMany,
  update,
  get,
  getMany,
  remove,
  removeMany,
};

module.exports = relationColumnOptionsService;
