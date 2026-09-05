const Column = require("../../models/Column");
const tagService = require("../../services/Tag");
const { sequelizeUserProjects, sequelize } = require("../../config/database");
const constants = require("../../constants");
const { Op } = require("sequelize");
const formulaServices = require("../Formula");
const textFieldOptionsService = require("../TextOptions");
const relationColumnOptionsService = require("../RelationColumnOptions");
const numberOptionsService = require("../NumberOptions");

const create = async ({
  userId,
  tableId,
  column,
  externalTransaction = undefined,
  externalUserProjectsDBTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  const userProjectsDBTransaction =
    externalUserProjectsDBTransaction ||
    (await sequelizeUserProjects.transaction());
  try {
    if (!constants.dataTypes[column.type].isDadixOnlyType) {
      const query = `
            ALTER TABLE "${tableId}"
            ${(() => {
              let columnType = constants.dataTypes[column.type].mapToType;
              let isUnique = column.isUnique ? " UNIQUE" : "";
              let isPrimaryKey = column.isPrimaryKey ? " PRIMARY KEY" : "";
              let isNullable = column.isNullable ? "" : " NOT NULL";
              let defaultValue =
                column.isUnique ||
                column.isPrimaryKey ||
                column.type === constants.availableDataTypes["SERIAL"]
                  ? ""
                  : ` DEFAULT ${
                      column.defaultValue ||
                      constants.dataTypes[column.type].defaultValue
                    }`;

              return `ADD COLUMN "${column.name}" ${columnType} ${isUnique}${isPrimaryKey}${isNullable}${defaultValue};`;
            })()}
        `;
      await sequelizeUserProjects.query(query, {
        transaction: userProjectsDBTransaction,
      });
    }

    if (column.order < 0) {
      column.order = await Column.count({
        where: {
          tableId: tableId,
        },
        transaction: transaction,
      });
    }
    const createPayload = {
      userId: userId,
      tableId: tableId,
      name: column.name,
      type: column.type,
      size: column.size,
      order: column.order,
      isVisible: column.isVisible,
      contentAlign: column.contentAlign,
      action: column.action,
    };
    if (column.type === constants.availableDataTypes["CHOICE"]) {
      createPayload.choiceMode = column.choiceMode || "single";
    }
    let createdColumn = await Column.create(
      createPayload,
      { transaction: transaction }
    );

    if (
      column.type === constants.availableDataTypes["CHOICE"] &&
      column.options.length > 0
    ) {
      await tagService.createMany({
        userId: userId,
        tableId: tableId,
        columnId: createdColumn.id,
        tags: column.options,
        externalTransaction: transaction,
      });
    }

    if (column.type === constants.availableDataTypes["FORMULA"] || column.type === constants.availableDataTypes["CODE"]) {
      await formulaServices.create({
        tableId: tableId,
        columnId: createdColumn.id,
        value: "",
        externalTransaction: transaction,
      });
    }

    if (column.type === constants.availableDataTypes["TEXT"]) {
      const textFieldOptions = await textFieldOptionsService.create({
        tableId: tableId,
        columnId: createdColumn.id,
        externalTransaction: transaction,
      });
      if (textFieldOptions?.error)
        throw new Error(textFieldOptions.errorMessage);
      createdColumn = {
        ...(createdColumn?.dataValues || createdColumn),
        textOptions: { ...textFieldOptions },
      };
    }

    if (column.type === constants.availableDataTypes["RELATION"]) {
      const relationFieldOptions = await relationColumnOptionsService.create({
        columnId: createdColumn.id,
        externalTransaction: transaction,
      });
      if (relationFieldOptions?.error)
        throw new Error(relationFieldOptions.errorMessage);
      createdColumn = {
        ...(createdColumn?.dataValues || createdColumn),
        relationOptions: {
          ...relationFieldOptions,
        },
      };
    }

    if (column.type === constants.availableDataTypes["INTEGER"]) {
      const numberFieldOptions = await numberOptionsService.create({
        tableId: tableId,
        columnId: createdColumn.id,
        externalTransaction: transaction,
      });
      if (numberFieldOptions?.error)
        throw new Error(numberFieldOptions.errorMessage);
      createdColumn = {
        ...(createdColumn?.dataValues || createdColumn),
        numberOptions: numberFieldOptions,
      };
    }

    await userProjectsDBTransaction.commit();
    await transaction.commit();

    return createdColumn;
  } catch (err) {
    console.error(err);
    if (!externalUserProjectsDBTransaction) {
      await userProjectsDBTransaction.rollback();
    }
    if (!externalTransaction) {
      await transaction.rollback();
    }
    if (externalTransaction || externalUserProjectsDBTransaction) {
      throw new Error(err);
    }
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

const createMany = async ({
  userId,
  tableId,
  columns,
  isNewTable = false,
  externalTransaction = undefined,
  externalUserProjectsDBTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  const userProjectsDBTransaction =
    externalUserProjectsDBTransaction ||
    (await sequelizeUserProjects.transaction());
  try {
    const noneSpecialColumns = columns.filter(
      (column) => !constants.dataTypes[column.type].isDadixOnlyType
    );
    if (noneSpecialColumns.length > 0) {
      const columnsQuery = columns
        .filter((column) => !constants.dataTypes[column.type].isDadixOnlyType)
        .map((column) => {
          let columnType = constants.dataTypes[column.type].mapToType;
          let isUnique = column.isUnique ? " UNIQUE" : "";
          let isPrimaryKey = column.isPrimaryKey ? " PRIMARY KEY" : "";
          let isNullable = column.isNullable ? "" : " NOT NULL";
          let defaultValue =
            column.isUnique ||
            column.isPrimaryKey ||
            column.type === constants.availableDataTypes["SERIAL"]
              ? ""
              : ` DEFAULT ${
                  column.defaultValue ||
                  constants.dataTypes[column.type].defaultValue
                }`;

          return `"${column.name}" ${columnType} ${isUnique}${isPrimaryKey}${isNullable}${defaultValue}`;
        });
      const query = isNewTable
        ? `
        CREATE TABLE "${tableId}" (
        ${columnsQuery
          .map((columnQuery) => {
            return `${columnQuery}`;
          })
          .join(",\n")}
        );
      `
        : `
        ALTER TABLE "${tableId}"
        ${columnsQuery
          .map((columnQuery) => {
            return `ADD COLUMN ${columnQuery}`;
          })
          .join(",\n")};
      `;

      await sequelizeUserProjects.query(query, {
        transaction: userProjectsDBTransaction,
      });
    }

    let offset = await Column.count({
      where: {
        tableId: tableId,
      },
      transaction: transaction,
    });

    const createdColumns = await Column.bulkCreate(
      columns.map((column, index) => {
        const row = {
          userId: userId,
          tableId: tableId,
          name: column.name,
          type: column.type,
          size: 200,
          order: index + offset,
          isVisible: column.isVisible ?? true,
          contentAlign: column.contentAlign,
          action: column.action,
        };
        if (column.type === constants.availableDataTypes["CHOICE"]) {
          row.choiceMode = column.choiceMode || "single";
        }
        return row;
      }),
      { transaction: transaction }
    );

    const formulaColumns = createdColumns.filter(
      (column) =>
        column.type === constants.availableDataTypes["FORMULA"] ||
        column.type === constants.availableDataTypes["CODE"]
    );
    if (formulaColumns.length > 0) {
      await formulaServices.createMany({
        tableId: tableId,
        columnsIds: formulaColumns.map((column) => column.id),
        values: formulaColumns.map(() => ""),
        externalTransaction: transaction,
      });
    }

    const textColumns = createdColumns.filter(
      (column) => column.type === constants.availableDataTypes["TEXT"]
    );
    if (textColumns.length > 0) {
      const createManyTextFieldOptionsResult =
        await textFieldOptionsService.createMany({
          tableId: tableId,
          columnsIds: textColumns.map((column) => column.id),
          externalTransaction: transaction,
        });
      if (createManyTextFieldOptionsResult?.error)
        throw new Error(createManyTextFieldOptionsResult.errorMessage);
    }

    const relationColumns = createdColumns.filter(
      (column) => column.type === constants.availableDataTypes["RELATION"]
    );
    if (relationColumns.length > 0) {
      const createManyRelationFieldOptionsResult =
        await relationColumnOptionsService.create({
          columnsIds: relationColumns.map((column) => column.id),
          externalTransaction: transaction,
        });
      if (createManyRelationFieldOptionsResult?.error)
        throw new Error(createManyRelationFieldOptionsResult.errorMessage);
    }

    const integerColumns = createdColumns.filter(
      (column) => column.type === constants.availableDataTypes["INTEGER"]
    );
    if (integerColumns.length > 0) {
      const createManyNumberOptionsResult =
        await numberOptionsService.createMany({
          tableId: tableId,
          columnsIds: integerColumns.map((column) => column.id),
          externalTransaction: transaction,
        });
      if (createManyNumberOptionsResult?.error)
        throw new Error(createManyNumberOptionsResult.errorMessage);
    }

    if (!externalTransaction) {
      await transaction.commit();
    }
    if (!externalUserProjectsDBTransaction) {
      await userProjectsDBTransaction.commit();
    }

    return createdColumns;
  } catch (err) {
    console.error(err);
    if (!externalTransaction) {
      await transaction.rollback();
    }
    if (!externalUserProjectsDBTransaction) {
      await userProjectsDBTransaction.rollback();
    }
    if (externalUserProjectsDBTransaction || externalTransaction) {
      throw new Error(err);
    }
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

const getAll = async ({ userId, tableId, externalTransaction = undefined }) => {
  if (!tableId) {
    return [];
  }
  try {
    let columns = await Column.findAll({
      where: {
        tableId: tableId,
      },
      raw: true,
      transaction: externalTransaction,
    });

    const choiceColumns = [];
    const formulaColumns = [];
    const textColumns = [];
    const relationColumns = [];
    const integerColumns = [];
    for (let i = 0; i < columns.length; i++) {
      let column = columns[i];
      switch (column.type) {
        case constants.availableDataTypes["CHOICE"]:
          choiceColumns.push({ id: column.id, index: i });
          break;
        case constants.availableDataTypes["FORMULA"]:
        case constants.availableDataTypes["CODE"]:
          formulaColumns.push({ id: column.id, index: i });
          break;
        case constants.availableDataTypes["TEXT"]:
          textColumns.push({ id: column.id, index: i });
          break;
        case constants.availableDataTypes["RELATION"]:
          relationColumns.push({ id: column.id, index: i });
          break;
        case constants.availableDataTypes["INTEGER"]:
          integerColumns.push({ id: column.id, index: i });
          break;
      }
    }

    if (choiceColumns.length > 0) {
      const options = await tagService.getAll({
        userId: userId,
        tableId: tableId,
        columnId: choiceColumns.map((column) => column.id),
        attributes: ["id", "columnId", "value", "color", "order"],
        externalTransaction: externalTransaction,
      });
      choiceColumns.map((column) => {
        columns[column.index] = {
          ...columns[column.index],
          options: options
            .filter((option) => `${option.columnId}` === `${column.id}`)
            .sort((option1, option2) => option1.order - option2.order),
        };
        null;
      });
    }

    if (formulaColumns.length > 0) {
      const formulas = await formulaServices.getMany({
        tableId: tableId,
        columnsIds: formulaColumns.map((column) => column.id),
        externalTransaction: externalTransaction,
      });

      formulaColumns.map((column) => {
        columns[column.index] = {
          ...columns[column.index],
          formula:
            formulas.filter(
              (formula) => `${formula.columnId}` === `${column.id}`
            )[0]?.value || "",
        };
        null;
      });
    }

    if (textColumns.length > 0) {
      const textFieldsOptions = await textFieldOptionsService.getMany({
        tableId: tableId,
        columnsIds: textColumns.map((column) => column.id),
        externalTransaction: externalTransaction,
      });

      if (textFieldsOptions?.error)
        throw new Error(textFieldsOptions.errorMessage);

      textColumns.map((column) => {
        columns[column.index] = {
          ...columns[column.index],
          textOptions: textFieldsOptions.filter(
            (textFieldOptions) =>
              `${textFieldOptions.columnId}` === `${column.id}`
          )[0],
        };
        null;
      });
    }

    if (relationColumns.length > 0) {
      const relationFieldsOptions = await relationColumnOptionsService.getMany({
        columnsIds: relationColumns.map((column) => column.id),
        externalTransaction: externalTransaction,
      });

      if (relationFieldsOptions?.error)
        throw new Error(relationFieldsOptions.errorMessage);

      relationColumns.map((column) => {
        columns[column.index] = {
          ...columns[column.index],
          isVisible: false,
          relationOptions: relationFieldsOptions.filter(
            (relationFieldOptions) =>
              `${relationFieldOptions.columnId}` === `${column.id}`
          )[0],
        };
        null;
      });
    }

    if (integerColumns.length > 0) {
      const numberFieldsOptions = await numberOptionsService.getMany({
        tableId: tableId,
        columnsIds: integerColumns.map((column) => column.id),
        externalTransaction: externalTransaction,
      });

      if (numberFieldsOptions?.error)
        throw new Error(numberFieldsOptions.errorMessage);

      integerColumns.map((column) => {
        columns[column.index] = {
          ...columns[column.index],
          numberOptions: (numberFieldsOptions || []).filter(
            (opt) => `${opt.columnId}` === `${column.id}`
          )[0] || null,
        };
        null;
      });
    }

    return (columns || [])
      .sort((column1, column2) => column1.order - column2.order)
      .map((column, index) => ({ ...column, order: index }));
  } catch (err) {
    if (externalTransaction) {
      throw new Error(err);
    }
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

const update = async ({ userId, tableId, id, newData }) => {
  const transaction = await sequelize.transaction();
  const userProjectsDBTransaction = await sequelizeUserProjects.transaction();

  try {
    const allowedFieldsToUpdate = [
      "name",
      "icon",
      "order",
      "isVisible",
      "size",
      "contentAlign",
      "action",
      "choiceMode",
    ];
    const newDataFields = Object.keys(newData);
    if (
      newDataFields.filter((key) => allowedFieldsToUpdate.indexOf(key) < 0)
        .length > 0
    ) {
      await transaction.rollback();
      await userProjectsDBTransaction.rollback();
      return {
        error: true,
        errorCode: 401,
        errorMessage: "Unautorized",
      };
    }

    let column = null;

    const columnsToUpdateOrder = [];
    // if order of a column updated, it will affect other columns order
    if (newDataFields.indexOf("order") >= 0) {
      // get all columns (of same table)
      const allColumns = await getAll({ userId: userId, tableId: tableId });
      // add "epsilon" to the target column new order value, to avoid having 2 columns with same order value
      // and the sign of "epsilon" (- or +) will ditermin the exact new position of the column
      // here epsilon can be -0.1 or +0.1
      for (let i = 0; i < allColumns.length; i++) {
        if (`${allColumns[i].id}` !== `${id}`) {
          continue;
        }
        column = { ...allColumns[i] };
        const oldOrder = allColumns[i].order;
        const epsilon = oldOrder < newData.order ? 0.1 : -0.1;
        allColumns[i].order = newData.order + epsilon;
      }
      allColumns
        .sort((column1, column2) => column1.order - column2.order)
        .map((column, index) => {
          if (column.order !== index && `${column.id}` !== `${id}`) {
            const updatedColumn = {};
            newDataFields.map((field) => {
              updatedColumn[field] = column[field];
              return null;
            });
            columnsToUpdateOrder.push({
              ...updatedColumn,
              userId: userId,
              tableId: tableId,
              id: column.id,
              order: index,
            });
          }
          return null;
        });
    } else if (newDataFields.indexOf("name") >= 0) {
      column = await Column.findByPk(id, { transaction: transaction });
      if (!column || `${column.tableId}` !== `${tableId}`) {
        await transaction.rollback();
        await userProjectsDBTransaction.rollback();
        return {
          error: true,
          errorCode: 404,
          errorMessage: "Column not found",
        };
      }
    }

    // Column.bulkCreate will not create new column if exist but it will update fields you sprecify in "updateOnDuplicate"
    const updatedColumns = await Column.bulkCreate(
      [
        {
          userId: userId,
          tableId: tableId,
          id: id,
          ...newData,
        },
        ...columnsToUpdateOrder,
      ],
      {
        updateOnDuplicate: newDataFields,
        transaction: transaction,
        raw: true,
      }
    );

    if (column && !constants.dataTypes[column.type].isDadixOnlyType) {
      if (newDataFields.indexOf("name") >= 0) {
        await sequelizeUserProjects.query(
          `
        ALTER TABLE "${tableId}"
        RENAME COLUMN "${column.name}" TO "${newData.name}";
      `,
          { transaction: userProjectsDBTransaction }
        );
      }
    }

    await transaction.commit();
    await userProjectsDBTransaction.commit();

    return updatedColumns[0];
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

const remove = async ({ userId, tableId, id }) => {
  const transaction = await sequelize.transaction();
  const userProjectsDBTransaction = await sequelizeUserProjects.transaction();

  try {
    const columnToDelete = await Column.findByPk(id, {
      raw: true,
      transaction: transaction,
    });
    if (!columnToDelete || `${columnToDelete.tableId}` !== `${tableId}`) {
      throw new Error("Column not found");
    }

    if (columnToDelete.type === constants.availableDataTypes.RELATION) {
      await relationColumnOptionsService.remove({
        columnId: columnToDelete.id,
        externalTransaction: transaction,
      });
    }

    // update order of remaining columns
    const columnsToUpdateOrder = [];
    // get all columns (of same table)
    const allColumns = await getAll({ userId: userId, tableId: tableId });
    // get new order for remaining columns
    allColumns
      .filter((column) => `${column.id}` !== `${id}`)
      .sort((column1, column2) => column1.order - column2.order)
      .map((column, index) => {
        if (column.order !== index && `${column.id}` !== `${id}`) {
          columnsToUpdateOrder.push({
            id: column.id,
            order: index,
          });
        }
        return null;
      });
    if (columnsToUpdateOrder.length > 0) {
      // Column.bulkCreate will not create new column if exist but it will update fields you sprecify in "updateOnDuplicate"
      await Column.bulkCreate(columnsToUpdateOrder, {
        updateOnDuplicate: ["order"],
        transaction: transaction,
        raw: true,
      });
    }

    // drop column on dadix maping database
    await Column.destroy({
      where: {
        tableId: tableId,
        id: id,
      },
      transaction: transaction,
    });

    if (!constants.dataTypes[columnToDelete.type].isDadixOnlyType) {
      // drop column on user database
      await sequelizeUserProjects.query(
        `
      ALTER TABLE "${tableId}"
      DROP COLUMN "${columnToDelete.name}";
    `,
        { transaction: userProjectsDBTransaction }
      );
    }

    // commit changes to dadix maping database
    await transaction.commit();
    //commit changes to data database
    await userProjectsDBTransaction.commit();

    return { error: false };
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

const removeAllTableColumns = async ({
  userId,
  tableId,
  removeOnlyFromDatabaseMap = false,
  externalTransaction = undefined,
  externalUserProjectsDBTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  const userProjectsDBTransaction =
    externalUserProjectsDBTransaction ||
    (await sequelizeUserProjects.transaction());

  try {
    await Column.destroy({
      where: {
        tableId: tableId,
      },
      transaction: transaction,
    });

    if (!removeOnlyFromDatabaseMap) {
      await sequelizeUserProjects.query(`TRUNCATE TABLE "${tableId}";`, {
        transaction: userProjectsDBTransaction,
      });
    }

    if (!externalUserProjectsDBTransaction) {
      await userProjectsDBTransaction.commit();
    }

    if (!externalTransaction) {
      await transaction.commit();
    }

    return { message: "Table columns removed successfuly!" };
  } catch (err) {
    if (!externalUserProjectsDBTransaction) {
      await userProjectsDBTransaction.rollback();
    }
    if (!externalTransaction) {
      await transaction.rollback();
    }

    if (externalUserProjectsDBTransaction || externalTransaction) {
      throw new Error(err);
    }
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

const removeAllTablesColumns = async ({
  userId,
  tablesIds,
  removeOnlyFromDatabaseMap = false,
  externalTransaction = undefined,
  externalUserProjectsDBTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  const userProjectsDBTransaction =
    externalUserProjectsDBTransaction ||
    (await sequelizeUserProjects.transaction());

  try {
    await Column.destroy({
      where: {
        tableId: { [Op.in]: tablesIds },
      },
      transaction: transaction,
    });

    if (!removeOnlyFromDatabaseMap) {
      await sequelizeUserProjects.query(
        `
        ${tablesIds.map((tableId) => `TRUNCATE TABLE "${tableId}";`).join("\n")}
      `,
        { transaction: userProjectsDBTransaction }
      );
    }

    if (!externalUserProjectsDBTransaction) {
      await userProjectsDBTransaction.commit();
    }

    if (!externalTransaction) {
      await transaction.commit();
    }

    return { message: "Table columns removed successfuly!" };
  } catch (err) {
    if (!externalUserProjectsDBTransaction) {
      await userProjectsDBTransaction.rollback();
    }
    if (!externalTransaction) {
      await transaction.rollback();
    }

    if (externalUserProjectsDBTransaction || externalTransaction) {
      throw new Error(err);
    }
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

const cleanupAfterTablesRemove = async ({ tablesIds }) => {
  const typesNeedsCleanup = [constants.availableDataTypes.RELATION];
  const columns = await Column.findAll({
    where: {
      tableId: {
        [Op.in]: tablesIds,
      },
      type: {
        [Op.in]: typesNeedsCleanup,
      },
    },
    raw: true,
  });

  const relationColumns = columns.filter(
    (column) => column.type === constants.availableDataTypes.RELATION
  );

  if (relationColumns.length > 0) {
    await relationColumnOptionsService.removeMany({
      columnsIds: relationColumns.map((column) => column.id),
    });
  }
};

const columnService = {
  create,
  createMany,
  getAll,
  update,
  remove,
  removeAllTableColumns,
  removeAllTablesColumns,
  cleanupAfterTablesRemove,
};

module.exports = columnService;
