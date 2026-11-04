// Cell Serpent: pure simulation (no DOM, no canvas). The browser and the headless test suite
// run this same file. All randomness comes from one seeded generator.
//
// One run is ONE snake (one stage). A long segmented serpent crawls down a winding lane toward
// the bottom of the screen as one connected chain. Your cell slides left and right along the
// bottom row and fires notes straight up, so where you stand is your aim. Every cell takes
// 10 to 20 shots. Upgrades come only from the yellow upgrade cells on the snake. Its face is shielded
// until every other cell is gone. If the face reaches the membrane it drains your HP.
// Between runs you spend Beats and Sparkles on stats, loot boxes and skill levels (meta section).
import { defaultUnlocked, sanitizeUnlocked } from './unlock_b12p.js';
export const W = 720;
export const H = 1280;
export const LINE_Y = 1055;   // the membrane at the bottom
export const ROW_Y = 1170;    // the cell's row
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- skills (weapons)
// `frag` is how many fragments unlock a locked skill (0 = owned from the start).
export const WEAPONS = [
  { id: 'swab', stage: 0, tier: 0, name: 'Kitty Paws', max: 5, frag: 0, desc: 'Soft paw prints that thump where the snake crawls.' },
  { id: 'daggers', stage: 0, tier: 0, name: 'Chick Circle', max: 5, frag: 0, desc: 'Fluffy chicks that zoom around you.' },
  { id: 'tower', stage: 0, tier: 1, name: 'Cow Choir', max: 5, frag: 0, desc: 'Moooo! Big cows, bigger bass.' },
  { id: 'dragon', stage: 0, tier: 1, name: 'Dove Squad', max: 5, frag: 0, desc: 'Little doves that never miss.' },
  { id: 'needles', stage: 0, tier: 1, name: 'Hedgehog Quills', max: 5, frag: 0, desc: 'A sneeze of spiky love.' },
  { id: 'stick', stage: 3, tier: 1, name: 'Bunny Thump', max: 5, frag: 20, desc: 'Thump thump! Fluffy feet, serious kicks.' },
  { id: 'bubble', stage: 6, tier: 2, name: 'Duckling Splash', max: 5, frag: 30, desc: 'Bubble baths with a quack.' },
  { id: 'satellite', stage: 10, tier: 3, name: 'Owl Spotlight', max: 5, frag: 40, desc: 'Wise eyes that light up the weak.' },
  { id: 'maw', stage: 15, tier: 4, name: 'Bulldog Chomp', max: 5, frag: 60, desc: 'Good boy. Very hungry boy.' },
];
const WEAPON = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
export const WEAPON_STARTERS = WEAPONS.filter(w => !w.frag).map(w => w.id);
export const LOADOUT_SIZE = 5;

