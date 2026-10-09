import { TUNING } from '../config';
import type { WorkKind } from './creatures';
import type { Cost, ItemId } from './items';

export type StationId = 'hand' | 'workbench' | 'anvil' | 'kitchen' | 'loom' | 'alchemy' | 'altar' | 'riftforge';
export type ProcId = 'furnace' | 'sawmill' | 'millstone' | 'assembler';
export type BuildCat = 'craft' | 'industry' | 'power' | 'logistics' | 'farm' | 'storage' | 'light' | 'home' | 'defense' | 'decor' | 'special';

export const STATION_NAMES: Record<StationId | ProcId, string> = {
    hand: 'By hand', workbench: 'Workbench', anvil: 'Anvil', kitchen: 'Kitchen', loom: 'Loom', alchemy: 'Alchemy Table', altar: 'Boss Altar', riftforge: 'Rift Forge',
    furnace: 'Furnace', sawmill: 'Sawmill', millstone: 'Millstone', assembler: 'Assembler',
};

/** Workshops where a creature can work through an order (the machines run on their own and just need supplying). */
export const ORDER_STATIONS: StationId[] = ['workbench', 'anvil', 'kitchen', 'loom', 'alchemy'];

export const BUILD_CATS: { id: BuildCat; name: string; icon: string }[] = [
    { id: 'craft', name: 'Crafting', icon: 'workbench' },
    { id: 'industry', name: 'Industry', icon: 'furnace' },
    { id: 'logistics', name: 'Logistics', icon: 'belt' },
    { id: 'power', name: 'Power', icon: 'windturbine' },
    { id: 'farm', name: 'Farming', icon: 'bed' },
    { id: 'storage', name: 'Storage', icon: 'chest_b' },
    { id: 'light', name: 'Light', icon: 'lantern' },
    { id: 'home', name: 'Floors & walls', icon: 'floor_plank' },
    { id: 'defense', name: 'Defense', icon: 'tower_archer' },
    { id: 'decor', name: 'Decor', icon: 'fence' },
    { id: 'special', name: 'Special', icon: 'market' },
];

export interface BuildingDef {
    name: string;
    tex: string;
    size: [number, number];       // footprint in tiles (w, h)
    cost: Cost;
    desc: string;
    cat: BuildCat;
    req?: string;                 // unlock token granted by a skill
    station?: StationId;          // crafting station provided
    proc?: ProcId;                // timed processor (furnace…)
    fuel?: boolean;               // processor burns fuel
    storage?: number;             // item capacity (chests)
    light?: number;               // light radius in px at night
    solid?: boolean;              // blocks movement (default true)
    wall?: boolean;               // a wall piece: joins up with its neighbours (picks its own frame)
    roof?: boolean;               // a roof piece: hangs over the tile (over floors and furniture, not instead of them) and fades when you are underneath
    gate?: boolean;               // you walk through it, monsters cannot (a doorway)
    work?: WorkKind;              // the skill a creature needs to run it (furnaces, workshops and machines)
    walk?: boolean;               // takes its tile (nothing else can be built there) but you can walk over it: garden beds, doorways
    use?: number;                 // power drawn while working (units)
    gen?: number;                 // power produced (units)
    solar?: boolean;              // its output follows the sun
    store?: number;               // power it can hold (units x seconds): batteries
    dir?: boolean;                // has a facing (belts, inserters, drills)
    pole?: boolean;               // connects machines to the power grid
    pets?: number;                // creature slots (dens)
    floor?: boolean;              // drawn under everything, walkable, one per tile
    hidden?: boolean;             // never offered in the build menu and never built by a player (the world makes it)
    grave?: boolean;              // a dropped backpack: anyone can take things out of it, nothing goes in, and it is gone when it is empty
    hp?: number;                  // a defense piece (walls, doorways, towers): what a raider must break (sim/defense.ts); it mends at dawn
    tower?: 'archer' | 'ballista' | 'tesla';   // shoots monsters in range (TUNING.blight has the numbers)
    spike?: boolean;              // a Spike Trap: a floor piece that bites the monsters walking over it
}

/** Belts and the things that behave like belts: they hold three items and pass them on. */
export const isBeltLike = (kind: string) => kind === 'belt' || kind === 'splitter' || kind === 'sorter' || kind === 'tunnel' || kind === 'tunnelx';

