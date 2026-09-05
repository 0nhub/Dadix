const Router = require("express");
const authMiddlewares = require("../../../middlewares/Auth");
const rbacMiddlewares = require("../../../middlewares/RBAC");
const constants = require("../../../constants");
const columnRelationOptionsController = require("../../../controllers/Column/RelationOptions");
const relationTableViewColumnsController = require("../../../controllers/Column/RelationOptions/RelationTableViewColumns");

const router = Router();

router.patch(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.ADMIN),
  columnRelationOptionsController.updateColumnRelationOptions
);

router.get(
  "/:id/relation-table-view-column",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  relationTableViewColumnsController.getAllColumns
);

router.patch(
  "/relation-table-view-column/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  relationTableViewColumnsController.updateColumn
);

module.exports = router;
