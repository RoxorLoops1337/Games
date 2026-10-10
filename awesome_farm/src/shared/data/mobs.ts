// The bestiary. Regular monsters wander the farm at night (more and nastier as the days
// pass); bosses are summoned at an altar with a sigil and fought over several phases.
// The simulation (sim/mobs.ts, sim/boss.ts) reads these tables; the client draws them.

import { PAL } from '../palette';
import type { Biome } from './biomes';
import type { ItemId } from './items';

type MobAi =
    | 'hop'      // short hops towards you
    | 'chase'    // walks straight at you
    | 'ranged'   // keeps its distance and shoots
    | 'charge'   // winds up, then rams in a line
    | 'flit'     // fast and erratic, flies over water
    | 'swarm'    // quick little pack animals
    | 'brute'    // slow and heavy
    | 'boss';    // driven by its pattern list

export type ProjKind = 'arrow' | 'orb' | 'rock' | 'spore' | 'frost' | 'fire' | 'bolt';

/** [item, chance 0..1, min, max] — rolled on death. */
type Drop = [item: ItemId, chance: number, min?: number, max?: number];

/** The patterns that need teammates (data/costatus.ts says what each does): a boss uses them only while two or more farmers are up in its arena, and falls back to an ordinary pattern for a lone farmer. */
export type CoPattern = 'freeze' | 'hex' | 'chain';
export type PatternId = 'slam' | 'summon' | 'radial' | 'aimed' | 'charge' | 'rain' | 'spiral' | 'sweep' | 'leap' | CoPattern;

export interface BossPhase {
    at: number;                 // starts when hp falls to this fraction (1 = the opening phase)
    patterns: PatternId[];      // cycled in order
    alone?: Partial<Record<CoPattern, PatternId>>;   // what stands in for a co-op pattern when fewer than two farmers are in the arena: the pattern it replaced, so a lone fighter meets the old fight
    pause: number;              // s of rest between patterns
    speed?: number;             // move speed multiplier
    note?: string;              // banner shown when the phase begins
}

export interface BossInfo {
    id: string;
    title: string;
    blurb: string;
    sigil: ItemId;              // consumed to summon it
    trophy: ItemId;             // dropped on the first defeat (and sometimes after)
    summon?: string;            // MobKind its 'summon' pattern calls
    phases: BossPhase[];
    points: number;             // skill points for everyone who helped
    gear: ItemId[];             // one of these drops (the first kill always gives the first)
    arena: number;              // leash radius in px
    heartOnly?: boolean;        // can only be woken on the centre plot
    color: number;
}

export interface MobDef {
    name: string;
    tex: string;                // texture key; frames 0..n are the walk cycle
    ai: MobAi;
    hp: number;
    dmg: number;                // hearts of contact damage (before armor)
    speed: number;              // px/s
    aggro: number;              // px at which it notices you
    r: number;                  // body radius in px (touching a player hurts them)
    xp: number;
    coins: [number, number];
    drops: Drop[];
    tier: number;               // difficulty tier (0 trivial … 4 deadly)
    biomes?: Biome[];           // where it likes to roam (any biome when absent)
    group?: [number, number];   // spawns in packs of this size
    flies?: boolean;
    shoot?: { proj: ProjKind; every: number; speed: number; range: number; dmg?: number; count?: number; spread?: number };
    charge?: { wind: number; dist: number; speed: number; cd: number };
    boss?: BossInfo;
    scale?: number;             // draw scale (bosses are big)
    desc: string;
}