// Pets: collect them from eggs. Every star adds a permanent bonus, equipped or not. Two can walk with you.
export const PET_MAX_STAR = 5, PET_SLOTS = 2;
export const PETS = [
  { id: 'kitten', name: 'Kitten', stat: 'atk', per: 0.06, flavor: 'Naps, then pounces.' },
  { id: 'puppy', name: 'Puppy', stat: 'vit', per: 18, flavor: 'Barks at big things.' },
  { id: 'piglet', name: 'Piglet', stat: 'coin', per: 0.08, flavor: 'Snuffles out the Beats.' },
  { id: 'lamb', name: 'Lamb', stat: 'guard', per: 0.04, flavor: 'Wool-powered hugs.' },
  { id: 'hamster', name: 'Hamster', stat: 'crit', per: 0.02, flavor: 'Runs on a tiny wheel.' },
  { id: 'turtle', name: 'Turtle', stat: 'cdn', per: 0.03, flavor: 'Slow and steady.' },
];
const PET = Object.fromEntries(PETS.map(p => [p.id, p]));
export const PET_JOY_MAX = 100;   // happiness: fills while a pet walks with you (cosmetic, no stats)
export const petJoyGain = r => 6 + Math.min(10, Math.floor((r.stage || 1) / 4)) + (r.won ? 6 : 0);
export const petCost = star => (star === 0 ? 5 : 4 + 4 * star);   // fragments to own it, then for each star
// Keepsakes: little treasures from backstage. Each level adds a permanent bonus; owning a whole set adds one more.
export const KEEP_TIERS = [
  { id: 'fine', name: 'Fine', color: '#4fd8f0', max: 5 },
  { id: 'excellent', name: 'Excellent', color: '#6fe08a', max: 10 },
  { id: 'superb', name: 'Superb', color: '#b06cff', max: 10 },
  { id: 'legendary', name: 'Legendary', color: '#ffb04d', max: 10 },
];
export const KEEPSAKES = [
  { id: 'mallet', name: 'Squeaky Mallet', tier: 3, stat: 'atk', per: 0.05, set: 'stage', icon: '🔨' },
  { id: 'megaphone', name: 'Tiny Megaphone', tier: 3, stat: 'crit', per: 0.008, set: 'stage', icon: '📣' },
  { id: 'ring', name: 'Mood Ring', tier: 2, stat: 'crit', per: 0.006, set: 'cozy', icon: '💍' },
  { id: 'gourd', name: 'Beat Gourd', tier: 2, stat: 'coin', per: 0.04, set: 'snack', icon: '🪘' },
  { id: 'wheel', name: 'Wheel Speaker', tier: 1, stat: 'speed', per: 0.02, set: 'stage', icon: '🎡' },
  { id: 'scarf', name: 'Sparkle Scarf', tier: 1, stat: 'guard', per: 0.015, set: 'cozy', icon: '🧣' },
  { id: 'vest', name: 'Stage Vest', tier: 1, stat: 'vit', per: 12, set: 'cozy', icon: '🦺' },
  { id: 'stand', name: 'Mic Stand', tier: 1, stat: 'atk', per: 0.02, set: 'stage', icon: '🎙️' },
  { id: 'glove', name: 'Jazz Hands', tier: 1, stat: 'cdn', per: 0.01, set: '', icon: '🧤' },
  { id: 'clock', name: 'Tick Tock Turtle', tier: 1, stat: 'cdn', per: 0.012, set: 'snack', icon: '⏰' },
  { id: 'soap', name: 'Bubble Soap', tier: 0, stat: 'guard', per: 0.01, set: 'snack', icon: '🧼' },
  { id: 'milk', name: 'Oat Milk Carton', tier: 0, stat: 'vit', per: 8, set: 'snack', icon: '🥛' },
  { id: 'tea', name: 'Iced Tea', tier: 0, stat: 'coin', per: 0.02, set: '', icon: '🧋' },
  { id: 'jam', name: 'Berry Jam', tier: 0, stat: 'atk', per: 0.01, set: '', icon: '🫙' },
];
export const KEEP_SETS = [
  { id: 'stage', name: 'Showtime', stat: 'atk', val: 0.1 },
  { id: 'cozy', name: 'Cozy Dressing Room', stat: 'guard', val: 0.06 },
  { id: 'snack', name: 'Snack Table', stat: 'coin', val: 0.15 },
];
const KEEP = Object.fromEntries(KEEPSAKES.map(k => [k.id, k]));
export const keepMax = k => KEEP_TIERS[k.tier].max;
export const keepCost = (k, lv) => Math.round((lv === 0 ? 2 : 4 + 3 * lv) * (1 + 0.6 * k.tier));
export function keepUp(save, id) {
  const a = save.keeps[id], k = KEEP[id];
  if (!a || a.lv >= keepMax(k) || a.frag < keepCost(k, a.lv)) return false;
  a.frag -= keepCost(k, a.lv); a.lv++; return true;
}
export const keepCanUp = (save, id) => { const a = save.keeps[id], k = KEEP[id]; return !!a && a.lv < keepMax(k) && a.frag >= keepCost(k, a.lv); };
export const KEEP_PRICE = 80;   // Sparkles for one draw; the ten-draw is 10% cheaper
export function openKeepChest(save, n = 1, rand = Math.random) {
  const price = n === 10 ? KEEP_PRICE * 9 : KEEP_PRICE * n;
  if (save.sparkles < price) return null;
  save.sparkles -= price;
  const got = {}, W = [50, 30, 15, 5];
  for (let i = 0; i < n; i++) {
    let r = rand() * 100, t = 0; for (; t < 3; t++) { r -= W[t]; if (r <= 0) break; }
    const pool = KEEPSAKES.filter(k => k.tier === t), k = pool[Math.floor(rand() * pool.length)], c = 1 + Math.floor(rand() * 3);
    got[k.id] = (got[k.id] || 0) + c;
  }
  if (n === 10) { const k = KEEPSAKES.filter(q => q.tier >= 2)[Math.floor(rand() * 4)]; got[k.id] = (got[k.id] || 0) + 4; }
  for (const id of Object.keys(got)) save.keeps[id].frag += got[id];
  return Object.entries(got).map(([id, n2]) => ({ id, n: n2 })).sort((a, b) => b.n - a.n);
}
export function keepBonus(lvs) {   // lvs: id -> level
  const b = { atk: 0, vit: 0, coin: 0, guard: 0, crit: 0, cdn: 0, speed: 0 };
  for (const k of KEEPSAKES) b[k.stat] += k.per * ((lvs && lvs[k.id]) || 0);
  for (const set of KEEP_SETS) if (KEEPSAKES.filter(k => k.set === set.id).every(k => ((lvs && lvs[k.id]) || 0) > 0)) b[set.stat] += set.val;
  return b;
}
// Account level: every run teaches you something.
export const levelNeed = lv => Math.round(60 * Math.pow(lv, 1.35));
export function levelInfo(xp) { let lv = 1, left = xp; while (left >= levelNeed(lv)) { left -= levelNeed(lv); lv++; } return { lv, cur: left, need: levelNeed(lv) }; }
export const levelReward = lv => (lv % 10 === 0 ? { sparkles: 15 * (lv / 10) + 15 } : lv % 5 === 0 ? { sparkles: 10 } : null);
// Energy ("Voice"): a run costs 5, it comes back slowly, and the half-way chest gives some back.
export const ENERGY_MAX = 32, ENERGY_COST = 5, ENERGY_REGEN = 180, ENERGY_BACK = 10;
export function tickEnergy(save, now) {
  const e = save.energy; if (!e.t) e.t = now;
  if (e.n >= ENERGY_MAX) { e.t = now; return e.n; }
  const gain = Math.floor((now - e.t) / (ENERGY_REGEN * 1000));
  if (gain > 0) { e.n = Math.min(ENERGY_MAX, e.n + gain); e.t += gain * ENERGY_REGEN * 1000; if (e.n >= ENERGY_MAX) e.t = now; }
  return e.n;
}
export function spendEnergy(save, now, cost = ENERGY_COST) { if (tickEnergy(save, now) < cost) return false; if (save.energy.n >= ENERGY_MAX) save.energy.t = now; save.energy.n -= cost; return true; }
export const ENERGY_OVER_MAX = 99;   // rewards may push Voice past the cap; a loaded or imported save may not hold more than this
export const addEnergy = (save, n) => { save.energy.n += n; };   // rewards may push it past the cap
export function buyEnergy(save, now) { if (save.sparkles < 10) return false; save.sparkles -= 10; addEnergy(save, 10); return true; }
// Stage difficulty: Hard has much tougher cells and pays double.
export const HARD_HP = 2.4;
export const recPower = (stage, hard) => Math.round(160 * Math.pow(stage, 1.2) * (hard ? 2.2 : 1));
// Daily sign-in, seven days round and round.
export const SIGN_DAYS = [{ beats: 200 }, { eggs: 1 }, { sparkles: 10 }, { energy: 10 }, { beats: 500 }, { eggs: 1 }, { sparkles: 30 }];
export function claimSign(save, day) {
  if (save.sign.day === day) return null;
  const r = SIGN_DAYS[save.sign.n % 7]; save.sign.day = day; save.sign.n++;
  save.beats += r.beats || 0; save.sparkles += r.sparkles || 0; save.eggs += r.eggs || 0; addEnergy(save, r.energy || 0);
  return r;
}
// The backstage chest slowly fills with Beats while you are away (up to 8 hours).
export const idleRate = save => 40 + 12 * (save.cleared || 0);   // Beats per hour
export const idleAmount = (save, now) => Math.floor(idleRate(save) * Math.min(8, Math.max(0, (now - save.idle.t) / 3600000)));
export function claimIdle(save, now) { const n = idleAmount(save, now); if (n < 1) return 0; save.beats += n; save.idle.t = now; return n; }
// The Fan Club Fund: free rewards for stages you clear.
export const FUND = [3, 5, 8, 10, 15, 20, 25, 30, 40, 50].map((st, i) => ({ stage: st, reward: i % 3 === 0 ? { sparkles: 20 + 4 * i } : i % 3 === 1 ? { eggs: 1 } : { energy: 15 } }));
export const fundReady = (save, f) => save.cleared >= f.stage && !save.fund[f.stage];
export function claimFund(save, stage) {
  const f = FUND.find(x => x.stage === stage); if (!f || !fundReady(save, f)) return false;
  save.fund[stage] = 1; save.sparkles += f.reward.sparkles || 0; save.eggs += f.reward.eggs || 0; addEnergy(save, f.reward.energy || 0); return true;
}
// Fragment exchange: three of one skill become two of another.
export function exchangeFrags(save, from, to) {
  if (from === to || !save.skills[from] || !save.skills[to] || save.skills[from].frag < 3) return false;
  save.skills[from].frag -= 3; save.skills[to].frag += 2; return true;
}
// ---- wardrobe: outfits carry a perk for one animal. Ribbons (from stages and the seasonal event) pay for them.
export const OUTFITS = [
  { id: 'overalls', name: 'Farm Overalls', hat: '🌾', color: '#9dff6d', weapon: 'tower', mul: 1.2, price: 60 },
  { id: 'jacket', name: 'Sparkle Jacket', hat: '✨', color: '#ffe14a', weapon: 'dragon', mul: 1.2, price: 80 },
  { id: 'wig', name: 'Rainbow Wig', hat: '🌈', color: '#ff7eb6', weapon: 'swab', mul: 1.2, price: 80 },
  { id: 'tux', name: 'Soft Tux', hat: '🎩', color: '#9aa6c6', weapon: 'needles', mul: 1.2, price: 100 },
  { id: 'bloom', name: 'Blossom Dress', hat: '🌸', color: '#ffb3cf', weapon: 'daggers', mul: 1.3, price: 150, event: 'spring' },
  { id: 'sun', name: 'Sunny Shades', hat: '🕶️', color: '#ffb04d', weapon: 'bubble', mul: 1.3, price: 150, event: 'summer' },
  { id: 'pumpkin', name: 'Pumpkin Hat', hat: '🎃', color: '#ff9a2e', weapon: 'maw', mul: 1.3, price: 150, event: 'autumn' },
  { id: 'snow', name: 'Snow Scarf', hat: '⛄', color: '#bfe9ff', weapon: 'satellite', mul: 1.3, price: 150, event: 'winter' },
];
const OUTFIT = Object.fromEntries(OUTFITS.map(o => [o.id, o]));
export const EVENT_THEMES = {
  spring: { id: 'spring', name: 'Blossom Bash', blurb: 'Petals, picnics and plant-based cupcakes.' },
  summer: { id: 'summer', name: 'Sunny Fair', blurb: 'Lemonade stands and beach beats.' },
  autumn: { id: 'autumn', name: 'Harvest Hootenanny', blurb: 'Pumpkins, hay bales and barn dancing.' },
  winter: { id: 'winter', name: 'Snowy Sing-Along', blurb: 'Warm soup, cold snow, loud carols.' },
};
export function eventInfo(day) {
  const d = new Date(day * 86400000), m = d.getUTCMonth(), theme = EVENT_THEMES[['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][m]];
  const end = Date.UTC(d.getUTCFullYear(), m + 1, 1) / 86400000;
  return { ...theme, key: d.getUTCFullYear() * 12 + m, daysLeft: Math.max(0, Math.ceil(end - day)) };
}
export const EVENT_MILES = [{ at: 30, reward: { eggs: 1 } }, { at: 80, reward: { sparkles: 40 } }, { at: 160, reward: { energy: 20 } }, { at: 300, reward: { outfit: 1 } }];
export function ensureEvent(save, day) { const k = eventInfo(day).key; if (save.event.key !== k) save.event = { key: k, earned: 0, claimed: {} }; }
export function addRibbons(save, n) { save.ribbons += n; save.event.earned += n; }
export function claimEventMile(save, i, day) {
  ensureEvent(save, day); const m = EVENT_MILES[i];
  if (!m || save.event.claimed[i] || save.event.earned < m.at) return false;
  save.event.claimed[i] = 1; const r = m.reward;
  save.eggs += r.eggs || 0; save.sparkles += r.sparkles || 0; addEnergy(save, r.energy || 0);
  if (r.outfit) { const o = OUTFITS.find(x => x.event === eventInfo(day).id); if (o) save.outfits.owned[o.id] = 1; }
  return true;
}
export const outfitAvailable = (o, day) => !o.event || o.event === eventInfo(day).id;
export function buyOutfit(save, id, day) {
  const o = OUTFIT[id]; if (!o || save.outfits.owned[id] || !outfitAvailable(o, day) || save.ribbons < o.price) return false;
  save.ribbons -= o.price; save.outfits.owned[id] = 1; return true;
}
export function wearOutfit(save, id) { if (id && !save.outfits.owned[id]) return false; save.outfits.worn = id || ''; return true; }
// ---- the Giant Serpent Gig: a boss instance twice a day
export const INV_NAME = 'Giant Serpent Gig';
export const invStage = save => Math.max(5, Math.ceil((save.cleared || 0) / 5) * 5);
export function useInvAttempt(save, day) { dayLogin(save, day); if (save.inv.left < 1) return false; save.inv.left--; return true; }
// ---- the Monthly Pass: a little gift every day for 30 days
export const CARD_PRICE = 300;
export function buyCard(save, day) { if (save.sparkles < CARD_PRICE) return false; save.sparkles -= CARD_PRICE; save.card.until = Math.max(save.card.until, day) + 30; return true; }
export const cardActive = (save, day) => save.card.until > day;
export function claimCard(save, day) { if (!cardActive(save, day) || save.card.last === day) return false; save.card.last = day; save.sparkles += 10; addEnergy(save, 5); return true; }
// ---- Limit Shop (weekly stock, Beats) and Exchange Shop (Ribbons)
export const LIMIT_ITEMS = [
  { id: 'egg', name: 'Pet Egg', price: 2500, limit: 2 },
  { id: 'voice', name: 'Voice ×20', price: 800, limit: 3 },
  { id: 'frags', name: 'Skill fragments ×6', price: 1500, limit: 2 },
];
export function buyLimit(save, id, day) {
  const it = LIMIT_ITEMS.find(x => x.id === id), wk = Math.floor(day / 7); if (!it) return false;
  if (save.shop.limit.week !== wk) save.shop.limit = { week: wk, bought: {} };
  if ((save.shop.limit.bought[id] || 0) >= it.limit || save.beats < it.price) return false;
  save.beats -= it.price; save.shop.limit.bought[id] = (save.shop.limit.bought[id] || 0) + 1;
  if (id === 'egg') save.eggs++; else if (id === 'voice') addEnergy(save, 20); else for (let i = 0; i < 6; i++) save.skills[WEAPONS[i % 5].id].frag++;
  return true;
}
export const EXCHANGE_ITEMS = [
  { id: 'egg', name: 'Pet Egg', price: 20 }, { id: 'sparkles', name: 'Sparkles ×20', price: 12 }, { id: 'voice', name: 'Voice ×10', price: 8 }, { id: 'keep', name: 'Keepsake fragments ×4', price: 25 },
];
export function buyExchange(save, id) {
  const it = EXCHANGE_ITEMS.find(x => x.id === id); if (!it || save.ribbons < it.price) return false;
  save.ribbons -= it.price;
  if (id === 'egg') save.eggs++; else if (id === 'sparkles') save.sparkles += 20; else if (id === 'voice') addEnergy(save, 10); else for (let i = 0; i < 4; i++) save.keeps[KEEPSAKES[i * 3 % KEEPSAKES.length].id].frag++;
  return true;
}
// Weapon exchange: spend Sparkles to skip the fragment grind on a skill whose stage you have cleared.
export const WEAPON_EXCHANGE_PRICE = 100;
export function weaponExchange(save, id) {
  const w = WEAPON[id], k = save.skills[id];
  if (!w || !k || k.lv > 0 || (save.cleared || 0) < (w.stage || 0) || save.sparkles < WEAPON_EXCHANGE_PRICE) return false;
  save.sparkles -= WEAPON_EXCHANGE_PRICE; k.lv = 1; if (save.loadout.length < LOADOUT_SIZE) save.loadout.push(id); return true;
}
// ---- trophies
export const TROPHIES = [
  { id: 'k100', name: 'Pop 100 cells', at: 100, get: s => s.kills, reward: { sparkles: 5 } },
  { id: 'k1000', name: 'Pop 1000 cells', at: 1000, get: s => s.kills, reward: { sparkles: 25 } },
  { id: 'k5000', name: 'Pop 5000 cells', at: 5000, get: s => s.kills, reward: { sparkles: 60 } },
  { id: 's5', name: 'Clear 5 stages', at: 5, get: s => s.cleared, reward: { eggs: 1 } },
  { id: 's15', name: 'Clear 15 stages', at: 15, get: s => s.cleared, reward: { sparkles: 40 } },
  { id: 's30', name: 'Clear 30 stages', at: 30, get: s => s.cleared, reward: { sparkles: 80 } },
  { id: 'r10', name: 'Play 10 runs', at: 10, get: s => s.runs, reward: { sparkles: 10 } },
  { id: 'r50', name: 'Play 50 runs', at: 50, get: s => s.runs, reward: { sparkles: 30 } },
  { id: 'p3', name: 'Befriend 3 pets', at: 3, get: s => Object.values(s.pets).filter(p => p.star > 0).length, reward: { eggs: 1 } },
  { id: 'p6', name: 'Befriend every pet', at: 6, get: s => Object.values(s.pets).filter(p => p.star > 0).length, reward: { sparkles: 50 } },
  { id: 'g5', name: 'Collect 5 keepsakes', at: 5, get: s => Object.values(s.keeps).filter(k => k.lv > 0).length, reward: { sparkles: 15 } },
  { id: 'h5', name: 'Clear 5 stages on Hard', at: 5, get: s => s.hardCleared, reward: { sparkles: 40 } },
  { id: 'l10', name: 'Reach level 10', at: 10, get: s => levelInfo(s.xp).lv, reward: { eggs: 2 } },
];
export const trophyReady = (save, t) => !save.trophies[t.id] && t.get(save) >= t.at;
export function claimTrophy(save, id) { const t = TROPHIES.find(x => x.id === id); if (!t || !trophyReady(save, t)) return false; save.trophies[id] = 1; save.sparkles += t.reward.sparkles || 0; save.eggs += t.reward.eggs || 0; return true; }
// Rarity of an upgrade choice. Every pick raises your luck, so better rarities slowly become likelier;
// one of the three cards is always common.
export const RARITIES = [
  { id: 'common', name: 'Common', color: '#cfd8e8' },
  { id: 'rare', name: 'Rare', color: '#4fb8ff' },
  { id: 'epic', name: 'Epic', color: '#b06cff' },
  { id: 'legendary', name: 'Legendary', color: '#ffb04d' },
  { id: 'mythic', name: 'Mythic', color: '#ff4d7a' },
  { id: 'godlike', name: 'Godlike', color: '#ffe14a' },
];
const RARITY_BASE = [100, 32, 11, 3.2, 1, 0.3];
// b15: the rarity of an upgrade card tells how much flat DPS it adds (see dpsGain). The roll still decides the size of the bonus;
// the flat DPS then names the tier. Faster Tempo is the yardstick: +8 common, +12 rare, +18 epic, +26 legendary, +38 mythic, +55 godlike.
export const DPS_BANDS = [9.5, 15, 22, 32, 46];
export const dpsRarity = d => { let r = 0; while (r < DPS_BANDS.length && d >= DPS_BANDS[r]) r++; return r; };
export const LUCK_MAX = 30;
export const rarityWeights = luck => RARITY_BASE.map((w, t) => w * Math.exp(0.03 * t * Math.min(LUCK_MAX, Math.max(0, luck))));
export function rollRarity(rand, luck) {
  const w = rarityWeights(luck); let r = rand() * w.reduce((x, y) => x + y, 0);
  for (let t = 0; t < w.length; t++) { r -= w[t]; if (r <= 0) return t; }
  return 0;
}
// The capsule is the cell's own gun; its upgrades are the first thing you are offered.
// vals[rarity] is what one pick adds; cap is the most a run can stack.
export const CAPSULE_UPS = [
  { id: 'aspd', name: 'Faster Tempo', max: 12, w: 1.2, vals: [8, 12, 18, 26, 38, 55], cap: 300, fmt: v => '+' + v + '% attack speed', desc: '+15% attack speed' },
  { id: 'notes', name: 'Harmony', max: 5, w: 1.0, min: 1, minStage: 3, vals: [1, 1, 1, 2, 2, 3], cap: 5, fmt: v => '+' + v + ' note' + (v > 1 ? 's' : '') + ' per shot', desc: '+1 note per shot, side by side' },
  { id: 'burst', name: 'Echo', max: 3, w: 0.9, min: 2, minStage: 6, vals: [1, 1, 1, 2, 2, 2], cap: 3, fmt: v => '+' + v + ' burst' + (v > 1 ? 's' : '') + ' per shot', desc: '+1 burst per shot, a quick echo of the notes' },
  { id: 'cdmg', name: 'Volume Up', max: 12, w: 1.2, vals: [12, 18, 28, 42, 65, 100], cap: 600, fmt: v => '+' + v + '% capsule damage', desc: '+30% capsule damage' },
];
export const PASSIVES = [
  { id: 'power', name: 'Loud Vocals', max: 8, w: 0.9, vals: [8, 12, 18, 28, 42, 65], cap: 300, fmt: v => '+' + v + '% damage for every skill', desc: '+20% damage for every skill', apply: () => {} },
  { id: 'haste', name: 'Tempo Up', max: 8, w: 0.9, vals: [5, 7, 10, 15, 20, 28], cap: 50, fmt: v => 'Every skill recharges ' + v + '% faster', desc: 'Every skill recharges 10% faster', apply: () => {} },
  { id: 'crit', name: 'Perfect Pitch', max: 8, w: 0.7, vals: [3, 4, 6, 9, 13, 18], cap: 40, fmt: v => '+' + v + '% crit chance', desc: '+8% crit chance for the capsule and needles', apply: (p, v) => { p.crit += v / 100; } },
  { id: 'vital', name: 'Calm Down', max: 8, w: 0.7, vals: [20, 30, 45, 70, 100, 150], cap: 200, fmt: v => 'The snake crawls ' + Math.round(v / 4) + '% slower', desc: 'The snake crawls 5% slower', apply: (p, v) => { p.slow = Math.min(0.5, p.slow + v / 400); } },
  { id: 'guard', name: 'Door Stopper', max: 6, w: 0.6, vals: [15, 22, 30, 40, 50, 60], cap: 600, fmt: v => 'Pushes the snake back ' + v * 6 + ' px', desc: 'Pushes the snake back 90 px', apply: (p, v, g) => { if (g) knockBack(g, v * 6); } },
  { id: 'enc', name: 'Standing Ovation', max: 4, w: 0.6, min: 1, minStage: 4, vals: [12, 16, 22, 30, 40, 50], cap: 120, fmt: v => 'Encore charges ' + v + '% faster and its beam is ' + Math.round(v / 2) + '% wider', desc: 'The Encore charges 15% faster, with a wider beam', apply: () => {} },
  { id: 'dbeat', name: 'Downbeat', max: 4, w: 0.6, min: 1, minStage: 5, vals: [20, 30, 45, 65, 90, 120], cap: 300, fmt: v => 'Notes fired on the beat hit ' + v + '% harder', desc: 'Notes fired on the beat hit 25% harder', apply: () => {} },
  { id: 'fork', name: 'Tuning Fork', max: 4, w: 0.55, min: 1, minStage: 10, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'Ward cells shield ' + v + '% less and lullabies last ' + v + '% longer', desc: 'Ward cells shield 25% less, lullabies last 25% longer', apply: () => {} },
  { id: 'gear', name: 'Golden Ear', max: 4, w: 0.55, min: 1, minStage: 6, vals: [30, 60, 100, 150], cap: 150, fmt: v => 'Gold cells stay ' + v + '% longer and pay ' + Math.round(v / 2) + '% more', desc: 'Gold cells stay 30% longer and pay 15% more', apply: () => {} },
  { id: 'harm', name: 'Four-Part Harmony', max: 4, w: 0.55, min: 1, minStage: 22, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'Quartet cells stay linked ' + Math.round(v / 2) + '% longer and pay ' + v + '% more', desc: 'Quartet cells stay linked 12% longer and pay 25% more', apply: () => {} },
  { id: 'chk', name: 'Soundcheck', max: 4, w: 0.5, min: 1, minStage: 16, vals: [8, 12, 18, 25], cap: 25, fmt: v => 'Popping a ward, lullaby or drummer cell fills ' + v + '% of the Encore', desc: 'Popping a ward, lullaby or drummer cell fills 8% of the Encore', apply: () => {} },
  { id: 'cres', name: 'Crescendo', max: 4, w: 0.5, min: 1, minStage: 26, vals: [4, 6, 8, 10], cap: 10, fmt: v => 'Each Quartet in a row makes your notes hit ' + v + '% harder (up to 5 in a row)', desc: 'Each Quartet in a row makes your notes hit 4% harder, up to 5 in a row', apply: () => {} },
  { id: 'fan', name: 'Fan Club', max: 4, w: 0.5, min: 1, minStage: 20, vals: [20, 35, 50, 75], cap: 75, fmt: v => 'Groove is worth ' + v + '% more damage per point', desc: 'Groove is worth 20% more damage per point', apply: () => {} },
  { id: 'brg', name: 'Bridge', max: 4, w: 0.5, min: 1, minStage: 34, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'Bell cells ring ' + v + '% harder and each ring adds 3 Groove with Fan Club', desc: 'Bell cells ring 25% harder', apply: () => {} },
  { id: 'brk', name: 'Ice Breaker', skin: 'frosty', max: 4, w: 0.6, min: 1, minStage: 22, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'Frost patches shield ' + v + '% less', desc: 'Frost patches shield 25% less', apply: () => {} },
  { id: 'hbk', name: 'Heart Mender', skin: 'love', max: 4, w: 0.6, min: 1, minStage: 22, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'Heart pulses heal ' + v + '% less', desc: 'Heart pulses heal 25% less', apply: () => {} },
  { id: 'oil', name: 'Oil Can', skin: 'rust', max: 4, w: 0.6, min: 1, minStage: 22, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'Creaky lurches are ' + v + '% gentler', desc: 'Creaky lurches are 25% gentler', apply: () => {} },
  { id: 'swt', name: 'Sweet Tooth', skin: 'sour', max: 4, w: 0.6, min: 1, minStage: 22, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'Pop rushes are ' + v + '% weaker', desc: 'Pop rushes are 25% weaker', apply: () => {} },
  { id: 'hwd', name: 'Heart Ward', skin: 'love', max: 4, w: 0.6, min: 1, minStage: 41, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'Sweetheart wards last ' + v + '% shorter', desc: 'Sweetheart wards last 25% shorter', apply: () => {} },
  { id: 'hny', name: 'Honey Jar', skin: 'mighty', max: 4, w: 0.6, min: 1, minStage: 22, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'Iron Hide shrugs off slows ' + v + '% less', desc: 'Iron Hide shrugs off slows 25% less', apply: () => {} },
  { id: 'tis', name: 'Tissue Box', skin: 'sneezy', max: 4, w: 0.6, min: 1, minStage: 22, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'Sneeze jolts are ' + v + '% shorter', desc: 'Sneeze jolts are 25% shorter', apply: () => {} },
  { id: 'mir', name: 'Pocket Mirror', reg: true, max: 4, w: 0.6, min: 1, minStage: 36, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'Mirror cells glance ' + v + '% less', desc: 'Mirror cells glance 25% less', apply: () => {} },
  { id: 'tea', name: 'Chamomile Tea', skin: 'grumpy', max: 4, w: 0.6, min: 1, minStage: 22, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'Quick surges are ' + v + '% calmer', desc: 'Quick surges are 25% calmer', apply: () => {} },
  { id: 'muf', name: 'Ear Muffs', skin: 'disco', max: 4, w: 0.6, min: 1, minStage: 22, vals: [25, 50, 75, 100], cap: 100, fmt: v => 'The disco swing is ' + v + '% smaller', desc: 'The disco swing is 25% smaller', apply: () => {} },
  { id: 'speed', name: 'Sharp Notes', max: 4, w: 0.8, min: 1, minStage: 4, vals: [1, 1, 2, 2, 3, 3], cap: 5, fmt: v => 'Your notes pierce ' + v + ' more cell' + (v > 1 ? 's' : ''), desc: 'Your notes pierce 1 more cell', apply: () => {} },
];
const PASSIVE = Object.fromEntries(PASSIVES.map(u => [u.id, u]));
const CAP_UP = Object.fromEntries(CAPSULE_UPS.map(u => [u.id, u]));

// ---------------------------------------------------------------- meta: two currencies, stats, skills, loot boxes
// Beats (gold music-note coins) come from cells and clears. Sparkles (pink star gems) come from
// clearing a stage for the first time. Fragments come from chest cells and loot boxes.
export const META = [
  { id: 'atk', name: 'Volume', max: 15, base: 80, grow: 1.66, desc: l => `+${10 * l}% damage` },
  { id: 'crt', name: 'Pitch', max: 13, base: 80, grow: 1.66, desc: l => `+${2 * l}% crit chance, +${8 * l}% crit damage` },
  { id: 'cdn', name: 'Tempo', max: 12, base: 80, grow: 1.66, desc: l => `-${5 * l}% cooldowns` },
  { id: 'vit', name: 'Stamina', max: 13, base: 70, grow: 1.66, desc: l => `The snake crawls ${2 * l}% slower` },
  { id: 'for', name: 'Fame', max: 13, base: 110, grow: 1.69, desc: l => `+${10 * l}% Beats` },
  { id: 'rev', name: 'Encore', max: 1, base: 400, grow: 1, desc: () => 'Get back up once per run' },
];
export const metaCost = (def, lvl) => Math.round(def.base * Math.pow(def.grow, lvl));
// b12q: stat levels are gated by progress: cap = 2 + cleared stages / 2 (the single level Encore is not gated).
// The cap only blocks further buying: a save above it keeps every level it owns.
export const statCap = save => 2 + Math.floor(((save && save.cleared) || 0) / 2);
export const statCapStage = lvl => Math.max(0, (lvl - 2) * 2);   // stages to clear before level `lvl` can be owned
export const metaBuyable = (save, d) => { const l = (save.meta && save.meta[d.id]) || 0; return l < d.max && (d.max === 1 || l < statCap(save)); };
export const SKILL_MAX_LV = 10;
export const skillMul = lv => 1 + 0.12 * (Math.max(1, lv) - 1);          // permanent skill level -> damage
export const skillUpgradeCost = lv => ({ frag: 4 + 3 * lv, beats: 0 });   // lv -> lv + 1, fragments only
export const BOXES = [
  { id: 'beat', name: 'Beat Box', cur: 'beats', price: 150, frags: 5, feature: 0, desc: '5 skill fragments' },
  { id: 'spark', name: 'Spark Box', cur: 'sparkles', price: 30, frags: 12, feature: 0, desc: 'A little sparkle of fragments' },
  { id: 'spark10', name: 'Grand Spark Box', cur: 'sparkles', price: 270, frags: 150, feature: 45, top: true, desc: 'Ten boxes in one, with a star prize' },
];

export function defaultSave() {
  const skills = {};
  for (const w of WEAPONS) skills[w.id] = { lv: w.frag ? 0 : 1, frag: 0 };
  const pets = {}; for (const p of PETS) pets[p.id] = { star: 0, frag: 0, joy: 0 };
  return { v: 8, unlocked: defaultUnlocked(), loadout: [...WEAPON_STARTERS], pets, petEquip: [], presets: [[], [], []], prog: {}, stars: {}, streak: { last: 0, n: 0 }, last: { stage: 1, hard: false }, settings: { music: true, vibrate: true, reduceMotion: false, reduceFlash: false, lowQuality: false, bigNumbers: false, colorBlind: false, highContrast: false, bigText: false, slider: false, leftHand: false, pauseGuard: false, bigTap: false, reviveTimer: true, volume: 1, thumbZone: false, aimAssist: false, textScale: 1, beatTick: false, pump: 2, fullscreen: true, controlStyle: 'follow' }, ribbons: 0, outfits: { owned: {}, worn: '' }, event: { key: 0, earned: 0, claimed: {} }, inv: { day: 0, left: 2, best: 0 }, card: { until: 0, last: 0 }, trophies: {}, hardCleared: 0, xp: 0, energy: { n: ENERGY_MAX, t: 0 }, keeps: Object.fromEntries(KEEPSAKES.map(k => [k.id, { lv: 0, frag: 0 }])), sign: { day: 0, n: 0 }, idle: { t: 0 }, fund: {}, shop: { welcome: 0, day: 0, refresh: 0, bought: {}, free: 0, gift: 0, xp: 0, gold: 0, limit: { week: 0, bought: {} } }, eggs: 1, login: 0, pig: { day: 0, left: 3, best: 0 }, beats: 0, sparkles: 0, meta: {}, plat: { atk: 0, crt: 0, vit: 0, for: 0 }, wall: { plaques: {} }, skills, daily: { day: 0, progress: {}, claimed: {} }, cleared: 0, best: 0, runs: 0, kills: 0, muted: false, addict: addictDefault() };
}
export function sanitizeSave(raw) {
  const s = defaultSave();
  if (!raw || typeof raw !== 'object') return s;
  const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  s.beats = Math.min(1e12, num(raw.beats ?? raw.coins)); s.sparkles = Math.min(1e12, num(raw.sparkles));   // QA r10: absurd values showed as 1e+300 in the pills
  s.cleared = Math.min(MAX_STAGE, num(raw.cleared)); s.best = Math.min(MAX_STAGE, Math.max(s.cleared, num(raw.best))); s.runs = num(raw.runs); s.kills = num(raw.kills);
  s.muted = !!raw.muted;
  if (raw.daily && typeof raw.daily === 'object') { s.daily.day = num(raw.daily.day); for (const k of Object.keys(raw.daily.progress || {})) s.daily.progress[k] = num(raw.daily.progress[k]); for (const k of Object.keys(raw.daily.claimed || {})) if (raw.daily.claimed[k]) s.daily.claimed[k] = 1; }
  for (const d of META) s.meta[d.id] = Math.min(d.max, num(raw.meta && raw.meta[d.id]));
  if (raw.wall && raw.wall.plaques && typeof raw.wall.plaques === 'object') for (const k of Object.keys(raw.wall.plaques)) if (/^[a-z]{3}$/.test(k) && raw.wall.plaques[k]) s.wall.plaques[k] = 1;   // b13d Gold Wall (wall_b13d.js)
  for (const k of Object.keys(s.plat)) s.plat[k] = Math.min(10, num(raw.plat && raw.plat[k]));   // b12 Gold Records (plat_b12d.js): ranks beyond a maxed stat
  for (const w of WEAPONS) {
    const r = raw.skills && raw.skills[w.id];
    if (r) { s.skills[w.id].lv = Math.min(SKILL_MAX_LV, num(r.lv, s.skills[w.id].lv)); s.skills[w.id].frag = num(r.frag); }
    if (!w.frag) s.skills[w.id].lv = Math.max(1, s.skills[w.id].lv);
  }
  for (const p of PETS) { const r = raw.pets && raw.pets[p.id]; if (r) { s.pets[p.id].star = Math.min(PET_MAX_STAR, num(r.star)); s.pets[p.id].frag = num(r.frag); s.pets[p.id].joy = Math.min(PET_JOY_MAX, num(r.joy)); } }
  if (Array.isArray(raw.petEquip)) s.petEquip = raw.petEquip.filter((id, i, a) => PET[id] && s.pets[id].star > 0 && a.indexOf(id) === i).slice(0, PET_SLOTS);
  if (raw.eggs !== undefined) s.eggs = num(raw.eggs); else if (raw.runs) s.eggs = 1;
  s.ribbons = num(raw.ribbons);
  if (raw.stars && typeof raw.stars === 'object') for (const k of Object.keys(raw.stars)) if (/^\d+$/.test(k)) s.stars[k] = Math.min(3, num(raw.stars[k]));
  if (raw.streak && typeof raw.streak === 'object') s.streak = { last: num(raw.streak.last), n: num(raw.streak.n) };
  if (raw.last && typeof raw.last === 'object') s.last = { stage: Math.max(1, Math.min(50, num(raw.last.stage, 1))), hard: !!raw.last.hard };
  if (raw.settings && typeof raw.settings === 'object') for (const k of Object.keys(s.settings)) if (k === 'textScale') { if (typeof raw.settings[k] === 'number' && isFinite(raw.settings[k])) s.settings.textScale = Math.max(1, Math.min(1.4, raw.settings[k])); } else if (k === 'pump') { if (raw.settings[k] === 0 || raw.settings[k] === 1 || raw.settings[k] === 2) s.settings.pump = raw.settings[k]; } else if (k === 'controlStyle') { if (raw.settings[k] === 'follow' || raw.settings[k] === 'joystick') s.settings.controlStyle = raw.settings[k]; } else if (k === 'volume') { if (typeof raw.settings[k] === 'number' && isFinite(raw.settings[k])) s.settings.volume = Math.max(0, Math.min(1, raw.settings[k])); } else if (typeof raw.settings[k] === 'boolean') s.settings[k] = raw.settings[k];
  if (raw.outfits && typeof raw.outfits === 'object') { for (const o of OUTFITS) if (raw.outfits.owned && raw.outfits.owned[o.id]) s.outfits.owned[o.id] = 1; if (OUTFIT[raw.outfits.worn] && s.outfits.owned[raw.outfits.worn]) s.outfits.worn = raw.outfits.worn; }
  if (raw.event && typeof raw.event === 'object') { s.event = { key: num(raw.event.key), earned: num(raw.event.earned), claimed: {} }; for (const k of Object.keys(raw.event.claimed || {})) if (raw.event.claimed[k]) s.event.claimed[k] = 1; }
  if (raw.inv && typeof raw.inv === 'object') s.inv = { day: num(raw.inv.day), left: Math.min(2, num(raw.inv.left, 2)), best: num(raw.inv.best) };
  if (raw.card && typeof raw.card === 'object') s.card = { until: num(raw.card.until), last: num(raw.card.last) };
  if (raw.trophies && typeof raw.trophies === 'object') for (const t of TROPHIES) if (raw.trophies[t.id]) s.trophies[t.id] = 1;
  s.login = num(raw.login); s.hardCleared = Math.min(s.cleared, num(raw.hardCleared)); s.xp = Math.min(1e10, num(raw.xp));   // QA r10: levelInfo loops once per level, so a huge xp froze the page at load
  if (raw.energy && typeof raw.energy === 'object') s.energy = { n: Math.max(0, Math.min(ENERGY_OVER_MAX, num(raw.energy.n, ENERGY_MAX))), t: num(raw.energy.t) };
  for (const k of KEEPSAKES) { const r = raw.keeps && raw.keeps[k.id]; if (r) { s.keeps[k.id].lv = Math.min(keepMax(k), num(r.lv)); s.keeps[k.id].frag = num(r.frag); } }
  if (raw.sign && typeof raw.sign === 'object') s.sign = { day: num(raw.sign.day), n: num(raw.sign.n) };
  if (raw.idle && typeof raw.idle === 'object') s.idle = { t: num(raw.idle.t) };
  if (raw.fund && typeof raw.fund === 'object') for (const f of FUND) if (raw.fund[f.stage]) s.fund[f.stage] = 1;
  if (raw.shop && typeof raw.shop === 'object') { const sh = raw.shop; s.shop = { welcome: sh.welcome ? 1 : 0, day: num(sh.day), refresh: num(sh.refresh), free: num(sh.free), gift: num(sh.gift), xp: num(sh.xp), gold: num(sh.gold), bought: {}, limit: { week: num(sh.limit && sh.limit.week), bought: {} } }; if (sh.limit && sh.limit.bought) for (const k of Object.keys(sh.limit.bought)) s.shop.limit.bought[k] = num(sh.limit.bought[k]); for (const k of Object.keys(sh.bought || {})) if (sh.bought[k]) s.shop.bought[k] = 1; }
  if (raw.prog && typeof raw.prog === 'object') for (const k of Object.keys(raw.prog)) if (/^h?\d+$/.test(k)) s.prog[k] = Math.min(100, num(raw.prog[k]));
  if (raw.pig && typeof raw.pig === 'object') s.pig = { day: num(raw.pig.day), left: Math.min(3, num(raw.pig.left, 3)), best: num(raw.pig.best) };
  s.addict = sanitizeAddict(raw.addict);
  s.unlocked = sanitizeUnlocked(raw.unlocked);   // b12p: a save without the field is an old account and keeps every tab
  if (raw.treats && typeof raw.treats === 'object' && !Array.isArray(raw.treats)) { const tn = {}; for (const p of PETS) tn[p.id] = Math.min(9, num(raw.treats.n && raw.treats.n[p.id])); s.treats = { day: num(raw.treats.day), n: tn }; }   // round 10: treats given today, see pets_b10.js
  if (raw.petNames && typeof raw.petNames === 'object' && !Array.isArray(raw.petNames)) { const pn = {}; for (const p of PETS) { const v = raw.petNames[p.id]; const n = typeof v === 'string' ? v.replace(/[^\w \-!+&.]/g, '').trim().slice(0, 10) : ''; if (n) pn[p.id] = n; } s.petNames = pn; }
  if (Array.isArray(raw.presetNames)) s.presetNames = [0, 1, 2].map(i => typeof raw.presetNames[i] === 'string' ? raw.presetNames[i].replace(/[^\w \-!+&.]/g, '').trim().slice(0, 8) : '');
  if (Array.isArray(raw.presets)) s.presets = [0, 1, 2].map(i => Array.isArray(raw.presets[i]) ? raw.presets[i].filter((id, j, a) => WEAPON[id] && a.indexOf(id) === j).slice(0, LOADOUT_SIZE) : []);
  const lo = Array.isArray(raw.loadout) ? raw.loadout.filter((id, i, a) => WEAPON[id] && s.skills[id].lv > 0 && a.indexOf(id) === i).slice(0, LOADOUT_SIZE) : [];
  if (lo.length) s.loadout = lo; else if (Array.isArray(raw.loadout)) s.loadout = [...WEAPON_STARTERS].filter(id => s.skills[id].lv > 0).slice(0, LOADOUT_SIZE);
  return s;
}
// One big number for how strong the account is.
export function power(save) {
  const sum = o => Object.values(o).reduce((a, x) => a + x, 0);
  return Math.round(100 + 60 * sum(save.meta) + 45 * Object.values(save.skills).reduce((a, k) => a + k.lv, 0) + 80 * Object.values(save.pets).reduce((a, k) => a + k.star, 0) + 35 * Object.values(save.keeps).reduce((a, k) => a + k.lv, 0) + 20 * levelInfo(save.xp).lv + 40 * Object.keys(save.outfits.owned).length);
}
export function buyMeta(save, id) {
  const d = META.find(m => m.id === id);
  if (!d) return false;
  const lvl = save.meta[id] || 0;
  if (lvl >= d.max) return false;
  if (!metaBuyable(save, d)) return false;
  const c = metaCost(d, lvl);
  if (save.beats < c) return false;
  save.beats -= c; save.meta[id] = lvl + 1;
  return true;
}
// Equip or unequip a skill for the next runs (at most five, all owned).
export function toggleLoadout(save, id) {
  const k = save.skills[id];
  if (!k || k.lv < 1) return false;
  const i = save.loadout.indexOf(id);
  if (i >= 0) { if (save.loadout.length <= 1) return false; save.loadout.splice(i, 1); return true; }
  if (save.loadout.length >= LOADOUT_SIZE) return false;
  save.loadout.push(id); return true;
}
export function togglePet(save, id) {
  if (!PET[id] || !save.pets[id] || save.pets[id].star < 1) return false;
  const i = save.petEquip.indexOf(id);
  if (i >= 0) { save.petEquip.splice(i, 1); return true; }
  if (save.petEquip.length >= PET_SLOTS) save.petEquip.shift();
  save.petEquip.push(id); return true;
}
export function petUp(save, id) {   // own the pet, or add a star
  const k = save.pets[id];
  if (!k || k.star >= PET_MAX_STAR || k.frag < petCost(k.star)) return false;
  k.frag -= petCost(k.star); k.star++;
  if (k.star === 1 && save.petEquip.length < PET_SLOTS) save.petEquip.push(id);
  return true;
}
export const petCanUp = (save, id) => { const k = save.pets[id]; return !!k && k.star < PET_MAX_STAR && k.frag >= petCost(k.star); };
// Hatching an egg: usually a few pet fragments (unowned pets a bit likelier), sometimes just Beats.
export function hatchEgg(save, rand = Math.random) {
  if (save.eggs < 1) return null;
  save.eggs--;
  if (rand() < 0.3) { const beats = 20 + Math.floor(rand() * 40); save.beats += beats; return { beats }; }
  const pool = PETS.map(p => ({ id: p.id, w: save.pets[p.id].star ? 1 : 1.6 }));
  let r = rand() * pool.reduce((a, p) => a + p.w, 0), k = 0;
  for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
  const n = 1 + Math.floor(rand() * 3), id = pool[k].id;
  save.pets[id].frag += n;
  return { id, n };
}
export const EGG_PRICE = 60;   // Sparkles
export function buyEgg(save) { if (save.sparkles < EGG_PRICE) return false; save.sparkles -= EGG_PRICE; save.eggs++; return true; }
export function petBonus(pets) {   // permanent, whether the pet is equipped or not
  const b = { atk: 0, vit: 0, coin: 0, guard: 0, crit: 0, cdn: 0 };
  for (const p of PETS) { const st = (pets && pets[p.id]) || 0; b[p.stat] += p.per * st; }
  return b;
}
// A fresh day gives a fresh egg and fresh Piggy Bank attempts.
export function dayLogin(save, day) {
  let fresh = false;
  if (save.login !== day) { save.login = day; save.eggs++; fresh = true; save.streak = { last: day, n: (save.streak.last === day - 1 ? save.streak.n : 0) + 1 }; save.beats += 40 * Math.min(7, save.streak.n); }
  ensureEvent(save, day); if (!save.inv || save.inv.day !== day) save.inv = { day, left: 2, best: (save.inv && save.inv.best) || 0 };
  if (save.shop.day !== day) save.shop = { ...save.shop, day, refresh: 0, bought: {}, free: 0 };
  if (!save.pig || save.pig.day !== day) save.pig = { day, left: 3, best: (save.pig && save.pig.best) || 0 };
  return fresh;
}
export const pigTier = save => (save.pig ? save.pig.best : 0) + 1;
export function usePigAttempt(save, day) { dayLogin(save, day); if (save.pig.left < 1) return false; save.pig.left--; return true; }
export function unlockSkill(save, id) {
  const w = WEAPON[id], k = save.skills[id];
  if (!w || !k || k.lv > 0 || k.frag < w.frag || (save.cleared || 0) < (w.stage || 0)) return false;
  k.frag -= w.frag; k.lv = 1;
  if (save.loadout.length < LOADOUT_SIZE && !save.loadout.includes(id)) save.loadout.push(id);
  return true;
}
export function levelSkill(save, id) {
  const k = save.skills[id];
  if (!k || k.lv < 1 || k.lv >= SKILL_MAX_LV) return false;
  const c = skillUpgradeCost(k.lv);
  if (k.frag < c.frag) return false;
  k.frag -= c.frag; k.lv++;
  return true;
}
// ---- the shop: a daily deal board, a welcome chest, a Beats store, and a shop level that sweetens the chests
export const shopLevel = xp => { let lv = 1, left = xp; while (left >= 300 * lv) { left -= 300 * lv; lv++; } return { lv, cur: left, need: 300 * lv }; };
export function dealsFor(save, day) {
  const R = rng(day * 131 + (save.shop.refresh || 0) * 7 + 1), pick = a => a[Math.floor(R() * a.length)];
  const giftSlot = !(save.shop.refresh > 0) || save.shop.gift !== day;   // round 11 balance: the free 10 Sparkles gift is once a day, a refresh no longer brings it back
  const out = giftSlot ? [{ kind: 'sparkles', n: 10, off: 100, price: 0, cur: 'sparkles' }] : [];
  const offs = [90, 80, 70, 50];
  for (let i = out.length; i < 5; i++) {
    const t = pick(['frag', 'frag', 'keep', 'egg', 'energy', 'beats']), off = pick(offs);
    let d;
    if (t === 'frag') { const w = pick(WEAPONS); d = { kind: 'frag', ref: w.id, n: 3, base: 24 }; }
    else if (t === 'keep') { const k = pick(KEEPSAKES.filter(q => q.tier < 3)); d = { kind: 'keep', ref: k.id, n: 2, base: 30 }; }
    else if (t === 'egg') d = { kind: 'egg', n: 1, base: 70 };
    else if (t === 'energy') d = { kind: 'energy', n: 10, base: 12 };
    else d = { kind: 'beats', n: 800, base: 30 };
    out.push({ ...d, off, price: Math.max(2, Math.ceil(d.base * (1 - off / 100))), cur: 'sparkles' });
  }
  return out;
}
export function buyDeal(save, day, i) {
  const d = dealsFor(save, day)[i];
  if (!d || save.shop.bought[i] || save.sparkles < d.price) return false;
  save.sparkles -= d.price; save.shop.bought[i] = 1;
  if (d.kind === 'sparkles') { save.sparkles += d.n; save.shop.gift = day; } else if (d.kind === 'frag') save.skills[d.ref].frag += d.n; else if (d.kind === 'keep') save.keeps[d.ref].frag += d.n;
  else if (d.kind === 'egg') save.eggs += d.n; else if (d.kind === 'energy') addEnergy(save, d.n); else save.beats += d.n;
  return true;
}
export const refreshCost = save => (save.shop.free ? Math.min(50, 5 * Math.max(1, save.shop.refresh || 0)) : 0);   // first refresh free, then 5, 10, 15 ... capped at 50 (was a flat 5: a loop that printed Sparkles)
export function refreshDeals(save) {
  const cost = refreshCost(save);
  if (save.sparkles < cost) return false;
  save.sparkles -= cost; save.shop.free = 1; save.shop.refresh++; save.shop.bought = {}; return true;
}
export const welcomeReady = save => (save.cleared || 0) >= 5 && !save.shop.welcome;
export function claimWelcome(save) { if (!welcomeReady(save)) return false; save.shop.welcome = 1; save.eggs += 4; save.sparkles += 100; save.beats += 3000; return true; }
export const GOLD_PACKS = [
  { id: 'bit', name: 'A bit of Beats', beats: 150, price: 0 },
  { id: 'bag', name: 'A bag of Beats', beats: 700, price: 40 },
  { id: 'box', name: 'A box of Beats', beats: 2600, price: 120 },
];
export function buyGold(save, id, day) {
  const p = GOLD_PACKS.find(x => x.id === id); if (!p) return false;
  if (!p.price) { if (save.shop.gold === day) return false; save.shop.gold = day; } else { if (save.sparkles < p.price) return false; save.sparkles -= p.price; }
  save.beats += p.beats; return true;
}
// Opens a loot box: pays, adds fragments, returns [{id, n}] sorted by amount.
export function openBox(save, boxId, rand = Math.random) {
  const b = BOXES.find(x => x.id === boxId);
  if (!b || save[b.cur] < b.price) return null;
  save[b.cur] -= b.price;
  const got = {}, top = false;
  const pick = (top2 = false) => { // locked skills are a little more likely: the box is how you unlock them
    const pool = WEAPONS.map(w => ({ id: w.id, w: (save.skills[w.id].lv ? 1 : 1.6) * (top2 && w.frag >= 40 ? 2 : 1) }));
    let r = rand() * pool.reduce((a, p) => a + p.w, 0), k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
    return pool[k].id;
  };
  const featured = b.feature ? pick(!!b.top) : null;
  for (let i = 0; i < b.frags; i++) { const id = i < b.feature ? featured : pick(); got[id] = (got[id] || 0) + 1; }
  const extra = Math.floor(b.frags * 0.04 * (shopLevel(save.shop.xp).lv - 1)), bonusId = featured || pick();
  if (extra) got[bonusId] = (got[bonusId] || 0) + extra;
  save.shop.xp += b.frags;
  for (const id of Object.keys(got)) save.skills[id].frag += got[id];
  return Object.entries(got).map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n);
}
// Daily gigs: three goals per day, the same for everyone that day. Progress is counted from finished runs.
export const GOAL_DEFS = [
  { id: 'cells', text: n => `Pop ${n} cells`, targets: [30, 50, 80], stat: 'kills', reward: [{ beats: 40 }, { beats: 70 }, { beats: 110 }] },
  { id: 'wins', text: n => `Clear ${n} stage${n > 1 ? 's' : ''}`, targets: [1, 2, 3], stat: 'wins', reward: [{ sparkles: 8 }, { sparkles: 14 }, { sparkles: 22 }] },
  { id: 'chests', text: n => `Collect ${n} chests`, targets: [3, 5, 8], stat: 'chests', reward: [{ beats: 40 }, { beats: 70 }, { beats: 110 }] },
  { id: 'groove', text: n => `Reach groove ${n}`, targets: [8, 14, 20], stat: 'groove', max: true, reward: [{ sparkles: 6 }, { sparkles: 10 }, { sparkles: 16 }] },
  { id: 'bombs', text: n => `Pop ${n} bombs`, targets: [3, 6, 10], stat: 'bombs', reward: [{ beats: 50 }, { beats: 80 }, { beats: 120 }] },
  { id: 'bosses', text: n => (n > 1 ? `Beat ${n} bosses` : 'Beat a boss'), targets: [1, 1, 2], stat: 'bosses', reward: [{ sparkles: 10 }, { sparkles: 14 }, { sparkles: 24 }] },
  { id: 'stars', text: n => `Earn ${n} stars`, targets: [2, 4, 6], stat: 'starsEarned', reward: [{ sparkles: 6 }, { sparkles: 10 }, { sparkles: 16 }] },
  { id: 'picks', text: n => `Pick ${n} upgrades`, targets: [4, 7, 10], stat: 'picks', reward: [{ beats: 40 }, { beats: 70 }, { beats: 110 }] },
];
export function dailyGoals(day) {
  const R = rng((Math.imul(day | 0, 2654435761) >>> 0) || 1), pool = GOAL_DEFS.slice(), out = [];
  for (let i = 0; i < 3; i++) {
    const d = pool.splice(Math.floor(R() * pool.length), 1)[0], tier = Math.min(2, Math.floor(R() * 2.2));
    out.push({ id: d.id, target: d.targets[tier], text: d.text(d.targets[tier]), stat: d.stat, max: !!d.max, reward: d.reward[tier] });
  }
  return out;
}
export function addRunStats(save, day, r) {
  if (!save.daily || save.daily.day !== day) save.daily = { day, progress: {}, claimed: {} };
  const p = save.daily.progress, add = (k, v) => { p[k] = (p[k] || 0) + v; };
  add('kills', r.kills || 0); add('wins', r.won ? 1 : 0); add('chests', r.chests || 0); add('picks', r.picks || 0);
  p.groove = Math.max(p.groove || 0, r.groove || 0);
  add('bombs', r.bombs || 0); add('bosses', r.won && r.boss && !r.mode ? 1 : 0); add('starsEarned', r.starsGained || 0);
}
export const goalProgress = (save, day, goal) => (save.daily && save.daily.day === day ? Math.min(goal.target, (save.daily.progress[goal.stat] || 0)) : 0);
export function claimGoal(save, day, id) {
  const goal = dailyGoals(day).find(x => x.id === id);
  if (!goal || goalProgress(save, day, goal) < goal.target || (save.daily.claimed && save.daily.claimed[id])) return false;
  save.daily.claimed[id] = 1; save.beats += goal.reward.beats || 0; save.sparkles += goal.reward.sparkles || 0;
  return true;
}
export function claimAllGoals(save, day) { let n = 0; for (const g of dailyGoals(day)) if (claimGoal(save, day, g.id)) n++; return n; }
export function claimAllFund(save) { let n = 0; for (const f of FUND) if (claimFund(save, f.stage)) n++; return n; }
export function claimAllTrophies(save) { let n = 0; for (const t of TROPHIES) if (claimTrophy(save, t.id)) n++; return n; }
export function upgradeAllKeeps(save) { let n = 0, again = true; while (again) { again = false; for (const k of KEEPSAKES) if (keepUp(save, k.id)) { n++; again = true; } } return n; }
export function upgradeAllPets(save) { let n = 0, again = true; while (again) { again = false; for (const p of PETS) if (petUp(save, p.id)) { n++; again = true; } } return n; }
export function upgradeAllSkills(save) { let n = 0, again = true; while (again) { again = false; for (const w of WEAPONS) if (levelSkill(save, w.id)) { n++; again = true; } } return n; }
export function hatchAll(save, rand = Math.random) { const out = []; let h; while ((h = hatchEgg(save, rand))) out.push(h); return out; }
// A backup code you can copy: the whole save as text.
export const exportSave = save => 'CS1.' + btoa(JSON.stringify(save));
export function importSave(code) {
  try { if (typeof code !== 'string' || !code.trim().startsWith('CS1.')) return null; return sanitizeSave(JSON.parse(atob(code.trim().slice(4)))); } catch (e) { return null; }
}
export const canPlay = (save, n) => n >= 1 && n <= Math.min(MAX_STAGE, save.cleared + 1);
export const clearReward = n => ({ sparkles: (isBossStage(n) ? 40 : 15) + 3 * n });
// Applies a finished run to the save and returns what was earned.
export const totalStars = save => Object.values(save.stars || {}).reduce((a, v) => a + v, 0);
export function applyResult(save, r) {
  const out = { beats: r.coins, sparkles: 0, first: false, egg: false, levelUps: 0, frags: r.frags || {} };
  const lv0 = levelInfo(save.xp).lv; save.xp += Math.round((r.kills || 0) + 25 * (r.stage || 1) * (r.won ? 2 : 1) * (r.hard ? 1.5 : 1));
  const lv1 = levelInfo(save.xp).lv; out.levelUps = lv1 - lv0;
  for (let l = lv0 + 1; l <= lv1; l++) { const rw = levelReward(l); if (rw) { save.sparkles += rw.sparkles; out.sparkles += rw.sparkles; } }
  if (r.cp50) addEnergy(save, ENERGY_BACK);
  out.prevPct = save.prog[r.stage] || 0; out.starsGained = 0;
  if (r.won && !r.mode && !r.hard && r.stars) { const old = save.stars[r.stage] || 0; if (r.stars > old) { const before = totalStars(save); save.stars[r.stage] = r.stars; out.starsGained = r.stars - old; const ms = Math.floor((before + out.starsGained) / 10) - Math.floor(before / 10); if (ms > 0) { save.sparkles += 10 * ms; out.sparkles += 10 * ms; out.starBonus = 10 * ms; } } }
  if (r.won && r.mode !== 'pig' && r.mode !== 'inv') { const rb = (3 + Math.floor((r.stage || 1) / 3)) * (r.hard ? 2 : 1); addRibbons(save, rb); out.ribbons = rb; }
  save.beats += r.coins; save.runs++; save.kills += r.kills;
  out.joy = {}; for (const id of save.petEquip) { const k = save.pets[id]; if (k) { const j0 = k.joy || 0; k.joy = Math.min(PET_JOY_MAX, j0 + petJoyGain(r)); out.joy[id] = [j0, k.joy]; } }
  for (const id of Object.keys(out.frags)) save.skills[id].frag += out.frags[id];
  if (r.won && r.mode === 'inv') { addRibbons(save, 15); out.ribbons = 15; save.eggs++; out.egg = true; save.inv.best = Math.max(save.inv.best, r.stage); const ids = PETS.map(p => p.id), pid = ids[(save.runs + r.stage) % ids.length]; save.pets[pid].frag += 3; out.pet = { id: pid, n: 3 }; return out; }
  if (r.mode === 'inv') return out;
  if (r.hard && r.won && r.mode !== 'pig') { save.prog['h' + r.stage] = 100; if (r.stage > save.hardCleared) { save.hardCleared = r.stage; const sp = Math.round(clearReward(r.stage).sparkles * 1.5); save.sparkles += sp; out.sparkles += sp; out.first = true; save.eggs++; out.egg = true; } return out; }
  if (r.hard && r.mode !== 'pig') { save.prog['h' + r.stage] = Math.max(save.prog['h' + r.stage] || 0, Math.floor((r.progress || 0) * 100)); return out; }
  if (r.mode !== 'pig' && r.stage) save.prog[r.stage] = Math.max(save.prog[r.stage] || 0, r.won ? 100 : Math.floor((r.progress || 0) * 100));
  if (r.mode === 'pig') { if (r.won) { save.pig.best = Math.max(save.pig.best, r.stage); save.eggs++; out.egg = true; } return out; }
  if (r.won) {
    if (r.stage > save.cleared) { out.first = true; out.sparkles = clearReward(r.stage).sparkles; save.sparkles += out.sparkles; save.cleared = r.stage; save.eggs++; out.egg = true; }
    save.best = Math.max(save.best, r.stage);
  }
  return out;
}

// ---------------------------------------------------------------- stages
export const isBossStage = n => n % 5 === 0;
// Every stage the snakes crawl a little faster.
export const speedMul = n => Math.min(2.6, 1 + 0.035 * (n - 1));
export const hpBase = n => 12 * (12.5 * Math.pow(1.2, Math.min(n - 1, 13)) * Math.pow(1.047, Math.max(0, n - 14)) + 0.5 * n);   // ~14 capsule shots per cell in stage 1
export const snakeLength = n => Math.min(150, 32 + 4 * (n - 1) + (isBossStage(n) ? 12 : 0));
export const arrivalTime = n => 0.74 * Math.max(80, 112 - 0.9 * n + 2.2 * (snakeLength(n) - 32)) * (isBossStage(n) ? (n >= 20 ? 1 : 0.9) : 1);   // bosses crawl a bit faster too   // seconds for the face to reach the membrane if you do nothing
// Ten species, one per stage (then they repeat): own colour, cell style, face and headgear. No yellow: yellow means upgrade cell.
export const SKINS = ['love', 'rust', 'sneezy', 'grumpy', 'sleepy', 'disco', 'sour', 'mighty', 'frosty', 'gloomy'];
export const skinFor = n => SKINS[(n - 1) % SKINS.length];
const NAMES = ['Love-Struck Serpent', 'Rustic Serpent', 'Sneezy Serpent', 'Grumpy Python', 'Sleepy Cobra', 'Disco Viper', 'Sour Adder', 'Mighty Mamba', 'Frosty Boa', 'Gloomy Asp'];
export const SKIN_NAMES = NAMES;
export const virusName = n => NAMES[(n - 1) % NAMES.length] + (n > NAMES.length ? ' ' + ['', 'II', 'III', 'IV', 'V'][Math.floor((n - 1) / NAMES.length)] : '');
export const PATH_KINDS = ['Gentle waves', 'Tall hairpins', 'Big lobes', 'Castle steps', 'Tight waves', 'Sharp zigzag', 'Wide S', 'Hairpin lanes', 'Wild lanes'];
const PATH_ORDER = [0, 1, 3, 2, 6, 4, 7, 5, 8];   // which shape each stage gets
export const pathKind = n => PATH_ORDER[(n - 1) % PATH_ORDER.length];
export const PIG_NAME = 'Piggy Bank Parade';
const nameOf = g => (g.mode === 'pig' ? PIG_NAME : g.mode === 'inv' ? INV_NAME : virusName(g.stage));
const skinOf = (g, n) => (g.mode === 'pig' ? 'piggy' : skinFor(n));
export const MAX_STAGE = 50;
// Some stages carry a twist, shown before you start.
export const MODS = [
  { id: 'swift', name: 'Swift', blurb: 'The snake is 25% faster', speed: 1.25 },
  { id: 'thick', name: 'Thick', blurb: 'Tougher cells, richer Beats', hp: 1.3, coin: 1.4 },
  { id: 'fragile', name: 'Fragile', blurb: 'Softer cells', hp: 0.8 },
  { id: 'armored', name: 'Armored', blurb: 'Lots of armored cells', armor: 0.3 },
  { id: 'boomy', name: 'Boomy', blurb: 'Lots of bombs', bomb: 0.3 },
  { id: 'rich', name: 'Rich', blurb: 'Beats are worth much more', coin: 1.6 },
];
export const stageMod = n => (n >= 4 && n % 5 !== 0 && n % 3 === 1 ? MODS[Math.floor(n / 3) % MODS.length] : null);
// Most stages are one snake and a line at the bottom. Some stages have two snakes, and some put the duo in the middle with a circle around them.
export const stageKind = n => (n % 6 === 0 ? 'ring' : (n % 7 === 0 || n % 10 === 8) ? 'double' : 'lane');
export const KIND_LABEL = { lane: '', double: 'Two snakes', ring: 'Circle' };
export const RING = { cx: W / 2, cy: 720, R: 135 };
export const RING_SCALE = 0.7;   // b11: in circle stages the duo (and pets, shadow, hit area) is drawn this much smaller, and it stands fixed in the middle and aims all round
export const BOSS_HP = [0.8, 2.4, 0.5];   // boss cell HP multiplier at the face and at the tail (a flat 2.4 left the first yellow cell out of reach: typical players got 4 to 9 percent of the boss)
export const RING_LATE = 0.9;   // from stage 18 the spiral crawls a little slower still (circle stages 18, 42 and 48 were walls)
export const HAIRPIN_LATE = 0.9;   // the tall-hairpin lanes (stages 20, 29, 38, 47) were walls from stage 20 on: the snake crawls a little slower there
export const RING_EARLY = 0.85, RING_END = 0.78;   // b12 balance: a thumb aims worse than the bot. Circle stages up to 12 and from 36 on crawl a bit slower still
export const ringPace = n => (n >= 18 && !isBossStage(n) ? RING_LATE : 1) * (n <= 6 ? RING_EARLY : n <= 12 ? RING_EARLY * 0.88 : n >= 36 && !isBossStage(n) ? RING_END : 1);
export const RING_SPEED = 1.7;   // the spiral is long and most of it is out of reach of the straight shot, so the snake crawls slower in circle stages
export const stageInfo = n => ({ n, name: virusName(n), skin: skinFor(n), boss: isBossStage(n), length: snakeLength(n), path: stageKind(n) === 'ring' ? 'Spiral' : PATH_KINDS[pathKind(n)], kind: stageKind(n), mod: stageMod(n), hp: Math.round(hpBase(n)) });

const KIND = { normal: { hp: 1 }, armor: { hp: 2.6 }, bomb: { hp: 1 }, upgrade: { hp: 1.6 }, mender: { hp: 1.3 } };

// ---------------------------------------------------------------- the track
// Every stage has its own lane shape. Control points are corner-cut into smooth curves.
function chaikin(pts, n) {
  for (let k = 0; k < n; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }); }
    out.push(pts[pts.length - 1]); pts = out;
  }
  return pts;
}
function resample(poly, step) {
  const out = [poly[0]]; let carry = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i], d = Math.hypot(b.x - a.x, b.y - a.y);
    let t = step - carry;
    while (t <= d) { out.push({ x: a.x + ((b.x - a.x) * t) / d, y: a.y + ((b.y - a.y) * t) / d }); t += step; }
    carry = d - (t - step);
  }
  return out;
}
const RING_WOBBLE_FROM = 5;   // the 5th ring stage (30) and later: the spiral ripples like a petal flower, a different count each time
export const ringWobble = (n, t) => { const idx = Math.floor(n / 6); return idx < RING_WOBBLE_FROM ? 0 : 15 * Math.sin(TAU * (5 + (idx % 3)) * t) * Math.sin(Math.PI * t) * (1 - t); };
const RING_TURNS = [1.6, 1.25, 1.9];   // ring stages cycle through a loose, a short and a tight spiral
function ringPath(n = 6) {
  const { cx, cy, R } = RING, r0 = 330, turns = RING_TURNS[(Math.floor(n / 6) - 1) % 3], pts = [];
  for (let y = -200; y <= cy; y += 6) pts.push({ x: cx - r0, y });
  const steps = 360;
  for (let k = 1; k <= steps; k++) { const t = k / steps, a = Math.PI - TAU * turns * t, r = r0 - (r0 - R) * t + ringWobble(n, t); pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  const poly = resample(pts, 6), cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
  const path = { pts: poly, cum, len: cum[cum.length - 1], kind: 'ring' };
  return (Math.floor(n / 6) - 1) % 2 === 0 ? path : mirrorPath(path);   // ring stages alternate the winding direction
}
const mirrorPath = p => ({ ...p, pts: p.pts.map(q => ({ x: W - q.x, y: q.y })) });
const LANE_TOP = 220;   // the first lane row of the lane maps (just under the gate line, boss gate 215)
export function buildPath(n) {
  if (stageKind(n) === 'ring') return ringPath(n);
  const R = rng(n * 7919 + 13), k = pathKind(n), end = LINE_Y + 40, cx = W / 2;
  let poly = [];
  const sine = (A, lam, ph, grow = 0) => { for (let y = -160; y <= end; y += 6) poly.push({ x: cx + (A + grow * (y / end)) * Math.sin((y / lam) * TAU + ph), y }); };
  // b15: lanes never turn inside the strip under the HUD (cells there are hidden and cannot be shot): the lane map is squeezed down so its top row sits just under the gate
  const lanes = (pts, smooth) => {
    const inner = pts.filter(q => q[1] > -100), lo = Math.min(...inner.map(q => q[1])), hi = Math.max(...inner.map(q => q[1]));
    if (lo < LANE_TOP && hi > LANE_TOP + 200) pts = pts.map(([x, y]) => (y > -100 ? [x, LANE_TOP + (y - lo) * (hi - LANE_TOP) / (hi - lo)] : [x, y]));
    poly = [{ x: cx, y: -160 }, ...pts.map(([x, y]) => ({ x, y })), { x: cx, y: end }]; poly = chaikin(poly, smooth);
  };
  if (k === 0) sine(230, 640, R() * TAU);
  else if (k === 1) lanes([[80, -160], [80, 590], [226, 590], [226, 70], [366, 70], [366, 615], [500, 615], [500, 80], [624, 80], [624, 745], [86, 745], [86, 930], [610, 930], [610, 1070], [150, 1070], [150, 1260]], 2);   // tall hairpins, then wide lanes
  else if (k === 2) { for (let y = -160; y <= end; y += 6) { const a = (y / 520) * TAU + R() * 0, sg = Math.sin(a); poly.push({ x: cx + 270 * Math.sign(sg) * Math.pow(Math.abs(sg), 0.55), y }); } poly = chaikin(poly, 1); }   // big rounded lobes
  else if (k === 3) lanes([[100, -160], [100, 180], [650, 180], [650, 300], [80, 300], [80, 420], [650, 420], [650, 560], [100, 560], [100, 940], [310, 940], [310, 700], [410, 700], [410, 930], [540, 930], [540, 700], [650, 700], [650, 1260]], 1);   // castle notches
  else if (k === 4) sine(250, 410, R() * TAU, 20);
  else if (k === 5) lanes([[660, 40], [60, 190], [660, 340], [60, 490], [660, 640], [60, 790], [660, 940], [60, 1090]], 1);   // angular zigzag
  else if (k === 6) { for (let y = -160; y <= end; y += 6) poly.push({ x: cx + 250 * Math.sin((y / 900) * TAU + 0.8) + 70 * Math.sin((y / 300) * TAU), y }); }
  else if (k === 7) lanes([[560, 60], [120, 60], [120, 250], [560, 250], [560, 440], [120, 440], [120, 630], [560, 630], [560, 820], [120, 820], [120, 1010], [560, 1010]], 2);   // hairpin lanes
  else {   // wild lanes: hairpins with random widths
    const pts = []; let y = 60, right = R() < 0.5;
    while (y < 1050) {
      const x0 = 60 + R() * 220, x1 = 440 + R() * 220, a = right ? x0 : x1, b = right ? x1 : x0;
      pts.push([a, y], [b, y]); y += 170 + R() * 60; right = !right; pts.push([b, y - 40]);
    }
    lanes(pts, 2);
  }
  poly = resample(poly, 6);
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
  // the lane ends where it first crosses the membrane for the last time
  let last = poly.length - 1;
  for (let i = poly.length - 1; i > 0; i--) if (poly[i].y >= LINE_Y) last = i; else break;
  return { pts: poly, cum, len: cum[last], kind: k };
}
// allocation free twin of pointAt: writes into [o] (the per-frame hot loop reuses three scratch points)
export function pointInto(path, s, o) {
  const pts = path.pts, cum = path.cum;
  if (s <= 0) { const a = pts[0], b = pts[1], d = hyp(b.x - a.x, b.y - a.y) || 1; o.x = a.x + ((b.x - a.x) / d) * s; o.y = a.y + ((b.y - a.y) / d) * s; return o; }
  if (s >= cum[cum.length - 1]) { const p = pts[pts.length - 1]; o.x = p.x; o.y = p.y + (s - cum[cum.length - 1]); return o; }
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
  o.x = pts[lo].x + (pts[hi].x - pts[lo].x) * t; o.y = pts[lo].y + (pts[hi].y - pts[lo].y) * t; return o;
}
const PT_A = { x: 0, y: 0 }, PT_B = { x: 0, y: 0 }, PT_C = { x: 0, y: 0 };
export function pointAt(path, s) {
  const { pts, cum } = path;
  if (s <= 0) { const a = pts[0], b = pts[1], d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: a.x + ((b.x - a.x) / d) * s, y: a.y + ((b.y - a.y) / d) * s }; }
  if (s >= cum[cum.length - 1]) { const p = pts[pts.length - 1]; return { x: p.x, y: p.y + (s - cum[cum.length - 1]) }; }
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * t, y: pts[lo].y + (pts[hi].y - pts[lo].y) * t };
}

