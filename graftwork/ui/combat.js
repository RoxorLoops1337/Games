// COMBAT SCREEN. The engine is synchronous: after every action `c` is final and c.ev holds the events in order.
// This screen keeps DISPLAY state (hp, block, statuses, hand positions, pile zones) and replays c.ev through a timed
// queue, updating the display as each event plays. Input is locked while the queue is busy (click / Space = speed up).
import { COL, EASE, FONT, W, H, rgba, clamp, lerp } from './core.js';
import { Fx } from './fx.js';
import { newCombat, playCard, endTurn, canPlay, needsTarget, effCost, specOf, intentOf, resolvePending, usePotion, finishCombat, HAND_CAP } from '../engine/combat.js';
import * as RUN from '../engine/run.js';
import { CARDS, STATUSES, RELICS, POTIONS, HEROES } from '../data/index.js';
import { drawCard, drawCardBack, CARD_W, CARD_H } from '../art/cards.js';
import { drawRelic, drawPotion, drawEnergyOrb, drawCoin, drawHeart, drawShield } from '../art/icons.js';
import { drawEnemy } from '../art/enemies.js';
import { drawHero, drawPortrait } from '../art/heroes.js';
import { drawBackground } from '../art/backgrounds.js';
import * as L from './combat_layout.js';
import { maybeTip } from './tutorial.js';
import { drawBar, drawStatusRow, drawIntentBubble, intentText, cardSections, drawSections, gearIcon, stCol, stName } from './combat_hud.js';

const { HERO_X, FOOT_Y, PLAY_LINE } = L;
const ACT_THEME = { 1: 'ward', 2: 'market', 3: 'theatre' };
const WHY = { energy: 'Not enough energy', unplayable: 'Unplayable', gold: 'Not enough gold', limit: 'Play limit reached', needsAttack: 'Play an Attack first', target: 'Pick a target', blocked: 'Not now' };
const rnd = (a, b) => a + Math.random() * (b - a);

let S = null; // the live screen state (one combat at a time)
let APP = null;
const sfx = (n, o) => { const a = APP && APP.shared && APP.shared.audio; if (a && a.sfx) a.sfx(n, o); };

// ---------------------------------------------------------------- display entities
function mkEnt(hp, maxHp, block, st) {
  return { hp, maxHp, shown: hp, trail: hp, tdelay: 0, block, st: { ...st }, hurt: 0, bpulse: 0, kick: 0, pop: {} };
}
function tickEnt(en, d) {
  en.shown += (en.hp - en.shown) * (1 - Math.exp(-d * 16));
  if (Math.abs(en.shown - en.hp) < 0.05) en.shown = en.hp;
  if (en.trail > en.hp) { if (en.tdelay > 0) en.tdelay -= d; else en.trail = Math.max(en.hp, en.trail - Math.max(8, en.maxHp) * 1.1 * d); } else en.trail = en.hp;
  en.hurt = Math.max(0, en.hurt - d * 4); en.bpulse = Math.max(0, en.bpulse - d * 3); en.kick = Math.max(0, en.kick - d * 5);
  for (const s of Object.keys(en.pop)) { en.pop[s] -= d * 2.2; if (en.pop[s] <= 0) delete en.pop[s]; }
}
function mkEd(e) {
  const b = L.enemySlots([e.def])[0];
  const ed = mkEnt(e.maxHp, e.maxHp, 0, e.st);
  Object.assign(ed, { e, id: e.uid, visible: false, reserve: false, spawnT: 0, x: 0, scale: b.scale, w: b.w, h: b.h, placed: false, move: null, intentT: 0, intentOut: 0, atk: 0, atkT: -1, dying: 0, dyingOn: false, gone: false, phase: Math.random() * 6, callout: null, stunT: 0, drop: 0 });
  return ed;
}
function syncEds() {
  const c = S.c;
  for (const e of c.enemies) if (!S.edBy.has(e.uid)) { const ed = mkEd(e); S.edBy.set(e.uid, ed); }
  S.eds = c.enemies.map((e) => S.edBy.get(e.uid));
}
function ent(who) { return who === 'player' || who === undefined || who === null ? S.P : S.edBy.get(who); }
function entPos(who) {
  if (who === 'player' || who == null) return { x: HERO_X, y: FOOT_Y - 95 };
  const ed = S.edBy.get(who); if (!ed) return { x: 900, y: FOOT_Y - 80 };
  return { x: ed.x, y: FOOT_Y - ed.h * 0.55 };
}
const liveEds = () => S.eds.filter((ed) => ed.visible && !ed.e.dead);

// ---------------------------------------------------------------- zones
function refreshKnown() {
  const c = S.c;
  for (const z of [c.hand, c.drawPile, c.discard, c.exhaust, c.powers]) for (const w of z) {
    if (!S.known.has(w.uid)) { S.known.set(w.uid, w); if (!S.zone.has(w.uid)) S.zone.set(w.uid, w.temp ? 'none' : 'draw'); }
  }
}
const zoneCount = (z) => { let n = 0; for (const v of S.zone.values()) if (v === z) n++; return n; };
function setZone(uid, z) { S.zone.set(uid, z); }

// ---------------------------------------------------------------- enter
function enter(app, params) {
  APP = app;
  const run = (params && params.run) || app.shared.run;
  if (!run.pending || !run.pending.enemies) RUN.startFight(run, 'normal');
  const kind = run.pending.fightKind || 'normal';
  const c = newCombat(run, run.pending.enemies, { kind });
  S = {
    app, run, c, kind, boss: kind === 'boss' || kind === 'final', fx: new Fx(), t: 0, q: [], wait: 0, skip: false,
    known: new Map(), zone: new Map(), P: mkEnt(c.player.hp, c.player.maxHp, 0, c.player.st), eds: [], edBy: new Map(),
    hand: [], spr: [], coins: [], energy: 0, maxEnergy: c.maxEnergy, orbPulse: 0, gold: run.gold || 0, goldPulse: 0, turn: 0,
    potions: run.potions.slice(), sel: null, drag: null, down: null, hov: null, tgt: 0, kbTarget: false, potSel: null,
    banner: null, vig: 0, lamp: 0, dark: 0, modal: null, pend: new Set(), ending: null, finalized: false,
    seenTithe: new Set(), pulse: { draw: 0, disc: 0, exh: 0 }, atkHero: 0, heroDy: 0, intentSfxAt: -9, deckHover: null, cardTip: null, finalBlow: false,
  };
  S.P.pop = {}; S.P.attack = 0; S.P.dying = 0;
  refreshKnown(); syncEds();
  for (const ed of S.eds) ed.reserve = true;
  absorb();
  S.energy = 0;
  fixLayout(true);
}
function leave() { S = null; }

function absorb() {
  refreshKnown(); syncEds();
  const evs = S.c.ev.splice(0);
  for (const e of evs) S.q.push(e);
}

