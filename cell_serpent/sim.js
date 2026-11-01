// Cell Serpent: pure simulation (no DOM, no canvas). The browser and the headless test suite
// run this same file. All randomness comes from one seeded generator.
//
// One run is ONE snake (one stage). A long segmented virus crawls down a winding lane toward
// the bottom of the screen as one connected chain. Your cell slides left and right along the
// bottom row and fires notes straight up, so where you stand is your aim. Every cell takes
// 10 to 20 shots. Upgrades come only from the yellow upgrade cells on the snake. Its face is shielded
// until every other cell is gone. If the face reaches the membrane it drains your HP.
// Between runs you spend Beats and Sparkles on stats, loot boxes and skill levels (meta section).
export const W = 720;
export const H = 1280;
export const LINE_Y = 1190;   // the membrane at the bottom
export const ROW_Y = 1090;    // the cell's row
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
  { id: 'notes', name: 'Harmony', max: 5, w: 1.0, vals: [1, 1, 1, 2, 2, 3], cap: 5, fmt: v => '+' + v + ' note' + (v > 1 ? 's' : '') + ' per shot', desc: '+1 note per shot, side by side' },
  { id: 'burst', name: 'Echo', max: 3, w: 0.9, vals: [1, 1, 1, 2, 2, 2], cap: 3, fmt: v => '+' + v + ' burst' + (v > 1 ? 's' : '') + ' per shot', desc: '+1 burst per shot, a quick echo of the notes' },
  { id: 'cdmg', name: 'Volume Up', max: 12, w: 1.2, vals: [12, 18, 28, 42, 65, 100], cap: 600, fmt: v => '+' + v + '% capsule damage', desc: '+30% capsule damage' },
];
export const PASSIVES = [
  { id: 'power', name: 'Loud Vocals', max: 8, w: 0.9, vals: [8, 12, 18, 28, 42, 65], cap: 300, fmt: v => '+' + v + '% damage for every skill', desc: '+20% damage for every skill', apply: () => {} },
  { id: 'haste', name: 'Tempo Up', max: 8, w: 0.9, vals: [5, 7, 10, 15, 20, 28], cap: 50, fmt: v => 'Every skill recharges ' + v + '% faster', desc: 'Every skill recharges 10% faster', apply: () => {} },
  { id: 'crit', name: 'Perfect Pitch', max: 8, w: 0.7, vals: [3, 4, 6, 9, 13, 18], cap: 40, fmt: v => '+' + v + '% crit chance', desc: '+8% crit chance for the capsule and needles', apply: (p, v) => { p.crit += v / 100; } },
  { id: 'vital', name: 'Warm Up', max: 8, w: 0.7, vals: [20, 30, 45, 70, 100, 150], cap: 99999, fmt: v => '+' + v + ' max HP and heal ' + v, desc: '+30 max HP and heal 30', apply: (p, v) => { p.maxHp += v; p.hp = Math.min(p.maxHp, p.hp + v); } },
  { id: 'guard', name: 'Ear Plugs', max: 6, w: 0.6, vals: [15, 22, 30, 40, 50, 60], cap: 60, fmt: v => 'Breaches hurt ' + v + '% less', desc: 'Breaches hurt 15% less', apply: (p, v) => { p.guard = Math.min(0.8, p.guard + v / 100); } },
  { id: 'speed', name: 'Dance Shoes', max: 6, w: 0.6, vals: [6, 9, 13, 18, 25, 35], cap: 60, fmt: v => '+' + v + '% move speed', desc: '+12% move speed', apply: (p, v) => { p.speed *= 1 + v / 100; } },
];
const PASSIVE = Object.fromEntries(PASSIVES.map(u => [u.id, u]));
const CAP_UP = Object.fromEntries(CAPSULE_UPS.map(u => [u.id, u]));

