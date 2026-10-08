// Creatures: wild animals you can befriend with pods. Tamed creatures follow you as a
// companion or live in a Den where they work — chopping, mining, farming, hauling, fuelling
// machines, guarding. The simulation (sim/creatures.ts) reads these tables.

import { PAL } from '../palette';
import type { Rng } from '../rng';
import type { Biome } from './biomes';
import type { ItemId } from './items';

export type WorkKind = 'gather' | 'mine' | 'farm' | 'haul' | 'sort' | 'craft' | 'make' | 'guard';
export const WORK_KINDS: WorkKind[] = ['gather', 'mine', 'farm', 'haul', 'sort', 'craft', 'make', 'guard'];
/** The jobs a companion can do beside you in the field (the rest need a den). */
export const FIELD_TASKS: WorkKind[] = ['gather', 'mine', 'farm', 'guard'];
export const FIELD_INFO: Record<string, string> = {
    gather: 'Chops trees and picks plants near you. What it gets goes straight into your pockets.',
    mine: 'Breaks rocks and ore near you (what its strength allows). The goods go into your pockets.',
    farm: 'Harvests ripe crops near you, replants from your seeds and waters the rest.',
    guard: 'Runs down monsters within a few tiles of you and fights them.',
};

/** The jobs a creature can hold on an island (the rest are done at a machine or workshop). */
export const AREA_JOBS: WorkKind[] = ['gather', 'mine', 'farm', 'haul', 'sort', 'guard'];
export const AREA_INFO: Record<string, string> = {
    gather: 'Fells the trees and picks the plants on the island, and carries them to a chest there.',
    mine: 'Breaks the rocks and ore on the island (what its strength allows) and carries the stone to a chest.',
    farm: 'Fetches seeds from the chest, plants them in your garden beds, waters them, harvests and carries the crops back to the chest.',
    haul: 'Collects loose goods lying about and the output of machines, and carries it all to a chest.',
    sort: 'Walks between the island\u2019s chests and puts like with like: food with food, seeds with seeds, tools with tools. Needs two chests or more.',
    guard: 'Hunts down monsters on the island, day and night, so the others can work in peace.',
};

/** A creature's standing assignment: a job on an island, or a machine or workshop to run. */
export type Post =
    | { k: 'plot'; plot: number; job: WorkKind }
    | { k: 'stn'; id: number; ord?: { r: string; n: number } };

/** How a posted creature is getting on. */
export type PostStatus = 'work' | 'idle' | 'nostore' | 'noinput' | 'nofuel' | 'nopower' | 'norecipe' | 'noorder' | 'done' | 'tidy';
export const STATUS_INFO: Record<PostStatus, { text: string; icon: string; color: number; hint: string; bad: boolean }> = {
    work:     { text: 'Working',            icon: 'k_hammer', color: PAL.lime,    bad: false, hint: '' },
    idle:     { text: 'Nothing to do',      icon: 'k_moon',   color: PAL.pebble,  bad: false, hint: 'There is nothing left for it to do here right now. It keeps an eye out.' },
    nostore:  { text: 'Needs a chest',      icon: 'k_bag',    color: PAL.berry,   bad: true,  hint: 'Build a Chest on the island (or next to the machine, within nine tiles) so it has somewhere to put things.' },
    noinput:  { text: 'Out of supplies',    icon: 'k_hand',   color: PAL.pumpkin, bad: true,  hint: 'Put what it needs in a Chest nearby: ore, wood, ingredients.' },
    nofuel:   { text: 'Out of fuel',        icon: 'k_flame',  color: PAL.pumpkin, bad: true,  hint: 'Put wood, peat or coal in a Chest next to the machine.' },
    nopower:  { text: 'No power',           icon: 'bolt',     color: PAL.gold,    bad: true,  hint: 'Connect the machine to power.' },
    norecipe: { text: 'Pick a recipe',      icon: 'k_book',   color: PAL.gold,    bad: true,  hint: 'Open the Assembler and choose what it should build.' },
    noorder:  { text: 'Waiting for orders', icon: 'k_book',   color: PAL.pebble,  bad: false, hint: 'Open the workshop (E), pick a recipe and give it an order.' },
    done:     { text: 'Order finished',     icon: 'k_star',   color: PAL.lime,    bad: false, hint: 'It finished the whole order. Give it another.' },
    tidy:     { text: 'All tidy',           icon: 'k_star',   color: PAL.lime,    bad: false, hint: 'Everything is where it belongs. It will tidy up again when something changes.' },
};

