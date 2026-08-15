// FROSTFELL — the playthrough probe.
//
// A bot plays whole runs end to end. It is not a good player: it deploys what
// it can, throws gear at whatever is in front, and rings the bell when it has
// nothing. That is the point — it measures the game, not the pilot, and it
// walks every screen transition a real run walks, which is where the crashes
// hide.
//
// The bot itself lives in ./frostfell_pilot.mjs so that a worker can import it
// without importing the arms below. This file is the READING: arms, bands,
// tables and assertions.
//
// Run: node tests/frostfell_run.test.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { ok, eq, done, section } from './frostfell_lib.mjs';
import { runJobs, JOBS, snapshot, absorb } from './frostfell_pool.mjs';
import {
  CARRIED, CROOM, DEFAULT_N, DENY, DRAFT, DRAFT_HABITS, DUCKS, FF, FROSTERS, G, HABITS, LIVE_HABITS, LANE, MEND, NO_SCARS, OFFERED, PLAYED, ROOM, SKILL, SOLD, TAUGHT, TELL, TITAN, TRIGGERS, bestSlot, botTurn, cardWorth, carefulItem, carefulSlot, carefulTurn, courseWanted, denySchemes, doomed, draftPick, draftTurn, erf, itemTarget, pickBiggest, playRun, sale, settleChoosers, soakerFirst, stripScars, threatOf, watchTitan, wounds,
  applyTweak, config,
} from './frostfell_pilot.mjs';

/* A tiny on-disk record of what each turned-up arm last said, so the summary
   the default check prints is a measurement rather than a comment. */
const ARMS_FILE = new URL('./.frostfell-arms.json', import.meta.url);
/* WHICH GAME A READING IS ABOUT, which a sample size cannot say.

   A stamp recorded what an arm said and how deep it ran, and nothing about WHEN
   — so `FF_CARDS` sat in the summary for two rounds quoting `coldbearer` and
   `backdrift` as the widest and best cards in the pool, months after both were
   cut. A guard now catches that particular shape, but only because card ids are
   the one part of a reading that can be validated; every NUMBER in every stamp
   has the same problem and nothing can check those.

   A date would answer "how old" and that is the wrong question — an arm run
   before a round that changed nothing it measures is not stale, and one run
   before a round that rewrote a course is, on the same day. What matters is
   whether the reading is about THIS GAME, so the stamp carries a fingerprint of
   the two files an arm actually measures: the game and the pilot. Same
   fingerprint, the reading still describes what is there; different, and the
   table says so in the summary instead of waiting for somebody to remember.

   It is deliberately coarse. Any edit to either file invalidates every reading,
   including edits that could not possibly matter — a comment, a colour. That
   over-reports and it is the right direction: a reading wrongly flagged costs a
   re-run, and a reading wrongly trusted costs a round of building on it. */
/* THE REST DIAL, FORCED FROM THE OUTSIDE. Shipping a one-fight rest lifted the
   COURSELESS BASELINE by eight points and pulled the ladder down 46 → 42, which
   is a strange result for a rule meant to make one fork a decision — a pilot
   that never chooses to walk should not be paid. Setting the dial for a whole
   run makes the question answerable: play the same ladder with the rest off and
   with it on, and read where the eight points landed. */
if (process.env.FF_RESTN !== undefined) FF.REST.fights = Number(process.env.FF_RESTN);
/* AND IT IGNORES WHAT CANNOT CHANGE A NUMBER, because the first cut did not and
   the consequence was immediate: the round that banked 13 of 13 current
   readings also wrote a page of comments into the game and the pilot, so the
   fingerprint moved before the commit landed and the banked set lasted zero
   rounds. A marker that invalidates itself faster than it can be cleared is not
   a marker, it is noise with a red light attached.

   There were two ways out — run the refresh as the genuinely last step after
   every edit, or stop counting edits that cannot affect a measurement — and the
   second is the only one that survives contact. The first is discipline, and
   discipline fails on the round somebody fixes a typo after running the arms.
   A COMMENT CANNOT CHANGE A WIN RATE. So block comments, whole-line comments
   and runs of whitespace come out before the hash: what is left is the code an
   arm actually exercises, and a round spent writing prose about measurements
   leaves every measurement standing.

   `//` is only stripped at the start of a line, because a bare one mid-line is
   as likely to be inside a URL or a string as it is to be a comment, and the
   cost of getting that wrong is a fingerprint that ignores real code. */
const BUILD = (() => {
  let h = 0x811c9dc5;
  for (const f of ['../frostfell/index.html', './frostfell_pilot.mjs']) {
    let src = '';
    try { src = readFileSync(new URL(f, import.meta.url), 'utf8'); } catch { src = f; }
    src = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^[ \t]*\/\/.*$/gm, ' ')
      .replace(/\s+/g, ' ');
    for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(36);
})();
const ARMS = {
  all: (() => { try { return JSON.parse(readFileSync(ARMS_FILE, 'utf8')); } catch { return {}; } })(),
  read(knob) { return this.all[knob] || null; },
  fresh(rec) { return !!rec && rec.build === BUILD; },
  /* Read-modify-write, because two arms turned up at once will otherwise
     clobber each other: both load the file at import and the second to finish
     wins. Found by running FF_LESSON and FF_MONEY in parallel and getting one
     reading out of two. */
  stamp(knob, said, sample) {
    let disk = {};
    try { disk = JSON.parse(readFileSync(ARMS_FILE, 'utf8')); } catch { disk = {}; }
    Object.assign(this.all, disk);
    this.all[knob] = { said, sample, build: BUILD };
    this.save();
  },
  save() { try { writeFileSync(ARMS_FILE, JSON.stringify(this.all, null, 1) + '\n'); } catch { /* read-only tree */ } },
};
/* Cards this game HAS HAD and cut. Not a graveyard for its own sake — it is the
   only way a check can tell "this word was a card and is not any more" from
   "this word is prose". Add an id here when you cut one. */
const GONE = new Set(['coldbearer', 'backdrift', 'grudgehorn', 'dawnpiper', 'trailmarshal', 'cairnwarden']);
const STANDING = [
  ['FF_ABLATE=60', 'which fight habits are worth anything, added and removed'],
  ['FF_LESSON=1', 'what a lesson is worth, and at what dose'],
  ['FF_MONEY=70', 'what a purse buys, one ware removed and one ware given'],
  ['FF_COURSE=150', 'the five courses against declaring nothing'],
  ['FF_PAIRS=70', 'fight habits two at a time — does any pair beat its halves'],
  ['FF_NOSCARS=1', 'the ladder with the scar rule switched off'],
  ['FF_CARDS=40', 'every card priced by taking it out of the offer'],
  ['FF_CALIBRATE=70', 'what a band actually is on this instrument — measured, not derived'],
  ['FF_LADDERBAND=1', 'the ladder total run at five seed bases — can this instrument read its own headline'],
  ['FF_VARIANCE=36', 'deck vs trail vs draw order — where a run is actually decided'],
  ['FF_REST=1', 'a lasting rest on the quiet road — does it make the fork a decision'],
  ['FF_DIAL=150', 'the two flat courses swept by magnitude — a dial or decoration'],
];
/* FOUR MORE CAME OFF THIS LIST, and the argument is what it costs to keep a
   reading current rather than what the arm once found.

   Every stamp now carries the build it was taken on and the summary prices a
   full refresh, which turned an abstract tidiness question into an arithmetic
   one: an arm earns its place if somebody would re-run it to answer something.
   Four would not.

     FF_PAIR      one pair of FF_PAIRS run deeper — a narrowing, like FF_HABIT
                  and FF_GIVE, so it cannot write a reading of its own
     FF_GEARBAR   the pilot's gear-timing dial, measured FLAT end to end at 450
                  a bar. A settled null on a knob nothing now depends on
     FF_NOWAVE    the ladder with the telegraph off: worth exactly 0 at 840 an
                  arm, and nothing downstream will turn on it again
     FF_LIVEBUILT folded into FF_BUILT, which takes FF_SIDES and runs live or
                  locked — one arm with two settings, not two arms
     FF_BUILT     SETTLED, and settled at a size nothing acts on. Five rounds
                  and 50,400 runs to land on +1.9 points for a gear-heavy
                  start — smaller than every rung on the ladder and inside the
                  ladder's own ±2.8 band. It does not justify a card, a charm,
                  a ware or a leader, and saying that plainly is the finding.
                  An arm whose answer is "this is too small to act on" has
                  finished its job

   That is rule 3 applied to the instrument rather than the record: **an arm
   whose reading nobody would pay to refresh is an arm nobody is reading.** The
   list is 14, and a full refresh is a number somebody might actually spend.

   FF_GIVE CAME OFF FOR A DIFFERENT REASON, and the argument is the
   file's own: it narrows FF_CARDS to a named handful the way FF_HABIT narrows
   FF_ABLATE to one habit, and it reports through FF_CARDS' table rather than
   writing a reading of its own. It read "no reading recorded — run it" for
   three rounds because it was listed as a thing that produces a reading and it
   is not one. A modifier listed as an arm is the same defect as an arm never
   run: the summary claims something about the state of the measurements that is
   not true.

   FF_HABIT, FF_CONTRAST, FF_VDECKS, FF_VSEED and FF_TIME are deliberately NOT
   here, and that is the answer to
   "six arms exist and three are stamped". Neither is an arm: FF_HABIT narrows
   FF_ABLATE to one habit so a single number can be run deep, and it reports
   through FF_ABLATE's own table; FF_CONTRAST prints how much text the contrast
   check paired and asserts nothing. FF_VDECKS and FF_VSEED re-deal the variance
   arm's decks — they change how wide or how differently-seeded that one arm is,
   the way FF_HABIT narrows FF_ABLATE, and the reading is stamped by FF_VARIANCE.
   FF_TIME prints a timing table and asserts nothing.

   An arm produces a reading somebody would quote a round later. A modifier and a
   print flag do not, and listing them
   beside arms is what made "three of six are stamped" look like rot when it was
   a miscount. */

/* --------------------------------------------------- the band, everywhere -- */
/* LAST ROUND PROVED THE PRINTED BAND WRONG AND THEN LEFT EVERY NUMBER QUOTED
   AGAINST IT. This is the fix, and it has two halves.

   The first half is that the formula was being applied to the wrong quantity.
   `sqrt(p(1-p)/n)` is the standard deviation of ONE arm. Almost nothing in this
   file is one arm: a rung is a DIFFERENCE of two, an interaction is built from
   four. A difference of two independent arms carries √2 times a row's band and
   an interaction carries 2×, and for six rounds both were compared against a
   single row's.

   The second half is that the arms are not independent — they play the same
   seeds, so they differ only by what the pilot did with an identical trail, and
   the real band on a difference is narrower than any formula says. That is
   measured, not derived: the same comparison at five seed bases, and the spread
   of the answers is the band.

   The two errors point opposite ways and roughly cancel, which is why nothing
   ever looked obviously wrong. `FF_CALIBRATE=n` measures both correction
   factors and stamps them; every band in this file is then the derived formula
   for the right SHAPE, divided by the measured factor for that shape. Without a
   stamp the factors are 1 and the suite says so rather than pretending. */
const CAL = (() => {
  const rec = ARMS.read('FF_CALIBRATE=70');
  const f = (rec && rec.factors) || null;
  return { gap: (f && f.gap) || 1, inter: (f && f.inter) || 1, measured: !!f, at: rec ? rec.sample : 0 };
})();
/* THE FAMILY BAR, HOISTED — it existed once, buried in the card arm, and that is
   why the wares and the courses have been printed for a dozen rounds with no bar
   at all and read by eye.

   Asking k questions at once and taking the best answer inflates the error rate
   k-fold. Bonferroni holds the FAMILY error at 5% by demanding more of each test:
   at 60 cards that is 3.34σ and almost nothing ever clears, which is the honest
   price of a fishing trip. At 8 wares it is 2.50σ and at 6 courses 2.39σ — bars a
   real effect can actually clear. A small named family is not a weaker standard,
   it is the same standard applied to a question somebody actually asked. */
