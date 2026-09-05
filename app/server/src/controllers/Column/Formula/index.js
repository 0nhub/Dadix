const formulaServices = require("../../../services/Formula");

const updateColumnFormula = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const { tableId, columnId, value } = req.body || {};
  if (!columnId || !tableId || value === undefined || value === null) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const updateColumnFormulaResult = await formulaServices.update({
    tableId: tableId,
    columnId: columnId,
    newValue: value,
  });

  if (updateColumnFormulaResult?.error) {
    return res
      .status(updateColumnFormulaResult.errorCode)
      .json({ message: updateColumnFormulaResult.errorMessage });
  }

  return res.status(200).json(updateColumnFormulaResult);
};

const columnFormulaControllers = {
  updateColumnFormula,
};

module.exports = columnFormulaControllers;
