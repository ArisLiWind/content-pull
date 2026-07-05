import { CONTENT_PULL_BACKEND } from "./config.mjs";
import { callLocalAgentTool, listLocalAgentTools } from "./local-agent.mjs";
import { publishToExternalApp } from "./publishers.mjs";
import { formatSearchResults, searchWeb } from "./search.mjs";

const memoryStore = new Map();
const fileStore = new Map();

const tools = [
  {
    name: "content.research",
    description: "Search the web and create source-aware research notes for a Content Pull drafting task.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" }
      },
      required: ["query"]
    }
  },
  {
    name: "web.search",
    description: "Search the public web and return structured source results.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" }
      },
      required: ["query"]
    }
  },
  {
    name: "memory.read",
    description: "Read Content Pull agent memory by namespace and key.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" }
      }
    }
  },
  {
    name: "memory.write",
    description: "Write Content Pull agent memory.",
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
    description: "Write a generated document into the Content Pull backend file layer.",
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
  },
  {
    name: "publisher.publish",
    description: "Publish prepared content to an external app connection.",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string" },
        title: { type: "string" },
        markdown: { type: "string" },
        html: { type: "string" },
        metadata: { type: "object" }
      },
      required: ["platform", "markdown"]
    }
  }
];

export function checkMcpRuntime() {
  return {
    ok: true,
    endpoint: CONTENT_PULL_BACKEND.openclaw.mcpEndpoint,
    memoryNamespace: CONTENT_PULL_BACKEND.memory.namespace,
    tools: tools.map((tool) => tool.name),
    capabilities: ["planning", "tool-calling", "memory", "filesystem", "document", "web-search", "publisher"]
  };
}

export function listMcpTools() {
  return [
    ...tools,
    ...listLocalAgentTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
        risk: tool.risk,
        requiresApproval: tool.requiresApproval
      }
    }))
  ];
}

export async function callMcpTool(name, args = {}) {
  if (name?.startsWith("local.")) {
    const result = await callLocalAgentTool(name, args, { approvalId: args.approvalId });
    return {
      ok: result.ok,
      content: [{ type: "json", json: result }]
    };
  }

  if (name === "content.research") {
    const query = String(args.query || "").trim();
    const result = await searchWeb(query, { limit: Number(args.limit) || 5 });
    return {
      ok: result.ok,
      content: [
        {
          type: "text",
          text: formatSearchResults(result)
        },
        {
          type: "json",
          json: result
        }
      ]
    };
  }

  if (name === "web.search") {
    const result = await searchWeb(args.query, { limit: Number(args.limit) || 5 });
    return {
      ok: result.ok,
      content: [
        {
          type: "json",
          json: result
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
            title: args.title || "Content Pull Draft",
            format: args.format || "article",
            requiresHumanApproval: true
          }
        }
      ]
    };
  }

  if (name === "publisher.publish") {
    const platform = String(args.platform || "").trim();
    const result = await publishToExternalApp(platform, {
      markdown: String(args.markdown || ""),
      html: String(args.html || ""),
      title: String(args.title || "")
    }, args.metadata || {});
    return {
      ok: result.ok,
      content: [{ type: "json", json: result }]
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
