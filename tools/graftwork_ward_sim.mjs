// Ward mode bots for GRAFTWORK (design/WARD.md): a heuristic builder + walker on top of the strong fight policy, and a random policy.
//   node tools/graftwork_ward_sim.mjs [runsPerHero=20] [ascension=0] [strong|careful|sloppy|random|passive|fill|all|both]
//   GW_UNLOCK=start|all (default all) picks the card pool. passive = never builds, hides in the Entrance; fill = builds well but only walks to non-fight rooms until a Ward is full.
// Prints win rate, act reached, and per-act averages of normal fights, monsters fought, elites, events, shops, forges, rests.
import * as RUN from '../graftwork/engine/run.js';
import * as W from '../graftwork/engine/ward.js';
import { canGraft, strainInfo, schoolsOf, cardSpec } from '../graftwork/engine/cards.js';
import { HEROES, RELICS, GRAFTS, CARDS } from '../graftwork/data/index.js';
import { hashSeed } from '../graftwork/engine/rng.js';
import { POLICIES, graftScore, fight, chooseGraft, eventScore, pickEventCard, doShop, doForge } from './graftwork_sim.mjs';
import { tierFight } from './graftwork_tiers.mjs';
import './graftwork_strong.mjs';
import { UNLOCKS } from '../graftwork/data/unlocks.js';
import { WARD_TUNE, PHASES, ROOMS, FLOOR } from '../graftwork/data/ward.js';
// GW_TUNE='{"tune":{"waitHeal":6},"phases":{"night":{"enemyStr":0}},"rooms":{"rm_linen":{"heal":0.3}}}' patches the data in memory for what-if runs (nothing is written)
if (process.env.GW_TUNE) { const t = JSON.parse(process.env.GW_TUNE); Object.assign(WARD_TUNE, t.tune || {}); for (const [k, v] of Object.entries(t.phases || {})) Object.assign(PHASES[k], v); for (const [k, v] of Object.entries(t.rooms || {})) Object.assign(ROOMS[k], v); for (const [k, v] of Object.entries(t.floor || {})) Object.assign(FLOOR[k], v); }

function mkRng(seed) { let s = hashSeed(seed) >>> 0 || 1; const next = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return { next, int: (n) => Math.floor(next() * n), pick: (a) => a[Math.floor(next() * a.length)] }; }
const count = (run, type) => Object.values(run.ward.rooms).filter((r) => r.type === type).length;
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

