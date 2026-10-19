// Midnight Mog bot players: the balance instrument. They drive the real sim headless (battle, deck, town, loot,
// progression, profile, offline) through simulated time and report how far each kind of player gets.
//
//   runBot(kind, {seed, hours, ...}) -> {timeline, walls, stats}      kind: 'random' | 'greedy' | 'strong'
//   compareToTargets(results) / formatTable(...)                       economy.TARGETS vs what the bots reached
//
// Deterministic: all randomness comes from rng.js, the clock is a simulated number of seconds. No DOM, no Date.
// The bots never change data files; they only call the sim the same way a player's taps would.
//
// Time model. Default is a realistic casual player: 3 sessions per day of 10 minutes (spread over the waking day),
// offline income between them (offline.applyOffline), the town collected at every visit (storage caps apply).
// Options: {continuous:true} plays without any gap (this is what economy.TARGETS describes), or
// {sessionsPerDay, sessionMinutes} for any other rhythm.

import { makeRng } from '../rng.js';
import * as ECON from '../sim/economy.js';
import * as BATTLE from '../sim/battle.js';
import * as PROG from '../sim/progression.js';
import * as TOWN from '../sim/town.js';
import { openCrate } from '../sim/loot.js';
import { newProfile } from '../sim/profile.js';
import { applyOffline, offlineGain, offlineLimits, touch } from '../sim/offline.js';
import { deckSlots } from '../sim/deck.js';
import { CARD_BY_ID } from '../data/cards.js';
import { CAT_BY_ID } from '../data/cats.js';
import { BUILDING_BY_ID, PRODUCERS } from '../data/buildings.js';
import { ACHIEVEMENT_FAMILIES, NAMED_TIERS, achievementReward, collectionStatus } from '../data/quests.js';

export const BOT_KINDS = ['random', 'greedy', 'strong'];

const DAY_MS = 86400000;
const BASE_MS = 20000 * DAY_MS;          // simulated epoch, day aligned (the sim only needs a consistent clock)
const MENU_SECONDS = 3;                  // time between two battles (tap, result screen)
const ECHO_SECONDS = ECON.NINE_LIVES.echoSeconds;
const DECISION_DT = 1;                   // seconds between bot decisions inside a battle (fast mode, no event handling)
const YARN_IN_FISH = 4;                  // exchange rate used to compare yarn and fish income
const GEM_IN_FISH = 50;
const RARITY_IDX = { common: 0, rare: 1, epic: 2, legend: 3, mythic: 4 };
const RARITY_POWER = { common: 1, rare: 2, epic: 4, legend: 8, mythic: 16 };
const CRATE_SECONDS = 2;                 // opening one crate (reveal can be skipped)
const CRATE_X10_SECONDS = 6;             // the x10 reveal
const CRATE_TIME_SHARE = 0.2;            // a player spends at most this share of the play time in the crate screen
const STALL_SECONDS = 1800;              // a wall is a frontier that did not move for 30 active minutes

const MARKS = [2 / 60, 10 / 60, 0.5, 1];  // hours; then every hour

// ------------------------------------------------------------------------------------------------ small helpers

const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const dayOf = (nowMs) => Math.floor(nowMs / DAY_MS);
const frontierOf = (p) => ECON.globalStage(p.progress.district, p.progress.stage);

function mix(a, b) { return (Math.imul((a >>> 0) ^ 0x9e3779b9, 2654435761) + Math.imul(b | 0, 40503) + 0x7f4a7c15) >>> 0; }

function catScore(id) {
  const c = CAT_BY_ID[id];
  if (!c) return 0;
  const b = c.base;
  let s = Math.sqrt(b.hp * Math.max(1, b.dmg) * b.rate);
  if (b.range >= 4) s *= 1.15;
  if (c.role === 'support') s *= 0.7;
  return s;
}

const cardPrice = (p, id, level, ts) =>
  Math.ceil(ECON.cost('card_level', level, { rarity: CARD_BY_ID[id].rarity }) * (1 - clamp(ts.cardCostDiscount || 0, 0, 0.4)));
const catPrice = (p, id, level, ts) =>
  Math.ceil(ECON.cost('cat_level', level, { rarity: CAT_BY_ID[id].rarity }) * (1 - clamp(ts.catLevelDiscount || 0, 0, 0.4)));

/** Gems of the finite onboarding ladders a player claims once (named achievement tiers, role and rarity collection sets). */
function oneTimeGems(p) {
  let g = 0;
  const ach = (p.quests && p.quests.ach) || {};
  for (const f of ACHIEVEMENT_FAMILIES) for (let i = 0; i < Math.min(ach[f.id] | 0, NAMED_TIERS); i++) g += achievementReward(i).gems;
  for (const e of collectionStatus(p, p.quests)) if (e.claimed && e.group !== 'stars') g += (e.reward && e.reward.gems) || 0;
  return g;
}

// ------------------------------------------------------------------------------------------------ bot state

function makeState(kind, seed, opt) {
  const rng = makeRng(mix(seed, kind === 'random' ? 1 : kind === 'greedy' ? 2 : 3));
  const S = {
    kind, seed, opt, rng, t: 0, activeT: 0, p: newProfile(seed >>> 0, BASE_MS),
    pol: POLICIES[kind],
    gemsSpent: 0, life0Active: 0, crateSeconds: 0, lossStreak: 0, farmLeft: 0, battleNo: 0, spendNo: 0,
    spentFish: { town: 0, crates: 0 },
    timeline: [], nextMark: 0, walls: [], lifeNo: 0,
    stallStartActive: 0, stallGs: 1, peakGs: 1,
    stats: {
      battles: 0, wins: 0, losses: 0, echoClears: 0, crates: 0, resets: 0, sessions: 0, battleSecondsTotal: 0, avgBattleSeconds: 0,
      pulls: { common: 0, rare: 0, epic: 0, legend: 0, mythic: 0 },
      pullKinds: { cat: 0, card: 0, relic: 0, yarn: 0, gems: 0 },
      crateByType: {}, crateYarn: {}, stage30Seconds: [], activeSeconds: 0, bestGs: 1, farmBattles: 0, shardsGained: 0, resetAt: [],
      timeouts: 0, winByGs: {}, lossByGs: {}, catLevelBuys: 0, cardLevelBuys: 0, buildingBuys: 0, plotBuys: 0, metaBuys: 0, questClaims: 0,
    },
  };
  return S;
}

const nowMsOf = (S) => BASE_MS + Math.round(S.t * 1000);

// ------------------------------------------------------------------------------------------------ timeline and walls

function snapshot(S, h, p, extraGain) {
  const f = ECON.globalStage(p.progress.district, p.progress.stage);
  const cur = { fish: p.cur.fish | 0, yarn: p.cur.yarn | 0, gems: p.cur.gems | 0, tokens: p.cur.tokens | 0 };
  if (extraGain) { cur.fish += extraGain.fish | 0; cur.yarn += extraGain.yarn | 0; }
  return { h: +h.toFixed(4), district: p.progress.district, stage: p.progress.stage, gs: f, peak: Math.max(1, S.stats.bestGs - 1), cur };
}

function markHour(S, i) { return i < MARKS.length ? MARKS[i] : MARKS.length > 0 ? 1 + (i - MARKS.length + 1) : 0; }

/** Record every timeline mark whose time has passed. During an offline gap the profile is the one at the end of the last session. */
function recordMarks(S, inGap) {
  for (;;) {
    const h = markHour(S, S.nextMark);
    if (h * 3600 > S.t + 1e-6 || h > S.opt.hours + 1e-9) return;
    let extra = null;
    if (inGap) {
      const at = BASE_MS + Math.round(h * 3600 * 1000);
      extra = offlineGain(S.p, at);
    }
    S.timeline.push(snapshot(S, h, S.p, extra));
    S.nextMark++;
  }
}

function trackStall(S) {
  const f = frontierOf(S.p);
  if (f > S.peakGs) {
    const stalled = S.activeT - S.stallStartActive;
    if (stalled >= STALL_SECONDS) pushWall(S, S.peakGs, stalled);
    S.peakGs = f;
    S.stallStartActive = S.activeT;
  }
  if (f > S.stats.bestGs) S.stats.bestGs = f;
  if (f >= 30 && S.stage30Life !== S.lifeNo) { S.stage30Life = S.lifeNo; S.stats.stage30Seconds.push(Math.round(S.activeT - S.life0Active)); }
}

