import { WorkflowHarness } from "./harness.js";
import { createTaskState } from "./state.js";
import { createDefaultToolRouter } from "./tools.js";
import { createPublisherRegistry } from "./publishers.js";
import { exportBlob, renderMarkdown } from "./markdown.js";
import { ModelClient } from "./llm.js";
import {
  approveLocalAgentRequest,
  callLocalAgentTool,
  clearAccountSession,
  loadLocalAgentPanelData,
  loadAccountSession,
  loadAccountSessionFromDatabase,
  loadBackendConfig,
  loadBackendConfigFromDatabase,
  rejectLocalAgentRequest,
  saveAccountSession,
  saveBackendConfig,
  loadPublisherConnections,
  savePublisherConnection,
  syncDeepSeekApiKeyToBackend
} from "./backend.js";
import { contentDatabase, migrateLegacyLocalStorage } from "./database.js";

const app = document.querySelector("#app");
const tools = createDefaultToolRouter();
const publishers = createPublisherRegistry();
const SIDEBAR_WIDTH_KEY = "content-pull-sidebar-width";
const PREVIEW_WIDTH_KEY = "content-pull-preview-width";

const store = {
  tasks: loadTasks(),
  activeTaskId: null,
  isRunning: false,
  selectedVariant: "wechat",
  sidebarMode: "tasks",
  searchQuery: "",
  previewMode: "file",
  sidebarWidth: loadSidebarWidth(),
  previewWidth: loadPreviewWidth(),
  accountMenuOpen: false,
  accountView: "menu",
  account: loadAccountSession(),
  backendConfig: loadBackendConfig(),
  backendStatus: createBackendStatus(),
  localAgent: createLocalAgentPanelState(),
  publisherConnections: [],
  accountNotice: "",
  hasUpdate: false
};

bootstrap();

async function bootstrap() {
  await contentDatabase.ready();
  await migrateLegacyLocalStorage();
  store.tasks = await loadTasksFromDatabase();
  store.account = await loadAccountSessionFromDatabase();
  store.backendConfig = await loadBackendConfigFromDatabase();

  if (store.tasks.length) {
    store.activeTaskId = store.tasks[0].taskId;
  }

  render();
}

function render() {
  const activeTask = getActiveTask();
  app.innerHTML = `
    <main class="workspace" style="${workspaceGridStyle()}">
      ${renderSidebar(activeTask)}
      <div class="panel-resizer sidebar-resizer" data-action="resize-sidebar" title="拖动调整侧栏宽度"></div>
      ${renderMainPanel(activeTask)}
      <div class="panel-resizer preview-resizer" data-action="resize-preview" title="拖动调整文件栏宽度"></div>
      ${renderPreviewPanel(activeTask)}
    </main>
  `;

  bindEvents();
}

function renderSidebar(activeTask) {
  const visibleTasks = getVisibleSidebarTasks();

  return `
    <aside class="sidebar">
      <div class="window-controls" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <nav class="nav-list" aria-label="Main">
        <button class="nav-item ${store.sidebarMode === "tasks" ? "active" : ""}" data-action="new-task">新对话</button>
        <button class="nav-item ${store.sidebarMode === "search" ? "active" : ""}" data-action="search">搜索</button>
      </nav>

      ${store.sidebarMode === "search" ? renderSearchBox() : ""}

      <div class="section-label">Content Pull</div>
      <div class="task-list">
        ${visibleTasks
          .map(
            (task) => `
              <button class="task-item ${activeTask?.taskId === task.taskId ? "active" : ""}" data-task-id="${task.taskId}">
                <span class="task-title">${escapeHtml(displayText(task.topic.normalized || "Untitled Task"))}</span>
                <span class="task-meta">
                  <span class="status-dot ${task.status}"></span>
                  ${formatStatus(task.status)}
                </span>
              </button>
            `
          )
          .join("") || `<div class="empty task-empty">${store.sidebarMode === "search" ? "没有匹配结果" : "还没有任务"}</div>`}
      </div>
      <div class="account-wrap">
        <button class="account-row" data-action="toggle-account-menu" type="button">
        <div class="avatar">CP</div>
        <div>
          <strong>${escapeHtml(store.account.loggedIn ? store.account.name : "未登录")}</strong>
          <span>${escapeHtml(store.account.loggedIn ? store.account.plan : "点击登录")}</span>
        </div>
        ${store.hasUpdate ? `<span class="update-button">更新</span>` : ""}
        </button>
        ${store.accountMenuOpen ? renderAccountMenu() : ""}
      </div>
    </aside>
  `;
}

