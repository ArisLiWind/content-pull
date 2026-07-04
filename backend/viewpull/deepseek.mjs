import { VIEWPULL_BACKEND, assertDeepSeekApiKey } from "./config.mjs";
import { getDeepSeekApiKey, loadLocalConfig } from "./local-config.mjs";

export async function callDeepSeek(messages, { apiKey, temperature = 0.2, timeoutMs = 30000 } = {}) {
  await loadLocalConfig();
  const effectiveApiKey = String(apiKey || getDeepSeekApiKey() || VIEWPULL_BACKEND.deepseek.apiKey || "").trim();
  if (!effectiveApiKey) {
    return assertDeepSeekApiKey();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${VIEWPULL_BACKEND.deepseek.apiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${effectiveApiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: VIEWPULL_BACKEND.deepseek.model,
        temperature,
        messages
      })
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: getDeepSeekErrorMessage(response.status, data),
        detail: data
      };
    }

    return {
      ok: true,
      provider: "deepseek",
      model: VIEWPULL_BACKEND.deepseek.model,
      text: data.choices?.[0]?.message?.content || "",
      usage: data.usage || null
    };
  } catch (error) {
    return {
      ok: false,
      error: error.name === "AbortError" ? "DeepSeek API timed out." : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getDeepSeekErrorMessage(status, data) {
  const apiMessage = data?.error?.message || data?.message || "";
  if (apiMessage) return `DeepSeek API failed with ${status}: ${apiMessage}`;
  return `DeepSeek API failed with ${status}`;
}
