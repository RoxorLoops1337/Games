// Clawspire -- DUO NET (round 15): online co-op (DESIGN.md "Online co-op (round 15)").
//
// Two whole games, headless, talking through the REAL relay worker
// (ironbridge-relay/worker.js, the Durable Object the owner runs for
// Ironbridge and Clawspire both) run in memory: no network, a message queue
// this suite pumps by hand. Covered: the room code and ?join= parsing, a
// partner's profile repaired, the shared enemies' serialize / apply round
// trip and its validation, the lobby (colours kept apart, ready, the go),
// strict turn alternation with the live stream (the claw, the bin, combos)
// and cheers, a seat down, a dropped line coming back (a rejoin, the last
// turn resent and ignored), the retry window running out and Keep fighting
// alone, a reload that asks for the table back ('need' / 'sync'), the team
// win booked on both phones, and the failures: a foreign game on the code,
// another version, an unreachable relay, a code nobody hosts. The local duel
// save and the run save are never touched.
import { boot, harness } from './clawspire_lib.mjs';

const h = harness('clawspire net');
const DT = 1 / 60;

// ---- the relay worker, in memory (the same stand-ins tests/ironbridge_relay.test.mjs uses)
class SrvWS {
  constructor(tag) { this.tag = tag; this.attach = null; this.closed = false; this.readyState = 1; this.cli = null; this.pend = []; }
  send(s) { if (this.closed) throw new Error('closed'); Q.push(() => { if (this.cli && !this.cli.dead) this.cli.recv(s); }); }
  close() { if (this.closed) return; this.closed = true; this.readyState = 3; const c = this.cli; if (c && !c.dead) Q.push(() => c.gone()); }
  serializeAttachment(a) { this.attach = a; }
  deserializeAttachment() { return this.attach; }
}
globalThis.WebSocketPair = function () { const a = new SrvWS('client'), b = new SrvWS('server'); return { 0: a, 1: b }; };
globalThis.Response = class FakeResponse {
  constructor(body, init) { const i = init || {}; this.body = body; this.status = i.status === undefined ? 200 : i.status; this.headers = new Map(Object.entries(i.headers || {})); this.webSocket = i.webSocket; }
  async json() { return JSON.parse(this.body); }
  async text() { return String(this.body); }
};
const mod = await import('../ironbridge-relay/worker.js');
const { Room } = mod, worker = mod.default;
function mkState() {
  const store = new Map(), socks = [];
  return { storage: { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); } }, getWebSockets: () => socks.filter((w) => !w.closed), acceptWebSocket: (ws) => { socks.push(ws); }, __socks: socks };
}
const rooms = new Map();
const roomOf = (code) => { if (!rooms.has(code)) { const st = mkState(); rooms.set(code, { room: new Room(st, {}), st }); } return rooms.get(code); };
const Q = [];
let relayUp = true;
// The page's WebSocket: connects to the worker's room, relays both ways through Q.
class ClientWS {
  constructor(url) {
    this.url = url; this.readyState = 0; this.dead = false; this.srv = null; this.sent = [];
    const u = new URL(url.replace(/^ws/, 'http'));
    const m = /^\/room\/([A-Za-z]+)$/.exec(u.pathname);
    Q.push(async () => {
      if (!relayUp || !m) { this.fail(); return; }
      const R = roomOf(m[1].toUpperCase());
      const res = await R.room.fetch(new Request(u.href, { headers: { Upgrade: 'websocket' } }));
      if (res.status !== 101) { this.fail(); return; }
      this.srv = R.st.__socks[R.st.__socks.length - 1]; this.srv.cli = this; this.room = R.room;
      this.readyState = 1;
      if (this.onopen) this.onopen({});
    });
  }
  fail() { this.readyState = 3; this.dead = true; if (this.onerror) this.onerror({}); if (this.onclose) this.onclose({}); }
  recv(s) { if (!this.dead && this.onmessage) this.onmessage({ data: s }); }
  gone() { if (this.dead) return; this.dead = true; this.readyState = 3; if (this.onclose) this.onclose({}); }
  send(s) { if (this.readyState !== 1) throw new Error('not open'); this.sent.push(s); const srv = this.srv, room = this.room; Q.push(() => (!srv.closed ? room.webSocketMessage(srv, s) : null)); }
  close() { if (this.dead) return; this.dead = true; this.readyState = 3; const srv = this.srv, room = this.room; if (srv && !srv.closed) { srv.closed = true; srv.readyState = 3; Q.push(() => room.webSocketClose(srv)); } }
  // the line drops under the page (a tunnel): the relay sees the close, the page does too
  drop() { const srv = this.srv, room = this.room; this.gone(); if (srv && !srv.closed) { srv.closed = true; srv.readyState = 3; Q.push(() => room.webSocketClose(srv)); } }
}
async function pump() {
  for (let k = 0; k < 20000 && Q.length; k++) { const f = Q.shift(); try { await f(); } catch (e) { console.log('relay:', e && e.message); } }
  await new Promise((r) => setImmediate(r));
}
let clock = 1000;
const fetchRelay = async (url, o) => { if (!relayUp) throw new Error('offline'); const u = new URL(url); return worker.fetch(new Request('https://relay' + u.pathname, { method: (o && o.method) || 'GET' }), {}); };
function wire(T) {
  const N = T._window.NET;
  N.io.WS = ClientWS; N.io.fetch = fetchRelay; N.io.now = () => clock;
  return N;
}
// settle both phones: pump the relay, run their frames
async function settle(Ts, frames) {
  for (let r = 0; r < 6; r++) {
    await pump();
    for (const T of Ts) for (let i = 0; i < (frames || 2); i++) T.GAME.update(DT);
  }
  await pump();
}
const step = (G, s) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) G.update(DT); };
const fightReady = (G) => { const s = G.state(); return s.screen === 'fight' && s.fight && s.fight.phase === 'player' && !s.grabInFlight && !s.enemyTurn && s.queue === 0 && s.rigPhase === 'idle'; };
const fightSettle = (G, secs) => { for (let i = 0; i < (secs || 30) * 60; i++) { if (G.screen !== 'fight' || fightReady(G)) return true; G.update(DT); } return false; };
const atest = async (name, fn) => { try { await fn(); } catch (e) { h.ok(false, name + ' :: ' + (e && e.stack || e)); } };

