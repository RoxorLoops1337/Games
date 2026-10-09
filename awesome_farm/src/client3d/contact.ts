// Contact shadows: a soft dark patch on the ground under everything that stands (buildings, trees and rocks, monsters,
// creatures, farmers, drops), so nothing floats. The sun's shadow map only shows by day on Medium and High; these work at
// every level, at night and in the caves (the 2D view gives every standing sprite its ground shadow too). One instanced mesh,
// one draw call; sizes come from the data (a building's footprint, a monster's body radius), never from the models.

import { DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, type Scene, Vector3 } from 'three';
import { TILE } from '../shared/config';
import { BUILDINGS } from '../shared/data/buildings';
import { MOBS } from '../shared/data/mobs';
import type { Ent } from '../shared/sim/types';
import { familyOf } from './entities';
import { softDisc } from './glow';

const MAX = 640;
/** Node shadows wider or smaller than a boulder's (1 tile). */
const NODE_SIZE: Record<string, number | undefined> = { tree: 1.35, titan_oak: 2.8, titan_rock: 2.6, nest: 2, flower: 0.55, mushroom: 0.55, reeds: 0.6, herb: 0.6, cotton: 0.7, bush: 0.9 };

/** How wide (x) and deep (z) the shadow under one entity is, in tiles; null for what lies flat (floors, paths, belts, walls, shots). */
export function contactSize (e: Ent): [number, number] | null {
    switch (e.k) {
        case 'bld': {
            const d = BUILDINGS[e.kind];
            if (!d || d.floor || d.roof || d.walk || familyOf(e.kind)) return null;
            const [w, h] = d.size;
            return [w * 1.08 + 0.15, h * 0.95 + 0.15];
        }
        case 'node': {
            const k = NODE_SIZE[e.kind] ?? 1;
            return [k, k * 0.82];
        }
        case 'mob': { const r = MOBS[e.kind]?.r ?? 6; const d = Math.max(0.7, (r / TILE) * 2.6); return [d, d * 0.8]; }
        case 'crit': return [0.72, 0.58];
        case 'drop': return [0.42, 0.34];
        default: return null;
    }
}

export class ContactShadows {
    readonly mesh: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
    private readonly m = new Matrix4();
    private readonly q = new Quaternion();
    private readonly p = new Vector3();
    private readonly s = new Vector3();
    private n = 0;

    constructor (scene: Scene) {
        const mat = new MeshBasicMaterial({ map: softDisc(), color: 0x1c1428, transparent: true, opacity: 0.36, depthWrite: false, fog: false });
        this.mesh = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, MAX);
        this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 1;
        this.mesh.name = 'contact';
        this.mesh.count = 0;
        scene.add(this.mesh);
    }

    /** Begin a frame: `strength` 0..1 (lighter while the sun's own shadows show, stronger when they do not). */
    begin (strength: number) {
        this.n = 0;
        this.mesh.material.opacity = strength;
    }

    /** One patch at (x, z), w by d tiles, nudged away from the sun (north-west) a little. */
    add (x: number, z: number, w: number, d: number, y = 0.03) {
        if (this.n >= MAX) return;
        this.p.set(x + 0.06, y, z + 0.08);
        this.s.set(w, 1, d);
        this.m.compose(this.p, this.q, this.s);
        this.mesh.setMatrixAt(this.n++, this.m);
    }

    /** Everything shown in `views` that stands (see `contactSize`). */
    addViews (views: Iterable<{ e: Ent; x: number; z: number; model: { obj: { visible: boolean } } }>) {
        for (const v of views) {
            if (!v.model.obj.visible) continue;
            const sz = contactSize(v.e);
            if (sz) this.add(v.x, v.z, sz[0], sz[1]);
        }
    }

    end () {
        this.mesh.count = this.n;
        this.mesh.visible = this.n > 0;
        if (this.n) this.mesh.instanceMatrix.needsUpdate = true;
    }

    get count () { return this.n; }

    dispose () {
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.mesh.dispose();
    }
}
