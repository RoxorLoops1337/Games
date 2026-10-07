'use strict';
// Encore Island — balance dials and content tables. Numbers are the proven Kingshot Endless economy, re-tuned for the island.
const HV = { line: '#2d170f', cream: '#fff4e6', pink: '#ff7eb6', pinkD: '#c93f78', green: '#3fcf6a', greenD: '#1f7a3a', violet: '#a77bff', gold: '#ffd84d', orange: '#ff9a2e', teal: '#2ec4b6', indigo: '#2a1d5a' };

// ---- hero + economy ----
const PICK_R = 78, CAP0 = 8, CAP_UP = 4;
const SPEED0 = 195, SPEED_UP = 0.12, DMG0 = 6, DMG_UP = 1.45, RATE0 = 0.55, RATE_UP = 0.90;
const FIRE_RANGE = 270, SELL_RATE = 7, VAC_RATE = 55, BUILD_RATE = 60, FLOW_ACCEL = 2.6, FLOW_CAP = 1e6;
const ECO = 2.35, HP_T = 2.15, UNLOCK0 = 180, UNLOCK_MUL = 3.2, OFFLINE_CAP = 4 * 3600;
const TOWER_RANGE = 340, TOWER_RATE = 1.05, TOWER_TRAIN = 0.35, WIZ_RATE = 2.0, WIZ_CHAIN = 3, WIZ_JUMP = 160, CAT_RATE = 4.2, CAT_AOE = 115, DRUM_MUL = 0.75;
const HP0 = 60, HP_UP = 45, GOLD_CHANCE = 0.045, BOSS_CD = 45, PRESTIGE_MIN = 5, CROWN_BONUS = 0.20, CROWN_DMG = 0.30, CROWN_HP = 0.25;
const DASH_SPD = 780, DASH_TIME = 0.16, DASH_CD = 3.6, DASH_CD_CROWN = 0.35, DASH_CD_MIN = 1.2;
const FORGE_T = 1.8, FORGE_Q = 12, TRAY_MAX = 10, BAR_MUL = 3, CROWN_MUL = 22, FORGE_UP0 = 4000, FORGE_UP_MUL = 2.7, FORGE_LVL_MAX = 10;
const INHAB0 = 1500, INHAB_MUL = 1.5, INHAB_SPD = 130, FIGHTER_RATE = 1.05, FIGHTER_RANGE = 260, PORTER_CAP = 6;
const BEDS_BASE = 4, BEDS_PER_LAND = 2, BEDS_PER_HOUSE = 4, HOUSE_MAX = 8, HOUSE0 = 2500, HOUSE_MUL = 2.6;
const COMBO_WINDOW = 2.6, CHEST_CD = 160, WARP_T = 0.55, PREST_T = 3;
const COMBO_TIERS = [[80, 4, '#ff3a6b'], [40, 3, '#ff6a3a'], [20, 2, '#ff9a3a'], [10, 1.5, '#ffd94a'], [5, 1.25, '#e8e08a']];
const ULT_NEED = 40;
// the groove: kills landed on the beat fill the meter; a full meter starts ENCORE (double damage + coins)
const GROOVE_NEED = 12, ENCORE_TIME = 9, BEAT_TOL = 0.085;

function eco(k) { return Math.pow(ECO, k - 1); }
function bcost(k) { return Math.pow(ECO, k - 1) * Math.pow(1.3, k - 1); }
function helmVal(k) { return Math.ceil(5 * eco(k)); }
function foeHp(k) { return Math.ceil(13 * Math.pow(HP_T, k - 1)); }
function foeDmg(k) { return Math.ceil(4 * Math.pow(1.55, k - 1)); }
function towerDmg(k) { return Math.ceil(9 * Math.pow(HP_T, k - 1)); }
function unlockCost(k) { return Math.min(1e300, Math.ceil(UNLOCK0 * Math.pow(UNLOCK_MUL, k - 1) * Math.pow(1.12, (k - 1) * (k - 2) / 2))); }
function xpNeed(l) { return Math.ceil(18 * Math.pow(1.28, l - 1)); }
function houseCost(n) { return Math.ceil(HOUSE0 * Math.pow(HOUSE_MUL, n)); }
function recruitCostN(n) { return Math.ceil(INHAB0 * Math.pow(INHAB_MUL, n)); }
function forgeUpCost(l) { return Math.ceil(FORGE_UP0 * Math.pow(FORGE_UP_MUL, l)); }
function eggCost(h) { return 6 + h * 3; }
function gemUpCost(key, lvl) { return 2 + lvl * (key === 'magnet' ? 2 : 3); }
function upgCost(key, lvl) { return Math.ceil(UPG[key].base * Math.pow(UPG[key].grow, lvl)); }
function cperkCost(lvl) { return 1 + lvl; }
function dashCdMaxFor(crowns, nimble) { return Math.max(DASH_CD_MIN, DASH_CD - DASH_CD_CROWN * crowns - 0.3 * nimble); }

