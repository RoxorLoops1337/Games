// ART for chapter 3 (art_enemies_3.js): the 17 creatures of the Crimson Sky Citadel, headless on the strict canvas stub.
//
// What this pins down:
//   * exactly the 17 roster ids of chapter 3 are registered as real art, with sane bounds for their size class, and nothing else
//   * every id x every enemy pose x several t and pt values draws without throwing, issues draw calls, is clean on the strict stub (no non-finite
//     numbers, no negative radii, balanced save and restore) and never leaves the canvas state unbalanced
//   * the art lives: idle changes with t, each pose differs from idle, a death ends with nothing drawn, every phase of the boss draws
//   * odd input is harmless (NaN, negative, huge, unknown pose, flip, alpha, hpPct from 0 to 1, reduced motion)
//   * the cost stays a small fraction of a frame and steady state bakes nothing
//   * the gallery sheets (enemies3, boss3, enemies3_anim, enemies3_dev) draw at several sizes
import { boot, harness } from './rogue_book_lib.mjs';

const t = harness('rogue_book art enemies 3');
const api = boot({ only: ['util', 'data*', 'art', 'art_enemies_3'] });
const { ART, DATA } = api;
const L = DATA.LISTS;
t.ok(!api._errors || api._errors.length === 0, 'art_enemies_3 loads without errors: ' + JSON.stringify(api._errors));
t.ok(!api._warnings || api._warnings.length === 0, 'no load warnings: ' + JSON.stringify(api._warnings));
const doc = api._doc;
const newCtx = () => doc.createElement('canvas').getContext('2d');
const clean = () => { api._resetCounts(); };
const issues = () => api._issues.map((i) => `${i.kind}: ${i.detail}`).slice(0, 5).join(' | ');

const ids = new WeakMap();
let idN = 0;
const idOf = (o) => { if (!ids.has(o)) ids.set(o, ++idN); return ids.get(o); };
function recorder() {
  const log = [];
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(3) : typeof v === 'string' ? v : Array.isArray(v) ? '[' + v.join(',') + ']' : v && v._kind ? 'grad' : v && typeof v === 'object' ? 'obj#' + idOf(v) : String(v));
  const real = newCtx();
  const proxy = new Proxy(real, {
    get(target, key) {
      const v = target[key];
      if (typeof v === 'function') return (...a) => { log.push(key + '(' + a.map(fmt).join(',') + ')'); return v.apply(target, a); };
      return v;
    },
    set(target, key, v) { target[key] = v; log.push('=' + String(key) + ':' + fmt(v)); return true; },
  });
  return { ctx: proxy, log, real };
}
const call = (fn) => { const r = recorder(); fn(r.ctx); return r.log.join('\n'); };

const ROSTER = (DATA.ROSTER && DATA.ROSTER[3] ? DATA.ROSTER[3] : []).map((r) => r.id);
const POSES = L.enemyPoses;
const KEYPT = { idle: 0, attack: 0.21, hurt: 0.07, block: 0.2, buff: 0.16, die: 0.3, telegraph: 0.6 };
const drawAt = (ctx, id, o) => ART.enemy.draw(ctx, id, Object.assign({ x: 400, y: 520, s: 1, pose: 'idle', t: 0, pt: 0, phase: 0, hpPct: 1 }, o));

