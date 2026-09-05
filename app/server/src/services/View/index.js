const View = require("../../models/View");
const { sequelize } = require("../../config/database");
const { availableViews } = require("../../constants");
const {
  getGridViewAttributes,
  initializeGridView,
  duplicateGridView,
} = require("./GridView");

const create = async ({
  userId,
  tableId,
  viewData,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    if (!viewData.order || viewData.order < 0) {
      viewData.order = await View.count({
        where: {
          tableId: tableId,
        },
        transaction: transaction,
      });
    }
    const createdView = await View.create(
      {
        tableId: tableId,
        name: viewData.name,
        icon: viewData.icon,
        type: viewData.type,
        order: viewData.order,
      },
      { transaction: transaction, raw: true }
    );

    switch (viewData.type) {
      case availableViews.gridView:
        await initializeGridView({
          userId: userId,
          viewId: createdView.id,
          tableId: tableId,
          externalTransaction: transaction,
        });
        break;
    }

    if (!externalTransaction) {
      await transaction.commit();
    }

    return createdView.get({ plain: true });
  } catch (err) {
    console.error(err);
    if (!externalTransaction) {
      await transaction.rollback();
    }
    if (externalTransaction) {
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

const get = async ({ userId, tableId, id }) => {
  // const transaction = await sequelize.transaction();
  try {
    const getViewResult = await View.findByPk(id, {
      raw: true,
      // transaction: transaction,
    });

    if (!getViewResult || `${getViewResult.tableId}` !== `${tableId}`) {
      return {
        error: true,
        errorCode: 404,
        errorMessage: `View not found`,
      };
    }

    // get spicific view type attributes
    let viewSpecificAttributes = {};
    switch (getViewResult.type) {
      case availableViews.gridView:
        viewSpecificAttributes = await getGridViewAttributes({
          userId,
          tableId,
          id,
          // externalTransaction: transaction,
        });
        break;
    }

    // await transaction.commit();

    return {
      ...getViewResult,
      ...viewSpecificAttributes,
    };
  } catch (err) {
    console.error(err);
    // await transaction.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

const getAll = async ({ tableId, externalTransaction = undefined }) => {
  if (!tableId) {
    return [];
  }
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    let getTableViewsResult = await View.findAll({
      where: {
        tableId: tableId,
      },
      raw: true,
      transaction: transaction,
    });

    if (!externalTransaction) {
      await transaction.commit();
    }
    return (getTableViewsResult || [])
      .sort((view1, view2) => view1.order - view2.order)
      .map((view, index) => ({ ...view, order: index }));
  } catch (err) {
    if (externalTransaction) {
      throw new Error(err);
    }
    await transaction.rollback();
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

const update = async ({ tableId, id, newData }) => {
  const transaction = await sequelize.transaction();

  try {
    const allowedFieldsToUpdate = ["name", "icon", "order", "sort", "filter"];
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
    const viewsToUpdateOrder = [];
    // if order of a table updated, it will affect other tables order
    if (newDataFields.indexOf("order") >= 0) {
      // get all views (of same table)
      const allTableViews = await getAll({
        tableId,
        externalTransaction: transaction,
      });
      // add "epsilon" to the target viea new order value, to avoid having 2 views with same order value
      // and the sign of "epsilon" (- or +) will ditermin the exact new position of the view
      // here epsilon can be -0.1 or +0.1
      for (let i = 0; i < allTableViews.length; i++) {
        if (`${allTableViews[i].id}` !== `${id}`) {
          continue;
        }
        const oldOrder = allTableViews[i].order;
        const epsilon = oldOrder < newData.order ? 0.1 : -0.1;
        allTableViews[i].order = newData.order + epsilon;
      }
      allTableViews
        .sort((view1, view2) => view1.order - view2.order)
        .map((view, index) => {
          if (view.order !== index && `${view.id}` !== `${id}`) {
            const updatedView = {};
            newDataFields.map((field) => {
              updatedView[field] = view[field];
              return null;
            });
            viewsToUpdateOrder.push({
              ...updatedView,
              id: view.id,
              order: index,
            });
          }
          return null;
        })
        .filter((elm) => elm !== null);
    }

    // View.bulkCreate will not create new view if exist but it will update fields you sprecify in "updateOnDuplicate"
    const updatedViews = await View.bulkCreate(
      [
        {
          tableId: tableId,
          id: id,
          ...newData,
        },
        ...viewsToUpdateOrder,
      ],
      {
        updateOnDuplicate: newDataFields,
        transaction: transaction,
        raw: true,
      }
    );
    await transaction.commit();

    return updatedViews[0];
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

const remove = async ({ tableId, id }) => {
  const transaction = await sequelize.transaction();

  try {
    const viewToDelete = await View.findByPk(id, {
      raw: true,
      transaction: transaction,
    });
    if (`${viewToDelete.tableId}` !== `${tableId}`) {
      throw new Error("View not found");
    }

    // remove view
    await View.destroy({
      where: {
        tableId: tableId,
        id: id,
      },
      transaction: transaction,
    });

    // update order of remaining views
    const viewsToUpdateOrder = [];
    // get all views (of same table)
    const allTableViews = await getAll({
      tableId,
      externalTransaction: transaction,
    });
    // get new order for remaining views
    allTableViews
      .filter((view) => `${view.id}` !== `${id}`)
      .sort((view1, view2) => view1.order - view2.order)
      .map((view, index) => {
        if (view.order !== index) {
          viewsToUpdateOrder.push({
            id: view.id,
            order: index,
          });
        }
        return null;
      });

    if (viewsToUpdateOrder.length > 0) {
      // View.bulkCreate will not create new view if exist but it will update fields you sprecify in "updateOnDuplicate"
      await View.bulkCreate(viewsToUpdateOrder, {
        updateOnDuplicate: ["order"],
        transaction: transaction,
        raw: true,
      });
    }

    await transaction.commit();

    return { error: false };
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

const duplicate = async ({
  tableId,
  viewId,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const viewToBeDuplicated = await View.findOne({
      where: {
        tableId,
        id: viewId,
      },
      raw: true,
      transaction,
    });
    if (!viewToBeDuplicated) throw new Error("View not found");

    const viewData = {
      name: `${viewToBeDuplicated.name} Copy`,
      icon: viewToBeDuplicated.icon,
      type: viewToBeDuplicated.type,
      filter: viewToBeDuplicated.filter,
      sort: viewToBeDuplicated.sort,
    };

    viewData.order = await View.count({
      where: {
        tableId: tableId,
      },
      transaction: transaction,
    });

    const createdView = await View.create(
      {
        tableId: tableId,
        ...viewData,
      },
      { transaction: transaction, raw: true }
    );

    switch (viewData.type) {
      case availableViews.gridView:
        await duplicateGridView({
          viewToBeDuplicatedId: viewToBeDuplicated.id,
          viewId: createdView.id,
          externalTransaction: transaction,
        });
        break;
    }

    if (!externalTransaction) {
      await transaction.commit();
    }

    return createdView.get({ plain: true });
  } catch (err) {
    console.error(err);
    if (!externalTransaction) {
      await transaction.rollback();
    }
    if (externalTransaction) {
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

module.exports = {
  create,
  get,
  getAll,
  update,
  remove,
  duplicate,
};
