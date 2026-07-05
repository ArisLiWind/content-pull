# Content Pull 后端 API 配置与 Agent 调度机制说明文档

> **版本**：v0.1.0  
> **最后更新**：2026-07-03  
> **目标读者**：Content Pull 开发者与系统集成者

---

## 1. 系统架构概览

Content Pull 是一个运行在浏览器端（支持 Electron 桌面封装）的 AI Content Agent 系统。其核心定位是 **Agent Harness（代理调度平台）**，而非传统的 Workflow Builder 或 ChatBot。

### 1.1 架构层次

```
Content Agent
  ├── Harness          ← 工作流调度总控
  ├── Planning         ← 任务阶段规划
  ├── StateGraph       ← 状态图执行引擎
  ├── Agent Loop       ← 节点执行循环器
  ├── Tool Router      ← 工具调用路由
  ├── MCP              ← MCP 网关与审计追踪
  ├── Channels         ← 状态合并通道集
  ├── Memory           ← 任务记忆与审批记录
  ├── Filesystem       ← 虚拟文件系统
  ├── Document         ← 文档工作区
  ├── Checkpoint       ← 状态快照检查点
  └── Publisher        ← 插件化发布层
```

### 1.2 核心模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| **Harness** | `src/harness.js` | 工作流总控：触发研究循环、审稿循环、发布循环 |
| **StateGraph** | `src/agent-graph.js` | 定义 Agent 执行节点拓扑与编译入口/出口 |
| **Agent Loop** | `src/agent-loop.js` | 逐节点执行，含重试策略与延迟控制 |
| **Planning** | `src/planning.js` | 根据任务创建 6 阶段执行计划 |
| **Runtime** | `src/runtime.js` | 组装 Agent 运行时的工厂函数 |
| **State** | `src/state.js` | 任务状态模型、状态补丁（immutable-patch）与日志 |
| **Nodes** | `src/nodes.js` | 11 个 Agent 节点的具体实现 |
| **Channels** | `src/channels.js` | ChannelSet：LastValue / BinaryOperator 两种通道语义 |
| **Checkpoint** | `src/checkpoint.js` | 内存检查点：每节点前后持久化状态快照 |
| **MCP** | `src/mcp.js` | MCP 网关：委托 Tool Router，记录审计追踪 |
| **Tools** | `src/tools.js` | Tool Router + 内置工具注册（attention.collect / research.search / document.toHtml） |
| **Memory** | `src/memory.js` | AgentMemory：working / episodic / approvals 三类记忆 |
| **Filesystem** | `src/filesystem.js` | VirtualFilesystem：localStorage 模拟文件读写 |
| **Frontend DB** | `src/database.js` | IndexedDB-first 本地数据库，保存任务、配置、文件、记忆；不可用时回退 localStorage |
| **Document** | `src/document.js` | DocumentWorkspace：保存多平台草稿变体 |
| **Publishers** | `src/publishers.js` | PublisherRegistry + 5 个 Publisher 插件 |
| **Backend** | `src/backend.js` | 账号会话与后端 API 配置持久化 |
| **Markdown** | `src/markdown.js` | Markdown → HTML 渲染 + Blob 导出 |

---

## 2. 后端 API 参数配置

### 2.1 配置项定义

后端配置通过 `localStorage` 持久化，key 为 `content-pull-backend-config`。前端提供 **设置面板** 供用户编辑。配置项定义位于 `src/backend.js`。

#### 2.1.1 默认配置常量

```js
export const DEFAULT_BACKEND_CONFIG = {
  provider:         "deepseek",                      // V1 固定 DeepSeek
  apiBaseUrl:       "https://api.deepseek.com",      // OpenAI-compatible API 基础地址
  apiKey:           "",                               // API 认证密钥
  model:            "deepseek-chat",                  // 模型标识符
  openclawGatewayUrl: "",                             // 可选远端 OpenClaw；默认走内置后端
  openclawApiKey:   "",                               // V1 不暴露到普通用户设置页
  memoryNamespace:  "content-pull-memory"                // 记忆命名空间
};
```

