/*
 * signalAdapter.js — Signal Adapter (PRD §15.1 layer 1, data model §14.3).
 *
 * Translates raw Codex events into normalized TaskSignals and keeps a small
 * TaskContext (title, plan checklist, recent actions, artifacts, next step)
 * that powers the task-detail panel (PRD §9.6).
 *
 * Public surface (this is the seam a REAL Codex integration would call):
 *   SN.signals.emit(signalType, payload)
 *   SN.signals.liveSignalTypes()  -> string[]   (fed to the state engine)
 *   SN.signals.context            -> TaskContext
 *   SN.signals.onChange(fn)
 *
 * Recognised signalTypes mirror the §15.2 pseudocode:
 *   task_start, plan_ready, file_reading, file_editing, command_running,
 *   test_running, step_done, permission_required, permission_resolved, error,
 *   blocked, completed, idle
 */
(function (global) {
  'use strict';

  const SN = global.SN || (global.SN = {});

  // Mutually-exclusive "what am I doing right now" phases.
  const PHASES = ['thinking', 'file_reading', 'file_editing', 'test_running'];

  function nowIso() {
    return new Date().toISOString();
  }

  class SignalAdapter {
    constructor() {
      this._phase = null; // one of PHASES or null
      this._flags = {
        permission_required: false,
        blocked: false,
        error: false,
        completed: false,
      };
      this.context = this._emptyContext();
      this._listeners = new Set();
      this._lastSignal = null;
    }

    _emptyContext() {
      return {
        threadId: 'thread_local',
        taskId: null,
        title: '暂无进行中的任务',
        plan: [], // [{ text, status: 'done'|'active'|'todo' }]
        actions: [], // recent action strings, newest last
        artifacts: [], // [{ label, path }]
        requiresUserAction: false,
        nextStep: '',
        approvalCommand: null,
        blockReason: null,
      };
    }

    /** Build the TaskSignal[] (types) the state engine consumes. */
    liveSignalTypes() {
      const out = [];
      if (this._flags.permission_required) out.push('permission_required');
      if (this._flags.blocked) out.push('blocked');
      if (this._flags.error) out.push('error');
      if (this._phase === 'test_running') out.push('test_running');
      if (this._phase === 'file_editing') out.push('file_editing');
      if (this._phase === 'file_reading') out.push('file_reading');
      if (this._phase === 'thinking') out.push('thinking');
      if (this._flags.completed) out.push('completed');
      return out;
    }

    _pushAction(text) {
      if (!text) return;
      this.context.actions.push(text);
      if (this.context.actions.length > 8) this.context.actions.shift();
    }

    /**
     * Normalize + apply a raw event.
     * @param {string} signalType
     * @param {object} [payload]
     */
    emit(signalType, payload = {}) {
      const ctx = this.context;
      switch (signalType) {
        case 'task_start':
          this._resetFlags();
          this._phase = 'thinking';
          ctx.taskId = payload.taskId || 'task_' + Date.now();
          ctx.title = payload.title || '新任务';
          ctx.plan = (payload.plan || []).map((t, i) => ({ text: t, status: i === 0 ? 'active' : 'todo' }));
          ctx.actions = [];
          ctx.artifacts = [];
          ctx.requiresUserAction = false;
          ctx.nextStep = payload.nextStep || '理解需求并制定计划';
          ctx.blockReason = null;
          ctx.approvalCommand = null;
          this._pushAction(payload.action || '开始分析需求');
          break;

        case 'plan_ready':
          this._phase = 'thinking';
          if (payload.plan) ctx.plan = payload.plan.map((t, i) => ({ text: t, status: i === 0 ? 'active' : 'todo' }));
          ctx.nextStep = payload.nextStep || '按计划开始执行';
          this._pushAction(payload.action || '已制定任务计划');
          break;

        case 'file_reading':
          this._phase = 'file_reading';
          this._flags.completed = false;
          ctx.nextStep = payload.nextStep || ctx.nextStep;
          this._pushAction(payload.action || '正在读取项目文件');
          this._advancePlan(payload.planAdvance);
          break;

        case 'file_editing':
          this._phase = 'file_editing';
          this._flags.completed = false;
          ctx.nextStep = payload.nextStep || ctx.nextStep;
          this._pushAction(payload.action || '正在应用修改');
          this._advancePlan(payload.planAdvance);
          break;

        case 'test_running':
          this._phase = 'test_running';
          this._flags.completed = false;
          ctx.nextStep = payload.nextStep || '等待测试结果';
          this._pushAction(payload.action || '正在运行验证');
          this._advancePlan(payload.planAdvance);
          break;

        case 'command_running':
          // Generic shell/command execution (agent-neutral). First-version
          // mapping: tests -> validating phase, everything else -> building phase.
          this._phase = payload.isTest === true ? 'test_running' : 'file_editing';
          this._flags.completed = false;
          ctx.nextStep = payload.nextStep || ctx.nextStep;
          this._pushAction(payload.action || (payload.command ? ('正在运行命令：' + payload.command) : '正在运行命令'));
          this._advancePlan(payload.planAdvance);
          break;

        case 'step_done':
          this._advancePlan(true);
          this._pushAction(payload.action || '完成一个关键步骤');
          break;

        case 'permission_required':
          this._flags.permission_required = true;
          ctx.requiresUserAction = true;
          ctx.approvalCommand = payload.command || '一个需要批准的操作';
          ctx.nextStep = '等待你批准后继续';
          this._pushAction(payload.action || ('需要批准：' + ctx.approvalCommand));
          break;

        case 'permission_resolved':
          this._flags.permission_required = false;
          ctx.requiresUserAction = false;
          ctx.approvalCommand = null;
          this._pushAction(payload.approved === false ? '授权被拒绝' : '授权已通过，继续执行');
          if (payload.resumePhase && PHASES.includes(payload.resumePhase)) this._phase = payload.resumePhase;
          break;

        case 'error':
          this._flags.error = true;
          this._pushAction(payload.action || '执行出现错误');
          break;

        case 'blocked':
          this._flags.blocked = true;
          ctx.requiresUserAction = true;
          ctx.blockReason = payload.reason || '缺少关键信息或依赖';
          ctx.nextStep = payload.nextStep || '需要你提供信息或调整范围';
          this._pushAction(payload.action || ('任务受阻：' + ctx.blockReason));
          break;

        case 'completed':
          this._resetFlags();
          this._phase = null;
          this._flags.completed = true;
          ctx.requiresUserAction = false;
          ctx.plan = ctx.plan.map((p) => ({ ...p, status: 'done' }));
          if (payload.artifacts) ctx.artifacts = payload.artifacts;
          ctx.nextStep = payload.nextStep || '可以查看产物或开始下一个任务';
          this._pushAction(payload.action || '任务已完成');
          break;

        case 'idle':
          this._resetFlags();
          this._phase = null;
          break;

        default:
          // Unknown signal: record but do not crash.
          this._pushAction(payload.action || ('信号：' + signalType));
      }

      this._lastSignal = {
        signalType,
        source: payload.source || 'codex',
        summary: payload.summary || '',
        priority: payload.priority || 'normal',
        safeToShow: payload.safeToShow !== false,
        at: nowIso(),
      };

      this._emit(signalType, payload);
    }

    _advancePlan(shouldAdvance) {
      if (!shouldAdvance) return;
      const plan = this.context.plan;
      const activeIdx = plan.findIndex((p) => p.status === 'active');
      if (activeIdx >= 0) {
        plan[activeIdx].status = 'done';
        if (plan[activeIdx + 1]) plan[activeIdx + 1].status = 'active';
      }
    }

    _resetFlags() {
      this._flags.permission_required = false;
      this._flags.blocked = false;
      this._flags.error = false;
      this._flags.completed = false;
    }

    get lastSignal() {
      return this._lastSignal;
    }

    onChange(fn) {
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }

    _emit(signalType, payload) {
      for (const fn of this._listeners) {
        try {
          fn(signalType, payload, this);
        } catch (_) {
          /* keep adapter resilient */
        }
      }
    }
  }

  SN.signals = new SignalAdapter();
})(typeof window !== 'undefined' ? window : globalThis);