const UPG = {
  speed: { name: 'Speed', icon: 'speed', base: 35, grow: 1.9 }, cap: { name: 'Backpack', icon: 'cap', base: 30, grow: 1.9 },
  dmg: { name: 'Power', icon: 'dmg', base: 45, grow: 2.05 }, rate: { name: 'Tempo', icon: 'rate', base: 55, grow: 2.05 }, hp: { name: 'Vitality', icon: 'hp', base: 60, grow: 2.05 },
};
const GEMU = { magnet: { name: 'Magnet', what: '+30% pickup range' }, crit: { name: 'Crit', what: '+10% chance, 3x dmg' }, coin: { name: 'Midas', what: '+25% coin value' } };

// ---- metals: helmet/bar tier = (k-1) % 8 ----
const METALS = [
  { name: 'copper', col: '#c87838' }, { name: 'bronze', col: '#b5804a' }, { name: 'silver', col: '#c8ccd4' }, { name: 'gold', col: '#e8b93a' },
  { name: 'platinum', col: '#d6e2ea' }, { name: 'mythril', col: '#6ee0d8' }, { name: 'cobalt', col: '#5a7fe0' }, { name: 'uranium', col: '#a6e04a', glow: true },
];
function metal(k) { const cyc = Math.floor((k - 1) / 8), m = METALS[(k - 1) % 8]; return { name: m.name + (cyc ? ' ' + ('II III IV V VI VII VIII IX X'.split(' ')[cyc - 1] || cyc) : ''), col: m.col, glow: !!m.glow }; }

