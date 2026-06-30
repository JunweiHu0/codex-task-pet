/*
 * config.js — Static product configuration for SuperNoNo.
 *
 * This file is the single source of truth for:
 *   - the pet's states (PRD §7.3 / §9.2)
 *   - the three tone systems (PRD §12 / §22)
 *   - the ability modules (PRD §9.5)
 *   - energy bands & rules (PRD §9.4)
 *   - state priority resolution (PRD §9.2)
 *
 * No DOM access here — pure data so it can be reused by the state engine,
 * the presentation layer and (later) a real Codex signal adapter.
 */
(function (global) {
  'use strict';

  const SN = global.SN || (global.SN = {});

  /* ----------------------------------------------------------------------- *
   * States — PRD §7.3 emotion/action table.
   * `category` maps to a status color; `shape` gives a non-color cue so the
   * state is still readable with animations off / for color-blind users.
   * ----------------------------------------------------------------------- */
  const STATES = {
    idle: {
      id: 'idle',
      label: '待机',
      labelEn: 'Idle',
      category: 'neutral', // dim core
      shape: 'dot',
      aria: 'Codex 空闲，待机中',
    },
    thinking: {
      id: 'thinking',
      label: '思考',
      labelEn: 'Thinking',
      category: 'analysis', // blue
      shape: 'pulse',
      aria: '正在分析与规划任务',
    },
    scanning: {
      id: 'scanning',
      label: '扫描',
      labelEn: 'Scanning',
      category: 'analysis', // blue
      shape: 'beam',
      aria: '正在搜索文件、读取上下文',
    },
    building: {
      id: 'building',
      label: '施工',
      labelEn: 'Building',
      category: 'work', // purple-ish active
      shape: 'spark',
      aria: '正在修改文件',
    },
    validating: {
      id: 'validating',
      label: '验证',
      labelEn: 'Validating',
      category: 'verify', // green/yellow
      shape: 'ring',
      aria: '正在运行测试或验证质量',
    },
    waiting_approval: {
      id: 'waiting_approval',
      label: '等待授权',
      labelEn: 'Waiting for approval',
      category: 'attention', // yellow
      shape: 'bang',
      aria: '需要你批准命令或权限',
    },
    blocked: {
      id: 'blocked',
      label: '阻塞',
      labelEn: 'Blocked',
      category: 'error', // red
      shape: 'cross',
      aria: '任务受阻，需要你的决策',
    },
    completed: {
      id: 'completed',
      label: '完成',
      labelEn: 'Completed',
      category: 'success', // green
      shape: 'check',
      aria: '任务完成，可以查看结果',
    },
    resting: {
      id: 'resting',
      label: '休息',
      labelEn: 'Resting',
      category: 'neutral',
      shape: 'sleep',
      aria: '长时间无交互，低功耗休息',
    },
  };

  /* State category -> CSS custom property carrying the status color.
   * (PRD §7.2 color language.) */
  const CATEGORY_COLOR = {
    neutral: 'var(--sn-c-neutral)',
    analysis: 'var(--sn-c-blue)',
    work: 'var(--sn-c-purple)',
    verify: 'var(--sn-c-green)',
    success: 'var(--sn-c-green)',
    attention: 'var(--sn-c-yellow)',
    error: 'var(--sn-c-red)',
  };

  /* ----------------------------------------------------------------------- *
   * State priority — PRD §9.2. Higher = wins when several signals are live.
   * ----------------------------------------------------------------------- */
  const PRIORITY = {
    waiting_approval: 70,
    blocked: 60,
    building: 50, // "正在执行工具 / 正在编辑"
    scanning: 40,
    validating: 35,
    thinking: 30,
    completed: 20,
    resting: 5,
    idle: 0,
  };

  /* ----------------------------------------------------------------------- *
   * Tone copy — PRD §22 appendix + §12. One short line per state per tone.
   * Kept ≤ 36 Chinese chars (PRD §9.3 bubble rule).
   * ----------------------------------------------------------------------- */
  const TONES = ['professional', 'casual', 'lively'];

  const TONE_LABELS = {
    professional: '专业',
    casual: '轻松',
    lively: '活泼',
  };

  const COPY = {
    thinking: {
      professional: '正在分析需求。',
      casual: '我先把需求拆开看。',
      lively: '能量启动，我来拆任务。',
    },
    scanning: {
      professional: '正在读取相关文件。',
      casual: '我在找关键线索。',
      lively: '雷达开了，扫描中。',
    },
    building: {
      professional: '正在应用修改。',
      casual: '我开始动手改了。',
      lively: '小工具臂上线。',
    },
    validating: {
      professional: '正在验证结果。',
      casual: '我跑一下检查。',
      lively: '亮绿灯时间到。',
    },
    waiting_approval: {
      professional: '需要用户授权。',
      casual: '这里需要你点一下。',
      lively: '给我一枚通行章。',
    },
    blocked: {
      professional: '验证失败，正在定位。',
      casual: '有一处没过，我继续查。',
      lively: '有个灯没亮，我去修。',
    },
    completed: {
      professional: '任务已完成。',
      casual: '搞定，结果已放好。',
      lively: '充能完成，交付成功。',
    },
    idle: {
      professional: '待机中，随时待命。',
      casual: '我先歇会儿，有事叫我。',
      lively: '原地漂浮，等你召唤。',
    },
    resting: {
      professional: '低功耗休息中。',
      casual: '没事我就打个盹。',
      lively: '省电模式，眯一会儿。',
    },
  };

  /* Greeting copy — PRD §9.7 开场问候 */
  const GREETING = {
    professional: '你好，我是 {name}，负责呈现 Codex 的工作进展。',
    casual: '嗨，我是 {name}，帮你把进度看得更清楚。',
    lively: '我是 {name}！能量满格，准备开工～',
  };

  /* ----------------------------------------------------------------------- *
   * Ability modules — PRD §9.5 table.
   * ----------------------------------------------------------------------- */
  const MODULES = {
    'file-scan': {
      moduleId: 'file-scan',
      name: '文件扫描模块',
      capabilitySource: '搜索文件、读取代码',
      pet: '雷达天线展开',
      userFacingDescription: '正在搜索项目并读取上下文，帮你定位相关文件。',
      icon: 'radar',
      states: ['scanning'],
      available: true,
    },
    'code-fix': {
      moduleId: 'code-fix',
      name: '代码修复模块',
      capabilitySource: '修改文件、应用补丁',
      pet: '小机械臂工作',
      userFacingDescription: '正在编辑文件、应用补丁，谨慎改动你的代码。',
      icon: 'arm',
      states: ['building'],
      available: true,
    },
    'test-verification': {
      moduleId: 'test-verification',
      name: '测试验证模块',
      capabilitySource: '运行测试、构建、lint',
      pet: '能量环扫描',
      userFacingDescription: '正在运行测试 / 构建 / lint，检查改动质量。',
      icon: 'ring',
      states: ['validating'],
      available: true,
    },
    'browser-check': {
      moduleId: 'browser-check',
      name: '浏览器验收模块',
      capabilitySource: '打开本地页面、截图检查',
      pet: '眼部变成取景器',
      userFacingDescription: '打开本地页面并检查界面效果。',
      icon: 'viewfinder',
      states: [],
      available: true,
    },
    'doc-gen': {
      moduleId: 'doc-gen',
      name: '文档生成模块',
      capabilitySource: '生成 PRD、README、报告',
      pet: '投影文档页',
      userFacingDescription: '正在产出文档：PRD、README 或报告。',
      icon: 'doc',
      states: [],
      available: true,
    },
    'thread-management': {
      moduleId: 'thread-management',
      name: '线程管理模块',
      capabilitySource: '创建 / 读取 / 归档线程',
      pet: '小型星图',
      userFacingDescription: '管理多个 Codex 线程，标出需要你处理的任务。',
      icon: 'starmap',
      states: [],
      available: true,
    },
    automation: {
      moduleId: 'automation',
      name: '自动化模块',
      capabilitySource: '定时提醒、监控、回访',
      pet: '小闹钟部件',
      userFacingDescription: '定时提醒与监控，支持持续工作。',
      icon: 'clock',
      states: [],
      available: true,
    },
  };

  /* Default module shown for a given state (the "active" module). */
  const STATE_MODULE = {
    scanning: 'file-scan',
    building: 'code-fix',
    validating: 'test-verification',
  };

  /* ----------------------------------------------------------------------- *
   * Energy — PRD §9.4.
   * ----------------------------------------------------------------------- */
  const ENERGY = {
    bands: [
      { max: 20, key: 'low', label: '待机 / 阻塞', color: 'var(--sn-c-neutral)' },
      { max: 60, key: 'mid', label: '任务处理中', color: 'var(--sn-c-blue)' },
      { max: 90, key: 'high', label: '验证 / 接近完成', color: 'var(--sn-c-purple)' },
      { max: 100, key: 'full', label: '完成且通过检查', color: 'var(--sn-c-green)' },
    ],
    idleValue: 20,
    rules: {
      taskStart: { set: 35 },     // 新任务：20 -> 35
      planMade: { delta: +10 },   // 完成计划制定
      keyStep: { delta: +8 },     // 完成关键步骤
      testPass: { delta: +15 },   // 测试通过
      error: { delta: -10 },      // 发生错误
      completed: { set: 100 },    // 任务完成
    },
  };

  function energyBand(value) {
    return ENERGY.bands.find((b) => value <= b.max) || ENERGY.bands[ENERGY.bands.length - 1];
  }

  /* ----------------------------------------------------------------------- *
   * Notification levels — PRD §9.3 / §13.1.
   *   quiet    : only approval / blocked / completed
   *   standard : + decisions & risks
   *   active   : + progress chatter
   * Returns true if a signal of given priority class may show a bubble.
   * ----------------------------------------------------------------------- */
  const CRITICAL_STATES = ['waiting_approval', 'blocked', 'completed'];

  function canBubble(level, state) {
    if (CRITICAL_STATES.includes(state)) return true; // always
    if (level === 'quiet') return false;
    if (level === 'standard') return ['thinking', 'validating', 'completed'].includes(state) || true;
    return true; // active
  }

  SN.config = {
    STATES,
    CATEGORY_COLOR,
    PRIORITY,
    TONES,
    TONE_LABELS,
    COPY,
    GREETING,
    MODULES,
    STATE_MODULE,
    ENERGY,
    energyBand,
    CRITICAL_STATES,
    canBubble,
  };
})(typeof window !== 'undefined' ? window : globalThis);
