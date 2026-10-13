// The hotbar: eight slots you fill yourself. Until you pick something, it shows your pick, your weapon and the
// best food and potions you carry (the old behaviour), so nobody has to set it up. Once you pin an item, the
// bar is yours: it is saved with you and follows you to any device.
//
// What a slot does when you select it (keys 1-8, mouse wheel or a click) is decided by what is in it:
//   gear (pick, sword, armor, charm) .... equips it (a quick swap)
//   food and potions .................... uses it (the wheel only selects, so scrolling never drinks)
//   seeds ............................... the next E on a garden bed plants that seed
//   pods ................................ the next T throws that pod
// Anything else can sit there as a reminder of what you are collecting.

import { POD_POWER } from '../data/creatures';
import { ITEM_ORDER, ITEMS, ItemId } from '../data/items';
import { PAL } from '../palette';
import * as quests from './quests';
import { countOf } from './stats';
import type { Cmd, PlayerS } from './types';
import type { Sim } from './sim';

export const HOT_SLOTS = 8;

type HotKind = 'gear' | 'use' | 'seed' | 'pod' | 'item';

export function hotKind (id: ItemId): HotKind {
    const d = ITEMS[id];
    if (d.gear) return 'gear';
    if (d.food || d.heal || d.buff) return 'use';
    if (d.kind === 'seed') return 'seed';
    if (id in POD_POWER) return 'pod';
    return 'item';
}

/** Food and potions worth showing, best first: potions, then buffs, then the most filling food. */
export function consumables (p: Pick<PlayerS, 'inv'>): ItemId[] {
    const rank = (id: ItemId) => (ITEMS[id].kind === 'potion' ? 0 : ITEMS[id].buff ? 1 : 2);
    return ITEM_ORDER.filter((id) => countOf(p, id) > 0 && (ITEMS[id].food || ITEMS[id].heal || ITEMS[id].buff) && ITEMS[id].kind !== 'seed')
        .sort((a, b) => rank(a) - rank(b) || (ITEMS[b].food ?? 0) - (ITEMS[a].food ?? 0))
        .slice(0, HOT_SLOTS - 2);
}

/** What an unset hotbar shows: the equipped pick and weapon, then food and potions. */
export function defaultHotbar (p: Pick<PlayerS, 'inv' | 'equip'>): (ItemId | null)[] {
    const out: (ItemId | null)[] = [p.equip.tool ?? null, p.equip.weapon ?? null, ...consumables(p)];
    while (out.length < HOT_SLOTS) out.push(null);
    return out.slice(0, HOT_SLOTS);
}

/** The eight items on a player's hotbar (null = empty slot). */
export function hotbarOf (p: Pick<PlayerS, 'inv' | 'equip'> & { hot?: (ItemId | null)[] }): (ItemId | null)[] {
    if (!p.hot) return defaultHotbar(p);
    const out = p.hot.slice(0, HOT_SLOTS).map((id) => (id && Object.prototype.hasOwnProperty.call(ITEMS, id) ? id : null));
    while (out.length < HOT_SLOTS) out.push(null);
    return out;
}

/** Is this item something the player has (in their pockets or on their body)? */
const owns = (p: PlayerS, id: ItemId) => countOf(p, id) > 0 || Object.values(p.equip).includes(id);

/** Pin an item to a slot, or clear the slot with null. An item lives in one slot at a time: pinning it elsewhere swaps. */
export function cmdHot (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'hot' }>) {
    const slot = c.slot;
    if (!Number.isInteger(slot) || slot < 0 || slot >= HOT_SLOTS) return;
    let item: ItemId | null = null;
    if (c.item !== null) {
        if (typeof c.item !== 'string' || !Object.prototype.hasOwnProperty.call(ITEMS, c.item)) return;
        item = c.item;
        if (!owns(p, item)) { sim.deny(p, 'You do not have that'); return; }
    }
    const bar = hotbarOf(p).slice();                 // the first time, this freezes the default layout so it can be edited
    if (item) {
        const old = bar.indexOf(item);
        if (old >= 0 && old !== slot) bar[old] = bar[slot];
    }
    bar[slot] = item;
    p.hot = bar;
    if (item) quests.count(p, 'pin');       // (the tutorial counts it)
    sim.fx(item ? 'equip' : 'deny', p.x, p.y - 10, p.id);
}

// ── refilling a slot that ran dry ───────────────────────────────────────────
const timers = new WeakMap<Sim, number>();

/** The next thing of the same kind to stand in for a pinned food, potion or seed that has run out. */
function stand_in (p: PlayerS, gone: ItemId, bar: (ItemId | null)[]): ItemId | null {
    const kind = hotKind(gone);
    if (kind === 'use') return consumables(p).find((id) => !bar.includes(id)) ?? null;
    if (kind === 'seed') return ITEM_ORDER.find((id) => countOf(p, id) > 0 && hotKind(id) === 'seed' && !bar.includes(id)) ?? null;
    return null;
}

/** Once a second: a pinned food, potion or seed you have used up is replaced by the next one you carry, so the slot is never dead when you reach for it. */
export function step (sim: Sim, dt: number) {
    const t = (timers.get(sim) ?? 0) + dt;
    if (t < 1) { timers.set(sim, t); return; }
    timers.set(sim, 0);
    for (const p of sim.online) {
        if (!p.hot) continue;
        for (let i = 0; i < HOT_SLOTS; i++) {
            const id = p.hot[i];
            if (!id || countOf(p, id) > 0 || Object.values(p.equip).includes(id)) continue;
            const kind = hotKind(id);
            if (kind !== 'use' && kind !== 'seed') continue;
            const next = stand_in(p, id, p.hot);
            if (!next) continue;
            p.hot[i] = next;
            sim.float(p.x, p.y - 30, `${ITEMS[id].name} ran out: ${ITEMS[next].name} is on slot ${i + 1}`, PAL.pebble, p.id, 'hotfill');
        }
    }
}
