// Midnight Mog battle screen: runs sim/battle.js on a fixed 1/30 step with render interpolation, draws the world, units, fx and
// the HUD, takes card input (drag to tile, or tap card then tap tile), handles pause, auto-play, speed, boss intro and the result.
//
// Screen contract (see docs/UI.md):   id 'battle'
//   enter(app, params)  params: {district?, stage?, seed?, deck?, modifiers?, rewardMult?, noAdvance?, forceBattle?,
//                                returnTo? ('map'), onDone?(result)}   Echo stages resolve instantly (no sim) unless forceBattle.
//   update(app, dt, ui) / draw(ctx, app, ui) / exit(app)
// Rewards are committed to the profile (app.setProfile + app.save) the moment a win is decided, so closing the tab loses nothing.
import { createBattle, step, drainEvents, playCard, canPlay, cycleHand, battleResult, resolveEcho, isEchoStage, DT } from '../sim/battle.js';
import { stageInfo, toGlobal } from '../sim/progression.js';
import { cardCost } from '../sim/effects.js';
import { CARD_BY_ID } from '../data/cards.js';
import { CAT_BY_ID, CATS } from '../data/cats.js';
import { ENEMY_BY_ID } from '../data/enemies.js';
import { RELIC_BY_ID } from '../data/relics.js';
import { PAL, rgba } from '../palette.js';
import * as WORLD from '../render/world.js';
import * as CATART from '../render/catart.js';
import * as ENEMYART from '../render/enemyart.js';
import * as FXMOD from '../render/fx.js';
import * as ICONS from '../render/icons.js';
import { clamp, hash01 } from './shell.js';
import * as HUD from './hud.js';

const COLS = 8, LANES = 5;
const ATTACK_T = 0.34, CAST_T = 0.5, HIT_T = 0.18, DIE_T = 0.55, MAX_STEPS = 10, AUTO_EVERY = 0.4;
const MINION_CATS = CATS.filter((c) => c.rarity === 'common').map((c) => c.id);
// speed and auto-play survive between battles in one session
const PREF = { speedIdx: 0, auto: false, muted: false };

// ------------------------------------------------------------------------------------------------ auto play
/** Pick the next card for auto-play: {i, arg} or null. Deterministic, reads the battle only. */
export function autoPick(b) {
  const foes = [];
  let nearest = null;
  for (const e of b.enemies) {
    if (e.dead || e.untargetable) continue;
    foes.push(e);
    if (!nearest || e.x < nearest.x) nearest = e;
  }
  const mask = [];
  const free = HUD.placeableMask(b, mask);
  let cats = 0;
  for (const u of b.units) if (!u.dead && u.kind === 'cat') cats++;
  let best = null, bs = -1;
  for (let i = 0; i < b.hand.length; i++) {
    if (!canPlay(b, i)) continue;
    const card = CARD_BY_ID[b.hand[i]];
    if (!card) continue;
    const tg = card.effect.target || 'none', cost = cardCost(b, card);
    let score = -1, arg = null;
    if (card.type === 'summon') {
      if (!free) continue;
      arg = pickTile(b, mask, card, nearest);
      if (!arg) continue;
      score = 10 + cost * 2 + (cats < 3 ? 20 : 0);
    } else if (tg === 'enemy') {
      if (!nearest) continue;
      arg = nearest; score = 6 + cost;
    } else if (tg === 'lane') {
      if (!nearest) continue;
      arg = { lane: nearest.lane }; score = 5 + cost;
    } else if (tg === 'tile') {
      if (!nearest) continue;
      arg = { x: clamp(Math.round(nearest.x), 1, COLS), y: clamp(Math.round(nearest.y), 0, (b.lanes || LANES) - 1) }; score = 4 + cost;
    } else if (card.effect.kind === 'heal') {
      if (b.base.hp > b.base.maxHp * 0.65) continue;
      score = 12;
    } else {
      if (foes.length < 2) continue;
      score = 3 + cost;
    }
    if (score > bs) { bs = score; best = { i, arg }; }
  }
  return best;
}

