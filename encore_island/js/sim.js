'use strict';
// Encore Island — simulation core: state, derived stats, hero, foes, loot, selling, the vault.
let S;
const SAVE_KEY = 'encore_island_save_v1';
function newState() {
  const g = (k) => ({ paid: 0, cost: k });
  return {
    ver: 1, t: 0, started: false, bpm: 112,
    wallet: 0, pallet: 0, gems: 0, crowns: 0, prestiges: 0,
    up: { speed: 0, cap: 0, dmg: 0, rate: 0, hp: 0 }, upPaid: { speed: 0, cap: 0, dmg: 0, rate: 0, hp: 0 },
    gemUp: { magnet: 0, crit: 0, coin: 0 }, gemPaid: { magnet: 0, crit: 0, coin: 0 },
    lands: [], unlockPaid: 0,
    player: { x: STAGE.x, y: STAGE.y, vx: 0, vy: 0, face: 1, hp: HP0, maxHp: HP0, helmets: [], fireCd: 0, hurtT: 0, invuln: 0, dashCd: 0, dashT: 0, dashX: 0, dashY: 0, atkT: 0, moving: false, deaths: 0, sellAcc: 0, forgeAcc: 0, warpT: 0 },
    comp: { x: STAGE.x - 40, y: STAGE.y + 30, face: 1, cd: 2 },
    enemies: [], dead: [], items: [], shots: [], eshots: [], parts: [], floats: [], fx: [], fly: [], toasts: [],
    stick: null, flowKey: null, flowT: 0, flowTouched: false,
    combo: 0, comboT: 0, comboFlash: 0, comboBest: 0, groove: 0, grooveT: 0, encoreT: 0, frenzyT: 0, goldRushT: 0,
    xp: 0, level: 1, perks: {}, cards: null, pendingLevels: 0, ult: 0, ultCasting: 0,
    forge: null, forgePlate: { paid: 0, cost: Math.ceil(260), built: false }, forgeUpPlate: { paid: 0, cost: forgeUpCost(0), built: false }, forgeLvl: 0,
    waygate: false, wayPlate: { paid: 0, cost: 400, built: false },
    pop: [], houses: 0, town: {}, fanSeq: 0, prestT: 0,
    pets: {}, activePet: null, petCd: 0,
    skins: { owned: { jasmin: true }, active: 'jasmin' }, cperks: {},
    chest: null, chestCd: CHEST_CD * 0.5, bossesSeen: {}, bestiary: {},
    login: { day: 0, last: '' }, spinFree: 0, wheel: null,
    dailies: [], quests: [], streak: 0, dayKey: '', ach: {},
    stats: { kills: 0, bosses: 0, earned: 0, sold: 0, gemsFound: 0, chests: 0, quests: 0, hatches: 0, spins: 0, elites: 0, playT: 0, perfect: 0, encores: 0, ults: 0, logins: 0, crafted: 0 },
    settings: { shake: true, particles: true, dmgNums: true, haptics: true, music: true, sfx: true },
    goldPulse: 0, achCd: 0.5, spawnCount: 0, camera: { x: 0, y: 0 },
  };
}

