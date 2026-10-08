// The caves under the world. A Mine Shaft on the surface leads down to a landing in a second map as big as the first, made of rock:
// dig it with your pick (every tile you break stays open for good), find ore in the rock and treasure in the dark, and fight what lives there.
// The caves are the same size as the world and line up with it, so a shaft under your base opens right beneath your base.

import { TILE, TUNING, UNDER_Y } from '../config';
import { CAVE_N, CHAMBER_R, caveDepth } from '../cave';
import type { ItemId } from '../data/items';
import { pickCave } from '../data/mobs';
import { NODES, type NodeKind } from '../data/nodes';
import { PAL } from '../palette';
import { Rng } from '../rng';
import * as gather from './gather';
import * as mobs from './mobs';
import * as quests from './quests';
import type { Sim } from './sim';
import { derived } from './stats';
import type { BuildE, Cmd, PlayerS, Plot } from './types';

/** Is this height down in the caves? */
export const isUnder = (y: number) => y >= UNDER_Y * TILE;

/** What each kind of ore needs to be broken (hit points; a plain rock is 4), and the node it counts as for quests. */
const HARD: Record<string, { hp: number; node: NodeKind; xp: number }> = {
    coal: { hp: 5, node: 'coal', xp: 4 }, iron: { hp: 6, node: 'iron', xp: 5 }, copper: { hp: 6, node: 'copper', xp: 5 },
    goldore: { hp: 7, node: 'gold', xp: 6 }, crystal: { hp: 10, node: 'crystal', xp: 16 },
};

/** Make sure the caves exist on this side (and note that they do in the save). Returns true if this is the first time. */
export function ensure (sim: Sim): boolean {
    const first = !sim.s.mine;
    const m = (sim.s.mine ??= { dug: [] });
    sim.world.ensureCave(m.dug);
    if (!m.stocked) { stock(sim); m.stocked = 1; }
    return first;
}

/** Open a tile for good and remember it (and tell the clients). Returns true if there was rock to open. */
export function open (sim: Sim, tx: number, ty: number): boolean {
    const i = sim.world.idx(tx, ty);
    if (!sim.world.openTile(i)) return false;
    (sim.s.mine ??= { dug: [] }).dug.push(i);
    sim.dirtyDug.push(i);
    return true;
}

/** The first stock of the caves: treasure chests, crystals, mushrooms and a few vaults far from the middle, all on open ground. */
/**
 * A plot for nodes that stand on no island (the caves, the developer menu's spawns): `addNode` counts on it, and nothing else ever
 * sees it. The nodes still carry plot 0's index, because the client paints a node in its plot's biome and has no guard for a missing
 * one; every reader on this side (Sim.remove, the respawn counts, mounds, titans) checks the node really stands on the plot it names.
 */
export const ghostPlot = (sim: Sim): Plot => ({ ...sim.s.plots[0] });

/** Dawn: the rock heals. Half-dug tiles are whole again (and the table of them does not grow for ever). */
export function onDawn (sim: Sim) { sim.digHp.clear(); }

function stock (sim: Sim) {
    const w = sim.world, rng = new Rng(`${sim.s.seed}:cavestock`);
    const ghost = ghostPlot(sim);
    const put = (kind: NodeKind, want: number, minDepth = 0, nearRock = false) => {
        for (let n = 0, tries = 0; n < want && tries < want * 60; tries++) {
            const x = rng.int(8, CAVE_N - 9), y = rng.int(8, CAVE_N - 9), tx = x, ty = UNDER_Y + y;
            if (caveDepth(x, y) < minDepth || w.rockAt(tx, ty) || !w.isFree(tx, ty)) continue;
            if (nearRock && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.rockAt(tx + dx, ty + dy))) continue;
            gather.addNode(sim, kind, tx, ty, ghost);
            n++;
        }
    };
    put('chest', 70);
    put('crystal', 60, 0.3, true);
    put('mushroom', 140);
    // every ancient chamber has a vault in the middle and a chest in two of its corners
    for (const c of w.caveChambers()) {
        const tx = c.x, ty = UNDER_Y + c.y;
        gather.addNode(sim, 'vault', tx, ty, ghost);
        for (const [dx, dy] of [[-2, -2], [2, 2]]) if (w.isFree(tx + dx, ty + dy)) gather.addNode(sim, 'chest', tx + dx, ty + dy, ghost);
    }
}

