// The export chute, the mailbox and the weather vane: three small buildings with a moving part each (the chute gulps and
// flips a coin when it sells, the mailbox's flag goes up when post waits, the vane turns with the day's wind under a little
// picture of tomorrow's weather).
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { forecast, hash as wHash } from '../../shared/weather';
import { vaneIcon } from '../../shared/data/forecast';
import { RAMP } from './data';
import { bake, type BOpts, byHeight, clamp, env, type MB, mix, type Model, TAU } from './kit';
import { BR, chipPool, IR, sc, wc } from './b-work-util';

const INK = 0x25222f;
const WD = RAMP.wood;
const RD = RAMP.red;
/** The mailbox's blue (the 2D painting's ramp: deep sea to foam). */
const BX = [0x2d6ea6, 0x4ab2cf, 0x74cce0, 0xcdf4ee];
const brass = (_x: number, y: number) => mix(BR[1], BR[3], clamp(y * 1.6 - 0.2));

/** A spring that follows a target with a little overshoot (flags, hoppers, vanes). */
class Wobble {
    x: number;
    v = 0;
    constructor (x = 0, public k = 90, public c = 9) { this.x = x; }
    step (target: number, dt: number) {
        const n = Math.max(1, Math.ceil(dt / 0.016)), h = dt / n;
        for (let i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.c * this.v) * h; this.x += this.v * h; }
        return this.x;
    }
}

// ── the export chute ─────────────────────────────────────────────────────────

function chuteBody (mb: MB) {
    const b = mb.main;
    for (const [x, z] of [[-0.25, -0.21], [0.25, -0.21], [-0.25, 0.21], [0.25, 0.21]]) b.box(0.11, 0.07, 0.11, WD[0], { x, y: 0.035, z, j: 0.006 });
    // the box: oak planks standing on end
    for (let i = 0; i < 6; i++) b.box(0.112, 0.36, 0.58, wc(0.55 + (i % 3) * 0.12, 0.25, i), { x: -0.28 + i * 0.112, y: 0.25, j: 0.006, v: 0.07 });
    // two brass bands with rivets
    for (const y of [0.13, 0.36]) {
        b.box(0.7, 0.045, 0.6, brass, { y, j: 0.003, v: 0.04 });
        for (const x of [-0.3, 0.3]) b.oct(0.02, BR[3], { x, y, z: 0.305, sz: 0.5, ao: false });
    }
    // the coin plate with its dark slot
    b.box(0.32, 0.13, 0.02, (_x, y) => mix(BR[2], BR[3], clamp((y - 0.2) * 6)), { y: 0.245, z: 0.3, j: 0.002, v: 0.03 });
    b.box(0.2, 0.028, 0.012, INK, { y: 0.255, z: 0.311, ao: false, v: 0 });
    b.box(0.2, 0.01, 0.012, BR[0], { y: 0.236, z: 0.311, ao: false, v: 0 });
}

function chuteHopper (mb: MB) {
    const b = mb.main, H = 0.32, B0 = 0.25, T0 = 0.43, TH = 0.04;
    // a wide wooden mouth narrowing down into the box: four sloped walls, lit wood outside and shadowed wood inside
    for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1]] as const) {
        const P = (u: number, y: number, off: number) => {
            const r = (B0 + (T0 - B0) * y / H + off) * sg, w = (B0 + (T0 - B0) * y / H + off) * u;
            return ax === 0 ? [w, y, r] : [r, y, w];
        };
        const out = (x: number, y: number, z: number) => ((ax === 0 ? z : x) * sg - (B0 + (T0 - B0) * y / H)) / TH;
        b.hull([P(-1, 0, 0), P(1, 0, 0), P(-1, H, 0), P(1, H, 0), P(-1, 0, TH), P(1, 0, TH), P(-1, H, TH), P(1, H, TH)],
            (x, y, z) => (out(x, y, z) < 0.3 ? pick4(WD, 0.12 + y * 0.9) : pick4(WD, 0.55 + y * 0.6 + (ax === 0 ? 0.15 * sg : -0.1 * sg))), { j: 0.004, v: 0.06, ao: false });
        for (const t of [-0.45, 0.45]) b.rod(P(t, 0.01, TH + 0.005), P(t, H - 0.01, TH + 0.005), 0.011, 4, WD[1], 0.011, { ao: false, v: 0.02 });
    }
    // the dark throat at the bottom, and the brass rim
    b.box(B0 * 2, 0.01, B0 * 2, INK, { y: 0.01, ao: false, v: 0 });
    for (const [w, d, x, z] of [[0.96, 0.055, 0, 0.455], [0.96, 0.055, 0, -0.455], [0.055, 0.86, 0.455, 0], [0.055, 0.86, -0.455, 0]]) b.box(w, 0.05, d, brass, { x, y: H + 0.02, z, j: 0.002, v: 0.03 });
    // a coin waiting on the lip, to say what it does
    mb.shiny().cyl(0.065, 0.065, 0.022, 8, RAMP.gold[2], { x: 0.3, y: H + 0.07, z: 0.45, rx: 1.2, ry: 0.4, ao: false, v: 0.04 });
}

