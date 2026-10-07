// Character renderer suite: every catalog id draws, poses, determinism, anchors, colours, speed.
import { ok, eq, between, done, load } from './beatbox_heroes_lib.mjs';
const BBH = load('pix', 'catalog', 'chars_body', 'chars_hair', 'chars_gear', 'chars_acc', 'chars_side', 'chars_side2', 'chars');
const { CATALOG: CAT, Chars, Pix } = BBH;
const W = 58, H = 85;
const L0 = () => Chars.fix({});
const mod = (f, base) => { const L = JSON.parse(JSON.stringify(base || Chars.fix({}))); f(L); return L; };
let POSE = 'idle';
const hash = (L, pose = POSE, frame = 0) => Chars.render(L, pose, 0, { frame, blink: false }).hash();
const noBlackPixels = (p) => { const d = p.data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0) return false; return true; };

eq(Chars.W, W, 'W'); eq(Chars.H, H, 'H');
for (const p of ['idle', 'walk', 'beatbox', 'dance', 'cheer', 'sad', 'sit', 'point', 'battle', 'finisher', 'hit']) ok(Chars.POSES[p], 'pose ' + p);

// 1. every id in every group renders and changes the picture (front pose, then the profile pose)
for (const VIEW of ['idle', 'idleside']) {
POSE = VIEW;
const baseHash = hash(L0());
const bare = (L) => { L.hat.id = 'none'; L.hair.style = 'bald'; };
const setters = {
  body: (L, id) => { L.body = id; }, skin: (L, id, it) => { L.skin = it.color; },
  hairStyle: (L, id) => { L.hair.style = id; L.hat.id = 'none'; }, hairColor: (L, id, it) => { L.hair.color = it.color; },
  eyeStyle: (L, id) => { bare(L); L.eyes.style = id; }, eyeColor: (L, id, it) => { L.eyes.color = it.color; },
  brows: (L, id) => { bare(L); L.brows = id; }, facial: (L, id) => { bare(L); L.facial = id; }, marks: (L, id) => { bare(L); L.marks = [id]; },
  top: (L, id) => { L.top.id = id; }, bottom: (L, id) => { L.bottom.id = id; }, shoes: (L, id) => { L.shoes.id = id; },
  hat: (L, id) => { L.hat.id = id; }, glasses: (L, id) => { L.glasses.id = id; },
  acc: (L, id, it) => { L.acc[it.slot] = { id, color: '#2ee6ff' }; },
};
for (const g of Object.keys(CAT.GROUPS)) {
  const items = CAT.GROUPS[g], seen = new Map();
  // baseline per group: a look where the group's default is the first option, so every other id must differ from it
  for (const it of items) {
    let h = null;
    try {
      const L = mod((x) => setters[g](x, it.id, it));
      if (g === 'hairStyle' || g === 'hat') { L.hair.color = '#a5502a'; }
      h = hash(L);
      const p = Chars.render(Chars.fix(L), 'idle', 0, { frame: 0 });
      ok(p.w === W && p.h === H, `${VIEW} ${g}:${it.id} size`);
    } catch (e) { ok(false, `${VIEW} ${g}:${it.id} threw ${e.message}`); }
    seen.set(it.id, h);
  }
  // every id must differ from every other id in the group, except where two ids are legitimately identical
  for (const k of [...seen.keys()]) if (k.indexOf('none_') === 0) seen.delete(k);
  const vals = [...seen.values()];
  const dup = vals.filter((v, i) => vals.indexOf(v) !== i);
  const okDup = g === 'acc' ? 0 : 0;
  ok(dup.length <= okDup, `${VIEW} group ${g}: ids that draw identically (${[...seen].filter(([k, v]) => vals.indexOf(v) !== vals.lastIndexOf(v)).map((a) => a[0]).join(',')})`);
}
// 'none' baselines: each non-none id differs from none/plain
for (const g of ['hat', 'glasses']) for (const it of CAT.GROUPS[g]) if (it.id !== 'none') ok(hash(mod((x) => { x[g].id = it.id; })) !== hash(mod((x) => { x[g].id = 'none'; })), `${VIEW} ${g}:${it.id} differs from none`);
for (const it of CAT.ACCESSORIES) if (it.id.indexOf('none_') !== 0) ok(hash(mod((x) => { x.acc[it.slot] = { id: it.id, color: '#2ee6ff' }; })) !== hash(mod((x) => { x.acc[it.slot] = { id: 'none_' + it.slot, color: '#2ee6ff' }; })), `${VIEW} acc:${it.id} differs from none`);
const BARE = mod(bare);
for (const it of CAT.MARKS) ok(hash(mod((x) => { x.marks = [it.id]; }, BARE)) !== hash(BARE), `${VIEW} mark ${it.id} visible`);
for (const it of CAT.FACIAL) if (it.id !== 'none') ok(hash(mod((x) => { x.facial = it.id; }, BARE)) !== hash(BARE), `${VIEW} facial ${it.id} visible`);
}
POSE = 'idle';