#### 2.1.2 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `apiKey` | `string` | 是 | `""` | 唯一暴露给普通用户填写的 DeepSeek API Key |
| `provider` | `string` | 固定 | `deepseek` | V1 内部固定，不出现在普通用户设置页 |
| `apiBaseUrl` | `string` | 固定 | `https://api.deepseek.com` | V1 内部固定，不出现在普通用户设置页 |
| `model` | `string` | 固定 | `deepseek-chat` | V1 内部固定，不出现在普通用户设置页 |
| `openclawGatewayUrl` | `string` | 可选 | `""` | 可选云端 OpenClaw URL；默认走 Content Pull 内置 OpenClaw-compatible 后端 |
| `memoryNamespace` | `string` | 固定 | `content-pull-memory` | V1 内部固定，不出现在普通用户设置页 |

### 2.2 DeepSeek 配置

在应用左下角账号菜单进入 **设置**，普通用户只需要填写：

```text
API Key: 用户自己的 DeepSeek API Key
```

Content Pull 使用 OpenAI-compatible `/chat/completions` 形式调用模型。API Key 只保存在本地 `localStorage`，不要写入源码、README 或 GitHub Release。

本地后端服务运行时也支持从环境变量读取 DeepSeek Key：

```bash
export DEEPSEEK_API_KEY=your_deepseek_key
npm run backend:start
```

连通性测试：

```bash
npm run backend:deepseek:test
```

### 2.3 OpenClaw 后端配置

OpenClaw 能力默认由 Content Pull 内置后端承接，不依赖用户本机 OpenClaw CLI 或 Gateway。可选云端部署时使用：

```bash
export OPENCLAW_REMOTE_URL=https://your-openclaw-backend.example.com
npm run backend:start
```

Content Pull V1 内部固定配置：

```text
OpenClaw Mode: embedded
MCP Endpoint: http://127.0.0.1:8788/mcp
Memory Namespace: content-pull-memory
```

官方 OpenClaw 后端：

```text
Upstream: https://github.com/openclaw/openclaw
Local backend folder: backend/openclaw
```

启动 Content Pull 后端：

```bash
npm run backend:start
```

健康检查：

```bash
npm run backend:openclaw:check
```

`backend/content-pull/mcp.mjs` 提供内置 MCP-style tools。`src/mcp.js` 的 `McpGateway` 保留前端 Harness 内部工具路由；后端 `/mcp` 提供共享工具入口，覆盖 research、memory、filesystem、publisher.prepare。

### 2.4 Content Pull 本地后端服务

`backend/content-pull/server.mjs` 提供 V1 后端服务：

```text
GET  /health          检查 DeepSeek Key、内置 OpenClaw-compatible Runtime、MCP、Memory
POST /deepseek/chat   中间对话通过本地后端调用 DeepSeek
POST /deepseek/test   测试 DeepSeek 是否可响应
POST /agent/research  OpenClaw 优先，DeepSeek 兜底的研究入口
POST /mcp             MCP-style tools/list 与 tools/call
```

默认地址：

```text
http://127.0.0.1:8788
```

OpenClaw 后端层目标能力：

- Browser/CDP/Playwright：打开网页、点击 DOM、填表、读取页面、截图
- Tool Layer：web search、browser、GitHub、filesystem 等能力由官方 OpenClaw 后端承接；Content Pull 内部保留 MCP-style 工具路由抽象
- Skill System：`skill/SKILL.md` + `handler.ts`

### 2.5 配置持久化流程

```text
用户填写设置表单
  → saveBackendConfig(config)
    → 字段校验与裁剪（trim / 默认值回填）
    → localStorage.setItem("content-pull-backend-config", JSON)
    → 更新 store.backendConfig（内存状态）
    → WorkflowHarness 启动时注入 backendConfig 到 Runtime
      → McpGateway 接收 backendConfig（记录 apiBaseUrl / mcpEndpoint / model / hasApiKey）
      → MemoryCheckpointer 接收 namespace
```

### 2.6 配置读取流程

```text
loadBackendConfig()
  → localStorage.getItem("content-pull-backend-config")
    → JSON.parse + 与 DEFAULT_BACKEND_CONFIG 合并（缺失字段自动回填）
    → 返回完整配置对象
```

