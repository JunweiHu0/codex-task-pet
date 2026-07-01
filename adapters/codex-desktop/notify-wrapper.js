'use strict';
/*
 * notify-wrapper.js — SuperNoNo wrapper for the Codex `notify` hook (M3.1).
 *
 * Codex Desktop calls its configured `notify` program on lifecycle events. The
 * installer puts this wrapper in that program's place. On every invocation it:
 *   1. re-invokes the ORIGINAL notify program with the exact same args, so
 *      Codex's own behaviour (computer-use "turn-ended") is preserved; then
 *   2. forwards ONE coarse SuperNoNo event for this turn.
 *
 * It is intentionally COARSE. Codex `notify` fires at turn boundaries, so this
 * maps "turn ended" -> one SuperNoNo event. It does NOT fabricate fine-grained
 * file_reading / file_editing / command_running events.
 *
 * Safety guarantees:
 *   - never throws (Codex must never be affected by a wrapper error);
 *   - never blocks on the original program (spawned detached + unref);
 *   - records only the STRUCTURE of the notify args (keys + value types),
 *     never message contents / tokens / secrets.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { sendSignal } = require('../shared/send-signal');

const HERE = __dirname;
const CONFIG_PATH = path.join(HERE, 'notify-wrapper.config.json');
const OBSERVED_PATH = path.join(HERE, 'notify-observed.json');
const DRY = process.env.SN_NOTIFY_WRAPPER_DRYRUN === '1';
const SAFE_SLUG = /^[a-z0-9._-]{1,64}$/i;

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (_) { return {}; }
}

// First arg that parses as a JSON object is the notify payload (Codex appends it).
function findJsonPayload(args) {
  for (const a of args) {
    if (typeof a === 'string' && a.trim().startsWith('{')) {
      try { const o = JSON.parse(a); if (o && typeof o === 'object') return o; } catch (_) { /* not json */ }
    }
  }
  return null;
}

// Describe payload SHAPE only: key -> type/length. Never the values.
function describeShape(payload) {
  const shape = {};
  if (!payload || typeof payload !== 'object') return shape;
  for (const [k, v] of Object.entries(payload)) {
    if (Array.isArray(v)) shape[k] = 'array[' + v.length + ']';
    else if (v === null) shape[k] = 'null';
    else shape[k] = typeof v;
  }
  return shape;
}

function recordStructure(args, payload) {
  try {
    const fixedArgs = args.filter((a) => typeof a === 'string' && !a.trim().startsWith('{'));
    const typeVal = payload && typeof payload.type === 'string' && SAFE_SLUG.test(payload.type) ? payload.type : null;
    fs.writeFileSync(OBSERVED_PATH, JSON.stringify({
      observedAt: new Date().toISOString(),
      argCount: args.length,
      fixedArgs,                         // literals we control (e.g. "turn-ended"): safe
      hasJsonPayload: !!payload,
      payloadType: typeVal,              // e.g. "agent-turn-complete": a category, not content
      payloadShape: describeShape(payload), // keys + types only — NO values
    }, null, 2));
  } catch (_) { /* logging must never break the wrapper */ }
}

async function main() {
  const cfg = readConfig();
  const passthrough = process.argv.slice(2); // [...fixedArgs, <jsonPayload>]

  // 1) Re-invoke the ORIGINAL notify program (best-effort, non-blocking).
  try {
    const original = Array.isArray(cfg.originalNotify) ? cfg.originalNotify[0] : null;
    if (original && fs.existsSync(original)) {
      if (DRY) {
        const fixed = passthrough.filter((a) => typeof a === 'string' && !a.trim().startsWith('{'));
        console.log('[dry-run] would spawn original:', original);
        console.log('[dry-run] arg count:', passthrough.length, '| fixed args:', JSON.stringify(fixed));
      } else {
        const child = spawn(original, passthrough, { detached: true, stdio: 'ignore', windowsHide: true });
        child.on('error', () => {});
        child.unref();
      }
    }
  } catch (_) { /* preserve Codex even if the original can't be launched */ }

  // 2) Record the arg structure, then forward one coarse SuperNoNo event.
  const payload = findJsonPayload(passthrough);
  recordStructure(passthrough, payload);

  const forwardType = (cfg.forwardType && typeof cfg.forwardType === 'string') ? cfg.forwardType : 'completed';
  try {
    const res = await sendSignal({
      type: forwardType,
      agent: 'codex',
      adapter: 'codex-desktop-notify',
      payload: { action: 'Codex 完成一个回合', source: 'codex-notify' },
    });
    if (DRY) console.log('[dry-run] forwarded', forwardType, '->', JSON.stringify(res));
  } catch (_) { /* pet not running -> ignore */ }
}

main().then(() => process.exit(0)).catch(() => process.exit(0));
