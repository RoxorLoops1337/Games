// Run layer: a run is plain JSON (plus run.rng). Everything between fights lives here: the map, rewards, the graft
// offer (the heart of the game), shop, forge, events, ascension, daily seed, endless loops, save/restore.
import { CARDS, GRAFTS, ENEMIES, RELICS, POTIONS, EVENTS, HEROES, SCHOOLS } from '../data/index.js';
import { makeRng, hashSeed } from './rng.js';
import { newInst, cardSpec, canGraft, strainInfo, budgetOf, relicMod, previewGraft, MAX_GRAFTS } from './cards.js';

export const ACT_ROWS = { 1: 10, 2: 10, 3: 11 };
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
  'Overload Shatter chance is 10% higher.',
  'Only 2 potion slots and 10% less max HP.',
  'All enemies hit 10% harder.',
];
export const DAILY_MODS = [
  { id: 'fragile', name: 'Fragile Stitches', text: 'Overload Shatter chance +15%.', shatter: 0.15 },
  { id: 'tough', name: 'Thick Skinned', text: 'Enemies have 15% more HP.', hpMul: 1.15 },
  { id: 'cheap', name: 'Clearance Sale', text: 'Shop prices are 25% lower.', shopMul: 0.75 },
  { id: 'roomy', name: 'Roomy Ward', text: 'Budget +2.', budget: 2 },
  { id: 'poor', name: 'Lean Times', text: 'Fight gold is halved.', goldMul: 0.5 },
  { id: 'jumpy', name: 'Jumpy Hands', text: 'Start combat with 1 Echo.', echo: 1 },
];

// ---------- new run ----------
export function newRun(opts = {}) {
  const hero = HEROES[opts.hero || 'marrow'];
  const seedStr = opts.seed !== undefined ? String(opts.seed) : String(Date.now());
  const rng = makeRng(seedStr);
  const perks = hero.perks || {};
  const asc = opts.ascension || 0;
  let uid = 1;
  const run = {
    v: 1, seed: seedStr, hero: hero.id, ascension: asc, daily: opts.daily || null, loop: 0,
    rng, uidNext: 1,
    act: 1, row: -1, node: null, map: null, phase: 'map',
    hp: perks.hp || 70, maxHp: perks.hp || 70, gold: perks.gold || 99,
    deck: hero.deck.map((id) => newInst(id, () => uid++)),
    relics: [], potions: [], budgetBonus: 0, flags: {}, stats: { fights: 0, elites: 0, grafts: 0, shatters: 0, goldEarned: 0, damageTaken: 0, skips: 0, floors: 0, bosses: 0 },
    seenEvents: [], rerolls: 0, shopUses: { remove: 0, strip: 0 }, pending: null,
  };
  run.uidNext = uid;
  if (asc >= 9) { run.maxHp = Math.round(run.maxHp * 0.9); run.hp = run.maxHp; }
  if (asc >= 3) run.deck.push(newInst('j_clot', () => run.uidNext++));
  if (hero.id === 'marrow') addRelic(run, 'r_marrow_kit');
  if (hero.id === 'wick') addRelic(run, 'r_wick_kit');
  if (hero.id === 'odile') addRelic(run, 'r_odile_kit');
  if (run.daily) { run.dailyMod = DAILY_MODS[hashSeed(run.daily) % DAILY_MODS.length]; run.budgetBonus += run.dailyMod.budget || 0; }
  run.budgetBonus += -(asc >= 6 ? 1 : 0);
  startAct(run, 1);
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
  return Object.values(RELICS).filter((r) => rarities.includes(r.rarity) && !run.relics.includes(r.id) && (!r.hero || r.hero === run.hero));
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
  const list = Object.values(POTIONS);
  const w = { common: 6, uncommon: 3, rare: 1 };
  return run.rng.weighted(list, (p) => w[p.rarity] || 1).id;
}

