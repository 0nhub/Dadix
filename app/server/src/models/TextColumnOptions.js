const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const TextOptions = sequelize.define(
  "TextOptions",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    tableId: {
      type: DataTypes.UUID,
      references: {
        model: "Tables",
        key: "id",
      },
      onDelete: "SET NULL",
    },
    columnId: {
      type: DataTypes.INTEGER,
      references: {
        model: "Columns",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    multiLines: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    minLines: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    maxLines: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
  },
  {
    timestamps: false,
  }
);

module.exports = TextOptions;
