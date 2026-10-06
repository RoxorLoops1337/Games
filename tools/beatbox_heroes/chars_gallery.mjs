// Writes PNG contact sheets of the character renderer for visual review.
//   node tools/beatbox_heroes/chars_gallery.mjs /tmp/chars_out [sheetName ...]
// Sheets: skin poses hair tops bottoms shoes hats glasses acc marks eyes portraits thumbs street
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..', 'beatbox_heroes');
for (const n of ['pix', 'catalog', 'chars_body', 'chars_hair', 'chars_gear', 'chars_acc', 'chars_side', 'chars_side2', 'chars']) require(path.join(root, n + '.js'));
const BBH = globalThis.BBH, { Pix, CATALOG: CAT, Chars } = BBH;
const out = process.argv[2] || '/tmp/chars_out';
const only = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });
const BG = '#2c1d4d';
const mod = (o, f) => { const L = JSON.parse(JSON.stringify(Chars.fix(o || {}))); f(L); return L; };
const save = (name, list, cols, scale, pad) => {
  if (only.length && only.indexOf(name) < 0) return;
  const s = Pix.sheet(list, cols, pad === undefined ? 2 : pad, BG);
  fs.writeFileSync(path.join(out, name + '.png'), s.png(scale || 3));
  console.log('wrote', name, s.w + 'x' + s.h, 'x' + (scale || 3));
};
const draw = (L, pose, f) => Chars.render(L, pose, 0, { frame: f || 0, blink: false });
const ids = (a) => a.map((x) => x.id);
const OC = CAT.OUTFIT_COLORS;
const BODIES = ['boy', 'girl', 'neutral'];
const plain = (L) => { L.hat.id = 'none'; L.acc.neck = { id: 'none_neck', color: '#d4a017' }; L.acc.hand = { id: 'none_hand', color: '#6b6b80' }; L.hair.style = 'crop'; return L; };

