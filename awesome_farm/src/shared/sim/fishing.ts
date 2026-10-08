// Fishing. Cast at open water (Q), wait for the bite, pull in the window it gives you; bigger
// fish then fight back in tugs you must answer, each in its own short window. Slips, a late
// pull or walking away lose the fish, never anything else. The roll (what bites) is made at
// the cast from the place, time, weather, rod, bait and your fishing luck.

import { TILE } from '../config';
import { bestRod, CAST_RANGE, FISH_BY_ID, MAX_STRIKES, rollCatch, RODS, TUG_WINDOW } from '../data/fish';
import { PAL } from '../palette';
import { weatherAt } from '../weather';
import * as fortune from './fortune';
import * as quests from './quests';
import type { Sim } from './sim';
import { countOf, derived, takeItem } from './stats';
import type { Cmd, FishState, PlayerS } from './types';

const MOVE_LIMIT = 46;        // px you may drift from where you cast

export function cmd (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'fish' }>) {
    if (c.op === 'cast') cast(sim, p, c.x, c.y);
    else if (c.op === 'reel') reel(sim, p);
    else if (c.op === 'cancel') { if (p.fishing) { sim.float(p.x, p.y - 22, 'Reeled in', PAL.cream, p.id); stop(p); } }
}

export const hasRod = (p: PlayerS) => !!bestRod((id) => countOf(p, id) > 0);

function cast (sim: Sim, p: PlayerS, x: number, y: number) {
    if (p.fishing) { reel(sim, p); return; }
    if (p.rift) { sim.deny(p, 'Not while you are on an expedition'); return; }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const rod = bestRod((id) => countOf(p, id) > 0);
    if (!rod) { sim.deny(p, 'You need a fishing rod (Workbench)'); return; }
    const dist = Math.hypot(x - p.x, y - (p.y - 4));
    if (dist < CAST_RANGE[0] - 8 || dist > CAST_RANGE[1] + 12) { sim.deny(p, dist < CAST_RANGE[0] ? 'Too close: cast further out' : 'Too far'); return; }
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!sim.world.inBounds(tx, ty) || sim.world.isLand(tx, ty) || sim.world.riftAtTile(tx, ty) >= 0) { sim.deny(p, 'Cast it into open water'); return; }
    const d = derived(p);
    const bait = takeItem(p, 'bait', 1);
    const plot = sim.world.plotAtPx(p.x, p.y) ?? sim.world.plotAtPx(x, y);
    const w = weatherAt(sim.s.seed, sim.s.day, sim.s.clock);
    const roll = rollCatch(sim.rng, { biome: plot?.biome ?? 'meadow', night: sim.s.night, rain: w.rain > 0.25, rod, bait, luck: d.mods.fishLuck ?? 0 });
    const wait = (rod.wait[0] + sim.rng.next() * (rod.wait[1] - rod.wait[0])) / (1 + (d.mods.fishSpeed ?? 0)) * (bait ? 0.6 : 1);
    p.fishing = {
        x: Math.round(x), y: Math.round(y), ox: p.x, oy: p.y, ph: 0, t: wait, rod: rod.tier, ...(bait ? { bait: 1 as const } : {}),
        item: roll.item, size: roll.size, round: 0, rounds: FISH_BY_ID[roll.item]?.fight ?? 0, strikes: 0,
    };
    p.line = { x: p.fishing.x, y: p.fishing.y, ph: 0 };
    sim.fx('cast', x, y, p.id);
}

function reel (sim: Sim, p: PlayerS) {
    const f = p.fishing;
    if (!f) return;
    const rod = RODS[f.rod];
    switch (f.ph) {
        case 0:
            sim.float(f.x, f.y - 12, 'Too early', PAL.cream, p.id);
            stop(p);
            return;
        case 1:
            if (f.rounds === 0) { land(sim, p, f); return; }
            f.ph = 2; f.t = rest(sim, rod.rest);
            sim.float(f.x, f.y - 14, 'Hooked!', PAL.gold, p.id);
            sim.fx('bite', f.x, f.y, p.id);
            break;
        case 2: strike(sim, p, f, 'Too eager!'); break;
        case 3:
            f.round++;
            if (f.round >= f.rounds) { land(sim, p, f); return; }
            f.ph = 2; f.t = rest(sim, rod.rest);
            sim.float(f.x, f.y - 14, 'Hold on…', PAL.foam, p.id);
            break;
    }
    sync(p);
}