// ---- the Soundlands: eight biomes, eight creature families, three acts ----
const BIOMES = [
  { name: 'Blossom Bay', g: ['#a4e59c', '#97dd95'], deep: '#5fb67a', cliff: '#8a6ac0', tuft: '#6cc26e', flowers: ['#fff4e6', '#ff9ac8', '#ffe98a'], tree: ['#ff9cc6', '#ffc2dc'], prop: 'round', shore: '#bff4ee' },
  { name: 'Mint Meadow', g: ['#90e8c6', '#84dfbc'], deep: '#4fb894', cliff: '#6a9ac8', tuft: '#5bbf9a', flowers: ['#fff4e6', '#c6a8ff', '#a8f0e0'], tree: ['#7fe8d0', '#aaf5e4'], prop: 'round', shore: '#d4fff4' },
  { name: 'Sunset Dunes', g: ['#f8dc9e', '#f2d090'], deep: '#d8a860', cliff: '#c8785a', tuft: '#e0b068', flowers: ['#fff4e6', '#ff9a2e', '#ff7eb6'], tree: ['#ff9a4a', '#ffc58a'], prop: 'round', shore: '#fff0c8' },
  { name: 'Frost Fjord', g: ['#d8eefa', '#cae6f6'], deep: '#9ac8e4', cliff: '#7a9ad8', tuft: '#a6cfe6', flowers: ['#ffffff', '#c6a8ff', '#aee0ff'], tree: ['#eaf6ff', '#b8d8f0'], prop: 'pine', shore: '#ffffff' },
  { name: 'Candy Canyon', g: ['#dcc8f8', '#d0baf2'], deep: '#a888d8', cliff: '#a85a98', tuft: '#b898e0', flowers: ['#fff4e6', '#ff7eb6', '#ffe98a'], tree: ['#ff7eb6', '#ffb0d4'], prop: 'mush', shore: '#fbe4ff' },
  { name: 'Lime Lagoon', g: ['#d8f294', '#cce886'], deep: '#9ac84a', cliff: '#6a9a5a', tuft: '#8fc23a', flowers: ['#fff4e6', '#ffe98a', '#ff9ac8'], tree: ['#8fdc4a', '#b8f07a'], prop: 'round', shore: '#f4ffd0' },
  { name: 'Neon Night', g: ['#7a8ee8', '#6a7fdc'], deep: '#4a5cc0', cliff: '#3a3a9a', tuft: '#8fa4ff', flowers: ['#6ee0d8', '#ff7eb6', '#fff4a0'], tree: ['#6ee0d8', '#a8fff4'], prop: 'round', shore: '#a8f4ff' },
  { name: 'Gold Gala', g: ['#ffe48e', '#ffda78'], deep: '#e0b040', cliff: '#c88a30', tuft: '#e8b838', flowers: ['#fff4e6', '#ff7eb6', '#ffffff'], tree: ['#ffb640', '#ffd98a'], prop: 'round', shore: '#fff6c8' },
];
const FOE_ACT_NAMES = [
  ['Fussy Foghorn', 'Jitterbug', 'Runaway Melon', 'Pitch-Perfect Gull', 'Jingle Machine', 'Hot Chilli', 'One-Hit Jukebox', 'Squeezebox'],
  ['Flamebait', 'Clickbait Goblin', 'Unskippable Ad', 'Filter Fairy', 'Hug Emoji', 'Notification Imp', 'Phone Charger', 'Algo Rhythm'],
  ['Tuner Drone', 'Synchro Dancer', 'VIP Bouncer', 'Chrome Siren', 'Clapperboard Knight', 'Glitch Gremlin', 'Ring Light Sentinel', 'Airbrush Wraith'],
];
const FOE_ART = [
  ['kappa', 'oni_cub', 'bamboo_boar', 'crow_tengu', 'mushroom_folk', 'hitodama', 'oni_brute', 'karakasa'],
  ['chochin', 'karakuri_puppet', 'drowned_samurai', 'nopperabo', 'koi_spirit', 'tsukumogami', 'ittan_momen', 'silk_weaver'],
  ['storm_drone', 'blank_soldier', 'komainu_guardian', 'void_scribe', 'redaction_knight', 'margin_imp', 'thunder_crow', 'eraser_wraith'],
];
const BOSS_ART = ['boss_kuzunoha', 'boss_jorogumo', 'boss_editor'];
const BOSS_NAMES = ['Kraki', 'Scrollspinner', 'Flawless'];
const FOE_COLS = ['#ff6a5a', '#ffb640', '#a77bff', '#2ec4b6', '#8fdc4a', '#ff7eb6', '#5fb4ff', '#8a86a8'];
const FOE_ARCH = ['melee', 'fast', 'tank', 'spitter', 'tank', 'fast', 'tank', 'spitter'];
const ARCH_DESC = { melee: 'Melee bruiser', fast: 'Fast runner', tank: 'Armored tank', spitter: 'Ranged spitter' };
function foeAct(k) { return Math.floor((k - 1) / 8) % 3; }
function foeFam(k) { return (k - 1) % 8; }
function foeArch(k) { return FOE_ARCH[foeFam(k)]; }
function foeArtName(k, boss) { return boss ? BOSS_ART[foeAct(k)] : FOE_ART[foeAct(k)][foeFam(k)]; }
function foeName(k) { const act = Math.floor((k - 1) / 8), cyc = Math.floor(act / 3); return FOE_ACT_NAMES[act % 3][foeFam(k)] + (cyc ? ' ' + ('II III IV V VI VII VIII IX X'.split(' ')[cyc - 1] || cyc) : ''); }
function foeCol(k) { return FOE_COLS[foeFam(k)]; }
function biomeOf(k) { return BIOMES[(k - 1) % 8]; }