// ---------- map ----------
const COLS = 6;
export function startAct(run, act) {
  run.act = act; run.row = -1; run.node = null;
  run.map = genMap(run, act);
  run.phase = 'map';
}
function genMap(run, act) {
  const rng = run.rng;
  const rows = ACT_ROWS[act];
  const bossRows = act === 3 ? 2 : 1;
  const nodes = [];
  const byRow = [];
  for (let r = 0; r < rows; r++) {
    const last = r >= rows - bossRows;
    const count = last ? 1 : (r === 0 ? rng.range(3, 4) : rng.range(2, 4));
    const cols = last ? [2] : rng.sample([0, 1, 2, 3, 4, 5], count).sort((a, b) => a - b);
    const row = cols.map((col) => ({ id: `${act}-${r}-${col}`, row: r, col, type: 'fight', next: [], visited: false }));
    byRow.push(row); nodes.push(...row);
  }
  // edges: every node links to 1 or 2 nodes in the next row, and every node has an incoming edge
  for (let r = 0; r < rows - 1; r++) {
    const a = byRow[r], b = byRow[r + 1];
    const nearest = (n) => b.slice().sort((x, y) => Math.abs(x.col - n.col) - Math.abs(y.col - n.col));
    for (const n of a) {
      const near = nearest(n);
      n.next.push(near[0].id);
      if (near[1] && rng.chance(0.45) && Math.abs(near[1].col - n.col) <= 2) n.next.push(near[1].id);
    }
    for (const m of b) if (!a.some((n) => n.next.includes(m.id))) { const n = a.slice().sort((x, y) => Math.abs(x.col - m.col) - Math.abs(y.col - m.col))[0]; n.next.push(m.id); }
  }
  // types
  const set = (n, type) => { n.type = type; };
  const bossRow = rows - bossRows;
  if (act === 3) { set(byRow[rows - 2][0], 'boss'); set(byRow[rows - 1][0], 'final'); } else set(byRow[rows - 1][0], 'boss');
  const forgeRow = bossRow - 1;
  for (const n of byRow[forgeRow]) set(n, 'forge');
  for (const n of byRow[0]) set(n, 'fight');
  const mid = nodes.filter((n) => n.row >= 1 && n.row < forgeRow);
  const weights = [['fight', 52], ['event', 20], ['shop', 8], ['forge', 8], ['elite', 12]];
  for (const n of mid) {
    let w = weights.filter(([t]) => (t !== 'elite' || n.row >= 3) && (t !== 'shop' || n.row >= 2) && (t !== 'forge' || n.row >= 3));
    if (n.row === forgeRow - 1) w = w.filter(([t]) => t !== 'forge');
    set(n, rng.weighted(w, ([, k]) => k)[0]);
  }
  // guarantees: a shop around the middle, at least 2 elites (3 on A1+), and two events
  const need = (type, count, rowMin, rowMax) => {
    let have = mid.filter((n) => n.type === type).length;
    const pool = mid.filter((n) => n.row >= rowMin && n.row <= rowMax && n.type === 'fight');
    while (have < count && pool.length) { set(pool.splice(rng.int(pool.length), 1)[0], type); have++; }
  };
  need('shop', 1, 3, 6); need('elite', 2 + (run.ascension >= 1 ? 1 : 0), 3, forgeRow - 1); need('event', 2, 1, forgeRow - 2);
  // no two shops or forges in a row on one path would be nice; keep it simple
  for (const n of nodes) { n.x = (n.col + 0.5) / COLS + (rng.next() - 0.5) * 0.04; }
  return { act, rows, nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), byRow: byRow.map((r) => r.map((n) => n.id)) };
}
export function availableNodes(run) {
  if (!run.map) return [];
  if (run.node === null) return run.map.byRow[0];
  return run.map.nodes[run.node].next;
}
export function enterNode(run, id) {
  if (!availableNodes(run).includes(id)) return null;
  const n = run.map.nodes[id];
  run.node = id; run.row = n.row; n.visited = true; run.stats.floors++;
  switch (n.type) {
    case 'fight': return startFight(run, 'normal');
    case 'elite': return startFight(run, 'elite');
    case 'boss': return startFight(run, 'boss');
    case 'final': return startFight(run, 'final');
    case 'shop': run.phase = 'shop'; run.pending = makeShop(run); return run.pending;
    case 'forge': run.phase = 'forge'; run.pending = { kind: 'forge', used: false }; return run.pending;
    case 'event': return startEvent(run);
    default: throw new Error('bad node ' + n.type);
  }
}

