import { config } from "./config.mjs";

export async function generateArticle(input) {
  const result = await callDeepSeek([
    {
      role: "system",
      content: [
        "你是 Content Pull 的 AI 写作 Agent。",
        "你的任务是把用户输入变成一篇可继续修改的中文文章。",
        "只输出 Markdown 正文，不要解释过程。"
      ].join("\n")
    },
    {
      role: "user",
      content: `用户输入：${input}\n\n请生成一篇结构清晰、有标题、有观点、可继续修改的文章。`
    }
  ]);

  return result.text;
}

export async function reviseArticle({ currentDraft, instruction, conversation }) {
  const recentContext = conversation
    .slice(-8)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  const result = await callDeepSeek([
    {
      role: "system",
      content: [
        "你是 Content Pull 的 AI 写作 Agent。",
        "用户会持续要求修改同一篇文章。",
        "你必须基于原文章和上下文修改，不要新建任务。",
        "只输出修改后的完整 Markdown 正文，不要解释过程。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `最近对话：\n${recentContext}`,
        `当前文章：\n${currentDraft}`,
        `新的修改要求：${instruction}`,
        "请返回修改后的完整文章。"
      ].join("\n\n")
    }
  ]);

  return result.text;
}

async function callDeepSeek(messages) {
  if (!config.deepseek.apiKey) {
    throw new Error("DEEPSEEK_API_KEY is required.");
  }

  const response = await fetch(`${trimSlash(config.deepseek.apiBaseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.deepseek.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.deepseek.model,
      temperature: 0.7,
      messages
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API failed: ${response.status}`);
  }

  const payload = await response.json();
  return {
    text: String(payload.choices?.[0]?.message?.content || "").trim()
  };
}

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