function pushWall(S, gs, stalledSec) {
  const d = PROG.fromGlobal(gs);
  S.walls.push({ gs, district: d.district, stage: d.stage, stalledMinutes: Math.round(stalledSec / 60), atHour: +(S.t / 3600).toFixed(2), life: S.lifeNo, shards: S.p.nineLives.shards | 0 });
}

function closeWall(S) {
  const stalled = S.activeT - S.stallStartActive;
  if (stalled >= STALL_SECONDS) pushWall(S, S.peakGs, stalled);
}

// ------------------------------------------------------------------------------------------------ battle policies

function aliveFoes(b) {
  const out = [];
  for (const e of b.enemies) if (!e.dead && !e.untargetable) out.push(e);
  return out;
}
function aliveCats(b) {
  const out = [];
  for (const u of b.units) if (u.kind === 'cat' && !u.dead) out.push(u);
  return out;
}
function occupied(b) {
  const occ = new Set();
  for (const u of b.units) {
    if (u.dead) continue;
    if (u.kind === 'cat') occ.add(Math.round(u.home.x) + ',' + Math.round(u.home.y));
    else if (u.kind === 'barricade') occ.add(Math.round(u.x) + ',' + Math.round(u.y));
  }
  return occ;
}
function freeTiles(b, occ, cols) {
  const out = [];
  for (let x = cols[0]; x <= cols[1]; x++) for (let y = 0; y < b.lanes; y++) if (!occ.has(x + ',' + y)) out.push({ x, y });
  return out;
}
function laneThreat(b, foes) {
  const t = new Array(b.lanes).fill(0);
  for (const e of foes) {
    const l = clamp(Math.round(e.y), 0, b.lanes - 1);
    t[l] += (e.boss ? 4 : 1) * (1 + 3 / (1 + Math.max(0, e.x)));
  }
  return t;
}
function nearest(foes) {
  let best = null;
  for (const e of foes) if (!best || e.x < best.x) best = e;
  return best;
}
function cluster(foes, radius) {
  let best = null, n = 0;
  for (const c of foes) {
    let k = 0;
    for (const e of foes) if (Math.abs(e.x - c.x) + Math.abs(e.y - c.y) * 2 <= radius * 1.5) k++;
    if (k > n || (k === n && best && c.x < best.x)) { n = k; best = c; }
  }
  return { center: best, n };
}
const tileOf = (e) => ({ x: clamp(Math.round(e.x), 0, BATTLE.COLS), y: clamp(Math.round(e.y), 0, 4) });
const hasKind = (eff, kind) => eff.kind === kind || (eff.kind === 'multi' && eff.steps.some((s) => s.kind === kind));
const effKinds = (eff) => (eff.kind === 'multi' ? eff.steps.map((s) => s.kind) : [eff.kind]);

/** Random: a random playable card on a random tile now and then. */
function actRandom(b, S) {
  if (!S.rng.chance(0.55)) return;
  const idx = [];
  for (let i = 0; i < b.hand.length; i++) if (BATTLE.canPlay(b, i)) idx.push(i);
  if (!idx.length) return;
  const i = S.rng.pick(idx);
  const card = CARD_BY_ID[b.hand[i]];
  const tgt = card.effect.target;
  let arg;
  if (tgt === 'tile') arg = { x: S.rng.int(card.type === 'summon' ? 1 : 0, BATTLE.COLS), y: S.rng.int(0, b.lanes - 1) };
  else if (tgt === 'lane') arg = S.rng.int(0, b.lanes - 1);
  BATTLE.playCard(b, i, arg);
}

/** Greedy: always spend energy on the most expensive card, summons spread over the front columns, spells at the nearest enemy. */
function actGreedy(b, S) {
  for (let guard = 0; guard < 3; guard++) {
    const foes = aliveFoes(b);
    let bestI = -1, bestC = -1;
    for (let i = 0; i < b.hand.length; i++) {
      if (!BATTLE.canPlay(b, i)) continue;
      const card = CARD_BY_ID[b.hand[i]];
      const tg = card.effect.target;
      if (!foes.length && tg !== 'tile' && tg !== 'none') continue;
      if (!foes.length && card.type !== 'summon' && card.type !== 'build') continue;
      if (card.cost > bestC) { bestC = card.cost; bestI = i; }
    }
    if (bestI < 0) return;
    const card = CARD_BY_ID[b.hand[bestI]];
    const tg = card.effect.target;
    let arg;
    if (tg === 'tile') {
      if (card.type === 'summon') {
        const occ = occupied(b);
        const free = freeTiles(b, occ, [1, 5]);
        if (!free.length) { if (!BATTLE.cycleHand(b)) return; continue; }
        // the lane of the closest enemy, else the lane with the fewest cats; a middle column
        let lane = -1;
        const n0 = nearest(foes);
        if (n0) lane = clamp(Math.round(n0.y), 0, b.lanes - 1);
        else {
          const cnt = new Array(b.lanes).fill(0);
          for (const u of aliveCats(b)) cnt[clamp(Math.round(u.home.y), 0, b.lanes - 1)]++;
          let m = 1e9;
          for (let l = 0; l < b.lanes; l++) if (cnt[l] < m) { m = cnt[l]; lane = l; }
        }
        const inLane = free.filter((t) => t.y === lane);
        const pool = inLane.length ? inLane : free;
        arg = pool.reduce((a, t) => (Math.abs(t.x - 3) < Math.abs(a.x - 3) ? t : a), pool[0]);
      } else {
        const n = nearest(foes);
        arg = n ? tileOf(n) : { x: 3, y: S.rng.int(0, b.lanes - 1) };
      }
    }
    const r = BATTLE.playCard(b, bestI, arg);
    if (!r.ok) return;
  }
}

// ---- strong: a small evaluator over the hand

