const { sequelize } = require("../../../config/database");
const { availableDataTypes } = require("../../../constants");
const Column = require("../../../models/Column");
const GridView = require("../../../models/views/GridView");
const ViewButton = require("../../../models/views/ViewButton");
const columnsService = require("../../Column");

const getGridViewAttributes = async ({
  userId,
  tableId,
  id,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const getTableColumnsResult = await columnsService.getAll({
      userId: userId,
      tableId: tableId,
      externalTransaction: transaction,
    });

    const getGridViewColumns = (
      (await GridView.findAll({
        where: { viewId: id },
        transaction: transaction,
        raw: true,
      })) || []
    )
      .sort((column1, column2) => column1.order - column2.order)
      .map((column, index) => ({ ...column, order: index }));

    const changedTableColumnsIds = getGridViewColumns.map(
      (gridViewColumn) => gridViewColumn.columnId
    );

    const mergeColumnsResult = getTableColumnsResult.map((tableColumn) => {
      const changedTableColumnIndex = changedTableColumnsIds.indexOf(
        tableColumn.id
      );
      // if column didn't get changed, return default column attributes values and make it hidden (id is negative to know that the column didn't get changed)
      if (changedTableColumnIndex < 0)
        return {
          ...tableColumn,
          id: -tableColumn.id,
          fieldId: tableColumn.id,
          fieldName: tableColumn.name,
          isVisible: false,
          fieldOrder: tableColumn.order,
          contentAlign: tableColumn.contentAlign,
          /*
          name: tableColumn.name,
          size: tableColumn.size,
          order: tableColumn.order,
          options: tableColumn.options || undefined, // in case column type is CHOICE
          formula: tableColumn.formula || undefined, // in case column type is FORMULA
          textOptions: tableColumn.textOptions || undefined, // in case column type is TEXT
          type: tableColumn.type,*/
        };
      const gridViewColumn = getGridViewColumns[changedTableColumnIndex];
      return {
        ...tableColumn,
        id: gridViewColumn.id,
        fieldId: gridViewColumn.columnId,
        name: gridViewColumn.name || tableColumn.name,
        size: gridViewColumn.size ?? tableColumn.size,
        order: gridViewColumn.order ?? tableColumn.order,
        isVisible:
          tableColumn.type === availableDataTypes.RELATION
            ? false
            : gridViewColumn.isVisible,
        fieldName: tableColumn.name,
        fieldOrder: tableColumn.order,
        contentAlign: gridViewColumn.contentAlign ?? tableColumn.contentAlign,
        /*
        options: tableColumn.options || undefined, // in case column type is CHOICE
        formula: tableColumn.formula || undefined, // in case column type is FORMULA
        textOptions: tableColumn.textOptions || undefined, // in case column type is TEXT
        type: tableColumn.type,*/
      };
    });

    const viewButtons = (
      (await ViewButton.findAll({
        where: { viewId: id },
        order: [["order", "ASC"]],
        transaction: transaction,
        raw: true,
      })) || []
    ).map((b, idx) => ({ ...b, order: idx }));

    if (!externalTransaction) {
      await transaction.commit();
    }

    return { fields: mergeColumnsResult, buttons: viewButtons };
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

const updateGridViewColumn = async ({
  userId,
  tableId,
  gridViewId,
  tableColumnId,
  id,
  data,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const allowedFieldsToUpdate = [
      "name",
      "order",
      "isVisible",
      "size",
      "contentAlign",
    ];
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
      const createGridViewColumnResult = await createGridViewColumn({
        userId,
        tableId,
        gridViewId,
        tableColumnId,
        data,
        externalTransaction: transaction,
      });
      if (!externalTransaction) {
        await transaction.commit();
      }
      return createGridViewColumnResult;
    }

    const columnsToUpdateOrder = [];
    // if order of a column updated, it will affect other columns order
    if (newDataFields.indexOf("order") >= 0) {
      // get all columns (of same table)
      const allGridViewColumns = await GridView.findAll({
        where: { viewId: gridViewId },
        transaction,
      });
      // add "epsilon" to the target column new order value, to avoid having 2 columns with same order value
      // and the sign of "epsilon" (- or +) will ditermin the exact new position of the column
      // here epsilon can be -0.1 or +0.1
      for (let i = 0; i < allGridViewColumns.length; i++) {
        if (`${allGridViewColumns[i].id}` !== `${id}`) {
          continue;
        }

        const oldOrder = allGridViewColumns[i].order;
        const epsilon = oldOrder < data.order ? 0.1 : -0.1;
        allGridViewColumns[i].order = data.order + epsilon;
      }
      allGridViewColumns
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
              viewId: gridViewId,
              id: column.id,
              order: index,
            });
          }
          return null;
        });
    }

    // GridView.bulkCreate will not create new column if exist but it will update fields you sprecify in "updateOnDuplicate"
    const updatedColumns = await GridView.bulkCreate(
      [
        {
          viewId: gridViewId,
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

const createGridViewColumn = async ({
  userId,
  tableId,
  gridViewId,
  tableColumnId,
  data,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const order = await GridView.count({
      where: {
        viewId: gridViewId,
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
      viewId: gridViewId,
      name: data.name || null,
      size: data.size ?? getTableColumnResult.size,
      order: order,
      type: getTableColumnResult.type,
      isVisible:
        getTableColumnResult.type === availableDataTypes.RELATION
          ? false
          : data.isVisible,
    };
    const createdGridColumn = await GridView.create(
      { ...columnData },
      { returning: true, transaction: externalTransaction }
    );

    if (!externalTransaction) {
      await transaction.commit();
    }

    return createdGridColumn.get ? createdGridColumn.get({ plain: true }) : createdGridColumn;
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

const initializeGridView = async ({
  userId,
  viewId,
  tableId,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const getTableColumnsResult = await columnsService.getAll({
      userId: userId,
      tableId: tableId,
      externalTransaction: transaction,
    });

    const newGridViewColumnsData = getTableColumnsResult.map((tableColumn) => {
      return {
        viewId: viewId,
        columnId: tableColumn.id,
        size: tableColumn.size,
        order: tableColumn.order,
        isVisible:
          tableColumn.type === availableDataTypes.RELATION
            ? false
            : tableColumn.isVisible,
      };
    });

    // create gridView columns
    await GridView.bulkCreate(newGridViewColumnsData, {
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

const duplicateGridView = async ({
  viewToBeDuplicatedId,
  viewId,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const gridViewColumnsToBeDuplicatedDataResult = await GridView.findAll({
      where: {
        viewId: viewToBeDuplicatedId,
      },
      raw: true,
      transaction,
    });

    const newGridViewColumnsData = gridViewColumnsToBeDuplicatedDataResult.map(
      (tableColumn) => {
        return {
          viewId: viewId,
          columnId: tableColumn.columnId,
          name: tableColumn.name,
          size: tableColumn.size,
          order: tableColumn.order,
          isVisible: tableColumn.isVisible,
        };
      }
    );

    // create gridView columns
    await GridView.bulkCreate(newGridViewColumnsData, {
      transaction: transaction,
      returning: false,
    });

    const viewButtonsToCopy = await ViewButton.findAll({
      where: { viewId: viewToBeDuplicatedId },
      order: [["order", "ASC"]],
      raw: true,
      transaction,
    });
    if (viewButtonsToCopy.length) {
      const newButtons = viewButtonsToCopy.map((b, idx) => ({
        viewId: viewId,
        label: b.label,
        order: idx,
      }));
      await ViewButton.bulkCreate(newButtons, { transaction, returning: false });
    }

    if (!externalTransaction) {
      await transaction.commit();
    }
  } catch (err) {
    console.error("Error while duplicateGridView", err);
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

const createViewButton = async ({
  userId,
  viewId,
  tableId,
  label,
  order,
}) => {
  try {
    const View = require("../../../models/View");
    const view = await View.findOne({
      where: { id: viewId, tableId },
      raw: true,
    });
    if (!view) {
      return { error: true, errorCode: 404, errorMessage: "View not found" };
    }
    const count = await ViewButton.count({ where: { viewId } });
    const nextOrder = order != null ? order : count;
    const created = await ViewButton.create({
      viewId,
      label: label || "Button",
      order: nextOrder,
    });
    return created.get({ plain: true });
  } catch (err) {
    console.error(err);
    return {
      error: true,
      errorCode: 500,
      errorMessage: err?.message || "Server error",
    };
  }
};

const updateViewButton = async ({ userId, buttonId, tableId, label, order }) => {
  try {
    const button = await ViewButton.findByPk(buttonId, { raw: true });
    if (!button) {
      return { error: true, errorCode: 404, errorMessage: "Button not found" };
    }
    const View = require("../../../models/View");
    const view = await View.findOne({
      where: { id: button.viewId, tableId },
      raw: true,
    });
    if (!view) {
      return { error: true, errorCode: 404, errorMessage: "View not found" };
    }
    const updates = {};
    if (label !== undefined) updates.label = label;
    if (order !== undefined) updates.order = order;
    await ViewButton.update(updates, { where: { id: buttonId } });
    const updated = await ViewButton.findByPk(buttonId, { raw: true });
    return updated;
  } catch (err) {
    console.error(err);
    return {
      error: true,
      errorCode: 500,
      errorMessage: err?.message || "Server error",
    };
  }
};

const deleteViewButton = async ({ userId, buttonId, tableId }) => {
  try {
    const button = await ViewButton.findByPk(buttonId, { raw: true });
    if (!button) {
      return { error: true, errorCode: 404, errorMessage: "Button not found" };
    }
    const View = require("../../../models/View");
    const view = await View.findOne({
      where: { id: button.viewId, tableId },
      raw: true,
    });
    if (!view) {
      return { error: true, errorCode: 404, errorMessage: "View not found" };
    }
    await ViewButton.destroy({ where: { id: buttonId } });
    return { success: true };
  } catch (err) {
    console.error(err);
    return {
      error: true,
      errorCode: 500,
      errorMessage: err?.message || "Server error",
    };
  }
};

module.exports = {
  getGridViewAttributes,
  updateGridViewColumn,
  createGridViewColumn,
  initializeGridView,
  duplicateGridView,
  createViewButton,
  updateViewButton,
  deleteViewButton,
};