// ---------------------------------------------------------------- event handling (returns wait in ms)
function handle(ev) {
  const c = S.c, fx = S.fx;
  switch (ev.t) {
    case 'spawn': {
      const ed = S.edBy.get(ev.e); if (!ed) return 0;
      ed.visible = true; ed.reserve = true; ed.spawnT = 0; ed.drop = ev.silent ? 0 : 1;
      if (!ev.silent) { fx.shake(0.25); sfx('junkAdd', { pitch: 0.8 }); fx.burst(ed.x || 900, FOOT_Y, 'dust'); return 260; }
      return 130;
    }
    case 'start': {
      if (S.boss) {
        const first = S.eds[0];
        S.banner = { title: first ? first.e.name.toUpperCase() : 'BOSS', sub: S.kind === 'final' ? 'THE LAST FITTING' : 'BOSS', t: 0, life: 1.9, style: 'boss' };
        S.dark = 1; sfx('bossIntro'); return 1500;
      }
      return 0;
    }
    case 'turnStart': {
      S.turn = ev.turn; S.energy = c.maxEnergy; S.maxEnergy = c.maxEnergy;
      const keep = c.player.st.barricade > 0;
      if (!keep) S.P.block = 0;
      sfx('turnStart', { vol: 0.7 });
      if (ev.turn > 1) S.banner = { title: 'YOUR TURN', t: 0, life: 0.8, style: 'turn' };
      return ev.turn > 1 ? 260 : 120;
    }
    case 'turnEnd': {
      S.sel = null; S.potSel = null; sfx('turnEnd');
      for (const ed of S.eds) if (!(ed.st.barricade > 0)) ed.block = 0;
      return 170;
    }
    case 'intent': {
      const ed = S.edBy.get(ev.e); if (!ed) return 0;
      ed.move = ev.move; ed.intentT = 0; ed.intentOut = 0;
      if (S.t - S.intentSfxAt > 0.4) { sfx('intentReveal', { vol: 0.7 }); S.intentSfxAt = S.t; }
      return 0;
    }
    case 'draw': {
      const w = S.known.get(ev.card); if (!w) return 0;
      let dc = S.hand.find((d) => d.uid === ev.card);
      if (!dc) {
        const z = S.zone.get(ev.card);
        const from = z === 'discard' ? L.DISC_POS : z === 'exhaust' ? L.EXH_POS : L.DRAW_POS;
        dc = mkDc(w, { x: from.x, y: from.y, s: 0.22, alpha: 0 });
        S.hand.push(dc);
      }
      setZone(ev.card, 'hand'); S.pulse.draw = 1;
      if (!ev.silent) sfx('cardDraw');
      if (w.tithed && !S.seenTithe.has(w.uid)) { S.seenTithe.add(w.uid); dc.seam = 0; sfx('tithe', { vol: 0.55 }); }
      return 70;
    }
    case 'play': return onPlay(ev);
    case 'replay': {
      const w = S.known.get(ev.card); if (!w) return 0;
      const spec = specOf(c, w);
      const sp = addSprite({ w, spec, x: 640, y: 340, s: 0.7, rot: 0, alpha: 0.4, cost: spec.cost, glowCol: COL.echo });
      const tp = S.lastTarget || { x: 900, y: 340 };
      mover(sp, { x: tp.x, y: tp.y, s: 0.4, rot: 0.1, alpha: 0 }, 0.22, EASE.in, () => { sp.done = true; });
      fx.ring(640, 340, COL.echo, 90, 0.4); fx.burst(640, 340, 'echo'); sfx('echo');
      return 190;
    }
    case 'dmg': return onDmg(ev);
    case 'block': {
      const en = ent(ev.who); if (!en) return 0;
      en.block += ev.n; en.bpulse = 1;
      const p = entPos(ev.who);
      fx.burst(p.x, p.y, 'block', { n: 8 }); fx.ring(p.x, p.y, '#bcd0d8', 70, 0.35);
      fx.float('+' + ev.n, p.x, p.y - 30, { color: '#bcd0d8', size: 22 });
      sfx('block', { vol: 0.8 });
      return 95;
    }
    case 'status': return onStatus(ev);
    case 'immune': { const p = entPos(ev.who); fx.float('Immune', p.x, p.y - 40, { color: '#aaa', size: 20 }); return 110; }
    case 'heal': {
      const en = ent(ev.who); if (!en) return 0;
      en.hp = Math.min(en.maxHp, en.hp + ev.n);
      const p = entPos(ev.who);
      fx.burst(p.x, p.y + 20, 'heal', { n: 14, jitter: 50, shape: 'dot' }); fx.float('+' + ev.n, p.x, p.y - 30, { color: COL.good, size: 30 });
      sfx('heal'); return 130;
    }
    case 'hp': {
      const en = ent(ev.who); if (!en) return 0;
      en.hp = Math.max(0, en.hp - ev.n); en.tdelay = 0.45; en.hurt = 0.6;
      const p = entPos(ev.who);
      fx.float('-' + ev.n, p.x, p.y - 30, { color: COL.bad, size: 28 });
      fx.burst(p.x, p.y, 'blood', { n: 8 });
      if (ev.who === 'player' || ev.who == null) {
        if (ev.src === 'graft') { sfx('heartbeat'); S.lamp = 1; fx.shake(0.15); } else sfx('loseHp', { vol: 0.8 });
        S.vig = Math.max(S.vig, 0.6);
      } else sfx('hitSmall');
      return 120;
    }
    case 'kill': return onKill(ev);
    case 'enemyAct': {
      const ed = S.edBy.get(ev.e); if (!ed) return 0;
      const info = intentWith(ed, ev.move);
      const atk = info && info.kinds.includes('attack');
      ed.atkT = 0; ed.atkKind = atk ? 'attack' : 'cast'; ed.intentOut = 0.0001;
      const mv = ed.e.def.moves[ev.move];
      ed.callout = { text: (mv && mv.name) || '', t: 0 };
      if (!atk) { const p = entPos(ev.e); fx.ring(p.x, p.y, '#cfc3a8', 80, 0.5); }
      return atk ? 290 : 380;
    }
    case 'stunned': {
      const ed = S.edBy.get(ev.e); if (!ed) return 0;
      ed.stunT = 1; ed.intentOut = 0.0001; const p = entPos(ev.e);
      fx.float('Stunned', p.x, p.y - 60, { color: COL.lamp, size: 24 }); fx.ring(p.x, p.y - 60, COL.lamp, 60, 0.5); sfx('debuff', { vol: 0.6 });
      return 320;
    }
    case 'potion': {
      const i = S.potions.indexOf(ev.id); const from = potionPos(i < 0 ? 0 : i);
      if (i >= 0) S.potions.splice(i, 1);
      const tp = ev.target ? entPos(ev.target) : { x: HERO_X, y: FOOT_Y - 100 };
      const sp = addSprite({ icon: 'potion', id: ev.id, x: from.x, y: from.y, s: 1, rot: 0, alpha: 1 });
      mover(sp, { x: tp.x, y: tp.y - 20, s: 2.2, rot: 3, alpha: 1 }, 0.3, EASE.out, () => { fx.burst(tp.x, tp.y, 'heal', { colors: ['#7fd1e0', '#fff'], n: 16, jitter: 30 }); fx.ring(tp.x, tp.y, '#7fd1e0', 90, 0.4); sp.done = true; });
      sfx('potion'); return 330;
    }
    case 'energy': {
      S.energy = Math.max(0, S.energy + ev.n); S.orbPulse = 1;
      fx.ring(L.ORB.x, L.ORB.y, COL.energy, 70, 0.45);
      if (ev.n > 0) sfx('buff', { pitch: 1.4, vol: 0.5 });
      return 90;
    }
    case 'gold': {
      S.gold = Math.max(0, S.gold + ev.n);
      if (ev.n > 0) {
        const cnt = clamp(Math.ceil(ev.n / 6), 2, 9);
        for (let i = 0; i < cnt; i++) S.coins.push({ x: HERO_X + rnd(-30, 30), y: FOOT_Y - 120, tx: L.GOLD_POS.x, ty: L.GOLD_POS.y, t: -i * 0.06, dur: 0.6, arc: rnd(60, 160) });
        sfx('gold');
      } else { fx.float(ev.n + ' gold', L.GOLD_POS.x + 20, L.GOLD_POS.y + 40, { color: COL.bad, size: 22 }); S.goldPulse = 1; sfx('coin', { vol: 0.5 }); }
      return 100;
    }
    case 'discard': {
      setZone(ev.card, 'discard');
      const i = S.hand.findIndex((d) => d.uid === ev.card);
      if (i >= 0) {
        const dc = S.hand.splice(i, 1)[0];
        const sp = addSprite({ w: dc.w, spec: dcSpec(dc), x: dc.x, y: dc.y, s: dc.s, rot: dc.rot, alpha: 1, cost: spec0(dc), dim: 0 });
        sp.delay = ev.why === 'turnEnd' ? 0 : 0;
        mover(sp, { x: L.DISC_POS.x, y: L.DISC_POS.y, s: L.PILE_S, rot: 0.5, alpha: 0.9 }, 0.32, EASE.inOut, () => { sp.done = true; S.pulse.disc = 1; });
        return ev.why === 'turnEnd' ? 26 : 90;
      }
      const f = S.spr.find((s) => s.mode === 'play' && s.w.uid === ev.card); if (f) f.fate = 'discard';
      return 0;
    }
    case 'exhaust': {
      setZone(ev.card, 'exhaust');
      const i = S.hand.findIndex((d) => d.uid === ev.card);
      if (i >= 0) {
        const dc = S.hand.splice(i, 1)[0];
        const sp = addSprite({ w: dc.w, spec: dcSpec(dc), x: dc.x, y: dc.y, s: dc.s, rot: dc.rot, alpha: 1, cost: spec0(dc) });
        startBurn(sp); return 110;
      }
      const f = S.spr.find((s) => s.mode === 'play' && s.w.uid === ev.card); if (f) f.fate = 'exhaust';
      return 0;
    }
    case 'power': { setZone(ev.card, 'power'); const f = S.spr.find((s) => s.mode === 'play' && s.w.uid === ev.card); if (f) f.fate = 'power'; return 0; }
    case 'shatter': {
      setZone(ev.card, 'gone');
      const f = S.spr.find((s) => s.mode === 'play' && s.w.uid === ev.card);
      const p = f ? { x: f.x, y: f.y } : { x: 640, y: 340 };
      if (f) f.done = true;
      fx.burst(p.x, p.y, 'shard', { n: 26, speed: 460, size: 8 }); fx.burst(p.x, p.y, 'glass', { n: 12 }); fx.ring(p.x, p.y, COL.gold, 160, 0.6);
      fx.slowmo(0.35, 350); fx.flash('#ffe9a8', 0.35, 0.3); fx.shake(0.6); fx.float('SHATTERED', p.x, p.y - 80, { color: COL.gold, size: 34, big: true, life: 1.4 });
      sfx('shatter'); return 420;
    }
    case 'addCard': return onAddCard(ev);
    case 'burnCard': {
      const w = S.known.get(ev.card); if (!w) return 0;
      setZone(ev.card, 'discard');
      const slot = L.handSlot(Math.max(0, S.hand.length - 1), Math.max(1, S.hand.length));
      const sp = addSprite({ w, spec: specOf(c, w), x: slot.x + 70, y: slot.y, s: slot.s, rot: 0.1, alpha: 1, cost: 0 });
      startBurn(sp); fx.float('Hand full', slot.x, slot.y - 130, { color: COL.bad, size: 22 });
      return 150;
    }
    case 'handFull': { fx.float('Hand full', L.HAND_CX, L.HAND_Y - 140, { color: COL.bad, size: 22 }); sfx('error', { vol: 0.4 }); return 100; }
    case 'shuffle': {
      const n = Math.min(10, Math.max(3, zoneCount('discard')));
      for (const [k, v] of S.zone) if (v === 'discard') S.zone.set(k, 'draw');
      for (let i = 0; i < n; i++) {
        const sp = addSprite({ back: true, x: L.DISC_POS.x, y: L.DISC_POS.y, s: L.PILE_S, rot: 0, alpha: 0 });
        sp.delay = i * 0.028;
        mover(sp, { x: L.DRAW_POS.x, y: L.DRAW_POS.y, s: L.PILE_S, rot: rnd(-0.3, 0.3), alpha: 1 }, 0.5, EASE.inOut, () => { sp.done = true; if (i === n - 1) S.pulse.draw = 1; });
        sp.arc = -rnd(60, 180);
      }
      sfx('shuffle'); return 330;
    }
    case 'jam': {
      const dc = S.hand.find((d) => d.uid === ev.card); if (!dc) return 0;
      dc.jam = true; dc.jamT = 0; dc.shakeT = 1; fx.burst(dc.x, dc.y, 'flake', { n: 8 }); fx.shake(0.2); sfx('jam');
      return 230;
    }
    default: return 0; // 'pending', 'win', 'lose', and unknown events are ignored safely
  }
}
const spec0 = (dc) => { try { return effCost(S.c, dc.w); } catch (e) { return 0; } };

function onPlay(ev) {
  const c = S.c, fx = S.fx;
  const w = S.known.get(ev.card);
  const i = S.hand.findIndex((d) => d.uid === ev.card);
  const dc = i >= 0 ? S.hand.splice(i, 1)[0] : null;
  setZone(ev.card, 'playing');
  if (ev.cost === 'X') S.energy = 0; else S.energy = Math.max(0, S.energy - (ev.cost || 0));
  if (!w) return 100;
  const spec = specOf(c, w);
  const from = dc || { x: L.HAND_CX, y: L.HAND_Y, s: 0.6, rot: 0 };
  const sp = addSprite({ w, spec, x: from.x, y: from.y, s: from.s, rot: from.rot || 0, alpha: 1, cost: ev.cost, mode: 'play', pt: 0, fx0: { x: from.x, y: from.y, s: from.s, rot: from.rot || 0 } });
  sp.col = COL[spec.school] || COL[spec.type] || '#fff';
  const tgtEd = ev.target ? S.edBy.get(ev.target) : null;
  let tp;
  if (tgtEd) tp = entPos(ev.target);
  else if (spec.target === 'all') { const l = liveEds(); tp = l.length ? { x: l.reduce((a, e) => a + e.x, 0) / l.length, y: FOOT_Y - 90 } : { x: 900, y: 380 }; }
  else tp = { x: HERO_X + 40, y: FOOT_Y - 110 };
  sp.tp = tp; S.lastTarget = tp;
  sp.toEnemy = !!tgtEd || spec.target === 'all';
  if (spec.type === 'attack') { S.P.attack = 0.0001; }
  sfx('cardPlay');
  return 280;
}