// skin tones (all 46 presets)
save('skin', CAT.GROUPS.skin.map((s) => draw(mod({}, (L) => { L.skin = s.color; L.hat.id = 'none'; L.hair.style = 'fadewave'; L.hair.color = '#1a1420'; }), 'idle')), 23, 2);
// 3 bodies x every pose
{
  const list = [];
  for (const b of BODIES) for (const p of Object.keys(Chars.POSES)) for (let f = 0; f < Chars.POSES[p].frames; f++) list.push(draw(mod({}, (L) => { L.body = b; }), p, f));
  save('poses', list, 12, 2);
}
// hair (every style, boy and girl bodies, varied colours)
{
  const cols = ['#2a2024', '#a5502a', '#dcbc6a', '#ff3ea5', '#2ee6ff', '#5a3520'];
  save('hair', ids(CAT.HAIR_STYLES).map((id, i) => draw(plain(mod({}, (L) => { L.hair.style = id; L.hair.color = cols[i % cols.length]; L.body = BODIES[i % 3]; })), 'idle')), 9, 3);
}
const row = (name, list, f, cols, scale) => save(name, list.map((id, i) => draw(plain(mod({}, (L) => { L.body = BODIES[i % 3]; f(L, id, i); })), 'idle')), cols, scale);
row('tops', ids(CAT.TOPS), (L, id, i) => { L.top.id = id; L.top.color = OC[(i * 5) % 24]; L.top.color2 = OC[(i * 7 + 3) % 24]; L.bottom.id = 'jeans'; L.shoes.id = 'sneakers'; }, 7, 4);
row('bottoms', ids(CAT.BOTTOMS), (L, id, i) => { L.bottom.id = id; L.bottom.color = OC[(i * 5 + 2) % 24]; L.top.id = 'tee'; L.shoes.id = 'sneakers'; }, 8, 4);
row('shoes', ids(CAT.SHOES), (L, id, i) => { L.shoes.id = id; L.shoes.color = OC[(i * 5 + 1) % 24]; L.bottom.id = 'jeans'; L.top.id = 'tee'; }, 9, 4);
save('hats', ids(CAT.HATS).map((id, i) => draw(mod({}, (L) => { L.hat.id = id; L.hat.color = OC[(i * 5 + 1) % 24]; L.hair.style = ids(CAT.HAIR_STYLES)[(i * 3) % CAT.HAIR_STYLES.length]; L.body = BODIES[i % 3]; }), 'idle')), 9, 3);
row('glasses', ids(CAT.GLASSES), (L, id, i) => { L.glasses.id = id; L.glasses.color = ['#17141f', '#ff3ea5', '#d4a017', '#2ee6ff'][i % 4]; L.top.id = 'tee'; }, 9, 4);
save('acc', ids(CAT.ACCESSORIES).map((id, i) => draw(mod({}, (L) => { plain(L); const a = CAT.ACCESSORIES[i]; L.acc[a.slot] = { id, color: OC[(i * 5 + 4) % 24] }; L.body = BODIES[i % 3]; L.top.id = 'tee'; }), 'idle')), 11, 4);
row('marks', ids(CAT.MARKS), (L, id) => { L.marks = [id]; L.hair.style = 'fade'; }, 10, 3);
{
  const eyes = CAT.EYE_STYLES.map((e, i) => Chars.portrait(mod({}, (L) => { L.body = BODIES[i % 3]; L.skin = ['#f2c4ae', '#c68b5e', '#5e3823', '#fde7d9'][i % 4]; L.hair.style = ['sidepart', 'bob', 'fade', 'waves'][i % 4]; L.hat.id = 'none'; L.eyes = { style: e.id, color: ['#2f6fd0', '#2f8a4a', '#8a4fd6', '#d98a1a'][i % 4] }; L.brows = CAT.BROWS[i % 5].id; }), 'neutral'));
  save('eyes', eyes, 8, 3);
}
// portraits: 5 moods x 3 bodies
{
  const list = [];
  for (const m of ['neutral', 'happy', 'sad', 'angry', 'shout']) for (const b of BODIES) list.push(Chars.portrait(mod({}, (L) => { L.body = b; L.hair.style = ['quiff', 'long', 'twists'][BODIES.indexOf(b)]; L.hat.id = 'none'; }), m));
  save('portraits', list, 15, 2);
}
// thumbs
{
  const tl = [], L0 = Chars.fix({});
  const g = { hat: CAT.HATS, glasses: CAT.GLASSES, hairStyle: CAT.HAIR_STYLES, top: CAT.TOPS, bottom: CAT.BOTTOMS, shoes: CAT.SHOES, acc: CAT.ACCESSORIES, facial: CAT.FACIAL, brows: CAT.BROWS, eyeStyle: CAT.EYE_STYLES, marks: CAT.MARKS };
  for (const k in g) for (const it of g[k]) tl.push(Chars.thumb(k, it.id, L0));
  save('thumbs', tl, 30, 2);
}
// street: a few finished hip hop looks
{
  const looks = [
    { body: 'boy', skin: '#8d5a36', hair: { style: 'hightop', color: '#1a1420' }, hat: { id: 'none' }, top: { id: 'bomber', color: '#17141f', color2: '#e63946' }, bottom: { id: 'techpants', color: '#34303f' }, shoes: { id: 'retro', color: '#e63946' }, glasses: { id: 'chromeshield' }, acc: { neck: { id: 'cubanchain', color: '#e8b923' }, ears: { id: 'iced' }, wrist: { id: 'icedwatch' }, hand: { id: 'none_hand' } } },
    { body: 'girl', skin: '#5e3823', hair: { style: 'cornrows', color: '#1a1420' }, hat: { id: 'none' }, top: { id: 'jersey', color: '#ff3ea5', color2: '#f7f2e8' }, bottom: { id: 'camo', color: '#2f5d3a' }, shoes: { id: 'fatlaces', color: '#f7f2e8' }, glasses: { id: 'gold_round' }, acc: { neck: { id: 'dogtags' }, ears: { id: 'hoops', color: '#e8b923' }, wrist: { id: 'stackedbands' } }, marks: ['goldgrill'] },
    { body: 'neutral', skin: '#c68b5e', hair: { style: 'dreadbun', color: '#3b2418' }, hat: { id: 'none' }, top: { id: 'denimjacket', color: '#3a5fcd', color2: '#f7f2e8' }, bottom: { id: 'ripped', color: '#3a5fcd' }, shoes: { id: 'timbs', color: '#d4a017' }, glasses: { id: 'oversized' }, acc: { back: { id: 'crossbody', color: '#17141f' } } },
    { body: 'boy', skin: '#fde7d9', hair: { style: 'fadewave', color: '#dcbc6a' }, hat: { id: 'trucker', color: '#ff6b35' }, top: { id: 'windbreaker', color: '#2a9d8f', color2: '#ffb703' }, bottom: { id: 'sweatpants', color: '#6b6b80' }, shoes: { id: 'slides', color: '#17141f' } },
    { body: 'girl', skin: '#f2c4ae', hair: { style: 'twists', color: '#ff3ea5' }, hat: { id: 'durag', color: '#7b4fe0' }, top: { id: 'puffvest', color: '#17141f', color2: '#e63946' }, bottom: { id: 'jeans', color: '#34303f' }, shoes: { id: 'hightops', color: '#ff3ea5' } },
    { body: 'neutral', skin: '#2b1b16', hair: { style: 'afro', color: '#1a1420' }, hat: { id: 'bucketfur', color: '#ffb703' }, top: { id: 'hoodiebig', color: '#7b4fe0', color2: '#f7f2e8' }, bottom: { id: 'sweatpants', color: '#17141f' }, shoes: { id: 'retro', color: '#2ee6ff' } },
    { body: 'boy', skin: '#d9a46e', hair: { style: 'twists', color: '#2a2024' }, hat: { id: 'fitted', color: '#e63946' }, top: { id: 'oversized', color: '#f7f2e8', color2: '#17141f' }, bottom: { id: 'camo', color: '#34303f' }, shoes: { id: 'retro', color: '#f7f2e8' }, acc: { neck: { id: 'cubanchain', color: '#e8b923' }, hand: { id: 'mic' } } },
    { body: 'girl', skin: '#a56c3f', hair: { style: 'long', color: '#2a2024' }, hat: { id: 'hood', color: '#17141f' }, top: { id: 'hoodiebig', color: '#17141f', color2: '#ff3ea5' }, bottom: { id: 'techpants', color: '#17141f' }, shoes: { id: 'fatlaces', color: '#ff3ea5' }, glasses: { id: 'neonbar', color: '#2ee6ff' } },
  ];
  const list = [];
  for (const l of looks) for (const p of ['idle', 'beatbox', 'dance']) list.push(draw(Chars.fix(l), p, p === 'idle' ? 0 : 1));
  save('street', list, 6, 3);
  save('street_portraits', looks.map((l) => Chars.portrait(Chars.fix(l), 'happy')), 8, 3);
}

