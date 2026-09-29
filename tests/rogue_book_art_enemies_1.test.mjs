// ART enemies, chapter 1 (js/art_enemies_1.js): the Whispering Bamboo Grove, headless on the strict canvas stub.
//
// What this pins down:
//   * every id of the fixed chapter 1 roster (10 normals, 3 elites, 3 minions, the boss) is registered as REAL art (ART.has) with sane bounds
//   * every id draws every pose (idle attack hurt block buff die telegraph) at several t and pt values, at several scales, flipped and not,
//     without throwing and without a single canvas issue (NaN, bad arguments, unbalanced save and restore)
//   * drawing is deterministic (same arguments, same calls), idle is never static, every pose changes the picture, one-shot poses hold their
//     end pose for any larger pt, death ends in nothing, unknown poses fall back to idle, phase and hpPct only change what they should
//   * the boss changes look per phase, elites and the boss are grander than the normals, minions are small
//   * the gallery sheets (enemies1, boss1, enemies1_anim, enemy1_dev) run and draw
//   * performance smoke: a draw stays far below a frame, and a whole encounter fits the sprite cache
import { boot, harness } from './rogue_book_lib.mjs';

const t = harness('rogue_book art enemies 1');
const api = boot({ only: ['util', 'data*', 'art', 'art_heroes', 'art_enemies_1'] });
const { ART, DATA } = api;
const L = DATA.LISTS;
t.ok(!api._errors || api._errors.length === 0, 'art_enemies_1 loads without errors: ' + JSON.stringify(api._errors));
t.ok(!api._warnings || api._warnings.length === 0, 'no load warnings: ' + JSON.stringify(api._warnings));

const doc = api._doc;
const newCtx = () => doc.createElement('canvas').getContext('2d');
const issues = () => api._issues.map((i) => `${i.kind}: ${i.detail} @ ${i.at}`).slice(0, 4).join(' | ');
const ids = new WeakMap();
let idN = 0;
const idOf = (o) => { if (!ids.has(o)) ids.set(o, ++idN); return ids.get(o); };
// a recording context: every call and property write becomes a string, so two drawings can be compared
function recorder() {
  const log = [];
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : typeof v === 'string' ? v : Array.isArray(v) ? '[' + v.join(',') + ']' : v && v._kind ? 'grad' : v && typeof v === 'object' ? 'obj#' + idOf(v) : String(v));
  const real = newCtx();
  const proxy = new Proxy(real, {
    get(target, key) {
      const v = target[key];
      if (typeof v === 'function') return (...a) => { log.push(key + '(' + a.map(fmt).join(',') + ')'); return v.apply(target, a); };
      return v;
    },
    set(target, key, v) { target[key] = v; log.push('=' + String(key) + ':' + fmt(v)); return true; },
  });
  return { ctx: proxy, log };
}
const record = (id, o) => { const r = recorder(); ART.enemy.draw(r.ctx, id, Object.assign({ x: 100, y: 200 }, o)); return r.log.join('\n'); };
const draws = (log) => log.split('\n').filter((l) => l.indexOf('drawImage') === 0).length;

const ROSTER = DATA.ROSTER[1];
const IDS = ROSTER.map((r) => r.id);
const POSES = L.enemyPoses;
const BOSS = 'boss_kuzunoha';