export type BuildingKind =
    | 'workbench' | 'bed' | 'campfire' | 'chest' | 'market' | 'furnace' | 'sawmill' | 'millstone'
    | 'anvil' | 'kitchen' | 'loom' | 'alchemy' | 'lantern' | 'fence' | 'path' | 'planks' | 'bench' | 'mill'
    | 'belt' | 'splitter' | 'sorter' | 'tunnel' | 'tunnelx' | 'solar' | 'battery' | 'inserter' | 'drill' | 'pole' | 'windturbine' | 'coalgen' | 'assembler' | 'steelchest' | 'uberchest' | 'altar' | 'den' | 'waystone' | 'dock' | 'riftforge' | 'hatchery' | 'fortune'
    | 'hedge' | 'flowerbed' | 'statue' | 'banner' | 'table' | 'signpost' | 'lamppost' | 'fountain' | 'stonewall' | 'barrel' | 'haybale' | 'scarecrow' | 'mailbox'
    | 'brickfloor' | 'carpet' | 'slatefloor'
    | 'wall_wood' | 'wall_stone' | 'wall_brick' | 'wall_window' | 'doorway' | 'roof_thatch' | 'roof_tile' | 'roof_slate'
    | 'lostpack' | 'mineshaft' | 'mineladder'
    | 'chute' | 'weathervane'
    | 'sleepbed'
    | 'wall_fort' | 'tower_archer' | 'ballista' | 'tesla' | 'spike';

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
    workbench: { name: 'Workbench',   tex: 'workbench', size: [1, 1], cost: { wood: 6 }, cat: 'craft', station: 'workbench', work: 'make', desc: 'Saw planks, craft bows and simple tools.' },
    anvil:     { name: 'Anvil',       tex: 'anvil',     size: [1, 1], cost: { ironbar: 3, stone: 6, wood: 4 }, cat: 'craft', station: 'anvil', work: 'craft', req: 'smithing', desc: 'Hammer metal into picks, weapons, armor and gears.' },
    kitchen:   { name: 'Kitchen',     tex: 'kitchen',   size: [1, 1], cost: { brick: 4, plank: 4, stone: 6 }, cat: 'craft', station: 'kitchen', work: 'craft', req: 'cooking', desc: 'Cook meals that heal, power you up and keep you going.' },
    loom:      { name: 'Loom',        tex: 'loom',      size: [1, 1], cost: { plank: 8, rope: 4 }, cat: 'craft', station: 'loom', work: 'make', req: 'weaving', desc: 'Weave cotton into cloth, clothes and trinkets.' },
    alchemy:   { name: 'Alchemy Table', tex: 'alchemy', size: [1, 1], cost: { glass: 4, plank: 6, brick: 4 }, cat: 'craft', station: 'alchemy', work: 'make', req: 'alchemy', desc: 'Brew potions and bind charms.' },

    furnace:   { name: 'Furnace',     tex: 'furnace',   size: [1, 1], cost: { stone: 12 }, cat: 'industry', proc: 'furnace', work: 'craft', fuel: true, desc: 'Smelts ore, bakes bricks, melts glass. Burns coal, wood or peat.' },
    sawmill:   { name: 'Sawmill',     tex: 'sawmill',   size: [2, 1], cost: { wood: 14, stone: 10, ironbar: 2 }, cat: 'industry', proc: 'sawmill', work: 'make', desc: 'Turns logs into twice as many planks.' },
    millstone: { name: 'Millstone',   tex: 'millstone', size: [1, 1], cost: { stone: 14, plank: 4 }, cat: 'industry', proc: 'millstone', work: 'make', desc: 'Grinds wheat into flour.' },

    belt:      { name: 'Conveyor Belt', tex: 'belt', size: [1, 1], cost: { ironbar: 1 }, cat: 'logistics', req: 'logistics', floor: true, solid: false, dir: true, desc: 'Carries items along. R rotates it; drag to lay a line.' },
    splitter:  { name: 'Splitter',   tex: 'splitter', size: [1, 1], cost: { ironbar: 3, gear: 2 }, cat: 'logistics', req: 'logistics', floor: true, solid: false, dir: true, desc: 'Shares a belt out three ways (forward, left, right), taking turns. A side with nothing there is skipped. R rotates it.' },
    sorter:    { name: 'Sorter',     tex: 'sorter',   size: [1, 1], cost: { ironbar: 3, wire: 2, circuit: 1 }, cat: 'logistics', req: 'logistics', floor: true, solid: false, dir: true, desc: 'Items that match its filter carry straight on; everything else turns left or right. Interact to choose the filter.' },
    tunnel:    { name: 'Tunnel Entrance', tex: 'tunnel', size: [1, 1], cost: { ironbar: 4, gear: 2 }, cat: 'logistics', req: 'logistics', floor: true, solid: false, dir: true, desc: 'Dives a belt underground. Items re-emerge at the Tunnel Exit up to 6 tiles ahead, passing under anything in between. R rotates it.' },
    tunnelx:   { name: 'Tunnel Exit',   tex: 'tunnelx', size: [1, 1], cost: { ironbar: 4, gear: 2 }, cat: 'logistics', req: 'logistics', floor: true, solid: false, dir: true, desc: 'Where a belt comes back up. Face it the same way as its Tunnel Entrance, in line and up to 6 tiles away.' },
    inserter:  { name: 'Inserter',    tex: 'inserter', size: [1, 1], cost: { gear: 2, ironbar: 2, wire: 2 }, cat: 'logistics', req: 'logistics', dir: true, use: 3, desc: 'Moves items from the tile behind it to the tile in front: chests, machines, belts.' },
    drill:     { name: 'Mining Drill', tex: 'drill', size: [2, 2], cost: { gear: 6, ironbar: 8, circuit: 3, stone: 10 }, cat: 'industry', req: 'drills', dir: true, use: 20, desc: 'Mines the ore veins beneath it, forever. Outputs in front.' },
    assembler: { name: 'Assembler',   tex: 'assembler', size: [2, 2], cost: { circuit: 6, gear: 8, ironbar: 10, glass: 4 }, cat: 'industry', req: 'assembly', proc: 'assembler', work: 'make', use: 30, desc: 'Builds gears, wire, circuits and more from whatever you feed it.' },
    pole:      { name: 'Power Pole',  tex: 'pole', size: [1, 1], cost: { plank: 2, wire: 2 }, cat: 'power', req: 'power', pole: true, desc: 'Wires up machines within 3 tiles and links to poles within 7.' },
    windturbine: { name: 'Wind Turbine', tex: 'windturbine', size: [2, 2], cost: { gear: 4, ironbar: 6, plank: 6, wire: 4 }, cat: 'power', req: 'power', gen: 40, desc: 'Free power, as much as the wind gives.' },
    solar:     { name: 'Solar Panel', tex: 'solar', size: [2, 2], cost: { glass: 8, circuit: 3, ironbar: 6 }, cat: 'power', req: 'assembly', gen: 30, solar: true, desc: 'Free power in daylight, nothing at night: pair it with batteries.' },
    battery:   { name: 'Battery', tex: 'battery', size: [1, 1], cost: { ironbar: 6, copperbar: 8, circuit: 3 }, cat: 'power', req: 'assembly', store: 1500, desc: 'Stores spare power and gives it back when the grid runs short.' },
    coalgen:   { name: 'Coal Generator', tex: 'coalgen', size: [2, 2], cost: { stone: 20, ironbar: 6, gear: 4, brick: 6 }, cat: 'power', req: 'power', fuel: true, gen: 60, desc: 'Burns coal, wood or peat for steady power.' },
    chute:     { name: 'Export Chute', tex: 'chute', size: [1, 1], cost: { ironbar: 3, plank: 4, gear: 1 }, cat: 'logistics', req: 'logistics', desc: `Sells whatever a belt, inserter or drill drops in, for coins straight into the pocket of whoever built it: ${Math.round(TUNING.chuteCut * 100)}% of the market price. Never gear, tools, pods or crates. Interact to sell only one item.` },
    chest:     { name: 'Chest',       tex: 'chest_b',   size: [1, 1], cost: { wood: 8 }, cat: 'storage', storage: 400, desc: 'Stores up to 400 items. Everyone on the farm can use it.' },
    uberchest: { name: 'Uber Chest', tex: 'uberchest', size: [1, 1], cost: { steel: 8, goldbar: 2, crystal: 2, plank: 6 }, cat: 'storage', req: 'uberchest', storage: 800, light: 18, desc: 'Every Uber Chest in the world opens the same store, shared by the whole farm. Each one you build adds 800 room.' },
    steelchest: { name: 'Steel Chest', tex: 'steelchest', size: [1, 1], cost: { steel: 6, plank: 4 }, cat: 'storage', req: 'logistics', storage: 1500, desc: 'Stores up to 1500 items. Inserters can load and unload it.' },

    bed:       { name: 'Garden Bed',  tex: 'bed',       size: [1, 1], cost: { wood: 3 }, cat: 'farm', walk: true, desc: 'Plant seeds, grow crops. You can walk right over it.' },

    campfire:  { name: 'Campfire',    tex: 'campfire',  size: [1, 1], cost: { wood: 5, stone: 2 }, cat: 'light', light: 70, desc: 'Monsters keep away. Heals you at night.' },
    lantern:   { name: 'Lantern',     tex: 'lantern',   size: [1, 1], cost: { plank: 2, glass: 1 }, cat: 'light', light: 54, desc: 'A warm pool of light after dark.' },

    fence:     { name: 'Wooden Fence', tex: 'fence',    size: [1, 1], cost: { plank: 1 }, cat: 'decor', desc: 'Keeps things where they belong.' },
    bench:     { name: 'Bench',       tex: 'bench',     size: [1, 1], cost: { plank: 3 }, cat: 'decor', desc: 'A nice place to look at your farm.' },

    hedge:     { name: 'Hedge',        tex: 'hedge',     size: [1, 1], cost: { fiber: 2, wood: 1 }, cat: 'decor', desc: 'A leafy little wall.' },
    flowerbed: { name: 'Flower Planter', tex: 'flowerbed', size: [1, 1], cost: { plank: 2, fiber: 2 }, cat: 'decor', desc: 'Pretty, and it smells nice too.' },
    stonewall: { name: 'Stone Block',  tex: 'stonewall', size: [1, 1], cost: { stone: 3 }, cat: 'decor', desc: 'Solid and neat.' },
    barrel:    { name: 'Barrel',       tex: 'barrel',    size: [1, 1], cost: { plank: 3 }, cat: 'decor', desc: 'Nobody remembers what is in it.' },
    haybale:   { name: 'Hay Bale',     tex: 'haybale',   size: [1, 1], cost: { wheat: 3 }, cat: 'decor', desc: 'Farm-fresh and very sittable.' },
    table:     { name: 'Table',        tex: 'table',     size: [2, 1], cost: { plank: 4 }, cat: 'decor', desc: 'A potluck table: friends set out up to four dishes with a buff, and whoever uses it eats a portion of every one at once.' },
    mailbox:   { name: 'Mailbox',      tex: 'mailbox',   size: [1, 1], cost: { wood: 6, plank: 2 }, cat: 'storage', desc: 'Friends can leave you parcels and notes here, and the island folk send a postcard every morning. A raised flag means post is waiting.' },
    signpost:  { name: 'Signpost',     tex: 'signpost',  size: [1, 1], cost: { plank: 2 }, cat: 'decor', desc: 'Points somewhere. Probably.' },
    banner:    { name: 'Banner',       tex: 'banner',    size: [1, 1], cost: { plank: 2, cloth: 1 }, cat: 'decor', desc: 'Proudly flapping in the breeze.' },
    weathervane: { name: 'Weather Vane', tex: 'weathervane', size: [1, 1], cost: { plank: 3, ironbar: 1 }, cat: 'decor', desc: 'Turns with the wind, and the little picture over it is tomorrow\u2019s weather. Interact to read the next three days: rain, fog and the night to come.' },
    scarecrow: { name: 'Scarecrow',    tex: 'scarecrow', size: [1, 1], cost: { wood: 4, cloth: 1, wheat: 2 }, cat: 'decor', desc: 'Keeps an eye on the fields.' },
    statue:    { name: 'Sprout Statue', tex: 'statue',   size: [1, 1], cost: { stone: 24, brick: 2 }, cat: 'decor', desc: 'A monument to the humble turnip.' },
    fountain:  { name: 'Fountain',     tex: 'fountain',  size: [2, 2], cost: { stone: 30, brick: 6, glass: 2 }, cat: 'decor', light: 26, desc: 'The centrepiece of any farm worth bragging about.' },
    lamppost:  { name: 'Lamp Post',    tex: 'lamppost',  size: [1, 1], cost: { ironbar: 2, glass: 1 }, cat: 'light', light: 58, desc: 'A tall, steady light for your paths.' },

    // ── a house: lay a floor, raise walls with a doorway, put a roof on it (the Floors & walls tab) ──
    planks:    { name: 'Plank Floor', tex: 'floor_plank', size: [1, 1], cost: { plank: 1 }, cat: 'home', floor: true, solid: false, desc: 'Walkable wooden flooring. Nothing spawns on a floor.' },
    path:      { name: 'Stone Path',  tex: 'floor_path', size: [1, 1], cost: { stone: 1 }, cat: 'home', floor: true, solid: false, desc: 'Walkable stone flooring. Nothing spawns on a floor.' },
    brickfloor: { name: 'Brick Floor', tex: 'floor_brick', size: [1, 1], cost: { brick: 1 }, cat: 'home', floor: true, solid: false, desc: 'Warm red brick underfoot. Nothing spawns on a floor.' },
    slatefloor: { name: 'Slate Floor', tex: 'floor_slate', size: [1, 1], cost: { stone: 1 }, cat: 'home', floor: true, solid: false, desc: 'Tidy grey tiles. Nothing spawns on a floor.' },
    carpet:    { name: 'Carpet',       tex: 'floor_carpet', size: [1, 1], cost: { cloth: 1 }, cat: 'home', floor: true, solid: false, desc: 'Plush and a little bit fancy. Nothing spawns on a floor.' },
    wall_wood:   { name: 'Wooden Wall',  tex: 'wall_wood',  size: [1, 1], cost: { plank: 2 }, cat: 'home', wall: true, hp: TUNING.blight.hp.wood, desc: 'Joins up with the walls next to it. Drag to lay a line. Monsters cannot get through.' },
    wall_stone:  { name: 'Stone Wall',   tex: 'wall_stone', size: [1, 1], cost: { stone: 3 }, cat: 'home', wall: true, hp: TUNING.blight.hp.stone, desc: 'Grey stone blocks. Joins up with its neighbours. Tougher than wood when raiders come.' },
    wall_brick:  { name: 'Brick Wall',   tex: 'wall_brick', size: [1, 1], cost: { brick: 2 }, cat: 'home', wall: true, hp: TUNING.blight.hp.brick, desc: 'Warm red brick. Joins up with its neighbours. Stands up to raiders better than stone.' },
    wall_window: { name: 'Window Wall',  tex: 'wall_window', size: [1, 1], cost: { plank: 2, glass: 1 }, cat: 'home', wall: true, hp: TUNING.blight.hp.wood, desc: 'A wall with a window to look out of. Place it in a straight run.' },
    doorway:     { name: 'Doorway',      tex: 'doorway',    size: [1, 1], cost: { plank: 3 }, cat: 'home', walk: true, gate: true, dir: true, hp: TUNING.blight.hp.doorway, desc: 'You walk straight through; monsters cannot. R turns it to fit a wall running up and down.' },
    roof_thatch: { name: 'Thatch Roof',  tex: 'roof_thatch', size: [1, 1], cost: { fiber: 3, plank: 1 }, cat: 'home', roof: true, desc: 'Goes over a floor and furniture. Fades away when you stand underneath. Drag to cover a room.' },
    roof_tile:   { name: 'Tile Roof',    tex: 'roof_tile',  size: [1, 1], cost: { brick: 1, plank: 1 }, cat: 'home', roof: true, desc: 'Terracotta tiles. Goes over a floor; fades when you are underneath.' },
    roof_slate:  { name: 'Slate Roof',   tex: 'roof_slate', size: [1, 1], cost: { stone: 2, plank: 1 }, cat: 'home', roof: true, desc: 'Grey slate. Goes over a floor; fades when you are underneath.' },
    sleepbed:    { name: 'Bed',          tex: 'sleepbed',   size: [1, 2], cost: { plank: 4, wood: 2 }, cat: 'craft', desc: 'Press E on it to make it your home: after a fall you wake up here instead. One spot each, a new bed moves it. Build one by every outpost.' },

    // ── base defense (the Defense tab): raids come from the Blight nests at night (sim/raid.ts, sim/defense.ts) ──
    wall_fort:   { name: 'Fortified Wall', tex: 'wall_fort', size: [1, 1], cost: { ironbar: 2, stone: 4 }, cat: 'defense', req: 'towers', wall: true, hp: TUNING.blight.hp.fortified, desc: 'Stone bound in iron: the toughest wall there is. Joins up with other walls and doorways. Raiders take a long time to break it.' },
    tower_archer: { name: 'Archer Tower', tex: 'tower_archer', size: [1, 1], cost: { plank: 8, rope: 4, stone: 10 }, cat: 'defense', req: 'towers', tower: 'archer', hp: TUNING.blight.hp.archer, light: 20, desc: `Shoots an arrow at the nearest monster within ${Math.round(TUNING.blight.archer.range / 16)} tiles every ${TUNING.blight.archer.every} seconds. Its kills are yours. Never shoots creatures or farmers.` },
    spike:       { name: 'Spike Trap',    tex: 'spike',      size: [1, 1], cost: { ironbar: 1, plank: 1 }, cat: 'defense', req: 'towers', floor: true, solid: false, spike: true, desc: 'A floor of iron spikes: it hurts every monster that walks over it. You walk over it safely. Drag to lay a line in front of your walls.' },
    ballista:    { name: 'Ballista',      tex: 'ballista',   size: [1, 1], cost: { ironbar: 6, gear: 4, plank: 6, blightcore: 1 }, cat: 'defense', req: 'towers2', tower: 'ballista', hp: TUNING.blight.hp.ballista, desc: `A heavy bolt every ${TUNING.blight.ballista.every} seconds at a monster up to ${Math.round(TUNING.blight.ballista.range / 16)} tiles away. Slow, but it hits very hard.` },
    tesla:       { name: 'Tesla Coil',    tex: 'tesla',      size: [1, 1], cost: { wire: 6, circuit: 2, ironbar: 4, blightcore: 1 }, cat: 'defense', req: 'towers2', tower: 'tesla', hp: TUNING.blight.hp.tesla, use: 15, desc: `Needs power (a pole within 3 tiles). Zaps a monster within ${Math.round(TUNING.blight.tesla.range / 16)} tiles and the lightning leaps on to ${TUNING.blight.tesla.chain - 1} more near it.` },

    market:    { name: 'Market Stall', tex: 'market',   size: [2, 1], cost: { wood: 6, stone: 4 }, cat: 'special', desc: 'Sell your goods for coins.' },
    altar:     { name: 'Boss Altar', tex: 'altar', size: [2, 2], cost: { stone: 30, brick: 10, ironbar: 4 }, cat: 'special', req: 'altar', station: 'altar', light: 60, desc: 'Craft sigils and call the island\u2019s bosses. Bring friends.' },
    dock:      { name: 'Expedition Dock', tex: 'dock', size: [3, 2], cost: { plank: 24, rope: 8, ironbar: 6, goldbar: 2 }, cat: 'special', req: 'expedition', light: 40, desc: 'Launch a party of up to four into the rifts: waves, boons and a guardian. Build it by the water.' },
    riftforge: { name: 'Rift Forge', tex: 'riftforge', size: [2, 1], cost: { stone: 20, ironbar: 8, crystal: 2 }, cat: 'craft', req: 'expedition', station: 'riftforge', light: 56, desc: 'Turns rift shards and cores into the finest weapons and armor there is.' },
    hatchery:  { name: 'Hatchery', tex: 'hatchery', size: [2, 2], cost: { plank: 16, brick: 6, rope: 4, goldbar: 1 }, cat: 'special', req: 'breeding', light: 36, desc: 'Put two creatures in with a few treats and, after a while, an egg. Children inherit the best of both.' },
    fortune:   { name: 'Fortune Wheel', tex: 'fortune', size: [2, 2], cost: { plank: 20, cloth: 4, goldbar: 2, coin: 60 }, cat: 'special', light: 56, desc: 'Madame Fortuna\u2019s wheel. One free spin every day, more for coins: prizes, crates and a jackpot. Press your luck for double or nothing.' },
    den:       { name: 'Creature Den', tex: 'den', size: [2, 2], cost: { wood: 30, plank: 10, rope: 4 }, cat: 'special', req: 'taming', storage: 240, pets: 3, desc: 'Home for three creatures that work the land around it and stash what they find.' },
    waystone:  { name: 'Waystone', tex: 'waystone', size: [1, 1], cost: { stone: 24, brick: 6, goldbar: 1 }, cat: 'special', req: 'waystone', light: 48, desc: 'Build two or more and step between them instantly.' },
    mineshaft: { name: 'Mine Shaft', tex: 'mineshaft', size: [2, 2], cost: { plank: 16, stone: 20, ironbar: 6, rope: 4 }, cat: 'special', req: 'mineshaft', light: 40, desc: 'A way down to the caves under the world: rock to dig, ore in it, treasure and things in the dark. Press E to climb down. Bring a lantern, and friends.' },
    mineladder: { name: 'Ladder', tex: 'mineladder', size: [1, 1], cost: {}, cat: 'special', hidden: true, walk: true, light: 48, desc: 'The way back up to the shaft.' },
    lostpack:  { name: 'Lost Backpack', tex: 'lostpack', size: [1, 1], cost: {}, cat: 'special', hidden: true, grave: true, walk: true, light: 26, desc: 'Everything its owner was carrying when they fell. Take what you need.' },
    mill:      { name: 'Golden Windmill', tex: 'mill', size: [2, 2], cost: { wood: 60, stone: 50, ironbar: 12, goldbar: 6, pumpkin: 8, coin: 120 }, cat: 'special', desc: 'A wonder of the farm. Raise it, and everyone will know.' },
};

