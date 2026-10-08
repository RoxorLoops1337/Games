// The potluck table: each friend brings a dish and everybody feasts on all of them at once. A Table (`BuildE.dish`) holds up to four
// different dishes (any item with a buff: food and potions), each with up to eight portions and the id of the farmer who put it
// there; only that cook can take it back. Pressing USE at the table takes one portion of each dish that would help (a buff you do not
// hold, or hold less than half of) and gives every one of those buffs at once, each marked with its cook's name (`buffs[].by`).
// A farmer can feast at one table once per cooldown (`BuildE.fc`: when each last did), so nobody drains it in a moment. Where nothing
// can be eaten (the table is bare, a feast was just had, or everything on it is no help), USE opens the table's window instead, which
// is also where dishes are set out and taken back. Everything is plain JSON and works the same alone as with friends.

import { TILE, TUNING } from '../config';
import { ITEM_ORDER, ITEMS, type ItemId } from '../data/items';
import { BUFFS } from '../data/stats';
import { BODY_Y, distToBuilding, feetTile } from '../geom';
import { PAL } from '../palette';
import * as chronicle from './chronicle';
import * as mail from './mail';
import * as quests from './quests';
import type { Sim } from './sim';
import { countOf, derived, takeItem } from './stats';
import type { BuildE, Cmd, Dish, PlayerS } from './types';

const own = (t: object, k: unknown): boolean => typeof k === 'string' && Object.prototype.hasOwnProperty.call(t, k);

/** Anything with a buff is a dish: food and potions alike. */
export const isDish = (it: unknown): it is ItemId => own(ITEMS, it) && !!ITEMS[it as ItemId].buff && own(BUFFS, ITEMS[it as ItemId].buff!.id);
/** Every dish there is, in the backpack's order. */
export const DISHES: ItemId[] = ITEM_ORDER.filter(isDish);

/** "hearty stew": how a dish is named in a sentence ("Dana's hearty stew"). */
const dishName = (it: ItemId) => ITEMS[it].name.toLowerCase();

/** The cook's name, from the farmers of the world (a farmer who is gone, or an id that is not one, is "a friend"). */
export const cookName = (players: Record<string, { name: string } | undefined>, id: string) => (own(players, id) ? players[id]?.name : undefined) || 'a friend';

/** "Dana's hearty stew, Sam's pumpkin pie": who cooked what, short enough for a banner and the prompt line (else just the cooks). */
export function feastLine (rows: { it: ItemId; by: string }[], nameOf: (id: string) => string, max = 64): string {
    const full = rows.map((r) => `${nameOf(r.by)}'s ${dishName(r.it)}`).join(', ');
    if (full.length <= max) return full;
    return `Cooked by ${chronicle.names(rows.map((r) => nameOf(r.by)))}`.slice(0, 90);
}

/** The dishes on a table that are sound (a save edited by hand, or an item whose buff was taken away, cannot upset anything). */
export const rowsOf = (b: BuildE): Dish[] => (Array.isArray(b.dish) ? b.dish.filter((d) => !!d && typeof d.n === 'number' && d.n > 0 && typeof d.by === 'string' && isDish(d.it)) : []);

/** Is the farmer close enough to set out, take back or feast? (Tiles from the edge of the table.) */
export const near = (_sim: Sim, p: PlayerS, b: BuildE) => distToBuilding(p.x, p.y - BODY_Y, b) <= TUNING.feastRange * TILE;

interface FeastPlan {
    /** The dishes this farmer would eat a portion of right now (table order, at most one per buff). */
    eat: Dish[];
    /** Seconds until this farmer may feast here again (0 when they may). */
    wait: number;
}

/**
 * What a feast would do for this farmer at this table: the cooldown, and which dishes help. A portion is eaten only for a buff you
 * do not have or hold less than `feastTopUp` of the dish's time of, so a portion is never wasted and two dishes for one buff do not
 * both go (the longer one is eaten). Pure: the sim, the prompt and the table window all read it.
 */
export function plan (p: PlayerS, b: BuildE, now: number): FeastPlan {
    const dishes = rowsOf(b);
    const last = b.fc && typeof b.fc === 'object' ? b.fc[p.id] : undefined;
    const wait = typeof last === 'number' && Number.isFinite(last) ? Math.min(TUNING.feastCooldown, Math.max(0, TUNING.feastCooldown - (now - last))) : 0;       // (never longer than the cooldown, even if a clock ran behind)
    if (wait > 0 || !dishes.length) return { eat: [], wait };
    const mul = derived(p).buffMul;
    const secs = (d: Dish) => ITEMS[d.it].buff!.secs * mul;
    const held = new Map<string, number>(p.buffs.map((x) => [x.id, x.t]));
    const picked = new Set<Dish>();
    for (const d of [...dishes].sort((x, y) => secs(y) - secs(x))) {
        const id = ITEMS[d.it].buff!.id;
        if ((held.get(id) ?? 0) >= secs(d) * TUNING.feastTopUp) continue;
        held.set(id, secs(d));
        picked.add(d);
    }
    return { eat: dishes.filter((d) => picked.has(d)), wait: 0 };
}

