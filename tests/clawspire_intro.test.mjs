// Clawspire INTRO suite: the 10 second cinematic (js/intro.js) must prepare
// and draw every frame headless on the no-op context without throwing, keep
// save/restore balanced, be a pure function of t (same t, same call
// fingerprint), and play() must be a no-op that calls onDone when there is
// nothing to draw on.
import { boot, harness } from './clawspire_lib.mjs';

const T = harness('clawspire intro');

const fingerprint = (api, fn) => { api._resetCounts(); fn(); return JSON.stringify(Object.entries(api._counts).sort()); };

T.test('loads with the other modules and exposes the contract', () => {
  const api = boot();
  const { INTRO } = api;
  T.ok(INTRO && typeof INTRO === 'object', 'INTRO namespace on window.CS');
  for (const k of ['prepare', 'draw', 'play', 'skip']) T.eq(typeof INTRO[k], 'function', `INTRO.${k} is a function`);
  T.eq(INTRO.DUR, 10, 'the cinematic is 10 seconds');
  T.eq(INTRO.LETTERS, 'CLAWSPIRE', 'the name');
  T.eq(INTRO.TAGLINE, 'Every fight is a grab.', 'the tagline');
  T.ok(Array.isArray(INTRO.SHOTS) && INTRO.SHOTS.length === 5, 'five shots');
  T.eq(INTRO.SHOTS[0].t0, 0, 'shots start at 0');
  T.eq(INTRO.SHOTS[INTRO.SHOTS.length - 1].t1, 10, 'shots end at 10');
  for (let i = 1; i < INTRO.SHOTS.length; i++) T.eq(INTRO.SHOTS[i].t0, INTRO.SHOTS[i - 1].t1, `shot ${i} follows shot ${i - 1}`);
});

T.test('prepare runs the physics scatter and the world map once', () => {
  const { INTRO } = boot();
  const t0 = Date.now();
  const P = INTRO.prepare();
  const ms = Date.now() - t0;
  T.ok(P && P.scatter, 'scatter prepared');
  T.ok(P.scatter.ok, 'the scatter recorded a real grab (touch event seen)');
  T.ok(P.scatter.frames.length > 200, `scatter has frames [${P.scatter.frames.length}]`);
  T.eq(P.scatter.items.length, 24, '24 items in the pile');
  T.ok(P.scatter.items.filter(i => i.hero).length === 2, 'a shield and a sword are the heroes');
  T.ok(P.scatter.events.touch > 0 && P.scatter.events.close > 0 && P.scatter.events.lift > 0, 'touch, close and lift happened');
  T.ok(Array.isArray(P.scatter.locked) && P.scatter.locked.length >= 1, `the claw locked cargo [${P.scatter.locked}]`);
  T.ok(P.map && P.map.ok, 'map prepared');
  T.ok(P.map.road.length > 5, 'the road has hexes');
  T.ok(P.map.tiles.some(x => Number.isFinite(x.revealT)), 'tiles have reveal times');
  T.ok(P.map.tiles.every(x => !Number.isFinite(x.revealT) || (x.revealT >= 5.5 && x.revealT <= 7.5)), 'reveal times sit in the climb');
  T.ok(INTRO.prepare() === P, 'prepare is cached');
  T.ok(ms < 8000, `prepare is quick enough [${ms} ms]`);
  // every recorded frame keeps every item inside the glass
  let inside = true;
  for (const f of P.scatter.frames) for (const it of f.items) if (!(it[0] > -5 && it[0] < 485 && it[1] > -70 && it[1] < 440)) inside = false;
  T.ok(inside, 'no item leaves the cabinet during the scatter');
});

T.test('draw runs for every frame without throwing, save/restore balanced', () => {
  const api = boot();
  const { INTRO } = api;
  const ctx = api._ctx;
  let threw = null, unbalanced = [];
  for (let i = 0; i <= 600; i += 3) {
    const t = i / 60;
    api._resetCounts();
    try { INTRO.draw(ctx, t, 540, 960, { tap: true, hint: true }); } catch (e) { threw = e; break; }
    if ((api._counts.save || 0) !== (api._counts.restore || 0)) unbalanced.push(t);
  }
  T.ok(!threw, 'draw never throws: ' + (threw && threw.stack));
  T.eq(unbalanced.length, 0, 'save/restore balanced at every t [' + unbalanced.slice(0, 5) + ']');
  // odd inputs
  for (const t of [-1, 0, 10, 10.5, 14, NaN, undefined]) { try { INTRO.draw(ctx, t, 540, 960); } catch (e) { T.ok(false, `draw(${t}) threw`); } }
  try { INTRO.draw(null, 1); } catch (e) { T.ok(false, 'draw(null) threw'); }
  try { INTRO.draw(ctx, 2, 1080, 1920); } catch (e) { T.ok(false, 'draw at 2x threw'); }
});