const MOBS_RAW = {
    slime: {
        name: 'Slime', tex: 'slime', ai: 'hop', hp: 2, dmg: 1, speed: 52, aggro: 150, r: 5, xp: 4, coins: [0, 1], tier: 0,
        drops: [['slimegel', 0.6, 1, 2], ['fiber', 0.1]], desc: 'Bouncy and everywhere. Harmless in ones.',
    },
    skeleton: {
        name: 'Skeleton', tex: 'skeleton', ai: 'chase', hp: 4, dmg: 1.5, speed: 30, aggro: 150, r: 5, xp: 7, coins: [1, 2], tier: 1,
        drops: [['bone', 0.5, 1, 2], ['coal', 0.3]], desc: 'Rattles out of the dark after dusk.',
    },
    bat: {
        name: 'Night Bat', tex: 'bat', ai: 'flit', hp: 2, dmg: 1, speed: 58, aggro: 170, r: 4, xp: 6, coins: [0, 1], tier: 1, flies: true,
        biomes: ['bog', 'snowcap', 'quarry'], group: [2, 3],
        drops: [['batwing', 0.4]], desc: 'Fast, jittery, and always in a group.',
    },
    boar: {
        name: 'Tusker', tex: 'boar', ai: 'charge', hp: 6, dmg: 1.5, speed: 36, aggro: 140, r: 6, xp: 9, coins: [1, 2], tier: 1,
        biomes: ['meadow', 'goldsand'], charge: { wind: 0.7, dist: 92, speed: 150, cd: 2.4 },
        drops: [['hide', 0.65, 1, 2], ['berry', 0.2, 1, 3]], desc: 'Paws the ground, then charges. Sidestep it!',
    },
    scarab: {
        name: 'Scarab', tex: 'scarab', ai: 'swarm', hp: 3, dmg: 1, speed: 54, aggro: 150, r: 4, xp: 6, coins: [0, 1], tier: 1,
        biomes: ['goldsand'], group: [3, 4],
        drops: [['scarabshell', 0.4], ['goldore', 0.08]], desc: 'Glittering beetles that hunt in packs.',
    },
    wisp: {
        name: 'Bog Wisp', tex: 'wisp', ai: 'ranged', hp: 3, dmg: 1, speed: 26, aggro: 190, r: 4, xp: 9, coins: [1, 2], tier: 2, flies: true,
        biomes: ['bog'], shoot: { proj: 'orb', every: 2.4, speed: 62, range: 150 },
        drops: [['ectoplasm', 0.5], ['herb', 0.3]], desc: 'A drifting lantern that spits slow glowing orbs.',
    },
    archer: {
        name: 'Bone Archer', tex: 'archer', ai: 'ranged', hp: 4, dmg: 1.5, speed: 28, aggro: 200, r: 5, xp: 10, coins: [1, 3], tier: 2,
        shoot: { proj: 'arrow', every: 2.0, speed: 120, range: 170 },
        drops: [['bone', 0.6, 1, 2], ['rope', 0.2]], desc: 'Keeps its distance and picks you off.',
    },
    rockling: {
        name: 'Rockling', tex: 'rockling', ai: 'brute', hp: 10, dmg: 2, speed: 20, aggro: 130, r: 7, xp: 14, coins: [1, 3], tier: 2,
        biomes: ['quarry', 'snowcap'],
        drops: [['stone', 0.9, 2, 4], ['iron', 0.35, 1, 2], ['rockheart', 0.4]], desc: 'Slow, tough, and hits like a falling boulder.',
    },
    frostling: {
        name: 'Frostling', tex: 'frostling', ai: 'ranged', hp: 5, dmg: 1.5, speed: 30, aggro: 190, r: 5, xp: 12, coins: [1, 3], tier: 2,
        biomes: ['snowcap'], shoot: { proj: 'frost', every: 2.2, speed: 84, range: 150, count: 2, spread: 0.3 },
        drops: [['frostshard', 0.6], ['crystal', 0.04]], desc: 'Flings icy shards two at a time.',
    },
    bogtoad: {
        name: 'Bog Toad', tex: 'bogtoad', ai: 'hop', hp: 8, dmg: 1.5, speed: 44, aggro: 160, r: 6, xp: 13, coins: [1, 3], tier: 2,
        biomes: ['bog'], shoot: { proj: 'spore', every: 3.2, speed: 56, range: 110 },
        drops: [['toadskin', 0.5], ['herb', 0.4, 1, 2], ['mushroom', 0.4]], desc: 'Leaps about and burps spore clouds.',
    },
    wraith: {
        name: 'Wraith', tex: 'wraith', ai: 'flit', hp: 8, dmg: 2, speed: 50, aggro: 210, r: 5, xp: 20, coins: [2, 4], tier: 3, flies: true,
        shoot: { proj: 'bolt', every: 3.0, speed: 100, range: 150 },
        drops: [['shroud', 0.45], ['ectoplasm', 0.3]], desc: 'Drifts through the dark and hurls cold bolts.',
    },
    knight: {
        name: 'Hollow Knight', tex: 'knight', ai: 'chase', hp: 16, dmg: 2.5, speed: 30, aggro: 170, r: 6, xp: 26, coins: [2, 5], tier: 3,
        drops: [['steel', 0.35], ['ironbar', 0.5, 1, 2], ['bone', 0.5, 1, 3]], desc: 'An empty suit of armour that never gives up.',
    },

    // ── bosses ──
    slimeking: {
        name: 'Slime King', tex: 'slimeking', ai: 'boss', hp: 300, dmg: 3.4, speed: 26, aggro: 260, r: 14, xp: 120, coins: [30, 50], tier: 1, scale: 1,
        drops: [['slimegel', 1, 8, 12], ['ring_slime', 0.35]], desc: 'A crowned mountain of goo.',
        boss: {
            id: 'slime', title: 'The Slime King', blurb: 'Leaps, belches and calls its subjects.', sigil: 'sigil_slime', trophy: 'trophy_slime', summon: 'slime', color: PAL.plum,
            points: 2, arena: 190, gear: ['crown_slime', 'staff_slime'],
            phases: [
                { at: 1, patterns: ['leap', 'summon', 'leap'], pause: 1.6 },
                { at: 0.55, patterns: ['leap', 'radial', 'summon'], pause: 1.2, speed: 1.2, note: 'The King swells with rage!' },
                { at: 0.25, patterns: ['leap', 'radial', 'leap', 'summon'], pause: 0.8, speed: 1.4, note: 'It is falling apart — keep going!' },
            ],
        },
    },
    colossus: {
        name: 'Stone Colossus', tex: 'colossus', ai: 'boss', hp: 660, dmg: 3.9, speed: 22, aggro: 260, r: 16, xp: 260, coins: [60, 90], tier: 2, scale: 1,
        drops: [['stone', 1, 12, 20], ['iron', 1, 6, 10], ['rockheart', 1, 2, 3], ['ring_stone', 0.35]], desc: 'The quarry itself, standing up.',
        boss: {
            id: 'stone', title: 'The Stone Colossus', blurb: 'Slams the ground, rains boulders and chains two farmers together.', sigil: 'sigil_stone', trophy: 'trophy_stone', summon: 'rockling', color: PAL.stone,
            points: 3, arena: 200, gear: ['hammer_colossus', 'plate_colossus'],
            phases: [
                { at: 1, patterns: ['slam', 'sweep', 'rain'], pause: 1.8 },
                { at: 0.6, patterns: ['slam', 'rain', 'chain', 'sweep'], alone: { chain: 'summon' }, pause: 1.4, speed: 1.15, note: 'Cracks spread across its chest!' },
                { at: 0.3, patterns: ['rain', 'slam', 'radial', 'chain'], alone: { chain: 'rain' }, pause: 1.0, speed: 1.3, note: 'The Colossus roars and the ground shakes!' },
            ],
        },
    },
    witch: {
        name: 'Bog Witch', tex: 'witch', ai: 'boss', hp: 780, dmg: 3.8, speed: 30, aggro: 280, r: 10, xp: 260, coins: [60, 90], tier: 2, scale: 1, flies: true,
        drops: [['ectoplasm', 1, 6, 10], ['herb', 1, 6, 10], ['ring_hex', 0.35]], desc: 'Cackles in the fog and bottles the moon.',
        boss: {
            id: 'bog', title: 'The Bog Witch', blurb: 'Hexes a farmer (touch a friend to pass the curse on), poison clouds and swarms of wisps.', sigil: 'sigil_bog', trophy: 'trophy_bog', summon: 'wisp', color: PAL.leaf,
            points: 3, arena: 210, gear: ['staff_witch', 'charm_hex'],
            phases: [
                { at: 1, patterns: ['aimed', 'summon', 'rain'], pause: 1.5 },
                { at: 0.55, patterns: ['aimed', 'spiral', 'hex', 'summon'], alone: { hex: 'rain' }, pause: 1.2, speed: 1.2, note: 'The fog thickens…' },
                { at: 0.25, patterns: ['spiral', 'aimed', 'hex', 'spiral'], alone: { hex: 'rain' }, pause: 0.9, speed: 1.35, note: 'The Witch screams a final curse!' },
            ],
        },
    },
    pharaoh: {
        name: 'Dune Pharaoh', tex: 'pharaoh', ai: 'boss', hp: 1250, dmg: 4.9, speed: 28, aggro: 280, r: 11, xp: 420, coins: [90, 130], tier: 3, scale: 1,
        drops: [['goldbar', 1, 2, 4], ['scarabshell', 1, 6, 10], ['ring_sun', 0.35]], desc: 'An ancient king with a sand-wrapped crown.',
        boss: {
            id: 'dune', title: 'The Dune Pharaoh', blurb: 'Dashes through you, calls scarab swarms and lays a mummy’s curse on a farmer.', sigil: 'sigil_dune', trophy: 'trophy_dune', summon: 'scarab', color: PAL.gold,
            points: 4, arena: 210, gear: ['sword_pharaoh', 'charm_scarab'],
            phases: [
                { at: 1, patterns: ['charge', 'summon', 'sweep'], pause: 1.4 },
                { at: 0.55, patterns: ['charge', 'rain', 'hex', 'charge'], alone: { hex: 'summon' }, pause: 1.0, speed: 1.2, note: 'The sands rise to its call!' },
                { at: 0.25, patterns: ['charge', 'charge', 'rain', 'hex'], alone: { hex: 'summon' }, pause: 0.7, speed: 1.4, note: 'The Pharaoh fights like a cornered god!' },
            ],
        },
    },
    frostgiant: {
        name: 'Frost Giant', tex: 'frostgiant', ai: 'boss', hp: 1700, dmg: 6, speed: 22, aggro: 280, r: 16, xp: 420, coins: [90, 130], tier: 3, scale: 1,
        drops: [['frostshard', 1, 6, 10], ['crystal', 1, 2, 4], ['ring_frost', 0.35]], desc: 'A glacier with a bad temper.',
        boss: {
            id: 'frost', title: 'The Frost Giant', blurb: 'Hurls ice, stomps and freezes a farmer solid until a friend thaws them.', sigil: 'sigil_frost', trophy: 'trophy_frost', summon: 'frostling', color: PAL.foam,
            points: 4, arena: 220, gear: ['bow_frost', 'helm_frost'],
            phases: [
                { at: 1, patterns: ['aimed', 'slam', 'radial'], pause: 1.6 },
                { at: 0.55, patterns: ['slam', 'rain', 'freeze', 'summon'], alone: { freeze: 'aimed' }, pause: 1.2, speed: 1.2, note: 'The air turns bitter cold!' },
                { at: 0.25, patterns: ['radial', 'slam', 'freeze', 'radial'], alone: { freeze: 'rain' }, pause: 0.9, speed: 1.35, note: 'A blizzard howls around the Giant!' },
            ],
        },
    },
    oldheart: {
        name: 'The Old Heart', tex: 'oldheart', ai: 'boss', hp: 3900, dmg: 7.5, speed: 18, aggro: 320, r: 18, xp: 1500, coins: [300, 400], tier: 4, scale: 1,
        drops: [['crystal', 1, 6, 10]], desc: 'The island’s beating heart, woken at last.',
        boss: {
            id: 'heart', title: 'The Old Heart', blurb: 'Everything the other bosses did, and more: chains, curses and ice for a whole party.', sigil: 'sigil_heart', trophy: 'trophy_heart', summon: 'wraith', color: PAL.berry,
            points: 8, arena: 260, heartOnly: true, gear: ['charm_heart'],
            phases: [
                { at: 1, patterns: ['radial', 'rain', 'summon'], pause: 1.4 },
                { at: 0.7, patterns: ['spiral', 'slam', 'rain', 'summon'], pause: 1.1, speed: 1.15, note: 'The Heart beats faster.' },
                { at: 0.4, patterns: ['spiral', 'radial', 'hex', 'slam', 'chain'], alone: { hex: 'rain', chain: 'summon' }, pause: 0.9, speed: 1.3, note: 'The whole island trembles!' },
                { at: 0.15, patterns: ['spiral', 'freeze', 'radial', 'spiral'], alone: { freeze: 'rain' }, pause: 0.6, speed: 1.5, note: 'One last beat — end it!' },
            ],
        },
    },
} satisfies Record<string, MobDef>;

