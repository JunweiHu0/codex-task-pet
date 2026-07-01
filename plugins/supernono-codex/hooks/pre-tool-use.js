'use strict';
/*
 * pre-tool-use.js — Codex PreToolUse hook (PROTOTYPE).
 *
 * Maps an about-to-run tool call to a SuperNoNo phase event (command_running /
 * file_reading / file_editing). The Codex hook payload shape is UNVERIFIED, so
 * lib.js parses it defensively. This hook NEVER runs the command and NEVER
 * throws into Codex.
 */
const { readHookInput, metaOf, mapPreToolUse, send } = require('./lib');

(async () => {
  try {
    const payload = readHookInput();
    const event = mapPreToolUse(payload);
    if (event) await send(event, metaOf(payload));
  } catch (_) { /* never affect Codex */ }
  // Emit no stdout: no permission decision, so Codex behaviour is unaffected.
  process.exit(0);
})();
