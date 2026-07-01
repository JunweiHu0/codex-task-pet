'use strict';
/*
 * manual-fixture-test.js — exercises the hook mappings WITHOUT real Codex hooks.
 *
 * It feeds simulated hook payloads through the SAME lib.js mappers the real
 * hooks use, and sends each resulting event to the SuperNoNo bridge. This proves
 * the mapping + transport work end-to-end, independent of whether Codex's real
 * hooks API is available.
 *
 * Usage:
 *   1. Start SuperNoNo:  npm start
 *   2. node plugins/supernono-codex/hooks/manual-fixture-test.js
 *   3. Watch the pet: 施工 → 验证 → 扫描 → 施工 → 等待授权 → (step logged)
 *
 * If SuperNoNo isn't running, every event reports MISS and the script exits 0.
 */
const { mapPreToolUse, mapPostToolUse, mapPermissionRequest, send } = require('./lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [label, simulated hook payload -> mapped event]
const FIXTURES = [
  ['PreToolUse  command',      () => mapPreToolUse({ tool: 'shell', command: 'git status' })],
  ['PreToolUse  test command', () => mapPreToolUse({ tool: 'shell', command: 'npm test -- --coverage' })],
  ['PreToolUse  file read',    () => mapPreToolUse({ tool: 'read_file', path: 'src/renderer/js/app.js' })],
  ['PreToolUse  file edit',    () => mapPreToolUse({ tool: 'apply_patch', input: { path: 'electron/main.js' } })],
  ['PermissionRequest',        () => mapPermissionRequest({ command: 'npm install' })],
  ['PostToolUse success',      () => mapPostToolUse({ success: true })],
];

async function main() {
  console.log(`[codex-plugin-hooks fixture] sending ${FIXTURES.length} mapped events...\n`);
  let delivered = 0;
  for (const [label, make] of FIXTURES) {
    let event = null;
    try { event = make(); } catch (_) { event = null; }
    const res = event ? await send(event) : { ok: false, error: 'no-mapping' };
    const detail = event ? event.type + (event.payload && event.payload.isTest ? ' (isTest)' : '') : '(no mapping)';
    console.log(`  ${res.ok ? 'OK  ' : 'MISS'}  ${label.padEnd(20)} -> ${detail}${res.ok ? '' : '   (' + (res.error || res.status) + ')'}`);
    if (res.ok) delivered++;
    await sleep(900);
  }
  console.log('');
  if (delivered === 0) console.log('No events reached SuperNoNo. Start it with `npm start`, then re-run.');
  else console.log(`Done. ${delivered}/${FIXTURES.length} events delivered.`);
}

main();
