// What monsters shoot: one model per projectile kind (`PROJ` in shared/data/mobs.ts), flying nose first along its velocity with a
// soft shadow under it, each with its own motion (an arrow's wobble, a rock's tumble, a frost shard's roll, a fireball's flicker).
import * as THREE from 'three';
import type { ProjKind } from '../../shared/data/mobs';
import type { ProjE } from '../../shared/sim/types';
import { bake, clamp, flicker, type MB, mix, type Model, TAU } from './kit';
import { RAMP } from './data';

/** How each kind is built (nose towards +z, centred on the origin) and how it moves in flight. */
interface ShotSpec { build (mb: MB): void; motion: 'none' | 'wobble' | 'tumble' | 'roll' | 'pulse' | 'flicker' | 'jitter'; size?: number }

export const SHOTS: Record<ProjKind, ShotSpec> = {
    arrow: {
        motion: 'wobble',
        build (mb) {
            const b = mb.main;
            b.rod([0, 0, -0.3], [0, 0, 0.24], 0.018, 4, RAMP.wood[3], 0.018, { ao: false, v: 0.03 });
            mb.shiny().cone(0.05, 0.13, 4, RAMP.steel[3], { z: 0.29, rx: Math.PI / 2, ao: false, v: 0.04 });
            for (const a of [0, TAU / 3, 2 * TAU / 3]) b.hull([[0, 0, -0.3], [0, 0, -0.16], [Math.cos(a) * 0.07, Math.sin(a) * 0.07, -0.32]], a ? 0xfff6e0 : 0xe85d62, { ao: false, v: 0.03 });
        },
    },
    orb: {
        motion: 'pulse',
        build (mb) {
            mb.glow(0x9ad8f0, 2.2).ico(0.13, 1, 0xcdf4ee, { ao: false, v: 0.05 });
            mb.glow(0xffffff, 2.6).ico(0.06, 0, 0xffffff, { z: 0.03, ao: false, v: 0 });
            mb.glow(0x9ad8f0, 1.2).cone(0.09, 0.28, 6, 0x74cce0, { z: -0.18, rx: -Math.PI / 2, ao: false, v: 0.04 });
        },
    },
    rock: {
        motion: 'tumble',
        size: 1.1,
        build (mb) {
            mb.main.dode(0.15, (x, y, z) => RAMP.stone[Math.max(0, Math.min(4, Math.round(2 + y * 8 - (x + z) * 4)))], { sy: 0.85, j: 0.05, v: 0.1 });
            mb.main.dode(0.07, RAMP.stone[1], { x: 0.1, y: -0.04, z: 0.05, j: 0.02 });
        },
    },
    spore: {
        motion: 'pulse',
        build (mb) {
            mb.main.ico(0.13, 1, (x, y) => mix(0x3f8a4c, 0x92d364, clamp(0.5 + y * 3 - x)), { j: 0.02, v: 0.06 });
            for (let i = 0; i < 8; i++) {
                const a = i / 8 * TAU, e = (i % 2 ? 0.5 : -0.4);
                mb.glow(0xd4f08a, 1.2).cone(0.03, 0.09, 3, 0xd4f08a, { x: Math.cos(a) * 0.14, y: e * 0.14, z: Math.sin(a) * 0.14, rz: -Math.cos(a) * 1.3, rx: Math.sin(a) * 1.3, ao: false, v: 0 });
            }
        },
    },
    frost: {
        motion: 'roll',
        build (mb) {
            mb.glow(0x8ac4e0, 1.6).oct(0.08, (_x, _y, z) => mix(RAMP.ice[1], RAMP.ice[3], clamp(0.5 + z * 2)), { sz: 3.2, ao: false, v: 0.08 });
            for (const a of [0, TAU / 3, 2 * TAU / 3]) mb.glow(0xcdf4ee, 1.4).oct(0.035, 0xe8fbff, { x: Math.cos(a) * 0.08, y: Math.sin(a) * 0.08, z: -0.08, sz: 2.4, ao: false, v: 0 });
        },
    },
    fire: {
        motion: 'flicker',
        build (mb) {
            mb.glow(0xf07a22, 2.2).ico(0.12, 1, 0xf8a24a, { ao: false, v: 0.06 });
            mb.glow(0xffe08a, 2.6).ico(0.07, 0, 0xfff3b0, { z: 0.03, ao: false, v: 0 });
            mb.glow(0xe02a14, 1.8).cone(0.11, 0.34, 5, (_x, _y, z) => mix(0xe02a14, 0xf8a24a, clamp(1 + z * 3)), { z: -0.2, rx: -Math.PI / 2, ao: false, v: 0.05 });
        },
    },
    bolt: {
        motion: 'jitter',
        build (mb) {
            const g = mb.glow(0xb08aff, 2.4), pts = [[0, 0.02, 0.24], [0.05, -0.02, 0.1], [-0.04, 0.03, -0.02], [0.04, -0.02, -0.14], [0, 0.01, -0.26]];
            for (let i = 0; i < pts.length - 1; i++) g.rod(pts[i], pts[i + 1], 0.03, 4, 0xe8dcff, 0.03, { ao: false, v: 0 });
            mb.glow(0x9d6fdb, 1.6).oct(0.08, 0xc4a4f0, { z: 0.22, sz: 1.4, ao: false, v: 0 });
        },
    },
};

