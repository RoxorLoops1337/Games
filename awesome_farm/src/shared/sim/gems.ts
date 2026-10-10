// Gems in play: socketing, merging, and what a socketed weapon gem does on every hit (data/gems.ts has the numbers).

import { ITEMS, type ItemId } from '../data/items';
import { GEM_POWER, GEM_SOCKETS, isGemSocket, mergeTarget, MERGE_COST, parseGem, type GemSocket } from '../data/gems';
import { PAL } from '../palette';
import * as combat from './combat';
import * as defense from './defense';
import type { Sim } from './sim';
import { addItem, countOf, derived, itemCap, takeItem } from './stats';
import type { MobE, PlayerS } from './types';

/** Put a gem you carry into a socket (the one that was there comes back to the pockets). */
export function set (sim: Sim, p: PlayerS, socket: unknown, item: ItemId) {
    if (!isGemSocket(socket) || !parseGem(item) || countOf(p, item) < 1) return;
    const gems = p.gems ?? (p.gems = {});
    const old = gems[socket];
    takeItem(p, item, 1);
    gems[socket] = item;
    if (old) sim.give(p, old, 1);
    sim.fx('equip', p.x, p.y - 8, p.id);
}

/** Take a gem out of a socket. */
export function clear (sim: Sim, p: PlayerS, socket: unknown) {
    if (!isGemSocket(socket)) return;
    const old = p.gems?.[socket];
    if (!old) return;
    if (countOf(p, old) >= itemCap(p, old)) { sim.deny(p, 'Your pockets are full'); return; }
    delete p.gems![socket];
    addItem(p, old, 1);
    sim.fx('equip', p.x, p.y - 8, p.id);
}

/** Three of one cut become one of the next. */
export function merge (sim: Sim, p: PlayerS, item: ItemId) {
    const next = mergeTarget(item) as ItemId | null;
    if (!next || !ITEMS[next] || countOf(p, item) < MERGE_COST) { sim.deny(p, next ? `You need ${MERGE_COST} of them` : 'It cannot be cut any finer'); return; }
    takeItem(p, item, MERGE_COST);
    sim.give(p, next, 1);
    sim.fx('levelUp', p.x, p.y - 8, p.id);
    sim.float(p.x, p.y - 26, `${ITEMS[next].name}!`, PAL.gold, p.id);
}

/** The weapon gems' effects on one monster `dmg` was just dealt to. Called by the swing (combat.attack); `first` is the target the swing was aimed at. */
export function onHit (sim: Sim, p: PlayerS, m: MobE, dmg: number) {
    if (!p.gems || !sim.s.ents[m.id]) return;
    for (const s of ['w1', 'w2'] as GemSocket[]) {
        const g = parseGem(p.gems[s] ?? '');
        if (!g) continue;
        const i = g.tier - 1;
        switch (g.kind) {
            case 'ruby': defense.burnMob(sim, m, dmg * GEM_POWER.burn[i], GEM_POWER.burnSecs, p); break;
            case 'sapphire': defense.slowMob(sim, m, GEM_POWER.slow[i], GEM_POWER.slowSecs); break;
            case 'emerald': defense.burnMob(sim, m, dmg * GEM_POWER.poison[i], GEM_POWER.poisonSecs, p); break;
            case 'topaz':
                if (sim.rng.chance(GEM_POWER.chain[i])) {
                    const other = sim.ents('mob').find((o) => o.id !== m.id && Math.hypot(o.x - m.x, o.y - m.y) <= GEM_POWER.chainRange);
                    if (other) { sim.fx('zap', other.x, other.y - 6, p.id); combat.damageMob(sim, other, dmg * GEM_POWER.chainShare, p, { quiet: true }); }
                }
                break;
            case 'amethyst':
                if (sim.rng.chance(GEM_POWER.heal[i]) && p.hearts < derived(p).maxHearts) { p.hearts = Math.min(derived(p).maxHearts, p.hearts + GEM_POWER.healHearts); sim.float(p.x, p.y - 22, '+♥', PAL.blossom, p.id); }
                break;
            case 'diamond': break;       // (its bonus is passive: a critical chance, data/gems.ts `gemMods`)
        }
    }
}

/** Every socket there is, for the tests and the screen. */
export const SOCKETS = GEM_SOCKETS;
