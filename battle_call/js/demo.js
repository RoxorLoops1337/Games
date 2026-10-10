// Battle Call: the demo. The real rules engine running inside this page, with 28 simulated audience members, so the
// whole thing (phone, organiser console, big screen) can be tried with no server at all: open #/e/DEMO.
// Nothing here is a mock of the rules: it is engine.js, the same code the Durable Object runs.
import * as E from '../engine.js';
import { seedOrder } from './shared.js';

const NAMES = ['Alpha Beat', 'MC Rhythm', 'Vocal Storm', 'Bass Queen', 'Tempo', 'Lil Loop', 'Dub Dragon', 'Kick Kid', 'Snare Sam', 'Hi-Hat Hana', 'Wobble', 'Click Clack'];
const FANS = ['Mila', 'Noah', 'Sven', 'Lotte', 'Daan', 'Fleur', 'Jesse', 'Roos', 'Bram', 'Sanne', 'Tim', 'Eva', 'Lars', 'Nina', 'Ruben', 'Iris', 'Thijs', 'Anouk', 'Finn', 'Zoe', 'Jens', 'Maud', 'Koen', 'Lieke', 'Pim', 'Julia', 'Gijs', 'Femke'];
export const ME = 'You';

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

let DS = null, att = null, autoTimer = 0, auto = false, flushT = 0, feed = [];

function build() {
  const ev = E.newEvent({ code: 'DEMO', name: 'Demo Battle Night', size: 8, now: Date.now() });
  DS = E.newState(ev); DS.now = Date.now();
  E.hostAction(DS, { a: 'bb.add', names: NAMES });
  for (const n of [ME, ...FANS]) E.addUser(DS, E.newUser(DS, { name: n, device: 'demo-' + n }));
  feed = [];
  auto = false; clearTimeout(autoTimer);
}
const bots = () => [...DS.users.values()].filter((u) => u.name !== ME);
const bbIds = () => DS.ev.bbs.map((b) => b.id);

/* ------------------------------------------------------------ the audience reacting */
function botsPick() {
  for (const b of bots()) {
    E.setTop(DS, b, shuffle(bbIds()).slice(0, DS.ev.settings.size));
    for (const m of shuffle(Object.values(DS.ev.markets).filter((k) => k.st === 'open')).slice(0, 1 + rnd(3))) bet(b, m);
  }
}
function bet(b, m) {
  const amt = [20, 50, 50, 100, 100, 150, 250][rnd(7)];
  E.setBet(DS, b, m.id, rnd(m.pool.length), amt);
  if (amt >= 100) { const k = m; feed.push({ k: 'bet', t: `${b.name} put ${amt} on ${E.marketTitle(DS, k)}` }); }
}
function botsRound() {
  for (const b of bots()) {
    for (const m of DS.ev.matches.filter((x) => x.status === 'upcoming' && !DS.ev.locked[x.r])) {
      if (!b.picks[m.id] && Math.random() < 0.8) E.setPick(DS, b, m.id, Math.random() < 0.65 ? m.a : m.b);
    }
    for (const k of Object.values(DS.ev.markets).filter((x) => x.kind === 'match' && x.st === 'open')) if (!b.bets[k.id] && Math.random() < 0.35) bet(b, k);
  }
}
function botsVote(mid) {
  const m = DS.ev.matches.find((x) => x.id === mid), lean = Math.random() < 0.5 ? 0.62 : 0.4; // the crowd has a favourite
  bots().forEach((b, i) => {
    setTimeout(() => {
      if (!DS || m.status !== 'voting') return;
      E.castVote(DS, b, mid, Math.random() < lean ? 'a' : 'b');
      schedule();
    }, 400 + i * 130 + rnd(300));
  });
}

/* ------------------------------------------------------------ talking to the app */
function schedule() { if (!flushT) flushT = setTimeout(() => { flushT = 0; flush(); }, 120); }

function flush() {
  if (!att || !DS) return;
  const S = DS, role = att.role, d = S.dirty;
  S.dirty = E.blankDirty();
  if (d.meta) S.ev.rev++;
  const send = att.push;
  send({ t: 'meta', ...E.metaOf(S) });
  send({ t: 'live', ...E.liveOf(S, S.users.size, role === 'host') });
  send({ t: 'board', rows: E.boardOf(S) });
  if (role === 'user') send({ t: 'me', ...E.meOf(S, S.users.get(nameKey(ME))) });
  if (role === 'host') send({ t: 'host', ...E.hostOf(S) });
  if (feed.length) { send({ t: 'feed', items: feed.splice(0) }); }
}
const nameKey = (n) => n.toLowerCase();

