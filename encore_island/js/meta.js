'use strict';
// Encore Island — meta systems: quests, milestones, fans, pets, wheel, daily gifts, prestige, saving.
// ---- quests + milestones ----
const QDEFS = [
  { kind: 'kill', name: (n) => 'Defeat ' + n + ' creatures', goals: [25, 50, 100, 200], rw: 6 },
  { kind: 'sell', name: (n) => 'Sell ' + n + ' items', goals: [20, 40, 80, 160], rw: 5 },
  { kind: 'earn', name: (n) => 'Earn ' + fmt(n) + ' coins', goals: [40, 150, 600, 2500], rw: 8, scale: true },
  { kind: 'gem', name: (n) => 'Collect ' + n + ' gems', goals: [2, 3, 5, 8], rw: 8 },
  { kind: 'boss', name: (n) => 'Defeat ' + n + ' Headliner' + (n > 1 ? 's' : ''), goals: [1, 1, 2, 3], rw: 24 },
  { kind: 'land', name: (n) => 'Open ' + n + ' new land' + (n > 1 ? 's' : ''), goals: [1, 1, 2, 2], rw: 30 },
  { kind: 'encore', name: (n) => 'Trigger ENCORE ' + n + 'x', goals: [1, 1, 2, 3], rw: 14 },
  { kind: 'chest', name: (n) => 'Open ' + n + ' treasure chest' + (n > 1 ? 'es' : ''), goals: [1, 1, 2, 3], rw: 16 },
];
function mkQuest(def, tier) {
  const goal = def.scale ? Math.ceil(def.goals[tier] * helmVal(Math.max(1, S.lands.length))) : def.goals[tier];
  return { kind: def.kind, goal, prog: 0, done: false, tier, reward: Math.ceil(def.rw * helmVal(Math.max(1, S.lands.length)) * (1 + tier * 0.5)), gems: tier >= 2 ? 1 : 0 };
}
const questName = (q) => QDEFS.find(d => d.kind === q.kind).name(q.goal);
function rollDailies() { S.dailies = []; const pool = QDEFS.slice(); for (let i = 0; i < 3; i++) { const d = pool.splice(Math.floor(vrnd() * pool.length), 1)[0]; S.dailies.push(Object.assign(mkQuest(d, Math.min(3, 1 + i)), { daily: true })); } }
function rollQuest() { const have = S.quests.map(q => q.kind), pool = QDEFS.filter(d => !have.includes(d.kind)); const d = pool[Math.floor(vrnd() * pool.length)] || QDEFS[0]; return mkQuest(d, Math.min(3, Math.floor(S.stats.quests / 4))); }
function ensureQuests() { while (S.quests.length < 3) S.quests.push(rollQuest()); if (!S.dailies.length) rollDailies(); }
function questEvent(kind, n) {
  if (!S.started) return;
  for (const q of S.dailies.concat(S.quests)) {
    if (q.done || q.kind !== kind) continue;
    q.prog = Math.min(q.goal, q.prog + n);
    if (q.prog >= q.goal) completeQuest(q);
  }
}
function completeQuest(q) {
  q.done = true; S.wallet += q.reward; S.stats.quests++; S.stats.earned += q.reward; if (q.gems) { S.gems += q.gems; S.stats.gemsFound += q.gems; }
  S.toasts.push({ txt: 'Quest done! +' + fmt(q.reward), t: 0, ic: 'scroll' }); float(S.player.x, S.player.y - 90, '+' + fmt(q.reward), '#ffd94a', true);
  S.goldPulse = Math.max(S.goldPulse, 0.6); sfx('levelup', true); starBurst(S.player.x, S.player.y - 40, 14, ['#ffe98a', '#ff9ac8'], 260);
  if (!q.daily) setTimeout(() => { const i = S.quests.indexOf(q); if (i >= 0) S.quests[i] = rollQuest(); }, 1800);
}
function dayStr() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function checkDay() {
  const ds = dayStr(); if (S.dayKey === ds) return;
  const y = new Date(Date.now() - 864e5), ys = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
  S.streak = S.dayKey === ys ? S.streak + 1 : 1; S.dayKey = ds; rollDailies();
}
const ACH = [];
(function () {
  const A = (id, name, d, c) => ACH.push({ id, name, d, c });
  [[1, 'First Note'], [100, 'Crowd Warmer'], [1000, 'Noise Maker'], [10000, 'Chart Crusher'], [100000, 'Soundlands Legend']].forEach(([n, nm]) => A('k' + n, nm, 'Defeat ' + fmt(n) + ' creatures', () => S.stats.kills >= n));
  [2, 5, 10, 20, 40].forEach(n => A('l' + n, n + ' Lands', 'Open ' + n + ' lands', () => S.lands.length >= n));
  [1, 10, 50].forEach(n => A('b' + n, n === 1 ? 'Headliner Down' : 'Headliner Hunter ' + n, 'Defeat ' + n + ' Headliners', () => S.stats.bosses >= n));
  [1e3, 1e6, 1e9, 1e12, 1e18].forEach((n, i) => A('e' + i, ['Pocket Change', 'Millionaire', 'Billionaire', 'Trillionaire', 'Quintillionaire'][i], 'Earn ' + fmt(n) + ' coins', () => S.stats.earned >= n));
  [100, 1000, 10000].forEach(n => A('s' + n, 'Merch Table ' + fmt(n), 'Sell ' + fmt(n) + ' items', () => S.stats.sold >= n));
  [10, 25, 50].forEach(n => A('v' + n, 'Level ' + n, 'Reach hero level ' + n, () => S.level >= n));
  [1, 3, 10].forEach(n => A('c' + n, n === 1 ? 'Encore Tour' : 'Tour x' + n, 'Complete ' + n + ' Encore Tour' + (n > 1 ? 's' : ''), () => S.prestiges >= n));
  [1, 10, 50].forEach(n => A('g' + n, 'ENCORE x' + n, 'Trigger ENCORE ' + n + ' times', () => S.stats.encores >= n));
  [50, 500, 5000].forEach(n => A('p' + n, 'In the Pocket ' + n, 'Land ' + n + ' on-beat kills', () => S.stats.perfect >= n));
  [1, 6, 12].forEach(n => A('t' + n, n === 1 ? 'Critter Friend' : n + ' Critters', 'Tame ' + n + ' critters', () => petsOwned() >= n));
  [25, 100].forEach(n => A('m' + n, n + ' Combo', 'Reach a ' + n + '-kill combo', () => S.comboBest >= n));
  A('o4', 'Wardrobe', 'Own 4 outfits', () => Object.keys(S.skins.owned).length >= 4);
  A('dex', 'Soundlands Expert', 'Meet all 8 creature families', () => bestiarySeen() >= 8);
  A('fan', 'Fan Club', 'Recruit 10 fans', () => S.pop.length >= 10);
  A('forge', 'Gold Smith', 'Build the smelter', () => !!S.forge);
})();
function tickMeta(dt) {
  S.achCd -= dt;
  if (S.achCd > 0) return; S.achCd = 0.5;
  for (const a of ACH) if (!S.ach[a.id] && a.c()) { S.ach[a.id] = true; S.gems += 1; S.stats.gemsFound++; S.toasts.push({ txt: 'Milestone: ' + a.name + '  +1 gem', t: 0, ic: 'trophy' }); sfx('levelup', true); }
  const r = heroRankIdx();
  if (r > (S.rankIdx || 0)) { S.rankIdx = r; S.toasts.push({ txt: 'RANK UP — ' + RANKS[r].name + '!', t: 0, ic: 'star' }); JUICE.flash = 0.4; starBurst(S.player.x, S.player.y - 40, 18, ['#ffe98a', '#ff9ac8', '#9af0b4'], 300); sfx('unlock', true); }
}
// ---- fans ----
function recruit() { if (S.pop.length >= popCap() || S.wallet < recruitCost()) { sfx('hurt'); return false; } S.wallet -= recruitCost(); const f = mkFan(S.pop.filter(p => p.role === 'fight').length < S.pop.length / 2 ? 'fight' : 'gather'); S.pop.push(f); sfx('built', true); starBurst(STAGE.x, STAGE.y, 10, ['#ffe98a', '#9af0b4'], 200); return true; }
function buyHouse() { if (S.houses >= HOUSE_MAX || S.wallet < houseCost(S.houses)) { sfx('hurt'); return false; } S.wallet -= houseCost(S.houses); S.houses++; sfx('built', true); return true; }
function setFans(role, n) { // shift fans between roles so that exactly n have `role`
  const other = role === 'fight' ? 'gather' : 'fight'; n = clamp(n, 0, S.pop.length);
  const cnt = () => S.pop.filter(f => f.role === role).length;
  while (cnt() < n) { const f = S.pop.find(f => f.role === other); if (!f) break; f.role = role; f.carry = []; f.route = null; f.state = 'seek'; }
  while (cnt() > n) { const f = S.pop.find(f => f.role === role); if (!f) break; f.role = other; f.carry = []; f.route = null; f.state = 'seek'; }
}
const fansOf = (role) => S.pop.filter(f => f.role === role).length;
// ---- skins ----
function buySkin(id) {
  const s = skinDef(id);
  if (skinOwned(id)) { S.skins.active = id; sfx('ui_tap'); save(); return true; }
  if (s.rank !== undefined) { if (heroRankIdx() < s.rank) { float(S.player.x, S.player.y - 80, 'Reach ' + RANKS[s.rank].name + ' rank', '#ffd94a'); return false; } S.skins.owned[id] = true; S.skins.active = id; }
  else { const have = s.cur === 'crown' ? S.crowns : S.gems; if (have < s.cost) { float(S.player.x, S.player.y - 80, 'Need ' + s.cost + (s.cur === 'crown' ? ' crowns' : ' gems'), '#ffd94a'); return false; } if (s.cur === 'crown') S.crowns -= s.cost; else S.gems -= s.cost; S.skins.owned[id] = true; S.skins.active = id; }
  S.toasts.push({ txt: 'New outfit: ' + s.name, t: 0, ic: 'heart' }); sfx('built', true); starBurst(S.player.x, S.player.y - 40, 16, ['#ff9ac8', '#ffe98a'], 260); save(); return true;
}
// ---- pets ----
function rollRarity() { const tot = RARITY.reduce((s, r) => s + r.w, 0); let x = vrnd() * tot; for (let i = 0; i < RARITY.length; i++) { x -= RARITY[i].w; if (x < 0) return i; } return 0; }
function hatchEgg() {
  const c = eggCost(S.stats.hatches); if (S.gems < c) { sfx('hurt'); return null; }
  S.gems -= c; S.stats.hatches++;
  let pool = PETS.filter(p => p.rar === rollRarity()); if (!pool.length) pool = PETS;
  const def = pool[Math.floor(vrnd() * pool.length)], wasNew = petLvl(def.id) === 0;
  S.pets[def.id] = petLvl(def.id) + 1; if (!S.activePet) S.activePet = def.id;
  S.toasts.push({ txt: (wasNew ? 'NEW! ' : 'Lv' + S.pets[def.id] + ' ') + def.name, t: 0, ic: 'pet' }); shake(wasNew ? 8 : 4); sfx('pet', true); starBurst(S.player.x, S.player.y - 40, 18, [RARITY[def.rar].col, '#fff4e6'], 260);
  save(); return { def, wasNew };
}
function petAbilityReady() { return !!S.activePet && S.petCd <= 0; }
function petAbility() {
  if (!S.started || !petAbilityReady()) return false;
  const a = activePet(); S.petCd = PET_CD; let msg = 'Encore!';
  if (a.kind === 'coin') { const g = Math.ceil(150 * helmVal(Math.max(1, S.lands.length)) * coinMul()); S.pallet += g; S.stats.earned += g; msg = '+' + fmt(g); }
  else if (a.kind === 'hp') { S.player.hp = S.player.maxHp; msg = 'Full heal'; }
  else if (a.kind === 'xp') { grantXp(xpNeed(S.level) * 0.7); msg = 'XP surge'; }
  else if (a.kind === 'magnet') { for (const it of S.items) { it.vx = (S.player.x - it.x) * 3; it.vy = (S.player.y - it.y) * 3; it.t = Math.min(it.t, 0.2); } msg = 'Magnet pull'; }
  else { S.frenzyT = Math.max(S.frenzyT, 6); msg = 'Frenzy 6s'; }
  S.toasts.push({ txt: a.name + ' — ' + msg, t: 0, ic: 'pet' }); S.goldPulse = 0.6; shake(7); ringFx(S.player.x, S.player.y, 120, '#c6a8ff', 0.5); starBurst(S.player.x, S.player.y - 30, 20, ['#c6a8ff', '#ffe98a'], 280); sfx('pet', true); buzz([25, 15, 40]);
  return true;
}
function setPet(id) { if (petLvl(id) > 0) { S.activePet = id; sfx('ui_tap'); } }
// ---- ultimate: Encore Blast ----
const ultReady = () => S.ult >= ULT_NEED, ultFrac = () => Math.min(1, S.ult / ULT_NEED);
function castUlt() {
  if (!S.started || !ultReady()) return false;
  S.ult = 0; S.ultCasting = 1.4; S.stats.ults++; const p = S.player;
  ringFx(p.x, p.y, 420, '#ff9ac8', 0.7); ringFx(p.x, p.y, 280, '#ffe98a', 0.55); ringFx(p.x, p.y, 160, '#9af0b4', 0.4);
  starBurst(p.x, p.y - 30, 34, ['#ff9ac8', '#ffe98a', '#9af0b4', '#c6a8ff'], 420); shake(10); JUICE.flash = 0.5; sfx('ult', true); buzz([40, 20, 70]);
  const dmg = pDmg() * 9; let n = 0;
  for (const e of S.enemies) if (e.hp > 0 && dist2(e.x, e.y, p.x, p.y) < 520 * 520) { hurtEnemy(e, dmg, true); n++; }
  S.toasts.push({ txt: 'ENCORE BLAST! ' + n + ' hit', t: 0, ic: 'groove' });
  return true;
}
// ---- wheel + daily gifts ----
function spinWheel() {
  if (S.gems < SPIN_COST) { sfx('hurt'); return null; }
  S.gems -= SPIN_COST; S.stats.spins++;
  const tot = WHEEL.reduce((s, w) => s + w.w, 0); let x = vrnd() * tot, idx = 0;
  for (let i = 0; i < WHEEL.length; i++) { x -= WHEEL[i].w; if (x < 0) { idx = i; break; } }
  const w = WHEEL[idx], lv = Math.max(1, S.lands.length); let msg = '';
  if (w.id === 'coins') { const g = Math.ceil(120 * helmVal(lv) * coinMul()); S.wallet += g; S.stats.earned += g; msg = '+' + fmt(g) + ' coins'; }
  else if (w.id === 'gems') { S.gems += 3; S.stats.gemsFound += 3; msg = '+3 gems'; }
  else if (w.id === 'boon') { S.groove = GROOVE_NEED - 1; S.grooveT = 8; msg = 'Groove nearly full!'; }
  else if (w.id === 'gold') { S.goldRushT = Math.max(S.goldRushT, 15); msg = 'Gold Rush 15s'; }
  else if (w.id === 'egg') { S.gems += eggCost(S.stats.hatches); const r = hatchEgg(); msg = r ? 'a critter: ' + r.def.name : 'a critter!'; }
  else if (w.id === 'xp') { grantXp(xpNeed(S.level) * 0.6); msg = 'XP boost'; }
  else if (w.id === 'hp') { S.player.hp = S.player.maxHp; msg = 'Full heal'; }
  else { S.gems += 15; S.stats.gemsFound += 15; const g = Math.ceil(400 * helmVal(lv) * coinMul()); S.wallet += g; S.stats.earned += g; msg = '+15 gems +' + fmt(g); }
  S.wheel = { idx, msg, spinT: 0 }; sfx('spin', true); save();
  return S.wheel;
}
const loginReady = () => S.login.last !== dayStr();
function claimLogin() {
  if (!loginReady()) return false;
  const d = S.login.day % 7, lv = Math.max(1, S.lands.length); let msg = '';
  if (d === 0) { const g = Math.ceil(40 * helmVal(lv) * coinMul()); S.wallet += g; msg = '+' + fmt(g); }
  else if (d === 1) { S.gems += 3; msg = '+3 gems'; } else if (d === 2) { const g = Math.ceil(90 * helmVal(lv) * coinMul()); S.wallet += g; msg = '+' + fmt(g); }
  else if (d === 3) { S.groove = GROOVE_NEED - 1; S.grooveT = 10; msg = 'Groove boost'; } else if (d === 4) { S.gems += 6; msg = '+6 gems'; }
  else if (d === 5) { S.goldRushT = 20; msg = 'Gold Rush'; } else { S.gems += 12; const g = Math.ceil(220 * helmVal(lv) * coinMul()); S.wallet += g; msg = '+12 gems +' + fmt(g); }
  S.stats.logins++; S.login.day++; S.login.last = dayStr(); S.toasts.push({ txt: 'Daily gift: ' + msg, t: 0, ic: 'gift' }); sfx('win', true); starBurst(S.player.x, S.player.y - 40, 22, ['#ffe98a', '#ff9ac8', '#9af0b4'], 300); save();
  return true;
}
// ---- crown hall + prestige ----
function buyCperk(id) { const p = CPERKS.find(c => c.id === id), lv = cpk(id); if (!p || lv >= p.max || S.crowns < cperkCost(lv)) { sfx('hurt'); return false; } S.crowns -= cperkCost(lv); S.cperks[id] = lv + 1; sfx('built', true); save(); return true; }
function prestige() {
  const gain = crownsToGain(), keep = {};
  for (const k of ['crowns', 'prestiges', 'gems', 'pets', 'activePet', 'skins', 'cperks', 'stats', 'ach', 'bestiary', 'login', 'settings', 'dailies', 'quests', 'streak', 'dayKey', 'comboBest', 'bpm', 'rankIdx']) keep[k] = S[k];
  const t = S.t; S = newState(); Object.assign(S, keep); S.t = t; S.started = true;
  S.crowns += gain; S.prestiges++; addLand(); S.player.x = STAGE.x; S.player.y = STAGE.y; S.player.maxHp = pMaxHp(); S.player.hp = S.player.maxHp;
  S.toasts.push({ txt: 'ENCORE TOUR! +' + gain + ' crowns', t: 0, ic: 'crown' }); JUICE.flash = 0.9; shake(14); sfx('win', true); buzz([60, 40, 100]); starBurst(STAGE.x, STAGE.y - 40, 40, ['#ffe98a', '#ff9ac8', '#9af0b4', '#c6a8ff'], 460); save();
}
// ---- save / load ----
function serialize() {
  return {
    ver: 1, savedAt: Date.now(), wallet: S.wallet, pallet: S.pallet, gems: S.gems, crowns: S.crowns, prestiges: S.prestiges, up: S.up, upPaid: S.upPaid, gemUp: S.gemUp, gemPaid: S.gemPaid, unlockPaid: S.unlockPaid,
    lands: S.lands.map(z => ({ k: z.k, plates: z.plates.map(p => ({ id: p.id, paid: p.paid, lvl: p.lvl, built: p.built, cost: p.cost })), hordeLvl: z.hordeLvl })),
    forgePlate: S.forgePlate, forgeUpPlate: S.forgeUpPlate, forgeLvl: S.forgeLvl, forge: S.forge, waygate: S.waygate, wayPlate: S.wayPlate, houses: S.houses,
    pop: S.pop.map(f => ({ role: f.role, art: f.art, lvl: f.lvl || 0, id: f.id })), town: S.town, fanSeq: S.fanSeq, pets: S.pets, activePet: S.activePet, skins: S.skins, cperks: S.cperks, perks: S.perks, xp: S.xp, level: S.level, ult: S.ult,
    bestiary: S.bestiary, login: S.login, dailies: S.dailies, quests: S.quests, streak: S.streak, dayKey: S.dayKey, ach: S.ach, stats: S.stats, settings: S.settings, comboBest: S.comboBest, rankIdx: S.rankIdx || 0,
    player: { x: S.player.x, y: S.player.y, hp: S.player.hp, helmets: S.player.helmets, deaths: S.player.deaths },
  };
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); return true; } catch (e) { return false; } }
function applySave(d) {
  const keys = ['wallet', 'pallet', 'gems', 'crowns', 'prestiges', 'unlockPaid', 'forgeLvl', 'waygate', 'houses', 'activePet', 'xp', 'level', 'ult', 'streak', 'dayKey', 'comboBest', 'rankIdx', 'forge'];
  for (const k of keys) if (d[k] !== undefined) S[k] = d[k];
  for (const k of ['up', 'upPaid', 'gemUp', 'gemPaid', 'pets', 'skins', 'cperks', 'perks', 'bestiary', 'login', 'ach', 'stats', 'settings', 'forgePlate', 'forgeUpPlate', 'wayPlate']) if (d[k] && typeof d[k] === 'object') Object.assign(S[k], d[k]);
  if (d.dailies) S.dailies = d.dailies; if (d.quests) S.quests = d.quests;
  S.lands = [];
  for (const ls of (d.lands || [])) {
    const z = mkLandState(ls.k); z.hordeLvl = 0; S.lands.push(z);
    ls.plates.forEach((sp, i) => { const pl = z.plates[i]; if (!pl || pl.id !== sp.id) return; pl.paid = sp.paid; pl.cost = sp.cost || pl.cost; pl.lvl = sp.lvl; pl.built = sp.built; for (let n = 0; n < (pl.repeat ? pl.lvl : (pl.built ? 1 : 0)); n++) applyPlate(z, pl); });
  }
  if (!S.lands.length) addLand();
  S.town = d.town || {}; S.fanSeq = d.fanSeq || 0;
  S.pop = (d.pop || []).map(p => { const f = mkFan(p.role); f.art = p.art || f.art; f.lvl = p.lvl || 0; if (p.id !== undefined) f.id = p.id; return f; });
  S.fanSeq = Math.max(S.fanSeq, ...S.pop.map(f => f.id + 1), 0);
  if (d.player) { const p = S.player; p.hp = d.player.hp; p.deaths = d.player.deaths || 0; p.helmets = d.player.helmets || []; if (walkable(d.player.x, d.player.y, S.lands.length)) { p.x = d.player.x; p.y = d.player.y; } }
  S.player.maxHp = pMaxHp(); S.player.hp = Math.min(S.player.hp || S.player.maxHp, S.player.maxHp);
  const away = Math.min(OFFLINE_CAP, Math.max(0, (Date.now() - (d.savedAt || Date.now())) / 1000));
  if (away > 60) {
    const towers = S.lands.reduce((n, z) => n + z.towers.length, 0), rate = helmVal(S.lands.length) * (0.3 + 0.2 * towers + 0.25 * S.pop.length) * coinMul();
    const amt = Math.floor(away * rate * 0.5 * snackMul()); if (amt > 0) { S.pallet += amt; S.offlineAmt = amt; S.offlineMsg = 6; }
  }
}
function loadSave() { try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false; applySave(JSON.parse(raw)); return true; } catch (e) { return false; } }
function resetAll() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } S = newState(); addLand(); ensureQuests(); checkDay(); }
function initGame(loadExisting) {
  S = newState(); addLand();
  if (loadExisting) loadSave();
  S.player.maxHp = pMaxHp(); if (!S.player.hp) S.player.hp = S.player.maxHp;
  checkDay(); ensureQuests(); S.rankIdx = S.rankIdx || heroRankIdx();
}
