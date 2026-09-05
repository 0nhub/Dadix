const Cursor = require("pg-cursor");
const {
  sequelizeUserProjects,
  projectsDataDBPGPool,
} = require("../../config/database");
const { parseFilter } = require("../../utils/filterParser");

const create = async ({
  tableId,
  recordData,
  externalTransaction = undefined,
}) => {
  try {
    let fieldsToUpdate = Object.keys(recordData || {});

    // if recordData is empty, create a record with default values
    let query = `INSERT INTO "${tableId}" DEFAULT VALUES RETURNING *;`;

    if (fieldsToUpdate.length > 0) {
      query = `
        INSERT INTO "${tableId}" (${fieldsToUpdate
          .map((field) => `"${field}"`)
          .join(", ")})
        VALUES (${fieldsToUpdate
          .map((field) => {
            switch (typeof (recordData[field] ?? "")) {
              case "string":
                return `'${recordData[field].replaceAll("'", "''")}'`;
              default:
                return recordData[field];
            }
          })
          .join(", ")})
        RETURNING *;
    `;
    }
    const createdRecord = await sequelizeUserProjects.query(query, {
      raw: true,
      transaction: externalTransaction,
    });
    return createdRecord[0];
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

const createMany = async ({
  tableId,
  recordsData,
  externalTransaction = undefined,
}) => {
  const transaction =
    externalTransaction || (await sequelizeUserProjects.transaction());
  try {
    if (!recordsData || !recordsData.length > 0) {
      return {
        error: true,
        errorCode: 400,
        errorMessage: "Invalid request",
      };
    }
    let fieldsToUpdate = Object.keys(recordsData[0]);

    let recordsDataLength = recordsData.length;
    const recordsPerPage = 500;
    const recordsDataTotalPages =
      Math.floor(recordsDataLength / recordsPerPage) + 1;
    let createdRecords;
    for (let page = 0; page < recordsDataTotalPages; page++) {
      const currentRecordsPosition = page * recordsPerPage;
      const currentPageRecords = recordsData.slice(
        currentRecordsPosition,
        currentRecordsPosition + recordsPerPage
      );
      if (currentPageRecords.length === 0) {
        continue;
      }
      const query = `
        INSERT INTO "${tableId}" (${fieldsToUpdate
          .map((field) => `"${field}"`)
          .join(", ")})
        VALUES ${currentPageRecords
          .map((row) => {
            return `(${fieldsToUpdate
              .map((field) => {
                switch (typeof (row[field] ?? " ")) {
                  case "string":
                    return `'${row[field].replaceAll("'", "''")}'`;
                  default:
                    return row[field];
                }
              })
              .join(", ")})`;
          })
          .join(", ")}
        RETURNING *;
    `;

      createdRecords = await sequelizeUserProjects.query(query, {
        raw: true,
        transaction: transaction,
      });
    }

    if (!externalTransaction) {
      await transaction.commit();
    }
    return createdRecords[0];
  } catch (err) {
    console.error(err);
    if (externalTransaction) {
      throw new Error(err);
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

const createRelatedRecord = async ({
  recordId,
  relationId,
  relateToRecordWithId,
}) => {
  if (!relationId || !recordId || !relateToRecordWithId)
    return { error: true, errorCode: 400, errorMessage: "Bad Request" };
  try {
    const relationTableName = `relation_${relationId}`;
    const query = `
        INSERT INTO "${relationTableName}" (left_relation, right_relation)
        VALUES (${recordId}, ${relateToRecordWithId})
        RETURNING *;
      `;

    const createdRecordResult = await sequelizeUserProjects.query(query, {
      raw: true,
    });
    return createdRecordResult[0];
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

const get = async ({ tableId, id }) => {
  try {
    const query = `
        SELECT * FROM "${tableId}"
        WHERE "id"=${id};
    `;
    const record = await sequelizeUserProjects.query(query, { raw: true });
    return record[0];
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

const getManyByOffset = async ({
  tableId,
  filter = undefined,
  offset = 0,
  limit = 100,
  order = "ASC",
  orderBy = "id",
}) => {
  limit = Math.min(limit, 1000);
  order = order === "DESC" ? order : "ASC";
  orderBy = orderBy ?? "id";
  try {
    // console.log(filter);
    const whereClose = parseFilter(filter);
    const query = `
    SELECT COUNT(*) AS total
      FROM "${tableId}" ${whereClose ? `WHERE ${whereClose}` : ""};
    SELECT * FROM "${tableId}"
      ${whereClose ? `WHERE ${whereClose}` : ""}
      ORDER BY "${orderBy}" ${order}
      OFFSET ${offset} LIMIT ${limit};
    `;

    const records = await sequelizeUserProjects.query(query, { raw: true });
    return {
      total: parseInt(records[0][0].total),
      records: records[0].slice(1),
    };
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

const getMany = async ({ tableId, page = 0, limit = 5000 }) => {
  //limit = 200;
  try {
    const query = `
    SELECT COUNT(*) AS total
      FROM "${tableId}";
    SELECT * FROM "${tableId}"
      ORDER BY "id" ASC
      OFFSET ${limit * page} LIMIT ${limit};
    `;
    const records = await sequelizeUserProjects.query(query, { raw: true });
    return {
      total: parseInt(records[0][0].total),
      records: records[0].slice(1),
    };
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

const getManyRelatedByOffset = async ({
  relatedToTableWithId,
  relationId,
  recordId,
  offset = 0,
  limit = 100,
  order = "ASC",
}) => {
  if (!relatedToTableWithId || !relationId || !recordId)
    return { error: true, errorCode: 400, errorMessage: "Bad Request" };
  limit = Math.min(limit, 1000);
  order = order === "DESC" ? order : "ASC";
  try {
    const relationTableName = `relation_${relationId}`;
    const queryFrom = `FROM "${relatedToTableWithId}" "relatedTable"`;
    const queryJoin = `JOIN "${relationTableName}" "relationsTable" ON  "relationsTable".left_relation = ${recordId} AND "relatedTable".id = "relationsTable".right_relation`;
    const query = `
    SELECT COUNT("relatedTable".*) AS total
      ${queryFrom}
      ${queryJoin};
    SELECT "relationsTable"."id" as "_relation_record_id", "relatedTable".*
      ${queryFrom}
      ${queryJoin}
      ORDER BY "id" ${order}
      OFFSET ${offset} LIMIT ${limit};
    `;

    const records = await sequelizeUserProjects.query(query, { raw: true });
    return {
      total: parseInt(records[0][0].total),
      records: records[0].slice(1),
    };
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

const getAll = async ({
  tableId,
  onDataReadCallback,
  onDoneCallback,
  onErrorCallback,
}) => {
  const recordsPerRead = 1000;
  let client;
  try {
    const query = ({ offset = 0, lastId = -1 }) => `
      SELECT * FROM "${tableId}"
      WHERE "id" > ${lastId}
      ORDER BY "id" ASC
      --OFFSET ${offset};
    `;

    //let timeStamp = new Date().getTime();
    client = await getNewClient();
    /*console.log(
      `connecting to database took: ${
        (new Date().getTime() - timeStamp) / 1000
      } s`
    );*/

    let fetchRowsTimeStamp = new Date().getTime();
    let resendingReadRequest = false;
    let cursor = client.query(new Cursor(query({ offset: 0, lastId: -1 })));

    let lastId = -1;
    let rowsLength = 0;
    //timeStamp = new Date().getTime();
    // Fetch data in batches
    const fetchChunkOfData = () =>
      new Promise((resolve) => {
        cursor.read(recordsPerRead, (err, rows) => {
          if (err) {
            console.error(err);
            if (client) {
              client.release();
              client = null;
            }
            onErrorCallback();
            resolve({ isDone: true });
          }

          if (rows && rows.length > 0) {
            resendingReadRequest = false;
            rowsLength += rows.length;
            lastId = rows[rows.length - 1].id;
            // Return the fetched rows
            onDataReadCallback(rows);
            resolve({ isDone: false });
            return;
          }

          // Close the cursor
          cursor.close();
          if (client) {
            client.release();
            client = null;
          }
          resolve({ isDone: true });
        });
      });

    while (true) {
      let result = await fetchChunkOfData();
      if (result.isDone) {
        if (resendingReadRequest) {
          continue;
        }
        onDoneCallback();
        break;
      }
      if (new Date().getTime() - fetchRowsTimeStamp > 60000) {
        resendingReadRequest = true;
        await cursor.close();
        if (client) {
          client.release();
          client = null;
        }
        client = await getNewClient();
        fetchRowsTimeStamp = new Date().getTime();
        cursor = client.query(
          new Cursor(query({ offset: rowsLength, lastId: lastId }))
        );
      }
    }

    async function getNewClient() {
      let failsCounter = 20;
      return new Promise((resolve, reject) => {
        async function tryToGetClient() {
          const client = await projectsDataDBPGPool.connect();
          if (client) {
            resolve(client);
            return;
          }
          failsCounter--;
          if (failsCounter <= 0) {
            reject(null);
            return;
          }
          setTimeout(tryToGetClient, 100);
        }
        tryToGetClient();
      });
    }
    /*console.log(
      `reading ${
        rowsLength > 1000 ? `${rowsLength / 1000}k` : rowsLength
      } took: ${(new Date().getTime() - timeStamp) / 1000} s`
    );*/

    if (client) {
      client.release();
      client = null;
    }

    return {};
  } catch (err) {
    console.error(err);
    if (client) {
      client.release();
      client = null;
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

const update = async ({ tableId, id, recordData }) => {
  try {
    let fieldsToUpdate = Object.keys(recordData || {});

    const query = `
        UPDATE "${tableId}"
        SET ${fieldsToUpdate
          .map(
            (field) =>
              `"${field}" = ${
                ["number", "bigint", "boolean"].indexOf(
                  typeof recordData[field]
                ) < 0
                  ? `'${("" + recordData[field]).replace("'", "''")}'`
                  : recordData[field]
              }`
          )
          .join(", ")}
        WHERE "id" = ${id}
        RETURNING *;
    `;

    const updatedRecord = await sequelizeUserProjects.query(query, {
      raw: true,
      type: sequelizeUserProjects.QueryTypes.UPDATE,
    });
    return updatedRecord[0];
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

const remove = async ({ tableId, id }) => {
  try {
    const query = `
        DELETE FROM "${tableId}"
        WHERE "id" = ${id};
    `;
    // delete record by id
    await sequelizeUserProjects.query(query, {
      raw: true,
    });

    return true;
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

const removeMany = async ({
  tableId,
  ids,
  externalTransaction = undefined,
}) => {
  const transaction =
    externalTransaction || (await sequelizeUserProjects.transaction());
  try {
    let maxRecordsToDelete = 500;
    for (let i = 0; i < ids.length; i += maxRecordsToDelete) {
      const query = `
          DELETE FROM "${tableId}"
          WHERE "id" IN (${ids.slice(i, i + maxRecordsToDelete).join(",")});
      `;

      // delete many records by id
      await sequelizeUserProjects.query(query, {
        raw: true,
        transaction: transaction,
      });
    }

    if (!externalTransaction) {
      await transaction.commit();
    }

    return true;
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

const removeRelatedRecord = async ({
  relationId,
  relatedToRecordWithId,
  relationRecordId,
  recordId,
}) => {
  if (!relationId || !recordId || !relatedToRecordWithId)
    return { error: true, errorCode: 400, errorMessage: "Bad Request" };
  try {
    const relationTableName = `relation_${relationId}`;
    const query = `
        DELETE FROM "${relationTableName}"
        WHERE
            "id" = ${relationRecordId}
            AND "left_relation" = ${recordId}
            AND "right_relation" = ${relatedToRecordWithId};
      `;
    const removeRecordResult = await sequelizeUserProjects.query(query);
    return removeRecordResult;
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

const customGetManyByOffset = async ({
  tableId,
  offset = 0,
  limit = 50,
  filterKey = undefined,
  filterValue = undefined,
  fields = "*",
  sortBy = "id",
  sortOrder = "ASC",
}) => {
  try {
    fields = fields
      .split(",")
      .map((field) => (field !== "*" ? `"${field}"` : field))
      .join(",");

    const whereClose = generateWhereClose({
      filterKey: filterKey,
      filterValue: filterValue,
    });
    if (whereClose?.error) {
      return whereClose;
    }
    const query = `
    SELECT COUNT(*) AS total
      FROM "${tableId}"${whereClose};
    SELECT ${fields} FROM "${tableId}"
      ${whereClose}
      ORDER BY "${sortBy}" ${sortOrder}
      OFFSET ${offset} LIMIT ${limit};
    `;
    const records = await sequelizeUserProjects.query(query, { raw: true });
    return {
      total: parseInt(records[0][0].total),
      records: records[0].slice(1),
    };
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

const customUpdateMany = async ({
  tableId,
  filterKey = undefined,
  filterValue = undefined,
  limit = undefined,
  data = undefined,
}) => {
  try {
    if (!data || !filterKey || !filterValue) {
      return;
    }
    const fieldsToUpdate = Object.keys(data);
    const whereClose = generateWhereClose({
      filterKey: filterKey,
      filterValue: filterValue,
    });
    if (whereClose?.error) {
      return whereClose;
    }
    const query = `
      Update "${tableId}"
      SET ${fieldsToUpdate
        .map((field) => {
          const fieldValue =
            typeof data[field] === "string"
              ? `'${data[field].replaceAll("'", "''")}'`
              : `${data[field]}`;
          return `"${field}" = ${fieldValue}`;
        })
        .join(",")}
      ${whereClose}
      ${limit ? `LIMIT ${limit}` : ""};
    `;

    await sequelizeUserProjects.query(query, {
      raw: true,
    });
    return true;
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

const generateWhereClose = ({ filterKey, filterValue }) => {
  let where = undefined;
  if (filterKey && filterValue) {
    const operator = filterValue.substring(0, filterValue.indexOf("("));
    let relation = null;
    switch (operator) {
      case "like":
        relation = "LIKE";
        break;
      case "nlike":
        relation = "NOT LIKE";
        break;
      case "notnull":
        relation = "IS NOT NULL";
        break;
      case "null":
        relation = "IS NULL";
        break;
      case "eq":
        relation = "=";
        break;
      case "neq":
        relation = "!=";
        break;
      case "lt":
        relation = "<";
        break;
      case "lte":
        relation = "<=";
        break;
      case "gt":
        relation = ">";
        break;
      case "gte":
        relation = ">=";
        break;
      default:
        relation = null;
    }
    if (!relation) {
      return {
        error: true,
        errorCode: 400,
        errorMessage: `Unexpected operation ${operator}`,
      };
    }
    let value = filterValue.substring(
      filterValue.indexOf("(") + 1,
      filterValue.lastIndexOf(")")
    );
    if (
      value.substring(0, 1) === '"' &&
      value.substring(value.length - 1) === '"'
    ) {
      value = value.substring(1, value.length - 1);
      value = `'${["like", "nlike"].indexOf(operator) >= 0 ? "%" : ""}${value.replaceAll("'", "''")}${["like", "nlike"].indexOf(operator) >= 0 ? "%" : ""}'`;
    }
    where = `"${filterKey}" ${relation} ${value}`;
  }
  return `${where ? `WHERE ${where}` : ""}`;
};

module.exports = {
  create,
  createMany,
  createRelatedRecord,

  get,
  getAll,
  getMany,
  getManyByOffset,
  getManyRelatedByOffset,

  update,
  remove,
  removeMany,
  removeRelatedRecord,

  customGetManyByOffset,
  customUpdateMany,
};
