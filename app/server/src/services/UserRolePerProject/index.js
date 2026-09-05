const UserRolePerProject = require("../../models/UserRolePerProject");
const User = require("../../models/User");

const create = async ({ projectId, userId, role, transaction = undefined }) => {
  return await UserRolePerProject.create(
    {
      projectId: projectId,
      userId: userId,
      role: role,
    },
    { transaction: transaction }
  );
};

const getUserRole = async ({ userId, projectId }) => {
  if (!userId || !projectId) {
    return null;
  }
  return await UserRolePerProject.findOne({
    where: { userId, projectId },
    raw: true,
  });
};

const upsertUserRole = async ({ userId, projectId, role, transaction }) => {
  if (!userId || !projectId || !role) {
    return null;
  }
  const existing = await UserRolePerProject.findOne({
    where: { userId, projectId },
    raw: true,
    transaction,
  });
  if (existing) {
    await UserRolePerProject.update(
      { role },
      { where: { id: existing.id }, transaction }
    );
    return { ...existing, role };
  }
  return await UserRolePerProject.create(
    { userId, projectId, role },
    { transaction }
  );
};

const removeUserRole = async ({ userId, projectId, transaction }) => {
  if (!userId || !projectId) {
    return null;
  }
  return await UserRolePerProject.destroy({
    where: { userId, projectId },
    transaction,
  });
};

const listProjectMembers = async ({ projectId }) => {
  if (!projectId) {
    return [];
  }
  const roles = await UserRolePerProject.findAll({
    where: { projectId },
    raw: true,
  });
  const userIds = roles.map((role) => role.userId);
  if (userIds.length === 0) {
    return [];
  }
  const users = await User.findAll({
    where: { id: userIds },
    raw: true,
    attributes: ["id", "username", "email", "createdAt"],
  });
  const usersById = users.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {});
  return roles.map((role) => ({
    ...role,
    user: usersById[role.userId],
  }));
};

module.exports = {
  create,
  getUserRole,
  upsertUserRole,
  removeUserRole,
  listProjectMembers,
};
