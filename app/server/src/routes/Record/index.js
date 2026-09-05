const Router = require("express");
const recordControllers = require("../../controllers/Record");
const authMiddlewares = require("../../middlewares/Auth");
const rbacMiddlewares = require("../../middlewares/RBAC");
const constants = require("../../constants");

const router = Router();

router.get(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.VIEWER),
  recordControllers.getTableRecords
);
router.post(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  recordControllers.createRecord
);
router.delete(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  recordControllers.deleteRecords
);

router.get(
  "/all",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.VIEWER),
  recordControllers.getAllTableRecords
);

router.get(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.VIEWER),
  recordControllers.getRecord
);
router.patch(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  recordControllers.updateRecord
);
router.delete(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  recordControllers.deleteRecord
);

router.get(
  "/:id/related",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.VIEWER),
  recordControllers.getRelatedRecords
);
router.post(
  "/:id/related",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  recordControllers.createRelatedRecord
);
router.delete(
  "/:id/related",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  recordControllers.deleteRelatedRecord
);

module.exports = router;
