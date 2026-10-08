// The client's copy of what stands on each tile: nodes and solid buildings in `occ`, floors, roofs and walkable pieces in
// their own layers. Kept in step with Sim.occupy/vacate so the placement rules and the walls' frames read the same world.

import { BUILDINGS } from '../../shared/data/buildings';
import type { Ent } from '../../shared/sim/types';
import type { World } from '../../shared/world';

export function occupy (world: World, e: Ent) {
    if (e.k === 'node') world.setOcc(e.tx, e.ty, e.id);
    else if (e.k === 'bld') {
        const def = BUILDINGS[e.kind], [w, h] = def.size;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (def.floor) world.setFloor(e.tx + x, e.ty + y, e.id);
            else if (def.roof) world.setRoof(e.tx + x, e.ty + y, e.id);
            else if (def.walk) world.setSoft(e.tx + x, e.ty + y, e.id);
            else if (def.solid !== false) world.setOcc(e.tx + x, e.ty + y, e.id);
        }
    }
}

/** Only the tiles this entity still holds are cleared (another piece may have taken one meanwhile). */
export function vacate (world: World, e: Ent) {
    if (e.k === 'node') { if (world.occAt(e.tx, e.ty) === e.id) world.setOcc(e.tx, e.ty, 0); }
    else if (e.k === 'bld') {
        const def = BUILDINGS[e.kind], [w, h] = def.size;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (def.floor) world.setFloor(e.tx + x, e.ty + y, 0);
            else if (def.roof) { if (world.roofAt(e.tx + x, e.ty + y) === e.id) world.setRoof(e.tx + x, e.ty + y, 0); }
            else if (def.walk) { if (world.softAt(e.tx + x, e.ty + y) === e.id) world.setSoft(e.tx + x, e.ty + y, 0); }
            else if (world.occAt(e.tx + x, e.ty + y) === e.id) world.setOcc(e.tx + x, e.ty + y, 0);
        }
    }
}