function onDmg(ev) {
  const fx = S.fx;
  const en = ent(ev.who); if (!en) return 0;
  const isP = ev.who === 'player' || ev.who == null;
  const p = entPos(ev.who);
  let wait = 0;
  if (ev.absorbed > 0) {
    en.block = Math.max(0, en.block - ev.absorbed); en.bpulse = 1;
    fx.burst(p.x + (isP ? 28 : -28), p.y, 'block', { n: 12, angle: isP ? 0 : Math.PI, spread: 2.2 });
    sfx('block', { vol: 0.9 });
    if (ev.broke) {
      fx.emit({ x: p.x, y: p.y, n: 12, colors: ['#9aa7ad', '#cfd8dc', '#6b7a82'], speed: 300, size: 4, gravity: 800, life: 0.7 });
      fx.ring(p.x, p.y, '#bcd0d8', 100, 0.4); fx.float('Block broken', p.x, p.y - 62, { color: '#bcd0d8', size: 18 }); sfx('blockBreak');
    } else fx.float(String(ev.absorbed), p.x - 24, p.y - 26, { color: '#9fb4bd', size: 22 });
    wait = 90;
  }
  if (ev.n > 0) {
    en.hp = Math.max(0, en.hp - ev.n); en.tdelay = 0.5;
    const crit = ev.n > 15;
    fx.float(String(ev.n), p.x + rnd(-16, 16), p.y - 20, { color: crit ? '#ff4a4a' : COL.vellum, size: Math.round(28 + Math.min(ev.n, 40) * 0.45), big: crit, life: crit ? 1.4 : 1.1 });
    if (ev.hit) {
      en.hurt = 1; en.kick = 1;
      fx.shake(clamp(0.12 + ev.n / 70, 0.12, 0.8));
      if (ev.n >= 12) fx.hitstop(80); else if (ev.n >= 6) fx.hitstop(40);
      if (ev.n >= 10) fx.ring(p.x, p.y, '#fff', 70 + ev.n * 2, 0.3);
      fx.burst(p.x, p.y, isP ? 'blood' : 'spark', { n: 6 + Math.min(14, ev.n), angle: isP ? Math.PI : 0, spread: 2.6 });
      sfx(ev.n >= 10 ? 'hitBig' : 'hitSmall');
      if (isP) { S.vig = 1; sfx('loseHp', { vol: 0.7 }); S.heroKick = 1; }
      wait = Math.max(wait, 110);
    } else {
      fx.burst(p.x, p.y, 'ember', { n: 4 }); sfx('hitSmall', { vol: 0.4, pitch: 0.8 });
      if (isP) S.vig = Math.max(S.vig, 0.4);
      wait = Math.max(wait, 60);
    }
  } else if (!ev.absorbed && ev.raw === 0) { fx.float('0', p.x, p.y - 20, { color: '#aaa', size: 20 }); wait = 40; }
  // the striking card shudders on contact
  const sp = S.spr.find((s) => s.mode === 'play'); if (sp) sp.jit = 1;
  return wait;
}

function sfxForStatus(s, good) {
  return ({ burn: 'burnApply', bleed: 'bleedApply', poison: 'poison', vulnerable: 'vulnerable', weak: 'weak' })[s] || (good ? 'buff' : 'debuff');
}
function onStatus(ev) {
  const en = ent(ev.who); if (!en) return 0;
  const prev = en.st[ev.s] || 0;
  if (ev.n) en.st[ev.s] = ev.n; else delete en.st[ev.s];
  const gained = ev.d !== undefined ? ev.d > 0 : false;
  if (!gained) return 0;
  const good = !(STATUSES[ev.s] && STATUSES[ev.s].good === false);
  en.pop[ev.s] = 1;
  const p = entPos(ev.who);
  S.fx.float(`${stName(ev.s)} +${ev.d}`, p.x, p.y - 56, { color: stCol(ev.s), size: 20, life: 1.0 });
  S.fx.ring(p.x, p.y - 20, stCol(ev.s), 60, 0.4);
  sfx(sfxForStatus(ev.s, good));
  return prev === 0 ? 110 : 80;
}

function onKill(ev) {
  const ed = S.edBy.get(ev.e); if (!ed) return 0;
  const fx = S.fx;
  ed.hp = 0; ed.dyingOn = true; ed.dying = 0.0001; ed.intentOut = 0.0001; ed.reserve = true;
  if (ev.silent) { ed.quick = true; return 0; }
  const art = (ed.e.def.art && ed.e.def.art.color) || '#999';
  fx.emit({ x: ed.x, y: FOOT_Y - ed.h * 0.5, n: 20, colors: [art, '#e8dcc4', '#1a1614'], speed: 280, size: 7, gravity: 700, life: 0.9, shape: 'shard', spin: 12, jitter: ed.w * 0.6 });
  sfx('kill'); sfx('enemyDeath');
  const last = S.c.over === 'win' && !S.q.some((e) => e.t === 'kill' && !e.silent);
  if (last) { fx.slowmo(0.3, 700); fx.hitstop(110); fx.flash('#fff', 0.4, 0.35); fx.shake(0.5); S.finalBlow = true; return 480; }
  return 260;
}

function onAddCard(ev) {
  const w = S.known.get(ev.card); if (!w) return 0;
  const fx = S.fx, c = S.c;
  const spec = specOf(c, w);
  const junk = spec.type === 'junk';
  const to = ev.to;
  setZone(ev.card, to === 'hand' ? 'hand' : to === 'discard' ? 'discard' : 'draw');
  if (to === 'hand') {
    const dc = mkDc(w, { x: HERO_X + 60, y: FOOT_Y - 120, s: 0.2, alpha: 0 }); S.hand.push(dc);
    fx.ring(HERO_X + 60, FOOT_Y - 120, COL.lamp, 60, 0.4); sfx('cardDraw'); return 110;
  }
  const dest = to === 'discard' ? L.DISC_POS : L.DRAW_POS;
  const sp = addSprite({ w, spec, x: 900, y: 330, s: 0.4, rot: 0, alpha: 1, cost: spec.cost, dim: junk ? 0.5 : 0 });
  sp.arc = -140;
  mover(sp, { x: dest.x, y: dest.y, s: L.PILE_S, rot: rnd(3, 6), alpha: 1 }, 0.5, EASE.inOut, () => {
    sp.done = true; fx.burst(dest.x, dest.y - 20, 'dust', { n: 8 }); S.pulse[to === 'discard' ? 'disc' : 'draw'] = 1; if (junk) fx.shake(0.1);
  });
  sfx(junk ? 'junkAdd' : 'cardDraw'); return 120;
}

const moveName = (info) => { const n = String(info.name || info.move || 'Intent').replace(/_/g, ' '); return n.charAt(0).toUpperCase() + n.slice(1); };
function intentWith(ed, move) {
  const e = ed.e, keep = e.move;
  try { e.move = move; return intentOf(S.c, e); } catch (err) { return null; } finally { e.move = keep; }
}

// ---------------------------------------------------------------- sprites (cards in transit)
function addSprite(o) { const sp = { t: 0, delay: 0, x: 0, y: 0, s: 1, rot: 0, alpha: 1, ...o }; S.spr.push(sp); return sp; }
function mover(sp, to, dur, ease, then) { sp.mv = { from: { x: sp.x, y: sp.y, s: sp.s, rot: sp.rot, alpha: sp.alpha }, to, dur, t: 0, ease: ease || EASE.inOut, then }; }
function startBurn(sp) { sp.mode = 'burn'; sp.bt = 0; S.fx.burst(sp.x, sp.y, 'ember', { n: 18, jitter: 80, speed: 160 }); sfx('burnApply', { vol: 0.5, pitch: 1.3 }); }
function stepSprite(sp, d) {
  if (sp.delay > 0) { sp.delay -= d; return; }
  sp.t += d;
  const fx = S.fx;
  if (sp.mode === 'play') {
    const t = sp.t, f0 = sp.fx0, C = { x: 640, y: 350 }, tp = sp.tp;
    const dx = tp.x - C.x, dy = tp.y - C.y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
    if (sp.fate && t >= 0.27 && !sp.out) { sp.out = true; leavePlay(sp); }
    else if (!sp.fate && t > 1.4 && !sp.out) { sp.fate = 'discard'; sp.out = true; leavePlay(sp); }
    if (!sp.out) {
      if (t < 0.13) { const k = EASE.out(t / 0.13); sp.x = lerp(f0.x, C.x, k); sp.y = lerp(f0.y, C.y, k); sp.s = lerp(f0.s, 0.78, k); sp.rot = lerp(f0.rot, 0, k); }
      else if (t < 0.2) { const k = EASE.out((t - 0.13) / 0.07); sp.x = C.x - ux * 16 * k; sp.y = C.y - uy * 16 * k; sp.s = 0.78 + 0.05 * k; sp.rot = 0; }
      else if (t < 0.28) {
        const k = EASE.in((t - 0.2) / 0.08); const bx = C.x - ux * 16, by = C.y - uy * 16;
        sp.x = lerp(bx, tp.x, k); sp.y = lerp(by, tp.y, k); sp.s = lerp(0.83, 0.34, k);
        fx.emit({ x: sp.x, y: sp.y, n: 2, color: sp.col, speed: 40, size: 6, life: 0.3, gravity: 0, glow: true, jitter: 20 });
      } else {
        const j = sp.jit || 0; sp.jit = Math.max(0, j - d * 8);
        sp.x = tp.x + (j ? rnd(-5, 5) : 0); sp.y = tp.y + (j ? rnd(-5, 5) : 0); sp.s = 0.34; sp.alpha = 0.85;
      }
    }
  }
  if (sp.mode === 'burn') {
    sp.bt += d; sp.alpha = Math.max(0, 1 - sp.bt / 0.4); sp.s *= 1 + d * 0.4; sp.y -= d * 40;
    if (Math.random() < 0.6) fx.emit({ x: sp.x + rnd(-40, 40), y: sp.y + rnd(-50, 50), n: 1, colors: ['#ff6a2b', '#ffb347', '#ffe08a'], speed: 60, size: 3, gravity: -160, life: 0.5, glow: true });
    sp.burnMask = sp.bt / 0.4;
    if (sp.bt >= 0.4) sp.done = true;
  }
  if (sp.mv) {
    const m = sp.mv; m.t += d; const k = clamp(m.t / m.dur, 0, 1), e = m.ease(k);
    sp.x = lerp(m.from.x, m.to.x, e); sp.y = lerp(m.from.y, m.to.y, e) + (sp.arc ? Math.sin(k * Math.PI) * sp.arc : 0);
    sp.s = lerp(m.from.s, m.to.s, e); sp.rot = lerp(m.from.rot, m.to.rot, e); sp.alpha = lerp(m.from.alpha, m.to.alpha, e);
    if (k >= 1) { const th = m.then; sp.mv = null; if (th) th(); }
  }
}
function leavePlay(sp) {
  const fx = S.fx;
  sp.mode = 'mv';
  if (sp.fate === 'exhaust') startBurn(sp);
  else if (sp.fate === 'power') { fx.ring(sp.x, sp.y, COL.power, 100, 0.5); sfx('buff'); mover(sp, { x: HERO_X, y: FOOT_Y - 120, s: 0.15, rot: 1.2, alpha: 0 }, 0.45, EASE.inOut, () => { sp.done = true; fx.burst(HERO_X, FOOT_Y - 120, 'gild', { colors: ['#b48be0', '#fff'] }); }); }
  else mover(sp, { x: L.DISC_POS.x, y: L.DISC_POS.y, s: L.PILE_S, rot: 0.5, alpha: 0.9 }, 0.3, EASE.inOut, () => { sp.done = true; S.pulse.disc = 1; });
}

function drawSprites(app) {
  const ctx = app.ctx;
  for (const sp of S.spr) {
    if (sp.delay > 0) continue;
    if (sp.icon === 'potion') { ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.rot); ctx.globalAlpha = sp.alpha; drawPotion(ctx, sp.id, 0, 0, 30 * sp.s); ctx.restore(); continue; }
    if (sp.back) { ctx.save(); ctx.globalAlpha = sp.alpha; ctx.translate(sp.x, sp.y); ctx.rotate(sp.rot); drawCardBack(ctx, 0, 0, { scale: sp.s }); ctx.restore(); continue; }
    if (!sp.spec) continue;
    if (sp.mode === 'play' && sp.t < 0.3) { ctx.save(); ctx.globalAlpha = 0.5; ctx.shadowColor = sp.col; ctx.shadowBlur = 40; ctx.fillStyle = sp.col; ctx.beginPath(); ctx.arc(sp.x, sp.y, 40 * sp.s + 20, 0, 6.283); ctx.fill(); ctx.restore(); }
    drawCard(ctx, sp.spec, sp.x, sp.y, { scale: sp.s, rot: sp.rot, alpha: sp.alpha, tithed: sp.w.tithed, cost: sp.cost, dim: sp.dim || 0, glow: sp.glowCol ? 1 : 0 });
    if (sp.mode === 'burn') { ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.rot); ctx.scale(sp.s, sp.s); ctx.globalAlpha = (sp.burnMask || 0) * 0.5; ctx.fillStyle = '#ff6a2b'; ctx.fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H); ctx.restore(); }
  }
}