### 2.7 账号配置

账号状态独立于后端 API 配置，通过 `content-pull-account-session` key 存储。

```js
export const DEFAULT_ACCOUNT_SESSION = {
  loggedIn: true,
  email: "azalearedn@gmail.com",
  name: "创作者",
  plan: "Content Pull Pro"
};
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `loggedIn` | `boolean` | 登录状态 |
| `email` | `string` | 账号邮箱 |
| `name` | `string` | 显示名称 |
| `plan` | `string` | 订阅计划名称 |

### 2.8 前端本地数据库

`src/database.js` 是 Content Pull V1 的前端本地数据库层：

```text
Database: content-pull-db
Stores:
  kv      账号、后端设置等键值配置
  tasks   对话任务、状态、草稿、发布状态
  files   文章、视频剧本、平台变体文件
  memory  Agent working / episodic / approvals 记忆
```

存储策略：

- 优先使用 IndexedDB，保证比 localStorage 更适合保存长期任务和文档数据
- 如果浏览器环境不支持 IndexedDB，则自动回退 localStorage
- 启动时会迁移旧的 `content-pull-tasks`、`content-pull-files`、`content-pull-memory`
- 用户保存 DeepSeek Key、创建/继续对话、Agent 写入文件和 Memory 时，都会进入统一数据库层

---

## 3. Agent 工作流调度机制

### 3.1 调度总览

Content Pull 的 Agent 调度采用 **"图驱动 + 回路循环"** 的混合模型：

- **StateGraph** 负责定义节点拓扑和执行顺序
- **Harness** 负责生命周期控制和回路逻辑（研究回路、审稿回路、发布回路）
- **Agent Loop Runner** 负责单节点执行（含重试与延迟）
- **Channels** 负责状态合并的幂等语义

### 3.2 StateGraph（状态图）

`src/agent-graph.js` 通过 `StateGraph` 类构建节点图，暴露 `compile()` 方法生成运行时图定义。

#### 3.2.1 节点定义（共 11 个节点）

```
collectAttentionSignals  ← 入口点
    ↓
researchSources         ← 研究回路入口
    ↓
extractFacts            ← 研究回路
    ↓
analyzeTrend
    ↓
scoreAttention
    ↓
generateOutline
    ↓
generateDraft
    ↓
reviewDraft             ← 审稿回路入口
    ↓
reviseDraft             ← 审稿回路
    ↓
preparePublishing
    ↓
saveHistory             ← 终点
```

#### 3.2.2 StateGraph API

```js
class StateGraph {
  constructor({ name, stateSchema })  // 创建图实例
  addNode(name, action, options)      // 注册节点，options.retryPolicy.maxAttempts 默认 2
  addEdge(from, to)                   // 添加有向边
  setEntryPoint(name)                 // 设置入口节点
  setFinishPoint(name)                // 设置终止节点
  compile()                           // 输出运行时图定义
}
```

### 3.3 Harness（工作流总控）

`src/harness.js` 中的 `WorkflowHarness` 是 Agent 执行的顶层编排器。

#### 3.3.1 主执行流程 `run(initialState)`

```text
1. Planner.createPlan(task) → 生成 6 阶段执行计划
2. 状态初始化 → status: "running"
3. Memory.rememberTask("agent_lifecycle.started")
4. Checkpointer.save(phase: "agent_lifecycle.started")
5. 线性节点执行：
   collectAttentionSignals → 研究回路 → analyzeTrend → scoreAttention
   → generateOutline → generateDraft → 审稿回路
6. 状态进入 "waiting_approval"
7. Memory.recordApproval("human_approval.requested")
8. 等待用户手动触发发布
```

#### 3.3.2 研究回路 `runResearchLoop(state)`

```text
while (researchRound < 3):
  researchSources → extractFacts
  if isResearchEnough(state):  // sources >= 4 && facts >= 4 && confidence >= 0.75
    break
达到最大轮次 → 记录警告并返回
```

**按轮次注入差异化的 Mock 数据**：`research.search` 工具根据 `round` 参数生成不同 ID 的来源（`source-{round}-...`），模拟逐轮递进的研究效果。

#### 3.3.3 审稿回路 `runReviewLoop(state)`

```text
while (reviewRound < 2):
  reviewDraft
  if reviewResult.passed:  // score >= 88 或 reviewRound >= 2
    break
  reviseDraft
