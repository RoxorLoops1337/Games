// 3D colour zones of hats, glasses, accessories and dyed hair tips (beatbox_heroes/park3d/char_hair.js, char_gear.js) against the 2D sprites (chars_hair.js, chars_acc.js):
// every zone the 2D paints in a colour of its own shows up in the 3D vertex colours (a measurable share of the slot's vertices), in the colour the 2D derives
// (the 2D's own mix() is used for the expected colours); look.<item>.color2 recolours the accent zone live through setLook; triangle budgets hold.
// Contact sheets of the same items, 2D next to 3D: node tools/beatbox_heroes/gearcolor_gallery.mjs /tmp/gearcolor
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { ok, done, load } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..'), P3 = path.join(REPO, 'beatbox_heroes', 'park3d').replace(/\\/g, '/');
const req = createRequire(import.meta.url), esbuild = req(path.join(REPO, 'node_modules', 'esbuild')), tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'gearcolor3d_'));
const watchdog = setTimeout(() => { console.error('FAIL: gearcolor3d suite hung'); process.exit(1); }, 240000);
await esbuild.build({ stdin: { contents: "export * from '" + P3 + "/characters.js'; export { HAT_ACCENT } from '" + P3 + "/char_hair.js';", resolveDir: REPO }, outfile: path.join(tmp, 'chars.mjs'), bundle: true, format: 'esm', platform: 'node', logLevel: 'error' });
const M = await import(pathToFileURL(path.join(tmp, 'chars.mjs')).href); fs.rmSync(tmp, { recursive: true, force: true });
const BBH = load('pix', 'catalog'), CAT = BBH.CATALOG, mix2 = BBH.mix;
const { createCharacter, TRI_BUDGET, HAT_ACCENT } = M;
const errs = [], origErr = console.error; console.error = (...a) => { errs.push(a.join(' ').slice(0, 200)); origErr(...a); };
const ch = createCharacter({ quality: 'high' }, CAT.DEFAULT_LOOK);
const SLOTS = ['head', 'face', 'facial', 'arms', 'legs', 'midriff', 'top', 'bottom', 'shoes', 'hair', 'hat', 'glasses', 'acc'];
const base = (o) => Object.assign({ body: 'neutral', skin: '#c68b5e', hair: { style: 'crop', color: '#2a2024' }, top: { id: 'tee', color: '#b8b8c8', color2: '#6b6b80' }, bottom: { id: 'jeans', color: '#34303f' }, shoes: { id: 'sneakers' }, hat: { id: 'none' }, glasses: { id: 'none' }, acc: {} }, o);
// vertex colours (linear, as baked) of one slot of the lit mesh, or of the whole glow mesh
const lin = (hex) => [1, 3, 5].map((k) => { const v = parseInt(hex.slice(k, k + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
function cols(slot) {
  const lit = ch.object.getObjectByName(slot === 'glow' ? 'char_glow' : 'char_lit').geometry, A = lit.attributes.color ? lit.attributes.color.array : new Float32Array(0);
  if (slot === 'glow') return A;
  let t = 0; for (const n of SLOTS) { const k = ch.slotTris[n] || 0; if (n === slot) return A.subarray(t * 9, (t + k) * 9); t += k; } return new Float32Array(0);
}
// a vertex matches a target colour when it is the target scaled by a light bake or a shade (0.5 to 1.4) within 12 % (hue and saturation kept)
const match = (c, i, T) => { const tt = T[0] * T[0] + T[1] * T[1] + T[2] * T[2] || 1e-9, k = (c[i] * T[0] + c[i + 1] * T[1] + c[i + 2] * T[2]) / tt; if (k < 0.5 || k > 1.4) return false; const dx = c[i] - k * T[0], dy = c[i + 1] - k * T[1], dz = c[i + 2] - k * T[2]; return Math.hypot(dx, dy, dz) <= 0.12 * k * Math.sqrt(tt) + 0.004; };
const share = (slot, hex) => { const c = cols(slot), T = lin(hex); let n = 0; for (let i = 0; i < c.length; i += 3) if (match(c, i, T)) n++; return c.length ? n / (c.length / 3) : 0; };
const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
const fails = {}, fail = (k, m) => { (fails[k] = fails[k] || []).push(m); }, report = (k, msg) => ok(!fails[k], msg + (fails[k] ? ' (' + fails[k].length + '): ' + fails[k].slice(0, 6).join(' | ') : ''));
const C2 = '#ffb703', C2B = '#2ee6ff', COL = '#3a5fcd', MIN = 0.01;
let maxTris = 0; const budget = (tag) => { maxTris = Math.max(maxTris, ch.tris); if (ch.tris > TRI_BUDGET) fail('budget', tag + ' ' + ch.tris); };

// ------------------------------------------------------------------ 1. hats: the 2D zone colours, then color2 on the accent zone
// expected zone colour per hat for a hat colour c, as chars_hair.js HAT.* paints it
const W = '#ffffff', HAT_ZONE = {
  cap: (c) => mix2(c, W, 0.3), capback: () => '#e8d28a', fitted: () => '#ffe14d', snapback: (c) => mix2(c, W, 0.28), trucker: (c) => mix2(c, '#e8e0f0', 0.5), beanie: (c) => mix2(c, W, 0.3),
  bandana: (c) => mix2(c, W, 0.6), headband: (c) => mix2(c, W, 0.35), fedora: (c) => mix2(c, '#120d1f', 0.45), cowboy: (c) => mix2(c, '#120d1f', 0.5), tophat: () => '#c42a45', catears: () => '#ff7ab6',
  crown: (c) => c, visor: (c) => mix2(c, '#2ee6ff', 0.45), wizard: (c) => mix2(c, '#ffe14d', 0.7), pirate: () => '#fff2dc', hood: () => '#f7f2e8', bucket: () => '#cfd3e6', durag: (c) => mix2(c, '#000000', 0.2),
  bucketfur: (c) => mix2(c, '#fff6ea', 0.28),
};
const HATS = CAT.HATS.map((h) => h.id).filter((h) => h !== 'none');
ok(Object.keys(HAT_ZONE).every((h) => HATS.indexOf(h) >= 0), 'every hat with a 2D colour zone is a catalog hat');
for (const id of HATS) for (const col of [COL, '#e63946', '#17141f']) {
  const L = (c2) => base({ hair: { style: 'crop' }, hat: Object.assign({ id, color: col }, c2 ? { color2: c2 } : {}) }); ch.setLook(L()); budget(id);
  if (ch.slotTris.hat > 240) fail('hatcap', id + ' ' + ch.slotTris.hat);
  if (HAT_ZONE[id]) { const z = HAT_ZONE[id](col), s = share('hat', z); if (s < MIN) fail('hatzone', id + ' ' + col + ' zone ' + z + ' share ' + s.toFixed(3)); }
  if (col !== COL || !HAT_ACCENT[id]) continue;
  const a = Float32Array.from(cols('hat')); ch.setLook(L(C2)); budget(id + ' c2'); const s2 = share('hat', C2); if (s2 < MIN) fail('hatc2', id + ' color2 share ' + s2.toFixed(3));
  if (ch.slotTris.hat > 240) fail('hatcap', id + ' c2 ' + ch.slotTris.hat);
  const b = Float32Array.from(cols('hat')); ch.setLook(L(C2B)); const c = Float32Array.from(cols('hat')); if (same(a, b) || same(b, c)) fail('hatlive', id);
}
ok(Object.keys(HAT_ACCENT).filter((h) => HATS.indexOf(h) >= 0).length >= 20, 'HAT_ACCENT names an accent zone for the hats (' + Object.keys(HAT_ACCENT).length + ')');
report('hatzone', 'every hat shows the colour zones of its 2D sprite');
report('hatc2', 'hat color2 recolours a measurable share of the hat (accent zone)');
report('hatlive', 'changing hat color2 through setLook changes the hat mesh');
report('hatcap', 'hats stay under their triangle cap (240)');
// the 2D draws a black hat black: no grey lift on a near-black dome
for (const id of ['bucket', 'beanie', 'fedora', 'cap']) { ch.setLook(base({ hat: { id, color: '#17141f' } })); const c = cols('hat'), L = []; for (let i = 0; i < c.length; i += 3) L.push(0.2126 * c[i] + 0.7152 * c[i + 1] + 0.0722 * c[i + 2]); L.sort((a, b) => a - b); const md = L[L.length >> 1]; ok(md < 0.03, 'a black ' + id + ' stays dark (median linear luminance ' + md.toFixed(4) + ')'); }

// ------------------------------------------------------------------ 2. glasses
// lens tints the 2D fixes (dark shades, teal aviators, blue goggles, amber gold rounds) and lenses that take the frame colour (heart, star, sport mirror, pixel, monocle, vr plate, eyepatch)
const FIXED = { shades: '#14102a', wayfarer: '#14102a', aviator: '#9fd0c8', goggles: '#7ad8ff', gold_round: '#e8a54a', oversized: '#0f0c1e' }, OWN = ['heart', 'star', 'sport', 'pixel', 'monocle', 'vr', 'eyepatch', 'round', 'nerd', 'neonbar'];
for (const id of Object.keys(FIXED)) { ch.setLook(base({ glasses: { id, color: '#e63946' } })); budget(id); const s = share('glasses', FIXED[id]); if (s < MIN) fail('lens', id + ' ' + FIXED[id] + ' ' + s.toFixed(3)); }
for (const id of OWN) { ch.setLook(base({ glasses: { id, color: '#e63946' } })); const s = share('glasses', '#e63946') + share('glow', '#e63946'); if (s < 0.04) fail('own', id + ' ' + s.toFixed(3)); }
report('lens', 'glasses lenses carry the 2D lens tints'); report('own', 'glasses drawn in their colour in 2D are that colour in 3D');
// chrome shield: the 2D ignores the colour (a fixed chrome gradient)
{ ch.setLook(base({ glasses: { id: 'chromeshield', color: '#e63946' } })); const a = Float32Array.from(cols('glasses')); ch.setLook(base({ glasses: { id: 'chromeshield', color: '#2a9d8f' } })); ok(same(a, cols('glasses')), 'the chrome shield is chrome whatever its colour (as in 2D)'); }
for (const id of ['shades', 'aviator', 'heart', 'goggles', 'gold_round', 'vr', 'pixel', 'chromeshield', 'oversized']) {
  const L = (c2) => base({ glasses: { id, color: COL, color2: c2 } }); ch.setLook(L(C2)); const s = share('glasses', C2) + share('glow', C2), a = Array.from(cols('glasses')).concat(Array.from(cols('glow')));
  ch.setLook(L(C2B)); const b = Array.from(cols('glasses')).concat(Array.from(cols('glow'))); if (s < MIN) fail('glc2', id + ' ' + s.toFixed(3)); if (same(a, b)) fail('glc2', id + ' unchanged');
}
report('glc2', 'glasses color2 tints the lens (or glints), live');

// ------------------------------------------------------------------ 3. accessories
// [slot, id, look colour, expected 2D zone colour] for zones the 2D draws in a colour of their own
const AZ = [['neck', 'dogtags', '#e63946', '#c9d3e6'], ['neck', 'dogtags', '#e63946', '#e63946'], ['neck', 'cubanchain', '#e63946', mix2('#e63946', '#e8b923', 0.5)], ['neck', 'cubanchain', '#e63946', '#d8f4ff'], ['neck', 'scarf', '#e63946', mix2('#e63946', W, 0.55)],
  ['neck', 'medal', '#e63946', '#3a5fcd'], ['neck', 'medal', '#2a9d8f', '#e63946'], ['neck', 'lanyard', '#2a9d8f', '#f7f2e8'], ['neck', 'hpneck', '#e63946', '#e63946'], ['neck', 'hpneck', '#e63946', mix2('#e63946', '#17141f', 0.6)],
  ['ears', 'hpears', '#e63946', mix2('#e63946', '#17141f', 0.55)], ['wrist', 'stackedbands', '#7b4fe0', '#7b4fe0'], ['wrist', 'stackedbands', '#7b4fe0', '#ffe14d'], ['wrist', 'stackedbands', '#7b4fe0', '#2ee6ff'], ['wrist', 'bracelets', '#7b4fe0', '#ffe14d'],
  ['wrist', 'icedwatch', '#7b4fe0', '#e8b923'], ['hand', 'boombox', '#e63946', '#9dff4a'], ['hand', 'neonmic', '#ff3ea5', '#ff3ea5'], ['back', 'backpack', '#e63946', '#cfd3e6']];
for (const [slot, id, col, z] of AZ) { ch.setLook(base({ acc: { [slot]: { id, color: col } } })); budget(id); const s = share('acc', z) + share('glow', z); if (s < MIN * 0.6) fail('acczone', id + ' ' + z + ' ' + s.toFixed(3)); }
report('acczone', 'accessories show the colour zones of their 2D sprite');
{ ch.setLook(base({ acc: { back: { id: 'wings', color: '#7b4fe0' } } })); ok(share('glow', '#7b4fe0') > 0.1, 'neon wings glow in their colour (2D)'); }
const AC2 = [['neck', 'medal'], ['neck', 'lanyard'], ['neck', 'cubanchain'], ['neck', 'scarf'], ['neck', 'bowtie'], ['neck', 'hpneck'], ['ears', 'hpears'], ['wrist', 'watch'], ['wrist', 'bracelets'], ['hand', 'neonmic'], ['back', 'backpack'], ['back', 'wings'], ['back', 'crossbody']];
for (const [slot, id] of AC2) {
  const L = (c2) => base({ acc: { [slot]: { id, color: COL, color2: c2 } } }); ch.setLook(L(C2)); budget(id + ' c2'); const s = share('acc', C2) + share('glow', C2), a = Array.from(cols('acc')).concat(Array.from(cols('glow')));
  ch.setLook(L(C2B)); const b = Array.from(cols('acc')).concat(Array.from(cols('glow'))); if (s < MIN * 0.5) fail('accc2', id + ' ' + s.toFixed(3)); if (same(a, b)) fail('accc2', id + ' unchanged');
}
report('accc2', 'accessory color2 recolours its accent zone, live');

// ------------------------------------------------------------------ 4. dyed hair tips (2D paints look.hair.tip on every style but the buzz)
const TIP = '#2ee6ff';
for (const hs of CAT.HAIR_STYLES.map((h) => h.id).filter((h) => h !== 'bald' && h !== 'buzz')) {
  ch.setLook(base({ hair: { style: hs, color: '#3b2418', tip: TIP } })); budget(hs); const s = share('hair', TIP), a = Float32Array.from(cols('hair'));
  if (ch.slotTris.hair > 380) fail('haircap', hs + ' ' + ch.slotTris.hair);
  ch.setLook(base({ hair: { style: hs, color: '#3b2418', tip: '#ff3ea5' } })); const b = Float32Array.from(cols('hair'));
  if (s < 0.04) fail('tip', hs + ' ' + s.toFixed(3)); if (same(a, b)) fail('tiplive', hs);
}
report('tip', 'every hair style shows its dyed tips (share of tip coloured vertices)'); report('tiplive', 'changing the tip colour changes the hair mesh'); report('haircap', 'hair stays under its triangle cap with tips');
{ ch.setLook(base({ hair: { style: 'flame', color: '#d6203f' } })); ok(share('hair', mix2('#d6203f', '#ffe14d', 0.8)) > 0.02, 'flame hair burns yellow at the tips without a tip colour (2D default)'); }

// ------------------------------------------------------------------ 5. budgets: the heaviest colour zones together
for (const body of ['boy', 'girl', 'neutral']) for (const [hat, gl] of [['cowboy', 'vr'], ['wizard', 'goggles'], ['bandana', 'gold_round'], ['hood', 'pixel']]) {
  ch.setLook(base({ body, hair: { style: 'locs', color: '#3b2418', tip: TIP }, top: { id: 'hoodie' }, hat: { id: hat, color: COL, color2: C2 }, glasses: { id: gl, color: COL, color2: C2 }, acc: { neck: { id: 'cubanchain', color2: C2 }, ears: { id: 'hpears', color2: C2 }, wrist: { id: 'stackedbands' }, back: { id: 'backpack', color2: C2 }, hand: { id: 'boombox' } } }));
  budget(body + ' ' + hat + ' ' + gl);
}
report('budget', 'every look stays within TRI_BUDGET ' + TRI_BUDGET + ' (largest ' + maxTris + ')');
ok(!errs.some((e) => /\[characters\]/.test(e)), 'no slot builder threw (' + errs.filter((e) => /\[characters\]/.test(e)).slice(0, 2).join(' | ') + ')');
clearTimeout(watchdog);
done();
