// 3D clothing colours follow the 2D sprites (beatbox_heroes/park3d/char_wear.js vs chars_gear.js / chars_side2.js). Headless: the 2D sprites are drawn in node,
// the 3D characters are built on the CPU and their vertex colours read back per slot.
//   1. every top whose 2D sprite changes with color2 (front or side view) also changes in 3D, with a measurable share of its vertices in the accent colour,
//      and items whose sprite ignores color2 stay that way in 3D; 2. setLook recolours live (same character, new color2 and color);
//   3. flat decals carry the exact look colour in the same (linear) colour space as THREE.Color; 4. patterns produce several tones (flannel, hawaiian,
//      camo, kilt), fixed 2D details exist (track stripes, retro air window, soles per model); 5. every item stays within the triangle budget.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { ok, done, load } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..'), CH = path.join(REPO, 'beatbox_heroes', 'park3d', 'characters.js').replace(/\\/g, '/');
const req = createRequire(import.meta.url), esbuild = req(path.join(REPO, 'node_modules', 'esbuild'));
const BBH = load('pix', 'catalog', 'chars_body', 'chars_hair', 'chars_gear', 'chars_acc', 'chars_side', 'chars_side2', 'chars'), CAT = BBH.CATALOG, Chars = BBH.Chars;
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'wearcolor3d_test_'));
const watchdog = setTimeout(() => { console.error('FAIL: wearcolor3d suite hung'); process.exit(1); }, 240000);
await esbuild.build({ stdin: { contents: "export * from '" + CH + "'; export { THREE } from '" + CH.replace('characters.js', 'kit.js') + "';", resolveDir: REPO }, outfile: path.join(tmp, 'c.mjs'), bundle: true, format: 'esm', platform: 'node', logLevel: 'error' });
const M = await import(pathToFileURL(path.join(tmp, 'c.mjs')).href);
fs.rmSync(tmp, { recursive: true, force: true });
const { createCharacter, TRI_BUDGET, THREE } = M;
const clone = (o) => JSON.parse(JSON.stringify(o)), BASE = '#1d9bd1', ACC = '#ff6b35', ACC2 = '#8ac926';
const look = (o) => Object.assign(clone(CAT.DEFAULT_LOOK), { hat: { id: 'none' }, acc: {} }, o);

// vertex colours of one slot of the lit mesh (rgb triplets, linear)
function slotCols(c, name) {
  const g = c.object.getObjectByName('char_lit').geometry, Cl = g.attributes.color.array; let t = 0;
  for (const n of Object.keys(c.slotTris)) { if (n === name) return Cl.slice(t * 9, (t + c.slotTris[n]) * 9); t += c.slotTris[n]; }
  return new Float32Array(0);
}
// share of vertices whose chroma is nearer the accent than the base (brightness normalised: shading and lighten/darken keep the hue)
const nrm = (r, g, b) => { const m = Math.max(r, g, b, 1e-6); return [r / m, g / m, b / m]; };
function share(cols, hexA, hexB) {
  const a = nrm(...new THREE.Color(hexA).toArray()), b = nrm(...new THREE.Color(hexB).toArray()); let n = 0, k = 0;
  for (let i = 0; i < cols.length; i += 3) { const v = nrm(cols[i], cols[i + 1], cols[i + 2]), da = Math.hypot(v[0] - a[0], v[1] - a[1], v[2] - a[2]), db = Math.hypot(v[0] - b[0], v[1] - b[1], v[2] - b[2]); if (Math.max(cols[i], cols[i + 1], cols[i + 2]) > 0.02 && da < db && da < 0.35) k++; n++; }
  return n ? k / n : 0;
}
const has = (cols, hex, tol) => { const c = new THREE.Color(hex); for (let i = 0; i < cols.length; i += 3) if (Math.abs(cols[i] - c.r) < (tol || 2e-3) && Math.abs(cols[i + 1] - c.g) < (tol || 2e-3) && Math.abs(cols[i + 2] - c.b) < (tol || 2e-3)) return true; return false; };
// a lit (non flat) facet of that colour: the baked shading scales all three channels by about the same factor
const hasLit = (cols, hex) => { const c = new THREE.Color(hex); for (let i = 0; i < cols.length; i += 3) { const r = [cols[i] / c.r, cols[i + 1] / c.g, cols[i + 2] / c.b]; if (Math.min(...r) > 0.8 && Math.max(...r) < 1.3 && Math.max(...r) - Math.min(...r) < 0.1) return true; } return false; };
const tones = (cols) => { const s = new Set(); for (let i = 0; i < cols.length; i += 3) { const v = nrm(cols[i], cols[i + 1], cols[i + 2]); s.add(v.map((x) => Math.round(x * 6)).join()); } return s.size; };
const diff = (a, b) => { if (a.length !== b.length) return 1; let n = 0; for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 0.02) n++; return n / (a.length / 3); };
// does the 2D sprite use color2 for this top? (front idle or profile walk changes when only color2 changes)
const sprite2d = (L) => [Chars.render(Chars.fix(L), 'idle', 0, { frame: 0, blink: false }).hash(), Chars.render(Chars.fix(L), 'walkside', 0, { frame: 0, blink: false }).hash()].join();
const uses2 = (id) => sprite2d(look({ top: { id, color: BASE, color2: ACC } })) !== sprite2d(look({ top: { id, color: BASE, color2: ACC2 } }));

