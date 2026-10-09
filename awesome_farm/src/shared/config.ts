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
