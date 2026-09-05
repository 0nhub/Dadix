const viewService = require("../../services/View");

const getAllTableViews = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const { tableId } = req.query || {};
  if (!tableId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const getAllTableViewsResult = await viewService.getAll({
    tableId: tableId,
  });

  if (getAllTableViewsResult?.error) {
    return res
      .status(getAllTableViewsResult.errorCode)
      .json({ message: getAllTableViewsResult.errorMessage });
  }

  return res.status(200).json({
    views: getAllTableViewsResult || [],
  });
};

const getView = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { id } = req.params || {};
  let { tableId } = req.query || {};
  if (!tableId || !id) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const getViewResult = await viewService.get({
    userId: userId,
    tableId: tableId,
    id: id,
  });

  if (!getViewResult) {
    return res.status(404).json({ message: "View not found" });
  }

  if (getViewResult?.error) {
    return res
      .status(getViewResult.errorCode || 500)
      .json({ message: getViewResult.errorMessage || "Server error" });
  }

  return res.status(200).json(getViewResult);
};

const createView = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const { tableId, name, icon, type } = req.body || {};
  if (!tableId || !name || !icon || !type) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const createViewResult = await viewService.create({
    userId: userId,
    tableId: tableId,
    viewData: {
      name: name,
      icon: icon,
      type: type,
      order: -1,
    },
  });

  if (createViewResult?.error) {
    return res
      .status(createViewResult.errorCode || 500)
      .json({ message: createViewResult.errorMessage || "Server error" });
  }

  return res.status(201).json({
    view: createViewResult,
  });
};

const updateView = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const { id } = req.params || {};
  const { tableId } = req.query || {};
  const { data } = req.body || {};
  if (!tableId || !data) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const updateViewResult = await viewService.update({
    tableId: tableId,
    id: id,
    newData: data,
  });

  if (!updateViewResult) {
    return res.status(500).json({ message: "Error creating view" });
  }

  if (updateViewResult?.error) {
    return res
      .status(updateViewResult.errorCode)
      .json({ message: updateViewResult.errorMessage });
  }

  return res.status(200).json({
    view: updateViewResult,
  });
};

const deleteView = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const { id } = req.params || {};
  const { tableId } = req.query || {};
  if (!tableId || !id) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const deleteViewResult = await viewService.remove({
    tableId: tableId,
    id: id,
  });

  if (!deleteViewResult) {
    return res.status(500).json({ message: "Error deleting view" });
  }
  if (deleteViewResult?.error) {
    return res
      .status(deleteViewResult.errorCode || 500)
      .json({ message: deleteViewResult.errorMessage || "Server error" });
  }

  return res.status(200).json({ message: "View deleted successfully" });
};

const duplicateView = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const { id } = req.params || {};
  const { tableId } = req.body || {};
  if (!id || !tableId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const duplicateViewResult = await viewService.duplicate({
    tableId,
    viewId: id,
  });

  if (!duplicateView) res.status(500).json({ message: "Server error" });

  if (duplicateViewResult?.error) {
    return res
      .status(duplicateViewResult.errorCode)
      .json({ message: duplicateViewResult.errorMessage });
  }

  return res.status(201).json({ view: duplicateViewResult });
};

module.exports = {
  getView,
  getAllTableViews,
  createView,
  updateView,
  deleteView,
  duplicateView,
};
