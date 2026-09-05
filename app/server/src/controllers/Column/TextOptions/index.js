const textFieldOptionsService = require("../../../services/TextOptions");

const updateColumnTextOptions = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const { tableId, columnId, data } = req.body || {};
  if (!columnId || !tableId || !data) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const updateColumnTextOptionsResult = await textFieldOptionsService.update({
    tableId: tableId,
    columnId: columnId,
    data: data,
  });

  if (updateColumnTextOptionsResult?.error) {
    return res
      .status(updateColumnTextOptionsResult.errorCode)
      .json({ message: updateColumnTextOptionsResult.errorMessage });
  }

  return res.status(200).json(updateColumnTextOptionsResult);
};

const columnTextOptionsControllers = {
  updateColumnTextOptions,
};

module.exports = columnTextOptionsControllers;
