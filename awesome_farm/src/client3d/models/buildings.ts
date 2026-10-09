// The building model for any building kind (a placeholder block for kinds with no model yet).
import { HOME } from './b-home';
import { SPECIAL } from './b-special';
import { WORK } from './b-work';
import { type BuildingDef, type BuildingKind, BUILDINGS } from '../../shared/data/buildings';
import type { BOpts, BuildingMaker, Model } from './kit';
import { placeholder } from './placeholder';

export const TABLE: Record<string, BuildingMaker | undefined> = { ...WORK, ...HOME, ...SPECIAL };
export const BUILDING_MODELS = Object.keys(TABLE);
export function buildingModel(kind: string, o: BOpts): Model {
    const f = TABLE[kind];
    if (f) return f(o);
    const d = BUILDINGS[kind as BuildingKind] as BuildingDef | undefined;

    return placeholder(d?.size[0] ?? 1, d?.size[1] ?? 1);
}
