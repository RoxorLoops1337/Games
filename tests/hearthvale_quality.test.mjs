// Hearthvale quality system: pure logic (tier selection, adaptive controller hysteresis, persistence).
import assert from 'node:assert/strict';
import { TIERS, ORDER, detectTier, gpuClass, isSoftwareRenderer, startPixelRatio, Adaptive, loadChoice, saveChoice, loadCap, saveCap, KEY } from '../hearthvale/js/quality.js';

let n = 0; const ok = (name, fn) => { fn(); n++; };

ok('tiers are complete and monotonic', () => {
  for (const t of ORDER) for (const k of ['post', 'msaa', 'bloom', 'dof', 'rays', 'ao', 'shadow', 'water', 'prMax']) assert.ok(k in TIERS[t], t + '.' + k);
  for (let i = 1; i < ORDER.length; i++) { const a = TIERS[ORDER[i - 1]], b = TIERS[ORDER[i]]; for (const k of ['msaa', 'bloom', 'dof', 'rays', 'ao', 'shadow', 'water', 'prMax']) assert.ok(b[k] >= a[k], k + ' must not shrink going up'); }
  assert.equal(TIERS.high.msaa, 4); assert.equal(TIERS.low.bloom, 0); assert.equal(TIERS.medium.dof, 0); assert.equal(TIERS.high.dof, 1);
});
ok('software renderers are recognised and forced low', () => {
  assert.ok(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'));
  assert.equal(gpuClass('llvmpipe (LLVM 15)'), 0);
  assert.equal(detectTier({ renderer: 'SwiftShader', software: true, dpr: 1, width: 1280, height: 800, cores: 16, mem: 16 }), 'low');
});
ok('desktop GPUs land medium or high, weak phones low', () => {
  assert.equal(detectTier({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)', dpr: 1, width: 1920, height: 1080, cores: 12, mem: 16 }), 'high');
  assert.equal(detectTier({ renderer: 'Apple M2', dpr: 2, width: 1440, height: 900, cores: 8, mem: 8 }), 'high');
  assert.equal(detectTier({ renderer: 'Mali-G52 MC2', mobile: true, dpr: 2.75, width: 412, height: 915, cores: 8, mem: 4 }), 'low');
  assert.equal(detectTier({ renderer: 'Adreno (TM) 506', mobile: true, dpr: 3, width: 360, height: 780, cores: 8, mem: 3 }), 'low');
  assert.equal(detectTier({ renderer: 'Apple GPU', mobile: true, dpr: 3, width: 390, height: 844, cores: 6, mem: 0 }), 'medium');
  assert.equal(detectTier({}), 'medium');                           // nothing known on a desktop: safe middle
  assert.equal(detectTier({ mobile: true }), 'low');                // nothing known on a phone: safe low
});
ok('a saved cap lowers the start tier but never raises it', () => {
  assert.equal(detectTier({ renderer: 'GeForce RTX 4070', dpr: 1, width: 1920, height: 1080, cores: 16, mem: 32, cap: 'medium' }), 'medium');
  assert.equal(detectTier({ renderer: 'Mali-G52', mobile: true, dpr: 2, width: 400, height: 800, cores: 8, mem: 4, cap: 'high' }), 'low');
});
ok('pixel ratio follows tier cap', () => {
  assert.equal(startPixelRatio('low', 3), 1.5); assert.equal(startPixelRatio('high', 3), 2); assert.equal(startPixelRatio('high', 1), 1);
});

const run = (c, ms, secs) => { const out = []; const steps = Math.round(secs / (ms / 1000)); for (let i = 0; i < steps; i++) { const r = c.step(ms / 1000); if (r) out.push({ ...r, at: +(c.clock).toFixed(2) }); } return out; };
ok('controller ignores warm-up frames and spikes', () => {
  const c = new Adaptive({ tier: 'high', pr: 1, prMax: 1 });
  for (let i = 0; i < 20; i++) assert.equal(c.step(0.2), null);        // warm-up
  for (let i = 0; i < 30; i++) assert.equal(c.step(0.5), null);        // spikes (tab switch, compile) never count
  assert.equal(c.tier, 'high');
});
ok('controller drops a tier after sustained slow frames, one step at a time', () => {
  const c = new Adaptive({ tier: 'high', pr: 1, prMax: 1 });
  const ev = run(c, 40, 12);
  assert.ok(ev.length >= 2, 'drops repeatedly while slow');
  assert.equal(ev[0].tier, 'medium'); assert.equal(ev[1].tier, 'low');
  assert.ok(ev[0].at < 4, 'the first drop is quick (probe)');
  assert.ok(ev[1].at - ev[0].at >= 1, 'drops are spaced');
});
ok('at the lowest tier it lowers pixel ratio down to the floor, then stops', () => {
  const c = new Adaptive({ tier: 'low', pr: 1, prMax: 1, prMin: 0.75 });
  const ev = run(c, 40, 40); const prs = ev.map((e) => e.pr);
  assert.ok(prs.length >= 2 && prs.every((p, i) => !i || p < prs[i - 1])); assert.equal(c.pr, 0.75); assert.equal(c.tier, 'low');
});
ok('short slow bursts do not downgrade', () => {
  const c = new Adaptive({ tier: 'high', pr: 1, prMax: 1 });
  for (let r = 0; r < 20; r++) { run(c, 40, 0.5); run(c, 12, 3); }
  assert.equal(c.tier, 'high');
});
ok('mid-range frame times (between thresholds) change nothing', () => {
  const c = new Adaptive({ tier: 'medium', pr: 1, prMax: 1 });
  assert.deepEqual(run(c, 19, 120), []);
});
ok('it climbs back only after a long comfortable stretch, pixel ratio first', () => {
  const c = new Adaptive({ tier: 'low', pr: 0.85, prMax: 1 });
  assert.deepEqual(run(c, 10, 5), [], 'not yet');
  const ev = run(c, 10, 60);
  assert.equal(ev[0].reason, 'fast-pr'); assert.ok(ev.some((e) => e.reason === 'fast' && e.tier === 'medium'));
  assert.equal(c.tier, 'high', 'eventually the top'); assert.ok(ev[0].at >= 6, 'cool-down respected');
});
ok('hysteresis: a climb that gets punished locks the next climb out for longer', () => {
  const c = new Adaptive({ tier: 'medium', pr: 1, prMax: 1, upSecs: 7, cool: 6, regretSecs: 40 });
  const up = run(c, 10, 30); assert.equal(up[0].tier, 'high');
  const dn = run(c, 40, 3); assert.equal(dn[0].tier, 'medium'); assert.equal(c.tier, 'medium');
  const t0 = c.clock; let again = run(c, 10, 40); assert.deepEqual(again.filter((e) => e.tier === 'high'), [], 'locked out');
  assert.ok(c.lockLen >= 60); again = run(c, 10, 60); assert.ok(again.some((e) => e.tier === 'high'), 'allowed after the lock');
  const t1 = again.find((e) => e.tier === 'high').at; assert.ok(t1 - t0 > 40);
});
ok('no oscillation over a long borderline run (frames hover at the drop threshold)', () => {
  const c = new Adaptive({ tier: 'high', pr: 1, prMax: 1 }); let changes = 0, i = 0;
  for (let k = 0; k < 60 * 600; k++) { const ms = (k % 600 < 300 ? 26 : 12); i++; if (c.step(ms / 1000)) changes++; }
  assert.ok(changes <= 6, 'changes ' + changes);
});
ok('a disabled controller never acts', () => {
  const c = new Adaptive({ tier: 'high', enabled: false }); assert.deepEqual(run(c, 60, 30), []);
});

ok('persistence survives blocked storage and bad values', () => {
  const mem = new Map(), st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  assert.equal(loadChoice(st), 'auto'); saveChoice('high', st); assert.equal(mem.get(KEY), 'high'); assert.equal(loadChoice(st), 'high');
  mem.set(KEY, 'ultra'); assert.equal(loadChoice(st), 'auto');
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(loadChoice(bad), 'auto'); saveChoice('low', bad); assert.equal(loadCap(bad), null); saveCap('low', bad);
  saveCap('medium', st, 1000); assert.equal(loadCap(st, 2000), 'medium'); assert.equal(loadCap(st, 1000 + 15 * 864e5), null);
});
console.log('hearthvale quality: ' + n + ' groups ok');
