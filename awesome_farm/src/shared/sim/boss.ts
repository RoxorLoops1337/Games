// Boss fights. A boss is a MobE with a phase list (data/mobs.ts); each phase cycles through
// attack patterns. Every pattern is a short script keyed to the time since it began:
// a red warning on the ground (a `tele` event) first, then the hit. Nothing here is random
// in a way that can't be read, so a fight is learnable and dodgeable.

import { TILE, TUNING } from '../config';
import { ITEMS, ItemId } from '../data/items';
import { COOP_PATTERNS } from '../data/costatus';
import { type BossInfo, BOSSES, type CoPattern, MobKind, MOBS, PatternId, ProjKind } from '../data/mobs';
import { RIFT_TIERS } from '../data/rift';
import { dist } from '../geom';
import { PAL } from '../palette';
import * as chronicle from './chronicle';
import * as costatus from './costatus';
import * as dread from './dread';
import * as fortune from './fortune';
import * as mobs from './mobs';
import * as quests from './quests';
import type { Sim } from './sim';
import { takeItem } from './stats';
import type { BuildE, MobE, PlayerS } from './types';

/** What a boss fires, by boss id. */
const SHOT: Record<string, ProjKind> = { slime: 'spore', stone: 'rock', bog: 'orb', dune: 'fire', frost: 'frost', heart: 'fire' };
/** Bosses that hover at range instead of walking up to you (px). */
const HOVER: Record<string, number> = { bog: 90, heart: 110 };

const crossed = (t0: number, t1: number, at: number) => t0 < at && t1 >= at;

// ── summoning ───────────────────────────────────────────────────────────────
const activeBosses = (sim: Sim) => sim.ents('mob').filter((e) => !!MOBS[e.kind].boss);

export function summonBoss (sim: Sim, p: PlayerS, altar: BuildE, bossId: string) {
    const entry = BOSSES[bossId];
    if (!entry || altar.kind !== 'altar') return;
    if (!sim.inReach(p, altar, 60)) { sim.deny(p, 'Stand next to the altar'); return; }
    const info = entry.info;
    if (info.heartOnly && !sim.world.plotAt(altar.tx, altar.ty)?.heart) { sim.deny(p, 'It can only be woken at the centre of the world'); return; }
    const live = activeBosses(sim).filter((b) => !b.zone);          // (the wardens of the Dread Reaches do not count against the altars)
    if (live.some((b) => b.alt === altar.id)) { sim.deny(p, 'This altar already has a fight going'); return; }
    if (live.length >= 3) { sim.deny(p, 'Too many bosses are awake'); return; }
    if (!takeItem(p, info.sigil, 1)) { sim.deny(p, `You need a ${ITEMS[info.sigil].name}`); return; }
    const near = sim.online.filter((q) => dist(q.x, q.y, (altar.tx + 1) * TILE, (altar.ty + 1) * TILE) < TUNING.altarParty).length;
    const def = MOBS[entry.kind];
    const hx = (altar.tx + 1) * TILE, hy = (altar.ty + 2) * TILE;
    const hp = Math.round(def.hp * (1 + 0.55 * (Math.max(1, near) - 1)));
    // appear a little way off, on land
    let x = hx, y = hy + 44;
    for (const [ox, oy] of [[0, 44], [0, -44], [44, 8], [-44, 8], [30, 36], [-30, 36]]) {
        if (!sim.world.boxBlocked(hx + ox, hy + oy, 6, 4)) { x = hx + ox; y = hy + oy; break; }
    }
    const b = sim.add<MobE>({
        k: 'mob', kind: entry.kind, x, y, hp, mhp: hp, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0, st: 1,
        ph: 0, pi: 0, pt: 2.2, hx, hy, alt: altar.id, idle: 0,
    });
    sim.fx('summon', hx, hy - 10, '*');
    sim.fx('roar', x, y - 6, '*');
    for (const q of sim.online) if (dist(q.x, q.y, hx, hy) < TUNING.bossBanner) sim.banner(info.title, info.blurb, info.color, q.id);
    sim.touch(b);
}

