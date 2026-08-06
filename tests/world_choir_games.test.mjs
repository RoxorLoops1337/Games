// Adjudicator (World Choir Games) — headless jury suite.
//
// world_choir_games/index.html is one self-contained file: markup, CSS and a
// single inline <script>.  This harness stubs a DOM plus a no-op 2d context,
// injects a test-only expose hook (never shipped) and evals the game — then
// drives real performances beat by beat through the game's own update(),
// marks criteria, locks in scores and walks the whole competition to the
// results book.  draw() runs in every phase, so a render-time mistake fails
// here instead of on somebody's phone in a concert hall.
//
// There is no AudioContext in the sandbox, so AUDIO.ok stays false and every
// audio path takes its silent branch — which is itself worth asserting.
// Run: node tests/world_choir_games.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'world_choir_games', 'index.html');

let passed = 0, failed = 0;
function test(name, fn){
  try { fn(); passed++; }
  catch (e){ failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(cond, msg){ if (!cond) throw new Error(msg || 'assertion failed'); }
function near(a, b, eps, msg){
  if (!(Math.abs(a - b) <= eps)) throw new Error(`${msg || 'not near'}: ${a} vs ${b}`);
}

const BOOT_TAIL = `loadSave();
buildCompetition();
bindInput();
fit();
setPhase('title');
requestAnimationFrame(loop);`;

const EXPOSE = `__out.api = {
  G, PARTS, SING, CRITS, CRIT_BY_ID, FLAWS, FLAW_BY_ID, PART_DEFS, COUNTRIES, CATEGORIES,
  JURORS, BANDS, RANKS, STAGES, VENUES, SAVE_KEY, CARD_TOP, PHANTOM_COST, VW, VH, AUDIO,
  get fx(){ return fx; },
  reseed, rng, rnd, rint, pick, clamp, lerp, hash32,
  bandFor, rankFor, trimmedMean, jurorScore, overallScore, championOfTheGames, avg,
  makePiece, noteAt, makeChoir, makeChoirName, buildCompetition, choirAt, totalChoirs,
  startRun, startChoir, beginPerformance, perfTick, flagCrit, flawIntensity, endPerformance,
  submitScore, nextChoir, finishStage, setPhase, advance, nudgeScore,
  fmtFlaw, fmtNote, loadSave, writeSave, recordBest,
  update, draw, fit, onKey, onPointer, toggleMute, critRect, critX, scoreFromPoint, dialGeom,
  drawTitle, drawHowTo, drawParade, drawRoundCard, drawBrief, drawPerform,
  drawDeliberate, drawPanel, drawResults, drawChoir, drawHall, drawFlag, mixHex, hex2rgb,
};
`;

function makeSandbox(opts){
  opts = opts || {};
  const counts = {};
  const gradient = { addColorStop(){} };
  const ctxStub = new Proxy({}, {
    get(t, p){
      if (p === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient;
      if (p === 'canvas') return { width: 1000, height: 620 };
      if (typeof p === 'string' && p !== 'then' && !(p in t))
        return () => { counts[p] = (counts[p] || 0) + 1; };
      return t[p];
    },
    set(t, p, v){ t[p] = v; return true; },
  });
  const mkEl = () => ({
    style: {}, textContent: '', innerHTML: '', width: 0, height: 0, className: '', dataset: {},
    getContext: () => ctxStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 620 }),
    addEventListener(ev, fn){ (this._ev || (this._ev = {}))[ev] = fn; },
    removeEventListener(){}, removeAttribute(){}, setAttribute(){},
    requestFullscreen(){}, querySelectorAll: () => [], querySelector: () => null, appendChild(){},
    classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
  });
  const nodes = {};
  const store = Object.assign({}, opts.store || {});
  const sandbox = {
    document: {
      documentElement: mkEl(),
      fullscreenElement: null,
      exitFullscreen(){},
      getElementById: (id) => (nodes[id] || (nodes[id] = mkEl())),
      createElement: () => mkEl(),
      querySelectorAll: () => [],
      addEventListener(){},
    },
    window: { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener(){} },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    requestAnimationFrame: () => {},
    __out: {},
  };
  return { sandbox, store, counts, nodes };
}

let SRC = null;
function source(){
  if (SRC) return SRC;
  const html = fs.readFileSync(HTML, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocks.length) throw new Error('no inline script found in the game');
  const src = blocks.join('\n');
  if (!src.includes(BOOT_TAIL)) throw new Error('boot tail anchor missing from game script');
  SRC = src.replace(BOOT_TAIL, EXPOSE + BOOT_TAIL);
  return SRC;
}

function boot(opts){
  const { sandbox, store, counts, nodes } = makeSandbox(opts);
  new Function('window', 'document', 'localStorage', 'navigator', 'requestAnimationFrame', '__out',
    source())(
    sandbox.window, sandbox.document, sandbox.localStorage, undefined,
    sandbox.requestAnimationFrame, sandbox.__out);
  const api = sandbox.__out.api;
  api._store = store;
  api._counts = counts;
  api._nodes = nodes;
  api._resetCounts = () => { for (const k in counts) delete counts[k]; };
  api.reseed((opts && opts.seed) || 1234);
  return api;
}

const STEP = 1 / 60;
const step = (api, secs) => {
  const n = Math.max(1, Math.round(secs / STEP));
  for (let i = 0; i < n; i++) api.update(STEP);
};

/* Drops straight into a live performance of a given round/seat. */
function perform(api, stage, seat){
  api.startRun();
  api.G.stage = stage || 0;
  api.G.idx = seat || 0;
  api.startChoir();
  api.beginPerformance();
  return api.G.cur;
}

/* Plays a whole performance, marking every flaw the moment it becomes live. */
function playPerfect(api){
  const c = api.G.cur, P = api.G.perf;
  let guard = 0;
  while (api.G.phase === 'perform' && guard++ < 20000){
    api.update(STEP);
    if (api.G.phase !== 'perform') break;
    for (const f of c.flaws){
      if (f.caught) continue;
      if (P.t >= f.at + 0.05 && P.t <= f.at + f.dur) { api.flagCrit(f.def.crit); break; }
    }
  }
  return api.G.card;
}

/* ------------------------------------------------------------------- boot */
test('boots to the title screen with a full competition drawn up', () => {
  const api = boot();
  assert(api.G.phase === 'title', 'phase should be title, got ' + api.G.phase);
  assert(api.G.field.length === api.totalChoirs(), 'field holds every choir of every round');
  assert(api.totalChoirs() === 8, 'eight choirs sing across the games, got ' + api.totalChoirs());
  assert(api.G.log.length === 0, 'nothing judged yet');
  assert(api.AUDIO.ok === false, 'no AudioContext in the sandbox, so audio stays silent');
});

test('the sandbox has no audio and every audio path survives it', () => {
  const api = boot();
  api.AUDIO.init(); api.AUDIO.resume(); api.AUDIO.frame();
  api.AUDIO.blip(440, 0.1, 'sine'); api.AUDIO.cheer(1); api.AUDIO.fadeCheer(0.1);
  assert(api.AUDIO.ok === false, 'still silent');
  assert(api.AUDIO.applause <= 1, 'cheer is clamped');
});

/* ------------------------------------------------------------- data tables */
test('the five criteria are complete and uniquely keyed', () => {
  const api = boot();
  assert(api.CRITS.length === 5, 'five lines on the card');
  const keys = new Set(), ids = new Set();
  for (const c of api.CRITS){
    assert(c.id && c.name && c.short && c.col && c.blurb, c.id + ' is missing a field');
    assert(!keys.has(c.key), 'duplicate key ' + c.key);
    assert(!ids.has(c.id), 'duplicate id ' + c.id);
    keys.add(c.key); ids.add(c.id);
    assert(/^[1-5]$/.test(c.key), c.id + ' should be on a number row key');
  }
});

test('every flaw names a real criterion and bends the choir when applied', () => {
  const api = boot();
  const critIds = new Set(api.CRITS.map((c) => c.id));
  for (const f of api.FLAWS){
    assert(critIds.has(f.crit), f.id + ' points at unknown criterion ' + f.crit);
    assert(f.sev > 0 && f.sev <= 3, f.id + ' severity out of range: ' + f.sev);
    assert(f.dur >= 3 && f.dur <= 8, f.id + ' duration out of range: ' + f.dur);
    assert(typeof f.apply === 'function', f.id + ' needs an apply');
    assert(f.label && f.note, f.id + ' needs both a label and a note');

    // Applying at full intensity must measurably change part state or the
    // ensemble state — a flaw nobody can hear is not a flaw.
    const P = api.PART_DEFS.map(() => ({ cents:0, gain:1, bright:0, air:0, lag:0, rogue:0 }));
    const S = { tempoMul:1, expression:1, phrasing:1, life:1 };
    const inst = { def:f, part:-1 };
    if (f.setup) f.setup(inst);
    f.apply(inst, P, 1, S);
    const partMoved = P.some((p) =>
      p.cents !== 0 || p.gain !== 1 || p.bright !== 0 || p.air !== 0 || p.lag !== 0 || p.rogue !== 0);
    const ensMoved = S.tempoMul !== 1 || S.expression !== 1 || S.phrasing !== 1 || S.life !== 1;
    assert(partMoved || ensMoved, f.id + ' applies but changes nothing');
  }
});

test('every criterion has at least two flaws behind it', () => {
  const api = boot();
  for (const c of api.CRITS){
    const n = api.FLAWS.filter((f) => f.crit === c.id).length;
    assert(n >= 2, c.id + ' only has ' + n + ' flaw(s) — the card line would be predictable');
  }
});

test('flaws that name a part always pick a real one', () => {
  const api = boot();
  for (const f of api.FLAWS){
    if (!f.setup) continue;
    for (let i = 0; i < 40; i++){
      const inst = { def:f, part:-1 };
      f.setup(inst);
      assert(inst.part === -1 || (inst.part >= 0 && inst.part < api.PART_DEFS.length),
        f.id + ' picked part ' + inst.part);
    }
  }
  // and a labelled flaw renders its part name into readable English
  const withPart = api.FLAWS.find((f) => f.label.includes('{part}'));
  const inst = { def:withPart, part:1 };
  assert(api.fmtFlaw(inst).includes('Altos'), 'part token should expand: ' + api.fmtFlaw(inst));
  assert(!api.fmtNote(inst).includes('{part}'), 'note token should expand too');
});

test('every part pluralises like a human wrote it', () => {
  const api = boot();
  const want = ['Sopranos', 'Altos', 'Tenors', 'Basses'];
  for (let i = 0; i < api.PART_DEFS.length; i++){
    assert(api.PART_DEFS[i].plural === want[i],
      api.PART_DEFS[i].name + ' pluralises to ' + api.PART_DEFS[i].plural);
  }
  const withPart = api.FLAWS.find((f) => f.label.includes('{part}'));
  for (let i = 0; i < 4; i++){
    const s = api.fmtFlaw({ def:withPart, part:i });
    assert(!/sss|oss\b/.test(s), 'naive pluralisation leaked through: ' + s);
    assert(s.includes(want[i]), 'expected ' + want[i] + ' in: ' + s);
  }
  // a flaw with no part still reads as a sentence
  const s = api.fmtFlaw({ def:withPart, part:-1 });
  assert(s.startsWith('The choir'), 'an ensemble-wide flaw names the choir: ' + s);
});

test('flags, countries and categories are all well formed', () => {
  const api = boot();
  assert(api.COUNTRIES.length >= 24, 'the parade needs a crowd');
  const seen = new Set();
  for (const c of api.COUNTRIES){
    assert(c.n && c.t && Array.isArray(c.f) && c.f.length >= 1, c.n + ' is malformed');
    assert(!seen.has(c.n), 'duplicate country ' + c.n);
    seen.add(c.n);
    for (const col of c.f) assert(/^#[0-9a-f]{6}$/i.test(col), c.n + ' has a bad colour ' + col);
  }
  for (const cat of api.CATEGORIES){
    assert(cat.n && cat.flavour, 'category needs a name and a flavour');
    assert(api.makePiece(cat.flavour).bars.length > 0, cat.flavour + ' has no music behind it');
  }
});

test('the diploma bands tile the card from top to bottom without a gap', () => {
  const api = boot();
  for (let i = 1; i < api.BANDS.length; i++)
    assert(api.BANDS[i].min < api.BANDS[i - 1].min, 'bands must run downwards');
  assert(api.BANDS[api.BANDS.length - 1].min === 0, 'the bottom band catches everything');
  assert(api.bandFor(30).id === 'goldI', '30 is the top diploma');
  assert(api.bandFor(29.0).id === 'goldI', 'a band includes its own boundary');
  assert(api.bandFor(28.9).id === 'goldII', 'just under drops a level');
  assert(api.bandFor(9).id === 'part', 'a low card is still a participation');
  for (let s = 8; s <= 30; s += 0.1) assert(api.bandFor(s), 'no score falls through the bands at ' + s);
});

/* ------------------------------------------------------------------- music */
test('generated pieces keep every part inside its own range', () => {
  const api = boot();
  for (const cat of api.CATEGORIES){
    const piece = api.makePiece(cat.flavour);
    assert(piece.tempo > 30 && piece.tempo < 140, cat.flavour + ' tempo ' + piece.tempo);
    assert(piece.beats === 4, 'four beats to a bar');
    for (let b = 0; b < piece.bars.length; b++){
      for (let beat = 0; beat < 4; beat++){
        const notes = api.noteAt(piece, b, beat);
        assert(notes.length === 4, 'four parts to a chord');
        for (let i = 0; i < 4; i++){
          const d = api.PART_DEFS[i];
          assert(notes[i] >= d.lo && notes[i] <= d.hi,
            cat.flavour + ' bar ' + b + ': ' + d.name + ' asked for ' + notes[i] +
            ' outside ' + d.lo + '-' + d.hi);
        }
      }
    }
  }
});

test('the soprano actually moves inside the bar', () => {
  const api = boot();
  const piece = api.makePiece('hymn');
  let moved = 0;
  for (let b = 0; b < piece.bars.length; b++)
    if (api.noteAt(piece, b, 0)[0] !== api.noteAt(piece, b, 3)[0]) moved++;
  assert(moved > 0, 'the top line should not just sit there for eight bars');
});

test('noteAt wraps round the piece instead of falling off it', () => {
  const api = boot();
  const piece = api.makePiece('hymn');
  const n = piece.bars.length;
  assert(JSON.stringify(api.noteAt(piece, n, 0)) === JSON.stringify(api.noteAt(piece, 0, 0)),
    'bar N wraps to bar 0');
  assert(api.noteAt(piece, -1, 0).length === 4, 'a negative bar still returns a chord');
});

/* -------------------------------------------------------------- the choirs */
test('a choir is fully specified and its truth matches its flaws exactly', () => {
  const api = boot();
  for (const c of api.G.field){
    assert(c.name && c.country && c.cat && c.venue, c.id + ' is missing paperwork');
    assert(c.singers >= 18, c.name + ' brought ' + c.singers + ' singers');
    assert(c.flaws.length >= 2 && c.flaws.length <= 7, c.name + ' has ' + c.flaws.length + ' flaws');
    let t = api.CARD_TOP;
    for (const f of c.flaws) t -= f.sev;
    near(c.truth, Math.max(9, t), 0.06, c.name + ' truth does not equal the card minus its flaws');
    assert(c.truth >= 9 && c.truth <= 30, c.name + ' truth out of range: ' + c.truth);
    assert(c.dur >= 30, c.name + ' programme is too short');
  }
});

test('no two flaws of the same criterion overlap, and none run past the piece', () => {
  const api = boot();
  for (let seed = 1; seed < 25; seed++){
    api.reseed(seed * 977);
    api.buildCompetition();
    for (const c of api.G.field){
      for (const f of c.flaws){
        assert(f.at >= 0, c.name + ': a flaw starts before the downbeat');
        assert(f.at + f.dur <= c.dur, c.name + ': a flaw runs past the end of the programme');
        assert(f.sev > 0, c.name + ': a flaw with no cost');
      }
      for (let i = 0; i < c.flaws.length; i++)
        for (let j = i + 1; j < c.flaws.length; j++){
          const a = c.flaws[i], b = c.flaws[j];
          assert(a.def.id !== b.def.id, c.name + ' repeats ' + a.def.id);
          if (a.def.crit !== b.def.crit) continue;
          const overlap = a.at < b.at + b.dur && b.at < a.at + a.dur;
          assert(!overlap, c.name + ': two ' + a.def.crit + ' flaws overlap — unmarkable');
        }
    }
  }
});

test('the rounds get harder in every direction that matters', () => {
  const api = boot();
  assert(api.STAGES.length === 3, 'three rounds');
  for (let i = 1; i < api.STAGES.length; i++){
    assert(api.STAGES[i].diff > api.STAGES[i - 1].diff, 'difficulty climbs');
    assert(api.STAGES[i].tell < api.STAGES[i - 1].tell, 'the visual tell fades');
    assert(api.STAGES[i].win < api.STAGES[i - 1].win, 'the marking window shrinks');
  }
  // and the flaws themselves get shorter to react to
  const avgDur = (st) => {
    const cs = api.G.field.filter((c) => c.stage === st);
    const all = cs.flatMap((c) => c.flaws);
    return all.reduce((a, f) => a + f.dur, 0) / all.length;
  };
  assert(avgDur(2) < avgDur(0), 'grand prix flaws are quicker than open-competition ones');
});

test('flaw intensity ramps in, holds, and ramps back out', () => {
  const api = boot();
  const f = { at: 10, dur: 4 };
  assert(api.flawIntensity(f, 9.9) === 0, 'silent before it starts');
  assert(api.flawIntensity(f, 14.1) === 0, 'silent after it ends');
  assert(api.flawIntensity(f, 10.01) < 0.2, 'fades in');
  near(api.flawIntensity(f, 12), 1, 1e-9, 'full strength in the middle');
  assert(api.flawIntensity(f, 13.9) < 0.5, 'fades out');
  for (let t = 9.5; t < 14.5; t += 0.05){
    const k = api.flawIntensity(f, t);
    assert(k >= 0 && k <= 1.0001, 'intensity stays in 0..1 at t=' + t.toFixed(2));
  }
});

/* -------------------------------------------------- the live performance */
test('a live flaw actually bends the choir the way it says it does', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  // Force a single known flaw so the assertion is about that flaw alone.
  const flat = api.FLAW_BY_ID.flat_part;
  c.flaws = [{ def:flat, at:1, dur:5, sev:1.5, part:1, caught:false, catchT:0, missed:false, sharp:0 }];
  step(api, 3.5);
  assert(api.PARTS[1].cents < -20, 'the alto line should be sitting flat, got ' + api.PARTS[1].cents);
  assert(api.PARTS[0].cents === 0, 'nobody else moved');
  step(api, 4);
  near(api.PARTS[1].cents, 0, 1e-9, 'the flaw clears once it has passed');
});

test('an ensemble flaw moves the ensemble, not a part', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  c.flaws = [{ def:api.FLAW_BY_ID.drag, at:1, dur:5, sev:1.7, part:-1,
    caught:false, catchT:0, missed:false, sharp:0 }];
  step(api, 3.5);
  assert(api.SING.tempoMul < 0.92, 'the tempo should be dragging, got ' + api.SING.tempoMul);
  const c2 = perform(api, 0, 0);
  c2.flaws = [{ def:api.FLAW_BY_ID.flat_dyn, at:1, dur:6, sev:1.6, part:-1,
    caught:false, catchT:0, missed:false, sharp:0 }];
  step(api, 4);
  assert(api.SING.expression < 0.4, 'expression should have drained, got ' + api.SING.expression);
});

