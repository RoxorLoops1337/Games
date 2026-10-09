// The hatchery, with its egg and resting parents.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { bob, breathe, glints, halo, nightScale } from './b-special-util';
import { RAMP } from './data';
import { bake, type BOpts, byHeight, clamp, hash, mix, type Model, seedRand, smooth, TAU } from './kit';

export const W = RAMP.wood;
export const CR = RAMP.cream;
export const SP = [0xc4994a, 0xdfbd68, 0xf0d890, 0xfff2c0];
export const pickS = (R: readonly number[], t: number): number => R[Math.max(0, Math.min(R.length - 1, Math.round(t * (R.length - 1))))];
export const EGG_PROFILE = [[0.0001, 0], [0.15, 0.01], [0.235, 0.12], [0.25, 0.27], [0.205, 0.42], [0.12, 0.54], [0.05, 0.62], [0.0001, 0.645]];
export const eggRadiusAt = (y: number) => {
    for (let j = 1; j < EGG_PROFILE.length; j++) {
        const a = EGG_PROFILE[j - 1], c = EGG_PROFILE[j];
        if (a[1] <= y && c[1] >= y) return a[0] + (c[0] - a[0]) * ((y - a[1]) / (c[1] - a[1] + 0.000001));
    }
    return 0.2;
};
export const SPECKS = [[-0.2, 0.18, 0.12], [0.1, 0.4, 0.17], [0.22, 0.2, 0.09], [-0.1, 0.1, 0.2], [0, 0.26, 0.215], [-0.17, 0.4, 0.13], [0.2, 0.36, 0.12], [-0.05, 0.5, 0.09], [0.14, 0.12, 0.2]];
export let ghostM: THREE.MeshStandardMaterial | null = null;
export function ghostMat() {
    if (!ghostM) ghostM = new THREE.MeshStandardMaterial({ color: 0xffe0ec, emissive: 0xf79fc6, emissiveIntensity: 0.8, flatShading: true, transparent: true, opacity: 0.6, depthWrite: false, roughness: 0.6 });
    return ghostM;
}
export function hatchery(o: BOpts): Model<BuildE> {
    const g = new THREE.Group();
    g.add(bake('sp.hatch.crate', (mb) => {
        const b = mb.main;
        const wood = (x: number, y: number) => pickS(W, clamp(0.45 + y * 0.9 + (Math.sin(y * 52) > 0.6 ? -0.18 : 0) - x * 0.1 + (hash(x * 9, y * 9) - 0.5) * 0.25));
        for (const s of [-1, 1]) {
            b.box(1.64, 0.5, 0.07, wood, { y: 0.25, z: s * 0.66, j: 0.01 });
            b.box(0.07, 0.5, 1.34, wood, { x: s * 0.82, y: 0.25, j: 0.01 });
            for (const t of [-1, 1]) b.box(0.12, 0.56, 0.12, byHeight(W, 0, 0.6, 0.4, 7), { x: s * 0.82, y: 0.28, z: t * 0.66, j: 0.01 });
        }
        const straw = (x: number, y: number, z: number) => pickS(SP, clamp(0.12 + y * 1.5 + (-x - z) * 0.22 + (hash(x * 11, z * 11) - 0.5) * 0.5));
        b.ico(0.7, 1, straw, { y: 0.12, sy: 0.2, sx: 1.04, sz: 0.82, j: 0.05, ao: false });
        b.torus(0.34, 0.11, 3, 8, (x, y, z) => pickS(SP, clamp(0.5 + (y - 0.3) * 2.2 + (-x - z) * 0.35 + (hash(x * 7, z * 7) - 0.5) * 0.3)), { y: 0.3, rx: Math.PI / 2, j: 0.03, ao: false });
        const r = seedRand(o.seed * 3 + 1);
        for (let i = 0; i < 8; i++) {
            const a = r() * TAU, rad = 0.4 + r() * 0.4, tilt = 0.02 + r() * 0.12, len = 0.32 + r() * 0.16;
            b.leaf(len, 0.03, 0.012, SP[1 + i % 3], { x: Math.cos(a) * rad * 0.95, y: 0.25 + r() * 0.05, z: Math.sin(a) * rad * 0.72, ry: r() * TAU, rx: -tilt, ao: false, v: 0.05 });
        }
    }, 7));
    const shell = () => bake('sp.hatch.shell', (mb) => {
        mb.glow(0xffa860, 0.3).lathe(EGG_PROFILE, 8, (x, y, z) => mix(0xf6dca8, 0xfff6dc, clamp(0.38 + y * 0.6 - x * 0.5 - z * 0.12 + (hash(x * 20, z * 20) - 0.5) * 0.1)), { j: 0.008, ao: false, v: 0.03 });
    });
    const eggMesh = new THREE.Group();
    eggMesh.add(shell());
    eggMesh.add(bake('sp.hatch.speck', (mb) => {
        SPECKS.forEach(([x, y, z], i) => {
            const s = eggRadiusAt(y) * 1.01 / (Math.hypot(x, z) + 0.000001);
            mb.glow(0xffa860, 0.3).tet(0.036 + i % 3 * 0.007, i % 2 ? 0xc99a6c : 0xe8708f, { x: x * s, y, z: z * s, ry: i, rx: 0.6, j: 0.004, ao: false, v: 0.05 });
        });
    }));
    eggMesh.add(bake('sp.hatch.crack', (mb) => {
        const gl = mb.glow(0xff9a30, 2.2);
        const pts = [[-0.06, 0.55, 0.12], [-0.01, 0.43, 0.215], [0.07, 0.36, 0.235], [0.01, 0.27, 0.249], [0.08, 0.2, 0.235]];
        for (let i = 0; i < pts.length - 1; i++) gl.rod(pts[i], pts[i + 1], 0.013, 3, (_x, y) => mix(0xff8a28, 0xffd070, clamp((y - 0.2) * 2)), undefined, { ao: false, v: 0 });
    }));
    eggMesh.scale.setScalar(1.28);
    const eggG = new THREE.Group();
    eggG.add(eggMesh);
    const eggWob = new THREE.Group();
    eggWob.add(eggG);
    eggWob.position.y = 0.3;
    const eggSp = glints(g, 3, 0xffb040, 2.6);
    const ghost = shell();
    ghost.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
            m.material = ghostMat();
            m.castShadow = false;
            m.receiveShadow = false;
        }
    });
    const ghostBase = new THREE.Group();
    ghostBase.add(ghost);
    ghostBase.position.y = 0.3;
    const formG = new THREE.Group();
    formG.add(ghostBase);
    const hearts = [0, 1].map(() => {
        const h = bake('sp.hatch.heart', (mb) => {
            const gl = mb.glow(0xff5f9e, 1.7);
            const col = (_x: number, y: number) => mix(0xff5f9e, 0xffa0c8, clamp(y * 5 + 0.4));
            gl.oct(0.055, col, { x: -0.042, y: 0.04, sy: 1.1, ao: false, v: 0.05 });
            gl.oct(0.055, col, { x: 0.042, y: 0.04, sy: 1.1, ao: false, v: 0.05 });
            gl.hull([[-0.09, 0.03, 0], [0.09, 0.03, 0], [0, -0.1, 0], [0, 0.03, 0.04], [0, 0.03, -0.04]], 0xff5f9e, { ao: false, v: 0.05 });
        });
        formG.add(h);
        return h;
    });
    const formGl = glints(formG, 2, 0xf79fc6, 2.2);
    g.add(eggWob, formG);
    const pool = halo(0xffa850, 1.5, true), pink = halo(0xf79fc6, 1.1, true);
    g.add(pool, pink);
    eggWob.visible = false;
    formG.visible = false;
    pool.visible = false;
    pink.visible = false;
    for (const s of eggSp) s.visible = false;
    let mode = 0, grow = 0.35;
    const seed = hash(o.seed, 3) * TAU;
    return {
        obj: g,
        apply(e) {
            const b = e;
            mode = b.egg ? 2 : b.par || (b.prog ?? 0) > 0 ? 1 : 0;
            const bt = b.bt ?? (b.prog ? 90 : 0);
            grow = 0.4 + 0.6 * smooth(0, 1, clamp(bt / 240));
            eggWob.visible = mode === 2;
            formG.visible = mode === 1;
            for (const s of eggSp) s.visible = mode === 2;
            pool.visible = mode === 2;
            pink.visible = mode === 1;
        },
        update(_dt: number, t: number) {
            if (mode === 2) {
                const burst = Math.pow(Math.max(0, Math.sin(t * 1.15 + seed)), 4);
                eggWob.rotation.z = Math.sin(t * 9) * 0.05 * burst + Math.sin(t * 2.2) * 0.025;
                eggWob.rotation.x = Math.cos(t * 8.3) * 0.04 * burst;
                const sq = 1 + Math.sin(t * 3) * 0.012;
                eggG.scale.set(sq, 2 - sq, sq);
                for (let i = 0; i < eggSp.length; i++) {
                    const s = eggSp[i];
                    const k = (t * 0.45 + i * 0.33) % 1, a = i * 2.1 + t * 0.6;
                    s.position.set(Math.cos(a) * (0.3 + k * 0.14), 0.4 + k * 0.75, Math.sin(a) * (0.26 + k * 0.1));
                    s.scale.setScalar(Math.sin(k * Math.PI) * 1 + 0.05);
                    s.rotation.y = a;
                }
                pool.scale.setScalar(nightScale(1.5, t, 0.08, 2.4, seed, 0.3));
            } else if (mode === 1) {
                const s = 1.28 * grow * (1 + Math.sin(t * 2.4) * 0.03);
                ghostBase.scale.set(s, s, s);
                ghostBase.rotation.y = t * 0.4;
                for (let i = 0; i < hearts.length; i++) {
                    const h = hearts[i];
                    const k = (t * 0.28 + i * 0.5) % 1;
                    h.position.set((i ? 0.26 : -0.24) + Math.sin(t * 1.5 + i * 3) * 0.06, 0.62 + k * 0.5, i ? 0.1 : -0.08);
                    const sc = (Math.sin(k * Math.PI) * (0.95 + 0.12 * Math.sin(t * 6 + i)) + 0.05) * 1.6;
                    h.scale.setScalar(sc);
                    h.rotation.y = Math.sin(t * 1.1 + i * 2) * 0.5;
                }
                for (let i = 0; i < formGl.length; i++) {
                    const s2 = formGl[i];
                    const a = t * 0.8 + i * 3.1, k = breathe(t, 2.2, i * 2);
                    s2.position.set(Math.cos(a) * 0.42, 0.55 + bob(t, 0.08, 1.8, i) + i * 0.12, Math.sin(a) * 0.3);
                    s2.scale.setScalar(0.4 + k * 0.8);
                    s2.rotation.y = a;
                }
                pink.scale.setScalar(nightScale(1.1, t, 0.1, 2, seed, 0.3));
            }
        }
    };
}