/** What the organiser's action sets off in the audience. */
function react(a) {
  if (a.a === 'phase' && a.to === 'picks') botsPick();
  if (a.a === 'seeds') botsRound();
  if (a.a === 'step' && a.to === 'voting') botsVote(a.mid);
  if (a.a === 'result') {
    for (const w of E.bigWins(DS, 'm:' + a.mid)) feed.push({ k: 'win', t: `${w.n} collected ${w.d} Loops` });
    botsRound();
  }
}

export function createDemo() {
  if (!DS) build();
  return {
    name: () => DS.ev.name,
    attach(push, role) { att = { push, role }; flush(); },
    detach() { att = null; },
    reset() { build(); flush(); },
    act(m) {
      DS.now = Date.now();
      const role = att ? att.role : 'guest';
      let r;
      if (role === 'host') {
        if (m.a === 'bb.add' && DS.ev.phase === 'lobby') r = E.hostAction(DS, m);
        else r = E.hostAction(DS, m);
        if (r.ok) react(m);
      } else if (role === 'user') {
        const u = DS.users.get(nameKey(ME));
        if (m.a === 'top') r = E.setTop(DS, u, m.order);
        else if (m.a === 'pick') r = E.setPick(DS, u, m.mid, m.bb || null);
        else if (m.a === 'bet') {
          r = E.setBet(DS, u, m.mk, m.o, m.amt);
          const k = DS.ev.markets[m.mk];
          if (r.ok && k && m.amt >= 100) feed.push({ k: 'bet', t: `${ME} put ${Math.floor(m.amt)} on ${E.marketTitle(DS, k)}` });
        } else if (m.a === 'vote') r = E.castVote(DS, u, m.mid, m.side);
        else r = { ok: false, err: 'Unknown action' };
      } else r = { ok: false, err: 'Join the battle first' };
      schedule();
      return r;
    },
    /** The director: do whatever the organiser would do next (used by the Next button and by autoplay). */
    next() {
      const ev = DS.ev;
      DS.now = Date.now();
      let a = null;
      if (ev.phase === 'lobby') a = { a: 'phase', to: 'picks' };
      else if (ev.phase === 'picks') a = { a: 'phase', to: 'elimination' };
      else if (ev.phase === 'elimination') {
        const c = E.consensus(DS), want = ev.settings.size, order = [...c.rows.map((r) => r.id)];
        for (const id of shuffle(bbIds())) if (order.length < want && !order.includes(id)) order.push(id);
        a = { a: 'seeds', order: order.slice(0, want).sort(() => Math.random() - 0.35) };
      } else if (ev.phase === 'bracket') {
        const cur = E.currentMatch(DS);
        if (cur) {
          if (cur.status === 'live') a = { a: 'step', mid: cur.id, to: 'voting' };
          else if (cur.status === 'voting') a = { a: 'step', mid: cur.id, to: 'closed' };
          else a = { a: 'result', mid: cur.id, w: cur.c.a >= cur.c.b ? (Math.random() < 0.7 ? 'a' : 'b') : (Math.random() < 0.7 ? 'b' : 'a'), judges: pick([{ a: 3, b: 0 }, { a: 2, b: 1 }, { a: 1, b: 2 }, { a: 0, b: 3 }]) };
        } else {
          const up = ev.matches.find((m) => m.status === 'upcoming');
          if (up) a = { a: 'step', mid: up.id, to: 'live' };
        }
      }
      if (!a) return false;
      const r = E.hostAction(DS, a);
      if (r.ok) { react(a); schedule(); }
      return r.ok;
    },
    toggleAuto() {
      auto = !auto;
      clearTimeout(autoTimer);
      const tick = () => {
        if (!auto || !DS) return;
        const ev = DS.ev;
        if (ev.phase === 'finished') { auto = false; schedule(); return; }
        this.next();
        const cur = ev.phase === 'bracket' ? E.currentMatch(DS) : null;
        const wait = ev.phase === 'lobby' ? 4000 : ev.phase === 'picks' ? 6000 : ev.phase === 'elimination' ? 3500 : !cur ? 2500 : cur.status === 'voting' ? 7500 : cur.status === 'closed' ? 4500 : cur.status === 'live' ? 4500 : 7000;
        autoTimer = setTimeout(tick, wait);
      };
      if (auto) tick();
      schedule();
      return auto;
    },
    isAuto: () => auto,
    done: () => DS.ev.phase === 'finished',
  };
}

export const demoAuto = () => auto;
