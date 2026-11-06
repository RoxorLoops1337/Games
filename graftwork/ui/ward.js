// THE WARD screen (run.phase === 'ward', design/WARD.md section 6): the hospital you build instead of the map.
// An architect's blueprint engraved on vellum (9 x 6 grid, hatched walls, rubble, room plates), a brass day clock with the four phases,
// resources and the building deck on top, the hero on the left, the room or walk notes on the right, the building hand along the bottom.
// MORNING: drag a plan onto a glowing cell (or a room, for upgrades and effects); tap a room to switch its power; End Morning.
// MIDDAY / EVENING / NIGHT: hover a room to draw the walk as a red thread with numbered triggers; click to walk. The hero token walks
// room to room (250 ms a room) and each trigger opens its screen through flow.route(); the engine's afterTrigger continues the walk, and
// wardInterlude() (called by flow.route) plays the steps between two triggers on this screen before the next one opens.
// The run changes only through engine/ward.js (playBuildCard, togglePower, endMorning, startWalk). Saves go through engine/save.js.
import { COL, EASE, W, H, clamp, rgba } from './core.js';
import * as WD from '../engine/ward.js';
import { ROOMS, BUILD_CARDS, PHASES, PHASE_ORDER, FLOOR, WARD_TUNE as T } from '../data/ward.js';
import { HEROES, RELICS, ENEMIES } from '../data/index.js';
import { drawBackground } from '../art/backgrounds.js';
import { drawNodeIcon, drawRelic, drawHeart, drawCoin } from '../art/icons.js';
import { drawPortrait } from '../art/heroes.js';
import { Fx, FX_OPTS } from './fx.js';
import { maybeTip } from './tutorial.js';
import { lnw } from '../art/linework.js';
import { saveRun } from '../engine/save.js';
import * as K from './ward_kit.js';
import * as ISO from './ward_iso.js';
import { assets } from './assets.js';

// ---------------- geometry (logical 1280 x 720) ----------------
// The map is an isometric diamond grid (ui/ward_iso.js): a cell is a 2:1 diamond TW x TH, cellCenter is the middle of its floor.
export const CELL = ISO.TW;
const SHEET = ISO.MAPR;
const LEFT = { x: 12, y: 64, w: 260, h: 648 };
const RIGHT = { x: 1008, y: 64, w: 260, h: 484 };
const ACT = { x: 1008, y: 556, w: 260, h: 156 };
const HAND = { x: 284, y: 556, w: 712, h: 164 };
const CW = 124, CH = 156; // resting building card
const STEP_S = 0.25; // a room per step
const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };
const PH_GLYPH = { morning: 'ward_sun', midday: 'ward_highsun', evening: 'ward_lamp', night: 'ward_moon' };
const PH_SHORT = { morning: 'Build', midday: '+10% fight gold', evening: 'Dinner: +1 card', night: 'Risk, +25% gold' };
const PH_TINT = { morning: ['#ffe2a8', 0.5], midday: ['#ffffff', 0], evening: ['#d89a5a', 0.75], night: ['#5a6aa8', 0.85] }; // multiplied over the plan
const TRIG = { fight: ['fight', 'Ward fight'], elite: ['elite', 'Elite'], event: ['event', 'Chapel event'], shop: ['shop', 'Dispensary'], forge: ['forge', 'Workshop'], rest: ['rest', 'Clean sheets'], boss: ['boss', 'The boss'] };
const TRIG_SHORT = { fight: 'Fight', elite: 'Elite', event: 'Event', shop: 'Shop', forge: 'Forge', boss: 'Boss' };
const DARKW = (r) => !r.on && ROOMS[r.type].power > 0;

