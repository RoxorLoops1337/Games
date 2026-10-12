// Safe two-sided trading: live offers, any change clears both Accepts, one atomic swap, and every way out leaves things where they were.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { Sim } from '../src/shared/sim/sim';
import { countOf, itemCap } from '../src/shared/sim/stats';
import { ACCEPT_LOCK } from '../src/shared/sim/trade';

function pair () {
    const sim = Sim.create('trade', 't');
    const a = sim.join('a', 'Ann')!, b = sim.join('b', 'Bo')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = (o.tx + 6) * TILE; a.y = (o.ty + 6) * TILE; b.x = a.x + 2 * TILE; b.y = a.y;
    for (const p of [a, b]) { p.invuln = 9999; p.hearts = 99; p.warp++; }
    a.inv = { wood: 30, iron: 4 }; a.coins = 100;
    b.inv = { stone: 12 }; b.coins = 5;
    const wait = () => { sim.s.time += ACCEPT_LOCK + 0.1; };
    return { sim, a, b, wait };
}

test('both sides see each offer; a change clears Accepts; both accept and it swaps', () => {
    const { sim, a, b, wait } = pair();
    sim.command('a', { t: 'trade', op: 'open', who: 'b' });
    assert.equal(a.trade?.w, 'b'); assert.equal(b.trade?.w, 'a');
    sim.command('a', { t: 'trade', op: 'set', item: 'wood', n: 10 });
    sim.command('a', { t: 'trade', op: 'coins', n: 20 });
    sim.command('b', { t: 'trade', op: 'set', item: 'stone', n: 12 });
    sim.command('a', { t: 'trade', op: 'ok' });
    assert.equal(a.trade?.ok, 0, 'Accept is locked right after a change');
    wait();
    sim.command('a', { t: 'trade', op: 'ok' });
    assert.equal(a.trade?.ok, 1);
    // Bo changes the offer after Ann accepted: her accept is cleared
    sim.command('b', { t: 'trade', op: 'set', item: 'stone', n: 6 });
    assert.equal(a.trade?.ok, 0);
    wait();
    sim.command('a', { t: 'trade', op: 'ok' });
    sim.command('b', { t: 'trade', op: 'ok' });
    assert.equal(a.trade, undefined);
    assert.equal(countOf(a, 'wood'), 20); assert.equal(countOf(b, 'wood'), 10);
    assert.equal(countOf(a, 'stone'), 6); assert.equal(countOf(b, 'stone'), 6);
    assert.equal(a.coins, 80); assert.equal(b.coins, 25);
});

test('you cannot offer what you do not have, and a full pack stops the swap with nothing moved', () => {
    const { sim, a, b, wait } = pair();
    sim.command('a', { t: 'trade', op: 'open', who: 'b' });
    sim.command('a', { t: 'trade', op: 'set', item: 'iron', n: 99 });
    assert.deepEqual(a.trade?.o, [['iron', 4]], 'clamped to what Ann carries');
    sim.command('a', { t: 'trade', op: 'coins', n: 9999 });
    assert.equal(a.trade?.c, 100);
    b.inv.iron = itemCap(b, 'iron') - 1;
    wait();
    sim.command('a', { t: 'trade', op: 'ok' }); sim.command('b', { t: 'trade', op: 'ok' });
    assert.ok(a.trade && b.trade, 'still open');
    assert.equal(a.trade!.ok, 0);
    assert.equal(countOf(a, 'iron'), 4); assert.equal(a.coins, 100);
});

test('walking away, going down or logging off cancels it; strangers and busy farmers are refused', () => {
    const far = pair();
    far.b.x += 30 * TILE;
    far.sim.command('a', { t: 'trade', op: 'open', who: 'b' });
    assert.equal(far.a.trade, undefined, 'too far to start');
    far.b.x -= 30 * TILE;
    far.sim.command('a', { t: 'trade', op: 'open', who: 'b' });
    far.b.x += 30 * TILE; far.sim.step(0.05);
    assert.equal(far.a.trade, undefined); assert.equal(far.b.trade, undefined, 'called off for both');
    const busy = pair();
    busy.sim.command('a', { t: 'trade', op: 'open', who: 'b' });
    busy.sim.command('a', { t: 'trade', op: 'open', who: 'a' });
    busy.sim.command('a', { t: 'trade', op: 'cancel' });
    assert.equal(busy.b.trade, undefined, 'cancel ends it for both');
    busy.sim.command('a', { t: 'trade', op: 'open', who: 'b' });
    busy.sim.leave('b'); busy.sim.step(0.05);
    assert.equal(busy.a.trade, undefined);
});
