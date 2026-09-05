const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const NumberOptions = sequelize.define(
  "NumberOptions",
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
    thousandsSeparator: {
      type: DataTypes.STRING,
      defaultValue: "none",
    },
    decimalPlaces: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    decimalSeparator: {
      type: DataTypes.STRING,
      defaultValue: "point",
    },
    prefix: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
    suffix: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
  },
  {
    timestamps: false,
  }
);

module.exports = NumberOptions;
