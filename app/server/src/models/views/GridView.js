const { DataTypes } = require("sequelize");
const { sequelize } = require("../../config/database");

const GridView = sequelize.define(
  "GridView",
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
    name: {
      type: DataTypes.STRING,
    },
    size: {
      type: DataTypes.INTEGER,
    },
    order: {
      type: DataTypes.INTEGER,
    },
    contentAlign: {
      type: DataTypes.STRING,
    },
    isVisible: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    timestamps: false,
    indexes: [],
  }
);

module.exports = GridView;
