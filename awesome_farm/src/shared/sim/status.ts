// What a factory building is doing right now, in plain words: working, waiting for what, out of fuel, no
// power, output full, no recipe, nowhere to put things. Pure functions over a building and a small
// "environment" (what stands on a tile, where the ore is, which power grid it is on), so the machine windows,
// the badges over the machines, the hover tooltips and the tests all read the same truth. The rules mirror
// machines.ts (processors), factory.ts (drills, inserters, belts, generators) and power.ts: change them together.

import { BUILDINGS, isBeltLike } from '../data/buildings';
import { filterLabel } from '../data/filters';
import { costText, FUEL, ITEMS, ItemId } from '../data/items';
import { RECIPES, recipesFor, type Recipe } from '../data/recipes';
import { SKILL_LIST } from '../data/skills';
import { sunlight } from '../daylight';
import { TUNING } from '../config';
import { chuteRate, chuteSells } from './chute';
import { canAccept, DIRS, DRILL_BASE, DRILL_BUF, frontTiles, listItems, powerGraph, SWING, tunnelPartner } from './factory';
import { invSum, OUT_CAP, procInputs } from './machines';
import { wind } from './power';
import type { Sim } from './sim';
import type { BuildE, Inv } from './types';
import { isUber, storageOf } from './uber';

export type StatusState =
    | 'working' | 'waiting' | 'idle' | 'ok'
    | 'nofuel' | 'nopower' | 'full' | 'norecipe' | 'noin' | 'noout' | 'noore' | 'locked';

/** The little picture over a machine: a green gear, a yellow hourglass, a red bolt, a red cross, a red flame. */
export type Badge = 'work' | 'wait' | 'power' | 'block' | 'fuel';

export interface Status {
    state: StatusState;
    badge: Badge | null;
    /** What is happening, in a short plain sentence. */
    text: string;
    /** What to do about it ('' when nothing is wrong). */
    hint: string;
    /** Items per minute while it is working, and which item. */
    rate?: number;
    item?: ItemId;
    /** A side note for tooltips ("12 Iron Bar ready to collect"). */
    note?: string;
    /** An export chute that is selling: about how many coins a minute it pays (the Factory view labels it). */
    coins?: number;
}

export interface PowerInfo { poles: number; members: number; gen: number; use: number; ratio: number }

export interface StatusEnv {
    /** The building on a tile (a floor piece such as a belt, or a solid building), or null. */
    at (tx: number, ty: number): BuildE | null;
    veinAt (tx: number, ty: number): ItemId | null;
    /** The power grid a building is wired to, with what it makes and wants right now. */
    power (b: BuildE): PowerInfo | null;
    /** Wind strength (0.35 to 1) and sunlight (0 to 1) right now. */
    wind: number;
    sun: number;
    /** The world's clock in seconds (the chute's rolling minute reads it). Omitted: a chute shows nothing selling. */
    time?: number;
    /** Does the farmer who owns this machine (their id) have this unlock token? Omitted: yes. */
    unlocked? (req: string | undefined, owner: string | undefined): boolean;
}

/** The environment of a running simulation (tests, the server). */
export function simEnv (sim: Sim): StatusEnv {
    const w = sim.world;
    const at = (tx: number, ty: number): BuildE | null => {
        const id = w.occAt(tx, ty) || w.floorAt(tx, ty);
        const e = id ? sim.s.ents[id] : null;
        return e && e.k === 'bld' ? e : null;
    };
    return {
        at,
        veinAt: (tx, ty) => w.veinAt(tx, ty),
        power: (b) => {
            const net = powerGraph(sim).netOf.get(b.id);
            return net ? { poles: net.poles.length, members: net.members.length, gen: net.gen, use: net.use, ratio: net.ratio } : null;
        },
        wind: wind(sim.s.time),
        sun: sunlight(sim.s.clock, sim.s.nightLen),
        time: sim.s.time,
    };
}