function familyZ(k) {
  const pf = 0.05 / (2 * Math.max(1, k));
  let lo = 0, hi = 6;
  const tail = (x) => 0.5 * (1 - erf(x / Math.SQRT2));
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (tail(mid) > pf) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/* A VALUE INSIDE ITS OWN BAND IS A RANGE, AND IT PRINTS AS ONE — everywhere,
   not just on the ladder.

   The ladder started marking unresolved rungs with a `?` because it was
   printing `steering +2` as a headline above a five-base measurement of +7.6,
   in the same output. That was a local fix to a general problem: every table in
   this file prints differences, every one of them has a band, and every one of
   them has at some point had a number read off it that its sample could not
   support. The courses table did it for three rounds; the habit tables did it
   for six.

   So the convention is one function. `gap(d, band)` renders a difference with a
   `?` when it is inside twice its band, and nothing else in the file is allowed
   to render one by hand — which is the only way a convention stays a convention
   rather than becoming a thing one table does. */
const RANGE = (d, band, dp) => {
  const n = dp === undefined ? (Math.abs(d) < 10 ? 1 : 0) : dp;
  const txt2 = `${d >= 0 ? '+' : ''}${d.toFixed(n)}`;
  return Math.abs(d) >= 2 * band ? txt2 : txt2 + '?';
};
const BAND = {
  /* one arm's own spread */
  row: (p, n) => 100 * Math.sqrt(p * (1 - p) / Math.max(1, n)),
  /* two arms on the same seeds: √2 for the shape, then the measured narrowing */
  gap(p, n) { return this.row(p, n) * Math.SQRT2 / CAL.gap; },
  /* four arms: 2× for the shape, then the measured narrowing */
  inter(p, n) { return this.row(p, n) * 2 / CAL.inter; },
  /* a set against the sum of its k parts: p_all + (k−1)·p_0 − Σp_k */
  set(p, n, k) { return this.row(p, n) * Math.sqrt(1 + (k - 1) * (k - 1) + k) / CAL.gap; },
  note() {
    return CAL.measured
      ? `bands below are MEASURED: a gap is ${CAL.gap.toFixed(2)}x narrower than the formula and an interaction ${CAL.inter.toFixed(2)}x (calibrated at ${CAL.at} an arm)`
      : 'bands below are DERIVED and known to be too wide — FF_CALIBRATE=70 measures them';
  },
};

/* ---------------------------------------------------------------- the run -- */
section('whole runs, start to finish');
{
  // Eight seeds a tribe is what the suite can afford. FF_RUNS turns the same
  // instrument up when the question is 'is this gap real' rather than 'does
  // this still run' — at N=8 the whole spread is two or three runs wide, which
  // is noise, and pretending otherwise would be worse than not measuring.
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
  const tribes = ['hearth', 'frost', 'scrap'];
  /* THE SLOWEST MEASUREMENT IN THE FILE, POOLED — and the reason it took an extra
     round to get here is worth writing down.

     The runs were never the obstacle: this sweep reads nothing but the `stat`
     each run returns, so a thread boundary is invisible to it. What blocked it
     was everything read AFTERWARDS. The pilot fills thirteen module-level
     counters as it plays, and a dozen tables at the bottom of this file read
     them believing they hold every run the probe ever did. Pooling the ladder
     without carrying those home would have quietly subtracted 840 runs from all
     of them, with no assertion failing and the tables reading "this card is
     never played" — a conclusion this project has already acted on twice.

     So the pool absorbs each worker's counters exactly once, and the suite
     asserts inline and pooled produce identical ones. With that, the honest
     answer to "why is the ladder excluded" is that it no longer is.

     Twelve jobs, not four sweeps of three: four modes x three tribes go out in
     ONE call, so the threads stay fed to the end instead of draining three
     times over. */
  const tally = (stats) => {
    const out = { wins: 0, stuck: 0, reachedTwo: 0, reachedThree: 0, turns: 0, battles: 0, runs: 0,
      died: [0, 0, 0], killers: {}, vanished: 0, vanishedAt: {}, thrown: null };
    for (const s of stats) {
        out.runs++;
        if (s.won) out.wins++;
        if (s.stuck) out.stuck++;
        if (s.zone >= 1) out.reachedTwo++;
        if (s.zone >= 2) out.reachedThree++;
        if (!s.won && s.diedZone === undefined && !s.stuck) {
          out.vanished++;
          const where = s.ranOut ? 'ran out of turns on ' + s.spunOn : (s.lostAt || 'unknown');
          out.vanishedAt[where] = (out.vanishedAt[where] || 0) + 1;
        }
        if (!s.won && s.diedZone !== undefined) {
          out.died[Math.min(2, s.diedZone)]++;
          if (s.diedZone >= 2) out.killers[s.killedBy] = (out.killers[s.killedBy] || 0) + 1;
        }
        out.turns += s.turns;
        out.battles += s.battles;
    }
    return out;
  };
  const MODES = ['careless', 'tactics', 'trader', 'careful', 'router'];
  const sweepMany = async (modes, tweak, base = 1000) => {
    const jobs = [];
    for (const mode of modes) for (const tribe of tribes) {
      jobs.push({ tribes: [tribe], n: N, base, step: 37, mode, tweak, stats: true });
    }
    let answers;
    try { answers = await runJobs(jobs); }
    catch (e) { const bad = tally([]); bad.thrown = String(e && e.message || e); return modes.map(() => bad); }
    return modes.map((m, mi) => tally(
      answers.slice(mi * tribes.length, (mi + 1) * tribes.length).flatMap((a) => a.stats)));
  };
  const [careless, tactics, trader, careful, router] = await sweepMany(MODES);

  /* CAN THIS INSTRUMENT RESOLVE ITS OWN HEADLINE NUMBER? It had never been asked.

     The ladder total has read 30, 28 and 27 across three near-identical builds,
     and the response was to widen the target to 26-32 — a six-point window on
     the one number that is supposed to say whether the game rewards skill. That
     is either a real spread or an admission that the number cannot be read, and
     the difference is measurable the same way the gap and interaction bands
     were: run the whole ladder at five different seed bases and take the spread
     of the answers. No formula, no independence assumption. */
  if (process.env.FF_LADDERBAND) {
    const bases = [1000, 4000, 7000, 11000, 15000];
    const totals = [], rungs = [[], [], []];
    for (const bse of bases) {
      const arms = await sweepMany(MODES, undefined, bse);
      const p = arms.map((o) => Math.round((o.wins / Math.max(1, o.runs)) * 100));
      totals.push(p[3] - p[0]);
      rungs[0].push(p[1] - p[0]); rungs[1].push(p[2] - p[1]); rungs[2].push(p[3] - p[2]);
    }
    const sd = (xs) => {
      const mu = xs.reduce((n, v) => n + v, 0) / xs.length;
      return Math.sqrt(xs.reduce((n, v) => n + (v - mu) * (v - mu), 0) / (xs.length - 1));
    };
    const sdT = sd(totals);
    console.log(`    THE TOTAL'S OWN SPREAD, at five seed bases, ${tribes.length * N} runs an arm:`);
    console.log(`      totals: ${totals.join(', ')} — sd ±${sdT.toFixed(1)}, so 2σ is ±${(2 * sdT).toFixed(1)}`);
    ['the fight', 'the trader', 'steering'].forEach((nm, k) => {
      console.log(`      ${nm.padEnd(12)} ${rungs[k].join(', ')} — sd ±${sd(rungs[k]).toFixed(1)}`);
    });
    console.log(`      → the ladder cannot detect a change smaller than ${(2 * sdT).toFixed(0)} points, ` +
      `and no single-point move anywhere in this file means anything`);
    ARMS.stamp('FF_LADDERBAND=1', `the total reads ${totals.join('/')} at five bases — sd ±${sdT.toFixed(1)}, ` +
      `so nothing under ${(2 * sdT).toFixed(0)} points is detectable`, tribes.length * N);
  }
  const sweep = (mode, tweak) => tally(
    [].concat(...tribes.map((tribe) => inlineStats(tribe, mode, tweak))));
  const inlineStats = (tribe, mode, tweak) => {
    const out = [];
    for (let i = 0; i < N; i++) out.push(playRun(tribe, 1000 + i * 37, mode, tweak));
    return out;
  };
  eq(careless.thrown, null, 'no careless run throws');
  eq(tactics.thrown, null, 'no tactics-only run throws');
  eq(trader.thrown, null, 'no trader run throws');
  eq(careful.thrown, null, 'no careful run throws');
  eq(careless.runs, tribes.length * N, 'every careless run finished one way or the other');
  eq(careful.runs, tribes.length * N, 'and so did every careful one');
  eq(careless.stuck + tactics.stuck + trader.stuck + careful.stuck, 0, 'no fight goes round forever');
  ok(careless.battles > careless.runs, 'runs contain more than one fight');

  /* A run that ends without a victory AND without a death did not end — the
     bot fell out of its own loop, and every number above it is a lie by that
     much. This has bitten three times now (unhandled screens twice, and a
     turn budget the third), so it is an assertion rather than a note. */
  for (const [nm, o] of [['careless', careless], ['fight', tactics], ['trader', trader], ['careful', careful]]) {
    if (o.vanished) {
      console.log(`    ! ${nm}: ${o.vanished} runs ended without a victory or a death — ` +
        Object.entries(o.vanishedAt).map(([k, v]) => `${k} ${v}`).join(', '));
    }
    eq(o.vanished, 0, `every ${nm} run reaches an ending`);
  }

  const pct = (o) => Math.round((o.wins / Math.max(1, o.runs)) * 100);

  /* THE SHAPE OF A RUN, drawn rather than tabulated.

     Each row is one pilot, and the bar is where its runs ENDED: how many fell
     in the first zone, the second, the third, and how many crossed. Read left
     to right it is the trail itself, and the block that grows as you go down
     the rows is the whole point of the instrument. */
    const glyph = { 0: '░', 1: '▒', 2: '▓', win: '█' };
  const shape = (o) => {
    const wide = 48;
    const cells = [o.died[0], o.died[1], o.died[2], o.wins];
    const keys = [0, 1, 2, 'win'];
    let out = '';
    cells.forEach((n, i) => { out += glyph[keys[i]].repeat(Math.round(wide * n / Math.max(1, o.runs))); });
    return out.padEnd(wide).slice(0, wide);
  };
  const rows = [['careless', careless], ['+ the fight', tactics],
    ['+ the trader', trader], ['+ steering the pool', careful],
    ['+ choosing its road', router]];
  console.log('');
  console.log(`    ${''.padEnd(20)}${'zone 1 ░   zone 2 ▒   zone 3 ▓   crossed █'.padEnd(48)}  won`);
  for (const [name, o] of rows) {
    console.log(`    ${name.padEnd(20)}${shape(o)}  ${String(pct(o) + '%').padStart(4)}`);
  }
  console.log('');
  /* A RUNG PRINTS WITH THE BAND IT WAS MEASURED AT, and one that cannot clear
     its own band says so instead of quoting a number.

     `steering the pool` read +6 one round and +2 the next in this very table,
     while the five-base measurement underneath it says +7.6 ± 1.2 — so the
     headline and the finding disagreed, in the same output, with the headline
     read first. That is worse than either alone. The table is not wrong to
     print a rung; it is wrong to print it as though 210 runs an arm could
     support it. A rung is a DIFFERENCE of two arms, so its band is
     `1.29·√(p₁q₁/n + p₂q₂/n)·100`, and anything inside twice that is a range
     rather than a value. */
  const rungBand = (a, z) => {
    const p1 = a.wins / Math.max(1, a.runs), p2 = z.wins / Math.max(1, z.runs);
    return 1.29 * Math.sqrt(p1 * (1 - p1) / Math.max(1, a.runs) + p2 * (1 - p2) / Math.max(1, z.runs)) * 100;
  };
  const rung = (a, z) => {
    const d = pct(z) - pct(a);
    const b = 2 * rungBand(a, z);
    return `${d >= 0 ? '+' : ''}${d}${Math.abs(d) >= b ? '' : '?'}`.padStart(5);
  };
  /* THREE RUNGS, NOT FOUR — decided by running the fourth at twenty times the
     sample rather than by taste.

     Two of the four printed `?` last round, so the sizing table was taken at its
     word and `choosing its road` was run at the 517 an arm it asked for. It came
     back **+8 against a 2σ band of 8.0** — on the boundary, still a range — and
     `steering the pool` came back +3 and wanted 3,667 an arm. So at 516 runs, 20x
     what the check can afford, the two small rungs are STILL not values, and at
     the sample the check actually runs (210 an arm, band ±12.5) they never will
     be. A rung that cannot be read at any sample this project will pay for is not
     a measurement, it is a decoration with a number on it.

     `careful` and `router` are folded because they are the same habit seen twice:
     one steers the CARD POOL toward what the deck wants, the other steers the
     TRAIL toward the fights the deck can take. Separately they read +3 and +8
     against ±8; together they read +11 and clear. The five pilot modes are
     untouched and the shape chart below still draws all five rows — this changes
     what the ladder claims to have measured, not what it ran. */
  const RUNGS = [['the fight', careless, tactics], ['the trader', tactics, trader],
    ['steering the run', trader, router]];
  const total = pct(router) - pct(careless);
  const totalBand = 2 * rungBand(careless, router);
  console.log('    what each thing is worth:  ' +
    RUNGS.map(([n2, a, z]) => `${n2} ${rung(a, z)}`).join('   ') +
    `   = ${total} ± ${totalBand.toFixed(0)} points, all told`);
  console.log(`    (steering the run is the trader's pool and the trail together — apart, here, ` +
    `${rung(trader, careful).trim()} and ${rung(careful, router).trim()}; at 516 runs an arm ` +
    `they read +3 and +8 against a ±8 band, which is why they are one rung)`);
  {
    const soft = RUNGS
      .filter(([, a, z]) => Math.abs(pct(z) - pct(a)) < 2 * rungBand(a, z));
    console.log(`    (a rung marked ? is inside its own 2σ band at this sample and is a RANGE, not a value` +
      `${soft.length ? ': ' + soft.map(([n2, a, z]) => `${n2} is somewhere in 0..${Math.round(2 * rungBand(a, z))}`).join(', ') : ''})`);
    /* WHAT IT WOULD TAKE — and the factor of four that was missing, found by
       following this table's own advice and watching it fail.

       It said `choosing its road` would resolve at 517 runs an arm. Run at 516
       it read +8 with a 2σ band of 8.0: on the line, still a `?`. Not bad luck —
       the formula solved `2σ = Δ`, which is by construction the sample where the
       effect sits EXACTLY on its band and clearing is a coin flip. The three
       earlier successes (the decks, the courses, the five-base rung) cleared
       because their effects came in bigger than the Δ they were sized for, which
       is luck wearing the costume of a method.

       Resolving means being comfortably inside, so size for the BAND you want
       rather than the effect you expect: 2σ ≤ Δ/2, which is 4x the runs. The
       rule in DESIGN.md now says this for all three of its forms. */
    for (const [n2, a, z] of soft) {
      const p1 = a.wins / Math.max(1, a.runs), p2 = z.wins / Math.max(1, z.runs);
      const want = Math.max(3, Math.abs(pct(z) - pct(a)));
      const need = Math.pow(1.29 * 100 * 4 / want, 2) * (p1 * (1 - p1) + p2 * (1 - p2));
      console.log(`      to resolve ${n2} at ${want} points (band ≤ ${(want / 2).toFixed(1)}): ` +
        `${Math.round(need)} runs an arm (FF_RUNS=${Math.round(need / tribes.length)}), ` +
        `against ${a.runs} here`);
    }
  }
  for (const [name, o] of rows) {
    console.log(`    ${name.padEnd(20)}${(o.battles / Math.max(1, o.runs)).toFixed(1)} fights a run · ` +
      `${(o.turns / Math.max(1, o.battles)).toFixed(1)} turns a fight · ` +
      `${o.reachedTwo}/${o.runs} saw the second zone, ${o.reachedThree} the third`);
  }

  /* FF_NOSCARS had no headline for three rounds, which is why it sat in the
     README as an arm and never wrote a reading: a control that changes the
     whole game and is read by eye cannot stamp anything. Give it the one number
     it is actually about — what the ladder does with the rule switched off —
     and it becomes an arm like the others. */
  if (NO_SCARS) {
    ARMS.stamp('FF_NOSCARS=1', `with every scar wiped: ${rows.map(([n2, o]) => n2.replace('+ ', '') + ' ' + pct(o) + '%').join(', ')}`,
      tribes.length * N);
  }

  /* WAS THE TRADER'S RUNG COMPRESSED, OR DID IT ACTUALLY FALL?

     Shipping the telegraph took the trader from +18 to +13 and that was written
     off in one sentence as "a floor that rises compresses everything above it".
     That is a hypothesis dressed as an explanation, and it was compared against
     a reading taken from a DIFFERENT BUILD a round earlier, which is the same
     mistake the fight ablation made for four rounds.

     So: same build, same seeds, one flag down. And say what compression
     actually predicts rather than gesturing at it. A rung that is unchanged in
     STRENGTH multiplies the odds of winning by a constant — odds, not points,
     because points cannot be constant when a floor moves. If the odds ratios
     hold and only the point gaps shrink, compression is the whole story. If an
     odds ratio falls, that rung genuinely got weaker and the sentence was
     wrong. */
  if (process.env.FF_NOWAVE) {
    const odds = (p) => (p <= 0 ? 0 : p >= 100 ? Infinity : (p / 100) / (1 - p / 100));
    const before = FF.WAVE_TELL.on;
    FF.WAVE_TELL.on = false;
    const off = [sweep('careless'), sweep('tactics'), sweep('trader'), sweep('careful')];
    FF.WAVE_TELL.on = before;
    const on = [careless, tactics, trader, careful];
    const names = ['the fight', 'the trader', 'steering the pool'];
    console.log('');
    console.log('    the telegraph, against the same build with the flag down:');
    console.log(`      ${'rung'.padEnd(20)}${'off'.padStart(12)}${'on'.padStart(12)}` +
      `${'odds ratio off'.padStart(16)}${'on'.padStart(8)}`);
    console.log(`      ${'careless (the floor)'.padEnd(20)}` +
      `${String(pct(off[0]) + '%').padStart(12)}${String(pct(on[0]) + '%').padStart(12)}`);
    /* An odds ratio wants both ends strictly between 0 and 100. At a sample
       small enough to produce a 0% rung it is not a number, and printing one
       anyway is how a divide-by-epsilon ends up in a table looking like data. */
    const ratio = (lo, hi) => {
      const a2 = odds(lo), z2 = odds(hi);
      return (a2 > 0 && Number.isFinite(a2) && Number.isFinite(z2)) ? z2 / a2 : null;
    };
    const show = (r) => (r === null ? '—' : r.toFixed(2));
    const pts = (a2, z2) => { const d = pct(z2) - pct(a2); return (d >= 0 ? '+' : '') + d; };
    const ors = [];
    for (let i = 0; i < 3; i++) {
      const oOff = ratio(pct(off[i]), pct(off[i + 1]));
      const oOn = ratio(pct(on[i]), pct(on[i + 1]));
      ors.push({ name: names[i], oOff, oOn });
      console.log(`      ${names[i].padEnd(20)}${pts(off[i], off[i + 1]).padStart(12)}` +
        `${pts(on[i], on[i + 1]).padStart(12)}${show(oOff).padStart(16)}${show(oOn).padStart(8)}`);
    }
    /* And the arithmetic the sentence owed: hold every odds ratio at its
       flag-down value, move the floor to where the telegraph put it, and read
       off what each rung SHOULD be worth in points if nothing but the floor
       changed. */
    let p = pct(on[0]);
    const predicted = [];
    for (const r of ors) {
      if (r.oOff === null) { predicted.push(null); continue; }
      const o2 = odds(p) * r.oOff;
      const next = 100 * o2 / (1 + o2);
      predicted.push(Math.round(next - p));
      p = next;
    }
    console.log(`      if ONLY the floor moved (${pct(off[0])}% → ${pct(on[0])}%), the rungs would read ` +
      predicted.map((d, i) => `${names[i]} ${d === null ? '—' : (d >= 0 ? '+' : '') + d}`).join(', '));
    console.log('      they actually read ' +
      names.map((n2, i) => {
        const d = pct(on[i + 1]) - pct(on[i]);
        return `${n2} ${d >= 0 ? '+' : ''}${d}`;
      }).join(', '));
    ARMS.stamp('FF_NOWAVE=1', `floor ${pct(off[0])}% → ${pct(on[0])}%; ` +
      `trader +${pct(off[2]) - pct(off[1])} → +${pct(on[2]) - pct(on[1])} against ` +
      `${predicted[1] === null ? '—' : '+' + predicted[1]} predicted by compression alone`,
      tribes.length * N);
    ok(off.every((o) => o.thrown === null), 'the flag-down ladder runs clean too');
  }

  /* What is actually killing a competent pilot in the last zone. A zone that
     kills is a difficulty setting; a zone where the same three things kill
     every time is a design problem, and telling them apart needs the names. */
  if (TITAN.fights) {
    console.log(`    the Kettle Titan: ${TITAN.fights} fights · ` +
      `frost in hand on ${Math.round(100 * TITAN.turnsWithFrost / Math.max(1, TITAN.turns))}% of turns facing it`);
  }
  const lastZone = Object.entries(careful.killers).sort((a, z) => z[1] - a[1]);
  const totalLate = lastZone.reduce((n, [, v]) => n + v, 0);
  console.log('');
  if (!totalLate) console.log('    what ends a good run in the last zone: nothing — nobody died there');
  else {
    console.log(`    what ends a good run in the last zone (${totalLate} deaths):`);
    for (const [k, v] of lastZone.slice(0, 5)) {
      console.log(`      ${String(Math.round(100 * v / totalLate) + '%').padStart(4)}  ` +
        `${'█'.repeat(Math.round(24 * v / totalLate)).padEnd(24)} ${k} (${v})`);
    }
  }

  // Neither end may collapse: a walkover for the careless pilot means nothing
  // in the game asks anything, and a careful pilot who never wins means the
  // skill on offer buys nothing.
  ok(careless.wins < careless.runs, 'a careless pilot does not win every run');
  ok(careless.reachedTwo > 0, 'a careless pilot does get somewhere');

  /* The ordering — careful beats careless — is only checked when the sample
     can carry it. At the suite's default eight seeds a tribe the whole spread
     is two or three runs wide, and an assertion that fails on noise teaches
     the next person to ignore it. Run FF_RUNS=25 to hold the game to it. */
  if (N >= 20) {
    ok(careful.wins >= careless.wins, 'playing well is never worse than playing badly');
    ok(careful.reachedTwo >= careless.reachedTwo, 'and it gets further along the trail');
    /* What is held to a bar is the WHOLE gap, not any one rung of it.

       An earlier version of this line demanded the trader be worth six points
       on its own, and that expectation is exactly what this round set out to
       break: when tempering lived only at the trader it was worth fourteen
       points, and that is not a healthy economy, it is a single node on a map
       of nine deciding the run. With the same strength reachable at a camp and
       on the reward screen, being penniless is survivable and the trader's own
       rung is small. The rungs move between iterations; the total is the thing
       that must not collapse. */
    ok(pct(careful) - pct(careless) >= 12, 'playing well, all told, is worth a good deal');
  } else {
    ok(true, `skill ordering not checked at ${N} seeds a tribe — too few to mean anything`);
  }
  const tpf = careless.turns / Math.max(1, careless.battles);
  ok(tpf > 3 && tpf < 60, 'fights last a sane number of turns');
}

/* ------------------------------------------------------ cards in practice -- */
/* ------------------------------------------------------------- economy --- */
/* Does money do anything?

   A resource that does not change the outcome is decoration, and the honest
   way to find out is to take it away and to give away far too much of it, and
   see whether the run notices. `prices` is the multiplier winters already use,
   so this is the game's own lever rather than a new one: at 0.02 everything in
   every shop is free, at 40 nothing is ever affordable. If those two runs land
   on the same win rate, the trader is scenery. */
section('does money change anything');
{
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
  const tribes = ['hearth', 'frost', 'scrap'];
  /* THIS SECTION WAS 21 SECONDS OF THE PROBE'S 82 AND NOBODY KNEW, because for
     two rounds running the answer to "where does the time go" was reasoned about
     rather than measured — and was wrong both times, once blaming three arms
     that are switched off. `FF_TIME=1` prints the per-section table now.

     Three arms of N here, all plain win rates, none reading a counter back.
     `armsOf` turns a list of tweaks into one pooled call. */
  const armsOf = async (tweaks, mode = 'careful') => {
    const answers = await runJobs(tweaks.flatMap((tweak) =>
      tribes.map((tribe) => ({ tribes: [tribe], n: N, base: 1000, step: 37, mode, tweak }))));
    return tweaks.map((_, k) => {
      const part = answers.slice(k * tribes.length, (k + 1) * tribes.length);
      const wins = part.reduce((a2, x) => a2 + x.wins, 0);
      const runs = part.reduce((a2, x) => a2 + x.runs, 0);
      return { wins, runs, pct: Math.round((wins / Math.max(1, runs)) * 100) };
    });
  };
  /* FF_MONEY turns the economy arm up on its own, the way FF_ABLATE does the
     habits and FF_COURSE does the courses. It read eight points in one run and
     one in the next at 210 runs an arm, which is the same "band wider than the
     effect" mistake in a third place. */
  const MN = Number(process.env.FF_MONEY || 0);
  const armsM = async (tweaks) => {
    if (!MN) return armsOf(tweaks);
    const answers = await runJobs(tweaks.flatMap((tweak) =>
      tribes.map((tribe) => ({ tribes: [tribe], n: MN, base: 1000, step: 37, mode: 'careful', tweak }))));
    return tweaks.map((_, k) => {
      const part = answers.slice(k * tribes.length, (k + 1) * tribes.length);
      const wins = part.reduce((a2, x) => a2 + x.wins, 0);
      const runs = part.reduce((a2, x) => a2 + x.runs, 0);
      return { wins, runs, pct: Math.round((wins / Math.max(1, runs)) * 100) };
    });
  };
  if (MN) console.log(`    (money turned up: ${3 * MN} runs an arm)`);
  const [normal, broke, rich] = await armsM([null,
    { set: { gold: 0, prices: 40 } },
    { set: { gold: 400, prices: 0.02 } }]);
  /* Every number in this section is a proportion out of the same handful of
     runs, so it carries a band: one standard deviation, in points, computed up
     front and printed below, so nobody reads a four-point difference as a
     finding. Several of this iteration's dead ends were exactly that mistake
     made twice. */
  const band = BAND.gap(0.35, normal.runs).toFixed(1);

  const bar = (n) => '█'.repeat(Math.round(n / 2)).padEnd(30);
  console.log(`    ${'penniless'.padEnd(19)}${bar(broke.pct)} ${String(broke.pct + '%').padStart(4)}`);
  console.log(`    ${'as it ships'.padEnd(19)}${bar(normal.pct)} ${String(normal.pct + '%').padStart(4)}`);
  console.log(`    ${'a bottomless purse'.padEnd(19)}${bar(rich.pct)} ${String(rich.pct + '%').padStart(4)}`);
  console.log(`    → money is worth ${normal.pct - broke.pct} points of win rate`);
  /* AND WHAT THE PURSE BOUGHT. The gap between "as it ships" and "bottomless"
     has been printed for rounds without anyone asking which ware it is. Give a
     rich pilot everything except one thing at a time: whatever it cannot do
     without is where the money goes. */
  if (MN) {
    const WARES = ['meal', 'bell', 'temper', 'charm', 'card', 'heal', 'sigil', 'burn'];
    const noBuyArms = await armsM(WARES.map((w) => ({ set: { gold: 400, prices: 0.02, noBuy: { [w]: 1 } } })));
    const rows = WARES.map((w, k) => [w, noBuyArms[k].pct, rich.pct - noBuyArms[k].pct]);
    rows.sort((a2, z) => z[2] - a2[2]);
    console.log('    what a bottomless purse is actually buying (rich, minus one ware):');
    for (const [w, pct, drop] of rows) {
      console.log(`      no ${w.padEnd(8)} ${bar(pct)} ${String(pct + '%').padStart(4)}  ` +
        (drop > 0 ? `−${drop} of the ${rich.pct - normal.pct}` : 'no cost'));
    }
    /* And the same question from the other end: a penniless pilot handed one
       ware for nothing. If one of them closes most of the gap it is that ware;
       if they all close a little, the gap is the economy and not a ware, and
       the word "compounding" can be retired. */
    const FREE = ['meal', 'charm', 'temper', 'bell', 'card', 'heal', 'sigil', 'burn'];
    const freeArms = await armsM(FREE.map((w) => ({ set: { gold: 0, prices: 40, freeWare: w } })));
    const up = FREE.map((w, k) => [w, freeArms[k].pct, freeArms[k].pct - broke.pct]);
    up.sort((a2, z) => z[2] - a2[2]);
    ARMS.stamp('FF_MONEY=70', `${rows[0][0]} is −${rows[0][2]} of ${rich.pct - normal.pct} removed; ` +
      `free ${up[0][0]} is +${up[0][2]} given`, 3 * MN);
    /* AND THE BAR, WHICH THIS TABLE HAS NEVER HAD. Eight wares is a family of
       eight: 2.50σ, not 2.0. Printed against the same measured band the rest of
       the file uses, so "meal is the biggest" and "meal is real" stop being the
       same sentence. */
    {
      const zw = familyZ(WARES.length);
      const bw = BAND.gap(rich.pct / 100, rich.runs);
      const clears = rows.filter((r) => Math.abs(r[2]) >= zw * bw);
      console.log(`      (family of ${WARES.length}: the bar is ${zw.toFixed(2)}σ = ±${(zw * bw).toFixed(1)}; ` +
        `${clears.length} clear it${clears.length ? ': ' + clears.map((r) => r[0]).join(', ') : ''})`);
    }
    console.log(`    and what closes it from the other end (penniless, plus one free ware, vs ${broke.pct}%):`);
    for (const [w, pct, gain] of up) {
      console.log(`      free ${w.padEnd(7)} ${bar(pct)} ${String(pct + '%').padStart(4)}  ` +
        (gain > 0 ? `+${gain} of the ${normal.pct - broke.pct}` : String(gain)));
    }
  }
  /* And the course on its own, handed over rather than bought — so the lever
     is measured apart from whether the pilot knows when to pull it. */
  /* FF_COURSE turns just this comparison up. The five courses were called level
     at 210 runs an arm and the numbers moved ten points between samples, which
     at a band of three means the levelling was as likely luck as design — the
     same mistake the fight ablation was making for four rounds. */
  const CN = Number(process.env.FF_COURSE || 0);
  const armsC = async (tweaks) => {
    const each = CN || N;
    const answers = await runJobs(tweaks.flatMap((tweak) =>
      tribes.map((tribe) => ({ tribes: [tribe], n: each, base: 1000, step: 37, mode: 'careful', tweak }))));
    return tweaks.map((_, k) => {
      const part = answers.slice(k * tribes.length, (k + 1) * tribes.length);
      const wins = part.reduce((a2, x) => a2 + x.wins, 0);
      const runs = part.reduce((a2, x) => a2 + x.runs, 0);
      return { wins, runs, pct: Math.round((wins / Math.max(1, runs)) * 100) };
    });
  };
  if (CN) console.log(`    (courses turned up: ${3 * CN} runs an arm)`);
  /* LANE.on is a config flag, so it travels with the job — the pool sends the
     caller's config and each worker applies it before playing. Six arms, one
     call: no course, then each of the five. */
  LANE.on = true; LANE.by = {};
  const courseArms = await armsC([{ set: { course: null } }]
    .concat(FF.COURSES.map((co) => ({ set: { course: co.id } }))));
  const noCourse = courseArms[0];
  const byCourse = FF.COURSES.map((co, k) => ({ co, r: courseArms[k + 1] }));
  LANE.on = false;
  console.log('');
  console.log(`    ${'no course'.padEnd(19)}${bar(noCourse.pct)} ${String(noCourse.pct + '%').padStart(4)}`);
  for (const { co, r } of byCourse) {
    console.log(`    ${co.short.toLowerCase().padEnd(19)}${bar(r.pct)} ${String(r.pct + '%').padStart(4)}`);
  }
  const cband = BAND.gap(0.35, 3 * (CN || N)).toFixed(1);
  console.log(`    (±${cband} is one standard deviation on a course against no course — ${BAND.note()})`);

  /* DOES A COURSE STARVE THE BOARD OF BODIES?

     The front-only telegraph paid a courseless run +8 and every course nothing,
     which is a reading about the POOL rather than about the telegraph: if a
     course narrows what you draw below what the board's geometry needs, that is
     a balance problem the telegraph merely exposed. So on every turn a wave has
     named a lane, count whether that lane is already held and whether the pilot
     COULD hold it — a creature in hand and a free slot in the lane — split by
     what the run declared. */
  {
    const key = { none: 'no course' };
    for (const co of FF.COURSES) key[co.id] = co.short.toLowerCase();
    const rows = Object.entries(LANE.by)
      .map(([k, r]) => ({
        k: key[k] || k,
        live: r.live,
        held: r.held / Math.max(1, r.live),
        could: r.could / Math.max(1, r.live),
        bodies: r.bodies / Math.max(1, r.live),
      }))
      .sort((a2, z) => z.could - a2.could);
    console.log('    and whether the board can answer a named wave at all:');
    for (const r of rows) {
      console.log(`      ${r.k.padEnd(19)}` +
        `held ${String(Math.round(r.held * 100) + '%').padStart(4)} · ` +
        `could ${String(Math.round(r.could * 100) + '%').padStart(4)} · ` +
        `${r.bodies.toFixed(1)} bodies standing   (${r.live} live telegraphs)`);
    }
    const noc = rows.find((r) => r.k === 'no course');
    const worst = rows[rows.length - 1];
    if (noc && worst && worst !== noc) {
      const gap = Math.round((noc.could - worst.could) * 100);
      console.log(`      → the narrowest pool answers ${gap} points ` +
        `${gap >= 0 ? 'less' : 'more'} often than declaring nothing` +
        (Math.abs(gap) < 5 ? ' — no course starves the board' : ''));
    }
  }
  const bestCourse = byCourse.reduce((a, z) => (z.r.pct > a.r.pct ? z : a));
  const worstCourse = byCourse.reduce((a, z) => (z.r.pct < a.r.pct ? z : a));
  /* Stamped like every other turned-up arm. It was listed as standing for two
     rounds and never wrote a reading, so the summary said "run it" about
     something that had in fact been run — which is the failure the stamp file
     exists to prevent, wearing the opposite face. */
  if (CN) {
    ARMS.stamp('FF_COURSE=150', `${bestCourse.co.short.toLowerCase()} ${bestCourse.r.pct}% is the best of five, ` +
      `${worstCourse.co.short.toLowerCase()} ${worstCourse.r.pct}% the worst, against ${noCourse.pct}% for none ` +
      `(±${cband})`, 3 * CN);
  }
  ok(bestCourse.r.pct >= noCourse.pct - band, 'declaring a course is never worse than declaring none');
  /* And no course may run away with the game. One of them shipped for about
     ten minutes paying its warmth unconditionally and measured 73% against a
     36% baseline — which is not a choice a player makes, it is the answer, and
     the other four become decoration. Twenty points clear of the field is the
     line; a course that crosses it wants tuning, not shipping. */
  ok(bestCourse.r.pct - worstCourse.r.pct <= 20 + band * 2,
    `no course runs away with the run (${bestCourse.co.short} ${bestCourse.r.pct}% vs ${worstCourse.co.short} ${worstCourse.r.pct}%)`);
  /* THE SAME BAR FOR THE COURSES, for the same reason: six arms is a family of
     six (2.39σ), and "which course is best" has been read off this table by eye
     since it was written. */
  /* THE COMPARISON A PLAYER ACTUALLY FACES, which this table has never printed.

     Every course was measured against DECLARING NOTHING, and against that
     middling baseline no course clears — the gaps are about 4 points and the bar
     is ±4.9. But nobody chooses between "cold" and "no course"; the leader
     screen offers five courses and asks which. Best against worst is a different
     comparison and it is not close: at 840 runs an arm cold reads 46% and hearth
     38%, an 8-point gap on a difference band of ±2.5 — **3.1σ, which clears even
     the six-question bar.**

     So "the courses are indistinguishable" was an artefact of the baseline, and
     it stood for a dozen rounds. The table prints both now. */
  {
    const sorted2 = byCourse.slice().sort((a2, z2) => z2.r.pct - a2.r.pct);
    const hi = sorted2[0], lo = sorted2[sorted2.length - 1];
    const bdiff = BAND.gap(hi.r.pct / 100, hi.r.runs) * Math.SQRT2;
    const sig = Math.abs(hi.r.pct - lo.r.pct) / Math.max(0.1, bdiff);
    console.log(`    and BEST AGAINST WORST, which is the choice on the leader screen: ` +
      `${hi.co.short} ${hi.r.pct}% vs ${lo.co.short} ${lo.r.pct}% — ` +
      `${RANGE(hi.r.pct - lo.r.pct, bdiff, 0)} points at ${sig.toFixed(1)}σ on a ±${bdiff.toFixed(1)} band ` +
      `(bar for 2 is ${familyZ(2).toFixed(2)}σ: ${sig >= familyZ(2) ? 'CLEARS' : 'does not clear'})`);
  }
  {
    const zc = familyZ(byCourse.length + 1);
    const bc = BAND.gap(noCourse.pct / 100, noCourse.runs);
    const loud = byCourse.filter((x) => Math.abs(x.r.pct - noCourse.pct) >= zc * bc);
    console.log(`    (family of ${byCourse.length + 1}: the bar is ${zc.toFixed(2)}σ = ±${(zc * bc).toFixed(1)} ` +
      `against declaring nothing at ${noCourse.pct}%; ${loud.length} clear it` +
      `${loud.length ? ': ' + loud.map((x) => x.co.short).join(', ') : ''})`);
  }
  console.log(`    (±${band} points is one standard deviation on a difference at ${normal.runs} runs an arm — ` +
    `anything inside twice that is noise, not a finding)`);
  ok(normal.pct >= broke.pct - band * 2, 'money is never a liability');
  /* This gap USED to be the bar, and it deliberately is not any more.

     When the trader was the only door onto tempering, being penniless cost
     eleven points — which reads as a working economy and is actually a single
     point of failure: miss the one shop node on a map of nine and the run is
     gone. Tempering now lives at a camp and on the reward screen too, so a
     broke caravan still has roads to strength and the number is small on
     purpose. What has to stay big is the LADDER rung: a pilot who spends well
     still has to beat one who does not, and that is checked up in the sweep.
     A bottomless purse is still not the best row, and should not be — spending
     badly has to cost you, or the shop is a tax on patience. */
  ok(true, `money is worth ${RANGE(normal.pct - broke.pct, Number(band), 0)} points, band ±${band} — reported, not gated`);
}

/* ------------------------------------------ is the gear finding the PILOT? -- */
/* THE 14 POINTS, AND WHICH OF TWO THINGS THEY ARE.

   Runs whose hands come out gear-heavy win by 14 points, and the winners play
   more gear PER TURN, not merely more gear per run. That reading has been
   printed for two rounds with a description attached and no mechanism, because
   it admits two explanations that the variance arm cannot separate:

     the DECK is better  — gear is stronger than bodies and the finding is
                           about what the caravan carries, or
     the PILOT is worse  — it deploys a warden whenever it can and only jumps
                           the queue with gear worth 6 or more, so a gear-heavy
                           hand forces it into good play by removing the bodies
                           it would otherwise have wasted turns on.

   The second one is testable and has never been tested, because `holdGear` is a
   SWITCH: off means "gear always jumps the queue", which is one end of a dial.
   `GEAR.bar` is the dial. Sweep it on the SAME decks the pilot already draws,
   and read the SPREAD rather than the ranking: if always-first and never-first
   are level, no setting of this knob buys a point and the 14 points cannot be
   about how much gear the pilot plays. If the ends are apart, they can be, and
   the shipped bar's distance from the best one prices what the pilot has been
   leaving on the table. */
section('is the gear preference the deck or the pilot');
{
  const N = Number(process.env.FF_GEARBAR || 0);
  const tribes = ['hearth', 'frost', 'scrap'];
  const each = N || Math.min(24, Number(process.env.FF_RUNS || DEFAULT_N));
  /* 2.5 is carefulItem's floor, so a bar of 2.5 means every playable piece of
     gear jumps the queue; 99 means none ever does. 6 is what ships. */
  const BARS = [2.5, 4, 6, 8, 99];
  const bar = (n) => '█'.repeat(Math.round(n / 2)).padEnd(26);
  const base = config();
  const answers = await runJobs(BARS.flatMap((v) =>
    tribes.map((tribe) => ({
      tribes: [tribe], n: each, base: 1000, step: 37, mode: 'careful',
      config: Object.assign({}, base, { gear: v }),
    }))));
  const rows = BARS.map((v, k) => {
    const part = answers.slice(k * tribes.length, (k + 1) * tribes.length);
    const wins = part.reduce((a, x) => a + x.wins, 0);
    const runs = part.reduce((a, x) => a + x.runs, 0);
    return { v, wins, runs, pct: Math.round((wins / Math.max(1, runs)) * 100) };
  });
  const label = (v) => (v <= 2.5 ? 'gear always first' : v >= 99 ? 'gear never first' : `gear worth ${v}+ first`);
  console.log('');
  for (const r of rows) {
    console.log(`    ${label(r.v).padEnd(22)}${bar(r.pct)} ${String(r.pct + '%').padStart(4)}` +
      (r.v === 6 ? '   ← what ships' : ''));
  }
  const ship = rows.find((r) => r.v === 6);
  const best = rows.reduce((a, z) => (z.pct > a.pct ? z : a));
  const gband = BAND.gap(ship.pct / 100, ship.runs) * Math.SQRT2;
  const zb = familyZ(BARS.length);
  console.log(`    (±${gband.toFixed(1)} on a difference at ${ship.runs} runs a bar; family of ${BARS.length} ` +
    `is ${zb.toFixed(2)}σ = ±${(zb * gband).toFixed(1)})`);
  const lift = best.pct - ship.pct;
  const worst = rows.reduce((a, z) => (z.pct < a.pct ? z : a));
  const spread = best.pct - worst.pct;
  /* THE SPREAD, not the lift, is what answers the question. A best-vs-shipped
     gap is a ranking, and a ranking inside its own band is noise — this file's
     oldest rule. What tells the two explanations apart is whether the dial does
     ANYTHING across its whole range: if the extremes are level, no amount of
     re-tuning the pilot's gear preference buys a point, and the 14 points
     cannot be about how much gear the pilot chooses to play. */
  console.log(`    → best ${label(best.v)} ${best.pct}% · worst ${label(worst.v)} ${worst.pct}% · ` +
    `spread ${RANGE(spread, zb * gband / 2, 0)} on a family bar of ±${(zb * gband).toFixed(1)}`);
  console.log(`      ${spread >= zb * gband
    ? `the dial is REAL and the shipped bar is ${lift} off it — the 14 points are PLAY SKILL`
    : 'the dial is FLAT end to end, so gear-before-body is not a decision — ' +
      'whatever the 14 points are, they are not how much gear the pilot plays'}`);
  if (N) {
    ARMS.stamp('FF_GEARBAR=1', `${BARS.length} bars from always-first to never-first span ` +
      `${spread} points (${worst.pct}-${best.pct}%) against a family bar of ±${(zb * gband).toFixed(1)} — ` +
      `${spread >= zb * gband ? 'a real dial' : 'flat: gear-before-body is not a decision'}`,
      tribes.length * each);
  }
  /* Gated, not merely reported: if some bar beats the shipped one by more than
     the family bar, the pilot is measurably mis-set and every fight-arm number
     taken with it is a number about a pilot playing below itself. That is worth
     failing the suite over, because it invalidates readings rather than the
     game. */
  ok(spread < zb * gband || N === 0,
    `the gear-before-body dial is flat end to end (${spread} points across ${BARS.length} bars)`);
}

/* ------------------------------------ gear against bodies, built on purpose -- */
/* THE ARM THAT SHOULD HAVE BEEN BUILT FOUR ROUNDS AGO.

   "Gear-heavy hands win by 14 points" was the headline for three rounds and it
   was retracted last round as an artefact: the halves it compared were made by
   SORTING EIGHT DECKS ON WIN RATE, so they differ by construction whether or not
   anything about the decks does. The composition gaps that survive that
   objection were then put through an exact permutation null and cleared nothing
   at any sample tried — p=0.06 at eight decks, p=0.52 at fourteen.

   Every one of those measurements is INDIRECT. They deal decks at random, sort
   them by outcome, and ask what the winning end has in common — which is
   observational, and which is why four rounds of it produced one artefact and
   four nulls. The direct question was never asked: **deal decks that differ ON
   PURPOSE and run them against the same trails.**

   Six gear-heavy decks (4 gear, 2 wardens) against six body-heavy ones (5
   wardens, 1 gear), sampled from the same pool by the same seeded shuffle, run
   on the same seeds. Two bodies is the floor a deck can function on — a caravan
   with no wardens cannot hold a lane — so the contrast is as wide as the game
   allows rather than as wide as looks impressive.

   The band comes two ways and both are printed, because they answer different
   objections. The binomial band treats runs as independent and understates the
   truth, since runs sharing a deck are correlated. The permutation null does
   not: if composition is worth nothing then which six of the twelve get called
   "gear" is arbitrary, so relabelling across all C(12,6) = 924 splits gives the
   distribution of gaps under exactly that hypothesis. Where the built split
   falls in it is the answer, with no independence assumed. */
section('gear against bodies, dealt on purpose');
{
  const N = Number(process.env.FF_BUILT || 0);
  const tribes = ['hearth', 'frost', 'scrap'];
  const each = N || Math.min(14, Number(process.env.FF_RUNS || DEFAULT_N));
  /* HOW MANY DECKS IT TAKES, worked out rather than guessed at. The live arm
     read +3.0 points at p=0.288 on six a side, and "the instrument can only
     prove it where the game is crippled" was where it sat for two rounds. The
     deck-to-deck spread is measurable, so the sample it would take is
     arithmetic: the twelve live decks read a pooled SD of 4.68, of which 2.00
     is binomial sampling noise at 600 runs a deck, leaving a TRUE deck-to-deck
     SD of 4.23. Resolving a 3.0-point difference of means then needs

         n = 2 (z · 4.23 / B)²  decks a side,  B = 1.5   —  64 at 2σ, 80 at 2.24σ

     where B is the BAND you want and not the effect you expect. Solving for
     B = 3.0 — the effect itself — gives 16 at 2σ and is the coin-flip form the
     ladder table caught: it is by construction the sample where the reading sits
     exactly on its band. Halving B is 4x the decks.

     More runs a deck cannot help either way: they shrink the 2.00 and leave the
     4.23 alone, which is why four rounds of deepening this family bought
     nothing. THE SAMPLE ACTUALLY RUN WAS 84 A SIDE, past even the corrected
     bar — and the verdict here is a permutation p rather than a band comparison,
     which is why the correction does not touch it. See below. */
  const SIDE = Number(process.env.FF_SIDES || 6);
  const pool = Object.values(FF.CARDS).filter((c) => !c.leader && !c.noPool);
  const gearPool = pool.filter((c) => c.type === 'item').map((c) => c.id).sort();
  const bodyPool = pool.filter((c) => c.type === 'unit').map((c) => c.id).sort();
  let x = (Number(process.env.FF_VSEED || 20250814) >>> 0) || 1;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const take = (src, k) => {
    const bag = src.slice();
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    return bag.slice(0, k);
  };
  /* Built alternately rather than all-gear-then-all-body, so the two sides draw
     from the same stretch of the PRNG and one is not systematically dealt the
     cards the other already spent. */
  const built = [];
  for (let i = 0; i < SIDE; i++) {
    built.push({ kind: 'gear', ids: take(gearPool, 4).concat(take(bodyPool, 2)) });
    built.push({ kind: 'body', ids: take(bodyPool, 5).concat(take(gearPool, 1)) });
  }
  /* AND THE RESPONSE IS NOT WON/LOST, or not only.

     A locked six-card deck crosses about 3% of the time, so "did it win" is 0 in
     97 cells of 100 and most of its variance is the rarity of a 1 — the variance
     arm learned this two rounds ago and switched to HOW FAR IT GOT, which reads
     the same ordering at six times the resolution. The first run of this arm
     showed exactly why: every body-heavy deck read 0.0%, which is a real signal
     and an unusable one, because a floor cannot say how far below it something
     is. Both responses are collected and both are tested. */
  /* LOCKED IS NOT THE GAME, and this arm named that limit in the same breath as
     its own finding: "a real caravan drafts, and whether a starting lean
     survives twenty cards of drafting is untouched". A locked six-card deck is
     the cleanest possible contrast and it is also a caravan that cannot draft,
     shop or temper — so +2.7 points there may be a fact about a game nobody
     plays. FF_LIVEBUILT runs the same twelve built decks as STARTING hands in
     real runs. If the lean survives, the finding generalises; if it washes out,
     the honest statement is that composition decides a locked deck and the
     draft decides a real one. */
  const LIVE = !!process.env.FF_LIVEBUILT;
  if (LIVE) console.log('    (FF_LIVEBUILT: the built decks are STARTING hands in real runs, and they grow)');
  const jobs = built.flatMap((b) => tribes.map((tribe) => ({
    tribes: [tribe], n: each, base: 1000, step: 37, mode: LIVE ? 'careful' : 'tactics', stats: true,
    tweak: LIVE ? { give: b.ids } : { set: { lockDeck: true, mend: 8 }, give: b.ids },
  })));
  const answers = await runJobs(jobs);
  const rows = built.map((b, k) => {
    const part = answers.slice(k * tribes.length, (k + 1) * tribes.length);
    const wins = part.reduce((n, a) => n + a.wins, 0);
    const runs = part.reduce((n, a) => n + a.runs, 0);
    const st = part.flatMap((a) => a.stats);
    const zones = st.reduce((n, q) => n + (q.won ? FF.ZONES.length : (q.zone || 0)), 0) / Math.max(1, st.length);
    return { kind: b.kind, ids: b.ids, wins, runs, zones, pct: (wins / Math.max(1, runs)) * 100 };
  });
  const side = (k) => rows.filter((r) => r.kind === k);
  const rate = (rs) => (rs.reduce((n, r) => n + r.wins, 0) / Math.max(1, rs.reduce((n, r) => n + r.runs, 0))) * 100;
  const gearPct = rate(side('gear')), bodyPct = rate(side('body'));
  const gap = gearPct - bodyPct;
  const runsEach = side('gear').reduce((n, r) => n + r.runs, 0);
  console.log('');
  console.log(`    ${SIDE} decks of 4 gear + 2 wardens   ${'█'.repeat(Math.round(gearPct / 2)).padEnd(24)} ${gearPct.toFixed(1)}%`);
  console.log(`    ${SIDE} decks of 5 wardens + 1 gear   ${'█'.repeat(Math.round(bodyPct / 2)).padEnd(24)} ${bodyPct.toFixed(1)}%`);
  const bband = BAND.gap(gearPct / 100, runsEach) * Math.SQRT2;
  console.log(`    → gear-heavy is ${gap >= 0 ? '+' : ''}${gap.toFixed(1)} points, ` +
    `${runsEach} runs a side, binomial band ±${bband.toFixed(1)} (understates: runs sharing a deck are correlated)`);

  /* THE NULL THAT DOES NOT ASSUME INDEPENDENCE. Twelve decks, every way of
     calling six of them one thing — the same enumeration the split-half arm
     uses, applied to a split that was made on purpose instead of on outcome. */
  /* ENUMERATED WHILE THAT IS POSSIBLE, SAMPLED WHEN IT IS NOT. Twelve decks is
     C(12,6) = 924 labellings and an exact test; thirty-two is C(32,16) = 601
     MILLION, which is not a test anybody runs. Above a cap the null is drawn
     instead — deterministically, from a fixed seed, so the arm stays
     reproducible and the p-value does not wander between runs. The resolution
     floor moves from 1/924 to 1/DRAWS, which is stated rather than assumed. */
  const combos = [];
  const exact = (() => {
    let n = 1;
    for (let i = 0; i < SIDE; i++) n = n * (rows.length - i) / (i + 1);
    return n;
  })();
  const DRAWS = 20000;
  if (exact <= 60000) {
    const walk = (start, pickd) => {
      if (pickd.length === SIDE) { combos.push(pickd.slice()); return; }
      for (let i = start; i < rows.length; i++) { pickd.push(i); walk(i + 1, pickd); pickd.pop(); }
    };
    walk(0, []);
  } else {
    let z = 0x9e3779b9;
    const rnd2 = () => { z ^= z << 13; z >>>= 0; z ^= z >> 17; z ^= z << 5; z >>>= 0; return z / 4294967296; };
    const idx2 = rows.map((_, i) => i);
    for (let d = 0; d < DRAWS; d++) {
      const bag = idx2.slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd2() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      combos.push(bag.slice(0, SIDE));
    }
  }
  const HOW = exact <= 60000 ? `all ${combos.length}` : `${combos.length} sampled of ${exact.toExponential(1)}`;
  const gapOf = (chosen) => {
    const inA = new Set(chosen);
    let aw = 0, ar = 0, bw = 0, br = 0;
    rows.forEach((r, i) => { if (inA.has(i)) { aw += r.wins; ar += r.runs; } else { bw += r.wins; br += r.runs; } });
    return (aw / Math.max(1, ar)) * 100 - (bw / Math.max(1, br)) * 100;
  };
  const pOf = (fn, obs) => {
    const all2 = combos.map((cm) => Math.abs(fn(cm)));
    return all2.filter((v) => v >= Math.abs(obs) - 1e-9).length / all2.length;
  };
  const pv = pOf(gapOf, gap);
  console.log(`    → against ${HOW} ways to label ${SIDE} of the ${rows.length}: p=${pv.toFixed(3)}` +
    ` — ${pv <= 0.05 ? 'COMPOSITION IS REAL' : 'not distinguishable from an arbitrary relabelling'}`);

  // and the same again on depth, which has resolution where won/lost has none
  const zoneOf = (chosen) => {
    const inA = new Set(chosen);
    let a = 0, na = 0, b = 0, nb = 0;
    rows.forEach((r, i) => { if (inA.has(i)) { a += r.zones; na++; } else { b += r.zones; nb++; } });
    return a / Math.max(1, na) - b / Math.max(1, nb);
  };
  const zGear = side('gear').reduce((n, r) => n + r.zones, 0) / SIDE;
  const zBody = side('body').reduce((n, r) => n + r.zones, 0) / SIDE;
  const zGap = zGear - zBody;
  const zp = pOf(zoneOf, zGap);
  console.log(`    and on HOW FAR IT GOT (0-${FF.ZONES.length}), where the floor is not in the way: ` +
    `gear ${zGear.toFixed(2)} vs bodies ${zBody.toFixed(2)} — ${zGap >= 0 ? '+' : ''}${zGap.toFixed(2)} zones, ` +
    `p=${zp.toFixed(3)} ${zp <= 0.05 ? 'REAL' : 'not resolved'}`);
  const perDeck = rows.map((r) => `${r.kind[0]}${r.pct.toFixed(0)}/${r.zones.toFixed(1)}`).join(' ');
  console.log(`    (deck by deck as won%/zones, g=gear b=body: ${perDeck})`);
  if (N) {
    ARMS.stamp(LIVE ? 'FF_LIVEBUILT=1' : 'FF_BUILT=200', `${LIVE ? 'LIVE ' : ''}gear-heavy ${gearPct.toFixed(1)}% vs body-heavy ${bodyPct.toFixed(1)}% ` +
      `(${gap >= 0 ? '+' : ''}${gap.toFixed(1)} points, p=${pv.toFixed(3)}); on depth ` +
      `${zGear.toFixed(2)} vs ${zBody.toFixed(2)} zones (${zGap >= 0 ? '+' : ''}${zGap.toFixed(2)}, p=${zp.toFixed(3)}) ` +
      `over ${combos.length} relabellings`, tribes.length * each * SIDE);
  }
  ok(rows.every((r) => r.runs > 0), `all ${rows.length} built decks played (${runsEach} runs a side)`);
}

/* --------------------------------- do the flat courses have a dial either? -- */
/* THREE OF FIVE COURSES SIT AT THE COURSELESS BASELINE, AND ONE METHOD JUST WORKED.

   Hearth read 38% against 40% for declaring nothing for five rounds while four
   rewrites looked for a different MECHANISM. The thing that fixed it was not a
   mechanism, it was an AMOUNT: same rule, one point more, 38% -> 52%. That is
   now a method rather than an anecdote, and there are two courses left sitting
   on the baseline — Scrap and Bodies, both 40% against 40%.

   Each has exactly one number in it:

     Bodies  every warden deployed arrives with Shell N       (N = 2)
     Scrap   the first N pieces of gear each fight are free    (N = 1)

   Both were literals inside a closure until this round, which is precisely why
   nobody had swept them: a dial nobody can turn reads the same as no dial. They
   are named fields now and this sweeps them. Two outcomes are useful and one is
   not: a dial that lifts the course (ship the smallest setting that works, as
   Hearth did), or a flat sweep end to end (the amount is not the problem and
   the rule is decoration — say so and stop rewriting it). What is not useful is
   another round of guessing at new rules for them. */
section('the course dials, and where each one sits on its own');
{
  const N = Number(process.env.FF_DIAL || 0);
  const tribes = ['hearth', 'frost', 'scrap'];
  const each = N || Math.min(20, Number(process.env.FF_RUNS || DEFAULT_N));
  const bar = (n) => '█'.repeat(Math.round(n / 2)).padEnd(26);
  const base = config();
  /* Bodies at 2 and Scrap at 1 are what ships, so each ladder contains its own
     control and the sweep is read against the course as it stands as well as
     against declaring nothing. */
  const ARMSD = [
    { k: 'no course at all', course: null, dial: null, ships: false },
    /* HEARTH'S RATE DIAL WAS SWEPT HERE AND IS GONE: every turn 53%, every 2nd
       47%, every 3rd 47% at 600 an arm — 1.9σ, which does not clear, so the
       dial was reverted rather than shipped and is not re-swept. The reading
       lives in the course's own definition. */
    { k: 'bodies  Shell 2', course: 'line', dial: { 'line.shellN': 2 }, ships: true },
    { k: 'bodies  Shell 4', course: 'line', dial: { 'line.shellN': 4 } },
    { k: 'bodies  Shell 6', course: 'line', dial: { 'line.shellN': 6 } },
    { k: 'bodies  Shell 9', course: 'line', dial: { 'line.shellN': 9 } },
    /* SCRAP CAME OUT OF THIS SWEEP, having been run twice and read flat twice.
       Free gear at 1/2/3/all spanned 6 points; a larger opening hand at
       +0/1/2/3 spanned 3. Both against a family bar of ±8.9. Re-sweeping a
       third magnitude on a course whose problem is demonstrably not magnitude
       would be paying 1,350 runs a round to re-learn the same null, so the
       course's own definition records both readings and this arm sweeps the one
       dial that is live. */
    /* SCRAP'S THIRD RULE, on the axis the working courses use — thorns on every
       arrival, so it lands turn one, fires every fight and scales with the
       line. Its two dead axes (how much free gear, how big an opening hand)
       are recorded in the course's own definition and are not re-swept. */
    { k: 'scrap   +0 thorns', course: 'scrap', dial: { 'scrap.thornN': 0 }, ships: true },
    { k: 'scrap   +1 thorns', course: 'scrap', dial: { 'scrap.thornN': 1 } },
    { k: 'scrap   +2 thorns', course: 'scrap', dial: { 'scrap.thornN': 2 } },
    { k: 'scrap   +4 thorns', course: 'scrap', dial: { 'scrap.thornN': 4 } },
  ];
  if (N) console.log(`    (dials turned up: ${3 * N} runs an arm)`);
  const answers = await runJobs(ARMSD.flatMap((a) =>
    tribes.map((tribe) => ({
      tribes: [tribe], n: each, base: 1000, step: 37, mode: 'careful',
      tweak: { set: { course: a.course } },
      config: a.dial ? Object.assign({}, base, { courseDial: a.dial }) : base,
    }))));
  const rows = ARMSD.map((a, k) => {
    const part = answers.slice(k * tribes.length, (k + 1) * tribes.length);
    const wins = part.reduce((n, x) => n + x.wins, 0);
    const runs = part.reduce((n, x) => n + x.runs, 0);
    return Object.assign({}, a, { wins, runs, pct: Math.round((wins / Math.max(1, runs)) * 100) });
  });
  console.log('');
  for (const r of rows) {
    console.log(`    ${r.k.padEnd(20)}${bar(r.pct)} ${String(r.pct + '%').padStart(4)}` +
      (r.ships ? '   ← what ships' : ''));
  }
  const none = rows[0];
  const dband = BAND.gap(none.pct / 100, none.runs) * Math.SQRT2;
  /* FOUR SETTINGS EACH, so the family is four per course rather than nine
     across both: the two sweeps are separate questions and pooling them would
     charge each a bar it did not earn. */
  const zd = familyZ(4);
  console.log(`    (±${dband.toFixed(1)} on a difference at ${none.runs} runs an arm; ` +
    `family of 4 is ${zd.toFixed(2)}σ = ±${(zd * dband).toFixed(1)})`);
  const verdicts = [];
  for (const co of ['line', 'scrap']) {
    const mine = rows.filter((r) => r.course === co);

    const hi = mine.reduce((a, z) => (z.pct > a.pct ? z : a));
    const lo = mine.reduce((a, z) => (z.pct < a.pct ? z : a));
    const ship = mine.find((r) => r.ships);
    const spread = hi.pct - lo.pct;
    const live = spread >= zd * dband;
    verdicts.push({ co, hi, lo, ship, spread, live });
    console.log(`    → ${co === 'line' ? 'BODIES' : co.toUpperCase()}: ` +
      `best ${hi.k.trim()} ${hi.pct}% · worst ${lo.pct}% · spread ${RANGE(spread, zd * dband / 2, 0)} · ` +
      `${live ? `A DIAL — ${hi.pct - ship.pct} points between its ends, ${hi.pct - none.pct} at the top over declaring nothing`
        : 'FLAT end to end — this setting is not what decides this course'}`);
  }
  if (N) {
    ARMS.stamp('FF_DIAL=150', verdicts.map((v) =>
      `${v.co === 'line' ? 'bodies' : 'scrap'} spans ${v.spread} (${v.lo.pct}-${v.hi.pct}%, ships ${v.ship.pct}%) ` +
      `${v.live ? 'A DIAL' : 'flat'}`).join(' · ') + ` against ${none.pct}% for no course, family bar ±${(zd * dband).toFixed(1)}`,
      tribes.length * each);
  }
  /* Reported, not gated. A flat sweep is a real answer here and failing the
     suite over it would be failing it for a finding. What IS gated is the thing
     that would make the table a lie: a dial cranked past its top setting must
     not run away with the run, which is the same bar every course carries. */
  const top = rows.reduce((a, z) => (z.pct > a.pct ? z : a));
  ok(top.pct - none.pct <= 20 + zd * dband,
    `no setting of a course dial runs away with the run (${top.k.trim()} ${top.pct}% vs ${none.pct}% for none)`);
}

/* ------------------------------------------- and what walking past one is -- */
/* THE ONE THING A TRANSCRIPT FOUND THAT NO RUNG EVER DID.

   A run crossed all three zones having fought eight of twenty-one steps. Not a
   lucky one — a competent one, taking the safe fork every time it was offered.
   That is a winning line the ladder above cannot see, because every rung on it
   fights whatever the trail happens to put in front of it; none of them chooses
   to walk away.

   So here are two pilots identical in every respect except what they do at a
   fork with a fight on one side of it. One takes the fight, one takes the other
   thing. If dodging is even level, the game is asking to be dodged. */
section('does walking past a fight pay');
{
  const N = Number(process.env.FF_ROUTE || process.env.FF_RUNS || DEFAULT_N);
  const tribes = ['hearth', 'frost', 'scrap'];
  const tally = (stats) => {
    let wins = 0, runs = 0, power = 0, fought = 0, walked = 0, seen = 0;
    let cards = 0, temp = 0, meals = 0, gold = 0;
    for (const st of stats) {
      runs++;
      if (st.won) wins++;
      if (st.endPower !== undefined) {
        power += st.endPower; fought += st.fought; walked += st.walked; seen++;
        cards += st.cards; temp += st.temp; meals += st.meals; gold += st.endGold;
      }
    }
    return { pct: Math.round((wins / Math.max(1, runs)) * 100), runs,
      power: power / Math.max(1, seen), share: fought / Math.max(1, walked),
      cards: cards / Math.max(1, seen), temp: temp / Math.max(1, seen),
      meals: meals / Math.max(1, seen), gold: gold / Math.max(1, seen) };
  };
  const duckJobs = (tweak) => tribes.map((tribe) =>
    ({ tribes: [tribe], n: N, base: 1000, step: 37, mode: 'careful', tweak, stats: true }));
  /* seek and dodge go out together — six jobs, one pool. `sore` cannot join
     them: the three DUCKS counters are zeroed between, and a batched call would
     absorb all three arms' forks before the reset could run. Reading counters
     back is exactly the thing that decides whether arms can share a call. */
  const [seekA, dodgeA] = await Promise.resolve(runJobs(duckJobs({ set: { seek: true } })
    .concat(duckJobs({ set: { dodge: true } }))))
    .then((r) => [tally(r.slice(0, tribes.length).flatMap((x) => x.stats)),
      tally(r.slice(tribes.length).flatMap((x) => x.stats))]);
  const seek = seekA, dodge = dodgeA;
  DUCKS.forks = 0; DUCKS.taken = 0; DUCKS.wound = 0;
  const sore = tally((await runJobs(duckJobs({ set: { duckHurt: true } }))).flatMap((x) => x.stats));
  const bar2 = (n) => '█'.repeat(Math.round(n / 2)).padEnd(30);
  const band = BAND.gap(0.35, seek.runs).toFixed(1);
  const row = (label, a) => {
    console.log(`    ${label.padEnd(22)}${bar2(a.pct)} ${String(a.pct + '%').padStart(4)}` +
      `   fought ${Math.round(a.share * 100)}% of steps, arrived at ${a.power.toFixed(1)}`);
    console.log(`    ${''.padEnd(22)}${''.padEnd(30)}      ` +
      `${a.cards.toFixed(1)} cards · ${a.temp.toFixed(1)} tempered · ${a.meals.toFixed(1)} meals · ${Math.round(a.gold)} unspent`);
  };
  row('takes every fight', seek);
  row('walks past what it can', dodge);
  row('ducks to a quiet stop when hurt', sore);
  /* THREE CONDITIONAL STRATEGIES AGAINST THE UNCONDITIONAL ONE. Two arms said
     "dodging is worse"; they could not say whether ANY strategy beats taking
     everything, which is the question the fifth rung raised and did not ask. */
  const ROUTES = [['skips the packs and beasts', 'elite'],
    ['banks zone one, coasts zone three', 'early'],
    ['spends a full purse before fighting', 'rich']];
  const routed = [];
  for (const [label, key] of ROUTES) {
    const r = tally((await runJobs(duckJobs({ set: { route: key } }))).flatMap((x) => x.stats));
    routed.push({ label, r });
    row(label, r);
  }
  /* AND THE SAME SIX PILOTS AGAIN WITH A LASTING REST ON THE QUIET ROAD.

     The verdict below — nothing beats taking every fight — is a verdict on the
     quiet road AS IT PAYS TODAY, which is once, at the moment you step on the
     node. That is the shape that failed five times on Hearth and twice on
     Scrap. `REST.fights` gives the quiet road something that lasts instead: a
     rested line mends its most-hurt warden every upkeep for the next few
     fights, which is the one payout on this board measured to be worth
     anything. Swept here rather than in the course arm because the question is
     not "is rest good" — it obviously is — but "does it make the FORK a
     decision", and only a routing comparison can answer that. */
  const RESTS = process.env.FF_REST ? [0, 1, 2, 4] : [];
  const rested = [];
  for (const rf of RESTS) {
    const cfg = Object.assign(config(), { rest: rf });
    const jobsR = tribes.map((tribe) => ({ tribes: [tribe], n: N, base: 1000, step: 37,
      mode: 'careful', tweak: { set: { duckHurt: true } }, config: cfg, stats: true }));
    const jobsS = tribes.map((tribe) => ({ tribes: [tribe], n: N, base: 1000, step: 37,
      mode: 'careful', tweak: { set: { seek: true } }, config: cfg, stats: true }));
    const out = await runJobs(jobsR.concat(jobsS));
    const duck = tally(out.slice(0, tribes.length).flatMap((x) => x.stats));
    const take = tally(out.slice(tribes.length).flatMap((x) => x.stats));
    rested.push({ rf, duck, take });
    console.log(`    rest lasts ${rf} fights:  ducks-when-hurt ${duck.pct}%  vs  takes-everything ${take.pct}%` +
      `   (${duck.pct - take.pct >= 0 ? '+' : ''}${duck.pct - take.pct})`);
  }
  if (RESTS.length) {
    const bestR = rested.reduce((a, z) => ((z.duck.pct - z.take.pct) > (a.duck.pct - a.take.pct) ? z : a));
    const bR = BAND.gap(0.45, rested[0].take.runs) * Math.SQRT2;
    const zR = familyZ(RESTS.length);
    const lift = bestR.duck.pct - bestR.take.pct;
    console.log(`    → the quiet road at its best setting (${bestR.rf} fights) is ` +
      `${lift >= 0 ? '+' : ''}${lift} against taking everything, family bar ±${(zR * bR).toFixed(1)} — ` +
      `${lift >= 0 ? 'ducking is now at least level: the fork is a decision' : 'still behind: a lasting rest is not enough either'}`);
    ARMS.stamp('FF_REST=1', `a lasting rest on the quiet road, swept 0/1/2/4 fights: best is ${bestR.rf} at ` +
      `${lift >= 0 ? '+' : ''}${lift} for ducking against taking everything (bar ±${(zR * bR).toFixed(1)})`,
      rested[0].take.runs);
  }
  console.log(`    ${''.padEnd(22)}${''.padEnd(30)}      ` +
    `took the quiet road at ${DUCKS.taken} of ${DUCKS.forks} forks that offered it ` +
    `(${Math.round((DUCKS.taken / Math.max(1, DUCKS.forks)) * 100)}%), ` +
    `the line ${Math.round((DUCKS.wound / Math.max(1, DUCKS.forks)) * 100)}% wounded at those forks`);
  console.log(`    → walking past a fight is worth ${dodge.pct - seek.pct} points; ` +
    `ducking to a camp only when hurt is worth ${sore.pct - seek.pct} (±${band} is one standard deviation)`);
  {
    /* THE VERDICT ON THE FORK ITSELF. Five strategies against seek; the bar is
       the family of five rather than a single comparison, because "does ANY of
       these beat it" is five questions asked at once and answering it at 2σ is
       how a table of five produces a winner out of noise. */
    const all5 = [{ label: 'walks past what it can', r: dodge },
      { label: 'ducks when hurt', r: sore }].concat(routed);
    const bestAlt = all5.reduce((a, z) => (z.r.pct > a.r.pct ? z : a));
    const zf = familyZ(all5.length);
    const bf = BAND.gap(seek.pct / 100, seek.runs) * Math.SQRT2;
    const lead = bestAlt.r.pct - seek.pct;
    console.log(`    → AND IS THE FORK A DECISION? best of ${all5.length} alternatives is ` +
      `"${bestAlt.label}" at ${bestAlt.r.pct}% against ${seek.pct}% for taking everything ` +
      `(${RANGE(lead, zf * bf / 2, 0)}, family bar ${zf.toFixed(2)}σ = ±${(zf * bf).toFixed(1)})`);
    console.log(`      ${lead >= zf * bf
      ? 'something beats taking every fight — the fork IS a decision'
      : 'nothing beats taking every fight: the trail screen asks a question with one right answer'}`);
    /* FF_ROUTE IS RETIRED FROM THE STANDING ARMS, and this is the argument.

       An arm earns its place if somebody would re-run it to answer something.
       This one has answered the same way four rounds running — best of five
       alternatives −1 against a family bar of ±8.2, and the ordering runs
       monotonically down with how much fighting each strategy does — and the
       ladder rung beside it never resolved at any of four samples totalling
       over 20,000 runs.

       What finally settled it was not another sample but a number nobody had
       printed: **the routing pilot plays 17.7 fights a run against 12.5 for the
       one that picks a fork arbitrarily — 42% more of the game — and wins the
       same amount.** That is not "unresolved at this sample". A lever that moves
       42% of the content and lands inside the band is a lever that does nothing,
       and four more samples would only have priced the nothing more precisely.

       So the verdict is stated rather than re-measured: **the trail's fights are
       close to free.** Skipping one costs its reward, taking one costs its risk,
       and the two cancel — which is why nothing beats taking everything AND why
       taking everything is barely better. The design consequence is that the
       fork needs a COST on one side, and that is a change to make and measure,
       not a sample to buy. The arm still runs under `FF_ROUTE` for whoever makes
       it; it just no longer claims a standing reading that never moves. */
    if (process.env.FF_ROUTE) {
      console.log(`      (FF_ROUTE is not a standing arm any more: four rounds of the same answer, ` +
        `and the routing pilot plays 42% more fights for it)`);
    }
  }
  /* The bar. Dodging may be survivable — a run that ducks two hard packs and
     scrapes home is a story — but it may not be the BETTER line, because a
     trail that pays you to avoid it is a trail nobody has a reason to walk. */
  /* Two standard deviations, not one — the same confidence every other claim in
     this suite is stated at. At the sample `npm run check` runs (24 an arm, band
     ±9.7) a one-sigma gate fails about one run in six on noise alone, which is a
     gate that cries wolf rather than one that catches a regression. At the real
     sample the tolerance is six points and dodging reads −6, so it still bites. */
  ok(dodge.pct <= seek.pct + Number(band) * 2,
    `walking past fights is not the winning line (${dodge.pct}% dodging vs ${seek.pct}% fighting, band ±${band})`);
  /* And the part a win rate cannot show, stated as what is actually true rather
     than as what was hoped for. A dodger does NOT arrive thin: everything it
     walks towards instead of a fight — a camp, a rest, a cache — builds a
     caravan too, and it arrives holding a leaner, better-tempered line than the
     pilot who fought everything. What it does not get to do is arrive AHEAD.
     The bar is that fighting buys at least as much caravan as ducking does; if
     ducking ever bought more, no amount of difficulty tax would make fighting
     the honest line, it would only make the game longer. */
  ok(dodge.power <= seek.power + 0.4,
    `ducking fights does not build a better caravan (${dodge.power.toFixed(1)} against ${seek.power.toFixed(1)})`);
  /* And the finding underneath both of the above, kept as a check because it is
     the thing that was actually broken: a fighting caravan must be able to
     SPEND what fighting pays it. It ended a run holding 527 scrip when the only
     counter in the game shared a fork with the fights it was winning. */
  ok(seek.gold < 200, `a caravan that fights can spend what it earns (${Math.round(seek.gold)} left over)`);
}

/* -------------------------------------------------- what the fight is for -- */
/* ------------------------------------------------- what a card is worth -- */
section('which cards the win rate would miss');
{
  /* FIFTY-EIGHT CARDS, PRICED ONLY BY "EVERY CARD IS PLAYED".

     That table is about the POOL — it says the offer is not dead weight — and it
     has never said anything about a card. This one does: take one card out of
     the offer, play whole trails without it, and see what the win rate does. It
     is the biggest untouched surface in the game and the probe has been audited
     three rounds running instead of pointed at it.

     TWO THINGS MAKE THIS HARDER THAN IT LOOKS, and both are handled rather than
     hoped past.

     The first is MULTIPLICITY. Fifty-eight comparisons at a two-sigma bar will
     throw up two or three "findings" from noise alone — that is what a 5% error
     rate MEANS when you run it fifty-eight times. So the bar here is the family
     one: Bonferroni, the per-test threshold that keeps the chance of ANY false
     positive at the same 5%. It is a much higher bar and it is the honest one.

     The second is that a card removed from the OFFER may still arrive in a
     starting deck, which dilutes its removal. The arm is about draftability and
     says so; a card that only ever comes free with a leader will read as zero
     here whatever it is worth. */
  const KN = Number(process.env.FF_CARDS || 0);
  if (KN) {
    const tribes = ['hearth', 'frost', 'scrap'];
    const sweepK = () => {
      let wins = 0, runs = 0;
      for (const tribe of tribes) {
        for (let i = 0; i < KN; i++) {
          const st = playRun(tribe, 1000 + i * 37, 'careful'); runs++; if (st.won) wins++;
        }
      }
      return (wins / Math.max(1, runs)) * 100;
    };
    /* FF_GIVE NAMES THE CARDS, AND IT EXISTS BECAUSE A FAMILY BAR IS A TAX ON
       ASKING SIXTY QUESTIONS.

       Pricing all 60 cards holds the family error at 5% by demanding 3.34σ per
       test, which at any sample this project can afford means NOTHING clears and
       the honest report is "the sample is too small" — a sentence this file has
       now written three times. That is the cost of a fishing trip, and it is the
       right cost when the question really is "is any card load-bearing".

       When the question is specific — "did the three aura cards work" — the fish
       are named in advance, the family is 3 tests instead of 60, and the bar
       falls from 3.34σ to about 2.4σ. Same runs, an answerable question. Give it
       a control group of ordinary cards or the comparison is against a floor
       rather than against the pool. */
    const NAMED = (process.env.FF_GIVE || '').split(',').map((x) => x.trim()).filter(Boolean);
    const ids = NAMED.length ? NAMED.filter((id) => FF.CARDS[id])
      : Object.values(FF.CARDS)
        .filter((c) => !c.leader && !c.noPool).map((c) => c.id).sort();
    if (NAMED.length) console.log(`    (FF_GIVE: ${ids.length} named cards, so the family bar is for ${ids.length} tests, not 60)`);
    const n = tribes.length * KN;
    FF.POOL_BAN.clear();
    const base = sweepK();
    const rows = [];
    for (const id of ids) {
      FF.POOL_BAN.clear(); FF.POOL_BAN.add(id);
      rows.push({ id, pct: sweepK() });
    }
    FF.POOL_BAN.clear();
    const band = BAND.gap(0.35, n);
    /* Bonferroni: the two-sided per-test z that holds the FAMILY error at 5%
       across every card tested. At fifty-eight cards that is about 3.0 sigma
       rather than 2.0, which is the price of asking fifty-eight questions. */
    const z = (() => {
      const pf = 0.05 / (2 * Math.max(1, ids.length));
      // Beasley-Springer-Moro is overkill; a bisection on the normal tail is not
      let lo = 0, hi = 6;
      const tail = (x) => 0.5 * (1 - erf(x / Math.SQRT2));
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (tail(mid) > pf) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    })();
    rows.sort((a2, b2) => a2.pct - b2.pct);
    console.log(`    ${n} runs an arm, ${ids.length} cards, baseline ${base.toFixed(0)}%`);
    console.log(`    (±${band.toFixed(1)} on a removal; the family bar for ${ids.length} tests is ` +
      `${z.toFixed(2)}σ = ±${(z * band).toFixed(1)}, not 2σ = ±${(2 * band).toFixed(1)})`);
    const missed = rows.filter((r) => base - r.pct >= z * band);
    const spare = rows.filter((r) => r.pct - base >= z * band);
    const show = (r) => `${r.id.padEnd(14)}${String(r.pct.toFixed(0) + '%').padStart(5)}  ` +
      `${(r.pct - base >= 0 ? '+' : '') + (r.pct - base).toFixed(1)}`;
    console.log('    the five the run misses most when it cannot be drafted:');
    for (const r of rows.slice(0, 5)) console.log('      ' + show(r));
    console.log('    and the five it does best without:');
    for (const r of rows.slice(-5).reverse()) console.log('      ' + show(r));
    console.log(`    → ${missed.length} card${missed.length === 1 ? '' : 's'} clear the family bar as LOAD-BEARING` +
      (missed.length ? ': ' + missed.map((r) => r.id).join(', ') : '') +
      `; ${spare.length} clear it as a LIABILITY` + (spare.length ? ': ' + spare.map((r) => r.id).join(', ') : ''));
    const inside = rows.filter((r) => Math.abs(r.pct - base) < band).length;
    console.log(`    ${inside} of ${ids.length} sit inside a single standard deviation of the baseline`);
    /* AND THE SAME QUESTION FROM THE OTHER END, because a flat removal table has
       two readings and only one of them is health.

       Taking a card out of a POOL asks what the pool misses, and a pool
       substitutes: the offer simply shows something similar next time, which is
       exactly the redundancy the purse turned out to be made of. "44 of 57
       inside a standard deviation" is equally what a set of interchangeable
       cards looks like.

       So: lock a minimal deck, hand it TWO copies of one card, and see what
       that card is worth from a standing start where nothing can substitute for
       it. If this table is flat too, the cards genuinely do not matter. */
    const GIVE = ['snowpup', 'cinderpup', 'snowpup', 'wayfarer', 'icepick', 'stew'];
    /* THE ONE ARM THAT IS ACTUALLY WORTH A POOL, and the reason the pool exists.
       Every gift is an independent count of wins over the same seeds — no
       module state is read back, the jobs are all the same size, and there are
       fifty-eight of them. That is the exact shape a fixed pool is good at, and
       it is why the pool was not wired into the ladder or the habit sweep: both
       of those read what the pilot accumulated as it played, and that state
       lives in whichever thread did the playing. */
    const giveJob = (id) => ({
      tribes, n: KN, base: 1000, step: 37, mode: 'tactics',
      tweak: { set: { lockDeck: true, mend: 8 }, give: GIVE.concat(id ? [id, id] : []) },
    });
    const t0 = Date.now();
    const answers = await runJobs([null].concat(ids).map(giveJob));
    const took = Date.now() - t0;
    const pctOf = (r) => (r.wins / Math.max(1, r.runs)) * 100;
    const floor = pctOf(answers[0]);
    const gifts = ids.map((id, i2) => ({ id, pct: pctOf(answers[i2 + 1]) })).sort((a2, b2) => b2.pct - a2.pct);
    console.log(`    (${ids.length + 1} arms x ${tribes.length * KN} runs on ${JOBS} ` +
      `thread${JOBS === 1 ? '' : 's'} in ${(took / 1000).toFixed(1)}s)`);
    console.log('');
    console.log(`    AND FROM A STANDING START: a locked 6-card deck (${floor.toFixed(0)}%) handed 2 copies of one card`);
    console.log('    the five worth most from nothing:');
    for (const r of gifts.slice(0, 5)) {
      console.log(`      ${r.id.padEnd(14)}${String(r.pct.toFixed(0) + '%').padStart(5)}  ` +
        `${(r.pct - floor >= 0 ? '+' : '') + (r.pct - floor).toFixed(1)}`);
    }
    console.log('    and the five worth least:');
    for (const r of gifts.slice(-5).reverse()) {
      console.log(`      ${r.id.padEnd(14)}${String(r.pct.toFixed(0) + '%').padStart(5)}  ` +
        `${(r.pct - floor >= 0 ? '+' : '') + (r.pct - floor).toFixed(1)}`);
    }
    const gBand = BAND.gap(0.35, n);
    const loud = gifts.filter((r) => Math.abs(r.pct - floor) >= z * gBand);
    const spread = gifts[0].pct - gifts[gifts.length - 1].pct;
    console.log(`    → ${loud.length} of ${ids.length} clear the same ${z.toFixed(2)}σ family bar (±${(z * gBand).toFixed(1)}); ` +
      `best to worst spans ${spread.toFixed(1)} points`);
    console.log(`    ${gifts.filter((r) => Math.abs(r.pct - floor) < gBand).length} sit inside a single standard deviation`);
    /* AND THE SAME TABLE IN ODDS, because POINTS ARE THE WRONG SCALE NEAR A
       FLOOR and this file established that two rounds ago arguing about
       compression. A locked six-card deck wins about 3% of the time, so a card
       worth "+6 points" has more than trebled the win rate and the points
       column calls it flat. The band on a log-odds difference comes off the
       four counts rather than a proportion's formula, which is what makes it
       usable at a 3% base where a percentage band is meaningless. */
    {
      const oddsOf = (pc) => (pc <= 0 ? 0 : pc >= 100 ? Infinity : (pc / 100) / (1 - pc / 100));
      const wins = (pc) => Math.max(0.5, Math.round((pc / 100) * n));
      const fO = oddsOf(floor), fW = wins(floor), fL = Math.max(0.5, n - fW);
      const withOdds = gifts.map((r) => {
        const w2 = wins(r.pct), l2 = Math.max(0.5, n - w2);
        const or = fO > 0 ? oddsOf(r.pct) / fO : 0;
        const sd = Math.sqrt(1 / fW + 1 / fL + 1 / w2 + 1 / l2);
        /* AN ARM THAT WON NOTHING HAS NO ODDS RATIO, AND IT WAS PRINTING 13.5σ.
           `Math.log(0 || 1e-9)` is −20.7, so a card that simply never won at a
           small sample came out as the most significant result in the table by a
           factor of four. Two cards did exactly that this round. A zero count
           carries no information about a ratio and the honest print is a dash,
           not a number that reads as certainty about a card nobody measured. */
        const dead = r.pct <= 0 || floor <= 0;
        return { id: r.id, pct: r.pct, or, dead,
          sig: dead || !(sd > 0) ? null : Math.abs(Math.log(or)) / sd };
      });
      const big = withOdds.filter((r) => r.sig !== null && r.sig >= z);
      console.log(`    in ODDS against the ${floor.toFixed(0)}% floor, which is the scale that works this low:`);
      /* EVERY CARD, not a podium. The first cut printed the top three and the
         rarity tiers were hand-assigned years before this table existed, so the
         only way to check one against the other is to have all of it. */
      const RN = { 1: 'common', 2: 'uncommon', 3: 'rare' };
      for (const r of withOdds) {
        const d2 = FF.CARDS[r.id];
        console.log(`      ${r.id.padEnd(14)}${r.or.toFixed(2).padStart(5)}x  ` +
          `${(r.sig === null ? '—' : r.sig.toFixed(1)).padStart(4)}${r.sig === null ? ' ' : 'σ'}  ` +
          `${(RN[d2 && d2.rare ? d2.rare : 1] || '?').padEnd(9)}` +
          `${d2 && d2.type === 'unit' ? 'warden' : 'gear'}`);
      }
      console.log(`      best-to-worst spans ${(withOdds[0].or / Math.max(0.01, withOdds[withOdds.length - 1].or)).toFixed(1)}x · ` +
        `${big.length} of ${ids.length} clear ${z.toFixed(2)}σ on this scale`);
      /* AND THE RARITY CHECK. A tier is a promise about how often a card shows
         up and how good it is when it does; the odds column is the first
         evidence anyone has had about the second half. */
      const byTier = { 1: [], 2: [], 3: [] };
      for (const r of withOdds) {
        const d2 = FF.CARDS[r.id];
        byTier[(d2 && d2.rare) || 1].push(r.or);
      }
      const med = (a) => { const b2 = a.slice().sort((x, y) => x - y); return b2.length ? b2[Math.floor(b2.length / 2)] : 0; };
      console.log('    by the rarity somebody assigned by hand:');
      for (const k of [1, 2, 3]) {
        console.log(`      ${RN[k].padEnd(9)}${String(byTier[k].length).padStart(3)} cards · ` +
          `median ${med(byTier[k]).toFixed(2)}x · ` +
          `range ${Math.min.apply(null, byTier[k].concat([9])).toFixed(2)}–${Math.max.apply(null, byTier[k].concat([0])).toFixed(2)}x`);
      }
    }

    ARMS.stamp('FF_CARDS=40', missed.length || spare.length
      ? `${missed.length} load-bearing, ${spare.length} liability at the ${z.toFixed(2)}σ family bar`
      : `removing: no card of ${ids.length} clears ${z.toFixed(2)}σ, widest ${rows[0].id} ${(rows[0].pct - base).toFixed(1)}; ` +
        `giving from a locked floor: ${loud.length} clear it, best ${gifts[0].id} +${(gifts[0].pct - floor).toFixed(1)}, ` +
        `span ${spread.toFixed(1)}`, n);
    ok(rows.length === ids.length, 'every card in the pool was priced');
  } else {
    console.log('    (FF_CARDS=40 prices every card by taking it out of the offer)');
    ok(true, 'the card arm is an arm, not a gate');
  }
}

/* --------------------------------------------- is a neutral mechanic kept -- */
section('what the wave telegraph actually does to a turn');
{
  /* IT MEASURES NEUTRAL ON WIN RATE and that is not, on its own, a verdict.
     FF_NOWAVE settled the balance question: floor +1, fight +1, trader −1,
     ladder unchanged. So the case for keeping it cannot be win rate, and
     "it feels better" is not evidence. What IS evidence: how often it is live,
     how often answering it changes where a body goes, and how often a wave
     actually turns around. A mechanic that fires twice a run and changes
     nothing is decoration; one that is live on a third of turns and moves the
     answer half the time it fires is a decision that happens to be fairly
     priced. */
  const tribes = ['hearth', 'frost', 'scrap'];
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
  const watch = (mode) => {
    TELL.on = true;
    TELL.live = 0; TELL.moved = 0; TELL.held = 0; TELL.fights = 0;
    TELL.turns = 0; TELL.allTurns = 0; TELL.lastB = null; TELL.lastHeld = 0;
    let runs = 0;
    for (const tribe of tribes) {
      for (let i = 0; i < N; i++) { playRun(tribe, 5100 + i * 29, mode); runs++; }
    }
    TELL.held += (TELL.lastHeld || 0);
    TELL.on = false;
    return { runs, live: TELL.live, moved: TELL.moved, held: TELL.held,
      fights: TELL.fights, turns: TELL.turns, allTurns: TELL.allTurns };
  };
  const good = watch('careful');
  /* AND THE QUESTION THAT SETTLES IT: does a pilot that never reads the
     telegraph get the same gift? If a careless line has its lane held just as
     often, the mechanic is not an expression of skill — it is a free delay
     handed to everybody, and no amount of "it feels good" makes it a decision. */
  const bad = watch('careless');
  const pc = (a, b) => Math.round((a / Math.max(1, b)) * 100) + '%';
  console.log(`    across ${good.runs} runs and ${good.fights} fights:`);
  console.log(`      a lane is named on ${good.turns} of ${good.allTurns} turns (${pc(good.turns, good.allTurns)})`);
  console.log(`      of the deployments made while one is live, ${good.moved} of ${good.live} ` +
    `(${pc(good.moved, good.live)}) go somewhere the pilot would not otherwise have put them`);
  console.log(`      waves that turned around and waited: ` +
    `${(good.held / Math.max(1, good.fights)).toFixed(2)} a fight for a pilot that reads it, ` +
    `${(bad.held / Math.max(1, bad.fights)).toFixed(2)} for one that never does`);
  const edge = (good.held / Math.max(1, good.fights)) - (bad.held / Math.max(1, bad.fights));
  console.log(`      → reading it is worth ${edge >= 0 ? '+' : ''}${edge.toFixed(2)} held waves a fight` +
    (Math.abs(edge) < 0.1 ? ' — the same gift either way, so it is feedback rather than a decision' : ''));
  ok(good.turns > 0, 'a lane does get named');
  ok(good.live > 0, 'and the pilot deploys while one is live');
}

/* ------------------------------------------------- calibrating the bands -- */
section('what a band actually is on this instrument');
{
  /* FF_CALIBRATE measures the two correction factors every other band in this
     file now divides by. It is its own arm because it costs forty runs of the
     pilot and answers a question about the INSTRUMENT rather than the game.

     Two shapes are measured, because there is no reason to assume one narrowing
     applies to both: a GAP (one habit against none — two arms) and an
     INTERACTION (a pair against the sum of its parts — four arms). Five seed
     bases each. The spread of the answers is the band, with no formula and no
     independence assumption in it. */
  const KN = Number(process.env.FF_CALIBRATE || 0);
  if (KN) {
    const tribes = ['hearth', 'frost', 'scrap'];
    const keep = Object.assign({}, SKILL);
    const at = (keys, base) => {
      for (const [k2] of HABITS) SKILL[k2] = false;
      for (const k of keys) SKILL[k] = true;
      let wins = 0, runs = 0;
      for (const tribe of tribes) {
        for (let i = 0; i < KN; i++) {
          const st = playRun(tribe, base + i * 37, 'tactics'); runs++; if (st.won) wins++;
        }
      }
      return (wins / Math.max(1, runs)) * 100;
    };
    const sd = (xs) => {
      const mu = xs.reduce((n, v) => n + v, 0) / xs.length;
      return Math.sqrt(xs.reduce((n, v) => n + (v - mu) * (v - mu), 0) / (xs.length - 1));
    };
    /* TWELVE BASES, NOT FIVE. Two independent five-point estimates of the same
       factor came out 1.63 and 1.13 for a gap and 1.33 and 0.72 for an
       interaction — a five-point standard deviation carries about a third of
       itself in error, which is not good enough to correct anything by. Twelve
       roughly halves that, and the cost is one arm's worth of runs. */
    const bases = [1000, 4000, 7000, 11000, 15000, 19000, 23000, 27000, 31000, 35000, 39000, 43000];
    const gaps = [], inters = [];
    for (const b of bases) {
      const z = at([], b), a2 = at(['deny'], b), b2 = at(['keepSlot'], b), ab = at(['deny', 'keepSlot'], b);
      gaps.push(a2 - z);
      inters.push(ab - z - (a2 - z) - (b2 - z));
    }
    Object.assign(SKILL, keep);
    const n = tribes.length * KN;
    const raw = 100 * Math.sqrt(0.2 * 0.8 / n);
    const mGap = sd(gaps), mInter = sd(inters);
    const fGap = (raw * Math.SQRT2) / Math.max(0.05, mGap);
    const fInter = (raw * 2) / Math.max(0.05, mInter);
    console.log(`    ${n} runs an arm, ${bases.length} seed bases`);
    console.log(`      a GAP (denying schemes against none) over ${bases.length} bases: ` +
      `${Math.min(...gaps).toFixed(1)} to ${Math.max(...gaps).toFixed(1)}`);
    console.log(`        measured ±${mGap.toFixed(2)} · derived ±${(raw * Math.SQRT2).toFixed(2)} for two arms ` +
      `(±${raw.toFixed(2)} for one, which is what the suite used to quote) · factor ${fGap.toFixed(2)}x`);
    console.log(`      an INTERACTION (deny + keepSlot) over ${bases.length} bases: ` +
      `${Math.min(...inters).toFixed(1)} to ${Math.max(...inters).toFixed(1)}`);
    console.log(`        measured ±${mInter.toFixed(2)} · derived ±${(raw * 2).toFixed(2)} for four arms · factor ${fInter.toFixed(2)}x`);
    /* AND THE THING THAT MAKES THIS WORTH DOING RATHER THAN INTERESTING: the
       two mistakes point opposite ways. Quoting a one-arm band for a two-arm
       question makes the band too NARROW by √2; shared seeds make it too WIDE
       by the measured factor. Whether six rounds of verdicts were generous or
       strict is the ratio between them, and it is printed rather than argued. */
    const netGap = mGap / raw;
    console.log(`      → net: the band the suite used to quote for a gap was ±${raw.toFixed(2)}, ` +
      `the truth is ±${mGap.toFixed(2)} — ${netGap > 1 ? 'the old gates were ' + ((netGap - 1) * 100).toFixed(0) + '% too GENEROUS'
        : 'the old gates were ' + ((1 / netGap - 1) * 100).toFixed(0) + '% too STRICT'}`);
    ARMS.stamp('FF_CALIBRATE=70', `a gap is ${fGap.toFixed(2)}x narrower than the two-arm formula, ` +
      `an interaction ${fInter.toFixed(2)}x; net against what the suite used to quote, gates were ` +
      `${netGap > 1 ? ((netGap - 1) * 100).toFixed(0) + '% too generous' : ((1 / netGap - 1) * 100).toFixed(0) + '% too strict'}`, n);
    const disk = ARMS.all['FF_CALIBRATE=70'];
    disk.factors = { gap: Number(fGap.toFixed(3)), inter: Number(fInter.toFixed(3)) };
    ARMS.save();
    ok(mGap > 0 && mInter > 0, 'both bands are numbers, not five identical runs');
  } else {
    console.log('    ' + BAND.note());
    ok(true, 'the calibration is an arm, not a gate');
  }
}

section('which parts of playing well are worth anything');
{
  /* FF_ABLATE turns this one section up on its own. The habits sit two to seven
     points apart, and at the suite's usual sample the band is five — which is
     why the same habit read +3 one round and -2 the next. Settling which of
     them are real needs a sample this section can afford only when it is the
     only thing running. */
  const N = Number(process.env.FF_ABLATE || process.env.FF_RUNS || DEFAULT_N);
  if (process.env.FF_ABLATE) console.log(`    (turned up: ${3 * N} runs an arm)`);
  /* FF_HABIT names ONE habit and prices only that one, which is what it takes
     to get a single number's band under two points inside a session. Ablating
     all six at a sample that tight costs six times as much and answers five
     questions nobody asked. */
  const ONLY = process.env.FF_HABIT || '';
  /* THE PILOT THIS ARM PRICES HABITS FOR, and it is a cage by default.
     `tactics` plays the fight and nothing else — no shopping, no drafting — so
     every habit here has been priced for a pilot that never buys a charm or
     steers an offer. That is a defensible control (it isolates the fight) and it
     is also exactly the shape of cage that made the trail finding evaporate one
     round ago. FF_REAL=1 runs the same ablation on a `careful` pilot, which is
     the game. Both are printed rather than one replacing the other, because if
     they agree the control was fine and if they disagree that IS the finding. */
  const ABL_MODE = process.env.FF_REAL ? 'careful' : 'tactics';
  if (process.env.FF_REAL) console.log('    (FF_REAL: the habits priced on a pilot that also shops and drafts)');
  if (ONLY) console.log(`    (only "${ONLY}", ${3 * N} runs an arm)`);
  const tribes = ['hearth', 'frost', 'scrap'];
  const sweep3 = () => {
    let wins = 0, runs = 0;
    for (const tribe of tribes) {
      for (let i = 0; i < N; i++) { const st = playRun(tribe, 1000 + i * 37, 'tactics'); runs++; if (st.won) wins++; }
    }
    return Math.round((wins / Math.max(1, runs)) * 100);
  };
  /* THE SLOWEST SECTION IN THE PROBE — 23.8 of 82 seconds, measured rather than
     guessed — and it is fourteen arms of N: six habits removed one at a time,
     six added one at a time, and two controls. All fourteen are plain win rates
     over the same seeds, and the only reason they were sequential is that each
     sets SKILL before it plays.

     A job carries its own config, so the SKILL state travels WITH the arm and
     all fourteen go out in one call. That is what per-job config was built for:
     the alternative is toggling a global fourteen times and draining the pool
     after each, which is slower than not pooling at all. */
  const sweep3Many = async (skillSets) => {
    const answers = await runJobs(skillSets.flatMap((skill) =>
      tribes.map((tribe) => ({ tribes: [tribe], n: N, base: 1000, step: 37, mode: ABL_MODE,
        config: { skill: Object.assign({}, SKILL, skill), draft: Object.assign({}, DRAFT) } }))));
    return skillSets.map((_, k) => {
      const part = answers.slice(k * tribes.length, (k + 1) * tribes.length);
      const wins = part.reduce((a2, x) => a2 + x.wins, 0);
      const runs = part.reduce((a2, x) => a2 + x.runs, 0);
      return Math.round((wins / Math.max(1, runs)) * 100);
    });
  };
  const OFF_ALL = {};
  for (const [k] of HABITS) OFF_ALL[k] = false;
  const [all] = await sweep3Many([{}]);
  const band = BAND.gap(0.2, tribes.length * N).toFixed(1);
  console.log(`    the fight, played well:  ${all}%`);
  /* ARE THE OTHER DECISIONS FAKE, OR IS ONE-AT-A-TIME THE WRONG QUESTION?

     The settled table says denying schemes is worth +7 and every other fight
     habit is inside the band — which reads as "nineteen of twenty decisions in
     a fight price at zero", and that would be a damning thing for a board game
     to be true of.

     But ablation removes ONE habit and leaves the pilot every other way of
     coping. If the habits overlap — if a pilot that cannot keep a slot back
     simply denies a scheme instead, and one that cannot hold gear spends it on
     the same target a turn earlier — then each reads zero on its own while the
     SET of them is worth a great deal. Removing them all at once is the only
     way to tell those two stories apart, and it had never been run. */
  const before = Object.assign({}, SKILL);
  const [none] = await sweep3Many([OFF_ALL]);
  console.log(`    the fight, with every habit switched off:  ${none}%  (${all - none} points for the set)`);

  /* AND THE SAME QUESTION FROM THE OTHER END, which is the thing that finally
     settled the money gap.

     Removing one habit at a time has said the same thing for six rounds: denial
     clears the band and nothing else does. That reads as "nineteen of twenty
     decisions are fake" — but the SET is worth nineteen points, and a set worth
     nineteen made of parts each worth zero is the exact signature of things
     that SUBSTITUTE for one another. A pilot that cannot keep a slot back
     denies a scheme instead; one that cannot hold gear spends it a turn early
     on the same target.

     So: start from the pilot that knows nothing and turn ONE habit on. If each
     alone recovers a real share of the nineteen, they are all real and the
     subtractive table was blunt rather than right. */
  const addedPcts = await sweep3Many(LIVE_HABITS.map(([key]) =>
    Object.assign({}, OFF_ALL, { [key]: true })));
  const added = LIVE_HABITS.map(([, label], k) => [label, addedPcts[k]]);
  added.sort((a2, z) => z[1] - a2[1]);
  /* And this table refuses to print inside its own band, the same as the one
     above it. It nearly cost a round: at the default sample it read "keeping a
     slot in reserve +5" with a ±2.8 band, that got written down as a finding,
     and at 180 runs an arm it is +2. A ranking inside its own band is noise
     wherever it is printed, including here. */
  /* TWO STANDARD DEVIATIONS, WRITTEN INTO THE SUITE.

     Two rounds running, a three-point reading at ±3.0 was reported as "a
     direction" and evaporated at the larger sample: keeping a slot back at +5
     became +2, and the beast's-rest change at +19 became +15. One round is bad
     luck; two is a habit, and a habit needs a rule rather than a resolution.

     So the suite says it instead of the author remembering to. Anything under
     TWO standard deviations is printed as noise, in the same breath as the
     number, whatever it looks like. A row that clears it is called a finding
     and nothing else is. */
  const sig = (d) => (Math.abs(d) >= 2 * Number(band) ? '' : '  (noise: under 2σ)');
  /* AND THIS TABLE HAS BEEN NAMING A WINNER WITHOUT EARNING ONE.

     `sig()` below marks a row that does not clear 2σ against the FLOOR, which
     is the right check for "is this habit worth anything". It is the wrong
     check for "which habit is best", and the sentence under this table has been
     making the second claim off the first check for six rounds — and stamping
     it. Two rows five points apart at a ±3.3 band are the same measurement, and
     naming one of them the top is exactly the ranking-inside-its-own-band
     failure the gear arm was gated on this round. The rule applies retroactively
     or it is not a rule. So the lead over SECOND place is checked too, and when
     it does not clear, the table says the top is not resolved rather than
     picking one. */
  const top = added[0];
  const runnerUp = added[1] ? added[1][1] : none;
  const lead = top[1] - runnerUp;
  const clear = Math.abs(lead) >= 2 * Number(band);
  console.log(`    and one at a time, starting from nothing (${none}% knowing none): ` +
    `${top[0].replace(' (removed)', '')} alone is worth ${top[1] - none} of the ${all - none}` +
    sig(top[1] - none));
  console.log(`      ${clear
    ? `and it leads the next by ${lead} at ±${band} — the top of this table is resolved`
    : `but it leads the next by only ${lead} at ±${band} — WHICH habit is top is NOT resolved` +
      (added[1] ? `, ${added[1][0].replace(' (removed)', '')} is level with it` : '')}`);
  /* The gate moved 3.2 → 3.5 when the band became measured: the same arm at the
     same sample now reports ±3.3 rather than ±3.0, because a difference of two
     arms is a wider quantity than one arm. Suppressing FF_ABLATE=60's table for
     that would be the measurement hiding its own correction. */
  if (Number(band) > 3.5) {
    console.log(`      (no table: ±${band} a row at this sample. FF_ABLATE=60 or more for one that means something)`);
    added.length = 0;
  } else {
    ARMS.stamp('FF_ABLATE=60', `${top[0].replace(' (removed)', '')} +${top[1] - none} of the ${all - none}` +
      (clear ? '' : ' (top NOT resolved: leads next by ' + lead + ' at ±' + band + ')') + '; ' +
      `next best ${added[1] ? added[1][0].replace(' (removed)', '') + ' +' + (added[1][1] - none) : 'none'}`,
      tribes.length * N);
  }
  for (const [label, pct] of added) {
    const d = pct - none;
    console.log(`      only ${label.replace(' (removed)', '').padEnd(34)}` +
      '█'.repeat(Math.round(pct / 2)).padEnd(14) + ` ${String(pct + '%').padStart(4)}  ` +
      (d > 0 ? '+' + d : String(d)) + ' of the ' + (all - none) + sig(d));
  }
  /* AND THE ARITHMETIC THE TWO TABLES ABOVE HAVE BEEN AVOIDING.

     Denial alone is worth +15 and the whole set is worth +17. The two numbers
     sat one paragraph apart for a round and the conclusion drawn from them was
     a paragraph about substitution. The blunter reading is that THE OTHER
     HABITS ARE COLLECTIVELY WORTH TWO POINTS, and several price negative
     alongside denial in the pair table.

     AND THE COUNT WAS WRONG FOR SIX ROUNDS, WHICH MADE IT SOUND WORSE THAN IT
     IS. This paragraph used to say "five habits worth two points" while noting,
     in its own next sentence, that two of the five were dead switches with
     empty bodies. Both facts were written down; the subtraction was not done.
     There are THREE other habits, not five — and three sharing two points is a
     different game from five sharing two. The dead pair also held two slots in
     the Bonferroni family, so every real habit was judged against a bar sized
     for six questions when the arm only ever asked four. They are dormant now:
     kept as switches, never priced, named below with what retired them.

     The aura cards were cut on exactly this shape of evidence — content that
     could not be shown to be worth anything, removed, and the ladder went UP
     six points. So the same question gets asked of the pilot, from the data
     already on the table: is the pilot that only denies WORSE than the pilot
     that does all six, by more than the band? If it is not, four habits are
     paying rent they cannot cover, and every fight-arm reading gets cheaper and
     cleaner without them. */
  {
    const denyOnly = addedPcts[LIVE_HABITS.findIndex(([k]) => k === 'deny')];
    const gap = all - denyOnly;
    const bar2 = 2 * Number(band);
    const rest = LIVE_HABITS.length - 1;
    console.log(`    ONLY DENYING ${denyOnly}% against ALL ${LIVE_HABITS.length} ${all}% — ` +
      `the other ${rest} are worth ${gap >= 0 ? '+' : ''}${gap} on top of denial ` +
      `(2σ = ±${bar2.toFixed(1)})`);
    console.log(`      ${gap >= bar2
      ? `the ${rest} carry their weight: keep them`
      : gap <= -bar2
        ? `the ${rest} make the pilot WORSE — they should come out`
        : `inside the band: ${rest} habits that cannot be shown to be worth anything`}`);
    const dormant = HABITS.filter((h) => h[2]);
    console.log(`      (${dormant.length} switches kept but not priced — ` +
      `${dormant.map((h) => `${h[1]}: ${h[2]}`).join('; ')})`);
    /* AND THE NUMBER THAT SIZES THE NEXT DESIGN, measured before designing.

       The three live habits substitute for denial, and a substitute only earns
       its keep on turns denial is unavailable. So: how many turns is that? This
       is the denominator of every idea that starts "make one of the others pay
       when there is nothing to deny" — if the board is almost never bare, the
       ceiling on that whole family is small and the honest move is a different
       family. */
    if (DENY.turns) {
      const pc2 = (n2) => (n2 / DENY.turns * 100).toFixed(0) + '%';
      console.log(`      a scheme is on the board on ${pc2(DENY.any)} of player turns, ` +
        `one this pilot can act on ${pc2(DENY.act)}, and the board is BARE on ${pc2(DENY.bare)} ` +
        `(${DENY.turns} turns) — the bare share is the ceiling on any habit built to ` +
        `pay when denial cannot`);
    }
    /* Reported rather than gated, and deliberately so. "Cannot be shown to be
       worth anything" is not "shown to be worth nothing", and at this arm's
       band those are different claims — the whole point of the ladder-band
       entry. What licenses deleting a habit is a NEGATIVE reading past the
       bar, not an inconclusive one, and this prints which it got. */
  }

  /* AND THE QUESTION NEITHER TABLE CAN ANSWER: DO ANY TWO OF THEM COMBINE?

     Shipping the wave telegraph took denial from 17-of-17 down to 8-of-17 while
     the SET stayed at 17. Nine points went somewhere no single-habit arm can
     see, and there is only one place they can be: pairs. Two habits that are
     each worth nothing alone and something together are the signature of a
     second decision — the thing four rounds of one-at-a-time ablation has been
     structurally unable to find.

     So turn them on TWO at a time and look for INTERACTION, which is the pair
     measured against the sum of its parts:

         interaction = pair − none − (a − none) − (b − none)

     Zero means they simply add and there is nothing there. Positive past two
     standard deviations means the pair is worth more than its halves — that is
     the second decision, found by measurement rather than by building another
     mechanic. Negative past the band means they SUBSTITUTE, which is its own
     answer and the one the subtractive table has been quietly assuming.

     The band is wider than a single row's: the interaction is a sum of four
     measured rates, so its variance is four times one row's and its standard
     deviation twice. Nothing here is reported that does not clear 2× that.

     It ran first on the four habits that plausibly touch a named wave — deny,
     place, reposition, keepSlot — on the grounds that holding gear and calling
     waves early have nothing to do with which lane a body stands in. All six
     pairs read "they simply add", and the ARITHMETIC said the exclusion was
     the mistake: those four together reach about +9 and the whole set is worth
     +17, so eight points were sitting in the two habits that had been reasoned
     away. All fifteen pairs run now. An intuition about which things could
     interact is exactly the thing this arm exists to replace.

     And a CUMULATIVE row underneath, best single first, because a pair table
     locates an interaction between two things and says nothing about where a
     set's value accumulates. FF_PAIRS turns the whole thing on: twenty-seven
     arms is not something an ordinary check should pay for. */
  const PN = Number(process.env.FF_PAIRS || 0);
  if (PN) {
    /* FF_PAIR=a+b prices ONE pair, the way FF_HABIT prices one habit, because
       the interaction band is twice a row's and settling a single interaction
       therefore costs four times the sample. Fifteen pairs at that depth
       answers fourteen questions nobody asked. */
    const ONE = (process.env.FF_PAIR || '').split('+').filter(Boolean);
    const KEYS = ONE.length === 2 ? ONE : LIVE_HABITS.map(([k]) => k);
    if (ONE.length === 2) console.log(`    (one pair only: ${ONE.join(' + ')})`);
    const nameOf = (k) => HABITS.find((h) => h[0] === k)[1];
    const at = (keys, base = 1000) => {
      for (const [k2] of HABITS) SKILL[k2] = false;
      for (const k of keys) SKILL[k] = true;
      let wins = 0, runs = 0;
      for (const tribe of tribes) {
        for (let i = 0; i < PN; i++) {
          const st = playRun(tribe, base + i * 37, 'tactics'); runs++; if (st.won) wins++;
        }
      }
      return (wins / Math.max(1, runs)) * 100;
    };
    const zero = at([]);
    const solo = {};
    for (const k of KEYS) solo[k] = at([k]);
    const pband = BAND.gap(0.2, tribes.length * PN);
    const iband = BAND.inter(0.2, tribes.length * PN);
    console.log('');
    console.log(`    IN PAIRS (${tribes.length * PN} runs an arm, ±${pband.toFixed(1)} a row, ` +
      `±${iband.toFixed(1)} on an interaction)`);
    const signed = (n) => (n >= 0 ? '+' : '') + n.toFixed(1);
    console.log(`      knowing none: ${zero.toFixed(0)}%   ` +
      KEYS.map((k) => `${k} ${signed(solo[k] - zero)}`).join('  '));
    const pairs = [];
    for (let i = 0; i < KEYS.length; i++) {
      for (let j = i + 1; j < KEYS.length; j++) {
        const a2 = KEYS[i], b2 = KEYS[j];
        const both = at([a2, b2]);
        const parts = (solo[a2] - zero) + (solo[b2] - zero);
        pairs.push({ a: a2, b: b2, both, gain: both - zero, parts, inter: both - zero - parts });
      }
    }
    /* WHERE THE SET'S VALUE ACTUALLY ACCUMULATES.

       A pair table can only find an interaction between two named things. The
       question underneath it is different: six habits worth about eight points
       between them one at a time add up to a set worth seventeen, and the nine
       missing points have to enter SOMEWHERE. Turning them on cumulatively,
       best single first, says at which rung they arrive. */
    const order = KEYS.slice().sort((x, y) => solo[y] - solo[x]);
    const ladder = [];
    for (let i = 1; i <= order.length; i++) ladder.push({ n: i, pct: at(order.slice(0, i)) });
    Object.assign(SKILL, before);
    pairs.sort((x, y) => y.inter - x.inter);
    for (const p of pairs) {
      const verdict = Math.abs(p.inter) < 2 * iband ? 'they simply add'
        : (p.inter > 0 ? '>>> MORE THAN ITS HALVES' : 'they substitute');
      console.log(`      ${(nameOf(p.a) + ' + ' + nameOf(p.b)).padEnd(52)}` +
        `${String(p.both.toFixed(0) + '%').padStart(4)}  ` +
        `together ${signed(p.gain).padStart(5)} · apart ${signed(p.parts).padStart(5)} · ` +
        `interaction ${signed(p.inter).padStart(5)}  ${verdict}`);
    }
    /* IS THE PRINTED BAND THE REAL BAND? IT IS NOT.

       Every band this suite prints is the textbook one for a proportion and it
       assumes the arms are independent samples. THEY ARE NOT: every arm plays
       the same seeds, so two arms differ only by what the pilot did with an
       identical trail. Paired samples make the band on a DIFFERENCE narrower
       than the independent formula says, and a band that is wrong in the safe
       direction is still wrong — it rejects real results.

       So measure it rather than derive it. Run the same comparison at five
       different seed bases and take the spread of the answers: that is the
       band, with no formula and no independence assumption in it. Five points
       is a thin estimate of a standard deviation and it is an honest one, which
       the derived number was not.

       Both quantities the table gates on are measured: a plain GAIN (one habit
       against none) and an INTERACTION (a pair against the sum of its parts),
       because they are built out of two rates and four and there is no reason
       to assume the same narrowing applies to both. */
    const seedBands = (() => {
      const bases = [1000, 4000, 7000, 11000, 15000];
      const sd = (xs) => {
        const mu = xs.reduce((n, v) => n + v, 0) / xs.length;
        return Math.sqrt(xs.reduce((n, v) => n + (v - mu) * (v - mu), 0) / (xs.length - 1));
      };
      /* The two habits that DO something, by their own single-arm size. The
         first cut used KEYS[0] and KEYS[1] and measured an interaction of
         exactly 0.0 at all five bases, because `reposition` is a switch over an
         empty block: its arms are byte-identical to the ones without it, so the
         interaction is zero by construction and the "band" came out 110x
         narrower than derived. A band of zero is not a narrow band, it is a
         broken instrument, and the assertion below is what caught it. */
      const rank = KEYS.slice().sort((x, y) => Math.abs(solo[y] - zero) - Math.abs(solo[x] - zero));
      const A = rank[0], B = rank[1];
      const gains = [], inters = [];
      for (const bse of bases) {
        const z = at([], bse), a2 = at([A], bse), b2 = at([B], bse), ab = at([A, B], bse);
        gains.push(a2 - z);
        inters.push(ab - z - (a2 - z) - (b2 - z));
      }
      Object.assign(SKILL, before);
      return { gains, inters, A, B, gain: sd(gains), inter: sd(inters) };
    })();
    console.log(`      the band, MEASURED at five seed bases rather than derived:`);
    console.log(`        a gain (${nameOf(seedBands.A)} against none) reads ` +
      seedBands.gains.map((v) => v.toFixed(1)).join(', ') +
      ` — sd ±${seedBands.gain.toFixed(1)} against ±${(pband * Math.SQRT2).toFixed(1)} derived`);
    console.log(`        an interaction (${nameOf(seedBands.A)} + ${nameOf(seedBands.B)}) reads ` +
      seedBands.inters.map((v) => v.toFixed(1)).join(', ') +
      ` — sd ±${seedBands.inter.toFixed(1)} against ±${iband.toFixed(1)} derived`);
    const shrink = iband / Math.max(0.05, seedBands.inter);
    console.log(`        → the live check says the measured band is ${shrink >= 1 ? shrink.toFixed(2) + 'x NARROWER' : (1 / shrink).toFixed(2) + 'x WIDER'} ` +
      `than the derived one (five bases here; FF_CALIBRATE runs twelve and is the one the suite uses)`);
    console.log(`        on the MEASURED band (2σ = ±${(2 * seedBands.inter).toFixed(1)}), the pairs that clear are: ` +
      (pairs.filter((p) => Math.abs(p.inter) >= 2 * seedBands.inter)
        .map((p) => `${nameOf(p.a)} + ${nameOf(p.b)} ${signed(p.inter)}`).join(', ') || 'none'));
    console.log(`      and cumulatively, best single first (${order.join(' → ')}):`);
    const apart = KEYS.reduce((n, k) => n + (solo[k] - zero), 0);
    const together = ladder[ladder.length - 1].pct - zero;
    console.log('        ' + ladder.map((r) => `${r.n}:${r.pct.toFixed(0)}%`).join('  ') +
      `   · one at a time they sum to ${signed(apart)}, together they are ${signed(together)}`);
    /* AND WHAT IT WOULD TAKE TO SETTLE THAT, said out loud rather than left as
       "not resolvable at this sample". The set-minus-sum statistic is built out
       of k+1 arms and its band scales as 1/√n like everything else.

       It used to solve for `2σ = D`, which the ladder table proved is the sample
       where the reading sits exactly on its own band and clearing is a coin
       flip. Sized for `2σ ≤ D/2` instead, which is 4x the runs — the `4 * sb`
       below, and the same correction the rung forecast got. */
    {
      const D = together - apart;
      const sb = BAND.set(0.2, tribes.length * PN, KEYS.length);
      const need = Math.ceil(tribes.length * PN * Math.pow((4 * sb) / Math.max(0.1, Math.abs(D)), 2));
      console.log(`        the difference is ${signed(D)} against a band of ±${sb.toFixed(1)} ` +
        `(${Math.abs(D) >= 2 * sb ? 'CLEARS 2σ' : 'under 2σ — noise'}); ` +
        `settling it needs ${need} runs an arm, ${Math.round(need / Math.max(1, tribes.length * PN) * 100) / 100}x this sample`);
    }
    const bestPair = pairs[0];
    ARMS.stamp(ONE.length === 2 ? 'FF_PAIR=' + ONE.join('+') : 'FF_PAIRS=70', bestPair.inter >= 2 * iband
      ? `${nameOf(bestPair.a)} + ${nameOf(bestPair.b)} is +${bestPair.inter.toFixed(1)} past its halves ` +
        `(needs ±${(2 * iband).toFixed(1)})`
      : `best is ${nameOf(bestPair.a)} + ${nameOf(bestPair.b)} at +${bestPair.inter.toFixed(1)}, ` +
        `against ±${(2 * iband).toFixed(1)} derived but ±${(2 * seedBands.inter).toFixed(1)} MEASURED ` +
        `— shared seeds make the real band ${shrink.toFixed(1)}x narrower than the printed one`,
      tribes.length * PN);
    ok(pairs.length === (KEYS.length * (KEYS.length - 1)) / 2, 'every pair of the set was priced');
    ok(seedBands.inter > 0, 'the measured band is a number, not a coincidence of five identical runs');
  }

  const subKeys = LIVE_HABITS.filter(([key]) => !ONLY || key === ONLY);
  const withoutPcts = await sweep3Many(subKeys.map(([key]) => ({ [key]: false })));
  const rows = subKeys.map(([, label], k) => ({ label, cost: all - withoutPcts[k] }));
  rows.sort((a, z) => z.cost - a.cost);
  /* A TABLE NOBODY MAY READ IS WORSE THAN NO TABLE.

     This ranking was printed every run for six rounds and read as a podium, and
     it was never one: at the suite's usual sample each row carries ±2.8, so six
     numbers re-rolled every round produce a different order every time. The
     same six habits read +9/+8/+6/+6 one round and +6/0/0/-2/-3 the next with
     nothing changed between them.

     So it prints only when it can be trusted. Under a two-point band it is a
     table; over one it is a single honest sentence and an instruction for
     getting the real thing. The probe is three times faster than it was, so
     the real thing is now affordable. */
  const READABLE = 2.0;
  if (Number(band) <= READABLE) {
    for (const r of rows) {
      const n = r.cost;
      const bar = n > 0 ? '█'.repeat(Math.min(20, Math.round(n / 2))) : '';
      console.log(`      ${String(n >= 0 ? '+' + n : n).padStart(4)}  ${bar.padEnd(20)} ${r.label}`);
    }
    console.log(`      (±${band} is one standard deviation — a habit inside that band is not a decision)`);
  } else {
    console.log(`      (no table: ±${band} a row at this sample, and a ranking inside its own band is noise.`);
    console.log(`       FF_ABLATE=${Math.ceil(400 / tribes.length)} for all of them, or FF_HABIT=<key> FF_ABLATE=250 for one)`);
  }
  {
    const tot = ROOM.free.reduce((n, v) => n + (v || 0), 0) || 1;
    console.log('    free slots on the player line, by share of turns: ' +
      ROOM.free.map((v, i) => i + ':' + Math.round(((v || 0) / tot) * 100) + '%').join(' '));
    const et = ROOM.efree.reduce((n, v) => n + (v || 0), 0) || 1;
    console.log('    free slots on the foes\' line:                    ' +
      ROOM.efree.map((v, i) => i + ':' + Math.round(((v || 0) / et) * 100) + '%').join(' '));
    const ct = CROOM.free.reduce((n, v) => n + (v || 0), 0) || 1;
    console.log('    and on a CARELESS pilot\'s line:                   ' +
      CROOM.free.map((v, i) => i + ':' + Math.round(((v || 0) / ct) * 100) + '%').join(' '));
  }
  console.log(`    the room rule, in practice: the line stood on a packed board for ` +
    `${Math.round((ROOM.packed / Math.max(1, ROOM.packed + ROOM.spare)) * 100)}% of turns · ` +
    `a body was held back on ${ROOM.declined} of ${ROOM.plays} deployments ` +
    `(${Math.round((ROOM.declined / Math.max(1, ROOM.plays)) * 100)}%)`);
  ok(true, 'the ablation is a report, not a gate');
}

/* ----------------------------------------------- where the mending comes -- */
section('why damage is not a pressure');
{
  const tribes = ['hearth', 'frost', 'scrap'];
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
  MEND.on = true; MEND.by = {}; MEND.hurt = 0;
  let wins = 0, runs = 0;
  for (const tribe of tribes) {
    for (let i = 0; i < N; i++) { const st = playRun(tribe, 7000 + i * 31, 'careful'); runs++; if (st.won) wins++; }
  }
  MEND.on = false;
  const rows = Object.entries(MEND.by).sort((a2, z) => z[1] - a2[1]);
  const total = rows.reduce((n, r) => n + r[1], 0) || 1;
  console.log('  · where the mending comes from');
  console.log(`    ${Math.round(MEND.hurt)} damage taken across ${runs} runs, ` +
    `${Math.round(total)} of it mended (${Math.round((total / Math.max(1, MEND.hurt)) * 100)}%)`);
  for (const [where, amount] of rows.slice(0, 6)) {
    console.log(`      ${where.padEnd(34)}${'█'.repeat(Math.round((amount / total) * 40)).padEnd(40)} ` +
      `${Math.round((amount / total) * 100)}%`);
  }
  ok(MEND.hurt > 0, 'the caravan does take damage');
  ok(total > 0, 'and something mends it');
}

/* --------------------------------------------- the arms nobody remembers -- */
section('the arms that are not run by default');
{
  /* THREE INSTRUMENTS EXIST THAT AN ORDINARY CHECK NEVER RUNS, and the first
     attempt at surfacing them printed a hand-written string saying what each
     one "said last time". That is a comment with extra steps: nothing enforced
     it and it would have been wrong within three rounds.

     So the readings are STAMPED: an arm that runs writes its headline and the
     sample it ran at to `.frostfell-arms.json`, and the default check reads it
     back. That file is COMMITTED, which is the whole point — a reading that
     lived only on the machine that took it starts blank in a fresh clone, which
     is exactly the rot it was meant to stop.

     There is no age counter. One was tried, incrementing on every check, and it
     churned the file on every run for a number nobody needed: git already knows
     when a reading last changed, and knows it better. */
  const rows = [];
  for (const [knob, what] of STANDING) {
    const rec = ARMS.read(knob);
    rows.push([knob, what, rec]);
  }
  const stale = rows.filter(([, , rec]) => rec && !ARMS.fresh(rec)).length;
  const never = rows.filter(([, , rec]) => !rec).length;
  console.log(`  · arms that do not run by default — build ${BUILD}: ` +
    `${rows.length - stale - never} current, ${stale} taken on an older build, ${never} never run`);
  /* WHAT CLEARING THE RED LIGHT COSTS, because a staleness marker nobody can
     clear is a red light taped over.

     The fingerprint changes on any edit to the game or the pilot, so a full set
     of current readings is only ever true for the build it was taken on — which
     makes "re-run everything" a RELEASE step rather than a thing you do while
     working. That is fine, and it needs a price on it: each arm's stamp records
     the sample it ran at, so the total is the sum of what it would take to say
     every reading describes the build in the tree. Printed rather than left to
     somebody's memory, next to the command that does it. */
  {
    const runs = rows.reduce((n, [, , rec]) => n + (rec && rec.sample ? rec.sample : 0), 0);
    const knobs = rows.map(([k]) => k).join(' ');
    console.log(`    to make every reading current: ~${runs.toLocaleString()} runs across ${rows.length} arms ` +
      `(the fingerprint ignores comments, so a round spent writing prose leaves these standing)`);
    console.log(`      ${knobs}`);
  }
  for (const [knob, what, rec] of rows) {
    console.log(`    ${knob.padEnd(26)} ${what}`);
    console.log(`    ${''.padEnd(26)} → ` + (rec
      ? `${rec.said}   (at ${rec.sample} an arm${ARMS.fresh(rec) ? '' : ', ON AN OLDER BUILD — re-run before quoting'})`
      : 'no reading recorded — run it'));
  }
  /* Every knob in the file that GATES A SECTION is an arm and has to be listed
     here, or the summary quietly stops mentioning something that exists. Read
     off the source rather than trusted to a number: a list that has to be
     bumped by hand is a list that goes stale. */
  const inSource = [...readFileSync(new URL(import.meta.url), 'utf8')
    .matchAll(/process\.env\.(FF_[A-Z]+)/g)].map((m2) => m2[1]);
  const MODIFIERS = ['FF_RUNS', 'FF_HABIT', 'FF_GIVE', 'FF_SIDES', 'FF_RESTN', 'FF_PAIR', 'FF_NOWAVE', 'FF_GEARBAR', 'FF_LIVEBUILT', 'FF_BUILT', 'FF_CONTRAST', 'FF_VDECKS', 'FF_VSEED', 'FF_VLIVE', 'FF_REAL', 'FF_TIME', 'FF_JOBS', 'FF_GAME',
    /* FF_ROUTE deepens the routing section, which no longer claims a standing
       reading — see the retirement note there. It is a depth knob now, like
       FF_HABIT on the ablation. */
    'FF_ROUTE'];
  const listed = STANDING.map(([k]) => k.split('=')[0]);
  const missing = [...new Set(inSource)].filter((k) => MODIFIERS.indexOf(k) < 0 && listed.indexOf(k) < 0);
  eq(missing.join(','), '', 'every knob that gates a section is listed as an arm');
  ok(STANDING.length >= 10, 'and all ten of them are');
  /* AND A STAMP THAT DESCRIBES A GAME THAT NO LONGER EXISTS.

     The stamp file was built to catch an arm listed as standing and never run.
     It has a second failure mode nobody had looked for, and `FF_CARDS` was
     sitting in it: its reading named `coldbearer` and `backdrift` as the widest
     and best cards in the pool, and both were CUT two rounds ago. The summary
     printed that every default run, so the check was reporting a measurement of
     a card set the game does not have — which is worse than "no reading
     recorded", because it looks like an answer.

     A reading quotes card ids and nothing else in it can be validated, so that
     is what gets validated: any lowercase word in a stamp that used to be a
     card id and no longer is fails here. It cannot know a number went stale; it
     can know the game changed underneath one, which is the case that actually
     happened. */
  /* AND THE PROPERTY THE FINGERPRINT NOW CLAIMS, asserted rather than asserted
     ABOUT. "Comments do not invalidate readings" is the whole reason the banked
     set can survive a round, and it is one regex away from silently not being
     true — so the same hash is taken over a copy of the game with a block
     comment, a line comment and some extra whitespace spliced in, and it has to
     come out identical. */
  {
    const fp = (src) => {
      let h = 0x811c9dc5;
      const t = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^[ \t]*\/\/.*$/gm, ' ').replace(/\s+/g, ' ');
      for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return h.toString(36);
    };
    const src0 = readFileSync(new URL('../frostfell/index.html', import.meta.url), 'utf8');
    const noisy = src0 + '\n/* a note somebody wrote */\n  // and another\n\n';
    eq(fp(noisy), fp(src0), 'a comment does not move the build fingerprint');
    eq(fp(src0 + '\n'), fp(src0), 'and neither does trailing whitespace');
    ok(fp(src0.replace('const HAND = 6;', 'const HAND = 7;')) !== fp(src0),
      'but a changed constant does');
  }
  {
    const ghosts = [];
    for (const [knob] of STANDING) {
      const rec = ARMS.read(knob);
      if (!rec) continue;
      for (const w of String(rec.said).match(/\b[a-z]{5,}\b/g) || []) {
        if (FF.CARDS[w] || FF.FOES[w]) continue;
        if (GONE.has(w)) ghosts.push(`${knob}: ${w}`);
      }
    }
    eq([...new Set(ghosts)].join(' | '), '',
      'no stamped reading names a card the game no longer has');
  }
}

