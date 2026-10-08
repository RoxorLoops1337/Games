// Why a building can or cannot go on a tile, in words. It mirrors the rules in sim/economy.ts `tryBuild` (reach, land,
// what is in the way, the farmer standing there) so the client can colour the ghost and say what is wrong before a
// command is sent. The server still decides: this is only the explanation. Pure, so a test can drive it.

import { TILE, TUNING } from './config';
import { BUILDINGS, BuildingKind, isBeltLike } from './data/buildings';
import { NODES } from './data/nodes';
import type { Ent } from './sim/types';
import type { World } from './world';

export interface PlaceEnv {
    world: World;
    /** The entity with this id (a building, a node…), if the client knows it. */
    ent: (id: number) => Ent | undefined;
    /** Where the farmer stands (pixels): reach is measured from here, and a solid piece cannot go on their feet. */
    x: number;
    y: number;
}

/** Why this tile is not land you can build on. */
export function landWhy (world: World, tx: number, ty: number): string {
    const plot = world.inBounds(tx, ty) ? world.plotAt(tx, ty) : null;
    if (!plot) return 'Open sea: nothing to build on';
    if (!plot.owned && !plot.dread) return world.isPurchasable(plot) ? 'Not your land yet: buy this plot first' : 'Not your land yet';
    return 'Water: build on the land';
}

/** What is on a tile that blocks it, as "The Chest is in the way". */
function inWay (env: PlaceEnv, id: number): string {
    if (id === -1) return 'A boulder is in the way';
    const e = env.ent(id);
    if (e?.k === 'bld') return `The ${BUILDINGS[e.kind].name} is in the way`;
    if (e?.k === 'node') return `The ${NODES[e.kind].name} is in the way`;
    return 'Something is in the way';
}

/**
 * Null when `kind` can go at (tx, ty); else the reason. `range` is how many tiles from the farmer it may be: the build
 * reach by default, a number for another limit (blueprints use their own) or null to leave reach out.
 */
export function placeWhy (env: PlaceEnv, kind: BuildingKind, tx: number, ty: number, range?: number | null): string | null {
    const { world } = env;
    const def = BUILDINGS[kind];
    const [w, h] = def.size;
    if (world.riftAtTile(tx, ty) >= 0) return "Can't build on an expedition island";
    if (range !== null) {
        const ptx = Math.floor(env.x / TILE), pty = Math.floor(env.y / TILE);
        if (Math.max(Math.abs(tx - ptx), Math.abs(ty - pty)) > (range ?? TUNING.buildRange + Math.max(w, h))) return 'Too far: step closer';
    }
    if (def.roof) {
        if (!world.isLand(tx, ty)) return landWhy(world, tx, ty);
        return world.roofAt(tx, ty) === 0 ? null : 'There is a roof here already';
    }
    if (def.floor) {
        if (!world.isLand(tx, ty)) return landWhy(world, tx, ty);
        if (world.occAt(tx, ty) !== 0) return inWay(env, world.occAt(tx, ty));
        return world.floorAt(tx, ty) === 0 ? null : 'There is a floor here already';
    }
    // a doorway may go straight into a wall
    if (def.gate && w === 1 && h === 1) { const o = env.ent(world.occAt(tx, ty)); if (o?.k === 'bld' && BUILDINGS[o.kind].wall) return null; }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!world.isLand(tx + x, ty + y)) return landWhy(world, tx + x, ty + y);
            const occ = world.occAt(tx + x, ty + y) || world.softAt(tx + x, ty + y);
            if (occ !== 0) return inWay(env, occ);
        }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const f = env.ent(world.floorAt(tx + x, ty + y)); if (f?.k === 'bld' && isBeltLike(f.kind)) return 'A belt is in the way'; }
    if (def.solid !== false && !def.walk) {
        const blocks = env.x + 4 > tx * TILE && env.x - 4 < (tx + w) * TILE && env.y > ty * TILE && env.y - 3 < (ty + h) * TILE;
        if (blocks) return 'You are standing there: step aside';
    }
    return null;
}

/**
 * The tiles a drag passed over, from just after `a` up to and including `b`, always stepping one tile along one axis (a
 * belt or a wall never jumps diagonally). A quick flick can cover several tiles between two frames; this fills them in.
 */
export function tilesBetween (a: { tx: number; ty: number }, b: { tx: number; ty: number }): { tx: number; ty: number }[] {
    const nx = Math.abs(b.tx - a.tx), ny = Math.abs(b.ty - a.ty), sx = Math.sign(b.tx - a.tx), sy = Math.sign(b.ty - a.ty);
    const out: { tx: number; ty: number }[] = [];
    let x = a.tx, y = a.ty, ix = 0, iy = 0;
    while (ix < nx || iy < ny) {
        if ((0.5 + ix) / nx < (0.5 + iy) / ny) { x += sx; ix++; } else { y += sy; iy++; }
        out.push({ tx: x, ty: y });
    }
    return out;
}