t.test('the chapter 1 roster is complete: 10 normals, 3 elites, 3 minions, the boss', () => {
  t.eq(IDS.length, 17, '17 ids in DATA.ROSTER[1]');
  const by = (tier) => ROSTER.filter((r) => r.tier === tier).length;
  t.eq(by('normal'), 10, '10 normals'); t.eq(by('elite'), 3, '3 elites'); t.eq(by('minion'), 3, '3 minions'); t.eq(by('boss'), 1, 'the boss');
  t.eq(typeof ART.enemy.ch1, 'object', 'ART.enemy.ch1 dev helpers exist');
  t.deep(ART.enemy.ch1.ids.slice().sort(), IDS.slice().sort(), 'the file draws exactly the roster ids');
});
t.test('every id is registered as real art with sane bounds', () => {
  IDS.forEach((id) => {
    t.ok(ART.has('enemy', id), `ART.has enemy ${id}`);
    const b = ART.enemy.bounds(id), def = DATA.enemies[id], nominal = L.sizeHeight[def.size] * (def.tier === 'elite' ? 1.08 : 1);
    t.ok(b.w > 40 && b.w < 700 && b.h > 60 && b.h < 460, `${id} bounds size ${b.w}x${b.h}`);
    t.ok(b.h > nominal * 0.7 && b.h < nominal * 1.4, `${id} height ${b.h} is near the nominal ${nominal}`);
    t.ok(b.head.y < 0 && b.head.y > -b.h * 1.2 && b.body.y < 0 && b.body.y > b.head.y && b.feet.x === 0 && b.feet.y === 0, `${id} anchors are ordered head above body above feet`);
    t.ok(Math.abs(b.head.x) < b.w && Math.abs(b.body.x) < b.w, `${id} anchors sit inside the width`);
  });
});
t.test('size classes read: minions are small, elites and the boss are grand', () => {
  const h = (id) => ART.enemy.bounds(id).h;
  ['ember_wisp', 'leaf_imp', 'paper_kodama'].forEach((id) => t.ok(h(id) < 125, `${id} is small`));
  ['oni_brute', 'tengu_duelist', 'moss_guardian'].forEach((id) => t.ok(h(id) > 240, `${id} is tall`));
  t.ok(h(BOSS) > 330 && ART.enemy.bounds(BOSS).w > h(BOSS), 'the boss is xl and wider than tall');
  ['kappa', 'tanuki_bandit', 'karakasa', 'oni_cub', 'crow_tengu', 'mushroom_folk'].forEach((id) => t.ok(h(id) > 150 && h(id) < 210, `${id} is medium`));
});

t.test('every id draws every pose at several t and pt without an issue', () => {
  api._resetCounts();
  const ctx = newCtx();
  let n = 0;
  IDS.forEach((id) => POSES.forEach((pose) => {
    [0, 0.37, 1.9, 7.3].forEach((tt) => [0, 0.05, 0.19, 0.42, 0.7, 1.4].forEach((pt) => [0, 1, 2].forEach((phase) => {
      ART.enemy.draw(ctx, id, { x: 640, y: 520, s: 1, pose, t: tt, pt, phase, hpPct: 0.6 }); n++;
    })));
  }));
  t.ok(n > 5000, 'drew ' + n + ' frames');
  t.eq(issues(), '', 'no canvas issues while drawing every id, pose, t, pt and phase');
});
t.test('scales, flips, alpha and odd options never break a draw', () => {
  api._resetCounts();
  const ctx = newCtx();
  IDS.forEach((id) => {
    [0.3, 0.5, 1, 1.5, 2.4].forEach((s) => ART.enemy.draw(ctx, id, { x: 300, y: 500, s, pose: 'attack', t: 1.1, pt: 0.2 }));
    ART.enemy.draw(ctx, id, { x: 300, y: 500, flip: true, pose: 'telegraph', t: 2, pt: 0.6 });
    ART.enemy.draw(ctx, id, { x: 300, y: 500, alpha: 0.4, glow: 0.7, pose: 'buff', t: 2, pt: 0.2 });
    ART.enemy.draw(ctx, id, { x: 300, y: 500, glow: '#ffe9a8', pose: 'idle' });
    ART.enemy.draw(ctx, id, { pose: 'not_a_pose', t: NaN, pt: NaN, s: NaN, phase: 'x', hpPct: -3 });
    ART.enemy.draw(ctx, id, {});
    ART.enemy.draw(ctx, id);
    ART.enemy.draw(ctx, id, { pose: 'die', pt: 0.3, t: 3, s: 1.08, phase: 1 });
  });
  t.eq(issues(), '', 'no canvas issues from odd options');
});
t.test('reduced motion and low quality never break a draw', () => {
  const keep = ART.tk.opt;
  api._resetCounts();
  const ctx = newCtx();
  [{ reduceMotion: true, quality: 'low' }, { reduceMotion: true, quality: 'high' }, { reduceMotion: false, quality: 'low' }].forEach((o) => {
    ART.tk.opt = o; ART.sprite.clear();
    IDS.forEach((id) => POSES.forEach((pose) => ART.enemy.draw(ctx, id, { x: 200, y: 400, pose, t: 1.7, pt: 0.2, phase: 1 })));
  });
  ART.tk.opt = keep; ART.sprite.clear();
  t.eq(issues(), '', 'no canvas issues with reduced motion and low quality');
});
t.test('every id issues real draw calls in every pose', () => {
  IDS.forEach((id) => POSES.forEach((pose) => {
    const lg = record(id, { pose, t: 1.3, pt: pose === 'die' ? 0.3 : 0.15 });
    t.ok(lg.length > 200 && draws(lg) >= 3, `${id} ${pose} draws (${draws(lg)} images)`);
  }));
});

