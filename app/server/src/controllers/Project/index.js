const projectServices = require("../../services/Project");
const userRolePerProjectServices = require("../../services/UserRolePerProject");
const projectInviteServices = require("../../services/ProjectInvite");
const userServices = require("../../services/User");
const constants = require("../../constants");
const emailitService = require("../../services/Emailit");
const emailUtils = require("../../utils/email");
const {
  isDevRuntime,
  isDevOfflineUserId,
} = require("../../constants/devOfflineUser");

const getAllProjects = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  // Offline-Dev-User: Frontend nutzt Demo-Projekte, keine DB nötig
  if (isDevRuntime() && isDevOfflineUserId(userId)) {
    return res.status(200).json({ projects: [] });
  }

  const getAllProjectsResult = await projectServices.getAll({
    userId: userId,
    fields: ["id", "title", "icon", "order"],
  });

  if (getAllProjectsResult?.error) {
    return res
      .status(getAllProjectsResult.errorCode)
      .json({ message: getAllProjectsResult.errorMessage });
  }

  return res.status(200).json({ projects: getAllProjectsResult || [] });
};

const createProject = async (req, res) => {
  const { title, icon, databaseUrl } = req.body || {};

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  if (!title || !icon) {
    return res.status(400).json({ message: "Invalid request" });
  }

  if (isDevRuntime() && isDevOfflineUserId(userId)) {
    return res.status(201).json({
      id: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title,
      icon,
      order: 0,
      userId,
      role: "Owner",
    });
  }

  const createProjectResult = await projectServices.create({
    title: title,
    icon: icon,
    userId: userId,
    databaseUrl: databaseUrl,
  });

  if (!createProjectResult) {
    return res.status(500).json({ message: "Server Error" });
  }
  if (createProjectResult?.error) {
    return res
      .status(createProjectResult.errorCode)
      .json({ message: createProjectResult.errorMessage });
  }

  return res.status(201).json(createProjectResult);
};

const updateProject = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const projectId = req.params?.id;
  const { data } = req.body || {};
  if (!projectId || !data) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const updatedProject = await projectServices.update({
    userId: userId,
    id: projectId,
    newData: data,
  });

  if (updatedProject?.error) {
    return res
      .status(updatedProject.errorCode)
      .json({ message: updatedProject.errorMessage });
  }

  return res.status(200).json(updatedProject);
};

const deleteProject = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const projectId = req.params?.id;
  if (!projectId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const deleteProjectResult = await projectServices.remove({
    userId: userId,
    id: projectId,
  });

  if (!deleteProjectResult || deleteProjectResult?.error) {
    return res
      .status(deleteProjectResult?.errorCode || 500)
      .json({ message: deleteProjectResult?.errorMessage || "Server error" });
  }

  return res.status(200).json({ message: "Project deleted successfully" });
};

const listMembers = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const projectId = req.params?.id;
  if (!projectId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const members = await userRolePerProjectServices.listProjectMembers({
    projectId,
  });

  return res.status(200).json({ members });
};

const assignRole = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const projectId = req.params?.id;
  const { targetUserId, role } = req.body || {};
  if (!projectId || !targetUserId || !role) {
    return res.status(400).json({ message: "Invalid request" });
  }

  if (!Object.values(constants.roles).includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  const upserted = await userRolePerProjectServices.upsertUserRole({
    userId: targetUserId,
    projectId,
    role,
  });

  return res.status(200).json({ role: upserted });
};

const removeRole = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const projectId = req.params?.id;
  const { targetUserId } = req.query || {};
  if (!projectId || !targetUserId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  if (`${targetUserId}` === `${userId}`) {
    return res.status(400).json({ message: "Cannot remove self" });
  }

  await userRolePerProjectServices.removeUserRole({
    userId: targetUserId,
    projectId,
  });

  return res.status(200).json({ message: "Role removed" });
};

