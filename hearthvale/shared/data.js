// Static game data for Hearthvale. Shared by client, server and tests.
export const GOODS = ['wood', 'clay', 'stone', 'wheat', 'planks', 'bricks', 'flour', 'bread', 'soup', 'scrolls', 'egg', 'milk', 'wool', 'apple', 'fish', 'cheese', 'jam', 'cloth', 'pie'];
// goods a workshop makes (they get the Great Tree sell bonus)
export const CRAFTED = ['planks', 'bricks', 'flour', 'bread', 'soup', 'scrolls', 'cheese', 'jam', 'cloth', 'pie'];
export const ICON = { wood: '🪵', clay: '🧱', stone: '🪨', wheat: '🌾', planks: '📏', bricks: '🏺', flour: '🥣', bread: '🍞', soup: '🍲', scrolls: '📜', egg: '🥚', milk: '🥛', wool: '🧶', apple: '🍎', fish: '🐟', cheese: '🧀', jam: '🍯', cloth: '🧵', pie: '🥧', coins: '🪙' };
export const SELL = { wood: 1, clay: 1, stone: 2, wheat: 1, planks: 3, bricks: 4, flour: 3, bread: 8, soup: 5, scrolls: 10, egg: 3, milk: 4, wool: 5, apple: 3, fish: 4, cheese: 9, jam: 10, cloth: 12, pie: 16 };
export const PLOT = 16;            // tiles per village side
export const MAX_PLAYERS = 16;
export const RING_HALF = 35;       // villages sit on a square ring: half side length (4 corners + 3 per side = 16 plots of 16 tiles, 17.5 apart)
export const VILLAGE_RING = 44;    // legacy: kept for old imports
export const LEVEL_XP = [0, 30, 90, 190, 330, 520, 760, 1050, 1400, 1800, 2300, 2900, 3600, 4400, 5300, 7000, 9500, 13000, 18000, 25000];
export const MAX_LEVEL = LEVEL_XP.length;

// size w x h in tiles, build = worker-seconds, lvl = village level needed, tech = research needed
export const BUILDINGS = {
  hall:       { name: 'Hearth Hall', w: 3, h: 3, cost: { planks: 20, bricks: 10 }, build: 1, lvl: 99, xp: 0, hidden: true },
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
  // ---- animals and orchards ----
  coop:       { name: 'Chicken Coop', w: 2, h: 2, cost: { wood: 30, planks: 6 },          build: 12, lvl: 3, xp: 18, tech: 'husbandry', animals: ['chicken'], capacity: [4, 6, 8] },
  barn:       { name: 'Barn',       w: 3, h: 2, cost: { wood: 20, planks: 25, bricks: 8 }, build: 20, lvl: 5, xp: 30, tech: 'husbandry', animals: ['cow', 'sheep'], capacity: [3, 5, 7] },
  dairy:      { name: 'Dairy',      w: 2, h: 2, cost: { planks: 15, bricks: 8 },          build: 16, lvl: 5, xp: 24, craft: ['cheese'] },
  orchard:    { name: 'Orchard',    w: 3, h: 3, cost: { wood: 30, planks: 6 },            build: 12, lvl: 4, xp: 18, field: true, crop: 'apple', grow: 45 },
  dock:       { name: 'Fishing Dock', w: 3, h: 2, cost: { wood: 20, planks: 25, bricks: 4 }, build: 18, lvl: 6, xp: 30, tech: 'angling', fishing: true },
  pantry:     { name: 'Pantry',     w: 2, h: 2, cost: { planks: 20, bricks: 12 },         build: 18, lvl: 6, xp: 30, craft: ['jam', 'pie'], tech: 'preserving' },
  weavery:    { name: 'Weavery',    w: 2, h: 2, cost: { planks: 25, bricks: 15, coins: 40 }, build: 20, lvl: 7, xp: 34, craft: ['cloth'], tech: 'weaving' },
  // ---- more decorations (decor = charm points) ----
  scarecrow:  { name: 'Scarecrow',  w: 1, h: 1, cost: { coins: 15, wood: 2 },             build: 2,  lvl: 1, xp: 3,  decor: 1 },
  bench:      { name: 'Garden Bench', w: 2, h: 1, cost: { coins: 25 },                    build: 3,  lvl: 2, xp: 5,  decor: 2 },
  birdbath:   { name: 'Bird Bath',  w: 1, h: 1, cost: { coins: 30, stone: 2 },            build: 3,  lvl: 3, xp: 6,  decor: 2 },
  flowercart: { name: 'Flower Cart', w: 2, h: 1, cost: { coins: 45 },                     build: 4,  lvl: 3, xp: 8,  decor: 3 },
  picnic:     { name: 'Picnic Blanket', w: 2, h: 2, cost: { coins: 50 },                  build: 4,  lvl: 4, xp: 10, decor: 4 },
  pumpkins:   { name: 'Pumpkin Patch', w: 2, h: 2, cost: { coins: 40 },                   build: 4,  lvl: 4, xp: 9,  decor: 3 },
  swing:      { name: 'Garden Swing', w: 2, h: 2, cost: { coins: 60, wood: 6, planks: 2 }, build: 6,  lvl: 5, xp: 12, decor: 4 },
  beeskep:    { name: 'Bee Skep',   w: 1, h: 1, cost: { coins: 35, wood: 3 },             build: 3,  lvl: 5, xp: 7,  decor: 2 },
  hammock:    { name: 'Hammock',    w: 2, h: 1, cost: { coins: 70, wood: 4 },             build: 5,  lvl: 6, xp: 12, decor: 3 },
};

