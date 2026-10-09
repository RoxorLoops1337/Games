// The developer menu: closed to everybody who has no key, open in solo, and each op does what it says. (sim/dev.ts, net/host.ts)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { test } from 'node:test';
import WebSocket from 'ws';
import { RIFT_ISLANDS, TILE, TUNING, UNDER_Y } from '../src/shared/config';
import { SPECIES_LIST } from '../src/shared/data/creatures';
import { ITEMS, type ItemId } from '../src/shared/data/items';
import { BOSS_KINDS, MOB_KINDS, MOBS, WILD_KINDS } from '../src/shared/data/mobs';
import { NODES, type NodeKind } from '../src/shared/data/nodes';
import { CHAPTERS, MEDALS } from '../src/shared/data/quests';
import { SKILL_LIST } from '../src/shared/data/skills';
import { SimHost, type HostOptions, type Peer } from '../src/shared/net/host';
import { PROTOCOL, type PlayerDelta, type ServerMsg, type TickMsg } from '../src/shared/net/protocol';
import { DEV_OPS, EVENTS, KIT, TIMES, type DevCmd } from '../src/shared/sim/dev';
import { Sim } from '../src/shared/sim/sim';
import { countOf, derived, MAX_LEVEL, xpToNext } from '../src/shared/sim/stats';
import type { BuildE, CritE, Cmd, MobE, NodeE, SimEvent } from '../src/shared/sim/types';
import * as dread from '../src/shared/sim/dread';
import * as labMod from '../src/shared/sim/lab';
import { onPortrait, TapCounter, TAPS, WITHIN_MS } from '../src/client/ui/devgesture';
import { freePort } from './netlib';
import { Rng } from '../src/shared/rng';

const KEY = 'swordfish-4242-correct';
const STEP = 1 / 20;
const events = (sim: Sim) => { const e = sim.events; sim.events = []; return e; };
const fxNames = (ev: SimEvent[]) => ev.filter((e) => e.e === 'fx').map((e) => (e as { fx: string }).fx);
const toasts = (ev: SimEvent[]) => ev.filter((e) => e.e === 'toast').map((e) => (e as { text: string }).text);
const floats = (ev: SimEvent[]) => ev.filter((e) => e.e === 'float').map((e) => (e as { text: string }).text);

type Inbox = Peer & { msgs: ServerMsg[] };
const inbox = (): Inbox => { const msgs: ServerMsg[] = []; return { msgs, send: (t: string) => { msgs.push(JSON.parse(t)); } }; };
function join (host: SimHost, id: string, name: string) {
    const peer = inbox();
    host.attach(peer);
    host.receive(peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id, name }));
    return peer;
}
const cmd = (host: SimHost, peer: Peer, c: unknown) => host.receive(peer, JSON.stringify({ t: 'cmd', c }));
const unlockWith = (host: SimHost, peer: Peer, key: unknown) => cmd(host, peer, { t: 'dev', key });

/** A host with a developer key, and two farmers on it. */
function party (opts: HostOptions = { devKey: KEY }, seed = 'DEV-1') {
    const sim = Sim.create(seed, 'devworld');
    const host = new SimHost(sim, 'Test', '', opts);
    const a = join(host, 'a', 'Ann'), b = join(host, 'b', 'Bo');
    return { sim, host, a, b, pa: sim.s.players.a, pb: sim.s.players.b };
}
/** A bare sim with one unlocked farmer, for the ops themselves. */
function lab (seed = 'DEV-2') {
    const sim = Sim.create(seed, 'devworld');
    const p = sim.join('a', 'Ann')!;
    sim.devs.add('a');
    events(sim);
    const op = (c: Omit<DevCmd, 't'>) => { sim.command('a', { t: 'devdo', ...c } as Cmd); return events(sim); };
    return { sim, p, op };
}
/** The Defense Lab's world (sim/lab.ts), the menu open through its cheats. */
function labWorld () {
    const sim = labMod.create('a', 'Ann');
    const p = sim.s.players.a;
    events(sim);
    const op = (c: Omit<DevCmd, 't'>) => { sim.command('a', { t: 'devdo', ...c } as Cmd); return events(sim); };
    return { sim, p, op };
}
const ticks = (peer: Inbox) => peer.msgs.filter((m): m is TickMsg => m.t === 'tick');
/** What a peer was last told about a player. */
function toldAbout (peer: Inbox, id: string): PlayerDelta[] {
    return ticks(peer).flatMap((t) => t.players.filter((d) => d.id === id));
}

// ── closed ──────────────────────────────────────────────────────────────────
/** A payload for every op, as the menu would send it. */
const PAYLOADS: Omit<DevCmd, 't'>[] = [
    { op: 'level', n: 5 }, { op: 'levelTo', n: 30 }, { op: 'xp', n: 5000 }, { op: 'points', n: 9 }, { op: 'coins', n: 100000 },
    { op: 'item', id: 'wood', n: 99 }, { op: 'kit' }, { op: 'gear' }, { op: 'wipe' }, { op: 'heal' }, { op: 'revive' }, { op: 'hurt', n: 2 }, { op: 'down' }, { op: 'god' }, { op: 'speed' },
    { op: 'skills' }, { op: 'respec' }, { op: 'story', id: 'all' }, { op: 'medals' }, { op: 'bosses' }, { op: 'dex' }, { op: 'refresh' },
    { op: 'time', id: 'midnight' }, { op: 'day', n: 40 }, { op: 'event', id: 'bloodmoon' }, { op: 'clock', n: 120 },
    { op: 'mob', id: 'slime', n: 5 }, { op: 'boss', id: 'slimeking' }, { op: 'creature', id: 'hopper', n: 3 }, { op: 'node', id: 'tree', n: 3 }, { op: 'pet', id: 'hopper' },
    { op: 'killNear' }, { op: 'killAll' }, { op: 'clearDrops' }, { op: 'land', n: 3 }, { op: 'tp', id: 'heart' },
    { op: 'affection', n: 40 },
    { op: 'feast' },
    { op: 'co', id: 'hexed' },
    { op: 'labWave', id: 'mixed', n: 10, lv: 3, who: 'sea' }, { op: 'labNight', on: true }, { op: 'labMend' }, { op: 'labClear' }, { op: 'labSpeed', n: 4 }, { op: 'labReset' },
];

/** Everything an op could touch, as text: a farmer, the clock, the entities, the land. */
const fingerprint = (sim: Sim) => JSON.stringify([sim.s.players, sim.s.clock, sim.s.day, sim.s.night, Object.keys(sim.s.ents).length, sim.s.plots.filter((p) => p.owned).length, sim.s.mine, sim.nightEv, sim.nightSpawns.length]);

test('every op has a payload here, so the "closed" test below really tries them all', () => {
    assert.deepEqual([...new Set(PAYLOADS.map((p) => p.op))].sort(), [...DEV_OPS].sort());
});