// ---- derived stats ----
const pk = (id) => (S.perks && S.perks[id]) || 0;
const cpk = (id) => (S.cperks && S.cperks[id]) || 0;
function cperkBonus(kind) { let b = 0; for (const p of CPERKS) if (p.kind === kind) b += p.amt * cpk(p.id); return b; }
const petDef = (id) => PETS.find(p => p.id === id) || null;
const petLvl = (id) => (S.pets && S.pets[id]) || 0;
function petsOwned() { let n = 0; for (const id in S.pets) if (S.pets[id] > 0) n++; return n; }
const activePet = () => S.activePet ? petDef(S.activePet) : null;
function petBonus(kind) { const a = activePet(); if (!a) return 0; return (a.kind === kind || a.kind === 'all') ? a.amt * petLvl(a.id) : 0; }
const petCollectionMul = () => 1 + 0.02 * petsOwned();
const skinDef = (id) => SKINS.find(s => s.id === id) || SKINS[0];
const activeSkin = () => skinDef(S.skins.active);
const skinOwned = (id) => !!S.skins.owned[id];
const cap = () => CAP0 + CAP_UP * S.up.cap + 2 * pk('cap');
const encoreOn = () => S.encoreT > 0;
function pDmg() { return DMG0 * Math.pow(DMG_UP, S.up.dmg) * (1 + CROWN_DMG * S.crowns) * (1 + 0.18 * pk('dmg')) * (1 + petBonus('dmg')) * (1 + cperkBonus('dmg')) * (encoreOn() ? 1.6 : 1) * clubMul(); }
function landOfHero() { return landAt(S.player.x, S.player.y, S.lands.length); }
function pRate() {
  const z = S.lands[landOfHero() - 1];
  return RATE0 * Math.pow(RATE_UP, S.up.rate) * (z && z.drums ? DRUM_MUL : 1) / (1 + 0.10 * pk('rate')) / (1 + petBonus('rate')) / (1 + cperkBonus('rate')) / (encoreOn() ? 1.7 : 1);
}
const pickR = () => PICK_R * (1 + 0.3 * S.gemUp.magnet + 0.2 * pk('magnet') + petBonus('magnet'));
function coinMul() { return (1 + 0.25 * S.gemUp.coin) * (1 + CROWN_BONUS * S.crowns) * (1 + 0.12 * pk('coin')) * (1 + petBonus('coin')) * petCollectionMul() * (1 + cperkBonus('coin')) * (encoreOn() ? 2 : 1) * (S.goldRushT > 0 ? 3 : 1) * townTierMul(); }
const critChance = () => 0.10 * S.gemUp.crit + 0.06 * pk('crit');
const critMult = () => 3 + 0.6 * pk('critdmg');
const pMaxHp = () => Math.ceil((HP0 + HP_UP * S.up.hp + 30 * pk('hp')) * (1 + CROWN_HP * S.crowns * 0) * (1 + petBonus('hp')) * (1 + cperkBonus('hp')));
const speedNow = () => SPEED0 * (1 + SPEED_UP * S.up.speed) * (1 + 0.09 * pk('speed')) * (1 + petBonus('speed')) * (1 + cperkBonus('speed'));
const dashCdMax = () => dashCdMaxFor(S.crowns, pk('nimble'));
const fighterDmg = () => DMG0 * Math.pow(DMG_UP, S.up.dmg) * (1 + CROWN_DMG * S.crowns) * 0.5;
const popCap = () => BEDS_BASE + BEDS_PER_LAND * Math.max(0, S.lands.length - 1) + BEDS_PER_HOUSE * S.houses;
const recruitCost = () => recruitCostN(S.pop.length);
const towerMul = (z) => 1 + TOWER_TRAIN * z.towerLvl;
const maxAlive = (z) => 9 + 3 * z.hordeLvl;
const spawnInt = (z) => 2.4 * Math.pow(0.82, z.hordeLvl);
const forgeQ = () => FORGE_Q + 2 * S.forgeLvl, trayMax = () => TRAY_MAX + 2 * S.forgeLvl, forgeSpeed = () => 1 + 0.25 * S.forgeLvl;
function heroRankIdx() { const r = renown(); let i = 0; for (let k = 0; k < RANKS.length; k++) if (r >= RANKS[k].at) i = k; return i; }
const heroRank = () => RANKS[heroRankIdx()];
const nextRank = () => RANKS[heroRankIdx() + 1] || null;
const renown = () => Math.floor(S.stats.kills + S.stats.bosses * 50 + S.crowns * 500 + S.lands.length * 80 + S.stats.elites * 30 + S.stats.spins * 5);
const crownsToGain = () => Math.max(1, S.lands.length - (PRESTIGE_MIN - 1)) + cperkBonus('crown');
const comboMul = () => { for (const t of COMBO_TIERS) if (S.combo >= t[0]) return t[1]; return 1; };
const comboColor = () => { for (const t of COMBO_TIERS) if (S.combo >= t[0]) return t[2]; return '#e6dcff'; };
const comboWindow = () => COMBO_WINDOW + 0.4 * pk('combow');
function touchFlow(key, dt) { if (S.flowKey === key) S.flowT += dt; else { S.flowKey = key; S.flowT = 0; } S.flowTouched = true; }
const flowMul = () => Math.min(FLOW_CAP, Math.pow(FLOW_ACCEL, S.flowT || 0));

