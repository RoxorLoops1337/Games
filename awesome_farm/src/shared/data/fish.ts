// Fishing: what lives in the water, what bites when, and how good each rod is. The sim
// (sim/fishing.ts) rolls from these tables; the Journal's fish log lists every species.

import type { Biome } from './biomes';
import type { ItemId } from './items';
import type { Rng } from '../rng';

interface FishDef {
    id: ItemId;
    rarity: 0 | 1 | 2 | 3 | 4;
    weight: number;                  // how often it bites, relative to the others
    size: [number, number];          // cm
    biomes?: Biome[];                // where it likes to be (other places: rare)
    when?: 'day' | 'night';
    rain?: boolean;                  // only bites while it rains
    fight: 0 | 1 | 2 | 3;            // tugs after the hook is set
    minRod: 0 | 1 | 2;
    hint: string;                    // shown in the fish log until you have caught one
}

export const FISH: FishDef[] = [
    { id: 'fish_minnow', rarity: 0, weight: 40, size: [5, 12], fight: 0, minRod: 0, hint: 'Anywhere there is water.' },
    { id: 'fish_carp', rarity: 0, weight: 30, size: [25, 55], biomes: ['meadow', 'bog', 'goldsand'], fight: 0, minRod: 0, hint: 'Slow, green waters.' },
    { id: 'fish_perch', rarity: 0, weight: 26, size: [14, 34], biomes: ['quarry', 'meadow', 'snowcap'], fight: 0, minRod: 0, hint: 'Near rocky shores.' },
    { id: 'fish_trout', rarity: 1, weight: 18, size: [25, 60], biomes: ['snowcap', 'quarry'], when: 'day', fight: 1, minRod: 0, hint: 'Cold water, in daylight.' },
    { id: 'fish_bass', rarity: 1, weight: 16, size: [30, 65], biomes: ['meadow', 'goldsand'], fight: 1, minRod: 0, hint: 'Sunny shallows.' },
    { id: 'fish_eel', rarity: 1, weight: 14, size: [45, 110], biomes: ['bog'], when: 'night', fight: 1, minRod: 0, hint: 'Bog water, after dark.' },
    { id: 'fish_catfish', rarity: 1, weight: 14, size: [40, 100], biomes: ['bog', 'meadow'], fight: 1, minRod: 0, hint: 'Murky water. Likes the rain.' },
    { id: 'fish_koi', rarity: 2, weight: 8, size: [40, 75], rain: true, fight: 2, minRod: 0, hint: 'Only when it rains.' },
    { id: 'fish_pike', rarity: 2, weight: 7, size: [60, 120], biomes: ['snowcap', 'quarry', 'bog'], fight: 2, minRod: 1, hint: 'Needs a better rod.' },
    { id: 'fish_lantern', rarity: 2, weight: 6, size: [10, 25], when: 'night', fight: 1, minRod: 0, hint: 'It glows. Try at night.' },
    { id: 'fish_goldkoi', rarity: 4, weight: 0.2, size: [60, 90], rain: true, when: 'day', fight: 3, minRod: 2, hint: 'A legend. Rain, daylight and the best rod.' },
];
export const FISH_BY_ID: Record<string, FishDef> = Object.fromEntries(FISH.map((f) => [f.id, f]));

interface RodDef { item: ItemId; tier: 0 | 1 | 2; wait: [number, number]; window: number; rare: number; rest: [number, number] }
export const RODS: RodDef[] = [
    { item: 'rod', tier: 0, wait: [4.5, 9], window: 1.15, rare: 1, rest: [0.8, 1.4] },
    { item: 'rod_fine', tier: 1, wait: [3.2, 7], window: 1.35, rare: 1.3, rest: [0.7, 1.2] },
    { item: 'rod_master', tier: 2, wait: [2.2, 5], window: 1.6, rare: 1.7, rest: [0.6, 1.0] },
];
/** The best rod in a set of held items, if any. */
export const bestRod = (has: (id: ItemId) => boolean): RodDef | null => [...RODS].reverse().find((r) => has(r.item)) ?? null;

/** Tugs you may miss or jump the gun on before the fish gets away. */
export const MAX_STRIKES = 2;
/** The window in which a tug can be answered, seconds. */
export const TUG_WINDOW = 0.9;
/** How far from you the bobber may land (px). */
export const CAST_RANGE: [number, number] = [34, 124];

interface CatchRoll { item: ItemId; size?: number; junk?: 'boot' | 'weed' | 'pearl' }

interface RollCtx { biome: Biome; night: boolean; rain: boolean; rod: RodDef; bait: boolean; luck: number }

/** Roll what is on the line: a fish (weighted by place, time, weather, rod and bait), or now and then junk or a pearl. */
export function rollCatch (rng: Rng, c: RollCtx): CatchRoll {
    const entries: { w: number; f?: FishDef; junk?: 'boot' | 'weed' | 'pearl' }[] = [];
    for (const f of FISH) {
        if (f.minRod > c.rod.tier) continue;
        let w = f.weight;
        if (f.biomes) w *= f.biomes.includes(c.biome) ? 1.6 : 0.25;
        if (f.when) w *= f.when === (c.night ? 'night' : 'day') ? 1.5 : 0.04;
        if (f.rain) w *= c.rain ? 4 : 0;
        if (f.rarity >= 2) w *= c.rod.rare * (c.bait ? 1.35 : 1) * (1 + c.luck * 2);
        if (w > 0) entries.push({ w, f });
    }
    entries.push({ w: 7 * (1 - Math.min(0.7, c.luck)), junk: 'boot' }, { w: 6, junk: 'weed' }, { w: 1.1 * (1 + c.luck * 4), junk: 'pearl' });
    const total = entries.reduce((a, e) => a + e.w, 0);
    let r = rng.next() * total;
    let pick = entries[entries.length - 1];
    for (const e of entries) { r -= e.w; if (r <= 0) { pick = e; break; } }
    if (pick.f) {
        const [lo, hi] = pick.f.size;
        const t = Math.pow(rng.next(), 1.5 - Math.min(0.6, c.luck));
        return { item: pick.f.id, size: Math.round(lo + (hi - lo) * t) };
    }
    return { item: pick.junk === 'boot' ? 'junk_boot' : pick.junk === 'pearl' ? 'pearl' : 'fiber', junk: pick.junk };
}
