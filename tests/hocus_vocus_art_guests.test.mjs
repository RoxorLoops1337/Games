// ART guests and mascots (art_guests.js: ART.guest, ART.mascot), headless on the strict canvas stub, modelled on the cast suite:
//   * the file loads clean; ART.guest.ids() are exactly DATA.guests' twelve and ART.mascot.ids() DATA.mascots' six, every one declared real (ART.has)
//   * every guest draws every pose (idle act enter exit shove, plus a nonsense one) at several t and pt without a canvas issue, with real paths and a
//     balanced context; every mascot every pose at every level; bounds are sane and the pose lengths are the documented ones
//   * determinism (two draws of the same arguments record the same calls), the figures differ from one another (the recorded calls, and the pixels when
//     a real canvas is available), a guest wears its owner's colour, a level 3 mascot draws its crown and bandana on top of level 1
//   * unknown ids and garbage options never throw, the exit poses end invisible, the gallery sheets draw at two sizes, a perf smoke
import { boot, harness } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus art guests');
const api = boot({ only: ['data*', 'art_guests'] });          // the data files bring DATA.guests and DATA.mascots (art_* alone pulls only art.js)
const { ART, DATA } = api;
t.ok(!api._errors || api._errors.length === 0, 'art_guests loads without errors: ' + JSON.stringify(api._errors));
t.ok(!api._warnings || api._warnings.length === 0, 'art_guests loads without warnings: ' + JSON.stringify(api._warnings));
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

const GUESTS = Object.keys(DATA.guests).filter((id) => !/^guest_t_/.test(id)), MASCOTS = Object.keys(DATA.mascots);
const GPOSES = ['idle', 'act', 'enter', 'exit', 'shove'], MPOSES = ['idle', 'cheer'];
const GUEST_MS = { act: 450, enter: 520, exit: 1100, shove: 420, idle: 0 }, MASCOT_MS = { cheer: 800, idle: 0 };

t.test('the API and the ids', () => {
  ['guest', 'mascot'].forEach((ns) => ['draw', 'bounds', 'poseMs', 'ids'].forEach((k) => t.eq(typeof ART[ns][k], 'function', `ART.${ns}.${k}`)));
  t.eq(GUESTS.length, 12, 'twelve guests in DATA');
  t.deep(ART.guest.ids().slice().sort(), GUESTS.slice().sort(), 'ART.guest.ids are exactly the twelve guests');
  t.deep(ART.mascot.ids().slice().sort(), MASCOTS.slice().sort(), 'ART.mascot.ids are exactly the six mascots');
  GUESTS.forEach((id) => t.ok(ART.has('guest', id), 'ART.has guest ' + id));
  MASCOTS.forEach((id) => t.ok(ART.has('mascot', id), 'ART.has mascot ' + id));
  t.ok(!ART.has('guest', 'nobody') && !ART.has('mascot', 'nobody'), 'unknown ids are not declared');
  Object.keys(GUEST_MS).forEach((p) => t.eq(ART.guest.poseMs(p), GUEST_MS[p], 'guest poseMs ' + p));
  Object.keys(MASCOT_MS).forEach((p) => t.eq(ART.mascot.poseMs(p), MASCOT_MS[p], 'mascot poseMs ' + p));
  t.eq(ART.guest.poseMs('nonsense'), 0, 'an unknown pose has no length');
  ['guests', 'mascots', 'guest_dev'].forEach((n) => t.eq(typeof ART.sheets[n], 'function', 'sheet ' + n));
});

