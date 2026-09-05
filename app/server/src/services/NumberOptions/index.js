const { sequelize } = require("../../config/database");
const { Op } = require("sequelize");
const NumberOptions = require("../../models/NumberColumnOptions");

const create = async ({
  tableId,
  columnId,
  externalTransaction = undefined,
}) => {
  let transaction = null;
  try {
    if (!tableId || !columnId) throw new Error();
    transaction = externalTransaction || (await sequelize.transaction());

    const result = await NumberOptions.create(
      { tableId, columnId },
      { transaction, raw: true, returning: true }
    );

    if (!externalTransaction) await transaction.commit();
    return result?.dataValues || result;
  } catch (err) {
    if (externalTransaction) throw err;
    console.error("numberOptionsService.create", err);
    await transaction?.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error creating NumberOptions",
    };
  }
};

const createMany = async ({
  tableId,
  columnsIds,
  externalTransaction = undefined,
}) => {
  let transaction = null;
  try {
    if (!tableId || !columnsIds || columnsIds.length === 0) throw new Error();
    transaction = externalTransaction || (await sequelize.transaction());

    await NumberOptions.bulkCreate(
      columnsIds.map((columnId) => ({ tableId, columnId })),
      { transaction, raw: true, returning: true }
    );

    if (!externalTransaction) await transaction.commit();
    return [];
  } catch (err) {
    if (externalTransaction) throw err;
    console.error("numberOptionsService.createMany", err);
    if (transaction) await transaction.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error creating many NumberOptions",
    };
  }
};

const getMany = async ({
  tableId,
  columnsIds,
  externalTransaction = undefined,
}) => {
  try {
    if (!tableId || !columnsIds || columnsIds.length === 0) return [];

    const rows = await NumberOptions.findAll({
      where: {
        tableId,
        columnId: { [Op.in]: columnsIds },
      },
      raw: true,
      transaction: externalTransaction,
    });
    return rows;
  } catch (err) {
    if (externalTransaction) throw err;
    console.error("numberOptionsService.getMany", err);
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error getting NumberOptions",
    };
  }
};

const allowedFields = [
  "thousandsSeparator",
  "decimalPlaces",
  "decimalSeparator",
  "prefix",
  "suffix",
];

const update = async ({
  tableId,
  columnId,
  data,
  externalTransaction = undefined,
}) => {
  let transaction = null;
  try {
    if (!tableId || !columnId || !data) throw new Error();
    const toUpdate = {};
    Object.keys(data).forEach((key) => {
      if (allowedFields.indexOf(key) >= 0) toUpdate[key] = data[key];
    });
    if (Object.keys(toUpdate).length === 0)
      return { error: true, errorCode: 400, errorMessage: "No allowed fields" };

    transaction = externalTransaction || (await sequelize.transaction());

    let row = await NumberOptions.findOne({
      where: { tableId, columnId },
      raw: true,
      transaction,
    });
    if (!row) {
      await NumberOptions.create(
        { tableId, columnId },
        { transaction, raw: true }
      );
    }

    await NumberOptions.update(toUpdate, {
      where: { tableId, columnId },
      transaction,
    });

    const updated = await NumberOptions.findOne({
      where: { tableId, columnId },
      raw: true,
      transaction,
    });

    if (!externalTransaction) await transaction.commit();
    return updated;
  } catch (err) {
    if (externalTransaction) throw err;
    console.error("numberOptionsService.update", err);
    if (transaction) await transaction.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error updating NumberOptions",
    };
  }
};

module.exports = { create, createMany, getMany, update };
