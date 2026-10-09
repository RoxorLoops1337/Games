// Raiders wading across the sea (the 2D BlightFx.wade): a Blight raider in the sea is sunk to the waist (Entities does that, `View.wade`),
// and here it leaves foam: a collar of foam round its body, rings that spread on the water behind it as it wades, and the odd splash of
// drops. Everything lies on the water (WATER_Y), not the ground. Three instanced meshes, pooled, one draw call each, no allocation per
// frame; a raider off screen or on land costs nothing.

import { AdditiveBlending, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, RingGeometry, type Scene, Vector3 } from 'three';
import { softDisc } from './glow';
import { EL } from './render';
import { WATER_Y } from './terrain';

/** How deep a raider stands in the sea (tiles below the water): to the waist, as the 2D view crops the sprite to two thirds. */
export const wadeDepth = (radiusPx: number) => Math.min(0.62, Math.max(0.24, 0.12 + (radiusPx / 16) * 0.75));

const RN = 64, CN = 24, DN = 64;
/** The foam's colours: the 2D view's foam and snow. */
const FOAM = 0xcdf4ee, SNOW = 0xffffff;

interface Ring { x: number; z: number; t: number; dur: number; r0: number; r1: number }
interface Drop { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; dur: number; s: number }

const _m = new Matrix4();
const _q = new Quaternion();
const _face = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

export class Wading {
    private readonly rings: InstancedMesh<RingGeometry, MeshBasicMaterial>;
    private readonly collars: InstancedMesh<RingGeometry, MeshBasicMaterial>;
    private readonly drops: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
    private readonly ringL: Ring[] = [];
    private readonly dropL: Drop[] = [];
    /** Each raider's ripple clock. */
    private readonly clock = new Map<number, number>();
    /** The collars this frame (x, z, radius, phase). */
    private readonly collarL: number[] = [];
    /** Splashes (the Low quality level drops them; the rings and collars stay). */
    splash = true;

    constructor (scene: Scene) {
        const add = { transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false };
        this.rings = new InstancedMesh(new RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2), new MeshBasicMaterial(add), RN);
        this.collars = new InstancedMesh(new RingGeometry(0.7, 1, 24).rotateX(-Math.PI / 2), new MeshBasicMaterial(add), CN);
        this.drops = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ ...add, map: softDisc() }), DN);
        _face.setFromAxisAngle(_p.set(1, 0, 0), -EL);
        for (const [mesh, n] of [[this.rings, RN], [this.collars, CN], [this.drops, DN]] as const) {
            mesh.instanceMatrix.setUsage(DynamicDrawUsage);
            mesh.frustumCulled = false;
            mesh.renderOrder = 4;
            mesh.count = 0;
            mesh.visible = false;
            for (let i = 0; i < n; i++) mesh.setColorAt(i, _c.set(0));
            scene.add(mesh);
        }
    }

    /** A raider standing in the sea this frame: `r` its body's radius (tiles), `moving` whether it wades on. */
    step (id: number, x: number, z: number, r: number, moving: boolean, dt: number) {
        if (this.collarL.length < CN * 4) this.collarL.push(x, z, r, id);
        let c = (this.clock.get(id) ?? Math.random() * 0.3) - dt;
        if (c <= 0) {
            c = moving ? 0.32 + Math.random() * 0.1 : 0.9 + Math.random() * 0.3;
            push(this.ringL, RN, { x, z: z + 0.05, t: 0, dur: moving ? 0.9 : 1.3, r0: r * 0.9, r1: r * (moving ? 2.6 : 2) });
        }
        this.clock.set(id, c);
        if (this.splash && moving && Math.random() < dt * 6) {
            for (let i = 0; i < 2; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 0.9;
                push(this.dropL, DN, { x: x + Math.cos(a) * r * 0.7, y: WATER_Y + 0.05, z: z + Math.sin(a) * r * 0.5, vx: Math.cos(a) * sp, vy: 2.2 + Math.random() * 1.4, vz: Math.sin(a) * sp * 0.6, t: 0, dur: 0.6, s: 0.07 + Math.random() * 0.06 });
            }
        }
    }

    /** Forget a raider that went (its ripple clock). */
    forget (id: number) { this.clock.delete(id); }

    update (dt: number) {
        const y = WATER_Y + 0.03;
        // the rings spreading behind
        let n = 0;
        for (let i = this.ringL.length - 1; i >= 0; i--) {
            const l = this.ringL[i];
            l.t += dt;
            if (l.t >= l.dur) { this.ringL.splice(i, 1); continue; }
            const u = l.t / l.dur, e = 1 - (1 - u) * (1 - u), r = l.r0 + (l.r1 - l.r0) * e;
            _p.set(l.x, y, l.z); _s.set(r, 1, r * 0.8);
            _m.compose(_p, _q.identity(), _s);
            this.rings.setMatrixAt(n, _m);
            this.rings.setColorAt(n, _c.set(u < 0.5 ? SNOW : FOAM).multiplyScalar((1 - u) * 0.55));
            n++;
        }
        flush(this.rings, n);
        // the collar of foam round each body, breathing
        n = 0;
        const now = performance.now() / 1000;
        for (let i = 0; i < this.collarL.length && n < CN; i += 4) {
            const r = this.collarL[i + 2] * (1.15 + Math.sin(now * 6 + this.collarL[i + 3]) * 0.08);
            _p.set(this.collarL[i], y + 0.005, this.collarL[i + 1] + 0.02); _s.set(r, 1, r * 0.75);
            _m.compose(_p, _q.identity(), _s);
            this.collars.setMatrixAt(n, _m);
            this.collars.setColorAt(n, _c.set(FOAM).multiplyScalar(0.5));
            n++;
        }
        this.collarL.length = 0;
        flush(this.collars, n);
        // the drops: up, and back into the sea
        n = 0;
        for (let i = this.dropL.length - 1; i >= 0; i--) {
            const d = this.dropL[i];
            d.t += dt;
            d.vy -= 9 * dt;
            d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
            if (d.t >= d.dur || d.y < WATER_Y) { this.dropL.splice(i, 1); continue; }
            _p.set(d.x, d.y, d.z); _s.set(d.s, d.s, 1);
            _m.compose(_p, _face, _s);
            this.drops.setMatrixAt(n, _m);
            this.drops.setColorAt(n, _c.set(SNOW).multiplyScalar(0.9 * (1 - d.t / d.dur)));
            n++;
        }
        flush(this.drops, n);
    }

    /** How many rings, collars and drops are alive (tests). */
    get alive () { return { rings: this.ringL.length, drops: this.dropL.length, collars: this.collars.count }; }

    clear () { this.ringL.length = 0; this.dropL.length = 0; this.collarL.length = 0; this.clock.clear(); }

    dispose () {
        for (const m of [this.rings, this.collars, this.drops]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); m.dispose(); }
    }
}

function flush (mesh: InstancedMesh, n: number) {
    mesh.count = n;
    mesh.visible = n > 0;
    if (!n) return;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function push<T> (list: T[], cap: number, l: T) {
    if (list.length >= cap) list.shift();
    list.push(l);
}