// ---- profile (side) views: sheets named side_*
{
  const dsd = (L, pose, f) => Chars.render(L, pose, 0, { frame: f || 0, blink: false });
  const sp = (name, list, f, cols, scale, pose) => save(name, list.map((id, i) => dsd(mod({}, (L) => { plain(L); L.body = BODIES[i % 3]; f(L, id, i); }), pose || 'idleside')), cols, scale);
  // every side pose frame, 3 bodies
  {
    const list = [];
    for (const b of BODIES) for (const p of ['walkside', 'idleside', 'beatboxside']) for (let f = 0; f < Chars.POSES[p].frames; f++) list.push(dsd(mod({}, (L) => { L.body = b; }), p, f));
    save('side_poses', list, 12, 3);
  }
  sp('side_hair', ids(CAT.HAIR_STYLES), (L, id, i) => { const cols = ['#2a2024', '#a5502a', '#dcbc6a', '#ff3ea5', '#2ee6ff', '#5a3520']; L.hair.style = id; L.hair.color = cols[i % cols.length]; L.top.id = 'tee'; }, 9, 3);
  save('side_hats', ids(CAT.HATS).map((id, i) => dsd(mod({}, (L) => { L.hat.id = id; L.hat.color = OC[(i * 5 + 1) % 24]; L.hair.style = ids(CAT.HAIR_STYLES)[(i * 3) % CAT.HAIR_STYLES.length]; L.body = BODIES[i % 3]; }), 'idleside')), 9, 3);
  sp('side_tops', ids(CAT.TOPS), (L, id, i) => { L.top.id = id; L.top.color = OC[(i * 5) % 24]; L.top.color2 = OC[(i * 7 + 3) % 24]; L.bottom.id = 'jeans'; L.shoes.id = 'sneakers'; }, 9, 4, 'walkside');
  sp('side_bottoms', ids(CAT.BOTTOMS), (L, id, i) => { L.bottom.id = id; L.bottom.color = OC[(i * 5 + 2) % 24]; L.top.id = 'tee'; L.shoes.id = 'sneakers'; }, 8, 4, 'walkside');
  sp('side_shoes', ids(CAT.SHOES), (L, id, i) => { L.shoes.id = id; L.shoes.color = OC[(i * 5 + 1) % 24]; L.bottom.id = 'jeans'; L.top.id = 'tee'; }, 9, 4, 'walkside');
  sp('side_glasses', ids(CAT.GLASSES), (L, id, i) => { L.glasses.id = id; L.glasses.color = ['#17141f', '#ff3ea5', '#d4a017', '#2ee6ff'][i % 4]; L.top.id = 'tee'; }, 9, 4);
  save('side_acc', ids(CAT.ACCESSORIES).map((id, i) => dsd(mod({}, (L) => { plain(L); const a = CAT.ACCESSORIES[i]; L.acc[a.slot] = { id, color: OC[(i * 5 + 4) % 24] }; L.body = BODIES[i % 3]; L.top.id = 'tee'; }), 'idleside')), 11, 4);
  sp('side_marks', ids(CAT.MARKS).concat(ids(CAT.FACIAL).slice(1)), (L, id) => { if (CAT.FACIAL.find((x) => x.id === id)) L.facial = id; else L.marks = [id]; L.hair.style = 'fade'; }, 9, 4);
  {
    const looks = [
      { body: 'boy', skin: '#8d5a36', hair: { style: 'hightop', color: '#1a1420' }, hat: { id: 'none' }, top: { id: 'bomber', color: '#17141f', color2: '#e63946' }, bottom: { id: 'techpants', color: '#34303f' }, shoes: { id: 'retro', color: '#e63946' }, glasses: { id: 'chromeshield' }, acc: { neck: { id: 'cubanchain', color: '#e8b923' }, ears: { id: 'iced' }, wrist: { id: 'icedwatch' }, hand: { id: 'none_hand' } } },
      { body: 'girl', skin: '#5e3823', hair: { style: 'cornrows', color: '#1a1420' }, hat: { id: 'none' }, top: { id: 'jersey', color: '#ff3ea5', color2: '#f7f2e8' }, bottom: { id: 'camo', color: '#2f5d3a' }, shoes: { id: 'fatlaces', color: '#f7f2e8' }, glasses: { id: 'gold_round' }, acc: { neck: { id: 'dogtags' }, ears: { id: 'hoops', color: '#e8b923' }, wrist: { id: 'stackedbands' } }, marks: ['goldgrill'] },
      { body: 'neutral', skin: '#c68b5e', hair: { style: 'dreadbun', color: '#3b2418' }, hat: { id: 'none' }, top: { id: 'denimjacket', color: '#3a5fcd', color2: '#f7f2e8' }, bottom: { id: 'ripped', color: '#3a5fcd' }, shoes: { id: 'timbs', color: '#d4a017' }, glasses: { id: 'oversized' }, acc: { back: { id: 'crossbody', color: '#17141f' } } },
      { body: 'boy', skin: '#fde7d9', hair: { style: 'fadewave', color: '#dcbc6a' }, hat: { id: 'trucker', color: '#ff6b35' }, top: { id: 'windbreaker', color: '#2a9d8f', color2: '#ffb703' }, bottom: { id: 'sweatpants', color: '#6b6b80' }, shoes: { id: 'slides', color: '#17141f' } },
      { body: 'girl', skin: '#f2c4ae', hair: { style: 'twists', color: '#ff3ea5' }, hat: { id: 'durag', color: '#7b4fe0' }, top: { id: 'puffvest', color: '#17141f', color2: '#e63946' }, bottom: { id: 'jeans', color: '#34303f' }, shoes: { id: 'hightops', color: '#ff3ea5' } },
      { body: 'neutral', skin: '#2b1b16', hair: { style: 'afro', color: '#1a1420' }, hat: { id: 'bucketfur', color: '#ffb703' }, top: { id: 'hoodiebig', color: '#7b4fe0', color2: '#f7f2e8' }, bottom: { id: 'sweatpants', color: '#17141f' }, shoes: { id: 'retro', color: '#2ee6ff' } },
      { body: 'boy', skin: '#d9a46e', hair: { style: 'twists', color: '#2a2024' }, hat: { id: 'fitted', color: '#e63946' }, top: { id: 'oversized', color: '#f7f2e8', color2: '#17141f' }, bottom: { id: 'camo', color: '#34303f' }, shoes: { id: 'retro', color: '#f7f2e8' }, acc: { neck: { id: 'cubanchain', color: '#e8b923' }, hand: { id: 'mic' } } },
      { body: 'girl', skin: '#a56c3f', hair: { style: 'long', color: '#2a2024' }, hat: { id: 'hood', color: '#17141f' }, top: { id: 'hoodiebig', color: '#17141f', color2: '#ff3ea5' }, bottom: { id: 'techpants', color: '#17141f' }, shoes: { id: 'fatlaces', color: '#ff3ea5' }, glasses: { id: 'neonbar', color: '#2ee6ff' } },
    ];
    const list = [];
    for (const l of looks) for (const [p, f] of [['walkside', 0], ['walkside', 3], ['beatboxside', 1]]) list.push(dsd(Chars.fix(l), p, f));
    save('side_street', list, 6, 3);
  }
}
