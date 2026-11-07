#!/usr/bin/env node
// Magenta (#FF00FF) background removal for Graftwork art, pure Node (no PIL, no sharp).
// Usage: node tools/graftwork_chroma.mjs in.png out.png [in2.png out2.png ...]
// Flood-fills from the image border over magenta-ish pixels (so magenta-ish pixels inside the art are kept),
// then feathers and despills a 2 px rim. Output is RGBA PNG at the input size (8-bit RGB/RGBA input only).
import fs from 'node:fs';
import zlib from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function decode(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12] !== 0) throw new Error('need 8-bit non-interlaced'); }
    if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  if (ct !== 2 && ct !== 6) throw new Error('need RGB or RGBA, got color type ' + ct);
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2]; out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    [prev, cur] = [cur, prev];
  }
  return { w, h, px: out };
}
export function encode(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
const mag = (r, g, b) => Math.min(r, b) - g; // how magenta a pixel is
const isBg = (r, g, b) => r > 150 && b > 150 && g < 120 && mag(r, g, b) > 90;

export function key(inFile, outFile) {
  const { w, h, px } = decode(fs.readFileSync(inFile));
  const bg = new Uint8Array(w * h), q = new Int32Array(w * h); let qh = 0, qt = 0;
  const seed = (x, y) => { const i = y * w + x; if (!bg[i] && isBg(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])) { bg[i] = 1; q[qt++] = i; } };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  // enclosed pockets (gaps in pipes, lamps): near-pure magenta anywhere is background too
  for (let i = 0; i < w * h; i++) { const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]; if (!bg[i] && r > 215 && b > 215 && g < 70) { bg[i] = 1; q[qt++] = i; } }
  while (qh < qt) {
    const i = q[qh++], x = i % w, y = (i / w) | 0;
    if (x > 0) seed(x - 1, y); if (x < w - 1) seed(x + 1, y); if (y > 0) seed(x, y - 1); if (y < h - 1) seed(x, y + 1);
  }
  // distance to bg up to 2 px: feather + despill
  const near = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (bg[i]) near[i] = 0; else {
    const x = i % w, y = (i / w) | 0; let d = 9;
    for (let dy = -2; dy <= 2 && d > 1; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      if (bg[yy * w + xx]) { d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy))); }
    }
    near[i] = d;
  }
  let removed = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (bg[i]) { px[o] = px[o + 1] = px[o + 2] = px[o + 3] = 0; removed++; continue; }
    if (near[i] <= 2) {
      const r = px[o], g = px[o + 1], b = px[o + 2], m = mag(r, g, b);
      if (m > 12) {
        const a = Math.max(0, Math.min(1, 1 - (m - 12) / 100));
        const s = Math.max(0, Math.min(r, b) - g);
        px[o] = Math.max(0, r - s); px[o + 2] = Math.max(0, b - s); px[o + 3] = Math.round(255 * Math.max(a, 0.35));
      }
    }
  }
  fs.writeFileSync(outFile, encode(w, h, px));
  return { w, h, removedPct: +(100 * removed / (w * h)).toFixed(1) };
}

if (process.argv[1] && process.argv[1].endsWith('graftwork_chroma.mjs')) {
  const a = process.argv.slice(2);
  if (a.length < 2 || a.length % 2) { console.error('usage: node tools/graftwork_chroma.mjs in.png out.png [in2 out2 ...]'); process.exit(1); }
  for (let i = 0; i < a.length; i += 2) console.log(a[i], '->', a[i + 1], key(a[i], a[i + 1]));
}
