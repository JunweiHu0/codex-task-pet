/*
 * bubble.js — task progress bubble (PRD §9.3 / §13.1).
 *
 * Rules enforced here:
 *   - critical bubbles (approval / blocked / completed) always show
 *   - non-critical bubbles throttle to >= 8s apart
 *   - non-critical bubbles are suppressed while the user is typing
 *   - auto-dismiss after 4s; hovering keeps it; clicking opens the panel
 *   - max 36 Chinese chars (truncated defensively)
 */
(function (global) {
  'use strict';

  const SN = global.SN || (global.SN = {});
  const cfg = SN.config;

  const MIN_GAP_MS = 8000;
  const AUTO_MS = 4000;

  const state = {
    el: null,
    textEl: null,
    timer: null,
    lastShownAt: 0,
    hovering: false,
    typing: false,
    onClick: null,
  };

  function init(onClick) {
    state.el = document.getElementById('sn-bubble');
    state.textEl = state.el.querySelector('.sn-bubble__text');
    state.onClick = onClick;

    state.el.addEventListener('mouseenter', () => {
      state.hovering = true;
      clearTimeout(state.timer);
    });
    state.el.addEventListener('mouseleave', () => {
      state.hovering = false;
      scheduleDismiss();
    });
    state.el.addEventListener('click', () => {
      hide();
      if (state.onClick) state.onClick();
    });
  }

  function setTyping(v) { state.typing = !!v; }

  function truncate(text) {
    return text && text.length > 36 ? text.slice(0, 35) + '…' : text;
  }

  /**
   * Attempt to show a bubble.
   * @param {string} text
   * @param {object} opts { critical, accent, force }
   * @returns {boolean} whether it was shown
   */
  function show(text, opts = {}) {
    if (!text) return false;
    const critical = !!opts.critical;
    const now = Date.now();

    if (!critical) {
      if (state.typing) return false;               // PRD §13.1 禁止提示
      if (now - state.lastShownAt < MIN_GAP_MS) return false; // throttle
    }

    state.textEl.textContent = truncate(text);
    state.el.hidden = false;
    state.el.classList.toggle('sn-bubble--critical', critical);

    if (opts.accent) {
      state.el.dataset.accent = '1';
      state.el.style.setProperty('--sn-bubble-accent', opts.accent);
    } else {
      delete state.el.dataset.accent;
    }

    state.lastShownAt = now;
    scheduleDismiss();
    return true;
  }

  function scheduleDismiss() {
    clearTimeout(state.timer);
    if (state.hovering) return;
    state.timer = setTimeout(hide, AUTO_MS);
  }

  function hide() {
    clearTimeout(state.timer);
    if (state.el) state.el.hidden = true;
  }

  SN.bubble = { init, show, hide, setTyping };
})(typeof window !== 'undefined' ? window : globalThis);
