import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspaceRoot = process.cwd();
const approvals = new Map();
const auditLog = [];
const chromeDebugBaseUrl = process.env.CONTENT_PULL_CHROME_CDP_URL || "http://127.0.0.1:9222";

const localTools = [
  {
    name: "local.permissions.status",
    description: "Inspect Content Pull Local Agent permission readiness.",
    risk: "low",
    requiresApproval: false,
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "local.browser.open",
    description: "Open a URL in the default browser.",
    risk: "medium",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "local.chrome.status",
    description: "Check whether Content Pull can reach a Chrome DevTools Protocol endpoint.",
    risk: "low",
    requiresApproval: false,
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "local.chrome.open_tab",
    description: "Open a new Chrome tab through Chrome DevTools Protocol.",
    risk: "medium",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "local.chrome.read_dom",
    description: "Read visible page text from a Chrome tab through Chrome DevTools Protocol.",
    risk: "medium",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        urlIncludes: { type: "string" }
      }
    }
  },
  {
    name: "local.chrome.click",
    description: "Click an element in Chrome by CSS selector through Chrome DevTools Protocol.",
    risk: "high",
    requiresApproval: true,
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        tabId: { type: "string" },
        urlIncludes: { type: "string" }
      },
      required: ["selector"]
    }
  },
  {
    name: "local.chrome.type",
    description: "Type text into Chrome through Chrome DevTools Protocol.",
    risk: "high",
    requiresApproval: true,
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        selector: { type: "string" },
        tabId: { type: "string" },
        urlIncludes: { type: "string" }
      },
      required: ["text"]
    }
  },
  {
    name: "local.chrome.screenshot",
    description: "Capture a screenshot of a Chrome tab through Chrome DevTools Protocol.",
    risk: "medium",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        urlIncludes: { type: "string" }
      }
    }
  },
  {
    name: "local.app.open",
    description: "Open a local macOS application by name.",
    risk: "medium",
    requiresApproval: true,
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"]
    }
  },
  {
    name: "local.app.applescript",
    description: "Run AppleScript to automate local macOS apps.",
    risk: "high",
    requiresApproval: true,
    inputSchema: {
      type: "object",
      properties: { script: { type: "string" } },
      required: ["script"]
    }
  },
  {
    name: "local.filesystem.read",
    description: "Read a file inside the Content Pull workspace.",
    risk: "medium",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"]
    }
  },
  {
    name: "local.filesystem.write",
    description: "Write a file inside the Content Pull workspace.",
    risk: "high",
    requiresApproval: true,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "local.shell.run",
    description: "Run a local shell command from the Content Pull workspace.",
    risk: "high",
    requiresApproval: true,
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
        args: { type: "array", items: { type: "string" } }
      },
      required: ["command"]
    }
  }
];

export function getLocalAgentStatus() {
  return {
    ok: true,
    mode: "local-agent",
    workspaceRoot,
    permissions: [
      {
        id: "accessibility",
        name: "Accessibility",
        requiredFor: ["local.app.applescript", "desktop click/type automation"],
        status: "requires-macos-approval"
      },
      {
        id: "screen-recording",
        name: "Screen Recording",
        requiredFor: ["desktop screenshot", "visual UI inspection"],
        status: "requires-macos-approval"
      },
      {
        id: "automation",
        name: "Automation",
        requiredFor: ["controlling Mail, Feishu, WeChat, and other macOS apps"],
        status: "requires-macos-approval"
      },
      {
        id: "chrome-cdp",
        name: "Chrome CDP",
        requiredFor: ["local.chrome.open_tab", "local.chrome.read_dom", "local.chrome.click", "local.chrome.type", "local.chrome.screenshot"],
        status: "requires-chrome-debug-port",
        endpoint: chromeDebugBaseUrl
      },
      {
        id: "filesystem",
        name: "Workspace Filesystem",
        requiredFor: ["local.filesystem.read", "local.filesystem.write"],
        status: "workspace-confined"
      },
      {
        id: "shell",
        name: "Shell Executor",
        requiredFor: ["local.shell.run"],
        status: "human-approval-required"
      }
    ],
    approvalQueue: listApprovals().filter((approval) => approval.status === "pending").length,
    auditEvents: auditLog.length
  };
}

export function listLocalAgentTools() {
  return localTools;
}

export function listApprovals() {
  return Array.from(approvals.values());
}

export function listAuditLog() {
  return auditLog.slice(-100);
}

export function requestApproval(tool, input, reason = "") {
  const approval = {
    id: crypto.randomUUID(),
    tool,
    input,
    reason: reason || `Allow Content Pull Local Agent to run ${tool}?`,
    status: "pending",
    createdAt: new Date().toISOString(),
    approvedAt: null
  };
  approvals.set(approval.id, approval);
  recordAudit("approval.requested", { tool, approvalId: approval.id });
  return approval;
}