// ================================================================ pure rules
await atest('codes, ?join= and a partner\'s profile', async () => {
  const T = boot(), D = T.DATA, N = T._window.NET;
  h.eq(D.DUO.NET.ALPHA, 'ABCDEFGHJKLMNPQRSTUVWXYZ', 'the relay\'s alphabet: no I, no O');
  h.eq(D.duoNetCode(' ab-cd '), 'ABCD', 'a typed code is cleaned up');
  h.eq(D.duoNetCode('ABCI'), null, 'I is not in the alphabet');
  h.eq(D.duoNetCode('ABC'), null, 'three letters is no code');
  h.eq(D.duoNetCode('ABCDE'), null, 'five letters is no code');
  h.eq(D.duoNetJoinParam('?join=abcd'), 'ABCD', '?join=abcd');
  h.eq(D.duoNetJoinParam('?lang=nl&join=WX-YZ#top'), 'WXYZ', 'among other params, with a dash and a hash');
  h.eq(D.duoNetJoinParam('?join=ab%20cd'), 'ABCD', 'an escaped space');
  h.eq(D.duoNetJoinParam('?join=OOPS'), null, 'O is not in the alphabet');
  h.eq(D.duoNetJoinParam('?joinx=ABCD'), null, 'only join=');
  h.eq(D.duoNetJoinParam(''), null, 'no address');
  h.eq(N.parseJoin('?join=abcd'), 'ABCD', 'NET reads it the same way');
  h.eq(N.cleanCode('a b c d'), 'ABCD', 'NET cleans a code the same way');
  const p = D.duoNetPlayer({ name: 'A\u0000very long name indeed', color: 'nope', char: 'dragon', claw: 'laser', paint: 'paint_nothing' }, 1);
  h.ok(p.name.length <= D.DUO.NAME_MAX && !/\u0000/.test(p.name), 'the name: printable, at most ten letters (' + p.name + ')');
  h.ok(p.color === 'cyan' && p.char === 'knight' && p.claw === 'classic' && p.paint === '', 'junk colour, crawler, claw and paint fall back');
  h.eq(D.duoNetPlayer(null, 0).name, 'P1', 'no profile: P1');
  const ok = D.duoNetPlayer({ name: 'Jas', color: 'gold', char: 'rogue', claw: 'scoop', paint: 'paint_gold' }, 0);
  h.ok(ok.color === 'gold' && ok.char === 'rogue' && ok.claw === 'scoop' && ok.paint === 'paint_gold', 'a good profile passes as it is');
  h.ok(D.duoNetPlayer({ char: '__proto__' }, 0).char === 'knight', 'a prototype name is no crawler');
  const on = D.duoNetOnline({ games: '3', wins: 9, me: { name: 'X', char: 'rogue' } });
  h.ok(on.games === 3 && on.wins === 3 && on.me && on.me.char === 'rogue', 'the online record: wins never above games');
  const f = D.duoFix(null);
  h.ok(f.online && f.online.games === 0 && f.online.me === null, 'an old profile gets an empty online record');
  h.eq(JSON.stringify(D.duoFix(JSON.parse(JSON.stringify(Object.assign(f, { online: { games: 2, wins: 1, me: null } }))))), JSON.stringify(f), 'the online record survives a save and a load');
});

