const { DataTypes } = require("sequelize");
const { sequelize } = require("../../config/database");

const ViewButton = sequelize.define(
  "ViewButton",
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
    label: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    timestamps: false,
    tableName: "ViewButtons",
  }
);

module.exports = ViewButton;
