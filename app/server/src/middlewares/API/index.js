const APIServices = require("../../services/API");
const apiUtils = require("../../utils/api");

const requireAuth = async (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization) {
    return res.status(403).json({ message: "Forbidden" });
  }
  const bearerToken = authorization.split(" ");
  if (bearerToken[0] !== "Bearer" || bearerToken.length !== 2) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const encodedAPIKey = apiUtils.encodeAPIKey({ APIKey: bearerToken[1] });
  const findApiKeyResult = await APIServices.findAPIKey({
    value: encodedAPIKey,
  });
  if (findApiKeyResult?.error) {
    return res
      .status(findApiKeyResult.errorCode)
      .json({ message: findApiKeyResult.errorMessage });
  }
  if (!findApiKeyResult || !findApiKeyResult.active) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  req["apiKey"] = {
    ...findApiKeyResult,
    value: bearerToken[1],
  };

  next();
};

module.exports = {
  requireAuth,
};
