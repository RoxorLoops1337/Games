// Which of the game's things the 3D view draws with a model of their own, and which stand in as a plain placeholder for now.
// A placeholder is a choice written down here, never an accident: tests/view3d.test.ts fails for any building, node, monster,
// creature or item that has neither a model nor a line in PLACEHOLDERS (so new content cannot slip into 3D as a grey box unseen).

import { BUILDINGS } from '../shared/data/buildings';
import { SPECIES_LIST } from '../shared/data/creatures';
import { ITEMS } from '../shared/data/items';
import { MOBS } from '../shared/data/mobs';
import { NODES } from '../shared/data/nodes';
import { TABLE as BUILDING_MODELS } from './models/buildings';
import { SPECS as CRITTER_MODELS } from './models/critters';
import { SPECS as DROP_MODELS } from './models/drops';
import { MOB_MODEL_KINDS } from './models/mobs';
import { BUILD as NODE_MODELS } from './models/nodes';

export type Family = 'building' | 'node' | 'monster' | 'creature' | 'item';

/** The things drawn as a placeholder on purpose, until someone models them (each is a work item: see CLAUDE.md, "3D view"). */
export const PLACEHOLDERS: Record<Family, readonly string[]> = {
    building: ['chute', 'mailbox', 'weathervane'],      // a block of the right footprint
    node: ['titan_oak', 'titan_rock'],                 // drawn as the plain rock
    monster: [],
    creature: [],
    item: [],
};

/** Every kind the game has, per family. */
export function kindsOf (family: Family): string[] {
    switch (family) {
        case 'building': return Object.keys(BUILDINGS);
        case 'node': return Object.keys(NODES);
        case 'monster': return Object.keys(MOBS);
        case 'creature': return [...SPECIES_LIST];
        case 'item': return ['coin', ...Object.keys(ITEMS)];
    }
}

/** Does this kind have a model of its own? */
export function hasModel (family: Family, kind: string): boolean {
    switch (family) {
        case 'building': return !!BUILDING_MODELS[kind];
        case 'node': return !!NODE_MODELS[kind];
        case 'monster': return MOB_MODEL_KINDS.includes(kind);
        case 'creature': return kind in CRITTER_MODELS;
        case 'item': return !!DROP_MODELS[kind];
    }
}

/** How each kind of a family is drawn in 3D: its own model, a written-down placeholder, or (a bug the test catches) neither. */
export function coverage (family: Family): Record<string, 'model' | 'placeholder' | 'missing'> {
    const out: Record<string, 'model' | 'placeholder' | 'missing'> = {};
    for (const k of kindsOf(family)) out[k] = hasModel(family, k) ? 'model' : PLACEHOLDERS[family].includes(k) ? 'placeholder' : 'missing';
    return out;
}