const createInvite = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const projectId = req.params?.id;
  const { role, email, expiresAt } = req.body || {};
  // normalize role: accept API roles in any case (e.g., EDITOR/Editor)
  let normalizedRole = role;
  if (
    normalizedRole &&
    !Object.values(constants.roles).includes(normalizedRole)
  ) {
    const maybe = constants.roles[("" + normalizedRole).toUpperCase()];
    if (maybe) normalizedRole = maybe;
  }
  if (!projectId || !normalizedRole) {
    return res.status(400).json({ message: "Invalid request" });
  }
  if (!Object.values(constants.roles).includes(normalizedRole)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  // check if user already a member of project (Point 3)
  if (email) {
    const user = await userServices.getByEmail({ email });
    if (user) {
      const existingRole = await userRolePerProjectServices.getUserRole({
        userId: user.id,
        projectId,
      });
      if (existingRole) {
        return res.status(400).json({
          message: "User is already a member of this project",
          existingMember: true,
        });
      }
    }

    // check if a pending invite already exist (Point 2)
    const existingInvite = await projectInviteServices.getPendingInviteByEmail({
      projectId,
      email,
    });
    if (existingInvite) {
      return res.status(200).json({
        message: "A pending invite already exists for this email",
        invite: existingInvite,
      });
    }
  }

  const invite = await projectInviteServices.createInvite({
    projectId,
    invitedBy: userId,
    role: normalizedRole,
    email: email || null,
    expiresAt: expiresAt || null,
  });

  // Send email if an email address was provided; do not block response on email failure
  if (invite?.email) {
    try {
      const sendEmailResult = await emailitService.sendEmail({
        recipent: invite.email,
        subject: "You're invited to join a project",
        html: emailUtils.emailTemplate({
          templateBody: emailUtils.emailsBodyTemplates.projectInvite({
            role: invite.role,
            token: invite.token,
          }),
        }),
      });
      if (!sendEmailResult)
        throw new Error("Error sending project invite email");
    } catch (e) {
      console.error("sendInviteEmail error:", e?.message || e);
    }
  }

  return res.status(201).json({ invite });
};

const listInvites = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const projectId = req.params?.id;
  if (!projectId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const invites = await projectInviteServices.listProjectInvites({ projectId });
  return res.status(200).json({ invites });
};

const revokeInvite = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const projectId = req.params?.id;
  const inviteId = req.params?.inviteId;
  if (!projectId || !inviteId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  await projectInviteServices.revokeInvite({ projectId, inviteId });
  return res.status(200).json({ message: "Invite revoked" });
};

const getInvite = async (req, res) => {
  const { token } = req.params || {};
  if (!token) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const invite = await projectInviteServices.getInviteByToken({ token });
  if (!invite) {
    return res.status(404).json({ message: "Invite not found" });
  }
  if (invite.status !== "pending") {
    return res.status(400).json({ message: "Invite already used" });
  }
  if (projectInviteServices.isInviteExpired({ invite })) {
    return res.status(400).json({ message: "Invite expired" });
  }

  return res.status(200).json({ invite });
};

const acceptInvite = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const { token } = req.params || {};
  if (!token) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const invite = await projectInviteServices.getInviteByToken({ token });
  if (!invite) {
    return res.status(404).json({ message: "Invite not found" });
  }
  if (invite.status !== "pending") {
    return res.status(400).json({ message: "Invite already used" });
  }
  if (projectInviteServices.isInviteExpired({ invite })) {
    return res.status(400).json({ message: "Invite expired" });
  }
  if (invite.email && `${invite.email}` !== `${req.user?.email}`) {
    return res.status(403).json({ message: "Invite email mismatch" });
  }

  await userRolePerProjectServices.upsertUserRole({
    userId,
    projectId: invite.projectId,
    role: invite.role,
  });
  await projectInviteServices.markInviteAccepted({ token, userId });

  return res.status(200).json({ message: "Invite accepted" });
};

module.exports = {
  getAllProjects,
  createProject,
  updateProject,
  deleteProject,
  listMembers,
  assignRole,
  removeRole,
  createInvite,
  listInvites,
  revokeInvite,
  getInvite,
  acceptInvite,
};