/* ------------------------------------------------- can a lesson be priced -- *//* ------------------------------------------------- can a lesson be priced -- */
section('what being told is worth');
{
  /* Three pilots, identical but for what they know about red text. The middle
     one is the game as it ships: it learns only when the lesson fires, which
     is in the first zone, on a run that has never denied a scheme, twice. */
  const tribes = ['hearth', 'frost', 'scrap'];
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
  const sweepT = (o) => {
    o = o || {};
    TAUGHT.on = !!o.on; TAUGHT.always = !!o.always; TAUGHT.room = !!o.room;
    const L = FF.LESSON, keep = { times: L.times, zone: L.zone };
    if (o.times !== undefined) L.times = o.times;
    if (o.zone !== undefined) L.zone = o.zone;

    let wins = 0, runs = 0, reached = 0;
    for (const tribe of tribes) {
      for (let i = 0; i < N; i++) {
        const st = playRun(tribe, 5000 + i * 41, 'careless');
        runs++;
        if (st.won) wins++;
        if (st.zone >= 1) reached++;
      }
    }
    TAUGHT.on = false; TAUGHT.always = false; TAUGHT.room = false;
    L.times = keep.times; L.zone = keep.zone;
    return { pct: Math.round((wins / Math.max(1, runs)) * 100), reached, runs };
  };
  const blind = sweepT({});
  const told = sweepT({ on: true });
  const knowing = sweepT({ on: true, always: true });
  const bar = (n) => '█'.repeat(Math.round(n / 2)).padEnd(24);
  const band = BAND.gap(0.1, blind.runs).toFixed(1);
  console.log('  · what being told is worth');
  console.log(`    never told   ${bar(blind.pct)} ${String(blind.pct + '%').padStart(4)}   ` +
    `${blind.reached}/${blind.runs} saw the second zone`);
  console.log(`    told once    ${bar(told.pct)} ${String(told.pct + '%').padStart(4)}   ` +
    `${told.reached}/${told.runs}`);
  console.log(`    always knew  ${bar(knowing.pct)} ${String(knowing.pct + '%').padStart(4)}   ` +
    `${knowing.reached}/${knowing.runs}`);
  console.log(`    → knowing is worth ${knowing.pct - blind.pct} points; being told carries ` +
    `${told.pct - blind.pct} of them (±${band} is one standard deviation)`);

  /* WHAT DOSE, AND IS THERE A SECOND THING WORTH TEACHING.

     Twice, in the first zone, about schemes: three numbers nobody had ever
     turned. FF_LESSON turns this section up on its own the way FF_ABLATE does
     the habits — it is eight arms, so it is not run on an ordinary check. */
  const LN = Number(process.env.FF_LESSON || 0);
  if (LN) {
    const rows = [
      ['told once (ships)',    { on: true, times: 1 }],
      ['told twice',           { on: true, times: 2 }],
      ['told four times',      { on: true, times: 4 }],
      ['told in every zone',   { on: true, times: 2, zone: 9 }],
      ['the room rule only',   { room: true, times: 1 }],
      ['both lessons',         { on: true, room: true, times: 1 }],
    ];
    console.log('    what the dose is worth (careless, against ' + blind.pct + '% never told):');
    let first = null;
    for (const [name, o] of rows) {
      const arm = sweepT(o);
      const d = arm.pct - blind.pct;
      if (first === null) first = d;
      console.log(`      ${name.padEnd(20)}${bar(arm.pct)} ${String(arm.pct + '%').padStart(4)}  ` +
        (d > 0 ? '+' + d : String(d)));
    }
    ARMS.stamp('FF_LESSON=1', `being told once is +${first}; every larger dose reads the same`,
      tribes.length * N);
  }
  ok(knowing.pct >= blind.pct - 5, 'knowing how to deny a scheme is not a handicap');
  ok(true, 'what being told is worth is a report, not a gate');
}