/** What a worker is doing right now (`CritE.ac`): the icon over its head and the caption beside it. */
export const ACTIVITY: Record<string, { text: string; icon: string }> = {
    chop: { text: 'Chopping', icon: 'k_axe' }, mine: { text: 'Mining', icon: 'i_stone' }, pick: { text: 'Picking plants', icon: 'k_sprout' },
    plant: { text: 'Planting', icon: 'k_sprout' }, harvest: { text: 'Harvesting', icon: 'i_wheat' }, water: { text: 'Watering', icon: 'k_drop' },
    haul: { text: 'Hauling', icon: 'k_bag' }, carry: { text: 'Carrying to a chest', icon: 'k_bag' }, fetch: { text: 'Fetching seeds', icon: 'i_seed_wheat' },
    sortpick: { text: 'Sorting: picking up', icon: 'k_chest' }, sortput: { text: 'Sorting: putting away', icon: 'k_chest' },
    fight: { text: 'Fighting', icon: 'k_sword' }, guard: { text: 'On guard', icon: 'k_shield' },
    keep: { text: 'Tending the machine', icon: 'k_flame' }, make: { text: 'Making things', icon: 'k_hammer' },
    idle: { text: 'Resting', icon: 'k_moon' }, stuck: { text: 'Needs help', icon: 'k_hand' }, walk: { text: 'On the way', icon: 'k_boot' },
};
/** A den worker's activity for the job it just did. */
export const WORK_ACTIVITY: Record<WorkKind, string> = { gather: 'chop', mine: 'mine', farm: 'harvest', haul: 'haul', sort: 'idle', craft: 'keep', make: 'make', guard: 'guard' };

export const WORK_INFO: Record<WorkKind, { name: string; icon: string; color: number; desc: string }> = {
    gather: { name: 'Lumber',  icon: 'k_axe',    color: PAL.lime,    desc: 'Fells trees and gathers plants near the den.' },
    mine:   { name: 'Mining',  icon: 'i_stone',  color: PAL.stone,   desc: 'Breaks rocks and ore near the den.' },
    farm:   { name: 'Farming', icon: 'k_sprout', color: PAL.pumpkin, desc: 'Waters beds so they grow faster, and harvests ripe crops.' },
    haul:   { name: 'Hauling', icon: 'k_bag',    color: PAL.sand,    desc: 'Carries finished goods from machines, and anything lying about, into storage.' },
    sort:   { name: 'Sorting', icon: 'k_chest',  color: PAL.foam,    desc: 'Tidies the chests: like goes with like.' },
    craft:  { name: 'Kindling', icon: 'k_flame', color: PAL.pumpkin, desc: 'Tends furnaces, anvils and kitchens, and speeds up machines nearby.' },
    make:   { name: 'Handiwork', icon: 'k_hammer', color: PAL.sea,   desc: 'Runs workbenches, looms, alchemy tables, sawmills, millstones and assemblers.' },
    guard:  { name: 'Guarding', icon: 'k_shield', color: PAL.berry,  desc: 'Drives off monsters that come near the den.' },
};

type Element = 'leaf' | 'earth' | 'fire' | 'frost' | 'spark' | 'shadow' | 'light';
export const ELEMENT_COLOR: Record<Element, number> = {
    leaf: PAL.leaf, earth: PAL.dirt, fire: PAL.pumpkin, frost: PAL.foam, spark: PAL.gold, shadow: PAL.plum, light: PAL.cream,
};
export const ELEMENT_NAME: Record<Element, string> = { leaf: 'Leaf', earth: 'Earth', fire: 'Fire', frost: 'Frost', spark: 'Spark', shadow: 'Shadow', light: 'Light' };

export type TraitId = 'diligent' | 'fierce' | 'hardy' | 'lucky' | 'swift' | 'bright' | 'tireless' | 'bold';
export const TRAITS: Record<TraitId, { name: string; desc: string; work?: number; atk?: number; hp?: number; luck?: number; spd?: number; xp?: number }> = {
    diligent: { name: 'Diligent', desc: '+15% work speed', work: 0.15 },
    fierce:   { name: 'Fierce',   desc: '+20% attack', atk: 0.2 },
    hardy:    { name: 'Hardy',    desc: '+25% health', hp: 0.25 },
    lucky:    { name: 'Lucky',    desc: '12% chance of a double yield', luck: 0.12 },
    swift:    { name: 'Swift',    desc: 'Quick on its feet', spd: 0.25 },
    bright:   { name: 'Bright',   desc: '+25% experience', xp: 0.25 },
    tireless: { name: 'Tireless', desc: '+10% work speed and +10% attack', work: 0.1, atk: 0.1 },
    bold:     { name: 'Bold',     desc: '+15% health and +10% attack', hp: 0.15, atk: 0.1 },
};
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

