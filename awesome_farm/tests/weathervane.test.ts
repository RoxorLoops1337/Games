// The weather vane: a three-day forecast read from the same hashes as the real weather, so it can never disagree with what
// happens; the words and hints it uses stay true to the rules; and the building opens its window without changing anything.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { GUIDE_BY_ID } from '../src/shared/data/guide';
import { HINTS } from '../src/shared/data/hints';
import { dayIcon, dayLabel, dayWords, eventTag, forecastHint, nightIcon, nightWords, seasonLabel, skyWords, vaneIcon } from '../src/shared/data/forecast';
import { SEASON_DAYS, seasonOf } from '../src/shared/season';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';
import { dayPart, forecast, foggyDay, NIGHT_EVENTS, nightEvent, rainPlan, weatherAt, type DayForecast } from '../src/shared/weather';

const SEEDS = ['vane-1', 'vane-2', 'W-17', 'Z'];
const DAYS = 160;
const TOTAL = TUNING.dayLength + TUNING.nightLength;

test('a forecast is today and the next three days, the same every time and different for different worlds', () => {
    const f = forecast('vane-1', 10);
    assert.equal(f.length, 4);
    assert.deepEqual(f.map((d) => d.day), [10, 11, 12, 13]);
    assert.deepEqual(f.map((d) => d.ahead), [0, 1, 2, 3]);
    assert.deepEqual(forecast('vane-1', 10), f, 'pure: nothing but the seed and the day goes in');
    assert.deepEqual(JSON.parse(JSON.stringify(f)), f, 'plain JSON');
    assert.equal(forecast('vane-1', 10, 7).length, 7, 'it can look further');
    // a window slid along by one day is the same days
    const sameDay = ({ ahead: _a, ...rest }: DayForecast) => rest;
    assert.deepEqual(forecast('vane-1', 11).slice(0, 3).map(sameDay), f.slice(1).map(sameDay));
    // different worlds get different weather
    const sig = (seed: string) => JSON.stringify(forecast(seed, 1, 120).map((d) => [!!d.rain, d.fog, d.night]));
    assert.notEqual(sig('vane-1'), sig('vane-2'));
});

test('the forecast agrees with the real weather and the real night, for every day, walking the whole clock', () => {
    let wet = 0, storms = 0, light = 0, foggy = 0, bloody = 0, meteors = 0, fairies = 0;
    for (const seed of SEEDS) {
        for (let day = 1; day <= DAYS; day++) {
            const f = forecast(seed, day, 1)[0];
            assert.equal(f.night, nightEvent(seed, day), `${seed} day ${day}: the night`);
            let maxRain = 0, stormSeen = false, maxFog = 0, firstRain = Infinity, lastRain = -Infinity;
            for (let clock = 0; clock <= TOTAL + 80; clock += 1) {
                const w = weatherAt(seed, day, clock);
                if (w.rain > 0) { firstRain = Math.min(firstRain, clock); lastRain = Math.max(lastRain, clock); }
                maxRain = Math.max(maxRain, w.rain); maxFog = Math.max(maxFog, w.fog); stormSeen ||= w.storm;
            }
            if (!f.rain) {
                assert.equal(maxRain, 0, `${seed} day ${day}: no rain is forecast and none falls`);
                assert.ok(!stormSeen);
            } else {
                wet++;
                const { start, len, part, storm } = f.rain;
                assert.ok(maxRain > 0, `${seed} day ${day}: rain is forecast and it falls`);
                assert.ok(firstRain >= Math.floor(start) && lastRain <= Math.ceil(start + len), `${seed} day ${day}: it falls inside the forecast window`);
                assert.equal(stormSeen, storm, `${seed} day ${day}: a storm is forecast exactly when there is one`);
                assert.ok(storm ? maxRain > 0.99 : maxRain > 0.55 && maxRain <= 0.6001, `${seed} day ${day}: heavy rain is full, light rain a drizzle (${maxRain})`);
                const mid = start + len / 2;
                assert.ok(weatherAt(seed, day, mid).rain > 0.5, `${seed} day ${day}: it is raining in the middle of the forecast window`);
                assert.equal(dayPart(mid), part, `${seed} day ${day}: the part of the day is where the middle falls`);
                if (storm) storms++; else light++;
            }
            assert.equal(f.fog, foggyDay(seed, day));
            if (!f.fog) assert.equal(maxFog, 0, `${seed} day ${day}: no fog is forecast and none comes`);
            else { foggy++; assert.ok(maxFog > 0.5, `${seed} day ${day}: fog comes`); }
            if (f.night === 'bloodmoon') bloody++; else if (f.night === 'meteors') meteors++; else if (f.night === 'fairies') fairies++;
            assert.equal(f.season, seasonOf(day));
        }
    }
    // the sample really covered every kind of day (so the loop above proved something)
    for (const [n, what] of [[wet, 'rain'], [storms, 'storms'], [light, 'light rain'], [foggy, 'fog'], [bloody, 'blood moons'], [meteors, 'meteors'], [fairies, 'fairies']] as const) assert.ok(n >= 5, `${n} days of ${what} in the sample`);
});