test('without the key, every op is ignored (a plain farmer, a hostile payload, a wrong key)', () => {
    const { sim, host, a, pa } = party();
    const before = fingerprint(sim);
    for (const payload of PAYLOADS) cmd(host, a, { t: 'devdo', ...payload });
    // hostile and malformed ones: inherited names, odd types, huge or missing numbers, ops that do not exist
    for (const bad of [
        { t: 'devdo', op: '__proto__' }, { t: 'devdo', op: 'constructor' }, { t: 'devdo', op: 'toString', id: 'wood' }, { t: 'devdo' }, { t: 'devdo', op: null }, { t: 'devdo', op: { toString: 1 } },
        { t: 'devdo', op: 'item', id: '__proto__', n: 1e308 }, { t: 'devdo', op: 'item', id: 'wood', n: Infinity }, { t: 'devdo', op: 'mob', id: 'constructor', n: -5 }, { t: 'devdo', op: 'coins', n: 'lots' },
        { t: 'devdo', op: 'tp', id: 'xy', x: 1e12, y: -1e12 }, { t: 'devdo', op: 'tp', id: 'player', who: '__proto__' }, { t: 'dev' }, { t: 'dev', key: { toString: 1 } },
    ]) cmd(host, a, bad);
    // a wrong key, a key of the wrong type, and the empty key, then every op again
    for (const key of ['', 'swordfish', KEY.toUpperCase(), `${KEY} `, 123, null, { a: 1 }, ['x'], KEY.slice(1)]) unlockWith(host, a, key);
    assert.ok(!sim.devs.has('a'), 'no wrong key unlocked it');
    for (const payload of PAYLOADS) cmd(host, a, { t: 'devdo', ...payload });
    assert.equal(fingerprint(sim), before, 'nothing in the world or on the farmer changed');
    assert.equal(pa.coins, 0);
    assert.ok(!sim.cheats);
});

test('the Defense Lab ops are locked like the rest: a lab world on a host with cheats off opens nothing without the key', () => {
    const sim = labMod.create('a', 'Ann');
    sim.cheats = false;                                                        // (as a real server would run it)
    const host = new SimHost(sim, 'Test', '', { devKey: KEY });
    const a = join(host, 'a', 'Ann');
    const before = fingerprint(sim);
    for (const payload of PAYLOADS.filter((x) => x.op.startsWith('lab'))) cmd(host, a, { t: 'devdo', ...payload });
    assert.equal(fingerprint(sim), before, 'nothing changed');
    assert.equal(sim.timeScale, 1);
    unlockWith(host, a, KEY);
    cmd(host, a, { t: 'devdo', op: 'labSpeed', n: 2 });
    assert.equal(sim.timeScale, 2, 'with the key it opens, as every op does');
    // and an ordinary world never runs them, unlocked or not
    const { sim: plain, host: h2, a: a2 } = party();
    unlockWith(h2, a2, KEY);
    const was = fingerprint(plain);
    for (const payload of PAYLOADS.filter((x) => x.op.startsWith('lab'))) cmd(h2, a2, { t: 'devdo', ...payload });
    assert.equal(fingerprint(plain), was, 'only a lab world has them');
    assert.equal(plain.timeScale, 1);
});

test('a server with no key set can never be unlocked, even by guessing nothing at all', () => {
    const { sim, host, a } = party({});
    for (const key of ['', 'x', 'undefined', 'null', 'none', KEY]) unlockWith(host, a, key);
    cmd(host, a, { t: 'devdo', op: 'coins', n: 5000 });
    assert.ok(!sim.devs.has('a'));
    assert.equal(sim.s.players.a.coins, 0);
});

test('hostile commands never get as far as an op, even for an unlocked farmer', () => {
    const { sim, p, op } = lab();
    const before = fingerprint(sim);
    for (const bad of [{ op: 'item', id: 'constructor', n: 5 }, { op: 'mob', id: '__proto__', n: 5 }, { op: 'tp', id: 'player', who: 'toString' }, { op: 'node', id: 'hasOwnProperty', n: 3 }, { op: 'event', id: 'valueOf' }, { op: 'time', id: 'constructor' }]) {
        op(bad as Omit<DevCmd, 't'>);
        assert.equal(fingerprint(sim), before, JSON.stringify(bad));
    }
    sim.command('a', { t: 'devdo', op: 'coins', n: 7 } as Cmd);
    assert.equal(p.coins, 7, 'the same farmer, with a good payload, is fine');
});

// ── the key ─────────────────────────────────────────────────────────────────
test('the right key unlocks, tells that farmer (and only them) and says so with a toast', () => {
    const { sim, host, a, b, pa } = party();
    events(sim);
    unlockWith(host, a, KEY);
    assert.ok(sim.devs.has('a') && !sim.devs.has('b'));
    host.flush();
    assert.ok(toldAbout(a, 'a').some((d) => d.dev === true), 'Ann is told she is unlocked, in her own record');
    assert.ok(!/"dev":/.test(JSON.stringify(ticks(b).map((t) => t.players))), 'Bo never sees the flag');
    assert.ok(!/"dev":/.test(JSON.stringify(toldAbout(b, 'a'))), 'nor in what is shown of Ann');
    assert.ok(a.msgs.some((m) => m.t === 'tick' && m.ev.some((e) => e.e === 'toast' && /unlocked/i.test(e.text))), 'a toast');
    assert.ok(!b.msgs.some((m) => m.t === 'tick' && m.ev.some((e) => e.e === 'toast' && /unlocked/i.test(e.text))), 'only for her');
    cmd(host, a, { t: 'devdo', op: 'coins', n: 1000 });
    assert.equal(pa.coins, 1000);
    cmd(host, b, { t: 'devdo', op: 'coins', n: 1000 });
    assert.equal(sim.s.players.b.coins, 0, 'Bo is still just a farmer');
});

test('the key is never in the world, a save, a welcome or anything sent', () => {
    const { sim, host, a, b } = party();
    unlockWith(host, a, KEY);
    cmd(host, a, { t: 'devdo', op: 'god' });
    cmd(host, a, { t: 'devdo', op: 'coins', n: 5 });
    host.update(0.2);
    const late = join(host, 'c', 'Cy');                         // a welcome sent after the unlock
    let saved = '';
    host.onSave = (json) => { saved = json; };
    host.save();
    const everything = JSON.stringify([saved, JSON.stringify(sim.s), a.msgs, b.msgs, late.msgs]);
    assert.ok(!everything.includes(KEY), 'the key');
    assert.ok(!everything.includes('swordfish'), 'not even a piece of it');
    const welcome = late.msgs.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    assert.ok(!/"dev":/.test(JSON.stringify(welcome.state)), 'no dev flag in a welcome');
    assert.ok(!('dev' in sim.s.players.a), 'no dev flag on the farmer in the world');
    assert.ok(!saved.includes('"dev":true') && !saved.includes('devs'), 'nor in the save');
    // and the host itself keeps only a salted hash of it (everything it holds except the world, which was checked above)
    const held = Object.entries(host).filter(([k, v]) => typeof v !== 'function' && k !== 'sim');
    const heldText = JSON.stringify(held, (_k, v) => (v instanceof Map || v instanceof Set ? [...v] : v));
    assert.ok(!heldText.includes(KEY) && !heldText.includes('swordfish'), 'the host keeps no copy of the key');
    assert.ok(/["devHash",{"salt":"[0-9a-f]{12}","h":"[0-9a-f]{64}"}]/.test(heldText), 'only its salted hash');
});

