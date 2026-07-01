# SuperNoNo Agent Adapter Integration Plan

> This document keeps the original filename for compatibility, but the architecture is no longer Codex-only.
> Codex plugin / hook is now treated as the first adapter, not the whole product architecture.

## 1. Product Direction

SuperNoNo should not be designed as only a Codex pet.

The better long-term positioning is:

```text
SuperNoNo = Agent Activity Companion
```

It should be able to visualize the work state of different coding agents:

- Codex
- Claude Code
- Cursor
- Continue
- Gemini CLI
- Aider
- Any custom script or internal agent

The desktop pet should not care which agent is upstream. It should only care about a small, stable set of normalized activity signals.

Recommended architecture:

```text
Agent Runtime / CLI / Desktop App / IDE Extension
        |
        | native lifecycle events, hooks, logs, or wrapper events
        v
Agent Adapter
        |
        | normalized SuperNoNo signal protocol
        v
SuperNoNo Local Event Bridge
        |
        | POST http://127.0.0.1:4174/signal
        v
Electron Main Process
        |
        | win.webContents.send('sn:signal', type, payload)
        v
Renderer Signal Adapter
        |
        | SN.signals.emit(type, payload)
        v
Pet State Engine + UI
```

In this model:

- The local event bridge is the product core.
- The unified signal protocol is the product contract.
- Codex plugin / hook is only the first adapter.
- Claude Code adapter can be added later without changing the pet UI.

## 2. Key Design Decision

Do not make the model itself responsible for status reporting.

For example, avoid relying on prompts like:

```text
Whenever you read a file, call POST /signal.
Whenever you finish a task, call POST /signal.
```

That approach has several problems:

- It consumes model tokens.
- It pollutes the agent's main task with reporting instructions.
- It depends on the model remembering to report.
- It may miss events.
- It becomes messy when multiple agents are supported.

Preferred approach:

```text
Agent lifecycle / hook / runtime event
        -> adapter
        -> local event bridge
        -> SuperNoNo UI
```

The adapter should observe the agent runtime, not ask the agent model to narrate every state change.

## 3. Current Project Status

Current SuperNoNo already has:

- Electron transparent always-on-top pet window.
- Renderer public API: `SuperNoNo.signal(type, payload)`.
- Internal signal adapter: `SN.signals.emit(...)`.
- Pet state engine.
- Bubble, task panel, settings panel, demo controls.
- A clear seam in `electron/preload.js`:

```js
onSignal: (cb) => ipcRenderer.on('sn:signal', (_e, type, payload) => cb(type, payload)),
```

Current SuperNoNo still lacks:

- A localhost event bridge for external processes.
- A formally documented signal protocol.
- Agent adapters.
- Codex adapter.
- Claude Code adapter.
- Packaging and installation flow for normal users.

## 4. Architecture Layers

### 4.1 SuperNoNo Desktop App

Files:

- `electron/main.js`
- `electron/preload.js`
- `src/renderer/js/app.js`
- `src/renderer/js/signalAdapter.js`
- `src/renderer/js/stateEngine.js`
- `src/renderer/js/pet.js`
- `src/renderer/js/panel.js`

Responsibilities:

- Show pet state.
- Show task title, plan, recent actions, artifacts, and next step.
- Alert the user when approval or input is needed.
- Stay independent from any specific agent implementation.
- Accept normalized events only.

The desktop app should not know details like "Codex tool call shape" or "Claude Code transcript format".

### 4.2 Local Event Bridge

The local event bridge is the stable local API exposed by the Electron main process.

Recommended endpoints:

```text
GET  http://127.0.0.1:4174/health
POST http://127.0.0.1:4174/signal
```

`GET /health` response:

```json
{
  "ok": true,
  "app": "SuperNoNo",
  "protocolVersion": "0.1.0"
}
```

`POST /signal` request:

```json
{
  "type": "file_reading",
  "agent": "codex",
  "adapter": "codex-hook",
  "payload": {
    "action": "Reading package.json",
    "file": "package.json"
  }
}
```

Electron main process forwards the event to the renderer:

```js
win.webContents.send('sn:signal', type, normalizedPayload);
```

