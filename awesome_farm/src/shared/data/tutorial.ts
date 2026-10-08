// The starting tutorial: sixteen short steps that walk a new farmer through the first ten minutes.
// Plain data and pure functions (no Phaser, no DOM) so a test can drive it: every step has a `done(view)` that
// looks at a plain view of the farmer and what is near them, and a `text(view)` that says what to do next.
// The Phaser side (the coach card, the pointer, the rings on the HUD buttons) is client/ui/tutorial.ts.
//
// Counters (`cnt`) are lifetime totals, so a replay measures them from `view.base` (the counters when the replay began).

import { TUNING } from '../config';
import { clock } from '../fmt';
import { BUILD_CATS, BUILDINGS, SEED_IDS, type BuildingKind } from './buildings';
import { costWords, ITEM_ORDER, ITEMS, resName, type Cost, type Res } from './items';
import type { NodeKind } from './nodes';
import { RECIPES } from './recipes';
import { countOf, derived, have } from '../sim/stats';
import { chestsAround } from '../sim/pool';
import type { Ent, PlayerS } from '../sim/types';

/** Where the HUD can point: a button or strip that is on screen. */
export type HudSpot = 'bag' | 'build' | 'craft' | 'skills' | 'use' | 'act' | 'eat' | 'hotbar';

/** What the pointer should find: the nearest of a kind in the world, the plot for sale, or a spot on the HUD. */
export type Spot =
    | { node: NodeKind }
    | { bld: BuildingKind; ripe?: boolean }
    | { plot: true }
    | { hud: HudSpot };

/** What is lying about near the farmer (the client counts what it has been sent). */
export interface NearFacts {
    /** Buildings in view, by kind (anybody's). */
    bld: Partial<Record<BuildingKind, number>>;
    beds: { empty: number; growing: number; ripe: number };
    /** What the chests within reach hold (they count as pockets when you build or craft), by item. */
    stock?: Partial<Record<string, number>>;
}

/** Count what is in view: buildings by kind, how the garden beds are doing and (when `at` is the farmer) what the chests beside them hold. */
export function nearFacts (ents: Iterable<Ent>, at?: { x: number; y: number }): NearFacts {
    const out: NearFacts = { bld: {}, beds: { empty: 0, growing: 0, ripe: 0 } };
    if (at) {
        const stock: Record<string, number> = out.stock = {};
        ents = [...ents];
        for (const b of chestsAround(ents, at.x, at.y)) for (const [id, k] of Object.entries(b.inv ?? {})) stock[id] = (stock[id] ?? 0) + (k ?? 0);
    }
    for (const e of ents) {
        if (e.k !== 'bld') continue;
        out.bld[e.kind] = (out.bld[e.kind] ?? 0) + 1;
        if (e.kind === 'bed') { if (e.crop === 2) out.beds.ripe++; else if ((e.crop ?? -1) >= 0) out.beds.growing++; else out.beds.empty++; }
    }
    return out;
}

export interface TutorialView {
    me: PlayerS;
    /** Counters when this run of the tutorial began (empty the first time, so old progress counts). */
    base: Record<string, number>;
    clock: { clock: number; night: boolean };
    /** Things only the client can see. */
    ui: { walked: number; opened: string[]; placing: BuildingKind | null };
    near: NearFacts;
    /** What the cheapest plot for sale costs (null when none is in view). */
    price: number | null;
}

/** A line of text: one for a keyboard, one for a phone (a single string serves both). */
export type Say = string | [desktop: string, touch: string];

interface TutStep {
    id: string;
    /** A texture key: `k_…` glyph, `i_<item>` icon or a building's texture. */
    icon: string;
    title: string;
    text: (v: TutorialView) => Say;
    done: (v: TutorialView) => boolean;
    target?: (v: TutorialView) => Spot[];
    /** [have, need] for a step with a count to reach. */
    progress?: (v: TutorialView) => [number, number] | null;
    /** True when this step matters right now whatever the order (dusk is near): it is shown ahead of the others until it is done. */
    urgent?: (v: TutorialView) => boolean;
}

/** The words behind {tokens} in step text. `move` is replaced by the player's real keys on the client. */
export const WORDS = {
    desktop: { move: 'WASD', act: 'Space', use: 'E', eat: 'F', bag: 'I', build: 'B', skills: 'K', tap: 'click', press: 'press', Press: 'Press' },
    touch: { move: 'the stick', act: 'ACT', use: 'USE', eat: 'EAT', bag: 'BAG', build: 'BUILD', skills: 'MENU', tap: 'tap', press: 'tap', Press: 'Tap' },
} as const;
export type Words = Record<keyof typeof WORDS.desktop, string>;

