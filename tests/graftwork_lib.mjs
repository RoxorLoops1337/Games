// Headless app harness for UI smoke tests: a recording fake canvas, no DOM needed.
// Fast path: the common Canvas2D methods are plain own no-ops (no Proxy trap per call); any other name still resolves
// through a Proxy prototype, so unknown methods and unread properties behave exactly as before.
import * as RUN from '../graftwork/engine/run.js';
import * as WD from '../graftwork/engine/ward.js';
import * as CB from '../graftwork/engine/combat.js';
import { canGraft } from '../graftwork/engine/cards.js';
import { ENEMIES } from '../graftwork/data/index.js';
import { BUILD_CARDS } from '../graftwork/data/ward.js';
const CTX_METHODS = ['arc', 'arcTo', 'beginPath', 'bezierCurveTo', 'clearRect', 'clip', 'closePath', 'drawImage', 'ellipse', 'fill', 'fillRect', 'fillText', 'lineTo', 'moveTo', 'putImageData', 'quadraticCurveTo', 'rect', 'resetTransform', 'restore', 'rotate', 'roundRect', 'save', 'scale', 'setLineDash', 'setTransform', 'stroke', 'strokeRect', 'strokeText', 'transform', 'translate'];
export function fakeCtx() {
  const grad = { addColorStop() {} };
  const state = { calls: 0 };
  const fallback = new Proxy({}, {
    get(o, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof k === 'symbol') return undefined;
      return (...a) => { state.calls++; return undefined; };
    },
  });
  const ctx = Object.create(fallback);
  ctx.canvas = null;
  const noop = () => { state.calls++; };
  for (const m of CTX_METHODS) ctx[m] = noop;
  ctx.createLinearGradient = ctx.createRadialGradient = ctx.createPattern = () => grad;
  ctx.measureText = (s) => ({ width: String(s).length * 8 });
  Object.defineProperty(ctx, '__calls', { get: () => state.calls });
  return ctx;
}
export function installDom() {
  globalThis.window = globalThis.window || { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (() => 0);
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  globalThis.document = globalThis.document || { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx(), style: {} }) };
  globalThis.Path2D = globalThis.Path2D || class { constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); } };
}
export async function makeApp(shared = {}) {
  installDom();
  const { createApp } = await import('../graftwork/ui/core.js');
  const canvas = { getContext: () => fakeCtx(), addEventListener() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), width: 1280, height: 720, setPointerCapture() {} };
  const app = createApp(canvas, { shared });
  app.resize();
  return app;
}
export function frames(app, n = 3, dt = 1 / 60) { for (let i = 0; i < n; i++) app.tick(dt); }
export function click(app, x, y) {
  app.mouse.x = x; app.mouse.y = y; app.mouse.pressed = true; app.mouse.down = true; app.tick(1 / 60);
  app.mouse.released = true; app.mouse.down = false; app.tick(1 / 60);
}
export function key(app, k) { app.pressedKeys.push({ key: k, preventDefault() {} }); app.tick(1 / 60); }

// ---------------- Ward helpers: every run is a Ward run ----------------
// Reach a screen the way the game does (wardOpen walks the hero into a room that holds the thing), lay a floor by hand (wardLayout),
// and play a run with a small deterministic player that needs no tools (botStep / botFinish: the saved-run fixtures replay with it).

export const WIN = () => ({ win: true, shattered: [], damageTaken: 0, turns: 3 });
export const LOSS = () => ({ win: false, shattered: [], damageTaken: 0, turns: 3 });
export const actEnemies = (act, kind) => Object.values(ENEMIES).filter((e) => e.act === act && e.kind === kind && !e.summonOnly && !e.minion && !e.noPick && !e.final).map((e) => e.id);

// wipe the floor and lay rooms by hand: spec rows are [type, x, y, contents?]; the first is where the hero stands. A Theatre goes in the far corner.
export function wardLayout(run, spec) {
  const w = run.ward;
  w.grid = Array.from({ length: w.h }, () => Array(w.w).fill(null)); w.rooms = {}; w.nextRoom = 1;
  const ids = [];
  for (const [type, x, y, contents] of spec) { const id = 'r' + w.nextRoom++; w.rooms[id] = { id, type, x, y, on: true, level: 1, timers: { spawn: 3 }, contents: contents || [], upgrades: [] }; w.grid[y][x] = id; ids.push(id); }
  const th = 'r' + w.nextRoom++; w.rooms[th] = { id: th, type: 'rm_theatre', x: 8, y: 5, on: true, level: 1, timers: { spawn: 9 }, contents: [], upgrades: [] }; w.grid[5][8] = th;
  w.grid[0][5] = 'rubble';
  w.hero.room = ids[0]; WD.wardPower(run);
  return ids;
}
// Open a trigger through the Ward: the room that holds it is laid next to the hero and the hero walks in, so run.pending is exactly what a
// real walk makes (phase modifiers, the room, reinforcements, the Dispensary's plans). Returns run.pending.
//   kind: 'fight' | 'elite' | 'boss' | 'event' | 'shop' | 'forge'      o: { enemies: [ids], level, phase, early, event: 'e_id' }
const ROOM_OF = { fight: 'rm_ward', elite: 'rm_isolation', event: 'rm_chapel', shop: 'rm_dispensary', forge: 'rm_workshop' };
export function wardOpen(run, kind, o = {}) {
  const w = run.ward;
  run.phase = 'ward'; run.pending = null; w.walk = null; w.route = []; w.phase = o.phase || 'midday';
  if (kind === 'boss') { // the Theatre: the last night pulls you in; early = walked into from the room beside it while the boss is open
    const [ent] = wardLayout(run, [['rm_entrance', 7, 5]]); void ent;
    w.day = o.early ? w.dayLimit - 1 : w.dayLimit; w.phase = o.early ? (o.phase || 'midday') : 'night';
    return WD.startWalk(run, WD.theatreOf(run).id);
  }
  const ids = o.enemies || (kind === 'elite' ? [actEnemies(run.act, 'elite')[0]] : [actEnemies(run.act, 'normal')[0]]);
  const contents = kind === 'fight' ? ids.map((id) => ({ kind: 'monster', id })) : kind === 'elite' ? [{ kind: 'elite', id: ids[0], age: 0, level: o.level || 1 }] : [{ kind }];
  const [, room] = wardLayout(run, [['rm_entrance', 0, 2], [ROOM_OF[kind], 1, 2, contents]]);
  const p = WD.startWalk(run, room);
  if (kind === 'event' && o.event && p) p.id = o.event;
  return p;
}

