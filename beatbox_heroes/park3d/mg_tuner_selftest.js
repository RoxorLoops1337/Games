// Headless self test for the tuner rules (no browser, no THREE):  node beatbox_heroes/park3d/mg_tuner_selftest.js
// The 3D layer is exercised in the page with window.__park.game (start / feedPitch / tick / state / result), see mg_tuner.js.
import { createLogic, mf, foldCents, quality, RANGES } from './mg_tuner_logic.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function playMic(sing) { // sing(S) -> hz or 0
  const events = []; const L = createLogic({ rng, hooks: { hit: () => events.push('hit'), miss: () => events.push('miss'), tone: () => events.push('tone') } }); L.start({ mode: 'mic', range: 'higher' });
  for (let i = 0; i < 20000 && L.S.state === 'play'; i++) { const hz = sing(L.S); L.update(1 / 30, hz > 0 ? { freq: hz, clarity: 0.9 } : null); }
  return { L, events };
}
// 1) a perfect singer wins every note
let r = playMic((S) => (S.phase === 'sing' ? mf(S.target) : 0));
ok(r.L.S.state === 'done' && r.L.S.score === 8, 'perfect singer scores 8/8');
const res = r.L.S.result; ok(res.grade === 'S' && res.rounds === 8 && res.mode === 'Singing' && res.q > 0.85 && res.q <= 1, 'result fields sane ' + JSON.stringify({ g: res.grade, q: res.q, inTuneMs: res.inTuneMs, streak: res.bestStreak }));
ok(res.bestStreak === 8 && res.log.length === 8 && res.a.t === 'tune' && res.musGain > 0, 'streak, log, Core action and musicality gain present');
ok(r.events.filter((e) => e === 'tone').length === 8, 'reference tone played once per round');
// 2) silence misses everything (5 s timeout each)
r = playMic(() => 0); ok(r.L.S.score === 0 && r.L.S.result.grade === 'D' && r.L.S.result.q === 0, 'silence scores 0');
// 3) octave folding: singing one octave up or down is still in tune
r = playMic((S) => (S.phase === 'sing' ? mf(S.target + 12) : 0)); ok(r.L.S.score === 8, 'octave up counts as in tune');
ok(Math.abs(foldCents(mf(60) * 2, 60)) < 1e-6 && Math.abs(foldCents(mf(60) / 2, 60)) < 1e-6, 'foldCents octave');
// 4) 70 cents sharp never scores, 30 cents sharp always does
r = playMic((S) => (S.phase === 'sing' ? mf(S.target + 0.7) : 0)); ok(r.L.S.score === 0, '70 cents sharp misses');
r = playMic((S) => (S.phase === 'sing' ? mf(S.target + 0.3) : 0)); ok(r.L.S.score === 8, '30 cents sharp passes');
// 5) hold drains at half speed off pitch: 0.5 s in, 0.5 s out leaves 0.25
{ const L = createLogic({ rng }); L.start({ mode: 'mic' }); for (let i = 0; i < 45; i++) L.update(1 / 30, null); ok(L.S.phase === 'sing', 'reaches sing after 1.3 s'); for (let i = 0; i < 15; i++) L.update(1 / 30, { freq: mf(L.S.target), clarity: 0.9 }); const h1 = L.S.hold; for (let i = 0; i < 15; i++) L.update(1 / 30, { freq: mf(L.S.target + 1), clarity: 0.9 }); ok(Math.abs(h1 - 0.5) < 0.05 && Math.abs(L.S.hold - 0.25) < 0.05, 'hold builds 1:1 and drains 1:2 (' + h1.toFixed(2) + ' -> ' + L.S.hold.toFixed(2) + ')'); }
// 6) low clarity is ignored like 2D
{ const L = createLogic({ rng }); L.start({ mode: 'mic' }); for (let i = 0; i < 45; i++) L.update(1 / 30, null); L.update(1 / 30, { freq: mf(L.S.target), clarity: 0.3 }); ok(L.S.cents === null && L.S.hold === 0, 'clarity under 0.55 ignored'); }
// 7) ear training: always right = 8/8 and q 0.7, always wrong = 0
function playEar(right) { const L = createLogic({ rng }); L.start({ mode: 'ear' }); for (let i = 0; i < 5000 && L.S.state === 'play'; i++) { L.update(1 / 30, null); if (L.S.phase === 'ask') { const dir = Math.sign(L.S.earB - L.S.earA); L.answer(right ? dir : -dir); } } return L; }
let e = playEar(true); ok(e.S.score === 8 && Math.abs(e.S.result.q - 0.7) < 1e-9 && e.S.result.mode === 'Ear training', 'ear training perfect: 8/8, q 0.7');
e = playEar(false); ok(e.S.score === 0 && e.S.result.q === 0, 'ear training all wrong: 0');
{ const L = createLogic({ rng }); L.start({ mode: 'ear' }); ok(L.answer(1) === false, 'answers ignored before the ask phase'); }
// 8) ranges and q formula match the 2D numbers
ok(RANGES.higher.roots.join() === '60,62,64,65,67,69,71,72' && RANGES.lower.roots.join() === '48,50,52,53,55,57,59,60', 'RANGES identical to 2D');
ok(Math.abs(quality('mic', 4, 8, 12) - Math.min(1, 0.5 * 0.85 + Math.min(0.15, 12000 / 24000 * 0.15))) < 1e-9, 'quality formula identical to 2D');
console.log(fails ? fails + ' FAILED' : 'all tuner logic tests passed'); if (fails) process.exitCode = 1;
