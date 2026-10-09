// What the 3D view paints on the ground itself (the rest of the world overlays are the 2D code's own drawing, laid onto the 3D
// ground by the overlay camera, client/world/overlay3d.ts): a boss's warnings, in the shapes the 2D view draws them (circle, ring,
// cone, line), in their colours (red for a blow, ice blue, curse violet and chain gold for the co-op patterns), filling up until
// they land and flashing white when they do; and the dashed ring of the arena a boss is bound to. These are real decals on the
// 3D ground, so a monster or a farmer standing in a warning stands over it, not under it.
//
// Units: tiles (x east, z south); the sim's angles are 2D angles (x east, y south), which are the same angles on the x/z plane.

import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, type Scene } from 'three';
import { TILE } from '../shared/config';
import { MOBS, type MobKind } from '../shared/data/mobs';
import { PAL } from '../shared/palette';
import type { Ent, SimEvent } from '../shared/sim/types';

type Tele = Extract<SimEvent, { e: 'tele' }>;

/** The colour of a warning (as in the 2D view, world/combat.ts): red for a blow, the co-op patterns in their own. */
const WARN = { frost: PAL.sea, hex: PAL.plum, chain: PAL.gold } as const;
/** How the cone opens either side of its heading (radians, as in 2D). */
const CONE_HALF = 0.96;
/** The width of an outline (tiles): the 2D view's 1.5 px line. */
const EDGE = 0.1;
const Y = 0.045;

/** Triangles on the ground (x/z) from a flat list of [x, z] pairs, three per triangle. */
function flat (pts: number[]): BufferGeometry {
    const pos = new Float32Array((pts.length / 2) * 3);
    for (let i = 0, j = 0; i < pts.length; i += 2, j += 3) { pos[j] = pts[i]; pos[j + 1] = 0; pos[j + 2] = pts[i + 1]; }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    return g;
}

/** A fan: a disc (a0..a1 a whole turn) or a pie slice, radius 1, its point at the origin. */
function fan (a0: number, a1: number, n: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
        const u = a0 + ((a1 - a0) * i) / n, v = a0 + ((a1 - a0) * (i + 1)) / n;
        out.push(0, 0, Math.cos(u), Math.sin(u), Math.cos(v), Math.sin(v));
    }
    return out;
}

/** A band of width `w` along a path of [x, z] points (closed: back to the first). */
function band (path: number[][], w: number, closed: boolean): number[] {
    const out: number[] = [];
    const n = path.length, h = w / 2;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
        const [ax, az] = path[i], [bx, bz] = path[(i + 1) % n];
        const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
        const nx = (-dz / l) * h, nz = (dx / l) * h;
        // (each piece runs half a width past its ends, so the corners close)
        const ex = (dx / l) * h, ez = (dz / l) * h;
        const p = [ax - ex + nx, az - ez + nz, bx + ex + nx, bz + ez + nz, bx + ex - nx, bz + ez - nz, ax - ex - nx, az - ez - nz];
        out.push(p[0], p[1], p[2], p[3], p[4], p[5], p[0], p[1], p[4], p[5], p[6], p[7]);
    }
    return out;
}

const circlePath = (r: number, a0 = 0, a1 = Math.PI * 2, n = 48) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [Math.cos(a) * r, Math.sin(a) * r]; });

/** The shared shapes (made once, scaled and turned per warning). */
const GEO = {
    disc: flat(fan(0, Math.PI * 2, 48)),
    cone: flat(fan(-CONE_HALF, CONE_HALF, 24)),
    /** A unit square from (0, -1) to (1, 1): a line warning is this, scaled by its length and half-width. */
    rect: flat([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]),
};

function mat (color: number, opacity: number) {
    return new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide, toneMapped: false, fog: false });
}

interface Live {
    t: Tele & { len: number }; age: number; g: Group;
    base: Mesh; fill: Mesh; edge: Mesh; inner?: Mesh;
    mats: MeshBasicMaterial[];
    geos: BufferGeometry[];
    warn: Color;
}

const WHITE = new Color(0xffffff);

/** A boss's warnings on the ground, as the 2D view draws them. */
export class Warnings {
    private live: Live[] = [];
    constructor (private scene: Scene) {}

