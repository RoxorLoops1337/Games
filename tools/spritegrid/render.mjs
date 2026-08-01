// spritegrid — validate + render char-grid pixel art to PNG.
//
// The games in this repo ship as single self-contained HTML files, so their
// art has to live as data inside the script. This tool is the authoring loop
// for that data: a sprite is a palette plus rows of characters, and this
// renders it to a PNG you can actually look at before wiring it into a game.
//
//   node tools/spritegrid/render.mjs art/cindercub.json --out /tmp/preview
//   node tools/spritegrid/render.mjs art/*.json --out /tmp/preview --sheet all.png
//
// A sprite file is either one sprite object or an array of them:
//   { "id": "cindercub", "palette": { "K": "#2b1728", ".": null },
//     "rows": ["................", ...] }
// '.' is always transparent and never needs a palette entry.
//
// Zero dependencies — PNG is written by hand (zlib is in node core) so this
// keeps working no matter what npm install left behind.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { basename, join } from 'node:path';

const TRANSPARENT = '.';

// ---------------------------------------------------------------- PNG writer
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** rgba: Uint8Array of w*h*4 → PNG buffer (8-bit RGBA, no interlace). */
export function encodePNG(rgba, w, h) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ validate
const hex = (s) => {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(s || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Throws with a precise message when a sprite is malformed. */
export function validate(sp, where = 'sprite') {
  const tag = `${where}${sp && sp.id ? ` (${sp.id})` : ''}`;
  if (!sp || typeof sp !== 'object') throw new Error(`${tag}: not an object`);
  if (!Array.isArray(sp.rows) || !sp.rows.length) throw new Error(`${tag}: missing rows[]`);
  const h = sp.rows.length;
  const w = sp.rows[0].length;
  if (sp.h && sp.h !== h) throw new Error(`${tag}: declared h=${sp.h} but has ${h} rows`);
  if (sp.w && sp.w !== w) throw new Error(`${tag}: declared w=${sp.w} but rows are ${w} wide`);
  sp.rows.forEach((r, i) => {
    if (typeof r !== 'string') throw new Error(`${tag}: row ${i} is not a string`);
    if (r.length !== w) throw new Error(`${tag}: row ${i} is ${r.length} chars, expected ${w}`);
  });
  const pal = sp.palette || {};
  for (const [k, v] of Object.entries(pal)) {
    if (k.length !== 1) throw new Error(`${tag}: palette key "${k}" must be a single character`);
    if (k !== TRANSPARENT && !hex(v)) throw new Error(`${tag}: palette["${k}"] = ${v} is not #rrggbb`);
  }
  const unknown = new Set();
  let filled = 0;
  for (const r of sp.rows) {
    for (const ch of r) {
      if (ch === TRANSPARENT || ch === ' ') continue;
      if (!pal[ch]) unknown.add(ch); else filled++;
    }
  }
  if (unknown.size) throw new Error(`${tag}: chars not in palette: ${[...unknown].join(' ')}`);
  if (!filled) throw new Error(`${tag}: sprite is empty`);
  return { w, h, filled };
}

// -------------------------------------------------------------------- render
/** Rasterise one sprite at `scale`, on a checker backdrop unless bg is given. */
export function raster(sp, scale = 8, bg = null) {
  const { w, h } = validate(sp);
  const W = w * scale, H = h * scale;
  const out = new Uint8Array(W * H * 4);
  const bgc = bg ? hex(bg) : null;
  const pal = {};
  for (const [k, v] of Object.entries(sp.palette || {})) if (k !== TRANSPARENT) pal[k] = hex(v);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = sp.rows[(y / scale) | 0][(x / scale) | 0];
      const c = ch === TRANSPARENT || ch === ' ' ? null : pal[ch];
      const i = (y * W + x) * 4;
      if (c) {
        out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
      } else if (bgc) {
        out[i] = bgc[0]; out[i + 1] = bgc[1]; out[i + 2] = bgc[2]; out[i + 3] = 255;
      } else {
        // Checkerboard so transparent pixels read as transparent, not as white.
        const t = (((x / scale) | 0) + ((y / scale) | 0)) % 2 ? 58 : 44;
        out[i] = t; out[i + 1] = t; out[i + 2] = t + 6; out[i + 3] = 255;
      }
    }
  }
  return { data: out, W, H };
}

/** Tile many sprites into one contact sheet image. */
export function sheet(sprites, scale = 6, cols = 0) {
  const cellW = Math.max(...sprites.map((s) => s.rows[0].length)) * scale + scale * 2;
  const cellH = Math.max(...sprites.map((s) => s.rows.length)) * scale + scale * 2;
  const n = sprites.length;
  const C = cols || Math.min(6, Math.ceil(Math.sqrt(n)));
  const R = Math.ceil(n / C);
  const W = C * cellW, H = R * cellH;
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 24; out[i + 1] = 22; out[i + 2] = 32; out[i + 3] = 255;
  }
  sprites.forEach((sp, i) => {
    const { data, W: sw, H: sh } = raster(sp, scale, '#181620');
    const ox = (i % C) * cellW + ((cellW - sw) >> 1);
    const oy = ((i / C) | 0) * cellH + ((cellH - sh) >> 1);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const s = (y * sw + x) * 4;
        // Skip backdrop pixels so cells blend into the sheet background.
        if (data[s] === 24 && data[s + 1] === 22 && data[s + 2] === 32) continue;
        const d = ((oy + y) * W + ox + x) * 4;
        out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = 255;
      }
    }
  });
  return { data: out, W, H };
}

const loadFile = (f) => {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const list = Array.isArray(j) ? j : Array.isArray(j.sprites) ? j.sprites : [j];
  list.forEach((sp, i) => {
    validate(sp, `${basename(f)}[${i}]`);
    if (!sp.id) sp.id = `${basename(f).replace(/\.json$/, '')}${list.length > 1 ? `_${i}` : ''}`;
  });
  return list;
};

// ---------------------------------------------------------------------- main
if (process.argv[1] && process.argv[1].endsWith('render.mjs')) {
  const args = process.argv.slice(2);
  const opts = {};
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      opts[key] = val;
    } else files.push(args[i]);
  }
  const flag = (name, dflt) => (name in opts ? opts[name] : dflt);
  if (!files.length) {
    console.error('usage: node tools/spritegrid/render.mjs <sprite.json...> [--out dir] [--scale 8] [--sheet name.png] [--bg #181620]');
    process.exit(2);
  }
  const outDir = flag('out', join('/tmp', 'spritegrid'));
  const scale = +flag('scale', 8);
  const bg = flag('bg', null);
  mkdirSync(outDir, { recursive: true });

  const all = [];
  for (const f of files) {
    for (const sp of loadFile(f)) {
      all.push(sp);
      const { data, W, H } = raster(sp, scale, bg);
      const p = join(outDir, `${sp.id}.png`);
      writeFileSync(p, encodePNG(data, W, H));
      console.log(`ok  ${sp.id.padEnd(16)} ${sp.rows[0].length}x${sp.rows.length}  →  ${p}`);
    }
  }
  const sheetName = flag('sheet', null);
  if (sheetName && all.length > 1) {
    const { data, W, H } = sheet(all, Math.max(3, Math.round(scale * 0.75)));
    const p = join(outDir, sheetName);
    writeFileSync(p, encodePNG(data, W, H));
    console.log(`sheet ${all.length} sprites → ${p}`);
  }
}
