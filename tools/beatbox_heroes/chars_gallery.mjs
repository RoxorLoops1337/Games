// Writes PNG contact sheets of the character renderer for visual review.
//   node tools/beatbox_heroes/chars_gallery.mjs /tmp/chars_out [sheetName ...]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..', 'beatbox_heroes');
for (const n of ['pix', 'catalog', 'chars_body', 'chars_hair', 'chars_gear', 'chars']) require(path.join(root, n + '.js'));
const BBH = globalThis.BBH, { Pix, CATALOG: CAT, Chars } = BBH;
const out = process.argv[2] || '/tmp/chars_out';
const only = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });
const BG = '#2c1d4d';
const base = (o) => Chars.fix(Object.assign({}, CAT.DEFAULT_LOOK, o));
const mod = (o, f) => { const L = JSON.parse(JSON.stringify(Chars.fix(o || {}))); f(L); return L; };
const sheets = {};
const save = (name, list, cols, scale, pad) => {
  if (only.length && only.indexOf(name) < 0) return;
  const s = Pix.sheet(list, cols, pad === undefined ? 2 : pad, BG);
  fs.writeFileSync(path.join(out, name + '.png'), s.png(scale || 4));
  console.log('wrote', name, s.w + 'x' + s.h);
};
const draw = (L, pose, f) => Chars.render(L, pose, 0, { frame: f || 0, blink: false });

// 1. skin tones
save('skin', CAT.SKINS.concat(CAT.SKINS_FANTASY).map((s) => draw(mod({}, (L) => { L.skin = s.color; L.hat.id = 'none'; }), 'idle')), 23, 3);
// 2. bodies x poses
{
  const list = [];
  for (const b of ['boy', 'girl', 'neutral']) for (const p of Object.keys(Chars.POSES)) for (let f = 0; f < Chars.POSES[p].frames; f++) list.push(draw(mod({}, (L) => { L.body = b; L.hat.id = 'none'; }), p, f));
  save('poses', list, 11 * 1 + 0 + 17 - 17 + 0 || 11, 3);
}
// 3. hair
{
  const cols = ['#2a2024', '#a5502a', '#dcbc6a', '#ff3ea5', '#2ee6ff'];
  const list = [];
  CAT.HAIR_STYLES.forEach((h, i) => list.push(draw(mod({}, (L) => { L.hair.style = h.id; L.hair.color = cols[i % cols.length]; L.hat.id = 'none'; L.body = i % 2 ? 'girl' : 'boy'; }), 'idle')));
  save('hair', list, 11, 4);
}
// 4. clothes
const row = (group, key, ids, f, cols, scale, name) => {
  const list = ids.map((id, i) => draw(mod({}, (L) => { L.hat.id = 'none'; L.body = ['boy', 'girl', 'neutral'][i % 3]; f(L, id, i); }), 'idle'));
  save(name, list, cols, scale);
};
const OC = CAT.OUTFIT_COLORS;
row('top', 'top', ids(CAT.TOPS), (L, id, i) => { L.top.id = id; L.top.color = OC[(i * 5) % 24]; L.top.color2 = OC[(i * 7 + 3) % 24]; }, 10, 4, 'tops');
row('bottom', 'bottom', ids(CAT.BOTTOMS), (L, id, i) => { L.bottom.id = id; L.bottom.color = OC[(i * 5 + 2) % 24]; L.top.id = 'tee'; }, 12, 4, 'bottoms');
row('shoes', 'shoes', ids(CAT.SHOES), (L, id, i) => { L.shoes.id = id; L.shoes.color = OC[(i * 5 + 1) % 24]; }, 9, 4, 'shoes');
row('hat', 'hat', ids(CAT.HATS), (L, id, i) => { L.hat.id = id; L.hat.color = OC[(i * 5 + 1) % 24]; L.hair.style = CAT.HAIR_STYLES[(i * 3) % 22].id; }, 10, 4, 'hats');
row('glasses', 'glasses', ids(CAT.GLASSES), (L, id, i) => { L.glasses.id = id; L.glasses.color = ['#17141f', '#ff3ea5', '#d4a017', '#2ee6ff'][i % 4]; }, 15, 4, 'glasses');
row('acc', 'acc', ids(CAT.ACCESSORIES), (L, id, i) => { const a = CAT.ACCESSORIES[i]; L.acc[a.slot] = { id, color: OC[(i * 5 + 4) % 24] }; }, 14, 4, 'acc');
function ids(a) { return a.map((x) => x.id); }
// 5. portraits and thumbs
{
  const list = [];
  for (const m of ['neutral', 'happy', 'sad', 'angry', 'shout']) for (const b of ['boy', 'girl', 'neutral']) list.push(Chars.portrait(mod({}, (L) => { L.body = b; L.hair.style = ['quiff', 'long', 'curly'][['boy', 'girl', 'neutral'].indexOf(b)]; L.hat.id = 'none'; }), m));
  save('portraits', list, 15, 3);
  const tl = [];
  const L0 = Chars.fix({});
  const g = { hat: CAT.HATS, glasses: CAT.GLASSES, hairStyle: CAT.HAIR_STYLES, top: CAT.TOPS, bottom: CAT.BOTTOMS, shoes: CAT.SHOES, acc: CAT.ACCESSORIES, facial: CAT.FACIAL, brows: CAT.BROWS, eyeStyle: CAT.EYE_STYLES, marks: CAT.MARKS };
  for (const k in g) for (const it of g[k]) tl.push(Chars.thumb(k, it.id, L0));
  save('thumbs', tl, 24, 3);
}
