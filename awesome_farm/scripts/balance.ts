// Balance probe: a very simple fighter (walks at the nearest monster, swings, drinks a potion
// when low, never dodges) runs every expedition tier with typical gear for the recommended
// level. A person dodges and plays boons far better than this, so treat the numbers as a floor:
// roughly 25–70% means a tier is about right for people at that level.
//   npx tsx scripts/balance.ts [runsPerCell]

import { TILE } from '../src/shared/config';
import { MOBS } from '../src/shared/data/mobs';
import { RIFT_TIERS } from '../src/shared/data/rift';
import type { ItemId } from '../src/shared/data/items';
import { Sim } from '../src/shared/sim/sim';
import { derived } from '../src/shared/sim/stats';
import type { BuildE, MobE, PlayerS } from '../src/shared/sim/types';

const STEP = 1 / 20;
const RUNS = Number(process.argv[2] ?? 8);

interface Kit { level: number; weapon: ItemId; head?: ItemId; body?: ItemId; charm?: ItemId; skills: Record<string, number> }
const KITS: Kit[] = [
    { level: 6, weapon: 'sword_iron', body: 'mail_iron', skills: { c_vit: 3, c_skin: 1 } },
    { level: 12, weapon: 'sword_steel', head: 'helm_steel', body: 'plate_steel', skills: { c_vit: 6, c_skin: 3, c_edge: 2 } },
    { level: 20, weapon: 'sword_crystal', head: 'helm_crystal', body: 'plate_crystal', charm: 'charm_vital', skills: { c_vit: 6, c_skin: 4, c_guard: 3, c_edge: 3 } },
    { level: 28, weapon: 'sword_pharaoh', head: 'helm_frost', body: 'plate_colossus', charm: 'charm_scarab', skills: { c_vit: 6, c_skin: 4, c_guard: 3, c_edge: 4 } },
    { level: 36, weapon: 'sword_rift', head: 'helm_rift', body: 'plate_rift', charm: 'charm_rift', skills: { c_vit: 6, c_skin: 4, c_guard: 3, c_edge: 5 } },
    { level: 45, weapon: 'sword_rift', head: 'helm_rift', body: 'plate_rift', charm: 'charm_rift', skills: { c_vit: 6, c_skin: 4, c_guard: 3, c_edge: 5, c_resolve: 1, c_brawn: 5, c_heal: 3 } },
];

function setup (seed: string, tier: number, party: number) {
    const sim = Sim.create(seed, 'bal');
    sim.cheats = true;
    const players: PlayerS[] = [];
    for (let i = 0; i < party; i++) {
        const p = sim.join('p' + i, 'P' + i)!;
        players.push(p);
        const kit = KITS[tier];
        p.level = kit.level;
        p.equip = { tool: 'pick_flint', weapon: kit.weapon, ...(kit.head ? { head: kit.head } : {}), ...(kit.body ? { body: kit.body } : {}), ...(kit.charm ? { charm: kit.charm } : {}) };
        p.skills = { ...kit.skills };
        p.boss = Object.fromEntries(['slime', 'stone', 'bog', 'dune', 'frost'].slice(0, RIFT_TIERS[tier].need).map((b) => [b, 1]));
        p.inv.potion_heal = 6;
        p.hearts = derived(p).maxHearts;
    }
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(players[0].slot));
    players.forEach((p, i) => { p.x = (o.tx + 6) * TILE + i * 10; p.y = (o.ty + 8) * TILE; });
    const dock = sim.add<BuildE>({ k: 'bld', kind: 'dock', tx: o.tx + 5, ty: o.ty + 5, rot: 0, by: 'p0' });
    return { sim, players, dock };
}

function fight (sim: Sim, p: PlayerS) {
    const d = derived(p);
    if (p.downed > 0) return;
    let best: MobE | null = null, bd = Infinity;
    for (const e of Object.values(sim.s.ents)) {
        if (e.k !== 'mob' || e.rift !== p.rift?.arena) continue;
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (dist < bd) { bd = dist; best = e; }
    }
    if (p.hearts <= 1.5 && (p.inv.potion_heal ?? 0) > 0) sim.command(p.id, { t: 'eat', item: 'potion_heal' });
    if (!best) return;
    const reach = Math.max(d.reach, d.weapon.reach) - 4;
    if (bd > reach) {
        const dx = best.x - p.x, dy = best.y - p.y, l = Math.max(1, Math.hypot(dx, dy));
        const nx = p.x + (dx / l) * d.speed * STEP, ny = p.y + (dy / l) * d.speed * STEP;
        sim.command(p.id, { t: 'move', x: nx, y: ny, fx: dx / l, fy: dy / l, moving: true });
    } else {
        p.swingCd = Math.max(0, p.swingCd);
        sim.command(p.id, { t: 'swing', id: best.id });
    }
    p.energy = Math.max(p.energy, 40);
}

function runOnce (seed: string, tier: number, party: number) {
    const { sim, players, dock } = setup(seed, tier, party);
    sim.command('p0', { t: 'rift', op: 'launch', id: dock.id, tier });
    if (!players[0].rift) return { win: false, waves: 0, secs: 0, why: 'no launch' };
    const t0 = sim.s.time;
    for (let i = 0; i < 20 * 60 * (RIFT_TIERS[tier].endless ? 12 : 25); i++) {
        for (const p of players) {
            if (p.rift?.ph === 2 && p.rift.offer) sim.command(p.id, { t: 'rift', op: 'pick', i: Math.floor(sim.rng.next() * 3) });
            if (p.rift) fight(sim, p);
        }
        sim.step(STEP);
        const v = players[0].rift;
        if (!v || v.ph === 3) break;
    }
    const v = players[0].rift;
    return { win: !!v?.win, waves: v ? (v.win ? v.waves : v.wave - 1) : 0, secs: Math.round(sim.s.time - t0), why: '' };
}

console.log(`tier                 party  clears  avg waves  avg secs   (${RUNS} runs each; dumb bot, no dodging)`);
for (const party of [1, 3]) {
    for (let tier = 0; tier < RIFT_TIERS.length; tier++) {
        let wins = 0, waves = 0, secs = 0;
        for (let r = 0; r < RUNS; r++) {
            const res = runOnce(`BAL-${tier}-${party}-${r}`, tier, party);
            if (res.win) wins++;
            waves += res.waves; secs += res.secs;
        }
        const t = RIFT_TIERS[tier];
        console.log(`${(t.name + ' (lv ' + t.level + ')').padEnd(22)} ${String(party).padStart(3)}   ${String(Math.round((wins / RUNS) * 100) + '%').padStart(5)}   ${(waves / RUNS).toFixed(1).padStart(7)}/${t.endless ? '∞' : t.waves}   ${String(Math.round(secs / RUNS)).padStart(6)}`);
    }
}
void MOBS;