function chooseStrong(b, S) {
  const foes = aliveFoes(b), cats = aliveCats(b);
  const baseFrac = b.base.hp / b.base.maxHp;
  const threat = laneThreat(b, foes);
  const occ = occupied(b);
  const block = new Array(b.lanes).fill(0), cover = new Array(b.lanes).fill(0);
  for (const u of b.units) {
    if (u.dead) continue;
    if (u.kind === 'barricade') { const y = clamp(Math.round(u.y), 0, b.lanes - 1); block[y]++; cover[y]++; continue; }
    if (u.kind !== 'cat') continue;
    const y = clamp(Math.round(u.home.y), 0, b.lanes - 1);
    const rg = CAT_BY_ID[u.id].base.range >= 2;
    if (!rg) block[y]++;
    cover[y]++;
    if (rg) { if (y > 0) cover[y - 1]++; if (y < b.lanes - 1) cover[y + 1]++; }
  }
  const near = foes.filter((e) => e.x < 5);
  const boss = foes.find((e) => e.boss);
  const fallen = b.fx && b.fx.fallen ? b.fx.fallen.filter((f) => f.dead).length : 0;
  let hurt = 0;
  for (const c of cats) hurt += 1 - c.hp / Math.max(1, c.maxHp);
  const early = b.t < 25;
  // stalemate guard: nothing has died for a while but enemies are still around (a flyer hovering out of range)
  const memo = b.botMemo || (b.botMemo = { kills: -1, t: 0 });
  if (memo.kills !== b.stats.kills) { memo.kills = b.stats.kills; memo.t = b.t; }
  const stalled = foes.length > 0 && b.t - memo.t > 12;
  const stuck = stalled ? foes.reduce((a, e) => (!a || e.x > a.x ? e : a), null) : null;
  let best = null;
  const consider = (i, score, arg) => { if (score > 0 && (!best || score > best.score)) best = { i, score, arg }; };

  let busyLane = 0;
  for (let l = 1; l < b.lanes; l++) if (threat[l] > threat[busyLane]) busyLane = l;
  if (!foes.length) busyLane = 2;

  for (let i = 0; i < b.hand.length; i++) {
    if (!BATTLE.canPlay(b, i)) continue;
    const id = b.hand[i];
    const card = CARD_BY_ID[id];
    const eff = card.effect;
    const cost = card.cost;
    if (card.type === 'summon') {
      const cat = CAT_BY_ID[eff.cat];
      const role = cat.role;
      const ranged = cat.base.range >= 2;
      const want = role === 'tank' ? 4 : role === 'brawler' ? 3 : role === 'trapper' ? 3 : role === 'support' ? 2 : cat.base.range >= 5 ? 1 : 2;
      // merging: place next to an equal cat that is not maxed (the card is consumed and the cat gets a star)
      let mergeTile = null, mergeNeed = 0;
      for (const u of cats) {
        if (u.id !== eff.cat || u.merged >= BATTLE.MAX_MERGE) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = Math.round(u.home.x) + dx, y = Math.round(u.home.y) + dy;
          if (x < 1 || x > BATTLE.COLS || y < 0 || y >= b.lanes || occ.has(x + ',' + y)) continue;
          if (!mergeTile) mergeTile = { x, y };
        }
      }
      let tile = null, tscore = -1e9;
      for (let x = 1; x <= 5; x++) {
        for (let y = 0; y < b.lanes; y++) {
          if (occ.has(x + ',' + y)) continue;
          let sc = 0;
          for (let l = y - (ranged ? 1 : 0); l <= y + (ranged ? 1 : 0); l++) {
            if (l < 0 || l >= b.lanes) continue;
            sc += (1 + threat[l] * 2) / (1 + cover[l]);
          }
          if (!ranged) sc += 1.5 * (1 + threat[y] * 3) / (1 + block[y] * 1.5);
          sc -= Math.abs(x - want) * 0.8;
          if (role === 'support') { let nb = 0; for (const u of cats) if (Math.abs(u.home.x - x) <= 1.5 && Math.abs(u.home.y - y) <= 1) nb++; sc += nb * 0.5; }
          if (sc > tscore) { tscore = sc; tile = { x, y }; }
        }
      }
      // an open lane that enemies are walking down beats everything
      let urgent = 0;
      for (let l = 0; l < b.lanes; l++) if (threat[l] > 0 && block[l] === 0 && cover[l] === 0) urgent = 1;
      if (stuck && ranged) {
        const R = cat.base.range;
        const x = clamp(Math.round(stuck.x - (R - 0.6)), 1, BATTLE.COLS);
        for (const dy of [0, -1, 1]) {
          const y = clamp(Math.round(stuck.y) + dy, 0, b.lanes - 1);
          if (!occ.has(x + ',' + y)) { consider(i, 20, { x, y }); break; }
        }
      }
      if (mergeTile && !urgent) { consider(i, 14 - cost * 0.3, mergeTile); continue; }
      if (!tile) { if (mergeTile) consider(i, 12, mergeTile); continue; }
      let sc = 9 - cost * 0.4 + urgent * 8;
      if (!cats.length) sc += 12;
      else if (cats.length < 3) sc += 4;
      if (cats.length >= 10) sc -= 5;
      consider(i, sc, tile);
      continue;
    }
    const k = effKinds(eff);
    if (id === 'fish_stand') { consider(i, early ? 7 : 0, undefined); continue; }
    if (id === 'yarn_pylon') { consider(i, b.t < 40 ? 6 : 0, undefined); continue; }
    if (id === 'fortified_roof') { consider(i, baseFrac < 0.7 ? 6 : 0, undefined); continue; }
    if (id === 'water_tower_pump') { consider(i, baseFrac < 0.75 ? 5 : 0, undefined); continue; }
    if (id === 'cardboard_fort') { consider(i, foes.length >= 2 ? 3 : 0, { x: 4, y: busyLane }); continue; }
    if (id === 'cat_tree' || id === 'neon_sign' || id === 'rooftop_garden') {
      if (cats.length >= 3 && foes.length) {
        const cc = cluster(cats.map((c) => ({ x: c.home.x, y: c.home.y })), 2.5);
        if (cc.center) consider(i, 3.2 - cost * 0.2, { x: clamp(Math.round(cc.center.x), 0, BATTLE.COLS), y: clamp(Math.round(cc.center.y), 0, b.lanes - 1) });
      }
      continue;
    }
    if (card.type === 'trap') {
      if (foes.length >= 2) consider(i, 3 - cost * 0.2, { x: clamp(Math.round(Math.min(7, (nearest(foes.filter((e) => Math.round(e.y) === busyLane)) || { x: 6 }).x - 1)), 2, 7), y: busyLane });
      continue;
    }
    if (eff.kind === 'energy') { consider(i, b.energy <= 7 ? 3.5 : 0, undefined); continue; }
    if (eff.kind === 'draw') { consider(i, b.energy >= cost + 2 ? 2.2 : 0, undefined); continue; }
    if (eff.kind === 'heal') {
      if (eff.to === 'base') consider(i, baseFrac < 0.6 ? 8 : 0, undefined);
      else consider(i, hurt >= 1.2 ? 4.5 : 0, undefined);
      continue;
    }
    if (eff.kind === 'revive') { consider(i, fallen >= 2 ? 8 : fallen === 1 && cats.length < 3 ? 5 : 0, undefined); continue; }
    if (eff.kind === 'shield') { consider(i, near.length >= 2 && cats.length >= 2 ? 4 : 0, undefined); continue; }
    if (eff.kind === 'buff') { consider(i, foes.length >= 3 && cats.length >= 2 ? 4.2 : 0, undefined); continue; }
    if (eff.kind === 'execute') {
      const tgt = boss || foes.find((e) => e.hp < e.maxHp * 0.25 && e.maxHp > 0) || null;
      if (tgt) consider(i, 5.5, tgt);
      continue;
    }
    if (eff.kind === 'damage' && eff.target === 'enemy') {
      const n = nearest(foes);
      const tgt = stuck || boss || n;
      if (tgt) consider(i, (tgt.x < 4.5 || boss || stuck) ? 5 : 1.5, tgt);
      continue;
    }
    if (eff.kind === 'chain') {
      const n = nearest(foes);
      if (n && foes.length >= 3) consider(i, 4.5, n);
      continue;
    }
    if (eff.kind === 'multi' && eff.target === 'none') {
      // howl / slam style: all enemies
      const stunny = k.includes('stun'), dmg = k.includes('damage');
      if (foes.length >= 4 || (boss && foes.length >= 2)) consider(i, dmg ? 6.5 : stunny ? 5 : 3, undefined);
      continue;
    }
    if (eff.kind === 'damage' && eff.to === 'random') { consider(i, foes.length >= 3 || stalled ? 4.5 : 0, undefined); continue; }
    // tile spells: aoe, dot, stun, debuff, knockback
    if (eff.target === 'tile') {
      const cl = cluster(foes, eff.radius || 2);
      if (cl.center && cl.n >= 3) {
        const urgency = cl.center.x < 5 ? 1.5 : 0;
        const kind = eff.kind;
        const base = kind === 'aoe' ? 5.5 : kind === 'dot' ? 4.2 : kind === 'stun' ? 4.4 : kind === 'knockback' ? 3 : 3.6;
        consider(i, base + cl.n * 0.5 + urgency - cost * 0.15, tileOf(cl.center));
      } else if (cl.center && boss && eff.kind === 'aoe') consider(i, 4, tileOf(boss));
      continue;
    }
  }
  return best;
}

/** Strong saves energy for a big summon (cost 3+) that is within 4 energy of playable, unless something is urgent. */
function savingForBig(b, c) {
  if (b.base.hp < b.base.maxHp * 0.6) return false;
  const card = CARD_BY_ID[b.hand[c.i]];
  if (card.cost >= 3 || (card.type !== 'summon' && c.score >= 5)) return false;
  let wait = false;
  for (let i = 0; i < b.hand.length; i++) {
    const k = CARD_BY_ID[b.hand[i]];
    if (k.type === 'summon' && k.cost >= 3 && k.cost > b.energy && k.cost - b.energy <= 4) wait = true;
  }
  if (!wait) return false;
  let cats = 0;
  for (const u of b.units) if (u.kind === 'cat' && !u.dead) cats++;
  if (cats < 3) return false;
  for (const e of b.enemies) if (!e.dead && e.x < 3) return false;
  return true;
}

