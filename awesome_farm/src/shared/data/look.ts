// How a farmer looks: the little character creator. A look is a handful of small numbers (body tone, head sprout, eyes, mouth) and the
// scarf colour (the farmer's `color`, which also colours their name, chat and map dot). Nothing here is Phaser: the sim validates a look
// with `cleanLook`, the client paints it.

import { PAL } from '../palette';

/** Body tones (the round turnip). Index 0 is the original cream. */
export const BODY_TONES: readonly { name: string; color: number }[] = [
    { name: 'Cream', color: 0xfff0d2 },
    { name: 'Rose', color: 0xf8c9cd },
    { name: 'Mint', color: 0xcdeccb },
    { name: 'Sky', color: 0xcfe3f6 },
    { name: 'Lilac', color: 0xdccdf2 },
    { name: 'Peach', color: 0xf8d4a8 },
    { name: 'Sun', color: 0xf8eca6 },
    { name: 'Cocoa', color: 0xb98a6c },
];

/** What grows on top. */
export const SPROUTS = ['Sprout', 'Blossom', 'Curl', 'Tuft', 'Twig'] as const;
export const EYES = ['Dots', 'Happy', 'Sparkle', 'Sleepy'] as const;
export const MOUTHS = ['Smile', 'Grin', 'Cat', 'Oh'] as const;

/** Scarf colours, the same eight as the farmer colours (slot order). */
export const SCARF_COLORS = [PAL.berry, PAL.sea, PAL.gold, PAL.plum, PAL.lime, PAL.pumpkin, PAL.blossom, PAL.foam] as const;
export const SCARF_NAMES = ['Berry', 'Sea', 'Gold', 'Plum', 'Lime', 'Pumpkin', 'Blossom', 'Foam'] as const;

/** b: body tone, l: sprout style, e: eyes, m: mouth. */
export interface Look { b: number; l: number; e: number; m: number }

export const DEFAULT_LOOK: Look = { b: 0, l: 0, e: 0, m: 0 };

const SIZES = [BODY_TONES.length, SPROUTS.length, EYES.length, MOUTHS.length] as const;

/** A look off the wire or out of a save, made safe: whole numbers inside each range, or null when it is not a look at all. */
export function cleanLook (v: unknown): Look | null {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    const pick = (k: string, n: number) => { const x = o[k]; return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < n ? x : 0; };
    return { b: pick('b', SIZES[0]), l: pick('l', SIZES[1]), e: pick('e', SIZES[2]), m: pick('m', SIZES[3]) };
}

/** The scarf colour index (0..7) from anything. */
export const cleanScarf = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < SCARF_COLORS.length ? v : 0);

/** A surprising look. `next` gives a number in [0, 1). */
export function randomLook (next: () => number): { look: Look; color: number } {
    const r = (n: number) => Math.min(n - 1, Math.floor(next() * n));
    return { look: { b: r(SIZES[0]), l: r(SIZES[1]), e: r(SIZES[2]), m: r(SIZES[3]) }, color: r(SCARF_COLORS.length) };
}

/** The texture key of a painted farmer. */
export const farmerKey = (look: Look | undefined, color: number) => {
    const l = look ?? DEFAULT_LOOK;
    return `farmer_${l.b}${l.l}${l.e}${l.m}_${color % SCARF_COLORS.length}`;
};
