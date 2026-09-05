const Router = require("express");
const columnTextOptionsControllers = require("../../../controllers/Column/TextOptions");
const authMiddlewares = require("../../../middlewares/Auth");
const rbacMiddlewares = require("../../../middlewares/RBAC");
const constants = require("../../../constants");

const router = Router();

router.patch(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  columnTextOptionsControllers.updateColumnTextOptions
);

module.exports = router;
