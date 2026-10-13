// Trading between two farmers, the safe way. Both stand close; each lays out what they give (up to six kinds of things and some
// coins) and both SEE the other's offer live. Any change to either offer clears both Accepts and locks Accept for a moment, so
// nobody can swap the goods after the other has said yes. When both have accepted, the server checks that everything is still
// there and that both packs have room, then swaps in one step. Walking away, going down or logging off cancels it and nothing moves.
//
// The state is `PlayerS.trade` on both farmers (public, never saved), so each client draws both sides from it.

import { TILE } from '../config';
import { ITEMS, type ItemId } from '../data/items';
import { PAL } from '../palette';
import type { Sim } from './sim';
import { addItem, countOf, itemCap, takeItem } from './stats';
import type { Cmd, PlayerS } from './types';

export const TRADE_STACKS = 6;
export const TRADE_REACH = 8 * TILE;
const LEASH = 12 * TILE;
export const ACCEPT_LOCK = 1.5;

const partnerOf = (sim: Sim, p: PlayerS) => (p.trade ? sim.s.players[p.trade.w] : undefined);

function end (a: PlayerS, b?: PlayerS) { delete a.trade; if (b) delete b.trade; }

export function cmdTrade (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'trade' }>) {
    if (sim.s.paused || p.downed > 0) return;
    if (c.op === 'open') {
        const q = sim.s.players[c.who];
        if (!q || q.id === p.id || !q.online || q.downed > 0) return;
        if (p.trade || q.trade) { sim.deny(p, p.trade ? 'You are already trading' : `${q.name} is busy trading`); return; }
        if (Math.hypot(q.x - p.x, q.y - p.y) > TRADE_REACH) { sim.deny(p, `${q.name} is too far away`); return; }
        p.trade = { w: q.id, o: [], c: 0, ok: 0, lock: sim.s.time + ACCEPT_LOCK };
        q.trade = { w: p.id, o: [], c: 0, ok: 0, lock: sim.s.time + ACCEPT_LOCK };
        sim.banner(`${p.name} wants to trade`, 'Put things in the middle, then Accept', PAL.gold, q.id);
        return;
    }
    const q = partnerOf(sim, p);
    if (!p.trade || !q?.trade || q.trade.w !== p.id) { end(p); return; }
    if (c.op === 'cancel') { sim.banner('Trade cancelled', `${p.name} stepped out`, PAL.pebble, q.id); end(p, q); return; }
    const changed = () => { p.trade!.ok = 0; q.trade!.ok = 0; p.trade!.lock = q.trade!.lock = sim.s.time + ACCEPT_LOCK; };
    if (c.op === 'set') {
        if (!ITEMS[c.item]) return;
        const n = Math.max(0, Math.min(Math.floor(Number(c.n) || 0), countOf(p, c.item)));
        const o = p.trade.o, at = o.findIndex(([i]) => i === c.item);
        if (at >= 0 && o[at][1] === n) return;
        if (at < 0 && n <= 0) return;
        if (at < 0 && o.length >= TRADE_STACKS) { sim.deny(p, 'That is a lot: six kinds at a time'); return; }
        if (n <= 0) o.splice(at, 1); else if (at >= 0) o[at][1] = n; else o.push([c.item, n]);
        changed();
        return;
    }
    if (c.op === 'coins') {
        const n = Math.max(0, Math.min(Math.floor(Number(c.n) || 0), Math.floor(p.coins)));
        if (n === p.trade.c) return;
        p.trade.c = n;
        changed();
        return;
    }
    if (c.op === 'ok') {
        if (p.trade.ok) { p.trade.ok = 0; return; }
        if (sim.s.time < p.trade.lock) { sim.deny(p, 'Take a moment to look at the offer'); return; }
        if (!p.trade.o.length && !q.trade.o.length && !p.trade.c && !q.trade.c) { sim.deny(p, 'Nothing is offered'); return; }
        p.trade.ok = 1;
        if (q.trade.ok) complete(sim, p, q);
    }
}

/** Can `to` take everything `from` offers, given what `to` itself gives away? */
function fits (from: PlayerS, to: PlayerS): string {
    for (const [item, n] of from.trade!.o) {
        if (countOf(from, item) < n) return `${from.name} no longer has that`;
        const give = to.trade!.o.find(([i]) => i === item)?.[1] ?? 0;
        if (countOf(to, item) - give + n > itemCap(to, item)) return `${to.name} cannot carry that many ${ITEMS[item].name}`;
    }
    if (from.coins < from.trade!.c) return `${from.name} no longer has the coins`;
    return '';
}

function complete (sim: Sim, a: PlayerS, b: PlayerS) {
    const why = fits(a, b) || fits(b, a);
    if (why) {
        a.trade!.ok = 0; b.trade!.ok = 0;
        sim.deny(a, why); sim.deny(b, why);
        return;
    }
    const ta = a.trade!, tb = b.trade!;
    for (const [i, n] of ta.o) takeItem(a, i, n);
    for (const [i, n] of tb.o) takeItem(b, i, n);
    for (const [i, n] of ta.o) addItem(b, i, n);
    for (const [i, n] of tb.o) addItem(a, i, n);
    a.coins += tb.c - ta.c; b.coins += ta.c - tb.c;
    logTrade(sim, a, b, ta, tb);
    sim.fx('collect', a.x, a.y - 6, a.id); sim.fx('collect', b.x, b.y - 6, b.id);
    sim.float(a.x, a.y - 30, `Traded with ${b.name}`, PAL.lime, a.id, 'aff');
    sim.float(b.x, b.y - 30, `Traded with ${a.name}`, PAL.lime, b.id, 'aff');
    end(a, b);
}

/** What one side offered, in words: "10 Wood, 20 coins" (or "nothing"). */
export const offerText = (t: { o: [ItemId, number][]; c: number }) => [...t.o.map(([i, n]) => `${n} ${ITEMS[i].name}`), ...(t.c ? [`${t.c} coins`] : [])].join(', ') || 'nothing';

function logTrade (sim: Sim, a: PlayerS, b: PlayerS, ta: NonNullable<PlayerS['trade']>, tb: NonNullable<PlayerS['trade']>) {
    const note = (p: PlayerS, who: PlayerS, gave: typeof ta, got: typeof ta) => {
        p.tlog = [{ d: sim.s.day, w: who.name, gave: offerText(gave), got: offerText(got) }, ...(p.tlog ?? [])].slice(0, 5);
    };
    note(a, b, ta, tb);
    note(b, a, tb, ta);
}

/** Every step: a trade whose other side left, went down, or wandered off is called off (nothing has moved). */
export function step (sim: Sim) {
    for (const p of Object.values(sim.s.players)) {
        if (!p.trade) continue;
        const q = partnerOf(sim, p);
        if (!p.online || p.downed > 0 || !q || !q.online || q.downed > 0 || q.trade?.w !== p.id || Math.hypot(q.x - p.x, q.y - p.y) > LEASH) {
            if (q?.trade?.w === p.id) { if (q.online) sim.banner('Trade cancelled', undefined, PAL.pebble, q.id); delete q.trade; }
            delete p.trade;
        }
    }
}