test('marking the right criterion while a flaw is live catches it', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  const f = c.flaws[0];
  step(api, f.at + f.dur * 0.4);
  const hit = api.flagCrit(f.def.crit);
  assert(hit === f, 'that mark should have landed on the live flaw');
  assert(f.caught, 'and the flaw is now on the card');
  assert(api.G.perf.caught.length === 1, 'one entry in the notes');
  assert(api.G.perf.phantoms.length === 0, 'no phantom recorded');
});

test('marking a criterion with nothing behind it records a phantom', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  // Wind to a moment with nothing live at all.
  let t = 0, quiet = -1;
  for (t = 0.2; t < c.dur; t += 0.1){
    if (!c.flaws.some((f) => t > f.at - 0.3 && t < f.at + f.dur + 1.2)) { quiet = t; break; }
  }
  assert(quiet > 0, 'the piece should have at least one clean moment');
  step(api, quiet);
  const hit = api.flagCrit('int');
  assert(hit === null, 'nothing was there to catch');
  assert(api.G.perf.phantoms.length === 1, 'a phantom mark was written down');
});

test('a flaw can only be caught once, and the key has a cooldown', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  const f = c.flaws[0];
  step(api, f.at + 0.3);
  assert(api.flagCrit(f.def.crit) === f, 'first mark catches it');
  assert(api.flagCrit(f.def.crit) === null, 'a second press inside the cooldown does nothing');
  assert(api.G.perf.phantoms.length === 0, 'and it is not punished as a phantom either');
  step(api, 0.4);
  api.flagCrit(f.def.crit);
  assert(api.G.perf.caught.length === 1, 'the same flaw is never double counted');
});

