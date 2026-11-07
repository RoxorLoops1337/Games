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
for (const n of ['combat', 'reward', 'graft', 'shop', 'event', 'title', 'end']) SCR[n] = (await import(`../graftwork/ui/${n}.js`)).default;
const KIT = await import('../graftwork/ui/ward_kit.js');
const ISO = await import('../graftwork/ui/ward_iso.js');
const wide = (app) => { ISO.camZoomBy(0.4, 640, 306); frames(app, 3); }; // zoom out so far cells are on the panel (the camera frames the built rooms)

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
  flow.route(); frames(app, 200); wide(app);
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
  assert.equal(run.ward.phase, 'morning', 'plans you could still play: the first click only warns');
  click(app, eb.x + eb.w / 2, eb.y + eb.h / 2); frames(app, 3);
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

// the first-time tutorial tips (tips ON, nothing seen yet) are part of the sweep: the bubble and its text stay on the stage, inside the left panel,
// at every phone scale and text size, for every Ward tip, with the hero at the left edge (the Entrance is column 0)
const TIP_KEYS = { morning: ['ward_build', 'ward_power', 'ward_timers'], midday: ['ward_walk', 'ward_phases'] };
for (const ps of [0, 0.64, 0.54, 0.46]) await t('layout sweep: tutorial tips ' + (ps ? 'phone ' + ps : 'desktop'), async () => {
  const bad = [];
  for (const ts of [100, 125, 150, 175]) for (const phase of ['morning', 'midday']) for (const key of TIP_KEYS[phase]) {
    const { app, run, flow, meta } = await setup({ seed: 'tipsweep', pscale: ps });
    run.relics = Object.keys((await import('../graftwork/data/index.js')).RELICS).slice(0, 9); for (let i = 0; i < 30; i++) run.ward.log.push(`D1 morning: A long log line number ${i} about the Isolation elite.`);
    meta.settings.tips = true; meta.settings.textScale = ts; app.textScale = ts / 100; meta.tips = {};
    for (const k of Object.values(TIP_KEYS).flat()) if (k !== key && TIP_KEYS[phase].indexOf(k) < TIP_KEYS[phase].indexOf(key)) meta.tips[k] = true; else if (!TIP_KEYS[phase].includes(k)) meta.tips[k] = true;
    if (phase === 'midday') { WD.endMorning(run); run.ward.hero.room = Object.values(run.ward.rooms).find((r) => r.type === 'rm_entrance').id; }
    const texts = watchTexts(app);
    flow.route(); frames(app, 230); texts.length = 0;
    app.afterFrame = () => { app.afterFrame = null; analyse(app, texts, `tips/${ps}/${ts}/${key}`); };
    frames(app, 1);
    const box = app._tipBox, tip = LAYOUT.getAll().find((r) => r.id === 'tutorial-tip');
    if (app._tipKey !== key || !box || !tip) { bad.push(`${ts}/${key}: tip not shown (${app._tipKey})`); continue; }
    if (box.x < 8 - 0.5 || box.y < 8 - 0.5 || box.x + box.w > 1272.5 || box.y + box.h > 712.5) bad.push(`${ts}/${key}: bubble off the stage ${JSON.stringify(box)}`);
    if (box.x + box.w > 12 + 260 + 0.5) bad.push(`${ts}/${key}: bubble leaves the left panel ${JSON.stringify(box)}`);
  }
  const mine = problems.filter((p) => p.startsWith('tips/' + ps + '/'));
  if (mine.length) console.log(mine.map((p) => '  ' + p).join('\n'));
  assert.deepEqual(bad.concat(mine), [], 'tutorial tip layout problems');
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
  assert.ok(info && info.day === 1 && info.dayLimit === 8, JSON.stringify(info));
  delete globalThis.localStorage;
});

void BUILD_CARDS;
// ---------------- Z5: the open UX findings of WARD_PLAYTEST.md ----------------
await t('z5: End Morning warns once before it throws away plans you could still play (and not at all when nothing is playable)', async () => {
  const { app, run, flow } = await setup({ seed: 'z5end' });
  layout(run, [['rm_entrance', 0, 2]]);
  run.ward.res.wood = 5; run.ward.res.stone = 5; run.ward.deck.hand = []; give(run, 'b_ward'); give(run, 'b_corridor');
  flow.route(); frames(app, 200);
  const A = reg('ward-act'), at = () => click(app, A.x + A.w / 2, A.y + A.h / 2);
  at(); frames(app, 3);
  assert.equal(run.ward.phase, 'morning', 'the first click only warns'); assert.match(app.screens.ward.st.toast, /2 plans you can still play will be discarded/);
  assert.equal(run.ward.deck.hand.length, 2, 'nothing was thrown away');
  at(); frames(app, 3);
  assert.equal(run.ward.phase, 'midday', 'the second click ends the morning');
  const b = await setup({ seed: 'z5end2' });
  layout(b.run, [['rm_entrance', 0, 2]]); b.run.ward.res.wood = 0; b.run.ward.res.stone = 0; b.run.gold = 0; b.run.ward.deck.hand = []; give(b.run, 'b_ward');
  b.flow.route(); frames(b.app, 200);
  const B = reg('ward-act'); click(b.app, B.x + B.w / 2, B.y + B.h / 2); frames(b.app, 3);
  assert.equal(b.run.ward.phase, 'midday', 'only plans you cannot afford: no warning');
});

await t('z5: a room that would be built dark is not paid for on the first drop; the second identical drop builds it', async () => {
  const { app, run, flow } = await setup({ seed: 'z5dark' });
  layout(run, [['rm_entrance', 0, 2], ['rm_sawmill', 1, 2]]);
  run.ward.power.base = 1; WD.wardPower(run);
  run.ward.res.wood = 10; run.ward.res.stone = 10; run.ward.deck.hand = []; give(run, 'b_ward');
  assert.equal(KIT.wouldBuildDark(run, BUILD_CARDS.b_ward), true); assert.equal(KIT.wouldBuildDark(run, BUILD_CARDS.b_corridor), false);
  flow.route(); frames(app, 200);
  const r = handRects(1)[0], good = cellCenter(0, 3);
  drag(app, r.x + r.w / 2, r.y + 60, good.x, good.y);
  assert.equal(WD.roomAt(run, 0, 3), null, 'not built yet'); assert.equal(run.ward.res.wood, 10, 'nothing paid');
  assert.match(app.screens.ward.st.toast, /would be built dark/);
  drag(app, r.x + r.w / 2, r.y + 60, good.x, good.y);
  const built = WD.roomAt(run, 0, 3); assert.ok(built && built.on === false, 'confirmed: built dark'); assert.equal(run.ward.res.wood, 8);
  // with spare power there is no warning
  const c = await setup({ seed: 'z5dark2' }); layout(c.run, [['rm_entrance', 0, 2]]); c.run.ward.res.wood = 10; c.run.ward.res.stone = 10; c.run.ward.deck.hand = []; give(c.run, 'b_ward');
  c.flow.route(); frames(c.app, 200); drag(c.app, r.x + r.w / 2, r.y + 60, good.x, good.y);
  assert.ok(WD.roomAt(c.run, 0, 3) && WD.roomAt(c.run, 0, 3).on, 'one drop when power is free');
});

