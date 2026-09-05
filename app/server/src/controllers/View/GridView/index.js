const gridViewService = require("../../../services/View/GridView");

const updateColumn = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const rawId = req.params?.id;
  const id = rawId != null ? parseInt(String(rawId), 10) : NaN;
  const { gridViewId, tableId, tableColumnId, data } = req.body || {};
  if (!gridViewId || !tableId || !tableColumnId || !data || (rawId !== "0" && !rawId)) {
    return res.status(400).json({ message: "Invalid request" });
  }
  if (Number.isNaN(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const updatedColumn = await gridViewService.updateGridViewColumn({
    userId: userId,
    tableId: tableId,
    gridViewId: Number(gridViewId),
    tableColumnId: Number(tableColumnId),
    id,
    data: data,
  });

  if (updatedColumn?.error) {
    return res
      .status(updatedColumn.errorCode)
      .json({ message: updatedColumn.errorMessage });
  }

  const isCreate = id < 0;
  return res.status(isCreate ? 201 : 200).json(updatedColumn);
};

const createButton = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const { viewId, tableId, label, order } = req.body || {};
  if (!viewId || !tableId) {
    return res.status(400).json({ message: "Invalid request" });
  }
  const result = await gridViewService.createViewButton({
    userId,
    viewId: Number(viewId),
    tableId,
    label: label || "Button",
    order: order != null ? Number(order) : undefined,
  });
  if (result?.error) {
    return res.status(result.errorCode || 500).json({ message: result.errorMessage });
  }
  return res.status(201).json(result);
};

const updateButton = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const buttonId = parseInt(String(req.params?.id), 10);
  const { tableId, label, order } = req.body || {};
  if (!buttonId || Number.isNaN(buttonId) || !tableId) {
    return res.status(400).json({ message: "Invalid request" });
  }
  const result = await gridViewService.updateViewButton({
    userId,
    buttonId,
    tableId,
    label,
    order: order != null ? Number(order) : undefined,
  });
  if (result?.error) {
    return res.status(result.errorCode || 500).json({ message: result.errorMessage });
  }
  return res.status(200).json(result);
};

const deleteButton = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const buttonId = parseInt(String(req.params?.id), 10);
  const { tableId } = req.query || {};
  if (!buttonId || Number.isNaN(buttonId) || !tableId) {
    return res.status(400).json({ message: "Invalid request" });
  }
  const result = await gridViewService.deleteViewButton({
    userId,
    buttonId,
    tableId,
  });
  if (result?.error) {
    return res.status(result.errorCode || 500).json({ message: result.errorMessage });
  }
  return res.status(200).json(result);
};

module.exports = {
  updateColumn,
  createButton,
  updateButton,
  deleteButton,
};
