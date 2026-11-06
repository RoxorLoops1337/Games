// Stacking Cats: Whiskerton Walk renderer (kingdom_world.js, kingdom_strips.js). Headless: a recording fake canvas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };

// every canvas gets a call log, so two builds of one strip can be compared
let made = 0;
const r3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : typeof v === 'object' && v ? (v._g ? 'G' + v._g : 'o') : v);
function recCtx(log) {
  let gid = 0;
  const grad = () => { const id = ++gid; return { _g: id, addColorStop(...a) { log.push('stop' + id + a.map(r3)); } }; };
  const st = {};
  return new Proxy(st, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { log.push(k + a.map(r3)); return grad(); };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'canvas') return undefined;
      return (...a) => { log.push(k + a.map(r3)); };
    },
    set(o, k, v) { o[k] = v; log.push('set ' + k + '=' + r3(v)); return true; },
  });
}
globalThis.document = { hidden: false, createElement: () => { made++; const log = []; const c = { width: 0, height: 0, _log: log }; const g = recCtx(log); c.getContext = () => g; return c; } };
globalThis.Path2D = class { constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); } };

const S = await import('../stacking_cats/kingdom_strips.js');
const Wd = await import('../stacking_cats/kingdom_world.js');
const { buildLayout } = await import('../stacking_cats/kingdom_layout.js');
const { createWalk } = await import('../stacking_cats/kingdom_walk.js');
const { THEMES, BUILDINGS, WONDERS, emptyKingdom } = await import('../stacking_cats/cats.js');

const save = { unlocked: ['tabby', 'ember', 'mochi', 'sparky', 'yuki'], stats: { bossKills: 4 }, catStats: {},
  records: [{ wave: 9, date: '2026-09-01', cats: ['tabby', 'ember'] }, { wave: 14, date: '2026-10-01', cats: ['tabby', 'ember', 'mochi'] }, { wave: 23, date: '2026-11-01', cats: ['mochi', 'tabby', 'ember', 'sparky', 'yuki'] }] };
const layout = buildLayout(0, emptyKingdom(), save);
const kingdom = (lv) => { const k = emptyKingdom(); for (const b of BUILDINGS) k.lv[b.id] = lv; return k; };

await t('every strip builds for every district theme, season and quality', () => {
  for (let theme = 0; theme < THEMES.length; theme++) {
    const lay = { ...layout, districts: [{ x0: 0, x1: 1800, themeId: theme }, { x0: 1800, x1: 3600, themeId: (theme + 1) % THEMES.length }] };
    for (let season = 0; season < 4; season++) for (const gfx of [0, 3]) for (const level of [0, 14, 40]) {
      const env = S.makeEnv(lay, { level, season, gfx });
      for (const l of ['sky', 'far', 'hills']) assert.ok(S.buildStripNow(l, 0, env).width > 0, l);
      for (let i = 0; i < S.tileCount('mid', 3600, false); i += 2) assert.ok(S.buildStripNow('mid', i, env)._log.length > 10);
      for (let i = 0; i < S.tileCount('play', 3600, false); i += 2) assert.ok(S.buildStripNow('play', i, env)._log.length > 30);
    }
  }
});

await t('strips are deterministic, and depend on season and level band', () => {
  const env = S.makeEnv(layout, { level: 6, season: 2 });
  for (const [l, i] of [['sky', 0], ['far', 0], ['hills', 0], ['mid', 3], ['play', 2], ['play', 6]]) {
    const a = S.buildStripNow(l, i, env), b = S.buildStripNow(l, i, S.makeEnv(layout, { level: 6, season: 2 }));
    assert.deepEqual(a._log, b._log, l + ' rebuilds identically');
  }
  const base = S.buildStripNow('play', 2, env)._log.join('|');
  assert.notEqual(base, S.buildStripNow('play', 2, S.withEnv(env, { season: 3 }))._log.join('|'));
  assert.notEqual(base, S.buildStripNow('play', 2, S.withEnv(env, { level: 30 }))._log.join('|'));
  assert.equal(base, S.buildStripNow('play', 2, S.withEnv(env, { level: 8 }))._log.join('|'), 'same band, same strip');
  assert.ok(!base.includes('NaN') && !base.includes('undefined'));
});

