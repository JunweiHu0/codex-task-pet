'use strict';
/*
 * post-tool-use.js — Codex PostToolUse hook (PROTOTYPE).
 *
 * Maps a finished tool call to a SuperNoNo event: step_done on success
 * (rule "testPass" for tests), error on a clear failure. Undetermined results
 * fall back to step_done (an action log), never fabricated detail. Defensive
 * parsing; never throws into Codex.
 */
const { readHookInput, metaOf, mapPostToolUse, send } = require('./lib');

(async () => {
  try {
    const payload = readHookInput();
    const event = mapPostToolUse(payload);
    if (event) await send(event, metaOf(payload));
  } catch (_) { /* never affect Codex */ }
  // Emit no stdout: never block the tool result or undo side effects.
  process.exit(0);
})();