function actStrong(b, S) {
  for (let g = 0; g < 4; g++) {
    const c = chooseStrong(b, S);
    if (!c || c.score < 2) return;
    if (savingForBig(b, c)) return;
    const r = BATTLE.playCard(b, c.i, c.arg);
    if (!r.ok) return;
  }
}

// ------------------------------------------------------------------------------------------------ fighting

/** Play one battle at global stage gs with the bot's policy. Returns the finished battle. */
function fight(S, gs) {
  S.battleNo++;
  const seed = mix(S.seed, S.battleNo * 7919 + 13);
  S.lastBattle = { seed, gs, profile: S.p };
  const b = BATTLE.createBattle({ seed, district: null, stage: gs, profile: S.p });
  const act = S.pol.act;
  let guard = 0;
  while (!b.over && guard++ < 4000) {
    act(b, S);
    BATTLE.step(b, DECISION_DT);
    b.events.length = 0;
  }
  return b;
}

// ------------------------------------------------------------------------------------------------ decks

const SPELL_PRIO = [
  'pounce', 'catnip_stash', 'curious_cat', 'hairball_barrage', 'lightning_whisker', 'meteor_of_yarn', 'moonlit_mend', 'catnip_surge',
  'neon_flash', 'cat_nap', 'zoomies', 'fish_stand', 'yarn_pylon', 'scratch_post_slam', 'starfall_purrade', 'midnight_howl', 'final_pounce',
  'second_wind', 'sour_milk', 'shatter_mirror', 'tuna_tripwire', 'neon_mine', 'mouse_trap_mk2', 'bear_trap_bell', 'fortified_roof',
  'water_tower_pump', 'cardboard_fort', 'fur_ball', 'tail_flick', 'laser_pointer_decoy', 'catnip_cloud', 'spiky_scratch_post',
  'black_cat_curse', 'neon_sign', 'rooftop_garden', 'cat_tree',
];

function ownedCards(p) {
  const out = [];
  for (const id of Object.keys(p.cards || {})) {
    const e = p.cards[id];
    const c = CARD_BY_ID[id];
    if (!c || !(e.count > 0)) continue;
    if (c.type === 'summon' && !(p.cats && p.cats[c.effect.cat])) continue;
    out.push({ id, card: c, count: e.count | 0, level: e.level | 0 || 1 });
  }
  return out;
}

function summonValue(p, o) {
  const cat = p.cats[o.card.effect.cat];
  const lm = ECON.levelMult(cat.level) * ECON.starMult(cat.stars);
  return catScore(o.card.effect.cat) * lm;
}

function buildDeckStrong(p) {
  const slots = deckSlots(p);
  const own = ownedCards(p);
  const summons = own.filter((o) => o.card.type === 'summon');
  const nSummon = clamp(Math.round(slots * 0.6), 5, 9);
  const val = (o) => summonValue(p, o) / Math.pow(Math.max(1, o.card.cost), 0.55);
  summons.sort((a, b) => val(b) - val(a) || (a.id < b.id ? -1 : 1));
  const chosen = [];
  const left = (o) => o.count - chosen.filter((x) => x === o.id).length;
  const take = (o) => { if (left(o) > 0 && chosen.length < nSummon) chosen.push(o.id); };
  const roleOf = (o) => CAT_BY_ID[o.card.effect.cat].role;
  for (const want of [['tank'], ['archer', 'mage'], ['brawler', 'trapper'], ['archer', 'mage', 'support']]) {
    const o = summons.find((s) => want.includes(roleOf(s)) && left(s) > 0 && !chosen.includes(s.id));
    if (o) take(o);
  }
  // then best value, duplicates welcome (they merge)
  let again = true;
  while (chosen.length < nSummon && again) {
    again = false;
    for (const o of summons) {
      if (chosen.length >= nSummon) break;
      if (left(o) > 0 && chosen.filter((x) => x === o.id).length < 2) { take(o); again = true; }
    }
  }
  const deck = chosen.slice();
  const spells = new Map(own.filter((o) => o.card.type !== 'summon').map((o) => [o.id, o]));
  for (const id of SPELL_PRIO) {
    if (deck.length >= slots) break;
    const o = spells.get(id);
    if (o && deck.filter((x) => x === id).length < Math.min(o.count, 1)) deck.push(id);
  }
  // fill what is left with more summons, then anything owned
  for (const o of summons) while (deck.length < slots && deck.filter((x) => x === o.id).length < o.count) deck.push(o.id);
  for (const o of own) while (deck.length < slots && deck.filter((x) => x === o.id).length < o.count) deck.push(o.id);
  return deck.slice(0, slots);
}

function buildDeckGreedy(p) {
  const slots = deckSlots(p);
  const own = ownedCards(p);
  const power = (o) => RARITY_POWER[o.card.rarity] * ECON.levelMult(o.level);
  const ranked = own.slice().sort((a, b) => power(b) - power(a) || (a.id < b.id ? -1 : 1));
  const deck = [];
  const add = (o) => { if (deck.length < slots && deck.filter((x) => x === o.id).length < o.count) { deck.push(o.id); return true; } return false; };
  const sm = ranked.filter((o) => o.card.type === 'summon');
  for (const o of sm.slice(0, 4)) add(o);
  for (const o of ranked) add(o);
  return deck;
}

function buildDeckRandom(p, rng) {
  const slots = deckSlots(p);
  const own = ownedCards(p);
  const pool = [];
  for (const o of own) for (let i = 0; i < o.count; i++) pool.push(o.id);
  rng.shuffle(pool);
  const deck = pool.slice(0, slots);
  if (!deck.some((id) => CARD_BY_ID[id].type === 'summon')) {
    const s = pool.find((id) => CARD_BY_ID[id].type === 'summon');
    if (s) deck[0] = s;
  }
  return deck;
}

function refreshDeck(S) {
  const p = S.p;
  const deck = S.kind === 'strong' ? buildDeckStrong(p) : S.kind === 'greedy' ? buildDeckGreedy(p) : buildDeckRandom(p, S.rng);
  if (deck.length >= 5 && deck.join() !== p.deck.join()) S.p = { ...p, deck };
}

// ------------------------------------------------------------------------------------------------ spending

function townStatsOf(S) { return TOWN.townStats(S.p); }

function prodValue(p, wGem) {
  const pr = TOWN.production(p).passive;
  return pr.fish + YARN_IN_FISH * (pr.yarn + pr.xp) + wGem * pr.gems * GEM_IN_FISH / 3600;
}

function setCur(p, patch) { return { ...p, cur: { ...p.cur, ...patch } }; }

function buyCatLevel(S, id, ts) {
  const p = S.p;
  const c = p.cats[id];
  if (!c || c.level >= ECON.maxLevel('cat_level')) return false;
  const price = catPrice(p, id, c.level, ts);
  const xp = Math.floor((p.town && p.town.xp) || 0);
  if (p.cur.yarn + xp < price) return false;
  const pay = TOWN.payWithXp(p, price);
  let q = pay.profile;
  q = setCur(q, { yarn: q.cur.yarn - pay.yarnDue });
  q = { ...q, cats: { ...q.cats, [id]: { ...c, level: c.level + 1 } } };
  q = TOWN.recordStats(q, { catLevelUps: 1 });
  S.p = q; S.stats.catLevelBuys++;
  return true;
}

function buyCardLevel(S, id, ts) {
  const p = S.p;
  const c = p.cards[id];
  if (!c || c.level >= ECON.maxLevel('card_level')) return false;
  const price = cardPrice(p, id, c.level, ts);
  if (p.cur.yarn < price) return false;
  S.p = { ...setCur(p, { yarn: p.cur.yarn - price }), cards: { ...p.cards, [id]: { ...c, level: c.level + 1 } } };
  S.stats.cardLevelBuys++;
  return true;
}

