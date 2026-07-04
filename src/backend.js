const ACCOUNT_KEY = "viewpull-account-session";
const BACKEND_KEY = "viewpull-backend-config";

import { contentDatabase } from "./database.js";

export const DEFAULT_ACCOUNT_SESSION = {
  loggedIn: true,
  email: "azalearedn@gmail.com",
  name: "创作者",
  plan: "ViewPull Pro"
};

export const DEFAULT_BACKEND_CONFIG = {
  provider: "deepseek",
  apiBaseUrl: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-chat",
  openclawGatewayUrl: "",
  openclawApiKey: "",
  memoryNamespace: "viewpull-memory"
};

export function loadAccountSession() {
  return readJson(ACCOUNT_KEY, DEFAULT_ACCOUNT_SESSION);
}

export async function loadAccountSessionFromDatabase() {
  return contentDatabase.getKey(ACCOUNT_KEY, loadAccountSession());
}

export function saveAccountSession(session) {
  const nextSession = {
    ...DEFAULT_ACCOUNT_SESSION,
    ...session,
    email: String(session.email || DEFAULT_ACCOUNT_SESSION.email).trim()
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(nextSession));
  contentDatabase.setKey(ACCOUNT_KEY, nextSession);
  return nextSession;
}

export function clearAccountSession() {
  const session = {
    ...DEFAULT_ACCOUNT_SESSION,
    loggedIn: false,
    email: ""
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(session));
  contentDatabase.setKey(ACCOUNT_KEY, session);
  return session;
}

export function loadBackendConfig() {
  return normalizeBackendConfig(readJson(BACKEND_KEY, DEFAULT_BACKEND_CONFIG));
}

export async function loadBackendConfigFromDatabase() {
  return normalizeBackendConfig(await contentDatabase.getKey(BACKEND_KEY, loadBackendConfig()));
}

export function saveBackendConfig(config) {
  const nextConfig = normalizeBackendConfig(config);
  localStorage.setItem(BACKEND_KEY, JSON.stringify(nextConfig));
  contentDatabase.setKey(BACKEND_KEY, nextConfig);
  return nextConfig;
}

function normalizeBackendConfig(config = {}) {
  return {
    ...DEFAULT_BACKEND_CONFIG,
    apiKey: String(config.apiKey || "").trim()
  };
}

function readJson(key, fallback) {
  try {
    return {
      ...fallback,
      ...JSON.parse(localStorage.getItem(key) || "{}")
    };
  } catch {
    return fallback;
  }
}
