import { pathToFileURL } from "node:url";
import { CONTENT_PULL_BACKEND, publicBackendConfig } from "./config.mjs";
import { callDeepSeek } from "./deepseek.mjs";
import { listPublisherConnections, loadLocalConfig, publicLocalConfig, saveDeepSeekApiKey, savePublisherConnection } from "./local-config.mjs";
import { approveRequest, callLocalAgentTool, getLocalAgentStatus, listApprovals, listAuditLog, listLocalAgentTools, rejectRequest, requestApproval } from "./local-agent.mjs";
import { callMcpTool, handleMcpJsonRpc, listMcpTools } from "./mcp.mjs";
import { askOpenClaw, checkOpenClawRuntime } from "./openclaw.mjs";
import { publishToExternalApp } from "./publishers.mjs";
import { searchWeb } from "./search.mjs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "Authorization",
    "X-DeepSeek-API-Key",
    "x-deepseek-api-key"
  ].join(", "),
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

const server = globalThis.Bun
  ? null
  : await import("node:http").then(({ createServer }) =>
      createServer(async (request, response) => {
        await route(request, response);
      })
    );

await loadLocalConfig();

if (!server) {
  throw new Error("Content Pull backend currently expects the Node.js runtime.");
}

if (isMainModule()) {
  server.listen(CONTENT_PULL_BACKEND.port, CONTENT_PULL_BACKEND.host, () => {
    console.log(`Content Pull backend listening on http://${CONTENT_PULL_BACKEND.host}:${CONTENT_PULL_BACKEND.port}`);
    if (!CONTENT_PULL_BACKEND.deepseek.apiKey) {
      console.log("DeepSeek API Key missing. Set DEEPSEEK_API_KEY before starting the backend.");
    }
  });
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    return sendJson(response, 204, {});
  }

  if (request.method === "GET" && url.pathname === "/health") {
    await loadLocalConfig();
    const openclaw = await checkOpenClawRuntime();
    return sendJson(response, 200, {
      ok: true,
      service: "content-pull-backend",
      config: publicBackendConfig(),
      localConfig: publicLocalConfig(),
      requirements: {
        needsDeepSeekApiKey: !CONTENT_PULL_BACKEND.deepseek.apiKey,
        needsOpenClawCloudDeploy: false
      },
      openclaw
    });
  }

  if (request.method === "GET" && url.pathname === "/openclaw/status") {
    return sendJson(response, 200, await checkOpenClawRuntime());
  }

  if (request.method === "GET" && url.pathname === "/local-agent/status") {
    return sendJson(response, 200, getLocalAgentStatus());
  }

  if (request.method === "GET" && url.pathname === "/local-agent/tools") {
    return sendJson(response, 200, {
      ok: true,
      tools: listLocalAgentTools()
    });
  }

  if (request.method === "GET" && url.pathname === "/local-agent/approvals") {
    return sendJson(response, 200, {
      ok: true,
      approvals: listApprovals()
    });
  }

  if (request.method === "POST" && url.pathname === "/local-agent/approvals") {
    const body = await readJson(request);
    return sendJson(response, 200, {
      ok: true,
      approval: requestApproval(body.tool, body.input || {}, body.reason || "")
    });
  }

  if (request.method === "POST" && url.pathname === "/local-agent/approvals/approve") {
    const result = approveRequest((await readJson(request)).id);
    return sendJson(response, result.ok ? 200 : 404, result);
  }

  if (request.method === "POST" && url.pathname === "/local-agent/approvals/reject") {
    const result = rejectRequest((await readJson(request)).id);
    return sendJson(response, result.ok ? 200 : 404, result);
  }

  if (request.method === "GET" && url.pathname === "/local-agent/audit") {
    return sendJson(response, 200, {
      ok: true,
      events: listAuditLog()
    });
  }

  if (request.method === "POST" && url.pathname === "/local-agent/tools/call") {
    const body = await readJson(request);
    const result = await callLocalAgentTool(body.tool || body.name, body.input || body.arguments || {}, {
      approvalId: body.approvalId
    });
    return sendJson(response, result.ok ? 200 : result.status === "requires_approval" ? 409 : 400, result);
  }

  if (request.method === "GET" && url.pathname === "/config/deepseek") {
    await loadLocalConfig();
    return sendJson(response, 200, {
      ok: true,
      ...publicLocalConfig()
    });
  }

  if (request.method === "POST" && url.pathname === "/config/deepseek") {
    const body = await readJson(request);
    const apiKey = String(body.apiKey || getRequestApiKey(request) || "").trim();
    if (!apiKey) return sendJson(response, 400, { ok: false, error: "apiKey is required" });

    return sendJson(response, 200, {
      ok: true,
      ...(await saveDeepSeekApiKey(apiKey))
    });
  }

  if (request.method === "GET" && url.pathname === "/config/publishers") {
    return sendJson(response, 200, {
      ok: true,
      connections: await listPublisherConnections()
    });
  }

  if (request.method === "POST" && url.pathname === "/config/publishers") {
    const result = await savePublisherConnection(await readJson(request));
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  if (request.method === "POST" && url.pathname === "/publish") {
    const body = await readJson(request);
    const platform = String(body.platform || "").trim();
    if (!platform) return sendJson(response, 400, { ok: false, error: "platform is required" });

    const result = await publishToExternalApp(platform, body.content || {}, body.metadata || {});
    return sendJson(response, result.ok ? 200 : result.status === "requires_connection" ? 409 : 400, result);
  }

  if (request.method === "POST" && url.pathname === "/search") {
    const body = await readJson(request);
    const result = await searchWeb(body.query, { limit: Number(body.limit) || 5 });
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  if (request.method === "POST" && url.pathname === "/mcp") {
    return sendJson(response, 200, await handleMcpJsonRpc(await readJson(request)));
  }

  if (request.method === "GET" && url.pathname === "/tools/list") {
    return sendJson(response, 200, {
      ok: true,
      tools: listMcpTools()
    });
  }

  if (request.method === "POST" && url.pathname === "/tools/call") {
    const body = await readJson(request);
    const result = await callMcpTool(body.tool || body.name, body.input || body.arguments || {});
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
    const body = await readJson(request);
    const requestApiKey = getRequestApiKey(request) || body.apiKey;
    const messages = normalizeMessages(body.messages);
    if (!messages.length) return sendJson(response, 400, { ok: false, error: "messages are required" });

    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    const openclaw = await checkOpenClawRuntime();
    const toolContext = await prepareOpenClawContext(lastUserMessage);
    const result = await callDeepSeek([
      {
        role: "system",
        content: buildAssistantSystemPrompt(openclaw, toolContext)
      },
      ...messages
    ], {
      apiKey: requestApiKey,
      temperature: Number.isFinite(body.temperature) ? body.temperature : 0.7
    });

    if (!result.ok) return sendJson(response, 400, result);
    return sendJson(response, 200, {
      id: `chatcmpl-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model || CONTENT_PULL_BACKEND.openclaw.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.text
          },
          finish_reason: "stop"
        }
      ],
      usage: result.usage || null,
      openclaw: {
        mode: openclaw.mode,
        source: openclaw.source || "remote",
        tools: openclaw.mcp?.tools || [],
        usedContext: Boolean(toolContext)
      }
    });
  }

  if (request.method === "POST" && url.pathname === "/deepseek/test") {
    const requestApiKey = getRequestApiKey(request);
    const result = await callDeepSeek([
      {
        role: "system",
        content: "You are a concise health-check assistant."
      },
      {
        role: "user",
        content: "Reply in Chinese with one short sentence confirming DeepSeek is connected to Content Pull."
      }
    ], { apiKey: requestApiKey });
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  if (request.method === "POST" && url.pathname === "/deepseek/chat") {
    const body = await readJson(request);
    const requestApiKey = getRequestApiKey(request) || body.apiKey;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return sendJson(response, 400, { ok: false, error: "messages are required" });

    const result = await callDeepSeek(messages, {
      apiKey: requestApiKey,
      temperature: Number.isFinite(body.temperature) ? body.temperature : 0.7
    });
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  if (request.method === "POST" && url.pathname === "/assistant/chat") {
    const body = await readJson(request);
    const requestApiKey = getRequestApiKey(request) || body.apiKey;
    const messages = normalizeMessages(body.messages);
    if (!messages.length) return sendJson(response, 400, { ok: false, error: "messages are required" });

    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    const openclaw = await checkOpenClawRuntime();
    const toolContext = await prepareOpenClawContext(lastUserMessage);
    const result = await callDeepSeek([
      {
        role: "system",
        content: buildAssistantSystemPrompt(openclaw, toolContext)
      },
      ...messages
    ], {
      apiKey: requestApiKey,
      temperature: Number.isFinite(body.temperature) ? body.temperature : 0.7
    });

    return sendJson(response, result.ok ? 200 : 400, {
      ...result,
      provider: result.ok ? "content-pull-assistant" : result.provider,
      openclaw: {
        mode: openclaw.mode,
        source: openclaw.source || "remote",
        tools: openclaw.mcp?.tools || [],
        usedContext: Boolean(toolContext)
      }
    });
  }

  if (request.method === "POST" && url.pathname === "/agent/research") {
    const body = await readJson(request);
    const requestApiKey = getRequestApiKey(request) || body.apiKey;
    const query = String(body.query || "").trim();
    if (!query) return sendJson(response, 400, { ok: false, error: "query is required" });

    const openclaw = await askOpenClaw(query);
    if (openclaw.ok && openclaw.text) {
      return sendJson(response, 200, {
        ok: true,
        provider: "openclaw",
        text: openclaw.text
      });
    }

    const deepseek = await callDeepSeek([
      {
        role: "system",
        content: "You are Content Pull's backend research agent. Give concise, source-aware planning notes."
      },
      {
        role: "user",
        content: query
      }
    ], { apiKey: requestApiKey });
    return sendJson(response, deepseek.ok ? 200 : 400, {
      ...deepseek,
      fallbackFromOpenClaw: true,
      openclawError: openclaw.error || `OpenClaw returned ${openclaw.status}`
    });
  }

  return sendJson(response, 404, { ok: false, error: "Not found" });
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function getRequestApiKey(request) {
  const explicitKey = request.headers["x-deepseek-api-key"];
  if (explicitKey) return explicitKey;

  const authorization = String(request.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => ["system", "user", "assistant"].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").trim()
    }))
    .filter((message) => message.content);
}

async function prepareOpenClawContext(message) {
  if (!shouldUseOpenClawContext(message)) return "";
  const result = await askOpenClaw(message);
  if (!result.ok || !result.text) return "";
  return result.text;
}

export function shouldUseOpenClawContext(message) {
  return /搜索|联网|查一下|帮我查|帮我找|检索|搜一下|搜集|浏览网页|打开网页|读取网页|访问网页|查找资料|找资料|web\s*search|search\s+web/i.test(message);
}

function isMainModule() {
  return Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
}

function buildAssistantSystemPrompt(openclaw, toolContext) {
  return [
    "你是 Content Pull，一个个人 AI 助手。你要直接和用户对话，而不是默认修改文章。",
    "你的回答应该自然、清楚、可执行。用户没有要求写长文时，不要自动生成文章草稿。",
    "当用户要求构思、策划、生成方案、写代码、改写文本或规划任务时，先基于已有上下文和模型能力直接构思，不要声称已经搜索。",
    "只有用户明确要求搜索、联网、查找资料、读取网页或浏览器操作时，才使用 OpenClaw/MCP/Chrome 搜索上下文。",
    "如果用户明确要求修改右侧文件或文章，你可以提醒用户使用下方“修改”输入框；但正常聊天必须直接回答。",
    `OpenClaw runtime: ${openclaw.mode || "unknown"}; MCP tools: ${(openclaw.mcp?.tools || []).join(", ") || "none"}.`,
    toolContext ? `OpenClaw context:\n${toolContext}` : ""
  ].filter(Boolean).join("\n\n");
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(status === 204 ? "" : JSON.stringify(payload, null, 2));
}
