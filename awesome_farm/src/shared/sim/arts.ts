// Combat Arts in play (data/arts.ts has the six and their numbers): binding them to the three keys and casting them.
// Every cast is checked here: learned, off cooldown, energy, a real direction. The effects are instant (a line, a ring, a lunge) except the
// Frost Zone, which stays on the ground a few seconds (`sim.artZones`, run by `update`). Each cast sends an `art` event for the picture.

import { ART_LIST, ART_SLOTS, ART_TUNING as T, ARTS, isArt, type ArtId } from '../data/arts';
import { MOBS } from '../data/mobs';
import { PAL } from '../palette';
import * as combat from './combat';
import * as defense from './defense';
import type { Sim } from './sim';
import { derived, hasUnlock } from './stats';
import type { MobE, PlayerS } from './types';

/** The arts a farmer has learned, in the skill tree's order. */
export const learned = (p: PlayerS): ArtId[] => ART_LIST.filter((a) => hasUnlock(p, a.token)).map((a) => a.id);

/** Keep the three slots true: nothing unlearned stays bound, and a newly learned art takes the first empty slot. */
export function sync (p: PlayerS) {
    const have = learned(p);
    const slots: (ArtId | null)[] = Array.from({ length: ART_SLOTS }, (_, i) => (p.arts?.[i] && have.includes(p.arts[i]!) ? p.arts[i]! : null));
    for (let i = 0; i < ART_SLOTS; i++) if (slots[i] && slots.indexOf(slots[i]) !== i) slots[i] = null;          // (never twice)
    for (const id of have) if (!slots.includes(id)) { const f = slots.indexOf(null); if (f >= 0) slots[f] = id; }
    if (!have.length && !p.arts) return;
    p.arts = slots;
}

/** Bind a learned art to a slot (null clears it); an art already on another slot moves. */
export function bind (sim: Sim, p: PlayerS, slot: unknown, id: unknown) {
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= ART_SLOTS) return;
    if (id !== null && (!isArt(id) || !hasUnlock(p, ARTS[id].token))) return;
    sync(p);
    const slots = p.arts ?? (p.arts = Array.from({ length: ART_SLOTS }, () => null));
    if (id !== null) for (let i = 0; i < ART_SLOTS; i++) if (slots[i] === id) slots[i] = null;
    slots[slot as number] = id as ArtId | null;
    sim.fx('equip', p.x, p.y - 8, p.id);
}

const key = (p: PlayerS, id: ArtId) => `${p.id}:${id}`;
/** Seconds until an art can be used again (0: ready). */
export const cooldownLeft = (sim: Sim, p: PlayerS, id: ArtId) => Math.max(0, (sim.artT[key(p, id)] ?? 0) - sim.s.time);

/** The first monster along a line from the farmer: nearest first, within `range` and `width` of the line. */
function firstOnLine (sim: Sim, p: PlayerS, dx: number, dy: number, range: number, width: number): { m: MobE; t: number } | null {
    let best: { m: MobE; t: number } | null = null;
    for (const m of sim.ents('mob')) {
        const rx = m.x - p.x, ry = m.y - p.y, t = rx * dx + ry * dy;
        if (t < 0 || t > range + MOBS[m.kind].r) continue;
        if (Math.abs(rx * dy - ry * dx) > width + MOBS[m.kind].r) continue;
        if (!best || t < best.t) best = { m, t };
    }
    return best;
}

const immune = (m: MobE) => !!MOBS[m.kind].boss || !!m.rb;
/** Stun a monster for a while (a boss shrugs it off). */
function stun (sim: Sim, m: MobE, secs: number) {
    if (immune(m) || !sim.s.ents[m.id]) return;
    m.stun = Math.max(m.stun ?? 0, secs); m.st = 3; m.vx = 0; m.vy = 0;
    sim.touch(m);
}

