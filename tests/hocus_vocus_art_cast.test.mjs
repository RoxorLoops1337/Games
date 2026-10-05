// ART cast: the owners' chibi kit (art_cast_kit.js, ART.rj) and the cast (art_cast.js: the eight figures, the ART.hero adapter, ART.cast),
// headless on the strict canvas stub. HV_ART_AUDIO 2.12 is the list this suite pins:
//   * the kit loads into ART.rj with no global; all eight cast ids register; every pose has a table or a fallback
//   * every cast id draws every kit pose, and every hero every engine pose, at several t and pt without a canvas issue
//   * blends are continuous: in every one-shot pose the mic head never jumps (sampled at 1/600 s it moves at most 6 px a step)
//   * outfits resolve (castId per hero and skin, Andy has none), the outfit map ignores junk, gloss and cache draw
//   * ART.cast.draw('jordan') in all six moods; determinism; a perf smoke on a no-op context
import { boot, harness } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus art cast');
const api = boot({ only: ['util', 'data', 'art', 'art_cast_kit', 'art_cast'] });
const { ART, DATA } = api;
const RJ = ART.rj;
t.ok(!api._errors || api._errors.length === 0, 'cast files load without errors: ' + JSON.stringify(api._errors));
t.ok(!api._warnings || api._warnings.length === 0, 'cast files load without warnings: ' + JSON.stringify(api._warnings));
const doc = api._doc;
const newCtx = () => doc.createElement('canvas').getContext('2d');
const clean = () => api._resetCounts();
const issues = () => api._issues.map((i) => `${i.kind}: ${i.detail}`).slice(0, 5).join(' | ');
// a recording context (every call and property write as a string, numbers rounded) so drawings can be compared
function recorder() {
  const log = [];
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(3) : typeof v === 'string' ? v : v && v._kind ? 'grad' : typeof v === 'object' && v ? 'obj' : String(v));
  const real = newCtx();
  const proxy = new Proxy(real, {
    get(target, key) { const v = target[key]; if (typeof v === 'function') return (...a) => { log.push(key + '(' + a.map(fmt).join(',') + ')'); return v.apply(target, a); }; return v; },
    set(target, key, v) { target[key] = v; log.push('=' + String(key) + ':' + fmt(v)); return true; },
  });
  return { ctx: proxy, log, real };
}
const call = (fn) => { const r = recorder(); fn(r.ctx); return r.log.join('\n'); };

const CAST = ['roxor', 'roxor_monster', 'jasmin', 'jasmin_unicorn', 'rawclaw', 'rawclaw_goat', 'andy', 'jordan'];
const HEROES = DATA.LISTS.heroIds, ENGINE = DATA.LISTS.poses, KIT = ['idle', 'sing', 'attack', 'hurt', 'cheer', 'windup', 'strike', 'block', 'down', 'walk'];