// ---------------- strong builder ----------------
const WANT = { rm_sawmill: 2, rm_quarry: 2, rm_ward: 3, rm_isolation: 2, rm_chapel: 1, rm_dispensary: 1, rm_workshop: 1, rm_linen: 1, rm_counting: 1, rm_generator: 3, rm_pharmacy: 1, rm_library: 1, rm_morgue: 1, rm_kitchen: 1, rm_boiler: 1, rm_laundry: 1, rm_isolation2: 1 };
// is there a chain of rooms from the hero to the Theatre (a road for the early boss)?
function theatreLinked(run) {
  const w = run.ward, th = W.theatreOf(run), seen = new Set([w.hero.room]), q = [w.hero.room];
  while (q.length) { const id = q.shift(); if (id === th.id) return true; for (const n of W.neighbors(run, id)) if (!seen.has(n)) { seen.add(n); q.push(n); } }
  return false;
}
function roomPriority(run, type) {
  const w = run.ward, have = count(run, type), pw = W.wardPower(run), need = W.ROOMS[type].power;
  if (type === 'rm_corridor') return EARLY_ON && !theatreLinked(run) ? 6.5 : w.day >= w.dayLimit - 4 && w.res.wood >= 2 ? 5 : w.res.wood >= 3 ? 1 : 0.2; // late in the floor: a road to the Theatre, for the early boss
  if (type === 'rm_generator') return pw.free < 1 ? 9 : pw.free < 2 ? 3 : 0;
  if (have >= (WANT[type] || 1)) return 0;
  if (need && pw.free < need) return 0.5; // would be built dark
  const base = { rm_sawmill: 8, rm_quarry: 8, rm_ward: 7, rm_isolation: have === 0 ? 9.5 : 6, rm_chapel: 4, rm_dispensary: 5, rm_workshop: 6, rm_linen: 5, rm_counting: 3, rm_pharmacy: 3.5, rm_library: 4.5, rm_morgue: 3, rm_kitchen: 3, rm_boiler: Object.values(w.rooms).filter((r) => r.type === 'rm_ward').length >= 2 ? 4 : 0, rm_laundry: run.deck.some((x) => x.id.startsWith('j_')) ? 3 : 0, rm_isolation2: have === 0 && w.day >= 2 ? 6.5 : 0 }[type] || 2;
  return base - have * 2;
}
function bestCell(run, type) {
  const w = run.ward, cells = W.buildCells(run);
  if (!cells.length) return null;
  const th = W.theatreOf(run), hero = w.rooms[w.hero.room], ent = W.entranceOf(run);
  const score = (c) => {
    if (type === 'rm_corridor') return -dist(c, [th.x, th.y]) * 2 - dist(c, [hero.x, hero.y]) * 0.3;
    const spawner = !!(W.ROOMS[type].spawn);
    // spawners close to the hero's usual haunts, producers out of the way
    return spawner ? -dist(c, [ent.x, ent.y]) * 0.6 - dist(c, [hero.x, hero.y]) * 0.6 : -Math.abs(c[1] - ent.y) * 0.2 - (EARLY_ON ? dist(c, [th.x, th.y]) * ROAD_W : 0);
  };
  return cells.slice().sort((a, b) => score(b) - score(a))[0];
}
const EXPAND_W = { rm_ward: 4.2, rm_workshop: 3.2, rm_chapel: 3, rm_library: 2.8, rm_kitchen: 2.4 }; // how much the strong bot wants each Expand (GW_EXPAND=0 never expands)
const EXPAND_OFF = process.env.GW_EXPAND === '0';
function strongMorning(run) {
  const w = run.ward;
  for (let g = 0; g < 20; g++) {
    const opts = [];
    for (const inst of w.deck.hand) {
      const card = W.BUILD_CARDS[inst.id];
      if (card.kind === 'room') {
        const p = roomPriority(run, card.room); if (p <= 0) continue;
        const cell = bestCell(run, card.room); if (!cell) continue;
        opts.push({ p, uid: inst.uid, target: { x: cell[0], y: cell[1] } });
      } else if (card.kind === 'expand') {
        // Expand (design/WARD.md "Room sizes and Expand"): a bigger Ward holds 7 and stays on the same timer; the other rooms get quicker or richer. A powered room needs 1 more power.
        const pw = W.wardPower(run);
        for (const r of Object.values(w.rooms)) {
          const want = EXPAND_W[r.type]; if (!want || EXPAND_OFF) continue;
          const ex = W.expandOptions(run, r.id); if (!ex.ok) continue;
          if (W.ROOMS[r.type].power && pw.free < 1) continue;
          const c = ex.cost; if (w.res.wood - (c.wood || 0) < 1 || w.res.stone - (c.stone || 0) < 1 || run.gold - (c.gold || 0) < 40) continue;
          opts.push({ p: want - (r.type === 'rm_ward' ? count(run, 'rm_ward') * 0.3 : 0), uid: inst.uid, target: r.id });
        }
      } else if (card.kind === 'upgrade') {
        const rooms = Object.values(w.rooms).filter((r) => card.on.includes(r.type));
        const want = { b_reinforced_beds: 4, b_overtime: 3, b_scrub_in: 3, b_sterile_field: 2, b_iron_doors: 0.5, b_night_shift: 0, b_double_doors: 0.4, b_soundproofing: 1.5, b_fire_door: 0 }[card.id] || 0;
        for (const r of rooms) if (want > 0) opts.push({ p: want, uid: inst.uid, target: r.id });
      } else {
        const hpF = run.hp / run.maxHp;
        const wardsFull = Object.values(w.rooms).some((r) => r.type === 'rm_ward' && r.contents.length >= 4);
        const v = { move: 6, rations: 2.5, lamp: Object.values(w.rooms).some((r) => !r.on && W.ROOMS[r.type].power) ? 3 : 0, heal: hpF < 0.85 ? 5 : 0, res: 5, bribe: 0, tick: 2, demolish: 0, flood: w.day >= 2 ? 2 : 0, otpay: run.gold < 150 ? 3 : 0, nurse: hpF < 0.75 ? 3 : 0, quarantine: 0, fumigate: wardsFull ? 3.5 : 0, power: W.wardPower(run).free < 1 ? 3 : 0, linens: Object.values(w.rooms).some((r) => r.type === 'rm_linen' && r.timers.spawn > 1 && !r.contents.length) && hpF < 0.8 ? 3 : 0, shift: 2, ledger: 3.5 }[card.effect] || 0;
        if (v <= 0) continue;
        let target = null;
        if (card.effect === 'res') target = w.res.wood <= w.res.stone ? 'wood' : 'stone';
        if (card.effect === 'fumigate') { const r = Object.values(w.rooms).filter((x) => x.type === 'rm_ward').sort((a, b) => b.contents.length - a.contents.length)[0]; if (!r || r.contents.length < 4) continue; target = r.id; }
        if (card.effect === 'tick') { const r = Object.values(w.rooms).find((x) => x.type === 'rm_ward' && x.on) || Object.values(w.rooms).find((x) => W.everyOf(x) && x.on); if (!r) continue; target = r.id; }
        opts.push({ p: v, uid: inst.uid, target });
      }
    }
    opts.sort((a, b) => b.p - a.p);
    let played = false;
    for (const o of opts) { if (W.playBuildCard(run, o.uid, o.target).ok) { played = true; break; } }
    if (!played) break;
  }
  // light every room we can, most useful first
  for (const r of Object.values(w.rooms)) if (!r.on && W.ROOMS[r.type].power) W.togglePower(run, r.id);
  W.endMorning(run);
}

