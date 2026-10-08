// The Awesome Farm palette — the ONLY colours art and UI may use. (Storybook: warm outlines,
// a turquoise sea, sunlit greens and cream highlights.)
// Single source of truth: sprites reference these by their one-letter `char`,
// code references them by name (PAL.leaf). `npm run palette` regenerates
// palette.gpl from this file for the repo's ComfyUI sprite pipeline.

const PALETTE = [
    // char, name,        hex       — role
    ['k', 'ink',        0x2a1d2c], // outlines, eyes, darkest shadow: a warm aubergine, never pure black
    ['n', 'night',      0x35305c], // night overlay, coal, deep shadow
    ['D', 'deepSea',    0x2d6ea6], // open water
    ['W', 'sea',        0x4ab2cf], // shallow water
    ['F', 'foam',       0xcdf4ee], // foam, sparkles, ice
    ['G', 'pine',       0x2d6a50], // leaf shadow
    ['g', 'leaf',       0x5cb04f], // leaves
    ['h', 'grass',      0x92d364], // meadow ground
    ['l', 'lime',       0xd4f08a], // leaf/grass highlight, revive
    ['e', 'moss',       0x6c9a49], // quarry ground
    ['B', 'bark',       0x6a402f], // dark wood
    ['b', 'wood',       0xa8703f], // wood, handles
    ['d', 'dirt',       0xd49a62], // dirt, cliff faces, tilled soil
    ['s', 'sand',       0xf4deaa], // sand ground, cream shading
    ['c', 'cream',      0xfff6e0], // Sprout's body, UI panels
    ['r', 'berry',      0xe85d62], // berries, hearts, danger
    ['o', 'pumpkin',    0xf8a24a], // pumpkins, fire, rust
    ['y', 'gold',       0xffd966], // coins, gold, energy
    ['p', 'blossom',    0xf79fc6], // flowers, cheeks
    ['v', 'plum',       0x9d6fdb], // slimes, XP, perks, magic
    ['u', 'dusk',       0x5d4a7c], // bog ground
    ['S', 'slate',      0x666b86], // dark stone
    ['t', 'stone',      0x9ea4b9], // stone
    ['T', 'pebble',     0xd5d9e6], // stone highlight, iron
    ['w', 'snow',       0xfffbf4], // snow, white highlights
] as const;

type PalName = typeof PALETTE[number][1];

/** Palette colours by name, e.g. PAL.leaf → 0x3fae4f */
export const PAL = Object.fromEntries(PALETTE.map(([, name, hex]) => [name, hex])) as Record<PalName, number>;

/** Palette colours by sprite char, e.g. CHAR.g → 0x3fae4f */
export const CHAR: Record<string, number> = Object.fromEntries(PALETTE.map(([ch, , hex]) => [ch, hex]));

/** '#rrggbb' for CSS / Phaser Text styles */
export const css = (hex: number) => '#' + hex.toString(16).padStart(6, '0');
