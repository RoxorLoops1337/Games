// The storybook painter. Sprites are painted pixel by pixel on a grid that is SS times denser than the
// game's logical units: forms are shaded in flat bands from a light at the top left, then wrapped in a
// 1-pixel outline whose colour is taken from what it surrounds (warm and dark, never pure black).
// Results are registered as dense textures that occupy the same logical size as the old grid sprites.

import { addDense, SS } from '../res';

export const INK = 0x2a1d2c;

export const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
export const mixc = (a: number, b: number, t: number) => {
    const A = rgb(a), B = rgb(b);
    return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t);
};
export const outlineOf = (c: number, t = 0.7) => mixc(c, INK, t);

/** A tiny seeded random generator: painting is deterministic, so a sprite looks the same every load. */
export const RNG = (seed: number) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

/** Colour ramps, dark → light. */
export const RAMP = {
    leaf: [0x2f6b4b, 0x3f8a4c, 0x5cb04f, 0x86cc5c, 0xb9e47c],
    leafDeep: [0x264f46, 0x2f6b4b, 0x3f8a4c, 0x5cb04f, 0x86cc5c],
    pine: [0x1f4a44, 0x2a6650, 0x3a8660, 0x58a870],
    wood: [0x4a2f2a, 0x6a432f, 0x8f5a36, 0xb87a46, 0xd89c60],
    stone: [0x585c7c, 0x7a7f9e, 0x9ea4bf, 0xc4c9dc, 0xe4e7f2],
    stoneWarm: [0x6c5a62, 0x8c7a80, 0xb09ea0, 0xd2c4c0],
    dark: [0x25222f, 0x3a3647, 0x514c63, 0x6e6a82],
    red: [0x9a3446, 0xc9505a, 0xe8737a, 0xf59a96],
    thatch: [0x9c6a2c, 0xc58f3e, 0xe3b155, 0xf6d27a],
    sand: [0xc9a46a, 0xdcbc82, 0xecd49c, 0xf8e8be],
    clay: [0x8a4a34, 0xaa6244, 0xc8805a, 0xe0a07a],
    peat: [0x2f2420, 0x4a3a32, 0x65503f, 0x82694e],
    cream: [0xd9bfae, 0xecd5bb, 0xfff0d2, 0xfffaf0],
    wool: [0xd2b283, 0xe6cb9c, 0xf6e5c0, 0xfff7e0],
    ice: [0x5a8fb8, 0x8ac4e0, 0xbce8f4, 0xe8fbff],
    violet: [0x4a3a7a, 0x6a52a6, 0x8f72cc, 0xbba0ee],
    gold: [0xb8741a, 0xe0a020, 0xffd966, 0xfff3b0],
    iron: [0x7a4a3a, 0xa8664a, 0xd08a60, 0xf0b088],
    copper: [0x2f7a6a, 0x4aa088, 0xe08a4a, 0xf5b074],
    coal: [0x15131c, 0x25222f, 0x3a3647, 0x56526a],
    pumpkin: [0xa8461a, 0xd8702a, 0xf39a3c, 0xffc878],
    straw: [0xb8841e, 0xdcaa38, 0xf0cc58, 0xfff0a0],
    brass: [0x8a5a18, 0xc58f3e, 0xffd966, 0xfff3b0],
    bloom: [0x6a4aa8, 0x9a74d8, 0xc4a4f0, 0xe8dcff],
    melon: [0x2f6b3a, 0x3f8a4c, 0x6ab85a, 0xa6dc7a],
};

export class Pix {
    readonly d: Int32Array;
    readonly a: Float32Array;

    constructor (readonly w: number, readonly h: number) {
        this.d = new Int32Array(w * h).fill(-1);
        this.a = new Float32Array(w * h).fill(1);
    }