// ---------------- strong walker ----------------
// Early boss rule: once the Theatre is open (last 2 days) a healthy bot takes the boss at x0.85 HP instead of waiting for the night boss
// (the idle boss grows, the floor keeps spawning, and the early kill pays gold, a building card and a graft). It walks toward the Theatre
// while healthy and enters it when the route reaches it with at least EARLY_HP of its HP left after the route's fights.
const ROAD_W = +(process.env.GW_ROAD ?? 0.6), EARLY_HP = +(process.env.GW_EARLY_HP ?? 0.65), EARLY_ON = (process.env.GW_EARLY ?? '1') !== '0';
function walkScore(run, pv) {
  const w = run.ward, hpF = run.hp / run.maxHp, ph = w.phase, act = run.act;
  let s = 0, fights = 0, monsters = 0;
  const per = 3.5 + act * 0.5; // expected HP per monster for the strong bot, roughly
  let hp = run.hp;
  for (const t of pv.triggers) {
    if (t.bribed) continue;
    if (t.kind === 'fight') {
      fights++; monsters += t.detail.count;
      const cost = t.detail.count * per * (ph === 'night' ? 1.35 : 1);
      s += 5 + t.detail.count * 1.5 - cost * (hp / run.maxHp < 0.5 ? 1.6 : 0.5);
      hp -= cost;
    } else if (t.kind === 'elite') {
      const lvl = t.detail.level, night = ph === 'night';
      const cost = 18 + act * 4 + (lvl >= 2 ? 10 : 0) + (night ? 6 : 0);
      s += hp - cost > run.maxHp * 0.35 ? 14 : -30;
      hp -= cost;
    } else if (t.kind === 'event') s += ph === 'midday' ? 7 : 5;
    else if (t.kind === 'shop') s += run.gold >= 120 ? 8 : run.gold >= 60 ? 3 : 0.5;
    else if (t.kind === 'forge') s += hpF < 0.7 ? 11 : 6;
    else if (t.kind === 'rest') s += (1 - hpF) * 22;
    else if (t.kind === 'boss') s += t.detail.early ? (hpF >= EARLY_HP && hp >= run.maxHp * EARLY_HP ? 30 : -40) : 100;
  }
  if (fights > 2) s -= (fights - 2) * 4;
  if (hp < run.maxHp * 0.25) s -= 25;
  s -= pv.offPenalty * 0.6;
  if (pv.wait) s += 1;
  if (EARLY_ON && W.bossOpen(run) && hpF >= EARLY_HP && !pv.triggers.some((t) => t.kind === 'boss') && pv.path && pv.path.length) {
    const th = W.theatreOf(run), end = w.rooms[pv.path[pv.path.length - 1]];
    if (end) s += Math.max(0, 8 - dist([end.x, end.y], [th.x, th.y])) * 1.2;
  }
  return s;
}
// dice routes: a walk is at most the roll N rooms. pathR is pathTo cut to the roll (the policies score what a route of N steps would trigger),
// startR plans exactly that route step by step (extendRoute) and walks it (startRoute). Waiting and the forced last night use startWalk.
function pathR(run, rid, alt = 0) {
  const p = W.pathTo(run, rid, alt);
  if (!p.ok || p.wait || p.forced || process.env.GW_OLDWALK) return p; // GW_OLDWALK=1: the pre-dice walker (shortest path within MOVE 4), for comparison
  const n = W.rollOf(run).n, cut = (path) => path.slice(0, n), info = (path) => W.routeInfo(run, cut(path));
  const main = info(p.path);
  return { ...p, path: main.path, triggers: main.triggers, offPenalty: main.offPenalty, cost: main.path.length, alts: p.alts.map((a) => { const i = info(a.path); return { path: i.path, triggers: i.triggers, offPenalty: i.offPenalty }; }), cut: p.path.length > n };
}
function startR(run, rid, alt = 0) {
  const p = pathR(run, rid, alt);
  if (!p.ok) return W.startWalk(run, rid, alt);
  if (p.wait || p.forced || process.env.GW_OLDWALK) return W.startWalk(run, rid, alt);
  W.clearRoute(run);
  for (const r of p.path) if (!W.extendRoute(run, r).ok) break;
  return W.startRoute(run);
}
function forcedBoss(run) { return W.bossForced(run) ? W.startWalk(run, W.theatreOf(run).id) : undefined; }
function hideWalk(run) { const f = forcedBoss(run); return f !== undefined ? f : W.startWalk(run, run.ward.hero.room); }
// SLOPPY: plays one or two random cards, ignores power (rooms may stay dark), walks to the nearest room that holds anything, else the nearest room
function sloppyMorning(run, R) {
  const w = run.ward;
  for (let g = 0; g < 2 && w.deck.hand.length; g++) {
    const inst = R.pick(w.deck.hand), card = W.BUILD_CARDS[inst.id];
    let target = null;
    if (card.target === 'cell') { const cells = W.buildCells(run); if (!cells.length) continue; const c = R.pick(cells); target = { x: c[0], y: c[1] }; }
    else if (card.target === 'room') target = R.pick(Object.keys(w.rooms));
    else if (card.target === 'res') target = R.pick(['wood', 'stone']);
    W.playBuildCard(run, inst.uid, target);
  }
  W.endMorning(run);
}
function nearestWalk(run, R) {
  const f = forcedBoss(run); if (f !== undefined) return f;
  const w = run.ward;
  const cand = Object.keys(w.rooms).map((rid) => ({ rid, p: pathR(run, rid) })).filter((x) => x.p.ok && !x.p.wait);
  const live = cand.filter((x) => x.p.triggers.length && x.p.triggers.every((t) => t.kind !== 'boss'));
  const pool = (live.length ? live : cand).sort((a, b) => a.p.cost - b.p.cost);
  return startR(run, pool.length ? pool[0].rid : w.hero.room);
}
function strongWalk(run, R, avoid = false) {
  const w = run.ward;
  if (avoid) { avoid = !Object.values(w.rooms).some((r) => r.type === 'rm_ward' && r.contents.length >= 5); }
  let best = null, bs = -1e9;
  for (const rid of Object.keys(w.rooms)) {
    const p = pathR(run, rid); if (!p.ok) continue;
    const variants = [{ ...p, alt: 0 }, ...p.alts.map((a, i) => ({ ...a, alt: i + 1, wait: p.wait }))];
    for (const v of variants) { let s = walkScore(run, v) + R.next() * 0.3; if (avoid && v.triggers.some((t) => !t.bribed && (t.kind === 'fight' || t.kind === 'elite' || (t.kind === 'boss' && t.detail.early)))) s -= 1000; if (s > bs) { bs = s; best = [rid, v.alt]; } }
  }
  return startR(run, best[0], best[1]);
}