// ---------------------------------------------------------------- hand display cards
function mkDc(w, from) {
  return { uid: w.uid, w, spec: null, specKey: -1, x: from.x, y: from.y, s: from.s, rot: 0, alpha: from.alpha === undefined ? 1 : from.alpha, jam: false, jamT: 1, shakeT: 0, seam: -1, tx: from.x, ty: from.y, ts: from.s, trot: 0 };
}
function dcSpec(dc) {
  const key = dc.w.tithed ? 1 : 0;
  if (!dc.spec || dc.specKey !== key) { dc.spec = specOf(S.c, dc.w); dc.specKey = key; }
  return dc.spec;
}
function dcRect(dc) { const w = CARD_W * dc.s, h = CARD_H * dc.s; return { x: dc.x - w / 2, y: dc.y - h / 2, w, h }; }

function layoutHand(app, d) {
  const n = S.hand.length, m = app.mouse;
  const hi = S.hand.findIndex((dc) => dc.uid === S.hov);
  S.hand.forEach((dc, i) => {
    const sl = L.handSlot(i, n);
    let tx = sl.x, ty = sl.y, ts = sl.s, tr = sl.rot;
    if (hi >= 0 && i !== hi && !S.drag) { const dist = Math.abs(i - hi); if (dist === 1) tx += Math.sign(i - hi) * 62; else if (dist === 2) tx += Math.sign(i - hi) * 22; else if (dist === 3) tx += Math.sign(i - hi) * 8; }
    if (dc.uid === S.hov && !(S.drag && S.drag.uid === dc.uid)) { tx = clamp(sl.x, 150, 1130); ty = L.HOVER_Y; ts = L.HOVER_S; tr = 0; }
    else if (dc.uid === S.sel) { ty = sl.y - 78; ts = sl.s * 1.18; tr = 0; }
    if (S.drag && S.drag.uid === dc.uid) { tx = m.x; ty = m.y; ts = 0.78; tr = 0; }
    dc.tx = tx; dc.ty = ty; dc.ts = ts; dc.trot = tr;
    const k = 1 - Math.exp(-d * (S.drag && S.drag.uid === dc.uid ? 45 : 17));
    dc.x += (tx - dc.x) * k; dc.y += (ty - dc.y) * k; dc.s += (ts - dc.s) * k; dc.rot += (tr - dc.rot) * k;
    dc.alpha = Math.min(1, dc.alpha + d * 6);
    if (dc.seam >= 0 && dc.seam < 1) dc.seam += d / 0.5;
    if (dc.jamT < 1) dc.jamT = Math.min(1, dc.jamT + d / 0.25);
    if (dc.shakeT > 0) dc.shakeT = Math.max(0, dc.shakeT - d * 3);
  });
}

function drawHand(app) {
  const ctx = app.ctx, c = S.c;
  const idle = canAct();
  const order = S.hand.slice();
  order.sort((a, b) => (a.uid === S.hov ? 1 : 0) - (b.uid === S.hov ? 1 : 0) || (S.drag && a.uid === S.drag.uid ? 1 : 0) - (S.drag && b.uid === S.drag.uid ? 1 : 0));
  for (const dc of order) {
    const spec = dcSpec(dc);
    const hi = c.hand.indexOf(dc.w);
    const chk = hi >= 0 && !S.q.length ? canPlay(c, hi) : { ok: true };
    let cost = hi >= 0 ? effCost(c, dc.w) : spec.cost;
    if (typeof cost === 'number' && dc.w.jam && !dc.jam) cost = Math.max(0, cost - 1);
    const sx = dc.shakeT > 0 ? Math.sin(S.t * 90) * 7 * dc.shakeT : 0;
    const selected = dc.uid === S.sel;
    drawCard(ctx, spec, dc.x + sx, dc.y, { scale: dc.s, rot: dc.rot, tithed: dc.w.tithed, jam: dc.jam, cost, glow: selected ? 1 : (idle && chk.ok && dc.uid === S.hov ? 0.5 : 0), selected, dim: idle && !chk.ok ? 0.35 : 0, alpha: dc.alpha, hover: dc.uid === S.hov });
    if (dc.seam >= 0 && dc.seam < 1.4) drawSeam(ctx, dc);
    if (dc.jam) drawClamp(ctx, dc);
  }
}
function drawSeam(ctx, dc) {
  const k = clamp(dc.seam, 0, 1);
  ctx.save(); ctx.translate(dc.x, dc.y); ctx.rotate(dc.rot); ctx.scale(dc.s, dc.s);
  ctx.globalAlpha = dc.seam > 1 ? Math.max(0, 1 - (dc.seam - 1) * 2.5) : 1;
  ctx.strokeStyle = COL.scar; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); const x0 = -CARD_W / 2, y0 = -CARD_H / 2 + 70;
  ctx.moveTo(x0, y0);
  const steps = 14; for (let i = 1; i <= steps * k; i++) { const f = i / steps; ctx.lineTo(x0 + CARD_W * f, y0 + (i % 2 ? 12 : -12) + f * 80); }
  ctx.stroke(); ctx.restore();
}
function drawClamp(ctx, dc) {
  const k = EASE.back(clamp(dc.jamT, 0, 1));
  ctx.save(); ctx.translate(dc.x, dc.y); ctx.rotate(dc.rot); ctx.scale(dc.s, dc.s); ctx.globalAlpha = dc.alpha;
  const off = (1 - k) * 160;
  ctx.fillStyle = '#6b3a1f'; ctx.strokeStyle = '#2a140a'; ctx.lineWidth = 3;
  ctx.fillRect(-CARD_W / 2 - 6 - off, -14, CARD_W / 2 + 6, 26); ctx.strokeRect(-CARD_W / 2 - 6 - off, -14, CARD_W / 2 + 6, 26);
  ctx.fillRect(off, -14, CARD_W / 2 + 6, 26); ctx.strokeRect(off, -14, CARD_W / 2 + 6, 26);
  ctx.fillStyle = '#a0522d'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-CARD_W / 2 + 12 + i * 22 - off, 0, 5, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(14 + i * 22 + off, 0, 5, 0, 6.283); ctx.fill(); }
  ctx.restore();
}

// ---------------------------------------------------------------- gating
function busy() { return S.q.length > 0 || S.wait > 0; }
function canAct() { return S && !busy() && !S.c.over && !S.c.pending && !S.modal && !S.ending && APP.stack[APP.stack.length - 1] === SCREEN; }

// ---------------------------------------------------------------- actions
function reject(dc, why) {
  const msg = WHY[why] || 'Cannot play that';
  if (dc) { dc.shakeT = 1; S.fx.float(msg, clamp(dc.x, 140, 1140), Math.max(330, dc.y - 190), { color: COL.bad, size: 22, life: 0.9 }); }
  sfx('error');
}
function tryPlay(uid, ed) {
  const c = S.c;
  const hi = c.hand.findIndex((k) => k.uid === uid); if (hi < 0) return false;
  const dc = S.hand.find((d) => d.uid === uid);
  const chk = canPlay(c, hi);
  if (!chk.ok) { reject(dc, chk.why); return false; }
  if (needsTarget(c, hi) && !ed) { S.sel = uid; return false; }
  const ti = ed ? c.enemies.indexOf(ed.e) : undefined;
  const r = playCard(c, hi, ti);
  if (!r.ok) { reject(dc, r.why); return false; }
  S.sel = null; S.drag = null; S.potSel = null;
  absorb(); return true;
}
function doEndTurn() {
  if (!canAct()) return;
  endTurn(S.c); S.sel = null; absorb();
}
function tryPotion(i, ed) {
  const id = S.run.potions[i]; if (!id || !canAct()) return false;
  const p = POTIONS[id];
  const live = S.c.enemies.filter((e) => !e.dead);
  if (p.target === 'enemy' && live.length > 1 && !ed) { S.potSel = i; S.sel = null; return false; }
  const ti = ed ? S.c.enemies.indexOf(ed.e) : S.c.enemies.indexOf(live[0]);
  const r = usePotion(S.c, i, ti);
  S.potSel = null;
  if (r.ok) absorb();
  return r.ok;
}
const potionPos = (i) => ({ x: L.POTION0.x + i * L.POTION0.step + L.POTION0.size / 2, y: L.POTION0.y + L.POTION0.size / 2 });

function enemyAt(x, y) {
  let best = null;
  for (const ed of S.eds) {
    if (!ed.visible || ed.e.dead) continue;
    const hw = Math.max(ed.w / 2 + 6, 40);
    if (L.inRectXY(x, y, ed.x - hw, FOOT_Y - ed.h - 14, hw * 2, ed.h + 90)) { if (!best || Math.abs(ed.x - x) < Math.abs(best.x - x)) best = ed; }
  }
  return best;
}
function selNeedsTarget() { if (!S.sel) return false; const hi = S.c.hand.findIndex((k) => k.uid === S.sel); return hi >= 0 && needsTarget(S.c, hi); }
function targeting() { return (S.sel && selNeedsTarget()) || (S.potSel !== null && S.potSel !== undefined); }

function selectCard(uid) {
  if (!S.hand.some((d) => d.uid === uid)) return;
  S.sel = uid; S.potSel = null; S.tgt = 0; S.kbTarget = false; sfx('uiClick', { pitch: 1.3 });
}

