import { appendLog, applyStatePatch, WORKFLOW_STATUS } from "./state.js";
import { isResearchEnough } from "./nodes.js";
import { createContentAgentRuntime } from "./runtime.js";

export class WorkflowHarness {
  constructor(context, onStateChange) {
    this.context = createContentAgentRuntime(context);
    this.onStateChange = onStateChange;
  }

  async run(initialState) {
    const plan = this.context.planner.createPlan(initialState);
    let state = applyStatePatch(initialState, {
      status: WORKFLOW_STATUS.RUNNING,
      plan,
      harness: this.context.definition,
      graph: {
        name: this.context.graph.name,
        entryPoint: this.context.graph.entryPoint,
        finishPoints: this.context.graph.finishPoints
      }
    });

    this.context.memory.rememberTask(state, "agent_lifecycle.started");
    state = appendLog(state, "Content Agent Created", { level: "success" });
    state = appendLog(state, "Native Agent Harness Running");
    state = appendLog(state, `Plan created with ${plan.stages.length} stages`);
    this.context.checkpointer.save(state.taskId, state, { phase: "agent_lifecycle.started" });
    this.emit(state);

    state = await this.runNode(state, "collectAttentionSignals", "Collecting Attention Signals");
    state = await this.runResearchLoop(state);
    state = await this.runNode(state, "analyzeTrend", "Analyzing Trend");
    state = await this.runNode(state, "scoreAttention", "Scoring Attention");
    state = await this.runNode(state, "generateOutline", "Generating Outline");
    state = await this.runNode(state, "generateDraft", "Writing Draft");
    state = await this.runReviewLoop(state);

    state = applyStatePatch(state, {
      status: WORKFLOW_STATUS.WAITING_APPROVAL,
      currentNode: null
    });
    this.context.memory.recordApproval(state, {
      type: "publish_draft",
      status: "waiting",
      reason: "Human approval is required before publishing."
    });
    this.context.memory.rememberTask(state, "human_approval.requested");
    state = appendLog(state, "Document Ready", { level: "success" });
    this.emit(state);
    return state;
  }

  async runPublishLoop(initialState) {
    let state = applyStatePatch(initialState, {
      status: WORKFLOW_STATUS.PUBLISHING
    });

    while (state.loops.publishRetry < 2) {
      state = applyStatePatch(state, {
        loops: {
          ...state.loops,
          publishRetry: state.loops.publishRetry + 1
        }
      });
      state = appendLog(state, `Publish Loop ${state.loops.publishRetry}/2`);
      state = await this.runNode(state, "preparePublishing", "Preparing Publishing");

      if (state.publishStatus.status === "success") {
        state = await this.runNode(state, "saveHistory", "Saving History");
        state = applyStatePatch(state, {
          status: WORKFLOW_STATUS.DONE
        });
        this.context.memory.rememberTask(state, "publisher.draft_ready");
        state = appendLog(state, "Publish Draft Ready", { level: "success" });
        this.emit(state);
        return state;
      }
    }

    state = applyStatePatch(state, {
      status: WORKFLOW_STATUS.FAILED,
      publishStatus: {
        ...state.publishStatus,
        status: "manual_required"
      }
    });
    state = appendLog(state, "Publish requires manual handling", { level: "warn" });
    this.emit(state);
    return state;
  }

  async applyNaturalLanguageRevision(initialState, instruction) {
    let state = appendLog(initialState, `User requested revision: ${instruction}`);
    const revised = await this.rewriteDraft(state, instruction);

    const now = new Date().toISOString();

    state = applyStatePatch(state, {
      status: WORKFLOW_STATUS.WAITING_APPROVAL,
      messages: [
        ...(state.messages || []),
        {
          id: crypto.randomUUID(),
          role: "user",
          content: instruction,
          createdAt: now
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: this.context.model.configured
            ? `已使用 ${this.context.model.providerLabel} 修改右侧文件。`
            : "已在当前对话中修改右侧文件。",
          createdAt: new Date().toISOString()
        }
      ],
      draft: {
        ...state.draft,
        markdown: revised,
        variants: updateDraftVariants(state.draft.variants, revised),
        currentVersion: state.draft.currentVersion + 1,
        editHistory: [
          ...state.draft.editHistory,
          {
            type: "user_revision",
            instruction,
            createdAt: new Date().toISOString()
          }
        ]
      }
    });
    state = appendLog(state, "Revision Applied", { level: "success" });
    this.context.document.saveDraftSet(state, state.draft);
    this.context.memory.rememberTask(state, "document.revised");
    this.emit(state);
    return state;
  }

  async continueConversation(initialState, instruction, { appendUser = true } = {}) {
    let state = appendLog(initialState, `User message: ${instruction}`);
    const now = new Date().toISOString();
    const messages = [
      ...(appendUser
        ? [
            {
              id: crypto.randomUUID(),
              role: "user",
              content: instruction,
              createdAt: now
            }
          ]
        : []),
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "正在思考...",
        createdAt: now,
        pending: true
      }
    ];

