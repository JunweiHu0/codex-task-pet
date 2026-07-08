/*
 * main.js — Electron main process for the SuperNoNo desktop pet.
 *
 * Creates a transparent, frameless, always-on-top overlay window that floats
 * the pet in a screen corner, plus a tray icon, a global show/hide shortcut,
 * and the IPC seam used by the renderer (open artifact, move dock, attention).
 */
'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, screen, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Default pet window: big enough for Nono + the status bar + a 2-line speech
// bubble above it, but small enough not to occlude the desktop. The task panel
// / settings need more room, so the tray temporarily grows the window to PANEL
// size and the renderer shrinks it back to PET size when those overlays close.
const PET_WIN_W = 210;
const PET_WIN_H = 320;
const PANEL_WIN_W = 340;
const PANEL_WIN_H = 660;
const MARGIN = 12;

// Local event bridge (Milestone 1): loopback-only HTTP seam for agent adapters.
const BRIDGE_PORT = Number(process.env.SUPERNONO_BRIDGE_PORT || 4174);
const BRIDGE_PROTOCOL_VERSION = '0.1.0';
const BRIDGE_MAX_BODY = 64 * 1024; // reject /signal bodies larger than 64KB
const BRIDGE_ALLOWED_HOSTS = new Set([
  `127.0.0.1:${BRIDGE_PORT}`,
  `localhost:${BRIDGE_PORT}`,
]);
const BLOCKED_OPEN_EXTENSIONS = new Set([
  '.bat', '.cmd', '.com', '.cpl', '.exe', '.js', '.jse', '.lnk', '.msi',
  '.msp', '.ps1', '.scr', '.vbe', '.vbs', '.wsf',
]);

let win = null;
let tray = null;
let currentDock = 'bottom-right';
let winMode = 'pet'; // 'pet' (small, default) | 'panel' (large, for task panel / settings)
let serverUrl = null;

const ASSET = (f) => path.join(__dirname, '..', 'assets', f);
const RENDERER_ROOT = path.join(__dirname, '..', 'src', 'renderer');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.moc3': 'application/octet-stream',
};

/*
 * The Live2D model loads its moc3/textures/motions via fetch(). Under file://
 * that is blocked, so we serve the renderer from a localhost HTTP server.
 */
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(RENDERER_ROOT, path.normalize(urlPath));
      if (!filePath.startsWith(RENDERER_ROOT)) { res.writeHead(403); return res.end('forbidden'); }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      serverUrl = `http://127.0.0.1:${port}/`;
      resolve(serverUrl);
    });
  });
}

/*
 * Local event bridge (Milestone 1). A loopback-only HTTP endpoint that lets any
 * local agent adapter (Codex, Claude, scripts, ...) drive the pet by POSTing
 * normalized state events:
 *
 *   GET  /health  -> { ok, app, protocolVersion }
 *   POST /signal  -> forwards to the renderer via IPC ('sn:signal')
 *
 * Security: binds 127.0.0.1 only, caps the body size, and NEVER executes
 * anything from the payload — it only relays state to the existing renderer
 * channel. If SuperNoNo isn't running the sender simply fails to connect.
 */
function startBridgeServer() {
  const json = (res, code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };

  const rejectBrowserOrSpoofedHost = (req, res) => {
    if (req.headers.origin) {
      json(res, 403, { ok: false, error: 'browser origin forbidden' });
      return true;
    }
    const host = String(req.headers.host || '').toLowerCase();
    if (host && !BRIDGE_ALLOWED_HOSTS.has(host)) {
      json(res, 403, { ok: false, error: 'forbidden host' });
      return true;
    }
    return false;
  };

  const server = http.createServer((req, res) => {
    if (rejectBrowserOrSpoofedHost(req, res)) return;

    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { ok: true, app: 'SuperNoNo', protocolVersion: BRIDGE_PROTOCOL_VERSION });
    }

    if (req.method !== 'POST' || req.url !== '/signal') {
      return json(res, 404, { ok: false, error: 'not found' });
    }

    let body = '';
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      body += chunk;
      if (body.length > BRIDGE_MAX_BODY) {
        aborted = true;
        json(res, 413, { ok: false, error: 'payload too large' });
        req.destroy();
      }
    });

    req.on('end', () => {
      if (aborted) return;

      let msg;
      try {
        msg = JSON.parse(body || '{}');
      } catch (_) {
        return json(res, 400, { ok: false, error: 'invalid json' });
      }

      const type = typeof msg.type === 'string' ? msg.type.trim() : '';
      if (!type) return json(res, 400, { ok: false, error: 'missing type' });

      // Relay only the state payload + provenance. Commands are data, never run.
      // Envelope fields (agent/adapter/sessionId/taskId) may arrive either at the
      // top level or inside payload; accept both, top level winning.
      const rawPayload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
      const pickStr = (a, b) => (typeof a === 'string' && a ? a : (typeof b === 'string' && b ? b : null));
      const agent = pickStr(msg.agent, rawPayload.agent);
      const adapter = pickStr(msg.adapter, rawPayload.adapter);
      const sessionId = pickStr(msg.sessionId, rawPayload.sessionId);
      const taskId = pickStr(msg.taskId, rawPayload.taskId);
      const normalizedPayload = {
        ...rawPayload,
        agent,
        adapter,
        sessionId,
        taskId,
        source: rawPayload.source || adapter || agent || 'local-bridge',
      };

      if (win && !win.isDestroyed()) win.webContents.send('sn:signal', type, normalizedPayload);
      return json(res, 200, { ok: true });
    });

    req.on('error', () => { try { res.destroy(); } catch (_) { /* ignore */ } });
  });

  // A bind failure (e.g. port already in use) must not break the pet itself.
  server.on('error', (err) => console.log('[SuperNoNo] bridge disabled:', err && err.message));
  server.listen(BRIDGE_PORT, '127.0.0.1', () => {
    console.log(`[SuperNoNo] bridge listening: http://127.0.0.1:${BRIDGE_PORT}`);
  });
}