// ---------------------------------------------------------------- player
const mergeBonus = (a, b) => { const o = { ...a }; for (const k of Object.keys(b)) o[k] = (o[k] || 0) + b[k]; return o; };
export function makePlayer(metaLv, pb, equip) {
  const m = id => (metaLv && metaLv[id]) || 0, b = Object.assign({ atk: 0, vit: 0, coin: 0, guard: 0, crit: 0, cdn: 0, speed: 0 }, pb || {}), eq = id => (equip && equip.includes(id) ? 1 : 0);
  return {
    x: W / 2, y: ROW_Y, r: 16, kx: 0, slow: Math.min(0.45, 0.02 * m('vit') + (b.vit / 12) * 0.02 + b.guard * 0.5), speed: 300,
    atk: 1 + 0.10 * m('atk') + b.atk, crit: 0.05 + 0.02 * m('crt') + b.crit, critMul: 2.5 + 0.08 * m('crt'), cdBase: Math.max(0.4, 1 - 0.05 * m('cdn') - b.cdn),
    rate: 2.0 * (1 + 0.15 * eq('hamster')) * (1 + b.speed), bspeed: 900,
    coinMul: 1 + 0.1 * m('for') + b.coin + 0.1 * eq('piglet'), revive: m('rev') > 0 ? 1 : 0,
    iframes: 0, shield: 0, rage: 0, cd: 0, aim: -Math.PI / 2, orbAng: 0, mx: 0,
    zone: { x0: 40, x1: W - 40 },
  };
}

