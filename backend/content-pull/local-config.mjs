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
  if (!webhookUrl && platform !== "wechat") return { ok: false, error: "webhookUrl is required" };

  const config = await loadLocalConfig();
  const currentConnection = config.publishers?.[platform] || {};
  const publishers = {
    ...(config.publishers || {}),
    [platform]: {
      platform,
      name: keepExisting(connection.name, currentConnection.name, platform),
      webhookUrl: keepExisting(connection.webhookUrl, currentConnection.webhookUrl, ""),
      apiKey: keepExisting(connection.apiKey, currentConnection.apiKey, ""),
      appId: keepExisting(connection.appId, currentConnection.appId, ""),
      appSecret: keepExisting(connection.appSecret, currentConnection.appSecret, ""),
      accessToken: keepExisting(connection.accessToken, currentConnection.accessToken, ""),
      thumbMediaId: keepExisting(connection.thumbMediaId, currentConnection.thumbMediaId, ""),
      author: keepExisting(connection.author, currentConnection.author, ""),
      contentSourceUrl: keepExisting(connection.contentSourceUrl, currentConnection.contentSourceUrl, ""),
      autoPublish: Boolean(connection.autoPublish),
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
    hasWechatApp: Boolean(connection.appId && connection.appSecret),
    hasWechatAccessToken: Boolean(connection.accessToken),
    hasThumbMediaId: Boolean(connection.thumbMediaId),
    autoPublish: Boolean(connection.autoPublish),
    updatedAt: connection.updatedAt
  };
}

function applyLocalConfig(config) {
  const localKey = String(config?.deepseek?.apiKey || "").trim();
  if (localKey && !CONTENT_PULL_BACKEND.deepseek.apiKey) {
    CONTENT_PULL_BACKEND.deepseek.apiKey = localKey;
  }
}

function keepExisting(nextValue, currentValue, fallback = "") {
  const next = String(nextValue || "").trim();
  if (next) return next;
  return String(currentValue || fallback || "").trim();
}