t.test('the kit loads into ART.rj with no global', () => {
  t.ok(RJ && typeof RJ === 'object', 'ART.rj exists');
  t.eq(typeof api._win.RJ, 'undefined', 'no window.RJ');
  ['register', 'draw', 'bust', 'point', 'bake', 'rig', 'resolve', 'blend', 'layout', 'norm', 'frame', 'cel', 'ink', 'mouth', 'drawFace', 'fxDraw'].forEach((k) => t.eq(typeof RJ[k], 'function', `RJ.${k}`));
  t.deep(RJ.POSES, KIT, 'RJ.POSES lists the five kit poses and the five new ones');
  t.deep(RJ.FALLBACK, { windup: 'sing', strike: 'attack', block: 'idle', down: 'hurt', walk: 'idle' }, 'the pose fallbacks of HV_ART_AUDIO 2.2');
  ['roxor', 'jasmin', 'rawclaw', 'andy', 'jordan'].forEach((id) => { const a = RJ.ACCENT[id]; t.ok(a && /^#[0-9a-f]{6}$/i.test(a.main) && a.dark && a.light && a.glow, `RJ.ACCENT.${id}`); });
  t.deep(RJ.BAKE_BOX, { x0: -170, x1: 150, y0: -345, y1: 24 }, 'the bake box');
  t.ok(ART.cast && typeof ART.cast.draw === 'function' && typeof ART.cast.medallion === 'function', 'ART.cast exists');
});

t.test('all eight cast ids register, with a table or a fallback for every pose', () => {
  t.deep(RJ.ids.slice().sort(), CAST.slice().sort(), 'the eight cast ids');
  t.deep(ART.cast.ids().slice().sort(), CAST.slice().sort(), 'ART.cast.ids');
  CAST.forEach((id) => {
    const impl = RJ.chars[id];
    t.ok(impl && typeof impl.draw === 'function' && typeof impl.bust === 'function' && typeof impl.points === 'function', `${id} has draw, bust and points`);
    t.ok(impl.bounds && impl.bounds.w > 150 && impl.bounds.h > 280, `${id} bounds`);
  });
  // the four heroes in both outfits carry their own table for every new pose (Jordan never fights: he falls back)
  ['roxor', 'roxor_monster', 'jasmin', 'jasmin_unicorn', 'rawclaw', 'rawclaw_goat', 'andy'].forEach((id) => ['windup', 'strike', 'block', 'down'].forEach((p) => {
    const P = RJ.resolve({ id, poses: { idle: {} }, base: {} }, p, 0);
    t.eq(P.table, 'idle', 'a bare spec falls back to idle');
    t.ok(RJ.point(id, 'head', { pose: p }) !== null, `${id} ${p} resolves`);
  }));
  t.eq(RJ.resolve({ id: 'x', poses: { idle: {}, sing: { mouth: 'sing' } } }, 'windup', 0).table, 'sing', 'windup falls back to sing');
  t.eq(RJ.resolve({ id: 'x', poses: { idle: {}, attack: { lean: 0.1 } } }, 'strike', 0).table, 'attack', 'strike falls back to attack');
  t.eq(RJ.resolve({ id: 'x', poses: { idle: {}, hurt: {} } }, 'down', 0).table, 'hurt', 'down falls back to hurt');
  t.eq(RJ.resolve({ id: 'x', poses: { idle: {} } }, 'strike', 0).pose, 'strike', 'P.pose keeps the requested kit pose');
});

t.test('every cast id draws every kit pose at several t, clean and balanced', () => {
  let n = 0;
  CAST.forEach((id) => KIT.concat(['bust', 'nonsense']).forEach((pose) => [0, 0.37, 1.9, 12.345].forEach((tt) => {
    clean();
    const r = recorder();
    let threw = null;
    try { RJ.draw(r.ctx, id, { x: 300, y: 500, s: 1, pose, t: tt, flip: n % 2 === 1 }); } catch (e) { threw = e; }
    t.ok(!threw, `${id} ${pose} t=${tt} does not throw ${threw ? threw.message : ''}`);
    const paths = (api._counts.fill || 0) + (api._counts.stroke || 0);
    t.ok(paths >= 40, `${id} ${pose} draws real paths (${paths})`);
    if (api._issues.length) t.ok(false, `${id} ${pose} t=${tt} canvas issues: ${issues()}`);
    t.eq(r.real._depth, 0, `${id} ${pose} leaves the context stack empty`);
    n++;
  })));
  t.eq(n, CAST.length * (KIT.length + 2) * 4, 'covered every combination');
  t.eq(api._console.error.filter((l) => /RJ\.draw/.test(String(l))).length, 0, 'no figure logged a draw failure');
});

t.test('every hero draws every engine pose at several t and pt, in both outfits', () => {
  let n = 0;
  HEROES.forEach((id) => ['stage', 'skin'].forEach((skin) => ENGINE.forEach((pose) => {
    const dur = ART.hero.poseMs(pose) / 1000;
    [0, 0.6].forEach((tt) => [0, dur * 0.2, dur * 0.5, dur, dur + 2].forEach((pt) => {
      clean();
      let threw = null;
      try { ART.hero.draw(newCtx(), id, { x: 300, y: 500, s: 1, pose, t: tt, pt, skin }); } catch (e) { threw = e; }
      t.ok(!threw, `${id} ${skin} ${pose} pt=${pt} does not throw`);
      if (api._issues.length) t.ok(false, `${id} ${skin} ${pose} t=${tt} pt=${pt} canvas issues: ${issues()}`);
      n++;
    }));
  })));
  t.eq(n, HEROES.length * 2 * ENGINE.length * 10, 'covered every combination');
  t.eq(api._console.warn.filter((l) => /ART\.hero/.test(String(l))).length, 0, 'the adapter never had to swallow a failure');
});

t.test('blends are continuous: the mic never jumps in a one-shot pose', () => {
  // HV_ART_AUDIO 2.12 asks for no jump between frames. The 420 ms attack moves the mic up to about 26 px in one 1/60 s frame on purpose (the
  // strike), so continuity is checked at 1/600 s: a pop (a mode switch, a table swap) would show as one large step there.
  HEROES.forEach((id) => ['attack', 'cast', 'hurt', 'block', 'down', 'cheer'].forEach((pose) => {
    const dur = ART.hero.poseMs(pose) / 1000;
    let worst = 0, at = 0;
    for (let i = 0; i <= Math.ceil((dur + 0.05) * 600); i++) {
      const a = ART.hero.pointAt(id, 'micHead', { s: 1, pose, pt: i / 600, t: 1 }), b = ART.hero.pointAt(id, 'micHead', { s: 1, pose, pt: (i + 1) / 600, t: 1 });
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > worst) { worst = d; at = i / 600; }
    }
    t.ok(worst <= 6, `${id} ${pose}: the mic moves at most 6 px in 1/600 s (worst ${worst.toFixed(2)} px at pt ${at.toFixed(3)})`);
  }));
  // a blend from a mic in the hand to a mic at the mouth slides through the middle
  const a = RJ.point('jasmin', 'micHead', { pose: 'idle', t: 0 }), b = RJ.point('jasmin', 'micHead', { pose: 'sing', t: 0 }), m = RJ.point('jasmin', 'micHead', { pose: 'idle', t: 0, mix: { pose: 'sing', k: 0.5 } });
  t.ok(Math.hypot(m.x - (a.x + b.x) / 2, m.y - (a.y + b.y) / 2) < 12, 'half way between the hand and the mouth the mic is half way');
  // the blend itself: numbers lerp, strings switch at the middle
  const P = RJ.blend({ lean: 0, fHand: [0, 0], mouth: 'smile', fx: ['a'], mic: 'hand', micK: 1 }, { lean: 1, fHand: [10, 20], mouth: 'sing', fx: ['b'], mic: 'hand', micK: 1 }, 0.25);
  t.near(P.lean, 0.25, 1e-9, 'numbers lerp'); t.deep(P.fHand, [2.5, 5], 'number arrays lerp'); t.eq(P.mouth, 'smile', 'strings switch at 0.5'); t.deep(P.fx, ['a'], 'the fx list switches at 0.5');
  const Q = RJ.blend({ mic: 'none', micK: 1 }, { mic: 'mouth', micK: 1 }, 0.3);
  t.ok(Q.mic === 'mouth' && Math.abs(Q.micK - 0.3) < 1e-9, 'a mic coming from none grows in the fist');
});

t.test('outfits resolve, the outfit map ignores junk, Andy has none', () => {
  t.deep(ART.hero.ids(), HEROES, 'ART.hero.ids');
  t.eq(ART.hero.castId('hanae', 'stage'), 'jasmin'); t.eq(ART.hero.castId('hanae', 'skin'), 'jasmin_unicorn');
  t.eq(ART.hero.castId('kuro', 'stage'), 'roxor'); t.eq(ART.hero.castId('kuro', 'skin'), 'roxor_monster');
  t.eq(ART.hero.castId('suzu', 'stage'), 'rawclaw'); t.eq(ART.hero.castId('suzu', 'skin'), 'rawclaw_goat');
  t.eq(ART.hero.castId('raiga', 'stage'), 'andy'); t.eq(ART.hero.castId('raiga', 'skin'), 'andy', 'Andy has no outfit: the skin is his stage clothes');
  t.eq(ART.hero.castId('nobody', 'skin'), null, 'an unknown hero has no cast');
  t.deep(ART.hero.skins('raiga'), [{ id: 'stage', cast: 'andy' }], 'Andy: one entry');
  t.deep(ART.hero.skins('kuro').map((s) => s.id), ['stage', 'skin'], 'the others: stage and skin');
  t.deep(ART.hero.outfits(), { hanae: 'stage', kuro: 'stage', suzu: 'stage', raiga: 'stage' }, 'everyone starts in stage clothes');
  const got = ART.hero.outfits({ hanae: 'skin', kuro: 'fancy', suzu: 7, raiga: 'skin', zed: 'skin', __proto__: { x: 1 } });
  t.deep(got, { hanae: 'skin', kuro: 'stage', suzu: 'stage', raiga: 'skin' }, 'unknown keys and values are ignored');
  t.eq(ART.hero.castId('hanae'), 'jasmin_unicorn', 'the viewer outfit is used when no skin is passed');
  t.eq(ART.hero.castId('raiga'), 'andy', 'Andy stays Andy whatever the map says');
  const b1 = JSON.stringify(ART.hero.bounds('hanae'));
  t.ok(call((c) => ART.hero.draw(c, 'hanae', { x: 100, y: 300, t: 1 })) === call((c) => ART.hero.draw(c, 'hanae', { x: 100, y: 300, t: 1, skin: 'skin' })), 'no skin argument draws the viewer outfit');
  t.ok(call((c) => ART.hero.draw(c, 'hanae', { x: 100, y: 300, t: 1, skin: 'stage' })) !== call((c) => ART.hero.draw(c, 'hanae', { x: 100, y: 300, t: 1, skin: 'skin' })), 'the outfit draws differently');
  ART.hero.outfits(null); ART.hero.outfits('skin'); ART.hero.outfits([1, 2]);
  ART.hero.outfits({ hanae: 'stage', raiga: 'stage' });
  t.deep(ART.hero.outfits(), { hanae: 'stage', kuro: 'stage', suzu: 'stage', raiga: 'stage' }, 'back to stage clothes; junk calls change nothing');
  t.eq(JSON.stringify(ART.hero.bounds('hanae')), b1, 'outfits keep the same bounds');
  const pa = ART.hero.pointAt('kuro', 'head', { x: 0, y: 0, s: 1, skin: 'stage' }), pb = ART.hero.pointAt('kuro', 'head', { x: 0, y: 0, s: 1, skin: 'skin' });
  t.ok(Number.isFinite(pa.x) && Number.isFinite(pb.y), 'anchors resolve in both outfits');
  clean();
  HEROES.forEach((id) => { ART.hero.portrait(newCtx(), id, { x: 0, y: 0, w: 120, h: 160, expr: 'smile', skin: 'skin', t: 1 }); ART.hero.medallion(newCtx(), id, 40, 40, 20, 'skin'); });
  t.eq(issues(), '', 'outfit portraits and medallions are clean');
});

t.test('gloss and cache draw from cached frames', () => {
  ART.sprite.clear();
  clean();
  const ctx = newCtx();
  HEROES.forEach((id) => {
    ART.hero.draw(ctx, id, { x: 200, y: 400, s: 1, pose: 'idle', t: 1, gloss: 1 });
    ART.hero.draw(ctx, id, { x: 200, y: 400, s: 1, pose: 'attack', pt: 0.15, t: 1, cache: true, flip: true });
    ART.hero.draw(ctx, id, { x: 200, y: 400, s: 0.25, pose: 'walk', t: 0.3 });
  });
  t.eq(issues(), '', 'cached and glossy frames are clean');
  t.ok((api._counts.drawImage || 0) >= HEROES.length * 3, 'each of them is one blit');
  const keys = ART.sprite.stats().count;
  t.ok(keys >= HEROES.length * 3, 'the frames are sprites in the global LRU');
  const before = ART.sprite.stats().misses;
  HEROES.forEach((id) => ART.hero.draw(ctx, id, { x: 0, y: 0, s: 1, pose: 'idle', t: 1, gloss: 1 }));
  t.eq(ART.sprite.stats().misses, before, 'a repeated glossy frame is a cache hit');
  const m0 = ART.sprite.stats().misses;
  ART.hero.draw(ctx, 'kuro', { x: 0, y: 0, t: 1, gloss: 0.5 });
  t.ok(ART.sprite.stats().misses > m0, 'the gloss strength is part of the frame key');
  const tok = call((c) => { for (let i = 0; i < 8; i++) ART.hero.draw(c, 'hanae', { x: 0, y: 0, s: 0.25, pose: 'walk', t: i / 8 }); });
  t.ok(tok.split('\n').filter((l) => l.indexOf('drawImage(') === 0).length === 8, 'the map token walk cycle blits one frame a draw');
  const lowA = ART.tk.opt;
  ART.tk.opt = { reduceMotion: false, quality: 'low' };
  clean();
  HEROES.forEach((id) => ART.hero.draw(newCtx(), id, { x: 0, y: 0, s: 1, pose: 'cast', pt: 0.2, t: 3.3 }));
  t.ok((api._counts.drawImage || 0) >= HEROES.length, 'low quality draws cached frames');
  ART.tk.opt = lowA;
  ART.sprite.clear();
});

t.test('Jordan: ART.cast in all six moods, bust, medallion, point', () => {
  clean();
  const moods = ART.cast.moods();
  t.deep(moods, ['hello', 'buy', 'poor', 'sold', 'leave', 'empty'], 'the six Merch Stall moods');
  const logs = moods.map((m) => call((c) => ART.cast.draw(c, 'jordan', { x: 200, y: 400, s: 1, mood: m, t: 1.2 })));
  t.eq(new Set(logs).size, moods.length, 'the six moods draw differently (hello and leave share the wave, hello smiles)');
  ART.cast.draw(newCtx(), 'jordan', { x: NaN, y: NaN, s: NaN, mood: 'nope', alpha: 0.5 });
  ART.cast.draw(newCtx(), 'nobody', { x: 10, y: 10 });
  ART.cast.bust(newCtx(), 'jordan', 120, 160, { t: 1, expr: 'happy' });
  ART.cast.medallion(newCtx(), 'jordan', 30, 30, 14); ART.cast.medallion(newCtx(), 'nobody', 30, 30, 14);
  const p = ART.cast.point('jordan', 'head', { x: 100, y: 500, s: 1 });
  t.ok(p.y < 500 - 150 && p.y > 500 - 260, 'Jordan head anchor height');
  t.deep(ART.cast.point('nobody', 'head', { x: 4, y: 5 }), { x: 4, y: 5 }, 'unknown cast anchors at the origin');
  const bk = ART.cast.bake('jordan', { pose: 'idle', t: 0.5, s: 0.5 });
  t.ok(bk && bk.canvas && typeof bk.draw === 'function' && /^rj\|jordan\|/.test(bk.key), 'bake returns a handle keyed rj|jordan|...');
  bk.draw(newCtx(), 50, 100, 0.5);
  t.eq(issues(), '', 'Jordan is clean');
});

t.test('determinism and balance', () => {
  CAST.forEach((id) => {
    const a = call((c) => RJ.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 2.5 })), b = call((c) => RJ.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 2.5 }));
    t.eq(a, b, `${id} is a pure function of its arguments`);
    t.ok(a !== call((c) => RJ.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 2.9 })), `${id} idle animates`);
    t.ok(a !== call((c) => RJ.draw(c, id, { x: 100, y: 300, s: 1, pose: 'walk', t: 2.5 })), `${id} walks`);
  });
  HEROES.forEach((id) => {
    const r = recorder();
    ART.hero.draw(r.ctx, id, { x: 0, y: 0, s: 1, pose: 'attack', pt: 0.1, t: 1, glow: 0.8, flip: true, alpha: 0.7 });
    t.eq(r.log.filter((l) => l === 'save()').length, r.log.filter((l) => l === 'restore()').length, `${id} saves and restores balance`);
    const kp = ART.hero.pointAt(id, 'tip', { x: 0, y: 0, s: 1, pose: 'attack', pt: ART.hero.keyPt('attack') });
    t.ok(Number.isFinite(kp.x) && Number.isFinite(kp.y), `${id} the strike tip is finite`);
    const down1 = ART.hero.pointAt(id, 'head', { s: 1, pose: 'down', pt: 0.5 }), up = ART.hero.pointAt(id, 'head', { s: 1, pose: 'idle' });
    t.ok(down1.y > up.y + 20, `${id} sits down in the down pose`);
  });
});

