const ACCOUNT_KEY = "content-pull-account-session";
const BACKEND_KEY = "content-pull-backend-config";

import { contentDatabase } from "./database.js";

export const DEFAULT_ACCOUNT_SESSION = {
  loggedIn: true,
  email: "azalearedn@gmail.com",
  name: "创作者",
  plan: "Content Pull Pro"
};

export const DEFAULT_BACKEND_CONFIG = {
  provider: "deepseek",
  apiBaseUrl: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-chat",
  openclawGatewayUrl: "",
  openclawApiKey: "",
  memoryNamespace: "content-pull-memory"
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

export async function syncDeepSeekApiKeyToBackend(apiKey) {
  const trimmedApiKey = String(apiKey || "").trim();
  if (!trimmedApiKey) return { ok: false, error: "apiKey is required" };

  try {
    const response = await fetch("http://127.0.0.1:8788/config/deepseek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: trimmedApiKey })
    });
    const payload = await response.json();
    return response.ok ? payload : { ok: false, error: payload.error || `Backend config failed: ${response.status}` };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function loadLocalAgentPanelData() {
  const [status, approvals, audit] = await Promise.all([
    backendJson("/local-agent/status"),
    backendJson("/local-agent/approvals"),
    backendJson("/local-agent/audit")
  ]);

  return {
    status: status.ok === false ? null : status,
    approvals: approvals.approvals || [],
    audit: audit.events || [],
    error: status.ok === false ? status.error : ""
  };
}

export async function loadPublisherConnections() {
  const result = await backendJson("/config/publishers");
  return result.ok === false ? result : { ok: true, connections: result.connections || [] };
}

export async function savePublisherConnection(connection) {
  return backendJson("/config/publishers", {
    method: "POST",
    body: connection
  });
}

export async function approveLocalAgentRequest(id) {
  return backendJson("/local-agent/approvals/approve", {
    method: "POST",
    body: { id }
  });
}

export async function rejectLocalAgentRequest(id) {
  return backendJson("/local-agent/approvals/reject", {
    method: "POST",
    body: { id }
  });
}

export async function callLocalAgentTool(tool, input = {}, approvalId = "") {
  return backendJson("/local-agent/tools/call", {
    method: "POST",
    body: { tool, input, approvalId }
  });
}

async function backendJson(path, options = {}) {
  try {
    const response = await fetch(`http://127.0.0.1:8788${path}`, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json" },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    const payload = await response.json();
    return response.ok ? payload : { ok: false, error: payload.error || `Backend request failed: ${response.status}` };
  } catch (error) {
    return { ok: false, error: error.message };
  }
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
