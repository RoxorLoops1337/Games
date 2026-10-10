// Battle Call: the demo. The real rules engine running inside this page, with 28 simulated audience members, so the
// whole thing (phone, organiser console, big screen) can be tried with no server at all: open #/e/DEMO.
// Nothing here is a mock of the rules: it is engine.js, the same code the Durable Object runs.
import * as E from '../engine.js';
import { seedOrder } from './shared.js';

const CREWS = ['Loop Brothers', 'Bass Syndicate', 'The Mouth Choir', 'Crew Utrecht', 'Sub Squad', 'Vocal Voltage'];
const NAMES = ['Alpha Beat', 'MC Rhythm', 'Vocal Storm', 'Bass Queen', 'Tempo', 'Lil Loop', 'Dub Dragon', 'Kick Kid', 'Snare Sam', 'Hi-Hat Hana', 'Wobble', 'Click Clack'];
const FANS = ['Mila', 'Noah', 'Sven', 'Lotte', 'Daan', 'Fleur', 'Jesse', 'Roos', 'Bram', 'Sanne', 'Tim', 'Eva', 'Lars', 'Nina', 'Ruben', 'Iris', 'Thijs', 'Anouk', 'Finn', 'Zoe', 'Jens', 'Maud', 'Koen', 'Lieke', 'Pim', 'Julia', 'Gijs', 'Femke'];
export const ME = 'You';

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

let DS = null, att = null, autoTimer = 0, auto = false, flushT = 0, voteT = 0, feed = [];

function build() {
  const ev = E.newEvent({ code: 'DEMO', name: 'Demo Battle Night', size: 8, catName: 'Solo Mix', now: Date.now() });
  DS = E.newState(ev); DS.now = Date.now();
  E.hostAction(DS, { a: 'bb.add', cat: 'c1', names: NAMES });
  const r = E.hostAction(DS, { a: 'cat.add', name: 'Crew', size: 4 });
  E.hostAction(DS, { a: 'bb.add', cat: r.cat, names: CREWS });
  for (const n of [ME, ...FANS]) E.addUser(DS, E.newUser(DS, { name: n, device: 'demo-' + n }));
  feed = [];
  auto = false; clearTimeout(autoTimer);
}
const bots = () => [...DS.users.values()].filter((u) => u.name !== ME);
const allCats = () => DS.event.order.map((id) => DS.event.cats[id]);
const catOfMid = (mid) => allCats().find((c) => c.matches.some((m) => m.id === mid));

/* ------------------------------------------------------------ the audience reacting */
function botsPick(c) {
  for (const b of bots()) {
    E.setTop(DS, b, shuffle(c.bbs.map((x) => x.id)).slice(0, c.settings.size), c.id);
    for (const m of shuffle(Object.values(c.markets).filter((k) => k.st === 'open')).slice(0, 1 + rnd(2))) bet(b, m);
  }
}
function bet(b, m) {
  const amt = [20, 50, 50, 100, 100, 150, 250][rnd(7)];
  E.setBet(DS, b, m.id, rnd(m.pool.length), amt);
  if (amt >= 100) feed.push({ k: 'bet', t: `${b.name} put ${amt} on ${E.marketTitle(DS, m)}` });
}
function botsRound(c) {
  for (const b of bots()) {
    for (const m of c.matches.filter((x) => x.status === 'upcoming' && !c.locked[x.r])) {
      if (!b.picks[m.id] && Math.random() < 0.8) E.setPick(DS, b, m.id, Math.random() < 0.65 ? m.a : m.b);
    }
    for (const k of Object.values(c.markets).filter((x) => x.kind === 'match' && x.st === 'open')) if (!b.bets[k.id] && Math.random() < 0.35) bet(b, k);
  }
}
function botsVote(mid) {
  const m = catOfMid(mid).matches.find((x) => x.id === mid), lean = Math.random() < 0.5 ? 0.62 : 0.4; // the crowd has a favourite
  bots().forEach((b, i) => {
    setTimeout(() => {
      if (!DS || m.status !== 'voting') return;
      E.castVote(DS, b, mid, Math.random() < lean ? 'a' : 'b');
      schedule();
    }, 400 + i * 130 + rnd(300));
  });
}

/** The fans cheer while a battle is on. */
let cheerT = 0;
function cheer() {
  clearInterval(cheerT);
  cheerT = setInterval(() => {
    if (!DS || !att) return;
    const c = E.currentMatch(DS);
    if (!c) return;
    const kinds = ['fire', 'clap', 'hands', 'mind', 'bass'], burst = {};
    for (let i = 0; i < 1 + rnd(4); i++) { const k = pick(kinds); burst[k] = (burst[k] || 0) + 1; }
    att.push({ t: 'rx', c: burst });
  }, 900);
}

/** A vote with a countdown closes itself, just like on the server. */
function armVotes() {
  clearTimeout(voteT); voteT = 0;
  if (!DS) return;
  let next = 0;
  const soon = (t) => { if (t && (!next || t < next)) next = t; };
  for (const c of allCats()) { for (const m of c.matches) if (m.status === 'voting') soon(m.vend); if (c.phase === 'picks') soon(c.picksEnd); }
  if (!next) return;
  voteT = setTimeout(() => { DS.now = Date.now(); E.closeDueVotes(DS); schedule(); armVotes(); }, Math.max(50, next - Date.now()));
}

/* ------------------------------------------------------------ talking to the app */
function schedule() { if (!flushT) flushT = setTimeout(() => { flushT = 0; flush(); }, 120); }

