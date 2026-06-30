/*
 * serve.js — minimal zero-dependency static server for the browser demo.
 *   node tools/serve.js  ->  http://localhost:4173/
 * Opens the renderer in demo mode (no Electron needed).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src', 'renderer');
const ASSETS = path.join(__dirname, '..', 'assets');
const PORT = process.env.PORT || 4173;

// Allow-list for the icon-capture tool (POST /__save-icon).
const SAVE_ALLOW = new Set(['icon.png', 'icon-512.png', 'tray.png']);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

http
  .createServer((req, res) => {
    // icon-capture sink: write a base64 PNG to assets/ (dev tool only)
    if (req.method === 'POST' && req.url === '/__save-icon') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const { name, dataUrl } = JSON.parse(body);
          if (!SAVE_ALLOW.has(name)) { res.writeHead(403); return res.end('name not allowed'); }
          const b64 = String(dataUrl).replace(/^data:image\/png;base64,/, '');
          fs.writeFileSync(path.join(ASSETS, name), Buffer.from(b64, 'base64'));
          res.writeHead(200); res.end('ok');
        } catch (e) {
          res.writeHead(400); res.end('bad request');
        }
      });
      return;
    }

    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(ROOT, path.normalize(urlPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log(`SuperNoNo demo: http://localhost:${PORT}/`);
  });