t.test('drawing is deterministic', () => {
  IDS.forEach((id) => POSES.forEach((pose) => {
    const o = { pose, t: 2.6, pt: 0.21, phase: 1, hpPct: 0.5 };
    record(id, o);
    t.eq(record(id, o), record(id, o), `${id} ${pose} repeats exactly`);
  }));
});
t.test('idle is never static: the picture changes with t', () => {
  IDS.forEach((id) => {
    const seen = new Set();
    [0, 0.4, 0.9, 1.3, 1.9, 2.5].forEach((tt) => seen.add(record(id, { pose: 'idle', t: tt })));
    t.ok(seen.size >= 5, `${id} idle animates (${seen.size} distinct frames of 6)`);
  });
});
t.test('every pose changes the picture: attack, hurt, block, buff, die and telegraph differ from idle and from each other', () => {
  IDS.forEach((id) => {
    const idle = record(id, { pose: 'idle', t: 1.1, pt: 0 });
    const frames = { attack: 0.19, hurt: 0.05, block: 0.14, buff: 0.17, die: 0.3, telegraph: 0.5 };
    const logs = {};
    Object.keys(frames).forEach((pose) => { logs[pose] = record(id, { pose, t: 1.1, pt: frames[pose] }); t.ok(logs[pose] !== idle, `${id} ${pose} differs from idle`); });
    t.eq(new Set(Object.values(logs)).size, 6, `${id}: the six one-shot and hold poses are six different pictures`);
  });
});
t.test('one-shot poses ease in over pt: the picture changes from the first frame to the peak', () => {
  IDS.forEach((id) => ['attack', 'hurt', 'block', 'buff', 'die'].forEach((pose) => {
    t.ok(record(id, { pose, t: 1.1, pt: 0 }) !== record(id, { pose, t: 1.1, pt: pose === 'die' ? 0.35 : pose === 'attack' ? 0.19 : 0.1 }), `${id} ${pose} moves with pt`);
  }));
});
t.test('one-shot poses hold their end pose for any larger pt', () => {
  IDS.forEach((id) => {
    ['attack', 'hurt', 'block', 'buff'].forEach((pose) => {
      const ms = ART.enemy.poseMs(pose) / 1000;
      t.eq(record(id, { pose, t: 3, pt: ms }), record(id, { pose, t: 3, pt: ms + 2.5 }), `${id} ${pose} holds after ${ms}s`);
    });
    t.eq(record(id, { pose: 'die', t: 3, pt: 0.7 }), record(id, { pose: 'die', t: 3, pt: 4 }), `${id} die holds`);
  });
});
t.test('telegraph holds: after the wind-up it only trembles, it does not run away', () => {
  IDS.forEach((id) => t.ok(draws(record(id, { pose: 'telegraph', t: 1, pt: 1.2 })) >= 3, `${id} telegraph at pt 1.2 still draws`));
});
t.test('death ends in nothing of the body: far fewer draws than a live creature', () => {
  IDS.forEach((id) => {
    const alive = draws(record(id, { pose: 'idle', t: 1 })), dead = draws(record(id, { pose: 'die', t: 1, pt: 0.9 }));
    t.ok(dead < alive * 0.5 + 6, `${id}: ${dead} images after death against ${alive} alive`);
  });
});
t.test('an unknown pose is idle', () => {
  IDS.forEach((id) => t.eq(record(id, { pose: 'cheer', t: 1.4 }), record(id, { pose: 'idle', t: 1.4 }), `${id} unknown pose draws as idle`));
});
t.test('poseMs matches the DESIGN lengths', () => {
  t.eq(ART.enemy.poseMs('attack'), 420, 'attack'); t.eq(ART.enemy.poseMs('hurt'), 260, 'hurt'); t.eq(ART.enemy.poseMs('block'), 300, 'block');
  t.eq(ART.enemy.poseMs('buff'), 400, 'buff'); t.eq(ART.enemy.poseMs('die'), 700, 'die'); t.eq(ART.enemy.poseMs('telegraph'), 0, 'telegraph'); t.eq(ART.enemy.poseMs('idle'), 0, 'idle');
});