// ---------------------------------------------------------------- meta: two currencies, stats, skills, loot boxes
// Beats (gold music-note coins) come from cells and clears. Sparkles (pink star gems) come from
// clearing a stage for the first time. Fragments come from chest cells and loot boxes.
export const META = [
  { id: 'atk', name: 'Volume', max: 12, base: 30, grow: 1.45, desc: l => `+${10 * l}% damage` },
  { id: 'crt', name: 'Pitch', max: 10, base: 30, grow: 1.45, desc: l => `+${2 * l}% crit chance, +${8 * l}% crit damage` },
  { id: 'cdn', name: 'Tempo', max: 10, base: 30, grow: 1.45, desc: l => `-${5 * l}% cooldowns` },
  { id: 'vit', name: 'Stamina', max: 10, base: 25, grow: 1.45, desc: l => `+${12 * l} max HP` },
  { id: 'for', name: 'Fame', max: 10, base: 40, grow: 1.5, desc: l => `+${10 * l}% Beats` },
  { id: 'rev', name: 'Encore', max: 1, base: 400, grow: 1, desc: () => 'Get back up once per run' },
];
export const metaCost = (def, lvl) => Math.round(def.base * Math.pow(def.grow, lvl));
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
  const pets = {}; for (const p of PETS) pets[p.id] = { star: 0, frag: 0 };
  return { v: 6, loadout: [...WEAPON_STARTERS], pets, petEquip: [], prog: {}, hardCleared: 0, xp: 0, energy: { n: ENERGY_MAX, t: 0 }, keeps: Object.fromEntries(KEEPSAKES.map(k => [k.id, { lv: 0, frag: 0 }])), sign: { day: 0, n: 0 }, idle: { t: 0 }, fund: {}, shop: { welcome: 0, day: 0, refresh: 0, bought: {}, free: 0, xp: 0, gold: 0 }, eggs: 1, login: 0, pig: { day: 0, left: 3, best: 0 }, beats: 0, sparkles: 0, meta: {}, skills, daily: { day: 0, progress: {}, claimed: {} }, cleared: 0, best: 0, runs: 0, kills: 0, muted: false };
}
export function sanitizeSave(raw) {
  const s = defaultSave();
  if (!raw || typeof raw !== 'object') return s;
  const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  s.beats = num(raw.beats ?? raw.coins); s.sparkles = num(raw.sparkles);
  s.cleared = num(raw.cleared); s.best = Math.max(s.cleared, num(raw.best)); s.runs = num(raw.runs); s.kills = num(raw.kills);
  s.muted = !!raw.muted;
  if (raw.daily && typeof raw.daily === 'object') { s.daily.day = num(raw.daily.day); for (const k of Object.keys(raw.daily.progress || {})) s.daily.progress[k] = num(raw.daily.progress[k]); for (const k of Object.keys(raw.daily.claimed || {})) if (raw.daily.claimed[k]) s.daily.claimed[k] = 1; }
  for (const d of META) s.meta[d.id] = Math.min(d.max, num(raw.meta && raw.meta[d.id]));
  for (const w of WEAPONS) {
    const r = raw.skills && raw.skills[w.id];
    if (r) { s.skills[w.id].lv = Math.min(SKILL_MAX_LV, num(r.lv, s.skills[w.id].lv)); s.skills[w.id].frag = num(r.frag); }
    if (!w.frag) s.skills[w.id].lv = Math.max(1, s.skills[w.id].lv);
  }
  for (const p of PETS) { const r = raw.pets && raw.pets[p.id]; if (r) { s.pets[p.id].star = Math.min(PET_MAX_STAR, num(r.star)); s.pets[p.id].frag = num(r.frag); } }
  if (Array.isArray(raw.petEquip)) s.petEquip = raw.petEquip.filter((id, i, a) => PET[id] && s.pets[id].star > 0 && a.indexOf(id) === i).slice(0, PET_SLOTS);
  if (raw.eggs !== undefined) s.eggs = num(raw.eggs); else if (raw.runs) s.eggs = 1;
  s.login = num(raw.login); s.hardCleared = Math.min(s.cleared, num(raw.hardCleared)); s.xp = num(raw.xp);
  if (raw.energy && typeof raw.energy === 'object') s.energy = { n: Math.min(999, num(raw.energy.n, ENERGY_MAX)), t: num(raw.energy.t) };
  for (const k of KEEPSAKES) { const r = raw.keeps && raw.keeps[k.id]; if (r) { s.keeps[k.id].lv = Math.min(keepMax(k), num(r.lv)); s.keeps[k.id].frag = num(r.frag); } }
  if (raw.sign && typeof raw.sign === 'object') s.sign = { day: num(raw.sign.day), n: num(raw.sign.n) };
  if (raw.idle && typeof raw.idle === 'object') s.idle = { t: num(raw.idle.t) };
  if (raw.fund && typeof raw.fund === 'object') for (const f of FUND) if (raw.fund[f.stage]) s.fund[f.stage] = 1;
  if (raw.shop && typeof raw.shop === 'object') { const sh = raw.shop; s.shop = { welcome: sh.welcome ? 1 : 0, day: num(sh.day), refresh: num(sh.refresh), free: num(sh.free), xp: num(sh.xp), gold: num(sh.gold), bought: {} }; for (const k of Object.keys(sh.bought || {})) if (sh.bought[k]) s.shop.bought[k] = 1; }
  if (raw.prog && typeof raw.prog === 'object') for (const k of Object.keys(raw.prog)) if (/^h?\d+$/.test(k)) s.prog[k] = Math.min(100, num(raw.prog[k]));
  if (raw.pig && typeof raw.pig === 'object') s.pig = { day: num(raw.pig.day), left: Math.min(3, num(raw.pig.left, 3)), best: num(raw.pig.best) };
  const lo = Array.isArray(raw.loadout) ? raw.loadout.filter((id, i, a) => WEAPON[id] && s.skills[id].lv > 0 && a.indexOf(id) === i).slice(0, LOADOUT_SIZE) : [];
  if (lo.length) s.loadout = lo; else if (Array.isArray(raw.loadout)) s.loadout = [...WEAPON_STARTERS].filter(id => s.skills[id].lv > 0).slice(0, LOADOUT_SIZE);
  return s;
}
// One big number for how strong the account is.
export function power(save) {
  const sum = o => Object.values(o).reduce((a, x) => a + x, 0);
  return Math.round(100 + 60 * sum(save.meta) + 45 * Object.values(save.skills).reduce((a, k) => a + k.lv, 0) + 80 * Object.values(save.pets).reduce((a, k) => a + k.star, 0) + 35 * Object.values(save.keeps).reduce((a, k) => a + k.lv, 0) + 20 * levelInfo(save.xp).lv);
}
export function buyMeta(save, id) {
  const d = META.find(m => m.id === id);
  if (!d) return false;
  const lvl = save.meta[id] || 0;
  if (lvl >= d.max) return false;
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
  if (save.login !== day) { save.login = day; save.eggs++; fresh = true; }
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
  const out = [{ kind: 'sparkles', n: 10, off: 100, price: 0, cur: 'sparkles' }];
  const offs = [90, 80, 70, 50];
  for (let i = 1; i < 5; i++) {
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
  if (d.kind === 'sparkles') save.sparkles += d.n; else if (d.kind === 'frag') save.skills[d.ref].frag += d.n; else if (d.kind === 'keep') save.keeps[d.ref].frag += d.n;
  else if (d.kind === 'egg') save.eggs += d.n; else if (d.kind === 'energy') addEnergy(save, d.n); else save.beats += d.n;
  return true;
}
export function refreshDeals(save) {
  const cost = save.shop.free ? 5 : 0;
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
}
export const goalProgress = (save, day, goal) => (save.daily && save.daily.day === day ? Math.min(goal.target, (save.daily.progress[goal.stat] || 0)) : 0);
export function claimGoal(save, day, id) {
  const goal = dailyGoals(day).find(x => x.id === id);
  if (!goal || goalProgress(save, day, goal) < goal.target || (save.daily.claimed && save.daily.claimed[id])) return false;
  save.daily.claimed[id] = 1; save.beats += goal.reward.beats || 0; save.sparkles += goal.reward.sparkles || 0;
  return true;
}
export const canPlay = (save, n) => n >= 1 && n <= save.cleared + 1;
export const clearReward = n => ({ sparkles: (isBossStage(n) ? 40 : 15) + 3 * n });
// Applies a finished run to the save and returns what was earned.
export function applyResult(save, r) {
  const out = { beats: r.coins, sparkles: 0, first: false, egg: false, levelUps: 0, frags: r.frags || {} };
  const lv0 = levelInfo(save.xp).lv; save.xp += Math.round((r.kills || 0) + 25 * (r.stage || 1) * (r.won ? 2 : 1) * (r.hard ? 1.5 : 1));
  const lv1 = levelInfo(save.xp).lv; out.levelUps = lv1 - lv0;
  for (let l = lv0 + 1; l <= lv1; l++) { const rw = levelReward(l); if (rw) { save.sparkles += rw.sparkles; out.sparkles += rw.sparkles; } }
  if (r.cp50) addEnergy(save, ENERGY_BACK);
  save.beats += r.coins; save.runs++; save.kills += r.kills;
  for (const id of Object.keys(out.frags)) save.skills[id].frag += out.frags[id];
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
export const hpBase = n => 12 * (26 * Math.pow(1.08, n - 1) + 0.5 * n);   // ~14 capsule shots per cell in stage 1
export const snakeLength = n => Math.min(150, 32 + 4 * (n - 1) + (isBossStage(n) ? 12 : 0));
export const arrivalTime = n => 1.5 * Math.max(80, 112 - 0.9 * n + 2.2 * (snakeLength(n) - 32)) + (isBossStage(n) ? 36 : 0);   // seconds for the face to reach the membrane if you do nothing
// Ten species, one per stage (then they repeat): own colour, cell style, face and headgear. No yellow: yellow means upgrade cell.
export const SKINS = ['love', 'rust', 'sneezy', 'grumpy', 'sleepy', 'disco', 'sour', 'mighty', 'frosty', 'gloomy'];
export const skinFor = n => SKINS[(n - 1) % SKINS.length];
const NAMES = ['Love-Struck Virus', 'Rustic Virus', 'Sneezy Virus', 'Grumpy Flu', 'Sleepy Spore', 'Disco Germ', 'Sour Strain', 'Mighty Mold', 'Frosty Fever', 'Gloomy Gunk'];
export const virusName = n => NAMES[(n - 1) % NAMES.length] + (n > NAMES.length ? ' ' + 'I'.repeat(1 + Math.floor((n - 1) / NAMES.length)) : '');
export const PATH_KINDS = ['Gentle waves', 'Tall hairpins', 'Big lobes', 'Castle steps', 'Tight waves', 'Sharp zigzag', 'Wide S', 'Hairpin lanes', 'Wild lanes'];
const PATH_ORDER = [0, 1, 3, 2, 6, 4, 7, 5, 8];   // which shape each stage gets
export const pathKind = n => PATH_ORDER[(n - 1) % PATH_ORDER.length];
export const PIG_NAME = 'Piggy Bank Parade';
const nameOf = g => (g.mode === 'pig' ? PIG_NAME : virusName(g.stage));
const skinOf = (g, n) => (g.mode === 'pig' ? 'piggy' : skinFor(n));
export const stageInfo = n => ({ n, name: virusName(n), skin: skinFor(n), boss: isBossStage(n), length: snakeLength(n), path: PATH_KINDS[pathKind(n)], hp: Math.round(hpBase(n)) });

const KIND = { normal: { hp: 1 }, armor: { hp: 2.6 }, bomb: { hp: 1 }, upgrade: { hp: 1.6 } };

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
export function buildPath(n) {
  const R = rng(n * 7919 + 13), k = pathKind(n), end = LINE_Y + 40, cx = W / 2;
  let poly = [];
  const sine = (A, lam, ph, grow = 0) => { for (let y = -160; y <= end; y += 6) poly.push({ x: cx + (A + grow * (y / end)) * Math.sin((y / lam) * TAU + ph), y }); };
  const lanes = (pts, smooth) => { poly = [{ x: cx, y: -160 }, ...pts.map(([x, y]) => ({ x, y })), { x: cx, y: end }]; poly = chaikin(poly, smooth); };
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
  const maxHp = 100 + 12 * m('vit') + b.vit;
  return {
    x: W / 2, y: ROW_Y, r: 16, kx: 0, maxHp, hp: maxHp, speed: 300 * (1 + 0.15 * eq('hamster')) * (1 + b.speed), guard: Math.min(0.5, b.guard),
    atk: 1 + 0.10 * m('atk') + b.atk, crit: 0.05 + 0.02 * m('crt') + b.crit, critMul: 2.5 + 0.08 * m('crt'), cdBase: Math.max(0.4, 1 - 0.05 * m('cdn') - b.cdn),
    rate: 2.0, bspeed: 900,
    coinMul: 1 + 0.1 * m('for') + b.coin + 0.1 * eq('piglet'), revive: m('rev') > 0 ? 1 : 0,
    iframes: 0, shield: 0, rage: 0, cd: 0, aim: -Math.PI / 2, orbAng: 0, mx: 0,
    zone: { x0: 40, x1: W - 40 },
  };
}

// ---------------------------------------------------------------- the snake
function pickKind(g, n, boss, i, len) {
  if (i === 0) return 'normal';
  const r = g.rand();
  if (n >= 3 && r < 0.12) return 'armor';
  if (n >= 2 && r < 0.2) return 'bomb';
  return 'normal';
}
export function segRadius(boss, i, len) {
  const sc = boss ? 1.3 : 1;
  if (i === 0) return 38 * sc;
  const fromTail = len - 1 - i;
  const taper = fromTail < 5 ? 0.62 + 0.38 * (fromTail / 5) : 1;
  return 30 * sc * taper;
}
const spacing = (a, b) => (a.r + b.r) * 0.78;

function spawnSnake(g, n) {
  const pig = g.mode === 'pig', boss = isBossStage(n), len = pig ? 40 : snakeLength(n), segs = [];
  const hpB = (pig ? hpBase(1 + 2 * n) * 0.5 : hpBase(n)) * (g.hard ? HARD_HP : 1);
  let ps = 240;   // the face starts just inside the top edge
  for (let i = 0; i < len; i++) {
    const kind = pickKind(g, n, boss, i, len), r = segRadius(boss, i, len);
    let hp = hpB * KIND[kind].hp * (boss ? 1.5 : 1) * (0.9 + g.rand() * 0.2);
    hp = i === 0 ? 1 : Math.max(1, Math.round(hp));   // the face has no real HP: it is shielded until it is alone
    const pos = pointAt(g.path, ps);
    segs.push({ ps, x: pos.x, y: pos.y, ang: Math.PI / 2, r, hp, max: hp, kind, flash: 0, orbCd: 0, i, carry: null, shield: i === 0, isHead: i === 0 });
    ps -= (r + segRadius(boss, i + 1, len)) * 0.78;
  }
  // yellow upgrade cells: pop one to choose an upgrade. About one per 7 cells (at least 3), spread along the snake.
  const ups = Math.max(4, Math.round(len / 7));
  for (let k = 0; k < ups; k++) {
    const c = segs[clamp(3 + Math.round(((len - 5) * (k + 0.5)) / ups), 1, len - 1)];
    c.kind = 'upgrade'; c.max = c.hp = Math.max(1, Math.round(hpB * KIND.upgrade.hp * (boss ? 1.5 : 1)));
  }
  // chest cells (a chest on the cell): aim for them first too
  const nch = Math.max(2, Math.round(len / 15));
  for (let q = 0; q < nch; q++) {
    let j = clamp(Math.round(len * (0.2 + (0.7 * (q + 0.5)) / nch)), 1, len - 1);
    while (j < len - 1 && (segs[j].kind !== 'normal' || segs[j].carry)) j++;
    segs[j].carry = 'chest';
  }
  g.upgradeLeft = ups;
  const speed = (g.path.len - 240) / arrivalTime(n);
  g.snakes.push({ id: ++g.sid, segs, tail: segs[segs.length - 1].ps, breach: false, breachT: 0, speed, slow: 0, boss, skin: skinOf(g, n), name: g.mode === 'pig' ? PIG_NAME : virusName(n), surge: 'idle', surgeT: 4 + g.rand() * 3 });
  g.stageHpMax += segs.reduce((a, s) => a + s.max, 0);
}

export function startStage(g, n) {
  g.stage = n; g.skin = skinOf(g, n);
  g.snakes.length = 0; g.stageHpMax = 0; g.zones.length = 0; g.maws.length = 0; g.bullets.length = 0; g.vq.length = 0;
  g.path = buildPath(n);
  const p = g.p;
  p.zone = { x0: 40, x1: W - 40 }; p.x = W / 2; p.y = ROW_Y; p.kx = 0;
  spawnSnake(g, n);
  rebuildTowers(g);
  g.phase = 'play'; g.clearT = 0; g.progress = 0;
  g.events.push({ t: 'stage', n, boss: isBossStage(n), name: nameOf(g) });
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
    p: makePlayer(opts.meta, mergeBonus(petBonus(opts.pets), keepBonus(opts.arts)), opts.petEquip), mode: opts.mode || '', hard: !!opts.hard, revivesLeft: 3, revivesUsed: 0, dmgBy: {}, src: '', coinK: (opts.mode === 'pig' ? 6 : 1) * (opts.hard ? 2 : 1), pets: (opts.petEquip || []).slice(0, PET_SLOTS), petStars: opts.pets || {}, petT: {}, snakes: [], bullets: [], vq: [], pickups: [], zones: [], maws: [], towers: [],
    events: [], ups: {}, val: {}, weap: {}, unlocked, skillLv, loadout,
    level: 1, cells: 0, upgradeLeft: 0, pending: 0, choices: [], resume: 'play', rerolls: 4,
    coins: 0, kills: 0, score: 0, combo: 0, lastKill: -99, stageHp: 0, stageHpMax: 0, progress: 0, clearT: 0, lastKillPos: { x: W / 2, y: 300 },
    groove: 0, grooveT: 0, grooveMax: 0, chestsOpened: 0, frags: {}, revived: false, result: null, bot: !!opts.bot, shots: 0, leaks: 0,
  };
  startStage(g, opts.stage || 1);
  return g;
}

const visible = s => s.y > 8 && s.y < H - 8 && s.x > 8 && s.x < W - 8;
// accumulated effect of a run upgrade: summed rarity values, or the common value per pick if set directly
const UPV = Object.fromEntries([...CAPSULE_UPS, ...PASSIVES].map(u => [u.id, u]));
export const uv = (g, id) => (g.val && g.val[id] !== undefined ? g.val[id] : (g.ups[id] || 0) * UPV[id].vals[0]);
const lv = (g, id) => (g.weap[id] ? g.weap[id].lv : 0);
export const GROOVE_MAX = 20;
// Groove: every note that lands builds it, a pause in the hits lets it fade. Each point is +1.5% damage.
const dmgMul = g => 10 * g.p.atk * (1 + uv(g, 'power') / 100) * (1 + 0.015 * g.groove);   // x10: damage and HP are shown as big numbers
function bumpGroove(g) {
  g.grooveT = 0;
  if (g.groove < GROOVE_MAX) { g.groove++; if (g.groove > g.grooveMax) g.grooveMax = g.groove; if (g.groove % 5 === 0) g.events.push({ t: 'groove', n: g.groove }); }
}
const cdMul = g => g.p.cdBase * Math.max(0.3, 1 - uv(g, 'haste') / 100);

function eachTarget(g, fn) {
  for (const sn of g.snakes) for (const s of sn.segs) if (s.hp > 0 && !s.shield && !s.wave) fn(s, sn);
}
function nearestTarget(g, x, y, maxD = 1e9) {
  let best = null, bd = maxD;
  eachTarget(g, s => {
    if (!visible(s)) return;
    const d = Math.hypot(s.x - x, s.y - y) - s.r;
    if (d < bd) { bd = d; best = s; }
  });
  return best;
}
const frontSegs = g => g.snakes.map(sn => sn.segs[0]).filter(s => s && visible(s));

const damageSegAs = (src, g, ...a) => { g.src = src; damageSeg(g, ...a); g.src = ''; };
function damageSeg(g, s, dmg, crit, x, y) {
  if (s.hp <= 0 || s.shield || s.wave) return;
  const srcId = g.src || 'capsule'; g.dmgBy[srcId] = (g.dmgBy[srcId] || 0) + Math.min(dmg, s.hp);
  s.hp -= dmg; s.flash = 0.12;
  g.events.push({ t: 'hit', x: x ?? s.x, y: y ?? s.y, d: dmg, crit: !!crit, s });
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
    else if (id === 'lamb' && t > 24 - 2 * n) { g.petT[id] = 0; p.shield = Math.max(p.shield, 3); g.events.push({ t: 'pet', id }); }
    else if (id === 'turtle' && t > 10) { g.petT[id] = 0; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (0.03 + 0.01 * n)); g.events.push({ t: 'pet', id }); }
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
  g.events.push({ t: 'kill', x: s.x, y: s.y, r: s.r, kind: s.kind, head: s.isHead, boss: sn.boss, i: s.i, skin: sn.skin });
  if (s.kind === 'bomb') {
    const R = 150;
    g.events.push({ t: 'boom', x: s.x, y: s.y, r: R });
    for (const o of g.snakes) for (const q of o.segs) if (q !== s && q.hp > 0 && Math.hypot(q.x - s.x, q.y - s.y) < R + q.r) damageSeg(g, q, Math.max(2, s.max * 0.9), false, q.x, q.y);
    if (Math.hypot(g.p.x - s.x, g.p.y - s.y) < R) hurtPlayer(g, 14, s.x, s.y);
  }
}