// Crafts: in -> out, seconds of villager work per item
export const RECIPES = {
  soup:    { in: { wheat: 2 },              out: 1, time: 6,  xp: 2 },
  planks:  { in: { wood: 2 },               out: 1, time: 7,  xp: 2 },
  bricks:  { in: { clay: 2 },               out: 1, time: 7,  xp: 2 },
  flour:   { in: { wheat: 2 },              out: 1, time: 6,  xp: 2 },
  bread:   { in: { flour: 2 },              out: 1, time: 9,  xp: 4 },
  scrolls: { in: { planks: 1, clay: 1 },    out: 1, time: 10, xp: 4 },
  cheese:  { in: { milk: 2 },               out: 1, time: 10, xp: 4 },
  jam:     { in: { apple: 3 },              out: 1, time: 9,  xp: 4 },
  pie:     { in: { apple: 2, flour: 1, egg: 1 }, out: 1, time: 14, xp: 7 },
  cloth:   { in: { wool: 2 },               out: 1, time: 10, xp: 5 },
};
// recipes that are food (cooking skill); the rest use the building skill
export const FOOD = ['soup', 'flour', 'bread', 'cheese', 'jam', 'pie'];

export const MAX_BLD_LEVEL = 3;
// Upgrading building at level L costs the base cost x (1 + 0.8 L), needs village level lvl + 2L (hall: 3L), and a builder
export const upgradeCost = (type, lvl) => Object.fromEntries(Object.entries(BUILDINGS[type].cost).map(([k, n]) => [k, Math.round(n * (1 + 0.8 * lvl))]));
export const upgradeNeedsLevel = (type, lvl) => type === 'hall' ? 3 * lvl : BUILDINGS[type].lvl + 2 * lvl;
export const UPGRADE_NOTE = { hall: '+1 housing, +50 storage', house: '+1 housing', storehouse: '+50 storage', farm: '+3 wheat per harvest', kitchen: 'cooks 25% faster', sawmill: 'saws 25% faster', kiln: 'bakes 25% faster', mill: 'grinds 25% faster', bakery: 'bakes 25% faster', study: 'works 25% faster', market: 'better prices (+10%)', fountain: 'more charm', flowers: 'more charm', lantern: 'more charm', banner: 'more charm', coop: 'room for 2 more chickens', barn: 'room for 2 more animals', dairy: 'works 25% faster', orchard: '+2 apples per harvest', dock: 'more charm', pantry: 'works 25% faster', weavery: 'works 25% faster', scarecrow: 'more charm', bench: 'more charm', birdbath: 'more charm', flowercart: 'more charm', picnic: 'more charm', pumpkins: 'more charm', swing: 'more charm', beeskep: 'more charm', hammock: 'more charm' };
export const TECH = {
  milling: { name: 'Milling',      scrolls: 3,  time: 20, desc: 'Unlocks Windmill and Bakery' },
  trade:   { name: 'Trade',        scrolls: 4,  time: 24, desc: 'Unlocks the Market' },
  swift:   { name: 'Swift Boots',  scrolls: 6,  time: 30, desc: 'Villagers walk 30% faster' },
  sturdy:  { name: 'Deep Cellars', scrolls: 8,  time: 36, desc: 'Storage +60' },
  keen:    { name: 'Sharp Tools',  scrolls: 10, time: 40, desc: 'Gathering yields +1' },
  hearty:  { name: 'Hearty Meals', scrolls: 12, time: 44, desc: 'Soup feeds twice as long' },
  husbandry:  { name: 'Husbandry',  scrolls: 14, time: 40, desc: 'Unlocks Chicken Coop and Barn' },
  angling:    { name: 'Angling',    scrolls: 12, time: 34, desc: 'Unlocks the Fishing Dock' },
  preserving: { name: 'Preserving', scrolls: 18, time: 46, desc: 'Unlocks the Pantry' },
  weaving:    { name: 'Weaving',    scrolls: 22, time: 52, desc: 'Unlocks the Weavery' },
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
  { id: 'q_up',     text: 'Upgrade a building',      stat: 'upgrades', n: 1, reward: { planks: 10 } },
  { id: 'q_lvl5',   text: 'Reach village level 5',   stat: 'level',   n: 5,  reward: { coins: 200 } },
  // ---- chapter 2 ----
  { id: 'q_coop',   ch: 2, text: 'Build a Chicken Coop',    stat: 'b_coop',    n: 1,  reward: { coins: 60 } },
  { id: 'q_chick',  ch: 2, text: 'Welcome 3 animals',       stat: 'animals',   n: 3,  reward: { wheat: 20 } },
  { id: 'q_egg',    ch: 2, text: 'Collect 12 eggs',         stat: 'egg',       n: 12, reward: { coins: 50 } },
  { id: 'q_orch',   ch: 2, text: 'Plant an Orchard',        stat: 'b_orchard', n: 1,  reward: { wood: 40 } },
  { id: 'q_apple',  ch: 2, text: 'Pick 20 apples',          stat: 'apple',     n: 20, reward: { coins: 70 } },
  { id: 'q_decor',  ch: 2, text: 'Place 5 decorations',     stat: 'decor',     n: 5,  reward: { coins: 100 } },
  { id: 'q_barn',   ch: 2, text: 'Build a Barn',            stat: 'b_barn',    n: 1,  reward: { planks: 20 } },
  { id: 'q_milk',   ch: 2, text: 'Collect 10 milk',         stat: 'milk',      n: 10, reward: { coins: 80 } },
  { id: 'q_dairy',  ch: 2, text: 'Build a Dairy',           stat: 'b_dairy',   n: 1,  reward: { bricks: 10 } },
  { id: 'q_cheese', ch: 2, text: 'Make 6 cheese',           stat: 'c_cheese',  n: 6,  reward: { coins: 120 } },
  { id: 'q_dock',   ch: 2, text: 'Build a Fishing Dock',    stat: 'b_dock',    n: 1,  reward: { planks: 15 } },
  { id: 'q_fish',   ch: 2, text: 'Catch 15 fish',           stat: 'fish',      n: 15, reward: { coins: 100 } },
  { id: 'q_pantry', ch: 2, text: 'Build a Pantry',          stat: 'b_pantry',  n: 1,  reward: { bricks: 15 } },
  { id: 'q_jam',    ch: 2, text: 'Make 8 jam',             stat: 'c_jam',     n: 8,  reward: { coins: 150 } },
  { id: 'q_visit',  ch: 2, text: 'Serve a visitor',         stat: 'visitors',  n: 1,  reward: { coins: 60 } },
  { id: 'q_weav',   ch: 2, text: 'Build a Weavery',         stat: 'b_weavery', n: 1,  reward: { planks: 20 } },
  { id: 'q_cloth',  ch: 2, text: 'Weave 6 cloth',           stat: 'c_cloth',   n: 6,  reward: { coins: 180 } },
  { id: 'q_trade',  ch: 2, text: 'Trade with the merchant', stat: 'trades',    n: 1,  reward: { scrolls: 3 } },
  { id: 'q_charm',  ch: 2, text: 'Reach 50 charm',          stat: 'charm',     n: 50, reward: { coins: 200 } },
  { id: 'q_proj',   ch: 2, text: 'Give 100 to the Great Project', stat: 'project', n: 100, reward: { scrolls: 6 } },
  { id: 'q_pie',    ch: 2, text: 'Bake 5 pies',             stat: 'c_pie',     n: 5,  reward: { coins: 250, scrolls: 3 } },
  { id: 'q_lvl10',  ch: 2, text: 'Reach village level 10',  stat: 'level',     n: 10, reward: { coins: 500 } },
  { id: 'q_charm2', ch: 2, text: 'Reach 150 charm',         stat: 'charm',     n: 150, reward: { coins: 400 } },
  { id: 'q_lvl15',  ch: 2, text: 'Reach village level 15',  stat: 'level',     n: 15, reward: { coins: 1000, scrolls: 10 } },
];

