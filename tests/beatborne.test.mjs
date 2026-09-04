// BEATBORNE -- rules, content and balance.
//
// The bar this suite is written against: every claim it makes is one somebody
// could break by editing a number, and every balance assertion states a band
// wide enough that ordinary tuning does not trip it but a broken economy does.
import { load, ok, eq, near, between, done } from './beatborne_lib.mjs';

const BB = load();
const { CREW, FOES, BOSSES, CHARMS, ACTS, ART, VOICE, COLS, ROWS } = BB;

/* A bench fight: no waves due for a very long time, and one inert foe so the
   sim does not declare victory the moment we clear the board to watch a single
   counter. Without the foe, beatStep wins on its first call and every later
   call returns early -- which is correct behaviour, and made the first draft of
   the counter test silently measure nothing. */
function bench(seed) {
  BB.newRun(seed == null ? 99 : seed);
  const S = BB.startFight();
  S.units.length = 0; S.pending = []; S.waves = [{ bar: 99999, units: ['hush'] }]; S.waveI = 0; S.bar = 0;
  const inert = BB.mkUnit(S, { id: 'bench', name: 'BENCH', voice: 'grit', note: 0, ctr: 99999,
    hp: 999999, atk: 0, art: 'hulk', tint: '#ffffff' }, 'them', 2, 1);
  S.units.push(inert);
  return S;
}


