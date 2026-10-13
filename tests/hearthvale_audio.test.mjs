// Hearthvale audio: pure logic only (no Web Audio in Node): note maths, scales, rng, voice limiter, catalogue shape.
import assert from 'node:assert/strict';
import { midiToFreq, noteToMidi, noteFreq, scaleNote, foldMidi, mulberry32, pickWeighted, VoiceLimiter, softClipCurve, CATALOGUE, CATEGORIES, TARGETS, ALIASES, SCALES } from '../hearthvale/js/sfx.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const near = (a, b, e, m) => { assert.ok(Math.abs(a - b) <= e, `${m}: ${a} vs ${b}`); n++; };

// notes
near(midiToFreq(69), 440, 1e-9, 'A4'); near(midiToFreq(60), 261.6256, 1e-3, 'C4'); ok(noteToMidi('C4') === 60 && noteToMidi('A4') === 69 && noteToMidi('C#5') === 73 && noteToMidi('Bb3') === 58, 'note names');
ok(Number.isNaN(noteToMidi('H9')), 'invalid note'); near(noteFreq('A5'), 880, 1e-9, 'A5');
// scales
ok(scaleNote(60, 'majPent', 0) === 60 && scaleNote(60, 'majPent', 4) === 69 && scaleNote(60, 'majPent', 5) === 72 && scaleNote(60, 'majPent', -1) === 57 && scaleNote(60, 'majPent', -5) === 48, 'pentatonic degrees wrap octaves');
ok(scaleNote(60, 'lydian', 3) === 66, 'lydian #4'); ok(scaleNote(60, [0, 4, 7], 4) === 76, 'custom scale array');
for (const k in SCALES) ok(SCALES[k].every((v, i, a) => i === 0 || v > a[i - 1]), k + ' ascending');
ok(foldMidi(60, 43) === 48 && foldMidi(43, 43) === 43 && foldMidi(54, 43) === 54 && foldMidi(30, 43) === 54, 'foldMidi keeps pitch class within an octave window');
// rng determinism and range
const a = mulberry32(5), b = mulberry32(5); let same = true, lo = 1, hi = 0; for (let i = 0; i < 1000; i++) { const x = a(); if (x !== b()) same = false; lo = Math.min(lo, x); hi = Math.max(hi, x); }
ok(same, 'seeded rng repeats'); ok(lo >= 0 && hi < 1 && hi - lo > 0.9, 'rng range'); ok(mulberry32(1)() !== mulberry32(2)(), 'seeds differ');
ok(pickWeighted([['a', 1], ['b', 0]], 0.99) === 'a' && pickWeighted([['a', 0], ['b', 1]], 0.0) === 'b' && pickWeighted([['a', 1], ['b', 1]], 0.75) === 'b', 'weighted pick');
// voice limiter
{
  const L = new VoiceLimiter(3);
  const s0 = L.request(0, 2, 0.5), s1 = L.request(0, 2, 0.8), s2 = L.request(0, 2, 0.3);
  ok(new Set([s0, s1, s2]).size === 3 && [s0, s1, s2].every((s) => s >= 0) && L.evicted === -1, 'fills free slots');
  ok(L.request(0.1, 2, 0.1) === -1, 'quieter than everything: dropped');
  const s3 = L.request(0.1, 2, 0.9); ok(s3 === s2 && L.evicted === s2, 'louder voice evicts the quietest');
  ok(L.request(2.5, 4, 0.2) >= 0 && L.evicted === -1, 'finished voices free their slots'); ok(L.count === 1, 'count after purge');
  // a nearly finished loud voice is a cheaper victim than a fresh quiet one
  const M = new VoiceLimiter(2); const f = M.request(0, 10, 0.5); M.request(0, 1, 0.5);
  const g = M.request(0.98, 5, 0.4); ok(g >= 0 && M.evicted >= 0 && M.evicted !== f, 'prefers evicting voices that are almost over');
  const P = new VoiceLimiter(24); let drop = 0, ev = 0; for (let i = 0; i < 500; i++) { const s = P.request(i * 0.002, i * 0.002 + 1.5, Math.random()); if (s < 0) drop++; else if (P.evicted >= 0) ev++; ok(P.count <= 24, 'never more than max'); }
  ok(drop > 0 && ev > 0, 'stress: drops and evicts instead of growing');
}
// soft clip
{ const c = softClipCurve(2048, 0.8, 0.97); ok(c.length === 2048, 'curve size'); let m = 0; for (const v of c) m = Math.max(m, Math.abs(v)); ok(m <= 0.97 + 1e-6, 'curve never exceeds ceiling'); ok(c.every((v, i) => i === 0 || v >= c[i - 1]), 'curve monotonic'); near(c[1024], 0, 2e-3, 'curve passes through zero'); }
// catalogue shape
{
  const names = Object.keys(CATALOGUE); ok(names.length >= 60, 'at least 60 sounds, got ' + names.length);
  for (const nm of names) { const s = CATALOGUE[nm]; ok(typeof s.fn === 'function' && CATEGORIES.includes(s.cat) && s.max >= 1 && s.cd >= 0 && s.pv > 0 && s.pv < 0.3 && s.rev >= 0 && s.rev <= 1, 'spec ' + nm); }
  for (const c of CATEGORIES) ok(typeof TARGETS[c] === 'number', 'target ' + c);
  for (const [o, t] of Object.entries(ALIASES)) ok(CATALOGUE[t], 'alias ' + o + ' -> ' + t);
  const need = 'tap tap2 back open close tab toggle confirm deny hover coin coins cashRegister sell buy unlock reward giftReceived giftSent place build buildDone upgrade demolish hammer sawing chop mine dig harvest sow water fishCast fishCatch gather craft cook bake stir pour research levelUp questComplete achievement orderComplete projectStage streak daily festivalStart merchantArrive visitorArrive hire hungry eat cheer giggle cluck moo baa woof meow quack ribbit buzz oink birdChirp windChime bellRing splash toast warn error'.split(' ');
  for (const nm of need) ok(CATALOGUE[nm], 'required sound ' + nm); ok(!JSON.stringify(names).includes(String.fromCharCode(0x2014)), 'no em dash');
}
console.log('hearthvale audio logic: ' + n + ' assertions ok');