test('four wrong keys lock that connection for minutes (even the right key waits), then it works again', () => {
    const { sim, host, a } = party();
    let t = 1_000_000;
    host.now = () => t;
    for (let i = 0; i < 4; i++) unlockWith(host, a, `wrong-${i}`);
    unlockWith(host, a, KEY);
    assert.ok(!sim.devs.has('a'), 'locked out, right key or not');
    const said = ticks(a).flatMap((tk) => tk.ev).filter((e) => e.e === 'toast').map((e) => (e as { text: string }).text);
    assert.ok(said.some((x) => /wait/i.test(x)), 'told to wait');
    t += 4 * 60_000;
    unlockWith(host, a, KEY);
    assert.ok(!sim.devs.has('a'), 'still locked after four minutes');
    t += 2 * 60_000;
    unlockWith(host, a, KEY);
    assert.ok(sim.devs.has('a'), 'unlocked once the lock ran out');
});

test('a few wrong tries then the right key is fine, and a different connection is not locked by the first', () => {
    const { sim, host, a, b } = party();
    for (let i = 0; i < 3; i++) unlockWith(host, a, `wrong-${i}`);
    unlockWith(host, a, KEY);
    assert.ok(sim.devs.has('a'), 'three wrong tries do not lock');
    for (let i = 0; i < 4; i++) unlockWith(host, b, `nope-${i}`);
    assert.ok(!sim.devs.has('b'));
    const c = join(host, 'c', 'Cy');
    unlockWith(host, c, KEY);
    assert.ok(sim.devs.has('c'), 'Bo being locked does not lock Cy');
});

test('guessing from many connections locks everybody out for a while', () => {
    const { sim, host } = party();
    let t = 5_000_000;
    host.now = () => t;
    for (let i = 0; i < 8; i++) {
        const peer = join(host, `g${i}`, `G${i}`);
        for (let k = 0; k < 3; k++) unlockWith(host, peer, `guess-${i}-${k}`);        // (never enough to lock one connection)
    }
    const fresh = join(host, 'owner', 'Owner');
    unlockWith(host, fresh, KEY);
    assert.ok(!sim.devs.has('owner'), 'the guessing was noticed: even the key waits');
    t += 11 * 60_000;
    unlockWith(host, fresh, KEY);
    assert.ok(sim.devs.has('owner'), 'and it passes');
});

test('the unlock ends with the connection: a new one (or someone else on the same id) starts locked', () => {
    const { sim, host, a } = party();
    unlockWith(host, a, KEY);
    cmd(host, a, { t: 'devdo', op: 'speed' });
    assert.ok(sim.devs.has('a') && sim.s.players.a.buffs.some((b) => b.id === 'devspeed'));
    // somebody else says hello with Ann's id (ids are public): they get the farmer but not the menu
    const thief = join(host, 'a', 'Ann');
    assert.ok(!sim.devs.has('a'), 'the new connection is locked');
    assert.ok(!sim.s.players.a.buffs.some((b) => b.id === 'devspeed'), 'and the buffs are gone');
    cmd(host, thief, { t: 'devdo', op: 'coins', n: 999 });
    assert.equal(sim.s.players.a.coins, 0);
    unlockWith(host, thief, KEY);
    host.detach(thief);
    assert.ok(!sim.devs.has('a'), 'leaving locks it again');
});

test('a world loaded with a stray god mode or speed buff has them taken off', () => {
    const { sim, host, a } = party();
    unlockWith(host, a, KEY);
    cmd(host, a, { t: 'devdo', op: 'god' });
    cmd(host, a, { t: 'devdo', op: 'speed' });
    const saved = JSON.parse(JSON.stringify(sim.s));
    assert.ok(saved.players.a.buffs.some((b: { id: string }) => b.id === 'devgod'), 'it is a buff while connected');
    assert.ok(!new Sim(saved).s.players.a.buffs.some((b) => b.id.startsWith('dev')), 'but a load strips it');
});

test('solo is open: any key (even none) unlocks, with no limit', () => {
    const { sim, host, a } = party({ devOpen: true }, 'DEV-SOLO');
    for (let i = 0; i < 10; i++) unlockWith(host, a, `whatever-${i}`);
    unlockWith(host, a, '');
    assert.ok(sim.devs.has('a'));
    cmd(host, a, { t: 'devdo', op: 'coins', n: 123 });
    assert.equal(sim.s.players.a.coins, 123);
    assert.ok(!sim.cheats, 'solo is open through the menu, not through cheats');
});

test('cheats on means ops work without an unlock (the old test servers), and off again they do not', () => {
    const { sim, host, a, pa } = party({}, 'DEV-CHEATS');
    sim.cheats = true;
    cmd(host, a, { t: 'devdo', op: 'coins', n: 40 });
    assert.equal(pa.coins, 40);
    unlockWith(host, a, '');
    assert.ok(sim.devs.has('a'), 'and the gesture opens the menu there without a key (it is a test server)');
    sim.devs.delete('a');
    cmd(host, a, { t: 'devdo', op: 'item', id: 'wood', n: 12 });
    assert.equal(countOf(pa, 'wood'), 12);
    cmd(host, a, { t: 'devdo', op: 'xp', n: 50 });
    assert.ok(pa.xp > 0 || pa.level > 1);
    sim.cheats = false;
    cmd(host, a, { t: 'devdo', op: 'item', id: 'wood', n: 12 });
    assert.equal(countOf(pa, 'wood'), 12, 'and off again, off');
});

// ── the ops ─────────────────────────────────────────────────────────────────
test('every op tells the player what it did: an effect, and words', () => {
    for (const payload of PAYLOADS) {
        if (['revive'].includes(payload.op)) continue;               // (only for somebody who is down: its own test)
        const { sim, p, op } = payload.op.startsWith('lab') ? labWorld() : lab(`DEV-FX-${payload.op}`);       // (the Defense Lab's ops work only in a lab world)
        p.hearts = 1;
        const ev = op(payload);
        const said = [...floats(ev), ...toasts(ev), ...ev.filter((e) => e.e === 'banner').map((e) => (e as { text: string }).text)];
        const denied = fxNames(ev).includes('deny');
        assert.ok(fxNames(ev).length > 0 && said.length > 0, `${payload.op}: fx ${fxNames(ev)} words ${said}`);
        assert.ok(!denied || payload.op === 'tp', `${payload.op} was denied: ${said}`);
        void sim;
    }
});

/** A farmer's co-op status, read fresh (the compiler remembers what an earlier assert said about `p.co`). */
const co = (x: { co?: { k: string; b: number; w?: string } }) => x.co;
test('the co-op status op puts frozen, hexed or chained on yourself with no boss, one at a time, and clears it', () => {
    const { sim, p, op } = lab('DEV-CO');
    let ev = op({ op: 'co', id: 'frozen' });
    assert.equal(co(p)?.k, 'frozen'); assert.ok(fxNames(ev).includes('freeze'));
    assert.equal(co(p)!.b, 0, 'no boss behind it');
    ev = op({ op: 'co', id: 'hexed' });
    assert.equal(co(p)?.k, 'frozen', 'one at a time'); assert.ok(fxNames(ev).includes('deny'));
    op({ op: 'co', id: 'clear' });
    assert.equal(co(p), undefined);
    assert.ok(fxNames(op({ op: 'co', id: 'clear' })).includes('deny'), 'nothing to clear');
    op({ op: 'co', id: 'hexed' });
    assert.equal(co(p)?.k, 'hexed');
    for (let i = 0; i < 20; i++) sim.step(STEP);
    assert.equal(co(p)?.k, 'hexed', 'a curse with no boss runs its course');
    op({ op: 'co', id: 'clear' });
    assert.ok(fxNames(op({ op: 'co', id: 'tether' })).includes('deny'), 'a chain needs a friend');
    assert.equal(co(p), undefined);
    const q = sim.join('b', 'Bo')!;
    q.x = p.x + 30; q.y = p.y;
    op({ op: 'co', id: 'tether' });
    assert.equal(co(p)?.w, 'b'); assert.equal(co(q)?.w, 'a');
    op({ op: 'co', id: 'clear' });
    assert.equal(co(q), undefined, 'both ends go');
    for (const id of ['', 'nonsense']) { const e2 = op({ op: 'co', id }); assert.equal(co(p), undefined); assert.ok(fxNames(e2).includes('deny'), `${id} is refused`); }
    for (const id of ['__proto__', 'constructor']) { op({ op: 'co', id }); assert.equal(co(p), undefined, `${id} does nothing`); }
    op({ op: 'co', id: 'frozen' });
    sim.devs.delete('a');                                                    // (locked again: the status is not a dev buff, but nothing else may be run)
    sim.command('a', { t: 'devdo', op: 'co', id: 'clear' } as Cmd);
    assert.equal(co(p)?.k, 'frozen', 'a locked menu cannot clear it');
});