await t('the strip cache slices builds, frees what is not asked for, and rebuilds identically', () => {
  const env = S.makeEnv(layout, { level: 3, season: 0 }), cache = S.createStrips(env);
  cache.beginFrame(); assert.equal(cache.get('play', 1), null); assert.equal(cache.pending(), 1);
  assert.equal(cache.pump(0), 0, 'one slice only'); assert.equal(cache.pending(), 1, 'still building'); let guard = 0; while (cache.pending() && guard++ < 500) cache.pump(0);
  const c1 = cache.get('play', 1); assert.ok(c1.width > 0);
  const log = c1._log.slice();
  cache.beginFrame(); cache.get('play', 2); cache.sweep();
  assert.equal(c1.width, 0, 'freed canvas is zeroed'); assert.equal(cache.count('play'), 0);
  cache.beginFrame(); cache.get('play', 1); cache.pump(Infinity);
  assert.deepEqual(cache.get('play', 1)._log, log);
  const held = cache.get('mid', 0); cache.pump(Infinity); cache.free();
  assert.equal(cache.memMB(), 0); assert.equal(cache.pending(), 0); void held;
});

await t('memory estimate stays under the 12 MB budget for every quality and world width', () => {
  for (const gfx of [0, 1, 2, 3]) for (const reduced of [false, true]) for (const worldW of [2400, 3600, 5000]) {
    const e = S.estimateMemMB({ worldW, gfx, reduced });
    assert.ok(e.peak < 12 - 2.5, `strips peak ${e.peak.toFixed(2)} MB at gfx ${gfx} width ${worldW}`);
  }
});

const mkSnap = (cx, o = {}) => {
  const st = createWalk(layout, { avatarId: 'tabby', spawn: { x: Math.min(3500, cx + 480), y: layout.groundY } });
  st.cam.x = cx; st.cam.y = 0; st.pcam = { ...st.cam }; Object.assign(st, o); return st;
};
const ctx0 = () => recCtx([]);

await t('draw runs at both ends and everywhere between, all gfx levels, motion on and off', () => {
  const k = kingdom(2), world = Wd.createWorld({}, layout, () => k, { getSave: () => save });
  world.setNow(new Date(2026, 10, 1, 12));
  for (const gfx of [0, 1, 2, 3]) for (const reduced of [false, true]) {
    world.setQuality(gfx); world.setReduced(reduced);
    for (const cx of [0, 600, 1500, 2640, 3600 - 960, -50, 99999]) world.draw(ctx0(), mkSnap(Math.max(0, Math.min(2640, cx))), 1, 3.3, {});
  }
  world.setQuality(3); world.setReduced(false);
  for (const season of [0, 1, 2, 3]) for (const hour of [3, 7, 12, 19, 23]) for (const weather of ['clear', 'rain', 'snow', 'petals', 'leaves'])
    world.draw(ctx0(), mkSnap(900), 0.5, 5, { season, hour, weather, moon: hour / 24 });
  assert.ok(world.memMB() < 12, 'world memory ' + world.memMB());
  world.free(); world.draw(ctx0(), mkSnap(0), 1, 1, {});
});

await t('a steady frame builds no canvases; strips stay under the resident cap while scanning the street', () => {
  const k = kingdom(3), world = Wd.createWorld({}, layout, () => k, { getSave: () => save });
  world.setNow(new Date(2026, 10, 1, 12));
  for (let i = 0; i < 8; i++) world.draw(ctx0(), mkSnap(1000), 1, 1 + i / 60, {});   // sprites and statues arrive one per frame
  const m0 = made; world.draw(ctx0(), mkSnap(1000), 1, 1.02, {}); assert.equal(made - m0, 0, 'a settled frame creates no canvases');
  let peak = 0;
  for (let cx = 0; cx <= 2640; cx += 40) { world.draw(ctx0(), mkSnap(cx), 1, cx / 60, {}); peak = Math.max(peak, world.memMB()); assert.ok(world.strips.count('play') <= 5 && world.strips.count('mid') <= 5, 'cap at ' + cx); }
  assert.ok(peak < 10, 'peak ' + peak.toFixed(2) + ' MB');
  world.free(); assert.equal(world.memMB(), 0);
});