// ── the fight ───────────────────────────────────────────────────────────────
/** The fighting style of an expedition guardian: a boss's info built from its tier. */
const guardianInfo = (e: MobE): BossInfo => {
    const t = RIFT_TIERS[e.rt ?? 0];
    return { id: 'rift', title: `${MOBS[e.kind].name} Guardian`, blurb: t.name, sigil: 'pod', trophy: 'pod', summon: t.summon, phases: t.phases, points: 0, gear: [], arena: costatus.GUARDIAN_ARENA, color: t.color };
};

export function updateBoss (sim: Sim, e: MobE, dt: number, players: PlayerS[]) {
    const def = MOBS[e.kind], info = def.boss ?? guardianInfo(e);
    const hx = e.hx ?? e.x, hy = e.hy ?? e.y;
    const arena = info.arena;
    // phase changes
    const frac = e.hp / e.mhp;
    while ((e.ph ?? 0) + 1 < info.phases.length && frac <= info.phases[(e.ph ?? 0) + 1].at) {
        e.ph = (e.ph ?? 0) + 1; e.pi = 0; e.pat = undefined; e.pt = 1.1; e.st = 0;
        const note = info.phases[e.ph].note;
        sim.fx('roar', e.x, e.y - 8, '*');
        if (note) for (const q of sim.online) if (dist(q.x, q.y, hx, hy) < arena * TUNING.arenaNote) sim.banner(note, info.title, info.color, q.id);
    }
    const phase = info.phases[e.ph ?? 0];
    const inArena = players.filter((q) => dist(q.x, q.y, hx, hy) <= arena + TUNING.arenaPad);
    let target: PlayerS | null = null, bd = Infinity;
    const awake = inArena.filter((q) => q.co?.k !== 'frozen');           // (a frozen farmer is left alone while anyone else can be fought)
    for (const q of awake.length ? awake : inArena) { const d = dist(q.x, q.y, e.x, e.y); if (d < bd) { bd = d; target = q; } }
    e.t += dt;

    if (!target) {
        // nobody left to fight: wander home, mend, and eventually give up
        e.idle = (e.idle ?? 0) + dt;
        e.pat = undefined; e.st = 0;
        const dx = hx - e.x, dy = hy + 40 - e.y, d = Math.max(1, Math.hypot(dx, dy));
        e.vx = d > 6 ? (dx / d) * def.speed * 1.4 : 0; e.vy = d > 6 ? (dy / d) * def.speed * 1.4 : 0;
        e.hp = Math.min(e.mhp, e.hp + e.mhp * 0.02 * dt);
        stepMove(sim, e, def.flies, dt);
        sim.touch(e);
        if (e.idle! > 18 && !e.rb && !e.zone) retreat(sim, e);          // (a warden never leaves his post: he just mends)
        return;
    }
    e.idle = 0;
    const t0 = e.pt ?? 0;
    const speedMul = phase.speed ?? 1;
    const ctx: Ctx = { sim, e, def, info, dt, target, players: inArena, phase: e.ph ?? 0, bossId: info.id };

    if (!e.pat) {
        // resting between patterns: walk (or hover) towards the target
        e.st = 0;
        const hover = HOVER[info.id] ?? 0;
        const dx = target.x - e.x, dy = target.y - e.y, d = Math.max(1, Math.hypot(dx, dy));
        let dir = 1;
        if (hover) dir = d > hover + 14 ? 1 : d < hover - 14 ? -1 : 0;
        else if (d < def.r + 12) dir = 0;
        const strafe = hover ? Math.sin(e.t * 0.9) * 0.6 : 0;
        e.vx = ((dx / d) * dir - (dy / d) * strafe) * def.speed * speedMul;
        e.vy = ((dy / d) * dir + (dx / d) * strafe) * def.speed * speedMul;
        e.pt = t0 - dt;
        if (e.pt <= 0) {
            let id = phase.patterns[(e.pi ?? 0) % phase.patterns.length];
            e.pi = (e.pi ?? 0) + 1;
            if (id in COOP_PATTERNS && !costatus.canLay(sim, e, inArena, id as CoPattern)) id = phase.alone?.[id as CoPattern] ?? 'slam';       // (a pattern that needs teammates: a lone farmer gets the old fight)
            e.pat = id; e.pt = 0;
            begin(ctx, id);
        }
    } else {
        const t1 = t0 + dt;
        e.pt = t1;
        if (run(ctx, e.pat, t0, t1)) { e.pat = undefined; e.pt = phase.pause; e.st = 0; e.vx = 0; e.vy = 0; }
    }
    stepMove(sim, e, def.flies, dt);
    sim.touch(e);
    // touching a big body hurts a little, except mid wind-up
    if (e.st !== 1) {
        for (const q of inArena) {
            if (q.invuln <= 0 && Math.hypot(q.x - e.x, q.y - e.y) < def.r + 5) sim.hurt(q, e, def.dmg * 0.25 * (e.dm ?? 1));
        }
    }
}

