# supernono-codex — Codex plugin hooks (verified working, M4.3)

A Codex plugin that forwards **fine-grained** Codex lifecycle events (tool use,
permission requests) to the local SuperNoNo desktop pet — richer than the
`turn_ended` signal we get from the `notify` wrapper. It uses **official Codex
plugin hooks**.

> **Status:** **working, verified end-to-end** on this machine (codex-cli 0.142.4,
> Codex Desktop). Installing registers the plugin via the official `codex plugin`
> CLI and writes two sections to `~/.codex/config.toml`; after you trust the hooks
> in Codex, real tool use drives the pet — `command_running` (PreToolUse) and
> `step_done` (PostToolUse) arrive at the bridge with `adapter: "codex-plugin-hooks"`
> plus the turn's `session_id` / `turn_id`. The `notify` wrapper is independent and
> still provides the turn-level fallback.

## Where this fits

```text
Codex plugin hooks (PreToolUse / PostToolUse / PermissionRequest)   <- fine-grained (this plugin)
        \
         >-- hooks/send-signal.js (vendored) -- POST 127.0.0.1:4174/signal -- SuperNoNo pet
        /
Codex notify wrapper (turn-ended)                                   <- turn-level fallback (independent)
```

- The **`notify` wrapper stays** as the reliable turn-level fallback
  (`turn-ended → turn_ended`, see
  [adapters/codex-desktop](../../adapters/codex-desktop/README.md)). This plugin
  does **not** replace it; the two are independent.
- The pet UI is **not** embedded in Codex — the plugin is just another *adapter*
  that forwards SuperNoNo's existing unified protocol events (no new
  agent-specific event types).

## Verified on this machine (codex-cli 0.142.4, Codex Desktop)

- Codex plugin **hooks fire end-to-end**: a real Codex tool call delivers
  `command_running` (PreToolUse) and `step_done` (PostToolUse) to the bridge with
  `adapter: "codex-plugin-hooks"` and the turn's `session_id` / `turn_id`.
- Events `PreToolUse`, `PostToolUse`, `PermissionRequest` (and more), configured in
  `hooks/hooks.json` with `matcher` + `hooks[]` (`type: "command"`,
  `command` / `command_windows`, `timeout` in **seconds**, `statusMessage`).
- Manifest `.codex-plugin/plugin.json` (required `name` / `version` / `description`);
  `hooks/hooks.json` is **auto-discovered**, so no `hooks` field in `plugin.json`.
- **`marketplace.json` schema**: nested `source: { source: "local", path }` + a
  `policy` block (verified against OpenAI's bundled marketplaces and by installing).
- **Install** via `codex plugin marketplace add` + `codex plugin add` →
  `installed: true, enabled: true`; adds two sections to `~/.codex/config.toml`.
- Hooks require **trust**: Codex won't run them until approved (Desktop / TUI
  prompt), and changing hook content re-triggers the prompt.

### How Codex runs the hooks (the runtime facts that matter)

These were confirmed by a diagnostic hook that reported its own `cwd` / `env` /
`argv` / stdin, and are why `hooks.json` looks the way it does:

- **cwd is the project directory, NOT the plugin root.** A relative `./hooks/x.js`
  will not be found. The command **must** use **`${PLUGIN_ROOT}`**, which Codex
  sets to the installed plugin folder and **expands** in the command string.
- **`node` is NOT on Codex's hook-exec PATH** (Windows). So `command_windows` uses
  an **absolute node path** — `C:\PROGRA~1\nodejs\node.exe` (8.3 short path: no
  spaces, no quoting). *Machine-specific — change it if your Node lives elsewhere.*
- The payload arrives on **stdin** as JSON (`hook_event_name`, `tool_name`,
  `tool_input`, `turn_id`, `session_id`, `tool_response`, …).
- The shell tool's `tool_name` is **`shell_command`** in Codex Desktop but
  **`Bash`** in `codex exec`, so the shell matcher is **`shell_command|Bash`**.