test('mashing every key all the way through wrecks the card', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  let guard = 0;
  while (api.G.phase === 'perform' && guard++ < 20000){
    api.update(STEP);
    for (const cr of api.CRITS) api.flagCrit(cr.id);
  }
  const card = api.G.card;
  assert(card, 'the performance finished');
  assert(card.phantoms.length > 20, 'a masher writes down a great deal of nothing');
  assert(card.suggested < 15, 'and their card collapses: ' + card.suggested);
});

test('a perfect listener lands exactly on the truth', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  const card = playPerfect(api);
  assert(card.caught.length === c.flaws.length,
    'caught ' + card.caught.length + ' of ' + c.flaws.length);
  assert(card.phantoms.length === 0, 'no phantoms while playing clean');
  near(card.suggested, c.truth, 0.06, 'a complete card suggests exactly the true score');
  near(api.G.myScore, Math.round(c.truth * 2) / 2, 0.26, 'the dial starts on that suggestion');
});

test('a listener who hears nothing scores the choir far too high', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  let guard = 0;
  while (api.G.phase === 'perform' && guard++ < 20000) api.update(STEP);
  assert(api.G.phase === 'deliberate', 'the piece ended and the card came up');
  assert(api.G.card.caught.length === 0, 'nothing marked');
  assert(api.G.card.missed.length === c.flaws.length, 'everything missed');
  near(api.G.card.suggested, api.CARD_TOP, 0.001, 'an empty card suggests the top of the scale');
  assert(api.G.card.suggested > c.truth, 'which is too generous, because things did go wrong');
});

