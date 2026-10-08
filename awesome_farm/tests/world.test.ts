// The wider world: ancient ruins, waystone travel, the travelling trader and the social commands.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { nightEvent } from '../src/shared/weather';
import { stockFor } from '../src/shared/sim/shop';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE, MobE, NodeE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s; t += STEP) sim.step(STEP); };

test('ruins: buying the land raises a vault and three elite guardians that survive the dawn', () => {
    const sim = Sim.create('W-1', 'w');
    const p = sim.join('a', 'A')!;
    const target = sim.s.plots.find((pl) => !pl.owned && !pl.home && !pl.heart)!;
    target.mod = 'ruins';
    // buy it the normal way so its guardians and vault are raised
    // call populate through a purchase: make it purchasable by owning its neighbour
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => sim.world.plot(target.gx + dx, target.gy + dy)).find((n) => n && !n.owned && !n.home)!;
    nb.owned = true; sim.world.recompute();
    p.coins = 99999;
    sim.command('a', { t: 'buy', plot: target.i });
    assert.ok(target.owned, 'bought');
    const vault = Object.values(sim.s.ents).find((e): e is NodeE => e.k === 'node' && e.kind === 'vault');
    assert.ok(vault, 'a vault');
    const guards = Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && !!e.guard);
    assert.equal(guards.length, 3, 'three guardians');
    assert.ok(guards.every((g) => g.el === 1));
    // dawn does not clear them
    sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.1;
    sim.s.night = true;
    run(sim, 0.5);
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'mob' && e.guard).length, 3, 'they stay');
    // opening the vault pays well
    p.x = vault.tx * TILE + 8; p.y = (vault.ty + 2) * TILE;
    const before = p.coins;
    for (let i = 0; i < 4 && sim.s.ents[vault.id]; i++) { p.swingCd = 0; sim.command('a', { t: 'swing', id: vault.id }); run(sim, 0.4); }
    run(sim, 2);
    assert.equal(sim.s.ents[vault.id], undefined, 'opened');
    assert.ok(p.coins > before || countOf(p, 'goldbar') > 0);
});

test('waystones: travel between two, needs to be standing at one, and cools down', () => {
    const sim = Sim.create('W-2', 'w');
    const p = sim.join('a', 'A')!;
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const a = sim.add<BuildE>({ k: 'bld', kind: 'waystone', tx: o.tx + 3, ty: o.ty + 3, rot: 0, by: 'a' });
    // a second waystone on a far plot
    const far = sim.s.plots.find((pl) => !pl.owned && !pl.home && !pl.heart)!;
    far.owned = true; sim.world.recompute();
    const fo = sim.world.plotOrigin(far);
    const b = sim.add<BuildE>({ k: 'bld', kind: 'waystone', tx: fo.tx + 4, ty: fo.ty + 4, rot: 0, by: 'a' });
    p.x = (a.tx + 0.5) * TILE; p.y = (a.ty + 2) * TILE;
    sim.command('a', { t: 'use', id: a.id });
    const ways = sim.events.find((e) => e.e === 'ways');
    assert.ok(ways && ways.e === 'ways' && ways.list.length === 2, 'the list of stones came with the UI event');
    sim.events = [];
    sim.command('a', { t: 'travel', to: b.id });
    assert.ok(Math.abs(p.x - (b.tx + 0.5) * TILE) < 3 * TILE && Math.abs(p.y - (b.ty + 1) * TILE) < 3 * TILE, 'arrived beside the far stone');
    assert.ok(p.warp > 0);
    sim.command('a', { t: 'travel', to: a.id });
    assert.ok(Math.abs(p.x - (b.tx + 0.5) * TILE) < 3 * TILE, 'cooling down: still there');
    run(sim, 7);
    sim.command('a', { t: 'travel', to: a.id });
    assert.ok(Math.abs(p.x - (a.tx + 0.5) * TILE) < 3 * TILE, 'back home');
    // away from any stone: refused
    p.x = (o.tx + 9) * TILE; p.y = (o.ty + 9) * TILE; run(sim, 7);
    sim.command('a', { t: 'travel', to: b.id });
    assert.ok(Math.abs(p.x - (o.tx + 9) * TILE) < 2, 'must stand at a waystone');
});

