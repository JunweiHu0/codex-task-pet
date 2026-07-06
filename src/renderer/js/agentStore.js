/*
 * agentStore.js — Multiagent State Store (Phase 1 M1).
 *
 * Holds one isolated (SignalAdapter + PetState) pair per agent/session so
 * events from different agents can never pollute each other, plus:
 *   - a ring buffer of recent events (timeline for the panel),
 *   - the attention policy v0 that picks which agent the pet body follows.
 *
 * Layering: this sits BETWEEN the event entry point (bridge / public API) and
 * the existing single-agent pipeline. It does not reimplement any of it:
 *   - per-entry task context     -> SN.SignalAdapter instances (unchanged class)
 *   - per-entry visual state     -> SN.engine pure functions (unchanged)
 * The pre-existing SN.signals instance is wrapped as the 'default' entry, so
 * legacy events without agent/sessionId (and the simulator/demo, which emit
 * into SN.signals directly) keep the exact v1.0 single-agent behaviour.
 *
 * Attention policy v0 (rank per visual state, highest wins; ties -> most
 * recently active entry):
 *   waiting_approval(50) > blocked(40) > building/validating(30)
 *   > scanning/thinking(20) > completed(10) > idle/resting(0)
 * So a permission_required immediately takes focus, a plain command_running
 * never steals focus from it, and one agent's turn_ended only settles that
 * agent's own entry.
 */