await atest('the shared enemies: serialize, apply, validate', async () => {
  const T = boot(), G = T.GAME, C = T.COMBAT, NET = G.duo.net;
  const run = { hp: 70, maxHp: 70, act: 2, bin: [], relics: [], claw: {} };
  const Fa = C.newFight(run, ['smelter'], T.U.rng(5)), Fb = C.newFight(run, ['smelter'], T.U.rng(9));
  const e = Fa.enemies[0];
  e.hp = Math.floor(e.maxHp / 3); e.block = 7; e.status = { poison: 4, weak: 2 }; e.charged = 0; e.cyc = 5; e.enraged = true;
  if (Array.isArray(e.def.moves) && e.def.moves.length > 1) { C.pickIntent(Fa, e); }
  e.belly = [{ inst: { uid: 'u1', id: Object.keys(T.DATA.ITEMS)[0], plus: true, junk: false }, turns: 2, kind: 'armed', str: 2, armor: 0 }];
  const wire = JSON.parse(JSON.stringify(NET.foesOut(Fa.enemies)));
  h.ok(NET.foesIn(Fb.enemies, wire), 'a well formed list applies');
  const e2 = Fb.enemies[0];
  h.ok(e2.hp === e.hp && e2.maxHp === e.maxHp && e2.block === 7 && e2.status.poison === 4 && e2.status.weak === 2, 'hp, block and statuses come over');
  h.ok(e2.cyc === e.cyc && e2.moveIdx === e.moveIdx && e2.enraged === true, 'the move cycle and phase two come over');
  h.ok(e2.intent && e.intent && e2.intent.id === e.intent.id && e2.intent === e2.def.moves[e2.moveIdx], 'the intent is this game\'s own move object');
  h.ok(e2.belly.length === 1 && e2.belly[0].inst.plus && e2.belly[0].kind === 'armed', 'the belly comes over');
  h.eq(JSON.stringify(NET.foesOut(Fb.enemies)), JSON.stringify(wire), 'the round trip is exact');
  // a summon on the other phone: the slot is made fresh
  const two = wire.concat([Object.assign({}, wire[0], { id: 'rat', hp: 5, mx: 9, pt: null, it: null, bl: [] })]);
  h.ok(NET.foesIn(Fb.enemies, two) && Fb.enemies.length === 2 && Fb.enemies[1].id === 'rat' && Fb.enemies[1].hp === 5, 'a summoned enemy appears in its slot');
  h.ok(NET.foesIn(Fb.enemies, wire) && Fb.enemies.length === 1, '...and goes when the list is shorter');
  // junk
  const before = JSON.stringify(NET.foesOut(Fb.enemies));
  for (const bad of [null, 'x', [], [{ id: 'not_an_enemy', hp: 1 }], [{ id: '__proto__' }], new Array(9).fill(wire[0])]) h.ok(!NET.foesIn(Fb.enemies, bad), 'junk is refused: ' + JSON.stringify(bad).slice(0, 40));
  h.eq(JSON.stringify(NET.foesOut(Fb.enemies)), before, '...and changes nothing');
  const wild = [Object.assign({}, wire[0], { hp: 1e12, mx: -5, bk: 'lots', st: { poison: 1e9, '__proto__': 3, 'bad key!': 2 }, mi: 99, dm: 1e9, af: [1, 'x'.repeat(99), 'hasty'], bl: [{ id: 'nope' }] })];
  h.ok(NET.foesIn(Fb.enemies, wild), 'wild numbers still apply');
  const w = Fb.enemies[0];
  h.ok(w.maxHp === 1 && w.hp === 1 && w.block === 0, 'hp clamped to max, max at least 1, block a number');
  h.ok(w.status.poison === 999 && !Object.prototype.hasOwnProperty.call(w.status, '__proto__') && !w.status['bad key!'], 'statuses clamped, odd keys dropped');
  h.ok(w.moveIdx < (w.def.moves || []).length && w.dmgMul <= 50 && w.affix.join() === 'hasty' && w.belly.length === 0, 'the move index, the multiplier, affixes and the belly checked');
  // a seat's public state
  const pl = { hp: 10, maxHp: 50, block: 0, status: {} };
  h.ok(NET.pubIn(pl, { hp: 999, mx: 60, bk: -4, st: { weak: 2 } }) && pl.hp === 60 && pl.maxHp === 60 && pl.block === 0 && pl.status.weak === 2, 'a seat\'s hp, block and statuses, clamped');
  h.ok(!NET.pubIn(pl, 'junk') && pl.hp === 60, 'junk seat state is refused');
});

// ================================================================ two phones
const A = boot({ store: { clawspire_run: 'SOLO', clawspire_duo: 'LOCAL-DUEL' } }), B = boot();
wire(A); wire(B);
const GA = A.GAME, GB = B.GAME;
const NA = () => GA.duo.net.state, NB = () => GB.duo.net.state;
let code = '';

