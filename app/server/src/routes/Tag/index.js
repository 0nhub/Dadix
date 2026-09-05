const Router = require("express");
const tagControllers = require("../../controllers/Tag");
const authMiddlewares = require("../../middlewares/Auth");
const rbacMiddlewares = require("../../middlewares/RBAC");
const constants = require("../../constants");

const router = Router();

router.post(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  tagControllers.createTag
);

router.patch(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  tagControllers.updateTag
);
router.delete(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  tagControllers.deleteTag
);

module.exports = router;
