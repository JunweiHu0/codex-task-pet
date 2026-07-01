'use strict';
/*
 * install-notify-wrapper.js — installs the SuperNoNo notify wrapper into Codex.
 *
 * Backs up ~/.codex/config.toml FIRST, then rewrites the single-line
 * `notify = [...]` so Codex calls this repo's notify-wrapper.js. The wrapper
 * re-invokes the ORIGINAL notify program and also forwards a coarse event to
 * SuperNoNo.
 *
 * Safe + idempotent:
 *   - refuses to double-wrap (won't capture itself as the "original");
 *   - aborts WITHOUT modifying anything if it can't confidently parse notify;
 *   - always makes a timestamped backup before the first write.
 *
 * Run: node adapters/codex-desktop/install-notify-wrapper.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const CODEX_HOME = path.join(os.homedir(), '.codex');
const CONFIG = path.join(CODEX_HOME, 'config.toml');
const HERE = __dirname;
const WRAPPER = path.join(HERE, 'notify-wrapper.js');
const WRAPPER_CFG = path.join(HERE, 'notify-wrapper.config.json');
const NODE_EXE = process.execPath; // the node executable running this installer

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

if (!fs.existsSync(CONFIG)) fail('config.toml not found at ' + CONFIG);
if (!fs.existsSync(WRAPPER)) fail('notify-wrapper.js missing at ' + WRAPPER);

const text = fs.readFileSync(CONFIG, 'utf8');

// Match a single-line `notify = [ ... ]` (no ']' or newline inside).
// Use [ \t] (not \s) around the line so the trailing newline is NEVER consumed
// — otherwise the replacement would collapse the blank line after `notify`.
const m = text.match(/^([ \t]*notify[ \t]*=[ \t]*)(\[[^\]\n]*\])[ \t]*$/m);
if (!m) fail('could not find a single-line `notify = [...]` in config.toml; nothing modified.');

let originalNotify;
try { originalNotify = JSON.parse(m[2]); } catch (e) { fail('could not parse notify array as JSON: ' + e.message); }
if (!Array.isArray(originalNotify) || originalNotify.length === 0) fail('notify array is empty or invalid.');

// Idempotency: never wrap our own wrapper.
if (originalNotify.some((x) => typeof x === 'string' && x.includes('notify-wrapper.js'))) {
  console.log('Already installed (notify already points to notify-wrapper.js). Nothing to do.');
  process.exit(0);
}

// 1) Backup FIRST.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = CONFIG + '.supernono-backup-' + stamp;
fs.copyFileSync(CONFIG, backup);
if (!fs.existsSync(backup)) fail('backup failed; aborting before any modification.');

// 2) Persist the original notify so the wrapper can re-invoke it. Preserve an
//    existing forwardType choice on reinstall; default to the quiet 'turn_ended'.
let forwardType = 'turn_ended'; // 'completed' | 'idle' | 'turn_ended'
try {
  const prev = JSON.parse(fs.readFileSync(WRAPPER_CFG, 'utf8'));
  if (prev && ['completed', 'idle', 'turn_ended'].includes(prev.forwardType)) forwardType = prev.forwardType;
} catch (_) { /* no previous config -> use default */ }
fs.writeFileSync(WRAPPER_CFG, JSON.stringify({
  originalNotify,             // [ originalProgram, ...fixedArgs ]
  forwardType,               // coarse turn-ended -> pet event ('turn_ended' | 'idle' | 'completed')
  installedAt: new Date().toISOString(),
  backup,
}, null, 2));

// 3) New notify = node + wrapper + the ORIGINAL fixed args, so the wrapper
//    relays those (plus Codex's appended JSON) straight to the original program.
const fixedArgs = originalNotify.slice(1);
const newNotify = [NODE_EXE, WRAPPER, ...fixedArgs];
const newLine = m[1] + '[ ' + newNotify.map((s) => JSON.stringify(s)).join(', ') + ' ]';

fs.writeFileSync(CONFIG, text.replace(m[0], newLine));

console.log('Installed SuperNoNo notify wrapper.');
console.log('  backup     : ' + backup);
console.log('  original   : ' + JSON.stringify(originalNotify));
console.log('  new notify : ' + JSON.stringify(newNotify));
console.log('\nRollback:');
console.log('  node adapters/codex-desktop/uninstall-notify-wrapper.js');
console.log('  (or copy the backup file above back over config.toml)');
