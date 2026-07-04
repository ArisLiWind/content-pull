import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { VIEWPULL_BACKEND } from "./config.mjs";

const LOCAL_CONFIG_PATH = join(process.cwd(), ".viewpull.local.json");

let cachedConfig = null;

export async function loadLocalConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    const text = await readFile(LOCAL_CONFIG_PATH, "utf8");
    cachedConfig = JSON.parse(text);
  } catch {
    cachedConfig = {};
  }

  applyLocalConfig(cachedConfig);
  return cachedConfig;
}

export async function saveDeepSeekApiKey(apiKey) {
  const nextConfig = {
    ...(await loadLocalConfig()),
    deepseek: {
      apiKey: String(apiKey || "").trim(),
      updatedAt: new Date().toISOString()
    }
  };

  cachedConfig = nextConfig;
  applyLocalConfig(nextConfig);
  await writeFile(LOCAL_CONFIG_PATH, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  return publicLocalConfig();
}

export function getDeepSeekApiKey() {
  return VIEWPULL_BACKEND.deepseek.apiKey;
}

export function publicLocalConfig() {
  return {
    hasDeepSeekApiKey: Boolean(VIEWPULL_BACKEND.deepseek.apiKey),
    localConfigPath: ".viewpull.local.json"
  };
}

function applyLocalConfig(config) {
  const localKey = String(config?.deepseek?.apiKey || "").trim();
  if (localKey && !VIEWPULL_BACKEND.deepseek.apiKey) {
    VIEWPULL_BACKEND.deepseek.apiKey = localKey;
  }
}