// ---------- encounters ----------
function actEnemies(run, kind) {
  return Object.values(ENEMIES).filter((e) => e.act === run.act && e.kind === kind && !e.minion && !e.noPick && !e.summonOnly);
}
export function makeEncounter(run, kind) {
  const rng = run.rng;
  if (kind === 'final') return ['the_grafter'];
  if (kind === 'boss') { const b = actEnemies(run, 'boss').filter((e) => !e.final); return [rng.pick(b).id]; }
  if (kind === 'elite') { const e = actEnemies(run, 'elite'); return [rng.pick(e).id]; }
  const pool = actEnemies(run, 'normal');
  const avg = (e) => (Array.isArray(e.hp) ? (e.hp[0] + e.hp[1]) / 2 : e.hp);
  const early = run.row <= 1;
  const scale = { 1: 1, 2: 1.6, 3: 2.4 }[run.act];
  const budget = (early ? 36 : 54 + rng.int(14)) * scale;
  const out = [];
  let spent = 0, tries = 0;
  while (tries++ < 12) {
    const e = rng.pick(pool);
    if (out.length && (spent + avg(e) > budget || out.length >= 3)) continue;
    out.push(e.id); spent += avg(e);
    if (spent >= budget * 0.85 || out.length >= 3) break;
    if (early && out.length >= 2) break;
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
  run.phase = 'reward'; run.pending = rw;
  return rw;
}
export function claimGold(run, rw) {
  if (rw.gold) { run.gold += rw.gold; run.stats.goldEarned += rw.gold; rw.gold = 0; }
}

// ---------- THE GRAFT OFFER ----------
const RARITY_W = { 1: { common: 8, uncommon: 3, rare: 0.4 }, 2: { common: 5, uncommon: 4, rare: 1.2 }, 3: { common: 3, uncommon: 4, rare: 2.2 } };
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
  const rest = elig.filter((i) => i !== low);
  for (const c of rng.sample(rest, 2)) cards.push(c);
  const count = perk(run, 'offer4') ? 4 : 3;
  const tiers = ['safe', 'greedy', 'weird'];
  const picked = [];
  const w = RARITY_W[run.act] || RARITY_W[3];
  for (let t = 0; t < tiers.length; t++) {
    let pool = Object.values(GRAFTS).filter((g) => g.tier === tiers[t] && !picked.includes(g.id) && cards.some((c) => canGraft(c, g.id)));
    if (!pool.length) pool = Object.values(GRAFTS).filter((g) => !picked.includes(g.id) && cards.some((c) => canGraft(c, g.id)));
    if (!pool.length) continue;
    picked.push(rng.weighted(pool, (g) => (w[g.rarity] || 1) * (o.bias && g.school === o.bias ? 2 : 1)).id);
  }
  while (picked.length < count) {
    const pool = Object.values(GRAFTS).filter((g) => !picked.includes(g.id) && cards.some((c) => canGraft(c, g.id)));
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
  p.spec = cardSpec(after);
  p.overload = after.grafts.length > 2;
  return p;
}
export function applyGraft(run, uid, gid, o = {}) {
  const inst = findInst(run, uid);
  if (!inst || !canGraft(inst, gid)) return { ok: false };
  inst.grafts.push(gid);
  const g = GRAFTS[gid];
  if (!(inst.waived && inst.waived.includes(gid))) for (const m of g.mods) if (m.k === 'maxHp') { run.maxHp = Math.max(10, run.maxHp + m.n); run.hp = Math.min(run.hp, run.maxHp); }
  if (!o.free && perk(run, 'freeFirstGraft') && !run.flags['pf' + run.act]) { run.flags['pf' + run.act] = 1; (inst.waived = inst.waived || []).push(gid); }
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
  const pool = Object.values(CARDS).filter((c) => (c.hero === hero || c.hero === 'any') && c.rarity !== 'starter' && c.rarity !== 'junk');
  const cw = { common: 6, uncommon: 3, rare: 1 };
  const cards = [];
  let guard = 0;
  while (cards.length < 5 && guard++ < 60 && pool.length) {
    const c = rng.weighted(pool, (x) => cw[x.rarity] || 1);
    if (!cards.some((k) => k.id === c.id)) cards.push({ id: c.id, price: Math.round({ common: 45, uncommon: 75, rare: 150 }[c.rarity] * (0.9 + rng.next() * 0.2)), sold: false });
  }
  const gids = [];
  for (const tier of ['safe', 'greedy', 'weird']) { const p = Object.values(GRAFTS).filter((g) => g.tier === tier); if (p.length) gids.push(rng.pick(p).id); }
  const grafts = gids.map((id) => ({ id, price: 70, sold: false }));
  const relics = [rollRelicByAct(run), rollRelic(run, 'shop')].filter((x, i, a) => x && a.indexOf(x) === i).map((id) => ({ id, price: { common: 150, uncommon: 200, rare: 280, shop: 180, boss: 300 }[RELICS[id].rarity] || 200, sold: false }));
  const potions = [0, 1, 2].map(() => ({ id: rollPotion(run), price: 50, sold: false }));
  const m = priceMult(run);
  for (const it of [...cards, ...grafts, ...relics, ...potions]) it.price = Math.max(10, Math.round(it.price * m));
  return { kind: 'shop', cards, grafts, relics, potions, removeUses: 0 };
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
// choice: 'rest' | 'expand' | 'refine' (a: uid) | 'strip' (a: uid, b: gid) | 'reforge' (a: fromUid, b: gid, c: toUid)
export function forgeAct(run, choice, a, b, c) {
  const f = run.pending;
  if (!f || f.kind !== 'forge' || f.used >= 1 + perkN(run, 'forgeExtra')) return { ok: false };
  let ok = false;
  if (choice === 'rest') { run.hp = Math.min(run.maxHp, run.hp + forgeHeal(run)); ok = true; }
  else if (choice === 'expand') { run.budgetBonus += 1; ok = true; }
  else if (choice === 'refine') { const i = findInst(run, a); if (i && !i.up && CARDS[i.id].up) { i.up = 1; ok = true; } }
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
  addGraftRandom: (run, uid) => { const inst = findInst(run, uid); if (!inst) return null; const pool = Object.values(GRAFTS).filter((g) => canGraft(inst, g.id)); if (!pool.length) return null; const g = run.rng.pick(pool); applyGraft(run, uid, g.id, { keepPhase: true }); return g.id; },
  moveGraft: (run, from, to, gid) => { const a = findInst(run, from), b = findInst(run, to); if (!a || !b || a === b || !a.grafts.includes(gid) || !canGraft(b, gid)) return false; a.grafts.splice(a.grafts.indexOf(gid), 1); b.grafts.push(gid); return true; },
  shatter: (run, uid) => { run.deck = run.deck.filter((i) => i.uid !== uid); run.stats.shatters++; },
  strainOf: (run) => strainInfo(run),
};
export function startEvent(run) {
  const pool = Object.values(EVENTS).filter((e) => (e.act === 0 || e.act === run.act) && !run.seenEvents.includes(e.id));
  const ev = pool.length ? run.rng.pick(pool) : null;
  if (!ev) { run.phase = 'map'; return null; }
  run.seenEvents.push(ev.id);
  run.phase = 'event'; run.pending = { kind: 'event', id: ev.id, result: null };
  return run.pending;
}
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
// After an event, a queued fight or graft pick may follow. Returns the next phase.
export function afterEvent(run) {
  if (run.flags.queueFight) { const q = run.flags.queueFight; delete run.flags.queueFight; run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: q.elite ? 'elite' : 'normal', enemies: q.enemies, fromEvent: true }; return run.phase; }
  if (run.flags.queueGraft > 0) { run.flags.queueGraft--; startGraftPick(run); return run.phase; }
  run.phase = 'map'; run.pending = null; return run.phase;
}

// ---------- fight resolution ----------
// After engine/combat.js finishCombat(c). Returns the next phase.
export function resolveFight(run, result) {
  const kind = run.pending ? run.pending.fightKind : 'normal';
  run.stats.fights++;
  if (result.damageTaken) run.stats.damageTaken += result.damageTaken;
  run.stats.shatters += result.shattered.length;
  if (!result.win || run.hp <= 0) { run.phase = 'dead'; run.pending = null; return 'dead'; }
  if (kind === 'elite') run.stats.elites++;
  if (kind === 'boss') run.stats.bosses++;
  const hero = HEROES[run.hero];
  if (hero.perks && hero.perks.combatHeal) run.hp = Math.min(run.maxHp, run.hp + hero.perks.combatHeal);
  if (run.pending && run.pending.fromEvent) { return afterEvent(run); }
  if (kind === 'final') { run.phase = 'won'; run.pending = null; return 'won'; }
  fightRewards(run, kind, result);
  return 'reward';
}
// Leave a reward screen: first graft pick if offered, then the map (or the next act).
export function afterReward(run) {
  const rw = run.pending;
  if (rw && rw.kind === 'boss') { /* boss relic chosen in UI before this */ }
  if (rw && rw.graft && graftableCards(run).length) { rw.graft = false; return startGraftPick(run), 'graft'; }
  return advance(run);
}
export function afterGraft(run) {
  if (run.flags.queueGraft > 0) { run.flags.queueGraft--; startGraftPick(run); return 'graft'; }
  const rw = run.postReward;
  return advance(run);
}
export function advance(run) {
  const node = run.node ? run.map.nodes[run.node] : null;
  run.pending = null;
  if (node && node.type === 'boss' && run.act < 3) {
    startAct(run, run.act + 1);
    run.hp = Math.min(run.maxHp, run.hp + Math.round(run.maxHp * 0.5));
    run.phase = 'map'; return 'act';
  }
  if (node && node.type === 'boss' && run.act === 3) { run.phase = 'map'; return 'map'; }
  run.phase = 'map'; return 'map';
}
export function startLoop(run) {
  run.loop++; run.hp = run.maxHp; startAct(run, 1); run.phase = 'map';
}

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
  return run;
}
export { strainInfo, budgetOf };
