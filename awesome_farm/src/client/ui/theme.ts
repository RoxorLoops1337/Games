// The storybook interface: warm wood frames, parchment paper, a red ribbon for titles and brass studs.
// These are UI-only colours (the 25-colour palette is for art and the world). Windows are paper, so text
// on them is ink-brown; the old light-on-dark colours that screens ask for are mapped to paper-safe tones.

import { PAL } from '../../shared/palette';

/** Wood, dark → light. */
export const WOOD = [0x4a2f2a, 0x6a432f, 0x8f5a36, 0xb87a46, 0xd89c60] as const;

export const PAPER = {
    base: 0xf6e6c4,      // the page
    hi: 0xfff3d6,        // a lit fleck
    lo: 0xe9d3a4,        // the margin
    edge: 0xc9a56a,      // the ruled edge
    speck: 0xecd9ae,     // a dull fleck
    well: 0xeedcb0,      // a recessed panel on the page
    deep: 0xe3cb9a,      // a recess inside a recess (an empty slot)
} as const;

/** Brass: studs, trims. */
export const BRASS = { hi: 0xfff3d6, mid: 0xffd966, lo: 0xc58f3e } as const;

/** A locked or empty marker on paper. */
export const LOCKED = 0xb9a98c;

/** The title ribbon, dark → light. */
export const RIBBON = [0x9a3446, 0xc9505a, 0xe8737a, 0xf59a96] as const;
export const RIBBON_FOLD = 0x6e2634;

/** The warm near-black used for outlines and shadows (the palette's ink). */
export const OUTLINE = PAL.ink;

export const TEXT = {
    ink: 0x4a2f2a,        // body text on paper
    dim: 0x6e5038,        // secondary text
    gold: 0x8a4e08,
    lime: 0x2a6e34,
    foam: 0x1a6878,
    berry: 0xa02840,
    plum: 0x63379f,
    blossom: 0xa8386a,
    pumpkin: 0x9a4a08,
    sea: 0x1a5f94,
    cream: 0xfff6e0,      // text on a ribbon, a dark button or the world
} as const;

/**
 * Screens were written for dark panels and ask for pale text colours; on paper those must turn dark.
 * Anything not listed (an element colour, a rarity colour passed on purpose) is left as it is.
 */
const TONE = new Map<number, number>([
    [PAL.cream, TEXT.ink], [PAL.snow, TEXT.ink], [0xffffff, TEXT.ink],
    [PAL.pebble, TEXT.dim], [PAL.stone, TEXT.dim], [PAL.sand, TEXT.dim], [PAL.slate, TEXT.dim], [PAL.dusk, TEXT.dim],
    [PAL.gold, TEXT.gold], [PAL.lime, TEXT.lime], [PAL.foam, TEXT.foam],
    [PAL.berry, TEXT.berry], [PAL.plum, TEXT.plum], [PAL.blossom, TEXT.blossom],
    [PAL.pumpkin, TEXT.pumpkin], [PAL.sea, TEXT.sea], [PAL.leaf, TEXT.lime], [PAL.grass, TEXT.lime],
]);
export function luminance (c: number) {
    const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin((c >> 16) & 255) + 0.7152 * lin((c >> 8) & 255) + 0.0722 * lin(c & 255);
}

/** A text colour that reads on paper: the mapped tone, or any other bright colour darkened until it does. */
export function onPaper (c: number) {
    const t = TONE.get(c);
    if (t !== undefined) return t;
    if (luminance(c) <= 0.2) return c;
    for (let k = 0.3; k <= 0.95; k += 0.1) { const m = mix(c, WOOD[0], k); if (luminance(m) <= 0.13) return m; }
    return TEXT.ink;
}

/** Linear blend of two colours. */
export function mix (a: number, b: number, t: number) {
    const ch = (s: number) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t));
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A bright colour (a season, an element) darkened until it reads as text on paper. */
export const deepen = (c: number, t = 0.6) => mix(c, WOOD[0], t);

/** Dark-theme neutrals that carry no meaning: a rim in one of these draws no accent line. */
export const NEUTRAL_RIMS = new Set<number>([PAL.night, PAL.slate, PAL.dusk, PAL.ink, PAL.pebble, PAL.stone, PAL.sand, PAL.snow, PAL.cream, PAL.deepSea]);

/** What a dark-theme inset fill becomes on paper (lighter = a filled, occupied well). */
export function wellTone (c: number) {
    if (c === PAL.ink) return PAPER.deep;
    if (c === PAL.night) return PAPER.well;
    if (c === PAL.slate || c === PAL.dusk) return PAPER.lo;
    return c;
}
