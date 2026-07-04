import { VIEWPULL_BACKEND, assertDeepSeekApiKey } from "./config.mjs";

export async function callDeepSeek(messages, { apiKey, temperature = 0.2, timeoutMs = 30000 } = {}) {
  const effectiveApiKey = String(apiKey || VIEWPULL_BACKEND.deepseek.apiKey || "").trim();
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

    if (!response.ok) {
      return {
        ok: false,
        error: `DeepSeek API failed with ${response.status}`
      };
    }

    const data = await response.json();
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
