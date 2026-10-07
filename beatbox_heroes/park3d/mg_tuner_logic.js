// TUNER LOGIC (Tuner Artist): the rules of the 2D PITCH TUNER (beatbox_heroes/minigames.js) as a pure state machine, no THREE and no DOM.
// Same numbers as 2D: 8 rounds, MIC mode = hear the note (1.3 s), sing it (5 s max), in tune = within 50 cents, 0.9 s of hold wins a note
// (hold drains at half speed while off pitch); EAR mode = two notes, was the second HIGHER or LOWER. Quality q feeds the Musicality gain (Core 'tune').
// The 3D layer reads state() every frame; hooks are called when something happens (tone, sfx, round, hit, miss, done).
export const RANGES = {
  higher: { name: 'HIGHER VOICE', desc: 'Soprano, alto, kids', roots: [60, 62, 64, 65, 67, 69, 71, 72] },
  lower: { name: 'LOWER VOICE', desc: 'Tenor, baritone, bass', roots: [48, 50, 52, 53, 55, 57, 59, 60] },
};
export const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const midiName = (m) => NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);
// signed cents of freq against the target note, octave folded to -600..+600 (a singer an octave up or down is still in tune, like 2D)
export function foldCents(freq, target) { const d = (hzToMidi(freq) - target) * 100; return ((d + 600) % 1200 + 1200) % 1200 - 600; }
export const IN_TUNE_CENTS = 50, HOLD_NEED = 0.9, REF_TIME = 1.3, SING_TIME = 5, FB_HIT = 0.9, FB_MISS = 0.8, CLARITY_MIN = 0.55;
export function quality(mode, score, rounds, inTuneSec) { const acc = score / rounds; return mode === 'mic' ? Math.min(1, acc * 0.85 + Math.min(0.15, (inTuneSec * 1000) / (rounds * 3000) * 0.15)) : acc * 0.7; }
export function gradeOf(acc) { return acc >= 0.95 ? 'S' : acc >= 0.8 ? 'A' : acc >= 0.6 ? 'B' : acc >= 0.4 ? 'C' : 'D'; }
export const musicalityGain = (q, mus) => (0.4 + 1.3 * q) * (1 - (mus || 0) / 120) * 1.1; // Core.js case 'tune'

