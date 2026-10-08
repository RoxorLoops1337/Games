// Boss probe: a simple fighter (melee or ranged) against each altar boss with typical gear. It walks
// at the boss, swings, drinks potions when low and never dodges the telegraphs, so a clear is
// a good sign (the fight can be won) and a stall is a bug (a boss nobody can reach).
//   npx tsx scripts/balance-bosses.ts [runs]

import { TILE } from '../src/shared/config';
import { BOSS_ORDER, BOSSES } from '../src/shared/data/mobs';
import type { ItemId } from '../src/shared/data/items';
import { Sim } from '../src/shared/sim/sim';
import { derived } from '../src/shared/sim/stats';
import type { BuildE, MobE, PlayerS } from '../src/shared/sim/types';

const STEP = 1 / 20;
const RUNS = Number(process.argv[2] ?? 4);

interface Kit { weapon: ItemId; head?: ItemId; body?: ItemId; charm?: ItemId; skills: Record<string, number>; level: number }
const KITS: Record<string, Kit> = {
    slime: { level: 12, weapon: 'sword_iron', body: 'mail_iron', skills: { c_vit: 4, c_skin: 2 } },
    stone: { level: 14, weapon: 'sword_steel', head: 'helm_steel', body: 'plate_steel', skills: { c_vit: 6, c_skin: 3, c_edge: 2 } },
    bog: { level: 18, weapon: 'sword_steel', head: 'helm_steel', body: 'plate_steel', skills: { c_vit: 6, c_skin: 4, c_edge: 3 } },
    dune: { level: 22, weapon: 'sword_crystal', head: 'helm_crystal', body: 'plate_crystal', skills: { c_vit: 6, c_skin: 4, c_guard: 2, c_edge: 3 } },
    frost: { level: 26, weapon: 'sword_crystal', head: 'helm_crystal', body: 'plate_crystal', charm: 'charm_vital', skills: { c_vit: 6, c_skin: 4, c_guard: 3, c_edge: 4 } },
    heart: { level: 36, weapon: 'sword_pharaoh', head: 'helm_frost', body: 'plate_colossus', charm: 'charm_heart', skills: { c_vit: 6, c_skin: 4, c_guard: 3, c_edge: 4 } },
};
const RANGED: Record<string, ItemId> = { sword_iron: 'bow_long', sword_steel: 'bow_long', sword_crystal: 'bow_frost', sword_pharaoh: 'bow_frost' };