test('a performance always ends, and never overruns its programme', () => {
  const api = boot();
  for (let s = 0; s < api.STAGES.length; s++){
    const c = perform(api, s, 0);
    let guard = 0;
    while (api.G.phase === 'perform' && guard++ < 20000) api.update(STEP);
    assert(api.G.phase === 'deliberate', 'round ' + s + ' performance did not end');
    assert(api.G.perf.t >= c.dur, 'it ran the full programme');
    assert(api.G.perf.t < c.dur + 0.2, 'and stopped promptly, at ' + api.G.perf.t);
  }
});

test('pausing freezes the performance clock and blocks marking', () => {
  const api = boot();
  perform(api, 0, 0);
  step(api, 2);
  const t = api.G.perf.t;
  api.G.paused = true;
  step(api, 2);
  near(api.G.perf.t, t, 1e-9, 'the clock stood still');
  assert(api.flagCrit('int') === null, 'no marking while paused');
  api.G.paused = false;
  step(api, 1);
  assert(api.G.perf.t > t, 'and it starts again');
});

test('the marking window is generous just after a flaw ends, but not forever', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  const f = c.flaws[0];
  step(api, f.at + f.dur + 0.2);
  assert(api.flagCrit(f.def.crit) === f, 'a beat late still counts — you were writing');
  const api2 = boot();
  const c2 = perform(api2, 0, 0);
  const g = c2.flaws[0];
  step(api2, g.at + g.dur + 3.0);
  assert(api2.flagCrit(g.def.crit) === null, 'three seconds later it is gone');
});