// ── small helpers ──────────────────────────────────────────────────────────
const nm = (id: ItemId) => ITEMS[id]?.name ?? id;
const DIR_NAMES = ['east', 'south', 'west', 'north'];
const skillFor = (token: string | undefined) => (token && SKILL_LIST.find((s) => s.unlock?.includes(token))?.name) || 'the right skill';
const S = (state: StatusState, badge: Badge | null, text: string, hint = '', more: Partial<Status> = {}): Status => ({ state, badge, text, hint, ...more });
const have = (inv: Inv | undefined, id: ItemId) => inv?.[id] ?? 0;
const satisfied = (inv: Inv | undefined, cost: Partial<Record<ItemId | 'coin', number>>) => (Object.entries(cost) as [ItemId, number][]).every(([id, n]) => have(inv, id) >= n);
const anyFuel = (fin: Inv | undefined) => (Object.keys(fin ?? {}) as ItemId[]).some((i) => FUEL[i] && have(fin, i) > 0);
/** "iron ore, copper ore or clay": what a machine takes, for a hint (fuel is not an ingredient to mention). */
function takesText (kind: BuildE['kind'], max = 4): string {
    const fuels = !!BUILDINGS[kind].fuel;
    const names = [...procInputs(kind)].filter((i) => !(fuels && FUEL[i])).slice(0, max).map((i) => nm(i).toLowerCase());
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** Why something standing in front will not take an item. */
function whyNot (t: BuildE, item: ItemId): string {
    const d = BUILDINGS[t.kind];
    if (t.kind === 'chute') {
        if (!chuteSells(item)) return `A chute does not sell ${nm(item)}: gear, tools, pods, crates and keepsakes stay with you. Take it off the belt, or turn it aside with a Sorter.`;
        if (t.flt && t.flt !== item) return `It only sells ${nm(t.flt)}. Change its filter (E), or turn the rest aside with a Sorter.`;
        return 'Its builder is not in this world any more, so it has nobody to pay.';
    }
    if (d.storage) return invSum(t.inv) >= storageOf(t) ? 'It is full: empty it, or add another chest.' : `It only takes ${filterLabel(t.fl).toLowerCase()}.`;
    if (isBeltLike(t.kind)) return 'The belt is backed up: whatever is at the end of it is not taking items.';
    if (d.proc) return procInputs(t.kind, t.sel).has(item) ? `It is stocked with ${nm(item)} already: it will take more as it works.` : `${d.name} does not use ${nm(item)}.`;
    return `${d.name} cannot take ${nm(item)}.`;
}

/** Lack of power, if that is what stops a consumer (it asks for power whenever it has work). */
function noPower (b: BuildE, env: StatusEnv): Status | null {
    if (!BUILDINGS[b.kind].use || (b.pw ?? 0) > 0.01) return null;
    const net = env.power(b);
    if (!net) return S('nopower', 'power', 'Not connected to power', 'Place a Power Pole within 3 tiles of it, and keep that pole within 7 tiles of one that reaches a generator.');
    if (net.gen <= 0.01) return S('nopower', 'power', 'No power: nothing on this grid is generating', env.sun < 0.02 && !net.members ? 'Build a Wind Turbine or a Coal Generator beside a pole on this grid.' : 'Build a Wind Turbine, fuel a Coal Generator, or (for solar) wait for daylight.');
    return S('nopower', 'power', 'Not enough power', `The grid makes ${Math.round(net.gen)} units and wants ${Math.round(net.use)}. Add a generator or a battery.`);
}

// ── processors ─────────────────────────────────────────────────────────────
function procStatus (b: BuildE, env: StatusEnv): Status {
    const def = BUILDINGS[b.kind], proc = def.proc!;
    const inv = b.inv, out = b.out;
    const ok = (req: string | undefined) => !req || !env.unlocked || env.unlocked(req, b.by);
    const waiting = invSum(out);
    const note = waiting > 0 ? `${(Object.entries(out ?? {}) as [ItemId, number][]).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${nm(id)}`).join(', ')} ready to collect` : undefined;
    const collect = waiting > 0 ? 'Collect it (E, then Collect all), or put an inserter and a chest beside it.' : '';
    if (proc === 'assembler' && !b.sel) return S('norecipe', 'block', 'No recipe chosen', 'Open it (E) and click what it should build.', { note });
    const r: Recipe | null = b.rcp ? RECIPES[b.rcp] ?? null : null;
    if (r && satisfied(inv, r.in)) {
        const np = noPower(b, env);
        if (np) return { ...np, note };
        if (def.fuel && (b.fuel ?? 0) <= 0 && !anyFuel(b.fin)) return S('nofuel', 'fuel', 'Out of fuel', 'Put coal, wood or peat in the Fuel slots (E), or have an inserter feed it from a chest that holds some.', { note });
        const pw = def.use ? b.pw ?? 0 : 1;
        return S('working', 'work', `Making ${r.n > 1 ? `${r.n} ` : ''}${nm(r.out)}`, collect, { rate: (r.n * 60 / r.time) * pw, item: r.out, note });
    }
    // nothing in progress: why not?
    const cands: readonly Recipe[] = proc === 'assembler' ? [RECIPES[b.sel!]].filter(Boolean) : recipesFor(proc);
    const usable = cands.filter((c) => ok(c.req));
    const stuck = usable.find((c) => satisfied(inv, c.in) && have(out, c.out) >= OUT_CAP);
    if (stuck) return S('full', 'block', `Output is full (${OUT_CAP} ${nm(stuck.out)})`, 'Take things out (E, then Collect all), or put an inserter and a chest beside it.', { note });
    const ready = usable.find((c) => satisfied(inv, c.in));
    if (ready) return S('working', 'work', `Starting ${nm(ready.out)}`, '', { note });
    const locked = cands.find((c) => !ok(c.req) && satisfied(inv, c.in));
    if (locked) return S('locked', 'block', `Cannot make ${nm(locked.out)} yet`, `Learn ${skillFor(locked.req)} in the skill tree (K).`, { note });
    const wanted = proc === 'assembler' ? `${costText(RECIPES[b.sel!].in)}` : takesText(b.kind);
    // in a machine that burns fuel, fuel lying in the ingredient slots (coal is also what steel takes) points at no recipe by itself
    const counts = (i: ItemId) => !(def.fuel && FUEL[i]);
    if (!(Object.keys(inv ?? {}) as ItemId[]).some((i) => have(inv, i) > 0 && counts(i))) {
        return S('waiting', 'wait', proc === 'assembler' ? `Waiting for ${wanted}` : 'Waiting for ingredients', proc === 'assembler' ? 'Put them in (E), or feed it with an inserter or a belt.' : `Put in ${wanted} (E), or feed it with an inserter or a belt.`, { note });
    }
    // some of the ingredients are there: name what is still missing for the closest recipe (the one most of whose ingredients are here)
    let best: Recipe | null = null, bestKinds = 0, bestMissing = 1e9;
    for (const c of usable) {
        const ids = Object.keys(c.in) as ItemId[];
        const kinds = ids.filter((i) => have(inv, i) > 0 && counts(i)).length;
        const missing = ids.reduce((a, i) => a + Math.max(0, (c.in[i] ?? 0) - have(inv, i)), 0);
        if (kinds > bestKinds || (kinds === bestKinds && kinds > 0 && missing < bestMissing)) { best = c; bestKinds = kinds; bestMissing = missing; }
    }
    if (best) {
        const miss = (Object.entries(best.in) as [ItemId, number][]).filter(([i, n]) => have(inv, i) < n).map(([i, n]) => `${n - have(inv, i)} more ${nm(i)}`);
        return S('waiting', 'wait', `Waiting for ${miss.join(' and ')}`, `${nm(best.out)} needs ${costText(best.in)}.`, { note });
    }
    return S('waiting', 'wait', 'Waiting for ingredients', `It takes ${wanted}.`, { note });
}

// ── drills ─────────────────────────────────────────────────────────────────
function drillStatus (b: BuildE, env: StatusEnv): Status {
    const [w, h] = BUILDINGS.drill.size;
    const counts = new Map<ItemId, number>();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = env.veinAt(b.tx + x, b.ty + y); if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
    let best: ItemId | null = null, tiles = 0;
    for (const [res, n] of counts) if (n > tiles) { best = res; tiles = n; }
    if (!best) return S('noore', 'block', 'No ore under it', 'Move it so its square sits on a patch of coloured ore painted on the ground.');
    const buf = invSum(b.out);
    const fronts = frontTiles(b).map(([x, y]) => env.at(x, y)).filter((e): e is BuildE => !!e);
    const stock = (Object.keys(b.out ?? {}) as ItemId[]).find((i) => have(b.out, i) > 0);
    if (buf >= DRILL_BUF && stock) {
        if (!fronts.length) return S('noout', 'block', 'Nowhere to put the ore', 'Put a belt, chest or inserter on the tile in front of it (the arrow on the drill points there).');
        return S('full', 'block', `Full: the ${BUILDINGS[fronts[0].kind].name} in front will not take ${nm(stock)}`, whyNot(fronts[0], stock));
    }
    const np = noPower(b, env);
    if (np) return np;
    const pw = b.pw ?? 0;
    return S('working', 'work', `Mining ${nm(best)} (${tiles} of 4 tiles)`, fronts.length ? '' : 'Nothing in front yet: ore piles up in the drill (8 at most). Put a belt or a chest in front of it.', { rate: (tiles / 4) * pw * 60 / DRILL_BASE, item: best, note: buf ? `${buf} ore waiting in the drill` : undefined });
}

// ── inserters ──────────────────────────────────────────────────────────────
function inserterStatus (b: BuildE, env: StatusEnv): Status {
    const [dx, dy] = DIRS[b.rot & 3];
    const back = env.at(b.tx - dx, b.ty - dy), front = env.at(b.tx + dx, b.ty + dy);
    if (!back) return S('noin', 'block', 'Nothing behind it to pick up from', `Put a chest, belt or machine on the ${DIR_NAMES[(b.rot + 2) & 3]} side of it, or turn it (E, then the Facing arrows).`);
    if (!front) return S('noout', 'block', 'Nothing in front to put things into', `Put a chest, belt or machine on the ${DIR_NAMES[b.rot & 3]} side of it, or turn it (E, then the Facing arrows).`);
    const np = noPower(b, env);
    if (np) return np;
    const bn = BUILDINGS[back.kind].name, fn = BUILDINGS[front.kind].name;
    const rate = 60 / SWING * (b.pw ?? 0);
    if (b.hand) {
        if ((b.prog ?? 0) >= 1 && !canAccept(front, b.hand)) return S('full', 'block', `Holding ${nm(b.hand)}: the ${fn} in front will not take it`, whyNot(front, b.hand));
        return S('working', null, `Moving ${nm(b.hand)} from the ${bn} to the ${fn}`, '', { rate, item: b.hand });
    }
    const items = listItems(back);
    if (!items.length) return S('idle', null, 'Waiting: nothing to pick up', `The ${bn} behind it has nothing in it yet. It moves things as soon as they arrive.`);
    const match = items.filter((i) => !b.flt || b.flt === i);
    if (!match.length) return S('idle', null, `Waiting: nothing there matches its filter (${nm(b.flt!)})`, 'Change or clear its filter (E, then click the filter slot).');
    const go = match.find((i) => canAccept(front, i));
    if (!go) return S('full', 'block', `Waiting: the ${fn} in front will not take ${nm(match[0])}`, whyNot(front, match[0]));
    return S('working', null, `Reaching for ${nm(go)}`, '', { rate, item: go });
}

// ── belts, splitters, sorters, tunnels ─────────────────────────────────────
type BeltProblem =
    | { k: 'noexit' } | { k: 'noentrance' } | { k: 'headon' }
    | { k: 'deadend'; head: ItemId } | { k: 'stuck'; head: ItemId; at: BuildE }
    | { k: 'nowhere'; head: ItemId; straight: boolean };

/** What is wrong with a belt piece, if anything lasting is (a busy belt that is merely full is not a problem). No strings are built: this runs for every belt on screen. */
function beltProblem (b: BuildE, env: StatusEnv): BeltProblem | null {
    const head = b.belt?.[2] ?? null;
    const [dx, dy] = DIRS[b.rot & 3];
    const next = b.kind === 'tunnel' ? tunnelPartner(env.at, b) : env.at(b.tx + dx, b.ty + dy);
    if (b.kind === 'tunnel' && !next) return b.belt?.some(Boolean) ? { k: 'noexit' } : null;
    if (b.kind === 'tunnelx') return tunnelPartner(env.at, b) ? null : { k: 'noentrance' };
    if (!head) return null;
    if (b.kind !== 'splitter' && b.kind !== 'sorter') {
        if (!next) return { k: 'deadend', head };
        if (isBeltLike(next.kind)) {
            const [ndx, ndy] = DIRS[next.rot & 3];
            return next.tx + ndx === b.tx && next.ty + ndy === b.ty ? { k: 'headon' } : null;
        }
        return canAccept(next, head) ? null : { k: 'stuck', head, at: next };
    }
    const l = DIRS[(b.rot + 3) & 3], r = DIRS[(b.rot + 1) & 3];
    const left = env.at(b.tx + l[0], b.ty + l[1]), right = env.at(b.tx + r[0], b.ty + r[1]);
    const straight = b.kind === 'splitter' || !b.flt || b.flt === head;
    const dests = (b.kind === 'splitter' ? [next, left, right] : straight ? [next] : [left, right]).filter((x): x is BuildE => !!x);
    if (!dests.length) return { k: 'nowhere', head, straight };
    if (dests.every((d) => !isBeltLike(d.kind) && !canAccept(d, head))) return { k: 'stuck', head, at: dests[0] };
    return null;
}

function beltStatus (b: BuildE, env: StatusEnv): Status {
    const def = BUILDINGS[b.kind];
    const bad = beltProblem(b, env);
    if (bad) {
        switch (bad.k) {
            case 'noexit': return S('noout', 'block', 'No exit ahead', 'Put a Tunnel Exit facing the same way, in line with it and up to 6 tiles ahead.');
            case 'noentrance': return S('noin', null, 'No entrance behind', 'Put a Tunnel Entrance facing the same way, in line with it and up to 6 tiles behind.');
            case 'headon': return S('noout', 'block', 'Two belts face each other', 'Turn one of them (R while building, or E and the Facing arrows).');
            case 'deadend': return S('noout', 'block', `Dead end: nothing at the end takes ${nm(bad.head)}`, 'Put a chest, a machine or another belt on the tile it points at.');
            case 'stuck': return S('full', 'block', b.kind === 'splitter' || b.kind === 'sorter' ? `Stuck: nothing it feeds will take ${nm(bad.head)}` : `Stuck: the ${BUILDINGS[bad.at.kind].name} at the end will not take ${nm(bad.head)}`, whyNot(bad.at, bad.head));
            case 'nowhere': return S('noout', 'block', `Nowhere to send ${nm(bad.head)}`, bad.straight ? 'Put a chest, machine or belt in front of it.' : 'Put a chest, machine or belt on one of its sides: everything that is not its filter turns off there.');
        }
    }
    if (b.kind === 'splitter') return S('ok', null, 'Splitter: shares what arrives three ways', 'Forward, left and right in turn. A side with nothing there is skipped.');
    if (b.kind === 'sorter') return S('ok', null, b.flt ? `Sorter: ${nm(b.flt)} goes straight on, the rest turns off` : 'Sorter: no filter yet, everything goes straight on', b.flt ? '' : 'Open it (E) and pick the item that should carry straight on.');
    const items = (b.belt ?? []).filter((x): x is ItemId => !!x);
    const what = items.length ? `carrying ${[...new Set(items.map(nm))].join(', ')}` : 'empty';
    return S('ok', null, `${def.name}: ${what}, running ${DIR_NAMES[b.rot & 3]}`, '');
}

// ── power ──────────────────────────────────────────────────────────────────
const NOT_WIRED = 'Place a Power Pole within 3 tiles of it so its power goes somewhere.';
function powerStatus (b: BuildE, env: StatusEnv): Status {
    const def = BUILDINGS[b.kind];
    const net = env.power(b);
    if (b.kind === 'pole') {
        if (!net) return S('ok', null, 'Power Pole', '');
        const text = `${net.poles} pole${net.poles === 1 ? '' : 's'} · ${net.members} machine${net.members === 1 ? '' : 's'} · makes ${Math.round(net.gen)}, wants ${Math.round(net.use)}`;
        if (net.gen <= 0.01) return S('ok', null, text, 'Nothing on this grid generates power: build a Wind Turbine or a Coal Generator within 3 tiles of a pole.');
        if (net.use > net.gen * 1.001) return S('ok', null, text, 'The grid is short of power: machines run slower. Add a generator or a battery.');
        return S('ok', null, text, '');
    }
    if (!net) return S('nopower', 'power', def.gen ? 'Not wired: its power goes nowhere' : 'Not wired to a power grid', NOT_WIRED);
    if (b.kind === 'windturbine') return S('working', null, `Making ${Math.round(def.gen! * env.wind)} of ${def.gen} units (wind ${Math.round(env.wind * 100)}%)`, '');
    if (b.kind === 'solar') return env.sun > 0.02 ? S('working', null, `Making ${Math.round(def.gen! * env.sun)} of ${def.gen} units (sun ${Math.round(env.sun * 100)}%)`, '') : S('idle', null, 'Asleep: nothing from the sun at night', 'Pair it with a battery to carry the grid through the night.');
    if (b.kind === 'battery') return S('ok', null, `Charge ${Math.round(b.chg ?? 0)} of ${def.store} (${Math.round(((b.chg ?? 0) / def.store!) * 100)}%)`, 'It fills when the grid has spare power and gives it back when it runs short.');
    if (b.kind === 'coalgen') {
        if ((b.act ?? 0) > 0 && (b.fuel ?? 0) > 0) return S('working', 'work', `Burning: making ${def.gen} units (${Math.ceil(b.fuel!)}s of fuel in the firebox)`, '');
        const wanted = net.use > 0;
        if (!anyFuel(b.fin) && (b.fuel ?? 0) <= 0) return wanted ? S('nofuel', 'fuel', 'Out of fuel', 'Put coal, wood or peat in it (E).') : S('idle', null, 'Idle, and out of fuel', 'Put coal, wood or peat in it (E) so it is ready when something needs power.');
        return S('idle', null, 'Idle: nothing needs power right now', 'It only burns fuel while something on the grid is working.');
    }
    return S('ok', null, def.name, '');
}

function chestStatus (b: BuildE): Status {
    const n = invSum(b.inv);
    const lab = b.fl?.length ? ` · takes only ${filterLabel(b.fl).toLowerCase()}` : '';
    const cap = storageOf(b);
    return S('ok', null, `${n} of ${cap} items${lab}${isUber(b) ? ' · shared by every Uber Chest' : ''}`, n >= cap ? 'Full: inserters and drills cannot add more. Empty it or add another chest.' : '');
}

// ── export chutes ──────────────────────────────────────────────────────────
/** Does this building hand things to the chute at `b`? (A belt pointing at it, an inserter or drill facing it, a splitter or sorter beside it.) */
function feeds (e: BuildE, b: BuildE): boolean {
    const [dx, dy] = DIRS[e.rot & 3];
    const at = (tx: number, ty: number) => tx === b.tx && ty === b.ty;
    if (e.kind === 'drill') return frontTiles(e).some(([x, y]) => at(x, y));
    if (e.kind === 'splitter' || e.kind === 'sorter') return [0, 1, 3].some((k) => { const [sx, sy] = DIRS[(e.rot + k) & 3]; return at(e.tx + sx, e.ty + sy); });
    if (e.kind === 'inserter' || (isBeltLike(e.kind) && e.kind !== 'tunnel')) return at(e.tx + dx, e.ty + dy);
    return false;
}

function chuteStatus (b: BuildE, env: StatusEnv): Status {
    const rate = chuteRate(b.ch, env.time ?? 0);
    const per = `${Math.round(TUNING.chuteCut * 100)}% of the market price`;
    if (rate > 0) {
        const n = Math.round(rate);
        return S('working', 'work', `Selling: about ${n < 1 ? 'less than 1 coin' : `${n} coin${n === 1 ? '' : 's'}`} a minute`, b.flt ? `It only sells ${nm(b.flt)}.` : '', { coins: rate });
    }
    const fed = [[1, 0], [0, 1], [-1, 0], [0, -1]].some(([dx, dy]) => { const e = env.at(b.tx + dx, b.ty + dy); return !!e && feeds(e, b); });
    if (!fed) return S('noin', 'block', 'Nothing is feeding it', 'Point a belt, an inserter or a drill at it (the arrows show where they face). It sells whatever arrives.');
    return S('waiting', 'wait', b.flt ? `Waiting for ${nm(b.flt)}` : 'Waiting for items', `Whatever arrives is sold at ${per}, and the coins go to ${b.by ? 'whoever built it' : 'its builder'}.`);
}

/** The one place that says what a factory building is up to. Anything that is not part of the factory gets state 'ok'. */
export function statusOf (b: BuildE, env: StatusEnv): Status {
    const def = BUILDINGS[b.kind];
    if (def.proc) return procStatus(b, env);
    if (b.kind === 'drill') return drillStatus(b, env);
    if (b.kind === 'inserter') return inserterStatus(b, env);
    if (isBeltLike(b.kind)) return beltStatus(b, env);
    if (def.gen || def.pole || def.store) return powerStatus(b, env);
    if (def.storage && !def.grave && !def.pets) return chestStatus(b);
    if (b.kind === 'chute') return chuteStatus(b, env);
    return S('ok', null, def.name, '');
}

/** Just the badge of a building: cheap enough to ask for every belt on screen. */
export function badgeOf (b: BuildE, env: StatusEnv): Badge | null {
    return isBeltLike(b.kind) ? (beltProblem(b, env) ? 'block' : null) : statusOf(b, env).badge;
}

/** Is this one of the buildings the factory overlays care about? */
export const isFactoryPiece = (kind: BuildE['kind']) => {
    const d = BUILDINGS[kind];
    return !!d.proc || !!d.gen || !!d.pole || !!d.store || kind === 'drill' || kind === 'inserter' || kind === 'chute' || isBeltLike(kind) || (!!d.storage && !d.pets && !d.grave);
};
