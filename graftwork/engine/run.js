// Run layer: a run is plain JSON (plus run.rng). Everything between fights lives here: rewards, the graft offer (the heart of
// the game), shop, forge, events, ascension, daily seed, endless loops, save/restore. Where the hero goes between them is the
// Ward (engine/ward.js): every run is a Ward run, the node map it replaced is retired (design/CLEANUP_PLAN.md).
import { CARDS, GRAFTS, ENEMIES, RELICS, POTIONS, EVENTS, HEROES } from '../data/index.js';
import { makeRng, hashSeed } from './rng.js';
import { applyAssist } from './assist.js';
import { DAILY_MODS } from '../data/dailymods.js';
import { runAllows, snapshotFor } from './unlock.js';
import { addBuildCard, wardInit, wardRewards, wardShopExtend, wardShopBuy, wardAdvance, afterTrigger as wardAfterTrigger } from './ward.js';
import { newInst, cardSpec, canGraft, strainInfo, budgetOf, relicMod, previewGraft, MAX_GRAFTS, canTemper, temper, isPriceMod } from './cards.js';

export const POTION_SLOTS = 3;
export const SKIP_HEAL = 8;
export const GOLD_FIGHT = { 1: 18, 2: 24, 3: 30 };
export const GOLD_ELITE = { 1: 40, 2: 50, 3: 60 };
export const GOLD_BOSS = { 1: 80, 2: 100, 3: 0 };
export const PRICE_MULT = { 1: 1, 2: 1.2, 3: 1.4 };

export const ASCENSION_TEXT = [
  'Base game.',
  'One extra elite on every map.',
  'Enemies have 10% more HP.',
  'Start with a Clot in your deck.',
  'Resting at the Forge heals 25% instead of 30%.',
  'Shop prices are 15% higher.',
  'Budget is 1 lower.',
  'Bosses have 20% more HP, elites hit 15% harder.',
  'Shatter chance is 10% higher. No graft rerolls.',
  'Only 2 potion slots and 10% less max HP.',
  'All enemies hit 10% harder.',
];
export { DAILY_MODS }; // data/dailymods.js: 12 modifiers with an up and a down side

// ---------- new run ----------
export function newRun(opts = {}) {
  const hero = HEROES[opts.hero || 'marrow'];
  const seedStr = opts.seed !== undefined ? String(opts.seed) : String(Date.now());
  const rng = makeRng(seedStr);
  const perks = hero.perks || {};
  const asc = opts.ascension || 0;
  let uid = 1;
  const snap = snapshotFor(opts.daily ? 'start' : opts.unlocked); // content gating: undefined = everything (tools, old tests)
  const run = {
    v: 1, seed: seedStr, hero: hero.id, ascension: asc, daily: opts.daily || null, loop: 0,
    rng, uidNext: 1,
    act: 1, row: -1, node: null, map: null, phase: 'ward', // row, node, map: fields of the retired node map, always -1 / null / null; they stay so a save keeps the shape it has always had
    hp: perks.hp || 70, maxHp: perks.hp || 70, gold: perks.gold || 99,
    deck: hero.deck.map((id) => newInst(id, () => uid++)),
    relics: [], potions: [], budgetBonus: 0, flags: {}, stats: { fights: 0, elites: 0, grafts: 0, shatters: 0, goldEarned: 0, damageTaken: 0, skips: 0, floors: 0, bosses: 0 },
    ...(snap ? { unlockedAtStart: snap } : {}),
    seenEvents: [], rerolls: 0, shopUses: { remove: 0, strip: 0 }, pending: null,
  };
  run.mode = 'ward'; // the only mode there is. The field stays in the save: it tells a Ward run from a run on the retired map (engine/save.js isRetiredRun)
  run.uidNext = uid;
  if (asc >= 9) { run.maxHp = Math.round(run.maxHp * 0.9); run.hp = run.maxHp; }
  if (asc >= 3) run.deck.push(newInst('j_clot', () => run.uidNext++));
  if (hero.id === 'marrow') addRelic(run, 'r_marrow_kit');
  if (hero.id === 'wick') addRelic(run, 'r_wick_kit');
  if (hero.id === 'odile') addRelic(run, 'r_odile_kit');
  if (opts.startRelic && !opts.daily) addRelic(run, opts.startRelic); // bought in the Records tab (meta2 START_RELICS)
  if (run.daily) { run.dailyMod = DAILY_MODS[hashSeed(run.daily) % DAILY_MODS.length]; run.budgetBonus += run.dailyMod.budget || 0; }
  run.budgetBonus += -(asc >= 6 ? 1 : 0);
  if (opts.assist && !opts.daily) applyAssist(run, opts.assist); // Assist mode (engine/assist.js); daily cases never take it
  if (!opts.bare) startAct(run, 1); // bare: no floor is laid out (a practice fight, engine/meta2.js newPracticeRun)
  return run;
}
export function nextUid(run) { return run.uidNext++; }

