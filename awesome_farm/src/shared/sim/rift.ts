// Expeditions. A party launches from an Expedition Dock to a rift island (one of four in the
// corners of the sea), fights waves of monsters, chooses a boon between waves and faces a
// guardian. Boons last only for the run. The run ends in victory (everything pays out), by
// everyone falling (a share of the spoils, and nobody loses anything) or when the party leaves.

import { RIFT_ISLANDS, TILE } from '../config';
import type { ItemId } from '../data/items';
import { BOON_BY_ID, cleanOmens, DAILY_BONUS, dailyRift, dailyShards, isBossWave, offerBoons, omenMul, RIFT_PARTY_MAX, RIFT_PICK_SECONDS, RIFT_TIERS, riftReward, waveSpec } from '../data/rift';
import { MOBS } from '../data/mobs';
import { PAL } from '../palette';
import * as chronicle from './chronicle';
import * as costatus from './costatus';
import * as fortune from './fortune';
import * as quests from './quests';
import type { Sim } from './sim';
import { derived } from './stats';
import type { Cmd, MobE, PlayerS, RiftRun, RiftView } from './types';

const READY = 5;              // s between waves
const READY_RUSH = 1.5;       // … under the Relentless omen
const readyOf = (run: RiftRun) => (run.omens?.includes('rush') ? READY_RUSH : READY);
const RESULTS = 14;           // s the party can look at the results before being sent home
const REGEN_EVERY = 8;

export const bossCount = (p: PlayerS) => Object.keys(p.boss ?? {}).length;
const runOf = (sim: Sim, p: PlayerS): RiftRun | undefined => (p.rift ? sim.s.rifts?.[p.rift.arena] : undefined);
export const hasBoon = (p: PlayerS, id: string) => !!p.boons?.includes(id);
/** Omens unlock for a rift once you have cleared it (the Abyss: once you have dived ten waves deep). */
const omensOpen = (p: PlayerS, tier: number) => (p.cnt?.[`riftwin:${tier}`] ?? 0) > 0;

/** Everything a run pays is scaled by its omens, and a little more on the rift of the day. */
const runMul = (run: RiftRun): number => omenMul(run.omens) + (run.daily ? DAILY_BONUS : 0);

const members = (sim: Sim, run: RiftRun) => run.party.map((id) => sim.s.players[id]).filter((p): p is PlayerS => !!p);

// ── commands ───────────────────────────────────────────────────────────────
export function cmd (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'rift' }>) {
    if (c.op === 'launch') launch(sim, p, c.id, c.tier, c.omens, c.daily === true);
    else if (c.op === 'pick') pick(sim, p, c.i);
    else if (c.op === 'leave') leave(sim, p);
}

