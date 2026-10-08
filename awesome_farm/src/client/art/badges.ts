// The little status badges that sit over factory machines: a green gear (working), a yellow hourglass
// (waiting), a red bolt (no power), a red cross (blocked) and a red flame (out of fuel). Round, with a bold
// symbol, so they read from across the farm even on a phone. 11×11 grids; makeSprite adds the ink outline.

import type * as Phaser from 'phaser';
import type { Badge } from '../../shared/sim/status';
import { makeSprite } from './pixels';

const N = 11;
const blank = () => Array.from({ length: N }, () => Array<string>(N).fill('.'));
/** A disc: `c` for the body, `s` along the lower rim, `h` for a glint at the top left. */
function disc (c: string, s: string, h: string): string[][] {
    const m = blank();
    const r = 5, cx = 5, cy = 5;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r + 0.15) m[y][x] = d > r - 1.1 && y > cy && x + y > cx + cy + 2 ? s : c;
    }
    m[2][3] = h; m[2][4] = h; m[3][2] = h;
    return m;
}
function stampOn (m: string[][], glyph: string[], ox: number, oy: number) {
    glyph.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') m[oy + y][ox + x] = ch; }));
    return m.map((r) => r.join(''));
}

const GEAR = [
    '...w...',
    '.wwwww.',
    '.wwwww.',
    'www.www',
    '.wwwww.',
    '.wwwww.',
    '...w...',
];
const GLASS = [
    'kkkkk',
    '.kkk.',
    '..k..',
    '..k..',
    '.kok.',
    'koook',
    'kkkkk',
];
const BOLT = [
    '...yy',
    '..yy.',
    '.yy..',
    'yyyyy',
    '..yy.',
    '.yy..',
    'yy...',
];
const CROSS = [
    'ww...ww',
    '.ww.ww.',
    '..www..',
    '...w...',
    '..www..',
    '.ww.ww.',
    'ww...ww',
];
const FLAME = [
    '...y...',
    '..yy...',
    '..yyy..',
    '.yyyyy.',
    '.ywwwy.',
    '.ywwwy.',
    '..yyy..',
];

const SHAPES: Record<Badge, string[]> = {
    work: stampOn(disc('g', 'G', 'l'), GEAR, 2, 2),
    wait: stampOn(disc('y', 'o', 'w'), GLASS, 3, 2),
    power: stampOn(disc('r', 'B', 'p'), BOLT, 3, 2),
    block: stampOn(disc('r', 'B', 'p'), CROSS, 2, 2),
    fuel: stampOn(disc('r', 'B', 'p'), FLAME, 2, 2),
};

/** A Titan node's badge: a gold disc that says how many hands it wants ("2+"). */
const TWO_PLUS = [
    'kkk....',
    '..k..k.',
    'kkk.kkk',
    'k....k.',
    'kkk....',
];
const TITAN_BADGE = stampOn(disc('y', 'o', 'w'), TWO_PLUS, 2, 3);

/** Texture key of a badge picture. */
export const badgeTex = (b: Badge) => `badge_${b}`;

/** The Titan badge's texture key, made once by `ensureTitanBadge`. */
export const TITAN_BADGE_TEX = 'badge_titan';
export function ensureTitanBadge (scene: Phaser.Scene) {
    if (!scene.textures.exists(TITAN_BADGE_TEX)) makeSprite(scene, TITAN_BADGE_TEX, TITAN_BADGE);
}

/** Make the five textures once (the factory view calls this before it draws a badge). */
export function ensureBadgeArt (scene: Phaser.Scene) {
    for (const b of Object.keys(SHAPES) as Badge[]) if (!scene.textures.exists(badgeTex(b))) makeSprite(scene, badgeTex(b), SHAPES[b]);
}
