const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const APIKey = sequelize.define(
  "APIKey",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    projectId: {
      type: DataTypes.UUID,
      references: {
        model: "Projects",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
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
    timestamps: true,
  }
);

module.exports = APIKey;