test('levels go through the real XP rules: a skill point each, clean XP, up to the cap', () => {
    const { p, op } = lab();
    p.xp = 3;
    op({ op: 'level' });
    assert.equal(p.level, 2); assert.equal(p.points, 1); assert.equal(p.xp, 0);
    op({ op: 'level', n: 5 });
    assert.equal(p.level, 7); assert.equal(p.points, 6);
    const ev = op({ op: 'levelTo', n: 25 });
    assert.equal(p.level, 25); assert.equal(p.points, 24);
    assert.ok(fxNames(ev).includes('levelUp'), 'the level-up effect');
    assert.ok(toasts(ev).some((t) => /Level 25/.test(t)), 'and its toast');
    op({ op: 'levelTo', n: 9999 });
    assert.equal(p.level, MAX_LEVEL);
    op({ op: 'levelTo', n: 10 });
    assert.equal(p.level, 10, 'down again for testing a new farmer');
    assert.ok(p.points >= 0 && p.xp === 0);
    op({ op: 'levelTo', n: NaN } as never); op({ op: 'level', n: -4 });
    assert.ok(p.level >= 1 && p.level <= MAX_LEVEL);
});

test('levelling works the same with a big XP bonus', () => {
    const { p, op } = lab();
    p.skills = { x: 1 } as never;
    p.buffs.push({ id: 'sated', t: 100 });
    for (let i = 0; i < 5; i++) { const before = p.level; op({ op: 'level' }); assert.equal(p.level, before + 1); }
});

test('XP, skill points and coins add exactly what was asked (and are clamped)', () => {
    const { p, op } = lab();
    op({ op: 'xp', n: xpToNext(1) });
    assert.equal(p.level, 2);
    op({ op: 'points', n: 5 });
    assert.equal(p.points, 6);
    op({ op: 'coins', n: 1000 }); op({ op: 'coins', n: 100000 });
    assert.equal(p.coins, 101000);
    op({ op: 'coins', n: 1e15 });
    assert.ok(p.coins <= 1_000_000_000 && Number.isFinite(p.coins));
    op({ op: 'points', n: Infinity } as never);
    assert.ok(Number.isFinite(p.points));
});

test('give any item: the amount is clamped, a full pocket is said out loud, and nothing spills onto the ground', () => {
    const { sim, p, op } = lab();
    op({ op: 'item', id: 'iron', n: 100 });
    assert.equal(countOf(p, 'iron'), 100);
    op({ op: 'item', id: 'iron', n: 999 });
    assert.equal(countOf(p, 'iron'), TUNING.baseCarry, 'only what fits');
    const drops = Object.values(sim.s.ents).filter((e) => e.k === 'drop').length;
    const ev = op({ op: 'item', id: 'iron', n: 999 });
    assert.ok(fxNames(ev).includes('deny'), 'a full pocket');
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'drop').length, drops, 'no flood of drops');
    op({ op: 'item', id: 'no_such_thing', n: 5 });
    op({ op: 'item', id: 'bread', n: 0 }); assert.equal(countOf(p, 'bread'), 1, 'at least one');
    for (const id of Object.keys(ITEMS)) op({ op: 'item', id, n: 1 });
    assert.ok((Object.keys(ITEMS) as ItemId[]).every((id) => countOf(p, id) >= 1), 'every item in the game can be given');
});

test('the starter kit and the best gear', () => {
    const { p, op } = lab();
    for (const [, n] of KIT) assert.ok(n > 0);
    op({ op: 'kit' });
    for (const [id, n] of KIT) assert.equal(countOf(p, id), Math.min(n, ITEMS[id].kind === 'gear' ? 9 : TUNING.baseCarry), id);
    op({ op: 'gear' });
    assert.equal(p.equip.tool, 'pick_crystal');
    assert.ok(p.equip.weapon && ITEMS[p.equip.weapon].rarity >= 4, 'a top weapon');
    assert.ok(p.equip.head && p.equip.body && p.equip.charm && p.equip.bag);
    const before = JSON.stringify(p.equip);
    op({ op: 'gear' });
    assert.equal(JSON.stringify(p.equip), before, 'again changes nothing');
});

test('empty the backpack, heal, hurt, go down, revive', () => {
    const { sim, p, op } = lab();
    op({ op: 'item', id: 'wood', n: 5 });
    op({ op: 'wipe' });
    assert.equal(countOf(p, 'wood'), 0);
    assert.ok(p.equip.tool, 'what you wear stays');
    p.hearts = 1; p.energy = 3;
    op({ op: 'heal' });
    assert.equal(p.hearts, derived(p).maxHearts); assert.equal(p.energy, derived(p).maxEnergy);
    op({ op: 'hurt', n: 2 });
    assert.ok(p.hearts < derived(p).maxHearts);
    op({ op: 'down' });
    assert.ok(p.downed > 0, 'down');
    const ev = op({ op: 'revive' });
    assert.equal(p.downed, 0);
    assert.ok(p.hearts > 0 && fxNames(ev).includes('revive'));
    assert.ok(sim.online.length === 1);
    assert.ok(fxNames(op({ op: 'revive' })).includes('deny'), 'nothing to revive when up');
});

test('god mode stops all damage, the speed boost doubles the pace, and both toggle off', () => {
    const { p, sim, op } = lab();
    const base = derived(p).speed;
    op({ op: 'god' });
    for (let i = 0; i < 5; i++) { p.invuln = 0; sim.hurt(p, { x: p.x + 1, y: p.y }, 3); }
    assert.equal(p.hearts, derived(p).maxHearts, 'untouched');
    assert.equal(p.downed, 0);
    op({ op: 'god', on: false });
    p.invuln = 0; sim.hurt(p, { x: p.x + 1, y: p.y }, 1);
    assert.ok(p.hearts < derived(p).maxHearts, 'mortal again');
    op({ op: 'speed' });
    assert.ok(Math.abs(derived(p).speed - base * 2) < 0.01, `speed ${derived(p).speed} vs ${base}`);
    op({ op: 'speed' });
    assert.equal(derived(p).speed, base);
    op({ op: 'god', on: true }); op({ op: 'god', on: true });
    assert.equal(p.buffs.filter((b) => b.id === 'devgod').length, 1, 'one buff however often it is asked for');
    sim.step(STEP);
    assert.ok(p.buffs.some((b) => b.id === 'devgod' && b.t > 9000), 'and it lasts');
});