// ---------------------------------------------------------------- input
function updateInput(app, dt) {
  const m = app.mouse, c = S.c;
  const mine = app.stack[app.stack.length - 1] === SCREEN;
  const keys = mine ? app.pressedKeys.slice() : [];
  if (!mine || app.blocked) { S.hov = null; S.down = null; return; }

  // speed-up while the queue plays
  if (busy() && !S.ending) { if (m.pressed || keys.some((e) => e.key === ' ' || e.key === 'Enter')) S.skip = true; }
  if (S.ending) {
    if (m.pressed && S.ending.t > 0.5) S.ending.skip = true;
    if (keys.some((e) => e.key === ' ' || e.key === 'Enter') && S.ending.t > 0.4) S.ending.skip = true;
  }

  // ---- hover over hand
  S.hov = null;
  if (!S.modal && !S.ending && !(S.drag)) {
    const prev = S.hovPrev;
    let cand = null;
    if (prev) { const dc = S.hand.find((d) => d.uid === prev); if (dc && L.inRectXY(m.x, m.y, ...rectArr(dc))) cand = dc; }
    if (!cand) for (let i = S.hand.length - 1; i >= 0; i--) { const dc = S.hand[i]; if (dc.alpha > 0.3 && L.inRectXY(m.x, m.y, ...rectArr(dc))) { cand = dc; break; } }
    if (cand && m.y > 300) { S.hov = cand.uid; if (S.hovPrev !== cand.uid) sfx('uiHover', { vol: 0.3 }); }
    S.hovPrev = S.hov;
  } else if (S.drag) S.hov = S.drag.uid;

  if (S.modal) { modalKeys(keys); S.down = null; return; }
  if (c.pending) { pendingKeys(keys); S.down = null; return; }
  if (S.ending) return;

  const act = canAct();

  // ---- keyboard
  for (const e of keys) {
    const k = e.key;
    if (k === 'Escape') { if (S.sel || S.potSel !== null && S.potSel !== undefined) { S.sel = null; S.potSel = null; S.drag = null; sfx('uiBack'); } else if (!busy()) app.shared.flow.openSettings && app.shared.flow.openSettings(); }
    else if (k === 'q' || k === 'Q') S.modal = { kind: 'piles', tab: 'draw', scroll: 0 };
    else if (act) {
      if (/^[0-9]$/.test(k)) {
        const idx = k === '0' ? 9 : Number(k) - 1; const dc = S.hand[idx];
        if (dc) { if (S.sel === dc.uid) tryPlay(dc.uid, selNeedsTarget() ? liveEds()[S.tgt % Math.max(1, liveEds().length)] : null); else selectCard(dc.uid); }
      } else if (k === 'Tab') { const l = liveEds(); if (l.length) { S.tgt = (S.tgt + (e.shiftKey ? l.length - 1 : 1)) % l.length; S.kbTarget = true; sfx('uiHover'); } }
      else if (k === 'Enter' || k === ' ') {
        if (S.sel) { const l = liveEds(); tryPlay(S.sel, selNeedsTarget() ? l[S.tgt % Math.max(1, l.length)] : null); }
        else if (S.potSel !== null && S.potSel !== undefined) { const l = liveEds(); tryPotion(S.potSel, l[S.tgt % Math.max(1, l.length)]); }
        else doEndTurn();
      } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const i = S.hand.findIndex((d) => d.uid === S.sel); const n = S.hand.length; if (n) selectCard(S.hand[(i < 0 ? (k === 'ArrowRight' ? 0 : n - 1) : (i + (k === 'ArrowRight' ? 1 : n - 1)) % n)].uid);
      }
    }
  }

  // ---- mouse
  if (m.pressed && m.button === 2) { if (S.sel || S.potSel !== null && S.potSel !== undefined) { S.sel = null; S.potSel = null; S.drag = null; sfx('uiBack'); } S.down = null; return; }
  if (m.pressed) S.down = { x: m.x, y: m.y, uid: act ? S.hov : null, moved: false };
  if (S.down && S.down.uid && m.down && !S.drag && act && Math.hypot(m.x - S.down.x, m.y - S.down.y) > 12) { S.drag = { uid: S.down.uid }; S.sel = S.down.uid; S.down.moved = true; }
  if (m.released) {
    const dn = S.down; S.down = null;
    if (S.drag) { dropDrag(m); }
    else if (act && dn) clickAt(m, dn);
  }
  // sel survives only while the card exists
  if (S.sel && !S.hand.some((d) => d.uid === S.sel)) S.sel = null;
  if (S.drag && !m.down && !m.released) S.drag = null;
}
const rectArr = (dc) => { const r = dcRect(dc); return [r.x, r.y, r.w, r.h]; };

function dropDrag(m) {
  const uid = S.drag.uid; S.drag = null;
  if (m.y < PLAY_LINE && m.y > L.BAR_H) {
    if (S.c.hand.findIndex((k) => k.uid === uid) >= 0) {
      const hi = S.c.hand.findIndex((k) => k.uid === uid);
      if (needsTarget(S.c, hi)) { const ed = enemyAt(m.x, m.y); if (ed) tryPlay(uid, ed); else { S.sel = uid; S.tgt = 0; } }
      else tryPlay(uid, null);
    }
  } else S.sel = null;
}
function clickAt(m, dn) {
  const x = m.x, y = m.y;
  // potion target mode
  if (S.potSel !== null && S.potSel !== undefined) { const ed = enemyAt(x, y); if (ed) tryPotion(S.potSel, ed); else if (y > L.BAR_H) { S.potSel = null; } return; }
  // click on a card
  if (dn.uid && S.hov === dn.uid) {
    const uid = dn.uid;
    if (S.sel === uid) { if (!selNeedsTarget()) tryPlay(uid, null); else { const l = liveEds(); if (l.length === 1) tryPlay(uid, l[0]); } }
    else selectCard(uid);
    return;
  }
  if (S.sel) {
    if (selNeedsTarget()) { const ed = enemyAt(x, y); if (ed) tryPlay(S.sel, ed); }
    else if (y < PLAY_LINE && y > L.BAR_H + 4) tryPlay(S.sel, null);
    else if (y >= PLAY_LINE && !S.hov) S.sel = null;
  }
}

// ---------------------------------------------------------------- modals
function poolOf(kind) {
  const c = S.c;
  return kind === 'draw' ? c.drawPile.slice().sort((a, b) => a.inst.id.localeCompare(b.inst.id)) : kind === 'discard' ? c.discard : c.exhaust;
}
function modalKeys(keys) {
  for (const e of keys) {
    if (e.key === 'Escape' || e.key === 'q' || e.key === 'Q') { S.modal = null; sfx('uiBack'); }
    else if (e.key === 'Tab' || e.key === 'ArrowRight') { const t = ['draw', 'discard', 'exhaust']; S.modal.tab = t[(t.indexOf(S.modal.tab) + 1) % 3]; S.modal.scroll = 0; }
    else if (e.key === 'ArrowLeft') { const t = ['draw', 'discard', 'exhaust']; S.modal.tab = t[(t.indexOf(S.modal.tab) + 2) % 3]; S.modal.scroll = 0; }
  }
}
function pendingNeed() { const p = S.c.pending; if (!p) return 0; return Math.min(p.n, pendPool().length); }
function pendPool() { const p = S.c.pending; return p.kind === 'fetch' ? (p.zone === 'exhaust' ? S.c.exhaust : S.c.discard) : S.c.hand; }
function pendingKeys(keys) {
  for (const e of keys) if (e.key === 'Enter' || e.key === ' ') confirmPending();
}
function confirmPending() {
  const c = S.c; if (!c.pending) return;
  if (S.pend.size !== pendingNeed()) { sfx('error'); return; }
  const ok = resolvePending(c, [...S.pend]);
  if (ok) { S.pend.clear(); absorb(); } else sfx('error');
}

function cardGrid(n, cw, ch, x0, x1, gap) {
  const cols = Math.max(1, Math.min(n, Math.floor((x1 - x0 + gap) / (cw + gap))));
  return { cols, pos: (i) => { const r = Math.floor(i / cols), col = i % cols; const rowN = Math.min(cols, n - r * cols); const rw = rowN * (cw + gap) - gap; return { x: (x0 + x1) / 2 - rw / 2 + col * (cw + gap) + cw / 2, y: r * (ch + gap) + ch / 2 }; }, rows: Math.ceil(n / cols) };
}

function drawPilesModal(app) {
  const ctx = app.ctx, M = S.modal, c = S.c;
  ctx.save(); ctx.fillStyle = 'rgba(8,6,6,.86)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  const tabs = [['draw', 'Draw'], ['discard', 'Discard'], ['exhaust', 'Exhaust']];
  tabs.forEach(([k, lab], i) => {
    const n = k === 'draw' ? c.drawPile.length : k === 'discard' ? c.discard.length : c.exhaust.length;
    if (app.button(`${lab} (${n})`, 330 + i * 200, 22, 180, 44, { fill: M.tab === k ? COL.attack : COL.slab2, size: 20 })) { M.tab = k; M.scroll = 0; }
  });
  if (app.button('Close', 1120, 22, 120, 44, { size: 20 })) { S.modal = null; sfx('uiBack'); return; }
  const pool = poolOf(M.tab);
  app.text(M.tab === 'draw' ? 'Draw pile (shown in no particular order)' : M.tab === 'discard' ? 'Discard pile' : 'Exhausted this combat', 40, 34, { size: 20, color: COL.lamp });
  if (!pool.length) { app.text('Empty.', W / 2, 300, { size: 28, align: 'center', color: 'rgba(232,220,196,.6)' }); return; }
  const sc = 0.5, cw = CARD_W * sc, ch = CARD_H * sc;
  const g = cardGrid(pool.length, cw, ch, 60, W - 60, 14);
  const viewTop = 90, viewH = H - viewTop - 10, total = g.rows * (ch + 14);
  M.scroll = clamp(M.scroll + app.mouse.wheel * 0.5, 0, Math.max(0, total - viewH));
  ctx.save(); ctx.beginPath(); ctx.rect(0, viewTop, W, viewH); ctx.clip();
  let hover = null;
  pool.forEach((w, i) => {
    const p = g.pos(i); const x = p.x, y = viewTop + p.y - M.scroll;
    if (y < viewTop - ch || y > H + ch) return;
    const spec = specOf(c, w);
    drawCard(ctx, spec, x, y, { scale: sc, tithed: w.tithed, jam: w.jam, cost: effCost(c, w) });
    if (app.inRect(x - cw / 2, Math.max(viewTop, y - ch / 2), cw, ch) && app.mouse.y > viewTop) hover = { w, spec, x, y };
  });
  ctx.restore();
  if (hover) {
    const hx = clamp(hover.x, 130, W - 400), hy = clamp(hover.y, 200, 520);
    drawCard(ctx, hover.spec, hx, hy, { scale: 0.95, tithed: hover.w.tithed, jam: hover.w.jam, cost: effCost(c, hover.w), hover: true });
    drawSections(app, cardSections(hover.spec, hover.w, null), hx + 120, 100, 250, 500);
  }
}

function drawPendingModal(app) {
  const ctx = app.ctx, c = S.c, p = c.pending;
  ctx.save(); ctx.fillStyle = 'rgba(8,6,6,.82)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  const pool = pendPool(), need = pendingNeed();
  const verb = p.kind === 'discard' ? 'Discard' : p.kind === 'exhaust' ? 'Exhaust' : `Take from ${p.zone === 'exhaust' ? 'exhaust' : 'discard'}`;
  app.text(`Choose ${need}`, W / 2, 56, { size: 44, bold: true, align: 'center', color: COL.lamp, shadow: true });
  app.text(`${verb} ${need} card${need === 1 ? '' : 's'}.   Selected ${S.pend.size} / ${need}`, W / 2, 112, { size: 20, ui: true, align: 'center', color: COL.vellum });
  const sc = pool.length <= 6 ? 0.78 : pool.length <= 10 ? 0.6 : 0.46;
  const cw = CARD_W * sc, ch = CARD_H * sc;
  const g = cardGrid(pool.length, cw, ch, 50, W - 50, 14);
  const total = g.rows * (ch + 14), viewTop = 150, viewH = 470;
  S.pendScroll = clamp((S.pendScroll || 0) + app.mouse.wheel * 0.5, 0, Math.max(0, total - viewH));
  const oy = viewTop + Math.max(0, (viewH - total) / 2) - S.pendScroll;
  ctx.save(); ctx.beginPath(); ctx.rect(0, viewTop - 10, W, viewH + 20); ctx.clip();
  let hover = null;
  pool.forEach((w, i) => {
    const pos = g.pos(i); const sel = S.pend.has(w.uid);
    const x = pos.x, y = oy + pos.y - (sel ? 14 : 0);
    const spec = specOf(c, w);
    drawCard(ctx, spec, x, y, { scale: sc * (sel ? 1.05 : 1), tithed: w.tithed, jam: w.jam, cost: effCost(c, w), selected: sel, glow: sel ? 1 : 0 });
    const over = app.inRect(x - cw / 2, y - ch / 2, cw, ch);
    if (over) { hover = { w, spec }; app.cursor = 'pointer'; }
    if (over && app.clicked(x - cw / 2, y - ch / 2, cw, ch)) {
      if (sel) S.pend.delete(w.uid); else { if (S.pend.size >= need) S.pend.delete(S.pend.values().next().value); S.pend.add(w.uid); }
      sfx('uiClick');
    }
  });
  ctx.restore();
  if (hover && pool.length > 6) drawSections(app, cardSections(hover.spec, hover.w, null), W - 270, 150, 250, 400);
  const ready = S.pend.size === need;
  if (app.button('Confirm', W / 2 - 100, 640, 200, 52, { size: 24, fill: ready ? COL.attack : COL.slab2, disabled: !ready })) confirmPending();
}