/** Yarn into cats and cards. mode 'strong': the deck's cats only, with a look ahead to the next x2 milestone. */
function spendYarn(S) {
  const kind = S.kind;
  for (let iter = 0; iter < 300; iter++) {
    const p = S.p;
    const ts = townStatsOf(S);
    const xp = Math.floor((p.town && p.town.xp) || 0);
    const budget = p.cur.yarn + xp;
    if (budget < 10) return;
    const deckSet = new Set(p.deck);
    const team = [];
    for (const id of deckSet) { const c = CARD_BY_ID[id]; if (c.type === 'summon') team.push(c.effect.cat); }
    let best = null;
    const consider = (kindName, id, value, price) => { if (value > 0 && price <= budget && (!best || value > best.value)) best = { kindName, id, value, price }; };

    const catIds = kind === 'strong' ? team : Object.keys(p.cats);
    for (const id of catIds) {
      const c = p.cats[id];
      if (!c || c.level >= ECON.maxLevel('cat_level')) continue;
      const sc = catScore(id) * ECON.starMult(c.stars);
      const look = kind === 'strong' ? 6 : 1;
      let total = 0;
      for (let k = 1; k <= look; k++) {
        total += catPrice(p, id, c.level + k - 1, ts);
        const gain = sc * (ECON.levelMult(c.level + k) - ECON.levelMult(c.level));
        // the quarter milestones double a cat: strong sees them coming
        const v = gain / total;
        const first = catPrice(p, id, c.level, ts);
        if (k === 1) consider('cat', id, v * 1, first);
        else if (total <= budget * 1.5 + first) consider('cat', id, v * 1, first);
      }
    }
    const cardIds = kind === 'strong' ? [...deckSet].filter((id) => CARD_BY_ID[id].type !== 'summon') : kind === 'greedy' ? [...deckSet].filter((id) => CARD_BY_ID[id].type !== 'summon') : [];
    for (const id of new Set(cardIds)) {
      const c = p.cards[id];
      if (!c || c.level >= ECON.maxLevel('card_level')) continue;
      const price = cardPrice(p, id, c.level, ts);
      const w = RARITY_POWER[CARD_BY_ID[id].rarity] * 6 + 20;
      const gain = w * (ECON.levelMult(c.level + 1) - ECON.levelMult(c.level)) * (kind === 'strong' ? 0.6 : 0.8);
      consider('card', id, gain / price, price);
    }
    if (!best) return;
    const ok = best.kindName === 'cat' ? buyCatLevel(S, best.id, ts) : buyCardLevel(S, best.id, ts);
    if (!ok) return;
  }
}

function randomYarn(S) {
  const p = S.p;
  for (let iter = 0; iter < 40; iter++) {
    const ts = townStatsOf(S);
    const ids = Object.keys(S.p.cats);
    const id = S.rng.pick(ids);
    if (S.rng.chance(0.25)) {
      const cardIds = Object.keys(S.p.cards).filter((c) => CARD_BY_ID[c].type !== 'summon');
      if (cardIds.length && buyCardLevel(S, S.rng.pick(cardIds), ts)) continue;
    }
    if (!buyCatLevel(S, id, ts)) return;
  }
  return p;
}

// ---- crates

function openOne(S, crateId, useKey, count = 1) {
  const opts = count === 10 ? { count: 10 } : {};
  if (useKey) opts.useKey = true;
  const r = openCrate(S.p, crateId, makeRng(mix(S.seed, 100000 + S.stats.crates * 31 + 7)), opts);
  if (r.error) return false;
  S.p = TOWN.recordStats(r.profile, { cratesOpened: r.count });
  S.stats.crates += r.count;
  const dt = r.count === 10 ? CRATE_X10_SECONDS : CRATE_SECONDS;
  S.t += dt; S.activeT += dt; S.crateSeconds += dt;
  S.stats.crateByType[crateId] = (S.stats.crateByType[crateId] || 0) + r.count;
  for (const d of r.drops) { S.stats.pulls[d.rarity]++; S.stats.pullKinds[d.kind]++; }
  if (r.spent && r.spent.cur === 'fish') S.spentFish.crates += r.spent.amount;
  if (r.spent && r.spent.cur === 'gems') S.gemsSpent += r.spent.amount;
  for (const d of r.drops) S.stats.crateYarn[crateId] = (S.stats.crateYarn[crateId] || 0) + (d.dupeValue || 0) + (d.kind === 'yarn' ? d.amount : 0);
  return true;
}

/** Open as many as affordable, in tens when the pile allows (the x10 button also has the guarantee). */
function openMany(S, crateId, maxOpens) {
  let n = 0;
  while (n < maxOpens) {
    if (S.crateSeconds > CRATE_TIME_SHARE * S.activeT + 60) break;
    const opens = S.p.stats.crateOpens | 0;
    let ten = 0;
    for (let i = 0; i < 10; i++) ten += ECON.crateCost(crateId, opens + i).price;
    const cur = ECON.crateCost(crateId, opens).cur;
    if (maxOpens - n >= 10 && S.p.cur[cur] >= ten) { if (!openOne(S, crateId, false, 10)) break; n += 10; }
    else if (S.p.cur[cur] >= ECON.crateCost(crateId, opens).price) { if (!openOne(S, crateId, false)) break; n++; }
    else break;
  }
  return n;
}

function spendKeys(S) {
  for (let guard = 0; guard < 200; guard++) {
    const keys = (S.p.town && S.p.town.keys) || {};
    const id = Object.keys(keys).sort().find((k) => keys[k] > 0);
    if (!id) return;
    if (!openOne(S, id, true)) return;
  }
}

function cratePrice(S, id) { return ECON.crateCost(id, S.p.stats.crateOpens | 0); }

// ---- town

function plotFree(p) {
  const plots = p.town.plots;
  const out = [];
  for (let i = 0; i < plots.length; i++) if (!plots[i] || !plots[i].b) out.push(i);
  return out;
}

const UTILITY_W = {
  scratching_post: 0.05, nap_dome: 0.035, barracks: 0.06, laser_arcade: 0.06, vet_clinic: 0.04, kitty_bank: 0.02, crate_workshop: 0.05,
  clock_tower: 0.05, shrine_nine_lives: 0.03, observatory: 0.015, radio_tower: 0.04, catnip_garden: 0.05,
};
const BUILD_ORDER = ['tuna_cannery', 'yarn_mill', 'scratching_post', 'crate_workshop', 'barracks', 'smokehouse', 'laser_arcade', 'nap_dome',
  'vet_clinic', 'kitty_bank', 'gem_mine', 'catnip_garden', 'radio_tower', 'clock_tower', 'shrine_nine_lives', 'observatory'];

