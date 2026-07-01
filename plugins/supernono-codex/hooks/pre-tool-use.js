'use strict';
/*
 * pre-tool-use.js — Codex PreToolUse hook (PROTOTYPE).
 *
 * Maps an about-to-run tool call to a SuperNoNo phase event (command_running /
 * file_reading / file_editing). The Codex hook payload shape is UNVERIFIED, so
 * lib.js parses it defensively. This hook NEVER runs the command and NEVER
 * throws into Codex.
 */
const { readHookInput, mapPreToolUse, send } = require('./lib');

(async () => {
  try {
    const event = mapPreToolUse(readHookInput());
    if (event) await send(event);
  } catch (_) { /* never affect Codex */ }
  process.exit(0);
})();
