export class OpenClawGateway {
  constructor(config = {}, { timeoutMs = 3500 } = {}) {
    this.config = config;
    this.timeoutMs = timeoutMs;
  }

  get enabled() {
    return Boolean(this.config.openclawGatewayUrl);
  }

  async callTool(toolName, input = {}) {
    if (!this.enabled) {
      return {
        ok: false,
        error: "OpenClaw Gateway is not configured."
      };
    }

    try {
      const response = await this.fetchJson("/tools/call", {
        tool: toolName,
        input
      });
      return response;
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async chat(message, { sessionId = "viewpull-research" } = {}) {
    if (!this.enabled) {
      return { ok: false, error: "OpenClaw Gateway is not configured." };
    }

    try {
      const response = await this.fetchJson("/v1/chat/completions", {
        model: "openclaw",
        messages: [
          {
            role: "system",
            content: "You are ViewPull's backend research agent. Return concise, source-aware notes for content drafting."
          },
          {
            role: "user",
            content: message
          }
        ],
        metadata: {
          session_id: sessionId
        },
        stream: false
      });

      if (!response.ok) return response;
      return {
        ok: true,
        data: response.data,
        text: extractText(response.data)
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async fetchJson(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${normalizeGatewayUrl(this.config.openclawGatewayUrl)}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.openclawApiKey ? { Authorization: `Bearer ${this.config.openclawApiKey}` } : {})
        },
        signal: controller.signal,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `OpenClaw Gateway request failed: ${response.status}`
        };
      }

      return {
        ok: true,
        data: await response.json()
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeGatewayUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function extractText(data) {
  const choiceText = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text;
  if (choiceText) return String(choiceText).trim();
  return String(data?.response || data?.text || data?.message || "").trim();
}
