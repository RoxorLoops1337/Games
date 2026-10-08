// The journal: a story of sixteen chapters that walks you through the whole game, daily
// bounties for short-term goals, production goals the whole farm contributes to, and
// medals for the long haul. Progress is tracked with plain counters (sim/quests.ts).

import type { ItemId } from './items';

export interface Reward { coin?: number; xp?: number; points?: number; items?: [ItemId, number][] }

/** What an objective counts. `key` names a counter (see sim/quests.ts) or a live state like `level`. */
export interface Objective {
    text: string;
    key: string;
    n: number;
    how?: string;             // how to do it, shown when you hover the objective
    opt?: boolean;            // optional: does not block the chapter
    state?: boolean;          // read live from the player instead of a counter (level, plots…)
}

interface Chapter {
    id: string;
    title: string;
    blurb: string;
    objectives: Objective[];
    reward: Reward;
}

/**
 * The third argument is the "how do I do this?" hint shown when you hover an objective. `{fish}` stands for the
 * player's fishing key (it follows the keyboard layout).
 */
export const o = (text: string, key: string, n: number, how: string, extra: Partial<Objective> = {}): Objective => ({ text, key, n, how, ...extra });

export const CHAPTERS: Chapter[] = [
    {
        id: 'roots', title: 'Fresh Soil', blurb: 'A small island, a flint pick and a lot of trees. Everyone starts here.',
        objectives: [
            o('Chop 8 trees', 'harvest:tree', 8, 'Stand next to a tree and hold Space (or the mouse button). Your pick breaks it and the wood flies to you.'),
            o('Build a Workbench', 'build:workbench', 1, 'Press B for the build menu, pick the Workbench (6 wood) and click on free ground to place it.'),
            o('Craft 4 planks', 'craft:plank', 4, 'Stand next to your Workbench, press C, and craft Planks from wood.'),
            o('Build a Chest', 'build:chest', 1, 'Press B, pick the Chest (8 wood) and place it. Walk up and press E to put things in; everyone on the farm can use it.'),
            o('Reach level 3', 'level', 3, 'Almost everything earns XP: chopping, breaking rocks, crafting, building, fighting. Keep at it.', { state: true }),
        ],
        reward: { coin: 40, points: 1, items: [['potion_heal', 2]] },
    },
    {
        id: 'rest', title: 'A Place to Rest', blurb: 'Night brings monsters. A fire, a garden and a bit more land make a home.',
        objectives: [
            o('Build a Campfire', 'build:campfire', 1, 'Press B, open the Light tab, pick the Campfire (5 wood, 2 stone) and place it. Monsters will not come close, and it heals you at night.'),
            o('Build a Garden Bed', 'build:bed', 1, 'Press B, open the Farm tab, pick the Garden Bed (3 wood) and place it.'),
            o('Harvest 3 crops', 'crop', 3, 'Break wildflowers for seeds, then walk up to your bed and press E to plant. When the plant is fully grown, press E again to harvest.'),
            o('Buy a new plot of land', 'buy', 1, 'Walk to the edge of your island: light squares out at sea are for sale. Stand at the shore facing one and press E.'),
            o('Survive a night', 'night', 1, 'When the sky darkens, monsters wander out. Stay by your campfire, fight back when they come close, and live until dawn.'),
        ],
        reward: { coin: 70, points: 1, items: [['seed_wheat', 6], ['seed_carrot', 4]] },
    },
    {
        id: 'metal', title: 'Hot Metal', blurb: 'Stone, fire and patience: your first metal tools.',
        objectives: [
            o('Build a Furnace', 'build:furnace', 1, 'Press B, open the Industry tab, pick the Furnace (12 stone) and place it. Break boulders for stone.'),
            o('Smelt 6 iron bars', 'make:ironbar', 6, 'Mine iron ore (the dark metal nodes), then press E at the Furnace, put the ore in and give it coal or wood as fuel. Collect the bars when done.'),
            o('Learn 3 skills (K)', 'skills', 3, 'Press K. Every level gives a skill point: click a glowing skill next to the hub to learn it.', { state: true }),
            o('Reach level 6', 'level', 6, 'Keep chopping, mining, crafting and fighting: it all earns XP.', { state: true }),
            o('Break 8 boulders', 'harvest:rock', 8, 'Hold Space next to a grey boulder. Stone flies to you; a better pick is faster.'),
        ],
        reward: { coin: 100, points: 2, items: [['ironbar', 6], ['plank', 10]] },
    },
    {
        id: 'reach', title: 'Reaching Out', blurb: 'Your friends are somewhere out there. Buy land towards them, and trade along the way.',
        objectives: [
            o('Own 6 plots', 'plots', 6, 'Keep raising new land: stand at the shore facing a light square and press E. Prices go up with every plot you buy.', { state: true }),
            o('Build a Market Stall', 'build:market', 1, 'Press B, open the Special tab, pick the Market Stall (6 wood, 4 stone) and place it.'),
            o('Earn 150 coins selling goods', 'sell', 150, 'Stand next to your Market Stall and press E to sell things from your pockets. Crops, planks and bars sell well.'),
            o('Find another farmer: join your islands together', 'meet', 1, 'Buy land towards another player\'s island (the minimap shows where they are) until your plots touch.', { opt: true }),
            o('Catch 3 fish (a rod is one workbench away)', 'fish', 3, 'Craft a Fishing Rod at the Workbench (C). Face open water and press {fish} to cast; press it again when the line bites.', { opt: true }),
        ],
        reward: { coin: 150, points: 2, items: [['charm_swift', 1]] },
    },
    {
        id: 'night', title: 'Night Watch', blurb: 'The monsters get bolder. Gear up and learn to fight.',
        objectives: [
            o('Defeat 12 monsters', 'kill', 12, 'Hold Space next to a monster to hit it. A sword from the Workbench or Anvil hits much harder than a pick.'),
            o('Wear body armor', 'armor', 1, 'Craft any body armor (iron mail needs the Anvil and iron bars), then open the Backpack (I) and click it to put it on.', { state: true }),
            o('Survive 3 nights', 'night', 3, 'Stay near a campfire or lantern after dark, and keep a healing potion handy. Sunrise counts the night as survived.'),
            o('Build 2 lanterns', 'build:lantern', 2, 'A Lantern is 2 planks and 1 glass (melt sand in a Furnace to get glass). Press B, open the Light tab and place two.'),
            o('Reach level 10', 'level', 10, 'Fighting at night is the quickest XP, but everything you do adds up.', { state: true }),
        ],
        reward: { coin: 200, points: 2, items: [['potion_guard', 2], ['potion_might', 2]] },
    },
    {
        id: 'wild', title: 'Wild Hearts', blurb: 'Not everything out here wants to hurt you. Make friends and put them to work.',
        objectives: [
            o('Learn Pod Crafter in the Taming branch', 'taming', 1, 'Press K and open the pink Taming branch: Pod Crafter is the first skill. It needs one skill point.', { state: true }),
            o('Craft 3 Taming Pods', 'craft:pod', 3, 'Press C and craft Taming Pods (you need the Pod Crafter skill, and the materials listed in the recipe).'),
            o('Befriend a creature (T)', 'tame', 1, 'Creatures are shy and rare: look around owned land, walk up slowly and press T to throw a pod. Stronger pods catch better.'),
            o('Build a Creature Den', 'build:den', 1, 'Press B, open the Special tab and pick the Creature Den (30 wood, 10 planks, 4 rope).'),
            o('Put a creature to work', 'workers', 1, 'Stand next to the Den and press E, then click a creature from your roster to move it in. Or press P, pick a creature and choose Give a job… to put it on an island or at a machine.', { state: true }),
        ],
        reward: { coin: 200, points: 2, items: [['pod', 4], ['treat', 4]] },
    },
    {
        id: 'gears', title: 'Gears and Grids', blurb: 'Why carry things yourself? Build a machine that does it.',
        objectives: [
            o('Build a Mining Drill', 'build:drill', 1, 'Learn Mining Machines (K, Industry). Put the 2×2 Drill on coloured ore, with power and a belt or chest on the tile in front. V, Starter layouts has a ready-made Mining outpost.'),
            o('Lay 10 belts', 'build:belt', 10, 'Learn Logistics (K). Pick the Conveyor Belt in Build, drag to lay a line from the drill to a chest and press R to turn a piece. The arrows on a belt show its way. 1 iron bar each.'),
            o('Build a Power Pole and a Wind Turbine', 'build:windturbine', 1, 'Learn Electricity (K). Place a Wind Turbine, then a Power Pole within 3 tiles of it and of your machines. A red bolt over a machine means it has no power yet.'),
            o('Place an Inserter', 'build:inserter', 1, 'Learn Logistics (K). An Inserter picks up from the tile behind it and drops on the tile in front: chest to furnace, furnace to chest. It needs power. The Smelter line in V is a working one.'),
            o('Make 40 iron bars with machines', 'make:ironbar', 40, 'Put iron ore and coal in the first chest of the Smelter line (V, Starter layouts), or feed a Furnace by hand. Bars made by machines count. Hover a machine to see what it is waiting for.'),
        ],
        reward: { coin: 300, points: 2, items: [['circuit', 4], ['gear', 8]] },
    },
    {
        id: 'altar', title: 'The First Challenge', blurb: 'An altar, a sigil and a very large slime. Bring friends if you can.',
        objectives: [
            o('Build a Boss Altar', 'build:altar', 1, 'Learn Boss Hunter in the Combat branch (K), then build the Altar (stone, bricks, iron bars) from the Special tab.'),
            o('Craft a Slime Sigil', 'craft:sigil_slime', 1, 'Press E at the Altar and craft the sigil from slime gel and other drops. Slimes are everywhere at night.'),
            o('Defeat the Slime King', 'boss:slime', 1, 'Use the sigil at the Altar (E). Dodge the red warnings on the ground, dash with Shift, bring potions and friends.'),
        ],
        reward: { coin: 300, points: 3, items: [['potion_heal', 4], ['goldbar', 3]] },
    },
    {
        id: 'deeper', title: 'Deeper', blurb: 'Steel, crystal and stronger company.',
        objectives: [
            o('Reach level 18', 'level', 18, 'Bosses, expeditions and night fights give the most XP.', { state: true }),
            o('Craft 4 steel', 'make:steel', 4, 'Learn Steelwork in the Industry branch (K), then smelt iron bars and coal together in a Furnace.'),
            o('Defeat 60 monsters', 'kill', 60, 'Fight at night near your farm, or clear waves on expeditions.'),
            o('Befriend 5 creatures', 'tame', 5, 'Keep throwing pods (T) at the wild creatures you meet. Rare ones take better pods.'),
            o('Own 20 plots', 'plots', 20, 'Keep raising land. Biomes further out hold richer ore and new creatures.', { state: true }),
        ],
        reward: { coin: 400, points: 3, items: [['crystal', 4], ['potion_swift', 3]] },
    },
    {
        id: 'work', title: 'The Great Work', blurb: 'A farm that runs itself, and a wonder to prove it.',
        objectives: [
            o('Build an Assembler', 'build:assembler', 1, 'Learn Assembly (K, Industry). The Assembler needs power (a pole and a turbine) and builds parts from what you feed it. V, Starter layouts has a Gear cell to place.'),
            o('Make 20 circuits', 'make:circuit', 20, 'Open the Assembler (E) and choose Circuit, then feed it iron bars, wire and glass by hand or with inserters. A yellow hourglass over it means it is waiting: hover to see for what.'),
            o('Have 3 creatures working', 'workers', 3, 'Press P, pick a creature and choose Give a job… (an island, a furnace, a workbench), or move creatures into a Creature Den (E at it). Three at work in all.', { state: true }),
            o('Raise the Golden Windmill', 'build:mill', 1, 'Press B, open the Special tab: the Golden Windmill is a wonder that costs a lot of everything.'),
        ],
        reward: { coin: 600, points: 3, items: [['core', 1], ['motor', 2]] },
    },
    {
        id: 'corners', title: 'Four Corners', blurb: 'The other guardians of the island are waking up.',
        objectives: [
            o('Defeat 4 different bosses', 'bosses', 4, 'Every biome has a guardian: Stone Colossus (quarry), Bog Witch (bog), Dune Pharaoh (desert), Frost Giant (snow). Their sigils need drops from monsters of that biome.', { state: true }),
            o('Reach level 30', 'level', 30, 'Bosses and expeditions give lots of XP.', { state: true }),
            o('Befriend a Rare creature', 'rare', 1, 'Rare creatures are shy. The Rare Finder skill in the Taming branch makes them show up more; use a Great Pod.'),
        ],
        reward: { coin: 1000, points: 4, items: [['goldbar', 8], ['crystal', 8]] },
    },
    {
        id: 'rift', title: 'Into the Rift', blurb: 'There are islands at the edge of the sea that were not there yesterday. A dock, a few friends and a plan.',
        objectives: [
            o('Build an Expedition Dock', 'build:dock', 1, 'Learn Expedition in the Explore branch (K), then build the Dock by the water from the Special tab.'),
            o('Clear the Mossy Rift', 'riftwin:0', 1, 'Press E at the Dock and launch the first tier. Survive every wave and beat the guardian.'),
            o('Clear 15 expedition waves', 'riftwave', 15, 'Every wave you clear on any expedition counts, even if the run is lost later.'),
            o('Pick 6 boons on expeditions', 'boonpick', 6, 'Between waves you choose one of three boons. Each pick counts.', { opt: true }),
        ],
        reward: { coin: 800, points: 3, items: [['rift_shard', 12], ['crystal', 4]] },
    },
    {
        id: 'heart', title: 'The Old Heart', blurb: 'Every island leads to the centre. Something there has been waiting for you all.',
        objectives: [
            o('Own the centre plot', 'heartplot', 1, 'Buy land towards the red-outlined plot in the middle of the world map (Esc, then World Map).', { state: true }),
            o('Defeat all five guardians', 'bosses', 5, 'Slime King, Stone Colossus, Bog Witch, Dune Pharaoh and Frost Giant.', { state: true }),
            o('Defeat the Old Heart', 'boss:heart', 1, 'Build an Altar on the centre plot and wake it with the Heart Sigil. Bring everyone, and your best gear.'),
        ],
        reward: { coin: 3000, points: 6, items: [['charm_heart', 1]] },
    },

    // ── Fortune: what comes after the Old Heart ──
    {
        id: 'stranger', title: 'A Stranger on the Pier', blurb: 'Somebody new has stepped off a boat with a very large wheel. Madame Fortuna says luck is something you can build.',
        objectives: [
            o('Build the Fortune Wheel', 'build:fortune', 1, 'Press B, open the Special tab and pick the Fortune Wheel (20 planks, 4 cloth, 2 gold bars and 60 coins). It is 2 by 2 tiles: place it on free ground.'),
            o('Spin the wheel 5 times', 'spin', 5, 'Walk up to the Fortune Wheel and press E. Your first spin each day is free; after that a spin costs coins, a little more each time.'),
            o('Open 3 crates', 'crate', 3, 'Crates come from the wheel, from monsters and from bosses. Open the Backpack (I) and click a crate to open it.'),
            o('Find 3 Lucky Finds', 'lucky', 3, 'Every time you chop, mine or pick something there is a small chance of a Lucky Find: a bonus pops out. Keep gathering. A Lucky Charm and luck skills (K) help.'),
        ],
        reward: { coin: 1200, points: 3, items: [['crate_silver', 2], ['potion_heal', 3]] },
    },
    {
        id: 'xmarks', title: 'X Marks the Spot', blurb: 'Lumpy mounds in the ground and letters in bottles all point the same way. Somebody has been leaving clues for a very long time.',
        objectives: [
            o('Dig up 5 buried treasures', 'dig', 5, 'Now and then, usually at dawn, a lumpy mound of earth appears on land you own. Hold Space next to it with your pick to dig it up. Bottles can point you to one.'),
            o('Read 2 messages in bottles', 'bottle', 2, 'Bottles come up on your fishing line now and then ({fish} to cast), and crates can hold them. Open the Backpack (I) and click a bottle to read it.'),
            o('Break a golden node', 'golden', 1, 'Now and then a tree or rock grows with a golden shine. Hold Space next to it: it gives much more than usual, plus a prize on top.'),
            o('Open 10 crates', 'crate', 10, 'Spin the Fortune Wheel (E) for crates. Monsters and bosses drop them too. Open each one from the Backpack (I) by clicking it.'),
        ],
        reward: { coin: 2000, points: 3, items: [['crate_gold', 1], ['lantern_shard', 1]] },
    },
    {
        id: 'lantern', title: 'The Last Lantern', blurb: 'The wheel was never about luck. It is the heart of an old lantern, and it is hungry for light.',
        objectives: [
            o('Find 3 Lantern Shards', 'shard', 3, 'Lantern Shards come from Golden and Mythic Crates, wheel jackpots, golden nodes and rare buried treasure. Check the Backpack (I). The lantern needs 3 of them to be made.'),
            o('Craft Fortune’s Lantern', 'craft:charm_fortune', 1, 'Stand at a Workbench and press C. It takes 3 Lantern Shards, 4 gold bars, 4 crystal shards and 1 pearl. Then click it in the Backpack (I) to wear it.'),
            o('Reach level 35', 'level', 35, 'Bosses, expeditions and night fights give the most XP, and everything else adds up.', { state: true }),
            o('Win a wheel jackpot', 'jackpot', 1, 'Spin the Fortune Wheel (E). The JACKPOT wedge is tiny, but its odds grow with every paid spin that misses it.', { opt: true }),
            o('Win 3 double-or-nothings', 'gamble:win', 3, 'After a coin prize on the wheel, press Double or nothing instead of taking it. You win a little less than half the time, so be patient.', { opt: true }),
        ],
        reward: { coin: 5000, points: 8, items: [['crate_mythic', 2]] },
    },
];

