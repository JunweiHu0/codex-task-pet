# Codex Desktop Adapter (Milestone 3 — skeleton + feasibility)

Adapter that will let **Windows 桌面版 Codex** drive the SuperNoNo desktop pet
through the [unified signal protocol](../../docs/supernono-signal-protocol.md),
**without spending model tokens and without asking the model to report status in
natural language**.

> **Status (M3 + M3.1):** ships an adapter skeleton, a reusable sender, a manual
> event test, a read-only feasibility probe, **and a coarse `notify` wrapper that
> is now installed into `~/.codex/config.toml`** (see “M3.1” below). The wrapper
> re-invokes Codex's original notifier and forwards ONE coarse event per turn.
> Fine-grained per-tool events (file_reading / file_editing / command_running)
> are **not** faked — they await a confirmed per-tool interface.

## Goal

`Codex Desktop lifecycle → adapter → shared sender → POST /signal → SuperNoNo pet`

The pet should react to what Codex actually *does* (reading, editing, running
commands, waiting for approval, finishing) — not to anything the model is asked
to say.

## What is done (this milestone)

- **Reusable sender** — [`../shared/send-signal.js`](../shared/send-signal.js):
  dependency-free (`http` only), fills the protocol envelope
  (`type/agent/adapter/sessionId/taskId/payload`), and fails silently if the pet
  isn't running so it can never crash or block Codex.
- **Manual event test** — [`manual-test.js`](manual-test.js): proves the adapter
  can drive the pet over the existing M1/M2 bridge by replaying a realistic event
  sequence. Human-run smoke test, not a lifecycle integration.
- **Feasibility probe** — [`probe.js`](probe.js): read-only investigation of what
  integration surface this machine's Codex exposes. Changes nothing.

## What is NOT confirmed yet

The public surface of Codex Desktop's lifecycle is **not documented**, so the
following are **candidates, not commitments**:

- Whether the `notify` hook fires at **per-tool** granularity (file read / edit /
  command / test) or only at **turn** boundaries.
- Whether the `[plugins.*]` / marketplace system accepts a third-party plugin
  with a public manifest / hook API.
- Whether the internal `logs_2.sqlite` event stream is a stable, allowed source.

## Probe findings on this machine (2026-07)

Running `node adapters/codex-desktop/probe.js` here found:

- `~/.codex` exists (`codexHome`), and Codex Desktop is installed as a Windows
  Store app (`WindowsApps\OpenAI.Codex_*`) that bundles `codex.exe` under
  `%LOCALAPPDATA%\OpenAI\Codex\bin\...`. **So "Windows 桌面版 Codex" and the
  `codex` CLI are the same family**, sharing `~/.codex`.
- `~/.codex/config.toml` contains a **real, token-free lifecycle hook**:
  ```toml
  notify = [ "…\\codex-computer-use.exe", "turn-ended" ]
  ```
  Codex spawns this `notify` program on lifecycle events — exactly the
  prompt-free / token-free mechanism we want. **Caveats:** it is currently
  occupied by Codex's own computer-use notifier, and the `turn-ended` argument
  suggests **turn-level**, not per-tool, granularity.
- A `[plugins.*]` + `[marketplaces.*]` plugin system and `[mcp_servers.*]` are
  configured; a `[desktop]` section confirms the desktop build.

## The approach we deliberately do NOT take

- ❌ We do **not** ask the Codex model to emit HTTP calls or status text.
- ❌ We do **not** spend model tokens on status reporting.
- ❌ We do **not** assume an undocumented plugin/hook API and ship a fake hook.

Status is driven by **Codex's own process lifecycle**, translated by this adapter.

## When a real lifecycle interface is confirmed — how to map it

Whatever the confirmed source (a wrapped `notify` program, a plugin callback, or
a log/event tail), the adapter only needs to translate each Codex activity into a
`sendSignal({ type, agent:'codex', adapter:'codex-desktop', sessionId, taskId, payload })`
call. Preferred path today: **wrap** the existing `notify` program with a small
shim that first calls the original notifier, then forwards a SuperNoNo event —
so nothing Codex already relies on is broken.

### Codex Desktop activity → SuperNoNo event mapping

| Codex Desktop activity        | SuperNoNo event        |
| ----------------------------- | ---------------------- |
| task start                    | `task_start`           |
| file read / search            | `file_reading`         |
| file edit / apply patch       | `file_editing`         |
| command running               | `command_running`      |
| test running                  | `test_running`         |
| permission required           | `permission_required`  |
| blocked                       | `blocked`              |
| completed                     | `completed`            |

(For `command_running`, set `payload.isTest = true` when the command is a test
run — the pet then shows the validating state instead of the building state.)

## M3.1 — Codex `notify` wrapper (coarse, installed)

This is the first *real* Codex integration: a wrapper around Codex's own `notify`
program. It is deliberately **coarse** — Codex `notify` fires at **turn
boundaries**, so we map one turn-ended notification to one SuperNoNo event. No
fine-grained file/edit/command events are fabricated.

**How it works**

```text
Codex turn ends
   -> Codex runs notify = [ node, notify-wrapper.js, "turn-ended" ]  (+ appended JSON)
        -> notify-wrapper.js
             1. re-invokes the ORIGINAL notify program with identical args
                (Codex's computer-use "turn-ended" keeps working, unchanged)
             2. records the arg STRUCTURE to notify-observed.json (keys+types only)
             3. POST /signal (type: turn_ended)  ->  pet quietly settles to idle
```

