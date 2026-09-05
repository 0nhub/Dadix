const relationTableViewColumnsService = require("../../../../services/RelationColumnOptions/RelationTableViewColumns");

const getAllColumns = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const { id: relationId } = req.params || {};
  const { tableId } = req.query || {};
  if (!relationId || !tableId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const relationTableViewColumns =
    await relationTableViewColumnsService.getRelationTableViewColumns({
      userId,
      tableId,
      relationId,
    });

  if (relationTableViewColumns?.error) {
    return res
      .status(relationTableViewColumns.errorCode)
      .json({ message: relationTableViewColumns.errorMessage });
  }

  return res.status(200).json(relationTableViewColumns);
};

const updateColumn = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const { id } = req.params || {};
  const { relationId, tableId, tableColumnId, data } = req.body || {};
  if (!relationId || !tableId || !tableColumnId || !data || !id) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const updatedColumn =
    await relationTableViewColumnsService.updateRelationTableViewColumn({
      tableId,
      relationId,
      tableColumnId,
      id,
      data,
    });

  if (updatedColumn?.error) {
    return res
      .status(updatedColumn.errorCode)
      .json({ message: updatedColumn.errorMessage });
  }

  return res.status(200).json(updatedColumn);
};

const relationTableViewColumnsController = {
  getAllColumns,
  updateColumn,
};

module.exports = relationTableViewColumnsController;
