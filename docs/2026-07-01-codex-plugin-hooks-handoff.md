# SuperNoNo Codex Plugin Hooks Handoff

Date: 2026-07-01

This document captures the current debugging state for continuing the SuperNoNo Codex Desktop plugin hook work from another machine.

## Current Goal

Make the SuperNoNo Codex Desktop plugin hooks actually fire for tool usage, especially shell command execution, so the capture bridge receives plugin-side events such as command start, step done, and permission request.

## Confirmed Facts

- Codex Desktop's shell tool is named `shell_command`, not `Bash`.
- Manual shell tests from Codex Desktop ran successfully:
  - Command: `echo supernono-hook-test`
  - Output: `supernono-hook-test`
- The command execution itself is not the failing part.
- Hook warning logs are stored in:
  - `~/.codex/logs_2.sqlite`
- Relevant log target:
  - `codex_core::hook_runtime`
- Read-only query used by CC:

```sh
sqlite3 -readonly ~/.codex/logs_2.sqlite \
 "SELECT datetime(ts,'unixepoch','localtime'), level, feedback_log_body
  FROM logs WHERE target='codex_core::hook_runtime' ORDER BY ts DESC LIMIT 20;"
```

## Legacy Notify Is A Separate Issue

All observed `hook_runtime` WARN entries were for:

```text
hook_name=legacy_notify
```

The repeated failure was:

```text
after_agent hook failed; continuing ... hook_name=legacy_notify error=<Windows filename or extension too long> (os error 206)
```

This is Windows error 206, meaning filename or command line too long. In this Desktop thread, the old `config.toml` notify chain appears to receive a very large `--previous-notify` / notify payload JSON, exceeding the Windows command-line length limit.

Conclusion:

- `legacy_notify` is broken on long Desktop conversations.
- This explains why the notify wrapper delivered `turn_ended` in short sessions but not this long one.
- This is not evidence that the SuperNoNo plugin hooks themselves failed internally.
- Keep this separate from plugin hook matcher validation.

## Plugin Install / Cache / Trust Status

CC previously confirmed:

- `~/.codex/config.toml` has a `[hooks.state]` section with trusted hashes for all 5 plugin hooks:
  - 3 x `pre_tool_use`
  - 1 x `permission_request`
  - 1 x `post_tool_use`
- Trust is content-hash based.
- Cached `lib.js` has:

```js
const { sendSignal } = require('./send-signal');
```

- Cached path checked by CC:

```text
~/.codex/plugins/cache/supernono-local/supernono-codex/0.1.0/hooks/lib.js
```

- `send-signal.js` is present in the cached hooks folder.

Important updated trust note:

- CC changed hook content during the matcher fix.
- The old trusted hashes in `~/.codex/config.toml` will no longer match the changed hook contents.
- Codex Desktop should re-prompt to trust the changed SuperNoNo hooks.
- Approve those trust prompts during retest.

## Root Cause Found

The plugin was installed and trusted, but 0 plugin events reached the capture bridge. The only captured events were from the old notify wrapper:

- adapter: `codex-desktop-notify`
- event: `turn_ended`

Also, 0 `hook_runtime` log entries mentioned:

- `supernono`
- `pre_tool_use`
- `post_tool_use`
- `permission_request`

The likely cause was matcher mismatch:

- `PreToolUse` matched `Bash`, but Codex Desktop uses `shell_command`.
- `PostToolUse` and `PermissionRequest` used `matcher: "*"`, which this Codex version may not treat as catch-all.
- Shipping plugin style appears to use omitted `matcher` for catch-all behavior.

## Latest Update From CC: Matcher Fix Applied

CC applied the A+B matcher fix.

Changed source file:

```text
plugins/supernono-codex/hooks/hooks.json
```

Confirmed cached hook state after refresh:

- `PreToolUse` matchers now include:

```json
["shell_command", "apply_patch|Edit|Write", "mcp__.*"]
```

- `PostToolUse` has no `matcher` field.
- `PermissionRequest` has no `matcher` field.
- Cached `lib.js:20` still uses:

```js
const { sendSignal } = require('./send-signal');
```

- Cached `send-signal.js` is present.
- Cache was refreshed with remove + add.
- Cache mtime reported by CC: around 18:01.

## Runtime State Before Retest

- Codex Desktop had been running since around 09:31.
- CC says restart is required to avoid stale in-memory hook state.
- Fully quit and reopen Codex Desktop before retesting.
- Capture bridge has been reset and is healthy on port `4174`.
- Do not run `npm start` during the retest because it would collide with the capture bridge on port `4174`.

## Retest Procedure

After restarting Codex Desktop:

1. Fully quit and reopen Codex Desktop.
2. Open this project or any normal Codex session.
3. Approve the re-trust prompts for changed SuperNoNo hooks.
4. Ask Codex:

```text
Please actually call the shell tool and run: echo supernono-hook-test
```

5. Expected Codex shell output:

```text
supernono-hook-test
```

6. Tell CC `done`.
7. CC should inspect the capture bridge on port `4174`.
8. CC should inspect `~/.codex/logs_2.sqlite` for `codex_core::hook_runtime` entries.

Success criteria:

- Capture bridge receives plugin-originated events, not only `codex-desktop-notify`.
- `command_running` appears from PreToolUse for `shell_command`.
- `step_done` appears from PostToolUse after command completion.
- Both events should have adapter `codex-plugin-hooks`.
- No relevant plugin hook WARNs appear in `hook_runtime`.

## Optional PermissionRequest Test

Only after basic `shell_command` hook firing is confirmed, test a command that requires escalation. Follow normal approval flow. The point is to verify `permission_request` hook delivery, not to perform a risky operation.

Use a harmless command if possible, and avoid destructive commands.

## Docs / Commit Notes

CC has not committed the matcher fix yet.

CC also mentioned that two doc tables still say `Bash`; update them after retest confirms `shell_command` fires. Search for stale references:

```sh
rg "Bash|shell_command|matcher" docs plugins
```

Recommended commit scope once retest passes:

- `plugins/supernono-codex/hooks/hooks.json`
- this handoff document
- any stale docs that still describe the shell matcher as `Bash`

## Later Work: Legacy Notify Windows 206

The old `legacy_notify` chain should be redesigned for Windows long-thread safety.

Likely fix direction:

- Avoid passing huge JSON payloads through command-line arguments.
- Write payload to a temp file and pass only the path.
- Or replace the old notify chain with the plugin hook path once plugin hooks are working.

Do not block plugin hook matcher validation on this legacy notify problem.
