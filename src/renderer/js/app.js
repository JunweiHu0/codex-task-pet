/*
 * app.js — orchestration. Wires the four layers together (PRD §15.1):
 *   Signal Adapter -> Pet State Engine -> Presentation -> Preference Store
 * and handles all user interaction (toolbar, panel, settings, dot, dev strip).
 */
(function (global) {
  'use strict';

  const SN = global.SN || (global.SN = {});
  const cfg = SN.config;

  /* ---- native bridge (Electron preload) with browser fallbacks ---------- */
  const bridge = global.SNNative || null;
  SN.native = {
    isElectron: !!bridge,
    openPath(p) {
      if (bridge && bridge.openPath) bridge.openPath(p);
      else console.log('[demo] open path:', p);
    },
    moveDock(pos) { if (bridge && bridge.moveDock) bridge.moveDock(pos); },
    setVisible(v) { if (bridge && bridge.setVisible) bridge.setVisible(v); },
    requireAttention(v) { if (bridge && bridge.requireAttention) bridge.requireAttention(v); },
    quit() { if (bridge && bridge.quit) bridge.quit(); },
  };

  /* ---- runtime state ---------------------------------------------------- */
  let petState = SN.engine.initial();
  let lastAnnounced = null;
  let tickHandle = null;

  const ANNOUNCEABLE = ['thinking', 'scanning', 'building', 'validating', 'waiting_approval', 'blocked', 'completed'];

  /* ---- boot ------------------------------------------------------------- */
  function boot() {
    SN.pet.init();
    SN.panel.init();
    SN.bubble.init(() => openPanel());
    SN.settings.init(applyPreference);

    if (!SN.native.isElectron) document.body.classList.add('sn-demo');
    applyProfile(SN.prefs.profile);
    SN.settings.sync();

    bindEvents();
    subscribeSignals();

    render(); // initial idle
    startTicker();
    maybeGreet();

    exposePublicApi();
  }

  /* ---- signals -> engine -> render -------------------------------------- */
  function subscribeSignals() {
    SN.signals.onChange((signalType, payload) => {
      const live = SN.signals.liveSignalTypes();
      petState = SN.engine.onSignal(signalType, payload, live, petState);
      render();
      announce(petState, SN.signals.context);
      SN.native.requireAttention(petState.requiresUserAction);
    });

    // accept signals pushed from the Electron main process (real integration seam)
    if (bridge && bridge.onSignal) {
      bridge.onSignal((type, payload) => SN.signals.emit(type, payload || {}));
    }

    // tray / menu commands
    if (bridge && bridge.onCommand) {
      bridge.onCommand((cmd, arg) => {
        if (cmd === 'run-demo') SN.sim.runDemo();
        else if (cmd === 'force' && arg) SN.sim.force(arg);
      });
    }
  }

  function startTicker() {
    clearInterval(tickHandle);
    tickHandle = setInterval(() => {
      const next = SN.engine.tick(petState);
      if (next !== petState && next.state !== petState.state) {
        petState = next;
        render();
      } else {
        petState = next;
        // light refresh of energy bar while a panel is open
        if (SN.panel.isOpen()) SN.panel.render(petState, SN.signals.context);
      }
    }, 1000);
  }

  function render() {
    SN.pet.render(petState);
    if (SN.panel.isOpen()) SN.panel.render(petState, SN.signals.context);
  }

  /* ---- bubbles ---------------------------------------------------------- */
  function announce(state, ctx) {
    const s = state.state;
    if (!ANNOUNCEABLE.includes(s)) { lastAnnounced = s; return; }
    if (s === lastAnnounced && !cfg.CRITICAL_STATES.includes(s)) return;
    lastAnnounced = s;

    const tone = SN.prefs.get('tone');
    const level = SN.prefs.get('notificationLevel');
    const critical = cfg.CRITICAL_STATES.includes(s);
    if (!critical && !cfg.canBubble(level, s)) return;

    let msg = (cfg.COPY[s] && cfg.COPY[s][tone]) || cfg.STATES[s].label;
    if (s === 'waiting_approval' && ctx.approvalCommand) {
      msg = (tone === 'professional' ? '需批准：' : '需要你批准：') + ctx.approvalCommand;
    } else if (s === 'completed' && ctx.artifacts && ctx.artifacts.length) {
      msg = msg + '（' + ctx.artifacts[0].label + '）';
    } else if (s === 'blocked' && ctx.blockReason) {
      msg = '我卡在「' + ctx.blockReason + '」';
    }

    const accent = cfg.CATEGORY_COLOR[cfg.STATES[s].category];
    SN.bubble.show(msg, { critical, accent });
  }

  function maybeGreet() {
    if (!SN.prefs.get('greetingOnStart')) return;
    const tone = SN.prefs.get('tone');
    const name = SN.prefs.get('displayName') || 'SuperNoNo';
    const msg = (cfg.GREETING[tone] || cfg.GREETING.casual).replace('{name}', name);
    setTimeout(() => SN.bubble.show(msg, { accent: 'var(--sn-c-blue)' }), 700);
  }

  /* ---- preferences ------------------------------------------------------ */
  function applyProfile(p) {
    document.body.dataset.anim = p.animationLevel || 'standard';
    document.body.dataset.dock = p.dockPosition || 'bottom-right';
    setMinimized(!p.enabled);
  }

  function applyPreference(key, profile) {
    applyProfile(profile);
    if (key === 'dockPosition') SN.native.moveDock(profile.dockPosition);
    if (key === 'enabled') setMinimized(!profile.enabled);
    if (key === 'tone' || key === 'displayName') { lastAnnounced = null; }
    render();
  }

  /* ---- minimize / restore ---------------------------------------------- */
  function setMinimized(min) {
    const card = document.getElementById('sn-card');
    const dot = document.getElementById('sn-dot');
    card.style.display = min ? 'none' : '';
    dot.hidden = !min;
    if (min) { SN.bubble.hide(); SN.panel.close(); SN.settings.close(); }
  }

  /* ---- panels ----------------------------------------------------------- */
  function openPanel() {
    SN.settings.close();
    SN.panel.render(petState, SN.signals.context);
    SN.panel.open();
  }

  /* ---- event wiring ----------------------------------------------------- */
  function bindEvents() {
    document.addEventListener('click', (e) => {
      const actEl = e.target.closest('[data-act]');
      if (actEl) return handleAction(actEl.dataset.act, actEl);

      const simEl = e.target.closest('[data-sim]');
      if (simEl) return SN.sim.force(simEl.dataset.sim);

      const demoEl = e.target.closest('[data-demo]');
      if (demoEl) return SN.sim.runDemo();
    });

    document.getElementById('sn-dot').addEventListener('click', () => {
      if (!SN.prefs.get('enabled')) SN.prefs.set({ enabled: true });
      setMinimized(false);
      SN.settings.sync();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { SN.panel.close(); SN.settings.close(); }
    });

    // typing suppression for our own text fields (PRD §9.3)
    document.querySelectorAll('.sn-text').forEach((tx) => {
      tx.addEventListener('focus', () => SN.bubble.setTyping(true));
      tx.addEventListener('blur', () => SN.bubble.setTyping(false));
    });
  }

  function handleAction(act, el) {
    switch (act) {
      case 'toggle-panel': SN.panel.isOpen() ? SN.panel.close() : openPanel(); break;
      case 'close-panel': SN.panel.close(); break;
      case 'settings': SN.panel.close(); SN.settings.toggle(); break;
      case 'close-settings': SN.settings.close(); break;
      case 'hide': setMinimized(true); break;
      case 'open-artifact': {
        const p = el.dataset.path || (SN.signals.context.artifacts[0] && SN.signals.context.artifacts[0].path);
        if (p) SN.native.openPath(p);
        break;
      }
      case 'quieter': stepDownNotifications(); break;
      case 'reset':
        SN.prefs.reset();
        applyProfile(SN.prefs.profile);
        SN.settings.sync();
        lastAnnounced = null;
        maybeGreet();
        break;
    }
  }

  function stepDownNotifications() {
    const order = ['active', 'standard', 'quiet'];
    const cur = SN.prefs.get('notificationLevel');
    const next = order[Math.min(order.length - 1, order.indexOf(cur) + 1)];
    SN.prefs.set({ notificationLevel: next });
    SN.settings.sync();
    SN.bubble.show('提示已调整为「' + ({ active: '活跃', standard: '标准', quiet: '安静' }[next]) + '」', { critical: true });
  }

  /* ---- public API (real Codex integration entry point) ------------------ */
  function exposePublicApi() {
    global.SuperNoNo = {
      signal: (type, payload) => SN.signals.emit(type, payload || {}),
      force: (state) => SN.sim.force(state),
      runDemo: () => SN.sim.runDemo(),
      getState: () => ({ ...petState }),
      getContext: () => SN.signals.context,
      prefs: SN.prefs,
      setTyping: (v) => SN.bubble.setTyping(v),
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