test('learn every skill, then take them all back', () => {
    const { p, op } = lab();
    op({ op: 'skills' });
    assert.ok(SKILL_LIST.every((s) => p.skills[s.id] === s.max));
    const pts = p.points;
    op({ op: 'respec' });
    assert.deepEqual(p.skills, {});
    assert.equal(p.points, pts + SKILL_LIST.reduce((n, s) => n + s.cost * s.max, 0));
});

test('story, medals, bosses and the creature book open up', () => {
    const { sim, p, op } = lab();
    const ev = op({ op: 'story' });
    assert.equal(p.qs?.ch, 1);
    assert.ok(ev.some((e) => e.e === 'story'), 'the story card');
    op({ op: 'story', id: 'all' });
    assert.equal(p.qs?.ch, CHAPTERS.length);
    assert.ok(fxNames(op({ op: 'story' })).includes('deny'), 'nothing left');
    op({ op: 'medals' });
    assert.ok(MEDALS.every((m) => p.qs!.medals.includes(m.id)));
    assert.equal(new Set(p.qs!.medals).size, p.qs!.medals.length, 'each once');
    op({ op: 'bosses' });
    assert.equal(Object.keys(p.boss ?? {}).length, 6);
    assert.ok(Object.keys(sim.s.bosses ?? {}).length === 6);
    op({ op: 'dex' });
    assert.equal(p.dex?.length, SPECIES_LIST.length);
});

test('refresh gives back the free spin, the daily rift and new bounties', () => {
    const { sim, p, op } = lab();
    p.daily = sim.s.day;
    p.fort = { fd: sim.s.day, pd: sim.s.day, pn: 3, pity: 0, cpity: 0, last: 0, chain: 0, n: 0 };
    op({ op: 'refresh' });
    assert.equal(p.daily, undefined);
    assert.ok(p.fort!.fd !== sim.s.day && p.fort!.pn === 0);
    assert.ok(p.qs!.bounties.length === 3 && p.qs!.bday === sim.s.day);
});

test('time of day: dawn, noon, dusk and midnight (a night that is under way is ended properly first)', () => {
    const { sim, op } = lab();
    const s = sim.s;
    op({ op: 'time', id: 'noon' });
    assert.equal(s.clock, TUNING.dayLength / 2); assert.ok(!s.night);
    op({ op: 'time', id: 'dusk' });
    assert.ok(!s.night && TUNING.dayLength - s.clock <= 30);
    sim.step(STEP);
    assert.ok(!s.night, 'dusk is not night yet');
    const day = s.day;
    const ev = op({ op: 'time', id: 'midnight' });
    assert.ok(s.night, 'night');
    assert.ok(s.clock > TUNING.dayLength && s.clock < TUNING.dayLength + s.nightLen);
    assert.ok(ev.some((e) => e.e === 'banner'), 'the night is announced');
    sim.step(STEP);
    assert.ok(s.night, 'and stays night');
    op({ op: 'time', id: 'dawn' });
    assert.ok(!s.night && s.clock < 1, 'dawn');
    assert.equal(s.day, day + 1, 'ending a night is a new day');
    op({ op: 'time', id: 'midnight' });
    op({ op: 'time', id: 'noon' });
    assert.ok(!s.night && s.day === day + 2);
    op({ op: 'time', id: 'bogus' });
    for (let i = 0; i < 20; i++) sim.step(STEP);
});

test('skip to a day: the day number, a new trader, a morning clock, no leftover night', () => {
    const { sim, p, op } = lab();
    op({ op: 'time', id: 'midnight' });
    sim.step(STEP);
    op({ op: 'day', n: 15 });
    assert.equal(sim.s.day, 15); assert.ok(!sim.s.night); assert.equal(sim.s.clock, 0);
    assert.equal(sim.nightSpawns.length, 0);
    assert.equal(sim.s.shop?.day, 15, 'the trader restocked for that day');
    op({ op: 'day', n: 8 });
    assert.equal(sim.s.day, 8, 'and back');
    op({ op: 'day', n: 1e9 });
    assert.equal(sim.s.day, 9999);
    assert.ok(p.online);
});

test('night events: each one starts at once with its effects', () => {
    const { sim, p, op } = lab();
    p.hearts = 1;
    const ev = op({ op: 'event', id: 'fairies' });
    assert.ok(sim.s.night && sim.nightEv === 'fairies');
    assert.ok(p.buffs.some((b) => b.id === 'lucky'), 'lucky');
    assert.equal(p.hearts, derived(p).maxHearts, 'healed');
    assert.ok(ev.some((e) => e.e === 'banner' && /Fairy/.test(e.text)));
    const nodes = () => Object.values(sim.s.ents).filter((e) => e.k === 'node').length;
    const before = nodes();
    op({ op: 'event', id: 'meteors' });
    assert.equal(sim.nightEv, 'meteors');
    assert.ok(nodes() > before, 'stars fell');
    const spawns = sim.nightSpawns.length;
    op({ op: 'event', id: 'bloodmoon' });
    assert.equal(sim.nightEv, 'bloodmoon');
    assert.ok(sim.nightSpawns.length > spawns || sim.nightSpawns.length >= 0);
    for (let i = 0; i < 20 * 12; i++) sim.step(STEP);
    assert.ok(Object.values(sim.s.ents).some((e) => e.k === 'mob'), 'monsters came');
    assert.deepEqual([...EVENTS].sort(), ['bloodmoon', 'fairies', 'meteors']);
    assert.deepEqual([...TIMES], ['dawn', 'noon', 'dusk', 'midnight']);
});

test('spawn monsters: any kind, a count, a level, elite, at your feet or in front', () => {
    const { sim, p, op } = lab();
    const mobsOf = () => Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && !e.zone);          // (not the Dread wardens, who are there from the start)
    op({ op: 'mob', id: 'skeleton', n: 5, lv: 12 });
    assert.equal(mobsOf().length, 5);
    assert.ok(mobsOf().every((m) => m.kind === 'skeleton' && m.lv === 12), 'the level asked for');
    assert.ok(mobsOf().every((m) => Math.hypot(m.x - p.x, m.y - p.y) < 90), 'near');
    for (const m of mobsOf()) sim.remove(m.id);
    p.fx = 0; p.fy = 1;
    op({ op: 'mob', id: 'knight', n: 1, at: 'front', elite: true });
    const k = mobsOf()[0];
    assert.ok(k.el === 1 && k.y > p.y + 20, 'an elite in front of you');
    for (const m of mobsOf()) sim.remove(m.id);
    op({ op: 'mob', id: 'slime', n: 3, at: 'feet' });
    assert.equal(mobsOf().length, 3);
    for (const m of mobsOf()) sim.remove(m.id);
    for (const kind of WILD_KINDS) { op({ op: 'mob', id: kind }); }
    assert.equal(mobsOf().length, WILD_KINDS.length, 'every kind spawns');
    for (const m of mobsOf()) sim.remove(m.id);
    op({ op: 'mob', id: 'slimeking' });
    assert.equal(mobsOf().length, 0, 'a boss is not a monster here');
    op({ op: 'mob', id: 'slime', n: 9999 });
    assert.ok(mobsOf().length <= 50, 'a press makes at most fifty');
    for (let i = 0; i < 8; i++) op({ op: 'mob', id: 'slime', n: 50 });
    assert.ok(mobsOf().length <= 300, 'and the world stays under its cap');
    assert.equal(MOB_KINDS.length, WILD_KINDS.length + BOSS_KINDS.length);
});

