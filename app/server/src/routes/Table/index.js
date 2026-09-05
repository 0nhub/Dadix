const Router = require("express");
const tableControllers = require("../../controllers/Table");
const authMiddlewares = require("../../middlewares/Auth");
const rbacMiddlewares = require("../../middlewares/RBAC");
const constants = require("../../constants");

const router = Router();

router.get(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.VIEWER),
  tableControllers.getProjectTables
);
router.post(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  tableControllers.createTable
);

router.get(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.VIEWER),
  tableControllers.getTable
);
router.patch(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  tableControllers.updateTable
);
router.delete(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  tableControllers.deleteTable
);

router.post(
  "/import",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  tableControllers.importTable
);

module.exports = router;
