// The co-op boss statuses on a farmer (`PlayerS.co`, data/costatus.ts), as the 2D view shows them: a block of ice round a frozen
// farmer (it cracks and shrinks as a friend thaws it), purple wisps circling a hexed one, and a chain between two tethered farmers.
import * as THREE from 'three';
import type { CoKind } from '../../shared/data/costatus';
import { RAMP } from './data';
import { bake, clamp, mix, TAU } from './kit';

const ICE_GEO = new THREE.IcosahedronGeometry(0.55, 0).scale(1, 1.15, 1);
const HEX_RING = new THREE.RingGeometry(0.42, 0.5, 24).rotateX(-Math.PI / 2);
const HEX_MAT = new THREE.MeshBasicMaterial({ color: 0x9d6fdb, transparent: true, opacity: 0.45, depthWrite: false });
const ICE_MAT = new THREE.MeshStandardMaterial({ color: 0xcdf4ee, transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.05, flatShading: true, emissive: 0x74cce0, emissiveIntensity: 0.25, depthWrite: false });

/** Each status's look on (or between) farmers: a builder per kind, so the coverage test can ask that every kind has one. */
export const STATUS_MODELS: Record<CoKind, () => THREE.Object3D> = {
    frozen: () => {
        const g = new THREE.Group();
        const shell = new THREE.Mesh(ICE_GEO, ICE_MAT);
        shell.position.y = 0.48;
        shell.renderOrder = 4;
        shell.raycast = () => {};
        g.add(shell);
        g.add(bake('co.frozen.shards', (mb) => {
            for (let i = 0; i < 6; i++) {
                const a = i / 6 * TAU + 0.3;
                mb.glow(0x8ac4e0, 0.9).oct(0.09, (_x, y) => mix(RAMP.ice[1], RAMP.ice[3], clamp(y * 1.5)), { x: Math.cos(a) * 0.5, y: 0.08 + (i % 2) * 0.05, z: Math.sin(a) * 0.5, sy: 2.4, rz: Math.cos(a) * 0.5, rx: -Math.sin(a) * 0.5, ao: false, v: 0.05 });
            }
        }));
        return g;
    },
    hexed: () => {
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) {
            const w = bake('co.hexed.wisp', (mb) => {
                mb.glow(0x9d6fdb, 2).oct(0.07, 0xc4a4f0, { sy: 1.5, ao: false, v: 0 });
                mb.glow(0x5d4a7c, 1.2).cone(0.05, 0.16, 4, 0x8f72cc, { y: -0.12, rx: Math.PI, ao: false, v: 0 });
            });
            w.userData.i = i;
            g.add(w);
        }
        const ring = new THREE.Mesh(HEX_RING, HEX_MAT);
        ring.position.y = 0.04;
        ring.raycast = () => {};
        g.add(ring);
        return g;
    },
    tether: () => bake('co.tether.link', (mb) => {
        mb.shiny().torus(0.06, 0.018, 4, 8, RAMP.steel[2], { ao: false, v: 0.04 });
    }),
};

/** Move a status object (frozen: thaw 0..1 shrinks and tilts the block; hexed: the wisps circle the head). */
export function animateStatus (k: CoKind, o: THREE.Object3D, t: number, thaw = 0) {
    if (k === 'frozen') {
        const s = 1 - 0.35 * clamp(thaw);
        o.scale.set(s, s, s);
        o.rotation.z = Math.sin(t * 40) * 0.03 * clamp(thaw * 3);
    } else if (k === 'hexed') {
        for (const c of o.children) {
            const i = c.userData.i as number | undefined;
            if (i === undefined) continue;
            const a = t * 2.2 + i / 3 * TAU;
            c.position.set(Math.cos(a) * 0.38, 0.95 + Math.sin(t * 3 + i) * 0.08, Math.sin(a) * 0.38);
            c.rotation.y = -a;
        }
    }
}

/** A chain between two points (tiles), sagging a little: `links` are the link objects (made by STATUS_MODELS.tether), reused. */
export function layChain (links: THREE.Object3D[], ax: number, az: number, bx: number, bz: number, t: number) {
    const n = links.length, d = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, l = links[i];
        l.position.set(ax + (bx - ax) * u, 0.38 - Math.sin(u * Math.PI) * Math.min(0.25, d * 0.04) + Math.sin(t * 6 + i) * 0.01, az + (bz - az) * u);
        l.rotation.order = 'YXZ';
        l.rotation.set(i % 2 ? Math.PI / 2 : 0, ang + Math.PI / 2, 0);
    }
}