// ── down and up ─────────────────────────────────────────────────────────────
/** The ladder under a shaft, with a little room dug out round it. */
function landing (sim: Sim, shaft: BuildE): BuildE {
    const old = sim.buildings('mineladder').find((e) => e.lnk === shaft.id);
    if (old) return old;
    const lx = Math.max(6, Math.min(CAVE_N - 7, shaft.tx + 1)), ly = UNDER_Y + Math.max(6, Math.min(CAVE_N - 7, shaft.ty + 1));
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) open(sim, lx + dx, ly + dy);
    // whatever grew there makes way for it
    const at = sim.world.occAt(lx, ly);
    if (at > 0) sim.remove(at);
    return sim.add<BuildE>({ k: 'bld', kind: 'mineladder', tx: lx, ty: ly, rot: 0, lnk: shaft.id, by: shaft.by });
}

export function descend (sim: Sim, p: PlayerS, shaft: BuildE) {
    if (p.rift || p.downed > 0 || isUnder(p.y)) return;
    const first = ensure(sim);
    const lad = landing(sim, shaft);
    const from = { x: p.x, y: p.y };
    p.x = (lad.tx + 0.5) * TILE; p.y = (lad.ty + 1) * TILE - 2; p.warp++; p.moving = false;
    sim.fx('descend', from.x, from.y - 8, p.id);
    sim.fx('descend', p.x, p.y - 8, p.id);
    sim.banner('The caves', first ? 'Dig the rock with your pick. Ore hides in it. It is dark: bring a lantern, and friends.' : 'Mind the dark.', PAL.plum, p.id);
    quests.count(p, 'descend');
}

export function ascend (sim: Sim, p: PlayerS, ladder: BuildE) {
    if (p.downed > 0 || !isUnder(p.y)) return;
    const shaft = ladder.lnk !== undefined ? sim.s.ents[ladder.lnk] : undefined;
    if (!shaft || shaft.k !== 'bld' || shaft.kind !== 'mineshaft') { sim.respawnHome(p, 'The way up was closed: you woke up at home'); return; }
    const spot = sim.nearestFree(shaft.tx + 1, shaft.ty + 2) ?? { tx: shaft.tx + 1, ty: shaft.ty + 2 };
    const from = { x: p.x, y: p.y };
    p.x = (spot.tx + 0.5) * TILE; p.y = (spot.ty + 1) * TILE - 2; p.warp++; p.moving = false;
    sim.fx('descend', from.x, from.y - 8, p.id);
    sim.fx('descend', p.x, p.y - 8, p.id);
}

/** A shaft that is taken down takes its ladder with it, and anyone still below is brought up. */
export function onRemove (sim: Sim, e: BuildE) {
    if (e.kind !== 'mineshaft') return;
    for (const l of sim.buildings('mineladder')) {
        if (l.lnk !== e.id) continue;
        const c = sim.center(l);
        for (const p of sim.online) {
            if (!isUnder(p.y) || Math.hypot(p.x - c.x, p.y - c.y) > 24 * TILE) continue;
            const spot = sim.nearestFree(e.tx, e.ty) ?? { tx: e.tx, ty: e.ty };
            p.x = (spot.tx + 0.5) * TILE; p.y = (spot.ty + 1) * TILE - 2; p.warp++; p.moving = false;
            sim.banner('The shaft is gone', 'You were brought up', PAL.cream, p.id);
        }
        sim.remove(l.id);
    }
}

// ── digging ─────────────────────────────────────────────────────────────────
export function cmdDig (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'dig' }>) {
    const tx = c.tx, ty = c.ty;
    if (!Number.isInteger(tx) || !Number.isInteger(ty) || !isUnder(p.y) || p.swingCd > 0.05) return;
    const w = sim.world;
    if (!w.rockAt(tx, ty)) return;
    const d = derived(p);
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    if (Math.hypot(cx - (p.x + p.fx * 4), cy - (p.y - 5 + p.fy * 4)) > d.reach + 14 && Math.hypot(cx - p.x, cy - (p.y - 5)) > d.reach + 14) return;
    // only rock that touches open ground: no digging through a wall to what is behind it
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !w.rockAt(tx + dx, ty + dy) && w.isLand(tx + dx, ty + dy))) return;
    const ore = w.oreAt(tx, ty), hard = ore ? HARD[ore] : undefined;
    if (ore === 'crystal' && d.toolTier < 2) { sim.deny(p, 'Needs a better pick'); return; }
    p.swingCd = d.swingCd;
    p.energy = Math.max(0, p.energy - d.swingEnergy);
    sim.events.push({ e: 'swing', by: p.id, x: cx, y: cy });
    const i = w.idx(tx, ty);
    let dmg = d.toolPower;
    const crit = d.mods.nodeCrit ?? 0;
    if (crit > 0 && sim.rng.chance(crit)) dmg *= 2;
    const hp = (sim.digHp.get(i) ?? hard?.hp ?? 4) - dmg;
    if (hp > 0) { sim.digHp.set(i, hp); sim.fx(ore === 'crystal' ? 'hitCrystal' : 'hitStone', cx, cy, p.id); return; }
    sim.digHp.delete(i);
    open(sim, tx, ty);
    sim.fx(ore === 'crystal' ? 'breakCrystal' : ore ? 'breakOre' : 'breakRock', cx, cy, p.id);
    // what the rock held: stone, and ore if it was ore
    const bonus = (amount: number) => Math.floor(amount) + (sim.rng.chance(amount - Math.floor(amount)) ? 1 : 0);
    const drops: [ItemId, number][] = [];
    if (hard && ore) {
        drops.push([ore, sim.rng.int(1, 2) + bonus(d.mods.ore ?? 0)]);
        if (sim.rng.chance(0.4)) drops.push(['stone', 1]);
    } else {
        drops.push(['stone', sim.rng.int(1, 2) + bonus(d.mods.stone ?? 0)]);
        if (sim.rng.chance(0.08)) drops.push(['coal', 1]);
    }
    if (sim.rng.chance(d.luck)) for (const dr of drops) dr[1] *= 2;
    for (const [item, n] of drops) for (let k = 0; k < n; k++) sim.spawnDrop(item, cx, cy + 2);
    p.stats.harvested++;
    quests.count(p, ore && hard ? `harvest:${hard.node}` : 'harvest:rock');
    quests.count(p, 'mine');
    sim.gainXp(p, hard ? NODES[hard.node].xp : 1);
}

