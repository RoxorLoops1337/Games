// Audio suite: js/audio.js. Composition is pure and is checked as music theory (scales, registers, loops, cadences, structure);
// sfx recipes are checked as plain data; the engine (graph, scheduler, crossfades, ducking, suspend, intensity layers) runs against the
// loader's recording WebAudio stub with the virtual clock; every voice and recipe is also scheduled into an OfflineAudioContext.
// What a stub cannot say (how it sounds, how loud it is) is measured in a real browser by an offline render, outside this suite.
import { boot, harness } from './rogue_book_lib.mjs';

const t = harness('rogue_book audio');
const fresh = (opts) => boot({ only: ['audio'], ...(opts || {}) });
const g = fresh();
const { AUDIO, DATA } = g;
const L = DATA.LISTS;

// ------------------------------------------------------------------------------------------------ helpers
const SCALE = { 'in-sen': [0, 1, 5, 7, 10], yo: [0, 2, 5, 7, 9], 'miyako-bushi': [0, 1, 5, 7, 8] };
const LAYERED = ['combat1', 'combat2', 'combat3', 'elite', 'boss1', 'boss2', 'boss3', 'final'];
const mod = (a, n) => ((a % n) + n) % n;
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const descs = {};
for (const id of L.music) descs[id] = AUDIO.compose(id);
const ctxOf = (gg) => gg._audio.contexts[0];
const advance = (gg, ms) => gg._advance(ms, 20);
// the sounds of one boot, ready to go: a forced init on the stubbed WebAudio
function live(opts) { const gg = fresh(opts); gg.AUDIO.init({ force: true }); return gg; }
// breadth first search along the stub's connection lists
function reaches(a, b) {
  const seen = new Set([a]), q = [a];
  while (q.length) { const n = q.shift(); if (n === b) return true; for (const m of n._out || []) if (!seen.has(m)) { seen.add(m); q.push(m); } }
  return false;
}
const barSig = (notes, bar, bpb) => notes.filter((n) => Math.floor(n.t / bpb + 1e-9) === bar).map((n) => (n.t - bar * bpb) + ':' + n.dur).join(',');

// ------------------------------------------------------------------------------------------------ 1. contract
t.test('the module loads cleanly and exposes the documented API', () => {
  t.eq(g._errors.length, 0, 'no load errors: ' + JSON.stringify(g._errors));
  for (const fn of ['init', 'sfx', 'music', 'setVolume', 'volume', 'duck', 'suspend', 'resume', 'intensity', 'list', 'preview', 'compose', 'sfxRecipe', 'graph', 'render', 'renderSfx', 'voice', 'debug']) {
    t.eq(typeof AUDIO[fn], 'function', 'AUDIO.' + fn + ' is a function');
  }
  t.eq(AUDIO.ready, false, 'not ready before init');
  t.eq(AUDIO.current, null, 'no current track before anything is requested');
  t.eq(AUDIO.MUSIC_SCALE, 0.55, 'MUSIC_SCALE is the documented 0.55');
  for (const v of ['koto', 'shamisen', 'biwa', 'shakuhachi', 'taiko', 'hyoshigi', 'rin', 'pad']) t.ok(AUDIO.VOICES.indexOf(v) >= 0, 'voice ' + v);
  t.deep(Object.keys(AUDIO.SCALES).sort(), ['in-sen', 'miyako-bushi', 'yo'], 'the three Japanese scales');
  for (const [k, v] of Object.entries(SCALE)) t.deep(AUDIO.SCALES[k], v, 'scale ' + k);
});
t.test('list() mirrors the closed lists in DATA.LISTS', () => {
  t.deep(AUDIO.list(), { sfx: L.sfx, music: L.music }, 'list()');
  t.deep(AUDIO.list('sfx'), L.sfx, "list('sfx')");
  t.deep(AUDIO.list('music'), L.music, "list('music')");
  const copy = AUDIO.list('sfx'); copy.pop();
  t.eq(AUDIO.list('sfx').length, L.sfx.length, 'list() hands out copies');
});

