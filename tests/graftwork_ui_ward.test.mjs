// THE WARD screen (ui/ward.js): enter with a ward run, build by drag, toggle power, end the morning, preview and confirm a walk
// through a fight into an event (the routes go to the combat, reward, graft and event screens and come back to the Ward, with the
// walk steps between two triggers played on the Ward), the reward's building plan pick, the Dispensary's plans and strike service,
// the title's mode switch, and a layout sweep (desktop and phone stage scales 0.64 / 0.54 / 0.46): registered widgets never overlap
// outside a group or overlay, stay on the stage and out of the Pause / Fullscreen corner, and text stays inside its widget.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as WD from '../graftwork/engine/ward.js';
import * as LAYOUT from '../graftwork/ui/layout_registry.js';
import { ENEMIES } from '../graftwork/data/index.js';
import { BUILD_CARDS } from '../graftwork/data/ward.js';
const wardMod = await import('../graftwork/ui/ward.js');
const ward = wardMod.default, { cellCenter, handRects, resetWardMem, wardInterlude, whyText, walkSummary } = wardMod;
const SCR = {};
for (const n of ['combat', 'reward', 'graft', 'shop', 'event', 'title']) SCR[n] = (await import(`../graftwork/ui/${n}.js`)).default;
const KIT = await import('../graftwork/ui/ward_kit.js');

let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const PHASE_SCREEN = { combat: 'combat', reward: 'reward', graft: 'graft', shop: 'shop', forge: 'base', event: 'event', ward: 'ward', dead: 'base', won: 'base' };
const ELITE1 = Object.values(ENEMIES).find((e) => e.act === 1 && e.kind === 'elite' && !e.summonOnly).id;
const NORMAL1 = Object.values(ENEMIES).filter((e) => e.act === 1 && e.kind === 'normal' && !e.summonOnly && !e.minion).map((e) => e.id);
const win = () => ({ win: true, shattered: [], damageTaken: 0, turns: 3 });

async function setup(o = {}) {
  resetWardMem();
  const run = RUN.newRun({ hero: o.hero || 'marrow', seed: o.seed || 'uiw', mode: 'ward' });
  const meta = { settings: { reduceMotion: true, tips: false, textScale: 100 }, tips: {}, seen: { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} } };
  const app = await makeApp({ run, meta, audio: { sfx() {}, music() {} } });
  if (o.pscale) { app.scale = o.pscale; app.minPx = 11; }
  app.ctx.measureText = (s) => { const f = String(app.ctx.font || ''), m = /(\d+(?:\.\d+)?)px/.exec(f), size = m ? +m[1] : 16; return { width: String(s).length * size * (/bold/.test(f) ? 0.56 : 0.52) }; };
  app.register('ward', ward); for (const k of Object.keys(SCR)) app.register(k, SCR[k]); app.register('base', { draw() {} });
  const seen = [];
  const flow = {
    RUN, route() {
      const scr = PHASE_SCREEN[run.phase] || 'base';
      if (run.mode === 'ward' && scr !== 'ward' && wardInterlude(app, run, scr)) { seen.push('ward(walk)'); return; }
      seen.push(scr); app.go(scr, { run });
    },
    openDeck() {}, openSettings() {}, saveMeta() {}, hasSave: () => false, resume() {}, abandon() {}, toTitle() {}, start(opts) { flow.started = opts; },
  };
  app.shared.flow = flow;
  return { app, run, meta, flow, seen };
}
// wipe the floor and lay rooms by hand (the first is the Entrance); a Theatre is added at the far corner
function layout(run, spec) {
  const w = run.ward;
  w.grid = Array.from({ length: w.h }, () => Array(w.w).fill(null)); w.rooms = {}; w.nextRoom = 1;
  const ids = [];
  for (const [type, x, y, contents] of spec) { const id = 'r' + w.nextRoom++; w.rooms[id] = { id, type, x, y, on: true, level: 1, timers: { spawn: 3 }, contents: contents || [], upgrades: [] }; w.grid[y][x] = id; ids.push(id); }
  const th = 'r' + w.nextRoom++; w.rooms[th] = { id: th, type: 'rm_theatre', x: 8, y: 5, on: true, level: 1, timers: { spawn: 9 }, contents: [], upgrades: [] }; w.grid[5][8] = th;
  w.grid[0][5] = 'rubble';
  w.hero.room = ids[0]; WD.wardPower(run);
  return ids;
}
const give = (run, id) => { const c = { uid: 9000 + run.ward.cardNext++, id }; run.ward.deck.hand.push(c); return c.uid; };
function drag(app, x0, y0, x1, y1) {
  const m = app.mouse; m.x = x0; m.y = y0; m.pressed = true; m.down = true; app.tick(1 / 60);
  for (let i = 1; i <= 8; i++) { m.x = x0 + (x1 - x0) * i / 8; m.y = y0 + (y1 - y0) * i / 8; app.tick(1 / 60); }
  m.released = true; m.down = false; app.tick(1 / 60); frames(app, 2);
}
const reg = (id) => LAYOUT.getAll().find((r) => r.id === id);