function launch (sim: Sim, p: PlayerS, dockId: number, tier: number, wanted?: unknown, daily = false) {
    const dock = sim.s.ents[dockId];
    if (!dock || dock.k !== 'bld' || dock.kind !== 'dock' || !sim.inReach(p, dock, 90)) return;
    if (p.rift) { sim.deny(p, 'You are already on an expedition'); return; }
    // the rift of the day: the host decides which rift and which omens, once a day
    let forced: string[] | undefined;
    if (daily) {
        if (p.daily === sim.s.day) { sim.deny(p, 'You already cleared today\'s rift'); return; }
        const d = dailyRift(sim.s.seed, sim.s.day, bossCount(p));
        if (d.tier < 0) { sim.deny(p, 'Defeat a boss to open the rift of the day'); return; }
        tier = d.tier; forced = d.omens;
    }
    const t = RIFT_TIERS[tier];
    if (!Number.isInteger(tier) || !t) return;
    if (bossCount(p) < t.need) { sim.deny(p, `Defeat ${t.need} boss${t.need > 1 ? 'es' : ''} first`); return; }
    const omens = forced ?? cleanOmens(wanted);
    if (!forced && omens.length && !omensOpen(p, tier)) { sim.deny(p, 'Clear this rift once to take on omens'); return; }
    const rifts = (sim.s.rifts ??= {});
    let arena = -1;
    for (let i = 0; i < RIFT_ISLANDS; i++) if (!rifts[i]) { arena = i; break; }
    if (arena < 0) { sim.deny(p, 'Every rift is busy right now'); return; }
    // everyone standing close to you comes along (up to four), if they are ready for it
    const near = sim.online.filter((q) => q.id !== p.id && !q.rift && q.downed <= 0 && Math.hypot(q.x - p.x, q.y - p.y) <= 120);
    const ready = (q: PlayerS) => bossCount(q) >= t.need && (!omens.length || !!forced || omensOpen(q, tier));
    const party = [p, ...near.filter(ready)].slice(0, RIFT_PARTY_MAX);
    for (const q of near) if (!party.includes(q)) sim.toast(q.id, bossCount(q) < t.need ? `The ${t.name} needs ${t.need} boss${t.need > 1 ? 'es' : ''} defeated` : !ready(q) ? 'Clear this rift once to take on omens' : 'The party is full', 'k_flag', PAL.pebble);
    const run: RiftRun = { arena, tier, party: party.map((q) => q.id), from: {}, started: sim.s.time, wave: 0, ph: 0, t: READY, queue: [], offers: {}, kills: 0, banked: {}, ...(omens.length ? { omens } : {}), ...(forced ? { daily: true as const } : {}) };
    rifts[arena] = run;
    const c = sim.world.riftCenter(arena);
    party.forEach((q, i) => {
        run.from[q.id] = { x: q.x, y: q.y };
        run.banked[q.id] = { coins: 0, xp: 0 };
        q.boons = [];
        const a = (i / party.length) * Math.PI * 2 + 0.7;
        q.x = c.x + Math.cos(a) * 26; q.y = c.y + Math.sin(a) * 20 + 6; q.warp++;
        q.hearts = Math.max(q.hearts, derived(q).maxHearts);
        q.energy = derived(q).maxEnergy;
        q.invuln = 2.5;
        sim.fx('riftEnter', q.x, q.y - 8, q.id);
        sim.banner(t.name, t.endless ? 'Endless: a guardian every fifth wave · cash out whenever you like' : `${t.waves} waves · a guardian waits at the end`, t.color, q.id);
        if (omens.length) sim.toast(q.id, `${forced ? 'Rift of the day · ' : ''}${omens.length} omen${omens.length > 1 ? 's' : ''}: +${Math.round((omenMul(omens) - 1 + (forced ? DAILY_BONUS : 0)) * 100)}% rewards`, 'k_skull', PAL.berry);
        quests.count(q, 'riftrun');
    });
    syncViews(sim, run);
}

function pick (sim: Sim, p: PlayerS, i: number) {
    const run = runOf(sim, p);
    if (!run || run.ph !== 2) return;
    const offer = run.offers[p.id];
    const id = Number.isInteger(i) ? offer?.[i] : undefined;
    if (!id) return;
    take(sim, run, p, id);
    if (!Object.keys(run.offers).length) { run.ph = 0; run.t = readyOf(run); }
    syncViews(sim, run);
}

function take (sim: Sim, run: RiftRun, p: PlayerS, id: string) {
    const b = BOON_BY_ID[id];
    delete run.offers[p.id];
    if (!b) return;
    const before = derived(p).maxHearts;
    p.boons = [...(p.boons ?? []), id];
    const after = derived(p).maxHearts;
    p.hearts = after > before ? p.hearts + (after - before) : Math.min(p.hearts, after);
    sim.fx('boon', p.x, p.y - 10, p.id);
    quests.count(p, 'boonpick');
    sim.toast(p.id, `${b.name}: ${b.desc}`, b.icon, PAL.gold);
}