await t('z5: the reward header explains the gold ("1 monster pays 75%, midday +10%") instead of "Gold x0.83"', async () => {
  assert.equal(KIT.goldNote({ count: 1, goldMul: 0.825 }, 'midday', 'normal'), 'Gold: 1 monster pays 75%, midday +10%.');
  assert.equal(KIT.goldNote({ count: 2, goldMul: 1.25 }, 'night', 'normal'), 'Gold: night +25%.');
  assert.equal(KIT.goldNote({ count: 4, goldMul: 1.6 * 1.0 }, 'evening', 'normal'), 'Gold: 4 monsters pay 160%.');
  assert.equal(KIT.goldNote({ count: 1, goldMul: 1.25 }, 'night', 'elite'), 'Gold: night +25%.');
  assert.equal(KIT.goldNote({ count: 2, goldMul: 1 }, 'evening', 'normal'), '');
  const { app, run, flow } = await setup({ seed: 'z5gold' });
  const [, wd] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, [{ kind: 'monster', id: NORMAL1[0] }]]]);
  run.ward.phase = 'midday'; flow.route(); frames(app, 100);
  WD.startWalk(run, wd); assert.equal(run.phase, 'combat'); RUN.resolveFight(run, win()); flow.route(); frames(app, 60);
  const texts = []; const tx = app.text.bind(app); app.text = (str, ...a) => { texts.push(String(str)); return tx(str, ...a); }; frames(app, 5);
  assert.ok(texts.some((x) => /1 monster pays 75%, midday \+10%/.test(x)), 'header: ' + texts.filter((x) => /Gold|Spoils|Salvage/.test(x)).join(' | '));
  assert.ok(!texts.some((x) => /Gold x0/.test(x)));
});

await t('z5: an event from the Chapel says which room and hour it came from', async () => {
  assert.deepEqual(KIT.eventSource({ phase: 'night' }), { head: 'CHAPEL EVENT, NIGHT', lean: 'leans strange and risky' });
  assert.equal(KIT.eventSource({}), null);
  const { app, run, flow } = await setup({ seed: 'z5ev' });
  const [, ch] = layout(run, [['rm_entrance', 0, 2], ['rm_chapel', 1, 2, [{ kind: 'event' }]]]);
  run.ward.phase = 'midday'; flow.route(); frames(app, 100);
  WD.startWalk(run, ch); assert.equal(run.phase, 'event'); assert.equal(run.pending.phase, 'midday'); flow.route();
  const texts = []; const tx = app.text.bind(app); app.text = (str, ...a) => { texts.push(String(str)); return tx(str, ...a); }; frames(app, 30);
  assert.ok(texts.some((x) => /CHAPEL EVENT, MIDDAY/.test(x)), texts.slice(0, 6).join(' | '));
});

await t('z5: Rest of day waits out every walk left today and stops in the morning; a room hover is one tooltip that leaves TODAY alone', async () => {
  const { app, run, flow } = await setup({ seed: 'z5rest' });
  layout(run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2]]);
  run.hp = 30; run.ward.deck.hand = []; flow.route(); frames(app, 200);
  const A = reg('ward-act'); click(app, A.x + A.w / 2, A.y + A.h / 2); frames(app, 3);
  assert.equal(run.ward.phase, 'midday');
  const c = cellCenter(1, 2); app.mouse.x = c.x; app.mouse.y = c.y; frames(app, 4);
  const card = reg('ward-roomcard'); assert.ok(card, 'the room card is shown beside the hovered room');
  assert.ok(card.x >= 284 && card.x + card.w <= 996 && card.y >= 64 && card.y + card.h <= 548, 'inside the map panel, never over the side panels (TODAY stays clear)');
  app.mouse.x = 5; app.mouse.y = 5; frames(app, 2);
  const rest = reg('ward-act'), bx = rest.x + rest.w - 50, by = rest.y + 108 + 23; click(app, bx, by); frames(app, 600);
  assert.equal(run.ward.phase, 'morning'); assert.equal(run.ward.day, 2, 'midday, evening and night were waited out');
  assert.equal(run.hp, 30 + 3 * WD.WARD_TUNE.waitHeal);
});

await t('z11: the room hover card is hidden while a toast shows, so the two never overlap', async () => {
  const { app, run, flow } = await setup({ seed: 'z11toast' });
  layout(run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2]]);
  run.ward.deck.hand = []; flow.route(); frames(app, 200);
  const c = cellCenter(1, 2); app.mouse.x = c.x; app.mouse.y = c.y; frames(app, 4);
  assert.ok(reg('ward-roomcard'), 'arrange: the card shows on a plain hover');
  app.screens.ward.toast('Each step must be a room next to the last one (shared wall).'); frames(app, 2);
  assert.equal(reg('ward-roomcard'), undefined, 'a toast owns the map: no room card under it');
  frames(app, 200);
  assert.ok(reg('ward-roomcard'), 'the card returns once the toast is gone');
});

await t('z5: a route through two fight rooms plays both, the token walks the steps between, and the die is there again afterwards', async () => {
  const { app, run, flow, seen } = await setup({ seed: 'z5multi' });
  const m = () => [{ kind: 'monster', id: NORMAL1[0] }];
  const [ent, w1, c1, w2, w3] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, m()], ['rm_corridor', 2, 2], ['rm_ward', 3, 2, m()], ['rm_ward', 4, 2, m()]]);
  run.ward.phase = 'midday'; flow.route(); frames(app, 200);
  run.ward.roll = { key: '1:midday', base: 4, sides: 4, bonus: 0, n: 4, lucky: 0 };
  for (const id of [w1, c1, w2, w3]) { const r = run.ward.rooms[id], c = cellCenter(r.x, r.y); click(app, c.x, c.y); frames(app, 2); }
  assert.deepEqual(run.ward.route, [w1, c1, w2, w3]);
  const go = reg('ward-act'); click(app, go.x + go.w / 2, go.y + 25); frames(app, 40);
  const fought = [];
  for (let i = 0; i < 15 && run.phase !== 'ward'; i++) {
    if (run.phase === 'combat') { fought.push(run.ward.hero.room); RUN.resolveFight(run, win()); flow.route(); frames(app, 40); }
    else if (run.phase === 'reward') { RUN.claimGold(run, run.pending); if (run.pending.buildChoice) WD.takeBuildChoice(run, null); RUN.afterReward(run); flow.route(); frames(app, 40); }
    else if (run.phase === 'graft') { RUN.skipGraft(run, 'gold'); RUN.afterGraft(run); flow.route(); frames(app, 40); }
    else break;
  }
  frames(app, 120);
  assert.deepEqual(fought, [w1, w2, w3], 'every fight room opened in order'); assert.equal(app.current, 'ward');
  assert.equal(run.ward.hero.room, w3); assert.equal(run.ward.phase, 'evening');
  assert.ok(seen.filter((s) => s === 'ward(walk)').length >= 1, 'steps between triggers were shown on the Ward');
  const r = WD.rollOf(run); assert.ok(r && r.key === '1:evening', 'a fresh die for the evening'); assert.deepEqual(run.ward.route, []);
  assert.equal(app.screens.ward.st.run.ward.hero.room, w3); void ent;
});