await t('enter: a ward run opens the Ward screen with the floor, the clock and a hand of 5 plans', async () => {
  const { app, run, flow, seen } = await setup();
  assert.equal(run.phase, 'ward'); flow.route(); frames(app, 200);
  assert.equal(app.current, 'ward'); assert.deepEqual(seen, ['ward']);
  assert.equal(run.ward.deck.hand.length, 5);
  for (const id of ['ward-sheet', 'ward-clock', 'ward-res', 'ward-plans-box', 'ward-left', 'ward-right', 'ward-act', 'ward-card0']) assert.ok(reg(id), 'registered ' + id);
});

await t('morning: drag a room plan onto a legal cell builds it; an illegal drop explains why in plain words', async () => {
  const { app, run, flow } = await setup({ seed: 'drag' });
  const [ent] = layout(run, [['rm_entrance', 0, 2]]);
  run.ward.res.wood = 10; run.ward.res.stone = 10; run.ward.deck.hand = [];
  const uid = give(run, 'b_ward');
  flow.route(); frames(app, 200);
  const r = handRects(1)[0], bad = cellCenter(4, 4);
  drag(app, r.x + r.w / 2, r.y + 60, bad.x, bad.y);
  assert.equal(Object.keys(run.ward.rooms).length, 2, 'not built away from the rooms');
  assert.match(app.screens.ward.st.toast, /share a wall/);
  const good = cellCenter(1, 2);
  drag(app, r.x + r.w / 2, r.y + 60, good.x, good.y);
  const built = WD.roomAt(run, 1, 2);
  assert.ok(built && built.type === 'rm_ward', 'Ward built next to the Entrance');
  assert.ok(!run.ward.deck.hand.some((c) => c.uid === uid), 'the plan left the hand');
  assert.equal(run.ward.res.wood, 8); assert.equal(run.ward.res.stone, 9);
  void ent;
});

await t('morning: tap a room to switch its power, with the off-room warning; effect plans play from the Play button', async () => {
  const { app, run, flow } = await setup({ seed: 'pow' });
  const [, saw] = layout(run, [['rm_entrance', 0, 2], ['rm_sawmill', 1, 2]]);
  run.ward.deck.hand = []; give(run, 'b_triage'); run.ward.res.wood = 3; run.hp = 40;
  flow.route(); frames(app, 200);
  const c = cellCenter(1, 2); click(app, c.x, c.y); frames(app, 2);
  assert.equal(run.ward.rooms[saw].on, false, 'switched off');
  assert.match(app.screens.ward.st.toast, /costs 3 HP/);
  click(app, c.x, c.y); frames(app, 2);
  assert.equal(run.ward.rooms[saw].on, true, 'and on again');
  // select Triage (tap), then Play
  const r = handRects(1)[0]; click(app, r.x + r.w / 2, r.y + 80); frames(app, 3);
  assert.ok(app.screens.ward.st.sel !== null, 'selected');
  const pb = reg('ward-play'); assert.ok(pb, 'Play button shown');
  click(app, pb.x + pb.w / 2, pb.y + pb.h / 2); frames(app, 2);
  assert.equal(run.hp, 48, 'Triage healed 8');
});