export type MobKind = keyof typeof MOBS_RAW;
export const MOBS: Record<MobKind, MobDef> = MOBS_RAW;
export const MOB_KINDS = Object.keys(MOBS) as MobKind[];
export const isBoss = (k: MobKind) => !!(MOBS[k] as MobDef).boss;
const mobDef = (k: MobKind): MobDef => MOBS[k];

export const BOSS_KINDS = MOB_KINDS.filter(isBoss);
/** Boss info by boss id ('slime', 'stone', …). */
export const BOSSES: Record<string, { kind: MobKind; info: BossInfo }> = Object.fromEntries(
    BOSS_KINDS.map((k) => [mobDef(k).boss!.id, { kind: k, info: mobDef(k).boss! }]),
);
export const BOSS_ORDER = ['slime', 'stone', 'bog', 'dune', 'frost', 'heart'];

/** Regular monsters, for the night spawner and the bestiary. */
export const WILD_KINDS = MOB_KINDS.filter((k) => !isBoss(k));

// Monsters are tuned to the LEVEL of whoever they come for (the average level of a party that plays
// together, see sim/mobs.ts threatAt), never to how many days the world has seen: a new farmer joining
// an old world meets the same night a new world would give them.

/** Highest tier of monster that roams for a threat level: slimes only at first, nastier kinds as you grow. */
export const tierCap = (level: number) => level >= 16 ? 3 : level >= 8 ? 2 : level >= 3 ? 1 : 0;

