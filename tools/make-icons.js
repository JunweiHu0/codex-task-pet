/*
 * make-icons.js — procedurally renders the SuperNoNo app/tray icons as PNGs.
 *
 * Zero dependencies: it draws the pet (silver capsule body, dark face, cyan
 * eyes + glowing energy core) into a supersampled RGBA buffer, box-downsamples
 * for anti-aliasing, and writes valid PNGs with a tiny built-in encoder.
 *
 *   node tools/make-icons.js
 *   -> assets/icon.png (256), assets/icon-512.png (512), assets/tray.png (32)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- tiny PNG encoder ------------------------------------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // 10,11,12 = compression/filter/interlace = 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- drawing helpers (supersampled space) ----------------------- */
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

function insideRoundRect(px, py, x, y, w, h, r) {
  const minx = x + r, maxx = x + w - r, miny = y + r, maxy = y + h - r;
  if (px >= x && px <= x + w && py >= miny && py <= maxy) return true;
  if (px >= minx && px <= maxx && py >= y && py <= y + h) return true;
  const corners = [[minx, miny], [maxx, miny], [minx, maxy], [maxx, maxy]];
  for (const [cx, cy] of corners) {
    if (px <= (cx === minx ? minx : cx) && py <= (cy === miny ? miny : cy)) { /* noop */ }
  }
  // explicit corner circle test
  for (const [cx, cy] of corners) {
    const dx = px - cx, dy = py - cy;
    if (dx * dx + dy * dy <= r * r) {
      // only count the outer quadrant
      const outerX = (cx === minx && px < minx) || (cx === maxx && px > maxx);
      const outerY = (cy === miny && py < miny) || (cy === maxy && py > maxy);
      if (outerX && outerY) return true;
    }
  }
  return false;
}

/** Render the pet at a given output size (with internal supersampling). */
function renderIcon(size) {
  const SS = 4;
  const S = size * SS;
  const big = Buffer.alloc(S * S * 4); // transparent

  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    const ia = a / 255;
    big[i] = Math.round(lerp(big[i], r, ia));
    big[i + 1] = Math.round(lerp(big[i + 1], g, ia));
    big[i + 2] = Math.round(lerp(big[i + 2], b, ia));
    big[i + 3] = Math.max(big[i + 3], Math.round(a));
  };

  // geometry in 0..S space
  const cx = S / 2;
  const bodyW = S * 0.5, bodyH = S * 0.72;
  const bodyX = cx - bodyW / 2, bodyY = S * 0.16, bodyR = bodyW / 2;
  const faceW = S * 0.38, faceH = S * 0.27;
  const faceX = cx - faceW / 2, faceY = S * 0.27, faceR = faceW * 0.28;
  const coreX = cx, coreY = S * 0.66, coreR = S * 0.10;
  const tipX = cx, tipY = S * 0.10, tipR = S * 0.035;

  const CYAN = [63, 211, 230];
  const CYAN_HI = [180, 245, 252];

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // antenna stalk
      if (Math.abs(x - cx) < S * 0.008 && y > S * 0.10 && y < bodyY + 4) put(x, y, 174, 183, 196, 255);

      // body with vertical silver gradient
      if (insideRoundRect(x, y, bodyX, bodyY, bodyW, bodyH, bodyR)) {
        const t = clamp01((y - bodyY) / bodyH);
        const r = Math.round(lerp(255, 199, t));
        const g = Math.round(lerp(255, 206, t));
        const b = Math.round(lerp(255, 216, t));
        put(x, y, r, g, b, 255);
        // soft rim
        const edge = 1; // body outline handled by AA
        if (edge) { /* keep */ }
      }
    }
  }

  // top gloss
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - (cx - bodyW * 0.16)) / (bodyW * 0.22);
      const dy = (y - (bodyY + bodyH * 0.12)) / (bodyH * 0.07);
      if (dx * dx + dy * dy < 1 && insideRoundRect(x, y, bodyX, bodyY, bodyW, bodyH, bodyR)) put(x, y, 255, 255, 255, 120);
    }
  }

  // face
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (insideRoundRect(x, y, faceX, faceY, faceW, faceH, faceR)) put(x, y, 16, 20, 29, 255);
    }
  }

  // eyes (rounded bars)
  const eyeW = faceW * 0.16, eyeH = faceH * 0.5, eyeR = eyeW / 2;
  const eyeY = faceY + faceH * 0.26;
  const eyeLX = cx - faceW * 0.2 - eyeW / 2;
  const eyeRX = cx + faceW * 0.2 - eyeW / 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (insideRoundRect(x, y, eyeLX, eyeY, eyeW, eyeH, eyeR) || insideRoundRect(x, y, eyeRX, eyeY, eyeW, eyeH, eyeR)) {
        put(x, y, CYAN_HI[0], CYAN_HI[1], CYAN_HI[2], 255);
      }
    }
  }

  // glowing energy core (radial: white center -> cyan -> transparent halo)
  const haloR = coreR * 2.1;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - coreX, y - coreY);
      if (d <= haloR) {
        if (d <= coreR) {
          const t = clamp01(d / coreR);
          const r = Math.round(lerp(255, CYAN[0], t));
          const g = Math.round(lerp(255, CYAN[1], t));
          const b = Math.round(lerp(255, CYAN[2], t));
          put(x, y, r, g, b, 255);
        } else {
          const t = clamp01((d - coreR) / (haloR - coreR));
          put(x, y, CYAN[0], CYAN[1], CYAN[2], Math.round(150 * (1 - t)));
        }
      }
    }
  }

  // antenna tip glow
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - tipX, y - tipY);
      if (d <= tipR * 2) {
        const a = d <= tipR ? 255 : Math.round(160 * (1 - (d - tipR) / tipR));
        put(x, y, CYAN[0], CYAN[1], CYAN[2], a);
      }
    }
  }

  // box-downsample SS x SS -> size
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          r += big[i]; g += big[i + 1]; b += big[i + 2]; a += big[i + 3];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

/* ---------- write outputs --------------------------------------------- */
const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

// NOTE: the shipped app/tray icons (assets/icon*.png, tray.png) are now the
// real Live2D NoNo captured via src/renderer/_capture.html. This script only
// regenerates the *original SVG mascot* brand variant, under separate names,
// so it can never clobber the NoNo icons.
const targets = [
  { name: 'brand-svg-256.png', size: 256 },
  { name: 'brand-svg-512.png', size: 512 },
];
for (const t of targets) {
  const rgba = renderIcon(t.size);
  const png = encodePNG(t.size, t.size, rgba);
  fs.writeFileSync(path.join(outDir, t.name), png);
  console.log('wrote', path.join('assets', t.name), `(${t.size}x${t.size}, ${png.length} bytes)`);
}
console.log('done.');