await t('walk: End Morning, preview the thread, confirm, fight -> reward -> graft -> (walk on the Ward) -> event -> back to the Ward', async () => {
  const { app, run, flow, seen } = await setup({ seed: 'walk' });
  const [ent, wd, ch] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, [{ kind: 'monster', id: NORMAL1[0] }, { kind: 'monster', id: NORMAL1[1] }]], ['rm_chapel', 2, 2, [{ kind: 'event' }]]]);
  flow.route(); frames(app, 200);
  const eb = reg('ward-act'); click(app, eb.x + eb.w / 2, eb.y + eb.h / 2); frames(app, 3);
  assert.equal(run.ward.phase, 'midday', 'End Morning');
  run.ward.roll = { key: '1:midday', base: 3, sides: 4, bonus: 0, n: 3, lucky: 0 }; frames(app, 3);
  const wc = cellCenter(1, 2), cc = cellCenter(2, 2);
  click(app, cc.x, cc.y); frames(app, 3);
  assert.deepEqual(run.ward.route, [], 'a room that is not next to you is not a step'); assert.match(app.screens.ward.st.toast, /next to the last one/);
  click(app, wc.x, wc.y); frames(app, 3); click(app, cc.x, cc.y); frames(app, 3);
  assert.deepEqual(run.ward.route, [wd, ch], 'each click appends one step');
  const p = WD.routeInfo(run); assert.deepEqual(p.path, [wd, ch]); assert.equal(p.triggers.length, 2); assert.equal(p.left, 1);
  assert.equal(walkSummary(run, p, ch), '1 fight (2 monsters), 1 event, arrive at the Chapel');
  const go = reg('ward-act'); click(app, go.x + go.w / 2, go.y + 25); frames(app, 40);
  assert.equal(run.phase, 'combat'); assert.equal(app.current, 'combat');
  assert.equal(run.ward.hero.room, wd);
  frames(app, 20);
  RUN.resolveFight(run, win()); flow.route(); frames(app, 60);
  assert.equal(app.current, 'reward');
  assert.ok(run.pending.ward && run.pending.ward.count === 2, 'reward carries the ward salvage');
  key(app, 'Enter'); frames(app, 5);
  while (run.phase === 'graft') { RUN.skipGraft(run, 'gold'); RUN.afterGraft(run); flow.route(); frames(app, 2); }
  frames(app, 40); // the Ward shows the step from the Ward room to the Chapel, then opens the event
  assert.ok(seen.includes('ward(walk)'), 'interlude on the Ward: ' + seen.join(' '));
  assert.equal(app.current, 'event'); assert.equal(run.ward.hero.room, ch);
  const pe = run.pending; pe.result = 'Done.'; frames(app, 10); SCR.event.cont(app); frames(app, 40);
  assert.equal(app.current, 'ward'); assert.equal(run.phase, 'ward'); assert.equal(run.ward.phase, 'evening');
  assert.deepEqual(seen.filter((s) => s !== 'graft'), ['ward', 'combat', 'reward', 'ward(walk)', 'event', 'ward']);
  void ent;
});

await t('walk: wait here heals 3; far and unreachable rooms explain why; the last night only takes the Theatre', async () => {
  const { app, run, flow } = await setup({ seed: 'wait' });
  layout(run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2], ['rm_corridor', 2, 2], ['rm_corridor', 3, 2], ['rm_corridor', 4, 2], ['rm_corridor', 5, 2], ['rm_linen', 7, 0]]);
  run.ward.phase = 'midday'; run.hp = 50;
  flow.route(); frames(app, 200);
  run.ward.roll = { key: '1:midday', base: 1, sides: 4, bonus: 0, n: 1, lucky: 0 };
  assert.match(whyText(run, WD.routeWhy(run, WD.roomAt(run, 7, 0).id)), /next to the last one/);
  assert.ok(WD.extendRoute(run, WD.roomAt(run, 1, 2).id).ok);
  assert.equal(WD.routeWhy(run, WD.roomAt(run, 2, 2).id), 'full'); assert.match(whyText(run, 'full'), /roll is spent/);
  WD.clearRoute(run);
  const A = reg('ward-act');
  click(app, A.x + A.w / 2, A.y + 108 + 23); frames(app, 30);
  assert.equal(run.hp, 50 + WD.WARD_TUNE.waitHeal); assert.equal(run.ward.phase, 'evening');
  run.ward.day = run.ward.dayLimit; run.ward.phase = 'night'; frames(app, 30);
  assert.equal(WD.pathTo(run, WD.roomAt(run, 1, 2).id).why, 'boss');
  assert.equal(whyText(run, 'boss'), 'The last night: only the Theatre.');
  click(app, A.x + A.w / 2, A.y + 48 + 25); frames(app, 40);
  assert.equal(run.phase, 'combat'); assert.equal(run.pending.fightKind, 'boss');
});