// ------------------------------------------------------------------ registry
t.test('the roster of chapter 3 has 17 ids: 10 normals, 3 elites, 3 minions, 1 boss', () => {
  t.eq(ROSTER.length, 17, 'seventeen ids in DATA.ROSTER[3]');
  const tiers = {};
  DATA.ROSTER[3].forEach((r) => { tiers[r.tier] = (tiers[r.tier] || 0) + 1; });
  t.deep(tiers, { normal: 10, elite: 3, minion: 3, boss: 1 }, 'tier counts');
});
t.test('every id of chapter 3 is real art and nothing else is registered here', () => {
  ROSTER.forEach((id) => t.ok(ART.has('enemy', id), `ART.has('enemy', '${id}')`));
  const mine = ART.enemy.ids3();
  t.deep(mine.slice().sort(), ROSTER.slice().sort(), 'ART.enemy.ids3() is exactly the chapter 3 roster');
  DATA.ROSTER[1].concat(DATA.ROSTER[2]).forEach((r) => t.ok(mine.indexOf(r.id) < 0, `${r.id} belongs to another chapter`));
});
t.test('bounds are sane for the size class and the anchors sit inside the box', () => {
  DATA.ROSTER[3].forEach((r) => {
    const b = ART.enemy.bounds(r.id), nominal = L.sizeHeight[r.size] * (r.tier === 'elite' ? 1.08 : 1);
    t.ok(b.w > 40 && b.h > 60, `${r.id} has a real box (${b.w} x ${b.h})`);
    t.ok(b.h >= nominal * 0.72 && b.h <= nominal * 1.4, `${r.id} height ${Math.round(b.h)} fits ${r.size} (${Math.round(nominal)} nominal)`);
    t.ok(b.head.y < b.body.y && b.body.y < 0 && b.feet.y === 0, `${r.id} head is above body above feet`);
    t.ok(Math.abs(b.head.x) <= b.w / 2 && Math.abs(b.body.x) <= b.w / 2, `${r.id} anchors are inside the width`);
    t.ok(-b.head.y <= b.h * 1.02 + 6 && -b.head.y >= b.h * 0.55, `${r.id} head anchor sits at the top of the box`);
  });
  t.ok(ART.enemy.bounds('boss_editor').h >= 320, 'the boss is xl: about 340 px tall');
});
t.test('warm3 pre-bakes and refuses unknown ids', () => {
  ART.sprite.clear();
  const before = ART.sprite.stats().misses;
  t.ok(ART.enemy.warm3('storm_drone', 1) >= 4, 'warm3 bakes the parts of a creature');
  t.ok(ART.sprite.stats().misses > before, 'warm3 populated the sprite cache');
  t.eq(ART.enemy.warm3('nope', 1), 0, 'unknown id bakes nothing');
});

// ------------------------------------------------------------------ every id x every pose x several times
t.test('every id, every pose, several t and pt: no throw, draws, clean on the strict stub', () => {
  const phases = (id) => (id === 'boss_editor' ? [0, 1, 2] : [0]);
  ROSTER.forEach((id) => phases(id).forEach((phase) => POSES.forEach((pose) => [0, 0.37, 1.9, 7.3].forEach((tt, k) => {
    const pts = pose === 'idle' ? [0] : [0, KEYPT[pose], 0.12 + 0.11 * k, 0.7, 2];
    pts.forEach((pt) => {
      clean();
      const ctx = newCtx();
      let threw = null;
      try { drawAt(ctx, id, { pose, t: tt, pt, phase, hpPct: k === 3 ? 0.15 : k === 2 ? 0.5 : 1 }); } catch (e) { threw = e; }
      t.ok(!threw, `${id} p${phase} ${pose} t=${tt} pt=${pt} does not throw ${threw ? threw.message + ' ' + String(threw.stack).split('\n')[1] : ''}`);
      const draws = (api._counts.drawImage || 0) + (api._counts.fill || 0) + (api._counts.stroke || 0);
      const finished = pose === 'die' && pt >= 0.7;
      t.ok(finished || draws > 0, `${id} ${pose} t=${tt} pt=${pt} issues draw calls`);
      t.eq(issues(), '', `${id} p${phase} ${pose} t=${tt} pt=${pt} is clean`);
    });
  }))));
});
t.test('save and restore stay balanced for every creature and pose', () => {
  ROSTER.forEach((id) => POSES.forEach((pose) => {
    const ctx = newCtx();
    drawAt(ctx, id, { pose, t: 1.3, pt: KEYPT[pose], phase: id === 'boss_editor' ? 2 : 0 });
    t.eq(ctx._depth, 0, `${id} ${pose} balances save and restore`);
  }));
});

