// Jobs, sorting chests: a sorter puts like with like (see sortPlan), carrying a stack at a time (jobs-carry).

import { BUILDINGS } from '../data/buildings';
import { takes } from '../data/filters';
import type { Pet } from '../data/creatures';
import { ITEMS, type ItemId } from '../data/items';
import { CARRY, errandStep, loadN, startErrand } from './jobs-carry';
import { setStatus, type Site } from './jobs-site';
import { invSum } from './machines';
import type { Sim } from './sim';
import type { BuildE, CritE } from './types';

// ── sorting chests ──────────────────────────────────────────────────────────
// A sorter puts like with like. Every kind of thing (what the item catalogue calls its kind: materials, food, seeds, potions,
// gear…) gets a home chest: the one holding most of it, and each chest keeps just one kind where it can. Whatever lies in the
// wrong chest is carried to its kind's home, a stack at a time.
const catOf = (item: string): string => ITEMS[item as ItemId]?.kind ?? 'misc';

export function sortPlan (stores: BuildE[]): { from: BuildE; to: BuildE; item: ItemId; n: number } | null {
    if (stores.length < 2) return null;
    // chests set to take only some things (dedicated chests) are the fixed home of exactly those things; the open ones sort the rest by kind
    const dedicated = stores.filter((s) => s.fl?.length), open = stores.filter((s) => !s.fl?.length);
    const held = new Map<string, Map<number, number>>();
    for (const s of open) {
        for (const [item, n] of Object.entries(s.inv ?? {}) as [ItemId, number][]) {
            if (!(n > 0) || !ITEMS[item]) continue;
            const cat = catOf(item), m = held.get(cat) ?? new Map<number, number>();
            m.set(s.id, (m.get(s.id) ?? 0) + n);
            held.set(cat, m);
        }
    }
    const pairs: { cat: string; id: number; n: number }[] = [];
    for (const [cat, m] of held) for (const [id, n] of m) pairs.push({ cat, id, n });
    pairs.sort((a, b) => b.n - a.n || a.id - b.id || a.cat.localeCompare(b.cat));
    const home = new Map<string, number>(), used = new Set<number>();
    for (const p of pairs) if (!home.has(p.cat) && !used.has(p.id)) { home.set(p.cat, p.id); used.add(p.id); }
    // a kind with no chest of its own takes a chest nobody has claimed (an empty one will do), the one with the most room first
    const total = (cat: string) => [...(held.get(cat)?.values() ?? [])].reduce((a, b) => a + b, 0);
    for (const cat of [...held.keys()].sort((a, b) => total(b) - total(a) || a.localeCompare(b))) {
        if (home.has(cat)) continue;
        const free = open.filter((s) => !used.has(s.id)).sort((a, b) => invSum(a.inv) - invSum(b.inv) || a.id - b.id)[0];
        if (free) { home.set(cat, free.id); used.add(free.id); }
    }
    for (const p of pairs) if (!home.has(p.cat)) home.set(p.cat, p.id);            // more kinds than chests: the biggest holder keeps the rest
    const byId = new Map(stores.map((s) => [s.id, s] as const));
    const roomOf = (s: BuildE) => (BUILDINGS[s.kind].storage ?? 0) - invSum(s.inv);
    let best: { from: BuildE; to: BuildE; item: ItemId; n: number } | null = null;
    let bestScore = 0;
    for (const s of stores) {
        for (const [item, n] of Object.entries(s.inv ?? {}) as [ItemId, number][]) {
            if (!(n > 0) || !ITEMS[item]) continue;
            if (s.fl?.length && takes(s.fl, item)) continue;                          // in the dedicated chest it belongs in
            // somewhere set to take it on purpose, else the home of its kind among the open chests (or any open chest with room)
            let to: BuildE | undefined = dedicated.filter((d) => d.id !== s.id && takes(d.fl, item) && roomOf(d) > 0).sort((a, b) => a.id - b.id)[0];
            if (!to) {
                to = byId.get(home.get(catOf(item)) ?? -1);
                if (to?.fl?.length) to = undefined;
                if ((!to || roomOf(to) <= 0) && s.fl?.length) to = open.filter((o) => roomOf(o) > 0).sort((a, b) => a.id - b.id)[0];
            }
            if (!to || to.id === s.id) continue;
            const room = roomOf(to);
            if (room <= 0) continue;
            const score = n * 1000 - s.id;
            if (score > bestScore) { bestScore = score; best = { from: s, to, item, n: Math.min(n, room, CARRY) }; }
        }
    }
    return best;
}

/** One tick of a sorter. Returns true while it is busy walking or carrying. */
export function sortStep (sim: Sim, c: CritE, site: Site, pet: Pet, dt: number): boolean {
    if (c.er !== undefined && errandStep(sim, c, site, pet, dt)) return true;
    c.js = (c.js ?? 0) - dt;
    if (c.js > 0) return false;
    if (loadN(c) > 0) {
        // something is still in its hands (the chest it was heading for filled up): put it away first
        if (startErrand(sim, c, site, 0)) { setStatus(sim, c, site.owner, pet, 'work'); errandStep(sim, c, site, pet, dt); return true; }
        setStatus(sim, c, site.owner, pet, 'nostore'); c.js = 2.5;
        return false;
    }
    const stores = site.stores!();
    if (!stores.length) { setStatus(sim, c, site.owner, pet, 'nostore'); c.js = 2.5; return false; }
    const plan = sortPlan(stores);
    if (!plan) { setStatus(sim, c, site.owner, pet, 'tidy'); c.js = 2.5; return false; }
    c.er = plan.from.id; c.ek = 2; c.ei = plan.item; c.en = plan.n; c.et = plan.to.id;
    c.jt = undefined;
    setStatus(sim, c, site.owner, pet, 'work');
    errandStep(sim, c, site, pet, dt);
    return true;
}