export function dailySeed(date = new Date()) { return 'daily-' + date.toISOString().slice(0, 10); }
export function dailyHero(seed) { const ids = Object.keys(HEROES); return ids[hashSeed(seed) % ids.length]; }

// ---------- relics / potions ----------
export function addRelic(run, id) {
  if (!RELICS[id] || run.relics.includes(id)) return false;
  run.relics.push(id);
  const r = RELICS[id];
  if (r.pickup) r.pickup(run);
  return true;
}
export function perk(run, name) { return run.relics.some((rid) => RELICS[rid] && RELICS[rid].perk === name); }
export function perkN(run, name) { let v = 0; for (const rid of run.relics) { const r = RELICS[rid]; if (r && r.perk === name) v += r.n || 1; } return v; }
export function potionSlots(run) { return POTION_SLOTS - (run.ascension >= 9 ? 1 : 0) + relicMod(run, 'potionSlots'); }
export function addPotion(run, id) {
  if (!POTIONS[id] || run.potions.length >= potionSlots(run)) return false;
  run.potions.push(id); return true;
}
function relicPool(run, rarities) {
  return Object.values(RELICS).filter((r) => rarities.includes(r.rarity) && !run.relics.includes(r.id) && runAllows(run, r.id) && (!r.hero || r.hero === run.hero));
}
export function rollRelic(run, rarity) {
  const order = { common: ['common'], uncommon: ['uncommon'], rare: ['rare'], boss: ['boss'], shop: ['shop', 'uncommon'] };
  let pool = relicPool(run, order[rarity] || ['common']);
  if (!pool.length) pool = relicPool(run, ['common', 'uncommon', 'rare']);
  return pool.length ? run.rng.pick(pool).id : null;
}
export function rollRelicByAct(run) {
  const r = run.rng.next();
  const rarity = run.act === 1 ? (r < 0.6 ? 'common' : r < 0.95 ? 'uncommon' : 'rare') : run.act === 2 ? (r < 0.35 ? 'common' : r < 0.85 ? 'uncommon' : 'rare') : (r < 0.2 ? 'common' : r < 0.65 ? 'uncommon' : 'rare');
  return rollRelic(run, rarity);
}
export function rollPotion(run) {
  let list = Object.values(POTIONS).filter((p) => runAllows(run, p.id));
  if (!list.length) list = Object.values(POTIONS);
  const w = { common: 6, uncommon: 3, rare: 1 };
  return run.rng.weighted(list, (p) => w[p.rarity] || 1).id;
}

// ---------- floors ----------
// A new floor: act N of the hospital. engine/ward.js lays it out and opens its first morning (run.phase = 'ward').
export function startAct(run, act) { run.act = act; wardInit(run, act); }