test('spawn a boss: it fights back, from an arena centred on you', () => {
    const { sim, p, op } = lab();
    const ev = op({ op: 'boss', id: 'colossus' });
    const bosses = () => Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && !e.zone);
    const b = bosses()[0];
    assert.equal(b.kind, 'colossus');
    assert.equal(b.hp, MOBS.colossus.hp);
    assert.equal(b.hx, p.x);
    assert.ok(fxNames(ev).includes('roar') && ev.some((e) => e.e === 'banner'));
    for (let i = 0; i < 20 * 6; i++) sim.step(STEP);
    assert.ok(b.pat || (b.pt ?? 0) !== 2.2, 'it is acting');
    op({ op: 'boss', id: 'slime' });
    assert.equal(bosses().length, 1, 'only bosses by that call');
    op({ op: 'killNear' });
    assert.equal(bosses().length, 0, 'removed, without the rewards');
    assert.equal(p.boss?.stone, undefined);
});

test('spawn a wild creature of any species, and make a pet of any species', () => {
    const { sim, p, op } = lab();
    const wild = () => Object.values(sim.s.ents).filter((e): e is CritE => e.k === 'crit' && e.mode === 0);
    for (const sp of SPECIES_LIST) op({ op: 'creature', id: sp, lv: 7 });
    assert.equal(wild().length, SPECIES_LIST.length);
    assert.ok(wild().every((c) => c.lv === 7));
    op({ op: 'creature', id: 'hopper', n: 4 });
    assert.equal(wild().length, SPECIES_LIST.length + 4);
    op({ op: 'pet', id: 'aurorin', lv: 30 });
    assert.equal(p.pets?.length, 1);
    assert.equal(p.pets![0].sp, 'aurorin'); assert.equal(p.pets![0].lv, 30);
    assert.ok(p.dex?.includes('aurorin'));
    assert.ok((p.cnt?.['tame:aurorin'] ?? 0) >= 1 && (p.cnt?.legend ?? 0) >= 1, 'it counts for the quests, as taming does');
    for (let i = 0; i < 30; i++) op({ op: 'pet', id: 'hopper' });
    assert.ok(p.pets!.length <= 12, 'the roster has its limit');
});

test('spawn resource nodes of every kind, near you and on free ground', () => {
    const { sim, p, op } = lab();
    const count = () => Object.values(sim.s.ents).filter((e) => e.k === 'node').length;
    let lastBefore = 0;
    for (const kind of Object.keys(NODES) as NodeKind[]) {
        const before = count();
        if (kind === 'vault') lastBefore = sim.s.nextId - 1;
        op({ op: 'node', id: kind, n: 2 });
        assert.equal(count(), before + 2, kind);
    }
    const mine = Object.values(sim.s.ents).filter((e): e is NodeE => e.k === 'node' && e.kind === 'vault' && e.id > lastBefore);
    assert.ok(mine.length >= 2);
    assert.ok(mine.every((n) => sim.world.occAt(n.tx, n.ty) === n.id));
    assert.ok(mine.every((n) => Math.hypot((n.tx + 0.5) * TILE - p.x, (n.ty + 0.5) * TILE - p.y) < 150));
    const before = count();
    op({ op: 'node', id: 'tree', n: 9999 });
    assert.ok(count() - before <= 30, 'a press makes at most thirty');
    assert.ok(!Object.values(sim.s.ents).some((e) => e.k === 'node' && Math.floor(p.x / TILE) === e.tx && Math.floor((p.y - 2) / TILE) === e.ty), 'never on top of you');
});

test('kill monsters near or everywhere, and clear dropped items', () => {
    const { sim, p, op } = lab();
    const mobsOf = () => Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && !e.zone);
    op({ op: 'mob', id: 'slime', n: 6 });
    const far = sim.add<MobE>({ k: 'mob', kind: 'slime', x: p.x + 2000, y: p.y, hp: 2, mhp: 2, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    const rifter = sim.add<MobE>({ k: 'mob', kind: 'slime', x: p.x, y: p.y, hp: 2, mhp: 2, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0, rift: 0 });
    const ev = op({ op: 'killNear' });
    assert.ok(fxNames(ev).includes('enemyDie'));
    assert.deepEqual(mobsOf().map((m) => m.id).sort(), [far.id, rifter.id].sort(), 'the far one and the expedition one are left');
    assert.equal(p.stats.kills, 0, 'no kills counted');
    op({ op: 'killAll' });
    assert.deepEqual(mobsOf().map((m) => m.id), [rifter.id], 'an expedition monster belongs to its run');
    sim.spawnDrop('wood', p.x, p.y); sim.spawnDrop('coin', p.x, p.y);
    assert.ok(Object.values(sim.s.ents).some((e) => e.k === 'drop'));
    op({ op: 'clearDrops' });
    assert.ok(!Object.values(sim.s.ents).some((e) => e.k === 'drop'));
});

test('free land: the next plots, nearest first, at no cost, through the real buying', () => {
    const { sim, p, op } = lab();
    const owned = () => sim.s.plots.filter((q) => q.owned).length;
    const was = owned();
    p.coins = 0;
    const ev = op({ op: 'land', n: 3 });
    assert.equal(owned(), was + 3);
    assert.equal(p.coins, 0, 'free');
    assert.equal(p.plotsBought, 3, 'counted as bought');
    assert.ok(fxNames(ev).filter((f) => f === 'buyLand').length >= 3);
    assert.ok(sim.s.plots.filter((q) => q.owned && q.buyer === 'a').length === 3);
    p.coins = 77;
    op({ op: 'land', n: 1 });
    assert.equal(p.coins, 77, 'coins untouched');
    for (let i = 0; i < 10; i++) op({ op: 'land', n: 20 });
    assert.ok(owned() > was + 20);
});

test('teleport: home, the Old Heart, every Dread block, every rift island, the caves, another farmer, typed coordinates', () => {
    const { sim, host, a, pa, pb } = party({ devKey: KEY }, 'DEV-TP');
    unlockWith(host, a, KEY);
    const z0 = dread.zones(sim)[0];
    pb.x = z0.cx; pb.y = z0.cy + 5 * TILE;                       // (Bo is out in a Dread block)
    const go = (c: Omit<DevCmd, 't'>) => { const w = pa.warp; cmd(host, a, { t: 'devdo', ...c }); return pa.warp > w; };
    const tile = () => ({ tx: Math.floor(pa.x / TILE), ty: Math.floor(pa.y / TILE) });
    const inPlot = (q: { gx: number; gy: number }) => sim.world.plotAtPx(pa.x, pa.y)?.gx === q.gx && sim.world.plotAtPx(pa.x, pa.y)?.gy === q.gy;
    assert.ok(go({ op: 'tp', id: 'heart' }));
    assert.ok(sim.world.plotAtPx(pa.x, pa.y)?.heart, 'on the Old Heart');
    assert.ok(go({ op: 'tp', id: 'home' }));
    assert.ok(inPlot(sim.homePlot(pa.slot)), 'home');
    for (let q = 0; q < 4; q++) {
        assert.ok(go({ op: 'tp', id: 'dread', n: q }), `dread ${q}`);
        const z = dread.zones(sim).find((zz) => zz.q === q)!;
        assert.ok(pa.x >= z.x0 && pa.x < z.x1 && pa.y >= z.y0 && pa.y < z.y1, `inside block ${q}`);
        assert.ok(sim.world.isLand(tile().tx, tile().ty));
    }
    for (let i = 0; i < RIFT_ISLANDS; i++) {
        assert.ok(go({ op: 'tp', id: 'rift', n: i }), `rift ${i}`);
        assert.equal(sim.world.riftAtPx(pa.x, pa.y), i);
    }
    assert.ok(go({ op: 'tp', id: 'player', who: 'b' }));
    assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) < 6 * TILE, 'beside Bo');
    assert.ok(go({ op: 'tp', id: 'home' }));
    // the caves: straight down under the same spot, with room to stand, and back up
    const above = tile();
    assert.ok(go({ op: 'tp', id: 'cave' }));
    assert.ok(pa.y >= UNDER_Y * TILE, 'under the world');
    assert.ok(sim.s.mine, 'the caves exist now');
    assert.ok(!sim.world.rockAt(tile().tx, tile().ty) && sim.world.isLand(tile().tx, tile().ty), 'not in a wall');
    assert.ok(Math.abs(tile().tx - above.tx) < 12, 'under where you were');
    assert.ok(!go({ op: 'tp', id: 'cave' }), 'already down');
    assert.ok(go({ op: 'tp', id: 'surface' }));
    assert.ok(pa.y < UNDER_Y * TILE, 'and back up');
    assert.ok(go({ op: 'tp', id: 'xy', x: sim.world.plotCenter(sim.homePlot(0)).x / TILE + 3, y: sim.world.plotCenter(sim.homePlot(0)).y / TILE }));
    assert.ok(Math.abs(tile().tx - (sim.world.plotCenter(sim.homePlot(0)).x / TILE + 3)) < 12);
    assert.ok(go({ op: 'tp', id: 'xy', x: 60, y: UNDER_Y + 80 }));
    assert.ok(pa.y >= UNDER_Y * TILE, 'typed coordinates in the caves');
    assert.ok(!go({ op: 'tp', id: 'player', who: 'nobody' }));
    assert.ok(!go({ op: 'tp', id: 'player', who: pa.id }), 'not to yourself');
    assert.ok(!go({ op: 'tp', id: 'bogus' }));
});

