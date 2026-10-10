// Monsters: spawning, behaviour, projectiles and loot. Each AI is a few lines of movement
// plus (for some) a wind-up → attack cycle that the client reads from `st` to animate.
// Bosses live in boss.ts; players hit things in combat.ts.

import { RIFT_RADIUS, TILE, TUNING } from '../config';
import { eliteChance, isBoss, MobDef, MobKind, MOBS, pickWild, PROJ, ProjKind, softHit } from '../data/mobs';
import { dist } from '../geom';
import { PAL } from '../palette';
import * as fortune from './fortune';
import * as raid from './raid';
import * as boss from './boss';
import * as quests from './quests';
import * as rift from './rift';
import type { Sim } from './sim';
import { derived } from './stats';
import type { MobE, PlayerS, Plot, ProjE } from './types';

/** Tougher monsters for higher threat levels (capped), elites on top. */
export function scaledHp (def: MobDef, level: number, elite: boolean) {
    return Math.max(1, Math.round(def.hp * Math.min(2.5, 1 + (level - 1) * 0.05) * (elite ? 1.8 : 1)));
}

interface SpawnOpts { x?: number; y?: number; elite?: boolean; pack?: boolean; rift?: number; dm?: number; hm?: number; sm?: number; lv?: number }

/**
 * The level the monsters around a farmer are tuned to: the average level of everyone playing within
 * `partyRange` of them (a party that stays together shares one difficulty), or just their own level
 * when they are on their own.
 */
export function groupLevel (sim: Sim, p: PlayerS): number {
    let sum = 0, n = 0;
    for (const q of sim.online) {
        if (q === p || dist(q.x, q.y, p.x, p.y) <= TUNING.partyRange) { sum += q.level; n++; }
    }
    return Math.max(1, Math.round(sum / Math.max(1, n)));
}

/** The threat level at a spot: that of the farmer (and their party) nearest to it. */
export function threatAt (sim: Sim, x: number, y: number): number {
    let lead: PlayerS | null = null, best = Infinity;
    for (const p of sim.online) { const d = dist(p.x, p.y, x, y); if (d < best) { best = d; lead = p; } }
    return lead ? groupLevel(sim, lead) : 1;
}

/** Spawn a monster near a player or on a plot. Returns it (or null when no spot was found). */
export function spawnMob (sim: Sim, kind: MobKind | undefined, near?: string, plotIndex?: number, opts: SpawnOpts = {}): MobE | null {
    const rng = sim.rng;
    const players = sim.online.filter((p) => p.downed <= 0);
    if (opts.x !== undefined && opts.y !== undefined) return place(sim, kind ?? 'slime', opts.x, opts.y, opts);
    const who = near ? sim.s.players[near] : undefined;
    let candidates: Plot[];
    if (plotIndex !== undefined) candidates = [sim.s.plots[plotIndex]];
    else {
        const p = near ? sim.s.players[near] : undefined;
        const here = p ? sim.world.plotAtPx(p.x, p.y) : null;
        if (!here) return null;
        candidates = [here, ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => sim.world.plot(here.gx + dx, here.gy + dy))]
            .filter((q): q is Plot => !!q?.owned);
    }
    for (let tries = 0; tries < 20; tries++) {
        const plot = rng.pick(candidates);
        const spot = plot && sim.world.randomFreeTile(plot, rng, undefined, 0);
        if (!spot || sim.world.sealed(spot.tx, spot.ty)) continue;       // (a walled-in room or yard stays quiet: floors never spawn anything either)
        const x = (spot.tx + 0.5) * TILE, y = (spot.ty + 1) * TILE - 3;
        if (players.some((p) => dist(x, y, p.x, p.y) < TUNING.spawnClear)) continue;
        if (sim.nearFire(x, y)) continue;
        const lv = opts.lv ?? (who ? groupLevel(sim, who) : threatAt(sim, x, y));
        const k = kind ?? pickWild(plot.biome, lv, () => rng.next());
        const elite = opts.elite ?? (!isBoss(k) && rng.chance(Math.min(0.55, eliteChance(lv) * (sim.nightEv === 'bloodmoon' ? 4 : 1))));
        const first = place(sim, k, x, y, { elite, lv });
        // pack animals arrive together
        const g = MOBS[k].group;
        if (first && g && opts.pack !== false) {
            const n = rng.int(g[0], g[1]) - 1;
            for (let i = 0; i < n; i++) {
                const a = rng.next() * Math.PI * 2;
                const px = x + Math.cos(a) * 12, py = y + Math.sin(a) * 9;
                if (!sim.world.boxBlocked(px, py, 3, 2)) place(sim, k, px, py, { elite: false, lv });
            }
        }
        return first;
    }
    return null;
}