/** Leave the expedition: back to the dock with what you have earned so far. */
function leave (sim: Sim, p: PlayerS) {
    const run = runOf(sim, p);
    if (!run) return;
    // in the Abyss, leaving is cashing out: the waves you cleared pay, and your best depth is remembered
    if (RIFT_TIERS[run.tier].endless && run.ph !== 3 && clearedWaves(run) > 0) payEndless(sim, run, p, true);
    sendHome(sim, run, p);
    run.party = run.party.filter((id) => id !== p.id);
    delete run.offers[p.id];
    if (!run.party.length) finish(sim, run);
    else syncViews(sim, run);
}

/** The party member's bleed-out ran out: they are carried home, the rest fight on. */
export function eliminate (sim: Sim, p: PlayerS) {
    const run = runOf(sim, p);
    if (!run) return;
    if (run.ph !== 3 && run.party.length === 1) end(sim, run);      // the last one standing: the results still show
    if (RIFT_TIERS[run.tier].endless && run.ph !== 3 && clearedWaves(run) > 0) payEndless(sim, run, p, false);
    sendHome(sim, run, p);
    run.party = run.party.filter((id) => id !== p.id);
    delete run.offers[p.id];
    sim.banner('The rift spat you out', 'You keep everything you earned', PAL.cream, p.id);
    if (!run.party.length) finish(sim, run);
    else syncViews(sim, run);
}

/** A player disconnected: out of the run (and safe at the dock) so they never log back into an arena. */
export function onLeave (sim: Sim, p: PlayerS) { if (p.rift) leave(sim, p); }

/** After a load: every run ends, everyone is back at their dock, every rift monster is gone. */
export function recover (sim: Sim) {
    for (const run of Object.values(sim.s.rifts ?? {})) for (const q of members(sim, run)) sendHome(sim, run, q);
    for (const p of Object.values(sim.s.players)) { p.rift = undefined; p.boons = undefined; }
    sim.s.rifts = {};
    for (let i = 0; i < RIFT_ISLANDS; i++) clearArena(sim, i);
}

/** Make sure nobody stands on a rift island without a run (a save from a crashed server, say). */
export function strandedCheck (sim: Sim, p: PlayerS) {
    if (!p.rift && sim.world.riftAtPx(p.x, p.y) >= 0) sim.respawnHome(p);
}

function sendHome (sim: Sim, run: RiftRun, p: PlayerS) {
    const at = run.from[p.id];
    if (at) { p.x = at.x; p.y = at.y; p.warp++; }
    p.rift = undefined;
    p.boons = undefined;
    costatus.clear(sim, p);               // (a frozen, cursed or chained farmer leaves the expedition free)
    p.invuln = 2;
    p.downed = 0; p.revive = 0;
    p.hearts = Math.max(p.hearts, derived(p).maxHearts * 0.5);
    sim.fx('riftEnter', p.x, p.y - 8, p.id);
}

// ── the run ─────────────────────────────────────────────────────────────────
export function update (sim: Sim, dt: number) {
    const rifts = sim.s.rifts;
    if (!rifts) return;
    for (const run of Object.values(rifts)) step(sim, run, dt);
}