    set (x: number, y: number, c: number, a = 1) {
        x = Math.floor(x); y = Math.floor(y);
        if (x >= 0 && y >= 0 && x < this.w && y < this.h) { this.d[y * this.w + x] = c; this.a[y * this.w + x] = a; }
    }

    get (x: number, y: number) {
        return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.d[y * this.w + x];
    }

    rect (x: number, y: number, w: number, h: number, c: number, a = 1) {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
    }

    /** A line of single pixels. */
    line (x0: number, y0: number, x1: number, y1: number, c: number) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
        for (let i = 0; i <= n; i++) this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
    }

    /** A tapered, curved blade (grass, reeds, leaves): a quadratic curve from the base to the tip, lit on its left. */
    blade (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, halfWidth: number, ramp: readonly number[]) {
        const len = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(cx - x0, cy - y0);
        const steps = Math.max(4, Math.ceil(len * 2));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps, mt = 1 - t;
            const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1, y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
            const dx = 2 * mt * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * mt * (cy - y0) + 2 * t * (y1 - cy), dl = Math.hypot(dx, dy) || 1;
            const nx = -dy / dl, ny = dx / dl, w = halfWidth * (1 - t * 0.92);
            for (let k = -Math.ceil(w); k <= Math.ceil(w); k++) {
                if (Math.abs(k) > w + 0.3) continue;
                const side = w < 0.8 ? 0.5 : (k / w + 1) / 2;   // 0 on the lit side, 1 on the shaded side
                const idx = side < 0.34 ? ramp.length - 1 - (ramp.length > 3 ? 1 : 0) : side < 0.7 ? Math.floor(ramp.length / 2) : 1;
                this.set(Math.round(x + nx * k), Math.round(y + ny * k), ramp[Math.max(0, Math.min(ramp.length - 1, idx))]);
            }
        }
    }

    /** A filled polygon, flat colour or shaded by a function of the position (0..1 across its bounds). */
    poly (pts: [number, number][], color: number | ((u: number, v: number) => number)) {
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
            for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
                const px = x + 0.5, py = y + 0.5;
                let inside = false;
                for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                    const [xi, yi] = pts[i], [xj, yj] = pts[j];
                    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
                }
                if (inside) this.set(x, y, typeof color === 'number' ? color : color((px - x0) / (x1 - x0 || 1), (py - y0) / (y1 - y0 || 1)));
            }
        }
    }

    /** An ellipse shaded in bands. ramp runs dark → light; `light` is where the sun is (x, y in -1..1). */
    ellipse (cx: number, cy: number, rx: number, ry: number, ramp: readonly number[], o: { light?: [number, number]; bias?: number; alpha?: number } = {}) {
        this.ellipseRot(cx, cy, rx, ry, 0, ramp, o);
    }

    /** A tilted ellipse (leaves, ears): same shading, but the shape is rotated by `ang` radians. */
    ellipseRot (cx: number, cy: number, rx: number, ry: number, ang: number, ramp: readonly number[], o: { light?: [number, number]; bias?: number; alpha?: number } = {}) {
        const co = Math.cos(ang), si = Math.sin(ang);
        const L = o.light ?? [-0.55, -0.7], lz = 0.55, ln = Math.hypot(L[0], L[1], lz);
        const bias = o.bias ?? 0.3, R = Math.max(rx, ry) + 2;
        for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
            for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
                const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
                const lx = (dx * co + dy * si) / rx, ly = (-dx * si + dy * co) / ry, r2 = lx * lx + ly * ly;
                if (r2 > 1) continue;
                const nz = Math.sqrt(1 - r2);
                const wx = lx * co - ly * si, wy = lx * si + ly * co;   // the normal back in screen space
                const dd = (wx * L[0] + wy * L[1] + nz * lz) / ln;
                const t = Math.max(0, Math.min(0.999, (dd + bias) / (1 + bias)));
                this.set(x, y, ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))], o.alpha ?? 1);
            }
        }
    }

    /** A soft contact shadow under things that stand on the ground (most sprites leave this to the game). */
    shadow (cx: number, cy: number, rx: number, ry: number, a = 0.28) {
        this.ellipse(cx, cy, rx, ry, [INK], { alpha: a });
    }

    /** Wrap the shape in a 1px outline whose colour is chosen from the pixel it touches. */
    outline (pick: (c: number, x: number, y: number) => number = (c) => outlineOf(c)) {
        const add: [number, number, number][] = [];
        for (let y = -1; y <= this.h; y++) {
            for (let x = -1; x <= this.w; x++) {
                if (this.get(x, y) !== -1) continue;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const c = this.get(x + dx, y + dy);
                    if (c !== -1 && this.a[(y + dy) * this.w + (x + dx)] === 1) { add.push([x, y, pick(c, x, y)]); break; }
                }
            }
        }
        for (const [x, y, c] of add) this.set(x, y, c);
        return this;
    }

    /** Random fleck variation: some pixels of one ramp step jump to the next step up or down. */
    speckle (ramp: readonly number[], rnd: () => number, upChance = 0.08, downChance = 0.06) {
        for (let i = 0; i < this.d.length; i++) {
            const k = ramp.indexOf(this.d[i]);
            if (k < 0) continue;
            const r = rnd();
            if (r < upChance && k < ramp.length - 1) this.d[i] = ramp[k + 1];
            else if (r > 1 - downChance && k > 0) this.d[i] = ramp[k - 1];
        }
        return this;
    }

    /** Copy another painting onto this one (its transparent pixels stay transparent). */
    stamp (o: Pix, ox: number, oy: number) {
        for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) { const c = o.d[y * o.w + x]; if (c !== -1) this.set(ox + x, oy + y, c, o.a[y * o.w + x]); }
    }

    toImage () {
        const img = new ImageData(this.w, this.h);
        for (let i = 0; i < this.d.length; i++) {
            const c = this.d[i];
            if (c === -1) continue;
            img.data[i * 4] = (c >> 16) & 255; img.data[i * 4 + 1] = (c >> 8) & 255; img.data[i * 4 + 2] = c & 255; img.data[i * 4 + 3] = Math.round(this.a[i] * 255);
        }
        return img;
    }
}

