// Resource nodes: hitting them, what they drop, regrowth, and stocking new land.

import { PLOT, TUNING } from '../config';
import { BIOME_DEFS } from '../data/biomes';
import { ITEMS } from '../data/items';
import { LUCK } from '../data/loot';
import { NODES, NodeGroup, NodeKind } from '../data/nodes';
import type { StatKey } from '../data/stats';
import * as fortune from './fortune';
import * as mobs from './mobs';
import * as quests from './quests';
import type { Sim } from './sim';
import * as titan from './titan';
import { derived } from './stats';
import type { NodeE, PlayerS, Plot } from './types';

const HOME_KINDS: NodeKind[] = [
    'tree', 'tree', 'tree', 'tree', 'tree', 'tree', 'tree', 'tree', 'tree', 'tree', 'rock', 'rock', 'rock', 'rock', 'rock', 'gold', 'gold', 'bush', 'bush', 'bush',
    'flower', 'flower', 'flower', 'reeds', 'reeds', 'reeds', 'clay', 'clay',
];

/** Which stat adds extra drops for a node group. */
const GROUP_STAT: Record<NodeGroup, StatKey | null> = {
    wood: 'wood', stone: 'stone', earth: 'stone', ore: 'ore', gem: 'ore', plant: 'plant', chest: null, nest: null,
};

export function addNode (sim: Sim, kind: NodeKind, tx: number, ty: number, plot: Plot) {
    plot.nodes++;
    const gold = fortune.isGolden(sim.s.seed, kind, tx, ty, sim.s.nextId) ? 1 as const : undefined;
    return sim.add<NodeE>({ k: 'node', kind, tx, ty, hp: NODES[kind].hp, plot: plot.i, ...(gold ? { gold } : {}) });
}

/** Whole part guaranteed, fractional part is a chance. */
function bonusCount (sim: Sim, amount: number) {
    return Math.floor(amount) + (sim.rng.chance(amount - Math.floor(amount)) ? 1 : 0);
}

export function hitNode (sim: Sim, p: PlayerS, n: NodeE) {
    const def = NODES[n.kind];
    const d = derived(p);
    const c = sim.center(n);
    if (def.minTier !== undefined && d.toolTier < def.minTier) {
        sim.deny(p, `Needs a better pick`);
        return;
    }
    if (def.titan) { titan.hit(sim, p, n); return; }                  // (a Titan node only takes damage from two farmers together)
    let dmg = d.toolPower;
    const nodeCrit = d.mods.nodeCrit ?? 0;
    if (nodeCrit > 0 && sim.rng.chance(nodeCrit)) dmg *= 2;
    n.hp -= dmg;
    if (n.hp > 0) {
        sim.touch(n);
        sim.fx(def.hit, c.x, c.y, p.id);
        return;
    }
    sim.fx(def.brk, c.x, c.y, p.id);
    sim.remove(n.id);
    p.stats.harvested++;
    quests.count(p, `harvest:${n.kind}`);
    rollDrops(sim, p, n, c);
    fortune.afterBreak(sim, p, n, c);
    sim.gainXp(p, def.xp);
}

function rollDrops (sim: Sim, p: PlayerS, n: NodeE, c: { x: number; y: number }) {
    const def = NODES[n.kind];
    const plot = sim.s.plots[n.plot] as Plot | undefined;
    const d = derived(p);
    const stat = GROUP_STAT[def.group];
    const bonus = stat ? d.mods[stat] ?? 0 : 0;
    for (const [res, min, max, chance = 1] of def.drops) {
        if (!sim.rng.chance(chance)) continue;
        let count = sim.rng.int(min, max);
        const isMaterial = res !== 'coin' && ITEMS[res].kind !== 'seed' && ITEMS[res].kind !== 'potion' && ITEMS[res].kind !== 'gear';
        if (isMaterial) {
            if (plot?.mod === 'bountiful') count++;
            count += bonusCount(sim, bonus);
        }
        if (def.group === 'chest') count = Math.max(1, Math.round(count * (1 + (d.mods.chestLoot ?? 0))));
        if (sim.rng.chance(d.luck)) count *= 2;
        for (let i = 0; i < count; i++) sim.spawnDrop(res, c.x, c.y);
        // a golden node pays double again on top: scattered with the luck dice so the world's own stream is untouched
        if (n.gold) { const lr = fortune.dropRng(sim, p); for (let i = 0; i < count * (LUCK.goldenMul - 1); i++) sim.spawnDrop(res, c.x, c.y, lr); }
    }
}

