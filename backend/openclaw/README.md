# ViewPull OpenClaw Backend

ViewPull embeds an OpenClaw-compatible backend layer inspired by the official `openclaw/openclaw` runtime model.

Upstream:

- `https://github.com/openclaw/openclaw`

## Runtime Contract

ViewPull V1 treats OpenClaw as a backend-internal capability:

```text
Mode: embedded by default
Optional remote: OPENCLAW_REMOTE_URL
MCP Endpoint: http://127.0.0.1:8788/mcp
Memory Namespace: viewpull-memory
```

MCP remains an internal tool-layer abstraction in ViewPull. V1 does not expose OpenClaw, MCP, or Memory configuration in the user settings page.

## Embedded Runtime

ViewPull does not require a local OpenClaw CLI or Gateway. The backend provides MCP-style tools for research, memory, filesystem, document, and publisher handoff.

## Check

```bash
npm run backend:openclaw:check
```

If you want a cloud/self-hosted OpenClaw backend, deploy OpenClaw separately and set:

```bash
export OPENCLAW_REMOTE_URL=https://your-openclaw-backend.example.com
```

## ViewPull Backend Service

ViewPull also ships a local backend wrapper at `backend/viewpull`.

```bash
export DEEPSEEK_API_KEY=your_deepseek_key
npm run backend:start
```

It exposes:

- `GET http://127.0.0.1:8788/health`
- `POST http://127.0.0.1:8788/deepseek/test`
- `POST http://127.0.0.1:8788/agent/research`

The backend keeps OpenClaw, Memory, and routing internals out of the frontend settings page.