    add (e: Tele) {
        const t = { ...e, x: e.x / TILE, y: e.y / TILE, r: Math.max(0.3, e.r / TILE), len: (e.len ?? 0) / TILE };
        const warnHex = t.kind ? WARN[t.kind] : PAL.berry;
        const g = new Group();
        g.position.set(t.x, Y, t.y);
        g.rotation.y = -(t.a ?? 0);
        g.renderOrder = 4;
        const mats = [mat(warnHex, 0.2), mat(warnHex, 0.35), mat(warnHex, 0.9)];
        const geos: BufferGeometry[] = [];
        let base: Mesh, fill: Mesh, edge: Mesh, inner: Mesh | undefined;
        const own = (geo: BufferGeometry) => { geos.push(geo); return geo; };
        switch (t.shape) {
            case 'line': {
                base = new Mesh(GEO.rect, mats[0]); base.scale.set(t.len, 1, t.r);
                fill = new Mesh(GEO.rect, mats[1]); fill.scale.set(0.001, 1, t.r);
                edge = new Mesh(own(flat(band([[0, -t.r], [t.len, -t.r], [t.len, t.r], [0, t.r]], EDGE, true))), mats[2]);
                break;
            }
            case 'cone': {
                base = new Mesh(GEO.cone, mats[0]); base.scale.setScalar(t.r);
                fill = new Mesh(GEO.cone, mats[1]); fill.scale.setScalar(0.001);
                edge = new Mesh(own(flat(band([[0, 0], ...circlePath(t.r, -CONE_HALF, CONE_HALF, 24)], EDGE, true))), mats[2]);
                break;
            }
            case 'ring': {
                // (a ring that tightens: drawn at radius 1 and scaled; its line is as thick as the 2D 2.5 px stroke at any size)
                base = new Mesh(own(flat(band(circlePath(1), 0.16 / t.r, true))), mats[2]);
                mats.push(mat(PAL.snow, 0.4));
                inner = new Mesh(own(flat(band(circlePath(0.8), 0.07 / t.r, true))), mats[3]);
                fill = new Mesh(GEO.disc, mats[1]); fill.visible = false;
                edge = base;
                g.add(inner);
                break;
            }
            default: {
                base = new Mesh(GEO.disc, mats[0]); base.scale.setScalar(t.r);
                fill = new Mesh(GEO.disc, mats[1]); fill.scale.setScalar(0.001);
                edge = new Mesh(own(flat(band(circlePath(t.r), EDGE, true))), mats[2]);
            }
        }
        for (const m of [base, fill, edge, inner]) if (m) m.renderOrder = 4;
        g.add(base, fill);
        if (edge !== base) g.add(edge);
        this.scene.add(g);
        this.live.push({ t, age: 0, g, base, fill, edge, inner, mats, geos, warn: new Color(warnHex) });
    }

    update (dt: number) {
        for (let i = this.live.length - 1; i >= 0; i--) {
            const w = this.live[i], t = w.t;
            w.age += dt;
            if (w.age > t.t + 0.16) { this.drop(w); this.live.splice(i, 1); continue; }
            const p = Math.min(1, w.age / t.t), hit = w.age > t.t;
            const pulse = 0.5 + 0.5 * Math.sin(w.age * 18);
            const [mBase, mFill, mEdge] = w.mats;
            const col = hit ? WHITE : w.warn;
            if (t.shape === 'ring') {
                const q = 0.35 + 0.65 * p;
                w.g.scale.setScalar(t.r * q);
                mEdge.color.copy(col);
                mEdge.opacity = hit ? 0.8 : 0.9 * (1 - p * 0.4);
                if (w.mats[3]) w.mats[3].opacity = 0.4 * (1 - p);
                continue;
            }
            mBase.color.copy(col);
            mBase.opacity = hit ? 0.5 : 0.16 + 0.1 * pulse;            // (a little stronger than the 2D 0.1: the lit 3D ground is brighter)
            mFill.opacity = hit ? 0 : 0.36;
            mEdge.color.copy(col);
            if (t.shape === 'line') w.fill.scale.set(Math.max(0.001, t.len * p), 1, t.r);
            else w.fill.scale.setScalar(Math.max(0.001, t.r * p));
        }
    }

    private drop (w: Live) {
        this.scene.remove(w.g);
        for (const m of w.mats) m.dispose();
        for (const g of w.geos) g.dispose();
    }

    clear () { for (const w of this.live) this.drop(w); this.live.length = 0; }
}

/** The dashed ring (and faint floor) of the arena each boss is bound to, while the boss is in the world. */
export class Arenas {
    private rings = new Map<number, { g: Group; edge: MeshBasicMaterial; floor: MeshBasicMaterial }>();
    private static dash: BufferGeometry | null = null;
    private seen = new Set<number>();
    constructor (private scene: Scene) {}

    private static dashes () {
        if (!Arenas.dash) {
            const pts: number[] = [];
            const n = 56;
            for (let i = 0; i < n; i += 2) pts.push(...band(circlePath(1, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2, 4), 0.012, false));
            Arenas.dash = flat(pts);
        }
        return Arenas.dash;
    }

    /** Once a frame, over the entities the view has (only bosses carry an arena). */
    update (ents: Iterable<{ e: Ent }>, t: number) {
        this.seen.clear();
        for (const { e } of ents) {
            if (e.k !== 'mob' || e.hx === undefined || e.hy === undefined) continue;
            const boss = MOBS[e.kind as MobKind].boss;
            if (!boss) continue;
            this.seen.add(e.id);
            let r = this.rings.get(e.id);
            if (!r) {
                const g = new Group();
                const floor = mat(boss.color, 0.05), edge = mat(boss.color, 0.4);
                const disc = new Mesh(GEO.disc, floor), ring = new Mesh(Arenas.dashes(), edge);
                disc.renderOrder = 3; ring.renderOrder = 3;
                g.add(disc, ring);
                this.scene.add(g);
                r = { g, edge, floor };
                this.rings.set(e.id, r);
            }
            const R = boss.arena / TILE;
            r.g.position.set(e.hx / TILE, Y - 0.01, e.hy / TILE);
            r.g.scale.setScalar(R);
            r.edge.opacity = 0.4 + 0.12 * Math.sin(t * 2.5);
        }
        for (const [id, r] of this.rings) if (!this.seen.has(id)) { this.scene.remove(r.g); r.edge.dispose(); r.floor.dispose(); this.rings.delete(id); }
    }

    clear () { for (const r of this.rings.values()) { this.scene.remove(r.g); r.edge.dispose(); r.floor.dispose(); } this.rings.clear(); }
}
