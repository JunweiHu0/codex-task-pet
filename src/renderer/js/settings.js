/*
 * settings.js — settings panel binding (PRD §9.7 / §11.4).
 * Two-way binds the DOM controls to SN.prefs and notifies a callback so the
 * app can apply changes live (anim level, dock, tone, etc.).
 */
(function (global) {
  'use strict';

  const SN = global.SN || (global.SN = {});

  const els = {};
  let onApply = null;

  function init(applyCb) {
    onApply = applyCb;
    els.panel = document.getElementById('sn-settings');
    els.switches = els.panel.querySelectorAll('.sn-switch[data-pref]');
    els.texts = els.panel.querySelectorAll('.sn-text[data-pref]');
    els.segs = els.panel.querySelectorAll('.sn-seg[data-pref]');

    // checkboxes
    els.switches.forEach((sw) => {
      sw.addEventListener('change', () => {
        SN.prefs.set({ [sw.dataset.pref]: sw.checked });
        emitApply(sw.dataset.pref);
      });
    });

    // text inputs
    els.texts.forEach((tx) => {
      tx.addEventListener('input', () => {
        const val = tx.value.trim() || 'SuperNoNo';
        SN.prefs.set({ [tx.dataset.pref]: val });
        emitApply(tx.dataset.pref);
      });
    });

    // segmented controls
    els.segs.forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-val]');
        if (!btn) return;
        SN.prefs.set({ [seg.dataset.pref]: btn.dataset.val });
        sync();
        emitApply(seg.dataset.pref);
      });
    });
  }

  function emitApply(key) {
    if (onApply) onApply(key, SN.prefs.profile);
  }

  /** Reflect the stored profile into the controls. */
  function sync() {
    const p = SN.prefs.profile;
    els.switches.forEach((sw) => { sw.checked = !!p[sw.dataset.pref]; });
    els.texts.forEach((tx) => { if (document.activeElement !== tx) tx.value = p[tx.dataset.pref] || ''; });
    els.segs.forEach((seg) => {
      const cur = p[seg.dataset.pref];
      seg.querySelectorAll('button[data-val]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.val === cur));
      });
    });
  }

  function isOpen() { return els.panel && !els.panel.hidden; }
  function open() { if (els.panel) { sync(); els.panel.hidden = false; } }
  function close() { if (els.panel) els.panel.hidden = true; }
  function toggle() { isOpen() ? close() : open(); }

  SN.settings = { init, sync, open, close, toggle, isOpen };
})(typeof window !== 'undefined' ? window : globalThis);
