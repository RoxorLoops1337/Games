// The game's songs: genre fingerprints (techno, hip hop, trip hop, drum and bass) and the player's recorded sounds inside them.
import { ok, eq, near, between, done, load } from './beatbox_heroes_lib.mjs';
import * as R from '../tools/beatbox_heroes/audio_render.mjs';

const BBH = load('audio');
const AF = BBH.AudioFactory;
const fakeRig = () => {
  const ctx = new R.FakeContext();
  const A = AF.create(() => ctx, { log: true, manual: true });
  const step = (secs) => { const end = ctx.currentTime + secs; while (ctx.currentTime < end - 1e-9) { A._tick(); ctx.currentTime += 0.025; } };
  return { ctx, A, step };
};
const drums = (C, key) => C.events.filter((e) => e.k === 'd' && e.d === key);
const hard = (arr) => arr.filter((e) => e.v >= 0.7);                  // ghost notes (velocity 0.5) are not the backbeat
const frac = (arr, pred) => (arr.length ? arr.filter(pred).length / arr.length : 0);
const onBeat = (e) => Math.abs(e.b - Math.round(e.b)) < 1e-6;
const inBar = (e) => ((e.b % 4) + 4) % 4;

/* ---------------------------------------------------------------- genre fingerprints */
const GENRE = {
  title: { g: 'techno', bpm: [120, 130] }, studio: { g: 'techno', bpm: [118, 130] },
  street: { g: 'hiphop', bpm: [84, 100] }, park: { g: 'hiphop', bpm: [90, 100] }, shop: { g: 'hiphop', bpm: [90, 104] },
  home: { g: 'trip', bpm: [70, 88] }, bar: { g: 'trip', bpm: [80, 94] }, creator: { g: 'trip', bpm: [78, 90] },
  battle: { g: 'dnb', bpm: [168, 176] },
};
for (const id in GENRE) {
  const { g, bpm } = GENRE[id], C = AF.compose(id), k = drums(C, 'k'), sn = drums(C, 's');
  between(C.bpm, bpm[0], bpm[1], id + ' (' + g + ') tempo');
  ok(k.length > 20, id + ' has kicks');
  if (g === 'techno') {
    ok(frac(k, onBeat) > 0.95, id + ': four on the floor, every kick lands on a beat (' + (100 * frac(k, onBeat)).toFixed(0) + '%)');
    ok(drums(C, 'o').length > 20 && frac(drums(C, 'o'), (e) => Math.abs(inBar(e) % 1 - 0.5) < 1e-6) > 0.95, id + ': open hats on the off beats');
    ok(k.length >= C.beats * 0.4, id + ': a kick on (nearly) every beat of the drum sections');
  }
  if (g === 'hiphop') {
    ok(sn.length > 10 && frac(sn, (e) => inBar(e) === 1 || inBar(e) === 3 || Math.abs(inBar(e) % 1) > 0) > 0.9, id + ': snare on the backbeat (2 and 4) with ghost notes between');
    ok(frac(hard(sn), (e) => inBar(e) === 1 || inBar(e) === 3) > 0.55, id + ': most hard snares are the 2 and 4 hits');
    ok(frac(k, onBeat) < 0.85, id + ': the kick syncopates, it is not four on the floor');
  }
  if (g === 'trip') ok(drums(C, 's').length + drums(C, 'r').length > 10, id + ': a heavy snare or rim carries the slow beat');
  if (g === 'dnb') {
    ok(frac(hard(sn), (e) => inBar(e) === 1 || inBar(e) === 3 || inBar(e) >= 3.25) > 0.8 && frac(hard(sn), (e) => inBar(e) === 1 || inBar(e) === 3) > 0.6, id + ': two-step, hard snares on 2 and 4 (fills aside)');
    ok(frac(k, (e) => inBar(e) === 0 || Math.abs(inBar(e) - 2.5) < 1e-6 || Math.abs(inBar(e) - 3.5) < 1e-6) > 0.9, id + ': kick on 1 and the "and" of 3 (and the late pickup)');
    ok(C.events.some((e) => e.k === 'bass') && AF.compose(id).recipe.v.bass === 'reese', id + ': reese bass');
  }
}
{
  /* every loop is still long and a whole number of bars, and every sound id used by a vox layer is a real pitched sound */
  for (const id of AF.MUSIC_IDS) {
    const C = AF.compose(id), R0 = C.recipe;
    if (C.loop) ok(C.beats % 4 === 0 && C.beats * 60 / C.bpm > 40, id + ' loop length (' + (C.beats * 60 / C.bpm).toFixed(0) + ' s)');
    const vox = C.events.filter((e) => e.k === 'vox');
    if (R0.vox) { ok(vox.length > 8, id + ' has pitched vocal stabs'); ok(['LR', 'HUM', 'TB'].includes(R0.vox.w), id + ' vox sound is LR, HUM or TB'); ok(vox.every((e) => e.n >= 30 && e.n <= 80), id + ' vox notes sit in a singable range'); }
  }
}

