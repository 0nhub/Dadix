/**
 * Lokaler Offline-User für Development, wenn die DB nicht erreichbar ist.
 * Muss zu den Frontend-Dev-Credentials (test@example.com / Test1234!) passen.
 */

const DEV_OFFLINE_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "testuser",
  email: "test@example.com",
  password: "",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
};

const DEV_OFFLINE_CREDENTIALS = {
  email: "test@example.com",
  password: "Test1234!",
};

const isDevRuntime = () =>
  process.env.ENV === "dev" || process.env.NODE_ENV === "development";

const isDevOfflineCredentials = ({ email, passcode }) => {
  if (!email || !passcode) return false;
  return (
    String(email).toLowerCase() === DEV_OFFLINE_CREDENTIALS.email &&
    passcode === DEV_OFFLINE_CREDENTIALS.password
  );
};

const isDevOfflineUserId = (userId) =>
  userId != null && String(userId) === DEV_OFFLINE_USER.id;

module.exports = {
  DEV_OFFLINE_USER,
  DEV_OFFLINE_CREDENTIALS,
  isDevRuntime,
  isDevOfflineCredentials,
  isDevOfflineUserId,
};
