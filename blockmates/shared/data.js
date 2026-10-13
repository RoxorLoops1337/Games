// Blockmates shared data: blocks, items, recipes, creatures, constants.
// APPEND ONLY. Block ids (1..255) and item ids (256+) are stored in saved worlds.
// Same file is imported by the browser client and by the server (Node / Cloudflare), so no DOM and no Node APIs here.

export const W = 1536;          // world width in tiles
export const H = 224;           // world height in tiles (y grows downward)
export const CHUNK = 32;        // chunk = 32 columns x full height
export const SEA = 92;          // sea level row
export const TICK = 30;         // server ticks per second
export const DT = 1 / TICK;
export const MAX_PLAYERS = 16;
export const REACH = 5.5;
export const DAY_SECONDS = 600; // a full day

// ---------------------------------------------------------------- blocks
// hard: seconds with bare hands. need: tool tier needed to get the drop. tool: best tool kind.
// solid: blocks movement. light: 0..15 emitted. drop: item name (default: the block itself). sky: lets light through.
export const BLOCKS = [{ name: 'air', solid: false, sky: true }];
export const B = { air: 0 };
function blk(name, o = {}) {
  const id = BLOCKS.length;
  BLOCKS.push({ name, hard: 1, need: 0, tool: 'pick', solid: true, light: 0, sky: false, color: '#888', ...o });
  B[name] = id;
  return id;
}
blk('grass', { hard: 0.7, tool: 'shovel', drop: 'dirt', color: '#5fb844' });
blk('dirt', { hard: 0.6, tool: 'shovel', color: '#8a5a36' });
blk('stone', { hard: 2.4, need: 1, drop: 'cobble', color: '#8c8f96' });
blk('sand', { hard: 0.5, tool: 'shovel', color: '#e8d58f', gravity: true });
blk('sandstone', { hard: 1.8, need: 1, color: '#d9bf74' });
blk('snow', { hard: 0.4, tool: 'shovel', color: '#f1f6ff' });
blk('ice', { hard: 0.8, need: 1, color: '#a9dcf5' });
blk('clay', { hard: 0.7, tool: 'shovel', color: '#b0775e' });
blk('gravel', { hard: 0.6, tool: 'shovel', color: '#79767a', gravity: true });
blk('bedrock', { hard: 1e9, need: 99, color: '#262630' });
blk('log', { hard: 1.4, tool: 'axe', color: '#7a4e2a' });
blk('leaves', { hard: 0.25, tool: 'axe', solid: false, drop: 'sapling', dropChance: 0.18, color: '#3f9a3a', leafy: true });
blk('cactus', { hard: 0.5, tool: 'axe', solid: false, color: '#3f8a4e', hurts: 1 });
blk('coal_ore', { hard: 2.8, need: 1, drop: 'coal', color: '#33343a' });
blk('copper_ore', { hard: 3.2, need: 2, color: '#c8743c' });
blk('tin_ore', { hard: 3.2, need: 2, color: '#b9c3cf' });
blk('iron_ore', { hard: 4.2, need: 3, color: '#c9a58f' });
blk('gold_ore', { hard: 4.6, need: 4, color: '#f2c63b' });
blk('titanium_ore', { hard: 6, need: 5, color: '#b7a8ff' });
blk('sunstone_ore', { hard: 6.5, need: 5, drop: 'sunstone', color: '#ff9f4a', light: 5 });
blk('obsidian', { hard: 8, need: 5, color: '#2a1d3f' });
blk('planks', { hard: 1, tool: 'axe', color: '#c88a4a' });
blk('brick', { hard: 2, need: 1, color: '#b8553f' });
blk('stone_brick', { hard: 2.4, need: 1, color: '#9a9ca6' });
blk('glass', { hard: 0.4, tool: 'any', color: '#cdeeff', sky: true, drop: null });
blk('torch', { hard: 0.05, tool: 'any', solid: false, light: 14, color: '#ffd35a', sky: true, plant: true });
blk('ladder', { hard: 0.3, tool: 'axe', solid: false, climb: true, color: '#a8723a', sky: true });
blk('workbench', { hard: 1, tool: 'axe', solid: false, station: 'bench', color: '#b87b3e', sky: true });
blk('furnace', { hard: 2, need: 1, solid: false, station: 'furnace', light: 8, color: '#6a6a74', sky: true });
blk('anvil', { hard: 2.5, need: 1, solid: false, station: 'anvil', color: '#4b4d57', sky: true });
blk('chest', { hard: 1, tool: 'axe', solid: false, container: 24, color: '#b6812f', sky: true });
blk('bed', { hard: 0.6, tool: 'any', solid: false, bed: true, color: '#c8434b', sky: true });
blk('sign', { hard: 0.3, tool: 'axe', solid: false, sign: true, color: '#c9a063', sky: true });
blk('platform', { hard: 0.6, tool: 'axe', solid: false, oneway: true, color: '#c88a4a', sky: true });
blk('waystone', { hard: 3, need: 1, solid: false, waystone: true, light: 10, color: '#7ad8ff', sky: true });
blk('lamp', { hard: 0.4, tool: 'any', light: 15, color: '#fff2a8' });
blk('copper_block', { hard: 3, need: 2, color: '#d9834a' });
blk('iron_block', { hard: 4, need: 3, color: '#cfd3d9' });
blk('gold_block', { hard: 4, need: 4, color: '#ffd84a' });
blk('wool', { hard: 0.4, tool: 'any', color: '#f3eee6' });
blk('door_closed', { hard: 0.8, tool: 'axe', solid: true, door: true, drop: 'door', color: '#9a6a36' });
blk('door_open', { hard: 0.8, tool: 'axe', solid: false, door: true, drop: 'door', color: '#9a6a36', sky: true });
blk('flower_red', { hard: 0.05, tool: 'any', solid: false, plant: true, sky: true, color: '#e04a5a' });
blk('flower_yellow', { hard: 0.05, tool: 'any', solid: false, plant: true, sky: true, color: '#f2d33c' });
blk('tallgrass', { hard: 0.05, tool: 'any', solid: false, plant: true, sky: true, drop: null, color: '#6bc84a' });
blk('mushroom', { hard: 0.05, tool: 'any', solid: false, plant: true, sky: true, color: '#d8b6a0' });
blk('sapling', { hard: 0.05, tool: 'any', solid: false, plant: true, sky: true, grow: 'tree', color: '#4aa83a' });
blk('wheat0', { hard: 0.05, tool: 'any', solid: false, plant: true, sky: true, drop: 'seeds', grow: 'wheat1', color: '#8bc34a' });
blk('wheat1', { hard: 0.05, tool: 'any', solid: false, plant: true, sky: true, drop: 'seeds', grow: 'wheat2', color: '#b5c23a' });
blk('wheat2', { hard: 0.05, tool: 'any', solid: false, plant: true, sky: true, drop: 'wheat', crop: true, color: '#e6c24a' });
blk('farmland', { hard: 0.6, tool: 'shovel', drop: 'dirt', color: '#5e3a22' });
blk('cobweb', { hard: 0.2, tool: 'any', solid: false, slow: true, sky: true, plant: true, drop: 'string', color: '#e8e8f0' });
blk('crystal', { hard: 3, need: 2, light: 9, color: '#9af0ff', solid: true, drop: 'crystal_shard' });
blk('trampoline', { hard: 0.8, tool: 'any', solid: true, bouncy: true, color: '#e8527a' });
blk('door_top_closed', { hard: 0.8, tool: 'axe', solid: true, door: true, drop: null, color: '#9a6a36' });
blk('door_top_open', { hard: 0.8, tool: 'axe', solid: false, door: true, drop: null, color: '#9a6a36', sky: true });