/* ---------------------------------------------------------------- a recording in the songs */
const tone = (f, secs, rate = 44100, amp = 0.6) => { const x = new Float32Array(Math.round(secs * rate)); for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin(2 * Math.PI * f * i / rate) * Math.min(1, i / 200); return x; };
const click = (secs = 0.1, rate = 44100) => { const x = new Float32Array(Math.round(secs * rate)); for (let i = 0; i < x.length; i++) x[i] = (((i * 7919) % 200) / 100 - 1) * 0.5 * Math.exp(-i / (0.02 * rate)); return x; };
{
  const base = fakeRig(); base.A.unlock(); base.A.music.play('street'); base.step(24);
  eq(base.A.log.filter((e) => e.music).length, 0, 'no recordings: the songs play with the synth kit only');
  ok(base.A.log.filter((e) => e.k === 'note' && e.kind === 'd').length > 20, 'no recordings: drums still play');
}
{
  const { A, step } = fakeRig(); A.unlock();
  A.setSample('B', tone(60, 0.3), 44100); A.setSample('t', click(), 44100); A.setSample('K', click(0.15), 44100); A.setSample('Pf', click(0.12), 44100);
  A.music.play('street'); step(24);
  const smp = A.log.filter((e) => e.music && e.sample);
  const by = (id) => smp.filter((e) => e.id === id).length;
  ok(by('B') > 4 && by('t') > 8 && by('K') > 3, 'a song plays the recorded kick, hat and snare (B ' + by('B') + ', t ' + by('t') + ', K ' + by('K') + ')');
  const notesD = A.log.filter((e) => e.k === 'note' && e.kind === 'd').length;
  ok(smp.filter((e) => ['B', 't', 'K', 'Pf'].includes(e.id)).length >= notesD * 0.8, 'nearly every drum hit of the song is one of your recordings (' + smp.length + ' of ' + notesD + ')');
  ok(smp.every((e) => e.vel > 0 && e.vel <= 1.2), 'recorded hits keep sane levels');
  A.music.stop(0.1); step(1);
  const before = A.log.filter((e) => e.music).length;
  A.groove.start({ bpm: 100, style: 0, bars: 4 }); step(6);
  eq(A.log.filter((e) => e.music).length, before, 'the rhythm game backing groove never uses the recordings (your own hits stay distinct)');
  A.groove.stop();
}
{
  /* a recorded throat bass is pitched to every bass note of the song */
  const { A, step } = fakeRig(); A.unlock();
  A.setSample('TB', tone(55, 1.0), 44100);
  A.music.play('street'); step(24);
  const notes = A.log.filter((e) => e.k === 'note' && e.kind === 'bass'), tb = A.log.filter((e) => e.music && e.id === 'TB');
  ok(tb.length > 8 && tb.length === notes.length, 'every bass note plays the throat bass recording (' + tb.length + ' of ' + notes.length + ')');
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12), fold = (r) => { while (r > 1.45) r /= 2; while (r < 0.7) r *= 2; return r; };
  let tuned = 0; notes.forEach((n, i) => { if (tb[i] && Math.abs(tb[i].pm - fold(mtof(n.n) / 55)) < 1e-6) tuned++; });
  eq(tuned, notes.length, 'each recording is pitched to its note (folded within an octave so it keeps its timbre)');
  ok(tb.every((e) => e.pm >= 0.7 && e.pm <= 1.45), 'pitch ratios stay in the natural range');
}
{
  /* a hum works as a bass too, a throat bass wins when both exist; lip roll stabs are pitched, with or without a recording */
  const a = fakeRig(); a.A.unlock(); a.A.setSample('HUM', tone(146.83, 1.0), 44100); a.A.music.play('park'); a.step(24);
  ok(a.A.log.filter((e) => e.music && e.id === 'HUM').length > 8, 'a recorded hum is used for the bass line');
  const b = fakeRig(); b.A.unlock(); b.A.setSample('HUM', tone(146.83, 1.0), 44100); b.A.setSample('TB', tone(55, 1.0), 44100); b.A.music.play('park'); b.step(24);
  ok(b.A.log.filter((e) => e.music && e.id === 'TB').length > 8, 'a throat bass is preferred over a hum for the bass line');
  const c = fakeRig(); c.A.unlock(); c.A.music.play('battle'); c.step(60);
  ok(c.A.log.filter((e) => e.k === 'note' && e.kind === 'vox').length > 8 && c.A.log.filter((e) => e.music).length === 0, 'drum and bass: lip roll stabs play on the synth voice when nothing is recorded');
  const d = fakeRig(); d.A.unlock(); d.A.setSample('LR', tone(88, 0.5), 44100); d.A.music.play('battle'); d.step(60);
  const lr = d.A.log.filter((e) => e.music && e.id === 'LR');
  ok(lr.length > 8 && lr.every((e) => e.pm >= 0.7 && e.pm <= 1.45), 'drum and bass: your lip roll recording is pitched onto the chords (' + lr.length + ' stabs)');
}
done();
