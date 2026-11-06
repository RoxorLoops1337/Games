// COMBAT SCREEN. The engine is synchronous: after every action `c` is final and c.ev holds the events in order.
// This screen keeps DISPLAY state (hp, block, statuses, hand positions, pile zones) and replays c.ev through a timed
// queue, updating the display as each event plays. Input is locked while the queue is busy (click / Space = speed up).
import { COL, EASE, FONT, W, H, rgba, clamp, lerp } from './core.js';
import { Fx, FX_OPTS } from './fx.js';
import * as J from './juice.js';
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
import { watchCombat } from './a11y.js';
import { seamBadge as seamBadgeOf, drawSeamBadge as drawSeamBadgeAt, drawSeamRail, onSeamEvent, seamTip } from './seam_ui.js';
import { drawBar, drawStatusRow, drawIntentBubble, intentText, cardSections, drawSections, gearIcon, stCol, stName, drawEnemyPlate, drawHeroPlate, drawRelicStrip, drawPopovers, fitText } from './combat_hud.js';
import { queueTip, flushTips, cardTipStack } from './tooltips.js';

const { HERO_X, FOOT_Y, PLAY_LINE } = L;
const EF = L.ENEMY_FOOT; // enemies stand on their own ground line (the HUD grid puts their plates inside the lane)
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
  Object.assign(ed, { e, id: e.uid, visible: false, reserve: false, spawnT: 0, x: 0, scale: b.scale, w: b.w, h: b.h, sw: b.sw, placed: false, move: null, intentT: 0, intentOut: 0, atk: { phase: 'idle', k: 0 }, lunge: 0, anim: { sq: 0, sqv: 0, hold: 0, hit: 0, seamLit: 0 }, atkTm: null, atkT: -1, dying: 0, dyingOn: false, gone: false, phase: Math.random() * 6, callout: null, stunT: 0, drop: 0 });
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
  return { x: ed.x, y: EF - ed.h * 0.55 };
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
  S.P.pop = {}; S.P.attack = 0; S.P.dying = 0; juiceInit();
  refreshKnown(); syncEds();
  for (const ed of S.eds) ed.reserve = true;
  absorb();
  S.energy = 0;
  fixLayout(true);
}
function leave() { juiceLeave(); S = null; }

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
      if (!ev.silent) { fx.shake(0.25); sfx('junkAdd', { pitch: 0.8 }); fx.burst(ed.x || 900, EF, 'dust'); return 260; }
      return 130;
    }
    case 'start': {
      const trn = APP && APP.shared && APP.shared.transitions;
      if (trn && trn.introCard && (S.boss || S.kind === 'elite') && S.eds[0]) {
        const lead = S.eds[0];
        trn.introCard(APP, { name: lead.e.name.toUpperCase(), sub: S.kind === 'final' ? 'THE LAST FITTING' : S.boss ? 'BOSS' : 'ELITE', kind: S.boss ? 'boss' : 'elite' });
        if (S.boss) S.dark = 1;
        return S.boss ? 1300 : 900;
      }
      if (S.boss) {
        const first = S.eds[0];
        S.banner = { title: first ? first.e.name.toUpperCase() : 'BOSS', sub: S.kind === 'final' ? 'THE LAST FITTING' : 'BOSS', t: 0, life: 1.9, style: 'boss' };
        S.dark = 1; sfx('bossIntro'); post('shockwave', 640, 330, 0.8, 600); return 1500;
      }
      return 0;
    }
    case 'turnStart': {
      comboReset(); S.turn = ev.turn; S.energy = c.maxEnergy; S.maxEnergy = c.maxEnergy;
      const keep = c.player.st.barricade > 0;
      if (!keep) S.P.block = 0;
      sfx('turnStart', { vol: 0.7 });
      if (ev.turn > 1) S.banner = { title: 'YOUR TURN', t: 0, life: 0.8, style: 'turn' };
      return ev.turn > 1 ? 260 : 120;
    }
    case 'turnEnd': {
      S.sel = null; S.potSel = null; sfx('turnEnd'); comboCash();
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
      healFx(p, ev.n);
      sfx('heal'); return 130;
    }
    case 'hp': {
      const en = ent(ev.who); if (!en) return 0;
      en.hp = Math.max(0, en.hp - ev.n); en.tdelay = 0.45; en.hurt = 0.6;
      const p = entPos(ev.who);
      selfHurtFx(ev, p, en);
      return 120;
    }
    case 'kill': return onKill(ev);
    case 'enemyAct': {
      const ed = S.edBy.get(ev.e); if (!ed) return 0;
      const info = intentWith(ed, ev.move);
      const atk = info && info.kinds.includes('attack');
      ed.atkT = 0; ed.atkKind = atk ? 'attack' : 'cast'; ed.intentOut = 0.0001; ed.atkTm = atk ? J.atkTiming(ed.e.def) : null; S.lastAct.set(ev.e, ev.move);
      const mv = ed.e.def.moves[ev.move];
      ed.callout = { text: (mv && mv.name) || '', t: 0 };
      if (!atk) { const p = entPos(ev.e); fx.ring(p.x, p.y, '#cfc3a8', 80, 0.5); }
      return atk ? (ed.atkTm ? Math.round(ed.atkTm.tell + ed.atkTm.act) : 290) : 380;
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
      if (f) { f.shatter = { t: 0 }; f.out = true; sfx('jam', { pitch: 1.7, vol: 0.5 }); return 420; }
      shatterBurst(p); return 420;
    }
    case 'seamExtend': case 'seamCut': case 'seamPay': case 'seamSlack': case 'seamFray': return onSeamEvent(APP, ev, { fx, entPos, c }) || 0;
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
  sp.col = COL[spec.school] || COL[spec.type] || '#fff'; sp.trail = []; sp.sx = 1; sp.sy = 1;
  const tgtEd = ev.target ? S.edBy.get(ev.target) : null;
  let tp;
  if (tgtEd) tp = entPos(ev.target);
  else if (spec.target === 'all') { const l = liveEds(); tp = l.length ? { x: l.reduce((a, e) => a + e.x, 0) / l.length, y: EF - 90 } : { x: 900, y: 380 }; }
  else tp = { x: HERO_X + 40, y: FOOT_Y - 110 };
  sp.tp = tp; S.lastTarget = tp;
  sp.toEnemy = !!tgtEd || spec.target === 'all';
  if (spec.type === 'attack') { S.P.attack = 0.0001; }
  sfx('cardPlay');
  return 280;
}

function nextHitSame(ev) {
  for (const e of S.q) {
    if (e.t === 'dmg' && e.who === ev.who && e.hit && e.n > 0) return true;
    if (e.t === 'play' || e.t === 'enemyAct' || e.t === 'turnStart' || e.t === 'turnEnd') return false;
  }
  return false;
}
function setKiller(ev, dot) {
  const ed = ev.src ? S.edBy.get(ev.src) : null, mid = ev.src ? S.lastAct.get(ev.src) : null;
  const mv = ed && mid && ed.e.def.moves && ed.e.def.moves[mid];
  const name = mv ? moveName({ name: mv.name, move: mid }) : (dot || null);
  S.killer = { ed: ed || null, text: J.causeOfDeath(name, ev.n) };
}

