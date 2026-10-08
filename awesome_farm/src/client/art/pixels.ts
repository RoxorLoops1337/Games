// Tiny pixel-art DSL. Sprites are authored as rows of palette chars
// ('.' = transparent) WITHOUT an outline; makeSprite() adds the 1px ink
// outline so every sprite follows the art style automatically.

import { CHAR } from '../../shared/palette';
import { addDense, SS } from '../res';
import { outlineOf, rgb } from './paint';

export type Grid = readonly string[];

/** Throws with the offending row if a grid is ragged or uses a non-palette char. */
export function checkGrid (name: string, rows: Grid) {
    const w = rows[0].length;
    rows.forEach((row, i) => {
        if (row.length !== w) throw new Error(`sprite "${name}" row ${i} is ${row.length} wide, expected ${w}: "${row}"`);
        for (const ch of row) {
            if (ch !== '.' && CHAR[ch] === undefined) throw new Error(`sprite "${name}" uses unknown palette char "${ch}"`);
        }
    });
}

/** Swap palette chars, e.g. recolour a rock into an ore. */
export function recolor (rows: Grid, map: Record<string, string>): string[] {
    return rows.map((row) => [...row].map((ch) => map[ch] ?? ch).join(''));
}

/** Paint chars at [x, y] positions on top of a grid (ore specks, details). */
export function stamp (rows: Grid, dots: [number, number, string][]): string[] {
    const out = rows.map((r) => [...r]);
    for (const [x, y, ch] of dots) if (out[y]?.[x] && out[y][x] !== '.') out[y][x] = ch;
    return out.map((r) => r.join(''));
}

/**
 * Smooth a grid up to twice its size without blurring it: Scale2x (EPX) turns every pixel into four and
 * rounds off the steps of diagonal edges, so old grid art sits comfortably beside the painted sprites.
 */
function scale2x (rows: Grid): string[] {
    const h = rows.length, w = rows[0].length;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : rows[y][x]);
    const out: string[] = [];
    for (let y = 0; y < h; y++) {
        let r0 = '', r1 = '';
        for (let x = 0; x < w; x++) {
            const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
            r0 += (C === A && C !== D && A !== B ? A : P) + (A === B && A !== C && B !== D ? B : P);
            r1 += (D === C && D !== B && C !== A ? C : P) + (B === D && B !== A && D !== C ? D : P);
        }
        out.push(r0, r1);
    }
    return out;
}

/** Draw one scaled-up grid into a 2D context at (ox, oy); with an outline it gets a 1-pixel border all round. */
function paintDense (ctx: CanvasRenderingContext2D, rows: Grid, ox: number, oy: number, outline: boolean) {
    const h = rows.length, w = rows[0].length, pad = outline ? 2 : 0;
    const fw = w + pad * 2, fh = h + pad * 2;
    const img = new ImageData(fw, fh);           // (built, not read back from the canvas: a read-back per sprite is what a slow boot is made of)
    const put = (x: number, y: number, hex: number) => {
        const i = (y * fw + x) * 4;
        const [r, g, b] = rgb(hex);
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    };
    const solid = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && rows[y][x] !== '.';
    for (let y = -1; y <= h; y++) {
        for (let x = -1; x <= w; x++) {
            if (solid(x, y)) put(x + pad, y + pad, CHAR[rows[y][x]]);
            else if (outline && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) {
                const n = solid(x - 1, y) ? rows[y][x - 1] : solid(x + 1, y) ? rows[y][x + 1] : solid(x, y - 1) ? rows[y - 1][x] : rows[y + 1][x];
                put(x + pad, y + pad, outlineOf(CHAR[n]));
            }
        }
    }
    ctx.putImageData(img, ox, oy);
}

/**
 * Register a texture from one or more same-sized grid frames (laid out in a row), drawn at SS density.
 * Frame names are 0..n-1. With outline the sprite is (w+2)x(h+2) units per frame, as it always was.
 */
export function makeSprite (scene: Phaser.Scene, key: string, frames: Grid | Grid[], outline = true) {
    const list = (typeof frames[0] === 'string' ? [frames] : frames) as Grid[];
    list.forEach((f, i) => checkGrid(`${key}#${i}`, f));
    const w0 = list[0][0].length, h0 = list[0].length;
    const pad = outline ? 2 : 0;
    const fw = (w0 + pad) * SS, fh = (h0 + pad) * SS;
    const canvas = document.createElement('canvas');
    canvas.width = fw * list.length;
    canvas.height = fh;
    const ctx = canvas.getContext('2d')!;
    list.forEach((f, i) => {
        if (f[0].length !== w0 || f.length !== h0) throw new Error(`sprite "${key}" frame ${i} size differs from frame 0`);
        paintDense(ctx, SS === 2 ? scale2x(f) : f, i * fw, 0, outline);
    });
    return addDense(scene, key, canvas, list.map((_, i) => ({ name: i, x: i * fw, y: 0, w: fw, h: fh })));
}

/** Plain filled-shape textures for particles and UI (white, so tint works). */
export function makeShape (scene: Phaser.Scene, key: string, rows: Grid) {
    const mapped = rows.map((r) => r.replace(/#/g, 'w'));
    return makeSprite(scene, key, mapped, false);
}
