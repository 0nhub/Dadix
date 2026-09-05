const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const RelationColumn = sequelize.define(
  "RelationColumn",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    columnId: {
      type: DataTypes.INTEGER,
      references: {
        model: "Columns",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    relatedToTableWithId: {
      type: DataTypes.UUID,
      references: {
        model: "Tables",
        key: "id",
      },
      onDelete: "SET NULL",
    },
    allowMultipleRelations: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    showAddNewButton: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    timestamps: false,
  }
);

module.exports = RelationColumn;