function onDmg(ev) {
  const fx = S.fx, c = S.c;
  const en = ent(ev.who); if (!en) return 0;
  const isP = ev.who === 'player' || ev.who == null;
  const ed = isP ? null : S.edBy.get(ev.who);
  const p = entPos(ev.who);
  const dirx = isP ? -1 : 1;
  const hpBefore = en.hp, vul = (en.st.vulnerable || 0) > 0;
  let wait = 0;
  if (ev.absorbed > 0) {
    en.block = Math.max(0, en.block - ev.absorbed); en.bpulse = 1;
    fx.burst(p.x + (isP ? 28 : -28), p.y, 'block', { n: 8, angle: isP ? 0 : Math.PI, spread: 2.2 });
    fx.ring(p.x, p.y, '#7fb4d8', 64, 0.28);
    sfx('block', { vol: 0.9 });
    if (ev.broke) {
      fx.hitstop(70); kick(dirx, 0, 9, 7, 0);
      fx.emit({ x: p.x, y: p.y, n: 14, colors: ['#9aa7ad', '#cfd8dc', '#6b7a82'], speed: 300, size: 4, gravity: 800, life: 0.7 });
      fx.emit({ x: p.x, y: p.y, n: 4, colors: ['#cfd8dc', '#9aa7ad'], speed: 220, size: 9, gravity: 900, life: 0.8, shape: 'shard', spin: 10 });
      fx.ring(p.x, p.y, '#bcd0d8', 100, 0.4); fx.float('BROKEN', p.x, p.y - 62, { color: '#bcd0d8', size: 26, big: true, stroke: '#2a3a44', life: 1.2 }); sfx('blockBreak');
    } else {
      fx.hitstop(20); kick(dirx, 0, 3, 8, 0);
      fx.float(String(ev.absorbed), p.x - 24, p.y - 26, { color: '#9fb4bd', size: 22, vy: -30, life: 0.8 });
    }
    wait = ev.broke ? 120 : 90;
  }
  if (ev.n > 0) {
    en.hp = Math.max(0, en.hp - ev.n); en.tdelay = 0.5;
    const mine = !isP && ev.src === 'player';
    if (ev.hit) {
      const k = J.classify(ev.n, en.maxHp, hpBefore, vul), T = J.TIERS[k.tier];
      const ctr = S.hc.hit(ev.who, ev.n, S.t * 1000, !nextHitSame(ev), p.x, p.y);
      const multi = ctr.count >= 2, slam = multi && ctr.done;
      let stop = T.stop;
      if (mine && !S.firstBlood) { S.firstBlood = true; stop += 30; sfx('intentReveal', { vol: 0.5, pitch: 1.4 }); }
      const killing = isP && en.hp <= 0 && c.over === 'lose';
      if (killing) stop = Math.max(stop, 200);
      fx.hitstop(stop);
      kick(dirx, -0.2, T.shake * (multi ? 1 + Math.min(0.5, ctr.count * 0.06) : 1) + (slam ? 3 : 0), T.decay, T.roll);
      en.hurt = T.flash ? 1 : 0.25; en.kick = Math.min(1.5, T.kick);
      if (ed) { const a = ed.anim; a.sq = -Math.min(T.sq, J.squashLimit(ed.e.def)); a.sqv = 0; a.hold = 0.06; a.hit = 1; }
      if (T.ab) aberr(T.ab, 130);
      if (T.zoom > 1) zoomPunch(T.zoom, p.x, p.y, 9);
      if (T.rim) fx.flash(T.rim, 0.12, 0.15);
      fx.burst(p.x, p.y, isP ? 'blood' : 'spark', { n: T.sparks, angle: isP ? Math.PI : 0, spread: 2.6 });
      if (T.ring) fx.ring(p.x, p.y, '#fff', 60 + T.size * 1.6, 0.3);
      if (T.dust) fx.burst(p.x, p.y + 30, 'dust', { n: 8 });
      if (T.shards) fx.burst(p.x, p.y, 'shard', { n: 8, colors: ['#e8dcc4', '#9E0F2E'], speed: 300 });
      if (T.ink) fx.emit({ x: p.x, y: p.y, n: 8, colors: ['#1a1614', '#2b1e1a'], speed: 170, size: 6, gravity: 250, life: 0.8 });
      if (T.gore) fx.emit({ x: p.x, y: p.y, n: 18, colors: ['#9E0F2E', '#e8dcc4', '#c4223c'], speed: 380, size: 5, gravity: 800, life: 1.0, shape: 'flake', spin: 14 });
      if (T.slow) fx.slowmo(T.slow, T.slowMs);
      if (typeof fx.floatCounter === 'function') fx.floatCounter(ev.who, p.x, p.y - 20, ev.n, { last: ctr.done, size: T.size, color: k.crit || k.overkill ? '#ff4a4a' : COL.vellum });
      else if (!multi) fx.float(String(ev.n), p.x + rnd(-14, 14), p.y - 20, { color: k.crit || k.overkill ? '#ff4a4a' : COL.vellum, size: T.size, big: k.crit || k.overkill, life: k.crit || k.overkill ? 1.4 : 1.1, vy: T.vy, rot: T.tilt, pop: T.pop });
      if (k.overkill) fx.float(`+${k.over} OVERKILL`, p.x, p.y - 84, { color: COL.gold, size: 18, life: 1.3 });
      const hopt = { pitch: T.pitch * (1 + Math.min(ctr.count, 10) * 0.04), vol: T.vol };
      if (typeof (jau() || {}).hit === 'function') audioCall('hit', slam ? Math.max(ev.n, en.maxHp * 0.2) : ev.n, en.maxHp, hopt); else sfx(slam ? 'hitBig' : T.body, hopt);
      if (isP) {
        S.vig = Math.max(S.vig, T.vig); sfx('loseHp', { vol: 0.7 }); S.heroKick = Math.max(S.heroKick || 0, T.kick);
        if (killing) setKiller(ev, null);
        else if (en.hp > 0 && en.hp <= 5 && !c.over) nearMiss(p);
      }
      if (mine) comboAdd(ev.n);
      wait = Math.max(wait, T.wait);
    } else {
      // damage over time: each status has its own tick
      const kind = (en.st.poison || 0) > 0 ? 'poison' : (en.st.burn || 0) > 0 ? 'burn' : 'dot';
      en.hurt = Math.max(en.hurt, 0.3);
      if (kind === 'poison') {
        fx.ring(p.x, p.y, '#5fbf6a', 55, 0.45); fx.burst(p.x, p.y + 10, 'heal', { n: 5, colors: ['#7fcf8a', '#3f8f4a'], gravity: -90, speed: 60, jitter: 30 });
        fx.float(String(ev.n), p.x + rnd(-10, 10), p.y - 30, { color: '#7fcf8a', size: 22, vy: 35, life: 1.0 }); sfx('poison', { vol: 0.5 });
      } else if (kind === 'burn') {
        kick(1, -1, 2, 10, 0); fx.burst(p.x, p.y, 'ember', { n: 8 });
        fx.float(String(ev.n), p.x + rnd(-10, 10), p.y - 30, { color: '#ff9a3c', size: 22, vy: -70, rot: 0.1, life: 1.0 }); sfx('burnApply', { vol: 0.4, pitch: 1.2 });
      } else {
        fx.burst(p.x, p.y, 'ember', { n: 4 }); fx.float(String(ev.n), p.x, p.y - 30, { color: COL.bad, size: 22, life: 1.0 }); sfx('hitSmall', { vol: 0.4, pitch: 0.8 });
      }
      if (isP) {
        S.vig = Math.max(S.vig, 0.4);
        if (en.hp <= 0 && c.over === 'lose') { fx.hitstop(200); setKiller(ev, kind === 'poison' ? 'Poison' : kind === 'burn' ? 'Burning' : 'Bleeding'); }
        else if (en.hp > 0 && en.hp <= 5 && !c.over) nearMiss(p);
      }
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
  S.fx.ring(p.x, p.y - 20, stCol(ev.s), 60, 0.4); statusFx(ev, p);
  sfx(sfxForStatus(ev.s, good));
  return prev === 0 ? 110 : 80;
}

// ================================================================ JUICE (J1): state, camera, ticks, helpers
const jau = () => (APP && APP.shared && APP.shared.audio) || null;
function audioCall(fn, ...a) { const au = jau(); if (au && typeof au[fn] === 'function') { try { au[fn](...a); } catch (e) { /* audio is optional */ } } }
function hasSfx(n) { const au = jau(); return !!(au && au.SFX_NAMES && au.SFX_NAMES.indexOf(n) >= 0); }
function post(fn, ...a) { const p = APP && APP.post; if (p && typeof p[fn] === 'function') { try { p[fn](...a); } catch (e) { /* post is optional */ } } }
const calm = () => !!FX_OPTS.reduced;
const aberr = (px, ms) => post('aberration', calm() ? px * 0.2 : px, ms);
const later = (ms, fn) => S.later.push({ t: ms / 1000, fn });

function juiceInit() {
  S.shk = { amp: 0, decay: 6, dx: 1, dy: 0, roll: 0, t: 0, seed: Math.random() * 100 };
  S.zp = { z: 1, cx: 640, cy: 360, back: 8 };
  S.hc = new J.HitCounter(350);
  S.combo = { dmg: 0, shown: 0, pulse: 0, stamp: null };
  S.lastAct = new Map(); S.later = []; S.threads = [];
  S.firstBlood = false; S.nearAt = -99; S.killer = null; S.goldLine = '';
  S.dgr = { on: false, bpm: 0, t: 0, pulse: 0, level: 0 };
}
function juiceLeave() {
  if (!S || !S.dgr) return;
  if (S.dgr.on || (S.ending && S.ending.hb)) audioCall('heartbeat', 0);
  if (S.dgr.on || S.lpSet) audioCall('setLowpass', 22000, 300);
  if (S.gradeSet) post('setGrade', S.boss ? 'boss' : theme(), 400);
  S.dgr.on = false; S.lpSet = false; S.gradeSet = false; if (S.ending) S.ending.hb = 0;
}
function kick(dx, dy, px, decay, roll) {
  if (!FX_OPTS.shake || calm() || !(px > 0)) return;
  const sh = S.shk, l = Math.hypot(dx, dy) || 1;
  if (typeof S.fx.shakeDir === 'function') { S.fx.shakeDir(Math.atan2(dy, dx), Math.min(1, Math.sqrt(px / 14))); return; }
  sh.amp = J.kickAmp(sh.amp, px); sh.dx = dx / l; sh.dy = dy / l; sh.decay = decay; sh.roll = Math.max(sh.roll * 0.5, roll || 0);
}
function zoomPunch(z, x, y, back) { if (calm()) return; const zp = S.zp; zp.z = Math.max(zp.z, z); zp.cx = x; zp.cy = y; zp.back = back; }
function applyCam(ctx) {
  const sh = S.shk, z = S.zp;
  if (sh.amp > 0) {
    const o = J.shakeOffset(sh); ctx.translate(o.x, o.y);
    if (o.rot) { ctx.translate(W / 2, H / 2); ctx.rotate(o.rot); ctx.translate(-W / 2, -H / 2); }
  }
  if (z.z > 1) { ctx.translate(z.cx, z.cy); ctx.scale(z.z, z.z); ctx.translate(-z.cx, -z.cy); }
}
function juiceTick(ad, raw) {
  const sh = S.shk;
  if (sh.amp > 0.05) { sh.t += raw; sh.amp *= Math.exp(-sh.decay * raw); } else { sh.amp = 0; sh.roll = 0; }
  const zp = S.zp; zp.z = zp.z > 1.0008 ? 1 + (zp.z - 1) * Math.exp(-zp.back * raw) : 1;
  S.hc.update(S.t * 1000);
  for (let i = S.later.length - 1; i >= 0; i--) { const l = S.later[i]; l.t -= raw; if (l.t <= 0) { S.later.splice(i, 1); try { l.fn(); } catch (e) { /* cosmetic */ } } }
  for (const ed of S.eds) {
    const a = ed.anim;
    if (a.hold > 0) a.hold -= raw; else J.spring(a, 'sq', 0, raw, 380, 18);
    a.hit = Math.max(0, a.hit - raw * 4); a.hpFrac = Math.max(0, ed.hp) / Math.max(1, ed.maxHp);
    if (ed.fin) {
      ed.fin.t += raw;
      const lit = Math.min(J.FINAL.seams, Math.floor(ed.fin.t / J.FINAL.perSeam));
      if (lit > a.seamLit) { a.seamLit = lit; sfx(hasSfx('seamLight') ? 'seamLight' : 'intentReveal', { vol: 0.25, pitch: 1.2 + lit * 0.15 }); }
    }
  }
  if (S.killer && S.killer.ed) S.killer.ed.intentOut = 0;
  const cb = S.combo;
  cb.shown += (cb.dmg - cb.shown) * (1 - Math.exp(-raw * 14)); cb.pulse = Math.max(0, cb.pulse - raw * 4);
  if (cb.stamp) { cb.stamp.t += raw; if (cb.stamp.t > 1.1) cb.stamp = null; }
  if (S.threads.length) { for (const th of S.threads) th.t += raw; S.threads = S.threads.filter((th) => th.t < th.life); }
  dangerTick(raw);
}
function dangerTick(raw) {
  const d = S.dgr, P = S.P;
  const want = J.danger(P.hp / Math.max(1, P.maxHp), P.hp > 0 && !S.ending);
  if (want.on !== d.on) {
    d.on = want.on; d.bpm = 0; d.t = 0;
    audioCall('setLowpass', want.on ? want.lowpass : 22000, want.on ? 500 : 800);
    if (want.on) S.lpSet = true; else audioCall('heartbeat', 0);
  }
  if (want.on) {
    if (Math.abs(want.bpm - d.bpm) >= 4) { d.bpm = want.bpm; audioCall('heartbeat', want.bpm); }
    d.level = want.level; d.t += raw;
    const per = 60 / Math.max(40, d.bpm);
    // lub-dub in step with the heartbeat audio: a full beat, then a softer second one 30% of the way into the period
    if (d.t >= per) { d.t -= per; d.pulse = 1; d.dub = false; post('vignette', 0.3 * want.level, 260); }
    else if (!d.dub && d.t >= per * 0.3) { d.dub = true; d.pulse = Math.max(d.pulse, 0.65); }
  }
  d.pulse = Math.max(0, d.pulse - raw * 3.5);
}
function nearMiss(p) {
  if (S.t - S.nearAt < 4) return;
  S.nearAt = S.t;
  const nm = ['itHeld', 'nearMiss', 'stinger'].find(hasSfx);
  later(160, () => sfx(nm || 'buff', nm ? {} : { pitch: 0.6, vol: 0.6 }));
  S.fx.float('It held.', p.x, p.y - 110, { color: COL.lamp, size: 24, life: 1.6 });
}
function comboReset() { S.combo.dmg = 0; }
function comboAdd(n) {
  const cb = S.combo, l0 = J.comboLevel(cb.dmg);
  cb.dmg += n; cb.pulse = 1;
  const l1 = J.comboLevel(cb.dmg);
  if (l1 > l0) sfx('coin', { vol: 0.35, pitch: 1 + l1 * 0.25 });
}
function comboCash() {
  const cb = S.combo;
  if (cb.dmg >= 10) { cb.stamp = { t: 0, total: cb.dmg }; sfx('hitBig', { vol: 0.35, pitch: 1.3 }); S.fx.hitstop(30); cb.shown = 0; }
  cb.dmg = 0;
}
function healFx(p, n) {
  const fx = S.fx;
  fx.ring(p.x, p.y, '#7fcf8a', 90, 0.7);
  fx.burst(p.x, p.y + 20, 'heal', { n: 12, jitter: 50, shape: 'dot' });
  fx.float('+' + n, p.x, p.y - 30, { color: COL.good, size: 30, vy: -45, life: 1.3 });
}
function selfHurtFx(ev, p, en) {
  const fx = S.fx, isP = ev.who === 'player' || ev.who == null;
  fx.hitstop(60); kick(-1, 0, 5, 8, 0);
  fx.burst(p.x, p.y, 'blood', { n: 6 });
  fx.float('-' + ev.n, p.x, p.y - 30, { color: COL.bad, size: 30, life: 1.2 });
  fx.float('- - -', p.x, p.y - 4, { color: '#0e0e0e', size: 16, life: 1.0, stroke: '#b3263a' });
  if (isP) {
    if (ev.src === 'graft') { sfx('heartbeat'); S.lamp = 1; } else sfx('loseHp', { vol: 0.8 });
    S.vig = Math.max(S.vig, 0.6);
    if (en.hp > 0 && en.hp <= 5 && !S.c.over) nearMiss(p);
  } else sfx('hitSmall');
}
function statusFx(ev, p) {
  const fx = S.fx;
  if (ev.s === 'poison') fx.burst(p.x, p.y, 'heal', { n: 5, colors: ['#7fcf8a', '#3f8f4a'], gravity: -90, speed: 50 });
  else if (ev.s === 'burn') fx.burst(p.x, p.y, 'ember', { n: 6 });
  else if (ev.s === 'vulnerable') fx.ring(p.x, p.y, '#ff4a4a', 80, 0.3);
}
function shatterBurst(p) {
  const fx = S.fx;
  fx.burst(p.x, p.y, 'shard', { n: 26, speed: 460, size: 8 }); fx.burst(p.x, p.y, 'glass', { n: 12 }); fx.ring(p.x, p.y, COL.gold, 160, 0.6);
  fx.slowmo(0.35, 350); fx.flash('#ffe9a8', 0.35, 0.3); fx.shake(0.6); fx.float('SHATTERED', p.x, p.y - 80, { color: COL.gold, size: 34, big: true, life: 1.4 });
  sfx('shatter');
  { const trn = APP && APP.shared && APP.shared.transitions; if (trn && trn.shatterBeat) trn.shatterBeat(APP, p.x, p.y); }
}
// enemy attack timeline: ed.atk = {phase, k} and ed.lunge (the old 0..1 scalar) from art/attacks.js timing; 500 ms lunge when timing is absent
function enemyPose(ed) {
  const a = ed.atk;
  if (ed.atkT >= 0 && ed.atkKind === 'attack') {
    if (ed.atkTm) { const r = J.atkPhase(ed.atkTm, ed.atkT * 1000); a.phase = r.phase; a.k = r.k; ed.lunge = r.lunge; return; }
    const k = ed.atkT / 0.5; ed.lunge = k < 0.4 ? EASE.out(k / 0.4) : 1 - EASE.inOut((k - 0.4) / 0.6);
    a.phase = k < 0.4 ? 'act' : 'rec'; a.k = k < 0.4 ? k / 0.4 : (k - 0.4) / 0.6; return;
  }
  ed.lunge = 0; a.phase = 'idle'; a.k = 0;
}
function drawEnemyJ(ctx, ed, def, x, y) {
  const a = ed.anim, idl = rmotion() || ed.dying > 0 ? 0 : Math.sin((S.t + ed.phase) * 2.1) * 0.014, sy = 1 + a.sq + idl, sx = 1 / (1 + a.sq) * (1 - idl * 0.6);
  ctx.save();
  if (a.sq || idl) { ctx.translate(x, y); ctx.scale(sx, sy); ctx.translate(-x, -y); }
  drawEnemy(ctx, def, x, y, { scale: ed.scale, t: S.t + ed.phase, hurt: ed.hurt, dying: ed.dying, attack: ed.lunge, st: ed.st, atk: ed.atk, state: a, hpFrac: a.hpFrac === undefined ? 1 : a.hpFrac });
  if (a.seamLit > 0) J.drawSeams(ctx, x, y, ed.w, ed.h, a.seamLit, S.t, 1 - ed.dying);
  ctx.restore();
}
function drawJuice(app) {
  const ctx = app.ctx, E = S.ending, now = S.t * 1000;
  if (typeof S.fx.floatCounter !== 'function') J.drawCounters(ctx, S.hc, now);
  for (const th of S.threads) J.drawThread(ctx, th);
  J.drawCombo(ctx, S.combo, HERO_X - 110, FOOT_Y - 215, now);
  if (S.killer) { const ed = S.killer.ed; J.drawKilledBy(ctx, S.killer.text, ed ? ed.x : HERO_X, (ed ? FOOT_Y - ed.h - 34 : FOOT_Y - 200) + 44); }
  if (E) { if (E.win) J.drawVictory(ctx, W, E, S.goldLine); else J.drawDeathCard(ctx, W, H, E.t); }
}
// card in transit: ribbon trail, squash, burn dissolve (bottom up) and shatter cracks
function drawSpriteCard(ctx, sp) {
  const tr = sp.trail;
  if (tr && tr.length > 1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.strokeStyle = sp.col || '#fff';
    for (let i = 1; i < tr.length; i++) { const k = i / tr.length; ctx.globalAlpha = k * 0.6; ctx.lineWidth = 3 + k * 16 * sp.s * 1.5; ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke(); }
    ctx.restore();
  }
  const w = CARD_W * sp.s, h = CARD_H * sp.s, burn = sp.mode === 'burn', edgeY = burn ? sp.y + h / 2 - (sp.burnMask || 0) * h : 0;
  ctx.save();
  if (burn) { ctx.beginPath(); ctx.rect(sp.x - w, sp.y - h, w * 2, edgeY - (sp.y - h)); ctx.clip(); }
  if (sp.sx !== undefined && (sp.sx !== 1 || sp.sy !== 1)) { ctx.translate(sp.x, sp.y); ctx.scale(sp.sx, sp.sy); ctx.translate(-sp.x, -sp.y); }
  drawCard(ctx, sp.spec, sp.x, sp.y, { scale: sp.s, rot: sp.rot, alpha: sp.alpha, tithed: sp.w.tithed, cost: sp.cost, dim: sp.dim || 0, glow: sp.glowCol ? 1 : 0 });
  ctx.restore();
  if (burn) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, edgeY - 18, 0, edgeY + 2); g.addColorStop(0, 'rgba(255,106,43,0)'); g.addColorStop(1, 'rgba(255,170,70,.9)');
    ctx.fillStyle = g; ctx.fillRect(sp.x - w / 2, edgeY - 18, w, 20);
    ctx.fillStyle = '#ffe08a'; ctx.globalAlpha = 0.9; ctx.fillRect(sp.x - w / 2, edgeY - 1, w, 2.5);
    ctx.restore();
  }
  if (sp.shatter) {
    const k = Math.min(1, sp.shatter.t / J.CARD.crack);
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + 0.3, L2 = 120 * sp.s * 1.6 * k; ctx.beginPath(); ctx.moveTo(0, 0);
      for (let s2 = 1; s2 <= 4; s2++) { const r = L2 * s2 / 4, j2 = Math.sin(i * 9 + s2 * 3) * 9 * sp.s; ctx.lineTo(Math.cos(a) * r - Math.sin(a) * j2, Math.sin(a) * r + Math.cos(a) * j2); }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function onKill(ev) {
  const ed = S.edBy.get(ev.e); if (!ed) return 0;
  const fx = S.fx;
  ed.hp = 0; ed.dyingOn = true; ed.dying = 0.0001; ed.intentOut = 0.0001; ed.reserve = true;
  if (ev.silent) { ed.quick = true; return 0; }
  const def = ed.e.def, boss = def.kind === 'boss';
  const art = (def.art && def.art.color) || '#999';
  const cy = FOOT_Y - ed.h * 0.5;
  const last = S.c.over === 'win' && !S.q.some((e) => e.t === 'kill' && !e.silent);
  fx.emit({ x: ed.x, y: cy, n: last ? 30 : 20, colors: [art, '#e8dcc4', '#1a1614'], speed: 280, size: 7, gravity: 700, life: 0.9, shape: 'shard', spin: 12, jitter: ed.w * 0.6 });
  sfx('kill'); sfx('enemyDeath');
  post('shockwave', ed.x, cy, last ? 0.9 : boss ? 1 : 0.45, boss ? 800 : 600);
  if (!last) return 260;
  // finishing blow: hold, slow-mo, zoom, aberration, seams light one by one, a lone thread falls
  S.finalBlow = true; ed.fin = { t: 0 };
  fx.hitstop(140); fx.slowmo(0.25, 600); fx.flash('#fff', 0.35, 0.3);
  zoomPunch(1.12, ed.x, cy, 2.2); aberr(8, 300); kick(1, 0, 8, 5, 0);
  S.threads.push({ x: ed.x, y: cy - 20, t: 0, life: 2.4 });
  if (boss) {
    audioCall('setIntensity', 0); const bk = typeof (jau() || {}).bossKill === 'function'; if (bk) audioCall('bossKill', 1000); else audioCall('duck', 1000);
    post('setGrade', 'neutral', 900); S.gradeSet = true;
    later(1000, () => { if (!bk) sfx('heartbeat', { vol: 1 }); post('shockwave', ed.x, cy, 1, 900); });
    later(1250, () => { sfx('gilded', { vol: 0.8 }); audioCall('setIntensity', 0.7); });
    return 700;
  }
  return 480;
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
    const t = sp.t, f0 = sp.fx0, C = { x: 640, y: 350 }, tp = sp.tp, CT = J.CARD;
    const tL = CT.lift, tW = tL + CT.wind, tF = tW + CT.flight, tI = tF + CT.impact;
    const dx = tp.x - C.x, dy = tp.y - C.y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
    if (sp.shatter) { // crack, hold, burst
      sp.shatter.t += d; sp.x = tp.x + rnd(-2, 2); sp.y = tp.y + rnd(-2, 2); sp.alpha = 1;
      if (sp.shatter.t >= CT.crack + CT.hold) { shatterBurst({ x: sp.x, y: sp.y }); sp.done = true; }
      return;
    }
    if (sp.fate && t >= tI && !sp.out) { sp.out = true; leavePlay(sp); }
    else if (!sp.fate && t > 0.9 && !sp.out) { sp.fate = 'discard'; sp.out = true; leavePlay(sp); }
    if (!sp.out) {
      const ax = C.x - ux * 20, ay = C.y - uy * 20;
      if (t < tL) { const k = EASE.out(t / tL); sp.x = lerp(f0.x, C.x, k); sp.y = lerp(f0.y, C.y, k); sp.s = lerp(f0.s, 0.86, k); sp.rot = lerp(f0.rot, 0, k); sp.sx = sp.sy = 1; }
      else if (t < tW) { const k = EASE.out((t - tL) / CT.wind); sp.x = lerp(C.x, ax, k); sp.y = lerp(C.y, ay, k); sp.s = 0.86; sp.rot = 0; sp.sx = 1 - 0.1 * k; sp.sy = 1 + 0.06 * k; }
      else if (t < tF) {
        const k = EASE.in((t - tW) / CT.flight), u = 1 - k, cx = (ax + tp.x) / 2, cy = (ay + tp.y) / 2 - 70;
        sp.x = u * u * ax + 2 * u * k * cx + k * k * tp.x; sp.y = u * u * ay + 2 * u * k * cy + k * k * tp.y;
        sp.s = lerp(0.86, 0.34, k); sp.rot = ux * 0.2 * k; sp.sx = 1 - 0.12 * k; sp.sy = 1 + 0.15 * k;
        fx.emit({ x: sp.x, y: sp.y, n: 1, color: sp.col, speed: 40, size: 5, life: 0.3, gravity: 0, glow: true, jitter: 16 });
      } else if (t < tI) { const k = (t - tF) / CT.impact; sp.x = tp.x; sp.y = tp.y; sp.s = 0.34; sp.rot = 0; sp.sx = lerp(1, 1.25, k); sp.sy = lerp(1, 0.6, k); sp.alpha = 0.9; }
      else {
        const j = sp.jit || 0; sp.jit = Math.max(0, j - d * 8);
        sp.x = tp.x + (j ? rnd(-5, 5) : 0); sp.y = tp.y + (j ? rnd(-5, 5) : 0); sp.s = 0.34; sp.alpha = 0.85; sp.sx += (1 - sp.sx) * Math.min(1, d * 20); sp.sy += (1 - sp.sy) * Math.min(1, d * 20);
      }
      if (t >= tW && t < tI) { sp.trail.push({ x: sp.x, y: sp.y }); if (sp.trail.length > 10) sp.trail.shift(); } else if (sp.trail.length) sp.trail.shift();
    } else if (sp.trail && sp.trail.length) sp.trail.length = 0;
  }
  if (sp.mode === 'burn') { // dissolve from the bottom up with a glowing edge and ash
    sp.bt += d; const k = Math.min(1, sp.bt / J.CARD.burn), w = CARD_W * sp.s, h = CARD_H * sp.s, edgeY = sp.y + h / 2 - k * h;
    sp.alpha = 1; sp.y -= d * 14; sp.burnMask = k; sp.sx = sp.sy = 1;
    if (Math.random() < 0.9) fx.emit({ x: sp.x + rnd(-w / 2, w / 2), y: edgeY, n: 1, colors: ['#ff6a2b', '#ffb347', '#ffe08a'], speed: 60, size: 3, gravity: -160, life: 0.5, glow: true });
    if (Math.random() < 0.5) fx.emit({ x: sp.x + rnd(-w / 2, w / 2), y: edgeY, n: 1, colors: ['#3a322c', '#6b6258'], speed: 30, size: 3, gravity: -30, life: 1.1, shape: 'flake', glow: false });
    if (k >= 1) sp.done = true;
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
  sp.mode = 'mv'; sp.sx = 1; sp.sy = 1;
  if (sp.fate === 'exhaust') startBurn(sp);
  else if (sp.fate === 'power') { fx.ring(sp.x, sp.y, COL.power, 100, 0.5); sfx('buff'); mover(sp, { x: HERO_X, y: FOOT_Y - 120, s: 0.15, rot: 1.2, alpha: 0 }, 0.45, EASE.inOut, () => { sp.done = true; fx.burst(HERO_X, FOOT_Y - 120, 'gild', { colors: ['#b48be0', '#fff'] }); }); }
  else mover(sp, { x: L.DISC_POS.x, y: L.DISC_POS.y, s: L.PILE_S, rot: 0.5, alpha: 0.9 }, 0.22, EASE.inOut, () => { sp.done = true; S.pulse.disc = 1; });
}

function drawSprites(app) {
  const ctx = app.ctx;
  for (const sp of S.spr) {
    if (sp.delay > 0) continue;
    if (sp.icon === 'potion') { ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.rot); ctx.globalAlpha = sp.alpha; drawPotion(ctx, sp.id, 0, 0, 30 * sp.s); ctx.restore(); continue; }
    if (sp.back) { ctx.save(); ctx.globalAlpha = sp.alpha; ctx.translate(sp.x, sp.y); ctx.rotate(sp.rot); drawCardBack(ctx, 0, 0, { scale: sp.s }); ctx.restore(); continue; }
    if (!sp.spec) continue;
    if (sp.mode === 'play' && sp.t < 0.3) { ctx.save(); ctx.globalAlpha = 0.5; ctx.shadowColor = sp.col; ctx.shadowBlur = 40; ctx.fillStyle = sp.col; ctx.beginPath(); ctx.arc(sp.x, sp.y, 40 * sp.s + 20, 0, 6.283); ctx.fill(); ctx.restore(); }
    drawSpriteCard(ctx, sp);
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

// ---- U5: hand fan, hover, drag follow, cannot-play chips (UX_SPEC 1)
const U = () => S.u || (S.u = { candId: null, candT: 0, lx: 0, ly: 0, speed: 0, endConfirm: null });
const rmotion = () => { const s = APP.shared && APP.shared.meta && APP.shared.meta.settings; return !!(s && (s.reducedMotion || s.reduceMotion)); };
const isTouch = () => !!(APP && APP.mouse && APP.mouse.touch);
const LIFTED = (dc) => dc.uid === S.hov || dc.uid === S.sel || (S.drag && S.drag.uid === dc.uid) || !!dc.fly;

function dragTarget(m, dr) {
  return dr.touch ? { x: clamp(m.x, 20, W - 20), y: clamp(m.y - 70, 40, H) } : { x: clamp(m.x + dr.ox, 20, W - 20), y: clamp(m.y + dr.oy, 40, H) };
}
// the point that decides zones and targets: the card's visual position on touch (finger minus 70), the pointer otherwise
function dragPt() { const m = APP.mouse, dr = S.drag; return dr && dr.touch ? { x: m.x, y: m.y - 70 } : { x: m.x, y: m.y }; }

function stepDrag(dc, dr, d, m, rm) {
  dr.t += d;
  dr.lift = Math.min(1, dr.lift + d / (rm ? 0.016 : 0.09));
  // while aiming at a target the card shrinks so it never hides the enemy it is aimed at (name, intent, HP)
  dr.k = (dr.k || 0) + ((dr.aim ? 1 : 0) - (dr.k || 0)) * (rm ? 1 : 1 - Math.exp(-d * 16));
  dc.s = lerp(dr.s0, 0.95, EASE.out(dr.lift)) * (1 - 0.36 * dr.k);
  const tp = dragTarget(m, dr);
  const K = rm ? 1200 : 520, C = rm ? 69.3 : 45.6;
  const steps = clamp(Math.ceil(d / 0.004), 1, 12), h = d / steps;
  for (let i = 0; i < steps; i++) {
    dr.vx += (K * (tp.x - dc.x) - C * dr.vx) * h; dr.vy += (K * (tp.y - dc.y) - C * dr.vy) * h;
    dc.x += dr.vx * h; dc.y += dr.vy * h;
  }
  const tt = rm ? 0 : clamp(dr.vx / 2400, -0.22, 0.22);
  dr.tilt += (tt - dr.tilt) * (1 - Math.exp(-d * 14));
  dc.rot = dr.tilt + dr.rot0 * (1 - EASE.out(dr.lift));
  dc.sq = rm ? 0 : Math.min(Math.hypot(dr.vx, dr.vy) / 9000, 0.04);
}
function flyHome(dc) { dc.fly = { t: 0, x: dc.x, y: dc.y, s: dc.s, rot: dc.rot }; dc.sq = 0; }

function layoutHand(app, d) {
  const n = S.hand.length, m = app.mouse, u = U(), dr = S.drag, rm = rmotion();
  const hi = S.hand.findIndex((dc) => dc.uid === S.hov);
  const di = dr ? S.hand.findIndex((dc) => dc.uid === dr.uid) : -1;
  const nn = di >= 0 ? n - 1 : n;
  const pv = u.touchPrev && S.sel;
  S.hand.forEach((dc, i) => {
    const isDrag = di === i;
    const si = di >= 0 && i > di ? i - 1 : i;
    const sl = L.handSlot(isDrag ? clamp(i, 0, Math.max(0, nn - 1)) : si, Math.max(1, nn));
    let tx = sl.x, ty = sl.y, ts = sl.s, tr = sl.rot;
    if (hi >= 0 && i !== hi && !dr) { const dist = Math.abs(i - hi); const push = dist === 1 ? 70 : dist === 2 ? 30 : dist === 3 ? 10 : 0; tx += Math.sign(i - hi) * push; }
    if (!isDrag && dc.uid === S.sel) { tx = clamp(sl.x, pv ? 130 : 140, pv ? 1150 : 1140); ty = pv ? L.PREVIEW_Y : L.SEL_Y; ts = pv ? L.PREVIEW_S : L.SEL_S; tr = 0; }
    else if (!isDrag && dc.uid === S.hov) { tx = clamp(sl.x, 245, 975); ty = L.HOVER_Y; ts = L.HOVER_S; tr = 0; } // clear of the energy orb and End Turn
    dc.tx = tx; dc.ty = ty; dc.ts = ts; dc.trot = tr;
    if (isDrag) stepDrag(dc, dr, d, m, rm);
    else if (dc.fly) {
      const f = dc.fly; f.t += d; const k = rm ? 1 : clamp(f.t / 0.16, 0, 1), e = EASE.out(k);
      dc.x = lerp(f.x, tx, e); dc.y = lerp(f.y, ty, e); dc.s = lerp(f.s, ts, e); dc.rot = lerp(f.rot, tr, e);
      if (k >= 1) { dc.fly = null; dc.settle = rm ? 0 : 1; }
    } else {
      const k = 1 - Math.exp(-d * 17);
      dc.x += (tx - dc.x) * k; dc.y += (ty - dc.y) * k; dc.s += (ts - dc.s) * k; dc.rot += (tr - dc.rot) * k;
      dc.sq = 0;
    }
    if (dc.settle > 0) dc.settle = Math.max(0, dc.settle - d / 0.15);
    if (dc.chip) { dc.chip.t += d; if (dc.chip.t > 1.2) dc.chip = null; }
    if (dc.costFlash > 0) dc.costFlash = Math.max(0, dc.costFlash - d / 0.35);
    dc.alpha = Math.min(1, dc.alpha + d * 6);
    if (dc.seam >= 0 && dc.seam < 1) dc.seam += d / 0.5;
    if (dc.jamT < 1) dc.jamT = Math.min(1, dc.jamT + d / 0.25);
    if (dc.shakeT > 0) dc.shakeT = Math.max(0, dc.shakeT - d / 0.22);
  });
}

function drawCardShadow(ctx, dc, lift) {
  const cw = CARD_W * dc.s, ch = CARD_H * dc.s, rx = cw * (0.46 + 0.08 * lift), ry = 12 + 12 * lift;
  ctx.save(); ctx.translate(dc.x, dc.y + ch * 0.48 + 14 * lift); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${0.45 * lift})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.283); ctx.fill(); ctx.restore();
}
function drawLock(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(14,12,10,.85)'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.283); ctx.fill();
  ctx.strokeStyle = COL.vellum; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -3, 4.5, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = COL.vellum; ctx.fillRect(-6, -2, 12, 9); ctx.restore();
}
function drawChip(app, text, x, y, col) {
  const ctx = app.ctx, w = Math.max(90, text.length * 8.6 + 22);
  ctx.save(); app.rr(x - w / 2, y - 14, w, 28, 8); ctx.fillStyle = 'rgba(14,12,10,.92)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); ctx.restore();
  app.text(text, x, y, { size: 15, ui: true, bold: true, align: 'center', baseline: 'middle', color: col });
}

function drawHand(app) {
  const ctx = app.ctx, c = S.c, rm = rmotion();
  const idle = canAct();
  const order = S.hand.slice();
  const rank = (dc) => (S.drag && dc.uid === S.drag.uid ? 3 : dc.fly ? 2 : dc.uid === S.hov ? 2 : dc.uid === S.sel ? 1 : 0);
  order.sort((a, b) => rank(a) - rank(b));
  const nh = S.hand.length;
  for (const dc of order) {
    const spec = dcSpec(dc);
    const hi = c.hand.indexOf(dc.w);
    const chk = hi >= 0 && !S.q.length ? canPlay(c, hi) : { ok: true };
    let cost = hi >= 0 ? effCost(c, dc.w) : spec.cost;
    if (typeof cost === 'number' && dc.w.jam && !dc.jam) cost = Math.max(0, cost - 1);
    const isDrag = !!(S.drag && S.drag.uid === dc.uid);
    const sx = dc.shakeT > 0 ? Math.sin((1 - dc.shakeT) * 6 * Math.PI * 1.0) * 6 * dc.shakeT : 0;
    const oy = dc.settle > 0 ? -Math.sin((1 - dc.settle) * Math.PI) * 4 : 0;
    const selected = dc.uid === S.sel && !isDrag;
    const lifted = LIFTED(dc);
    if (isDrag) drawCardShadow(ctx, dc, EASE.out(S.drag.lift)); else if (lifted && dc.s > 0.8) drawCardShadow(ctx, dc, 0.4);
    const x = dc.x + sx, y = dc.y + oy;
    ctx.save();
    if (dc.sq > 0.001) { ctx.translate(x, y); ctx.scale(1 + dc.sq, 1 - dc.sq * 0.6); ctx.translate(-x, -y); }
    drawCard(ctx, spec, x, y, { scale: dc.s, rot: dc.rot, tithed: dc.w.tithed, jam: dc.jam, cost, glow: selected ? 1 : (idle && chk.ok && dc.uid === S.hov ? 0.5 : 0), selected, dim: idle && !chk.ok ? 0.3 : 0, alpha: dc.alpha, hover: dc.uid === S.hov, compact: dc.s < 0.8 });
    ctx.restore();
    if (dc.seam >= 0 && dc.seam < 1.4) drawSeam(ctx, dc);
    if (dc.jam) drawClamp(ctx, dc);
    const cw = CARD_W * dc.s, ch = CARD_H * dc.s, left = dc.x - cw / 2, top = dc.y - ch / 2;
    if (idle && !chk.ok) drawLock(ctx, left + 18 * Math.max(0.8, dc.s), dc.y + 8, Math.max(0.8, dc.s));
    if (dc.costFlash > 0) { ctx.save(); ctx.globalAlpha = dc.costFlash * 0.8; ctx.fillStyle = '#e03a3a'; ctx.beginPath(); ctx.arc(left + 26 * dc.s * 1.1, top + 26 * dc.s * 1.1, 24 * dc.s, 0, 6.283); ctx.fill(); ctx.restore(); }
    if (idle && !isDrag && !S.q.length) { const kind = seamBadgeOf(c, dc.w); if (kind) drawSeamBadgeAt(app, kind, left + cw - 14, top + 66 * dc.s, dc.s); }
    if (app.reg) {
      const rx = Math.max(0, left), ry = Math.max(0, top), rw = Math.min(W, left + cw) - rx, rh = Math.min(H, top + ch) - ry;
      if (rw > 0 && rh > 0) app.reg('hand_' + dc.uid, rx, ry, rw, rh, { layer: 'hud', group: 'hand', overlay: lifted || !!S.hov || !!S.sel });
    }
  }
  for (const dc of S.hand) if (dc.chip) {
    const k = dc.chip.t, a = k > 0.9 ? 1 - (k - 0.9) / 0.3 : 1;
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    drawChip(app, dc.chip.text, clamp(dc.x, 90, W - 90), Math.max(64, dc.y - CARD_H * dc.s / 2 - 22 - Math.min(k, 0.2) * 20), COL.bad); ctx.restore();
  }
  drawTouchPreview(app); drawEndConfirm(app);
}

function previewRects(dc) {
  const cx = clamp(dc.x, 130, 1150), cw = CARD_W * dc.s, ch = CARD_H * dc.s;
  return { play: { x: cx - L.PLAY_BTN.w / 2, y: Math.min(dc.y + ch / 2 + 8, H - L.PLAY_BTN.h - 4), w: L.PLAY_BTN.w, h: L.PLAY_BTN.h }, x: { x: cx + cw / 2 - 22, y: dc.y - ch / 2 - 22, w: L.CANCEL_BTN, h: L.CANCEL_BTN } };
}
function drawTouchPreview(app) {
  const u = U(); if (!u.touchPrev || !S.sel || S.drag) return;
  const dc = S.hand.find((d) => d.uid === S.sel); if (!dc || dc.ty !== L.PREVIEW_Y) return;
  const r = previewRects(dc), ctx = app.ctx, tgt = selNeedsTarget();
  ctx.save();
  app.rr(r.play.x, r.play.y, r.play.w, r.play.h, 10); ctx.fillStyle = tgt ? '#3a2f1a' : '#7a5410'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = COL.lamp; ctx.stroke();
  app.text(tgt ? 'TAP TARGET' : 'PLAY', r.play.x + r.play.w / 2, r.play.y + r.play.h / 2, { size: tgt ? 15 : 24, bold: true, align: 'center', baseline: 'middle', color: COL.vellum, ui: true });
  ctx.beginPath(); ctx.arc(r.x.x + r.x.w / 2, r.x.y + r.x.h / 2, r.x.w / 2, 0, 6.283); ctx.fillStyle = 'rgba(14,12,10,.92)'; ctx.fill(); ctx.strokeStyle = COL.vellum; ctx.lineWidth = 2; ctx.stroke();
  const cx = r.x.x + r.x.w / 2, cy = r.x.y + r.x.h / 2; ctx.beginPath(); ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx + 8, cy + 8); ctx.moveTo(cx + 8, cy - 8); ctx.lineTo(cx - 8, cy + 8); ctx.stroke();
  ctx.restore();
  if (app.reg) { app.reg('preview_play', r.play.x, r.play.y, r.play.w, r.play.h, { layer: 'hud', group: 'preview', overlay: true }); app.reg('preview_cancel', r.x.x, r.x.y, r.x.w, r.x.h, { layer: 'hud', group: 'preview', overlay: true }); }
}
// Right of the Thread rail (ends x 1076), above End Turn: never over the rail.
const CONFIRM = { x: 1086, y: 432, w: 180, h: 106 };
function drawEndConfirm(app) {
  const u = U(), ec = u.endConfirm; if (!ec) return;
  if (!canAct() || S.t - ec.t0 > 6) { u.endConfirm = null; return; }
  const ctx = app.ctx, B = CONFIRM, ready = S.t - ec.t0 >= 0.4;
  ctx.save(); app.rr(B.x, B.y, B.w, B.h, 10); ctx.fillStyle = 'rgba(14,12,10,.94)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = ready ? COL.lamp : 'rgba(232,220,196,.4)'; ctx.stroke(); ctx.restore();
  app.text(`End turn with ${ec.energy} energy and ${ec.n} playable card${ec.n === 1 ? '' : 's'}?`, B.x + 12, B.y + 10, { size: 15, ui: true, bold: true, maxW: B.w - 24, lineH: 18, color: COL.vellum });
  app.text('Enter or click: end turn. Esc: keep playing.', B.x + 12, B.y + B.h - 36, { size: 12, ui: true, maxW: B.w - 24, lineH: 15, color: 'rgba(232,220,196,.7)' });
  if (app.reg) app.reg('end_confirm', B.x, B.y, B.w, B.h, { layer: 'hud', group: 'end_confirm', overlay: true });
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
function reasonText(dc, why) {
  const c = S.c;
  if (why === 'energy' && dc) {
    const cost = effCost(c, dc.w);
    if (dc.w.jam && typeof cost === 'number' && cost - 1 <= c.energy) return 'Jammed: +1 cost';
    return `Need ${cost} energy`;
  }
  return why === 'noTarget' ? 'No valid target' : (WHY[why] || 'Cannot play that');
}
function reject(dc, why) {
  if (dc) { dc.shakeT = 1; dc.costFlash = 1; dc.chip = { text: reasonText(dc, why), t: 0 }; }
  sfx('error');
}
function tryPlay(uid, ed) {
  const c = S.c;
  const hi = c.hand.findIndex((k) => k.uid === uid); if (hi < 0) return false;
  const dc = S.hand.find((d) => d.uid === uid);
  const chk = canPlay(c, hi);
  if (!chk.ok) { reject(dc, chk.why); return false; }
  if (chk.spec && chk.spec.target === 'enemy' && !liveEds().length) { reject(dc, 'noTarget'); return false; }
  if (needsTarget(c, hi) && !ed) { S.sel = uid; return false; }
  const ti = ed ? c.enemies.indexOf(ed.e) : undefined;
  const r = playCard(c, hi, ti);
  if (!r.ok) { reject(dc, r.why); return false; }
  S.sel = null; S.drag = null; S.potSel = null; U().endConfirm = null;
  absorb(); return true;
}
function doEndTurn() {
  if (!canAct()) return;
  const u = U(), c = S.c;
  if (u.endConfirm) { if (S.t - u.endConfirm.t0 < 0.4) return; u.endConfirm = null; } // re-arms after 400 ms, a double click is ignored
  else {
    let n = 0; for (let i = 0; i < c.hand.length; i++) if (canPlay(c, i).ok) n++;
    if (c.energy > 0 && n > 0) { u.endConfirm = { t0: S.t, energy: c.energy, n }; sfx('uiClick'); return; }
  }
  endTurn(c); S.sel = null; absorb();
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
    if (L.inRectXY(x, y, ed.x - hw, EF - ed.h - 14, hw * 2, ed.h + 90)) { if (!best || Math.abs(ed.x - x) < Math.abs(best.x - x)) best = ed; }
  }
  return best;
}
function selNeedsTarget() { if (!S.sel) return false; const hi = S.c.hand.findIndex((k) => k.uid === S.sel); return hi >= 0 && needsTarget(S.c, hi); }
function targeting() { return (S.sel && selNeedsTarget()) || (S.potSel !== null && S.potSel !== undefined); }

