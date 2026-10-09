// Special buildings: the altar, the dock, the rift forge and the waystone.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { bake, Bld, type BOpts, byHeight, clamp, Col, hash, mix, type Model, seedRand, TAU } from './kit';
import { bob, flag, glints, halo, nightScale, ownGlow } from './b-special-util';
import { RAMP } from './data';

export const W = RAMP.wood;
export const ST = RAMP.stone;
export const VI = RAMP.violet;
export const ROSE = [0x8a3a78, 0xc9609a, 0xf79fc6, 0xffd0e4, 0xffe4ef];
export const STEEL = RAMP.steel;
export const pickR = (R: readonly number[], t: number): number => R[Math.max(0, Math.min(R.length - 1, Math.round(t * (R.length - 1))))];
export const stoneCol = (y0 = 0, y1 = 1, n = 0.5, seed = 0) => (x: number, y: number, z: number) => pickR(ST, clamp(0.3 + (y - y0) / (y1 - y0 + 0.000001) * 0.22 + (-x - z) * 0.14 + (hash(x * 9.1 + seed, y * 9.1 + z * 7.3) - 0.5) * n * 0.5));
export function mark(b: Bld, x: number, y: number, z: number, len: number, wid: number, ry: number, c: Col) {
    b.hull([[-wid, 0, 0], [wid, 0, 0], [0, 0.012, len], [0, 0.012, -len]], c, { x, y, z, ry, ao: false, v: 0, j: 0 });
}
export function altar(o: BOpts): Model<BuildE> {
    const g = new THREE.Group();
    g.add(bake('sp.altar.stone', (mb) => {
        const b = mb.main, a8 = Math.PI / 8;
        b.cyl(0.95, 1, 0.16, 8, stoneCol(0, 0.2, 0.55, 1), { y: 0.08, ry: a8, j: 0.02 });
        b.cyl(0.7, 0.76, 0.15, 8, stoneCol(0.1, 0.35, 0.5, 2), { y: 0.235, ry: a8, j: 0.02 });
        b.cyl(0.42, 0.47, 0.15, 8, stoneCol(0.2, 0.5, 0.5, 3), { y: 0.385, ry: a8, j: 0.015 });
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * 0.24, z = Math.sin(a) * 0.24;
            b.cone(0.07, 0.34, 4, stoneCol(0.4, 0.8, 0.4, i), { x, y: 0.6, z, rx: Math.sin(a) * 0.34, rz: -Math.cos(a) * 0.34, ry: a, j: 0.01 });
        }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            b.cyl(0.075, 0.1, 0.34, 5, stoneCol(0.1, 0.5, 0.5, 5), { x: sx * 0.66, y: 0.33, z: sz * 0.66, j: 0.012 });
        }
        for (const [x, z, r] of [[0.9, 0.32, 0.07], [-0.86, 0.5, 0.06], [0.2, 0.92, 0.07]]) b.oct(r, ST[2], { x, y: r * 0.5, z, sy: 0.7, j: 0.02 });
    }, 3));
    const runes = bake('sp.altar.runes', (mb) => {
        const gl = mb.glow(0x8a4ae8, 1.6);
        for (let i = 0; i < 8; i++) {
            const a = i / 8 * TAU + Math.PI / 8;
            mark(gl, Math.sin(a) * 0.86, 0.165, Math.cos(a) * 0.86, 0.1, 0.035, a, 0xb78aff);
        }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gl.oct(0.065, (_x, y) => y > 0.5 ? 0xd8c0ff : 0xa070f0, { x: sx * 0.66, y: 0.545, z: sz * 0.66, sy: 1.3, ao: false, v: 0.05 });
    });
    const cry = bake('sp.altar.crystal', (mb) => {
        const gl = mb.glow(0x6a3ab8, 1.5);
        const ring = (r: number, y: number, rot: number) => Array.from({ length: 6 }, (_, k) => [Math.cos(k / 6 * TAU + rot) * r, y, Math.sin(k / 6 * TAU + rot) * r]);
        const col = (x: number, y: number, z: number) => mix(mix(VI[0], VI[3], clamp(y / 1.3)), 0xf79fc6, clamp((y - 1.1) * 1.8)) + 0 * (x + z);
        gl.hull([[0, -0.2, 0], ...ring(0.19, 0, 0), ...ring(0.26, 0.5, 0.2), ...ring(0.2, 1.2, 0.1), [0, 1.85, 0]], (x, y, z) => lightFace(col(x, y, z), x, z), { ao: false, v: 0.14, j: 0.01 });
        for (const [x, z, h, w, ry] of [[0.3, 0.14, 0.62, 0.1, 0.4], [-0.28, 0.2, 0.5, 0.09, 1.3]]) {
            gl.hull([[0, -0.05, 0], ...Array.from({ length: 5 }, (_, k) => [Math.cos(k / 5 * TAU) * w, 0.1, Math.sin(k / 5 * TAU) * w]), [0, h, 0]], (xx, yy, zz) => lightFace(mix(VI[2], 0xf79fc6, clamp(yy * 1.4)), xx, zz), { x, y: 0, z, rz: x * 0.7, rx: -z * 0.7, ry, ao: false, v: 0.08 });
        }
    });
    cry.position.y = 0.62;
    const cryG = new THREE.Group();
    cryG.add(cry);
    g.add(cryG);
    const own = ownGlow(cryG);
    const ownR = ownGlow(runes);
    g.add(runes);
    const sparks = glints(g, 4, 0xe0c8ff, 2.4);
    const shards = [0, 1, 2].map(() => {
        const s = bake('sp.altar.shard', (mb) => {
            mb.glow(0x8a4ae8, 1.6).oct(0.06, 0xd8b0ff, { sy: 1.9, ao: false, v: 0.05 });
        });
        g.add(s);
        return s;
    });
    const pool = halo(0xa070ff, 1.9, true), air = halo(0xb78aff, 1);
    air.position.set(0, 1.15, 0.1);
    g.add(pool, air);
    const ph = hash(o.seed, 7) * TAU;
    return {
        obj: g,
        update(_dt: number, t: number) {
            cryG.position.y = bob(t, 0.05, 1.3, ph) + 0.03;
            cryG.rotation.y = t * 0.32 + ph;
            const k = 0.82 + 0.28 * Math.sin(t * 1.9 + ph);
            own.set(k);
            ownR.set(0.7 + 0.5 * Math.sin(t * 1.2 + 1));
            for (let i = 0; i < sparks.length; i++) {
                const s = sparks[i];
                const p = (t * 0.22 + i * 0.25) % 1, a = i * 1.57 + t * 0.5, r = 0.46 + Math.sin(p * Math.PI) * 0.16;
                s.position.set(Math.cos(a) * r, 0.5 + p * 1.7, Math.sin(a) * r);
                s.scale.setScalar(Math.sin(p * Math.PI) * 1.1 + 0.05);
                s.rotation.y = a;
            }
            for (let i = 0; i < shards.length; i++) {
                const sh = shards[i], a = -t * 0.45 + i * 2.09 + ph;
                sh.position.set(Math.cos(a) * 0.62, 1 + Math.sin(t * 1.3 + i * 2) * 0.12 + i * 0.1, Math.sin(a) * 0.62);
                sh.rotation.y = a;
                sh.rotation.z = 0.25;
            }
            pool.scale.setScalar(nightScale(1.9, t, 0.05, 1.9, ph, 0.3));
            air.scale.setScalar(nightScale(1.15, t, 0.1, 1.9, ph + 1, 0.3));
        },
        dispose() {
            own.dispose();
            ownR.dispose();
        }
    };
}
export function lightFace(c: number, x: number, z: number) {
    return mix(c, -x - z > 0 ? 0xffffff : 0x2a1d2c, Math.min(0.28, Math.abs(-x - z) * 0.6));
}
export const wd = (seed: number) => (x: number, y: number, z: number) => pickR(W, clamp(0.52 + y * 0.25 + (-x - z) * 0.12 + (hash(x * 11 + seed, y * 9 + z * 7) - 0.5) * 0.4));
export function dock(o: BOpts): Model<BuildE> {
    const g = new THREE.Group();
    g.add(bake('sp.dock.body', (mb) => {
        const b = mb.main, wood = wd(5);
        for (let i = 0; i < 5; i++) b.box(2.9, 0.13, 0.36, byHeight(W, -0.05, 0.17, 0.5, i), { y: 0.065, z: -0.76 + i * 0.38, j: 0.012, v: 0.07 });
        for (const [x, z, h] of [[-1.4, 0.88, 0.78], [0, 0.88, 0.7], [1.4, 0.88, 0.78], [-1.4, -0.88, 0.7], [1.4, -0.88, 0.7]]) {
            b.box(0.12, h, 0.12, wood, { x, y: h / 2 + 0.05, z, j: 0.012 });
        }
        const rope = 0xdcb870;
        for (const s of [-1, 1]) {
            const x0 = s * 1.4, x1 = 0;
            b.rod([x0, 0.66, 0.88], [(x0 + x1) / 2, 0.52, 0.9], 0.016, 3, rope, undefined, { ao: false });
            b.rod([(x0 + x1) / 2, 0.52, 0.9], [x1, 0.62, 0.88], 0.016, 3, rope, undefined, { ao: false });
        }
        b.box(2.15, 0.4, 0.36, wd(2), { x: -0.2, y: 0.33, z: -0.66, j: 0.014 });
        b.box(2.3, 0.06, 0.5, wd(9), { x: -0.2, y: 0.56, z: -0.66, j: 0.01 });
        b.box(0.55, 0.5, 0.5, wd(4), { x: -1.05, y: 0.38, z: 0.3, ry: 0.12, j: 0.015 });
        b.box(0.55, 0.05, 0.02, W[0], { x: -1.03, y: 0.38, z: 0.56, ry: 0.12, rz: 0.78, ao: false });
        b.box(0.55, 0.05, 0.02, W[0], { x: -1.03, y: 0.38, z: 0.56, ry: 0.12, rz: -0.78, ao: false });
        b.box(0.34, 0.3, 0.34, wd(6), { x: -1.05, y: 0.78, z: 0.3, ry: 0.5, j: 0.012 });
        b.cyl(0.19, 0.16, 0.42, 6, wd(7), { x: -0.5, y: 0.34, z: 0.55, j: 0.012 });
        b.torus(0.14, 0.05, 3, 7, rope, { x: 0.15, y: 0.17, z: 0.55, rx: Math.PI / 2, j: 0.01, v: 0.08 });
        b.cyl(0.04, 0.055, 2.05, 4, wd(1), { x: -0.5, y: 1.09, z: -0.1, j: 0.008 });
        b.oct(0.07, RAMP.gold[2], { x: -0.5, y: 2.16, z: -0.1, ao: false });
        b.cyl(0.52, 0.58, 0.2, 8, stoneCol(0.1, 0.35, 0.5, 4), { x: 0.95, y: 0.23, z: 0.1, ry: Math.PI / 8, j: 0.015 });
        b.cyl(0.36, 0.42, 0.2, 8, stoneCol(0.25, 0.55, 0.5, 5), { x: 0.95, y: 0.43, z: 0.1, ry: Math.PI / 8, j: 0.015 });
    }, 5));
    const cry = bake('sp.dock.crystal', (mb) => {
        const gl = mb.glow(0xe0609a, 1.6);
        const shard = (x: number, z: number, h: number, w: number, lean: number, ry: number) => {
            const pts = [[0, -0.05, 0]];
            for (let k = 0; k < 6; k++) {
                const a = k / 6 * TAU + ry;
                pts.push([Math.cos(a) * w, 0.05, Math.sin(a) * w], [Math.cos(a) * w * 0.9, h * 0.72, Math.sin(a) * w * 0.9]);
            }
            pts.push([0, h, 0]);
            gl.hull(pts, (xx, yy, zz) => lightFace(pickR(ROSE, clamp(yy / h * 0.75 + 0.2)), xx, zz), { x, z, rz: -x * lean, rx: z * lean, ao: false, v: 0.08, j: 0.008 });
        };
        shard(0, 0, 1, 0.2, 0, 0.2);
        shard(0.26, 0.1, 0.62, 0.13, 0.8, 0.6);
        shard(-0.25, 0.14, 0.5, 0.12, 0.9, 1.1);
    });
    const cryG = new THREE.Group();
    cryG.add(cry);
    g.add(cryG);
    const own = ownGlow(cryG);
    const sparks = glints(g, 3, 0xffe4ef, 2.4);
    const fl = flag('dock', 0x8f72cc, 0xbba0ee, 1, 0.56, 4, 0.1, 0.55);
    fl.root.position.set(-0.46, 1.74, -0.1);
    g.add(fl.root);
    const mk = bake('sp.dock.flagmark', (mb) => {
        mb.main.hull([[-0.02, -0.07, -0.016], [0.07, -0, -0.016], [-0.02, 0.07, -0.016], [-0.02, -0.07, 0.016], [0.07, -0, 0.016], [-0.02, 0.07, 0.016]], 0xfff6e0, { ao: false, v: 0.02 });
    });
    mk.position.set(0.14, 0, 0);
    mk.scale.setScalar(1.3);
    fl.root.children[0].add(mk);
    const pool = halo(0xff80b0, 2, true), air = halo(0xff9ac8, 1);
    pool.position.set(0.95, 0.03, 0.35);
    air.position.set(0.95, 1.05, 0.2);
    g.add(pool, air);
    const ph = hash(o.seed, 9) * TAU;
    return {
        obj: g,
        update(_dt: number, t: number) {
            cryG.position.set(0.95, 0.54 + bob(t, 0.04, 1.5, ph) + 0.02, 0.1);
            cryG.rotation.y = t * 0.3 + ph;
            own.set(0.85 + 0.25 * Math.sin(t * 2.1 + ph));
            fl.wave(t);
            for (let i = 0; i < sparks.length; i++) {
                const s = sparks[i];
                const p = (t * 0.25 + i * 0.33) % 1, a = i * 2.1 + t * 0.7;
                s.position.set(0.95 + Math.cos(a) * (0.4 + p * 0.1), 0.7 + p * 1, 0.1 + Math.sin(a) * (0.3 + p * 0.08));
                s.scale.setScalar(Math.sin(p * Math.PI) * 1 + 0.05);
                s.rotation.y = a;
            }
            pool.scale.setScalar(nightScale(2, t, 0.05, 1.7, ph, 0.3));
            air.scale.setScalar(nightScale(1, t, 0.1, 2, ph + 2, 0.3));
        },
        dispose() {
            own.dispose();
        }
    };
}
export function riftforge(o: BOpts): Model<BuildE> {
    const g = new THREE.Group();
    g.add(bake('sp.forge.body', (mb) => {
        const b = mb.main;
        const iron = (n = 0.4, sd = 0, base = 0.3) => (x: number, y: number, z: number) => pickR(STEEL, clamp(base + y * 0.5 + (-x - z) * 0.14 + (hash(x * 13 + sd, y * 7 + z * 11) - 0.5) * n));
        b.hull([[-0.82, 0, -0.3], [0.82, 0, -0.3], [0.82, 0, 0.3], [-0.82, 0, 0.3], [-0.76, 0.2, -0.26], [0.76, 0.2, -0.26], [0.76, 0.2, 0.26], [-0.76, 0.2, 0.26]], iron(0.4, 1, 0.34), { j: 0.01 });
        b.hull([[-0.56, 0.2, -0.2], [0.56, 0.2, -0.2], [0.56, 0.2, 0.2], [-0.56, 0.2, 0.2], [-0.5, 0.42, -0.17], [0.5, 0.42, -0.17], [0.5, 0.42, 0.17], [-0.5, 0.42, 0.17]], iron(0.4, 2, 0.34), { j: 0.01 });
        b.hull(
            [[-0.82, 0.42, -0.3], [0.82, 0.42, -0.3], [0.82, 0.42, 0.3], [-0.82, 0.42, 0.3], [-0.97, 0.52, -0.33], [0.97, 0.52, -0.33], [0.97, 0.52, 0.33], [-0.97, 0.52, 0.33], [-0.92, 0.6, -0.31], [0.92, 0.6, -0.31], [0.92, 0.6, 0.31], [-0.92, 0.6, 0.31]],
            (x, y, z) => y > 0.57 ? pickR(STEEL, clamp(0.78 + (-x - z) * 0.2 + (hash(x * 5, z * 5) - 0.5) * 0.14)) : pickR(STEEL, clamp(0.5 + (y - 0.42) * 1.2 + (-x - z) * 0.1)),
            { j: 0.008, v: 0.05 }
        );
        b.box(0.44, 0.045, 0.05, W[2], { x: -0.55, y: 0.63, z: 0.16, ry: 0.35, j: 0.004 });
        b.box(0.13, 0.1, 0.1, STEEL[2], { x: -0.34, y: 0.65, z: 0.22, ry: 0.35 });
        b.cone(0.13, 0.3, 6, (x, y) => pickR(STEEL, clamp(0.78 - (x - 0.9) * 1.2 + (y - 0.5) * 0.2)), { x: 0.97, y: 0.5, z: 0, rz: -Math.PI / 2, ao: false, v: 0.05 });
        b.oct(0.07, RAMP.coal[2], { x: 0.9, y: 0.05, z: 0.4, sy: 0.7, j: 0.01 });
        b.oct(0.06, RAMP.coal[1], { x: -0.9, y: 0.05, z: -0.36, sy: 0.7, j: 0.01 });
    }, 8));
    const studs = bake('sp.forge.glow', (mb) => {
        const gl = mb.glow(0x9a58e8, 1.6);
        for (const x of [-0.45, -0.15, 0.15, 0.45]) gl.oct(0.06, 0xc89aff, { x, y: 0.3, z: 0.215, sy: 1.1, sz: 0.5, ao: false, v: 0.04 });
        gl.box(1.6, 0.025, 0.02, 0xb78aff, { y: 0.545, z: 0.325, ao: false, v: 0 });
        gl.hull([[-0.24, 0, 0], [0.24, 0, 0], [0, 0.014, 0.24], [0, 0.014, -0.24]], 0xd8c0ff, { y: 0.6, ao: false, v: 0 });
        gl.hull([[-0.14, 0, 0], [0.14, 0, 0], [0, 0.02, 0.14], [0, 0.02, -0.14]], 0xf0e4ff, { x: 0, y: 0.6, ao: false, v: 0, ry: 0.78 });
    });
    g.add(studs);
    const gem = bake('sp.forge.gem', (mb) => {
        const gl = mb.glow(0x7a42c8, 1.6);
        gl.oct(0.22, (x, y, z) => lightFace(pickR([0x5a2f9a, 0x8f5ad8, 0xc4a4f0, 0xf79fc6, 0xffe4ef], clamp(y * 2.2 + 0.5)), x, z), { sy: 1.4, ao: false, v: 0.12, j: 0.01, ry: 0.4 });
        gl.oct(0.08, 0xf0c8e8, { x: 0.12, y: 0.12, z: 0.14, sy: 1.3, ao: false, v: 0.05 });
    });
    const gemG = new THREE.Group();
    gemG.add(gem);
    gemG.position.set(0, 1, 0);
    g.add(gemG);
    const own = ownGlow(gemG), ownS = ownGlow(studs);
    const sparks = glints(g, 3, 0xe6d0ff, 2.4);
    const shards = [0, 1, 2].map(() => {
        const s = bake('sp.forge.shard', (mb) => {
            mb.glow(0x8a4ae8, 1.6).oct(0.045, 0xd8b0ff, { sy: 1.8, ao: false, v: 0.04 });
        });
        g.add(s);
        return s;
    });
    const pool = halo(0xb070ff, 1.7, true), air = halo(0xc89aff, 0.8);
    pool.position.set(0, 0.03, 0.25);
    air.position.set(0, 1, 0.1);
    g.add(pool, air);
    const ph = hash(o.seed, 11) * TAU;
    return {
        obj: g,
        update(_dt: number, t: number) {
            gemG.position.y = 1 + bob(t, 0.06, 1.6, ph);
            gemG.rotation.y = t * 0.55 + ph;
            const s = 1 + Math.sin(t * 2.6 + ph) * 0.04;
            gemG.scale.set(s, 2 - s, s);
            own.set(0.85 + 0.3 * Math.sin(t * 2.3 + ph));
            ownS.set(0.75 + 0.35 * Math.sin(t * 1.6));
            for (let i = 0; i < sparks.length; i++) {
                const sp = sparks[i];
                const p = (t * 0.3 + i * 0.33) % 1, a = i * 2.1 + t * 0.9;
                sp.position.set(Math.cos(a) * 0.3, 0.75 + p * 0.9, Math.sin(a) * 0.22);
                sp.scale.setScalar(Math.sin(p * Math.PI) * 0.9 + 0.05);
                sp.rotation.y = a;
            }
            for (let i = 0; i < shards.length; i++) {
                const sh = shards[i];
                const a = t * 0.9 + i * 2.09;
                sh.position.set(Math.cos(a) * 0.42, 1 + Math.sin(t * 1.7 + i) * 0.1, Math.sin(a) * 0.3);
                sh.rotation.y = a;
                sh.rotation.z = 0.3;
            }
            pool.scale.setScalar(nightScale(1.7, t, 0.06, 2.2, ph, 0.35));
            air.scale.setScalar(nightScale(0.85, t, 0.1, 2.3, ph, 0.35));
        },
        dispose() {
            own.dispose();
            ownS.dispose();
        }
    };
}
export function waystone(o: BOpts): Model<BuildE> {
    const g = new THREE.Group();
    const r = seedRand(o.seed * 5 + 3);
    g.add(bake('sp.way.stone', (mb) => {
        const b = mb.main;
        b.hull(
            [
                [-0.27, 0, 0.2],
                [0.27, 0, 0.2],
                [0.32, 0, -0.02],
                [0.2, 0, -0.22],
                [-0.22, 0, -0.2],
                [-0.32, 0, 0],
                [-0.24, 0.95, 0.16],
                [0.25, 0.95, 0.16],
                [0.28, 0.95, -0.02],
                [0.18, 0.95, -0.18],
                [-0.2, 0.95, -0.17],
                [-0.28, 0.95, 0],
                [-0.15, 1.82, 0.1],
                [0.14, 1.9, 0.1],
                [0.17, 1.84, -0.04],
                [0.08, 1.93, -0.12],
                [-0.12, 2, -0.11],
                [-0.18, 1.88, 0]
            ],
            (x, y, z) => pickR(ST, clamp(y / 3.4 + 0.66 + (-x - z) * 0.4 + (hash(x * 17, y * 9 + z * 13) - 0.5) * 0.28)),
            { j: 0.016, v: 0.07, sx: 1.22, sz: 1.15 }
        );
        for (let i = 0; i < 5; i++) {
            const a = i / 5 * TAU + r() * 0.4, rad = 0.44 + r() * 0.1, s = 0.06 + r() * 0.07;
            b.oct(s, stoneCol(0, 0.2, 0.6, i), { x: Math.cos(a) * rad, y: s * 0.45, z: Math.sin(a) * rad * 0.9, sy: 0.7, ry: r() * 3, j: 0.02 });
        }
        for (const [x, z] of [[-0.38, 0.3]]) b.oct(0.08, (xx, yy, zz) => pickR(RAMP.leaf, clamp(0.35 + hash(xx * 9, zz * 9) * 0.5 + yy)), { x, y: 0.04, z, sy: 0.55, j: 0.03 });
    }, 3));
    const runes = bake('sp.way.runes', (mb) => {
        const gl = mb.glow(0x4ab2cf, 1.8);
        const zf = (y: number) => (0.2 - y / 1.9 * 0.1) * 1.15 + 0.004;
        const stroke = (cx: number, cy: number, x0: number, y0: number, x1: number, y1: number, w: number, c: Col) => {
            const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len * w, ny = dx / len * w;
            const z = zf(cy), zr = z + w * 0.9;
            gl.hull([[cx + x0 + nx, cy + y0 + ny, z], [cx + x0 - nx, cy + y0 - ny, z], [cx + x1 + nx, cy + y1 + ny, z], [cx + x1 - nx, cy + y1 - ny, z], [cx + x0, cy + y0, zr], [cx + x1, cy + y1, zr]], c, { ao: false, v: 0, j: 0 });
        };
        const glyphs = [
            [[0, -0.11, 0, 0.11], [0, 0, -0.075, 0.1], [0, 0, 0.075, 0.1]],
            [[0, -0.11, 0, 0.11], [0, 0.11, 0.085, 0.03], [0, 0, 0.085, -0.08]],
            [[-0.06, 0.1, 0.06, 0.035], [0.06, 0.035, -0.06, -0.035], [-0.06, -0.035, 0.06, -0.1]],
            [[-0.07, -0.1, -0.07, 0.1], [-0.07, 0.1, 0.07, 0], [0.07, 0, -0.07, -0.1]]
        ];
        [0.42, 0.78, 1.14, 1.5].forEach((y, k) => glyphs[k].slice(0, k % 2 ? 2 : 3).forEach(([x0, y0, x1, y1]) => stroke(0, y, x0, y0, x1, y1, 0.017, k % 2 ? 0xe8fbff : 0xcdf4ee)));
        gl.oct(0.055, 0xe8fbff, { y: 1.74, z: zf(1.74) + 0.01, sy: 1, sz: 0.5, ao: false, v: 0.02 });
    });
    g.add(runes);
    const gem = bake('sp.way.gem', (mb) => {
        mb.glow(0x6ad0f0, 1.9).oct(0.12, (x, y, z) => lightFace(pickR([0x4ab2cf, 0x9edcf0, 0xe8fbff], clamp(y * 3 + 0.5)), x, z), { sy: 1.5, ao: false, v: 0.07, j: 0.006 });
    });
    const ring = bake('sp.way.ring', (mb) => {
        mb.glow(0x6ad0f0, 1.5).torus(0.3, 0.02, 3, 8, 0xcdf4ee, { ao: false, v: 0.05 });
    });
    const gemG = new THREE.Group();
    gemG.add(gem);
    gemG.position.set(0, 2.38, 0);
    const ringG = new THREE.Group();
    ringG.add(ring);
    ringG.position.set(0, 1.5, 0);
    const ringT = new THREE.Group();
    ringT.add(ringG);
    ringT.rotation.x = Math.PI / 2 - 0.25;
    ringT.position.y = 1.55;
    ringG.position.y = 0;
    g.add(gemG, ringT);
    const own = ownGlow(runes), ownG = ownGlow(gemG), ownR = ownGlow(ringT);
    const sparks = glints(g, 1, 0xcdf4ee, 2.2);
    const pool = halo(0x7ad8f4, 1.4, true), air = halo(0x9ae4f8, 1);
    air.position.set(0, 1.1, 0.12);
    g.add(pool, air);
    const ph = hash(o.seed, 13) * TAU;
    return {
        obj: g,
        update(_dt: number, t: number) {
            const k = 0.65 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.5 + ph));
            own.set(k);
            ownG.set(0.85 + 0.3 * Math.sin(t * 2 + ph));
            ownR.set(0.8 + 0.3 * Math.sin(t * 1.5 + ph + 1));
            gemG.position.y = 2.38 + bob(t, 0.07, 1.4, ph);
            gemG.rotation.y = t * 0.7;
            ringG.rotation.z = t * 0.6;
            ringT.rotation.z = Math.sin(t * 0.5 + ph) * 0.15;
            for (let i = 0; i < sparks.length; i++) {
                const s = sparks[i];
                const p = (t * 0.26 + i * 0.33) % 1, a = i * 2.1 + t * 0.4;
                s.position.set(Math.cos(a) * 0.4, 0.3 + p * 1.9, Math.sin(a) * 0.4);
                s.scale.setScalar(Math.sin(p * Math.PI) * 0.9 + 0.05);
                s.rotation.y = a;
            }
            pool.scale.setScalar(nightScale(1.4, t, 0.05, 1.5, ph, 0.3));
            air.scale.setScalar(nightScale(1.1, t, 0.08, 1.5, ph + 1, 0.3) * (0.75 + 0.4 * k));
        },
        dispose() {
            own.dispose();
            ownG.dispose();
            ownR.dispose();
        }
    };
}
