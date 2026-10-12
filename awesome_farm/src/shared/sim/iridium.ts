// Iridium: a violet metal that falls from the sky. At some dawns a VEIN surfaces on a far corner of somebody's land and sinks back two
// dawns later; a pick does nothing to it. Only the Iridium Drill gets the ore out: set within a few tiles of the vein it drills on its
// own, and the noise draws hunters: a wave steps out of a new direction every little while, bigger the more has been drilled, and goes
// for the drill (which breaks like any defense piece). Collect the ore with USE; smelt it into bars (furnace), make an Iridium Ring.
// Everything here uses its own dice (`Rng` from the seed and the day), so a world's own `sim.rng` stream is untouched until a wave comes.

import { TILE, TUNING } from '../config';
import { BUILDINGS } from '../data/buildings';
import { MOBS, nestKindFor, pickRaider } from '../data/mobs';
import { PAL } from '../palette';
import { Rng } from '../rng';
import * as blight from './blight';
import * as defense from './defense';
import * as gather from './gather';
import * as mobs from './mobs';
import * as raid from './raid';
import type { Sim } from './sim';
import type { BuildE, NodeE, PlayerS } from './types';

const T = TUNING.iridium;

/** Every iridium vein in the world. */
export const veins = (sim: Sim): NodeE[] => Object.values(sim.s.ents).filter((e): e is NodeE => e.k === 'node' && e.kind === 'iridium');

/** "north-east, 24 tiles": where a spot lies from a farmer's base. */
export function where (sim: Sim, p: PlayerS, at: { x: number; y: number }) {
    const base = blight.baseOf(sim, p);
    return `${raid.SECTORS[raid.sectorOf(base, at)]}, ${Math.round(Math.hypot(at.x - base.x, at.y - base.y) / TILE)} tiles`;
}

/** Dawn: veins past their time sink back; maybe a new one surfaces. (`sim.s.day` is already the new day.) */
export function onDawn (sim: Sim) {
    const s = sim.s;
    for (const v of veins(sim)) {
        if ((v.ex ?? 0) > s.day) continue;
        const c = sim.center(v);
        sim.remove(v.id);
        sim.fx('breakCrystal', c.x, c.y);
        for (const p of sim.online) sim.banner('The iridium sank back', 'The sky-metal slipped away into the ground.', PAL.plum, p.id);
    }
    if (s.day < T.fromDay || veins(sim).length) return;
    const rng = new Rng(`${s.seed}:iridium:${s.day}`);
    if (!rng.chance(T.chance)) return;
    const owned = s.plots.filter((p) => p.owned && !p.dread && p.blight !== 1);
    const homes = sim.online.map((p) => sim.world.plotCenter(sim.homePlot(p.slot)));
    for (let tries = 0; tries < 40 && owned.length; tries++) {
        const plot = rng.pick(owned);
        const spot = sim.world.randomFreeTile(plot, rng, undefined, 2);
        if (!spot || sim.world.sealed(spot.tx, spot.ty)) continue;
        const at = { x: (spot.tx + 0.5) * TILE, y: (spot.ty + 0.5) * TILE };
        if (homes.some((h) => Math.hypot(h.x - at.x, h.y - at.y) < T.homeGap * TILE)) continue;
        const v = gather.addNode(sim, 'iridium', spot.tx, spot.ty, plot);
        v.hp = T.ore;
        v.ex = s.day + T.lifeDays;
        sim.touch(v);
        sim.fx('nestSpread', at.x, at.y);
        for (const p of sim.online) {
            sim.banner('Iridium has fallen!', `A vein surfaced to the ${where(sim, p, at)}. It sinks back in ${T.lifeDays} days: build an Iridium Drill beside it.`, PAL.plum, p.id);
            sim.toast(p.id, `Iridium vein: ${where(sim, p, at)}`, 'i_iridium_ore', PAL.plum);
        }
        return;
    }
}

