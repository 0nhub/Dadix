const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Tag = sequelize.define(
  "Tag",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      references: {
        model: "Users",
        key: "id",
      },
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
    value: {
      type: DataTypes.STRING,
    },
    color: {
      type: DataTypes.STRING,
    },
    order: {
      type: DataTypes.INTEGER,
    },
  },
  {
    timestamps: false,
  }
);

module.exports = Tag;
