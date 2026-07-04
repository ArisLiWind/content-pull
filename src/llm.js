export class ModelClient {
  constructor(config = {}) {
    this.config = config;
  }

  get configured() {
    return Boolean(this.config.apiKey && this.config.provider !== "local");
  }

  get providerLabel() {
    const labels = {
      deepseek: "DeepSeek",
      openai: "OpenAI Compatible",
      openclaw: "OpenClaw",
      local: "Local Mock"
    };
    return labels[this.config.provider] || this.config.provider || "Local Mock";
  }

  async chat({ system, messages, temperature = 0.7 }) {
    if (!this.configured) {
      return {
        ok: false,
        provider: this.providerLabel,
        error: "Model API is not configured."
      };
    }

    if (this.config.provider === "deepseek") {
      const proxied = await this.chatViaViewPullBackend({ system, messages, temperature });
      if (proxied.ok || proxied.error !== "ViewPull backend is unavailable.") return proxied;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const url = `${normalizeBaseUrl(this.config.apiBaseUrl)}/chat/completions`;
    let response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.model,
          temperature,
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            ...messages
          ]
        })
      });
    } catch (error) {
      clearTimeout(timeout);
      return {
        ok: false,
        provider: this.providerLabel,
        error: error.name === "AbortError" ? "Model API timed out." : error.message
      };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return {
        ok: false,
        provider: this.providerLabel,
        error: `Model API failed: ${response.status}`
      };
    }

    const data = await response.json();
    return {
      ok: true,
      provider: this.providerLabel,
      text: data.choices?.[0]?.message?.content || ""
    };
  }

  async chatViaViewPullBackend({ system, messages, temperature }) {
    const backendUrl = "http://127.0.0.1:8788/deepseek/chat";
    const payloadMessages = [
      ...(system ? [{ role: "system", content: system }] : []),
      ...messages
    ];

    try {
      const response = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-deepseek-api-key": this.config.apiKey
        },
        body: JSON.stringify({
          temperature,
          messages: payloadMessages
        })
      });

      if (!response.ok) {
        const payload = await safeJson(response);
        return {
          ok: false,
          provider: this.providerLabel,
          error: payload.error || `ViewPull backend failed: ${response.status}`
        };
      }

      const payload = await response.json();
      return {
        ok: true,
        provider: this.providerLabel,
        text: payload.text || ""
      };
    } catch {
      return {
        ok: false,
        provider: this.providerLabel,
        error: "ViewPull backend is unavailable."
      };
    }
  }
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "") || "https://api.deepseek.com";
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