// ------------------------------------------------------------------------------------------------ 2. before init, headless, degradation
t.test('every call is a silent no-op before init and headless', () => {
  const gg = fresh();
  const A = gg.AUDIO;
  t.eq(A.sfx('ui_click'), false, 'sfx dropped before init');
  t.eq(A.preview('ui_click'), false, 'preview dropped before init');
  t.eq(A.duck(300), false, 'duck is a no-op before init');
  A.suspend(); A.resume();
  t.eq(A.setVolume('music', 0.3), true, 'volume is remembered before init');
  t.near(A.volume('music'), 0.3, 1e-9, 'stored music volume');
  t.eq(A.init(), false, 'init headless does nothing');
  t.eq(A.ready, false, 'still not ready headless');
  t.eq(gg._audio.contexts.length, 0, 'no AudioContext is created headless');
  for (const id of L.sfx) A.sfx(id);
  for (const id of L.music) A.music(id);
  gg._advance(2000);
  t.eq(gg._audio.contexts.length, 0, 'still no AudioContext after every sfx and every track was requested');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('a track requested before init is remembered; unknown ids are ignored', () => {
  const gg = fresh();
  const A = gg.AUDIO;
  t.eq(A.music('title'), true, 'accepted');
  t.eq(A.current, 'title', 'current is the requested track');
  t.eq(A.music('nope'), false, 'unknown track rejected');
  t.eq(A.current, 'title', 'and does not change current');
  t.eq(A.sfx('nope'), false, 'unknown sfx rejected');
  t.eq(A.music(null), true, 'null stops');
  t.eq(A.current, null, 'current cleared');
  A.music('camp');
  t.eq(A.init({ force: true }), true, 'a forced init builds the graph');
  const d = A.debug();
  t.eq(d.decks.length, 1, 'the remembered track starts inside init');
  t.eq(d.decks[0].id, 'camp', 'and it is the requested one');
});
t.test('init builds one context, is idempotent, and wires the master chain', () => {
  const gg = fresh();
  const A = gg.AUDIO;
  t.eq(A.init({ force: true }), true, 'first init');
  t.eq(A.init({ force: true }), true, 'second init');
  t.eq(A.init(), true, 'a plain init after a forced one keeps working');
  t.eq(gg._audio.contexts.length, 1, 'exactly one context');
  t.eq(A.ready, true, 'ready');
  t.eq(ctxOf(gg).state, 'running', 'the context is resumed');
  const d = A.debug(), gr = d.graph, dest = ctxOf(gg).destination;
  t.ok(reaches(gr.sfxBus, dest) && reaches(gr.musicBus, dest), 'both buses reach the speakers');
  t.ok(reaches(gr.musicBus, gr.limiter) && reaches(gr.sfxBus, gr.limiter) && reaches(gr.limiter, dest), 'everything passes the limiter');
  t.ok(reaches(gr.glue, gr.limiter) && reaches(gr.limiter, gr.shaper), 'compressor, limiter and soft clip in series');
  t.eq(gr.limiter._kind, 'compressor', 'the limiter is a compressor node');
  t.ok(gr.verb && reaches(gr.musicOut, gr.verb) && reaches(gr.sfxBus, gr.verb), 'a reverb is fed by both buses');
  t.ok(gr.limiter.ratio.value >= 12 && gr.limiter.attack.value <= 0.005, 'the limiter is fast and hard');
});
t.test('volumes: slider, taper and the 0.55 music scale', () => {
  const gg = live();
  const A = gg.AUDIO, gr = A.debug().graph;
  t.near(gr.musicBus.gain.value, Math.pow(0.7, 1.5) * 0.55, 0.005, 'default music bus');
  t.near(gr.sfxBus.gain.value, Math.pow(0.8, 1.5), 0.005, 'default sfx bus');
  const ratio = (v) => Math.pow(v, 1.5);
  A.setVolume('music', 1); A.setVolume('sfx', 1);
  t.near(gr.musicBus.gain.value / gr.sfxBus.gain.value, 0.55, 0.005, 'at equal sliders the music is 0.55 of the sfx gain');
  A.setVolume('music', 0.5); t.near(gr.musicBus.gain.value, ratio(0.5) * 0.55, 0.005, 'music 0.5');
  A.setVolume('sfx', 0); t.near(gr.sfxBus.gain.value, 0, 1e-9, 'sfx 0 is silent');
  A.setVolume('music', 7); t.eq(A.volume('music'), 1, 'clamped high');
  A.setVolume('music', -3); t.eq(A.volume('music'), 0, 'clamped low');
  t.eq(A.setVolume('music', NaN), false, 'NaN ignored');
  t.eq(A.setVolume('bass', 0.5), false, 'unknown bus ignored');
  t.eq(A.volume('bass'), null, 'unknown bus has no volume');
});
t.test('the soft clip is unity below its knee, symmetric, monotonic and saturates gently above full scale', () => {
  const gg = live();
  const gr = gg.AUDIO.debug().graph, curve = gr.shaper.curve, n = curve.length;
  t.ok(n >= 512, 'a curve of ' + n + ' points');
  // the shaper sits between a x0.5 and a x2 gain so its curve describes the range -2..+2 of the signal
  t.ok(gr.clipIn && gr.clipOut && gr.clipIn.gain.value === 0.5 && gr.clipOut.gain.value === 2, 'bracketed by a half and a double gain');
  const at = (i) => ((i / (n - 1)) * 2 - 1) * 2, y = (i) => curve[i] * 2;
  let mono = true, odd = true, peak = 0;
  for (let i = 0; i < n; i++) { if (i && curve[i] < curve[i - 1] - 1e-9) mono = false; if (Math.abs(curve[i] + curve[n - 1 - i]) > 1e-6) odd = false; peak = Math.max(peak, Math.abs(y(i))); }
  t.ok(mono && odd, 'monotonic and odd');
  t.ok(peak <= 0.9801 && peak >= 0.97, 'the ceiling is ' + peak.toFixed(3));
  for (const x of [0.05, 0.2, 0.45, 0.59]) { const i = Math.round((x / 2 + 1) / 2 * (n - 1)); t.near(y(i), at(i), 1e-6, 'unity gain at ' + x); }
  const i1 = Math.round(((1 / 2) + 1) / 2 * (n - 1));
  t.ok(y(i1) < 0.97 && y(i1) > 0.85, 'a signal at full scale is squeezed, not chopped: ' + y(i1).toFixed(3));
  t.ok(reaches(gr.limiter, gr.clipIn) && reaches(gr.clipIn, gr.shaper) && reaches(gr.shaper, gr.clipOut) && reaches(gr.clipOut, gr.out), 'wired limiter, in gain, shaper, out gain, out');
});
t.test('every envelope starts silent: no source can play a sample at full scale before its gain event', () => {
  const gg = fresh();
  const A = gg.AUDIO, W = gg._win;
  gg._run(`globalThis.__env = [];
    const cg = AudioContext.prototype.createGain;
    OfflineAudioContext.prototype.createGain = function () {
      const n = cg.call(this), p = n.gain, ev = []; __env.push(ev);
      for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) { const o = p[m].bind(p); p[m] = (v, t) => { ev.push([m, v, t]); return o(v, t); }; }
      return n;
    };`);
  const off = new W.OfflineAudioContext(2, 44100 * 4, 44100), dest = off.destination;
  for (const v of A.VOICES) for (const n of [{ midi: 60, dur: 0.5, vel: 0.7, r: 0.3 }, { midi: 48, dur: 3, vel: 1, r: 0.9, hit: 'ka', big: 1, double: 1 }]) A.voice(v, off, dest, 0.09, n);
  for (const id of L.sfx) A.renderSfx(off, dest, id, { t0: 0.09, seed: 4 });
  const all = gg._run('__env');
  let checked = 0, bad = 0;
  for (const ev of all) {
    if (!ev.some((e) => e[0] === 'exponentialRampToValueAtTime' && e[1] === 0.0001)) continue;          // an amplitude envelope (decays to the floor)
    checked++;
    const f = ev[0];
    if (!(f[0] === 'setValueAtTime' && f[1] === 0 && f[2] === 0)) bad++;
  }
  t.ok(checked > 400, 'checked ' + checked + ' amplitude envelopes');
  t.eq(bad, 0, bad + ' envelopes do not begin with a zero at time 0 (the click bug)');
});
t.test('graceful degradation: no API, throwing constructor, webkit prefix, missing nodes', () => {
  let gg = fresh();
  gg._run('delete window.AudioContext; delete window.webkitAudioContext;');
  t.eq(gg.AUDIO.init({ force: true }), false, 'no WebAudio at all');
  t.eq(gg.AUDIO.ready, false, 'not ready');
  t.eq(gg.AUDIO.sfx('ui_click'), false, 'sfx is a silent no-op');
  t.eq(gg.AUDIO.music('map1'), true, 'music is still remembered');
  gg = fresh();
  gg._run("window.AudioContext = function () { throw new Error('the browser said no'); }; delete window.webkitAudioContext;");
  t.eq(gg.AUDIO.init({ force: true }), false, 'a throwing constructor leaves it not ready');
  t.eq(gg.AUDIO.ready, false, 'not ready after the failure');
  t.eq(gg.AUDIO.sfx('hit_heavy'), false, 'still silent and not throwing');
  gg = fresh();
  gg._run('delete window.AudioContext;');
  t.eq(gg.AUDIO.init({ force: true }), true, 'the webkit prefixed constructor is used');
  gg = fresh();
  gg._run('AudioContext.prototype.createStereoPanner = undefined; AudioContext.prototype.createConvolver = function () { throw new Error("no convolver"); }; AudioContext.prototype.createPeriodicWave = function () { throw new Error("no wave"); }; AudioContext.prototype.createWaveShaper = function () { throw new Error("no shaper"); };');
  const A = gg.AUDIO;
  t.eq(A.init({ force: true }), true, 'missing panner, convolver, periodic wave: still builds (or fails softly)');
  t.eq(A.ready, true, 'ready without the optional nodes');
  A.music('title'); A.music('combat1'); A.intensity(1);
  for (const id of L.sfx) { A.sfx(id); gg._advance(30); }
  gg._advance(3000);
  t.eq(gg._uncaught.length, 0, 'nothing threw without the optional nodes');
});

// ------------------------------------------------------------------------------------------------ 3. composition
t.test('every track id composes to a frozen, complete description', () => {
  t.deep(Object.keys(descs), L.music, 'one description per id of DATA.LISTS.music');
  t.eq(AUDIO.compose('nope'), null, 'unknown id gives null');
  for (const id of L.music) {
    const d = descs[id];
    t.ok(d && d.id === id, id + ' composes');
    t.ok(Object.isFrozen(d) && Object.isFrozen(d.tracks) && Object.isFrozen(d.tracks[0].notes), id + ' is frozen');
    t.ok(d.tempo >= 50 && d.tempo <= 170, id + ' tempo ' + d.tempo);
    t.ok(SCALE[d.scale], id + ' scale ' + d.scale);
    t.deep(d.scaleIntervals, SCALE[d.scale], id + ' scale intervals');
    t.ok(Number.isInteger(d.tonic) && d.tonic >= 36 && d.tonic <= 64, id + ' tonic ' + d.tonic);
    t.ok(typeof d.key === 'string' && d.key.length >= 1, id + ' key name');
    t.ok(d.beatsPerBar === 3 || d.beatsPerBar === 4, id + ' meter');
    t.eq(d.bars, d.introBars + d.loopBars, id + ' bars = intro + loop');
    t.ok(d.loopBars >= 8, id + ' loops for at least 8 bars');
    t.eq(d.beats, d.bars * d.beatsPerBar, id + ' beats');
    t.eq(d.loopBeats, d.loopBars * d.beatsPerBar, id + ' loop beats');
    t.near(d.seconds, d.beats * 60 / d.tempo, 0.01, id + ' seconds');
    t.ok(d.loopSeconds >= 14 && d.loopSeconds <= 70, id + ' loop length ' + d.loopSeconds + ' s');
    t.ok(typeof d.mood === 'string' && d.mood.length > 4, id + ' has a mood');
    t.ok(d.tracks.length >= 3, id + ' is more than a couple of instruments');
  }
});
t.test('the measured mix table matches the scores (regenerate it after editing a score)', () => {
  const mix = AUDIO.debug().mixLengths;
  for (const id of L.music) t.eq(mix[id], descs[id].tracks.length, id + ' has a mix trim for each of its ' + descs[id].tracks.length + ' tracks');
  t.deep(Object.keys(mix).sort(), L.music.slice().sort(), 'and no stale entries');
});
t.test('composition is deterministic, also across fresh boots', () => {
  const other = fresh().AUDIO;
  for (const id of ['title', 'combat2', 'boss3', 'victory', 'camp']) t.eq(JSON.stringify(other.compose(id)), JSON.stringify(descs[id]), id + ' is identical in a fresh boot');
  t.eq(AUDIO.compose('map1'), AUDIO.compose('map1'), 'compose is cached');
});
t.test('every note lies inside its scale, its register and the loop', () => {
  for (const id of L.music) {
    const d = descs[id];
    const bad = [];
    d.tracks.forEach((tr, i) => {
      const vr = AUDIO.RANGES[tr.voice];
      if (!vr) bad.push(id + ' track ' + i + ' unknown voice ' + tr.voice);
      if (!(tr.range[0] >= vr[0] && tr.range[1] <= vr[1])) bad.push(id + ' track ' + i + ' range ' + tr.range + ' outside the instrument ' + vr);
      if (!Number.isInteger(tr.layer) || tr.layer < 0 || tr.layer >= d.layers) bad.push(id + ' track ' + i + ' layer ' + tr.layer);
      if (!(tr.gain > 0 && tr.gain <= 6) || Math.abs(tr.pan) > 1) bad.push(id + ' track ' + i + ' gain or pan ' + tr.gain + ' ' + tr.pan);
      if (!tr.notes.length) bad.push(id + ' track ' + i + ' (' + tr.voice + ':' + tr.role + ') has no notes');
      for (const n of tr.notes) {
        if (![n.t, n.dur, n.midi, n.vel].every(Number.isFinite)) { bad.push(id + ' NaN note in track ' + i); break; }
        if (!Number.isInteger(n.midi) || n.midi < tr.range[0] || n.midi > tr.range[1]) bad.push(id + ' track ' + i + ' midi ' + n.midi + ' outside ' + tr.range);
        if (d.scaleIntervals.indexOf(mod(n.midi - d.tonic, 12)) < 0) bad.push(id + ' track ' + i + ' (' + tr.role + ') midi ' + n.midi + ' is outside ' + d.scale + ' in ' + d.key);
        if (n.t < 0 || n.dur <= 0 || n.vel <= 0 || n.vel > 1) bad.push(id + ' track ' + i + ' bad time, length or velocity ' + JSON.stringify(n));
        if (n.t + n.dur > d.beats + 1e-6) bad.push(id + ' track ' + i + ' note overhangs the loop end: ' + (n.t + n.dur) + ' > ' + d.beats);
        if (n.t < d.introBeats - 1e-9 && n.t + n.dur > d.introBeats + 1e-6) bad.push(id + ' track ' + i + ' stinger note overhangs into the loop');
        if (Math.abs(n.t * 8 - Math.round(n.t * 8)) > 1e-6) bad.push(id + ' track ' + i + ' off the 1/8 beat grid: ' + n.t);
      }
    });
    t.eq(bad.length, 0, bad.slice(0, 4).join(' | '));
  }
});
t.test('notes are sorted, monophonic instruments never overlap, percussion is tuned to the key', () => {
  for (const id of L.music) {
    const d = descs[id];
    d.tracks.forEach((tr, i) => {
      for (let k = 1; k < tr.notes.length; k++) {
        if (tr.notes[k].t < tr.notes[k - 1].t - 1e-9) { t.ok(false, id + ' track ' + i + ' notes are not sorted'); break; }
        if (tr.voice === 'shakuhachi' && tr.notes[k].t < tr.notes[k - 1].t + tr.notes[k - 1].dur - 1e-6) { t.ok(false, id + ' track ' + i + ' shakuhachi notes overlap at ' + tr.notes[k].t); break; }
      }
      if (tr.voice === 'taiko') {
        const okPcs = [mod(d.tonic, 12), mod(d.tonic + 7, 12)];
        t.ok(tr.notes.every((n) => okPcs.indexOf(mod(n.midi, 12)) >= 0 && (n.hit === 'don' || n.hit === 'ka')), id + ' taiko is tuned to the tonic and fifth with don or ka hits');
      }
    });
  }
  t.ok(true, 'checked');
});
t.test('densities are sane: nothing empty, nothing that would melt a phone', () => {
  for (const id of L.music) {
    const d = descs[id];
    const total = d.tracks.reduce((s, tr) => s + tr.notes.length, 0), perSec = total / d.seconds;
    t.ok(perSec >= 0.8 && perSec <= 48, id + ' notes per second ' + perSec.toFixed(1));
    for (const tr of d.tracks) {
      const perBar = tr.notes.length / (tr.section === 'stinger' ? d.introBars : d.loopBars);
      t.ok(perBar > 0.05 && perBar < 26, id + ' ' + tr.voice + ':' + tr.role + ' notes per bar ' + perBar.toFixed(2));
    }
  }
});
t.test('every track has its own key, tempo and character', () => {
  const sig = L.music.map((id) => descs[id].key + descs[id].scale + descs[id].tempo);
  t.eq(new Set(sig).size, L.music.length, 'no two tracks share key, scale and tempo');
  t.eq(new Set(L.music.map((id) => descs[id].tempo)).size, L.music.length, 'no two tracks share a tempo');
  t.eq(new Set(L.music.map((id) => descs[id].scale)).size, 3, 'all three scales are used');
  t.ok(new Set(L.music.map((id) => descs[id].key)).size >= 8, 'at least 8 different keys');
  const moods = L.music.map((id) => descs[id].mood);
  t.eq(new Set(moods).size, moods.length, 'moods are distinct');
  const melodies = new Set();
  for (const id of L.music) { const m = descs[id].tracks.find((tr) => tr.role === 'melody'); t.ok(!!m, id + ' has a melody'); melodies.add(JSON.stringify(m.notes.map((n) => [n.t, n.midi]))); }
  t.eq(melodies.size, L.music.length, 'no two tracks share a melody');
  for (const id of ['combat1', 'combat2', 'combat3', 'elite', 'boss1', 'boss2', 'boss3', 'final']) t.ok(descs[id].tempo >= 118, id + ' drives at ' + descs[id].tempo + ' bpm');
  for (const id of ['title', 'hero_select', 'map1', 'map2', 'map3']) t.ok(descs[id].tempo <= 90, id + ' is unhurried');
  for (const id of ['camp', 'event']) t.ok(descs[id].tempo <= 62, id + ' is quiet');
  t.eq(descs.camp.beatsPerBar, 3, 'the camp lullaby is in three');
});
t.test('melodies are composed: motifs return, phrases cadence on the tonic, motion is mostly stepwise', () => {
  for (const id of L.music) {
    const d = descs[id], bpb = d.beatsPerBar;
    d.tracks.filter((tr) => tr.role === 'melody').forEach((tr) => {
      const secs = tr.section === 'stinger' ? [['stinger', 0, d.introBars]] : [['loop', d.introBars, d.loopBars]];
      for (const [, first, count] of secs) {
        const notes = tr.notes.filter((n) => n.t >= first * bpb - 1e-9 && n.t < (first + count) * bpb - 1e-9);
        const last = notes[notes.length - 1];
        t.eq(mod(last.midi - d.tonic, 12), 0, id + ' melody ends on the tonic');
        t.ok(last.dur >= 1.4, id + ' final note is held (' + last.dur + ' beats)');
        // motion is measured in steps of the scale (a pentatonic step is 2 to 4 semitones)
        const deg = (m) => 5 * Math.floor((m - d.tonic) / 12) + d.scaleIntervals.indexOf(mod(m - d.tonic, 12));
        let steps = 0, repeats = 0, biggest = 0;
        for (let k = 1; k < notes.length; k++) { const iv = Math.abs(deg(notes[k].midi) - deg(notes[k - 1].midi)); if (iv <= 1) steps++; if (iv === 0) repeats++; if (iv > biggest) biggest = iv; }
        const moves = Math.max(1, notes.length - 1);
        t.ok(steps / moves >= 0.3, id + ' stepwise share ' + (steps / moves).toFixed(2));
        t.ok(repeats / moves <= 0.3, id + ' repeated-note share ' + (repeats / moves).toFixed(2));
        t.ok(biggest <= 9, id + ' widest leap ' + biggest + ' scale steps');
        if (count >= 8) {
          const sigs = []; let again = 0;
          for (let b = first; b < first + count; b++) { const s = barSig(notes, b, bpb); if (s && sigs.indexOf(s) >= 0) again++; if (s) sigs.push(s); }
          t.ok(again >= 2, id + ' repeats rhythmic ideas (' + again + ' repeated bars)');
        }
      }
    });
  }
});
t.test('the phrases breathe: a 4 bar phrase ends open (not on the tonic) until the last one', () => {
  for (const id of ['hero_select', 'map1', 'combat1', 'shop']) {
    const d = descs[id], bpb = d.beatsPerBar, tr = d.tracks.find((x) => x.role === 'melody');
    const endOf = (p) => { const ns = tr.notes.filter((n) => n.t >= p * 4 * bpb && n.t < (p + 1) * 4 * bpb); return ns[ns.length - 1]; };
    const open = [0, 1, 2].filter((p) => mod(endOf(p).midi - d.tonic, 12) !== 0).length;
    t.ok(open >= 2, id + ' has open phrase endings (' + open + ' of 3)');
    t.eq(mod(endOf(3).midi - d.tonic, 12), 0, id + ' closes on the tonic');
  }
});
t.test('the intensity tracks are layered, every other track is a single bed', () => {
  for (const id of L.music) {
    const d = descs[id];
    if (LAYERED.indexOf(id) < 0) { t.eq(d.layers, 1, id + ' is not layered'); t.deep(d.thresholds, [0], id + ' has one threshold'); continue; }
    t.eq(d.layers, 4, id + ' has four layers');
    t.eq(d.thresholds.length, 4, id + ' thresholds');
    t.eq(d.thresholds[0], 0, id + ' layer 0 is always on');
    t.ok(d.thresholds.every((x, i) => i === 0 || x > d.thresholds[i - 1]) && d.thresholds[3] <= 0.8, id + ' thresholds rise and are reachable: ' + d.thresholds);
    for (let k = 0; k < 4; k++) t.ok(d.tracks.some((tr) => tr.layer === k && tr.notes.length > 4), id + ' has music in layer ' + k);
  }
  for (const id of ['boss1', 'boss2', 'boss3', 'final']) {
    const base = new Set(descs[id].tracks.filter((tr) => tr.layer === 0).map((tr) => tr.voice));
    t.ok(base.size >= 4, id + ' is already big at intensity 0 (' + base.size + ' instruments)');
    t.ok(descs[id].thresholds[1] < descs.combat1.thresholds[1], id + ' layers in earlier than a normal fight');
  }
  t.ok(descs.final.thresholds[3] <= 0.5, 'the final track is fully layered at the intensity of its last phase');
});
t.test('victory and defeat are short stingers that fall into a soft loop', () => {
  for (const id of ['victory', 'defeat']) {
    const d = descs[id];
    t.ok(d.introBars >= 2 && d.introBars * d.beatsPerBar * 60 / d.tempo <= 12, id + ' stinger is short: ' + (d.introBars * d.beatsPerBar * 60 / d.tempo).toFixed(1) + ' s');
    t.ok(d.loopBars >= 8, id + ' has a loop to fall into');
    const stinger = d.tracks.filter((tr) => tr.section === 'stinger'), soft = d.tracks.filter((tr) => tr.section === 'loop');
    t.ok(stinger.length >= 3 && soft.length >= 2, id + ' has both sections');
    const avg = (trs) => { const v = trs.flatMap((tr) => tr.notes.map((n) => n.vel)); return v.reduce((a, b) => a + b, 0) / v.length; };
    t.ok(avg(soft) < avg(stinger), id + ' loop is played softer than the stinger (' + avg(soft).toFixed(2) + ' vs ' + avg(stinger).toFixed(2) + ')');
    t.ok(d.tracks.every((tr) => tr.section !== 'loop' || tr.notes.every((n) => n.t >= d.introBeats - 1e-9)), id + ' loop notes start after the stinger');
  }
  t.ok(descs.elite.tracks.some((tr) => tr.role === 'stab' && new Set(tr.notes.map((n) => n.t)).size < tr.notes.length), 'elite plays dyads');
  const stab = descs.elite.tracks.find((tr) => tr.role === 'stab'), byT = {};
  for (const n of stab.notes) (byT[n.t] = byT[n.t] || []).push(n.midi);
  t.ok(Object.values(byT).some((ms) => ms.length === 2 && Math.abs(ms[0] - ms[1]) === 6), 'elite has tritone hits inside its scale');
});
t.test('the camp track has a crackle bed and title has a slow grand shakuhachi over a pad', () => {
  t.ok(descs.camp.tracks.some((tr) => tr.voice === 'crackle' && tr.notes.length > 20), 'camp crackles');
  const title = descs.title;
  t.ok(title.tracks.some((tr) => tr.voice === 'shakuhachi' && tr.role === 'melody') && title.tracks.some((tr) => tr.voice === 'pad'), 'title: shakuhachi over pad');
  t.ok(title.tracks.some((tr) => tr.voice === 'taiko' && tr.notes.length <= 16), 'title: distant, sparse taiko');
  t.ok(descs.hero_select.tracks.some((tr) => tr.voice === 'koto' && tr.role === 'melody'), 'hero select: warm koto melody');
  t.ok(descs.shop.tracks.some((tr) => tr.voice === 'shamisen' && tr.role === 'melody'), 'shop: plucked shamisen melody');
});

// ------------------------------------------------------------------------------------------------ 4. sfx recipes
const FILTERS = ['lowpass', 'highpass', 'bandpass', 'notch'];
const WAVES = ['sine', 'triangle', 'square', 'sawtooth'];
t.test('every sfx id has a valid recipe', () => {
  t.eq(AUDIO.sfxRecipe('nope'), null, 'unknown id gives null');
  for (const id of L.sfx) {
    const r = AUDIO.sfxRecipe(id);
    t.ok(r && r.id === id, id + ' has a recipe');
    t.ok(r.vol > 0 && r.vol <= 1.5, id + ' vol ' + r.vol);
    t.ok(r.var >= 0 && r.var <= 200, id + ' pitch variation ' + r.var);
    t.ok(r.gainVar >= 0 && r.gainVar <= 4, id + ' gain variation');
    t.ok(r.dur >= 0.05 && r.dur <= 3.5, id + ' is short: ' + r.dur + ' s');
    t.ok(r.pri >= 0 && r.pri <= 3 && r.cd >= 0 && r.duck >= 0 && r.duck <= 2000, id + ' priority, cooldown and duck');
    t.ok(r.layers.length >= 1 && r.layers.length <= 30, id + ' has ' + r.layers.length + ' layers');
    for (const ly of r.layers) {
      const ok = [ly.t, ly.d].every(Number.isFinite) && ly.t >= 0 && ly.d > 0 && (ly.k === 'voice' || (Number.isFinite(ly.g) && ly.g > 0 && ly.g <= 1.2));
      if (ly.k === 'osc') t.ok(ok && WAVES.indexOf(ly.w) >= 0 && ly.f >= 20 && ly.f <= 20000 && (!ly.f2 || (ly.f2 >= 20 && ly.f2 <= 20000)) && ly.a >= 0, id + ' osc layer ' + JSON.stringify(ly));
      else if (ly.k === 'noise') t.ok(ok && FILTERS.indexOf(ly.ft) >= 0 && ['white', 'pink', 'brown'].indexOf(ly.n) >= 0 && ly.f >= 20 && ly.f <= 20000 && ly.q > 0 && ly.q <= 20, id + ' noise layer ' + JSON.stringify(ly));
      else if (ly.k === 'fm') t.ok(ok && ly.f >= 20 && ly.f <= 12000 && ly.ratio > 0 && ly.idx > 0, id + ' fm layer ' + JSON.stringify(ly));
      else if (ly.k === 'voice') t.ok(ok && AUDIO.VOICES.indexOf(ly.v) >= 0 && ly.m >= 24 && ly.m <= 108 && ly.vel > 0 && ly.vel <= 1, id + ' voice layer ' + JSON.stringify(ly));
      else t.ok(false, id + ' unknown layer kind ' + ly.k);
      t.ok(ly.t + ly.d <= r.dur + 0.5, id + ' layer inside the recipe length');
    }
  }
});
t.test('recipes are plain data: deterministic, independent copies, all different', () => {
  const a = AUDIO.sfxRecipe('flame'), b = AUDIO.sfxRecipe('flame');
  t.eq(JSON.stringify(a), JSON.stringify(b), 'same recipe every call (pops are seeded)');
  a.layers.length = 0; a.vol = 99;
  t.ok(AUDIO.sfxRecipe('flame').layers.length > 3 && AUDIO.sfxRecipe('flame').vol < 2, 'mutating a returned recipe changes nothing');
  t.eq(JSON.stringify(AUDIO.sfxRecipe('camp_fire')), JSON.stringify(fresh().AUDIO.sfxRecipe('camp_fire')), 'identical in a fresh boot');
  const seen = new Set(L.sfx.map((id) => JSON.stringify(AUDIO.sfxRecipe(id).layers)));
  t.eq(seen.size, L.sfx.length, 'no two sounds share a layer stack');
});
t.test('hits: light, heavy, crit and multi are distinct in build and weight', () => {
  const r = (id) => AUDIO.sfxRecipe(id);
  const weight = (x) => x.layers.reduce((s, ly) => s + ly.g * Math.min(ly.d, 0.4), 0);
  const light = r('hit_light'), heavy = r('hit_heavy'), crit = r('hit_crit'), multi = r('hit_multi');
  t.ok(weight(heavy) > weight(light) * 1.5, 'heavy carries more weight than light');
  t.ok(heavy.duck > light.duck && crit.duck >= heavy.duck, 'heavier hits duck the music more');
  t.ok(crit.layers.some((ly) => ly.k === 'fm') && !heavy.layers.some((ly) => ly.k === 'fm'), 'a crit rings, a heavy hit does not');
  t.ok(new Set(multi.layers.filter((ly) => ly.k === 'noise').map((ly) => ly.t)).size >= 3, 'multi is three strikes');
  t.ok(heavy.dur > light.dur, 'heavy lasts longer than light');
  t.ok(Math.min(...heavy.layers.filter((ly) => ly.k === 'osc').map((ly) => ly.f2 || ly.f)) < 60, 'heavy drops to a real thump');
  t.ok(heavy.layers.some((ly) => ly.k === 'noise' && ly.ft === 'bandpass' && ly.f >= 1500), 'and has a crack on top so it survives small speakers');
});
t.test('elements sound like their element', () => {
  const r = (id) => AUDIO.sfxRecipe(id);
  t.ok(r('flame').layers.filter((ly) => ly.k === 'noise').length >= 6, 'flame is a roar with crackle pops');
  t.ok(r('ice').layers.filter((ly) => ly.k === 'fm').length >= 3, 'ice is glass tinkles');
  t.ok(r('zap').layers.some((ly) => ly.w === 'square') && r('zap').layers.some((ly) => ly.w === 'sawtooth' && ly.f2 > ly.f * 4), 'zap is a rising saw with stepped square blips');
  t.ok(r('poison_tick').layers.filter((ly) => ly.k === 'osc' && ly.f2 > ly.f).length >= 2, 'poison is bubbles that bloop upward');
  t.ok(r('page_turn').layers.every((ly) => ly.k === 'noise'), 'a page turn is paper noise');
  t.ok(r('gold').layers.filter((ly) => ly.k === 'fm').length >= 2, 'coins clink');
  t.ok(r('gem_socket').layers.filter((ly) => ly.k === 'fm').length >= 2 && r('gem_socket').layers.some((ly) => ly.k === 'noise'), 'a gem clicks in and chimes');
  t.ok(r('relic_get').layers.filter((ly) => ly.k === 'voice' && ly.v === 'koto').length >= 4 && r('relic_get').layers.some((ly) => ly.v === 'rin'), 'a relic is a koto arpeggio with a bell');
  t.ok(r('level_up').layers.filter((ly) => ly.v === 'koto').length >= 4, 'level up rises');
  t.ok(r('paint').layers.some((ly) => ly.k === 'noise' && ly.f2 > ly.f) && r('ink_splash').layers.some((ly) => ly.k === 'noise' && ly.ft === 'lowpass'), 'paint sweeps, ink splashes wet');
  t.ok(r('chest_open').layers.some((ly) => ly.vib) && r('chest_open').layers.filter((ly) => ly.v === 'koto').length >= 3, 'a chest creaks then sparkles');
  t.ok(r('boss_die').dur >= 2 && r('boss_die').duck >= 1000 && r('boss_intro').duck >= 1000, 'boss moments are big and duck the music');
  t.ok(r('block_break').layers.some((ly) => ly.k === 'fm') && r('block_break').layers.some((ly) => ly.k === 'noise' && ly.ft === 'highpass'), 'block_break shatters');
});
t.test('interface sounds are crisp and soft', () => {
  for (const id of L.sfx.filter((x) => /^ui_/.test(x))) {
    const r = AUDIO.sfxRecipe(id);
    t.ok(r.dur <= 0.8 && r.vol <= 0.7, id + ' is short and quiet (' + r.dur + ' s, vol ' + r.vol + ')');
  }
  t.ok(AUDIO.sfxRecipe('ui_hover').vol < AUDIO.sfxRecipe('ui_click').vol && AUDIO.sfxRecipe('ui_hover').pri === 0, 'hover is the quietest and first to be dropped');
  t.ok(AUDIO.sfxRecipe('ui_click').cd > 0 && AUDIO.sfxRecipe('step').cd > 0, 'rapid ids have a cooldown');
});

// ------------------------------------------------------------------------------------------------ 5. the engine on the stubbed WebAudio
t.test('every sfx plays, ends, and leaves nothing running', () => {
  const gg = live();
  const A = gg.AUDIO, au = gg._audio;
  let played = 0;
  for (const id of L.sfx) { if (A.sfx(id)) played++; gg._advance(220, 20); }
  t.eq(played, L.sfx.length, 'every id played (cooldowns respected by the spacing)');
  t.ok(au.started > L.sfx.length * 2, 'layers were started: ' + au.started);
  gg._advance(10000, 100);
  t.eq(au.stopped, au.started, 'every source that started has ended (no leaks): ' + au.stopped + ' of ' + au.started);
  t.eq(A.debug().live, 0, 'the live source counter returns to zero');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('sfx options: pitch, vol, pan and delay, plus seeded variation', () => {
  const gg = live();
  const A = gg.AUDIO;
  gg._run(`globalThis.__f = []; globalThis.__g = []; globalThis.__p = [];
    const oc = AudioContext.prototype.createOscillator, gc = AudioContext.prototype.createGain, pc = AudioContext.prototype.createStereoPanner;
    AudioContext.prototype.createOscillator = function () { const o = oc.call(this); const s = o.frequency.setValueAtTime.bind(o.frequency); o.frequency.setValueAtTime = (v, t) => { __f.push(v); return s(v, t); }; return o; };
    AudioContext.prototype.createGain = function () { const n = gc.call(this); __g.push(n); return n; };
    AudioContext.prototype.createStereoPanner = function () { const n = pc.call(this); __p.push(n); return n; };`);
  const F = () => gg._run('__f'), G = () => gg._run('__g'), P = () => gg._run('__p');
  const first = [];
  for (let i = 0; i < 10; i++) { gg._run('__f.length = 0'); A.sfx('hit_light'); first.push(F()[0]); gg._advance(60, 20); }
  t.ok(first.every((f) => Math.abs(1200 * Math.log2(f / 260)) <= 92), 'every play stays within the recipe variation of 260 Hz: ' + first.map((f) => Math.round(f)));
  t.ok(new Set(first.map((f) => Math.round(f * 100))).size >= 8, 'and the pitch varies from play to play');
  gg._run('__f.length = 0'); A.preview('hit_light');
  t.eq(F()[0], 260, 'preview plays the recipe exactly as written');
  gg._advance(100, 20);
  gg._run('__f.length = 0'); A.sfx('hit_light', { pitch: 2 });
  t.ok(Math.abs(1200 * Math.log2(F()[0] / 520)) <= 92, 'pitch 2 doubles the frequency: ' + F()[0]);
  gg._advance(100, 20);
  const busGain = (vol) => { let sum = 0; for (let i = 0; i < 8; i++) { gg._run('__g.length = 0'); A.sfx('ui_click', { vol }); sum += G()[0].gain.value; gg._advance(60, 20); } return sum / 8; };
  const hi = busGain(1), lo = busGain(0.5);
  t.ok(lo / hi > 0.4 && lo / hi < 0.6, 'vol 0.5 halves the sound: ' + (lo / hi).toFixed(2));
  gg._run('__p.length = 0'); A.sfx('ui_click', { pan: -1 }); gg._advance(60, 20);
  t.ok(P().length >= 1 && P()[0].pan.value === -1, 'pan -1 is exactly hard left (an explicit pan is not jittered)');
  gg._run('__p.length = 0'); A.sfx('ui_click', { pan: 1 }); gg._advance(60, 20);
  t.eq(P()[0].pan.value, 1, 'pan 1 is hard right');
  const startsAfter = (log0) => au().log.slice(log0).filter((l) => /^start /.test(l)).map((l) => parseFloat(l.split('@')[1]));
  const au = () => gg._audio;
  for (const [delay, secs] of [[500, 0.5], [0.5, 0.5], [0, 0]]) {
    gg._advance(100, 20);
    const n0 = au().log.length, now = ctxOf(gg).currentTime;
    A.sfx('ui_back', { delay });
    const s = startsAfter(n0);
    t.ok(s.length > 0 && Math.min(...s) >= now + secs - 0.001 && Math.min(...s) <= now + secs + 0.02, 'delay ' + delay + ' waits ' + secs + ' s (first start ' + Math.min(...s).toFixed(3) + ' from ' + now.toFixed(3) + ')');
  }
});
t.test('sfx cooldowns and voice limits keep rapid ids from stacking', () => {
  const gg = live();
  const A = gg.AUDIO;
  t.eq(A.sfx('ui_hover'), true, 'first hover plays');
  t.eq(A.sfx('ui_hover'), false, 'a second hover in the same instant is skipped');
  gg._advance(100, 20);
  t.eq(A.sfx('ui_hover'), true, 'and it plays again after the cooldown');
  t.eq(A.sfx('hit_heavy'), true, 'ids without a cooldown always play');
  t.eq(A.sfx('hit_heavy'), true, 'twice in a row');
  gg._advance(6000, 100);
  t.eq(A.debug().live, 0, 'everything ended');
});
t.test('ducking dips the music and swells back; big sounds duck by themselves', () => {
  const gg = live();
  const A = gg.AUDIO, gain = A.debug().graph.duck.gain;
  gg._run('globalThis.__d = []');
  const orig = gain.setTargetAtTime.bind(gain);
  gain.setTargetAtTime = (v, tm, tc) => { gg._run('__d').push([v, tm, tc]); return orig(v, tm, tc); };
  const now = ctxOf(gg).currentTime;
  t.eq(A.duck(400), true, 'duck accepted');
  const c = gg._run('__d').map((x) => [x[0], x[1], x[2]]);
  t.ok(c.length === 2 && c[0][0] < 0.6 && c[0][0] > 0.2 && c[0][2] <= 0.03, 'dips quickly to a fraction: ' + JSON.stringify(c[0]));
  t.ok(c[1][0] === 1 && near(c[1][1], now + 0.4, 0.02), 'and swells back after 400 ms: ' + JSON.stringify(c[1]));
  gg._run('__d.length = 0'); A.sfx('hit_heavy');
  t.ok(gg._run('__d').length === 2, 'hit_heavy ducks the music on its own');
  gg._run('__d.length = 0'); A.sfx('ui_click');
  t.eq(gg._run('__d').length, 0, 'a click does not');
  t.eq(A.duck(NaN), false, 'NaN is ignored');
});
t.test('suspend, resume and tab visibility', () => {
  const gg = live();
  const A = gg.AUDIO, ctx = ctxOf(gg);
  A.music('map1'); advance(gg, 500);
  t.eq(A.debug().timer, true, 'the scheduler runs');
  A.suspend();
  t.eq(ctx.state, 'suspended', 'suspend suspends the context');
  t.eq(A.debug().timer, false, 'and stops the scheduler');
  t.eq(A.sfx('ui_click'), false, 'sfx are dropped while suspended');
  const s0 = gg._audio.started; advance(gg, 2000);
  t.eq(gg._audio.started, s0, 'nothing is scheduled while suspended');
  A.resume();
  t.eq(ctx.state, 'running', 'resume resumes');
  t.eq(A.debug().timer, true, 'and restarts the scheduler');
  t.eq(A.sfx('ui_click'), true, 'sfx work again');
  gg._hide();
  t.eq(ctx.state, 'suspended', 'a hidden tab suspends');
  gg._show();
  t.eq(ctx.state, 'running', 'a visible tab resumes');
  A.suspend(); gg._hide(); gg._show();
  t.eq(ctx.state, 'suspended', 'an explicit suspend survives the tab becoming visible');
  A.resume();
  t.eq(ctx.state, 'running', 'until resume is called');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('a context the browser left suspended is woken by the next click, key press or pointerup', () => {
  const gg = live();
  const A = gg.AUDIO, ctx = ctxOf(gg);
  for (const type of ['click', 'keydown', 'pointerup']) {
    ctx.suspend();
    t.eq(ctx.state, 'suspended', 'suspended behind our back');
    gg._fire(type, {});
    t.eq(ctx.state, 'running', 'a ' + type + ' wakes it');
  }
  A.suspend();
  gg._fire('click', {});
  t.eq(ctx.state, 'suspended', 'but never against an explicit suspend');
  A.resume();
  t.eq(ctx.state, 'running', 'resume still works');
});
t.test('music: crossfades between tracks, never restarts the same one, stops on null', () => {
  const gg = live();
  const A = gg.AUDIO, au = gg._audio;
  t.eq(A.music('map1'), true, 'map1');
  t.eq(A.current, 'map1', 'current');
  advance(gg, 1500);
  t.ok(au.started > 20, 'notes are being played: ' + au.started);
  t.eq(A.debug().decks.length, 1, 'one deck');
  const s0 = au.started;
  A.music('map1'); t.eq(A.debug().decks.length, 1, 'asking for the same track again is a no-op');
  A.music('map1', { restart: true }); t.eq(A.debug().decks.filter((d) => !d.dying).length, 1, 'restart replaces it');
  advance(gg, 100);
  A.music('shop', { fade: 2 });
  let d = A.debug().decks;
  t.ok(d.length >= 2 && d.filter((x) => x.dying).length >= 1 && d.filter((x) => !x.dying).length === 1, 'the old deck fades while the new one comes in');
  t.eq(A.current, 'shop', 'current follows');
  advance(gg, 4000);
  d = A.debug().decks;
  t.eq(d.length, 1, 'the old deck is gone after its fade');
  t.eq(d[0].id, 'shop', 'and the new track plays');
  A.music('camp', { fade: 800 });
  advance(gg, 1500);
  t.eq(A.debug().decks.length, 1, 'a fade over 20 is read as milliseconds');
  A.music(null);
  t.eq(A.current, null, 'null clears current');
  advance(gg, 3000);
  t.eq(A.debug().decks.length, 0, 'and fades out to nothing');
  t.ok(au.started >= s0, 'started counter only grows');
  const stop0 = au.started; advance(gg, 2000);
  t.eq(au.started, stop0, 'no notes after music stops');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('every track plays for a whole loop without a throw or a leak', () => {
  const gg = live();
  const A = gg.AUDIO, au = gg._audio;
  for (const id of L.music) {
    A.music(id, { fade: 0.2 });
    A.intensity(1);
    advance(gg, 4000);
    t.ok(A.debug().decks.some((d) => d.id === id && !d.dying), id + ' is playing');
    t.ok(A.debug().live < 220, id + ' stays under the voice cap: ' + A.debug().live);
  }
  A.music(null, { fade: 0.2 });
  advance(gg, 15000);
  t.eq(A.debug().decks.length, 0, 'all decks disposed');
  t.eq(au.stopped, au.started, 'every source ended after the music stopped');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('the loop restarts seamlessly: passes advance and the schedule never runs dry', () => {
  const gg = live();
  const A = gg.AUDIO, au = gg._audio;
  A.music('reward');
  const per = [];
  for (let i = 0; i < 14; i++) { const s = au.started; advance(gg, 3000); per.push(au.started - s); }
  const deck = A.debug().decks[0];
  t.ok(deck.pass >= 2, 'the deck went round the loop ' + deck.pass + ' times in 42 s');
  t.ok(per.every((n) => n > 5), 'every 3 s window has notes: ' + per.join(','));
  t.ok(Math.max(...per) / Math.min(...per) < 6, 'and the density does not collapse at the seam');
  A.music('victory');
  advance(gg, 1000);
  const v = A.debug().decks.find((d) => d.id === 'victory' && !d.dying);
  advance(gg, 48000);
  t.ok(v.raw.pass >= 1 && v.raw.i >= v.raw.flat.firstLoop, 'the victory stinger played once and its soft loop repeats (' + v.raw.pass + ' passes)');
});
t.test('intensity fades layers in and out, and skips silent layers', () => {
  const gg = live();
  const A = gg.AUDIO, au = gg._audio;
  A.music('combat1'); A.intensity(0);
  advance(gg, 500);
  t.deep(A.debug().decks[0].target, [1, 0, 0, 0], 'intensity 0 is the rhythm bed only');
  const a0 = au.started; advance(gg, 6000); const bed = au.started - a0;
  A.intensity(0.5);
  t.deep(A.debug().decks[0].target.map((x) => Math.round(x * 100) / 100), [1, 1, 0.5, 0], 'intensity 0.5');
  advance(gg, 500);
  A.intensity(1);
  t.deep(A.debug().decks[0].target, [1, 1, 1, 1], 'intensity 1 is the full band');
  advance(gg, 1000);
  const a1 = au.started; advance(gg, 6000); const full = au.started - a1;
  t.ok(full > bed * 1.5, 'layers that are off are not even scheduled: bed ' + bed + ' notes-sources vs full ' + full);
  const lg = A.debug().decks[0].layerG;
  t.ok(lg[3].gain.value === 1 && lg[0].gain.value === 1, 'the layer gain nodes follow');
  A.intensity(0);
  t.ok(lg[3].gain.value === 0, 'and go back down');
  t.eq(A.intensity(2), 1, 'clamped high'); t.eq(A.intensity(-1), 0, 'clamped low'); t.eq(A.intensity('x'), 0, 'garbage is 0');
  t.eq(A.intensity(), 0, 'intensity() reads the value back');
  A.intensity(0.7); A.music('map1');
  t.eq(A.intensity(), 0, 'leaving a layered track for a plain one resets it');
  A.intensity(0.7); A.music('boss1');
  t.eq(A.intensity(), 0.7, 'entering a layered track keeps a value set by the screen just before');
  A.intensity(0.7); A.music('combat3');
  t.eq(A.intensity(), 0.7, 'and moving between layered tracks keeps it');
});
t.test('a throttled timer never bursts: a deck far behind skips whole loops', () => {
  const gg = live();
  const A = gg.AUDIO, au = gg._audio;
  A.music('reward'); A.intensity(1); advance(gg, 800);
  const raw = A.debug().decks[0].raw;
  t.ok(raw && typeof raw.t0 === 'number', 'debug exposes the deck for this test');
  raw.t0 -= 900;
  const s0 = au.started;
  A.debug().tick();
  t.ok(au.started - s0 < 400, 'a 15 minute stall schedules at most a moment of music: ' + (au.started - s0));
  t.ok(raw.pass >= 40, 'by jumping whole loops: pass ' + raw.pass);
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('the voice cap sheds low priority sounds instead of piling up', () => {
  const gg = live();
  const A = gg.AUDIO;
  let played = 0, refused = 0;
  for (let i = 0; i < 400; i++) { if (A.sfx('flame')) played++; else refused++; }
  t.ok(A.debug().live <= 320, 'live sources stay bounded: ' + A.debug().live);
  t.ok(refused > 0 || played < 400, 'a storm of flames is capped');
  A.sfx('boss_die');
  gg._advance(8000, 100);
  t.eq(A.debug().live, 0, 'and it all ends');
});

t.test('soak: five minutes of switching, storms, intensity and suspends leaks nothing and stays bounded', () => {
  const gg = live();
  const A = gg.AUDIO, au = gg._audio, rnd = gg.U.rng(20260101);
  const musicIds = L.music, sfxIds = L.sfx;
  let maxLive = 0, maxDecks = 0;
  for (let step = 0; step < 1500; step++) {                                   // 1500 steps of 200 ms
    const r = rnd();
    if (r < 0.05) A.music(rnd.pick(musicIds), rnd() < 0.3 ? { fade: 0.2 } : undefined);
    else if (r < 0.09) A.music(null);
    else if (r < 0.2) A.intensity(rnd());
    else if (r < 0.7) { for (let k = rnd.int(1, 4); k > 0; k--) A.sfx(rnd.pick(sfxIds), { pitch: 0.8 + rnd() * 0.5, pan: rnd() * 2 - 1, vol: rnd() * 1.5 }); }
    else if (r < 0.72) A.duck(rnd.int(50, 1500));
    else if (r < 0.73) { A.suspend(); gg._advance(400, 20); A.resume(); }
    else if (r < 0.75) A.setVolume(rnd() < 0.5 ? 'music' : 'sfx', rnd());
    gg._advance(200, 20);
    const d = A.debug();
    maxLive = Math.max(maxLive, d.live); maxDecks = Math.max(maxDecks, d.decks.length);
  }
  A.music(null, { fade: 0.2 });
  gg._advance(20000, 100);
  const d = A.debug();
  t.ok(maxLive < 330, 'live sources never exceeded the cap by much: ' + maxLive);
  t.ok(maxDecks <= 8, 'decks stay few even with rapid switching: ' + maxDecks);
  t.eq(d.decks.length, 0, 'every deck is disposed once the music stops');
  t.eq(d.live, 0, 'no source is left running');
  t.eq(au.stopped, au.started, 'every source that started ended');
  t.eq(gg._uncaught.length, 0, 'nothing threw in ' + au.started + ' sources');
});

// ------------------------------------------------------------------------------------------------ 6. offline rendering
t.test('every track schedules into an OfflineAudioContext', async () => {
  const gg = fresh();
  const A = gg.AUDIO, W = gg._win;
  for (const id of L.music) {
    const off = new W.OfflineAudioContext(2, 44100 * 3, 44100);
    const gr = A.graph(off, { musicVol: 1, sfxVol: 1 });
    const d = A.compose(id);
    const r = A.render(off, gr.music, d, { loops: 2, intensity: 1 });
    t.ok(r.notes > 20, id + ' scheduled ' + r.notes + ' notes');
    t.near(r.end, d.introBeats * 60 / d.tempo + d.loopBeats * 2 * 60 / d.tempo, 0.01, id + ' two passes of the loop plus the intro');
    if (id === 'title') { const buf = await off.startRendering(); t.eq(buf.length, 44100 * 3, 'startRendering resolves a buffer'); }
  }
  const mk = () => { const o = new W.OfflineAudioContext(2, 44100, 44100); return [o, A.graph(o)]; };
  const d = A.compose('combat1'), [o1, g1] = mk(), [o2, g2] = mk();
  const lo = A.render(o1, g1.music, d, { intensity: 0 }), hi = A.render(o2, g2.music, d, { intensity: 1 });
  t.ok(hi.notes > lo.notes, 'intensity 1 renders more notes than intensity 0');
});
t.test('every sfx recipe and every voice renders offline, also at the edges', () => {
  const gg = fresh();
  const A = gg.AUDIO, W = gg._win;
  const off = new W.OfflineAudioContext(2, 44100 * 4, 44100), gr = A.graph(off);
  for (const id of L.sfx) {
    const r = A.renderSfx(off, gr.sfx, id, { t0: 0.1, seed: 5 });
    t.ok(r && near(r.end, 0.1 + A.sfxRecipe(id).dur, 0.001), id + ' renders and ends where the recipe says');
  }
  t.eq(A.renderSfx(off, gr.sfx, 'nope'), null, 'unknown sfx renders nothing');
  for (const v of A.VOICES) {
    for (const n of [{ midi: 24, dur: 0.01, vel: 0, r: 0 }, { midi: 60, dur: 0.5, vel: 1, r: 1 }, { midi: 110, dur: 30, vel: 0.5, r: 0.5 }, { midi: 48, dur: 2, vel: 0.3, r: 0.2, hit: 'ka', big: 1, double: 1, bend: 2 }]) {
      t.eq(A.voice(v, off, gr.music, 0.05, n), true, v + ' renders ' + JSON.stringify(n));
    }
  }
  t.eq(A.voice('kazoo', off, gr.music, 0, {}), false, 'unknown voice is refused');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('rendering is deterministic: the same description builds the same graph', () => {
  const W = g._win, A = AUDIO;
  const count = () => { const off = new W.OfflineAudioContext(2, 44100, 44100), gr = A.graph(off); const before = off._nodes; A.render(off, gr.music, A.compose('boss2'), { intensity: 1 }); return off._nodes - before; };
  t.eq(count(), count(), 'same number of nodes');
});

t.done();