t.test('the boss changes look per phase and keeps its parts independent', () => {
  const p0 = record(BOSS, { pose: 'idle', t: 1.2, phase: 0 }), p1 = record(BOSS, { pose: 'idle', t: 1.2, phase: 1 });
  t.ok(p0 !== p1, 'phase 1 looks different from phase 0');
  t.eq(record(BOSS, { pose: 'idle', t: 1.2, phase: 1 }), record(BOSS, { pose: 'idle', t: 1.2, phase: 7 }), 'phases above 1 draw as phase 1');
  POSES.forEach((pose) => t.ok(record(BOSS, { pose, t: 1.2, pt: 0.2, phase: 0 }) !== record(BOSS, { pose, t: 1.2, pt: 0.2, phase: 1 }), `boss ${pose} differs between phases`));
  t.ok(draws(p1) > 30 && draws(p0) > 25, `the boss is a big assembly (${draws(p0)} and ${draws(p1)} images)`);
  // independent parts: two nearby times change different parts of the drawing, so the diff is partial and not total
  const a = record(BOSS, { pose: 'idle', t: 1.2, phase: 1 }).split('\n'), b = record(BOSS, { pose: 'idle', t: 1.5, phase: 1 }).split('\n');
  const same = a.filter((l, i) => b[i] === l).length;
  t.ok(same > a.length * 0.3 && same < a.length * 0.98, 'part motion is partial (tails, mask and pages move on their own)');
});
t.test('phase and hpPct only change what they should', () => {
  ['kappa', 'tanuki_bandit', 'kodama', 'karakasa', 'bamboo_boar', 'leaf_imp'].forEach((id) => t.eq(record(id, { pose: 'idle', t: 1.2, phase: 0 }), record(id, { pose: 'idle', t: 1.2, phase: 1 }), `${id} ignores phase`));
  t.ok(record('oni_brute', { pose: 'idle', t: 1.2, phase: 0 }) !== record('oni_brute', { pose: 'idle', t: 1.2, phase: 1 }), 'the oni brute enrages in phase 1');
  t.ok(record('tengu_duelist', { pose: 'idle', t: 1.2, hpPct: 1 }) !== record('tengu_duelist', { pose: 'idle', t: 1.2, hpPct: 0.3 }), 'the duelist blade flares when hurt');
});
t.test('elites and the boss carry their ornament through ART.enemy.draw (aura ring, sparks) on top of the art', () => {
  const brute = draws(record('oni_brute', { pose: 'idle', t: 1 })), plain = draws(record('kappa', { pose: 'idle', t: 1 }));
  t.ok(brute > plain, `the brute has more parts than a kappa (${brute} vs ${plain})`);
});