await t('reward: an elite offers a building plan (pick 1 of 3) and its salvage; the boss relic choice still works', async () => {
  const { app, run, flow } = await setup({ seed: 'rw' });
  const [, iso] = layout(run, [['rm_entrance', 0, 2], ['rm_isolation', 1, 2]]);
  run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'elite', enemies: [ELITE1], reinforce: [], mods: { enemyStr: 2, goldMul: 1.25 }, ward: { room: iso, count: 1, elite: true, level: 2, night: true } };
  RUN.resolveFight(run, win()); flow.route(); frames(app, 80);
  const rw = run.pending;
  assert.ok(Array.isArray(rw.buildChoice) && rw.buildChoice.length === 3, 'three plans');
  assert.ok(rw.relicChoices && rw.relicChoices.length >= 2, 'night Level 2 elite: relic choice');
  const before = WD.buildDeckList(run).length, pick = rw.buildChoice[1];
  const r = reg('reward-build1'); assert.ok(r, 'plan card registered');
  click(app, r.x + r.w / 2, r.y + r.h / 2); frames(app, 5);
  assert.equal(WD.buildDeckList(run).length, before + 1); assert.ok(WD.buildDeckList(run).some((c) => c.id === pick));
  assert.equal(app.screens.reward.st.build, pick);
});

await t('shop: the Dispensary sells building plans and strikes one', async () => {
  const { app, run, flow } = await setup({ seed: 'shop' });
  run.gold = 500; run.phase = 'shop'; run.pending = RUN.makeShop(run);
  assert.ok(run.pending.builds && run.pending.builds.length, 'plans on sale');
  flow.route(); frames(app, 60);
  const sp = reg('shop-plans'); assert.ok(sp, 'Building plans service');
  click(app, sp.x + sp.w / 2, sp.y + sp.h / 2); frames(app, 3);
  const b0 = reg('shop-build0'); assert.ok(b0, 'counter open');
  const n0 = WD.buildDeckList(run).length, g0 = run.gold, price = run.pending.builds[0].price;
  click(app, b0.x + b0.w / 2, b0.y + 100); frames(app, 3);
  assert.equal(WD.buildDeckList(run).length, n0 + 1); assert.equal(run.gold, g0 - price); assert.ok(run.pending.builds[0].sold);
  const st = app.screens.shop; void st;
  // strike a plan
  key(app, 'Escape'); frames(app, 2);
  click(app, sp.x + sp.w / 2, sp.y + sp.h / 2); frames(app, 3);
  click(app, 120 + 40 + 130, 80 + 560 - 62 + 24); frames(app, 3); // Strike a plan
  const sc = LAYOUT.getAll().find((r) => r.id === 'scroll-dispensary'); assert.ok(sc, 'strike grid open');
  click(app, sc.x + 80, sc.y + 80); frames(app, 3);
  assert.equal(WD.buildDeckList(run).length, n0); assert.ok(run.pending.buildRemoved);
});

await t('title: the mode switch stores meta.settings.mode and Begin passes {mode}', async () => {
  const { app, flow } = await setup({ seed: 'ttl' });
  const META = await import('../graftwork/engine/meta.js');
  const meta = META.migrate(null); meta.settings.tips = false; meta.settings.reducedMotion = true; app.shared.meta = meta;
  app.go('title'); frames(app, 5); app.screens.title.openSelect(app, 'marrow'); frames(app, 30);
  const sw = reg('title-mode'); assert.ok(sw, 'switch registered');
  click(app, sw.x + sw.w * 0.75, sw.y + sw.h / 2); frames(app, 2);
  click(app, sw.x + sw.w * 0.25, sw.y + sw.h / 2); frames(app, 2);
  assert.equal(meta.settings.mode, 'classic');
  click(app, sw.x + sw.w * 0.75, sw.y + sw.h / 2); frames(app, 2);
  assert.equal(KIT.modeOf(meta), 'ward');
  key(app, 'Enter'); frames(app, 2);
  assert.ok(flow.started, 'Begin pressed'); assert.equal(flow.started.mode, 'ward');
  meta.settings.mode = 'classic'; app.screens.title.openSelect(app, 'marrow'); frames(app, 5); flow.started = null; key(app, 'Enter'); frames(app, 2);
  assert.ok(flow.started && !flow.started.mode, 'classic runs carry no mode');
});