function step (sim: Sim, run: RiftRun, dt: number) {
    // anyone who vanished from the party's list (offline) is out
    for (const id of [...run.party]) {
        const q = sim.s.players[id];
        if (!q || !q.online) { if (q) { sendHome(sim, run, q); } run.party = run.party.filter((x) => x !== id); delete run.offers[id]; }
    }
    if (!run.party.length) { finish(sim, run); return; }
    const party = members(sim, run);
    // run-long effects
    for (const q of party) {
        if (run.ph === 3 || q.downed > 0) continue;
        if (hasBoon(q, 'regen') && Math.floor(sim.s.time / REGEN_EVERY) !== Math.floor((sim.s.time - dt) / REGEN_EVERY)) sim.heal(q, 0.5);
    }
    if (run.ph === 0) {
        run.t -= dt;
        if (run.t <= 0) startWave(sim, run);
    } else if (run.ph === 1) {
        run.t += dt;
        while (run.queue.length && run.queue[0].at <= run.t) spawnOne(sim, run, run.queue.shift()!);
        const alive = aliveCount(sim, run.arena);
        if (!run.queue.length && !alive) clearWave(sim, run);
        else if (party.every((q) => q.downed > 0)) end(sim, run);
        else if (!run.queue.length && alive <= 3) {
            // a straggler that cannot be reached (kiting, or stuck behind something) must never stall the run
            run.stall = (run.stall ?? 0) + dt;
            if (run.stall > 22) { gather(sim, run); run.stall = 0; }
        } else run.stall = 0;
    } else if (run.ph === 2) {
        run.t -= dt;
        if (run.t <= 0) {
            // anyone who has not chosen gets a random one of their three
            for (const q of party) { const o = run.offers[q.id]; if (o) take(sim, run, q, sim.rng.pick(o)); }
            run.ph = 0; run.t = readyOf(run);
        }
    } else {
        run.t -= dt;
        if (run.t <= 0) { finish(sim, run); return; }
    }
    syncViews(sim, run);
}

function aliveCount (sim: Sim, arena: number) {
    let n = 0;
    for (const e of sim.ents('mob')) if (e.rift === arena) n++;
    return n;
}

/** Pull the last monsters in beside the party. */
function gather (sim: Sim, run: RiftRun) {
    const c = sim.world.riftCenter(run.arena);
    for (const e of sim.ents('mob')) {
        if (e.rift !== run.arena) continue;
        for (let tries = 0; tries < 16; tries++) {
            const a = sim.rng.next() * Math.PI * 2, r = (1.2 + sim.rng.next() * 2.4) * TILE;
            const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r * 0.9;
            if (sim.world.boxBlocked(x, y, 4, 3)) continue;
            e.x = x; e.y = y; e.vx = 0; e.vy = 0;
            sim.touch(e);
            break;
        }
    }
}

function startWave (sim: Sim, run: RiftRun) {
    const t = RIFT_TIERS[run.tier];
    run.wave++;
    run.ph = 1; run.t = 0;
    run.queue = waveSpec(run.tier, run.wave, run.party.length, sim.rng, run.omens);
    const c = sim.world.riftCenter(run.arena);
    const last = isBossWave(t, run.wave);
    for (const q of members(sim, run)) {
        sim.banner(last ? 'The guardian' : t.endless ? `Wave ${run.wave}` : `Wave ${run.wave} of ${t.waves}`, last ? `${MOBS[run.queue.find((m) => m.guardian)?.kind ?? t.guardian].name} and its escort` : `${run.queue.length} monsters`, last ? PAL.berry : t.color, q.id);
        if (hasBoon(q, 'aegis')) q.invuln = Math.max(q.invuln, 4);
    }
    sim.fx('waveStart', c.x, c.y - 10, '*');
}

function spawnOne (sim: Sim, run: RiftRun, m: RiftRun['queue'][number]) {
    const t = RIFT_TIERS[run.tier];
    const def = MOBS[m.kind];
    const c = sim.world.riftCenter(run.arena);
    const party = Math.max(1, run.party.length);
    let x = c.x, y = c.y;
    for (let tries = 0; tries < 14; tries++) {
        const a = sim.rng.next() * Math.PI * 2, r = (3.2 + sim.rng.next() * 1.4) * TILE;
        x = c.x + Math.cos(a) * r; y = c.y + Math.sin(a) * r * 0.9;
        if (!sim.world.boxBlocked(x, y, 4, 3)) break;
    }
    const omens = run.omens ?? [];
    const tough = omens.includes('tough') ? 1.5 : 1;
    const hp = m.guardian
        ? Math.round(def.hp * t.guardianHp * (0.7 + 0.3 * party) * (t.endless ? 1 + 0.1 * run.wave : 1) * tough)
        : Math.max(1, Math.round(def.hp * t.hpMul * (1 + (t.endless ? 0.1 : 0.08) * (run.wave - 1)) * (0.75 + 0.25 * party) * (m.elite ? 1.8 : 1) * tough));
    const e = sim.add<MobE>({
        k: 'mob', kind: m.kind, x, y, hp, mhp: hp, vx: 0, vy: 0, t: sim.rng.next(), hopT: 0, knockT: 0, a: 1 + sim.rng.next() * 1.5,
        rift: run.arena, dm: t.dm * (t.endless ? 1 + 0.02 * (run.wave - 1) : 1) * (omens.includes('brutal') ? 1.4 : 1), ...(m.elite || m.guardian ? { el: 1 as const } : {}),
        ...(omens.includes('swift') ? { sm: 1.3 } : {}),
        ...(m.guardian ? { rb: 1 as const, rt: run.tier, hx: c.x, hy: c.y, ph: 0, pi: 0, pt: 2, st: 0 } : {}),
    });
    if (m.guardian) sim.fx('roar', x, y - 6, '*');
    return e;
}

