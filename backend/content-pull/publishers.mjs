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
        required: platform === "wechat" ? ["platform", "appId/appSecret or accessToken", "thumbMediaId"] : ["platform", "webhookUrl"],
        optional: platform === "wechat" ? ["name", "author", "contentSourceUrl", "autoPublish", "webhookUrl"] : ["name", "apiKey"]
      }
    };
  }

  if (platform === "wechat" && hasWechatOfficialConfig(connection)) {
    return publishToWechatOfficialAccount(connection, content, metadata);
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

async function publishToWechatOfficialAccount(connection, content = {}, metadata = {}) {
  if (!connection.thumbMediaId) {
    return {
      ok: false,
      platform: "wechat",
      status: "requires_connection",
      error: "WeChat Official Account publishing requires thumbMediaId for the article cover image.",
      setup: {
        endpoint: "POST /config/publishers",
        required: ["platform=wechat", "appId/appSecret or accessToken", "thumbMediaId"],
        optional: ["author", "contentSourceUrl", "autoPublish"]
      }
    };
  }

  const tokenResult = await getWechatAccessToken(connection);
  if (!tokenResult.ok) return tokenResult;

  const article = {
    title: String(content.title || metadata.title || "Content Pull Draft").slice(0, 64),
    author: String(metadata.author || connection.author || "Content Pull").slice(0, 8),
    digest: String(metadata.digest || buildDigest(content)).slice(0, 120),
    content: normalizeWechatHtml(content),
    content_source_url: String(metadata.contentSourceUrl || connection.contentSourceUrl || ""),
    thumb_media_id: connection.thumbMediaId,
    need_open_comment: Number(Boolean(metadata.needOpenComment)),
    only_fans_can_comment: Number(Boolean(metadata.onlyFansCanComment))
  };

  const draft = await wechatJson("https://api.weixin.qq.com/cgi-bin/draft/add", tokenResult.accessToken, {
    articles: [article]
  });

  if (!draft.ok) return draft;

  if (!connection.autoPublish && !metadata.autoPublish) {
    return {
      ok: true,
      platform: "wechat",
      status: "draft_created",
      externalId: draft.data.media_id,
      response: draft.data
    };
  }

  const submitted = await wechatJson("https://api.weixin.qq.com/cgi-bin/freepublish/submit", tokenResult.accessToken, {
    media_id: draft.data.media_id
  });

  if (!submitted.ok) return submitted;

  return {
    ok: true,
    platform: "wechat",
    status: "publish_submitted",
    externalId: draft.data.media_id,
    publishId: submitted.data.publish_id,
    response: {
      draft: draft.data,
      publish: submitted.data
    }
  };
}

function hasWechatOfficialConfig(connection = {}) {
  return Boolean(connection.accessToken || (connection.appId && connection.appSecret));
}

async function getWechatAccessToken(connection) {
  if (connection.accessToken) return { ok: true, accessToken: connection.accessToken };

  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", connection.appId);
  url.searchParams.set("secret", connection.appSecret);

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || data.errcode) {
      return wechatError("token", data, response.status);
    }
    return { ok: true, accessToken: data.access_token, expiresIn: data.expires_in };
  } catch (error) {
    return {
      ok: false,
      platform: "wechat",
      status: "failed",
      error: `WeChat access token request failed: ${error.message}`
    };
  }
}

async function wechatJson(endpoint, accessToken, body) {
  try {
    const url = new URL(endpoint);
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok || data.errcode) {
      return wechatError(endpoint, data, response.status);
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      platform: "wechat",
      status: "failed",
      error: `WeChat API request failed: ${error.message}`
    };
  }
}

function wechatError(stage, data = {}, status = 0) {
  return {
    ok: false,
    platform: "wechat",
    status: "failed",
    error: `WeChat ${stage} failed: ${data.errmsg || `HTTP ${status}`}`,
    response: data
  };
}

function normalizeWechatHtml(content = {}) {
  if (content.html) return String(content.html);
  return markdownToHtml(String(content.markdown || ""));
}

function markdownToHtml(markdown) {
  return String(markdown || "")
    .split(/\n{2,}/)
    .map((block) => {
      const text = block.trim();
      if (!text) return "";
      if (/^#\s+/.test(text)) return `<h1>${escapeHtml(text.replace(/^#\s+/, ""))}</h1>`;
      if (/^##\s+/.test(text)) return `<h2>${escapeHtml(text.replace(/^##\s+/, ""))}</h2>`;
      if (/^-\s+/m.test(text)) {
        const items = text.split(/\n/).map((line) => line.replace(/^-\s+/, "").trim()).filter(Boolean);
        return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
      }
      return `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}

function buildDigest(content = {}) {
  return String(content.markdown || content.html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>`-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
