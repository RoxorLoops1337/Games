// Midnight Mog bots: determinism, output shape, the strong > greedy > random ordering, speed, and the TARGETS comparison.
import assert from 'node:assert/strict';
import { runBot, compareToTargets, compareOther, formatTable, stageAt, BOT_KINDS, BOT_POLICIES } from '../midnight_mog/js/bots/bots.js';
import { TARGETS } from '../midnight_mog/js/sim/economy.js';

const t0 = Date.now();
const lap = (label) => console.log('  ' + label + ' ' + (Date.now() - t0) + 'ms');

assert.deepEqual(BOT_KINDS, ['random', 'greedy', 'strong']);
assert.throws(() => runBot('nobody', { seed: 1, hours: 1 }));

// ---------------------------------------------------------------- shape and determinism (continuous play, 1 hour)
const a = runBot('strong', { seed: 3, hours: 1, continuous: true });
const b = runBot('strong', { seed: 3, hours: 1, continuous: true });
assert.deepEqual({ t: a.timeline, w: a.walls, s: a.stats }, { t: b.timeline, w: b.walls, s: b.stats }, 'same seed, same run');
const c = runBot('strong', { seed: 4, hours: 1, continuous: true });
assert.notDeepEqual(a.stats.pulls, c.stats.pulls, 'another seed plays another game');

assert.ok(a.timeline.length >= 4, 'marks at 2 min, 10 min, 30 min, 1 h');
assert.deepEqual(a.timeline.map((m) => m.h).slice(0, 4), [+(2 / 60).toFixed(4), +(10 / 60).toFixed(4), 0.5, 1]);
for (const m of a.timeline) {
  assert.ok(Number.isInteger(m.district) && m.district >= 1);
  assert.ok(Number.isInteger(m.stage) && m.stage >= 1 && m.stage <= 30);
  assert.equal((m.district - 1) * 30 + m.stage, m.gs);
  for (const k of ['fish', 'yarn', 'gems', 'tokens']) assert.ok(Number.isFinite(m.cur[k]) && m.cur[k] >= 0, 'currency ' + k);
}
for (let i = 1; i < a.timeline.length; i++) assert.ok(a.timeline[i].h > a.timeline[i - 1].h);
assert.ok(Array.isArray(a.walls));
for (const w of a.walls) { assert.ok(w.gs >= 1 && w.stalledMinutes >= 30); }
const st = a.stats;
for (const k of ['battles', 'wins', 'crates', 'resets', 'avgBattleSeconds']) assert.ok(Number.isFinite(st[k]) && st[k] >= 0, k);
assert.deepEqual(Object.keys(st.pulls), ['common', 'rare', 'epic', 'legend', 'mythic']);
assert.ok(st.battles >= 10 && st.wins >= 1 && st.wins <= st.battles, 'it fights and wins');
assert.ok(st.avgBattleSeconds > 20 && st.avgBattleSeconds < 400, 'avg battle seconds ' + st.avgBattleSeconds);
assert.ok(st.crates >= 1, 'it opens crates');
assert.equal(Object.values(st.pulls).reduce((x, y) => x + y, 0), Object.values(st.pullKinds).reduce((x, y) => x + y, 0), 'every pull counted once');
assert.ok(a.profile.cats && Object.keys(a.profile.cats).length > 3, 'the roster grew');
assert.ok(a.profile.town.plots.some((p) => p.b && p.level > 5), 'it upgraded the town');
assert.ok(a.profile.deck.length >= 5);
lap('shape');

// ---------------------------------------------------------------- targets table
const rows = compareToTargets({ strong: a });
assert.equal(rows.length, TARGETS.sessions.length);
for (const r of rows) {
  if (r.seconds <= 3600) {
    assert.ok(Number.isFinite(r.got.strong) && ['below', 'ok', 'above'].includes(r.verdict.strong), r.id);
    assert.equal(r.got.strong, stageAt(a, r.seconds));
  } else assert.equal(r.got.strong, undefined, 'no verdict past the simulated time');
}
const table = formatTable(rows, ['strong']);
assert.ok(table.includes('2min') && table.includes('1hour') && !table.includes(String.fromCharCode(0x2014)));
const other = compareOther(a);
assert.ok(other.some((o) => o.id === 'gemsPerActiveHour') && other.every((o) => ['ok', 'below', 'above', 'n/a'].includes(o.verdict)));
lap('targets');

// ---------------------------------------------------------------- strong > greedy > random, median over 5 seeds at 6 hours
// An engaged but human rhythm: a 10 minute session every hour for 6 hours.
const schedule = [0, 1, 2, 3, 4, 5].map((h) => ({ startHour: h, minutes: 10 }));
const median = (xs) => xs.slice().sort((x, y) => x - y)[Math.floor(xs.length / 2)];
const med = {};
for (const kind of BOT_KINDS) {
  const peaks = [];
  for (let seed = 1; seed <= 5; seed++) {
    const r = runBot(kind, { seed, hours: 6, schedule });
    assert.equal(r.stats.sessions, 6);
    peaks.push(stageAt(r, 6 * 3600));
  }
  med[kind] = median(peaks);
}
console.log('  median stage at 6h', JSON.stringify(med));
assert.ok(med.strong > med.greedy, 'strong ' + med.strong + ' beats greedy ' + med.greedy);
assert.ok(med.greedy > med.random, 'greedy ' + med.greedy + ' beats random ' + med.random);
lap('ordering');

// ---------------------------------------------------------------- the realistic default: 3 sessions a day, offline between
for (const kind of BOT_KINDS) {
  const s0 = Date.now();
  const r = runBot(kind, { seed: 2, hours: 24 });
  const ms = Date.now() - s0;
  assert.ok(ms < 60000, kind + ' 24h took ' + ms + 'ms');
  assert.equal(r.stats.sessions, 3, 'three sessions in the first day');
  assert.ok(r.timeline.length >= 27, 'marks every hour');
  assert.ok(r.stats.battles >= 3);
  // offline income kept the currencies growing between sessions while the progress did not move
  const gap = r.timeline.filter((m) => m.h > 2 && m.h < 12);
  assert.ok(gap.length >= 5 && gap.every((m) => m.gs === gap[0].gs), 'no progress while away');
  assert.ok(gap[gap.length - 1].cur.fish + gap[gap.length - 1].cur.yarn >= gap[0].cur.fish + gap[0].cur.yarn, 'offline earnings are counted');
}
lap('realistic');

// ---------------------------------------------------------------- speed: a continuous day must fit in a minute, so 2 hours in a tenth of that
{
  const s0 = Date.now();
  const r = runBot('strong', { seed: 5, hours: 2, continuous: true });
  const ms = Date.now() - s0;
  assert.ok(ms < 12000, '2h of continuous play took ' + ms + 'ms');
  assert.ok(r.stats.timeouts === 0, 'no battle ran into the 15 minute timeout');
}
lap('speed');

// exported policies are plain functions of (battle, state)
assert.equal(typeof BOT_POLICIES.strong.act, 'function');
console.log('midnight_mog bots ok in ' + (Date.now() - t0) + 'ms');
