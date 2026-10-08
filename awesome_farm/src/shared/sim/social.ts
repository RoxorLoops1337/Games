// Talking, emoting and pointing: each goes out as an event to everyone, with a small rate limit per farmer.

import type { Sim } from './sim';
import type { PlayerS } from './types';

// ── talking, emoting, pointing ──
/** When each farmer last said, emoted or pinged (world time), by farmer:kind. Runtime only: a rate limit outlives no session. */
const lastAt = new WeakMap<Sim, Record<string, number>>();

/** May this farmer do this again yet? (`gap` seconds since the last time.) */
function social (sim: Sim, p: PlayerS, kind: string, gap: number) {
    let t = lastAt.get(sim);
    if (!t) { t = {}; lastAt.set(sim, t); }
    const key = `${p.id}:${kind}`;
    if ((t[key] ?? -9) + gap > sim.s.time) return false;
    t[key] = sim.s.time;
    return true;
}

export function cmdChat (sim: Sim, p: PlayerS, raw: string) {
    const text = String(raw ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 100);
    if (!text || !social(sim, p, 'chat', 0.8)) return;
    sim.events.push({ e: 'chat', by: p.id, name: p.name, text, color: p.color });
}

export function cmdEmote (sim: Sim, p: PlayerS, id: number) {
    if (!Number.isInteger(id) || id < 0 || id > 7 || !social(sim, p, 'emote', 0.8)) return;
    sim.events.push({ e: 'emote', by: p.id, id, x: p.x, y: p.y });
}

export function cmdPing (sim: Sim, p: PlayerS, x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !social(sim, p, 'ping', 1.5)) return;
    sim.events.push({ e: 'ping', by: p.id, name: p.name, x, y, color: p.color });
}
