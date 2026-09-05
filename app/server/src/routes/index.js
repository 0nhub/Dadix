const Router = require("express");
const corsMiddlewares = require("../middlewares/cors");


const authRoutes = require("./Auth");
const userRoutes = require("./User");
const projectRoutes = require("./Project");
const tableRoutes = require("./Table");
const columnRoutes = require("./Column");
const tagRoutes = require("./Tag");
const recordRoutes = require("./Record");
const viewRoutes = require("./View");
const apiRoutes = require("./API");
const aiRoutes = require("./AI");

const router = Router();

router.use("/auth", corsMiddlewares.appCorsHandler, authRoutes);
router.use("/user", corsMiddlewares.appCorsHandler, userRoutes);
router.use("/project", corsMiddlewares.appCorsHandler, projectRoutes);
router.use("/table", corsMiddlewares.appCorsHandler, tableRoutes);
router.use("/column", corsMiddlewares.appCorsHandler, columnRoutes);
router.use("/tag", corsMiddlewares.appCorsHandler, tagRoutes);
router.use("/record", corsMiddlewares.appCorsHandler, recordRoutes);
router.use("/view", corsMiddlewares.appCorsHandler, viewRoutes);
router.use("/ai", corsMiddlewares.appCorsHandler, aiRoutes);

router.use("/api", apiRoutes);

module.exports = router;