// one fight: the first playable card, at the weakest enemy, until nothing can be played
export function botFight(run, maxTurns = 40) {
  const c = CB.newCombat(run, run.pending.enemies, { kind: run.pending.fightKind });
  let guard = 0;
  while (!c.over && c.turn <= maxTurns && guard++ < 3000) {
    let plays = 0;
    while (!c.over && plays++ < 30) {
      if (c.pending) { const p = c.pending, pool = p.kind === 'fetch' ? (p.zone === 'exhaust' ? c.exhaust : c.discard) : c.hand; CB.resolvePending(c, pool.slice(0, p.n).map((k) => k.uid)); continue; }
      const live = c.enemies.filter((e) => !e.dead); if (!live.length) break;
      let i = -1; for (let k = 0; k < c.hand.length && i < 0; k++) if (CB.canPlay(c, k).ok) i = k;
      if (i < 0) break;
      const tgt = live.slice().sort((a, b) => a.hp - b.hp)[0];
      CB.playCard(c, i, CB.specOf(c, c.hand[i]).target === 'enemy' ? c.enemies.indexOf(tgt) : null); c.ev.length = 0;
    }
    if (c.over) break;
    CB.endTurn(c); c.ev.length = 0;
  }
  if (!c.over) { c.over = 'lose'; c.player.hp = 0; }
  const res = CB.finishCombat(c); res.turns = c.turn;
  return res;
}
// one decision of the deterministic player; returns a short tag of what it did. o.deep: a 500 HP patient, healed before every fight (to see the late floors)
export function botStep(run, o = {}) {
  switch (run.phase) {
    case 'ward': {
      const w = run.ward;
      if (w.phase === 'morning') { // every room plan in hand goes on the first cell that takes it
        for (const inst of w.deck.hand.slice()) { if (BUILD_CARDS[inst.id].kind !== 'room') continue; for (const [x, y] of WD.buildCells(run)) if (WD.playBuildCard(run, inst.uid, { x, y }).ok) break; }
        WD.endMorning(run); return 'morning';
      }
      if (WD.bossForced(run)) { WD.startWalk(run, WD.theatreOf(run).id); return 'boss'; }
      WD.rollOf(run);
      for (let k = 0; k < 16; k++) { const st = WD.legalSteps(run); if (!st.length) break; WD.extendRoute(run, st[0]); }
      if (run.ward.route.length) WD.startRoute(run); else WD.startWalk(run, w.hero.room);
      return 'walk';
    }
    case 'combat': { if (o.deep) run.hp = run.maxHp = Math.max(run.maxHp, 500); RUN.resolveFight(run, botFight(run)); return 'fight'; }
    case 'reward': {
      const rw = run.pending; RUN.claimGold(run, rw);
      if (rw.relic) RUN.addRelic(run, rw.relic);
      if (rw.relicChoices && rw.relicChoices[0]) RUN.addRelic(run, rw.relicChoices[0]);
      if (rw.potion) RUN.addPotion(run, rw.potion);
      if (rw.buildChoice) WD.takeBuildChoice(run, rw.buildChoice[0]);
      RUN.afterReward(run); return 'reward';
    }
    case 'graft': {
      const of = run.pending.offer; let pick = null;
      if ((run.stats.grafts + run.stats.skips) % 2 === 0) for (const uid of of.cards) for (const gid of of.grafts) if (!pick && canGraft(RUN.findInst(run, uid), gid)) pick = [uid, gid];
      if (pick) RUN.applyGraft(run, pick[0], pick[1]); else RUN.skipGraft(run, 'budget');
      RUN.afterGraft(run); return 'graft';
    }
    case 'shop': {
      const s = run.pending;
      for (let i = 0; i < s.potions.length; i++) RUN.shopBuy(run, 'potion', i);
      if (s.builds && s.builds[0]) RUN.shopBuy(run, 'build', 0);
      RUN.advance(run); return 'shop';
    }
    case 'forge': RUN.forgeAct(run, run.hp < run.maxHp * 0.7 ? 'rest' : 'expand'); RUN.advance(run); return 'forge';
    case 'event': {
      const ch = RUN.eventChoices(run).filter((c) => c.ok && (!c.pick || c.cards.length)), c = ch.find((x) => !x.pick) || ch[0];
      RUN.eventChoose(run, c.i, c.cards ? c.cards[0] : undefined); RUN.afterEvent(run); return 'event';
    }
    default: throw new Error('stuck in phase ' + run.phase);
  }
}
export const runEnded = (run) => run.phase === 'dead' || run.phase === 'won';
// play to the end; each(run) is called before every decision. Returns the number of decisions.
export function botFinish(run, o = {}, each = null) {
  let n = 0;
  while (!runEnded(run)) { if (n++ > 4000) throw new Error('run did not end'); if (each) each(run); botStep(run, o); }
  return n;
}
