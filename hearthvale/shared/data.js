// Static game data for Hearthvale. Shared by client, server and tests.
export const GOODS = ['wood', 'clay', 'stone', 'wheat', 'planks', 'bricks', 'flour', 'bread', 'soup', 'scrolls'];
export const ICON = { wood: '🪵', clay: '🧱', stone: '🪨', wheat: '🌾', planks: '📏', bricks: '🏺', flour: '🥣', bread: '🍞', soup: '🍲', scrolls: '📜', coins: '🪙' };
export const SELL = { wood: 1, clay: 1, stone: 2, wheat: 1, planks: 3, bricks: 4, flour: 3, bread: 8, soup: 5, scrolls: 10 };
export const PLOT = 16;            // tiles per village side
export const MAX_PLAYERS = 16;
export const VILLAGE_RING = 40;    // radius of the ring of villages
export const LEVEL_XP = [0, 30, 90, 190, 330, 520, 760, 1050, 1400, 1800, 2300, 2900, 3600, 4400, 5300];
export const MAX_LEVEL = LEVEL_XP.length;

// size w x h in tiles, build = worker-seconds, lvl = village level needed, tech = research needed
export const BUILDINGS = {
  hall:       { name: 'Hearth Hall', w: 3, h: 3, cost: {}, build: 1, lvl: 99, xp: 0, hidden: true },
  house:      { name: 'Cottage',    w: 2, h: 2, cost: { wood: 15, clay: 5 },            build: 8,  lvl: 1, xp: 8,  housing: 2 },
  farm:       { name: 'Wheat Field', w: 3, h: 2, cost: { wood: 10 },                   build: 5,  lvl: 1, xp: 5,  field: true },
  kitchen:    { name: 'Kitchen',    w: 2, h: 2, cost: { wood: 20, stone: 5 },           build: 9,  lvl: 1, xp: 10, craft: ['soup'] },
  sawmill:    { name: 'Sawmill',    w: 2, h: 2, cost: { wood: 25, stone: 10 },          build: 12, lvl: 2, xp: 14, craft: ['planks'] },
  kiln:       { name: 'Brick Kiln', w: 2, h: 2, cost: { wood: 20, clay: 20 },           build: 12, lvl: 2, xp: 14, craft: ['bricks'] },
  storehouse: { name: 'Storehouse', w: 2, h: 2, cost: { planks: 10, stone: 10 },        build: 14, lvl: 2, xp: 16, storage: 100 },
  study:      { name: 'Study',      w: 2, h: 2, cost: { planks: 20, bricks: 8 },        build: 18, lvl: 3, xp: 24, craft: ['scrolls'], research: true },
  mill:       { name: 'Windmill',   w: 2, h: 2, cost: { planks: 12, bricks: 4 },        build: 16, lvl: 3, xp: 20, craft: ['flour'], tech: 'milling' },
  bakery:     { name: 'Bakery',     w: 2, h: 2, cost: { planks: 15, bricks: 10 },       build: 18, lvl: 4, xp: 26, craft: ['bread'], tech: 'milling' },
  market:     { name: 'Market',     w: 2, h: 2, cost: { planks: 15, bricks: 6 },        build: 16, lvl: 4, xp: 22, market: true, tech: 'trade' },
  flowers:    { name: 'Flower Bed', w: 1, h: 1, cost: { coins: 5 },                     build: 2,  lvl: 1, xp: 3,  decor: 1 },
  lantern:    { name: 'Lantern',    w: 1, h: 1, cost: { coins: 8, stone: 1 },           build: 2,  lvl: 2, xp: 4,  decor: 1 },
  fountain:   { name: 'Fountain',   w: 2, h: 2, cost: { coins: 40, stone: 20 },         build: 10, lvl: 4, xp: 30, decor: 3 },
  banner:     { name: 'Banner',     w: 1, h: 1, cost: { coins: 15, planks: 2 },         build: 3,  lvl: 3, xp: 8,  decor: 2 },
};

// Crafts: in -> out, seconds of villager work per item
export const RECIPES = {
  soup:    { in: { wheat: 2 },              out: 1, time: 6,  xp: 2 },
  planks:  { in: { wood: 2 },               out: 1, time: 7,  xp: 2 },
  bricks:  { in: { clay: 2 },               out: 1, time: 7,  xp: 2 },
  flour:   { in: { wheat: 2 },              out: 1, time: 6,  xp: 2 },
  bread:   { in: { flour: 2 },              out: 1, time: 9,  xp: 4 },
  scrolls: { in: { planks: 1, clay: 1 },    out: 1, time: 10, xp: 4 },
};