const pick4 = (R: readonly number[], t: number) => R[Math.max(0, Math.min(R.length - 1, Math.round(clamp(t) * (R.length - 1))))];
const coinGeo = () => bake('extra.coin', (mb) => {
    mb.shiny().cyl(0.075, 0.075, 0.024, 10, RAMP.gold[2], { rx: Math.PI / 2, ao: false, v: 0.04 });
    mb.glow(0xffd966, 1.2).cyl(0.04, 0.04, 0.03, 6, RAMP.gold[3], { rx: Math.PI / 2, ao: false, v: 0 });
});

/** The Export Chute: things go in at the top and come out as coins. Each sale makes the hopper gulp and flips a coin up out of it. */
export function chute (_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('extra.chute', chuteBody, 3));
    const hopper = bake('extra.chute.hopper', chuteHopper, 4);
    hopper.position.y = 0.42;
    root.add(hopper);
    // the one item it sells (none: anything) wears a chip on the coin plate
    const chip = chipPool(1, 0.06);
    chip.group.position.set(0.11, 0.21, 0.32);
    root.add(chip.group);
    const coins = [coinGeo(), coinGeo(), coinGeo()].map((g) => { g.visible = false; root.add(g); return { g, a: -1, dx: 0 }; });
    let sig = -1, gulp = 0, next = 0, flt: string | undefined;
    const squash = new Wobble(0, 260, 11);
    return {
        obj: root,
        apply (e: BuildE) {
            const ch = e.ch, s = ch ? ch.s * 1e6 + (ch.w[0] ?? 0) : 0;
            if (sig >= 0 && s !== sig && (ch?.w[0] ?? 0) > 0) {
                gulp = 1;
                const c = coins[next++ % coins.length];
                c.a = 0;
                c.dx = (next % 2 ? 1 : -1) * 0.12;
            }
            sig = s;
            if (e.flt !== flt) { flt = e.flt; chip.put(0, 0, 0, 0, flt ?? null); }
        },
        update (dt: number) {
            gulp = Math.max(0, gulp - dt * 3);
            const k = squash.step(gulp > 0.6 ? -0.16 : 0, dt);
            hopper.scale.set(1 - k * 0.4, 1 + k, 1 - k * 0.4);
            for (const c of coins) {
                if (c.a < 0) continue;
                c.a += dt;
                const u = c.a / 0.8;
                if (u >= 1) { c.a = -1; c.g.visible = false; continue; }
                c.g.visible = true;
                c.g.position.set(c.dx * u, 0.78 + Math.sin(u * Math.PI) * 0.55, 0.05);
                c.g.rotation.y = u * TAU * 2;
                c.g.scale.setScalar(u < 0.7 ? 1 : Math.max(0.001, 1 - (u - 0.7) / 0.3));
            }
        }
    };
}

// ── the mailbox ──────────────────────────────────────────────────────────────