Renderer already accepts this path:

```js
bridge.onSignal((type, payload) => SN.signals.emit(type, payload || {}));
```

### 4.3 Unified Signal Protocol

The signal protocol is the contract between any adapter and SuperNoNo.

Adapters should convert agent-specific activity into this small set:

```text
task_start
plan_ready
file_reading
file_editing
command_running
test_running
permission_required
permission_resolved
step_done
blocked
completed
idle
```

The protocol should remain agent-neutral. Avoid names like:

```text
codex_tool_call
claude_transcript_update
cursor_apply_patch
```

Those belong inside adapters, not inside the SuperNoNo core.

### 4.4 Agent Adapters

Each adapter is responsible for one upstream agent.

Recommended adapter list:

```text
adapters/
├── codex/
│   ├── README.md
│   └── send-signal.js
├── claude-code/
│   ├── README.md
│   └── send-signal.js
└── generic-cli/
    ├── README.md
    └── wrapper.js
```

Each adapter should:

- Listen to the best available lifecycle source.
- Convert raw events into SuperNoNo signals.
- Send events to `POST /signal`.
- Fail silently when SuperNoNo is not running.
- Avoid sending private code, secrets, tokens, or full prompts.

## 5. Adapter Quality Ranking

Not every integration method has the same quality.

Recommended priority:

| Rank | Method | Token cost | Stability | Notes |
| --- | --- | --- | --- | --- |
| 1 | Official lifecycle hook/API | None | High | Best option when available |
| 2 | Local plugin/hook | None or very low | High | Good for Codex if supported |
| 3 | MCP/tool bridge with runtime events | Low | Medium to high | Useful when agent has tool infrastructure |
| 4 | CLI wrapper observing process events | None | Medium | Good fallback for CLI agents |
| 5 | Parsing terminal output/logs | None | Low to medium | Can break when output changes |
| 6 | Model instructed to call HTTP | High | Low | OK for demo, not product core |
| 7 | Model writes natural language status only | High | Low | Avoid as integration mechanism |

Conclusion:

Codex plugin / hook is good if it exposes real lifecycle events. But the product should still be built around the generic event bridge and unified signal protocol.

## 6. Codex Adapter

Codex is the first target adapter.

Goal:

```text
Codex lifecycle events
        -> Codex adapter
        -> SuperNoNo signal protocol
        -> local event bridge
```

The adapter should not ask Codex to spend tokens reporting every state change.

Preferred sources, from best to fallback:

1. Codex lifecycle hooks if available.
2. Codex plugin hook if available.
3. Codex CLI notification/config hook if available.
4. Codex wrapper script that observes command lifecycle.
5. Prompt-based reporting only for demo or emergency fallback.

Suggested Codex adapter structure:

```text
plugins/
└── supernono-codex/
    ├── .codex-plugin/
    │   └── plugin.json
    ├── hooks/
    │   └── supernono-hook.js
    ├── lib/
    │   └── send-signal.js
    └── README.md
```

The Codex adapter should map:

| Codex activity | SuperNoNo event |
| --- | --- |
| Task begins | `task_start` |
| Plan is created or updated | `plan_ready` |
| Files are searched/read | `file_reading` |
| Files are edited | `file_editing` |
| Shell command runs | `command_running` |
| Tests or verification runs | `test_running` |
| Approval is required | `permission_required` |
| Approval is resolved | `permission_resolved` |
| Work is blocked | `blocked` |
| Work completes | `completed` |

Important uncertainty:

Windows desktop Codex and Codex CLI may expose different integration points. Before building Milestone 3, verify what lifecycle/hook APIs are available in the target Codex surface.

Milestone 1 and Milestone 2 do not depend on that decision.

## 7. Claude Code Adapter

Claude Code should be the second target adapter.

Goal:

```text
Claude Code runtime/hooks/logs
        -> Claude Code adapter
        -> SuperNoNo signal protocol
        -> local event bridge
```

The adapter should follow the same rules:

- Do not require Claude to spend tokens narrating status.
- Prefer official hooks or runtime lifecycle events.
- Use wrapper/log observation only if no official event source exists.
- Send the same normalized events as Codex.

