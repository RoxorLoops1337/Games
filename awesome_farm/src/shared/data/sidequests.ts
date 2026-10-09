// Quests from the people of the island: short chains of errands, each with its own story, steps, hints and a
// reward. They are offered in the Journal (Quests tab) as you grow; accept the ones you like. Steps count from the
// moment you accept (so nothing you did years ago finishes a quest for you), except "have" and live-state steps.
// The main story (CHAPTERS in quests.ts) is separate and always runs.

import { PAL } from '../palette';
import { o, type Objective, type Reward } from './quests';

interface Giver { id: string; name: string; role: string; icon: string; color: number }

export const GIVERS: Record<string, Giver> = {
    marta:   { id: 'marta',   name: 'Marta Greenthumb', role: 'Gardener',          icon: 'k_sprout', color: PAL.lime },
    odo:     { id: 'odo',     name: 'Odo',              role: 'Travelling trader', icon: 'k_coin',   color: PAL.gold },
    pip:     { id: 'pip',     name: 'Pip',              role: 'Creature keeper',   icon: 'k_paw',    color: PAL.blossom },
    brine:   { id: 'brine',   name: 'Captain Brine',    role: 'Old sailor',        icon: 'k_drop',   color: PAL.sea },
    ferro:   { id: 'ferro',   name: 'Ferro',            role: 'Smith and tinkerer', icon: 'k_anvil', color: PAL.pumpkin },
    watcher: { id: 'watcher', name: 'The Night Watcher', role: 'Keeper of the dark', icon: 'k_moon',  color: PAL.plum },
    fortuna: { id: 'fortuna', name: 'Madame Fortuna',   role: 'Fortune teller',    icon: 'k_clover', color: PAL.berry },
    finn:    { id: 'finn',    name: 'Finn Digsby',      role: 'Treasure hunter',   icon: 'k_compass', color: PAL.dirt },
    rocco:   { id: 'rocco',   name: 'Rocco Underhill',  role: 'Miner',             icon: 'k_drill',   color: PAL.stone },
};

export interface Quest {
    id: string;
    giver: string;
    title: string;
    offer: string;           // what they say before you accept
    thanks: string;          // what they say when you are done
    steps: Objective[];
    reward: Reward;
    after?: string;          // another quest that must be finished first
    minLevel?: number;
    ch?: number;             // the main story must have reached this chapter (index)
}