let shadowGeo: THREE.CircleGeometry | null = null;
let shadowMat: THREE.MeshBasicMaterial | null = null;

/** A monster's projectile in flight: the model for its kind (a plain glowing orb for a kind nobody has modelled, which the coverage test forbids). */
export function shotModel (kind: string): Model<ProjE> {
    const spec = (SHOTS as Record<string, ShotSpec | undefined>)[kind] ?? SHOTS.orb;
    const root = new THREE.Group(), fly = new THREE.Group(), spin = new THREE.Group();
    const body = bake(`shot|${kind}`, spec.build, 3);
    body.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
    body.scale.setScalar(spec.size ?? 1);
    spin.add(body);
    fly.add(spin);
    fly.position.y = 0.55;
    root.add(fly);
    shadowGeo ??= new THREE.CircleGeometry(0.16, 10).rotateX(-Math.PI / 2);
    shadowMat ??= new THREE.MeshBasicMaterial({ color: 0x2a1d2c, transparent: true, opacity: 0.25, depthWrite: false });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.y = 0.03;
    shadow.renderOrder = 1;
    shadow.raycast = () => {};
    root.add(shadow);
    const ph = Math.random() * TAU;
    let heading = Number.NaN;
    return {
        obj: root,
        apply (e: ProjE) {
            if (e.vx || e.vy) heading = Math.atan2(e.vx, e.vy);
            if (!Number.isNaN(heading)) fly.rotation.y = heading;
        },
        update (dt: number, t: number) {
            const u = t * 1 + ph;
            switch (spec.motion) {
                case 'wobble': spin.rotation.set(Math.sin(u * 22) * 0.06, Math.sin(u * 17) * 0.06, 0); break;
                case 'tumble': spin.rotation.x += dt * 9; spin.rotation.z += dt * 4; break;
                case 'roll': spin.rotation.z += dt * 12; break;
                case 'pulse': spin.scale.setScalar(1 + 0.12 * Math.sin(u * 12)); spin.rotation.z += dt * 3; break;
                case 'flicker': { const f = flicker(t, ph); spin.scale.set(1 + (f - 0.5) * 0.25, 1 + (f - 0.5) * 0.25, 1 + (f - 0.5) * 0.4); break; }
                case 'jitter': spin.rotation.z = Math.sin(u * 41) * 0.5; spin.scale.setScalar(0.9 + 0.2 * Math.abs(Math.sin(u * 29))); break;
                default: break;
            }
            fly.position.y = 0.55 + Math.sin(u * 6) * 0.02;
        },
    };
}