function mailboxBody (mb: MB) {
    const b = mb.main, blue = byHeight(BX, 0.7, 1.08, 0.25, 2);
    b.cyl(0.15, 0.18, 0.06, 6, sc(0.5, 0.2, 1), { y: 0.03, j: 0.01 });
    b.box(0.08, 0.66, 0.08, wc(0.6, 0.2, 2), { y: 0.39, j: 0.004 });
    b.box(0.44, 0.04, 0.6, wc(0.75, 0.2, 3), { y: 0.705, j: 0.004 });
    // the box (long side towards you) with its rounded lid
    b.box(0.4, 0.2, 0.58, blue, { y: 0.825, j: 0.004, v: 0.04 });
    b.cyl(0.2, 0.2, 0.58, 12, blue, { y: 0.925, rx: Math.PI / 2, j: 0.003, v: 0.04 });
    for (const z of [-0.2, 0.2]) b.cyl(0.205, 0.205, 0.02, 12, BX[0], { y: 0.925, z, rx: Math.PI / 2, ao: false, v: 0.02 });
    // the door: a lighter cap, the letter slot and a brass latch
    b.box(0.41, 0.2, 0.02, BX[2], { y: 0.825, z: 0.295, j: 0.002, v: 0.03 });
    b.cyl(0.205, 0.205, 0.02, 12, BX[3], { y: 0.925, z: 0.295, rx: Math.PI / 2, j: 0.002, v: 0.03 });
    b.box(0.2, 0.03, 0.012, INK, { y: 0.95, z: 0.308, ao: false, v: 0 });
    mb.shiny().oct(0.04, RAMP.gold[2], { x: 0.13, y: 0.83, z: 0.31, sz: 0.5, ao: false });
    // the flag's hinge
    b.cyl(0.04, 0.04, 0.03, 6, IR[1], { x: 0.215, y: 0.86, z: -0.06, rz: Math.PI / 2, ao: false });
}

function mailFlag (mb: MB) {
    const b = mb.main;
    b.box(0.03, 0.42, 0.035, RD[1], { y: 0.21, ao: false, v: 0.03 });
    b.hull([[0, 0.42, 0], [0, 0.24, 0], [0, 0.33, 0.2], [0.02, 0.42, 0], [0.02, 0.24, 0], [0.02, 0.33, 0.2]], (_x, y) => (y > 0.33 ? RD[3] : RD[2]), { ao: false, v: 0.03 });
}

/** The Mailbox: a blue box on a post; its red flag swings up (with a letter peeking out) while post waits for its owner. */
export function mailbox (_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('extra.mailbox', mailboxBody, 5));
    const flag = new THREE.Group();
    flag.position.set(0.24, 0.86, -0.06);
    flag.add(bake('extra.mailbox.flag', mailFlag, 6));
    root.add(flag);
    const letter = bake('extra.mailbox.letter', (mb) => {
        mb.main.box(0.18, 0.12, 0.014, 0xfff6e0, { ao: false, v: 0.02 });
        mb.main.box(0.04, 0.04, 0.016, RD[1], { y: -0.01, ao: false, v: 0 });
    });
    letter.position.set(0, 0.99, 0.3);
    letter.rotation.x = -0.25;
    root.add(letter);
    const DOWN = -Math.PI / 2;
    let up = false, first = true;
    const sw = new Wobble(DOWN, 120, 7);
    return {
        obj: root,
        apply (e: BuildE) {
            up = !!e.flag;
            if (first) { sw.x = up ? 0 : DOWN; first = false; }
        },
        update (dt: number, t: number) {
            flag.rotation.x = sw.step(up ? 0 : DOWN, dt) + (up ? Math.sin(t * 2.2) * 0.04 * (0.5 + env.wind) : 0);
            letter.visible = up;
            if (up) letter.position.y = 0.99 + Math.max(0, Math.sin(t * 1.6)) * 0.025;
        }
    };
}

// ── the weather vane ─────────────────────────────────────────────────────────