export function approveRequest(id) {
  const approval = approvals.get(String(id || ""));
  if (!approval) return { ok: false, error: "Approval not found." };
  approval.status = "approved";
  approval.approvedAt = new Date().toISOString();
  approvals.set(approval.id, approval);
  recordAudit("approval.approved", { tool: approval.tool, approvalId: approval.id });
  return { ok: true, approval };
}

export function rejectRequest(id) {
  const approval = approvals.get(String(id || ""));
  if (!approval) return { ok: false, error: "Approval not found." };
  approval.status = "rejected";
  approval.rejectedAt = new Date().toISOString();
  approvals.set(approval.id, approval);
  recordAudit("approval.rejected", { tool: approval.tool, approvalId: approval.id });
  return { ok: true, approval };
}

export async function callLocalAgentTool(name, input = {}, { approvalId = "" } = {}) {
  const tool = localTools.find((item) => item.name === name);
  if (!tool) return { ok: false, error: `Unknown local agent tool: ${name}` };

  if (tool.requiresApproval && !isApproved(name, input, approvalId)) {
    return {
      ok: false,
      status: "requires_approval",
      approval: requestApproval(name, input)
    };
  }

  try {
    const result = await executeLocalTool(name, input);
    recordAudit("tool.executed", { tool: name, input: redactInput(input), ok: result.ok });
    return result;
  } catch (error) {
    recordAudit("tool.failed", { tool: name, error: error.message });
    return { ok: false, error: error.message };
  }
}

function isApproved(tool, input, approvalId) {
  const approval = approvals.get(String(approvalId || ""));
  if (!approval || approval.status !== "approved") return false;
  return approval.tool === tool && JSON.stringify(approval.input || {}) === JSON.stringify(input || {});
}

async function executeLocalTool(name, input) {
  if (name === "local.permissions.status") {
    return { ok: true, status: getLocalAgentStatus() };
  }

  if (name === "local.browser.open") {
    const url = normalizeUrl(input.url);
    await execFileAsync("open", [url], { timeout: 10000 });
    return { ok: true, opened: url };
  }

  if (name === "local.chrome.status") {
    return getChromeStatus();
  }

  if (name === "local.chrome.open_tab") {
    const url = normalizeUrl(input.url);
    const tab = await openChromeTab(url);
    return { ok: true, tab };
  }

  if (name === "local.chrome.read_dom") {
    const tab = await selectChromeTab(input);
    const result = await runCdp(tab.webSocketDebuggerUrl, [
      { method: "Runtime.enable" },
      {
        method: "Runtime.evaluate",
        params: {
          expression: "document.body ? document.body.innerText : ''",
          returnByValue: true
        }
      }
    ]);
    return {
      ok: true,
      tab: publicChromeTab(tab),
      text: String(result.at(-1)?.result?.result?.value || "")
    };
  }

  if (name === "local.chrome.click") {
    const selector = String(input.selector || "").trim();
    if (!selector) return { ok: false, error: "selector is required" };
    const tab = await selectChromeTab(input);
    const expression = `
      (() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return null;
        element.scrollIntoView({ block: "center", inline: "center" });
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()
    `;
    const result = await runCdp(tab.webSocketDebuggerUrl, [
      { method: "Runtime.enable" },
      { method: "Runtime.evaluate", params: { expression, returnByValue: true } }
    ]);
    const point = result.at(-1)?.result?.result?.value;
    if (!point) return { ok: false, error: `No element matched selector: ${selector}` };
    await runCdp(tab.webSocketDebuggerUrl, [
      { method: "Input.dispatchMouseEvent", params: { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 } },
      { method: "Input.dispatchMouseEvent", params: { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 } }
    ]);
    return { ok: true, tab: publicChromeTab(tab), selector };
  }

  if (name === "local.chrome.type") {
    const text = String(input.text || "");
    if (!text) return { ok: false, error: "text is required" };
    const tab = await selectChromeTab(input);
    const selector = String(input.selector || "").trim();
    const commands = [{ method: "Runtime.enable" }];
    if (selector) {
      commands.push({
        method: "Runtime.evaluate",
        params: {
          expression: `document.querySelector(${JSON.stringify(selector)})?.focus()`,
          returnByValue: true
        }
      });
    }
    commands.push({ method: "Input.insertText", params: { text } });
    await runCdp(tab.webSocketDebuggerUrl, commands);
    return { ok: true, tab: publicChromeTab(tab), selector: selector || null, typedCharacters: text.length };
  }

  if (name === "local.chrome.screenshot") {
    const tab = await selectChromeTab(input);
    const result = await runCdp(tab.webSocketDebuggerUrl, [
      { method: "Page.enable" },
      { method: "Page.captureScreenshot", params: { format: "png", fromSurface: true } }
    ]);
    const data = result.at(-1)?.result?.data || "";
    return { ok: true, tab: publicChromeTab(tab), mimeType: "image/png", data };
  }

  if (name === "local.app.open") {
    const appName = String(input.name || "").trim();
    if (!appName) return { ok: false, error: "name is required" };
    await execFileAsync("open", ["-a", appName], { timeout: 10000 });
    return { ok: true, opened: appName };
  }

  if (name === "local.app.applescript") {
    const script = String(input.script || "").trim();
    if (!script) return { ok: false, error: "script is required" };
    const { stdout, stderr } = await execFileAsync("osascript", ["-e", script], { timeout: 30000 });
    return { ok: true, stdout, stderr };
  }

  if (name === "local.filesystem.read") {
    const path = resolveWorkspacePath(input.path);
    const content = await readFile(path, "utf8");
    return { ok: true, path: relative(workspaceRoot, path), content };
  }

  if (name === "local.filesystem.write") {
    const path = resolveWorkspacePath(input.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, String(input.content || ""), "utf8");
    return { ok: true, path: relative(workspaceRoot, path) };
  }

  if (name === "local.shell.run") {
    const command = String(input.command || "").trim();
    const args = Array.isArray(input.args) ? input.args.map(String) : [];
    if (!command) return { ok: false, error: "command is required" };
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: workspaceRoot,
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });
    return { ok: true, command, args, stdout, stderr };
  }

  return { ok: false, error: `Unhandled local agent tool: ${name}` };
}

