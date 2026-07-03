// Headless suite for Headliner (DJ idle/tycoon).
// Evaluates the game's inline <script> with a stubbed DOM and drives the loop
// through window.HL: tap practice → buy buzz items → passive fans → venue
// ladder → gigs + the DROP minigame → booking agent automation → prestige
// (retire the alias) → save/load → offline earnings.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

function loadHeadliner(store) {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'headliner', 'index.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const mkEl = () => new Proxy(
    { style: {}, dataset: {} },
    {
      get(t, k) {
        if (k in t) return t[k];
        return () => mkEl(); // appendChild, remove, etc. — return another element
      },
      set(t, k, v) { t[k] = v; return true; },
    }
  );
  const els = {};

  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  global.requestAnimationFrame = noop;
  global.addEventListener = noop;
  global.devicePixelRatio = 1;
  global.document = {
    getElementById: id => (els[id] || (els[id] = mkEl())),
    createElement: () => mkEl(),
    createTextNode: () => mkEl(),
    body: mkEl(),
    addEventListener: noop,
    hidden: false,
  };
  global.window = new Proxy(global, {
    get(t, k) { return (k in t) ? t[k] : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });
  global.__HL_HEADLESS__ = true;

  eval('(function(){' + code + '\n})()');
  return globalThis.HL;
}

const t = harness('headliner');
const store = { hl_muted: '1' };
const HL = loadHeadliner(store);
const C = HL.constants;
const step = (secs) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) HL.tick(1 / 60); };
const rSafe = (label) => { try { HL.render(); t.ok(true, label); } catch (e) { t.ok(false, label + ' threw: ' + e.stack); } };

// ---- boot ----
t.ok(HL && typeof HL.tick === 'function', 'HL hooks exposed');
t.ok(HL.S.started === true, 'fresh boot starts the career');
t.ok(HL.S.fans === 0 && HL.S.cash === 0, 'starts with no fans, no cash');
t.ok(HL.venueIdx() === 0, 'career begins in the bedroom');
t.ok(HL.aliasName() === 'DJ Nova', 'first alias is DJ Nova');
t.ok(HL.S.feed.length >= 1, 'welcome message in the feed');
rSafe('render() on fresh boot');

// ---- number formatting ----
t.ok(HL.fmt(999) === '999', 'fmt: plain under 1000');
t.ok(HL.fmt(1234) === '1.2k', 'fmt: thousands');
t.ok(HL.fmt(2.5e6) === '2.5M', 'fmt: millions');
t.ok(HL.fmt(150e9) === '150B', 'fmt: billions, no decimals past 100');

// ---- tapping: practice earns fans, combo builds and decays ----
const f0 = HL.S.fans;
HL.tap();
t.ok(HL.S.fans > f0, 'a tap earns fans');
t.ok(HL.S.stats.taps === 1, 'taps counted');
for (let i = 0; i < 10; i++) HL.tap();
t.ok(HL.S.combo > 1.5, 'rapid taps build a combo (' + HL.S.combo.toFixed(2) + ')');
t.ok(HL.S.combo <= C.COMBO_MAX + 1e-9, 'combo respects the cap');
step(3);
t.ok(HL.S.combo <= 1.01, 'combo decays when you stop tapping');

// ---- buy items: gated by cash, cost curve grows, passive fans flow ----
t.ok(HL.buyItem(0) === false, 'cannot buy headphones while broke');
HL.S.cash = 1000; HL.S.lifeCash = 1000;
const c0 = HL.itemCost(0);
t.ok(HL.buyItem(0) === true, 'buys headphones with cash');
t.ok(HL.S.items[0] === 1 && HL.S.cash === 1000 - c0, 'cash deducted, item counted');
t.ok(HL.itemCost(0) > c0, 'next copy costs more (x' + C.COST_MUL + ')');
t.ok(HL.fansPerSec() > 0, 'passive fans/sec now positive');
const fPassive = HL.S.fans;
step(10);
t.ok(HL.S.fans > fPassive + HL.fansPerSec() * 9, 'passive fans accumulate over time');
t.ok(HL.tapPow() > 1, 'tap power scales with fans/sec');