// ---------- encounters ----------
function actEnemies(run, kind) {
  return Object.values(ENEMIES).filter((e) => e.act === run.act && e.kind === kind && !e.minion && !e.summonOnly);
}
export function makeEncounter(run, kind) {
  const rng = run.rng;
  if (kind === 'final') return ['the_grafter'];
  if (kind === 'boss') { const b = actEnemies(run, 'boss').filter((e) => !e.final); return [rng.pick(b).id]; }
  if (kind === 'elite') { const e = actEnemies(run, 'elite'); return [rng.pick(e).id]; }
  const pool = actEnemies(run, 'normal');
  const avg = (e) => (Array.isArray(e.hp) ? (e.hp[0] + e.hp[1]) / 2 : e.hp);
  const scale = { 1: 1, 2: 1.4, 3: 2.0 }[run.act];
  const budget = 36 * scale; // a small fight, one or two monsters (the Ward names its own monsters; this is the combat screen's fallback)
  const out = [];
  let spent = 0, tries = 0;
  while (tries++ < 12) {
    const e = rng.pick(pool);
    if (out.length && (spent + avg(e) > budget || out.length >= 3)) continue;
    out.push(e.id); spent += avg(e);
    if (spent >= budget * 0.85 || out.length >= 3) break;
    if (out.length >= 2) break;
  }
  if (!out.length) out.push(rng.pick(pool).id);
  return out;
}
export function startFight(run, kind) {
  run.phase = 'combat';
  run.pending = { kind: 'combat', fightKind: kind, enemies: makeEncounter(run, kind) };
  return run.pending;
}

// ---------- rewards ----------
export function fightRewards(run, kind, result) {
  const prevPending = run.pending; // the room and the hour's modifiers of the fight that just ended ride on it
  const act = run.act;
  const rng = run.rng;
  const gm = (run.dailyMod && run.dailyMod.goldMul) || 1;
  let gold = kind === 'elite' ? GOLD_ELITE[act] : kind === 'boss' ? GOLD_BOSS[act] : kind === 'final' ? 0 : GOLD_FIGHT[act];
  gold = Math.round(gold * (0.9 + rng.next() * 0.2) * gm * (1 + run.loop * 0.1) * (1 + perkN(run, 'goldBonus') / 100)) + relicMod(run, 'gold');
  const rw = { kind, gold, graft: true, relic: null, relicChoices: null, potion: null };
  if (kind === 'elite') rw.relic = rollRelicByAct(run);
  if (kind === 'boss') rw.relicChoices = [0, 1, 2].map(() => rollRelic(run, 'boss')).filter((x, i, a) => x && a.indexOf(x) === i);
  const potionChance = 0.4 + relicMod(run, 'potionChance') * 0.1;
  if (kind !== 'final' && rng.chance(kind === 'normal' ? potionChance : 0.6)) rw.potion = rollPotion(run);
  if (kind === 'final') rw.graft = false;
  wardRewards(run, rw, prevPending); // salvage, the hour's gold, building plans (engine/ward.js)
  run.phase = 'reward'; run.pending = rw;
  return rw;
}
export function claimGold(run, rw) {
  if (rw.gold) { run.gold += rw.gold; run.stats.goldEarned += rw.gold; rw.gold = 0; }
}