Suggested structure:

```text
adapters/
└── claude-code/
    ├── README.md
    ├── send-signal.js
    └── adapter.js
```

Claude-specific concepts should stay inside this adapter. SuperNoNo core should not gain Claude-specific event names.

## 8. Generic CLI Adapter

A generic CLI adapter can support tools before official adapters exist.

Possible command:

```bash
supernono-run --agent aider -- npm test
```

It can send:

- `command_running` when the process starts.
- `completed` when it exits with code `0`.
- `blocked` or `error` when it exits non-zero.

This is not as rich as a real lifecycle hook, but it makes the product useful for many tools quickly.

## 9. Signal Protocol Draft

Every signal envelope should follow this shape:

```json
{
  "type": "file_editing",
  "agent": "codex",
  "adapter": "codex-hook",
  "sessionId": "optional-session-id",
  "taskId": "optional-task-id",
  "payload": {
    "action": "Editing electron/main.js",
    "file": "electron/main.js"
  }
}
```

Top-level fields:

| Field | Required | Description |
| --- | --- | --- |
| `type` | Yes | Normalized SuperNoNo event type |
| `agent` | No | `codex`, `claude`, `cursor`, `generic-cli`, etc. |
| `adapter` | No | Adapter implementation name |
| `sessionId` | No | Upstream session/thread id |
| `taskId` | No | Task id |
| `payload` | No | Event-specific payload |

### task_start

```json
{
  "type": "task_start",
  "agent": "codex",
  "payload": {
    "title": "Fix login bug",
    "plan": ["Inspect auth flow", "Patch code", "Run tests"],
    "action": "Started task"
  }
}
```

### plan_ready

```json
{
  "type": "plan_ready",
  "agent": "codex",
  "payload": {
    "plan": ["Read files", "Find bug", "Apply patch", "Verify"],
    "action": "Plan created"
  }
}
```

### file_reading

```json
{
  "type": "file_reading",
  "agent": "claude",
  "payload": {
    "action": "Reading src/renderer/js/app.js",
    "file": "src/renderer/js/app.js"
  }
}
```

### file_editing

```json
{
  "type": "file_editing",
  "agent": "codex",
  "payload": {
    "action": "Updating Electron bridge",
    "file": "electron/main.js",
    "planAdvance": true
  }
}
```

### command_running

```json
{
  "type": "command_running",
  "agent": "generic-cli",
  "payload": {
    "action": "Running npm test",
    "command": "npm test"
  }
}
```

### test_running

```json
{
  "type": "test_running",
  "agent": "codex",
  "payload": {
    "action": "Running verification",
    "command": "npm test",
    "planAdvance": true
  }
}
```

### permission_required

```json
{
  "type": "permission_required",
  "agent": "codex",
  "payload": {
    "action": "Approval required",
    "command": "npm install"
  }
}
```

### permission_resolved

```json
{
  "type": "permission_resolved",
  "agent": "codex",
  "payload": {
    "approved": true,
    "resumePhase": "file_editing"
  }
}
```

### blocked

```json
{
  "type": "blocked",
  "agent": "claude",
  "payload": {
    "reason": "Missing repository credentials",
    "nextStep": "Authorize GitHub access and retry"
  }
}
```

### completed

```json
{
  "type": "completed",
  "agent": "codex",
  "payload": {
    "action": "Task completed",
    "artifacts": [
      {
        "label": "Integration plan",
        "path": "C:/Users/1/Desktop/project/codex-task-pet/docs/codex-plugin-hook-integration-plan.md"
      }
    ]
  }
}
```

### idle

```json
{
  "type": "idle",
  "agent": "codex",
  "payload": {}
}
```

## 10. Local Event Bridge Implementation Plan

Add this to `electron/main.js`.

Suggested constants:

```js
const BRIDGE_PORT = Number(process.env.SUPERNONO_BRIDGE_PORT || 4174);
const BRIDGE_HOST = '127.0.0.1';
const MAX_SIGNAL_BYTES = 64 * 1024;
```

Suggested function:

