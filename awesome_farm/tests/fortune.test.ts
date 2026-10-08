// Fortune: crates, the wheel and double-or-nothing, buried treasure, lucky finds, golden nodes, bottles and the story that goes with them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OLD_DAY_LENGTH, TILE, TUNING } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { ITEMS, type ItemId } from '../src/shared/data/items';
import {
    CRATE_ITEM, CRATE_PITY, CRATE_TIERS, CRATES, GAMBLE_MAX_CHAIN, GAMBLE_ODDS, JACKPOT_COIN_MUL, LOOT_POOL, LUCK, WHEEL, WHEEL_JACKPOT_PITY, wheelPrice, wheelSpans,
} from '../src/shared/data/loot';
import { NODES } from '../src/shared/data/nodes';
import { CHAPTERS } from '../src/shared/data/quests';
import { GIVERS } from '../src/shared/data/sidequests';
import { BOTTLES, EPILOGUE, FORTUNA_LINES, FORTUNES, STORY } from '../src/shared/data/story';
import * as fortune from '../src/shared/sim/fortune';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE, NodeE, PlayerS, SimEvent } from '../src/shared/sim/types';

const STEP = 1 / 20;

function yard (seed: string) {
    const sim = Sim.create(seed, 'f');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const plot = sim.homePlot(p.slot);
    const o = sim.world.plotOrigin(plot);
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE; p.hearts = 99; p.invuln = 9999;
    const wheel = sim.add<BuildE>({ k: 'bld', kind: 'fortune', tx: o.tx + 7, ty: o.ty + 6, rot: 0 });
    return { sim, p, o, plot, wheel };
}
const events = <T extends SimEvent['e']>(sim: Sim, e: T) => sim.events.filter((x): x is Extract<SimEvent, { e: T }> => x.e === e);
const value = (r: string, n: number) => (r === 'coin' ? n : ITEMS[r as ItemId].sell * n);

// ── the tables ──────────────────────────────────────────────────────────────
test('loot tables are complete: real items, sane weights, a ladder of crates', () => {
    for (const [rar, rows] of Object.entries(LOOT_POOL)) {
        assert.ok(rows.length >= 4, `rarity ${rar} has choices`);
        for (const r of rows) {
            assert.ok(r.item === 'coin' || ITEMS[r.item], `${r.item} exists`);
            assert.ok(r.w > 0 && r.min >= 1 && r.max >= r.min, `${r.item}: ${r.min}-${r.max} @ ${r.w}`);
        }
    }
    assert.deepEqual(CRATE_TIERS.map((t) => CRATES[t].mul), [...CRATE_TIERS.map((t) => CRATES[t].mul)].sort((a, b) => a - b), 'better crates are bigger');
    for (const t of CRATE_TIERS) {
        const d = CRATES[t];
        assert.equal(ITEMS[CRATE_ITEM[t]].open, t, `${t}: the item opens as that tier`);
        assert.ok(d.cls.length === 5 && d.cls.every((x) => x >= 0) && d.cls.some((x) => x > 0));
        assert.ok(d.rolls[0] >= 1 && d.rolls[1] >= d.rolls[0]);
    }
    assert.equal(ITEMS.bottle.open, 'bottle');
    assert.ok(NODES.mound && BUILDINGS.fortune, 'the mound and the wheel exist');
});

test('the wheel is laid out whole, has one jackpot, and does not give away more than it takes', () => {
    const spans = wheelSpans();
    assert.equal(spans.length, WHEEL.length);
    assert.ok(Math.abs(spans[0][0]) < 1e-9 && Math.abs(spans[spans.length - 1][1] - 1) < 1e-9, 'it goes all the way round');
    for (let i = 1; i < spans.length; i++) assert.ok(Math.abs(spans[i][0] - spans[i - 1][1]) < 1e-9, 'no gaps');
    for (const [a, b] of spans) assert.ok(b - a >= 0.02, 'even a tiny wedge can be seen');
    assert.equal(WHEEL.filter((w) => w.kind === 'jackpot').length, 1);
    // expected value of a paid spin, as a share of the price (no pity)
    const total = WHEEL.reduce((a, w) => a + w.w, 0);
    for (const stake of [40, 100, 400]) {
        let ev = 0;
        for (const w of WHEEL) {
            let v = 0;
            if (w.kind === 'bust') v = Math.max(5, Math.round(stake * (w.mul ?? 0.2)));
            else if (w.kind === 'coin') v = stake * (w.mul ?? 1);
            else if (w.kind === 'items') v = (w.items ?? []).reduce((s, [r, n]) => s + value(r, n), 0);
            else if (w.kind === 'crate') v = ITEMS[CRATE_ITEM[w.crate!]].sell;
            else v = stake * JACKPOT_COIN_MUL + ITEMS.crate_gold.sell + ITEMS.lantern_shard.sell;
            ev += (w.w / total) * v;
        }
        assert.ok(ev / stake > 0.55 && ev / stake < 1.2, `stake ${stake}: a spin is worth ${(ev / stake).toFixed(2)}x its price`);
    }
    assert.ok(wheelPrice(0) >= 30 && wheelPrice(100) <= 400 && wheelPrice(3) > wheelPrice(2), 'the price climbs and stops');
});

