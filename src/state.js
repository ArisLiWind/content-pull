export const WORKFLOW_STATUS = {
  IDLE: "idle",
  RUNNING: "running",
  WAITING_APPROVAL: "waiting_approval",
  READY: "ready",
  PUBLISHING: "publishing",
  DONE: "done",
  FAILED: "failed"
};

export function createTaskState(userInput) {
  const now = new Date().toISOString();
  const platforms = detectPlatforms(userInput);

  return {
    taskId: crypto.randomUUID(),
    userInput,
    messages: [
      {
        id: crypto.randomUUID(),
        role: "user",
        content: userInput,
        createdAt: now
      }
    ],
    status: WORKFLOW_STATUS.IDLE,
    topic: {
      raw: userInput,
      normalized: normalizeTopic(userInput),
      targetAudience: "中文科技与商业读者",
      platforms,
      language: "zh",
      contentGoal: "发现高注意力选题并生成可发布内容"
    },
    sources: [],
    facts: [],
    attentionScore: {
      score: 0,
      reasons: [],
      signals: []
    },
    trendAnalysis: {
      summary: "",
      opportunities: [],
      risks: [],
      angles: []
    },
    outline: {
      title: "",
      sections: []
    },
    draft: {
      markdown: "",
      variants: [],
      currentVersion: 0,
      editHistory: []
    },
    reviewResult: {
      passed: false,
      score: 0,
      issues: [],
      suggestions: []
    },
    publishStatus: {
      status: "idle",
      platform: null,
      attempts: 0,
      lastError: "",
      outputs: []
    },
    loops: {
      researchRound: 0,
      reviewRound: 0,
      publishRetry: 0
    },
    logs: [],
    currentNode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function applyStatePatch(state, patch) {
  return {
    ...state,
    ...patch,
    topic: { ...state.topic, ...(patch.topic || {}) },
    attentionScore: { ...state.attentionScore, ...(patch.attentionScore || {}) },
    trendAnalysis: { ...state.trendAnalysis, ...(patch.trendAnalysis || {}) },
    outline: { ...state.outline, ...(patch.outline || {}) },
    draft: { ...state.draft, ...(patch.draft || {}) },
    reviewResult: { ...state.reviewResult, ...(patch.reviewResult || {}) },
    publishStatus: { ...state.publishStatus, ...(patch.publishStatus || {}) },
    loops: { ...state.loops, ...(patch.loops || {}) },
    updatedAt: new Date().toISOString()
  };
}

export function appendLog(state, message, options = {}) {
  const log = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level: options.level || "info",
    node: options.node || state.currentNode,
    message,
    data: options.data || null
  };

  return applyStatePatch(state, {
    logs: [...state.logs, log]
  });
}

function normalizeTopic(input) {
  return input
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectPlatforms(input) {
  const platforms = [];
  if (/公众号|微信|wechat/i.test(input)) platforms.push("wechat");
  if (/小红书|xiaohongshu|rednote/i.test(input)) platforms.push("xiaohongshu");
  if (/\bX\b|Twitter/i.test(input)) platforms.push("x");
  if (/LinkedIn|领英/i.test(input)) platforms.push("linkedin");
  if (!platforms.length) platforms.push("markdown");
  return platforms;
}