/* --------------------------------------------- how much skill can carry --- */
/* "A run is decided mostly by the deck it is holding" was last round's honest
   finding and it is also, put another way, a design choice. This arm measures
   the size of it: the SAME deck, locked for the whole trail, played by both
   pilots. Nothing is drafted, bought or burned, so every point of difference
   between the two rows is the fight and only the fight — and the difference
   between a weak deck played well and a strong one played badly is how much of
   a deck gap skill can actually close. */
section('which reward-screen decisions are worth anything');
{
  const N = Number(process.env.FF_ABLATE || process.env.FF_RUNS || DEFAULT_N);
  if (process.env.FF_ABLATE) console.log(`    (turned up: ${3 * N} runs an arm)`);
  const tribes = ['hearth', 'frost', 'scrap'];
  /* Same shape as the fight ablation and pooled the same way: the DRAFT flag
     each arm needs travels in the job rather than being toggled globally. */
  const sweep4Many = async (draftSets) => {
    const answers = await runJobs(draftSets.flatMap((draft) =>
      tribes.map((tribe) => ({ tribes: [tribe], n: N, base: 1000, step: 37, mode: 'careful',
        config: { skill: Object.assign({}, SKILL), draft: Object.assign({}, DRAFT, draft) } }))));
    return draftSets.map((_, k) => {
      const part = answers.slice(k * tribes.length, (k + 1) * tribes.length);
      const wins = part.reduce((a2, x) => a2 + x.wins, 0);
      const runs = part.reduce((a2, x) => a2 + x.runs, 0);
      return Math.round((wins / Math.max(1, runs)) * 100);
    });
  };
  const rewardPcts = await sweep4Many([{}].concat(DRAFT_HABITS.map(([key]) => ({ [key]: false }))));
  const all = rewardPcts[0];
  const band = BAND.gap(0.3, tribes.length * N).toFixed(1);
  console.log(`    the reward screen, played well:  ${all}%`);
  const rows = DRAFT_HABITS.map(([, label], k) => ({ label, cost: all - rewardPcts[k + 1] }));
  rows.sort((a, z) => z.cost - a.cost);
  // The same rule as the fight table above: it prints when it can be trusted
  // and says so plainly when it cannot.

  const READABLE = 2.0;
  if (Number(band) <= READABLE) {
    for (const r of rows) {
      const n = r.cost;
      const bar = n > 0 ? '█'.repeat(Math.min(20, Math.round(n / 2))) : '';
      console.log(`      ${String(n >= 0 ? '+' + n : n).padStart(4)}  ${bar.padEnd(20)} ${r.label}`);
    }
    console.log(`      (±${band} is one standard deviation — a habit inside that band is not a decision)`);
  } else {
    console.log(`      (no table: ±${band} a row at this sample, and a ranking inside its own band is noise.`);
    console.log(`       FF_ABLATE=${Math.ceil(400 / tribes.length)} for all of them, or FF_HABIT=<key> FF_ABLATE=250 for one)`);
  }
  ok(true, 'the reward ablation is a report, not a gate');
}

