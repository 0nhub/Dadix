const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Formula = sequelize.define(
  "Formula",
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
      onDelete: "NO ACTION",
    },
    columnId: {
      type: DataTypes.INTEGER,
      references: {
        model: "Columns",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    value: {
      type: DataTypes.TEXT,
    },
  },
  {
    timestamps: false,
  }
);

module.exports = Formula;