/** The guardians of the ancient chambers: while a vault is still shut, three elite creatures stand round it whenever somebody is near. */
function guardChambers (sim: Sim, under: PlayerS[]) {
    for (const c of sim.world.caveChambers()) {
        const cx = (c.x + 0.5) * TILE, cy = (UNDER_Y + c.y + 0.5) * TILE;
        const vault = sim.s.ents[sim.world.occAt(c.x, UNDER_Y + c.y)];
        if (!vault || vault.k !== 'node' || vault.kind !== 'vault') continue;            // opened: it is quiet now
        const near = under.filter((p) => Math.hypot(p.x - cx, p.y - cy) < 20 * TILE);
        if (!near.length) continue;
        const mine = sim.ents('mob').filter((e) => !!e.und && Math.hypot(e.x - cx, e.y - cy) < (CHAMBER_R + 3) * TILE);
        const lv = Math.max(...near.map((p) => mobs.groupLevel(sim, p))) + 2;
        for (let n = mine.length; n < 3; n++) {
            const a = (n / 3) * Math.PI * 2 + 0.6;
            const x = cx + Math.cos(a) * 2.6 * TILE, y = cy + Math.sin(a) * 2.6 * TILE;
            if (sim.world.boxBlocked(x, y, 4, 3)) continue;
            const kind = pickCave(lv, Math.max(0.6, caveDepth(c.x, c.y)), () => sim.rng.next());
            const m = mobs.spawnMob(sim, kind, undefined, undefined, { x, y, lv, elite: true, pack: false });
            if (m) { m.und = 1; m.guard = 1; sim.touch(m); }
        }
    }
}

// ── what lives down there ───────────────────────────────────────────────────
/** Every few seconds: send the cave's creatures after whoever is digging, and let them rest where nobody is. */
export function update (sim: Sim) {
    if (sim.s.tick % 60 !== 30) return;
    const under = sim.online.filter((p) => p.downed <= 0 && isUnder(p.y));
    const mine = sim.ents('mob').filter((e) => !!e.und);
    // creatures far from every digger go away (silently: they come back when somebody does)
    for (const m of mine) if (!under.some((p) => Math.hypot(p.x - m.x, p.y - m.y) < 760)) sim.remove(m.id);
    guardChambers(sim, under);
    for (const p of under) {
        const near = mine.filter((m) => sim.s.ents[m.id] && Math.hypot(p.x - m.x, p.y - m.y) < 420).length;
        const lv = mobs.groupLevel(sim, p);
        const want = Math.min(TUNING.caveMax, TUNING.caveBase + Math.floor(lv / 6));
        if (near >= want) continue;
        for (let tries = 0; tries < 8; tries++) {
            const a = sim.rng.next() * Math.PI * 2, r = 130 + sim.rng.next() * 170;
            const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
            if (!sim.world.isLand(tx, ty) || sim.world.occAt(tx, ty) !== 0 || sim.world.boxBlocked(x, y, 4, 3)) continue;
            if (sim.online.some((q) => Math.hypot(q.x - x, q.y - y) < 110) || sim.nearFire(x, y)) continue;
            const depth = caveDepth(tx, ty - UNDER_Y);
            const kind = pickCave(lv, depth, () => sim.rng.next());
            const m = mobs.spawnMob(sim, kind, undefined, undefined, { x, y, lv, elite: sim.rng.chance(0.06 + depth * 0.14), pack: false });
            if (m) { m.und = 1; m.guard = 1; sim.touch(m); }
            break;
        }
    }
}