达到最大轮次 → 记录警告并返回
```

**审稿评分逻辑**（位于 `nodes.reviewDraft`）：
- 基础分：72
- 事实密度加成：facts.length × 3
- 平台变体加成：variants >= 2 → +8
- 长度加成：markdown.length > 900 → +5
- 通过阈值：score >= 88 或 reviewRound >= 2

#### 3.3.4 发布回路 `runPublishLoop(state)`

```text
状态 → "publishing"
while (publishRetry < 2):
  preparePublishing（遍历所有平台生成输出）
  if publishStatus.status === "success":
    saveHistory → status: "done"
    return
达到最大重试 → status: "failed", publishStatus: "manual_required"
```

#### 3.3.5 自然语言修订 `applyNaturalLanguageRevision(state, instruction)`

用户输入自然语言指令后，直接在草稿末尾追加修订信息，版本号递增，记录到编辑历史。

### 3.4 Agent Loop Runner（循环执行器）

`src/agent-loop.js` 负责单节点有序执行：

- 每个节点执行前通过 `Channels.apply()` 写入 `currentNode`
- 执行前保存检查点（`phase: "before_node"`）
- 支持 `retryPolicy.maxAttempts` 重试（默认 2 次）
- 每次执行后有 320ms 延迟（`delayMs`），制造视觉上的进度感
- 节点执行成功保存检查点（`phase: "after_node"`）
- 执行失败记录错误日志并重试，达到最大次数后抛出异常

### 3.5 Channels（状态合并语义）

`src/channels.js` 实现 LangGraph 风格的双通道语义：

| 通道类型 | 合并策略 | 适用字段 |
|----------|----------|----------|
| `LastValueChannel` | 直接覆盖 | `currentNode`, `status`, `draft`, `publishStatus` |
| `BinaryOperatorChannel` | 自定义 reducer | `logs`（追加，保留最近 80 条）、`sources` / `facts`（按 id 去重合并） |

### 3.6 Planning（阶段规划）

`src/planning.js` 中 `ContentPlanner.createPlan(task)` 生成 6 阶段计划：

| 阶段 ID | 阶段名称 | 目标 | 关联工具 |
|---------|----------|------|----------|
| `attention` | 注意力收集 | 收集受众与平台信号 | `attention.collect` |
| `research` | 研究搜索 | 搜索来源并提取事实 | `research.search` |
| `synthesis` | 综合分析 | 分析趋势、评分、选择角度 | — |
| `document` | 文档生成 | 创建文章与视频剧本 | `document.write` |
| `review` | 审稿 | 质量审查 + 人工审批 | `human.approval` |
| `publish` | 发布 | 准备发布草稿 | `publisher.prepare` |

---

## 4. MCP Gateway 与工具路由

### 4.1 McpGateway

`src/mcp.js` 提供的 MCP Gateway 作为工具调用的统一入口：

- **委托**：所有调用委托给 `ToolRouter.call(toolName, input)`
- **审计追踪**：每次调用记录到 `this.calls` 数组（保留最近 80 条），包含：
  - `toolName` / `input` / `context` / `ok` / `provider` / `durationMs` / `at`
  - 额外记录后端配置快照（`apiBaseUrl` / `mcpEndpoint` / `model` / `hasApiKey`）
- **审计查询**：`auditTrail()` 返回完整调用链

### 4.2 Tool Router

`src/tools.js` 中的 `ToolRouter` 管理工具注册表。V1 内置三个工具：

| 工具名 | Provider | 说明 |
|--------|----------|------|
| `attention.collect` | `local` | 收集 Mock 社交注意力信号，根据话题是否涉及历史 AI 研究返回不同模板 |
| `research.search` | `mcp-ready-local` | MCP 就绪搜索适配器。V1 阶段返回结构化 Mock 来源，支持按 `round` 注入不同数据 |
| `document.toHtml` | `local` | Markdown → HTML 转换 |

#### 4.2.1 工具注册规范

```js
router.register({
  name:        "tool.name",       // 唯一工具名
  provider:    "local|remote",    // 提供者标识
  capability:  "search|attention|export",  // 能力分类
  description: "...",             // 工具说明
  handler:     async (input) => ({ ... })   // 异步处理函数
});
```

---

## 5. Publisher 发布层

`src/publishers.js` 实现插件化发布架构，通过 `PublisherRegistry` 管理多个 Publisher 插件。

### 5.1 Publisher 接口规范

每个 Publisher 需实现：

```ts
interface Publisher {
  platform: string;                              // 平台标识
  name: string;                                  // 显示名称
  validate(content: Content): Promise<{ok: boolean, error?: string}>;
  prepare(content: Content, metadata: Meta): Promise<Prepared>;
  publish(prepared: Prepared, metadata: Meta): Promise<PublishResult>;
}
```

### 5.2 已注册 Publisher

| 平台 | 类型 | 说明 |
|------|------|------|
| `markdown` | `MarkdownPublisher` | 导出 .md 文件 |
| `html` | `HtmlPublisher` | 导出 .html 文件 |
| `wechat` | `DraftPublisher` | 微信公众号草稿发布 |
| `xiaohongshu` | `DraftPublisher` | 小红书（视频剧本）草稿导出 |
| `x` | `DraftPublisher` | X/Twitter 草稿 |
| `linkedin` | `DraftPublisher` | LinkedIn 草稿 |

**关键逻辑**：视频剧本（xiaohongshu 平台）的发布按钮被替换为"导出"按钮，对应 `export-md` action，直接触发浏览器下载而非进入发布回路。

---

## 6. 任务状态模型

`src/state.js` 定义完整的任务状态结构（`createTaskState(userInput)`）。

### 6.1 工作流状态枚举

| 状态 | 含义 |
|------|------|
| `idle` | 任务已创建，等待启动 |
| `running` | Agent 正在执行 |
| `waiting_approval` | 草稿完成，等待人工确认 |
| `ready` | 已就绪 |
| `publishing` | 正在发布 |
| `done` | 已完成 |
| `failed` | 执行失败 |

### 6.2 状态结构（关键字段）

```yaml
taskId:            UUIDv4
userInput:         用户原始输入
topic:
  raw:             原始文本
  normalized:      标准化话题
  platforms:       检测到的平台列表 (wechat|xiaohongshu|x|linkedin)
  language:        "zh"
