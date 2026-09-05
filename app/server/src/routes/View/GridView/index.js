const Router = require("express");
const gridViewControllers = require("../../../controllers/View/GridView");
const authMiddlewares = require("../../../middlewares/Auth");
const rbacMiddlewares = require("../../../middlewares/RBAC");
const constants = require("../../../constants");

const router = Router();

router.patch(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  gridViewControllers.updateColumn
);

router.post(
  "/buttons",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  gridViewControllers.createButton
);

router.patch(
  "/buttons/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  gridViewControllers.updateButton
);

router.delete(
  "/buttons/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  gridViewControllers.deleteButton
);

module.exports = router;