// ------------------------------------------------------------------ the art lives
t.test('idle is deterministic and animates with t, for every creature and all three boss phases', () => {
  ROSTER.forEach((id) => [0, 1, 2].forEach((phase) => {
    if (phase > 0 && id !== 'boss_editor') return;
    const a = call((c) => drawAt(c, id, { t: 1.1, phase })), b = call((c) => drawAt(c, id, { t: 1.1, phase }));
    t.eq(a, b, `${id} p${phase} idle is deterministic`);
    t.ok(a !== call((c) => drawAt(c, id, { t: 1.9, phase })), `${id} p${phase} idle is never static (t 1.1 vs 1.9)`);
  }));
});
t.test('every pose looks different from idle, and a death ends with nothing drawn', () => {
  ROSTER.forEach((id) => {
    const idle = call((c) => drawAt(c, id, { t: 1.1, pose: 'idle' }));
    ['attack', 'hurt', 'block', 'buff', 'telegraph', 'die'].forEach((pose) => t.ok(call((c) => drawAt(c, id, { t: 1.1, pose, pt: KEYPT[pose] })) !== idle, `${id} ${pose} differs from idle`));
    const tier = DATA.enemies[id] ? DATA.enemies[id].tier : 'normal';
    if (tier === 'normal' || tier === 'minion') {
      clean();
      drawAt(newCtx(), id, { pose: 'die', pt: 1.2 });
      t.eq(api._counts.drawImage || 0, 0, `${id} a finished death draws no sprites`);
    }
  });
});
t.test('one-shot poses progress with pt (a wind-up is not a still) and hold their end pose', () => {
  ROSTER.forEach((id) => {
    const a = call((c) => drawAt(c, id, { t: 0.5, pose: 'attack', pt: 0.05 })), b = call((c) => drawAt(c, id, { t: 0.5, pose: 'attack', pt: 0.21 }));
    t.ok(a !== b, `${id} attack changes over its 420 ms`);
    t.eq(call((c) => drawAt(c, id, { t: 0.5, pose: 'hurt', pt: 5 })), call((c) => drawAt(c, id, { t: 0.5, pose: 'hurt', pt: 9 })), `${id} hurt holds its end pose`);
    const t1 = call((c) => drawAt(c, id, { t: 0.5, pose: 'telegraph', pt: 0.5 })), t2 = call((c) => drawAt(c, id, { t: 0.5, pose: 'telegraph', pt: 3 }));
    t.eq(t1, t2, `${id} telegraph holds once wound up`);
  });
});
t.test('the boss has three distinct forms, each an assembly of many parts', () => {
  const f = (phase, o) => call((c) => drawAt(c, 'boss_editor', Object.assign({ t: 1, phase }, o || {})));
  const p0 = f(0), p1 = f(1), p2 = f(2);
  t.ok(p0 !== p1 && p1 !== p2 && p0 !== p2, 'phases 0, 1 and 2 draw differently');
  t.eq(f(3), p2, 'a later phase keeps the last form');
  t.ok(p2 !== f(2, { hpPct: 0.1 }), 'the Blank Page leaks more storm when nearly dead');
  t.ok(p1 !== f(1, { hpPct: 0.1 }), 'the Eraser is angrier when nearly dead');
  const parts = (phase) => { const r = recorder(); drawAt(r.ctx, 'boss_editor', { t: 1, phase }); return r.log.filter((l) => l.indexOf('drawImage(') === 0).length; };
  t.ok(parts(0) >= 24 && parts(1) >= 10 && parts(2) >= 10, `the boss is an assembly of many parts (${parts(0)}, ${parts(1)} and ${parts(2)} sprite draws)`);
  const sizes = [0, 1, 2].map((ph) => { const r = recorder(); drawAt(r.ctx, 'boss_editor', { t: 1, phase: ph, pose: 'attack', pt: 0.21 }); return r.log.length; });
  t.ok(sizes.every((n) => n > 80), 'every form issues a rich set of draw calls on an attack: ' + sizes.join(', '));
  // each form dissolves with its own scheme
  const d = [0, 1, 2].map((ph) => call((c) => drawAt(c, 'boss_editor', { phase: ph, pose: 'die', pt: 0.3, t: 1 })));
  t.ok(d[0] !== d[1] && d[1] !== d[2], 'each form has its own death');
  [0, 1, 2].forEach((ph) => { clean(); drawAt(newCtx(), 'boss_editor', { phase: ph, pose: 'die', pt: 1.2 }); const fin = api._counts.drawImage || 0; clean(); drawAt(newCtx(), 'boss_editor', { phase: ph, pose: 'idle', t: 1 }); t.ok(fin * 2 < (api._counts.drawImage || 1), `phase ${ph} finished death draws (almost) no part sprites (${fin} vs ${api._counts.drawImage})`); });
});
t.test('a hurt creature flashes: extra silhouettes are drawn while it is fresh', () => {
  ['storm_drone', 'paper_golem', 'black_bar_inquisitor', 'boss_editor'].forEach((id) => {
    const r0 = recorder(); drawAt(r0.ctx, id, { pose: 'hurt', pt: 0.02 });
    const r1 = recorder(); drawAt(r1.ctx, id, { pose: 'hurt', pt: 0.6 });
    const n = (r) => r.log.filter((l) => l.indexOf('drawImage(') === 0).length;
    t.ok(n(r0) > n(r1), `${id} draws white silhouettes at the start of a hit (${n(r0)} vs ${n(r1)})`);
  });
});

