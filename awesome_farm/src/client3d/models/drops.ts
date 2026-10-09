// The dropped item model: bob, turn, glint, rarity halo, sparkles and the pop when it lands.
import * as THREE from 'three';
import { ARMOR } from './drops-armor';
import { FOODS } from './drops-food';
import { GEAR } from './drops-gear';
import { MATS } from './drops-mat';
import { MISC } from './drops-misc';
import { lerp, MB, type Model, TAU } from './kit';
import type { DropE } from '../../shared/sim/types';
import { itemDef } from './data';
import { dbake, type DropSpec, R, SCALE, spike, strHash } from './drops-shapes';

export const COIN: DropSpec = {
    turn: 'fast',
    cy: 0.45,
    size: 1,
    lean: 0.55,
    flash: true,
    build(mb: MB) {
        const b = mb.shiny(), G = R.gold, rx = Math.PI / 2;
        b.cyl(0.44, 0.44, 0.13, 10, G[1], { y: 0.45, rx, j: 0.004, v: 0.05 });
        b.cyl(0.36, 0.36, 0.16, 10, G[2], { y: 0.45, rx, ry: 0.2, j: 0.004, v: 0.04, ao: false });
        mb.glow(0xffd966, 1).cyl(0.2, 0.2, 0.19, 6, G[2], { y: 0.45, rx, j: 0.003, v: 0.05, ao: false });
    }
};
export const SPECS: Record<string, DropSpec | undefined> = { coin: COIN, ...MATS, ...FOODS, ...GEAR, ...ARMOR, ...MISC };
export const DROP_MODEL_KINDS = Object.keys(SPECS);
export function fallback(item: string): DropSpec {
    const rar = itemDef(item)?.rarity ?? 0;
    const c = [0xd5d9e6, 0x92d364, 0x4ab2cf, 0x9d6fdb, 0xffd966][rar] ?? 0xd5d9e6;
    return { build(mb: MB) {
        spike(mb.glow(c, 1.2), 0.9, 0.3, c, {}, 5);
    } };
}
export let haloTex: THREE.DataTexture | null = null;
export let haloGeo: THREE.PlaneGeometry | null = null;
export const haloMats = new Map();
export function haloMesh(color: number) {
    if (!haloTex) {
        const n = 32, d = new Uint8Array(n * n * 4);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            const r = Math.hypot((x + 0.5) / n * 2 - 1, (y + 0.5) / n * 2 - 1), a = Math.max(0, 1 - r), i = (y * n + x) * 4;
            d[i] = d[i + 1] = d[i + 2] = 255;
            d[i + 3] = Math.round(255 * a * a);
        }
        haloTex = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
        haloTex.magFilter = haloTex.minFilter = THREE.LinearFilter;
        haloTex.needsUpdate = true;
        haloGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    }
    let m = haloMats.get(color);
    if (!m) {
        m = new THREE.MeshBasicMaterial({ color, map: haloTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
        haloMats.set(color, m);
    }
    const h = new THREE.Mesh(haloGeo!, m);
    h.position.y = 0.03;
    h.renderOrder = 2;
    h.raycast = () => {
    };
    return h;
}
export const RARITY_GLOW = [0, 0, 0, 0xb07aff, 0xffc040];
export const sparkStar = (c: number) => dbake(`drop.spark|${c}`, (mb: MB) => {
    mb.glow(c, 1.8).oct(0.045, c, { sx: 0.5, sz: 0.5, sy: 1.7, ao: false, v: 0 });
});
export function dropModel(item: string): Model<DropE> {
    const spec = SPECS[item] ?? fallback(item);
    const S = SCALE * (spec.size ?? 1), cy = spec.cy ?? 0.5, ph = strHash(item) * TAU;
    const turn = spec.turn ?? 'spin';
    const root = new THREE.Group(), hov = new THREE.Group(), tilt = new THREE.Group();
    const body = dbake(`drop|${item}`, spec.build, Math.floor(strHash(item + '#') * 997));
    body.scale.setScalar(S);
    body.position.y = -cy * S;
    tilt.position.y = cy * S;
    tilt.rotation.order = 'XZY';
    tilt.rotation.set(-(spec.lean ?? 0), 0, -(spec.diag ?? 0));
    root.add(hov);
    hov.add(tilt);
    tilt.add(body);
    let flash = null;
    if (spec.flash) {
        flash = sparkStar(0xfff3b0);
        root.add(flash);
        flash.scale.setScalar(0.001);
    }
    const rarity = itemDef(item)?.rarity ?? 0;
    const halo = rarity >= 3 ? haloMesh(RARITY_GLOW[rarity] || 0xb07aff) : null;
    if (halo) root.add(halo);
    const stars: { g: THREE.Group; a: number; h: number; p: number; }[] = [];
    if (spec.spark) {
        const n = 2;
        for (let i = 0; i < n; i++) {
            const g = sparkStar(spec.spark);
            hov.add(g);
            stars.push({ g, a: i / n * TAU, h: 0.12 + i * 0.1, p: i * 2.1 });
        }
    }
    let pending = -1, ageBase = -1, ageT = 0, popped = true;
    hov.position.y = 0.16;
    return {
        obj: root,
        update(_dt: number, t: number) {
            hov.position.y = 0.16 + 0.04 * Math.sin(t * 2.4 + ph);
            if (halo) halo.scale.setScalar(0.5 * (1 + 0.1 * Math.sin(t * 2.4 + ph)));
            hov.rotation.y = turn === 'sway' ? Math.sin(t * 0.85 + ph) * 0.75 : turn === 'fast' ? t * 4.6 + ph : t * 0.75 + ph;
            if (flash) {
                const f = Math.max(0, Math.cos(hov.rotation.y) - 0.9) / 0.1;
                flash.scale.setScalar(0.001 + 1.6 * f * f);
                flash.position.set(0.1, hov.position.y + 0.24, 0.07);
                flash.rotation.z = f * 0.6;
            }
            if (pending >= 0) {
                ageBase = pending;
                ageT = t;
                pending = -1;
                if (ageBase >= 0.3) {
                    if (!popped) hov.scale.setScalar(1);
                    popped = true;
                } else popped = false;
            }
            if (!popped) {
                const a = ageBase + (t - ageT);
                if (a >= 0.25) {
                    hov.scale.setScalar(1);
                    popped = true;
                } else if (a < 0.15) {
                    const u = a / 0.15, e = 1 - (1 - u) * (1 - u) * (1 - u);
                    hov.scale.setScalar(Math.max(0.001, 1.15 * e));
                } else hov.scale.setScalar(lerp(1.15, 1, (a - 0.15) / 0.1));
            }
            if (spec.pulse) {
                const u = (t / 1.25 + ph) % 1, k = Math.exp(-(((u - 0.06) / 0.06) ** 2)) + 0.7 * Math.exp(-(((u - 0.3) / 0.07) ** 2));
                tilt.scale.setScalar(1 + 0.09 * k);
            }
            for (let i = 0; i < stars.length; i++) {
                const s = stars[i], a = s.a + t * 0.9 + ph, k = 0.5 + 0.5 * Math.sin(t * 3.3 + s.p);
                s.g.position.set(Math.cos(a) * 0.2, s.h + 0.05 * Math.sin(t * 1.7 + s.p), Math.sin(a) * 0.2);
                s.g.scale.setScalar(0.2 + k * 0.9);
                s.g.rotation.set(0, t * 2 + s.p, Math.sin(t * 1.3 + s.p) * 0.7);
            }
        },
        apply(e: DropE) {
            const d = e;
            if (typeof d.age === 'number') pending = d.age;
        }
    };
}