function resolveWorkspacePath(value) {
  const path = resolve(workspaceRoot, String(value || ""));
  if (!path.startsWith(workspaceRoot)) {
    throw new Error("Path must stay inside the Content Pull workspace.");
  }
  return path;
}

function normalizeUrl(value) {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("url must start with http:// or https://");
  return url;
}

async function getChromeStatus() {
  try {
    const version = await fetchChromeJson("/json/version");
    const tabs = await listChromeTabs();
    return {
      ok: true,
      endpoint: chromeDebugBaseUrl,
      browser: version.Browser || "Chrome",
      protocolVersion: version["Protocol-Version"] || "",
      tabCount: tabs.length,
      tabs: tabs.map(publicChromeTab)
    };
  } catch (error) {
    return {
      ok: false,
      endpoint: chromeDebugBaseUrl,
      error: `${error.message}. Start Chrome with --remote-debugging-port=9222 to enable CDP control.`
    };
  }
}

async function openChromeTab(url) {
  const encodedUrl = encodeURIComponent(url);
  try {
    return publicChromeTab(await fetchChromeJson(`/json/new?${encodedUrl}`, { method: "PUT" }));
  } catch {
    return publicChromeTab(await fetchChromeJson(`/json/new?${encodedUrl}`));
  }
}

async function selectChromeTab(input = {}) {
  const tabs = await listChromeTabs();
  const tabId = String(input.tabId || "").trim();
  const urlIncludes = String(input.urlIncludes || "").trim();
  const tab = tabs.find((item) => item.id === tabId)
    || (urlIncludes ? tabs.find((item) => String(item.url || "").includes(urlIncludes)) : null)
    || tabs.find((item) => item.type === "page");
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error("No controllable Chrome tab found. Start Chrome with --remote-debugging-port=9222.");
  }
  return tab;
}

async function listChromeTabs() {
  const tabs = await fetchChromeJson("/json/list");
  return Array.isArray(tabs) ? tabs.filter((tab) => tab.type === "page") : [];
}

async function fetchChromeJson(path, options = {}) {
  const response = await fetch(`${chromeDebugBaseUrl}${path}`, options);
  if (!response.ok) throw new Error(`Chrome CDP returned ${response.status}`);
  return response.json();
}

function runCdp(webSocketUrl, commands) {
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node.js runtime does not provide WebSocket. Use Node 22+ or add a WebSocket dependency.");
  }

  return new Promise((resolvePromise, rejectPromise) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    const results = [];
    let id = 0;

    const fail = (error) => {
      for (const item of pending.values()) item.reject(error);
      rejectPromise(error);
    };

    socket.addEventListener("open", async () => {
      try {
        for (const command of commands) {
          const result = await send(command);
          results.push(result);
        }
        socket.close();
        resolvePromise(results);
      } catch (error) {
        socket.close();
        rejectPromise(error);
      }
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message || "Chrome CDP command failed"));
      else item.resolve(message);
    });

    socket.addEventListener("error", () => fail(new Error("Chrome CDP WebSocket connection failed.")));

    function send(command) {
      id += 1;
      const payload = { id, ...command };
      const promise = new Promise((resolveCommand, rejectCommand) => {
        pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
      });
      socket.send(JSON.stringify(payload));
      return promise;
    }
  });
}

function publicChromeTab(tab = {}) {
  return {
    id: tab.id,
    title: tab.title || "",
    url: tab.url || "",
    type: tab.type || "page"
  };
}

function recordAudit(type, data = {}) {
  auditLog.push({
    id: crypto.randomUUID(),
    type,
    data,
    createdAt: new Date().toISOString()
  });
  if (auditLog.length > 500) auditLog.shift();
}

function redactInput(input = {}) {
  const next = { ...input };
  for (const key of Object.keys(next)) {
    if (/key|token|secret|password/i.test(key)) next[key] = "[redacted]";
  }
  return next;
}