function once (boss: string, seed: string, ranged: boolean, party: number) {
    const sim = Sim.create(seed, 'bal');
    sim.cheats = true;
    const kit = KITS[boss];
    const players: PlayerS[] = [];
    for (let i = 0; i < party; i++) {
        const p = sim.join('p' + i, 'P' + i)!;
        p.level = kit.level;
        p.equip = { tool: 'pick_flint', weapon: ranged ? RANGED[kit.weapon] : kit.weapon, ...(kit.head ? { head: kit.head } : {}), ...(kit.body ? { body: kit.body } : {}), ...(kit.charm ? { charm: kit.charm } : {}) };
        p.skills = { ...kit.skills };
        p.inv.potion_heal = 8;
        p.hearts = derived(p).maxHearts;
        players.push(p);
    }
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    // the heart boss lives on the centre plot; the others on a home plot
    const heart = boss === 'heart';
    const plot = heart ? sim.world.plot(8, 8)! : sim.homePlot(players[0].slot);
    if (heart) { plot.owned = true; sim.world.recompute(); }
    const o = sim.world.plotOrigin(plot);
    const altar = sim.add<BuildE>({ k: 'bld', kind: 'altar', tx: o.tx + 5, ty: o.ty + 3, rot: 0, by: 'p0' });
    players.forEach((p, i) => { p.x = (o.tx + 6) * TILE + i * 12; p.y = (o.ty + 7) * TILE; p.hearts = derived(p).maxHearts; });
    const info = BOSSES[boss].info;
    sim.give(players[0], info.sigil, 1);
    sim.command('p0', { t: 'summon', id: altar.id, boss });
    let target: MobE | undefined;
    const t0 = sim.s.time;
    let downs = 0;
    let taken = 0, hits = 0;
    const srcs: Record<string, number> = {};
    const orig = sim.hurt.bind(sim);
    sim.hurt = (p, from, amount) => { const before = p.hearts; const src = (from as { kind?: string; k?: string }).kind ?? (from as { k?: string }).k ?? 'blast'; srcs[src] = (srcs[src] ?? 0) + amount; orig(p, from, amount); const lost = Math.max(0, before - p.hearts); taken += lost; if (lost > 0) hits++; };
    for (let i = 0; i < 20 * 60 * 6; i++) {
        target = Object.values(sim.s.ents).find((e): e is MobE => e.k === 'mob' && !!BOSSES[boss] && e.kind === BOSSES[boss].kind);
        if (!target) break;
        for (const p of players) {
            if (p.downed > 0) { downs++; continue; }
            const d = derived(p);
            let best: MobE | null = null, bd = Infinity;
            for (const e of Object.values(sim.s.ents)) if (e.k === 'mob') { const dist = Math.hypot(e.x - p.x, e.y - p.y); if (dist < bd) { bd = dist; best = e; } }
            if (p.hearts <= 1.5 && (p.inv.potion_heal ?? 0) > 0) sim.command(p.id, { t: 'eat', item: 'potion_heal' });
            if (!best) continue;
            const reach = Math.max(d.reach, d.weapon.reach) - 4;
            if (bd > reach) {
                const dx = best.x - p.x, dy = best.y - p.y, l = Math.max(1, Math.hypot(dx, dy));
                sim.command(p.id, { t: 'move', x: p.x + (dx / l) * d.speed * STEP, y: p.y + (dy / l) * d.speed * STEP, fx: dx / l, fy: dy / l, moving: true });
            } else sim.command(p.id, { t: 'swing', id: best.id });
            p.energy = Math.max(p.energy, 40);
        }
        sim.step(STEP);
        if (players.every((p) => p.downed > 0)) break;
    }
    const left = Object.values(sim.s.ents).find((e): e is MobE => e.k === 'mob' && e.kind === BOSSES[boss].kind);
    if (process.env.SRC) console.log(boss, JSON.stringify(Object.fromEntries(Object.entries(srcs).map(([k, v]) => [k, +v.toFixed(1)]))));
    return { win: !left, secs: Math.round(sim.s.time - t0), frac: left ? left.hp / left.mhp : 0, downs: Math.round(downs / 20), taken, hits, maxh: derived(players[0]).maxHearts };
}

console.log(`boss      weapon  party  clears  avg secs  boss hp left when it was not killed  (${RUNS} runs)`);
for (const boss of BOSS_ORDER) {
    for (const ranged of [false, true]) {
        for (const party of [1, 3]) {
            let wins = 0, secs = 0, frac = 0, taken = 0, hits = 0, maxh = 0;
            for (let r = 0; r < RUNS; r++) {
                const res = once(boss, `BB-${boss}-${ranged}-${party}-${r}`, ranged, party);
                if (res.win) wins++; else frac += res.frac;
                secs += res.secs; taken += res.taken; hits += res.hits; maxh = res.maxh;
            }
            const lost = RUNS - wins;
            console.log(`${boss.padEnd(9)} ${(ranged ? 'bow' : 'sword').padEnd(6)} ${String(party).padStart(4)}  ${String(Math.round((wins / RUNS) * 100) + '%').padStart(6)}  ${String(Math.round(secs / RUNS)).padStart(8)}  ${lost ? Math.round((frac / lost) * 100) + '%' : '-'}   hearts lost/run ${(taken / RUNS).toFixed(1)} of ${maxh} (${Math.round(hits / RUNS)} hits)`);
        }
    }
}
