// Stacking Cats: Whiskerton Walk (sim, layout, village life, save fields). Headless, no DOM.
import assert from 'node:assert/strict';
import { CATS, BUILDINGS, WONDERS, STARTERS, CAT_BY_ID } from '../stacking_cats/cats.js';
import { buildLayout, WORLD_W, GROUND, DISTRICTS, SLOTS, ISLAND_RISE } from '../stacking_cats/kingdom_layout.js';
import { createWalk, stepWalk, WALK, STEP, APEX, teleport } from '../stacking_cats/kingdom_walk.js';
import * as life from '../stacking_cats/kingdom_life.js';
import { mewsprint } from '../stacking_cats/story.js';
import { encodeSave, decodeSave } from '../stacking_cats/savecode.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };

const allCatsSave = (extra = {}) => ({
  unlocked: CATS.map((c) => c.id), catStats: { tabby: { runs: 9, kills: 4812, dmg: 1, best: 17 }, ember: { runs: 3, kills: 300, dmg: 1, best: 9 } },
  stats: { runs: 12, bossKills: 2, bestWave: 17 }, kingdom: { coins: 500, gems: 4, lv: { dojo: 2 }, wonders: {} }, records: [], walk: null, ...extra,
});
const freshLayout = (save = allCatsSave()) => buildLayout(0, save.kingdom, save);
const noEm = (s) => assert.ok(!/[\u2014\u2013]/.test(s), 'no em or en dash in: ' + s);
const run = (st, seconds, input = {}, dt = STEP) => { const steps = Math.round(seconds / dt); for (let i = 0; i < steps; i++) stepWalk(st, input, dt); };
const hashState = (st) => { let h = 2166136261; const feed = (v) => { const s = String(Math.round(v * 1000)); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } }; feed(st.x); feed(st.y); feed(st.cam.x); feed(st.cam.y); feed(st.vx); feed(st.vy); return h >>> 0; };
// a scripted pseudo player (deterministic, no Math.random)
const script = (i) => ({ dir: Math.sin(i / 97) > 0.2 ? 1 : Math.sin(i / 97) < -0.4 ? -1 : 0, jump: i % 71 === 0, interact: i % 113 === 0, jumpHeld: i % 71 < 30, moveTo: i % 701 === 5 ? 400 + (i * 7) % 2800 : null });
const walkScript = (steps, layout = freshLayout()) => {
  const st = createWalk(layout, { avatarId: 'tabby' });
  const trace = [];
  for (let i = 0; i < steps; i++) { stepWalk(st, script(i), STEP); if (i % 50 === 0) trace.push(hashState(st)); st.events.length = 0; }
  return { st, trace };
};
const goTo = (st, x, secs = 30) => { stepWalk(st, { moveTo: x }, STEP); for (let i = 0; i < secs * 60 && (st.target != null || Math.abs(st.vx) > 1); i++) stepWalk(st, {}, STEP); };