// ---- cast ----
const SKINS = [
  { id: 'jasmin', name: 'Jasmin', art: 'jasmin', comp: 'roxor', cost: 0 },
  { id: 'roxor', name: 'RoxorLoops', art: 'roxor', comp: 'jasmin', cost: 3, cur: 'crown' },
  { id: 'rawclaw', name: 'RawClaw', art: 'rawclaw', comp: 'jasmin', cost: 3, cur: 'crown' },
  { id: 'andy', name: 'Andy', art: 'andy', comp: 'roxor', cost: 6, cur: 'crown' },
  { id: 'unicorn', name: 'Unicorn Jasmin', art: 'jasmin_unicorn', comp: 'roxor_monster', cost: 40, cur: 'gem' },
  { id: 'monster', name: 'Monster Roxor', art: 'roxor_monster', comp: 'jasmin_unicorn', cost: 40, cur: 'gem' },
  { id: 'goat', name: 'Goat RawClaw', art: 'rawclaw_goat', comp: 'jasmin', cost: 80, cur: 'gem' },
  { id: 'legend', name: 'Legend Spotlight', art: 'andy', comp: 'jasmin', cost: 0, rank: 8, glow: true },
];
const RANKS = [
  { name: 'Busker', at: 0 }, { name: 'Open-Mic Hero', at: 60 }, { name: 'Opening Act', at: 220 }, { name: 'Crowd Pleaser', at: 600 },
  { name: 'Local Celebrity', at: 1500 }, { name: 'Tour Headliner', at: 3600 }, { name: 'Chart Topper', at: 8000 }, { name: 'Platinum Star', at: 18000 },
  { name: 'Legend', at: 40000 }, { name: 'Hall of Fame', at: 90000 }, { name: 'Soundlands Icon', at: 220000 },
];