await t('z5: the hero is always on a room (a hero pointing at a removed room goes back to the Entrance), and a stale build stamp never hides a room', async () => {
  const { app, run, flow } = await setup({ seed: 'z5hero' });
  const [ent] = layout(run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2]]);
  run.ward.hero.room = 'r99'; flow.route(); frames(app, 30);
  assert.equal(run.ward.hero.room, ent);
  assert.equal(wardMod.buildAge(500, 3), 1, 'a stamp from an earlier clock counts as done'); assert.ok(Math.abs(wardMod.buildAge(2, 2.2) - 0.5) < 1e-9); assert.equal(wardMod.buildAge(undefined, 1), 1);
});

await t('z5: a Generator relights the rooms that were built dark (newest first, while the power lasts)', async () => {
  const { app, run, flow } = await setup({ seed: 'z5gen' });
  layout(run, [['rm_entrance', 0, 2], ['rm_sawmill', 1, 2]]);
  run.ward.power.base = 1; WD.wardPower(run); run.ward.res.wood = 10; run.ward.res.stone = 10; run.ward.deck.hand = [];
  give(run, 'b_ward'); give(run, 'b_quarry'); give(run, 'b_generator');
  flow.route(); frames(app, 200);
  const build = (i, n, x, y) => { const r = handRects(n)[i], c = cellCenter(x, y); drag(app, r.x + r.w / 2, r.y + 60, c.x, c.y); };
  build(0, 3, 0, 3); build(0, 3, 0, 3); // the Ward, confirmed dark
  const ward1 = WD.roomAt(run, 0, 3); assert.equal(ward1.on, false);
  build(0, 2, 0, 1); build(0, 2, 0, 1); // the Quarry, dark too
  const quarry = WD.roomAt(run, 0, 1); assert.equal(quarry.on, false);
  build(0, 1, 1, 3); frames(app, 3); // the Generator adds 2 power: two dark rooms fit, the newest first
  assert.equal(quarry.on, true); assert.equal(ward1.on, true); assert.match(app.screens.ward.st.toast, /Power is back/);
});

await t('z5: a walk resumed after a reload (no step plan in memory) still walks the steps between triggers instead of jumping to the end', async () => {
  const { app, run, flow, seen } = await setup({ seed: 'z5resume' });
  const m = () => [{ kind: 'monster', id: NORMAL1[0] }];
  const [, w1, c1, w2] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, m()], ['rm_corridor', 2, 2], ['rm_ward', 3, 2, m()]]);
  run.ward.phase = 'midday'; flow.route(); frames(app, 200);
  run.ward.roll = { key: '1:midday', base: 3, sides: 4, bonus: 0, n: 3, lucky: 0 };
  for (const id of [w1, c1, w2]) { const r = run.ward.rooms[id], c = cellCenter(r.x, r.y); click(app, c.x, c.y); frames(app, 2); }
  const go = reg('ward-act'); click(app, go.x + go.w / 2, go.y + 25); frames(app, 40);
  assert.equal(run.phase, 'combat'); assert.equal(run.ward.hero.room, w1);
  resetWardMem(); // the page was reloaded and Continue was pressed: only the saved run is left
  RUN.resolveFight(run, win()); flow.route(); frames(app, 40);
  RUN.claimGold(run, run.pending); if (run.pending.buildChoice) WD.takeBuildChoice(run, null); RUN.afterReward(run); flow.route(); frames(app, 10);
  while (run.phase === 'graft') { RUN.skipGraft(run, 'gold'); RUN.afterGraft(run); flow.route(); frames(app, 10); }
  frames(app, 120);
  assert.ok(seen.includes('ward(walk)'), 'the token walked the corridor step: ' + seen.join(' '));
  assert.equal(run.phase, 'combat'); assert.equal(run.ward.hero.room, w2);
});

await t('item6: the Ward plays from the keyboard alone: 1 picks a plan, Tab walks the legal cells, Enter builds, Enter ends the morning, Tab and Enter plan a route, G goes, Backspace undoes, R rests the day', async () => {
  const { app, run, flow, seen } = await setup({ seed: 'kb1' });
  const m = () => [{ kind: 'monster', id: NORMAL1[0] }];
  const [ent, w1, c1] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, m()], ['rm_corridor', 2, 2]]);
  run.ward.res.wood = 10; run.ward.res.stone = 10; run.ward.deck.hand = []; give(run, 'b_corridor');
  flow.route(); frames(app, 220);
  const before = Object.keys(run.ward.rooms).length;
  key(app, '1'); assert.ok(app.screens.ward.st.sel !== null, '1 selects the plan');
  key(app, 'Tab'); const items = app.screens.ward.kbItems();
  assert.ok(items.length > 0 && app.screens.ward.st.kb === 0, 'Tab focuses the first legal cell of the plan');
  if (items.length > 1) { key(app, 'Tab'); assert.equal(app.screens.ward.st.kb, 1); app.pressedKeys.push({ key: 'Tab', shiftKey: true, preventDefault() {} }); app.tick(1 / 60); assert.equal(app.screens.ward.st.kb, 0, 'Shift+Tab goes back'); }
  key(app, 'Enter'); frames(app, 3);
  assert.equal(Object.keys(run.ward.rooms).length, before + 1, 'Enter built a room on the focused cell');
  // no plan selected and no focus: Enter ends the morning
  app.screens.ward.st.kb = -1; run.ward.deck.hand = []; key(app, 'Enter'); frames(app, 3);
  assert.equal(run.ward.phase, 'midday', 'Enter with nothing focused ends the morning');
  frames(app, 120); run.ward.roll = { key: '1:midday', base: 3, sides: 4, bonus: 0, n: 3, lucky: 0 }; frames(app, 30);
  const st = app.screens.ward.st; st.dieRolling = 0;
  key(app, 'Tab'); const legal = app.screens.ward.kbItems();
  assert.ok(legal.some((i) => i.rid === w1), 'the first step is among the focusable rooms');
  while (app.screens.ward.kbItems()[st.kb].rid !== w1) key(app, 'Tab');
  key(app, 'Enter'); assert.deepEqual(run.ward.route, [w1], 'Enter adds the focused room to the route');
  key(app, 'Backspace'); assert.deepEqual(run.ward.route, [], 'Backspace undoes the step');
  key(app, 'Tab'); while (app.screens.ward.kbItems()[st.kb].rid !== w1) key(app, 'Tab'); key(app, 'Enter');
  assert.deepEqual(run.ward.route, [w1]);
  key(app, 'g'); frames(app, 60);
  assert.equal(run.phase, 'combat', 'G walks the route into the fight'); assert.equal(run.ward.hero.room, w1);
  // R rests the rest of the day
  const r2 = (await setup({ seed: 'kb2' })); layout(r2.run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2]]); r2.run.ward.deck.hand = [];
  r2.flow.route(); frames(r2.app, 200); WD.endMorning(r2.run); frames(r2.app, 120); r2.app.screens.ward.st.dieRolling = 0;
  key(r2.app, 'r'); frames(r2.app, 400);
  assert.equal(r2.run.ward.phase, 'morning', 'R waits out every walk left today'); assert.equal(r2.run.ward.day, 2);
});

