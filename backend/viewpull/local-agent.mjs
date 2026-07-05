import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspaceRoot = process.cwd();
const approvals = new Map();
const auditLog = [];

const localTools = [
  {
    name: "local.permissions.status",
    description: "Inspect ViewPull Local Agent permission readiness.",
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
    description: "Read a file inside the ViewPull workspace.",
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
    description: "Write a file inside the ViewPull workspace.",
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
    description: "Run a local shell command from the ViewPull workspace.",
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
        requiredFor: ["controlling Chrome, Mail, Feishu, WeChat, and other apps"],
        status: "requires-macos-approval"
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
    reason: reason || `Allow ViewPull Local Agent to run ${tool}?`,
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
    throw new Error("Path must stay inside the ViewPull workspace.");
  }
  return path;
}

function normalizeUrl(value) {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("url must start with http:// or https://");
  return url;
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
