'use strict';
/*
 * lib.js — shared helpers for the SuperNoNo Codex hooks PROTOTYPE.
 *
 * PROTOTYPE STATUS: the real Codex hook payload shape is UNVERIFIED on this
 * machine's Codex version. No installed plugin declares `hooks`, and no
 * `hooks.json` schema is documented here — so everything below parses
 * DEFENSIVELY and degrades to a no-op rather than guessing wrongly.
 * See ../README.md ("confirmed / unconfirmed").
 *
 * Guarantees:
 *   - never throws into the caller's process on bad input;
 *   - only sends SuperNoNo protocol STATE events to the local bridge;
 *   - never executes a command;
 *   - never records prompt / source / full tool input / token / secret.
 */
const fs = require('fs');
const { sendSignal } = require('../../../adapters/shared/send-signal');

const AGENT = 'codex';
const ADAPTER = 'codex-plugin-hooks';

/* ---- defensive input ---------------------------------------------------- */

// Read the hook payload without assuming a transport: prefer a JSON argv arg,
// else piped stdin JSON. Returns {} on anything unexpected. Never throws.
function readHookInput() {
  try {
    for (let i = process.argv.length - 1; i >= 2; i--) {
      const a = process.argv[i];
      if (typeof a === 'string' && a.trim().startsWith('{')) {
        try { return JSON.parse(a); } catch (_) { /* keep looking */ }
      }
    }
  } catch (_) { /* ignore */ }
  try {
    if (process.stdin && process.stdin.isTTY) return {}; // nothing piped in
    const data = fs.readFileSync(0, 'utf8');             // fd 0 = stdin
    if (data && data.trim().startsWith('{')) return JSON.parse(data);
  } catch (_) { /* no stdin / bad json */ }
  return {};
}

/* ---- redaction / summaries ---------------------------------------------- */

function firstString() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

// Short, secret-masked one-line command summary — NEVER the full input/prompt.
function safeCommandSummary(cmd) {
  let s = typeof cmd === 'string' ? cmd : '';
  if (Array.isArray(cmd)) s = cmd.filter((x) => typeof x === 'string').join(' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s
    .replace(/(bearer\s+)[A-Za-z0-9._\-]+/gi, '$1[redacted]')
    .replace(/\b(?:sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9]{6,}\b/g, '[redacted-token]')
    .replace(/(--?(?:password|token|secret|api[-_]?key|authorization)[=\s])\S+/gi, '$1[redacted]');
  return s.length > 80 ? s.slice(0, 77) + '...' : s;
}

// Only the file's basename — never the full path (avoids leaking tree layout).
function baseName(p) {
  const s = typeof p === 'string' ? p : '';
  const parts = s.split(/[\\/]/).filter(Boolean);
  const b = parts.length ? parts[parts.length - 1] : '';
  return b.length > 60 ? b.slice(0, 57) + '...' : b;
}

/* ---- classification (all field names are UNVERIFIED guesses) ------------ */

const TEST_RX = /\b(test|tests|jest|vitest|pytest|mocha|lint|eslint|tsc|typecheck|build|make|ctest|cargo\s+test|go\s+test)\b/i;

function toolNameOf(p) {
  return firstString(p.tool, p.toolName, p.tool_name, p.name, p.type).toLowerCase();
}
function commandOf(p) {
  const inp = (p && typeof p.input === 'object') ? p.input : {};
  return firstString(
    p.command, p.cmd, p.commandLine, inp.command, inp.cmd,
    Array.isArray(p.args) ? p.args.join(' ') : '',
    Array.isArray(inp.args) ? inp.args.join(' ') : ''
  );
}
function pathOf(p) {
  const inp = (p && typeof p.input === 'object') ? p.input : {};
  return firstString(p.path, p.file, p.filePath, p.filename, inp.path, inp.file, inp.filePath);
}

// PreToolUse -> a phase event, or null if we genuinely can't classify.
function mapPreToolUse(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const tool = toolNameOf(p);
  const cmd = commandOf(p);
  const file = pathOf(p);

  const looksShell = /shell|bash|exec|command|run|process|powershell|pwsh|cmd|terminal/.test(tool) || (!!cmd && !file);
  const looksEdit = /apply[_-]?patch|patch|edit|write|create|update|insert|replace/.test(tool);
  const looksRead = /read|search|grep|glob|cat|list|find|view|open|fetch/.test(tool);

  if (looksShell) {
    const summary = safeCommandSummary(cmd) || tool;
    const isTest = TEST_RX.test(cmd) || TEST_RX.test(tool);
    return { type: 'command_running', payload: { command: summary, isTest, action: (isTest ? '正在运行测试/构建：' : '正在运行命令：') + summary } };
  }
  if (looksEdit) return { type: 'file_editing', payload: { file: baseName(file), action: '正在编辑文件' + (file ? '：' + baseName(file) : '') } };
  if (looksRead) return { type: 'file_reading', payload: { file: baseName(file), action: '正在读取/搜索' + (file ? '：' + baseName(file) : '') } };

  // Unknown tool: show generic activity, don't fabricate a specific phase.
  if (tool) return { type: 'command_running', payload: { command: tool, isTest: false, action: '正在使用工具：' + tool } };
  return null;
}

// PostToolUse -> step_done on success, error on a clear failure.
function mapPostToolUse(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const failed = p.success === false || p.ok === false || p.error != null ||
    (typeof p.exitCode === 'number' && p.exitCode !== 0) || /fail|error/i.test(firstString(p.status));
  if (failed) return { type: 'error', payload: { action: 'Codex 工具执行失败' } };

  const isTest = p.isTest === true || TEST_RX.test(commandOf(p)) || TEST_RX.test(toolNameOf(p));
  const ev = { type: 'step_done', payload: { action: isTest ? '测试通过' : '完成一步工具调用' } };
  if (isTest) ev.payload.rule = 'testPass';
  return ev;
}

// PermissionRequest -> permission_required (short, non-sensitive summary only).
function mapPermissionRequest(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const cmd = safeCommandSummary(commandOf(p)) || toolNameOf(p) || '一个需要批准的操作';
  return { type: 'permission_required', payload: { command: cmd, action: 'Codex 请求授权' } };
}

/* ---- send --------------------------------------------------------------- */

async function send(event) {
  if (!event || !event.type) return { ok: false, error: 'no event' };
  try {
    return await sendSignal({ type: event.type, agent: AGENT, adapter: ADAPTER, payload: event.payload || {} });
  } catch (_) {
    return { ok: false, error: 'send failed' };
  }
}

module.exports = {
  readHookInput, mapPreToolUse, mapPostToolUse, mapPermissionRequest, send,
  safeCommandSummary, baseName,
};