t.test('the gallery sheets are registered and draw', () => {
  ['enemies1', 'boss1', 'enemies1_anim', 'enemy1_dev'].forEach((name) => t.eq(typeof ART.sheets[name], 'function', `sheet ${name}`));
  t.throws(() => ART.sheet('enemies1', () => {}), 'duplicate sheet name is refused', /duplicate/);
  api._resetCounts();
  const run = (name, p) => { const c = doc.createElement('canvas'); c.width = p.w; c.height = p.h; ART.sheets[name](c, Object.assign({ w: 1600, h: 900, t: 0.4 }, p)); };
  run('enemies1', {}); run('enemies1', { poses: 'hurt,block,buff,die' }); run('boss1', {}); run('boss1', { phase: 1 }); run('enemies1_anim', {}); run('enemies1_anim', { a: 'kodama', b: 'boss_kuzunoha', n: 6 });
  run('enemy1_dev', { id: 'all', pose: 'all' }); run('enemy1_dev', { id: 'kappa', pose: 'idle', zoom: 3 }); run('enemy1_dev', { id: BOSS, pose: 'attack', phase: 1, grove: 0 });
  t.eq(issues(), '', 'no canvas issues from the sheets');
  t.ok(api._counts && Object.values(api._counts).reduce((x, y) => x + y, 0) > 1000, 'the sheets issued draw calls');
});

t.test('performance smoke: a draw stays far below a frame', () => {
  const ctx = newCtx();
  IDS.forEach((id) => { ART.enemy.draw(ctx, id, { x: 300, y: 500, pose: 'idle', t: 0 }); });               // warm the sprite cache
  const worst = { ms: 0, id: '' };
  let total = 0, n = 0;
  IDS.forEach((id) => {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 120; i++) ART.enemy.draw(ctx, id, { x: 300, y: 500, s: 1, pose: i % 9 === 0 ? 'attack' : 'idle', t: i * 0.016, pt: (i % 9) * 0.04, phase: 1 });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 120;
    total += ms; n++;
    if (ms > worst.ms) { worst.ms = ms; worst.id = id; }
  });
  t.ok(worst.ms < (worst.id === BOSS ? 8 : 3), `the slowest draw is ${worst.id} at ${worst.ms.toFixed(3)} ms (budget 3 ms, boss 8 ms)`);
  t.ok(total / n < 1.5, `average ${(total / n).toFixed(3)} ms per draw`);
});
t.test('a whole encounter fits the sprite cache', () => {
  ART.sprite.clear();
  const ctx = newCtx();
  ['boss_kuzunoha', 'paper_kodama', 'paper_kodama'].forEach((id) => POSES.forEach((pose) => [0, 1].forEach((phase) => [0.05, 0.2, 0.5].forEach((pt) => [0.3, 1.1, 2].forEach((tt) => ART.enemy.draw(ctx, id, { x: 640, y: 520, s: 1, pose, t: tt, pt, phase }))))));
  const st = ART.sprite.stats();
  t.ok(st.count < 260, `the boss fight bakes ${st.count} sprites (cache holds ${ART.sprite.maxCount})`);
  ART.sprite.clear();
  ['tanuki_bandit', 'kodama', 'kappa', 'bamboo_sprite', 'oni_brute'].forEach((id) => POSES.forEach((pose) => [0.05, 0.2, 0.5].forEach((pt) => [0.3, 1.1, 2, 3.3].forEach((tt) => ART.enemy.draw(ctx, id, { x: 640, y: 520, s: 1.08, pose, t: tt, pt })))));
  t.ok(ART.sprite.stats().count < 250, `five normal enemies bake ${ART.sprite.stats().count} sprites`);
});

t.done();
