// Writes PNGs of every World B scene/variant plus an icon sheet and an fx sheet.
//   node tools/beatbox_heroes/world_b_gallery.mjs /tmp/world_b_out [scale] [only-id]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..', 'beatbox_heroes');
for (const n of ['pix', 'font', 'catalog']) require(path.join(root, n + '.js'));
for (const n of ['world_a', 'world_b']) { try { require(path.join(root, n + '.js')); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; } }
const BBH = globalThis.BBH, World = BBH.World, Pix = BBH.Pix;
const out = process.argv[2] || '/tmp/world_b_out', scale = +(process.argv[3] || 2), only = process.argv[4];
fs.mkdirSync(out, { recursive: true });
const get = (id, v) => (World.scene ? World.scene(id, v) : World.builders[id](v));
const LIST = [['home', 'day'], ['home', 'night'], ['shop', 'day'], ['shop', 'night'], ['studio', 'day'], ['studio', 'night'], ['bar', 'night'],
  ['stage', 'pink'], ['stage', 'cyan'], ['stage', 'lime'], ['stage', 'gold'], ['creator', null]];
for (const [id, v] of LIST) {
  if (only && only !== id) continue;
  const t = Date.now(); const s = get(id, v); const ms = Date.now() - t;
  const p = s.layers[0].pix.clone();
  // debug overlay of spots (green), hotspots (cyan frames), lights (yellow crosses) when DEBUG=1
  if (process.env.DEBUG) {
    for (const k in s.spots) { const q = s.spots[k]; p.rect(q.x - 1, q.y - 1, 3, 3, '#00ff00'); p.vline(q.x, q.y - 64, 64, '#00ff0080'); BBH.Font.draw(p, k.slice(0, 5), q.x + 3, q.y - 8, '#00ff00'); }
    for (const h of s.hotspots) p.frame(h.x, h.y, h.w, h.h, '#00ffff');
    for (const l of s.lights) { p.rect(l.x - 1, l.y - 1, 3, 3, '#ffff00'); }
  }
  if (s.fg) p.blit(s.fg, 0, 0);
  fs.writeFileSync(path.join(out, id + (v ? '_' + v : '') + '.png'), p.png(scale));
  if (process.env.CROP) { // CROP=x,y,w,h writes <id>_crop.png at 4x
    const [cx, cy, cw, ch] = process.env.CROP.split(',').map(Number), q = new Pix(cw, ch); q.blit(p, -cx, -cy);
    fs.writeFileSync(path.join(out, id + '_crop.png'), q.png(4));
  }
  console.log(id, v || '-', ms + 'ms', 'floorY', s.floorY, 'lights', s.lights.length);
}
if (!only || only === 'icons') {
  const ic = World.iconNames.map((n) => World.icon(n));
  fs.writeFileSync(path.join(out, 'icons.png'), Pix.sheet(ic, 10, 3, '#2c1d4d').png(8));
}
if (!only || only === 'fx') {
  const list = [];
  for (const n of ['note', 'note2', 'star', 'heart', 'spark', 'ring', 'coin', 'confetti', 'puff', 'drop']) { const f = World.fx(n); (Array.isArray(f) ? f : [f]).forEach((x) => list.push(x)); }
  fs.writeFileSync(path.join(out, 'fx.png'), Pix.sheet(list, 8, 3, '#2c1d4d').png(8));
}