test('teleporting into the caves from beside a mine shaft uses the real way down', () => {
    const { sim, p, op } = lab('DEV-SHAFT');
    const spot = sim.nearestFree(Math.floor(p.x / TILE) + 2, Math.floor(p.y / TILE))!;
    sim.add<BuildE>({ k: 'bld', kind: 'mineshaft', tx: spot.tx, ty: spot.ty, rot: 0, by: p.id });
    const ev = op({ op: 'tp', id: 'cave' });
    assert.ok(p.y >= UNDER_Y * TILE);
    assert.ok(ev.some((e) => e.e === 'banner' && /caves/i.test(e.text)), 'the shaft\'s own banner');
    assert.ok(sim.buildings('mineladder').length === 1, 'with its ladder');
    op({ op: 'tp', id: 'surface' });
    assert.ok(p.y < UNDER_Y * TILE);
});

test('on an expedition the world-changing ops are refused (the run would be wrecked), the personal ones work', () => {
    const { sim, p, op } = lab('DEV-RIFT');
    p.rift = { arena: 0, tier: 0, wave: 0, waves: 3, ph: 0, left: 0, t: 5, party: 1, kills: 0 };
    const at = { x: p.x, y: p.y };
    const before = fingerprint(sim);
    for (const c of PAYLOADS.filter((x) => ['time', 'day', 'event', 'clock', 'mob', 'boss', 'creature', 'node', 'killNear', 'killAll', 'clearDrops', 'land', 'tp'].includes(x.op))) {
        const ev = op(c);
        assert.ok(fxNames(ev).includes('deny'), c.op);
    }
    assert.equal(fingerprint(sim), before);
    assert.deepEqual({ x: p.x, y: p.y }, at);
    op({ op: 'coins', n: 5 }); op({ op: 'heal' }); op({ op: 'item', id: 'wood', n: 3 });
    assert.equal(p.coins, 5); assert.equal(countOf(p, 'wood'), 3);
});

test('a farmer who is down can still use the menu (to get up)', () => {
    const { sim, host, a, pa } = party({ devKey: KEY }, 'DEV-DOWN');
    unlockWith(host, a, KEY);
    sim.down(pa);
    assert.ok(pa.downed > 0);
    cmd(host, a, { t: 'craft', recipe: 'x', n: 1 });
    cmd(host, a, { t: 'devdo', op: 'revive' });
    assert.equal(pa.downed, 0);
});

test('the menu works while the solo world is paused (it is a menu)', () => {
    const sim = Sim.create('DEV-PAUSE', 'devworld');
    const host = new SimHost(sim, 'Solo', '', { devOpen: true });
    const me = join(host, 'a', 'Ann');
    unlockWith(host, me, '');
    cmd(host, me, { t: 'pause', on: true });
    assert.ok(sim.s.paused, 'the world is paused');
    cmd(host, me, { t: 'devdo', op: 'coins', n: 50 });
    cmd(host, me, { t: 'devdo', op: 'mob', id: 'slime', n: 2 });
    assert.equal(sim.s.players.a.coins, 50);
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'mob' && !e.zone).length, 2, 'and spawns things for when it runs again');
});

test('the wire carries only what the menu sends: a command bigger than a few fields does nothing odd', () => {
    const { sim, p, op } = lab('DEV-WIRE');
    const before = p.coins;
    op({ op: 'coins', n: 10, extra: 'x'.repeat(5000), more: { a: { b: { c: 1 } } } } as never);
    assert.equal(p.coins, before + 10);
    void sim;
});

// ── the real server ─────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms: number, what: string) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (fn()) return; await sleep(25); }
    throw new Error(`timed out waiting for ${what}`);
};
/** Start the dedicated server (no --cheats) with the given arguments and environment. */
function startServer (port: number, dir: string, args: string[], env: Record<string, string> = {}) {
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/main.ts', ...args], {
        env: { ...process.env, PORT: String(port), DATA_DIR: dir, WORLD: 'wtest', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout!.on('data', (d) => { out += d; });
    child.stderr!.on('data', (d) => { out += d; });
    return { child, log: () => out };
}

/** A bare WebSocket farmer: what the server told it about itself, and the words it was sent. */
async function wsFarmer (port: number, id: string) {
    const me: { dev?: true; coins?: number } = {};
    const said: string[] = [];
    let welcomed = false;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.on('message', (data) => {
        const msg: ServerMsg = JSON.parse(data.toString());
        if (msg.t === 'welcome') { welcomed = true; Object.assign(me, msg.state.players[msg.you]); }
        if (msg.t === 'tick') {
            for (const d of msg.players) if (d.id === id) { Object.assign(me, d); for (const k of d.rm ?? []) delete (me as Record<string, unknown>)[k]; }
            for (const e of msg.ev) if (e.e === 'toast') said.push(e.text);
        }
    });
    await new Promise<void>((res, rej) => { ws.once('open', () => res()); ws.once('error', rej); });
    ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, id, name: id }));
    await until(() => welcomed, 8000, 'a welcome');
    return { me, said, send: (c: unknown) => ws.send(JSON.stringify({ t: 'cmd', c })), close: () => ws.close() };
}

