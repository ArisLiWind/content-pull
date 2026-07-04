export const nodes = {
  async collectAttentionSignals(state, context) {
    const result = await context.mcp.call("attention.collect", {
      topic: state.topic.normalized
    }, { taskId: state.taskId, stage: "attention" });

    const signals = result.ok ? result.data.signals : [];
    return {
      attentionScore: {
        ...state.attentionScore,
        signals,
        reasons: signals.map((signal) => signal.reason)
      }
    };
  },

  async researchSources(state, context) {
    const round = state.loops.researchRound + 1;
    const result = await context.mcp.call("research.search", {
      query: state.topic.normalized,
      round
    }, { taskId: state.taskId, stage: "research" });

    const nextSources = result.ok ? result.data.sources : [];
    return {
      sources: dedupeById([...state.sources, ...nextSources]),
      loops: {
        ...state.loops,
        researchRound: round
      }
    };
  },

  async extractFacts(state) {
    const facts = state.sources.map((source, index) => ({
      id: `fact-${index + 1}`,
      claim: source.summary,
      sourceIds: [source.id],
      confidence: source.credibilityScore || 0.7
    }));

    return {
      facts
    };
  },

  async analyzeTrend(state) {
    if (isHistoricalAiResearch(state)) {
      return {
        trendAnalysis: {
          summary: "1990-2026 的技术主线，是信息从被连接、被搜索、被分发，逐步走向被模型理解、生成并执行。AI 浪潮不是孤立事件，而是互联网、移动互联网、云计算、数据规模、GPU、Transformer 和生成式交互共同叠加后的结果。",
          opportunities: [
            "把 AI 放在 30 年技术演进里解释，能让文章比单点新闻更有纵深。",
            "用爆款标题机制连接读者焦虑、时代判断和可操作启发。",
            "把未来 15 年落到内容生产、个人效率和组织重构三个层面。"
          ],
          risks: [
            "跨 36 年技术史容易空泛，需要用清晰阶段和因果链组织。",
            "未来预测不能写成确定结论，应保留变量和边界。",
            "微信公众号发布需要最终人工确认，避免未经审核直接外发。"
          ],
          angles: [
            "从互联网到 AI Agent：技术权力如何转移",
            "为什么真正的 AI 浪潮现在才开始",
            "未来 15 年，内容创作者会被重写还是被放大"
          ]
        }
      };
    }

    return {
      trendAnalysis: {
        summary: "AI 技术进展的注意力正在从单点模型能力，转向 Agent 如何进入真实工作流、如何调用工具、如何被用户审计和确认。",
        opportunities: [
          "把复杂 AI 能力包装成任务工作台，而不是只停留在聊天框。",
          "用 MCP 和插件化工具层降低外部系统接入成本。",
          "让内容创作过程透明化，增强用户对事实和结论的信任。"
        ],
        risks: [
          "资料不足时容易把趋势写成确定性结论。",
          "平台风格差异会导致同一草稿不适合直接多端发布。"
        ],
        angles: [
          "AI Agent 从生成内容走向完成任务",
          "MCP 让 AI 应用进入可组合时代",
          "未来内容团队会像管理流水线一样管理创作"
        ]
      }
    };
  },

  async scoreAttention(state) {
    const signalAverage = average(state.attentionScore.signals.map((signal) => signal.value || 70));
    const factBoost = Math.min(state.facts.length * 3, 12);
    const score = Math.min(100, Math.round(signalAverage + factBoost));

    return {
      attentionScore: {
        ...state.attentionScore,
        score,
        reasons: [
          ...state.attentionScore.reasons,
          `综合社媒讨论速度、读者意图和资料密度，当前选题注意力评分为 ${score}。`
        ]
      }
    };
  },

  async generateOutline(state) {
    if (isHistoricalAiResearch(state)) {
      return {
        outline: {
          title: "从 1990 到 2026：AI 浪潮为什么会在今天真正爆发",
          sections: [
            { heading: "开场：这不是一次普通技术更新", points: ["AI 是 30 多年技术堆叠后的拐点", "读者关心的是自己会如何被改变"] },
            { heading: "第一阶段：连接信息", points: ["互联网和搜索引擎降低信息获取成本", "爆款内容开始依赖分发机制"] },
            { heading: "第二阶段：移动与数据", points: ["智能手机重塑注意力入口", "平台算法让标题和完读率成为关键变量"] },
            { heading: "第三阶段：深度学习到生成式 AI", points: ["2012 后模型能力跨越", "2022 后普通人直接使用 AI"] },
            { heading: "今天：Agent 与工具调用", points: ["AI 从回答问题走向完成任务", "内容生产进入可审计的 Agent Harness"] },
            { heading: "爆款标题为什么有效", points: ["时代判断", "强冲突", "具体收益", "未来焦虑"] },
            { heading: "未来 15 年判断", points: ["个人工作台智能化", "组织流程代理化", "内容创作从单篇变成系统"] }
          ]
        }
      };
    }

    return {
      outline: {
        title: "今天最值得关注的 AI 技术进展：Agent 正在变成真正的工作台",
        sections: [
          { heading: "开场：AI 进展的关键词变了", points: ["从模型参数转向工作流能力", "从一次生成转向多轮执行"] },
          { heading: "趋势一：Agent 产品化", points: ["任务状态可见", "执行过程可审计", "用户确认成为关键节点"] },
          { heading: "趋势二：MCP 和工具生态", points: ["连接搜索、浏览器、文档和发布平台", "工具不写死在业务流程里"] },
          { heading: "趋势三：内容团队的机会", points: ["选题发现自动化", "研究和写作流水线化", "多平台草稿生成"] },
          { heading: "结尾：判断 AI 应用的新标准", points: ["不是能不能生成，而是能不能完成一个闭环"] }
        ]
      }
    };
  },

  async generateDraft(state, context) {
    const fallbackMarkdown = buildDraft(state);
    const modelMarkdown = await generateModelDraft(state, context, fallbackMarkdown);
    const markdown = modelMarkdown || fallbackMarkdown;
    return {
      draft: {
        ...state.draft,
        markdown,
        currentVersion: state.draft.currentVersion + 1,
        variants: [
          {
            platform: "wechat",
            title: state.outline.title,
            markdown,
            metadata: { tone: "深度分析", audience: "科技与产品读者" }
          },
          {
            platform: "xiaohongshu",
            title: "AI 技术今天真正变重要的地方",
            markdown: buildXiaohongshuDraft(state),
            metadata: { tone: "轻量、观点鲜明", audience: "AI 工具和职场效率读者" }
          }
        ]
      }
    };
  },

  async reviewDraft(state) {
    const reviewRound = state.loops.reviewRound + 1;
    const hasEnoughFacts = state.facts.length >= 4;
    const hasPlatformVariants = state.draft.variants.length >= 2;
    const markdownLength = state.draft.markdown.length;
    const score = Math.min(96, 72 + state.facts.length * 3 + (hasPlatformVariants ? 8 : 0) + (markdownLength > 900 ? 5 : 0));
    const passed = score >= 88 || reviewRound >= 2;

    return {
      reviewResult: {
        passed,
        score,
        issues: passed
          ? []
          : [
              {
                type: hasEnoughFacts ? "style" : "fact",
                severity: "medium",
            message: hasEnoughFacts ? "需要让标题和结尾更有传播性。" : "事实密度还不够，需要补充更多来源。"
              }
            ],
        suggestions: passed
          ? ["文档已达到 V1 预览标准，可进入人工确认。"]
          : ["强化开头冲突", "补充来源可信度", "增加视频剧本版本的镜头感"]
      },
      loops: {
        ...state.loops,
        reviewRound
      }
    };
  },

  async reviseDraft(state) {
    const revised = `${state.draft.markdown}

## 自我审核后的增强

- 更明确地把今天的重点归纳为：Agent 工作台、MCP 工具层、人工确认发布。
- 对不确定信息保留边界：当前 V1 先使用可验证来源和人工确认，不把社媒热度直接等同于事实。
- 为多格式发布保留不同表达：文章负责深度，视频剧本负责镜头和节奏。`;

    return {
      draft: {
        ...state.draft,
        markdown: revised,
        currentVersion: state.draft.currentVersion + 1,
        editHistory: [
          ...state.draft.editHistory,
          {
            type: "agent_revision",
            instruction: "Review loop quality revision",
            createdAt: new Date().toISOString()
          }
        ]
      }
    };
  },

  async preparePublishing(state, context) {
    const html = context.renderMarkdown(state.draft.markdown);
    const outputs = [];

    for (const platform of ["markdown", "html", ...state.topic.platforms]) {
      const target = platform === "wechat" || platform === "xiaohongshu" ? platform : platform;
      const content = {
        markdown: state.draft.markdown,
        html
      };
      const result = await context.publishers.publish(target, content, {
        title: state.outline.title,
        taskId: state.taskId
      });
      outputs.push(result);
    }

    return {
      publishStatus: {
        status: "success",
        platform: "multi",
        attempts: state.publishStatus.attempts + 1,
        lastError: "",
        outputs
      }
    };
  },

  async saveHistory(state) {
    return {
      status: "done",
      currentNode: null
    };
  }
};

