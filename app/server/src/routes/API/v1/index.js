const Router = require("express");
const apiV1Controllers = require("../../../controllers/API/v1");

const router = Router();

router.get("/tables/:tableId/records", apiV1Controllers.getTableRecords);
router.patch("/tables/:tableId/records", apiV1Controllers.updateTableRecords);
router.post("/tables/:tableId/records", apiV1Controllers.createManyTableRecods);
router.delete("/tables/:tableId/records", apiV1Controllers.deleteTableRecords);

module.exports = router;
