// Tooltip content for items, skills, buildings and recipes.

import { BUILDINGS, BuildingDef, STATION_NAMES } from '../../shared/data/buildings';
import { SIZES, TAG_INFO, type RelicDef } from '../../shared/data/relics';
import { Cost, ITEMS, ItemId, RARITY_NAMES, Res, resName, SLOT_NAMES } from '../../shared/data/items';
import type { Recipe } from '../../shared/data/recipes';
import { UNLOCK_INFO } from '../../shared/data/skills';
import { BUFFS, modLine, StatKey } from '../../shared/data/stats';
import { PAL } from '../../shared/palette';
import { hasUnlock, have, scaledCost } from '../../shared/sim/stats';
import type { PlayerS } from '../../shared/sim/types';
import { RARITY_TEXT } from './px';
import type { TipData, TipLine } from './kit';

const KIND_NAMES: Record<string, string> = { material: 'Material', food: 'Food', seed: 'Seed', potion: 'Potion', gear: 'Gear', misc: 'Item' };

export function itemTip (id: ItemId, o: { count?: number; sellMul?: number; foot?: string } = {}): TipData {
    const d = ITEMS[id];
    const lines: TipLine[] = [{ t: d.desc, c: PAL.pebble }];
    const g = d.gear;
    if (g) {
        if (g.power) lines.push({ t: `Mining power ${g.power}`, c: PAL.lime });
        if (g.dmg) lines.push({ t: `Damage ${g.dmg}  ·  ${g.wtype}  ·  reach ${g.reach}`, c: PAL.lime });
        for (const [k, v] of Object.entries(g.mods ?? {}) as [StatKey, number][]) lines.push({ t: modLine(k, v), c: v < 0 && (k === 'moveSpeed') ? PAL.berry : PAL.lime });
    }
    const rl = (d as { relic?: RelicDef }).relic;
    if (rl) lines.push({ t: `${TAG_INFO[rl.tag].name} relic  ·  ${SIZES[rl.size].join(' x ')} cells  ·  gives ${TAG_INFO[rl.tag].word}`, c: TAG_INFO[rl.tag].color }, { t: 'Lay it in the Relic Satchel (G). Relics of one kind that touch give more; touching kinds make combos.', c: PAL.pebble });
    if (d.food) lines.push({ t: `Restores ${d.food} energy`, c: PAL.gold });
    if (d.heal) lines.push({ t: `Restores ${d.heal} ♥`, c: PAL.blossom });
    if (d.buff) {
        const b = BUFFS[d.buff.id];
        lines.push({ t: `${b.name} for ${d.buff.secs}s: ${Object.entries(b.mods).map(([k, v]) => modLine(k as StatKey, v as number)).join(', ')}`, c: PAL.foam });
    }
    if (d.sell > 0) lines.push({ t: `Sells for ${Math.round(d.sell * (o.sellMul ?? 1) * 10) / 10} coins`, c: PAL.gold });
    const sub = g ? `${SLOT_NAMES[g.slot]} · ${RARITY_NAMES[d.rarity]}` : `${KIND_NAMES[d.kind]} · ${RARITY_NAMES[d.rarity]}`;
    return {
        title: d.name + (o.count && o.count > 1 ? `  ×${o.count}` : ''), color: RARITY_TEXT[d.rarity], sub, icon: `i_${id}`,
        lines, foot: o.foot ?? (g ? 'Click to equip' : d.food || d.heal || d.buff ? 'Click to use' : undefined),
    };
}

function costLines (p: PlayerS, cost: Cost): TipLine[] {
    return (Object.entries(cost) as [Res, number][]).map(([r, n]) => {
        const ok = have(p, r) >= n;
        return { t: `${ok ? '✓' : '✗'} ${n} ${resName(r)}  (${have(p, r)})`, c: ok ? PAL.lime : PAL.berry };
    });
}

/** The picture a menu shows for a building: walls draw as a short straight run rather than a lone post. */
export const buildingIcon = (def: BuildingDef) => (def.wall ? `${def.tex}_icon` : def.tex);

export function buildingTip (p: PlayerS, kind: keyof typeof BUILDINGS): TipData {
    const def: BuildingDef = BUILDINGS[kind];
    const lines: TipLine[] = [{ t: def.desc, c: PAL.pebble }];
    const locked = !hasUnlock(p, def.req);
    if (locked && def.req) lines.push({ t: `Locked: ${UNLOCK_INFO[def.req] ?? def.req}`, c: PAL.berry });
    lines.push({ t: 'Cost:', c: PAL.cream }, ...costLines(p, scaledCost(p, def.cost)));
    if (def.station) lines.push({ t: `Craft here: ${STATION_NAMES[def.station]} recipes`, c: PAL.foam });
    return { title: def.name, color: locked ? PAL.pebble : PAL.cream, sub: `${def.size[0]}×${def.size[1]} tiles`, icon: buildingIcon(def), lines };
}

export function recipeTip (p: PlayerS, r: Recipe): TipData {
    const t = itemTip(r.out);
    const lines = [...(t.lines ?? [])];
    lines.push({ t: 'Needs:', c: PAL.cream }, ...costLines(p, r.in));
    if (r.req && !hasUnlock(p, r.req)) lines.push({ t: `Locked: ${UNLOCK_INFO[r.req] ?? r.req}`, c: PAL.berry });
    return { ...t, title: `${r.n > 1 ? r.n + '× ' : ''}${t.title}`, lines, foot: undefined };
}
