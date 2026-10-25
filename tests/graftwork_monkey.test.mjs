// Monkey test: a seeded random-input fuzzer that drives the REAL UI (pointer, keys, wheel, drags, settings, resize,
// save/reload, abandon) and checks run + app invariants after every tick. Deterministic per seed.
//   GW_MONKEY_RUNS=4 GW_MONKEY_TICKS=2500 node tests/graftwork_monkey.test.mjs     (defaults shown)
//   GW_MONKEY_SEED=marrow:3 GW_MONKEY_TICKS=20000 node tests/graftwork_monkey.test.mjs   (replay a single seed, verbose)
import assert from 'node:assert/strict';
import { fakeCtx, installDom } from './graftwork_lib.mjs';

installDom();
const canvas = { getContext: () => fakeCtx(), addEventListener() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), width: 1280, height: 720, setPointerCapture() {} };
globalThis.document.getElementById = () => null;
globalThis.localStorage = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; })();

const { boot } = await import('../graftwork/main.js');
const RUN = await import('../graftwork/engine/run.js');
const { saveRun, loadRun } = await import('../graftwork/engine/save.js');
const { fight, POLICIES } = await import('../tools/graftwork_sim.mjs');
const D = await import('../graftwork/data/index.js');
const { CARDS, GRAFTS, ENEMIES, RELICS, POTIONS, EVENTS } = D;

const { app, flow } = boot(canvas);
const PHASES = ['map', 'combat', 'reward', 'graft', 'shop', 'forge', 'event', 'dead', 'won'];
const PHASE_SCREEN = { map: 'map', combat: 'combat', reward: 'reward', graft: 'graft', shop: 'shop', forge: 'forge', event: 'event', dead: 'end', won: 'end' };
const MODALS = new Set(['deckview', 'codex', 'settings']);
const MAX_TICKS = Number(process.env.GW_MONKEY_TICKS || 2500);
const RUNS = Number(process.env.GW_MONKEY_RUNS || 4);
const ONE = process.env.GW_MONKEY_SEED || '';
const STUCK = 4000;

// ---- record the rectangles screens offer this frame (buttons, click targets, hover zones) ----
let rects = [], lastRects = [];
const oButton = app.button, oClicked = app.clicked, oInRect = app.inRect;
app.button = (label, x, y, w, h, o) => { if (rects.length < 400 && !(o && o.disabled)) rects.push([x, y, w, h]); return oButton(label, x, y, w, h, o); };
app.clicked = (x, y, w, h) => { if (rects.length < 400 && w > 8 && h > 8) rects.push([x, y, w, h]); return oClicked(x, y, w, h); };
app.inRect = (x, y, w, h) => { if (rects.length < 400 && w > 8 && h > 8) rects.push([x, y, w, h]); return oInRect(x, y, w, h); };
app.hover = app.inRect;

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hashStr = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

class Fail extends Error {}
let ctxInfo = null; // { id, tick, log }
const fail = (msg) => { throw new Fail(msg); };

