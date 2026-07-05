# Content Pull Local Agent

Content Pull now includes a local agent layer that sits behind the browser UI and backend API.

```text
Content Pull UI
  -> Content Pull Backend API
  -> Content Pull Local Agent
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
- `POST /local-agent/approvals/reject`
- `GET /local-agent/audit`
- `POST /search`
- `POST /publish`

## Tools

- `local.permissions.status`
- `local.browser.open`
- `local.chrome.status`
- `local.chrome.open_tab`
- `local.chrome.read_dom`
- `local.chrome.click`
- `local.chrome.type`
- `local.chrome.screenshot`
- `local.chrome.search_web`
- `local.app.open`
- `local.app.applescript`
- `local.filesystem.read`
- `local.filesystem.write`
- `local.shell.run`

High-risk tools return `requires_approval` until a user approves the exact request.

## macOS Permissions

Content Pull cannot silently grant these permissions. The user must approve them in macOS:

- Accessibility: needed for future click/type desktop control and some AppleScript automation.
- Screen Recording: needed for future screenshot and visual UI inspection.
- Automation: needed when controlling Chrome, Mail, Feishu, WeChat, and other apps.
- Full Disk Access: needed only if Content Pull should read outside its workspace.

The current filesystem tool is intentionally workspace-confined.

## Approval Flow

1. Tool call is submitted.
2. If the tool is high-risk, Content Pull returns `requires_approval`.
3. The UI or operator approves the returned approval id.
4. The same tool call is retried with `approvalId`.
5. The result is written to the audit log.

This gives Content Pull an OpenClaw-style local execution boundary without silently taking over the machine.

## Chrome CDP

Chrome control is real only when Chrome is started with a DevTools Protocol port:

```bash
open -n -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/content-pull-chrome-cdp http://127.0.0.1:3032
```

When connected, Content Pull can open tabs, read DOM text, search the web through the browser, click selectors, type text, and capture screenshots. Click/type tools still require human approval.

## Search And Publish

`web.search` and `content.research` first try backend HTTP search. If outbound fetch is blocked, they fall back to `local.chrome.search_web` through Chrome CDP.

Publishing is intentionally connector-based. Add a platform webhook with `POST /config/publishers`, then call `publisher.publish` or `POST /publish`. For platforms without official APIs, the next layer should use Chrome CDP or desktop automation after user approval.