test('the story is told: every chapter, bottle, fortune and line is there and short enough', () => {
    for (const c of CHAPTERS) {
        const s = STORY[c.id];
        assert.ok(s, `${c.id} has a story`);
        assert.ok(s.intro.length >= 1 && s.intro.length <= 3 && s.outro.length >= 1 && s.outro.length <= 3, `${c.id}: pages`);
        for (const pg of [...s.intro, ...s.outro]) {
            assert.ok(pg.text.length > 20 && pg.text.length <= 230, `${c.id}: page length ${pg.text.length}`);
            assert.ok(pg.speaker === 'narrator' || GIVERS[pg.speaker], `${c.id}: speaker ${pg.speaker}`);
        }
    }
    assert.equal(Object.keys(STORY).length, CHAPTERS.length, 'no story for a chapter that does not exist');
    assert.ok(EPILOGUE.length >= 2 && EPILOGUE.every((p) => p.text.length <= 230));
    assert.ok(BOTTLES.length >= 12 && BOTTLES.every((b) => b.length > 20 && b.length <= 210));
    assert.ok(FORTUNES.length >= 10 && FORTUNES.every((b) => b.length > 8 && b.length <= 90));
    for (const k of ['welcome', 'spin', 'win', 'jackpot', 'bust', 'gambleAsk', 'gambleWin', 'gambleLose', 'broke'] as const) assert.ok(FORTUNA_LINES[k].length >= 3 && FORTUNA_LINES[k].every((l) => l.length <= 80), k);
    assert.ok(CHAPTERS.length >= 16, 'the Fortune chapters follow the Old Heart');
    assert.equal(CHAPTERS[13].id, 'stranger');
});

// ── crates and bottles ──────────────────────────────────────────────────────
test('opening a crate uses it up, pays what the reveal says, counts for quests, and shows it off', () => {
    const { sim, p } = yard('FT-1');
    p.inv.crate_wood = 2;
    const before = { ...p.inv };
    const c0 = p.coins;
    sim.command('a', { t: 'crate', item: 'crate_wood' });
    assert.equal(p.inv.crate_wood, 1, 'one crate is gone');
    const [loot] = events(sim, 'loot');
    assert.ok(loot, 'the reveal is sent');
    assert.equal(loot.src, 'crate'); assert.equal(loot.tier, 'wood');
    assert.ok(loot.items.length >= 1);
    for (const [res, n] of loot.items) {
        assert.ok(n >= 1);
        if (res === 'coin') assert.ok(p.coins - c0 >= n, 'the coins arrived');
        else assert.ok((p.inv[res] ?? 0) - (before[res] ?? 0) >= n - 1 || res === 'crate_wood', `${res} arrived`);
    }
    assert.equal(p.cnt?.['crate:wood'], 1); assert.equal(p.cnt?.crate, 1, 'the group total counts too');
    assert.ok(events(sim, 'fx').some((e) => e.fx === 'crateOpen'), 'sound, sparkles and shake');
});

test('crates and bottles refuse what they should', () => {
    const { sim, p } = yard('FT-2');
    for (const item of ['wood', 'pick_flint', '__proto__', 'constructor', '', 'nope', 5, null, {}, [], 'crate_gold', 'bottle'] as never[]) {
        assert.doesNotThrow(() => sim.command('a', { t: 'crate', item }));
    }
    assert.equal(events(sim, 'loot').length, 0, 'nothing in the pockets, nothing opened');
    p.inv.crate_gold = 1; p.downed = 5;
    sim.command('a', { t: 'crate', item: 'crate_gold' });
    assert.equal(p.inv.crate_gold, 1, 'not while down');
});

