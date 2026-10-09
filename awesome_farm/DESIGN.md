# Awesome Farm — design

A living document: what the owner asked for, what exists, how it fits together, and what
could come next. Update it when a system lands.

## Vision (owner, 2026-10-05)

- A Forager-style island game where **up to 16 friends share one persistent world** on a
  self-hosted server (or solo in the browser).
- **You start far away from each other**, and it takes ~10 minutes before you can find each
  other. Then you **build a home farm together** over many hours and days.
- Quests, mobs and **bosses**: epic, tons of content, **slow progression**.
- Downed players can be **revived** (no permadeath).
- A big Forager-style **skill tree** (the "choose one, lose the other" fork idea was dropped
  by the owner), **Factorio-style automation** and **Palworld-style creatures** that work.
- Menus and HUD must look and feel great. Every key action gets a sound, a small particle
  burst and a little camera shake (see CLAUDE.md).

## Pillars

1. **Apart, then together.** Separate islands first; meeting up is the first long goal.
2. **Earned, slow progression.** A hundred-node skill tree, tiered gear, sixteen story
   chapters, six bosses, five expedition rifts and the Abyss; every unlock is something you worked for.
3. **Home is safe and productive; out there is dangerous.** Machines and creatures run the
   farm while you fight, explore and expand.
4. **Juice everything.** Sound + burst + shake on every key action, kept small and quiet.
5. **Casual play must succeed.** Gentle death, soft early monsters, generous economy,
   quiet music.

## Systems (as built)

### World and land
35×35 plots of 18×18 tiles (they were 12×12 until the patches were made half as big again) in open sea; buying a plot
next to any land raises it. Sixteen spawn slots: eight on a ring 6 plots from the centre, eight on a second ring (raised when a farmer arrives) (neighbours ~5 plots
apart, however big the world is). Biomes in rings (meadow, quarry, goldsand, snowcap, bog), and from
12 plots out **the wilds**: snow, quarry and desert, more ruins, treasure and haunted land. Worlds from
before the map grew are carried into the middle of the new one when they load (`sim/migrate.ts`). Plot modifiers: bountiful, fertile, treasure,
haunted, fairy ring, **ancient ruins** (a vault guarded by three elite monsters). Every plot
has **ore veins** under the ground that drills mine. The centre plot is the Old Heart.
Prices scale with each buyer's own purchases.

### Progression
Levels (cap 80) give skill points. The **skill tree** has six branches — Gathering, Farming
& Cooking, Industry, Combat, Taming, Explorer — about 17 nodes each, with ranks, "any of"
requirements, stat mods and **unlock tokens** that gate recipes and buildings. One stat
ledger (skills + gear + buffs + expedition boons) feeds `derived()`.
**XP boosts** stack in that ledger's `xp` stat: the Explorer nodes Scholar, Wisdom, Wanderer and **Sage**, Hearthside, the Bright Minds wish,
the Alchemy Table's XP brews (*Scholar's Tea* +50% for five minutes, *Elixir of Insight* +100% for four, *Bottled Memories* a quarter of
the current level at once, *Kinship Tonic* for creatures; all four also turn up in loot crates) and **Scholar's Day** (`sim/scholar.ts`:
double XP for everybody from dawn to dawn on day 5, every tenth day after it and now and then besides; the weather vane shows it coming).
**Creatures teach their keeper:** whenever a creature earns XP at a job (a den, an island post, a machine or a workshop), its keeper
earns `TUNING.crewXpShare` (25%) of it too, plus the `crewXp` stat (Taming: *Shared Lessons*, *Pack Lore*; the Kinship Tonic), online
or not; dawn (or coming back) tells them how much (`PlayerS.lessons`, `sim/petlib.ts`). The **Journal** (J)
holds a 16-chapter story (every objective says *how* when you hover it; a finished chapter pays and opens
the next by itself, and a **story card** tells what happened and what comes next: `data/story.ts`, shown by
`ui/screens/story.ts`; the last three chapters, *A Stranger on the Pier*, *X Marks the Spot* and *The Last Lantern*,
are the Fortune story that follows the Old Heart), three daily bounties (renewed every three days), **side quests** from nine people of the
island (`data/sidequests.ts`: accept them in the Quests tab, they count from the moment you accept, a few
can be pinned to the tracker), production goals fed by every machine on the farm, a **Factory report**
(live rates and history per item) and 67 medals.

**Hotbar:** eight slots (keys 1–8, mouse wheel). A slot holds a tool or weapon (equips it), food or a potion
(uses it), a seed (plants it at a bed with E) or a pod (T). Pin items from the Backpack with a right-click;
the default layout fills itself from what you carry (`sim/hotbar.ts`).

**Menus list only what you can use** (`sim/listed.ts`): Crafting shows your hands and the Workbench, then each
station once its skill is learned (or you stand at one); Build hides Logistics and Power until the skill tree
opens them. Locked recipes inside a listed category keep their padlock, and search looks through everything.

**Teaching:** the **guide** (H, also a button in the menu) has a page per topic with numbered steps (fishing,
farming, crafting, building a house, packs, creatures, fighting, quests, friends, automation; the words are in
`data/guide.ts`, and a test keeps them true to the recipes; on a phone a long topic is paged). First-time **hints** (`ui/hints.ts`) toast once per
browser: the first time you stand at the water with a rod, fill your pockets, find a pack or lay a floor.

