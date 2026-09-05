const recordServices = require("../../../services/Record");
const tableServices = require("../../../services/Table");

const getTableRecords = async (req, res) => {
  try {
    const { tableId } = req.params || {};
    const { projectId } = req.apiKey || {};
    const { fields, filterKey, filterValue, limit, offset, sortBy, sortOrder } =
      req.query || {};

    if (!tableId || !projectId) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const table = await tableServices.get({
      id: tableId,
      projectId: projectId,
    });
    if (!table) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const getTableRecordsResult = await recordServices.customGetManyByOffset({
      projectId: projectId,
      tableId: tableId,
      fields: fields,
      filterKey: filterKey,
      filterValue: filterValue,
      offset: offset ?? 0,
      limit: limit ?? 50,
      sortBy: sortBy,
      sortOrder: sortOrder,
    });
    if (!getTableRecordsResult) {
      return res.status(404).json({ message: "not found" });
    }

    return res.status(200).json(getTableRecordsResult);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

const updateTableRecords = async (req, res) => {
  try {
    const { tableId } = req.params || {};
    const { projectId } = req.apiKey || {};
    const { filterKey, filterValue, limit } = req.query || {};
    const { data } = req.body || {};

    if (!tableId || !projectId || !data) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const table = await tableServices.get({
      id: tableId,
      projectId: projectId,
    });
    if (!table) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const updateTableRecordsResult = await recordServices.customUpdateMany({
      projectId: projectId,
      tableId: tableId,
      filterKey: filterKey,
      filterValue: filterValue,
      limit: limit,
      data: data,
    });
    if (!updateTableRecordsResult) {
      return res.status(404).json({ message: "not found" });
    }

    return res.status(200).json({ message: "Updated successfuly" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

const createManyTableRecods = async (req, res) => {
  try {
    const { tableId } = req.params || {};
    const { projectId } = req.apiKey || {};
    const { recordsData } = req.body || {};

    if (!tableId || !projectId || !recordsData) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const table = await tableServices.get({
      id: tableId,
      projectId: projectId,
    });
    if (!table) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const createRecordsResult = await recordServices.createMany({
      tableId: tableId,
      recordsData: recordsData,
    });

    if (createRecordsResult?.error) {
      return res
        .status(createRecordsResult.errorCode)
        .json({ message: createRecordsResult.errorMessage });
    }

    return res.status(201).json({ createdRecords: createRecordsResult });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

const deleteTableRecords = async (req, res) => {
  try {
    const { tableId } = req.params || {};
    const { projectId } = req.apiKey || {};
    const { ids } = req.query || {};

    if (!tableId || !projectId || !ids) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const table = await tableServices.get({
      id: tableId,
      projectId: projectId,
    });
    if (!table) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const deleteRecordsResult = await recordServices.removeMany({
      tableId: tableId,
      ids: ids.split(","),
    });

    if (deleteRecordsResult?.error) {
      return res
        .status(deleteRecordsResult.errorCode)
        .json({ message: deleteRecordsResult.errorMessage });
    }

    return res.status(201).json({ message: "Records deleted successfuly" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getTableRecords,
  updateTableRecords,
  createManyTableRecods,
  deleteTableRecords,
};
