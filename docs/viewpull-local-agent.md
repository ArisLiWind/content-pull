# ViewPull Local Agent

ViewPull now includes a local agent layer that sits behind the browser UI and backend API.

```text
ViewPull UI
  -> ViewPull Backend API
  -> ViewPull Local Agent
      -> Permission status
      -> Tool registry
      -> Human approval queue
      -> Audit log
      -> Browser / app / file / shell executors
```

## Local Agent Endpoints

- `GET /local-agent/status`
- `GET /local-agent/tools`
- `POST /local-agent/tools/call`
- `GET /local-agent/approvals`
- `POST /local-agent/approvals`
- `POST /local-agent/approvals/approve`
- `GET /local-agent/audit`

## Tools

- `local.permissions.status`
- `local.browser.open`
- `local.app.open`
- `local.app.applescript`
- `local.filesystem.read`
- `local.filesystem.write`
- `local.shell.run`

High-risk tools return `requires_approval` until a user approves the exact request.

## macOS Permissions

ViewPull cannot silently grant these permissions. The user must approve them in macOS:

- Accessibility: needed for future click/type desktop control and some AppleScript automation.
- Screen Recording: needed for future screenshot and visual UI inspection.
- Automation: needed when controlling Chrome, Mail, Feishu, WeChat, and other apps.
- Full Disk Access: needed only if ViewPull should read outside its workspace.

The current filesystem tool is intentionally workspace-confined.

## Approval Flow

1. Tool call is submitted.
2. If the tool is high-risk, ViewPull returns `requires_approval`.
3. The UI or operator approves the returned approval id.
4. The same tool call is retried with `approvalId`.
5. The result is written to the audit log.

This gives ViewPull an OpenClaw-style local execution boundary without silently taking over the machine.
