// The Request Board (data/board.ts): post, fill and cancel. The poster's reward coins are held in the request (escrow) until
// someone fills it or the poster takes the rest back; the items go straight to the poster's pockets.

import { ASK_MAX, BOARD_MAX, BOARD_REACH, parseAsk, rewardEach } from '../data/board';
import { ITEMS } from '../data/items';
import { PAL } from '../palette';
import type { Sim } from './sim';
import { addItem, countOf, takeItem } from './stats';
import type { BuildE, Cmd, PlayerS } from './types';

const board = (sim: Sim, id: number): BuildE | null => {
    const b = sim.s.ents[id];
    return b?.k === 'bld' && b.kind === 'board' ? b : null;
};

export function cmdBoard (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'board' }>) {
    const b = board(sim, c.id);
    if (!b || !sim.inReach(p, b, BOARD_REACH)) { sim.deny(p, 'Stand next to the board'); return; }
    const list = b.ask ??= [];
    const at = sim.center(b);
    if (c.op === 'post') {
        const ask = parseAsk(String(c.text ?? '').slice(0, 60));
        if (!ask) { sim.deny(p, 'The board could not read that: try "plank 50"'); return; }
        if (list.length >= BOARD_MAX) { sim.deny(p, 'The board is full'); return; }
        const pay = rewardEach(ask.item) * ask.n;
        if (p.coins < pay) { sim.deny(p, `Needs ${pay} coins up front for the reward`); return; }
        p.coins -= pay;
        const rid = list.reduce((m, r) => Math.max(m, r.rid), 0) + 1;
        list.push({ rid, by: p.id, who: p.name, it: ask.item, n: Math.min(ASK_MAX, ask.n), got: 0, ea: rewardEach(ask.item) });
        sim.float(at.x, at.y - 14, `Asked for ${ask.n} ${ITEMS[ask.item].name}`, PAL.gold, p.id);
    } else if (c.op === 'fill') {
        const r = list.find((q) => q.rid === c.rid);
        if (!r) return;
        if (r.by === p.id) { sim.deny(p, 'Your own request: others fill it'); return; }
        const asker = sim.s.players[r.by];
        const n = Math.min(r.n - r.got, countOf(p, r.it), Math.max(1, Math.floor(Number(c.n) || 1e9)));
        if (n < 1) { sim.deny(p, `You have no ${ITEMS[r.it].name} to give`); return; }
        if (!asker) { list.splice(list.indexOf(r), 1); sim.touch(b); return; }
        const room = Math.max(0, 999 - countOf(asker, r.it));
        const give = Math.min(n, room);
        if (give < 1) { sim.deny(p, `${r.who} has no room for more`); return; }
        takeItem(p, r.it, give);
        addItem(asker, r.it, give);
        r.got += give;
        p.coins += give * r.ea;
        sim.float(at.x, at.y - 14, `+${give * r.ea} coins`, PAL.gold, p.id);
        if (asker.online) sim.toast(asker.id, `${p.name} brought you ${give} ${ITEMS[r.it].name}`, undefined, PAL.lime);
        if (r.got >= r.n) list.splice(list.indexOf(r), 1);
    } else if (c.op === 'cancel') {
        const r = list.find((q) => q.rid === c.rid);
        if (!r || r.by !== p.id) return;
        p.coins += (r.n - r.got) * r.ea;
        list.splice(list.indexOf(r), 1);
        sim.float(at.x, at.y - 14, 'Request taken down', PAL.pebble, p.id);
    } else return;
    sim.touch(b);
}