// ---- level-up draft ----
const CARDS = [
  { id: 'dmg', icon: 'dmg', name: 'Louder Notes', d: '+18% damage', max: 99 }, { id: 'rate', icon: 'rate', name: 'Quick Tempo', d: '+10% fire rate', max: 99 },
  { id: 'multi', icon: 'multi', name: 'Harmony', d: '+1 note per volley', max: 8 }, { id: 'crit', icon: 'crit', name: 'Perfect Pitch', d: '+6% crit chance', max: 12 },
  { id: 'critdmg', icon: 'critdmg', name: 'Fortissimo', d: '+60% crit damage', max: 12 }, { id: 'range', icon: 'range', name: 'Long Reach', d: '+12% range', max: 10 },
  { id: 'velocity', icon: 'velocity', name: 'Swift Notes', d: '+18% note speed', max: 10 }, { id: 'speed', icon: 'speed', name: 'Fleet Foot', d: '+9% move speed', max: 12 },
  { id: 'hp', icon: 'hp', name: 'Toughness', d: '+30 max HP', max: 99 }, { id: 'regen', icon: 'regen', name: 'Second Wind', d: '+3 HP/s regen', max: 20 },
  { id: 'vamp', icon: 'vamp', name: 'Sweet Sound', d: 'Heal 2% max HP per kill', max: 10 }, { id: 'nimble', icon: 'nimble', name: 'Nimble', d: '−0.3s dash cooldown', max: 8 },
  { id: 'magnet', icon: 'magnet', name: 'Magnetism', d: '+20% pickup range', max: 10 }, { id: 'coin', icon: 'coin', name: 'Greed', d: '+12% coin value', max: 20 },
  { id: 'combow', icon: 'combow', name: 'Momentum', d: '+0.4s combo window', max: 8 }, { id: 'scholar', icon: 'scholar', name: 'Fast Learner', d: '+15% XP gained', max: 12 },
  { id: 'thorns', icon: 'thorns', name: 'Feedback', d: 'Reflect damage when hit', max: 8 }, { id: 'luck', icon: 'luck', name: 'Fortune', d: '+1.5% golden-foe chance', max: 6 },
  { id: 'cap', icon: 'cap', name: 'Deep Pockets', d: '+2 backpack slots', max: 20 }, { id: 'groove', icon: 'groove', name: 'Good Ear', d: 'Wider on-beat window', max: 6 },
];
const CPERKS = [
  { id: 'wealth', name: 'Royal Treasury', kind: 'coin', amt: 0.08, max: 12, desc: '+8% coin value' }, { id: 'might', name: 'Stage Presence', kind: 'dmg', amt: 0.08, max: 12, desc: '+8% damage' },
  { id: 'haste', name: 'Rapid Tempo', kind: 'rate', amt: 0.05, max: 12, desc: '+5% fire rate' }, { id: 'vigor', name: 'Iron Lungs', kind: 'hp', amt: 0.10, max: 12, desc: '+10% max HP' },
  { id: 'swift', name: 'Roadie Boots', kind: 'speed', amt: 0.05, max: 8, desc: '+5% move speed' }, { id: 'scholar', name: 'Music School', kind: 'xp', amt: 0.10, max: 10, desc: '+10% XP gain' },
  { id: 'legacy', name: 'Enduring Fame', kind: 'crown', amt: 1, max: 6, desc: '+1 crown per Encore Tour' },
];
const RARITY = [{ name: 'Common', col: '#e6dcff', w: 60 }, { name: 'Rare', col: '#5aa9e0', w: 27 }, { name: 'Epic', col: '#b06ee0', w: 10 }, { name: 'Legendary', col: '#ffb347', w: 3 }];
// pets are tamed Soundlands critters (their baked sprites double as portraits)
const PETS = [
  { id: 'jitter', art: 'oni_cub', name: 'Jitterbug', rar: 0, kind: 'coin', amt: 0.06, desc: '+6% coin value / lvl' },
  { id: 'chilli', art: 'hitodama', name: 'Hot Chilli', rar: 0, kind: 'rate', amt: 0.05, desc: '+5% fire rate / lvl' },
  { id: 'hug', art: 'koi_spirit', name: 'Hug Emoji', rar: 0, kind: 'magnet', amt: 0.10, desc: '+10% pickup range / lvl' },
  { id: 'notif', art: 'tsukumogami', name: 'Notification Imp', rar: 0, kind: 'speed', amt: 0.06, desc: '+6% move speed / lvl' },
  { id: 'lantern', art: 'chochin', name: 'Flamebait', rar: 0, kind: 'coin', amt: 0.08, desc: '+8% coin value / lvl' },
  { id: 'gull', art: 'crow_tengu', name: 'Pitch-Perfect Gull', rar: 1, kind: 'dmg', amt: 0.10, desc: '+10% damage / lvl' },
  { id: 'jingle', art: 'mushroom_folk', name: 'Jingle Machine', rar: 1, kind: 'xp', amt: 0.15, desc: '+15% XP gain / lvl' },
  { id: 'filter', art: 'nopperabo', name: 'Filter Fairy', rar: 1, kind: 'hp', amt: 0.08, desc: '+8% max HP / lvl' },
  { id: 'squeeze', art: 'karakasa', name: 'Squeezebox', rar: 2, kind: 'dmg', amt: 0.18, desc: '+18% damage / lvl' },
  { id: 'algo', art: 'silk_weaver', name: 'Algo Rhythm', rar: 2, kind: 'coin', amt: 0.16, desc: '+16% coin value / lvl' },
  { id: 'sync', art: 'blank_soldier', name: 'Synchro Dancer', rar: 3, kind: 'dmg', amt: 0.30, desc: '+30% damage / lvl' },
  { id: 'siren', art: 'void_scribe', name: 'Chrome Siren', rar: 3, kind: 'all', amt: 0.10, desc: '+10% to everything / lvl' },
];
const PET_CD = 22;
const WHEEL = [
  { id: 'coins', label: 'Coins', col: '#ffd94a', w: 22 }, { id: 'gems', label: '3 Gems', col: '#6ee0d8', w: 18 }, { id: 'boon', label: 'Encore', col: '#c98aff', w: 14 },
  { id: 'gold', label: 'Gold Rush', col: '#f0a63c', w: 12 }, { id: 'egg', label: 'Pet Egg', col: '#6ecb5a', w: 10 }, { id: 'xp', label: 'XP Boost', col: '#ff9a4a', w: 8 },
  { id: 'hp', label: 'Full Heal', col: '#5aa9e0', w: 10 }, { id: 'jack', label: 'JACKPOT', col: '#ff5a8a', w: 6 },
];
const SPIN_COST = 4;
const DAILY = [{ n: 'Coin Purse', ic: 'coin' }, { n: 'Gem Pouch', ic: 'gem' }, { n: 'Coin Chest', ic: 'coin' }, { n: 'Encore Token', ic: 'groove' }, { n: 'Gem Sack', ic: 'gem' }, { n: 'Gold Rush', ic: 'coin' }, { n: 'JACKPOT', ic: 'gift' }];
