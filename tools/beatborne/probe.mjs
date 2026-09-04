#!/usr/bin/env node
// BEATBORNE probe -- runs the pilot over every stage of every act and prints a
// table. It asserts nothing. It exists so a balance claim in DESIGN.md can
// name a number somebody else can reproduce:
//
//   node tools/beatborne/probe.mjs            the whole ladder, 24 seeds
//   node tools/beatborne/probe.mjs 60         the whole ladder, 60 seeds
//   node tools/beatborne/probe.mjs 40 good    the pilot times every card GOOD
//
// The pilot is deliberately bad: cheapest playable card into the front-most
// empty slot, every beat. Anything it clears comfortably is too easy.
import { load } from '../../tests/beatborne_lib.mjs';

const N = parseInt(process.argv[2] || '24', 10);
const GRADE = process.argv[3] || 'perfect';
const MODE = process.argv[4] || 'start';   // start | loaded
const PLAY = process.argv[5] || 'value';  // value | cheap
const BB = load();

// `loaded` asks the other question the starting deck cannot: what does the
// ladder look like to somebody who actually drafted on the way up? Ten
// starting cards plus eight picks and three charms, which is roughly what a
// run that reached act three would be carrying.
const LOADED_DECK = BB.startingDeck().concat(
  ['clap', 'subwoof', 'riff', 'growl', 'looper', 'metronome', 'harmony', 'anthem']);
const LOADED_CHARMS = ['preamp', 'metrognome', 'roadcase'];

const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const f1 = v => (Math.round(v * 10) / 10).toString();

function run(act, stage) {
  const R = { win: 0, n: 0, beats: [], hp: [], drops: [], killed: [] };
  for (let s = 1; s <= N; s++) {
    const opts = { seed: s, act, stage, grade: GRADE, maxBeats: 900, play: PLAY };
    if (MODE === 'loaded') { opts.deck = LOADED_DECK; opts.charms = LOADED_CHARMS; }
    const r = BB.sim(opts);
    R.n++;
    if (r.over === 'win') R.win++;
    R.beats.push(r.beats); R.hp.push(r.hp); R.drops.push(r.drops); R.killed.push(r.killed);
  }
  return R;
}

console.log('\nBEATBORNE probe  ·  ' + N + ' seeds/stage  ·  timing: ' + GRADE + '  ·  deck: ' + MODE + '\n');
console.log('  stage            win%   beats   sec   set left   drops   killed');
console.log('  ' + '-'.repeat(64));
for (let a = 0; a < BB.ACTS.length; a++) {
  const act = BB.ACTS[a];
  for (let st = 0; st <= BB.STAGES_PER_ACT; st++) {
    const R = run(a, st);
    const name = 'act ' + (a + 1) + (st === BB.STAGES_PER_ACT ? ' BOSS' : ' stage ' + (st + 1));
    const secs = avg(R.beats) * 60 / act.bpm;
    console.log('  ' + name.padEnd(16) +
      (R.win / R.n * 100).toFixed(0).padStart(4) + '%' +
      f1(avg(R.beats)).padStart(8) +
      f1(secs).padStart(7) +
      f1(avg(R.hp)).padStart(10) +
      f1(avg(R.drops)).padStart(8) +
      f1(avg(R.killed)).padStart(9));
  }
  console.log('  ' + '-'.repeat(64));
}

/* ---- the full run ------------------------------------------------------
   The per-stage table above measures each fight from full health, which is
   not how anybody plays one. This plays all fifteen with the damage kept and
   a card drafted after each, which is the only number that answers "is the
   run winnable". */
if (process.env.BB_RUNS !== '0') {
  console.log('\n  full runs (damage carries, drafts as it goes)');
  console.log('  ' + '-'.repeat(64));
  for (const grade of ['perfect', 'good', 'late']) {
    let won = 0, n = 0;
    const reach = [], hp = [], deck = [], drops = [];
    for (let s = 1; s <= N; s++) {
      const r = BB.simRun({ seed: s, grade, play: PLAY });
      n++; if (r.won) won++;
      reach.push(r.cleared); hp.push(r.hp); deck.push(r.deck); drops.push(r.drops);
    }
    console.log('  ' + ('timing ' + grade).padEnd(16) +
      (won / n * 100).toFixed(0).padStart(4) + '% won' +
      ('  cleared ' + f1(avg(reach)) + '/15').padStart(18) +
      ('  deck ' + f1(avg(deck))).padStart(12) +
      ('  drops ' + f1(avg(drops))).padStart(13));
  }
  console.log('');
}

