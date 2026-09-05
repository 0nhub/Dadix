const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const View = sequelize.define(
  "View",
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
      onDelete: "CASCADE",
    },
    name: {
      type: DataTypes.TEXT,
    },
    icon: {
      type: DataTypes.STRING,
    },
    order: {
      type: DataTypes.INTEGER,
    },
    type: {
      type: DataTypes.STRING,
    },
    filter: {
      type: DataTypes.TEXT,
    },
    sort: {
      type: DataTypes.TEXT,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: new Date(),
    },
  },
  {
    timestamps: false,
  }
);

module.exports = View;
