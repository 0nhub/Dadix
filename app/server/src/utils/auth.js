const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const utils = require("./utils");

const generateAccessToken = ({ userId, res }) => {
  const accessToken = jwt.sign(
    { userId: userId },
    process.env["ACCESS_TOKEN_SECRET"],
    { expiresIn: process.env["ACCESS_TOKEN_EXPIRES_IN"] }
  );

  if (res) {
    res.cookie("accessToken", accessToken, {
      httpOnly: utils.isDevEnv() ? false : true,
      secure: process.env.SECURE === "true",
      path: "/",
      sameSite: "lax",
      noTimestamp: true,
      expires: null,
      domain: utils.isDevEnv() ? undefined : process.env.DOMAIN || ".dadix.net",
      maxAge:
        utils.parseExpirationTime({
          timeString: process.env["ACCESS_TOKEN_EXPIRES_IN"],
        }) * 1000,
    });
  }

  return accessToken;
};

const decodeAccessToken = ({ accessToken }) => {
  try {
    if (!accessToken) {
      return "No accessToken provided";
    }
    const decodedToken = jwt.verify(
      accessToken,
      process.env["ACCESS_TOKEN_SECRET"]
    );
    return decodedToken;
  } catch (err) {
    return err.name;
  }
};

const generateRefreshToken = ({ userId, res }) => {
  const refreshToken = jwt.sign(
    { userId: userId },
    process.env["REFRESH_TOKEN_SECRET"],
    { expiresIn: process.env["REFRESH_TOKEN_EXPIRES_IN"] }
  );

  if (res) {
    res.cookie("refreshToken", refreshToken, {
      httpOnly: utils.isDevEnv() ? false : true,
      secure: process.env.SECURE,
      path: "/",
      sameSite: "lax",
      expires: null,
      noTimestamp: true,
      domain: utils.isDevEnv()
        ? "localhost"
        : process.env.DOMAIN || ".dadix.net",
      maxAge:
        utils.parseExpirationTime({
          timeString: process.env["REFRESH_TOKEN_EXPIRES_IN"],
        }) * 1000,
    });
  }

  return refreshToken;
};

const decodeRefreshToken = ({ refreshToken }) => {
  try {
    if (!refreshToken) {
      return "No refreshToken provided";
    }
    const decodedToken = jwt.verify(
      refreshToken,
      process.env["REFRESH_TOKEN_SECRET"]
    );
    return decodedToken;
  } catch (err) {
    console.error(err);
    return err.name;
  }
};

const isSessionExpired = ({ session }) => {
  const { createdAt, expiresIn } = session;
  if (!expiresIn) {
    return true;
  }

  // transform expiresIn to seconds
  let expiresInSeconds = utils.parseExpirationTime({ timeString: expiresIn });

  const createdAt_utc = new Date(createdAt.toUTCString());
  const expiresDate_utc = new Date(
    createdAt_utc.getTime() + expiresInSeconds * 1000
  );
  const today_utc = new Date(new Date().toUTCString());

  return expiresDate_utc.getTime() <= today_utc.getTime();
};

const hashPassword = async ({ password }) => {
  try {
    // Number of salt rounds (10-12 is recommended)
    const SALT_ROUNDS = 12;
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hash = await bcrypt.hash(password, salt);
    return hash;
  } catch (err) {
    console.error("Error hashing password");
    throw err;
  }
};

const checkPassword = async ({ password, hashedPassword }) => {
  try {
    const isValid = await bcrypt.compare(password, hashedPassword);
    return isValid;
  } catch (err) {
    console.error("Error comparing passwords");
    throw err;
  }
};

const checkEmailRegistration = async ({ email }) => {
  let user = await User.findOne({
    where: {
      email: email.toLowerCase(),
    },
    raw: true,
  });

  if (user && user.dataValues) {
    user = user.dataValues;
  }

  return {
    isRegistered: !!user,
    user: user,
  };
};

const isValidPassword = ({ password }) => {
  return (
    password.length >= 8 && //Password must be at least 8 characters long
    new RegExp(/[A-Z]/).test(password) && //Password must contain at least one uppercase letter
    new RegExp(/[a-z]/).test(password) && //Password must contain at least one lowercase letter
    new RegExp(/[0-9]/).test(password) && //Password must contain at least one number
    new RegExp(/[^A-Za-z0-9]/).test(password)
  ); //Password must contain at least one special character
};

const generateRandomUserName = () => {
  const prefixes = [
    "Cyber",
    "Quantum",
    "Neon",
    "Shadow",
    "Chrome",
    "Aether",
    "Zenith",
    "Crimson",
    "Cosmic",
    "Phantom",
  ];

  const suffixes = [
    "nova",
    "rift",
    "pulse",
    "edge",
    "strike",
    "wave",
    "code",
    "flux",
    "spark",
    "surge",
  ];

  return `${prefixes[Math.floor(Math.random() * prefixes.length)]}${
    suffixes[Math.floor(Math.random() * suffixes.length)]
  }`;
};

module.exports = {
  generateAccessToken,
  decodeAccessToken,
  generateRefreshToken,
  decodeRefreshToken,
  isSessionExpired,
  hashPassword,
  checkPassword,
  checkEmailRegistration,
  isValidPassword,
  generateRandomUserName,
};