test('better crates hold better things: a gold crate always has something rare, a mythic one an epic and a shard', () => {
    const { sim, p } = yard('FT-3');
    let shards = 0;
    for (let i = 0; i < 60; i++) {
        const g = fortune.rollCrate(sim, p, 'gold');
        assert.ok(g.some((x) => x[2] >= 2), 'rare or better');
        const m = fortune.rollCrate(sim, p, 'mythic');
        assert.ok(m.some((x) => x[2] >= 3), 'epic or better');
        assert.ok(m.some((x) => x[0] === 'lantern_shard'), 'a mythic crate holds a shard');
        shards += g.filter((x) => x[0] === 'lantern_shard').length;
    }
    assert.ok(shards >= 5 && shards <= 40, `golden crates hold the odd shard (${shards} in 60)`);
});

test('pity: after enough silver crates without anything epic, the next one has it', () => {
    const { sim, p } = yard('FT-4');
    const f = fortune.fortOf(p);
    f.cpity = CRATE_PITY - 1;
    const r = fortune.rollCrate(sim, p, 'silver');
    assert.ok(r.some((x) => x[2] >= 3), 'the guaranteed epic');
    assert.equal(f.cpity, 0);
    // and a wooden crate never touches the counter
    f.cpity = 3;
    fortune.rollCrate(sim, p, 'wood');
    assert.equal(f.cpity, 3);
});

test('luck has its own dice: opening crates never changes how the world rolls', () => {
    const a = yard('FT-5'), b = yard('FT-5');
    a.p.inv.crate_silver = 20;
    for (let i = 0; i < 20; i++) a.sim.command('a', { t: 'crate', item: 'crate_silver' });
    for (let i = 0; i < 30; i++) fortune.afterBreak(a.sim, a.p, { id: 1, k: 'node', kind: 'tree', tx: 1, ty: 1, hp: 0, plot: a.plot.i }, { x: 10, y: 10 });
    assert.equal(a.sim.rng.next(), b.sim.rng.next(), 'the world’s random stream is untouched');
});

test('a bottle tells its story, pays a little and raises a mound on one of your islands', () => {
    const { sim, p, plot } = yard('FT-6');
    p.inv.bottle = 1;
    sim.command('a', { t: 'crate', item: 'bottle' });
    const [loot] = events(sim, 'loot');
    assert.equal(loot.src, 'bottle');
    assert.ok(BOTTLES.some((b) => loot.text!.startsWith(b)), 'one of the letters');
    assert.ok(/X marks the spot/.test(loot.text!), 'and where to dig');
    assert.equal(p.cnt?.bottle, 1);
    const mounds = Object.values(sim.s.ents).filter((e): e is NodeE => e.k === 'node' && e.kind === 'mound');
    assert.equal(mounds.length, 1);
    assert.equal(mounds[0].plot, plot.i, 'on the island you are standing on');
});

// ── buried treasure ─────────────────────────────────────────────────────────
test('treasure mounds appear at dawn, one to an island, and digging one pays out and counts', () => {
    const { sim, p, plot } = yard('FT-7');
    const mounds = () => Object.values(sim.s.ents).filter((e): e is NodeE => e.k === 'node' && e.kind === 'mound');
    for (let d = 0; d < 40 && !mounds().some((m) => m.plot === plot.i); d++) { sim.s.day++; fortune.dawn(sim); }
    assert.ok(mounds().length >= 1, 'a mound grew');
    for (let d = 0; d < 20; d++) { sim.s.day++; fortune.dawn(sim); }
    assert.equal(mounds().filter((m) => m.plot === plot.i).length, 1, 'never two on one island');
    const m = mounds().find((x) => x.plot === plot.i)!;
    p.x = (m.tx + 0.5) * TILE; p.y = (m.ty + 1.5) * TILE;
    const coins = p.coins;
    for (let i = 0; i < 4 && sim.s.ents[m.id]; i++) { p.swingCd = 0; sim.command('a', { t: 'swing', id: m.id }); for (let t = 0; t < 1; t += STEP) sim.step(STEP); }
    assert.equal(sim.s.ents[m.id], undefined, 'dug up');
    assert.equal(p.cnt?.dig, 1);
    const loot = events(sim, 'loot').find((e) => e.src === 'dig');
    assert.ok(loot && loot.items.length >= 2, 'a prize to look at');
    assert.ok(p.coins > coins, 'with coins in it');
});

