'use strict';
/*
 * permission-request.js — Codex PermissionRequest hook (PROTOTYPE).
 *
 * Maps an about-to-be-requested user approval to SuperNoNo `permission_required`,
 * sending only a short, secret-masked command/action summary. Defensive parsing;
 * never throws into Codex.
 */
const { readHookInput, metaOf, mapPermissionRequest, send } = require('./lib');

(async () => {
  try {
    const payload = readHookInput();
    const event = mapPermissionRequest(payload);
    if (event) await send(event, metaOf(payload));
  } catch (_) { /* never affect Codex */ }
  // Emit no stdout: never auto-allow/deny — Codex keeps full control of approval.
  process.exit(0);
})();
