const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const RelationTableViewColumns = sequelize.define(
  "RelationTableViewColumns",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    relationId: {
      type: DataTypes.INTEGER,
      references: {
        model: "RelationColumns",
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

module.exports = RelationTableViewColumns;