> The `legacy_notify` (config `notify`) chain is a **separate, unrelated** issue —
> see [handoff notes](../../docs/2026-07-01-codex-plugin-hooks-handoff.md); it does
> not affect these plugin hooks.

## Event mapping

**PreToolUse** (matchers on `tool_name`)

| matcher | tool → | SuperNoNo event |
| --- | --- | --- |
| `shell_command\|Bash` | shell command (`tool_input.command`) | `command_running` (test/lint/build → `isTest`) |
| `apply_patch\|Edit\|Write` | file edit | `file_editing` (basename only) |
| `mcp__.*` | MCP tool | `command_running` / `file_reading` (by name) |

**PostToolUse** (catch-all — no `matcher`) → `step_done` (test → `rule: "testPass"`),
or `error` on a clear failure (from small `tool_response` status fields only).

**PermissionRequest** (catch-all — no `matcher`) → `permission_required` (short,
masked command summary). The hook **never** returns an allow/deny decision — Codex
keeps full control of approvals.

`turn_id → taskId` and `session_id → sessionId` are forwarded on the envelope.

## Privacy & safety

- Commands recorded as **short summaries** (≤80 chars) with secrets masked
  (`Bearer …`, `sk-…`, `--password=…`); files as **basename only**.
- **Never** sends prompt text, source/patch bodies, full tool input/output,
  `last-assistant-message`, tokens or keys.
- Hooks **never execute** payload commands and **never** print a decision to
  stdout (so Codex behaviour is unaffected); they exit 0.
- If SuperNoNo isn't running, sends fail silently — Codex is never blocked.
- **No npm dependencies**; ships a vendored, self-contained
  [`hooks/send-signal.js`](hooks/send-signal.js) (kept in sync with
  `adapters/shared/send-signal.js`) so the plugin works from the install cache.

## Files

```text
plugins/supernono-codex/
├── .codex-plugin/plugin.json      # manifest (no `hooks` field — auto-discovered)
├── hooks/
│   ├── hooks.json                 # official hooks config (matchers + command handlers)
│   ├── lib.js                     # official-field parsing + mapping + send()
│   ├── send-signal.js             # vendored, dependency-free bridge sender
│   ├── pre-tool-use.js            # PreToolUse  -> command_running / file_reading / file_editing
│   ├── post-tool-use.js           # PostToolUse -> step_done / error
│   ├── permission-request.js      # PermissionRequest -> permission_required
│   ├── manual-fixture-test.js     # simulate official payloads (no real hooks needed)
│   └── README.md
├── INSTALL.md                     # how to install & trust locally (you run it)
└── README.md                      # this file
```

## Run the manual fixture

```powershell
npm start
node plugins/supernono-codex/hooks/manual-fixture-test.js
```

Feeds official-shape payloads (`tool_name` / `tool_input` / `turn_id`) through the
same `lib.js` mappers the hooks use and sends each to the bridge:
`command_running` (施工), `command_running` isTest (验证), `file_reading` (扫描),
`file_editing` (施工), `permission_required` (等待授权), `step_done`. Pet closed →
every line `MISS`, exit 0.

## Troubleshooting / porting notes

- **Different payload keys** → adjust `toolNameOf` / `commandOf` / `pathOf` /
  `metaOf` in `hooks/lib.js` (official fields are already first).
- **`${PLUGIN_ROOT}` not expanded on your Codex** → the script path won't resolve;
  fall back to an absolute path to the script in `hooks.json`.
- **Node not at `C:\PROGRA~1\nodejs`** → update the absolute node path in the
  `command_windows` entries (or, if `node` is on your hook PATH, use bare `node`).
- **Shell matcher misses** → your Codex may report a different `tool_name`; widen
  the `shell_command|Bash` matcher.
- **No usable per-tool hooks** → the `notify` wrapper still provides turn-level state.