// ---- invariants ----
function scanNums(o, path, depth, seen) {
  if (depth > 7 || o === null) return;
  if (typeof o === 'number') { if (!Number.isFinite(o)) fail(`non-finite number at ${path}`); return; }
  if (typeof o !== 'object' || seen.has(o)) return;
  seen.add(o);
  if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) { if (o[i] === undefined) fail(`undefined array entry at ${path}[${i}]`); scanNums(o[i], `${path}[${i}]`, depth + 1, seen); } return; }
  for (const k of Object.keys(o)) { if (k === 'rng') continue; scanNums(o[k], `${path}.${k}`, depth + 1, seen); }
}
function checkRun(run) {
  if (!PHASES.includes(run.phase)) fail('unknown phase ' + run.phase);
  if (!(run.hp >= 0 && run.hp <= run.maxHp)) fail(`hp ${run.hp}/${run.maxHp} out of range`);
  if (!(run.gold >= 0)) fail('gold ' + run.gold);
  if (!(run.maxHp > 0)) fail('maxHp ' + run.maxHp);
  scanNums(run, 'run', 0, new Set());
  const uids = new Set();
  for (const inst of run.deck) {
    if (!inst || !CARDS[inst.id]) fail('deck has bad card ' + JSON.stringify(inst));
    if (uids.has(inst.uid)) fail('duplicate uid ' + inst.uid); uids.add(inst.uid);
    if (!Array.isArray(inst.grafts)) fail('card without grafts array ' + inst.id);
    for (const g of inst.grafts) if (!GRAFTS[g]) fail(`card ${inst.id} has unknown graft ${g}`);
    if (inst.grafts.length > 3) fail(`card ${inst.id} has ${inst.grafts.length} grafts`);
  }
  for (const r of run.relics) if (!RELICS[r]) fail('bad relic ' + r);
  for (const p of run.potions) if (!POTIONS[p]) fail('bad potion ' + p);
  if (new Set(run.relics).size !== run.relics.length) fail('duplicate relic');
  if (run.potions.length > RUN.potionSlots(run)) fail('too many potions ' + run.potions.length);
  const p = run.pending;
  switch (run.phase) {
    case 'combat': if (!p || !Array.isArray(p.enemies) || !p.enemies.length || p.enemies.some((e) => !ENEMIES[e])) fail('combat without valid enemies'); break;
    case 'graft': if (!p) break; /* null while the attach / skip animation runs, then afterGraft routes on */ if (p.kind !== 'graft') fail('graft phase with wrong pending'); for (const u of p.offer.cards) if (!RUN.findInst(run, u)) fail('offer card not in deck ' + u); for (const g of p.offer.grafts) if (!GRAFTS[g]) fail('offer bad graft'); break;
    case 'shop': if (!p || p.kind !== 'shop') fail('shop phase without shop'); break;
    case 'forge': if (!p || p.kind !== 'forge') fail('forge phase without forge'); break;
    case 'event': if (!p || p.kind !== 'event' || !EVENTS[p.id]) fail('event phase without event'); break;
    case 'reward': if (!p) fail('reward phase without pending'); break;
    case 'map': if (!run.map || !run.map.nodes) fail('map phase without map'); break;
    default:
  }
}
function checkApp() {
  if (!app.stack.length) fail('app.stack empty');
  if (!app.screens[app.current]) fail('unknown current screen ' + app.current);
  if (app.stack[0] !== app.screens[app.current]) fail(`stack base is ${app.stack[0].name}, current is ${app.current}`);
  for (let i = 1; i < app.stack.length; i++) if (!MODALS.has(app.stack[i].name)) fail('non-modal screen stacked: ' + app.stack[i].name);
  for (const k of ['scale', 'px', 'dpr']) if (!Number.isFinite(app[k])) fail(`app.${k} is ${app[k]}`);
  for (const k of ['x', 'y']) if (!Number.isFinite(app.mouse[k])) fail(`mouse.${k} is ${app.mouse[k]}`);
  scanNums(app.shared.meta, 'meta', 0, new Set());
  const run = app.shared.run;
  if (run && app.current !== 'title') {
    checkRun(run);
    const want = PHASE_SCREEN[run.phase];
    if (app.current !== want) fail(`phase ${run.phase} but screen ${app.current} (stack ${app.stack.map((s) => s.name)})`);
  } else if (run) checkRun(run);
}

// ---- tick with checks ----
let stuckKey = '', stuckN = 0, combatTicks = 0;
const warnings = [];
function step(dt = 1 / 60) {
  lastRects = rects; rects = [];
  ctxInfo.tick++;
  app.tick(dt);
  checkApp();
  const run = app.shared.run;
  const key = `${app.current}|${app.top().name}|${run ? run.phase : '-'}`;
  if (key === stuckKey) stuckN++; else { stuckKey = key; stuckN = 0; }
  const exempt = app.current === 'map' || app.current === 'title' || (run && run.phase === 'combat');
  if (!exempt && stuckN > STUCK) fail(`stuck ${STUCK} ticks in state ${key}`);
  combatTicks = run && run.phase === 'combat' && app.current === 'combat' ? combatTicks + 1 : 0;
}

