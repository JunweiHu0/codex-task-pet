# supernono-codex — Codex Plugin Hooks Prototype (M4.1)

A **prototype** Codex plugin that explores whether Codex's plugin **hooks** can
give SuperNoNo *fine-grained* lifecycle events (file read / edit, command run,
permission request) — richer than the `turn_ended` signal we already get from the
`notify` wrapper.

> ⚠️ **This is a prototype, not a confirmed/installed plugin.** On this machine's
> Codex version the hooks mechanism could **not** be verified (details below), so
> this milestone ships only a **skeleton + README + manual fixture**. It is **not**
> wired into Codex, and it does **not** modify `~/.codex/config.toml`.

## Where this fits

```text
Codex plugin hooks (PreToolUse / PostToolUse / PermissionRequest)   <- fine-grained (PROTOTYPE, unverified)
        \
         >-- adapters/shared/send-signal.js -- POST 127.0.0.1:4174/signal -- SuperNoNo pet
        /
Codex notify wrapper (turn-ended)                                   <- turn-level fallback (WORKING, installed)
```

- The **`notify` wrapper stays** as the reliable **turn-level fallback**
  (`turn-ended → turn_ended`, see
  [adapters/codex-desktop](../../adapters/codex-desktop/README.md)). This plugin
  does **not** replace it.
- The pet UI is **not** embedded in Codex. The plugin is just another *adapter*:
  it observes lifecycle and forwards SuperNoNo's existing unified protocol events
  — no new agent-specific event types.
- If hooks turn out to work, the pet shows richer state; if not, the notify
  wrapper still provides turn-level state.

## Confirmed vs. unconfirmed on this machine (probe, 2026-07)

**✅ Confirmed**

- The plugin **manifest format** `.codex-plugin/plugin.json` is real — verified
  against OpenAI's own bundled plugins (`browser`, `computer-use`, …). Observed
  fields: `name`, `version`, `description`, `author`, `license`, `keywords`,
  `skills`, `interface { … }`.
- Codex has a plugin/marketplace system under `~/.codex/plugins` and uses
  `skills/` + MCP.

**❓ Unconfirmed / not found (so treat as UNVERIFIED)**

- **No installed plugin declares a `hooks` field**, there is **no `hooks.json`**
  anywhere under `~/.codex`, and **no `PreToolUse` / `PostToolUse` mechanism** was
  found. So a plugin **hooks lifecycle API is not confirmed** on this Codex build.
- Therefore the `hooks` field in `plugin.json` and the whole `hooks/hooks.json`
  format are a **best guess**. **Manifest format requires verification.**
- The **hook payload shape** (tool name / command / file / result fields, and how
  it's delivered — argv vs stdin) is unknown; the hook scripts parse defensively.

Because of the above, this milestone does **not** claim installation success and
does **not** touch Codex config.

## What's here

```text
plugins/supernono-codex/
├── .codex-plugin/plugin.json      # manifest (confirmed schema; `hooks` field UNVERIFIED)
├── hooks/
│   ├── hooks.json                 # best-guess hook manifest (UNVERIFIED format)
│   ├── lib.js                     # defensive parsing + mapping + send()
│   ├── pre-tool-use.js            # PreToolUse  -> command_running / file_reading / file_editing
│   ├── post-tool-use.js           # PostToolUse -> step_done / error
│   ├── permission-request.js      # PermissionRequest -> permission_required
│   ├── manual-fixture-test.js     # simulate payloads (no real hooks needed)
│   └── README.md                  # hook details + mapping tables + unconfirmed points
└── README.md                      # this file
```

Hooks reuse [`adapters/shared/send-signal.js`](../../adapters/shared/send-signal.js);
**no new npm dependencies**, no `package.json` change.

## Run the manual fixture

The fixture proves the mapping + transport work **without** real Codex hooks:

```powershell
npm start                                                  # start SuperNoNo
node plugins/supernono-codex/hooks/manual-fixture-test.js
```

It feeds simulated payloads through the same `lib.js` mappers the hooks use:

| fixture | → event |
| --- | --- |
| `command` (`npm run build`) | `command_running` (施工) |
| `test command` (`npm test`) | `command_running` `isTest` (验证) |
| `file read` | `file_reading` (扫描) |
| `file edit` | `file_editing` (施工) |
| `permission` | `permission_required` (等待授权) |
| `post success` | `step_done` (记一步) |

If SuperNoNo is closed, every line prints `MISS` and the script exits cleanly (0).

## Installing into Codex later (only after verification)

Do **not** install this until the hooks API is confirmed. When it is:

1. Confirm the real `hooks.json` schema (event names, invocation, payload) and the
   plugin install location (a marketplace/plugins dir under `~/.codex`).
2. Fix `hooks/hooks.json` and the `hooks` field in `plugin.json` to the real
   format; fix the defensive extractors in `hooks/lib.js` to the real payload keys.
3. Only then register the plugin. Any change to `~/.codex/config.toml` must be
   backed up first and done with your explicit approval — same discipline as the
   [notify wrapper installer](../../adapters/codex-desktop/install-notify-wrapper.js).

## If the real hooks API doesn't match

- Different payload shape → update `toolNameOf` / `commandOf` / `pathOf` and the
  classify regexes in `hooks/lib.js`.
- Different manifest/hook format → update `plugin.json` `hooks` + `hooks/hooks.json`.
- No usable per-tool hooks at all → keep the `notify` wrapper as the turn-level
  source and explore the alternatives noted in
  [the plan](../../docs/codex-plugin-hooks-prototype-plan.md): MCP side-channel,
  `logs_2.sqlite` read-only tail, or a future official per-tool notify event.