interface Species {
    id: string;
    name: string;
    element: Element;
    rarity: 0 | 1 | 2 | 3;               // common … legendary
    biomes: Biome[] | 'any';
    when?: 'day' | 'night';              // only wanders at this time
    hp: number;
    atk: number;
    work: Partial<Record<WorkKind, number>>;   // aptitude 1..5
    desc: string;
    skittish: number;                    // how fast it bolts from you (px/s)
    flies?: boolean;
}

const SP = (s: Species) => s;
export const SPECIES = {
    hopper:    SP({ id: 'hopper',    name: 'Hopper',    element: 'leaf',   rarity: 0, biomes: ['meadow', 'bog'],             hp: 10, atk: 2,   work: { gather: 1, farm: 1, make: 1, sort: 2 },          skittish: 54, desc: 'A bouncy bunny that nibbles stray berries.' }),
    fuzzle:    SP({ id: 'fuzzle',    name: 'Fuzzle',    element: 'earth',  rarity: 0, biomes: ['meadow'],                    hp: 14, atk: 1.5, work: { haul: 2, gather: 1, make: 2, sort: 3 },          skittish: 36, desc: 'A round woolly thing. Happy to carry anything.' }),
    mossback:  SP({ id: 'mossback',  name: 'Mossback',  element: 'leaf',   rarity: 0, biomes: ['meadow', 'bog'],             hp: 18, atk: 2,   work: { farm: 2, haul: 1, make: 1, sort: 1 },            skittish: 24, desc: 'A slow turtle with a garden on its back.' }),
    pebbit:    SP({ id: 'pebbit',    name: 'Pebbit',    element: 'earth',  rarity: 0, biomes: ['quarry', 'snowcap'],         hp: 12, atk: 2.5, work: { mine: 2, make: 1, sort: 1 },                     skittish: 50, desc: 'A rock-coloured rabbit that loves to dig.' }),
    gnaw:      SP({ id: 'gnaw',      name: 'Gnaw',      element: 'earth',  rarity: 1, biomes: ['quarry', 'meadow'],          hp: 14, atk: 3,   work: { gather: 2, mine: 1, make: 2, sort: 1 },          skittish: 46, desc: 'A beaver with teeth like chisels.' }),
    cinderkit: SP({ id: 'cinderkit', name: 'Cinderkit', element: 'fire',   rarity: 1, biomes: ['quarry', 'goldsand'],        hp: 12, atk: 3.5, work: { craft: 2, guard: 1, make: 1 },          skittish: 60, desc: 'A fox kit whose tail never stops smouldering.' }),
    sparkit:   SP({ id: 'sparkit',   name: 'Sparkit',   element: 'spark',  rarity: 1, biomes: ['quarry', 'snowcap'],         hp: 10, atk: 3,   work: { haul: 2, craft: 1, make: 3, sort: 2 },           skittish: 78, desc: 'Static-charged squirrel. Never sits still.' }),
    sandpaw:   SP({ id: 'sandpaw',   name: 'Sandpaw',   element: 'earth',  rarity: 1, biomes: ['goldsand'],                  hp: 12, atk: 3,   work: { haul: 2, guard: 1, sort: 2 },           skittish: 66, desc: 'A big-eared desert fox. Hears everything.' }),
    scarabeau: SP({ id: 'scarabeau', name: 'Scarabeau', element: 'earth',  rarity: 1, biomes: ['goldsand'],                  hp: 16, atk: 3,   work: { mine: 2, haul: 1, sort: 3 },            skittish: 38, desc: 'A jewel beetle that rolls ore into neat piles.' }),
    frostpup:  SP({ id: 'frostpup',  name: 'Frostpup',  element: 'frost',  rarity: 1, biomes: ['snowcap'],                   hp: 16, atk: 4,   work: { guard: 2, haul: 1 },           skittish: 52, desc: 'A husky pup with ice in its fur.' }),
    bogsprout: SP({ id: 'bogsprout', name: 'Bogsprout', element: 'leaf',   rarity: 1, biomes: ['bog'],                       hp: 14, atk: 2,   work: { farm: 3, gather: 1, make: 1 },          skittish: 30, desc: 'A mushroom with legs and a green thumb.' }),
    glimmoth:  SP({ id: 'glimmoth',  name: 'Glimmoth',  element: 'light',  rarity: 2, biomes: ['bog', 'meadow'], when: 'night', hp: 10, atk: 2.5, work: { farm: 2, craft: 1, make: 2 },         skittish: 70, flies: true, desc: 'A glowing moth. Crops grow brighter near it.' }),
    crystalisk: SP({ id: 'crystalisk', name: 'Crystalisk', element: 'light', rarity: 2, biomes: ['snowcap', 'bog', 'quarry'], hp: 20, atk: 4,   work: { mine: 3, craft: 1, make: 2 },           skittish: 42, desc: 'A lizard grown over with crystal. A superb miner.' }),
    duskmaw:   SP({ id: 'duskmaw',   name: 'Duskmaw',   element: 'shadow', rarity: 2, biomes: 'any',            when: 'night', hp: 18, atk: 5.5, work: { guard: 3, haul: 1 },         skittish: 82, desc: 'A shadow cat with too many teeth. Loyal.' }),
    pyrelion:  SP({ id: 'pyrelion',  name: 'Pyrelion',  element: 'fire',   rarity: 3, biomes: ['quarry', 'goldsand'], when: 'day', hp: 26, atk: 6.5, work: { guard: 3, craft: 2, make: 1 },         skittish: 60, desc: 'A lion cub with a mane of living flame.' }),
    aurorin:   SP({ id: 'aurorin',   name: 'Aurorin',   element: 'light',  rarity: 3, biomes: 'any',            when: 'day', hp: 24, atk: 4,   work: { farm: 3, haul: 2, gather: 2, make: 3, sort: 2 }, skittish: 90, desc: 'A glowing deer made of dawn. Seen once in a lifetime.' }),
} satisfies Record<string, Species>;