function place (sim: Sim, kind: MobKind, x: number, y: number, o: SpawnOpts): MobE {
    const def = MOBS[kind];
    const elite = !!o.elite && !def.boss;
    const lv = o.lv ?? threatAt(sim, x, y);
    // bosses are the same fight every time (their patterns are the challenge); everyone else is tuned to the level
    const hp = Math.max(1, Math.round((def.boss ? def.hp : scaledHp(def, lv, elite)) * (o.hm ?? 1)));
    const soft = o.rift === undefined && !def.boss ? softHit(lv) : 1;
    return sim.add<MobE>({
        k: 'mob', kind, x, y, hp, mhp: hp, vx: 0, vy: 0, t: sim.rng.next(), hopT: 0, knockT: 0, a: 1 + sim.rng.next() * 1.5,
        lv,
        ...(elite ? { el: 1 as const } : {}),
        ...(o.rift !== undefined ? { rift: o.rift, dm: o.dm } : soft < 1 ? { dm: soft } : {}),
        ...(o.sm ? { sm: o.sm } : {}),
    });
}

// ── projectiles ─────────────────────────────────────────────────────────────
export function fireProj (sim: Sim, kind: ProjKind, x: number, y: number, ang: number, speed: number, dmg: number) {
    sim.add<ProjE>({ k: 'proj', kind, x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg, life: PROJ[kind].life });
}

export function updateProjs (sim: Sim, dt: number) {
    const players = sim.online.filter((p) => p.downed <= 0);
    for (const e of sim.ents('proj')) {
        e.life -= dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const r = PROJ[e.kind].r;
        if (e.tw) { if (e.life <= 0) sim.remove(e.id); else sim.touch(e); continue; }       // (a tower's shot: it flies over everything and hurts nobody)
        let dead = e.life <= 0 || sim.world.solidAt(e.x, e.y - 3);
        if (!dead) {
            for (const p of players) {
                if (Math.hypot(p.x - e.x, p.y - 5 - e.y) >= r + 5) continue;
                if (sim.shielded(p)) continue;                  // (it flies on through someone mid-dash: if it would have hit, that was a Perfect dash)
                sim.hurt(p, e, e.dmg); dead = true; break;
            }
        }
        if (dead) sim.remove(e.id);
        else sim.touch(e);
    }
}

/** Expedition monsters never drift off their island (flyers would otherwise hover out of reach over the sea). */
function leash (sim: Sim, e: MobE) {
    const c = sim.world.riftCenter(e.rift!);
    const max = (RIFT_RADIUS + 0.7) * TILE;
    const d = Math.hypot(e.x - c.x, e.y - c.y);
    if (d > max) { e.x = c.x + ((e.x - c.x) * max) / d; e.y = c.y + ((e.y - c.y) * max) / d; }
}

// ── behaviour ───────────────────────────────────────────────────────────────
function nearestPlayer (players: PlayerS[], x: number, y: number, range: number, now: number) {
    let best: PlayerS | null = null, bd = range;
    for (const p of players) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (p.cl && p.cl > now && d > 24) continue;          // (a farmer in the Shroud is lost to anything that is not right beside them)
        if (d < bd) { bd = d; best = p; }
    }
    return { p: best, d: bd };
}