t.test('perf smoke: a live figure on a no-op context', () => {
  // the real budget (1.2 ms of script a figure in a browser) is read on the cast_perf sheet; this sandbox runs the same code several times
  // slower, so the smoke limit is generous and only catches a runaway (a loop per pixel, a bake every frame)
  let self = null;
  const fn = () => self;
  self = new Proxy(function () {}, { get: (tg, k) => (k === 'canvas' ? undefined : k === 'measureText' ? () => ({ width: 0 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : fn), set: () => true });
  CAST.forEach((id) => RJ.draw(self, id, { pose: 'idle' }));
  const N = 60, t0 = Date.now();
  CAST.forEach((id) => { for (let i = 0; i < N; i++) RJ.draw(self, id, { x: 0, y: 0, s: 1, pose: KIT[i % KIT.length], t: i * 0.016 }); });
  const per = (Date.now() - t0) / (N * CAST.length);
  t.ok(per < 20, `average live figure ${per.toFixed(2)} ms in the sandbox (smoke limit 20 ms)`);
  t.eq(typeof ART.sheets.cast_perf, 'function', 'the cast_perf sheet exists');
  const before = ART.sprite.stats().misses;
  for (let i = 0; i < 30; i++) HEROES.forEach((id) => ART.hero.draw(newCtx(), id, { x: 300, y: 500, s: 1, pose: 'idle', t: 50 + i * 0.016 }));
  t.ok(ART.sprite.stats().misses - before <= 4, 'live drawing bakes nothing');
});

t.test('the foe kit (RJ.foe, HV_ART_AUDIO 4.2) draws clean and keeps its promises', () => {
  const foe = RJ.foe;
  ['ink', 'pal', 'cel', 'limb', 'eyes', 'mouth', 'glossSmile', 'glossSheen', 'winOver', 'hurtFlash', 'sparkles', 'notes', 'rings', 'confetti'].forEach((k) => t.eq(typeof foe[k], 'function', `foe.${k}`));
  t.eq(foe.ink(1).color, '#22264a', 'Act I line is deep navy'); t.eq(foe.ink(2).color, '#22264a', 'Act II line is deep navy'); t.eq(foe.ink(3).color, '#5a5f7a', 'Act III line is cool slate');
  t.deep(['s', 'm', 'l', 'xl'].map((s) => foe.ink(1, s).main), [2.0, 2.4, 2.8, 3.2], 'line widths by size class');
  clean();
  const c = newCtx();
  [1, 2, 3].forEach((act) => {
    ['round', 'sleepy', 'glare', 'dot', 'heart', 'screen', 'needle', 'lens', 'bogus'].forEach((kind) => [1, 0.5, 0].forEach((open) => foe.eyes(c, 50, 50, 16, { kind, act, open, look: [0.5, -0.5] })));
    foe.eyes(c, 50, 50, 16, { n: 1, kind: 'round' }); foe.eyes(c, NaN, NaN, NaN, null);
    ['smile', 'grin', 'happyOpen', 'ow', 'frown', 'glossSmile', 'squeal', 'O', 'grumble', 'bogus'].forEach((m) => foe.mouth(c, 50, 80, 18, m, { act }));
    foe.cel(c, [[0, 0], [40, 0], [40, 40], [0, 40]], '#ff9fc6', { act, size: 'xl' }); foe.limb(c, [0, 0], [10, 20], 10, '#8fe3c0', { act }); foe.limb(c, null, [1, 1], 4);
    foe.glossSheen(c, [0, 0, 80, 60], 1, { t: 1, shape: [[0, 0], [80, 0], [80, 60], [0, 60]] }); foe.glossSheen(c, [0, 0, -5, NaN], NaN); foe.glossSmile(c, 10, 10, 12, { act });
    foe.sparkles(c, 50, 50, [[0, 0, 5, 0], [10, 4, 4, 1]], act, 1); foe.notes(c, 50, 50, 1, act); foe.rings(c, 50, 50, 12, act, 1.3);
    [0, 0.3, 0.7, 1].forEach((q) => foe.confetti(c, 50, 50, q, act, {}));
  });
  t.eq(issues(), '', 'every helper, kind and Act is clean');
  // the win-over: the body draws until the pop and never after 0.62; the Gloss layer only while it flakes off
  const calls = [];
  const opts = { act: 2, box: [-40, -80, 40, 0], draw: () => calls.push('body'), gloss: (g, S, k) => calls.push('gloss:' + k.toFixed(2)) };
  [0, 0.2, 0.34, 0.5, 0.61].forEach((p) => { calls.length = 0; foe.winOver(newCtx(), null, p, opts); t.ok(calls.indexOf('body') >= 0, `the body is drawn at p ${p}`); });
  [0.62, 0.7, 0.9, 1].forEach((p) => { calls.length = 0; foe.winOver(newCtx(), null, p, opts); t.eq(calls.length, 0, `nothing of the body after the pop (p ${p})`); });
  calls.length = 0; foe.winOver(newCtx(), null, 0.5, opts); t.ok(calls.every((x) => x === 'body'), 'the hop shows the real colours (no Gloss)');
  t.eq(call((g) => foe.winOver(g, null, 0.8, opts)), call((g) => foe.winOver(g, null, 0.8, opts)), 'the win-over is deterministic');
  t.ok(call((g) => foe.winOver(g, null, 0.8, opts)) !== call((g) => foe.winOver(g, null, 0.9, opts)), 'the confetti moves');
  // the hurt flash: white blits while the hit is fresh, none once it has faded
  const blits = (k) => call((g) => foe.hurtFlash(g, null, k, { key: 'test', box: [-30, -60, 30, 0], draw: (gg) => { gg.fillRect(-20, -50, 40, 50); } })).split('\n').filter((l) => l.indexOf('drawImage(') === 0).length;
  t.ok(blits(1) > blits(0.4) && blits(0.4) > blits(0), `fresh hits flash more (${blits(1)}, ${blits(0.4)}, ${blits(0)})`);
  t.eq(issues(), '', 'win-over and hurt flash are clean');
  clean();
  [[1600, 900], [500, 400]].forEach(([w, h]) => ART.sheets.foe_kit(doc.createElement('canvas'), { w, h, t: 0.7 }));
  t.eq(issues(), '', 'the foe_kit sheet is clean');
});

t.test('the cast sheets draw', () => {
  ['heroes', 'hero_anim', 'portraits', 'hero_lineup', 'hero_dev', 'cast_skins', 'cast_jordan', 'cast_perf'].forEach((name) => {
    t.eq(typeof ART.sheets[name], 'function', `sheet ${name}`);
    [[1600, 900, 0], [500, 320, 1.3]].forEach(([w, h, tt]) => {
      clean();
      let threw = null;
      try { ART.sheets[name](doc.createElement('canvas'), { w, h, t: tt, scale: 1, dpr: 1, res: 1, skin: tt ? 'skin' : undefined }); } catch (e) { threw = e; }
      t.ok(!threw, `${name} ${w}x${h} does not throw ${threw ? threw.message : ''}`);
      t.eq(issues(), '', `${name} ${w}x${h} clean`);
    });
  });
});

t.done();