function flush() {
  if (!att || !DS) return;
  const S = DS, role = att.role, d = S.dirty;
  S.dirty = E.blankDirty();
  if (d.meta) S.event.rev++;
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
  const c = (a.mid && catOfMid(a.mid)) || DS.event.cats[a.cat || DS.event.active];
  if (a.a === 'phase' && a.to === 'picks') botsPick(c);
  if (a.a === 'seeds') botsRound(c);
  if (a.a === 'step' && a.to === 'voting') { botsVote(a.mid); armVotes(); }
  if (a.a === 'picks.timer') armVotes();
  if (a.a === 'result') {
    for (const w of E.bigWins(DS, 'm:' + a.mid)) feed.push({ k: 'win', t: `${w.n} collected ${w.d} Loops` });
    botsRound(c);
  }
}

/** All categories move through picks and the elimination together; the battles then happen one category at a time. */
const stageOf = () => { const cs = allCats(); return cs.some((c) => c.phase === 'lobby') ? 'lobby' : cs.some((c) => c.phase === 'picks') ? 'picks' : cs.some((c) => c.phase === 'elimination') ? 'elimination' : 'bracket'; };
const allDone = () => allCats().every((c) => c.phase === 'finished');

export function createDemo() {
  if (!DS) build();
  return {
    name: () => DS.event.name,
    attach(push, role) { att = { push, role }; cheer(); flush(); },
    detach() { att = null; clearInterval(cheerT); },
    reset() { build(); clearTimeout(voteT); flush(); },
    act(m) {
      DS.now = Date.now();
      const role = att ? att.role : 'guest';
      let r;
      if (role === 'host') {
        r = E.hostAction(DS, m);
        if (r.ok) react(m);
      } else if (role === 'user') {
        const u = DS.users.get(nameKey(ME));
        if (m.a === 'top') r = E.setTop(DS, u, m.order, m.cat);
        else if (m.a === 'pick') r = E.setPick(DS, u, m.mid, m.bb || null);
        else if (m.a === 'bet') {
          r = E.setBet(DS, u, m.mk, m.o, m.amt);
          const k = E.findMarket(DS, m.mk);
          if (r.ok && k && m.amt >= 100) feed.push({ k: 'bet', t: `${ME} put ${Math.floor(m.amt)} on ${E.marketTitle(DS, k)}` });
        } else if (m.a === 'vote') r = E.castVote(DS, u, m.mid, m.side);
        else r = { ok: false, err: 'Unknown action' };
      } else r = { ok: false, err: 'Join the battle first' };
      schedule();
      return r;
    },
    /** The director: do whatever the organiser would do next (used by the Next button and by autoplay). */
    next(fromAuto) {
      DS.now = Date.now();
      const todo = [];
      const st = stageOf();
      if (st === 'lobby') for (const c of allCats().filter((x) => x.phase === 'lobby')) todo.push({ a: 'phase', cat: c.id, to: 'picks' });
      else if (st === 'picks') for (const c of allCats().filter((x) => x.phase === 'picks')) todo.push({ a: 'phase', cat: c.id, to: 'elimination' });
      else if (st === 'elimination') {
        for (const c of allCats().filter((x) => x.phase === 'elimination')) {
          const cons = E.consensus(DS), want = c.settings.size, order = [];
          for (const id of shuffle(c.bbs.map((b) => b.id))) if (order.length < want) order.push(id);
          todo.push({ a: 'seeds', cat: c.id, order: order.sort(() => Math.random() - 0.35) });
        }
      } else {
        const cur = E.currentMatch(DS);
        if (cur) {
          if (cur.status === 'live') todo.push({ a: 'step', mid: cur.id, to: 'voting' });
          else if (cur.status === 'voting') { if (!(fromAuto && cur.vend)) todo.push({ a: 'step', mid: cur.id, to: 'closed' }); }
          else todo.push({ a: 'result', mid: cur.id, w: cur.c.a >= cur.c.b ? (Math.random() < 0.7 ? 'a' : 'b') : (Math.random() < 0.7 ? 'b' : 'a'), judges: pick([{ a: 3, b: 0 }, { a: 2, b: 1 }, { a: 1, b: 2 }, { a: 0, b: 3 }]) });
        } else {
          // the next battle: the category on stage first, then the others
          const order = [DS.event.cats[DS.event.active], ...allCats()];
          for (const c of order) { const up = c.matches.find((m) => m.status === 'upcoming'); if (up) { todo.push({ a: 'step', mid: up.id, to: 'live' }); break; } }
        }
      }
      let any = false;
      for (const a of todo) { const r = E.hostAction(DS, a); if (r.ok) { react(a); any = true; } }
      if (any) schedule();
      return any;
    },
    toggleAuto() {
      auto = !auto;
      clearTimeout(autoTimer);
      const tick = () => {
        if (!auto || !DS) return;
        if (allDone()) { auto = false; schedule(); return; }
        this.next(true);
        const st = stageOf(), cur = st === 'bracket' ? E.currentMatch(DS) : null;
        const wait = st === 'lobby' ? 4000 : st === 'picks' ? 6000 : st === 'elimination' ? 3500 : !cur ? 2500 : cur.status === 'voting' ? 11000 : cur.status === 'closed' ? 4500 : cur.status === 'live' ? 4500 : 7000;
        autoTimer = setTimeout(tick, wait);
      };
      if (auto) tick();
      schedule();
      return auto;
    },
    isAuto: () => auto,
    done: allDone,
  };
}

export const demoAuto = () => auto;
