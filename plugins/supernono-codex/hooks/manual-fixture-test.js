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
const { metaOf, mapPreToolUse, mapPostToolUse, mapPermissionRequest, send } = require('./lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [label, simulated OFFICIAL hook payload, mapper]. Payloads use the real Codex
// field shape: tool_name / tool_input / turn_id / session_id / tool_response.
const FIXTURES = [
  ['PreToolUse  command',      { tool_name: 'Bash', tool_input: { command: 'git status' }, turn_id: 't1', session_id: 's1' }, mapPreToolUse],
  ['PreToolUse  test command', { tool_name: 'Bash', tool_input: { command: 'npm test -- --coverage' }, turn_id: 't1' }, mapPreToolUse],
  ['PreToolUse  file read',    { tool_name: 'Read', tool_input: { path: 'src/renderer/js/app.js' }, turn_id: 't1' }, mapPreToolUse],
  ['PreToolUse  file edit',    { tool_name: 'apply_patch', tool_input: { file_path: 'electron/main.js' }, turn_id: 't1' }, mapPreToolUse],
  ['PermissionRequest',        { tool_name: 'Bash', tool_input: { command: 'npm install' }, turn_id: 't1' }, mapPermissionRequest],
  ['PostToolUse success',      { tool_name: 'Bash', tool_response: { exit_code: 0 }, turn_id: 't1' }, mapPostToolUse],
];

async function main() {
  console.log(`[codex-plugin-hooks fixture] sending ${FIXTURES.length} mapped events...\n`);
  let delivered = 0;
  for (const [label, payload, map] of FIXTURES) {
    let event = null;
    try { event = map(payload); } catch (_) { event = null; }
    const res = event ? await send(event, metaOf(payload)) : { ok: false, error: 'no-mapping' };
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