test('the trader: stock is deterministic, shared, limited, and needs the skill', () => {
    const s1 = stockFor('seed', 1), s2 = stockFor('seed', 1), s3 = stockFor('seed', 3);
    assert.deepEqual(s1, s2);
    assert.notDeepEqual(s1.stock.map((x) => x.item), s3.stock.map((x) => x.item));
    const sim = Sim.create('W-3', 'w');
    const p = sim.join('a', 'A')!;
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    sim.add<BuildE>({ k: 'bld', kind: 'market', tx: o.tx + 4, ty: o.ty + 4, rot: 0 });
    p.x = (o.tx + 5) * TILE; p.y = (o.ty + 6) * TILE;
    assert.ok(sim.s.shop && sim.s.shop.stock.length >= 5, 'the world has a shop');
    const i = 0, it = sim.s.shop!.stock[i];
    p.coins = 100000;
    sim.command('a', { t: 'shop', i, n: 1 });
    assert.equal(p.coins, 100000, 'needs Merchant Contacts');
    p.skills.x_trade = 1;
    const n0 = it.n;
    sim.command('a', { t: 'shop', i, n: 2 });
    assert.equal(it.n, n0 - Math.min(2, n0), 'stock went down');
    assert.equal(countOf(p, it.item), Math.min(2, n0));
    assert.equal(p.coins, 100000 - it.price * Math.min(2, n0));
    sim.command('a', { t: 'shop', i, n: 999 });
    assert.equal(it.n, 0, 'bought out');
    const coins = p.coins;
    sim.command('a', { t: 'shop', i, n: 1 });
    assert.equal(p.coins, coins, 'sold out');
    // restocks at the right dawn
    const day = sim.s.day;
    sim.s.day = day + 2;
    sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.1; sim.s.night = true;
    run(sim, 0.5);
    assert.notEqual(sim.s.shop!.day, 1, 'a fresh shop');
});

test('chat, emotes and pings are rate limited and sanitised', () => {
    const sim = Sim.create('W-4', 'w');
    const p = sim.join('a', 'A')!;
    sim.events = [];
    sim.command('a', { t: 'chat', text: '  hello\u0007 world  ' });
    sim.command('a', { t: 'chat', text: 'spam' });
    const chats = sim.events.filter((e) => e.e === 'chat');
    assert.equal(chats.length, 1, 'rate limited');
    assert.equal(chats[0].e === 'chat' && chats[0].text, 'hello  world');
    run(sim, 1);
    sim.command('a', { t: 'chat', text: 'x'.repeat(500) });
    const long = sim.events.filter((e) => e.e === 'chat').pop();
    assert.equal(long?.e === 'chat' && long.text.length, 100);
    sim.command('a', { t: 'emote', id: 99 });
    assert.ok(!sim.events.some((e) => e.e === 'emote'), 'invalid emote');
    sim.command('a', { t: 'emote', id: 3 });
    assert.ok(sim.events.some((e) => e.e === 'emote'));
    sim.command('a', { t: 'ping', x: NaN, y: 4 });
    assert.ok(!sim.events.some((e) => e.e === 'ping'));
    sim.command('a', { t: 'ping', x: p.x + 40, y: p.y });
    assert.ok(sim.events.some((e) => e.e === 'ping'));
});

test('special nights: the Blood Moon on every seventh day pays out at dawn; meteors drop ore; fairies heal', () => {
    const sim = Sim.create('W-5', 'w');
    const p = sim.join('a', 'A')!;
    for (let d = 1; d < 30; d++) assert.equal(nightEvent(sim.s.seed, d) === 'bloodmoon', d >= 7 && d % 7 === 0);
    // blood moon
    sim.s.day = 7; sim.s.clock = TUNING.dayLength - 0.1;
    run(sim, 0.5);
    assert.equal(sim.nightEv, 'bloodmoon');
    assert.ok(sim.events.some((e) => e.e === 'banner' && e.text === 'Blood Moon'));
    for (let t = 0; t < 40; t += STEP) { p.hearts = 99; sim.step(STEP); }
    const mobs = Object.values(sim.s.ents).filter((e) => e.k === 'mob' && !(e as MobE).zone).length;
    assert.ok(mobs >= 3, `a crowd of monsters (${mobs})`);
    const coins = p.coins;
    p.hearts = 99; p.downed = 0;
    sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.1;
    run(sim, 0.4);
    assert.ok(p.coins >= coins + 90, 'the dawn bonus');
    assert.equal(sim.nightEv, null);
    // find a meteor night and a fairy night
    const find = (kind: string) => { for (let d = 3; d < 400; d++) if (nightEvent(sim.s.seed, d) === kind) return d; return 0; };
    const nodesBefore = Object.values(sim.s.ents).filter((e) => e.k === 'node').length;
    sim.s.day = find('meteors'); sim.s.night = false; sim.s.clock = TUNING.dayLength - 0.1;
    run(sim, 0.5);
    assert.equal(sim.nightEv, 'meteors');
    assert.ok(Object.values(sim.s.ents).filter((e) => e.k === 'node').length > nodesBefore, 'ore fell from the sky');
    p.hearts = 1;
    sim.s.day = find('fairies'); sim.s.night = false; sim.s.clock = TUNING.dayLength - 0.1;
    run(sim, 0.5);
    assert.equal(sim.nightEv, 'fairies');
    assert.ok(p.hearts >= 3 && p.buffs.some((b) => b.id === 'lucky'), 'healed and lucky');
});
