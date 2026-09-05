const Router = require("express");
const viewControllers = require("../../controllers/View");
const authMiddlewares = require("../../middlewares/Auth");
const rbacMiddlewares = require("../../middlewares/RBAC");
const constants = require("../../constants");

const gridViewRoutes = require("./GridView");

const router = Router();

router.use("/grid", gridViewRoutes);

router.get(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.VIEWER),
  viewControllers.getAllTableViews
);
router.post(
  "/",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  viewControllers.createView
);

router.get(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.VIEWER),
  viewControllers.getView
);
router.patch(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  viewControllers.updateView
);
router.delete(
  "/:id",
  authMiddlewares.requireAuth,
  rbacMiddlewares.requireProjectRole(constants.roles.EDITOR),
  viewControllers.deleteView
);

router.post(
  "/:id/duplicate",
  authMiddlewares.requireAuth,
  viewControllers.duplicateView
);

module.exports = router;
