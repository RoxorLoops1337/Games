// Every balance dial in one place. Shared by the client and the server simulation —
// keep it pure data (no Phaser, no DOM).

export const TILE = 16;          // px per tile (art is authored at 1x on this grid)
export const PLOT = 18;          // tiles per plot side (it was 12 until the patches were made half as big again: see LEGACY_PLOT)
export const LEGACY_PLOT = 12;   // what versions 4 and 5 had; sim/migrate.ts carries their land into the bigger patches
export const GRID = 35;          // plots per side of the world (odd, so the Old Heart sits in the exact middle)
export const LEGACY_GRID = 17;   // what version-4 worlds had; their land is carried into the middle (sim/migrate.ts)
export const SEA = 1;            // plots of open sea drawn around the grid
export const WORLD_TILES = (GRID + SEA * 2) * PLOT;
/** The caves under the world are a second map as big as the first, below it with a gap of sea-less nothing between (the grid has this many rows). */
const UNDER_GAP = 32;
export const UNDER_Y = WORLD_TILES + UNDER_GAP;              // the first row of the caves
export const WORLD_H = UNDER_Y + WORLD_TILES;
export const CENTER = { gx: (GRID - 1) / 2, gy: (GRID - 1) / 2 };  // the Old Heart plot (future boss arena)
export const SPAWN_RING_2 = 11;  // the second ring, for farmers nine to sixteen (their island is raised when they arrive)
export const SPAWN_RING = 6;     // plots from the centre to each home (the homes stay this far apart however big the world is)
export const FAR_RING = 12;      // plots from the centre where the wilds begin: harsher biomes, more ruins and treasure
export const MAX_PLAYERS = 16;

/** The Dread Reaches: four blocks of 3×3 haunted plots out in the wilds, each with a warden boss at its heart. Always land, never for sale. */
export const DREAD_ZONES = 4;
export const DREAD_RING = 14.2;   // plots from the centre of the world to the middle of each block (they sit on the diagonals)

/** Rift islands: four small islands in the corners of the sea ring, where expeditions are fought. */
export const RIFT_ISLANDS = 4;
export const RIFT_RADIUS = 5.2;   // tiles; leaves open water between a rift and any farm island
/** Tile origin (top-left of its 12×12 block) of rift island `i`. */
export const riftOrigin = (i: number) => {
    const far = (GRID + SEA) * PLOT;
    return { tx: i & 1 ? far : 0, ty: i & 2 ? far : 0 };
};


export const VIEW_W = 960;
export const VIEW_H = 540;
export const ZOOM = 3;           // world camera zoom (16px tile → 48 screen px)

export const NET = {
    simHz: 20,                   // server simulation steps per second
    sendEvery: 0.1,              // s between tick broadcasts
    moveEvery: 0.1,              // s between a client's movement updates (only while moving)
    saveEvery: 20,               // s between world saves
    aoi: 640,                    // px around a player whose entities the server streams to them
};

/** How long the day lasted before it was stretched; saves in the middle of a night are shifted by the difference. */
export const OLD_DAY_LENGTH = 140;

