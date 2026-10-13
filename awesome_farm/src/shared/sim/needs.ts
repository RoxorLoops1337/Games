// "What needs me": a farm that has grown past what one screen shows. Reads the buildings and the same status rules the badges use
// (sim/status.ts) and boils them down to a short list: ripe crops, machines out of fuel or power, full outputs, chests nearly full,
// each with how many and where the nearest one is. Pure: the client's Needs window and the tests both call it.

import { BUILDINGS } from '../data/buildings';
import { TILE } from '../config';
import { statusOf, type StatusEnv, type StatusState } from './status';
import type { BuildE } from './types';
import { invSum } from './machines';
import { storageOf } from './uber';

export interface Need {
    id: string;
    /** An item or `k_` icon key to draw. */
    icon: string;
    text: string;
    hint: string;
    count: number;
    /** The nearest one: its tile centre in pixels, and how far it is from the asker. */
    x: number; y: number; dist: number;
    /** 0 is most urgent. */
    rank: number;
}

const PROBLEMS: Partial<Record<StatusState, { text: string; hint: string; rank: number; icon: string }>> = {
    nofuel: { text: 'machines out of fuel', hint: 'Put coal, wood or peat in.', rank: 1, icon: 'i_coal' },
    nopower: { text: 'machines without power', hint: 'Connect a pole to a generator.', rank: 1, icon: 'k_bolt' },
    full: { text: 'machines with a full output', hint: 'Collect what it made, or put a chest in front.', rank: 2, icon: 'chest' },
    noore: { text: 'drills with no ore under them', hint: 'Move them onto a vein.', rank: 3, icon: 'i_iron' },
    noout: { text: 'machines with nowhere to put things', hint: 'Give it a chest or a belt.', rank: 3, icon: 'chest' },
};

/** What needs attention, most urgent first (then nearest). `from` is the asker's position in pixels. */
export function needsOf (blds: readonly BuildE[], env: StatusEnv, from: { x: number; y: number }): Need[] {
    type Acc = { n: number; best: BuildE | null; d: number };
    const acc = new Map<string, Acc & { meta: Omit<Need, 'count' | 'x' | 'y' | 'dist' | 'id'> }>();
    const add = (key: string, meta: Omit<Need, 'count' | 'x' | 'y' | 'dist' | 'id'>, b: BuildE) => {
        const d = Math.hypot((b.tx + 0.5) * TILE - from.x, (b.ty + 0.5) * TILE - from.y);
        const a = acc.get(key) ?? { n: 0, best: null, d: Infinity, meta };
        a.n++;
        if (d < a.d) { a.d = d; a.best = b; }
        acc.set(key, a);
    };
    for (const b of blds) {
        const def = BUILDINGS[b.kind];
        if (b.kind === 'bed') {
            if (b.crop === 2) add('ripe', { icon: 'i_wheat', text: 'crops are ripe', hint: 'Press E on a ripe bed to harvest.', rank: 0 }, b);
            continue;
        }
        if (def.storage && !def.pets && !def.grave) {
            const cap = storageOf(b);
            if (cap > 0 && invSum(b.inv ?? {}) >= cap * 0.95) add('chestfull', { icon: 'chest', text: 'chests are nearly full', hint: 'Empty them, or build another chest.', rank: 2 }, b);
            continue;
        }
        if (!def.proc && b.kind !== 'drill') continue;
        const st = statusOf(b, env), p = PROBLEMS[st.state];
        if (p) add(`st:${st.state}`, { icon: p.icon, text: b.kind === 'drill' ? p.text.replace('machines', 'drills') : p.text, hint: p.hint, rank: p.rank }, b);
    }
    const out: Need[] = [];
    for (const [id, a] of acc) {
        if (!a.best) continue;
        out.push({ id, icon: a.meta.icon, text: a.meta.text, hint: a.meta.hint, rank: a.meta.rank, count: a.n, x: (a.best.tx + 0.5) * TILE, y: (a.best.ty + 0.5) * TILE, dist: a.d });
    }
    return out.sort((p, q) => p.rank - q.rank || p.dist - q.dist);
}

/** "12 tiles NE" for a distance and the offset to the thing. */
export function whereText (dx: number, dy: number): string {
    const tiles = Math.round(Math.hypot(dx, dy) / TILE);
    if (tiles < 3) return 'right here';
    const dir = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
    return `${tiles} tiles ${dir}`;
}

/** "2 crops are ripe" / "1 chest is nearly full": the row's heading with the right number agreement. */
export function needLine (n: Pick<Need, 'count' | 'text'>): string {
    const t = n.count === 1 ? n.text.replace('crops are', 'crop is').replace('chests are', 'chest is').replace('machines', 'machine').replace('drills', 'drill') : n.text;
    return `${n.count}  ${t}`;
}