// ---------------------------------------------------------------- the snake
function pickKind(g, n, boss, i, len) {
  if (i === 0) return 'normal';
  const r = g.rand();
  const m = g.mod || {};
  const armorP = n >= 3 ? (m.armor || 0.12) : 0, bombP = n >= 2 ? (m.bomb ? 0.1 : m.armor ? 0.03 : 0.04) : 0, menderP = n >= 9 ? 0.07 : 0;
  if (r < armorP) return 'armor';
  if (r < armorP + bombP) return 'bomb';
  if (r < armorP + bombP + menderP) return 'mender';
  return 'normal';
}
export function segRadius(boss, i, len) {
  const sc = boss ? 1.3 : 1;
  if (i === 0) return 38 * sc;
  return (28 + 11 * Math.pow(i / Math.max(1, len - 1), 1.1)) * sc;   // the tougher cells further back are bigger, so their numbers stay readable
}
const spacing = (a, b) => (a.r + b.r) * 0.78;

// Every snake cell is created with ALL its fields in one fixed order (also the ones set later in the run), so the engine keeps one hidden class and step is not de-optimised. Tests: 29_perf_r8.
export const CELL_KEYS = ['ps', 'x', 'y', 'ang', 'r', 'hp', 'max', 'kind', 'flash', 'orbCd', 'i', 'carry', 'shield', 'isHead', 'tp', 'vx', 'vy', 'wave', 'warded', 'gloom', 'frost', 'gold', 'goldT', 'ward', 'lull', 'drum', 'choir', 'bell', 'quartet', 'qPopped', 'metro', 'pillow', 'snack', 'mirror', 'shell'];
function newCell(ps, x, y, r, hp, kind, i) {
  return { ps, x, y, ang: Math.PI / 2, r, hp, max: hp, kind, flash: 0, orbCd: 0, i, carry: null, shield: i === 0, isHead: i === 0, tp: ps, vx: 0, vy: 0, wave: false, warded: false, gloom: false, frost: false, gold: false, goldT: 0, ward: false, lull: false, drum: false, choir: false, bell: false, quartet: false, qPopped: false, metro: false, pillow: false, snack: false, mirror: false, shell: false };
}
export const SNAKE_KEYS = ['id', 'path', 'segs', 'tail', 'breach', 'breachT', 'speed', 'slow', 'boss', 'skin', 'name', 'surge', 'surgeT', 'healT', 'drum', 'lane', 'napT', 'gloomW', 'rushT', 'loveT', 'creak', 'snzT', 'snzW', 'frostW', 'qT', 'qDone', 'qWin', 'qNeed', 'p2', 'p2T', 'cue', 'skipT'];
// distance along a path where it first reaches height gy (the snake is drawn only below the gate)
function distAtY(path, gy) {
  const pts = path.pts; for (let i = 0; i < pts.length; i++) if (pts[i].y >= gy) return path.cum[i];
  return 240;
}
const gateDist = distAtY;
function spawnSnake(g, n, o = {}) {
  const pig = g.mode === 'pig', inv = g.mode === 'inv', boss = isBossStage(n), len = o.len || (pig ? 40 : inv ? 70 : snakeLength(n)), segs = [];
  const path = o.mirror ? mirrorPath(g.path) : g.path;
  const hpB = (pig ? hpBase(1 + 2 * n) * 0.5 : inv ? hpBase(n) * 1.3 : hpBase(n)) * (g.hard ? HARD_HP : 1) * ((g.mod && g.mod.hp) || 1);
  const ramp = i => 0.4 + 1.35 * Math.pow(i / Math.max(1, len - 1), 1.3);   // the first cells are soft, then it gets tougher and tougher
  const bossMul = i => (boss ? BOSS_HP[0] + (BOSS_HP[1] - BOSS_HP[0]) * Math.min(1, i / Math.max(1, BOSS_HP[2] * len)) : 1);   // bosses start soft so the first upgrade cells pop, and reach full 2.4x half way down
  const ps0 = o.startPs === undefined ? (g.ring ? 240 : Math.max(240, gateDist(path, gateY(g)))) : o.startPs;   // b15: the face starts at the gate line (it used to start inside the top edge, now under the HUD)
  let ps = ps0;
  for (let i = 0; i < len; i++) {
    let kind = pickKind(g, n, boss, i, len); if (kind === 'bomb' && segs.length && segs[segs.length - 1].kind === 'bomb') kind = 'normal';
    const r = segRadius(boss, i, len);
    let hp = hpB * ramp(i) * KIND[kind].hp * bossMul(i) *(0.9 + g.rand() * 0.2);
    hp = i === 0 ? 1 : Math.max(1, Math.round(hp));   // the face has no real HP: it is shielded until it is alone
    const pos = pointAt(path, ps);
    segs.push(newCell(ps, pos.x, pos.y, r, hp, kind, i));
    ps -= (r + segRadius(boss, i + 1, len)) * 0.78;
  }
  // yellow upgrade cells: pop one to choose an upgrade. About one per 7 cells (at least 3), spread along the snake.
  const ups = Math.max(4, Math.round(len / 7));
  for (let k = 0; k < ups; k++) {
    const c = segs[clamp(3 + Math.round(((len - 5) * (k + 0.5)) / ups), 1, len - 1)];
    c.kind = 'upgrade'; c.max = c.hp = Math.max(1, Math.round(hpB * ramp(c.i) * KIND.upgrade.hp * bossMul(c.i)));
  }
  // chest cells (a chest on the cell): aim for them first too
  const nch = Math.max(2, Math.round(len / 15));
  for (let q = 0; q < nch; q++) {
    let j = clamp(Math.round(len * (0.2 + (0.7 * (q + 0.5)) / nch)), 1, len - 1);
    while (j < len - 1 && (segs[j].kind !== 'normal' || segs[j].carry)) j++;
    segs[j].carry = 'chest';
  }
  markGold(g, n, segs, len);
  markSpecials(g, n, segs, len);
  g.upgradeLeft = (g.upgradeLeft || 0) + ups;
  const speed = ((path.len - 240) / arrivalTime(n)) * speedMul(n) * ((g.mod && g.mod.speed) || 1) * gateSlow(g, path) * (g.ring ? RING_SPEED * ringPace(n) : 1) * (!g.ring && n >= 20 && pathKind(n) === 1 ? HAIRPIN_LATE : 1);
  segs.hpMax = segs.reduce((a, s) => a + s.max, 0);
  g.snakes.push({ id: ++g.sid, path, segs, tail: segs[segs.length - 1].ps, breach: false, breachT: 0, speed, slow: 0, boss, skin: skinOf(g, n), name: nameOf(g), surge: 'idle', surgeT: 4 + g.rand() * 3, healT: undefined, drum: false, lane: null, napT: 0, gloomW: undefined, rushT: 0, loveT: undefined, creak: false, snzT: undefined, snzW: false, frostW: undefined, qT: 0, qDone: 0, qWin: 0, qNeed: 0, p2: false, p2T: 0, cue: 0, skipT: RING_SKIP_EVERY });
  g.stageHpMax += segs.reduce((a, s) => a + s.max, 0);
}

// ---------------------------------------------------------------- gameplay extras (agent 14)
// Gold cell: from stage 4 one plain cell per snake glitters. Pop it within GOLD_TIME seconds of it
// showing on screen for a big Beats burst. No random numbers are drawn, so existing runs do not change.
export const ECHO_WAVE_FROM = 20;
export const P2_WARN = 0.9, P2_DASH = 3.1;   // boss phase 2: the dash lane glows for 0.9s, then the head dashes down it at 3.1x speed
export const P2_HP = 0.4, P2_WAVE = 6.2;   // boss phase 2: below 40% hp the shield wave runs faster and the surges come sooner
export const GOLD_TIME = 9, GOLD_MUL = 12, GOLD_FROM = 4;
function markGold(g, n, segs, len) {
  if (g.mode !== '' || n < GOLD_FROM || len < 12) return;
  for (let j = Math.round(len * 0.55); j < len; j++) if (segs[j].kind === 'normal' && !segs[j].carry) { segs[j].gold = true; segs[j].goldT = GOLD_TIME; return; }
}
// Ward cell (stage 10+): while it lives, the two cells either side of it take half damage.
// Lullaby cell (stage 12+): pop it and the whole snake crawls slowly for LULL_TIME seconds.
// Both are plain cells with a flag and are placed without random numbers, so existing runs do not change.
export const DRUM_FROM = 18, DRUM_SPEED = 1.12;   // Drummer cell (stage 18+): while it lives the whole snake crawls 12% faster
export const WARD_FROM = 10, LULL_FROM = 12, LULL_TIME = 2.5, WARD_CUT = 0.5, WARD_REACH = 2;
function markSpecials(g, n, segs, len) {
  if (g.mode !== '' || len < 14) return;
  const put = (frac, flag) => { for (let j = Math.round(len * frac); j < len; j++) if (segs[j].kind === 'normal' && !segs[j].carry && !segs[j].gold && !segs[j].ward && !segs[j].lull && !segs[j].drum && !segs[j].choir && !segs[j].bell) { segs[j][flag] = true; return; } };
  if (n >= WARD_FROM) put(0.35, 'ward');
  if (n >= 25 && len >= 24) put(0.78, 'ward');
  if (n >= LULL_FROM) put(0.45, 'lull');
  if (n >= DRUM_FROM && len >= 16) put(0.62, 'drum');
  if (n >= CHOIR_FROM && len >= 24) put(0.7, 'choir');
  if (n >= BELL_FROM && len >= 24 && !isBossStage(n)) put(0.52, 'bell');
  if (n >= QUARTET_FROM && len >= 22 && !isBossStage(n)) {   // four cells, every second one from 40% down the chain, linked
    const free = j => segs[j].kind === 'normal' && !segs[j].carry && !segs[j].gold && !segs[j].ward && !segs[j].lull && !segs[j].drum && !segs[j].choir && !segs[j].bell && !segs[j].quartet;
    let j = Math.round(len * 0.4), k = 0;
    while (j < len && k < 4) { if (free(j)) { segs[j].quartet = true; k++; j += 2; } else j++; }
    if (k < 4) for (const q of segs) if (q.quartet) q.quartet = false;
  }
  if (n >= METRO_FROM && len >= 20 && !isBossStage(n)) putFresh(segs, len, 0.28, 'metro');
  if (n >= PILLOW_FROM && len >= 26 && !isBossStage(n)) putFresh(segs, len, 0.58, 'pillow');
  if (n >= SNACK_FROM && len >= 24 && !isBossStage(n)) putFresh(segs, len, 0.42, 'snack');
  if (n >= MIRROR_FROM && len >= 26 && !isBossStage(n)) putFresh(segs, len, 0.66, 'mirror');
  if (n >= SHELL_FROM && len >= 26 && !isBossStage(n) && stageKind(n) === 'ring') { putFresh(segs, len, 0.34, 'shell'); if (n >= 42) putFresh(segs, len, 0.8, 'shell'); }
}
// Metronome cell (stage 16+, regular snakes): pop it right on the beat for a Beats burst and a burst of Groove; off the beat it is a plain cell.
// Pillow cell (stage 26+, regular snakes): pop it and the whole snake is shoved back PILLOW_PUSH px. Both are placed without random numbers.
export const METRO_FROM = 16, METRO_MUL = 8, PILLOW_FROM = 26, PILLOW_PUSH = 42;
function putFresh(segs, len, frac, flag) {
  for (let j = Math.round(len * frac); j < len; j++) { const q = segs[j]; if (q.kind === 'normal' && !q.carry && !q.gold && !q.ward && !q.lull && !q.drum && !q.choir && !q.bell && !q.quartet && !q.metro && !q.pillow && !q.snack) { q[flag] = true; return; } }
}
// Snack cell (stage 31+, regular snakes): pop it and a plant-based snack drops. It falls to the duo's row and waits SNACK_LIFE seconds;
// slide under it (it does not fly to you) for SNACK_RAGE seconds of the Rage buff and a Groove burst. Placed without random numbers.
export const SNACK_FROM = 31, SNACK_LIFE = 7, SNACK_RAGE = 6, SNACK_GROOVE = 5, SNACK_REACH = 34;
function snackDrop(g, s) { g.pickups.push({ kind: 'snack', x: s.x, y: s.y, vx: 0, vy: -50, v: 1, age: 0, vac: false }); g.events.push({ t: 'snack', x: s.x, y: s.y }); }
// one step of a dropped snack: returns true when it is gone (eaten or stale). Never vacuumed in: the duo has to slide under it.
function snackStep(g, pk, dt) {
  const p = g.p;
  if (g.phase !== 'play' || pk.age > SNACK_LIFE) { if (g.phase === 'play') g.events.push({ t: 'snackgone', x: pk.x, y: pk.y }); return true; }
  const f = Math.exp(-3 * dt); pk.vx *= f; pk.vy = pk.vy * f + (p.y - pk.y) * 3 * (1 - f);
  pk.x = clamp(pk.x + pk.vx * dt, p.zone.x0, p.zone.x1); pk.y = clamp(pk.y + pk.vy * dt, 6, H - 6);
  if (Math.abs(p.x - pk.x) < SNACK_REACH && Math.abs(p.y - pk.y) < SNACK_REACH) {
    p.rage = Math.max(p.rage, SNACK_RAGE); for (let n = 0; n < SNACK_GROOVE; n++) bumpGroove(g); g.snacks = (g.snacks || 0) + 1;
    g.events.push({ t: 'snackget', x: pk.x, y: pk.y }); return true;
  }
  return false;
}
// Mirror cell (batch 11, stage 36+, regular snakes): shots that land on it glance off sideways. It keeps only 60% of every hit and
// the cell on each side takes 20%, so the total damage is unchanged: the question is whether to chew the mirror down to wear the
// neighbours (armour, a yellow cell, a ward) or to slide away and hit them head on. Placed without random numbers.
export const MIRROR_FROM = 36, MIRROR_SIDE = 0.2;
export const mirrorSide = g => MIRROR_SIDE * (1 - Math.min(1, uv(g, 'mir') / 100));   // Pocket Mirror: the glance shrinks toward nothing
// Shutter cell (batch 12, circle stages 24+, regular snakes): the duo stands still and aims all round, so a circle stage can ask WHERE you shoot from.
// A Shutter cell wears a shield arc that turns slowly round it. A note that reaches it through the shield only does SHELL_CUT of its damage;
// through the gap it hits in full. The shield arc is drawn on the cell, so you wait for the gap to turn toward you (or shoot the neighbours meanwhile).
export const SHELL_FROM = 24, SHELL_CUT = 0.3, SHELL_HALF = 1.0, SHELL_W = 1.4;
export const shellFacing = (g, s) => g.t * SHELL_W + s.i * 1.7;
export function shellBlocked(g, s) {
  const back = Math.atan2(g.p.y - s.y, g.p.x - s.x), d = shellFacing(g, s) - back;   // the shield blocks when it faces the duo
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < SHELL_HALF;
}
let splashing = false;   // the glance does not glance again
function mirrorSplash(g, s, full) {
  let sn = null; for (const o of g.snakes) if (o.segs.indexOf(s) >= 0) { sn = o; break; }
  if (!sn) return;
  const segs = sn.segs, k = segs.indexOf(s);
  for (let d = -1; d <= 1; d += 2) { const q = segs[k + d]; if (q && q.hp > 0 && q.i > 0) { splashing = true; damageSeg(g, q, full * mirrorSide(g), false, q.x, q.y); splashing = false; } }
}
// Quartet cell (stage 22+): four linked cells. Pop the first and the other three must follow within QUARTET_TIME
// seconds, or the survivors regrow to full health. Pop them all in time for a Beats burst and a slow crawl.
// Choir cell (stage 28+): while it lives the cells around it slowly regrow whenever they are not being hit.
export const QSTREAK_CAP = 5, QSTREAK_STEP = 0.1;   // quartet streak: every Quartet in a row pays 10% more, the Crescendo card also adds damage (5 in a row counts)
export const QUARTET_FROM = 22, QUARTET_TIME = 2, QUARTET_MUL = 7, CHOIR_FROM = 28, CHOIR_REGEN = 0.06, CHOIR_REACH = 2;
const quartetWin = g => QUARTET_TIME * (1 + uv(g, 'harm') / 200);
function quartetKill(g, s, sn, coinV) {
  if (!s.quartet) return;
  s.qPopped = true;
  if (!(sn.qT > 0)) {
    let others = 0; for (const q of sn.segs) if (q !== s && q.quartet && !q.qPopped) others++;
    sn.qNeed = 1 + others; sn.qDone = 0; sn.qT = sn.qWin = quartetWin(g);
    if (others) g.events.push({ t: 'quartetstart', x: s.x, y: s.y, n: others });
  }
  sn.qDone++;
  if (sn.qDone >= sn.qNeed) {
    const full = sn.qNeed >= 4; if (full) { g.qStreak = (g.qStreak || 0) + 1; g.qBest = Math.max(g.qBest || 0, g.qStreak); }
    const v = coinV * QUARTET_MUL * (sn.qNeed / 4) * (1 + uv(g, 'harm') / 100) * (1 + QSTREAK_STEP * Math.min(Math.max(0, (g.qStreak || 0) - 1), QSTREAK_CAP - 1));
    g.coins += v * g.p.coinMul * (g.coinK || 1); sn.slow = Math.max(sn.slow, 2.2); sn.qT = 0; sn.qDone = 0; g.quartets = (g.quartets || 0) + 1;
    g.events.push({ t: 'quartet', x: s.x, y: s.y, v: Math.round(v * g.p.coinMul * (g.coinK || 1)), n: sn.qNeed, streak: full ? g.qStreak : 0 });
  }
}
function quartetTick(g, sn, dt) {
  if (!(sn.qT > 0)) return;
  sn.qT -= dt;
  if (sn.qT <= 0) {
    sn.qT = 0; sn.qDone = 0; const lost = g.qStreak || 0; g.qStreak = 0;
    for (const q of sn.segs) if (q.quartet && q.hp > 0) { q.hp = q.max; g.events.push({ t: 'quartetfail', x: q.x, y: q.y, lost }); }
  }
}
function choirTick(sn, dt) {
  const segs = sn.segs;
  for (let i = 1; i < segs.length; i++) if (segs[i].choir && segs[i].hp > 0) {
    for (let j = Math.max(1, i - CHOIR_REACH); j <= Math.min(segs.length - 1, i + CHOIR_REACH); j++) { const q = segs[j]; if (j !== i && q.hp > 0 && !(q.flash > 0)) q.hp = Math.min(q.max, q.hp + q.max * CHOIR_REGEN * dt); }
  }
}
// Boss behaviour per species group (late bosses only, so the early game is untouched; no random numbers).
// Sleepy bosses (15, 25, 35, 45): the dash lasts longer, then the head naps and crawls at half speed for a moment.
// Gloomy bosses (20, 30, 40, 50): every GLOOM_EVERY seconds a patch of cells wears a gloom cloud for GLOOM_TIME seconds and takes ward damage.
export const NAP_FROM = 15, NAP_TIME = 1.6, NAP_SPEED = 0.5, NAP_EXTRA = 0.4;
export const GLOOM_TWO_FROM = 30, STARTLE_FROM = 35, STARTLE_JOLT = 30, RING_SKIP_FROM = 24, RING_SKIP_EVERY = 12, RING_SKIP_WARN = 0.7, RING_SKIP_JOLT = 22;
export const GLOOM_FROM = 20, GLOOM_EVERY = 10, GLOOM_TIME = 4, GLOOM_SIZE = 3;
export const napBoss = (g, sn) => sn.boss && g.mode === '' && g.stage >= NAP_FROM && bossGroup(g.stage) === 'sleepy';
export const bossGroup = n => (!isBossStage(n) ? '' : SKINS.indexOf(skinFor(n)) % 2 === 0 ? 'sleepy' : 'gloomy');
function gloomTick(g, sn) {
  const segs = sn.segs;
  for (const q of segs) q.gloom = false;
  if (!sn.boss || g.mode !== '' || g.stage < GLOOM_FROM || bossGroup(g.stage) !== 'gloomy' || g.phase !== 'play' || segs.length < GLOOM_SIZE + 4) return;
  const w = Math.floor(g.t / GLOOM_EVERY), ph = g.t - w * GLOOM_EVERY;
  if (ph < GLOOM_EVERY - GLOOM_TIME) { sn.gloomW = -1; return; }
  const two = sn.p2 && g.stage >= GLOOM_TWO_FROM;   // eclipse: in phase 2 of the late gloomy bosses a second cloud rises on the far side
  for (let n = 0; n < (two ? 2 : 1); n++) {
    const a = 1 + ((w * 7 + 3 + n * (segs.length >> 1)) % (segs.length - GLOOM_SIZE - 1));
    if (n === 0 && sn.gloomW !== w) { sn.gloomW = w; const c = segs[Math.min(segs.length - 1, a + 1)]; g.events.push({ t: 'gloom', x: c.x, y: c.y }); }
    for (let j = a; j < a + GLOOM_SIZE && j < segs.length; j++) if (segs[j].hp > 0) { segs[j].gloom = true; segs[j].warded = true; }
  }
}
// Boss phase 2 twists (batch 11, stages 10 to 30; 35 and up already have the startle): each boss gets its own second act. No random numbers.
// drop: on the first beat of every bar the whole boss lurches DROP_JOLT px forward (a warning ring one beat before). hold: every HOLD_EVERY seconds the three cells behind the face
// are warded for HOLD_TIME (save your shots). regrow: every REGROW_EVERY seconds the cells nearest the face heal REGROW_HEAL of their health.
export const DROP_JOLT = 16, HOLD_EVERY = 9, HOLD_TIME = 1.2, HOLD_CELLS = 3, REGROW_EVERY = 4, REGROW_HEAL = 0.05, REGROW_CELLS = 3;
// Batch 12 (stages 35 to 50, on top of the startle and the eclipse): 35 mirror (two Mirror cells appear in the chain), 40 swing (the whole boss sways on the beat),
// 45 quartet (four linked cells: pop all four within the window or they regrow), 50 finale (a Mirror cell AND the bass drop).
export const SWING_BOSS = 0.3, TWIST_LATE = { 35: 'mirror', 40: 'swing', 45: 'quartet', 50: 'finale' };
export const bossTwistOf = n => (isBossStage(n) && n >= 10 && n <= 30 ? ['drop', 'hold', 'regrow', 'drop', 'hold'][n / 5 - 2] : isBossStage(n) && TWIST_LATE[n] ? TWIST_LATE[n] : '');
function twistCells(g, sn, k) {   // once per boss, when phase 2 begins: mark cells (sn.cue is free on bosses, they have no species trait)
  if (sn.cue) return; sn.cue = 1;
  const segs = sn.segs, len = segs.length, free = j => j > 0 && segs[j] && segs[j].hp > 0 && !segs[j].ward && !segs[j].quartet && !segs[j].mirror && segs[j].kind === 'normal';
  const at = f => { for (let j = Math.round(len * f); j < len; j++) if (free(j)) return segs[j]; return null; };
  if (k === 'mirror' || k === 'finale') for (const f of k === 'finale' ? [0.5] : [0.4, 0.7]) { const c = at(f); if (c) { c.mirror = true; g.events.push({ t: 'btwist', k: 'mirror', x: c.x, y: c.y }); } }
  if (k === 'quartet') {
    let j = Math.round(len * 0.35), n = 0; const got = [];
    while (j < len && n < 4) { if (free(j)) { got.push(segs[j]); n++; j += 2; } else j++; }
    if (n === 4) { for (const c of got) c.quartet = true; g.events.push({ t: 'btwist', k, x: got[0].x, y: got[0].y }); }
  }
}
function bossTwist(g, sn, dt) {
  if (!sn.boss || !sn.p2 || g.mode !== '' || g.phase !== 'play') return;
  const k = bossTwistOf(g.stage); if (!k) return;
  const pt = g.t - sn.p2T, segs = sn.segs, h = segs[0];
  if (k === 'mirror' || k === 'quartet' || k === 'finale') twistCells(g, sn, k);
  if (k === 'drop' || k === 'finale') {
    const bp = beatPeriod(g), P = bp * 4;
    if (Math.floor((pt + bp * 0.9) / P) > Math.floor((pt - dt + bp * 0.9) / P)) g.events.push({ t: 'btwist', k: 'drop', warn: true, x: h.x, y: h.y });
    if (Math.floor(pt / P) > Math.floor((pt - dt) / P)) { sn.tail += DROP_JOLT * (1 - Math.min(1, uv(g, 'tis') / 100)); g.events.push({ t: 'btwist', k: 'drop', x: h.x, y: h.y }); }
  } else if (k === 'swing') {
    if (!(pt - dt > 0)) g.events.push({ t: 'btwist', k, x: h.x, y: h.y });
  } else if (k === 'hold') {
    const ph = pt % HOLD_EVERY;
    if (ph < HOLD_TIME) { for (let i = 1; i <= HOLD_CELLS && i < segs.length; i++) if (segs[i].hp > 0) segs[i].warded = true; if (ph - dt < 1e-6) g.events.push({ t: 'btwist', k, x: h.x, y: h.y }); }
  } else if (k === 'regrow' && Math.floor(pt / REGROW_EVERY) > Math.floor((pt - dt) / REGROW_EVERY)) {
    let n = 0; for (let i = 1; i < segs.length && n < REGROW_CELLS; i++) if (segs[i].hp > 0) { segs[i].hp = Math.min(segs[i].max, segs[i].hp + segs[i].max * REGROW_HEAL * (1 - Math.min(1, uv(g, 'hbk') / 100))); n++; }
    g.events.push({ t: 'btwist', k, x: h.x, y: h.y });
  }
}
// Late species traits (agent 14 round 7): from stage 21 the non-boss snakes of the other eight species behave in their own way.
// Bosses are always sleepy or gloomy (stages 5, 10, ...), so these are the "regular" snakes of the remaining species. No random numbers.
// love: a heart pulse heals the cells nearest the face. rust: creaky stop-and-jerk crawl. grumpy: surges come sooner. disco: the crawl swings on the beat.
// sour: every pop makes it rush for a moment. mighty: slowing effects are weaker. frosty: an ice patch shields two cells. sneezy: a sneeze jolts the whole snake forward.
export const TRAIT_FROM = 21, LOVE_EVERY = 9, LOVE_HEAL = 0.12, LOVE_CELLS = 4, CREAK_EVERY = 7, CREAK_STALL = 0.8, CREAK_JERK = 0.8, GRUMPY_SURGE = 0.7;
export const DISCO_SWING = 0.15, SOUR_RUSH = 0.8, SOUR_MUL = 1.12, MIGHTY_SLOW = 0.75, FROST_EVERY = 9, FROST_TIME = 3, FROST_SIZE = 2, SNEEZE_EVERY = 9, SNEEZE_WARN = 0.5, SNEEZE_JOLT = 36;
export const TRAIT_SKINS = ['love', 'rust', 'grumpy', 'disco', 'sour', 'mighty', 'frosty', 'sneezy'];
export const traitOf = (g, sn) => (g.mode === '' && !sn.boss && g.stage >= TRAIT_FROM ? sn.skin : '');
// Late species traits (stage 41+, batch 10): the same eight species, one step meaner and with a new name. Cues carry late:true. No random numbers.
// love SWEETHEART: each heart pulse also wards the two cells behind the face. rust SEIZED UP: longer stall, harder lurch. sneezy AFTERSHOCK: a half sneeze follows the first.
// grumpy SHORT FUSE: surges come even sooner. disco BIG SWING: the crawl swings wider. sour SUGAR RUSH: a longer, faster rush. mighty IRON HIDE: slows barely work. frosty DOUBLE FROST: two ice patches.
export const LATE_TRAIT_FROM = 41, LOVE_WARD_TIME = 2.5, CREAK_STALL_L = 1.2, CREAK_JERK_L = 1.0, CREAK_PUSH_L = 0.8, SNEEZE_AFTER = 0.6, SNEEZE_AFTER_MUL = 0.5, GRUMPY_LATE = 0.55;
export const DISCO_SWING_L = 0.3, SOUR_RUSH_L = 1.3, SOUR_MUL_L = 1.2, MIGHTY_SLOW_L = 0.92;
export const lateTrait = (g, sn) => (g.stage >= LATE_TRAIT_FROM ? traitOf(g, sn) : '');
const grumpyMul = g => { const m = g.stage >= LATE_TRAIT_FROM ? GRUMPY_LATE : GRUMPY_SURGE; return m + (1 - m) * Math.min(1, uv(g, 'tea') / 100); };   // Chamomile Tea: the surges slow down again
const mightySlow = g => { const m = g.stage >= LATE_TRAIT_FROM ? MIGHTY_SLOW_L : MIGHTY_SLOW; return m - (m - 0.55) * Math.min(1, uv(g, 'hny') / 100); };   // Honey Jar: the slow bites again
function traitSpeed(g, sn) {
  const k = traitOf(g, sn), late = g.stage >= LATE_TRAIT_FROM;
  if (sn.boss && sn.p2 && g.mode === '' && bossTwistOf(g.stage) === 'swing') return 1 + SWING_BOSS * Math.cos(6.2832 * beatPhase(g));   // stage 40: the boss sways on the beat
  if (k === 'disco') return 1 + (late ? DISCO_SWING_L : DISCO_SWING) * (1 - Math.min(1, uv(g, 'muf') / 100)) * Math.cos(6.2832 * beatPhase(g));
  if (k === 'rust') { const ph = g.t % CREAK_EVERY, st = late ? CREAK_STALL_L : CREAK_STALL, jk = late ? CREAK_JERK_L : CREAK_JERK; return ph < st ? 0.3 : ph < st + jk ? 1 + (late ? CREAK_PUSH_L : 0.6) * (1 - Math.min(1, uv(g, 'oil') / 100)) : 1; }
  if (k === 'sour' && sn.rushT > 0) return 1 + ((late ? SOUR_MUL_L : SOUR_MUL) - 1) * (1 - Math.min(1, uv(g, 'swt') / 100));
  return 1;
}
function traitTick(g, sn, dt) {
  if (sn.rushT > 0) sn.rushT -= dt;
  const k = traitOf(g, sn); if (!k || g.phase !== 'play') return;
  const segs = sn.segs, h = segs[0];
  if (k === 'grumpy') { const on = sn.surge === 'warn' ? 1 : 0; if (on && !sn.cue) g.events.push({ t: 'trait', k, x: h.x, y: h.y, late: g.stage >= LATE_TRAIT_FROM }); sn.cue = on || sn.surge === 'go' ? 1 : 0; }   // cue: a scowl as the quick surge winds up
  else if (k === 'mighty') { const on = sn.slow > 0 ? 1 : 0; if (on && !sn.cue) g.events.push({ t: 'trait', k, x: h.x, y: h.y, late: g.stage >= LATE_TRAIT_FROM }); sn.cue = on; }   // cue: shrugs off a slow
  else if (k === 'disco') { const bar = Math.floor(g.t / (beatPeriod(g) * 4)) + 1; if (bar !== sn.cue) { sn.cue = bar; g.events.push({ t: 'trait', k, x: h.x, y: h.y, late: g.stage >= LATE_TRAIT_FROM }); } }   // cue: a mirror-ball flash on every bar
  if (k === 'love') {
    sn.loveT = (sn.loveT === undefined ? LOVE_EVERY : sn.loveT) - dt;
    if (sn.loveT <= 0) { sn.loveT = LOVE_EVERY; let n = 0; for (let i = 1; i < segs.length && n < LOVE_CELLS; i++) if (segs[i].hp > 0) { segs[i].hp = Math.min(segs[i].max, segs[i].hp + segs[i].max * LOVE_HEAL * (1 - Math.min(1, uv(g, 'hbk') / 100))); n++; } g.events.push({ t: 'trait', k, x: h.x, y: h.y, late: g.stage >= LATE_TRAIT_FROM }); if (g.stage >= LATE_TRAIT_FROM) sn.cue = g.t; }
    if (g.stage >= LATE_TRAIT_FROM && sn.cue > 0 && g.t - sn.cue < LOVE_WARD_TIME * (1 - Math.min(1, uv(g, 'hwd') / 100))) for (let i = 1; i < 3 && i < segs.length; i++) if (segs[i].hp > 0) segs[i].warded = true;
  } else if (k === 'rust') {
    const ph = g.t % CREAK_EVERY, on = ph < (g.stage >= LATE_TRAIT_FROM ? CREAK_STALL_L : CREAK_STALL);
    if (on && !sn.creak) g.events.push({ t: 'trait', k, x: h.x, y: h.y, late: g.stage >= LATE_TRAIT_FROM });
    sn.creak = on;
  } else if (k === 'sneezy') {
    sn.snzT = (sn.snzT === undefined ? SNEEZE_EVERY : sn.snzT) - dt;
    if (sn.snzT <= SNEEZE_WARN && !sn.snzW) { sn.snzW = true; g.events.push({ t: 'trait', k, x: h.x, y: h.y, warn: true }); }
    if (sn.snzT <= 0) { sn.snzT = SNEEZE_EVERY; sn.snzW = false; sn.tail += SNEEZE_JOLT * (1 - Math.min(1, uv(g, 'tis') / 100)); g.events.push({ t: 'trait', k, x: h.x, y: h.y, late: g.stage >= LATE_TRAIT_FROM }); if (g.stage >= LATE_TRAIT_FROM) sn.cue = g.t + SNEEZE_AFTER; }
    if (sn.cue > 0 && g.t >= sn.cue) { sn.cue = 0; sn.tail += SNEEZE_JOLT * SNEEZE_AFTER_MUL * (1 - Math.min(1, uv(g, 'tis') / 100)); g.events.push({ t: 'trait', k, x: h.x, y: h.y, late: true }); }
  } else if (k === 'frosty') {
    for (const q of segs) q.frost = false;
    if (segs.length < FROST_SIZE + 6) return;
    const w = Math.floor(g.t / FROST_EVERY), ph = g.t - w * FROST_EVERY;
    if (ph < FROST_EVERY - FROST_TIME) { sn.frostW = -1; return; }
    const late = g.stage >= LATE_TRAIT_FROM;
    for (let n = 0; n < (late ? 2 : 1); n++) {
      const a = 1 + ((w * 5 + 2 + n * (segs.length >> 1)) % (segs.length - FROST_SIZE - 1));
      if (n === 0 && sn.frostW !== w) { sn.frostW = w; const c = segs[Math.min(segs.length - 1, a)]; g.events.push({ t: 'trait', k, x: c.x, y: c.y, late }); }
      for (let j = a; j < a + FROST_SIZE && j < segs.length; j++) if (segs[j].hp > 0) { segs[j].frost = true; segs[j].warded = true; }
    }
  }
}
// Ring stage twist (batch 10): from the fifth ring stage (24) the record skips. A scratch warns RING_SKIP_WARN seconds ahead, then the whole spiral
// hops RING_SKIP_JOLT px toward the circle. Bosses are left alone (ring stage 30 is a boss). No random numbers.
function ringSkip(g, sn, dt) {
  if (!g.ring || sn.boss || g.stage < RING_SKIP_FROM || g.phase !== 'play') return;
  const prev = sn.skipT; sn.skipT -= dt;
  if (prev > RING_SKIP_WARN && sn.skipT <= RING_SKIP_WARN) g.events.push({ t: 'ringskip', warn: true, x: sn.segs[0].x, y: sn.segs[0].y });
  if (sn.skipT <= 0) { sn.skipT = RING_SKIP_EVERY; sn.tail += RING_SKIP_JOLT; g.events.push({ t: 'ringskip', x: sn.segs[0].x, y: sn.segs[0].y }); }
}
// Bell cell (stage 34+, regular snakes): pop it and it rings, hurting the cells either side of it. The Bridge card makes it ring harder.
export const BELL_FROM = 34, BELL_DMG = 0.25, BELL_REACH = 3;
function bellRing(g, s, sn) {
  const segs = sn.segs, k = BELL_DMG * (1 + uv(g, 'brg') / 100);
  const k0 = segs.indexOf(s);   // the current place in the chain: s.i is only the index it was born with and drifts once cells ahead of it pop
  for (let j = Math.max(1, k0 - BELL_REACH); j <= Math.min(segs.length - 1, k0 + BELL_REACH); j++) { const q = segs[j]; if (q !== s && q.hp > 0) damageSegAs('bell', g, q, q.max * k, false, q.x, q.y); }
  if (uv(g, 'fan') > 0 && uv(g, 'brg') > 0) for (let n = 0; n < 3; n++) bumpGroove(g);
  g.events.push({ t: 'bell', x: s.x, y: s.y });
}
function wardTick(sn) {
  const segs = sn.segs;
  sn.drum = false;
  for (let i = 0; i < segs.length; i++) { segs[i].warded = false; if (segs[i].drum && segs[i].hp > 0) sn.drum = true; }
  for (let i = 1; i < segs.length; i++) if (segs[i].ward && segs[i].hp > 0) for (let j = Math.max(1, i - WARD_REACH); j <= Math.min(segs.length - 1, i + WARD_REACH); j++) if (j !== i) segs[j].warded = true;
}
// Encore blast: hits and kills fill the meter, tap the duo (or the button) to fire a beam straight up.
export const ENCORE_HIT = 0.007, ENCORE_KILL = 0.012, ENCORE_CLUTCH = 0.08, ENCORE_DMG = 8, ENCORE_W = 36, CLUTCH_DIST = 200;
const addEncore = (g, v) => { g.encore = Math.min(1, g.encore + v * (1 + uv(g, 'enc') / 100)); if (g.encore >= 1 && !g.encoreReady) { g.encoreReady = true; g.events.push({ t: 'encoreready' }); } };
export function fireEncore(g) {
  if (g.phase !== 'play' || g.encore < 1) return false;
  const p = g.p; g.encore = 0; g.encoreReady = false; g.encoreUsed++; const bw = ENCORE_W * (1 + uv(g, 'enc') / 200); g.beam = { x: p.x, t: 0.5, w: bw, a: g.ring ? p.aim : -Math.PI / 2 };
  if (g.ring) { const ex = p.x + Math.cos(p.aim) * 1500, ey = p.y + Math.sin(p.aim) * 1500; for (const sn of g.snakes) for (const s of sn.segs) if (s.hp > 0 && !s.shield && !s.wave && distToSeg(s.x, s.y, p.x, p.y, ex, ey) < s.r + bw) damageSegAs('encore', g, s, dmgMul(g) * ENCORE_DMG, true, s.x, s.y); }   // b11: a circle stage fires the beam along the aim
  else for (const sn of g.snakes) for (const s of sn.segs) if (s.hp > 0 && !s.shield && !s.wave && s.y < p.y && Math.abs(s.x - p.x) < s.r + bw) damageSegAs('encore', g, s, dmgMul(g) * ENCORE_DMG, true, s.x, s.y);
  g.events.push({ t: 'encore', x: p.x });
  return true;
}

