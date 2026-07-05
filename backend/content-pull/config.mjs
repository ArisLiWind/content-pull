export const CONTENT_PULL_BACKEND = {
  host: process.env.CONTENT_PULL_BACKEND_HOST || "127.0.0.1",
  port: Number(process.env.CONTENT_PULL_BACKEND_PORT || 8788),
  deepseek: {
    apiBaseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.CONTENT_PULL_DEEPSEEK_API_KEY || ""
  },
  openclaw: {
    mode: process.env.OPENCLAW_REMOTE_URL ? "remote" : "embedded",
    remoteUrl: process.env.OPENCLAW_REMOTE_URL || "",
    model: "openclaw",
    mcpEndpoint: "/mcp"
  },
  memory: {
    namespace: "content-pull-memory"
  }
};

export function publicBackendConfig() {
  return {
    apiBaseUrl: CONTENT_PULL_BACKEND.deepseek.apiBaseUrl,
    model: CONTENT_PULL_BACKEND.deepseek.model,
    openclawMode: CONTENT_PULL_BACKEND.openclaw.mode,
    openclawRemoteConfigured: Boolean(CONTENT_PULL_BACKEND.openclaw.remoteUrl),
    mcpEndpoint: CONTENT_PULL_BACKEND.openclaw.mcpEndpoint,
    memoryNamespace: CONTENT_PULL_BACKEND.memory.namespace,
    hasDeepSeekApiKey: Boolean(CONTENT_PULL_BACKEND.deepseek.apiKey)
  };
}

export function assertDeepSeekApiKey() {
  if (!CONTENT_PULL_BACKEND.deepseek.apiKey) {
    return {
      ok: false,
      error: "DeepSeek API Key is missing. Set DEEPSEEK_API_KEY before starting the backend, or paste the key in Content Pull settings."
    };
  }
  return { ok: true };
}