await atest('the menus: co-op asks same phone or online; host, join, lobby', async () => {
  GA.duo.menu();
  GA.choose(GA.S.ui.buttons.findIndex((b) => b.label === 'Co-op Boss'));
  h.ok(['Same phone', 'Online'].every((l) => GA.S.ui.buttons.some((b) => b.label === l)), 'Co-op Boss: Same phone or Online');
  GA.choose(GA.S.ui.buttons.findIndex((b) => b.label === 'Online'));
  h.ok(['Host a game', 'Join a game'].every((l) => GA.S.ui.buttons.some((b) => b.label === l)), 'Online: Host or Join');
  GA.draw();
  GA.choose(GA.S.ui.buttons.findIndex((b) => b.label === 'Host a game'));
  await settle([A, B]);
  code = NA() && NA().code;
  h.ok(/^[A-Z]{4}$/.test(code || ''), 'the host has a room code: ' + code);
  h.ok(GA.S.ui.buttons.some((b) => b.label === 'Copy code') && GA.S.ui.buttons.some((b) => b.label === 'Share invite'), 'Copy code and Share invite');
  h.eq(A._window.NET.state, 'waiting', 'the host waits in the room');
  GA.draw();
  // the guest types it (lower case, a dash)
  GB.duo.menu();
  GB.duo.net.joinDom('');
  h.ok(GB.S.ui.buttons.some((b) => b.label === 'Join'), 'the join screen');
  GB.draw();
  GB.duo.net.join(code.slice(0, 2).toLowerCase() + '-' + code.slice(2));
  await settle([A, B]);
  h.ok(NA().part && NB().part && NA().ph === 'lobby' && NB().ph === 'lobby', 'both in the lobby, each sees the other');
  h.ok(A._window.NET.state === 'connected' && B._window.NET.state === 'connected', 'connected');
  h.ok(NA().me === 0 && NB().me === 1 && A._window.NET.side === 0 && B._window.NET.side === 1, 'the host is seat 0 (the relay\'s side 0), the guest seat 1');
  GA.draw(); GB.draw();
});

await atest('the lobby: names, colours kept apart, the boss, ready, the go', async () => {
  GA.duo.net.set('name', 'Roxor'); GB.duo.net.set('name', 'Jasmin');
  GA.duo.net.set('color', 'gold'); GB.duo.net.set('color', 'gold');
  await settle([A, B]);
  h.eq(NB().part.p.name, 'Roxor', 'the guest sees the host\'s name');
  h.eq(NA().part.p.name, 'Jasmin', 'the host sees the guest\'s name');
  h.ok(NA().mine.p.color === 'gold' && NB().mine.p.color !== 'gold' && NA().part.p.color === NB().mine.p.color, 'both picked gold: the host keeps it, the guest is moved ' + NB().mine.p.color);
  h.ok(!GB.duo.net.boss('random') && GA.duo.net.boss('random'), 'only the host picks the boss');
  GA.duo.net.ready(true);
  await settle([A, B]);
  h.ok(!GA.duo.state && NB().part.ready, 'one ready: no start yet, the guest sees it');
  GB.duo.net.ready(true);
  await settle([A, B]);
  const Da = GA.duo.state, Db = GB.duo.state;
  h.ok(Da && Db && Da.net && Db.net, 'both ready: the game starts on both phones');
  h.ok(Da.seed === Db.seed && Da.boss === Db.boss && Da.first === Db.first && Da.fseed === Db.fseed, 'one seed, one boss, one toss');
  h.ok(Da.p[0].name === 'Roxor' && Db.p[1].name === 'Jasmin' && Da.p[1].color === Db.p[1].color, 'the same two players, in the same seats');
  h.ok(Da.ph === 'toss' && Db.ph === 'toss', 'the coin goes up on both');
  GA.draw(); GB.draw();
});

let first = 0;
const P = () => [A, B][GA.duo.state.turn], Q2 = () => [A, B][1 - GA.duo.state.turn];
async function playTurn(T, o) {
  o = o || {};
  const G = T.GAME;
  h.eq(G.duo.state.ph, 'yours', 'YOUR TURN on the phone whose turn it is');
  G.draw();
  h.ok(G.duo.net.go(), 'Grab!');
  for (let i = 0; i < 6 && G.fs && G.fs.vs; i++) G.pointer('down', 270, 500);
  fightSettle(G);
  for (let i = 0; i < 30; i++) G.update(DT);   // the stream goes out
  if (o.before) o.before(G);
  G.draw();
  const e = G.fight.enemies[0];
  const atk = (e.def.moves || []).find((m) => m && m.k === 'attack');
  if (o.atk != null) { e.intent = Object.assign({}, atk, { v: o.atk, n: 1 }); e.charged = 0; G.fight.player.block = 0; }
  if (o.hp != null) { G.fight.player.hp = o.hp; G.fight.player.block = 0; G.fight.player.status = {}; }
  if (o.win) { G.endFight('win', true); return; }
  G.endTurn();
  for (let i = 0; i < 60 * 20 && G.screen === 'fight'; i++) G.update(DT);
}