function selectCard(uid) {
  if (!S.hand.some((d) => d.uid === uid)) return;
  const u = U();
  S.sel = uid; S.potSel = null; S.tgt = 0; S.kbTarget = false; u.touchPrev = isTouch(); u.endConfirm = null; sfx('uiClick', { pitch: 1.3 });
}
function ensureTouch(app) {
  if (app._u5in || !app.canvas || !app.canvas.addEventListener) return; app._u5in = true;
  app.canvas.addEventListener('pointerdown', (e) => { if (e.isPrimary === false) app.mouse.second = true; else app.mouse.touch = !!e.pointerType && e.pointerType !== 'mouse'; }, true);
}
function cancelDrag(keepSel) {
  const dr = S.drag; if (!dr) return;
  S.drag = null; S.down = null;
  const dc = S.hand.find((d) => d.uid === dr.uid); if (dc) flyHome(dc);
  if (!keepSel) S.sel = null;
  sfx('uiBack');
}
function snapTarget(p) {
  let best = null, bd = 90;
  for (const ed of liveEds()) { const dd = Math.hypot(ed.x - p.x, EF - ed.h * 0.55 - p.y); if (dd < bd) { bd = dd; best = ed; } }
  return best || enemyAt(p.x, p.y);
}
// hover candidate: the visible strip of each resting card (never the lifted card), plus the column above the card that is already lifted
function hoverCand(m) {
  const n = S.hand.length;
  for (let i = n - 1; i >= 0; i--) {
    const dc = S.hand[i]; if (dc.alpha < 0.3) continue;
    const st = L.handStrip(i, n);
    let top = st.top; if (dc.uid === S.hovPrev || dc.uid === S.sel) top = Math.min(top, dc.y - CARD_H * dc.s / 2);
    if (m.x >= st.x0 && m.x < st.x1 && m.y >= top && m.y <= H) return dc;
  }
  return null;
}

