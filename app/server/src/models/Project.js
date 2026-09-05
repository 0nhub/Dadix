const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Project = sequelize.define(
  "Project",
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
    title: {
      type: DataTypes.STRING,
    },
    icon: {
      type: DataTypes.STRING,
    },
    order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    databaseURL: {
      type: DataTypes.STRING,
    },
    isDatabaseHostedInternally: {
      type: DataTypes.BOOLEAN,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = Project;