function renderAccountMenu() {
  if (!store.account.loggedIn) {
    return `
      <div class="account-menu">
        <div class="account-menu-head">
          <span>Content Pull</span>
          <strong>登录账号</strong>
        </div>
        <form class="account-form" data-action="account-login">
          <label>
            邮箱
            <input name="email" value="azalearedn@gmail.com" autocomplete="email" />
          </label>
          <label>
            密码
            <input name="password" type="password" placeholder="本地预览可留空" autocomplete="current-password" />
          </label>
          <button class="account-primary" type="submit">登录</button>
        </form>
        ${store.accountNotice ? `<p class="account-notice">${escapeHtml(store.accountNotice)}</p>` : ""}
      </div>
    `;
  }

  if (store.accountView === "settings") return renderSettingsPanel();
  if (store.accountView === "backend") return renderBackendStatusPanel();
  if (store.accountView === "local-agent") return renderLocalAgentPanel();
  if (store.accountView === "publishers") return renderPublisherConnectionsPanel();
  if (store.accountView === "profile") return renderSimpleAccountPanel("个人资料", "创作者账号已连接本地 Content Agent。");
  if (store.accountView === "invite") return renderSimpleAccountPanel("邀请好友", "邀请链接会在接入正式后端后生成。");
  if (store.accountView === "quota") return renderSimpleAccountPanel("剩余用量", "本地预览：30 / 100 次 Agent Run。");

  return `
    <div class="account-menu">
      <div class="account-menu-head">
        <span>${escapeHtml(store.account.email)}</span>
        <strong>个人帐户</strong>
      </div>
      <div class="account-menu-actions">
        <button data-account-view="profile" type="button">个人资料</button>
        <button data-account-view="settings" type="button">设置</button>
        <button data-account-view="backend" type="button">后端状态</button>
        <button data-account-view="local-agent" type="button">本地 Agent</button>
        <button data-account-view="publishers" type="button">发布连接</button>
        <button data-account-view="invite" type="button">邀请好友</button>
        <button data-account-view="quota" type="button">剩余用量</button>
        <button data-action="account-logout" type="button">退出登录</button>
      </div>
      ${store.accountNotice ? `<p class="account-notice">${escapeHtml(store.accountNotice)}</p>` : ""}
    </div>
  `;
}

function renderSettingsPanel() {
  return `
    <div class="account-menu account-menu-large">
      <div class="account-panel-head">
        <button class="account-back" data-action="account-back" type="button">‹</button>
        <strong>设置</strong>
      </div>
      <form class="account-form" data-action="save-backend-config">
        <label>
          DeepSeek API Key
          <input name="apiKey" value="${escapeHtml(store.backendConfig.apiKey)}" placeholder="sk-..." autocomplete="off" />
        </label>
        <button class="account-primary" type="submit">保存配置</button>
      </form>
      <button class="account-secondary" data-action="test-deepseek" type="button">测试 DeepSeek</button>
      ${store.accountNotice ? `<p class="account-notice">${escapeHtml(store.accountNotice)}</p>` : ""}
    </div>
  `;
}

