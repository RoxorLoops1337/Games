// What the farmer holds: the selected hotbar slot (keys 1-8, the wheel, a click), what selecting does (gear is equipped,
// food and potions used, seeds and pods held for E and T), and which pod to throw at a wild creature.

import { catchChance, POD_POWER, spOf } from '../../shared/data/creatures';
import type { ItemId } from '../../shared/data/items';
import { HOT_SLOTS, hotbarOf, hotKind } from '../../shared/sim/hotbar';
import { countOf } from '../../shared/sim/stats';
import type { Cmd, CritE, PlayerS } from '../../shared/sim/types';
import type { Action } from '../../shared/actions';

type Pod = 'pod' | 'pod_great' | 'pod_ultra';

interface HandsHost {
    readonly ready: boolean;
    readonly menuOpen: boolean;
    readonly meS: PlayerS | null;
    readonly local: { x: number; y: number };
    derivedMe (): { mods: { catch?: number } };
    send (c: Cmd): void;
    /** A sound (and burst) at the farmer, with no shake. */
    play (a: Action, x: number, y: number): void;
    /** "Can't do that": a buzz and a few words over your head. */
    say (text: string): void;
    /** The nearest wild creature in throwing range. */
    wildNear (): CritE | null;
}

export class Hands {
    /** The selected hotbar slot. */
    sel = 0;

    constructor (private h: HandsHost) {}

    held (): ItemId | null { const me = this.h.meS; return me ? hotbarOf(me)[this.sel] ?? null : null; }

    /** Select a slot. Gear is equipped; food and potions are used (unless `use` is false, as when scrolling); seeds and pods are held for E and T. */
    select (i: number, use = true) {
        const h = this.h, me = h.meS;
        if (!h.ready || !me || !Number.isInteger(i) || i < 0 || i >= HOT_SLOTS) return;
        this.sel = i;
        const id = hotbarOf(me)[i];
        h.play(id ? 'equip' : 'pickup', h.local.x, h.local.y - 12);
        if (!id) return;
        const kind = hotKind(id);
        if (kind === 'gear') { if (countOf(me, id) > 0) h.send({ t: 'equip', item: id }); }
        else if (kind === 'use' && use) h.send({ t: 'eat', item: id });
    }

    /** Scroll to the next or previous filled slot. */
    cycle (dir: number) {
        const me = this.h.meS;
        if (!me) return;
        const bar = hotbarOf(me);
        for (let n = 1; n <= HOT_SLOTS; n++) {
            const i = (this.sel + (dir < 0 ? -n : n) + HOT_SLOTS * 2) % HOT_SLOTS;
            if (bar[i]) { this.select(i, false); return; }
        }
    }

    /** Which pod to throw at this species: the cheapest with a fair chance, else the best you carry. */
    podFor (sp: string) {
        const me = this.h.meS!;
        const bonus = this.h.derivedMe().mods.catch ?? 0;
        const held = this.held();
        if (held && hotKind(held) === 'pod' && (me.inv[held] ?? 0) > 0) return { pod: held as Pod, chance: catchChance(spOf(sp).rarity, 1, POD_POWER[held as 'pod'], bonus) };   // the one you chose
        const have = (['pod', 'pod_great', 'pod_ultra'] as const).filter((p) => (me.inv[p] ?? 0) > 0);
        if (!have.length) return null;
        const scored = have.map((pod) => ({ pod, chance: catchChance(spOf(sp).rarity, 1, POD_POWER[pod], bonus) }));
        return scored.find((s) => s.chance >= 0.4) ?? scored[scored.length - 1];
    }

    throwPod () {
        const h = this.h;
        if (!h.ready || h.menuOpen || h.meS!.downed > 0 || h.meS!.co?.k === 'frozen') return;
        const c = h.wildNear();
        if (!c) return;
        const pick = this.podFor(c.sp);
        if (!pick) { h.say('You have no pods'); return; }
        h.send({ t: 'tame', id: c.id, pod: pick.pod });
    }
}