test('the first day and the turn of the seasons', () => {
    const first = forecast('vane-1', 1);
    assert.equal(first[0].rain, null, 'the first day is always dry');
    assert.equal(first[0].night, null);
    assert.equal(first[1].night, null, 'the first nights are quiet');
    assert.ok(first[0].seasonStart && first[0].season === 'spring' && first[0].seasonDay === 1);
    // the end of spring: day 7 is the last, day 8 is the first of summer
    const turn = forecast('vane-1', SEASON_DAYS - 1);
    assert.deepEqual(turn.map((d) => d.season), ['spring', 'spring', 'summer', 'summer']);
    assert.deepEqual(turn.map((d) => d.seasonDay), [6, 7, 1, 2]);
    assert.deepEqual(turn.map((d) => d.seasonStart), [false, false, true, false]);
    // winter into the next spring is a new year
    const year = forecast('vane-1', SEASON_DAYS * 4 - 1);
    assert.deepEqual(year.map((d) => d.season), ['winter', 'winter', 'spring', 'spring']);
    // a Blood Moon every seventh night from the seventh
    for (const seed of SEEDS) {
        const nights = forecast(seed, 1, 60).filter((d) => d.night === 'bloodmoon').map((d) => d.day);
        assert.deepEqual(nights, [7, 14, 21, 28, 35, 42, 49, 56], seed);
    }
    // a day nobody can predict from a number that is not a day does not crash it
    assert.equal(forecast('vane-1', 0).length, 4);
    assert.equal(forecast('vane-1', 1, 0).length, 0);
});

test('the real game follows the forecast: the night that falls is the night it said, and rain speeds the beds as the hint says', () => {
    const sim = Sim.create('vane-real', 'v');
    sim.join('a', 'A')!;
    const seed = sim.s.seed;
    // the sixth day says tomorrow night is a Blood Moon; walk the real clock to the night of the seventh
    sim.s.day = 6;
    assert.equal(forecast(seed, sim.s.day)[1].night, 'bloodmoon');
    sim.s.day = 7; sim.s.clock = TUNING.dayLength - 3;
    sim.events = [];
    for (let i = 0; i < 100; i++) sim.step(0.1);
    assert.equal(sim.s.night, true);
    assert.equal(sim.nightEv, 'bloodmoon', 'the night the forecast named');
    assert.ok(sim.events.some((e) => e.e === 'banner' && e.text === NIGHT_EVENTS.bloodmoon.name), 'and its banner');
    // rain: find a rainy day, put a growing bed in it and compare with the same day before the rain
    let day = 2;
    while (!rainPlan(seed, day) || rainPlan(seed, day)!.heavy === false) day++;
    const plan = rainPlan(seed, day)!;
    const growth = (clock: number) => {
        const w = Sim.create('vane-bed', 'v');
        w.join('a', 'A')!;
        w.s.seed = seed; w.s.day = day; w.s.clock = clock; w.s.night = false;
        const bed = w.add<BuildE>({ k: 'bld', kind: 'bed', tx: 3, ty: 3, rot: 0, by: 'a', crop: 0, plant: 'seed_wheat', growT: 0 });
        w.step(0.25);
        return bed.growT!;
    };
    const dry = growth(2), wet = growth(plan.start + plan.len / 2);
    assert.ok(Math.abs(wet / dry - (1 + TUNING.rainGrow)) < 0.02, `beds grow ${(wet / dry).toFixed(2)}x as fast in a storm: ${1 + TUNING.rainGrow}x is what the hint promises`);
    assert.equal(TUNING.rainGrow, 0.5);
});