/**
 * Register paintings as one dense texture, frames side by side (named 0..n-1). Each frame occupies
 * w/SS by h/SS logical units, the same room an old grid sprite took.
 */
export function paintTexture (scene: Phaser.Scene, key: string, frames: Pix[]) {
    const fw = frames[0].w, fh = frames[0].h;
    for (const f of frames) if (f.w !== fw || f.h !== fh) throw new Error(`painting "${key}": frames differ in size`);
    const canvas = document.createElement('canvas');
    canvas.width = fw * frames.length; canvas.height = fh;
    const ctx = canvas.getContext('2d')!;
    frames.forEach((f, i) => ctx.putImageData(f.toImage(), i * fw, 0));
    return addDense(scene, key, canvas, frames.map((_, i) => ({ name: i, x: i * fw, y: 0, w: fw, h: fh })));
}

/** Paint one sprite of logical size w×h (before the game's own outline padding), at SS density. */
export function paint (scene: Phaser.Scene, key: string, w: number, h: number, draw: (p: Pix, rnd: () => number) => void, seed = 1) {
    const p = new Pix(Math.round(w * SS), Math.round(h * SS));
    draw(p, RNG(seed));
    return paintTexture(scene, key, [p]);
}

/** Paint several frames of an animation. */
export function paintFrames (scene: Phaser.Scene, key: string, w: number, h: number, n: number, draw: (p: Pix, rnd: () => number, frame: number) => void, seed = 1) {
    const frames = Array.from({ length: n }, (_, i) => { const p = new Pix(Math.round(w * SS), Math.round(h * SS)); draw(p, RNG(seed), i); return p; });
    return paintTexture(scene, key, frames);
}
