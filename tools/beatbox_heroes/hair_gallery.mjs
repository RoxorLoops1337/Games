// Head contact sheets of the 3D characters: every hair style from 5 views, every hat over 3 hair styles, every hat x every hair, facial hair, glasses, clips.
//   node tools/beatbox_heroes/hair_gallery.mjs <outDir> [sheet ...]     sheets: hair hats hatgrid facial glasses clips debug  (default all)
// Renders on the CPU (tools/beatbox_heroes/hair_audit_lib.mjs), no browser needed.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadChars, render, sheet, VIEWS } from './hair_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), CAT = createRequire(import.meta.url)(path.join(HERE, '..', '..', 'beatbox_heroes', 'catalog.js'));
const out = process.argv[2] || '/tmp/chars_head', only = process.argv.slice(3), want = (n) => !only.length || only.indexOf(n) >= 0;
fs.mkdirSync(out, { recursive: true });
const M = await loadChars(), ch = M.createCharacter({ quality: 'high' }, CAT.DEFAULT_LOOK);
const HAIRS = CAT.HAIR_STYLES.map((h) => h.id), HATS = CAT.HATS.map((h) => h.id), BODIES = ['boy', 'girl', 'neutral'];
const SKINS = ['#f2c4ae', '#c68b5e', '#5e3823', '#fde7d9', '#8d5a36'], HCOL = ['#2a2024', '#a5502a', '#dcbc6a', '#ff3ea5', '#2ee6ff', '#5a3520', '#e8e0d8'];
const look = (o) => Object.assign({ body: 'neutral', skin: '#c68b5e', hair: { style: 'crop', color: '#2a2024' }, hat: { id: 'none', color: '#e63946' }, glasses: { id: 'none' }, facial: 'none', top: { id: 'tee', color: '#3a5fcd' }, acc: {} }, o);
const V5 = ['front', 'q34', 'side', 'back', 'top'];
const cellsFor = (L, views, o) => { ch.setLook(L); ch.play('idle', {}); return views.map((v) => ({ img: render(ch, VIEWS[v], Object.assign({ size: 150 }, o)), label: '' })); };
const chunk = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };

if (want('hair')) for (const [bi, part] of chunk(HAIRS, 7).entries()) {
  const cells = []; part.forEach((h, i) => { const c = cellsFor(look({ body: BODIES[i % 3], skin: SKINS[i % 5], hair: { style: h, color: HCOL[i % HCOL.length] } }), V5); c[0].label = h; cells.push(...c); });
  await sheet(path.join(out, 'hair_' + bi + '.png'), cells, 5, 'hair styles ' + (bi + 1) + ' (front, 3/4, side, back, top)'); console.log('wrote hair_' + bi);
}
if (want('hats')) for (const [bi, part] of chunk(HATS.filter((h) => h !== 'none'), 6).entries()) {
  const cells = []; part.forEach((h, i) => ['crop', 'afro', 'ponytail'].forEach((hs, j) => { const c = cellsFor(look({ body: BODIES[j], skin: SKINS[(i + j) % 5], hair: { style: hs, color: HCOL[(i + j) % HCOL.length] }, hat: { id: h, color: ['#e63946', '#3a5fcd', '#ffd23f', '#2a9d8f', '#7b4fe0', '#17141f'][i % 6] } }), ['front', 'q34', 'back'], { half: 0.6, cy: 0.38, size: 120 }); c[0].label = h + ' / ' + hs; cells.push(...c); }));
  await sheet(path.join(out, 'hats_' + bi + '.png'), cells, 9, 'hats over crop, afro, ponytail (front, 3/4, back each)'); console.log('wrote hats_' + bi);
}
// every hat x every hair, one 3/4 view per combo, one sheet per hat
if (want('hatgrid')) for (const h of HATS.filter((x) => x !== 'none')) {
  const cells = HAIRS.map((hs, i) => { const c = cellsFor(look({ skin: SKINS[i % 5], hair: { style: hs, color: HCOL[i % HCOL.length] }, hat: { id: h, color: '#e63946' } }), [i % 2 ? 'q34' : 'q34b'], { half: 0.6, cy: 0.36, size: 110 }); c[0].label = hs; return c[0]; });
  await sheet(path.join(out, 'grid_' + h + '.png'), cells, 10, 'hat ' + h + ' over every hair'); console.log('wrote grid_' + h);
}
if (want('facial')) {
  const cells = []; ['stubble', 'mustache', 'goatee', 'beard', 'longbeard'].forEach((f, i) => { const c = cellsFor(look({ facial: f, age: i % 2 ? 'old' : undefined, skin: SKINS[i], hair: { style: ['crop', 'bald', 'long', 'afro', 'fade'][i], color: HCOL[i] } }), ['front', 'q34', 'side', 'back'], { cy: 0.15, half: 0.55 }); c[0].label = f; cells.push(...c); });
  await sheet(path.join(out, 'facial.png'), cells, 4, 'facial hair'); console.log('wrote facial');
}
if (want('glasses')) {
  const G = CAT.GLASSES.map((g) => g.id).filter((g) => g !== 'none'), cells = [];
  G.forEach((g, i) => { const c = cellsFor(look({ glasses: { id: g, color: '#17141f' }, hair: { style: HAIRS[(i * 5) % HAIRS.length], color: HCOL[i % 7] }, hat: { id: HATS[(i * 7) % HATS.length], color: '#2a9d8f' } }), ['front', 'side'], { size: 120, half: 0.55, cy: 0.33 }); c[0].label = g; cells.push(...c); });
  await sheet(path.join(out, 'glasses.png'), cells, 10, 'glasses under hair and hats'); console.log('wrote glasses');
}
// clips: a few long styles and hats posed mid-clip (posed in the head frame, so anything that slides off the head shows)
if (want('clips')) {
  const clips = ['idle', 'walk', 'run', 'dance', 'beatbox', 'battle', 'cheer', 'sit', 'hit'], styles = [['ponytail', 'none'], ['long', 'none'], ['pigtails', 'cap'], ['buns', 'none'], ['locs', 'beanie'], ['afro', 'bucket'], ['bob', 'fedora'], ['dreadbun', 'durag']], cells = [];
  for (const [hs, hat] of styles) for (const c of clips) {
    ch.setLook(look({ hair: { style: hs, color: '#a5502a' }, hat: { id: hat, color: '#3a5fcd' } })); ch.play(c, { speed: c === 'run' ? 4 : 1.4, bpm: 96 }); let t = 0; for (let i = 0; i < 70; i++) { t += 1 / 60; ch.update(1 / 60, t); }
    cells.push({ img: render(ch, VIEWS.q34b, { size: 110, posed: true, half: 0.6, cy: 0.2 }), label: hs + ' ' + c });
  }
  await sheet(path.join(out, 'clips.png'), cells, 9, 'clips, posed in the head frame (3/4 back)'); console.log('wrote clips');
}
// debug tint: head skin green, hair magenta, hat cyan (gaps between them read at a glance)
if (want('debug')) for (const [bi, part] of chunk(HAIRS, 7).entries()) {
  const tint = { head: [0.1, 0.6, 0.15], face: [0.1, 0.5, 0.15], hair: [0.8, 0.1, 0.6], hat: [0.1, 0.6, 0.8] }, cells = [];
  part.forEach((h) => { const c = cellsFor(look({ hair: { style: h } }), V5, { tint, hull: false }); c[0].label = h; cells.push(...c); });
  await sheet(path.join(out, 'debug_' + bi + '.png'), cells, 5, 'tinted: head green, hair magenta'); console.log('wrote debug_' + bi);
}
