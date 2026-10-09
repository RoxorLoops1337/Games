// The defenses against the Blight's raids. Walls, doorways and towers have hit points (`BuildingDef.hp`); a raider stopped by one
// strikes it now and then (sim/raid.ts), a piece at 0 breaks (it is gone, nothing is given back), and everything hurt mends at dawn.
// A building's damage is `BuildE.hp` (the hit points left; none: whole). Towers (`BuildingDef.tower`) shoot the nearest monster in
// range when they are ready (an Archer Tower, a Ballista, a Tesla Coil that needs power and chains); a Spike Trap bites what walks over
// it. Their kills are their builder's (XP and drops), online or not; they never shoot creatures, farmers or bosses.

import { TILE, TUNING } from '../config';
import { BUILDINGS } from '../data/buildings';
import { MOBS } from '../data/mobs';
import { PAL } from '../palette';
import * as combat from './combat';
import type { Sim } from './sim';
import type { BuildE, MobE, PlayerS } from './types';

const B = TUNING.blight;

/** Runtime only: when each tower may fire next, and when each monster was last bitten by a spike. */
interface Mem { cd: Map<number, number>; bite: Map<number, number> }
const memory = new WeakMap<Sim, Mem>();
const mem = (sim: Sim): Mem => {
    let m = memory.get(sim);
    if (!m) { m = { cd: new Map(), bite: new Map() }; memory.set(sim, m); }
    return m;
};

/** A blow against a wall, doorway or tower: it loses hit points, and at none it breaks (nothing is given back). */
export function hitBuilding (sim: Sim, b: BuildE, dmg: number) {
    const max = BUILDINGS[b.kind].hp;
    if (!max || !sim.s.ents[b.id]) return;
    b.hp = Math.max(0, (b.hp ?? max) - dmg);
    sim.touch(b);
    const c = sim.center(b);
    if (b.hp > 0) { sim.fx('bldHit', c.x, c.y); return; }
    sim.fx('bldBreak', c.x, c.y);
    const owner = b.by ? sim.s.players[b.by] : undefined;
    if (owner?.online) sim.toast(owner.id, `Raiders broke your ${BUILDINGS[b.kind].name}`, 'k_skull', PAL.berry);
    sim.remove(b.id);
}

/** Dawn: every damaged defense is whole again. */
export function mend (sim: Sim) {
    for (const b of sim.buildings()) if (b.hp !== undefined) { delete b.hp; sim.touch(b); }
    mem(sim).bite.clear();
}

// ── towers and traps ────────────────────────────────────────────────────────
const TOWER_KINDS = ['tower_archer', 'ballista', 'tesla'] as const;

/** Could a tower or trap hurt this monster? (Not a boss, not on an expedition, not down in the caves.) */
const fair = (m: MobE) => !MOBS[m.kind].boss && !m.rb && m.rift === undefined && !m.und;

/** How hard a tower hits for its builder: a little more for every level they have. */
const towerMul = (owner: PlayerS | undefined) => 1 + B.towerLevel * Math.max(0, (owner?.level ?? 1) - 1);

function nearestMob (list: readonly MobE[], x: number, y: number, range: number, skip?: Set<number>): MobE | null {
    let best: MobE | null = null, bd = range;
    for (const m of list) {
        if (skip?.has(m.id) || !fair(m)) continue;
        const d = Math.hypot(m.x - x, m.y - 4 - y);
        if (d <= bd) { bd = d; best = m; }
    }
    return best;
}

function fire (sim: Sim, t: BuildE, list: readonly MobE[]): boolean {
    const def = BUILDINGS[t.kind];
    const spec = B[def.tower!];
    const owner = t.by ? sim.s.players[t.by] : undefined;
    const x = (t.tx + 0.5) * TILE, y = (t.ty + 0.5) * TILE - 10;
    const first = nearestMob(list, x, y, spec.range);
    if (def.tower === 'tesla') {
        const want = first ? 1 : 0;
        if ((t.act ?? 0) !== want) { t.act = want; sim.touch(t); }       // (it draws power while something is in range)
        if (!first || (t.pw ?? 0) <= 0.01) return false;
    }
    if (!first) return false;
    const dmg = spec.dmg * towerMul(owner);
    const hits: MobE[] = [first];
    if (def.tower === 'tesla') {
        const seen = new Set([first.id]);
        while (hits.length < B.tesla.chain) {
            const last = hits[hits.length - 1];
            const next = nearestMob(list, last.x, last.y - 4, B.tesla.hop, seen);
            if (!next) break;
            seen.add(next.id); hits.push(next);
        }
    }
    sim.events.push({ e: 'shot', k: def.tower === 'archer' ? 'arrow' : def.tower === 'ballista' ? 'bolt' : 'zap', x: Math.round(x), y: Math.round(y), to: hits.map((m) => [Math.round(m.x), Math.round(m.y - 5)] as [number, number]) });
    sim.fx(def.tower === 'archer' ? 'towerShot' : def.tower === 'ballista' ? 'ballista' : 'zap', x, y);
    for (const m of hits) combat.damageMob(sim, m, dmg * (def.tower === 'tesla' && m !== first ? 0.8 : 1), owner ?? null, { kx: m.x - x, ky: m.y - y, kb: def.tower === 'ballista' ? 120 : 30, quiet: true, nofloat: true });
    return true;
}

/** Every step: the towers look for a target when they are ready, and the spike traps bite whatever stands on them. */
export function update (sim: Sim) {
    const towers = TOWER_KINDS.flatMap((k) => sim.buildings(k));
    const spikes = sim.buildings('spike');
    if (!towers.length && !spikes.length) return;
    const list = sim.ents('mob');
    const m = mem(sim), now = sim.s.time;
    for (const t of towers) {
        if ((m.cd.get(t.id) ?? 0) > now) continue;
        const spec = B[BUILDINGS[t.kind].tower!];
        m.cd.set(t.id, now + (list.length && fire(sim, t, list) ? spec.every : 0.25));
    }
    if (!spikes.length || sim.s.tick % 4 !== 0) return;
    for (const e of list) {
        if (!fair(e) || MOBS[e.kind].flies || !sim.s.ents[e.id]) continue;
        const id = sim.world.floorAt(Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE));
        const trap = id ? sim.s.ents[id] : undefined;
        if (trap?.k !== 'bld' || !BUILDINGS[trap.kind].spike || (m.bite.get(e.id) ?? 0) > now) continue;
        m.bite.set(e.id, now + B.spikeEvery);
        const owner = trap.by ? sim.s.players[trap.by] : undefined;
        sim.fx('spike', e.x, e.y - 3);
        combat.damageMob(sim, e, B.spikeDmg * towerMul(owner), owner ?? null, { quiet: true, nofloat: true });
    }
}

/** What a tower says when you press E on it. */
export function towerWords (b: BuildE): string {
    const def = BUILDINGS[b.kind];
    const spec = B[def.tower!];
    const left = b.hp !== undefined ? `  (${Math.ceil(b.hp)} / ${def.hp} hp)` : '';
    if (def.tower === 'tesla' && (b.pw ?? 0) <= 0.01 && (b.act ?? 0) > 0) return `No power: it cannot fire${left}`;
    return `Guards ${Math.round(spec.range / TILE)} tiles around it${left}`;
}