// ---------------------------------------------------------------- layout of enemies
function fixLayout(snap) {
  const res = S.eds.filter((ed) => ed.reserve && !ed.gone);
  const sl = L.enemySlots(res.map((ed) => ed.e.def));
  res.forEach((ed, i) => { ed.tx = sl[i].x; ed.tscale = sl[i].scale; ed.w = sl[i].w; ed.h = sl[i].h; if (snap || !ed.placed) { ed.x = ed.tx; ed.scale = ed.tscale; ed.placed = true; } });
}

// ---------------------------------------------------------------- update
function update(app, dt) {
  if (!S) return;
  const raw = Math.min(dt, 0.05);
  const fxd = S.fx.update(raw);
  const ad = fxd * (S.skip ? 2.5 : 1);
  S.t += ad;

  // queue pump
  S.wait -= ad * 1000 * (S.skip ? 3 : 1);
  let guard = 0;
  while (S.wait <= 0 && S.q.length && guard++ < 400) {
    const ev = S.q.shift();
    let w = 0;
    try { w = handle(ev) || 0; } catch (err) { if (typeof console !== 'undefined') console.error('combat event', ev, err); }
    S.wait += w;
    if (S.wait > 0) break;
  }
  if (!S.q.length && S.wait <= 0) { S.wait = 0; if (!S.idleSynced) syncIdle(); } else S.idleSynced = false;

  fixLayout(false);
  const P = S.P;
  tickEnt(P, ad);
  P.attack = P.attack > 0 ? (P.attack += ad * 4, P.attack >= 2 ? 0 : P.attack) : 0;
  S.heroKick = Math.max(0, (S.heroKick || 0) - ad * 5);
  for (const ed of S.eds) {
    tickEnt(ed, ad);
    if (!ed.visible) continue;
    ed.spawnT = Math.min(1, ed.spawnT + ad / 0.35);
    ed.x += (ed.tx - ed.x) * (1 - Math.exp(-ad * 8)); ed.scale += (ed.tscale - ed.scale) * (1 - Math.exp(-ad * 8));
    if (ed.intentT < 1 && !ed.dyingOn) ed.intentT = Math.min(1, ed.intentT + ad / 0.45);
    if (ed.intentOut > 0) ed.intentOut = Math.min(1, ed.intentOut + ad / 0.25);
    if (ed.atkT >= 0) { ed.atkT += ad; const dur = ed.atkKind === 'attack' ? 0.5 : 0.45; if (ed.atkT >= dur) ed.atkT = -1; }
    if (ed.callout) { ed.callout.t += ad; if (ed.callout.t > 1) ed.callout = null; }
    if (ed.stunT > 0) ed.stunT = Math.max(0, ed.stunT - ad * 1.5);
    if (ed.dyingOn && !ed.gone) { ed.dying = Math.min(1, ed.dying + ad / (ed.quick ? 0.3 : 0.85)); if (ed.dying >= 1) { ed.gone = true; } }
    // lunge parameter: out fast, back slower
    if (ed.atkT >= 0 && ed.atkKind === 'attack') { const k = ed.atkT / 0.5; ed.atk = k < 0.4 ? EASE.out(k / 0.4) : 1 - EASE.inOut((k - 0.4) / 0.6); } else ed.atk = 0;
  }
  if (S.ending && S.ending.win === false) S.P.dying = clamp(S.ending.t / 1.2, 0, 1);
  S.vig = Math.max(0, S.vig - ad * 2.2); S.lamp = Math.max(0, S.lamp - ad * 0.7); S.dark = Math.max(0, S.dark - ad * 0.55);
  S.orbPulse = Math.max(0, S.orbPulse - ad * 3); S.goldPulse = Math.max(0, S.goldPulse - ad * 3);
  for (const k of Object.keys(S.pulse)) S.pulse[k] = Math.max(0, S.pulse[k] - ad * 3);
  if (S.banner) { S.banner.t += ad; if (S.banner.t > S.banner.life) S.banner = null; }
  for (const sp of S.spr) stepSprite(sp, ad);
  S.spr = S.spr.filter((s) => !s.done);
  for (const co of S.coins) {
    co.t += ad;
    if (co.t >= co.dur && !co.done) { co.done = true; S.goldPulse = 1; sfx('coin', { vol: 0.3, pitch: 1 + Math.random() * 0.3 }); }
  }
  S.coins = S.coins.filter((c2) => !c2.done);
  S.hand = S.hand.filter((dc) => !!dc);

  updateInput(app, dt);
  layoutHand(app, ad || raw * 0.0);
  if (S.ending) updateEnding(app, raw);
  else if (S.c.over && !busy() && S.eds.every((ed) => !ed.dyingOn || ed.dying >= 0.6 || ed.gone || S.c.over === 'lose')) startEnding();
}

function syncIdle() {
  const c = S.c, P = S.P;
  S.idleSynced = true;
  const snap = (en, src) => { en.hp = Math.max(0, src.hp); en.maxHp = src.maxHp; en.block = src.block; en.st = { ...src.st }; if (en.trail < en.hp) en.trail = en.hp; };
  snap(P, c.player);
  for (const ed of S.eds) if (!ed.dyingOn) snap(ed, ed.e);
  S.energy = c.energy; S.maxEnergy = c.maxEnergy; S.gold = S.run.gold || 0; S.potions = S.run.potions.slice(); S.skip = false;
  // reconcile the hand with the engine
  const want = c.hand.map((k) => k.uid);
  S.hand = S.hand.filter((dc) => want.includes(dc.uid));
  c.hand.forEach((w) => { if (!S.hand.some((d) => d.uid === w.uid)) { const dc = mkDc(w, { x: L.DRAW_POS.x, y: L.DRAW_POS.y, s: 0.25, alpha: 0 }); dc.jam = !!w.jam; S.hand.push(dc); } });
  S.hand.sort((a, b) => want.indexOf(a.uid) - want.indexOf(b.uid));
  for (const dc of S.hand) { if (dc.w.jam) dc.jam = true; else if (!dc.w.jam) dc.jam = false; }
  for (const k of S.zone.keys()) { /* zones are tallies only while animating */ }
}

// ---------------------------------------------------------------- ending
function startEnding() {
  const win = S.c.over === 'win';
  S.ending = { t: 0, win, skip: false };
  S.sel = null; S.drag = null;
  if (win) { sfx('win'); S.banner = { title: 'VICTORY', sub: S.c.goldGained ? `+${S.c.goldGained} gold` : '', t: 0, life: 2.4, style: 'win' }; }
  else { sfx('lose'); S.banner = { title: 'YOU DIED', sub: 'The ward remembers.', t: 0, life: 3, style: 'lose' }; }
}
function updateEnding(app, raw) {
  const E = S.ending;
  E.t += raw * (E.skip ? 4 : 1);
  if (E.win) {
    if (E.t < 1.1 && Math.random() < 0.7) S.fx.emit({ x: rnd(80, 1200), y: -10, n: 2, shape: 'coin', colors: ['#F2C14E', '#ffe38a'], speed: 80, angle: Math.PI / 2, spread: 0.5, gravity: 800, life: 1.5, size: 7 });
  }
  const end = E.win ? 1.6 : 2.2;
  if (E.t >= end && !S.finalized) finalize();
}
function finalize() {
  S.finalized = true;
  const { run, c } = S;
  const res = finishCombat(c);
  RUN.resolveFight(run, res);
  const flow = APP.shared.flow;
  if (flow && flow.route) flow.route();
}

// ---------------------------------------------------------------- draw
function theme() { return ACT_THEME[S.run.act] || 'ward'; }
function vignette(ctx, a, color) {
  if (a <= 0) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 760);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, rgba(color, clamp(a, 0, 1)));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function draw(app) {
  if (!S) return;
  const ctx = app.ctx, fx = S.fx, c = S.c;
  const so = fx.shakeOffset();
  ctx.save();
  ctx.fillStyle = COL.slab; ctx.fillRect(0, 0, W, H);
  ctx.translate(so.x, so.y);
  drawBackground(ctx, theme(), S.t);
  if (S.boss) { ctx.fillStyle = 'rgba(120,10,24,.2)'; ctx.fillRect(-20, -20, W + 40, H + 40); }
  const tgtMode = targeting() || (S.drag && selNeedsTarget());
  drawHeroAndHud(app);
  drawEnemies(app, tgtMode);
  drawSprites(app);
  drawCoins(app);
  drawHand(app);
  drawHudBottom(app);
  fx.draw(ctx);
  if (tgtMode) drawAimArrow(app);
  ctx.restore();
  drawTopBar(app);
  fx.drawFlash(ctx, W, H);
  vignette(ctx, 0.35, '#000000');
  if (S.boss) vignette(ctx, 0.25, '#3a0008');
  if (S.vig > 0) vignette(ctx, S.vig * 0.75, '#b3263a');
  if (S.lamp > 0) { ctx.fillStyle = `rgba(0,0,0,${S.lamp * 0.45})`; ctx.fillRect(0, 0, W, H); }
  if (S.dark > 0) { ctx.fillStyle = `rgba(0,0,0,${S.dark * 0.6})`; ctx.fillRect(0, 0, W, H); }
  if (S.drag && !selNeedsTarget()) drawPlayZone(app);
  drawCardInfo(app);
  drawBanner(app);
  drawTips(app);
  if (c.pending && !S.ending && !busy()) drawPendingModal(app);
  if (S.modal) drawPilesModal(app);
}