function stepMove (sim: Sim, e: MobE, flies: boolean | undefined, dt: number) {
    const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
    if (flies) {
        // a hovering boss stays over land: backing off over the sea would put it out of reach for good
        const land = (x: number, y: number) => sim.world.isLand(Math.floor(x / TILE), Math.floor(y / TILE));
        if (land(nx, ny) || !land(e.x, e.y)) { e.x = nx; e.y = ny; } else { e.vx = 0; e.vy = 0; }
        return;
    }
    if (!sim.world.boxBlocked(nx, e.y, 4, 2)) e.x = nx;
    if (!sim.world.boxBlocked(e.x, ny, 4, 2)) e.y = ny;
}

function retreat (sim: Sim, e: MobE) {
    const info = MOBS[e.kind].boss!;
    costatus.clearBoss(sim, e.id);
    for (const q of sim.online) sim.banner(`${info.title} slinks away…`, 'Your sigil is waiting by the altar', info.color, q.id);
    if (e.hx !== undefined) sim.spawnDrop(info.sigil, e.hx, (e.hy ?? e.y) + 6);
    sim.fx('enemyDie', e.x, e.y - 6);
    sim.forgetCredit(e.id);
    forget(sim, e.id);
    sim.remove(e.id);
}

// ── patterns ────────────────────────────────────────────────────────────────
interface Ctx { sim: Sim; e: MobE; def: ReturnType<typeof defOf>; info: NonNullable<ReturnType<typeof defOf>['boss']>; dt: number; target: PlayerS; players: PlayerS[]; phase: number; bossId: string }
const defOf = (k: MobKind) => MOBS[k];

const hitDmg = (c: Ctx, mult = 1) => c.def.dmg * mult * (1 + c.phase * 0.08) * (c.e.dm ?? 1);

/** Hurt everyone inside a circle. */
function blast (c: Ctx, x: number, y: number, r: number, mult: number) {
    for (const q of c.players) {
        if (Math.hypot(q.x - x, q.y - 4 - y) <= r + 4 && !c.sim.shielded(q)) c.sim.hurt(q, { x, y }, hitDmg(c, mult));      // (a dash through it is a Perfect dash: shielded() gives one reward per dash, however many blasts a pattern has)
    }
}

/** What a pattern in progress remembers between steps, by boss id: where the rain will fall, how far a charge has gone. Runtime only, and per world: a module-level map would hold every world's bosses for ever. */
interface PatternMem { rain: Map<number, { x: number; y: number }[]>; charge: Map<number, number> }
const memory = new WeakMap<Sim, PatternMem>();
function memOf (sim: Sim): PatternMem {
    let m = memory.get(sim);
    if (!m) { m = { rain: new Map(), charge: new Map() }; memory.set(sim, m); }
    return m;
}
/** A boss is gone (defeated, slunk away, or removed any other way): nothing of its patterns is kept. */
export function forget (sim: Sim, id: number) {
    const m = memory.get(sim);
    if (m) { m.rain.delete(id); m.charge.delete(id); }
}

