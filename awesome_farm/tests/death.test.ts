// Falling for good costs half your XP towards the next level and drops your backpack where you fell. Being picked up, or an expedition, costs nothing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { packs } from '../src/shared/sim/death';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, secs: number) => { for (let t = 0; t < secs; t += STEP) sim.step(STEP); };

function world (seed: string, friend = false) {
    const sim = Sim.create(seed, 'death');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 3) * TILE; p.y = (o.ty + 14) * TILE; p.warp++;                 // (a good way from the middle of the patch, where you wake up)
    p.inv = { wood: 120, stone: 40, iron: 7, seed_wheat: 3, potion_heal: 2 };
    p.xp = 40; p.level = 5; p.coins = 77;
    p.equip.tool = 'pick_flint' as never;
    let f;
    if (friend) { f = sim.join('b', 'B')!; f.x = p.x + 8; f.y = p.y; f.warp++; }
    return { sim, p, f, o };
}

test('giving up after a fall: half the XP is gone and the whole backpack lies where you fell', () => {
    const { sim, p } = world('D-1');
    const x = p.x, y = p.y;
    sim.down(p);
    assert.ok(p.downed > 0);
    sim.command('a', { t: 'respawn' });
    assert.equal(p.xp, 20, 'half of the 40 XP');
    assert.equal(p.level, 5, 'a fall never costs a level');
    assert.deepEqual(p.inv, {}, 'the pockets are empty');
    assert.equal(p.coins, 77, 'coins are safe');
    assert.equal(p.equip.tool, 'pick_flint', 'so is what you wear');
    assert.ok(Math.hypot(p.x - x, p.y - y) > 40, 'you woke up at home');
    const [pack] = packs(sim);
    assert.ok(pack, 'a lost backpack');
    assert.equal(pack.inv?.wood, 120); assert.equal(pack.inv?.stone, 40); assert.equal(pack.inv?.potion_heal, 2);
    assert.ok(Math.abs((pack.tx + 0.5) * TILE - x) < 6 * TILE && Math.abs((pack.ty + 0.5) * TILE - y) < 6 * TILE, 'near where you fell');
    assert.equal(pack.by, 'a');
    assert.ok(sim.events.some((e) => e.e === 'banner' && e.to === 'a' && /backpack/i.test(e.sub ?? '') && /XP/.test(e.sub ?? '')), 'and you are told');
    assert.ok(sim.events.some((e) => e.e === 'fx' && e.fx === 'packDrop'));
});

test('running out the clock does the same, and so does logging off while down', () => {
    const a = world('D-2');
    a.sim.down(a.p);
    run(a.sim, TUNING.downedSoloSeconds + 1);
    assert.equal(a.p.xp, 20); assert.equal(packs(a.sim).length, 1);
    const b = world('D-2b');
    b.sim.down(b.p);
    b.sim.leave('a');
    assert.equal(b.p.xp, 20, 'no dodging it by leaving'); assert.equal(packs(b.sim).length, 1);
});

test('a friend picking you up costs you nothing', () => {
    const { sim, p } = world('D-3', true);
    sim.down(p);
    assert.ok(p.downed > TUNING.downedSoloSeconds, 'with a friend about there is time');
    for (let i = 0; i < 80 && p.downed > 0; i++) { sim.command('b', { t: 'revive', who: 'a' }); run(sim, 0.1); }
    assert.equal(p.downed, 0, 'back on your feet');
    assert.equal(p.xp, 40); assert.equal(countOf(p, 'wood'), 120); assert.equal(packs(sim).length, 0);
});

test('an expedition is safe: falling there only ends the run', () => {
    const { sim, p } = world('D-4');
    p.rift = { arena: 0 } as never;           // (on an expedition)
    sim.down(p);
    sim.command('a', { t: 'respawn' });
    assert.equal(p.xp, 40); assert.equal(countOf(p, 'wood'), 120); assert.equal(packs(sim).length, 0);
});

test('with nothing in your pockets there is no backpack, only the XP', () => {
    const { sim, p } = world('D-5');
    p.inv = {};
    sim.down(p);
    sim.command('a', { t: 'respawn' });
    assert.equal(packs(sim).length, 0); assert.equal(p.xp, 20);
    // and with no XP either, nothing is lost at all
    p.xp = 0;
    sim.down(p);
    sim.command('a', { t: 'respawn' });
    assert.equal(p.xp, 0);
});