    state = applyStatePatch(state, {
      status: WORKFLOW_STATUS.RUNNING,
      currentNode: "Assistant Chat",
      messages: [...(state.messages || []), ...messages]
    });
    this.emit(state);

    const reply = await this.generateAssistantReply(state);
    state = applyStatePatch(state, {
      status: WORKFLOW_STATUS.READY,
      currentNode: null,
      messages: state.messages.map((message) => (
        message.pending
          ? {
              ...message,
              content: reply,
              pending: false,
              createdAt: new Date().toISOString()
            }
          : message
      ))
    });
    state = appendLog(state, "Assistant replied", { level: "success" });
    this.context.memory.rememberTask(state, "assistant.chat");
    this.emit(state);
    return state;
  }

  async rewriteDraft(state, instruction) {
    if (this.context.model.configured && state.draft.markdown) {
      const result = await this.context.model.chat({
        system: "你是 ViewPull 的内容编辑 Agent。只输出完整 Markdown 正文，不要解释过程。根据用户新要求改写现有文章，保留事实边界、标题结构和可发布性。",
        messages: [
          {
            role: "user",
            content: `现有文章：\n\n${state.draft.markdown}\n\n用户新要求：${instruction}\n\n请返回修改后的完整 Markdown。`
          }
        ],
        temperature: 0.6
      });

      if (result.ok && result.text.trim()) return result.text.trim();
    }

    return `${state.draft.markdown}

## 根据对话继续修改

修改要求：${instruction}

已在当前对话中保留原有文章结构，并按新要求继续调整。连接 DeepSeek 或 OpenClaw 后，这里会由模型完成更细的语义改写。`;
  }

  async generateAssistantReply(state) {
    if (!this.context.model.configured) {
      return "我还没有连接可用的模型。请在设置里保存 DeepSeek API Key，或在后端启动时配置 DEEPSEEK_API_KEY。";
    }

    const chatMessages = (state.messages || [])
      .filter((message) => !message.pending && ["user", "assistant"].includes(message.role))
      .slice(-16)
      .map((message) => ({
        role: message.role,
        content: message.content
      }));

    const result = await this.context.model.chat({
      system: "你是 ViewPull 的个人 AI 助手。正常对话时直接回答用户，不要默认修改文章。回答使用中文，简洁但有帮助。",
      messages: chatMessages,
      temperature: 0.7
    });

    if (result.ok && result.text.trim()) return result.text.trim();
    return `我现在没能成功调用模型：${result.error || "未知错误"}。`;
  }

  async runResearchLoop(initialState) {
    let state = initialState;

    while (state.loops.researchRound < 3) {
      state = appendLog(state, `Research Loop ${state.loops.researchRound + 1}/3`);
      this.emit(state);
      state = await this.runNode(state, "researchSources", "Reading Sources");
      state = await this.runNode(state, "extractFacts", "Extracting Facts");

      if (isResearchEnough(state)) {
        state = appendLog(state, "Research sufficient", { level: "success" });
        this.emit(state);
        return state;
      }
    }

    state = appendLog(state, "Research loop reached max rounds", { level: "warn" });
    this.emit(state);
    return state;
  }

  async runReviewLoop(initialState) {
    let state = initialState;

    while (state.loops.reviewRound < 2) {
      state = appendLog(state, `Review Loop ${state.loops.reviewRound + 1}/2`);
      this.emit(state);
      state = await this.runNode(state, "reviewDraft", "Reviewing Draft");

      if (state.reviewResult.passed) {
        state = appendLog(state, "Review passed", { level: "success" });
        this.emit(state);
        return state;
      }

      state = await this.runNode(state, "reviseDraft", "Revising Draft");
    }

    state = appendLog(state, "Review loop reached max rounds", { level: "warn" });
    this.emit(state);
    return state;
  }

  async runNode(state, nodeName, message) {
    let nextState = await this.context.loop.runNode(state, nodeName, message, this.context, (currentState) => this.emit(currentState));
    if (nodeName === "generateDraft" || nodeName === "reviseDraft") {
      this.context.document.saveDraftSet(nextState, nextState.draft);
      nextState = appendLog(nextState, "Filesystem snapshot saved", {
        level: "success",
        node: nodeName
      });
      this.context.checkpointer.save(nextState.taskId, nextState, { phase: "filesystem_snapshot", node: nodeName });
      this.emit(nextState);
    }
    this.context.memory.rememberTask(nextState, `node.${nodeName}.completed`);
    return nextState;
  }

  emit(state) {
    this.onStateChange(structuredClone(state));
  }
}

function updateDraftVariants(variants = [], markdown) {
  if (!variants.length) {
    return [
      {
        platform: "wechat",
        title: "当前文章",
        markdown,
        metadata: { tone: "持续对话修改", audience: "内容读者" }
      }
    ];
  }

  return variants.map((variant) => (
    variant.platform === "wechat" || variant.platform === "markdown"
      ? {
          ...variant,
          markdown
        }
      : variant
  ));
}