export function updateRespawn (sim: Sim, dt: number) {
    const land = sim.world.landCount;                 // (the plots with ground: owned, plus the Dread Reaches)
    if (!land || !sim.online.length) return;
    const mul = Math.max(1, ...sim.online.map((p) => sim.derivedOf(p).respawnMul));
    sim.respawnT -= dt * mul * Math.sqrt(land);
    if (sim.respawnT > 0) return;                     // (most steps end here: nothing below is built until one is due)
    sim.respawnT = TUNING.respawnEvery;
    const owned = [...sim.world.ownedPlots(), ...sim.world.dreadPlots()];
    const cap = (p: Plot) => TUNING.plotNodeCap + (p.mod === 'fertile' ? 8 : 0);
    const weights = Object.fromEntries(owned.map((p, i) => [i, Math.max(0, cap(p) - p.nodes) * (p.mod === 'fertile' ? 2 : 1)]));
    if (Object.values(weights).every((w) => w === 0)) return;
    const plot = owned[Number(sim.rng.weighted(weights))];
    const spot = sim.world.randomFreeTile(plot, sim.rng, sim.online.map((p) => ({ x: p.x, y: p.y })));
    if (!spot) return;
    // draw three candidates and keep the kind this plot has the least of, so one kind never crowds the rest out
    const counts: Partial<Record<NodeKind, number>> = {};
    for (const e of sim.ents('node')) if (e.plot === plot.i && sim.world.plotAt(e.tx, e.ty) === plot) counts[e.kind] = (counts[e.kind] ?? 0) + 1;      // (a cave node names plot 0 but is not on it)
    const cands = [0, 1, 2].map(() => sim.rng.weighted(BIOME_DEFS[plot.biome].nodes));
    const kind = cands.reduce((best, k) => ((counts[k] ?? 0) < (counts[best] ?? 0) ? k : best), cands[0]);
    addNode(sim, titan.grown(sim, kind, spot.tx, spot.ty, plot), spot.tx, spot.ty, plot);
}

/** Fill a newly raised plot with a starting spread of resources. */
export function populate (sim: Sim, plot: Plot, isHome: boolean, avoid: { x: number; y: number }[]) {
    const kinds = isHome ? HOME_KINDS : Array.from({ length: sim.rng.int(10, 13) }, () => sim.rng.weighted(BIOME_DEFS[plot.biome].nodes));
    if (plot.mod === 'ruins') {
        const o = sim.world.plotOrigin(plot);
        const cx = o.tx + PLOT / 2, cy = o.ty + PLOT / 2;
        if (sim.world.isFree(cx, cy)) addNode(sim, 'vault', cx, cy, plot);
        // three elite guardians keep watch; they stay until somebody deals with them
        for (let i = 0; i < 3; i++) {
            const m = mobs.spawnMob(sim, undefined, undefined, plot.i, { elite: true, pack: false });
            if (m) { m.guard = 1; sim.touch(m); }
        }
    }
    if (plot.mod === 'treasure') {
        const o = sim.world.plotOrigin(plot);
        if (sim.world.isFree(o.tx + PLOT / 2, o.ty + PLOT / 2)) addNode(sim, 'chest', o.tx + PLOT / 2, o.ty + PLOT / 2, plot);
    }
    // a home island keeps a clearing around where its farmer arrives: room for the first workbench, bed, campfire and chests
    const o = sim.world.plotOrigin(plot);
    const clear = (tx: number, ty: number) => isHome && tx >= o.tx + PLOT / 2 - 6 && tx <= o.tx + PLOT / 2 + 5 && ty >= o.ty + PLOT / 2 - 5 && ty <= o.ty + PLOT / 2 + 4;
    for (const kind of kinds) {
        let spot = sim.world.randomFreeTile(plot, sim.rng, avoid);
        for (let again = 0; spot && clear(spot.tx, spot.ty) && again < 12; again++) spot = sim.world.randomFreeTile(plot, sim.rng, avoid);
        if (spot && !clear(spot.tx, spot.ty)) addNode(sim, titan.grown(sim, kind, spot.tx, spot.ty, plot), spot.tx, spot.ty, plot);
    }
}