/** Pick what to spawn on a plot of this biome for a threat level: weighted towards tiers near the cap. */
export function pickWild (biome: Biome, level: number, roll: () => number): MobKind {
    const cap = tierCap(level);
    const pool = WILD_KINDS.filter((k) => {
        const d = mobDef(k);
        return d.tier <= cap && (!d.biomes || d.biomes.includes(biome));
    });
    const weights = pool.map((k) => {
        const d = mobDef(k);
        const near = 1 + Math.max(0, 3 - (cap - d.tier)) * 0.6;   // tiers close to the cap show up more
        return (d.biomes ? 2.4 : 1) * near * (k === 'slime' ? 2.4 : 1);   // slimes stay everywhere: their gel is needed all game
    });
    let r = roll() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[0];
}

/** What haunts the Dread Reaches: the undead and the things that drift in the dark, a tier tougher than the land around calls for. */
const HAUNTS: MobKind[] = ['bat', 'wisp', 'skeleton', 'knight', 'wraith'];
export function pickHaunt (level: number, roll: () => number): MobKind {
    const cap = tierCap(level) + 1;
    const pool = HAUNTS.filter((k) => mobDef(k).tier <= cap);
    const weights = pool.map((k) => 1 + Math.max(0, 3 - (cap - mobDef(k).tier)) * 0.8);
    let r = roll() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[0];
}

