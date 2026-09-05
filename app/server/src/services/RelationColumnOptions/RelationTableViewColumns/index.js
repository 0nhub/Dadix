const { sequelize } = require("../../../config/database");
const { availableDataTypes } = require("../../../constants");
const Column = require("../../../models/Column");
const RelationTableViewColumns = require("../../../models/RelationTableViewColumns");

const getRelationTableViewColumns = async ({
  userId,
  tableId,
  relationId,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const { getAll: getAllTableColumns } = require("../../../services/Column");
    const tableColumns = await getAllTableColumns({
      userId,
      tableId,
      // externalTransaction,
    });

    const relationTableViewColumns = (
      (await RelationTableViewColumns.findAll({
        where: { relationId },
        transaction: transaction,
        raw: true,
      })) || []
    )
      .sort((column1, column2) => column1.order - column2.order)
      .map((column, index) => ({ ...column, order: index }));

    const relationTableViewColumnsIds = relationTableViewColumns.map(
      (relationTableViewColumn) => relationTableViewColumn.columnId
    );

    const mergeColumnsResult = tableColumns.map((tableColumn) => {
      // get tableColumn index in current relationTableViewColumns
      const tableColumnIndex = relationTableViewColumnsIds.indexOf(
        tableColumn.id
      );
      // check if tableColumn already exist in relationTableViewColumns
      // if column didn't get changed (doesn't exist in relationTableViewColumns),
      // return default column attributes values and make it hidden (id is negative to know that the column doesn't exist in relationTableViewColumns)
      if (tableColumnIndex < 0)
        return {
          ...tableColumn,
          id: -tableColumn.id,
          fieldId: tableColumn.id,
          fieldName: tableColumn.name,
          isVisible: false,
          fieldOrder: tableColumn.order,
        };
      const relationTableViewColumn =
        relationTableViewColumns[tableColumnIndex];
      return {
        ...tableColumn,
        id: relationTableViewColumn.id,
        fieldId: relationTableViewColumn.columnId,
        name: relationTableViewColumn.name || tableColumn.name,
        size: relationTableViewColumn.size ?? tableColumn.size,
        order: relationTableViewColumn.order ?? tableColumn.order,
        isVisible:
          tableColumn.type === availableDataTypes.RELATION
            ? false
            : relationTableViewColumn.isVisible,
        fieldName: tableColumn.name,
        fieldOrder: tableColumn.order,
      };
    });

    if (!externalTransaction) {
      await transaction.commit();
    }

    return { fields: mergeColumnsResult };
  } catch (err) {
    if (externalTransaction) {
      throw new Error(err);
    }
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

const updateRelationTableViewColumn = async ({
  tableId,
  relationId,
  tableColumnId,
  id,
  data,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const allowedFieldsToUpdate = ["name", "order", "isVisible", "size"];
    const newDataFields = Object.keys(data);
    if (
      newDataFields.filter((key) => allowedFieldsToUpdate.indexOf(key) < 0)
        .length > 0
    ) {
      return {
        error: true,
        errorCode: 401,
        errorMessage: "Unautorized",
      };
    }

    if (id < 0) {
      const createRelationTableViewColumnResult =
        await createRelationTableViewColumn({
          tableId,
          relationId,
          tableColumnId,
          data,
          externalTransaction: transaction,
        });
      if (!externalTransaction) {
        await transaction.commit();
      }
      return createRelationTableViewColumnResult;
    }

    const columnsToUpdateOrder = [];
    // if order of a column updated, it will affect other columns order
    if (newDataFields.indexOf("order") >= 0) {
      // get all columns (of same table)
      const allRelationTableViewColumns =
        await RelationTableViewColumns.findAll({
          where: { relationId },
          raw: true,
          transaction,
        });
      // add "epsilon" to the target column new order value, to avoid having 2 columns with same order value
      // and the sign of "epsilon" (- or +) will ditermin the exact new position of the column
      // here epsilon can be -0.1 or +0.1
      for (let i = 0; i < allRelationTableViewColumns.length; i++) {
        if (`${allRelationTableViewColumns[i].id}` !== `${id}`) {
          continue;
        }

        const oldOrder = allRelationTableViewColumns[i].order;
        const epsilon = oldOrder < data.order ? 0.1 : -0.1;
        allRelationTableViewColumns[i].order = data.order + epsilon;
      }
      allRelationTableViewColumns
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
              relationId,
              id: column.id,
              order: index,
            });
          }
          return null;
        });
    }

    // RelationTableViewColumns.bulkCreate will not create new column if exist but it will update fields you sprecify in "updateOnDuplicate"
    const updatedColumns = await RelationTableViewColumns.bulkCreate(
      [
        {
          relationId,
          id: id,
          ...data,
        },
        ...columnsToUpdateOrder,
      ],
      {
        updateOnDuplicate: newDataFields,
        transaction: transaction,
        raw: true,
      }
    );

    if (!externalTransaction) {
      await transaction.commit();
    }

    return updatedColumns[0];
  } catch (err) {
    console.error(err);
    if (externalTransaction) {
      throw new Error("Server error");
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

const createRelationTableViewColumn = async ({
  tableId,
  relationId,
  tableColumnId,
  data,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const order = await RelationTableViewColumns.count({
      where: {
        relationId,
      },
      transaction: externalTransaction,
    });

    const getTableColumnResult = await Column.findByPk(tableColumnId, {
      transaction: externalTransaction,
    });

    if (
      !getTableColumnResult ||
      `${getTableColumnResult.tableId}` !== `${tableId}`
    )
      return { error: true, errorCode: 404, errorMessage: "not found" };

    const columnData = {
      columnId: tableColumnId,
      relationId,
      // name: data.name || getTableColumnResult.name,
      size: data.size ?? getTableColumnResult.size,
      order: order,
      type: getTableColumnResult.type,
      isVisible:
        getTableColumnResult.type === availableDataTypes.RELATION
          ? false
          : data.isVisible,
    };
    const createdRelationTableViewColumn =
      await RelationTableViewColumns.create(
        { ...columnData },
        { returning: true, transaction: externalTransaction }
      );

    if (!externalTransaction) {
      await transaction.commit();
    }

    return createdRelationTableViewColumn;
  } catch (err) {
    console.error(err);
    if (externalTransaction) {
      throw new Error("Server error");
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

const initializeRelationTableViewColumns = async ({
  userId,
  relationId,
  tableId,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const getTableColumnsResult = await Column.findAll({
      where: { tableId: tableId },
      raw: true,
      transaction,
    });

    const newRelationTableViewColumnsData = getTableColumnsResult.map(
      (tableColumn) => {
        return {
          relationId,
          columnId: tableColumn.id,
          // name: tableColumn.name,
          size: tableColumn.size,
          order: tableColumn.order,
          isVisible:
            tableColumn.type === availableDataTypes.RELATION
              ? false
              : tableColumn.isVisible,
        };
      }
    );

    // create relationTableView columns
    await RelationTableViewColumns.bulkCreate(newRelationTableViewColumnsData, {
      transaction: transaction,
      returning: false,
    });

    if (!externalTransaction) {
      await transaction.commit();
    }
  } catch (err) {
    console.error(err);
    if (externalTransaction) {
      throw new Error("Server error");
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

const removeAll = async ({ relationId, externalTransaction = undefined }) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    await RelationTableViewColumns.destroy({
      where: {
        relationId,
      },
      transaction,
    });

    if (!externalTransaction) {
      await transaction.commit();
    }
  } catch (err) {
    console.error(err);
    if (externalTransaction) {
      throw new Error("Server error");
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

const relationTableViewColumnsService = {
  getRelationTableViewColumns,
  updateRelationTableViewColumn,
  createRelationTableViewColumn,
  initializeRelationTableViewColumns,
  removeAll,
};

module.exports = relationTableViewColumnsService;