const hero = createCharacter({ quality: 'high' }, look({}));
let n2d = 0;
for (const it of CAT.TOPS) {
  const id = it.id, two = uses2(id); if (two) n2d++;
  hero.setLook(look({ top: { id, color: BASE, color2: ACC } })); const a = slotCols(hero, 'top'), sh = share(a, ACC, BASE), tA = hero.tris;
  hero.setLook(look({ top: { id, color: BASE, color2: ACC2 } })); const b = slotCols(hero, 'top'), d = diff(a, b);
  if (two) { ok(sh >= 0.015, 'top ' + id + ': the 2D sprite uses color2, so does the 3D top (' + (sh * 100).toFixed(1) + '% of its vertices in color2)'); ok(d >= 0.015, 'top ' + id + ': changing color2 recolours the 3D top (' + (d * 100).toFixed(1) + '% of vertices changed)'); }
  else ok(d === 0, 'top ' + id + ': the 2D sprite ignores color2 and so does the 3D top (' + (d * 100).toFixed(1) + '% changed)');
  ok(tA <= TRI_BUDGET && hero.tris <= TRI_BUDGET, 'top ' + id + ' within ' + TRI_BUDGET + ' tris (' + tA + ')');
  ok(hero.slotTris.top <= 700, 'top ' + id + ' slot stays small (' + hero.slotTris.top + ' tris)');
}
ok(n2d >= 18, 'the 2D sprites give most tops a color2 zone (' + n2d + ')');
// sleeves in color2 where the sprite draws them so (varsity, overalls, puffvest): the arms of the top slot are accent coloured
for (const id of ['varsity', 'overalls', 'puffvest']) { hero.setLook(look({ top: { id, color: BASE, color2: ACC } })); ok(share(slotCols(hero, 'top'), ACC, BASE) > 0.25, id + ': sleeves in color2 (' + (share(slotCols(hero, 'top'), ACC, BASE) * 100).toFixed(0) + '%)'); }

// 2. live recolour on one character: color and color2 both follow setLook
{
  const c = createCharacter({ quality: 'high' }, look({ top: { id: 'jersey', color: BASE, color2: ACC } })), a = slotCols(c, 'top');
  c.setLook(look({ top: { id: 'jersey', color: '#ff4fa3', color2: '#f4e04d' } })); const b = slotCols(c, 'top');
  ok(diff(a, b) > 0.9, 'setLook recolours the whole jersey (' + (diff(a, b) * 100).toFixed(0) + '%)'); ok(has(b, '#f4e04d') && !has(b, ACC), 'the number and trims take the new color2 and drop the old one');
  c.setLook(look({ top: { id: 'jersey', color: BASE, color2: ACC } })); ok(diff(a, slotCols(c, 'top')) === 0, 'going back restores the same colours');
  c.dispose();
}
// 3. flat decals carry the exact THREE.Color (linear) value of the hex the look stores
for (const [id, hex] of [['jersey', ACC], ['bbhtee', ACC], ['tux', ACC], ['oversized', ACC], ['varsity', '#f7f2e8']]) { hero.setLook(look({ top: { id, color: BASE, color2: ACC } })); ok(has(slotCols(hero, 'top'), hex), id + ': decal colour matches THREE.Color(' + hex + ')'); }

// 4. patterns and fixed 2D details
hero.setLook(look({ top: { id: 'flannel', color: BASE, color2: ACC } })); ok(tones(slotCols(hero, 'top')) >= 4, 'flannel checks give several tones (' + tones(slotCols(hero, 'top')) + ')');
hero.setLook(look({ top: { id: 'hawaiian', color: BASE, color2: ACC } })); ok(has(slotCols(hero, 'top'), '#3f9b5a'), 'hawaiian flowers carry green leaves');
hero.setLook(look({ bottom: { id: 'camo', color: '#2f5d3a' } })); ok(tones(slotCols(hero, 'bottom')) >= 3, 'camo has its blot tones (' + tones(slotCols(hero, 'bottom')) + ')');
hero.setLook(look({ top: { id: 'tank', color: BASE, color2: ACC }, bottom: { id: 'kilt', color: '#e63946' } })); ok(tones(slotCols(hero, 'bottom')) >= 3, 'kilt plaid has light and dark lines (' + tones(slotCols(hero, 'bottom')) + ')');
for (const id of ['trackpants', 'joggers', 'sweatpants']) { hero.setLook(look({ top: { id: 'croptop', color: BASE, color2: ACC }, bottom: { id, color: '#17141f' } })); ok(has(slotCols(hero, 'bottom'), '#f7f2e8', 0.02), id + ': cream side stripes like the sprite'); }
hero.setLook(look({ shoes: { id: 'retro', color: '#e63946' } })); ok(has(slotCols(hero, 'shoes'), '#9ad8ff'), 'retro: blue air window in the midsole');
// soles in the sprite's colour per model
const SOLE = { sneakers: '#f7f2e8', skate: '#e8d8a8', loafers: '#2a2236', boots: '#2a2236', combat: '#1c1826', timbs: '#e8d8b0', slides: '#ffffff', goldkicks: '#ffe56a' };
for (const id in SOLE) { hero.setLook(look({ shoes: { id, color: BASE } })); ok(hasLit(slotCols(hero, 'shoes'), SOLE[id]), id + ': sole colour from the sprite (' + SOLE[id] + ')'); }
// 5. budget for every bottom and shoe too, and their colour follows setLook
for (const [g, list] of [['bottom', CAT.BOTTOMS], ['shoes', CAT.SHOES]]) for (const it of list) {
  hero.setLook(look({ [g]: { id: it.id, color: BASE } })); const a = slotCols(hero, g === 'bottom' ? 'bottom' : 'shoes'); ok(hero.tris <= TRI_BUDGET, g + ' ' + it.id + ' within budget (' + hero.tris + ')');
  hero.setLook(look({ [g]: { id: it.id, color: '#ff4fa3' } })); ok(diff(a, slotCols(hero, g === 'bottom' ? 'bottom' : 'shoes')) > 0.2, g + ' ' + it.id + ' recolours with its colour');
}
clearTimeout(watchdog);
done();
