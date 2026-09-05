const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ProjectInvite = sequelize.define(
  "ProjectInvite",
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
    invitedBy: {
      type: DataTypes.UUID,
      references: {
        model: "Users",
        key: "id",
      },
    },
    acceptedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        name: "project_invite_idx_token",
        fields: ["token"],
      },
    ],
  }
);

module.exports = ProjectInvite;