/** Pick the right line for the device and fill in the {tokens}. */
export function say (s: Say, touch: boolean, words: Record<string, string> = WORDS[touch ? 'touch' : 'desktop']): string {
    const raw = typeof s === 'string' ? s : s[touch ? 1 : 0];
    return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in words ? words[k] : m));
}

// ── helpers ─────────────────────────────────────────────────────────────────
/** A counter, measured from where this run began. */
const c = (v: TutorialView, key: string) => (v.me.cnt?.[key] ?? 0) - (v.base[key] ?? 0);
const first = (v: TutorialView) => Object.keys(v.base).length === 0;
const n = (v: TutorialView, item: Parameters<typeof countOf>[1]) => countOf(v.me, item);
const bldN = (v: TutorialView, k: BuildingKind) => v.near.bld[k] ?? 0;
const dayLeft = (v: TutorialView) => TUNING.dayLength - v.clock.clock;
/** The wood and stone and so on a building costs, as words: "5 wood + 2 stone". */
const tab = (k: BuildingKind) => BUILD_CATS.find((x) => x.id === BUILDINGS[k].cat)!.name;
/** What you still lack for a cost (the first thing), or null. */
export function lacking (v: TutorialView, cost: Cost): { res: Res; need: number; have: number } | null {
    for (const [r, k] of Object.entries(cost) as [Res, number][]) {
        const got = have(v.me, r) + (r === 'coin' ? 0 : v.near.stock?.[r] ?? 0);        // (the chests beside you count, as they do when you build)
        if (got < k) return { res: r, need: k, have: got };
    }
    return null;
}
/** Point at what would fill a gap: trees for wood, boulders for stone. */
const gatherSpot = (r: Res): Spot[] => (r === 'wood' ? [{ node: 'tree' }] : r === 'stone' ? [{ node: 'rock' }] : []);
const short = (l: { res: Res; need: number; have: number }) => `You need ${l.need} ${resName(l.res).toLowerCase()} (you have ${l.have}).`;

const WOOD_FOR_BENCH = BUILDINGS.workbench.cost.wood ?? 6;
const hasSeed = (v: TutorialView) => SEED_IDS.some((s) => countOf(v.me, s) > 0);
const hasFood = (v: TutorialView) => ITEM_ORDER.some((id) => !!ITEMS[id].food && ITEMS[id].kind === 'food' && countOf(v.me, id) > 0);
const PLANK = RECIPES['workbench:plank'];

/** A build step's text: what to do, or what is missing first. */
function buildText (v: TutorialView, kind: BuildingKind, how: string): Say {
    const def = BUILDINGS[kind], l = lacking(v, def.cost);
    if (l) return `${short(l)} ${l.res === 'wood' ? 'Chop' : 'Break'} some more first.`;
    return v.ui.placing === kind
        ? [`Pick a spot: {tap} on free ground to put it down. Esc or right-click stops placing.`, `Pick a spot: {tap} on free ground to put it down. CANCEL stops placing.`]
        : `{Press} {build} for the Build menu, open its ${tab(kind)} tab and pick the ${def.name} (${costWords(def.cost)}). ${how}`;
}
const buildSpot = (v: TutorialView, kind: BuildingKind): Spot[] => {
    const l = lacking(v, BUILDINGS[kind].cost);
    return l ? gatherSpot(l.res) : [{ hud: 'build' }];
};

