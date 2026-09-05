const { DataTypes } = require("sequelize");
const { sequelize } = require("../../../config/database");

const KanbanView = sequelize.define(
  "KanbanView",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    viewId: {
      type: DataTypes.INTEGER,
      references: {
        model: "Views",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    columnId: {
      type: DataTypes.INTEGER,
      references: {
        model: "Columns",
        key: "id",
      },
      onDelete: "CASCADE",
    },
  },
  {
    timestamps: false,
  }
);

module.exports = KanbanView;
