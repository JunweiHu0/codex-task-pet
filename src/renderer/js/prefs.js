/*
 * prefs.js — Preference Store (PRD §15.1 layer 4, data model §14.1).
 *
 * Stores the PetProfile + personalization. Honours `memoryScope`:
 *   none         -> kept in memory only for this session, never persisted
 *   local        -> persisted to localStorage on this machine (default)
 *   cross-thread -> persisted + flagged as shareable across threads
 *
 * Privacy (PRD §13.3): nothing is ever uploaded; secrets/tokens are never
 * stored here (this store only holds display + behaviour preferences).
 */
(function (global) {
  'use strict';

  const SN = global.SN || (global.SN = {});
  const KEY = 'supernono.profile.v1';

  /** Default PetProfile — PRD §14.1 */
  const DEFAULTS = {
    petId: 'supernono-default',
    displayName: 'SuperNoNo',
    tone: 'casual', // professional | casual | lively
    dockPosition: 'bottom-right', // bottom-left | bottom-right | sidebar-top
    animationLevel: 'standard', // off | low | standard
    notificationLevel: 'standard', // quiet | standard | active
    memoryScope: 'local', // none | local | cross-thread
    enabled: true,
    greetingOnStart: true,
    celebrateOnComplete: true,
    // learned preferences (PRD §9.7) — non-sensitive only
    learned: {
      prefersShortReports: false,
      commonTaskTypes: [],
      doNotDisturb: null, // e.g. { from: '22:00', to: '08:00' }
    },
  };

  function hasLocalStorage() {
    try {
      return typeof localStorage !== 'undefined';
    } catch (_) {
      return false;
    }
  }

  function load() {
    if (!hasLocalStorage()) return { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed, learned: { ...DEFAULTS.learned, ...(parsed.learned || {}) } };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  class Preferences {
    constructor() {
      this._profile = load();
      this._listeners = new Set();
    }

    get profile() {
      return this._profile;
    }

    get(key) {
      return this._profile[key];
    }

    /** Update one or more fields and persist according to memoryScope. */
    set(patch) {
      this._profile = { ...this._profile, ...patch };
      this._persist();
      this._emit();
      return this._profile;
    }

    setLearned(patch) {
      this._profile.learned = { ...this._profile.learned, ...patch };
      this._persist();
      this._emit();
    }

    reset() {
      this._profile = { ...DEFAULTS };
      if (hasLocalStorage()) {
        try {
          localStorage.removeItem(KEY);
        } catch (_) {
          /* ignore */
        }
      }
      this._emit();
      return this._profile;
    }

    _persist() {
      if (this._profile.memoryScope === 'none') {
        // Honour "不记忆": drop any previously stored copy.
        if (hasLocalStorage()) {
          try {
            localStorage.removeItem(KEY);
          } catch (_) {
            /* ignore */
          }
        }
        return;
      }
      if (!hasLocalStorage()) return;
      try {
        localStorage.setItem(KEY, JSON.stringify(this._profile));
      } catch (_) {
        /* ignore quota / private mode */
      }
    }

    onChange(fn) {
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }

    _emit() {
      for (const fn of this._listeners) {
        try {
          fn(this._profile);
        } catch (_) {
          /* listener errors must not break the store */
        }
      }
    }
  }

  SN.prefs = new Preferences();
  SN.PrefsDefaults = DEFAULTS;
})(typeof window !== 'undefined' ? window : globalThis);