function bestPlotFor(S, id, smart) {
  const free = plotFree(S.p);
  if (!free.length) return -1;
  if (!smart || free.length === 1) return free[0];
  let best = free[0], bv = -Infinity;
  for (const i of free) {
    const r = TOWN.build(S.p, id, i, nowMsOf(S));
    if (!r.ok) continue;
    const v = prodValue(r.profile, 1) + 0.002 * (TOWN.townStats(r.profile).catLevelDiscount || 0) * 100;
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}

/** Everything fish can buy in the town, scored by payback seconds (lower = better). */
function townMoves(S, smart, cache) {
  const p = S.p;
  const base = Math.max(1e-6, prodValue(p, 1));
  const gs = ECON.bestGlobalStage(p);
  const moves = [];
  const now = nowMsOf(S);
  const wUtil = smart ? 1 : 0.3;
  // upgrades
  p.town.plots.forEach((pl, i) => {
    if (!pl || !pl.b) return;
    const def = BUILDING_BY_ID[pl.b];
    const info = TOWN.upgradeInfo(p, i);
    if (info.maxed || info.fish > p.cur.fish) return;
    const hit = cache && cache.get(i);
    if (hit && hit.level === pl.level && hit.id === pl.b) { if (hit.move) moves.push(hit.move); return; }
    const up = TOWN.upgrade(p, i, now, 1);
    if (!up.ok) return;
    let dV = prodValue(up.profile, 1) - base;
    if (!PRODUCERS.includes(pl.b) || dV <= 0) dV = 0;
    const uw = UTILITY_W[pl.b];
    if (uw) dV += wUtil * uw * base / (1 + pl.level / 8);
    const move = dV > 0 ? { type: 'upgrade', plot: i, id: pl.b, cost: info.fish, payback: info.fish / dV, level: pl.level } : null;
    if (cache) cache.set(i, { level: pl.level, id: pl.b, move });
    if (move) moves.push(move);
  });
  // new buildings
  const free = plotFree(p);
  if (free.length) {
    for (const id of BUILD_ORDER) {
      const def = BUILDING_BY_ID[id];
      const chk = TOWN.canBuild(p, id, free[0]);
      if (!chk.ok) continue;
      const w = PRODUCERS.includes(id) ? 1 : (UTILITY_W[id] || 0.02) * wUtil * 4;
      moves.push({ type: 'build', id, cost: chk.cost.fish, payback: chk.cost.fish / (base * w * 0.5 + 0.01) / 6 });
    }
  }
  // plots
  const pu = TOWN.plotUnlockInfo(p);
  const wantsMore = !free.length && BUILD_ORDER.some((id) => BUILDING_BY_ID[id].unlockStage <= gs && p.town.plots.filter((x) => x && x.b === id).length < BUILDING_BY_ID[id].limit);
  if (pu.ok && (wantsMore || (smart && pu.fish < p.cur.fish * 0.4 && !free.length))) moves.push({ type: 'plot', cost: pu.fish, payback: 900 });
  return moves;
}

function doTownMove(S, mv, smart, cache) {
  const now = nowMsOf(S);
  let r;
  if (mv.type === 'upgrade') r = TOWN.upgrade(S.p, mv.plot, now, 1);
  else if (mv.type === 'build') {
    const i = bestPlotFor(S, mv.id, smart);
    if (i < 0) return false;
    r = TOWN.build(S.p, mv.id, i, now);
  } else r = TOWN.unlockPlot(S.p, now);
  if (!r.ok) return false;
  S.p = r.profile;
  S.spentFish.town += mv.cost;
  if (cache) { if (mv.type === 'upgrade') cache.delete(mv.plot); else cache.clear(); }
  if (mv.type === 'build') S.gemsSpent += (BUILDING_BY_ID[mv.id].buildExtra && BUILDING_BY_ID[mv.id].buildExtra.gems) || 0;
  if (mv.type === 'upgrade') S.stats.buildingBuys++; else if (mv.type === 'build') S.stats.buildingBuys++; else S.stats.plotBuys++;
  return true;
}

function spendFishSmart(S, policy) {
  const smart = policy === 'strong';
  const cache = new Map();
  for (let iter = 0; iter < 80; iter++) {
    const p = S.p;
    const gs = ECON.bestGlobalStage(p);
    // crates keep a share of the fish: alley early, neon once the player has a feel for the game
    const share = smart ? 0.55 : 0.3;
    const wantCrate = S.spentFish.crates < share * S.spentFish.town + (smart ? 450 : 0);
    let crate = null;
    if (smart) {
      const neon = cratePrice(S, 'neon_crate'), alley = cratePrice(S, 'alley_crate');
      if (gs >= 10 && p.cur.fish >= neon.price) crate = 'neon_crate';
      else if (p.cur.fish >= alley.price && (gs < 10 || p.cur.fish < neon.price * 0.7)) crate = 'alley_crate';
    } else {
      const neon = cratePrice(S, 'neon_crate'), alley = cratePrice(S, 'alley_crate');
      if (gs >= 14 && p.cur.fish >= neon.price * 2) crate = 'neon_crate';
      else if (p.cur.fish >= alley.price * 2) crate = 'alley_crate';
    }
    if (crate && wantCrate) {
      const deficit = share * S.spentFish.town + (smart ? 450 : 0) - S.spentFish.crates;
      const n = clamp(Math.ceil(deficit / cratePrice(S, crate).price), 1, 30);
      if (openMany(S, crate, n) > 0) continue;
    }
    const moves = townMoves(S, smart, cache).filter((m) => m.cost <= p.cur.fish);
    moves.sort((a, b) => a.payback - b.payback);
    const mv = moves[0];
    if (mv && (smart || mv.payback < 12 * 3600 || !crate)) {
      if (doTownMove(S, mv, smart, cache)) continue;
    }
    if (crate && openMany(S, crate, 1) > 0) continue;
    return;
  }
}

function randomFish(S) {
  for (let iter = 0; iter < 12; iter++) {
    const p = S.p;
    const r = S.rng.next();
    if (r < 0.3) {
      const id = S.rng.pick(['alley_crate', 'neon_crate']);
      if (!openOne(S, id, false)) { /* cannot pay */ }
    } else {
      const moves = townMoves(S, false).filter((m) => m.cost <= p.cur.fish);
      if (!moves.length) continue;
      doTownMove(S, S.rng.pick(moves), false);
    }
  }
}

function spendGems(S, smart) {
  for (let iter = 0; iter < 30; iter++) {
    const p = S.p;
    // building gem needs first (shrine 100, observatory 50, mine 25)
    let reserve = 0;
    if (smart) {
      const gs = ECON.bestGlobalStage(p);
      const built = new Set(p.town.plots.filter((x) => x && x.b).map((x) => x.b));
      for (const id of ['gem_mine', 'shrine_nine_lives', 'observatory']) {
        const def = BUILDING_BY_ID[id];
        if (!built.has(id) && gs >= def.unlockStage - 3) reserve = Math.max(reserve, def.buildExtra && def.buildExtra.gems ? def.buildExtra.gems : 0);
      }
    }
    const price = cratePrice(S, 'midnight_crate').price;
    if (p.cur.gems - reserve >= price && S.rng) { if (!openOne(S, 'midnight_crate', false)) return; } else return;
  }
}

const META_WEIGHT = { start_fish: 1, offline_cap: 1, offline_eff: 1, crate_luck: 1.2 };
function spendTokens(S, smart) {
  for (let iter = 0; iter < 40; iter++) {
    const p = S.p;
    let best = null;
    for (const id of Object.keys(META_WEIGHT)) {
      const lvl = ECON.metaLevel(p, id);
      const price = ECON.metaCost(id, lvl);
      if (!(price <= p.cur.tokens)) continue;
      const v = (smart ? META_WEIGHT[id] : 1) / price;
      if (!best || v > best.v) best = { id, price, v };
    }
    if (!best) return;
    S.p = { ...setCur(p, { tokens: p.cur.tokens - best.price }), meta: { ...p.meta, [best.id]: ECON.metaLevel(p, best.id) + 1 } };
    S.stats.metaBuys++;
  }
}

function claimAll(S, full) {
  if (S.opt.claims === false) return;
  const now = nowMsOf(S), day = dayOf(now);
  let p = TOWN.refresh(S.p, day);
  const v = TOWN.claimVisitor(p, now, day);
  if (v.ok) p = v.profile;
  for (const kind of ['daily', 'weekly']) {
    const block = p.quests && p.quests[kind];
    if (!block) continue;
    block.quests.forEach((q, i) => {
      const r = TOWN.claimQuest(p, kind, i, day);
      if (r.ok) { p = r.profile; S.stats.questClaims++; }
    });
    const bn = TOWN.claimBonus(p, kind, day);
    if (bn.ok) { p = bn.profile; S.stats.questClaims++; }
  }
  if (full) {
    const a = TOWN.claimAllAchievements(p);
    p = a.profile; S.stats.questClaims += a.claimed.length;
    for (const e of TOWN.collection(p)) {
      if (e.done && !e.claimed) { const r = TOWN.claimCollection(p, e.id); if (r.ok) { p = r.profile; S.stats.questClaims++; } }
    }
  }
  S.p = p;
}

function collectTown(S) {
  const now = nowMsOf(S);
  const r = TOWN.collect(S.p, now, dayOf(now));
  if (r.ok) S.p = r.profile;
}

function spendAll(S) {
  S.spendNo++;
  collectTown(S);
  if (S.kind === 'random') {
    if (S.spendNo % 3 !== 0) return;
    randomFish(S);
    randomYarn(S);
    spendKeys(S);
    if (S.rng.chance(0.3)) openOne(S, 'midnight_crate', false);
    spendTokens(S, false);
    return;
  }
  const smart = S.kind === 'strong';
  if (S.spendNo % 4 === 1 || smart) claimAll(S, smart);
  spendKeys(S);
  spendFishSmart(S, S.kind);
  spendGems(S, smart);
  spendTokens(S, smart);
  spendYarn(S);
  refreshDeck(S);
}

// ------------------------------------------------------------------------------------------------ Nine Lives

function maybeReset(S) {
  const p = S.p;
  if (!ECON.canNineLives(p)) return false;
  const pre = PROG.nineLivesPreview(p);
  if (!pre.allowed || pre.shards < 1) return false;
  pre.prevBest = (p.progress && p.progress.prevBest) | 0;
  const stall = S.activeT - S.stallStartActive;
  const have = (p.nineLives.shards | 0);
  let go = false;
  if (S.kind === 'strong') {
    // reset when the run has stopped moving, has recovered to its previous best, and the shards buy a visible jump
    const recovered = !pre.prevBest || pre.best >= S.pol.resetRecover * pre.prevBest;
    const gain = ECON.nineLivesMult(have + pre.shards).damage / ECON.nineLivesMult(have).damage;
    go = stall >= S.pol.resetStall && recovered && gain >= S.pol.resetGain;
  }
  else if (S.kind === 'greedy') go = stall >= S.pol.resetStall && pre.shards >= 1;
  else go = S.rng.chance(0.0025);
  if (!go) return false;
  closeWall(S);
  const r = PROG.nineLivesReset(p);
  if (!r.ok) return false;
  S.p = r.profile;
  S.stats.resets++; S.stats.shardsGained += r.shards; S.stats.resetAt.push({ h: +(S.t / 3600).toFixed(2), activeH: +(S.activeT / 3600).toFixed(2), best: pre.best, shards: r.shards });
  S.lifeNo++;
  S.lossStreak = 0; S.farmLeft = 0;
  S.peakGs = frontierOf(S.p); S.stallStartActive = S.activeT; S.life0Active = S.activeT;
  spendTokens(S, S.kind === 'strong');
  return true;
}

// ------------------------------------------------------------------------------------------------ the loop

const POLICIES = {
  random: { act: actRandom, farmAfter: 99, farmBack: 0, resetStall: Infinity },
  greedy: { act: actGreedy, farmAfter: 6, farmBack: 2, farmN: 2, resetStall: 40 * 60 },
  strong: { act: actStrong, farmAfter: 2, farmBack: 2, farmN: 3, resetStall: 12 * 60, resetRecover: 0.95, resetGain: 1.03 },
};

/** One step of the session: an echo clear, a farm battle or a frontier attempt. Advances the clock. */
function playOne(S) {
  const p = S.p;
  const gs = frontierOf(p);
  if (PROG.isEchoStage(p, gs)) {
    const r = PROG.echoClear(p, 1);
    if (r.cleared > 0) {
      S.p = r.profile;
      S.t += ECHO_SECONDS; S.activeT += ECHO_SECONDS;
      S.stats.echoClears++;
      trackStall(S);
      return;
    }
  }
  let target = gs;
  let farming = false;
  if (S.pol.farmAfter < 99 && S.lossStreak >= S.pol.farmAfter) {
    if (S.farmLeft <= 0) S.farmLeft = S.pol.farmN;
    farming = true;
    target = Math.max(1, gs - S.pol.farmBack);
    if (--S.farmLeft <= 0) { S.lossStreak = Math.max(0, S.pol.farmAfter - 1); }
  }
  const b = fight(S, target);
  const res = BATTLE.battleResult(b);
  const secs = Math.max(1, b.t);
  S.t += secs + MENU_SECONDS; S.activeT += secs + MENU_SECONDS;
  S.stats.battles++; S.stats.battleSecondsTotal += secs;
  S.last = { gs: target, won: res.won, wave: res.wave, waves: res.waves, secs: Math.round(secs), baseHp: Math.round(b.base.hp), cards: res.stats && res.stats.cardsPlayed, farming };
  { const m = res.won ? S.stats.winByGs : S.stats.lossByGs; m[target] = (m[target] || 0) + 1; }
  if (farming) S.stats.farmBattles++;
  if (!res.won && secs >= BATTLE.MAX_SECONDS - 1) S.stats.timeouts++;
  if (res.won) {
    S.stats.wins++;
    S.p = res.profile;
    if (!farming) S.lossStreak = 0;
  } else {
    S.stats.losses++;
    if (!farming) S.lossStreak++;
  }
  trackStall(S);
}

function sessionStarts(opt, hours) {
  const out = [];
  if (opt.continuous) return [{ start: 0, end: hours * 3600 }];
  if (opt.schedule) return opt.schedule.map((x) => ({ start: x.startHour * 3600, end: Math.min(hours * 3600, (x.startHour * 60 + x.minutes) * 60) })).filter((x) => x.start < hours * 3600).sort((a, b) => a.start - b.start);
  const n = Math.max(1, opt.sessionsPerDay | 0);
  const len = opt.sessionMinutes * 60;
  const days = Math.ceil(hours / 24) + 1;
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < n; i++) {
      let h = n === 1 ? 12 : 8 + (i * 14) / n;
      if (d === 0 && i === 0) h = 0;
      const start = d * 86400 + h * 3600;
      if (start >= hours * 3600) continue;
      out.push({ start, end: Math.min(hours * 3600, start + len) });
    }
  }
  return out;
}

