// The Museum of odd things (data/museum.ts): press E and it takes one of each wanted kind you carry that it does not have yet.

import { MUSEUM_ITEMS, MUSEUM_PRIZES, MUSEUM_SET } from '../data/museum';
import { ITEMS } from '../data/items';
import { PAL } from '../palette';
import type { Sim } from './sim';
import { countOf, takeItem } from './stats';
import type { BuildE, PlayerS } from './types';

export const donated = (p: Pick<PlayerS, 'museum'>) => p.museum?.length ?? 0;

export function use (sim: Sim, p: PlayerS, b: BuildE) {
    const c = sim.center(b);
    const have = new Set(p.museum ?? []);
    const before = have.size;
    const gave: string[] = [];
    for (const id of MUSEUM_ITEMS) {
        if (have.has(id) || countOf(p, id) < 1 || !takeItem(p, id, 1)) continue;
        have.add(id);
        gave.push(ITEMS[id].name);
        sim.fx('equip', c.x, c.y - 8, p.id);
    }
    p.museum = MUSEUM_ITEMS.filter((id) => have.has(id));
    if (!gave.length) {
        sim.float(c.x, c.y - 14, `Museum ${before}/${MUSEUM_ITEMS.length}: bring a new trophy, fish or gem`, PAL.cream, p.id);
        return;
    }
    sim.float(c.x, c.y - 14, `Donated ${gave.length}: ${gave.slice(0, 3).join(', ')}${gave.length > 3 ? '…' : ''}  (${p.museum.length}/${MUSEUM_ITEMS.length})`, PAL.gold, p.id);
    for (const prize of MUSEUM_PRIZES) {
        if (before >= prize.at || p.museum.length < prize.at) continue;
        sim.give(p, 'coin', prize.coin);
        if (prize.item) sim.give(p, prize.item[0], prize.item[1]);
        sim.banner('The museum thanks you', `${prize.at} kinds on the shelves: +${prize.coin} coins`, PAL.gold, p.id);
    }
}

export { MUSEUM_SET };