t.test('bounds are sane', () => {
  GUESTS.forEach((id) => {
    const b = ART.guest.bounds(id);
    t.ok(b.w >= 60 && b.w <= 140, `${id} width ${b.w}`);
    t.ok(b.h >= 90 && b.h <= 160, `${id} height ${b.h} (nominal about 150)`);
    t.ok(b.head.y < 0 && b.head.y > -b.h - 2 && b.body.y < 0 && b.body.y > b.head.y, `${id} head above body above feet`);
    t.deep(b.feet, { x: 0, y: 0 }, `${id} feet at the origin`);
  });
  MASCOTS.forEach((id) => {
    const b = ART.mascot.bounds(id);
    t.ok(b.w >= 50 && b.w <= 100 && b.h >= 70 && b.h <= 100, `${id} bounds ${b.w}x${b.h} (nominal about 90)`);
    t.ok(b.head.y < 0 && b.body.y < 0, `${id} head and body above the feet`);
  });
  const u = ART.guest.bounds('nobody');
  t.ok(u.w > 0 && u.h > 0 && u.head && u.feet, 'an unknown guest has default bounds');
  t.ok(ART.mascot.bounds('nobody').h > 0, 'an unknown mascot has default bounds');
});

t.test('every guest draws every pose at several t and pt, clean and balanced', () => {
  let n = 0;
  GUESTS.forEach((id) => GPOSES.concat(['nonsense']).forEach((pose) => [[0, 0], [0.37, 0.1], [1.9, 0.3], [12.345, 0.9], [3, 5]].forEach(([tt, pt]) => {
    clean();
    const r = recorder();
    let threw = null;
    try { ART.guest.draw(r.ctx, id, { x: 300, y: 500, s: 1, pose, t: tt, pt, flip: n % 3 === 1 }); } catch (e) { threw = e; }
    t.ok(!threw, `${id} ${pose} t=${tt} pt=${pt} does not throw ${threw ? threw.message : ''}`);
    // the exit poses end invisible (exit 1.1 s, shove 0.42 s) and an entering guest is still in the wings at pt 0
    const ended = (pose === 'exit' && pt >= 1.2) || (pose === 'shove' && pt >= 0.5) || (pose === 'enter' && pt === 0);
    const paths = (api._counts.fill || 0) + (api._counts.stroke || 0);
    if (!ended) t.ok(paths >= 30, `${id} ${pose} pt=${pt} draws real paths (${paths})`);
    else t.eq(paths, 0, `${id} ${pose} is off stage at pt=${pt}: nothing is drawn`);
    if (api._issues.length) t.ok(false, `${id} ${pose} t=${tt} pt=${pt} canvas issues: ${issues()}`);
    t.eq(r.real._depth, 0, `${id} ${pose} leaves the context stack empty`);
    n++;
  })));
  t.eq(n, GUESTS.length * (GPOSES.length + 1) * 5, 'covered every combination');
  t.eq(api._console.warn.filter((l) => /art_guests/.test(String(l))).length, 0, 'no figure had to be replaced by a placeholder');
});

t.test('every mascot draws every pose at every level, clean and balanced', () => {
  let n = 0;
  MASCOTS.forEach((id) => MPOSES.concat(['nonsense']).forEach((pose) => [1, 2, 3].forEach((level) => [[0, 0], [1.3, 0.25], [7.7, 0.6]].forEach(([tt, pt]) => {
    clean();
    const r = recorder();
    let threw = null;
    try { ART.mascot.draw(r.ctx, id, { x: 300, y: 500, s: 1, pose, t: tt, pt, level, flip: n % 2 === 1 }); } catch (e) { threw = e; }
    t.ok(!threw, `${id} ${pose} L${level} does not throw ${threw ? threw.message : ''}`);
    const paths = (api._counts.fill || 0) + (api._counts.stroke || 0);
    t.ok(paths >= 24, `${id} ${pose} L${level} draws real paths (${paths})`);
    if (api._issues.length) t.ok(false, `${id} ${pose} L${level} canvas issues: ${issues()}`);
    t.eq(r.real._depth, 0, `${id} ${pose} L${level} leaves the context stack empty`);
    n++;
  }))));
  t.eq(n, MASCOTS.length * 3 * 3 * 3, 'covered every combination');
});