// ---- actions ----
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'q', 'w', 'e', 'r', ' ', 'Enter', 'Escape', 'Tab'];
const SIZES = [[1280, 720], [1024, 768], [800, 600], [390, 844], [844, 390], [1920, 1080], [320, 240], [3000, 400], [2, 2], [0, 0]];
function target(R) {
  if (lastRects.length && R() < 0.8) {
    const r = lastRects[Math.floor(R() * lastRects.length)];
    return [r[0] + R() * r[2], r[1] + R() * r[3]];
  }
  return [R() * 1300 - 10, R() * 740 - 10];
}
function log(s) { ctxInfo.log.push(`t${ctxInfo.tick} ${s}`); if (ctxInfo.log.length > 25) ctxInfo.log.shift(); }
function doKey(R) {
  const k = KEYS[Math.floor(R() * KEYS.length)];
  log('key ' + k);
  const e = { key: k, repeat: false, preventDefault() {} };
  app.keys.add(k); app.pressedKeys.push(e);
  const s = app.top(); if (s && s.key) s.key(app, e);
  step(); app.keys.delete(k);
}
function doClick(R) {
  const [x, y] = target(R);
  log(`click ${x | 0},${y | 0}`);
  app.mouse.x = x; app.mouse.y = y; app.mouse.pressed = true; app.mouse.down = true; app.mouse.button = R() < 0.1 ? 2 : 0;
  step();
  if (R() < 0.15) step(); // hold a frame
  app.mouse.released = true; app.mouse.down = false;
  step();
}
function doDrag(R) {
  const [x, y] = target(R), [x2, y2] = target(R);
  log(`drag ${x | 0},${y | 0} -> ${x2 | 0},${y2 | 0}`);
  app.mouse.x = x; app.mouse.y = y; app.mouse.pressed = true; app.mouse.down = true; step();
  const n = 2 + Math.floor(R() * 6);
  for (let i = 1; i <= n; i++) { app.mouse.x = x + (x2 - x) * i / n; app.mouse.y = y + (y2 - y) * i / n; step(); }
  app.mouse.released = true; app.mouse.down = false; step();
}
function doWheel(R) { const [x, y] = target(R); log('wheel'); app.mouse.x = x; app.mouse.y = y; app.mouse.wheel += (R() < 0.5 ? -1 : 1) * (30 + R() * 300); step(); }
function doHover(R) { const [x, y] = target(R); app.mouse.x = x; app.mouse.y = y; step(); }
function doSettings(R) {
  const s = app.shared.meta.settings;
  const k = ['reducedMotion', 'screenShake', 'colorblind', 'muted'][Math.floor(R() * 4)];
  s[k] = !s[k]; if (R() < 0.5) s.textSize = s.textSize === 'large' ? 'normal' : 'large';
  log(`settings ${k}=${s[k]} text=${s.textSize}`);
  step();
}
function doResize(R) {
  const [w, h] = SIZES[Math.floor(R() * SIZES.length)];
  log(`resize ${w}x${h}`);
  window.innerWidth = w; window.innerHeight = h; window.devicePixelRatio = R() < 0.5 ? 1 : 3;
  app.resize(); step();
}
function doSaveReload(R) {
  const run = app.shared.run; if (!run) return;
  if (run.phase === 'graft' && !run.pending) return; // mid attach animation: the game only saves on route()
  log('save/reload ' + run.phase);
  if (run.phase === 'dead' || run.phase === 'won') { saveRun(run); assert.equal(loadRun(), null, 'ended run must not be saved'); return; }
  saveRun(run);
  const copy = loadRun();
  if (!copy) fail('saved run failed to load');
  if (RUN.serializeRun(copy) !== RUN.serializeRun(run)) fail('save round trip changed the run');
  if (R() < 0.7) { if (!flow.resume()) fail('flow.resume returned false with a save present'); step(); }
}
function doCheat(R) {
  const run = app.shared.run; if (!run || run.phase === 'dead' || run.phase === 'won') return;
  const w = R();
  if (w < 0.5) run.gold += 400; else if (w < 0.7) run.hp = Math.max(1, Math.floor(run.hp / 2)); else if (w < 0.85 && run.phase !== 'combat') run.budgetBonus += 2; else if (run.phase !== 'combat') RUN.addRelic(run, null) || 0;
  log('cheat ' + w.toFixed(2));
}
function doAbandon() { log('abandon'); flow.abandon(); step(); }
function botFight() {
  const run = app.shared.run;
  log('bot fight');
  const { res } = fight(run, POLICIES.careful);
  RUN.resolveFight(run, res); flow.route(); step();
}