attentionScore:
  score:           0-100 注意力评分
  signals:         平台信号列表 [{platform, keyword, metric, value, reason}]
sources:           收集的来源列表
facts:             提取的事实列表 ({id, claim, sourceIds, confidence})
trendAnalysis:
  summary:         趋势小结
  opportunities:   机会列表
  risks:           风险列表
  angles:          切入角度列表
outline:
  title:           标题
  sections:        章节列表
draft:
  markdown:        Markdown 正文
  variants:        多平台变体 [{platform, title, markdown, metadata}]
  currentVersion:  版本号
  editHistory:     编辑历史
reviewResult:
  passed:          是否通过
  score:           审稿评分
  issues:          问题列表
publishStatus:
  status:          idle|success|failed|manual_required
  outputs:         发布输出列表
loops:
  researchRound:   当前研究轮次
  reviewRound:     当前审稿轮次
  publishRetry:    发布重试次数
logs:              日志列表 [{id, timestamp, level, node, message}]
```

### 6.3 状态修改机制

Content Pull 采用 **不可变补丁模式**（immutable patch），通过 `applyStatePatch(state, patch)` 产生新状态对象，所有嵌套对象被浅合并：

```js
applyStatePatch(state, { score: 92 }) 
  → { ...state, attentionScore: { ...state.attentionScore, score: 92 }, updatedAt: now }
