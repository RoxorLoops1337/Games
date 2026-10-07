// EAR TRAINING LOGIC (TRAIN): the rules of the ear game as a pure state machine, no THREE and no DOM. Levels and questions come from Core
// (Core.EAR_LEVELS, Core.earQuestion); a small copy of the level list below keeps the dev pages working without the game.
//   createEarLogic({ level, levels?, question?, rng?, hooks }) -> { S, start(), answer(choice), replay(), next(), update(dt), result() }
//   phases: 'lesson' (the lesson card, nothing runs) -> 'listen' (the notes play) -> 'ask' (answer buttons) -> 'fb' (right / wrong + why) -> next round ... -> state 'done'
//   hooks: play(question) -> seconds the notes take, right(q), wrong(q), round(n), done(result)
//   result: { game:'ear', level, levelId, name, score, rounds, q, pass (q >= 0.7), grade, bestStreak, log:[{ok, answer, picked}] }
export const PASS_Q = 0.7;
export const FALLBACK_LEVELS = [
  { level: 1, id: 'updown', name: 'Up or Down', ask: 'Did the second note go higher or lower?', rounds: 6, choices: ['higher', 'lower'], lesson: { title: 'High and low', text: 'You will hear two notes. Does the second one climb up, or step down?', examples: [{ label: 'Going up', notes: [60, 67] }, { label: 'Going down', notes: [67, 60] }] } },
  { level: 2, id: 'same', name: 'Same or Different', ask: 'Were the two notes the same or different?', rounds: 6, choices: ['same', 'different'], lesson: { title: 'Twins or strangers', text: 'Sometimes the two notes are exactly the same. Sometimes they move a tiny bit.', examples: [{ label: 'Same', notes: [60, 60] }, { label: 'Different', notes: [60, 62] }] } },
  { level: 3, id: 'stepleap', name: 'Step or Leap', ask: 'Was that a small step or a big leap?', rounds: 8, choices: ['step', 'leap'], lesson: { title: 'Walking and jumping', text: 'A step moves to the very next note. A leap jumps over notes.', examples: [{ label: 'Step', notes: [64, 62] }, { label: 'Leap', notes: [60, 72] }] } },
  { level: 4, id: 'majmin', name: 'Happy or Sad Chord', ask: 'Did the chord sound happy (major) or sad (minor)?', rounds: 8, choices: ['major', 'minor'], lesson: { title: 'Chords have moods', text: 'A major chord sounds bright and happy. A minor chord sounds sad.', examples: [{ label: 'Major', notes: [60, 64, 67], chord: true }, { label: 'Minor', notes: [60, 63, 67], chord: true }] } },
  { level: 5, id: 'octfifth', name: 'Octave or Fifth', ask: 'Was that jump an octave or a fifth?', rounds: 8, choices: ['octave', 'fifth'], lesson: { title: 'Two famous jumps', text: 'An octave is the same note, higher. A fifth is a strong open jump.', examples: [{ label: 'Octave', notes: [60, 72] }, { label: 'Fifth', notes: [60, 67] }] } },
  { level: 6, id: 'thirds', name: 'Bright or Dark Third', ask: 'Was that a major third (bright) or a minor third (dark)?', rounds: 10, choices: ['major 3rd', 'minor 3rd'], lesson: { title: 'The mood maker', text: 'A major third sounds bright, a minor third sounds darker.', examples: [{ label: 'Major 3rd', notes: [60, 64] }, { label: 'Minor 3rd', notes: [60, 63] }] } },
  { level: 7, id: 'fourfifth', name: 'Fourth or Fifth', ask: 'Was that a fourth or a fifth?', rounds: 10, choices: ['4th', '5th'], lesson: { title: 'Wedding or stars', text: 'A fourth is "Here Comes the Bride". A fifth is "Twinkle Twinkle".', examples: [{ label: 'Fourth', notes: [60, 65] }, { label: 'Fifth', notes: [60, 67] }] } },
  { level: 8, id: 'name', name: 'Name That Jump', ask: 'Which jump was that?', rounds: 12, choices: ['minor 3rd', 'major 3rd', '4th', '5th', 'octave'], lesson: { title: 'Your song toolbox', text: 'Match each jump to its song.', examples: [{ label: 'Minor 3rd', notes: [60, 63] }, { label: 'Octave', notes: [60, 72] }] } },
];
const SEMIS = { 'minor 3rd': 3, 'major 3rd': 4, '4th': 5, '5th': 7, fifth: 7, octave: 12 };
// same rules as Core.earQuestion (used only when Core is not loaded)
export function fallbackQuestion(L, rng) {
  const answer = L.choices[Math.floor(rng() * L.choices.length)], root = 55 + Math.floor(rng() * 10);
  switch (L.id) {
    case 'updown': { const d = 2 + Math.floor(rng() * 6); return { notes: answer === 'higher' ? [root, root + d] : [root + d, root], chord: false, answer }; }
    case 'same': return { notes: [root, answer === 'same' ? root : root + (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 3))], chord: false, answer };
    case 'stepleap': { const d = answer === 'step' ? 1 + Math.floor(rng() * 2) : 5 + Math.floor(rng() * 8), up = rng() < 0.5; return { notes: up ? [root, root + d] : [root + d, root], chord: false, answer }; }
    case 'majmin': return { notes: [root, root + (answer === 'major' ? 4 : 3), root + 7], chord: true, answer };
    default: return { notes: [root, root + SEMIS[answer]], chord: false, answer };
  }
}

