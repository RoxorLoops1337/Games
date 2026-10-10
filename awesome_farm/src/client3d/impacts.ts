// Event VFX on top of the juice bursts (fx.ts): a ring that spreads over the ground where a blow lands or something breaks, a
// soft flash at the moment of impact, and dust kicked up by running feet. Each is ONE instanced mesh (one draw call however
// many are alive), pooled, with no per-event allocation. The rings and flashes are additive, so they fade by darkening; the
// dust is a soft puff that swells and shrinks. Which action gets which ring is the data table `RINGS`.

import { AdditiveBlending, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, RingGeometry, type Scene, Vector3 } from 'three';
import { C } from './fx';
import { softDisc } from './glow';
import { EL } from './render';

/** One action's ring: colour, start and end radius (tiles), how long it lives (s), and a flash at the start (its size, 0: none). */
export interface RingDef { color: number; r0: number; r1: number; dur: number; flash?: number }

const small = (color: number): RingDef => ({ color, r0: 0.12, r1: 0.62, dur: 0.24 });
const breakRing = (color: number): RingDef => ({ color, r0: 0.25, r1: 1.45, dur: 0.42, flash: 0.9 });

/** The actions that leave a ring (the rest keep only their burst, as before). */
export const RINGS: Record<string, RingDef | undefined> = {
    hitWood: small(C.lime), hitStone: small(C.pebble), hitEarth: small(C.sand), hitCrystal: small(C.plum), dig: small(C.sand),
    breakTree: breakRing(C.lime), breakRock: breakRing(C.pebble), breakOre: breakRing(C.gold), breakEarth: breakRing(C.sand), breakCrystal: breakRing(C.plum),
    enemyHit: { color: C.cream, r0: 0.15, r1: 0.85, dur: 0.22, flash: 0.75 },
    crit: { color: C.gold, r0: 0.2, r1: 1.2, dur: 0.3, flash: 1.1 },
    enemyDie: { color: C.plum, r0: 0.2, r1: 1.5, dur: 0.4, flash: 1 },
    hurt: { color: C.berry, r0: 0.2, r1: 1.0, dur: 0.3, flash: 0.9 },
    downed: { color: C.berry, r0: 0.3, r1: 1.8, dur: 0.55, flash: 1.2 },
    slam: { color: C.cream, r0: 0.4, r1: 3.2, dur: 0.55, flash: 1.6 },
    roar: { color: C.berry, r0: 0.5, r1: 3.6, dur: 0.7 },
    bossDie: { color: C.gold, r0: 0.5, r1: 5, dur: 0.9, flash: 3 },
    nestHit: small(C.plum), nestDie: { color: C.plum, r0: 0.4, r1: 2.6, dur: 0.6, flash: 1.6 },
    nestSpread: { color: C.plum, r0: 0.6, r1: 3.4, dur: 0.8, flash: 1.4 },
    raid: { color: C.berry, r0: 0.6, r1: 4.5, dur: 1, flash: 2 },
    bldHit: small(C.berry), bldBreak: breakRing(C.berry),
    build: { color: C.cream, r0: 0.3, r1: 1.2, dur: 0.35 },
    buyLand: { color: C.foam, r0: 1, r1: 6, dur: 0.9 },
    levelUp: { color: C.gold, r0: 0.3, r1: 2.2, dur: 0.6, flash: 1.4 },
    perk: { color: C.plum, r0: 0.3, r1: 1.6, dur: 0.5 },
    upgrade: { color: C.gold, r0: 0.3, r1: 1.4, dur: 0.45 },
    revive: { color: C.lime, r0: 0.3, r1: 1.8, dur: 0.6, flash: 1.2 },
    perfect: { color: C.foam, r0: 0.3, r1: 2.2, dur: 0.45, flash: 1.4 },
    dash: { color: C.cream, r0: 0.2, r1: 0.9, dur: 0.25 },
    freeze: { color: C.foam, r0: 0.3, r1: 1.4, dur: 0.45, flash: 1 },
    summon: { color: C.plum, r0: 0.4, r1: 2.4, dur: 0.6, flash: 1.2 },
    titan: { color: C.gold, r0: 0.6, r1: 3, dur: 0.6, flash: 1.6 },
    harvestCrop: small(C.gold),
    artHook: small(C.cream), artArrow: small(C.foam), artRam: { color: C.berry, r0: 0.3, r1: 1.8, dur: 0.5, flash: 1.2 },
    artScorch: { color: C.pumpkin, r0: 0.3, r1: 3.4, dur: 0.5, flash: 1.6 },
    artShroud: { color: C.plum, r0: 0.3, r1: 1.4, dur: 0.5 }, artFrost: { color: C.foam, r0: 0.5, r1: 3, dur: 0.6 },
};

const RN = 40;
const FN = 16;
const DN = 48;

interface Live { x: number; y: number; z: number; t: number; dur: number; a: number; b: number; color: number }

const _m = new Matrix4();
const _q = new Quaternion();
const _flat = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

export class Impacts {
    private readonly rings: InstancedMesh<RingGeometry, MeshBasicMaterial>;
    private readonly flashes: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
    private readonly dust: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
    private readonly ringL: Live[] = [];
    private readonly flashL: Live[] = [];
    private readonly dustL: Live[] = [];
    /** Each farmer's step clock (a puff every few strides). */
    private readonly steps = new Map<string, number>();
    /** Dust kicked by feet (the Low quality level and rain turn it off). */
    feet = true;

