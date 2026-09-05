/**
 * AI completion service: calls OpenAI / Anthropic for batch completion.
 * Each item has { prompt, outputType }; returns array of parsed values (string, number, date, boolean).
 */

const OpenAI = require("openai");
const Anthropic = require("@anthropic-ai/sdk");

const OUTPUT_TYPES = ["TEXT", "INTEGER", "DATE", "BOOLEAN"];

function parseOutput(raw, outputType) {
  const s = (raw || "").trim();
  if (outputType === "TEXT") return s || "";
  if (outputType === "INTEGER") {
    const n = Number(s);
    return Number.isNaN(n) ? "" : String(Math.floor(n));
  }
  if (outputType === "BOOLEAN") {
    const lower = s.toLowerCase();
    if (["yes", "true", "1", "ja", "oui"].includes(lower)) return "true";
    if (["no", "false", "0", "nein", "non"].includes(lower)) return "false";
    return s ? "true" : "";
  }
  if (outputType === "DATE") return s || "";
  return s;
}

async function completeWithOpenAI(items, apiKey, model = "gpt-4o-mini") {
  const openai = new OpenAI({ apiKey });
  const results = [];

  for (let i = 0; i < items.length; i++) {
    const { prompt, outputType } = items[i];
    const ot = OUTPUT_TYPES.includes(outputType) ? outputType : "TEXT";
    try {
      const completion = await openai.chat.completions.create({
        model: model || "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content:
              prompt +
              (ot !== "TEXT"
                ? `\n\nReply with only the value, no explanation. Type: ${ot}.`
                : ""),
          },
        ],
        max_tokens: 500,
      });
      const raw =
        completion?.choices?.[0]?.message?.content?.trim() ?? "";
      results.push(parseOutput(raw, ot));
    } catch (err) {
      console.error("AI complete item error:", err?.message || err);
      // Rethrow so caller can return 500 with message (e.g. invalid API key)
      throw err;
    }
  }

  return results;
}

async function completeWithAnthropic(items, apiKey, model = "claude-3-5-sonnet-20240620") {
  const anthropic = new Anthropic({ apiKey });
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const { prompt, outputType } = items[i];
    const ot = OUTPUT_TYPES.includes(outputType) ? outputType : "TEXT";
    try {
      const msg = await anthropic.messages.create({
        model: model || "claude-3-5-sonnet-20240620",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content:
              prompt +
              (ot !== "TEXT"
                ? `\n\nReply with only the value, no explanation. Type: ${ot}.`
                : ""),
          },
        ],
      });
      const raw =
        msg?.content?.[0]?.type === "text" ? msg.content[0].text.trim() : "";
      results.push(parseOutput(raw, ot));
    } catch (err) {
      console.error("Anthropic complete item error:", err?.message || err);
      throw err;
    }
  }
  return results;
}

/**
 * Run batch completion. Supports openai and anthropic.
 * @param {Array<{ prompt: string, outputType: string }>} items
 * @param {{ provider: string, apiKey: string, model?: string }} config
 * @returns {Promise<string[]>}
 */
async function completeBatch(items, config) {
  if (!items?.length) return [];
  const { provider, apiKey, model } = config || {};
  if (!apiKey) throw new Error("API key required");
  const p = (provider || "openai").toLowerCase();
  if (p === "openai") {
    return completeWithOpenAI(items, apiKey, model);
  }
  if (p === "anthropic") {
    return completeWithAnthropic(items, apiKey, model);
  }
  throw new Error("Unsupported provider: " + provider);
}

module.exports = { completeBatch, parseOutput };