/**
 * Simulate a player for `hours` of simulated time.
 * opts: {seed (default 1), hours (default 24), continuous (no gaps), sessionsPerDay (3), sessionMinutes (10),
 *   schedule:[{startHour, minutes}] (explicit sessions, overrides the two above), claims:false (never claim quests), trace(state) (debug hook)}
 * Returns {kind, seed, hours, timeline:[{h, district, stage, gs, peak, cur}], walls:[{gs, district, stage, stalledMinutes, atHour, life, shards}],
 *   stats:{battles, wins, losses, echoClears, crates, pulls:{rarity: n}, resets, avgBattleSeconds, ...}, profile}
 */
export function runBot(kind, opts = {}) {
  if (!POLICIES[kind]) throw new Error('runBot: unknown kind ' + kind);
  const opt = {
    seed: (opts.seed ?? 1) >>> 0, hours: opts.hours ?? 24, continuous: !!opts.continuous,
    sessionsPerDay: opts.sessionsPerDay ?? 3, sessionMinutes: opts.sessionMinutes ?? 10, claims: opts.claims, schedule: opts.schedule || null,
  };
  const S = makeState(kind, opt.seed, opt);
  const endT = opt.hours * 3600;
  const sessions = sessionStarts(opt, opt.hours);
  let lastRound = -1e9;

  for (const ses of sessions) {
    // the gap before this session
    if (ses.start > S.t) {
      S.t = ses.start;
      recordMarks(S, true);
    }
    S.stats.sessions++;
    const nowStart = nowMsOf(S);
    if (!opt.continuous) {
      S.p = applyOffline(S.p, nowStart).profile;
    }
    if (kind !== 'random' || S.rng.chance(0.7)) { claimAll(S, kind === 'strong'); }
    spendAll(S);
    if (kind === 'random' && S.stats.sessions % 4 === 1) refreshDeck(S); else if (kind !== 'random') refreshDeck(S);
    const sessionEnd = opt.continuous ? endT : ses.end;
    lastRound = S.t;
    while (S.t < sessionEnd - 1e-6 && S.t < endT) {
      const before = S.t;
      playOne(S);
      recordMarks(S, false);
      if (S.t - lastRound >= (opt.continuous ? 120 : 45)) { spendAll(S); lastRound = S.t; }
      maybeReset(S);
      if (opts.trace) opts.trace(S);
      if (S.t - before <= 0) S.t += 1;
    }
    collectTown(S);
    S.p = touch(S.p, nowMsOf(S));
    S.t = Math.max(S.t, Math.min(sessionEnd, endT));
    recordMarks(S, false);
  }
  S.t = endT;
  recordMarks(S, true);
  closeWall(S);
  const st = S.stats;
  st.activeSeconds = Math.round(S.activeT);
  st.avgBattleSeconds = st.battles ? +(st.battleSecondsTotal / st.battles).toFixed(1) : 0;
  st.shards = S.p.nineLives.shards | 0;
  st.bestGs = Math.max(st.bestGs, ECON.bestGlobalStage(S.p));
  st.catsOwned = Object.keys(S.p.cats).length;
  st.relics = Object.keys(S.p.relics || {}).length;
  st.townLevels = S.p.town.plots.reduce((a, x) => a + (x && x.b ? x.level : 0), 0);
  st.finalGs = frontierOf(S.p);
  const ah = Math.max(1e-9, S.activeT / 3600);
  st.gemsPerActiveHour = +(((S.p.cur.gems | 0) - 10 + S.gemsSpent) / ah).toFixed(2);
  st.gemsOneTime = oneTimeGems(S.p);
  st.gemsPerActiveHourOngoing = +(Math.max(0, (S.p.cur.gems | 0) - 10 + S.gemsSpent - st.gemsOneTime) / ah).toFixed(2);
  const lim = offlineLimits(S.p);
  st.offlineCapHours = +(lim.capSeconds / 3600).toFixed(1);
  st.offlineEfficiency = +lim.efficiency.toFixed(2);
  st.firstResetActiveHours = st.resetAt.length ? st.resetAt[0].activeH : null;
  st.nineLivesSpeedup = st.stage30Seconds.length >= 2 && st.stage30Seconds[st.stage30Seconds.length - 1] > 0 ? +(st.stage30Seconds[0] / st.stage30Seconds[st.stage30Seconds.length - 1]).toFixed(2) : null;
  return { kind, seed: opt.seed, hours: opt.hours, continuous: opt.continuous, timeline: S.timeline, walls: S.walls, stats: st, profile: S.p };
}