/** Why a feast cannot happen now, in words (null when it can). */
export function whyNotFeast (p: PlayerS, b: BuildE, now: number): string | null {
    if (!rowsOf(b).length) return 'The table is bare';
    const pl = plan(p, b, now);
    if (pl.wait > 0) return `You can feast again in ${Math.ceil(pl.wait)}s`;
    if (!pl.eat.length) return 'You are full of everything here';
    return null;
}

/** What USE would do at this table for this farmer, as the bottom line of the screen says it (after "E: "). */
export function promptOf (p: PlayerS, b: BuildE, now: number, nameOf: (id: string) => string): string {
    if (!rowsOf(b).length) return 'Set the table: put out a dish';
    const pl = plan(p, b, now);
    if (pl.eat.length) return `Feast (${feastLine(pl.eat, nameOf, 48)})`;
    return `Open the table (${pl.wait > 0 ? `feast again in ${Math.ceil(pl.wait)}s` : 'you are full for now'})`;
}

// ── using the table ────────────────────────────────────────────────────────
/** A farmer pressed USE at a table: feast if there is something to eat, otherwise open the table. */
export function use (sim: Sim, p: PlayerS, b: BuildE) {
    if (!near(sim, p, b)) return;
    if (feast(sim, p, b, true)) return;
    sim.events.push({ e: 'open', to: p.id, ui: 'table', id: b.id });
}

/** Cmd: set a dish out, take your own back, or feast. */
export function cmdPotluck (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'potluck' }>) {
    if (typeof c.id !== 'number') return;
    const b = sim.s.ents[c.id];
    if (!b || b.k !== 'bld' || b.kind !== 'table' || !near(sim, p, b)) return;
    if (c.op === 'feast') { feast(sim, p, b, false); return; }
    if (c.op !== 'put' && c.op !== 'take') return;
    if (!Number.isInteger(c.n) || c.n < 1 || c.n > 9999) return;
    if (c.op === 'put') put(sim, p, b, c.item, c.n); else takeBack(sim, p, b, c.item, c.n);
}

function put (sim: Sim, p: PlayerS, b: BuildE, it: unknown, n: number) {
    if (!isDish(it)) { sim.deny(p, 'Only food and potions with a buff go on the table'); return; }
    if (countOf(p, it) < 1) { sim.deny(p, `You have no ${ITEMS[it].name}`); return; }
    const rows = rowsOf(b), row = rows.find((r) => r.it === it);
    if (row && row.by !== p.id) { sim.deny(p, `${cookName(sim.s.players, row.by)} already brought ${ITEMS[it].name}`); return; }
    if (!row && rows.length >= TUNING.tableDishes) { sim.deny(p, `The table is full: ${TUNING.tableDishes} different dishes`); return; }
    const room = TUNING.tablePortions - (row?.n ?? 0);
    if (room <= 0) { sim.deny(p, `That dish is full: ${TUNING.tablePortions} portions`); return; }
    const k = Math.min(n, room, countOf(p, it));
    takeItem(p, it, k);
    if (row) row.n += k; else rows.push({ it, n: k, by: p.id });
    b.dish = rows;
    sim.touch(b);
    const c = sim.center(b);
    sim.fx('load', c.x, c.y - 6, p.id);
    sim.float(p.x, p.y - 22, `Set out ${k} ${ITEMS[it].name}`, PAL.lime, p.id, 'potluck');
    if (!row) {
        // friends within earshot hear that a dish has been put out (a new dish only, not a top-up)
        for (const q of sim.online) if (q.id !== p.id && Math.hypot(q.x - p.x, q.y - p.y) <= TUNING.partyRange) sim.toast(q.id, `${p.name} set out ${dishName(it)}: feast at the table`, `i_${it}`, PAL.gold);
    }
}

function takeBack (sim: Sim, p: PlayerS, b: BuildE, it: unknown, n: number) {
    const row = rowsOf(b).find((r) => r.it === it);
    if (!row) return;
    if (row.by !== p.id) { sim.deny(p, `Only ${cookName(sim.s.players, row.by)} can take that back`); return; }
    const k = Math.min(n, row.n), c = sim.center(b);
    sim.give(p, row.it, k, c.x, c.y);
    row.n -= k;
    tidy(b);
    sim.touch(b);
    sim.fx('collect', c.x, c.y - 6, p.id);
}

