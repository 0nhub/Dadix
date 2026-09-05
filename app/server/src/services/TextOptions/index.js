const { sequelize } = require("../../config/database");
const { Op } = require("sequelize");
const TextOptions = require("../../models/TextColumnOptions");

const create = async ({
  tableId,
  columnId,
  externalTransaction = undefined,
}) => {
  let transaction = null;
  try {
    if (!tableId || !columnId) throw new Error();
    transaction = externalTransaction || (await sequelize.transaction());

    const createTextOptionsResult = await TextOptions.create(
      { tableId, columnId },
      { transaction, raw: true, returning: true }
    );

    if (!externalTransaction) {
      await transaction.commit();
    }

    return createTextOptionsResult?.dataValues || createTextOptionsResult;
  } catch (err) {
    if (externalTransaction) {
      throw err;
    }

    console.error("textFieldOptionsService.create", err);
    await transaction?.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error creating TextFieldOptions",
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

    const createManyTextOptionsResult = await TextOptions.bulkCreate(
      columnsIds.map((columnId) => ({ tableId, columnId })),
      { transaction, raw: true, returning: true }
    );

    if (!externalTransaction) {
      await transaction.commit();
    }

    return createManyTextOptionsResult;
  } catch (err) {
    if (externalTransaction) {
      throw err;
    }

    console.error("textFieldOptionsService.createMany", err);
    await transaction?.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error creating many TextFieldOptions",
    };
  }
};

const update = async ({
  tableId,
  columnId,
  data,
  externalTransaction = undefined,
}) => {
  let transaction = null;
  try {
    if (!tableId || !columnId || !data) throw new Error();
    // check if updates are allowed
    const allowedFieldsToUpdates = ["multiLines", "minLines", "maxLines"];
    const fieldsToBeUpdated = Object.keys(data);
    if (
      fieldsToBeUpdated.filter(
        (field) => allowedFieldsToUpdates.indexOf(field) < 0
      ).length > 0
    ) {
      throw new Error("unauthorized");
    }

    transaction = externalTransaction || (await sequelize.transaction());

    // update text field options
    const updateTextOptionsResult = await TextOptions.update(
      { ...data },
      { where: { tableId, columnId }, raw: true, transaction }
    );

    if (!externalTransaction) {
      await transaction.commit();
    }

    return updateTextOptionsResult;
  } catch (err) {
    if (externalTransaction) {
      throw err;
    }

    console.error("textFieldOptionsService.update", err);
    await transaction?.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error updating TextFieldOptions",
    };
  }
};

const get = async ({ tableId, columnId, externalTransaction = undefined }) => {
  let transaction = null;
  try {
    if (!tableId || !columnId) throw new Error();

    transaction = externalTransaction || (await sequelize.transaction());

    // get text field options
    const getTextOptionsResult = await TextOptions.findOne({
      where: { tableId, columnId },
      raw: true,
      transaction,
    });

    if (!externalTransaction) {
      await transaction.commit();
    }

    return getTextOptionsResult[0];
  } catch (err) {
    if (externalTransaction) {
      throw err;
    }

    console.error("textFieldOptionsService.get", err);
    await transaction?.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error getting TextFieldOptions",
    };
  }
};

const getMany = async ({
  tableId,
  columnsIds,
  externalTransaction = undefined,
}) => {
  try {
    if (!tableId || !columnsIds || columnsIds.length === 0) throw new Error();

    // get many text fields options
    const getManyTextOptionsResult = await TextOptions.findAll({
      where: {
        tableId,
        columnId: {
          [Op.in]: columnsIds,
        },
      },
      raw: true,
      transaction: externalTransaction,
    });

    return getManyTextOptionsResult;
  } catch (err) {
    if (externalTransaction) {
      throw err;
    }

    console.error("textFieldOptionsService.get", err);
    return {
      error: true,
      errorCode: 500,
      errorMessage: "Error getting TextFieldOptions",
    };
  }
};

const textFieldOptionsService = { create, createMany, update, get, getMany };
module.exports = textFieldOptionsService;
