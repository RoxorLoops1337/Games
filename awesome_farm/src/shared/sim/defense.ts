// The defenses against the Blight's raids. Walls, doorways and towers have hit points (`BuildingDef.hp`); a raider stopped by one
// strikes it now and then (sim/raid.ts), a piece at 0 breaks (it is gone, nothing is given back), and everything hurt mends at dawn.
// A building's damage is `BuildE.hp` (the hit points left; none: whole). Towers (`BuildingDef.tower`) shoot the nearest monster in
// range when they are ready (an Archer Tower, a Ballista, a Tesla Coil that needs power and chains); a Spike Trap bites what walks over
// it. Their kills are their builder's (XP and drops), online or not; they never shoot creatures, farmers or bosses.

import { TILE, TUNING } from '../config';
import { BUILDINGS } from '../data/buildings';
import { MOBS } from '../data/mobs';
import { flightTime } from '../data/shotfx';
import { killXp, PERK_BY_ID, perksOf, levelOf, offer, pending, statsOf, towerType, type TowerStats, type TowerType } from '../data/towerperks';
import { hash } from '../weather';
import { PAL } from '../palette';
import * as combat from './combat';
import type { Sim } from './sim';
import type { BuildE, Cmd, MobE, PlayerS, ProjE } from './types';

const B = TUNING.blight;

/** Runtime only: when each tower may fire next, when each monster was last bitten by a spike, and running totals (the Defense Lab reads them). */
interface Mem {
    cd: Map<number, number>; bite: Map<number, number>; t: Tally;
    /** Monsters that are slowed or frozen: until when, the factor, and the speed multiplier they had. */
    slow: Map<number, { until: number; f: number; base: number | undefined }>;
    /** Monsters that burn or bleed: until when, damage a second, who set it, and when the next tick is due. */
    dot: Map<number, { until: number; dps: number; by: number; next: number }>;
    /** Shots each tower has fired (every Nth is overcharged). */
    shots: Map<number, number>;
}
/** Since the world loaded: monsters towers and traps killed, damage the defenses took, pieces broken. */
export interface Tally { kills: number; dmg: number; broke: number }
const memory = new WeakMap<Sim, Mem>();
const mem = (sim: Sim): Mem => {
    let m = memory.get(sim);
    if (!m) { m = { cd: new Map(), bite: new Map(), t: { kills: 0, dmg: 0, broke: 0 }, slow: new Map(), dot: new Map(), shots: new Map() }; memory.set(sim, m); }
    return m;
};
export const tally = (sim: Sim): Readonly<Tally> => mem(sim).t;
/** A defense piece's most hit points: a wall's own, a tower's with its perks. */
export function maxHp (b: BuildE): number {
    const t = towerType(b.kind);
    if (t && t !== 'spike') return statsOf(t, b.pk).hp;
    return BUILDINGS[b.kind].hp ?? 0;
}
const ownerOf = (sim: Sim, b: BuildE) => (b.by ? sim.s.players[b.by] : undefined);
/** The numbers of a tower or trap as it stands (its perks, its builder's level). */
export function statsFor (sim: Sim, b: BuildE): TowerStats | null {
    const t = towerType(b.kind);
    return t ? statsOf(t, b.pk, ownerOf(sim, b)?.level) : null;
}

/** XP for a tower or trap; a level reached makes a pick wait for its builder (and says so). */
export function addXp (sim: Sim, b: BuildE, n: number) {
    const type = towerType(b.kind);
    if (!type || !(n > 0)) return;
    const was = levelOf(b.xp);
    b.xp = (b.xp ?? 0) + n;
    sim.touch(b);
    const now = levelOf(b.xp);
    if (now <= was) return;
    const c = sim.center(b);
    sim.fx('levelUp', c.x, c.y - 4);
    const owner = ownerOf(sim, b);
    if (owner?.online) sim.toast(owner.id, `Your ${BUILDINGS[b.kind].name} reached level ${now}: choose an upgrade`, 'k_star', PAL.gold);
}