// ---------------- layout sweep ----------------
const RESERVED = { x: 1128, y: 0, w: 144, h: 56 };
const hit = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
const inside = (r, x, y) => x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5;
const problems = [];
function watchTexts(app) {
  const texts = [], raw = app.text;
  app.text = (str, x, y, o = {}) => {
    if (!app._tipDraw && str !== '' && str !== undefined && str !== null && o.alpha !== 0 && app.current === 'ward' && app.stack.length === 1) {
      const L = app.layoutText(String(str), o), al = o.align || 'left', bl = o.baseline || 'top';
      const x0 = al === 'center' ? x - L.w / 2 : al === 'right' ? x - L.w : x, y0 = bl === 'middle' ? y - L.size / 2 : y;
      texts.push({ s: String(L.lines[0]).slice(0, 36), x: x0, y: y0, w: L.w, h: L.h, n: LAYOUT.getAll().length, trunc: L.trunc && !L.soft });
    }
    return raw(str, x, y, o);
  };
  return texts;
}
function analyse(app, texts, tag) {
  const add = (k, m) => { const s = `${tag}|${k}|${m}`; if (!problems.includes(s)) problems.push(s); };
  for (const o of LAYOUT.findOverlaps()) add('overlap', `${o.a} x ${o.b}`);
  for (const id of LAYOUT.findOutOfBounds()) add('oob', id);
  const regs = LAYOUT.getAll();
  for (const r of regs) if (r.layer === 'hud' && !r.overlay && hit(r, RESERVED)) add('reserved', r.id);
  const sheet = regs.find((r) => r.id === 'ward-sheet');
  for (const t of texts) {
    if (t.x < -1 || t.y < -1 || t.x + t.w > 1281 || t.y + t.h > 721) add('text-oob', t.s);
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    const cont = regs.filter((r, i) => r.layer !== 'world' && inside(r, cx, cy) && (!r.overlay || i < t.n)).sort((a, b) => a.w * a.h - b.w * b.h);
    const own = cont.find((r) => r.overlay) || cont[0];
    if (!own) { if (sheet && inside(sheet, cx, cy)) continue; add('text-orphan', `${t.s} @${Math.round(t.x)},${Math.round(t.y)}`); continue; }
    if (t.x < own.x - 2 || t.y < own.y - 2 || t.x + t.w > own.x + own.w + 2 || t.y + t.h > own.y + own.h + 2) add('text-overflow', `"${t.s}" ${Math.round(t.w)}x${Math.round(t.h)} in ${own.id}`);
    if (t.trunc && !/^ward-card|^ward-strip/.test(own.id)) add('text-truncated', t.s);
  }
}
async function sweep(pscale) {
  const T = pscale ? 'p' + pscale : 'desk';
  const { app, run, flow } = await setup({ seed: 'lay' + T, pscale });
  const texts = watchTexts(app);
  const look = (tag, nf = 3) => { frames(app, nf - 1); texts.length = 0; app.afterFrame = () => { analyse(app, texts, `${T}/${tag}`); app.afterFrame = null; }; frames(app, 1); };
  run.relics = Object.keys((await import('../graftwork/data/index.js')).RELICS).slice(0, 9); run.gold = 999; run.ward.res.wood = 99; run.ward.res.stone = 99;
  for (let i = 0; i < 40; i++) run.ward.log.push(`D1 morning: A long log line number ${i} about the Isolation elite turning Level 2 at night.`);
  flow.route(); look('banner', 30); frames(app, 200); look('morning');
  const rr = handRects(run.ward.deck.hand.length);
  for (let i = 0; i < rr.length; i++) { app.mouse.x = rr[i].x + 30; app.mouse.y = rr[i].y + 60; look('hover' + i, 3); }
  app.mouse.x = -999; app.screens.ward.st.sel = run.ward.deck.hand[0].uid; app.mouse.x = 640; app.mouse.y = 300; look('selected', 3);
  app.screens.ward.st.sel = null; app.screens.ward.st.plans = true; look('plans', 3); app.screens.ward.st.plans = false;
  // every room type on the floor, one dark, elites, a full ward
  const types = ['rm_ward', 'rm_isolation', 'rm_chapel', 'rm_dispensary', 'rm_workshop', 'rm_sawmill', 'rm_quarry', 'rm_counting', 'rm_generator', 'rm_linen', 'rm_corridor'];
  const spec = [['rm_entrance', 0, 2]]; types.forEach((ty, i) => spec.push([ty, 1 + (i % 6), 1 + Math.floor(i / 6) * 2]));
  const ids = layout(run, spec);
  for (const id of ids) { const r = run.ward.rooms[id], s = ROOMS_SPAWN(r.type); if (s === 'fight') r.contents = [0, 1, 2, 3, 4].map(() => ({ kind: 'monster', id: NORMAL1[0] })); else if (s === 'elite') r.contents = [{ kind: 'elite', id: ELITE1, age: 3, level: 2 }]; else if (s) r.contents = [{ kind: s }]; }
  run.ward.rooms[ids[3]].on = false; run.ward.rooms[ids[1]].upgrades = ['b_iron_doors', 'b_night_shift'];
  look('rooms', 3);
  for (const id of ids.slice(0, 6)) { const c = cellCenter(run.ward.rooms[id].x, run.ward.rooms[id].y); app.mouse.x = c.x; app.mouse.y = c.y; look('roomhover', 3); }
  for (const ph of ['midday', 'evening', 'night']) {
    run.ward.phase = ph; app.mouse.x = -999; look(ph + '/idle', 30);
    for (const id of ids.slice(1, 5)) { const c = cellCenter(run.ward.rooms[id].x, run.ward.rooms[id].y); app.mouse.x = c.x; app.mouse.y = c.y; look(ph + '/preview', 3); }
  }
  run.ward.day = run.ward.dayLimit; run.ward.phase = 'night'; app.mouse.x = -999; look('lastnight', 30);
  const th = WD.theatreOf(run), tc = cellCenter(th.x, th.y); app.mouse.x = tc.x; app.mouse.y = tc.y; look('lastnight/theatre', 3);
  run.ward.day = run.ward.dayLimit - 1; run.ward.phase = 'midday'; look('earlyboss', 3);
  app.screens.ward.st.toast = 'Lights out in the Counting House: its timer pauses, what is inside sleeps, and walking through costs 3 HP.'; app.screens.ward.st.toastT = 2; look('toast', 2);
}
const SPAWN = (await import('../graftwork/data/ward.js')).ROOMS;
function ROOMS_SPAWN(type) { const s = SPAWN[type].spawn; return s ? s.kind : null; }
for (const ps of [0, 0.64, 0.54, 0.46]) await t('layout sweep ' + (ps ? 'phone ' + ps : 'desktop'), async () => {
  const before = problems.length;
  await sweep(ps);
  const mine = problems.slice(before);
  if (mine.length) console.log(mine.map((p) => '  ' + p).join('\n'));
  assert.equal(mine.length, 0, 'layout problems');
});

