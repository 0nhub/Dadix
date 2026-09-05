const recordService = require("../../services/Record");
const fs = require("fs");

const getTableRecords = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { tableId, filter, limit, offset, order, orderBy } = req.query || {};
  if (!tableId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  // check if table belong to user
  // const isTableBelongToUser = await tableService.checkTableBelongToUser({
  //   id: tableId,
  //   userId: userId,
  // });
  // if (!isTableBelongToUser) {
  //   return res.status(401).json({ message: "Unauthorized" });
  // }

  const tableRecords = await recordService.getManyByOffset({
    tableId,
    filter: filter || undefined,
    offset: offset ?? 0,
    limit: limit || undefined,
    order,
    orderBy,
  });

  if (!tableRecords) {
    return res.status(404).json({ message: "Not found" });
  }

  if (tableRecords?.error) {
    return res
      .status(tableRecords.errorCode)
      .json({ message: tableRecords.errorMessage });
  }

  return res.status(200).json(tableRecords);
};

const getAllTableRecords = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { tableId } = req.query || {};
  if (!tableId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  // check if table belong to user
  // const isTableBelongToUser = await tableService.checkTableBelongToUser({
  //   id: tableId,
  //   userId: userId,
  // });
  // if (!isTableBelongToUser) {
  //   return res.status(401).json({ message: "Unauthorized" });
  // }

  // res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Transfer-Encoding", "chunked");
  // res.setHeader("Connection", "keep-alive");

  const result = await recordService.getAll({
    tableId: tableId,
    onDataReadCallback: (data) => {
      try {
        const fileName = `/tmp/zdadix${new Date().getTime()}.json`;
        fs.writeFileSync(fileName, JSON.stringify(data));
        res.write(fs.readFileSync(fileName) + "--end-data-chunk--");
        fs.unlink(fileName, (err) => {});
      } catch (err) {
        console.error(err);
        res.end();
      }
    },
    onDoneCallback: () => {
      res.end();
    },
    onErrorCallback: () => {
      res.status(500).end();
    },
  });

  if (result?.error) {
    return res.status(result.errorCode).end();
  }

  return res.status(500).end();
};

const getRecord = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const recordId = req.params?.id;
  const { tableId } = req.body || {};
  if (!tableId || !recordId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  // check if table belong to user
  // const isTableBelongToUser = await tableService.checkTableBelongToUser({
  //   id: tableId,
  //   userId: userId,
  // });
  // if (!isTableBelongToUser) {
  //   return res.status(401).json({ message: "Unauthorized" });
  // }

  const record = await recordService.get({
    tableId: tableId,
    id: recordId,
  });

  if (!record) {
    return res.status(404).json({ message: "Not found" });
  }

  if (record?.error) {
    return res.status(record.errorCode).json({ message: record.errorMessage });
  }

  return res.status(200).json(record);
};

const createRecord = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  let { data, tableId } = req.body || {};
  if (!data || !tableId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  // check if table belong to user
  // const isTableBelongToUser = await tableService.checkTableBelongToUser({
  //   id: tableId,
  //   userId: userId,
  // });

  // if (!isTableBelongToUser) {
  //   return res.status(401).json({ message: "Unauthorized" });
  // }

  const createdRecord = await recordService.create({
    tableId: tableId,
    recordData: data,
  });

  if (createdRecord?.error) {
    return res
      .status(createdRecord.errorCode)
      .json({ message: createdRecord.errorMessage });
  }

  return res.status(201).json(createdRecord);
};

const updateRecord = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const recordId = req.params?.id;
  const { tableId, data } = req.body || {};
  if (!tableId || !recordId || !data) {
    return res.status(400).json({ message: "Invalid request" });
  }

  // check if table belong to user
  // const isTableBelongToUser = await tableService.checkTableBelongToUser({
  //   id: tableId,
  //   userId: userId,
  // });
  // if (!isTableBelongToUser) {
  //   return res.status(401).json({ message: "Unauthorized" });
  // }

  const record = await recordService.update({
    tableId: tableId,
    id: recordId,
    recordData: data,
  });

  if (!record) {
    return res.status(404).json({ message: "Not found" });
  }

  if (record?.error) {
    return res.status(record.errorCode).json({ message: record.errorMessage });
  }

  return res.status(200).json(record);
};

