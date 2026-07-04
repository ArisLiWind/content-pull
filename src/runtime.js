import { DocumentWorkspace } from "./document.js";
import { VirtualFilesystem } from "./filesystem.js";
import { AgentMemory } from "./memory.js";
import { McpGateway } from "./mcp.js";
import { ContentPlanner } from "./planning.js";
import { createContentChannels } from "./channels.js";
import { MemoryCheckpointer } from "./checkpoint.js";
import { createContentAgentGraph } from "./agent-graph.js";
import { AgentLoopRunner } from "./agent-loop.js";
import { appendLog, applyStatePatch } from "./state.js";
import { nodes } from "./nodes.js";
import { ModelClient } from "./llm.js";
import { OpenClawGateway } from "./openclaw.js";

export const CONTENT_AGENT_DEFINITION = {
  name: "ViewPull",
  type: "AI Content Agent",
  description: "ViewPull is an AI Content Agent powered by a native Agent Harness.",
  architecture: [
    "Content Agent",
    "Harness",
    "Planning",
    "Tool Router",
    "MCP",
    "Memory",
    "Filesystem",
    "Document",
    "Checkpoint",
    "Publisher"
  ]
};

export function createContentAgentRuntime({ tools, publishers, renderMarkdown, backendConfig = {} }) {
  const filesystem = new VirtualFilesystem();
  const memory = new AgentMemory();
  const model = new ModelClient(backendConfig);
  const openclaw = new OpenClawGateway(backendConfig);
  const mcp = new McpGateway(tools, backendConfig, openclaw);
  const document = new DocumentWorkspace(filesystem);
  const graph = createContentAgentGraph(nodes);
  const channels = createContentChannels();
  const checkpointer = new MemoryCheckpointer({ namespace: backendConfig.memoryNamespace });
  const loop = new AgentLoopRunner({
    graph,
    channels,
    checkpointer,
    applyStatePatch,
    appendLog
  });

  return {
    definition: CONTENT_AGENT_DEFINITION,
    backendConfig,
    graph,
    channels,
    checkpointer,
    loop,
    planner: new ContentPlanner(),
    tools,
    model,
    openclaw,
    mcp,
    memory,
    filesystem,
    document,
    publishers,
    renderMarkdown
  };
}
