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

const WIN_W = 340;
const WIN_H = 660;
const MARGIN = 12;

let win = null;
let tray = null;
let currentDock = 'bottom-right';
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

function dockBounds(dock) {
  const { workArea } = screen.getPrimaryDisplay();
  const right = workArea.x + workArea.width - WIN_W - MARGIN;
  const left = workArea.x + MARGIN;
  const bottom = workArea.y + workArea.height - WIN_H - MARGIN;
  const top = workArea.y + MARGIN;
  switch (dock) {
    case 'bottom-left': return { x: left, y: bottom };
    case 'sidebar-top': return { x: right, y: top };
    case 'bottom-right':
    default: return { x: right, y: bottom };
  }
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
  const pos = dockBounds(currentDock);
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
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
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏', click: () => toggleVisible() },
    { label: '运行演示', click: () => win && win.webContents.send('sn:command', 'run-demo') },
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
    const res = await shell.openPath(path.normalize(p));
    if (res) shell.showItemInFolder(path.normalize(p)); // fall back to reveal
  } catch (_) { /* ignore */ }
});
ipcMain.on('sn:move-dock', (_e, dock) => {
  currentDock = dock || 'bottom-right';
  if (win) { const b = dockBounds(currentDock); win.setPosition(b.x, b.y, true); }
});
ipcMain.on('sn:set-visible', (_e, v) => setVisible(!!v));
ipcMain.on('sn:require-attention', (_e, v) => { if (win && process.platform === 'win32') win.flashFrame(!!v); });
ipcMain.on('sn:quit', () => { app.isQuitting = true; app.quit(); });

/* ---- lifecycle -------------------------------------------------------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => setVisible(true));

  app.whenReady().then(async () => {
    await startServer();
    createWindow();
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
