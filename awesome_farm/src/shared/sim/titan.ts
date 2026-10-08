// Titan nodes: a Great Oak and a Titan Boulder. Huge, rare, and they only take damage while two or more DIFFERENT
// farmers are swinging at them together ("Hit it together!"). One farmer's swing makes a hollow knock and a float
// that says it needs a friend. When it falls everyone who helped is paid their own share (straight into their
// pockets, so nobody can grab anybody else's), more for every extra hand.
//
// The rules and numbers: TITAN and the two node kinds in data/nodes.ts; the crate odds in data/loot.ts. Who swung
// when lives in `sim.titanLog` (runtime only: the window is three seconds, shorter than a save). Companions and
// workers are not hands: only a farmer's own swing counts, and creature jobs skip these nodes (jobs.ts, creatures.ts).

import { ITEMS, type Res } from '../data/items';
import { NODES, TITAN, type NodeGroup, type NodeKind } from '../data/nodes';
import type { StatKey } from '../data/stats';
import { PAL } from '../palette';
import { Rng } from '../rng';
import * as fortune from './fortune';
import * as quests from './quests';
import type { Sim } from './sim';
import { derived } from './stats';
import type { NodeE, PlayerS, Plot } from './types';

export const isTitan = (kind: NodeKind) => !!NODES[kind].titan;

/** What every helper's share is multiplied by for this many hands: ×1 alone, ×1.5 with two, ×2 with three, ×2.5 with four or more. */
export const handsMul = (hands: number) => 1 + TITAN.handBonus * (Math.min(TITAN.maxHands, Math.max(1, Math.floor(hands) || 1)) - 1);

/** The skill stat that adds to a group's drops (a Titan pays this too, to each helper by their own skills). */
const BONUS: Partial<Record<NodeGroup, StatKey>> = { wood: 'wood', stone: 'stone' };

/** The farmers who have swung at this node within the last `span` seconds and are still standing there to be counted (online, on their feet). */
function handsOn (sim: Sim, id: number, span: number): PlayerS[] {
    const log = sim.titanLog.get(id);
    if (!log) return [];
    const out: PlayerS[] = [];
    for (const [pid, t] of log.hits) {
        const q = Object.prototype.hasOwnProperty.call(sim.s.players, pid) ? sim.s.players[pid] : undefined;
        if (q && q.online && q.downed <= 0 && sim.s.time - t <= span + 1e-9) out.push(q);
    }
    return out;
}

/** A farmer swung at a Titan node (called by `gather.hitNode`). */
export function hit (sim: Sim, p: PlayerS, n: NodeE) {
    const def = NODES[n.kind];
    const now = sim.s.time;
    let log = sim.titanLog.get(n.id);
    if (!log) sim.titanLog.set(n.id, log = { hits: new Map(), coop: -1e9 });
    log.hits.set(p.id, now);
    for (const [id, t] of log.hits) if (now - t > TITAN.share) log.hits.delete(id);        // (forget the long gone: nobody left a swing here to be paid for)
    const c = sim.center(n);
    if (handsOn(sim, n.id, TITAN.window).length < TITAN.minHands) {
        // alone: a hollow knock, and (now and then, so it does not nag) a word about what it wants
        sim.fx('hollow', c.x, c.y, p.id);
        if (now - (sim.titanSay.get(p.id) ?? -1e9) >= TITAN.sayEvery) {
            sim.titanSay.set(p.id, now);
            sim.float(c.x, c.y - 30, 'Needs a friend!', PAL.pumpkin, p.id);
        }
        return;
    }
    // together: full damage for every swing
    const d = derived(p);
    let dmg = d.toolPower;
    const nodeCrit = d.mods.nodeCrit ?? 0;
    if (nodeCrit > 0 && sim.rng.chance(nodeCrit)) dmg *= 2;
    if (now - log.coop > TITAN.window) sim.float(c.x, c.y - 30, 'Together!', PAL.gold);
    log.coop = now;
    n.hp -= dmg;
    if (n.hp > 0) {
        sim.touch(n);
        sim.fx(def.hit, c.x, c.y, p.id);
        return;
    }
    fall(sim, p, n, c);
}