export const QUESTS: Quest[] = [
    // ── Rocco: the caves ─────────────────────────────────────────────────────
    {
        id: 'u1', giver: 'rocco', title: 'Down the Shaft', minLevel: 8,
        offer: 'There is a whole second world under your boots, friend, and nobody mining it. Sink a shaft, climb down and break some rock. Bring a lantern: it is blacker than a bog witch\'s hat down there.',
        thanks: 'Smell that? Cold stone and coal dust. That is the smell of a good day. Keep the shaft: it is yours.',
        steps: [
            o('Climb down a mine shaft', 'descend', 1, 'Learn Mine Shafts (K, Gathering branch), build a Mine Shaft (B, Special tab) and press E on it.'),
            o('Dig 25 pieces of rock', 'mine', 25, 'Hold the action key or your finger beside rock in the caves.'),
        ],
        reward: { coin: 60, xp: 60, items: [['stone', 20]] },
    },
    {
        id: 'u2', giver: 'rocco', title: 'Ore in the Dark', minLevel: 9, after: 'u1',
        offer: 'Plain rock is for walls. The money is in the veins: coal for the furnace, iron and copper for everything else, and the gold glints when you are close. Dig me some.',
        thanks: 'Honest ore! There is more where that came from: the further from the middle you dig, the richer it gets.',
        steps: [
            o('Dig 8 iron ore', 'harvest:iron', 8, 'Iron shows as rusty speckles in the rock. Hold the action key beside it.'),
            o('Dig 4 gold ore', 'harvest:gold', 4, 'Gold glints yellow, and is commoner towards the edge of the map.'),
        ],
        reward: { coin: 90, xp: 90, items: [['potion_heal', 3]] },
    },
    {
        id: 'u3', giver: 'rocco', title: 'What the Dark Keeps', minLevel: 11, after: 'u2',
        offer: 'Folk have been leaving things down there since before the islands rose. Chests, mostly. And the crystal: it needs a golden pick or better, mind.',
        thanks: 'Crystals and chests! You have the nose for it. Fortuna would love a look at that.',
        steps: [
            o('Open 3 treasure chests', 'harvest:chest', 3, 'Treasure chests stand in the open caves. Walk up and hit one.'),
            o('Dig 3 crystal', 'harvest:crystal', 3, 'Crystal clusters need a gold pick (Smithing 2). Look for the blue glow in the rock.'),
        ],
        reward: { coin: 140, xp: 150, items: [['crate_silver', 1]] },
    },
    // ── Marta: the garden ────────────────────────────────────────────────────
    {
        id: 'm1', giver: 'marta', title: 'First Sprouts', minLevel: 2,
        offer: 'Soil is no good sitting empty, dear. Pop a few seeds into a garden bed and see what comes up. I will show you the rest.',
        thanks: 'Look at that, green fingers already! Keep a few seeds back every time: that is how a garden outlives its gardener.',
        steps: [
            o('Plant 4 seeds', 'plant', 4, 'Break wildflowers and bushes for seeds. Build a Garden Bed (B), pick a seed on your hotbar or just walk up and press E to plant.'),
            o('Harvest 4 crops', 'crop', 4, 'Wait until the plant looks fully grown, then press E on the bed again. Wheat is the quickest.'),
        ],
        reward: { coin: 40, xp: 30, items: [['seed_carrot', 4]] },
    },
    {
        id: 'm2', giver: 'marta', title: 'Green Acres', minLevel: 3, after: 'm1',
        offer: 'One bed is a hobby, five is a farm. Put in a proper patch and bring me ten good wheat for the winter stores.',
        thanks: 'That is a handsome field. The pumpkins are for you: they take their time but they are worth it.',
        steps: [
            o('Build 3 more Garden Beds', 'build:bed', 3, 'Press B, open the Farm tab, pick the Garden Bed (3 wood) and place three more in a row.'),
            o('Harvest 12 crops', 'crop', 12, 'Keep every bed planted: harvest with E, replant straight away.'),
            o('Hold 10 wheat', 'have:wheat', 10, 'Wheat seeds come from wildflowers. Wheat grows quickest of all the crops.'),
        ],
        reward: { coin: 90, xp: 60, items: [['seed_pumpkin', 3]] },
    },
    {
        id: 'm3', giver: 'marta', title: 'Daily Bread', minLevel: 5, after: 'm2',
        offer: 'Wheat on its own never filled a belly. Grind it, and we will talk about bread.',
        thanks: 'Fresh flour! Take these loaves, and tell no one the secret is a pinch of salt.',
        steps: [
            o('Build a Millstone', 'build:millstone', 1, 'Press B, open the Industry tab and pick the Millstone (14 stone, 4 planks).'),
            o('Grind 10 flour', 'make:flour', 10, 'Press E at the Millstone, put wheat in, and collect the flour. Machines you built count, even when a creature carries for you.'),
        ],
        reward: { coin: 120, xp: 80, items: [['bread', 4]] },
    },
    {
        id: 'm4', giver: 'marta', title: 'Pretty as a Picture', minLevel: 7, after: 'm3',
        offer: 'A farm should look as good as it works. A few planters, a fence to keep the chickens honest, and somewhere to sit.',
        thanks: 'Now THAT is a farm. I could sit on that bench until the stars come out.',
        steps: [
            o('Build 2 Flower Planters', 'build:flowerbed', 2, 'Press B, open the Decor tab: Flower Planter (2 planks, 2 fiber).'),
            o('Build 8 Wooden Fences', 'build:fence', 8, 'Decor tab again: a fence is 1 plank. Click and drag to lay a few at once.'),
            o('Build a Bench', 'build:bench', 1, 'Decor tab: Bench (3 planks).'),
        ],
        reward: { coin: 100, xp: 70, items: [['seed_melon', 3]] },
    },
    {
        id: 'm5', giver: 'marta', title: 'A Light in the Garden', minLevel: 8, after: 'm3',
        offer: 'My gran swore flowers lean towards a lantern, the way people lean towards a good story. Put two lights beside your beds and plant a dozen seeds.',
        thanks: 'Look how they lean! Gran kept an old lantern in her garden, too. Nobody ever lit it. We just loved having it there.',
        steps: [
            o('Build 2 Lanterns', 'build:lantern', 2, 'Press B, open the Light tab and place two Lanterns (2 planks and 1 glass each). Melt sand in a Furnace to get glass.'),
            o('Plant 12 seeds', 'plant', 12, 'Break wildflowers and bushes for seeds, then walk up to a Garden Bed and press E to plant. Replant every time you harvest.'),
        ],
        reward: { coin: 110, xp: 80, items: [['crate_wood', 1], ['seed_pumpkin', 4]] },
    },
    {
        id: 'm6', giver: 'marta', title: 'A Spoonful of Luck', minLevel: 10, after: 'm3',
        offer: 'Berry jam, dear. A spoonful in the morning and the whole day goes your way, or so my gran said, and she won more raffles than anybody. Build a kitchen and let us find out.',
        thanks: 'Sweet as anything and twice as lucky. Take these, and keep a jar back for a day you really need it.',
        steps: [
            o('Build a Kitchen', 'build:kitchen', 1, 'Learn Kitchen Know-How in the Farming and Cooking branch (K). Then press B, open the Crafting tab: the Kitchen is 4 bricks, 4 planks and 6 stone.'),
            o('Cook 4 Berry Jam', 'craft:jam', 4, 'Press C at the Kitchen: Berry Jam is 6 berries, so pick plenty of berry bushes. Eating jam gives you a short Lucky buff.'),
        ],
        reward: { coin: 140, xp: 90, items: [['crate_wood', 2]] },
    },

    // ── Odo: trade ───────────────────────────────────────────────────────────
    {
        id: 'o1', giver: 'odo', title: 'Open for Business', minLevel: 3,
        offer: 'Friend, a farm that cannot sell is a hobby. Put up a stall and show me you can part with something.',
        thanks: 'Ha! The first coin is always the hardest to earn. It is downhill from here.',
        steps: [
            o('Build a Market Stall', 'build:market', 1, 'Press B, open the Special tab and pick the Market Stall (6 wood, 4 stone).'),
            o('Sell goods for 100 coins', 'sell', 100, 'Stand next to the stall and press E. Crops, planks and bars all sell; the stall shows the price.'),
        ],
        reward: { coin: 60, xp: 40 },
    },
    {
        id: 'o2', giver: 'odo', title: 'Supply and Demand', minLevel: 5, after: 'o1',
        offer: 'Everybody wants planks and nobody wants to saw them. Stock up and I will make it worth your while.',
        thanks: 'Planks by the cartload! Here is a gold bar, and my card.',
        steps: [
            o('Craft 20 planks', 'craft:plank', 20, 'Stand at a Workbench (C). A Sawmill turns logs into twice as many planks.'),
            o('Hold 40 wood', 'have:wood', 40, 'Chop trees (hold Space next to them). Trees grow back.'),
            o('Earn 250 coins selling goods', 'sell', 250, 'Sell at your Market Stall (E).'),
        ],
        reward: { coin: 140, xp: 80, items: [['goldbar', 1]] },
    },
    {
        id: 'o3', giver: 'odo', title: 'Shop Around', minLevel: 8, after: 'o2',
        offer: 'I only visit markets that have shown they can pay. Learn my contacts and see what I carry that you cannot make.',
        thanks: 'There is more in my cart than anybody can afford. Come back whenever the stock turns over.',
        steps: [
            o('Buy 3 things from the Trader', 'shop', 3, 'Learn Merchant Contacts in the Explore branch (K). Then stand next to a Market Stall and open the trader (E) to buy from his cart.'),
        ],
        reward: { coin: 160, xp: 100, points: 1 },
    },
    {
        id: 'o4', giver: 'odo', title: 'Pockets Full of Coin', minLevel: 14, after: 'o3',
        offer: 'A real merchant counts in thousands. Show me you are ready for the big leagues.',
        thanks: 'A true merchant! The road to riches is paved with other people\'s planks.',
        steps: [
            o('Earn 1500 coins selling goods', 'sell', 1500, 'Sell what your machines make. Steel, circuits and gears fetch the best prices.'),
        ],
        reward: { coin: 400, xp: 200, points: 1 },
    },
    {
        id: 'o5', giver: 'odo', title: 'A Map for a Song', minLevel: 12, after: 'o3',
        offer: 'I picked up a map in the south, friend. Odd thing: it shows your farm. Spend a little at my cart, earn a little at your stall, and it is yours for a song.',
        thanks: 'There you go. Funny thing about it, it has a tiny lantern drawn on every island, and nobody I asked has ever seen one. Keep it dry.',
        steps: [
            o('Buy 2 things from the Trader', 'shop', 2, 'Stand next to a Market Stall and open the trader (E) to buy from his cart. You need Merchant Contacts in the Explore branch (K).'),
            o('Earn 400 coins selling goods', 'sell', 400, 'Sell crops, planks and bars at your Market Stall (E). The stall shows the price.'),
        ],
        reward: { coin: 200, xp: 130, items: [['crate_silver', 1]] },
    },
    {
        id: 'o6', giver: 'odo', title: 'Land Rush', minLevel: 10, after: 'o2',
        offer: 'Land is the one thing they stopped making, friend, which is why the price keeps climbing. Buy a few plots before it does, and sell what grows on them.',
        thanks: 'Plots, produce and profit. My three favourite things, and that is only because I ran out of fingers. Here is a little something for the effort.',
        steps: [
            o('Buy 3 new plots of land', 'buy', 3, 'Walk to the shore of your island, face a light square out at sea and press E. Each plot costs a little more than the last.'),
            o('Earn 600 coins selling goods', 'sell', 600, 'Sell what your land grows at a Market Stall (E): crops, planks and bars all fetch a fair price.'),
        ],
        reward: { coin: 180, xp: 110, items: [['crate_wood', 2]] },
    },

    // ── Pip: creatures ───────────────────────────────────────────────────────
    {
        id: 'p1', giver: 'pip', title: 'A Friend in Need', minLevel: 4,
        offer: 'Shh, do not scare them. Creatures here are not monsters, they are neighbours who have not met you yet. Make a few pods and say hello.',
        thanks: 'Look at them look at you! That is a friendship for life. Treat them well.',
        steps: [
            o('Learn Pod Crafter', 'taming', 1, 'Press K and open the pink Taming branch: Pod Crafter is the first skill and needs one skill point.', { state: true }),
            o('Craft 2 Taming Pods', 'craft:pod', 2, 'Press C at a Workbench: pods are planks, fiber and slime gel.'),
            o('Befriend a creature', 'tame', 1, 'Creatures wander owned land, rarely. Walk up slowly and press T to throw a pod; they can break free, so bring spares.'),
        ],
        reward: { coin: 60, xp: 50, items: [['pod', 4], ['treat', 3]] },
    },
    {
        id: 'p2', giver: 'pip', title: 'Lend a Paw', minLevel: 5, after: 'p1',
        offer: 'Your friend would rather be busy than bored. Take them along (P, then Take along) and give them a job: they will chop, mine or tend the crops beside you.',
        thanks: 'See how happy they are when they are useful? A busy creature is a loyal creature.',
        steps: [
            o('Give your companion a task', 'pettask', 1, 'Open the Creatures screen (P), pick the creature you took along and choose a task: Gather, Mine, Farm or Guard. Or tap the task button on the companion card at the top left.'),
            o('Let it work 15 times', 'petwork', 15, 'While it has a task your companion goes off to chop, mine or tend crops near you. Stay close and keep working: you will see little work puffs.'),
        ],
        reward: { coin: 100, xp: 80, items: [['treat', 5]] },
    },
    {
        id: 'p3', giver: 'pip', title: 'Home Sweet Den', minLevel: 6, after: 'p1',
        offer: 'Not everyone wants to walk all day. Build them a den and they will keep house, gather and haul without ever being asked twice.',
        thanks: 'Smoke from the chimney and a creature in every window. That is a home.',
        steps: [
            o('Build a Creature Den', 'build:den', 1, 'Press B, open the Special tab: the Den costs 30 wood, 10 planks and 4 rope.'),
            o('Have 2 creatures working', 'workers', 2, 'Stand next to the Den and press E, then click creatures from your roster to move them in. Each has its own strengths. (Creatures with a job from P count too.)', { state: true }),
        ],
        reward: { coin: 150, xp: 100, points: 1 },
    },
    {
        id: 'p4', giver: 'pip', title: 'Training Day', minLevel: 8, after: 'p2',
        offer: 'A little love and a lot of treats make a champion. Raise one of yours, and find a few friends for it.',
        thanks: 'A strong, happy creature. Take these pods: the next one will be rarer.',
        steps: [
            o('Raise a creature to level 6', 'petlevel', 6, 'Creatures earn XP when they fight beside you or work in a den. Treats in the Creatures screen (P) speed it up.', { state: true }),
            o('Befriend 3 more creatures', 'tame', 3, 'Keep throwing pods at the wild ones you find (T).'),
        ],
        reward: { coin: 160, xp: 120, items: [['pod_great', 2], ['treat', 6]] },
    },
    {
        id: 'p5', giver: 'pip', title: 'The Egg Problem', minLevel: 14, after: 'p3',
        offer: 'Two creatures, a quiet corner and a few treats. What could go wrong? Build a hatchery and find out.',
        thanks: 'A baby! Of course they get your eyes. Hold it gently.',
        steps: [
            o('Build a Hatchery', 'build:hatchery', 1, 'Learn Matchmaker in the Taming branch (K). Press B, Special tab: the Hatchery needs planks, bricks, rope and a gold bar.'),
            o('Hatch an egg', 'hatch', 1, 'Press E at the Hatchery, pick two free creatures and bring a few treats. When the egg is ready, press E to hatch it.'),
        ],
        reward: { coin: 300, xp: 200, points: 1 },
    },

    {
        id: 'p6', giver: 'pip', title: 'A Proper Job', minLevel: 7, after: 'p2',
        offer: 'Walking beside you is lovely, but I have seen what they can do on their own. Give one an island to look after and another a machine to run, then go and have lunch.',
        thanks: 'Wood in the chest and bars in the furnace and you did none of it! That is what I call management.',
        steps: [
            o('Put a creature on an island', 'post:plot', 1, 'Place a Chest near the middle of an island you own. Then press P, pick a creature, choose Give a job… and click the island and a job (Lumber, Mining, Farming, Hauling or Guarding).'),
            o('Put a creature at a machine', 'post:stn', 1, 'Open a Furnace, Sawmill, Millstone or Workbench (E) and press Put a creature to work. Keep a Chest within nine tiles with what it needs.'),
            o('Let your creatures work 30 times', 'petwork', 30, 'Leave them to it and go and do something else: every harvest, felled tree or finished item counts. The bubble over a worker says if it needs help.'),
        ],
        reward: { coin: 220, xp: 150, points: 1, items: [['treat', 6]] },
    },
    {
        id: 'p7', giver: 'pip', title: 'Friends of the Light', minLevel: 10, after: 'p1',
        offer: 'Creatures drift towards a warm light at dusk. The old ones even walk the same route every night, as if they still remember where it leads. Put up some lanterns and see who comes.',
        thanks: 'Another new face by the lamp! I think they like you. I think they like the light even more.',
        steps: [
            o('Build 3 Lanterns', 'build:lantern', 3, 'Press B, open the Light tab and place three Lanterns (2 planks and 1 glass each) near the edge of your land.'),
            o('Befriend a creature', 'tame', 1, 'Creatures wander owned land, rarely. Walk up slowly and press T to throw a pod; they can break free, so bring spares.'),
        ],
        reward: { coin: 130, xp: 100, items: [['pod_great', 1], ['crate_wood', 1]] },
    },

    // ── Captain Brine: the water ─────────────────────────────────────────────
    {
        id: 'b1', giver: 'brine', title: 'First Cast', minLevel: 3,
        offer: 'There is nothing like the sea for thinking. Or not thinking. Cast a line and let the water do the talking.',
        thanks: 'That is the face of a fisher. You will be back out there by morning.',
        steps: [
            o('Catch 3 fish', 'fish', 3, 'Craft a Fishing Rod at the Workbench (C). Face open water and press {fish} to cast; press it again when the line bites.'),
            o('Catch 2 kinds of fish', 'fishspecies', 2, 'Different fish bite in different biomes and at different times of day.', { state: true }),
        ],
        reward: { coin: 50, xp: 40 },
    },
    {
        id: 'b2', giver: 'brine', title: 'Bigger Fish', minLevel: 6, after: 'b1',
        offer: 'Small fry feed the cat. If you want to impress me, bring home variety.',
        thanks: 'Five kinds! My old boat would be jealous.',
        steps: [
            o('Catch 12 fish', 'fish', 12, 'A better rod brings quicker bites and bigger fish.'),
            o('Catch 5 kinds of fish', 'fishspecies', 5, 'Try fishing off the bog, the snow and the desert coasts at night as well as by day.', { state: true }),
        ],
        reward: { coin: 120, xp: 90 },
    },
    {
        id: 'b3', giver: 'brine', title: 'Pearls Before Swine', minLevel: 10, after: 'b2',
        offer: 'Once in a blue moon the sea gives something back. Keep casting and keep your eyes open.',
        thanks: 'A pearl! Hold it up to the light. Do you see it? The whole ocean is in there.',
        steps: [
            o('Fish up a pearl', 'pearl', 1, 'Pearls are rare catches. A better rod and the Angler skill help; keep fishing.'),
        ],
        reward: { coin: 200, xp: 140, points: 1 },
    },
    {
        id: 'b4', giver: 'brine', title: 'Rift of the Day', minLevel: 16, after: 'b3',
        offer: 'There is a new rift every day and a lot of fools who skip it. Show me you are not one of them.',
        thanks: 'Another day, another tide. Come see me tomorrow.',
        steps: [
            o('Clear the rift of the day', 'dailywin', 1, 'Build an Expedition Dock (Explore branch), then launch the Rift of the Day from it (E). Once a day.'),
        ],
        reward: { coin: 300, xp: 200, points: 1 },
    },
    {
        id: 'b5', giver: 'brine', title: 'The Fish That Glows', minLevel: 9, after: 'b2',
        offer: 'When I was small there were lights on the water, and the lanternfish followed them like ducklings. These days you hardly see one. Go out after dark and catch me one, would you?',
        thanks: 'There it is. The same glow as the old lights. Well, well. Thank you, friend. I needed that more than I knew.',
        steps: [
            o('Catch a Lanternfish', 'fish:fish_lantern', 1, 'Lanternfish only bite after dark. Cast off any shore at night ({fish}) and be patient; bait helps, and so does a better rod.'),
        ],
        reward: { coin: 180, xp: 130, items: [['crate_silver', 1]] },
    },

    // ── Ferro: smithing and machines ─────────────────────────────────────────
    {
        id: 'f1', giver: 'ferro', title: 'Hot Stuff', minLevel: 5,
        offer: 'Iron does not forge itself, though I wish it did. Light the furnace and make something that bites.',
        thanks: 'Not bad at all. There is hope for you yet.',
        steps: [
            o('Smelt 10 iron bars', 'make:ironbar', 10, 'Mine iron ore, then press E at a Furnace and give it ore and coal or wood.'),
            o('Craft an iron pick', 'craft:pick_iron', 1, 'Learn Smithing in the Industry branch (K), build an Anvil, then press C next to it.'),
        ],
        reward: { coin: 100, xp: 80 },
    },
    {
        id: 'f2', giver: 'ferro', title: 'Bright Ideas', minLevel: 7, after: 'f1',
        offer: 'I tripped over my own anvil again. Light the place up, would you?',
        thanks: 'Ah, much better. I can finally see what I am doing wrong.',
        steps: [
            o('Build 3 lanterns', 'build:lantern', 3, 'A Lantern is 2 planks and 1 glass. Melt sand in a Furnace for glass.'),
            o('Build a Lamp Post', 'build:lamppost', 1, 'Press B, open the Light tab: the Lamp Post is 2 iron bars and 1 glass.'),
        ],
        reward: { coin: 90, xp: 70, items: [['glass', 6]] },
    },
    {
        id: 'f3', giver: 'ferro', title: 'Mind the Stockpile', minLevel: 10, after: 'f1',
        offer: 'A smith without stock is just a man with a hammer. Build a proper storeroom and fill it.',
        thanks: 'Now we are talking. I can hear the anvil singing already.',
        steps: [
            o('Build 2 Chests', 'build:chest', 2, 'Press B, Storage tab: a Chest is 8 wood and holds 400 items.'),
            o('Hold 200 stone', 'have:stone', 200, 'Break boulders; a better pick breaks them faster. Wear a pack (Backpack, I) to carry more of every item.'),
        ],
        reward: { coin: 150, xp: 100, items: [['plank', 20]] },
    },
    {
        id: 'f4', giver: 'ferro', title: 'Let There Be Power', minLevel: 14, after: 'f3',
        offer: 'Muscle is for amateurs. Wind is free and never complains.',
        thanks: 'Hear that hum? That is the sound of somebody else doing the work.',
        steps: [
            o('Build a Wind Turbine', 'build:windturbine', 1, 'Learn Power in the Industry branch (K). The Wind Turbine is in the Power tab of the build menu.'),
            o('Place 4 Power Poles', 'build:pole', 4, 'A Power Pole wires machines within 3 tiles and links to poles within 7.'),
        ],
        reward: { coin: 250, xp: 160, points: 1 },
    },

    {
        id: 'f5', giver: 'ferro', title: 'A Roof Over Your Head', minLevel: 6,
        offer: 'Out in the open the night finds you. Put walls round yourself, leave one way in, and a roof on top. Doors keep the monsters out.',
        thanks: 'Warm, dry and monster-proof. Take this satchel: a builder with full pockets is no builder at all. Wear it from your Backpack.',
        steps: [
            o('Lay 6 plank floors', 'build:planks', 6, 'Press B, open the Floors & walls tab and pick the Plank Floor (1 plank). Drag across the ground to lay a row.'),
            o('Raise 8 wooden walls', 'build:wall_wood', 8, 'In the same Floors & walls tab, the Wooden Wall is 2 planks; drag along the edge of the floor and the pieces join up.'),
            o('Build a Doorway', 'build:doorway', 1, 'Leave a gap in the wall and put a Doorway in it. You can walk through; monsters cannot. R turns it.'),
            o('Put on 6 thatch roofs', 'build:roof_thatch', 6, 'The Thatch Roof is 3 fiber and 1 plank. Drag it across the floor. It fades when you stand under it.'),
        ],
        reward: { coin: 140, xp: 90, items: [['bag_satchel', 1], ['plank', 10]] },
    },
    {
        id: 'f6', giver: 'ferro', title: 'Room for More', minLevel: 8, after: 'f5',
        offer: 'A satchel is a start. A proper rucksack of hide and rope carries a hundred more of everything. Make one.',
        thanks: 'Now you can haul a whole forest home. The Explorer\u2019s Pack and the Hauler\u2019s Frame come from my Anvil when you are ready.',
        steps: [
            o('Craft a Rucksack', 'craft:bag_rucksack', 1, 'You need 6 hide (Tuskers drop it), 6 rope (2 fiber each, by hand) and 4 planks. Craft it at a Workbench with C.'),
            o('Wear a pack', 'pack', 1, 'A pack you craft is put on for you if your bag slot is empty; otherwise open the Backpack (I) and click it. Your carry limit is shown at the bottom.'),
        ],
        reward: { coin: 160, xp: 100, items: [['rope', 10]] },
    },
    {
        id: 'f7', giver: 'ferro', title: 'Odd Glass', minLevel: 12, after: 'f2', ch: 10,
        offer: 'That scrap of glass from the foundations is bothering me. I cannot melt it or break it, and it hums at dusk. Make me some honest glass to compare it with, and two lamp posts to hold it next to.',
        thanks: 'Hm. Honest glass goes dull beside it, and the odd piece glows brighter at dusk. Somebody made it on purpose, long ago. I am keeping my ears open.',
        steps: [
            o('Melt 12 glass', 'make:glass', 12, 'Put sand and fuel into a Furnace (E): it melts into glass. Machines you built count, even when a creature feeds them.'),
            o('Build 2 Lamp Posts', 'build:lamppost', 2, 'Press B, open the Light tab: a Lamp Post is 2 iron bars and 1 glass.'),
        ],
        reward: { coin: 220, xp: 140, items: [['crate_wood', 2]] },
    },

    // ── The Night Watcher: the dark ──────────────────────────────────────────
    {
        id: 'w1', giver: 'watcher', title: 'The Long Dark', minLevel: 2,
        offer: 'The dark is not your enemy. It is a test. Stay by the fire, strike what comes close, and see the sun again.',
        thanks: 'You saw the sun again. That is all any of us can ask.',
        steps: [
            o('Survive 2 nights', 'night', 2, 'Stay near a campfire or lantern after dark. Dawn counts the night as survived.'),
            o('Defeat 6 monsters', 'kill', 6, 'Hold Space next to a monster to hit it. A sword helps a lot.'),
        ],
        reward: { coin: 50, xp: 50, items: [['potion_heal', 2]] },
    },
    {
        id: 'w2', giver: 'watcher', title: 'Gel for Ghosts', minLevel: 4, after: 'w1',
        offer: 'Slimes are the first thing the dark learns to make. Their gel is good for many things. Bring me some.',
        thanks: 'Good, sticky, useful. Nothing is wasted in the dark.',
        steps: [
            o('Defeat 10 slimes', 'kill:slime', 10, 'Slimes wander out at night and hop towards you. Two hits each.'),
            o('Hold 8 slime gel', 'have:slimegel', 8, 'Slimes drop gel most of the time. Gel is also used for pods.'),
        ],
        reward: { coin: 80, xp: 70, items: [['potion_might', 1]] },
    },
    {
        id: 'w3', giver: 'watcher', title: 'Bones of the Night', minLevel: 8, after: 'w2',
        offer: 'Not everything that walks at night is soft. The bones will test you.',
        thanks: 'Bone and bow, both beaten. You are ready for harder nights.',
        steps: [
            o('Defeat 5 skeletons', 'kill:skeleton', 5, 'They rattle out of the dark and walk straight at you. Keep moving and swing when they are close.'),
            o('Defeat 3 bone archers', 'kill:archer', 3, 'Archers keep their distance and shoot. Close in fast, or fight them around a corner.'),
        ],
        reward: { coin: 160, xp: 120, points: 1 },
    },
    {
        id: 'w4', giver: 'watcher', title: 'Elite Hunter', minLevel: 12, after: 'w3',
        offer: 'Some of them are older and meaner than the rest. They glow. Put three of them down.',
        thanks: 'Elites fall like anything else. Remember that the next time you are afraid.',
        steps: [
            o('Defeat 3 elite monsters', 'elite', 3, 'Elites glow and have more health. They begin to show up from level 6, mostly at night.'),
        ],
        reward: { coin: 300, xp: 200, points: 1, items: [['potion_guard', 2]] },
    },
    {
        id: 'w5', giver: 'watcher', title: 'Keep the Lights On', minLevel: 9, after: 'w2',
        offer: 'Once there was a light on every island, kept burning all night. Then there was not. I cannot light them all, but you can light a few. Four lanterns, and three nights to prove they stay lit.',
        thanks: 'I counted your lights from the window. Four, all burning. It is a small start. I suspect small starts are how the old chain began.',
        steps: [
            o('Build 4 Lanterns', 'build:lantern', 4, 'Press B, open the Light tab: a Lantern is 2 planks and 1 glass. Melt sand in a Furnace to get glass.'),
            o('Survive 3 nights', 'night', 3, 'Stay near your lanterns or a campfire after dark. Dawn counts the night as survived.'),
        ],
        reward: { coin: 130, xp: 100, items: [['potion_guard', 1], ['crate_wood', 1]] },
    },
    {
        id: 'w6', giver: 'watcher', title: 'Lost in the Dark', minLevel: 18, after: 'w4',
        offer: 'Wraiths are what is left when a light goes out and nobody notices. Cold, lost things. Lay four of them to rest, and bring me what they leave behind.',
        thanks: 'Four lost things, laid down gently. Their cloth is woven from the night itself. Use it well, and keep it close to a light.',
        steps: [
            o('Defeat 4 wraiths', 'kill:wraith', 4, 'Wraiths drift through the dark and hurl cold bolts. Fight near a lantern or campfire, keep moving, and bring healing potions.'),
            o('Hold 2 Wraith Shrouds', 'have:shroud', 2, 'Wraiths often drop a Wraith Shroud when they fall. Check your Backpack (I).'),
        ],
        reward: { coin: 320, xp: 190, points: 1, items: [['crate_silver', 1]] },
    },

    // ── Madame Fortuna: luck ─────────────────────────────────────────────────
    // (ids start with "fo" because Ferro already owns f1 to f7)
    {
        id: 'fo1', giver: 'fortuna', title: 'A Spin of Fortune', minLevel: 8,
        offer: 'Darling, you have the look of someone who enjoys a little surprise. Build me a wheel and give it one spin. The first spin of every day is on the house.',
        thanks: 'See? Round and round, and the world rearranges itself. Keep the silver crate shut for now. I have a feeling it will be wanted.',
        steps: [
            o('Build a Fortune Wheel', 'build:fortune', 1, 'Press B, open the Special tab and pick the Fortune Wheel (20 planks, 4 cloth, 2 gold bars and 60 coins). It is 2 by 2 tiles.'),
            o('Spin the wheel once', 'spin', 1, 'Walk up to the Fortune Wheel and press E, then spin it. Your first spin each day is free.'),
        ],
        reward: { coin: 120, xp: 90, items: [['crate_wood', 1], ['crate_silver', 1]] },
    },
    {
        id: 'fo2', giver: 'fortuna', title: 'Press Your Luck', after: 'fo1',
        offer: 'A wise farmer takes the winnings. A fun farmer takes a risk. Win a coin prize on the wheel, then tell me you will double it. Twice.',
        thanks: 'Win or lose, you gambled with style, and style is the only thing I charge for. Here, for your nerve.',
        steps: [
            o('Try double or nothing 2 times', 'gamble', 2, 'Win a coin prize on the wheel (the half, 1x, 2x, 5x or 12x wedges), then press Double or nothing instead of taking it. Win or lose, each try counts.'),
        ],
        reward: { coin: 160, xp: 110, items: [['crate_wood', 2]] },
    },
    {
        id: 'fo3', giver: 'fortuna', title: 'The Crate Whisperer', after: 'fo1',
        offer: 'Crates, darling. They rattle, they gleam, they keep secrets. Open five, and make sure one of them has silver bands. Listen to the lock. It talks.',
        thanks: 'Did you hear that little click? That is the world saying yes. Here, another one to practise on.',
        steps: [
            o('Open 5 crates', 'crate', 5, 'Crates come from the Fortune Wheel, from monsters and from bosses. Open the Backpack (I) and click a crate to open it.'),
            o('Open a Silver Crate', 'crate:silver', 1, 'Silver Crates come from the wheel’s Silver wedge and from tougher monsters, and some quests pay them. Click one in the Backpack (I).'),
        ],
        reward: { coin: 200, xp: 130, items: [['crate_silver', 1]] },
    },
    {
        id: 'fo4', giver: 'fortuna', title: 'Lucky Streak', minLevel: 10, after: 'fo2',
        offer: 'Luck is a habit, darling. Chop, mine, pick, and let the world surprise you. Five little surprises, and one golden one if the sky is feeling generous.',
        thanks: 'A golden one! Do you know how rare that is? Do not answer. Pocket your winnings and be smug.',
        steps: [
            o('Find 5 Lucky Finds', 'lucky', 5, 'Every time you chop, mine or pick something there is a small chance of a Lucky Find: a bonus pops out. A Lucky Charm and luck skills (K) help.'),
            o('Break a golden node', 'golden', 1, 'Now and then a tree or rock grows with a golden shine. Hold Space next to it: it gives much more, plus a prize.'),
        ],
        reward: { coin: 260, xp: 150, points: 1, items: [['crate_wood', 3]] },
    },
    {
        id: 'fo5', giver: 'fortuna', title: 'Lady Luck’s Favourite', minLevel: 14, after: 'fo4',
        offer: 'The wheel has a favourite, you know. It will never admit it, but it does a little wiggle when you walk up. Spin it twenty-five times and win two gambles, and we shall see who blinks.',
        thanks: 'There, you see? The favourite. I would be jealous if I were not so busy being delighted. This one is for the pocket that never empties.',
        steps: [
            o('Spin the wheel 25 times', 'spin', 25, 'Press E at the Fortune Wheel. One spin a day is free; the others cost coins, a little more each time, so spread them over a few days.'),
            o('Win 2 double-or-nothings', 'gamble:win', 2, 'After a coin prize on the wheel, press Double or nothing instead of taking it. You win a little less than half the time, so be patient.'),
        ],
        reward: { coin: 400, xp: 200, points: 1, items: [['crate_gold', 1]] },
    },

    // ── Finn Digsby: buried treasure and bottles ─────────────────────────────
    {
        id: 't1', giver: 'finn', title: 'Dig Deeper', minLevel: 7,
        offer: 'Psst, you. See the lumpy bits of ground that were not there yesterday? Not rocks, not molehills. Opportunities. Dig up two and I will show you the best day of your life. A little muddy.',
        thanks: 'Ha! Muck on your boots and treasure in your hands. You are one of us now. Welcome to the Digsby way.',
        steps: [
            o('Dig up 2 buried treasures', 'dig', 2, 'Now and then, usually at dawn, a lumpy mound of earth appears on land you own. Hold Space next to it with your pick to dig it up.'),
        ],
        reward: { coin: 100, xp: 80, items: [['crate_wood', 1]] },
    },
    {
        id: 't2', giver: 'finn', title: 'A Letter from the Sea', after: 't1',
        offer: 'The sea buries things too, you know. Cast a line, catch a few fish, and if the water is kind it will send a letter back. Read the first one you find and tell me what it says.',
        thanks: 'Ha, is that a map? No, it is mostly a poem. But the poem has a map hiding in it. They always do.',
        steps: [
            o('Catch 8 fish', 'fish', 8, 'Craft a Fishing Rod at the Workbench (C). Face open water and press {fish} to cast; press it again when the line bites.'),
            o('Read a message in a bottle', 'bottle', 1, 'Now and then a bottle comes up on your line, and crates can hold one too. Open the Backpack (I) and click the bottle to read it.'),
        ],
        reward: { coin: 160, xp: 110, items: [['crate_wood', 2]] },
    },
    {
        id: 't3', giver: 'finn', title: 'X Marks the Spot', minLevel: 12, after: 't2',
        offer: 'Six holes and three letters. That is how a Digsby finds a fortune, and also how a Digsby finds a lot of holes. Dig, read, and let us see if the map makes sense.',
        thanks: 'Do you see it? Every letter says lanterns. Old lights on the water, kept by folk who sang to them. This is bigger than treasure, friend, and that is saying something.',
        steps: [
            o('Dig up 6 buried treasures', 'dig', 6, 'Lumpy mounds appear on land you own now and then, usually at dawn. Hold Space next to one with your pick. Some bottles point you to one.'),
            o('Read 3 messages in bottles', 'bottle', 3, 'Bottles come up on your fishing line now and then, and crates can hold them. Open the Backpack (I) and click a bottle to read it.'),
        ],
        reward: { coin: 260, xp: 160, points: 1, items: [['crate_silver', 1]] },
    },
    {
        id: 't4', giver: 'finn', title: 'The Lanternkeepers', minLevel: 18, after: 't3',
        offer: 'The big one. The letters talk of lantern glass, shards that glow when nobody is looking. Find two, plus a few rare treasures, so we know the keepers left us something worth the trouble.',
        thanks: 'Lantern glass, and warm to the touch! The keepers hid it well, bless them. Do not lose it. I think somebody, somewhere, is still waiting for it.',
        steps: [
            o('Hold 2 Lantern Shards', 'have:lantern_shard', 2, 'Lantern Shards come from Golden and Mythic Crates, wheel jackpots, golden nodes and rare buried treasure. Check the Backpack (I).'),
            o('Get 3 rare finds', 'lootrare', 3, 'An Epic or Legendary item from a crate, the wheel or a buried treasure counts. Golden and Mythic crates hold the most.'),
        ],
        reward: { coin: 400, xp: 200, points: 1, items: [['crate_gold', 1]] },
    },
];

export const QUEST_BY_ID: Record<string, Quest> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
