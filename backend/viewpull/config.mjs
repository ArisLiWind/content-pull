export const VIEWPULL_BACKEND = {
  host: process.env.VIEWPULL_BACKEND_HOST || "127.0.0.1",
  port: Number(process.env.VIEWPULL_BACKEND_PORT || 8788),
  deepseek: {
    apiBaseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.VIEWPULL_DEEPSEEK_API_KEY || ""
  },
  openclaw: {
    mode: process.env.OPENCLAW_REMOTE_URL ? "remote" : "embedded",
    remoteUrl: process.env.OPENCLAW_REMOTE_URL || "",
    model: "openclaw",
    mcpEndpoint: "/mcp"
  },
  memory: {
    namespace: "viewpull-memory"
  }
};

export function publicBackendConfig() {
  return {
    apiBaseUrl: VIEWPULL_BACKEND.deepseek.apiBaseUrl,
    model: VIEWPULL_BACKEND.deepseek.model,
    openclawMode: VIEWPULL_BACKEND.openclaw.mode,
    openclawRemoteConfigured: Boolean(VIEWPULL_BACKEND.openclaw.remoteUrl),
    mcpEndpoint: VIEWPULL_BACKEND.openclaw.mcpEndpoint,
    memoryNamespace: VIEWPULL_BACKEND.memory.namespace,
    hasDeepSeekApiKey: Boolean(VIEWPULL_BACKEND.deepseek.apiKey)
  };
}

export function assertDeepSeekApiKey() {
  if (!VIEWPULL_BACKEND.deepseek.apiKey) {
    return {
      ok: false,
      error: "DeepSeek API Key is missing. Set DEEPSEEK_API_KEY before starting the backend, or paste the key in ViewPull settings."
    };
  }
  return { ok: true };
}