test('catching a flaw early is recorded as a sharper catch than catching it late', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  const f = c.flaws[0];
  step(api, f.at + 0.1);
  api.flagCrit(f.def.crit);
  const early = f.sharp;
  const api2 = boot();
  const c2 = perform(api2, 0, 0);
  const g = c2.flaws[0];
  step(api2, g.at + g.dur * 0.9);
  api2.flagCrit(g.def.crit);
  assert(early > g.sharp, 'early catch ' + early + ' should beat late catch ' + g.sharp);
});

/* -------------------------------------------------------------- the panel */
test('the panel drops the outlying marks and averages the middle three', () => {
  const api = boot();
  near(api.trimmedMean([10, 24, 25, 26, 30]), 25, 1e-9, 'the 10 and the 30 are thrown away');
  near(api.trimmedMean([20, 20, 20, 20, 20]), 20, 1e-9, 'a unanimous panel');
  near(api.trimmedMean([24, 26]), 25, 1e-9, 'too few marks to trim');
  near(api.trimmedMean([27]), 27, 1e-9, 'a single mark');
});

test('each juror is wrong in their own consistent direction', () => {
  const api = boot();
  const c = api.G.field.find((x) => x.favourite) || api.G.field[0];
  const by = {};
  for (const j of api.JURORS) by[j.style] = api.jurorScore(j, c);
  assert(by.hawk < c.truth, 'the hawk marks under the truth');
  assert(by.dove > c.truth, 'the dove marks over it');
  assert(Math.abs(by.pedant - c.truth) < 1.2, 'the pedant is close');
  // and they never change their mind between two reads of the same choir
  for (const j of api.JURORS)
    near(api.jurorScore(j, c), by[j.style], 1e-9, j.name + ' changed their mark on a re-read');
});