### Gathering, crafting, farming
Twenty-one resource node kinds, 170+ items with rarity, stations (hand, workbench, anvil,
kitchen, loom, alchemy, altar, rift forge), timed processors (furnace, sawmill, millstone,
assembler), garden beds and nine crops (beet, corn, melon, pepper and flax join the first
four), a dozen dishes and brews with buffs. Rain waters crops. **Garden beds are walkable**: they take their
tile (nothing else can be built there) but you walk over them (`World.soft`).

**Backpack and packs:** how many of each item you can hold is `TUNING.baseCarry` plus skills and your **pack**
(a gear slot of its own: Satchel, Rucksack, Explorer's Pack, Hauler's Frame, Rift Pack; +40 to +900 of every
item; gear stays at nine). The Backpack, Crafting, Build, chests and the Market have a search box (press /).

**Outfits show:** head, body, charm, cloak and pack equipment are painted over the farmer in the world, in the
Backpack's paper doll and for friends (`client/art/storybook-worn.ts`).

### Houses and bases
**Safe ground:** nothing spawns on a floor (every floor piece, belts included), and nothing spawns in a *sealed* pocket: ground a monster could not walk out of without touching the sea, closed in by walls, doorways, buildings and trees within 400 tiles (`World.sealed`). Flying monsters cannot cross walls, doorways or roofs (`World.flyBlocked`).
**Dedicated chests:** the Chest window's *Sort & label* sets what a chest takes (`data/filters.ts`: 13 categories like Ores or Seeds, or single items) and the icon it wears on a plate above it. Players, inserters, drills and creature workers all respect it (`accepts`, `stashAt`); sorting creatures treat a labelled chest as the fixed home of what it takes.
**Uber Chests** (skill *Uber Chests* in Industry, after Fast Belts or Overclock): every Uber Chest in the world opens the same store, shared by the whole farm, and each one built adds 800 room (`sim/uber.ts`). The store is `WorldState.uber.inv` and every Uber Chest's `inv` is that very object (linked on load and on build), so hands, inserters, creatures and crafting work it like any chest; a list of nearby chests keeps only one of them (`oneUber`), touching one touches all, and taking the last one down keeps the store for the next.
A **Doorway can be set straight into a wall** (it replaces the piece, gives the wall's materials back and turns to fit the run). **Holding X takes down what you point at** (outlined, with a progress bar; walls and doorways say so in the prompt). Pieces you lay in numbers (garden beds, chests, walls, floors, belts, fences, lamps) keep being placed until you right-click, press Esc or run out of materials; a station, machine, workplace or landmark (Workbench, Furnace, Den, Dock, the Golden Windmill…) is placed once (`isOneOff` in `world/placing.ts`). **Crafting reaches into the chests** within eight tiles of you (`sim/pool.ts`: pockets first, then the nearest chests; coins stay in the pockets), on the server and in the craft window.
Lay a floor (the **Floors & walls** tab, where the walls and roofs are too), raise **walls** (wood, stone, brick, window; 16-frame autotile, they join up), put in a
**doorway** (you walk through, monsters cannot: `World.gate`, used by `mobBlocked`) and cover it with a
**roof** (thatch, tile, slate; `World.roof`; drawn over everything and faded while you stand under it).
Dragging lays a line of floor, wall or roof. A ring of wall with one doorway is a base (Ferro's quests teach it). A **Bed** (Floors & walls) is where you wake up after a fall instead of at home: placing one, or pressing E on any bed, makes it yours (one wake-up spot each, `sim/bed.ts`).

### Automation (Factorio-lite)
Drills mine the veins under them; belts carry items; inserters move items between belts,
chests and machines with optional filters; **splitters** share a belt three ways and
**sorters** send a chosen item straight on and everything else to the sides (they wait rather
than ever void an item); **underground belts** (a Tunnel Entrance and Exit up to 6 tiles apart, items
pass under chests, machines and other belts, with a dotted trail showing the route); wire-linked **power grids** (wind turbines,
coal generators, **solar panels** that follow the sun, and **batteries** that charge on a surplus and carry the
grid through the night) with a satisfaction ratio; assemblers with a recipe picker; a global
production counter. Creatures can haul, stoke and farm without power.

**Factory clarity:** a machine always says what it is doing. The Machine and Device windows give a plain sentence and a hint (working, waiting for named ingredients, no fuel, no power, output full, no recipe, nowhere to put things); a small badge sits over every machine (green gear, yellow hourglass, red bolt, red cross, red flame); inserters show a pick-up dot and a drop arrow; hovering a building (or long-pressing on a phone) explains it; and the **Factory view** (L) dims the ground and lights up the power grids (each its own colour, with its satisfaction), the flows and each machine's rate. All of it reads `shared/sim/status.ts`. The Build menu shows a how-to line and a tiny plan for each automation piece, and the guide has three pages (start here, belts and inserters, power and machines).

### Blueprints
The **Starter layouts** tab (Factory 101) lists eight ready-made, tested production lines (a smelter line, flour mill, plank mill, mining outpost, gear cell, sorting belt, splitter fan and export line), each with a floor-plan preview, what it does, what it needs, where to put it and what to do next; Place hands it to the ordinary paste ghost. Press **V**: copy a stretch of the farm by dragging a box (every building inside, with sorter
and inserter filters and assembler recipes), keep up to fourteen layouts in a per-browser book, and
paste one as a ghost that follows the cursor (R turns it a quarter when it can be turned; green
and red per piece, and what you are short of). One `bp` command places the whole thing: each
piece obeys the ordinary build rules and costs its ordinary price, misfits are skipped, running out
of materials stops it, and one sound and one summary answer it.

### How we know it can be finished
A scripted player (`tests/botlib.ts`) plays the story with real commands only. `bot.test.ts` walks
chapters 1–10 (the first tree to the Golden Windmill, about 1h20 of game time); `bot.late.test.ts`
plays 11–13 (four more guardians, a Rare creature, the rifts, the centre plot, the Old Heart),
skipping pure grind with the debug commands. If a recipe, drop or counter ever breaks the
story, one of them fails.

### Combat
Twelve monsters with distinct AI (hop, chase, ranged, charge, flit, swarm, brute) that
spawn by biome and day, in packs, with elites. Seven weapon types behave differently:
swords cleave, spears pierce, hammers pound, daggers crit, bows and staffs shoot from
range. Projectiles, telegraphed attacks, i-frames and a **dash**.

### Bosses
Six bosses (Slime King, Stone Colossus, Bog Witch, Dune Pharaoh, Frost Giant, the Old
Heart), each with phases and patterns (leap, slam, sweep, charge, radial, aimed, rain,
spiral, summon) that are announced on the ground before they land. Crafted at the **Boss
Altar** with sigils, scaled by party size, leashed to the altar, paying everyone who helped
(trophy, signature gear, skill points). The Old Heart can only be woken at the centre.

Sigils need what each biome's monsters carry (rocklings on the quarry, wisps and toads in
the bog, scarabs in the desert, frostlings on the snow), and monsters spawn on the plot you
stand on and its owned neighbours, with native monsters weighted up. `scripts/balance-hunt.ts`
(in `npm run balance`) counts what a night on a plot yields for a level-16 farmer: 3–7 nights of
killing everything per sigil is the target.

### How hard the night is
Monsters are tuned to **level**, not to the age of the world, so a new farmer joining a long-running
world meets the same night a new world would give them. The *threat level* around a farmer is their
own level, or the average level of everyone playing within a few plots of them (a party shares one
difficulty): it sets which tiers of monster appear (slimes only below level 3, then up to tier 3 from
level 16), their health, how many come each night, whether elites show up (from level 6) and how hard
they hit (softened below level 5). Bosses are the same fight every time. See `sim/mobs.ts` `groupLevel`,
`data/mobs.ts` (`tierCap`, `nightCount`, `softHit`, `eliteChance`) and `tests/threat.test.ts`.

### Creatures (Palworld-lite)
Sixteen species wander owned land by biome and time of day, but rarely: one at a time near a farmer
(a few on a fairy night), so meeting one is a find (`TUNING.wild*`). Throw a **pod** (T): it flies,
shakes and either holds or breaks free. Tamed creatures have levels, traits and work
aptitudes; one follows you as a **companion**, up to three per **Creature Den** work the
land around it (lumber, mining, farming, hauling, kindling, guarding). Roster screen (P)
with a bestiary. **Field tasks:** give your companion a job (Gather, Mine, Farm, Guard) from the roster or its
card: it works the land around *you* and the goods go into your pockets (`sim/jobs.ts` `fieldStep`).
**Posts (standing jobs):** press *Give a job…* on a creature and it leaves your side for good, working while you are
away. A post is either **an island job** (Lumber, Mining, Farming, Hauling or Guarding on a plot you own: the
worker roams the whole island and *carries* what it gets (`CritE.ld`, a dozen things at a time, shown over its
head) to a chest within nine tiles of the island's centre; farmers fetch seeds from a chest, plant them in garden
beds, harvest and carry the crops back) or **a machine or workshop** (a *keeper* for a Furnace, Sawmill, Millstone, Anvil, Kitchen or
Assembler: it fetches ingredients and fuel from chests within nine tiles, empties the output into them and speeds
the machine up; or an *order-taker* at a Workbench, Loom or Alchemy table: set a recipe and a number in the Craft
window and it works through them, taking ingredients from the chests). Posts are `Pet.post` (`PostStatus` in
`Pet.ps` says how it is going; a bubble shows over a worker that needs help), they take one of `workSlots` (4, +1 per
Creature Slots skill) and are mutually exclusive with den, companion and task. All of it lives in `sim/jobs.ts`
(`postStep`, `cmdPost`, `cmdOrder`) on top of the chest helpers in `sim/petlib.ts`, and runs on the server whether or
not the owner is online. UI: the Workforce tab (P), the job screen (`ui/screens/jobpost.ts`) and the worker strip on
the machine and craft windows (`ui/workercard.ts`). The new skill **Handiwork** (`make`) is for workshops and
machines; den workers only turn to it when the land has nothing for them. **Sorting:** an island job where the creature walks between the island's chests and puts like with like (`sortPlan`: each kind of item, by the catalogue's `kind`, gets the chest holding most of it, an unclaimed chest if it has none, and the creature carries the stray stacks there). **Activity:** every worker (and a companion with a task) carries `CritE.ac`, what it is doing now (`ACTIVITY` in `data/creatures.ts`): an icon in a small bubble over its head and, when you are near, a caption ("Chip: chopping") drawn by the HUD. **Breeding:** the Matchmaker skill unlocks a **Hatchery**: two creatures and
three treats make an egg (four minutes, shorter with the Nursery skill); the baby is one of
the parents' species (now and then a rarer relative of the same element), inherits up to two
traits and sometimes grows a new one. The egg's shell is tinted by the element inside.
**Awakening** is the late-game sink: with enough levels (10, 20, 30) and goods (treats, crystals,
rift shards, then rift cores) a creature earns up to three ★: +20% / +45% / +80%
attack, faster work, a new trait on the first and last, and stars that circle its head in the world.