export const TECH = {
  milling: { name: 'Milling',      scrolls: 3,  time: 20, desc: 'Unlocks Windmill and Bakery' },
  trade:   { name: 'Trade',        scrolls: 4,  time: 24, desc: 'Unlocks the Market' },
  swift:   { name: 'Swift Boots',  scrolls: 6,  time: 30, desc: 'Villagers walk 30% faster' },
  sturdy:  { name: 'Deep Cellars', scrolls: 8,  time: 36, desc: 'Storage +60' },
  keen:    { name: 'Sharp Tools',  scrolls: 10, time: 40, desc: 'Gathering yields +1' },
  hearty:  { name: 'Hearty Meals', scrolls: 12, time: 44, desc: 'Soup feeds twice as long' },
};

export const NODE_TYPES = {
  tree: { name: 'Oak Tree',  res: 'wood',  yield: 3, amount: 12, time: 4, regrow: 90 },
  clay: { name: 'Clay Pit',  res: 'clay',  yield: 3, amount: 12, time: 4, regrow: 90 },
  rock: { name: 'Boulder',   res: 'stone', yield: 2, amount: 10, time: 5, regrow: 120 },
};
// Shared valley fields: richer, regrow steadily, anyone can work them.
export const VALLEY_FIELDS = [
  { id: 'vf_wood',  type: 'tree', name: 'Whisper Forest', res: 'wood',  yield: 5, time: 4, max: 300, regen: 1.5, ang: 0.0 },
  { id: 'vf_clay',  type: 'clay', name: 'Riverbank Clay', res: 'clay',  yield: 5, time: 4, max: 300, regen: 1.5, ang: 1.5708 },
  { id: 'vf_stone', type: 'rock', name: 'Granite Quarry', res: 'stone', yield: 4, time: 5, max: 240, regen: 1.0, ang: 3.1416 },
  { id: 'vf_wheat', type: 'wheat', name: 'Golden Meadow', res: 'wheat', yield: 6, time: 5, max: 300, regen: 1.5, ang: 4.7124 },
];
export const VALLEY_FIELD_RADIUS = 13;
export const VALLEY_LEVEL_XP = [0, 100, 300, 650, 1200, 2000, 3200, 5000];

export const QUESTS = [
  { id: 'q_wood',   text: 'Gather 20 wood',          stat: 'wood',    n: 20, reward: { coins: 20 } },
  { id: 'q_house',  text: 'Build a Cottage',         stat: 'b_house', n: 1,  reward: { wood: 20 } },
  { id: 'q_farm',   text: 'Build a Wheat Field',     stat: 'b_farm',  n: 1,  reward: { coins: 20 } },
  { id: 'q_wheat',  text: 'Harvest 18 wheat',        stat: 'wheat',   n: 18, reward: { clay: 20 } },
  { id: 'q_kitch',  text: 'Build a Kitchen',         stat: 'b_kitchen', n: 1, reward: { soup: 4 } },
  { id: 'q_soup',   text: 'Cook 5 soup',             stat: 'c_soup',  n: 5,  reward: { coins: 40 } },
  { id: 'q_hire',   text: 'Welcome a 4th villager',  stat: 'hired',   n: 1,  reward: { wood: 30 } },
  { id: 'q_lvl2',   text: 'Reach village level 2',   stat: 'level',   n: 2,  reward: { stone: 20 } },
  { id: 'q_order',  text: 'Help with a Valley order', stat: 'gave',   n: 1,  reward: { coins: 50 } },
  { id: 'q_saw',    text: 'Build a Sawmill',         stat: 'b_sawmill', n: 1, reward: { coins: 30 } },
  { id: 'q_plank',  text: 'Saw 10 planks',           stat: 'c_planks', n: 10, reward: { stone: 20 } },
  { id: 'q_study',  text: 'Build a Study',           stat: 'b_study', n: 1,  reward: { scrolls: 5 } },
  { id: 'q_lvl5',   text: 'Reach village level 5',   stat: 'level',   n: 5,  reward: { coins: 200 } },
];
