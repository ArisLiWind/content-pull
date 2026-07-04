import { VIEWPULL_BACKEND } from "./config.mjs";

const memoryStore = new Map();
const fileStore = new Map();

const tools = [
  {
    name: "content.research",
    description: "Create source-aware research notes for a ViewPull drafting task.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    name: "memory.read",
    description: "Read ViewPull agent memory by namespace and key.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" }
      }
    }
  },
  {
    name: "memory.write",
    description: "Write ViewPull agent memory.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        value: {}
      },
      required: ["key", "value"]
    }
  },
  {
    name: "filesystem.write",
    description: "Write a generated document into the ViewPull backend file layer.",
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
    name: "publisher.prepare",
    description: "Prepare a document for article publish or video script export.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        format: { type: "string" }
      }
    }
  }
];

export function checkMcpRuntime() {
  return {
    ok: true,
    endpoint: VIEWPULL_BACKEND.openclaw.mcpEndpoint,
    memoryNamespace: VIEWPULL_BACKEND.memory.namespace,
    tools: tools.map((tool) => tool.name),
    capabilities: ["planning", "tool-calling", "memory", "filesystem", "document", "publisher"]
  };
}

export function listMcpTools() {
  return tools;
}

export async function callMcpTool(name, args = {}) {
  if (name === "content.research") {
    const query = String(args.query || "").trim();
    return {
      ok: true,
      content: [
        {
          type: "text",
          text: [
            `Research query: ${query}`,
            "ViewPull embedded OpenClaw-compatible backend prepared a research task.",
            "Use DeepSeek for language reasoning, MCP tools for memory/files/document/publisher orchestration, and human approval before publish."
          ].join("\n")
        }
      ]
    };
  }

  if (name === "memory.read") {
    return {
      ok: true,
      content: [{ type: "json", json: memoryStore.get(String(args.key || "default")) || null }]
    };
  }

  if (name === "memory.write") {
    memoryStore.set(String(args.key), args.value);
    return { ok: true, content: [{ type: "text", text: "Memory saved." }] };
  }

  if (name === "filesystem.write") {
    fileStore.set(String(args.path), {
      content: String(args.content || ""),
      updatedAt: new Date().toISOString()
    });
    return { ok: true, content: [{ type: "text", text: "File saved." }] };
  }

  if (name === "publisher.prepare") {
    return {
      ok: true,
      content: [
        {
          type: "json",
          json: {
            title: args.title || "ViewPull Draft",
            format: args.format || "article",
            requiresHumanApproval: true
          }
        }
      ]
    };
  }

  return { ok: false, error: `Unknown MCP tool: ${name}` };
}

export async function handleMcpJsonRpc(message) {
  if (message?.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: { tools: listMcpTools() }
    };
  }

  if (message?.method === "tools/call") {
    const result = await callMcpTool(message.params?.name, message.params?.arguments || {});
    return {
      jsonrpc: "2.0",
      id: message.id,
      result
    };
  }

  return {
    jsonrpc: "2.0",
    id: message?.id || null,
    error: {
      code: -32601,
      message: `Unsupported MCP method: ${message?.method || "unknown"}`
    }
  };
}
