// The power wires in 3D: a sagging wire from pole top to pole top (gold on a grid with a generator, grey on a dead one, as the 2D
// view draws them) and a faint feed from the nearest pole down to each machine it powers. They are thin ribbons turned to face the
// camera (the camera never turns, so they are built once), rebuilt only when a pole, generator or machine comes or goes, or the
// camera has moved far from where they were last built. The grids come from the same rules the game uses (shared/sim/power.ts).

import { BufferAttribute, BufferGeometry, Color, Mesh, MeshBasicMaterial, type Scene, Vector3 } from 'three';
import { BUILDINGS } from '../shared/data/buildings';
import { PAL } from '../shared/palette';
import { buildPowerGraph, nearestPole } from '../shared/sim/power';
import type { BuildE, Ent } from '../shared/sim/types';
import { EL } from './render';

/** Where a wire meets the pole model (its top insulator, models/b-work-power.ts `pole`) and a machine (about its middle). */
const POLE_TOP = 1.72;
const FEED_Y = 0.55;
/** How far around the camera wires are built (tiles), and how far the camera may wander before they are built again. */
const REACH = 34;
const MOVE = 10;
const SEGS = 10;

/** The direction the camera looks (fixed: an orthographic camera at the elevation EL, facing north). */
const VIEW = new Vector3(0, -Math.sin(EL), -Math.cos(EL));
const _d = new Vector3();
const _w = new Vector3();
const _c = new Color();

class Ribbons {
    pos: number[] = [];
    col: number[] = [];
    /** A ribbon `w` wide along a polyline, turned to face the camera, in one colour. */
    add (pts: Vector3[], w: number, color: number) {
        const { r, g, b } = _c.setHex(color);         // (in the renderer's working colour space, as vertex colours are read)
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], c = pts[i + 1];
            _d.subVectors(c, a);
            _w.crossVectors(_d, VIEW).normalize().multiplyScalar(w / 2);
            const q = [a.x - _w.x, a.y - _w.y, a.z - _w.z, c.x - _w.x, c.y - _w.y, c.z - _w.z, c.x + _w.x, c.y + _w.y, c.z + _w.z, a.x + _w.x, a.y + _w.y, a.z + _w.z];
            for (const k of [0, 1, 2, 0, 2, 3]) { this.pos.push(q[k * 3], q[k * 3 + 1], q[k * 3 + 2]); this.col.push(r, g, b); }
        }
    }
    geometry () {
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
        g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
        return g;
    }
}

/** A wire between two points that hangs a little in the middle. */
function sag (ax: number, az: number, bx: number, bz: number, y: number): Vector3[] {
    const len = Math.hypot(bx - ax, bz - az), drop = Math.min(0.45, 0.06 + len * 0.05);
    return Array.from({ length: SEGS + 1 }, (_, i) => { const k = i / SEGS; return new Vector3(ax + (bx - ax) * k, y - drop * 4 * k * (1 - k), az + (bz - az) * k); });
}

export class Wires {
    private wires: Mesh<BufferGeometry, MeshBasicMaterial>;
    private feeds: Mesh<BufferGeometry, MeshBasicMaterial>;
    private sig = -1;
    private at = { x: 1e9, z: 1e9 };
    private checkIn = 0;

    constructor (scene: Scene) {
        const solid = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
        const faint = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, fog: false });
        this.wires = new Mesh(new BufferGeometry(), solid);
        this.feeds = new Mesh(new BufferGeometry(), faint);
        this.wires.frustumCulled = false;
        this.feeds.frustumCulled = false;
        this.feeds.renderOrder = 6;
        scene.add(this.wires, this.feeds);
    }

    /** A few times a second: look for a change in what carries power (or a long walk), and build the wires again if there is one. */
    update (dt: number, ents: Iterable<{ e: Ent }>, cx: number, cz: number) {
        this.checkIn -= dt;
        if (this.checkIn > 0) return;
        this.checkIn = 0.3;
        let sig = 0;
        const blds: BuildE[] = [];
        for (const { e } of ents) {
            if (e.k !== 'bld') continue;
            const d = BUILDINGS[e.kind];
            if (!(d.pole || d.gen || d.use || d.store)) continue;
            blds.push(e);
            sig = (sig * 31 + e.id * 7 + e.tx * 3 + e.ty) | 0;
        }
        const moved = Math.abs(cx - this.at.x) + Math.abs(cz - this.at.z) > MOVE;
        if (sig === this.sig && !moved) return;
        this.sig = sig;
        this.at = { x: cx, z: cz };
        this.build(blds, cx, cz);
    }

    private build (blds: BuildE[], cx: number, cz: number) {
        const graph = buildPowerGraph(blds);
        const near = (x: number, z: number) => Math.abs(x - cx) < REACH && Math.abs(z - cz) < REACH;
        const solid = new Ribbons(), faint = new Ribbons();
        for (const [a, b] of graph.links) {
            const ax = a.tx + 0.5, az = a.ty + 0.5, bx = b.tx + 0.5, bz = b.ty + 0.5;
            if (!near(ax, az) && !near(bx, bz)) continue;
            const pts = sag(ax, az, bx, bz, POLE_TOP);
            solid.add(pts.map((p) => p.clone().setY(p.y - 0.035)), 0.075, PAL.ink);          // (a dark wire under the bright one, as the 2D wire's ink line)
            solid.add(pts, 0.045, graph.netOf.get(a.id)?.live ? PAL.gold : PAL.stone);
        }
        for (const net of graph.nets) {
            for (const m of net.members) {
                const d = BUILDINGS[m.kind], mx = m.tx + d.size[0] / 2, mz = m.ty + d.size[1] / 2;
                if (!near(mx, mz)) continue;
                const pole = nearestPole(net, m);
                faint.add(sag(pole.tx + 0.5, pole.ty + 0.5, mx, mz, POLE_TOP).map((p, i, all) => p.setY(POLE_TOP + (FEED_Y - POLE_TOP) * (i / (all.length - 1)))), 0.03, d.gen ? PAL.gold : PAL.pumpkin);
            }
        }
        this.wires.geometry.dispose();
        this.feeds.geometry.dispose();
        this.wires.geometry = solid.geometry();
        this.feeds.geometry = faint.geometry();
    }

    clear () { this.sig = -1; this.at = { x: 1e9, z: 1e9 }; this.wires.geometry.dispose(); this.feeds.geometry.dispose(); this.wires.geometry = new BufferGeometry(); this.feeds.geometry = new BufferGeometry(); }

    dispose () { this.clear(); this.wires.material.dispose(); this.feeds.material.dispose(); }
}