// ---- venue ladder ----
t.ok(C.VENUES.length === 6, 'six rungs from bedroom to festival');
HL.S.fans = 150; HL.tick(1 / 60);
t.ok(HL.venueIdx() === 1 && HL.S.bestVenue === 1, '100 fans unlocks the house party');
t.ok(HL.S.feed.some(f => f.msg.includes('House Party')), 'unlock announced in the feed');
HL.S.fans = 2600; HL.tick(1 / 60);
t.ok(HL.venueIdx() === 2, '2.5k fans unlocks the dive bar');
HL.S.fans = 61e3; HL.tick(1 / 60);
t.ok(HL.venueIdx() === 3, '60k fans unlocks the club');
HL.S.fans = 1.6e6; HL.tick(1 / 60);
t.ok(HL.venueIdx() === 4, '1.5M fans unlocks the warehouse');
HL.S.fans = 6e7; HL.tick(1 / 60);
t.ok(HL.venueIdx() === 5, '50M fans unlocks the festival main stage');
rSafe('render() at festival era');

// ---- fill: crowds grow as your fanbase outgrows the room ----
HL.S.fans = C.VENUES[1].req; // exactly at unlock
t.ok(Math.abs(HL.fill(1) - (0.25 + 0.75 * 0.25)) < 1e-9, 'room is ~44% full right at unlock');
HL.S.fans = C.VENUES[1].req * 100;
t.ok(HL.fill(1) === 1, 'fill caps at a packed room');
t.ok(HL.fill(0) === 1, 'the bedroom is always "full" (the cat has no choice)');

// ---- gig flow + THE DROP ----
HL.S.fans = 0; HL.S.bestVenue = 0; HL.S.cash = 0; HL.S.lifeCash = 0;
t.ok(HL.bookGig() === true, 'books a bedroom livestream');
t.ok(HL.bookGig() === false, 'cannot double-book');
const g = HL.S.gig;
t.ok(g.v === 0 && g.dur === C.VENUES[0].dur, 'gig runs at the current venue');
t.ok(g.dropAts.length === C.DROPS_BY_ERA[0], 'bedroom sets get one drop window');
t.ok(g.dropAts[0] >= g.dur * 0.2 && g.dropAts[0] <= g.dur * 0.8, 'drop is scheduled mid-set');
t.ok(g.reqAt === -1, 'the cat does not make requests (no requests in the bedroom)');
t.ok(HL.dropHit() === false, 'cannot hit a drop that has not opened');
g.dropAts = [0.5]; g.dropIdx = 0; // make the window deterministic
step(0.7);
t.ok(!!HL.S.gig.drop && HL.S.stats.drops === 1, 'the DROP window opened');
const cashPre = HL.S.cash;
t.ok(HL.dropHit() === true, 'hit the drop');
t.ok(HL.S.cash - cashPre >= g.pay * C.DROP_BONUS - 1e-9, 'drop pays an instant bonus');
t.ok(HL.S.stats.dropsHit === 1 && HL.S.gig.drop === null, 'drop consumed');
t.ok(HL.S.dropStreak === 1, 'drop streak started');
t.ok(g.hype >= C.HYPE_DROP - 0.05, 'hitting the drop hypes the crowd');
const fansPre = HL.S.fans, cashMid = HL.S.cash;
step(C.VENUES[0].dur);
t.ok(HL.S.gig === null, 'gig finished');
t.ok(HL.S.cash >= cashMid + g.pay - 1e-9, 'gig paid out cash');
t.ok(HL.S.fans >= fansPre + g.fans - 1e-9, 'gig earned fans');
t.ok(HL.S.stats.gigs === 1, 'gig counted');