function renderBackendStatusPanel() {
  const status = store.backendStatus;
  const rows = [
    ["DeepSeek", store.backendConfig.apiKey ? "已保存" : "等待 API Key"],
    ["OpenClaw", status.openclawMode],
    ["MCP", status.mcp],
    ["Memory", status.memory],
    ["Filesystem", status.filesystem],
    ["Publisher", status.publisher]
  ];

  return `
    <div class="account-menu account-menu-large">
      <div class="account-panel-head">
        <button class="account-back" data-action="account-back" type="button">‹</button>
        <strong>后端状态</strong>
      </div>
      <div class="backend-status-list">
        ${rows
          .map(
            ([label, value]) => `
              <div class="backend-status-row">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
      <p class="account-panel-copy">OpenClaw、MCP、Memory 属于 Content Pull 内置后端能力。需要云端部署时，只配置 OPENCLAW_REMOTE_URL，不依赖本机 CLI/Gateway。</p>
    </div>
  `;
}

function renderLocalAgentPanel() {
  const pendingApprovals = store.localAgent.approvals.filter((approval) => approval.status === "pending");
  const permissions = store.localAgent.status?.permissions || [];
  const audit = store.localAgent.audit.slice(-5).reverse();

  return `
    <div class="account-menu account-menu-large local-agent-panel">
      <div class="account-panel-head">
        <button class="account-back" data-action="account-back" type="button">‹</button>
        <strong>本地 Agent</strong>
      </div>
      <div class="agent-actions">
        <button class="account-secondary" data-action="refresh-local-agent" type="button">刷新状态</button>
        <button class="account-secondary" data-action="test-chrome-cdp" type="button">测试 Chrome CDP</button>
      </div>

      <div class="backend-status-list">
        ${permissions
          .map(
            (permission) => `
              <div class="backend-status-row">
                <span>${escapeHtml(permission.name)}</span>
                <strong>${escapeHtml(permission.status)}</strong>
              </div>
            `
          )
          .join("") || `<div class="empty">等待读取本地 Agent 状态</div>`}
      </div>

      <div class="agent-section">
        <strong>待审批</strong>
        ${pendingApprovals
          .map(
            (approval) => `
              <div class="approval-card">
                <span>${escapeHtml(approval.tool)}</span>
                <p>${escapeHtml(approval.reason)}</p>
                <code>${escapeHtml(JSON.stringify(approval.input || {}))}</code>
                <div class="approval-actions">
                  <button data-action="approve-local-agent" data-approval-id="${escapeHtml(approval.id)}" type="button">批准</button>
                  <button data-action="reject-local-agent" data-approval-id="${escapeHtml(approval.id)}" type="button">拒绝</button>
                </div>
              </div>
            `
          )
          .join("") || `<p class="account-panel-copy">没有待审批请求。</p>`}
      </div>

      <div class="agent-section">
        <strong>最近审计</strong>
        ${audit
          .map((event) => `<p class="audit-line">${escapeHtml(event.type)} · ${formatTime(event.createdAt)}</p>`)
          .join("") || `<p class="account-panel-copy">暂无审计事件。</p>`}
      </div>
      ${store.accountNotice ? `<p class="account-notice">${escapeHtml(store.accountNotice)}</p>` : ""}
    </div>
  `;
}

function renderPublisherConnectionsPanel() {
  const wechat = store.publisherConnections.find((connection) => connection.platform === "wechat") || {};
  const webhook = store.publisherConnections.filter((connection) => connection.platform !== "wechat");

  return `
    <div class="account-menu account-menu-large publisher-panel">
      <div class="account-panel-head">
        <button class="account-back" data-action="account-back" type="button">‹</button>
        <strong>发布连接</strong>
      </div>

      <div class="publisher-status-list">
        <div class="publisher-status-row">
          <span>微信文章</span>
          <strong>${wechat.hasWechatApp || wechat.hasWechatAccessToken ? "已连接" : "待配置"}</strong>
        </div>
        <div class="publisher-status-row">
          <span>封面素材</span>
          <strong>${wechat.hasThumbMediaId ? "已配置" : "需要 thumbMediaId"}</strong>
        </div>
        ${webhook
          .map((connection) => `
            <div class="publisher-status-row">
              <span>${escapeHtml(platformLabel(connection.platform))}</span>
              <strong>${connection.webhookUrl ? "Webhook 已连接" : "待配置"}</strong>
            </div>
          `)
          .join("")}
      </div>

      <form class="account-form" data-action="save-publisher-connection">
        <input name="platform" type="hidden" value="wechat" />
        <label>
          微信 AppID
          <input name="appId" placeholder="公众号 AppID" autocomplete="off" />
        </label>
        <label>
          微信 AppSecret
          <input name="appSecret" type="password" placeholder="${wechat.hasWechatApp ? "已保存，留空则不覆盖" : "公众号 AppSecret"}" autocomplete="off" />
        </label>
        <label>
          Access Token
          <input name="accessToken" type="password" placeholder="${wechat.hasWechatAccessToken ? "已保存，留空则不覆盖" : "可选，通常使用 AppID/AppSecret 自动获取"}" autocomplete="off" />
        </label>
        <label>
          封面素材 thumbMediaId
          <input name="thumbMediaId" placeholder="${wechat.hasThumbMediaId ? "已保存，留空则不覆盖" : "微信永久素材 media_id"}" autocomplete="off" />
        </label>
        <label>
          作者
          <input name="author" placeholder="Content Pull" autocomplete="off" />
        </label>
        <label class="checkbox-label">
          <input name="autoPublish" type="checkbox" ${wechat.autoPublish ? "checked" : ""} />
          创建草稿后自动提交发布
        </label>
        <button class="account-primary" type="submit">保存微信连接</button>
      </form>

      <form class="account-form" data-action="save-publisher-connection">
        <label>
          平台
          <select name="platform">
            <option value="x">X / Twitter</option>
            <option value="linkedin">LinkedIn</option>
            <option value="xiaohongshu">视频剧本 Webhook</option>
          </select>
        </label>
        <label>
          Webhook URL
          <input name="webhookUrl" placeholder="https://..." autocomplete="off" />
        </label>
        <label>
          API Key
          <input name="apiKey" type="password" placeholder="可选" autocomplete="off" />
        </label>
        <button class="account-secondary" type="submit">保存 Webhook 连接</button>
      </form>

      ${store.accountNotice ? `<p class="account-notice">${escapeHtml(store.accountNotice)}</p>` : ""}
    </div>
  `;
}

function renderSimpleAccountPanel(title, body) {
  return `
    <div class="account-menu">
      <div class="account-panel-head">
        <button class="account-back" data-action="account-back" type="button">‹</button>
        <strong>${escapeHtml(title)}</strong>
      </div>
      <p class="account-panel-copy">${escapeHtml(body)}</p>
    </div>
  `;
}

function createBackendStatus() {
  return {
    openclawMode: "内置 Harness",
    mcp: "已启用 /mcp",
    memory: "content-pull-memory",
    filesystem: "已启用",
    publisher: "人工确认后发布"
  };
}

function createLocalAgentPanelState() {
  return {
    status: null,
    approvals: [],
    audit: []
  };
}

function renderSearchBox() {
  return `
    <form class="search-form" data-action="search-form">
      <input name="query" value="${escapeHtml(store.searchQuery)}" placeholder="搜索内容任务" autocomplete="off" />
      ${store.searchQuery ? `<button type="button" data-action="clear-search">清除</button>` : ""}
    </form>
  `;
}

function renderMainPanel(task) {
  const defaultPrompt = "帮我研究今天最重要的 AI 技术进展，整理成可执行的个人简报和发布草稿。";
  const composerValue = task ? "" : defaultPrompt;
  const composerPlaceholder = task ? "继续输入，让 Content Pull 接着处理" : "告诉 Content Pull 你想完成什么";

  return `
    <section class="main-panel">
      <div class="thread">
        <div class="empty-state">
          <h2>你想让 <span>Content Pull</span> 帮你完成什么？</h2>
        </div>
        ${task ? renderConversation(task) : ""}
      </div>

      <div class="composer-wrap">
        <form class="goal-form composer" data-action="run-task">
          <textarea name="goal" rows="3" placeholder="${composerPlaceholder}">${escapeHtml(displayText(composerValue))}</textarea>
          <div class="composer-actions">
            <span class="composer-meta">${task ? "继续当前对话，必要时更新右侧文件" : "Content Pull / local"}</span>
            <button ${store.isRunning ? "disabled" : ""} type="submit">↑</button>
          </div>
        </form>
        <form class="revision-form" data-action="revise">
          <input name="instruction" placeholder="要求后续变更" ${!task?.draft.markdown ? "disabled" : ""} />
          <button ${!task?.draft.markdown || store.isRunning ? "disabled" : ""} type="submit">修改</button>
        </form>
      </div>
    </section>
  `;
}

function renderConversation(task) {
  const messages = task.messages?.length
    ? task.messages
    : [{ id: "initial", role: "user", content: task.userInput }];

  return `
    <section class="conversation">
      ${messages.map(renderMessage).join("")}
      ${renderProgress(task)}
      ${renderWaitingState(task)}
    </section>
  `;
}

function renderMessage(message) {
  const isUser = message.role === "user";
  return `
    <article class="message ${isUser ? "user-message" : "assistant-message"}">
      <p>${escapeHtml(displayText(message.content))}</p>
    </article>
  `;
}

function renderPreviewPanel(task) {
  const variants = task?.draft.variants || [];
  const activeVariant = variants.find((variant) => variant.platform === store.selectedVariant) || variants[0];
  const markdown = getPreviewMarkdown(task, activeVariant);
  const html = markdown ? renderMarkdown(displayText(markdown)) : "";
  const publishedTasks = getPublishedTasks();
  const reviewTasks = getReviewTasks();

  return `
    <aside class="preview-panel">
      <div class="preview-header">
        <strong>文件</strong>
      </div>

      <div class="stats-row">
        <button class="stat-button ${store.previewMode === "published" ? "active" : ""}" data-preview-mode="published">
          <strong>${publishedTasks.length}</strong><span>今日发布</span>
        </button>
        <button class="stat-button ${store.previewMode === "review" ? "active" : ""}" data-preview-mode="review">
          <strong>${reviewTasks.length}</strong><span>待审核</span>
        </button>
      </div>

      ${
        store.previewMode === "published"
          ? renderTaskListPanel("今日发布", publishedTasks)
          : store.previewMode === "review"
            ? renderTaskListPanel("待审核", reviewTasks)
            : renderFilePanel({ variants, activeVariant, markdown, html })
      }
    </aside>
  `;
}

function renderFilePanel({ variants, activeVariant, markdown, html }) {
  const isVideoScript = activeVariant?.platform === "xiaohongshu";
  const primaryAction = isVideoScript ? "export-md" : "publish";
  const primaryLabel = isVideoScript ? "导出" : "发布";

  return `
    <section class="file-panel">
      <div class="file-toolbar">
        <div class="variant-tabs">
          ${variants
            .map(
              (variant) => `
                <button class="${activeVariant?.platform === variant.platform ? "active" : ""}" data-variant="${variant.platform}">
                  ${platformLabel(variant.platform)}
                </button>
              `
            )
            .join("") || `<button class="active" disabled>预览</button>`}
          </div>
          <div class="doc-actions">
            <button class="primary-action" data-action="${primaryAction}" ${!markdown ? "disabled" : ""}>${primaryLabel}</button>
          </div>
        </div>
      ${
        markdown
          ? `<article class="markdown-preview">${html}</article>`
          : `<div class="preview-empty">从工作区目录树中选择文件</div>`
      }
    </section>
  `;
}

function renderTaskListPanel(title, tasks) {
  return `
    <section class="preview-list-panel">
      <div class="preview-list-header">
        <strong>${title}</strong>
        <button data-preview-mode="file" type="button">返回文件</button>
      </div>
      <div class="preview-task-list">
        ${tasks
          .map(
            (task) => `
              <button class="preview-task-item" data-open-preview-task="${task.taskId}">
                <span>${escapeHtml(displayText(task.topic.normalized || "Untitled Task"))}</span>
                <em>${formatStatus(task.status)}</em>
              </button>
            `
          )
          .join("") || `<div class="preview-empty">暂无${title}内容</div>`}
      </div>
    </section>
  `;
}

function renderProgress(task) {
  const recentLogs = (task.logs || []).slice(-6);

  return `
    <section class="run-card">
      <div class="run-summary">
        <div>
          <span>当前节点</span>
          <strong>${task.currentNode || "准备中"}</strong>
        </div>
        <div>
          <span>研究</span>
          <strong>${task.loops.researchRound || 0}/3</strong>
        </div>
        <div>
          <span>审稿</span>
          <strong>${task.loops.reviewRound || 0}/2</strong>
        </div>
      </div>
      <div class="log-stream">
        ${recentLogs
          .map(
            (log) => `
              <div class="log-line ${log.level}">
                <span>${formatTime(log.timestamp)}</span>
                <p>${escapeHtml(log.message)}</p>
              </div>
            `
          )
          .join("") || `<div class="empty">等待任务启动</div>`}
      </div>
    </section>
  `;
}

function renderWaitingState(task) {
  return `
    <article class="message assistant-message">
      <p>${store.isRunning ? "Content Pull 正在回复..." : `会话状态：${formatStatus(task.status)}。`}</p>
    </article>
  `;
}

function bindEvents() {
  app.onclick = (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.action === "toggle-account-menu") {
      store.accountMenuOpen = !store.accountMenuOpen;
      store.accountView = "menu";
      store.accountNotice = "";
      render();
      return;
    }

    if (button.dataset.accountView) {
      store.accountView = button.dataset.accountView;
      store.accountNotice = "";
      render();
      if (button.dataset.accountView === "local-agent") refreshLocalAgentPanel();
      if (button.dataset.accountView === "publishers") refreshPublisherConnections();
      return;
    }

    if (button.dataset.action === "account-back") {
      store.accountView = "menu";
      store.accountNotice = "";
      render();
      return;
    }

    if (button.dataset.action === "account-logout") {
      store.account = clearAccountSession();
      store.accountView = "menu";
      store.accountNotice = "已退出登录。";
      render();
      return;
    }

    if (button.dataset.action === "test-deepseek") {
      testDeepSeekConnection();
    }

    if (button.dataset.action === "refresh-local-agent") {
      refreshLocalAgentPanel();
    }

    if (button.dataset.action === "approve-local-agent") {
      approveLocalAgent(button.dataset.approvalId);
    }

    if (button.dataset.action === "reject-local-agent") {
      rejectLocalAgent(button.dataset.approvalId);
    }

    if (button.dataset.action === "test-chrome-cdp") {
      testChromeCdp();
    }
  };

  document.querySelector("[data-action='account-login']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get("email").toString().trim();
    if (!email) {
      store.accountNotice = "请输入邮箱。";
      render();
      return;
    }
    store.account = saveAccountSession({
      loggedIn: true,
      email,
      name: "创作者",
      plan: "Content Pull Pro"
    });
    store.accountView = "menu";
    store.accountNotice = "已登录。";
    render();
  });

  document.querySelector("[data-action='save-backend-config']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    store.backendConfig = saveBackendConfig({
      apiKey: form.get("apiKey")
    });
    store.accountNotice = "DeepSeek API Key 已保存，正在同步到后端...";
    render();

    const result = await syncDeepSeekApiKeyToBackend(store.backendConfig.apiKey);
    store.accountNotice = result.ok
      ? "DeepSeek API Key 已保存，并已同步到后端。"
      : `DeepSeek API Key 已保存到前端，但同步后端失败：${result.error}`;
    render();
  });

  document.querySelectorAll("[data-action='save-publisher-connection']").forEach((formEl) => {
    formEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await savePublisherConnectionFromForm(form);
    });
  });

  document.querySelector("[data-action='new-task']")?.addEventListener("click", () => {
    store.activeTaskId = null;
    store.selectedVariant = "wechat";
    store.sidebarMode = "tasks";
    store.accountMenuOpen = false;
    render();
  });

  document.querySelector("[data-action='search']")?.addEventListener("click", () => {
    store.sidebarMode = "search";
    store.accountMenuOpen = false;
    render();
    document.querySelector(".search-form input")?.focus();
  });

  document.querySelector("[data-action='search-form']")?.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  document.querySelector(".search-form input")?.addEventListener("input", (event) => {
    store.searchQuery = event.target.value;
    render();
    const input = document.querySelector(".search-form input");
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  });

  document.querySelector("[data-action='clear-search']")?.addEventListener("click", () => {
    store.searchQuery = "";
    render();
    document.querySelector(".search-form input")?.focus();
  });

  document.querySelectorAll("[data-task-id]").forEach((button) => {
    button.addEventListener("click", () => {
      store.activeTaskId = button.dataset.taskId;
      store.selectedVariant = "wechat";
      store.previewMode = "file";
      render();
    });
  });

  document.querySelectorAll("[data-preview-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      store.previewMode = button.dataset.previewMode;
      render();
    });
  });

  document.querySelectorAll("[data-open-preview-task]").forEach((button) => {
    button.addEventListener("click", () => {
      store.activeTaskId = button.dataset.openPreviewTask;
      store.selectedVariant = "wechat";
      store.previewMode = "file";
      render();
    });
  });

  document.querySelector("[data-action='run-task']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (store.isRunning) return;
    const goal = new FormData(event.currentTarget).get("goal").toString().trim();
    if (!goal) return;

    const activeTask = getActiveTask();
    store.isRunning = true;
    render();

    const harness = new WorkflowHarness(
      {
        tools,
        publishers,
        renderMarkdown,
        backendConfig: store.backendConfig
      },
      (nextState) => {
        upsertTask(nextState);
        render();
      }
    );

    try {
      if (activeTask) {
        await harness.continueConversation(activeTask, goal);
      } else {
        const task = createTaskState(goal);
        store.activeTaskId = task.taskId;
        upsertTask(task);
        await harness.continueConversation(task, goal, { appendUser: false });
      }
    } finally {
      store.isRunning = false;
      persistTasks();
      render();
    }
  });

  document.querySelector("[data-action='revise']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const task = getActiveTask();
    if (!task || store.isRunning) return;
    const instruction = new FormData(event.currentTarget).get("instruction").toString().trim();
    if (!instruction) return;

    store.isRunning = true;
    const harness = new WorkflowHarness(
      {
        tools,
        publishers,
        renderMarkdown,
        backendConfig: store.backendConfig
      },
      (nextState) => {
        upsertTask(nextState);
        render();
      }
    );

    try {
      await harness.applyNaturalLanguageRevision(task, instruction);
    } finally {
      store.isRunning = false;
      persistTasks();
      render();
    }
  });

  document.querySelector("[data-action='publish']")?.addEventListener("click", async () => {
    const task = getActiveTask();
    if (!task || store.isRunning) return;
    store.isRunning = true;
    render();

    const harness = new WorkflowHarness(
      {
        tools,
        publishers,
        renderMarkdown,
        backendConfig: store.backendConfig
      },
      (nextState) => {
        upsertTask(nextState);
        render();
      }
    );

    try {
      await harness.runPublishLoop(task);
    } finally {
      store.isRunning = false;
      persistTasks();
      render();
    }
  });

  document.querySelector("[data-action='copy']")?.addEventListener("click", async () => {
    const markdown = getCurrentMarkdown();
    if (markdown) await navigator.clipboard.writeText(markdown);
  });

  document.querySelector("[data-action='export-md']")?.addEventListener("click", () => {
    const task = getActiveTask();
    const markdown = getCurrentMarkdown();
    if (task && markdown) exportBlob(`${safeFileName(task.outline.title || "content-pull-draft")}.md`, markdown, "text/markdown");
  });

  document.querySelector("[data-action='export-html']")?.addEventListener("click", () => {
    const task = getActiveTask();
    const markdown = getCurrentMarkdown();
    if (task && markdown) {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(task.outline.title)}</title></head><body>${renderMarkdown(markdown)}</body></html>`;
      exportBlob(`${safeFileName(task.outline.title || "content-pull-draft")}.html`, html, "text/html");
    }
  });

  document.querySelectorAll("[data-variant]").forEach((button) => {
    button.addEventListener("click", () => {
      store.selectedVariant = button.dataset.variant;
      store.previewMode = "file";
      render();
    });
  });

  bindPanelResizers();
}