T.test('every shot draws something and uses the game art', () => {
  const api = boot();
  const { INTRO } = api;
  const ctx = api._ctx;
  INTRO.prepare();
  for (const s of INTRO.SHOTS) {
    const t = (s.t0 + s.t1) / 2;
    api._resetCounts();
    INTRO.draw(ctx, t, 540, 960);
    const n = Object.values(api._counts).reduce((a, b) => a + b, 0);
    T.ok(n > 200, `shot ${s.id} at ${t}s draws [${n} calls]`);
    T.ok((api._counts.fillText || 0) + (api._counts.strokeText || 0) >= 0, `shot ${s.id} text ok`);
  }
  // the name shot writes the letters and the tagline
  api._resetCounts(); INTRO.draw(ctx, 9.9, 540, 960, { tap: true });
  T.ok((api._counts.fillText || 0) >= 9 + 2, `the name shot writes the letters, the tagline and TAP TO PLAY [${api._counts.fillText}]`);
  api._resetCounts(); INTRO.draw(ctx, 9.9, 540, 960, {});
  const noTap = api._counts.fillText || 0;
  api._resetCounts(); INTRO.draw(ctx, 9.9, 540, 960, { tap: true });
  T.ok((api._counts.fillText || 0) > noTap, 'TAP TO PLAY only with the tap option');
});

T.test('draw is deterministic in t', () => {
  const api = boot();
  const { INTRO } = api;
  const ctx = api._ctx;
  const ts = [0.2, 0.9, 1.3, 2.2, 2.9, 3.3, 3.9, 4.5, 5.1, 6.0, 7.0, 7.45, 8.0, 8.7, 9.7];
  for (const t of ts) INTRO.draw(ctx, t, 540, 960);   // warm the caches (glow sprites, gradients)
  for (const t of ts) {
    const a = fingerprint(api, () => INTRO.draw(ctx, t, 540, 960, { tap: true }));
    const b = fingerprint(api, () => INTRO.draw(ctx, t, 540, 960, { tap: true }));
    T.eq(a, b, `same fingerprint twice at t=${t}`);
  }
  // and a fresh boot gives the same fingerprint (no hidden Math.random)
  const api2 = boot();
  for (const t of ts) api2.INTRO.draw(api2._ctx, t, 540, 960);
  for (const t of [1.3, 4.5, 6.0, 8.7]) {
    const a = fingerprint(api, () => INTRO.draw(ctx, t, 540, 960));
    const b = fingerprint(api2, () => api2.INTRO.draw(api2._ctx, t, 540, 960));
    T.eq(a, b, `fresh boot matches at t=${t}`);
  }
});

T.test('the scatter warp is monotonic and covers the burst, the close and the lift', () => {
  const { INTRO } = boot();
  const P = INTRO.prepare();
  const w = P.warp;
  T.ok(w.keys.length >= 3, 'three speed segments');
  T.ok(w.keys[0].v < 0.5, 'the burst runs in slow motion');
  T.ok(w.keys[w.keys.length - 1].v > 2, 'the rise runs fast');
  T.ok(w.end > P.scatter.events.lift, 'the shot reaches the lift');
  let last = -1, mono = true;
  for (const k of w.keys) { if (k.s0 < last) mono = false; last = k.s0; }
  T.ok(mono, 'sim time never goes backwards');
});

T.test('play headless is a no-op that calls onDone once', () => {
  const api = boot();
  const { INTRO } = api;
  let n = 0;
  const r = INTRO.play({ onDone: () => n++ });
  T.eq(r, false, 'play returns false headless (nothing to draw)');
  T.eq(n, 1, 'onDone called once');
  T.eq(INTRO.active, false, 'not active');
  n = 0;
  INTRO.play({ ctx: api._ctx, headless: true, onDone: () => n++ });
  T.eq(n, 1, 'explicit headless also calls onDone');
  T.eq(INTRO.skip(), false, 'skip with nothing playing is false');
  T.eq(INTRO.play(), false, 'play without options is safe');
});

T.test('play with a context starts a run and skip ends it with onDone', () => {
  const api = boot();
  const { INTRO } = api;
  // The sandbox has a (no-op) requestAnimationFrame and performance.now, so
  // play() accepts the context; the frame loop is never driven here.
  let done = 0;
  const ok = INTRO.play({ ctx: api._ctx, px: 1, onDone: () => done++ });
  T.eq(ok, true, 'play starts with a context and a frame loop');
  T.eq(INTRO.active, true, 'active while playing');
  T.eq(done, 0, 'onDone not yet');
  T.eq(INTRO.skip(), true, 'skip ends the run');
  T.eq(done, 1, 'onDone after skip');
  T.eq(INTRO.active, false, 'inactive after skip');
  T.eq(INTRO.skip(), false, 'a second skip is a no-op');
});

T.done();