/* ---- the idle test ------------------------------------------------------
   How long does somebody who has not worked out what to do yet last? A new
   player spends the first bar reading the screen, and the per-stage table
   above cannot see that at all, because the pilot fills the board on beat
   zero. This is the number that says whether the first fight is survivable
   while you are still learning it. */
if (process.env.BB_RUNS !== '0') {
  console.log('  doing nothing at all');
  console.log('  ' + '-'.repeat(64));
  for (let a = 0; a < BB.ACTS.length; a++) {
    const beats = [];
    for (let s = 1; s <= N; s++) {
      const r = BB.sim({ seed: s, act: a, stage: 0, grade: 'perfect', maxBeats: 200, idle: true });
      beats.push(r.beats);
    }
    const b = avg(beats);
    console.log('  act ' + (a + 1) + ' stage 1'.padEnd(9) + '   survives ' + f1(b) + ' beats  (' +
      f1(b * 60 / BB.ACTS[a].bpm) + 's before the set is gone)');
  }
  console.log('');
}

/* ---- the score ----------------------------------------------------------
   `node tools/beatborne/probe.mjs 1 perfect start value score` prints what the
   board actually plays, beat by beat. It is the only check on the game's whole
   premise -- that placing units composes a rhythm -- that does not need ears.
   A board of counter-1 units should read as a run of sixteenths; a counter-4
   pad should appear once a bar and not more. */
if (process.argv.includes('score')) {
  const GLYPH = { kick: 'K', snare: 'S', hat: 'h', bass: 'B', lead: 'L', pad: 'p',
                  vox_rox: 'R', vox_jas: 'J', bell: 'b', grit: 'g', sub: 'u' };
  BB.newRun(5);
  const R = BB.G.run;
  R.deck = ['thump', 'tick', 'clap', 'rox', 'hum', 'jas', 'thump', 'tick'];
  const S = BB.startFight();
  S.armed = true;
  BB.startTransport(S.bpm); BB.A.t0 = 0;
  const spb = 60 / S.bpm;
  const rows = [];
  let line = [];
  let beatT = 0;
  // bucket each hit into one of four sixteenths so the score reads as a rhythm
  BB.A.tap = (voice, note, vel, when) => {
    const off = when == null ? 0 : (when - beatT) / spb;
    const slot = Math.max(0, Math.min(3, Math.round(off * 4)));
    line.push({ g: GLYPH[voice] || '?', slot });
  };
  for (let b = 0; b < 24 && !S.over; b++) {
    line = [];
    // fill the board over the first two beats, then just let it play
    if (b < 3) {
      for (let g = 0; g < 3; g++) {
        const idx = S.hand.map((c, i) => i).filter(i => BB.canPlay(S, i))[0];
        const slots = BB.emptySlots(S, 'us');
        if (idx == null || !slots.length) break;
        slots.sort((x, y) => x.col - y.col || x.row - y.row);
        BB.setClock(b * spb);
        if (!BB.playCard(S, idx, slots[0].col, slots[0].row)) break;
      }
    }
    beatT = b * spb;
    BB.setClock((b + 1) * spb); BB.A.beat = b;
    BB.beatStep(S, beatT);
    rows.push({ b, hits: line.slice() });
  }
  BB.A.tap = null;
  console.log('  the score  ·  K kick  S snare  h hat  B bass  L lead  p pad  R rox  J jas   (g/u/b = theirs)');
  console.log('  ' + '-'.repeat(64));
  let bar = [];
  for (const r of rows) {
    const cell = [[], [], [], []];
    for (const h of r.hits) cell[h.slot].push(h.g);
    bar.push(cell.map(c => (c.join('') || '.').padEnd(3)).join(' '));
    if (bar.length === 4) { console.log('  |' + bar.join(' |') + ' |'); bar = []; }
  }
  if (bar.length) console.log('  |' + bar.join(' |') + ' |');
  console.log('');
}
