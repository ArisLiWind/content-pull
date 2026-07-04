import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { config, assertRuntimeConfig } from "./config.mjs";
import { createTask, getTask, updateTaskDraft } from "./db.mjs";
import { generateArticle, reviseArticle } from "./deepseek.mjs";

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error.message
    });
  }
});

server.listen(config.port, config.host, () => {
  const runtime = assertRuntimeConfig();
  console.log(`ViewPull Writing Agent listening on http://${config.host}:${config.port}`);
  if (!runtime.ok) {
    console.log(`Missing environment variables: ${runtime.missing.join(", ")}`);
  }
});

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    return sendJson(response, 204, {});
  }

  if (request.method === "POST" && url.pathname === "/task") {
    const body = await readJson(request);
    const input = String(body.input || "").trim();
    if (!input) return sendJson(response, 400, { ok: false, error: "input is required" });

    const id = randomUUID();
    const draft = await generateArticle(input);
    const conversation = [
      createMessage("user", input),
      createMessage("assistant", draft)
    ];
    const task = await createTask({ id, input, conversation, draft });
    return sendJson(response, 201, { ok: true, task });
  }

  const taskMatch = url.pathname.match(/^\/task\/([^/]+)$/);
  if (request.method === "GET" && taskMatch) {
    const task = await getTask(taskMatch[1]);
    if (!task) return sendJson(response, 404, { ok: false, error: "task not found" });
    return sendJson(response, 200, { ok: true, task });
  }

  const continueMatch = url.pathname.match(/^\/task\/([^/]+)\/continue$/);
  if (request.method === "POST" && continueMatch) {
    const task = await getTask(continueMatch[1]);
    if (!task) return sendJson(response, 404, { ok: false, error: "task not found" });

    const body = await readJson(request);
    const input = String(body.input || "").trim();
    if (!input) return sendJson(response, 400, { ok: false, error: "input is required" });

    const draft = await reviseArticle({
      currentDraft: task.updatedDraft || task.draft,
      instruction: input,
      conversation: task.conversation
    });
    const conversation = [
      ...task.conversation,
      createMessage("user", input),
      createMessage("assistant", draft)
    ];
    const updatedTask = await updateTaskDraft({ id: task.id, conversation, draft });
    return sendJson(response, 200, { ok: true, task: updatedTask });
  }

  return sendJson(response, 404, { ok: false, error: "not found" });
}

function createMessage(role, content) {
  return {
    role,
    content,
    at: new Date().toISOString()
  };
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

