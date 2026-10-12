// Moving things in bulk without the fear of moving the wrong thing. Three tools, all server-checked:
//   fav ........ star an item: the bulk tools below never touch it (it can still be moved by hand or sold)
//   stash ...... Quick stack: put what you carry into the chests within a few tiles that already hold that kind of thing
//               (or are labelled to take it), nearest chest first; stars and pinned hotbar items stay with you
//   chest ...... Put all / Take all at one open chest (put all respects the label and the stars)

import { TILE } from '../config';
import { BUILDINGS } from '../data/buildings';
import { takes } from '../data/filters';
import { ITEM_ORDER, ITEMS, type ItemId } from '../data/items';
import { PAL } from '../palette';
import { dist } from '../geom';
import { invDrop, invHas, invPut, invSum } from './machines';
import type { Sim } from './sim';
import { addItem, countOf, takeItem } from './stats';
import type { BuildE, Cmd, PlayerS } from './types';
import { storageOf } from './uber';

/** How far (tiles) Quick stack reaches. */
export const STASH_TILES = 7;
export const MAX_FAVS = 40;

/** Things the bulk tools leave alone: starred, or pinned to your hotbar. */
export function guarded (p: PlayerS): Set<ItemId> {
    const s = new Set<ItemId>(p.fav ?? []);
    for (const h of p.hot ?? []) if (h) s.add(h);
    return s;
}

const isChest = (b: BuildE) => { const d = BUILDINGS[b.kind]; return !!d.storage && !d.pets && !d.grave; };

/** A little stream of the kinds that moved, flying between the farmer and the chest (at most a handful per command, one after another). */
function fly (sim: Sim, p: PlayerS, b: BuildE, items: ItemId[], dir: 'put' | 'take', k: { n: number }) {
    const c = sim.center(b);
    for (const item of items) {
        if (k.n >= 10) return;
        const d = k.n * 0.07;
        k.n++;
        sim.events.push(dir === 'put'
            ? { e: 'fly', to: p.id, item, x0: p.x, y0: p.y - 10, x1: c.x, y1: c.y - 8, d }
            : { e: 'fly', to: p.id, item, x0: c.x, y0: c.y - 8, x1: p.x, y1: p.y - 10, d });
    }
}

export function cmdInv (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'inv' }>) {
    if (sim.s.paused || p.downed > 0) return;
    if (c.op === 'fav') return fav(sim, p, c.item);
    if (c.op === 'stash') return stash(sim, p);
    if (c.op === 'chest') return chestAll(sim, p, c.id, c.dir);
}

function fav (sim: Sim, p: PlayerS, item: ItemId) {
    if (!ITEMS[item]) return;
    const list = (p.fav ??= []);
    const at = list.indexOf(item);
    if (at >= 0) { list.splice(at, 1); if (!list.length) delete p.fav; }
    else if (list.length < MAX_FAVS) list.push(item);
    else sim.deny(p, 'Too many starred items');
}

function stash (sim: Sim, p: PlayerS) {
    const keep = guarded(p);
    const near = sim.buildings().filter((b) => isChest(b) && dist(sim.center(b).x, sim.center(b).y, p.x, p.y) <= STASH_TILES * TILE)
        .sort((a, b) => dist(sim.center(a).x, sim.center(a).y, p.x, p.y) - dist(sim.center(b).x, sim.center(b).y, p.x, p.y));
    if (!near.length) { sim.deny(p, 'No chest within reach'); return; }
    let kinds = 0, total = 0, full = false;
    const used = new Set<number>(), flown = { n: 0 };
    for (const id of ITEM_ORDER) {
        if (keep.has(id) || ITEMS[id].gear) continue;
        let left = countOf(p, id), moved = 0;
        for (const b of near) {
            if (left <= 0) break;
            const named = !!b.fl?.length && takes(b.fl, id);
            if (!takes(b.fl, id) || !(invHas(b.inv, id) > 0 || named)) continue;
            const room = storageOf(b) - invSum(b.inv);
            if (room <= 0) { full = true; continue; }
            const n = Math.min(left, room);
            takeItem(p, id, n);
            invPut((b.inv ??= {}), id, n);
            b.by = p.id;
            sim.touch(b);
            used.add(b.id);
            fly(sim, p, b, [id], 'put', flown);
            left -= n; moved += n;
        }
        if (moved) { kinds++; total += moved; }
    }
    if (!total) { sim.deny(p, full ? 'The chests are full' : 'Nothing to stack: no chest here holds anything like what you carry'); return; }
    for (const id of used) { const b = sim.s.ents[id] as BuildE; sim.fx('load', sim.center(b).x, sim.center(b).y, p.id); }
    sim.float(p.x, p.y - 30, `Stacked ${total} (${kinds} kind${kinds === 1 ? '' : 's'}) into ${used.size} chest${used.size === 1 ? '' : 's'}${full ? ', some full' : ''}`, PAL.lime, p.id, 'aff');
}

function chestAll (sim: Sim, p: PlayerS, id: number, dir: 'put' | 'take') {
    const b = sim.reachableBuilding(p, id);
    if (!b) return;
    const def = BUILDINGS[b.kind];
    if (!def.storage && !def.grave) return;
    let kinds = 0, total = 0, blocked = '';
    const flown = { n: 0 };
    if (dir === 'put') {
        if (def.grave || !isChest(b)) { sim.deny(p, 'Nothing goes in here'); return; }
        const keep = guarded(p);
        for (const item of ITEM_ORDER) {
            const have = countOf(p, item);
            if (have <= 0 || keep.has(item) || ITEMS[item].gear || !takes(b.fl, item)) continue;
            const n = Math.min(have, storageOf(b) - invSum(b.inv));
            if (n <= 0) { blocked = 'The chest is full'; break; }
            takeItem(p, item, n);
            invPut((b.inv ??= {}), item, n);
            fly(sim, p, b, [item], 'put', flown);
            kinds++; total += n;
        }
        if (total) { b.by = p.id; sim.touch(b); sim.fx('load', sim.center(b).x, sim.center(b).y, p.id); }
    } else {
        for (const item of ITEM_ORDER) {
            const have = invHas(b.inv, item);
            if (have <= 0) continue;
            const n = addItem(p, item, have);
            if (n <= 0) { blocked = 'Your pockets are full'; continue; }
            invDrop(b.inv!, item, n);
            fly(sim, p, b, [item], 'take', flown);
            kinds++; total += n;
        }
        if (total) { sim.touch(b); sim.fx('collect', sim.center(b).x, sim.center(b).y, p.id); }
    }
    if (!total) { sim.deny(p, blocked || (dir === 'put' ? 'Nothing to put away' : 'It is empty')); return; }
    sim.float(p.x, p.y - 30, `${dir === 'put' ? 'Put away' : 'Took'} ${total} (${kinds} kind${kinds === 1 ? '' : 's'})${blocked ? '. ' + blocked : ''}`, PAL.lime, p.id, 'aff');
}
