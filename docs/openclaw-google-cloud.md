# OpenClaw on Google Cloud for Content Pull

Content Pull does not require a local OpenClaw CLI or Gateway. For full OpenClaw capability in production, deploy OpenClaw as a separate cloud backend and set:

```bash
export OPENCLAW_REMOTE_URL=https://your-openclaw-service-url
```

## Recommended Google Cloud Path

Use Cloud Run for the first deploy because it can run containerized services, scale down, and expose an HTTPS service URL.

High-level steps:

1. Create or choose a Google Cloud project.
2. Enable Cloud Run, Artifact Registry, Secret Manager, and Cloud Build.
3. Build/deploy the official `openclaw/openclaw` backend service.
4. Store secrets in Secret Manager, not in git.
5. Set Content Pull backend environment variables:

```bash
OPENCLAW_REMOTE_URL=https://your-openclaw-service-url
DEEPSEEK_API_KEY=your_deepseek_key
```

6. Run Content Pull backend:

```bash
npm run backend:start
```

7. Verify:

```bash
npm run backend:openclaw:check
```

## Approval Needed

Before I operate Google Cloud for you, I will ask for approval for:

- Opening Google Cloud Console
- Selecting or creating a project
- Enabling billable APIs
- Creating Artifact Registry or Cloud Run services
- Creating Secret Manager secrets
- Deploying containers or source
- Granting public or authenticated access

## Current Content Pull Contract

Content Pull expects a remote OpenClaw-compatible backend to expose an OpenAI-compatible chat endpoint:

```text
POST /v1/chat/completions
```

The local Content Pull backend also exposes an embedded MCP-compatible endpoint:

```text
POST /mcp
```

This lets Content Pull run today with embedded MCP tools, and later switch to a cloud OpenClaw backend when `OPENCLAW_REMOTE_URL` is configured.