/** Dishes with no portions left leave the table; a bare table carries no field at all. */
function tidy (b: BuildE) {
    if (!b.dish) return;
    b.dish = rowsOf(b);
    if (!b.dish.length) delete b.dish;
}

/** A buff from a feast: the longer time wins (never stacked), and it carries the cook's name. */
function addBuff (p: PlayerS, id: ItemId, secs: number, by: string) {
    const bf = ITEMS[id].buff!;
    const have = p.buffs.find((x) => x.id === bf.id);
    if (have) { have.t = Math.max(have.t, secs); have.by = by; } else p.buffs.push({ id: bf.id, t: secs, by });
}

/** Feast: one portion of each dish that helps. Returns whether it happened (and says why not, unless `quiet`). */
function feast (sim: Sim, p: PlayerS, b: BuildE, quiet: boolean): boolean {
    const why = whyNotFeast(p, b, sim.s.time);
    if (why) { if (!quiet) sim.deny(p, why); return false; }
    const now = sim.s.time, eat = plan(p, b, now).eat, mul = derived(p).buffMul;
    const host = rowsOf(b)[0]?.by ?? '';
    const nameOf = (id: string) => cookName(sim.s.players, id);
    const line = feastLine(eat, nameOf);
    for (const d of eat) { d.n--; addBuff(p, d.it, ITEMS[d.it].buff!.secs * mul, nameOf(d.by)); }
    tidy(b);
    // when each farmer last feasted here: what is older than the cooldown and the "at once" window is forgotten
    if (!b.fc || typeof b.fc !== 'object' || Array.isArray(b.fc)) b.fc = {};
    const fc = b.fc;
    fc[p.id] = now;
    for (const k of Object.keys(fc)) if (now - fc[k] > Math.max(TUNING.feastCooldown, TUNING.feastWindow)) delete fc[k];
    sim.touch(b);
    const c = sim.center(b);
    sim.fx('feast', c.x, c.y - 6, p.id);
    sim.banner('A feast!', line, PAL.gold, p.id);
    quests.count(p, 'eat');
    quests.count(p, 'feast');
    const fed = Object.keys(fc).filter((k) => now - fc[k] <= TUNING.feastWindow);
    if (fed.length >= 3) {
        const guests = fed.filter((k) => k !== host).map(nameOf);
        chronicle.note(sim, `feast:${sim.s.day}`, `${nameOf(host)}'s feast fed ${chronicle.names(guests)}.`, 'i_pie');
    }
    return true;
}

/** A table is taken down: every dish goes back to its cook (by post, when the cook is not the one taking it down). */
export function dismantle (sim: Sim, p: PlayerS, b: BuildE) {
    const c = sim.center(b);
    for (const d of rowsOf(b)) {
        const cook = own(sim.s.players, d.by) ? sim.s.players[d.by] : undefined;
        if (!cook || cook.id === p.id || (cook.mail?.length ?? 0) >= mail.MAIL_CAP) { sim.give(p, d.it, d.n, c.x, c.y); continue; }
        (cook.mail ??= []).push({ from: 'The potluck table', d: sim.s.day, note: `Taken down by ${p.name}.`.slice(0, mail.NOTE_MAX), items: [[d.it, d.n]] });
        mail.refreshFlags(sim, cook);
        if (cook.online) sim.toast(cook.id, `${d.n} ${ITEMS[d.it].name} came back to you in the post`, 'k_flag', PAL.gold);
    }
    delete b.dish;
}

/** The developer menu: lay a table in front of the farmer with four dishes (or restock the nearest one). */
export function devTable (sim: Sim, p: PlayerS): boolean {
    const want: ItemId[] = ['stew', 'pie', 'cornbread', 'jam'];
    let b = sim.buildings('table').find((t) => near(sim, p, t));
    if (!b) {
        const l = Math.hypot(p.fx, p.fy) > 0.1 ? Math.hypot(p.fx, p.fy) : 0;
        const bx = Math.floor((p.x + (l ? (p.fx / l) * 40 : 0)) / TILE), by = Math.floor((p.y + (l ? (p.fy / l) * 40 : 40)) / TILE);
        const { tx: px, ty: py } = feetTile(p);
        for (let k = 0; k < 6 && !b; k++) {
            for (let dy = -k; dy <= k && !b; dy++) for (let dx = -k; dx <= k && !b; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== k) continue;
                const tx = bx + dx, ty = by + dy;
                if (!sim.world.rectFree(tx, ty, 2, 1) || (py === ty && (px === tx || px === tx + 1))) continue;
                b = sim.add<BuildE>({ k: 'bld', kind: 'table', tx, ty, rot: 0, by: p.id });
            }
        }
    }
    if (!b) return false;
    b.dish = want.filter(isDish).slice(0, TUNING.tableDishes).map((it) => ({ it, n: TUNING.tablePortions, by: p.id }));
    sim.touch(b);
    return true;
}