async function generateModelDraft(state, context, fallbackMarkdown) {
  if (!context.model?.configured) return "";

  const result = await context.model.chat({
    system: "你是 ViewPull 的中文内容创作 Agent。只输出完整 Markdown 正文，不要解释过程。文章要有清晰标题、结构、观点和事实边界。",
    messages: [
      {
        role: "user",
        content: `用户目标：${state.userInput}

资料：
${state.sources.map((source) => `- ${source.title}: ${source.summary}`).join("\n")}

大纲：
${state.outline.sections.map((section) => `- ${section.heading}: ${section.points.join(" / ")}`).join("\n")}

请基于资料和大纲生成一篇可预览的中文 Markdown 文章。可参考但不要机械复制这个本地草稿：

${fallbackMarkdown}`
      }
    ],
    temperature: 0.7
  });

  return result.ok ? result.text.trim() : "";
}

export function isResearchEnough(state) {
  const confidence = average(state.facts.map((fact) => fact.confidence));
  return state.sources.length >= 4 && state.facts.length >= 4 && confidence >= 0.75;
}

function buildDraft(state) {
  if (isHistoricalAiResearch(state)) return buildHistoricalAiDraft(state);

  const sourceLines = state.sources
    .slice(0, 4)
    .map((source) => `- ${source.title}：${source.summary}`)
    .join("\n");

  return `# ${state.outline.title}

今天 AI 技术进展里最值得关注的，不只是某个模型又提升了多少分，而是 AI Agent 正在从“能回答问题”走向“能完成任务”。

## 为什么这个变化重要

过去的 AI 产品大多围绕聊天框展开。用户提出问题，模型给出答案。但真正的工作并不是一次回答，而是一串连续动作：发现问题、搜索资料、提取事实、判断趋势、生成草稿、审核修改、等待确认，再进入发布。

这也是 Agent 产品化的关键变化：AI 不再只是内容生成器，而是一个可以被调度、被观察、被修正的工作流执行者。

## 今天的三个信号

${state.attentionScore.reasons.map((reason) => `- ${reason}`).join("\n")}

## 资料和事实基础

${sourceLines}

## 趋势判断

${state.trendAnalysis.summary}

可以看到，新的机会不在于把所有事情都交给 AI 自动完成，而在于让 AI 承担高频、繁琐、需要跨工具协作的中间过程，同时把关键判断和发布确认留给人。

## 对内容团队的启发

- 选题发现会从“凭感觉刷热点”变成“持续收集注意力信号”。
- 内容研究会从“复制资料”变成“围绕可信来源提取事实”。
- 草稿生产会从“一篇文章”变成“面向不同平台的内容包”。
- 发布前审核会成为 Agent 工作流的默认环节。

## 结论

判断一个 AI 应用是否真正有价值，标准不再只是“它能不能生成一段文字”，而是“它能不能围绕一个目标完成闭环”。这也是 ViewPull 要解决的问题：把内容从选题、研究、创作、修改到发布草稿，变成一个可见、可控、可扩展的 Agent 工作台。`;
}

