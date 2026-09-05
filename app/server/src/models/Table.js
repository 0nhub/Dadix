const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Table = sequelize.define(
  "Table",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      references: {
        model: "Users",
        key: "id",
      },
    },
    projectId: {
      type: DataTypes.UUID,
      references: {
        model: "Projects",
        key: "id",
      },
    },
    referenceName: {
      // this is reall name of table on dstabase
      type: DataTypes.STRING,
    },
    name: {
      type: DataTypes.STRING,
    },
    icon: {
      type: DataTypes.STRING,
    },
    order: {
      type: DataTypes.INTEGER,
    },
    isVisible: {
      type: DataTypes.BOOLEAN,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = Table;
