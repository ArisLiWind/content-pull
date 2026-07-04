import { checkOpenClawRuntime } from "../viewpull/openclaw.mjs";

const runtime = await checkOpenClawRuntime();
const results = [
  {
    name: "ViewPull OpenClaw Runtime",
    ok: runtime.ok,
    message: `${runtime.mode} mode`
  },
  {
    name: "MCP Tool Layer",
    ok: Boolean(runtime.mcp?.ok),
    message: `${runtime.mcp?.tools?.length || 0} tools available`
  },
  {
    name: "Memory Namespace",
    ok: Boolean(runtime.mcp?.memoryNamespace),
    message: runtime.mcp?.memoryNamespace || "missing"
  }
];

for (const result of results) {
  const icon = result.ok ? "OK" : "FAIL";
  console.log(`${icon} ${result.name}: ${result.message}`);
}

if (results.some((result) => !result.ok)) process.exit(1);
