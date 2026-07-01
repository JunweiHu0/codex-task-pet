'use strict';
/*
 * permission-request.js — Codex PermissionRequest hook (PROTOTYPE).
 *
 * Maps an about-to-be-requested user approval to SuperNoNo `permission_required`,
 * sending only a short, secret-masked command/action summary. Defensive parsing;
 * never throws into Codex.
 */
const { readHookInput, mapPermissionRequest, send } = require('./lib');

(async () => {
  try {
    const event = mapPermissionRequest(readHookInput());
    if (event) await send(event);
  } catch (_) { /* never affect Codex */ }
  process.exit(0);
})();