t.test('determinism, distinct figures, the owner colour and the level accessories', () => {
  const logs = {};
  GUESTS.forEach((id) => {
    const a = call((c) => ART.guest.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 2.5 })), b = call((c) => ART.guest.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 2.5 }));
    t.eq(a, b, `${id} is a pure function of its arguments`);
    t.ok(a !== call((c) => ART.guest.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 2.9 })), `${id} idle animates`);
    t.ok(a !== call((c) => ART.guest.draw(c, id, { x: 100, y: 300, s: 1, pose: 'act', t: 2.5, pt: 0.2 })), `${id} acts differently from idling`);
    t.ok(a !== call((c) => ART.guest.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 2.5, flip: true })), `${id} flips`);
    const col = DATA.heroes[DATA.guests[id].hero].color;
    t.ok(a.indexOf(col) >= 0, `${id} wears its owner's colour ${col}`);
    logs[id] = a;
  });
  t.eq(new Set(Object.values(logs)).size, GUESTS.length, 'the twelve guests all draw differently');
  const mlogs = {};
  MASCOTS.forEach((id) => {
    const l1 = call((c) => ART.mascot.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 1, level: 1 })), l2 = call((c) => ART.mascot.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 1, level: 2 })), l3 = call((c) => ART.mascot.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 1, level: 3 }));
    t.eq(l1, call((c) => ART.mascot.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 1, level: 1 })), `${id} is deterministic`);
    t.ok(l2 !== l1 && l3 !== l2, `${id} grows: level 2 adds the bandana, level 3 the crown`);
    t.ok(l2.split('\n').length > l1.split('\n').length && l3.split('\n').length > l2.split('\n').length, `${id} each level draws more on top of the last`);
    t.ok(l1 !== call((c) => ART.mascot.draw(c, id, { x: 100, y: 300, s: 1, pose: 'cheer', t: 1, pt: 0.2, level: 1 })), `${id} cheers differently from idling`);
    mlogs[id] = l1;
  });
  t.eq(new Set(Object.values(mlogs)).size, MASCOTS.length, 'the six mascots all draw differently');
});

await t.test('pixels differ between ids on a real canvas, when the harness has one', async () => {
  let createCanvas = null;
  try { createCanvas = (await import('canvas')).createCanvas; } catch (e) { try { createCanvas = (await import('@napi-rs/canvas')).createCanvas; } catch (e2) { createCanvas = null; } }
  if (!createCanvas) { t.ok(true, 'no real canvas module installed: the recorded-call comparison above stands in'); return; }
  const shot = (ns, id, o) => { const cv = createCanvas(200, 200), g = cv.getContext('2d'); ART[ns].draw(g, id, Object.assign({ x: 100, y: 190, s: 1, pose: 'idle', t: 1 }, o)); return Buffer.from(g.getImageData(0, 0, 200, 200).data).toString('base64'); };
  const seen = new Set();
  GUESTS.forEach((id) => { const p = shot('guest', id); t.ok(!seen.has(p), id + ' has its own pixels'); seen.add(p); t.eq(p, shot('guest', id), id + ' pixels are deterministic'); });
  MASCOTS.forEach((id) => { const p = shot('mascot', id, { level: 1 }); t.ok(!seen.has(p), id + ' has its own pixels'); seen.add(p); t.ok(p !== shot('mascot', id, { level: 3 }), id + ' level 3 looks different'); });
});