async function testDeepSeekConnection() {
  if (!store.backendConfig.apiKey) {
    store.accountNotice = "请先输入并保存 DeepSeek API Key。";
    render();
    return;
  }

  store.accountNotice = "正在测试 DeepSeek 连接...";
  render();

  const model = new ModelClient(store.backendConfig);
  const result = await model.chat({
    system: "你是 Content Pull 的连接测试助手。",
    messages: [
      {
        role: "user",
        content: "用一句中文确认 DeepSeek 已经接入 Content Pull。"
      }
    ],
    temperature: 0.2
  });

  store.accountNotice = result.ok
    ? `DeepSeek 已生效：${result.text.slice(0, 80)}`
    : `DeepSeek 测试失败：${result.error}`;
  render();
}

async function refreshPublisherConnections() {
  store.accountNotice = "正在读取发布连接...";
  render();

  const result = await loadPublisherConnections();
  if (!result.ok) {
    store.accountNotice = `读取发布连接失败：${result.error}`;
  } else {
    store.publisherConnections = result.connections || [];
    store.accountNotice = "发布连接已更新。";
  }
  render();
}

async function savePublisherConnectionFromForm(form) {
  store.accountNotice = "正在保存发布连接...";
  render();

  const payload = {
    platform: String(form.get("platform") || "").trim(),
    webhookUrl: String(form.get("webhookUrl") || "").trim(),
    apiKey: String(form.get("apiKey") || "").trim(),
    appId: String(form.get("appId") || "").trim(),
    appSecret: String(form.get("appSecret") || "").trim(),
    accessToken: String(form.get("accessToken") || "").trim(),
    thumbMediaId: String(form.get("thumbMediaId") || "").trim(),
    author: String(form.get("author") || "").trim(),
    autoPublish: form.get("autoPublish") === "on"
  };

  const result = await savePublisherConnection(payload);
  store.accountNotice = result.ok ? "发布连接已保存。发布按钮会自动使用该连接。" : `保存失败：${result.error}`;
  await refreshPublisherConnections();
}