// ------------------------------------------------------------------ odd input
t.test('odd input never throws and never produces a canvas issue', () => {
  ROSTER.forEach((id) => {
    clean();
    const ctx = newCtx();
    [{ s: 0.5 }, { s: 2.4 }, { s: NaN }, { s: 0 }, { t: NaN }, { t: 1e6 }, { t: -5 }, { pt: -1, pose: 'attack' }, { pt: NaN, pose: 'die' }, { pose: 'no_such_pose' }, { phase: 7 }, { phase: NaN }, { hpPct: 0 }, { hpPct: 2 }, { hpPct: NaN },
      { flip: true, pose: 'attack', pt: 0.2 }, { alpha: 0.5 }, { glow: 1 }, { glow: '#ffcc00' }, {}].forEach((o) => {
      let threw = null;
      try { drawAt(ctx, id, o); } catch (e) { threw = e; }
      t.ok(!threw, `${id} ${JSON.stringify(o)} does not throw ${threw ? threw.message : ''}`);
    });
    try { ART.enemy.draw(ctx, id); ART.enemy.draw(ctx, id, null); } catch (e) { t.ok(false, `${id} bare draw threw ${e.message}`); }
    t.eq(issues(), '', `${id} odd input is clean`);
    t.eq(ctx._depth, 0, `${id} odd input balances save and restore`);
  });
});
t.test('an unknown pose is drawn as idle', () => {
  ROSTER.forEach((id) => t.eq(call((c) => drawAt(c, id, { pose: 'no_such_pose', t: 2.2 })), call((c) => drawAt(c, id, { pose: 'idle', t: 2.2 })), `${id} unknown pose is idle`));
});
t.test('reduced motion keeps every creature drawable and calmer', () => {
  const was = ART.tk.opt;
  ART.tk.opt = { reduceMotion: true, quality: 'high' };
  try {
    ROSTER.forEach((id) => { clean(); const ctx = newCtx(); POSES.forEach((pose) => drawAt(ctx, id, { pose, t: 2.7, pt: KEYPT[pose], phase: id === 'boss_editor' ? 2 : 0 })); t.eq(issues(), '', `${id} reduce motion is clean`); });
  } finally { ART.tk.opt = was; }
  ART.tk.opt = { reduceMotion: false, quality: 'low' };
  try { ROSTER.forEach((id) => { clean(); drawAt(newCtx(), id, { pose: 'attack', pt: 0.2, t: 1 }); t.eq(issues(), '', `${id} low quality is clean`); }); } finally { ART.tk.opt = was; }
});
t.test('every creature scales cleanly and quantises its raster scale', () => {
  ART.sprite.clear();
  const ctx = newCtx();
  for (let s = 0.4; s <= 2.4; s += 0.1) ROSTER.forEach((id) => drawAt(ctx, id, { s, t: 0.4 }));
  t.ok(ART.sprite.stats().count <= ART.sprite.maxCount, 'the sprite cache stays within its cap while scaling every creature');
  ART.sprite.clear();
});