export function startStage(g, n) {
  g.stage = n; g.skin = skinOf(g, n);
  g.snakes.length = 0; g.stageHpMax = 0; g.zones.length = 0; g.maws.length = 0; g.bullets.length = 0; g.vq.length = 0;
  g.path = buildPath(n);
  const p = g.p;
  g.mod = g.mode === '' ? stageMod(n) : null; if (g.mod && g.mod.coin) g.coinK *= g.mod.coin;
  g.ring = g.mode === '' && stageKind(n) === 'ring' ? RING : null;
  g.upgradeLeft = 0;
  p.zone = g.ring ? { x0: RING.cx, x1: RING.cx } : { x0: 40, x1: W - 40 }; p.aim = -Math.PI / 2; p.x = W / 2; p.y = g.ring ? RING.cy : ROW_Y; p.kx = 0;
  if (g.mode === '' && stageKind(n) === 'double') { const L = snakeLength(n); spawnSnake(g, n, { len: Math.ceil(L * 0.6) }); spawnSnake(g, n, { len: Math.ceil(L * 0.55), mirror: true, startPs: -520 }); }
  else spawnSnake(g, n);
  rebuildTowers(g);
  g.phase = 'play'; g.clearT = 0; g.progress = 0;
  g.events.push({ t: 'stage', n, boss: isBossStage(n), skin: g.skin, name: nameOf(g), mod: g.mod ? g.mod.name : '' });
}

// ---------------------------------------------------------------- game
export function createGame(opts = {}) {
  const unlocked = Object.fromEntries(WEAPON_STARTERS.map(id => [id, 1]));
  const skillLv = Object.fromEntries(WEAPON_STARTERS.map(id => [id, 1]));
  if (opts.skills) for (const id of Object.keys(opts.skills)) { const lv = opts.skills[id]; if (lv > 0) { unlocked[id] = 1; skillLv[id] = lv; } else if (!WEAPON_STARTERS.includes(id)) delete unlocked[id]; }
  if (opts.unlocked) for (const id of Object.keys(opts.unlocked)) { unlocked[id] = 1; skillLv[id] = skillLv[id] || 1; }
  // the loadout: only these (up to five) can be offered in a run. Default: everything owned, first five.
  const loadout = (opts.loadout || Object.keys(unlocked)).filter(id => unlocked[id]).slice(0, LOADOUT_SIZE);
  const g = {
    rand: rng(opts.seed || 1), t: 0, phase: 'play', stage: 0, sid: 0, path: null,
    p: makePlayer(opts.meta, mergeBonus(petBonus(opts.pets), keepBonus(opts.arts)), opts.petEquip), mode: opts.mode || '', hard: !!opts.hard, revivesLeft: 3, revivesUsed: 0, dmgBy: {}, src: '', coinK: (opts.mode === 'pig' ? 6 : 1) * (opts.hard ? 2 : 1), pets: (opts.petEquip || []).slice(0, PET_SLOTS), petStars: opts.pets || {}, perk: opts.outfit && OUTFIT[opts.outfit] ? { id: OUTFIT[opts.outfit].weapon, mul: OUTFIT[opts.outfit].mul } : null, outfit: opts.outfit && OUTFIT[opts.outfit] ? { hat: OUTFIT[opts.outfit].hat, color: OUTFIT[opts.outfit].color } : null, petT: {}, snakes: [], bullets: [], vq: [], pickups: [], zones: [], maws: [], towers: [],
    events: [], ups: {}, val: {}, weap: {}, unlocked, skillLv, loadout,
    level: 1, cells: 0, upgradeLeft: 0, pending: 0, choices: [], resume: 'play', rerolls: 4,
    coins: 0, kills: 0, score: 0, combo: 0, lastKill: -99, stageHp: 0, stageHpMax: 0, progress: 0, clearT: 0, lastKillPos: { x: W / 2, y: 300 },
    groove: 0, grooveT: 0, grooveMax: 0, chestsOpened: 0, faceMax: 0, bombsPopped: 0, dangerT: 0, danger: 0, mod: null, frags: {}, revived: false, result: null, bot: !!opts.bot, shots: 0, leaks: 0,
    encore: 0, encoreUsed: 0, beam: null, goldPopped: 0, snacks: 0, clutches: 0, qStreak: 0, qBest: 0,
    skin: '', ring: null, beatShots: 0, beatN: 0, beatLast: -1, bpool: [], cp: null, encoreReady: false, quartets: 0,
  };
  startStage(g, opts.stage || 1);
  return g;
}

// Rhythm: a fixed beat per stage band (same tempo family as the music). A note fired right on the beat
// gets a small crit chance bonus and builds a touch of groove. Deterministic: it only reads g.t.
export const BEAT_WIN = 0.07, BEAT_CRIT = 0.1;
export const beatBpm = stage => (stage % 5 === 0 ? 138 : 104 + 3 * (Math.floor(Math.max(0, stage - 1) / 5) % 6));
export const beatPeriod = g => 60 / beatBpm(g.stage || 1);
export const beatPhase = g => { const T = beatPeriod(g); return (g.t % T) / T; };
export const onBeat = g => { const T = beatPeriod(g), d = g.t % T; return Math.min(d, T - d) < BEAT_WIN; };
// Beat Run (batch 11): a volley inside the beat window on BEATRUN_LEN beats in a row pays a burst of Groove. Misses just restart the count. No random numbers.
export const BEATRUN_FROM = 8, BEATRUN_LEN = 3, BEATRUN_GROOVE = 4;
function beatRun(g) {
  const idx = Math.round(g.t / beatPeriod(g));
  if (idx === g.beatLast) return;
  g.beatN = idx === g.beatLast + 1 ? g.beatN + 1 : 1; g.beatLast = idx;
  if (g.beatN >= BEATRUN_LEN) { g.beatN = 0; for (let n = 0; n < BEATRUN_GROOVE; n++) bumpGroove(g); g.events.push({ t: 'beatrun', x: g.p.x, y: g.p.y - 60 }); }
}
// b15: the snake comes in from UNDER the gate line below the HUD: cells above it are not drawn, not targeted and not hit
let GATE = 182, HIT_GATE = 0;
export const gateY = g => (g.ring ? 8 : isBossStage(g.stage) ? 215 : 182);   // circle stages have no gate: the snake spirals in around the duo, not down from the top
// the strip under the HUD is not shootable any more, so lane snakes crawl a little slower: a cell keeps the same time in the shootable part of the field (rings are unchanged)
export const gateSlow = (g, path) => { if (g.ring || !path) return 1; const d8 = distAtY(path, 8), dg = distAtY(path, gateY(g)); return Math.sqrt(Math.min(1, Math.max(0.5, Math.min((path.len - dg) / Math.max(200, path.len - d8), (LINE_Y - gateY(g)) / (LINE_Y - 8))))); };   // half of the lost share (the stricter of the path based and the height based one): the hits above the gate were cheap ones, and the win rates of the old stages stay close
const visible = s => s.y > GATE && s.y < H - 8 && s.x > 8 && s.x < W - 8;
// accumulated effect of a run upgrade: summed rarity values, or the common value per pick if set directly
const UPV = Object.fromEntries([...CAPSULE_UPS, ...PASSIVES].map(u => [u.id, u]));
export const uv = (g, id) => (g.val && g.val[id] !== undefined ? g.val[id] : (g.ups[id] || 0) * UPV[id].vals[0]);
const lv = (g, id) => (g.weap[id] ? g.weap[id].lv : 0);
export const GROOVE_MAX = 20;
// Groove: every note that lands builds it, a pause in the hits lets it fade. Each point is +1.5% damage.
const dmgMul = g => 10 * g.p.atk * (1 + uv(g, 'power') / 100) * (1 + 0.015 * (1 + uv(g, 'fan') / 100) * g.groove) * (g.qStreak > 0 ? 1 + Math.min(g.qStreak, QSTREAK_CAP) * uv(g, 'cres') / 100 : 1);   // x10: damage and HP are shown as big numbers
function bumpGroove(g) {
  g.grooveT = 0; addEncore(g, ENCORE_HIT);
  if (g.groove < GROOVE_MAX) { g.groove++; if (g.groove > g.grooveMax) g.grooveMax = g.groove; if (g.groove % 5 === 0) g.events.push({ t: 'groove', n: g.groove }); }
}
const cdMul = g => g.p.cdBase * Math.max(0.3, 1 - uv(g, 'haste') / 100);

function eachTarget(g, fn) {
  const sns = g.snakes;
  for (let a = 0; a < sns.length; a++) { const sn = sns[a], segs = sn.segs; for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (s.hp > 0 && !s.shield && !s.wave) fn(s, sn); } }
}
// the visible targets in one reused array (the satellite and maw pick from it every few seconds): valid until the next call
const VIS = [];
function visibleTargets(g) {
  VIS.length = 0;
  const sns = g.snakes;
  for (let a = 0; a < sns.length; a++) { const segs = sns[a].segs; for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (s.hp > 0 && !s.shield && !s.wave && visible(s)) VIS.push(s); } }
  return VIS;
}
function nearestTarget(g, x, y, maxD = 1e9) {
  let best = null, bd = maxD;
  const sns = g.snakes;
  for (let a = 0; a < sns.length; a++) {
    const segs = sns[a].segs;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.hp <= 0 || s.shield || s.wave || !visible(s)) continue;
      const dx = s.x - x, dy = s.y - y, d = Math.sqrt(dx * dx + dy * dy) - s.r;
      if (d < bd) { bd = d; best = s; }
    }
  }
  return best;
}
const frontSegs = g => g.snakes.map(sn => sn.segs[0]).filter(s => s && visible(s));

const damageSegAs = (src, g, s, dmg, crit, x, y) => { g.src = src; damageSeg(g, s, dmg, crit, x, y); g.src = ''; };   // b12 perf: fixed arguments, no rest array and spread per hit
function damageSeg(g, s, dmg, crit, x, y) {
  if (s.hp <= 0 || s.shield || s.wave) return;
  const srcId = g.src || 'capsule'; g.dmgBy[srcId] = (g.dmgBy[srcId] || 0) + Math.min(dmg, s.hp);
  if (s.warded) dmg *= WARD_CUT + (1 - WARD_CUT) * (uv(g, 'fork') + (s.frost ? uv(g, 'brk') : 0)) / 100;
  const full = dmg, glance = s.mirror && !splashing, fresh = s.flash <= 0;
  if (glance) dmg *= 1 - 2 * mirrorSide(g);
  const shut = s.shell && shellBlocked(g, s); if (shut) dmg *= SHELL_CUT;
  s.hp -= dmg; s.flash = 0.12;
  g.events.push({ t: 'hit', x: x ?? s.x, y: y ?? s.y, d: dmg, crit: !!crit, s, src: srcId });
  if (shut && fresh) g.events.push({ t: 'shell', x: s.x, y: s.y });
  if (glance) { mirrorSplash(g, s, full); if (fresh) g.events.push({ t: 'mirror', x: s.x, y: s.y }); }
}
function dropPickup(g, kind, x, y, v) {
  const a = g.rand() * TAU, sp = 90 + g.rand() * 170;
  g.pickups.push({ kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, v, age: 0, vac: false });
}
function randomFragment(g) {
  const ids = WEAPONS.map(w => w.id);
  return ids[Math.floor(g.rand() * ids.length)];
}