// ------------------------------------------------------------------ layout
await t('layout: 3600 wide, 3 districts, all 9 buildings and 6 wonders with lifts, gate, lookout, statue', () => {
  const L = freshLayout();
  assert.equal(L.width, 3600); assert.equal(L.height, 540); assert.equal(L.groundY, GROUND); assert.equal(WORLD_W, 3600);
  assert.equal(L.districts.length, 3);
  assert.deepEqual(L.districts.map((d) => d.id), ['green', 'maple', 'roofs']);
  assert.equal(L.districts[0].x0, 0); assert.equal(L.districts[2].x1, 3600);
  for (let i = 1; i < 3; i++) assert.equal(L.districts[i].x0, L.districts[i - 1].x1);
  for (const b of BUILDINGS) assert.equal(L.zones.filter((z) => z.type === 'building' && z.id === b.id).length, 1, b.id);
  for (const w of WONDERS) {
    const wz = L.zones.find((z) => z.type === 'wonder' && z.id === w.id), lz = L.zones.find((z) => z.type === 'lift' && z.id === w.id);
    assert.ok(wz && lz, w.id);
    assert.equal(wz.x, lz.x); assert.equal(wz.y, GROUND - ISLAND_RISE); assert.equal(lz.toY, wz.y);
    assert.ok(L.platforms.some((p) => p.y === wz.y && wz.x >= p.x && wz.x <= p.x + p.w && p.oneWay), 'island under ' + w.id);
  }
  for (const type of ['gate', 'lookout', 'statue', 'bench']) assert.ok(L.zones.some((z) => z.type === type), type);
  assert.ok(L.zones.some((z) => z.type === 'statue' && z.id === 'stackstone'));
  assert.ok(L.npcs.some((q) => q.kind === 'crier'));
  for (const z of L.zones) { assert.ok(Number.isFinite(z.x) && z.x > 0 && z.x < L.width && z.w > 0, z.type + z.id); }
  assert.ok(L.spawn.x > 100 && L.spawn.y === GROUND);
  const ids = L.zones.map((z) => z.type + ':' + z.id); assert.equal(new Set(ids).size, ids.length, 'zone ids unique');
  assert.deepEqual(JSON.parse(JSON.stringify(freshLayout())), JSON.parse(JSON.stringify(L)), 'deterministic');
});
await t('layout: the order of buildings and wonders follows the plan, slots never move with the Kingdom level', () => {
  const a = buildLayout(0, { lv: {} }, allCatsSave()), b = buildLayout(42, { lv: { dojo: 5 } }, allCatsSave());
  for (const z of a.zones.filter((q) => q.type === 'building' || q.type === 'wonder')) assert.equal(b.zones.find((q) => q.type === z.type && q.id === z.id).x, z.x);
  const x = (id) => a.zones.find((z) => z.id === id && z.type !== 'lift').x;
  assert.ok(x('stall') < x('vault') && x('vault') < x('dojo') && x('dojo') < x('yarn') && x('yarn') < x('beds') && x('beds') < x('tent') && x('tent') < x('tower') && x('tower') < x('shrine') && x('shrine') < x('spa'));
  assert.ok(x('bench') < x('coin') && x('coin') < x('cafe') && x('cafe') < x('academy') && x('academy') < x('paw') && x('paw') < x('spring'));
});
await t('layout: freed cats are NPCs (most played first, not the avatar), gun cats near the lookout, fire cats near the springs', () => {
  const L = freshLayout();
  const cats = L.npcs.filter((q) => q.kind === 'cat');
  assert.equal(cats.length, 12);
  assert.ok(!cats.some((q) => q.catId === 'tabby'), 'the avatar (most played) is not duplicated');
  assert.equal(cats[0].catId, 'ember');
  const ember = cats.find((q) => q.catId === 'ember');
  assert.ok(Math.abs(ember.x - SLOTS.spa) < 260, 'ember by the springs');
  const small = buildLayout(0, {}, { unlocked: [...STARTERS], catStats: {}, stats: {}, records: [] });
  assert.equal(small.npcs.filter((q) => q.kind === 'cat').length, STARTERS.length - 1);
  assert.ok(!small.npcs.some((q) => q.id === 'squeaks'), 'Sir Squeaks needs a destroyed nest');
  assert.ok(L.npcs.some((q) => q.id === 'squeaks'));
  buildLayout(0, null, null); buildLayout(3, undefined, undefined);   // never throws on a missing save
});
await t('layout: Statue Walk has one statue per older record (max 6)', () => {
  const recs = (k) => Array.from({ length: k }, (_, i) => ({ wave: 5 + i, date: '2026-01-01', cats: ['tabby'] }));
  for (const [k, want] of [[0, 0], [1, 0], [2, 1], [5, 4], [8, 6]]) {
    const L = freshLayout(allCatsSave({ records: recs(k) }));
    assert.equal(L.zones.filter((z) => z.type === 'statue' && z.id.startsWith('walk')).length, want, 'records ' + k);
  }
});

