'use strict';
/*
 * uninstall-notify-wrapper.js — rolls back the notify wrapper by restoring
 * config.toml from the most recent SuperNoNo backup.
 *
 * Run: node adapters/codex-desktop/uninstall-notify-wrapper.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const CODEX_HOME = path.join(os.homedir(), '.codex');
const CONFIG = path.join(CODEX_HOME, 'config.toml');
const WRAPPER_CFG = path.join(__dirname, 'notify-wrapper.config.json');

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

// Prefer the backup recorded at install time.
let backup = null;
try { backup = JSON.parse(fs.readFileSync(WRAPPER_CFG, 'utf8')).backup; } catch (_) { /* fall through */ }

// Fallback: newest matching backup in ~/.codex.
if (!backup || !fs.existsSync(backup)) {
  let found = [];
  try {
    found = fs.readdirSync(CODEX_HOME)
      .filter((f) => f.startsWith('config.toml.supernono-backup-'))
      .map((f) => path.join(CODEX_HOME, f))
      .sort();
  } catch (_) { /* ignore */ }
  backup = found.length ? found[found.length - 1] : null;
}
if (!backup || !fs.existsSync(backup)) fail('no SuperNoNo backup found; restore config.toml manually.');

fs.copyFileSync(backup, CONFIG);
console.log('Restored config.toml from backup:\n  ' + backup);
console.log('Codex notify is back to its original program; SuperNoNo wrapper removed.');
