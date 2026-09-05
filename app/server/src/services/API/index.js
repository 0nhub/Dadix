const APIKeys = require("../../models/APIKey");
const { sequelize, sequelizeUserProjects } = require("../../config/database");
const apiUtils = require("../../utils/api");
const APIKeyPermissionPerTable = require("../../models/APIKeyPermissionPerTable");
const Table = require("../../models/Table");

const findAPIKey = async ({ value }) => {
  try {
    if (!value) {
      return { error: true, errorCode: 400, errorMessage: "Bad Request" };
    }
    const apiKey = await APIKeys.findOne({
      where: { value: value },
      raw: true,
    });
    return apiKey;
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

const getProjectAPIKey = async ({ projectId }) => {
  try {
    if (!projectId) {
      return { error: true, errorCode: 400, errorMessage: "Bad Request" };
    }
    const apiKey = await APIKeys.findOne({
      where: { projectId: projectId },
      raw: true,
    });
    return apiKey;
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

const getOrCreateAPIKey = async ({
  projectId = undefined,
  value = undefined,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    if (!projectId && !value) {
      return { error: true, errorCode: 400, errorMessage: "Bad Request" };
    }
    const whereClose = {};
    if (projectId) {
      whereClose["projectId"] = projectId;
    }
    if (value) {
      whereClose["value"] = value;
    }
    let apiKey = await APIKeys.findOne({
      where: { ...whereClose },
    });
    if (!apiKey) {
      do {
        let encodedApiKey = apiUtils.generateEncodedAPIKey();

        let keyExist =
          APIKeys.count({
            where: { value: encodedApiKey },
            transaction: transaction,
          }) > 0;
        if (keyExist) continue;

        apiKey = await APIKeys.create(
          {
            projectId,
            value: encodedApiKey,
          },
          { raw: true, transaction: transaction }
        );
        const projectTables = await Table.findAll({
          where: { projectId: projectId },
          raw: true,
          transaction: transaction,
          attributes: ["id"],
        });
        if (projectTables.length > 0) {
          const createAPIKeyPermissuionsPerTableResult =
            await APIKeyPermissionPerTable.bulkCreate(
              projectTables.map((table) => ({
                tableId: table.id,
                APIKeyId: apiKey.id,
              })),
              {
                transaction: transaction,
              }
            );
        }
        if (!externalTransaction) {
          await transaction.commit();
        }
        break;
      } while (true);
    }
    return apiUtils.decodeAPIKey({ encodedApiKey: apiKey.value }) || "";
  } catch (err) {
    if (externalTransaction) {
      throw new Error(err.toString());
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

module.exports = {
  findAPIKey,
  getOrCreateAPIKey,
  getProjectAPIKey,
};