async function refreshLocalAgentPanel() {
  store.accountNotice = "正在读取本地 Agent 状态...";
  render();

  const data = await loadLocalAgentPanelData();
  if (data.error) {
    store.accountNotice = `读取本地 Agent 失败：${data.error}`;
  } else {
    store.localAgent = {
      status: data.status,
      approvals: data.approvals,
      audit: data.audit
    };
    store.accountNotice = "本地 Agent 状态已更新。";
  }
  render();
}

async function approveLocalAgent(approvalId) {
  if (!approvalId) return;
  store.accountNotice = "正在批准本地 Agent 请求...";
  render();

  const result = await approveLocalAgentRequest(approvalId);
  store.accountNotice = result.ok ? "已批准请求。请重新执行对应操作。" : `批准失败：${result.error}`;
  await refreshLocalAgentPanel();
}

async function rejectLocalAgent(approvalId) {
  if (!approvalId) return;
  store.accountNotice = "正在拒绝本地 Agent 请求...";
  render();

  const result = await rejectLocalAgentRequest(approvalId);
  store.accountNotice = result.ok ? "已拒绝请求。" : `拒绝失败：${result.error}`;
  await refreshLocalAgentPanel();
}

async function testChromeCdp() {
  store.accountNotice = "正在测试 Chrome CDP...";
  render();

  const result = await callLocalAgentTool("local.chrome.status");
  store.accountNotice = result.ok
    ? `Chrome CDP 已连接：${result.tabCount || 0} 个标签页。`
    : `Chrome CDP 未连接：${result.error}`;
  await refreshLocalAgentPanel();
}