// ---------------------------------------------------------------- input
function updateInput(app, dt) {
  const m = app.mouse, c = S.c, u = U();
  ensureTouch(app);
  const mine = app.stack[app.stack.length - 1] === SCREEN;
  const keys = mine ? app.pressedKeys.slice() : [];
  app.escBusy = !!(mine && (S.drag || S.modal || S.sel || (S.potSel !== null && S.potSel !== undefined) || u.endConfirm || c.pending));
  if (!mine || app.blocked) { S.hov = null; S.down = null; if (S.drag) cancelDrag(); return; }
  const touch = isTouch();

  // speed-up while the queue plays
  if (busy() && !S.ending) { if (m.pressed || keys.some((e) => e.key === ' ' || e.key === 'Enter')) S.skip = true; }
  if (S.ending) {
    if (m.pressed && S.ending.t > 0.5) S.ending.skip = true;
    if (keys.some((e) => e.key === ' ' || e.key === 'Enter') && S.ending.t > 0.4) S.ending.skip = true;
  }

  // ---- hover over hand (strip only, 40 ms intent delay on fast sweeps)
  u.speed = u.speed * 0.6 + (Math.hypot(m.x - u.lx, m.y - u.ly) / Math.max(dt, 1e-3)) * 0.4; u.lx = m.x; u.ly = m.y;
  S.hov = null; u.cand = null;
  if (!S.modal && !S.ending && !S.drag) {
    let cand = hoverCand(m), want = cand ? cand.uid : null;
    if (want !== S.hovPrev && S.hovPrev && !m.pressed && u.speed > 1500) {
      u.candT = u.candId === want ? u.candT + dt : 0; u.candId = want;
      if (u.candT < 0.04) { want = S.hovPrev; cand = S.hand.find((d) => d.uid === want) || null; }
    } else u.candId = null;
    u.cand = cand ? cand.uid : null;
    if (cand && !touch) { S.hov = cand.uid; if (S.hovPrev !== cand.uid) sfx('uiHover', { vol: 0.3 }); }
    else if (cand && touch && S.down && S.down.long) S.hov = cand.uid;
    if (!S.hov && S.sel && S.kbUsed && !touch && !m.down) S.hov = S.sel; // keyboard focus shows the same tooltip as hover
    S.hovPrev = S.hov;
  } else if (S.drag) S.hov = S.drag.uid;

  if (S.modal) { modalKeys(keys); S.down = null; return; }
  if (c.pending) { pendingKeys(keys); S.down = null; return; }
  if (S.ending) return;

  const act = canAct();

  // ---- keyboard
  for (const e of keys) {
    const k = e.key;
    if (k === 'Escape') {
      if (S.drag) cancelDrag();
      else if (u.endConfirm) { u.endConfirm = null; sfx('uiBack'); }
      else if (S.sel || S.potSel !== null && S.potSel !== undefined) { S.sel = null; S.potSel = null; sfx('uiBack'); }
      else if (!busy()) app.shared.flow.openSettings && app.shared.flow.openSettings();
    }
    else if (k === 'q' || k === 'Q' || k === 'i' || k === 'I') S.modal = { kind: 'piles', tab: 'draw', scroll: 0 };
    else if (act) {
      if (/^[0-9]$/.test(k)) {
        const idx = k === '0' ? 9 : Number(k) - 1; const dc = S.hand[idx];
        if (dc) { if (S.sel === dc.uid) tryPlay(dc.uid, selNeedsTarget() ? liveEds()[S.tgt % Math.max(1, liveEds().length)] : null); else { selectCard(dc.uid); S.kbUsed = true; if (selNeedsTarget() && liveEds().length > 1) S.kbTarget = true; } }
      } else if (k === 'Tab') { const l = liveEds(); if (l.length) { S.tgt = (S.tgt + (e.shiftKey ? l.length - 1 : 1)) % l.length; S.kbTarget = true; S.kbUsed = true; sfx('uiHover'); } }
      else if ((k === 'ArrowUp' || k === 'ArrowDown') && S.sel && selNeedsTarget()) { const l = liveEds(); if (l.length) { S.tgt = (S.tgt + (k === 'ArrowDown' ? 1 : l.length - 1)) % l.length; S.kbTarget = true; S.kbUsed = true; sfx('uiHover'); } }
      else if (k === 'e' || k === 'E') doEndTurn();
      else if (k === 'Enter' || k === ' ') {
        if (u.endConfirm) doEndTurn();
        else if (S.sel) { const l = liveEds(); tryPlay(S.sel, selNeedsTarget() ? l[S.tgt % Math.max(1, l.length)] : null); }
        else if (S.potSel !== null && S.potSel !== undefined) { const l = liveEds(); tryPotion(S.potSel, l[S.tgt % Math.max(1, l.length)]); }
        else doEndTurn();
      } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const l = liveEds();
        if (S.sel && selNeedsTarget() && S.kbTarget && l.length) { S.tgt = (S.tgt + (k === 'ArrowRight' ? 1 : l.length - 1)) % l.length; sfx('uiHover'); }
        else { S.kbUsed = true; const i = S.hand.findIndex((d) => d.uid === S.sel); const n = S.hand.length; if (n) selectCard(S.hand[(i < 0 ? (k === 'ArrowRight' ? 0 : n - 1) : (i + (k === 'ArrowRight' ? 1 : n - 1)) % n)].uid); }
      }
    }
  }

  // ---- second finger cancels a drag
  if (m.second) { m.second = false; if (S.drag) { cancelDrag(); return; } }

  // ---- mouse / touch
  if (m.pressed && m.button === 2) { if (S.drag) cancelDrag(); else if (S.sel || S.potSel !== null && S.potSel !== undefined) { S.sel = null; S.potSel = null; sfx('uiBack'); } S.down = null; return; }
  if (m.pressed) S.kbUsed = false;
  if (m.pressed) S.down = { x: m.x, y: m.y, uid: act ? u.cand : null, moved: false, t: 0, touch, long: false };
  if (S.down) {
    S.down.t += dt;
    const dist = Math.hypot(m.x - S.down.x, m.y - S.down.y);
    if (S.down.uid && m.down && !S.drag && act) {
      if (dist > (S.down.touch ? 10 : 8) || (S.down.t >= 0.12 && dist > 3)) {
        const dc = S.hand.find((d) => d.uid === S.down.uid);
        if (dc) {
          const rm = rmotion();
          S.drag = { uid: dc.uid, touch: S.down.touch, ox: clamp(dc.x - S.down.x, -80, 80), oy: clamp(dc.y - S.down.y, -80, 80), vx: 0, vy: 0, lift: 0, t: 0, tilt: 0, s0: dc.s, rot0: dc.rot, armed: false, everArmed: false, aim: false, snap: null };
          if (rm) S.drag.lift = 1;
          dc.fly = null; S.sel = dc.uid; u.touchPrev = false; u.endConfirm = null; S.down.moved = true; sfx('uiClick', { vol: 0.5, pitch: 1.5 });
        }
      } else if (S.down.touch && !S.down.long && S.down.t >= 0.35 && dist <= 10) { S.down.long = true; sfx('uiHover', { vol: 0.4 }); }
    }
  }
  if (S.drag) {
    const dr = S.drag, p = dragPt();
    if (!dr.armed && p.y < L.ARM_Y) { dr.armed = true; dr.everArmed = true; sfx('uiHover', { vol: 0.35, pitch: 1.4 }); }
    else if (dr.armed && p.y > L.DISARM_Y) dr.armed = false;
    dr.aim = p.y < L.AIM_LINE;
    dr.snap = selNeedsTarget() ? snapTarget(p) : null;
    if (dr.everArmed && p.y > 560 && p.x > 120 && p.x < 1160 && !m.released) { cancelDrag(); return; } // dragged back over the hand
  }
  if (m.released) {
    const dn = S.down; S.down = null;
    if (S.drag) { dropDrag(m); }
    else if (act && dn) clickAt(m, dn);
  }
  // sel survives only while the card exists
  if (S.sel && !S.hand.some((d) => d.uid === S.sel)) S.sel = null;
  if (S.drag && !m.down && !m.released) cancelDrag();
  if (S.drag) app.escBusy = true;
}