export function updateMobs (sim: Sim, dt: number) {
    const players = sim.online.filter((p) => p.downed <= 0);
    const fires = sim.buildings('campfire');          // (kept until a building comes or goes: see Sim.buildings)
    for (const e of sim.ents('mob')) {
        const def = MOBS[e.kind];
        if (def.boss || e.rb) { boss.updateBoss(sim, e, dt, players); continue; }
        const { p: target, d: td } = nearestPlayer(players, e.x, e.y, def.aggro, sim.s.time);
        const dx = target ? target.x - e.x : 0, dy = target ? target.y - e.y : 0, dist = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / dist, uy = dy / dist;
        e.t += dt;
        e.a = Math.max(0, (e.a ?? 0) - dt);
        if ((e.stun ?? 0) > 0) {
            e.stun = e.stun! - dt;
            e.vx *= Math.pow(0.02, dt); e.vy *= Math.pow(0.02, dt);
            if (e.stun! <= 0) { e.stun = undefined; e.st = 0; }
        } else if (e.knockT > 0) {
            e.knockT -= dt;
            e.vx *= Math.pow(0.02, dt); e.vy *= Math.pow(0.02, dt);
        } else if (e.rd && !target) raid.march(e, def, dt);          // (a raider with nobody near marches on the base it came for)
        else behave(sim, e, def, target, td, ux, uy, dt);
        // campfires repel
        for (const f of fires) {
            const fx = (f.tx + 0.5) * TILE, fy = (f.ty + 1) * TILE, fd = Math.max(1, Math.hypot(e.x - fx, e.y - fy));
            if (fd < TUNING.campfireRadius) { e.vx = ((e.x - fx) / fd) * 40; e.vy = ((e.y - fy) / fd) * 40; if (e.st === 2) e.st = 0; }
        }
        if (e.rd) raid.raidMove(sim, e, def, dt); else move(sim, e, def, dt);
        if (e.rift !== undefined) leash(sim, e);
        sim.touch(e);
        // touching hurts
        const touching = def.ai !== 'charge' || e.st === 2 || e.st === 0;
        // (a monster in the middle of its charge is an attack a dash can beat; one that merely bumps into you is not)
        if (target && touching && td < def.r + 5 && !(def.ai === 'hop' && e.hopT > 0.05) && (e.stun ?? 0) <= 0
            && (def.ai === 'charge' && e.st === 2 ? !sim.shielded(target) : target.invuln <= 0)) {
            sim.hurt(target, e, def.dmg * (e.el ? 1.25 : 1) * (e.dm ?? 1));
        }
    }
}

function move (sim: Sim, e: MobE, def: MobDef, dt: number) {
    const sm = e.sm ?? 1;
    const nx = e.x + e.vx * dt * sm, ny = e.y + e.vy * dt * sm;
    if (def.flies) {
        if (!sim.world.flyBlocked(nx, ny, e.x, e.y)) { e.x = nx; e.y = ny; }          // (walls, doorways and roofs stop even the ones with wings)
        return;
    }
    let blocked = false;
    if (!sim.world.mobBlocked(nx, e.y, 3, 2)) e.x = nx; else blocked = true;       // (a doorway is shut to monsters)
    if (!sim.world.mobBlocked(e.x, ny, 3, 2)) e.y = ny; else blocked = true;
    if (blocked && def.ai === 'charge' && e.st === 2) { e.st = 3; e.stun = 0.9; e.vx = 0; e.vy = 0; sim.fx('hitEarth', e.x, e.y - 4); }
}

function behave (sim: Sim, e: MobE, def: MobDef, target: PlayerS | null, td: number, ux: number, uy: number, dt: number) {
    const rng = sim.rng;
    switch (def.ai) {
        case 'hop': {
            if (e.hopT > 0) {
                e.hopT -= dt;
                if (e.hopT <= 0) { e.vx = 0; e.vy = 0; }
            } else if (e.t > 0.9) {
                e.t = rng.next() * 0.3;
                e.hopT = 0.34;
                const a = rng.next() * Math.PI * 2;
                const sp = target ? def.speed : def.speed * 0.4;
                e.vx = target ? ux * sp : Math.cos(a) * sp;
                e.vy = target ? uy * sp : Math.sin(a) * sp;
            }
            maybeShoot(sim, e, def, target, td);
            break;
        }
        case 'chase':
        case 'brute': {
            if (target) { e.vx = ux * def.speed; e.vy = uy * def.speed; } else { e.vx = 0; e.vy = 0; }
            break;
        }
        case 'swarm': {
            if (target) {
                const wob = Math.sin(e.t * 7 + e.id) * 0.6;
                e.vx = (ux - uy * wob) * def.speed; e.vy = (uy + ux * wob) * def.speed;
            } else { e.vx = 0; e.vy = 0; }
            break;
        }
        case 'flit': {
            if (target) {
                const wob = Math.sin(e.t * 5 + e.id * 1.7) * 1.1;
                const near = td < 40 ? -0.5 : 1;           // swoops in, flutters back
                e.vx = (ux * near - uy * wob) * def.speed; e.vy = (uy * near + ux * wob) * def.speed;
            } else {
                e.vx = Math.cos(e.t * 1.3 + e.id) * def.speed * 0.3; e.vy = Math.sin(e.t * 1.7 + e.id) * def.speed * 0.3;
            }
            maybeShoot(sim, e, def, target, td);
            break;
        }
        case 'ranged': {
            if (!target) { e.vx = 0; e.vy = 0; break; }
            const keep = (def.shoot?.range ?? 150) * 0.55;
            const dir = td > keep + 18 ? 1 : td < keep - 18 ? -1 : 0;
            const strafe = Math.sin(e.t * 1.2 + e.id) * 0.5;
            e.vx = (ux * dir - uy * strafe) * def.speed; e.vy = (uy * dir + ux * strafe) * def.speed;
            maybeShoot(sim, e, def, target, td);
            break;
        }
        case 'charge': {
            const ch = def.charge!;
            if (e.st === 1) {
                // winding up: stand still, then go
                e.vx = 0; e.vy = 0;
                e.pt = (e.pt ?? 0) + dt;
                if (e.pt >= ch.wind) { e.st = 2; e.pt = 0; e.vx = (e.dx ?? 0) * ch.speed; e.vy = (e.dy ?? 0) * ch.speed; }
            } else if (e.st === 2) {
                e.pt = (e.pt ?? 0) + dt;
                if (e.pt >= ch.dist / ch.speed) { e.st = 0; e.pt = 0; e.a = ch.cd; e.vx = 0; e.vy = 0; }
            } else if (target) {
                e.vx = ux * def.speed; e.vy = uy * def.speed;
                if (td < ch.dist * 0.85 && (e.a ?? 0) <= 0) { e.st = 1; e.pt = 0; e.dx = ux; e.dy = uy; e.vx = 0; e.vy = 0; }
            } else { e.vx = 0; e.vy = 0; }
            break;
        }
        default: break;
    }
}