export const STEPS: TutStep[] = [
    {
        id: 'walk', icon: 'k_boot', title: 'Take a walk',
        text: () => ['Use {move} to walk around your island. The + and − keys zoom in and out.', 'Touch and drag on the left to walk around. Pinch with two fingers to zoom.'],
        done: (v) => v.ui.walked >= 40 || (first(v) && c(v, 'harvest') > 0),
        target: () => [],
    },
    {
        id: 'wood', icon: 'i_wood', title: 'Gather wood',
        text: () => 'Hold {act} next to a tree until it falls. The wood flies into your pockets. Get a few!',
        done: (v) => (c(v, 'harvest:tree') >= 1 && n(v, 'wood') >= WOOD_FOR_BENCH) || c(v, 'build:workbench') >= 1,
        target: () => [{ node: 'tree' }, { hud: 'act' }],
        progress: (v) => [Math.min(n(v, 'wood'), WOOD_FOR_BENCH), WOOD_FOR_BENCH],
    },
    {
        id: 'bag', icon: 'k_bag', title: 'Peek in your Backpack',
        text: () => '{Press} {bag} to open your Backpack. Everything you pick up lives in there.',
        done: (v) => v.ui.opened.includes('inventory') || (first(v) && c(v, 'build:workbench') >= 1),
        target: () => [{ hud: 'bag' }],
    },
    {
        id: 'bench', icon: 'workbench', title: 'Build a Workbench',
        text: (v) => buildText(v, 'workbench', 'Then put it down on free ground.'),
        done: (v) => c(v, 'build:workbench') >= 1,
        target: (v) => buildSpot(v, 'workbench'),
    },
    {
        id: 'plank', icon: 'i_plank', title: 'Saw a plank',
        text: (v) => (bldN(v, 'workbench') > 0
            ? `Walk up to the Workbench and {press} {use}. Pick Plank and craft one (${costWords(PLANK.in)}).`
            : 'Your Workbench is out of sight. Walk back to it, then press {use}.'),
        done: (v) => c(v, 'craft:plank') >= 1,
        target: () => [{ bld: 'workbench' }, { hud: 'use' }],
    },
    {
        id: 'stone', icon: 'i_stone', title: 'Break a boulder',
        text: () => 'Hold {act} next to a grey boulder. Stone builds your Campfire and Market Stall.',
        done: (v) => c(v, 'harvest:rock') >= 1,
        target: () => [{ node: 'rock' }, { hud: 'act' }],
    },
    {
        id: 'chest', icon: 'chest_b', title: 'Build a Chest',
        text: (v) => (bldN(v, 'chest') > 0 || c(v, 'build:chest') >= 1
            ? 'Walk up to your Chest, {press} {use} and drop something inside. Crafting uses nearby chests too!'
            : buildText(v, 'chest', 'Then put something inside.')),
        done: (v) => c(v, 'stash') >= 1,
        target: (v) => (bldN(v, 'chest') > 0 ? [{ bld: 'chest' }, { hud: 'use' }] : buildSpot(v, 'chest')),
    },
    {
        id: 'plant', icon: 'k_sprout', title: 'Plant a seed',
        text: (v) => (bldN(v, 'bed') === 0
            ? buildText(v, 'bed', 'Crops grow in it.')
            : !hasSeed(v) && v.near.beds.empty > 0
                ? 'Break a wildflower with {act} to find seeds. Berry bushes sometimes drop them too.'
                : 'Walk up to the Garden Bed and {press} {use} to plant a seed.'),
        done: (v) => c(v, 'plant') >= 1,
        target: (v) => (bldN(v, 'bed') === 0 ? buildSpot(v, 'bed') : !hasSeed(v) && v.near.beds.empty > 0 ? [{ node: 'flower' }, { hud: 'act' }] : [{ bld: 'bed' }, { hud: 'use' }]),
    },
    {
        id: 'harvest', icon: 'i_wheat', title: 'Watch it grow',
        text: (v) => (v.near.beds.ripe > 0
            ? 'It is ripe! {Press} {use} at the Garden Bed to harvest it.'
            : 'Crops grow by themselves, a little faster in the rain. {Press} {use} when it looks full-grown.'),
        done: (v) => c(v, 'crop') >= 1,
        target: (v) => [{ bld: 'bed', ripe: v.near.beds.ripe > 0 }, { hud: 'use' }],
    },
    {
        id: 'sell', icon: 'market', title: 'Sell something',
        text: (v) => {
            if (bldN(v, 'market') > 0 || c(v, 'build:market') >= 1) return 'Stand beside the Market Stall, {press} {use} and sell a few things for coins.';
            return buildText(v, 'market', 'Then sell things at it.');
        },
        done: (v) => c(v, 'sell') >= 1,
        target: (v) => (bldN(v, 'market') > 0 ? [{ bld: 'market' }, { hud: 'use' }] : buildSpot(v, 'market')),
    },
    {
        id: 'land', icon: 'k_flag', title: 'Buy new land',
        text: (v) => (v.price !== null && v.me.coins < v.price
            ? `New land costs ${v.price} coins and you have ${v.me.coins}. Sell a few more things at the Market Stall.`
            : 'Walk to the shore. Pale squares out at sea are for sale: face one and {press} {use}.'),
        done: (v) => c(v, 'buy') >= 1,
        target: (v) => (v.price !== null && v.me.coins < v.price ? [{ bld: 'market' }, { hud: 'use' }] : [{ plot: true }, { hud: 'use' }]),
    },
    {
        id: 'fire', icon: 'campfire', title: 'Light a Campfire',
        text: (v) => {
            const l = lacking(v, BUILDINGS.campfire.cost);
            if (l) return `${short(l)} ${l.res === 'wood' ? 'Chop' : 'Break'} some more: night is coming.`;
            if (v.ui.placing === 'campfire') return buildText(v, 'campfire', '');
            return dayLeft(v) <= TUNING.duskWarn[0] + 15 || v.clock.night
                ? `Night is coming! {Press} {build}, open ${tab('campfire')} and place a Campfire (${costWords(BUILDINGS.campfire.cost)}). Monsters keep away.`
                : `Monsters come out at night. {Press} {build}, open ${tab('campfire')} and place a Campfire (${costWords(BUILDINGS.campfire.cost)}).`;
        },
        done: (v) => c(v, 'build:campfire') >= 1,
        target: (v) => buildSpot(v, 'campfire'),
        urgent: (v) => v.clock.night || dayLeft(v) <= TUNING.duskWarn[0] + 15,
    },
    {
        id: 'eat', icon: 'i_berry', title: 'Have a snack',
        text: (v) => {
            const full = v.me.energy >= derived(v.me).maxEnergy - 1;
            if (!hasFood(v)) return 'Pick berries from a bush with {act}, then {press} {eat} to eat one.';
            return full ? 'Swinging uses energy (the yellow bar). You are full for now: swing a bit more, then {press} {eat}.' : 'Swinging uses energy (the yellow bar). {Press} {eat} to eat and fill it up.';
        },
        done: (v) => c(v, 'eat') >= 1,
        target: (v) => (hasFood(v) ? [{ hud: 'eat' }] : [{ node: 'bush' }, { hud: 'act' }]),
    },
    {
        id: 'skill', icon: 'k_star', title: 'Learn a skill',
        text: (v) => (v.me.points > 0
            ? ['You have a skill point! Press {skills}, then click a glowing skill to learn it.', 'You have a skill point! Tap MENU, then Skills, and tap a glowing skill.']
            : 'Skills make you stronger. Level up to earn a point: almost everything you do gives XP.'),
        done: (v) => c(v, 'skill') >= 1,
        target: (v) => (v.me.points > 0 ? [{ hud: 'skills' }] : []),
    },
    {
        id: 'pin', icon: 'i_pick_flint', title: 'Pin it to your hotbar',
        text: () => ['Open your Backpack ({bag}), then right-click an item to pin it to the hotbar. Keys 1 to 8 pick a slot.', 'Open BAG, tap a hotbar slot, then tap an item to pin it there.'],
        done: (v) => c(v, 'pin') >= 1,
        target: () => [{ hud: 'bag' }, { hud: 'hotbar' }],
    },
    {
        id: 'night', icon: 'k_moon', title: 'Survive the night',
        text: (v) => {
            if (v.clock.night) return 'Stay by your Campfire and hit monsters with {act}. Make it to sunrise!';
            const left = Math.max(0, Math.ceil(dayLeft(v)));
            return left > TUNING.duskWarn[0]
                ? `Night falls in ${clock(left)}. Keep building, then wait by your Campfire.`
                : 'Night is falling! Get next to your Campfire and be ready to swing {act}.';
        },
        done: (v) => c(v, 'night') >= 1,
        target: () => [{ bld: 'campfire' }],
        urgent: (v) => v.clock.night,
    },
];