await atest('turns alternate: the active phone plays, the other watches and applies', async () => {
  GA.duo.afterToss(); GB.duo.afterToss();
  const Da = GA.duo.state, Db = GB.duo.state;
  first = Da.first;
  const act = [A, B][first], other = [A, B][1 - first];
  h.ok(act.GAME.duo.state.ph === 'yours' && other.GAME.duo.state.ph === 'watch', 'the toss winner: YOUR TURN; the other: watching');
  other.GAME.draw();
  // the live stream: play a turn with a pinned hit, the watcher sees the claw and the bin
  const hp0 = other.GAME.duo.live.F[first].player.hp;
  await playTurn(act, { atk: 12, before: (G) => { const id = Object.keys(act.DATA.COMBOS)[0]; G.fight.combos[id] = (G.fight.combos[id] | 0) + 1; G.update(DT); } });
  await settle([A, B], 1);
  const L1 = act.GAME.duo.live, L2 = other.GAME.duo.live;
  h.ok(L1.F[0].enemies[0].hp === L2.F[0].enemies[0].hp && L1.F[0].enemies[0].cyc === L2.F[0].enemies[0].cyc, 'the boss is the same on both phones (hp ' + L2.F[0].enemies[0].hp + ', cycle ' + L2.F[0].enemies[0].cyc + ')');
  h.ok(L2.F[first].player.hp === L1.F[first].player.hp && L2.F[first].player.hp < hp0, 'the boss hit the seat that went, and the watcher sees its hp');
  h.eq(other.GAME.duo.state.ph, 'yours', 'then it is the watcher\'s turn');
  h.eq(act.GAME.duo.state.ph, 'watch', '...and the one who went watches');
  h.ok(act._window.NET.sent > 5, 'the claw streamed while it played (' + act._window.NET.sent + ' messages)');
  h.ok(other.GAME.duo.net.log.some((l) => l.k === 'recv'), 'the turn arrived');
});

await atest('the watch screen: the partner\'s claw, bin, combos and cheers', async () => {
  const act = [A, B][1 - first], watcher = [A, B][first];
  act.GAME.duo.net.go();
  for (let i = 0; i < 6 && act.GAME.fs && act.GAME.fs.vs; i++) act.GAME.pointer('down', 270, 500);
  fightSettle(act.GAME);
  act.GAME.fs.rig.setTarget(120);
  for (let i = 0; i < 40; i++) act.GAME.update(DT);
  const id = Object.keys(act.DATA.COMBOS)[1];
  act.GAME.fight.combos[id] = (act.GAME.fight.combos[id] | 0) + 1;
  for (let i = 0; i < 10; i++) act.GAME.update(DT);
  await settle([A, B], 1);
  const w = watcher.GAME.duo.net.state.w;
  h.ok(w.claw && w.n > 0, 'the claw streams in (' + w.n + ' updates)');
  h.ok(Math.abs(w.claw.x - act.GAME.fs.rig.x) < 20, 'where it really is');
  h.ok(Object.keys(w.bodies).length > 0, 'the bin streams in (' + Object.keys(w.bodies).length + ' bodies)');
  h.ok(w.fx.some((f) => f.k === 'combo'), 'a named combo shows');
  // a prize down the chute (the deliver hook)
  const b = act.GAME.fs.items[0];
  if (b) { b.x = act.GAME.cabinet.bounds.chuteX + 20; b.y = act.GAME.CAB.h - 30; }
  for (let i = 0; i < 90; i++) act.GAME.update(DT);
  await settle([A, B], 1);
  h.ok(!!b && w.fx.some((f) => f.k === 'prize'), 'a prize they land flies to their corner (' + w.fx.map((f) => f.k).join(',') + ')');
  for (let i = 0; i < 10; i++) watcher.GAME.update(DT);
  watcher.GAME.draw();
  h.eq(watcher.RENDER.duo.E.n, 0, 'the watch screen draws without a fault');
  // a cheer from the watcher plays on both phones in the watcher's bubble
  h.ok(watcher.GAME.duo.net.cheer('hug'), 'a cheer');
  await settle([A, B], 1);
  h.ok(act.GAME.duo.state.msg && act.GAME.duo.state.msg.id === 'hug' && act.GAME.duo.state.msg.from === first, 'it arrives, from the watcher\'s seat');
  act.GAME.draw();
  // the turn ends: back the other way
  act.GAME.endTurn();
  for (let i = 0; i < 60 * 20 && act.GAME.screen === 'fight'; i++) act.GAME.update(DT);
  await settle([A, B], 1);
  h.ok(watcher.GAME.duo.state.ph === 'yours' && act.GAME.duo.state.ph === 'watch', 'strictly turn about');
  h.ok(A._store.clawspire_duo === 'LOCAL-DUEL' && A._store.clawspire_run === 'SOLO', 'the local duel save and the run save are untouched');
});