// ---------- THE GRAFT OFFER ----------
const RARITY_W = { 1: { common: 8, uncommon: 3, rare: 0.4 }, 2: { common: 5, uncommon: 4, rare: 1.2 }, 3: { common: 3, uncommon: 4, rare: 2.2 } };
// Grafts this run may roll (the unlocked set; never empty).
function gpool(run) { const l = Object.values(GRAFTS).filter((g) => runAllows(run, g.id)); return l.length ? l : Object.values(GRAFTS); }
export function graftableCards(run) {
  return run.deck.filter((i) => CARDS[i.id].type !== 'junk' && i.grafts.length < MAX_GRAFTS);
}
// 3 cards from your deck, 3 grafts (safe, greedy, weird). Deterministic from the run rng.
export function makeGraftOffer(run, o = {}) {
  const rng = run.rng;
  const elig = graftableCards(run);
  if (!elig.length) return { cards: [], grafts: [] };
  // cards: 2 random, plus the least played (so you do not only upgrade the star)
  const byPlays = elig.slice().sort((a, b) => (a.plays || 0) - (b.plays || 0) || a.grafts.length - b.grafts.length);
  const cards = [];
  const lowPool = byPlays.slice(0, Math.max(3, Math.ceil(elig.length / 3)));
  const low = rng.pick(lowPool); cards.push(low);
  // prefer three DIFFERENT cards so the choice is a real one; duplicates only fill gaps
  const rest = elig.filter((i) => i !== low);
  const seen = new Set([low.id]);
  const fresh = rng.shuffle(rest.filter((i) => !seen.has(i.id)));
  for (const c of fresh) { if (cards.length >= 3) break; if (!seen.has(c.id)) { seen.add(c.id); cards.push(c); } }
  for (const c of rng.shuffle(rest.filter((i) => !cards.includes(i)))) { if (cards.length >= 3) break; cards.push(c); }
  const count = perk(run, 'offer4') ? 4 : 3;
  const tiers = ['safe', 'greedy', 'weird'];
  const picked = [];
  const w = RARITY_W[run.act] || RARITY_W[3];
  for (let t = 0; t < tiers.length; t++) {
    let pool = gpool(run).filter((g) => g.tier === tiers[t] && !picked.includes(g.id) && cards.some((c) => canGraft(c, g.id)));
    if (!pool.length) pool = gpool(run).filter((g) => !picked.includes(g.id) && cards.some((c) => canGraft(c, g.id)));
    if (!pool.length) continue;
    picked.push(rng.weighted(pool, (g) => (w[g.rarity] || 1) * (o.bias && g.school === o.bias ? 2 : 1)).id);
  }
  while (picked.length < count) {
    const pool = gpool(run).filter((g) => !picked.includes(g.id) && cards.some((c) => canGraft(c, g.id)));
    if (!pool.length) break;
    picked.push(rng.weighted(pool, (g) => w[g.rarity] || 1).id);
  }
  return { cards: cards.map((c) => c.uid), grafts: picked, rerolled: o.rerolled || 0 };
}
export function startGraftPick(run) {
  run.phase = 'graft';
  run.pending = { kind: 'graft', offer: makeGraftOffer(run) };
  return run.pending;
}
export function rerollGraftOffer(run, free = false) {
  const p = run.pending;
  if (!p || p.kind !== 'graft') return false;
  if (run.ascension >= 8 && !free) return false;
  const cost = 20 + 10 * (p.offer.rerolled || 0);
  if (!free && !perk(run, 'rerollFree')) { if (run.gold < cost) return false; run.gold -= cost; }
  p.offer = makeGraftOffer(run, { rerolled: (p.offer.rerolled || 0) + 1 });
  return true;
}
export function rerollCost(run) { const p = run.pending; return p && p.offer ? 20 + 10 * (p.offer.rerolled || 0) : 20; }
export function findInst(run, uid) { return run.deck.find((i) => i.uid === uid); }

// Preview what a pick would do to the deck (Budget, Strain, who gets Tithed).
export function previewPick(run, uid, gid) {
  const p = previewGraft(run, uid, gid);
  const inst = findInst(run, uid);
  const after = { ...inst, grafts: [...inst.grafts, gid] };
  p.waived = sampleReady(run) && GRAFTS[gid].mods.some(isPriceMod); // Free Sample would waive this graft's Price
  if (p.waived) after.waived = [...(inst.waived || []), gid];
  p.spec = cardSpec(after);
  p.overload = after.grafts.length > 2;
  return p;
}
// Free Sample (perk freeFirstGraft): the first graft Price accepted each act is waived, every kind of it (engine/cards.js isPriceMod).
function sampleReady(run) { return perk(run, 'freeFirstGraft') && !run.flags['pf' + run.act]; }
export function applyGraft(run, uid, gid, o = {}) {
  const inst = findInst(run, uid);
  if (!inst || !canGraft(inst, gid)) return { ok: false };
  inst.grafts.push(gid);
  const g = GRAFTS[gid];
  if (!o.free && sampleReady(run)) { run.flags['pf' + run.act] = 1; (inst.waived = inst.waived || []).push(gid); } // decided first: a waived Price costs no max HP either
  if (!(inst.waived && inst.waived.includes(gid))) for (const m of g.mods) if (m.k === 'maxHp') { run.maxHp = Math.max(10, run.maxHp + m.n); run.hp = Math.min(run.hp, run.maxHp); }
  const bounty = perkN(run, 'graftBounty'); if (bounty) { run.gold += bounty; run.stats.goldEarned += bounty; }
  run.stats.grafts++;
  if (!o.keepPhase) { run.pending = null; }
  return { ok: true, overload: inst.grafts.length > 2 };
}
export function skipGraft(run, choice) {
  if (Array.isArray(choice)) { if (!perk(run, 'extraSkipChoice')) choice = choice.slice(0, 1); let ok = false; for (const c of choice.slice(0, 2)) ok = skipGraft(run, c) || ok; return ok; }
  if (choice === 'heal') run.hp = Math.min(run.maxHp, run.hp + SKIP_HEAL);
  else if (choice === 'budget') run.budgetBonus += 1;
  else if (choice === 'gold') { run.gold += 10; run.stats.goldEarned += 10; }
  else return false;
  run.stats.skips++; run.pending = null;
  return true;
}

