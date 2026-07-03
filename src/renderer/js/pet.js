/*
 * pet.js — Presentation Layer (PRD §15.1 layer 3): renders a PetState onto
 * the creature + dock card. No business logic here; it only reflects state.
 */
(function (global) {
  'use strict';

  const SN = global.SN || (global.SN = {});
  const cfg = SN.config;

  const els = {};
  let live2dReady = false;
  let lastState = null;
  function q(id) { return document.getElementById(id); }

  function init() {
    els.card = q('sn-card');
    els.svg = document.querySelector('.sn-pet');
    els.cardState = document.querySelector('[data-field="card-state"]');
    els.cardAction = document.querySelector('[data-field="card-action"]');
    els.hoverZone = document.querySelector('.sn-hover-zone');
    els.dot = q('sn-dot');
    els.root = document.body;

    // Swap the SVG for the real Live2D NoNo once its runtime is ready.
    if (window.SNLive2DReady) onLive2DReady();
    window.addEventListener('sn-live2d-ready', onLive2DReady);
    window.addEventListener('sn-live2d-error', (e) => {
      console.warn('[SuperNoNo] Live2D unavailable, using SVG fallback.');
    });

    initAmbient();
  }

  /* ---- ambient hover interaction (goal C) --------------------------------
   * A light "alive" reaction while the cursor is on the pet. It ONLY fires in
   * calm states (idle/resting) so it can't interrupt or overwrite a real agent
   * state — thinking/…/waiting_approval/blocked/completed each drive Live2D's
   * own animation. It never touches signalAdapter; it's pure presentation.
   */
  const CALM_STATES = new Set(['idle', 'resting']);
  const HOVER_MOTIONS = ['Happy', 'JoyJump', 'Dance'];

  function initAmbient() {
    // Bind to the no-drag hover zone (the card itself is a drag region and can
    // swallow mouse events in Electron). Fall back to the card if absent.
    const zone = els.hoverZone || els.card;
    if (!zone) return;
    let lastMotionAt = 0;
    let nextGapMs = 4000;               // randomized 3.5–5.3s between reactions
    let hoverTimer = null;

    const canPlay = () => CALM_STATES.has(lastState) && (Date.now() - lastMotionAt) >= nextGapMs;

    function bounceZone() {
      zone.classList.remove('sn-hover-hi');
      void zone.offsetWidth;            // restart the CSS animation
      zone.classList.add('sn-hover-hi');
      setTimeout(() => zone.classList.remove('sn-hover-hi'), 950);
    }

    function playAmbient() {
      if (!canPlay()) return;
      lastMotionAt = Date.now();
      nextGapMs = 3500 + Math.floor(Math.random() * 1800);
      bounceZone();                     // always-visible container bounce/tilt
      if (live2dReady && window.desktopPet && window.desktopPet.playMotion) {
        window.desktopPet.playMotion(HOVER_MOTIONS[Math.floor(Math.random() * HOVER_MOTIONS.length)]);
      }
    }

    zone.addEventListener('mouseenter', () => {
      if (hoverTimer) return;
      playAmbient();                              // react on enter (throttled)
      hoverTimer = setInterval(playAmbient, 1500); // canPlay() gates the 3.5–5s cadence
    });
    zone.addEventListener('mouseleave', () => {
      if (hoverTimer) { clearInterval(hoverTimer); hoverTimer = null; }
    });
  }

  function onLive2DReady() {
    live2dReady = true;
    document.body.classList.add('sn-live2d-on');
    if (window.desktopPet && lastState) window.desktopPet.setState(lastState);
  }

  /** Reflect a PetState onto the DOM. */
  function render(petState) {
    if (!els.card) init();
    const def = cfg.STATES[petState.state] || cfg.STATES.idle;

    // drive the Live2D model (state-changes only; it manages its own loop)
    lastState = petState.state;
    if (live2dReady && window.desktopPet) window.desktopPet.setState(petState.state);

    els.card.dataset.state = petState.state;
    els.svg.dataset.state = petState.state;
    els.svg.setAttribute('data-lowpower', petState.lowPowerBlink ? 'true' : 'false');
    els.svg.setAttribute('aria-label', 'SuperNoNo：' + def.aria);

    if (els.cardState) els.cardState.textContent = def.label;

    // short "what am I doing" line in the status bar (latest recorded action,
    // read from the focused agent so it matches what the pet body shows)
    if (els.cardAction) {
      const ctx = SN.agents ? SN.agents.getFocusedContext()
        : (SN.signals && SN.signals.context);
      const acts = (ctx && ctx.actions) || [];
      els.cardAction.textContent = acts.length ? acts[acts.length - 1] : '';
    }

    // expose colours as CSS vars so chips / dot / bubble can track state
    const stateColor = cfg.CATEGORY_COLOR[def.category] || 'var(--sn-c-neutral)';
    const energyColor = cfg.energyBand(petState.energy).color;
    els.root.style.setProperty('--sn-state-color', stateColor);
    els.root.style.setProperty('--sn-energy-color', energyColor);

    // minimized dot mirrors state colour
    if (els.dot) {
      const core = els.dot.querySelector('.sn-dot__core');
      if (core) {
        core.style.color = stateColor;
        core.style.background = stateColor;
      }
    }
  }

  SN.pet = { init, render };
})(typeof window !== 'undefined' ? window : globalThis);
