const Router = require("express");
const columnFormulaControllers = require("../../../controllers/Column/Formula");
const authMiddlewares = require("../../../middlewares/Auth");
const rbacMiddlewares = require("../../../middlewares/RBAC");
const constants = require("../../../constants");

const router = Router();

router.patch(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  columnFormulaControllers.updateColumnFormula
);

module.exports = router;
