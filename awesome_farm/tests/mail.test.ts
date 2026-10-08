// The mailbox: parcels between friends, the morning postcards, the flag, and every limit.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { POSTCARD_LINES } from '../src/shared/data/postcards';
import { GIVERS } from '../src/shared/data/sidequests';
import * as economy from '../src/shared/sim/economy';
import * as mail from '../src/shared/sim/mail';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE, PlayerS, SimEvent } from '../src/shared/sim/types';

/** Two farmers on one island, each with a mailbox, standing at their own. */
function pair (seed = 'mail') {
    const sim = Sim.create(seed, 'm');
    const a = sim.join('a', 'Dana')!, b = sim.join('b', 'Sam')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const home = sim.world.plotOrigin(sim.homePlot(a.slot));
    const put = (p: PlayerS, dx: number): BuildE => {
        p.inv.wood = 99; p.inv.plank = 99;
        p.x = (home.tx + dx + 0.5) * TILE; p.y = (home.ty + 9) * TILE;
        const r = economy.tryBuild(sim, p, 'mailbox', home.tx + dx, home.ty + 6, 0, 99);
        assert.ok(r.ok, 'the mailbox goes up');
        return (r as { ok: true; b: BuildE }).b;
    };
    const boxA = put(a, 3), boxB = put(b, 8);
    a.x = (home.tx + 3.5) * TILE; a.y = (home.ty + 8) * TILE; b.x = (home.tx + 8.5) * TILE; b.y = (home.ty + 8) * TILE;
    sim.events.length = 0;
    return { sim, a, b, boxA, boxB, home };
}
const events = <T extends SimEvent['e']>(sim: Sim, e: T) => sim.events.filter((x): x is Extract<SimEvent, { e: T }> => x.e === e);
const goToB = (a: PlayerS, home: { tx: number; ty: number }) => { a.x = (home.tx + 8.5) * TILE; a.y = (home.ty + 8) * TILE; };

test('a mailbox is built, belongs to its builder and opens the mail window', () => {
    const { sim, a, boxA } = pair();
    assert.equal(boxA.by, 'a');
    assert.equal(boxA.flag, undefined);
    sim.command('a', { t: 'use', id: boxA.id });
    assert.deepEqual(events(sim, 'open').map((e) => [e.to, e.ui, e.id]), [['a', 'mail', boxA.id]]);
    void a;
});

test('a friend leaves a parcel: it leaves their pockets, waits in the owner\'s mail, the flag goes up, the owner hears', () => {
    const { sim, a, b, boxA, boxB, home } = pair();
    a.inv.iron = 12; a.coins = 100;
    goToB(a, home);
    sim.command('a', { t: 'mail', op: 'send', id: boxB.id, items: [['iron', 5], ['coin', 40]], note: 'Thank you!' });
    assert.equal(countOf(a, 'iron'), 7); assert.equal(a.coins, 60);
    assert.deepEqual(b.mail, [{ from: 'Dana', fid: 'a', d: sim.s.day, note: 'Thank you!', items: [['iron', 5], ['coin', 40]] }]);
    assert.equal(boxB.flag, 1, 'the flag is up');
    assert.equal(boxA.flag, undefined, 'the sender\'s own box is untouched');
    assert.ok(events(sim, 'toast').some((e) => e.to === 'b' && e.text.includes('Dana')), 'the owner is told');
    assert.ok(events(sim, 'fx').some((e) => e.fx === 'mail'));
});

test('the owner takes the post: one letter or all; things arrive, the flag comes down', () => {
    const { sim, a, b, boxB, home } = pair();
    a.inv.iron = 12; a.inv.stone = 30;
    goToB(a, home);
    sim.command('a', { t: 'mail', op: 'send', id: boxB.id, items: [['iron', 5]], note: 'one' });
    sim.command('a', { t: 'mail', op: 'send', id: boxB.id, items: [['stone', 20]], note: 'two' });
    assert.equal(b.mail!.length, 2);
    const before = countOf(b, 'stone');
    sim.command('b', { t: 'mail', op: 'take', id: boxB.id, i: 1 });
    assert.equal(countOf(b, 'stone'), before + 20);
    assert.equal(b.mail!.length, 1); assert.equal(boxB.flag, 1, 'one letter left: still flagged');
    sim.command('b', { t: 'mail', op: 'take', id: boxB.id });
    assert.equal(countOf(b, 'iron'), 5);
    assert.equal(b.mail, undefined); assert.equal(boxB.flag, undefined);
    sim.command('b', { t: 'mail', op: 'take', id: boxB.id });      // nothing left: nothing happens
});