/** Cast the art in a slot, aimed along (fx, fy). */
export function cast (sim: Sim, p: PlayerS, slot: unknown, fx: unknown, fy: unknown) {
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= ART_SLOTS || p.downed > 0) return;
    const id = p.arts?.[slot as number];
    if (!id || !isArt(id) || !hasUnlock(p, ARTS[id].token)) return;
    const l = Math.hypot(Number(fx), Number(fy));
    if (!(l > 0.1) || !Number.isFinite(l)) return;
    const dx = Number(fx) / l, dy = Number(fy) / l;
    const a = ARTS[id];
    if (cooldownLeft(sim, p, id) > 0) return;
    if (p.energy < a.energy) { sim.deny(p, 'Not enough energy'); return; }
    p.energy -= a.energy;
    sim.artT[key(p, id)] = sim.s.time + a.cd;
    const w = derived(p).weapon.dmg, ox = p.x, oy = p.y - 5;
    const send = (extra: Record<string, number> = {}) => sim.events.push({ e: 'art', k: id, by: p.id, x: Math.round(ox), y: Math.round(oy), tx: Math.round(ox + dx * 40), ty: Math.round(oy + dy * 40), cd: a.cd, ...extra });
    switch (id) {
        case 'hook': {
            const hit = firstOnLine(sim, p, dx, dy, T.hook.range, T.hook.width);
            const reach = hit ? hit.t : T.hook.range;
            sim.events.push({ e: 'art', k: id, by: p.id, x: Math.round(ox), y: Math.round(oy), tx: Math.round(ox + dx * reach), ty: Math.round(oy + dy * reach), cd: a.cd, hit: hit ? 1 : 0 });
            if (!hit) break;
            const m = hit.m;
            if (!immune(m)) {
                const nx = p.x + dx * (T.hook.gap + MOBS[m.kind].r), ny = p.y + dy * (T.hook.gap + MOBS[m.kind].r);
                if (!sim.world.boxBlocked(nx, ny, 3, 2)) { m.x = nx; m.y = ny; }
            }
            combat.damageMob(sim, m, w * T.hook.dmg, p, { quiet: true });
            stun(sim, m, T.hook.stun);
            sim.fx('artHook', m.x, m.y - 6, p.id);
            break;
        }
        case 'arrow': {
            const hit = firstOnLine(sim, p, dx, dy, T.arrow.range, T.arrow.width);
            const reach = hit ? hit.t : T.arrow.range;
            sim.events.push({ e: 'art', k: id, by: p.id, x: Math.round(ox), y: Math.round(oy), tx: Math.round(ox + dx * reach), ty: Math.round(oy + dy * reach), cd: a.cd, hit: hit ? 1 : 0 });
            if (!hit) break;
            const secs = T.arrow.stunMin + (T.arrow.stunMax - T.arrow.stunMin) * Math.min(1, hit.t / T.arrow.range);
            combat.damageMob(sim, hit.m, w * T.arrow.dmg, p, { kx: dx, ky: dy, kb: 40, quiet: true });
            stun(sim, hit.m, secs);
            sim.fx('artArrow', hit.m.x, hit.m.y - 6, p.id);
            break;
        }
        case 'scorch': {
            send({ r: T.scorch.radius });
            for (const m of sim.ents('mob')) {
                const d = Math.hypot(m.x - p.x, m.y - p.y);
                if (d > T.scorch.radius + MOBS[m.kind].r) continue;
                combat.damageMob(sim, m, w * T.scorch.dmg, p, { kx: m.x - p.x, ky: m.y - p.y, kb: T.scorch.knock, quiet: true });
                if (sim.s.ents[m.id]) defense.burnMob(sim, m, w * T.scorch.burn, T.scorch.burnSecs, p);
            }
            sim.fx('artScorch', p.x, p.y - 6, p.id);
            break;
        }
        case 'shroud':
            send();
            p.cl = sim.s.time + T.shroud.secs;
            sim.fx('artShroud', p.x, p.y - 8, p.id);
            break;
        case 'frost': {
            const zx = p.x + dx * T.frost.ahead, zy = p.y + dy * T.frost.ahead;
            send({ r: T.frost.radius, secs: T.frost.secs, tx: Math.round(zx), ty: Math.round(zy) });
            sim.artZones.push({ x: zx, y: zy, r: T.frost.radius, until: sim.s.time + T.frost.secs, by: p.id, next: sim.s.time });
            sim.fx('artFrost', zx, zy, p.id);
            break;
        }
        case 'ram': {
            // the lunge: the first monster in the way is thrown on ahead of you, dazed; you end up where it stood
            const hit = firstOnLine(sim, p, dx, dy, T.ram.lunge, T.ram.width);
            const go = Math.min(T.ram.lunge, hit ? Math.max(0, hit.t - MOBS[hit.m.kind].r - 4) : T.ram.lunge);
            let nx = p.x + dx * go, ny = p.y + dy * go;
            while (go > 0 && sim.world.boxBlocked(nx, ny, 3, 2) && Math.hypot(nx - p.x, ny - p.y) > 2) { nx -= dx * 4; ny -= dy * 4; }
            sim.events.push({ e: 'art', k: id, by: p.id, x: Math.round(ox), y: Math.round(oy), tx: Math.round(nx), ty: Math.round(ny - 5), cd: a.cd, hit: hit ? 1 : 0 });
            p.x = nx; p.y = ny; p.warp = (p.warp ?? 0) + 1;
            if (hit) {
                const m = hit.m;
                combat.damageMob(sim, m, w * T.ram.dmg, p, { kx: dx, ky: dy, kb: T.ram.throw, quiet: true });
                stun(sim, m, T.ram.stun);
                sim.fx('artRam', m.x, m.y - 6, p.id);
            }
            break;
        }
    }
    sim.float(p.x, p.y - 28, a.name, PAL.cream, p.id, `art-${id}`);
}

/** Every step: the Frost Zones slow what stands in them (and hurt it a little), then melt. */
export function update (sim: Sim) {
    if (sim.s.tick % 20 === 0) for (const p of sim.online) sync(p);              // (a skill learned any way at all, the developer menu too, puts its art on a key)
    if (!sim.artZones.length) {
        for (const p of sim.online) if (p.cl && sim.s.time >= p.cl) { delete p.cl; }
        return;
    }
    const now = sim.s.time;
    for (const z of sim.artZones) {
        if (now < z.next) continue;
        z.next = now + 0.4;
        const by = sim.s.players[z.by], w = by ? derived(by).weapon.dmg : 1;
        for (const m of sim.ents('mob')) {
            if (Math.hypot(m.x - z.x, m.y - z.y) > z.r + MOBS[m.kind].r) continue;
            defense.slowMob(sim, m, immune(m) ? 0.5 : T.frost.slow, 0.6);
            if (by) combat.damageMob(sim, m, w * T.frost.dps * 0.4, by, { quiet: true, nofloat: true });
        }
    }
    sim.artZones = sim.artZones.filter((z) => now < z.until);
    for (const p of sim.online) if (p.cl && now >= p.cl) delete p.cl;
}
