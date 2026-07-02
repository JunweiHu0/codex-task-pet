# Installing the SuperNoNo Codex plugin (local)

> Installing registers a marketplace + plugin in Codex and **writes to
> `~/.codex/config.toml`** (two sections — see below). It does **not** touch the
> `notify` wrapper, which keeps working as the turn-level fallback either way.

This was verified end-to-end on **codex-cli 0.142.4** (Codex Desktop
`OpenAI.Codex 26.623.9142.0`, Windows). The commands, schema, and config effects
below are what actually happened on this machine — not guesses.

## What gets installed

The plugin at `plugins/supernono-codex/` uses **official Codex plugin hooks**
(`PreToolUse`, `PostToolUse`, `PermissionRequest`) declared in
`hooks/hooks.json` (auto-discovered — no `hooks` field in `plugin.json`). Each
hook runs a small Node script that POSTs a SuperNoNo protocol event to the local
bridge (`127.0.0.1:4174`). Hooks never execute your commands and never send
prompt / source / token.

## The project marketplace (committed)

This repo ships a project-level marketplace manifest at
[`.agents/plugins/marketplace.json`](../../.agents/plugins/marketplace.json). It
uses Codex's real schema (nested `source` object + `policy` block):

```json
{
  "name": "supernono-local",
  "interface": { "displayName": "SuperNoNo (local)" },
  "plugins": [
    {
      "name": "supernono-codex",
      "source": { "source": "local", "path": "./plugins/supernono-codex" },
      "policy": { "installation": "AVAILABLE" },
      "category": "Developer Tools"
    }
  ]
}
```

The repo root is the marketplace **root**; Codex reads `.agents/plugins/marketplace.json`
under it and resolves `path` relative to that root.

## Prerequisites

- **Node** — on Windows, `node` is **not** on Codex's hook-exec PATH, so
  `hooks.json` `command_windows` calls Node by absolute path
  (`C:\PROGRA~1\nodejs\node.exe`, the space-free 8.3 short path). If your Node lives
  elsewhere, update that path in each `command_windows`.
- SuperNoNo running (`npm start`) — otherwise hooks fail silently (no harm).

## Install (verified commands)

From a shell that can run the bundled `codex` CLI:

```bash
# 1. register this repo as a local marketplace named "supernono-local"
codex plugin marketplace add "<path-to-this-repo>"

# 2. install the plugin from it
codex plugin add supernono-codex@supernono-local
```

Result on this machine:

- `marketplace add` → `{ "marketplaceName": "supernono-local", "alreadyAdded": false }`
- `plugin add` → installed to
  `~/.codex/plugins/cache/supernono-local/supernono-codex/0.1.0/` with
  `installed: true, enabled: true`.
- `~/.codex/config.toml` gained exactly two sections:
  - `[marketplaces.supernono-local]` (`source = "<repo>"`)
  - `[plugins."supernono-codex@supernono-local"]` (`enabled = true`)

Confirm with `codex plugin list --json` (look for `supernono-codex@supernono-local`).

> **How Codex invokes the hooks (verified via a diagnostic hook).** Codex runs each
> hook with **cwd = the project directory, NOT the plugin root**, and provides a
> **`PLUGIN_ROOT`** env var pointing at the installed plugin folder
> (`~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`) which it **expands**
> in the command string. So `hooks.json` uses `${PLUGIN_ROOT}/hooks/<script>.js` — a
> relative `./hooks/...` would NOT resolve. On Windows, since `node` isn't on the
> hook PATH, `command_windows` calls the absolute
> `C:\PROGRA~1\nodejs\node.exe ${PLUGIN_ROOT}\hooks\<script>.js`. The payload arrives
> on the hook's **stdin** as JSON. The shell tool's `tool_name` is `shell_command`
> in Codex Desktop but `Bash` in `codex exec`, so the shell matcher is
> `shell_command|Bash`.

## Editing the plugin later

`plugin add` **copies** the plugin into the cache; it does not symlink your repo.
After you change files under `plugins/supernono-codex/`, refresh the cache:

```bash
codex plugin remove supernono-codex@supernono-local
codex plugin add   supernono-codex@supernono-local
```

## After installing: review & trust the hooks

Codex will **not** run a plugin's hooks until they are **trusted** — this is
verified: a non-interactive `codex exec` run with the plugin installed + enabled
executed a shell tool call but delivered **no** hook events, because the hooks
were untrusted (only the `notify` wrapper's `turn_ended` arrived).

To grant trust, either:

- **Interactive (recommended):** open Codex Desktop / the TUI, run any tool-using
  task; Codex prompts to **trust the `supernono-codex` hooks** — approve it after
  reviewing `hooks/hooks.json` and the scripts. Trust then persists.
- **One-off automation:** `codex exec --dangerously-bypass-hook-trust …` runs
  enabled hooks without persisted trust for that single invocation. The flag is
  DANGEROUS (it disarms the hook-trust guard) — use only on hook sources you
  wrote/vetted yourself.

## Verify

```powershell
npm start                                                  # SuperNoNo (bridge on 4174)
node plugins/supernono-codex/hooks/manual-fixture-test.js  # bridge/mapping smoke test
```

Then run a real Codex task (a shell command / a file edit / an action needing
approval) and watch the pet react. Plugin-hook events carry
`adapter: "codex-plugin-hooks"` (distinct from the notify wrapper's
`adapter: "codex-desktop-notify"`).

Confirmed working end-to-end in Codex Desktop: a real `shell_command` call delivers
`command_running` (PreToolUse) then `step_done` (PostToolUse), both with
`adapter: "codex-plugin-hooks"`. If nothing happens, check: hooks **trusted**
(re-approve after any hook edit), the absolute node path in `command_windows`
matches your machine, and your Codex expands `${PLUGIN_ROOT}`.

> The `legacy_notify` (config `notify`) chain is a **separate, unrelated** issue
> (Windows command-line length — os error 206) tracked in the
> [handoff notes](../../docs/2026-07-01-codex-plugin-hooks-handoff.md); it does not
> affect these plugin hooks.

## Uninstall / rollback

```bash
codex plugin remove      supernono-codex@supernono-local
codex plugin marketplace remove supernono-local
```

These remove the two `config.toml` sections and the cache copy. No other
`~/.codex/config.toml` change was made, and the `notify` wrapper (turn-level
fallback) is independent and unaffected.
