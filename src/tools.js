export class ToolRouter {
  constructor() {
    this.registry = new Map();
  }

  register(tool) {
    this.registry.set(tool.name, tool);
  }

  async call(toolName, input) {
    const startedAt = performance.now();
    const tool = this.registry.get(toolName);

    if (!tool) {
      return {
        ok: false,
        error: `Tool not registered: ${toolName}`,
        provider: "unknown",
        durationMs: Math.round(performance.now() - startedAt)
      };
    }

    try {
      const data = await tool.handler(input);
      return {
        ok: true,
        data,
        provider: tool.provider,
        durationMs: Math.round(performance.now() - startedAt)
      };
    } catch (error) {
      return {
        ok: false,
        error: error.message,
        provider: tool.provider,
        durationMs: Math.round(performance.now() - startedAt)
      };
    }
  }
}

export function createDefaultToolRouter() {
  const router = new ToolRouter();

  router.register({
    name: "attention.collect",
    provider: "local",
    capability: "attention",
    description: "Collect mocked social attention signals for the current topic.",
    handler: async ({ topic }) => {
      const signals = isHistoricalAiResearch(topic)
        ? [
            {
              platform: "微信公众号",
              keyword: "AI 时代变革",
              metric: "reader_intent",
              value: 91,
              reason: "中文深度读者持续关注 AI 如何重塑个人、公司和产业结构。"
            },
            {
              platform: "X",
              keyword: "AI agents future",
              metric: "share_of_voice",
              value: 88,
              reason: "海外技术圈把 Agent、模型能力和未来工作形态放在同一个讨论框架里。"
            },
            {
              platform: "视频平台",
              keyword: "AI 爆款标题",
              metric: "completion_intent",
              value: 84,
              reason: "带有历史纵深、未来判断和具体利益点的标题更容易获得点击和完读。"
            }
          ]
        : [
        {
          platform: "Hacker News",
          keyword: "agentic coding",
          metric: "discussion_velocity",
          value: 88,
          reason: "开发者正在密集讨论 Agent 工作流从 demo 走向生产的问题。"
        },
        {
          platform: "X",
          keyword: "AI agents",
          metric: "share_of_voice",
          value: 82,
          reason: "AI Agent、browser use、tool calling 仍是技术圈高频话题。"
        },
        {
          platform: "文章",
          keyword: "AI 应用落地",
          metric: "reader_intent",
          value: 79,
          reason: "中文读者更关心 AI 如何进入产品和工作流。"
        }
      ];

      return {
        signals,
        topic
      };
    }
  });

  router.register({
    name: "research.search",
    provider: "mcp-ready-local",
    capability: "search",
    description: "MCP-ready search adapter. V1 returns curated mock sources.",
    handler: async ({ query, round }) => {
      const historicalSources = [
        {
          id: `source-${round}-ai-timeline`,
          title: "1990-2026 人工智能关键浪潮时间线",
          url: "https://example.com/ai-timeline-1990-2026",
          platform: "web",
          author: "ViewPull Research",
          publishedAt: new Date().toISOString(),
          summary: "从互联网普及、搜索引擎、移动互联网、深度学习、Transformer、生成式 AI 到 Agent，技术主线从连接信息走向自动完成任务。",
          credibilityScore: 0.84
        },
        {
          id: `source-${round}-headline-patterns`,
          title: "科技爆款文章标题与完读机制分析",
          url: "https://example.com/viral-tech-headlines",
          platform: "web",
          author: "ViewPull Research",
          publishedAt: new Date().toISOString(),
          summary: "高数据标题通常同时包含时代判断、强冲突、明确对象和可感知收益，例如“未来十年谁会被重写”。",
          credibilityScore: 0.79
        },
        {
          id: `source-${round}-ai-wave-now`,
          title: "当下 AI 浪潮：模型、工具调用与产业落地",
          url: "https://example.com/ai-wave-now",
          platform: "web",
          author: "ViewPull Research",
          publishedAt: new Date().toISOString(),
          summary: "2022 之后的生成式 AI 让普通用户第一次直接感知模型能力，2024-2026 的重点转向多模态、Agent、企业流程和内容生产自动化。",
          credibilityScore: 0.82
        },
        {
          id: `source-${round}-future-15-years`,
          title: "未来 15 年 AI 技术与内容行业影响预测",
          url: "https://example.com/ai-next-15-years",
          platform: "web",
          author: "ViewPull Research",
          publishedAt: new Date().toISOString(),
          summary: "未来 15 年的核心变量不是单个模型，而是低成本智能劳动力、软件代理、个人知识系统和可审计的人机协作流程。",
          credibilityScore: 0.77
        }
      ];
      const defaultSources = [
        {
          id: `source-${round}-1`,
          title: "AI Agent 产品化趋势观察",
          url: "https://example.com/agent-productization",
          platform: "web",
          author: "ViewPull Research",
          publishedAt: new Date().toISOString(),
          summary: "Agent 产品正在从聊天框转向任务工作台和可审计工作流。",
          credibilityScore: 0.82
        },
        {
          id: `source-${round}-2`,
          title: "多工具调用与 MCP 生态",
          url: "https://example.com/mcp-tools",
          platform: "web",
          author: "ViewPull Research",
          publishedAt: new Date().toISOString(),
          summary: "MCP 让 Agent 能用统一协议连接搜索、文件、浏览器、发布等外部系统。",
          credibilityScore: 0.78
        }
      ];

      return {
        sources: isHistoricalAiResearch(query) ? historicalSources : defaultSources,
        query
      };
    }
  });

  router.register({
    name: "document.toHtml",
    provider: "local",
    capability: "export",
    description: "Convert Markdown into lightweight HTML.",
    handler: async ({ markdown, renderMarkdown }) => ({
      html: renderMarkdown(markdown)
    })
  });

  return router;
}

function isHistoricalAiResearch(value) {
  return /1990|2026|未来15年|重大技术发展|人工智能浪潮|爆款|最火爆/.test(String(value || ""));
}