// ---- item 6: the screens nobody had walked yet ----
function endFlow(o) { // a flow whose dead / won phases open the real end screen (recorded like main.js does)
  return (async () => {
    const r = await setup(o), META = await import('../graftwork/engine/meta.js');
    const meta = META.migrate(null); meta.settings.reducedMotion = true; meta.settings.tips = false; r.app.shared.meta = meta;
    const route0 = r.flow.route;
    r.flow.route = () => {
      const run = r.run;
      if ((run.phase === 'dead' || run.phase === 'won') && !run.ended) { run.ended = true; run.endInfo = META.recordRunEnd(meta, run, run.phase === 'won' ? 'won' : 'dead'); }
      if (run.phase === 'dead' || run.phase === 'won') { r.seen.push('end'); r.app.go('end', { run }); return; }
      route0();
    };
    return r;
  })();
}
await t('item6: boss night, real clicks: Enter the Theatre pulls you in, the boss falls, the reward, the graft, and floor 2 opens in the morning', async () => {
  const { app, run, flow } = await endFlow({ seed: 'bossnight' });
  layout(run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2]]); run.ward.deck.hand = [];
  run.ward.day = run.ward.dayLimit; run.ward.phase = 'night'; WD.rollWalk(run);
  flow.route(); frames(app, 220);
  const go = reg('ward-act'); assert.ok(go);
  assert.ok(!reg('ward-die'), 'the forced night shows no die: there is no route to roll for');
  click(app, go.x + go.w / 2, go.y + 50); frames(app, 80);
  assert.equal(run.phase, 'combat'); assert.equal(run.pending.fightKind, 'boss'); assert.equal(run.pending.ward.early, false);
  RUN.resolveFight(run, win()); flow.route(); frames(app, 30);
  assert.equal(run.phase, 'reward'); assert.ok(run.pending.relicChoices && run.pending.relicChoices.length, 'boss relic pair');
  RUN.claimGold(run, run.pending); WD.takeBuildChoice(run, null); RUN.addRelic(run, run.pending.relicChoices[0]); RUN.afterReward(run); flow.route(); frames(app, 20);
  while (run.phase === 'graft') { RUN.skipGraft(run, 'gold'); RUN.afterGraft(run); flow.route(); frames(app, 10); }
  assert.equal(run.act, 2); assert.equal(run.ward.act, 2); assert.equal(run.ward.phase, 'morning'); assert.equal(run.ward.day, 1);
  frames(app, 200); assert.equal(app.current, 'ward');
  assert.ok(run.ward.rooms[run.ward.hero.room], 'the hero stands in a room of the new floor');
});

await t('item6: death in the Ward (a night fight lost) opens the end screen, which names the day, and draws', async () => {
  const { app, run, flow } = await endFlow({ seed: 'deathw' });
  const [, w1] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, [{ kind: 'monster', id: NORMAL1[0] }]]]);
  run.ward.deck.hand = []; run.ward.day = 3; run.ward.phase = 'night'; WD.rollWalk(run);
  flow.route(); frames(app, 200);
  WD.extendRoute(run, w1); WD.startRoute(run); assert.equal(run.phase, 'combat');
  RUN.resolveFight(run, { win: false, shattered: [], damageTaken: 50, turns: 4, killedBy: 'The Orderly' }); flow.route(); frames(app, 60);
  assert.equal(app.current, 'end'); assert.equal(run.phase, 'dead');
  const texts = []; const raw = app.text; app.text = (str, ...r) => { texts.push(String(str)); return raw(str, ...r); }; frames(app, 90);
  assert.ok(texts.some((x) => /day 3 of 8/.test(x)), 'the end line names the Ward day: ' + texts.filter((x) => /closed|ward/i.test(x)).join(' | '));
  assert.ok(!texts.some((x) => /floor \d+ of act/.test(x)), 'not the classic floor line');
});

await t('item6: win after the boss on floor 3: the Grafter fight follows, and winning it opens the victory end screen', async () => {
  const { app, run, flow } = await endFlow({ seed: 'win3' });
  RUN.startAct(run, 3); layout(run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2]]); run.ward.deck.hand = [];
  run.ward.day = run.ward.dayLimit; run.ward.phase = 'night'; WD.rollWalk(run);
  flow.route(); frames(app, 200);
  WD.startWalk(run, WD.theatreOf(run).id); assert.equal(run.pending.fightKind, 'boss');
  RUN.resolveFight(run, win()); flow.route(); frames(app, 20); assert.equal(run.phase, 'reward');
  RUN.claimGold(run, run.pending); WD.takeBuildChoice(run, null); RUN.afterReward(run); flow.route(); frames(app, 20);
  while (run.phase === 'graft') { RUN.skipGraft(run, 'gold'); RUN.afterGraft(run); flow.route(); frames(app, 10); }
  assert.equal(run.phase, 'combat'); assert.equal(run.pending.fightKind, 'final', 'after the floor 3 boss the Grafter fight starts at once');
  RUN.resolveFight(run, win()); flow.route(); frames(app, 120);
  assert.equal(run.phase, 'won'); assert.equal(app.current, 'end');
  const texts = []; const raw = app.text; app.text = (str, ...r) => { texts.push(String(str)); return raw(str, ...r); }; frames(app, 90);
  assert.ok(texts.some((x) => /THE GRAFTER IS UNMADE/.test(x)), 'victory title');
});

await t('item6: reduced motion: the die shows its result at once (no tumble, Go never waits on it); with motion it tumbles then settles on the roll', async () => {
  for (const reducedMotion of [true, false]) {
    const { app, run, meta, flow } = await setup({ seed: 'diert' });
    meta.settings.reducedMotion = reducedMotion; meta.settings.reduceMotion = reducedMotion;
    layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2]]); run.ward.deck.hand = [];
    flow.route(); frames(app, 200); WD.endMorning(run); const roll = WD.rollOf(run);
    frames(app, 3); const st = app.screens.ward.st;
    if (reducedMotion) { assert.equal(st.dieRolling || 0, 0, 'no tumble with reduced motion'); assert.ok(reg('ward-die'), 'the die is drawn at once'); }
    else { assert.ok(st.dieRolling > 0, 'the die tumbles'); frames(app, 80); assert.equal(st.dieRolling, 0, 'and settles'); assert.ok(reg('ward-die')); }
    const shown = []; const raw = app.text; app.text = (str, ...r) => { shown.push(String(str)); return raw(str, ...r); }; frames(app, 2);
    assert.ok(shown.includes(String(roll.n)), `the die face reads the roll ${roll.n}: ${shown.filter((x) => /^\d$/.test(x))}`);
  }
});

await t('item6: the Codex Rules tab teaches the Ward (build, the die and the route, the boss) and draws on the phone', async () => {
  const { CODEX_RULES } = await import('../graftwork/ui/codex.js');
  const all = CODEX_RULES.map((r) => r.join(' ')).join('\n');
  assert.ok(/Ward/.test(all) && /die/.test(all) && /boss/i.test(all) && /\bG\b/.test(all) && /\bR\b/.test(all), 'Ward rules named: ' + all.slice(-400));
  assert.ok(!/\u2014/.test(all), 'no em dashes');
  for (const ps of [0, 0.54]) {
    const { app } = await setup({ seed: 'codexw', pscale: ps });
    app.register('codex', (await import('../graftwork/ui/codex.js')).default);
    app.go('base'); app.push('codex', {}); app.top().setTab(6); frames(app, 30);
    const texts = []; const raw = app.text; app.text = (str, ...r) => { texts.push(String(str)); return raw(str, ...r); };
    app.top().rulesSt.target = 99999; frames(app, 90);
    assert.ok(texts.some((x) => /The Ward: build, then walk|Days, nights and the boss|The die and the route/.test(x)), 'the Ward rules are on the sheet (scrolled) at scale ' + ps);
  }
});

