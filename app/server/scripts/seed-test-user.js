/**
 * Erstellt ein lokales Testkonto für localhost.
 * Voraussetzung: server/.env mit DATABASE_URI und USERS_PROJECTS_DATABASE_URI.
 *
 * Ausführung aus Projektroot (app/): npm run seed:test-user
 * Oder aus server/: node scripts/seed-test-user.js
 */
const path = require("path");

// .env aus server-Verzeichnis laden
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { connectDB, connectUserProjectsDB } = require("../src/config/database");
const userService = require("../src/services/User");
const projectServices = require("../src/services/Project");

const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "Test1234!";

async function seed() {
  if (!process.env.DATABASE_URI) {
    console.error(
      "Fehler: server/.env fehlt oder DATABASE_URI ist nicht gesetzt. Bitte zuerst server/.env anlegen (siehe server/.env.example)."
    );
    process.exit(1);
  }

  await connectDB();
  await connectUserProjectsDB();

  const existingUser = await userService.getByEmail({ email: TEST_EMAIL });
  if (existingUser) {
    console.log("Testkonto existiert bereits. Zugangsdaten:");
    console.log("  E-Mail:   ", TEST_EMAIL);
    console.log("  Passwort:", TEST_PASSWORD);
    process.exit(0);
    return;
  }

  const user = await userService.create({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    username: "testuser",
  });

  await projectServices.create({
    title: "Project_1",
    icon: "defaultIcon",
    userId: user.id,
  });

  console.log("Testkonto wurde angelegt.");
  console.log("");
  console.log("Zugangsdaten für localhost:");
  console.log("  E-Mail:   ", TEST_EMAIL);
  console.log("  Passwort: ", TEST_PASSWORD);
  console.log("");
  console.log("Login: http://localhost:3000/login");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