```

---

## 7. Memory 与 Checkpoint 机制

### 7.1 AgentMemory

`src/memory.js` 管理三类记忆：

| 记忆类型 | Storage Key | 说明 |
|----------|-------------|------|
| `working` | `{namespace}` | 任务工作记忆，key 为 taskId |
| `episodic` | `{namespace}` | 情节记忆，最近 80 条事件 |
| `approvals` | `{namespace}` | 审批记录，最近 40 条 |

关键方法：
- `rememberTask(task, event)` — 更新工作记忆 + 追加情节事件
- `recordApproval(task, approval)` — 追加审批记录

### 7.2 MemoryCheckpointer

`src/checkpoint.js` 在每个节点执行前后保存状态快照：

```text
每个 taskId 最多保留 120 个快照
快照结构：{ id, taskId, namespace, metadata, state, createdAt }
```

插入点：
- Harness.run() 启动 → `phase: "agent_lifecycle.started"`
- AgentLoop.runNode() 执行前 → `phase: "before_node"`
- AgentLoop.runNode() 执行后 → `phase: "after_node"`
- 文件系统快照 → `phase: "filesystem_snapshot"`

---

## 8. 环境配置要求

### 8.1 本地开发环境

| 项目 | 要求 |
|------|------|
| **Node.js** | ≥ 18（用于 `electron` 和 `electron-builder`） |
| **Python 3** | 内置 `http.server` 模块（用于 `npm run dev`） |
| **包管理** | npm（`package.json` 使用 npm scripts） |
| **浏览器** | 现代浏览器（Chrome / Edge / Safari） |

### 8.2 启动命令

```bash
# 开发模式（Python HTTP 服务器）
npm run dev
# 访问 http://127.0.0.1:3032

# Electron 桌面应用
npm run desktop

# 构建 macOS 安装包
npm run dist:mac

# 构建 Windows 安装包
npm run dist:win

# 语法校验
npm run check
```

### 8.3 Electron 构建配置

- **macOS**：dmg + zip，类别 `public.app-category.productivity`
- **Windows**：nsis + portable
- **最低窗口尺寸**：980×680
- **默认窗口尺寸**：1440×920
- **渲染进程**：`contextIsolation: true`，`nodeIntegration: false`

### 8.4 运行模式

Content Pull 支持两种运行模式：

| 模式 | 特点 |
|------|------|
| **本地预览**（`npm run dev`） | 零依赖部署，Mock 数据；所有工具为本地模拟，无需后端 API |
| **连接后端**（配置 API Key） | 填写 `apiBaseUrl` + `apiKey` + `model` 后，MCP Gateway 将工具调用路由到真实后端 |

---

## 9. Backend 配置集成点

配置在整个运行时中的传递路径：

```text
store.backendConfig
  ├──→ createContentAgentRuntime({ backendConfig })
  │     ├──→ McpGateway(tools, backendConfig)    // 记录 API 配置到审计追踪
  │     └──→ MemoryCheckpointer({ namespace })   // 隔离记忆命名空间
  │
  └──→ main.js renderSettingsPanel()
        └──→ saveBackendConfig() → localStorage
