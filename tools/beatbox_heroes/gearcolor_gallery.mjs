// Colour zone contact sheets: every hat, glasses and accessory (and dyed hair tips) as the 2D sprite next to the 3D model, same look colours, three combos per item
// (a mid colour, a very dark colour, and a colour plus a very different color2). Each row: 2D, 3D front, 3D 3/4 for every combo.
//   node tools/beatbox_heroes/gearcolor_gallery.mjs <outDir> [hats glasses acc hair]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadChars, render, sheet, VIEWS } from './hair_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..', '..', 'beatbox_heroes'), req = createRequire(import.meta.url);
for (const n of ['pix', 'catalog', 'chars_body', 'chars_hair', 'chars_gear', 'chars_acc', 'chars_side', 'chars_side2', 'chars']) req(path.join(ROOT, n + '.js'));
const { CATALOG: CAT, Chars } = globalThis.BBH;
const out = process.argv[2] || '/tmp/gearcolor', only = process.argv.slice(3), want = (n) => !only.length || only.indexOf(n) >= 0;
fs.mkdirSync(out, { recursive: true });
const M = await loadChars(), ch = M.createCharacter({ quality: 'high' }, CAT.DEFAULT_LOOK), SZ = 128, BG = [44, 29, 77];
const COMBOS = [{ color: '#e63946' }, { color: '#17141f' }, { color: '#3a5fcd', color2: '#ffb703' }];
const base = () => ({ body: 'neutral', skin: '#c68b5e', hair: { style: 'crop', color: '#2a2024', tip: null }, eyes: { style: 'round', color: '#4a2c1a' }, brows: 'soft', facial: 'none', marks: [], top: { id: 'tee', color: '#b8b8c8', color2: '#6b6b80' }, bottom: { id: 'jeans', color: '#34303f' }, shoes: { id: 'sneakers', color: '#f7f2e8' }, hat: { id: 'none', color: '#17141f' }, glasses: { id: 'none', color: '#17141f' }, acc: { neck: { id: 'none_neck', color: '#d4a017' }, ears: { id: 'none_ears', color: '#d4a017' }, back: { id: 'none_back', color: '#6b6b80' }, hand: { id: 'none_hand', color: '#6b6b80' }, wrist: { id: 'none_wrist', color: '#2ee6ff' } } });
// a 2D Pix scaled (nearest) into an SZ x SZ cell over the background
function cell2d(px) {
  const img = new Uint8ClampedArray(SZ * SZ * 4), k = Math.min(SZ / px.w, SZ / px.h), ox = (SZ - px.w * k) / 2, oy = (SZ - px.h * k) / 2;
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
    const sx = Math.floor((x - ox) / k), sy = Math.floor((y - oy) / k), d = (y * SZ + x) * 4; let r = BG[0], g = BG[1], b = BG[2];
    if (sx >= 0 && sy >= 0 && sx < px.w && sy < px.h) { const i = (sy * px.w + sx) * 4, a = px.data[i + 3] / 255; r = px.data[i] * a + r * (1 - a); g = px.data[i + 1] * a + g * (1 - a); b = px.data[i + 2] * a + b * (1 - a); }
    img[d] = r; img[d + 1] = g; img[d + 2] = b; img[d + 3] = 255;
  }
  return { w: SZ, h: SZ, data: img };
}
// fr: { kind: 'portrait' | 'body', cy, half, views }
function row(label, mk, fr) {
  const cells = [];
  COMBOS.forEach((cb, ci) => {
    const L = mk(cb), p2 = fr.kind === 'portrait' ? Chars.portrait(L, 'neutral', { blink: false }) : Chars.render(L, 'idle', 0, { frame: 0, blink: false });
    cells.push({ img: cell2d(p2), label: ci ? (cb.color2 ? 'c2 ' + cb.color2 : cb.color) : label });
    ch.setLook(L); ch.play('idle', {});
    fr.views.forEach((v) => cells.push({ img: render(ch, VIEWS[v], { size: SZ, cy: fr.cy, half: fr.half }), label: '' }));
  });
  return cells;
}
const HEADF = { kind: 'portrait', cy: 0.36, half: 0.5, views: ['front', 'q34'] }, FACEF = { kind: 'portrait', cy: 0.3, half: 0.36, views: ['front', 'q34'] };
const chunk = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };
const COLS = COMBOS.length * 3, TITLE = '2D | 3D front | 3D 3/4, combos: ' + COMBOS.map((c) => c.color + (c.color2 ? '+' + c.color2 : '')).join(', ');
if (want('hats')) for (const [bi, part] of chunk(CAT.HATS.map((h) => h.id).filter((h) => h !== 'none'), 6).entries()) {
  const cells = []; part.forEach((id) => cells.push(...row(id, (cb) => { const L = base(); L.hat = Object.assign({ id }, cb); return L; }, HEADF)));
  await sheet(path.join(out, 'hats_' + bi + '.png'), cells, COLS, 'hats ' + TITLE); console.log('wrote hats_' + bi);
}
if (want('glasses')) for (const [bi, part] of chunk(CAT.GLASSES.map((h) => h.id).filter((h) => h !== 'none'), 6).entries()) {
  const cells = []; part.forEach((id) => cells.push(...row(id, (cb) => { const L = base(); L.glasses = Object.assign({ id }, cb); return L; }, FACEF)));
  await sheet(path.join(out, 'glasses_' + bi + '.png'), cells, COLS, 'glasses ' + TITLE); console.log('wrote glasses_' + bi);
}
if (want('acc')) {
  const FR = { neck: { kind: 'body', cy: -0.2, half: 0.36, views: ['front', 'q34'] }, ears: { kind: 'portrait', cy: 0.22, half: 0.42, views: ['front', 'side'] }, back: { kind: 'body', cy: -0.3, half: 0.55, views: ['back', 'q34'] }, hand: { kind: 'body', cy: -0.4, half: 0.62, views: ['q34', 'side'] }, wrist: { kind: 'body', cy: -0.5, half: 0.22, views: ['front', 'side'] } };
  const list = CAT.ACCESSORIES.filter((a) => a.id.indexOf('none') !== 0);
  for (const [bi, part] of chunk(list, 6).entries()) {
    const cells = []; part.forEach((a) => { const fr = FR[a.slot], f2 = a.id === 'crossbody' ? Object.assign({}, fr, { views: ['front', 'q34'] }) : fr; cells.push(...row(a.id, (cb) => { const L = base(); L.acc[a.slot] = Object.assign({ id: a.id }, cb); return L; }, f2)); });
    await sheet(path.join(out, 'acc_' + bi + '.png'), cells, COLS, 'accessories ' + TITLE); console.log('wrote acc_' + bi);
  }
}
// dyed tips: every style with a tip colour very different from the base (2D paints hair.tip on every style)
if (want('hair')) for (const [bi, part] of chunk(CAT.HAIR_STYLES.map((h) => h.id).filter((h) => h !== 'bald'), 6).entries()) {
  const cells = [], HF = { kind: 'portrait', cy: 0.3, half: 0.5, views: ['front', 'back'] };
  part.forEach((id) => cells.push(...row(id, (cb) => { const L = base(); L.hair = { style: id, color: cb.color === '#17141f' ? '#1a1420' : '#3b2418', tip: cb.color2 || (cb.color === '#17141f' ? '#ff3ea5' : '#ffd23f') }; return L; }, HF)));
  await sheet(path.join(out, 'hairtip_' + bi + '.png'), cells, COLS, 'hair tips, 2D | 3D front | 3D back (tips: #ffd23f, #ff3ea5, #ffb703)'); console.log('wrote hairtip_' + bi);
}