section('the same deck, two pilots');
{
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
  const tribes = ['hearth', 'frost', 'scrap'];
  /* Both decks have to be able to finish the trail or the arm measures nothing
     but zeroes — a starter deck with no rewards at all wins about none of the
     time whoever is holding it. So both get the bodies a mid-run caravan would
     have, and the strong one gets the gear, the beast-cards and the tempering a
     well-shopped run arrives with. */
  const BASE = ['snowpup', 'cinderpup', 'snowpup', 'wayfarer', 'icepick', 'stew'];
  const EXTRA = ['bellowsbear', 'cairn', 'avalanche', 'gearshield', 'hush', 'lastlight'];
  /* A locked run cannot visit a trader or take a camp's mending, so without the
     mend the arm measures a war of attrition rather than a series of fights:
     damage carries between them and nothing ever puts it back. Every locked
     caravan mends the same amount, so it stays a controlled comparison. */
  const lock = (strong) => ({
    set: { lockDeck: true, mend: 8 },
    give: strong ? BASE.concat(EXTRA) : BASE,
    temper: !!strong,
  });
  /* Four arms x three tribes in ONE call. Nothing here reads a pilot counter —
     it is four win rates — so the only requirement is that the four arms go out
     together rather than draining the pool four times. */
  const COMBOS = [['careless', false], ['tactics', false], ['careless', true], ['tactics', true]];
  const lockAnswers = await runJobs(COMBOS.flatMap(([mode, strong]) =>
    tribes.map((tribe) => ({ tribes: [tribe], n: N, base: 1000, step: 37, mode, tweak: lock(strong) }))));
  const pctAt = (ci) => {
    const part = lockAnswers.slice(ci * tribes.length, (ci + 1) * tribes.length);
    const w = part.reduce((a2, x) => a2 + x.wins, 0), r = part.reduce((a2, x) => a2 + x.runs, 0);
    return Math.round((w / Math.max(1, r)) * 100);
  };
  const weakBad = pctAt(0), weakGood = pctAt(1);
  const strongBad = pctAt(2), strongGood = pctAt(3);
  const band = Math.round(100 * Math.sqrt(0.25 * 0.75 / Math.max(1, tribes.length * N)));
  const bar2 = (n) => '█'.repeat(Math.round(n / 2)).padEnd(30);
  console.log(`    ${'weak deck, played badly'.padEnd(26)}${bar2(weakBad)} ${String(weakBad + '%').padStart(4)}`);
  console.log(`    ${'weak deck, played well'.padEnd(26)}${bar2(weakGood)} ${String(weakGood + '%').padStart(4)}`);
  console.log(`    ${'strong deck, played badly'.padEnd(26)}${bar2(strongBad)} ${String(strongBad + '%').padStart(4)}`);
  console.log(`    ${'strong deck, played well'.padEnd(26)}${bar2(strongGood)} ${String(strongGood + '%').padStart(4)}`);
  const deckGap = strongBad - weakBad;
  const skillGap = weakGood - weakBad;
  console.log(`    → the deck is worth ${deckGap} points, the fight ${skillGap} — ` +
    `skill closes ${deckGap > 0 ? Math.round(100 * skillGap / deckGap) : 0}% of a deck gap ` +
    `(±${band} is one standard deviation)`);
  ok(weakGood >= weakBad - band, 'playing the fight well is never a liability');
}