export const TUNING = {
    // player
    moveSpeed: 62,               // px/s at zoom 1
    reach: 24,                   // px from the player's hand to a target's centre
    swingCooldown: 0.32,         // s between swings while holding the action key
    swingEnergy: 0.6,            // energy per swing
    maxEnergy: 100,
    startHearts: 3,
    hurtInvuln: 1.2,             // s of i-frames after taking a hit
    magnetRadius: 34,            // px — drops inside this fly to the player
    dropLife: 1200,              // s a dropped item lies on the ground before it fades (full pockets used to leave thousands lying about for hours)
    baseCarry: 999,              // max of one item in your pockets (it was 80; skills and packs add more on top)
    lowEnergySlow: 0.75,         // move multiplier at 0 energy (swings also take 2x)
    downedSeconds: 25,           // bleed-out time while a teammate can revive you
    downedSoloSeconds: 6,        // nobody can come: wake at home quickly
    deathXpLoss: 0.5,            // the share of the XP you have towards your next level that you lose when you fall and are not picked up
    packLife: 7200,              // s a dropped backpack lies where it fell (about twenty days) before it is gone
    reviveSeconds: 2.5,          // hold E next to a downed friend
    reviveRange: 22,             // px
    stationRange: 2.6,           // tiles from the edge of a crafting station you can still use it

    // economy
    landBasePrice: 8,
    landPriceGrowth: 1.22,       // price = base * growth^(plots this buyer already bought) …
    landPriceKnee: 35,           // … up to this many plots, then it grows by a fixed step instead
    landPriceStep: 600,          // coins added per plot beyond the knee
    respawnEvery: 2.0,           // s between resource respawns (scaled by sqrt(owned plots)); it was 3.2 on the old smaller patches
    plotNodeCap: 40,             // max resource nodes per plot (it was 18 on the old 12×12 patches)
    buildRange: 5,               // tiles from the player a building may be placed
    marketRange: 3,              // tiles from a market to sell

    // day / night
    dayLength: 300,              // s of daylight (it was 140 until the days were stretched: see OLD_DAY_LENGTH)
    nightLength: 50,             // s of night
    duskWarn: [60, 20] as const, // s before night falls: a first warning, then an alarm
    duskFade: 8,                 // s of fade at each end of the night
    nightSpawnWindow: 25,        // s over which a night's enemies arrive
    wildEvery: [14, 22] as const, // s between wild-creature spawn rolls around each farmer
    wildNear: 1,                 // wild creatures allowed near a farmer at once (the pods are for a find, not a crowd)
    wildNearFairy: 4,            // … on a fairy night
    wildChance: 0.55,            // chance each roll actually spawns one
    crewXpShare: 0.25,           // of the XP a creature earns at work (a den, an island post, a machine or a workshop), this share teaches its keeper too (+ the crewXp stat)
    postSpeed: 6.5,              // how much quicker a creature on an island post works than one in a den
    serviceEvery: 3,             // s between a machine keeper's rounds (empty the tray, fetch fuel and ingredients)
    partyRange: 800,             // px — farmers this close count as one party: monsters are tuned to their average level
    campfireRadius: 44,          // px — enemies won't come closer; heals at night
    campfireHealEvery: 12,       // s per heart near a campfire
    fairyHealEvery: 20,          // s per heart inside a Fairy Ring plot
    wardenHp: 2,                 // a dread warden has this many times the hearts of the same boss at an altar
    wardenDmg: 1.2,              // … and hits this much harder
    wardenRespawnDays: 5,        // days after a warden falls before the next one wakes
    dreadBase: 4,                // monsters haunting a Dread block as soon as somebody walks in…
    dreadPerFarmer: 2,           // … and this many more for every farmer inside
    dreadMax: 16,
    caveBase: 3,                 // creatures that live around a farmer digging in the caves…
    caveMax: 8,                  // … more for higher levels, up to this
    spawnClear: 80,              // px: a night monster never appears closer than this to a farmer (sim/mobs.ts)

    // ── wild creatures (sim/creatures.ts): ranges the client checks too (the pod button, the find pointer)
    podRange: 118,               // px from the farmer to a wild creature a pod can be thrown at
    wildSpawnClear: 90,          // px: a wild creature never appears closer than this to a farmer
    wildCrowd: 640,              // px around a farmer: the wild ones inside count against wildNear
    wildLinger: 400,             // px: a wild creature with no farmer this close wanders off in time

    // ── bosses (sim/boss.ts): the arena's edges, as the client's boss bar and warnings see them
    altarParty: 520,             // px from the altar: the farmers who count as the summoning party (the boss's hearts scale with them)
    bossBanner: 700,             // px from the altar: who is told the boss has risen
    arenaNote: 2.5,              // a phase note reaches farmers this many arena radii out
    arenaPad: 40,                // px beyond the arena a farmer still counts as in the fight…
    arenaClear: 60,              // … and this far out the fall shares the rewards and takes the minions with it
    summonCrowd: 260,            // px around the boss: its minions already inside count against the next wave

    // the dash and the Perfect dash (sim.ts cmdDash / shielded)
    dashEnergy: 6,               // energy a dash costs (a Perfect dash gives exactly this back)
    dashInvuln: 0.45,            // s of invulnerability a dash gives
    dashCooldown: 1.1,           // s before the next dash
    perfectSeconds: 4,           // how long the `perfect` buff lasts: the next hit on a monster is a critical one
    perfectSlowMo: 0.35,         // s of slow motion the farmer who pulled it off sees (a view effect only: the sim never slows)

    // ── evening hearth (sim/hearth.ts, data/hearth.ts)
    hearthRadius: 48,            // px from the edge of a fire (or a table) that counts as sitting at it: three tiles
    hearthPetReach: 64,          // px: how far from the fire your own companion may stand and still count as company
    hearthFill: 5,               // s two (a farmer and a friend or a companion) must sit together during the dusk countdown to kindle the fire; it drains at half speed when they part
    hearthHealEvery: 8,          // s per heart for a farmer with Hearthside

    // ── petting your companion (sim/bond.ts, data/bond.ts)
    patReach: 36,                // px from the farmer to their companion
    patCooldown: 1,              // s between two pets
    // export chute: sells whatever a belt or inserter drops into it
    chuteCut: 0.85,              // the share of the market price a chute pays (selling by hand has to matter too)
    chuteFloatEvery: 1,          // s between the "+N" coin numbers over a chute while things flow into it
    // rain
    rainGrow: 0.5,               // garden beds grow up to this much faster while it rains (the forecast says so too)

    // potluck table (sim/potluck.ts)
    tableDishes: 4,              // different dishes one table holds
    tablePortions: 8,            // portions of one dish
    feastRange: 3,               // tiles from the table's edge a farmer may set a dish out, take it back or feast from
    feastCooldown: 20,           // s before the same farmer may feast at the same table again
    feastTopUp: 0.5,             // a dish is eaten only for a buff you hold less than this share of its time of (so a portion is never wasted)
    feastWindow: 30,             // s: the farmers who feasted within this long of each other fed "at once" (the chronicle line)
    /** The Blight (sim/blight.ts, sim/raid.ts): nests on dark islands out at sea, how they grow, spread and merge, and what they send against the farm. */
    blight: {
        nests: 6,                // nests a world starts with (placed from the seed; an older world gets them when it loads)
        nestMinHomeGap: 7,       // plots (straight line) between a starting nest and any home
        nestOuterGap: 3,         // plots (each way) kept clear round the second ring's home spots (farmers nine and up)
        nestOwnedGap: 3,         // … and between a starting nest and anybody's land (an old world with a big farm)
        nestApart: 6,            // plots between two starting nests
        nestHomeGuard: 2,        // a nest never spreads within this many plots of a home
        nestMax: 24,             // nests in the whole world at most (they spread fast: this cap is what holds them)
        nestSpreadBase: 0.5,     // the chance each nest seeds a level-1 nest on a neighbouring plot at dawn…
        nestSpreadPerLv: 0.01,   // … plus this much for every level it has…
        nestSpreadMax: 0.9,      // … up to this
        nestMerge: 0.08,         // the chance at dawn that two nests of the same kind on neighbouring plots merge (their levels add up)
        nestHp: 50,              // a level-1 nest's health…
        nestHpPerLv: 0.25,       // … +25% for every level above the first
        nestXp: 35,              // XP for destroying one, per level
        nestCoins: [6, 12] as const,    // coins, per level
        nestCores: 1,            // Blight Cores it leaves, plus one for every `nestCoresPer` levels
        nestCoresPer: 3,
        nestMend: 0.5,           // a damaged nest mends this share of its health at dawn
        raidLvPer: 2,            // what a nest hatches (its brood, its raiders) is a level above the farmer's threat level for every this many nest levels…
        raidLvMax: 10,            // … at most this many
        raidHpPerLv: 0.12,       // a raider has this much more health for every nest level above the first…
        raidHpMax: 3.5,          // … up to this many times
        raidDmgPerLv: 0.04,      // … and bites this much harder…
        raidDmgMax: 1.8,         // … up to this many times
        raidEliteFrom: 5,        // from this nest level a raider may be an elite, 5% likelier for every level from there (at most `raidEliteMax`)
        raidElitePerLv: 0.05,
        raidEliteMax: 0.35,
        broodMax: 3,             // monsters a stirred nest keeps around it
        broodEvery: 9,           // s between two while a farmer is near
        broodNear: 170,          // px: a farmer this close stirs it
        broodLinger: 30,         // s after the last farmer leaves before its brood melts away
        raidRange: 60,           // plots (straight line) from a farmer's base within which a nest counts as near and sends a wave at night (sim/raid.ts): the whole map, so the first night already has raiders
        raidShare: 0.3,          // of the night's monsters, this share comes from the nest instead…
        raidPerNest: 1,          // … plus this many for every other nest in range…
        raidPerLv: 4,            // … and one more for every this many levels of the nest…
        raidMax: 10,             // … up to this many raiders
        raidWindow: 6,           // s after nightfall within which the raiders set out
        waveSectorMax: 10,       // raiders in one sector's wave at most (the nests of a sector send one wave between them)
        raidSpawnTiles: 26,      // tiles from the base at which a far nest's wave steps out (a nearer nest sends its own from where it stands): the march fits in a night
        waveGap: 4,              // s between one sector's wave and the next (a night is only 50 s long, and there are at most eight)
        waveTotal: 24,           // raiders in all, across every wave of every nest, that come for one farmer in a night
        raidWade: 0.6,           // a raider wades across the sea at this share of its speed
        raidMarch: 1.5,          // … and marches this much faster than it walks while no farmer is near
        raidArrive: 28,          // px from the base where a raider stops marching
        raidBldDmg: 4,           // damage to a wall, doorway or tower in a raider's way for every heart of its bite…
        raidBldEvery: 1,         // … once a second (sim/defense.ts)
        /** Hit points of the defense pieces (a broken one is gone; damaged ones mend at dawn). */
        hp: { wood: 40, stone: 100, brick: 130, doorway: 60, fortified: 260, archer: 80, ballista: 120, tesla: 100 },
        towerLevel: 0.02,        // a tower hits 2% harder for every level its builder has
        spikeDmg: 1.5,           // a Spike Trap's bite…
        spikeEvery: 0.7,         // … at most this often for one monster
        /** The towers: range (px), seconds between shots, damage (and the Tesla's chain and the hop between two it chains). */
        archer: { range: 112, every: 1.2, dmg: 1.6 },
        ballista: { range: 168, every: 3, dmg: 7 },
        tesla: { range: 96, every: 1.5, dmg: 1.4, chain: 3, hop: 56 },
    },
    /** Tower levels and perks (data/towerperks.ts, sim/defense.ts). */
    towers: {
        maxLevel: 10,            // the highest level a tower reaches
        xpFirst: 30,             // XP to reach level 2…
        xpGrow: 0.5,             // … and each level after costs this much more of it (level 10 costs 5x the first)
        eliteXp: 3,              // an elite kill gives this many times the XP
        bossXp: 10,              // … a boss kill this many times more (towers never shoot bosses; a burn or a bite might finish one)
        offers: 3,               // perks to choose from
        weights: { common: 70, uncommon: 22, rare: 7, legendary: 1 },
        legendaryFrom: 5,        // a legendary perk is offered only from this level on
        range: 0.15, haste: 0.15, power: 0.2, sturdy: 0.3, rapid: 0.3,
        pierceDmg: 0.7, multiDmg: 0.6, crit: 0.1, critMul: 2,
        slow: 0.25, slowSecs: 2, veteran: 0.3,
        bleedSecs: 3, bleedDps: 0.5,         // a bleed does this share of the bite every second
        execute: 0.6, executeBelow: 0.3, splashDmg: 0.6, splashRadius: 30,
        overEvery: 5, overMul: 3, auraTiles: 4, auraMend: 0.15, barbs: 2,
        burnDps: 0.35, burnSecs: 3, freezeSecs: 1.5, stormMax: 8, stormDmg: 0.7,
        pierceReach: 44,         // px past the target a piercing shot still finds a monster in line, and how close to the line it must be
        pierceWidth: 12,
        reach: 5,                // tiles a farmer may stand from a tower to pick its perk
        regen: 1 / 240,          // every defense with hit points mends this share of its health a second (a full heal from nothing in 4 minutes)…
        regenDelay: 6,           // … once it has not been hit for this many seconds (the full mend at dawn stays)
        mendMul: 3,              // each rank of Self-Mending adds this many times the base regeneration (rank 1: x4, rank 3: x10)
        repairCut: 0.3,          // each rank of Field Repairs takes this much off the cost of a repair by hand
        wallRepair: 0.5,         // a wall or doorway repair costs this share of its build cost, for all the missing health
        /** What a full repair by hand of a tower or trap costs (less, for less missing). */
        repair: { tower_archer: { plank: 4, stone: 5 }, ballista: { ironbar: 3, gear: 2 }, tesla: { wire: 3, ironbar: 2 }, spike: { ironbar: 1 } } as Record<string, Record<string, number>>,
        hurtTo: 0.4,             // the Lab's Hurt button leaves every defense this share of its health
        spikeWide: 18,           // px round a Wide Spikes trap's centre where it bites
    },
    /** Co-op boss statuses (sim/costatus.ts): patterns that need teammates. Laid only while two or more farmers are up in the arena. */
    coop: {
        freezeRadius: 28,        // px: the Frost Giant's freezing blast
        thawSeconds: 1.5,        // a friend holds E beside a frozen farmer this long to thaw them
        frostSelf: 8,            // s until a frozen farmer thaws by themselves…
        frostAlone: 3,           // … or this long when nobody else is up in the arena
        hexRadius: 20,           // px: the curse bolt
        hexSeconds: 12,          // s a curse lasts, however many hands it passes through
        hexAlone: 6,             // … when the carrier is the only one left in the arena
        hexEvery: 1,             // s between ticks
        hexDmg: 0.25,            // hearts per tick at first; +this every `hexWorsen` seconds, so it gets worse the longer it lives
        hexWorsen: 4,
        hexAloneDmg: 0.25,       // a lone carrier's ticks stay gentle
        hexTouch: 18,            // px between two farmers that count as touching
        hexHold: 0.35,           // s of touching before the curse jumps
        hexCool: 1.5,            // s a new carrier must wait before passing it on
        chainRadius: 16,         // px: the pools that mark the two farmers about to be chained
        chainTiles: 7,           // the chain goes taut beyond this many tiles…
        chainSeconds: 16,        // … and lasts this long
        chainEvery: 1,           // s between tugs while it is taut
        chainDmg: 0.5,           // hearts per tug, to both
        chainPull: 120,          // px/s of pull on each end of a taut chain
        floor: 0.5,              // a curse or a chain wounds but never fells: it leaves at least this many hearts
    },

};
