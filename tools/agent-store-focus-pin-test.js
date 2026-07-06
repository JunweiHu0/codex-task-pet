'use strict';

/*
 * Phase 2.4 logic test for the multiagent focus controls.
 *
 * Loads the real renderer modules in a Node vm context, then drives AgentStore
 * directly. This avoids Electron/UI dependencies while covering the rules that
 * make the panel controls meaningful.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function loadFreshStore() {
  const ctx = {
    console,
    setTimeout,
    clearTimeout,
    Date,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  for (const file of [
    'src/renderer/js/config.js',
    'src/renderer/js/signalAdapter.js',
    'src/renderer/js/stateEngine.js',
    'src/renderer/js/agentStore.js',
  ]) {
    const abs = path.join(root, file);
    vm.runInContext(fs.readFileSync(abs, 'utf8'), ctx, { filename: file });
  }
  return ctx.SN.agents;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log('PASS ' + msg);
}

function send(store, agent, sessionId, type, payload) {
  store.handleSignal(type, {
    agent,
    adapter: agent === 'codex' ? 'codex-plugin-hooks' : 'claude-code-hooks',
    sessionId,
    action: agent + ' ' + type,
    ...(payload || {}),
  });
}

function agent(store, key) {
  const hit = store.getAgents().find((a) => a.key === key);
  if (!hit) throw new Error('missing agent ' + key);
  return hit;
}

function main() {
  const store = loadFreshStore();
  const codex = 'codex:codex-s1';
  const claude = 'claude-code:claude-s1';

  send(store, 'codex', 'codex-s1', 'command_running', { command: 'npm run build', isTest: true });
  assert(store.getFocusedAgent() === codex, 'codex focuses after first working event');

  send(store, 'claude-code', 'claude-s1', 'command_running', { command: 'git status --short', isTest: false });
  assert(store.getFocusedAgent() === claude, 'same-rank newer event wins in auto mode');

  assert(store.setManualFocus(codex) === true, 'manual focus can be set');
  assert(store.getFocusedAgent() === codex, 'manual focus switches immediately');
  assert(agent(store, codex).manualFocused === true, 'manual focus is exposed in getAgents');

  send(store, 'claude-code', 'claude-s1', 'command_running', { command: 'echo same-rank', isTest: false });
  assert(store.getFocusedAgent() === codex, 'same-rank recency does not steal manual focus');

  send(store, 'claude-code', 'claude-s1', 'permission_required', { command: 'dangerous op' });
  assert(store.getFocusedAgent() === claude, 'strictly higher rank breaks manual focus');
  assert(agent(store, codex).manualFocused === false, 'manual focus is cleared after escalation');

  send(store, 'claude-code', 'claude-s1', 'turn_ended');
  assert(store.pinAgent(codex) === true, 'pin can be set');
  assert(store.getPinnedAgent() === codex, 'pinned agent is reported');
  assert(store.getFocusedAgent() === codex, 'pin focuses immediately');

  send(store, 'claude-code', 'claude-s1', 'command_running', { command: 'echo worker', isTest: false });
  assert(store.getFocusedAgent() === codex, 'working event cannot steal pinned focus');

  send(store, 'claude-code', 'claude-s1', 'blocked', { reason: 'needs input' });
  assert(store.getFocusedAgent() === claude, 'blocked agent temporarily breaks through pin');
  assert(store.getPinnedAgent() === codex, 'pin remains remembered during breakthrough');

  send(store, 'claude-code', 'claude-s1', 'turn_ended');
  assert(store.getFocusedAgent() === codex, 'focus returns to pinned agent after breakthrough settles');

  store.unpinAgent();
  assert(store.getPinnedAgent() === null, 'unpin clears pinned agent');

  const codexEntry = store.agents.get(codex);
  codexEntry.lastEventAt = Date.now() - (2 * 60 * 1000 + 1000);
  assert(agent(store, codex).stale === true, 'working agent older than 2 minutes is stale');

  send(store, 'claude-code', 'claude-s1', 'permission_required', { command: 'approve me' });
  const claudeEntry = store.agents.get(claude);
  claudeEntry.lastEventAt = Date.now() - (2 * 60 * 1000 + 1000);
  assert(agent(store, claude).stale === false, 'waiting approval is not stale');

  console.log('\nALL PASS');
}

main();
