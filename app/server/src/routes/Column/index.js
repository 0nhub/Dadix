const Router = require("express");
const columnControllers = require("../../controllers/Column");
const authMiddlewares = require("../../middlewares/Auth");
const rbacMiddlewares = require("../../middlewares/RBAC");
const constants = require("../../constants");
const formulaRoutes = require("./Formula");
const textOptionsRoutes = require("./TextOptions");
const relationOptionsRoutes = require("./RelationOptions");
const numberOptionsRoutes = require("./NumberOptions");

const router = Router();

router.use(
  "/formula",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  formulaRoutes
);
router.use(
  "/text-options",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  textOptionsRoutes
);
router.use(
  "/relation-options",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  relationOptionsRoutes
);
router.use(
  "/number-options",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  numberOptionsRoutes
);

router.post(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  columnControllers.createColumn
);
// router.post('/batch', authMiddlewares.requireAuth, columnControllers.createColumns);

router.patch(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  columnControllers.updateColumn
);
router.delete(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  columnControllers.deleteColumn
);

module.exports = router;
