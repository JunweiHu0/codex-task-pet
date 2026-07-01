# SuperNoNo Codex hooks (prototype)

Hook scripts that translate Codex lifecycle events into
[SuperNoNo protocol events](../../../docs/supernono-signal-protocol.md) via the
shared sender [`adapters/shared/send-signal.js`](../../../adapters/shared/send-signal.js).

> **PROTOTYPE / UNVERIFIED.** The Codex hooks payload shape, event names, and
> `hooks.json` format are **not confirmed** on this machine (see
> [../README.md](../README.md) for the probe results). Every script parses
> **defensively** and no-ops on anything it doesn't recognise. Nothing here is
> installed into Codex.

## Files

| file | role |
| --- | --- |
| `lib.js` | shared: defensive payload reader, redaction/summaries, mappers, `send()` |
| `pre-tool-use.js` | `PreToolUse` → `command_running` / `file_reading` / `file_editing` |
| `post-tool-use.js` | `PostToolUse` → `step_done` (or `error` on failure) |
| `permission-request.js` | `PermissionRequest` → `permission_required` |
| `manual-fixture-test.js` | drives the mappers with simulated payloads (no real hooks needed) |
| `hooks.json` | best-guess hook manifest (UNVERIFIED format) |

## Mapping (all input field names are UNVERIFIED guesses)

**PreToolUse** (`lib.mapPreToolUse`)

| detected tool | SuperNoNo event |
| --- | --- |
| shell / bash / exec / command / a command with no file | `command_running` |
| ↳ command matches test/lint/build (`npm test`, `eslint`, `tsc`, …) | `command_running` with `payload.isTest = true` → pet shows *validating* |
| apply_patch / patch / edit / write / create | `file_editing` |
| read / search / grep / glob / cat / list / find | `file_reading` |
| unknown tool name | `command_running` (generic "using tool") |
| nothing recognisable | *no event sent* |

**PostToolUse** (`lib.mapPostToolUse`)

| detected result | SuperNoNo event |
| --- | --- |
| success / exitCode 0 / ok | `step_done` |
| test success | `step_done` with `payload.rule = "testPass"` |
| failure / error / non-zero exit | `error` (pet shows blocked; cleared at the next `turn_ended`) |
| undetermined | `step_done` (logs an action only) |

**PermissionRequest** (`lib.mapPermissionRequest`) → `permission_required` with a
short, secret-masked command summary.

## Defensive parsing — unconfirmed points

Because the real payload is unknown, `lib.js` tries many field names and settles
for a no-op if none match. **These are the assumptions to verify against a real
Codex hook payload:**

- tool name key: tried `tool` / `toolName` / `tool_name` / `name` / `type`.
- command key: tried `command` / `cmd` / `commandLine` / `args[]` / `input.*`.
- file path key: tried `path` / `file` / `filePath` / `filename` / `input.*`.
- result keys: tried `success` / `ok` / `error` / `exitCode` / `status`.
- how the payload is delivered: tried a **JSON argv arg first**, then **piped
  stdin JSON**. Real Codex may use a different transport.

When the real schema is known, update the `*Of()` extractors and the classify
regexes in `lib.js`, and the event/format in `hooks.json`.

## Privacy

- Commands are recorded only as **short summaries** (≤80 chars) with obvious
  secrets masked (`Bearer …`, `sk-…`, `--password=…`).
- Files are recorded as **basename only**, never full paths.
- Prompt text, source code, full tool input, tokens and keys are **never** sent.
- Hooks **never execute** any command from the payload; they only POST state.
- If SuperNoNo isn't running, sends fail silently (Codex is unaffected).

## Run the fixture

```powershell
npm start                                              # start SuperNoNo
node plugins/supernono-codex/hooks/manual-fixture-test.js
```
