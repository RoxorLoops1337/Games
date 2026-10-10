// Wire format between a client and a SimHost (in-browser for solo, or the dedicated
// server). JSON text frames over a WebSocket.

import type { Cmd, Ent, PlayerS, Plot, Shop, SimEvent, WorldState } from '../sim/types';

export const PROTOCOL = 28;

export type ClientMsg =
    /** `acct`: sign in as a named farmer with a secret word, from any device (the server remembers it, as a hash). */
    | { t: 'hello'; v: number; id: string; name: string; password?: string; acct?: { name: string; key: string } }
    | { t: 'cmd'; c: Cmd }
    | { t: 'ping' };

/** What other players see of you (your own message carries everything). */
export type PlayerView = Pick<PlayerS,
    'id' | 'name' | 'color' | 'slot' | 'online' | 'x' | 'y' | 'fx' | 'fy' | 'moving' | 'warp'
    | 'hearts' | 'downed' | 'revive' | 'level' | 'equip'> & { mh: number } & Partial<PlayerS>;   // (+ `line`, the bobber others can see)

/**
 * A player's record inside a tick: only what changed since this client was last told, so a
 * farmer standing still costs nothing. `rm` lists keys that have gone away (a dismissed companion…).
 */
export type PlayerDelta = Partial<PlayerView> & { id: string; rm?: string[] };

/** Fold a delta into what the client already knows about that player. */
export function applyPlayerDelta (old: PlayerView | undefined, d: PlayerDelta): PlayerView {
    const { rm, ...rest } = d;
    const p = { ...(old ?? {}), ...rest } as PlayerView & Record<string, unknown>;
    if (rm) for (const k of rm) delete p[k];
    return p;
}

export interface TickMsg {
    t: 'tick';
    time: number;
    clock: number;
    day: number;
    night: boolean;
    nightLen: number;
    paused: boolean;
    ents: Ent[];          // spawned or changed since the last tick
    gone: number[];       // removed since the last tick
    plots: Plot[];        // changed plots
    dug?: number[];       // tiles of rock dug out of the caves since the last tick (world tile indexes)
    prod?: Record<string, number>;   // what the farm's machines have made (sent about once a second)
    shop?: Shop;                     // the trader's stock (same cadence)
    players: PlayerDelta[];
    ev: SimEvent[];
}

export type ServerMsg =
    /** `state.players`: your own record in full; everyone else as their `PlayerView` (typed as the world's table so a client keeps one). The account table is never in it. */
    | { t: 'welcome'; v: number; you: string; state: WorldState; server: string }
    | TickMsg
    | { t: 'refused'; reason: string }
    | { t: 'pong' };
