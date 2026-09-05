const columnService = require("../../services/Column")
const constants = require("../../constants");

const createColumn = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { name, type, options, tableId } = req.body || {};
  if (!name || !tableId || !type) {
    return res.status(400).json({ message: "Invalid request" });
  }
  if (!constants.dataTypes[type]) {
    return res.status(400).json({ message: `Invalid column type: ${type}` });
  }

  const createColumnResult = await columnService.create({
    tableId: tableId,
    userId: userId,
    column: new constants.Column({
      name: name,
      type: type,
      options: options || [],
    }),
  });

  if (!createColumnResult) {
    return res.status(500).json({ message: "Server error" });
  }

  if (createColumnResult?.error) {
    return res
      .status(createColumnResult.errorCode)
      .json({ message: createColumnResult.errorMessage });
  }

  return res.status(201).json(createColumnResult);
};

const updateColumn = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const columnId = req.params?.id;
  const { tableId, data } = req.body || {};
  if (!tableId || !data) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const updatedColumn = await columnService.update({
    userId: userId,
    tableId: tableId,
    id: columnId,
    newData: data,
  });

  if (updatedColumn?.error) {
    return res
      .status(updatedColumn.errorCode)
      .json({ message: updatedColumn.errorMessage });
  }

  return res.status(200).json(updatedColumn);
};

const deleteColumn = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const columnId = req.params?.id;
  const { tableId } = req.query || {};
  if (!tableId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const deleteColumnResult = await columnService.remove({
    userId: userId,
    tableId: tableId,
    id: columnId,
  });

  if (deleteColumnResult?.error) {
    return res
      .status(deleteColumnResult.errorCode)
      .json({ message: deleteColumnResult.errorMessage });
  }

  return res.status(200).json({ message: "Column deleted successfully" });
};

module.exports = {
  createColumn,
  updateColumn,
  deleteColumn,
};
