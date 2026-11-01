// data_core.js: the contract every other module builds on (grid, turrets, enemies, bosses, worlds, maps).
// Pure data and tiny pure helpers. No DOM, no Math.random, no Date. Ids are append-only lowercase_snake: saves point at them.
// House rule: never write an em dash in code, UI text or comments.

export const GAME = {
  title: 'DROP THE BASS',
  subtitle: 'Turret Defense',
  tagline: 'Merge your gear. Hold the stage. Keep the music live.',
  saveKey: 'drop_the_bass_save_v1',
  version: 1,
};

// ---------------------------------------------------------------- board geometry (logical pixels, the canvas is 540 x 960)
export const W = 540, H = 960;
export const COLS = 7, ROWS = 10, TILE = 72;
export const BOARD_X = 18, BOARD_Y = 120;           // top-left of tile (0,0)
export const BOARD_W = COLS * TILE, BOARD_H = ROWS * TILE;
export const tileCx = (c) => BOARD_X + c * TILE + TILE / 2;
export const tileCy = (r) => BOARD_Y + r * TILE + TILE / 2;

// ---------------------------------------------------------------- palette (art and UI share it)
export const COL = {
  ink: '#0d0820', ink2: '#170f33', panel: '#1e1442', panel2: '#2a1c5a', line: '#3b2a7a',
  bone: '#fff6ea', dim: '#a99bd0',
  pink: '#ff5fb0',      // Jasmin
  green: '#9dff3a',     // RoxorLoops
  cyan: '#2fe6ff', gold: '#ffc83d', orange: '#ff9a3c', red: '#ff4a5e', violet: '#9b6bff', blue: '#4d8dff',
  static: '#c9c4d6',    // the Static (enemies) are fuzzy grey with colour glitches
  coin: '#ffd44d', diamond: '#5fe8ff', record: '#ff8ad8', fans: '#ff6b6b',
};