// ── daily bounties ─────────────────────────────────────────────────────────
interface BountyT { kind: 'deliver' | 'kill' | 'harvest' | 'craft' | 'make' | 'crop' | 'tame'; key?: string; item?: ItemId; label: (n: number) => string; n: [number, number]; coin: number; minLevel?: number }

export const BOUNTY_POOL: BountyT[] = [
    { kind: 'deliver', item: 'wood', label: (n) => `Deliver ${n} Wood`, n: [20, 50], coin: 1.2 },
    { kind: 'deliver', item: 'stone', label: (n) => `Deliver ${n} Stone`, n: [20, 50], coin: 1.2 },
    { kind: 'deliver', item: 'plank', label: (n) => `Deliver ${n} Planks`, n: [12, 30], coin: 2.2 },
    { kind: 'deliver', item: 'ironbar', label: (n) => `Deliver ${n} Iron Bars`, n: [8, 24], coin: 4, minLevel: 6 },
    { kind: 'deliver', item: 'copperbar', label: (n) => `Deliver ${n} Copper Bars`, n: [6, 18], coin: 4, minLevel: 8 },
    { kind: 'deliver', item: 'bread', label: (n) => `Deliver ${n} Bread`, n: [4, 10], coin: 6, minLevel: 4 },
    { kind: 'deliver', item: 'brick', label: (n) => `Deliver ${n} Bricks`, n: [10, 24], coin: 3.5, minLevel: 5 },
    { kind: 'deliver', item: 'cloth', label: (n) => `Deliver ${n} Cloth`, n: [6, 16], coin: 5, minLevel: 6 },
    { kind: 'deliver', item: 'gear', label: (n) => `Deliver ${n} Gears`, n: [6, 16], coin: 12, minLevel: 10 },
    { kind: 'deliver', item: 'potion_heal', label: (n) => `Deliver ${n} Healing Potions`, n: [2, 5], coin: 16, minLevel: 8 },
    { kind: 'kill', key: 'kill', label: (n) => `Defeat ${n} monsters`, n: [3, 8], coin: 14 },
    { kind: 'kill', key: 'kill:skeleton', label: (n) => `Defeat ${n} Skeletons`, n: [2, 5], coin: 20, minLevel: 4 },
    { kind: 'kill', key: 'kill:slime', label: (n) => `Defeat ${n} Slimes`, n: [3, 8], coin: 10 },
    { kind: 'kill', key: 'kill:bat', label: (n) => `Defeat ${n} Night Bats`, n: [2, 6], coin: 20, minLevel: 6 },
    { kind: 'kill', key: 'kill:boar', label: (n) => `Defeat ${n} Tuskers`, n: [2, 4], coin: 30, minLevel: 6 },
    { kind: 'harvest', key: 'harvest:tree', label: (n) => `Chop ${n} trees`, n: [10, 22], coin: 3 },
    { kind: 'harvest', key: 'harvest:rock', label: (n) => `Break ${n} boulders`, n: [6, 14], coin: 5 },
    { kind: 'harvest', key: 'harvest:iron', label: (n) => `Mine ${n} iron veins`, n: [4, 10], coin: 9, minLevel: 6 },
    { kind: 'harvest', key: 'harvest:bush', label: (n) => `Pick ${n} berry bushes`, n: [8, 16], coin: 3 },
    { kind: 'crop', key: 'crop', label: (n) => `Harvest ${n} crops`, n: [4, 10], coin: 8 },
    { kind: 'make', key: 'make:ironbar', label: (n) => `Smelt ${n} iron bars`, n: [6, 16], coin: 7, minLevel: 6 },
    { kind: 'make', key: 'make:glass', label: (n) => `Melt ${n} glass`, n: [6, 14], coin: 7, minLevel: 6 },
    { kind: 'craft', key: 'craft', label: (n) => `Craft ${n} things`, n: [6, 16], coin: 6 },
    { kind: 'kill', key: 'riftwave', label: (n) => `Clear ${n} expedition waves`, n: [3, 8], coin: 34, minLevel: 8 },
    { kind: 'harvest', key: 'fish', label: (n) => `Catch ${n} fish`, n: [4, 9], coin: 9, minLevel: 5 },
    { kind: 'tame', key: 'hatch', label: (n) => `Hatch ${n} egg${n > 1 ? 's' : ''}`, n: [1, 2], coin: 70, minLevel: 16 },
    { kind: 'tame', key: 'tame', label: (n) => `Befriend ${n} creature${n > 1 ? 's' : ''}`, n: [1, 2], coin: 60, minLevel: 8 },
];