export const TOTAL = STEPS.length;

/** Skip past every step that is already done: the new index and the steps it passed. */
export function advance (from: number, v: TutorialView, skip?: ReadonlySet<number>): { index: number; passed: number[] } {
    let i = from;
    const passed: number[] = [];
    // the night comes early (its steps jump the queue at dusk) and passes only its own lessons: at dawn the card goes back to the
    // first thing not done yet. Only a farmer who has clearly learnt the ropes is let off the rest once they have seen a night through.
    if (from < STEPS.length && seasoned(v.me) && STEPS[STEPS.length - 1].done(v)) {
        for (; i < STEPS.length; i++) passed.push(i);
        return { index: i, passed };
    }
    while (i < STEPS.length && (skip?.has(i) || STEPS[i].done(v))) { passed.push(i); i++; }
    return { index: i, passed };
}

/** The step to show: the one you are on, unless a later one cannot wait (night is falling). */
export function shown (index: number, v: TutorialView, skip?: ReadonlySet<number>): number {
    if (index >= STEPS.length) return index;
    for (let i = index + 1; i < STEPS.length; i++) if (STEPS[i].urgent?.(v) && !skip?.has(i) && !STEPS[i].done(v)) return i;
    return index;
}

/** A farmer who has long since learnt the ropes: the tutorial would only be in the way (a browser that has no tutorial state for them). */
export const veteran = (me: PlayerS) => me.level > 3 || (me.cnt?.night ?? 0) >= 1;
/** Well past the first evening (the tips' "not worth telling a veteran" level, or a few nights seen): a night survived is lesson enough. */
export const SEASONED_LEVEL = 8;
export const seasoned = (me: PlayerS) => me.level >= SEASONED_LEVEL || (me.cnt?.night ?? 0) >= 3;

export const stepText = (s: TutStep, v: TutorialView, touch: boolean, words?: Words) => say(s.text(v), touch, words);