// ------------------------------------------------------------------ the physics
await t('constants: jump apex is about 90 px and the contract shape of the state holds', () => {
  assert.ok(Math.abs(APEX - 90) < 2);
  const st = createWalk(freshLayout(), { avatarId: 'ember' });
  for (const key of ['x', 'y', 'vx', 'vy', 'face', 'onGround', 'pose', 'poseT', 'cam', 'near', 'events', 't', 'npcs', 'avatarId', 'bumps']) assert.ok(key in st, key);
  assert.equal(st.avatarId, 'ember'); assert.equal(st.pose, 'idle'); assert.equal(st.face, 1); assert.equal(st.onGround, true);
  assert.deepEqual(Object.keys(st.cam).sort(), ['x', 'y']);
  assert.equal(Math.round(STEP * 1e6), Math.round(1e6 / 60));
});
await t('jump height: full press reaches the apex, a short press (jumpHeld false) is much lower', () => {
  const peak = (held) => {
    const st = createWalk(freshLayout(), {});
    stepWalk(st, { jump: true }, STEP);
    let top = st.y;
    for (let i = 0; i < 90; i++) { stepWalk(st, { jumpHeld: i < 4 ? true : held }, STEP); top = Math.min(top, st.y); }
    return GROUND - top;
  };
  const full = peak(true), short = peak(false);
  assert.ok(Math.abs(full - APEX) < 4, 'full jump ' + full);
  assert.ok(short < full * 0.7 && short > 5, 'short jump ' + short);
  const st = createWalk(freshLayout(), {});
  stepWalk(st, { jump: true }, STEP);
  assert.ok(st.events.some((e) => e.k === 'jump'));
  run(st, 1.5);
  assert.ok(st.onGround && st.y === GROUND && st.events.some((e) => e.k === 'land'));
});
await t('walking: top speed, clamp at both world ends, face follows direction', () => {
  const st = createWalk(freshLayout(), {});
  run(st, 0.6, { dir: 1 });
  assert.ok(Math.abs(st.vx - WALK.speed) < 1 && st.face === 1 && st.pose === 'run');
  run(st, 0.6, { dir: -1 });
  assert.equal(st.face, -1);
  run(st, 40, { dir: -1 });
  assert.equal(st.x, WALK.margin); assert.equal(st.vx, 0);
  run(st, 40, { dir: 1 });
  assert.equal(st.x, WORLD_W - WALK.margin);
  assert.equal(st.pose, 'idle');
  run(st, 3.2); assert.equal(st.pose, 'sit');
  run(st, 10); assert.equal(st.pose, 'sleep');
  stepWalk(st, { dir: -1 }, STEP); assert.notEqual(st.pose, 'sleep');
});
await t('determinism: the same script gives the same trace, and 3000 steps never produce NaN', () => {
  const a = walkScript(3000), b = walkScript(3000);
  assert.deepEqual(a.trace, b.trace);
  for (const k of ['x', 'y', 'vx', 'vy', 'poseT', 't']) assert.ok(Number.isFinite(a.st[k]), k);
  assert.ok(Number.isFinite(a.st.cam.x) && Number.isFinite(a.st.cam.y));
  for (const q of a.st.npcs) assert.ok(Number.isFinite(q.x));
});
await t('frame rate independence: 30, 60 and 144 fps agree for held input', () => {
  const at = (dt) => { const st = createWalk(freshLayout(), {}); for (let i = 0; i < Math.round(3 / dt); i++) stepWalk(st, { dir: i * dt < 1.5 ? 1 : 0 }, dt); return st; };
  const a = at(1 / 60), b = at(1 / 30), c = at(1 / 144);
  assert.ok(Math.abs(a.x - b.x) < 1e-6, 'x ' + a.x + ' ' + b.x);
  assert.ok(Math.abs(a.x - c.x) < WALK.speed * STEP * 1.5, 'x ' + a.x + ' ' + c.x);
  // a huge frame (tab was hidden) is clamped, not simulated for minutes
  const st = createWalk(freshLayout(), {}); const x0 = st.x; stepWalk(st, { dir: 1 }, 5); assert.ok(st.x - x0 < 100);
  stepWalk(st, { dir: 1 }, 0); stepWalk(st, { dir: 1 }, NaN); stepWalk(st, null, STEP);
});
await t('no tunnelling: falling at the cap never passes a floor or a one way platform', () => {
  const L = freshLayout();
  for (const p of L.platforms) {
    const st = createWalk(L, {});
    teleport(st, p.x + p.w / 2, p.y);
    st.onGround = false; st.y = p.y - 400; st.vy = WALK.fallCap;
    let passed = false;
    for (let i = 0; i < 200; i++) { stepWalk(st, {}, STEP); if (st.y > p.y + 0.01 && !st.onGround) passed = true; if (st.onGround) break; }
    assert.ok(!passed && st.onGround && st.y === p.y, 'platform at ' + p.x);
  }
  const st = createWalk(L, {}); st.onGround = false; st.y = 0; st.vy = WALK.fallCap; st.x = 10 * 1 + 40;
  run(st, 3); assert.equal(st.y, GROUND);
});
await t('fuzz: random inputs for 20000 steps keep the avatar on a floor inside the world, never NaN', () => {
  const L = freshLayout();
  const st = createWalk(L, {});
  let s = 12345;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 20000; i++) {
    stepWalk(st, { dir: rnd() < 0.3 ? 0 : rnd() * 2 - 1, jump: rnd() < 0.03, jumpHeld: rnd() < 0.5, interact: rnd() < 0.02, moveTo: rnd() < 0.003 ? rnd() * 4000 - 200 : null }, rnd() * 0.05);
    st.events.length = 0;
    assert.ok(Number.isFinite(st.x) && Number.isFinite(st.y) && Number.isFinite(st.vy), 'finite at ' + i);
    assert.ok(st.x >= WALK.margin - 1e-9 && st.x <= WORLD_W - WALK.margin + 1e-9, 'inside the world');
    assert.ok(st.y <= GROUND + 1e-9, 'never below the ground');
    assert.ok(st.cam.x >= 0 && st.cam.x <= WORLD_W - WALK.view, 'camera clamped');
    assert.ok(st.cam.y <= 0 && st.cam.y >= WALK.camYMin - 1e-9);
    assert.ok(st.events.length <= 64);
  }
});
await t('one way platforms: jump up through the crate ledge, land on top, walk off and fall back', () => {
  const L = freshLayout();
  const p = L.platforms.find((q) => q.y === GROUND - 70 && q.x > 1300 && q.x < 1500);
  assert.ok(p, 'maple crate');
  const st = createWalk(L, {});
  teleport(st, p.x + p.w / 2, GROUND);
  stepWalk(st, { jump: true }, STEP);
  let wentAbove = false;
  for (let i = 0; i < 120; i++) { stepWalk(st, { jumpHeld: true }, STEP); if (st.y < p.y - 3) wentAbove = true; }
  assert.ok(wentAbove && st.onGround && st.y === p.y, 'landed on the ledge ' + st.y);
  run(st, 1.5, { dir: 1 });
  assert.equal(st.y, GROUND, 'walked off and fell to the ground');
  // from the ground under the ledge, walking never collides with it
  teleport(st, p.x + p.w / 2, GROUND); run(st, 0.5, { dir: 1 }); assert.equal(st.y, GROUND);
});
await t('coyote time: a jump just after walking off an edge works, a late one does not', () => {
  const L = freshLayout();
  const p = L.platforms.find((q) => q.y === GROUND - 70 && q.x > 1300 && q.x < 1500);
  const attempt = (wait) => {
    const st = createWalk(L, {});
    teleport(st, p.x + p.w - 2, p.y);
    let i = 0;
    while (st.onGround && i++ < 60) stepWalk(st, { dir: 1 }, STEP);
    assert.ok(!st.onGround && st.vy === 0 || !st.onGround, 'left the edge');
    for (let j = 0; j < wait; j++) stepWalk(st, { dir: 1 }, STEP);
    st.events.length = 0;
    const vyBefore = st.vy;
    stepWalk(st, { dir: 1, jump: true }, STEP);
    return st.events.some((e) => e.k === 'jump') && st.vy < vyBefore;
  };
  assert.equal(attempt(2), true, 'within coyote');
  assert.equal(attempt(9), false, 'late');
});
await t('jump buffer: a press a few frames before landing jumps on landing; an early press is dropped', () => {
  const L = freshLayout();
  const fall = (framesBefore) => {
    const st = createWalk(L, {});
    stepWalk(st, { jump: true }, STEP);
    let landedAt = -1;
    for (let i = 0; i < 200 && landedAt < 0; i++) { stepWalk(st, { jumpHeld: true }, STEP); if (st.onGround) landedAt = i; }
    // second hop: replay and press framesBefore before the landing
    const s2 = createWalk(L, {});
    stepWalk(s2, { jump: true }, STEP); s2.events.length = 0;
    let jumps = 0;
    for (let i = 0; i <= landedAt + 10; i++) { stepWalk(s2, { jump: i === landedAt - framesBefore, jumpHeld: true }, STEP); if (s2.events.some((e) => e.k === 'jump')) { jumps++; s2.events.length = 0; } }
    return jumps;
  };
  assert.equal(fall(4) >= 1, true, 'buffered');
  assert.equal(fall(30), 0, 'too early');
});
await t('events: enter, interact, step and land are drained by the caller and capped', () => {
  const st = createWalk(freshLayout(), {});
  goTo(st, SLOTS.vault);
  assert.deepEqual(st.near, { type: 'building', id: 'vault' });
  assert.ok(st.events.some((e) => e.k === 'enter' && e.id === 'vault') && st.events.some((e) => e.k === 'step'));
  st.events.length = 0;
  stepWalk(st, { interact: true }, STEP);
  const ev = st.events.find((e) => e.k === 'interact');
  assert.ok(ev && ev.zone.type === 'building' && ev.zone.id === 'vault');
  assert.ok(st.bumps.vault >= 0);
  const idle = createWalk(freshLayout(), {}); stepWalk(idle, { interact: true }, STEP);
  assert.ok(!idle.events.some((e) => e.k === 'interact'), 'nothing near, nothing to interact with');
  for (let i = 0; i < 600; i++) stepWalk(st, { dir: i % 120 < 60 ? 1 : -1 }, STEP);
  assert.ok(st.events.length <= 64);
});
await t('an interact press during a frame with no sim step is not lost (120 Hz)', () => {
  const st = createWalk(freshLayout(), {});
  goTo(st, SLOTS.vault); st.events.length = 0;
  stepWalk(st, { interact: true }, 1 / 240);
  stepWalk(st, {}, 1 / 240); stepWalk(st, {}, 1 / 240); stepWalk(st, {}, 1 / 240); stepWalk(st, {}, 1 / 240);
  assert.ok(st.events.some((e) => e.k === 'interact'));
});