// ---- missed drop expires AND kills the streak ----
HL.bookGig();
const g2 = HL.S.gig;
g2.dropAts = [0.2]; g2.dropIdx = 0;
step(0.4 + C.DROP_WIN);
t.ok(HL.S.gig && !HL.S.gig.drop && HL.S.gig.dropIdx === 1, 'unhit drop window expires harmlessly');
t.ok(HL.S.dropStreak === 0, 'missing a drop resets the streak');
step(C.VENUES[0].dur);
t.ok(HL.S.gig === null, 'that gig still completes');

// ---- crowd hype: taps during a live set multiply the payout ----
HL.bookGig();
const gH = HL.S.gig;
gH.dropAts = []; // no interruptions
t.ok(gH.hype === 0, 'sets start with a cold crowd');
for (let i = 0; i < 10; i++) HL.tap();
t.ok(gH.hype >= 10 * C.HYPE_TAP - 1e-9, 'working the decks builds hype');
const h0 = gH.hype;
step(2);
t.ok(gH.hype < h0, 'hype cools off if you stop');
gH.hype = 1; gH.t = gH.dur - 0.01;
const cashB = HL.S.cash;
step(0.1);
t.ok(HL.S.gig === null, 'hyped gig finished');
t.ok(HL.S.cash - cashB >= gH.pay * 1.9, 'a fully hyped crowd ~doubles the payout');

// ---- bigger venues: more drop windows, streaks chain across them ----
HL.S.fans = 1.6e6; HL.tick(1 / 60); // warehouse era
HL.bookGig();
const g3 = HL.S.gig;
t.ok(g3.dropAts.length === C.DROPS_BY_ERA[4] && C.DROPS_BY_ERA[4] === 3, 'warehouse sets schedule three drops');
g3.dropAts = [0.1, 0.5, 0.9]; g3.dropIdx = 0; g3.reqAt = -1;
step(0.2); HL.dropHit();
step(0.4); HL.dropHit();
step(0.4);
const streakPay = HL.S.cash;
HL.dropHit();
t.ok(HL.S.dropStreak === 3, 'streak counts consecutive hits across windows');
t.ok(HL.S.cash - streakPay >= g3.pay * C.DROP_BONUS * (1 + 3 * C.STREAK_BONUS) - 1, 'streak fattens each drop bonus');
HL.S.gig = null;

// ---- crowd requests: cash-or-cred decisions ----
HL.bookGig();
const gr = HL.S.gig;
gr.dropAts = []; gr.reqAt = 0.1; gr.req = null; gr.reqDone = false;
t.ok(HL.chooseReq(true) === false, 'no request yet, nothing to answer');
step(0.3);
t.ok(!!gr.req && gr.req.txt.length > 0, 'a crowd request appears mid-set');
const cashR = HL.S.cash;
t.ok(HL.chooseReq(true) === true, 'played the hit');
t.ok(HL.S.cash - cashR >= gr.pay * C.REQ_CASH - 1e-9, 'crowd-pleasing pays cash');
t.ok(!gr.req && gr.reqDone, 'request resolved');
HL.S.gig = null;
HL.bookGig();
const gr2 = HL.S.gig;
gr2.dropAts = []; gr2.reqAt = 0.1; gr2.req = null; gr2.reqDone = false;
step(0.3);
const fansR = HL.S.fans;
t.ok(HL.chooseReq(false) === true, 'stayed true to the sound');
t.ok(HL.S.fans - fansR >= gr2.fans * C.REQ_FANS - 1e-6, 'credibility pays fans');
HL.S.gig = null;
HL.bookGig();
const gr3 = HL.S.gig;
gr3.dropAts = []; gr3.reqAt = 0.1; gr3.req = null; gr3.reqDone = false;
step(0.3 + C.REQ_WIN);
t.ok(!gr3.req && gr3.reqDone, 'ignored requests just expire');
t.ok(HL.S.stats.requests === 2, 'answered requests counted');
HL.S.gig = null;