    constructor (scene: Scene) {
        const add = { transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false };
        this.rings = new InstancedMesh(new RingGeometry(0.86, 1, 36).rotateX(-Math.PI / 2), new MeshBasicMaterial(add), RN);
        this.flashes = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ ...add, map: softDisc() }), FN);
        this.dust = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: softDisc(), transparent: true, depthWrite: false, opacity: 0.5, fog: false }), DN);
        // flashes and puffs face the camera (it looks down at EL from the south)
        _flat.setFromAxisAngle(_p.set(1, 0, 0), -EL);
        for (const [mesh, order, n] of [[this.rings, 5, RN], [this.flashes, 26, FN], [this.dust, 7, DN]] as const) {
            mesh.instanceMatrix.setUsage(DynamicDrawUsage);
            mesh.frustumCulled = false;
            mesh.renderOrder = order;
            mesh.count = 0;
            mesh.visible = false;
            for (let i = 0; i < n; i++) mesh.setColorAt(i, _c.set(0));
            scene.add(mesh);
        }
    }

    /** A sim action at (x, z) in tiles: its ring and flash, if it has them. */
    fx (name: string, x: number, z: number) {
        const d = RINGS[name];
        if (!d) return;
        push(this.ringL, RN, { x, y: 0.07, z, t: 0, dur: d.dur, a: d.r0, b: d.r1, color: d.color });
        if (d.flash) push(this.flashL, FN, { x, y: 0.75, z: z + 0.1, t: 0, dur: 0.13, a: d.flash * 0.4, b: d.flash * 0.7, color: d.color });
        if (name === 'dash' || name === 'slam') for (let i = 0; i < 4; i++) this.puff(x + (Math.random() - 0.5) * 0.8, z + (Math.random() - 0.5) * 0.5, 1.2);
        // a wall broken by raiders goes up in a cloud of dust and rubble
        if (name === 'bldBreak') for (let i = 0; i < 7; i++) this.puff(x + (Math.random() - 0.5) * 1.1, z + (Math.random() - 0.5) * 0.7, 1.7, 0xc8c0b0);
    }

    /** A farmer this frame: while it runs, a puff of dust at its heels every few strides. */
    feetOf (id: string, x: number, z: number, moving: boolean, dt: number) {
        if (!this.feet || !moving) { this.steps.delete(id); return; }
        const s = (this.steps.get(id) ?? 0.12) - dt;
        if (s > 0) { this.steps.set(id, s); return; }
        this.steps.set(id, 0.24 + Math.random() * 0.08);
        this.puff(x + (Math.random() - 0.5) * 0.25, z + 0.12, 1);
    }

    /** Forget a farmer who left. */
    drop (id: string) { this.steps.delete(id); }

    private puff (x: number, z: number, k: number, color = 0xe8dcc0) {
        push(this.dustL, DN, { x, y: 0.12, z, t: 0, dur: 0.5 + Math.random() * 0.15 + (k > 1.5 ? 0.35 : 0), a: 0.18 * k, b: 0.5 * k, color });
    }

    update (dt: number) {
        this.draw(this.rings, this.ringL, dt, (l, u) => {
            const e = 1 - (1 - u) * (1 - u) * (1 - u), r = l.a + (l.b - l.a) * e;
            _p.set(l.x, l.y, l.z); _s.set(r, 1, r);
            _m.compose(_p, _q.identity(), _s);
            return (1 - u) * (1 - u) * 0.9;
        });
        this.draw(this.flashes, this.flashL, dt, (l, u) => {
            const r = l.a + (l.b - l.a) * u;
            _p.set(l.x, l.y, l.z); _s.set(r, r, 1);
            _m.compose(_p, _flat, _s);
            return (1 - u) * (1 - u) * 0.6;
        });
        this.draw(this.dust, this.dustL, dt, (l, u) => {
            const r = (l.a + (l.b - l.a) * Math.sqrt(u)) * (u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3);
            _p.set(l.x, l.y + u * 0.25, l.z); _s.set(r, r * 0.8, 1);
            _m.compose(_p, _flat, _s);
            return 1;
        });
    }

    /** Age a pool and lay it into its mesh; `place` sets `_m` and returns the colour's strength. */
    private draw (mesh: InstancedMesh, list: Live[], dt: number, place: (l: Live, u: number) => number) {
        let n = 0;
        for (let i = list.length - 1; i >= 0; i--) {
            const l = list[i];
            l.t += dt;
            if (l.t >= l.dur) { list.splice(i, 1); continue; }
            const k = place(l, l.t / l.dur);
            mesh.setMatrixAt(n, _m);
            mesh.setColorAt(n, _c.set(l.color).multiplyScalar(k));
            n++;
        }
        mesh.count = n;
        mesh.visible = n > 0;
        if (!n) return;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    /** How many rings, flashes and puffs are alive (tests). */
    get alive () { return { rings: this.ringL.length, flashes: this.flashL.length, dust: this.dustL.length }; }

    clear () { this.ringL.length = 0; this.flashL.length = 0; this.dustL.length = 0; this.steps.clear(); }

    dispose () {
        for (const m of [this.rings, this.flashes, this.dust]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); m.dispose(); }
    }
}

/** Add to a pool; when it is full the oldest goes. */
function push (list: Live[], cap: number, l: Live) {
    if (list.length >= cap) list.shift();
    list.push(l);
}