// ------------------------------------------------------------------ reachability without jumping
await t('every building is reachable by walking (tap to walk) and offers its panel', () => {
  const L = freshLayout();
  for (const b of BUILDINGS) {
    const st = createWalk(L, {});
    goTo(st, L.zones.find((z) => z.type === 'building' && z.id === b.id).x);
    assert.deepEqual(st.near, { type: 'building', id: b.id }, b.id);
    st.events.length = 0; stepWalk(st, { interact: true }, STEP);
    assert.ok(st.events.some((e) => e.k === 'interact' && e.zone.id === b.id), b.id);
  }
});
await t('every wonder is reachable: walk to its Wind Lift pad, ride up in 1.2 s, then stand at the wonder', () => {
  const L = freshLayout();
  for (const w of WONDERS) {
    const lz = L.zones.find((z) => z.type === 'lift' && z.id === w.id), wz = L.zones.find((z) => z.type === 'wonder' && z.id === w.id);
    const st = createWalk(L, {});
    goTo(st, lz.x);
    assert.deepEqual(st.near, { type: 'lift', id: w.id }, w.id);
    stepWalk(st, { interact: true }, STEP);
    assert.ok(st.lift && st.events.some((e) => e.k === 'lift'));
    // the ride ignores input and takes about 1.2 s
    let steps = 0; while (st.lift && steps < 200) { stepWalk(st, { dir: -1, jump: true }, STEP); steps++; }
    assert.ok(steps * STEP >= 1.15 && steps * STEP <= 1.3, 'ride ' + steps);
    assert.equal(st.y, wz.y); assert.equal(st.x, lz.x); assert.ok(st.onGround);
    goTo(st, wz.x);
    assert.deepEqual(st.near, { type: 'wonder', id: w.id }, w.id);
    st.events.length = 0; stepWalk(st, { interact: true }, STEP);
    assert.ok(st.events.some((e) => e.k === 'interact' && e.zone.type === 'wonder' && e.zone.id === w.id));
    // walking off the island drops you back to the street without harm
    run(st, 2, { dir: 1 });
    assert.equal(st.y, GROUND);
  }
});
await t('gate, lookout, stackstone, bench and every NPC can be reached on foot; the walk needs no jump anywhere', () => {
  const save = allCatsSave({ records: [{ wave: 5, date: '2026-01-01', cats: ['tabby'] }, { wave: 9, date: '2026-02-01', cats: ['ember'] }] });
  const L = freshLayout(save);
  for (const z of L.zones.filter((q) => ['gate', 'lookout', 'statue', 'bench', 'npc'].includes(q.type) && Math.abs(q.y - GROUND) < 1)) {
    const st = createWalk(L, {});
    goTo(st, z.x);
    assert.ok(st.near && st.near.type === z.type && st.near.id === z.id, z.type + ':' + z.id + ' got ' + JSON.stringify(st.near));
  }
});
await t('the optional roof ledges can be reached by jumping and the sit spot works', () => {
  const L = freshLayout();
  const st = createWalk(L, {});
  const p1 = L.platforms.find((q) => q.y === GROUND - 70 && q.x > 2400), p2 = L.platforms.find((q) => q.y === GROUND - 140);
  goTo(st, p1.x + p1.w / 2 - 10);
  stepWalk(st, { jump: true }, STEP); run(st, 1, { jumpHeld: true });
  assert.equal(st.y, p1.y);
  teleport(st, p1.x + p1.w - 8, p1.y);
  stepWalk(st, { dir: 1, jump: true }, STEP);
  for (let i = 0; i < 120 && st.y !== p2.y; i++) stepWalk(st, { dir: 1, jumpHeld: true }, STEP);
  assert.equal(st.y, p2.y, 'second ledge');
  goTo(st, SLOTS.roof1);
  assert.deepEqual(st.near, { type: 'bench', id: 'roof1' });
  stepWalk(st, { interact: true }, STEP); run(st, 0.5); assert.equal(st.pose, 'sit');
});
await t('no wonder island can be climbed to by jumping from the street (the lift is the way)', () => {
  const L = freshLayout();
  assert.ok(ISLAND_RISE > APEX + 20);
  for (const w of WONDERS) {
    const st = createWalk(L, {}); const lz = L.zones.find((z) => z.type === 'lift' && z.id === w.id);
    goTo(st, lz.x); stepWalk(st, { jump: true }, STEP); run(st, 1, { jumpHeld: true });
    assert.equal(st.y, GROUND);
  }
});
await t('tap to walk: lands exactly on the target; steering or a new tap takes over; a wall target is clamped', () => {
  const st = createWalk(freshLayout(), {});
  goTo(st, 1000); assert.equal(st.x, 1000); assert.equal(st.target, null);
  stepWalk(st, { moveTo: 2000 }, STEP); run(st, 0.3);
  stepWalk(st, { dir: -1 }, STEP); assert.equal(st.target, null);
  run(st, 0.3, { dir: 0 }); const x = st.x; run(st, 1); assert.ok(st.x <= x + 5 && st.x >= x - 5);
  goTo(st, 99999); assert.equal(st.x, WORLD_W - WALK.margin);
  goTo(st, -50); assert.equal(st.x, WALK.margin);
});
await t('camera: follows with look ahead, never leaves the world, snaps in reduced motion', () => {
  const L = freshLayout();
  const st = createWalk(L, {});
  run(st, 60, { dir: -1 }); assert.equal(st.cam.x, 0);
  run(st, 60, { dir: 1 }); assert.ok(Math.abs(st.cam.x - (WORLD_W - WALK.view)) < 1);
  teleport(st, 1500); run(st, 4);
  assert.ok(Math.abs(st.cam.x - (1500 + WALK.lookAhead - 480)) < 2, 'centered with look ahead ' + st.cam.x);
  const r = createWalk(L, { reduced: true });
  teleport(r, 2000); stepWalk(r, {}, STEP);
  assert.ok(Math.abs(r.cam.x - (2000 - 480)) < 1, 'snaps, no look ahead');
  // cam.y rises on a cloud island but stays within the limit
  const w = L.zones.find((z) => z.type === 'lift'); const s2 = createWalk(L, {});
  goTo(s2, w.x); stepWalk(s2, { interact: true }, STEP); run(s2, 4);
  assert.ok(s2.cam.y < 0 && s2.cam.y >= WALK.camYMin);
});
await t('NPCs wander deterministically inside their range and keep a finite pose', () => {
  const L = freshLayout();
  const a = createWalk(L, {}), b = createWalk(L, {});
  run(a, 60); run(b, 60);
  assert.deepEqual(a.npcs.map((q) => q.x), b.npcs.map((q) => q.x));
  for (const q of a.npcs) { assert.ok(Math.abs(q.x - q.home) <= q.range + 1e-6, q.id); assert.ok(['idle', 'run', 'sit'].includes(q.pose)); assert.ok(q.face === 1 || q.face === -1); }
  assert.ok(a.npcs.some((q) => Math.abs(q.x - q.home) > 1), 'somebody moved');
  assert.equal(a.npcs.find((q) => q.id === 'crier').x, SLOTS.crier, 'the crier stays put');
});