```js
function startBridgeServer() {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '').split('?')[0];

    if (req.method === 'GET' && urlPath === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        ok: true,
        app: 'SuperNoNo',
        protocolVersion: '0.1.0',
      }));
    }

    if (req.method !== 'POST' || urlPath !== '/signal') {
      res.writeHead(404);
      return res.end('not found');
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_SIGNAL_BYTES) req.destroy();
    });

    req.on('end', () => {
      try {
        const msg = JSON.parse(body || '{}');
        const type = String(msg.type || '');
        const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};

        if (!type) {
          res.writeHead(400);
          return res.end('missing type');
        }

        const normalizedPayload = {
          ...payload,
          agent: msg.agent || payload.agent || 'unknown',
          adapter: msg.adapter || payload.adapter || 'unknown',
          sessionId: msg.sessionId || payload.sessionId || null,
          taskId: msg.taskId || payload.taskId || null,
        };

        if (win) win.webContents.send('sn:signal', type, normalizedPayload);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (_) {
        res.writeHead(400);
        res.end('bad json');
      }
    });
  });

  server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
    console.log(`[SuperNoNo] bridge listening: http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
  });
}
```

Start it after the renderer static server:

```js
await startServer();
startBridgeServer();
createWindow();
```

## 11. Sender Utility

Every adapter can share a small sender utility.

```js
const http = require('http');

function sendSuperNoNoSignal(type, payload = {}, meta = {}) {
  const data = JSON.stringify({
    type,
    agent: meta.agent || payload.agent || 'unknown',
    adapter: meta.adapter || payload.adapter || 'unknown',
    sessionId: meta.sessionId || payload.sessionId,
    taskId: meta.taskId || payload.taskId,
    payload,
  });

  const req = http.request({
    hostname: '127.0.0.1',
    port: Number(process.env.SUPERNONO_BRIDGE_PORT || 4174),
    path: '/signal',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
    timeout: 800,
  });

  req.on('error', () => {
    // SuperNoNo may not be running. Adapter must not break the agent.
  });

  req.write(data);
  req.end();
}

module.exports = { sendSuperNoNoSignal };
```

Example:

```js
sendSuperNoNoSignal(
  'file_reading',
  {
    action: 'Reading package.json',
    file: 'package.json',
  },
  {
    agent: 'codex',
    adapter: 'codex-hook',
  }
);
```

## 12. Renderer Changes

`src/renderer/js/signalAdapter.js` should stay agent-neutral.

Add support for `command_running`:

```js
case 'command_running':
  this._phase = payload.isTest ? 'test_running' : 'file_editing';
  this._flags.completed = false;
  ctx.nextStep = payload.nextStep || ctx.nextStep;
  this._pushAction(payload.action || ('Running command: ' + (payload.command || 'unknown')));
  break;
```

Later, if command execution deserves its own visual state, add it to:

- `src/renderer/js/config.js`
- `src/renderer/js/stateEngine.js`
- `src/renderer/styles/pet.css`

Do not add agent-specific states like `codex_running` or `claude_thinking`.

## 13. Debugging

After SuperNoNo starts, verify the bridge:

```powershell
Invoke-RestMethod http://127.0.0.1:4174/health
```

Send a task start event:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:4174/signal `
  -ContentType 'application/json' `
  -Body '{"type":"task_start","agent":"codex","adapter":"manual-test","payload":{"title":"Test agent bridge","plan":["Send event","Observe pet","Complete"]}}'
```

Send a file reading event:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:4174/signal `
  -ContentType 'application/json' `
  -Body '{"type":"file_reading","agent":"claude","adapter":"manual-test","payload":{"action":"Reading renderer files","file":"src/renderer/js/app.js"}}'
```

Send a completion event:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:4174/signal `
  -ContentType 'application/json' `
  -Body '{"type":"completed","agent":"codex","adapter":"manual-test","payload":{"action":"Bridge test completed"}}'
```

## 14. Security And Privacy

The bridge is local, but it still needs clear boundaries.

Rules:

- Listen on `127.0.0.1`, not `0.0.0.0`.
- Do not expose arbitrary command execution.
- Accept state events only.
- Limit request body size.
- Ignore unknown fields.
- Do not send full source code, prompts, secrets, API keys, tokens, or private file contents.
- Prefer file names, command names, and short summaries.
- Adapters must fail silently if SuperNoNo is not running.
- Later, add optional local auth with `SUPERNONO_BRIDGE_TOKEN`.

