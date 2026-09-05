const numberOptionsService = require("../../../services/NumberOptions");

const updateColumnNumberOptions = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { tableId, columnId, data } = req.body || {};
  if (!columnId || !tableId || !data) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const result = await numberOptionsService.update({
    tableId,
    columnId,
    data,
  });

  if (result?.error) {
    return res
      .status(result.errorCode || 500)
      .json({ message: result.errorMessage });
  }

  return res.status(200).json(result);
};

module.exports = { updateColumnNumberOptions };