function vaneBody (mb: MB) {
    const b = mb.main, I = IR;
    b.cyl(0.2, 0.25, 0.1, 7, sc(0.55, 0.25, 4), { y: 0.05, j: 0.012 });
    b.cyl(0.045, 0.055, 1.28, 6, wc(0.62, 0.15, 5), { y: 0.74, j: 0.004 });
    // the iron cross with a brass ball at each end, and an N for north
    b.box(0.62, 0.026, 0.026, I[2], { y: 1.06, ao: false, v: 0.03 });
    b.box(0.026, 0.026, 0.62, I[2], { y: 1.06, ao: false, v: 0.03 });
    b.box(0.09, 0.06, 0.09, I[1], { y: 1.06, j: 0.003 });
    for (const [x, z] of [[0.31, 0], [-0.31, 0], [0, 0.31], [0, -0.31]]) mb.shiny().ico(0.035, 0, RAMP.gold[2], { x, y: 1.06, z, ao: false });
    const N = { y: 1.17, z: -0.31 };
    b.box(0.018, 0.13, 0.018, I[3], { x: -0.045, ...N, ao: false, v: 0 });
    b.box(0.018, 0.13, 0.018, I[3], { x: 0.045, ...N, ao: false, v: 0 });
    b.box(0.018, 0.15, 0.018, I[3], { ...N, rz: 0.6, ao: false, v: 0 });
    // the brass ball that carries the arrow
    mb.shiny().ico(0.065, 1, RAMP.gold[2], { y: 1.42, ao: false });
    b.box(0.022, 0.12, 0.022, I[2], { y: 1.5, ao: false, v: 0 });
}

function vaneArrow (mb: MB) {
    const b = mb.main;
    b.box(0.62, 0.026, 0.026, IR[2], { ao: false, v: 0.03 });
    mb.shiny().hull([[0.28, 0.08, 0], [0.28, -0.08, 0], [0.43, 0, 0], [0.28, 0.08, 0.02], [0.28, -0.08, 0.02], [0.43, 0, 0.02]], RAMP.gold[2], { z: -0.01, ao: false, v: 0.04 });
    b.hull([[-0.34, 0.11, 0], [-0.2, 0.11, 0], [-0.15, 0, 0], [-0.2, -0.11, 0], [-0.34, -0.11, 0], [-0.29, 0, 0],
        [-0.34, 0.11, 0.016], [-0.2, 0.11, 0.016], [-0.15, 0, 0.016], [-0.2, -0.11, 0.016], [-0.34, -0.11, 0.016], [-0.29, 0, 0.016]], (_x, y) => (y > 0 ? RD[2] : RD[1]), { z: -0.008, ao: false, v: 0.03 });
}

