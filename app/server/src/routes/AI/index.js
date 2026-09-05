const Router = require("express");
const aiControllers = require("../../controllers/AI");
const authMiddlewares = require("../../middlewares/Auth");

const router = Router();

// In development, allow AI completion without auth (for local testing without DB/login)
const optionalAuth = (req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return authMiddlewares.requireAuth(req, res, next);
  }
  next();
};

router.post(
  "/complete",
  optionalAuth,
  aiControllers.completeBatch
);

module.exports = router;
