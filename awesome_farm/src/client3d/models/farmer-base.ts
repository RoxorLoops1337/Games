// The farmer's body shape, palette, springs, keyframe tracks and the farmer materials.
import * as THREE from 'three';
import { bake, Bld, clamp, lerp, MB, mix } from './kit';

export const PROFILE = [[0, 0.1], [0.2, 0.13], [0.33, 0.26], [0.355, 0.42], [0.3, 0.6], [0.17, 0.75], [0, 0.835]];
export const BR = 0.355;
export const BY = 0.47;
export const TOP = 0.835;
export const BOTTOM = 0.1;
export const FACE = { eyeY: 0.655, eyeX: 0.118, mouthY: 0.51, cheekY: 0.575, cheekX: 0.215 };
export const SCARF_Y = 0.37;
export const INK = 0x2a1d2c;
export const EYE_COL = 0x3a2433;
export const MOUTH_COL = 0x7a3a46;
export function radiusAt(y: number) {
    if (y <= PROFILE[0][1]) return 0;
    for (let i = 1; i < PROFILE.length; i++) {
        const [r1, y1] = PROFILE[i], [r0, y0] = PROFILE[i - 1];
        if (y <= y1) return lerp(r0, r1, (y - y0) / (y1 - y0));
    }
    return 0;
}
export function slopeAt(y: number) {
    const h = 0.03;
    return Math.atan((radiusAt(y - h) - radiusAt(y + h)) / (2 * h));
}
export function surfY(az: number, y: number, off = 0) {
    const e = slopeAt(y), r = radiusAt(y), ce = Math.cos(e);
    return { x: (r + off * ce) * Math.sin(az), y: y + off * Math.sin(e), z: (r + off * ce) * Math.cos(az), ry: az, rx: -e };
}
export const azAt = (x: number, y: number) => Math.asin(clamp(x / Math.max(0.05, radiusAt(y)), -1, 1));
export function rampAt(r: readonly number[], t2: number) {
    const k = clamp(t2) * (r.length - 1), i = Math.min(r.length - 2, Math.floor(k));
    return mix(r[i], r[i + 1], k - i);
}
export const ramp4 = (c: number) => [mix(c, INK, 0.38), c, mix(c, 0xffffff, 0.28), mix(c, 0xffffff, 0.55)];
export const lit = (y: number) => clamp(0.3 + (y - BOTTOM) / (TOP - BOTTOM) * 0.7);
export const CLOTH = [0x4d6b86, 0x6d8fae, 0x93b6d2, 0xbcd8ea];
export const LINEN = [0x7d8f6a, 0xa3b88a, 0xc5d6a8, 0xe4efca];
export const LEATHER = [0x5a3a26, 0x7e5236, 0xa06a42, 0xc48a58];
export const IRON = [0x585c7c, 0x7a7f9e, 0x9ea4bf, 0xc4c9dc, 0xe4e7f2];
export const STEEL = [0x5f7595, 0x8aa3c4, 0xbad0ea, 0xeaf4ff];
export const CRYSTAL = [0x3f3a8a, 0x6154c8, 0x8f80f0, 0xcfc4ff];
export const STONE = [0x5a5a52, 0x7f7f72, 0xa4a490, 0xcbcbb4];
export const VIOLET = [0x2c2150, 0x483a86, 0x6a58b8, 0x9a88e0];
export const SLIME = [0x358a52, 0x58b96f, 0x86e098, 0xc8ffd2];
export const WRAITH = [0x1e1a30, 0x362f58, 0x544b82, 0x7c72aa];
export const GOLD = [0xb8741a, 0xe0a020, 0xffd966, 0xfff3b0];
export const CANVAS = [0x2f6a78, 0x4a93a2, 0x72bccb, 0xa8e4ee];
export const WOODR = [0x4a2f2a, 0x6a432f, 0x8f5a36, 0xb87a46, 0xd89c60];
export const LEAFR = [0x2f6b4b, 0x3f8a4c, 0x5cb04f, 0x86cc5c, 0xb9e47c];
export const CYAN = 0x7af0ff;
/** A damped spring (stiffness k, damping c) for floppy bits: ears, scarves, hats. */
export class Spring {
    x = 0;
    v = 0;
    constructor(public k = 120, public c = 12) {}

    step(target: number, dt: number) {
        const n = dt > 0.02 ? Math.ceil(dt / 0.016) : 1, h = dt / n;
        for (let i = 0; i < n; i++) {
            this.v += (this.k * (target - this.x) - this.c * this.v) * h;
            this.x += this.v * h;
        }
        return this.x;
    }
    kick(v: number) {
        this.v += v;
    }
    set(x: number) {
        this.x = x;
        this.v = 0;
    }
}
export const approach = (dt: number, speed: number) => 1 - Math.exp(-dt * speed);
export const easeInOut = (t2: number) => {
    const u = clamp(t2);
    return u * u * (3 - 2 * u);
};
export const wrapAngle = (a: number) => {
    let x = a % (Math.PI * 2);
    if (x > Math.PI) x -= Math.PI * 2;
    else if (x < -Math.PI) x += Math.PI * 2;
    return x;
};
/** Ease through keyframes: `k` is [time, value, time, value, ...]. */
export function track(p: number, k: readonly number[]) {
    if (p <= k[0]) return k[1];
    const n = k.length;
    if (p >= k[n - 2]) return k[n - 1];
    for (let i = 2; i < n; i += 2) {
        if (p <= k[i]) {
            const t0 = k[i - 2], t1 = k[i], u = (p - t0) / (t1 - t0), e = u * u * (3 - 2 * u);
            return lerp(k[i - 1], k[i + 1], e);
        }
    }
    return k[n - 1];
}
export const FMAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0, emissive: new THREE.Color(0xffe6cc), emissiveIntensity: 0.36 });
FMAT.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n	totalEmissiveRadiance *= diffuseColor.rgb;');
};
FMAT.customProgramCacheKey = () => 'farmer-fill';
export const SMAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.4, metalness: 0.2, emissive: new THREE.Color(0xffd8b4), emissiveIntensity: 0.26 });
SMAT.onBeforeCompile = FMAT.onBeforeCompile;
SMAT.customProgramCacheKey = () => 'farmer-fill';
export function fbake(key: string, fn: (b: Bld, mb: MB) => void, cast = true) {
    const g = bake(key, (mb) => {
        const s = mb.custom('farmerShiny', SMAT, cast);
        mb.shiny = () => s;
        mb.metal = () => s;
        fn(mb.custom('farmer', FMAT, cast), mb);
    });
    g.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh && (m.material === FMAT || m.material === SMAT)) m.receiveShadow = true;
    });
    return g;
}
export const CMAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, emissive: new THREE.Color(0xffd8b4), emissiveIntensity: 0.3 });
CMAT.onBeforeCompile = FMAT.onBeforeCompile;
CMAT.customProgramCacheKey = () => 'farmer-fill-d';
export function bakeCloth(key: string, fn: (b: Bld) => void) {
    const g = bake(key, (mb) => fn(mb.custom('farmerCloth', CMAT, true)));
    g.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) m.receiveShadow = true;
    });
    return g;
}
