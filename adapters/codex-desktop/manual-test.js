'use strict';
/*
 * manual-test.js — proves the (future) Codex Desktop adapter can reuse the
 * shared sender + unified protocol to drive SuperNoNo, WITHOUT any real Codex
 * hook. This is a human-run smoke test, not a lifecycle integration.
 *
 * Usage:
 *   1. Start SuperNoNo:  npm start
 *   2. In another shell: node adapters/codex-desktop/manual-test.js
 *   3. Watch the pet cycle: 思考 -> 扫描 -> 施工 -> 验证 -> 完成
 *
 * If SuperNoNo isn't running, every event just reports MISS and nothing crashes.
 */
const { sendSignal } = require('../shared/send-signal');

// Provenance attached to every event so the pet/logs can tell where it came from.
const BASE = {
  agent: 'codex',
  adapter: 'codex-desktop-manual-test',
  sessionId: 'manual-session',
  taskId: 'manual-task',
};

const STEPS = [
  { type: 'task_start',      payload: { title: 'Codex Desktop 手动验证', plan: ['读取文件', '运行命令', '运行测试', '完成'] } },
  { type: 'file_reading',    payload: { action: 'Reading package.json', file: 'package.json' } },
  { type: 'command_running', payload: { command: 'npm run build', action: '正在运行 npm run build' } },
  { type: 'command_running', payload: { command: 'npm test', isTest: true, action: '正在运行 npm test' } },
  { type: 'completed',       payload: { action: 'Codex Desktop 手动验证完成' } },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[codex-desktop manual-test] sending ${STEPS.length} events to the SuperNoNo bridge...\n`);
  let delivered = 0;
  for (const step of STEPS) {
    const res = await sendSignal({ ...BASE, type: step.type, payload: step.payload });
    if (res.ok) { delivered++; console.log(`  OK    ${step.type}`); }
    else console.log(`  MISS  ${step.type}   (${res.error || res.status})`);
    await sleep(1200); // let the pet visibly settle into each state
  }

  console.log('');
  if (delivered === 0) {
    console.log('No events reached SuperNoNo. Start it with `npm start`, then re-run this script.');
  } else {
    console.log(`Done. ${delivered}/${STEPS.length} events delivered. The pet should have walked 思考 → 扫描 → 施工 → 验证 → 完成.`);
  }
}

main();
