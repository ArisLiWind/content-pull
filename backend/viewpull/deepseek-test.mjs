import { VIEWPULL_BACKEND, assertDeepSeekApiKey } from "./config.mjs";
import { callDeepSeek } from "./deepseek.mjs";

const apiKeyCheck = assertDeepSeekApiKey();

if (!apiKeyCheck.ok) {
  console.log("FAIL DeepSeek API Key is missing.");
  console.log("Set it locally before testing:");
  console.log("  export DEEPSEEK_API_KEY=your_deepseek_key");
  process.exit(1);
}

const result = await callDeepSeek([
  {
    role: "system",
    content: "You are a concise health-check assistant."
  },
  {
    role: "user",
    content: "Reply in Chinese with one short sentence confirming DeepSeek is connected to ViewPull."
  }
]);

if (!result.ok) {
  console.log(`FAIL ${result.error}`);
  process.exit(1);
}

console.log(`OK DeepSeek responded with ${VIEWPULL_BACKEND.deepseek.model}.`);
console.log(maskText(result.text));

function maskText(value) {
  return String(value || "").trim().slice(0, 300);
}