// ---------- animals ----------
export const STOCK_CAP = 8;          // ready products a coop or barn holds (all kinds together)
export const FEED_GOOD = 'wheat';    // 1 wheat feeds 2 products
export const ANIMALS = {
  chicken: { name: 'Chicken', house: 'coop', product: 'egg',  time: 80,  coins: 25, goods: { wheat: 12 } },
  cow:     { name: 'Cow',     house: 'barn', product: 'milk', time: 110, coins: 90, goods: { planks: 6, wheat: 15 } },
  sheep:   { name: 'Sheep',   house: 'barn', product: 'wool', time: 130, coins: 70, goods: { planks: 4, wheat: 12 } },
};

// ---------- villager skills ----------
export const SKILLS = ['woodcutting', 'mining', 'farming', 'building', 'cooking', 'studying', 'fishing', 'herding'];
export const SKILL_XP = [0, 200, 700, 1800, 4000];   // work-seconds needed for skill level 1..5
export const SKILL_BONUS = 0.08;                     // work speed per level above 1

// ---------- the Great Project ----------
export const PROJECT_STAGES = [
  { name: 'Fountain Plinth',     need: { wood: 400, stone: 240, clay: 160, planks: 60 },                          reward: { coins: 300, scrolls: 5, xp: 200 },   perk: 'Gathering yields +10%' },
  { name: 'Clock Tower',         need: { planks: 240, bricks: 160, stone: 300, flour: 60 },                       reward: { coins: 800, scrolls: 10, xp: 500 },  perk: '+1 housing in every village' },
  { name: 'Windmill of Friends', need: { planks: 400, bricks: 300, bread: 100, cheese: 40, wool: 80 },            reward: { coins: 1800, scrolls: 20, xp: 1000 }, perk: 'Soup feeds 25% longer' },
  { name: 'Lighthouse',          need: { bricks: 600, planks: 600, stone: 600, fish: 160, cloth: 60, soup: 120 },  reward: { coins: 3500, scrolls: 30, xp: 2000 }, perk: '+1 Valley order slot' },
  { name: 'Great Tree of Hearthvale', need: { pie: 80, jam: 100, cheese: 100, cloth: 120, apple: 300, bread: 200, scrolls: 120, planks: 600 }, reward: { coins: 7000, scrolls: 50, xp: 4000 }, perk: 'Crafted goods sell for +10%' },
];