// one short, friendly line on WHY the answer is what it is (shown after every answer)
const WHY = {
  higher: 'The second note climbed UP, like a step upstairs.',
  lower: 'The second note stepped DOWN, like going downstairs.',
  same: 'Both notes were exactly the same. Twins!',
  different: 'The second note moved, even if only a tiny bit.',
  step: 'A step: the very next note, smooth like walking.',
  leap: 'A leap: it jumped over notes, a little surprise.',
  major: 'Major: bright and happy, like a birthday party.',
  minor: 'Minor: sad or mysterious, like a rainy movie scene.',
  octave: 'Octave: the same note again, just higher. "Some-where".',
  fifth: 'Fifth: a strong open jump. "Twin-kle, twin-kle".',
  'major 3rd': 'Major 3rd: bright and happy. "Oh when the Saints".',
  'minor 3rd': 'Minor 3rd: darker, a bit sad. "Smoke on the Water".',
  '4th': '4th: "Here comes the bride". It calls out like a question.',
  '5th': '5th: "Twinkle, twinkle". Wider and more open.',
};
export const why = (answer) => WHY[answer] || ('It was: ' + String(answer).toUpperCase() + '.');
export const label = (c) => String(c).toUpperCase();
export function gradeOf(acc) { return acc >= 0.95 ? 'S' : acc >= 0.8 ? 'A' : acc >= 0.6 ? 'B' : acc >= 0.4 ? 'C' : 'D'; }
export const LISTEN_MIN = 0.4, FB_RIGHT = 1.5, FB_WRONG = 3.2;

export function createEarLogic(opts) {
  opts = opts || {}; const rnd = opts.rng || Math.random, H = opts.hooks || {};
  const call = (k, a) => { try { return H[k] ? H[k](a) : undefined; } catch (e) { return undefined; } };
  const levels = opts.levels && opts.levels.length ? opts.levels : FALLBACK_LEVELS;
  const L = levels[Math.max(0, Math.min(levels.length - 1, (opts.level | 0) - 1))] || levels[0];
  const ask = opts.question || ((lv) => fallbackQuestion(L, rnd));
  const S = { state: 'lesson', phase: 'lesson', level: L.level, levelId: L.id, name: L.name, ask: L.ask, choices: L.choices.slice(), rounds: L.rounds || 8, round: 0, score: 0, streak: 0, bestStreak: 0, q: null, picked: null, ok: null, t: 0, wait: 0, log: [], plays: 0, done: false };
  let result = null;
  function playNow() { S.plays++; const d = +call('play', S.q); S.wait = Math.max(LISTEN_MIN, isFinite(d) && d > 0 ? d : 1.4); S.phase = 'listen'; S.t = 0; }
  function start() { S.state = 'play'; S.round = 0; S.score = 0; S.streak = 0; S.bestStreak = 0; S.log = []; S.done = false; result = null; next(); }
  function next() {
    if (S.state !== 'play') return;
    if (S.round >= S.rounds) { finish(); return; }
    S.round++; S.picked = null; S.ok = null; S.plays = 0;
    let q = null; try { q = ask(L.level, rnd); } catch (e) { q = null; } if (!q || !q.notes) q = fallbackQuestion(L, rnd);
    S.q = q; call('round', S.round); playNow();
  }
  // LISTEN: replay the same question (any time before answering, and on the feedback card to hear it again)
  function replay() { if (S.state !== 'play' || !S.q) return false; const ph = S.phase; S.plays++; const d = +call('play', S.q); if (ph === 'listen' || ph === 'ask') { S.phase = 'listen'; S.t = 0; S.wait = Math.max(LISTEN_MIN, isFinite(d) && d > 0 ? d : 1.4); } else S.t = Math.min(S.t, 0.2); return true; }
  // answering is allowed while the notes still play (impatient players), never twice
  function answer(choice) {
    if (S.state !== 'play' || (S.phase !== 'ask' && S.phase !== 'listen') || !S.q) return null;
    if (typeof choice === 'number') choice = S.choices[choice];
    const ok = choice === S.q.answer; S.picked = choice; S.ok = ok; S.phase = 'fb'; S.t = 0; S.wait = ok ? FB_RIGHT : FB_WRONG;
    S.log.push({ ok, answer: S.q.answer, picked: choice });
    if (ok) { S.score++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak); call('right', S.q); } else { S.streak = 0; call('wrong', S.q); }
    return ok;
  }
  function finish() {
    S.state = 'done'; S.phase = 'done'; S.done = true; const q = S.score / S.rounds;
    result = { game: 'ear', level: L.level, levelId: L.id, name: L.name, score: S.score, rounds: S.rounds, q: Math.round(q * 1000) / 1000, accuracy: q, pass: q >= PASS_Q, grade: gradeOf(q), bestStreak: S.bestStreak, log: S.log.slice() };
    call('done', result);
  }
  function update(dt) {
    if (S.state !== 'play') return; S.t += dt;
    if (S.phase === 'listen' && S.t >= S.wait) { S.phase = 'ask'; S.t = 0; }
    else if (S.phase === 'fb' && S.t >= S.wait) next();
  }
  return { S, L, start, answer, replay, next, update, result: () => result, skip() { if (S.phase === 'fb') next(); } };
}
