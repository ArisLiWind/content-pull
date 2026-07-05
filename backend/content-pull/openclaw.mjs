import { CONTENT_PULL_BACKEND } from "./config.mjs";
import { getLocalAgentStatus } from "./local-agent.mjs";
import { callMcpTool, checkMcpRuntime } from "./mcp.mjs";

export async function checkOpenClawRuntime({ timeoutMs = 3500 } = {}) {
  if (!CONTENT_PULL_BACKEND.openclaw.remoteUrl) {
    return {
      ok: true,
      mode: "embedded",
      source: "content-pull-backend",
      mcp: checkMcpRuntime(),
      localAgent: getLocalAgentStatus(),
      remote: {
        configured: false,
        note: "Set OPENCLAW_REMOTE_URL only when deploying a separate OpenClaw cloud backend."
      }
    };
  }

  const remoteUrl = normalizeUrl(CONTENT_PULL_BACKEND.openclaw.remoteUrl);
  const gateway = await fetchWithTimeout(remoteUrl, { method: "GET" }, timeoutMs);
  const chat = await fetchWithTimeout(
    `${remoteUrl}/v1/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CONTENT_PULL_BACKEND.openclaw.model,
        messages: [{ role: "user", content: "Content Pull health check. Reply OK." }],
        stream: false
      })
    },
    timeoutMs
  );

  return {
    mode: "remote",
    remoteUrl,
    gateway,
    chat,
    ok: gateway.ok && chat.ok
  };
}

export async function askOpenClaw(message, { timeoutMs = 30000 } = {}) {
  if (!CONTENT_PULL_BACKEND.openclaw.remoteUrl) {
    const response = await callMcpTool("content.research", { query: message });
    return {
      ok: response.ok,
      status: response.ok ? 200 : 500,
      text: response.content?.map((item) => item.text || JSON.stringify(item.json || "")).join("\n") || "",
      data: response
    };
  }

  const gatewayUrl = normalizeUrl(CONTENT_PULL_BACKEND.openclaw.remoteUrl);
  const response = await fetchWithTimeout(
    `${gatewayUrl}/v1/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CONTENT_PULL_BACKEND.openclaw.model,
        messages: [
          {
            role: "system",
            content: "You are Content Pull's OpenClaw-powered backend research agent."
          },
          {
            role: "user",
            content: message
          }
        ],
        stream: false
      })
    },
    timeoutMs
  );

  if (!response.ok) return response;
  return {
    ...response,
    text: response.data?.choices?.[0]?.message?.content || response.data?.response || ""
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return {
      ok: response.status < 500,
      status: response.status,
      data
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.name === "AbortError" ? "Request timed out." : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}