function begin (c: Ctx, id: PatternId) {
    const { sim, e, target } = c;
    const tx = target.x, ty = target.y - 4;
    e.vx = 0; e.vy = 0; e.st = 1;
    const ux = (tx - e.x), uy = (ty - e.y), ul = Math.max(1, Math.hypot(ux, uy));
    switch (id) {
        case 'leap':
            e.gx = tx; e.gy = ty + 4;
            sim.events.push({ e: 'tele', shape: 'circle', x: tx, y: ty + 4, r: 28, t: 0.75 });
            break;
        case 'slam':
            sim.events.push({ e: 'tele', shape: 'circle', x: e.x, y: e.y, r: 50, t: 0.85 });
            break;
        case 'sweep':
            e.dx = ux / ul; e.dy = uy / ul;
            sim.events.push({ e: 'tele', shape: 'cone', x: e.x, y: e.y, r: 58, t: 0.7, a: Math.atan2(uy, ux), len: 1.0 });
            break;
        case 'charge':
            e.dx = ux / ul; e.dy = uy / ul;
            sim.events.push({ e: 'tele', shape: 'line', x: e.x, y: e.y, r: 9, t: 0.9, a: Math.atan2(uy, ux), len: 176 });
            break;
        case 'radial':
            sim.events.push({ e: 'tele', shape: 'ring', x: e.x, y: e.y, r: 36, t: 0.6 });
            break;
        case 'aimed':
            break;
        case 'rain': {
            const k = 3 + c.phase * 2;
            const pts: { x: number; y: number }[] = [];
            for (let i = 0; i < k; i++) {
                const q = c.players[i % c.players.length];
                const off = i < c.players.length ? 0 : 1;
                pts.push({ x: q.x + (sim.rng.next() - 0.5) * 80 * off, y: q.y - 4 + (sim.rng.next() - 0.5) * 60 * off });
            }
            memOf(sim).rain.set(e.id, pts);
            for (const p of pts) sim.events.push({ e: 'tele', shape: 'circle', x: p.x, y: p.y, r: 22, t: 1.0 });
            break;
        }
        case 'spiral':
            e.st = 2; e.dx = sim.rng.next() * Math.PI * 2; e.a = 0;
            break;
        case 'summon':
            sim.events.push({ e: 'tele', shape: 'ring', x: e.x, y: e.y, r: 38, t: 0.7 });
            sim.fx('summon', e.x, e.y - 6, '*');
            break;
        // the patterns that need teammates (sim/costatus.ts): whoever is next in turn is marked, so it is not always the one the boss chases
        case 'freeze': case 'hex': {
            const mine = costatus.free(c.players), v = mine[(e.pi ?? 0) % Math.max(1, mine.length)] ?? target;
            e.gx = v.x; e.gy = v.y;
            const frost = id === 'freeze';
            sim.events.push({ e: 'tele', shape: 'circle', x: v.x, y: v.y, r: frost ? TUNING.coop.freezeRadius : TUNING.coop.hexRadius, t: frost ? 0.95 : 0.9, kind: frost ? 'frost' : 'hex' });
            break;
        }
        case 'chain': {
            const pair = costatus.nearestPair(e, c.players);
            for (const q of pair ?? []) sim.events.push({ e: 'tele', shape: 'circle', x: q.x, y: q.y, r: TUNING.coop.chainRadius, t: 0.8, kind: 'chain' });
            break;
        }
    }
}

/** One pattern's script: advance it from t0 to t1, and say whether it is over. */
type Script = (c: Ctx, t0: number, t1: number) => boolean;

/** What a boss fires in its patterns. */
const shotOf = (c: Ctx): ProjKind => SHOT[c.info.id] ?? 'orb';

