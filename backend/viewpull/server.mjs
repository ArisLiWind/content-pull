import { VIEWPULL_BACKEND, publicBackendConfig } from "./config.mjs";
import { callDeepSeek } from "./deepseek.mjs";
import { handleMcpJsonRpc } from "./mcp.mjs";
import { askOpenClaw, checkOpenClawRuntime } from "./openclaw.mjs";

const server = globalThis.Bun
  ? null
  : await import("node:http").then(({ createServer }) =>
      createServer(async (request, response) => {
        await route(request, response);
      })
    );

if (!server) {
  throw new Error("ViewPull backend currently expects the Node.js runtime.");
}

server.listen(VIEWPULL_BACKEND.port, VIEWPULL_BACKEND.host, () => {
  console.log(`ViewPull backend listening on http://${VIEWPULL_BACKEND.host}:${VIEWPULL_BACKEND.port}`);
  if (!VIEWPULL_BACKEND.deepseek.apiKey) {
    console.log("DeepSeek API Key missing. Set DEEPSEEK_API_KEY before starting the backend.");
  }
});

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    return sendJson(response, 204, {});
  }

  if (request.method === "GET" && url.pathname === "/health") {
    const openclaw = await checkOpenClawRuntime();
    return sendJson(response, 200, {
      ok: true,
      service: "viewpull-backend",
      config: publicBackendConfig(),
      requirements: {
        needsDeepSeekApiKey: !VIEWPULL_BACKEND.deepseek.apiKey,
        needsOpenClawCloudDeploy: false
      },
      openclaw
    });
  }

  if (request.method === "GET" && url.pathname === "/openclaw/status") {
    return sendJson(response, 200, await checkOpenClawRuntime());
  }

  if (request.method === "POST" && url.pathname === "/mcp") {
    return sendJson(response, 200, await handleMcpJsonRpc(await readJson(request)));
  }

  if (request.method === "POST" && url.pathname === "/deepseek/test") {
    const requestApiKey = request.headers["x-deepseek-api-key"];
    const result = await callDeepSeek([
      {
        role: "system",
        content: "You are a concise health-check assistant."
      },
      {
        role: "user",
        content: "Reply in Chinese with one short sentence confirming DeepSeek is connected to ViewPull."
      }
    ], { apiKey: requestApiKey });
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  if (request.method === "POST" && url.pathname === "/deepseek/chat") {
    const body = await readJson(request);
    const requestApiKey = request.headers["x-deepseek-api-key"] || body.apiKey;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return sendJson(response, 400, { ok: false, error: "messages are required" });

    const result = await callDeepSeek(messages, {
      apiKey: requestApiKey,
      temperature: Number.isFinite(body.temperature) ? body.temperature : 0.7
    });
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  if (request.method === "POST" && url.pathname === "/agent/research") {
    const body = await readJson(request);
    const requestApiKey = request.headers["x-deepseek-api-key"] || body.apiKey;
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
        content: "You are ViewPull's backend research agent. Give concise, source-aware planning notes."
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

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(status === 204 ? "" : JSON.stringify(payload, null, 2));
}
