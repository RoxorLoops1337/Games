// The fountain, with its jets, drops and ripples.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { bakeH, lift, tone } from './b-home-util';
import { RAMP } from './data';
import { Bld, type BOpts, byHeight, clamp, type ColorFn, hash, M, MB, mix, type Model, type Pt, seedRand, TAU } from './kit';

export const ST = RAMP.stone;
export const LF = RAMP.leaf;
export const N = 14;
export const WATER_Y = 0.27;
export const BOWL_Y = 1.08;
export const WATER = M(0xffffff, { vc: true, t: 0.8, r: 0.12, m: 0.2, e: 0.25, ec: 0x74cce0 });
export const DROP = new THREE.MeshStandardMaterial({ color: 0xeafcff, emissive: 0xbfeaf5, emissiveIntensity: 0.6, flatShading: true, roughness: 0.3, transparent: true, opacity: 0.92 });
export const SPARK = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.2, flatShading: true });
export const RIPPLE = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0, depthWrite: false }));
export let ringGeo: THREE.RingGeometry | null = null;
export let dropGeo: THREE.OctahedronGeometry | null = null;
export let sparkGeo: THREE.OctahedronGeometry | null = null;
export function fountainStatic(mb: MB) {
    const b = mb.main;
    const wall = (x: number, y: number, z: number) => {
        const k = Math.floor((Math.atan2(z, x) + Math.PI) / TAU * N);
        const base = tone([ST[2], ST[3], ST[2], ST[1], ST[3]], k, 1);
        const moss = y < 0.2 && hash(k * 3.3, 1.7) < 0.32;
        return lift(moss ? mix(base, LF[2], 0.5) : mix(base, ST[1], clamp(0.35 - y)), 1.35);
    };
    b.lathe([[0.8, 0], [0.92, 0.12], [0.95, 0.3], [0.95, 0.34], [0.8, 0.34], [0.76, 0.1], [0, 0.1]], N, (x: number, y: number, z: number) => y > 0.33 ? lift(tone([ST[3], ST[2], ST[3], ST[4]], Math.floor((Math.atan2(z, x) + Math.PI) / TAU * N), 2), 1) : y < 0.12 && Math.hypot(x, z) < 0.78 ? ST[1] : wall(x, y, z), { v: 0.06, ao: false });
    const col = (x: number, y: number, z: number) => lift(mix(byHeight(ST, 0.1, 1.2, 0.35, 4)(x, y, z), ST[3], 0.15), 1.25);
    b.lathe([[0.3, 0.1], [0.3, 0.3], [0.2, 0.36], [0.15, 0.42], [0.15, 0.82], [0.2, 0.88], [0.36, 1], [0.4, 1.1], [0.34, 1.1], [0, 1]], 10, col, { v: 0.05, ao: false });
    b.cone(0.05, 0.18, 6, ST[4], { y: 1.18, ao: false });
    b.oct(0.05, 0xe8fbff, { y: 1.31, sy: 1.2, ao: false });
    const w = mb.custom('water', WATER, false);
    const shade = (x: number, _y: number, z: number) => mix(0x2f8fb8, 0x9ae0ee, clamp(1 - Math.hypot(x, z) / 0.8 + hash(Math.round(x * 6), Math.round(z * 6)) * 0.35));
    for (let k = 0; k < N; k++) {
        const a0 = k / N * TAU, a1 = (k + 1) / N * TAU, r = 0.78;
        const p = (rr: number, a: number) => [Math.cos(a) * rr, WATER_Y, Math.sin(a) * rr];
        pushTri(w, [0, WATER_Y, 0], p(r, a1), p(r, a0), shade);
        const q = (rr: number, a: number) => [Math.cos(a) * rr, BOWL_Y, Math.sin(a) * rr];
        pushTri(w, [0, BOWL_Y, 0], q(0.33, a1), q(0.33, a0), shade);
    }
    const g = mb.glow(0xffffff, 1.6);
    const R = seedRand(21);
    for (let i = 0; i < 9; i++) {
        const a = R() * TAU, r = 0.3 + R() * 0.07;
        g.oct(0.034, 0xffffff, { x: Math.cos(a) * r, y: WATER_Y + 0.012, z: Math.sin(a) * r, sy: 0.5, ry: R() * 3, ao: false, v: 0.02 });
    }
    for (const [x, z] of [[0.52, 0.2], [-0.5, 0.3], [0.1, -0.6]]) b.oct(0.1, LF[2], { x, y: WATER_Y + 0.006, z, sy: 0.08, ry: x * 5, ao: false, j: 0.01 });
}
export function pushTri(b: Bld, p: Pt, q: Pt, r: Pt, col: ColorFn) {
    const c = new THREE.Color().setHex(col((p[0] + q[0] + r[0]) / 3, p[1], (p[2] + q[2] + r[2]) / 3));
    b.pos.push(...p, ...q, ...r);
    for (let i = 0; i < 3; i++) b.col.push(c.r, c.g, c.b);
}
export const JETS = 6;
export const PER = 6;
export function fountainModel(o: BOpts): Model<BuildE> {
    const seed = Math.abs(o.seed);
    const obj = new THREE.Group();
    obj.add(bakeH('fountain', fountainStatic, 31));
    if (!ringGeo) ringGeo = new THREE.RingGeometry(0.86, 1, 28).rotateX(-Math.PI / 2);
    if (!dropGeo) dropGeo = new THREE.OctahedronGeometry(0.04, 0).scale(1, 1.5, 1);
    if (!sparkGeo) sparkGeo = new THREE.OctahedronGeometry(0.035, 0);
    const rings = RIPPLE.map((m) => {
        const r = new THREE.Mesh(ringGeo!, m);
        r.position.y = WATER_Y + 0.01;
        r.renderOrder = 3;
        obj.add(r);
        return r;
    });
    const n = JETS * PER + 4;
    const drops = new THREE.InstancedMesh(dropGeo!, DROP, n);
    drops.frustumCulled = false;
    drops.castShadow = false;
    drops.receiveShadow = false;
    obj.add(drops);
    const sparks = new THREE.InstancedMesh(sparkGeo!, SPARK, 10);
    sparks.frustumCulled = false;
    sparks.castShadow = false;
    sparks.receiveShadow = false;
    obj.add(sparks);
    const R = seedRand(seed + 77);
    const sp = Array.from({ length: 10 }, () => {
        const a = R() * TAU, r = 0.35 + R() * 0.38;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, ph: R() * TAU };
    });
    const d = new THREE.Object3D();
    const ph = hash(seed, 5) * 3;
    return {
        obj,
        update(_dt: number, t: number) {
            let i = 0;
            for (let j = 0; j < JETS; j++) {
                const a = j / JETS * TAU + 0.3;
                const ca = Math.cos(a), sa = Math.sin(a);
                for (let k = 0; k < PER; k++) {
                    const u = (t * 0.5 + ph + k / PER + j * 0.031) % 1;
                    const r = 0.14 + 0.5 * u;
                    const y = BOWL_Y + 0.04 + (WATER_Y - BOWL_Y - 0.04) * u * u + 0.62 * u * (1 - u) * 1.9 * (1 - u * 0.15);
                    const s = u > 0.94 ? (1 - u) / 0.06 : 0.75 + 0.35 * Math.sin(u * 3.1);
                    d.position.set(ca * r, y, sa * r);
                    d.rotation.set(0, a, (0.5 - u) * 1.1 * (ca > 0 ? 1 : 1));
                    d.scale.setScalar(Math.max(0.01, s));
                    d.updateMatrix();
                    drops.setMatrixAt(i++, d.matrix);
                }
            }
            for (let k = 0; k < 4; k++) {
                const u = (t * 0.7 + ph + k / 4) % 1;
                d.position.set(Math.sin(u * 9 + k) * 0.03 * u, 1.3 + 0.28 * Math.sin(u * Math.PI), Math.cos(u * 9 + k) * 0.03 * u);
                d.rotation.set(0, 0, 0);
                d.scale.setScalar(Math.max(0.01, 0.9 * Math.sin(u * Math.PI)));
                d.updateMatrix();
                drops.setMatrixAt(i++, d.matrix);
            }
            drops.instanceMatrix.needsUpdate = true;
            for (let k = 0; k < 10; k++) {
                const s = sp[k], tw = Math.max(0, Math.sin(t * 2.6 + s.ph)), v = tw * tw * tw;
                d.position.set(s.x, WATER_Y + 0.025, s.z);
                d.rotation.set(0, t + s.ph, 0);
                d.scale.setScalar(0.05 + v * 1.2);
                d.updateMatrix();
                sparks.setMatrixAt(k, d.matrix);
            }
            sparks.instanceMatrix.needsUpdate = true;
            for (let k = 0; k < 3; k++) {
                const u = (t * 0.33 + k / 3) % 1;
                rings[k].scale.setScalar(0.28 + 0.52 * u);
                RIPPLE[k].opacity = 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * 0.5);
            }
            WATER.opacity = 0.78 + 0.05 * Math.sin(t * 1.3);
            WATER.emissiveIntensity = 0.22 + 0.1 * Math.sin(t * 2.1 + 1);
        },
        dispose() {
            drops.dispose();
            sparks.dispose();
        }
    };
}