await atest('messages from the wire: a repeat, a wrong seat and junk change nothing', async () => {
  const G = [A, B][first].GAME, N = G.duo.net.state, L = G.duo.live;
  const hp = L.F[0].enemies[0].hp, n = N.inN;
  h.ok(!G.duo.net.onTurn({ t: 'turn', n, seat: 1 - N.me, foes: [], pub: {} }), 'a turn already applied is ignored');
  h.ok(!G.duo.net.onTurn({ t: 'turn', n: n + 5, seat: N.me, foes: G.duo.net.foesOut(L.F[0].enemies), pub: {} }), 'a turn for this phone\'s own seat is ignored');
  h.ok(!G.duo.net.onTurn({ t: 'turn', n: n + 5, seat: 1 - N.me, foes: 'x' }), 'junk is ignored');
  h.ok(L.F[0].enemies[0].hp === hp && N.inN === n && G.duo.state.ph === 'yours', 'nothing changed');
});

await atest('a dropped line: reconnecting, back, the last turn again (ignored)', async () => {
  const me = [A, B][first];
  // B's line drops under it
  const bClient = rooms.get(code).st.__socks.filter((s) => !s.closed).map((s) => s.cli).find((c) => c && c.srv && c.srv.attach && c.srv.attach.side === 1);
  h.ok(!!bClient, 'the guest\'s socket');
  bClient.drop();
  await settle([A, B], 1);
  h.ok(A._window.NET.state === 'lost' && B._window.NET.state === 'lost', 'both see the line drop');
  h.ok(NA().lost && NB().lost, 'reconnecting on both');
  const watcher = [A, B].find((T) => T.GAME.duo.state.ph === 'watch');
  watcher.GAME.draw();
  h.ok(watcher.GAME.duo.net.sheet() === 'lost', 'the watcher sees "Partner connection lost, reconnecting..."');
  clock += 3000;
  await settle([A, B], 2);
  h.ok(A._window.NET.state === 'connected' && B._window.NET.state === 'connected', 'the guest comes back in the same seat: connected again');
  h.eq(B._window.NET.side, 1, 'its own seat');
  h.ok(!NA().lost && !NB().lost && !watcher.GAME.duo.net.sheet(), 'the sheet goes');
  h.ok(B._window.NET.role === 'returning' || A._window.NET.role === 'returning' || B._window.NET.role === 'staying', 'the relay said rejoin, not start');
  h.ok(me.GAME.duo.state.ph === 'yours' || me.GAME.duo.state.ph === 'watch', 'the game carries on');
});

await atest('a quiet partner (a phone in a pocket sleeps its timers) wakes the line on its next word', async () => {
  clock += 11000;
  A._window.NET.pulse();
  h.ok(A._window.NET.state === 'lost' && NA().lost, 'ten seconds of silence: reconnecting');
  await settle([A, B], 1);
  h.ok(A._window.NET.state === 'connected' && B._window.NET.state === 'connected' && !NA().lost && !NB().lost, 'its next heartbeat: back, no rejoin needed');
  // the phone whose turn it is goes into a pocket (the page hidden): the other is told, and after a while may go on alone
  const act = P(), wat = Q2();
  act._document.hidden = true;
  await settle([A, B], 1);
  h.ok(wat.GAME.duo.net.state.awayAt > 0 && !wat.GAME.duo.net.sheet(), 'the watcher knows they stepped away (no sheet yet)');
  wat.GAME.duo.net.state.awayAt = wat.GAME.duo.net.state.t - 50;
  h.eq(wat.GAME.duo.net.sheet(), 'away', 'after 45 s: "NAME stepped away" with Keep fighting alone, Wait, Quit to title');
  wat.GAME.update(DT); wat.GAME.draw();
  h.ok(wat.GAME.S.ui.buttons.some((b) => b.label === 'Wait'), 'Wait is offered');
  act._document.hidden = false;
  await settle([A, B], 1);
  h.ok(!wat.GAME.duo.net.state.awayAt && !wat.GAME.duo.net.sheet(), 'back in the room: the sheet goes');
});