// ── lucky finds and golden nodes ────────────────────────────────────────────
test('lucky finds turn up now and then while you work, and golden nodes are rare but real', () => {
    const { sim, p } = yard('FT-8');
    const node: NodeE = { id: 1, k: 'node', kind: 'tree', tx: 5, ty: 5, hp: 0, plot: 0 };
    for (let i = 0; i < 3000; i++) fortune.afterBreak(sim, p, node, { x: 80, y: 80 });
    const n = p.cnt?.lucky ?? 0;
    assert.ok(n >= 3000 * LUCK.strike * 0.6 && n <= 3000 * LUCK.strike * 1.5, `${n} lucky finds in 3000 breaks`);
    let gold = 0;
    for (let i = 0; i < 20000; i++) if (fortune.isGolden('seed', 'tree', i % 200, Math.floor(i / 200), i)) gold++;
    assert.ok(gold >= 20000 * LUCK.golden * 0.6 && gold <= 20000 * LUCK.golden * 1.5, `${gold} golden in 20000`);
    assert.equal(fortune.isGolden('seed', 'tree', 3, 4, 5), fortune.isGolden('seed', 'tree', 3, 4, 5), 'the same place gives the same answer');
    assert.equal(fortune.isGolden('seed', 'sand', 3, 4, 5), false, 'sand never shines');
    // a golden tree drops three times as much and pays a prize
    const g = yard('FT-9');
    const tree = g.sim.add<NodeE>({ k: 'node', kind: 'tree', tx: g.o.tx + 3, ty: g.o.ty + 3, hp: 1, plot: g.plot.i, gold: 1 });
    g.p.x = (tree.tx + 1) * TILE; g.p.y = (tree.ty + 1.5) * TILE;
    g.p.swingCd = 0; g.sim.command('a', { t: 'swing', id: tree.id });
    const goldDrops = Object.values(g.sim.s.ents).filter((e) => e.k === 'drop' && e.res === 'wood').length;
    assert.equal(g.p.cnt?.golden, 1);
    assert.ok(goldDrops >= 2 * LUCK.goldenMul, `a golden tree dropped ${goldDrops} wood`);
    assert.ok(events(g.sim, 'fx').some((e) => e.fx === 'golden'));
});

// ── the wheel ───────────────────────────────────────────────────────────────
const spinOnce = (sim: Sim, id: number) => { sim.events.length = 0; sim.command('a', { t: 'fortune', op: 'spin', id }); return events(sim, 'spin')[0]; };

test('the first spin of the day is free, the rest cost more each time, and a new day is free again', () => {
    const { sim, p, wheel } = yard('FT-10');
    p.coins = 100000;
    const a = spinOnce(sim, wheel.id);
    assert.ok(a && a.free, 'free');
    assert.equal(a.price, wheelPrice(0), 'and the next one is told its price');
    const b = spinOnce(sim, wheel.id);
    assert.ok(b && !b.free);
    assert.equal(b.price, wheelPrice(1));
    const c = spinOnce(sim, wheel.id);
    assert.ok(c && !c.free && c.price === wheelPrice(2));
    assert.ok(wheelPrice(2) > wheelPrice(1) && wheelPrice(1) > wheelPrice(0));
    assert.equal(p.cnt?.['spin:free'], 1);
    assert.equal(p.cnt?.['spin:paid'], 2);
    assert.equal(p.cnt?.spin, 3, 'the group counts all spins');
    sim.s.day++;
    assert.ok(spinOnce(sim, wheel.id)?.free, 'a new day, a free spin');
});