(function (global) {
  'use strict';

  const SN = global.SN || (global.SN = {});

  const DEFAULT_KEY = 'default';
  const MAX_AGENTS = 12;   // safety cap: bridge is open to any local process
  const MAX_EVENTS = 150;  // timeline ring buffer length

  // Attention policy v0: visual state -> focus rank.
  const STATE_RANK = {
    waiting_approval: 50,
    blocked: 40,
    building: 30,
    validating: 30,
    scanning: 20,
    thinking: 20,
    completed: 10,
    resting: 0,
    idle: 0,
  };

  function rankOf(entry) {
    return STATE_RANK[entry.petState.state] || 0;
  }

  // Rank at or above which an agent's state may break through a pin / manual
  // focus: the user must never miss a "needs me" state because of a pin.
  const ATTENTION_RANK = 40; // blocked(40), waiting_approval(50)

  // Working states used by the panel's staleness hint (Phase 2.4): an agent in
  // one of these with no new event for STALE_MS is flagged "possibly stuck".
  // waiting_approval is NOT here — waiting on the user is not staleness.
  const WORKING_STATES = new Set(['thinking', 'scanning', 'building', 'validating']);
  const STALE_MS = 2 * 60 * 1000;

  // Coarse "settle" events (what the notify wrapper can send). When they arrive
  // WITHOUT a sessionId they must never be routed onto a session that is
  // waiting on the user — they would clear its pending approval/block.
  const SETTLE_TYPES = ['turn_ended', 'idle', 'completed'];

  function str(v) {
    return typeof v === 'string' && v ? v : null;
  }

  class AgentStore {
    constructor() {
      this.agents = new Map(); // key -> entry
      this.events = [];        // ring buffer, newest last
      this.focusKey = DEFAULT_KEY;
      this.pinnedKey = null;      // hard focus lock (panel pin), in-memory only
      this.manualFocusKey = null; // soft focus choice (panel card click)
      this._listeners = new Set();

      // The default entry wraps the pre-existing SN.signals instance so that
      // direct SN.signals.emit(...) callers (simulator, demo, old code paths)
      // flow through the store automatically via the onChange hook below.
      this._addEntry(DEFAULT_KEY, { signals: SN.signals });
    }

    /* ---- entries -------------------------------------------------------- */

    _addEntry(key, init) {
      const entry = {
        key,
        agent: str(init.agent),
        adapter: str(init.adapter),
        sessionId: str(init.sessionId),
        signals: init.signals || new SN.SignalAdapter(),
        petState: SN.engine.initial(),
        lastEventAt: 0,
        lastEventType: null,
      };
      // Every adapter instance reports back into the store. This single seam
      // handles both handleSignal() calls and direct .emit() calls.
      entry.signals.onChange((type, payload) => this._afterEmit(entry, type, payload));
      this.agents.set(key, entry);
      // A brand-new entry has lastEventAt=0 and rank 0, which would make it the
      // eviction algorithm's first pick — protect it until its first event.
      this._evictIfNeeded(key);
      return entry;
    }

    /**
     * Map an event's provenance to its entry.
     *  - no agent            -> 'default' (legacy single-agent behaviour)
     *  - agent + sessionId   -> 'agent:sessionId'
     *  - agent, no sessionId -> that agent's most recently active entry (so a
     *    coarse notify-wrapper turn_ended settles the right session), else a
     *    per-agent 'agent:default' entry. Settle events skip sessions that are
     *    waiting on the user; returns null if no safe target exists (the event
     *    is then recorded to the timeline only, see handleSignal).
     */
    _resolveEntry(type, payload) {
      const agent = str(payload.agent);
      const session = str(payload.sessionId);
      if (!agent) return this.agents.get(DEFAULT_KEY);
      if (session) {
        const key = agent + ':' + session;
        return this.agents.get(key)
          || this._addEntry(key, { agent, adapter: payload.adapter, sessionId: session });
      }
      const settle = SETTLE_TYPES.includes(type);
      let best = null;    // most recent safe target
      let bestAny = null; // most recent entry of this agent, regardless
      for (const e of this.agents.values()) {
        if (e.agent !== agent) continue;
        if (!bestAny || e.lastEventAt > bestAny.lastEventAt) bestAny = e;
        if (settle && e.petState.requiresUserAction) continue;
        if (!best || e.lastEventAt > best.lastEventAt) best = e;
      }
      if (best) return best;
      // Every session of this agent is waiting on the user: a coarse settle
      // event has no safe target — drop it rather than clear an approval.
      if (bestAny) return settle ? null : bestAny;
      return this._addEntry(agent + ':default', { agent, adapter: payload.adapter });
    }

    _evictIfNeeded(protectedKey) {
      if (this.agents.size <= MAX_AGENTS) return;
      let victim = null;
      for (const e of this.agents.values()) {
        if (e.key === DEFAULT_KEY || e.key === this.focusKey || e.key === protectedKey) continue;
        if (e.key === this.pinnedKey || e.key === this.manualFocusKey) continue; // user's explicit choices
        if (rankOf(e) > 0) continue; // never drop an entry that still matters
        if (!victim || e.lastEventAt < victim.lastEventAt) victim = e;
      }
      if (victim) this.agents.delete(victim.key);
    }

    /* ---- event flow ------------------------------------------------------ */

    /** Entry point for all external events (bridge IPC + SuperNoNo.signal). */
    handleSignal(type, payload) {
      payload = payload && typeof payload === 'object' ? payload : {};
      const entry = this._resolveEntry(type, payload);
      if (!entry) {
        // No safe target (see _resolveEntry): keep the event visible in the
        // timeline, but never mutate a session that is waiting on the user.
        this._pushEvent({ key: (str(payload.agent) || 'local') + ':*', agent: str(payload.agent) || 'local' }, type, payload);
        return null;
      }
      entry.signals.emit(type, payload); // -> _afterEmit via the onChange hook
      return entry.key;
    }

    _afterEmit(entry, type, payload) {
      payload = payload && typeof payload === 'object' ? payload : {};
      entry.petState = SN.engine.onSignal(type, payload, entry.signals.liveSignalTypes(), entry.petState);
      entry.lastEventAt = Date.now();
      entry.lastEventType = type;
      if (str(payload.adapter)) entry.adapter = payload.adapter;
      this._pushEvent(entry, type, payload);
      const focusChanged = this._recomputeFocus();
      this._notify({ type, payload, entry, focusChanged, focusKey: this.focusKey });
    }

    _pushEvent(entry, type, payload) {
      // Timeline keeps short, display-safe strings only (never raw payloads).
      const action = typeof payload.action === 'string' ? payload.action.slice(0, 120) : '';
      this.events.push({
        at: Date.now(),
        agentKey: entry.key,
        agent: entry.agent || 'local',
        type,
        action,
      });
      if (this.events.length > MAX_EVENTS) this.events.shift();
    }

    /* ---- attention policy ------------------------------------------------ */

    /** Attention policy v0: highest rank wins, ties -> most recently active. */
    _autoPick() {
      let best = this.agents.get(this.focusKey) || this.agents.get(DEFAULT_KEY);
      for (const e of this.agents.values()) {
        if (!best) { best = e; continue; }
        const r = rankOf(e);
        const rb = rankOf(best);
        if (r > rb || (r === rb && e.lastEventAt > best.lastEventAt)) best = e;
      }
      return best || null;
    }

    /**
     * Focus resolution (Phase 2.4): three layers on top of each other.
     *   pin    — hard lock; only an ATTENTION-rank state (waiting_approval /
     *            blocked) on ANOTHER agent may break through, and only while
     *            it is live. The user must never miss a "needs me" state.
     *   manual — card-click choice; holds against recency ties, but a strictly
     *            higher rank elsewhere breaks (and clears) it.
     *   auto   — attention policy v0 (rank, then recency).
     */
    _recomputeFocus() {
      // hygiene: never point at evicted entries
      if (this.pinnedKey && !this.agents.has(this.pinnedKey)) this.pinnedKey = null;
      if (this.manualFocusKey && !this.agents.has(this.manualFocusKey)) this.manualFocusKey = null;

      const auto = this._autoPick();
      let next;
      if (this.pinnedKey) {
        const breakthrough = auto && auto.key !== this.pinnedKey && rankOf(auto) >= ATTENTION_RANK;
        next = breakthrough ? auto.key : this.pinnedKey;
      } else if (this.manualFocusKey) {
        const manual = this.agents.get(this.manualFocusKey);
        if (auto && auto.key !== this.manualFocusKey && rankOf(auto) > rankOf(manual)) {
          this.manualFocusKey = null; // escalation elsewhere breaks the manual choice
          next = auto.key;
        } else {
          next = this.manualFocusKey;
        }
      } else {
        next = auto ? auto.key : DEFAULT_KEY;
      }

      const changed = next !== this.focusKey;
      this.focusKey = next;
      return changed;
    }

    /* ---- manual focus / pin (panel controls, in-memory only) -------------- */

    _focusOp() {
      const changed = this._recomputeFocus();
      // Reuse the normal notify path so app.js re-renders pet + panel without
      // any wiring changes; entry = focused entry so bubbles follow the switch.
      this._notify({ type: '__focus', payload: {}, entry: this.getFocusedEntry(), focusChanged: changed, focusKey: this.focusKey });
      return changed;
    }

    /** Card click. Clicking the current manual choice again clears it (toggle). */
    setManualFocus(agentKey) {
      if (!this.agents.has(agentKey)) return false;
      this.manualFocusKey = this.manualFocusKey === agentKey ? null : agentKey;
      this._focusOp();
      return true;
    }

    clearManualFocus() {
      this.manualFocusKey = null;
      this._focusOp();
    }

    /** At most one pinned agent; pinning supersedes any manual choice. */
    pinAgent(agentKey) {
      if (!this.agents.has(agentKey)) return false;
      this.pinnedKey = agentKey;
      this.manualFocusKey = null;
      this._focusOp();
      return true;
    }

    unpinAgent() {
      this.pinnedKey = null;
      this._focusOp();
    }

    getPinnedAgent() { return this.pinnedKey; }

    /** Time-driven update (~1/sec): tick every entry, then re-pick focus. */
    tick() {
      for (const e of this.agents.values()) {
        e.petState = SN.engine.tick(e.petState);
      }
      const focusChanged = this._recomputeFocus();
      return { focusChanged };
    }

    /* ---- getters --------------------------------------------------------- */

    getFocusedEntry() {
      return this.agents.get(this.focusKey) || this.agents.get(DEFAULT_KEY);
    }

    getFocusedAgent() { return this.focusKey; }
    getFocusedState() { return this.getFocusedEntry().petState; }
    getFocusedContext() { return this.getFocusedEntry().signals.context; }

    anyRequiresAction() {
      for (const e of this.agents.values()) {
        if (e.petState.requiresUserAction) return true;
      }
      return false;
    }

    /** Snapshot list for the panel / debugging (most recently active first).
     *  The default entry is included only once it has actually seen events. */
    getAgents() {
      const out = [];
      const now = Date.now();
      for (const e of this.agents.values()) {
        if (e.key === DEFAULT_KEY && !e.lastEventAt) continue;
        const acts = e.signals.context.actions;
        out.push({
          key: e.key,
          agent: e.agent || 'local',
          adapter: e.adapter,
          sessionId: e.sessionId,
          state: e.petState.state,
          energy: e.petState.energy,
          requiresUserAction: e.petState.requiresUserAction,
          title: e.signals.context.title,
          lastAction: acts.length ? acts[acts.length - 1] : '',
          lastEventAt: e.lastEventAt,
          lastEventType: e.lastEventType,
          focused: e.key === this.focusKey,
          manualFocused: e.key === this.manualFocusKey,
          pinned: e.key === this.pinnedKey,
          // "possibly stuck": working state with no new event for STALE_MS.
          // Panel hint only — the pet state itself is not changed.
          stale: WORKING_STATES.has(e.petState.state) && e.lastEventAt > 0 && (now - e.lastEventAt) > STALE_MS,
        });
      }
      out.sort((a, b) => b.lastEventAt - a.lastEventAt);
      return out;
    }

    getTimeline() { return this.events.slice(); }

    /* ---- listeners ------------------------------------------------------- */

    onChange(fn) {
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }

    _notify(evt) {
      for (const fn of this._listeners) {
        try { fn(evt); } catch (_) { /* keep the store resilient */ }
      }
    }
  }

  SN.agents = new AgentStore();
})(typeof window !== 'undefined' ? window : globalThis);
