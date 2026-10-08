// Co-op boss statuses: three things a boss can do to a farmer that a friend has to help with. Each is laid by one
// of the boss patterns in `COOP_PATTERNS`, and only while two or more farmers are up in the arena; a lone farmer
// meets the old fight (data/mobs.ts: a phase's `alone` list says what stands in for the pattern). The rules are
// sim/costatus.ts; the client draws them (world/costatus.ts, ui/costatus.ts).
//
//   Frozen   an icy blast freezes you solid. You cannot move, swing or dash, and nothing can hurt you. A friend
//            who stands beside you and holds E thaws you in a moment; if nobody does you thaw slowly.
//   Hexed    a curse that ticks a little more every second. Stand beside a friend for a moment and it jumps to
//            them, so the party passes it round and keeps moving. It fades by itself.
//   Tether   two farmers are chained together. While they are further apart than the chain is long it pulls and
//            hurts both, so they fight within reach of each other.

import { PAL } from '../palette';
import { TILE, TUNING } from '../config';
import type { CoPattern } from './mobs';

export type CoKind = 'frozen' | 'hexed' | 'tether';

/** A status as it sits on a farmer (`PlayerS.co`): small, JSON, and never saved (a loaded world strips it). Only one at a time. */
export interface CoStatus {
    k: CoKind;
    b: number;              // the boss that laid it (it ends when that boss is gone); 0 = a developer's, which only runs out
    s: number;              // world time it began
    u: number;              // world time it ends by itself: a frozen farmer thaws, a curse fades, a chain falls away
    w?: string;             // tether: the farmer on the other end
    th?: number;            // frozen: seconds of thawing a friend has done so far
}

export const COOP_PATTERNS: Record<CoPattern, { status: CoKind }> = {
    freeze: { status: 'frozen' },
    hex: { status: 'hexed' },
    chain: { status: 'tether' },
};

interface CoInfo {
    name: string;
    color: number;
    icon: string;           // the chip in the status row (an item or glyph texture)
    /** The big warning for the farmer it lands on: a title and one line saying what to do ({E} is the USE key or button). */
    warn: string;
    how: string;
    /** What the chip's tooltip says. */
    tip: string;
}

export const CO_INFO: Record<CoKind, CoInfo> = {
    frozen: {
        name: 'Frozen', color: PAL.foam, icon: 'i_frostshard',
        warn: 'Frozen!', how: 'A friend can thaw you: they stand next to you and hold E',
        tip: `Frozen solid: you cannot move, swing or dash, and nothing can hurt you. A friend who stands next to you and holds E thaws you in ${TUNING.coop.thawSeconds} seconds; otherwise you thaw by yourself in ${TUNING.coop.frostSelf}.`,
    },
    hexed: {
        name: 'Hexed', color: PAL.plum, icon: 'i_ectoplasm',
        warn: 'Hexed!', how: 'Touch a friend to pass the curse on, and keep moving',
        tip: `A curse that hurts a little more every second and fades after ${TUNING.coop.hexSeconds} seconds. Stand next to a friend and it jumps to them.`,
    },
    tether: {
        name: 'Chained', color: PAL.gold, icon: 'k_lock',
        warn: 'Chained!', how: `Stay within ${TUNING.coop.chainTiles} tiles of your partner or the chain pulls and hurts you both`,
        tip: `Chained to a friend for ${TUNING.coop.chainSeconds} seconds. Further than ${TUNING.coop.chainTiles} tiles apart, the chain pulls and hurts you both.`,
    },
};

/** Damage of one curse tick, by how long the curse has been alive: it gets worse every few seconds. A lone carrier's stays gentle. */
export const hexTick = (age: number, alone: boolean) => alone ? TUNING.coop.hexAloneDmg : TUNING.coop.hexDmg * (1 + Math.floor(Math.max(0, age) / TUNING.coop.hexWorsen));

/** How long a chain is, in pixels. */
export const CHAIN_LEN = TUNING.coop.chainTiles * TILE;