test('the crowd-following juror is swayed by the hall, and only by the hall', () => {
  const api = boot();
  const fav = api.G.field.find((x) => x.favourite);
  const notFav = api.G.field.find((x) => !x.favourite);
  const j = api.JURORS.find((x) => x.style === 'crowd');
  if (fav) assert(api.jurorScore(j, fav) > fav.truth, 'a hall favourite gets a bump');
  if (notFav) assert(api.jurorScore(j, notFav) < notFav.truth + 0.3, 'everyone else does not');
});

test('locking in a score fills the results book and the three meters', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  playPerfect(api);
  api.submitScore();
  assert(api.G.phase === 'panel', 'the cards are revealed');
  const e = api.G.result;
  assert(e && e.choir === c, 'the entry is about this choir');
  assert(e.others.length === 4, 'four other jurors marked it');
  assert(e.band === api.bandFor(e.panel), 'the diploma matches the panel score');
  assert(e.accuracy > 0.95, 'a perfect card should be all but exactly accurate: ' + e.accuracy);
  assert(e.attention === 1, 'and should have caught everything');
  assert(api.G.log.length === 1, 'one line in the results book');
  assert(api.G.acc.length === 1 && api.G.att.length === 1 && api.G.integ.length === 1,
    'all three meters recorded a value');
});

test('accuracy falls off as your score drifts from the truth', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  playPerfect(api);
  api.G.myScore = Math.round((c.truth - 5) * 2) / 2;
  api.submitScore();
  assert(api.G.result.accuracy <= 0.05, 'five points out is a wasted card: ' + api.G.result.accuracy);
});

test('integrity rewards being right when the panel is not', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  playPerfect(api);
  api.G.myScore = Math.round(c.truth * 2) / 2;
  api.submitScore();
  const right = api.G.result;
  if (Math.abs(right.panelNoMe - right.truth) > 1.0)
    assert(right.integrity > 0.5, 'holding the truth against a drifting panel should pay');
  assert(right.integrity >= 0 && right.integrity <= 1, 'integrity stays in range');

  const api2 = boot();
  const c2 = perform(api2, 0, 0);
  playPerfect(api2);
  api2.G.myScore = Math.round((c2.truth + 4) * 2) / 2;
  api2.submitScore();
  assert(api2.G.result.integrity < right.integrity + 0.001,
    'drifting with the room never beats holding your ground');
});

test('attention is docked for phantom marks even when you caught everything', () => {
  const api = boot();
  perform(api, 0, 0);
  playPerfect(api);
  api.G.card.phantoms = [{ crit:'int', t:1 }, { crit:'snd', t:2 }];
  api.submitScore();
  assert(api.G.result.attention < 1, 'phantoms cost attention: ' + api.G.result.attention);
  assert(api.G.result.attention >= 0, 'but it never goes negative');
});

/* --------------------------------------------------------------- the run */
test('the competition walks all three rounds and closes on the results book', () => {
  const api = boot();
  api.startRun();
  assert(api.G.phase === 'parade', 'it opens with the parade');
  api.setPhase('round');
  let guard = 0;
  while (api.G.phase !== 'results' && guard++ < 60){
    if (api.G.phase === 'round') api.startChoir();
    else if (api.G.phase === 'brief') api.beginPerformance();
    else if (api.G.phase === 'perform'){
      playPerfect(api);
    } else if (api.G.phase === 'deliberate') api.submitScore();
    else if (api.G.phase === 'panel') api.nextChoir();
    else break;
  }
  assert(api.G.phase === 'results', 'the games finished, phase is ' + api.G.phase);
  assert(api.G.log.length === api.totalChoirs(),
    'every choir got a card: ' + api.G.log.length + '/' + api.totalChoirs());
  const champ = api.championOfTheGames();
  assert(champ, 'somebody is Champion of the World Choir Games');
  for (const e of api.G.log)
    assert(e.panel <= champ.panel + 1e-9, 'nobody outscored the champion');
  const v = api.overallScore();
  assert(v > 0.8, 'a perfect run should rank near the top, got ' + v);
  assert(api.rankFor(v).name === 'Champion Adjudicator', 'and take the top title');
});

test('a run where you hear nothing at all still completes, and ranks badly', () => {
  const api = boot({ seed: 99 });
  api.startRun();
  api.setPhase('round');
  let guard = 0;
  while (api.G.phase !== 'results' && guard++ < 60){
    if (api.G.phase === 'round') api.startChoir();
    else if (api.G.phase === 'brief') api.beginPerformance();
    else if (api.G.phase === 'perform'){
      let g = 0;
      while (api.G.phase === 'perform' && g++ < 20000) api.update(STEP);
    } else if (api.G.phase === 'deliberate') api.submitScore();
    else if (api.G.phase === 'panel') api.nextChoir();
    else break;
  }
  assert(api.G.phase === 'results', 'it still reaches the end');
  assert(api.G.log.length === api.totalChoirs(), 'every choir still got a card');
  assert(api.avg(api.G.att) === 0, 'attention is zero — nothing was heard');
  assert(api.overallScore() < 0.55, 'and the overall rank is poor: ' + api.overallScore());
});