// ---------- daily rewards ----------
export const DAILY_GAP_MS = 20 * 3600 * 1000;    // claim every 20 hours
export const DAILY_KEEP_MS = 44 * 3600 * 1000;   // miss this long and the streak restarts
export const DAILY_REWARDS = [
  { coins: 30 }, { coins: 40, wheat: 10 }, { coins: 60, planks: 6 }, { coins: 80, scrolls: 2 },
  { coins: 100, bread: 4 }, { coins: 130, scrolls: 3, cheese: 2 }, { coins: 200, scrolls: 5, cosmetic: true },
];
export const COSMETICS = ['straw_hat', 'ribbon', 'scarf', 'leaf_crown', 'golden_boots'];

// ---------- charm, visitors, world events ----------
export const VISITOR_NAMES = ['Pilgrim from Dunmere', 'Tinker from Oakreach', 'Bard from Saltmarsh', 'Traveller from Highfen', 'Baker from Quillbrook', 'Gardener from Ashvale'];
export const VISITOR_STAY = 150;          // seconds a visitor waits
export const FESTIVAL = { first: 420, every: 600, len: 90, xp: 0.25, decorOff: 0.5, orders: 2, orderBonus: 1.5 };
export const MERCHANT = { first: 200, every: 480, len: 180 };