/** What lives in the caves: the deeper (the nearer the edge of the map), the nastier, and a tier tougher than the level on the surface. */
const CAVERNS: MobKind[] = ['slime', 'skeleton', 'bat', 'scarab', 'rockling', 'archer', 'wisp', 'knight', 'wraith'];
export function pickCave (level: number, depth: number, roll: () => number): MobKind {
    const cap = tierCap(level) + (depth > 0.55 ? 1 : 0);
    const pool = CAVERNS.filter((k) => mobDef(k).tier <= cap);
    const weights = pool.map((k) => (1 + Math.max(0, 3 - (cap - mobDef(k).tier)) * 0.7) * (k === 'slime' ? 0.5 : 1));
    let r = roll() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[0];
}

/**
 * The kinds of Blight nest (sim/blight.ts) and the family of monsters each one hatches. A nest's kind comes from its isle's biome when
 * it first rises and is passed on to the nests it spreads; two nests merge only with their own kind.
 */
export const NEST_KINDS = {
    bone:   { name: 'Bone Nest',   mobs: ['skeleton', 'archer', 'knight'] as MobKind[] },
    swarm:  { name: 'Swarm Nest',  mobs: ['slime', 'scarab', 'bat'] as MobKind[] },
    beast:  { name: 'Beast Nest',  mobs: ['slime', 'boar', 'rockling', 'bogtoad'] as MobKind[] },
    spirit: { name: 'Spirit Nest', mobs: ['bat', 'wisp', 'frostling', 'wraith'] as MobKind[] },
} as const;
export type NestKindId = keyof typeof NEST_KINDS;
export const NEST_KIND_IDS = Object.keys(NEST_KINDS) as NestKindId[];
/** The kind a nest takes from its isle's biome. */
export const nestKindFor = (b: Biome): NestKindId => (b === 'goldsand' ? 'swarm' : b === 'quarry' || b === 'meadow' ? 'beast' : b === 'bog' ? 'spirit' : 'bone');

