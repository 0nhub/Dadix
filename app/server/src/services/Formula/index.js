const { Op } = require("sequelize");
const { sequelize } = require("../../config/database");
const Formula = require("../../models/FormulaColumnOptions");

const create = async ({
  tableId,
  columnId,
  value,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const createdFormula = await Formula.create(
      {
        tableId: tableId,
        columnId: columnId,
        value: value,
      },
      { transaction: transaction, raw: true }
    );

    if (!externalTransaction) {
      await transaction.commit();
    }

    return createdFormula;
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

const createMany = async ({
  tableId,
  columnsIds,
  values,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const createdFormulas = await Formula.bulkCreate(
      columnsIds.map((columnId, index) => ({
        tableId: tableId,
        columnId: columnId,
        value: values[index],
      })),
      { transaction: transaction, raw: true }
    );

    if (!externalTransaction) {
      await transaction.commit();
    }

    return createdFormulas;
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

const getMany = async ({
  tableId,
  columnsIds,
  externalTransaction = undefined,
}) => {

  try {
    const getFormulasResult = await Formula.findAll({
      where: {
        tableId: tableId,
        columnId: {
          [Op.in]: columnsIds,
        },
      },
      transaction: externalTransaction,
      raw: true,
    });

    return getFormulasResult;
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

const remove = async ({
  tableId,
  columnId,
  id,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());

  try {
    await Formula.destroy({
      where: {
        tableId: tableId,
        columnId: columnId,
        id: id,
      },
      transaction: transaction,
    });

    if (!externalTransaction) {
      await transaction.commit();
    }

    return { message: "Formula removed successfuly!" };
  } catch (err) {
    console.error(err);
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

const update = async ({
  tableId,
  columnId,
  newValue,
  externalTransaction,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const updateFormulaResult = await Formula.update(
      { value: newValue },
      {
        where: {
          tableId: tableId,
          columnId: columnId,
        },
        transaction: transaction,
        raw: true,
        returning: true,
      }
    );
    let updated = updateFormulaResult && updateFormulaResult[1] && updateFormulaResult[1][0];
    // If no existing row, create one (upsert-like behavior)
    if (!updated) {
      updated = await Formula.create(
        { tableId: tableId, columnId: columnId, value: newValue },
        { transaction: transaction, raw: true, returning: true }
      );
      // some dialects return instance; normalize to plain
      updated = updated?.dataValues || updated;
    }

    if (!externalTransaction) {
      await transaction.commit();
    }

    return updated;
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

const formulaServices = {
  create,
  createMany,
  getMany,
  update,
};

module.exports = formulaServices;
