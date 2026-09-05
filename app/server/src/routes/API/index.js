const Router = require("express");
const apiV1Routes = require("./v1");
const authMiddlewares = require("../../middlewares/Auth");
const apiAuthMiddlewares = require("../../middlewares/API");
const apiControllers = require("../../controllers/API");
const corsMiddlewares = require("../../middlewares/cors");
const rbacMiddlewares = require("../../middlewares/RBAC");
const constants = require("../../constants");

const router = Router();

router.use(
  "/v1",
  corsMiddlewares.apiCorsHandler,
  apiAuthMiddlewares.requireAuth,
  apiV1Routes
);

router.get(
  "/key",
  corsMiddlewares.appCorsHandler,
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  apiControllers.getProjectAPIKey
);

module.exports = router;