// ---- golden vinyl: the viral moment ----
HL.S.golden = null; HL.S.goldT = 0.05;
step(0.2);
t.ok(!!HL.S.golden, 'golden vinyl spawns when the timer fires');
const fG = HL.S.fans, cG = HL.S.cash, frG = HL.S.frenzyT;
t.ok(HL.tapGold() === true, 'grabbed the golden vinyl');
t.ok(HL.S.fans > fG || HL.S.cash > cG || HL.S.frenzyT > frG, 'viral moment pays out (fans, cash, or frenzy)');
t.ok(HL.S.golden === null && HL.S.goldT >= C.GOLD_MIN - 0.01, 'vinyl consumed, timer re-arms');
t.ok(HL.tapGold() === false, 'no vinyl, no reward');
t.ok(HL.S.stats.goldens === 1, 'viral moments counted');
HL.S.goldT = 0.05;
step(0.2);
HL.S.golden.t = 0.01;
step(0.1);
t.ok(HL.S.golden === null, 'an ignored vinyl fades away');

// ---- frenzy + item milestones multiply fans/sec ----
HL.S.frenzyT = 0;
const fpsCalm = HL.fansPerSec();
HL.S.frenzyT = 5;
t.ok(Math.abs(HL.fansPerSec() - fpsCalm * C.FRENZY_MUL) < 1e-6, 'frenzy multiplies fans/sec ×' + C.FRENZY_MUL);
step(6);
t.ok(HL.S.frenzyT <= 0, 'frenzy runs out');
const own0 = HL.S.items[0];
HL.S.items[0] = 9;
t.ok(HL.milestoneMul(0) === 1, 'no milestone below 10 owned');
HL.S.items[0] = 10;
t.ok(HL.milestoneMul(0) === 2, 'owning 10 doubles that item');
HL.S.items[0] = 100;
t.ok(HL.milestoneMul(0) === 16, 'all four milestones stack to ×16');
HL.S.items[0] = own0;

// ---- back to the bedroom for automation ----
HL.S.fans = 0; HL.S.bestVenue = 0;

// ---- booking agent automation ----
HL.S.cash = 0;
t.ok(HL.buyAgent() === false, 'cannot hire the agent while broke');
HL.S.cash = C.AGENT_COST + 100; HL.S.lifeCash += C.AGENT_COST + 100;
t.ok(HL.buyAgent() === true && HL.S.agent, 'agent hired');
t.ok(HL.buyAgent() === false, 'cannot hire twice');
step(C.REBOOK_T + 0.2);
t.ok(!!HL.S.gig, 'agent auto-books the next gig');
HL.S.gig.dropAts = []; HL.S.gig.reqAt = -1; // let it run out clean
step(C.VENUES[0].dur + 1);
step(C.REBOOK_T + 0.2);
t.ok(!!HL.S.gig, 'agent keeps rebooking after each gig');
HL.S.gig = null;

// ---- influence multiplies everything ----
const fpsBase = HL.fansPerSec();
HL.S.influence = 5;
t.ok(Math.abs(HL.mult() - (1 + 5 * C.INF_MUL)) < 1e-9, 'mult = 1 + 20% per influence');
t.ok(Math.abs(HL.fansPerSec() - fpsBase * HL.mult()) < 1e-6, 'influence multiplies fans/sec');
t.ok(HL.gigPay(0) > C.VENUES[0].pay, 'influence multiplies gig pay');
HL.S.influence = 0;

