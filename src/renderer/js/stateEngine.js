/*
 * stateEngine.js — Pet State Engine (PRD §15.1 layer 2, §15.2 pseudocode).
 *
 * Pure logic: given the live TaskSignal types + the previous PetState, it
 * resolves the next PetState (state, energy, module, requiresUserAction).
 *
 * - State selection follows the priority order in PRD §9.2 / config.PRIORITY.
 * - Energy follows the discrete rules in PRD §9.4 (config.ENERGY.rules) plus
 *   small per-phase nudges with the ceilings hinted at in §15.2.
 * - tick() handles decay-to-idle, completed-falloff and the ">5min waiting"
 *   low-frequency blink.
 *
 * Data model: PetState — PRD §14.2.
 */
(function (global) {
  'use strict';

  const SN = global.SN || (global.SN = {});
  const cfg = SN.config;

  // Map a live signal type -> visual state (highest priority first).
  const SIGNAL_STATE = [
    ['permission_required', 'waiting_approval'],
    ['blocked', 'blocked'],
    ['error', 'blocked'],
    ['file_editing', 'building'],
    ['test_running', 'validating'],
    ['file_reading', 'scanning'],
    ['thinking', 'thinking'],
    ['completed', 'completed'],
  ];

  // Discrete energy rules (PRD §9.4) keyed by signal type.
  const SIGNAL_ENERGY_RULE = {
    task_start: 'taskStart', // set 35
    plan_ready: 'planMade', // +10
    step_done: 'keyStep', // +8
    error: 'error', // -10
    blocked: 'error', // -10
    completed: 'completed', // set 100
  };

  // Per-phase gentle nudges + ceilings (PRD §15.2 caps).
  const PHASE_ENERGY = {
    thinking: { delta: 3, cap: 50 },
    file_reading: { delta: 4, cap: 60 },
    file_editing: { delta: 6, cap: 75 },
    test_running: { delta: 8, cap: 90 },
  };

  const REST_AFTER_MS = 60 * 1000; // idle -> resting
  const WAIT_BLINK_MS = 5 * 60 * 1000; // PRD §9.4: waiting > 5 min -> low-freq blink

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function applyRule(energy, ruleName, payloadDelta) {
    const rule = cfg.ENERGY.rules[ruleName];
    if (!rule) return energy;
    if (typeof rule.set === 'number') return rule.set;
    if (typeof rule.delta === 'number') return clamp(energy + rule.delta, 0, 100);
    return energy;
  }

  function initial() {
    const now = Date.now();
    return {
      threadId: 'thread_local',
      taskId: null,
      state: 'idle',
      energy: cfg.ENERGY.idleValue,
      module: null,
      requiresUserAction: false,
      lowPowerBlink: false,
      enteredAt: now,
      lastActivityAt: now,
      waitingSince: null,
      updatedAt: new Date(now).toISOString(),
    };
  }

  /** Resolve the visual state from live signals (energy carried in `prev`). */
  function pickState(liveTypes) {
    for (const [sig, state] of SIGNAL_STATE) {
      if (liveTypes.includes(sig)) return state;
    }
    return null; // nothing live
  }

  function withMeta(prev, state, energy, extra) {
    const now = Date.now();
    const changedState = prev.state !== state;
    return {
      ...prev,
      state,
      energy: clamp(Math.round(energy), 0, 100),
      module: cfg.STATE_MODULE[state] || null,
      requiresUserAction: state === 'waiting_approval' || state === 'blocked',
      enteredAt: changedState ? now : prev.enteredAt,
      lastActivityAt: now,
      waitingSince: state === 'waiting_approval' ? (prev.waitingSince || now) : null,
      lowPowerBlink: false,
      updatedAt: new Date(now).toISOString(),
      ...extra,
    };
  }

  /**
   * Apply one signal: update energy via its rule (or phase nudge), then pick
   * the resulting state from the full live-signal set.
   * @param {string} signalType
   * @param {object} payload   may carry { rule } to override the energy rule
   * @param {string[]} liveTypes  current live signals (from the adapter)
   * @param {object} previous  previous PetState
   */
  function onSignal(signalType, payload, liveTypes, previous) {
    let energy = previous.energy;

    const ruleName = (payload && payload.rule) || SIGNAL_ENERGY_RULE[signalType];
    if (ruleName) {
      energy = applyRule(energy, ruleName);
    } else if (PHASE_ENERGY[signalType]) {
      const { delta, cap } = PHASE_ENERGY[signalType];
      energy = Math.min(cap, energy + delta);
    }

    const state = pickState(liveTypes) || (signalType === 'idle' ? 'idle' : previous.state);
    return withMeta(previous, state, energy, {});
  }

  /** Resolve from scratch (used on full re-sync). Mirrors §15.2 resolvePetState. */
  function resolve(liveTypes, previous) {
    const state = pickState(liveTypes);
    if (!state) return tick(previous); // nothing live -> decay
    return withMeta(previous, state, previous.energy, {});
  }

  /**
   * Time-driven update (call ~1/sec). Handles:
   *   - completed -> slow falloff to idle (PRD §9.4)
   *   - idle decay + resting after inactivity (PRD §7.3 休息)
   *   - waiting > 5 min -> lowPowerBlink (PRD §9.4)
   */
  function tick(previous) {
    const now = Date.now();
    const idle = cfg.ENERGY.idleValue;

    if (previous.state === 'waiting_approval') {
      const since = previous.waitingSince || now;
      return {
        ...previous,
        energy: 45,
        lowPowerBlink: now - since > WAIT_BLINK_MS,
        updatedAt: new Date(now).toISOString(),
      };
    }

    if (previous.state === 'blocked') {
      return { ...previous, updatedAt: new Date(now).toISOString() };
    }

    if (previous.state === 'completed') {
      // Celebrate briefly, then fall back toward idle.
      const sinceEntered = now - previous.enteredAt;
      if (sinceEntered < 4000) return previous;
      const energy = Math.max(idle, previous.energy - 3);
      if (energy <= idle) {
        return { ...previous, state: 'idle', energy: idle, module: null, enteredAt: now, lastActivityAt: now, updatedAt: new Date(now).toISOString() };
      }
      return { ...previous, energy, updatedAt: new Date(now).toISOString() };
    }

    // Active working states keep their state until the next signal arrives.
    const working = ['thinking', 'scanning', 'building', 'validating'];
    if (working.includes(previous.state)) {
      return previous;
    }

    // idle / resting decay
    const energy = Math.max(idle, previous.energy - 2);
    const inactiveFor = now - previous.lastActivityAt;
    const state = inactiveFor > REST_AFTER_MS ? 'resting' : 'idle';
    return {
      ...previous,
      state,
      energy,
      module: null,
      requiresUserAction: false,
      lowPowerBlink: false,
      enteredAt: previous.state !== state ? now : previous.enteredAt,
      updatedAt: new Date(now).toISOString(),
    };
  }

  SN.engine = { initial, onSignal, resolve, tick, pickState, applyRule };
})(typeof window !== 'undefined' ? window : globalThis);
