// The monster rig wrapper (facing, stun, hurt flash, elite crown and aura) and shared monster parts (eyes, sheets, shading).
import * as THREE from 'three';
import type { Ent } from '../../shared/sim/types';
import { type AtkPose, PATTERN_POSES, restPose } from './mobs-attack';
import { bake, Bld, clamp, type Col, type ColorFn, flashMeshes, hash3, meshesOf, mix, pick, TAU, type Xf } from './kit';

/** What the rig hands a monster's `anim` every frame: clocks, walk blend and phase, wind-up, act, stun, boss phase, rage, health. */
export interface AnimCtx {
    t: number; dt: number; moving: boolean; walk: number; ph: number; wind: number; act: number;
    stun: number; phase: number; rage: number; hpf: number; st: number;
}
/** A monster as its builder makes it: the root object, head height and radius (for the crown, stars and aura), accent colour and its animation. */
export interface MobRig { root: THREE.Object3D; head: number; rad: number; accent: number; anim(c: AnimCtx): void }
/** Eye options: colour, vertical stretch, flatness, tilt, highlight on or off, pushed out of the surface. */
export interface EyeOpts { color?: number; sy?: number; flat?: number; rx?: number; hl?: boolean; out?: number }
/** An ellipsoid head or body (centre and radii) that eyes and mouths sit on. */
export interface Ell { cx?: number; cy: number; cz?: number; rx: number; ry: number; rz: number }

