// Writes PNG review images of every World A scene/variant.  Usage: node tools/beatbox_heroes/world_a_gallery.mjs /tmp/world_a_out [filter] [scale]
// For each scene: <name>.png (composite, parallax scrolled to 0/360/720 side by side for street), <name>_dbg.png (hotspots, spots, lights).
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const R = path.join(here, '..', '..', 'beatbox_heroes');
for (const n of ['pix', 'font', 'world_a']) require(path.join(R, n + '.js'));
try { require(path.join(R, 'world_b.js')); } catch (e) { /* world_b is optional here */ }
const BBH = globalThis.BBH, { Pix } = BBH, World = BBH.World;
const out = process.argv[2] || '/tmp/world_a_out', filter = process.argv[3] || '', S = Number(process.argv[4] || 2);
fs.mkdirSync(out, { recursive: true });

function compose(sc, cam) {
  const view = new Pix(360, sc.h);
  for (const L of sc.layers) view.blit(L.pix, -Math.round(cam * L.speed), 0);
  return view;
}
function debug(sc, pix) {
  const d = pix.clone();
  for (const h of sc.hotspots) d.frame(h.x, h.y, h.w, h.h, '#2ee6ff');
  for (const [k, s] of Object.entries(sc.spots)) { d.line(s.x - 4, s.y, s.x + 4, s.y, '#ff3ea5'); d.line(s.x, s.y - 4, s.x, s.y, '#ff3ea5'); }
  for (const l of sc.lights) d.px(l.x, l.y, '#9dff4a');
  if (sc.floorY) d.hline(0, sc.floorY, d.w, '#ffe14d');
  return d;
}
function write(name, pix) { fs.writeFileSync(path.join(out, name + '.png'), pix.png(S)); }
const list = [['title'], ['street', 'day'], ['street', 'dusk'], ['street', 'night'], ['park', 'day'], ['park', 'dusk'], ['park', 'night']];
for (let i = 1; i <= 6; i++) list.push(['intro' + i]);
for (const [id, v] of list) {
  const name = id + (v ? '_' + v : '');
  if (filter && !name.includes(filter)) continue;
  const t0 = Date.now(); const sc = World.scene(id, v); const ms = Date.now() - t0;
  if (sc.w > 360) {
    const parts = [0, 360, 720].map((c) => { const v2 = compose(sc, c); if (sc.fg) v2.blit(sc.fg, -c, 0); return v2; });
    const wide = new Pix(360 * 3 + 4, parts[0].h); wide.fill('#ff00ff'); parts.forEach((p, i) => wide.blit(p, i * 362, 0));
    write(name, wide);
    // flat 810 view of the near layer over the mid layer (no parallax), for checking the door layout
    const flat = new Pix(sc.w, sc.h); for (const L of sc.layers) flat.blit(L.pix, L.speed === 1 ? 0 : 0, 0); if (sc.fg) flat.blit(sc.fg, 0, 0);
    write(name + '_flat', debug(sc, flat));
  } else {
    const v1 = compose(sc, 0); if (sc.fg) v1.blit(sc.fg, 0, 0);
    write(name, v1); write(name + '_dbg', debug(sc, v1));
  }
  console.log(name.padEnd(16), ms + 'ms', 'layers', sc.layers.length, 'lights', sc.lights.length);
}
if (!filter || 'logo'.includes(filter)) {
  const t0 = Date.now(), lg = World.logo(); console.log('logo', lg.w + 'x' + lg.h, (Date.now() - t0) + 'ms');
  const bg = new Pix(lg.w + 20, lg.h + 20); try { bg.blit(World.scene('title').layers[0].pix, -10, -10); } catch (e) { bg.fill('#6a3b8f'); } bg.blit(lg, 10, 10);
  write('logo_on_title', bg);
  const bg2 = new Pix(lg.w + 20, lg.h + 20); bg2.fill('#1f1536'); bg2.blit(lg, 10, 10); write('logo_dark', bg2);
}
