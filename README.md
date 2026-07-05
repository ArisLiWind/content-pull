# Content Pull

Content Pull is a personal AI assistant workspace built from the Content X interaction model and an OpenClaw-compatible backend layer.

It is designed for people who want one visible assistant to research, plan, draft, revise, remember context, manage files, and prepare work for publishing or handoff. Content Pull keeps the agent lifecycle visible: planning, tool routing, memory, document state, approval gates, and backend status are all part of the product surface.

## Sources

- Frontend interaction model: [ArisLiWind/content-x](https://github.com/ArisLiWind/content-x)
- Backend direction: [openclaw/openclaw](https://github.com/openclaw/openclaw)

The local backend in this repository provides an embedded OpenClaw-compatible runtime with MCP-style tools. It can also point at a separately deployed OpenClaw-compatible service through `OPENCLAW_REMOTE_URL`.

## What Content Pull Does

- Runs a Codex-style three-column personal assistant workspace
- Turns natural-language goals into research, plans, drafts, and revisions
- Uses DeepSeek for language reasoning through a local backend proxy
- Provides an OpenClaw-compatible backend adapter for research and tool orchestration
- Exposes MCP-style tools for research, memory, filesystem, document, and publisher handoff
- Persists local tasks, settings, memory, and files with IndexedDB-first storage
- Keeps human approval before publish or external handoff
- Packages as a local web preview or Electron desktop app

## Architecture

```text
Personal AI Assistant
  -> Harness
  -> Planning
  -> StateGraph
  -> Agent Loop
  -> Tool Router
  -> OpenClaw-compatible Backend
  -> MCP
  -> Memory
  -> Filesystem
  -> Document
  -> Checkpoint
  -> Publisher
```

## Configure DeepSeek

Open `个人帐户 -> 设置` in the app and paste your DeepSeek API Key.

For the local backend service:

```bash
export DEEPSEEK_API_KEY=your_deepseek_key
npm run backend:start
```

Content Pull uses these internal defaults:

```text
API Base URL: https://api.deepseek.com
Model: deepseek-chat
OpenClaw Mode: embedded
MCP Endpoint: http://127.0.0.1:8788/mcp
Memory Namespace: content-pull-memory
```

Do not commit API keys. Keys are stored only in local app settings or local environment variables.

## OpenClaw Backend

Content Pull ships with an embedded OpenClaw-compatible backend layer at `backend/content-pull`.

Backend routes:

- `GET /health` checks backend configuration and OpenClaw-compatible runtime status
- `GET /openclaw/status` reports embedded or remote OpenClaw status
- `POST /mcp` exposes MCP-style tool calls
- `POST /deepseek/chat` proxies assistant conversation calls to DeepSeek
- `POST /deepseek/test` confirms DeepSeek connectivity
- `POST /agent/research` routes research through OpenClaw first, then DeepSeek fallback

For a remote OpenClaw-compatible deployment:

```bash
export OPENCLAW_REMOTE_URL=https://your-openclaw-backend.example.com
npm run backend:start
```

## Run Locally

Install dependencies:

```bash
npm install
```

Start the local backend:

```bash
npm run backend:start
```

Start the web preview:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3032
```

Run the desktop shell:

```bash
npm run desktop
```

## Validate

```bash
npm run check
npm run backend:openclaw:check
```

## Repository

GitHub: [ArisLiWind/content-pull](https://github.com/ArisLiWind/content-pull)
