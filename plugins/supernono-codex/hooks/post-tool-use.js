'use strict';
/*
 * post-tool-use.js — Codex PostToolUse hook (PROTOTYPE).
 *
 * Maps a finished tool call to a SuperNoNo event: step_done on success
 * (rule "testPass" for tests), error on a clear failure. Undetermined results
 * fall back to step_done (an action log), never fabricated detail. Defensive
 * parsing; never throws into Codex.
 */
const { readHookInput, mapPostToolUse, send } = require('./lib');

(async () => {
  try {
    const event = mapPostToolUse(readHookInput());
    if (event) await send(event);
  } catch (_) { /* never affect Codex */ }
  process.exit(0);
})();
