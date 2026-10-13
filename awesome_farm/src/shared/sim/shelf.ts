// The Blueprint Shelf: a farmer publishes a blueprint from their book; anyone can copy it into their own (the client does that
// from what the building carries, so there is no command for it). Only the publisher takes theirs down. The pieces are checked
// like a paste would be: known buildings, whole tiles, a sane size.

import { BLUEPRINT_MAX } from '../blueprint';
import { BUILDINGS, type BuildingKind } from '../data/buildings';
import { PAL } from '../palette';
import type { Sim } from './sim';
import type { BlueprintItem, BuildE, Cmd, PlayerS } from './types';

export const SHELF_MAX = 8;
export const SHELF_REACH = 120;
export const NAME_MAX = 24;

/** Clean a published layout, or null when it is not one. */
export function cleanItems (raw: unknown): BlueprintItem[] | null {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > BLUEPRINT_MAX) return null;
    const out: BlueprintItem[] = [];
    for (const it of raw as Partial<BlueprintItem>[]) {
        if (!it || typeof it.kind !== 'string' || !Object.prototype.hasOwnProperty.call(BUILDINGS, it.kind)) return null;
        const def = BUILDINGS[it.kind as BuildingKind];
        if (def.hidden || it.kind === 'coffer' || it.kind === 'board' || it.kind === 'shelf') return null;      // (shared boxes are not copied around)
        const { dx, dy, rot } = it;
        if (!Number.isInteger(dx) || !Number.isInteger(dy) || !Number.isInteger(rot) || Math.abs(dx!) > 64 || Math.abs(dy!) > 64 || rot! < 0 || rot! > 3) return null;
        out.push({ kind: it.kind as BuildingKind, dx: dx!, dy: dy!, rot: rot!, ...(typeof it.flt === 'string' ? { flt: it.flt } : {}), ...(typeof it.sel === 'string' ? { sel: it.sel.slice(0, 40) } : {}) });
    }
    return out;
}

export function cmdShelf (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'shelf' }>) {
    const b = sim.s.ents[c.id];
    if (b?.k !== 'bld' || b.kind !== 'shelf' || !sim.inReach(p, b, SHELF_REACH)) { sim.deny(p, 'Stand next to the shelf'); return; }
    const list = (b as BuildE).bps ??= [];
    if (c.op === 'publish') {
        const items = cleanItems(c.items);
        if (!items) { sim.deny(p, 'That blueprint cannot be shared'); return; }
        const mine = list.filter((x) => x.by === p.id).length;
        if (list.length >= SHELF_MAX) { sim.deny(p, 'The shelf is full'); return; }
        if (mine >= 3) { sim.deny(p, 'You have 3 on this shelf already: take one down first'); return; }
        const name = String(c.name ?? 'Blueprint').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, NAME_MAX) || 'Blueprint';
        const sid = list.reduce((m, x) => Math.max(m, x.sid), 0) + 1;
        list.push({ sid, by: p.id, who: p.name, name, items });
        const at = sim.center(b);
        sim.float(at.x, at.y - 14, `Shared ${name}`, PAL.gold, p.id);
    } else if (c.op === 'remove') {
        const i = list.findIndex((x) => x.sid === c.sid && x.by === p.id);
        if (i < 0) return;
        list.splice(i, 1);
    } else return;
    sim.touch(b);
}