await atest('a seat down: the other fights on, turn after turn', async () => {
  // the one whose turn it is falls
  const act = P(), other = Q2(), seat = act.GAME.duo.net.state.me;
  await playTurn(act, { hp: 1, atk: 999 });
  await settle([A, B], 1);
  h.ok(act.GAME.duo.state.down[seat] === 1 && other.GAME.duo.state.down[seat] === 1, 'DOWN on both phones');
  h.eq(other.GAME.duo.state.ph, 'yours', 'the partner is up');
  h.eq(act.GAME.duo.state.ph, 'watch', 'the fallen one watches');
  await playTurn(other, { atk: 1 });
  await settle([A, B], 1);
  h.eq(other.GAME.screen, 'fight', 'with the partner down, the same seat simply goes again');
  h.eq(act.GAME.duo.state.ph, 'watch', '...and the fallen one keeps watching');
  h.ok(act.GAME.duo.net.state.inN === other.GAME.duo.net.state.outN, 'the watcher got that turn too');
  fightSettle(other.GAME);
});

await atest('the boss falls: TEAM WIN on both phones, booked on both, once', async () => {
  const act = [A, B].find((T) => T.GAME.screen === 'fight'), other = [A, B].find((T) => T !== act);
  act.GAME.endFight('win', true);
  await settle([A, B], 1);
  for (let i = 0; i < 60 * 5 && act.GAME.duo.state.ph !== 'end'; i++) act.GAME.update(DT);
  h.ok(act.GAME.duo.state.ph === 'end' && other.GAME.duo.state.ph === 'end', 'the podium on both');
  h.ok(act.GAME.duo.state.res.won && other.GAME.duo.state.res.won, 'TEAM WIN on both');
  h.ok(act.GAME.meta.duo.online.games === 1 && act.GAME.meta.duo.online.wins === 1 && other.GAME.meta.duo.online.wins === 1, 'an online win on each profile');
  h.ok(act.GAME.meta.duo.coopWins === 1 && other.GAME.meta.duo.coopWins === 1, 'and a team win, the local way');
  act.GAME.draw(); other.GAME.draw();
  h.ok(act.GAME.S.ui.buttons.some((b) => b.label === 'Play again') && other.GAME.S.ui.buttons.some((b) => b.label === 'Play again'), 'Play again on both');
  h.ok(A._store.clawspire_duo === 'LOCAL-DUEL', 'the local duel save is still untouched');
});

await atest('play again: both back in the lobby; a second game', async () => {
  GA.duo.net.again();
  await settle([A, B]);
  h.ok(!GA.duo.state && !GB.duo.state && NA().ph === 'lobby' && NB().ph === 'lobby', 'both in the lobby again');
  GA.duo.net.ready(true); GB.duo.net.ready(true);
  await settle([A, B]);
  h.ok(GA.duo.state && GB.duo.state && GA.duo.state.seed === GB.duo.state.seed, 'a new game on the same code');
  GA.duo.afterToss(); GB.duo.afterToss();
});

await atest('a partner gone for good: 30 s of retries, then Keep fighting alone', async () => {
  const bClient = rooms.get(code).st.__socks.filter((s) => !s.closed).map((s) => s.cli).find((c) => c && c.srv && c.srv.attach && c.srv.attach.side === 1);
  // B closes its page: its NET never comes back
  B._window.NET.close();
  if (bClient) bClient.close();
  await settle([A], 1);
  h.ok(NA().lost, 'the host sees the line drop');
  clock += 31000;
  for (let i = 0; i < 4; i++) GA.update(DT);
  await settle([A], 1);
  h.ok(NA().gone && GA.duo.net.sheet() === 'gone', 'after 30 s: Keep fighting alone or Quit to title');
  GA.draw();
  if (GA.screen === 'duo') h.ok(GA.S.ui.buttons.some((b) => b.label === 'Keep fighting alone') && GA.S.ui.buttons.some((b) => b.label === 'Quit to title'), 'both buttons');
  h.ok(GA.duo.net.alone(), 'Keep fighting alone');
  h.ok(GA.duo.state.down[1] === 1, 'the partner\'s seat counts as DOWN');
  const D = GA.duo.state;
  h.ok(D.ph === 'yours' || D.ph === 'fight', 'and this phone plays on');
  if (D.ph === 'yours') GA.duo.net.go();
  for (let i = 0; i < 6 && GA.fs && GA.fs.vs; i++) GA.pointer('down', 270, 500);
  fightSettle(GA);
  GA.endTurn();
  for (let i = 0; i < 60 * 20 && GA.screen === 'fight' && !fightReady(GA); i++) GA.update(DT);
  h.ok(GA.screen === 'fight' && GA.duo.state.turn === 0, 'turn after turn, alone');
  GA.duo.net.quit(true);
  h.ok(GA.screen === 'title' && !GA.duo.state && !GA.duo.net.state && A._window.NET.state === 'closed', 'Quit to title: everything closed');
  h.ok(A._store.clawspire_duo === 'LOCAL-DUEL' && A._store.clawspire_run === 'SOLO', 'the saves are as they were');
});

