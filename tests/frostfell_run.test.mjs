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
  CARRIED, CROOM, DEFAULT_N, DRAFT, DRAFT_HABITS, DUCKS, FF, FROSTERS, G, HABITS, LANE, MEND, NO_SCARS, OFFERED, PLAYED, ROOM, SKILL, SOLD, TAUGHT, TELL, TITAN, TRIGGERS, bestSlot, botTurn, cardWorth, carefulItem, carefulSlot, carefulTurn, courseWanted, denySchemes, doomed, draftPick, draftTurn, erf, itemTarget, pickBiggest, playRun, sale, settleChoosers, soakerFirst, stripScars, threatOf, watchTitan, wounds,
  applyTweak,
} from './frostfell_pilot.mjs';

/* A tiny on-disk record of what each turned-up arm last said, so the summary
   the default check prints is a measurement rather than a comment. */
const ARMS_FILE = new URL('./.frostfell-arms.json', import.meta.url);
const ARMS = {
  all: (() => { try { return JSON.parse(readFileSync(ARMS_FILE, 'utf8')); } catch { return {}; } })(),
  read(knob) { return this.all[knob] || null; },
  /* Read-modify-write, because two arms turned up at once will otherwise
     clobber each other: both load the file at import and the second to finish
     wins. Found by running FF_LESSON and FF_MONEY in parallel and getting one
     reading out of two. */
  stamp(knob, said, sample) {
    let disk = {};
    try { disk = JSON.parse(readFileSync(ARMS_FILE, 'utf8')); } catch { disk = {}; }
    Object.assign(this.all, disk);
    this.all[knob] = { said, sample };
    this.save();
  },
  save() { try { writeFileSync(ARMS_FILE, JSON.stringify(this.all, null, 1) + '\n'); } catch { /* read-only tree */ } },
};
const STANDING = [
  ['FF_ABLATE=60', 'which fight habits are worth anything, added and removed'],
  ['FF_LESSON=1', 'what a lesson is worth, and at what dose'],
  ['FF_MONEY=70', 'what a purse buys, one ware removed and one ware given'],
  ['FF_COURSE=150', 'the five courses against declaring nothing'],
  ['FF_PAIRS=70', 'fight habits two at a time — does any pair beat its halves'],
  ['FF_PAIR=holdGear+keepSlot', 'and the one pair worth settling, four times as deep'],
  ['FF_NOWAVE=1', 'the ladder with the wave telegraph off, same build, same seeds'],
  ['FF_NOSCARS=1', 'the ladder with the scar rule switched off'],
  ['FF_CARDS=40', 'every card priced by taking it out of the offer'],
  ['FF_GIVE=a,b,c', 'a NAMED handful of cards priced deep, so the family bar is 3 tests and not 60'],
  ['FF_CALIBRATE=70', 'what a band actually is on this instrument — measured, not derived'],
  ['FF_LADDERBAND=1', 'the ladder total run at five seed bases — can this instrument read its own headline'],
  ['FF_VARIANCE=36', 'deck vs trail vs draw order — where a run is actually decided'],
];
/* FF_HABIT, FF_CONTRAST, FF_VDECKS, FF_VSEED and FF_TIME are deliberately NOT
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
  const MODES = ['careless', 'tactics', 'trader', 'careful'];
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
  const [careless, tactics, trader, careful] = await sweepMany(MODES);

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
    ['+ the trader', trader], ['+ steering the pool', careful]];
  console.log('');
  console.log(`    ${''.padEnd(20)}${'zone 1 ░   zone 2 ▒   zone 3 ▓   crossed █'.padEnd(48)}  won`);
  for (const [name, o] of rows) {
    console.log(`    ${name.padEnd(20)}${shape(o)}  ${String(pct(o) + '%').padStart(4)}`);
  }
  console.log('');
  const rung = (a, z) => {
    const d = pct(z) - pct(a);
    return `${d >= 0 ? '+' : ''}${d}`.padStart(4);
  };
  console.log(`    what each thing is worth:  the fight ${rung(careless, tactics)}   ` +
    `the trader ${rung(tactics, trader)}   steering the pool ${rung(trader, careful)}   ` +
    `= ${pct(careful) - pct(careless)} points, all told`);
  for (const [name, o] of rows) {
    console.log(`    ${name.padEnd(20)}${(o.turns / Math.max(1, o.battles)).toFixed(1)} turns a fight · ` +
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
  ok(true, `money is worth ${normal.pct - broke.pct} points, band ±${band} — reported, not gated`);
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
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
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
  console.log(`    ${''.padEnd(22)}${''.padEnd(30)}      ` +
    `took the quiet road at ${DUCKS.taken} of ${DUCKS.forks} forks that offered it ` +
    `(${Math.round((DUCKS.taken / Math.max(1, DUCKS.forks)) * 100)}%), ` +
    `the line ${Math.round((DUCKS.wound / Math.max(1, DUCKS.forks)) * 100)}% wounded at those forks`);
  console.log(`    → walking past a fight is worth ${dodge.pct - seek.pct} points; ` +
    `ducking to a camp only when hurt is worth ${sore.pct - seek.pct} (±${band} is one standard deviation)`);
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
      tribes.map((tribe) => ({ tribes: [tribe], n: N, base: 1000, step: 37, mode: 'tactics',
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
  const addedPcts = await sweep3Many(HABITS.map(([key]) =>
    Object.assign({}, OFF_ALL, { [key]: true })));
  const added = HABITS.map(([, label], k) => [label, addedPcts[k]]);
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
  const top = added[0];
  console.log(`    and one at a time, starting from nothing (${none}% knowing none): ` +
    `${top[0].replace(' (removed)', '')} alone is worth ${top[1] - none} of the ${all - none}` +
    sig(top[1] - none));
  /* The gate moved 3.2 → 3.5 when the band became measured: the same arm at the
     same sample now reports ±3.3 rather than ±3.0, because a difference of two
     arms is a wider quantity than one arm. Suppressing FF_ABLATE=60's table for
     that would be the measurement hiding its own correction. */
  if (Number(band) > 3.5) {
    console.log(`      (no table: ±${band} a row at this sample. FF_ABLATE=60 or more for one that means something)`);
    added.length = 0;
  } else {
    ARMS.stamp('FF_ABLATE=60', `${top[0].replace(' (removed)', '')} +${top[1] - none} of the ${all - none}; ` +
      `next best ${added[1] ? added[1][0].replace(' (removed)', '') + ' +' + (added[1][1] - none) : 'none'}`,
      tribes.length * N);
  }
  for (const [label, pct] of added) {
    const d = pct - none;
    console.log(`      only ${label.replace(' (removed)', '').padEnd(34)}` +
      '█'.repeat(Math.round(pct / 2)).padEnd(14) + ` ${String(pct + '%').padStart(4)}  ` +
      (d > 0 ? '+' + d : String(d)) + ' of the ' + (all - none) + sig(d));
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
    const KEYS = ONE.length === 2 ? ONE : HABITS.map(([k]) => k);
    if (ONE.length === 2) console.log(`    (one pair only: ${ONE.join(' + ')})`);
    const nameOf = (k) => HABITS.find((h) => h[0] === k)[1].replace(' (removed)', '');
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
       of k+1 arms, its band scales as 1/√n like everything else, and the sample
       that would put twice its band under the observed gap is arithmetic. */
    {
      const D = together - apart;
      const sb = BAND.set(0.2, tribes.length * PN, KEYS.length);
      const need = Math.ceil(tribes.length * PN * Math.pow((2 * sb) / Math.max(0.1, Math.abs(D)), 2));
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

  const subKeys = HABITS.filter(([key]) => !ONLY || key === ONLY);
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
  console.log('  · arms that do not run by default');
  for (const [knob, what, rec] of rows) {
    console.log(`    ${knob.padEnd(26)} ${what}`);
    console.log(`    ${''.padEnd(26)} → ` + (rec
      ? `${rec.said}   (at ${rec.sample} an arm)`
      : 'no reading recorded — run it'));
  }
  /* Every knob in the file that GATES A SECTION is an arm and has to be listed
     here, or the summary quietly stops mentioning something that exists. Read
     off the source rather than trusted to a number: a list that has to be
     bumped by hand is a list that goes stale. */
  const inSource = [...readFileSync(new URL(import.meta.url), 'utf8')
    .matchAll(/process\.env\.(FF_[A-Z]+)/g)].map((m2) => m2[1]);
  const MODIFIERS = ['FF_RUNS', 'FF_HABIT', 'FF_CONTRAST', 'FF_VDECKS', 'FF_VSEED', 'FF_TIME', 'FF_JOBS', 'FF_GAME'];
  const listed = STANDING.map(([k]) => k.split('=')[0]);
  const missing = [...new Set(inSource)].filter((k) => MODIFIERS.indexOf(k) < 0 && listed.indexOf(k) < 0);
  eq(missing.join(','), '', 'every knob that gates a section is listed as an arm');
  ok(STANDING.length >= 10, 'and all ten of them are');
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
  ok(!dead.length, `every ware on the counter gets bought (${dead.map((r) => r.name).join(', ') || 'none dead'})`);
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

  const jobs = [];
  for (let d = 0; d < DECKS.length; d++) {
    for (let p = 0; p < PERMS; p++) {
      jobs.push({ tribes, n: M, base: 1000, step: 37, mode: 'tactics', stats: true,
        tweak: { set: { lockDeck: true, mend: 8 }, give: rot(DECKS[d], p * 2) } });
    }
  }
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
