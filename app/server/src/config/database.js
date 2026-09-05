const { Sequelize } = require("sequelize");
const { Pool } = require("pg");

const mainDbSSLFlag = String(process.env.DB_SSL ?? "true").toLowerCase();
const MAIN_DB_USE_SSL = mainDbSSLFlag === "true" || mainDbSSLFlag === "1";

const sequelize = new Sequelize(process.env.DATABASE_URI, {
  dialect: "postgres",
  dialectOptions: {
    ssl: MAIN_DB_USE_SSL
      ? {
          require: true,
          rejectUnauthorized: false,
        }
      : false,
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 4000,
    idle: 10000,
  },
  logging: (msg) => {
    if (msg.includes("ERROR")) {
      console.error(msg);
    }
  },
});

const upDbSSLFlag = String(process.env.USERS_PROJECTS_DB_SSL ?? "true").toLowerCase();
const USERS_PROJECTS_USE_SSL = upDbSSLFlag === "true" || upDbSSLFlag === "1";

const sequelizeUserProjects = new Sequelize(
  process.env.USERS_PROJECTS_DATABASE_URI,
  {
    dialect: "postgres",
    dialectOptions: {
      ssl: USERS_PROJECTS_USE_SSL
        ? {
            require: true,
            rejectUnauthorized: false,
          }
        : false,
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 4000,
      idle: 10000,
    },
    logging: (msg) => {
      if (/*isDevEnv() || */ msg.includes("ERROR")) {
        console.error(msg);
      }
    },
  }
);

const connectDB = async () => {
  // Database connection and sync
  try {
    await sequelize.authenticate();
    console.info("Database connected successfully");

    /* TODO: only sync models on dev (stop it on production)*/
    require("../models/User");
    require("../models/Session");
    require("../models/Project");
    require("../models/UserRolePerProject");
    require("../models/APIKey");
    require("../models/ProjectInvite");
    require("../models/Table");
    require("../models/APIKeyPermissionPerTable");
    require("../models/Column");
    require("../models/TagColumnOptions");
    require("../models/TextColumnOptions");
    require("../models/NumberColumnOptions");
    require("../models/FormulaColumnOptions");
    require("../models/RelationColumnOptions");
    require("../models/RelationTableViewColumns");
    require("../models/View");
    require("../models/views/GridView");
    require("../models/views/ViewButton");

    // Sync models
    await sequelize.sync({ alter: true });

    console.info("Models synced");
    /**/
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
    console.info("Development: server continues without database (e.g. AI route still works).");
  }
};

const connectUserProjectsDB = async () => {
  // Database connection and sync
  try {
    await sequelizeUserProjects.authenticate();
    console.info("User Projects Database connected successfully");
  } catch (error) {
    console.info("Unable to connect to user projects database:", error);
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
    console.info("Development: server continues without user projects DB.");
  }
};

const projectsDataDBPGPool = (() => {
  try {
    const dbUrl = new URL(process.env.USERS_PROJECTS_DATABASE_URI);
    return new Pool({
      user: dbUrl.username,
      host: dbUrl.hostname,
      database: dbUrl.pathname.substring(dbUrl.pathname.lastIndexOf("/") + 1),
      password: dbUrl.password,
      port: dbUrl.port,
      max: 5, // Maximum number of clients in the pool
      min: 0, // Minimum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if no client is available
      statement_timeout: 60 * 2 * 1000,
      ssl: USERS_PROJECTS_USE_SSL
        ? {
            requestCert: true,
            rejectUnauthorized: false, // Change to false if you want to accept self-signed certificates
          }
        : false,
    });
  } catch (err) {
    console.error(err);
    return null;
  }
})();

module.exports = {
  sequelize,
  sequelizeUserProjects,
  projectsDataDBPGPool,
  connectDB,
  connectUserProjectsDB,
};