const WDIM = () => (S && S.run && S.run.ward) || { w: 9, h: 6 };
export const cellXY = (x, y) => { const b = ISO.cellBox(WDIM(), x, y); return { x: b.x, y: b.y }; }; // top left of the cell's diamond box
export const cellCenter = (x, y) => ISO.cellC(WDIM(), x, y);
export function handRects(n) {
  const gap = 14, tw = n * CW + Math.max(0, n - 1) * gap, x0 = HAND.x + (HAND.w - tw) / 2, out = [];
  for (let i = 0; i < n; i++) out.push({ x: x0 + i * (CW + gap), y: HAND.y + 2, w: CW, h: CH });
  return out;
}
const roomCenter = (run, rid) => { const r = run.ward.rooms[rid]; if (r) return cellCenter(r.x, r.y); const e = WD.entranceOf(run); return e ? cellCenter(e.x, e.y) : { x: 640, y: 300 }; }; // never a spot off the plan
const reduced = (app) => { const s = app.shared.meta && app.shared.meta.settings; return !!(FX_OPTS.reduced || (s && (s.reducedMotion || s.reduceMotion))); };
const sfx = (app, n, o) => { const a = app.shared.audio; if (a && a.sfx) { try { a.sfx(n, o); } catch (e) { /* audio is optional */ } } };
const post = (app, fn, ...a) => { const p = app.post; if (p && typeof p[fn] === 'function') { try { p[fn](...a); } catch (e) { /* post is optional */ } } };
const save = (run) => { try { saveRun(run); } catch (e) { /* storage is optional */ } };
const darkKey = (uid, tgt) => uid + ':' + (tgt && typeof tgt === 'object' ? tgt.x + ',' + tgt.y : tgt);
const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + 's')}`;

// what survives leaving the screen for a fight and coming back (walk plan, phase seen, spawn counts, stamps)
function startDie(app) {
  S.dieRolling = reduced(app) ? 0 : 0.9; S.dieT = 0;
  if (S.dieRolling) { sfx(app, 'comboTick', { n: 3 }); for (let i = 1; i < 5; i++) app.after(i * 170, () => sfx(app, 'comboTick', { n: 3 + i })); }
}
const MEM = { dieKey: '', phaseKey: '', floorKey: '', seen: {}, plan: null, stamps: {}, pops: {}, bulbs: {}, darkBuilt: {} }; // darkBuilt: rooms that were built dark for lack of power (a later Generator relights them)
export const wardMem = MEM; // tests
// 0..1 progress of a build / upgrade pop-in. A stamp from the future (an earlier visit's clock) never hides a room: it counts as finished.
export function buildAge(stamp, t) { if (stamp === undefined || !(stamp <= t)) return 1; return clamp((t - stamp) / 0.4, 0, 1); }
export function resetWardMem() { MEM.dieKey = ''; MEM.phaseKey = ''; MEM.floorKey = ''; MEM.seen = {}; MEM.plan = null; MEM.stamps = {}; MEM.pops = {}; MEM.bulbs = {}; MEM.darkBuilt = {}; }

// A walk that was resumed (page reload, Continue from the title) has no step plan in memory: rebuild it from the saved walk so the token still
// walks the steps between two triggers instead of jumping to the end of the route.
function ensurePlan(run) {
  const w = run && run.ward;
  if (MEM.plan || !w || !w.walk || w.walk.wait || !w.walk.path || !w.walk.path.length) return;
  const cells = w.walk.path.slice(), at = cells.indexOf(w.hero.room);
  if (at >= 0) MEM.plan = { act: w.act, cells, at, rid: w.walk.dest, wait: false };
}
// flow.route() calls this before it opens a trigger's screen: when the walk moved the hero since the last trigger, the Ward plays those steps first.
export function wardInterlude(app, run, scr) {
  ensurePlan(run);
  const P = MEM.plan, w = run && run.ward;
  if (!P || !w || !w.walk || w.act !== P.act || run.mode !== 'ward' || !app.screens.ward) return false;
  const idx = P.cells.indexOf(w.hero.room, P.at);
  if (idx <= P.at) return false;
  app.go('ward', { run, then: scr });
  return true;
}

// plain-words reasons for every engine why
export function whyText(run, why, card, target) {
  const w = run.ward;
  switch (why) {
    case 'phase': return 'Building happens in the morning.';
    case 'nocard': return 'That plan is not in your hand.';
    case 'cost': { const c = card.cost || {}, miss = []; if ((c.wood || 0) > w.res.wood) miss.push(`${c.wood} wood`); if ((c.stone || 0) > w.res.stone) miss.push(`${c.stone} stone`); if ((c.gold || 0) > run.gold) miss.push(`${c.gold} gold`); return 'Not enough: needs ' + miss.join(', ') + '.'; }
    case 'bounds': return 'Off the floor plan.';
    case 'occupied': return 'Something is already built here.';
    case 'rubble': return 'Rubble. A Demolish plan clears it.';
    case 'adjacent': return 'A room must share a wall with a room (the Theatre does not count).';
    case 'target': return card && card.kind === 'room' ? 'Drop it on an empty cell.' : card && card.effect === 'res' ? 'Choose wood or stone.' : 'Drop it on a room.';
    case 'type': { const r = w.rooms[target]; return `${card.name} does not fit a ${r ? ROOMS[r.type].name : 'room like that'}.`; }
    case 'already': return 'Already installed here.';
    case 'hero': return 'You are standing in it.';
    case 'cut': return 'That would cut rooms off from the Entrance.';
    case 'fixed': return 'The Entrance and the Theatre stay where they are.';
    case 'timer': return 'That room has no timer to tick.';
    case 'power': return 'That room is dark. Switch it on first.';
    case 'morning': return 'It is morning: build first, then End Morning to walk.';
    case 'far': return `Too far: you can walk ${WD.moveOf(run)} rooms this phase.`;
    case 'unreachable': return run.ward && run.ward.route ? 'Each step must be a room next to the last one (shared wall).' : 'No door leads there yet. Rooms connect through shared walls.';
    case 'boss': return 'The last night: only the Theatre.';
    case 'full': return 'The roll is spent. Go, or undo a step.';
    case 'visited': return 'A route never enters the same room twice.';
    case 'theatre': return 'The route ends in the Theatre.';
    case 'empty': return 'Plan a route first: click a room next to you.';
    default: return 'Not here.';
  }
}

// one line per walk: "2 fights (3 monsters), 1 event, arrive at the Chapel"
export function walkSummary(run, p, rid) {
  const w = run.ward, live = p.triggers.filter((t) => !t.bribed);
  const c = { fight: 0, mon: 0, elite: 0, l2: 0, event: 0, shop: 0, forge: 0, rest: 0, boss: 0 };
  for (const t of live) { c[t.kind] = (c[t.kind] || 0) + 1; if (t.kind === 'fight') c.mon += t.detail.count || 1; if (t.kind === 'elite' && t.detail.level >= 2) c.l2++; if (t.kind === 'event') c.event += (t.detail.n || 1) - 1; }
  const parts = [];
  if (c.fight) parts.push(`${plural(c.fight, 'fight')} (${plural(c.mon, 'monster')})`);
  if (c.elite) parts.push(plural(c.elite, 'elite') + (c.l2 ? ' (Level 2)' : ''));
  if (c.event) parts.push(plural(c.event, 'event'));
  if (c.shop) parts.push('the Dispensary');
  if (c.forge) parts.push('the Workshop');
  if (c.rest) parts.push('clean sheets');
  if (c.boss) parts.push('the boss');
  const dest = w.rooms[rid];
  const where = p.wait ? 'stay put' : `arrive at the ${dest ? ROOMS[dest.type].name : 'room'}`;
  return (parts.length ? parts.join(', ') : 'nothing on the way') + ', ' + where;
}

function roomTip(run, r) {
  const d = ROOMS[r.type], w = run.ward, lines = [];
  if (r.type === 'rm_theatre') lines.push(bossLine(run, true));
  else if (d.power) lines.push(r.on ? `Lit: uses ${d.power} power.` : 'Dark: switched off. Its timer pauses, what is inside sleeps, and crossing it costs 3 HP.');
  else if (d.powerAdd) lines.push(`Adds ${d.powerAdd} power. Uses none.`);
  const every = WD.everyOf(r);
  if (r.contents.length) lines.push('Inside: ' + contentsText(r));
  if (every && r.type !== 'rm_theatre') lines.push(r.contents.length >= WD.capOf(r) ? `Full (${WD.capOf(r)}). The timer waits.` : `Next spawn in ${plural(r.timers.spawn, 'day')} (every ${plural(every, 'day')}).`);
  if (d.produce) lines.push('Each lit morning: ' + Object.entries(d.produce).map(([k, n]) => `+${n * (r.overtime ? 2 : 1)} ${k}`).join(', ') + (r.overtime ? ' (Overtime)' : '') + '.');
  if (r.upgrades.length) lines.push('Upgrades: ' + r.upgrades.map((u) => BUILD_CARDS[u] ? BUILD_CARDS[u].name : u).join(', ') + '.');
  if (r.id === w.hero.room) lines.push('You are here.');
  if (!lines.length || r.type === 'rm_entrance' || r.type === 'rm_corridor') lines.push(d.hint);
  return lines.join('\n');
}
function contentsText(r) {
  const n = r.contents.length, k = r.contents[0] && r.contents[0].kind;
  if (k === 'monster') { const names = {}; for (const c of r.contents) { const e = ENEMIES[c.id]; const nm = e ? e.name : c.id; names[nm] = (names[nm] || 0) + 1; } return Object.entries(names).map(([nm, c]) => (c > 1 ? `${c} x ${nm}` : nm)).join(', ') + '.'; }
  if (k === 'elite') { const c = r.contents[0], e = ENEMIES[c.id]; return `${e ? e.name : 'an elite'}, Level ${c.level}${c.level < 2 && c.age ? ` (Level 2 in ${Math.max(1, T.eliteAge - c.age)} days)` : ''}.`; }
  if (k === 'event') return plural(n, 'event') + ' waiting.';
  if (k === 'shop') return 'Restocked.'; if (k === 'forge') return 'Charged.'; if (k === 'rest') return 'Clean sheets.';
  return '';
}
function bossLine(run, long) {
  const w = run.ward, days = w.dayLimit - w.day;
  if (WD.bossForced(run)) return long ? 'The boss is waiting. Tonight you are pulled in, wherever you stand.' : 'Boss tonight';
  if (WD.bossOpen(run)) return long ? `The boss arrives on the last night (${plural(days, 'day')}). You may walk in early: boss HP x0.9, +30 gold and a free uncommon or rare plan.` : (days ? 'Boss open' : 'Boss tonight');
  return long ? `The boss arrives on the last night: ${plural(days, 'day')}. Safe to cross until two days before.` : `Boss in ${plural(days, 'day')}`;
}

// ---------------- the screen ----------------
let S = null;
export default {
  enter(app, params) {
    const run = app.shared.run;
    S = { run, fx: new Fx(), t: 0, drag: null, press: null, sel: null, selRoom: null, alt: 0, altFor: null, toast: '', toastT: 0, walk: null, trans: null, banner: null, plans: false, plansScroll: 0, chip: null, hoverRoom: null, endArm: 0, darkOk: '', rest: false, restT: 0 };
    this.st = S;
    MEM.stamps = {}; MEM.pops = {}; MEM.bulbs = {}; // these hold S.t times of an earlier visit: S.t restarts at 0 here (rooms built before a fight stayed invisible)
    const w = run.ward;
    if (!w) return;
    ISO.camReset();
    assets.ensure(app); // the room, actor and icon art (assets/ward/); every draw falls back to the procedural look until it is there
    if (!w.rooms[w.hero.room]) { const e = WD.entranceOf(run); if (e) w.hero.room = e.id; } // a hero is always standing in a room
    const fk = `${run.seed}|${run.act}|${run.loop || 0}`;
    if (MEM.floorKey !== fk) { if (MEM.floorKey || w.day === 1) S.banner = { t: 0, t0: Date.now(), act: run.act }; MEM.floorKey = fk; MEM.plan = null; MEM.seen = MEM.seen || {}; }
    ensurePlan(run);
    const P = MEM.plan;
    if (P && P.act !== w.act) MEM.plan = null;
    if (MEM.plan) { // steps still to show: towards the next trigger (params.then) or to the end of the walk
      const idx = P.cells.indexOf(w.hero.room, P.at);
      if (idx > P.at) this.animate(app, P.at, idx, () => { P.at = idx; if (params && params.then) app.shared.flow.route(); else MEM.plan = null; });
      else if (!w.walk) MEM.plan = null;
    }
    if (params && params.then && !S.walk) app.after(1, () => app.shared.flow.route()); // nothing to show: on to the trigger's screen
  },
  leave() { },
  key(app, e) { return !!(S && S.run && S.run.ward && e.key === 'Tab' && app.top() === this); }, // Tab walks the rooms (kbItems): keep the browser focus on the page
  update(app, dt) {
    if (!S || !S.run.ward) return;
    app.touchPan = !!S.plans; // a finger drag on the Ward is a plan drag (core.js turns a vertical touch move into a scroll otherwise, and the drop never happened); only the plans overlay scrolls
    S.t += dt; S.fx.update(dt);
    if (!S.preloaded && assets.ready()) { S.preloaded = true; assets.preload(app); }
    if (S.dieRolling > 0) S.dieRolling = Math.max(0, S.dieRolling - dt);
    { const w0 = S.run.ward; if (w0.phase !== 'morning' && !S.banner && S.run.phase === 'ward' && !WD.bossForced(S.run)) { const r0 = WD.rollOf(S.run); if (r0 && MEM.dieKey !== r0.key) { MEM.dieKey = r0.key; startDie(app); } } }
    if (S.toastT > 0) S.toastT -= dt;
    if (S.banner) { const wall = (Date.now() - (S.banner.t0 || Date.now())) / 1000; S.banner.t = Math.max(S.banner.t + dt, wall); if (S.banner.t > 2.6) S.banner = null; } // wall clock too: a slow phone must not keep the plate up
    if (S.trans) { S.trans.t += dt; if (S.trans.t >= S.trans.dur) S.trans = null; }
    if (S.rest) { // "Rest of day": wait here once per phase until the morning
      const w0 = S.run.ward;
      if (w0.phase === 'morning' || S.run.phase !== 'ward' || WD.bossForced(S.run) || (w0.route && w0.route.length)) S.rest = false;
      else if (!S.walk && !S.banner && !S.trans && !S.dieRolling) {
        S.restT -= dt;
        if (S.restT <= 0) { S.restT = 0.4; if (!WD.pathTo(S.run, w0.hero.room).ok) S.rest = false; else this.walkTo(app, w0.hero.room, 0); }
      }
    }
    const wk = S.walk;
    if (wk) {
      wk.t += dt / (reduced(app) ? 0.2 : 1);
      while (wk && wk.t >= STEP_S && wk.i < wk.stop) {
        wk.t -= STEP_S; wk.i++;
        const rid = wk.cells[wk.i], room = S.run.ward.rooms[rid], c = roomCenter(S.run, rid);
        sfx(app, 'mapStep', { vol: 0.55 });
        if (room && DARKW(room) && !S.run.ward.effects.some((e) => e.id === 'lamp') && !wk.wait) { S.fx.float('-3 HP', c.x, c.y - 24, { color: COL.bad, size: 22 }); sfx(app, 'loseHp', { vol: 0.5 }); }
      }
      if (wk.i >= wk.stop) { const done = wk.done; S.walk = null; if (done) done(); }
    }
  },
  // the walk animation: token steps along P.cells from index a to b, then done()
  animate(app, a, b, done) {
    const P = MEM.plan; if (!P) { if (done) done(); return; }
    S.walk = { cells: P.cells, i: a, stop: b, t: 0, done, wait: P.wait };
  },

  draw(app) {
    if (!S) return;
    const run = S.run, w = run.ward, g = app.ctx;
    if (!w) return;
    const blocked0 = app.blocked;
    const busy = !!(S.walk || S.banner || S.plans);
    if (busy) app.blocked = true;
    this.phaseWatch(app);
    drawBackground(g, { 1: 'ward', 2: 'market', 3: 'theatre' }[run.act] || 'ward', S.t);
    g.save(); g.fillStyle = 'rgba(8,6,5,.5)'; g.fillRect(0, 0, W, H); g.restore();
    const so = S.fx.shakeOffset();
    g.save(); g.translate(so.x, so.y);
    this.drawSheet(app);
    { const H0 = this.host(app); H0.buildable.clear(); if (w.phase === 'morning') for (const [x, y] of WD.buildCells(run)) H0.buildable.add(x + ',' + y); if (!busy) this.camInput(app); ISO.camUpdate(H0); }
    const inter = this.interact(app);
    this.drawRooms(app, inter);
    this.drawTint(app);
    if (inter.path) this.drawPath(app, inter.path, inter.dest);
    this.drawKb(app);
    this.drawHero(app);
    S.fx.draw(g);
    g.restore();
    this.topBar(app);
    this.leftPanel(app);
    this.rightPanel(app, inter);
    this.actions(app, inter);
    S.selZone = null;
    if (w.phase === 'morning') this.hand(app, inter); else this.walkStrip(app);
    this.camButtons(app);
    this.roomCard(app);
    if (inter.chip) this.drawChip(app, inter.chip);
    this.drawTransition(app);
    if (S.toastT > 0) this.drawToast(app);
    S.fx.drawFlash(g, W, H);
    app.blocked = blocked0;
    if (S.banner) this.drawBanner(app);
    if (S.plans) { app.blocked = blocked0; K.plansModal(app, run, S); }
    if (!busy && !S.drag) this.tips(app);
    for (const e of app.pressedKeys) this.onKey(app, e);
  },

  // ---- phase changes: dawn wipe, lamp dimming, moonlight; spawns pop in at morning ----
  phaseWatch(app) {
    const run = S.run, w = run.ward;
    if (S.walk) return;
    const pk = `${run.seed}|${w.act}|${w.day}|${w.phase}`;
    if (MEM.phaseKey !== pk) {
      const prev = MEM.phaseKey ? MEM.phaseKey.split('|')[3] : null;
      MEM.phaseKey = pk;
      if (prev || w.phase === 'morning') {
        const red = reduced(app);
        S.trans = { kind: w.phase, from: prev || 'night', t: 0, dur: red ? 0.25 : w.phase === 'morning' ? 1.3 : 1.0 };
        if (w.phase === 'morning') { sfx(app, 'turnStart'); post(app, 'flash', '#fff1b0', 0.1); }
        else if (w.phase === 'midday') sfx(app, 'buff', { vol: 0.6 });
        else if (w.phase === 'evening') sfx(app, 'turnEnd');
        else { sfx(app, 'eventChime', { vol: 0.8 }); post(app, 'vignette', 0.35, 1400); }
        if (w.phase === 'morning') { // spawns pop in, one tick each
          let k = 0;
          for (const r of Object.values(w.rooms)) {
            const n = r.contents.length, was = MEM.seen[r.id] || 0;
            if (n > was) { const delay = 0.35 + k * 0.16; MEM.pops[r.id] = S.t + delay; app.after(delay * 1000, () => { sfx(app, 'comboTick', { n: 3 + k }); }); k++; }
          }
        }
      }
    }
    MEM.seen = {}; for (const r of Object.values(w.rooms)) MEM.seen[r.id] = r.contents.length;
  },

  // ---- the map panel: a dark table under the isometric plinth (the ground, rooms and actors are drawn by ui/ward_iso.js) ----
  drawSheet(app) {
    const g = app.ctx, s = SHEET;
    app.reg('ward-sheet', s.x, s.y, s.w, s.h, { layer: 'world' });
    g.save();
    g.fillStyle = 'rgba(0,0,0,.55)'; app.rr(s.x + 4, s.y + 6, s.w, s.h, 6); g.fill();
    app.rr(s.x, s.y, s.w, s.h, 6);
    const pg = g.createRadialGradient(s.x + s.w / 2, s.y + s.h * 0.45, 40, s.x + s.w / 2, s.y + s.h * 0.45, s.w * 0.62); pg.addColorStop(0, '#2a2119'); pg.addColorStop(1, '#0f0b09'); g.fillStyle = pg; g.fill();
    g.strokeStyle = '#7A5F12'; g.lineWidth = lnw('ink'); g.stroke();
    g.beginPath(); g.rect(s.x + 5, s.y + 5, s.w - 10, s.h - 10); g.strokeStyle = 'rgba(201,162,39,.22)'; g.lineWidth = lnw('hair'); g.stroke();
    g.restore();
  },

  // ---- pointer logic: what is hovered, what would happen, drag and drop, taps ----
  interact(app) {
    const run = S.run, w = run.ward, m = app.mouse, out = { hoverCell: null, legal: null, path: null, dest: null, chip: null, preview: null };
    const pk = ISO.pick(w, m.x, m.y), gx = pk ? pk.x : -1, gy = pk ? pk.y : -1;
    const z = S.selZone, inZone = z && m.x >= z.x && m.x <= z.x + z.w && m.y >= z.y && m.y <= z.y + z.h;
    const onGrid = !app.blocked && !inZone && !!pk;
    const sameCell = () => { if (!m.pressStart) return false; const q = ISO.pick(w, m.pressStart.x, m.pressStart.y); return !!q && q.x === gx && q.y === gy; }; // pressed and released on the same cell
    if (onGrid) out.hoverCell = { x: gx, y: gy };
    const hovRoom = onGrid ? WD.roomAt(run, gx, gy) : null;
    S.hoverRoom = hovRoom ? hovRoom.id : null;
    if (w.phase === 'morning') {
      const uid = S.drag ? S.drag.uid : S.sel, inst = uid !== null && uid !== undefined ? w.deck.hand.find((c) => c.uid === uid) : null, card = inst && BUILD_CARDS[inst.id];
      if (card) {
        out.legal = this.legalTargets(run, inst, card);
        if (out.hoverCell) {
          const tgt = this.targetAt(run, card, gx, gy), chk = tgt === undefined ? { ok: false, why: 'target' } : WD.canPlayBuild(run, uid, tgt);
          out.drop = { tgt, ok: chk.ok };
          if (!chk.ok && (S.drag ? S.drag.moved : true)) out.chip = { text: whyText(run, chk.why, card, tgt), x: m.x, y: m.y, bad: true };
          else if (chk.ok && K.wouldBuildDark(run, card)) { const pw = WD.wardPower(run); out.chip = { text: `No spare power (${pw.used} of ${pw.cap}): the ${ROOMS[card.room].name} would be built DARK. ${S.darkOk === darkKey(uid, tgt) ? 'Drop it again to confirm.' : 'Drop it to confirm, or switch a room off first.'}`, x: m.x, y: m.y, bad: true }; }
          else if (chk.ok) out.chip = { text: card.kind === 'room' ? `Build the ${card.name} here` : card.target === 'room' ? `${card.name} on the ${ROOMS[hovRoom.type].name}` : `Play ${card.name}`, x: m.x, y: m.y, bad: false };
        }
      }
      // release: drop a dragged plan, or a tap on the grid
      if (m.released && !app.blocked) {
        if (S.drag && S.drag.moved) {
          if (out.drop && out.drop.ok) { if (this.darkGuard(app, card, S.drag.uid, out.drop.tgt)) this.play(app, S.drag.uid, out.drop.tgt); }
          else if (onGrid && out.drop) { sfx(app, 'error'); this.toast(out.chip ? out.chip.text : 'Not here.'); }
          else if (card && card.target === 'none' && m.y < HAND.y - 10 && m.y > 60) this.play(app, S.drag.uid, null);
          S.drag = null; S.press = null; m.released = false;
        } else if (onGrid && sameCell() && !S.drag) {
          if (card) { if (out.drop && out.drop.ok) { if (this.darkGuard(app, card, uid, out.drop.tgt)) this.play(app, uid, out.drop.tgt); } else { sfx(app, 'error'); this.toast(out.chip ? out.chip.text : 'Not here.'); } }
          else if (hovRoom) this.power(app, hovRoom);
          m.released = false;
        }
      }
    } else {
      // walk phases (dice routes): the roll is the route length; a click appends the next room, the last step again takes it back
      const forced = WD.bossForced(run);
      if (forced) {
        const rid = S.selRoom || (hovRoom ? hovRoom.id : null);
        if (rid && w.rooms[rid]) {
          const p = WD.pathTo(run, rid, 0);
          out.preview = { rid, p }; S.curP = p;
          if (p.ok) { out.path = [w.hero.room, ...p.path]; out.dest = rid; }
          else if (hovRoom && hovRoom.id === rid) out.chip = { text: whyText(run, p.why), x: m.x, y: m.y, bad: true };
        }
        if (m.released && !app.blocked && onGrid && hovRoom && sameCell()) {
          m.released = false;
          const p = WD.pathTo(run, hovRoom.id, 0);
          if (!p.ok) { sfx(app, 'error'); this.toast(whyText(run, p.why)); }
          else if (m.touch && S.selRoom !== hovRoom.id) { S.selRoom = hovRoom.id; sfx(app, 'uiClick'); }
          else this.walkTo(app, hovRoom.id, 0);
        }
        return out;
      }
      const roll = WD.rollOf(run), rt = w.route || [];
      const last = rt.length ? rt[rt.length - 1] : w.hero.room;
      const hid = hovRoom && !S.walk && !S.dieRolling ? hovRoom.id : null;
      const hwhy = hid ? WD.routeWhy(run, hid) : null;
      const ghost = hid && !hwhy ? [...rt, hid] : rt;
      if (ghost.length) {
        const p = WD.routeInfo(run, ghost);
        out.preview = { rid: ghost[ghost.length - 1], p, route: true, ghost: ghost.length > rt.length }; S.curP = p;
        out.path = [w.hero.room, ...ghost]; out.dest = ghost[ghost.length - 1];
      } else S.curP = null;
      if (hid && hwhy && hid !== last) out.chip = { text: whyText(run, hwhy), x: m.x, y: m.y, bad: true };
      if (m.released && !app.blocked && onGrid && hovRoom && !S.walk && sameCell()) {
        m.released = false;
        if (S.dieRolling) { /* the die is still tumbling */ }
        else if (rt.length && hovRoom.id === last) { WD.undoRoute(run); sfx(app, 'uiClick'); save(run); }
        else if (hwhy) { sfx(app, 'error'); this.toast(whyText(run, hwhy)); }
        else { WD.extendRoute(run, hovRoom.id); sfx(app, 'mapStep'); save(run); }
      }
      void roll;
    }
    return out;
  },
  // a room that would be built dark is not paid for on the first drop: the second identical drop confirms (a toast says why in between)
  darkGuard(app, card, uid, tgt) {
    const run = S.run;
    if (!K.wouldBuildDark(run, card)) return true;
    const k = darkKey(uid, tgt);
    if (S.darkOk === k) return true;
    S.darkOk = k; sfx(app, 'error');
    const pw = WD.wardPower(run);
    this.toast(`No spare power (${pw.used} of ${pw.cap}): the ${ROOMS[card.room].name} would be built dark and the cost is paid either way. Drop it again to build it anyway, or switch a room off first.`);
    return false;
  },
  legalTargets(run, inst, card) {
    const w = run.ward, cells = [], rooms = [];
    if (card.kind === 'room') { for (const [x, y] of WD.buildCells(run)) if (WD.canBuild(run, inst.uid, x, y).ok) cells.push([x, y]); }
    else if (card.target === 'room') {
      for (const r of Object.values(w.rooms)) if (WD.canPlayBuild(run, inst.uid, r.id).ok) rooms.push(r.id);
      if (card.effect === 'demolish') for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (w.grid[y][x] === 'rubble' && WD.canPlayBuild(run, inst.uid, { x, y }).ok) cells.push([x, y]);
    }
    return { cells, rooms };
  },
  targetAt(run, card, x, y) {
    const w = run.ward, id = w.grid[y][x];
    if (card.kind === 'room') return { x, y };
    if (card.target === 'room') { if (id === 'rubble' && card.effect === 'demolish') return { x, y }; return id && id !== 'rubble' ? id : undefined; }
    return undefined;
  },

  // ---- actions ----
  play(app, uid, target) {
    const run = S.run, w = run.ward, inst = w.deck.hand.find((c) => c.uid === uid); if (!inst) return false;
    const card = BUILD_CARDS[inst.id], before = { wood: w.res.wood, stone: w.res.stone, hp: run.hp, gold: run.gold };
    S.endArm = 0; S.darkOk = '';
    const r = WD.playBuildCard(run, uid, target);
    S.sel = null; S.drag = null; S.press = null;
    if (!r.ok) { sfx(app, 'error'); this.toast(whyText(run, r.why, card, target)); return false; }
    save(run);
    const red = reduced(app);
    let at = { x: 640, y: 300 };
    if (r.room && w.rooms[r.room]) at = roomCenter(run, r.room); else if (target && typeof target === 'object') at = cellCenter(target.x, target.y);
    if (card.kind === 'room') {
      MEM.stamps[r.room] = S.t;
      sfx(app, 'graftScar'); app.after(red ? 0 : 140, () => sfx(app, 'block', { vol: 0.6 }));
      S.fx.burst(at.x, at.y + 20, 'dust', { n: red ? 4 : 18 }); S.fx.shake(0.25); post(app, 'shockwave', at.x, at.y, 0.25, 500);
      if (!w.rooms[r.room].on) { MEM.darkBuilt[r.room] = 1; this.toast(`The ${ROOMS[card.room].name} is built dark: no spare power. Switch another room off or build a Generator.`); }
      this.relight(app);
    } else if (card.kind === 'upgrade') { MEM.stamps[r.room] = S.t; sfx(app, 'upgrade'); S.fx.burst(at.x, at.y, 'gilded', { n: 14 }); }
    else {
      sfx(app, card.effect === 'demolish' ? 'graftScar' : 'buff');
      if (card.effect === 'demolish') S.fx.burst(at.x, at.y, 'dust', { n: 16 });
      const gains = [];
      if (w.res.wood > before.wood) gains.push(`+${w.res.wood - before.wood} wood`);
      if (w.res.stone > before.stone) gains.push(`+${w.res.stone - before.stone} stone`);
      if (run.hp > before.hp) gains.push(`+${run.hp - before.hp} HP`);
      const msg = gains.join('  ') || card.name;
      S.fx.float(msg, card.effect === 'demolish' ? at.x : 640, card.effect === 'demolish' ? at.y : 470, { color: COL.lamp, size: 24 });
      this.relight(app);
    }
    return true;
  },
  // power came back (a Generator, a room switched off): the rooms that were built dark, newest first, light up while the power lasts
  relight(app) {
    const run = S.run, w = run.ward, lit = [];
    for (const id of Object.keys(MEM.darkBuilt).reverse()) {
      const r = w.rooms[id];
      if (!r || r.on || !ROOMS[r.type].power) { delete MEM.darkBuilt[id]; continue; }
      if (WD.wardPower(run).free >= ROOMS[r.type].power && WD.togglePower(run, id).ok) { delete MEM.darkBuilt[id]; MEM.bulbs[id] = S.t; lit.push(ROOMS[r.type].name); }
    }
    if (lit.length) { sfx(app, 'buff', { vol: 0.7 }); this.toast(`Power is back: the ${lit.join(' and the ')} ${lit.length > 1 ? 'are' : 'is'} lit.`); }
  },
  power(app, room) {
    const run = S.run, r = WD.togglePower(run, room.id), nm = ROOMS[room.type].name;
    if (!r.ok) {
      sfx(app, 'error');
      this.toast(r.why === 'nopower' ? `The ${nm} needs no power.` : r.why === 'power' ? `Not enough power for the ${nm}. Switch another room off or build a Generator.` : 'Power switches in the morning.');
      return;
    }
    save(run); MEM.bulbs[room.id] = S.t;
    const c = roomCenter(run, room.id);
    if (r.on) { sfx(app, 'buff', { vol: 0.7 }); S.fx.burst(c.x - 26, c.y - 26, 'gilded', { n: 6 }); this.toast(`The ${nm} is lit again. Its timer runs.`); }
    else { sfx(app, 'debuff', { vol: 0.7 }); this.toast(`Lights out in the ${nm}: its timer pauses, what is inside sleeps, and walking through costs 3 HP.`); }
  },
  endMorning(app) {
    const run = S.run, left = K.playablePlans(run).length;
    if (left && !(S.endArm > S.t)) { // plans you could still play are thrown away: ask once
      S.endArm = S.t + 6; sfx(app, 'uiClick');
      this.toast(`${plural(left, 'plan')} you can still play will be discarded. Press End Morning again to walk anyway.`);
      return;
    }
    S.endArm = 0;
    if (!WD.endMorning(run)) return;
    S.sel = null; S.drag = null; save(run);
    sfx(app, 'turnEnd');
  },
  walkTo(app, rid, alt) {
    const run = S.run, w = run.ward, p = WD.pathTo(run, rid, alt);
    if (!p.ok) { sfx(app, 'error'); this.toast(whyText(run, p.why)); return; }
    const start = w.hero.room, cells = p.wait ? [start] : [start, ...p.path];
    const live = p.triggers.filter((t) => !t.bribed && t.kind !== 'rest');
    let stop = cells.length - 1;
    if (live.length) { const k = cells.indexOf(live[0].room, p.wait ? 0 : 1); if (k >= 0) stop = k; }
    MEM.plan = { act: w.act, cells, at: 0, rid, wait: !!p.wait };
    S.selRoom = null; S.alt = 0; S.altFor = null;
    sfx(app, p.wait ? 'restHeal' : 'mapStep');
    if (p.wait) S.fx.float(`+${T.waitHeal} HP`, roomCenter(run, start).x, roomCenter(run, start).y - 30, { color: COL.good, size: 22 });
    this.animate(app, 0, stop, () => {
      MEM.plan.at = stop;
      const hp0 = run.hp;
      const res = WD.startWalk(run, rid, alt);
      save(run);
      if (res === false) { MEM.plan = null; this.toast(whyText(run, w.why)); return; }
      this.afterEngine(app, hp0);
    });
  },
  // dice route: the planned route walks; every room entered activates in order (the engine's afterTrigger continues it)
  goRoute(app) {
    const run = S.run, w = run.ward, rt = (w.route || []).slice();
    if (!rt.length) { sfx(app, 'error'); this.toast(whyText(run, 'empty')); return; }
    const start = w.hero.room, cells = [start, ...rt];
    const live = WD.routeInfo(run, rt).triggers.filter((t) => !t.bribed && t.kind !== 'rest');
    let stop = cells.length - 1;
    if (live.length) { const k = cells.indexOf(live[0].room, 1); if (k >= 0) stop = k; }
    MEM.plan = { act: w.act, cells, at: 0, rid: rt[rt.length - 1], wait: false };
    S.selRoom = null;
    sfx(app, 'mapStep');
    this.animate(app, 0, stop, () => {
      MEM.plan.at = stop;
      const hp0 = run.hp;
      const res = WD.startRoute(run);
      save(run);
      if (res === false) { MEM.plan = null; this.toast(whyText(run, w.why)); return; }
      this.afterEngine(app, hp0);
    });
  },
  // after the engine moved the walk on: show the remaining steps, then open the trigger's screen (or end the walk here)
  afterEngine(app, hp0) {
    const run = S.run, w = run.ward, P = MEM.plan;
    if (run.hp > hp0 + T.waitHeal && P) { const c = roomCenter(run, w.hero.room); S.fx.float(`+${run.hp - hp0} HP`, c.x, c.y - 30, { color: COL.good, size: 24 }); sfx(app, 'restHeal'); }
    const idx = P ? P.cells.indexOf(w.hero.room, P.at) : -1;
    const fin = () => { if (P) P.at = Math.max(P.at, idx); if (run.phase !== 'ward') app.shared.flow.route(); else MEM.plan = null; };
    if (P && idx > P.at) this.animate(app, P.at, idx, fin); else fin();
  },
  toast(text) { S.toast = text; S.toastT = 2.6; },

  // keyboard play: Tab / Shift+Tab move a focus ring over the cells that can take the next action (the targets of the selected plan, or the
  // rooms in the morning; the legal route steps on a walk, the Theatre on the last night), Enter acts on it, Backspace takes a step back
  kbItems() {
    const run = S.run, w = run.ward, out = [], at = (x, y, rid, what) => out.push({ x, y, rid, what });
    if (w.phase === 'morning') {
      const inst = S.sel !== null && S.sel !== undefined ? w.deck.hand.find((c) => c.uid === S.sel) : null, card = inst && BUILD_CARDS[inst.id];
      if (card) { const lg = this.legalTargets(run, inst, card); for (const [x, y] of lg.cells) at(x, y, null, 'build here'); for (const id of lg.rooms) at(w.rooms[id].x, w.rooms[id].y, id, ROOMS[w.rooms[id].type].name); }
      else for (const r of Object.values(w.rooms)) if (ROOMS[r.type].power > 0) at(r.x, r.y, r.id, `${ROOMS[r.type].name}, switch power`);
    } else if (WD.bossForced(run)) { const th = WD.theatreOf(run); if (th) at(th.x, th.y, th.id, 'the Theatre'); }
    else {
      const rt = w.route || [];
      for (const id of WD.legalSteps(run)) { const r = w.rooms[id]; at(r.x, r.y, id, ROOMS[r.type].name); }
      if (rt.length) { const r = w.rooms[rt[rt.length - 1]]; at(r.x, r.y, r.id, `${ROOMS[r.type].name}, take the step back`); }
    }
    return out.sort((a, b) => a.y - b.y || a.x - b.x);
  },
  kbMove(app, dir) {
    const items = this.kbItems(); if (!items.length) { S.kb = -1; return; }
    S.kb = S.kb === undefined || S.kb < 0 ? (dir > 0 ? 0 : items.length - 1) : (S.kb + dir + items.length) % items.length;
    const it = items[S.kb]; sfx(app, 'uiClick', { vol: 0.5 });
    if (app.announce) app.announce(`${it.what}, ${'ABCDEFGHI'[it.x]}${it.y + 1}. ${S.kb + 1} of ${items.length}.`);
  },
  kbActivate(app) {
    const run = S.run, w = run.ward, items = this.kbItems(), it = items[S.kb];
    if (!it) return false;
    if (w.phase === 'morning') {
      const inst = S.sel !== null && S.sel !== undefined ? w.deck.hand.find((c) => c.uid === S.sel) : null, card = inst && BUILD_CARDS[inst.id];
      if (card) { const tgt = this.targetAt(run, card, it.x, it.y); if (tgt !== undefined && this.darkGuard(app, card, inst.uid, tgt)) this.play(app, inst.uid, tgt); }
      else if (it.rid) this.power(app, w.rooms[it.rid]);
    } else if (WD.bossForced(run)) this.walkTo(app, it.rid, 0);
    else {
      const rt = w.route || [];
      if (S.dieRolling) return true;
      if (rt.length && rt[rt.length - 1] === it.rid) { WD.undoRoute(run); sfx(app, 'uiClick'); }
      else { const r = WD.extendRoute(run, it.rid); if (r.ok) sfx(app, 'mapStep'); else { sfx(app, 'error'); this.toast(whyText(run, r.why)); } }
      save(run);
    }
    return true;
  },
  drawKb(app) {
    if (S.kb === undefined || S.kb < 0 || S.walk || S.banner) return;
    const items = this.kbItems(); if (!items.length) { S.kb = -1; return; }
    if (S.kb >= items.length) S.kb = items.length - 1;
    const it = items[S.kb];
    ISO.drawFocus(this.host(app), it.x, it.y);
  },
  onKey(app, e) {
    if (app.blocked || S.walk || S.banner) return;
    const run = S.run, w = run.ward, k = e.key;
    if (k === 'Tab') { this.kbMove(app, e.shiftKey ? -1 : 1); return; }
    if (k === 'Enter' && S.kb >= 0) { if (this.kbActivate(app)) return; }
    if ((k === 'Backspace' || k === 'z' || k === 'Z') && w.phase !== 'morning' && !WD.bossForced(run) && (w.route || []).length) { WD.undoRoute(run); sfx(app, 'uiClick'); save(run); return; }
    if (k === 'Escape' && S.kb >= 0 && S.sel === null && !S.selRoom && !S.drag) { S.kb = -1; app.escBusy = true; return; }
    if (k === 'Escape' && (S.sel !== null || S.selRoom || S.drag)) { S.sel = null; S.selRoom = null; S.drag = null; app.escBusy = true; }
    else if (k === 'Enter' && w.phase === 'morning') this.endMorning(app);
    else if (k === 'Enter' && S.selRoom) this.walkTo(app, S.selRoom, S.alt);
    else if (k >= '1' && k <= '5' && w.phase === 'morning') { const c = w.deck.hand[+k - 1]; if (c) { S.sel = S.sel === c.uid ? null : c.uid; S.kb = -1; } }
    else if ((k === 'p' || k === 'P') && !S.plans) S.plans = true;
    else if (k === 'c' || k === 'C') ISO.camRecenter();
  },

  // ---- the isometric map: ground, rooms (back to front), actors, ghost, tooltip of the hovered room ----
  host(app) {
    const run = S.run;
    const H = S.host || (S.host = { app, run, S, MEM, reduced: false, buildAge, bossLine, TRIG, stepS: STEP_S, glows: [], buildable: new Set(), bossOpen: false });
    H.app = app; H.run = run; H.reduced = reduced(app); H.bossOpen = WD.bossOpen(run); H.bossForced = WD.bossForced(run);
    return H;
  },
  drawRooms(app, inter) {
    const run = S.run, w = run.ward, H = this.host(app), g = app.ctx;
    H.buildable.clear(); if (w.phase === 'morning') for (const [x, y] of WD.buildCells(run)) H.buildable.add(x + ',' + y);
    S.heroRec = ISO.drawWorld(H, inter);
    // spawn pop: a ring and a burst when a new arrival lands
    for (const r of Object.values(w.rooms)) {
      const pt = MEM.pops[r.id]; if (pt === undefined || S.t < pt) continue;
      const k = (S.t - pt) / 0.5;
      if (k >= 1) { delete MEM.pops[r.id]; continue; }
      const cc = cellCenter(r.x, r.y);
      g.save(); g.strokeStyle = rgba(COL.scar, 1 - k); g.lineWidth = lnw('bold'); g.beginPath(); g.ellipse(cc.x, cc.y, (10 + 30 * EASE.out(k)) * ISO.CAM.z, (10 + 30 * EASE.out(k)) * ISO.CAM.z / 2, 0, 0, Math.PI * 2); g.stroke(); g.restore();
      if (!MEM.pops['_b' + r.id]) { MEM.pops['_b' + r.id] = 1; S.fx.burst(cc.x, cc.y - 10, 'spark', { n: 8 }); }
    }
    ISO.drawLoading(H);
  },

  // ---- the room card: name, power, spawn timer, what is inside, anchored beside the hovered room and kept on the map panel ----
  roomCard(app) {
    const run = S.run, w = run.ward, r = S.hoverRoom && !app.blocked && !S.drag ? w.rooms[S.hoverRoom] : null;
    if (!r) return;
    const g = app.ctx, d = ROOMS[r.type], tint = K.ROOM_TINT[r.type] || '#8a7a5c', b = ISO.roomBox(w, r.x, r.y), CWd = 208, X0 = 10;
    const every = WD.everyOf(r), body = roomTip(run, r), bo = { size: 13, ui: true, color: 'rgba(232,220,196,.85)', fit: { w: CWd - 2 * X0, lines: 7, soft: true } }, Lb = app.layoutText(body, bo);
    const hasBar = every && r.type !== 'rm_theatre', head = 24, barH = hasBar ? 22 : 0, Hh = head + barH + Lb.h + 16;
    let x = b.x + b.w + 6; if (x + CWd > SHEET.x + SHEET.w - 4) x = b.x - CWd - 6;
    x = clamp(x, SHEET.x + 4, SHEET.x + SHEET.w - CWd - 4);
    const y = clamp(b.y + 4, SHEET.y + 4, SHEET.y + SHEET.h - Hh - 4);
    app.reg('ward-roomcard', x, y, CWd, Hh, { overlay: true });
    app.panel(x, y, CWd, Hh, { fill: 'rgba(22,18,16,.96)', r: 8, rivets: false });
    g.save(); g.fillStyle = tint; app.rr(x + 1, y + 6, 3, 14, 1.5); g.fill(); g.restore();
    app.text(K.roomShort(r.type) + (DARKW(r) ? ' (dark)' : ''), x + X0, y + 5, { size: 16, bold: true, color: COL.lamp, fit: { w: CWd - 2 * X0, lines: 1 } });
    let yy = y + head + 2;
    if (hasBar) { // spawn timer: wax bar toward the next spawn
      const full = r.contents.length >= WD.capOf(r), k = full ? 1 : clamp((every - r.timers.spawn + 1) / every, 0, 1);
      app.rr(x + X0, yy + 2, CWd - 2 * X0, 8, 4); g.fillStyle = 'rgba(0,0,0,.5)'; g.fill();
      app.rr(x + X0, yy + 2, Math.max(8, (CWd - 2 * X0) * k), 8, 4); g.fillStyle = full ? COL.scar : '#d9b44a'; g.fill();
      yy += barH;
    }
    app.text(body, x + X0, yy, bo);
  },
  // wheel and pinch zoom, drag to pan, C to recenter (the camera is manual after any of them); a pan never counts as a tap or a card drop
  camInput(app) {
    const m = app.mouse, over = ISO.overMap(m.x, m.y);
    if (S.plans || S.banner) { S.panStart = null; return; }
    if (over && m.wheel) { ISO.camZoomBy(Math.exp(-m.wheel * 0.0014), m.x, m.y); m.wheel = 0; }
    if (m.second && !m.p2) m.second = false;
    if (m.second && m.p2 && m.down) { // pinch: the second finger gives the distance
      const d = Math.hypot(m.x - m.p2.x, m.y - m.p2.y);
      if (S.pinchD > 4 && d > 4) ISO.camZoomBy(d / S.pinchD, (m.x + m.p2.x) / 2, (m.y + m.p2.y) / 2);
      S.pinchD = d; S.panning = true; return;
    }
    S.pinchD = 0;
    if (m.pressed && over && !S.drag && !app.blocked) S.panStart = { x: m.x, y: m.y, lx: m.x, ly: m.y };
    if (S.panStart && m.down && !S.drag) {
      if (!S.panning && Math.hypot(m.x - S.panStart.x, m.y - S.panStart.y) > (m.touch ? 12 : 9)) S.panning = true;
      if (S.panning) { ISO.camPanBy(m.x - S.panStart.lx, m.y - S.panStart.ly); S.panStart.lx = m.x; S.panStart.ly = m.y; }
    }
    if (!m.down) { if (S.panning) { m.released = false; m.pressed = false; } S.panning = false; S.panStart = null; }
  },
  camButtons(app) {
    const x = SHEET.x + 8, y = SHEET.y + 8, sz = 40, defs = [['+', () => ISO.camZoomBy(1.3, 640, 306), 'ward-zoom-in'], ['-', () => ISO.camZoomBy(1 / 1.3, 640, 306), 'ward-zoom-out'], ['C', () => ISO.camRecenter(), 'ward-recenter']];
    defs.forEach(([lab, fn, id], i) => {
      const by = y + i * (sz + 4);
      app.reg(id, x, by, sz, sz, { group: 'map-ctl' });
      if (app.button(lab, x, by, sz, sz, { size: 18, fill: id === 'ward-recenter' && ISO.CAM.manual ? '#5a3f10' : undefined, stroke: id === 'ward-recenter' && ISO.CAM.manual ? COL.lamp : undefined })) { fn(); sfx(app, 'uiClick', { vol: 0.5 }); }
      if (app.inRect(x, by, sz, sz)) app.tooltip(id === 'ward-recenter' ? 'Recenter (C)' : id === 'ward-zoom-in' ? 'Zoom in' : 'Zoom out', id === 'ward-recenter' ? 'Frame the rooms you built and the hero again. Wheel or pinch to zoom, drag to pan.' : 'Wheel or pinch also zooms; drag the map to pan.', { color: COL.lamp, anchor: { x, y: by, w: sz, h: sz } });
    });
  },

  // time of day over the whole map: cool morning, plain midday, amber evening, deep blue night with lamp pools (ui/ward_iso.js)
  drawTint(app) { ISO.drawLight(this.host(app)); },

  // ---- the walk preview: a stitched thread across the floors, numbered trigger seals ----
  drawPath(app, path, dest) { ISO.drawThread(this.host(app), path, dest, S.curP); },
  drawHero(app) { // the hero itself is an actor of the room pass; this registers its hit box
    const h = S.heroRec; if (!h) return;
    app.reg('ward-hero', h.x - 14, h.y - h.h - h.bob, 28, h.h + 4, { layer: 'world' });
  },

  // ---- top bar: day, the brass day clock, resources, building deck ----
  topBar(app) {
    const g = app.ctx, run = S.run, w = run.ward;
    // day block
    app.reg('ward-day', 12, 6, 186, 52, { group: 'top-day' });
    app.panel(12, 6, 186, 52, { fill: 'rgba(22,18,16,.94)', r: 8, rivets: false });
    app.text(`DAY ${w.day} of ${w.dayLimit}`, 22, 11, { size: 19, bold: true, color: COL.vellum, engraved: true, fit: { w: 168, lines: 1 } });
    const bl = bossLine(run, false), bc = WD.bossOpen(run) ? '#ff8a96' : 'rgba(232,220,196,.7)';
    app.text(bl, 22, 35, { size: 13, ui: true, bold: WD.bossOpen(run), color: bc, fit: { w: 168, lines: 1 } });
    if (app.inRect(12, 6, 186, 52)) app.tooltip(`${FLOOR[run.act] ? FLOOR[run.act].name : 'The Ward'}, floor ${ROMAN[run.act]}`, `Day ${w.day} of ${w.dayLimit}. ${bossLine(run, true)}`, { color: COL.lamp, anchor: { x: 12, y: 6, w: 186, h: 52 } });
    // clock
    const CX = 206, CWd = 356;
    app.reg('ward-clock', CX, 6, CWd, 52, { group: 'top-clock' });
    app.panel(CX, 6, CWd, 52, { fill: 'rgba(22,18,16,.94)', r: 8, rivets: false });
    const cur = PHASE_ORDER.indexOf(w.phase);
    // brass rail behind the medallions
    g.save(); g.strokeStyle = '#7A5F12'; g.lineWidth = lnw(3); g.beginPath(); g.moveTo(CX + 26, 32); g.lineTo(CX + 26 + 3 * 42, 32); g.stroke(); g.restore();
    PHASE_ORDER.forEach((ph, i) => {
      const mx = CX + 26 + i * 42, my = 32, on = i === cur, past = i < cur;
      g.save();
      if (on) { g.shadowColor = COL.lamp; g.shadowBlur = 14; }
      const rg = g.createRadialGradient(mx - 4, my - 5, 2, mx, my, 18); rg.addColorStop(0, on ? '#fff1b0' : '#d8c27a'); rg.addColorStop(0.6, on ? '#C9A227' : '#8a7230'); rg.addColorStop(1, '#5a4510');
      g.fillStyle = rg; g.beginPath(); g.arc(mx, my, on ? 18 : 15, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      g.strokeStyle = on ? '#fff1b0' : '#3a2a10'; g.lineWidth = lnw(on ? 'bold' : 'fine'); g.stroke();
      g.globalAlpha = past ? 0.45 : 1;
      K.phaseIcon(g, ph, PH_GLYPH[ph], mx, my, on ? 22 : 18, '#2b1e0a', ph === 'night' ? '#cfe0ff' : '#fff1b0');
      g.restore();
    });
    const tx = CX + 26 + 3 * 42 + 26, tw = CX + CWd - tx - 8;
    app.text(PHASES[w.phase].name.toUpperCase(), tx, 10, { size: 17, bold: true, color: COL.lamp, engraved: true, fit: { w: tw, lines: 1 } });
    app.text(PH_SHORT[w.phase], tx, 33, { size: 13, ui: true, color: 'rgba(232,220,196,.8)', fit: { w: tw, lines: 1 } });
    if (app.inRect(CX, 6, CWd, 52)) app.tooltip('The day clock', PHASE_ORDER.map((ph) => `${PHASES[ph].name}${ph === w.phase ? ' (now)' : ''}: ${PHASES[ph].text}`).join('\n'), { color: COL.lamp, terms: [PHASES[w.phase].name], anchor: { x: CX, y: 6, w: CWd, h: 52 } });
    // resources
    const RX = 570, RW = 350;
    app.reg('ward-res', RX, 6, RW, 52, { group: 'top-res' });
    app.panel(RX, 6, RW, 52, { fill: 'rgba(22,18,16,.94)', r: 8, rivets: false });
    const pw = WD.wardPower(run);
    const items = [['wood', w.res.wood, 'Wood'], ['stone', w.res.stone, 'Stone'], ['gold', run.gold, 'Gold']];
    let x = RX + 10;
    for (const [k, n, nm] of items) {
      const iw = k === 'gold' ? 84 : 66;
      K.drawRes(g, k, x + 12, 32, 22);
      app.text(String(n), x + 27, 20, { size: 20, bold: true, color: k === 'gold' ? COL.gold : COL.vellum, fit: { w: iw - 30, lines: 1 } });
      if (app.inRect(x, 6, iw, 52)) app.tooltip(nm, k === 'gold' ? 'The run\'s gold. Some rooms cost gold to build (Isolation 20, Workshop 40).' : `${n} ${k}. Spent on building plans.`, { color: COL.lamp, terms: k === 'gold' ? [] : [nm], anchor: { x, y: 6, w: iw, h: 52 } });
      x += iw;
    }
    // power bulbs
    const bx = x + 4, bw = RX + RW - bx - 8;
    app.text(`POWER ${pw.used}/${pw.cap}`, bx, 9, { size: 11, ui: true, bold: true, color: pw.free < 0 ? COL.bad : 'rgba(232,220,196,.7)', fit: { w: bw, lines: 1 } });
    const nb = Math.max(pw.cap, pw.used), step = Math.min(17, (bw - 4) / Math.max(1, nb));
    for (let i = 0; i < nb; i++) K.drawRes(g, 'bulb', bx + 8 + i * step, 40, Math.min(16, step + 1), i < pw.used);
    if (app.inRect(bx, 6, bw + 8, 52)) app.tooltip('Power', `${pw.used} of ${pw.cap} in use, ${Math.max(0, pw.free)} spare. Each lit bulb is a room drawing power. Tap a room in the morning to switch it off.`, { color: COL.lamp, terms: ['Power', 'Dark room'], anchor: { x: bx, y: 6, w: bw, h: 52 } });
    // building deck: draw / discard and the viewer
    const DX = 928, DW = 192;
    app.reg('ward-plans-box', DX, 6, DW, 52, { group: 'top-plans' });
    app.panel(DX, 6, DW, 52, { fill: 'rgba(22,18,16,.94)', r: 8, rivets: false });
    const d = w.deck;
    app.text('PLANS', DX + 10, 8, { size: 11, ui: true, bold: true, color: 'rgba(232,220,196,.7)', fit: { w: 70, lines: 1 } });
    app.text(`${d.draw.length} draw`, DX + 10, 23, { size: 14, bold: true, color: COL.vellum, fit: { w: 80, lines: 1 } }); app.text(`${d.discard.length} used`, DX + 10, 39, { size: 12, ui: true, color: 'rgba(232,220,196,.6)', fit: { w: 80, h: 16, lines: 1 } });
    if (app.inRect(DX, 6, 92, 52)) app.tooltip('Building plans', `${d.draw.length} to draw, ${d.discard.length} used, ${d.hand.length} in hand. You draw 5 each morning; the used pile is reshuffled when the draw pile runs out.`, { color: COL.lamp, anchor: { x: DX, y: 6, w: 92, h: 52 } });
    if (app.button('View', DX + 96, 12, 88, 40, { size: 17, fit: true })) S.plans = true;
  },

  // ---- left: the patient, their deck, relics, effects today and the ward log ----
  leftPanel(app) {
    const g = app.ctx, run = S.run, w = run.ward, L = LEFT, hero = HEROES[run.hero];
    app.reg('ward-left', L.x, L.y, L.w, L.h, { group: 'left' });
    app.panel(L.x, L.y, L.w, L.h, { fill: 'rgba(22,18,16,.94)', r: 10 });
    const X = L.x + 14, IW = L.w - 28;
    // portrait
    g.save(); g.fillStyle = '#2b2420'; g.beginPath(); g.arc(X + 28, L.y + 40, 28, 0, Math.PI * 2); g.fill(); g.clip(); drawPortrait(g, run.hero, X + 28, L.y + 42, 58); g.restore();
    g.save(); g.strokeStyle = hero ? hero.color : COL.lamp; g.lineWidth = lnw('bold'); g.beginPath(); g.arc(X + 28, L.y + 40, 28, 0, Math.PI * 2); g.stroke(); g.restore();
    app.text(hero ? hero.name : run.hero, X + 66, L.y + 10, { size: 20, bold: true, fit: { w: IW - 66, lines: 1 } });
    // hp bar
    const hy = L.y + 40, hx = X + 66, hw = IW - 66, hh = 20, k = clamp(run.hp / run.maxHp, 0, 1);
    app.rr(hx, hy, hw, hh, hh / 2); g.fillStyle = '#0e0b0a'; g.fill();
    app.rr(hx, hy, Math.max(8, hw * k), hh, hh / 2); g.fillStyle = k < 0.3 ? '#d33' : COL.scar; g.fill();
    app.rr(hx, hy, hw, hh, hh / 2); g.strokeStyle = 'rgba(232,220,196,.5)'; g.lineWidth = lnw('fine'); g.stroke();
    app.text(`${run.hp} / ${run.maxHp}`, hx + hw / 2, hy + 2, { size: 13, ui: true, bold: true, align: 'center', shadow: true, fit: { w: hw - 10, h: hh, lines: 1 } });
    if (app.inRect(hx, hy, hw, hh)) app.tooltip('Health', `Wait in a room to heal ${T.waitHeal}. The Linen Room heals 25%. A new floor heals 50%.`, { terms: ['Linen Room'] });
    // deck + move
    const by = L.y + 78;
    app.reg('ward-deck', X, by, IW, 40, { group: 'left' });
    if (app.button(`Deck (${run.deck.length})`, X, by, IW, 40, { size: 17, fit: true })) app.shared.flow.openDeck();
    let y = by + 50;
    // relics
    app.text('RELICS', X, y, { size: 12, ui: true, bold: true, color: 'rgba(232,220,196,.6)', fit: { w: IW, lines: 1 } }); y += 18;
    const per = 7, cell = Math.floor(IW / per), shown = run.relics.slice(0, per);
    shown.forEach((id, i) => { const cx = X + i * cell + cell / 2, cy = y + 16; drawRelic(g, id, cx, cy, Math.min(28, cell - 4)); if (app.inRect(cx - cell / 2, y, cell, 32) && RELICS[id]) app.tooltip(RELICS[id].name, RELICS[id].text, { color: COL.lamp }); });
    if (!run.relics.length) app.text('None yet.', X, y + 6, { size: 13, ui: true, italic: true, color: 'rgba(232,220,196,.4)', fit: { w: IW, lines: 1 } });
    if (run.relics.length > per) app.text(`+${run.relics.length - per}`, X + IW, y + 34, { size: 12, ui: true, align: 'right', color: 'rgba(232,220,196,.6)', fixed: true });
    y += 50;
    // today
    app.text('TODAY', X, y, { size: 12, ui: true, bold: true, color: 'rgba(232,220,196,.6)', fit: { w: IW, lines: 1 } }); y += 18;
    const eff = [w.phase === 'morning' ? `Dice: d${WD.diceOf(run)} each walk` : `Roll ${(WD.rollOf(run) || {}).n || '?'} of d${WD.diceOf(run)}: ${(WD.rollOf(run) || {}).n || 0} rooms`];
    for (const e of w.effects) eff.push(e.id === 'move' ? `Morning Rounds: +${e.n} to every roll` : e.id === 'rations' ? 'Rations: +1 card a turn' : e.id === 'lamp' ? 'Lamp Oil: dark rooms are free' : e.id === 'bribe' ? 'Bribe: the next trigger is skipped' : e.id);
    for (const t of eff.slice(0, 4)) y += app.text(t, X, y, { size: 13, ui: true, color: COL.vellum, fit: { w: IW, lines: 1 } }) + 2;
    y += 8;
    // log
    S.logTop = y;
    g.save(); g.strokeStyle = 'rgba(232,220,196,.22)'; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(X, y); g.lineTo(X + IW, y); g.stroke(); g.restore();
    y += 8;
    app.text('WARD LOG', X, y, { size: 12, ui: true, bold: true, color: 'rgba(232,220,196,.6)', fit: { w: IW, lines: 1 } }); y += 18;
    const bottom = L.y + L.h - 10, lines = [];
    for (let i = w.log.length - 1; i >= 0 && lines.length < 12; i--) lines.push(w.log[i].replace(/^D\d+ \w+: /, ''));
    for (const ln of lines) {
      const o = { size: 13, ui: true, color: 'rgba(232,220,196,.72)', fit: { w: IW, lines: 2, soft: true } }, Lt = app.layoutText(ln, o);
      if (y + Lt.h > bottom) break;
      app.text(ln, X, y, o); y += Lt.h + 5;
    }
  },

  // ---- right: notes on the hovered room, the plan in hand or the walk ----
  rightPanel(app, inter) {
    const run = S.run, w = run.ward, R = RIGHT, X = R.x + 14, IW = R.w - 28;
    app.reg('ward-right', R.x, R.y, R.w, R.h, { group: 'right' });
    app.panel(R.x, R.y, R.w, R.h, { fill: 'rgba(22,18,16,.94)', r: 10 });
    let y = R.y + 12;
    const head = (t, c) => { y += app.text(t, X, y, { size: 12, ui: true, bold: true, color: c || COL.lamp, fit: { w: IW, lines: 1 } }) + 4; };
    const big = (t, c) => { y += app.text(t, X, y, { size: 22, bold: true, color: c || COL.vellum, fit: { w: IW, lines: 2 } }) + 6; };
    const body = (t, c, lines = 6) => { const o = { size: 14, ui: true, color: c || 'rgba(232,220,196,.82)', fit: { w: IW, h: Math.max(16, R.y + R.h - 10 - y), lines } }; const Lt = app.layoutText(t, o); app.text(t, X, y, o); y += Lt.h + 8; };
    if (w.phase === 'morning') {
      head('MORNING: BUILD');
      const uid = S.drag ? S.drag.uid : S.sel, inst = uid != null ? w.deck.hand.find((c) => c.uid === uid) : null;
      if (inst) {
        const card = BUILD_CARDS[inst.id];
        big(card.name);
        body(card.text, undefined, 5);
        const n = inter.legal ? inter.legal.cells.length + inter.legal.rooms.length : 0;
        const can = WD.canPlayBuild(run, uid, card.kind === 'room' ? { x: -1, y: -1 } : card.target === 'res' ? 'wood' : null);
        if (can.why === 'cost') body(whyText(run, 'cost', card), COL.bad, 2);
        else if (card.target === 'none') body('Tap Play above the card, or drag it onto the plan.', COL.good, 3);
        else if (card.target === 'res') body('Choose wood or stone above the card.', COL.good, 3);
        else body(n ? `${plural(n, 'place')} glow on the plan. ${card.kind === 'room' ? 'A room must share a wall with a room.' : 'Drop it on a glowing room.'}` : 'Nowhere to put it right now.', n ? COL.good : COL.bad, 3);
      } else {
        big('Build your ward');
        body('Drag a plan from your hand onto a glowing cell. Tap a room to switch its power. When you are done, End Morning: three walks follow.', undefined, 7);
        const pw = WD.wardPower(run);
        body(`Power ${pw.used} of ${pw.cap}. Resources: ${w.res.wood} wood, ${w.res.stone} stone, ${run.gold} gold.`, 'rgba(232,220,196,.6)', 3);
      }
      return;
    }
    head(`${PHASES[w.phase].name.toUpperCase()}: WALK`);
    const pv = inter.preview;
    if (WD.bossForced(run) && !(pv && pv.p.ok)) { big('The last night', '#ff8a96'); body('The boss has scrubbed in. Every walk but the Operating Theatre is refused, and the Theatre takes you from wherever you stand. Choose it to begin.', undefined, 7); return; }
    if (pv && pv.p.ok) {
      const p = pv.p, dest = w.rooms[pv.rid];
      big(pv.route ? `Route: ${p.path.length} of ${p.n} steps` : p.wait ? 'Wait here' : `To the ${ROOMS[dest.type].name}`);
      body(walkSummary(run, p, pv.rid) + '.', COL.vellum, 4);
      let n = 0;
      for (const t of p.triggers.slice(0, 5)) {
        const label = t.bribed ? `${TRIG[t.kind][1]}: the porter looks away` : t.kind === 'fight' ? `${TRIG.fight[1]}: ${plural(t.detail.count, 'monster')}${t.detail.count > T.boardMax ? ' (reinforcements)' : ''}` : t.kind === 'elite' ? `Elite, Level ${t.detail.level}` : t.kind === 'boss' ? (t.detail.early ? 'The boss, early' : 'The boss') : TRIG[t.kind][1];
        if (!t.bribed) n++;
        drawNodeIcon(app.ctx, TRIG[t.kind][0], X + 10, y + 9, 18, t.bribed ? 'locked' : 'available');
        y += app.text(`${t.bribed ? '-' : n}. ${label}`, X + 24, y, { size: 13, ui: true, color: t.bribed ? 'rgba(232,220,196,.45)' : COL.vellum, fit: { w: IW - 24, lines: 1 } }) + 4;
      }
      y += 4;
      if (pv.route) body(p.left > 0 ? `${plural(p.left, 'step')} left. Click the next room, or Go. Click the last step again to undo it.` : 'The roll is spent. Go, or undo the last step.', COL.good, 3);
      if (p.offPenalty) body(`Dark rooms on the way: -${p.offPenalty} HP.`, COL.bad, 2);
      if (p.wait) body(`Heal ${T.waitHeal}.` + (p.triggers.length ? ' What is here triggers.' : ''), COL.good, 2);
      const mods = []; const ph = PHASES[w.phase];
      if (p.triggers.some((t) => t.kind === 'fight' || t.kind === 'elite')) { if (ph.goldMul) mods.push(`fights pay +${Math.round((ph.goldMul - 1) * 100)}% gold`); if (ph.firstTurnDraw) mods.push('+1 card on the first turn'); if (ph.enemyStr) mods.push(`monsters +${ph.enemyStr} Strength, elites +${ph.eliteStr}`); }
      if (mods.length) body(PHASES[w.phase].name + ': ' + mods.join(', ') + '.', '#e0c27a', 3);
      if (p.triggers.some((t) => t.kind === 'boss' && t.detail.early)) body('Early boss: HP x0.85, +60 gold, a free uncommon or rare plan and one more graft pick.', COL.lamp, 3);
      return;
    }
    big(PHASES[w.phase].name);
    { const r = WD.rollOf(run); body(WD.bossForced(run) ? 'Choose the Theatre.' : `You rolled ${r ? r.n : '?'}. ${app.mouse.touch ? 'Tap' : 'Click'} the rooms next to you one by one to plan a route of up to ${r ? r.n : '?'} steps. Every room you enter triggers in order. Then press Go.`, undefined, 7); }
    if (app.scale >= 0.95) body(PHASES[w.phase].text, '#e0c27a', 4);
  },

  // ---- bottom right: End Morning, Walk, Other route, Wait ----
  actions(app, inter) {
    const run = S.run, w = run.ward, A = ACT;
    app.reg('ward-act', A.x, A.y, A.w, A.h, { group: 'act' });
    if (w.phase === 'morning') {
      const hy = A.y + 8, bh = A.h - 16;
      const left = K.playablePlans(run).length, armed = S.endArm > S.t;
      const sub = armed ? 'Click again to confirm' : left ? `Discards ${plural(left, 'plan')}` : w.deck.hand.length ? `${plural(w.deck.hand.length, 'plan')} unplayed` : 'Walks follow';
      if (app.button(armed ? `Discard ${plural(left, 'plan')}?` : 'End Morning', A.x, hy, A.w, bh, { size: 26, sub, fill: armed ? '#6a1a22' : '#5a3f10', stroke: armed ? COL.scar : COL.lamp, color: '#ffe9a8', fit: true, key: 'e' })) this.endMorning(app);
      return;
    }
    const forced = WD.bossForced(run), bh = 46;
    if (forced) {
      const pv = inter.preview, sel = S.selRoom && pv && pv.rid === S.selRoom && pv.p.ok ? pv : null;
      if (app.button(sel ? 'Enter the Theatre' : 'Enter the Theatre', A.x, A.y + 48, A.w, bh + 4, { size: 20, fill: '#5a1a22', stroke: COL.scar, fit: true })) this.walkTo(app, WD.theatreOf(run).id, 0);
    } else {
      const rt = w.route || [], r = WD.rollOf(run);
      const goLabel = rt.length ? `Go: ${plural(rt.length, 'step')}` : 'Plan a route';
      if (app.button(goLabel, A.x, A.y, A.w, bh + 4, { size: 20, disabled: !rt.length || !!S.dieRolling, fill: rt.length ? '#5a1a22' : undefined, stroke: COL.scar, fit: true, key: 'g' })) this.goRoute(app);
      if (r && r.lucky && !rt.length) { if (app.button('Lucky Roll: roll again', A.x, A.y + 54, A.w, 40, { size: 15, fit: true })) { WD.rerollWalk(run); MEM.dieKey = WD.rollOf(run).key; this.startDie(app); save(run); } }
      else if (app.button(`Undo step (${rt.length} of ${r ? r.n : 0})`, A.x, A.y + 54, A.w, 40, { size: 16, disabled: !rt.length, fit: true })) { WD.undoRoute(run); sfx(app, 'uiClick'); save(run); }
    }
    const wp = WD.pathTo(run, w.hero.room);
    const busyRoute = !!(w.route && w.route.length), ww = A.w - 114;
    if (app.button(`Wait +${T.waitHeal} HP`, A.x, A.y + 108, ww, bh, { size: 16, disabled: !wp.ok || busyRoute, fit: true })) this.walkTo(app, w.hero.room, 0);
    if (!wp.ok && app.inRect(A.x, A.y + 108, ww, bh)) app.tooltip('Wait here', whyText(run, wp.why), { color: COL.bad });
    // a quiet day: wait out every walk phase that is left today (heal each time); it stops at once if anything opens or the morning comes
    if (!forced) {
      if (app.button('Rest day', A.x + ww + 6, A.y + 108, A.w - ww - 6, bh, { size: 15, disabled: !wp.ok || busyRoute || !!S.dieRolling, fit: true, key: 'r' })) { S.rest = true; S.restT = 0; }
      if (app.inRect(A.x + ww + 6, A.y + 108, A.w - ww - 6, bh)) app.tooltip('Rest of the day', `Wait here for every walk left today (heal ${T.waitHeal} each), then it is morning. Stops if something in this room opens.`, { color: COL.lamp, anchor: { x: A.x, y: A.y + 108, w: A.w, h: bh } });
    }
  },

  // ---- the building hand (morning) ----
  hand(app, inter) {
    const g = app.ctx, run = S.run, w = run.ward, m = app.mouse, cards = w.deck.hand, rects = handRects(cards.length);
    app.reg('ward-hand', HAND.x, HAND.y, HAND.w, H - HAND.y, { group: 'hand' });
    if (!cards.length) { app.text('No plans left in hand. End the morning when ready.', 640, HAND.y + 60, { size: 17, italic: true, align: 'center', color: 'rgba(232,220,196,.6)', fit: { w: HAND.w - 40, lines: 2 } }); return; }
    // press, drag, release
    let hov = -1;
    if (!app.blocked) for (let i = rects.length - 1; i >= 0; i--) { const r = rects[i]; if (m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= H) { hov = i; break; } }
    if (!app.blocked && m.pressed && hov >= 0 && !S.drag) S.press = { uid: cards[hov].uid, x: m.x, y: m.y };
    if (S.press && m.down && !S.drag && Math.hypot(m.x - S.press.x, m.y - S.press.y) > (m.touch ? 10 : 8)) { S.drag = { uid: S.press.uid, moved: true, x: m.x, y: m.y }; S.sel = null; sfx(app, 'cardDraw', { vol: 0.4 }); }
    if (S.drag) { S.drag.x = m.x; S.drag.y = m.y; if (!m.down && !m.released) { S.drag = null; S.press = null; } }
    if (m.released && S.press && !S.drag && hov >= 0 && cards[hov].uid === S.press.uid && !app.blocked) { // a tap: select / deselect
      S.sel = S.sel === S.press.uid ? null : S.press.uid; S.press = null; m.released = false; sfx(app, 'uiClick');
    }
    if (m.released && S.drag) { /* released off the plan: back to the hand */ S.drag = null; S.press = null; sfx(app, 'uiBack'); }
    if (!m.down) S.press = null;
    const lifted = S.sel !== null ? cards.findIndex((c) => c.uid === S.sel) : -1;
    cards.forEach((c, i) => {
      const card = BUILD_CARDS[c.id], r = rects[i];
      const lift = i === lifted ? 18 : 0;
      app.reg('ward-card' + i, r.x, r.y - lift, r.w, Math.min(r.h, H - r.y) + lift, { group: 'hand' });
      if (S.drag && S.drag.uid === c.uid) { K.drawBuildCard(app, card, r.x, r.y, r.w, r.h, { alpha: 0.25, run }); return; }
      if (i === hov && i !== lifted) return;
      if (i === lifted) { K.drawBuildCard(app, card, r.x, r.y - 18, r.w, r.h, { run, sel: true, dark: K.wouldBuildDark(run, card) }); this.selButtons(app, c, card, r.x - 30, r.y - 70, r.w + 60); return; }
      const can = WD.canPlayBuild(run, c.uid, card.kind === 'room' ? { x: -1, y: -1 } : null).why !== 'cost';
      K.drawBuildCard(app, card, r.x, r.y, r.w, r.h, { run, dim: !can, dark: can && K.wouldBuildDark(run, card) });
    });
    // the hovered or selected card, enlarged above the hand
    const big = hov >= 0 && hov !== lifted && !S.drag ? hov : -1; // the selected plan stays put (its text is in the notes on the right), so its buttons never jump
    if (big >= 0) {
      const c = cards[big], card = BUILD_CARDS[c.id], r = rects[big], k = 1.5, bw = CW * k, bh = CH * k;
      const bx = clamp(r.x + r.w / 2 - bw / 2, SHEET.x, SHEET.x + SHEET.w - bw), by = H - bh - 6;
      app.reg('ward-card-big', bx, by, bw, bh, { overlay: true });
      K.drawBuildCard(app, card, bx, by, bw, bh, { full: true, sel: big === lifted, glow: true, run, dark: K.wouldBuildDark(run, card) });
      const cant = WD.canPlayBuild(run, c.uid, card.kind === 'room' ? { x: -1, y: -1 } : null);
      if (cant.why === 'cost') app.text(whyText(run, 'cost', card), bx + bw / 2, by - 24, { size: 14, ui: true, bold: true, align: 'center', color: COL.bad, stroke: '#1a1614', strokeW: 3, fit: { w: 320, lines: 1 } });
    }
    // dragged card follows the pointer, a little above the finger
    if (S.drag) {
      const c = cards.find((h) => h.uid === S.drag.uid);
      if (c) { const k = 0.7, dw = CW * k, dh = CH * k, oy = m.touch ? 70 : 10; g.save(); g.translate(S.drag.x, S.drag.y - oy); g.rotate(Math.sin(S.t * 3) * 0.02); K.drawBuildCard(app, BUILD_CARDS[c.id], -dw / 2, -dh / 2, dw, dh, { glow: true, alpha: 0.92 }); g.restore(); }
    }
  },
  selButtons(app, inst, card, x, y, w) {
    const run = S.run;
    S.selZone = card.target === 'none' || card.target === 'res' ? { x: x + w / 2 - 146, y, w: 292, h: 44 } : null;
    if (card.target === 'none') { app.reg('ward-play', x + w / 2 - 70, y, 140, 44, { overlay: true }); if (app.button('Play', x + w / 2 - 70, y, 140, 44, { size: 20, fill: '#4a3a1d', stroke: COL.lamp })) this.play(app, inst.uid, null); }
    else if (card.target === 'res') {
      app.reg('ward-res-pick', x + w / 2 - 140, y, 280, 44, { overlay: true });
      if (app.button(`+${card.n} wood`, x + w / 2 - 140, y, 134, 44, { size: 18, fit: true })) this.play(app, inst.uid, 'wood');
      if (app.button(`+${card.n} stone`, x + w / 2 + 6, y, 134, 44, { size: 18, fit: true })) this.play(app, inst.uid, 'stone');
    }
    void run;
  },

  // ---- bottom strip during the walk phases ----
  walkStrip(app) {
    const g = app.ctx, run = S.run, w = run.ward, B = HAND;
    app.reg('ward-strip', B.x, B.y, B.w, B.h - 8, { group: 'strip' });
    app.panel(B.x, B.y, B.w, B.h - 8, { fill: 'rgba(22,18,16,.94)', r: 10 });
    K.phaseIcon(g, w.phase, PH_GLYPH[w.phase], B.x + 46, B.y + 46, 46, '#e8d6b0', w.phase === 'night' ? '#cfe0ff' : COL.lamp);
    const tO = { size: 28, bold: true, color: COL.lamp, engraved: true, fit: { w: 300, lines: 1 } }, tL = app.layoutText(`${PHASES[w.phase].name} walk`, tO);
    app.text(`${PHASES[w.phase].name} walk`, B.x + 90, B.y + 10, tO);
    const legY = B.y + B.h - 8 - 36, ty = B.y + 14 + tL.size;
    app.text(PHASES[w.phase].text, B.x + 90, ty, { size: 14, ui: true, color: 'rgba(232,220,196,.8)', fit: { w: B.w - 220, h: legY - ty - 2, lines: 3, soft: true } });
    this.drawDie(app, B.x + B.w - 112, B.y + 12, 88);
    // legend: what each trigger seal means
    const kinds = ['fight', 'elite', 'event', 'shop', 'forge', 'boss'], lw0 = (B.w - 40) / kinds.length;
    kinds.forEach((kd, i) => {
      const lx = B.x + 20 + i * lw0, ly = legY + 4;
      drawNodeIcon(g, kd, lx + 12, ly + 12, 22, 'available');
      app.text(app.scale < 0.8 ? TRIG_SHORT[kd] : TRIG[kd][1], lx + 28, ly + 4, { size: 13, ui: true, color: 'rgba(232,220,196,.75)', fit: { w: lw0 - 32, lines: 1 } });
    });
  },

  // the engraved die: tumbles for a moment when rolled (instant with reduced motion), then keeps the result in view
  drawDie(app, x, y, sz) {
    const g = app.ctx, run = S.run, w = run.ward, r = w.route && w.phase !== 'morning' && !WD.bossForced(run) ? WD.rollOf(run) : null;
    if (!r) return;
    app.reg('ward-die', x, y, sz, sz, { group: 'strip' });
    const roll = S.dieRolling > 0, face = roll ? 1 + Math.floor(S.t * 22) % r.sides : r.n;
    const k = roll ? S.dieRolling : 0, wob = roll ? Math.sin(S.t * 30) * 0.22 * Math.min(1, k * 2) : 0;
    g.save(); g.translate(x + sz / 2, y + sz / 2 - (roll ? Math.abs(Math.sin(S.t * 14)) * 10 * Math.min(1, k * 2) : 0)); g.rotate(wob);
    app.rr(-sz / 2 + 4, -sz / 2 + 4, sz - 8, sz - 8, 12);
    const gr = g.createLinearGradient(-sz / 2, -sz / 2, sz / 2, sz / 2); gr.addColorStop(0, '#f6ecd4'); gr.addColorStop(1, '#d4c19a');
    g.fillStyle = gr; g.fill(); g.strokeStyle = '#3a2a14'; g.lineWidth = lnw('bold'); g.stroke();
    app.rr(-sz / 2 + 10, -sz / 2 + 10, sz - 20, sz - 20, 8); g.strokeStyle = 'rgba(58,42,20,.35)'; g.lineWidth = 1; g.stroke();
    g.restore();
    app.text(String(face), x + sz / 2, y + sz / 2 - 20, { size: 36, bold: true, align: 'center', color: '#2a1c0c', fixed: true });
    app.text(`d${r.sides}${!roll && r.bonus ? ' +' + r.bonus : ''}`, x + sz / 2, y + sz - 20, { size: 12, ui: true, bold: true, align: 'center', color: '#5a3f10', fixed: true });
    if (app.inRect(x, y, sz, sz)) app.tooltip('The die', `Rolled ${r.n} (d${r.sides}${r.bonus ? `, +${r.bonus} today` : ''}). That is the longest route you can plan this phase.`);
  },
  startDie(app) { startDie(app); },
  drawChip(app, chip) {
    const g = app.ctx, o = { size: 15, ui: true, bold: true, fit: { w: 360, lines: 3 } }, L = app.layoutText(chip.text, o);
    const w = L.w + 20, h = L.h + 12;
    let x = chip.x + 18, y = chip.y - h - 14;
    if (x + w > W - 8) x = chip.x - w - 18;
    x = clamp(x, 8, W - w - 8); y = clamp(y, 64, H - h - 8);
    app.reg('ward-chip', x, y, w, h, { overlay: true });
    g.save(); app.rr(x, y, w, h, 8); g.fillStyle = chip.bad ? 'rgba(60,10,16,.95)' : 'rgba(30,26,10,.95)'; g.fill(); g.strokeStyle = chip.bad ? COL.bad : COL.lamp; g.lineWidth = lnw('fine'); g.stroke(); g.restore();
    app.text(chip.text, x + 10, y + 6, { ...o, color: chip.bad ? '#ffc0c0' : '#ffe9a8' });
  },
  drawToast(app) {
    const g = app.ctx, a = clamp(S.toastT * 3, 0, 1), o = { size: 16, ui: true, bold: true, align: 'center', fit: { w: 620, lines: 2 } }, L = app.layoutText(S.toast, o);
    const w = Math.min(660, L.w + 40), h = L.h + 18, x = 640 - w / 2, y = SHEET.y + SHEET.h - h - 14;
    app.reg('ward-toast', x, y, w, h, { overlay: true });
    g.save(); g.globalAlpha = a; app.rr(x, y, w, h, 10); g.fillStyle = 'rgba(22,14,12,.95)'; g.fill(); g.strokeStyle = COL.lamp; g.lineWidth = lnw('fine'); g.stroke(); g.restore();
    app.text(S.toast, 640, y + 9, { ...o, color: COL.vellum, alpha: a });
  },
  drawTransition(app) {
    const tr = S.trans; if (!tr || reduced(app)) return;
    const g = app.ctx, k = clamp(tr.t / tr.dur, 0, 1), s = SHEET;
    g.save(); app.rr(s.x, s.y, s.w, s.h, 6); g.clip();
    if (tr.kind === 'morning') { // dawn wipe: a band of light crosses the plan
      const bx = s.x - 200 + (s.w + 400) * EASE.inOut(k);
      const gr = g.createLinearGradient(bx - 160, 0, bx + 160, 0); gr.addColorStop(0, 'rgba(255,240,200,0)'); gr.addColorStop(0.5, `rgba(255,236,180,${0.5 * (1 - k * 0.5)})`); gr.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = gr; g.fillRect(s.x, s.y, s.w, s.h);
    }
    g.restore();
    // phase name sweeps across the sheet
    const a = k < 0.2 ? k / 0.2 : k > 0.75 ? (1 - k) / 0.25 : 1;
    const label = tr.kind === 'morning' ? `Day ${S.run.ward.day}: Morning` : PHASES[tr.kind].name;
    app.text(label, 640, SHEET.y + SHEET.h / 2 - 34, { size: 52, bold: true, align: 'center', color: tr.kind === 'night' ? '#dce8ff' : '#fff1c8', stroke: 'rgba(20,14,10,.85)', strokeW: 6, alpha: a, fit: { w: 680, lines: 1 } });
  },
  drawBanner(app) {
    const g = app.ctx, b = S.banner, t = b.t, F = FLOOR[b.act] || FLOOR[1];
    const a = t < 0.35 ? t / 0.35 : t > 2.0 ? clamp(1 - (t - 2.0) / 0.6, 0, 1) : 1;
    g.save(); g.globalAlpha = a * 0.78; g.fillStyle = '#0a0807'; g.fillRect(0, 0, W, H); g.globalAlpha = a;
    const cy = 330, slide = (1 - EASE.out(clamp(t / 0.7, 0, 1))) * 60;
    app.reg('ward-banner', 0, cy - 90, W, 180, { overlay: true });
    g.fillStyle = 'rgba(22,18,16,.95)'; g.fillRect(0, cy - 90, W, 180);
    g.strokeStyle = COL.scar; g.lineWidth = lnw(3); g.setLineDash([14, 9]); g.beginPath(); g.moveTo(0, cy - 88); g.lineTo(W, cy - 88); g.moveTo(0, cy + 88); g.lineTo(W, cy + 88); g.stroke(); g.setLineDash([]);
    g.restore();
    app.text('FLOOR ' + ROMAN[b.act], 640 - slide, cy - 70, { size: 22, ui: true, bold: true, align: 'center', color: COL.lamp, alpha: a });
    app.text(F.name, 640 + slide, cy - 42, { size: 60, bold: true, align: 'center', color: COL.vellum, shadow: true, alpha: a, fit: { w: 1000, lines: 1 } });
    app.text(`${F.days} days to build. The boss arrives on the last night.`, 640, cy + 34, { size: 20, italic: true, align: 'center', color: 'rgba(232,220,196,.75)', alpha: a, fit: { w: 1000, lines: 1 } });
    if ((app.mouse.pressed || app.mouse.released) && t > 0.15) { b.t = Math.max(b.t, 2.0); app.mouse.released = false; }
  },

  // first-time tips, in the quiet lower half of the left panel (the log), never over the plan or the hand
  tips(app) {
    const run = S.run, w = run.ward, top = Math.max(S.logTop || 400, 300);
    const TIPO = { pos: { x: LEFT.x + 4, y: top }, w: LEFT.w - 8, maxBottom: LEFT.y + LEFT.h, fallback: { pos: { x: LEFT.x + 4, y: 140 }, w: LEFT.w - 8, maxBottom: LEFT.y + LEFT.h } };
    if (w.phase === 'morning') {
      const rr = handRects(w.deck.hand.length);
      if (rr.length && maybeTip(app, 'ward_build', rr[0].x + 30, rr[0].y + 20, 'Morning: drag a building plan onto a glowing cell. A room must share a wall with a room. The cost is on the card: wood, stone, gold.', TIPO)) return;
      if (maybeTip(app, 'ward_power', 806, 40, 'Every lit room uses power (the bulbs, top). Tap a room to switch it off: its timer pauses, and walking through it costs 3 HP. Generators add power.', TIPO)) return;
      const tr = Object.values(w.rooms).find((r) => WD.everyOf(r) && r.type !== 'rm_theatre');
      if (tr) { const c = cellCenter(tr.x, tr.y); if (maybeTip(app, 'ward_timers', c.x - ISO.TW * 0.3, c.y - 6, 'The ring on a room counts the days to its next spawn. A Ward gains a monster every day, up to 5. Isolation grows an elite, the Chapel an event.', TIPO)) return; }
    } else {
      const hc = roomCenter(run, w.hero.room);
      if (maybeTip(app, 'ward_walk', hc.x + 20, hc.y + 18, 'Your die sets how far you can go. Click the rooms next to you one by one to draw a red thread (click the last step to undo), then press Go. Every room on it with something inside triggers, in order.', TIPO)) return;
      maybeTip(app, 'ward_phases', 320, 32, 'A day: Morning builds, then three walks, each starting with a die roll that sets your route length. Midday pays gold, Evening gives you an extra card, Night is dangerous and pays best. The boss comes on the last night.', TIPO);
    }
  },
};