export const EYE = 0x3a2433;
export const INK = 0x2a1d2c;
export const PAL_WHITE = 0xfffbf4;
export const sin = Math.sin;
export const cos = Math.cos;
export const PI = Math.PI;
export function keys(v: number, k: number[][]) {
    if (v <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
        if (v <= k[i][0]) {
            const a = k[i - 1], b = k[i], t = (v - a[0]) / (b[0] - a[0]);
            const s = t * t * (3 - 2 * t);
            return a[1] + (b[1] - a[1]) * s;
        }
    }
    return k[k.length - 1][1];
}
export const frac = (v: number) => v - Math.floor(v);
export function eye(b: Bld, x: number, y: number, z: number, r: number, o: EyeOpts = {}) {
    const sy = o.sy ?? 1.15, flat = o.flat ?? 0.6, rx = o.rx ?? 0;
    b.ico(r, 0, o.color ?? EYE, { x, y, z, sy, sz: flat, rx, v: 0.02, ao: false });
    if (o.hl !== false) {
        const hy = r * 0.36 * sy, hz = r * 0.56 * flat * 1.1;
        b.oct(r * 0.3, 0xffffff, { x: x - r * 0.3, y: y + hy * Math.cos(rx) - hz * Math.sin(rx), z: z + hz * Math.cos(rx) + hy * Math.sin(rx), rx, v: 0, ao: false, j: 0 });
    }
}
export function goofyEye(b: Bld, x: number, y: number, z: number, r: number, look = 0.25, o: { rx?: number; sy?: number } = {}) {
    const rx = o.rx ?? 0, sy = o.sy ?? 1.1;
    const at = (dx: number, dy: number, dz: number) => ({ x: x + dx, y: y + dy * Math.cos(rx) - dz * Math.sin(rx), z: z + dz * Math.cos(rx) + dy * Math.sin(rx) });
    b.ico(r, 0, PAL_WHITE, { x, y, z, sy, sz: 0.62, rx, v: 0.02, ao: false });
    b.ico(r * 0.6, 0, EYE, { ...at(r * look, -r * 0.05, r * 0.46), sy: 1.2, sz: 0.5, rx, v: 0.02, ao: false });
    b.oct(r * 0.2, 0xffffff, { ...at(r * look - r * 0.15, r * 0.25, r * 0.66), rx, v: 0, ao: false, j: 0 });
}
export const RING_GEO = new THREE.RingGeometry(0.8, 1, 20).rotateX(-Math.PI / 2);
export const DISC_GEO = new THREE.CircleGeometry(0.8, 10).rotateX(-Math.PI / 2);
export const auraMats = new Map();
export function auraMat(color: number, opacity: number) {
    const key = `${color}|${opacity}`;
    let m = auraMats.get(key);
    if (!m) {
        m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        auraMats.set(key, m);
    }
    return m;
}
export function makeCrown() {
    return bake('mob.crown', (mb) => {
        const G = [0xb8741a, 0xe0a020, 0xffd966, 0xfff3b0];
        const col = (_x: number, y: number) => G[Math.max(1, Math.min(3, Math.round((y + 0.02) * 24)))];
        const s = mb.shiny();
        s.cyl(0.115, 0.125, 0.07, 5, col, { y: 0.035, v: 0.04, ao: false });
        for (let i = 0; i < 3; i++) {
            const a = i / 3 * TAU + 0.4;
            s.cone(0.05, 0.14, 3, G[2], { x: Math.cos(a) * 0.1, y: 0.13, z: Math.sin(a) * 0.1, ao: false, v: 0.03 });
        }
        mb.glow(0xe85d62, 1.8).tet(0.04, 0xf59a96, { y: 0.05, z: 0.125, ao: false, v: 0.03 });
    });
}
export function makeStar() {
    return bake('mob.star', (mb) => {
        mb.glow(0xf0a820, 1.6).tet(0.1, 0xffd24a, { ao: false, v: 0, j: 0 });
    });
}
export function haloFor(rad: number) {
    return Math.max(0.5, rad * 1.3);
}
export function wrapRig(rig: MobRig, o: { elite: boolean; seed: number }) {
    const obj = new THREE.Group();
    const body = new THREE.Group();
    // a boss's attack moves the whole body (mobs-attack.ts): lifted, leant, turned and squashed by `atk`, over its own rig's poses
    const atk = new THREE.Group();
    body.add(rig.root);
    atk.add(body);
    obj.add(atk);
    let pat: string | undefined, patT = 0, atkW = 0;
    const ap: AtkPose = restPose({ y: 0, rx: 0, ry: 0, rz: 0, sy: 1 });
    const parts = meshesOf(rig.root).filter((m) => !m.userData.noFlash);
    const size = o.elite ? 1.15 : 1;
    body.scale.setScalar(size);
    const c = { t: o.seed * 0.713 % 9 + 0.5, dt: 0.016, moving: false, walk: 0, ph: o.seed * 0.377 % 3, wind: 0, act: 0, stun: 0, phase: 0, rage: 0, hpf: 1, st: 0 };
    let st = 0, phase = 0, stunned = false, hpf = 1;
    let cur = 0, first = true, flashed = false;
    let crown = null, ring = null, disc = null;
    const crownY = rig.head * size + 0.2, auraR = haloFor(rig.rad) * size;
    if (o.elite) {
        crown = makeCrown();
        crown.position.y = crownY;
        obj.add(crown);
        const ac = mix(rig.accent, 0xffa030, 0.45);
        ring = new THREE.Mesh(RING_GEO, auraMat(ac, 0.5));
        ring.position.y = 0.03;
        ring.scale.setScalar(auraR);
        ring.renderOrder = 2;
        disc = new THREE.Mesh(DISC_GEO, auraMat(ac, 0.14));
        disc.position.y = 0.028;
        disc.scale.setScalar(auraR);
        disc.renderOrder = 2;
        obj.add(ring, disc);
    }
    let stars: THREE.Group | null = null;
    const makeStars = () => {
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) {
            const s = makeStar();
            const a = i / 3 * TAU;
            s.position.set(Math.cos(a), Math.sin(i * 2.1) * 0.05, Math.sin(a));
            g.add(s);
        }
        g.visible = false;
        g.position.y = rig.head * size + 0.05;
        obj.add(g);
        return g;
    };
    const starR = Math.max(0.22, rig.rad * 0.8) * size;
    const ease = (cur2: number, target: number, rate: number, dt: number) => cur2 + (target - cur2) * (1 - Math.exp(-dt * rate));
    return {
        obj,
        apply(e: Ent) {
            if (e.k !== 'mob') return;
            st = e.st ?? 0;
            phase = e.ph ?? 0;
            stunned = st === 3 || (e.stun ?? 0) > 0;
            hpf = e.mhp > 0 ? clamp(e.hp / e.mhp) : 1;
            // the pattern's own clock runs here between ticks, and snaps to the sim's when they drift apart
            if (e.pat !== pat) { pat = e.pat; patT = e.pat ? e.pt ?? 0 : 0; }
            else if (pat && typeof e.pt === 'number' && Math.abs(e.pt - patT) > 0.25) patT = e.pt;
        },
        pose(face: number, moving: boolean, hurt: number, dt: number) {
            if (!(dt > 0)) dt = 0.016;
            dt = Math.min(dt, 0.1);
            c.dt = dt;
            c.t += dt;
            c.moving = moving;
            c.st = st;
            c.phase = phase;
            c.hpf = hpf;
            c.walk = ease(c.walk, moving ? 1 : 0, 9, dt);
            c.ph += dt * c.walk;
            c.wind = ease(c.wind, st === 1 ? 1 : 0, 12, dt);
            c.act = ease(c.act, st === 2 ? 1 : 0, 14, dt);
            c.stun = ease(c.stun, stunned ? 1 : 0, 10, dt);
            c.rage = ease(c.rage, clamp(phase / 3), 2, dt);
            if (first) {
                cur = face;
                first = false;
            }
            let d = (face - cur) % TAU;
            if (d > Math.PI) d -= TAU;
            else if (d < -Math.PI) d += TAU;
            cur += d * (1 - Math.exp(-dt * 14));
            obj.rotation.y = cur;
            rig.anim(c);
            if (pat) patT += dt;
            atkW = ease(atkW, pat ? 1 : 0, pat ? 30 : 8, dt);
            const pose = pat ? (PATTERN_POSES as Record<string, ((u: number, o: AtkPose) => void) | undefined>)[pat] : undefined;
            if (pose) { restPose(ap); pose(patT, ap); }
            const k = atkW;
            atk.position.y = ap.y * k;
            atk.rotation.set(ap.rx * k, ap.ry * k, ap.rz * k);
            const sy = 1 + (ap.sy - 1) * k, sxz = 1 + (1 - sy) * 0.5;
            atk.scale.set(sxz, sy, sxz);
            const r = rig.root;
            r.rotation.z = c.stun > 0.01 ? Math.sin(c.t * 4.6) * 0.2 * c.stun : 0;
            r.rotation.x = c.stun > 0.01 ? Math.sin(c.t * 3.3 + 1) * 0.1 * c.stun : 0;
            const p = 1 + hurt * 0.06;
            r.scale.set(p, 1 - hurt * 0.05, p);
            const on = hurt > 0.15;
            if (on !== flashed) {
                flashMeshes(parts, on);
                flashed = on;
            }
            if (c.stun > 0.02) {
                if (!stars) stars = makeStars();
                stars.visible = true;
                stars.rotation.y = c.t * 3.2;
                const k = starR * c.stun;
                stars.scale.set(k, 1, k);
                stars.position.y = rig.head * size + 0.05 + Math.sin(c.t * 5) * 0.025;
            } else if (stars) stars.visible = false;
            if (crown) {
                crown.position.y = crownY + Math.sin(c.t * 2.3) * 0.035;
                crown.rotation.y = c.t * 1.1;
            }
            if (ring && disc) {
                const k = auraR * (1 + 0.07 * Math.sin(c.t * 2.6));
                ring.scale.setScalar(k);
                disc.scale.setScalar(auraR * (0.96 + 0.05 * Math.sin(c.t * 2.6 + 1)));
            }
        }
    };
}
export const ramp4 = (c: number) => [mix(c, INK, 0.4), c, mix(c, 0xffffff, 0.26), mix(c, 0xffffff, 0.52)];
export function sheet(b: Bld, tris: number[][][], color: Col, t: Xf = {}) {
    const p: number[] = [];
    for (const [a, c, d] of tris) {
        p.push(...a, ...c, ...d);
        p.push(...a, ...d, ...c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return b.add(g, color, { ao: false, ...t });
}
export const shade = (ramp: readonly number[], y0: number, y1: number, n = 0.4, seed = 0, lean = 0.07, fill = 0.45): ColorFn => (x, y, z) =>
 pick(ramp, clamp((y - y0) / (y1 - y0) + (-x - z) * lean + z * fill + (hash3(x * 9.1 + seed, y * 9.1, z * 9.1) - 0.5) * n));
export let rageM: THREE.MeshBasicMaterial | null = null;
export const rageMat = () => rageM ?? (rageM = new THREE.MeshBasicMaterial({ color: 0xe85d62, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }));
export function makeRageRing(radius: number) {
    const m = new THREE.Mesh(RING_GEO, rageMat());
    m.scale.setScalar(radius);
    m.position.y = 0.035;
    m.renderOrder = 2;
    m.visible = false;
    m.userData.noFlash = true;
    return m;
}
export function onEll(e: Ell, x: number, y: number) {
    const dx = (x - (e.cx ?? 0)) / e.rx, dy = (y - e.cy) / e.ry;
    const q = Math.max(0.0001, 1 - dx * dx - dy * dy), s = Math.sqrt(q);
    return { z: (e.cz ?? 0) + e.rz * s, rx: -Math.atan2(dy / e.ry, s / e.rz) };
}
export function eyeOn(b: Bld, e: Ell, x: number, y: number, r: number, o: EyeOpts = {}) {

    const p = onEll(e, x, y);
    eye(b, x, y, p.z - r * 0.2 + (o.out ?? 0), r, { ...o, rx: p.rx });
}