/* ----------------------------------------------------- and every ware --- */
/* A ware nobody buys in a whole run is furniture. But "the pilot never bought
   it" is two different findings wearing one face — it passed the ware over, or
   it never looked — and the counter had two wares in the second category for
   nineteen iterations. The sigil and the scar are now on the pilot's list, so
   this table finally reads as evidence about the SHOP. */
section('how many turns each foe gets');
{
  const rows = Object.entries(TRIGGERS).map(([id, t]) => ({ id, t, f: FF.FOES[id] }))
    .filter((r) => r.f).sort((a, z) => z.t.dmg - a.t.dmg);
  const all = rows.reduce((n, r) => n + r.t.dmg, 0) || 1;
  const top = rows.length ? rows[0].t.dmg : 1;
  console.log('    by share of the damage the fell actually swings:');
  for (const r of rows.slice(0, 8)) {
    console.log(`    ${r.f.name.padEnd(14)}${'█'.repeat(Math.round((r.t.dmg / top) * 22)).padEnd(23)}` +
      `${String(Math.round((r.t.dmg / all) * 100) + '%').padStart(4)}  counter ${r.f.cnt}` +
      `${r.f.kw && r.f.kw.aimless ? ' · aimless — no wall stops it' : ''}`);
  }
}

section('every ware is worth buying');
{
  const WARES = [
    ['meal', 'a hot meal'], ['temper', 'temper'], ['bell', 'a bell'], ['heal', 'mend all'],
    ['card', 'a card'], ['sigil', 'a sigil'], ['burn', 'burn a card'], ['scar', 'tend a hurt'],
    ['charm', 'a charm'],
  ];
  const rows = WARES.map(([k, name]) => ({ k, name, n: SOLD[k] || 0 })).sort((a, z) => z.n - a.n);
  const top = rows[0].n || 1;
  for (const r of rows) {
    console.log(`    ${r.name.padEnd(14)}${'█'.repeat(Math.round((r.n / top) * 26)).padEnd(27)}${r.n}`);
  }
  const dead = rows.filter((r) => !r.n);
  if (dead.length) console.log(`    never bought: ${dead.map((r) => r.name).join(', ')}`);
  /* The bar is deliberately weak: a ware may be situational (tending a hurt is
     worth nothing to a caravan carrying no scars) without being furniture. What
     it may not be is unreachable — bought zero times across hundreds of runs by
     a pilot that is looking for it. */
  /* AND THE ONE ARM THIS ASSERTION CANNOT SURVIVE, which only showed up once
     every arm was re-run on one build. `FF_NOSCARS` strips every scar the
     moment it is handed out — so "tend a hurt", the ware whose whole job is
     removing one, has no customer by construction and the counter reads a dead
     ware. That is the arm being consistent, not the shop being broken, and the
     honest guard names the ware rather than switching the check off. */
  const noScarWare = process.env.FF_NOSCARS ? 'tend a hurt' : null;
  const reallyDead = dead.filter((r) => r.name !== noScarWare);
  ok(!reallyDead.length, `every ware on the counter gets bought ` +
    `(${reallyDead.map((r) => r.name).join(', ') || 'none dead'}` +
    `${noScarWare && dead.length ? '; tend-a-hurt excluded: FF_NOSCARS leaves nothing to tend' : ''})`);
}