// ---- stack entries ----
const entryRes = (e) => e.crown ? 'crown' : e.bar ? 'bar' : 'helm';
function entryVal(e) { const r = entryRes(e); return Math.ceil(helmVal(e.k) * (r === 'crown' ? CROWN_MUL : r === 'bar' ? BAR_MUL : 1) * coinMul()); }
const cloneEntry = (e) => ({ k: e.k, bar: !!e.bar, crown: !!e.crown });

// ---- lands ----
function mkLandState(k) {
  const g = genLand(k), plates = landPlateDefs(k, g);
  return { k, g, plates, towers: [], drums: false, altar: null, towerLvl: 0, hordeLvl: 0, spawnCd: 1.2, born: 0, pad: landPadSpot(g) };
}
function addLand() { const z = mkLandState(S.lands.length + 1); z.born = S.t; S.lands.push(z); S.unlockPaid = 0; return z; }
const nextUnlockCost = () => unlockCost(S.lands.length + 1);

// ---- spawning + combat ----
function spawnEnemy(z, opts) {
  opts = opts || {};
  const boss = !!opts.boss, gold = !boss && rnd() < GOLD_CHANCE + 0.015 * pk('luck');
  const arch = foeArch(z.k);
  const archHp = arch === 'tank' ? 1.8 : arch === 'fast' ? 0.7 : arch === 'spitter' ? 0.85 : 1;
  const bossHpMul = arch === 'tank' ? 1.5 : arch === 'fast' ? 0.7 : arch === 'spitter' ? 0.9 : 1.1;
  const hp = Math.ceil(foeHp(z.k) * (boss ? 22 * bossHpMul : gold ? 2 : 1) * (boss ? 1 : archHp));
  const bossSpd = arch === 'fast' ? 50 : arch === 'tank' ? 30 : 40, g = z.g;
  const a = rnd() * TAU, d = Math.sqrt(rnd()) * g.r * 0.18;
  const w = wanderPoint(z);
  S.enemies.push({
    k: z.k, arch, x: g.den.x + Math.cos(a) * d, y: g.den.y + Math.sin(a) * d, hp, max: hp,
    spd: (boss ? bossSpd : 42) * (0.92 + rnd() * 0.16), dmg: foeDmg(z.k) * (boss ? (arch === 'tank' ? 4.5 : 3.2) : arch === 'tank' ? 1.3 : 1),
    tx: w.x, ty: w.y, wanderT: 1 + rnd() * 2, atkCd: 0, hurt: 0, sway: rnd() * 6.28, born: 0, face: 1, vx: 0, vy: 0,
    r: (boss ? 34 : (15 + Math.min(9, z.k))) + (arch === 'tank' ? 4 : 0), boss, gold,
  });
  if (boss) { float(g.den.x, g.den.y - 70, BOSS_NAMES[foeAct(z.k)].toUpperCase() + ' APPEARS!', '#ff6a5a', true); sfx('boss', true); shake(12); JUICE.flash = 0.35; }
}
function wanderPoint(z) { const g = z.g, a = rnd() * TAU, r = (0.25 + rnd() * 0.5) * radiusAt(g, a); return { x: g.x + Math.cos(a) * r, y: g.y + Math.sin(a) * r }; }
function promoteElite() {
  const pool = S.enemies.filter(e => !e.boss && !e.gold && !e.elite && e.hp > 0);
  if (!pool.length) return false;
  const e = pool[Math.floor(vrnd() * pool.length)];
  e.elite = true; e.max = Math.ceil(e.max * 4) + 1; e.hp = e.max; e.r += 6; e.dmg *= 1.5; e.spd *= 0.9;
  S.toasts.push({ txt: 'A Champion rises!', t: 0, ic: 'elite' }); float(e.x, e.y - 60, 'CHAMPION', '#ffd94a', true); shake(8); sfx('boss', true); buzz(30);
  return true;
}
function dropItem(x, y, spec, vis) { // vis: use the visual stream (drops from elites/fans must not perturb the spawn stream)
  const r = vis ? vrnd : rnd;
  S.items.push(Object.assign({ x: x + (r() - 0.5) * 46, y: y + (r() - 0.5) * 36, t: 0, vy: -60 - r() * 60, vx: (r() - 0.5) * 80, z0: 0 }, spec));
}
const dropHelmet = (x, y, k) => dropItem(x, y, { k });
function hurtEnemy(e, dmg, crit) {
  if (e.hp <= 0) return;
  e.hp -= dmg; e.hurt = 0.12;
  if (e.hp > 0) starBurst(e.x, e.y - e.r * 0.6, crit ? 4 : 1, ['#fff4e6', '#ffd84d'], 120);
  if (S.settings.dmgNums) float(e.x, e.y - e.r - 12, Math.ceil(dmg), crit ? '#ff8a3c' : '#fff', crit, crit);
  if (e.hp > 0) { sfx(crit ? 'crit' : 'hit'); return; }
  killEnemy(e);
}
function killEnemy(e) {
  const perfect = onBeatNow();
  S.stats.kills++;
  if (!S.ultCasting) S.ult = Math.min(ULT_NEED, S.ult + 1);
  recordKill(e); questEvent('kill', 1); registerCombo(e);
  grantXp(e.boss ? 50 : e.elite ? 20 : e.gold ? 6 : 3 + Math.floor(e.k / 2));
  if (perfect) groovePerfect(e);
  const p = S.player;
  if (pk('vamp') > 0) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.02 * pk('vamp'));
  S.dead.push({ x: e.x, y: e.y, k: e.k, boss: e.boss, gold: e.gold, r: e.r, t: 0, face: e.face || 1 });
  if (e.boss) {
    S.stats.bosses++; questEvent('boss', 1); JUICE.hitStop = 0.14;
    dropItem(e.x, e.y, { k: e.k, crown: true }); dropItem(e.x, e.y, { gem: true }); dropItem(e.x, e.y, { gem: true });
    for (let i = 0; i < 6; i++) dropHelmet(e.x, e.y, e.k);
    float(e.x, e.y - 60, 'CROWN!', '#ffd94a', true); shake(14); sfx('boom', true); buzz([50, 30, 80]); JUICE.flash = 0.5;
  } else if (e.gold) {
    dropItem(e.x, e.y, { gem: true }); dropHelmet(e.x, e.y, e.k); dropHelmet(e.x, e.y, e.k); float(e.x, e.y - 50, 'GOLDEN!', '#ffe98a', true); sfx('gem', true);
  } else if (e.elite) {
    S.stats.elites++; dropItem(e.x, e.y, { gem: true }, true); dropItem(e.x, e.y, { gem: true }, true);
    for (let i = 0; i < 4; i++) dropItem(e.x, e.y, { k: e.k }, true);
    const gg = Math.ceil(40 * helmVal(e.k) * coinMul()); S.pallet += gg; S.stats.earned += gg;
    float(e.x, e.y - 64, 'CHAMPION +' + fmt(gg), '#ffd94a', true); shake(10); sfx('unlock', true); buzz([30, 20, 50]);
  } else {
    const drops = 1 + (rnd() < 0.55 ? 1 : 0);
    for (let i = 0; i < drops; i++) dropHelmet(e.x, e.y, e.k);
  }
  puff(e.x, e.y, e.gold ? '#ffd94a' : foeCol(e.k), e.boss ? 26 : 10, true);
  ringFx(e.x, e.y - e.r * 0.5, e.boss ? 150 : e.elite ? 80 : 52, e.gold ? '#ffe98a' : '#fff4e6', e.boss ? 0.5 : 0.32);
  starBurst(e.x, e.y - e.r * 0.5, e.boss ? 16 : e.gold ? 9 : 5, e.gold ? ['#ffe98a', '#fff4c0'] : ['#ff9ac8', '#fff4e6', foeCol(e.k)], e.boss ? 320 : 200);
  sfx('kill');
  // every 25th spawn-kill promotes a champion elsewhere on the island
  if (!e.boss && S.stats.kills % 25 === 0) promoteElite();
}
function registerCombo(e) {
  S.combo++; S.comboT = comboWindow(); if (S.combo > S.comboBest) S.comboBest = S.combo;
  const mul = comboMul();
  if (mul > 1) { const bonus = Math.ceil(helmVal(e.k) * (mul - 1) * coinMul()); if (bonus > 0) { S.pallet += bonus; S.stats.earned += bonus; float(e.x, e.y - 30, '+' + fmt(bonus), comboColor()); questEvent('earn', bonus); } }
  if (S.combo > 1 && S.combo % 5 === 0) { S.comboFlash = 0.5; sfx('combo', false, 1 + Math.min(1, S.combo / 80)); }
  const R = COMBO_REWARDS.find(r => r.at === S.combo);
  if (R) { S.toasts.push({ txt: R.label, t: 0, ic: 'groove' }); R.fx(); starBurst(S.player.x, S.player.y - 40, 22, ['#ffd94a', '#ff9ac8', '#9af0b4'], 300); shake(7); JUICE.flash = 0.3; sfx('levelup', true); }
}
function comboCoins(m) { const g = Math.ceil(60 * m * helmVal(Math.max(1, S.lands.length)) * coinMul()); S.pallet += g; S.stats.earned += g; }
const COMBO_REWARDS = [
  { at: 25, label: 'SPREE', fx: () => { S.frenzyT = Math.max(S.frenzyT, 4); comboCoins(0.6); } },
  { at: 50, label: 'RAMPAGE', fx: () => { S.goldRushT = Math.max(S.goldRushT, 6); comboCoins(1.2); } },
  { at: 100, label: 'UNSTOPPABLE', fx: () => { S.frenzyT = Math.max(S.frenzyT, 8); S.gems += 2; S.stats.gemsFound += 2; comboCoins(2.5); } },
  { at: 200, label: 'GODLIKE', fx: () => { S.goldRushT = Math.max(S.goldRushT, 10); S.gems += 5; S.stats.gemsFound += 5; comboCoins(5); } },
];
// ---- the groove: kills on the beat fill the meter; a full meter starts ENCORE ----
function beatNow() { return (typeof AUDIO !== 'undefined' && AUDIO.state && AUDIO.state().playing && AUDIO.beat) ? AUDIO.beat() : S.t * S.bpm / 60; }
function onBeatNow() { const b = beatNow() * 2, f = Math.abs(b - Math.round(b)); return f * 30 / S.bpm <= BEAT_TOL + 0.015 * pk('groove'); }
function groovePerfect(e) {
  S.stats.perfect++;
  if (encoreOn()) return;
  S.groove++; S.grooveT = 4;
  float(e.x, e.y - e.r - 28, 'PERFECT', '#ff9ac8', false);
  if (S.groove >= GROOVE_NEED) startEncore();
}
function startEncore() {
  S.groove = 0; S.encoreT = ENCORE_TIME; S.player.cheerT = 0.9; S.stats.encores++; questEvent('encore', 1);
  S.toasts.push({ txt: 'ENCORE!  double damage + coins', t: 0, ic: 'groove' });
  JUICE.flash = 0.7; ringFx(S.player.x, S.player.y - 10, 160, '#ff9ac8', 0.6); ringFx(S.player.x, S.player.y - 10, 100, '#ffe98a', 0.45);
  starBurst(S.player.x, S.player.y - 30, 26, ['#ff9ac8', '#ffe98a', '#9af0b4', '#c6a8ff'], 340); shake(8); sfx('encore', true); buzz([30, 20, 60]);
  if (typeof AUDIO !== 'undefined' && AUDIO.setEncore) AUDIO.setEncore(true);
}