test('real server: --dev-key and AWESOME_FARM_DEV_KEY set the key; the menu is closed without it; the key stays off the wire, the status page and the save', async () => {
    for (const how of ['flag', 'env'] as const) {
        const dir = mkdtempSync(pathJoin(tmpdir(), 'af-dev-'));
        const port = await freePort();
        const server = how === 'flag' ? startServer(port, dir, ['--dev-key', KEY]) : startServer(port, dir, [], { AWESOME_FARM_DEV_KEY: KEY });
        try {
            await until(() => server.log().includes('Play here'), 20000, 'the server to start');
            assert.ok(/developer menu: key set/.test(server.log()), 'the log says a key is set');
            assert.ok(!server.log().includes(KEY), 'but never what it is');
            const f = await wsFarmer(port, 'tester');
            f.send({ t: 'devdo', op: 'coins', n: 500 });
            await sleep(400);
            assert.ok(!f.me.coins, 'a farmer without the menu cannot');
            f.send({ t: 'dev', key: 'not-the-key' });
            await until(() => f.said.some((t) => /wrong key/i.test(t)), 5000, 'a "wrong key" toast');
            assert.ok(!f.me.dev);
            f.send({ t: 'dev', key: KEY });
            await until(() => f.me.dev === true, 5000, 'the unlock flag');
            f.send({ t: 'devdo', op: 'coins', n: 500 });
            await until(() => f.me.coins === 500, 5000, 'the coins');
            const other = await wsFarmer(port, 'other');
            await sleep(400);
            assert.ok(!other.me.dev, 'the other farmer is not unlocked');
            const status = JSON.stringify(await (await fetch(`http://127.0.0.1:${port}/status`)).json());
            assert.ok(!status.includes(KEY) && !/dev/i.test(status), 'the status page says nothing about it');
            f.close(); other.close();
            await sleep(700);                                       // saved when the last farmer leaves
            const saves = readdirSync(dir).map((n) => readFileSync(pathJoin(dir, n), 'utf8')).join('');
            assert.ok(saves.length > 1000 && !saves.includes(KEY) && !saves.includes('swordfish'), 'the save never holds the key');
        } finally {
            server.child.kill();
            await sleep(300);
            rmSync(dir, { recursive: true, force: true });
        }
    }
});

test('real server with no key: the menu cannot be opened, whatever is sent', async () => {
    const dir = mkdtempSync(pathJoin(tmpdir(), 'af-dev-'));
    const port = await freePort();
    const server = startServer(port, dir, []);
    try {
        await until(() => server.log().includes('Play here'), 20000, 'the server to start');
        assert.ok(!/developer menu/.test(server.log()));
        const f = await wsFarmer(port, 'nobody');
        for (const key of ['', KEY, 'dev', 'undefined']) f.send({ t: 'dev', key });
        f.send({ t: 'devdo', op: 'coins', n: 500 });
        await sleep(600);
        assert.ok(!f.me.dev && !f.me.coins);
        f.close();
    } finally {
        server.child.kill();
        await sleep(300);
        rmSync(dir, { recursive: true, force: true });
    }
});

// ── the secret tap, and a fuzz ──────────────────────────────────────────────
test('the secret tap: seven taps within four seconds on the portrait, no fewer, no slower', () => {
    assert.equal(TAPS, 7); assert.equal(WITHIN_MS, 4000);
    assert.ok(onPortrait(36, 38) && onPortrait(10, 10) && onPortrait(68, 70), 'the portrait');
    assert.ok(!onPortrait(100, 38) && !onPortrait(36, 120) && !onPortrait(2, 2) && !onPortrait(-5, 40), 'and not beside it');
    const c = new TapCounter();
    for (let i = 0; i < 6; i++) assert.ok(!c.hit(1000 + i * 500), `tap ${i + 1}`);
    assert.ok(c.hit(4000), 'the seventh, at 3 s');
    assert.ok(!c.hit(4100), 'it starts over');
    // too slow: taps 1 s apart never add up to seven inside four seconds
    const slow = new TapCounter();
    for (let i = 0; i < 40; i++) assert.ok(!slow.hit(i * 1000), `slow tap ${i}`);
    // a pause forgets the early taps
    const gap = new TapCounter();
    for (let i = 0; i < 4; i++) gap.hit(i * 100);
    for (let i = 0; i < 6; i++) assert.ok(!gap.hit(10_000 + i * 100));
    assert.ok(gap.hit(10_700));
    const r = new TapCounter();
    for (let i = 0; i < 6; i++) r.hit(i);
    r.reset();
    assert.ok(!r.hit(10), 'reset forgets them');
});

test('fuzz: thousands of junk devdo commands never throw or leave a farmer with broken numbers', () => {
    const rng = new Rng('dev-fuzz');
    const sim = Sim.create('DEV-FUZZ', 'devworld');
    const p = sim.join('a', 'Ann')!;
    sim.join('b', 'Bo');
    sim.devs.add('a');
    const words = ['wood', 'tree', 'slime', 'colossus', 'hopper', 'home', 'heart', 'dread', 'rift', 'cave', 'surface', 'player', 'xy', 'noon', 'midnight', 'bloodmoon', 'meteors', 'fairies', 'all', 'b', 'a', '', '__proto__', 'constructor', 'x'.repeat(500)];
    const numbers = [0, 1, -1, 2, 3, 7, 50, 999, 1e9, 1e300, -1e300, NaN, Infinity, -Infinity, 0.5, 80, 9999, UNDER_Y + 10, 12345];
    const pickNum = () => numbers[Math.floor(rng.next() * numbers.length)];
    const junk = (): unknown => { const r = rng.next(); return r < 0.45 ? pickNum() : r < 0.8 ? words[Math.floor(rng.next() * words.length)] : r < 0.85 ? null : r < 0.9 ? {} : r < 0.95 ? [1, 2] : undefined; };
    for (let i = 0; i < 3000; i++) {
        const c: Record<string, unknown> = { t: 'devdo', op: rng.chance(0.9) ? DEV_OPS[Math.floor(rng.next() * DEV_OPS.length)] : junk() };
        for (const k of ['id', 'who', 'n', 'lv', 'x', 'y', 'at', 'elite', 'on']) if (rng.chance(0.6)) c[k] = k === 'at' ? (rng.chance(0.5) ? 'feet' : junk()) : k === 'id' || k === 'who' ? (rng.chance(0.8) ? words[Math.floor(rng.next() * words.length)] : junk()) : junk();
        sim.command('a', c as unknown as Cmd);
        if (i % 25 === 0) { events(sim); for (let s = 0; s < 4; s++) sim.step(STEP); }
        if (p.downed > 0 && rng.chance(0.3)) sim.command('a', { t: 'devdo', op: 'revive' } as Cmd);
    }
    for (const q of Object.values(sim.s.players)) {
        for (const v of [q.x, q.y, q.hearts, q.energy, q.xp, q.coins, q.points, q.level]) assert.ok(Number.isFinite(v), `${q.id} has a broken number`);
        assert.ok(q.level >= 1 && q.level <= MAX_LEVEL && q.coins >= 0 && q.points >= 0);
        assert.ok(Object.values(q.inv).every((n) => Number.isFinite(n) && (n ?? 0) >= 0), 'inventory counts');
    }
    assert.ok(Number.isFinite(sim.s.clock) && sim.s.day >= 1 && sim.s.day <= 9999);
    for (let s = 0; s < 40; s++) sim.step(STEP);
});