const rest = (sim: Sim, r: [number, number]) => r[0] + sim.rng.next() * (r[1] - r[0]);

function strike (sim: Sim, p: PlayerS, f: FishState, why: string) {
    f.strikes++;
    if (f.strikes >= MAX_STRIKES) { lose(sim, p, f); return; }
    f.ph = 2; f.t = rest(sim, RODS[f.rod].rest) + 0.4;
    sim.float(f.x, f.y - 14, why, PAL.berry, p.id);
}

function lose (sim: Sim, p: PlayerS, f: FishState, msg = 'It got away…') {
    sim.fx('fishLost', f.x, f.y, p.id);
    sim.float(f.x, f.y - 14, msg, PAL.berry, p.id);
    stop(p);
}

function land (sim: Sim, p: PlayerS, f: FishState) {
    const def = FISH_BY_ID[f.item];
    const d = derived(p);
    const junk = !def;
    const weed = f.item === 'fiber';
    let n = weed ? 2 + (sim.rng.chance(0.5) ? 1 : 0) : 1;
    let double = false;
    if (def && sim.rng.chance(Math.min(0.5, d.luck))) { n++; double = true; }
    sim.give(p, f.item, n);
    fortune.fishingBottle(sim, p, f.x, f.y);
    let isNew = false, best = false;
    if (def) {
        const log = (p.fishlog ??= {});
        const e = (log[f.item] ??= { n: 0, best: 0 });
        isNew = e.n === 0;
        e.n += n;
        if ((f.size ?? 0) > e.best) { best = !isNew && e.best > 0; e.best = f.size ?? 0; }
        quests.count(p, `fish:${f.item}`, n);
        sim.gainXp(p, 4 + def.rarity * 8 + Math.round((f.size ?? 0) / 20));
    } else if (f.item === 'pearl') { quests.count(p, 'pearl'); sim.gainXp(p, 20); }
    sim.fx('fishCatch', f.x, f.y, p.id);
    sim.events.push({ e: 'catch', to: p.id, item: f.item, size: f.size, isNew, best, ...(junk ? { junk: true } : {}), ...(double ? { double: true } : {}) });
    stop(p);
}

export function stop (p: PlayerS) {
    p.fishing = undefined;
    p.line = undefined;
}

const sync = (p: PlayerS) => { if (p.fishing) p.line = { x: p.fishing.x, y: p.fishing.y, ph: p.fishing.ph }; };

export function update (sim: Sim, dt: number) {
    for (const p of sim.online) {
        const f = p.fishing;
        if (!f) continue;
        if (p.downed > 0 || p.rift || Math.hypot(p.x - f.ox, p.y - f.oy) > MOVE_LIMIT) { sim.float(f.x, f.y - 12, 'The line went slack', PAL.cream, p.id); stop(p); continue; }
        f.t -= dt;
        if (f.t > 0) continue;
        const rod = RODS[f.rod];
        if (f.ph === 0) { f.ph = 1; f.t = rod.window; sim.fx('bite', f.x, f.y, p.id); sim.float(f.x, f.y - 16, '!', PAL.gold, p.id); }
        else if (f.ph === 1) { lose(sim, p, f); continue; }
        else if (f.ph === 2) { f.ph = 3; f.t = TUG_WINDOW + 0.12 * f.rod; sim.fx('bite', f.x, f.y, p.id); sim.float(f.x, f.y - 16, '!', PAL.foam, p.id); }
        else strike(sim, p, f, 'It slipped!');
        if (p.fishing) sync(p);
    }
}
