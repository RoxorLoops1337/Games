// All Awesome Farm art, authored as palette-char grids (see palette.ts).
// Rules: no outline in the grid (makeSprite adds it), light from top-left,
// one highlight + one shadow tone per material, palette chars only.

import { Biome, BIOMES } from '../../shared/data/biomes';
import { registerIcons } from './icons';
import { Grid, makeShape, makeSprite, recolor } from './pixels';
import { registerFactoryArt } from './factory';
import { registerStorybookNature } from './storybook';
import { registerStorybookChars } from './storybook-chars';
import { registerStorybookWorn } from './storybook-worn';
import { registerStorybookHouse } from './storybook-house';
import { registerStorybookLogo } from './storybook-logo';
import { registerStorybookBuildings } from './storybook-build';
import { registerStorybookLuck } from './storybook-luck';
import { registerStorybookDecor } from './storybook-decor';
import { registerStorybookSites } from './storybook-sites';
import { GROUND_VARIANTS, registerStorybookTiles, SHORE_FRAMES, VEIN_KINDS, VEIN_VARIANTS } from './storybook-ground';
import { CAVE_FRAMES, registerStorybookMine } from './storybook-cave';
import { registerStorybookBlight } from './storybook-blight';

// ── Resource nodes ─────────────────────────────────────────────────────────
// (trees, rocks, ores, bushes, flowers and mushrooms are painted in storybook.ts)
// ── Buildings ──────────────────────────────────────────────────────────────
// ── Items & UI icons ───────────────────────────────────────────────────────
const COIN: Grid = [
    '..yyy..',
    '.ywwyy.',
    'ywyyyyo',
    'yyyoyyo',
    'yyyyyoo',
    '.yoooo.',
    '..ooo..',
];
const HEART: Grid = [
    '.rr...rr.',
    'rwrr.rrrr',
    'rwrrrrrrr',
    'rrrrrrrrr',
    '.rrrrrrr.',
    '..rrrrr..',
    '...rrr...',
    '....r....',
];
const BOLT: Grid = [
    '...yy.',
    '..yy..',
    '.yy...',
    'yyyyyy',
    '...yy.',
    '..yy..',
    '.yy...',
];
const SUN: Grid = [
    '....y....',
    '.y.....y.',
    '...yyy...',
    '..yyyyy..',
    'y.yyyyy.y',
    '..yyyyy..',
    '...yyy...',
    '.y.....y.',
    '....y....',
];
const MOON: Grid = [
    '...ccc...',
    '.cccc....',
    '.ccc.....',
    'ccc......',
    'ccc......',
    'ccc......',
    '.cccc..c.',
    '..cccccc.',
    '....cc...',
];
const STAR: Grid = [
    '...y...',
    '..yyy..',
    'yyywyyy',
    '.yyyyy.',
    '.yy.yy.',
    'yy...yy',
];

// ── Tiles (painted in storybook-ground.ts; these are the frame numbers) ───
export const TILE_SHALLOW = 2;
export const tileCliff = (b: Biome) => 3 + BIOMES.indexOf(b);
export const tileGround = (b: Biome, variant: number) => 8 + BIOMES.indexOf(b) * GROUND_VARIANTS + variant;
/** The rift islands: their own cliff and three ground variants, after every biome's. */
export const TILE_RIFT_CLIFF = 8 + BIOMES.length * GROUND_VARIANTS;
export const tileRift = (variant: number) => TILE_RIFT_CLIFF + 1 + variant;
/** Shallow water with foam where it meets land: bits E 1, W 2, S 4, SE 8 (corner), SW 16 (corner). */
export const TILE_SHORE = TILE_RIFT_CLIFF + 4;
export const tileShore = (mask: number) => TILE_SHORE + mask;
/** The caves under the world (painted in storybook-cave.ts, after the shore frames): see that file for the layout. `ore` is 0 for plain rock, else 1 coal … 5 crystal. */
const TILE_CAVE = TILE_SHORE + SHORE_FRAMES;
export const tileCaveFloor = (variant: number) => TILE_CAVE + (variant % 6);
export const tileRockTop = (variant: number, ore = 0) => (ore ? TILE_CAVE + 10 + ore : TILE_CAVE + 6 + (variant % 3));
export const tileRockFace = (variant: number, ore = 0) => (ore ? TILE_CAVE + 15 + ore : TILE_CAVE + 9 + (variant % 2));
/** The ore vein decals (storybook-ground.ts), after the cave: three variants per resource, in VEIN_KINDS order. */
const TILE_VEIN = TILE_CAVE + CAVE_FRAMES;
export const tileVein = (res: string, variant: number) => TILE_VEIN + VEIN_KINDS.indexOf(res) * VEIN_VARIANTS + (variant % VEIN_VARIANTS);

// ── Registration ───────────────────────────────────────────────────────────
function registerShapes (scene: Phaser.Scene) {
    makeSprite(scene, 'heart', HEART);
    makeSprite(scene, 'heart_empty', recolor(HEART, { r: 'S', w: 't' }));
    makeSprite(scene, 'heart_half', HEART.map((row) => row.slice(0, 5) + row.slice(5).replace(/[rw]/g, (c) => (c === 'r' ? 'S' : 't'))));
    makeSprite(scene, 'bolt', BOLT);
    makeSprite(scene, 'sun', SUN);
    makeSprite(scene, 'moon', MOON);
    makeSprite(scene, 'star', STAR);

    // white shapes — tinted at runtime (particles, shadows, UI)
    makeShape(scene, 'px', ['##', '##']);
    makeShape(scene, 'dot', ['.#.', '###', '.#.']);
    // a soft radial gradient for lights: a bright core easing out to nothing, so pools of light glow instead of banding
    {
        const S = 128, c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d')!;
        const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        for (let i = 0; i <= 16; i++) { const t = i / 16; grad.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, 1.7).toFixed(3)})`); }
        ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S);
        scene.textures.addCanvas('light', c);
    }
    makeShape(scene, 'spark', ['..#..', '..#..', '#####', '..#..', '..#..']);
    makeShape(scene, 'leafbit', ['##.', '.##']);
    makeShape(scene, 'shadow', ['..########..', '############', '############', '..########..']);
    makeShape(scene, 'wave', ['.##.', '#..#']);
}

/**
 * Everything painted at boot, in groups, so the loading screen can breathe between them (the lot in one go is half a
 * second on a computer and several on a phone). Monsters and creatures are not here: they are painted the first time
 * one is seen (`ensureMobArt`, `ensureCritterArt`), which a title screen and a fresh island by day never need.
 */
export const ART_GROUPS: [string, (scene: Phaser.Scene) => void][] = [
    ['farmers', (s) => { registerStorybookChars(s); registerStorybookWorn(s); }],
    ['houses', (s) => { registerStorybookHouse(s); registerStorybookLogo(s); }],
    ['nature', registerStorybookNature],
    ['buildings', (s) => { registerStorybookBuildings(s); registerStorybookLuck(s); registerStorybookMine(s); registerStorybookBlight(s); }],
    ['icons', (s) => { makeSprite(s, 'i_coin', COIN); registerIcons(s, 0, 4); }],
    ['tools', (s) => registerIcons(s, 1, 4)],
    ['things', (s) => registerIcons(s, 2, 4)],
    ['glyphs', (s) => registerIcons(s, 3, 4)],
    ['machines', registerFactoryArt],
    ['decor', (s) => { registerStorybookDecor(s); registerStorybookSites(s); }],
    ['shapes', registerShapes],
    ['ground', registerStorybookTiles],
];