// Equipped pets help now and then. Stars make them quicker or stronger.
function petTick(g, dt) {
  const p = g.p, st = id => g.petStars ? g.petStars[id] || 1 : 1;
  for (const id of g.pets) {
    const t = (g.petT[id] = (g.petT[id] || 0) + dt), n = st(id);
    if (id === 'kitten' && t > 20 - 2 * n) { g.petT[id] = 0; for (const w of Object.values(g.weap)) w.cd = 0; g.events.push({ t: 'pet', id }); }
    else if (id === 'puppy' && t > 11) { g.petT[id] = 0; const all = g.snakes.flatMap(sn => sn.segs).filter(q => visible(q) && !q.shield && q.hp > 0).sort((a, b) => b.y - a.y).slice(0, 2 + (n >= 3 ? 1 : 0)); for (const q of all) damageSegAs('puppy', g, q, dmgMul(g) * (3 + n), false, q.x, q.y); g.events.push({ t: 'pet', id }); }
    else if (id === 'lamb' && t > 24 - 2 * n) { g.petT[id] = 0; knockBack(g, 60 + 15 * n); g.events.push({ t: 'pet', id }); }
    else if (id === 'turtle' && t > 10) { g.petT[id] = 0; for (const sn of g.snakes) sn.slow = Math.max(sn.slow, 2 + 0.5 * n); g.events.push({ t: 'pet', id }); }
  }
}
function onKill(g, s, sn) {
  const st = g.stage;
  g.kills++; g.cells++;
  if (s.kind === 'upgrade') { g.pending++; g.upgradeLeft = Math.max(0, g.upgradeLeft - 1); g.events.push({ t: 'upgradecell', x: s.x, y: s.y }); }   // yellow cell: pick an upgrade
  g.lastKillPos = { x: s.x, y: s.y };
  g.combo = g.t - g.lastKill < 2.2 ? Math.min(99, g.combo + 1) : 1; g.lastKill = g.t;
  g.score += Math.round(s.max * (1 + Math.min(g.combo, 50) * 0.05));
  const coinV = (1 + Math.floor(st / 2)) * (s.isHead ? 3 : 1) * (s.kind === 'armor' ? 2 : 1);
  if (s.kind === 'upgrade') { for (let k = 0; k < 3; k++) dropPickup(g, 'coin', s.x, s.y, coinV); if (g.rand() < 0.3) dropPickup(g, ['heal', 'shield', 'rage'][Math.floor(g.rand() * 3)], s.x, s.y, 1); }
  else dropPickup(g, 'coin', s.x, s.y, coinV);
  if (s.carry === 'chest') { g.pickups.push({ kind: 'chest', x: s.x, y: s.y, vx: 0, vy: 40, v: 1, age: 0, vac: false }); g.events.push({ t: 'chestdrop', x: s.x, y: s.y }); }
  addEncore(g, ENCORE_KILL);
  if (s.gold && s.goldT > 0) { g.goldPopped++; const v = coinV * GOLD_MUL * (1 + uv(g, 'gear') / 200); g.coins += v * g.p.coinMul * (g.coinK || 1); g.events.push({ t: 'goldpop', x: s.x, y: s.y, v: Math.round(v * g.p.coinMul * (g.coinK || 1)) }); }
  if (!s.isHead && s.y > LINE_Y - CLUTCH_DIST) { g.clutches++; addEncore(g, ENCORE_CLUTCH); g.events.push({ t: 'clutch', x: s.x, y: s.y }); }
  g.events.push({ t: 'kill', x: s.x, y: s.y, r: s.r, kind: s.kind, head: s.isHead, boss: sn.boss, i: s.i, skin: sn.skin, carry: s.carry, choir: !!s.choir });
  quartetKill(g, s, sn, coinV);
  if (s.bell) bellRing(g, s, sn);
  if (s.metro) { const hit = onBeat(g); if (hit) { const v = coinV * METRO_MUL * (1 + uv(g, 'gear') / 200); g.coins += v * g.p.coinMul * (g.coinK || 1); for (let n = 0; n < 4; n++) bumpGroove(g); g.events.push({ t: 'metro', x: s.x, y: s.y, hit, v: Math.round(v * g.p.coinMul * (g.coinK || 1)) }); } else g.events.push({ t: 'metro', x: s.x, y: s.y, hit }); }
  if (s.snack) snackDrop(g, s);
  if (s.mirror) g.events.push({ t: 'mirror', x: s.x, y: s.y, brk: true });
  if (s.pillow) { knockBack(g, PILLOW_PUSH); g.events.push({ t: 'pillow', x: s.x, y: s.y }); }
  if (traitOf(g, sn) === 'sour') { if (!(sn.rushT > 0)) g.events.push({ t: 'trait', k: 'sour', x: sn.segs[0].x, y: sn.segs[0].y, late: g.stage >= LATE_TRAIT_FROM }); sn.rushT = g.stage >= LATE_TRAIT_FROM ? SOUR_RUSH_L : SOUR_RUSH; }
  if ((s.ward || s.lull || s.drum || s.bell) && uv(g, 'chk') > 0) { addEncore(g, uv(g, 'chk') / 100); g.events.push({ t: 'soundcheck', x: s.x, y: s.y }); }
  if (s.lull) { for (const o of g.snakes) o.slow = Math.max(o.slow, LULL_TIME * (1 + uv(g, 'fork') / 100)); g.events.push({ t: 'lull', x: s.x, y: s.y }); }
  if (s.kind === 'bomb') {
    g.bombsPopped++;
    const R = 150;
    g.events.push({ t: 'boom', x: s.x, y: s.y, r: R });
    for (const o of g.snakes) for (const q of o.segs) if (q !== s && q.hp > 0 && hyp(q.x - s.x, q.y - s.y) < R + q.r) damageSeg(g, q, Math.max(2, s.max * 0.9), false, q.x, q.y);
  }
}

// Remove dead cells. The serpent stays one connected chain: the cells in front of a gap slide back to
// close it (see the chain update in step), so it just gets shorter. The face pops once it is alone.
const isDead = q => q.hp <= 0, isUncounted = q => q.hp <= 0 && !q.counted, isAlive = q => q.hp > 0, isEmptySn = sn => sn.segs.length === 0;
function reap(g) {
  for (let pass = 0; pass < 8; pass++) {
    let any = false;
    for (const sn of g.snakes) {
      if (sn.segs.length === 1 && sn.segs[0].hp > 0) { sn.segs[0].shield = false; sn.segs[0].hp = 0; }
      if (!sn.segs.some(isDead)) continue;
      any = true;
      // a bomb blast inside onKill can kill cells we already walked past (in front of the bomb): keep going until every dead cell has been counted
      for (let guard = 0; guard < 30 && sn.segs.some(isUncounted); guard++) for (const q of sn.segs.slice()) if (q.hp <= 0 && !q.counted) { q.counted = true; onKill(g, q, sn); }
      sn.segs = sn.segs.filter(isAlive);
      g.events.push({ t: 'close' });
    }
    if (g.snakes.some(isEmptySn)) g.snakes = g.snakes.filter(sn => sn.segs.length > 0);
    if (!any) break;
  }
}