// Remove dead cells. The virus stays one connected chain: the cells in front of a gap slide back to
// close it (see the chain update in step), so it just gets shorter. The face pops once it is alone.
function reap(g) {
  for (let pass = 0; pass < 8; pass++) {
    let any = false;
    for (const sn of g.snakes) {
      if (sn.segs.length === 1 && sn.segs[0].hp > 0) { sn.segs[0].shield = false; sn.segs[0].hp = 0; }
      if (!sn.segs.some(q => q.hp <= 0)) continue;
      any = true;
      for (const q of sn.segs) if (q.hp <= 0) onKill(g, q, sn);
      sn.segs = sn.segs.filter(q => q.hp > 0);
      g.events.push({ t: 'close' });
    }
    g.snakes = g.snakes.filter(sn => sn.segs.length > 0);
    if (!any) break;
  }
}

function hurtPlayer(g, dmg, fx, fy) {
  const p = g.p;
  if (p.iframes > 0 || g.phase === 'dead') return;
  if (p.shield > 0) { p.iframes = 0.3; g.events.push({ t: 'block', x: p.x, y: p.y }); return; }
  p.hp -= dmg; p.iframes = 0.9;
  p.kx = (p.x >= fx ? 1 : -1) * 420;
  g.combo = 0;
  g.events.push({ t: 'hurt', x: p.x, y: p.y, d: dmg });
  if (p.hp <= 0) {
    if (p.revive > 0 && !g.revived) {
      g.revived = true; p.revive = 0; p.hp = Math.round(p.maxHp * 0.5); p.iframes = 2.2;
      g.events.push({ t: 'revive' });
    } else { p.hp = 0; g.phase = 'dead'; g.result = makeResult(g, false); g.events.push({ t: 'dead' }); }
  }
}
export const reviveCost = used => 10 * (used + 1);
// Revive: back up with half HP and the whole snake knocked back.
export function reviveGame(g) {
  if (g.phase !== 'dead' || g.revivesLeft < 1) return false;
  g.revivesLeft--; g.revivesUsed++; g.phase = 'play'; g.result = null;
  g.p.hp = Math.round(g.p.maxHp * 0.6); g.p.iframes = 3;
  for (const sn of g.snakes) { sn.tail -= 520; for (const q of sn.segs) q.ps -= 520; sn.breach = false; sn.breachT = 0; }
  g.events.push({ t: 'revive' });
  return true;
}
function makeResult(g, won) {
  return { chests: g.chestsOpened, groove: g.grooveMax, picks: g.level - 1, won, stage: g.stage, kills: g.kills, coins: Math.floor(g.coins), score: g.score, level: g.level, time: g.t, boss: isBossStage(g.stage), name: nameOf(g), mode: g.mode, hard: g.hard, cp50: !!(g.cp && g.cp[0.5]), progress: g.progress, dmgBy: { ...g.dmgBy }, frags: { ...g.frags } };
}
// the face has reached the membrane and is chewing through it: HP drains until you finish the cells
// behind it (each kill pushes the face back off the membrane)
function breachTick(g, sn) {
  const dmg = (4 + g.stage * 0.4) * (1 - Math.min(0.6, g.p.guard)), p = g.p, keep = p.iframes;
  p.iframes = 0; g.leaks++;
  g.events.push({ t: 'leak', x: sn.segs[0].x, y: LINE_Y, d: dmg });
  hurtPlayer(g, dmg, sn.segs[0].x, LINE_Y - 80);
  p.iframes = Math.max(keep, 0);
}