function getCurrentMarkdown() {
  const task = getActiveTask();
  if (!task) return "";
  const variant = task.draft.variants.find((item) => item.platform === store.selectedVariant);
  return getPreviewMarkdown(task, variant);
}

function getPreviewMarkdown(task, variant) {
  if (!task) return "";
  if (isAssistantReplySnapshot(task)) return "";
  return variant?.markdown || task.draft.markdown || "";
}

function isAssistantReplySnapshot(task) {
  const history = task?.draft?.editHistory || [];
  return history.at(-1)?.type === "assistant_reply_snapshot";
}

function getVisibleSidebarTasks() {
  if (store.sidebarMode !== "search") return store.tasks;
  const query = store.searchQuery.trim().toLowerCase();
  if (!query) return store.tasks;
  return store.tasks.filter((task) => {
    const values = [
      task.userInput,
      task.topic.normalized,
      task.outline.title,
      task.status,
      ...(task.draft.variants || []).map((variant) => `${variant.platform} ${variant.markdown || ""}`)
    ];
    return values.some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function getPublishedTasks() {
  return store.tasks.filter((task) => task.status === "done" || (task.publishStatus?.outputs || []).length > 0);
}

function getReviewTasks() {
  return store.tasks.filter((task) => ["waiting_approval", "ready"].includes(task.status));
}

function getActiveTask() {
  return store.tasks.find((task) => task.taskId === store.activeTaskId) || null;
}

function upsertTask(task) {
  const index = store.tasks.findIndex((item) => item.taskId === task.taskId);
  if (index >= 0) {
    store.tasks[index] = task;
  } else {
    store.tasks.unshift(task);
  }
  persistTasks();
}

async function loadTasksFromDatabase() {
  const tasks = await contentDatabase.listTasks();
  return tasks.length ? tasks : loadTasks();
}

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem("content-pull-tasks") || "[]");
  } catch {
    return [];
  }
}