test('a spin needs coins, reach, and a real wheel; prizes land in the pockets', () => {
    const { sim, p, wheel } = yard('FT-11');
    p.coins = 0;
    assert.ok(spinOnce(sim, wheel.id), 'the free one needs no coins');
    p.coins = 5;
    assert.equal(spinOnce(sim, wheel.id), undefined, 'too poor');
    p.coins = 5000;
    p.x += 900;
    assert.equal(spinOnce(sim, wheel.id), undefined, 'too far');
    p.x -= 900;
    for (const id of [-1, 1.5, NaN, 'x', null, 99999999] as never[]) assert.doesNotThrow(() => sim.command('a', { t: 'fortune', op: 'spin', id }));
    assert.doesNotThrow(() => sim.command('a', { t: 'fortune', op: 'zzz' as never, id: wheel.id }));
    let jackpots = 0;
    for (let i = 0; i < 300; i++) {
        p.coins = 1e6;
        const c0 = p.coins;
        const s = spinOnce(sim, wheel.id)!;
        assert.ok(s.seg >= 0 && s.seg < WHEEL.length);
        const coins = s.items.filter((x) => x[0] === 'coin').reduce((a, x) => a + x[1], 0);
        assert.equal(p.coins, c0 - wheelPrice(fortune.fortOf(p).pn - 1) + coins, 'the price went out and the prize came in');
        if (s.jackpot) jackpots++;
    }
    assert.ok(jackpots >= 1 && jackpots <= 80, `${jackpots} jackpots in 300 paid spins (the pity helps)`);
});

test('every paid spin that misses the jackpot makes it likelier; winning resets it', () => {
    const { sim, p, wheel } = yard('FT-12');
    p.coins = 1e7;
    const f = fortune.fortOf(p);
    for (let i = 0; i < 5; i++) spinOnce(sim, wheel.id);
    assert.ok(f.pity >= 1 && f.pity <= 5, 'the pity grows');
    let hit = false;
    for (let i = 0; i < 600 && !hit; i++) { p.coins = 1e7; hit = !!spinOnce(sim, wheel.id)?.jackpot; }
    assert.ok(hit, 'it comes');
    assert.equal(f.pity, 0, 'and the pity starts over');
    assert.ok((p.inv.lantern_shard ?? 0) >= 1 && (p.inv.crate_gold ?? 0) >= 1, 'a jackpot is coins, a golden crate and a shard');
    assert.ok((p.cnt?.jackpot ?? 0) >= 1);
    assert.ok(WHEEL_JACKPOT_PITY > 0);
});

test('double or nothing: only after a coin prize, never more than you hold, odds just under even, and it ends after a few', () => {
    const { sim, p, wheel } = yard('FT-13');
    const f = fortune.fortOf(p);
    p.coins = 1000;
    sim.events.length = 0;
    sim.command('a', { t: 'fortune', op: 'double', id: wheel.id });
    assert.equal(events(sim, 'gamble').length, 0, 'nothing to double yet');
    let wins = 0, n = 0, net = 0;
    for (let i = 0; i < 4000; i++) {
        f.last = 100; f.chain = 0; p.coins = 1000;
        sim.events.length = 0;
        sim.command('a', { t: 'fortune', op: 'double', id: wheel.id });
        const g = events(sim, 'gamble')[0];
        assert.ok(g);
        n++;
        if (g.win) { wins++; net += 100; assert.equal(p.coins, 1100); assert.equal(g.next, 200); }
        else { net -= 100; assert.equal(p.coins, 900); assert.equal(g.next, 0); assert.equal(f.last, 0); }
    }
    const rate = wins / n;
    assert.ok(Math.abs(rate - GAMBLE_ODDS) < 0.03, `${rate} wins`);
    assert.ok(net < 0, 'the house keeps a little');
    // you cannot stake coins you do not have
    f.last = 500; f.chain = 0; p.coins = 100;
    sim.events.length = 0; sim.command('a', { t: 'fortune', op: 'double', id: wheel.id });
    assert.equal(events(sim, 'gamble').length, 0); assert.equal(f.last, 0); assert.equal(p.coins, 100);
    // the chain is capped, and take clears it
    f.last = 10; f.chain = GAMBLE_MAX_CHAIN; p.coins = 100;
    sim.events.length = 0; sim.command('a', { t: 'fortune', op: 'double', id: wheel.id });
    assert.equal(events(sim, 'gamble').length, 0);
    f.last = 10; f.chain = 2;
    sim.command('a', { t: 'fortune', op: 'take', id: wheel.id });
    assert.equal(f.last, 0); assert.equal(f.chain, 0);
    assert.equal((p.cnt?.['gamble:win'] ?? 0) + (p.cnt?.['gamble:lose'] ?? 0), p.cnt?.gamble, 'wins and losses add up to the tries');
});