// The face reached the line: the run is over (unless an Encore saves it).
const knockBack = (g, px) => { for (const sn of g.snakes) { sn.tail -= px; for (const q of sn.segs) { q.ps -= px; if (q.tp !== undefined) q.tp -= px; } sn.breach = false; } };
function loseRun(g) {
  const p = g.p;
  if (g.phase === 'dead') return;
  if (p.revive > 0 && !g.revived) { g.revived = true; p.revive = 0; knockBack(g, 520); g.events.push({ t: 'revive' }); return; }
  g.phase = 'dead'; g.result = makeResult(g, false); g.events.push({ t: 'dead' });
}
export const reviveCost = used => 10 * (used + 1);
// Revive: back up with half HP and the whole snake knocked back.
export function reviveGame(g) {
  if (g.phase !== 'dead' || g.revivesLeft < 1) return false;
  g.revivesLeft--; g.revivesUsed++; g.phase = 'play'; g.result = null;
  knockBack(g, 520);
  g.events.push({ t: 'revive' });
  return true;
}
export const quitResult = g => makeResult(g, false);   // GIVE UP from the pause menu: the same result a loss gives (mode, hard, progress, damage)
function makeResult(g, won) {
  return { chests: g.chestsOpened, groove: g.grooveMax, picks: g.level - 1, won, stage: g.stage, kills: g.kills, coins: Math.floor(g.coins), score: g.score, level: g.level, time: g.t, boss: isBossStage(g.stage), name: nameOf(g), mode: g.mode, bombs: g.bombsPopped, stars: won && !g.mode && !g.hard ? 1 + (g.revivesUsed === 0 && !g.revived ? 1 : 0) + (g.faceMax < 0.8 ? 1 : 0) : 0, mod: g.mod ? g.mod.id : '', hard: g.hard, cp50: !!(g.cp && g.cp[0.5]), quartets: g.quartets || 0, qBest: g.qBest || 0, progress: g.progress, dmgBy: { ...g.dmgBy }, frags: { ...g.frags } };
}
// ---------------------------------------------------------------- skill picks
// what an upgrade does now and after this pick, so every pick is visible in numbers
const STAT_NAME = { aspd: 'Attack speed', notes: 'Notes per shot', burst: 'Bursts per shot', cdmg: 'Capsule damage' };
function statText(id, cur, add) {
  if (id === 'notes' || id === 'burst') return `${STAT_NAME[id]}: ${1 + cur} → ${1 + cur + add}`;
  return `${STAT_NAME[id] || UPV[id].name}: +${cur}% → +${cur + add}%`;
}
// In the first stages the upgrade cards are weak; they grow to full strength by stage ten.
const COUNT_UPS = new Set(['notes', 'burst', 'speed']);
const earlyMul = stage => clamp(0.5 + 0.055 * (stage - 1), 0.5, 1);
// Flat DPS of a card: how much damage per second it adds to the STARTING gun, whatever you already own, so a card is the same tier
// in every run (1 DPS = 1% of the starting gun's damage per second). Skills count as a fixed slice of that gun's damage.
// Returns null for cards that are not about damage (defence, utility): those keep their rolled tier.
export function dpsGain(g, c) {
  const v = c.gain; if (!(v > 0)) return null;
  switch (c.id) {
    case 'aspd': case 'cdmg': return v;
    case 'notes': case 'burst': return 100 * v;
    case 'power': return 1.2 * v;
    case 'crit': return 1.4 * v;
    case 'haste': return v / (1 - v / 100);
    case 'dbeat': return 0.5 * v;
    case 'fan': return 0.15 * v;
    case 'speed': return 4 * v;
    default:
      if (c.kind === 'weapon') return c.lvl ? 6 * v : 12 * (1 + 0.3 * (v - 1));
      return null;
  }
}
function rollChoices(g) {
  const pool = [];
  const early = g.level < 3;   // the first two picks are capsule upgrades only
  const luck = (g.level - 1) * clamp((g.stage || 1) / 10, 0.1, 1);   // early stages: poor luck
  const stg = g.stage || 1;
  for (const u of CAPSULE_UPS) { const l = g.ups[u.id] || 0, cur = uv(g, u.id); if (l < u.max && cur < u.cap && !(u.minStage && stg < u.minStage)) pool.push({ id: u.id, kind: 'capsule', name: u.name, u, lvl: l, max: u.max, isNew: !l, w: u.w * (early ? 2 : 1) }); }
  if (!early) {
    const owned = Object.keys(g.weap).length;
    for (const w of WEAPONS) {
      if (!g.loadout.includes(w.id)) continue;
      const l = lv(g, w.id);
      if (l >= w.max || (!l && owned >= LOADOUT_SIZE)) continue;
      pool.push({ id: w.id, kind: 'weapon', name: w.name, desc: w.desc, lvl: l, max: w.max, isNew: !l, w: l ? 1.7 : 1.2 });
    }
  }
  if (!early || stg < 3) {   // the first two picks are the capsule's, except in the first stages where only a few kinds exist yet
    for (const u of PASSIVES) { const l = g.ups[u.id] || 0; if (l < u.max && uv(g, u.id) < u.cap && !(u.minStage && stg < u.minStage) && !(u.skin && !l && u.skin !== g.skin) && !(u.reg && (isBossStage(stg) || g.mode))) pool.push({ id: u.id, kind: 'passive', name: u.name, u, lvl: l, max: u.max, isNew: !l, w: u.w }); }
  }
  const out = [];
  while (out.length < 3 && pool.length) {
    const tot = pool.reduce((a, u) => a + u.w, 0);
    let r = g.rand() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
    out.push(pool.splice(k, 1)[0]);
  }
  // Speed and damage are common kinds; extra notes are at least rare and extra bursts at least epic (they add the most DPS).
  // One random card is always common, so it has to be a kind that can be common.
  const canBeCommon = c => !(c.u && c.u.min);
  let eligible = out.map((c, i) => i).filter(i => canBeCommon(out[i]));
  if (!eligible.length && out.length) {
    const alt = CAPSULE_UPS.filter(u => !u.min && (g.ups[u.id] || 0) < u.max && uv(g, u.id) < u.cap && !out.some(o => o.id === u.id))[0] || PASSIVES.find(u => (g.ups[u.id] || 0) < u.max && !out.some(o => o.id === u.id));
    if (alt) { const l = g.ups[alt.id] || 0; out[out.length - 1] = { id: alt.id, kind: CAPSULE_UPS.includes(alt) ? 'capsule' : 'passive', name: alt.name, u: alt, lvl: l, max: alt.max, isNew: !l, w: 1 }; eligible = [out.length - 1]; }
  }
  const common = eligible.length ? eligible[Math.floor(g.rand() * eligible.length)] : -1;
  out.forEach((c, i) => {
    c.rarity = i === common ? 0 : Math.max((c.u && c.u.min) || 0, rollRarity(g.rand, luck));
    if (c.kind === 'weapon') {
      c.gain = Math.min(c.max - c.lvl, [1, 1, 2, 2, 3, 3][c.rarity]);
      c.stat = c.isNew ? `New skill, starts at Lv ${c.gain}` : `Level ${c.lvl} → ${c.lvl + c.gain}`;
    } else {
      const raw = c.u.vals[c.rarity], add = COUNT_UPS.has(c.id) ? raw : Math.max(1, Math.round(raw * earlyMul(stg))), cur = uv(g, c.id), room = c.u.cap - cur;
      c.gain = Math.min(add, room);
      c.desc = c.u.fmt(c.gain);
      c.stat = c.kind === 'capsule' ? statText(c.id, cur, c.gain) : '';
    }
  });
  // b15: name the tier by the DPS the card adds (defence and utility cards keep their rolled tier)
  for (const c of out) { c.roll = c.rarity; const d = dpsGain(g, c); if (d !== null) { c.dps = d; c.rarity = dpsRarity(d); } }
  return out;
}
function maybeLevelUp(g) {
  if (g.pending > 0 && (g.phase === 'play' || g.phase === 'clear')) {
    g.resume = g.phase; g.phase = 'levelup';
    g.choices = rollChoices(g);
    if (!g.choices.length) { g.pending = 0; g.phase = g.resume; return; }
    g.events.push({ t: 'levelup', level: g.level });
  }
}
// Skip the cards: take Beats instead.
export function skipPick(g) {
  if (g.phase !== 'levelup') return false;
  g.coins += (20 + 4 * g.stage) * g.p.coinMul; g.pending--; g.events.push({ t: 'skip' });
  if (g.pending > 0) { g.choices = rollChoices(g); if (!g.choices.length) { g.pending = 0; g.phase = g.resume; } } else g.phase = g.resume;
  return true;
}
export function reroll(g) {
  if (g.phase !== 'levelup' || g.rerolls <= 0) return false;
  g.rerolls--; g.choices = rollChoices(g);
  return true;
}
function rebuildTowers(g) {
  const L = lv(g, 'tower'), n = L ? 1 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0) : 0;
  const offs = g.ring ? [[-100, -50], [100, -50], [0, -90]] : [[-150, -190], [150, -190], [0, -300]], p = g.p;
  g.towers = Array.from({ length: n }, (_, i) => ({ x: p.x + offs[i][0], y: p.y + offs[i][1], cd: 0.8 + i * 0.4, pulse: 0 }));
}
export function choose(g, idx) {
  if (g.phase !== 'levelup') return false;
  const c = g.choices[idx];
  if (!c) return false;
  const gain = c.gain || (c.kind === 'weapon' ? 1 : c.u ? c.u.vals[c.rarity || 0] : (UPV[c.id] ? UPV[c.id].vals[0] : 1));
  if (c.kind === 'weapon') {
    const w = g.weap[c.id] || (g.weap[c.id] = { lv: 0, cd: 0.5 });
    w.lv = Math.min(WEAPON[c.id].max, w.lv + gain);
    if (c.id === 'tower') rebuildTowers(g);
  } else if (c.kind === 'passive') { const cur = uv(g, c.id); PASSIVE[c.id].apply(g.p, gain, g); g.val[c.id] = cur + gain; g.ups[c.id] = (g.ups[c.id] || 0) + 1; }
  else { g.val[c.id] = uv(g, c.id) + gain; g.ups[c.id] = (g.ups[c.id] || 0) + 1; }
  g.pending--; g.level++;
  g.events.push({ t: 'upgrade', id: c.id, kind: c.kind, rarity: c.rarity || 0 });
  if (g.pending > 0) { g.choices = rollChoices(g); if (!g.choices.length) { g.pending = 0; g.phase = g.resume; } } else g.phase = g.resume;
  return true;
}
function collect(g, pk) {
  const p = g.p;
  if (pk.kind === 'heal') { for (const sn of g.snakes) sn.slow = Math.max(sn.slow, 5); g.events.push({ t: 'power', kind: 'heal', x: pk.x, y: pk.y }); return; }   // a hush: the snake crawls for a while
  if (pk.kind === 'shield') { knockBack(g, 200); g.events.push({ t: 'power', kind: 'shield', x: pk.x, y: pk.y }); return; }   // a wall of sound pushes it back
  if (pk.kind === 'rage') { p.rage = 8; g.events.push({ t: 'power', kind: 'rage', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'chest') {   // chests give Beats and a skill fragment, never a skill pick
    const id = randomFragment(g);
    const cp = pk.cp || 0;
    g.coins += (4 + g.stage * 2) * p.coinMul * (cp ? cp * 2 : 1) * (g.coinK || 1); if (!cp) g.frags[id] = (g.frags[id] || 0) + 1; g.chestsOpened++;
    g.events.push({ t: 'chest', x: pk.x, y: pk.y, frag: id }); return;
  }
  if (pk.kind === 'coin') { g.coins += pk.v * p.coinMul * (g.coinK || 1) * (g.groove >= 15 ? 1.25 : 1); g.events.push({ t: 'coin', x: pk.x, y: pk.y, v: pk.v }); }
}

// ---------------------------------------------------------------- shooting and skills
const hyp = (x, y) => Math.sqrt(x * x + y * y);   // Math.hypot allocates a number per call on V8; the sim only needs short distances
const BULLET_POOL_MAX = 96;
const BULLET_SRC = { needle: 'needles', snot: 'dragon', bubble: 'bubble' };
function fire(g, o) {
  const free = g.bpool, b = free && free.length ? free.pop() : null;
  if (b) {   // reuse a spent bullet: same shape, no new object and no new hit list
    b.x = o.x; b.y = o.y; b.vx = Math.cos(o.a) * o.sp; b.vy = Math.sin(o.a) * o.sp; b.dmg = o.dmg; b.crit = !!o.crit; b.pierce = o.pierce || 0; b.r = o.r || 6; b.life = o.life || 1.4;
    b.hit.length = 0; b.beat = !!o.beat; b.kind = o.kind || 'pill'; b.home = o.home || 0; b.splash = o.splash || 0; b.slow = o.slow || 0;
    g.bullets.push(b); return;
  }
  g.bullets.push({ x: o.x, y: o.y, vx: Math.cos(o.a) * o.sp, vy: Math.sin(o.a) * o.sp, dmg: o.dmg, crit: !!o.crit, pierce: o.pierce || 0, r: o.r || 6, life: o.life || 1.4, hit: [], beat: !!o.beat, kind: o.kind || 'pill', home: o.home || 0, splash: o.splash || 0, slow: o.slow || 0 });
}
// b11: where a shot leaves the duo. Lanes: [side] px across and [up] px above the row. Circle stages: the muzzle sits 0.7x as far from the duo, along the aim, notes spread across it.
const muzX = (g, side, up) => (g.ring ? g.p.x + Math.cos(g.p.aim) * up * RING_SCALE - Math.sin(g.p.aim) * side * RING_SCALE : g.p.x + side);
const muzY = (g, side, up) => (g.ring ? g.p.y + Math.sin(g.p.aim) * up * RING_SCALE + Math.cos(g.p.aim) * side * RING_SCALE : g.p.y - up);
// the capsule: straight up, [1 + extra notes] side by side, [1 + extra bursts] volleys per shot
function shootCapsule(g, dt) {
  const p = g.p, up = id => uv(g, id);
  if (!g.ring) p.aim = -Math.PI / 2;
  p.cd -= dt;
  while (p.cd <= 0) {
    p.cd += (1 / p.rate) * cdMul(g) / (1 + up('aspd') / 100) * (p.rage > 0 ? 0.77 : 1);
    for (let b = 0; b <= Math.round(up('burst')); b++) g.vq.push({ t: b * 0.1 });
    if (p.cd < -0.2) p.cd = 0;
  }
  for (let i = g.vq.length - 1; i >= 0; i--) {
    const v = g.vq[i]; v.t -= dt;
    if (v.t > 0) continue;
    g.vq.splice(i, 1);
    const n = 1 + Math.round(up('notes'));
    const ob = onBeat(g);
    if (ob) { g.beatShots = (g.beatShots || 0) + 1; g.events.push({ t: 'beatshot' }); if (g.stage >= BEATRUN_FROM) beatRun(g); }
    for (let k = 0; k < n; k++) {
      const crit = g.rand() < p.crit + (ob ? BEAT_CRIT : 0);
      fire(g, { x: muzX(g, (k - (n - 1) / 2) * 42, 30), y: muzY(g, (k - (n - 1) / 2) * 42, 30), a: p.aim, sp: p.bspeed, dmg: dmgMul(g) * (1 + up('cdmg') / 100) * (p.rage > 0 ? 1.6 : 1) * (crit ? p.critMul : 1) * (ob ? 1 + up('dbeat') / 100 : 1), crit, beat: ob, pierce: Math.round(up('speed')), r: 6, life: 1.4, kind: 'pill' });
    }
    g.shots++; g.events.push({ t: 'shoot' });
  }
}
// b12 perf: distance test as a tiny function taking the cell (a monomorphic read of s.x and s.y), so no number is boxed to call it; same value as hyp() < r
function near(s, x, y, r) { const dx = s.x - x, dy = s.y - y; return Math.sqrt(dx * dx + dy * dy) < r; }
function updateWeapons(g, dt, canFire) {
  const p = g.p, cm = cdMul(g);
  const dm = id => dmgMul(g) * skillMul(g.skillLv[id] || 1) * (g.perk && g.perk.id === id ? g.perk.mul : 1);   // permanent skill level scales that skill's damage
  const wantTowers = lv(g, 'tower') ? 1 + (lv(g, 'tower') >= 3 ? 1 : 0) + (lv(g, 'tower') >= 5 ? 1 : 0) : 0;
  if (g.towers.length !== wantTowers) rebuildTowers(g);
  const aim = g.ring ? p.aim : -Math.PI / 2;   // nothing auto-aims except the Snot Dragon's homing
  for (const id in g.weap) {
    const w = g.weap[id], L = w.lv;
    if (id === 'daggers' || id === 'stick' || id === 'tower') continue;   // continuous / own timers below
    w.cd -= dt;
    if (w.cd > 0 || !canFire) continue;
    if (id === 'swab') {
      const fronts = frontSegs(g);
      if (!fronts.length) { w.cd = 0.3; continue; }
      const n = 1 + (L >= 4 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const t = fronts[0], dur = 2.6 + 0.5 * L;
        g.zones.push({ x: t.x + (k ? 90 : 0), y: t.y, r: 62 + 16 * L, life: dur, max: dur, tick: 0, dmg: 0.2 * (1 + 0.25 * L) * dm('swab') });
      }
      g.events.push({ t: 'swab' }); w.cd = (4.2 - 0.3 * L) * cm;
    } else if (id === 'dragon') {
      if (!nearestTarget(g, p.x, p.y, 1400)) { w.cd = 0.3; continue; }
      const n = 1 + Math.floor((L + 1) / 2);
      for (let k = 0; k < n; k++) fire(g, { x: muzX(g, 0, 20), y: muzY(g, 0, 20), a: aim + (k - (n - 1) / 2) * 0.7, sp: 440, dmg: 2.0 * (1 + 0.4 * L) * dm('dragon'), r: 11, life: 2.6, kind: 'snot', home: 7, splash: 46 });
      g.events.push({ t: 'dragon' }); w.cd = (1.8 - 0.1 * L) * cm;
    } else if (id === 'needles') {
      const n = 3 + L;
      for (let k = 0; k < n; k++) {
        const crit = g.rand() < p.crit;
        fire(g, { x: muzX(g, 0, 10), y: muzY(g, 0, 10), a: aim + (k - (n - 1) / 2) * 0.09, sp: 1100, dmg: 0.8 * (1 + 0.3 * L) * dm('needles') * (crit ? p.critMul : 1), crit, pierce: 2 + L, r: 5, life: 1.2, kind: 'needle' });
      }
      g.events.push({ t: 'needles' }); w.cd = (1.8 - 0.12 * L) * cm;
    } else if (id === 'bubble') {
      for (let k = 0; k < (L >= 4 ? 2 : 1); k++) fire(g, { x: muzX(g, 0, 30), y: muzY(g, 0, 30), a: aim + (k ? 0.5 : 0), sp: 190, dmg: 1.2 * (1 + 0.3 * L) * dm('bubble'), r: 22 + 3 * L, life: 3.2, kind: 'bubble', splash: 70 + 10 * L, slow: 2 });
      g.events.push({ t: 'bubble' }); w.cd = (3.4 - 0.2 * L) * cm;
    } else if (id === 'satellite') {
      const vis = visibleTargets(g);
      if (!vis.length) { w.cd = 0.3; continue; }
      vis.sort((a, b) => b.hp - a.hp);
      for (let k = 0; k < 1 + Math.floor((L + 1) / 2); k++) {
        const s = vis[Math.floor(g.rand() * Math.min(vis.length, 5))];
        damageSegAs('satellite', g, s, Math.max(1.8 * (1 + 0.3 * L) * dm('satellite'), s.max * (0.02 + 0.008 * L) * Math.min(dm('satellite') / 10, 3)), false, s.x, s.y);
        g.events.push({ t: 'strike', x: s.x, y: s.y });
      }
      w.cd = (3.6 - 0.25 * L) * cm;
    } else if (id === 'maw') {
      const vis = visibleTargets(g);
      if (!vis.length) { w.cd = 0.3; continue; }
      vis.sort((a, b) => b.hp - a.hp);
      const t = vis[Math.floor(g.rand() * Math.min(vis.length, 3))];
      g.maws.push({ x: t.x, y: t.y, r: 110 + 12 * L, life: 1.6, max: 1.6, tick: 0, exec: 0.1 + 0.03 * L, dmg: 0.9 * (1 + 0.3 * L) * dm('maw') });
      g.events.push({ t: 'maw', x: t.x, y: t.y }); w.cd = (7.5 - 0.6 * L) * cm;
    }
  }
  // spinning daggers (orbit)
  const dl = lv(g, 'daggers');
  if (dl) {
    p.orbAng += dt * (3.2 + 0.2 * dl);
    const sns = g.snakes;
    for (let i = 0; i < 1 + dl; i++) {
      const pos = daggerPos(g, i, DP_SCRATCH);
      for (let a = 0; a < sns.length; a++) { const segs = sns[a].segs; for (let j = 0; j < segs.length; j++) { const s = segs[j];   // indexed, no closure (same order as eachTarget)
        if (s.hp > 0 && !s.shield && !s.wave && s.orbCd <= 0 && near(s, pos.x, pos.y, s.r + 12)) { s.orbCd = 0.3; damageSegAs('daggers', g, s, 1.2 * (1 + 0.3 * dl) * dm('daggers'), false, pos.x, pos.y); } } }
    }
  }
  // massage stick (sweeping bar)
  const sl = lv(g, 'stick');
  if (sl) {
    for (let k = 0; k < (sl >= 4 ? 2 : 1); k++) {
      const sg = stickSeg(g, k, SG_SCRATCH);
      const sns = g.snakes;
      for (let a = 0; a < sns.length; a++) { const segs = sns[a].segs; for (let j = 0; j < segs.length; j++) { const s = segs[j];
        if (!(s.hp > 0 && !s.shield && !s.wave) || s.orbCd > 0) continue;
        if (distToSeg(s.x, s.y, sg.x0, sg.y0, sg.x1, sg.y1) < s.r + 12) { s.orbCd = 0.35; damageSegAs('stick', g, s, 1.8 * (1 + 0.35 * sl) * dm('stick'), false, s.x, s.y); } } }
    }
  }
  // medical towers pulse
  const tl = lv(g, 'tower');
  for (let ti = 0; ti < g.towers.length; ti++) {
    const t = g.towers[ti]; t.cd -= dt; if (t.pulse > 0) t.pulse -= dt;
    if (t.cd <= 0 && canFire) {
      t.cd = (2.4 - 0.15 * tl) * cm; t.pulse = 0.5;
      const R = 170 + 18 * tl;
      g.events.push({ t: 'pulse', x: t.x, y: t.y, r: R });
      const sns = g.snakes;
      for (let a = 0; a < sns.length; a++) { const segs = sns[a].segs; for (let j = 0; j < segs.length; j++) { const s = segs[j];
        if (s.hp > 0 && !s.shield && !s.wave && near(s, t.x, t.y, R + s.r)) damageSegAs('tower', g, s, 1.5 * (1 + 0.35 * tl) * dm('tower'), false, s.x, s.y); } }
    }
  }
  // swab zones tick
  for (let i = g.zones.length - 1; i >= 0; i--) {
    const z = g.zones[i]; z.life -= dt; z.tick -= dt;
    if (z.tick <= 0) { z.tick = 0.3; eachTarget(g, s => { if (hyp(s.x - z.x, s.y - z.y) < z.r + s.r) damageSegAs('swab', g, s, z.dmg, false, s.x, s.y); }); }
    if (z.life <= 0) g.zones.splice(i, 1);
  }
  // maws execute
  for (let i = g.maws.length - 1; i >= 0; i--) {
    const m = g.maws[i]; m.life -= dt; m.tick -= dt;
    if (m.tick <= 0) {
      m.tick = 0.2;
      eachTarget(g, s => {
        if (hyp(s.x - m.x, s.y - m.y) >= m.r + s.r) return;
        if (s.hp <= s.max * m.exec) damageSegAs('maw', g, s, s.hp + 1, false, s.x, s.y); else damageSegAs('maw', g, s, m.dmg, false, s.x, s.y);
      });
    }
    if (m.life <= 0) g.maws.splice(i, 1);
  }
}
// [o] (optional) is a scratch object the answer is written into, so the per-step and per-frame callers allocate nothing
export function daggerPos(g, i, o) {
  const dl = lv(g, 'daggers'), p = g.p, a = p.orbAng + (i / Math.max(1, 1 + dl)) * TAU, R = g.ring ? 72 + 6 * dl : 92 + 8 * dl, oy = g.ring ? 0 : 150;   // b11: in a circle stage they orbit the duo itself
  if (o) { o.x = p.x + Math.cos(a) * R; o.y = p.y - oy + Math.sin(a) * R; o.a = a; return o; }
  return { x: p.x + Math.cos(a) * R, y: p.y - oy + Math.sin(a) * R, a };   // they circle a post just above the line
}
export function stickSeg(g, k = 0, o) {
  const sl = lv(g, 'stick'), p = g.p, len = g.ring ? 90 + 8 * sl : 190 + 14 * sl, oy = g.ring ? 0 : 80;   // b11: in a circle stage the bar spins all the way round the duo
  const a = g.ring ? g.t * 1.9 + k * Math.PI : -Math.PI / 2 + Math.sin(g.t * 2.2 + k * Math.PI) * 1.15;
  if (o) { o.x0 = p.x; o.y0 = p.y - oy; o.x1 = p.x + Math.cos(a) * len; o.y1 = p.y - oy + Math.sin(a) * len; o.a = a; o.len = len; return o; }
  return { x0: p.x, y0: p.y - oy, x1: p.x + Math.cos(a) * len, y1: p.y - oy + Math.sin(a) * len, a, len };
}
const DP_SCRATCH = { x: 0, y: 0, a: 0 }, SG_SCRATCH = { x0: 0, y0: 0, x1: 0, y1: 0, a: 0, len: 0 };
function distToSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
  return hyp(px - (x0 + dx * t), py - (y0 + dy * t));
}

// ---------------------------------------------------------------- step
// the per-cell glide along the path: its own small function so the JIT keeps the numbers unboxed (inside the huge step it did not). Returns the HP left in the chain.
function moveSegs(g, segs, path, dt) {
  let hp = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i], ox = s.x, oy = s.y;
    s.ps = s.tp >= s.ps ? s.tp : Math.max(s.tp, s.ps - 320 * dt);
    const pos = pointInto(path, s.ps, PT_A), pa = pointInto(path, s.ps - 8, PT_B), pb = pointInto(path, s.ps + 8, PT_C);
    s.x = pos.x; s.y = pos.y; s.ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
    s.vx = (s.x - ox) / dt; s.vy = (s.y - oy) / dt;
    hp += s.hp > 0 ? s.hp : 0;
    if (s.flash > 0) s.flash -= dt;
    if (s.gold && s.goldT > 0 && visible(s)) { s.goldT -= dt / (1 + uv(g, 'gear') / 100); if (s.goldT <= 0) g.events.push({ t: 'goldfade', x: s.x, y: s.y }); }
    if (s.orbCd > 0) s.orbCd -= dt;
  }
  return hp;
}
// b12 perf: the projectile pass lives outside the huge step(): there the per-cell distance tests boxed three numbers per bullet and cell (58 KB of garbage per step with needles).
// Same maths in the same order (Math.sqrt of the same sum), no hyp() call, no closure per splash hit.
function moveBullets(g, dt) {
  const bullets = g.bullets, sns = g.snakes;
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    if (b.home > 0) {
      const t = nearestTarget(g, b.x, b.y, 320);
      if (t) {
        const sp = hyp(b.vx, b.vy), cur = Math.atan2(b.vy, b.vx);
        const na = cur + clamp(angDiff(Math.atan2(t.y - b.y, t.x - b.x), cur), -b.home * dt, b.home * dt);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30;
    if (!dead) {
      const bx = b.x, by = b.y, br = b.r;
      for (let a = 0; a < sns.length && !dead; a++) { const sn = sns[a], segs = sn.segs; for (let i = 0; i < segs.length && !dead; i++) { const s = segs[i];
        if (s.hp <= 0 || s.shield || s.wave || s.y < HIT_GATE) continue;
        const dx = s.x - bx, dy = s.y - by;
        if (Math.sqrt(dx * dx + dy * dy) >= s.r + br || b.hit.includes(s)) continue;
        b.hit.push(s);
        damageSegAs(BULLET_SRC[b.kind] || 'capsule', g, s, b.dmg, b.crit, b.x, b.y); bumpGroove(g); if (b.beat && g.groove < GROOVE_MAX) g.groove += 0.5;
        if (b.slow) sn.slow = Math.max(sn.slow, b.slow);
        if (b.splash > 0) {
          const sd = b.dmg * (b.kind === 'bubble' ? 2.2 : 0.5), sx = s.x, sy = s.y, reach = b.splash;
          for (let a2 = 0; a2 < sns.length; a2++) { const qs = sns[a2], qsegs = qs.segs; for (let j = 0; j < qsegs.length; j++) { const q = qsegs[j];
            if (!(q.hp > 0 && !q.shield && !q.wave) || q === s) continue;
            const ex = q.x - sx, ey = q.y - sy;
            if (Math.sqrt(ex * ex + ey * ey) < reach + q.r) { damageSeg(g, q, sd, false, q.x, q.y); if (b.slow) qs.slow = Math.max(qs.slow, b.slow); } } }
          g.events.push({ t: b.kind === 'bubble' ? 'burst' : 'splash', x: s.x, y: s.y, r: b.splash });
        }
        if (b.pierce-- <= 0) dead = true;
      } }
    }
    if (dead) { bullets.splice(bi, 1); const bp = g.bpool || (g.bpool = []); if (bp.length < BULLET_POOL_MAX) bp.push(b); }
  }
}
// b12 perf: the two per-cell passes of the chain update, out of the huge step() so the numbers stay unboxed (same maths, same order)
function chainTargets(sn, segs, pathLen, v, dt) {
  const last = segs.length - 1;
  let total = 0;
  for (let i = 0; i < last; i++) total += (segs[i].r + segs[i + 1].r) * 0.78;
  const maxTail = pathLen - total;
  sn.tail = Math.min(sn.tail + v * dt, maxTail);
  sn.breach = sn.tail >= maxTail - 0.5;
  let target = sn.tail;
  for (let i = last; i >= 0; i--) {
    if (i < last) target += (segs[i].r + segs[i + 1].r) * 0.78;
    segs[i].tp = target;
  }
}
function markWave(segs, boss, wavePos, wave2) {
  for (let i = 0; i < segs.length; i++) segs[i].wave = boss && i > 0 && (Math.abs(i - wavePos) < 1.6 || Math.abs(i - wave2) < 1.3);
}
const CHEST_CP = [[0.25, 1], [0.5, 2]];
// b12s: follow-finger chase. The duo glides toward the target x: eased (never overshoots) and speed capped
// (a fast flick cannot teleport it). Returns the new x. Pure, so tests can pin it.
export const CHASE_MUL = 2.6, CHASE_EASE = 14;
export function chaseX(x, tx, dt, speed) {
  if (!Number.isFinite(tx) || !Number.isFinite(x)) return x;
  const d = tx - x; if (Math.abs(d) < 0.4) return tx;
  const cap = (speed > 0 ? speed : 300) * CHASE_MUL * dt;
  let st = d * (1 - Math.exp(-CHASE_EASE * dt)); if (st > cap) st = cap; else if (st < -cap) st = -cap;
  return Math.abs(st) >= Math.abs(d) ? tx : x + st;
}
export function step(g, dt, input) {
  GATE = gateY(g); HIT_GATE = g.ring ? -1e9 : GATE;   // circle stages keep their old rules: a shot can hit any cell
  if (g.phase !== 'play' && g.phase !== 'clear') return;
  g.t += dt;
  const p = g.p;

  // the cell slides left and right along its row
  p.mx = input ? clamp(input.mx || 0, -1, 1) : 0;
  if (!g.ring && input && Number.isFinite(input.tx) && dt > 0) {   // b12s: follow finger (lane stages): input.tx is the target x, mx is ignored
    const nx = chaseX(p.x, clamp(input.tx, p.zone.x0, p.zone.x1), dt, p.speed);
    p.mx = clamp((nx - p.x) / (dt * p.speed), -1, 1); p.x = nx + p.kx * dt;
  } else
  p.x += (p.mx * p.speed + p.kx) * dt;
  p.kx *= Math.exp(-9 * dt);
  p.x = clamp(p.x, p.zone.x0, p.zone.x1); p.y = g.ring ? g.ring.cy : ROW_Y;
  if (g.ring) p.aim = input && Number.isFinite(input.aim) ? input.aim : p.aim;   // b11: circle stages aim all round (input.aim, an angle in radians); lanes always shoot straight up
  if (p.iframes > 0) p.iframes -= dt;
  if (p.shield > 0) p.shield -= dt;
  if (p.rage > 0) p.rage -= dt;
  if (g.beam) { g.beam.t -= dt; if (g.beam.t <= 0) g.beam = null; }
  if (input && input.encore) fireEncore(g);
  g.grooveT += dt; if (g.grooveT > 1.2 && g.groove > 0) g.groove = Math.max(0, g.groove - 8 * dt);   // the groove fades when the hits stop

  // the serpent rides the track as one connected chain driven by its tail. Cells in front of a gap
  // slide back to close it, so every kill also pushes the face away from the membrane.
  let stageHp = 0;
  g.danger *= 0.97;
  for (const sn of g.snakes) {
    sn.slow = Math.max(0, sn.slow - dt); if (sn.napT > 0) sn.napT -= dt;
    // now and then it surges for a second (with a warning beforehand)
    if (g.phase === 'play') {
      sn.surgeT -= dt;
      if (sn.surge === 'idle' && sn.surgeT <= 0) { sn.surge = 'warn'; sn.surgeT = sn.p2 ? P2_WARN : 0.6; if (sn.p2) { const a = sn.segs[0].ps; sn.lane = { a, b: a + sn.speed * (1 - g.p.slow) * P2_DASH * 1.1, w: P2_WARN }; } g.events.push({ t: 'surgewarn', lane: !!sn.lane }); }
      else if (sn.surge === 'warn' && sn.surgeT <= 0) { sn.surge = 'go'; sn.surgeT = napBoss(g, sn) ? 1.1 + NAP_EXTRA : 1.1; g.events.push({ t: 'surge' }); }
      else if (sn.surge === 'go' && sn.surgeT <= 0) { sn.surge = 'idle'; sn.lane = null; if (napBoss(g, sn)) { sn.napT = NAP_TIME; g.events.push({ t: 'nap', x: sn.segs[0].x, y: sn.segs[0].y }); if (sn.p2 && g.stage >= STARTLE_FROM) { sn.tail += STARTLE_JOLT; g.events.push({ t: 'startle', x: sn.segs[0].x, y: sn.segs[0].y }); } } sn.surgeT = ((sn.boss ? 3.5 : 5.5) + g.rand() * (sn.boss ? 3 : 5)) * (sn.p2 ? 0.6 : 1) * (traitOf(g, sn) === 'grumpy' ? grumpyMul(g) : 1); }
    }
    const v = sn.speed * (1 - g.p.slow) * (sn.slow > 0 ? (traitOf(g, sn) === 'mighty' ? mightySlow(g) : 0.55) : 1) * traitSpeed(g, sn) * (sn.surge === 'go' ? (sn.p2 ? P2_DASH : 2.6) : 1) * (sn.drum ? DRUM_SPEED : 1) * (sn.napT > 0 ? NAP_SPEED : 1) * (g.phase === 'clear' ? 0 : 1);
    const segs = sn.segs, path = sn.path || g.path;
    chainTargets(sn, segs, path.len, v, dt);
    segs[0].shield = segs.length > 1;
    sn.healT = (sn.healT === undefined ? 1.2 : sn.healT) - dt;
    if (sn.healT <= 0 && g.phase === 'play') { sn.healT = 1.2; for (let i = 1; i < segs.length; i++) if (segs[i].kind === 'mender' && segs[i].hp > 0) { for (let j = Math.max(1, i - 2); j <= Math.min(segs.length - 1, i + 2); j++) if (j !== i && segs[j].hp > 0 && segs[j].hp < segs[j].max) segs[j].hp = Math.min(segs[j].max, segs[j].hp + segs[j].max * 0.06); g.events.push({ t: 'mend', x: segs[i].x, y: segs[i].y }); } }
    { const left = path.len - segs[0].ps, close = clamp(1 - left / 300, 0, 1); g.faceMax = Math.max(g.faceMax, segs[0].ps / path.len); if (g.phase === 'play' && close > 0) { g.danger = Math.max(g.danger * 0.9, close); g.dangerT -= dt; if (g.dangerT <= 0) { g.dangerT = 0.8; g.events.push({ t: 'danger', k: close }); } } }
    // boss: a wave of shields rolls down the chain like a beat. Cells inside it cannot be hit, so time your shots.
    if (sn.boss && !sn.p2 && g.phase === 'play') { let left = 0; for (const q of segs) left += Math.max(0, q.hp); if (left < segs.hpMax * P2_HP) { sn.p2 = true; sn.p2T = g.t; sn.surgeT = Math.min(sn.surgeT, 1.2); g.events.push({ t: 'phase2' }); } }
    const wavePos = sn.boss ? ((sn.p2 ? sn.p2T * 4.5 + (g.t - sn.p2T) * P2_WAVE : g.t * 4.5)) % (segs.length + 8) : -99;
    const wave2 = sn.boss && g.stage >= ECHO_WAVE_FROM ? (segs.length + 8) - ((g.t * 3.2 + 7) % (segs.length + 8)) : -99;   // late bosses: a second wave runs back up the chain
    markWave(segs, sn.boss, wavePos, wave2);
    wardTick(sn); gloomTick(g, sn); bossTwist(g, sn, dt); traitTick(g, sn, dt); ringSkip(g, sn, dt); choirTick(sn, dt); if (g.phase === 'play') quartetTick(g, sn, dt);
    if (sn.breach && g.phase === 'play') { g.leaks++; g.events.push({ t: 'leak', x: segs[0].x, y: LINE_Y }); loseRun(g); }
    stageHp += moveSegs(g, segs, path, dt);
  }
  g.stageHp = stageHp;
  g.progress = g.stageHpMax ? clamp(1 - stageHp / g.stageHpMax, 0, 1) : 0;
  // chests at a quarter and half way: even a lost run pays for how far it got
  for (const [th, k] of CHEST_CP) if (g.phase === 'play' && g.progress >= th && !(g.cp || (g.cp = {}))[th]) { g.cp[th] = 1; g.pickups.push({ kind: 'chest', x: W / 2, y: 320, vx: 0, vy: 0, v: 1, cp: k, age: 0, vac: false }); g.events.push({ t: 'checkpoint', k }); }
  if (g.phase === 'play') petTick(g, dt);

  // the capsule never aims: it fires straight up, so you aim by sliding
  const canFire = g.phase === 'play';
  if (canFire) shootCapsule(g, dt);
  updateWeapons(g, dt, canFire);

  moveBullets(g, dt);   // b12 perf: its own small function so the JIT keeps the distance maths unboxed

  reap(g);

  // pickups always fly to the cell (it cannot chase them up the screen)
  for (let i = g.pickups.length - 1; i >= 0; i--) {
    const pk = g.pickups[i];
    pk.age += dt;
    if (pk.kind === 'snack') { if (snackStep(g, pk, dt)) g.pickups.splice(i, 1); continue; }
    const d = hyp(p.x - pk.x, p.y - pk.y);
    if (pk.age > 0.5 || g.phase === 'clear') pk.vac = true;
    if (pk.vac) {
      const sp = (pk.kind === 'chest' ? 300 : 460) + pk.age * 90, a = Math.atan2(p.y - pk.y, p.x - pk.x);
      pk.vx = Math.cos(a) * sp; pk.vy = Math.sin(a) * sp;
    } else { const f = Math.exp(-4 * dt); pk.vx *= f; pk.vy *= f; pk.vy += 40 * dt; }
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    pk.x = clamp(pk.x, 6, W - 6); pk.y = clamp(pk.y, 6, H - 6);
    if (d < (pk.kind === 'chest' ? 40 : 26)) { collect(g, pk); g.pickups.splice(i, 1); }
  }

  // stage clear: the run is won once the loot is in
  if (g.phase === 'play' && !g.snakes.length) {
    g.phase = 'clear'; g.clearT = 0;
    const bonus = (6 + g.stage * 3) * (isBossStage(g.stage) ? 3 : 1);
    g.coins += bonus * p.coinMul;
    g.pickups.push({ kind: 'chest', x: W / 2, y: 300, vx: 0, vy: 0, v: 1, age: 0, vac: false });
    g.events.push({ t: 'clear', n: g.stage, bonus: Math.round(bonus * p.coinMul), boss: isBossStage(g.stage), name: nameOf(g) });
  }
  if (g.phase === 'clear') {
    g.clearT += dt;
    if (g.clearT > 2.4 && !g.pickups.length) { g.phase = 'won'; g.result = makeResult(g, true); g.events.push({ t: 'won' }); }
  }
  maybeLevelUp(g);
}

// ---------------------------------------------------------------- bot (tests + title attract mode)
export function botInput(g) {
  const p = g.p;
  let ax = 0;
  for (const sn of g.snakes) for (const s of sn.segs) {
    const dx = p.x - s.x, dy = p.y - s.y, d = hyp(dx, dy) || 1, reach = 170 + s.r;
    if (d < reach) ax += (dx >= 0 ? 1 : -1) * ((reach - d) / reach) * 2.6;
  }
  // aim: chest cells first, otherwise the cell closest to the membrane
  let tgt = null;
  for (const sn of g.snakes) for (const s of sn.segs) if (s.hp > 0 && !s.shield && !s.wave && s.y > gateY(g) + 10 && s.y < p.y - 120) {
    if (s.carry === 'chest') { tgt = s; break; }
    if (!tgt || s.ps > tgt.ps) tgt = s;
  }
  if (tgt) ax += clamp((tgt.x - p.x) / 120, -1, 1) * 0.9;
  if (g.ring) { let t2 = null; for (const sn of g.snakes) for (const s of sn.segs) if (s.hp > 0 && !s.shield && !s.wave && s.y > gateY(g) + 10 && s.y < H - 20 && s.x > 20 && s.x < W - 20) { if (s.carry === 'chest') { t2 = s; break; } if (!t2 || s.ps > t2.ps) t2 = s; } return { mx: 0, my: 0, aim: t2 ? Math.atan2(t2.y - p.y, t2.x - p.x) : p.aim, encore: g.encore >= 1 && !!t2 && hyp(t2.x - p.x, t2.y - p.y) < 140 }; }   // b11: circle stages, the bot aims at the furthest-along cell
  return { mx: clamp(ax, -1, 1), my: 0, encore: g.encore >= 1 && !!tgt && Math.abs(tgt.x - p.x) < tgt.r };
}

// ---------------------------------------------------------------- retention loops (all optional gifts, nothing here gates progress)
// save.addict: sp (kills per snake species), sk (damage points per skill), claimed (mastery + collection rewards),
// spin (last lucky spin day), week (weekly challenge), seen (last visit, ms) for the comeback gift.
export const addictDefault = () => ({ sp: Object.fromEntries(SKINS.map(k => [k, 0])), sk: Object.fromEntries(WEAPONS.map(w => [w.id, 0])), claimed: {}, spin: { day: 0, prize: -1, n: 0, shield: 0 }, week: { key: 0, prog: 0, claimed: 0 }, seen: 0, q: { day: 0, p: [0, 0, 0], chest: 0 }, season: { key: 0, n: 0, last: 0, claimed: {}, note: '' }, ann: {}, annInit: 0, qs: { last: 0, n: 0, b: 0 }, tok: 0, wb: {}, bs: 0 });
export function sanitizeAddict(raw) {
  const a = addictDefault(), num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  for (const k of SKINS) a.sp[k] = num(raw && raw.sp && raw.sp[k]);
  for (const w of WEAPONS) a.sk[w.id] = num(raw && raw.sk && raw.sk[w.id]);
  if (!raw || typeof raw !== 'object') return a;
  if (raw.claimed && typeof raw.claimed === 'object') for (const k of Object.keys(raw.claimed)) if (raw.claimed[k] && /^[a-z0-9:_]{1,40}$/.test(k)) a.claimed[k] = 1;
  if (raw.spin && typeof raw.spin === 'object') a.spin = { day: num(raw.spin.day), prize: Math.min(SPIN_PRIZES.length - 1, num(raw.spin.prize, -1)), n: Math.min(9999, num(raw.spin.n)), shield: raw.spin.shield ? 1 : 0 };
  if (raw.week && typeof raw.week === 'object') a.week = { key: num(raw.week.key), prog: num(raw.week.prog), claimed: raw.week.claimed ? 1 : 0 };
  a.seen = num(raw.seen);
  if (raw.q && typeof raw.q === 'object') a.q = { day: num(raw.q.day), p: [0, 1, 2].map(i => Math.min(9999, num(Array.isArray(raw.q.p) ? raw.q.p[i] : 0))), chest: raw.q.chest ? 1 : 0 };
  if (raw.season && typeof raw.season === 'object') { const r = raw.season; a.season = { key: num(r.key), n: Math.min(SEASON_DAYS, num(r.n)), last: num(r.last), claimed: {}, note: typeof r.note === 'string' ? r.note.replace(/[^A-Za-z0-9 +,.!:]/g, '').slice(0, 80) : '' }; for (let i = 0; i < SEASON_MILES.length; i++) if (r.claimed && r.claimed[i]) a.season.claimed[i] = 1; }
  if (raw.ann && typeof raw.ann === 'object') for (const t of TROPHIES) if (raw.ann[t.id]) a.ann[t.id] = 1;
  a.annInit = raw.annInit ? 1 : 0;
  a.tok = Math.min(TOKEN_MAX, num(raw.tok));
  if (raw.wb && typeof raw.wb === 'object') for (const d of WEEK_DEFS) { const n = Math.min(99, num(raw.wb[d.id])); if (n) a.wb[d.id] = n; }
  a.bs = Math.min(63, num(raw.bs));
  if (raw.qs && typeof raw.qs === 'object') a.qs = { last: num(raw.qs.last), n: Math.min(9999, num(raw.qs.n)), b: Math.min(9, num(raw.qs.b)) };
  return a;
}
export function grantReward(save, rw) {
  save.beats += rw.beats || 0; save.sparkles += rw.sparkles || 0; save.eggs += rw.eggs || 0;
  if (rw.tok) save.addict.tok = Math.min(TOKEN_MAX, (save.addict.tok || 0) + rw.tok);
  if (rw.energy) addEnergy(save, rw.energy);
  if (rw.frag) for (const id of Object.keys(rw.frag)) if (save.pets[id]) save.pets[id].frag += rw.frag[id];
}
export function rewardText(rw) {
  const t = [];
  if (rw.beats) t.push(rw.beats + ' Beats');
  if (rw.sparkles) t.push(rw.sparkles + ' Sparkles');
  if (rw.eggs) t.push(rw.eggs + (rw.eggs > 1 ? ' Eggs' : ' Egg'));
  if (rw.energy) t.push(rw.energy + ' Voice');
  if (rw.tok) t.push(rw.tok + ' Streak Token');
  if (rw.frag) for (const id of Object.keys(rw.frag)) t.push(rw.frag[id] + ' ' + PET[id].name + ' fragments');
  return t.join(' + ');
}
// ---- mastery: pop cells of a snake species, deal damage with a skill
export const SPECIES_MILES = [{ at: 40, reward: { beats: 60 } }, { at: 150, reward: { sparkles: 6 } }, { at: 500, reward: { eggs: 1 } }, { at: 1500, reward: { sparkles: 25 } }];
export const SKILL_MILES = [{ at: 50, reward: { beats: 60 } }, { at: 400, reward: { sparkles: 6 } }, { at: 2500, reward: { eggs: 1 } }, { at: 12000, reward: { sparkles: 25 } }, { at: 60000, reward: { sparkles: 60 } }];
export const speciesName = skin => (SKIN_NAMES[SKINS.indexOf(skin)] || skin).split(' ')[0];
export function masteryList(save) {
  const a = save.addict, out = [];
  for (const k of SKINS) out.push({ key: 'sp:' + k, kind: 'sp', id: k, name: speciesName(k) + ' snakes', unit: 'cells popped', val: a.sp[k] || 0, miles: SPECIES_MILES });
  for (const w of WEAPONS) out.push({ key: 'sk:' + w.id, kind: 'sk', id: w.id, name: w.name, unit: 'mastery', val: a.sk[w.id] || 0, miles: SKILL_MILES });
  for (const m of out) { m.done = m.miles.filter(x => m.val >= x.at).length; m.ready = m.miles.findIndex((x, i) => m.val >= x.at && !a.claimed[m.key + ':' + i]); m.next = m.miles.find(x => m.val < x.at) || null; }
  return out;
}
export function claimMastery(save, key, i) {
  const m = masteryList(save).find(x => x.key === key), ms = m && m.miles[i], id = key + ':' + i;
  if (!ms || m.val < ms.at || save.addict.claimed[id]) return false;
  save.addict.claimed[id] = 1; grantReward(save, ms.reward); return true;
}
export function claimAllMastery(save) { let n = 0; for (const m of masteryList(save)) m.miles.forEach((_x, i) => { if (claimMastery(save, m.key, i)) n++; }); return n; }
// ---- weekly challenge: the same for everyone that week, a bigger reward
export const weekKey = day => Math.floor(((day | 0) + 3) / 7);   // weeks start on Monday
export const WEEK_DEFS = [
  { id: 'cells', text: n => `Pop ${n} cells this week`, stat: 'kills', target: 400 },
  { id: 'runs', text: n => `Play ${n} runs this week`, stat: 'runs', target: 12 },
  { id: 'bombs', text: n => `Pop ${n} bombs this week`, stat: 'bombs', target: 25 },
  { id: 'chests', text: n => `Open ${n} chests this week`, stat: 'chests', target: 20 },
  { id: 'picks', text: n => `Pick ${n} upgrades this week`, stat: 'picks', target: 60 },
  { id: 'wins', text: n => `Clear ${n} stages this week`, stat: 'wins', target: 6 },
];
export const WEEK_REWARD = { sparkles: 40, eggs: 1, energy: 10 };
export function weekChallenge(day) {
  const k = weekKey(day), R = rng((Math.imul(k, 2246822519) >>> 0) || 7), d = WEEK_DEFS[Math.floor(R() * WEEK_DEFS.length)];
  return { id: d.id, key: k, stat: d.stat, target: d.target, text: d.text(d.target), reward: WEEK_REWARD };
}
export function ensureWeek(save, day) { const k = weekKey(day); if (save.addict.week.key !== k) save.addict.week = { key: k, prog: 0, claimed: 0 }; return save.addict.week; }
export const weekReady = (save, day) => { const w = ensureWeek(save, day); return !w.claimed && w.prog >= weekChallenge(day).target; };
export function claimWeek(save, day) { if (!weekReady(save, day)) return false; save.addict.week.claimed = 1; grantReward(save, WEEK_REWARD); collectWeekBadge(save, weekChallenge(day).id); return true; }
// the weekly challenge also pays a collectible badge (one kind per challenge, counted); all six together pay a one-time bonus
export const WEEK_ALL_BONUS = { sparkles: 30, eggs: 1 };
export function collectWeekBadge(save, id) {
  const a = save.addict; a.wb[id] = Math.min(99, (a.wb[id] || 0) + 1);
  if (!a.claimed['wb:all'] && WEEK_DEFS.every(d => a.wb[d.id] > 0)) { a.claimed['wb:all'] = 1; grantReward(save, WEEK_ALL_BONUS); return true; }
  return false;
}
// Called once per finished run, after applyResult.
export function recordAddictRun(save, day, r) {
  const a = save.addict;
  if (r.mode !== 'pig' && r.mode !== 'inv' && r.stage) { const sk = skinFor(r.stage); a.sp[sk] = (a.sp[sk] || 0) + (r.kills || 0); }
  for (const id of Object.keys(r.dmgBy || {})) if (WEAPON[id]) a.sk[id] = (a.sk[id] || 0) + Math.floor((r.dmgBy[id] || 0) / 100);
  const w = ensureWeek(save, day), c = weekChallenge(day);
  const add = { kills: r.kills || 0, runs: 1, bombs: r.bombs || 0, chests: r.chests || 0, picks: r.picks || 0, wins: r.won && !r.mode ? 1 : 0 };
  w.prog = Math.min(c.target, w.prog + (add[c.stat] || 0));
  addQuestProgress(save, day, r); stampSeason(save, day);
}
// ---- lucky spin: one free spin a day, the prize is decided by the date alone
export const SPIN_PRIZES = [
  { icon: '🐱', w: 3, reward: { frag: { kitten: 2 } } }, { icon: '🎵', w: 3, reward: { beats: 150 } },
  { icon: '🐶', w: 3, reward: { frag: { puppy: 2 } } }, { icon: '🥚', w: 1.2, reward: { eggs: 1 } },
  { icon: '✨', w: 2, reward: { sparkles: 8 } }, { icon: '🐷', w: 3, reward: { frag: { piglet: 2 } } },
  { icon: '⚡', w: 3, reward: { energy: 8 } }, { icon: '🐑', w: 3, reward: { frag: { lamb: 2 } } },
];
export function spinPrize(day) {
  const R = rng((Math.imul((day | 0) + 11, 2654435761) >>> 0) || 5), tot = SPIN_PRIZES.reduce((a, p) => a + p.w, 0);
  let r = R() * tot, i = 0;
  for (; i < SPIN_PRIZES.length - 1; i++) { r -= SPIN_PRIZES[i].w; if (r <= 0) break; }
  return i;
}
export const TOKEN_MAX = 3;   // Streak Tokens (from Season gifts and long comebacks): each forgives one missed day for the spin and chest streaks
export const SHIELD_AT = [7, 14];   // spin days that gift a streak shield (one forgiven missed day)
export const spinReady = (save, day) => save.addict.spin.day !== day;
export function doSpin(save, day) {
  if (!spinReady(save, day)) return null;
  const i = spinPrize(day), sp = save.addict.spin, miss = sp.day === day - 2 && (sp.n || 0) > 0, useSh = miss && !!sp.shield, useTok = miss && !sp.shield && save.addict.tok > 0, kept = useSh || useTok;   // a streak shield (else a Streak Token) forgives one missed day
  if (useTok) save.addict.tok--;
  const n = sp.day === day - 1 || kept ? (sp.n || 0) + 1 : 1; let shield = useSh ? 0 : sp.shield ? 1 : 0, gift = false;
  if (SHIELD_AT.includes(n) && !shield) { shield = 1; gift = true; }
  save.addict.spin = { day, prize: i, n, shield }; grantReward(save, SPIN_PRIZES[i].reward);
  return { index: i, prize: SPIN_PRIZES[i], gift, saved: kept, byToken: useTok };
}
// ---- comeback gift: three days away or more, never expires, never nags
export const COMEBACK_DAYS = 3;
export function comebackGift(save, now) {
  const seen = save.addict.seen; if (!seen) return null;
  const days = Math.floor((now - seen) / 86400000); if (days < COMEBACK_DAYS) return null;
  const reward = days >= 14 ? { sparkles: 30, energy: 32, eggs: 2, beats: 800, tok: 1 } : days >= 7 ? { beats: 400, energy: 20, eggs: 1, tok: 1 } : { beats: 150, energy: 10 };
  return { days, reward };
}
export function claimComeback(save, now) { const g = comebackGift(save, now); if (!g) return null; grantReward(save, g.reward); save.addict.seen = now; if (save.streak.n < 2) save.streak = { last: save.streak.last, n: 2 }; return g; }
export function touchSeen(save, now) { if (!comebackGift(save, now)) save.addict.seen = now; }
// ---- collection book: every snake species, pet, keepsake and outfit
export const BOOK_CATS = [
  { id: 'species', name: 'Snakes', reward: { sparkles: 30 } }, { id: 'pets', name: 'Pets', reward: { eggs: 2 } },
  { id: 'keeps', name: 'Keepsakes', reward: { sparkles: 50 } }, { id: 'outfits', name: 'Outfits', reward: { sparkles: 40 } },
];
export const BOOK_ALL = [{ at: 0.5, reward: { sparkles: 25 } }, { at: 1, reward: { sparkles: 100, eggs: 3 } }];
export function bookEntries(save) {
  return {
    species: SKINS.map((k, i) => ({ id: k, name: speciesName(k), icon: '🐍', got: save.cleared >= i + 1 })),
    pets: PETS.map(p => ({ id: p.id, name: p.name, icon: '🐾', got: save.pets[p.id].star > 0 })),
    keeps: KEEPSAKES.map(k => ({ id: k.id, name: k.name, icon: k.icon, got: save.keeps[k.id].lv > 0 })),
    outfits: OUTFITS.map(o => ({ id: o.id, name: o.name, icon: o.hat, got: !!save.outfits.owned[o.id] })),
  };
}
export function bookStatus(save) {
  const e = bookEntries(save), a = save.addict.claimed;
  const cats = BOOK_CATS.map(c => { const l = e[c.id], got = l.filter(x => x.got).length; return { ...c, list: l, got, total: l.length, ready: got === l.length && !a['book:' + c.id] }; });
  const got = cats.reduce((s, c) => s + c.got, 0), total = cats.reduce((s, c) => s + c.total, 0);
  const all = BOOK_ALL.map((m, i) => ({ ...m, i, ready: got / total >= m.at && !a['book:all' + i] }));
  return { cats, got, total, all };
}
export function claimBook(save, key) {
  const b = bookStatus(save), a = save.addict.claimed;
  let rw = null, id = '';
  const c = b.cats.find(x => x.id === key); if (c && c.ready) { rw = c.reward; id = 'book:' + c.id; }
  const m = /^all\d$/.test(key) && b.all[+key.slice(3)]; if (m && m.ready) { rw = m.reward; id = 'book:all' + m.i; }
  if (!rw) return false;
  a[id] = 1; grantReward(save, rw); return true;
}
// ---- one more run: a near-miss line for the result screen (prevPct = best progress before this run)
export function nudgeFor(save, r, prevPct = 0) {
  if (!r || r.mode || r.hard || !r.stage) return null;
  if (r.won) {
    if ((r.stars || 0) < 2) return 'Next star: win without using a revive';
    if (r.stars < 3) return 'Next star: keep the snake face far from the line';
    if (r.stage >= MAX_STAGE) return 'Three stars! The whole show is yours';   // b12a: nothing waits after the finale
    return 'Three stars! Stage ' + Math.min(MAX_STAGE, r.stage + 1) + ' is waiting';
  }
  const pct = Math.floor((r.progress || 0) * 100), len = stageInfo(r.stage).length;
  const cellsTo = t => Math.max(1, Math.ceil((t - pct) / 100 * len));
  const cells = t => cellsTo(t) + ' cell' + (cellsTo(t) > 1 ? 's' : '');
  const t = [25, 50].find(x => x > pct);
  if (t && t - pct <= 8) return cells(t) + ' from the ' + t + '% chest';
  if (pct > prevPct && prevPct > 0) return 'New best: ' + pct + '%! Beat it again?';
  if (prevPct > pct && prevPct - pct <= 15) return cells(prevPct + 1) + ' from a new best';
  if (t) return 'Next chest at ' + t + '%';
  return null;
}
// ---- the always-visible "Next Reward" bar: something ready to collect wins, else the closest goal
export function nextReward(save, day, now = Date.now()) {
  const ready = [];
  if (spinReady(save, day)) ready.push({ label: 'Lucky Spin is ready', icon: '🎡' });
  if (weekReady(save, day)) ready.push({ label: 'Weekly challenge done', icon: '🏅' });
  if (comebackGift(save, now)) ready.push({ label: 'A welcome back gift', icon: '🎁' });
  if (questState(save, day).chestReady) ready.push({ label: 'Quest chest is ready', icon: '🎁' });
  if (seasonStatus(save, day).ready) ready.push({ label: 'Season reward ready', icon: '🌟' });
  if (masteryList(save).some(m => m.ready >= 0)) ready.push({ label: 'Mastery reward ready', icon: '🎖️' });
  const bs = bookStatus(save); if (bs.cats.some(c => c.ready) || bs.all.some(m => m.ready)) ready.push({ label: 'Collection reward ready', icon: '📖' });
  if (TROPHIES.some(t => trophyReady(save, t))) ready.push({ label: 'Trophy ready', icon: '🏆' });
  if (ready.length) return { ready: true, frac: 1, text: '', ...ready[0], more: ready.length - 1 };
  const c = [], li = levelInfo(save.xp);
  c.push({ label: 'Level ' + (li.lv + 1), icon: '⭐', frac: li.cur / li.need, text: li.cur + ' / ' + li.need + ' XP' });
  for (const t of TROPHIES) if (!save.trophies[t.id]) c.push({ label: t.name, icon: '🏆', frac: Math.min(1, t.get(save) / t.at), text: Math.min(t.at, t.get(save)) + ' / ' + t.at });
  for (const f of FUND) if (!save.fund[f.stage]) { c.push({ label: 'Fan Fund: stage ' + f.stage, icon: '🎀', frac: Math.min(1, save.cleared / f.stage), text: save.cleared + ' / ' + f.stage }); break; }
  for (const m of masteryList(save)) if (m.next) c.push({ label: m.name + ' mastery', icon: '🎖️', frac: m.val / m.next.at, text: m.val + ' / ' + m.next.at });
  const wc = weekChallenge(day), wp = ensureWeek(save, day).prog; if (!save.addict.week.claimed) c.push({ label: wc.text, icon: '🏅', frac: wp / wc.target, text: wp + ' / ' + wc.target });
  c.sort((x, y) => y.frac - x.frac);
  return { ready: false, more: 0, ...c[0] };
}

// ---------------------------------------------------------------- round 2 retention: mastery rank, streak wheel, quests, season, achievements, comeback
// Mastery rank badge for a skill (for the skills tab): masteryRank(save, skillId) -> { rank 0..5, max 5, name, color, val, next (next milestone or null), frac 0..1 toward next }.
export const RANK_NAMES = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Legend'];
export const RANK_COLORS = ['#9aa3c7', '#c98a4b', '#cfd8e8', '#ffd24a', '#7fe8ff', '#ff7eb6'];
export function masteryRank(save, skillId) {
  const m = masteryList(save).find(x => x.key === 'sk:' + skillId);
  if (!m) return { rank: 0, max: SKILL_MILES.length, name: RANK_NAMES[0], color: RANK_COLORS[0], val: 0, next: null, frac: 0 };
  const prev = m.done ? m.miles[m.done - 1].at : 0, frac = m.next ? Math.min(1, (m.val - prev) / (m.next.at - prev)) : 1;
  return { rank: m.done, max: m.miles.length, name: RANK_NAMES[m.done], color: RANK_COLORS[m.done], val: m.val, next: m.next ? m.next.at : null, frac };
}
// Lucky spin streak: consecutive days with a spin. Only the wheel's looks change (nothing to buy, nothing lost).
export const SPIN_FRAMES = [
  { at: 0, name: 'Plain wheel', color: '#ffd24a', glow: 0, ptr: '▼', burst: 0 },
  { at: 3, name: 'Bronze wheel', color: '#d9955a', glow: 8, ptr: '🔻', burst: 10 },
  { at: 7, name: 'Silver wheel', color: '#e3ebf7', glow: 14, ptr: '⭐', burst: 18 },
  { at: 14, name: 'Golden wheel', color: '#ffe26a', glow: 22, ptr: '🎵', burst: 28 },
  { at: 30, name: 'Rainbow wheel', color: '#ff7eb6', glow: 30, ptr: '🌈', burst: 40 },
];
export function spinStreak(save, day) { const sp = save.addict.spin; return sp.day === day || sp.day === day - 1 || (sp.day === day - 2 && (sp.shield || save.addict.tok > 0)) ? sp.n || 0 : 0; }
export const hasShield = save => !!save.addict.spin.shield;
export function spinFrame(n) { let f = SPIN_FRAMES[0]; for (const x of SPIN_FRAMES) if (n >= x.at) f = x; const nx = SPIN_FRAMES.find(x => x.at > n) || null; return { ...f, next: nx ? nx.at : 0, nextName: nx ? nx.name : '' }; }
// Daily Quests: three short quests that rotate each day; finish all three to open the chest. No energy, no timers.
export const QUEST_DEFS = [
  { id: 'pop', icon: '🫧', text: n => `Pop ${n} cells`, targets: [15, 25, 40], stat: 'kills' },
  { id: 'run', icon: '🎵', text: n => (n > 1 ? `Play ${n} runs` : 'Play a run'), targets: [1, 2, 3], stat: 'runs' },
  { id: 'bomb', icon: '💣', text: n => `Pop ${n} bomb${n > 1 ? 's' : ''}`, targets: [1, 2, 3], stat: 'bombs' },
  { id: 'chest', icon: '🎁', text: n => `Open ${n} chest${n > 1 ? 's' : ''}`, targets: [1, 2, 3], stat: 'chests' },
  { id: 'pick', icon: '🟡', text: n => `Pick ${n} upgrade${n > 1 ? 's' : ''}`, targets: [2, 3, 5], stat: 'picks' },
  { id: 'win', icon: '🏁', text: n => (n > 1 ? `Clear ${n} stages` : 'Clear a stage'), targets: [1, 1, 2], stat: 'wins' },
  { id: 'groove', icon: '🔥', text: n => `Reach groove ${n}`, targets: [4, 6, 9], stat: 'groove', max: true },
];
export const QUEST_CHESTS = [{ beats: 220 }, { beats: 120, sparkles: 4 }, { eggs: 1 }, { sparkles: 8 }, { beats: 150, energy: 5 }];
export function dailyQuests(day) {
  const R = rng((Math.imul((day | 0) + 77, 2246822519) >>> 0) || 9), pool = QUEST_DEFS.slice(), out = [];
  for (let i = 0; i < 3; i++) { const d = pool.splice(Math.floor(R() * pool.length), 1)[0], t = d.targets[Math.min(2, Math.floor(R() * 2.4))]; out.push({ id: d.id, icon: d.icon, text: d.text(t), target: t, stat: d.stat, max: !!d.max }); }
  return out;
}
export const questChest = day => QUEST_CHESTS[Math.floor(rng((Math.imul((day | 0) + 5, 2654435761) >>> 0) || 3)() * QUEST_CHESTS.length)];
function ensureQuests(save, day) { const q = save.addict.q; if (q.day !== day) save.addict.q = { day, p: [0, 0, 0], chest: 0 }; return save.addict.q; }
export function addQuestProgress(save, day, r) {
  const q = ensureQuests(save, day), add = { kills: r.kills || 0, runs: 1, bombs: r.bombs || 0, chests: r.chests || 0, picks: r.picks || 0, wins: r.won && !r.mode ? 1 : 0, groove: r.groove || 0 };
  dailyQuests(day).forEach((d, i) => { q.p[i] = Math.min(d.target, d.max ? Math.max(q.p[i], add[d.stat] || 0) : q.p[i] + (add[d.stat] || 0)); });
}
export function questState(save, day) {
  const q = save.addict.q.day === day ? save.addict.q : { p: [0, 0, 0], chest: 0 };
  const quests = dailyQuests(day).map((d, i) => ({ ...d, prog: Math.min(d.target, q.p[i] || 0), done: (q.p[i] || 0) >= d.target }));
  const doneCount = quests.filter(x => x.done).length, total = quests.reduce((a, x) => a + x.target, 0), got = quests.reduce((a, x) => a + x.prog, 0);
  return { quests, doneCount, frac: total ? got / total : 0, chest: questChest(day), chestOpened: !!q.chest, chestReady: doneCount === 3 && !q.chest };
}
export function claimQuestChest(save, day) { const st = questState(save, day); if (!st.chestReady) return null; ensureQuests(save, day).chest = 1; grantReward(save, st.chest); bumpQuestStreak(save, day); return st.chest; }
// Chest streak: open the daily quest chest on consecutive days for small extra gifts. A missed day only means a fresh start.
export const QS_BONUS = [{ at: 3, reward: { beats: 100 } }, { at: 7, reward: { sparkles: 5 } }, { at: 14, reward: { eggs: 1 } }, { at: 30, reward: { sparkles: 20 } }];
function bumpQuestStreak(save, day) {
  const q = save.addict.qs, tokOk = q.last === day - 2 && q.n > 0 && save.addict.tok > 0; if (tokOk) save.addict.tok--;   // a Streak Token forgives one missed day
  q.n = q.last === day ? q.n : q.last === day - 1 || tokOk ? q.n + 1 : 1; q.last = day; q.b = 0;
  const i = QS_BONUS.findIndex(m => m.at === q.n); if (i >= 0) { grantReward(save, QS_BONUS[i].reward); q.b = i + 1; }
}
// Season: 30 calendar days, one stamp for every day you finish a run, free gifts at milestones. Leftover gifts are paid out when a season ends.
export const SEASON_DAYS = 30;
export const SEASON_MILES = [{ at: 3, reward: { beats: 150 } }, { at: 7, reward: { eggs: 1 } }, { at: 12, reward: { sparkles: 10, tok: 1 } }, { at: 18, reward: { beats: 500, eggs: 1 } }, { at: 24, reward: { sparkles: 25, tok: 1 } }, { at: 28, reward: { sparkles: 50, eggs: 2 } }];
export const seasonKey = day => Math.floor((day | 0) / SEASON_DAYS);
export function ensureSeason(save, day) {
  const k = seasonKey(day), s = save.addict.season;
  if (s.key === k) return s;
  const left = { beats: 0, sparkles: 0, eggs: 0 };
  if (s.key) SEASON_MILES.forEach((m, i) => { if (s.n >= m.at && !s.claimed[i]) { grantReward(save, m.reward); for (const q of Object.keys(left)) left[q] += m.reward[q] || 0; } });
  const note = left.beats || left.sparkles || left.eggs ? 'Last season gifts: ' + rewardText(left) : '';
  save.addict.season = { key: k, n: 0, last: 0, claimed: {}, note };
  return save.addict.season;
}
export function stampSeason(save, day) { const s = ensureSeason(save, day); if (s.last !== day && s.n < SEASON_DAYS) { s.n++; s.last = day; return true; } return false; }
export function seasonStatus(save, day) {
  const cur = save.addict.season.key === seasonKey(day), s = cur ? save.addict.season : { n: 0, last: 0, claimed: {} };
  const miles = SEASON_MILES.map((m, i) => ({ ...m, i, got: s.n >= m.at, claimed: !!s.claimed[i], ready: s.n >= m.at && !s.claimed[i] }));
  return { dayNo: (day | 0) % SEASON_DAYS + 1, daysLeft: SEASON_DAYS - ((day | 0) % SEASON_DAYS) - 1, stamps: s.n, stampedToday: s.last === day, miles, ready: miles.some(m => m.ready), note: save.addict.season.note || '' };
}
export function claimSeason(save, day, i) {
  ensureSeason(save, day); const s = save.addict.season, m = SEASON_MILES[i];
  if (!m || s.n < m.at || s.claimed[i]) return false;
  s.claimed[i] = 1; grantReward(save, m.reward); return true;
}
export function clearSeasonNote(save) { save.addict.season.note = ''; }
// Achievements reuse TROPHIES: earned = reached the goal (claimed or not). popAchievements returns the ones that just popped, once.
export const achievementCount = save => ({ got: TROPHIES.filter(t => save.trophies[t.id] || t.get(save) >= t.at).length, total: TROPHIES.length });
export function popAchievements(save) {
  const a = save.addict, fresh = [];
  for (const t of TROPHIES) if ((save.trophies[t.id] || t.get(save) >= t.at) && !a.ann[t.id]) { a.ann[t.id] = 1; fresh.push(t); }
  if (!a.annInit) { a.annInit = 1; return []; }
  return fresh;
}
// A friendlier comeback: no pressure, a few warm lines about what is waiting, the gift never expires.
export function comebackLines(save, day, now) {
  const g = comebackGift(save, now); if (!g) return [];
  const out = [g.days >= 14 ? 'The whole band missed you!' : g.days >= 7 ? 'It has been a while, welcome home!' : 'Good to see you again!'];
  if (spinReady(save, day)) out.push('🎡 A free spin is waiting');
  if (save.addict.spin.shield) out.push('🛡️ Your Streak Shield is still saved');
  if (!questState(save, day).chestOpened) out.push('🎁 Three easy quests are ready');
  out.push('🌟 Season day ' + seasonStatus(save, day).dayNo + ' of ' + SEASON_DAYS);
  out.push('Take your time. Nothing is lost.');
  return out;
}