// ---- prestige: locked until you headline the festival ----
t.ok(HL.canPrestige() === false, 'prestige locked at boot');
HL.S.lifeFans = 4e9; // huge career, but never headlined
t.ok(HL.influenceGain() === 10, 'influence gain follows the cube root of lifetime fans');
t.ok(HL.canPrestige() === false, 'still locked without a festival headline set');
HL.S.stats.festGigs = 1;
t.ok(HL.canPrestige() === true, 'headlining the festival unlocks retirement');
HL.S.cash = 12345; HL.S.items[0] = 9;
const gain = HL.prestige();
t.ok(gain === 10, 'prestige returns the influence gained');
t.ok(HL.S.influence === 10 && HL.S.prestiges === 1, 'influence banked, prestige counted');
t.ok(HL.S.fans === 0 && HL.S.cash === 0 && HL.S.items[0] === 0, 'career reset: fans, cash, gear wiped');
t.ok(HL.aliasName() !== 'DJ Nova', 'reborn under a new alias (' + HL.aliasName() + ')');
t.ok(HL.prestige() === false, 'cannot prestige again immediately');
rSafe('render() after prestige');

// ---- save / load roundtrip ----
HL.S.fans = 777; HL.S.cash = 555; HL.S.lifeFans = 8888;
HL.S.items[1] = 3; HL.S.agent = true; HL.S.bestVenue = 2; HL.S.dropStreak = 4;
HL.save();
t.ok(!!store[C.SAVE_KEY], 'save written');
HL.reset();
t.ok(HL.S.fans === 0 && HL.S.items[1] === 0 && HL.S.influence === 0, 'reset wipes live state');
t.ok(HL.load() === true, 'load succeeds');
t.ok(HL.S.fans === 777 && HL.S.cash === 555, 'fans + cash restored');
t.ok(HL.S.items[1] === 3 && HL.S.agent === true, 'gear + agent restored');
t.ok(HL.S.influence === 10 && HL.S.prestiges === 1, 'influence + prestige count restored');
t.ok(HL.S.bestVenue === 2, 'venue progress restored');
t.ok(HL.S.dropStreak === 4, 'drop streak survives save/load');

// ---- offline earnings ----
let d = JSON.parse(store[C.SAVE_KEY]);
d.last = Date.now() - 3600 * 1000; // one hour away
store[C.SAVE_KEY] = JSON.stringify(d);
HL.reset(); HL.load();
t.ok(!!HL.S.offline, 'offline summary produced');
t.ok(HL.S.offline.fans > 0 && HL.S.fans > 777, 'passive fans piled up while away');
t.ok(HL.S.offline.cash > 0, 'agent-booked gigs earned cash while away');
t.ok(HL.S.feed.some(f => f.msg.includes('While you slept')), 'welcome-back message in the feed');
// offline time is capped
d = JSON.parse(store[C.SAVE_KEY]);
d.last = Date.now() - 100 * 3600 * 1000; // 100 hours away
store[C.SAVE_KEY] = JSON.stringify(d);
HL.reset(); HL.load();
t.ok(Math.abs(HL.S.offline.t - C.OFF_CAP) < 1, 'offline earnings cap at ' + (C.OFF_CAP / 3600) + 'h');

// ---- ambient flavor keeps the feed alive ----
HL.S.flavorT = 0.01;
step(0.1);
t.ok(HL.S.feed.some(f => f.msg.startsWith('💬')), 'era flavor lines appear in the feed');

// ---- music scheduler + render are headless-safe ----
try { HL.musicTick(); HL.musicTick(); t.ok(true, 'music scheduler runs headless'); }
catch (e) { t.ok(false, 'musicTick threw: ' + e.message); }
rSafe('render() with offline banner + feed');

// ---- long smoke: 60s of play with renders ----
HL.S.cash = 1e6; HL.S.lifeCash = 1e6;
for (let i = 0; i < 5; i++) HL.buyItem(i % C.ITEMS.length);
HL.bookGig();
for (let i = 0; i < 60 * 60; i++) { HL.tick(1 / 60); if (i % 30 === 0) HL.render(); if (i % 200 === 0) HL.tap(); }
t.ok(true, '60s mixed simulation with renders did not throw');

t.done();
