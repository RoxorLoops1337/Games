// The hand-written words of the player wiki (scripts/wiki.ts): what each section is about, in plain language.
// Only explanations live here. Every number, name, cost, requirement and list on the page is read from the game's
// own data by the generator, so keep figures out of these lines (say "a little", "more", "the next level"...).

export const SITE = {
    title: 'Awesome Farm Wiki',
    tagline: 'Everything in the game, and how to unlock it.',
    play: '../play/',
    blurb: 'Awesome Farm is a cosy co-op island game for up to sixteen friends. Everybody starts on their own little island far out at sea, '
        + 'chops, mines and farms, buys land until the islands join up, and then builds one big farm together: machines, creatures that work, '
        + 'bosses, expeditions into the rifts and a long story. You can play alone in your browser too.',
};

/** One paragraph (or a few) at the top of each section. */
export const INTRO: Record<string, string[]> = {
    start: [
        'You wake up on a small island with a flint pick and a wooden club. Everything else you gather, craft or build yourself. '
        + 'The tutorial card at the top of the screen walks you through the first ten minutes; the steps are listed below, followed by the in-game guide\'s first page.',
        'The game saves by itself. In a solo world time stops while a window is open; online, the world keeps going.',
    ],
    controls: [
        'Movement and the fishing key follow the position of the keys, not the letters printed on them. On an AZERTY keyboard you walk with the keys where WASD would be, and the game names them for you everywhere (in the guide, the tutorial and the hints). The number keys work unshifted on AZERTY too.',
        'On a phone there are buttons instead of keys: a stick on the lower left, and round buttons on the right.',
    ],
    progress: [
        'Almost everything you do earns XP. Every level gives one skill point to spend in the skill tree, and story chapters, bosses, expeditions, bounties, goals and medals pay extra points.',
    ],
    xpsources: [
        'The amounts below are the base XP. Every XP boost you have multiplies them (see the next table).',
    ],
    unlocks: [
        'Recipes and buildings with a padlock are opened by a skill. Each skill node needs at least one rank in ANY of the nodes it lists, starting from the hub. '
        + 'The path shown is the cheapest one in skill points from the hub.',
    ],
    skills: [
        'Six branches fan out from the hub. A node can be learned once any one of its listed nodes has a rank. Bonuses are per rank and add up; unlocks come with the first rank. Keystones are the big nodes at the end of a branch.',
    ],
    items: [
        'Every item in the game. Click a name anywhere on this page to jump to it. "How to get it" lists every source; "Used for" lists every recipe and building that needs it. You can carry up to the base stack of each item (packs and skills raise it); gear stacks to nine.',
    ],
    crafting: [
        'Stations craft instantly: stand next to one and press C (or E on it). Crafting also takes from the chests within eight tiles of you, pockets first. '
        + 'Machines (Furnace, Sawmill, Millstone, Assembler) take ingredients and work on their own over time.',
    ],
    buildings: [
        'Press B for the Build menu. Most buildings are placed once; walls, floors, belts, beds, chests and fences keep being placed until you stop. Holding X takes down what you point at and gives back part of its materials.',
    ],
    farming: [
        'Garden beds grow crops in two stages. You can walk right over a bed. Rain makes growing beds grow faster (it does not water them), the season changes how fast crops grow, and autumn harvests often give one more.',
    ],
    factory: [
        'Drills mine the ore veins under them, belts carry items, inserters move them between chests, belts and machines, and power poles wire machines to generators. Every machine says what it is doing: hover it, long-press it on a phone, or press E on it. Press L for the Factory view.',
    ],
    world: [
        'The world is a big grid of island plots in open sea. Buying a plot next to land you own raises it from the sea. Plots have a biome and sometimes a modifier. The plot in the very middle is the Old Heart\'s.',
    ],
    combat: [
        'Monsters come out at night, and they are tuned to your level, not to the age of the world: a new farmer in an old world meets the same nights a new world would give. Bosses are summoned at the Boss Altar with a sigil.',
    ],
    creatures: [
        'Wild creatures wander owned land, rarely and one at a time. Throw a pod (T) to befriend one. Tamed creatures level up, can follow you as a companion, work beside you, or take a standing job on an island, at a machine or at a workshop.',
    ],
    rifts: [
        'An Expedition Dock launches a party to one of the rift islands in the corners of the sea. Each tier is a run of waves with a guardian at the end; between waves everybody picks one of three boons that last only for the run. Falling costs nothing on an expedition.',
    ],
    fishing: [
        'Face open water with a rod in your pockets and press the fishing key to cast. Wait for the bite (the bobber dips and a gold ! appears), press again to hook it, then answer every tug of a big fish. Missing too many lets it get away; you never lose anything but the fish.',
    ],
    quests: [
        'Press J for the Journal. The story runs by itself; side quests are accepted from the Quests tab and count from the moment you accept them.',
    ],
    fortune: [
        'Crates open from the Backpack (click one). Better crates roll more things, bigger stacks and rarer classes. All the luck dice are separate from the world\'s, so luck never changes how the world grows.',
    ],
    multiplayer: [
        'Up to sixteen farmers share one world. Everybody starts on their own island, far apart, and buys land towards the others until the islands connect. Chests, machines and the Market Stall are shared.',
        'Join a server from the title screen: paste its address in the Join box (a link with ?server= fills it in for you), pick a name and a secret word. Use the same name and word on any phone or computer and you are the same farmer. Solo worlds live in your browser.',
        'Play online shows the servers as buttons (Meadow, Quarry, Snowcap). Each is a separate world with its own farmers and save, and only the one you pick wakes up. Your name and secret word make a separate farmer on each.',
        'The always-on world runs on a server around the clock, so the farm keeps going (machines, creatures at work, the seasons) while everybody is away. Anyone can also host a world on a PC with the server package.',
    ],
    buffs: [
        'Buffs are short boosts from food, potions and events. Eating the same buff again refreshes it rather than stacking. Buff duration skills make them last longer.',
    ],
    stats: [
        'Every bonus in the game goes into one ledger: skills (per rank), equipped gear, active buffs, expedition boons and the season wish all add to the same stats.',
    ],
    guide: [
        'The in-game guide (H), page by page, as a keyboard player reads it.',
    ],
    tips: [
        'Progression tips pop up once each as the game opens out. All of them, in one place.',
    ],
};