function pickTile(b, mask, card, nearest) {
  const cat = CAT_BY_ID[card.effect.cat];
  const ranged = cat && cat.base.range >= 2;
  const lanes = b.lanes || LANES;
  let wantLane = nearest ? clamp(Math.round(nearest.y), 0, lanes - 1) : 2;
  if (!nearest) { // emptiest lane
    let m = 1e9;
    for (let l = 0; l < lanes; l++) { let n = 0; for (let c = 0; c < COLS; c++) if (!mask[l * COLS + c]) n++; if (n < m) { m = n; wantLane = l; } }
  }
  const pref = ranged ? 2 : 4;
  let best = null, bs = 1e9;
  for (let l = 0; l < lanes; l++) for (let c = 1; c <= COLS; c++) {
    if (!mask[l * COLS + c - 1]) continue;
    let s = Math.abs(l - wantLane) * 3 + Math.abs(c - pref);
    for (const u of b.units) {
      if (u.dead || u.kind !== 'cat' || u.id !== card.effect.cat || u.merged >= 3 || !u.home) continue;
      if (Math.abs(u.home.x - c) + Math.abs(u.home.y - l) === 1) { s -= 2.5; break; }
    }
    if (s < bs) { bs = s; best = { x: c, y: l }; }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ the screen
export function createBattleScreen() {
  const S = {
    app: null, ui: null, params: null, b: null, L: null, fx: null, ownFx: false, info: null, echo: false, district: 'rooftop_row',
    clock: 0, acc: 0, speedIdx: 0, auto: false, autoAt: 0, paused: false, muted: false,
    sel: -1, drag: null, hoverTile: null, ghost: null, mask: [], placeable: null, cursor: { col: 3, lane: 2 }, kbd: false,
    baseFlash: 0, energyShake: 0, hintText: '', relics: [], cardLevels: {}, inspect: null,
    recs: new Map(), order: [], dying: [], intro: null, bossSeen: {}, overT: 0, result: null, endHandled: false, frame: 0,
    view: { districtId: 'rooftop_row', battle: null, hoverTile: null, placeable: null, ghost: null, baseFlash: 0 },
    ghostObj: { col: 1, lane: 0, kind: 'cat', valid: true, radius: 1 },
  };
  for (let i = 0; i < 48; i++) S.dying.push({ on: false, id: '', side: 'cat', x: 0, y: 0, t0: 0, boss: false });
  const CO = { t: 0, level: 1, stars: 1, anim: 'idle', animT: 0, facing: 1, hitFlash: 0, shield: 0, tint: null };
  const EO = { t: 0, anim: 'walk', animT: 0, hitFlash: 0, shield: 0, phase: 0, seed: 0 };

  // ---- helpers
  const audio = () => (S.app && S.app.audio) || null;
  function sound(name, o) { const a = audio(); if (a && a.sfx && !S.muted) { try { a.sfx(name, o); } catch (e) { /* audio is optional */ } } }
  function layout(ui) {
    if (WORLD.layoutFor) return WORLD.layoutFor(ui.w, ui.h, 'battle');
    const h = ui.h, w = ui.w; // stub: plausible geometry so the screen still runs without world.js
    const tw = w / 11.6, th = Math.min(tw * 2, (h * 0.5) / 5), fy = h * 0.2;
    return {
      w, h, scale: Math.min(tw * 1.4, th * 0.86), tileW: tw, tileH: th, topBar: { x: 0, y: 10, w, h: 52 }, bottomBar: { x: 0, y: h - 72, w, h: 58 },
      handRect: { x: 0, y: h - 72 - 160, w, h: 160 }, field: { x: 0, y: fy, w, h: th * 5 }, safe: { top: 10, bottom: 14 },
      colX: (x) => (x + 1.2) * tw, laneY: (l) => fy + (l + 0.5) * th, footY: (l) => fy + (l + 0.8) * th,
      tile: (c, l) => ({ x: (c - 0.5 + 1.2) * tw, y: fy + l * th, w: tw, h: th, cx: (c + 1.2) * tw, cy: fy + (l + 0.5) * th }),
      toTile: (px, py) => { const c = Math.round(px / tw - 1.2), l = Math.floor((py - fy) / th); return c < 1 || c > COLS || l < 0 || l >= 5 ? null : { col: c, lane: l }; },
      baseRect: { x: 0, y: fy - th, w: tw * 1.7, h: th * 6 },
    };
  }
  function recOf(u) {
    let r = S.recs.get(u.uid);
    if (!r) { r = { u, x0: u.x, y0: u.y, rx: u.x, ry: u.y, atk: -9, cast: -9, hit: -9, burrow: false, seen: 0, born: S.clock }; S.recs.set(u.uid, r); }
    r.u = u;
    return r;
  }
  function recById(uid) { return uid ? S.recs.get(uid) : undefined; }
  function snapshot() {
    const b = S.b;
    for (const u of b.units) { const r = recOf(u); r.x0 = u.x; r.y0 = u.y; }
    for (const u of b.enemies) { const r = recOf(u); r.x0 = u.x; r.y0 = u.y; }
  }

  // ---- events
  function startIntro(id) {
    const e = ENEMY_BY_ID[id];
    const full = e ? e.name : id, comma = full.indexOf(',');
    S.intro = { id, name: comma > 0 ? full.slice(0, comma) : full, sub: comma > 0 ? full.slice(comma + 1).trim() + '. ' + (e ? e.desc : '') : (e ? e.desc : ''), t: 0, dur: 2.4 };
    S.bossSeen[id] = true;
  }
  function addDying(ev) {
    for (let i = 0; i < S.dying.length; i++) {
      const d = S.dying[i];
      if (d.on) continue;
      d.on = true; d.id = ev.id; d.side = ev.side === 'enemy' ? 'enemy' : 'cat'; d.kind = ev.kind; d.x = ev.x; d.y = ev.y; d.t0 = S.clock; d.boss = !!ev.boss; d.uid = ev.uid;
      return;
    }
  }
  function handleEvent(ev) {
    switch (ev.type) {
      case 'attack': { const r = recById(ev.src); if (r) r.atk = S.clock; break; }
      case 'cast': { const r = recById(ev.src); if (r) r.cast = S.clock; break; }
      case 'hit': case 'crit': { const r = recById(ev.tgt); if (r) r.hit = S.clock; break; }
      case 'death': if (!ev.expired || ev.kind === 'cat' || ev.kind === 'enemy') addDying(ev); S.recs.delete(ev.uid); break;
      case 'base_hit': S.baseFlash = 1; if (S.b.base.hp < S.b.base.maxHp * 0.3 && S.ui) S.ui.announce('Base health low'); break;
      case 'spawn': if (ev.boss && !S.bossSeen[ev.id]) startIntro(ev.id); break;
      case 'wave': if (ev.name && S.ui && ev.phase === undefined) S.ui.announce(ev.name); break;
      case 'burrow': { const r = recById(ev.uid); if (r) r.burrow = true; break; }
      case 'emerge': { const r = recById(ev.uid); if (r) r.burrow = false; break; }
      default: break;
    }
  }
  function pump() {
    const b = S.b;
    if (!b.events.length) return;
    const events = drainEvents(b);
    FXMOD.consume(S.fx, events, S.L, b);
    const a = audio();
    for (let i = 0; i < events.length; i++) {
      if (a && a.onEvent && !S.muted) { try { a.onEvent(events[i]); } catch (e) { /* optional */ } }
      handleEvent(events[i]);
    }
  }

  // ---- card input
  function deny(reason) {
    S.energyShake = 1;
    const msg = reason === 'energy' ? 'Not enough energy' : reason === 'occupied' ? 'That tile is taken' : reason === 'no_target' ? 'No target' : reason === 'bad_target' ? 'Pick a spot on the roof' : 'Cannot play that';
    if (S.ui) S.ui.toast(msg, 'warn');
    sound('deny');
  }
  function targetFor(card, px, py) {
    const L = S.L, tg = card.effect.target || 'none';
    if (tg === 'none') return py < L.handRect.y - 4 ? true : null;
    if (tg === 'enemy') {
      let best = null, bd = L.tileW * 1.6;
      for (const e of S.b.enemies) {
        if (e.dead || e.untargetable) continue;
        const dx = L.colX(e.x) - px, dy = L.footY(e.y) - L.scale * 0.5 - py;
        const d = Math.hypot(dx, dy * 0.8);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) return best;
      const tl = L.toTile(px, py);
      return tl ? { x: tl.col, y: tl.lane } : null;
    }
    if (tg === 'lane') {
      const f = L.field;
      if (py < f.y || py > f.y + f.h) return null;
      return { lane: clamp(Math.floor((py - f.y) / L.tileH), 0, LANES - 1) };
    }
    const tl = L.toTile(px, py);
    return tl ? { x: tl.col, y: tl.lane } : null;
  }
  function tryPlay(i, arg) {
    const b = S.b;
    if (!b || b.over || S.paused) return false;
    const r = playCard(b, i, arg === true ? undefined : arg);
    if (!r.ok) { deny(r.reason); return false; }
    S.sel = -1; S.drag = null;
    sound('card_play');
    if (S.ui) S.ui.announce('Played ' + (CARD_BY_ID[r.card] ? CARD_BY_ID[r.card].name : r.card));
    pump();
    return true;
  }
  function cardAt(i) { const b = S.b; return b && i >= 0 && i < b.hand.length ? CARD_BY_ID[b.hand[i]] : null; }
  function leave(won, quit) {
    const app = S.app, ui = S.ui;
    const res = S.result ? S.result.res : null;
    const go = () => {
      if (S.params && S.params.onDone) { try { S.params.onDone(res, !!quit); } catch (e) { /* caller error must not trap the player */ } return; }
      if (app && app.router) app.router.go((S.params && S.params.returnTo) || 'map', { fromBattle: true, won: !!won });
    };
    if (ui && ui.transition) ui.transition('wipe', go); else go();
  }
  const ctl = {
    sound,
    tapCard(i) {
      const card = cardAt(i);
      if (!card || S.b.over) return;
      sound('card_select');
      if (S.sel === i) {
        if ((card.effect.target || 'none') === 'none') tryPlay(i, undefined);
        else S.sel = -1;
        return;
      }
      S.sel = i; S.kbd = false;
    },
    dragCard(i, x, y) {
      const card = cardAt(i);
      if (!card || S.b.over || S.paused) return;
      const afford = S.b.energy + 1e-9 >= cardCost(S.b, card);
      if (!S.drag) S.drag = { i, x, y, active: afford, tile: null, deniedFor: -1 };
      const d = S.drag;
      d.x = x; d.y = y;
      if (!afford) { if (d.deniedFor !== i) { d.deniedFor = i; deny('energy'); S.sel = i; } d.active = false; return; }
      d.active = true; S.sel = i;
      d.tile = (card.effect.target === 'none' || y > S.L.handRect.y) ? null : S.L.toTile(x, y - 26);
    },
    dropCard(i, x, y) {
      const card = cardAt(i);
      const d = S.drag;
      S.drag = null;
      if (!card || !d || !d.active || S.b.over) return;
      if (y >= S.L.handRect.y - 2) { S.sel = -1; return; }   // dropped back on the hand: cancel
      const tg = card.effect.target || 'none';
      const arg = targetFor(card, x, tg === 'tile' || tg === 'lane' ? y - 26 : y);
      if (arg === null) { S.sel = -1; if (S.ui) S.ui.toast('Drop it on the roof', 'warn'); return; }
      tryPlay(i, arg);
    },
    cycleSpeed() { S.speedIdx = (S.speedIdx + 1) % HUD.SPEEDS.length; PREF.speedIdx = S.speedIdx; sound('ui_tap'); if (S.ui) S.ui.announce('Speed ' + HUD.SPEEDS[S.speedIdx] + 'x'); },
    toggleAuto() { S.auto = !S.auto; PREF.auto = S.auto; S.autoAt = S.b ? S.b.t + 0.2 : 0; if (S.ui) S.ui.announce('Auto play ' + (S.auto ? 'on' : 'off')); },
    cycleHand() {
      const b = S.b;
      if (!b || b.over) return;
      if (cycleHand(b)) { S.sel = -1; sound('card_cycle'); pump(); } else deny('energy');
    },
    pause() { if (S.b && !S.b.over) { S.paused = !S.paused; sound('ui_tap'); if (S.ui) S.ui.announce(S.paused ? 'Paused' : 'Resumed'); } },
    toggleMute() { S.muted = !S.muted; PREF.muted = S.muted; const a = audio(); if (a && a.setMuted) a.setMuted(S.muted); },
    askQuit() {
      const ui = S.ui;
      if (!ui) return;
      ui.confirm('Quit battle?', 'You leave with no rewards from this battle.', () => { S.paused = false; leave(false, true); }, { danger: true, yesLabel: 'Quit', noLabel: 'Stay', id: 'quit' });
    },
    leave(won) { leave(won, false); },
    replay() {
      const app = S.app, ui = S.ui, params = S.params;
      const go = () => screen.enter(app, Object.assign({}, params, { forceBattle: false }));
      if (ui && ui.transition) ui.transition('iris', go, {}); else go();
    },
  };

  // ---- result
  function finishBattle() {
    const b = S.b, app = S.app;
    S.endHandled = true;
    const res = battleResult(b);
    S.result = HUD.makeResultState(res);
    const a = audio();
    if (a && a.music) { try { a.music(res.won ? 'win' : 'lose'); } catch (e) { /* optional */ } }
    if (res.won && app && app.setProfile && res.profile) { app.setProfile(res.profile); if (app.save) app.save(); }
    if (S.ui) S.ui.announce(res.won ? 'Victory' : 'Defeat');
    S.paused = false;
  }

  // ---- auto play
  function runAuto() {
    const b = S.b;
    if (b.t < S.autoAt) return;
    S.autoAt = b.t + AUTO_EVERY;
    const pick = autoPick(b);
    if (pick) tryPlayQuiet(pick.i, pick.arg);
  }
  function tryPlayQuiet(i, arg) {
    const b = S.b;
    const r = playCard(b, i, arg);
    if (r.ok) { sound('card_play'); S.sel = -1; pump(); }
  }

  // ---- keyboard
  function keys(ui) {
    if (ui.keyHit('escape')) { if (!S.result) ctl.pause(); }
    if (ui.keyHit('p') && !S.result) ctl.pause();
    if (S.paused || S.result || !S.b) return;
    if (ui.keyHit('a')) ctl.toggleAuto();
    if (ui.keyHit('f')) ctl.cycleSpeed();
    if (ui.keyHit('c')) ctl.cycleHand();
    for (let d = 1; d <= 9; d++) if (ui.keyHit(String(d)) && d <= S.b.hand.length) { S.kbd = true; if (S.sel !== d - 1) { S.sel = d - 1; sound('card_select'); } else ctl.tapCard(d - 1); }
    if (S.sel >= 0 && !ui.focusId) {
      if (ui.keyHit('left')) S.cursor.col = clamp(S.cursor.col - 1, 1, COLS);
      if (ui.keyHit('right')) S.cursor.col = clamp(S.cursor.col + 1, 1, COLS);
      if (ui.keyHit('up')) S.cursor.lane = clamp(S.cursor.lane - 1, 0, LANES - 1);
      if (ui.keyHit('down')) S.cursor.lane = clamp(S.cursor.lane + 1, 0, LANES - 1);
      if (ui.keyHit('enter') || ui.keyHit('space')) {
        const card = cardAt(S.sel);
        if (card) {
          const tg = card.effect.target || 'none';
          const arg = tg === 'none' ? undefined : tg === 'lane' ? { lane: S.cursor.lane } : tg === 'enemy' ? { x: S.cursor.col, y: S.cursor.lane } : { x: S.cursor.col, y: S.cursor.lane };
          tryPlay(S.sel, arg);
        }
      }
    }
  }

  // ---- Screen
  const screen = {
    id: 'battle',
    state: S,
    ctl,
    enter(app, params) {
      params = params || {};
      S.app = app; S.ui = null;
      const profile = app.profile;
      const dist = params.district !== undefined ? params.district : (profile.progress ? profile.progress.district : 1);
      const stg = params.stage !== undefined ? params.stage : (profile.progress ? profile.progress.stage : 1);
      const gs = toGlobal(dist, stg);
      S.params = Object.assign({}, params, { district: dist, stage: stg });
      // reset state
      S.clock = 0; S.acc = 0; S.paused = false; S.sel = -1; S.drag = null; S.ghost = null; S.hoverTile = null; S.placeable = null; S.baseFlash = 0; S.energyShake = 0;
      S.recs.clear(); S.order.length = 0; for (const d of S.dying) d.on = false; S.intro = null; S.bossSeen = {}; S.overT = 0; S.result = null; S.endHandled = false;
      S.inspect = null; S.hintText = ''; S.kbd = false;
      S.speedIdx = PREF.speedIdx; S.auto = PREF.auto; S.muted = PREF.muted; S.autoAt = 0;
      S.relics = Object.keys(profile.relics || {}).filter((id) => RELIC_BY_ID[id]).slice(0, 12);
      S.cardLevels = {};
      for (const id of Object.keys(profile.cards || {})) S.cardLevels[id] = (profile.cards[id] && profile.cards[id].level) || 1;
      // fx
      if (app.fx) { S.fx = app.fx; S.ownFx = false; } else { S.fx = FXMOD.createFx(profile.seed || 1); S.ownFx = true; }
      FXMOD.clearFx(S.fx);
      S.fx.autoOverlay = false;
      // seed
      let seed = params.seed;
      if (seed === undefined) {
        const r = app.rng ? app.rng('battle:' + gs + ':' + (app.dayIndex ? app.dayIndex() : 0)) : null;
        seed = r ? r.int(1, 2147483646) : ((profile.seed || 1) + gs * 7919) >>> 0;
      }
      const echo = !params.forceBattle && !params.noEcho && isEchoStage(profile, dist, stg);
      S.echo = echo;
      const info = stageInfo(null, gs);
      S.district = info.district.id;
      S.view.districtId = S.district;
      S.info = { label: info.district.name + '  ' + (info.endless ? 'Rift ' + (info.round + 1) : 'Stage ' + info.stageInDistrict) + (info.isBoss ? '  BOSS' : '') };
      if (echo) {
        S.b = null;
        const res = resolveEcho(profile, { district: dist, stage: stg, rewardMult: params.rewardMult, noAdvance: params.noAdvance });
        S.result = HUD.makeResultState(res, 'ECHO CLEAR');
        if (app.setProfile && res.profile) { app.setProfile(res.profile); if (app.save) app.save(); }
        const a = audio();
        if (a && a.music) { try { a.music('win'); } catch (e) { /* optional */ } }
        return;
      }
      S.b = createBattle({ seed, district: dist, stage: stg, profile, deck: params.deck, modifiers: params.modifiers, rewardMult: params.rewardMult, noAdvance: params.noAdvance, noEcho: true });
      const a = audio();
      if (a) { try { if (a.setMuted) a.setMuted(S.muted); if (a.music) a.music(info.isBoss ? 'boss' : 'battle'); } catch (e) { /* optional */ } }
      S.hintText = 'Drag a cat card onto a rooftop tile';
    },

    update(app, dt, ui) {
      S.ui = ui; S.app = app;
      dt = clamp(dt, 0, 0.1);
      const L = S.L = layout(ui);
      if (S.fx.layout !== L) FXMOD.setLayout(S.fx, L);
      if (S.fx.reducedMotion !== ui.reduceMotion) FXMOD.setReducedMotion(S.fx, ui.reduceMotion);
      S.clock += dt;
      S.frame++;
      ui.toastY = L.topBar.y + L.topBar.h + 30;
      S.baseFlash = Math.max(0, S.baseFlash - dt * 2.4);
      S.energyShake = Math.max(0, S.energyShake - dt * 3);
      keys(ui);
      const b = S.b;
      if (!b) { FXMOD.update(S.fx, dt); return; }
      if (S.intro) { S.intro.t += dt; if (S.intro.t >= S.intro.dur) S.intro = null; }
      if (!S.paused) {
        const fx = S.fx;
        if (!b.over && fx.hitstop <= 0) {
          let scale = HUD.SPEEDS[S.speedIdx] * (fx.timeScale || 1);
          if (S.intro && !ui.reduceMotion) scale *= 0.35;
          S.acc = Math.min(0.5, S.acc + dt * scale);
          let n = 0;
          while (S.acc >= DT - 1e-9 && !b.over && n++ < MAX_STEPS) {
            snapshot();
            step(b, DT);
            S.acc -= DT;
            pump();
            if (S.auto) runAuto();
          }
        } else if (b.over) { S.acc = 0; pump(); }
        FXMOD.update(fx, dt);
        const a = audio();
        if (a && a.update) { try { a.update(dt); } catch (e) { /* optional */ } }
        if (a && a.setIntensity && S.frame % 10 === 0) { try { a.setIntensity(clamp(b.enemies.length / 12 + (S.intro ? 0.3 : 0), 0, 1)); } catch (e) { /* optional */ } }
        for (const d of S.dying) if (d.on && S.clock - d.t0 > DIE_T) d.on = false;
        if (b.over) {
          S.overT += dt;
          if (!S.endHandled && S.overT > (b.over === 'win' ? 1.4 : 0.9)) finishBattle();
        }
      }
      if (S.frame % 180 === 0 && S.recs.size > 220) {
        for (const [k, r] of S.recs) if (r.seen < S.frame - 120) S.recs.delete(k);
      }
      // hint
      if (!S.hintText || S.frame % 30 === 0) {
        let cats = 0;
        for (const u of b.units) if (!u.dead && u.kind === 'cat') cats++;
        S.hintText = cats === 0 ? 'Drag a cat card onto a rooftop tile' : b.wave === 0 ? 'First wave is coming. Build your line.' : 'Merge two equal cats side by side to grow them';
      }
    },

    draw(ctx, app, ui) {
      S.ui = ui;
      const L = S.L || (S.L = layout(ui));
      const b = S.b, fx = S.fx;
      const t = S.clock;
      const view = S.view;
      // ---- pointer driven state: hover tile, ghost, placeable
      let ghost = null, hover = null, placeable = null;
      const sel = b ? S.sel : -1;
      const card = sel >= 0 && b ? cardAt(sel) : null;
      if (card) {
        if (card.type === 'summon') { HUD.placeableMask(b, S.mask); placeable = S.mask; }
        else if ((card.effect.target || 'none') === 'tile') placeable = true;
      }
      if (b && !b.over && !S.paused && !S.result) {
        let tl = null, px = ui.px, py = ui.py;
        if (S.drag && S.drag.active) { tl = S.drag.tile; }
        else if (ui.inside && ui.pointerType === 'mouse' && !ui.down) tl = L.toTile(px, py);
        else if (S.kbd && card) tl = { col: S.cursor.col, lane: S.cursor.lane };
        if (S.kbd && card && !(S.drag && S.drag.active)) tl = { col: S.cursor.col, lane: S.cursor.lane };
        if (tl && card) {
          const tg = card.effect.target || 'none';
          if (tg === 'tile' || tg === 'enemy' || tg === 'lane') {
            const g = S.ghostObj;
            g.col = tl.col; g.lane = tl.lane;
            g.kind = card.type === 'summon' ? 'cat' : card.type === 'trap' ? 'trap' : card.type === 'build' ? 'barricade' : 'spell';
            g.valid = card.type === 'summon' ? !!S.mask[tl.lane * COLS + tl.col - 1] : true;
            g.radius = card.effect.radius || 1.5;
            ghost = g;
          }
        }
        hover = tl;
      }
      view.battle = b; view.hoverTile = hover; view.placeable = placeable; view.ghost = ghost; view.baseFlash = S.baseFlash;
      S.ghost = ghost;

      // ---- field region first so every widget drawn later wins the hit test
      const fr = ui.region('field', { x: L.field.x - 10, y: L.field.y - L.tileH * 0.6, w: L.field.w + 20, h: L.field.h + L.tileH * 0.6 }, null);
      if (fr.tap && b && !S.result) fieldTap(ui.px, ui.py);

      // ---- world + units + fx under screen shake
      ctx.save();
      if (!ui.reduceMotion && fx.shake) ctx.translate(fx.shake.x, fx.shake.y);
      if (WORLD.drawWorld) WORLD.drawWorld(ctx, L, view, t);
      if (b) {
        if (placeable && !b.over) drawPlaceable(ctx, L, placeable, t);
        drawUnits(ctx, ui, L, b);
        if (ghost && card && card.type === 'summon' && ghost.valid) drawGhostUnit(ctx, L, card, ghost, t);
        FXMOD.draw(ctx, fx, t);
        if (WORLD.drawWorldFront) WORLD.drawWorldFront(ctx, L, view, t);
        if (S.inspect) drawInspect(ui, L);
      } else FXMOD.draw(ctx, fx, t);
      ctx.restore();

      if (b) {
        HUD.drawTopBar(ctx, ui, L, S, ctl);
        HUD.drawRelicStrip(ctx, ui, L, S, ctl);
        HUD.drawHand(ctx, ui, L, S, ctl);
        HUD.drawBottomBar(ctx, ui, L, S, ctl);
        HUD.drawDragCard(ctx, ui, L, S);
      }
      FXMOD.drawOverlay(ctx, fx);
      if (S.intro) HUD.drawBossIntro(ctx, ui, L, S);
      if (S.paused && !S.result) HUD.drawPause(ctx, ui, L, S, ctl);
      if (S.result) { S.fx = fx; HUD.drawResult(ctx, ui, L, S, ctl); }
      if (!S.result && S.energyShake > 0.01 && S.ui) { /* energy bar shake is drawn by the bottom bar */ }
    },

    exit(app) {
      if (S.ui) S.ui.toastY = undefined;
      const a = app && app.audio;
      if (a && a.stopMusic) { try { a.stopMusic(); } catch (e) { /* optional */ } }
      if (S.fx) { FXMOD.clearFx(S.fx); S.fx.autoOverlay = true; }
      S.b = null; S.result = null; S.recs.clear(); S.ui = null;
    },
  };

  // ---- field taps
  function fieldTap(px, py) {
    const b = S.b, L = S.L;
    if (!b || b.over || S.paused) return;
    const card = S.sel >= 0 ? cardAt(S.sel) : null;
    if (card) {
      const tg = card.effect.target || 'none';
      if (tg === 'none') { return; }
      const arg = targetFor(card, px, py);
      if (arg === null) return;
      tryPlay(S.sel, arg);
      return;
    }
    // no card selected: inspect the unit under the finger
    let best = null, bd = L.tileW * 0.9;
    const test = (u) => {
      if (u.dead || u.kind === 'barricade') return;
      const r = S.recs.get(u.uid);
      const x = L.colX(r ? r.rx : u.x), y = L.footY(r ? r.ry : u.y) - L.scale * 0.45;
      const d = Math.hypot(x - px, (y - py) * 0.8);
      if (d < bd) { bd = d; best = u; }
    };
    for (const u of b.units) test(u);
    for (const u of b.enemies) test(u);
    S.inspect = best ? { uid: best.uid, until: S.clock + 3 } : null;
    if (best) sound('ui_tap');
  }
  function drawInspect(ui, L) {
    const I = S.inspect;
    if (!I) return;
    if (S.clock > I.until) { S.inspect = null; return; }
    const r = S.recs.get(I.uid);
    if (!r || r.u.dead) { S.inspect = null; return; }
    const u = r.u;
    const x = L.colX(r.rx), y = L.footY(r.ry);
    const hp = Math.max(0, Math.ceil(u.hp)) + '/' + Math.ceil(u.maxHp);
    const sub = u.side === 'cat' ? (u.role || 'minion') + (u.level ? ', level ' + u.level : '') + (u.merged ? ', merged +' + u.merged : '') : (u.traits && u.traits.length ? u.traits.join(', ') : 'enemy');
    ui.tip({ x: x - L.scale * 0.4, y: y - L.scale, w: L.scale * 0.8, h: L.scale }, u.name || u.id, 'HP ' + hp + '\n' + sub);
  }

  // ---- placement help: soft cyan tiles where the card can land, and a see-through cat on the tile being aimed at
  function drawPlaceable(ctx, L, mask, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    for (let l = 0; l < LANES; l++) for (let c = 1; c <= COLS; c++) {
      if (mask !== true && !mask[l * COLS + c - 1]) continue;
      const tl = L.tile(c, l);
      ctx.fillStyle = rgba(PAL.cyan, 0.05 + 0.05 * pulse); ctx.fillRect(tl.x + 1, tl.y + 1, tl.w - 2, tl.h - 2);
      ctx.strokeStyle = rgba(PAL.cyan, 0.3 + 0.2 * pulse); ctx.lineWidth = 1; ctx.strokeRect(tl.x + 2.5, tl.y + 2.5, tl.w - 5, tl.h - 5);
    }
  }
  function drawGhostUnit(ctx, L, card, g, t) {
    const tl = L.tile(g.col, g.lane);
    ctx.save();
    ctx.globalAlpha = 0.62;
    CO.t = t; CO.anim = 'idle'; CO.animT = 0; CO.hitFlash = 0; CO.shield = 0; CO.facing = 1; CO.level = 1; CO.stars = 1; CO.tint = null;
    if (CATART.drawCat) CATART.drawCat(ctx, card.effect.cat, tl.cx, L.footY(g.lane), L.scale * 0.9, CO);
    ctx.restore();
  }

  // ---- unit rendering
  const sortFn = (a, c) => (a.ry - c.ry) || (a.rx - c.rx);
  function drawUnits(ctx, ui, L, b) {
    const alpha = clamp(S.acc / DT, 0, 1);
    const order = S.order;
    order.length = 0;
    for (let i = 0; i < b.units.length; i++) {
      const u = b.units[i];
      if (u.dead || u.kind === 'barricade') continue;
      const r = recOf(u);
      r.seen = S.frame;
      r.rx = r.x0 + (u.x - r.x0) * alpha; r.ry = r.y0 + (u.y - r.y0) * alpha;
      order.push(r);
    }
    for (let i = 0; i < b.enemies.length; i++) {
      const u = b.enemies[i];
      if (u.dead) continue;
      const r = recOf(u);
      r.seen = S.frame;
      r.rx = r.x0 + (u.x - r.x0) * alpha; r.ry = r.y0 + (u.y - r.y0) * alpha;
      order.push(r);
    }
    order.sort(sortFn);
    // dying first, under the living
    for (let i = 0; i < S.dying.length; i++) { const d = S.dying[i]; if (d.on) drawDying(ctx, L, d); }
    for (let i = 0; i < order.length; i++) drawUnit(ctx, L, order[i]);
  }
  function statusInfo(u) {
    let shield = 0, stun = false, taunt = false, dot = false;
    const ss = u.statuses;
    if (ss) for (let i = 0; i < ss.length; i++) {
      const s = ss[i];
      if (s.gone) continue;
      if (s.type === 'shield') shield += s.amount || 0;
      else if (s.type === 'stun') stun = true;
      else if (s.type === 'taunt') taunt = true;
      else if (s.type === 'dot') dot = true;
    }
    return { shield: shield > 0 ? clamp(shield / Math.max(1, u.maxHp), 0.15, 1) : 0, stun, taunt, dot };
  }
  const SI = { shield: 0, stun: false, taunt: false, dot: false };
  function drawUnit(ctx, L, r) {
    const u = r.u, t = S.clock;
    const px = L.colX(r.rx), py = L.footY(r.ry);
    const ph = hash01(u.uid) * 6;
    const hf = FXMOD.hitFlashOf ? FXMOD.hitFlashOf(S.fx, u.uid) : 0;
    const pop = FXMOD.popOf ? FXMOD.popOf(S.fx, u.uid) : 0;
    const st = statusInfo(u);
    SI.shield = st.shield; SI.stun = st.stun; SI.taunt = st.taunt; SI.dot = st.dot;
    const atkAge = t - r.atk, castAge = t - r.cast, hitAge = t - r.hit;
    let size = L.scale * 0.9 * (u.kind === 'minion' ? 0.72 : 1) * (1 + pop * 0.12);
    let top = size;
    if (u.side === 'cat') {
      const catId = CAT_BY_ID[u.id] ? u.id : MINION_CATS[Math.floor(hash01(u.id) * MINION_CATS.length)];
      const o = CO;
      o.t = t + ph; o.level = u.level || 1; o.stars = 1 + (u.stars || 0); o.hitFlash = hf; o.shield = st.shield; o.facing = 1;
      o.tint = null;
      if (castAge < CAST_T) { o.anim = 'cast'; o.animT = castAge / CAST_T; }
      else if (atkAge < ATTACK_T) { o.anim = 'attack'; o.animT = atkAge / ATTACK_T; }
      else if (hitAge < HIT_T) { o.anim = 'hit'; o.animT = hitAge / HIT_T; }
      else if (Math.abs(u.x - r.x0) > 0.0015 || Math.abs(r.rx - (u.home ? u.home.x : u.x)) > 0.05) { o.anim = 'walk'; o.animT = 0; }
      else { o.anim = 'idle'; o.animT = 0; }
      if (CATART.drawCat) CATART.drawCat(ctx, catId, px, py, size, o);
      top = size * 1.05;
    } else {
      const eid = ENEMY_BY_ID[u.id] ? u.id : u.id;
      const o = EO;
      o.t = t; o.hitFlash = hf; o.shield = st.shield; o.phase = u.phaseIdx || 0; o.seed = u.uid;
      if (r.burrow || u.untargetable) { o.anim = 'burrow'; o.animT = 0; }
      else if (st.stun) { o.anim = 'stun'; o.animT = 0; }
      else if (atkAge < ATTACK_T) { o.anim = 'attack'; o.animT = atkAge / ATTACK_T; }
      else { o.anim = 'walk'; o.animT = 0; }
      if (ENEMYART.drawEnemy) ENEMYART.drawEnemy(ctx, eid, px, py, size, o);
      const an = ENEMYART.enemyAnchors ? ENEMYART.enemyAnchors(eid, size) : null;
      top = an ? an.top : size * 1.1;
    }
    // hp bar for hurt units and bosses
    if (u.maxHp > 0 && (u.hp < u.maxHp - 0.5 || u.boss)) {
      const w = Math.max(22, size * (u.boss ? 0.9 : 0.55)), x = px - w / 2, y = py - top - 8, h = u.boss ? 6 : 4;
      const f = clamp(u.hp / u.maxHp, 0, 1);
      ctx.fillStyle = PAL.ink; ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
      ctx.fillStyle = u.side === 'cat' ? PAL.hpBack : PAL.hpBack; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = u.side === 'cat' ? PAL.lime : PAL.hp; ctx.fillRect(x, y, w * f, h);
      ctx.fillStyle = rgba(PAL.bone, 0.7); ctx.fillRect(x, y, w * f, 1);
    }
    if (SI.stun || SI.taunt || SI.dot) {
      const icon = SI.stun ? 'stun' : SI.taunt ? 'taunt' : 'dot';
      if (ICONS.drawStatusIcon) ICONS.drawStatusIcon(ctx, icon, px + size * 0.32, py - top - 2, 15);
    }
  }
  function drawDying(ctx, L, d) {
    const age = S.clock - d.t0, p = clamp(age / DIE_T, 0, 1);
    const px = L.colX(d.x), py = L.footY(d.y);
    const size = L.scale * 0.9 * (d.kind === 'minion' ? 0.72 : 1);
    if (d.side === 'cat') {
      const catId = CAT_BY_ID[d.id] ? d.id : MINION_CATS[Math.floor(hash01(d.id) * MINION_CATS.length)];
      CO.t = S.clock; CO.anim = 'die'; CO.animT = p; CO.hitFlash = 0; CO.shield = 0; CO.facing = 1; CO.level = 1; CO.stars = 1; CO.tint = null;
      if (CATART.drawCat) CATART.drawCat(ctx, catId, px, py, size, CO);
    } else {
      EO.t = S.clock; EO.anim = 'die'; EO.animT = p; EO.hitFlash = 0; EO.shield = 0; EO.phase = 0; EO.seed = d.uid || 0;
      if (ENEMYART.drawEnemy) ENEMYART.drawEnemy(ctx, d.id, px, py, size, EO);
    }
  }

  return screen;
}

export const battleScreen = createBattleScreen();
export default battleScreen;
export { PREF as BATTLE_PREFS };