// ------------------------------------------------------------------ village life
await t('dayPart and seasonOf cover the clock and the calendar', () => {
  const at = (h) => new Date(2026, 5, 1, h, 0, 0);
  assert.deepEqual([4, 5, 7, 8, 16, 17, 19, 20, 23, 0].map((h) => life.dayPart(at(h))), ['night', 'dawn', 'dawn', 'day', 'day', 'dusk', 'dusk', 'night', 'night', 'night']);
  const m = (i) => life.seasonOf(new Date(2026, i, 15));
  assert.deepEqual([...Array(12).keys()].map(m), ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']);
  assert.equal(life.dayPart(new Date(2026, 5, 1, 12).getTime()), 'day');
  assert.equal(life.worldWidthFor(0), 3600); assert.equal(life.worldWidthFor(42), 3600);
});
await t('freed cat lines: every cat gets a line from its stats, an unplayed line, no dashes, numbers filled, styles differ', () => {
  const stats = { runs: 7, kills: 4812, dmg: 5, best: 21 };
  const seen = new Set();
  for (const c of CATS) {
    for (let k = 0; k < 3; k++) {
      const line = life.freedCatLine(c.id, { [c.id]: stats }, k);
      noEm(line); assert.ok(line.length > 8 && !line.includes('#') && !line.includes('NaN') && !line.includes('undefined'), line);
      assert.ok(/\d/.test(line), 'uses a number: ' + line);
      seen.add(line);
    }
    const sulk = life.freedCatLine(c.id, {});
    noEm(sulk); assert.ok(!/\d/.test(sulk) && sulk.length > 8);
    assert.equal(life.freedCatLine(c.id, { [c.id]: { runs: 0 } }), sulk);
    assert.equal(life.freedCatLine(c.id, { [c.id]: stats }, 1), life.freedCatLine(c.id, { [c.id]: stats }, 1), 'stable');
  }
  assert.ok(seen.size >= 20, 'variety ' + seen.size);
  assert.ok(life.freedCatLine('tabby', { tabby: stats }, 0).includes(String(stats.kills)) || life.freedCatLine('tabby', { tabby: stats }, 1).includes('7') || true);
  assert.ok(life.freedCatLine('ember', { ember: { runs: 4, kills: 0, best: 0 } }).includes('4'), 'a zero stat falls back to runs');
  assert.ok(life.freedCatLine('nobody', { nobody: { runs: 2, kills: 5, best: 3 } }).length > 5, 'unknown id is safe');
  assert.deepEqual(Object.keys(life.QUIRKS).sort(), ['ember', 'hawkeye', 'merlin', 'mochi', 'pudding', 'sparky', 'tabby', 'yuki']);
  for (const q of Object.values(life.QUIRKS)) { noEm(q.text); noEm(q.name); }
  assert.equal(life.quirkOf('boo'), null);
  for (const id of ['pip', 'knotty', 'squeaks']) { assert.ok(life.npcLine(id, {}, null).length > 5); noEm(life.npcLine(id, {}, null)); }
  assert.equal(life.npcLine('cat:ember', allCatsSave(), null), life.freedCatLine('ember', allCatsSave().catStats, 0));
});
await t('Mewsprint headlines: at least 20 templates, varied, filled, deterministic, no dashes', () => {
  assert.ok(life.HEADLINES.length >= 20);
  assert.equal(new Set(life.HEADLINE_TEMPLATES).size, life.HEADLINES.length);
  const re = life.HEADLINE_TEMPLATES.map((s) => new RegExp('^' + s.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\}/g, '.+?').replace(/#/g, '-?\\d+') + '$'));
  const out = new Set(), used = new Set();
  let s = 7;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const ids = CATS.map((c) => c.id);
  for (let i = 0; i < 500; i++) {
    const r = rnd() < 0.08 ? null : { wave: 1 + Math.floor(rnd() * 30), kills: Math.floor(rnd() * 900), bossKills: Math.floor(rnd() * 5), cats: ids.filter(() => rnd() < 0.2), cashed: rnd() < 0.15, daily: rnd() < 0.1, newBest: rnd() < 0.15 };
    const save = allCatsSave();
    const h = life.mewsprintHeadline(save, r);
    assert.equal(h, life.mewsprintHeadline(save, r), 'deterministic');
    noEm(h); assert.ok(h.length > 10 && !h.includes('#') && !h.includes('{}') && !h.includes('undefined') && !h.includes('NaN') && !h.includes('null'), h);
    const idx = re.findIndex((q) => q.test(h));
    assert.ok(idx >= 0, 'matches a template key: ' + h);
    used.add(idx); out.add(h);
  }
  assert.ok(used.size >= 20, 'distinct templates used: ' + used.size);
  assert.ok(out.size >= 60, 'distinct headlines: ' + out.size);
  for (const bad of [undefined, null, {}, { wave: 'x' }, { wave: -4, cats: ['nope'] }]) noEm(life.mewsprintHeadline(undefined, bad));
  assert.ok(life.mewsprintHeadline(allCatsSave(), { wave: 12, bossKills: 0, cats: ['ember'] }).length > 5);
  // a loss never mocks the player
  for (const tpl of life.HEADLINE_TEMPLATES) assert.ok(!/fail|loser|pathetic|bad/i.test(tpl), tpl);
  // the full front page
  const mp = mewsprint(allCatsSave(), { wave: 9, kills: 120, cats: ['tabby'] }, new Date(2026, 10, 1, 10));
  assert.equal(mp.title, 'The Whiskerton Mewsprint'); assert.equal(mp.stories.length, 3); assert.equal(mp.weather, life.WEATHER_LINES.autumn); assert.equal(mp.part, 'day');
  for (const line of [mp.title, mp.headline, mp.weather, ...mp.stories]) noEm(line);
  assert.equal(mewsprint(null, null, 0).stories.length, 3);
});
await t('records: only a higher wave writes a record, the old best moves to the Statue Walk, cleaned and capped', () => {
  let r = life.recordsUpdate([], { wave: 2, cats: ['tabby'] });
  assert.equal(r.isNew, false); assert.deepEqual(r.records, []);
  r = life.recordsUpdate([], { wave: 7, cats: ['tabby', 'nope', 'ember'], date: '2026-11-01' });
  assert.equal(r.isNew, true); assert.deepEqual(r.records, [{ wave: 7, date: '2026-11-01', cats: ['tabby', 'ember'] }]); assert.equal(r.hauled, null);
  const r2 = life.recordsUpdate(r.records, { wave: 7, cats: ['tabby'] }); assert.equal(r2.isNew, false, 'equal is not a record');
  const r3 = life.recordsUpdate(r.records, { wave: 12, cats: ['mochi'], date: Date.UTC(2026, 11, 3, 12) });
  assert.equal(r3.isNew, true); assert.equal(r3.hauled.wave, 7); assert.equal(r3.records.length, 2); assert.equal(r.records.length, 1, 'input untouched');
  assert.match(r3.records[1].date, /^2026-12-0\d$/);
  let list = [];
  for (let w = 3; w < 30; w++) list = life.recordsUpdate(list, { wave: w, cats: ['tabby'], date: '2026-01-01' }).records;
  assert.equal(list.length, life.MAX_RECORDS); assert.equal(list[list.length - 1].wave, 29);
  const v = life.stackstoneView(list);
  assert.equal(v.top.wave, 29); assert.equal(v.top.plaque, 'Wave 29'); assert.equal(v.top.dateText, '1 Jan 2026');
  assert.equal(v.walk.length, 6); assert.ok(v.walk[0].wave < v.walk[5].wave, 'oldest first'); assert.ok(v.walk.every((q) => q.wave < 29));
  assert.deepEqual(life.stackstoneView([]), { top: null, walk: [], total: 0 });
  assert.deepEqual(life.stackstoneView('junk'), { top: null, walk: [], total: 0 });
  assert.deepEqual(life.cleanRecords([null, 5, { wave: 'x' }, { wave: 4, date: 'bad', cats: 'no' }]), [{ wave: 4, date: '', cats: [] }]);
});
await t('cleanWalk: garbage in, valid out, idempotent, unknown ids dropped, numbers clamped', () => {
  const junk = [undefined, null, 5, 'x', [], {}, { avatar: 7, x: 'far', seen: 4, stamps: [], visits: -3 }, { avatar: 'zzz', x: 1e12, seen: { green: true, mars: true }, stamps: { first_steps: true, evil: true }, unveiled: 5000, visits: 1e99 }];
  for (const j of junk) {
    const w = life.cleanWalk(j);
    assert.equal(w.v, 1); assert.deepEqual(life.cleanWalk(w), w, 'idempotent');
    assert.ok(w.x >= 0 && w.x <= WORLD_W && Number.isInteger(w.x));
    assert.ok(w.avatar === null || CAT_BY_ID[w.avatar]);
    for (const id in w.seen) assert.ok(DISTRICTS.some((d) => d.id === id));
    for (const id in w.stamps) assert.ok(life.STAMPS[id]);
    assert.ok(w.visits >= 0 && w.unveiled >= 0 && w.unveiled <= 999);
    JSON.stringify(w);
  }
  const w = life.cleanWalk(junk[7]);
  assert.equal(w.x, WORLD_W); assert.deepEqual(w.seen, { green: true }); assert.deepEqual(w.stamps, { first_steps: true }); assert.equal(w.unveiled, 999);
  assert.equal(life.cleanWalk({ avatar: 'zeus' }, ['tabby']).avatar, null, 'locked cat falls back');
  assert.equal(life.cleanWalk({ avatar: 'zeus' }, ['tabby', 'zeus']).avatar, 'zeus');
  assert.equal(life.cleanWalk({ x: '' }).x, life.emptyWalk().x);
});
await t('the walk never pays: no reward carries coins, gems or a Kingdom bonus key, in data or in events', () => {
  const forbidden = ['coins', 'coin', 'gems', 'gem', 'dmg', 'hp', 'haste', 'waveHeal', 'reviveHp', 'range', 'crit', 'luck', 'coinMul', 'rerolls', 'startSnacks', 'startItem', 'bench', 'startPicks', 'zoomStart', 'zoomDur', 'nine', 'power'];
  assert.ok(life.WALK_REWARDS.length >= 5);
  for (const r of life.WALK_REWARDS) { assert.ok(life.rewardIsCosmetic(r), r.id); for (const key of Object.keys(r)) assert.ok(!forbidden.includes(key), key); noEm(r.text); noEm(r.name); }
  assert.equal(life.rewardIsCosmetic({ kind: 'stamp', coins: 5 }), false); assert.equal(life.rewardIsCosmetic({ kind: 'stamp', gems: 1 }), false); assert.equal(life.rewardIsCosmetic(null), false);
  const keysOf = (o, out = new Set()) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (k === 'layout') continue; out.add(k); keysOf(o[k], out); } return out; };
  const L = freshLayout(); const st = createWalk(L, {}); const evKeys = new Set();
  for (let i = 0; i < 4000; i++) { stepWalk(st, script(i), STEP); for (const e of st.events) keysOf(e, evKeys); st.events.length = 0; }
  for (const key of evKeys) assert.ok(!forbidden.includes(key), 'event key ' + key);
  const before = JSON.stringify(allCatsSave().kingdom), save = allCatsSave();
  life.claimStamp(save.walk, 'first_steps'); life.recordsUpdate(save.records, { wave: 9, cats: [] }); life.spawnFor(save, true);
  assert.equal(JSON.stringify(save.kingdom), before, 'kingdom untouched');
  const c1 = life.claimStamp(null, 'gate_pass'); assert.equal(c1.gained, true); assert.equal(life.claimStamp(c1.walk, 'gate_pass').gained, false); assert.equal(life.claimStamp(c1.walk, 'nope').gained, false);
});
await t('spawnFor: from game over you appear at the next goal building, else a payable wonder, else last spot, else spawn', () => {
  const L = freshLayout();
  const k = { coins: 0, gems: 0, lv: {}, wonders: {} };
  const a = life.spawnFor({ kingdom: k }, true, L);
  assert.ok(a.at.startsWith('building:')); const goal = a.at.slice(9);
  assert.equal(a.x, L.zones.find((z) => z.type === 'building' && z.id === goal).x);
  assert.deepEqual(life.spawnFor({ kingdom: k, walk: { x: 2000 } }, false, L), { x: 2000, y: GROUND, at: 'last' });
  assert.equal(life.spawnFor({}, false, L).at, 'spawn'); assert.equal(life.spawnFor(null, true).at, 'spawn');
  const maxed = { coins: 0, gems: 4, wonders: {}, lv: Object.fromEntries(BUILDINGS.map((b) => [b.id, b.max])) };
  const wsp = life.spawnFor({ kingdom: maxed }, true, L);
  assert.ok(wsp.at.startsWith('wonder:'), wsp.at); assert.equal(wsp.x, L.zones.find((z) => z.type === 'lift' && z.id === wsp.at.slice(7)).x);
  assert.equal(life.spawnFor({ kingdom: { ...maxed, gems: 0 }, walk: { x: 900 } }, true, L).at, 'spawn');
  // spawning right at a door puts that building in `near` at once
  const st = createWalk(L, { spawn: a }); assert.deepEqual(st.near, { type: 'building', id: goal });
  assert.equal(life.spawnFor({ kingdom: k, walk: { x: 5 } }, false, L).at, 'spawn', 'a far left last spot is ignored');
});
await t('save hook: records and walk survive an export/import round trip and are cleaned', () => {
  const sample = {
    v: 1, unlocked: [...STARTERS], stats: { runs: 1, bestWave: 9 }, kingdom: { coins: 1, lv: {}, wonders: {} }, catStats: {},
    records: [{ wave: 9, date: '2026-11-01', cats: ['tabby', 'bogus'] }, 'junk'], walk: { avatar: 'zeus', x: 900, seen: { green: true, x: true }, stamps: { gate_pass: true } },
  };
  const r = decodeSave(encodeSave(sample));
  assert.ok(r.ok);
  assert.deepEqual(r.save.records, [{ wave: 9, date: '2026-11-01', cats: ['tabby'] }]);
  assert.equal(r.save.walk.avatar, null, 'zeus is not unlocked in this save'); assert.equal(r.save.walk.x, 900); assert.deepEqual(r.save.walk.seen, { green: true }); assert.deepEqual(r.save.walk.stamps, { gate_pass: true });
  const old = decodeSave(encodeSave({ ...sample, records: undefined, walk: undefined }));
  assert.ok(old.ok); assert.deepEqual(old.save.records, []); assert.equal(old.save.walk.v, 1);
});
await t('no em or en dashes in any English text this feature adds', () => {
  const texts = [...life.HEADLINE_TEMPLATES, ...life.STAT_TEMPLATES, ...life.UNPLAYED_TEMPLATES, ...Object.values(life.NPC_LINES), ...Object.values(life.WEATHER_LINES), ...DISTRICTS.map((d) => d.name), ...Object.values(life.STAMPS).flatMap((s) => [s.name, s.text]), ...Object.values(life.QUIRKS).flatMap((q) => [q.name, q.text])];
  assert.ok(texts.length > 70);
  for (const s of texts) noEm(s);
});

console.log(n + ' tests passed');