test('the limits: not your own box, one to three different kinds, enough of them, near, a real mailbox', () => {
    const { sim, a, b, boxA, boxB, home } = pair();
    a.inv.iron = 12; a.inv.stone = 5; a.inv.wood = 5; a.inv.coal = 5; a.coins = 10;
    goToB(a, home);
    const send = (id: number, items: unknown, note = '') => sim.command('a', { t: 'mail', op: 'send', id, items: items as [string, number][], note } as never);
    send(boxA.id, [['iron', 1]]);                                                    // her own box: she is far, and it is hers
    send(boxB.id, []);                                                               // nothing
    send(boxB.id, [['iron', 1], ['stone', 1], ['wood', 1], ['coal', 1]]);            // four kinds
    send(boxB.id, [['iron', 1], ['iron', 2]]);                                       // the same kind twice
    send(boxB.id, [['iron', 99]]);                                                   // more than she has
    send(boxB.id, [['coin', 11]]);                                                   // more coins than she has
    send(boxB.id, [['iron', 0]]); send(boxB.id, [['iron', -3]]); send(boxB.id, [['iron', 1.5]]);
    send(boxB.id, [['nonsense', 1]]); send(boxB.id, [['constructor', 1]]); send(boxB.id, 'iron'); send(boxB.id, [['iron']]);
    send(boxB.id, [[1, 1]]);
    assert.equal(b.mail, undefined, 'nothing went through');
    assert.equal(countOf(a, 'iron'), 12);
    a.x = 0; a.y = 0;
    send(boxB.id, [['iron', 1]]);
    assert.equal(b.mail, undefined, 'too far away');
    goToB(a, home);
    sim.command('a', { t: 'mail', op: 'send', id: 999999, items: [['iron', 1]], note: '' });
    sim.command('a', { t: 'mail', op: 'send', id: boxB.id, items: [['iron', 1]], note: '' });
    assert.equal(b.mail!.length, 1);
    // somebody else's mailbox cannot be emptied
    sim.command('a', { t: 'mail', op: 'take', id: boxB.id });
    assert.equal(b.mail!.length, 1);
});

test('three letters from one friend at a time, twenty in all, and the note is made safe', () => {
    const { sim, a, b, boxB, home } = pair();
    a.inv.iron = 500; goToB(a, home);
    for (let i = 0; i < 5; i++) sim.command('a', { t: 'mail', op: 'send', id: boxB.id, items: [['iron', 1]], note: `n${i}` });
    assert.equal(b.mail!.length, mail.PER_SENDER);
    assert.equal(countOf(a, 'iron'), 500 - mail.PER_SENDER, 'refused letters keep their things');
    b.mail = [];
    sim.command('a', { t: 'mail', op: 'send', id: boxB.id, items: [['iron', 1]], note: '<b>hello</b>\u0007' + 'x'.repeat(200) });
    const note = b.mail![0].note;
    assert.ok(!/[<>\u0007]/.test(note) && note.length <= mail.NOTE_MAX, note);
    b.mail = Array.from({ length: mail.MAIL_CAP }, (_, i) => ({ from: `F${i}`, fid: `f${i}`, d: 1, note: '', items: [['iron', 1]] as [string, number][] })) as unknown as typeof b.mail;
    const iron = countOf(a, 'iron');
    sim.command('a', { t: 'mail', op: 'send', id: boxB.id, items: [['iron', 1]], note: '' });
    assert.equal(b.mail!.length, mail.MAIL_CAP); assert.equal(countOf(a, 'iron'), iron);
});