/** It falls: everyone who swung within the last few seconds is paid their own share. */
function fall (sim: Sim, by: PlayerS, n: NodeE, c: { x: number; y: number }) {
    const def = NODES[n.kind];
    const helpers = handsOn(sim, n.id, TITAN.share);
    if (!helpers.some((h) => h.id === by.id)) helpers.push(by);
    const mul = handsMul(helpers.length);
    const plot = sim.s.plots[n.plot];
    sim.fx(def.brk, c.x, c.y, by.id);
    sim.fx('titan', c.x, c.y - 8, '*');
    sim.remove(n.id);
    for (const h of helpers) pay(sim, h, n.kind, plot, mul, helpers.length, c);
}

/** One helper's share: the drops (each by their own skills and luck, times the hands), a crate chance, the XP, and a word about it. */
function pay (sim: Sim, h: PlayerS, kind: NodeKind, plot: Plot | undefined, mul: number, hands: number, c: { x: number; y: number }) {
    const def = NODES[kind];
    const rng = fortune.dropRng(sim, h);                                  // (the luck dice: a Titan never moves the world's own random stream)
    const d = derived(h);
    const stat = BONUS[def.group];
    const bonus = stat ? d.mods[stat] ?? 0 : 0;
    let main: [Res, number] | null = null;
    for (const [res, min, max, chance = 1] of def.drops) {
        if (!rng.chance(chance)) continue;
        let base = rng.int(min, max);
        const material = res !== 'coin' && ITEMS[res].kind !== 'seed' && ITEMS[res].kind !== 'potion' && ITEMS[res].kind !== 'gear';
        if (material) {
            if (plot?.mod === 'bountiful') base++;
            base += Math.floor(bonus) + (rng.chance(bonus - Math.floor(bonus)) ? 1 : 0);
        }
        let count = Math.max(1, Math.round(base * mul));
        if (rng.chance(d.luck)) count *= 2;
        sim.give(h, res, count, c.x, c.y, rng);
        main ??= [res, count];
    }
    h.stats.harvested++;
    quests.count(h, `harvest:${kind}`);
    quests.count(h, 'titan');
    const crate = fortune.titanCrate(sim, h, mul, c.x, c.y);
    sim.gainXp(h, def.xp);
    if (main) sim.float(h.x, h.y - 22, `+${main[1]} ${main[0] === 'coin' ? 'Coins' : ITEMS[main[0]].name}`, PAL.lime, h.id);
    sim.banner(`${def.name} falls!`, hands > 1 ? `${hands} hands: ×${mul} for everyone` : undefined, PAL.gold, h.id);
    if (crate) sim.toast(h.id, `A ${crate} crate came with it`, `i_crate_${crate}`, PAL.gold);
}

/**
 * A tree or boulder is about to grow on a plot: should it be a Titan? Only on owned land, only in a world where at least two
 * farmers have a farm (a solo world never grows one: it could not be felled), rarely, never more than one an island and a
 * handful in the world. Decided by where it stands, like golden nodes: the world's own dice are never touched.
 */
export function grown (sim: Sim, kind: NodeKind, tx: number, ty: number, plot: Plot): NodeKind {
    const to: NodeKind | null = kind === 'tree' ? 'titan_oak' : kind === 'rock' ? 'titan_rock' : null;
    if (!to || !plot.owned || Object.keys(sim.s.players).length < TITAN.farmers) return kind;
    if (!new Rng(`${sim.s.seed}:titan:${tx}:${ty}:${sim.s.nextId}`).chance(TITAN.chance)) return kind;
    let here = 0, all = 0;
    for (const e of sim.ents('node')) if (NODES[e.kind].titan) { all++; if (e.plot === plot.i && sim.world.plotAt(e.tx, e.ty) === plot) here++; }
    if (here >= TITAN.perPlot || all >= TITAN.worldCap(sim.world.ownedPlots().length)) return kind;
    return to;
}
