const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Column = sequelize.define(
  "Column",
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
      onDelete: "CASCADE",
    },
    name: {
      type: DataTypes.STRING,
    },
    type: {
      type: DataTypes.STRING,
    },
    size: {
      type: DataTypes.INTEGER,
    },
    order: {
      type: DataTypes.INTEGER,
    },
    contentAlign: {
      type: DataTypes.STRING, // right | center | left
    },
    action: {
      type: DataTypes.STRING, // null | copy | edit | openUrl
    },
    isVisible: {
      type: DataTypes.BOOLEAN,
    },
    choiceMode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    timestamps: false,
  }
);

module.exports = Column;