/** The little 3D pictures over the vane, one per forecast glyph (`vaneIcon` in shared/data/forecast.ts). Built in the x-y plane. */
export const VANE_ICONS: Record<string, (mb: MB) => void> = {
    k_sun (mb) {
        mb.glow(0xffc040, 1.6).ico(0.1, 1, 0xffd966, { ao: false, v: 0.04 });
        for (let i = 0; i < 8; i++) {
            const a = i / 8 * TAU;
            mb.glow(0xffc040, 1.5).cone(0.03, 0.08, 3, 0xffe680, { x: Math.cos(a) * 0.16, y: Math.sin(a) * 0.16, rz: a - Math.PI / 2, ao: false, v: 0 });
        }
    },
    k_rain (mb) {
        cloud(mb, 0xeef2fa);
        for (const x of [-0.08, 0.02, 0.11]) mb.glow(0x4ab2cf, 0.9).oct(0.035, 0x74cce0, { x, y: -0.15 - Math.abs(x) * 0.3, sy: 1.8, ao: false, v: 0 });
    },
    k_storm (mb) {
        cloud(mb, 0x8a90a8);
        mb.glow(0xffd966, 2).hull([[0.02, -0.06, 0], [-0.05, -0.16, 0], [0.01, -0.16, 0], [-0.04, -0.27, 0], [0.02, -0.06, 0.02], [-0.05, -0.16, 0.02], [0.01, -0.16, 0.02], [-0.04, -0.27, 0.02]], 0xffe680, { ao: false, v: 0 });
    },
    k_fog (mb) {
        for (const [y, w] of [[0.08, 0.3], [0, 0.36], [-0.08, 0.26]]) mb.main.cyl(0.03, 0.03, w, 6, 0xd5d9e6, { y, x: (w - 0.3) * 0.4, rz: Math.PI / 2, ao: false, v: 0.03 });
    },
    k_moon (mb) { crescent(mb, 0xfff3b0, 1.4); },
    k_blood (mb) { mb.glow(0xe85d62, 1.8).ico(0.13, 1, 0xe8737a, { ao: false, v: 0.05 }); },
    k_meteor (mb) {
        mb.glow(0xffd966, 2).oct(0.07, 0xfff3b0, { ao: false, v: 0 });
        mb.glow(0xf8a24a, 1.4).cone(0.05, 0.26, 4, 0xf8a24a, { x: -0.13, y: 0.1, rz: Math.PI * 0.72, ao: false, v: 0 });
    },
    k_fairy (mb) {
        mb.glow(0xf79fc6, 2).oct(0.07, 0xffd0e4, { sy: 1.4, ao: false, v: 0 });
        for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; mb.glow(0xf79fc6, 1.8).oct(0.03, 0xffffff, { x: Math.cos(a) * 0.15, y: Math.sin(a) * 0.15, ao: false, v: 0 }); }
    },
};
function cloud (mb: MB, c: number) {
    const b = mb.main;
    b.ico(0.1, 0, c, { x: -0.07, y: 0, sz: 0.6, ao: false, v: 0.05 });
    b.ico(0.12, 0, mix(c, 0xffffff, 0.2), { x: 0.03, y: 0.04, sz: 0.6, ao: false, v: 0.05 });
    b.ico(0.08, 0, c, { x: 0.12, y: -0.01, sz: 0.6, ao: false, v: 0.05 });
}
function crescent (mb: MB, c: number, e: number) {
    for (let i = 0; i < 7; i++) {
        const a = -1.9 + i / 6 * 3.8, r = 0.035 * (1 - Math.abs(i - 3) / 5);
        mb.glow(c, e).ico(r + 0.012, 0, c, { x: Math.cos(a) * 0.11 - 0.02, y: Math.sin(a) * 0.11, ao: false, v: 0.02 });
    }
}

/** The Weather Vane: the arrow swings round to the day's wind (from the seed and the day, with gusts), and the little picture over
 * it is tomorrow's weather, as in the 2D view. */
export function weathervane (o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('extra.vane', vaneBody, 7));
    const arrow = new THREE.Group();
    arrow.position.y = 1.47;
    arrow.add(bake('extra.vane.arrow', vaneArrow, 8));
    root.add(arrow);
    const sky = new THREE.Group();
    sky.position.y = 1.9;
    root.add(sky);
    let day = Number.NaN, seed = '', key = '', ang = Number.NaN, pop = 0;
    const ph = (o.seed * 0.618) % TAU;
    return {
        obj: root,
        update (dt: number, t: number) {
            if (env.day !== day || env.seed !== seed) {
                day = env.day;
                seed = env.seed;
                const k = vaneIcon(forecast(seed, day, 2)[1]);
                if (k !== key) {
                    if (key) pop = 1;
                    key = k;
                    sky.clear();
                    const make = VANE_ICONS[k] ?? VANE_ICONS.k_sun;
                    sky.add(bake(`extra.vane.icon.${k}`, make, 9));
                }
            }
            const want = wHash(seed, day, 21) * TAU + Math.sin(t * 0.9 + ph) * 0.18 * (0.4 + env.wind) + Math.sin(t * 2.3 + ph * 2) * 0.1 * env.wind;
            if (Number.isNaN(ang)) ang = want;
            const d = Math.atan2(Math.sin(want - ang), Math.cos(want - ang));
            ang += d * Math.min(1, dt * (0.6 + env.wind));
            arrow.rotation.y = ang;
            pop = Math.max(0, pop - dt * 2.5);
            const s = 1 + Math.sin(pop * Math.PI) * 0.5;
            sky.scale.set(1.8 * s, 1.8 * (2 - s), 1.8 * s);
            sky.position.y = 1.9 + Math.sin(t * 1.8 + ph) * 0.03;
            sky.rotation.y = Math.sin(t * 0.7 + ph) * 0.5;
        }
    };
}

export const EXTRA = { chute, mailbox, weathervane };