test('the words: a row reads in plain language, and a Blood Moon day wears a tag', () => {
    const f = (over: Partial<DayForecast>): DayForecast => ({ day: 9, ahead: 1, season: 'summer', seasonDay: 2, seasonStart: false, rain: null, fog: false, night: null, study: false, ...over });
    assert.equal(dayLabel(f({ ahead: 0 })), 'Today');
    assert.equal(dayLabel(f({ ahead: 1 })), 'Tomorrow');
    assert.equal(dayLabel(f({ ahead: 3 })), 'In 3 days');
    assert.equal(seasonLabel(f({})), 'Summer, day 2');
    assert.equal(dayWords(f({ rain: { part: 'afternoon', storm: false, start: 120, len: 60 } })), 'Light rain in the afternoon, calm night');
    assert.equal(dayWords(f({ rain: { part: 'evening', storm: true, start: 220, len: 60 }, night: 'bloodmoon' })), 'A storm in the evening, Blood Moon night');
    assert.equal(dayWords(f({ fog: true })), 'Foggy morning, calm night');
    assert.equal(dayWords(f({ fog: true, rain: { part: 'night', storm: false, start: 310, len: 50 } })), 'Foggy morning, light rain after dark, calm night');
    assert.equal(dayWords(f({ night: 'fairies' })), 'Dry and clear, fairy night');
    assert.equal(skyWords(f({})), 'dry and clear');
    assert.equal(nightWords(f({ night: 'meteors' })), 'meteor shower at night');
    assert.equal(eventTag(f({})), null);
    assert.equal(eventTag(f({ night: 'bloodmoon' }))!.text, 'Blood Moon');
    assert.notEqual(eventTag(f({ night: 'bloodmoon' }))!.color, eventTag(f({ night: 'fairies' }))!.color, 'each kind of night has its own colour');
    // every row of a real forecast fits a line or two
    for (const seed of SEEDS) for (const d of forecast(seed, 1, 100)) assert.ok(dayWords(d).length <= 70, dayWords(d));
});

test('the picture over the building is the most noteworthy thing tomorrow brings (art.test.ts checks every icon is drawn)', () => {
    const keys = new Set<string>();
    for (const seed of SEEDS) for (const d of forecast(seed, 1, 100)) { keys.add(dayIcon(d)); keys.add(nightIcon(d)); keys.add(vaneIcon(d)); }
    for (const k of ['k_sun', 'k_rain', 'k_storm', 'k_fog', 'k_moon', 'k_blood', 'k_meteor', 'k_fairy']) assert.ok(keys.has(k), `${k} gets used`);
    const f = (over: Partial<DayForecast>): DayForecast => ({ day: 9, ahead: 1, season: 'summer', seasonDay: 2, seasonStart: false, rain: null, fog: false, night: null, study: false, ...over });
    assert.equal(vaneIcon(f({})), 'k_sun');
    assert.equal(vaneIcon(f({ rain: { part: 'morning', storm: false, start: 20, len: 50 } })), 'k_rain');
    assert.equal(vaneIcon(f({ rain: { part: 'morning', storm: true, start: 20, len: 50 } })), 'k_storm');
    assert.equal(vaneIcon(f({ fog: true })), 'k_fog');
    assert.equal(vaneIcon(f({ night: 'bloodmoon', rain: { part: 'morning', storm: true, start: 20, len: 50 } })), 'k_blood', 'a Blood Moon is what you most need to know');
});

test('the hint says the most useful true thing, and every claim in it is in the rules', () => {
    const f = (ahead: number, over: Partial<DayForecast> = {}): DayForecast => ({ day: 9 + ahead, ahead, season: 'summer', seasonDay: 2 + ahead, seasonStart: false, rain: null, fog: false, night: null, study: false, ...over });
    const rain = { part: 'afternoon' as const, storm: false, start: 120, len: 60 };
    const calm = [f(0), f(1), f(2), f(3)];
    assert.equal(forecastHint(calm), 'Calm days ahead: a good time to build.');
    // rain: the rules say beds grow faster in it, and koi bite in it
    const rainy = forecastHint([f(0), f(1, { rain }), f(2), f(3)]);
    assert.match(rainy, /^Rain tomorrow: crops grow up to 50% faster while it falls/);
    assert.ok(rainy.includes(`${Math.round(TUNING.rainGrow * 100)}%`));
    assert.ok(!/water/i.test(rainy), 'rain does not water the beds in this game (they never need it): it only speeds them up');
    // a Blood Moon beats rain; it says when, and what to do
    const blood = forecastHint([f(0, { rain }), f(1), f(2, { night: 'bloodmoon' }), f(3)]);
    assert.match(blood, /^Blood Moon in 2 days: stock up on potions and food/);
    assert.ok(NIGHT_EVENTS.bloodmoon.sub.includes('twice the spoils'), 'the double coins are the rules');
    assert.match(forecastHint([f(0, { night: 'bloodmoon' }), f(1), f(2), f(3)]), /^Blood Moon tonight/);
    assert.match(forecastHint([f(0), f(1, { night: 'bloodmoon' }), f(2), f(3)]), /^Blood Moon tomorrow night/);
    // today's rain only counts while it is still to come
    const today = [f(0, { rain }), f(1), f(2), f(3)];
    assert.match(forecastHint(today, 10), /^Rain today/);
    assert.equal(forecastHint(today, 250), 'Calm days ahead: a good time to build.', 'rain that has already fallen is not news');
    // a new season, the other nights and fog
    assert.match(forecastHint([f(0), f(1), f(2, { season: 'winter', seasonDay: 1, seasonStart: true }), f(3)]), /^Winter begins in 2 days\. Crops barely grow/);
    assert.match(forecastHint([f(0), f(1, { night: 'meteors' }), f(2), f(3)]), /^Meteor Shower tomorrow night\. Stars are falling/);
    assert.match(forecastHint([f(0, { night: 'fairies' }), f(1), f(2), f(3)]), /^Fairy Night tonight\. Everyone is healed/);
    assert.match(forecastHint([f(0), f(1, { fog: true }), f(2), f(3)]), /^Fog tomorrow/);
    for (const seed of SEEDS) for (let day = 1; day < 80; day++) { const h = forecastHint(forecast(seed, day), 100); assert.ok(h.length >= 20 && h.length <= 150, `${h.length}: ${h}`); }
});