function dropDrag(m) {
  const dr = S.drag, uid = dr.uid, p = dragPt();
  S.drag = null;
  const hi = S.c.hand.findIndex((k) => k.uid === uid);
  const dc = S.hand.find((d) => d.uid === uid);
  if (hi < 0 || !dc) { S.sel = null; return; }
  if (!dr.armed || p.y <= L.BAR_H) { S.sel = null; flyHome(dc); sfx('uiBack'); return; }
  let ed = null;
  if (needsTarget(S.c, hi)) {
    ed = dr.snap || snapTarget(p);
    if (!ed) { S.sel = uid; S.tgt = 0; U().touchPrev = false; dc.chip = { text: 'Pick a target', t: 0 }; flyHome(dc); sfx('error', { vol: 0.4 }); return; }
  } else if (specOf(S.c, dc.w).target === 'enemy') ed = liveEds()[0] || null;
  if (!tryPlay(uid, ed)) { const d2 = S.hand.find((d) => d.uid === uid); if (d2) { flyHome(d2); } S.sel = null; }
}
function clickAt(m, dn) {
  const x = m.x, y = m.y, u = U();
  // potion target mode
  if (S.potSel !== null && S.potSel !== undefined) { const ed = enemyAt(x, y); if (ed) tryPotion(S.potSel, ed); else if (y > L.BAR_H) { S.potSel = null; } return; }
  // end-turn confirm chip
  if (u.endConfirm && L.inRectXY(x, y, CONFIRM.x, CONFIRM.y, CONFIRM.w, CONFIRM.h)) { doEndTurn(); return; }
  // touch preview controls
  if (u.touchPrev && S.sel) {
    const pc = S.hand.find((d) => d.uid === S.sel);
    if (pc) {
      const r = previewRects(pc);
      if (L.inRectXY(x, y, r.x.x, r.x.y, r.x.w, r.x.h)) { S.sel = null; sfx('uiBack'); return; }
      if (L.inRectXY(x, y, r.play.x, r.play.y, r.play.w, r.play.h)) { if (selNeedsTarget()) { pc.chip = { text: 'Pick a target', t: 0 }; sfx('error', { vol: 0.4 }); } else tryPlay(S.sel, null); return; }
    }
  }
  // tap / click on a card
  if (dn.uid && !dn.moved) {
    const uid = dn.uid;
    if (S.sel === uid) { if (u.touchPrev) return; if (!selNeedsTarget()) tryPlay(uid, null); else { const l = liveEds(); if (l.length === 1) tryPlay(uid, l[0]); } }
    else selectCard(uid);
    return;
  }
  if (S.sel) {
    if (selNeedsTarget()) { const ed = enemyAt(x, y); if (ed) tryPlay(S.sel, ed); else if (u.touchPrev && !S.sel) S.sel = null; }
    else if (u.touchPrev) { const pc = S.hand.find((d) => d.uid === S.sel); if (pc && !L.inRectXY(x, y, pc.x - CARD_W * pc.s / 2, pc.y - CARD_H * pc.s / 2, CARD_W * pc.s, CARD_H * pc.s)) { S.sel = null; sfx('uiBack'); } }
    else if (y < PLAY_LINE && y > L.BAR_H + 4) tryPlay(S.sel, null);
    else if (y >= PLAY_LINE && !u.cand) S.sel = null;
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
  ctx.save(); ctx.fillStyle = 'rgba(8,6,6,.95)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  const tabs = [['draw', 'Draw'], ['discard', 'Discard'], ['exhaust', 'Exhaust']];
  tabs.forEach(([k, lab], i) => {
    const n = k === 'draw' ? c.drawPile.length : k === 'discard' ? c.discard.length : c.exhaust.length;
    if (app.button(`${lab} (${n})`, 330 + i * 200, 22, 180, 44, { fill: M.tab === k ? COL.attack : COL.slab2, size: 20 })) { M.tab = k; M.scroll = 0; }
  });
  if (app.button('Close', 1120, 22, 120, 44, { size: 20 })) { S.modal = null; sfx('uiBack'); return; }
  const pool = poolOf(M.tab);
  app.text(M.tab === 'draw' ? 'Draw pile' : M.tab === 'discard' ? 'Discard pile' : 'Exhausted', 40, 22, { size: 24, bold: true, color: COL.lamp });
  app.text(M.tab === 'draw' ? 'No particular order' : M.tab === 'discard' ? 'Reshuffled when the draw pile runs out' : 'Gone until the combat ends', 40, 54, { size: 13, ui: true, color: 'rgba(232,220,196,.6)' });
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
  ctx.save(); ctx.fillStyle = 'rgba(8,6,6,.95)'; ctx.fillRect(0, 0, W, H); ctx.restore();
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
  res.forEach((ed, i) => { ed.tx = sl[i].x; ed.tscale = sl[i].scale; ed.w = sl[i].w; ed.h = sl[i].h; ed.sw = sl[i].sw; if (snap || !ed.placed) { ed.x = ed.tx; ed.scale = ed.tscale; ed.placed = true; } });
}

// ---------------------------------------------------------------- update
function update(app, dt) {
  if (!S) return;
  if (app.a11y) { try { watchCombat(app, S.c, (e) => intentText(intentOf(S.c, e))); } catch { /* announcements never break play */ } }
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
  juiceTick(ad, raw);
  for (const ed of S.eds) {
    tickEnt(ed, ad);
    if (!ed.visible) continue;
    ed.spawnT = Math.min(1, ed.spawnT + ad / 0.35);
    ed.x += (ed.tx - ed.x) * (1 - Math.exp(-ad * 8)); ed.scale += (ed.tscale - ed.scale) * (1 - Math.exp(-ad * 8));
    if (ed.intentT < 1 && !ed.dyingOn) ed.intentT = Math.min(1, ed.intentT + ad / 0.45);
    if (ed.intentOut > 0) ed.intentOut = Math.min(1, ed.intentOut + ad / 0.25);
    if (ed.atkT >= 0) { ed.atkT += ad; const dur = ed.atkKind === 'attack' ? (ed.atkTm ? J.atkTotal(ed.atkTm) / 1000 : 0.5) : 0.45; if (ed.atkT >= dur) ed.atkT = -1; }
    if (ed.callout) { ed.callout.t += ad; if (ed.callout.t > 1) ed.callout = null; }
    if (ed.stunT > 0) ed.stunT = Math.max(0, ed.stunT - ad * 1.5);
    if (ed.dyingOn && !ed.gone) { ed.dying = Math.min(1, ed.dying + (ed.fin && ed.fin.t < J.FINAL.hold ? 0 : ad / (ed.quick ? 0.3 : 0.85))); if (ed.dying >= 1) { ed.gone = true; } }
    // lunge parameter: out fast, back slower
    enemyPose(ed);
  }
  if (S.ending && S.ending.win === false) S.P.dying = clamp(S.ending.t / 1.8, 0, 1);
  S.vig = Math.max(0, S.vig - ad * 2.2); S.lamp = Math.max(0, S.lamp - ad * 0.7); S.dark = Math.max(0, S.dark - ad * 0.55);
  S.orbPulse = Math.max(0, S.orbPulse - ad * 3); S.goldPulse = Math.max(0, S.goldPulse - ad * 3);
  for (const k of Object.keys(S.pulse)) S.pulse[k] = Math.max(0, S.pulse[k] - ad * 3);
  if (S.banner) { S.banner.t += ad; if (S.banner.t > S.banner.life) S.banner = null; }
  { const trn = APP && APP.shared && APP.shared.transitions; if (trn && trn.watchPhases) trn.watchPhases(APP, S.c); }
  for (const sp of S.spr) stepSprite(sp, ad);
  S.spr = S.spr.filter((s) => !s.done);
  for (const co of S.coins) {
    co.t += ad;
    if (co.t >= co.dur && !co.done) { co.done = true; S.goldPulse = 1; sfx('coin', { vol: 0.3, pitch: co.pitch || 1 + Math.random() * 0.3 }); if (co.val) S.gold += co.val; }
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
  S.ending = { t: 0, win, skip: false, stamped: false, coins: false, hb: 0 };
  S.sel = null; S.drag = null; S.banner = null;
  if (win) {
    sfx('win'); S.P.attack = 0.0001; // hero flourish
    S.goldLine = S.c.goldGained ? `+${S.c.goldGained} gold` : '';
  } else {
    sfx('lose'); S.ending.hb = 1; audioCall('heartbeat', 56); audioCall('setLowpass', 800, 400); S.lpSet = true;
  }
}
function updateEnding(app, raw) {
  const E = S.ending;
  if (!E.win && E.t < 1) E.skip = false; // the death is not skippable for the first second
  E.t += raw * (E.skip ? 4 : 1);
  if (E.win) {
    if (!E.stamped && E.t >= 0.24) { // banner stamp with a 90 ms hold
      E.stamped = true; S.fx.hitstop(90); kick(0, 1, 7, 7, 0); S.fx.ring(W / 2, 250, COL.lamp, 260, 0.5); S.fx.burst(W / 2, 250, 'gild', { n: 20 }); sfx('hitBig', { pitch: 1.2, vol: 0.6 });
    }
    if (!E.coins && E.t >= 0.6) { // one plink per coin, rising pentatonic
      E.coins = true;
      const g = S.c.goldGained || 0;
      if (g > 0) {
        const cnt = clamp(Math.ceil(g / 8), 3, 8); let left = g;
        for (let i = 0; i < cnt; i++) {
          const val = i === cnt - 1 ? left : Math.floor(g / cnt); left -= val;
          S.coins.push({ x: W / 2 + rnd(-40, 40), y: 250, tx: L.GOLD_POS.x, ty: L.GOLD_POS.y, t: -i * 0.07, dur: 0.55, arc: rnd(60, 140), val, pitch: J.pent(i) });
        }
      }
    }
    if (E.t < 1.0 && Math.random() < 0.3) S.fx.emit({ x: rnd(80, 1200), y: -10, n: 2, shape: 'coin', colors: ['#F2C14E', '#ffe38a'], speed: 80, angle: Math.PI / 2, spread: 0.5, gravity: 800, life: 1.5, size: 7 });
  } else {
    // the heartbeat slows over three beats and stops
    if (E.hb === 1 && E.t >= 0.8) { E.hb = 2; audioCall('heartbeat', 44); }
    if (E.hb === 2 && E.t >= 1.5) { E.hb = 3; audioCall('heartbeat', 30); }
    if (E.hb === 3 && E.t >= 2.2) { E.hb = 4; audioCall('heartbeat', 0); }
  }
  const end = E.win ? 1.8 : 2.8;
  if (E.t >= end && !S.finalized) finalize();
}
function finalize() {
  if (S.finalized) return;
  S.finalized = true;
  juiceLeave();
  const { run, c } = S;
  const res = finishCombat(c);
  RUN.resolveFight(run, res);
  const flow = APP.shared.flow;
  if (flow && flow.route) flow.route();
}

// ---------------------------------------------------------------- draw
function theme() { return ACT_THEME[S.run.act] || 'ward'; }
function vignette(ctx, a, color, inner = 200) {
  if (a <= 0) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, inner, W / 2, H / 2, 760);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, rgba(color, clamp(a, 0, 1)));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function draw(app) {
  if (!S) return;
  const ctx = app.ctx, fx = S.fx, c = S.c;
  const so = fx.shakeOffset();
  ctx.save();
  ctx.fillStyle = COL.slab; ctx.fillRect(0, 0, W, H);
  ctx.translate(so.x, so.y); applyCam(ctx);
  drawBackground(ctx, theme(), S.t);
  if (S.boss) { ctx.fillStyle = 'rgba(120,10,24,.2)'; ctx.fillRect(-20, -20, W + 40, H + 40); }
  const tgtMode = targeting() || (S.drag && selNeedsTarget());
  drawHeroAndHud(app);
  drawEnemies(app, tgtMode);
  drawSprites(app);
  drawCoins(app);
  { const fd = S.hand.find((d) => d.uid === (S.hov || S.sel)); drawSeamRail(app, c, L.SEAM, S.t, fd ? fd.w : null, !busy()); }
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
  if (S.dgr && S.dgr.on) { // low HP: a red rim that beats with the heart; critical (level 1) closes in tighter. Reduced motion: a steady rim.
    const rm = FX_OPTS.reduced || rmotion(), lv = S.dgr.level, pu = rm ? 0.35 : S.dgr.pulse;
    vignette(ctx, (0.3 + pu * 0.5) * lv, '#8a0c20', lv >= 1 ? 120 : 200);
  }
  if (S.lamp > 0) { ctx.fillStyle = `rgba(0,0,0,${S.lamp * 0.45})`; ctx.fillRect(0, 0, W, H); }
  if (S.dark > 0) { ctx.fillStyle = `rgba(0,0,0,${S.dark * 0.6})`; ctx.fillRect(0, 0, W, H); }
  if (S.drag && !selNeedsTarget()) drawPlayZone(app);
  drawCardInfo(app);
  drawBanner(app);
  drawJuice(app);
  drawTips(app);
  if (c.pending && !S.ending && !busy()) drawPendingModal(app);
  if (S.modal) drawPilesModal(app);
}

function bracketEd(ctx, ed, a, fill) {
  const x = ed.x - ed.w / 2 - 6, y = EF - ed.h - 10, w = ed.w + 12, h = ed.h + 22, l = 16;
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = COL.lamp; ctx.lineWidth = 4; ctx.lineCap = 'square';
  if (fill) { ctx.fillStyle = 'rgba(242,193,78,.08)'; ctx.fillRect(x, y, w, h); }
  ctx.beginPath();
  ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y);
  ctx.moveTo(x + w - l, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + l);
  ctx.moveTo(x + w, y + h - l); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - l, y + h);
  ctx.moveTo(x + l, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - l);
  ctx.stroke(); ctx.restore();
}
function drawTargetBrackets(app, snap, all) {
  for (const ed of liveEds()) bracketEd(app.ctx, ed, all || ed === snap ? 1 : 0.55, all || ed === snap);
}