/** The drills: work the vein beside them, and draw the hunters. */
export function step (sim: Sim, dt: number) {
    const drills = sim.buildings('iridium_drill');
    if (!drills.length) return;
    const vs = veins(sim);
    for (const b of drills) {
        const c = sim.center(b);
        const v = vs.find((n) => sim.ents('node').includes(n) && Math.hypot(sim.center(n).x - c.x, sim.center(n).y - c.y) <= T.range * TILE);
        if (!v || v.hp <= 0) continue;
        const was = Math.floor(b.ip ?? 0);
        b.ip = (b.ip ?? 0) + dt;
        b.iw = (b.iw ?? 0) + dt;
        if (Math.floor(b.ip) !== was) sim.touch(b);        // (the clients animate it from these once-a-second changes)
        if (b.ip >= T.cycle) {
            b.ip = 0;
            const out = (b.out ??= {});
            out.iridium_ore = (out.iridium_ore ?? 0) + 1;
            b.ido = (b.ido ?? 0) + 1;
            v.hp -= 1;
            sim.fx('smelt', c.x, c.y);
            sim.touch(b);
            if (v.hp <= 0) {
                const vc = sim.center(v);
                sim.remove(v.id);
                sim.fx('breakCrystal', vc.x, vc.y);
                const who = b.by ? sim.s.players[b.by] : undefined;
                if (who?.online) sim.banner('The vein is spent', `${b.ido} ore drilled: collect it from the drill (USE).`, PAL.plum, who.id);
                continue;
            }
        }
        if (b.iw >= T.waveEvery) { b.iw = 0; wave(sim, b); }
    }
}

/** One wave of hunters, stepping out of the next direction round, bound for the drill. */
function wave (sim: Sim, b: BuildE) {
    const c = sim.center(b);
    const who = (b.by ? sim.s.players[b.by] : undefined) ?? sim.online[0];
    const plot = sim.world.plotAt(b.tx, b.ty);
    const n = Math.min(T.waveMax, 1 + Math.floor((b.ido ?? 0) / T.wavePer));
    const lv = (who ? mobs.groupLevel(sim, who) : 1) + 1;
    const sector = ((b.iwn ?? 0) * 3 + b.id) % 8;
    b.iwn = (b.iwn ?? 0) + 1;
    const a = sector * (Math.PI / 4), far = T.spawnTiles * TILE;
    const pt = { x: c.x + Math.cos(a) * far, y: c.y + Math.sin(a) * far };
    const at = raid.stagingSpot(sim, c, pt, far, far);
    const kind = nestKindFor(plot?.biome ?? 'meadow');
    for (let i = 0; i < n; i++) {
        const k = pickRaider(kind, lv, () => sim.rng.next());
        const m = mobs.spawnMob(sim, k, undefined, plot?.i, { lv, pack: false, hm: 1.25, dm: 1.1, x: at.x + (sim.rng.next() - 0.5) * 4 * TILE, y: at.y + (sim.rng.next() - 0.5) * 4 * TILE });
        if (!m) continue;
        m.rd = [Math.round(c.x), Math.round(c.y)];
        sim.touch(m);
    }
    void MOBS;
    for (const p of sim.online) if (Math.hypot(p.x - c.x, p.y - c.y) < 40 * TILE) sim.toast(p.id, `The drilling draws hunters from the ${raid.SECTORS[raid.sectorOf(c, at)]}`, 'k_skull', PAL.berry);
}

/** USE on the drill: take the ore; with none waiting, mend it, or say what it is doing. */
export function use (sim: Sim, p: PlayerS, b: BuildE) {
    const c = sim.center(b);
    const n = b.out?.iridium_ore ?? 0;
    if (n > 0) {
        const got = sim.give(p, 'iridium_ore', n, c.x, c.y);
        b.out!.iridium_ore = n - got;
        if (!b.out!.iridium_ore) delete b.out!.iridium_ore;
        sim.touch(b);
        sim.float(c.x, c.y - 16, `+${got} iridium ore`, PAL.plum, p.id);
        sim.fx('pickup', c.x, c.y, p.id);
        return;
    }
    if (b.hp !== undefined && b.hp < (BUILDINGS.iridium_drill.hp ?? 0)) { defense.repair(sim, p, b); return; }
    const v = veins(sim).find((q) => Math.hypot(sim.center(q).x - c.x, sim.center(q).y - c.y) <= T.range * TILE);
    sim.float(c.x, c.y - 16, v ? `Drilling: ${v.hp} ore left in the vein` : `No vein within ${T.range} tiles`, v ? PAL.plum : PAL.berry, p.id);
}