/** What a nest of this kind hatches for a threat level: its own family, the tiers the level allows (its weakest member when none is allowed yet). */
export function pickRaider (kind: NestKindId, level: number, roll: () => number): MobKind {
    const fam = NEST_KINDS[kind].mobs;
    const cap = tierCap(level);
    const pool = fam.filter((k) => mobDef(k).tier <= cap);
    const list = pool.length ? pool : [fam.reduce((a, b) => (mobDef(b).tier < mobDef(a).tier ? b : a))];
    const weights = list.map((k) => 1 + Math.max(0, 3 - (cap - mobDef(k).tier)) * 0.7);
    let r = roll() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { r -= weights[i]; if (r <= 0) return list[i]; }
    return list[0];
}

/** Elites only show up once you have found your feet, then get more common. */
export const eliteChance = (level: number) => level < 6 ? 0 : Math.min(0.22, 0.012 * (level - 4));

/** How many monsters come for each farmer in a night. */
export const nightCount = (level: number) => Math.max(2, Math.min(14, Math.round(1.5 + level * 0.5)));

/** Newcomers get bitten softly: contact and shot damage is cut until level 5. */
export const softHit = (level: number) => level >= 5 ? 1 : 0.55 + 0.1 * level;

export const PROJ: Record<ProjKind, { color: number; r: number; life: number }> = {
    arrow: { color: PAL.cream,   r: 2.5, life: 2.2 },
    orb:   { color: PAL.foam,    r: 3,   life: 3.4 },
    rock:  { color: PAL.stone,   r: 3.5, life: 2.6 },
    spore: { color: PAL.leaf,    r: 3.5, life: 3.2 },
    frost: { color: PAL.foam,    r: 3,   life: 2.4 },
    fire:  { color: PAL.pumpkin, r: 3,   life: 2.4 },
    bolt:  { color: PAL.plum,    r: 3,   life: 2.2 },
};