function drawPlayZone(app) {
  const ctx = app.ctx, dr = S.drag; if (!dr) return;
  const on = dr.armed, dc = S.hand.find((d) => d.uid === dr.uid);
  const tgt = dc ? specOf(S.c, dc.w).target : 'self';
  if (tgt === 'all' || tgt === 'enemy') drawTargetBrackets(app, null, tgt === 'all' || liveEds().length === 1);
  ctx.save();
  if (tgt === 'self' || tgt === 'none') { ctx.fillStyle = `rgba(242,193,78,${on ? 0.1 : 0.05})`; ctx.fillRect(0, 150, W, PLAY_LINE - 150); }
  ctx.strokeStyle = on ? COL.lamp : 'rgba(232,220,196,.25)'; ctx.setLineDash([10, 8]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(150, PLAY_LINE); ctx.lineTo(1130, PLAY_LINE); ctx.stroke(); ctx.setLineDash([]);
  app.text(on ? 'Release to play' : 'Drag up to play', W / 2, PLAY_LINE - 28, { size: 18, ui: true, align: 'center', color: on ? COL.lamp : 'rgba(232,220,196,.5)' });
  ctx.restore();
}
const HERO_SCALE = 1.12;
// soft ground shadow: a radial gradient squashed into an ellipse (no hard edge), rx = half width
function groundShadow(ctx, x, y, rx, a) {
  const ry = Math.max(10, rx * 0.26);
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${0.55 * a})`); g.addColorStop(0.6, `rgba(0,0,0,${0.28 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.283); ctx.fill(); ctx.restore();
}
function drawHeroAndHud(app) {
  const ctx = app.ctx, P = S.P;
  // shadow
  groundShadow(ctx, HERO_X, FOOT_Y - 2, 90, 1.25);
  const lunge = P.attack > 0 ? Math.sin(Math.min(1, P.attack / 2) * Math.PI) : 0;
  const hx = HERO_X + lunge * 34 - (S.heroKick || 0) * 14;
  const dying = S.ending && !S.ending.win ? P.dying : 0;
  ctx.save();
  if (dying) ctx.globalAlpha = 1 - dying * 0.6;
  drawHero(ctx, S.run.hero, hx, FOOT_Y + dying * 24, { scale: HERO_SCALE, t: S.t, hurt: P.hurt, attack: lunge, dying });
  ctx.restore();
  drawHeroPlate(app, P, HEROES[S.run.hero].name, S.t, S.dgr && S.dgr.on ? { pulse: S.dgr.pulse, level: S.dgr.level, rm: FX_OPTS.reduced || rmotion() } : null); // hp bar, block and statuses inside the hero-plate rect (combat_layout HERO_PLATE)
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
      ctx.beginPath(); ctx.ellipse(ed.x, EF + 6, ed.w * 0.55 + (hot ? 10 : 0) + Math.sin(S.t * 6) * 2, 16, 0, 0, 6.283); ctx.stroke();
      if (hot) { ctx.fillStyle = 'rgba(242,193,78,.1)'; ctx.fillRect(ed.x - ed.w / 2 - 8, EF - ed.h - 8, ed.w + 16, ed.h + 20); }
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = alpha;
    groundShadow(ctx, ed.x, EF - 2, Math.max(50, ed.w * 0.68), 1.25);
    const stun = ed.stunT > 0 ? Math.sin(S.t * 60) * 4 * ed.stunT : 0;
    const x = ed.x - ed.lunge * 46 * ed.scale + ed.kick * 12 + stun;
    drawEnemyJ(ctx, ed, def, x, EF + drop);
    ctx.restore();
    if (ed.dyingOn) continue;
    drawEnemyHud(app, ed, alpha, hoverEd === ed);
  }
}

