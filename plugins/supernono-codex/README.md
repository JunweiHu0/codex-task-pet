# supernono-codex — Codex plugin hooks (installable candidate, M4.2)

A Codex plugin that forwards **fine-grained** Codex lifecycle events (tool use,
permission requests) to the local SuperNoNo desktop pet — richer than the
`turn_ended` signal we get from the `notify` wrapper. It uses **official Codex
plugin hooks**.

> **Status:** this is an **installable candidate**. The Codex plugin-hooks API is
> **officially supported** (see [Codex hooks](https://developers.openai.com/codex/hooks)
> and [Build a plugin](https://developers.openai.com/codex/plugins/build)), and
> this plugin is written to that schema. **What is not yet verified is the local
> install + trust on this machine** — you install and trust it (see
> [INSTALL.md](INSTALL.md)). Nothing here modifies `~/.codex/config.toml`, and the
> `notify` wrapper stays as the turn-level fallback.

## Where this fits

```text
Codex plugin hooks (PreToolUse / PostToolUse / PermissionRequest)   <- fine-grained (this plugin)
        \
         >-- adapters/shared/send-signal.js -- POST 127.0.0.1:4174/signal -- SuperNoNo pet
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

## Confirmed vs. not-yet-verified

**✅ Confirmed (official docs)**

- Codex plugin **hooks are officially supported**: events `PreToolUse`,
  `PostToolUse`, `PermissionRequest` (and more), configured in `hooks/hooks.json`
  with `matcher` + `hooks[]` (`type: "command"`, `command`/`command_windows`,
  `timeout` in **seconds**, `statusMessage`).
- The plugin **manifest** `.codex-plugin/plugin.json` (required `name` / `version`
  / `description`), verified against OpenAI's own bundled plugins.
- `hooks/hooks.json` is **auto-discovered**, so no `hooks` field is needed in
  `plugin.json` (we omit it).
- Hook input fields: `tool_name`, `tool_use_id`, `tool_input`, `turn_id`,
  `session_id`; `tool_response` on PostToolUse.
- Hooks receive the `PLUGIN_ROOT` env var (referenced from `hooks.json`).

**❓ Not yet verified on this machine**

- Local **install + trust**: this plugin has not been registered/trusted in your
  Codex yet (see [INSTALL.md](INSTALL.md)). Codex will ask you to review/trust the
  hooks before they run.
- Whether `node` is on Codex's hook-exec PATH, and whether `${PLUGIN_ROOT}` is
  expanded as a placeholder vs. a shell env var on Windows (`command_windows`).
- The exact `marketplace.json` schema for local install (verify against your
  Codex version).

## Event mapping

**PreToolUse** (matchers on `tool_name`)

| matcher | tool → | SuperNoNo event |
| --- | --- | --- |
| `Bash` | shell command (`tool_input.command`) | `command_running` (test/lint/build → `isTest`) |
| `apply_patch\|Edit\|Write` | file edit | `file_editing` (basename only) |
| `mcp__.*` | MCP tool | `command_running` / `file_reading` (by name) |

**PostToolUse** (`matcher: "*"`) → `step_done` (test → `rule: "testPass"`),
or `error` on a clear failure (from small `tool_response` status fields only).

**PermissionRequest** (`matcher: "*"`) → `permission_required` (short, masked
command summary). The hook **never** returns an allow/deny decision — Codex keeps
full control of approvals.

`turn_id → taskId` and `session_id → sessionId` are forwarded on the envelope.

## Privacy & safety

- Commands recorded as **short summaries** (≤80 chars) with secrets masked
  (`Bearer …`, `sk-…`, `--password=…`); files as **basename only**.
- **Never** sends prompt text, source/patch bodies, full tool input/output,
  `last-assistant-message`, tokens or keys.
- Hooks **never execute** payload commands and **never** print a decision to
  stdout (so Codex behaviour is unaffected); they exit 0.
- If SuperNoNo isn't running, sends fail silently — Codex is never blocked.
- **No npm dependencies**; reuses
  [`adapters/shared/send-signal.js`](../../adapters/shared/send-signal.js).

## Files

```text
plugins/supernono-codex/
├── .codex-plugin/plugin.json      # manifest (no `hooks` field — auto-discovered)
├── hooks/
│   ├── hooks.json                 # official hooks config (matchers + command handlers)
│   ├── lib.js                     # official-field parsing + mapping + send()
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

## If the real hooks behaviour differs

- Different payload keys → adjust `toolNameOf` / `commandOf` / `pathOf` / `metaOf`
  in `hooks/lib.js` (official fields are already first).
- `${PLUGIN_ROOT}` not expanded on Windows → change `command_windows` in
  `hooks.json` to `%PLUGIN_ROOT%`.
- `node` not on Codex's hook PATH → use an absolute node path in `hooks.json`.
- No usable per-tool hooks → the `notify` wrapper still provides turn-level state.
