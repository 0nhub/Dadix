const constants = require("../../constants");
const UserRolePerProjectService = require("../../services/UserRolePerProject");
const Table = require("../../models/Table");

const roleOrder = [
  constants.roles.VIEWER,
  constants.roles.EDITOR,
  constants.roles.ADMIN,
  constants.roles.OWNER,
];

const hasRequiredRole = ({ requiredRole, actualRole }) => {
  const requiredIndex = roleOrder.indexOf(requiredRole);
  const actualIndex = roleOrder.indexOf(actualRole);
  if (requiredIndex < 0 || actualIndex < 0) {
    return false;
  }
  return actualIndex >= requiredIndex;
};

const resolveProjectId = async (req) => {
  if (req.params?.projectId) {
    return req.params.projectId;
  }
  if (req.baseUrl?.includes("/project") && req.params?.id) {
    return req.params.id;
  }
  if (req.body?.projectId) {
    return req.body.projectId;
  }
  if (req.query?.projectId) {
    return req.query.projectId;
  }

  const tableId = req.body?.tableId || req.query?.tableId || req.params?.tableId;
  if (!tableId) {
    return null;
  }
  const table = await Table.findByPk(tableId, { raw: true });
  return table?.projectId || null;
};

const requireProjectRole = (requiredRole) => async (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const projectId = await resolveProjectId(req);
  if (!projectId) {
    return res.status(400).json({ message: "Missing project context" });
  }
  req.projectId = projectId;

  const roleRow = await UserRolePerProjectService.getUserRole({
    userId,
    projectId,
  });
  if (!roleRow) {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (!hasRequiredRole({ requiredRole, actualRole: roleRow.role })) {
    return res.status(403).json({ message: "Forbidden" });
  }

  req.projectRole = roleRow.role;
  next();
};

module.exports = {
  requireProjectRole,
};