// ---------------- random policy ----------------
function randomMorning(run, R) {
  const w = run.ward;
  for (let g = 0; g < 10 && w.deck.hand.length && R.next() < 0.8; g++) {
    const inst = R.pick(w.deck.hand), card = W.BUILD_CARDS[inst.id];
    let target = null;
    if (card.target === 'cell' || card.effect === 'demolish' && R.next() < 0.3) { const cells = W.buildCells(run); if (!cells.length) continue; const c = R.pick(cells); target = { x: c[0], y: c[1] }; }
    else if (card.target === 'room') target = R.pick(Object.keys(w.rooms));
    else if (card.target === 'res') target = R.pick(['wood', 'stone']);
    W.playBuildCard(run, inst.uid, target);
  }
  if (R.next() < 0.2) W.togglePower(run, R.pick(Object.keys(w.rooms)));
  W.endMorning(run);
}
function randomWalk(run, R) {
  const w = run.ward;
  const ok = Object.keys(w.rooms).filter((rid) => pathR(run, rid).ok);
  return startR(run, R.pick(ok));
}

// GW_UNLOCK=start+card,graft opens the start pool plus every locked item of those kinds (card graft relic potion event build): ablations of the all pool
function unlockOpt(v) {
  if (!v.startsWith('start+')) return v;
  const kinds = v.slice(6).split(',');
  // a kind may be narrowed: graft:safe | graft:ember (tier or school), card:marrow (hero)
  const ok = (e) => kinds.some((k) => { const [kd, sub] = k.split(':'); if (kd !== e.kind) return false; if (!sub) return true; const it = (e.kind === 'graft' ? GRAFTS : e.kind === 'card' ? CARDS : RELICS)[e.itemId] || {}; return [it.tier, it.school, it.hero, it.rarity].includes(sub); });
  return Object.values(UNLOCKS).filter((e) => e.tier === 'locked' && ok(e)).map((e) => e.id);
}
// ---------------- ward graft pick ----------------
// The classic strong pick credits every custom-hook (weird) graft a flat rarity bonus because fxValue cannot see inside hooks; in the Ward
// that over-rewards weird grafts that cost more than they pay. GRAFT_ADJ is a per-graft correction measured from the sims (see WARD.md section 11).
const WEIRD_CREDIT = { common: 2, uncommon: 3.5, rare: 5 };
export const GRAFT_ADJ = {};
const WEIRD_K = +(process.env.GW_WEIRD_K ?? 0.5);
function wardPickGraft(run, pol) {
  const offer = run.pending.offer;
  const focus = {};
  for (const inst of run.deck) for (const s of schoolsOf(cardSpec(inst))) focus[s] = (focus[s] || 0) + 1;
  const top = Object.entries(focus).sort((a, b) => b[1] - a[1])[0];
  let best = null, bs = -1e9;
  for (const uid of offer.cards) {
    const inst = RUN.findInst(run, uid);
    for (const gid of offer.grafts) {
      if (!canGraft(inst, gid)) continue;
      const r = graftScore(run, inst, gid, pol);
      if (r.strain > pol.maxStrain) continue;
      const g = GRAFTS[gid];
      let s = r.s;
      if (g.mods.some((m) => m.k === 'custom')) s -= (1 - WEIRD_K) * (WEIRD_CREDIT[g.rarity] || 2);
      s += GRAFT_ADJ[gid] || 0;
      if (top && g.school === top[0]) s += 1.5; else if (top && (focus[g.school] || 0) >= 2) s += 0.7;
      if (inst.grafts.length === 2 && r.strain === 0 && !run.flags.gwOverloaded && (hashSeed(run.seed + ':over') % 1000) / 1000 < 0.35) s += 3.5;
      if (s > bs) { bs = s; best = [uid, gid]; }
    }
  }
  const pick = best && bs >= 1.5 ? best : null;
  if (pick && RUN.findInst(run, pick[0]).grafts.length === 2) run.flags.gwOverloaded = true;
  return pick;
}

