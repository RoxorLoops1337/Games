// The power grid's geometry — shared so the client can draw the wires the server simulates.
// Poles link to poles within WIRE_RANGE tiles; machines connect to any pole whose supply
// square (±SUPPLY tiles) touches their footprint. Each connected group of poles is a net.

import { BUILDINGS } from '../data/buildings';
import type { BuildE } from './types';

export const WIRE_RANGE = 7;
export const SUPPLY = 3;

const size = (b: BuildE) => BUILDINGS[b.kind].size;

export interface PowerNet {
    id: number;
    poles: BuildE[];
    members: BuildE[];     // generators and consumers wired to this net
    gen: number;           // current production (units)
    use: number;           // current demand (units)
    ratio: number;         // 0..1 satisfaction
    live: boolean;         // has a generator (the Factory view draws a live net in gold)
}

export interface PowerGraph {
    nets: PowerNet[];
    netOf: Map<number, PowerNet>;     // building id → its net (poles and members)
    links: [BuildE, BuildE][];        // pole-to-pole wires
    orphans: BuildE[];                // consumers no pole reaches (they get no power)
}

/** Poles sorted into cells `WIRE_RANGE` tiles across: a pole can only link to, or supply, something in its own cell or the eight round it. */
const CELL = WIRE_RANGE;
const cellKey = (cx: number, cy: number) => cx * 65536 + cy;
function bucket (poles: BuildE[]): Map<number, number[]> {
    const cells = new Map<number, number[]>();
    poles.forEach((p, i) => {
        const k = cellKey(Math.floor(p.tx / CELL), Math.floor(p.ty / CELL));
        const c = cells.get(k);
        if (c) c.push(i); else cells.set(k, [i]);
    });
    return cells;
}
/** The pole indexes in the cells that touch the tile box x0..x1, y0..y1 (ascending, each once). */
function near (cells: Map<number, number[]>, x0: number, y0: number, x1: number, y1: number): number[] {
    const out: number[] = [];
    for (let cy = Math.floor((y0 - CELL) / CELL); cy <= Math.floor((y1 + CELL) / CELL); cy++) {
        for (let cx = Math.floor((x0 - CELL) / CELL); cx <= Math.floor((x1 + CELL) / CELL); cx++) {
            const c = cells.get(cellKey(cx, cy));
            if (c) for (const i of c) out.push(i);
        }
    }
    return out.sort((a, b) => a - b);
}

/** Does a pole's supply square overlap this building's footprint? */
function supplies (pole: BuildE, b: BuildE): boolean {
    const [w, h] = size(b);
    return b.tx <= pole.tx + SUPPLY && b.tx + w - 1 >= pole.tx - SUPPLY && b.ty <= pole.ty + SUPPLY && b.ty + h - 1 >= pole.ty - SUPPLY;
}

export function buildPowerGraph (buildings: readonly BuildE[]): PowerGraph {
    const poles = buildings.filter((b) => BUILDINGS[b.kind].pole);
    const parent = poles.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const links: [BuildE, BuildE][] = [];
    const cells = bucket(poles);                      // (every pole against every other was the whole step on a big farm)
    for (let i = 0; i < poles.length; i++) {
        for (const j of near(cells, poles[i].tx, poles[i].ty, poles[i].tx, poles[i].ty)) {
            if (j <= i) continue;
            if (Math.hypot(poles[i].tx - poles[j].tx, poles[i].ty - poles[j].ty) <= WIRE_RANGE) {
                links.push([poles[i], poles[j]]);
                parent[find(i)] = find(j);
            }
        }
    }
    const byRoot = new Map<number, PowerNet>();
    const nets: PowerNet[] = [];
    const netOf = new Map<number, PowerNet>();
    poles.forEach((p, i) => {
        const r = find(i);
        let net = byRoot.get(r);
        if (!net) { net = { id: nets.length, poles: [], members: [], gen: 0, use: 0, ratio: 1, live: false }; byRoot.set(r, net); nets.push(net); }
        net.poles.push(p);
        netOf.set(p.id, net);
    });
    const orphans: BuildE[] = [];
    for (const b of buildings) {
        const def = BUILDINGS[b.kind];
        if (def.pole || (!def.use && !def.gen && !def.store)) continue;
        const [w, h] = size(b);
        const idx = near(cells, b.tx - SUPPLY, b.ty - SUPPLY, b.tx + w - 1 + SUPPLY, b.ty + h - 1 + SUPPLY).find((i) => supplies(poles[i], b)) ?? -1;      // (the first pole in building order, as before)
        if (idx < 0) { if (def.use) orphans.push(b); continue; }
        const net = byRoot.get(find(idx))!;
        net.members.push(b);
        if (def.gen) net.live = true;
        netOf.set(b.id, net);
    }
    return { nets, netOf, links, orphans };
}

/** The pole of a net nearest a member (where its wire is drawn from). */
export function nearestPole (net: PowerNet, m: BuildE): BuildE {
    return net.poles.reduce((p, q) => (Math.hypot(q.tx - m.tx, q.ty - m.ty) < Math.hypot(p.tx - m.tx, p.ty - m.ty) ? q : p));
}

/** Wind strength 0.35..1, drifting slowly. */
export const wind = (time: number) => 0.68 + 0.32 * Math.sin(time / 47) * Math.sin(time / 19 + 1.3);

/** Current output and demand of a net, and how well supply meets demand. */
export function netStats (net: PowerNet, time: number, sun = 1) {
    let gen = 0, use = 0, stored = 0, cap = 0;
    for (const m of net.members) {
        const def = BUILDINGS[m.kind];
        if (def.gen) {
            if (m.kind === 'windturbine') gen += def.gen * wind(time);
            else if (def.solar) gen += def.gen * sun;
            else if ((m.act ?? 0) > 0) gen += def.gen;
        }
        if (def.use && (m.act ?? 0) > 0) use += def.use;
        if (def.store) { cap += def.store; stored += Math.min(def.store, m.chg ?? 0); }
    }
    // batteries cover a shortfall for as long as they hold charge
    const covered = use > gen && stored > 0.5;
    return { gen, use, stored, cap, ratio: use <= 0 ? (gen > 0 ? 1 : 0) : covered ? 1 : Math.min(1, gen / use) };
}
