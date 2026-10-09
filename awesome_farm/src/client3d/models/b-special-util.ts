// Shared helpers for special buildings: soft halos, night scaling, glints and per-model glow.
import * as THREE from 'three';
import { bake, env, mix, TAU } from './kit';

export const FACE = -Math.PI / 3;
export const haloGeos = new Map<string, THREE.BufferGeometry>();
export function haloGeo(flat: boolean) {
    const key = flat ? 'flat' : 'face';
    let g = haloGeos.get(key);
    if (g) return g;
    const seg = 10, pos: number[] = [], col: number[] = [];
    const rings = [[0, 1], [0.5, 0.3], [1, 0]];
    const vtx = (ri: number, k: number) => {
        const [r, v] = rings[ri], a = k / seg * TAU;
        return { p: [Math.cos(a) * r, Math.sin(a) * r, 0], v };
    };
    const push = (a: { p: number[]; v: number }) => {
        pos.push(...a.p);
        col.push(a.v, a.v, a.v);
    };
    for (let k = 0; k < seg; k++) {
        push(vtx(0, 0));
        push(vtx(1, k));
        push(vtx(1, k + 1));
    }
    for (let ri = 1; ri < rings.length - 1; ri++) {
        for (let k = 0; k < seg; k++) {
            const a = vtx(ri, k), b = vtx(ri, k + 1), c = vtx(ri + 1, k), d = vtx(ri + 1, k + 1);
            push(a);
            push(c);
            push(d);
            push(a);
            push(d);
            push(b);
        }
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.rotateX(flat ? -Math.PI / 2 : FACE);
    g.userData.shared = true;
    haloGeos.set(key, g);
    return g;
}
export const haloMats = new Map<number, THREE.MeshBasicMaterial>();
export function haloMat(color: number) {
    let m = haloMats.get(color);
    if (!m) {
        m = new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85 });
        haloMats.set(color, m);
    }
    return m;
}
export function halo(color: number, radius: number, flat = false, y = flat ? 0.03 : 0) {
    const m = new THREE.Mesh(haloGeo(flat), haloMat(color));
    m.scale.setScalar(radius);
    m.position.y = y;
    m.renderOrder = 3;
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
}
export const nightScale = (r: number, t: number, pulse = 0.06, sp = 2, ph = 0, day = 0.4) => r * (day + (1 - day) * env.night) * (1 + pulse * Math.sin(t * sp + ph));
export function glint(color = 0xffe680, e = 2.8) {
    return bake(`glint|${color}|${e}`, (mb) => {
        const g = mb.glow(color, e);
        g.oct(0.07, color, { sx: 0.3, sy: 1.8, sz: 0.3, ao: false, v: 0 });
        g.oct(0.07, color, { sx: 1.8, sy: 0.3, sz: 0.3, ao: false, v: 0 });
    });
}
export function glints(parent: THREE.Object3D, n: number, color = 0xffe680, e = 2.8) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const g = glint(color, e);
        parent.add(g);
        out.push(g);
    }
    return out;
}
/** Give a model its own copies of its glowing materials, so its glow can be dimmed or brightened alone. */
export function ownGlow(root: THREE.Object3D) {
    const mats: THREE.MeshStandardMaterial[] = [], base: number[] = [];
    root.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.emissiveIntensity > 0 && mat.emissive && mat.emissive.getHex() !== 0) {
            const cl = mat.clone();
            m.material = cl;
            mats.push(cl);
            base.push(mat.emissiveIntensity);
        }
    });
    return {
        mats,
        base,
        set(k: number) {

            for (let i = 0; i < mats.length; i++) mats[i].emissiveIntensity = base[i] * k;
        },
        dispose() {
            for (const m of mats) m.dispose();
            mats.length = 0;
        }
    };
}
export function flag(key: string, color: number, stripe: number, len: number, h: number, n = 3, taper = 0.12, lift = 0) {
    const root = new THREE.Group();
    const segs: THREE.Group[] = [];
    const w = len / n;
    let parent = root;
    for (let i = 0; i < n; i++) {
        const g = bake(`flag|${key}|${color}|${stripe}|${len}|${h}|${n}|${i}|${lift}`, (mb) => {
            const h0 = h * (1 - taper * i / n) / 2, h1 = h * (1 - taper * (i + 1) / n) / 2, th = 0.012;
            const c = i % 2 ? stripe : color;
            (lift > 0 ? mb.glow(mix(color, stripe, 0.5), lift) : mb.main).hull([[0, -h0, -th], [0, h0, -th], [w, -h1, -th], [w, h1, -th], [0, -h0, th], [0, h0, th], [w, -h1, th], [w, h1, th]], c, { v: 0.05, ao: false });
        });
        const pv = new THREE.Group();
        pv.position.x = i === 0 ? 0 : w;
        pv.add(g);
        parent.add(pv);
        segs.push(pv);
        parent = pv;
    }
    return {
        root,
        wave(t: number, amp = 0.32, sp = 3.1) {
            const a = amp * (0.55 + env.wind * 0.9);
            for (let i = 0; i < n; i++) segs[i].rotation.y = Math.sin(t * sp * (0.7 + env.wind * 0.5) - i * 1.05) * a * (0.55 + 0.45 * (i + 1) / n);
        }
    };
}
export const breathe = (t: number, sp = 1, ph = 0) => 0.5 + 0.5 * Math.sin(t * sp + ph);
export const bob = (t: number, amp: number, sp = 1.6, ph = 0) => Math.sin(t * sp + ph) * amp;
