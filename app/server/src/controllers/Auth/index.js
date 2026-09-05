const authUtils = require("../../utils/auth");
const userService = require("../../services/User");
const projectServices = require("../../services/Project");
const utils = require("../../utils/utils");
const {
  DEV_OFFLINE_USER,
  isDevRuntime,
  isDevOfflineCredentials,
} = require("../../constants/devOfflineUser");

const respondWithDevOfflineLogin = (res) => {
  const accessToken = authUtils.generateAccessToken({
    userId: DEV_OFFLINE_USER.id,
    res,
  });
  authUtils.generateRefreshToken({
    userId: DEV_OFFLINE_USER.id,
    res,
  });
  return res.status(200).json({
    user: {
      id: DEV_OFFLINE_USER.id,
      username: DEV_OFFLINE_USER.username,
      email: DEV_OFFLINE_USER.email,
      createdAt: DEV_OFFLINE_USER.createdAt,
    },
    accessToken,
    offline: true,
  });
};

const login = async (req, res) => {
  const { email, passcode } = req.body || {};

  if (!email || !passcode) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    if (isDevRuntime() && isDevOfflineCredentials({ email, passcode })) {
      return respondWithDevOfflineLogin(res);
    }
    // check if email exist
    const emailRegistrationState = await authUtils.checkEmailRegistration({
      email: email,
    });
    if (!emailRegistrationState?.isRegistered) {
      // DB erreichbar, aber Testkonto fehlt / Offline-Credentials → Dev-Fallback
      if (isDevRuntime() && isDevOfflineCredentials({ email, passcode })) {
        return respondWithDevOfflineLogin(res);
      }
      return res.status(400).json({ message: "Incorrect email or password" });
    }

    // check if password correct
    const user = emailRegistrationState?.user;
    const isPasswordCorrect = await authUtils.checkPassword({
      password: passcode,
      hashedPassword: user?.password,
    });
    if (!isPasswordCorrect) {
      return res.status(400).json({ message: "Incorrect email or password" });
    }

    // if email+password both correct
    const accessToken = authUtils.generateAccessToken({
      userId: user.id,
      res: res,
    });
    authUtils.generateRefreshToken({
      userId: user.id,
      res: res,
    });

    const payload = {
      user: {
        id: emailRegistrationState.user.id,
        username: emailRegistrationState.user.username,
        email: emailRegistrationState.user.email,
        createdAt: emailRegistrationState.user.createdAt,
      },
    };
    const isDev =
      utils.isDevEnv() || process.env.NODE_ENV === "development";
    if (isDev) payload.accessToken = accessToken;
    return res.status(200).json(payload);
  } catch (err) {
    console.error(err);
    // DB down: Test-Login trotzdem erlauben (lokale Demo ohne Neon)
    if (isDevRuntime() && isDevOfflineCredentials({ email, passcode })) {
      return respondWithDevOfflineLogin(res);
    }
  }

  return res.status(500).json({ message: "server error" });
};

const signup = async (req, res) => {
  const { email, passcode } = req.body || {};

  if (!email || !passcode) {
    return res.status(400).json({ message: "invalid request" });
  }

  try {
    const emailRegistrationState = await authUtils.checkEmailRegistration({
      email: email.toLowerCase(),
    });
    if (emailRegistrationState?.emailRegistededres) {
      return res.status(400).json({ message: "Email already exist" });
    }
  } catch (err) {
    console.error(err);
  }

  if (!authUtils.isValidPassword({ password: passcode })) {
    return res.status(400).json({ message: "Invalid password" });
  }

  try {
    // create a new user
    const newUser = await userService.create({
      email: email,
      password: passcode,
    });

    // create a new project for the new user
    await projectServices.create({
      title: "Project_1",
      icon: "defaultIcon",
      userId: newUser.id,
    });

    const accessToken = authUtils.generateAccessToken({
      userId: newUser.id,
      res: res,
    });
    authUtils.generateRefreshToken({
      userId: newUser.id,
      res: res,
    });

    const payload = {
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        createdAt: newUser.createdAt,
      },
    };
    const isDev =
      utils.isDevEnv() || process.env.NODE_ENV === "development";
    if (isDev) payload.accessToken = accessToken;
    return res.status(201).json(payload);
  } catch (err) {
    return res.status(500).json({ message: `${err}` });
  }
};

const logout = (req, res) => {
  res.clearCookie("accessToken", {
    httpOnly: utils.isDevEnv() ? false : true,
    secure: process.env.SECURE === "true",
    path: "/",
    sameSite: "lax",
    noTimestamp: true,
    expires: null,
    domain: utils.isDevEnv() ? undefined : process.env.DOMAIN || ".dadix.net",
  });
  res.clearCookie("refreshToken", {
    httpOnly: utils.isDevEnv() ? false : true,
    secure: process.env.SECURE === "true",
    path: "/",
    sameSite: "lax",
    expires: null,
    noTimestamp: true,
    domain: utils.isDevEnv() ? undefined : process.env.DOMAIN || ".dadix.net",
  });
  return res.status(200).json({ message: "Logged out successfully" });
};

module.exports = {
  login,
  signup,
  logout,
};
