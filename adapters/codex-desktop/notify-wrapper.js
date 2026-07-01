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

// Keys whose VALUES must never be described (redacted regardless of type).
const SENSITIVE_KEY = /(token|api[_-]?key|authorization|auth|secret|password|passwd|pwd|credential|cookie|private[_-]?key|access[_-]?key)/i;
const MAX_SHAPE_DEPTH = 2;

// Describe a value's SHAPE only — never its content:
//   string -> "string(len=N)"   array -> "array[N]"   object -> recurse (depth<=2)
//   number/boolean -> type name only.
function describeValue(v, depth) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array[' + v.length + ']';
  const t = typeof v;
  if (t === 'string') return 'string(len=' + v.length + ')';
  if (t === 'object') return depth < MAX_SHAPE_DEPTH ? describeShape(v, depth + 1) : 'object(depth-limited)';
  return t; // number, boolean, function, ... — type only, never the value
}

// Recursively describe an object's keys -> value shapes. Redacts sensitive keys.
function describeShape(obj, depth) {
  depth = depth || 1;
  const shape = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return shape;
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY.test(k)) { shape[k] = '[redacted-key]'; continue; }
    shape[k] = describeValue(v, depth);
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

// Accepted coarse forward types. Anything else falls back to the quiet default.
function normalizeForwardType(v) {
  return (typeof v === 'string' && ['completed', 'idle', 'turn_ended'].includes(v)) ? v : 'turn_ended';
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

  const forwardType = normalizeForwardType(cfg.forwardType);
  const outPayload = { action: 'Codex 完成一个回合', source: 'codex-notify' };
  // Forward-compatible: relay ONLY a short, non-sensitive outcome slug if Codex
  // ever provides one. Never relay message text / prompts / code.
  if (payload && typeof payload.outcome === 'string' && SAFE_SLUG.test(payload.outcome)) {
    outPayload.outcome = payload.outcome;
  }
  try {
    const res = await sendSignal({ type: forwardType, agent: 'codex', adapter: 'codex-desktop-notify', payload: outPayload });
    if (DRY) console.log('[dry-run] forwarded', forwardType, '->', JSON.stringify(res));
  } catch (_) { /* pet not running -> ignore */ }
}

main().then(() => process.exit(0)).catch(() => process.exit(0));