export const BUILD_ORDER = (Object.keys(BUILDINGS) as BuildingKind[]).filter((k) => !BUILDINGS[k].hidden);

// ── crops ──────────────────────────────────────────────────────────────────
export interface CropDef { name: string; out: ItemId; stageSecs: number; yield: [number, number]; xp: number; seedBack: number; tex: string }
export const CROPS: Partial<Record<ItemId, CropDef>> = {
    seed_wheat:   { name: 'Wheat',   out: 'wheat',   stageSecs: 7,  yield: [2, 3], xp: 3, seedBack: 0.5, tex: 'crop_wheat' },
    seed_carrot:  { name: 'Carrot',  out: 'carrot',  stageSecs: 10, yield: [2, 3], xp: 4, seedBack: 0.45, tex: 'crop_carrot' },
    seed_pumpkin: { name: 'Pumpkin', out: 'pumpkin', stageSecs: 14, yield: [1, 2], xp: 6, seedBack: 0.5, tex: 'crop_pumpkin' },
    seed_cotton:  { name: 'Cotton',  out: 'cotton',  stageSecs: 12, yield: [2, 4], xp: 5, seedBack: 0.45, tex: 'crop_cotton' },
    seed_beet:    { name: 'Beet',    out: 'beet',    stageSecs: 8,  yield: [2, 3], xp: 3, seedBack: 0.5,  tex: 'crop_beet' },
    seed_corn:    { name: 'Corn',    out: 'corn',    stageSecs: 10, yield: [2, 4], xp: 4, seedBack: 0.45, tex: 'crop_corn' },
    seed_pepper:  { name: 'Pepper',  out: 'pepper',  stageSecs: 11, yield: [2, 3], xp: 5, seedBack: 0.45, tex: 'crop_pepper' },
    seed_flax:    { name: 'Flax',    out: 'flax',    stageSecs: 12, yield: [3, 5], xp: 5, seedBack: 0.45, tex: 'crop_flax' },
    seed_melon:   { name: 'Melon',   out: 'melon',   stageSecs: 16, yield: [1, 2], xp: 8, seedBack: 0.5,  tex: 'crop_melon' },
};
export const SEED_IDS = Object.keys(CROPS) as ItemId[];