// ---------- achievements: stat is read from P.stats (or a derived stat), title is shown by the name ----------
export const ACHIEVEMENTS = [
  { id: 'a_build1', cat: 'build', name: 'Foundations', desc: 'Have 5 buildings', stat: 'buildings', n: 5, reward: { coins: 30 } },
  { id: 'a_build2', cat: 'build', name: 'Hamlet', desc: 'Have 20 buildings', stat: 'buildings', n: 20, reward: { coins: 120 } },
  { id: 'a_build3', cat: 'build', name: 'Master Builder', desc: 'Have 40 buildings', stat: 'buildings', n: 40, reward: { coins: 300 }, title: 'Master Builder' },
  { id: 'a_bread',  cat: 'craft', name: 'Daily Bread', desc: 'Bake 10 bread', stat: 'c_bread', n: 10, reward: { coins: 60 } },
  { id: 'a_cheese', cat: 'craft', name: 'Say Cheese', desc: 'Make 15 cheese', stat: 'c_cheese', n: 15, reward: { coins: 100 }, title: 'Cheesemonger' },
  { id: 'a_jam',    cat: 'craft', name: 'Preserved', desc: 'Make 15 jam', stat: 'c_jam', n: 15, reward: { coins: 120 } },
  { id: 'a_cloth',  cat: 'craft', name: 'Fine Threads', desc: 'Weave 15 cloth', stat: 'c_cloth', n: 15, reward: { coins: 150 }, title: 'Weaver' },
  { id: 'a_pie',    cat: 'craft', name: 'Pie Time', desc: 'Bake 10 pies', stat: 'c_pie', n: 10, reward: { coins: 250, scrolls: 3 }, title: 'Pie Maker' },
  { id: 'a_wood',   cat: 'gather', name: 'Lumberjack', desc: 'Gather 300 wood', stat: 'wood', n: 300, reward: { coins: 60 }, title: 'Lumberjack' },
  { id: 'a_stone',  cat: 'gather', name: 'Stonebreaker', desc: 'Gather 200 stone', stat: 'stone', n: 200, reward: { coins: 60 } },
  { id: 'a_wheat',  cat: 'gather', name: 'Breadbasket', desc: 'Harvest 400 wheat', stat: 'wheat', n: 400, reward: { coins: 80 }, title: 'Farmer' },
  { id: 'a_apple',  cat: 'gather', name: 'An Apple a Day', desc: 'Pick 100 apples', stat: 'apple', n: 100, reward: { coins: 90 } },
  { id: 'a_fish',   cat: 'gather', name: 'Gone Fishing', desc: 'Catch 40 fish', stat: 'fish', n: 40, reward: { coins: 100 }, title: 'Angler' },
  { id: 'a_gift1',  cat: 'gift', name: 'Good Neighbour', desc: 'Gift 20 goods', stat: 'gifted', n: 20, reward: { coins: 40 } },
  { id: 'a_gift2',  cat: 'gift', name: 'Open Hands', desc: 'Gift 200 goods', stat: 'gifted', n: 200, reward: { coins: 200 }, title: 'Generous' },
  { id: 'a_proj1',  cat: 'project', name: 'Cornerstone', desc: 'Give 100 to the Great Project', stat: 'project', n: 100, reward: { coins: 80, scrolls: 1 } },
  { id: 'a_proj2',  cat: 'project', name: 'Pillar of the Valley', desc: 'Give 1500 to the Great Project', stat: 'project', n: 1500, reward: { coins: 400, scrolls: 5 }, title: 'Pillar of the Valley' },
  { id: 'a_pet',    cat: 'animals', name: 'First Friend', desc: 'Welcome an animal', stat: 'animals', n: 1, reward: { coins: 30 } },
  { id: 'a_herd',   cat: 'animals', name: 'Full Barnyard', desc: 'Welcome 10 animals', stat: 'animals', n: 10, reward: { coins: 200 }, title: 'Shepherd' },
  { id: 'a_eggs',   cat: 'animals', name: 'Egg Collector', desc: 'Collect 60 eggs', stat: 'egg', n: 60, reward: { coins: 90 } },
  { id: 'a_charm1', cat: 'charm', name: 'Pretty Pathways', desc: 'Reach 25 charm', stat: 'charm', n: 25, reward: { coins: 50 } },
  { id: 'a_charm2', cat: 'charm', name: 'Garden Party', desc: 'Reach 100 charm', stat: 'charm', n: 100, reward: { coins: 200 }, title: 'Gardener' },
  { id: 'a_charm3', cat: 'charm', name: 'Storybook Village', desc: 'Reach 250 charm', stat: 'charm', n: 250, reward: { coins: 600, scrolls: 5 }, title: 'Charming' },
  { id: 'a_lvl5',   cat: 'level', name: 'Settled In', desc: 'Reach village level 5', stat: 'level', n: 5, reward: { coins: 60 } },
  { id: 'a_lvl10',  cat: 'level', name: 'Thriving', desc: 'Reach village level 10', stat: 'level', n: 10, reward: { coins: 250 }, title: 'Mayor' },
  { id: 'a_lvl15',  cat: 'level', name: 'Legend', desc: 'Reach village level 15', stat: 'level', n: 15, reward: { coins: 800, scrolls: 8 }, title: 'Elder' },
  { id: 'a_order',  cat: 'valley', name: 'Team Player', desc: 'Help finish 10 Valley orders', stat: 'orders', n: 10, reward: { coins: 150 }, title: 'Team Player' },
  { id: 'a_visit',  cat: 'valley', name: 'Hospitable', desc: 'Serve 5 visitors', stat: 'visitors', n: 5, reward: { coins: 120 }, title: 'Host' },
  { id: 'a_trade',  cat: 'valley', name: 'Haggler', desc: 'Trade with the merchant 5 times', stat: 'trades', n: 5, reward: { scrolls: 4 }, title: 'Haggler' },
  { id: 'a_daily3', cat: 'valley', name: 'Regular', desc: 'Reach a 3 day streak', stat: 'streak', n: 3, reward: { coins: 80 } },
  { id: 'a_daily7', cat: 'valley', name: 'Dedicated', desc: 'Reach a 7 day streak', stat: 'streak', n: 7, reward: { coins: 300, scrolls: 3 }, title: 'Dedicated' },
  { id: 'a_skill',  cat: 'valley', name: 'Expert Hands', desc: 'Train a villager skill to level 5', stat: 'skill5', n: 1, reward: { coins: 150 }, title: 'Expert' },
  { id: 'a_crowd',  cat: 'valley', name: 'Busy Village', desc: 'Have 8 villagers', stat: 'villagers', n: 8, reward: { coins: 200 } },
];