// ---------------- isometric view (ui/ward_iso.js, ui/assets.js) ----------------
const { assets, createAssets } = await import('../graftwork/ui/assets.js');

await t('iso: every cell centre picks its own cell, points off the plinth pick nothing, the wall above a back-row room picks that room', async () => {
  const { app, run, flow } = await setup({ seed: 'iso1' }); const w = run.ward; flow.route(); frames(app, 5); wide(app); ISO.camZoomBy(0.8, 640, 306); frames(app, 3);
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) { const c = ISO.cellC(w, x, y); if (!ISO.overMap(c.x, c.y)) continue; assert.deepEqual(ISO.pick(w, c.x, c.y), { x, y }, `cell ${x},${y}`); const ex = c.x + ISO.TW * 0.3 * ISO.CAM.z; if (ISO.overMap(ex, c.y)) assert.deepEqual(ISO.pick(w, ex, c.y), { x, y }, 'inside the diamond'); }
  assert.equal(ISO.pick(w, 20, 20), null); assert.equal(ISO.pick(w, 1270, 700), null);
  layout(run, [['rm_entrance', 0, 2], ['rm_ward', 4, 0]]);
  frames(app, 3); wide(app);
  const top = ISO.cellC(w, 4, 0), z = ISO.CAM.z;
  assert.deepEqual(ISO.pick(w, top.x, top.y - (ISO.TH / 2 + 12) * z), { x: 4, y: 0 }, 'the wall volume of a room on the back row');
  assert.equal(ISO.pick(w, top.x, top.y - 400), null);
  assert.equal(ISO.pick(w, 100, 300), null, 'outside the map panel nothing is picked');
  // the camera frames the built rooms large; pan and zoom are manual until Recenter
  ISO.camRecenter(); frames(app, 5);
  const big = ISO.CAM.z; assert.ok(big > 1.5, 'a small cluster is drawn large: zoom ' + big);
  const cw = ISO.cellW(w, 0, 2), sc0 = ISO.cellC(w, 0, 2); assert.ok(Math.abs(sc0.x - (ISO.MAPR.x + ISO.MAPR.w / 2 + (cw.x - ISO.CAM.x) * big)) < 1.5, 'toScreen matches the camera');
  ISO.camPanBy(40, 0); assert.ok(ISO.CAM.manual && ISO.cellC(w, 0, 2).x > sc0.x + 30, 'a pan moves the view'); ISO.camRecenter(); frames(app, 5); assert.ok(!ISO.CAM.manual);
});

await t('iso: a click at a room\'s iso position switches its power, a click on an empty cell does nothing (morning); rooms register a world hit box', async () => {
  const { app, run, flow } = await setup({ seed: 'iso2' });
  const [ent, qu] = layout(run, [['rm_entrance', 0, 2], ['rm_quarry', 1, 2]]);
  run.ward.deck.hand = []; flow.route(); frames(app, 200);
  assert.equal(run.ward.rooms[qu].on, true);
  const c = ISO.cellC(run.ward, 1, 2); click(app, c.x, c.y); frames(app, 2);
  assert.equal(run.ward.rooms[qu].on, false, 'the quarry went dark');
  assert.ok(reg('ward-room-' + qu) && reg('ward-room-' + qu).layer === 'world', 'iso hit box registered for the room');
  const e = ISO.cellC(run.ward, 6, 4); click(app, e.x, e.y); frames(app, 2);
  assert.equal(run.ward.rooms[qu].on, false);
  const box = ISO.roomBox(run.ward, 1, 2); assert.ok(box.w > 0 && box.h > ISO.TH, 'the room box covers the wall');
});

await t('iso: depth order is back to front (x + y), the hovered, selected and hero rooms come last', async () => {
  const { app, run, flow } = await setup({ seed: 'iso3' });
  const ids = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 2, 1], ['rm_chapel', 1, 3], ['rm_sawmill', 3, 3], ['rm_quarry', 6, 0], ['rm_linen', 0, 4]]);
  const w = run.ward, key = (id) => w.rooms[id].x + w.rooms[id].y;
  const plain = ISO.depthOrder(w, null).slice();
  for (let i = 1; i < plain.length; i++) assert.ok(key(plain[i]) >= key(plain[i - 1]), 'non-decreasing depth');
  assert.equal(plain.length, Object.keys(w.rooms).length);
  const foc = ISO.depthOrder(w, (id) => id === ids[0]).slice();
  assert.equal(foc[foc.length - 1], ids[0], 'the focus room is drawn last');
  assert.deepEqual(foc.slice(0, -1), plain.filter((id) => id !== ids[0]), 'everything else keeps its order');
  flow.route(); frames(app, 5);
});

await t('iso: monsters stand inside their room (one figure each, max 5), elites are larger and marked L2, a dark room is asleep', async () => {
  const { app, run, flow } = await setup({ seed: 'iso4' });
  const [ent, wd, iso, wd2] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2], ['rm_isolation', 2, 2], ['rm_ward', 3, 2]]);
  const mk = (n) => Array.from({ length: n }, () => ({ kind: 'monster', id: NORMAL1[0] }));
  run.ward.rooms[wd].contents = mk(7); run.ward.rooms[wd2].contents = mk(2); run.ward.rooms[iso].contents = [{ kind: 'elite', id: ELITE1, level: 2, age: 3 }];
  run.ward.deck.hand = []; flow.route(); frames(app, 200);
  const A = ISO.lastActors(), mons = A.filter((a) => a.kind === 'monster'), el = A.filter((a) => a.kind === 'elite'), hero = A.filter((a) => a.kind === 'hero');
  assert.equal(mons.length, 5 + 2, 'a full ward shows 5 figures (the cap) and the other ward 2'); assert.equal(el.length, 1); assert.equal(hero.length, 1);
  assert.equal(el[0].lvl, 2); assert.ok(el[0].h > mons[0].h, 'elites are larger');
  const room = (id) => { const r = run.ward.rooms[id], c = ISO.cellW(run.ward, r.x, r.y); return (a) => Math.abs(a.x - c.x) < ISO.TW / 2 && Math.abs(a.y - c.y) < ISO.TH / 2; };
  assert.equal(mons.filter(room(wd)).length, 5, 'they stand inside the floor diamond of their room');
  for (let i = 1; i < A.length; i++) assert.ok(A[i - 1].y <= A[i].y, 'actors are drawn sorted by screen y');
  run.ward.rooms[wd].on = false; frames(app, 3);
  assert.equal(ISO.lastActors().filter((a) => a.kind === 'monster').length, 2, 'a dark room is asleep: nobody shows');
});

await t('iso: the hero stands on its room and walks smoothly cell to cell (between the two centres, facing the way it goes, alternating frames)', async () => {
  const { app, run, flow } = await setup({ seed: 'iso5' });
  const [a, b] = layout(run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2]]);
  run.ward.deck.hand = []; flow.route(); frames(app, 200);
  const ca = ISO.cellW(run.ward, 0, 2), cb = ISO.cellW(run.ward, 1, 2), H0 = () => ISO.lastActors().find((x) => x.kind === 'hero');
  assert.ok(Math.abs(H0().x - ca.x) < 8 && Math.abs(H0().y - ca.y) < 10, 'standing on the entrance');
  const S = app.screens.ward.st; S.walk = { cells: [a, b], i: 0, stop: 1, t: 0.05, done: null, wait: false }; frames(app, 1);
  const h = H0(); assert.ok(h.x > ca.x + 3 && h.x < cb.x, 'between the two centres'); assert.equal(h.flip, 1, 'faces right-down'); assert.ok(h.moving);
  S.walk = null;
});

