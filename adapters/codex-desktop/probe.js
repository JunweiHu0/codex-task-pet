'use strict';
/*
 * probe.js — READ-ONLY feasibility probe for a Windows Codex Desktop adapter.
 *
 * It inspects existence + a few small, non-secret config markers to answer:
 * "what integration surface does this machine's Codex expose?" It NEVER:
 *   - reads or prints tokens/secrets (it explicitly skips ~/.codex/auth.json),
 *   - writes anything or changes any config,
 *   - uploads anything,
 *   - bulk-reads files outside this repo (only tiny existence/marker checks).
 *
 * Usage: node adapters/codex-desktop/probe.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const REPO = path.resolve(__dirname, '..', '..');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');

const confirmed = [];
const unconfirmed = [];
const nextSteps = [];

function exists(p) { try { return fs.existsSync(p); } catch (_) { return false; } }
function line(label, val) { console.log('  ' + String(label).padEnd(38) + ' ' + val); }

console.log('\n=== SuperNoNo · Codex Desktop feasibility probe (read-only) ===\n');

/* [1] Env var NAMES only — never values, so no token can leak. */
console.log('[1] Env vars matching /codex|openai/i (names only):');
const envHits = Object.keys(process.env).filter((k) => /codex|openai/i.test(k));
if (envHits.length) envHits.forEach((k) => line(k, '(present)'));
else line('(none found)', '');

/* [2] Candidate Codex homes / installs (existence only). */
console.log('\n[2] Candidate Codex paths (existence only):');
const codexHome = path.join(HOME, '.codex');
const candidates = [
  ['~/.codex (codexHome)', codexHome],
  ['%LOCALAPPDATA%/OpenAI/Codex', path.join(LOCALAPPDATA, 'OpenAI', 'Codex')],
  ['~/.codex/config.toml', path.join(codexHome, 'config.toml')],
  ['~/.codex/plugins', path.join(codexHome, 'plugins')],
  ['~/.codex/skills', path.join(codexHome, 'skills')],
  ['~/.codex/sessions', path.join(codexHome, 'sessions')],
  ['~/.codex/logs_2.sqlite', path.join(codexHome, 'logs_2.sqlite')],
];
for (const [label, p] of candidates) line(label, exists(p) ? 'FOUND' : 'missing');

/* [3] Lifecycle-hook markers in config.toml — presence only, NO contents dumped. */
console.log('\n[3] Lifecycle markers in ~/.codex/config.toml (presence only):');
const cfgPath = path.join(codexHome, 'config.toml');
let notifyConfigured = false, hasPlugins = false, hasMcp = false, hasDesktop = false;
if (exists(cfgPath)) {
  try {
    const txt = fs.readFileSync(cfgPath, 'utf8'); // config, not secrets; auth.json is never read
    notifyConfigured = /^\s*notify\s*=/m.test(txt);
    hasPlugins = /^\s*\[plugins\./m.test(txt) || /^\s*\[marketplaces\./m.test(txt);
    hasMcp = /^\s*\[mcp_servers\./m.test(txt);
    hasDesktop = /^\s*\[desktop\]/m.test(txt);
  } catch (_) { /* ignore unreadable config */ }
  line('notify hook configured', notifyConfigured ? 'YES (token-free lifecycle hook)' : 'no');
  line('plugin / marketplace system', hasPlugins ? 'YES' : 'no');
  line('mcp_servers configured', hasMcp ? 'YES' : 'no');
  line('[desktop] section', hasDesktop ? 'YES (desktop build)' : 'no');
} else {
  line('config.toml', 'missing');
}

/* [4] Repo clues in this project. */
console.log('\n[4] Repo clues in this project:');
for (const f of ['.codex', '.claude', 'AGENTS.md', '.cursor', '.cursorrules']) {
  line(f, exists(path.join(REPO, f)) ? 'FOUND' : 'missing');
}

/* ---- verdict ---- */
if (exists(codexHome)) confirmed.push('Codex Desktop present: codexHome ~/.codex exists (same family as the codex CLI).');
if (hasDesktop) confirmed.push('config.toml has a [desktop] section -> this is the Windows desktop build.');

if (notifyConfigured) {
  confirmed.push('A token-free lifecycle hook EXISTS: config.toml `notify` program (Codex spawns it on lifecycle events).');
  unconfirmed.push('notify granularity: looks turn-level, not per-tool (file/edit/command) — needs confirmation.');
  unconfirmed.push('notify is likely already used by Codex itself -> SuperNoNo must WRAP it, not overwrite it.');
  nextSteps.push('Decide whether to wrap the existing `notify` program with a shim that ALSO forwards to SuperNoNo (edits ~/.codex/config.toml -> needs explicit user approval).');
} else {
  unconfirmed.push('No `notify` hook configured; no confirmed token-free lifecycle interface on this machine.');
  nextSteps.push('Confirm whether Codex Desktop exposes a notify / plugin / log lifecycle interface.');
}
if (hasPlugins) unconfirmed.push('A plugin/marketplace system exists, but its public plugin manifest / hook API is not documented here.');
if (exists(path.join(codexHome, 'logs_2.sqlite'))) unconfirmed.push('An internal SQLite event log exists (logs_2.sqlite) — a possible but fragile/unofficial event source.');
nextSteps.push('Do NOT modify ~/.codex without explicit user approval. This probe changed nothing.');

console.log('\n=== VERDICT ===');
console.log('\nCONFIRMED:');
confirmed.length ? confirmed.forEach((s) => console.log('  + ' + s)) : console.log('  (none)');
console.log('\nUNCONFIRMED / needs investigation:');
unconfirmed.length ? unconfirmed.forEach((s) => console.log('  ? ' + s)) : console.log('  (none)');
console.log('\nNEXT (manual confirmation required):');
nextSteps.forEach((s) => console.log('  -> ' + s));
console.log('\nThis probe is read-only. It modified no config and uploaded nothing.\n');