/** A tower or a trap strikes a monster; the kill (if it was one) and its XP are the tower's. */
function strike (sim: Sim, b: BuildE | null, m: MobE, dmg: number, o: Parameters<typeof combat.damageMob>[4]) {
    if (!sim.s.ents[m.id]) return;
    const owner = b ? ownerOf(sim, b) : undefined;
    const kind = m.kind, elite = !!m.el;
    combat.damageMob(sim, m, dmg, owner ?? null, o);
    if (sim.s.ents[m.id]) return;
    mem(sim).t.kills++;
    if (!b || !sim.s.ents[b.id]) return;
    const st = statsFor(sim, b)!;
    addXp(sim, b, killXp(MOBS[kind].xp, elite, !!MOBS[kind].boss) * st.xpMul);
    if (st.aura) auraMend(sim, b);
}

/** Vampiric Aura: a kill mends the hurt defenses round the tower. */
function auraMend (sim: Sim, b: BuildE) {
    const c = sim.center(b), r = TUNING.towers.auraTiles * TILE;
    for (const w of sim.buildings()) {
        if (w.hp === undefined) continue;
        const wc = sim.center(w);
        if (Math.hypot(wc.x - c.x, wc.y - c.y) > r) continue;
        const max = maxHp(w);
        w.hp = Math.min(max, w.hp + max * TUNING.towers.auraMend);
        if (w.hp >= max) delete w.hp;
        sim.touch(w);
    }
}