await t('z4: re-entering the Ward after a fight drops stale build stamps (rooms built in the morning stayed invisible until the old clock caught up)', async () => {
  const { app, run, flow } = await setup({ seed: 'z4stamp' });
  layout(run, [['rm_entrance', 0, 2]]);
  run.ward.res.wood = 10; run.ward.res.stone = 10; run.ward.deck.hand = [];
  give(run, 'b_ward');
  flow.route(); frames(app, 600); // a long morning: the screen clock runs far past 0
  const r = handRects(1)[0], good = cellCenter(1, 2);
  drag(app, r.x + r.w / 2, r.y + 60, good.x, good.y);
  const id = WD.roomAt(run, 1, 2).id;
  assert.ok(wardMod.wardMem.stamps[id] > 5, 'the build stamped the late screen clock');
  flow.route(); frames(app, 5); // back from a fight: a fresh screen state whose clock restarts at 0
  assert.equal(wardMod.wardMem.stamps[id], undefined, 'stale stamp cleared on enter');
});

await t('z4: touch plan drags are not scrolls on the Ward (app.touchPan off), so a plan dragged up from the hand can drop', async () => {
  const { app, run, flow } = await setup({ seed: 'z4touch' });
  layout(run, [['rm_entrance', 0, 2]]);
  flow.route(); frames(app, 30);
  assert.equal(app.touchPan, false, 'morning: finger drags drop plans');
  run.ward.phase = 'midday'; frames(app, 10); assert.equal(app.touchPan, false);
});

await t('z4: the title Continue line of a Ward run reads the day, not Floor 0', async () => {
  const mem = {}; globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  const { run } = await setup({ seed: 'z4title' });
  const { saveRun } = await import('../graftwork/engine/save.js'); saveRun(run);
  const info = SCR.title.readSave({});
  assert.ok(info && info.day === 1 && info.dayLimit === 6, JSON.stringify(info));
  delete globalThis.localStorage;
});

void BUILD_CARDS;
console.log(`${n} ward UI checks passed`);