Optional future auth:

```text
Authorization: Bearer <local-token>
```

## 15. Milestones

### Milestone 1: Local Event Bridge

Goal:

Make SuperNoNo controllable by any local process.

Tasks:

- Add `GET /health`.
- Add `POST /signal`.
- Forward events from Electron main to renderer through `sn:signal`.
- Keep current demo mode unchanged.

Acceptance:

- `task_start` changes pet to thinking.
- `file_reading` changes pet to scanning.
- `permission_required` changes pet to waiting approval.
- `completed` changes pet to completed.
- SuperNoNo still starts without any adapter.

### Milestone 2: Unified Signal Protocol

Goal:

Make the protocol stable enough for multiple adapters.

Tasks:

- Create `docs/supernono-signal-protocol.md`.
- Document envelope fields: `type`, `agent`, `adapter`, `sessionId`, `taskId`, `payload`.
- Add `command_running` support.
- Keep unknown events non-fatal.
- Fix existing Chinese mojibake in renderer files.

Acceptance:

- Protocol is agent-neutral.
- Codex and Claude can use the same event names.
- No SuperNoNo UI internals leak into adapter docs.

### Milestone 3: Codex Adapter

Goal:

Make Codex the first real integration.

Tasks:

- Verify which Codex surface is targeted first: Windows desktop app, CLI, or both.
- Verify available lifecycle/hook/notify APIs for that surface.
- Build `plugins/supernono-codex/` or `adapters/codex/`.
- Map at least five event classes:
  - task start
  - file reading
  - file editing
  - command/test running
  - approval/block/completion

Acceptance:

- Running a real Codex task changes the pet state.
- Codex does not spend normal response tokens just to report every event.
- If SuperNoNo is closed, Codex still works normally.

### Milestone 4: Claude Code Adapter

Goal:

Prove the architecture is not Codex-specific.

Tasks:

- Research Claude Code lifecycle/hooks/log access.
- Build `adapters/claude-code/`.
- Reuse the same sender utility and signal protocol.
- Avoid adding Claude-specific states to SuperNoNo core.

Acceptance:

- A Claude Code session can drive the same pet UI.
- The bridge receives `agent: "claude"`.
- No core renderer changes are required except generic protocol improvements.

### Milestone 5: Productization

Goal:

Make SuperNoNo usable by normal users.

Tasks:

- Package Windows installer.
- Add startup option.
- Add adapter install docs.
- Add privacy docs.
- Add event log/debug panel.
- Add clear distinction between demo mode and connected mode.

Acceptance:

- User can install and launch without reading source code.
- README explains supported agents and adapter status.
- Public release does not include unauthorized third-party assets.

## 16. Windows npm Notes

If Node.js is installed but PowerShell reports:

```text
无法加载文件 C:\Program Files\nodejs\npm.ps1，因为在此系统上禁止运行脚本。
```

This usually means npm is installed, but PowerShell blocked the `npm.ps1` wrapper.

Temporary workaround:

```powershell
npm.cmd -v
npm.cmd install
npm.cmd start
```

Long-term fix:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then reopen PowerShell:

```powershell
npm -v
npm install
npm start
```

If Electron download fails with `ECONNRESET`, use a mirror:

```powershell
npm.cmd config set registry https://registry.npmmirror.com
npm.cmd config set electron_mirror https://npmmirror.com/mirrors/electron/

$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:npm_config_electron_mirror="https://npmmirror.com/mirrors/electron/"

npm.cmd install
```

## 17. Recommended Next Step

Start with Milestone 1.

Reason:

- It is small.
- It is independent from Codex or Claude implementation details.
- It turns SuperNoNo from a demo into a real local event target.
- It keeps the architecture open for future agents.
- It lets manual tests, Codex hooks, Claude adapters, and CLI wrappers all use the same entry point.

After Milestone 1, do Milestone 2 before building any specific adapter.

That order keeps the product from becoming a one-off Codex prompt gadget.

