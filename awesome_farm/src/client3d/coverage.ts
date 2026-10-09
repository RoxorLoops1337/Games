// Which of the game's things the 3D view draws with a model of its own. Every kind in every family must have one: tests/view3d.test.ts
// fails for any building, node, monster, creature, item, projectile, crop stage, boss attack pattern, creature activity, farmer look
// choice, piece of gear or co-op status that has none (so new content cannot slip into 3D as a grey box, a plain glowing gem or a borrowed shape).

import { BUILDINGS } from '../shared/data/buildings';
import { ACTIVITY, SPECIES_LIST } from '../shared/data/creatures';
import { COOP_PATTERNS } from '../shared/data/costatus';
import { ITEMS } from '../shared/data/items';
import { BODY_TONES, EYES, MOUTHS, SCARF_COLORS, SPROUTS } from '../shared/data/look';
import { MOBS, PROJ } from '../shared/data/mobs';
import { NODES } from '../shared/data/nodes';
import { RIFT_TIERS } from '../shared/data/rift';
import { TABLE as BUILDING_MODELS } from './models/buildings';
import { SPECS as CRITTER_MODELS } from './models/critters';
import { WORK_PROPS } from './models/critters-work';
import { SPECS as CROP_MODELS, TINT as SPROUT_TINTS } from './models/crops';
import { SPECS as DROP_MODELS } from './models/drops';
import { ARMOURS, CHARMS, HEADS, PACKS } from './models/farmer-gear';
import { BOWS, toolPart } from './models/farmer-tools';
import { PATTERN_POSES } from './models/mobs-attack';
import { MOB_MODEL_KINDS } from './models/mobs';
import { BUILD as NODE_MODELS } from './models/nodes';
import { SHOTS } from './models/shots';
import { STATUS_MODELS } from './models/costatus';

export type Family = 'building' | 'node' | 'monster' | 'creature' | 'item' | 'projectile' | 'crop' | 'pattern' | 'activity' | 'look' | 'gear' | 'status';
export const FAMILIES: readonly Family[] = ['building', 'node', 'monster', 'creature', 'item', 'projectile', 'crop', 'pattern', 'activity', 'look', 'gear', 'status'];

/** Every boss attack pattern the data uses (bosses' and expedition guardians' phases, their lone stand-ins, the co-op patterns). */
function patternsInData (): string[] {
    const out = new Set<string>(Object.keys(COOP_PATTERNS));
    const phases = [...Object.values(MOBS).flatMap((m) => (m as { boss?: { phases: { patterns: string[]; alone?: Record<string, string> }[] } }).boss?.phases ?? []), ...RIFT_TIERS.flatMap((t) => t.phases)];
    for (const p of phases) {
        for (const id of p.patterns) out.add(id);
        for (const id of Object.values(p.alone ?? {})) if (id) out.add(id);
    }
    return [...out];
}

const gearIds = () => Object.keys(ITEMS).filter((k) => !!(ITEMS as Record<string, { gear?: unknown }>)[k].gear);
const seedIds = () => Object.keys(ITEMS).filter((k) => (ITEMS as Record<string, { kind: string }>)[k].kind === 'seed');

/** Every kind the game has, per family. Crops are `seed:stage` (0 sprout, 1 leafy, 2 ripe); looks are `part:index`. */
export function kindsOf (family: Family): string[] {
    switch (family) {
        case 'building': return Object.keys(BUILDINGS);
        case 'node': return Object.keys(NODES);
        case 'monster': return Object.keys(MOBS);
        case 'creature': return [...SPECIES_LIST];
        case 'item': return ['coin', ...Object.keys(ITEMS)];
        case 'projectile': return Object.keys(PROJ);
        case 'crop': return seedIds().flatMap((s) => [0, 1, 2].map((n) => `${s}:${n}`));
        case 'pattern': return patternsInData();
        case 'activity': return Object.keys(ACTIVITY);
        case 'look': return [
            ...BODY_TONES.map((_, i) => `body:${i}`), ...SPROUTS.map((_, i) => `sprout:${i}`), ...EYES.map((_, i) => `eyes:${i}`),
            ...MOUTHS.map((_, i) => `mouth:${i}`), ...SCARF_COLORS.map((_, i) => `scarf:${i}`),
        ];
        case 'gear': return gearIds();
        case 'status': return [...new Set(Object.values(COOP_PATTERNS).map((c) => c.status as string))];
    }
}

/** Does this kind have a model (or, for looks, a shape or colour) of its own? */
export function hasModel (family: Family, kind: string): boolean {
    switch (family) {
        case 'building': return !!BUILDING_MODELS[kind];
        case 'node': return !!NODE_MODELS[kind];
        case 'monster': return MOB_MODEL_KINDS.includes(kind);
        case 'creature': return kind in CRITTER_MODELS;
        case 'item': return !!DROP_MODELS[kind];
        case 'projectile': return kind in SHOTS;
        case 'crop': {
            const [seed, n] = kind.split(':');
            return n === '0' ? !!SPROUT_TINTS[seed] : !!CROP_MODELS[seed]?.[Number(n) - 1];
        }
        case 'pattern': return kind in PATTERN_POSES;
        case 'activity': return kind in WORK_PROPS;
        case 'look': return true;           // every choice is drawn by the farmer model; tests/view3d.test.ts checks each one looks different
        case 'gear': {
            const g = (ITEMS as Record<string, { gear?: { slot: string; wtype?: string } }>)[kind]?.gear;
            if (!g) return false;
            switch (g.slot) {
                case 'head': return !!HEADS[kind];
                case 'body': return !!ARMOURS[kind];
                case 'bag': return !!PACKS[kind];
                case 'charm': return !!CHARMS[kind];
                default: return (g.wtype !== 'bow' || !!BOWS[kind]) && !!toolPart(kind);
            }
        }
        case 'status': return kind in STATUS_MODELS;
    }
}

/** The kinds of a family with no model (the test wants this empty for every family). */
export function missing (family: Family): string[] {
    return kindsOf(family).filter((k) => !hasModel(family, k));
}