section('every card is worth playing');
{
  const all = Object.values(FF.CARDS).filter((c) => !c.leader);
  const never = all.filter((c) => !PLAYED[c.id]);
  const rare = all.filter((c) => (PLAYED[c.id] || 0) > 0)
    .sort((a, b) => (PLAYED[a.id] || 0) - (PLAYED[b.id] || 0)).slice(0, 3);
  const top = Object.entries(PLAYED).sort((a, b) => b[1] - a[1]).slice(0, 3);
  console.log(`    played ${Object.keys(PLAYED).length}/${all.length} cards · ` +
    `most: ${top.map(([k, v]) => k + ' ' + v).join(', ')}`);
  if (rare.length) {
    /* AND WHY they are least, which the count alone cannot say. A card at the
       bottom of this table is there for one of three reasons and only one of
       them is the card's fault: it is rarely offered, it is offered and rarely
       taken, or it is taken and then never finds a moment. The ware table
       learned this lesson last round about the shop; the same question had
       never been asked of the deck. */
    console.log('    least by raw plays: ' + rare.map((c) => c.id).join(', ') +
      ' — but raw plays is a table about the pool, not the cards:');
    /* Raw plays is a table about the POOL, not about the cards: the three at
       the bottom of it turned out to be carried into a deck about sixty times
       against the top three's nine hundred, because the top three are starter
       cards that are in every deck from the first step. Divide it out. What is
       left is a number about the card — how often a caravan that HAS one finds
       a moment for it — and it is the only one of the two worth acting on. */
    const per = (id) => (CARRIED[id] ? PLAYED[id] / CARRIED[id] : 0);
    const seen = all.filter((c) => (CARRIED[c.id] || 0) >= 20)
      .sort((a, b) => per(a.id) - per(b.id));
    const line = (c) => console.log(`      ${c.id.padEnd(14)} ${per(c.id).toFixed(2).padStart(6)} plays per copy carried` +
      ` · ${String(PLAYED[c.id] || 0).padStart(5)} plays across ${String(CARRIED[c.id]).padStart(5)} copies`);
    console.log('    the five that find the fewest moments:');
    for (const c of seen.slice(0, 5)) line(c);
    console.log('    and the five that find the most:');
    for (const c of seen.slice(-5).reverse()) line(c);
  }
  if (never.length) console.log(`    never played: ${never.map((c) => c.id).join(', ')}`);

  /* Two different failures wear the same face here, and only one of them is a
     design problem:

       - never ACQUIRED — the card is rare, or locked, or the pool never offers
         it. That is a matter of weighting, worth printing and watching.
       - acquired and never PLAYED — the caravan carried it around all run and
         never found a moment for it. That one is the card's fault. */
  const held = all.filter((c) => (OFFERED[c.id] || 0) > 0 || FF.STARTERS.hearth.deck.indexOf(c.id) >= 0 ||
    FF.STARTERS.frost.deck.indexOf(c.id) >= 0 || FF.STARTERS.scrap.deck.indexOf(c.id) >= 0);
  const deadWeight = held.filter((c) => !PLAYED[c.id]);
  const unseen = never.filter((c) => held.indexOf(c) < 0);
  if (unseen.length) console.log(`    never even acquired: ${unseen.map((c) => c.id).join(', ')}`);
  eq(deadWeight.map((c) => c.id).join(','), '',
    'no card is carried around a whole run and never found a moment');
}

/* --------------------------------------------------------- determinism --- */
/* THIS CHECK USED TO PASS FOR THE WRONG REASON, and finding out why was the
   most valuable thing a round of parallelism work produced.

   It sits at the very END of the probe, and it was the only place determinism
   was tested. By the time it runs the meta has saturated: every unlock has been
   earned by the hundreds of runs above it, so the card pool has stopped changing
   and two consecutive plays of one seed necessarily agree. Placed anywhere
   earlier it FAILED — seed 4242 played 100 turns and then 25, because unlocks
   accumulate in `G.meta.found` between runs and `cardPool` filters on it.

   Which means the ladder's four arms were each playing a different game: careless
   ran first with 3 things unlocked, careful ran last with 12, and part of every
   rung this file has ever printed was the unlock state rather than the pilot.
   The pilot saturates the meta at import now, so a run is a function of its
   arguments and nothing else.

   The check is therefore made to prove the thing it claims: a seed replayed
   after four hundred OTHER runs still plays the same. */
/* ------------------------------------------ where a run is decided ------- */
/* TWO ROUNDS OF CARD WORK ENDED IN "NOT SUPPORTED", SO STOP ASKING ABOUT CARDS.

   Fifty-six of fifty-seven cards are indistinguishable from the pool median;
   three cards built specifically to break that pattern straddle three ordinary
   wardens. The conclusion drawn twice was "the cards do not matter", which is a
   finding about cards. The question underneath is where a run's outcome is
   decided AT ALL, and that has never been measured.

   Three things can decide it and they can be separated exactly:

     THE DECK    what cards you are holding
     THE TRAIL   what the seed lays out — map, nodes, foes, rewards
     THE DRAW    which order those cards come to hand

   The trick that makes the third one separable is that `give` pushes cards onto
   the deck in list order, so the SAME cards in a DIFFERENT order is the same
   deck with a different shuffle, on the same seed, against the same trail. No
   engine change and no extra RNG: one permutation of a list.

   The arithmetic is a three-way decomposition of the win/lose variance. Each
   cell is one deterministic run, so there is no within-cell noise to confuse
   with an effect — every point of variance belongs to one of the three factors
   or to their interaction. */