// ---------- shop ----------
export function priceMult(run) {
  let m = PRICE_MULT[run.act] || 1.4;
  if (run.ascension >= 5) m *= 1.15;
  const hero = HEROES[run.hero];
  if (hero.perks && hero.perks.shopDiscount) m *= 1 - hero.perks.shopDiscount;
  if (run.dailyMod && run.dailyMod.shopMul) m *= run.dailyMod.shopMul;
  m *= 1 - perkN(run, 'shopDiscount') / 100;
  return m;
}
export function makeShop(run) {
  const rng = run.rng;
  const hero = run.hero;
  const pool = Object.values(CARDS).filter((c) => (c.hero === hero || c.hero === 'any') && c.rarity !== 'starter' && c.rarity !== 'junk' && runAllows(run, c.id));
  const cw = { common: 6, uncommon: 3, rare: 1 };
  const cards = [];
  let guard = 0;
  while (cards.length < 5 && guard++ < 60 && pool.length) {
    const c = rng.weighted(pool, (x) => cw[x.rarity] || 1);
    if (!cards.some((k) => k.id === c.id)) cards.push({ id: c.id, price: Math.round({ common: 45, uncommon: 75, rare: 150 }[c.rarity] * (0.9 + rng.next() * 0.2)), sold: false });
  }
  const gids = [];
  for (const tier of ['safe', 'greedy', 'weird']) { let p = gpool(run).filter((g) => g.tier === tier); if (!p.length) p = gpool(run); if (p.length) gids.push(rng.pick(p).id); }
  const grafts = gids.map((id) => ({ id, price: 70, sold: false }));
  const relics = [rollRelicByAct(run), rollRelic(run, 'shop')].filter((x, i, a) => x && a.indexOf(x) === i).map((id) => ({ id, price: { common: 150, uncommon: 200, rare: 280, shop: 180, boss: 300 }[RELICS[id].rarity] || 200, sold: false }));
  const potions = [0, 1, 2].map(() => ({ id: rollPotion(run), price: 50, sold: false }));
  const m = priceMult(run);
  for (const it of [...cards, ...grafts, ...relics, ...potions]) it.price = Math.max(10, Math.round(it.price * m));
  const shop = { kind: 'shop', cards, grafts, relics, potions, removeUses: 0 };
  wardShopExtend(run, shop); // the Dispensary's building plans and its strike-a-plan service
  return shop;
}
export function servicePrice(run, svc) {
  const m = priceMult(run);
  if (svc === 'remove') return Math.round((75 + 25 * run.shopUses.remove) * m);
  if (svc === 'strip') return perk(run, 'stripFree') && !run.flags.stripFreeUsed ? 0 : Math.round(90 * m);
  return 0;
}
export function shopBuy(run, kind, index, extra) {
  const shop = run.pending;
  if (!shop || shop.kind !== 'shop') return { ok: false, why: 'noshop' };
  if (kind === 'build' || kind === 'buildRemove') return wardShopBuy(run, shop, kind, index, extra);
  if (kind === 'remove') {
    const price = servicePrice(run, 'remove'); const inst = findInst(run, extra);
    if (!inst || run.gold < price) return { ok: false, why: 'gold' };
    run.gold -= price; run.deck = run.deck.filter((i) => i !== inst); run.shopUses.remove++; return { ok: true };
  }
  if (kind === 'strip') {
    const price = servicePrice(run, 'strip'); const inst = findInst(run, extra.uid);
    if (!inst || !inst.grafts.length || run.gold < price) return { ok: false, why: 'gold' };
    if (price === 0) run.flags.stripFreeUsed = 1;
    run.gold -= price; stripGraft(run, inst.uid, extra.gid); return { ok: true };
  }
  const list = shop[kind + 's'];
  const it = list && list[index];
  if (!it || it.sold) return { ok: false, why: 'sold' };
  if (run.gold < it.price) return { ok: false, why: 'gold' };
  if (kind === 'potion' && run.potions.length >= potionSlots(run)) return { ok: false, why: 'slots' };
  if (kind === 'graft') {
    const inst = findInst(run, extra);
    if (!inst || !canGraft(inst, it.id)) return { ok: false, why: 'cantgraft' };
    run.gold -= it.price; it.sold = true; applyGraft(run, inst.uid, it.id, { keepPhase: true }); return { ok: true };
  }
  run.gold -= it.price; it.sold = true;
  if (kind === 'card') run.deck.push(newInst(it.id, () => run.uidNext++));
  else if (kind === 'relic') addRelic(run, it.id);
  else if (kind === 'potion') addPotion(run, it.id);
  return { ok: true };
}

