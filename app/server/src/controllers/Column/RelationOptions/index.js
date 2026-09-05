const relationColumnOptionsService = require("../../../services/RelationColumnOptions");

const updateColumnRelationOptions = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const { tableId, columnId, data } = req.body || {};
  if (!columnId || !tableId || !data) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const updateColumnRelationOptionsResult =
    await relationColumnOptionsService.update({
      tableId: tableId,
      columnId: columnId,
      data: data,
    });

  if (updateColumnRelationOptionsResult?.error) {
    return res
      .status(updateColumnRelationOptionsResult.errorCode)
      .json({ message: updateColumnRelationOptionsResult.errorMessage });
  }

  return res.status(200).json(updateColumnRelationOptionsResult);
};

const columnRelationOptionsController = {
  updateColumnRelationOptions,
};

module.exports = columnRelationOptionsController;