const SCRIPTS: Record<PatternId, Script> = {
    leap: (c, t0, t1) => {
        const { sim, e, info } = c;
        if (crossed(t0, t1, 0.75)) { e.st = 2; e.vx = ((e.gx ?? e.x) - e.x) / 0.4; e.vy = ((e.gy ?? e.y) - e.y) / 0.4; }
        if (crossed(t0, t1, 1.15)) {
            e.vx = 0; e.vy = 0; e.st = 0;
            e.x = e.gx ?? e.x; e.y = e.gy ?? e.y;
            sim.fx('slam', e.x, e.y - 4, '*');
            sim.events.push({ e: 'tele', shape: 'ring', x: e.x, y: e.y, r: 46, t: 0.3 });
            blast(c, e.x, e.y, 30, 1);
            if (info.id === 'slime' && c.phase >= 1) for (let i = 0; i < 6; i++) mobs.fireProj(sim, 'spore', e.x, e.y - 4, (i / 6) * Math.PI * 2, 56, hitDmg(c, 0.5));
        }
        return t1 >= 1.55;
    },
    slam: (c, t0, t1) => {
        const { sim, e, info } = c;
        if (crossed(t0, t1, 0.85)) {
            e.st = 2;
            sim.fx('slam', e.x, e.y - 4, '*');
            sim.events.push({ e: 'tele', shape: 'ring', x: e.x, y: e.y, r: 70, t: 0.3 });
            blast(c, e.x, e.y, 50, 1);
            if (c.phase >= 1 && (info.id === 'stone' || info.id === 'frost')) {
                const n = 6 + c.phase * 2;
                for (let i = 0; i < n; i++) mobs.fireProj(sim, shotOf(c), e.x, e.y - 4, (i / n) * Math.PI * 2 + 0.2, 70, hitDmg(c, 0.55));
            }
        }
        return t1 >= 1.5;
    },
    sweep: (c, t0, t1) => {
        const { sim, e } = c;
        if (crossed(t0, t1, 0.7)) {
            e.st = 2;
            sim.fx('slam', e.x + (e.dx ?? 0) * 24, e.y + (e.dy ?? 0) * 24 - 4, '*');
            for (const q of c.players) {
                const dx = q.x - e.x, dy = q.y - 4 - e.y, l = Math.hypot(dx, dy);
                if (l <= 58 + 4 && (dx * (e.dx ?? 0) + dy * (e.dy ?? 0)) / Math.max(1, l) > 0.57 && !sim.shielded(q)) sim.hurt(q, e, hitDmg(c, 0.9));
            }
        }
        return t1 >= 1.3;
    },
    charge: (c, t0, t1) => {
        const { sim, e, def } = c;
        const gone = memOf(sim).charge;
        if (crossed(t0, t1, 0.9)) { e.st = 2; e.vx = (e.dx ?? 0) * 210; e.vy = (e.dy ?? 0) * 210; gone.set(e.id, 0); }
        if (t1 > 0.9 && t1 < 1.75 && e.st === 2) {
            gone.set(e.id, (gone.get(e.id) ?? 0) + Math.hypot(e.vx, e.vy) * c.dt);
            for (const q of c.players) if (Math.hypot(q.x - e.x, q.y - 4 - e.y) < def.r + 8 && !sim.shielded(q)) sim.hurt(q, e, hitDmg(c, 1));
            if (e.vx === 0 && e.vy === 0) e.st = 3;
        }
        if (crossed(t0, t1, 1.75)) { e.vx = 0; e.vy = 0; e.st = 3; sim.fx('hitEarth', e.x, e.y - 4); }
        return t1 >= 2.75;
    },
    radial: (c, t0, t1) => {
        const { sim, e } = c;
        if (crossed(t0, t1, 0.6)) {
            e.st = 2;
            const n = 10 + c.phase * 3;
            const off = sim.rng.next() * Math.PI;
            for (let i = 0; i < n; i++) mobs.fireProj(sim, shotOf(c), e.x, e.y - 4, (i / n) * Math.PI * 2 + off, 64, hitDmg(c, 0.6));
            sim.fx('roar', e.x, e.y - 6, '*');
        }
        return t1 >= 1.4;
    },
    aimed: (c, t0, t1) => {
        const { sim, e, target } = c;
        for (const at of [0.35, 0.8, 1.25]) {
            if (!crossed(t0, t1, at)) continue;
            e.st = 2;
            const n = 3 + Math.min(2, c.phase);
            const base = Math.atan2(target.y - 5 - (e.y - 6), target.x - e.x);
            for (let i = 0; i < n; i++) mobs.fireProj(sim, shotOf(c), e.x, e.y - 6, base + (i - (n - 1) / 2) * 0.2, 88, hitDmg(c, 0.65));
            sim.fx('shoot', e.x, e.y - 6);
        }
        return t1 >= 1.8;
    },
    rain: (c, t0, t1) => {
        const { sim, e, target } = c;
        if (crossed(t0, t1, 1.0)) {
            e.st = 2;
            const m = memOf(sim).rain;
            for (const p of m.get(e.id) ?? []) {
                sim.fx('hitEarth', p.x, p.y);
                blast(c, p.x, p.y, 22, 0.8);
            }
            sim.fx('slam', target.x, target.y, '*');
            m.delete(e.id);
        }
        return t1 >= 1.7;
    },
    spiral: (c, _t0, t1) => {
        const { sim, e } = c;
        e.a = (e.a ?? 0) - c.dt;
        if (t1 > 0.4 && t1 < 2.8 && e.a <= 0) {
            e.a = 0.12;
            e.dx = (e.dx ?? 0) + 0.5;
            for (let k = 0; k < 2; k++) mobs.fireProj(sim, shotOf(c), e.x, e.y - 5, (e.dx ?? 0) + k * Math.PI, 62, hitDmg(c, 0.55));
            sim.fx('shoot', e.x, e.y - 5);
        }
        return t1 >= 3.1;
    },
    summon: (c, t0, t1) => {
        const { sim, e, info } = c;
        if (crossed(t0, t1, 0.7)) {
            e.st = 2;
            const kind = (info.summon ?? 'slime') as MobKind;
            const have = sim.ents('mob').filter((m) => m.kind === kind && dist(m.x, m.y, e.x, e.y) < TUNING.summonCrowd).length;
            const n = Math.max(0, Math.min(2 + c.phase, 9 - have));
            const omens = (e.rift !== undefined ? sim.s.rifts?.[e.rift]?.omens : undefined) ?? [];
            for (let i = 0; i < n; i++) {
                const a = (i / Math.max(1, n)) * Math.PI * 2 + sim.rng.next();
                const x = e.x + Math.cos(a) * 32, y = e.y + Math.sin(a) * 24;
                if (!sim.world.boxBlocked(x, y, 3, 2)) mobs.spawnMob(sim, kind, undefined, undefined, { x, y, elite: false, rift: e.rift, dm: e.dm, ...(omens.includes('tough') ? { hm: 1.5 } : {}), ...(omens.includes('swift') ? { sm: 1.3 } : {}) });
            }
        }
        return t1 >= 1.3;
    },
    freeze: (c, t0, t1) => {
        const { sim, e } = c;
        if (crossed(t0, t1, 0.95)) {
            e.st = 2;
            const x = e.gx ?? e.x, y = e.gy ?? e.y;
            sim.fx('hitEarth', x, y);
            sim.events.push({ e: 'tele', shape: 'ring', x, y, r: 40, t: 0.3, kind: 'frost' });
            costatus.freezeAt(sim, e, c.players, x, y);
        }
        return t1 >= 1.5;
    },
    hex: (c, t0, t1) => {
        const { sim, e } = c;
        if (crossed(t0, t1, 0.9)) {
            e.st = 2;
            const x = e.gx ?? e.x, y = e.gy ?? e.y;
            sim.fx('shoot', e.x, e.y - 6);
            sim.events.push({ e: 'tele', shape: 'ring', x, y, r: 30, t: 0.3, kind: 'hex' });
            costatus.hexAt(sim, e, c.players, x, y);
        }
        return t1 >= 1.4;
    },
    chain: (c, t0, t1) => {
        const { sim, e } = c;
        if (crossed(t0, t1, 0.8)) {
            e.st = 2;
            sim.fx('slam', e.x, e.y - 4, '*');
            costatus.bindNearest(sim, e, c.players);
        }
        return t1 >= 1.3;
    },
};