// ── monsters and bosses ─────────────────────────────────────────────────────
test('monsters sometimes leave crates (better ones from the tougher kinds), bosses always do', () => {
    const { sim, p } = yard('FT-14');
    let wood = 0, silver = 0;
    for (let i = 0; i < 4000; i++) fortune.mobCrate(sim, p, i % 2 === 0 ? 1 : 3, i % 10 === 0, 100, 100);
    for (const e of Object.values(sim.s.ents)) if (e.k === 'drop') { if (e.res === 'crate_wood') wood++; if (e.res === 'crate_silver') silver++; }
    assert.ok(wood >= 20 && wood <= 400, `${wood} wooden crates in 4000 kills`);
    assert.ok(silver >= 20, `${silver} silver`);
    for (const id of ['slime', 'stone', 'bog']) assert.ok(fortune.bossCrates(sim, p, id).some(([it]) => it === 'crate_gold'));
    assert.ok(fortune.bossCrates(sim, p, 'heart').some(([it]) => it === 'crate_mythic'), 'the Old Heart leaves a mythic crate');
    assert.equal(fortune.riftCrate(0)[0], 'crate_silver'); assert.equal(fortune.riftCrate(4)[0], 'crate_gold');
});

test('the luck state saves and loads', () => {
    const { sim, p, wheel } = yard('FT-15');
    p.coins = 5000;
    spinOnce(sim, wheel.id); spinOnce(sim, wheel.id);
    p.inv.crate_silver = 1;
    sim.command('a', { t: 'crate', item: 'crate_silver' });
    const back = new Sim(JSON.parse(JSON.stringify(sim.s)));
    back.join('a', 'A');
    const q = back.s.players.a as PlayerS;
    assert.deepEqual(q.fort, p.fort);
    assert.equal(countOf(q, 'crate_silver'), 0);
    // and the next roll is the same either way
    p.inv.crate_gold = 1; q.inv.crate_gold = 1;
    sim.events.length = 0; back.events.length = 0;
    sim.command('a', { t: 'crate', item: 'crate_gold' });
    back.command('a', { t: 'crate', item: 'crate_gold' });
    assert.deepEqual(events(sim, 'loot')[0]?.items, events(back, 'loot')[0]?.items, 'the same dice');
});

// ── the day ─────────────────────────────────────────────────────────────────
test('the days are long, and the sunset is announced twice before the night, every day', () => {
    assert.ok(TUNING.dayLength >= 240, 'a day is several minutes of daylight');
    const { sim } = yard('FT-16');
    const seen: string[] = [];
    const run = (secs: number) => { for (let t = 0; t < secs; t += STEP) { sim.step(STEP); for (const e of sim.events.splice(0)) if (e.e === 'banner' && /sinking|almost here/.test(e.text)) seen.push(e.text); } };
    sim.s.clock = TUNING.dayLength - TUNING.duskWarn[0] - 1;
    run(0.5);
    assert.deepEqual(seen, [], 'nothing yet');
    run(2);
    assert.deepEqual(seen, ['The sun is sinking'], 'the first warning');
    sim.s.clock = TUNING.dayLength - TUNING.duskWarn[1] + 0.5;
    run(1.5);
    assert.deepEqual(seen, ['The sun is sinking', 'Night is almost here!'], 'then the alarm');
    run(3);
    assert.equal(seen.length, 2, 'and each only once');
    // the night, then the next dawn, and the sun sinks again
    sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.1;
    run(2);
    assert.equal(sim.s.night, false);
    sim.s.clock = TUNING.dayLength - TUNING.duskWarn[0] + 0.5;
    run(1);
    assert.ok(seen.filter((t) => t === 'The sun is sinking').length >= 2, 'it warns again the next evening');
});

test('a night that was already under way when the days were stretched keeps its place in the night', () => {
    const { sim } = yard('FT-17');
    const state = JSON.parse(JSON.stringify(sim.s));
    state.night = true; state.clock = OLD_DAY_LENGTH + 10;
    const back = new Sim(state);
    assert.ok(back.s.clock >= TUNING.dayLength, 'still at night, not hours before it ends');
    assert.ok(Math.abs(back.s.clock - (TUNING.dayLength + 10)) < 1e-9, 'ten seconds into the night, as before');
    const day = JSON.parse(JSON.stringify(sim.s));
    day.night = false; day.clock = 100;
    assert.equal(new Sim(day).s.clock, 100, 'a daytime save is left alone');
});
