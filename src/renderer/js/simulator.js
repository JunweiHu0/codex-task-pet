/*
 * simulator.js — drives the Signal Adapter for demos & the dev strip.
 *
 * In a real deployment the Signal Adapter would be fed by Codex events; here
 * the simulator plays the §10.2 "long task collaboration" lifecycle so the pet
 * is alive out of the box, and force() lets the dev strip jump to any state.
 */
(function (global) {
  'use strict';

  const SN = global.SN || (global.SN = {});

  let timers = [];
  function clearAll() { timers.forEach(clearTimeout); timers = []; }
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }

  const ARTIFACTS = [
    { label: 'SuperNoNo_PRD.md', path: 'C:/Users/66460/Desktop/SuperNoNo/SuperNoNo_PRD.md' },
  ];

  const DEMO_PLAN = ['梳理需求', '扫描项目结构', '编写实现', '运行验证', '同步到目标目录'];

  /** Play the full long-task lifecycle (PRD §10.2). */
  function runDemo() {
    clearAll();
    const S = SN.signals;

    S.emit('task_start', { title: '帮我把 PRD 做成桌宠原型', plan: DEMO_PLAN, action: '开始分析需求' });
    at(1600, () => S.emit('plan_ready', { action: '已制定 5 步计划' }));
    at(3200, () => S.emit('file_reading', { action: '正在扫描项目结构', planAdvance: true }));
    at(6000, () => S.emit('permission_required', { command: 'npm install electron', action: '需要批准安装依赖' }));
    at(9500, () => S.emit('permission_resolved', { approved: true, resumePhase: 'file_editing' }));
    at(9700, () => S.emit('file_editing', { action: '正在编写桌宠组件', planAdvance: true }));
    at(13000, () => S.emit('step_done', { action: '完成核心组件', planAdvance: false }));
    at(13200, () => S.emit('test_running', { action: '正在运行验证', planAdvance: true }));
    at(16500, () => S.emit('step_done', { rule: 'testPass', action: '测试通过' }));
    at(17000, () => S.emit('file_editing', { action: '同步到目标目录', planAdvance: true }));
    at(19500, () => S.emit('completed', { artifacts: ARTIFACTS, action: '已生成 SuperNoNo_PRD.md' }));
  }

  /** Jump directly to a state (dev strip). */
  function force(state) {
    clearAll();
    const S = SN.signals;
    switch (state) {
      case 'thinking':
        S.emit('task_start', { title: '示例任务：理解并规划', plan: DEMO_PLAN });
        break;
      case 'scanning':
        S.emit('file_reading', { action: '正在读取相关文件' });
        break;
      case 'building':
        S.emit('file_editing', { action: '正在应用修改' });
        break;
      case 'validating':
        S.emit('test_running', { action: '正在运行测试' });
        break;
      case 'waiting_approval':
        S.emit('permission_required', { command: 'copy to Desktop', action: '需要批准复制操作' });
        break;
      case 'blocked':
        S.emit('blocked', { reason: '缺少数据库连接信息', action: '任务受阻' });
        break;
      case 'completed':
        S.emit('completed', { artifacts: ARTIFACTS, action: '任务已完成' });
        break;
      case 'idle':
      default:
        S.emit('idle');
    }
  }

  SN.sim = { runDemo, force, clearAll };
})(typeof window !== 'undefined' ? window : globalThis);