function buildHistoricalAiDraft(state) {
  const sourceLines = state.sources
    .slice(0, 6)
    .map((source) => `- ${source.title}：${source.summary}`)
    .join("\n");

  return `# ${state.outline.title}

如果只看今天的 AI 新闻，我们很容易误以为技术浪潮是突然发生的。但把时间拉回 1990 年，再看到 2026 年，真正清晰的线索会浮出来：过去三十多年，人类一直在降低“处理信息”的成本，而 AI 正在把这个过程推进到“执行任务”的阶段。

## 一、1990-2026：最重要的技术主线不是更快，而是更自动

1990 年代，互联网把信息连接起来；2000 年代，搜索引擎把信息找出来；2010 年代，移动互联网和推荐算法把信息推到每个人面前；2020 年代，生成式 AI 开始直接理解、生成和改写信息。

这条线索解释了为什么 AI 浪潮会在今天显得格外猛烈。它不是一个独立产品突然爆红，而是网络、云计算、GPU、数据规模、深度学习、Transformer 和人机交互方式共同成熟后的结果。

## 二、为什么当下是 AI 的关键时刻

过去的技术主要改变“信息如何流动”，今天的 AI 正在改变“工作如何完成”。当模型可以调用工具、读取文件、写文档、记忆上下文、等待人工批准再发布，它就不再只是聊天机器人，而更像一个面向任务的 Agent Harness。

这也是 ViewPull 的产品方向：不是 Workflow Builder，也不是 ChatBot，而是面向内容创作的 Agent Harness。内容创作者需要的不只是生成一段文字，而是从选题、研究、标题判断、草稿、审稿、修改到发布的完整闭环。

## 三、网上最火爆的科技文章，标题通常赢在哪里

爆款标题很少只靠夸张。真正数据好的标题，通常同时满足四件事：

- 有时代判断：让读者觉得“这件事正在改变世界”。
- 有强冲突：把旧秩序和新变量放在一起。
- 有明确对象：告诉读者这和“我、我的行业、我的工作”有关。
- 有可感知收益：读完之后能获得判断、方法或避坑能力。

例如同样写 AI，弱标题是“AI 技术发展分析”，强标题会接近“从 1990 到 2026：为什么 AI 真正重写工作的时刻才刚开始”。前者像资料，后者像一个必须点开的判断。

## 四、事实基础与研究线索

${sourceLines}

## 五、未来 15 年：AI 会重写什么

未来 15 年，最值得关注的不是某个模型名字，而是智能能力会像水电一样进入软件、公司和个人工作台。

第一，个人会拥有更强的“外部大脑”。写作、研究、剪辑、排期、复盘会被 Agent 串联起来。

第二，组织流程会被重新拆解。过去需要多人协作的中间环节，会逐步变成可审计、可回放、可批准的 Agent Loop。

第三，内容行业会从“生产单篇内容”转向“运营内容系统”。选题、素材、标题、脚本、长文、分发和复盘会变成一个连续系统。

## 六、我的判断

AI 浪潮真正重要的地方，不是它会不会替代某个岗位，而是它会把很多人的工作从“手工处理信息”推向“设计目标、判断结果、管理 Agent”。

这也是为什么今天的内容产品不能只做聊天框。真正有价值的 Content Agent，必须有 Planning、Tool Calling、Memory、Filesystem、Document、Publisher 和 Human Approval。只有这样，AI 才能从“会说”变成“能做”，从一次生成变成可控的生产力系统。

## 可用于微信公众号的发布标题

1. 从 1990 到 2026：为什么 AI 真正重写工作的时刻才刚开始
2. 未来 15 年，AI 不会只改变工具，而会改变每个人的工作方式
3. 爆款科技文章为什么都在写 AI：因为这次改变的是任务本身

## 发布前提醒

当前版本已生成微信公众号文章草稿。为了符合 ViewPull 的 Human Approval 设计，正式发布前仍应由创作者确认事实、标题和平台账号。`;
}

