const userService = require("../../services/User");
const authUtils = require("../../utils/auth");
const utils = require("../../utils/utils");

const getUserInfo = async (req, res) => {
  if (req.user) {
    const userObjectHiddenFields = ["password", "updatedAt"];
    const filteredUserObject = {};
    Object.keys(req.user).map((key) => {
      if (userObjectHiddenFields.indexOf(key) < 0) {
        filteredUserObject[key] = req.user[key];
      }
      return null;
    });
    const payload = { user: filteredUserObject };
    const isDev =
      utils.isDevEnv() || process.env.NODE_ENV === "development";
    if (isDev && req.user.id) {
      const accessToken = authUtils.generateAccessToken({
        userId: req.user.id,
        res,
      });
      payload.accessToken = accessToken;
    }
    return res.status(200).json(payload);
  }
  return res.status(500).json({ message: "server error" });
};

const updateUserInfo = async (req, res) => {
  const user = req.user;
  if (!req.user) return res.status(401).json({ message: "Not authorized" });

  const { password, data } = req.body || {};
  if (!data) {
    return res.status(400).json({ message: "Bad request" });
  }

  const updateUserInfoResult = await userService.update({
    id: user.id,
    fieldData: data,
    providedPassword: password,
    userHashedPassword: user.password,
  });

  if (updateUserInfoResult?.error) {
    return res
      .status(updateUserInfoResult.errorCode)
      .json({ message: updateUserInfoResult.errorMessage });
  }

  return res.status(200).json({ message: "user updated successfully" });
};

const deleteUser = async (req, res) => {
  try {
    const user = req.user;
    if (!req.user) return res.status(401).json({ message: "Not authorized" });

    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ message: "Bad request" });
    }

    const deleteUserResult = userService.deleteUser({
      id: user.id,
      password,
      hashedPassword: user.password,
    });

    if (!deleteUserResult) {
      return res.status(500).json({ message: "Server error" });
    }

    if (deleteUserResult?.error) {
      return res
        .status(deleteUserResult.errorCode)
        .json({ message: deleteUserResult.errorMessage });
    }

    return res.status(200).json({ message: "user deleted successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getUserInfo,
  updateUserInfo,
  deleteUser,
};
