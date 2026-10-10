// The in-game guide (press H): how to do each thing, step by step. Plain data so a test can check it
// (every topic has steps, icons exist, nothing is too long to fit its page). The screen is
// client/ui/screens/guide.ts. A line is a string, or [keyboard, phone] when a phone needs other words. {move} and {fish} are
// swapped for the player's real keys (ZQSD, WASD…); {use} {build} {bag} {eat} {act} {press} {tap}… (the tutorial's table, see
// WORDS in tutorial.ts) become the key on a keyboard and the button on a phone. A page that is only about keys (the others
// still say "press E") can stay as it is: the phone's own tip on the first page lists what each button stands for.

import { TUNING } from '../config';
import { ITEMS, STARTER_GEAR } from './items';
import { say, WORDS, type Say } from './tutorial';

/** What a new farmer fights with, by its real name (the starting weapon sits in hotbar slot 2). */
const STARTER_WEAPON = ITEMS[STARTER_GEAR.weapon!].name;

export interface GuideTopic {
    id: string;
    name: string;
    /** A texture key: `k_…` for the UI glyphs, `i_<item>` for an item icon. */
    icon: string;
    /** One line under the title. */
    blurb: string;
    /** Numbered, in order. */
    steps: Say[];
    /** Short extras shown under the steps. */
    tips: Say[];
}

/** A guide line for this device: the right one of a pair, with the {tokens} filled in (`keys`: the player's real move and fishing keys). */
export function guideText (s: Say, touch: boolean, keys: { move: string; fish: string }): string {
    return say(s, touch, { ...WORDS[touch ? 'touch' : 'desktop'], ...(touch ? {} : { move: keys.move }), fish: keys.fish });
}

