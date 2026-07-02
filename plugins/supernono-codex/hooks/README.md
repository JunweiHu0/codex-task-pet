# SuperNoNo Codex hooks

Hook scripts that translate **official** Codex lifecycle events into
[SuperNoNo protocol events](../../../docs/supernono-signal-protocol.md) via the
vendored [`send-signal.js`](send-signal.js) — a self-contained copy of
`adapters/shared/send-signal.js`, so the plugin works from the Codex install
cache where the repo's `adapters/` folder is not present.

The hooks API is officially supported ([docs](https://developers.openai.com/codex/hooks)).
`hooks.json` here targets that schema. The scripts still parse **defensively**
(official fields first, fallbacks kept) and no-op on anything unrecognised, so a
schema drift degrades gracefully instead of breaking Codex.

## Files

| file | role |
| --- | --- |
| `hooks.json` | official hooks config: `matcher` + `hooks[]` command handlers |
| `lib.js` | official-field parsing, redaction/summaries, mappers, `metaOf`, `send()` |
| `send-signal.js` | vendored, dependency-free POST-to-bridge sender (self-contained) |
| `pre-tool-use.js` | `PreToolUse` → `command_running` / `file_reading` / `file_editing` |
| `post-tool-use.js` | `PostToolUse` → `step_done` (or `error` on failure) |
| `permission-request.js` | `PermissionRequest` → `permission_required` |
| `manual-fixture-test.js` | drives the mappers with simulated official payloads |

## hooks.json shape (official)

```json
{ "hooks": { "PreToolUse": [ { "matcher": "shell_command|Bash",
  "hooks": [ { "type": "command",
               "command": "node ${PLUGIN_ROOT}/hooks/pre-tool-use.js",
               "command_windows": "C:\\PROGRA~1\\nodejs\\node.exe ${PLUGIN_ROOT}\\hooks\\pre-tool-use.js",
               "timeout": 5, "statusMessage": "Updating SuperNoNo" } ] } ] } } }
```

- `matcher` is a regex on `tool_name`. For a **catch-all**, **omit** the `matcher`
  field (as shipping plugins do — a literal `"*"` did not match on this version).
- `timeout` is in **seconds** (docs default 600; we use 5).
- **`${PLUGIN_ROOT}` is required** (Codex expands it to the installed plugin folder).
  Codex runs each hook with **cwd = the project directory, NOT the plugin root**, so
  a relative `./hooks/x.js` would not be found.
- **`node` is not on Codex's hook PATH on Windows**, so `command_windows` uses the
  absolute `C:\PROGRA~1\nodejs\node.exe` (8.3 short path — no spaces/quoting;
  machine-specific). Verified on codex-cli 0.142.4.

## Official payload fields (parsed first)

| field | use |
| --- | --- |
| `tool_name` | classify the tool (`shell_command`/`Bash`, `apply_patch`, `Edit`, `Write`, `mcp__…`) |
| `tool_input.command` | Bash / apply_patch command → short masked summary |
| `tool_input.path` / `.file_path` | file basename for read/edit |
| `tool_response` | PostToolUse: small status fields only (exit_code/success/error) |
| `turn_id` → `taskId`, `session_id` → `sessionId` | envelope correlation ids |

Defensive fallbacks (`tool` / `toolName` / `input.*` / `command` / …) remain in
`lib.js` in case a field name differs.

## Mapping

**PreToolUse**

| tool | event |
| --- | --- |
| `shell_command`/`Bash` | `command_running` (test/lint/build → `isTest` → *validating*) |
| `apply_patch` / `Edit` / `Write` | `file_editing` |
| read/search names (incl. `mcp__…read…`) | `file_reading` |
| other `mcp__…` / unknown | `command_running` (generic) |

**PostToolUse** → `step_done` (test → `rule:"testPass"`); clear failure → `error`
(cleared at the next `turn_ended`). **PermissionRequest** → `permission_required`.

## Safety

- Commands: ≤80-char summaries, secrets masked; files: basename only.
- Never sends prompt / source / patch body / full tool output / tokens / keys.
- Hooks **never** execute commands and **never** print a decision — no
  `permissionDecision` / `decision` output, so Codex approval is untouched.
- SuperNoNo off → silent failure; Codex unaffected.

## Run the fixture

```powershell
npm start
node plugins/supernono-codex/hooks/manual-fixture-test.js
```