function maybeShoot (sim: Sim, e: MobE, def: MobDef, target: PlayerS | null, td: number) {
    const sh = def.shoot;
    if (!sh || !target || td > sh.range || (e.a ?? 0) > 0) return;
    e.a = sh.every * (0.85 + sim.rng.next() * 0.3);
    const ang = Math.atan2(target.y - 5 - (e.y - 5), target.x - e.x);
    const n = sh.count ?? 1;
    for (let i = 0; i < n; i++) {
        fireProj(sim, sh.proj, e.x, e.y - 5, ang + (n > 1 ? (i - (n - 1) / 2) * (sh.spread ?? 0.25) : 0), sh.speed, (sh.dmg ?? def.dmg) * (e.el ? 1.25 : 1) * (e.dm ?? 1));
    }
    sim.fx('shoot', e.x, e.y - 5);
}

// ── death and loot ──────────────────────────────────────────────────────────
function rollLoot (sim: Sim, e: MobE, by?: PlayerS) {
    const def = MOBS[e.kind];
    const rng = sim.rng;
    const luck = by ? derived(by).luck : 0;
    const mul = e.el ? 1.6 : 1;
    const coins = rng.int(def.coins[0], def.coins[1]) * (e.el ? 2 : 1) * (sim.nightEv === 'bloodmoon' ? 2 : 1);
    for (let i = 0; i < coins; i++) sim.spawnDrop('coin', e.x, e.y - 5);
    for (const [item, chance, min = 1, max = min] of def.drops) {
        if (!rng.chance(Math.min(1, chance * mul * (1 + luck)))) continue;
        const n = rng.int(min, max);
        for (let i = 0; i < n; i++) sim.spawnDrop(item, e.x, e.y - 5);
    }
    if (by) fortune.mobCrate(sim, by, def.tier, !!e.el, e.x, e.y);
    // elites also carry a rarer prize
    if (e.el && rng.chance(0.35)) sim.spawnDrop(rng.pick(['potion_heal', 'potion_might', 'potion_guard', 'goldbar', 'steel', 'potion_energy'] as const), e.x, e.y - 5);
}

export function killMob (sim: Sim, e: MobE, by?: PlayerS, silent = false) {
    const def = MOBS[e.kind];
    if (def.boss) { boss.defeat(sim, e); sim.remove(e.id); return; }
    if (e.rift !== undefined) rift.onKill(sim, e);
    if (!silent) sim.fx('enemyDie', e.x, e.y - 5, by?.id);
    sim.remove(e.id);
    if (silent || !by) return;
    by.stats.kills++;
    quests.count(by, `kill:${e.kind}`);
    if (e.el) quests.count(by, 'elite');
    rollLoot(sim, e, by);
    const vamp = derived(by).mods.vamp ?? 0;
    if (vamp > 0 && sim.rng.chance(vamp)) sim.heal(by, 0.5);
    sim.gainXp(by, def.xp * (e.el ? 1.8 : 1) * (sim.nightEv === 'bloodmoon' ? 1.5 : 1));
    if (e.el) sim.float(e.x, e.y - 18, 'Elite slain!', PAL.gold, by.id);
}