/** Called when one of the run's monsters dies. */
export function onKill (sim: Sim, e: MobE) {
    const run = e.rift !== undefined ? sim.s.rifts?.[e.rift] : undefined;
    if (run) run.kills++;
}

function clearWave (sim: Sim, run: RiftRun) {
    const t = RIFT_TIERS[run.tier];
    const c = sim.world.riftCenter(run.arena);
    sim.fx('waveClear', c.x, c.y - 10, '*');
    for (const q of members(sim, run)) {
        const bounty = (hasBoon(q, 'bounty') ? 2 : 1) * runMul(run);
        const tierMul = t.endless ? 3 : run.tier + 1;          // the Abyss pays most at the end, in shards
        const coins = Math.round(6 * tierMul * (1 + run.wave * 0.5) * bounty);
        const xp = Math.round(8 * tierMul * (1 + run.wave * 0.4) * bounty);
        sim.give(q, 'coin', coins);
        sim.gainXp(q, xp);
        const bank = (run.banked[q.id] ??= { coins: 0, xp: 0 });
        bank.coins += coins; bank.xp += xp;
        quests.count(q, 'riftwave');
        if (t.endless) { const c = (q.cnt ??= {}); c.abyssbest = Math.max(c.abyssbest ?? 0, run.wave); }
        // a breather: back on your feet and a heart better
        if (q.downed > 0) sim.getUp(q);
        sim.heal(q, 1);
        q.energy = Math.max(q.energy, derived(q).maxEnergy * 0.7);
    }
    if (!t.endless && run.wave >= t.waves) { win(sim, run); return; }
    // between waves: each farmer picks one of three boons (when there are any left to offer)
    run.ph = 2; run.t = RIFT_PICK_SECONDS;
    if (!run.omens?.includes('spartan')) for (const q of members(sim, run)) { const o = offerBoons(sim.rng, q.boons ?? [], run.wave); if (o.length) run.offers[q.id] = o; }
    if (!Object.keys(run.offers).length) { run.ph = 0; run.t = readyOf(run); }
}