test('anyone can take things out of the backpack, nothing goes in, and it goes when it is empty', () => {
    const { sim, p, f } = world('D-6', true);
    sim.down(p);
    sim.command('a', { t: 'respawn' });
    const pack = packs(sim)[0];
    const c = sim.center(pack);
    f!.x = c.x + 6; f!.y = c.y + 6; f!.warp++;
    sim.command('b', { t: 'xfer', id: pack.id, item: 'wood', n: 50, dir: 'take', part: 'inv' });
    assert.equal(countOf(f!, 'wood'), 50, 'a friend can fetch it for you');
    assert.equal(pack.inv?.wood, 70);
    f!.inv.coal = 3;
    sim.command('b', { t: 'xfer', id: pack.id, item: 'coal', n: 3, dir: 'put', part: 'inv' });
    assert.equal(pack.inv?.coal, undefined, 'nothing can be put in a lost backpack');
    // the owner walks back and takes it all
    p.x = c.x + 6; p.y = c.y + 6; p.warp++;
    for (const [item, n] of Object.entries(pack.inv ?? {})) sim.command('a', { t: 'xfer', id: pack.id, item: item as never, n: n as number, dir: 'take', part: 'inv' });
    assert.equal(sim.s.ents[pack.id], undefined, 'an empty backpack is gone');
    assert.equal(countOf(p, 'stone'), 40); assert.equal(countOf(p, 'wood'), 70);
});

test('a backpack nobody comes back for crumbles away after its time, and survives a save and load until then', () => {
    const { sim, p } = world('D-7');
    sim.down(p);
    sim.command('a', { t: 'respawn' });
    const again = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.equal(packs(again).length, 1, 'still there after a restart');
    assert.equal(packs(again)[0].inv?.wood, 120);
    sim.s.time += TUNING.packLife + 10;
    run(sim, 6);
    assert.equal(packs(sim).length, 0, 'gone');
});

test('a lost backpack cannot be built, copied or otherwise made by a player', () => {
    const { sim, p, o } = world('D-8');
    p.inv.wood = 999;
    sim.command('a', { t: 'build', kind: 'lostpack', tx: o.tx + 10, ty: o.ty + 10, rot: 0 });
    assert.equal(packs(sim).length, 0);
    sim.command('a', { t: 'bp', tx: o.tx + 10, ty: o.ty + 10, items: [{ kind: 'lostpack', dx: 0, dy: 0, rot: 0 }] });
    assert.equal(packs(sim).length, 0);
    const b = sim.add<BuildE>({ k: 'bld', kind: 'lostpack', tx: o.tx + 11, ty: o.ty + 11, rot: 0, inv: { wood: 4 }, born: 0 });
    sim.command('a', { t: 'config', id: b.id, fl: ['#ore'] });
    assert.equal(b.fl, undefined, 'a backpack is not a sorting chest');
    // creatures and inserters leave it alone
    const { accepts } = require('../src/shared/sim/machines') as typeof import('../src/shared/sim/machines');
    assert.equal(accepts(b, 'wood'), null);
});

test('the way back to a lost backpack is remembered until it is gone', () => {
    const { sim, p } = world('D-9');
    sim.down(p);
    sim.command('a', { t: 'respawn' });
    const pack = packs(sim)[0];
    assert.deepEqual(p.pk, { x: (pack.tx + 0.5) * TILE, y: (pack.ty + 0.5) * TILE }, 'the HUD is told where it lies');
    // taking it all clears the arrow
    const c = sim.center(pack);
    p.x = c.x + 6; p.y = c.y + 6; p.warp++;
    for (const [item, n] of Object.entries(pack.inv ?? {})) sim.command('a', { t: 'xfer', id: pack.id, item: item as never, n: n as number, dir: 'take', part: 'inv' });
    assert.equal(p.pk, undefined);
    // and so does it fading away
    p.inv = { wood: 5 };
    sim.down(p);
    sim.command('a', { t: 'respawn' });
    assert.ok(p.pk);
    sim.s.time += TUNING.packLife + 10;
    run(sim, 6);
    assert.equal(p.pk, undefined, 'gone with the backpack');
});