// ---------------- the run ----------------
export function playWardRun(heroId, seed, policy = 'strong', asc = 0, o = {}) {
  const pol = policy === 'careful' ? POLICIES.careful : process.env.GW_OLDPICK ? POLICIES.strong : { ...POLICIES.strong, pickGraft: wardPickGraft }, rnd = policy === 'random' || policy === 'sloppy', R = mkRng(`ward:${policy}:${seed}`);
  const morningFn = { random: randomMorning, sloppy: sloppyMorning, passive: (r) => W.endMorning(r) }[policy] || strongMorning;
  const walkFn = { random: randomWalk, sloppy: nearestWalk, passive: hideWalk, fill: (r, Rn) => strongWalk(r, Rn, true) }[policy] || strongWalk;
  const run = RUN.newRun({ hero: heroId, seed, ascension: asc, mode: 'ward', assist: o.assist, unlocked: o.unlocked || unlockOpt(process.env.GW_UNLOCK || 'all') });
  const acts = { 1: blank(), 2: blank(), 3: blank() };
  const log = { fights: [], events: 0, shops: 0, acts };
  let guard = 0;
  while (guard++ < 3000 && run.phase !== 'dead' && run.phase !== 'won') {
    const A = acts[run.act];
    switch (run.phase) {
      case 'ward': {
        if (run.ward.phase === 'morning') { morningFn(run, R); if (o.onMorning) o.onMorning(run); break; }
        A.walks++;
        const r = walkFn(run, R);
        if (r === false) throw new Error('illegal walk ' + run.ward.why);
        break;
      }
      case 'combat': {
        const p = run.pending, kind = p.fightKind, hp0 = run.hp;
        const res = rnd ? tierFight(run, policy, R) : (pol.fight || fight)(run, pol).res;
        log.fights.push({ act: run.act, kind, win: res.win, hp0, hp: run.hp, count: (p.ward && p.ward.count) || p.enemies.length });
        if (kind === 'normal') { A.fights++; A.monsters += (p.ward && p.ward.count) || p.enemies.length; }
        if (kind === 'elite') A.elites++;
        if (kind === 'boss') A.boss = (p.ward && p.ward.early) ? 'early' : 'night';
        RUN.resolveFight(run, res); break;
      }
      case 'reward': {
        const rw = run.pending; RUN.claimGold(run, rw);
        if (rw.relic && (!rnd || R.next() < 0.5)) RUN.addRelic(run, rw.relic);
        if (rw.relicChoices && rw.relicChoices.length) RUN.addRelic(run, rnd ? R.pick(rw.relicChoices) : pickRelicWard(pol, rw.relicChoices));
        if (rw.potion && (!rnd || R.next() < 0.5)) RUN.addPotion(run, rw.potion);
        if (rw.buildChoice) W.takeBuildChoice(run, rnd ? (R.next() < 0.7 ? R.pick(rw.buildChoice) : null) : pickBuild(run, rw.buildChoice));
        RUN.afterReward(run); break;
      }
      case 'graft': {
        let pick = null;
        if (rnd) { const offer = run.pending.offer; if (R.next() < 0.7 && offer.cards.length) { const uid = R.pick(offer.cards), gid = R.pick(offer.grafts); if (canGraft(RUN.findInst(run, uid), gid)) pick = [uid, gid]; } }
        else pick = chooseGraft(run, pol);
        if (pick) RUN.applyGraft(run, pick[0], pick[1]);
        else RUN.skipGraft(run, rnd ? R.pick(['heal', 'budget', 'gold']) : (run.hp / run.maxHp < 0.7 ? 'heal' : 'budget'));
        RUN.afterGraft(run); break;
      }
      case 'shop': {
        A.shops++;
        const shop = run.pending;
        if (rnd) {
          for (let k = 0; k < 4; k++) {
            const opts = [];
            for (const kd of ['relic', 'card', 'potion', 'build']) (shop[kd + 's'] || []).forEach((r, i) => { if (!r.sold && run.gold >= r.price) opts.push([kd, i]); });
            if (!opts.length || R.next() < 0.3) break;
            const [kd, i] = R.pick(opts); RUN.shopBuy(run, kd, i);
          }
          RUN.advance(run);
        } else {
          const want = shop.builds.map((b, i) => ({ b, i, v: buildValue(run, b.id) })).filter((x) => x.v >= 5 && run.gold >= x.b.price + 60).sort((a, b) => b.v - a.v)[0];
          if (want) RUN.shopBuy(run, 'build', want.i);
          doShop(run, pol, log);
        }
        break;
      }
      case 'forge': {
        A.forges++;
        if (rnd) { const ch = R.pick(['rest', 'expand', 'refine']); if (ch === 'refine') { const ups = run.deck.filter((x) => !x.up); if (ups.length) RUN.forgeAct(run, 'refine', R.pick(ups).uid); } else RUN.forgeAct(run, ch); RUN.advance(run); }
        else doForge(run, pol);
        break;
      }
      case 'event': {
        A.events++;
        const ch = RUN.eventChoices(run).filter((x) => x.ok && (!x.pick || x.cards.length));
        const best = rnd ? R.pick(ch) : ch.slice().sort((a, b) => eventScore(run, b) - eventScore(run, a))[0];
        let uid; if (best.pick === 'card') uid = rnd ? R.pick(best.cards) : pickEventCard(run, best, best.cards);
        RUN.eventChoose(run, best.i, uid); RUN.afterEvent(run); break;
      }
      default: throw new Error('stuck in phase ' + run.phase);
    }
  }
  if (run.phase !== 'dead' && run.phase !== 'won') throw new Error('ward run did not finish: ' + run.phase);
  const rests = run.ward ? run.ward.log.length : 0;
  return { outcome: run.phase, act: run.act, day: run.ward ? run.ward.day : 0, hp: run.hp, floors: log.fights.length, log, run, rests };
}
// the strong bot's boss ranking knows only the classic relics (an unknown id sorts first): Ward relics go after the ranked ones, and only
// the two that change a whole fight (Dinner Gong, Moon Lamp, High Sun Tonic) are taken over an unranked classic relic
function pickRelicWard(pol, ids) {
  const classic = ids.filter((id) => !RELICS[id].ward), ward = ids.filter((id) => RELICS[id].ward);
  if (classic.length) return pol.pickRelic ? pol.pickRelic(classic) : classic[0];
  return ward[0];
}
function blank() { return { walks: 0, fights: 0, monsters: 0, elites: 0, events: 0, shops: 0, forges: 0, boss: null }; }
function buildValue(run, id) {
  const c = W.BUILD_CARDS[id];
  if (c.kind === 'room') return roomPriority(run, c.room);
  return { b_reinforced_beds: 6, b_morning_rounds: 5, b_requisition: 4, b_rations: 3, b_overtime: 3, b_scrub_in: 3, b_triage: 2 }[id] || 1;
}
function pickBuild(run, ids) { return ids.slice().sort((a, b) => buildValue(run, b) - buildValue(run, a))[0]; }

