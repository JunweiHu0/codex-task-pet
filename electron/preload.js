/*
 * preload.js — safe bridge between the renderer and the Electron main process.
 * Exposes a minimal, allow-listed API as window.SNNative.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SNNative', {
  // open / reveal a produced artifact (PRD §9.6)
  openPath: (p) => ipcRenderer.invoke('sn:open-path', p),

  // reposition the overlay when the dock preference changes (PRD §9.1)
  moveDock: (pos) => ipcRenderer.send('sn:move-dock', pos),

  setVisible: (v) => ipcRenderer.send('sn:set-visible', v),

  // flash the taskbar/frame when user action is required (PRD §9.2)
  requireAttention: (v) => ipcRenderer.send('sn:require-attention', v),

  quit: () => ipcRenderer.send('sn:quit'),

  // grow to panel size / shrink back to the pet (driven by overlay visibility)
  resizeMode: (mode) => ipcRenderer.send('sn:resize-mode', mode),

  // real Codex integration seam: main -> renderer task signals
  onSignal: (cb) => ipcRenderer.on('sn:signal', (_e, type, payload) => cb(type, payload)),

  // tray / menu commands (e.g. run-demo)
  onCommand: (cb) => ipcRenderer.on('sn:command', (_e, cmd, arg) => cb(cmd, arg)),
});