await t('assets loader: lazy, @1x on phones and @2x on desktop, null while loading, failures swallowed, headless is a no-op', async () => {
  const fake = createAssets({ fetchJson: async () => ({ version: 1, tile: { w: 2, h: 1 }, rooms: { rm_ward: { file1x: 'w1.webp', file2x: 'w2.webp', w: 100, h: 100, floorCx: 50, floorCy: 75, floorW: 96, floorH: 48 } }, actors: { marrow: { file1x: 'h1.webp', file2x: 'h2.webp', walk1x: 'hb1.webp', walk2x: 'hb2.webp', w: 40, h: 60, anchorX: 20, anchorY: 58, kind: 'hero' }, gone: { file1x: 'x.webp', w: 1, h: 1, kind: 'normal' } }, icons: {}, cards: {}, cardsById: { b_ward: { room: 'rm_ward' } } }), makeImage: () => ({}) });
  assert.equal(fake.room('rm_ward'), null, 'nothing before ensure'); assert.equal(fake.state, 'idle');
  const desk = { scale: 1, px: 2 }, phone = { scale: 0.6, px: 0.6 }; // @1x only when the backing store has under 0.8 device px per logical px (a DPR 2 phone has 1.2 and gets @2x)
  fake.ensure(desk); await new Promise((r) => setTimeout(r, 5)); assert.ok(fake.ready());
  assert.equal(fake.room('rm_ward', desk), null, 'requested, still loading');
  const e2 = fake.imgs.get('w2.webp'); assert.ok(e2, 'desktop asks for the @2x file'); assert.ok(!fake.imgs.has('w1.webp'));
  e2.img.onload(); const got = fake.room('rm_ward', desk); assert.ok(got && got.def.floorCx === 50);
  fake.room('rm_ward', phone); assert.ok(fake.imgs.has('w1.webp'), 'a stage under 0.8 device px per logical px asks for @1x'); assert.equal(fake.use2x({ scale: 0.6, px: 1.3 }), true, 'a DPR 2 phone asks for @2x');
  fake.imgs.get('w1.webp').img.onerror(); assert.ok(fake.room('rm_ward', phone), 'a missing @1x falls back to the loaded @2x');
  fake.actor('marrow', phone, true); assert.ok(fake.imgs.has('hb1.webp'), 'the walk frame is its own file');
  fake.actor('gone', phone); fake.imgs.get('x.webp').img.onerror(); assert.equal(fake.actor('gone', phone), null); assert.ok(fake.failed >= 1);
  assert.equal(fake.room('nope', desk), null); assert.equal(fake.actor('marrow', desk), null);
  assert.deepEqual(fake.kindIds('hero'), ['marrow']);
  fake.preload(desk); assert.ok(fake.imgs.has('h2.webp') && fake.imgs.has('hb2.webp'), 'preload queues the actors and their walk frames'); assert.equal(fake.progress().total, 3);
  assert.equal(fake.cardArt({ id: 'b_ward', kind: 'room', room: 'rm_ward' }, desk).kind, 'room', 'a card without its own art shows its room');
  const dead = createAssets({ fetchJson: async () => { throw new Error('404'); } }); dead.ensure(); await new Promise((r) => setTimeout(r, 5)); assert.equal(dead.state, 'none'); assert.equal(dead.room('rm_ward'), null);
  const headless = createAssets(); headless.ensure(); assert.equal(headless.state, 'none', 'no fetch / Image in node: a harmless no-op');
  assert.equal(assets.state === 'idle' || assets.state === 'none', true, 'the shared loader never started in headless tests');
});

await t('iso: with no art the rooms are procedural blocks; with a manifest the sprites are drawn aligned by floorCx / floorCy / floorW', async () => {
  const { app, run, flow } = await setup({ seed: 'iso6' });
  const [ent, cor, wd, qu] = layout(run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2], ['rm_ward', 2, 2], ['rm_quarry', 3, 2]]);
  run.ward.deck.hand = []; flow.route(); frames(app, 100);
  const calls = []; const dI = app.ctx.drawImage; app.ctx.drawImage = (...a) => { calls.push(a); };
  const img = { naturalWidth: 400, naturalHeight: 400, width: 400, height: 400 };
  const def = (f) => ({ file1x: f, file2x: f, w: 400, h: 400, floorCx: 200, floorCy: 300, floorW: 380, floorH: 190 });
  try {
    frames(app, 3); assert.equal(calls.filter((c) => c[0] === img).length, 0, 'no sprite without a manifest');
    assets.manifest = { version: 1, tile: { w: 2, h: 1 }, rooms: { rm_ward: def('a.webp'), rm_quarry: def('q.webp') }, actors: {}, icons: {}, cards: {}, cardsById: {} };
    assets.state = 'ready'; assets.imgs.set('a.webp', { ok: true, img }); assets.imgs.set('q.webp', { ok: true, img: { ...img } });
    run.ward.rooms[qu].on = false; frames(app, 3);
    const sp = calls.filter((c) => c[0] === img && c.length === 5), c1 = ISO.cellW(run.ward, 2, 2), s = ISO.TW / 380;
    assert.ok(sp.length >= 1, 'the ward sprite was drawn');
    const call = sp[sp.length - 1]; assert.ok(Math.abs(call[1] - (c1.x - 200 * s)) < 1 && Math.abs(call[2] - (c1.y - 300 * s)) < 1 && Math.abs(call[3] - 400 * s) < 1, 'aligned by the floor centre and scaled by the floor width');
    assert.ok(calls.filter((c) => c[0] === assets.imgs.get('q.webp').img).length === 0, 'the dark quarry is not drawn from the plain sprite');
  } finally { assets.reset(); app.ctx.drawImage = dI; }
  frames(app, 3);
});

await t('iso: reduced motion stops the wander and the bob; with motion the monsters drift', async () => {
  const run1 = async (reduce) => {
    const { app, run, flow, meta } = await setup({ seed: 'iso7' }); meta.settings.reduceMotion = reduce; meta.settings.reducedMotion = reduce;
    const [e, wd] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2]]);
    run.ward.rooms[wd].contents = [{ kind: 'monster', id: NORMAL1[0] }, { kind: 'monster', id: NORMAL1[0] }]; run.ward.deck.hand = [];
    flow.route(); frames(app, 200);
    const snap = () => JSON.stringify(ISO.lastActors().filter((a) => a.kind === 'monster').map((a) => [a.x, a.y, a.bob, a.sq]));
    const a = snap(); frames(app, 100); return a === snap();
  };
  assert.equal(await run1(true), true, 'reduced: frozen'); assert.equal(await run1(false), false, 'with motion: they move');
});