- **Mapping (default, since M3.2):** the default `forwardType` is `turn_ended`, so
  a Codex `turn-ended` forwards the coarse **`turn_ended`** event and the pet
  **quietly returns to idle** — no per-turn celebration. It only enters
  `completed` when the payload carries `outcome === "completed"`. You can still
  make every turn celebrate by explicitly setting `forwardType` to `"completed"`
  in `notify-wrapper.config.json` (`"idle"` is also available for the barest
  signal). See “M3.2” below for the full `forwardType` table.
- **Never breaks Codex:** the wrapper never throws, spawns the original detached
  so it can't block, and forwards to SuperNoNo best-effort (silent if the pet is
  off).
- **No secrets recorded:** `notify-observed.json` stores only the *shape* of what
  Codex sent (key names + value types + the event's `type` category), never
  message contents or tokens.

**Files**

| file | role |
| --- | --- |
| `notify-wrapper.js` | the wrapper Codex calls on every turn |
| `install-notify-wrapper.js` | backs up config.toml, then repoints `notify` at the wrapper |
| `uninstall-notify-wrapper.js` | restores config.toml from the backup (rollback) |
| `notify-wrapper.config.json` | generated at install: original notify + `forwardType` + backup path |
| `notify-observed.json` | generated at runtime: latest notify arg structure (no values) |

**Install / rollback**

```powershell
# install (backs up ~/.codex/config.toml first, then rewrites ONLY the notify line)
node adapters/codex-desktop/install-notify-wrapper.js

# roll back at any time (restores config.toml from the SuperNoNo backup)
node adapters/codex-desktop/uninstall-notify-wrapper.js
```

Rollback also works by hand: copy the
`~/.codex/config.toml.supernono-backup-<timestamp>` file back over
`~/.codex/config.toml`. The installer only ever changes the single `notify = [...]`
line; everything else in config.toml is left byte-for-byte identical.

> **Caveat:** the wrapper's `notify` line hard-codes absolute paths to `node.exe`
> and this repo. If you move the repo, or Codex updates and rewrites its own
> `notify`, re-run the installer (or roll back). The wrapper degrades safely: a
> failed wrapper just means that turn's notify is skipped, and rollback restores
> Codex's original notifier.

## M3.2 — notify payload analysis + coarse UX

Verified against a **real** Codex Desktop turn (captured in `notify-observed.json`,
structure only). The `agent-turn-complete` notification looks like:

```
type, thread-id, turn-id, cwd, client, input-messages[N], last-assistant-message
```

**What Codex `notify` can reliably tell us**

- ✅ that **one agent turn just ended** (this is the whole signal);
- ✅ stable **`thread-id` / `turn-id`** (opaque IDs, non-sensitive);
- ✅ **`cwd` / `client`** exist (working dir + client name).

**What it CANNOT tell us**

- ❌ file reads / searches, file edits / patches, command or test runs — there is
  **no per-tool information** in the turn notification. `input-messages` and
  `last-assistant-message` are message **content**, which we deliberately do
  **not** read or store.

**Conclusion: this is a turn-level (coarse) integration, not a fine-grained one.**
We only know "a turn ended", so we do not fabricate `file_reading` /
`file_editing` / `command_running` events.

### Privacy of the structure log

`notify-observed.json` now records shape only, with hardening:

- arrays → length (`array[25]`); strings → **length only** (`string(len=42)`),
  never the text; nested objects → recursed to **depth ≤ 2**; sensitive keys
  (`token`, `apiKey`, `authorization`, `secret`, `password`, …) → `"[redacted-key]"`.
- message bodies (`input-messages`, `last-assistant-message`), prompts, code and
  tokens are **never** recorded.

### Coarse UX: `forwardType`

To stop the pet celebrating every single turn, the forwarded event is
configurable in `notify-wrapper.config.json`:

| `forwardType` | pet behaviour on turn-ended |
| --- | --- |
| `turn_ended` (**default now**) | quiet: logs "Codex 完成一个回合" and settles to **idle**; only celebrates if `payload.outcome === "completed"` |
| `idle` | pet just returns to idle |
| `completed` | pet celebrates each turn (the old, noisy behaviour — opt-in) |

`turn_ended` is a coarse protocol event (see
[the protocol doc](../../docs/supernono-signal-protocol.md#turn_ended)); the
renderer maps it to idle-or-completed, so it never becomes an "unknown" event.
The default was changed from `completed` → `turn_ended`; a `forwardType` you set
yourself is preserved on reinstall.

### If you later want fine-grained events

Per-tool activity would require exploring one of these (all still unconfirmed):

- **Codex plugin lifecycle** — the `[plugins.*]` / marketplace system in
  `~/.codex`, if it exposes a per-tool hook API.
- **MCP server side-channel** — a SuperNoNo MCP server would at least see when
  *its own* tools are invoked.
- **`logs_2.sqlite` read-only tail** — the desktop app's internal event log; an
  unofficial, schema-fragile source (read-only only).
- **Other official hooks** — a future per-tool `notify` event type, if Codex adds one.

## How to run

```powershell
# 1) read-only feasibility probe (safe; changes nothing)
node adapters/codex-desktop/probe.js

# 2) manual smoke test — start SuperNoNo first, then replay events
npm start
node adapters/codex-desktop/manual-test.js
```

`manual-test.js` sends `task_start → file_reading → command_running →
command_running (isTest) → completed`, each tagged with
`agent:"codex"`, `adapter:"codex-desktop-manual-test"`,
`sessionId:"manual-session"`, `taskId:"manual-task"`. If SuperNoNo isn't running
it prints `MISS` for every event and exits cleanly.