function persistTasks() {
  localStorage.setItem("content-pull-tasks", JSON.stringify(store.tasks.slice(0, 20)));
  for (const task of store.tasks.slice(0, 80)) contentDatabase.putTask(task);
}

function bindPanelResizers() {
  bindPanelResizer("resize-sidebar", "sidebar");
  bindPanelResizer("resize-preview", "preview");
}

function bindPanelResizer(action, target) {
  const resizer = document.querySelector(`[data-action='${action}']`);
  if (!resizer) return;

  resizer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing-panel");

    const onPointerMove = (moveEvent) => {
      if (target === "sidebar") {
        store.sidebarWidth = clamp(moveEvent.clientX, 240, Math.min(460, window.innerWidth - store.previewWidth - 520));
      } else {
        store.previewWidth = clamp(window.innerWidth - moveEvent.clientX, 300, Math.min(720, window.innerWidth - store.sidebarWidth - 520));
      }
      updateWorkspaceGrid();
    };

    const onPointerUp = () => {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(store.sidebarWidth));
      localStorage.setItem(PREVIEW_WIDTH_KEY, String(store.previewWidth));
      document.body.classList.remove("is-resizing-panel");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
}

function updateWorkspaceGrid() {
  document.querySelector(".workspace")?.setAttribute("style", workspaceGridStyle());
}