export function createLogic(opts) {
  opts = opts || {}; const rnd = opts.rng || Math.random, H = opts.hooks || {}, call = (k, a, b) => { try { H[k] && H[k](a, b); } catch (e) { /* hooks must never break the rules */ } };
  const S = { state: 'idle', mode: null, range: 'higher', round: 0, rounds: opts.rounds || 8, score: 0, total: 0, inTune: 0, phase: 'idle', rt: 0, hold: 0, cents: null, freq: 0, target: 60, earA: 55, earB: 57, fb: null, fbOk: null, streak: 0, bestStreak: 0, targets: [], pairs: [], log: [], bestAbs: 999, got: false, answered: null, done: false };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  function plan() {
    S.targets = []; S.pairs = []; const roots = RANGES[S.range].roots;
    for (let i = 0; i < S.rounds; i++) {
      S.targets.push(pick(roots));
      const base = 55 + Math.floor(rnd() * 12), diff = pick([1, 2, 3, 5, 7]) * (rnd() < 0.5 ? 1 : -1); S.pairs.push([base, base + diff]);
    }
  }
  function start(o) {
    o = o || {}; S.mode = o.mode === 'ear' ? 'ear' : 'mic'; S.range = o.range === 'lower' ? 'lower' : 'higher'; S.round = 0; S.score = 0; S.total = 0; S.inTune = 0; S.streak = 0; S.bestStreak = 0; S.log = []; S.done = false; S.state = 'play'; S.fb = null;
    plan(); next();
  }
  function next() {
    if (S.round >= S.rounds) { finish(); return; }
    S.round++; S.hold = 0; S.rt = 0; S.got = false; S.cents = null; S.fb = null; S.fbOk = null; S.answered = null; S.bestAbs = 999;
    if (S.mode === 'mic') { S.target = S.targets[S.round - 1]; S.phase = 'ref'; call('tone', mf(S.target), 1.1); }
    else { S.earA = S.pairs[S.round - 1][0]; S.earB = S.pairs[S.round - 1][1]; S.phase = 'earA'; call('tone', mf(S.earA), 0.7); }
    call('round', S.round);
  }
  function feedback(ok, txt, t) { S.phase = 'fb'; S.rt = 0; S.fb = txt; S.fbOk = ok; S.fbDur = t; }
  function record(ok, extra) { S.log.push(Object.assign({ round: S.round, ok, target: S.mode === 'mic' ? S.target : S.earB, bestAbs: S.bestAbs < 999 ? Math.round(S.bestAbs) : null }, extra || {})); if (ok) { S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak); } else S.streak = 0; }
  function update(dt, pitch) {
    if (S.state !== 'play') return; S.rt += dt;
    if (S.phase === 'fb') { if (S.rt >= S.fbDur) next(); return; }
    if (S.mode === 'ear') {
      if (S.phase === 'earA' && S.rt >= 0.9) { S.phase = 'earB'; call('tone', mf(S.earB), 0.7); }
      else if (S.phase === 'earB' && S.rt >= 1.7) { S.phase = 'ask'; call('ask'); }
      return;
    }
    if (S.phase === 'ref') { if (S.rt >= REF_TIME) { S.phase = 'sing'; S.rt = 0; call('sing'); } return; }
    if (S.phase !== 'sing') return;
    if (pitch && pitch.freq > 0 && pitch.clarity > CLARITY_MIN) {
      S.freq = pitch.freq; S.cents = foldCents(pitch.freq, S.target); S.bestAbs = Math.min(S.bestAbs, Math.abs(S.cents));
      if (Math.abs(S.cents) < IN_TUNE_CENTS) { S.hold += dt; S.inTune += dt; } else S.hold = Math.max(0, S.hold - dt * 0.5);
    } else S.cents = null;
    if (S.hold >= HOLD_NEED && !S.got) { S.got = true; S.score++; S.total++; record(true, { time: +S.rt.toFixed(2) }); feedback(true, 'IN TUNE!', FB_HIT); call('hit', S.target); }
    else if (S.rt > SING_TIME && !S.got) { S.total++; record(false, { time: SING_TIME }); feedback(false, 'MISSED', FB_MISS); call('miss'); }
  }
  // ear mode answer: dir 1 = HIGHER, -1 = LOWER. Returns true when it was accepted.
  function answer(dir) {
    if (S.state !== 'play' || S.mode !== 'ear' || S.phase !== 'ask') return false;
    const ok = Math.sign(S.earB - S.earA) === dir; S.total++; S.answered = dir; record(ok, { diff: S.earB - S.earA });
    if (ok) { S.score++; feedback(true, 'RIGHT!', FB_MISS); call('hit', S.earB); } else { feedback(false, 'WRONG', FB_MISS); call('miss'); }
    return true;
  }
  function finish() {
    if (S.done) return; S.done = true; S.state = 'done'; S.phase = 'done';
    const acc = S.score / S.rounds, q = quality(S.mode, S.score, S.rounds, S.inTune);
    S.result = { game: 'tuner', score: S.score, rounds: S.rounds, hits: S.score, total: S.total, mode: S.mode === 'mic' ? 'Singing' : 'Ear training', modeId: S.mode, range: S.range, accuracy: +acc.toFixed(3), quality: +q.toFixed(3), q: +q.toFixed(3), qualityPct: Math.round(q * 100), inTuneMs: Math.round(S.inTune * 1000), bestStreak: S.bestStreak, grade: gradeOf(acc), a: { t: 'tune', q: +q.toFixed(3) }, musGain: +musicalityGain(q, opts.mus || 0).toFixed(2), log: S.log.slice() };
    call('done', S.result);
  }
  return { S, start, update, answer, finish, next };
}