function playOne(hero, idx) {
  const id = `${hero}:${idx}`;
  const R = mulberry(hashStr(id));
  ctxInfo = { id, tick: 0, log: [] };
  window.innerWidth = 1280; window.innerHeight = 720; window.devicePixelRatio = 1; app.resize();
  globalThis.localStorage.clear();
  app.shared.meta.settings.reducedMotion = false; app.shared.meta.settings.textSize = 'normal';
  const asc = idx % 3 === 2 ? 5 + (idx % 6) : 0;
  flow.start({ hero, seed: 'monkey-' + id, ascension: asc });
  stuckKey = ''; stuckN = 0; combatTicks = 0;
  const phasesSeen = new Set();
  let titleTicks = 0;
  const abandonAt = R() < 0.35 ? Math.floor(R() * MAX_TICKS) : -1;
  let uiStarts = 0;
  while (ctxInfo.tick < MAX_TICKS) {
    if (ctxInfo.tick >= abandonAt && abandonAt >= 0 && app.shared.run && app.shared.run.phase !== 'dead' && app.shared.run.phase !== 'won' && R() < 0.01) doAbandon();
    const r = R();
    const run = app.shared.run;
    if (run) phasesSeen.add(run.phase);
    if (app.current === 'title' && !(run && run.phase === 'map' && false)) {
      titleTicks++;
      if (titleTicks > 400) { titleTicks = 0; flow.start({ hero, seed: `monkey-${id}-${ctxInfo.tick}` }); uiStarts--; }
    } else titleTicks = 0;
    if (combatTicks > 1500) { botFight(); combatTicks = 0; continue; }
    if (r < 0.40) doClick(R);
    else if (r < 0.55) doKey(R);
    else if (r < 0.63) doDrag(R);
    else if (r < 0.69) doWheel(R);
    else if (r < 0.77) doHover(R);
    else if (r < 0.785) doSettings(R);
    else if (r < 0.795) doResize(R);
    else if (r < 0.805) doSaveReload(R);
    else if (r < 0.815) doCheat(R);
    else if (r < 0.8155) doAbandon();
    else step();
    if (app.current === 'title' && run && ctxInfo.tick > 0 && titleTicks === 1) uiStarts++;
  }
  return phasesSeen;
}

const heroes = ['marrow', 'wick', 'odile'];
const jobs = ONE ? [[ONE.split(':')[0], Number(ONE.split(':')[1])]] : heroes.flatMap((h) => Array.from({ length: RUNS }, (_, i) => [h, i]));
const t0 = Date.now();
const seenAll = new Set();
let ticks = 0;
for (const [hero, idx] of jobs) {
  try {
    const ph = playOne(hero, idx);
    for (const p of ph) seenAll.add(p);
    ticks += ctxInfo.tick;
  } catch (err) {
    console.log(`MONKEY FAILURE seed ${hero}:${idx} at tick ${ctxInfo.tick}: ${err.message}`);
    if (!(err instanceof Fail)) console.log(err.stack.split('\n').slice(0, 6).join('\n'));
    console.log('last actions:\n  ' + ctxInfo.log.join('\n  '));
    console.log(`repro: GW_MONKEY_SEED=${hero}:${idx} GW_MONKEY_TICKS=${MAX_TICKS} node tests/graftwork_monkey.test.mjs`);
    process.exit(1);
  }
}
for (const p of ['map', 'combat', 'reward', 'graft']) assert.ok(seenAll.has(p), `monkey never reached phase ${p}`);
console.log(`monkey: ${jobs.length} runs, ${ticks} ticks, phases seen: ${[...seenAll].join(',')}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const w of warnings) console.log('warn', w);
