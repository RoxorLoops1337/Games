// Seasons: a year is four weeks; each changes how fast crops grow, how much they give, how
// often it rains and how long the night lasts, and announces itself on its first morning.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { CROPS } from '../src/shared/data/buildings';
import { SEASON_DAYS, SEASON_ORDER, SEASONS, seasonDay, seasonOf, yearOf } from '../src/shared/season';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE, SimEvent } from '../src/shared/sim/types';
import { weatherAt } from '../src/shared/weather';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s; t += STEP) sim.step(STEP); };

test('a year is four weeks: spring, summer, autumn, winter, then spring again', () => {
    assert.equal(seasonOf(1), 'spring');
    assert.equal(seasonOf(SEASON_DAYS), 'spring');
    assert.equal(seasonOf(SEASON_DAYS + 1), 'summer');
    assert.equal(seasonOf(SEASON_DAYS * 2 + 1), 'autumn');
    assert.equal(seasonOf(SEASON_DAYS * 3 + 1), 'winter');
    assert.equal(seasonOf(SEASON_DAYS * 4 + 1), 'spring');
    assert.equal(seasonDay(1), 1); assert.equal(seasonDay(7), 7); assert.equal(seasonDay(8), 1);
    assert.equal(yearOf(28), 1); assert.equal(yearOf(29), 2);
    for (const id of SEASON_ORDER) {
        const s = SEASONS[id];
        assert.ok(s.grow > 0 && s.rain > 0 && s.night > 0.5 && s.night < 2 && s.yield >= 0 && s.yield < 1, id);
    }
});

test('winter slows crops, spring speeds them, and autumn gives more', () => {
    const stages = (day: number) => {
        const sim = Sim.create('SEA-1', 's');
        const p = sim.join('a', 'A')!;
        sim.s.day = day;
        for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
        const o = sim.world.plotOrigin(sim.homePlot(p.slot));
        const bed = sim.add<BuildE>({ k: 'bld', kind: 'bed', tx: o.tx + 5, ty: o.ty + 5, rot: 0, crop: 0, plant: 'seed_wheat', growT: 0, by: 'a' });
        sim.s.clock = 0;
        // a day's worth, but keep time still so the season does not change under us
        const secs = CROPS.seed_wheat!.stageSecs * 1.6;
        for (let t = 0; t < secs; t += STEP) { sim.s.clock = 10; sim.s.night = false; sim.step(STEP); }
        return { stage: bed.crop!, growT: bed.growT ?? 0 };
    };
    const spring = stages(2), winter = stages(SEASON_DAYS * 3 + 2);
    const progress = (x: { stage: number; growT: number }) => x.stage + x.growT / CROPS.seed_wheat!.stageSecs;
    assert.ok(progress(spring) > progress(winter) * 2, `spring ${progress(spring).toFixed(2)} vs winter ${progress(winter).toFixed(2)}`);
    // autumn harvests give extra, on average
    const harvest = (day: number) => {
        let total = 0;
        for (let i = 0; i < 40; i++) {
            const sim = Sim.create('SEA-h' + i, 's');
            sim.cheats = true;
            const p = sim.join('a', 'A')!;
            sim.s.day = day;
            for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
            const o = sim.world.plotOrigin(sim.homePlot(p.slot));
            p.x = (o.tx + 6) * TILE; p.y = (o.ty + 8) * TILE;
            const bed = sim.add<BuildE>({ k: 'bld', kind: 'bed', tx: o.tx + 5, ty: o.ty + 6, rot: 0, crop: 2, plant: 'seed_wheat', growT: 0, by: 'a' });
            sim.command('a', { t: 'swing', id: bed.id });
            total += Object.values(sim.s.ents).filter((e) => e.k === 'drop' && e.res === 'wheat').length;
        }
        return total / 40;
    };
    assert.ok(harvest(SEASON_DAYS * 2 + 2) > harvest(2) + 0.2, 'autumn gives more');
});

test('it rains more in spring than in summer, and winter nights are longer', () => {
    const rainyDays = (season: number) => {
        let n = 0;
        for (let year = 0; year < 40; year++) for (let d = 1; d <= SEASON_DAYS; d++) {
            const day = year * SEASON_DAYS * 4 + season * SEASON_DAYS + d;
            if (weatherAt('rain-seed', day, 60).rain > 0.05 || weatherAt('rain-seed', day, 120).rain > 0.05 || weatherAt('rain-seed', day, 30).rain > 0.05) n++;
        }
        return n;
    };
    assert.ok(rainyDays(0) > rainyDays(1), `spring ${rainyDays(0)} vs summer ${rainyDays(1)}`);
    const nightLen = (day: number) => {
        const sim = Sim.create('SEA-n', 's');
        sim.join('a', 'A');
        sim.s.day = day; sim.s.clock = 5; sim.s.night = false;
        sim.step(STEP);
        return sim.s.nightLen;
    };
    assert.ok(nightLen(SEASON_DAYS * 3 + 2) > nightLen(2) * 1.2, 'winter nights are long');
    assert.ok(nightLen(SEASON_DAYS + 2) < nightLen(2), 'summer nights are short');
    assert.ok(Math.abs(nightLen(2) - TUNING.nightLength) < 1);
});

test('the first morning of a season announces it, but ordinary mornings do not', () => {
    const sim = Sim.create('SEA-b', 's');
    sim.join('a', 'A');
    const banners = () => { const t = sim.events.filter((e): e is Extract<SimEvent, { e: 'banner' }> => e.e === 'banner').map((e) => e.text); sim.events = []; return t; };
    sim.s.day = SEASON_DAYS; sim.s.night = true; sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.05;
    sim.events = [];
    run(sim, 0.3);
    assert.equal(sim.s.day, SEASON_DAYS + 1);
    assert.ok(banners().some((t) => t === 'Summer has come'), 'summer arrives with a banner');
    sim.s.day = 2; sim.s.night = true; sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.05;
    sim.events = [];
    run(sim, 0.3);
    assert.ok(!banners().some((t) => /has come/.test(t)), 'an ordinary dawn has none');
});