function win (sim: Sim, run: RiftRun) {
    const t = RIFT_TIERS[run.tier];
    run.ph = 3; run.t = RESULTS; run.win = true;
    const c = sim.world.riftCenter(run.arena);
    sim.fx('riftWin', c.x, c.y - 12, '*');
    const secs = Math.round(sim.s.time - run.started);
    for (const q of members(sim, run)) {
        const r = riftReward(run.tier, run.wave, sim.rng, run.party.length);
        r.loot.push(fortune.riftCrate(run.tier));
        const greed = (hasBoon(q, 'greed') ? 1.4 : 1) * runMul(run);
        const shards = Math.round(r.shards * greed), coins = Math.round(r.coins * greed), xpGain = Math.round(r.xp * runMul(run));
        if (shards) sim.give(q, 'rift_shard', shards);
        sim.give(q, 'coin', coins);
        for (const [item, n] of r.loot) sim.give(q, item, n);
        sim.gainXp(q, xpGain);
        const first = !(q.cnt?.[`riftwin:${run.tier}`]);
        let points = 0;
        if (first) { points = t.points; q.points += points; }
        // the first clear of the rift of the day pays a little extra, once a day
        let dailyExtra = 0;
        if (run.daily && q.daily !== sim.s.day) {
            dailyExtra = dailyShards(run.tier);
            sim.give(q, 'rift_shard', dailyExtra);
            q.daily = sim.s.day;
            quests.count(q, 'dailywin');
        }
        quests.count(q, `riftwin:${run.tier}`);
        if (run.omens) { quests.count(q, 'omenwin'); if (run.omens.length >= 3) quests.count(q, 'omen3win'); }
        const bank = run.banked[q.id] ?? { coins: 0, xp: 0 };
        sim.events.push({
            e: 'riftend', to: q.id, win: true, tier: run.tier, wave: run.wave, waves: t.waves, kills: run.kills, secs,
            coins: coins + bank.coins, xp: xpGain + bank.xp, loot: [...(shards ? [['rift_shard', shards] as [typeof r.loot[number][0], number]] : []), ...r.loot], points, first, boons: q.boons ?? [],
            ...(run.omens ? { bonus: Math.round((runMul(run) - 1) * 100) } : {}),
            ...(run.daily && dailyExtra ? { daily: dailyExtra } : {}),
        });
        chronicle.note(sim, `rift:${run.tier}`, `${q.name} cleared ${t.name} for the first time.`, 'k_compass');
        sim.banner(`${t.name} cleared!`, dailyExtra ? `Rift of the day: +${dailyExtra} bonus shards` : first ? `First clear: +${points} skill point${points > 1 ? 's' : ''}` : 'Well fought', PAL.gold, q.id);
    }
}

/** Everyone fell, or the party gave up: a share of the shards for the waves that were cleared. */
function end (sim: Sim, run: RiftRun) {
    const t = RIFT_TIERS[run.tier];
    run.ph = 3; run.t = 6; run.win = false;
    const c = sim.world.riftCenter(run.arena);
    sim.fx('riftFail', c.x, c.y - 12, '*');
    const secs = Math.round(sim.s.time - run.started);
    for (const id of run.party) {
        const q = sim.s.players[id];
        if (!q) continue;
        if (t.endless) { payEndless(sim, run, q, false, secs); continue; }
        const r = riftReward(run.tier, Math.max(0, run.wave - 1), sim.rng, run.party.length);
        r.shards = Math.round(r.shards * runMul(run));
        if (r.shards) sim.give(q, 'rift_shard', r.shards);
        const bank = run.banked[q.id] ?? { coins: 0, xp: 0 };
        sim.events.push({
            e: 'riftend', to: q.id, win: false, tier: run.tier, wave: Math.max(0, run.wave - 1), waves: t.waves, kills: run.kills, secs,
            coins: bank.coins, xp: bank.xp, loot: r.shards ? [['rift_shard', r.shards]] : [], points: 0, first: false, boons: q.boons ?? [],
            ...(run.omens ? { bonus: Math.round((runMul(run) - 1) * 100) } : {}),
        });
        sim.banner('The rift closes', 'Nothing is lost — try again', PAL.berry, q.id);
    }
}

/** Waves fully cleared so far (the one being fought does not count). */
const clearedWaves = (run: RiftRun) => (run.ph === 1 ? Math.max(0, run.wave - 1) : run.wave);