await t('level 0 plots show builder cats, an upgrade bump adds a crew, a maxed street still draws', () => {
  const w0 = Wd.createWorld({}, layout, () => emptyKingdom(), { getSave: () => save });
  w0.setNow(new Date(2026, 5, 1, 12)); w0.draw(ctx0(), mkSnap(1100), 1, 1, {});
  assert.ok(w0.stats().builders >= 2, 'builders at a plot');
  const k = kingdom(1), w1 = Wd.createWorld({}, layout, () => k, { getSave: () => save });
  w1.setNow(new Date(2026, 5, 1, 12));
  const sn = mkSnap(1100); sn.t = 10; sn.bumps = { dojo: 9 }; w1.draw(ctx0(), sn, 1, 10, {});
  assert.ok(w1.stats().builders >= 3, 'crew on the bumped building');
  sn.t = 13; sn.bumps = { dojo: 9 }; w1.draw(ctx0(), sn, 1, 13, {});
  const km = kingdom(5); km.wonders = Object.fromEntries(WONDERS.map((x) => [x.id, true]));
  const w2 = Wd.createWorld({}, layout, () => km, { getSave: () => save }); w2.draw(ctx0(), mkSnap(2000), 1, 2, {});
});

await t('the Stackstone and the Statue Walk draw from records, also with none or junk', () => {
  const k = kingdom(2);
  for (const recs of [save.records, [], undefined, [{ wave: 5, date: 'x', cats: ['nope'] }, null]]) {
    const w = Wd.createWorld({}, layout, () => k, { getSave: () => ({ ...save, records: recs }) });
    w.setNow(new Date(2026, 10, 1, 12));
    for (let i = 0; i < 4; i++) w.draw(ctx0(), mkSnap(500), 1, i, {});
    if (recs === save.records) assert.ok(w.stats().statues >= 1, 'statue sprite built');
  }
  const w = Wd.createWorld({}, layout, () => k, { getSave: () => save }); const sn = mkSnap(500); sn.unveil = 0.6; w.draw(ctx0(), sn, 1, 1, {});
});

await t('bad snapshots never throw', () => {
  const w = Wd.createWorld({}, layout, () => kingdom(1), { getSave: () => save });
  for (const bad of [{}, { x: NaN, y: NaN, cam: { x: NaN, y: Infinity } }, { cam: { x: -500, y: 900 }, npcs: [null, { id: 'x', x: NaN }] }, null]) w.draw(ctx0(), bad, NaN, NaN, { gfx: 9 });
});

await t('weather particles respect the caps, reduced motion has none; moon phase and season are right', () => {
  const k = kingdom(1), w = Wd.createWorld({}, layout, () => k, { getSave: () => save });
  for (const gfx of [0, 1, 2, 3]) { w.setQuality(gfx); w.draw(ctx0(), mkSnap(900), 1, 4, { weather: 'rain', hour: 12 }); assert.ok(w.stats().particles <= Wd.caps(gfx).weather + Wd.caps(gfx).fireflies); }
  assert.equal(Wd.caps(3).weather, 60); assert.ok(Wd.caps(2).weather < Wd.caps(3).weather && Wd.caps(0).weather === 0);
  w.setQuality(3); w.setReduced(true); w.draw(ctx0(), mkSnap(900), 1, 4, { weather: 'snow', hour: 12 }); assert.equal(w.stats().particles, 0);
  const near = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
  assert.ok(near(Wd.moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14))), 0) < 0.03, 'new moon');
  assert.ok(near(Wd.moonPhase(new Date(Date.UTC(2000, 0, 21, 4, 40))), 0.5) < 0.03, 'full moon');
  assert.deepEqual([0, 4, 7, 10, 11].map((m) => Wd.seasonIndex(new Date(2026, m, 15))), [3, 0, 1, 2, 3]);
  assert.equal(Wd.lightAt(13).dark, 0); assert.equal(Wd.lightAt(23).dark, 1); const d = Wd.lightAt(19); assert.ok(d.dark > 0 && d.dark < 1 && d.warm > 0);
  assert.equal(Wd.weatherFor(new Date(2026, 0, 5), 3), 'snow');
});

await t('source rules: no em dashes, canvas text goes through tr(), no Math.random in strips', () => {
  const dash = String.fromCharCode(0x2014);
  for (const f of ['kingdom_world.js', 'kingdom_strips.js']) assert.ok(!readFileSync(new URL('../stacking_cats/' + f, import.meta.url), 'utf8').includes(dash), f);
  const w = readFileSync(new URL('../stacking_cats/kingdom_world.js', import.meta.url), 'utf8');
  assert.ok(!/fillText\(\s*'/.test(w), 'no literal fillText strings');
  assert.ok(!/Math\.random\(/.test(readFileSync(new URL('../stacking_cats/kingdom_strips.js', import.meta.url), 'utf8')) && !/Math\.random\(/.test(w));
});

console.log(`world tests: ${n} ok`);