await t('iso: light by phase (cool morning, bright midday, amber evening, deep blue night) blends across the phase change', async () => {
  const mr = { ...ISO.lightState('morning', null) }, d = { ...ISO.lightState('midday', null) }, ev = { ...ISO.lightState('evening', null) }, ni = { ...ISO.lightState('night', null) };
  assert.ok(mr.b > mr.r, 'morning is cool'); assert.ok(d.a < 0.05, 'midday is untinted'); assert.ok(ev.r > ev.b && ev.glow > 0.3, 'evening is amber with lamps'); assert.ok(ni.b > ni.r && ni.glow >= 1 && ni.moon > 0, 'night is blue, lamps lit, moon up');
  const mid = ISO.lightState('night', { from: 'evening', t: 0.5, dur: 1 });
  assert.ok(mid.a > Math.min(ev.a, ni.a) - 1e-9 && mid.a < Math.max(ev.a, ni.a) + 1e-9 && mid.b > ev.b && mid.b < ni.b, 'halfway between the two');
});

await t('iso: a full floor (10 rooms, 40 monsters) stays within a canvas-call budget per frame', async () => {
  const { app, run, flow } = await setup({ seed: 'iso8' });
  const spec = [['rm_entrance', 0, 2]]; ['rm_ward', 'rm_ward', 'rm_ward', 'rm_chapel', 'rm_sawmill', 'rm_quarry', 'rm_linen', 'rm_workshop', 'rm_ward'].forEach((ty, i) => spec.push([ty, 1 + (i % 5), 1 + 2 * Math.floor(i / 5) + (i % 2)]));
  const ids = layout(run, spec);
  for (const id of ids) if (run.ward.rooms[id].type === 'rm_ward') run.ward.rooms[id].contents = Array.from({ length: 5 }, () => ({ kind: 'monster', id: NORMAL1[0] }));
  run.ward.deck.hand = []; flow.route(); frames(app, 100);
  const c0 = app.ctx.__calls; frames(app, 20); const per = (app.ctx.__calls - c0) / 20;
  assert.ok(per < 6000, 'canvas calls per frame ' + Math.round(per));
});

await t('camera: wheel and pinch zoom, a drag pans without tapping a room, C and the Recenter button return to the fit', async () => {
  const { app, run, flow } = await setup({ seed: 'cam1' });
  const [ent, qu] = layout(run, [['rm_entrance', 0, 2], ['rm_quarry', 1, 2]]);
  run.ward.deck.hand = []; flow.route(); frames(app, 200);
  const z0 = ISO.CAM.z; assert.ok(!ISO.CAM.manual);
  app.mouse.x = 640; app.mouse.y = 300; app.mouse.wheel = -300; frames(app, 3);
  assert.ok(ISO.CAM.manual && ISO.CAM.tz > z0, 'the wheel zooms in');
  key(app, 'c'); frames(app, 3); assert.ok(!ISO.CAM.manual && Math.abs(ISO.CAM.z - z0) < 0.01, 'C recenters');
  // a drag across a room is a pan: the room is not toggled, the view moved
  const c = cellCenter(1, 2), x0 = ISO.cellC(run.ward, 1, 2).x;
  const m = app.mouse; m.x = c.x; m.y = c.y; m.pressed = true; m.down = true; app.tick(1 / 60);
  for (let i = 1; i <= 6; i++) { m.x = c.x + i * 6; app.tick(1 / 60); }
  m.released = true; m.down = false; app.tick(1 / 60); frames(app, 2);
  assert.equal(run.ward.rooms[qu].on, true, 'a pan is not a tap'); assert.ok(ISO.CAM.manual && ISO.cellC(run.ward, 1, 2).x > x0 + 20, 'the map moved with the pointer');
  // pinch: a second finger spreads away
  const z1 = ISO.CAM.tz; m.x = 600; m.y = 300; m.down = true; m.second = true; m.p2 = { x: 700, y: 300 }; app.tick(1 / 60);
  m.p2 = { x: 800, y: 300 }; app.tick(1 / 60); assert.ok(ISO.CAM.tz > z1, 'pinching out zooms in');
  m.down = false; m.second = false; m.p2 = null; frames(app, 2);
  click(app, ISO.MAPR.x + 24, ISO.MAPR.y + 8 + 2 * 44 + 20); frames(app, 3); assert.ok(!ISO.CAM.manual, 'the Recenter button');
});

await t('kit: without a kit manifest (headless) every room stays painted, the wall mode button sits under Recenter, and the iso map still registers ward-room-<id>', async () => {
  const { app, run, flow } = await setup({ seed: 'kit0' });
  const ids = layout(run, [['rm_entrance', 0, 2], ['rm_sawmill', 1, 2], ['rm_ward', 2, 2]]); run.ward.deck.hand = []; flow.route(); frames(app, 30);
  assert.equal(ISO.lastKit().rooms.size, 0, 'no kit manifest: painted rooms only');
  for (const id of ids) assert.ok(reg('ward-room-' + id), 'ward-room-' + id);
  const b = reg('ward-walls'); assert.ok(b && b.y > reg('ward-recenter').y && b.group === 'map-ctl', 'the W button joins the map controls');
});

