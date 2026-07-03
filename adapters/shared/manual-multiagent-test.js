'use strict';
/*
 * manual-multiagent-test.js — Phase 1 acceptance smoke test.
 *
 * Sends interleaved events for TWO simulated agents (codex + claude-code, each
 * with its own sessionId) to the SuperNoNo bridge, to verify:
 *   1. the two agents' states never pollute each other;
 *   2. attention policy: permission_required takes focus immediately, and a
 *      plain command_running / turn_ended / completed from the OTHER agent
 *      does not steal or clear it;
 *   3. after the waiting agent resolves, focus returns to the most relevant
 *      (highest-rank, most recently active) agent.
 *
 * NOTE: the claude-code events here are SIMULATED protocol events. This is not
 * a Claude Code adapter (that's Phase 2) — it only proves the pet side.
 *
 * Usage:
 *   1. Start SuperNoNo:  npm start
 *   2. In another shell: node adapters/shared/manual-multiagent-test.js
 *   3. Watch the pet + open the tray task panel (agent cards + timeline).
 *      In DevTools (npm start -- --dev): SuperNoNo.getAgents() /
 *      SuperNoNo.getTimeline() / SuperNoNo.getFocusedAgent()
 *
 * If SuperNoNo isn't running, every event reports MISS and nothing crashes.
 */
const { sendSignal } = require('./send-signal');

const CODEX = { agent: 'codex', adapter: 'manual-multiagent-test', sessionId: 'codex-s1', taskId: 'codex-t1' };
const CLAUDE = { agent: 'claude-code', adapter: 'manual-multiagent-test', sessionId: 'cc-s1', taskId: 'cc-t1' };

const STEPS = [
  {
    base: CODEX, type: 'task_start',
    payload: { title: 'Codex：修复登录问题', plan: ['读取代码', '修改实现', '运行测试'], action: '开始分析需求' },
    expect: '宠物 → 思考（focus: codex）',
  },
  {
    base: CODEX, type: 'command_running',
    payload: { command: 'npm run build', action: '正在运行 npm run build' },
    expect: '宠物 → 施工（focus: codex）',
  },
  {
    base: CLAUDE, type: 'file_reading',
    payload: { file: 'auth.ts', action: '正在读取 auth.ts' },
    expect: '宠物仍显示 codex 的施工（scanning 优先级低于 building）；面板出现第二张 agent 卡',
  },
  {
    base: CLAUDE, type: 'permission_required',
    payload: { command: 'npm install left-pad', action: '需要批准安装依赖' },
    expect: '★ 宠物立刻切到 等待授权，气泡带 [claude-code] 前缀（focus 切到 claude-code）',
  },
  {
    base: CODEX, type: 'command_running',
    payload: { command: 'npm test', isTest: true, action: '正在运行 npm test' },
    expect: '★ 宠物保持 等待授权 不动（普通 command_running 不能覆盖 permission_required）',
  },
  {
    base: { agent: 'codex', adapter: 'manual-multiagent-test' }, type: 'turn_ended',
    payload: { action: 'Codex 完成一个回合' },
    expect: '★ 宠物保持 等待授权（codex 的 turn_ended 只落到 codex 自己的会话，不清 claude 的等待）',
  },
  {
    base: CODEX, type: 'completed',
    payload: { action: 'Codex 任务完成' },
    expect: '★ 宠物保持 等待授权（completed 是低优先级）；codex 卡片显示 完成',
  },
  {
    base: CLAUDE, type: 'permission_resolved',
    payload: { approved: true, resumePhase: 'file_editing' },
    expect: '宠物 → 施工，[claude-code]（授权解除后回到活跃 agent）',
  },
  {
    base: CLAUDE, type: 'completed',
    payload: { action: 'Claude Code 任务完成' },
    expect: '宠物 → 完成，随后自然回落待机；面板"已完成"计数为 2',
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[manual-multiagent-test] sending ${STEPS.length} interleaved events (codex + claude-code)...\n`);
  let delivered = 0;
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    const res = await sendSignal({ ...s.base, type: s.type, payload: s.payload });
    const tag = (s.base.agent || 'local') + '/' + (s.base.sessionId || '-');
    if (res.ok) { delivered++; console.log(`  OK    ${String(i + 1).padStart(2)} ${s.type}  (${tag})`); }
    else console.log(`  MISS  ${String(i + 1).padStart(2)} ${s.type}  (${tag})  (${res.error || res.status})`);
    console.log(`        期望: ${s.expect}\n`);
    await sleep(2500); // let each transition be visible
  }

  console.log('');
  if (delivered === 0) {
    console.log('No events reached SuperNoNo. Start it with `npm start`, then re-run this script.');
  } else {
    console.log(`Done. ${delivered}/${STEPS.length} events delivered.`);
    console.log('验证要点：带 ★ 的三步宠物必须保持「等待授权」；托盘任务面板应有两张 agent 卡和事件流。');
  }
}

main();