### Expeditions (the roguelike twist)
An **Expedition Dock** (skill: Expedition Pass) launches up to four farmers to one of four
**rift islands** in the sea's corners. Five tiers (Mossy → Heart Rift) with 4–8 waves of
seeded monsters in themed waves (swarm, ranged, heavy, mixed), elites, and a guardian at the
end. **Between waves everyone picks one of three boons** (27 of them, stat changes plus
Regeneration, Aegis, Phoenix Feather, Greed…) that last only for the run. Wave clears pay
coins and XP; a win pays **rift shards**, tier loot and (the first time) skill points. The
**Rift Forge** turns shards and cores into the best weapons and armor. Falling costs
nothing: if everyone is down the run ends and you keep what you earned. A disconnect or a
server restart puts you safely back at the dock. After the five tiers comes **The Abyss**: no
last wave, a guardian every fifth (rotating through four), monsters stronger every wave, a boon
between waves until the pool runs dry, and you cash out at the gate whenever you like (or fall)
for shards by depth; a first dive past wave 10 pays skill points, and the best wave is kept for
medals.

**Omens:** once you have cleared a rift, you can take up to three optional curses at the dock
(Swift, Brutal, Tough, Swarming, Champions, Spartan, Cursed, Relentless) for +10–30% each on
coins, XP and shards. They are the party's, shown beside the plaque, and counted by two medals.
**The rift of the day** is picked from the world seed and the day (same for everyone, among the rifts
you may enter, with two omens already on, +25% and a one-off shard bonus on the first clear). The host
chooses the rift and omens, so asking for another does nothing; a lost or abandoned run does not use it up.