// ---- painted fallback: the lowered-wall paintings (rm_<id>_low) and the hero's walk pacing ----
await t('painted low: the low painting replaces the tall one wherever the tall one would hide a neighbour, each by its own measured floor diamond, the tall one stays for a lone room or a room without a low painting', async () => {
  const mkRun = async (spec, seed) => { const o = await setup({ seed }); const ids = layout(o.run, spec); o.run.ward.deck.hand = []; o.flow.route(); frames(o.app, 100); return { ...o, ids }; };
  const tall = { naturalWidth: 400, naturalHeight: 400, width: 400, height: 400 }, low = { naturalWidth: 400, naturalHeight: 400, width: 400, height: 400 };
  const T = (f) => ({ file1x: f, file2x: f, w: 400, h: 400, floorCx: 200, floorCy: 300, floorW: 380, floorH: 190 });
  const L = (f) => ({ file1x: f, file2x: f, w: 400, h: 400, floorCx: 190, floorCy: 310, floorW: 360, floorH: 180, low: true }); // NOT the tall diamond
  const install = (app) => {
    assets.manifest = { version: 1, tile: { w: 2, h: 1 }, rooms: { rm_entrance: T('e.webp'), rm_corridor: T('c.webp'), rm_ward: T('w.webp'), rm_quarry: T('q.webp'), rm_entrance_low: L('el.webp'), rm_corridor_low: L('cl.webp'), rm_ward_low: L('wl.webp') }, actors: {}, icons: {}, cards: {}, cardsById: {} };
    assets.state = 'ready';
    for (const f of ['e', 'c', 'w', 'q']) assets.imgs.set(f + '.webp', { ok: true, img: tall });
    for (const f of ['el', 'cl', 'wl']) assets.imgs.set(f + '.webp', { ok: true, img: low });
  };
  const calls = []; let dI;
  try {
    // a lone room: the tall painting
    const one = await mkRun([['rm_entrance', 2, 2]], 'lowone'); dI = one.app.ctx.drawImage; one.app.ctx.drawImage = (...a) => { calls.push(a); };
    install(one.app); ISO.setWallMode('auto'); frames(one.app, 4);
    assert.equal(ISO.paintedKind(one.ids[0]), 'tall', 'a lone room keeps the tall painting'); assert.ok(calls.some((c) => c[0] === tall), 'tall drawn'); assert.ok(!calls.some((c) => c[0] === low), 'no low painting for a lone room');
    one.app.ctx.drawImage = dI; assets.reset(); ISO.resetIso();
    // a row of four (a hero in the entrance): cutaway lowers what has a room behind it, low lowers all, full keeps the tall ones except in front of the hero
    const row = await mkRun([['rm_entrance', 0, 2], ['rm_corridor', 1, 2], ['rm_ward', 2, 2], ['rm_quarry', 3, 2]], 'lowrow'); dI = row.app.ctx.drawImage; row.app.ctx.drawImage = (...a) => { calls.push(a); };
    install(row.app); const kinds = () => row.ids.map((i) => ISO.paintedKind(i));
    ISO.setWallMode('low'); frames(row.app, 40); assert.deepEqual(kinds(), ['low', 'low', 'low', 'tall'], 'Low: every room that has a low painting (the quarry has none: tall + crop)');
    ISO.setWallMode('cutaway'); frames(row.app, 40); assert.deepEqual(kinds(), ['tall', 'low', 'low', 'tall'], 'Cutaway: the hero room has nothing behind it and stays tall, rooms with a room behind are lowered');
    ISO.setWallMode('full'); frames(row.app, 40); assert.deepEqual(kinds().slice(0, 3), ['tall', 'low', 'tall'], 'Full: tall, except the front neighbour of the hero room');
    // aligned by its OWN diamond: the low painting of the corridor is placed with floorCx 190 / floorCy 310 / floorW 360
    ISO.setWallMode('low'); frames(row.app, 40); calls.length = 0; frames(row.app, 1);
    const c1 = ISO.cellW(row.run.ward, 1, 2), s = ISO.TW / 360, hit = calls.filter((c) => c[0] === low && c.length === 5).find((c) => Math.abs(c[1] - (c1.x - 190 * s)) < 1);
    assert.ok(hit, 'the low painting is placed by its own floor centre'); assert.ok(Math.abs(hit[2] - (c1.y - 310 * s)) < 1 && Math.abs(hit[3] - 400 * s) < 1, 'and scaled by its own floor width');
    // a dark room is drawn from the cold copy of the LOW painting, never the tall one plain
    row.run.ward.rooms[row.ids[2]].on = false; frames(row.app, 3); assert.equal(ISO.paintedKind(row.ids[2]), 'low');
    // picking and the hero are untouched: the floor of every cell still resolves, the hero stands in the entrance
    let picked = 0; for (let x = 0; x < 4; x++) { const c = ISO.cellC(row.run.ward, x, 2); if (!ISO.overMap(c.x, c.y)) continue; picked++; assert.deepEqual(ISO.pick(row.run.ward, c.x, c.y), { x, y: 2 }, 'pick ' + x); } assert.ok(picked >= 3, 'cells on the panel: ' + picked);
    assert.ok(ISO.lastActors().some((a) => a.kind === 'hero'), 'the hero is drawn');
  } finally { assets.reset(); ISO.resetIso(); ISO.setWallMode('auto'); }
});

await t('walk pacing: about 0.6 s per room, a beat at the room that fires, half of it with Fast walk, quick with reduced motion, no beat on a wait; the F key saves the setting', async () => {
  const run1 = async (mode) => {
    const { app, run, flow } = await setup({ seed: 'pace' + mode });
    const [a, b, c] = layout(run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2], ['rm_corridor', 2, 2]]); run.ward.deck.hand = []; flow.route(); frames(app, 60);
    const st = app.screens.ward.st, set = app.shared.meta.settings; let saved = 0; flow.saveMeta = () => { saved++; };
    set.reduceMotion = set.reducedMotion = mode === 'reduced'; set.fastWalk = mode === 'fast';
    let finished = null, f0 = 0, moveEnd = null; st.walk = { cells: [a, b, c], i: 0, a: 0, stop: 2, t: 0, done: () => { finished = f0; }, wait: false };
    for (f0 = 1; f0 < 400 && finished === null; f0++) { frames(app, 1); if (moveEnd === null && st.walk && st.walk.i >= st.walk.stop) moveEnd = f0; }
    return { total: finished / 60, move: (moveEnd === null ? finished : moveEnd) / 60, saved, app, flow, st, set };
  };
  const nrm = await run1('normal'), fast = await run1('fast'), red = await run1('reduced');
  assert.ok(nrm.move > 1.15 && nrm.move < 1.4, 'two rooms take about 0.62 s each: ' + nrm.move.toFixed(2));
  assert.ok(nrm.total - nrm.move > 0.28 && nrm.total - nrm.move < 0.45, 'a beat of about 0.35 s where the room fires: ' + (nrm.total - nrm.move).toFixed(2));
  assert.ok(fast.total < nrm.total * 0.65 && fast.total > 0.6, 'Fast walk is clearly quicker but not a teleport: ' + fast.total.toFixed(2));
  assert.ok(red.total < 0.4 && red.total - red.move < 0.03, 'reduced motion is quick and has no beat: ' + red.total.toFixed(2));
  // a wait (the hero stays put) never pauses
  const w1 = await setup({ seed: 'pacewait' }); const [r0] = layout(w1.run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2]]); w1.run.ward.deck.hand = []; w1.flow.route(); frames(w1.app, 30);
  w1.app.shared.meta.settings.reduceMotion = w1.app.shared.meta.settings.reducedMotion = false;
  let fin = false; w1.app.screens.ward.st.walk = { cells: [r0], i: 0, a: 0, stop: 0, t: 0, done: () => { fin = true; }, wait: true }; frames(w1.app, 2); assert.ok(fin, 'a wait finishes at once');
  // the setting: the F key toggles meta.settings.fastWalk and asks the flow to save it; the default is normal
  const k = await setup({ seed: 'pacekey' }); layout(k.run, [['rm_entrance', 0, 2]]); k.run.ward.deck.hand = []; k.flow.route(); frames(k.app, 30);
  k.app.screens.ward.st.banner = null; let saves = 0; k.flow.saveMeta = () => { saves++; }; assert.ok(!k.app.shared.meta.settings.fastWalk, 'default: normal pace');
  key(k.app, 'f'); assert.equal(k.app.shared.meta.settings.fastWalk, true); assert.equal(saves, 1); key(k.app, 'F'); assert.equal(k.app.shared.meta.settings.fastWalk, false); assert.equal(saves, 2);
  assert.equal((await import('../graftwork/engine/meta.js')).DEFAULT_SETTINGS.fastWalk, false, 'in the meta defaults'); assert.equal((await import('../graftwork/ui/settings.js')).DEFAULTS.fastWalk, false, 'and the settings defaults');
});

await t('walk pacing: the hero on the move is drawn in the final actor pass (a wall in front never hides him), at rest he stays with the props', async () => {
  const { app, run, flow } = await setup({ seed: 'pacefinal' });
  const [a, b] = layout(run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2]]); run.ward.deck.hand = []; flow.route(); frames(app, 60);
  app.shared.meta.settings.reduceMotion = app.shared.meta.settings.reducedMotion = false;
  const H = () => ISO.lastActors().find((x) => x.kind === 'hero'), st = app.screens.ward.st;
  st.walk = { cells: [a, b], i: 0, a: 0, stop: 1, t: 0, done: null, wait: false }; frames(app, 10); assert.ok(H().moving, 'moving'); st.walk = null; frames(app, 5); assert.ok(!H().moving);
});

console.log(`${n} ward UI checks passed`);