function buildXiaohongshuDraft(state) {
  if (isHistoricalAiResearch(state)) {
    return `# 视频剧本：从 1990 到 2026，AI 为什么现在爆发

## 0-3 秒：开场钩子
如果你以为 AI 是这两年突然火的，那你可能只看到了结果。

## 3-15 秒：历史压缩
1990 年代，互联网连接信息。
2000 年代，搜索引擎帮我们找到信息。
2010 年代，移动互联网和算法把信息推到你面前。
2020 年代，AI 开始直接理解、生成，甚至执行任务。

## 15-35 秒：核心观点
所以 AI 浪潮不是突然爆发，而是三十多年技术积累后的结果。
真正的变化也不是“写得更快”，而是工作流程开始被 Agent 接管。

## 35-55 秒：内容创作者视角
未来内容创作不会只是写一篇文章，而会变成：
选题发现、资料研究、标题优化、长文、视频剧本、审核、发布和复盘的一整套系统。

## 55-70 秒：结尾
未来 15 年，会用 AI 的人不只是提问，而是会设计目标、审核结果、管理自己的 Agent。

## 屏幕字幕
AI 不是突然出现的。
它是信息技术 30 年演进后的下一步。
下一个机会：不是 ChatBot，而是 Agent Harness。`;
  }

  return `# AI 技术今天真正变重要的地方

不是又多了一个聊天机器人，而是 AI Agent 开始像“工作台”一样帮你完成完整任务。

## 3 个重点

1. AI 不只生成文字，而是可以跑流程。
2. MCP 这类工具协议，让 AI 更容易连接搜索、文档、浏览器、发布平台。
3. 真正靠谱的 AI 产品，一定要保留人工确认和可编辑文档。

## 对内容创作者意味着什么

- 选题可以自动发现
- 资料可以自动整理
- 草稿可以多平台生成
- 修改可以直接用自然语言完成

我的判断：未来内容工具不会只是“写一篇文章”，而是帮你管理一整条内容生产线。

注意力评分：${state.attentionScore.score}/100`;
}

function dedupeById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isHistoricalAiResearch(state) {
  const value = typeof state === "string" ? state : `${state?.topic?.raw || ""} ${state?.topic?.normalized || ""}`;
  return /1990|2026|未来15年|重大技术发展|人工智能浪潮|爆款|最火爆/.test(value);
}