test('post for a farmer who is away waits for them, and the chime comes when they arrive', () => {
    const { sim, a, b, boxB, home } = pair();
    a.inv.iron = 3; goToB(a, home);
    sim.leave('b');
    sim.command('a', { t: 'mail', op: 'send', id: boxB.id, items: [['iron', 3]], note: 'hi' });
    assert.equal(b.mail!.length, 1); assert.equal(boxB.flag, 1);
    sim.events.length = 0;
    sim.join('b', 'Sam');
    assert.ok(events(sim, 'toast').some((e) => e.to === 'b' && e.text.includes('You have mail')));
    assert.ok(events(sim, 'fx').some((e) => e.fx === 'mail'));
});

test('every dawn a postcard comes, from one of the island folk, with a small present; only the newest few are kept', () => {
    const { sim, a, boxA } = pair('mail-cards');
    const day = (n: number) => { sim.s.day = n; mail.postcards(sim); };
    day(2);
    const card = a.mail![0];
    assert.equal(card.pc, 1); assert.ok(Object.values(GIVERS).some((g) => g.name === card.from));
    assert.ok(Object.values(POSTCARD_LINES).flat().includes(card.note), 'a written line');
    assert.equal(card.items.length, 1);
    assert.equal(boxA.flag, 1);
    day(3); day(4); day(5); day(6);
    assert.equal(a.mail!.length, mail.POSTCARDS_KEPT);
    assert.deepEqual(a.mail!.map((m) => m.d), [4, 5, 6], 'the oldest fell away');
    // the same world gives the same card on the same day
    const other = pair('mail-cards');
    other.sim.s.day = 2; mail.postcards(other.sim);
    assert.deepEqual(other.a.mail![0], card);
    // a friend's parcel is never pushed out by cards
    a.mail!.unshift({ from: 'Sam', fid: 'b', d: 1, note: 'keep me', items: [['iron', 1]] });
    day(7); day(8); day(9);
    assert.ok(a.mail!.some((m) => m.note === 'keep me'));
    // the real morning does it
    const real = pair('mail-real');
    real.sim.s.night = true; real.sim.s.clock = TUNING.dayLength + real.sim.s.nightLen + 1;
    real.sim.step(0.1);
    assert.equal(real.sim.s.day, 2);
    assert.equal(real.a.mail?.length, 1);
    assert.equal(real.b.mail?.length, 1);
});

test('postcards reach every farmer, online or not, and taking one pays out', () => {
    const { sim, a, b, boxA } = pair('mail-pay');
    sim.leave('b');
    sim.s.day = 3; mail.postcards(sim);
    assert.equal(a.mail!.length, 1); assert.equal(b.mail!.length, 1);
    const [r, n] = a.mail![0].items[0];
    const had = r === 'coin' ? a.coins : countOf(a, r as 'wood');
    sim.command('a', { t: 'mail', op: 'take', id: boxA.id });
    assert.equal(r === 'coin' ? a.coins : countOf(a, r as 'wood'), had + n);
    assert.equal(a.mail, undefined); assert.equal(boxA.flag, undefined);
});

test('mail and flags survive a save and load; old saves without any load fine', () => {
    const { sim, a, b, boxB, home } = pair();
    a.inv.iron = 3; goToB(a, home);
    sim.command('a', { t: 'mail', op: 'send', id: boxB.id, items: [['iron', 3]], note: 'saved' });
    const copy = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.deepEqual(copy.s.players.b.mail, b.mail);
    const flagged = Object.values(copy.s.ents).filter((e) => e.k === 'bld' && e.kind === 'mailbox' && e.flag);
    assert.equal(flagged.length, 1);
    copy.join('b', 'Sam');
    const box = flagged[0] as BuildE;
    copy.s.players.b.x = (box.tx + 0.5) * TILE; copy.s.players.b.y = (box.ty + 1.5) * TILE;
    copy.command('b', { t: 'mail', op: 'take', id: box.id });
    assert.equal(countOf(copy.s.players.b, 'iron'), 3);
});