export const RARITY = {
  common:    { id: 'common',    name: 'Common',    color: '#b9c2d6', weight: 60, mult: 1.0 },
  rare:      { id: 'rare',      name: 'Rare',      color: '#4d9bff', weight: 28, mult: 1.35 },
  epic:      { id: 'epic',      name: 'Epic',      color: '#b66bff', weight: 9,  mult: 1.8 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#ffb02e', weight: 2.6, mult: 2.5 },
  mythic:    { id: 'mythic',    name: 'Mythic',    color: '#ff4fa0', weight: 0.4, mult: 3.5 },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

// ---------------------------------------------------------------- turrets (the Dropkit)
// Every turret merges 1..MAX_LEVEL. Level scaling is shared (see lvlDmg / lvlRate / lvlRange), special behaviour is per kind in sim.js.
export const MAX_LEVEL = 7;
export const lvlDmg = (L) => Math.pow(2.15, L - 1);
export const lvlRate = (L) => 1 + 0.05 * (L - 1);
export const lvlRange = (L) => 1 + 0.035 * (L - 1);

// kind = how it fires. hero = which of the duo "owns" the instrument (flavour and art accent).
// unlock = { fame, records }: kept for save compatibility; every turret is free from the start.
export const TURRETS = {
  kick:    { id: 'kick',    name: 'Kick Cannon',     hero: 'roxor',  kind: 'splash',  color: '#ff7a3c', accent: '#ffd9a0',
             dmg: 20, rate: 0.85, range: 190, splash: 52, unlock: { fame: 1, records: 0 },
             blurb: 'Lobs a thumping bass shell. Hurts everything near the landing.',
             perks: { 3: 'Bigger blast radius', 5: 'Blast slows enemies', 7: 'Every 4th shell is huge' } },
  snare:   { id: 'snare',   name: 'Snare Snapper',   hero: 'roxor',  kind: 'shot',    color: '#ffd23c', accent: '#fff3b0',
             dmg: 8, rate: 2.4, range: 165, unlock: { fame: 1, records: 0 },
             blurb: 'Fast crack of the snare. Reliable all-rounder.',
             perks: { 4: 'Fires 2 shots', 5: '+15% crit chance', 7: 'Fires 3 shots' } },
  hat:     { id: 'hat',     name: 'Hi-Hat Gatling',  hero: 'roxor',  kind: 'gatling', color: '#7dffd0', accent: '#d8fff0',
             dmg: 2.6, rate: 7, range: 140, unlock: { fame: 1, records: 0 },
             blurb: 'Tiny hits, huge speed. Spins up the longer it fires.',
             perks: { 5: 'Bullets pierce 1 enemy', 7: 'Ignores half of armor' } },
  sub:     { id: 'sub',     name: 'Sub Bass',        hero: 'roxor',  kind: 'pulse',   color: '#7a5cff', accent: '#c9bcff',
             dmg: 12, rate: 0.6, range: 105, slow: 0.3, unlock: { fame: 1, records: 0 },
             blurb: 'A low pulse rolls out in a ring and slows everything it touches.',
             perks: { 3: 'Stronger slow', 5: 'Pulse pushes enemies back', 7: 'Double pulse' } },
  mic:     { id: 'mic',     name: 'Siren Mic',       hero: 'jasmin', kind: 'beam',    color: '#ff5fb0', accent: '#ffd0ea',
             dmg: 16, rate: 0.95, range: 230, unlock: { fame: 1, records: 0 },
             blurb: 'Jasmin\'s sung beam pierces a whole line of Static.',
             perks: { 4: 'Wider beam', 5: 'Every 8th beam heals the stage', 7: 'Beam sings twice' } },
  synth:   { id: 'synth',   name: 'Arc Synth',       hero: 'roxor',  kind: 'chain',   color: '#35c8ff', accent: '#c4f1ff',
             dmg: 11, rate: 1.15, range: 155, chains: 2, unlock: { fame: 1, records: 0 },
             blurb: 'Lightning that jumps from one enemy to the next.',
             perks: { 3: '+1 chain', 5: '+1 chain and short stun', 7: '+1 chain' } },
  horn:    { id: 'horn',    name: 'Air Horn',        hero: 'roxor',  kind: 'cone',    color: '#ff4a5e', accent: '#ffc4cb',
             dmg: 8, rate: 0.55, range: 125, stun: 0.7, unlock: { fame: 1, records: 0 },
             blurb: 'A blast cone that stuns and shoves enemies back down the path.',
             perks: { 3: 'Longer stun', 5: 'Wider cone', 7: 'Blasts all around' } },
  scratch: { id: 'scratch', name: 'Vinyl Scratcher', hero: 'jasmin', kind: 'boomerang', color: '#e5e5ff', accent: '#ffffff',
             dmg: 13, rate: 0.75, range: 170, unlock: { fame: 1, records: 0 },
             blurb: 'Throws a spinning record that flies out and comes back, hitting twice.',
             perks: { 3: 'Throws 2 records', 5: 'Records ignore armor', 7: 'Throws 3 records' } },
  loop:    { id: 'loop',    name: 'Loop Station',    hero: 'jasmin', kind: 'aura_rate', color: '#3cff9a', accent: '#c8ffe2',
             dmg: 0, rate: 0, range: 0, aura: 0.18, unlock: { fame: 1, records: 0 },
             blurb: 'Does not shoot. Neighbours play faster, like a loop that never stops.',
             perks: { 3: 'Neighbours get range too', 5: 'Neighbours sometimes fire twice', 7: 'Aura is 50% stronger' } },
  cowbell: { id: 'cowbell', name: 'Cowbell Sniper',  hero: 'roxor',  kind: 'sniper',  color: '#ffb02e', accent: '#fff0c4',
             dmg: 55, rate: 0.42, range: 320, crit: 0.25, unlock: { fame: 1, records: 0 },
             blurb: 'More cowbell. Huge long range hits that mark the target.',
             perks: { 3: 'Mark lasts longer', 5: 'Shots pierce 1 enemy', 7: 'Executes weakened enemies' } },
  amp:     { id: 'amp',     name: 'Amp Stack',       hero: 'roxor',  kind: 'aura_dmg', color: '#ff3c8a', accent: '#ffc2dd',
             dmg: 0, rate: 0, range: 0, aura: 0.16, unlock: { fame: 1, records: 0 },
             blurb: 'Does not shoot. Neighbours hit harder. Turn it up to eleven.',
             perks: { 3: 'More damage aura', 5: 'Neighbours gain crit', 7: 'Aura is 50% stronger' } },
  vocal:   { id: 'vocal',   name: 'Choir Orb',       hero: 'jasmin', kind: 'orb',     color: '#ffe0f4', accent: '#ffffff',
             dmg: 9, rate: 0.5, range: 200, unlock: { fame: 1, records: 0 },
             blurb: 'Jasmin\'s harmony drifts as a homing choir orb and bursts into soft light.',
             perks: { 3: 'Orbs seek faster', 5: 'Burst heals the stage sometimes', 7: 'Fires 2 orbs' } },
};
export const TURRET_IDS = Object.keys(TURRETS);
export const STARTER_TURRETS = Object.keys(TURRETS);   // every turret is in the drop pool from the first run

// ---------------------------------------------------------------- enemies (the Static)
// hp is a multiplier of the wave's base hp. speed in px per second. armor is flat damage removed per hit (min 25% of the hit goes through).
export const ENEMIES = {
  fuzz:     { id: 'fuzz',     name: 'Fuzz',           hp: 1.0,  speed: 52, armor: 0, coins: 2, hype: 1, r: 15, color: '#c9c4d6', blurb: 'Plain static. Lots of it.' },
  zip:      { id: 'zip',      name: 'Glitch Zip',     hp: 0.55, speed: 98, armor: 0, coins: 2, hype: 1, r: 12, color: '#6dffd8', blurb: 'Fast and fragile.' },
  brick:    { id: 'brick',    name: 'Brickwall',      hp: 3.6,  speed: 34, armor: 3, coins: 5, hype: 3, r: 22, color: '#8e86a8', blurb: 'Slow, tough, armored. Tiny hits bounce off.' },
  echo:     { id: 'echo',     name: 'Echo',           hp: 1.3,  speed: 48, armor: 0, coins: 3, hype: 2, r: 16, color: '#b79cff', blurb: 'Splits into two smaller echoes when it dies.' },
  mini:     { id: 'mini',     name: 'Echo Mini',      hp: 0.5,  speed: 60, armor: 0, coins: 1, hype: 0, r: 10, color: '#d6c7ff', blurb: 'What an Echo leaves behind.', hidden: true },
  leech:    { id: 'leech',    name: 'Hum Healer',     hp: 2.0,  speed: 44, armor: 0, coins: 5, hype: 3, r: 17, color: '#8fffa0', blurb: 'Hums a note that heals other Static nearby.' },
  drone:    { id: 'drone',    name: 'Autotune Drone', hp: 1.0,  speed: 70, armor: 0, coins: 3, hype: 2, r: 14, color: '#ff9ad2', blurb: 'Flies straight at the stage and ignores the path.', flying: true },
  gate:     { id: 'gate',     name: 'Gate Guard',     hp: 1.5,  speed: 42, armor: 0, coins: 5, hype: 3, r: 18, color: '#ffd26b', blurb: 'Carries a noise-gate shield that soaks damage, then comes back.', shield: 0.8 },
  squeal:   { id: 'squeal',   name: 'Feedback',       hp: 2.0,  speed: 46, armor: 0, coins: 6, hype: 3, r: 17, color: '#ff6b6b', blurb: 'Dies with a screech that jams nearby turrets.' },
  mute:     { id: 'mute',     name: 'Mute Ghost',     hp: 2.2,  speed: 55, armor: 0, coins: 6, hype: 3, r: 17, color: '#9fb8ff', blurb: 'Immune to slows, stuns and push-backs.', immune: true },
  rager:    { id: 'rager',    name: 'Glitchbug',      hp: 1.6,  speed: 45, armor: 0, coins: 4, hype: 2, r: 15, color: '#ff8a3c', blurb: 'Goes berserk and speeds up when hurt.' },
};
export const ENEMY_IDS = Object.keys(ENEMIES);

// Bosses. hpMul is a multiplier of the wave base hp (bosses are big hp bags with one trick each).
export const BOSSES = {
  compressor: { id: 'compressor', name: 'The Compressor',  hpMul: 38, speed: 26, armor: 2, r: 38, color: '#7d8bb0', coins: 120, trick: 'Squashes big hits: no single hit does more than 6% of its health.' },
  noisegate:  { id: 'noisegate',  name: 'Noise Gate',      hpMul: 44, speed: 30, armor: 1, r: 36, color: '#ffcf4a', coins: 150, trick: 'Slams shut every few seconds and cannot be hurt. Calls Fuzz.' },
  reverb:     { id: 'reverb',     name: 'Reverb Titan',    hpMul: 52, speed: 27, armor: 1, r: 40, color: '#9f7bff', coins: 190, trick: 'Echoes itself: spawns Echo Minis as it walks.' },
  djglitch:   { id: 'djglitch',   name: 'DJ Glitch',       hpMul: 60, speed: 34, armor: 0, r: 34, color: '#35f0c8', coins: 230, trick: 'Teleports along the path and jams your nearest turrets.' },
  playback:   { id: 'playback',   name: 'Mr. Playback',    hpMul: 90, speed: 28, armor: 2, r: 44, color: '#ff4fa0', coins: 400, trick: 'Perfect, polished, three phases. Calls everything, heals, and hits the skip button.' },
};
export const BOSS_IDS = Object.keys(BOSSES);

// Elite affixes (a few enemies per wave from wave 6, more later)
export const AFFIXES = {
  swift:   { id: 'swift',   name: 'Swift',     speed: 1.5, hp: 1.0, coins: 1.5, color: '#6dffd8' },
  armored: { id: 'armored', name: 'Armored',   speed: 1.0, hp: 1.6, armorAdd: 2, coins: 1.8, color: '#9aa4c8' },
  regen:   { id: 'regen',   name: 'Regrowing', speed: 1.0, hp: 1.3, regen: 0.04, coins: 1.7, color: '#8fffa0' },
  golden:  { id: 'golden',  name: 'Golden',    speed: 1.0, hp: 1.5, coins: 5, color: '#ffd44d' },
  giant:   { id: 'giant',   name: 'Giant',     speed: 0.8, hp: 3.0, coins: 3, scale: 1.4, color: '#ff8a3c' },
};

// ---------------------------------------------------------------- maps and worlds
// Paths are lists of [col, row] corners (axis aligned). The first corner may be off the board (-1 or COLS or ROWS) for the spawn.
// The last corner is the stage tile (where enemies leak). Several paths = several lanes, enemies alternate between lanes.
export const MAPS = {
  garage: {
    paths: [[[-1, 1], [5, 1], [5, 3], [1, 3], [1, 5], [5, 5], [5, 7], [1, 7], [1, 9], [6, 9]]],
    blocked: [[0, 0], [6, 0], [6, 4], [0, 8], [3, 4]],
  },
  busk: {
    paths: [[[-1, 0], [6, 0], [6, 9], [0, 9], [0, 2], [4, 2], [4, 7], [2, 7], [2, 4]]],
    blocked: [[1, 1], [5, 8]],
  },
  club: {
    paths: [[[1, -1], [1, 8], [3, 8], [3, 2], [5, 2], [5, 9]]],
    blocked: [[0, 0], [6, 0], [6, 9], [0, 9], [2, 5]],
  },
  festival: {
    paths: [
      [[-1, 0], [2, 0], [2, 4], [3, 4], [3, 6], [1, 6], [1, 8], [5, 8], [5, 9]],
      [[7, 0], [4, 0], [4, 4], [3, 4], [3, 6], [1, 6], [1, 8], [5, 8], [5, 9]],
    ],
    blocked: [[6, 9], [0, 9], [0, 3]],
  },
  arena: {
    paths: [
      [[0, -1], [0, 7], [3, 7], [3, 9]],
      [[6, -1], [6, 7], [3, 7], [3, 9]],
      [[3, -1], [3, 9]],
    ],
    blocked: [[1, 9], [5, 9], [2, 9], [4, 9]],
  },
};

// Expand a map into everything the sim and renderer need. Pure, cached.
const mapCache = {};
export function buildMap(mapId) {
  if (mapCache[mapId]) return mapCache[mapId];
  const m = MAPS[mapId];
  const lanes = [];
  const pathTiles = new Set();
  const key = (c, r) => c + ',' + r;
  for (const corners of m.paths) {
    const pts = [];       // pixel waypoints
    const tiles = [];     // every tile center walked, in order (no repeats between consecutive)
    for (let i = 0; i < corners.length; i++) {
      const [c, r] = corners[i];
      pts.push({ x: tileCx(c), y: tileCy(r), c, r });
      if (i === 0) { tiles.push([c, r]); continue; }
      const [pc, pr] = corners[i - 1];
      const dc = Math.sign(c - pc), dr = Math.sign(r - pr);
      let cc = pc, rr = pr;
      while (cc !== c || rr !== r) { cc += dc; rr += dr; tiles.push([cc, rr]); }
    }
    for (const [c, r] of tiles) if (c >= 0 && c < COLS && r >= 0 && r < ROWS) pathTiles.add(key(c, r));
    // cumulative length
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    lanes.push({ pts, len, total: len[len.length - 1], tiles });
  }
  const blocked = new Set((m.blocked || []).map(([c, r]) => key(c, r)));
  const slots = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = key(c, r);
    if (pathTiles.has(k)) continue;
    slots.push({ c, r, x: tileCx(c), y: tileCy(r), blocked: blocked.has(k), idx: r * COLS + c });
  }
  const last = lanes[0].pts[lanes[0].pts.length - 1];
  const out = { id: mapId, lanes, pathTiles, slots, base: { x: last.x, y: last.y, c: last.c, r: last.r },
    isPath: (c, r) => pathTiles.has(key(c, r)), buildable: slots.filter((s) => !s.blocked) };
  mapCache[mapId] = out;
  return out;
}
// Position along a lane at distance d (px). Also returns the heading angle.
export function laneAt(lane, d) {
  if (d <= 0) { const a = lane.pts[0], b = lane.pts[1]; return { x: a.x, y: a.y, ang: Math.atan2(b.y - a.y, b.x - a.x) }; }
  if (d >= lane.total) { const n = lane.pts.length; const a = lane.pts[n - 2], b = lane.pts[n - 1]; return { x: b.x, y: b.y, ang: Math.atan2(b.y - a.y, b.x - a.x) }; }
  let i = 1;
  while (i < lane.len.length - 1 && lane.len[i] < d) i++;
  const a = lane.pts[i - 1], b = lane.pts[i];
  const t = (d - lane.len[i - 1]) / Math.max(1e-6, lane.len[i] - lane.len[i - 1]);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}

// Worlds = the stops on the tour. wavesTotal is the story length; endless continues past it.
export const WORLDS = [
  { id: 'garage',   n: 1, name: 'Garage Days',     place: 'Roxor\'s Garage',  map: 'garage',   bpm: 100, wavesTotal: 20, hpMul: 3.5, pool: ['fuzz', 'zip', 'brick', 'echo'],
    boss10: 'compressor', boss: 'compressor', sky: ['#1a1038', '#3a1d5c'], accent: '#ff9a3c', ground: '#2a1c4a', coinMul: 1.0,
    blurb: 'Where it all started. A cluttered garage, a loop pedal and a very confused cat.' },
  { id: 'busk',     n: 2, name: 'Busk Street',     place: 'Old Town Street',  map: 'busk',     bpm: 108, wavesTotal: 20, hpMul: 8, pool: ['fuzz', 'zip', 'brick', 'echo', 'drone', 'leech'],
    boss10: 'compressor', boss: 'noisegate', sky: ['#10264a', '#2a4a7a'], accent: '#ffd23c', ground: '#1f2f5a', coinMul: 1.7,
    blurb: 'Cobblestones, street lamps and a crowd that has gone suspiciously quiet.' },
  { id: 'club',     n: 3, name: 'Neon Club',       place: 'The Neon Club',    map: 'club',     bpm: 120, wavesTotal: 20, hpMul: 21, pool: ['fuzz', 'zip', 'brick', 'echo', 'drone', 'leech', 'gate', 'squeal'],
    boss10: 'noisegate', boss: 'reverb', sky: ['#2a0f40', '#5a1a6a'], accent: '#ff4fd0', ground: '#2e1450', coinMul: 2.8,
    blurb: 'Lasers, fog and a dance floor that forgot how to dance.' },
  { id: 'festival', n: 4, name: 'Festival Fields', place: 'Sunset Festival', map: 'festival', bpm: 126, wavesTotal: 20, hpMul: 77, pool: ['fuzz', 'zip', 'brick', 'echo', 'drone', 'leech', 'gate', 'squeal', 'mute', 'rager'],
    boss10: 'reverb', boss: 'djglitch', sky: ['#4a1f3a', '#ff7a4a'], accent: '#ffb02e', ground: '#3a2048', coinMul: 4.6,
    blurb: 'Two entrances, one stage and a sunset that has gone grey around the edges.' },
  { id: 'arena',    n: 5, name: 'Mega Arena',      place: 'The Mega Arena',   map: 'arena',    bpm: 132, wavesTotal: 20, hpMul: 280,   pool: ['fuzz', 'zip', 'brick', 'echo', 'drone', 'leech', 'gate', 'squeal', 'mute', 'rager'],
    boss10: 'djglitch', boss: 'playback', sky: ['#0a0a2a', '#2a1060'], accent: '#ff5fb0', ground: '#1c1240', coinMul: 4.6,
    blurb: 'Three lanes, ninety thousand empty seats and Mr. Playback at the soundboard.' },
];
export const WORLD_BY_ID = Object.fromEntries(WORLDS.map((w) => [w.id, w]));
export const ENCORE_MAX = 5;   // encore 0 = normal, 1..5 harder (hp, speed) and richer rewards
export const encoreHp = (e) => 1 + 0.55 * e + 0.08 * e * e;
export const encoreSpeed = (e) => 1 + 0.05 * e;
export const encoreReward = (e) => 1 + 0.4 * e;

// ---------------------------------------------------------------- core run economy constants
export const ECON = {
  startCoins: 120,
  stageHp: 20,
  deployBase: 40,          // cost of deploy n: deployBase + deployStep*n + deployCurve*n^2
  deployStep: 7,
  deployCurve: 0.12,
  sellBack: 0.6,
  prepSeconds: 14,
  earlyBonusPerSec: 2.0,    // coins per second of prep skipped
  waveClearBase: 18,
  waveClearPerWave: 3,
  hypeBase: 40,            // hype needed for the first remix pick; grows
  hypeGrow: 1.28,
  comboWindow: 2.2,        // seconds between kills to keep the combo
  comboMax: 50,
  beatWindow: 0.13,        // seconds either side of the beat that count as "on beat"
  critMul: 2.0,
  heroCdRoxor: 30, heroCdJasmin: 34,
  duetWindow: 2.0,
  rerollCostDiamonds: 3,
  reviveDiamonds: 50,
  hpPerWaveBase: 28,       // base hp of a 'fuzz' on wave 1 (before world and encore multipliers)
  hpGrowth: 1.21,         // per wave
  hpGrowthLate: 1.15,      // after wave 20 (endless)
};

export const fmt = (n) => {
  n = Math.floor(n);
  if (n < 10000) return String(n);
  const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let i = 0, v = n;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1') + u[i];
};