// ------------------------------------------------------------------ gallery
t.test('the gallery sheets are registered and draw at several sizes and times', () => {
  ['enemies3', 'boss3', 'enemies3_anim', 'enemies3_dev'].forEach((name) => {
    t.eq(typeof ART.sheets[name], 'function', `sheet ${name} is registered`);
    [[1600, 900, 0], [800, 450, 1.7], [400, 300, 9.3]].forEach(([w, h, tt]) => {
      clean();
      const canvas = doc.createElement('canvas');
      canvas.width = w; canvas.height = h;
      let threw = null;
      try { ART.sheets[name](canvas, { w, h, t: tt, scale: 1, dpr: 1, res: 1 }); } catch (e) { threw = e; }
      t.ok(!threw, `${name} ${w}x${h} t=${tt} does not throw ${threw ? threw.message : ''}`);
      t.eq(issues(), '', `${name} ${w}x${h} is clean`);
    });
  });
  const c = doc.createElement('canvas');
  ART.sheets.enemies3_dev(c, { w: 900, h: 400, id: 'censor_golem,thunder_crow', pose: 'attack' });
  ART.sheets.enemies3_dev(c, { w: 1400, h: 400, id: 'boss_editor', pose: 'all', phase: 2, hp: 0.1 });
  ART.sheets.enemies3(c, { w: 1200, h: 700, poses: 'idle,die,buff,block' });
  ART.sheets.enemies3_anim(c, { w: 1200, h: 700, ids: 'sky_serpent,boss_editor' });
  t.eq(issues(), '', 'sheet options are clean');
  t.throws(() => ART.sheet('enemies3', () => {}), 'a sheet name cannot be registered twice', /duplicate/);
});

// ------------------------------------------------------------------ performance
t.test('performance smoke: a draw costs a small fraction of a frame and steady state bakes nothing', () => {
  ART.sprite.clear();
  const ctx = newCtx();
  ROSTER.forEach((id) => ART.enemy.warm3(id, 1));
  const poses = ['idle', 'attack', 'hurt', 'telegraph'];
  const N = 40, t0 = Date.now();
  let n = 0;
  for (let i = 0; i < N; i++) ROSTER.forEach((id) => { drawAt(ctx, id, { pose: poses[i % 4], t: i * 0.016, pt: (i % 26) * 0.016, phase: id === 'boss_editor' ? i % 3 : 0 }); n++; });
  const per = (Date.now() - t0) / n;
  t.ok(per < 12, `average creature draw ${per.toFixed(2)} ms on the checking stub (limit 12 ms; real canvases are far faster)`);
  const st0 = ART.sprite.stats();
  t.ok(ART.sprite.stats().count <= ART.sprite.maxCount, 'the sprite cache stays within its cap');
  ART.sprite.clear();
  const group = ['komainu_guardian', 'sky_serpent', 'censor_golem', 'storm_whelp', 'black_bar_inquisitor'];
  group.forEach((id) => ART.enemy.warm3(id, 1));
  group.forEach((id) => ['idle', 'attack', 'hurt', 'telegraph'].forEach((pose) => drawAt(ctx, id, { pose, pt: 0.1, t: 1 })));
  t.ok(ART.sprite.stats().count < 220, `a five-enemy fight of the biggest creatures fits the shared sprite cache (${ART.sprite.stats().count} sprites)`);
  [0, 1, 2].forEach((ph) => {
    ART.sprite.clear();
    ART.enemy.warm3('boss_editor', 1);
    ['idle', 'attack', 'hurt', 'telegraph'].forEach((pose) => drawAt(ctx, 'boss_editor', { pose, pt: 0.1, t: 1, phase: ph }));
    t.ok(ART.sprite.stats().count < 160, `the boss in form ${ph} is a modest number of sprites (${ART.sprite.stats().count})`);
  });
  ART.sprite.clear();
  group.forEach((id) => ART.enemy.warm3(id, 1));
  group.forEach((id) => drawAt(ctx, id, { pose: 'idle', t: 40 }));
  const before = ART.sprite.stats().misses;
  for (let i = 0; i < 30; i++) group.forEach((id) => drawAt(ctx, id, { pose: 'idle', t: 50 + i * 0.016 }));
  t.ok(ART.sprite.stats().misses - before <= 4, `steady state bakes almost nothing (${ART.sprite.stats().misses - before} new sprites)`);
});

t.done();