test('starting a fresh competition wipes the previous one', () => {
  const api = boot();
  perform(api, 0, 0);
  playPerfect(api);
  api.submitScore();
  assert(api.G.log.length === 1, 'one judged');
  api.startRun();
  assert(api.G.log.length === 0 && api.G.acc.length === 0, 'the book is clear again');
  assert(api.G.stage === 0 && api.G.idx === 0, 'back at the first choir of the first round');
  assert(api.G.field.length === api.totalChoirs(), 'a new field was drawn up');
});

test('rank bands cover the whole range and climb with the score', () => {
  const api = boot();
  for (let i = 1; i < api.RANKS.length; i++)
    assert(api.RANKS[i].min < api.RANKS[i - 1].min, 'ranks descend');
  assert(api.RANKS[api.RANKS.length - 1].min === 0, 'there is always a title');
  for (let v = 0; v <= 1.0001; v += 0.02){
    const r = api.rankFor(v);
    assert(r && r.name && r.line, 'no rank at ' + v.toFixed(2));
  }
  assert(api.rankFor(1).name !== api.rankFor(0).name, 'the top and bottom differ');
});

/* -------------------------------------------------------------- the dial */
test('the dial reads a point on the arc back as a score', () => {
  const api = boot();
  const d = api.dialGeom();
  assert(api.scoreFromPoint(d.cx, d.cy + 50) === null, 'below the arc is not a score');
  near(api.scoreFromPoint(d.cx - d.r, d.cy - 0.001), 8, 0.5, 'hard left is the bottom of the card');
  near(api.scoreFromPoint(d.cx + d.r, d.cy - 0.001), 30, 0.5, 'hard right is the top');
  near(api.scoreFromPoint(d.cx, d.cy - d.r), 19, 0.5, 'straight up is the middle');
  for (let a = Math.PI * 1.02; a < Math.PI * 1.98; a += 0.05){
    const s = api.scoreFromPoint(d.cx + Math.cos(a) * d.r, d.cy + Math.sin(a) * d.r);
    assert(s >= 8 && s <= 30, 'the arc never reads outside the card: ' + s);
  }
});

test('nudging the dial stays on the card and only works while deliberating', () => {
  const api = boot();
  perform(api, 0, 0);
  api.G.myScore = 25;
  api.nudgeScore(1);
  assert(api.G.myScore === 25, 'the dial is locked during the performance');
  playPerfect(api);
  api.G.myScore = 25;
  api.nudgeScore(0.5); near(api.G.myScore, 25.5, 1e-9, 'half a point');
  api.nudgeScore(-1);  near(api.G.myScore, 24.5, 1e-9, 'and a whole one back');
  for (let i = 0; i < 100; i++) api.nudgeScore(1);
  assert(api.G.myScore === 30, 'it stops at the top of the card');
  for (let i = 0; i < 200; i++) api.nudgeScore(-1);
  assert(api.G.myScore === 8, 'and at the bottom');
});

/* ------------------------------------------------------------------ input */
test('the number keys mark criteria only while a choir is singing', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  const f = c.flaws[0];
  step(api, f.at + 0.3);
  api.onKey({ key:f.def.key ? f.def.key : api.CRIT_BY_ID[f.def.crit].key, preventDefault(){} });
  assert(f.caught, 'the key press landed on the card');
  playPerfect(api);
  const before = api.G.myScore;
  api.onKey({ key:'1', preventDefault(){} });
  assert(api.G.myScore === before, 'a number key does nothing on the deliberation screen');
});

test('enter drives the whole flow forward from the title screen', () => {
  const api = boot();
  assert(api.G.phase === 'title');
  api.onKey({ key:'Enter', preventDefault(){} });
  assert(api.G.phase === 'parade', 'enter opens the parade');
  api.G.t = 2;
  api.onKey({ key:'Enter', preventDefault(){} });
  assert(api.G.phase === 'round', 'then the round card');
  api.onKey({ key:'Enter', preventDefault(){} });
  assert(api.G.phase === 'brief', 'then the choir brief');
  api.onKey({ key:'Enter', preventDefault(){} });
  assert(api.G.phase === 'perform', 'and the choir starts singing');
});

test('a click on a criterion tile marks it, a click elsewhere does not', () => {
  const api = boot();
  const c = perform(api, 0, 0);
  const f = c.flaws[0];
  step(api, f.at + 0.3);
  const i = api.CRITS.findIndex((x) => x.id === f.def.crit);
  const r = api.critRect(i);
  api.onPointer(r.x + r.w / 2, r.y + r.h / 2);
  assert(f.caught, 'tapping the tile marks the card');
  const phantomsBefore = api.G.perf.phantoms.length;
  api.onPointer(10, 10);
  assert(api.G.perf.phantoms.length === phantomsBefore, 'tapping the ceiling is not a mark');
});

test('mute toggles without an audio context and survives a frame', () => {
  const api = boot();
  api.toggleMute();
  assert(api.AUDIO.muted === true, 'muted');
  api.update(1 / 60);
  api.toggleMute();
  assert(api.AUDIO.muted === false, 'and back');
});

