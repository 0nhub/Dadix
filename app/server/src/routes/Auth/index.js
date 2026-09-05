const Router = require("express");
const authControllers = require("../../controllers/Auth");

const router = Router();

router.post("/login", authControllers.login);

router.post("/signup", authControllers.signup);

router.post("/logout", authControllers.logout);

module.exports = router;
