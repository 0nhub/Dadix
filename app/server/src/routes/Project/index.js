const Router = require("express");
const projectControllers = require("../../controllers/Project");
const authMiddlewares = require("../../middlewares/Auth");
const rbacMiddlewares = require("../../middlewares/RBAC");
const constants = require("../../constants");

const router = Router();

router.get("/", authMiddlewares.requireAuth, projectControllers.getAllProjects);
router.post("/", authMiddlewares.requireAuth, projectControllers.createProject);

router.patch(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  projectControllers.updateProject,
);
router.delete(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.OWNER),
  projectControllers.deleteProject,
);

router.get(
  "/:id/members",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.VIEWER),
  projectControllers.listMembers,
);
router.post(
  "/:id/roles",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.OWNER),
  projectControllers.assignRole,
);
router.delete(
  "/:id/roles",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.OWNER),
  projectControllers.removeRole,
);

router.get(
  "/:id/invites",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  projectControllers.listInvites,
);
router.post(
  "/:id/invites",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  projectControllers.createInvite,
);
router.delete(
  "/:id/invites/:inviteId",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  projectControllers.revokeInvite,
);

router.get("/invite/:token", projectControllers.getInvite);
router.post(
  "/invite/:token/accept",
  authMiddlewares.requireAuth,
  projectControllers.acceptInvite,
);

module.exports = router;