### Fishing
Face open water and press **Q** with a rod in your pockets (workbench). The bobber sits
while the fish thinks, dips with a "!" on a bite and you pull (Q) inside a short window; big
fish then fight in tugs you must answer, each in its own window, and impatience or a missed
tug is a slip (two lose the fish: you never lose anything else). What bites depends on the
biome, the hour, rain, the rod (three tiers) and bait; eleven species (koi only in the rain,
eels at night in bogs, lanternfish after dark, a legendary golden koi), junk and pearls.
Catches have sizes, a personal best and a **fish log** in the Journal; eight cooked dishes,
five medals and the Angler / Lure Maker / Big Haul skills. Other farmers see your line.

### The caves under the world (`shared/cave.ts`, `sim/mines.ts`)
A **Mine Shaft** (skill *Mine Shafts* in the Gathering branch, Special tab of the Build menu) leads down to a second map as big as the world, one tile row block below it in the world grid (`UNDER_Y`; a gap of `UNDER_GAP` rows separates them). It lines up with the surface: a shaft at (x, y) lands at (x, y) down there, in a 7×7 room round a **ladder** (the ladder is made by the shaft, hidden from the build menu, and goes with it). The caves are made from the world seed (cellular automata caverns, ore in clusters that get richer towards the edge of the map: coal/iron/copper in the middle, gold and crystal outward), identically on the server and every client; **rock is `occ === -1` in the world grid**, so walking, building, monsters and flyers all stop at it for free. You dig with the `dig` command (hold the action key at rock that touches open ground; plain rock has 4 hit points, ore 5-10, crystal needs a tier-2 pick), and every tile dug is saved (`WorldState.mine.dug`, world tile indexes) and sent to clients (`TickMsg.dug`, or the welcome). The caves hold sixteen **ancient chambers** (open square rooms with pillars, part of the map itself, at least a third of the way out), each with a vault in the middle and a chest in two corners; while a vault is shut, three elite guardians (two levels above the farmer) stand round it whenever somebody is within twenty tiles. The first descent stocks the caves with treasure chests, crystal clusters and mushrooms too; creatures of the dark (`MobE.und`, `pickCave`) come for whoever is digging and fade away when nobody is below. Falling down there costs the usual (half XP, backpack stays where you fell). The client draws the caves a 32×32 chunk at a time round you (`TileLayer.streamCave`), lights them almost black with a pool of light round you, and turns the corner map into a window of the rock with ore in colour. Rocco Underhill gives three side quests.

### The Dread Reaches (`sim/dread.ts`)
Four **3×3 blocks of haunted bog** sit out in the wilds on the four diagonals (`markDread`; they slide aside where somebody owns the ground in older worlds). They are land from the start and nobody's: nobody can buy them, but the land beside them is bought as usual, and you can build there. They are stocked once with rich ore, a chest node in every outer plot and a vault by the middle. **The dead haunt a block day and night** while a farmer is within (`TUNING.dreadBase` + `dreadPerFarmer` each, up to `dreadMax`; undead one tier tougher than your level calls for, a fifth of them elite; they thin out 30 s after the last farmer leaves). **A warden** (an altar boss: Frost Giant, Dune Pharaoh, Stone Colossus or Bog Witch by block) stands in the middle with `wardenHp` × the health and `wardenDmg` × the damage; he never retreats, mends when alone, and wakes again `wardenRespawnDays` after he falls. His defeat gives the ordinary boss spoils plus two gold crates, rift shards and a chance at a mythic one. The client dims the world to violet inside a block (`Game.dreadAmount`), and the map shows each block with a skull.