```

### 9.1 API 接口约定（预期）

当连接正式后端时，预期后端提供以下端点：

| 端点 | 用途 | 预期方法 |
|------|------|----------|
| `{apiBaseUrl}/v1/chat/completions` | LLM 模型调用（OpenAI 兼容格式） | POST |
| `{mcpEndpoint}/tools/{toolName}` | MCP 远程工具调用 | POST |
| `{apiBaseUrl}/v1/models` | 模型列表查询 | GET |

> **注意**：上述接口为设计预期，V1 本地预览模式不需要这些端点。

---

## 10. 安全与数据边界

| 方面 | 策略 |
|------|------|
| **数据存储** | 所有数据存储在浏览器 `localStorage` 中，不经过服务器 |
| **API Key** | 以明文存储在 `localStorage`（V1 阶段），设置面板输入框标记 `autocomplete="off"` |
| **Electron 安全** | `contextIsolation: true` + `nodeIntegration: false` |
| **外部链接** | Electron 中所有外部链接通过 `shell.openExternal()` 打开，拒绝新窗口 |
| **任务数量** | 最多保留 20 条历史任务（`persistTasks` 裁剪） |
| **快照数量** | 每个 taskId 最多保留 120 个检查点 |
| **审计追踪** | MCP 调用链保留最近 80 条 |

---

## 11. 扩展指南

### 11.1 添加新的 Agent 节点

1. 在 `nodes.js` 中定义异步节点函数 `async (state, context) => patch`
2. 在 `agent-graph.js` 的 `createContentAgentGraph()` 中注册并建立边
3. 在 `harness.js` 的 `run()` 中按需调用（线性节点）或创建新回路

### 11.2 注册新的 MCP 工具

```js
tools.register({
  name: "myTool.action",
  provider: "remote",      // 或 "local"
  capability: "custom",
  description: "工具说明",
  handler: async (input) => ({ /* 返回数据 */ })
});
```

### 11.3 添加新的 Publisher 平台

```js
class MyPlatformPublisher {
  platform = "myplatform";
  name = "My Platform Publisher";
  async validate(content) { ... }
  async prepare(content, metadata) { ... }
  async publish(prepared, metadata) { ... }
}
publishers.register(new MyPlatformPublisher());
```

---

## 附录 A：文件索引

| 文件路径 | 行数 | 说明 |
|----------|------|------|
| `index.html` | 12 | 入口 HTML，加载 `src/main.js` |
| `package.json` | 53 | 项目配置、脚本与 Electron Builder 设置 |
| `electron/main.cjs` | 34 | Electron 主进程入口 |
| `src/main.js` | ~496 | UI 渲染、事件绑定与 Harness 调用 |
| `src/backend.js` | 61 | 账号与后端配置持久化 |
| `src/harness.js` | 158 | WorkflowHarness 工作流总控 |
| `src/agent-graph.js` | 63 | StateGraph 定义与编译 |
| `src/agent-loop.js` | 51 | AgentLoopRunner 节点执行器 |
| `src/runtime.js` | 62 | createContentAgentRuntime 工厂 |
| `src/state.js` | 125 | 任务状态模型与不可变补丁 |
| `src/nodes.js` | 309 | 11 个 Agent 节点实现 |
| `src/channels.js` | 59 | ChannelSet 状态合并通道 |
| `src/checkpoint.js` | 31 | MemoryCheckpointer 快照管理 |
| `src/mcp.js` | 36 | McpGateway 审计网关 |
| `src/tools.js` | 185 | ToolRouter + 3 个内置 Mock 工具 |
| `src/memory.js` | 67 | AgentMemory 三类记忆 |
| `src/filesystem.js` | 43 | VirtualFilesystem 虚拟文件系统 |
| `src/document.js` | 41 | DocumentWorkspace 文档工作区 |
| `src/publishers.js` | 139 | PublisherRegistry + 6 个 Publisher |
| `src/markdown.js` | 73 | Markdown 渲染 + Blob 导出 |
| `src/styles.css` | — | 全局样式表 |

## 附录 B：工作流时序图

```
用户输入 "分析今天最重要的 AI 技术进展..."
  │
  ▼
createTaskState(userInput)          → status: idle
  │
  ▼
WorkflowHarness.run(task)
  │
  ├─ Planner.createPlan             → 6 阶段计划
  ├─ Memory.rememberTask            → 生命周期事件
  ├─ Checkpointer.save              → 启动快照
  │
  ├─ collectAttentionSignals        → attentionScore.signals
  │
  ├─ [研究回路: max 3 rounds]
  │   ├─ researchSources            → sources
  │   └─ extractFacts               → facts
  │       └─ isResearchEnough? ──yes──► 回路退出
  │
  ├─ analyzeTrend                   → trendAnalysis
  ├─ scoreAttention                 → attentionScore.score
  ├─ generateOutline                → outline
  ├─ generateDraft                  → draft.markdown + variants
  │
  ├─ [审稿回路: max 2 rounds]
  │   ├─ reviewDraft                → reviewResult
  │   │   └─ passed? ──yes──► 回路退出
  │   └─ reviseDraft                → draft (版本递增)
  │
  ├─ status → "waiting_approval"
  ├─ Memory.recordApproval          → 人工审批请求
  │
  ▼
等待用户操作：
  ├─ 点击"发布" → runPublishLoop    → status: "done" / "failed"
  ├─ 输入修改   → applyNaturalLanguageRevision → status: "waiting_approval"
  └─ 导出       → exportBlob (仅导出，不改变任务状态)
```