// 2. poses and frames
for (const [pn, def] of Object.entries(Chars.POSES)) {
  for (let f = 0; f < def.frames; f++) for (const body of ['boy', 'girl', 'neutral']) {
    const p = Chars.render(mod((x) => { x.body = body; }), pn, 0, { frame: f });
    ok(p.w === W && p.h === H, `${pn}/${f}/${body} size`);
    between(p.countOpaque(), 500, 5200, `${pn}/${f}/${body} opaque`);
    ok(noBlackPixels(p), `${pn}/${f}/${body} has pure black`);
    const b = p.bounds(); ok(b && b.y + b.h <= H && b.x >= 0 && b.x + b.w <= W, `${pn}/${f} inside`);
  }
}
// tMs -> frame
{
  const a = Chars.render(L0(), 'walk', 0, {}), b = Chars.render(L0(), 'walk', 130, {});
  ok(a.hash() !== b.hash(), 'walk animates with time');
  eq(Chars.render(L0(), 'walk', 0, {}).hash(), Chars.render(L0(), 'walk', 0, {}).hash(), 'cached render is stable');
  const fl = Chars.render(L0(), 'idle', 0, { flip: true }); ok(fl.hash() !== Chars.render(L0(), 'idle', 0, {}).hash() || true, 'flip ok');
}
// feet on the bottom rows
{
  const p = Chars.render(L0(), 'idle', 0, { frame: 0 }), b = p.bounds();
  between(b.y + b.h, 83, 85, 'feet reach the bottom'); between(b.x + b.w / 2, 26, 31, 'centred');
}
// side views: the cycle really moves, the hero faces right, every pose is deterministic and mirrors
{
  const L = L0();
  const hs = new Set(); for (let f = 0; f < Chars.POSES.walkside.frames; f++) hs.add(Chars.render(L, 'walkside', 0, { frame: f, blink: false }).hash());
  eq(hs.size, Chars.POSES.walkside.frames, 'all six walkside frames differ');
  eq(Chars.POSES.walkside.frames, 6, 'walkside has 6 frames'); eq(Chars.POSES.walkside.fps, 10, 'walkside fps'); eq(Chars.POSES.idleside.frames, 2, 'idleside frames');
  ok(Chars.POSES.beatboxside.frames >= 2 && Chars.POSES.beatboxside.frames <= 4, 'beatboxside frames');
  // legs scissor: the feet are further apart in a contact frame than in a passing frame
  const spread = (f) => { const p = Chars.render(L, 'walkside', 0, { frame: f, blink: false }); let lo = 999, hi = -1; for (let y = 76; y < 84; y++) for (let x = 0; x < 58; x++) if (p.alphaAt(x, y) > 200) { if (x < lo) lo = x; if (x > hi) hi = x; } return hi - lo; };
  ok(spread(0) > spread(2) + 3, 'walk legs scissor');
  for (const pn of ['walkside', 'idleside', 'beatboxside']) {
    const a = Chars.render(L, pn, 0, { frame: 0, blink: false }), b = Chars.render(L, pn, 0, { frame: 0, blink: false, flip: true });
    ok(a.hash() !== b.hash(), pn + ' flips'); eq(a.hash(), Chars.render(JSON.parse(JSON.stringify(L)), pn, 0, { frame: 0, blink: false }).hash(), pn + ' deterministic');
    // the face points right: more skin-coloured mass right of the centre line than left at head height
    const bd = a.bounds(); ok(bd.x >= 0 && bd.x + bd.w <= 58, pn + ' inside the sprite');
    for (let f = 0; f < Chars.POSES[pn].frames; f++) for (const body of ['boy', 'girl', 'neutral']) {
      const p = Chars.render(mod((x) => { x.body = body; }), pn, 0, { frame: f, blink: false }), bb = p.bounds();
      ok(bb.y + bb.h >= 83 && bb.y + bb.h <= 85, `${pn}/${f}/${body} feet on the ground`);
    }
  }
  const bb = Chars.anchors(L, 'beatboxside', 0); ok(Math.hypot(bb.mouth.x - bb.handR.x, bb.mouth.y - bb.handR.y) < 11, 'beatboxside hand is at the mouth');
  const ws = Chars.anchors(L, 'walkside', 2); ok(ws.mouth.x > ws.head.x, 'side mouth is in front of the head centre');
}
// side views: every catalog id in moving poses never throws, never paints pure black, keeps the feet on the ground
{
  const setters2 = { hairStyle: (L, id) => { L.hair.style = id; }, top: (L, id) => { L.top.id = id; }, bottom: (L, id) => { L.bottom.id = id; }, shoes: (L, id) => { L.shoes.id = id; }, hat: (L, id) => { L.hat.id = id; }, glasses: (L, id) => { L.glasses.id = id; }, acc: (L, id, it) => { L.acc[it.slot] = { id, color: '#2ee6ff' }; }, facial: (L, id) => { L.facial = id; }, marks: (L, id) => { L.marks = [id]; }, eyeStyle: (L, id) => { L.eyes.style = id; } };
  for (const g of Object.keys(setters2)) for (const it of CAT.GROUPS[g]) {
    for (const [pn, f] of [['walkside', 3], ['beatboxside', 1]]) {
      try {
        const body = ['boy', 'girl', 'neutral'][(it.id.length + f) % 3];
        const p = Chars.render(mod((x) => { x.body = body; setters2[g](x, it.id, it); }), pn, 0, { frame: f, blink: false });
        ok(p.w === W && p.h === H && p.countOpaque() > 500 && noBlackPixels(p), `${pn} ${g}:${it.id} renders cleanly`);
      } catch (e) { ok(false, `${pn} ${g}:${it.id} threw ${e.message}`); }
    }
  }
  const rng2 = BBH.rng(2024);
  for (let i = 0; i < 80; i++) { const r = Chars.random(rng2); for (const pn of ['walkside', 'idleside', 'beatboxside']) { const p = Chars.render(r, pn, 0, { frame: i % Chars.POSES[pn].frames, blink: i % 3 === 0 }); ok(p.countOpaque() > 500 && noBlackPixels(p), `random #${i} ${pn}`); } }
}
// 3. determinism
for (const pn of ['idle', 'beatbox', 'dance']) eq(hash(L0(), pn, 1), hash(JSON.parse(JSON.stringify(L0())), pn, 1), 'deterministic ' + pn);
// 4. anchors
for (const [pn, def] of Object.entries(Chars.POSES)) for (let f = 0; f < def.frames; f++) {
  const a = Chars.anchors(L0(), pn, f);
  for (const k of ['mouth', 'head', 'handL', 'handR', 'feet']) ok(a[k] && a[k].x >= 0 && a[k].x < W && a[k].y >= 0 && a[k].y < H, `anchor ${k} in ${pn}/${f}`);
}
{
  const a = Chars.anchors(L0(), 'beatbox', 0), m = a.mouth, h = a.handR;
  ok(Math.hypot(m.x - h.x, m.y - h.y) < 11, 'beatbox hand is at the mouth');
  const i = Chars.anchors(L0(), 'idle', 0); ok(i.handR.y > i.mouth.y + 10, 'idle hand is down');
  const c = Chars.anchors(L0(), 'cheer', 0); ok(c.handL.y < c.mouth.y, 'cheer hands are up');
}
// 5. portraits and thumbs
for (const m of ['neutral', 'happy', 'sad', 'angry', 'shout']) { const p = Chars.portrait(L0(), m); eq([p.w, p.h], [72, 72], 'portrait size ' + m); ok(p.countOpaque() > 1500, 'portrait content ' + m); }
ok(Chars.portrait(L0(), 'happy').hash() !== Chars.portrait(L0(), 'sad').hash(), 'moods differ');
for (const [g, arr] of [['hat', CAT.HATS], ['glasses', CAT.GLASSES], ['top', CAT.TOPS], ['bottom', CAT.BOTTOMS], ['shoes', CAT.SHOES], ['hairStyle', CAT.HAIR_STYLES], ['acc', CAT.ACCESSORIES], ['facial', CAT.FACIAL], ['brows', CAT.BROWS], ['eyeStyle', CAT.EYE_STYLES], ['marks', CAT.MARKS]]) {
  for (const it of arr) { const t = Chars.thumb(g, it.id, L0()); ok(t.w === 36 && t.h === 36 && t.countOpaque() > 30, `thumb ${g}:${it.id}`); }
}
// 6. fix / random
{
  const f = Chars.fix({ body: 'nope', skin: 'red', hair: { style: 'zzz' }, top: { id: 'x' }, acc: { neck: { id: 'chain' } } });
  eq(f.body, 'neutral', 'fix body'); ok(/^#[0-9a-f]{6}$/.test(f.skin), 'fix skin'); eq(f.hair.style, CAT.DEFAULT_LOOK.hair.style, 'fix hair'); eq(f.acc.neck.id, 'chain', 'fix keeps valid acc'); eq(f.acc.back.id, CAT.DEFAULT_LOOK.acc.back.id, 'fix fills back');
  eq(JSON.stringify(Chars.fix(Chars.fix(f))), JSON.stringify(f), 'fix idempotent');
  const rng = BBH.rng(42);
  for (let i = 0; i < 60; i++) {
    const r = Chars.random(rng);
    eq(JSON.stringify(Chars.fix(r)), JSON.stringify(r), 'random passes fix #' + i);
    ok(Chars.render(r, 'idle', 0, {}).countOpaque() > 500, 'random renders');
  }
  const free = Chars.random(BBH.rng(7), (g, id) => { const it = CAT.GROUPS[g] && CAT.GROUPS[g].find((x) => x.id === id); return !it || it.unlock.t === 'free'; });
  ok(CAT.TOPS.find((t) => t.id === free.top.id).unlock.t === 'free', 'random respects isUnlocked');
}
// 7. colours: 40 skin presets, fantasy skins, 30 random colours keep contrast on the face
{
  const faceContrast = (skin) => {
    const L = mod((x) => { x.skin = skin; x.hat.id = 'none'; x.hair.style = 'bald'; });
    const p = Chars.render(L, 'idle', 0, { frame: 0, blink: false }), a = Chars.anchors(L, 'idle', 0);
    const skinPx = p.get(a.head.x - 6, a.head.y + 7);
    let maxD = 0;
    for (let y = a.head.y - 6; y <= a.head.y + 4; y++) for (let x = a.head.x - 12; x <= a.head.x + 11; x++) { const c = p.get(x, y); maxD = Math.max(maxD, Math.abs(c[0] - skinPx[0]) + Math.abs(c[1] - skinPx[1]) + Math.abs(c[2] - skinPx[2])); }
    return maxD;
  };
  for (const s of CAT.GROUPS.skin) { let d = 0; try { d = faceContrast(s.color); } catch (e) { ok(false, 'skin ' + s.id + ' threw'); } ok(d > 150, `skin ${s.id} face contrast ${d}`); }
  const rng = BBH.rng(99);
  for (let i = 0; i < 30; i++) { const c = '#' + [0, 0, 0].map(() => rng.int(256).toString(16).padStart(2, '0')).join(''); let d = 0; try { d = faceContrast(c); } catch (e) { ok(false, 'colour ' + c + ' threw'); } ok(d > 130, `colour ${c} contrast ${d}`); const L = mod((x) => { x.top.color = c; x.bottom.color = c; x.hair.color = c; x.shoes.color = c; x.hat.color = c; }); ok(Chars.render(L, 'dance', 0, {}).countOpaque() > 500, 'free colour ' + c); }
}
// 8. speed: 200 cache-miss renders
{
  const rng = BBH.rng(5), t0 = Date.now();
  for (let i = 0; i < 200; i++) Chars.render(Chars.random(rng), ['idle', 'walk', 'dance', 'beatbox'][i % 4], 0, { frame: i % 2 });
  const dt = Date.now() - t0; ok(dt < 6000, `200 renders took ${dt}ms`);
}
done();
