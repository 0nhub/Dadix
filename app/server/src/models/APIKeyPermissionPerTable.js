const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const APIKeyPermissionPerTable = sequelize.define(
  "APIKeyPermissionPerTable",
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
    APIKeyId: {
      type: DataTypes.INTEGER,
      references: {
        model: "APIKeys",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    allowRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    allowWrite: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    allowDelete: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    timestamps: false,
  }
);

module.exports = APIKeyPermissionPerTable;
