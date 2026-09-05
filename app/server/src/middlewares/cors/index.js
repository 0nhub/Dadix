const { isDevEnv } = require("../../utils/utils");
const cors = require("cors");

const isDev = isDevEnv() || process.env.NODE_ENV !== "production";

const appCorsHandler = cors({
  origin: isDev
    ? true
    : [process.env.ALLOWED_ORIGIN || "https://dadix.net"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
  allowedHeaders: ["Authorization", "Content-Type", "Accept"],
  credentials: true,
});

const apiCorsHandler = cors({
  origin: function (origin, callback) {
    // Allow all origins, including those from localhost or no origin (like mobile apps/curl)
    callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"], // Allow all common methods
  allowedHeaders: ["Authorization", "Content-Type", "Accept"],
  credentials: false,
  optionsSuccessStatus: 204,
});

module.exports = {
  appCorsHandler,
  apiCorsHandler,
};