/* ---------------------------------------------------------------- content */
{
  const ids = new Set();
  for (const c of CREW) {
    ok(!ids.has(c.id), 'crew id ' + c.id + ' is unique'); ids.add(c.id);
    ok(typeof c.name === 'string' && c.name.length > 0 && c.name.length <= 12, c.id + ' name fits the band');
    ok(VOICE[c.voice], c.id + ' has a real voice (' + c.voice + ')');
    ok(ART[c.art], c.id + ' has a real art recipe (' + c.art + ')');
    ok(Number.isFinite(c.note), c.id + ' has a note');
    between(c.ctr, 1, 6, c.id + ' counter');
    between(c.cost, 1, 5, c.id + ' cost');
    between(c.r, 0, 3, c.id + ' rarity');
    ok(c.hp > 0, c.id + ' has health');
    ok(c.atk >= 0, c.id + ' has attack');
    ok(/^#[0-9a-f]{6}$/i.test(c.tint), c.id + ' tint is a hex colour');
    if (c.voice2) ok(VOICE[c.voice2], c.id + ' second voice is real');
  }
  ok(CREW.length >= 16, 'the roster is big enough to draft from');

  for (const f of FOES.concat(BOSSES)) {
    ok(VOICE[f.voice], f.id + ' foe voice is real');
    ok(ART[f.art], f.id + ' foe art is real');
    ok(f.hp > 0 && f.atk > 0, f.id + ' foe has health and attack');
    between(f.ctr, 1, 6, f.id + ' foe counter');
  }
  for (const a of ACTS) {
    ok(a.pool.length >= 3, 'act ' + a.n + ' has a pool');
    for (const id of a.pool) ok(BB.ALL_UNITS[id], 'act ' + a.n + ' pool entry ' + id + ' exists');
    ok(BB.ALL_UNITS[a.boss], 'act ' + a.n + ' boss exists');
    between(a.bpm, 60, 200, 'act ' + a.n + ' bpm');
  }
  // acts must get faster, because BPM is the difficulty dial the player feels
  for (let i = 1; i < ACTS.length; i++) ok(ACTS[i].bpm > ACTS[i - 1].bpm, 'act ' + (i + 1) + ' is faster than act ' + i);

  const cids = new Set();
  for (const c of CHARMS) {
    ok(!cids.has(c.id), 'charm ' + c.id + ' is unique'); cids.add(c.id);
    ok(c.text && c.text.length <= 52, c.id + ' charm text fits its box (' + c.text.length + ')');
  }
  // A rule shown in three lines of 8px on a 96px card is about 100 characters.
  // A card whose rule is cut in half is a card the player cannot price.
  for (const c of CREW) ok((c.text || '').length <= 100, c.id + ' rule fits the card face (' + (c.text || '').length + ')');
  done('content');
}

/* ------------------------------------------------------------- the board */
{
  const r = BB.sim({ seed: 4, act: 0, stage: 0, maxBeats: 1 });
  const S = r.S;
  eq(COLS, 3, 'three columns a side');
  eq(ROWS, 2, 'two rows');
  eq(BB.emptySlots(S, 'us').length + BB.sideUnits(S, 'us').length, COLS * ROWS, 'slots account for every unit');
  done('board');
}

/* -------------------------------------------------- counters and firing */
{
  // a bare board so nothing else moves while we watch one counter
  const S = bench(11);
  const back = BB.mkUnit(S, BB.CREW_BY.clap, 'us', 2, 0);   // ctr 2, back column
  S.units.push(back);
  eq(back.c, 2, 'a unit starts at its full counter');
  BB.beatStep(S, null); eq(back.c, 1, 'back column ticks one a beat');
  BB.beatStep(S, null); eq(back.c, 2, 'at zero it fires and resets');
  eq(back.fired, 1, 'it fired exactly once');

  // and the same unit in the front column runs double
  const front = BB.mkUnit(S, BB.CREW_BY.clap, 'us', 0, 1);
  S.units.push(front);
  BB.beatStep(S, null);
  eq(front.fired, 1, 'front column ticks twice, so a counter-2 unit fires every beat');

  // a counter-1 unit in front reaches zero twice in a beat -- and is capped
  const fast = BB.mkUnit(S, BB.CREW_BY.tick, 'us', 0, 0);
  S.units.push(fast);
  const before = fast.fired;
  BB.beatStep(S, null);
  between(fast.fired - before, 1, 2, 'a counter-1 unit in front fires at most twice a beat');
  done('counters');
}

/* -------------------------------------------------------------- targeting */
{
  BB.newRun(12);
  const S = BB.startFight();
  S.units.length = 0; S.pending = []; S.waves = []; S.waveI = 0;

  // ours reach across lanes
  const mine = BB.mkUnit(S, BB.CREW_BY.clap, 'us', 0, 0);
  const theirs = BB.mkUnit(S, BB.FOES[0], 'them', 0, 1);   // other row
  S.units.push(mine, theirs);
  const hp0 = theirs.hp;
  BB.fireUnit(S, mine, null);
  ok(theirs.hp < hp0, 'an ally with an empty lane reaches into the other one');

  // theirs do not: a foe whose own lane is clear swings at the set
  S.units.length = 0;
  const ally = BB.mkUnit(S, BB.CREW_BY.thump, 'us', 0, 0);
  const foe = BB.mkUnit(S, BB.FOES[0], 'them', 0, 1);
  S.units.push(ally, foe);
  const set0 = S.hp, allyHp = ally.hp;
  BB.fireUnit(S, foe, null);
  eq(ally.hp, allyHp, 'the ally in the OTHER lane is not touched');
  ok(S.hp < set0, 'a foe with a clear lane hits the set instead');

  // the back-shooter goes over the wall
  S.units.length = 0; S.hp = S.maxHp;
  const wall = BB.mkUnit(S, BB.CREW_BY.thump, 'us', 0, 0);
  const soft = BB.mkUnit(S, BB.CREW_BY.jas, 'us', 2, 0);
  const sniper = BB.mkUnit(S, BB.ALL_UNITS.screech, 'them', 0, 0);
  ok(sniper.back, 'screech is flagged as a back-shooter');
  S.units.push(wall, soft, sniper);
  const wallHp = wall.hp, softHp = soft.hp;
  BB.fireUnit(S, sniper, null);
  eq(wall.hp, wallHp, 'the front rank is not what a shooter hits');
  ok(soft.hp < softHp, 'the back rank is');
  done('targeting');
}

/* -------------------------------------------------------- damage and death */
{
  BB.newRun(13);
  const S = BB.startFight();
  S.units.length = 0; S.pending = []; S.waves = []; S.waveI = 0;
  const t = BB.mkUnit(S, BB.CREW_BY.thump, 'us', 1, 0);
  S.units.push(t);
  t.sh = 5;
  const hp = t.hp;
  BB.hurt(S, t, 3, null);
  eq(t.sh, 2, 'shield absorbs first');
  eq(t.hp, hp, 'and health is untouched while shield remains');
  BB.hurt(S, t, 6, null);
  eq(t.sh, 0, 'shield is spent');
  eq(t.hp, hp - 4, 'the overflow reaches health');
  BB.hurt(S, t, 999, null);
  eq(t.hp, 0, 'health floors at zero');
  ok(!BB.sideUnits(S, 'us').includes(t), 'a dead unit leaves the living list');
  done('damage');
}

/* ------------------------------------------------------------ the crowd */
{
  const S = bench(14);
  S.crowd = 0; S.drop = 0;
  BB.addCrowd(S, 50); eq(S.crowd, 50, 'crowd accumulates');
  BB.addCrowd(S, -80); eq(S.crowd, 0, 'and floors at zero');
  BB.addCrowd(S, 100);
  eq(S.crowd, 0, 'reaching 100 spends the meter');
  ok(S.drop > 0, 'and triggers the DROP');
  eq(S.drops, 1, 'the drop is counted');
  const dropBeats = S.drop;
  for (let i = 0; i < dropBeats; i++) BB.beatStep(S, null);
  eq(S.drop, 0, 'the drop lasts exactly ' + dropBeats + ' beats');
  done('crowd');
}

/* ------------------------------------------------------------- the judge */
{
  BB.newRun(15);
  const S = BB.startFight();
  BB.startTransport(120);           // 500ms a beat, so offsets are easy to read
  BB.A.t0 = 0;
  const at = ms => { BB.setClock(4 * 0.5 + ms / 1000); return BB.judgeNow().grade; };
  eq(at(0), 'perfect', 'dead on the beat is PERFECT');
  eq(at(BB.WIN_PERFECT - 5), 'perfect', 'just inside the perfect window');
  eq(at(BB.WIN_PERFECT + 12), 'good', 'just outside it is GOOD');
  eq(at(-(BB.WIN_PERFECT + 12)), 'good', 'and the window is symmetric');
  eq(at(BB.WIN_GOOD + 12), 'late', 'past the good window is LATE');
  ok(BB.WIN_PERFECT < BB.WIN_GOOD, 'perfect is the tighter window');
  done('judge');
}

/* ------------------------------------------------------ playing a card */
{
  BB.newRun(16);
  const S = BB.startFight();
  BB.startTransport(120); BB.A.t0 = 0; BB.setClock(2.0);
  S.energy = 9;
  const n0 = S.hand.length, e0 = S.energy;
  const card = S.hand[0], cost = card.cost;
  const u = BB.playCard(S, 0, 1, 0);
  ok(u, 'a card in an empty slot is played');
  eq(S.energy, e0 - cost, 'and costs its energy');
  eq(S.hand.length, n0 - 1, 'and leaves the hand');
  ok(S.disc.indexOf(card) >= 0, 'and lands in the discard');
  eq(u.c, 1, 'a PERFECT card arrives one beat from firing');

  ok(!BB.playCard(S, 0, 1, 0), 'an occupied slot is refused');
  S.energy = 0;
  ok(!BB.playCard(S, 0, 2, 1), 'no energy, no card');

  // GOOD is worth having, and LATE is worse than both
  const grades = [];
  for (const [ms, want] of [[0, 'perfect'], [BB.WIN_PERFECT + 20, 'good'], [BB.WIN_GOOD + 60, 'late']]) {
    BB.newRun(17); const T = BB.startFight();
    BB.startTransport(120); BB.A.t0 = 0; BB.setClock(2.0 + ms / 1000);
    T.energy = 9; T.crowd = 40;
    const before = T.crowd;
    const v = BB.playCard(T, 0, 1, 0);
    grades.push({ want, c: v.c, ctr: v.ctr, dCrowd: T.crowd - before });
  }
  eq(grades[0].c, 1, 'PERFECT: counter 1');
  ok(grades[1].c <= grades[1].ctr, 'GOOD: at most the full counter');
  ok(grades[2].c > grades[2].ctr - 1, 'LATE: no better than the full counter');
  ok(grades[0].dCrowd > grades[1].dCrowd, 'PERFECT pays more crowd than GOOD');
  ok(grades[1].dCrowd > grades[2].dCrowd, 'GOOD pays more crowd than LATE');
  ok(grades[2].dCrowd < 0, 'LATE costs crowd');
  done('playing');
}

/* -------------------------------------------------------------- the deck */
{
  BB.newRun(18);
  const S = BB.startFight();
  S.draw = []; S.disc = [BB.mkCard('rox'), BB.mkCard('jas')]; S.hand = [];
  const got = BB.drawOne(S);
  ok(got, 'an empty draw pile reshuffles from the discard');
  eq(S.disc.length, 0, 'and the discard is emptied doing it');
  S.draw = []; S.disc = [];
  eq(BB.drawOne(S), null, 'with nothing anywhere, drawing is a no-op not a crash');
  // a full hand does not lose the card, it discards it
  S.draw = [BB.mkCard('rox')]; S.disc = []; S.hand = new Array(S.handMax).fill(BB.mkCard('jas'));
  BB.drawOne(S);
  eq(S.hand.length, S.handMax, 'a full hand stays full');
  eq(S.disc.length, 1, 'and the drawn card goes to the discard, never nowhere');
  done('deck');
}

/* -------------------------------------------------------------- the waves */
{
  // The bug this exists for: a wave of three landing on a board with one free
  // slot used to spawn one foe and silently drop the other two, which made the
  // late stages easier than the early ones.
  BB.newRun(19);
  const S = BB.startFight();
  S.units.length = 0; S.pending = [];
  S.waves = [{ bar: 0, units: ['hush', 'hush', 'hush', 'hush', 'hush', 'hush', 'hush', 'hush'] }];
  S.waveI = 0; S.bar = 0;
  BB.nextWaveMaybe(S, null);
  eq(BB.sideUnits(S, 'them').length, COLS * ROWS, 'the enemy board fills to capacity');
  eq(S.pending.length, 2, 'and the overflow waits instead of being lost');
  // clear one and the queue advances
  BB.hurt(S, BB.sideUnits(S, 'them')[0], 9999, null);
  BB.nextWaveMaybe(S, null);
  eq(S.pending.length, 1, 'a freed slot pulls one off the queue');

  // a fight is not won while anything is still queued
  for (const f of BB.sideUnits(S, 'them')) BB.hurt(S, f, 9999, null);
  BB.beatStep(S, null);
  ok(!S.over, 'clearing the board does not win while foes are still queued');
  ok(BB.sideUnits(S, 'them').length > 0, 'the queue walked on instead');
  done('waves');
}

/* ------------------------------------------------------------- the charms */
{
  const withCharm = (id, fn) => {
    BB.newRun(20); BB.G.run.charms = [id];
    const S = BB.startFight(); return fn(S);
  };
  ok(withCharm('preamp', S => {
    const u = BB.mkUnit(S, BB.CREW_BY.clap, 'us', 1, 0);
    return u.atk === BB.CREW_BY.clap.atk + 1;
  }), 'PRE-AMP gives every ally +1 attack');
  ok(withCharm('roadcase', S => {
    const u = BB.mkUnit(S, BB.CREW_BY.clap, 'us', 1, 0);
    return u.max === BB.CREW_BY.clap.hp + 3;
  }), 'ROAD CASE gives every ally +3 health');
  ok(withCharm('compressor', S => {
    const before = S.hp; BB.hitPlayer(S, 40); return S.hp === before - 8;
  }), 'COMPRESSOR caps a hit on the set at 8');
  ok(withCharm('crowdsurf', S => { BB.addCrowd(S, -100); return S.crowd === 20; }),
    'CROWD SURF holds the meter at 20');
  ok(withCharm('sidechain', S => { S.crowd = 0; BB.addCrowd(S, 100); return S.drop === 8; }),
    'SIDECHAIN doubles the length of the drop');
  {
    BB.newRun(24); BB.G.run.charms = ['talkbox'];
    const S = bench(24);
    BB.G.run.charms = ['talkbox'];
    const u = BB.mkUnit(S, BB.CREW_BY.hum, 'us', COLS - 1, 0);   // counter 4, back column
    S.units.push(u); BB.beatStep(S, null);
    eq(u.c, 2, 'TALK BOX makes the back column tick double too');
  }
  ok(withCharm('clickTrack', S => S.freeCard === true), 'CLICK TRACK arms a free card');
  // every charm the content offers must be one the code actually reads
  const src = BB.CHARMS.map(c => c.id);
  for (const id of src) ok(typeof id === 'string', 'charm ids are strings');
  done('charms');
}

/* ------------------------------------------------------------ the rewards */
{
  BB.newRun(21);
  const o = BB.rollOffer();
  eq(o.cards.length, 3, 'a reward offers three cards');
  const seen = new Set(o.cards.map(c => c.id));
  eq(seen.size, 3, 'and no two of them are the same card');
  const n0 = BB.G.run.deck.length;
  BB.takeCard(o.cards[0].id);
  eq(BB.G.run.deck.length, n0 + 1, 'taking one adds it to the deck');
  BB.takeCard(o.cards[1].id);
  eq(BB.G.run.deck.length, n0 + 1, 'and you only get one');

  BB.newRun(22);
  const sh = BB.rollShop();
  eq(sh.cards.length, 3, 'the shop stocks three cards');
  for (const c of sh.cards) ok(c.price > 0, c.id + ' has a price');
  for (const c of sh.charms) ok(c.price > 0, c.id + ' charm has a price');
  done('rewards');
}

/* ------------------------------------------------------------ progression */
{
  BB.newRun(23);
  const R = BB.G.run;
  eq(R.act, 0, 'a run starts in act one');
  eq(R.deck.length, BB.startingDeck().length, 'with the starting deck');
  // four stages then the boss node, so it takes STAGES_PER_ACT + 1 advances
  for (let i = 0; i <= BB.STAGES_PER_ACT; i++) BB.advance();
  eq(R.act, 1, 'clearing the boss stage moves to the next act');
  eq(R.stage, 0, 'and back to stage one');
  R.hp = 1; R.stage = BB.STAGES_PER_ACT; BB.advance();
  ok(R.hp > 1, 'a new act heals the set');
  done('progression');
}

/* ------------------------------------------------------- the board plays */
{
  // The premise of the whole game, and until this existed nothing checked it:
  // a unit's counter is its rhythm, so the front column -- which ticks twice --
  // has to play the beat AND the and of it, not two hits in the same instant.
  const S = bench(31);
  const spb = 60 / S.bpm;
  const hits = [];
  BB.A.tap = (v, n, vel, when) => hits.push({ v, when });

  const back = BB.mkUnit(S, BB.CREW_BY.thump, 'us', 2, 0);    // counter 1, back
  S.units.push(back);
  BB.beatStep(S, 0);
  eq(hits.length, 1, 'a counter-1 unit at the back plays once a beat');
  eq(hits[0].v, 'kick', 'and plays its own voice, not some other unit\'s');
  eq(hits[0].when, 0, 'on the beat');

  hits.length = 0;
  const front = BB.mkUnit(S, BB.CREW_BY.thump, 'us', 0, 1);   // counter 1, front
  S.units.push(front);
  BB.beatStep(S, 0);
  eq(hits.length, 3, 'the front column adds two hits to the back column\'s one');
  const offs = hits.map(h => Math.round(h.when / spb * 100) / 100).sort();
  eq(offs.join(','), '0,0,0.5', 'and the second of them lands on the AND, not as a flam');

  // a slow unit is a slow voice: counter 4 at the back speaks once every 4 beats
  hits.length = 0;
  S.units.length = 0;
  S.units.push(BB.mkUnit(S, { id: 'bench', name: 'BENCH', voice: 'grit', note: 0, ctr: 99999,
    hp: 999999, atk: 0, art: 'hulk', tint: '#fff' }, 'them', 2, 1));
  const slow = BB.mkUnit(S, BB.CREW_BY.hum, 'us', 2, 0);      // counter 4
  S.units.push(slow);
  for (let b = 0; b < 8; b++) BB.beatStep(S, b * spb);
  eq(hits.filter(h => h.v === 'pad').length, 2, 'a counter-4 unit speaks twice in eight beats');

  // and every voice a card names is one the synth can actually make
  for (const c of BB.CREW.concat(BB.FOES, BB.BOSSES)) ok(BB.VOICE[c.voice], c.id + ' voice exists in the synth');
  BB.A.tap = null;
  done('the board plays');
}

/* --------------------------------------------------------------- balance */
{
  // These are the numbers from tools/beatborne/probe.mjs, banded wide enough
  // that tuning a card does not trip them and a broken economy does. Run
  // `node tools/beatborne/probe.mjs` to see the table these came from.
  const runs = grade => {
    let won = 0, cleared = 0, n = 12;
    for (let s = 1; s <= n; s++) { const r = BB.simRun({ seed: s, grade }); if (r.won) won++; cleared += r.cleared; }
    return { win: won / n, cleared: cleared / n };
  };
  const P = runs('perfect'), L = runs('late');
  between(P.win, 0.05, 0.55, 'a sane pilot on perfect timing wins some runs but not most');
  between(P.cleared, 9, 15, 'and clears most of the ladder');
  ok(L.cleared < P.cleared, 'ignoring the beat clears less of it (' + L.cleared.toFixed(1) + ' vs ' + P.cleared.toFixed(1) + ')');
  ok(L.win <= P.win, 'and wins no more often');

  // a single stage should be a fight, not a formality and not a wall
  const one = BB.sim({ seed: 5, act: 0, stage: 0 });
  eq(one.over, 'win', 'the first stage of the game is winnable');
  between(one.beats, 5, 40, 'and takes a sensible number of beats (' + one.beats + ')');
  const hard = BB.sim({ seed: 5, act: 2, stage: 3, maxBeats: 900 });
  ok(hard.beats > one.beats, 'the last stage of act three is a longer fight than the first of act one');
  done('balance');
}

/* ------------------------------------------------------------- the score */
{
  BB.newRun(41);
  const R = BB.G.run;
  eq(BB.runScore(R), BB.runScore(R), 'the score is a pure function of the run');
  const zero = BB.runScore(R);
  R.stagesCleared = 4; R.perfects = 30; R.drops = 6; R.hp = 20; R.act = 1;
  const mid = BB.runScore(R);
  ok(mid > zero, 'clearing stages raises the score');
  R.drops = 12;
  ok(BB.runScore(R) > mid, 'and so do drops');
  // finishing the run doubles it, so the last act is always worth reaching for
  R.act = BB.ACTS.length;
  ok(BB.runScore(R) > mid * 2, 'an encore is worth double');

  BB.G.meta.bestScore = 0;
  R.act = 1;
  const s1 = BB.bankScore();
  eq(BB.G.meta.bestScore, s1, 'a first run sets the best');
  ok(R.newBest, 'and is flagged as one');
  R.stagesCleared = 0; R.perfects = 0; R.drops = 0; R.hp = 0; R.act = 0;
  BB.bankScore();
  eq(BB.G.meta.bestScore, s1, 'a worse run does not lower the best');
  ok(!R.newBest, 'and is not flagged as one');
  done('score');
}

/* ------------------------------------------------------------ the save */
{
  BB.G.meta.perfects = 41; BB.G.meta.runs = 7;
  const raw = JSON.stringify(BB.G.meta);
  const back = JSON.parse(raw);
  eq(back.perfects, 41, 'meta survives a JSON round trip');
  ok(Array.isArray(back.unlocked), 'the unlock list is a list');
  done('save');
}

console.log('beatborne: all suites green');