/** A blow against a wall, doorway or tower: it loses hit points, and at none it breaks (nothing is given back). */
export function hitBuilding (sim: Sim, b: BuildE, dmg: number) {
    const max = maxHp(b);
    if (!max || !sim.s.ents[b.id]) return;
    const was = b.hp ?? max;
    b.hp = Math.max(0, was - dmg);
    mem(sim).t.dmg += was - b.hp;
    sim.touch(b);
    const c = sim.center(b);
    if (b.hp > 0) { sim.fx('bldHit', c.x, c.y); return; }
    sim.fx('bldBreak', c.x, c.y);
    mem(sim).t.broke++;
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
const TW = TUNING.towers;

/** Could a tower or trap hurt this monster? (Not a boss, not on an expedition, not down in the caves.) */
const fair = (m: MobE) => !MOBS[m.kind].boss && !m.rb && m.rift === undefined && !m.und;

/** A tower, sorted by range: the monsters in range, nearest first (the list is this step's: one that died meanwhile is skipped). */
function inRange (sim: Sim, list: readonly MobE[], x: number, y: number, range: number, skip?: Set<number>): MobE[] {
    const out: { m: MobE; d: number }[] = [];
    for (const m of list) {
        if (skip?.has(m.id) || !fair(m) || !sim.s.ents[m.id]) continue;
        const d = Math.hypot(m.x - x, m.y - 4 - y);
        if (d <= range) out.push({ m, d });
    }
    return out.sort((a, b) => a.d - b.d).map((o) => o.m);
}
const nearestMob = (sim: Sim, list: readonly MobE[], x: number, y: number, range: number, skip?: Set<number>): MobE | null => inRange(sim, list, x, y, range, skip)[0] ?? null;

/** A roll from the world's seed and the moment (never the world's dice). */
const roll = (sim: Sim, id: number, k: number) => hash(sim.s.seed, sim.s.tick * 131 + id, k);

/** Slow or freeze a monster for a while (the strongest wins; it recovers by itself). */
function slowMob (sim: Sim, m: MobE, f: number, secs: number) {
    const mm = mem(sim), cur = mm.slow.get(m.id), until = sim.s.time + secs;
    if (cur) { if (f <= cur.f) { cur.until = Math.max(cur.until, until); } else { cur.f = f; cur.until = Math.max(cur.until, until); } m.sm = (cur.base ?? 1) * cur.f; sim.touch(m); return; }
    mm.slow.set(m.id, { until, f, base: m.sm });
    m.sm = (m.sm ?? 1) * f;
    sim.touch(m);
}
/** Burn or bleed: damage a second for a while, counted for the tower that set it. */
function dotMob (sim: Sim, m: MobE, dps: number, secs: number, by: number) {
    const d = mem(sim).dot, now = sim.s.time, cur = d.get(m.id);
    if (cur && cur.dps >= dps) { cur.until = Math.max(cur.until, now + secs); return; }
    d.set(m.id, { until: now + secs, dps, by, next: now + 0.5 });
}

/** What a hit from this tower does besides damage: slows, freezes, burns. */
function afflict (sim: Sim, t: BuildE, st: TowerStats, m: MobE, dmg: number) {
    if (!sim.s.ents[m.id]) return;
    if (st.freeze) slowMob(sim, m, 0, TW.freezeSecs);
    else if (st.slow) slowMob(sim, m, 1 - TW.slow, TW.slowSecs);
    if (st.burn) dotMob(sim, m, dmg * TW.burnDps, TW.burnSecs, t.id);
}

function fire (sim: Sim, t: BuildE, list: readonly MobE[]): boolean {
    const def = BUILDINGS[t.kind];
    const type = def.tower! as Exclude<TowerType, 'spike'>;
    const st = statsFor(sim, t)!;
    const x = (t.tx + 0.5) * TILE, y = (t.ty + 0.5) * TILE - 10;
    const inr = inRange(sim, list, x, y, st.range);
    const first = inr[0];
    if (type === 'tesla') {
        const want = first ? 1 : 0;
        if ((t.act ?? 0) !== want) { t.act = want; sim.touch(t); }       // (it draws power while something is in range)
        if (!first || (t.pw ?? 0) <= 0.01) return false;
    }
    if (!first) return false;
    const mm = mem(sim), n = (mm.shots.get(t.id) ?? 0) + 1;
    mm.shots.set(t.id, n);
    const over = st.overcharge && n % TW.overEvery === 0 ? TW.overMul : 1;
    const hit = (m: MobE, k: number) => {
        let d = st.dmg * k * over;
        if (st.execute && m.hp < m.mhp * TW.executeBelow) d *= 1 + TW.execute;
        if (st.crit > 0 && roll(sim, t.id * 7 + m.id, 3) < st.crit) d *= TW.critMul;
        return d;
    };
    const hits: [MobE, number][] = [];
    const fxk = st.burn ? 'fire' : st.freeze ? 'frost' : undefined;
    // an arrow or a bolt is a real projectile (the skeletons' own arrow, flying at a speed the eye can follow); the hit itself is dealt below, at once
    const fly = (k: 'arrow' | 'bolt', m: MobE, kind?: 'fire' | 'frost') => {
        const dx = m.x - x, dy = m.y - y, d = Math.max(1, Math.hypot(dx, dy)), t = flightTime(k, d);
        sim.add<ProjE>({ k: 'proj', kind: kind === 'fire' ? 'fire' : kind === 'frost' ? 'frost' : k, x, y, vx: (dx / d) * (d / t), vy: (dy / d) * (d / t), dmg: 0, life: t, tw: 1 });
    };
    const push = (k: 'arrow' | 'bolt' | 'zap', to: MobE[], kind?: 'fire' | 'frost') => {
        if (k !== 'zap' && to[0]) fly(k, to[0], kind);
        sim.events.push({ e: 'shot', k, x: Math.round(x), y: Math.round(y), to: to.map((m) => [Math.round(m.x), Math.round(m.y - 5)] as [number, number]), ...(kind ? { fx: kind } : {}), ...(over > 1 ? { big: 1 as const } : {}) });
    };
    if (type === 'tesla') {
        const chain: MobE[] = [first];
        if (st.storm) for (const m of inr.slice(1, TW.stormMax)) chain.push(m);
        else {
            const seen = new Set([first.id]);
            while (chain.length < st.chain) {
                const last = chain[chain.length - 1];
                const next = nearestMob(sim, list, last.x, last.y - 4, B.tesla.hop, seen);
                if (!next) break;
                seen.add(next.id); chain.push(next);
            }
        }
        chain.forEach((m, i) => hits.push([m, st.storm ? TW.stormDmg : i === 0 ? 1 : 0.8]));
        push('zap', chain, fxk);
    } else {
        const kind = type === 'archer' ? 'arrow' : 'bolt';
        hits.push([first, 1]);
        push(kind, [first], fxk);
        if (st.pierce) {
            // the nearest other monster close to the line the shot flies on, just beyond (or beside) its target
            const dx = first.x - x, dy = first.y - 4 - y, l = Math.max(1, Math.hypot(dx, dy)), ux = dx / l, uy = dy / l;
            let best: MobE | null = null, bd = 1e9;
            for (const m of inr) {
                if (m === first) continue;
                const px = m.x - x, py = m.y - 4 - y, along = px * ux + py * uy, off = Math.abs(px * uy - py * ux);
                if (along > l - 4 && along < l + TW.pierceReach && off < TW.pierceWidth && along < bd) { bd = along; best = m; }
            }
            if (best) hits.push([best, TW.pierceDmg]);
        }
        if (st.splash) for (const m of inr) if (m !== first && Math.hypot(m.x - first.x, m.y - first.y) <= TW.splashRadius) hits.push([m, TW.splashDmg]);
        if (st.multi > 0) {
            const others = inr.filter((m) => m !== first).slice(0, st.multi);
            for (const m of others) { hits.push([m, TW.multiDmg]); push(kind, [m], fxk); }
        }
    }
    sim.fx(def.tower === 'archer' ? 'towerShot' : def.tower === 'ballista' ? 'ballista' : 'zap', x, y);
    for (const [m, k] of hits) {
        const d = hit(m, k);
        strike(sim, t, m, d, { kx: m.x - x, ky: m.y - y, kb: type === 'ballista' ? 120 : 30, quiet: true, nofloat: true });
        afflict(sim, t, st, m, d);
    }
    return true;
}

/** Slows and freezes wear off, burns and bleeds tick, and towers that mend themselves do. */
function statuses (sim: Sim) {
    const mm = mem(sim), now = sim.s.time;
    for (const [id, s] of mm.slow) {
        const m = sim.s.ents[id];
        if (m?.k !== 'mob') { mm.slow.delete(id); continue; }
        if (now < s.until) continue;
        if (s.base === undefined) delete m.sm; else m.sm = s.base;
        mm.slow.delete(id);
        sim.touch(m);
    }
    for (const [id, d] of mm.dot) {
        const m = sim.s.ents[id];
        if (m?.k !== 'mob') { mm.dot.delete(id); continue; }
        if (now < d.next) continue;
        d.next = now + 0.5;
        const by = sim.s.ents[d.by];
        strike(sim, by?.k === 'bld' ? by : null, m, d.dps * 0.5, { quiet: true, nofloat: true });
        if (now >= d.until || !sim.s.ents[id]) mm.dot.delete(id);
    }
}

/** Every step: the towers look for a target when they are ready, and the spike traps bite whatever stands on them. */
export function update (sim: Sim) {
    const towers = TOWER_KINDS.flatMap((k) => sim.buildings(k));
    const spikes = sim.buildings('spike');
    const mm = memory.get(sim);
    if (mm && (mm.slow.size || mm.dot.size)) statuses(sim);              // (a slow or a burn runs out even when its tower is gone)
    if (!towers.length && !spikes.length) return;
    const list = sim.ents('mob');
    const m = mem(sim), now = sim.s.time;
    for (const t of towers) {
        if ((m.cd.get(t.id) ?? 0) > now) continue;
        const st = statsFor(sim, t)!;
        m.cd.set(t.id, now + (list.length && fire(sim, t, list) ? st.every : 0.25));
    }
    if (sim.s.tick % 20 === 0) {
        for (const t of towers) {
            if (t.hp === undefined || !perksOf(t.pk).includes('mending')) continue;
            const max = maxHp(t);
            t.hp = Math.min(max, t.hp + max * TW.mend);
            if (t.hp >= max) delete t.hp;
            sim.touch(t);
        }
    }
    if (!spikes.length || sim.s.tick % 4 !== 0) return;
    for (const e of list) {
        if (!fair(e) || MOBS[e.kind].flies || !sim.s.ents[e.id] || (m.bite.get(e.id) ?? 0) > now) continue;
        const tx = Math.floor(e.x / TILE), ty = Math.floor((e.y - 1) / TILE);
        let trap: BuildE | undefined;
        const at = (x: number, y: number) => { const id = sim.world.floorAt(x, y); const b = id ? sim.s.ents[id] : undefined; return b?.k === 'bld' && BUILDINGS[b.kind].spike ? b : undefined; };
        trap = at(tx, ty);
        if (!trap) {
            // Wide Spikes also bite what stands on the tiles round them
            for (let dy = -1; dy <= 1 && !trap; dy++) for (let dx = -1; dx <= 1 && !trap; dx++) {
                const b = at(tx + dx, ty + dy);
                if (b && perksOf(b.pk).includes('wider') && Math.hypot(e.x - (b.tx + 0.5) * TILE, e.y - (b.ty + 0.5) * TILE) <= TW.spikeWide + TILE / 2) trap = b;
            }
        }
        if (!trap) continue;
        const st = statsFor(sim, trap)!;
        m.bite.set(e.id, now + st.every);
        sim.fx('spike', e.x, e.y - 3);
        let d = st.dmg;
        if (st.execute && e.hp < e.mhp * TW.executeBelow) d *= 1 + TW.execute;
        if (st.crit > 0 && roll(sim, trap.id * 7 + e.id, 3) < st.crit) d *= TW.critMul;
        strike(sim, trap, e, d, { quiet: true, nofloat: true });
        if (!sim.s.ents[e.id]) continue;
        const long = st.lasting ? 2 : 1;
        if (st.slow) slowMob(sim, e, 1 - TW.slow, TW.slowSecs * long);
        if (st.bleed) dotMob(sim, e, st.dmg * TW.bleedDps, TW.bleedSecs * long, trap.id);
    }
}

// ── choosing an upgrade ─────────────────────────────────────────────────────
/** The three perks a tower offers now (none while no pick waits). */
export function offerFor (sim: Sim, b: BuildE): string[] {
    const type = towerType(b.kind);
    if (!type || pending(b) <= 0) return [];
    return offer(sim.s.seed, b.id, type, b);
}

/** `towerpick`: take the i-th perk on offer. The builder may do it from anywhere; anybody else has to be standing beside the tower. */
export function cmdPick (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'towerpick' }>) {
    if (typeof c.id !== 'number' || !Number.isInteger(c.id) || typeof c.i !== 'number' || !Number.isInteger(c.i)) return;
    const b = Object.prototype.hasOwnProperty.call(sim.s.ents, c.id) ? sim.s.ents[c.id] : undefined;
    if (b?.k !== 'bld' || !towerType(b.kind)) return;
    if (b.by !== p.id) {
        const cc = sim.center(b);
        if (Math.hypot(cc.x - p.x, cc.y - p.y) > TW.reach * TILE) { sim.deny(p, 'Stand next to the tower'); return; }
    }
    const offered = offerFor(sim, b);
    if (!offered.length) { sim.deny(p, 'Nothing to choose yet'); return; }
    const id = offered[c.i];
    if (c.i < 0 || id === undefined) return;
    b.pk = [...perksOf(b.pk), id];
    const hpMax = maxHp(b);
    if (b.hp !== undefined && b.hp > hpMax) b.hp = hpMax;
    sim.touch(b);
    const cc = sim.center(b);
    sim.fx('perk', cc.x, cc.y - 6, p.id);
    sim.toast(p.id, `${BUILDINGS[b.kind].name}: ${PERK_NAME(id)}`, 'k_star', PAL.gold);
}
const PERK_NAME = (id: string) => PERK_BY_ID[id]?.name ?? id;

/** What a tower says when you press E on it. */
export function towerWords (b: BuildE): string {
    const def = BUILDINGS[b.kind];
    const type = towerType(b.kind);
    const left = b.hp !== undefined ? `  (${Math.ceil(b.hp)} / ${maxHp(b)} hp)` : '';
    if (type && pending(b) > 0) return `Choose an upgrade${left}`;
    if (def.tower === 'tesla' && (b.pw ?? 0) <= 0.01 && (b.act ?? 0) > 0) return `No power: it cannot fire${left}`;
    if (!type || type === 'spike') return `Bites what walks over it${left}`;
    return `Guards ${Math.round(statsOf(type, b.pk).range / TILE)} tiles around it${left}`;
}