/** How each monster behaviour plays. */
export const AI_WORDS: Record<string, string> = {
    hop: 'Hops towards you in short bursts.',
    chase: 'Walks straight at you and does not give up.',
    ranged: 'Keeps its distance and shoots.',
    charge: 'Winds up, then rams in a straight line: sidestep it.',
    flit: 'Fast and erratic, and flies over water.',
    swarm: 'Quick little pack hunters.',
    brute: 'Slow, heavy and tough.',
    boss: 'Driven by its pattern list (see Bosses).',
};

/** What each boss pattern does. */
export const PATTERN_WORDS: Record<string, string> = {
    slam: 'Slams the ground around itself: step out of the red ring.',
    summon: 'Calls its minions.',
    radial: 'Fires a ring of shots in every direction.',
    aimed: 'Fires a volley straight at a farmer.',
    charge: 'Dashes through the arena in a line.',
    rain: 'Marked spots on the ground get hit from above.',
    spiral: 'Spins out a spiral of shots.',
    sweep: 'A wide sweep in front of it.',
    leap: 'Leaps onto a marked spot.',
    freeze: 'Co-op only: freezes a farmer solid until a friend thaws them.',
    hex: 'Co-op only: curses a farmer; touch a friend to pass the curse on.',
    chain: 'Co-op only: chains two farmers together.',
};

/** How each kind of weapon plays. */
export const WEAPON_WORDS: Record<string, string> = {
    fist: 'Bare hands.',
    club: 'A simple swing.',
    dagger: 'Very quick, good at critical hits.',
    sword: 'Swings in a wide arc and cleaves.',
    spear: 'Long reach, hits everything in a line.',
    hammer: 'Slow and heavy: smashes everything around you.',
    bow: 'Shoots from range; each shot costs a little energy.',
    staff: 'Fires a bolt that bursts on impact.',
};

/** Buffs that come from something other than an item (items are found by the generator). */
export const BUFF_SOURCES: Record<string, string> = {
    perfect: 'A Perfect dash: dash through an attack at the last moment.',
    scholarday: "Scholar's Day: everybody gets it from dawn to the next dawn.",
    hearth: 'The evening hearth: sit at a fire with company in the last minute of the day.',
    lucky: 'A Fairy Night gives it to everybody online.',
};

/** Lines about the evening and the night that the data tables do not say in words. */
export const NIGHT_WORDS = {
    bloodmoon: 'Every seventh night. More monsters, more elites, more XP and double coins from kills, and a coin reward at dawn for everybody still standing.',
    meteors: 'Now and then. Crystal, gold and iron nodes fall onto owned land during the night.',
    fairies: 'Now and then. Everybody online is healed, filled with energy and made Lucky, and more wild creatures are about.',
};

