const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const UserRolePerProject = sequelize.define(
  "UserRolePerProject",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      unique: true,
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
      onDelete: "CASCADE",
    },
    role: {
      type: DataTypes.STRING,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = UserRolePerProject;