await atest('a reload mid game: the returning phone asks for the table and gets it', async () => {
  const H = boot(), J = boot();
  wire(H); wire(J);
  H.GAME.duo.menu(); H.GAME.duo.net.host(); await settle([H, J]);
  const c2 = H.GAME.duo.net.state.code;
  J.GAME.duo.menu(); J.GAME.duo.net.join(c2); await settle([H, J]);
  H.GAME.duo.net.ready(true); J.GAME.duo.net.ready(true); await settle([H, J]);
  H.GAME.duo.afterToss(); J.GAME.duo.afterToss();
  const act = [H, J][H.GAME.duo.state.first];
  await playTurn(act, { atk: 5 });
  await settle([H, J], 1);
  const bossHp = H.GAME.duo.live.F[0].enemies[0].hp;
  // J reloads: a new page, same tab (its seat remembered), same code
  const store = Object.assign({}, J._store);
  const jc = rooms.get(c2).st.__socks.filter((s) => !s.closed).map((s) => s.cli).find((x) => x && x.srv && x.srv.attach && x.srv.attach.side === 1);
  if (jc) jc.drop();
  J.GAME.duo.net.quit(true);
  const J2 = boot({ store });
  wire(J2);
  J2.GAME.duo.net.bootCode = c2;
  J2.GAME.showTitle();
  J2._flush(100);
  await settle([H, J2], 2);
  h.ok(J2.GAME.duo.state && J2.GAME.duo.state.net, 'the returning page is back in the game (?join=CODE, then sync)');
  h.eq(J2.GAME.duo.net.state.me, 1, '...in its own seat');
  h.eq(J2.GAME.duo.live.F[0].enemies[0].hp, bossHp, '...with the boss as it was');
  h.ok(J2.GAME.duo.state.ph === 'yours' || J2.GAME.duo.state.ph === 'watch', '...and on with the turns');
  H.GAME.duo.net.quit(true); J2.GAME.duo.net.quit(true);
});

// ================================================================ failures
await atest('failures: a foreign game, another version, no relay, nobody there, a bad code', async () => {
  // an Ironbridge player on the code: its first word is not our hello
  const T = boot(); wire(T);
  T.GAME.duo.menu(); T.GAME.duo.net.host(); await settle([T]);
  const c3 = T.GAME.duo.net.state.code;
  const ib = new ClientWS('wss://relay/room/' + c3 + '?have=0');
  ib.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.k === 'start') ib.send(JSON.stringify({ k: 'cmds', tick: 1, c: [] })); };
  await settle([T]);
  h.ok(!T.GAME.duo.net.state && T.GAME.S.ui.buttons.some((b) => b.label === 'Host a game'), 'back to the online menu');
  h.ok(JSON.stringify(T._nodes.duoBody ? T._nodes.duoBody.children.map((c) => c.textContent) : []).includes('different game'), '"That code belongs to a different game."');
  // another version of the game
  const U1 = boot(), U2 = boot(); wire(U1); wire(U2);
  U1.GAME.duo.menu(); U1.GAME.duo.net.host(); await settle([U1, U2]);
  U2._window.NET.hello(() => ({ b: 'another', p: {} }));
  U2._window.NET.join(U1.GAME.duo.net.state.code);
  await settle([U1, U2]);
  h.ok(!U1.GAME.duo.net.state && JSON.stringify(U1._nodes.duoBody.children.map((c) => c.textContent)).includes('different game version'), '"Your partner has a different game version, both reload."');
  // the relay down
  relayUp = false;
  const V = boot(); wire(V);
  V.GAME.duo.menu(); V.GAME.duo.net.host(); await settle([V]);
  h.ok(!V.GAME.duo.net.state && JSON.stringify(V._nodes.duoBody.children.map((c) => c.textContent)).includes('reach the online lobby'), '"Can\'t reach the online lobby, check your connection."');
  V.GAME.duo.net.join('WXYZ'); await settle([V]);
  h.ok(!V.GAME.duo.net.state && JSON.stringify(V._nodes.duoBody.children.map((c) => c.textContent)).includes('reach the online lobby'), '...and the same when joining');
  relayUp = true;
  // a code nobody hosts
  V.GAME.duo.net.join('QQQQ'); await settle([V]);
  h.eq(V._window.NET.state, 'waiting', 'alone in the room');
  clock += 8000;
  for (let i = 0; i < 3; i++) V.GAME.update(DT);
  await settle([V]);
  h.ok(!V.GAME.duo.net.state && JSON.stringify(V._nodes.duoBody.children.map((c) => c.textContent)).includes('No game with that code'), '"No game with that code."');
  // a code that is no code
  V.GAME.duo.net.join('AB1');
  h.ok(JSON.stringify(V._nodes.duoBody.children.map((c) => c.textContent)).includes('four letters'), '"A code is four letters."');
  V.GAME.draw();
});

h.done();