function drawPlayZone(app) {
  const ctx = app.ctx; const on = app.mouse.y < PLAY_LINE;
  ctx.save(); ctx.strokeStyle = on ? COL.lamp : 'rgba(232,220,196,.25)'; ctx.setLineDash([10, 8]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(150, PLAY_LINE); ctx.lineTo(1130, PLAY_LINE); ctx.stroke(); ctx.setLineDash([]);
  app.text(on ? 'Release to play' : 'Drag up to play', W / 2, PLAY_LINE - 28, { size: 18, ui: true, align: 'center', color: on ? COL.lamp : 'rgba(232,220,196,.5)' });
  ctx.restore();
}

function drawHeroAndHud(app) {
  const ctx = app.ctx, P = S.P;
  // shadow
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(HERO_X, FOOT_Y + 4, 70, 12, 0, 0, 6.283); ctx.fill(); ctx.restore();
  const lunge = P.attack > 0 ? Math.sin(Math.min(1, P.attack / 2) * Math.PI) : 0;
  const hx = HERO_X + lunge * 34 - (S.heroKick || 0) * 14;
  const dying = S.ending && !S.ending.win ? P.dying : 0;
  ctx.save();
  if (dying) ctx.globalAlpha = 1 - dying * 0.6;
  drawHero(ctx, S.run.hero, hx, FOOT_Y + dying * 24, { scale: 1, t: S.t, hurt: P.hurt, attack: lunge, dying });
  ctx.restore();
  // hud
  const bw = 190, bx = HERO_X - bw / 2, by = FOOT_Y + 24;
  drawBar(app, bx, by, bw, 16, P.shown, P.trail, P.maxHp, '#b3263a', `${Math.max(0, Math.ceil(P.hp))}/${P.maxHp}`);
  if (P.block > 0) {
    const sc = 1 + P.bpulse * 0.35;
    ctx.save(); ctx.translate(bx - 6, by + 8); ctx.scale(sc, sc); drawShield(ctx, 0, 0, 34, P.block); ctx.restore();
    if (app.inRect(bx - 24, by - 10, 36, 36)) app.tooltip('Block ' + P.block, 'Absorbs damage until your next turn.', { color: '#bcd0d8' });
  }
  drawStatusRow(app, P, HERO_X, by + 24, 220, 24, S.t);
  if (app.inRect(bx, by, bw, 16)) app.tooltip(HEROES[S.run.hero].name, `HP ${P.hp} / ${P.maxHp}`, { color: COL.bad });
}

function drawEnemies(app, tgtMode) {
  const ctx = app.ctx, c = S.c;
  const mouseEd = tgtMode || true ? enemyAt(app.mouse.x, app.mouse.y) : null;
  const l = liveEds();
  const kbEd = S.kbTarget && l.length ? l[S.tgt % l.length] : null;
  const hoverEd = app.blocked || S.hov ? null : (S.drag || tgtMode ? (S.kbTarget ? kbEd : mouseEd) : mouseEd);
  S.hoverEd = hoverEd;
  for (const ed of S.eds) {
    if (!ed.visible || ed.gone) continue;
    const def = ed.e.def;
    const sp = EASE.out(ed.spawnT);
    const fade = 1 - clamp((ed.dying - 0.55) / 0.45, 0, 1);
    const alpha = clamp(sp * 1.5, 0, 1) * fade;
    const drop = (1 - sp) * ed.drop * -140;
    // target highlight
    if (tgtMode && !ed.e.dead) {
      const hot = hoverEd === ed;
      ctx.save(); ctx.strokeStyle = hot ? COL.lamp : 'rgba(242,193,78,.45)'; ctx.lineWidth = hot ? 4 : 2.5; ctx.shadowColor = COL.lamp; ctx.shadowBlur = hot ? 18 : 6;
      ctx.beginPath(); ctx.ellipse(ed.x, FOOT_Y + 6, ed.w * 0.55 + (hot ? 10 : 0) + Math.sin(S.t * 6) * 2, 16, 0, 0, 6.283); ctx.stroke();
      if (hot) { ctx.fillStyle = 'rgba(242,193,78,.1)'; ctx.fillRect(ed.x - ed.w / 2 - 8, FOOT_Y - ed.h - 8, ed.w + 16, ed.h + 20); }
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(ed.x, FOOT_Y + 4, ed.w * 0.42, 10, 0, 0, 6.283); ctx.fill();
    const stun = ed.stunT > 0 ? Math.sin(S.t * 60) * 4 * ed.stunT : 0;
    const x = ed.x - ed.atk * 46 * ed.scale + ed.kick * 12 + stun;
    drawEnemy(ctx, def, x, FOOT_Y + drop, { scale: ed.scale, t: S.t + ed.phase, hurt: ed.hurt, dying: ed.dying, attack: ed.atk, st: ed.st });
    ctx.restore();
    if (ed.dyingOn) continue;
    drawEnemyHud(app, ed, alpha, hoverEd === ed);
  }
}

function drawEnemyHud(app, ed, alpha, hot) {
  const ctx = app.ctx, def = ed.e.def;
  const hudW = clamp(ed.w * 0.95, 96, 170);
  const nameY = FOOT_Y + 18;
  const col = def.kind === 'boss' ? COL.scar : def.kind === 'elite' ? COL.lamp : COL.vellum;
  ctx.save(); ctx.globalAlpha = alpha;
  app.text(ed.e.name, ed.x, nameY, { size: ed.scale < 0.8 ? 14 : 17, bold: true, align: 'center', color: col, shadow: true });
  const by = nameY + 24;
  drawBar(app, ed.x - hudW / 2, by, hudW, 14, ed.shown, ed.trail, ed.maxHp, '#a8412f', `${Math.max(0, Math.ceil(ed.hp))}/${ed.maxHp}`);
  if (ed.block > 0) {
    const sc = 1 + ed.bpulse * 0.35;
    ctx.save(); ctx.translate(ed.x - hudW / 2 - 6, by + 7); ctx.scale(sc, sc); drawShield(ctx, 0, 0, 30, ed.block); ctx.restore();
    if (app.inRect(ed.x - hudW / 2 - 22, by - 8, 32, 32)) app.tooltip('Block ' + ed.block, 'Absorbs damage until this enemy acts.', { color: '#bcd0d8' });
  }
  drawStatusRow(app, ed, ed.x, by + 20, Math.max(hudW + 20, 110), ed.scale < 0.8 ? 20 : 22, S.t);
  ctx.restore();
  // intent bubble
  const info = ed.move ? intentWith(ed, ed.move) : null;
  const iy = FOOT_Y - ed.h - 34 + Math.sin(S.t * 2.4 + ed.phase) * 3;
  if (info && ed.intentOut < 1) {
    const r = drawIntentBubble(app, info, ed.x, iy, ed.intentT, (1 - ed.intentOut) * alpha);
    if (r.w && ed.intentOut === 0 && app.inRect(ed.x - r.w / 2, iy - r.h / 2, r.w, r.h)) app.tooltip(info.hidden ? 'Hidden intent' : moveName(info), intentText(info), { color: COL.vellum });
  }
  if (ed.callout && ed.callout.text) {
    const k = ed.callout.t; ctx.save(); ctx.globalAlpha = clamp(1 - (k - 0.6) / 0.4, 0, 1) * alpha;
    app.text(ed.callout.text, ed.x, iy - 10 - k * 16, { size: 22, bold: true, align: 'center', color: COL.vellum, stroke: '#0e0e0e', strokeW: 5, baseline: 'middle' }); ctx.restore();
  }
  // hover tooltip on the body
  if (hot && !app.blocked) {
    const ents = Object.keys(ed.st).length;
    if (!targeting() && app.inRect(ed.x - ed.w / 2, FOOT_Y - ed.h, ed.w, ed.h)) {
      const kindTxt = def.kind === 'boss' ? 'Boss' : def.kind === 'elite' ? 'Elite' : '';
      app.tooltip(ed.e.name + (kindTxt ? `  (${kindTxt})` : ''), (info ? intentText(info) + '\n' : '') + `HP ${ed.hp}/${ed.maxHp}` + (ents ? '' : ''), { color: col2(def) });
    }
  }
}
const col2 = (def) => (def.kind === 'boss' ? COL.scar : def.kind === 'elite' ? COL.lamp : COL.vellum);

function drawCoins(app) {
  const ctx = app.ctx;
  for (const co of S.coins) {
    if (co.t < 0) continue;
    const k = EASE.in(clamp(co.t / co.dur, 0, 1));
    const x = lerp(co.x, co.tx, k), y = lerp(co.y, co.ty, k) - Math.sin(k * Math.PI) * co.arc;
    drawCoin(ctx, x, y, 18 * (1 - k * 0.3));
  }
}

function drawAimArrow(app) {
  const ctx = app.ctx, m = app.mouse;
  const dc = S.hand.find((d) => d.uid === S.sel);
  let from = dc ? { x: dc.x, y: dc.y - CARD_H * dc.s / 2 } : (S.potSel != null ? { x: potionPos(S.potSel).x, y: 56 } : null);
  if (!from) return;
  if (S.drag) from = { x: L.HAND_CX, y: L.HAND_Y - 90 };
  const ed = S.hoverEd;
  const to = ed ? { x: ed.x, y: FOOT_Y - ed.h * 0.7 } : { x: m.x, y: m.y };
  const cx = (from.x + to.x) / 2, cy = Math.min(from.y, to.y) - 140;
  ctx.save();
  ctx.strokeStyle = ed ? COL.lamp : 'rgba(242,193,78,.7)'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 5; ctx.setLineDash([2, 12]); ctx.lineCap = 'round';
  ctx.shadowColor = COL.lamp; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo(cx, cy, to.x, to.y); ctx.stroke(); ctx.setLineDash([]);
  // arrow head along tangent at the end
  const tx = to.x - cx, ty = to.y - cy, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
  ctx.beginPath(); ctx.moveTo(to.x, to.y); ctx.lineTo(to.x - ux * 22 - uy * 11, to.y - uy * 22 + ux * 11); ctx.lineTo(to.x - ux * 22 + uy * 11, to.y - uy * 22 - ux * 11); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawTopBar(app) {
  const ctx = app.ctx, run = S.run, P = S.P, hero = HEROES[run.hero];
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, L.BAR_H); g.addColorStop(0, 'rgba(14,12,10,.96)'); g.addColorStop(1, 'rgba(26,22,20,.88)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, L.BAR_H);
  ctx.fillStyle = 'rgba(232,220,196,.25)'; ctx.fillRect(0, L.BAR_H - 1, W, 1);
  ctx.restore();
  drawPortrait(ctx, run.hero, 32, 28, 40);
  app.text(hero.name, 60, 7, { size: 19, bold: true, color: COL.vellum });
  app.text(hero.title || '', 60, 30, { size: 12, ui: true, color: 'rgba(232,220,196,.6)' });
  drawHeart(ctx, 192, 28, 26);
  app.text(`${Math.max(0, Math.ceil(P.hp))}/${P.maxHp}`, 210, 17, { size: 19, bold: true, ui: true, color: COL.bad });
  const gp = 1 + S.goldPulse * 0.25;
  ctx.save(); ctx.translate(L.GOLD_POS.x - 10, L.GOLD_POS.y); ctx.scale(gp, gp); drawCoin(ctx, 0, 0, 24); ctx.restore();
  app.text(String(S.gold), L.GOLD_POS.x + 8, 17, { size: 19, bold: true, ui: true, color: COL.gold });
  // potions
  const slots = RUN.potionSlots(run);
  for (let i = 0; i < slots; i++) {
    const x = L.POTION0.x + i * L.POTION0.step, y = L.POTION0.y, sz = L.POTION0.size;
    const id = S.potions[i];
    app.rr(x, y, sz, sz, 8); ctx.save(); ctx.fillStyle = 'rgba(40,34,30,.9)'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = (S.potSel === i) ? COL.lamp : 'rgba(232,220,196,.35)'; ctx.stroke(); ctx.restore();
    if (id) {
      drawPotion(ctx, id, x + sz / 2, y + sz / 2, sz - 8);
      const p = POTIONS[id];
      if (app.inRect(x, y, sz, sz)) {
        app.cursor = 'pointer'; app.tooltip(p.name, p.text + (canAct() ? '\n(click to use)' : ''), { color: COL.energy });
        if (canAct() && app.clicked(x, y, sz, sz)) { if (S.potSel === i) S.potSel = null; else tryPotion(S.run.potions.indexOf(id) >= 0 ? i : i, null); }
      }
    }
  }
  // relics
  const rl = run.relics || [];
  const step = Math.min(L.RELIC0.size + 4, (L.RELIC0.x1 - L.RELIC0.x) / Math.max(1, rl.length));
  rl.forEach((id, i) => {
    const x = L.RELIC0.x + i * step + L.RELIC0.size / 2, y = L.RELIC0.y;
    drawRelic(ctx, id, x, y, L.RELIC0.size);
    const r = RELICS[id];
    if (r && app.inRect(x - L.RELIC0.size / 2, y - L.RELIC0.size / 2, L.RELIC0.size, L.RELIC0.size)) app.tooltip(r.name, r.text, { color: COL.lamp });
  });
  app.text(`Turn ${Math.max(1, S.turn)}`, 972, 15, { size: 20, bold: true, align: 'center', color: COL.vellum });
  if (app.button('Deck', L.DECK_BTN.x, L.DECK_BTN.y, L.DECK_BTN.w, L.DECK_BTN.h, { size: 18 })) { const f = app.shared.flow; if (f && f.openDeck) f.openDeck(); }
  if (app.button('', L.GEAR_BTN.x, L.GEAR_BTN.y, L.GEAR_BTN.w, L.GEAR_BTN.h, { icon: gearIcon })) { const f = app.shared.flow; if (f && f.openSettings) f.openSettings(); }
}

function pileStack(app, pos, count, s, label, key, onClick) {
  const ctx = app.ctx;
  const pulse = 1 + S.pulse[key] * 0.18;
  const layers = Math.min(3, Math.ceil(count / 6));
  ctx.save(); ctx.translate(pos.x, pos.y); ctx.scale(pulse, pulse);
  if (count === 0) { ctx.globalAlpha = 0.25; ctx.strokeStyle = COL.vellum; ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.strokeRect(-CARD_W * s / 2, -CARD_H * s / 2, CARD_W * s, CARD_H * s); }
  else for (let i = layers - 1; i >= 0; i--) drawCardBack(ctx, -i * 2, -i * 2.5, { scale: s });
  ctx.restore();
  const bw = CARD_W * s, bh = CARD_H * s;
  ctx.save(); ctx.fillStyle = 'rgba(14,12,10,.9)'; ctx.strokeStyle = COL.vellum; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pos.x + bw / 2 - 2, pos.y + bh / 2 - 6, 15, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.restore();
  app.text(String(count), pos.x + bw / 2 - 2, pos.y + bh / 2 - 15, { size: 17, bold: true, ui: true, align: 'center' });
  const over = app.inRect(pos.x - bw / 2, pos.y - bh / 2, bw, bh);
  if (over) {
    app.cursor = 'pointer'; app.tooltip(label, `${count} card${count === 1 ? '' : 's'}.\nClick or press Q to view.`);
    if (onClick && app.clicked(pos.x - bw / 2, pos.y - bh / 2, bw, bh) && !S.modal && !S.ending) onClick();
  }
}

function drawHudBottom(app) {
  const ctx = app.ctx, c = S.c;
  const idle = !busy();
  const dn = idle ? c.drawPile.length : zoneCount('draw'), dsc = idle ? c.discard.length : zoneCount('discard'), ex = idle ? c.exhaust.length : zoneCount('exhaust');
  pileStack(app, L.DRAW_POS, dn, L.PILE_S, 'Draw pile', 'draw', () => { S.modal = { kind: 'piles', tab: 'draw', scroll: 0 }; sfx('uiClick'); });
  pileStack(app, L.DISC_POS, dsc, L.PILE_S, 'Discard pile', 'disc', () => { S.modal = { kind: 'piles', tab: 'discard', scroll: 0 }; sfx('uiClick'); });
  pileStack(app, L.EXH_POS, ex, L.EXH_S, 'Exhaust pile', 'exh', () => { S.modal = { kind: 'piles', tab: 'exhaust', scroll: 0 }; sfx('uiClick'); });

  // energy orb
  const O = L.ORB, pulse = 1 + S.orbPulse * 0.22;
  ctx.save(); ctx.translate(O.x, O.y); ctx.scale(pulse, pulse); drawEnergyOrb(ctx, 0, 0, O.size, S.energy, S.maxEnergy); ctx.restore();
  if (app.inRect(O.x - O.size / 2, O.y - O.size / 2, O.size, O.size)) app.tooltip('Energy', `${S.energy} / ${S.maxEnergy}. Refills each turn.`, { color: COL.energy });
  // strain readout
  const st = c.strain, B = L.STRAIN_BOX;
  const over = st.strain > 0;
  app.panel(B.x, B.y, B.w, B.h, { fill: 'rgba(14,12,10,.8)', stroke: over ? COL.scar : 'rgba(232,220,196,.35)', r: 8 });
  app.text(`Budget ${st.weight}/${st.budget}`, B.x + 10, B.y + 5, { size: 15, ui: true, bold: true, color: COL.vellum });
  app.text(`Strain ${st.strain}`, B.x + 10, B.y + 24, { size: 15, ui: true, bold: true, color: over ? COL.bad : COL.good });
  if (app.inRect(B.x, B.y, B.w, B.h)) {
    const tithed = []; for (const w of S.known.values()) if (w.tithed) tithed.push(w);
    const lines = [];
    if (!over) lines.push('Within Budget. No card is Tithed.');
    else {
      lines.push(`Weight ${st.weight} over Budget ${st.budget}: ${st.strain} Strain.`);
      lines.push(tithed.length ? 'Tithed (-25% numbers this combat):' : 'No Tithe left in force.');
      for (const w of tithed.slice(0, 8)) lines.push(' - ' + (CARDS[w.inst.id] ? CARDS[w.inst.id].name : w.inst.id));
      if (st.backfire > 0) lines.push(`Backfire ${st.backfire}: grafted cards in your opening hand jam each turn.`);
    }
    app.tooltip('Strain', lines.join('\n'), { color: over ? COL.bad : COL.good });
  }

  // end turn
  const E = L.END_BTN;
  const noPlays = idle && !c.over && !c.pending && !c.hand.some((_, i) => canPlay(c, i).ok);
  const can = canAct();
  if (can && noPlays) { ctx.save(); ctx.shadowColor = COL.lamp; ctx.shadowBlur = 16 + Math.sin(S.t * 5) * 8; app.rr(E.x, E.y, E.w, E.h, 10); ctx.strokeStyle = COL.lamp; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
  if (app.button('END TURN', E.x, E.y, E.w, E.h, { size: 22, fill: can && noPlays ? '#6b4a1a' : COL.slab2, disabled: !can }) && can) doEndTurn();
}

function drawCardInfo(app) {
  if (S.modal || S.ending || S.drag || S.c.pending) return;
  const dc = S.hand.find((d) => d.uid === S.hov);
  if (!dc || dc.alpha < 0.8) return;
  const spec = dcSpec(dc);
  const secs = cardSections(spec, dc.w, dc);
  if (!secs.length) return;
  const w = 250;
  const right = dc.x + CARD_W * dc.s / 2 + 10;
  const x = right + w < W - 6 ? right : dc.x - CARD_W * dc.s / 2 - 10 - w;
  drawSections(app, secs, x, Math.max(64, dc.y - CARD_H * dc.s / 2), w, 520);
}

// first-run tips: one at a time, only while the player can act, never over a modal
function drawTips(app) {
  if (!S || S.modal || S.ending || S.c.pending || S.banner || !canAct() || S.drag) return;
  const c = S.c, l = liveEds(), first = l[0];
  const has = (k) => app.shared.meta && app.shared.meta.tips && app.shared.meta.tips[k];
  const tip = (k, x, y, o, txt) => maybeTip(app, k, x, y, txt, o);
  if (first && !S.hov) {
    if (tip('energy', L.ORB.x + 46, L.ORB.y, { side: 'right', w: 280 })) return;
    if (tip('intent', first.x, FOOT_Y - first.h - 8, { side: 'below', w: 290 })) return;
    if (S.hand.length && tip('playcard', L.HAND_CX, L.HAND_Y - 120, { side: 'above', w: 330 }, 'Click a card to select it, then click it again or drag it up to play it. Attacks ask for a target. Keys 1 to 0 also select.')) return;
    if (c.enemies.some((e) => !e.dead && e.move && intentWith(S.edBy.get(e.uid), e.move) && intentWith(S.edBy.get(e.uid), e.move).kinds.includes('attack')) && tip('block', HERO_X + 70, FOOT_Y - 150, { side: 'right', w: 280 })) return;
    if (tip('endturn', L.END_BTN.x + L.END_BTN.w / 2, L.END_BTN.y, { side: 'above', w: 280 })) return;
  }
  if (!has('endturn')) return; // later tips wait until the basics are known
  const hc = S.hand.find((d) => d.w.tithed);
  if (hc || S.seenTithe.size) { if (tip('strain', L.STRAIN_BOX.x + L.STRAIN_BOX.w, L.STRAIN_BOX.y + 22, { side: 'right', w: 300 })) return; }
  const jc = S.hand.find((d) => d.jam);
  if (jc && tip('jam', jc.x, jc.y - CARD_H * jc.s / 2, { side: 'above', w: 300 })) return;
  const oc = S.hand.find((d) => dcSpec(d).overload);
  if (oc) tip('overload', oc.x, oc.y - CARD_H * oc.s / 2, { side: 'above', w: 300 });
}

function drawBanner(app) {
  const b = S.banner; if (!b) return;
  const ctx = app.ctx, k = b.t / b.life;
  const a = k < 0.12 ? k / 0.12 : k > 0.8 ? (1 - k) / 0.2 : 1;
  ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
  if (b.style === 'boss') {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 230, W, 150);
    ctx.fillStyle = COL.scar; ctx.fillRect(0, 230, W, 3); ctx.fillRect(0, 377, W, 3);
    const slide = (1 - EASE.out(clamp(k * 4, 0, 1))) * 120;
    app.text(b.sub || '', W / 2 + slide, 246, { size: 20, ui: true, bold: true, align: 'center', color: COL.scar });
    app.text(b.title, W / 2 - slide, 276, { size: 64, bold: true, align: 'center', color: COL.vellum, stroke: '#0e0e0e', strokeW: 8 });
  } else if (b.style === 'turn') {
    app.text(b.title, W / 2, 240 - k * 20, { size: 34, bold: true, align: 'center', color: COL.lamp, stroke: '#0e0e0e', strokeW: 6 });
  } else {
    const sc = 0.7 + 0.3 * EASE.back(clamp(k * 5, 0, 1));
    ctx.translate(W / 2, 250); ctx.scale(sc, sc);
    app.text(b.title, 0, -40, { size: 76, bold: true, align: 'center', color: b.style === 'win' ? COL.lamp : COL.bad, stroke: '#0e0e0e', strokeW: 10 });
    if (b.sub) app.text(b.sub, 0, 44, { size: 26, align: 'center', color: COL.vellum, stroke: '#0e0e0e', strokeW: 5, ui: true });
  }
  ctx.restore();
}

// ---------------------------------------------------------------- screen object
function key(app, e) {
  if (!S || app.stack[app.stack.length - 1] !== SCREEN) return false;
  return e.key === 'Tab' || e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight';
}

// Test / tooling hooks: coordinates a simulated player can click.
function api() {
  const n = S.hand.length;
  return {
    c: S.c, busy: busy(), canAct: canAct(), ending: !!S.ending, modal: !!S.modal,
    handPos: (i) => { const s = L.handSlot(i, n); return { x: s.x, y: s.y }; },
    enemyPos: (i) => { const ed = S.edBy.get(S.c.enemies[i].uid); return { x: ed.x, y: FOOT_Y - ed.h * 0.5 }; },
    endTurn: { x: L.END_BTN.x + L.END_BTN.w / 2, y: L.END_BTN.y + L.END_BTN.h / 2 },
    pending: S.c.pending ? { need: pendingNeed(), pool: pendPool().map((w) => w.uid), confirm: { x: W / 2, y: 666 } } : null,
    queueLen: S.q.length, sel: S.sel, state: () => S,
  };
}

const SCREEN = { enter, leave, update, draw, key, api };
export default SCREEN;