// ---------- forge (rest site) ----------
export function forgeHeal(run) { return Math.round(run.maxHp * (run.ascension >= 4 ? 0.25 : 0.3)); }
export function stripGraft(run, uid, gid) {
  const inst = findInst(run, uid);
  if (!inst || !inst.grafts.length) return false;
  const i = gid ? inst.grafts.indexOf(gid) : inst.grafts.length - 1;
  if (i < 0) return false;
  inst.grafts.splice(i, 1);
  return true;
}
// choice: 'rest' | 'expand' | 'refine' (a: uid) | 'temper' (a: uid) | 'strip' (a: uid, b: gid) | 'reforge' (a: fromUid, b: gid, c: toUid)
export function forgeAct(run, choice, a, b, c) {
  const f = run.pending;
  if (!f || f.kind !== 'forge' || f.used >= 1 + perkN(run, 'forgeExtra')) return { ok: false };
  let ok = false;
  if (choice === 'rest') { run.hp = Math.min(run.maxHp, run.hp + forgeHeal(run)); ok = true; }
  else if (choice === 'expand') { run.budgetBonus += 1; ok = true; }
  else if (choice === 'refine') { const i = findInst(run, a); if (i && !i.up && CARDS[i.id].up) { i.up = 1; ok = true; } }
  else if (choice === 'temper') { const i = findInst(run, a); if (i && canTemper(i)) { ok = temper(i); if (ok) run.stats.tempered = (run.stats.tempered || 0) + 1; } }
  else if (choice === 'strip') ok = stripGraft(run, a, b);
  else if (choice === 'reforge') {
    const from = findInst(run, a), to = findInst(run, c);
    if (from && to && from !== to && from.grafts.includes(b)) {
      const had = from.grafts.slice(); from.grafts.splice(from.grafts.indexOf(b), 1);
      if (canGraft(to, b)) { to.grafts.push(b); ok = true; } else from.grafts = had;
    }
  }
  if (ok) { f.used++; f.last = choice; }
  return { ok };
}