// ------------------------------------------------------------------------------------------------ targets

/** Global stage reached by a result at `seconds` (the last timeline mark at or before it; the lifetime peak so far). */
export function stageAt(result, seconds) {
  const h = seconds / 3600;
  let best = null;
  for (const m of result.timeline) if (m.h <= h + 1e-4) best = m;
  return best ? Math.max(best.gs, best.peak || 0) : 1;
}

/**
 * Compare bot results with economy.TARGETS.sessions. results: {random?, greedy?, strong?} -> one run each (continuous play is
 * the fair comparison: TARGETS describe a player with no idle gaps). Returns rows
 * {id, seconds, band, note, got:{kind: gs}, verdict:{kind: 'below'|'ok'|'above'}}.
 */
export function compareToTargets(results) {
  const rows = [];
  for (const t of ECON.TARGETS.sessions) {
    const row = { id: t.id, seconds: t.seconds, band: t.stage, note: t.note, got: {}, verdict: {} };
    for (const k of Object.keys(results)) {
      const r = results[k];
      if (!r || r.hours * 3600 + 1e-6 < t.seconds) continue;
      const gs = stageAt(r, t.seconds);
      row.got[k] = gs;
      row.verdict[k] = gs < t.stage[0] ? 'below' : gs > t.stage[1] ? 'above' : 'ok';
    }
    rows.push(row);
  }
  return rows;
}

const verdictOf = (v, band) => (v == null ? 'n/a' : v < band[0] ? 'below' : v > band[1] ? 'above' : 'ok');

/**
 * The non-session targets, measured on the strong bot (continuous play, 24h or more for the resets): run wall, first reset time,
 * Nine Lives speedup, offline cap and efficiency, gems per active hour, crate dismantle return.
 * Returns [{id, band, got, verdict, note}].
 */
export function compareOther(strong) {
  const T = ECON.TARGETS, st = strong.stats;
  const rows = [];
  const add = (id, band, got, note) => rows.push({ id, band, got, verdict: verdictOf(got, band), note });
  const firstReset = st.resetAt.length ? st.resetAt[0] : null;
  add('runWallStage', T.runWallStage, firstReset ? firstReset.best : st.bestGs, 'best stage of the first life, when the strong bot resets (or its peak)');
  add('firstResetActiveHours', T.firstResetActiveHours, st.firstResetActiveHours, 'active hours before the first Nine Lives');
  add('nineLivesSpeedup', T.nineLivesSpeedup, st.nineLivesSpeedup, 'first life time to stage 30 over the last life');
  add('offlineCapHours', T.offlineCapHours, st.offlineCapHours, 'end of run, with the Nap Dome the bot built');
  add('offlineEfficiency', T.offlineEfficiency, st.offlineEfficiency, 'end of run');
  add('gemsPerActiveHour', T.gemsPerActiveHour, st.gemsPerActiveHourOngoing, 'earned (current + spent) per active hour, without the one-time achievement tiers and collection sets (' + st.gemsOneTime + ' gems)');
  let worst = 0, worstId = null;
  for (const id of Object.keys(st.crateByType)) {
    const n = st.crateByType[id];
    // yarn back and price are compared in fish equivalents (yarn x4, gems x50): a gem crate pays gems, the yarn comes back as yarn
    const c = ECON.crateCost(id, 0);
    const priceFish = c.price * (c.cur === 'yarn' ? YARN_IN_FISH : c.cur === 'gems' ? GEM_IN_FISH : 1);
    const ret = n > 0 ? ((st.crateYarn[id] || 0) / n) * YARN_IN_FISH / priceFish : 0;
    if (ret > worst) { worst = ret; worstId = id; }
  }
  rows.push({ id: 'crateReturn', band: [0, T.crateReturnMax], got: +worst.toFixed(3), verdict: worst <= T.crateReturnMax ? 'ok' : 'above', note: 'measured dupe and yarn drops per crate over base price, in fish equivalents (' + worstId + ')' });
  return rows;
}

export function formatTable(rows, kinds = BOT_KINDS) {
  const pad = (s, n) => String(s).padEnd(n);
  const lines = [];
  lines.push(pad('target', 8) + pad('band', 12) + kinds.map((k) => pad(k, 16)).join(''));
  for (const r of rows) {
    lines.push(pad(r.id, 8) + pad(r.band[0] + '-' + r.band[1], 12) + kinds.map((k) => pad(r.got[k] == null ? '-' : r.got[k] + ' ' + r.verdict[k], 16)).join(''));
  }
  return lines.join('\n');
}

/**
 * Run the three bots with continuous play (fair against TARGETS), print the table and the places where the bots disagree
 * with TARGETS. Used by `node js/bots/bots.js [hours] [seed]`. Returns {results, rows, other, disagreements}.
 */
export function report(hours = 24, seed = 1, log = console.log) {
  const results = {};
  for (const k of BOT_KINDS) results[k] = runBot(k, { seed, hours, continuous: true });
  const noClaims = runBot('strong', { seed, hours, continuous: true, claims: false });
  const rows = compareToTargets(results);
  const nc = compareToTargets({ strong: noClaims });
  rows.forEach((r, i) => { r.got.strong_noclaims = nc[i].got.strong; r.verdict.strong_noclaims = nc[i].verdict.strong; });
  log(formatTable(rows, [...BOT_KINDS, 'strong_noclaims']));
  const other = compareOther(results.strong);
  log('');
  for (const o of other) log(String(o.id).padEnd(24) + (o.band[0] + '-' + o.band[1]).padEnd(10) + String(o.got).padEnd(10) + o.verdict.padEnd(7) + o.note);
  const disagreements = [];
  for (const r of rows) for (const k of ['strong', 'greedy', 'random']) if (r.verdict[k] && r.verdict[k] !== 'ok' && k === 'strong') disagreements.push(k + ' at ' + r.id + ': ' + r.got[k] + ' is ' + r.verdict[k] + ' ' + r.band.join('-'));
  for (const o of other) if (o.verdict !== 'ok' && o.verdict !== 'n/a') disagreements.push(o.id + ': ' + o.got + ' is ' + o.verdict + ' ' + o.band.join('-'));
  log('');
  for (const k of BOT_KINDS) {
    const s = results[k].stats;
    log(k + ': battles ' + s.battles + ', wins ' + s.wins + ', echo ' + s.echoClears + ', crates ' + s.crates + ', resets ' + s.resets + ', peak ' + s.bestGs + ', avg battle ' + s.avgBattleSeconds + 's, walls ' + results[k].walls.length + ', pulls ' + JSON.stringify(s.pulls));
  }
  return { results, rows, other, disagreements };
}

/** Battle policies, exported for tools and tests: BOT_POLICIES[kind].act(battle, state). */
export const BOT_POLICIES = POLICIES;

/** Deck builders, exported for tools and tests: (profile) -> card id list. */
export const BOT_DECKS = { strong: buildDeckStrong, greedy: buildDeckGreedy, random: (p) => buildDeckRandom(p, makeRng(1)) };

if (typeof process !== 'undefined' && process.argv && process.argv[1] && import.meta.url === 'file://' + process.argv[1]) {
  report(Number(process.argv[2]) || 24, Number(process.argv[3]) || 1);
}
