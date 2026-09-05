const APIServices = require("../../services/API");

const getProjectAPIKey = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  let { projectId } = req.query || {};
  if (!projectId) {
    return res.status(400).json({ message1: "Invalid request" });
  }

  const APIKey = await APIServices.getOrCreateAPIKey({ projectId: projectId });
  if (!APIKey) {
    return res
      .status(404)
      .json({ message: "Project doesn't have any API keys" });
  }
  if (APIKey?.error) {
    return res.status(APIKey.errorCode).json({ message: APIKey.errorMessage });
  }
  return res.status(200).json({ APIKey: APIKey });
};

module.exports = { getProjectAPIKey };
