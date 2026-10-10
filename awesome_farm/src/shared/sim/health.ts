// Hearts: taking a hit, going down, being picked up or waking at home, healing, and the revive command.

import { PLOT, TILE, TUNING } from '../config';
import { dist } from '../geom';
import { PAL } from '../palette';
import * as bed from './bed';
import * as costatus from './costatus';
import * as death from './death';
import * as quests from './quests';
import * as rift from './rift';
import type { Sim } from './sim';
import { derived, rankOf } from './stats';
import type { PlayerS } from './types';

/** A fall nobody picked you up from: it costs half your XP towards the next level and your backpack (see sim/death.ts). */
export function die (sim: Sim, p: PlayerS) {
    respawnHome(sim, p, death.penalty(sim, p));
}

export function respawnHome (sim: Sim, p: PlayerS, note = 'Nothing was lost') {
    const home = sim.homePlot(p.slot);
    const o = sim.world.plotOrigin(home);
    const inBed = bed.wakeSpot(sim, p);                  // (a farmer with a Bed wakes beside it)
    const spot = inBed ?? sim.nearestFree(o.tx + PLOT / 2, o.ty + PLOT / 2) ?? { tx: o.tx + PLOT / 2, ty: o.ty + PLOT / 2 };
    p.x = (spot.tx + 0.5) * TILE;
    p.y = (spot.ty + 1) * TILE - 3;
    p.warp++;
    p.downed = 0;
    p.revive = 0;
    costatus.clear(sim, p);
    p.hearts = derived(p).maxHearts;
    p.energy = Math.max(p.energy, 30);
    p.invuln = 2;
    sim.fx('heal', p.x, p.y - 8, p.id);
    sim.banner(inBed ? 'You woke up in your bed' : 'You woke up at home', note, PAL.cream, p.id);
}

export function hurt (sim: Sim, p: PlayerS, from: { x: number; y: number }, amount = 1) {
    if (p.buffs.some((b) => b.id === 'devgod')) return;           // (developer menu: god mode)
    if (p.co?.k === 'frozen') return;
    if (p.cl) delete p.cl;                                          // (a blow breaks the Shroud)                              // (frozen solid: nothing can hurt you, and a friend is on the way: sim/costatus.ts)
    const d = derived(p);
    if (d.dodge > 0 && sim.rng.chance(d.dodge)) {
        p.invuln = 0.5;
        sim.float(p.x, p.y - 22, 'Dodged!', PAL.foam, p.id);
        quests.count(p, 'dodge');
        return;
    }
    // armor shaves damage in half-heart steps, never below half a heart
    const dmg = Math.max(0.5, Math.round((amount - d.armor) * 2) / 2);
    p.hearts = Math.max(0, p.hearts - dmg);
    p.invuln = TUNING.hurtInvuln;
    const dx = p.x - from.x, dy = p.y - from.y, dist = Math.max(1, Math.hypot(dx, dy));
    sim.events.push({ e: 'knock', to: p.id, vx: (dx / dist) * 160, vy: (dy / dist) * 160 });
    sim.fx('hurt', p.x, p.y - 8, p.id);
    if (p.hearts <= 0) down(sim, p);
}

export function down (sim: Sim, p: PlayerS) {
    const friends = sim.online.filter((q) => q.id !== p.id && q.downed <= 0).length;
    if (p.rift && rift.hasBoon(p, 'phoenix')) {
        // a Phoenix Feather: rise again, once
        p.boons = p.boons!.filter((b) => b !== 'phoenix');
        p.hearts = Math.max(1, derived(p).maxHearts * 0.5);
        p.invuln = 3;
        sim.fx('revive', p.x, p.y - 8, p.id);
        sim.banner('Phoenix Feather!', 'You rise again', PAL.pumpkin, p.id);
        return;
    }
    p.hearts = 0;
    p.revive = 0;
    p.moving = false;
    costatus.clear(sim, p);
    p.downed = friends ? TUNING.downedSeconds : TUNING.downedSoloSeconds;
    if (rankOf(p, 'c_wind') > 0 && p.windDay !== sim.s.day) {
        p.downed = 2;
        sim.windUp.add(p.id);
    }
    sim.fx('downed', p.x, p.y - 8, p.id);
    sim.bannerOthers(p.id, `${p.name} is down!`, 'Hold E next to them to help them up', PAL.berry);
    sim.banner('Knocked out!', sim.windUp.has(p.id) ? 'Second Wind — getting back up…'
        : p.rift ? (friends ? 'Hang on — a friend can revive you' : 'Waking up at the dock…')
        : friends ? 'A friend can revive you — or you lose your backpack' : 'Waking up at home — without your backpack…', PAL.berry, p.id);
}

export function getUp (sim: Sim, p: PlayerS, by?: PlayerS) {
    p.downed = 0;
    p.revive = 0;
    p.hearts = Math.min(2, derived(p).maxHearts);
    p.invuln = 2;
    sim.fx('revive', p.x, p.y - 8, p.id);
    if (by) {
        by.stats.revives++;
        quests.count(by, 'revive');
        sim.banner(`${by.name} got you up!`, undefined, PAL.lime, p.id);
        sim.float(by.x, by.y - 22, `Revived ${p.name}`, PAL.lime, by.id);
    }
}

export function heal (sim: Sim, p: PlayerS, amount = 1) {
    const max = derived(p).maxHearts;
    const add = Math.min(max - p.hearts, amount * derived(p).healMul);
    if (add <= 0) return;
    p.hearts = Math.min(max, p.hearts + add);
    sim.fx('heal', p.x, p.y - 10, p.id);
    sim.float(p.x, p.y - 22, `+${Math.round(add * 2) / 2} ♥`, PAL.blossom, p.id);
}

export function cmdRevive (sim: Sim, p: PlayerS, who: string) {
    const t = sim.s.players[who];
    if (t?.online && t.id !== p.id && t.co?.k === 'frozen') { costatus.thaw(sim, p, t); return; }      // (a frozen friend: the same hold, and a quicker thaw)
    if (!t || !t.online || t.downed <= 0 || t.id === p.id || sim.windUp.has(t.id)) return;
    if (dist(t.x, t.y, p.x, p.y) > TUNING.reviveRange) return;
    const last = sim.reviveMsgAt[p.id] ?? -1;
    t.revive += Math.min(0.15, Math.max(0, sim.s.time - last));
    sim.reviveMsgAt[p.id] = sim.s.time;
    sim.reviveAt[t.id] = sim.s.time;
    if (t.revive >= TUNING.reviveSeconds) getUp(sim, t, p);
}