const deleteRecord = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const recordId = req.params?.id;
  const { tableId } = req.query || {};
  if (!tableId || !recordId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  // check if table belong to user
  // const isTableBelongToUser = await tableService.checkTableBelongToUser({
  //   id: tableId,
  //   userId: userId,
  // });
  // if (!isTableBelongToUser) {
  //   return res.status(401).json({ message: "Unauthorized" });
  // }

  const record = await recordService.remove({
    tableId: tableId,
    id: recordId,
  });

  if (!record) {
    return res.status(404).json({ message: "Not found" });
  }

  if (record?.error) {
    return res.status(record.errorCode).json({ message: record.errorMessage });
  }

  return res.status(200).json({ message: "record deleted successfuly!" });
};

const deleteRecords = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { tableId, ids } = req.query || {};
  if (!tableId || !ids) {
    return res.status(400).json({ message: "Invalid request" });
  }

  // check if table belong to user
  // const isTableBelongToUser = await tableService.checkTableBelongToUser({
  //   id: tableId,
  //   userId: userId,
  // });
  // if (!isTableBelongToUser) {
  //   return res.status(401).json({ message: "Unauthorized" });
  // }

  const deleteRecordsResult = await recordService.removeMany({
    tableId: tableId,
    ids: ids.split(","),
  });

  if (!deleteRecordsResult) {
    return res.status(404).json({ message: "Not found" });
  }

  if (deleteRecordsResult?.error) {
    return res
      .status(deleteRecordsResult.errorCode)
      .json({ message: deleteRecordsResult.errorMessage });
  }

  return res.status(200).json({ message: "record deleted successfuly!" });
};

const getRelatedRecords = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const recordId = req.params?.id;
  const { tableId, relatedToTableWithId, relationId, limit, offset, order } =
    req.query || {};
  if (!tableId || !recordId || !relatedToTableWithId || !relationId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const tableRecords = await recordService.getManyRelatedByOffset({
    relatedToTableWithId: relatedToTableWithId,
    relationId: relationId,
    recordId: recordId,
    offset: offset ?? 0,
    limit: limit || undefined,
    order: order,
  });

  if (!tableRecords) {
    return res.status(404).json({ message: "Not found" });
  }

  if (tableRecords?.error) {
    return res
      .status(tableRecords.errorCode)
      .json({ message: tableRecords.errorMessage });
  }

  return res.status(200).json(tableRecords);
};

const createRelatedRecord = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const recordId = req.params?.id;
  const { tableId, relatedToTableWithId, relateToRecordWithId, relationId } =
    req.body || {};
  if (
    !tableId ||
    !recordId ||
    !relatedToTableWithId ||
    !relateToRecordWithId ||
    !relationId
  ) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const recordToBeRelatedTo = await recordService.get({
    id: relateToRecordWithId,
    tableId: relatedToTableWithId,
  });

  if (!recordToBeRelatedTo) {
    return res.status(404).json({ message: "Error record doesn't exist" });
  }

  const createRelationResult = await recordService.createRelatedRecord({
    relationId: relationId,
    recordId: recordId,
    relateToRecordWithId: relateToRecordWithId,
  });

  if (!createRelationResult) {
    return res.status(500).json({ message: "Error creating relation" });
  }

  if (createRelationResult?.error) {
    return res
      .status(createRelationResult.errorCode)
      .json({ message: createRelationResult.errorMessage });
  }

  return res.status(201).json({
    ...recordToBeRelatedTo[0],
    _relation_record_id: createRelationResult[0]?.id,
  });
};

const deleteRelatedRecord = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const recordId = req.params?.id;
  const { tableId, relatedToRecordWithId, relationId, relationRecordId } =
    req.query || {};
  if (
    !tableId ||
    !recordId ||
    !relatedToRecordWithId ||
    !relationId ||
    !relationRecordId
  ) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const deleteRecordResult = await recordService.removeRelatedRecord({
    tableId,
    relationId,
    relatedToRecordWithId,
    relationRecordId,
    recordId,
  });

  if (deleteRecordResult?.error) {
    return res
      .status(deleteRecordResult.errorCode)
      .json({ message: deleteRecordResult.errorMessage });
  }

  return res.status(200).json({ message: "record deleted" });
};

module.exports = {
  createRecord,
  createRelatedRecord,

  getRecord,
  getTableRecords,
  getAllTableRecords,
  getRelatedRecords,

  updateRecord,

  deleteRecord,
  deleteRecords,
  deleteRelatedRecord,
};
