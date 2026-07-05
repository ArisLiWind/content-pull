import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTENT_PULL_BACKEND } from "./config.mjs";

const LOCAL_CONFIG_PATH = join(process.cwd(), ".content-pull.local.json");
const LEGACY_LOCAL_CONFIG_PATH = join(process.cwd(), ".viewpull.local.json");

let cachedConfig = null;

export async function loadLocalConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    const text = await readFile(LOCAL_CONFIG_PATH, "utf8");
    cachedConfig = JSON.parse(text);
  } catch {
    cachedConfig = await loadLegacyLocalConfig();
  }

  applyLocalConfig(cachedConfig);
  return cachedConfig;
}

async function loadLegacyLocalConfig() {
  try {
    const text = await readFile(LEGACY_LOCAL_CONFIG_PATH, "utf8");
    const legacyConfig = JSON.parse(text);
    await writeFile(LOCAL_CONFIG_PATH, `${JSON.stringify(legacyConfig, null, 2)}\n`, "utf8");
    return legacyConfig;
  } catch {
    return {};
  }
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

export async function savePublisherConnection(connection = {}) {
  const platform = String(connection.platform || "").trim();
  const webhookUrl = String(connection.webhookUrl || "").trim();
  if (!platform) return { ok: false, error: "platform is required" };
  if (!webhookUrl) return { ok: false, error: "webhookUrl is required" };

  const config = await loadLocalConfig();
  const publishers = {
    ...(config.publishers || {}),
    [platform]: {
      platform,
      name: String(connection.name || platform).trim(),
      webhookUrl,
      apiKey: String(connection.apiKey || "").trim(),
      updatedAt: new Date().toISOString()
    }
  };

  cachedConfig = {
    ...config,
    publishers
  };

  await writeFile(LOCAL_CONFIG_PATH, `${JSON.stringify(cachedConfig, null, 2)}\n`, "utf8");
  return { ok: true, connection: publicPublisherConnection(cachedConfig.publishers[platform]) };
}

export async function listPublisherConnections() {
  const config = await loadLocalConfig();
  return Object.values(config.publishers || {}).map(publicPublisherConnection);
}

export async function getPublisherConnection(platform) {
  const config = await loadLocalConfig();
  return config.publishers?.[platform] || null;
}

export function getDeepSeekApiKey() {
  return CONTENT_PULL_BACKEND.deepseek.apiKey;
}

export function publicLocalConfig() {
  return {
    hasDeepSeekApiKey: Boolean(CONTENT_PULL_BACKEND.deepseek.apiKey),
    localConfigPath: ".content-pull.local.json"
  };
}

function publicPublisherConnection(connection = {}) {
  return {
    platform: connection.platform,
    name: connection.name,
    webhookUrl: connection.webhookUrl,
    hasApiKey: Boolean(connection.apiKey),
    updatedAt: connection.updatedAt
  };
}

function applyLocalConfig(config) {
  const localKey = String(config?.deepseek?.apiKey || "").trim();
  if (localKey && !CONTENT_PULL_BACKEND.deepseek.apiKey) {
    CONTENT_PULL_BACKEND.deepseek.apiKey = localKey;
  }
}