function workspaceGridStyle() {
  return `grid-template-columns: ${store.sidebarWidth}px 8px minmax(360px, 1fr) 8px ${store.previewWidth}px;`;
}

function loadSidebarWidth() {
  const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  return Number.isFinite(stored) ? clamp(stored, 240, 460) : 310;
}

function loadPreviewWidth() {
  const stored = Number(localStorage.getItem(PREVIEW_WIDTH_KEY));
  return Number.isFinite(stored) ? clamp(stored, 300, 720) : 390;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatStatus(status) {
  const labels = {
    idle: "空闲",
    running: "运行中",
    waiting_approval: "待确认",
    ready: "就绪",
    publishing: "发布中",
    done: "完成",
    failed: "失败"
  };
  return labels[status] || status;
}

function platformLabel(platform) {
  const labels = {
    wechat: "文章",
    xiaohongshu: "视频剧本",
    markdown: "Markdown",
    html: "HTML",
    x: "X",
    linkedin: "LinkedIn"
  };
  return labels[platform] || platform;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function safeFileName(value) {
  return value.replace(/[^\w\u4e00-\u9fa5-]+/g, "-").replace(/^-+|-+$/g, "") || "content-pull-draft";
}

function displayText(value) {
  return String(value || "")
    .replace(/公众号/g, "文章")
    .replace(/小红书/g, "视频剧本");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