// ---------- events ----------
export const R = {
  gold: (run, n) => { run.gold = Math.max(0, run.gold + n); if (n > 0) run.stats.goldEarned += n; },
  heal: (run, n) => { run.hp = Math.min(run.maxHp, run.hp + n); },
  hurt: (run, n) => { run.hp = Math.max(1, run.hp - n); },
  maxHp: (run, n) => { run.maxHp = Math.max(10, run.maxHp + n); run.hp = Math.min(run.maxHp, Math.max(1, run.hp + (n > 0 ? n : 0))); },
  addCard: (run, id) => { if (CARDS[id]) run.deck.push(newInst(id, () => run.uidNext++)); },
  addBuild: (run, id) => addBuildCard(run, id), // a building card (b_*) into the building deck
  removeCard: (run, uid) => { run.deck = run.deck.filter((i) => i.uid !== uid); },
  upgrade: (run, uid) => { const i = findInst(run, uid); if (i && CARDS[i.id].up) i.up = 1; },
  addRelic: (run, id) => addRelic(run, id || rollRelicByAct(run)),
  addPotion: (run, id) => addPotion(run, id || rollPotion(run)),
  budget: (run, n) => { run.budgetBonus += n; },
  stripGraft: (run, uid, gid) => stripGraft(run, uid, gid),
  addGraft: (run, uid, gid) => applyGraft(run, uid, gid, { keepPhase: true }),
  queueGraftPick: (run) => { run.flags.queueGraft = (run.flags.queueGraft || 0) + 1; },
  queueFight: (run, enemies, o = {}) => { run.flags.queueFight = { enemies, elite: !!o.elite }; },
  rng: (run) => run.rng,
  addGraftRandom: (run, uid) => { const inst = findInst(run, uid); if (!inst) return null; const pool = gpool(run).filter((g) => canGraft(inst, g.id)); if (!pool.length) return null; const g = run.rng.pick(pool); applyGraft(run, uid, g.id, { keepPhase: true }); return g.id; },
  moveGraft: (run, from, to, gid) => { const a = findInst(run, from), b = findInst(run, to); if (!a || !b || a === b || !a.grafts.includes(gid) || !canGraft(b, gid)) return false; a.grafts.splice(a.grafts.indexOf(gid), 1); b.grafts.push(gid); return true; },
  shatter: (run, uid) => { run.deck = run.deck.filter((i) => i.uid !== uid); run.stats.shatters++; },
  strainOf: (run) => strainInfo(run),
};
// An event is opened by the Chapel (engine/ward.js wardStartEvent); these read and resolve run.pending.
export function eventChoices(run) {
  const p = run.pending; const ev = EVENTS[p.id];
  return ev.choices.map((ch, i) => ({ i, label: ch.label, text: ch.text || '', pick: ch.pick || null, ok: !ch.cond || !!ch.cond(run), cards: ch.pick === 'card' ? run.deck.filter((x) => !ch.pickFilter || ch.pickFilter(x)).map((x) => x.uid) : null }));
}
export function eventChoose(run, i, uid) {
  const p = run.pending; const ev = EVENTS[p.id]; const ch = ev.choices[i];
  if (!ch || (ch.cond && !ch.cond(run)) || p.result !== null) return null;
  let inst;
  if (ch.pick === 'card') { inst = findInst(run, uid); if (!inst || (ch.pickFilter && !ch.pickFilter(inst))) return null; }
  p.result = ch.apply(run, R, inst) || 'Done.';
  return p.result;
}
// After an event, a queued fight or graft pick may follow, else the walk goes on. Returns the next phase.
export function afterEvent(run) {
  if (run.flags.queueFight) { const q = run.flags.queueFight; delete run.flags.queueFight; run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: q.elite ? 'elite' : 'normal', enemies: q.enemies, fromEvent: true }; return run.phase; }
  if (run.flags.queueGraft > 0) { run.flags.queueGraft--; startGraftPick(run); return run.phase; }
  wardAfterTrigger(run); return run.phase; // back to the walk
}

