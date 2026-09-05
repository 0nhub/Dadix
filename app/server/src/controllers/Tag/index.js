const tagService = require("../../services/Tag");

const createTag = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { value, color, tableId, columnId } = req.body || {};
  if (!value || !tableId || !columnId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const createdTag = await tagService.create({
    userId: userId,
    tableId: tableId,
    columnId: columnId,
    value: value,
    color: color,
  });

  if (createdTag?.error) {
    return res
      .status(createdTag.errorCode)
      .json({ message: createdTag.errorMessage || "server error" });
  }

  return res
    .status(201)
    .json({
      id: createdTag.id,
      value: createdTag.value,
      color: createdTag.color,
      order: createdTag.order,
    });
};

const updateTag = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const tagId = req.params?.id;
  const { tableId, columnId, data } = req.body || {};
  if (!tableId || !columnId || !data) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const updatedTag = await tagService.update({
    userId: userId,
    tableId: tableId,
    columnId: columnId,
    id: tagId,
    tagData: data,
  });

  if (updatedTag?.error) {
    return res
      .status(updatedTag.errorCode)
      .json({ message: updatedTag.errorMessage });
  }

  return res.status(200).json(updatedTag);
};

const deleteTag = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const tagId = req.params?.id;
  const { tableId, columnId } = req.query || {};
  if (!tagId || !tableId || !columnId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const deleteTagResult = await tagService.remove({
    userId: userId,
    tableId: tableId,
    columnId: columnId,
    id: tagId,
  });

  if (deleteTagResult?.error) {
    return res
      .status(deleteTagResult.errorCode)
      .json({ message: deleteTagResult.errorMessage });
  }

  return res.status(200).json({ message: "Tag deleted successfuly!" });
};

module.exports = {
  createTag,
  updateTag,
  deleteTag,
};