export function wardTable(policy, N, asc = 0, heroes = Object.keys(HEROES)) {
  const rows = [];
  for (const h of heroes) {
    const rs = []; for (let i = 0; i < N; i++) rs.push(playWardRun(h, `ward-${policy}-${h}-${i}`, policy, asc));
    rows.push({ hero: h, rs });
  }
  return rows;
}
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function describe(policy, rows) {
  const out = [];
  for (const { hero, rs } of rows) {
    const wins = rs.filter((r) => r.outcome === 'won').length;
    const died = [0, 0, 0]; rs.forEach((r) => { if (r.outcome === 'dead') died[r.act - 1]++; });
    const per = [1, 2, 3].map((a) => { const reached = rs.filter((r) => r.outcome === 'won' || r.act > a); const A = reached.map((r) => r.log.acts[a]); return A.length ? `A${a} f${avg(A.map((x) => x.fights)).toFixed(1)} m${avg(A.map((x) => x.monsters)).toFixed(1)} e${avg(A.map((x) => x.elites)).toFixed(1)} ev${avg(A.map((x) => x.events)).toFixed(1)} sh${avg(A.map((x) => x.shops)).toFixed(1)} fo${avg(A.map((x) => x.forges)).toFixed(1)} early${A.filter((x) => x.boss === 'early').length}/${A.length}` : `A${a} -`; });
    out.push(`${policy.padEnd(6)} ${hero.padEnd(7)} win ${wins}/${rs.length} (${(100 * wins / rs.length).toFixed(0)}%)  died act1/2/3 ${died.join('/')}  ${per.join('  ')}`);
  }
  return out.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('graftwork_ward_sim.mjs')) {
  const N = +process.argv[2] || 20, asc = +process.argv[3] || 0, which = process.argv[4] || 'both';
  for (const p of which === 'both' ? ['random', 'strong'] : which === 'all' ? ['random', 'sloppy', 'passive', 'fill', 'careful', 'strong'] : [which]) console.log(describe(p, wardTable(p, N, asc)));
}
