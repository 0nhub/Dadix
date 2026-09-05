const aiService = require("../../services/AI");

const completeBatch = async (req, res) => {
  const isDev = process.env.NODE_ENV !== "production";
  const userId = req.user?.id;
  if (!userId && !isDev) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { items, provider, apiKey, model } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items array required" });
  }
  if (!apiKey || typeof apiKey !== "string") {
    return res.status(400).json({ message: "apiKey required" });
  }

  try {
    const results = await aiService.completeBatch(items, {
      provider: provider || "openai",
      apiKey,
      model,
    });
    return res.status(200).json({ results });
  } catch (err) {
    console.error("AI completeBatch error:", err);
    return res
      .status(500)
      .json({ message: err?.message || "AI completion failed" });
  }
};

module.exports = { completeBatch };