export const L_NONE = 0, L_WATER = 1, L_LAVA = 2; // liquid type (high nibble), level 1..8 (low nibble)

// ---------------------------------------------------------------- items
export const ITEMS = new Array(256).fill(null); // ids < 256 are blocks, filled below
export const I = {};
for (let id = 1; id < BLOCKS.length; id++) {
  const d = BLOCKS[id];
  ITEMS[id] = { name: d.name, label: label(d.name), place: id, stack: 99, kind: 'block' };
  I[d.name] = id;
}
function label(n) { return n.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
let nextItem = 256;
function itm(name, o = {}) {
  const id = nextItem++;
  ITEMS[id] = { name, label: label(name), stack: 99, kind: 'item', ...o };
  I[name] = id;
  return id;
}
// materials
itm('stick'); itm('coal');
itm('cobble', { label: 'Cobblestone', kind: 'block', place: B.stone }); // stone drops it, it places as stone
itm('flint'); itm('string'); itm('feather'); itm('leather'); itm('seeds', { place: B.wheat0 }); itm('wheat'); itm('bread', { food: 6 });
itm('apple', { food: 3, heal: 1 }); itm('raw_meat', { food: 1 }); itm('cooked_meat', { food: 8, heal: 2 });
itm('crystal_shard'); itm('sunstone'); itm('clay_ball');
for (const m of ['copper', 'tin', 'bronze', 'iron', 'gold', 'titanium']) itm(m + '_ingot');
itm('door', { kind: 'block', place: B.door_closed, stack: 99 });
itm('bucket'); itm('water_bucket'); itm('lava_bucket');
itm('glowshard'); // waystone fuel
itm('arrow'); itm('bone');
itm('mob_gel');
itm('golden_apple', { food: 10, heal: 6 });
// tools: tier 1 wood, 2 stone, 3 copper, 4 iron, 5 gold(bronze), 6 titanium
const TIERS = [
  ['wood', 1, 'stick'], ['stone', 2, 'cobble'], ['copper', 3, 'copper_ingot'], ['bronze', 4, 'bronze_ingot'], ['iron', 5, 'iron_ingot'], ['titanium', 7, 'titanium_ingot'],
];
export const TOOL_TIERS = TIERS.map((t) => ({ name: t[0], tier: t[1], mat: t[2] }));
for (const [m, tier] of TIERS) {
  itm(m + '_pickaxe', { stack: 1, tool: 'pick', tier, power: 1 + tier * 1.1, dur: 60 + tier * 90 });
  itm(m + '_axe', { stack: 1, tool: 'axe', tier, power: 1 + tier * 1.1, dur: 60 + tier * 90 });
  itm(m + '_shovel', { stack: 1, tool: 'shovel', tier, power: 1 + tier * 1.1, dur: 60 + tier * 90 });
  itm(m + '_sword', { stack: 1, tool: 'sword', tier, dmg: 2 + tier * 1.4, dur: 60 + tier * 90 });
}
itm('bow', { stack: 1, tool: 'bow', dur: 200 });
for (const [m, a] of [['leather', 1], ['copper', 2], ['iron', 3], ['gold', 3], ['titanium', 5]]) {
  itm(m + '_helmet', { stack: 1, armor: a, slot: 'head' });
  itm(m + '_chest', { stack: 1, armor: a * 2, slot: 'body' });
  itm(m + '_boots', { stack: 1, armor: a, slot: 'feet' });
}

itm('buddy_bell', { stack: 16 }); // hires a Buddy helper (see server/npcs.js)

export function itemDef(id) { return ITEMS[id] || null; }
export function blockDef(id) { return BLOCKS[id] || BLOCKS[0]; }
export function dropFor(blockId) {
  const d = BLOCKS[blockId];
  if (!d || d.drop === null) return 0;
  if (d.drop) return I[d.drop];
  return I[d.name];
}

// ---------------------------------------------------------------- recipes
// st: station needed within 6 tiles ('hand' = none).
export const RECIPES = [];
function rec(out, n, ins, st = 'hand') { RECIPES.push({ out: I[out], n, in: ins.map(([a, c]) => [I[a], c]), st }); }
rec('planks', 4, [['log', 1]]);
rec('stick', 4, [['planks', 2]]);
rec('workbench', 1, [['planks', 8]]);
rec('torch', 4, [['coal', 1], ['stick', 1]]);
rec('ladder', 3, [['stick', 5]]);
rec('platform', 4, [['planks', 3]]);
rec('door', 1, [['planks', 6]], 'bench');
rec('chest', 1, [['planks', 8]], 'bench');
rec('sign', 2, [['planks', 4], ['stick', 1]], 'bench');
rec('bed', 1, [['planks', 3], ['wool', 3]], 'bench');
rec('wool', 1, [['string', 4]]);
rec('furnace', 1, [['cobble', 10]], 'bench');
rec('anvil', 1, [['iron_ingot', 6], ['cobble', 4]], 'furnace');
rec('stone_brick', 4, [['cobble', 4]], 'bench');
rec('glass', 2, [['sand', 2], ['coal', 1]], 'furnace');
rec('clay_ball', 4, [['clay', 1]]);
rec('brick', 2, [['clay_ball', 4]], 'furnace');
rec('copper_ingot', 1, [['copper_ore', 1], ['coal', 1]], 'furnace');
rec('tin_ingot', 1, [['tin_ore', 1], ['coal', 1]], 'furnace');
rec('bronze_ingot', 2, [['copper_ingot', 2], ['tin_ingot', 1]], 'furnace');
rec('iron_ingot', 1, [['iron_ore', 1], ['coal', 1]], 'furnace');
rec('gold_ingot', 1, [['gold_ore', 1], ['coal', 1]], 'furnace');
rec('titanium_ingot', 1, [['titanium_ore', 1], ['coal', 2]], 'furnace');
rec('cooked_meat', 1, [['raw_meat', 1]], 'furnace');
rec('bread', 1, [['wheat', 3]], 'bench');
rec('copper_block', 1, [['copper_ingot', 6]], 'furnace');
rec('iron_block', 1, [['iron_ingot', 6]], 'furnace');
rec('gold_block', 1, [['gold_ingot', 6]], 'furnace');
rec('lamp', 1, [['glass', 1], ['sunstone', 1]], 'bench');
rec('waystone', 1, [['stone_brick', 6], ['crystal_shard', 2], ['gold_ingot', 1]], 'anvil');
rec('glowshard', 2, [['crystal_shard', 1], ['sunstone', 1]], 'bench');
rec('trampoline', 1, [['wool', 4], ['iron_ingot', 1]], 'anvil');
rec('bucket', 1, [['iron_ingot', 3]], 'anvil');
rec('arrow', 4, [['stick', 1], ['flint', 1], ['feather', 1]], 'bench');
rec('bow', 1, [['stick', 3], ['string', 3]], 'bench');
rec('buddy_bell', 1, [['iron_ingot', 3], ['wool', 2], ['crystal_shard', 1]], 'anvil');
rec('leather_helmet', 1, [['leather', 5]], 'bench');
rec('leather_chest', 1, [['leather', 8]], 'bench');
rec('leather_boots', 1, [['leather', 4]], 'bench');
for (const [m, mat] of [['copper', 'copper_ingot'], ['iron', 'iron_ingot'], ['gold', 'gold_ingot'], ['titanium', 'titanium_ingot']]) {
  rec(m + '_helmet', 1, [[mat, 5]], 'anvil');
  rec(m + '_chest', 1, [[mat, 8]], 'anvil');
  rec(m + '_boots', 1, [[mat, 4]], 'anvil');
}
for (const [m, mat] of [['wood', 'planks'], ['stone', 'cobble'], ['copper', 'copper_ingot'], ['bronze', 'bronze_ingot'], ['iron', 'iron_ingot'], ['titanium', 'titanium_ingot']]) {
  const st = m === 'wood' ? 'bench' : m === 'stone' ? 'bench' : 'anvil';
  rec(m + '_pickaxe', 1, [[mat, 3], ['stick', 2]], st);
  rec(m + '_axe', 1, [[mat, 3], ['stick', 2]], st);
  rec(m + '_shovel', 1, [[mat, 1], ['stick', 2]], st);
  rec(m + '_sword', 1, [[mat, 2], ['stick', 1]], st);
}

// ---------------------------------------------------------------- creatures
export const MOBS = {
  waddler: { name: 'Waddler', w: 0.8, h: 0.8, hp: 6, speed: 1.6, hostile: false, drops: [['feather', 1, 2, 1], ['raw_meat', 1, 1, 0.8]], day: true },
  hoppit: { name: 'Hoppit', w: 0.7, h: 0.7, hp: 4, speed: 3.2, hostile: false, hop: 9, drops: [['raw_meat', 1, 1, 1], ['leather', 1, 1, 0.5]], day: true },
  gloomling: { name: 'Gloomling', w: 0.8, h: 1.6, hp: 12, speed: 2.4, hostile: true, dmg: 3, drops: [['bone', 1, 2, 0.8], ['mob_gel', 1, 1, 0.4]], night: true },
  skitter: { name: 'Skitter', w: 1.1, h: 0.7, hp: 9, speed: 3.6, hostile: true, dmg: 2, hop: 8, drops: [['string', 1, 3, 0.9]], cave: true },
  fishy: { name: 'Fishy', w: 0.7, h: 0.4, hp: 2, speed: 1.8, hostile: false, swim: true, drops: [['raw_meat', 1, 1, 1]] },
  stonewarden: { name: 'Stone Warden', w: 1.8, h: 2.6, hp: 120, speed: 2.2, hostile: true, dmg: 6, boss: true, drops: [['sunstone', 3, 6, 1], ['titanium_ingot', 2, 4, 1], ['golden_apple', 1, 1, 1]] },
};
export const MOB_LIST = Object.keys(MOBS);

// player constants
export const PLAYER = { w: 0.7, h: 1.8, hp: 20, food: 20, inv: 40, hotbar: 10, armorSlots: ['head', 'body', 'feet'] };
export const DEFAULT_LOOK = { skin: 0, hair: 0, hairStyle: 0, shirt: 4, pants: 2, eyes: 0 };