export const PROSE = {
    elites: 'Elites are tougher versions of ordinary monsters: more health, harder hits, more XP, double coins and a better chance of a crate, and now and then a potion or a bar on top. They start to show up once your threat level is high enough, and a Blood Moon makes them far more common.',
    threat: 'Your threat level is your own level, or the average level of the farmers playing near you (a party shares one difficulty). It decides which tiers of monster roam, how many come each night, whether elites appear and how hard newcomers get bitten.',
    death: 'When your hearts run out you are down. A friend can hold E beside you to pick you up, and you lose nothing. If nobody comes (or you press R), you wake up at home: you lose part of the XP you had towards your next level and your whole backpack stays where you fell as a Lost Backpack. Anybody can take things out of it; it glows at night. Coins and what you wear are safe, and falling on an expedition costs nothing.',
    perfect: 'With the Dash skill, Shift (DASH on a phone) rolls you away with a moment of invulnerability. Dash through an attack at the last instant and you pull off a Perfect dash: the dash\'s energy comes back, time slows for a beat, and your next hit on a monster is a critical one.',
    altar: 'Learn Boss Hunter (Combat) to build the Boss Altar. Craft a sigil at the altar from the drops of that biome\'s monsters, then use the sigil at the altar to summon the boss. Its health scales with the farmers nearby, it stays leashed to its arena, and everybody who helped is paid. Red marks on the ground show where an attack will land. The Old Heart can only be woken at an altar on the centre plot.',
    coop: 'Some boss patterns only appear while two or more farmers are up in the arena. A lone farmer gets an ordinary pattern in its place (shown as "alone:" below).',
    dread: 'Four blocks of haunted land sit out in the wilds on the diagonals. Nobody can buy them, but the land beside them can be bought, and you can walk in. The dead haunt them day and night while a farmer is inside, and a warden (one of the altar bosses, much tougher) sleeps at the heart of each. Everything there is richer: more ore, a treasure chest in every outer plot and a vault by the warden.',
    caves: 'A Mine Shaft leads down to the caves, a second map as big as the world that lines up with it. Hold the action key beside rock to dig; everything you dig stays dug. Ore grows in clusters that get richer towards the edge of the map. Creatures of the dark come for whoever is digging, and ancient chambers far out hold a vault guarded by elites until it is opened.',
    titans: 'With at least two farmers on the world, a tree or boulder on owned land now and then grows into a Titan. It only takes damage while two or more different farmers have swung at it recently. Everybody who helped gets their own drops (more for every extra pair of hands), the XP and a crate roll.',
    hearth: 'In the dusk countdown, farmers at a campfire, table, lantern or lamp post sit at it; your own companion nearby counts as company. Two heads make a circle: the fire fills and kindles, and everybody sitting there gets Hearthside until dawn.',
    potluck: 'A Table holds dishes that friends set out. Pressing E at it eats a portion of every dish that helps you, each buff marked with its cook.',
    mail: 'A Mailbox belongs to its builder. At a friend\'s mailbox you can send a parcel (a few kinds of things, coins count) with a note. Every dawn one of the island folk sends each farmer a postcard with a small present.',
    wish: 'On the first morning of every season after the first, the farm is offered three wishes (the same three for everybody, from the world\'s seed). Everybody online votes; the winner blesses every farmer until the season ends.',
    scholar: "Scholar's Day: double XP for everybody from dawn to dawn. It falls on day five and every tenth day after it, and now and then besides. The weather vane shows it coming, and XP brews stack with it.",
    crew: 'Creatures teach their keeper: whenever one of your creatures earns XP at a job (a den, an island post, a machine or a workshop), you earn a share of it too, online or not. Dawn tells you how much.',
    weather: 'Weather is decided by the world\'s seed and the day, so everybody sees the same sky. Some days it rains (sometimes a storm with lightning), some mornings are foggy. A Weather Vane forecasts the next three days.',
    land: 'Land is bought at the shore: face a pale square next to land you own and press E. The price grows with every plot YOU have bought (until it starts growing by a fixed step), and is multiplied by the plot\'s biome and modifier.',
    breeding: 'Learn Matchmaker (Taming) to build a Hatchery. Two of your creatures and some treats make an egg. The baby is one of the parents\' species (now and then a rarer relative of the same element), inherits up to two traits and sometimes grows a new one.',
    awakening: 'Awakening is the late-game way to make a favourite creature stronger: with enough levels and rare goods it earns up to three stars, each giving more health, attack and work speed.',
    bond: 'Stand next to your companion and press E to pet it. A few pets a day earn affection. From Fond on, the first pet of each day digs up a gift.',
    trader: 'With Merchant Contacts (Explorer) a travelling trader sells at your Market Stall. The stock changes every second day and is the same for everybody.',
    wheel: 'The Fortune Wheel gives one free spin a day; more cost coins, a little more each time. After a coin prize you may press your luck: double or nothing.',
    rifts: 'A clear pays coins, XP, rift shards, the tier\'s loot and a crate; the first clear of a tier also pays skill points. A lost run still pays for the waves you cleared. Once you have cleared a rift you can take omens at the dock for bigger rewards. The rift of the day comes with two omens already on, a bonus and a one-off shard bonus for its first clear.',
    abyss: 'The Abyss has no last wave: a guardian every fifth wave, monsters stronger every wave, and a boon between waves until the pool runs dry. Cash out at the gate whenever you like (or fall) for shards by depth.',
    servers: 'A world on a server runs whether anybody is online or not. Creatures keep working, machines keep running, and your farmer waits where you left them.',
    bounties: 'Three bounties at a time, renewed every three days (sooner once all three are done). They scale with your level; deliveries take the items from your pockets. A bounty pays coins and XP and now and then a skill point, and can be rerolled for a few coins.',
    goals: 'Production goals count what every machine on the farm makes. Everybody\'s machines feed them.',
    pods: 'Hurt creatures are easier to catch. Better pods and the Taming skills raise the odds. The chances below are for an unhurt creature with no bonuses.',
    jobs: 'A creature can only do a job it has aptitude for (1 to 5 dots); more dots work faster. Island jobs and workshop jobs are standing posts: they keep working while you are away.',
    death_tip: 'Tip: carry a stack of food and a few healing potions, and build a campfire wherever you plan to spend the night.',
};