/** Advance a pattern from t0 to t1. Returns true when it is over (a pattern this build does not know is over at once). */
function run (c: Ctx, id: PatternId, t0: number, t1: number): boolean {
    const script = SCRIPTS[id];
    return script ? script(c, t0, t1) : true;
}

// ── defeat and rewards ──────────────────────────────────────────────────────
export function defeat (sim: Sim, e: MobE) {
    const def = MOBS[e.kind], info = def.boss!;
    costatus.clearBoss(sim, e.id);
    if (e.zone) dread.fallen(sim, e);
    const hx = e.hx ?? e.x, hy = e.hy ?? e.y;
    sim.fx('bossDie', e.x, e.y - 6, '*');
    const credit = sim.creditOf(e.id);
    const people = new Set<string>(Object.keys(credit));
    for (const q of sim.online) if (q.downed <= 0 && dist(q.x, q.y, hx, hy) <= info.arena + TUNING.arenaClear) people.add(q.id);
    // the minions fall with their master
    for (const m of sim.ents('mob')) {
        if (m.id !== e.id && !MOBS[m.kind].boss && dist(m.x, m.y, e.x, e.y) < info.arena + TUNING.arenaClear) mobs.killMob(sim, m, undefined, false);
    }
    sim.s.bosses = sim.s.bosses ?? {};
    sim.s.bosses[info.id] = (sim.s.bosses[info.id] ?? 0) + 1;
    if (sim.s.bosses[info.id] === 1) chronicle.note(sim, `boss:${info.id}`, `${info.title} fell to ${chronicle.names([...people].map((id) => sim.s.players[id]?.name ?? ''))}.`, `i_${info.trophy}`);
    for (const id of people) {
        const q = sim.s.players[id];
        if (!q) continue;
        q.boss = q.boss ?? {};
        const first = !q.boss[info.id];
        q.boss[info.id] = (q.boss[info.id] ?? 0) + 1;
        quests.count(q, `boss:${info.id}`);
        const rng = sim.rng;
        const items: [ItemId, number][] = [[info.trophy, 1], ...fortune.bossCrates(sim, q, info.id)];
        for (const [item, chance, min = 1, max = min] of def.drops) if (rng.chance(chance)) items.push([item, rng.int(min, max)]);
        if (first) {
            items.push([info.gear[0], 1]);
            if (info.gear[1] && rng.chance(0.5)) items.push([info.gear[1], 1]);
        } else if (rng.chance(0.3)) items.push([rng.pick(info.gear), 1]);
        for (const [item, n] of items) {
            sim.give(q, item, n, q.x, q.y - 8);
            if (q.online) sim.toast(q.id, `${n > 1 ? n + '× ' : ''}${ITEMS[item].name}`, `i_${item}`, PAL.gold);
        }
        const coins = rng.int(def.coins[0], def.coins[1]);
        sim.give(q, 'coin', coins, q.x, q.y - 8);
        if (e.zone) { dread.spoils(sim, q, e); quests.count(q, 'warden'); }
        q.points += info.points;
        if (q.online) {
            sim.gainXp(q, def.xp);
            sim.toast(q.id, `+${info.points} skill points`, 'k_star', PAL.gold);
            sim.banner(`${info.title} is defeated!`, first ? 'First victory — a trophy and treasure are yours' : 'Spoils of war', info.color, q.id);
            sim.fx('win', q.x, q.y - 10, q.id);
        }
    }
    sim.forgetCredit(e.id);
    forget(sim, e.id);
}
