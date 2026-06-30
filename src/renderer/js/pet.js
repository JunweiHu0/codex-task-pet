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
    els.dot = q('sn-dot');
    els.root = document.body;

    // Swap the SVG for the real Live2D NoNo once its runtime is ready.
    if (window.SNLive2DReady) onLive2DReady();
    window.addEventListener('sn-live2d-ready', onLive2DReady);
    window.addEventListener('sn-live2d-error', (e) => {
      console.warn('[SuperNoNo] Live2D unavailable, using SVG fallback.');
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
