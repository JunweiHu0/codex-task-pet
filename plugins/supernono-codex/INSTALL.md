# Installing the SuperNoNo Codex plugin (local)

> **This document is instructions only.** Nothing here was run for you. Installing
> touches your Codex setup (a marketplace file and/or `~/.codex/plugins`), so
> **you** run these steps and Codex will ask you to **review/trust** the hooks.
> This does **not** require editing `~/.codex/config.toml`, and the `notify`
> wrapper keeps working as the turn-level fallback either way.

## What gets installed

The plugin at `plugins/supernono-codex/` uses **official Codex plugin hooks**
(`PreToolUse`, `PostToolUse`, `PermissionRequest`) declared in
`hooks/hooks.json` (auto-discovered — no `hooks` field needed in `plugin.json`).
Each hook runs a small Node script that POSTs a SuperNoNo protocol event to the
local bridge. Hooks never execute your commands and never send prompt/source/token.

## Prerequisites

- `node` must be resolvable in the environment Codex uses to run hook commands.
  If it isn't on Codex's PATH, replace `node` in `hooks/hooks.json`
  `command` / `command_windows` with an absolute path to a Node binary.
- SuperNoNo running (`npm start`) — otherwise hooks fail silently (no harm).

## Option A — add this repo as a local marketplace (recommended)

```bash
codex plugin marketplace add ./local-marketplace-root
```

Point that at a marketplace root whose `marketplace.json` references this plugin
with a `"./"`-prefixed relative path, e.g. a `marketplace.json` like:

```json
{
  "name": "supernono-local",
  "plugins": [
    { "name": "supernono-codex", "source": "./plugins/supernono-codex" }
  ]
}
```

> ⚠️ The exact `marketplace.json` schema may differ by Codex version — verify
> against `codex plugin --help` / the docs before relying on it. **Create this
> file yourself**; this repo does not ship a live marketplace file so nothing is
> auto-registered into your Codex.

## Option B — project or personal marketplace file

Per the docs, Codex also reads:

- `$REPO_ROOT/.agents/plugins/marketplace.json` (project-scoped), or
- `~/.agents/plugins/marketplace.json` (personal).

Create one of those pointing at `./plugins/supernono-codex` if you prefer
auto-discovery over the CLI `add`. (Again: create it yourself — not shipped here.)

Installed plugins land under
`~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`, and Codex passes the
`PLUGIN_ROOT` env var to the hook commands (which `hooks.json` references).

## After installing: review & trust

Codex will prompt to **review/trust** the plugin's hooks before they run. Approve
them only after reading `hooks/hooks.json` and the hook scripts. Until trusted,
the hooks will not fire.

## Verify

```powershell
npm start                                                  # SuperNoNo
node plugins/supernono-codex/hooks/manual-fixture-test.js  # bridge/mapping smoke test
```

Then run a real Codex task and watch the pet react to tool use / permission
prompts. If nothing happens, check: node on PATH for hooks, hooks trusted, and
`hooks.json` `${PLUGIN_ROOT}` expansion (see the wrapper README's notes).

## Uninstall / rollback

Remove the marketplace entry (`codex plugin marketplace remove …` or delete the
`marketplace.json` you created) and/or disable the plugin in Codex. No
`~/.codex/config.toml` change was made, so there is nothing to revert there. The
`notify` wrapper (turn-level fallback) is independent and unaffected.
