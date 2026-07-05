import { getPublisherConnection } from "./local-config.mjs";

export async function publishToExternalApp(platform, content = {}, metadata = {}) {
  const connection = await getPublisherConnection(platform);
  if (!connection) {
    return {
      ok: false,
      platform,
      status: "requires_connection",
      error: `No external app connection configured for ${platform}.`,
      setup: {
        endpoint: "POST /config/publishers",
        required: ["platform", "webhookUrl"],
        optional: ["name", "apiKey"]
      }
    };
  }

  const payload = {
    platform,
    content,
    metadata,
    source: "content-pull",
    requestedAt: new Date().toISOString()
  };

  const response = await postPublisherWebhook(connection, payload);
  if (!response.ok) {
    return {
      ok: false,
      platform,
      status: "failed",
      error: response.error || `Publisher webhook failed with ${response.status}`,
      response
    };
  }

  return {
    ok: true,
    platform,
    status: response.data?.status || "published",
    url: response.data?.url || response.data?.draftUrl || "",
    externalId: response.data?.id || response.data?.externalId || "",
    response: response.data
  };
}

async function postPublisherWebhook(connection, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(connection.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {})
      },
      signal: controller.signal,
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { text };
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.name === "AbortError" ? "Publisher webhook timed out." : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}