export type SpeciesId = keyof typeof SPECIES;
export const SPECIES_LIST = Object.keys(SPECIES) as SpeciesId[];
export const spOf = (id: string): Species => (SPECIES as Record<string, Species>)[id];

const RARITY_WEIGHT = [60, 26, 10, 2.5];
export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Legendary'];
export const RARITY_COLORS = [PAL.pebble, PAL.lime, PAL.sea, PAL.gold];

// ── a tamed creature ───────────────────────────────────────────────────────
export interface Pet {
    id: string;                 // unique within the owner
    sp: SpeciesId;
    name: string;
    lv: number;
    xp: number;
    traits: TraitId[];
    den?: number;               // building id of the den it works in
    nest?: number;              // building id of the hatchery it is resting in
    hp?: number;                // current health as a companion (undefined = full)
    star?: number;              // awakening stars, 0..STAR_MAX
    task?: WorkKind;            // what it does beside you as your companion (none: stays at heel)
    post?: Post;                // its standing job: an island to work or a machine to run (it needs no den)
    ps?: PostStatus;            // how that is going
    pn?: number;                // goods it has made or collected at its posts, all told
    aff?: number;               // affection for its farmer, 0..100 (none = 0): earned by petting it beside you (sim/bond.ts, data/bond.ts)
    pt?: { d: number; n: number; g: number };   // … the world day the pets below were counted on, the pets that earned affection that day, and the day it last dug up a gift
}

export const PET_MAX_LEVEL = 30;
export const petXpNeed = (lv: number) => Math.round(20 + 12 * Math.pow(lv, 1.4));

// ── awakening: the late-game way to make a favourite creature stronger ────
export const STAR_MAX = 3;
interface Awakening { lv: number; cost: Partial<Record<ItemId, number>> }
/** What it takes to earn star 1, 2 and 3: a level, and things only the late game provides. */
export const AWAKENINGS: Awakening[] = [
    { lv: 10, cost: { treat: 6, crystal: 2 } },
    { lv: 20, cost: { treat: 12, crystal: 5, rift_shard: 10 } },
    { lv: 30, cost: { treat: 20, crystal: 8, rift_core: 2 } },
];
/** Health and attack bonus at 0..3 stars. */
export const STAR_POWER = [0, 0.2, 0.45, 0.8];
/** Work speed bonus at 0..3 stars. */
export const STAR_WORK = [0, 0.1, 0.22, 0.4];
export const starsOf = (p: Pet) => Math.max(0, Math.min(STAR_MAX, Math.floor(p.star ?? 0)));

