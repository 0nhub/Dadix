/**
 * Test script: OpenAI completion without server/DB.
 * Run: OPENAI_API_KEY=sk-... node scripts/test-ai-completion.js
 * Or: node scripts/test-ai-completion.js   (then paste key when prompted - not implemented, use env)
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const aiService = require("../src/services/AI");

const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
if (!apiKey) {
  console.error("Set OPENAI_API_KEY in .env or run: OPENAI_API_KEY=sk-... node scripts/test-ai-completion.js");
  process.exit(1);
}

async function main() {
  console.log("Testing AI completion (1 item)...");
  const items = [{ prompt: "What is the capital of Germany? Reply with only the city name.", outputType: "TEXT" }];
  try {
    const results = await aiService.completeBatch(items, {
      provider: "openai",
      apiKey,
      model: "gpt-4o-mini",
    });
    console.log("Result:", results);
    if (results && results[0]) {
      console.log("OK – OpenAI key works. Expected something like 'Berlin'.");
    } else {
      console.log("Unexpected empty result.");
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