export const GUIDE: GuideTopic[] = [
    {
        id: 'start', name: 'First steps', icon: 'k_sprout',
        blurb: 'Everyone begins alone on a small island. This is the loop of the whole game.',
        steps: [
            ['Use {move} to walk. Hold Space (or the mouse button) beside a tree, rock or berry bush to harvest it. What drops flies into your pockets.',
                'Drag your thumb on the left of the screen (the stick) to walk. Hold ACT beside a tree, rock or berry bush to harvest it. What drops flies into your pockets.'],
            ['Press B (Build) and place a Workbench (6 wood). Chests, campfires and garden beds are in the same menu. Press C for Crafting: rope and bait by hand, most other things at a station.',
                'Tap BUILD and pick a Workbench (6 wood), tap the ground to aim it, tap again to place it. Chests, campfires and garden beds are in the same menu. MENU > Crafting makes rope and bait by hand, most other things need a station.'],
            ['The quest tracker at the top left always shows your next steps. Hover a line to see how to do it; press J for the whole Journal.',
                'The quest tracker at the top left always shows your next steps. Tap it to open the Journal: the whole story, with how to do each step.'],
            ['Every level gives a skill point. Press K and spend it: tools, recipes and buildings unlock through the skill tree.',
                'Every level gives a skill point. Open MENU > Skills and spend it: tools, recipes and buildings unlock through the skill tree.'],
            `When the sun sets, monsters come out. Light a campfire and stay near it, or fight back with your ${STARTER_WEAPON} (hotbar slot 2).`,
            'Walk to the edge of your island and {press} {use} to buy land. Keep going and your island joins up with your friends’ islands.',
            'In the last minute of the day, gather at a Campfire or Table with a friend, or with your companion beside you. A ring fills over the fire, and then you all have Hearthside until dawn: hearts and energy mend faster, +15% XP.',
        ],
        tips: ['The game saves by itself. In a solo world, time stops while a window is open.', ['Forgot a key? Esc opens the menu, and its Controls tab lists every key.', 'Forgot something? MENU > How to play brings this guide back any time.']],
    },
    {
        id: 'farm', name: 'Farming', icon: 'k_drop',
        blurb: 'Garden beds grow wheat, carrots, pumpkins and more. You can walk straight over a bed.',
        steps: [
            'Build a Garden Bed ({build}, Farm tab) for 3 wood. Make a few: crops are your steady income.',
            ['Get seeds: break wildflowers and berry bushes, they drop wheat, carrot, beet, corn and more. Right-click a seed in your Backpack (I) to pin it to the hotbar.',
                'Get seeds: break wildflowers and berry bushes, they drop wheat, carrot, beet, corn and more. Hold a seed in your Backpack (BAG) to pin it to the hotbar.'],
            'Select the seed on your hotbar, stand by an empty bed and {press} {use} to plant it. With no seed selected, {use} lets you choose one from a list.',
            'Wait. Crops grow on their own, faster in the rain and in the right season. A companion with a Farm task also waters them.',
            'When the crop is ripe (full-size with fruit), {press} {use} again to harvest. You get food and often your seed back.',
            'Sell crops at a Market Stall, cook them at a Kitchen, or grind wheat into flour at a Millstone. A little of your harvest becomes seed for the next round.',
            `A Weather Vane (Build, Decor) shows the next three days: rain (crops grow up to ${Math.round(TUNING.rainGrow * 100)}% faster in it), fog, and the nights to come, such as the Blood Moon, meteors and fairies. {press} {use} on it.`,
        ],
        tips: ['Give a creature the Farm task (P, then click it) and it harvests, replants and waters while you do something else.', 'Beds sit under you, so walking through your garden never gets stuck.'],
    },
    {
        id: 'fish', name: 'Fishing', icon: 'i_rod',
        blurb: 'Quiet, relaxing, and you can never lose anything but the fish.',
        steps: [
            'Get a Fishing Rod: press C, open the Workbench tab and craft one (4 wood and 3 rope; rope is 2 fiber, made by hand).',
            'Walk to a shore and face open water. Press {fish} to cast: the bobber lands about 2 to 7 tiles out. “Too close” or “Too far” just means step back or forward.',
            'Wait for a bite. The bobber ripples while the fish thinks. Stay close: if you walk away the line goes slack.',
            'When the bobber dips and a gold ! pops up, press {fish} straight away to hook it. Too early and it is gone; you have about a second.',
            'Big fish fight back. After “Hooked!” answer every tug (a blue !) with {fish} again. Miss or jump the gun twice and it gets away.',
            'Bait helps: craft it by hand (2 fiber + a berry for 2) or from minnows at the Workbench. One bait is used per cast; bites come sooner and rare fish get likelier.',
            'Better rods give more time and rarer fish: the Steel Rod at an Anvil, the Crystal Rod once you know Smithing III.',
        ],
        tips: ['Different fish like different places and times: eels and lanterns at night, trout in cold daylight, koi only in the rain. The Fish tab in your Journal hints at each one.', 'Pearls and odd junk turn up too. Sell fish at a Market Stall.'],
    },
    {
        id: 'craft', name: 'Crafting', icon: 'k_anvil',
        blurb: 'Almost everything is made at a station. Stand next to it and press C.',
        steps: [
            'Press C. With no station nearby you can still make rope and bait by hand. Everything else needs a station.',
            'Build a station from the Build menu (B, Craft tab): Workbench first, then Anvil, Kitchen, Loom and Alchemy Table as the skill tree unlocks them. A station shows up in the Crafting window once you can use it.',
            'Press E on a station (or press C beside it). The window lists what it can make; click a recipe and then Craft.',
            'Pick a recipe to see what it needs: ingredients you lack show in red. A padlock on a recipe means you still have to unlock it in the skill tree.',
            'You do not have to carry everything: crafting also uses the chests within eight tiles of you (pockets first). Put a Chest beside your Workbench and keep it stocked.',
            'Use the search box at the top (or press /) to find a recipe by what it makes or what it needs, across every station.',
            'Machines like the Furnace and Sawmill take ingredients and work on their own. Put things in with E; they carry on while you are away.',
        ],
        tips: ['Ore does not become bars by itself: smelt it in a Furnace (coal, wood or peat as fuel).', 'Bait, ropes and planks are cheap: make a stack of them while you wait for crops.'],
    },
    {
        id: 'house', name: 'Building a house', icon: 'k_hammer',
        blurb: 'Lay a floor, raise walls, add a doorway and a roof. Nothing spawns inside, and monsters cannot get in.',
        steps: [
            'Open the Build menu ({build}): floors are the first things in the Floors & walls tab (Plank, Stone Path, Brick, Slate, Carpet). Drag to lay a whole row at once.',
            'In the same Floors & walls tab pick a wall: wood, stone, brick, or a wall with a window. Drag along the edge of the floor; walls join up with their neighbours by themselves.',
            'Add a Doorway: leave a gap, or place it straight onto a piece of wall and it takes that piece’s place, turned to fit. You walk through it; monsters cannot.',
            ['Put in a Garden Bed, a Chest, a Campfire or a Table, whatever you want inside. You keep placing the same thing until you right-click or press Esc, so a whole row of beds is quick.',
                'Put in a Garden Bed, a Chest, a Campfire or a Table, whatever you want inside. Tap a tile to aim, tap again to place; you keep placing the same thing until you tap CANCEL.'],
            'Finish with a roof: Thatch, Tile or Slate. Drag across the whole room. The roof fades away when you stand under it, so you can see inside.',
            ['To change your mind, point at a wall, floor or anything else (or stand close) and hold X to take it down: the piece is outlined while you hold. You get 60% of its materials back.',
                'To change your mind, stand close to a wall, floor or anything else and hold REMOVE to take it down: the piece is outlined while you hold. You get 60% of its materials back.'],
            'Set a Table (Build, Decor) before a boss and let everyone put out a dish with a buff: four different ones, eight portions each. {press} {use} at it to eat a portion of every dish at once, each buff marked with its cook. {use} again to set out or take back your own.',
        ],
        tips: ['Nothing is ever born on a floor, and nothing is born inside a closed room or yard (walls and doorways all the way round). Flying monsters cannot cross walls, doorways or roofs either.', 'Blueprints (V) copy a whole room and paste it anywhere.'],
    },
    {
        id: 'pack', name: 'Backpack & hotbar', icon: 'k_bag',
        blurb: 'You can carry up to 999 of each item, and a pack lets you carry even more.',
        steps: [
            '{Press} {bag} for your Backpack. The doll on the left shows what you wear, and your outfit appears on your character in the world too.',
            'Every item stacks up to 999 (the limit is shown at the bottom). When a stack is full, you stop picking that item up. Everything else still works.',
            'Make a pack: a Satchel and a Rucksack at the Workbench, an Explorer’s Pack and a Hauler’s Frame at the Anvil, a Rift Pack at the Rift Forge. Each adds more room for every item.',
            ['Equip a pack by clicking it in the Backpack. It goes in the bag slot on the doll (bottom right) and shows on your back in the world.',
                'Equip a pack by tapping it in the Backpack. It goes in the bag slot on the doll (bottom right) and shows on your back in the world.'],
            ['Right-click an item to pin it to the hotbar (slots 1 to 8). Press 1 to 8, or scroll the mouse wheel, to switch. Tools equip, food and potions are used, seeds and pods are held.',
                'Hold an item to pin it to the hotbar (slots 1 to 8). Tap a slot on the hotbar to pick it. Tools equip, food and potions are used, seeds and pods are held.'],
            'Lost in a big pile? Type in the search box (or press /) to filter items. Chests, crafting, the build menu and the market have one too.',
            'Label your chests: open one and press Sort & label. Choose what it takes (all ores, only stone, just seeds, single items) and the icon it wears. It refuses anything else, and inserters and sorting creatures treat it as the home of exactly that.',
        ],
        tips: ['Gear (swords, armour) stacks to 9 whatever pack you wear.', 'If you fall and wake up at home, your things wait where you fell in a Lost Backpack. Walk back (it glows at night) and {press} {use}.'],
    },
    {
        id: 'gear', name: 'Rings, gems & arts', icon: 'i_ring_gold',
        blurb: 'The Equipment Bag (U): five rings, a puzzle bag of relics, gem sockets, and the moves you learn.',
        steps: [
            'Press U for the Equipment Bag. Rings go on five fingers, and all five count. Make them at the Anvil (copper, iron, gold, steel, crystal, Blightcore) or win them from bosses.',
            'The Relic Satchel is a grid: lay relics in it (pick one, then click a cell; R turns it). Relics of one kind that touch give more, and touching kinds make combos like Steam or Aegis. Rings of a relic\u2019s kind boost it too.',
            'Gems are dug up in the caves and found in crates. Two sockets are in your weapon (fire, frost, venom, lightning, life, precision on every hit), one in your helm and one in your armour. Right-click three of a cut to merge them into a finer one.',
            'Combat Arts are learned in the skill tree (Combat): a hook that pulls a monster to you, a stunning arrow, a burst of fire, a Shroud to hide in, a Frost Zone and a Headbutt. Put up to three on the Z, X and N keys in the Arts window.',
        ],
        tips: ['The skill tree has a search box: type "hook" or "ballista" and it flies to the skill.', 'Aim an art with the mouse; on a phone it goes the way you face.'],
    },
    {
        id: 'pets', name: 'Creatures & helpers', icon: 'k_paw',
        blurb: 'Tame wild creatures, take one along, and give it a job.',
        steps: [
            'Learn Taming in the skill tree (K), then craft pods at the Workbench (planks, fiber and a slime gel).',
            'Find a wild creature (they wander the islands, some only at night), select a pod on your hotbar and press T when you are close. Rare creatures are harder to catch; Great and Ultra pods help.',
            'Press P to see your roster. Click a creature to bring it along: it follows you and fights beside you.',
            'Give your companion a job. Click one of its task buttons in the P window, or on its card at the top left: Gather (trees), Mine (rocks), Farm (crops) or Guard (monsters). What it collects goes into your pockets.',
            'Only creatures that are good at a job can do it: the card tells you which. Working makes them level up faster.',
            'To leave a creature working while you do other things, press Give a job… on its card (see Creatures at work). A Creature Den works too: the creatures you leave there work the land around it. Treats keep them happy.',
            'Stand next to your companion and {press} {use} to pet it. Hearts float up and it grows fonder (five pets a day count). A Fond creature digs up a small gift for you once a day, and a Devoted one finds better things.',
        ],
        tips: ['Two creatures and treats in a Hatchery make an egg, and the child inherits the best traits.', 'Creatures that work for you level up, and teach you too: a share of the XP they earn on a job comes to you, even while you are away.'],
    },
    {
        id: 'work', name: 'Creatures at work', icon: 'k_hammer',
        blurb: 'Give a creature a standing job: look after an island, or run a furnace or a workbench for you.',
        steps: [
            'Press P, click a creature and press Give a job…. It leaves your side, goes to its post and keeps working, even while you are away. You can have four at work at once (the skill tree adds more).',
            'Work an island: pick an island you own on the little map, then a job: Lumber, Mining, Farming, Hauling, Sorting or Guarding. A sorter walks between your chests and puts like with like. One creature, one job.',
            'Island workers carry what they get to a Chest near the middle of that island (within nine tiles). Farmers fetch seeds from the chest, plant them in your Garden Beds, harvest and carry the crops back. No chest, or a full one: a bubble says so.',
            'Run a machine: open a Furnace, Sawmill, Millstone, Anvil, Kitchen or Assembler (E) and press Put a creature to work. The keeper loads ingredients and fuel from the chests within nine tiles, empties the machine into them, and makes it run faster.',
            'Run a workshop: do the same at a Workbench, Loom or Alchemy table, then pick a recipe in the Craft window (C), choose how many and press Order. The worker takes the ingredients from your chests, makes them one by one and puts them back.',
            'Press P and open the Workforce tab to see everyone at work, how it is going and how much they have made. Change a job or send a creature home from there.',
        ],
        tips: ['A creature with a bubble over its head needs help: Workforce says what (a chest, fuel, ingredients, power).', 'A creature at work shows what it is doing: an icon over its head and, when you are close, a caption. The more dots it has in a job, the faster it works.'],
    },
    {
        id: 'luck', name: 'Luck & loot', icon: 'k_clover',
        blurb: 'Crates, a Fortune Wheel, buried treasure and little strokes of luck. Press your luck if you dare.',
        steps: [
            'Crates drop from monsters now and then, from bosses and expeditions, and come as quest rewards. Click a crate in your Backpack (I) to open it. Wooden, Silver, Golden, Mythic: the better the crate, the more and the rarer the loot.',
            'Silver crates and better never go long without something epic: after a run of misses the next one is guaranteed to hold it. Luck skills, charms and the Lucky buff make rare finds likelier.',
            'While you chop, mine or pick, a Lucky Find sometimes pops out: coins, a useful item, even a crate. Now and then a tree or rock shines gold. Break it for triple drops and a prize on top.',
            'Buried treasure: a mound with a red X appears on your islands from time to time. Break it like a rock. Bottles from fishing, crates and treasure hold old letters, and each one shows you a mound.',
            'Build a Fortune Wheel (B, Special). The first spin each day is free, more cost coins, a little more each time. Prizes are coins, bundles, crates, and a tiny JACKPOT wedge that gets likelier the longer it misses.',
            'After a coin prize you can press your luck: Double or nothing risks it for a 45% chance to double it, up to four times in a row. Or keep it. Collect Lantern Shards along the way: they are the key to the story.',
        'With friends, a Great Oak or Titan Boulder now and then grows on your islands. It only takes damage while two farmers have swung at it within three seconds. Everyone who helps gets their own pile, and more with every extra hand.',
        ],
        tips: ['Crates in your Backpack can wait: open them when you have a minute, the fanfare is half the fun.', 'The day, the night and the weather never change the odds: only your luck does.'],
    },
    {
        id: 'fight', name: 'Fighting & nights', icon: 'k_sword',
        blurb: 'Nights are dangerous, but easy on a new farmer and they grow with you.',
        steps: [
            ['Hold Space (or the mouse button) to swing the weapon you have equipped. Slimes and bats are gentle; the monsters at night get harder as you and your party level up.',
                'Hold ACT to swing the weapon you have equipped. Slimes and bats are gentle; the monsters at night get harder as you and your party level up.'],
            ['Dodge by walking away from a monster’s windup. With the Dash skill, Shift gives you a quick burst: dash through a hit at the last moment for a Perfect dash (your energy back, and your next hit is a critical one).',
                'Dodge by walking away from a monster’s windup. With the Dash skill, the DASH button gives you a quick burst: dash through a hit at the last moment for a Perfect dash (your energy back, and your next hit is a critical one).'],
            'Eat to heal: {press} {eat} for the best food you carry, or use a hotbar slot. A campfire also heals you at night.',
            'Armour and charms lower the damage you take. Craft better ones at the Anvil, Loom and Alchemy Table, and equip them in the Backpack.',
            'If your hearts run out you are down. A friend can stand next to you and hold {use} to pick you up and you lose nothing. Wake up at home instead and half your XP towards the next level is gone, and your whole backpack stays where you fell.',
            ['On your own, or tired of waiting, press R (or click the button) and you wake up at home straight away.',
                'On your own, or tired of waiting, tap Wake up at home and you are back at home straight away.'],
            'Bosses have attacks that need friends. Frozen: a friend holds {use} beside you to thaw you. Hexed: stand next to a friend and the curse jumps to them. Chained: stay within 7 tiles of your partner. A lone farmer never meets them.',
        ],
        tips: ['The six bosses are called at the Boss Altar with sigils. Bring friends and bring food.', 'A campfire or lantern keeps monsters off the tiles around it.'],
    },
    {
        id: 'quest', name: 'Quests & journal', icon: 'k_book',
        blurb: 'The Journal tells a story, offers side quests and keeps track of everything you found.',
        steps: [
            'Press J. The Story tab has chapters; finish the steps and the chapter is claimed for you with a reward.',
            'Hover a quest line, in the tracker or the Journal, to see how to do it. Steps that need a key press name the key.',
            'Side quests are in the Quests tab: pick one, read what it asks, and press Accept quest. It counts from the moment you take it. You can have a few at once.',
            'Press Pin to screen on a quest to keep it in the tracker at the top left; press it again to unpin.',
            'Daily bounties change every day and pay coins, skill points and items. Medals and the fish and creature logs fill up as you play.',
            'The Chronicle tab is the story of your farm, written by the game as it happens: islands raised, bosses felled, chapters finished, nights survived. Everybody on the farm shares it.',
            'On the first morning of each season after the first, the Season wish window opens. The farm votes for one of three blessings (faster crops, cheaper building, more XP) that helps everyone until the season ends.',
        ],
        tips: ['A quest never takes anything from you. If you already have the item, it still counts.', 'The tracker follows what you pinned, then the story.'],
    },
    {
        id: 'mine', name: 'The caves below', icon: 'k_drill',
        blurb: 'A second world under the first: rock to dig, ore in it, treasure and things in the dark.',
        steps: [
            'Learn Mine Shafts (K, Gathering branch), then build a Mine Shaft from the Special tab of the Build menu (B) and press E on it to climb down. The caves are as big as the world and line up with it: a shaft opens right under where you built it.',
            'Down there it is dark and the rock is solid. Hold the action key (or your finger) beside rock to dig it with your pick. Stone comes out, and coal, iron, copper and gold hide in veins. Crystal needs a gold pick.',
            'Everything you dig stays dug, so you shape the caves as you go. Chests, campfires, lanterns, walls and floors all work down there too.',
            'Creatures of the dark come for whoever digs: more of them, and nastier, the nearer you get to the edge of the map. If you fall, you wake up at home and your backpack stays where you fell, so go back with friends.',
            'Treasure chests, crystal and mushrooms are scattered through the caves. Far out are ancient chambers: square rooms with a vault, watched by elite guardians until you open it. The corner map shows the rock round you, ore in colour.',
            'Every shaft has a ladder at the bottom: press E on it to climb back up. If the shaft is taken down, the ladder goes with it and anyone below is brought up.',
        ],
        tips: ['Gold and crystal are rare near the middle of the map and common near the edge.', 'A lantern lights your way down and the way back.'],
    },
    {
        id: 'dread', name: 'The Dread Reaches', icon: 'k_skull',
        blurb: 'Four dark blocks of haunted land out in the wilds, each guarded by a warden. Bring friends.',
        steps: [
            'Open the map (Esc): the dark violet blocks with a skull, far out near the corners of the world, are the Dread Reaches. Nobody owns them and nobody can buy them: buy the land beside them and you can walk in.',
            'The dead haunt it day and night, tougher than the land around, and more of them the more farmers are inside. Bring armour, potions and a campfire. They fade away again half a minute after the last farmer leaves.',
            'At the heart of each block sleeps a warden: one of the altar bosses, with twice the health and more bite. His health bar shows when you are near, and he never leaves his post.',
            'Everything in the Reaches is richer: more ore, a treasure chest in every outer patch and a vault by the warden. Build a base on the edge, a floor and walls, and go in and out.',
            'Beat a warden with your party and you get all the usual boss spoils plus gold crates and rift shards. He wakes again five days later, so the hoard comes back.',
        ],
        tips: ['It is dim and violet in there even at noon. A lantern or campfire shows you what is coming.', 'If you fall in the Reaches you drop your backpack there: go back for it with friends.'],
    },
    {
        id: 'blight', name: 'The Blight & raids', icon: 'k_tower',
        blurb: 'Dark nest isles out at sea send raids at night. Defend your base, then go and break the nests.',
        steps: [
            `The red marks out at sea on the map are Blight nests, each on a dark isle nobody may buy while its nest lives. A nest within ${TUNING.blight.raidRange} plots of your base (your home, or a campfire on your land) sends part of the night as a raid.`,
            'At dusk a banner says where the raid gathers. Each nest sends waves from its north, then east, south and west side: one small raider at level 1, two at level 2, then more and tougher. They wade over and break what is in their way.',
            'Wall your base in: stone and brick hold longer than wood. Learn Watchtowers (K, Combat) for the Defense tab: Archer Towers, Spike Traps and Fortified Walls. A tower\u2019s kills are yours.',
            'To reach one, buy land toward it. Then hit the nest with your weapon. A nest that is struck wakes its brood, so bring friends, food and potions.',
            'A nest grows a level every night: more health, bigger raids, better spoils. Breaking it pays coins, XP and Blight Cores: Siegeworks (K) turns them into a Ballista and a Tesla Coil (which needs power).',
            'Nests spread to the sea beside them, and two of a kind side by side may merge into one nest with both levels added. A broken nest\u2019s isle is land you can buy.',
            'Build a Bed (Crafting) in an outpost near the nests and press {use} on it: after a fall you wake up there instead of at home.',
        ],
        tips: ['The kind of a nest (Bone, Swarm, Beast or Spirit) says which monsters it hatches.'],
    },
    {
        id: 'friends', name: 'Friends & online', icon: 'k_heart',
        blurb: 'Up to sixteen farmers share one world and one farm.',
        steps: [
            'Everyone starts on their own island, far apart. Buy land towards each other until the islands connect.',
            'Press Enter to chat, G then 1 to 8 for an emote, and middle-click (or Alt+click) to ping a spot on the map.',
            'When a friend goes down, walk up and hold {use} until they get up. They are back with a couple of hearts.',
            ['When you go down, wait for a friend to hold E next to you, or press R to wake up at home. That costs half your XP towards the next level, and your backpack stays where you fell (a Lost Backpack: anybody can fetch things out of it).',
                'When you go down, wait for a friend to hold USE next to you, or tap Wake up at home. That costs half your XP towards the next level, and your backpack stays where you fell (a Lost Backpack: anybody can fetch things out of it).'],
            'Chests, machines and the Market Stall are shared: anyone on the farm can use them. Build a Mailbox and friends can leave you parcels and notes (press {use} at theirs to leave one); a postcard with a small present comes every morning.',
            'The host keeps the world saved. Come back later and everything, including your character, is where you left it.',
            'Pick a name and a secret word when you join. Use the same two on any phone or computer and you are the same farmer, with everything you own. Never share the word.',
        ],
        tips: ['Open the Farmers tab in the menu (Esc) to see what everyone wears.', 'The server’s link (and password, if it has one) is all a friend needs to join.'],
    },
    {
        id: 'factory', name: 'Automation: start here', icon: 'k_gear',
        blurb: 'Machines can work for you round the clock. This page gets your first little production line running.',
        steps: [
            'Learn the skills first (K, the Industry branch): Logistics for belts and inserters, Electricity for poles and turbines, Mining Machines for drills. Each is a single point.',
            'Press V and open Starter layouts: a Smelter line, a Flour mill, a Mining outpost and more, each ready to place with one click. Pick one, press Place it, aim the green ghost and click. R turns it.',
            'Fill the first chest (E): iron ore and a little coal for the Smelter line. Inserters carry it into the furnace and the bars out into the second chest. Open that chest to collect them.',
            'Read the little badge over each machine: a green gear means working, a yellow hourglass means waiting for ingredients, a red bolt means no power, a red flame means no fuel and a red cross means blocked.',
            'Not sure why something stopped? Hover over it (hold a finger on it on a phone) or press E: it says in plain words what it is waiting for and what to do about it.',
            'Press L for the Factory view: the ground dims, every power grid shows in its own colour with how well it is doing, and each machine shows how much it makes a minute.',
        ],
        tips: ['Start small: one drill, one furnace, one chest. Then copy a working line with V and paste another.', 'The Journal’s Factory tab (J) adds up what the whole farm makes each minute.'],
    },
    {
        id: 'belts', name: 'Belts & inserters', icon: 'k_belt',
        blurb: 'How things get from A to B: drills, belts, inserters, splitters, sorters and tunnels.',
        steps: [
            'A Mining Drill (Build, Industry) mines the 2×2 patch of ore under it for ever. It hands ore to whatever stands on the tile in front of it: the arrow on the drill shows the front. It needs power.',
            'Conveyor Belts carry things one tile at a time. Drag to lay a line and press R to turn a piece. Items ride to the end and drop into a chest or machine there. A belt that points at nothing is a dead end, and shows a red cross.',
            'An Inserter has an arm: it picks up from the tile behind it and drops on the tile in front. The dot is the pick-up end, the arrow the drop end. It moves things between chests, belts and machines, and needs power.',
            'A Splitter shares a belt three ways, forward, left and right in turn. A Sorter sends the one item you pick (E) straight on and turns everything else off to its sides.',
            'A Tunnel Entrance and Exit, up to 6 tiles apart and facing the same way, let a belt pass under chests, machines and other belts. Click the entrance to check that they are linked.',
            'Chests are the glue: an inserter can fill one or empty one. Open a chest and press Sort & label to make it take only ores, bars or seeds, so a line never gets mixed up.',
            `An Export Chute (Build, Logistics) sells whatever a belt, inserter or drill drops in: ${Math.round(TUNING.chuteCut * 100)}% of the market price, straight to whoever built it. It never sells gear, tools, pods or crates. {press} {use} to sell only one item.`,
        ],
        tips: ['An inserter only takes what the thing in front of it accepts: it waits when a chest is full or a machine has no use for that item.', 'Stuck belts say why when you hover them: a dead end, two belts facing each other, or a full chest at the end.'],
    },
    {
        id: 'power', name: 'Power & machines', icon: 'k_bolt',
        blurb: 'Drills, inserters and assemblers run on electricity; furnaces burn fuel; sawmills and millstones need neither.',
        steps: [
            'A Wind Turbine (Build, Power) makes free power: 14 to 40 units, as the wind blows. A Coal Generator makes a steady 60 but burns coal, wood or peat. Solar Panels work by day, and Batteries carry a grid through the night.',
            'A Power Pole connects things: it reaches machines within 3 tiles and other poles within 7. Poles that reach each other form one grid, shared by everything wired to it.',
            'A drill uses 20 units, an inserter 3 and an assembler 30. When the grid makes less than its machines want they all slow down; the Factory view (L) shows each grid as a percentage.',
            'A Furnace burns coal, wood or peat: put some in its Fuel slots (E), or let an inserter feed it from a chest that holds coal. A Sawmill and a Millstone need no fuel and no power.',
            'An Assembler builds parts: press E, pick a recipe (gear, wire, circuit…) and feed it the ingredients with inserters from a chest. With no recipe chosen it shows a red cross.',
            'A creature with a standing job at a Furnace, Sawmill, Millstone or Assembler keeps it loaded and emptied from the chests within nine tiles (see Creatures at work).',
        ],
        tips: ['A machine waiting for power shows a red bolt: check that a pole touches it and that the grid has a generator.', 'Two turbines on a busy grid are safer than one: the wind comes and goes.'],
    },
];

export const GUIDE_BY_ID: Record<string, GuideTopic> = Object.fromEntries(GUIDE.map((t) => [t.id, t]));