test('the weather vane is cheap decor, and pressing E opens its window without changing anything', () => {
    const d = BUILDINGS.weathervane;
    assert.equal(d.cat, 'decor');
    assert.deepEqual(d.size, [1, 1]);
    assert.deepEqual(d.cost, { plank: 3, ironbar: 1 });
    assert.equal(d.req, undefined, 'no skill needed');
    const sim = Sim.create('vane-use', 'v');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE;
    sim.give(p, 'plank', 3); sim.give(p, 'ironbar', 1);
    sim.command('a', { t: 'build', kind: 'weathervane', tx: o.tx + 7, ty: o.ty + 6 });
    const vane = sim.buildings('weathervane')[0];
    assert.ok(vane, 'built');
    assert.equal(p.cnt?.['build:weathervane'], 1, 'the build is counted (the first-time hint reads it)');
    sim.events = [];
    const before = JSON.stringify(sim.s);
    sim.command('a', { t: 'use', id: vane.id });
    assert.deepEqual(sim.events.filter((e) => e.e === 'open'), [{ e: 'open', to: 'a', ui: 'vane', id: vane.id }], 'the window opens for the farmer who pressed E, and only for them');
    assert.equal(JSON.stringify(sim.s), before, 'nothing in the world changed');
    // too far away: nothing happens
    p.x = (o.tx + 40) * TILE;
    sim.events = [];
    sim.command('a', { t: 'use', id: vane.id });
    assert.equal(sim.events.filter((e) => e.e === 'open').length, 0);
});

test('the first-time hints: one when the vane is built, one when rain is coming (and no vane yet to say so)', () => {
    const sim = Sim.create('vane-hint', 'v');
    const p = sim.join('a', 'A')!;
    const vane = HINTS.find((h) => h.id === 'vane')!, rain = HINTS.find((h) => h.id === 'rain')!;
    assert.ok(vane && rain);
    const ctx = (over: { rain?: 0 | 1 | null } = {}) => ({ me: p, prompt: '', ...over });
    assert.ok(!vane.when(ctx()) && !rain.when(ctx({ rain: 1 })), 'nothing before there is a bed or a vane');
    p.cnt = { 'build:bed': 1 };
    assert.ok(!rain.when(ctx()) && !rain.when(ctx({ rain: null })), 'no rain in sight, nothing to say');
    assert.ok(rain.when(ctx({ rain: 1 })) && rain.when(ctx({ rain: 0 })), 'with a garden and rain coming');
    assert.match(rain.text(ctx({ rain: 1 }), { fish: 'Q' }), /^Rain is coming tomorrow: crops grow up to 50% faster while it falls/);
    assert.match(rain.text(ctx({ rain: 0 }), { fish: 'Q' }), /^Rain is coming later today/);
    assert.match(rain.text(ctx({ rain: 1 }), { fish: 'Q' }), /Weather Vane \(Build, Decor\)/, 'it says where the vane is');
    p.cnt['build:weathervane'] = 1;
    assert.ok(vane.when(ctx()), 'a vane is built: the hint about reading it');
    assert.ok(!rain.when(ctx({ rain: 1 })), 'and the rain hint steps aside: the vane says it better');
    assert.match(vane.text(ctx(), { fish: 'Q' }), /press E on it/);
    for (const h of [vane, rain]) assert.ok(h.text(ctx({ rain: 1 }), { fish: 'Q' }).length <= 170, `${h.id}: a toast, not an essay`);
    // the guide says the same numbers
    const farm = GUIDE_BY_ID.farm.steps.map((s) => (typeof s === 'string' ? s : s[0])).join(' ');
    assert.ok(farm.includes('Weather Vane') && farm.includes(`${Math.round(TUNING.rainGrow * 100)}%`));
});
