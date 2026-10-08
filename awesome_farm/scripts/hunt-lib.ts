// The hunting-ground model behind scripts/balance-hunt.ts and tests/hunt.test.ts.
import { TUNING } from '../src/shared/config';
import type { Biome } from '../src/shared/data/biomes';
import type { ItemId } from '../src/shared/data/items';
import { MOBS } from '../src/shared/data/mobs';
import { Sim } from '../src/shared/sim/sim';
import type { MobE } from '../src/shared/sim/types';

const STEP = 1 / 20;

/** The level a farmer is around when they go for a boss sigil (monsters are tuned to it). */
export const HUNT_LEVEL = 16;

export const HUNTS: { sigil: string; biome: Biome; need: Partial<Record<ItemId, number>> }[] = [
    { sigil: 'Stone Colossus', biome: 'quarry', need: { rockheart: 4 } },
    { sigil: 'Bog Witch', biome: 'bog', need: { ectoplasm: 8, toadskin: 4 } },
    { sigil: 'Dune Pharaoh', biome: 'goldsand', need: { scarabshell: 10 } },
    { sigil: 'Frost Giant', biome: 'snowcap', need: { frostshard: 8 } },
];

/** Expected wanted drops and monster counts over a few nights, if every monster that spawned were killed. */
export function perNight (seed: string, biome: Biome, need: Partial<Record<ItemId, number>>, nights: number, level = HUNT_LEVEL) {
    const sim = Sim.create(seed, 'hunt');
    sim.cheats = true;
    const p = sim.join('p', 'P')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const w = sim.world;
    const ground = w.plot(w.ownedPlots()[0].gx, w.ownedPlots()[0].gy)!;
    ground.biome = biome;
    const other = w.plot(ground.gx + 1, ground.gy);
    if (other) { other.owned = ground.owned; other.biome = 'meadow'; }
    sim.s.day = 40;
    p.level = level;
    const c = w.plotCenter(ground);
    const got: Record<string, number> = {};
    const spawned: Record<string, number> = {};
    for (let night = 0; night < nights; night++) {
        p.x = c.x; p.y = c.y; p.warp++;
        sim.s.clock = TUNING.dayLength - 0.5;
        const day = sim.s.day;
        const seen = new Set<number>();
        for (let t = 0; t < 400 && sim.s.day === day; t += STEP) {
            sim.step(STEP);
            p.hearts = 99; p.downed = 0;
            for (const e of Object.values(sim.s.ents)) {
                if (e.k !== 'mob' || seen.has(e.id)) continue;
                seen.add(e.id);
                const m = e as MobE;
                spawned[m.kind] = (spawned[m.kind] ?? 0) + 1;
                for (const d of MOBS[m.kind].drops) if (d[0] in need) got[d[0]] = (got[d[0]] ?? 0) + d[1] * ((d[2] ?? 1) + (d[3] ?? d[2] ?? 1)) / 2;
            }
        }
    }
    return { got, spawned };
}


/** Nights of killing everything to collect a hunt's drops, averaged over a few worlds. */
export function nightsNeeded (h: typeof HUNTS[number], worlds: number, nights: number) {
    const tot: Record<string, number> = {};
    const kinds: Record<string, number> = {};
    for (let i = 0; i < worlds; i++) {
        const r = perNight(`HUNT-${h.biome}-${i}`, h.biome, h.need, nights);
        for (const [k, v] of Object.entries(r.got)) tot[k] = (tot[k] ?? 0) + v;
        for (const [k, v] of Object.entries(r.spawned)) kinds[k] = (kinds[k] ?? 0) + v;
    }
    const nightsFor = Math.max(...(Object.entries(h.need) as [ItemId, number][]).map(([item, n]) => n / Math.max(0.001, (tot[item] ?? 0) / (worlds * nights))));
    const per = (k: string) => (kinds[k] ?? 0) / (worlds * nights);
    return { nights: nightsFor, per };
}
