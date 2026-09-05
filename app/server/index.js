process.env.TZ = "UTC";
require("dotenv").config();
const express = require("express");
const app = express();
const router = require("./src/routes");
const { connectDB, connectUserProjectsDB } = require("./src/config/database");
const cookieParser = require("cookie-parser");

// Middlewares

/*app.use(
  cors({
    origin: isDevEnv()
      ? ["http://localhost:3000"]
      : [process.env.ALLOWED_ORIGIN || "https://dadix.net"], // Allow specific origin
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"], // Allow all common methods
    credentials: true, // Allow cookies or authentication data to be sent if needed
  }),
);

app.use(
  "/api",
  cors({
    origin: "*", // Allow from all origins
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"], // Allow all common methods
    credentials: false,
    }),
);*/

app.use(express.json());
app.use(
  express.json({
    limit: "50mb",
  }),
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "50mb",
  }),
);
app.use(cookieParser());

// App routes
app.use("/", router);

// Database connection and sync
connectDB();
// User projects database cinnect and sync
connectUserProjectsDB();

module.exports = app;