### The Blight (`sim/blight.ts`, `sim/raid.ts`)
Out at sea, beyond reach at first, dark **nest isles** carry **Blight nests** (Factorio's spreading biter nests, Kingdom Two Crowns' portals).
A nest isle is a plot marked `blight` (1 while its nest lives: land, nobody's, **not for sale**; 2 once cleansed: land anybody may buy,
and buying it makes it ordinary land). The nest is a `nest` node in its middle, fought with your **weapon** (it is not cleared at dawn).
Its **level** (`Plot.nl`) is 1 when it rises and grows by one every night; its health, its brood and its spoils grow with it. Its
**kind** (`Plot.nk`: Bone, Swarm, Beast or Spirit Nest, `NEST_KINDS` in `data/mobs.ts`, from its isle's biome) decides which family of
monsters it hatches. A world starts with six nests placed from the seed (an older world gets the same ones when it loads:
`blight.ensure`), at least seven plots from every first-ring home and clear of the second ring's home spots. **Each dawn** every nest
grows a level, two nests of the same kind on neighbouring plots may **merge** (8%: one nest on the higher one's plot with both levels
added; the other isle is cleansed), and every nest may **spread** a level-1 nest of its kind onto a neighbouring wild plot (50% plus 1%
per level, up to 90%; never onto anybody's land, the Dread Reaches, the Old Heart or within two plots of a home; at most `nestMax`
nests). A farmer near a nest wakes its **brood**. Destroying a nest pays everyone who fought there XP, coins and **Blight Cores** by its
level, and the isle can be bought. The map marks every nest in red.
**Raids** (They Are Billions, Valheim, Minecraft raids): at nightfall, a farmer whose **base** (the campfire on their own land nearest
to them, or their home island) has a living nest within six plots gets half the night's monsters (plus one per other nest in range and
per four nest levels, at most ten) as a raiding party from the nearest nest, of its kind and a level higher for every three nest
levels. The dusk warning says where it gathers. Raiders **wade** across the sea (slower, with a red glow so you see them coming),
march on the base and attack the **walls and doorways** in their way (`BuildE.hp`: wood 40, stone 100, brick 130, doorway 60, and the
**Fortified Wall**, iron-bound stone, 260, in the Build menu's **Defense** tab after the Combat skill *Watchtowers*); a piece at 0 breaks
(nothing is given back) and everything hurt **mends at dawn** (`sim/defense.ts`). A farmer close by is fought as usual. Raiders melt
away at dawn. Without a
nest in range a night is exactly what it always was (nothing rolls the world's dice unless a raid is coming). Every number is a dial in `TUNING.blight`. Test: `tests/blight.test.ts`.

### Co-op
When down you can wait for a friend to revive you (hold E, which costs nothing) or press **R** (or run out the clock) to wake up at home, which costs **half the XP you have towards the next level and your whole backpack**: it stays where you fell as a **Lost Backpack** (`sim/death.ts`: a hidden building, take-only, anybody can fetch from it, gone when empty or after `TUNING.packLife`). Coins and what you wear are safe, and an expedition costs nothing.
Revive friends (hold E), chat with speech bubbles, emotes (G), pings (middle-click) that
point at off-screen spots, waystones for fast travel, a world-shared travelling trader.
**Accounts:** a farmer is a **name + secret word**, set the first time you join a server and used the same way on any device (`WorldState.accounts`: salted, stretched SHA-256, never sent to clients, throttled after six wrong tries). A new name adopts the farmer that device already had, so existing progress is kept. Joining without a name and word still works; it makes a farmer tied to that browser. Solo is unaffected.

### Fortune: loot, luck and the wheel (`sim/fortune.ts`, `data/loot.ts`)
**Crates** (Wooden, Silver, Golden, Mythic: items you click in the Backpack) come from monsters and bosses, expeditions, quests, buried treasure and
the wheel. A crate rolls a few things from rarity-ranked pools (`LOOT_POOL`); better crates roll more, bigger, and rarer, golden and
mythic ones always hold something rare or epic, and silver and up have a pity counter so an epic is never more than eight crates away.
A reveal screen (`screens/loot.ts`) shakes the crate, pops it and shows the prizes one by one with sparkles that grow with their rarity.
**Lucky Finds** (a few percent of every node you break), **golden nodes** (about 1 in 80: triple drops, a prize and a crate) and **buried
treasure** (a mound with a red X that grows on your islands at dawn, or that a *message in a bottle* reveals) are the small chances in
everyday play. The **Fortune Wheel** (a building) gives one free spin a day and more for coins (a little dearer each time); wedges
are coins, bundles, crates and a JACKPOT whose odds grow with every paid spin that misses; after a coin prize you may press your luck:
**double or nothing** at 45%, up to four in a row (the house keeps a little, so it is a coin sink). Lantern Shards, which come only
from this luck, are what the last chapter asks for. **All the dice here are separate from the world's** (`luckRng`: seeded from the world seed,
the farmer and a saved counter), so tuning loot can never change how a world grows or a fight goes; the server rolls everything and the
client only animates it. Counters for quests: `crate:<tier>`, `spin:free|paid`, `jackpot`, `gamble:win|lose`, `lucky`, `golden`, `dig`, `bottle`, `shard`, `lootrare`.

### Seasons
A year is four weeks of game days (spring, summer, autumn, winter), a pure function of the
day number like the weather. Spring grows crops faster and rains more; summer has short
nights; autumn harvests often give one more; winter slows crops to under half and lengthens the
night. The world is tinted faintly by season, with leaves, petals, snow and summer fireflies
drifting through; every season announces itself on its first morning.

### Atmosphere
A day is five minutes of daylight and under a minute of night (`TUNING.dayLength`, `nightLength`). A minute before dusk the sun is
"sinking" (banner, toast and a countdown at the top of the screen), twenty seconds before it sounds an alarm.
Day/night with a light map (fires, lanterns, glowing things cut pools out of the dark),
weather (rain, fog, storms with lightning), quiet generative day/night/boss music, a
first-run welcome card.

## Architecture

**One simulation, three hosts.** `src/shared` is pure TypeScript (no Phaser, no DOM).
`SimHost` runs a world for any number of peers:

- **Solo:** inside the browser (`LocalConnection`), saved to `localStorage`.
- **Cloudflare:** `server/cf/worker.ts`, a Worker and one Durable Object per world on the Workers Free plan: the
  always-on home of the owner's world; the game page itself is on Cloudflare Pages. Its address is the link to share.
- **Dedicated server:** `server/main.ts`, one Node process bundled into
  `awesome-farm-server.mjs` (`npm run server:build` → `server-dist/`). Serves the game,
  accepts WebSockets at `/ws`, saves atomically to `worlds/<name>.json` (+ `.bak`), has an
  optional password and `/status`. Saves it cannot read are set aside, never overwritten, and the
  `.bak` is loaded instead; a tick that throws is written to a crash file, never over the save. A line that
  drops keeps the farmer for 30 s and the client reconnects by itself. Other farmers arrive in the welcome as their
  public view only.
- State is plain JSON (`WorldState`, `STATE_VERSION`), commands (`Cmd`) are validated by the
  server, events (`SimEvent`) become client effects. Movement is client-authoritative with
  sanity checks. The server streams only entities near each player (area of interest).
- `PROTOCOL` must be bumped on any wire change; old clients are refused with a clear message.

Feature code is split by module under `src/shared/sim/`: one file per system (economy, gather, machines, factory, power,
mobs, combat, boss, creatures and the jobs-* files, quests, shop, rift, fishing, fortune, mail, wish…) plus clock, health and
social for the day, the farmer's life and the chat; CLAUDE.md's folder layout lists them all. Content lives in `data/` tables
read by both sides.

### Two views of one world: 2D and 3D (beta) (2026-10-08)
Players choose how the world is drawn: the classic **2D** view (the default) or a low-poly **3D** view (beta), on the title
screen and in Settings. It is a second *picture* of the same game, not a second game: the Game scene keeps the connection, the
state mirror, movement, keys, targeting and placing in both, and in 3D it hides its sprites and feeds `src/client3d/view3d.ts`
the same state and events through one documented seam (`client/world/view3d-bridge.ts`: `View3D` for drawing, `WorldPointer`
for the pointer). The real Phaser HUD, with every menu and window, draws on top of the 3D canvas, so nothing about the UI is
built twice. The 3D code and three.js are a chunk of their own, loaded only when 3D is chosen: 2D players download nothing more.
CLAUDE.md, "The 3D view", has the rules.

**Stage 1 (built):** walking, gathering, planting and harvesting, building with a 3D ghost that goes green or red by the real
placement rules, fighting (models, hp bars, telegraph circles, a target ring), day and night with lamps and rain, land rising
out of the sea, other farmers in multiplayer, live or one-reload switching, every model or a written-down placeholder.

**Stage 2, the world (built):** the caves under the world (rock and floor streamed round you, rebuilt as it is dug, ore that glints,
the dark tinted by depth as in 2D with the light you carry), the Dread Reaches' dim violet day and veil, the four seasons on the ground
and the plants (blossom, autumn colours and straw grass, snow on what faces the sky) with leaves, petals and snow in the air, fog
mornings, rain rings, a storm's lightning (with the 2D thunder), the special nights (Blood Moon, Fairy Night, Meteor Shower), every
2D light source lighting the night with pools on the ground, the dusk hearth circles, the rift gates, and terrain fixes (the cliffs'
fronts and the ore veins were never drawn; veins now join into patches like the 2D vein tiles; the ground under you is built first,
so a slow device no longer starts on open sea).

**Stage 2, entities (built):** no placeholders left: the export chute (gulps and flips a coin on each sale, wears its one item),
the mailbox (the flag swings up with a letter while post waits), the weather vane (turns to the day's wind under a little 3D
picture of tomorrow's forecast), the Great Oak (a titan pine on snowy islands) and the Titan Boulder with their gold ground ring,
"2+" badge and health bar; one model per projectile kind (arrow, orb, rock, spore, frost, fire, bolt) flying nose first; a boss's
whole body moves through each attack pattern on the scripts' timings (leap, slam, sweep, charge, radial, aimed, rain, spiral,
summon, freeze, hex, chain); creatures hold a tool or carry a load for what they are doing (an axe to chop, a can to water, a crate
to haul ...) and den workers with nothing to do sleep; the farmer flinches and flashes when hit, blinks while invulnerable and has a
pulsing ring calling for help when down; the co-op statuses (ice block, hex wisps, the chain between two farmers); a beaten monster
flashes and shrinks away and a picked-up drop flies to the farmer. The coverage test now spans buildings, nodes, monsters,
creatures, items, projectiles, crop stages, boss patterns, creature activities, every character creator choice (each must look
different), gear and co-op statuses, all read from the data, so new content without a model fails.

**Still to do for parity** (each a self-contained job; the tag is the area):
- WORLD: the expedition arena's own look (it is a rift island with monsters, drawn as such); height (terrain is flat: `groundY` is 0);
  roofs, buildings and crops do not take snow in winter (only the ground and the nodes change with the seasons).
- ENTITIES: creature workers' activity icons and post bubbles (the props in hand are built; the floating icon is not), pod throws and
  catches, the companion's pat (the `hop` event); fishing (line, bobber, splash); a check that every machine runs as in 2D (inserter
  arms, belt items, drills, windmills); the pop-in of new things (it must not change a model's pick box while it grows).
- OVERLAYS (built 2026-10-09): the 2D overlays are laid onto the 3D ground by an overlay camera (badges, the Factory view, inserter
  marks, the placement and blueprint overlays, dismantle outline, fishing, swing arcs, monster marks, the Perfect ring);
  warnings in their real shapes and colours, boss arenas, power wires and pasted-blueprint ghosts are painted in 3D. Still open: the
  overlays are drawn over the models (a badge never hides behind a tree); the 2D target brackets are left to the 3D target ring; land
  price plates and name tags use the ground point plus the 2D offset (about head height, not measured per model); 58 of the game's 96
  juice actions still use a generic puff in 3D (the 2D `FX` table has them all; sounds are shared already).
- CONTROLS (built: `src/client3d/camera.ts`, `client/world/photocam.ts`): the follow camera at the prototype's angle, frame-rate
  independent; the 2D zoom steps from the wheel, + and -, the buttons and the pinch; the shake read from the 2D camera (so the juice table
  and its "only your own actions" rule hold); the Perfect beat (real-time camera, push in, drained colour); a dip to black down a shaft,
  up again and through a waystone; photo mode (F2) turns, tilts and zooms the camera, with the keys still moving up the screen. Pinch,
  touch aim and the long press are checked with emulated touch in Chromium, not yet on a real phone. Still to do: picking ignores farmers
  (reviving a friend works by standing near, as in 2D); the game camera itself never turns (only photo mode's does).
- PERF: in 3D the hidden Game scene still builds and updates its 2D sprites (cheap, but not free on a phone); the 3D chunk is large
  (three.js plus the model library) and could be split further (models on first use); one-off model geometries (not from `bake`) are
  drawn one by one; Auto steps down on slow frames but never back up; frame rates on real GPUs and phones are still not measured.

**Stage 2, the budget (built):** a **3D quality** setting (Pause menu, Settings, World view: Auto, Low, Medium, High; Auto is High on a
computer, Medium on a phone, Low on a phone with 4 cores or 3 GB or less, and steps down once if frames stay under ~24 a second): pixel
ratio caps (2 / 1.5 / 1, phones 1.5 / 1.25 / 1), the sun's shadow map (2048 soft / 1024 / none), the glow, multisampling (4 / 2 / 0),
night lamps (8 / 4 / 2) and ambient life. **Instancing** (`src/client3d/batch.ts`): every frame the visible meshes that share a baked
geometry and material are drawn as one InstancedMesh. **Culling by the view:** the ground is built, and models animated and matrix-updated,
only as far as the camera sees plus a margin; the sun's shadow box fits the view and slides in whole texels. **Lights:** by day the lamps
and the moon leave the scene (a light at no intensity still costs every lit pixel), and at night the sun casts no shadow. **No leaks:** a ledger of everything the renderer
uploaded is handed back when the view goes (3D to 2D, or leaving the world); before, every switch left a dead renderer behind, held by the
model caches' dispose listeners.
Measured in Chromium (software GL, so the times are only relative) on a busy world (25 plots, 2,750 buildings, 760 nodes; the farmer in
the middle), High, day:

| | draw calls | triangles | view's JS per frame | whole frame (software GL) |
|---|---|---|---|---|
| before, classic zoom | 2,505 | 255k | 21 ms | 1,670 ms |
| after, classic zoom | 208 | 107k | 8.4 ms | 837 ms |
| before, zoomed out | 3,280 | 306k | 26 ms | 2,220 ms |
| after, zoomed out | 328 | 249k | 12.9 ms | 964 ms |
| after, classic zoom, Medium / Low | 264 / 114 | 114k / 60k | 13 / 10 ms | 840 / 237 ms |

At night the sun's shadow pass is skipped (142 draw calls at High). Instancing alone (switched off in the same session, zoomed out): 2,323 draw calls, 377 with it. Five 3D -> 2D -> 3D switches: the JS heap
stays flat (454 to 455 MB) and one renderer is alive (it was one more per switch).

**Stage 2, the art pass (2026-10-09):** scored with the 10-category visual scorecard (0 placeholder, 1 basic, 2 premium stylized,
3 showcase) on active-play shots of a busy solo world (desktop 1280x720 on High; phone 390x844 and 844x390 on Auto, which is Low there)
by day, at dusk with lamps, at night, in heavy rain, at a factory, in a fight, at a boss and in the caves. Before, the three weakest:
the night painted stone and metal royal blue, rain looked like a sunny day with thin ticks, the caves were darkness standing in for
form (rock and floor nearly one colour), nothing was grounded on Low or at night (no shadows at all), and a blow landing was only a
handful of tetrahedra. The pass, all in the prototype's flat low-poly style and costing at most five draw calls:
- Lighting and grade (`sky.ts`, `mood.ts`): a moonlit slate night with a silver moon, a little darker so lamps are the warm colour;
  a golden hour with lavender shade; rain as an overcast (sun nearly gone, an even grey sky light, cooler, dimmer, less colour);
  soft contact shadows under everything that stands at every quality level (`contact.ts`); the cave floor sinks into shadow by height.
- Materials (`wet.ts`, `caves.ts`): rain darkens the ground and makes it glossier, it dries slowly, and puddles that mirror the sky gather
  on open land; cave rock has a lighter worn lip where it meets the floor.
- VFX (`impacts.ts`, `weather.ts`): a ring spreading over the ground for 36 actions (hits, breaks, kills, a boss's slam and roar, level
  ups, building, buying land ...) with a flash for the big ones, dust at running feet, and rain streaks that lean with the wind and fade
  from tail to head. Low keeps the grade and contact shadows, and drops puddles, dust and half the rain.

| Category | before | after | evidence |
|---|---|---|---|
| Art direction | 2 | 2 | one pastel low-poly language from HUD to world; the moods now differ by light, not by tint alone |
| Hero (the farmer) | 2 | 2 | unchanged model; now grounded by a contact shadow and kicking dust |
| Obstacles / enemies | 2 | 2 | unchanged models; hits and slams now ring on the ground |
| Rewards / interactables | 2 | 2 | unchanged; build, harvest and level-up rings |
| World | 2 | 2 | caves now read as blocks and floor across the screen; terrain still flat |
| Materials | 1.5 | 2 | wet ground and puddles, cave lips and height grade; still one roughness for most models, no decal kit |
| Lighting / render | 1.5 | 2 | night, dusk and rain each have their own light; contact shadows on Low |
| VFX / motion | 1.5 | 2 | event rings and flashes, dust, wind-driven rain; the bursts themselves are still the generic tetrahedra |
| UI / HUD | 2.5 | 2.5 | not touched |
| Performance evidence | 2 | 2 | counts per scene below; software GL only |
| **Average** | **1.9** | **2.05** | below the premium bar (every category 2, average 2.3) |

Draw calls / triangles at High, 1280x720, after the pass (the worlds are new each run, so before and after differ by layout too):
day 232 / 101k, dusk 258 / 132k, night 120 / 56k, rain 241 / 106k, factory 250 / 123k, fight 143 / 57k, boss 303 / 158k (over the
300 desktop start budget, as before at 298), caves 48 / 12k. Phone (Low): 120 to 137 draw calls, 56k to 59k triangles, no shadow map.
Next passes for premium: material roles on the models (metal, glass, cloth read differently), bursts per action family instead of
tetrahedra, terrain height, and the HUD's overlays drawn behind tall models.

**Stage 2, QA before release (2026-10-09):** played in Chromium (software GL) on the dev build and on `play/`. Checked: the title
toggle (2D lit on a fresh browser, the choice saved); solo 2D, then 3D (one reload straight back into the same world: inventory, coins,
level, buildings and position the same), four live 3D/2D/3D switches (one 3D view alive, heap flat, no extra canvas), back to 2D and a
full reload; Save & quit from 3D, then 2D from the title; a triple switch in one frame (ends in the last choice, no stray view); photo
mode with drag and wheel; a window resize; two players on `npm run server` (2D in one tab, 3D in `?profile=2`: each sees the other
move and chat, the 2D tab switches to 3D and rejoins as the same farmer); a phone (touch UI, 844x390: the stick walks, a tap aims
through the 3D pointer; 390x844 shows the "turn your phone sideways" card as in 2D); AZERTY by position in 3D (Z Q S D walk north,
west, south, east; & and é pick slots 1 and 2). No page errors. 2D against origin/main from the same saved world and dice, stepped
frame by frame: the HUD pixel for pixel the same, the world the same apart from the fog blobs and pulses placed by wall-clock dice.
`play/` sizes (raw / gzip): 2D main chunk 1,238,750 / 428,253 bytes (origin/main 1,233,964 / 426,545, +0.4%), Phaser unchanged,
the 3D chunk 984,926 / 287,623 (stage 1 was 893,000 / 255,907) and only requested once 3D is chosen.

### Co-op life (2026-10-07)
Eleven of the ideas in [IDEAS.md](IDEAS.md) are built, each documented under "Adding content" in CLAUDE.md: the **farm chronicle** (a storybook line per milestone in the Journal), the **season wish** (a world-wide vote on each season's first morning), the **mailbox** (parcels and notes between farmers, a postcard every dawn), the **evening hearth** (sit at a fire together at dusk for Hearthside), **pet and gifts** (pet your companion, it digs up presents), the **Perfect dash** (a slow-motion beat, energy back and a crit for dashing through a telegraph at the last instant), **Titan nodes** (a Great Oak or Titan Boulder only two farmers can fell), the **export chute** (a belt-fed sink that sells at 85%), the **weather vane** (a three-day forecast), the **potluck table** (every cook's dish in one feast) and **co-op boss statuses** (Frozen, Hexed and Tethered: patterns a boss only lays when two or more farmers are up). A **photo mode** (F2) hides the HUD, and the **character creator** picks the farmer's look and scarf.

## Ideas not built yet

The long list, with effort estimates and a top ten, is [IDEAS.md](IDEAS.md). The larger directions:

- Creature evolutions; creature skills in combat (signature moves).
- Creature posts that follow a schedule (day shift / night guard), or take instructions from a sign or a wire.
- A browser-hosted world over a tiny relay (no server needed).
- Long-range logistics (trains, an aerial ropeway) for the factory.
- Weekly or seasonal events (Festival eve), cottages for the quest givers, the Lantern Chain.
- Prestige: a "New Game+" after the Old Heart with scaled monsters.
- Localisation.