/* ------------------------------------------------------------------- save */
test('the best run is remembered and only ever improves', () => {
  const api = boot();
  api.G.acc = [1]; api.G.att = [1]; api.G.integ = [1];
  api.recordBest();
  const top = api.G.best.score;
  assert(top > 0.99, 'a perfect run is remembered');
  api.G.acc = [0.1]; api.G.att = [0.1]; api.G.integ = [0.1];
  api.recordBest();
  near(api.G.best.score, top, 1e-9, 'a worse run does not overwrite it');
  assert(api._store[api.SAVE_KEY], 'and it was written to storage');
});

test('a previous best is read back on the next visit', () => {
  const api = boot();
  api.G.acc = [0.8]; api.G.att = [0.8]; api.G.integ = [0.8];
  api.recordBest();
  const saved = api._store[api.SAVE_KEY];
  const api2 = boot({ store: { [api.SAVE_KEY]: saved } });
  assert(api2.G.best && api2.G.best.rank, 'the previous best came back');
  near(api2.G.best.score, 0.8, 1e-9, 'with the same score');
});

test('a corrupt save never blocks the door', () => {
  const api = boot({ store: { wcg_adjudicator_v1: '{{{not json' } });
  assert(api.G.phase === 'title', 'the game still opened');
  assert(api.G.best === null, 'and simply has no best on record');
});

/* ------------------------------------------------------------------ render */
test('every screen draws without throwing', () => {
  const api = boot();
  const phases = ['title', 'howto', 'parade', 'round', 'results'];
  for (const p of phases){
    api.setPhase(p);
    for (let i = 0; i < 4; i++){ api.update(0.2); api.draw(); }
  }
  assert(api._counts.fillRect > 0, 'something actually reached the canvas');
});

test('the performance draws in every round, at every point in the piece', () => {
  const api = boot();
  for (let s = 0; s < api.STAGES.length; s++){
    perform(api, s, 0);
    let guard = 0;
    while (api.G.phase === 'perform' && guard++ < 20000){
      api.update(STEP);
      if (guard % 7 === 0) api.draw();
    }
    api.draw();
  }
});

test('the deliberation, panel and results screens draw with a real card behind them', () => {
  const api = boot();
  perform(api, 0, 0);
  playPerfect(api);
  api.draw();                       // deliberate, with marks on the card
  api.submitScore();
  for (let i = 0; i < 30; i++){ api.update(0.05); api.draw(); }   // panel, mid-reveal
  api.nextChoir();
  api.G.stage = api.STAGES.length - 1;
  api.G.idx = 999;
  api.finishStage();
  assert(api.G.phase === 'results', 'jumped to the results book');
  api.draw();
});

test('an empty card and a maxed-out card both draw', () => {
  const api = boot();
  perform(api, 0, 0);
  let g = 0;
  while (api.G.phase === 'perform' && g++ < 20000) api.update(STEP);
  api.draw();                                   // nothing marked at all
  const api2 = boot();
  perform(api2, 2, 0);
  g = 0;
  while (api2.G.phase === 'perform' && g++ < 20000){
    api2.update(STEP);
    for (const cr of api2.CRITS) api2.flagCrit(cr.id);
  }
  api2.draw();                                  // a card buried in phantoms
  api2.submitScore();
  api2.draw();
});

test('the results book draws with every diploma band represented', () => {
  const api = boot();
  api.startRun();
  api.setPhase('round');
  let guard = 0;
  while (api.G.phase !== 'results' && guard++ < 60){
    if (api.G.phase === 'round') api.startChoir();
    else if (api.G.phase === 'brief') api.beginPerformance();
    else if (api.G.phase === 'perform'){
      let g = 0;
      while (api.G.phase === 'perform' && g++ < 20000) api.update(STEP);
    } else if (api.G.phase === 'deliberate'){
      // spread the scores so the book shows a range of bands
      api.G.myScore = 8 + (api.G.log.length * 4.5) % 22;
      api.submitScore();
    } else if (api.G.phase === 'panel') api.nextChoir();
    else break;
  }
  assert(api.G.phase === 'results');
  const bands = new Set(api.G.log.map((e) => e.band.id));
  assert(bands.size >= 2, 'the book should not be all one colour');
  api.draw();
});

test('every flag type in the country list renders', () => {
  const api = boot();
  api._resetCounts();
  const types = new Set(api.COUNTRIES.map((c) => c.t));
  for (const c of api.COUNTRIES) api.drawFlag(c, 0, 0, 40, 26);
  assert(types.size >= 5, 'the flag renderer handles several layouts');
  assert(api._counts.fillRect > 0, 'flags reached the canvas');
});

test('colour helpers survive both hex and rgb input', () => {
  const api = boot();
  assert(/^rgb\(/.test(api.mixHex('#ff0000', '#0000ff', 0.5)), 'mix returns an rgb string');
  assert(api.mixHex(api.mixHex('#ff0000', '#00ff00', 0.5), '#0000ff', 0.5).startsWith('rgb('),
    'a mixed colour can be mixed again');
  const c = api.hex2rgb('#abcdef');
  assert(c.length === 3 && c[0] === 0xab, 'long hex parses');
  assert(api.hex2rgb('#fff')[0] === 255, 'short hex parses');
});

test('resizing recomputes the canvas without disturbing the game', () => {
  const api = boot();
  perform(api, 0, 0);
  step(api, 2);
  const t = api.G.perf.t;
  api.fit();
  api.draw();
  near(api.G.perf.t, t, 1e-9, 'the performance carried on regardless');
});

/* ------------------------------------------------------------------ report */
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
