const crypto = require("crypto");
const ProjectInvite = require("../../models/ProjectInvite");

const createInvite = async ({
  projectId,
  invitedBy,
  role,
  email = null,
  expiresAt = null,
}) => {
  const token = crypto.randomBytes(24).toString("hex");
  const invite = await ProjectInvite.create({
    projectId,
    invitedBy,
    role,
    email,
    token,
    expiresAt,
    status: "pending",
  });
  return invite.get({ plain: true });
};

const getPendingInviteByEmail = async ({ projectId, email }) => {
  if (!projectId || !email) {
    return null;
  }

  const { Op } = require("sequelize");
  return await ProjectInvite.findOne({
    where: {
      projectId,
      email,
      status: "pending",
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
    },
    raw: true,
  });
};

const getInviteByToken = async ({ token }) => {
  if (!token) {
    return null;
  }
  return await ProjectInvite.findOne({ where: { token }, raw: true });
};

const listProjectInvites = async ({ projectId }) => {
  if (!projectId) {
    return [];
  }
  return await ProjectInvite.findAll({
    where: { projectId },
    raw: true,
    order: [["createdAt", "DESC"]],
  });
};

const markInviteAccepted = async ({ token, userId }) => {
  if (!token || !userId) {
    return null;
  }
  await ProjectInvite.update(
    { status: "accepted", acceptedBy: userId },
    { where: { token } }
  );
  return await getInviteByToken({ token });
};

const revokeInvite = async ({ projectId, inviteId }) => {
  if (!projectId || !inviteId) {
    return null;
  }
  return await ProjectInvite.destroy({ where: { id: inviteId, projectId } });
};

const isInviteExpired = ({ invite }) => {
  if (!invite?.expiresAt) {
    return false;
  }
  return new Date(invite.expiresAt).getTime() <= Date.now();
};

module.exports = {
  createInvite,
  getPendingInviteByEmail,
  getInviteByToken,
  listProjectInvites,
  markInviteAccepted,
  revokeInvite,
  isInviteExpired,
};