function drawEnemyHud(app, ed, alpha, hot) {
  const info = ed.move ? intentWith(ed, ed.move) : null;
  drawEnemyPlate(app, ed, { alpha, hot, info, many: liveEds().length, moveName: info ? moveName(info) : '', suppress: !!(S.banner || S.modal) || app.blocked || ed.intentOut > 0, tgt: targeting(), c: S.c });
  if (ed.callout && ed.callout.text) {
    const k = ed.callout.t; const ctx = app.ctx; ctx.save(); ctx.globalAlpha = clamp(1 - (k - 0.6) / 0.4, 0, 1) * alpha;
    app.text(ed.callout.text, ed.x, EF - ed.h * 0.6 - k * 30, { size: 22, bold: true, align: 'center', color: COL.vellum, stroke: '#0e0e0e', strokeW: 5, baseline: 'middle' }); ctx.restore();
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
  const ctx = app.ctx, m = app.mouse, dr = S.drag, rm = rmotion();
  const dc = S.hand.find((d) => d.uid === S.sel);
  let from, to, snap = null;
  if (dr) {
    if (!dr.aim || !dc) { if (dc) drawTargetBrackets(app, null, false); return; }
    from = { x: dc.x, y: dc.y - CARD_H * dc.s / 2 }; snap = dr.snap;
    const p = dragPt(); to = snap ? { x: snap.x, y: EF - snap.h * 0.55 } : p;
  } else {
    from = dc ? { x: dc.x, y: dc.y - CARD_H * dc.s / 2 } : (S.potSel != null ? { x: potionPos(S.potSel).x, y: 56 } : null);
    if (!from) return;
    const l = liveEds();
    snap = S.kbTarget && l.length ? l[S.tgt % l.length] : snapTarget(m);
    to = snap ? { x: snap.x, y: EF - snap.h * 0.55 } : { x: m.x, y: m.y };
  }
  drawTargetBrackets(app, snap, false);
  const cx = (from.x + to.x) / 2, cy = Math.min(from.y, to.y) - 120;
  const col = snap ? COL.lamp : rgba(COL.vellum, 0.5);
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.setLineDash([14, 9]); ctx.lineDashOffset = rm ? 0 : -S.t * 40;
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo(cx, cy, to.x, to.y); ctx.stroke(); ctx.setLineDash([]);
  const tx = to.x - cx, ty = to.y - cy, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
  ctx.beginPath(); ctx.moveTo(to.x + ux * 2, to.y + uy * 2); ctx.lineTo(to.x - ux * 12 - uy * 7, to.y - uy * 12 + ux * 7); ctx.lineTo(to.x - ux * 12 + uy * 7, to.y - uy * 12 - ux * 7); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawTopBar(app) {
  const ctx = app.ctx, run = S.run, P = S.P, hero = HEROES[run.hero];
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, L.BAR_H); g.addColorStop(0, 'rgba(14,12,10,.96)'); g.addColorStop(1, 'rgba(26,22,20,.88)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, L.BAR_H);
  ctx.fillStyle = 'rgba(232,220,196,.25)'; ctx.fillRect(0, L.BAR_H - 1, W, 1);
  ctx.restore();
  // hero block 0..365: portrait, name, hp, gold (the right 144 px of the bar belong to the global Pause / Fullscreen buttons)
  drawPortrait(ctx, run.hero, 32, 28, 40);
  const hn = fitText(app, hero.name, 118, 19, 14, { bold: true });
  app.text(hn.str, 60, 6, { size: hn.size, bold: true, color: COL.vellum });
  const ht = fitText(app, hero.title || '', 118, 14, 14, { ui: true });
  app.text(ht.str, 60, 29, { size: ht.size, ui: true, color: COL.vellum2 });
  drawHeart(ctx, 192, 28, 26);
  app.text(`${Math.max(0, Math.ceil(P.hp))}/${P.maxHp}`, 210, 17, { size: 19, bold: true, ui: true, color: COL.bad });
  const gp = 1 + S.goldPulse * 0.25;
  ctx.save(); ctx.translate(L.GOLD_POS.x - 10, L.GOLD_POS.y); ctx.scale(gp, gp); drawCoin(ctx, 0, 0, 24); ctx.restore();
  app.text(String(S.gold), L.GOLD_POS.x + 8, 17, { size: 19, bold: true, ui: true, color: COL.gold });
  app.reg('topHero', 0, 0, 365, L.BAR_H, {});
  // potions: 3 slots 38 px step 44 (shrinks only if the run has more slots)
  const slots = RUN.potionSlots(run), P0 = L.POTION0;
  const pstep = Math.min(P0.step, P0.max / Math.max(1, slots)), psz = Math.min(P0.size, pstep - 4);
  for (let i = 0; i < slots; i++) {
    const x = P0.x + i * pstep, y = P0.y + (P0.size - psz) / 2, sz = psz;
    const id = S.potions[i];
    app.rr(x, y, sz, sz, 8); ctx.save(); ctx.fillStyle = 'rgba(40,34,30,.9)'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = (S.potSel === i) ? COL.lamp : 'rgba(232,220,196,.35)'; ctx.stroke(); ctx.restore();
    app.reg('potion' + i, x, y, sz, sz, {});
    if (id) {
      drawPotion(ctx, id, x + sz / 2, y + sz / 2, sz - 8);
      const p = POTIONS[id];
      if (app.inRect(x, y, sz, sz)) {
        app.cursor = 'pointer'; queueTip(app, 'pot:' + id, [[{ title: p.name, text: p.text + (canAct() ? '\n(click to use)' : ''), color: COL.energy, glyph: 'diamond' }]], { x, y, w: sz, h: sz });
        if (canAct() && app.clicked(x, y, sz, sz)) { if (S.potSel === i) S.potSel = null; else tryPotion(S.run.potions.indexOf(id) >= 0 ? i : i, null); }
      }
    }
  }
  drawRelicStrip(app, run.relics || []); // 9 relics then a '+N' chip opening a list
  app.text(`Turn ${Math.max(1, S.turn)}`, L.TURN_POS.x, L.TURN_POS.y, { size: 20, bold: true, align: 'center', color: COL.vellum });
  app.reg('topTurn', L.TURN_POS.x - 38, L.TURN_POS.y - 2, 76, 28, {});
  app.reg('topDeck', L.DECK_BTN.x, L.DECK_BTN.y, L.DECK_BTN.w, L.DECK_BTN.h, {});
  if (app.button('Deck', L.DECK_BTN.x, L.DECK_BTN.y, L.DECK_BTN.w, L.DECK_BTN.h, { size: 18 })) { const f = app.shared.flow; if (f && f.openDeck) f.openDeck(); }
}

const PILE_LABEL = { draw: 'DRAW', disc: 'DISCARD', exh: 'EXH' };
function pileStack(app, pos, count, s, label, key, onClick) {
  const ctx = app.ctx, pl = S.pulse[key] || 0;
  const bw = CARD_W * s, bh = CARD_H * s;
  const pulse = 1 + pl * 0.18;
  const layers = Math.min(3, Math.ceil(count / 6));
  // recessed slot under every pile so an empty one still reads as a place, not a gap
  ctx.save(); ctx.translate(pos.x, pos.y);
  app.rr(-bw / 2 - 5, -bh / 2 - 5, bw + 10, bh + 10, 8); ctx.fillStyle = 'rgba(8,6,6,.55)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = count ? 'rgba(232,220,196,.35)' : 'rgba(232,220,196,.25)'; ctx.setLineDash(count ? [] : [5, 4]); ctx.stroke(); ctx.setLineDash([]);
  if (pl > 0) { ctx.shadowColor = COL.lamp; ctx.shadowBlur = 22 * pl; ctx.strokeStyle = rgba(COL.lamp, 0.9 * pl); ctx.lineWidth = 3; app.rr(-bw / 2 - 5, -bh / 2 - 5, bw + 10, bh + 10, 8); ctx.stroke(); }
  ctx.restore();
  ctx.save(); ctx.translate(pos.x, pos.y); ctx.scale(pulse, pulse);
  if (count === 0) { drawCardBack(ctx, 0, 0, { scale: s, alpha: 0.16 }); }
  else for (let i = layers - 1; i >= 0; i--) drawCardBack(ctx, -i * 2, -i * 2.5, { scale: s });
  ctx.restore();
  // label ribbon across the lower part of the pile
  const fs = 14, ly = Math.min(pos.y + bh / 2 - fs - 6, H - fs - 6);
  ctx.save(); ctx.fillStyle = 'rgba(10,8,8,.82)'; ctx.fillRect(pos.x - bw / 2, ly - 2, bw, fs + 6); ctx.restore();
  app.text(PILE_LABEL[key] || label, pos.x, ly, { size: fs, bold: true, ui: true, align: 'center', color: count ? COL.vellum : 'rgba(232,220,196,.55)', fixed: true });
  // count badge on the top right corner of the pile (inside the registered rect, clear of the screen edge), bumps when cards arrive
  const bx = pos.x + bw / 2 - 1, by = pos.y - bh / 2 + 11, br = 15 + pl * 4;
  ctx.save(); ctx.fillStyle = count ? 'rgba(14,12,10,.95)' : 'rgba(14,12,10,.7)'; ctx.strokeStyle = pl > 0 ? COL.lamp : count ? COL.vellum : 'rgba(232,220,196,.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.restore();
  app.text(String(count), bx, by - 9, { size: 16 + Math.round(pl * 3), bold: true, ui: true, align: 'center', fixed: true, color: count ? '#fff' : 'rgba(232,220,196,.6)' });
  const ry0 = Math.max(pos.y - bh / 2 - 5, L.ORB.y + L.ORB.size / 2 + 1), R = { x: pos.x - bw / 2 - 5, y: ry0, w: bw + 24, h: H - ry0 };
  app.reg('pile_' + key, R.x, R.y, R.w, R.h, {});
  if (app.inRect(R.x, R.y, R.w, R.h)) {
    app.cursor = 'pointer'; queueTip(app, 'pile' + key + count, [[{ title: label, text: `${count} card${count === 1 ? '' : 's'}.\nClick or press Q to view.`, color: COL.vellum, glyph: 'square' }]], R);
    if (onClick && app.clicked(R.x, R.y, R.w, R.h) && !S.modal && !S.ending) onClick();
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
  app.reg('orb', O.x - O.size / 2, O.y - O.size / 2, O.size, O.size, {});
  if (app.inRect(O.x - O.size / 2, O.y - O.size / 2, O.size, O.size)) queueTip(app, 'orb' + S.energy, [[{ title: 'Energy', text: `${S.energy} / ${S.maxEnergy}. Refills each turn.`, color: COL.energy, glyph: 'diamond' }]], { x: O.x - O.size / 2, y: O.y - O.size / 2, w: O.size, h: O.size });
  // strain readout
  const st = c.strain, B = L.STRAIN_BOX;
  const over = st.strain > 0;
  // phones inflate the text: size the two rows from the real line height so Budget and Strain never touch
  const sLh = Math.ceil(app.sz(15, { ui: true, bold: true }) * 1.1), sH = Math.max(B.h, sLh * 2 + 12);
  app.panel(B.x, B.y, B.w, sH, { fill: 'rgba(14,12,10,.8)', stroke: over ? COL.scar : 'rgba(232,220,196,.35)', r: 8 });
  app.reg('strain', B.x, B.y, B.w, sH, {});
  app.text(`Budget ${st.weight}/${st.budget}`, B.x + 10, B.y + 5, { size: 15, ui: true, bold: true, color: COL.vellum });
  app.text(`Strain ${st.strain}`, B.x + 10, B.y + 5 + sLh, { size: 15, ui: true, bold: true, color: over ? COL.bad : COL.good });
  if (app.inRect(B.x, B.y, B.w, sH)) {
    const tithed = []; for (const w of S.known.values()) if (w.tithed) tithed.push(w);
    const lines = [];
    if (!over) lines.push('Within Budget. No card is Tithed.');
    else {
      lines.push(`Weight ${st.weight} over Budget ${st.budget}: ${st.strain} Strain.`);
      lines.push(tithed.length ? 'Tithed (-25% numbers this combat):' : 'No Tithe left in force.');
      for (const w of tithed.slice(0, 8)) lines.push(' - ' + (CARDS[w.inst.id] ? CARDS[w.inst.id].name : w.inst.id));
      if (st.backfire > 0) lines.push(`Backfire ${st.backfire}: grafted cards in your opening hand jam each turn.`);
    }
    queueTip(app, 'strain' + st.strain + ':' + tithed.length, [[{ title: 'Strain', text: lines.join('\n'), color: over ? COL.bad : COL.good, glyph: 'cross' }], [{ title: 'Tithe', text: 'A Bare card taken by Strain. It fights at 75% numbers this combat.', color: '#b3263a', glyph: 'cross' }]], B);
  }

  // end turn
  const E = L.END_BTN;
  const noPlays = idle && !c.over && !c.pending && !c.hand.some((_, i) => canPlay(c, i).ok);
  const can = canAct();
  app.reg('endTurn', E.x, E.y, E.w, E.h, {});
  if (can && noPlays) { ctx.save(); ctx.shadowColor = COL.lamp; ctx.shadowBlur = 16 + Math.sin(S.t * 5) * 8; app.rr(E.x, E.y, E.w, E.h, 10); ctx.strokeStyle = COL.lamp; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
  if (app.button('END TURN', E.x, E.y, E.w, E.h, { size: 22, fill: can && noPlays ? '#6b4a1a' : COL.slab2, disabled: !can }) && can) doEndTurn();
}

function drawCardInfo(app) {
  if (!S.modal && !S.ending && !S.drag && !S.c.pending) {
    const dc = S.hand.find((d) => d.uid === S.hov);
    if (dc && dc.alpha >= 0.8) {
      const spec = dcSpec(dc), l = liveEds();
      const stack = cardTipStack(spec, S.c, { tithed: !!dc.w.tithed, target: l.length === 1 ? l[0].e : null });
      const extra = cardSections(spec, dc.w, dc).filter((x) => /weight|^Price|^Jammed/.test(x.title)).map((x) => ({ title: x.title, text: x.text, color: x.color, glyph: 'hex' }));
      if (extra.length) { if (stack.length < 2) stack.push(extra.slice(0, 3)); else stack[1] = stack[1].concat(extra).slice(0, 4); }
      if (stack.length) {
        const r = dcRect(dc), right = r.x + r.w + 8 + 320 <= L.END_BTN.x - 6;
        // keyword panels live in the hand band (below the Thread rail, beside the lifted card), never over the rail, End Turn or the enemies
        const band = { x: right ? r.x + r.w + 8 : r.x - 8, y: L.SEAM.y + L.SEAM.h + 8, bottom: H - 6, dir: right ? 1 : -1 };
        queueTip(app, 'card:' + dc.uid + ':' + (dc.w.tithed ? 1 : 0), stack, { x: r.x, y: r.y, w: r.w, h: r.h, band });
      }
    }
  }
  drawPopovers(app);
  flushTips(app);
}

// first-run tips: one at a time, only while the player can act, never over a modal
// Tips never cover the hero plate (y 464), the Thread rail (y 468) or the hand: bubbles stop above this line, the arrow reaches down.
const TIP_BOTTOM = L.SEAM.y - 10;
function drawTips(app) {
  if (!S || S.modal || S.ending || S.c.pending || S.banner || !canAct() || S.drag) return;
  const c = S.c, l = liveEds(), first = l[0];
  const has = (k) => app.shared.meta && app.shared.meta.tips && app.shared.meta.tips[k];
  const tip = (k, x, y, o, txt) => maybeTip(app, k, x, y, txt, o);
  if (first && !S.hov) {
    if (tip('energy', L.ORB.x + 40, L.ORB.y - 46, { side: 'above', w: 270, maxBottom: TIP_BOTTOM })) return;
    if (tip('intent', first.x, EF - first.h - 8, { side: 'below', w: 290, maxBottom: TIP_BOTTOM })) return;
    if (S.hand.length && tip('playcard', 500, L.HAND_Y - 120, { side: 'above', w: 430, maxBottom: TIP_BOTTOM }, 'Click a card to select it, then click it again or drag it up to play it. Attacks ask for a target. Keys 1 to 0 also select.')) return;
    if (c.enemies.some((e) => !e.dead && e.move && intentWith(S.edBy.get(e.uid), e.move) && intentWith(S.edBy.get(e.uid), e.move).kinds.includes('attack')) && tip('block', HERO_X + 70, FOOT_Y - 150, { side: 'right', w: 280, maxBottom: TIP_BOTTOM })) return;
    if (tip('endturn', L.END_BTN.x + L.END_BTN.w / 2, L.END_BTN.y, { side: 'above', w: 280, maxBottom: TIP_BOTTOM })) return;
  }
  if (!has('endturn')) return; // later tips wait until the basics are known
  if (seamTip(app, c, L.SEAM)) return;
  const hc = S.hand.find((d) => d.w.tithed);
  if (hc || S.seenTithe.size) { if (tip('strain', L.STRAIN_BOX.x + L.STRAIN_BOX.w - 20, L.STRAIN_BOX.y, { side: 'above', w: 300, maxBottom: TIP_BOTTOM })) return; }
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
    enemyPos: (i) => { const ed = S.edBy.get(S.c.enemies[i].uid); return { x: ed.x, y: EF - ed.h * 0.5 }; },
    endTurn: { x: L.END_BTN.x + L.END_BTN.w / 2, y: L.END_BTN.y + L.END_BTN.h / 2 },
    pending: S.c.pending ? { need: pendingNeed(), pool: pendPool().map((w) => w.uid), confirm: { x: W / 2, y: 666 } } : null,
    queueLen: S.q.length, sel: S.sel, state: () => S,
  };
}

const SCREEN = { enter, leave, update, draw, key, api };
export default SCREEN;
