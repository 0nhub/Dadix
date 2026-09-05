const { sequelize } = require("../../config/database");
const User = require("../../models/User");
const authUtils = require("../../utils/auth");
const projectServices = require("../Project");

const create = async ({ email, password, username }) => {
  if (!username) {
    const userNameSufix = `00${(await User.count()) + 1}`;
    username = `${authUtils.generateRandomUserName()}${userNameSufix}`;
  }
  const hashedPassword = await authUtils.hashPassword({ password: password });
  return await User.create({
    email: email?.toLowerCase(),
    password: hashedPassword,
    username: username,
  });
};

const update = async ({
  id,
  fieldData,
  providedPassword = undefined,
  userHashedPassword = undefined,
}) => {
  try {
    if (!id || !fieldData)
      return {
        error: true,
        errorCode: 400,
        errorMessage: "Bad request",
      };
    const allowedFieldsToUpate = ["username", "email", "password"];
    const allowedFieldsToUpdateWithPassword = ["password"]; // user need to enter old password to change these fields.
    const fieldToUpdate = Object.keys(fieldData)[0];
    if (allowedFieldsToUpdateWithPassword.indexOf(fieldToUpdate) >= 0) {
      // if updating a field that need password check
      if (!providedPassword)
        // if no password provided
        return {
          error: true,
          errorCode: 400,
          errorMessage: "Bad request",
        };
      if (!userHashedPassword) {
        // if user hashed password is not provided, get it from database
        const user = await User.findByPk(id, {
          raw: true,
        });
        if (!user)
          return {
            error: true,
            errorCode: 404,
            errorMessage: "User not found",
          };
        userHashedPassword = user.password;
      }
      // check if password correct
      const isPasswordCorrect = await authUtils.checkPassword({
        password: providedPassword,
        hashedPassword: userHashedPassword,
      });
      if (!isPasswordCorrect) {
        return {
          error: true,
          errorCode: 403,
          errorMessage: "Forbidden",
        };
      }
    }
    if (allowedFieldsToUpate.indexOf(fieldToUpdate) < 0)
      // check if user allowed to update provided field
      return {
        error: true,
        errorCode: 403,
        errorMessage: "Forbidden",
      };
    if (fieldToUpdate === "email") {
      // check if email allready exist
      const isEmailExist = await User.findOne({
        where: { email: fieldData.email },
      });
      if (isEmailExist) {
        return {
          error: true,
          errorCode: 409,
          errorMessage: "Email allready exist",
        };
      }
    }
    if (fieldToUpdate === "username") {
      // check if user name allready exist
      const isUserNameExist = await User.findOne({
        where: { username: fieldData.username },
      });
      if (isUserNameExist) {
        return {
          error: true,
          errorCode: 409,
          errorMessage: "User name allready exist",
        };
      }
    }
    if (fieldToUpdate === "password") {
      fieldData["password"] = await authUtils.hashPassword({
        password: fieldData["password"],
      });
    }
    const updateUserResult = await User.update(fieldData, {
      where: {
        id: id,
      },
    });
    return updateUserResult;
  } catch (err) {
    console.error(err);
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : "Server error",
    };
  }
};

const deleteUser = async ({ id, password, hashedPassword }) => {
  const transaction = await sequelize.transaction();
  try {
    // check if password correct
    const isPasswordCorrect = await authUtils.checkPassword({
      password: password,
      hashedPassword: hashedPassword,
    });
    if (!isPasswordCorrect) {
      await transaction.rollback();
      return {
        error: true,
        errorCode: 403,
        errorMessage: "Forbidden",
      };
    }
    const deleteUserProjectsResult = await projectServices.removeAll({
      userId: id,
      externalTransaction: transaction,
    });
    const deleteUserResult = await User.destroy({
      where: { id: id },
      transaction: transaction,
    });
    await transaction.commit();
    return deleteUserResult;
  } catch (err) {
    console.error(err);
    await transaction.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : "Server error",
    };
  }
};

const getByEmail = async ({ email }) => {
  if (!email) {
    return null;
  }
  return await User.findOne({
    where: { email: email.toLowerCase() },
    raw: true,
  });
};

module.exports = {
  create,
  update,
  deleteUser,
  getByEmail,
};