t.test('garbage never throws: unknown ids, NaN options, alpha 0, a missing context', () => {
  clean();
  const c = newCtx();
  ART.guest.draw(c, 'nobody', { x: 10, y: 10 }); ART.mascot.draw(c, 'nobody', { x: 10, y: 10, level: 9 });
  ART.guest.draw(c, GUESTS[0], { x: NaN, y: undefined, s: -1, pose: 42, t: 'x', pt: -3, alpha: 'q' });
  ART.mascot.draw(c, MASCOTS[0], { x: NaN, y: NaN, s: 0, level: NaN, pose: null });
  ART.guest.draw(null, GUESTS[0], {}); ART.mascot.draw(undefined, MASCOTS[0]);
  ART.guest.draw(c, GUESTS[1]); ART.mascot.draw(c, MASCOTS[1]);
  t.eq(issues(), '', 'garbage options draw clean (NaN absorbed)');
  const empty = call((cc) => ART.guest.draw(cc, GUESTS[2], { x: 100, y: 300, alpha: 0 }));
  t.ok(empty.indexOf('fill(') < 0 && empty.indexOf('stroke(') < 0, 'alpha 0 draws nothing');
  const al = call((cc) => ART.guest.draw(cc, GUESTS[2], { x: 100, y: 300, alpha: 0.5, shadow: false }));
  t.ok(al.length > 100 && al !== call((cc) => ART.guest.draw(cc, GUESTS[2], { x: 100, y: 300, alpha: 0.5 })), 'shadow:false skips the ground ellipse');
  const r = recorder();
  ART.guest.draw(r.ctx, GUESTS[3], { x: 0, y: 0, s: 1, pose: 'exit', pt: 0.8, t: 1, flip: true, alpha: 0.7 });
  t.eq(r.log.filter((l) => l === 'save()').length, r.log.filter((l) => l === 'restore()').length, 'saves and restores balance through a flipped, fading walk-off');
});

t.test('the gallery sheets draw at two sizes', () => {
  ['guests', 'mascots', 'guest_dev'].forEach((name) => {
    [[1600, 900, 0], [500, 320, 1.3]].forEach(([w, h, tt]) => {
      clean();
      let threw = null;
      try { ART.sheets[name](doc.createElement('canvas'), { w, h, t: tt, scale: 1, dpr: 1, res: 1, id: name === 'guest_dev' ? GUESTS[4] + ',' + MASCOTS[2] : undefined, pose: tt ? 'act' : undefined }); } catch (e) { threw = e; }
      t.ok(!threw, `${name} ${w}x${h} does not throw ${threw ? threw.message : ''}`);
      t.eq(issues(), '', `${name} ${w}x${h} clean`);
    });
  });
});

t.test('perf smoke: a live figure on a no-op context', () => {
  // the sandbox runs several times slower than a browser; the smoke limit only catches a runaway (a loop per pixel, a bake every frame)
  let self = null;
  const fn = () => self;
  self = new Proxy(function () {}, { get: (tg, k) => (k === 'canvas' ? undefined : k === 'measureText' ? () => ({ width: 0 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : fn), set: () => true });
  GUESTS.forEach((id) => ART.guest.draw(self, id, { pose: 'idle' }));
  const N = 40, t0 = Date.now();
  GUESTS.forEach((id) => { for (let i = 0; i < N; i++) ART.guest.draw(self, id, { x: 0, y: 0, s: 1, pose: GPOSES[i % GPOSES.length], t: i * 0.016, pt: i * 0.01 }); });
  MASCOTS.forEach((id) => { for (let i = 0; i < N; i++) ART.mascot.draw(self, id, { x: 0, y: 0, s: 1, pose: MPOSES[i % 2], t: i * 0.016, pt: i * 0.01, level: 1 + (i % 3) }); });
  const per = (Date.now() - t0) / (N * (GUESTS.length + MASCOTS.length));
  t.ok(per < 20, `average live figure ${per.toFixed(2)} ms in the sandbox (smoke limit 20 ms)`);
  const before = ART.sprite.stats().misses;
  for (let i = 0; i < 20; i++) ART.guest.draw(newCtx(), GUESTS[0], { x: 300, y: 500, s: 1, pose: 'idle', t: 50 + i * 0.016 });
  t.ok(ART.sprite.stats().misses - before <= 4, 'live drawing bakes nothing');
});

t.done();