const trait = (p: Pet, key: 'work' | 'atk' | 'hp' | 'luck' | 'spd' | 'xp') => p.traits.reduce((n, t) => n + (TRAITS[t][key] ?? 0), 0);
export const petMaxHp = (p: Pet) => Math.round(spOf(p.sp).hp * (1 + 0.1 * (p.lv - 1)) * (1 + trait(p, 'hp')) * (1 + STAR_POWER[starsOf(p)]));
export const petAtk = (p: Pet) => spOf(p.sp).atk * (1 + 0.1 * (p.lv - 1)) * (1 + trait(p, 'atk')) * (1 + STAR_POWER[starsOf(p)]);
export const petSpeedMul = (p: Pet) => 1 + trait(p, 'spd');
export const petXpMul = (p: Pet) => 1 + trait(p, 'xp');
export const petLuck = (p: Pet) => trait(p, 'luck');
/** Work cycle length in seconds (shorter is better): aptitude, level, traits and the owner's Work skill. */
export function workCycle (p: Pet, kind: WorkKind, ownerWork = 0) {
    const apt = spOf(p.sp).work[kind] ?? 0;
    if (!apt) return Infinity;
    return 26 / (0.5 + apt * 0.5) / (1 + 0.04 * (p.lv - 1)) / (1 + trait(p, 'work') + ownerWork + STAR_WORK[starsOf(p)]);
}
// ── breeding ───────────────────────────────────────────────────────────────
/** Seconds an egg takes to form (shortened by the Nursery skill). */
export const BREED_SECS = 240;
export const BREED_TREATS = 3;

/**
 * What two parents produce: one of their species (or, now and then, a relative of one of them
 * a rarity step higher), and traits drawn from both: up to two inherited, sometimes a new one.
 */
export function breedOffspring (a: Pet, b: Pet, rng: Rng): { sp: SpeciesId; traits: TraitId[]; mutated: boolean } {
    let sp: SpeciesId = a.sp === b.sp ? a.sp : rng.next() < 0.5 ? a.sp : b.sp;
    let mutated = false;
    const top = Math.max(spOf(a.sp).rarity, spOf(b.sp).rarity);
    if (rng.next() < 0.08) {
        const els = new Set([spOf(a.sp).element, spOf(b.sp).element]);
        const pool = SPECIES_LIST.filter((id) => els.has(SPECIES[id].element) && SPECIES[id].rarity <= Math.min(3, top + 1) && id !== sp);
        if (pool.length) { sp = rng.pick(pool); mutated = true; }
    }
    const inherited = rng.shuffle([...new Set<TraitId>([...a.traits, ...b.traits])]);
    const traits: TraitId[] = [];
    for (const t of inherited) if (traits.length < 2 && rng.next() < 0.55) traits.push(t);
    if (traits.length < 3 && rng.next() < 0.2) { const t = rng.pick(TRAIT_IDS); if (!traits.includes(t)) traits.push(t); }
    return { sp, traits, mutated };
}

// ── catching ───────────────────────────────────────────────────────────────
export const POD_POWER: Record<string, number> = { pod: 1, pod_great: 1.7, pod_ultra: 2.6 };
const BASE_CATCH = [0.52, 0.36, 0.2, 0.09];
/** Chance a pod holds a wild creature right now. `hpFrac` 1 = unhurt. */
export function catchChance (rarity: number, hpFrac: number, pod: number, bonus: number) {
    const c = BASE_CATCH[rarity] * pod * (1 + (1 - hpFrac) * 1.3) + bonus;
    return Math.max(0.03, Math.min(0.95, c));
}

// (never an island character's name or the farmers' own mascot, Sprout: a pet called Pip beside Pip the creature keeper reads as one person)
export const PET_NAMES = ['Biscuit', 'Noodle', 'Clover', 'Mochi', 'Ziggy', 'Waffles', 'Nugget', 'Pebble', 'Maple', 'Bean', 'Rusty', 'Juniper', 'Tango', 'Fudge', 'Olive', 'Pickle', 'Comet', 'Dot', 'Truffle', 'Puddle'];

/** Pick a species for a plot at the given time. */
export function pickSpecies (biome: Biome, night: boolean, roll: () => number, rareBoost = 0): SpeciesId {
    const pool = SPECIES_LIST.filter((id) => {
        const s = spOf(id);
        if (s.when === 'night' && !night) return false;
        if (s.when === 'day' && night) return false;
        return s.biomes === 'any' || s.biomes.includes(biome);
    });
    const weights = pool.map((id) => { const r = spOf(id).rarity; return RARITY_WEIGHT[r] * (r >= 2 ? 1 + rareBoost : 1); });
    let r = roll() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[0];
}