/** The Abyss pays for the waves cleared, whether you cash out (`cashed`) or fall. */
function payEndless (sim: Sim, run: RiftRun, q: PlayerS, cashed: boolean, secsIn?: number) {
    const t = RIFT_TIERS[run.tier];
    const cleared = clearedWaves(run);
    const r = riftReward(run.tier, cleared, sim.rng, run.party.length);
    const greed = (hasBoon(q, 'greed') ? 1.4 : 1) * runMul(run);
    const shards = Math.round(r.shards * greed), coins = Math.round(r.coins * greed), xpGain = Math.round(r.xp * runMul(run));
    if (shards) sim.give(q, 'rift_shard', shards);
    if (coins) sim.give(q, 'coin', coins);
    for (const [item, n] of r.loot) sim.give(q, item, n);
    if (xpGain) sim.gainXp(q, xpGain);
    const first = !(q.cnt?.['riftwin:5']) && cleared >= 10;
    let points = 0;
    if (first) { points = t.points; q.points += points; quests.count(q, 'riftwin:5'); }
    const bank = run.banked[q.id] ?? { coins: 0, xp: 0 };
    sim.events.push({
        e: 'riftend', to: q.id, win: cashed, tier: run.tier, wave: cleared, waves: 0, kills: run.kills, secs: secsIn ?? Math.round(sim.s.time - run.started),
        coins: coins + bank.coins, xp: xpGain + bank.xp, loot: [...(shards ? [['rift_shard', shards] as [ItemId, number]] : []), ...r.loot], points, first, boons: q.boons ?? [], endless: true,
        ...(run.omens ? { bonus: Math.round((runMul(run) - 1) * 100) } : {}),
    });
    sim.banner(cashed ? `Cashed out at wave ${cleared}` : `The Abyss claims you at wave ${cleared + 1}`, first ? `First deep dive: +${points} skill points` : cleared ? `${shards} rift shards` : 'Nothing is lost', cashed ? PAL.gold : PAL.berry, q.id);
}

/** Send everyone home, wipe the island, free the rift. */
function finish (sim: Sim, run: RiftRun) {
    for (const q of members(sim, run)) sendHome(sim, run, q);
    delete sim.s.rifts?.[run.arena];
    clearArena(sim, run.arena);
}

function clearArena (sim: Sim, arena: number) {
    for (const e of sim.ents('mob')) if (e.rift === arena) sim.remove(e.id);
    for (const e of sim.ents('proj')) if (sim.world.riftAtPx(e.x, e.y) === arena) sim.remove(e.id);
    for (const e of sim.ents('drop')) if (sim.world.riftAtPx(e.x, e.y) === arena) sim.remove(e.id);
}

/** The same view (so the farmer's record need not change)? The lists are compared as lists: they are short. */
function sameView (a: RiftView | undefined, b: RiftView): boolean {
    if (!a) return false;
    const same = (x?: readonly string[], y?: readonly string[]) => x === y || (!!x && !!y && x.length === y.length && x.every((v, i) => v === y[i]));
    return a.arena === b.arena && a.tier === b.tier && a.wave === b.wave && a.waves === b.waves && a.ph === b.ph && a.left === b.left && a.t === b.t
        && a.party === b.party && a.kills === b.kills && a.win === b.win && a.daily === b.daily && same(a.offer, b.offer) && same(a.omens, b.omens);
}

// ── what the party sees ─────────────────────────────────────────────────────
function syncViews (sim: Sim, run: RiftRun) {
    const t = RIFT_TIERS[run.tier];
    const left = run.queue.length + aliveCount(sim, run.arena);
    for (const q of members(sim, run)) {
        const v: RiftView = {
            arena: run.arena, tier: run.tier, wave: Math.max(1, run.wave), waves: t.endless ? 0 : t.waves, ph: run.ph, left,
            t: run.ph === 1 ? 0 : Math.max(0, Math.ceil(run.t)), party: run.party.length, kills: run.kills,
            ...(run.ph === 2 && run.offers[q.id] ? { offer: run.offers[q.id] } : {}),
            ...(run.ph === 3 ? { win: !!run.win } : {}),
            ...(run.omens ? { omens: run.omens } : {}),
            ...(run.daily ? { daily: true as const } : {}),
        };
        if (!sameView(q.rift, v)) q.rift = v;
    }
}