// ---- hero ----
function hurtPlayer(d, src) {
  const p = S.player;
  if (p.invuln > 0) return;
  if (src && pk('thorns') > 0 && src.hp > 0) hurtEnemy(src, p.maxHp * 0.06 * pk('thorns'));
  p.hp -= d; p.hurtT = 0.18; p.invuln = 0.5; shake(5); sfx('hurt', true); buzz(30);
  S.combo = Math.floor(S.combo * 0.5);
  if (p.hp <= 0) playerDie();
}
function playerDie() {
  const p = S.player; p.deaths++;
  for (const e of p.helmets) dropItem(p.x, p.y, cloneEntry(e), true);
  p.helmets = []; p.hp = p.maxHp; p.invuln = 2.5; p.x = STAGE.x; p.y = STAGE.y; p.vx = p.vy = 0;
  float(STAGE.x, STAGE.y - 80, 'YOU DROPPED EVERYTHING!', '#ff6a5a', true); shake(14); sfx('die', true); buzz([60, 40, 60]); S.combo = 0;
}
function grantXp(n) {
  if (!S.started) return;
  S.xp += n * (1 + 0.15 * pk('scholar')) * (1 + petBonus('xp')) * (1 + cperkBonus('xp'));
  while (S.xp >= xpNeed(S.level)) {
    S.xp -= xpNeed(S.level); S.level++;
    if (S.cards) S.pendingLevels++; else drawCards();
    S.goldPulse = Math.max(S.goldPulse, 0.5); S.player.cheerT = 0.9; sfx('levelup', true); buzz([20, 20, 40]);
    JUICE.flash = 0.6; ringFx(S.player.x, S.player.y - 10, 130, '#ffe98a', 0.6); ringFx(S.player.x, S.player.y - 10, 80, '#ff9ac8', 0.45);
    starBurst(S.player.x, S.player.y - 24, 18, ['#ffe98a', '#ff9ac8', '#9af0b4'], 300);
  }
}
function drawCards() {
  const avail = CARDS.filter(c => pk(c.id) < c.max), pool = avail.length ? avail : CARDS, pick = [];
  let g2 = 0;
  while (pick.length < 3 && g2++ < 80) { const c = pool[Math.floor(rnd() * pool.length)]; if (!pick.includes(c)) pick.push(c); if (pick.length >= pool.length) break; }
  S.cards = pick;
}
function pickCard(i) {
  if (!S.cards || !S.cards[i]) return false;
  const c = S.cards[i]; S.perks[c.id] = pk(c.id) + 1;
  if (c.id === 'hp') { S.player.maxHp = pMaxHp(); S.player.hp = Math.min(S.player.maxHp, S.player.hp + 30); }
  S.cards = null; sfx('built', true); starBurst(S.player.x, S.player.y - 30, 12, ['#ffe98a', '#c6a8ff'], 220);
  if (S.pendingLevels > 0) { S.pendingLevels--; drawCards(); }
  return true;
}
function recordKill(e) { const f = foeFam(e.k), b = S.bestiary[f] || (S.bestiary[f] = { k: 0, b: 0 }); b.k++; if (e.boss) b.b++; }
const bestiarySeen = () => { let n = 0; for (let f = 0; f < 8; f++) if (S.bestiary[f] && S.bestiary[f].k > 0) n++; return n; };