// ---------------------------------------------------------------- skill picks
// what an upgrade does now and after this pick, so every pick is visible in numbers
const STAT_NAME = { aspd: 'Attack speed', notes: 'Notes per shot', burst: 'Bursts per shot', cdmg: 'Capsule damage' };
function statText(id, cur, add) {
  if (id === 'notes' || id === 'burst') return `${STAT_NAME[id]}: ${1 + cur} → ${1 + cur + add}`;
  return `${STAT_NAME[id] || UPV[id].name}: +${cur}% → +${cur + add}%`;
}
function rollChoices(g) {
  const pool = [];
  const early = g.level < 3;   // the first two picks are capsule upgrades only
  const luck = g.level - 1;
  for (const u of CAPSULE_UPS) { const l = g.ups[u.id] || 0, cur = uv(g, u.id); if (l < u.max && cur < u.cap) pool.push({ id: u.id, kind: 'capsule', name: u.name, u, lvl: l, max: u.max, isNew: !l, w: u.w * (early ? 2 : 1) }); }
  if (!early) {
    const owned = Object.keys(g.weap).length;
    for (const w of WEAPONS) {
      if (!g.loadout.includes(w.id)) continue;
      const l = lv(g, w.id);
      if (l >= w.max || (!l && owned >= LOADOUT_SIZE)) continue;
      pool.push({ id: w.id, kind: 'weapon', name: w.name, desc: w.desc, lvl: l, max: w.max, isNew: !l, w: l ? 1.7 : 1.2 });
    }
    for (const u of PASSIVES) { const l = g.ups[u.id] || 0; if (l < u.max && uv(g, u.id) < u.cap) pool.push({ id: u.id, kind: 'passive', name: u.name, u, lvl: l, max: u.max, isNew: !l, w: u.w }); }
  }
  const out = [];
  while (out.length < 3 && pool.length) {
    const tot = pool.reduce((a, u) => a + u.w, 0);
    let r = g.rand() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
    out.push(pool.splice(k, 1)[0]);
  }
  // one random card is always common; the others roll with your luck
  const common = Math.floor(g.rand() * out.length);
  out.forEach((c, i) => {
    c.rarity = i === common ? 0 : rollRarity(g.rand, luck);
    if (c.kind === 'weapon') {
      c.gain = Math.min(c.max - c.lvl, [1, 1, 2, 2, 3, 3][c.rarity]);
      c.stat = c.isNew ? `New skill, starts at Lv ${c.gain}` : `Level ${c.lvl} → ${c.lvl + c.gain}`;
    } else {
      const add = c.u.vals[c.rarity], cur = uv(g, c.id), room = c.u.cap - cur;
      c.gain = Math.min(add, room);
      c.desc = c.u.fmt(c.gain);
      c.stat = c.kind === 'capsule' ? statText(c.id, cur, c.gain) : '';
    }
  });
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
export function reroll(g) {
  if (g.phase !== 'levelup' || g.rerolls <= 0) return false;
  g.rerolls--; g.choices = rollChoices(g);
  return true;
}
function rebuildTowers(g) {
  const L = lv(g, 'tower'), n = L ? 1 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0) : 0;
  const offs = [[-150, -40], [150, -40], [0, -150]], p = g.p;
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
  } else if (c.kind === 'passive') { const cur = uv(g, c.id); PASSIVE[c.id].apply(g.p, gain); g.val[c.id] = cur + gain; g.ups[c.id] = (g.ups[c.id] || 0) + 1; }
  else { g.val[c.id] = uv(g, c.id) + gain; g.ups[c.id] = (g.ups[c.id] || 0) + 1; }
  g.pending--; g.level++;
  g.events.push({ t: 'upgrade', id: c.id, kind: c.kind, rarity: c.rarity || 0 });
  if (g.pending > 0) { g.choices = rollChoices(g); if (!g.choices.length) { g.pending = 0; g.phase = g.resume; } } else g.phase = g.resume;
  return true;
}
function collect(g, pk) {
  const p = g.p;
  if (pk.kind === 'heal') { p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.3)); g.events.push({ t: 'power', kind: 'heal', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'shield') { p.shield = 6; g.events.push({ t: 'power', kind: 'shield', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'rage') { p.rage = 8; g.events.push({ t: 'power', kind: 'rage', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'chest') {   // chests give Beats and a skill fragment, never a skill pick
    const id = randomFragment(g);
    const cp = pk.cp || 0;
    g.coins += (4 + g.stage * 2) * p.coinMul * (cp ? cp * 2 : 1) * (g.coinK || 1); if (!cp) g.frags[id] = (g.frags[id] || 0) + 1; g.chestsOpened++;
    g.events.push({ t: 'chest', x: pk.x, y: pk.y, frag: id }); return;
  }
  if (pk.kind === 'coin') { g.coins += pk.v * p.coinMul * (g.coinK || 1); g.events.push({ t: 'coin', x: pk.x, y: pk.y, v: pk.v }); }
}

// ---------------------------------------------------------------- shooting and skills
function fire(g, o) {
  g.bullets.push({ x: o.x, y: o.y, vx: Math.cos(o.a) * o.sp, vy: Math.sin(o.a) * o.sp, dmg: o.dmg, crit: !!o.crit, pierce: o.pierce || 0, r: o.r || 6, life: o.life || 1.4, hit: [], kind: o.kind || 'pill', home: o.home || 0, splash: o.splash || 0, slow: o.slow || 0 });
}
// the capsule: straight up, [1 + extra notes] side by side, [1 + extra bursts] volleys per shot
function shootCapsule(g, dt) {
  const p = g.p, up = id => uv(g, id);
  p.aim = -Math.PI / 2;
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
    for (let k = 0; k < n; k++) {
      const crit = g.rand() < p.crit;
      fire(g, { x: p.x + (k - (n - 1) / 2) * 42, y: p.y - 30, a: p.aim, sp: p.bspeed, dmg: dmgMul(g) * (1 + up('cdmg') / 100) * (p.rage > 0 ? 1.6 : 1) * (crit ? p.critMul : 1), crit, r: 6, life: 1.4, kind: 'pill' });
    }
    g.shots++; g.events.push({ t: 'shoot' });
  }
}
function updateWeapons(g, dt, canFire) {
  const p = g.p, cm = cdMul(g);
  const dm = id => dmgMul(g) * skillMul(g.skillLv[id] || 1);   // permanent skill level scales that skill's damage
  const wantTowers = lv(g, 'tower') ? 1 + (lv(g, 'tower') >= 3 ? 1 : 0) + (lv(g, 'tower') >= 5 ? 1 : 0) : 0;
  if (g.towers.length !== wantTowers) rebuildTowers(g);
  const aim = -Math.PI / 2;   // nothing auto-aims except the Snot Dragon's homing
  for (const id of Object.keys(g.weap)) {
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
        g.zones.push({ x: t.x + (k ? 90 : 0), y: t.y, r: 62 + 16 * L, life: dur, max: dur, tick: 0, dmg: 0.8 * (1 + 0.3 * L) * dm('swab') });
      }
      g.events.push({ t: 'swab' }); w.cd = (4.2 - 0.3 * L) * cm;
    } else if (id === 'dragon') {
      if (!nearestTarget(g, p.x, p.y, 1400)) { w.cd = 0.3; continue; }
      const n = 1 + Math.floor((L + 1) / 2);
      for (let k = 0; k < n; k++) fire(g, { x: p.x, y: p.y - 20, a: -Math.PI / 2 + (k - (n - 1) / 2) * 0.7, sp: 440, dmg: 2.0 * (1 + 0.4 * L) * dm('dragon'), r: 11, life: 2.6, kind: 'snot', home: 7, splash: 46 });
      g.events.push({ t: 'dragon' }); w.cd = (1.8 - 0.1 * L) * cm;
    } else if (id === 'needles') {
      const n = 3 + L;
      for (let k = 0; k < n; k++) {
        const crit = g.rand() < p.crit;
        fire(g, { x: p.x, y: p.y - 10, a: aim + (k - (n - 1) / 2) * 0.09, sp: 1100, dmg: 0.8 * (1 + 0.3 * L) * dm('needles') * (crit ? p.critMul : 1), crit, pierce: 2 + L, r: 5, life: 1.2, kind: 'needle' });
      }
      g.events.push({ t: 'needles' }); w.cd = (1.8 - 0.12 * L) * cm;
    } else if (id === 'bubble') {
      for (let k = 0; k < (L >= 4 ? 2 : 1); k++) fire(g, { x: p.x, y: p.y - 30, a: aim + (k ? 0.5 : 0), sp: 190, dmg: 1.2 * (1 + 0.3 * L) * dm('bubble'), r: 22 + 3 * L, life: 3.2, kind: 'bubble', splash: 70 + 10 * L, slow: 2 });
      g.events.push({ t: 'bubble' }); w.cd = (3.4 - 0.2 * L) * cm;
    } else if (id === 'satellite') {
      const vis = []; eachTarget(g, s => { if (visible(s)) vis.push(s); });
      if (!vis.length) { w.cd = 0.3; continue; }
      vis.sort((a, b) => b.hp - a.hp);
      for (let k = 0; k < 1 + Math.floor((L + 1) / 2); k++) {
        const s = vis[Math.floor(g.rand() * Math.min(vis.length, 5))];
        damageSegAs('satellite', g, s, Math.max(1.8 * (1 + 0.3 * L) * dm('satellite'), s.max * (0.02 + 0.008 * L) * Math.min(dm('satellite') / 10, 3)), false, s.x, s.y);
        g.events.push({ t: 'strike', x: s.x, y: s.y });
      }
      w.cd = (3.6 - 0.25 * L) * cm;
    } else if (id === 'maw') {
      const vis = []; eachTarget(g, s => { if (visible(s)) vis.push(s); });
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
    for (let i = 0; i < 1 + dl; i++) {
      const pos = daggerPos(g, i);
      eachTarget(g, s => { if (s.orbCd <= 0 && Math.hypot(s.x - pos.x, s.y - pos.y) < s.r + 12) { s.orbCd = 0.3; damageSegAs('daggers', g, s, 1.2 * (1 + 0.3 * dl) * dm('daggers'), false, pos.x, pos.y); } });
    }
  }
  // massage stick (sweeping bar)
  const sl = lv(g, 'stick');
  if (sl) {
    for (let k = 0; k < (sl >= 4 ? 2 : 1); k++) {
      const sg = stickSeg(g, k);
      eachTarget(g, s => {
        if (s.orbCd > 0) return;
        if (distToSeg(s.x, s.y, sg.x0, sg.y0, sg.x1, sg.y1) < s.r + 12) { s.orbCd = 0.35; damageSegAs('stick', g, s, 1.8 * (1 + 0.35 * sl) * dm('stick'), false, s.x, s.y); }
      });
    }
  }
  // medical towers pulse
  const tl = lv(g, 'tower');
  for (const t of g.towers) {
    t.cd -= dt; if (t.pulse > 0) t.pulse -= dt;
    if (t.cd <= 0 && canFire) {
      t.cd = (2.4 - 0.15 * tl) * cm; t.pulse = 0.5;
      const R = 170 + 18 * tl;
      g.events.push({ t: 'pulse', x: t.x, y: t.y, r: R });
      eachTarget(g, s => { if (Math.hypot(s.x - t.x, s.y - t.y) < R + s.r) damageSegAs('tower', g, s, 1.5 * (1 + 0.35 * tl) * dm('tower'), false, s.x, s.y); });
    }
  }
  // swab zones tick
  for (let i = g.zones.length - 1; i >= 0; i--) {
    const z = g.zones[i]; z.life -= dt; z.tick -= dt;
    if (z.tick <= 0) { z.tick = 0.25; eachTarget(g, s => { if (Math.hypot(s.x - z.x, s.y - z.y) < z.r + s.r) damageSegAs('swab', g, s, z.dmg, false, s.x, s.y); }); }
    if (z.life <= 0) g.zones.splice(i, 1);
  }
  // maws execute
  for (let i = g.maws.length - 1; i >= 0; i--) {
    const m = g.maws[i]; m.life -= dt; m.tick -= dt;
    if (m.tick <= 0) {
      m.tick = 0.2;
      eachTarget(g, s => {
        if (Math.hypot(s.x - m.x, s.y - m.y) >= m.r + s.r) return;
        if (s.hp <= s.max * m.exec) damageSegAs('maw', g, s, s.hp + 1, false, s.x, s.y); else damageSegAs('maw', g, s, m.dmg, false, s.x, s.y);
      });
    }
    if (m.life <= 0) g.maws.splice(i, 1);
  }
}
export function daggerPos(g, i) {
  const dl = lv(g, 'daggers'), p = g.p, a = p.orbAng + (i / Math.max(1, 1 + dl)) * TAU, R = 92 + 8 * dl;
  return { x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R, a };
}
export function stickSeg(g, k = 0) {
  const sl = lv(g, 'stick'), p = g.p, len = 150 + 12 * sl;
  const a = -Math.PI / 2 + Math.sin(g.t * 2.2 + k * Math.PI) * 1.15;
  return { x0: p.x, y0: p.y, x1: p.x + Math.cos(a) * len, y1: p.y + Math.sin(a) * len, a, len };
}
function distToSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

// ---------------------------------------------------------------- step
export function step(g, dt, input) {
  if (g.phase !== 'play' && g.phase !== 'clear') return;
  g.t += dt;
  const p = g.p;

  // the cell slides left and right along its row
  p.mx = input ? clamp(input.mx || 0, -1, 1) : 0;
  p.x += (p.mx * p.speed + p.kx) * dt;
  p.kx *= Math.exp(-9 * dt);
  p.x = clamp(p.x, p.zone.x0, p.zone.x1); p.y = ROW_Y;
  if (p.iframes > 0) p.iframes -= dt;
  if (p.shield > 0) p.shield -= dt;
  if (p.rage > 0) p.rage -= dt;
  g.grooveT += dt; if (g.grooveT > 1.2 && g.groove > 0) g.groove = Math.max(0, g.groove - 8 * dt);   // the groove fades when the hits stop

  // the virus rides the track as one connected chain driven by its tail. Cells in front of a gap
  // slide back to close it, so every kill also pushes the face away from the membrane.
  let stageHp = 0;
  for (const sn of g.snakes) {
    sn.slow = Math.max(0, sn.slow - dt);
    // now and then it surges for a second (with a warning beforehand)
    if (g.phase === 'play') {
      sn.surgeT -= dt;
      if (sn.surge === 'idle' && sn.surgeT <= 0) { sn.surge = 'warn'; sn.surgeT = 0.6; g.events.push({ t: 'surgewarn' }); }
      else if (sn.surge === 'warn' && sn.surgeT <= 0) { sn.surge = 'go'; sn.surgeT = 1.1; g.events.push({ t: 'surge' }); }
      else if (sn.surge === 'go' && sn.surgeT <= 0) { sn.surge = 'idle'; sn.surgeT = (sn.boss ? 3.5 : 5.5) + g.rand() * (sn.boss ? 3 : 5); }
    }
    const v = sn.speed * (sn.slow > 0 ? 0.55 : 1) * (sn.surge === 'go' ? 2.6 : 1) * (g.phase === 'clear' ? 0 : 1);
    const segs = sn.segs, last = segs.length - 1;
    let total = 0;
    for (let i = 0; i < last; i++) total += spacing(segs[i], segs[i + 1]);
    const maxTail = g.path.len - total;
    sn.tail = Math.min(sn.tail + v * dt, maxTail);
    sn.breach = sn.tail >= maxTail - 0.5;
    let target = sn.tail;
    for (let i = last; i >= 0; i--) {
      if (i < last) target += spacing(segs[i], segs[i + 1]);
      segs[i].tp = target;
    }
    segs[0].shield = segs.length > 1;
    // boss: a wave of shields rolls down the chain like a beat. Cells inside it cannot be hit, so time your shots.
    const wavePos = sn.boss ? (g.t * 4.5) % (segs.length + 8) : -99;
    for (let i = 0; i < segs.length; i++) segs[i].wave = sn.boss && i > 0 && Math.abs(i - wavePos) < 1.6;
    if (sn.breach && g.phase === 'play') { sn.breachT -= dt; if (sn.breachT <= 0) { sn.breachT = 0.5; breachTick(g, sn); } } else sn.breachT = 0;
    for (const s of segs) {
      const ox = s.x, oy = s.y;
      s.ps = s.tp >= s.ps ? s.tp : Math.max(s.tp, s.ps - 320 * dt);
      const pos = pointAt(g.path, s.ps), pa = pointAt(g.path, s.ps - 8), pb = pointAt(g.path, s.ps + 8);
      s.x = pos.x; s.y = pos.y; s.ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      s.vx = (s.x - ox) / dt; s.vy = (s.y - oy) / dt;
      stageHp += Math.max(0, s.hp);
      if (s.flash > 0) s.flash -= dt;
      if (s.orbCd > 0) s.orbCd -= dt;
      if (s.hp > 0 && Math.hypot(s.x - p.x, s.y - p.y) < s.r + p.r * 0.75) hurtPlayer(g, 9 + g.stage * 0.5, s.x, s.y);
    }
  }
  g.stageHp = stageHp;
  g.progress = g.stageHpMax ? clamp(1 - stageHp / g.stageHpMax, 0, 1) : 0;
  // chests at a quarter and half way: even a lost run pays for how far it got
  for (const [th, k] of [[0.25, 1], [0.5, 2]]) if (g.phase === 'play' && g.progress >= th && !(g.cp || (g.cp = {}))[th]) { g.cp[th] = 1; g.pickups.push({ kind: 'chest', x: W / 2, y: 320, vx: 0, vy: 0, v: 1, cp: k, age: 0, vac: false }); g.events.push({ t: 'checkpoint', k }); }
  if (g.phase === 'play') petTick(g, dt);

  // the capsule never aims: it fires straight up, so you aim by sliding
  const canFire = g.phase === 'play';
  if (canFire) shootCapsule(g, dt);
  updateWeapons(g, dt, canFire);

  // projectiles
  for (let bi = g.bullets.length - 1; bi >= 0; bi--) {
    const b = g.bullets[bi];
    if (b.home > 0) {
      const t = nearestTarget(g, b.x, b.y, 320);
      if (t) {
        const sp = Math.hypot(b.vx, b.vy), cur = Math.atan2(b.vy, b.vx);
        const na = cur + clamp(angDiff(Math.atan2(t.y - b.y, t.x - b.x), cur), -b.home * dt, b.home * dt);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30;
    if (!dead) {
      for (const sn of g.snakes) for (const s of sn.segs) {
        if (dead || s.hp <= 0 || s.shield || s.wave || b.hit.includes(s) || Math.hypot(s.x - b.x, s.y - b.y) >= s.r + b.r) continue;
        b.hit.push(s);
        damageSegAs(({ needle: 'needles', snot: 'dragon', bubble: 'bubble' })[b.kind] || 'capsule', g, s, b.dmg, b.crit, b.x, b.y); bumpGroove(g);
        if (b.slow) sn.slow = Math.max(sn.slow, b.slow);
        if (b.splash > 0) {
          const sd = b.dmg * (b.kind === 'bubble' ? 2.2 : 0.5);
          eachTarget(g, (q, qs) => { if (q !== s && Math.hypot(q.x - s.x, q.y - s.y) < b.splash + q.r) { damageSeg(g, q, sd, false, q.x, q.y); if (b.slow) qs.slow = Math.max(qs.slow, b.slow); } });
          g.events.push({ t: b.kind === 'bubble' ? 'burst' : 'splash', x: s.x, y: s.y, r: b.splash });
        }
        if (b.pierce-- <= 0) dead = true;
      }
    }
    if (dead) g.bullets.splice(bi, 1);
  }

  reap(g);

  // pickups always fly to the cell (it cannot chase them up the screen)
  for (let i = g.pickups.length - 1; i >= 0; i--) {
    const pk = g.pickups[i];
    pk.age += dt;
    const d = Math.hypot(p.x - pk.x, p.y - pk.y);
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
    const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1, reach = 170 + s.r;
    if (d < reach) ax += (dx >= 0 ? 1 : -1) * ((reach - d) / reach) * 2.6;
  }
  // aim: chest cells first, otherwise the cell closest to the membrane
  let tgt = null;
  for (const sn of g.snakes) for (const s of sn.segs) if (s.hp > 0 && !s.shield && !s.wave && s.y > 40 && s.y < p.y - 120) {
    if (s.carry === 'chest') { tgt = s; break; }
    if (!tgt || s.ps > tgt.ps) tgt = s;
  }
  if (tgt) ax += clamp((tgt.x - p.x) / 120, -1, 1) * 0.9;
  return { mx: clamp(ax, -1, 1), my: 0 };
}