// ── production goals (the whole farm feeds them) ───────────────────────────
interface Goal { id: string; item: ItemId; n: number; reward: Reward }
const g = (item: ItemId, n: number, reward: Reward): Goal => ({ id: `${item}:${n}`, item, n, reward });
export const GOALS: Goal[] = [
    g('ironbar', 100, { coin: 80 }), g('ironbar', 500, { coin: 250, points: 1 }), g('ironbar', 2500, { coin: 800, points: 2 }),
    g('copperbar', 60, { coin: 80 }), g('copperbar', 400, { coin: 250, points: 1 }),
    g('plank', 200, { coin: 60 }), g('plank', 1500, { coin: 300, points: 1 }),
    g('brick', 100, { coin: 80 }), g('glass', 100, { coin: 80 }),
    g('steel', 40, { coin: 200, points: 1 }), g('steel', 300, { coin: 600, points: 2 }),
    g('gear', 100, { coin: 150 }), g('gear', 800, { coin: 500, points: 1 }),
    g('wire', 200, { coin: 150 }), g('circuit', 25, { coin: 200, points: 1 }), g('circuit', 150, { coin: 700, points: 2 }),
    g('motor', 20, { coin: 400, points: 1 }), g('core', 3, { coin: 1000, points: 2 }),
    g('flour', 100, { coin: 100 }), g('bread', 100, { coin: 200, points: 1 }), g('goldbar', 40, { coin: 300, points: 1 }),
];