section('where a run is actually decided');
{
  const M = Number(process.env.FF_VARIANCE || 12);
  const tribes = ['hearth', 'frost', 'scrap'];
  /* THE DECKS ARE DRAWN BY SEED, NOT CHOSEN, and the first cut of this arm got
     that wrong in exactly the way this file has a rule about.

     Six hand-picked decks is picking the fish before the trip: I chose one weak
     starter, one strong mid-run caravan, one frost pile, one scrap pile — a
     spread I believed in, which is the thing an unbiased estimate cannot be
     built on. If the deck share is 4.8% only because I picked six decks that
     happen to differ by 4.8%, the number is my taste and not the game's.

     So they are dealt: `FF_VDECKS` decks of six, sampled without replacement
     from the draftable pool by a seeded shuffle. The seed is fixed so the arm
     stays reproducible, and `FF_VSEED` changes it so the whole finding can be
     re-run against decks nobody chose. */
  const DECK_N = Number(process.env.FF_VDECKS || 8);
  const DECKS = (() => {
    const pool = Object.values(FF.CARDS)
      .filter((c) => !c.leader && !c.noPool).map((c) => c.id).sort();
    // a small deterministic PRNG, seeded, so the deal is reproducible and cheap
    let x = (Number(process.env.FF_VSEED || 20250814) >>> 0) || 1;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    const out = [];
    for (let d = 0; d < DECK_N; d++) {
      const bag = pool.slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      out.push(bag.slice(0, 6));
    }
    return out;
  })();
  const rot = (a, k) => a.slice(k).concat(a.slice(0, k));
  const PERMS = 3;

  /* LOCKED IS NOT THE GAME, AND THE WHOLE FINDING WAS MEASURED ON IT.

     Every number this arm has produced — trail 32.5%, deck 4.4%, matchup 27% —
     came from a caravan that cannot draft, shop or temper. That is a deliberately
     crippled run, and generalising from it to "the trail is the biggest lever in
     the game" is a claim about a game nobody plays.

     FF_VLIVE deals the same starting decks and then lets the run BE a run. The
     deck is no longer held fixed, so "the deck" stops meaning "what you hold all
     the way" and starts meaning "the hand you were dealt to build from" — which
     is the honest question anyway, because a real player's deck is an outcome as
     much as an input. If its share stays near 4%, the finding generalises. If it
     jumps, the locked arm was measuring the cage. */
  const LIVE = !!process.env.FF_VLIVE;
  const jobs = [];
  for (let d = 0; d < DECKS.length; d++) {
    for (let p = 0; p < PERMS; p++) {
      jobs.push({ tribes, n: M, base: 1000, step: 37, mode: LIVE ? 'careful' : 'tactics', stats: true,
        tweak: LIVE ? { give: rot(DECKS[d], p * 2) }
          : { set: { lockDeck: true, mend: 8 }, give: rot(DECKS[d], p * 2) } });
    }
  }
  if (LIVE) console.log('    (FF_VLIVE: real runs — the dealt deck is a STARTING hand, and it grows)');
  const answers = await runJobs(jobs);
  /* y[d][p][s] — one run, 1 for a crossing and 0 for a death. The seed index
     runs across tribes too, so a "seed" here is one (tribe, seed) trail. */
  const S = tribes.length * M;
  const y = [];
  for (let d = 0; d < DECKS.length; d++) {
    y.push([]);
    for (let p = 0; p < PERMS; p++) {
      const st = answers[d * PERMS + p].stats;
      y[d].push(st.map((x) => (x.won ? 1 : 0)));
    }
  }
  const flat = [];
  for (let d = 0; d < DECKS.length; d++) for (let p = 0; p < PERMS; p++) for (let s = 0; s < S; s++) flat.push(y[d][p][s]);
  const mean = (a) => a.reduce((n, v) => n + v, 0) / Math.max(1, a.length);
  const grand = mean(flat);
  const ssTotal = flat.reduce((n, v) => n + (v - grand) * (v - grand), 0);

  const deckMeans = y.map((dp) => mean([].concat(...dp)));
  const permMeans = [];
  for (let p = 0; p < PERMS; p++) permMeans.push(mean(y.map((dp) => dp[p]).flat()));
  const seedMeans = [];
  for (let s = 0; s < S; s++) {
    const col = [];
    for (let d = 0; d < DECKS.length; d++) for (let p = 0; p < PERMS; p++) col.push(y[d][p][s]);
    seedMeans.push(mean(col));
  }
  const ssOf = (means, cellsEach) =>
    means.reduce((n, m) => n + cellsEach * (m - grand) * (m - grand), 0);
  const ssDeck = ssOf(deckMeans, PERMS * S);
  const ssDraw = ssOf(permMeans, DECKS.length * S);
  const ssSeed = ssOf(seedMeans, DECKS.length * PERMS);
  /* THE RESIDUAL WAS THE BIGGEST NUMBER IN THE TABLE AND IT WAS LEFT AS "the
     rest", which is not an answer. Most of it is separable with the data
     already in hand.

     Averaging over the three draw orders gives a deck-x-trail cell with three
     observations in it, so the TWO-way interaction — this deck against this
     trail, a MATCHUP — comes out on its own, and what is left after that is the
     genuine three-way term that one run per cell cannot reach. */
  const cellDT = [];
  for (let d = 0; d < DECKS.length; d++) {
    cellDT.push([]);
    for (let s2 = 0; s2 < S; s2++) {
      let acc = 0;
      for (let p = 0; p < PERMS; p++) acc += y[d][p][s2];
      cellDT[d].push(acc / PERMS);
    }
  }
  let ssDT = 0;
  for (let d = 0; d < DECKS.length; d++) {
    for (let s2 = 0; s2 < S; s2++) {
      const fit = deckMeans[d] + seedMeans[s2] - grand;      // additive prediction
      const e = cellDT[d][s2] - fit;
      ssDT += PERMS * e * e;
    }
  }
  const ssRest = Math.max(0, ssTotal - ssDeck - ssDraw - ssSeed);
  const ss3way = Math.max(0, ssRest - ssDT);
  const pct = (x) => ((x / Math.max(1e-9, ssTotal)) * 100).toFixed(1) + '%';

  console.log(`    ${DECKS.length} decks x ${PERMS} draw orders x ${S} trails = ${flat.length} runs, ` +
    `${(grand * 100).toFixed(0)}% crossed`);
  console.log(`      the TRAIL  (map, foes, rewards)   ${pct(ssSeed).padStart(6)} of the variance`);
  console.log(`      the DECK   (which cards you hold) ${pct(ssDeck).padStart(6)}`);
  console.log(`      the DRAW   (what order they come) ${pct(ssDraw).padStart(6)}`);
  console.log(`      the MATCHUP (this deck on this trail) ${pct(ssDT).padStart(6)}  ← most of "the rest"`);
  console.log(`      the three-way remainder           ${pct(ss3way).padStart(6)}`);
  console.log(`      best deck ${(Math.max(...deckMeans) * 100).toFixed(0)}% vs worst ${(Math.min(...deckMeans) * 100).toFixed(0)}% · ` +
    `best draw order ${(Math.max(...permMeans) * 100).toFixed(0)}% vs worst ${(Math.min(...permMeans) * 100).toFixed(0)}%`);

  /* WHICH HANDS, AND WHAT THE GOOD ONES HAVE IN COMMON.

     "Best dealt deck 40%, worst 26%" is the largest effect measured in this game
     — larger than the fight rung and larger than the trader — and for a round it
     was reported as a spread with no names attached. The decks are dealt by seed
     so nobody chose them, which is exactly what makes the question answerable:
     sort them by win rate and look at what the top half is made of.

     Four things are worth counting and all four are cheap: how many BODIES (a
     deck of gear cannot hold a board), the average counter (a CURVE — fast
     bodies act sooner), how many cards carry a KEYWORD, and whether the deck
     leans to one tribe. */
  {
    const rows = DECKS.map((ids, d) => {
      const defs = ids.map((id) => FF.CARDS[id]).filter(Boolean);
      const units = defs.filter((c) => c.type === 'unit');
      const kw = defs.filter((c) => c.kw && Object.keys(c.kw).length).length;
      const tribes2 = {};
      for (const c of defs) if (c.tribe) tribes2[c.tribe] = (tribes2[c.tribe] || 0) + 1;
      const lean = Object.entries(tribes2).sort((a2, z2) => z2[1] - a2[1])[0];
      return {
        d, pct: deckMeans[d] * 100,
        bodies: units.length,
        hp: units.reduce((n, c) => n + (c.hp || 0), 0) / Math.max(1, units.length),
        atk: units.reduce((n, c) => n + (c.atk || 0), 0) / Math.max(1, units.length),
        cnt: units.reduce((n, c) => n + (c.cnt || 0), 0) / Math.max(1, units.length),
        kw, lean: lean ? lean[0] + ' ' + lean[1] : 'none',
        ids,
      };
    }).sort((a2, z2) => z2.pct - a2.pct);
    console.log('    WHICH HANDS WON, and what the good ones are made of:');
    for (const r of rows) {
      console.log(`      ${(r.pct.toFixed(0) + '%').padStart(4)}  ${String(r.bodies).padStart(1)} bodies · ` +
        `hp ${r.hp.toFixed(1)} atk ${r.atk.toFixed(1)} cnt ${r.cnt.toFixed(1)} · ` +
        `${r.kw} with a keyword · ${r.lean.padEnd(9)} ${r.ids.join(' ')}`);
    }
    const half = Math.floor(rows.length / 2);
    const top = rows.slice(0, half), bot = rows.slice(-half);
    const avg = (xs, k) => xs.reduce((n, r) => n + r[k], 0) / Math.max(1, xs.length);
    /* THE TEST THE ROOM-RULE EXPLANATION RESTS ON, and it was named a round
       before it was run. If fewer bodies wins BECAUSE fewer bodies keeps slots
       free, the winning decks must stand on emptier boards and be warmed more
       often. If they are not, the explanation is wrong however good it sounds. */
    const roomOf = (d) => {
      const st = [];
      for (let p = 0; p < PERMS; p++) st.push(...answers[d * PERMS + p].stats);
      const seen = st.filter((x) => x.freeAvg !== undefined);
      return {
        free: seen.reduce((n, x) => n + x.freeAvg, 0) / Math.max(1, seen.length),
        warm: seen.reduce((n, x) => n + x.warmShare, 0) / Math.max(1, seen.length),
      };
    };
    const withRoom = rows.map((r) => Object.assign({}, r, roomOf(r.d)));
    const topR = withRoom.slice(0, half), botR = withRoom.slice(-half);
    /* AND THE GEAR QUESTION, which is what is left after two dead explanations.
       Hands are six cards, so "fewer bodies" and "more gear" are the same
       number — the winning half carries 2.5 pieces of gear against 1.7. If that
       is the mechanism rather than a coincidence, the winning decks must
       actually USE it: more gear played, and more turns with something in hand
       worth doing. If they carry more and play the same, it is not the gear. */
    const gearOf = (d) => {
      const st = [];
      for (let p = 0; p < PERMS; p++) st.push(...answers[d * PERMS + p].stats);
      const seen = st.filter((x) => x.gearPlayed !== undefined);
      /* PER TURN, not per run. Gear played per RUN is confounded by run length:
         a deck that wins more lives longer and therefore plays more of
         everything, so the raw count cannot tell a cause from a consequence.
         Dividing by the turns the run actually took removes that, and the two
         are printed side by side so the confound is visible rather than
         quietly corrected. */
      const turns = seen.reduce((n, x) => n + (x.turns || 0), 0);
      return {
        gear: seen.reduce((n, x) => n + x.gearPlayed, 0) / Math.max(1, seen.length),
        units: seen.reduce((n, x) => n + x.unitsPlayed, 0) / Math.max(1, seen.length),
        held: seen.reduce((n, x) => n + x.gearHeldShare, 0) / Math.max(1, seen.length),
        gearRate: seen.reduce((n, x) => n + x.gearPlayed, 0) / Math.max(1, turns),
        unitRate: seen.reduce((n, x) => n + x.unitsPlayed, 0) / Math.max(1, turns),
        turns: turns / Math.max(1, seen.length),
      };
    };
    const withGear = rows.map((r) => Object.assign({}, r, gearOf(r.d)));
    const topG = withGear.slice(0, half), botG = withGear.slice(-half);
    console.log(`      DO THE WINNERS DO MORE WITH A TURN?`);
    console.log(`        per RUN (confounded — winners live longer):  gear ` +
      `${avg(topG, 'gear').toFixed(1)} vs ${avg(botG, 'gear').toFixed(1)} · ` +
      `wardens ${avg(topG, 'units').toFixed(1)} vs ${avg(botG, 'units').toFixed(1)} · ` +
      `turns ${avg(topG, 'turns').toFixed(0)} vs ${avg(botG, 'turns').toFixed(0)}`);
    console.log(`        per TURN (the one that answers it):  gear ` +
      `${avg(topG, 'gearRate').toFixed(3)} vs ${avg(botG, 'gearRate').toFixed(3)} · ` +
      `wardens ${avg(topG, 'unitRate').toFixed(3)} vs ${avg(botG, 'unitRate').toFixed(3)} · ` +
      `gear in hand on ${(avg(topG, 'held') * 100).toFixed(0)}% of turns vs ${(avg(botG, 'held') * 100).toFixed(0)}%`);
    console.log(`      DO THE WINNERS STAND ON EMPTIER BOARDS?  ` +
      `free slots a turn ${avg(topR, 'free').toFixed(2)} vs ${avg(botR, 'free').toFixed(2)} · ` +
      `warmed on ${(avg(topR, 'warm') * 100).toFixed(0)}% of turns vs ${(avg(botR, 'warm') * 100).toFixed(0)}%`);
    /* THE BAND THIS WHOLE TABLE HAS NEVER HAD, and the retroactive pass is why
       it is here.

       Every row above compares the top half of eight decks against the bottom
       half, where the halves were made BY SORTING ON WIN RATE. Two things
       follow and only one of them was ever said out loud:

       * The win-rate gap between the halves — the "14 points" three rounds of
         work have chased — is **selected on itself**. Sort eight noisy rates
         and split them down the middle and the halves differ by construction,
         with no decks needing to differ at all. It is not a finding and it
         never was; it is the definition of the split.
       * The composition gaps (gear, bodies, hp, free slots) are NOT selected
         on, so they are informative — but nobody had ever put a band on one,
         and a difference of two four-deck means has a wide one.

       So the null is built by permutation rather than derived: there are
       exactly C(8,4) = 70 ways to split eight decks into halves, they are
       enumerated, and each gap is measured on the same numbers. Where the
       observed split falls in that distribution IS the p-value, with no
       normality assumed and no RNG involved — the same 70 splits every run. */
    {
      const idx = rows.map((_, i) => i);
      const combos = [];
      const walk = (start, pickd) => {
        if (pickd.length === half) { combos.push(pickd.slice()); return; }
        for (let i = start; i < idx.length; i++) { pickd.push(i); walk(i + 1, pickd); pickd.pop(); }
      };
      walk(0, []);
      const gapUnder = (src, key, chosen) => {
        const inHalf = new Set(chosen);
        let a = 0, b = 0, na = 0, nb = 0;
        src.forEach((r, i) => { if (inHalf.has(i)) { a += r[key]; na++; } else { b += r[key]; nb++; } });
        return a / Math.max(1, na) - b / Math.max(1, nb);
      };
      const observed = idx.slice(0, half);
      const test = (label, src, key, dp) => {
        const obs = gapUnder(src, key, observed);
        const all2 = combos.map((cm) => Math.abs(gapUnder(src, key, cm)));
        const beaten = all2.filter((v) => v >= Math.abs(obs) - 1e-9).length;
        const p = beaten / all2.length;
        return `${label} ${obs >= 0 ? '+' : ''}${obs.toFixed(dp)} (p=${p.toFixed(2)}${p <= 0.05 ? ' REAL' : ''})`;
      };
      console.log(`      and the same gaps against all ${combos.length} ways to split these decks in half:`);
      console.log(`        ${[test('gear played a run', withGear, 'gear', 1), test('bodies carried', rows, 'bodies', 1),
        test('gear per turn', withGear, 'gearRate', 3), test('free slots', withRoom, 'free', 2)].join(' · ')}`);
      console.log(`        (the WIN-RATE gap is not in this list on purpose: the halves were made by ` +
        `sorting on it, so it is selected on itself and is not a finding)`);
    }
    console.log(`      top half vs bottom half:  bodies ${avg(top, 'bodies').toFixed(1)} vs ${avg(bot, 'bodies').toFixed(1)} · ` +
      `hp ${avg(top, 'hp').toFixed(1)} vs ${avg(bot, 'hp').toFixed(1)} · ` +
      `atk ${avg(top, 'atk').toFixed(1)} vs ${avg(bot, 'atk').toFixed(1)} · ` +
      `counter ${avg(top, 'cnt').toFixed(1)} vs ${avg(bot, 'cnt').toFixed(1)} · ` +
      `keywords ${avg(top, 'kw').toFixed(1)} vs ${avg(bot, 'kw').toFixed(1)}`);
  }

  /* WHAT A MATCHUP ACTUALLY IS — the biggest term in the table, and for one round
     it got a single sentence while `killedBy` and `diedZone` sat unread on every
     run in this arm. They are the whole answer to "27% of what?". */
  {
    const all = [];
    for (let d = 0; d < DECKS.length; d++) {
      for (let p = 0; p < PERMS; p++) {
        answers[d * PERMS + p].stats.forEach((x, s2) => all.push({ d, s2, st: x }));
      }
    }
    const byKiller = {};
    const byZone = [0, 0, 0];
    for (const r of all) {
      if (r.st.won) continue;
      const k = r.st.killedBy || 'the cold';
      byKiller[k] = (byKiller[k] || 0) + 1;
      byZone[Math.min(2, r.st.diedZone === undefined ? 0 : r.st.diedZone)]++;
    }
    const dead = all.filter((r) => !r.st.won).length;
    const top = Object.entries(byKiller).sort((a2, z2) => z2[1] - a2[1]).slice(0, 6);
    console.log(`    WHAT A MATCHUP IS. ${dead} of ${all.length} runs ended in a death; where and to what:`);
    console.log(`      zone 1 ${((byZone[0] / dead) * 100).toFixed(0)}% · ` +
      `zone 2 ${((byZone[1] / dead) * 100).toFixed(0)}% · zone 3 ${((byZone[2] / dead) * 100).toFixed(0)}%`);
    console.log('      ' + top.map(([k, n]) => `${k} ${((n / dead) * 100).toFixed(0)}%`).join(' · '));
    /* AND THE ONE THAT DECIDES A ZONE: the two beasts a zone can draw, side by
       side. If one of them kills twice as often as the other, the coin flip at
       the end of a zone is a difficulty roll and the run is deciding itself. */
    const bosses = new Set();
    for (const z of FF.ZONES) for (const b of (z.bosses || [])) bosses.add(FF.FOES[b] ? FF.FOES[b].name : b);
    const bossKills = top.concat(Object.entries(byKiller)).filter(([k]) => bosses.has(k));
    const seen = {};
    for (const [k, n] of bossKills) seen[k] = n;
    const rows = Object.entries(seen).sort((a2, z2) => z2[1] - a2[1]);
    if (rows.length) {
      console.log('      of those, the beasts: ' +
        rows.map(([k, n]) => `${k} ${((n / dead) * 100).toFixed(1)}%`).join(' · '));
    }
    /* Which decks lose to which beast — the matchup in the literal sense. Printed
       only as a spread, because a 6x6 table nobody reads is not a finding. */
    const perDeck = [];
    for (let d = 0; d < DECKS.length; d++) {
      const mine = all.filter((r) => r.d === d && !r.st.won);
      const kk = {};
      for (const r of mine) kk[r.st.killedBy || 'the cold'] = (kk[r.st.killedBy || 'the cold'] || 0) + 1;
      const worst = Object.entries(kk).sort((a2, z2) => z2[1] - a2[1])[0];
      if (worst) perDeck.push(`deck ${d}: ${worst[0]} ${((worst[1] / Math.max(1, mine.length)) * 100).toFixed(0)}%`);
    }
    console.log('      what each deck died to most: ' + perDeck.join(' · '));
  }
  /* AND THE SAME DECOMPOSITION ON A RESPONSE THAT IS NOT ALMOST ALL ZEROES.

     A locked six-card deck crosses about 3% of the time, so "did it win" is a
     variable that is 0 in 97 cells out of 100 — nearly all of its variance is
     the rarity of a 1 rather than anything about decks or trails, which is a
     large part of why the residual is 85%. HOW FAR IT GOT is the same run
     measured on four levels instead of two, and it costs nothing extra. */
  {
    const z = [];
    for (let d = 0; d < DECKS.length; d++) {
      z.push([]);
      for (let p = 0; p < PERMS; p++) {
        const st = answers[d * PERMS + p].stats;
        z[d].push(st.map((x) => (x.won ? 3 : Math.min(2, x.diedZone === undefined ? 0 : x.diedZone))));
      }
    }
    const zf = [];
    for (let d = 0; d < DECKS.length; d++) for (let p = 0; p < PERMS; p++) for (let s2 = 0; s2 < S; s2++) zf.push(z[d][p][s2]);
    const g2 = mean(zf);
    const t2 = zf.reduce((n, v) => n + (v - g2) * (v - g2), 0);
    const dm = z.map((dp) => mean([].concat(...dp)));
    const pm = []; for (let p = 0; p < PERMS; p++) pm.push(mean(z.map((dp) => dp[p]).flat()));
    const sm = [];
    for (let s2 = 0; s2 < S; s2++) {
      const col = [];
      for (let d = 0; d < DECKS.length; d++) for (let p = 0; p < PERMS; p++) col.push(z[d][p][s2]);
      sm.push(mean(col));
    }
    const ss = (ms, each, gg) => ms.reduce((n, m) => n + each * (m - gg) * (m - gg), 0);
    const p2 = (x) => ((x / Math.max(1e-9, t2)) * 100).toFixed(1) + '%';
    console.log(`    and on HOW FAR IT GOT (zone 0-3) rather than won/lost, ${g2.toFixed(2)} zones on average:`);
    console.log(`      the TRAIL ${p2(ss(sm, DECKS.length * PERMS, g2)).padStart(6)} · ` +
      `the DECK ${p2(ss(dm, PERMS * S, g2)).padStart(6)} · ` +
      `the DRAW ${p2(ss(pm, DECKS.length * S, g2)).padStart(6)}`);
    ARMS.stamp('FF_VARIANCE=36', `won/lost: trail ${pct(ssSeed)}, deck ${pct(ssDeck)}, draw ${pct(ssDraw)}, ` +
      `matchup ${pct(ssDT)} · zones: trail ${p2(ss(sm, DECKS.length * PERMS, g2))}, deck ${p2(ss(dm, PERMS * S, g2))}`,
      flat.length);
  }
  ok(ssTotal > 0, 'the runs did not all end the same way');
  ok(true, 'where a run is decided is a report, not a gate');
}

section('a seed is a promise');
{
  const a = playRun('hearth', 4242, true);
  const b = playRun('hearth', 4242, true);
  eq(a.battles, b.battles, 'the same seed plays the same number of fights');
  eq(a.won, b.won, 'and ends the same way');
  eq(a.turns, b.turns, 'turn for turn');
  /* and the version that would have caught it: the same seed against a copy of
     itself played from a DIFFERENT point in the probe's history. */
  const far = playRun('hearth', 4242, true);
  eq(far.turns, a.turns, 'and after every other run in this file, still turn for turn');
  eq(far.battles, a.battles, 'fight for fight');

  /* THE POOL IS PROVED, NOT TRUSTED. Twelve jobs of the ladder run across
     threads, and everything the probe reads afterwards — thirteen module-level
     counters — has to come home exactly. Absorbing them wrongly is silent: the
     first cut summed `DUCKS.bar` (a 0.22 threshold) into 0.66 and concatenated
     `ROOM.free` (a histogram) into a twelve-slot board on a six-slot game, and
     no assertion in the file noticed either. This one does. */
  {
    const one = { tribes: ['hearth'], n: 2, base: 90000, step: 37, mode: 'tactics' };
    const inl = await runJobs([one]);                     // 1 job → inline path
    const two = await runJobs([one, one]);                // 2 jobs → worker path
    eq(two[0].wins, inl[0].wins, 'a job answers the same whether a worker or this thread played it');
    eq(two[1].wins, inl[0].wins, 'and both workers agree with it');
    const after = snapshot();
    ok(Object.keys(after.PLAYED).length > 0, 'and the workers\' counters came home');
  }
}

done('frostfell-run');