function winSize() {
  return winMode === 'panel'
    ? { w: PANEL_WIN_W, h: PANEL_WIN_H }
    : { w: PET_WIN_W, h: PET_WIN_H };
}

function dockBounds(dock, size) {
  const { w, h } = size || winSize();
  const { workArea } = screen.getPrimaryDisplay();
  const right = workArea.x + workArea.width - w - MARGIN;
  const left = workArea.x + MARGIN;
  const bottom = workArea.y + workArea.height - h - MARGIN;
  const top = workArea.y + MARGIN;
  switch (dock) {
    case 'bottom-left': return { x: left, y: bottom };
    case 'sidebar-top': return { x: right, y: top };
    case 'bottom-right':
    default: return { x: right, y: bottom };
  }
}

// Grow to panel size (task panel / settings) or shrink back to the pet. The
// bottom-right corner stays anchored so Nono doesn't jump when the window
// resizes — the extra space opens upward/leftward for the overlay.
function setWinMode(mode) {
  if (!win) return;
  const next = mode === 'panel' ? 'panel' : 'pet';
  if (next === winMode) return;
  winMode = next;
  const { w, h } = winSize();
  const b = dockBounds(currentDock, { w, h });
  win.setBounds({ x: b.x, y: b.y, width: w, height: h });
}

function loadIcon(file) {
  try {
    const p = ASSET(file);
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  } catch (_) { /* ignore */ }
  return null;
}

function createWindow() {
  const { w, h } = winSize();            // starts in 'pet' mode -> small window
  const pos = dockBounds(currentDock, { w, h });
  win = new BrowserWindow({
    width: w,
    height: h,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    icon: loadIcon('icon.png') || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.loadURL(serverUrl || ('file://' + path.join(RENDERER_ROOT, 'index.html')));

  // Diagnostics: surface renderer load + any Live2D/runtime errors to stdout.
  win.webContents.on('did-finish-load', () => console.log('[SuperNoNo] renderer loaded:', serverUrl));
  win.webContents.on('did-fail-load', (_e, code, desc) => console.log('[SuperNoNo] load failed:', code, desc));
  win.webContents.on('render-process-gone', (_e, d) => console.log('[SuperNoNo] render gone:', d && d.reason));
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('[renderer]', message); // warnings + errors
  });

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

function setVisible(v) {
  if (!win) return;
  if (v) { win.show(); win.setAlwaysOnTop(true, 'floating'); }
  else win.hide();
}

function toggleVisible() {
  if (!win) return;
  setVisible(!win.isVisible());
}

function buildTray() {
  const icon = loadIcon('tray.png') || loadIcon('icon.png') || nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('SuperNoNo — Codex 桌宠');
  // Panel / settings / demo live here now (removed from the pet UI). Each shows
  // the window, then asks the renderer to open the relevant overlay via the
  // existing 'sn:command' channel.
  const sendCmd = (cmd) => { if (win) { setVisible(true); win.webContents.send('sn:command', cmd); } };
  // Panel / settings need room: show the window, grow to panel size, then open.
  const openOverlay = (cmd) => { if (win) { setVisible(true); setWinMode('panel'); win.webContents.send('sn:command', cmd); } };
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏 Nono', click: () => toggleVisible() },
    { type: 'separator' },
    { label: '打开任务面板', click: () => openOverlay('open-panel') },
    { label: '打开设置', click: () => openOverlay('open-settings') },
    { label: '运行演示', click: () => sendCmd('run-demo') },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => toggleVisible());
}

/* ---- IPC seam --------------------------------------------------------- */
ipcMain.handle('sn:open-path', async (_e, p) => {
  if (!p) return;
  try {
    const target = path.normalize(String(p));
    if (!fs.existsSync(target)) return;
    const stat = fs.statSync(target);
    if (!stat.isDirectory() && BLOCKED_OPEN_EXTENSIONS.has(path.extname(target).toLowerCase())) {
      shell.showItemInFolder(target);
      return;
    }
    const res = await shell.openPath(target);
    if (res) shell.showItemInFolder(target); // fall back to reveal
  } catch (_) { /* ignore */ }
});
ipcMain.on('sn:move-dock', (_e, dock) => {
  currentDock = dock || 'bottom-right';
  if (win) { const b = dockBounds(currentDock); win.setPosition(b.x, b.y, true); }
});
ipcMain.on('sn:set-visible', (_e, v) => setVisible(!!v));
ipcMain.on('sn:require-attention', (_e, v) => { if (win && process.platform === 'win32') win.flashFrame(!!v); });
ipcMain.on('sn:quit', () => { app.isQuitting = true; app.quit(); });
// renderer asks to grow (panel/settings open) or shrink (all overlays closed)
ipcMain.on('sn:resize-mode', (_e, mode) => setWinMode(mode === 'panel' ? 'panel' : 'pet'));

/* ---- lifecycle -------------------------------------------------------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => setVisible(true));

  app.whenReady().then(async () => {
    await startServer();
    createWindow();
    startBridgeServer();
    buildTray();
    globalShortcut.register('CommandOrControl+Shift+N', toggleVisible);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
}
