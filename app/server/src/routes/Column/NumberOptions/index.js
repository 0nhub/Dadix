const Router = require("express");
const numberOptionsControllers = require("../../../controllers/Column/NumberOptions");
const authMiddlewares = require("../../../middlewares/Auth");
const rbacMiddlewares = require("../../../middlewares/RBAC");
const constants = require("../../../constants");

const router = Router();

router.patch(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  numberOptionsControllers.updateColumnNumberOptions
);

module.exports = router;