// ── medals ─────────────────────────────────────────────────────────────────
interface Medal { id: string; name: string; desc: string; icon: string; key: string; n: number; state?: boolean; reward: Reward }
const m = (id: string, name: string, desc: string, icon: string, key: string, n: number, reward: Reward, state = false): Medal => ({ id, name, desc, icon, key, n, state, reward });
export const MEDALS: Medal[] = [
    m('hunter1', 'Monster Masher', 'Defeat 25 monsters', 'k_sword', 'kill', 25, { coin: 50 }),
    m('hunter2', 'Night Terror', 'Defeat 250 monsters', 'k_sword', 'kill', 250, { coin: 300, points: 1 }),
    m('hunter3', 'Legend of the Dark', 'Defeat 1500 monsters', 'k_skull', 'kill', 1500, { coin: 1500, points: 2 }),
    m('boss1', 'King Slayer', 'Defeat the Slime King', 'k_crown', 'boss:slime', 1, { coin: 100 }),
    m('boss2', 'Rock Breaker', 'Defeat the Stone Colossus', 'k_hammer', 'boss:stone', 1, { coin: 150 }),
    m('boss3', 'Witch Hunter', 'Defeat the Bog Witch', 'k_eye', 'boss:bog', 1, { coin: 150 }),
    m('boss4', 'Sandstorm', 'Defeat the Dune Pharaoh', 'k_compass', 'boss:dune', 1, { coin: 200 }),
    m('boss5', 'Cold Snap', 'Defeat the Frost Giant', 'k_drop', 'boss:frost', 1, { coin: 200 }),
    m('boss6', 'Heartbreaker', 'Defeat the Old Heart', 'k_heart', 'boss:heart', 1, { coin: 1000, points: 3 }),
    m('boss7', 'Slayer of Five', 'Defeat five different bosses', 'k_skull', 'bosses', 5, { coin: 400, points: 1 }, true),
    m('mine1', 'Down the Hole', 'Climb down a mine shaft', 'k_drill', 'descend', 1, { coin: 80 }),
    m('mine2', 'Rock Hound', 'Dig 250 pieces of rock in the caves', 'k_hammer', 'mine', 250, { coin: 200, points: 1 }),
    m('mine3', 'Deep Delver', 'Dig 2500 pieces of rock in the caves', 'k_drill', 'mine', 2500, { coin: 1200, points: 2 }),
    m('vault1', 'Tomb Raider', 'Open 3 ancient vaults', 'k_chest', 'harvest:vault', 3, { coin: 300, points: 1 }),
    m('dread1', 'Warden Slayer', 'Fell a warden of the Dread Reaches', 'k_skull', 'warden', 1, { coin: 500, points: 1 }),
    m('dread2', 'Warden Bane', 'Fell five wardens of the Dread Reaches', 'k_skull', 'warden', 5, { coin: 2000, points: 2 }),
    m('tame1', 'New Friend', 'Befriend a creature', 'k_paw', 'tame', 1, { coin: 40 }),
    m('tame2', 'Pack Leader', 'Befriend 10 creatures', 'k_paw', 'tame', 10, { coin: 200, points: 1 }),
    m('tame3', 'Gotta Catch Most', 'Befriend 16 different species', 'k_whistle', 'species', 16, { coin: 800, points: 2 }, true),
    m('tame4', 'Beast Whisperer', 'Befriend a Legendary creature', 'k_ear', 'legend', 1, { coin: 500, points: 1 }),
    m('lvl1', 'Getting Somewhere', 'Reach level 10', 'k_star', 'level', 10, { coin: 60 }, true),
    m('lvl2', 'Seasoned', 'Reach level 30', 'k_star', 'level', 30, { coin: 300, points: 1 }, true),
    m('lvl3', 'Veteran', 'Reach level 55', 'k_star', 'level', 55, { coin: 900, points: 2 }, true),
    m('lvl4', 'Legend', 'Reach level 80', 'k_crown', 'level', 80, { coin: 3000, points: 3 }, true),
    m('land1', 'Landowner', 'Own 10 plots', 'k_flag', 'plots', 10, { coin: 100 }, true),
    m('land2', 'Baron', 'Own 30 plots', 'k_flag', 'plots', 30, { coin: 600, points: 1 }, true),
    m('land3', 'Continent', 'Own 60 plots', 'k_map', 'plots', 60, { coin: 2500, points: 2 }, true),
    m('build1', 'Handy', 'Build 50 things', 'k_hammer', 'build', 50, { coin: 80 }),
    m('build2', 'Master Builder', 'Build 500 things', 'k_hammer', 'build', 500, { coin: 500, points: 1 }),
    m('craft1', 'Craftsperson', 'Craft 100 items', 'k_anvil', 'craft', 100, { coin: 100 }),
    m('craft2', 'Artisan', 'Craft 1000 items', 'k_anvil', 'craft', 1000, { coin: 700, points: 1 }),
    m('gather1', 'Lumberjack', 'Chop 200 trees', 'k_axe', 'harvest:tree', 200, { coin: 120 }),
    m('gather2', 'Quarry Master', 'Mine 200 ore veins', 'i_iron', 'harvest:iron', 200, { coin: 200 }),
    m('gather3', 'Green Thumb', 'Harvest 300 crops', 'k_sprout', 'crop', 300, { coin: 250 }),
    m('fac1', 'Industrialist', 'Make 1000 items with machines', 'k_gear', 'make', 1000, { coin: 400, points: 1 }),
    m('fac2', 'Silicon Valley', 'Make 50 circuits', 'k_robot', 'make:circuit', 50, { coin: 300 }),
    m('help1', 'Good Samaritan', 'Revive a friend', 'k_heart', 'revive', 1, { coin: 80 }),
    m('help2', 'Field Medic', 'Revive 10 friends', 'k_heart', 'revive', 10, { coin: 400, points: 1 }),
    m('night1', 'Sleep Tight', 'Survive 10 nights', 'k_moon', 'night', 10, { coin: 150 }),
    m('night2', 'Night Owl', 'Survive 50 nights', 'k_moon', 'night', 50, { coin: 700, points: 1 }),
    m('rich1', 'Pocket Change', 'Earn 1000 coins selling goods', 'k_coin', 'sell', 1000, { coin: 100 }),
    m('rich2', 'Tycoon', 'Earn 25000 coins selling goods', 'k_coin', 'sell', 25000, { coin: 1500, points: 2 }),
    m('skill1', 'Studious', 'Learn 25 skills', 'k_book', 'skills', 25, { coin: 200 }, true),
    m('skill2', 'Master of Many', 'Learn 60 skills', 'k_book', 'skills', 60, { coin: 1200, points: 2 }, true),
    m('fish1', 'First Catch', 'Land a fish', 'k_drop', 'fish', 1, { coin: 40 }),
    m('fish2', 'Angler', 'Catch 25 fish', 'k_drop', 'fish', 25, { coin: 200, points: 1 }),
    m('fish3', 'Master Angler', 'Catch 150 fish', 'k_drop', 'fish', 150, { coin: 900, points: 2 }),
    m('fish4', 'Ichthyologist', 'Catch every kind of fish', 'k_eye', 'fishspecies', 11, { coin: 1500, points: 2 }, true),
    m('fish5', 'Pearl Diver', 'Fish up 3 pearls', 'i_pearl', 'pearl', 3, { coin: 300, points: 1 }),
    m('rift1', 'First Delve', 'Clear an expedition', 'k_map', 'riftwin', 1, { coin: 150 }),
    m('rift2', 'Rift Runner', 'Clear 10 expeditions', 'k_map', 'riftwin', 10, { coin: 700, points: 1 }),
    m('rift3', 'Wave Breaker', 'Clear 100 expedition waves', 'k_burst', 'riftwave', 100, { coin: 500, points: 1 }),
    m('rift4', 'Full Sweep', 'Clear all five rifts', 'k_crown', 'riftsweep', 5, { coin: 1500, points: 2 }, true),
    m('abyss1', 'Into the Dark', 'Reach wave 10 in the Abyss', 'k_moon', 'abyssbest', 10, { coin: 600, points: 1 }),
    m('abyss2', 'Deep Diver', 'Reach wave 25 in the Abyss', 'k_moon', 'abyssbest', 25, { coin: 1500, points: 2 }),
    m('abyss3', 'Bottomless', 'Reach wave 50 in the Abyss', 'k_skull', 'abyssbest', 50, { coin: 4000, points: 3 }),
    m('omen1', 'Tempting Fate', 'Clear an expedition under an omen', 'k_skull', 'omenwin', 1, { coin: 300, points: 1 }),
    m('omen2', 'Fortune Favours', 'Clear an expedition under three omens', 'k_crown', 'omen3win', 1, { coin: 1200, points: 2 }, true),
    m('daily1', 'Rift of the Day', 'Clear the rift of the day', 'k_flag', 'dailywin', 1, { coin: 250, points: 1 }),
    m('daily2', 'Creature of Habit', 'Clear the rift of the day 7 times', 'k_flag', 'dailywin', 7, { coin: 1000, points: 2 }),
    m('rift5', 'Heart of the Rift', 'Clear the Heart Rift', 'k_flame', 'riftwin:4', 1, { coin: 1200, points: 2 }),
    m('awaken1', 'Shooting Star', 'Awaken a creature', 'k_star', 'awaken', 1, { coin: 300, points: 1 }),
    m('awaken2', 'Constellation', 'Awaken creatures 6 times', 'k_star', 'awaken', 6, { coin: 900, points: 2 }),
    m('awaken3', 'Fully Lit', 'Fully awaken a creature', 'k_crown', 'awakenmax', 1, { coin: 1500, points: 2 }, true),
    m('hatch1', 'Midwife', 'Hatch 5 eggs', 'k_den', 'hatch', 5, { coin: 200, points: 1 }),
    m('hatch2', 'Breeder', 'Hatch 25 eggs', 'k_den', 'hatch', 25, { coin: 900, points: 2 }),
    m('dash1', 'Dodge This', 'Dodge 50 attacks', 'k_boot', 'dodge', 50, { coin: 150 }),
];