// ---------- fight resolution ----------
// After engine/combat.js finishCombat(c). Returns the next phase.
export function resolveFight(run, result) {
  const kind = run.pending ? run.pending.fightKind : 'normal';
  run.stats.fights++;
  // Case file bookkeeping (read by engine/meta2.js): enemies met, and the deck going into each boss.
  const met = (run.pending && run.pending.enemies) || [];
  run.seenEnemies = run.seenEnemies || [];
  for (const id of met) if (!run.seenEnemies.includes(id)) run.seenEnemies.push(id);
  if (kind === 'boss' || kind === 'final') {
    run.bossLog = run.bossLog || [];
    run.bossLog.push({ kind, enemies: met.slice(), act: run.act, win: !!result.win, deck: run.deck.map((i) => ({ id: i.id, grafts: (i.grafts || []).slice(), fused: (i.fused || []).slice(), up: i.up || 0 })), relics: run.relics.slice(), maxHp: run.maxHp });
  }
  if (run.practice) { // a practice fight ends the session: win or lose, nothing else follows
    run.phase = result.win && run.hp > 0 ? 'won' : 'dead'; run.pending = null;
    if (run.phase === 'dead') { run.killedBy = result.killedBy || null; run.deathCause = result.cause || null; }
    return run.phase;
  }
  if (result.damageTaken) run.stats.damageTaken += result.damageTaken;
  run.stats.shatters += result.shattered.length;
  if (!result.win || run.hp <= 0) { run.killedBy = result.killedBy || null; run.deathCause = result.cause || null; run.phase = 'dead'; run.pending = null; return 'dead'; }
  run.killedEnemies = run.killedEnemies || []; // first-kill bonus (engine/unlock.js)
  for (const id of met) if (!run.killedEnemies.includes(id)) run.killedEnemies.push(id);
  if (kind === 'elite') run.stats.elites++;
  if (kind === 'boss') run.stats.bosses++;
  const hero = HEROES[run.hero];
  if (hero.perks && hero.perks.combatHeal) run.hp = Math.min(run.maxHp, run.hp + hero.perks.combatHeal);
  if (run.pending && run.pending.fromEvent) { return afterEvent(run); }
  if (kind === 'final') { run.phase = 'won'; run.pending = null; return 'won'; }
  fightRewards(run, kind, result);
  return 'reward';
}
// Leave a reward screen: first the graft pick if one is offered, then back to the walk (or the next floor).
export function afterReward(run) {
  const rw = run.pending;
  if (rw && rw.graft && graftableCards(run).length) { rw.graft = false; return startGraftPick(run), 'graft'; }
  return advance(run);
}
export function afterGraft(run) {
  if (run.flags.queueGraft > 0) { run.flags.queueGraft--; startGraftPick(run); return 'graft'; }
  return advance(run);
}
// After a reward, a graft pick, the shop or the forge: the walk continues, or the next floor opens after the boss (Act 3: the Grafter).
export function advance(run) { return wardAdvance(run); }
// Endless: the next loop starts on a fresh first floor (resources and the building deck carry over as between floors).
export function startLoop(run) { run.loop++; run.hp = run.maxHp; startAct(run, 1); }

export { resonanceOf as resonance } from './resonance.js';

// ---------- save / restore ----------
export function serializeRun(run) {
  const { rng, ...rest } = run;
  return JSON.stringify({ ...rest, rngState: rng.state });
}
export function deserializeRun(json) {
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  const rng = makeRng(o.seed);
  rng.state = o.rngState;
  const run = { ...o, rng };
  delete run.rngState;
  return repairRun(run);
}
// A save may name content that no longer exists (a removed card, graft, relic or potion). Drop those entries so the run keeps
// loading. A save without such ids is returned untouched (same bytes when saved again).
const keepKnown = (list, known) => (Array.isArray(list) && list.some((x) => !known(x)) ? list.filter(known) : list);
function repairRun(run) {
  if (!Array.isArray(run.deck)) return run;
  run.deck = keepKnown(run.deck, (i) => !!(i && CARDS[i.id]));
  for (const i of run.deck) for (const k of ['grafts', 'fused', 'waived']) if (i[k]) i[k] = keepKnown(i[k], (g) => !!GRAFTS[g]);
  run.relics = keepKnown(run.relics, (r) => !!RELICS[r]);
  run.potions = keepKnown(run.potions, (p) => !!POTIONS[p]);
  const p = run.pending;
  if (p && p.kind === 'shop') {
    for (const [k, reg] of [['cards', CARDS], ['grafts', GRAFTS], ['relics', RELICS], ['potions', POTIONS]]) p[k] = keepKnown(p[k], (it) => !!(it && reg[it.id]));
  } else if (p && p.kind === 'graft' && p.offer) {
    const cards = keepKnown(p.offer.cards, (u) => run.deck.some((i) => i.uid === u)), grafts = keepKnown(p.offer.grafts, (g) => !!GRAFTS[g]);
    if (cards !== p.offer.cards || grafts !== p.offer.grafts) p.offer = makeGraftOffer(run, { rerolled: p.offer.rerolled || 0 }); // deal a fresh offer from what is left
  } else if (p && p.gold !== undefined && 'graft' in p) { // a reward screen
    if (p.relic && !RELICS[p.relic]) p.relic = null;
    if (p.potion && !POTIONS[p.potion]) p.potion = null;
    if (p.relicChoices) p.relicChoices = keepKnown(p.relicChoices, (r) => !!RELICS[r]);
  }
  return run;
}
export { strainInfo, budgetOf };
