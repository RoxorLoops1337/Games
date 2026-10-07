// Audio suite: js/audio.js, the Hocus Vocus band. Composition is pure and is checked as music theory (scales, registers, loops,
// cadences, structure, the beat grids, the quoted themes, the quant groove); sfx recipes and the per-hero variants are checked as plain
// data; the engine (graph, scheduler, crossfades, ducking, suspend, intensity layers) runs against the loader's recording WebAudio
// stub with the virtual clock; every voice and recipe is also scheduled into an OfflineAudioContext; block S drives the owners'
// sample hook (DATA.SAMPLES) with a spy in place of the network. What a stub cannot say (how it sounds, how loud it is) is measured in
// a real browser by tools/hocus_vocus/mix.mjs, outside this suite.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR, stripJs, lineOf } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus audio');
// The shipped DATA.SAMPLES holds whatever recordings the owners have listed (README step 3), so no suite below depends on it: every boot
// from fresh() starts with an EMPTY manifest, and only block S (S1 in particular) reads the shipped one, kept in SHIPPED.
const EMPTY_SAMPLES = { version: 1, base: 'audio/', formats: ['m4a', 'ogg', 'mp3'], preload: 'idle', maxSeconds: 120, gain: 1, sfx: {}, spells: {}, syllables: {}, stingers: {} };
const rawBoot = boot({ only: ['audio'] });
const SHIPPED = rawBoot.DATA.SAMPLES ? JSON.parse(JSON.stringify(rawBoot.DATA.SAMPLES)) : null;
const SHIPPED_FROZEN = Object.isFrozen(rawBoot.DATA.SAMPLES);
const fresh = (opts) => { const gg = boot({ only: ['audio'], ...(opts || {}) }); gg._run('DATA.SAMPLES = ' + JSON.stringify(EMPTY_SAMPLES) + ';'); return gg; };
const g = fresh();
const { AUDIO, DATA } = g;
const L = DATA.LISTS;

// ------------------------------------------------------------------------------------------------ helpers
// HV_ART_AUDIO 10.3: diatonic keys for the score, the pentatonic subsets for the melodic reveal
const SCALE = {
  major: [0, 2, 4, 5, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], dorian: [0, 2, 3, 5, 7, 9, 10], minor: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], penta: [0, 2, 4, 7, 9], pentaMinor: [0, 3, 5, 7, 10],
};
const SCORE_SCALES = ['major', 'mixolydian', 'dorian', 'minor', 'lydian'];
const pentaOf = (s) => (s === 'dorian' || s === 'minor' ? SCALE.pentaMinor : SCALE.penta);
const BAND = ['kick', 'snare', 'hat', 'throat', 'scratch', 'croon', 'choir', 'synth', 'keys', 'ebass', 'glock', 'uke', 'whistle', 'clap', 'pad', 'arp', 'vox', 'crackle'];
const MONO = ['croon', 'whistle', 'throat'];
// a test-local fixture: the instruments the fork removed (HV_ART_AUDIO 10.2), asserted absent
const GONE = ['koto', 'shamisen', 'biwa', 'shakuhachi', 'taiko', 'hyoshigi', 'rin'];
const INTENSE = ['combat1', 'combat2', 'combat3', 'elite', 'boss1', 'boss2', 'boss3', 'final'];   // layered by AUDIO.intensity (fights)
const WOKEN = ['map1', 'map2', 'map3'];                                                         // layered by AUDIO.awake (the map mute)
const QUANT = ['map3', 'combat3', 'boss3', 'final'];                                            // the Gloss's groove: dead on the grid at drive 0
const LAYERED = INTENSE.concat(WOKEN);
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
  for (const fn of ['init', 'sfx', 'music', 'setVolume', 'volume', 'duck', 'suspend', 'resume', 'intensity', 'list', 'preview', 'samples', 'compose', 'sfxRecipe', 'graph', 'render', 'renderSfx', 'voice', 'debug', 'wake', 'awake', 'options', 'hexNote', 'songDegrees', 'wakeDegree']) {
    t.eq(typeof AUDIO[fn], 'function', 'AUDIO.' + fn + ' is a function');
  }
  t.eq(AUDIO.ready, false, 'not ready before init');
  t.eq(AUDIO.current, null, 'no current track before anything is requested');
  t.eq(AUDIO.MUSIC_SCALE, 0.55, 'MUSIC_SCALE is the documented 0.55');
  t.deep(AUDIO.VOICES.slice().sort(), BAND.slice().sort(), 'the band of HV_ART_AUDIO 10.2: the vocal and beatbox voices plus the kept pad, arp, vox and crackle');
  for (const v of GONE) t.ok(AUDIO.VOICES.indexOf(v) < 0, 'the old instrument ' + v + ' is gone from the fork');
  t.deep(Object.keys(AUDIO.SCALES).sort(), Object.keys(SCALE).sort(), 'five diatonic scales and the two pentatonic subsets');
  for (const [k, v] of Object.entries(SCALE)) t.deep(AUDIO.SCALES[k], v, 'scale ' + k);
  t.deep(Object.keys(AUDIO.MOTIFS).sort(), ['andy', 'human', 'jasmin', 'jingle', 'rawclaw'], 'the musical identities of 10.4');
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
    t.ok(SCORE_SCALES.indexOf(d.scale) >= 0, id + ' is in a diatonic key: ' + d.scale);
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
t.test('notes are sorted, sung and blown voices never overlap, the beat is tuned to the key', () => {
  const HITS = { kick: [undefined, 'boots'], snare: ['pf', 'k', 'cats'], hat: [undefined, 'open'], scratch: [undefined], clap: [undefined, 'snap'] };
  for (const id of L.music) {
    const d = descs[id];
    d.tracks.forEach((tr, i) => {
      for (let k = 1; k < tr.notes.length; k++) {
        if (tr.notes[k].t < tr.notes[k - 1].t - 1e-9) { t.ok(false, id + ' track ' + i + ' notes are not sorted'); break; }
        if (MONO.indexOf(tr.voice) >= 0 && tr.notes[k].t < tr.notes[k - 1].t + tr.notes[k - 1].dur - 1e-6) { t.ok(false, id + ' track ' + i + ' ' + tr.voice + ' notes overlap at ' + tr.notes[k].t); break; }
      }
      if (tr.role === 'beat') {
        t.ok(HITS[tr.voice] !== undefined, id + ' beat track ' + i + ' is a kit voice: ' + tr.voice);
        t.ok(tr.notes.every((n) => mod(n.midi - d.tonic, 12) === 0 && (HITS[tr.voice] || []).indexOf(n.hit) >= 0), id + ' ' + tr.voice + ' sits on the tonic with its own hits');
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
      const perBar = tr.notes.length / (tr.section !== 'loop' ? d.introBars : d.loopBars);
      t.ok(perBar > 0.05 && perBar < 26, id + ' ' + tr.voice + ':' + tr.role + ' notes per bar ' + perBar.toFixed(2));
    }
  }
});
// The keys and tempos are HV_ART_AUDIO 10.5's (hero_select and map1 share G major at 100, victory and final D major at 92), so a
// track's identity is its key, tempo, layering and lead line together, never the tempo alone.
t.test('every track has its own key, tempo and character', () => {
  const sig = L.music.map((id) => descs[id].key + descs[id].scale + descs[id].tempo + '/' + descs[id].layers);
  t.eq(new Set(sig).size, L.music.length, 'no two tracks share key, scale, tempo and layering');
  t.eq(new Set(L.music.map((id) => descs[id].scale)).size, 5, 'all five diatonic scales are used');
  t.ok(new Set(L.music.map((id) => descs[id].key + descs[id].scale)).size >= 10, 'at least 10 different keys (tonic and mode)');
  const moods = L.music.map((id) => descs[id].mood);
  t.eq(new Set(moods).size, moods.length, 'moods are distinct');
  const leads = new Set();
  for (const id of L.music) { const m = descs[id].tracks.find((tr) => tr.role === 'melody' || tr.role === 'theme'); t.ok(!!m, id + ' has a melody or a quoted theme'); leads.add(JSON.stringify(m.notes.map((n) => [n.t, n.midi]))); }
  t.eq(leads.size, L.music.length, 'no two tracks share a lead line');
  for (const id of ['combat1', 'combat2', 'combat3', 'elite', 'boss1', 'boss2', 'boss3']) t.ok(descs[id].tempo >= 118, id + ' drives at ' + descs[id].tempo + ' bpm');
  t.ok(descs.final.tempo * 2 >= 118 && descs.final.tracks.some((tr) => tr.role === 'beat' && tr.voice === 'kick'), 'final drives in half time over a beat (' + descs.final.tempo + ' bpm)');
  const fightMin = Math.min(...['combat1', 'combat2', 'combat3', 'elite', 'boss1', 'boss2', 'boss3'].map((id) => descs[id].tempo));
  for (const id of ['title', 'hero_select', 'map1', 'map2', 'map3']) t.ok(descs[id].tempo < fightMin, id + ' is slower than every fight (' + descs[id].tempo + ')');
  t.ok(descs.title.tempo <= 90, 'the title is unhurried');
  for (const [id, max] of [['camp', 62], ['event', 80], ['defeat', 70]]) t.ok(descs[id].tempo <= max, id + ' is quiet (' + descs[id].tempo + ')');
  t.eq(descs.camp.beatsPerBar, 3, 'the Green Room lullaby is in three');
});
t.test('melodies are composed: motifs return, phrases cadence on the tonic, motion is mostly stepwise', () => {
  for (const id of L.music) {
    const d = descs[id], bpb = d.beatsPerBar;
    d.tracks.filter((tr) => tr.role === 'melody').forEach((tr) => {
      const secs = tr.section !== 'loop' ? [[tr.section, 0, d.introBars]] : [['loop', d.introBars, d.loopBars]];
      for (const [, first, count] of secs) {
        const notes = tr.notes.filter((n) => n.t >= first * bpb - 1e-9 && n.t < (first + count) * bpb - 1e-9);
        const last = notes[notes.length - 1];
        t.eq(mod(last.midi - d.tonic, 12), 0, id + ' melody ends on the tonic');
        t.ok(last.dur >= 1.4, id + ' final note is held (' + last.dur + ' beats)');
        // motion is measured in steps of the scale (a diatonic step is 1 or 2 semitones)
        const n7 = d.scaleIntervals.length;
        const deg = (m) => n7 * Math.floor((m - d.tonic) / 12) + d.scaleIntervals.indexOf(mod(m - d.tonic, 12));
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
t.test('the fight and map tracks are layered, every other track is a single bed', () => {
  for (const id of L.music) {
    const d = descs[id];
    if (LAYERED.indexOf(id) < 0) { t.eq(d.layers, 1, id + ' is not layered'); t.deep(d.thresholds, [0], id + ' has one threshold'); t.eq(d.drive, null, id + ' has no drive'); continue; }
    t.eq(d.drive, WOKEN.indexOf(id) >= 0 ? 'awake' : 'intensity', id + ' drive');
    t.eq(d.layers, 4, id + ' has four layers');
    t.eq(d.thresholds.length, 4, id + ' thresholds');
    t.eq(d.thresholds[0], 0, id + ' layer 0 is always on');
    t.ok(d.thresholds.every((x, i) => i === 0 || x > d.thresholds[i - 1]) && d.thresholds[3] <= 0.8, id + ' thresholds rise and are reachable: ' + d.thresholds);
    for (let k = 0; k < 4; k++) t.ok(d.tracks.some((tr) => tr.layer === k && tr.notes.length > 4), id + ' has music in layer ' + k);
  }
  for (const id of ['boss1', 'boss2', 'boss3', 'final']) t.ok(descs[id].thresholds[1] < descs.combat1.thresholds[1], id + ' layers in earlier than a normal fight');
  for (const id of ['boss1', 'boss2', 'boss3']) {
    const base = new Set(descs[id].tracks.filter((tr) => tr.layer === 0).map((tr) => tr.voice));
    t.ok(base.size >= 4, id + ' is already big at intensity 0 (' + base.size + ' instruments)');
  }
  // `final` only starts at the Gloss's last form, where the screen sends intensity 0.5 (two Headliner phases at 0.25): every layer is in
  // there, and layer 0 is the Gloss alone (HV_ART_AUDIO 10.5), the others are the duo and the crowd arriving
  t.ok(descs.final.thresholds[3] + 0.1 <= 0.5, 'the final track is fully layered at the intensity of its last phase');
  const gloss = new Set(descs.final.tracks.filter((tr) => tr.layer === 0).map((tr) => tr.voice));
  t.deep([...gloss].sort(), ['glock', 'pad', 'vox'], 'final layer 0 is the Gloss: a drone, even glock and the robot vox');
  t.ok(descs.final.tracks.some((tr) => tr.layer === 1 && tr.voice === 'kick') && descs.final.tracks.some((tr) => tr.layer === 2 && tr.role === 'theme' && tr.voice === 'croon') && descs.final.tracks.some((tr) => tr.layer === 3 && tr.role === 'theme' && tr.voice === 'choir'), 'then RoxorLoops (1), Jasmin singing the Human theme (2) and the crowd (3)');
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
t.test('the camp track has a crackle bed and title has a croon melody over a keys pad', () => {
  const has = (id, f) => descs[id].tracks.some(f);
  t.ok(has('camp', (tr) => tr.voice === 'crackle' && tr.notes.length > 20) && has('camp', (tr) => tr.voice === 'crackle' && tr.notes.some((n) => n.hit === 'hiss')), 'the Green Room crackles, and a kettle hisses now and then');
  t.ok(has('title', (tr) => tr.voice === 'croon' && tr.role === 'melody') && has('title', (tr) => tr.voice === 'keys' && tr.role === 'pad'), 'title: a croon melody over a keys pad');
  const kick = descs.title.tracks.find((tr) => tr.voice === 'kick');
  t.ok(kick && kick.notes.every((n) => n.vel <= 0.6), 'title: a soft boom-bap under it');
  t.ok(has('title', (tr) => tr.voice === 'glock' && tr.role === 'arp'), 'title: Jasmin\'s arpeggio on glock');
  t.ok(has('hero_select', (tr) => tr.voice === 'whistle' && tr.role === 'melody'), 'hero select: a whistle melody');
  t.ok(has('hero_select', (tr) => tr.voice === 'ebass' && tr.notes.some((n) => n.hit === 'slap')), 'hero select: Andy\'s riff, slapped');
  t.ok(has('shop', (tr) => tr.voice === 'whistle' && tr.role === 'melody') && has('shop', (tr) => tr.voice === 'clap' && tr.notes.every((n) => n.hit === 'snap')), 'shop: a whistle melody and finger snaps');
  t.ok(has('map1', (tr) => tr.voice === 'whistle') && has('map1', (tr) => tr.voice === 'clap'), 'Blossom Bay: a whistled hook and handclaps');
  t.ok(has('map2', (tr) => tr.role === 'theme' && tr.motif === 'rawclaw' && tr.voice === 'synth'), 'Scrollopolis: RawClaw\'s figure on the synth');
  for (const id of ['combat1', 'combat2', 'combat3', 'elite', 'boss1', 'boss2', 'boss3']) t.ok(['kick', 'throat'].every((v) => has(id, (tr) => tr.voice === v && tr.layer === 0)) || (has(id, (tr) => tr.voice === 'kick' && tr.layer === 0) && has(id, (tr) => tr.role === 'bass' && tr.layer === 0)), id + ': the beatbox kick and a bass in the groove layer');
  for (const id of L.music) t.ok(!descs[id].tracks.some((tr) => GONE.indexOf(tr.voice) >= 0), id + ' uses only the band');
});
t.test('beat grids are 16 steps and expand into one track per voice they use', () => {
  const VOICE = { B: 'kick', b: 'kick', K: 'snare', k: 'snare', t: 'hat', T: 'hat', s: 'scratch', c: 'clap' };
  const GRIDS = { bootsCats: ['B.t.K.t.B.t.K.t.', 'B.tBK.t..BtBK.tK'], boomBap: ['B...t.K.b.t.K.t.', 'B..bt.K.b.tBK.t.'], combat: ['B.tkK.tbB.tkK.tk', 'B.tkK.tBb.tkKktk'], crisp: ['B.t.K.t.B.t.K.t.'], shanty: ['B..cB..cB..cBccc'], fourFloor: ['B.t.B.tKB.t.B.tK'] };
  for (const g2 of Object.values(GRIDS)) for (const bar of g2) t.eq(bar.length, 16, 'a grid bar has 16 steps: ' + bar);
  // title plays boomBap: kick, snare and hat, one track each, step for step
  const d = descs.title, bars = d.loopBars, beats = d.tracks.filter((tr) => tr.role === 'beat');
  t.deep(beats.map((tr) => tr.voice), ['kick', 'snare', 'hat'], 'boomBap expands into kick, snare and hat tracks');
  for (const tr of beats) {
    const want = [];
    for (let b = 0; b < bars; b++) { const bar = GRIDS.boomBap[b % 2]; for (let s = 0; s < 16; s++) if (VOICE[bar[s]] === tr.voice) want.push(b * 4 + s * 0.25); }
    t.deep(tr.notes.map((n) => n.t), want, 'title ' + tr.voice + ' follows the grid');
  }
  t.deep(descs.boss1.tracks.filter((tr) => tr.role === 'beat' && tr.layer === 0).map((tr) => tr.voice), ['kick', 'clap'], 'the shanty is kick and clap');
  t.ok(descs.combat3.tracks.filter((tr) => tr.role === 'beat' && tr.layer === 0).every((tr) => tr.human === 0), 'the crisp grid is machine tight (human 0)');
  t.ok(descs.hero_select.tracks.find((tr) => tr.voice === 'kick').notes.some((n) => n.hit === 'boots') && descs.hero_select.tracks.find((tr) => tr.voice === 'snare').notes.some((n) => n.hit === 'cats'), 'boots and cats');
  for (const id of L.music) for (const tr of descs[id].tracks.filter((x) => x.role === 'beat')) t.ok(tr.notes.every((n) => Math.abs(n.t * 8 - Math.round(n.t * 8)) < 1e-6), id + ' ' + tr.voice + ' sits on the sixteenth grid (or a 32nd off it)');
});
t.test('theme tracks play the motif exactly, in the key', () => {
  const M = AUDIO.MOTIFS;
  t.deep(M.jasmin.notes.map((x) => x[0]), [0, 2, 4, 7, 9, 7, 4, 2], 'Jasmin\'s theme: up the arpeggio to the tenth and home');
  t.deep(M.human.notes.map((x) => x[0]), [4, 5, 4, 2, 1, 2, 4, 7, 6, 4], 'the Human theme, an original four-bar tune');
  t.deep(M.human.notes.map((x) => x[1]), [3, 1, 2, 2, 1, 1, 1, 1, 2, 2], 'in its rhythm: four bars of 4/4');
  t.deep(M.rawclaw.notes.map((x) => x[0]), [4, 2, 0], 'RawClaw\'s figure');
  t.deep(M.andy.notes.map((x) => x[0]), [0, null, 0, 7, 6, null, 4, 5], 'Andy\'s riff');
  let checked = 0;
  for (const id of L.music) {
    const d = descs[id], n7 = d.scaleIntervals.length, bpb = d.beatsPerBar;
    const deg = (m) => n7 * Math.floor((m - d.tonic) / 12) + d.scaleIntervals.indexOf(mod(m - d.tonic, 12));
    for (const tr of d.tracks.filter((x) => x.role === 'theme')) {
      const mo = M[tr.motif], played = mo.notes.filter((x) => x[0] != null);
      t.ok(!!mo, id + ' theme names a motif: ' + tr.motif);
      // split the track into statements: a statement starts wherever the motif's first degree returns after a full statement
      const per = played.length, stmts = [];
      for (let i = 0; i < tr.notes.length; i += per) stmts.push(tr.notes.slice(i, i + per));
      for (const s of stmts) {
        const off = deg(s[0].midi) - played[0][0];
        t.ok(off % n7 === 0, id + ' ' + tr.motif + ' is quoted in the key (octave shift ' + off + ')');
        const k = s.length;
        t.deep(s.map((n) => deg(n.midi) - off), played.slice(0, k).map((x) => x[0]), id + ' ' + tr.motif + ' degrees, note for note');
        const stretch = s.length > 1 ? (s[1].t - s[0].t) / mo.notes[0][1] : 1;
        let tt = s[0].t, j = 0;
        for (const x of mo.notes) { if (j >= k) break; if (x[0] != null) { t.near(s[j].t, tt, 1e-6, id + ' ' + tr.motif + ' rhythm at note ' + j); j++; } tt += x[1] * stretch; }
        checked++;
      }
      t.ok(tr.notes.every((n) => n.t + n.dur <= d.beats + 1e-6 && n.t >= (tr.section === 'loop' ? d.introBeats : 0) - 1e-9), id + ' ' + tr.motif + ' stays inside its section (' + bpb + '/4)');
    }
  }
  t.ok(checked >= 14, 'checked ' + checked + ' statements');
  const fin = descs.final.tracks.find((tr) => tr.role === 'theme' && tr.voice === 'croon');
  t.eq(fin.notes.length, 40, 'Jasmin sings the Human theme four times in the final loop');
  const choir = descs.final.tracks.filter((tr) => tr.voice === 'choir');
  t.deep(choir.map((tr) => tr.role), ['theme', 'theme-harmony'], 'the crowd sings along in unison, then in thirds (a harmony track)');
  const harm = choir[1].notes, uni = choir[0].notes.filter((n) => n.t >= harm[0].t - 1e-9);
  t.ok(harm.length === 10 && harm.every((n, i) => { const iv = mod(n.midi - uni[i].midi, 12); return iv === 3 || iv === 4; }), 'the harmony is a diatonic third above the tune');
  const vic = descs.victory.tracks.filter((tr) => tr.section === 'stinger' && tr.role === 'theme');
  t.ok(vic.length === 2 && vic.every((tr) => tr.motif === 'human' && tr.notes.length === 4), 'the victory stinger is the Human theme\'s first two bars, sung with the crowd');
  t.ok(descs.victory.tracks.some((tr) => tr.section === 'loop' && tr.motif === 'jasmin' && tr.voice === 'croon') && descs.defeat.tracks.some((tr) => tr.section === 'loop' && tr.motif === 'jasmin' && tr.voice === 'glock'), 'Jasmin\'s theme closes the victory loop and plays as a music box in the intermission');
});
t.test('the Human theme cracks on the high note, and the kick under it lands a 32nd late', () => {
  const d = descs.final, croon = d.tracks.find((tr) => tr.role === 'theme' && tr.voice === 'croon');
  const high = croon.notes.filter((n) => n.crack);
  t.eq(high.length, 4, 'one cracked high note per statement');
  t.ok(high.every((n) => n.scoop === 40), 'with a 40 cent scoop');
  const kick = d.tracks.find((tr) => tr.voice === 'kick' && tr.layer === 1);
  for (const bar of [2, 6, 10, 14]) {
    const t0 = (d.introBars + bar) * 4;
    t.ok(kick.notes.some((n) => near(n.t, t0 + 0.125, 1e-6)) && !kick.notes.some((n) => near(n.t, t0, 1e-6)), 'bar ' + (bar + 1) + ' of the loop: the kick is a hair late');
  }
  t.ok(d.tracks.filter((tr) => tr.section === 'intro').every((tr) => tr.grid && tr.human === 0), 'the intro is the Gloss: dead on the grid');
  t.ok(d.tracks.some((tr) => tr.section === 'intro' && tr.voice === 'vox' && tr.notes.every((n) => n.robot)), 'and the Gloss lip-syncs (robot vox)');
});
t.test('the quant groove: the Perfect Stage starts dead on the grid and learns to swing', () => {
  for (const id of L.music) {
    const q = descs[id].quant;
    if (QUANT.indexOf(id) < 0) { t.eq(q, null, id + ' has no quant drive'); continue; }
    t.ok(q && q.swing > 0 && q.swing <= 0.2 && q.human > 0 && q.full > 0 && q.full <= 1, id + ' quant ' + JSON.stringify(q));
  }
  t.deep(QUANT.map((id) => descs[id].quant.swing), [0.14, 0.1, 0.06, 0.12], 'swing.to of map3, combat3, boss3 and final (HV_ART_AUDIO 10.5)');
  const gg = live();
  const A = gg.AUDIO;
  A.intensity(0); A.music('combat3'); advance(gg, 300);
  let dk = A.debug().decks.find((x) => x.id === 'combat3');
  t.ok(dk.swing === 0 && dk.human === 0, 'combat3 at intensity 0: no swing, no human timing');
  A.intensity(1);
  dk = A.debug().decks.find((x) => x.id === 'combat3');
  t.near(dk.swing, descs.combat3.quant.swing, 1e-9, 'at intensity 1 it reaches swing.to');
  t.near(dk.human, descs.combat3.quant.human, 1e-9, 'and human.to');
  A.intensity(0.5);
  t.near(A.debug().decks.find((x) => x.id === 'combat3').swing, descs.combat3.quant.swing / 2, 1e-9, 'halfway at 0.5');
  A.awake(0.06); A.music('map3'); advance(gg, 300);
  dk = A.debug().decks.find((x) => x.id === 'map3' && !x.dying);
  t.ok(dk.swing === 0 && dk.human === 0, 'map3 while the Act is muted: dead on the grid');
  A.awake(1);
  dk = A.debug().decks.find((x) => x.id === 'map3' && !x.dying);
  t.near(dk.swing, 0.14, 1e-9, 'map3 unmuted: it swings');
  A.intensity(0.5); A.music('final'); advance(gg, 300);
  dk = A.debug().decks.find((x) => x.id === 'final' && !x.dying);
  t.near(dk.swing, 0.12, 1e-9, 'final swings fully from the Gloss\'s last form (intensity 0.5)');
  A.music('combat1'); advance(gg, 300);
  dk = A.debug().decks.find((x) => x.id === 'combat1' && !x.dying);
  t.ok(dk.swing === 0 && dk.human === 1, 'a plain fight keeps its human timing and no swing');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
  // swing moves only the odd sixteenths of a swung deck (by swing of a sixteenth), and never a grid track: an offline render of
  // four hats at 120 bpm (a sixteenth is 0.125 s) with swing 0.2 at full drive
  const g3 = fresh(), W = g3._win;
  g3._run(`globalThis.__bs = []; const cb = OfflineAudioContext.prototype.createBufferSource;
    OfflineAudioContext.prototype.createBufferSource = function () { const s = cb.call(this); const st = s.start; s.start = function (w) { __bs.push(w); return st.apply(s, arguments); }; return s; };`);
  const mk = (grid) => ({ id: 'swing-' + grid, tempo: 120, layers: 1, thresholds: [0], drive: 'intensity', hush: null, swing: 0, quant: { swing: 0.2, human: 1, full: 1 }, introBeats: 0, loopBeats: 4, beats: 4, beatsPerBar: 4,
    tracks: [{ voice: 'hat', role: 'beat', layer: 0, gain: 1, pan: 0, range: [24, 100], human: 0, grid, notes: [0, 0.25, 0.5, 0.75].map((x) => ({ t: x, dur: 0.25, midi: 72, vel: 0.5 })) }] });
  const starts = (desc, x) => { g3._run('__bs.length = 0'); const off = new W.OfflineAudioContext(2, 44100, 44100); g3.AUDIO.render(off, off.destination, desc, { intensity: x }); return g3._run('__bs').map((v) => Math.round(v * 1000)); };
  t.deep(starts(mk(false), 1), [0, 150, 250, 400], 'at drive 1 the odd sixteenths are 0.2 of a sixteenth late');
  t.deep(starts(mk(false), 0), [0, 125, 250, 375], 'at drive 0 they are dead on the grid');
  t.deep(starts(mk(true), 1), [0, 125, 250, 375], 'a grid track never swings');
});

// ------------------------------------------------------------------------------------------------ 4. sfx recipes
const FILTERS = ['lowpass', 'highpass', 'bandpass', 'notch'];
const WAVES = ['sine', 'triangle', 'square', 'sawtooth'];
t.test('every sfx id has a valid recipe', () => {
  t.eq(AUDIO.sfxRecipe('nope'), null, 'unknown id gives null');
  t.eq(AUDIO.sfxRecipe('hit_light.kuro'), null, 'a variant that does not exist gives null');
  for (const id of L.sfx.concat(AUDIO.VARIANTS)) {
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
t.test('per-hero variants: every key names a sound and a hero, and each one sounds like its hero', () => {
  const heroes = L.heroIds, bases = ['card_play_attack', 'card_play_skill', 'card_play_power', 'swap', 'hero_down', 'hero_revive'];
  t.eq(AUDIO.VARIANTS.length, 24, 'six sounds, four heroes');
  for (const k of AUDIO.VARIANTS) {
    const [id, hero, extra] = k.split('.');
    t.ok(L.sfx.indexOf(id) >= 0 && heroes.indexOf(hero) >= 0 && extra === undefined, k + ' names a LISTS.sfx id and a LISTS.heroIds id');
  }
  for (const id of bases) for (const h of heroes) t.ok(AUDIO.VARIANTS.indexOf(id + '.' + h) >= 0, id + ' has a ' + h + ' variant');
  const voices = (k) => AUDIO.sfxRecipe(k).layers.filter((ly) => ly.k === 'voice').map((ly) => ly.v);
  for (const id of bases) {
    const r = AUDIO.sfxRecipe(id + '.hanae'), b = AUDIO.sfxRecipe(id);
    t.ok(r.cd === b.cd && r.pri === b.pri && r.duck === b.duck, id + ' variants keep the base cooldown, priority and duck');
  }
  t.ok(['card_play_attack', 'card_play_skill', 'card_play_power', 'swap', 'hero_down', 'hero_revive'].every((id) => voices(id + '.hanae').indexOf('croon') >= 0), 'Jasmin sings every one of hers (croon)');
  t.ok(['card_play_attack', 'card_play_skill', 'card_play_power', 'swap', 'hero_revive'].every((id) => voices(id + '.kuro').some((v) => ['kick', 'snare', 'hat'].indexOf(v) >= 0)), 'RoxorLoops beatboxes his');
  t.ok(['card_play_attack', 'card_play_skill', 'card_play_power', 'swap', 'hero_down', 'hero_revive'].every((id) => voices(id + '.raiga').indexOf('ebass') >= 0 || AUDIO.sfxRecipe(id + '.raiga').layers.some((ly) => ly.k === 'osc' && (ly.f2 || ly.f) < 130)), 'Andy plays bass on his');
  const pew = AUDIO.sfxRecipe('card_play_attack.suzu').layers.find((ly) => ly.v === 'synth');
  t.ok(pew && pew.hit === 'zap', 'RawClaw\'s attack is a synth pew');
  const seen = new Set(AUDIO.VARIANTS.map((k) => JSON.stringify(AUDIO.sfxRecipe(k).layers)));
  t.eq(seen.size, AUDIO.VARIANTS.length, 'no two variants share a layer stack');
});
t.test('hits: light, heavy, crit and multi are distinct in build and weight', () => {
  const r = (id) => AUDIO.sfxRecipe(id);
  const weight = (x) => x.layers.reduce((s, ly) => s + (ly.k === 'voice' ? ly.vel * 0.5 : ly.g) * Math.min(ly.d, 0.4), 0);
  const light = r('hit_light'), heavy = r('hit_heavy'), crit = r('hit_crit'), multi = r('hit_multi');
  t.ok(weight(heavy) > weight(light) * 1.5, 'heavy carries more weight than light');
  t.ok(heavy.duck > light.duck && crit.duck >= heavy.duck, 'heavier hits duck the music more');
  t.ok(crit.layers.some((ly) => ly.k === 'fm') && !heavy.layers.some((ly) => ly.k === 'fm'), 'a crit rings, a heavy hit does not');
  t.ok(new Set(multi.layers.filter((ly) => ly.k === 'noise').map((ly) => ly.t)).size >= 3, 'multi is three strikes');
  t.ok(heavy.dur > light.dur, 'heavy lasts longer than light');
  t.ok(Math.min(...heavy.layers.filter((ly) => ly.k === 'osc').map((ly) => ly.f2 || ly.f)) < 60, 'heavy drops to a real thump');
  t.ok(heavy.layers.some((ly) => ly.k === 'noise' && ly.ft === 'bandpass' && ly.f >= 1500), 'and has a crack on top so it survives small speakers');
});
t.test('elements and moments sound like themselves (HV_ART_AUDIO 10.8)', () => {
  const r = (id) => AUDIO.sfxRecipe(id);
  const vs = (id, v) => r(id).layers.filter((ly) => ly.k === 'voice' && ly.v === v);
  t.ok(r('flame').layers.filter((ly) => ly.k === 'noise').length >= 6 && r('flame').layers.some((ly) => ly.k === 'noise' && ly.ft === 'highpass'), 'Sizzle is a "tssss" with crackle pops');
  t.ok(r('ice').layers.filter((ly) => ly.k === 'fm').length >= 3 && vs('ice', 'glock').length >= 1, 'ice is a glassy glock TING');
  t.ok(r('zap').layers.some((ly) => ly.k === 'osc' && ly.vib && ly.f2 < ly.f && ly.f2 < 60) && r('zap').layers.filter((ly) => ly.k === 'noise').length >= 4, 'zap is Andy\'s WOMP: a wobbling sub falling, with a crackle');
  t.ok(vs('poison_tick', 'vox').length >= 3 && vs('poison_tick', 'vox').every((ly) => ly.vowel === 'a'), 'an Earworm tick is a tiny "na-na-na"');
  t.ok(r('thorn').layers.some((ly) => ly.k === 'osc' && ly.f >= 2500 && ly.f <= 3000), 'Feedback is a short mic squeal near 2.8 kHz');
  t.ok(r('page_turn').layers.filter((ly) => ly.k === 'noise').length >= 2 && vs('page_turn', 'snare').some((ly) => ly.hit === 'k'), 'a segue is a camera shutter and a beatboxed click');
  t.ok(r('gold').layers.filter((ly) => ly.k === 'fm').length >= 2, 'coins clink');
  t.ok(r('gem_socket').layers.filter((ly) => ly.k === 'fm').length >= 2 && r('gem_socket').layers.some((ly) => ly.k === 'noise'), 'a gem clicks in and chimes');
  t.ok(vs('relic_get', 'glock').length >= 4 && vs('relic_get', 'vox').some((ly) => ly.syl === 'tada') && vs('relic_get', 'kick').length >= 1, 'a Charm is a vox ta-da, a glock arpeggio and a kick');
  t.ok(vs('level_up', 'glock').length >= 4 && vs('level_up', 'vox').length >= 1, 'level up rises on glock with a "yeah"');
  t.ok(vs('paint', 'vox').length >= 1 && vs('ink_splash', 'clap').filter((ly) => ly.hit === 'snap').length >= 2, 'an unmuted hex is a sung "ta", a find is two finger clicks');
  const zip = r('chest_open').layers.find((ly) => ly.k === 'noise' && ly.f2 >= ly.f * 2);
  t.ok(zip && vs('chest_open', 'glock').length >= 3, 'a Gift Box zips open and sparkles');
  t.ok(r('boss_die').dur >= 2 && r('boss_die').duck >= 1000 && r('boss_intro').duck >= 1000, 'Headliner moments are big and duck the music');
  t.ok(vs('boss_die', 'choir').length >= 1 && vs('boss_die', 'glock').map((ly) => ly.m).join() === '81,83', 'a Headliner won over: the crowd cheers and the glock plays the Human theme\'s first bar');
  t.ok(r('boss_intro').layers.filter((ly) => ly.k === 'noise' && ly.ft === 'lowpass').length >= 3, 'Headliner reveal: three stage-light switches');
  t.ok(vs('phase_change', 'scratch').length >= 1 && vs('phase_change', 'kick').length >= 1, 'a new form: a record scratch and a boom');
  t.ok(r('block_break').layers.some((ly) => ly.k === 'fm') && r('block_break').layers.some((ly) => ly.k === 'noise' && ly.ft === 'highpass'), 'block_break pops a bubble and sparkles');
  t.ok(vs('heal', 'choir').length >= 3 && vs('heal', 'glock').length >= 3, 'Warm Tea is a choir "aah" and a glock run');
  t.ok(vs('buff', 'vox').some((ly) => ly.syl === 'hey'), 'Hype is a rising "hey!"');
  t.ok(vs('card_play_attack', 'kick').length === 1 && vs('card_play_attack', 'snare').length === 1, 'an Attack is a beatbox "pkah"');
  t.ok(vs('shuffle', 'scratch').length === 2, 'a reshuffle is a vocal scratch, "wikka wikka"');
  t.ok(vs('victory', 'croon').map((ly) => ly.m).join() === '69,71', 'the victory sting quotes the Human theme\'s first two notes on croon');
  for (const id of L.sfx) t.ok(!r(id).layers.some((ly) => GONE.indexOf(ly.v) >= 0), id + ' uses only the band');
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
t.test('AUDIO.sfx(id, {hero}) plays the hero\'s variant, under the base id\'s cooldown', () => {
  const gg = live();
  const A = gg.AUDIO, au = gg._audio, W = gg._win;
  const kinds = ['oscillator', 'bufferSource', 'biquad'];
  const snap = () => kinds.map((k) => au.created[k] || 0);
  const delta = (a) => snap().map((v, i) => v - a[i]);
  const offline = (key) => { const s = snap(); const off = new W.OfflineAudioContext(2, 44100, 44100); A.renderSfx(off, off.destination, key, { pan: 0.3, seed: 3 }); return delta(s); };
  for (const h of L.heroIds) {
    gg._advance(400, 20);
    const s = snap();
    t.eq(A.sfx('card_play_attack', { hero: h }), true, 'card_play_attack for ' + h);
    t.deep(delta(s), offline('card_play_attack.' + h), h + ' hears the ' + h + ' variant (same nodes as its recipe)');
  }
  gg._advance(400, 20);
  let s = snap();
  A.sfx('card_play_attack', { hero: 'nobody' });
  t.deep(delta(s), offline('card_play_attack'), 'an unknown hero plays the base recipe');
  gg._advance(400, 20);
  s = snap();
  A.sfx('hit_light', { hero: 'kuro' });
  t.deep(delta(s), offline('hit_light'), 'an id without variants plays its base recipe for any hero');
  gg._advance(400, 20);
  t.eq(A.sfx('card_play_attack', { hero: 'kuro' }), true, 'a variant plays');
  t.eq(A.sfx('card_play_attack', { hero: 'hanae' }), false, 'and the base id\'s cooldown covers every variant');
  t.eq(A.sfx('card_play_attack'), false, 'and the base itself');
  t.eq(A.sfx('card_play_attack.kuro'), false, 'a variant key is not an sfx id');
  gg._advance(8000, 100);
  t.eq(A.debug().live, 0, 'everything ended');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
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
    else if (r < 0.77) A.wake(rnd.int(0, 20), rnd.int(0, 12), { chapter: rnd.int(1, 3), seed: 7, song: rnd() < 0.5 ? undefined : rnd.pick(Object.keys(gg.DATA.brushes)), i: rnd.int(0, 6), aq: 3, ar: 5 });
    else if (r < 0.78) A.awake(rnd());
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
  const m3 = A.compose('map3'), [o3, g3] = mk(), [o4, g4] = mk();
  t.ok(A.render(o3, g3.music, m3, { intensity: 0 }).notes < A.render(o4, g4.music, m3, { intensity: 1 }).notes, 'a map track renders fewer notes asleep (wake level 0) than awake (1)');
});
t.test('every sfx recipe and every voice renders offline, also at the edges', () => {
  const gg = fresh();
  const A = gg.AUDIO, W = gg._win;
  const off = new W.OfflineAudioContext(2, 44100 * 4, 44100), gr = A.graph(off);
  for (const id of L.sfx.concat(A.VARIANTS)) {
    const r = A.renderSfx(off, gr.sfx, id, { t0: 0.1, seed: 5 });
    t.ok(r && near(r.end, 0.1 + A.sfxRecipe(id).dur, 0.001), id + ' renders and ends where the recipe says');
  }
  t.eq(A.renderSfx(off, gr.sfx, 'nope'), null, 'unknown sfx renders nothing');
  const edges = [{ midi: 24, dur: 0.01, vel: 0, r: 0 }, { midi: 60, dur: 0.5, vel: 1, r: 1 }, { midi: 110, dur: 30, vel: 0.5, r: 0.5 }, { midi: 48, dur: 2, vel: 0.3, r: 0.2, hit: 'ka', big: 1, double: 1, bend: 2 },
    { midi: 40, dur: 0.3, vel: 0.9, r: 0.4, bend: -7, crack: 1, scoop: 40, robot: 1, whisper: 1, vowel: 'oo' }];
  for (const hit of ['boots', 'pf', 'k', 'cats', 'open', 'snap', 'slap', 'pop', 'pluck', 'zap', 'laser', 'hiss']) edges.push({ midi: 52, dur: 0.4, vel: 0.8, r: 0.6, hit });
  for (const v of A.VOICES) {
    for (const n of edges) t.eq(A.voice(v, off, gr.music, 0.05, n), true, v + ' renders ' + JSON.stringify(n));
  }
  t.eq(A.voice('kazoo', off, gr.music, 0, {}), false, 'unknown voice is refused');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('rendering is deterministic: the same description builds the same graph', () => {
  const W = g._win, A = AUDIO;
  const count = () => { const off = new W.OfflineAudioContext(2, 44100, 44100), gr = A.graph(off); const before = off._nodes; A.render(off, gr.music, A.compose('boss2'), { intensity: 1 }); return off._nodes - before; };
  t.eq(count(), count(), 'same number of nodes');
});

// ------------------------------------------------------------------------------------------------ 7. the melodic reveal, the map mute, the Tea Stall, the vox voice
const echoInfo = (ch, seed) => ({ chapter: ch, seed, cols: 21, rows: 13 });
const hexQ = (col, r) => col - Math.floor(r / 2);
t.test('reveal: every hex of a map owns a note on the pentatonic subset of its Act key, and the tune belongs to the map', () => {
  const g2 = fresh();
  for (const ch of [1, 2, 3]) {
    const d = descs['map' + ch], info = echoInfo(ch, 1234), penta = pentaOf(d.scale);
    let bad = 0, offPenta = 0, outside = 0, differ = 0;
    for (let r = 0; r <= 12; r++) for (let col = 0; col <= 20; col++) {
      const n = AUDIO.hexNote(hexQ(col, r), r, info), n2 = g2.AUDIO.hexNote(hexQ(col, r), r, info);
      if (!Number.isInteger(n.midi) || SCALE[d.scale].indexOf(mod(n.midi - d.tonic, 12)) < 0) bad++;
      if (penta.indexOf(mod(n.midi - d.tonic, 12)) < 0) offPenta++;
      if (!(n.deg >= -4 && n.deg <= 9)) outside++;
      if (n.midi !== n2.midi || n.deg !== n2.deg) differ++;
    }
    t.eq(bad, 0, 'Act ' + ch + ': every hex is a whole note of ' + d.scale + ' in the key of ' + d.id);
    t.eq(offPenta, 0, 'Act ' + ch + ': and of its pentatonic subset, so a wake note can never clash');
    t.eq(outside, 0, 'Act ' + ch + ': degrees stay in -4..9');
    t.eq(differ, 0, 'Act ' + ch + ': the same map sounds the same across fresh boots');
  }
  let steps = 0, small = 0, leap = 0, fewDegrees = 0;
  for (let seed = 0; seed < 50; seed++) for (const ch of [1, 2, 3]) {
    const row = []; for (let col = 0; col <= 20; col++) row.push(AUDIO.hexNote(hexQ(col, 6), 6, echoInfo(ch, seed)).deg);
    for (let i = 1; i < row.length; i++) { const dd = Math.abs(row[i] - row[i - 1]); steps++; if (dd <= 1) small++; if (dd > 2) leap++; }
    if (new Set(row).size < 3) fewDegrees++;
  }
  t.eq(leap, 0, 'neighbouring columns never differ by more than 2 degrees');
  t.ok(small / steps >= 0.7, 'the tune moves mostly by step: ' + (small / steps).toFixed(2));
  t.eq(fewDegrees, 0, 'every contour uses at least 3 degrees');
  for (let c = 6; c <= 20; c++) t.ok(AUDIO.hexNote(c, 0, echoInfo(1, 9)).deg >= AUDIO.hexNote(c - 6, 12, echoInfo(1, 9)).deg, 'up the map is up the scale at column ' + c);
  let cols = 0; for (let col = 0; col <= 20; col++) if (AUDIO.hexNote(hexQ(col, 6), 6, echoInfo(2, 1)).deg !== AUDIO.hexNote(hexQ(col, 6), 6, echoInfo(2, 2)).deg) cols++;
  t.ok(cols >= 5, 'seeds 1 and 2 differ in ' + cols + ' columns');
  t.ok(Number.isInteger(AUDIO.hexNote(3, 3).midi) && Number.isInteger(AUDIO.hexNote(-50, 99, { chapter: 9 }).midi), 'missing or wild info never throws');
});
t.test('reveal: each Spell sings its shape and its gesture', () => {
  const brushes = Object.keys(DATA.brushes).sort();
  t.deep(Object.keys(AUDIO.SONGS).filter((k) => k !== 'single' && k !== 'step').sort(), brushes, 'SONGS has one entry per DATA.brushes id');
  t.eq(AUDIO.songDegrees('stroke', 3, 2), null, 'Boots and Cats: every cell its own note');
  t.deep(AUDIO.songDegrees('wave', 5, 1), [1, 2, 3, 4, 5], 'Vocal Run is a rising run');
  t.deep(AUDIO.songDegrees('fan', 3, 0), [0, 2, 4], 'Air Horn strums a triad');
  t.eq(AUDIO.songDegrees('splash', 7, 3)[0], -2, 'Abracadabass: the centre drops an octave');
  const h = AUDIO.songDegrees('halo', 6, 0);
  t.ok(h.length === 6 && h.every((x, i) => i === 0 || x > h[i - 1]), 'Surround Sound rises: ' + h);
  t.eq(AUDIO.songDegrees('nope', 3, 0), null, 'unknown Spell is null');
  const info = echoInfo(1, 5);
  t.eq(AUDIO.wakeDegree(4, 4, info), AUDIO.hexNote(4, 4, info).deg, 'without an anchor a cell sings its own hexNote');
  t.eq(AUDIO.wakeDegree(4, 4, Object.assign({}, info, { aq: null, ar: null, song: 'wave', i: 2 })), AUDIO.hexNote(4, 4, info).deg, 'a null anchor is no anchor');
  const root = AUDIO.hexNote(3, 5, info).deg;
  t.eq(AUDIO.wakeDegree(4, 4, Object.assign({}, info, { aq: 3, ar: 5, song: 'wave', i: 2 })), root + 2, 'with an anchor a Vocal Run cell sings its place in the run');
  const S = AUDIO.SONGS;
  t.deep(S.single.byVerse, ['glock', 'synth', 'glock'], 'one voice per Act: glock (sunny), synth pluck (neon), glock (dry, the Perfect Stage)');
  t.deep(S.single.echoByVerse, [1, 1, 0.4], 'and the Perfect Stage is the driest');
  t.deep(S.stroke.kit, ['boots', 'ts', 'cats', 'ts'], 'Boots and Cats speaks the classic pattern');
  t.ok(S.wave.v === 'croon' && S.wave.dbl === 'glock', 'Vocal Run is sung (croon), doubled softly by glock');
  t.ok(S.fan.v === 'synth' && S.fan.horn, 'Air Horn: a synth triad and a beatboxed air horn');
  t.ok(S.splash.v === 'glock' && S.splash.abra, 'Abracadabass: "a-bra-ca", a throat-bass drop, then the ring of glock');
  t.ok(S.halo.v === 'choir' && S.halo.circle && S.halo.pad, 'Surround Sound: stacked "ooh" voices panned round a circle');
  t.ok(S.blot.v === 'glock' && S.blot.tada, 'Hocus Focus: a bright ting and a whispered ta-da');
  t.eq(S.step.v, 'vox', 'a walked hex still hums');
});
t.test('reveal: every Spell gesture sings live with its voices', () => {
  const gg = live();
  const A = gg.AUDIO, au = gg._audio, info = echoInfo(1, 4);
  gg._run(`globalThis.__pan = []; const pc = AudioContext.prototype.createStereoPanner; AudioContext.prototype.createStereoPanner = function () { const n = pc.call(this); __pan.push(n); return n; };`);
  for (let i = 0; i < 6; i++) { gg._advance(400, 20); A.wake(5 + i, 4, Object.assign({ song: 'halo', i, n: 6, aq: 5, ar: 4 }, info)); }
  const pans = gg._run('__pan').map((p) => Math.round(p.pan.value * 100) / 100).filter((v) => v !== -0.55 && v !== 0.55);
  t.ok(new Set(pans).size >= 4 && pans.some((v) => v > 0.3) && pans.some((v) => v < -0.3), 'Surround Sound pans its voices round a circle: ' + pans.join(' '));
  for (const song of brushes()) {
    gg._advance(1500, 20);
    const s0 = au.started;
    t.eq(A.wake(5, 4, Object.assign({ song, i: 0, n: 3, aq: 5, ar: 4 }, info)), true, song + ' sings its first cell');
    t.ok(au.started - s0 >= 3, song + ' starts a gesture of several sources (' + (au.started - s0) + ')');
  }
  A.awake(1);
  gg._advance(1500, 20);
  const s1 = au.started; A.wake(6, 4, echoInfo(3, 4)); const act3 = au.started - s1;
  A.awake(0.06); gg._advance(1500, 20);
  const s2 = au.started; A.wake(7, 4, echoInfo(3, 4)); const muted = au.started - s2;
  t.ok(act3 > muted, 'on the Perfect Stage a soft croon doubles the glock once it is more than half unmuted (' + muted + ' then ' + act3 + ' sources)');
  gg._advance(10000, 100);
  t.eq(A.debug().live, 0, 'nothing is left ringing');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
  function brushes() { return Object.keys(gg.DATA.brushes); }
});
t.test('reveal: a wake note plays live, never before init, muted or suspended, and a storm is capped', () => {
  t.eq(fresh().AUDIO.wake(3, 3, echoInfo(1, 1)), false, 'dropped before init');
  const gg = live();
  const A = gg.AUDIO, au = gg._audio, info = echoInfo(1, 1);
  const n0 = au.started;
  t.eq(A.wake(3, 3, info), true, 'plays live');
  t.ok(au.started > n0, 'and starts sources');
  gg._advance(2000, 20);
  A.setVolume('sfx', 0);
  const n1 = au.started;
  t.eq(A.wake(4, 3, info), false, 'Effects at 0 drops it');
  t.eq(au.started, n1, 'with no source built (true mute)');
  A.setVolume('sfx', 0.8);
  A.suspend();
  t.eq(A.wake(4, 3, info), false, 'suspended drops it');
  A.resume();
  gg._advance(2000, 20);
  let ok = 0; for (let i = 0; i < 60; i++) if (A.wake(i % 20, 3, info)) ok++;
  t.ok(ok >= 5 && ok <= 12, 'a storm at one instant is capped by the token bucket: ' + ok + ' of 60');
  t.eq(A.wake(2, 2, Object.assign({ last: true }, info)), true, 'a cadence (last) always plays');
  t.eq(A.wake(NaN, 2, info), false, 'garbage coordinates are dropped');
  for (const song of Object.keys(DATA.brushes).concat(['single', 'step', 'nope'])) {
    gg._advance(1500, 20);
    for (let i = 0; i <= 6; i++) A.wake(5 + i, 4, Object.assign({ song, i, n: 7, aq: 5, ar: 4, soft: song === 'step' }, info));
  }
  t.eq(gg._uncaught.length, 0, 'every Spell sings without a throw');
  gg._advance(10000, 100);
  t.eq(A.debug().live, 0, 'nothing is left ringing');
  t.eq(au.stopped, au.started, 'every source ended');
});
t.test('reveal: the delay send exists, is fed by wake notes, and is skipped when calm or lite; no delay node still works', () => {
  const gg = live();
  const A = gg.AUDIO, d = A.debug(), gr = d.graph, info = echoInfo(2, 3);
  t.ok(gr.echoIn && gr.echoDelay, 'the echo is built');
  t.ok(reaches(gr.echoIn, gr.sfxBus) && reaches(gr.echoIn, d.ctx.destination), 'and reaches the sfx bus and the destination');
  gg._run(`globalThis.__g = []; const gc = AudioContext.prototype.createGain; AudioContext.prototype.createGain = function () { const n = gc.call(this); __g.push(n); return n; };`);
  const sent = () => gg._run('__g').some((n) => (n._out || []).indexOf(gr.echoIn) >= 0);
  t.eq(A.wake(3, 3, info), true, 'a wake note');
  t.ok(sent(), 'feeds the echo');
  gg._advance(2000, 20); gg._run('__g.length = 0');
  t.deep(A.options({ calm: true }), { calm: true, lite: false }, 'options returns the settings');
  t.eq(A.wake(4, 3, info), true, 'a wake note when calm');
  t.ok(!sent(), 'does not feed the echo when calm');
  A.options({ calm: false, lite: true }); gg._advance(2000, 20); gg._run('__g.length = 0');
  t.eq(A.wake(5, 3, info), true, 'a wake note when lite');
  t.ok(!sent(), 'does not feed the echo when lite');
  t.deep(A.options(), { calm: false, lite: true }, 'options() reads them back');
  t.deep(A.options('junk'), { calm: false, lite: true }, 'junk changes nothing');
  A.options({ lite: false }); gg._advance(2000, 20);
  t.eq(A.wake(6, 3, Object.assign({ soft: true }, info)), true, 'a soft step plays when not calm');
  A.options({ calm: true }); gg._advance(2000, 20);
  t.eq(A.wake(6, 3, Object.assign({ soft: true }, info)), false, 'and not when calm');
  const g3 = fresh();
  g3._run("AudioContext.prototype.createDelay = function () { throw new Error('no delay'); };");
  t.eq(g3.AUDIO.init({ force: true }), true, 'a missing delay node still builds the graph');
  t.eq(g3.AUDIO.debug().graph.echoIn, null, 'with no echo');
  t.eq(g3.AUDIO.wake(3, 3, info), true, 'and wake notes play dry');
  t.eq(g3._uncaught.length, 0, 'nothing threw');
});
t.test('the map sounds are re-voiced (ids kept)', () => {
  t.eq(L.sfx.length, 73, 'still 73 sound ids');
  for (const id of ['paint', 'ink_splash', 'brush_pick', 'brush_use', 'ink_gain', 'well', 'page_turn']) t.ok(L.sfx.indexOf(id) >= 0 && AUDIO.sfxRecipe(id), id + ' keeps its id and its recipe');
  t.eq(AUDIO.sfxRecipe('well').tune, 55, 'the Tea Stall is written in G');
  t.eq(AUDIO.sfxRecipe('paint').tune, 0, 'other recipes are never transposed');
  const pick = AUDIO.sfxRecipe('brush_pick').layers;
  t.deep(pick.filter((ly) => ly.v === 'glock').map((ly) => ly.m), [91, 88, 96], 'a Spell is learned with the three-note glock jingle (4, 2, 7 in C)');
  t.ok(pick.some((ly) => ly.v === 'vox' && ly.whisper), 'over a whispered "ooh"');
  const use = AUDIO.sfxRecipe('brush_use').layers;
  t.ok(use.some((ly) => ly.v === 'kick') && use.some((ly) => ly.syl === 'ab') && use.some((ly) => ly.syl === 'ra'), 'a Spell is cast with a sung "abra" and a downbeat kick');
});
t.test('the map mute: a map track is muffled, sparse and quiet while the Act is muted, and opens as it is unmuted', () => {
  for (const id of WOKEN) {
    const h = descs[id].hush;
    t.eq(descs[id].drive, 'awake', id + ' is driven by the unmute level');
    t.ok(h && h.lo >= 500 && h.lo <= 1000 && h.floor >= 0.75 && h.floor < 1, id + ' mute ' + JSON.stringify(h));
  }
  t.ok(descs.map3.hush.lo < descs.map1.hush.lo, 'the Perfect Stage is the most muffled');
  const gg = live();
  const A = gg.AUDIO, au = gg._audio;
  t.eq(A.awake(), 1, 'awake is 1 by default');
  A.awake(0.06);                                             // unmute level 0 whatever the calibration
  A.music('map1');
  advance(gg, 500);
  let deck = A.debug().decks[0];
  t.deep(deck.target, [1, 0, 0, 0], 'a muted Act plays the still bed only');
  t.ok(deck.lp.frequency.value < 1000 && deck.hg.gain.value < 0.9, 'muffled and quiet: ' + deck.lp.frequency.value + ' Hz, gain ' + deck.hg.gain.value);
  const a0 = au.started; advance(gg, 6000); const asleep = au.started - a0;
  A.awake(0.6);
  deck = A.debug().decks[0];
  t.deep(deck.target, [1, 1, 1, 1], 'a live Act plays the whole band');
  t.ok(deck.lp.frequency.value > 12000 && deck.hg.gain.value > 0.99, 'and the filter opens: ' + deck.lp.frequency.value + ' Hz');
  advance(gg, 1000);
  const a1 = au.started; advance(gg, 6000); const woken = au.started - a1;
  t.ok(woken > asleep * 1.3, 'a muted Act schedules fewer notes: ' + asleep + ' versus ' + woken);
  t.eq(A.intensity(), 0, 'intensity() stays out of it');
  A.intensity(1);
  t.deep(A.debug().decks[0].target, [1, 1, 1, 1], 'intensity does not move a map deck');
  A.awake(0.06);
  A.intensity(1);
  t.deep(A.debug().decks[0].target, [1, 0, 0, 0], 'even at full intensity a muted map stays muted');
  A.intensity(0);
  A.music('combat1');
  deck = A.debug().decks.find((x) => x.id === 'combat1');
  t.ok(!deck.lp && !deck.hg, 'a fight deck has no mute filter, so a fight is never muffled');
  t.deep(deck.target, [1, 0, 0, 0], 'a fight starts from its bed');
  t.eq(A.awake('x'), 1, 'garbage is live'); t.eq(A.awake(-2), 0, 'clamped low'); t.eq(A.awake(5), 1, 'clamped high');
  t.eq(A.awake(), 1, 'awake() reads it back');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('the Tea Stall: a cup clink and a gentle kettle whistle, tuned to the map it plays over', () => {
  const r = AUDIO.sfxRecipe('well');
  const whistle = r.layers.filter((ly) => ly.k === 'osc' && ly.f >= 500 && ly.f <= 1200);
  t.ok(whistle.length === 1 && whistle[0].d >= 1 && whistle[0].vib, 'one long kettle whistle with a wobble');
  t.ok(r.layers.filter((ly) => ly.k === 'fm').length >= 2, 'a cup clink (two glassy strikes)');
  t.ok(r.layers.some((ly) => ly.k === 'noise' && ly.q >= 6 && ly.f >= 700 && ly.f <= 900), 'a breathy whistle on the same pitch');
  t.ok(r.duck > 0 && r.tune === 55, 'it ducks the music and is tuned');
  const gg = live();
  const A = gg.AUDIO;
  gg._run(`globalThis.__f = []; const oc = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () { const o = oc.call(this); const s = o.frequency.setValueAtTime.bind(o.frequency); o.frequency.setValueAtTime = (v, t) => { __f.push(v); return s(v, t); }; return o; };`);
  const kettle = () => gg._run('__f').filter((f) => f >= 450 && f <= 1300)[0];
  const cents = (f, ref) => Math.abs(1200 * Math.log2(f / ref));
  const near12 = (f, ref) => Math.min(cents(f, ref), cents(f, ref * 2), cents(f, ref / 2));
  A.music('map2'); advance(gg, 300);
  gg._run('__f.length = 0'); A.sfx('well');
  t.ok(near12(kettle(), 880 * 760 / 784) <= 20, 'over the key of A the kettle sings in A: ' + kettle().toFixed(1) + ' Hz');
  advance(gg, 4000);
  A.music('map1'); advance(gg, 300);
  gg._run('__f.length = 0'); A.sfx('well');
  t.ok(near12(kettle(), 760) <= 20, 'over the key of G it sings in G: ' + kettle().toFixed(1) + ' Hz');
  advance(gg, 4000);
  A.music('map3'); advance(gg, 300);
  gg._run('__f.length = 0'); A.sfx('well');
  t.ok(near12(kettle(), 659.26 * 760 / 784) <= 20, 'over the key of E it sings in E: ' + kettle().toFixed(1) + ' Hz');
  advance(gg, 4000);
  A.music(null, { fade: 0.2 }); advance(gg, 5000);
  gg._run('__f.length = 0'); A.sfx('well');
  t.ok(near12(kettle(), 760) <= 20, 'with no music it plays as written: ' + kettle().toFixed(1) + ' Hz');
});
t.test('reveal: Spell chords never hold a semitone, a tritone or a major seventh', () => {
  t.deep(Object.keys(AUDIO.CHORD_ROOTS).sort(), ['0,2,4,7,9', '0,3,5,7,10'], 'CHORD_ROOTS covers the two pentatonic scales of the reveal');
  t.deep(AUDIO.CHORD_ROOTS['0,2,4,7,9'], [0, 1, 2, 3, 4], 'every root of the major pentatonic is consonant');
  t.deep(AUDIO.CHORD_ROOTS['0,3,5,7,10'], [0, 1, 2, 3, 4], 'and of the minor pentatonic');
  let checked = 0;
  for (const ch of [1, 2, 3]) {
    const d = descs['map' + ch], sc = pentaOf(d.scale);
    const midi = (x) => d.tonic + 12 + 12 * Math.floor(x / 5) + sc[mod(x, 5)];
    for (const [song, n] of [['fan', 3], ['splash', 7], ['halo', 6]]) {
      for (let root = -4; root <= 9; root++) {
        const ms = AUDIO.songDegrees(song, n, root, ch).map(midi);
        for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
          const iv = mod(ms[j] - ms[i], 12);
          checked++;
          if (iv === 1 || iv === 6 || iv === 11) t.ok(false, `Act ${ch} ${song} root ${root}: notes ${i} and ${j} hold ${iv} semitones`);
          if (d.scaleIntervals.indexOf(mod(ms[i] - d.tonic, 12)) < 0) t.ok(false, `Act ${ch} ${song} root ${root}: note ${i} leaves the Act's key`);
        }
      }
    }
  }
  t.ok(checked > 1000, 'checked ' + checked + ' pairs');
});
t.test('the map mute is calibrated to real play', () => {
  // m = 0.19: the median live share of the map when the greedy bot reaches the Headliner (217 Headliner fights, ch1 0.19, ch2 0.19,
  // ch3 0.20), measured on 2026-10-04 with: node tools/hocus_vocus/bot.mjs --all-pairs --runs 8 --trial 0,5 --seed 11 --combat greedy
  //   --effort fast --jobs 1 --quiet --brief --awake-report
  // WAKE_SPAN = clamp(m - 0.06, 0.12, 0.44) = 0.13; T3 = clamp((0.6 m - 0.06) / 0.13 - 0.1, 0.15, 0.65) = 0.32;
  // TH_WAKE = [0, round2(0.23 T3), round2(0.62 T3), T3] = [0, 0.07, 0.2, 0.32]
  t.eq(AUDIO.HUSH.from, 0.06, 'the unmute curve starts at 6 percent');
  t.eq(AUDIO.HUSH.span, 0.13, 'and is full at the median Headliner visit (m = 0.19)');
  t.deep(AUDIO.HUSH.th, [0, 0.07, 0.2, 0.32], 'the layers come in at 0.07, 0.2 and 0.32');
  t.deep([descs.map1.hush, descs.map2.hush, descs.map3.hush], [{ lo: 900, floor: 0.85 }, { lo: 750, floor: 0.8 }, { lo: 600, floor: 0.75 }], 'the Act mute values');
  t.deep(descs.map1.thresholds, AUDIO.HUSH.th, 'the map tracks use the calibrated thresholds');
  const wl = (f) => Math.min(1, Math.max(0, (f - AUDIO.HUSH.from) / AUDIO.HUSH.span));
  t.ok(wl(0.19) === 1 && wl(0.114) >= AUDIO.HUSH.th[3] + 0.1 - 0.01, 'the melody is fully in by 0.6 of the median, the whole bed at the median');
  const gg = live();
  const A = gg.AUDIO;
  t.eq(A.debug().liftKey, null, 'no map has been unmuted yet');
  A.wake(3, 3, { chapter: 2, seed: 77, cols: 21, rows: 13 });
  t.eq(A.debug().liftKey, '2|77', 'the first unmuted hex of a map is remembered');
  gg._advance(1000, 20);
  A.wake(4, 3, { chapter: 2, seed: 77, cols: 21, rows: 13 });
  t.eq(A.debug().liftKey, '2|77', 'a second one on the same map leaves it');
  A.music('map2'); advance(gg, 300);
  A.awake(0.06);
  const lp = A.debug().decks[0].lp, f0 = lp.frequency.value, calls = [], orig = lp.frequency.setTargetAtTime.bind(lp.frequency);
  lp.frequency.setTargetAtTime = (v, tm, tc) => { calls.push(v); return orig(v, tm, tc); };
  A.wake(5, 3, { chapter: 3, seed: 78, cols: 21, rows: 13 });
  t.eq(A.debug().liftKey, '3|78', 'a new map is a new first unmute');
  t.ok(calls.length === 2 && near(calls[0], f0 * 1.5, 1) && calls[1] === f0, 'which opens the muted deck to 1.5 times its cut-off and back: ' + f0 + ', ' + calls.join(', '));
});
t.test('the vox voice sings and speaks the beatbox, and only the Gloss lip-syncs with it in a score', () => {
  const gg = fresh();
  const A = gg.AUDIO, W = gg._win;
  t.ok(A.VOICES.indexOf('vox') >= 0, 'vox is a voice');
  gg._run(`globalThis.__env = [];
    const cg = AudioContext.prototype.createGain;
    OfflineAudioContext.prototype.createGain = function () {
      const n = cg.call(this), p = n.gain, ev = []; __env.push(ev);
      for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) { const o = p[m].bind(p); p[m] = (v, t) => { ev.push([m, v, t]); return o(v, t); }; }
      return n;
    };`);
  const off = new W.OfflineAudioContext(2, 44100 * 4, 44100), dest = off.destination;
  for (const vowel of ['a', 'o', 'u', 'e', 'm', 'oo', 'ah', 'mm', 'zzz']) t.eq(A.voice('vox', off, dest, 0.09, { midi: 62, dur: 0.5, vel: 0.7, r: 0.3, vowel }), true, 'vowel ' + vowel);
  for (const syl of ['boots', 'cats', 'ts', 'pf', 'k', 'bwaa', 'ab', 'ra', 'ca', 'tada', 'hey', 'boom', 'zzz']) t.eq(A.voice('vox', off, dest, 0.09, { midi: 62, dur: 0.5, vel: 0.7, r: 0.3, syl }), true, 'syllable ' + syl);
  t.eq(A.voice('vox', off, dest, 0.09, { midi: 62, dur: 1, vel: 0.7, r: 0.3, vowel: 'a', detune: 8 }), true, 'detune');
  t.eq(A.voice('vox', off, dest, 0.09, { midi: 62.4, dur: 1, vel: 0.7, r: 0.3, vowel: 'a', robot: 1 }), true, 'robot');
  t.eq(A.voice('vox', off, dest, 0.09, { midi: 62, dur: 0.4, vel: 0.7, r: 0.3, syl: 'tada', whisper: 1 }), true, 'whisper');
  let envs = 0, bad = 0;
  for (const ev of gg._run('__env')) {
    if (!ev.some((e) => e[0] === 'exponentialRampToValueAtTime' && e[1] === 0.0001)) continue;
    envs++;
    if (!(ev[0][0] === 'setValueAtTime' && ev[0][1] === 0 && ev[0][2] === 0)) bad++;
  }
  t.ok(envs >= 30, 'checked ' + envs + ' amplitude envelopes');
  t.eq(bad, 0, 'every vox envelope starts at zero: no click');
  // the robot snaps the pitch and has no vibrato: its first oscillator sits exactly on the tempered note
  gg._run(`globalThis.__f = []; const oc = AudioContext.prototype.createOscillator;
    OfflineAudioContext.prototype.createOscillator = function () { const o = oc.call(this); const s = o.frequency.setValueAtTime.bind(o.frequency); o.frequency.setValueAtTime = (v, t) => { __f.push(v); return s(v, t); }; return o; };`);
  A.voice('vox', off, dest, 0.09, { midi: 62.4, dur: 0.5, vel: 0.7, r: 0.3, vowel: 'a', robot: 1 });
  const fr = gg._run('__f');
  t.ok(Math.abs(fr[0] - 293.66) < 0.05 && !fr.some((f) => Math.abs(f - 5.5) < 1e-9), 'the robot is snapped to D and has no vibrato: ' + fr.slice(0, 3).map((f) => f.toFixed(2)).join(' '));
  const voxTracks = [];
  for (const id of L.music) for (const tr of descs[id].tracks) if (tr.voice === 'vox') voxTracks.push([id, tr]);
  t.deep([...new Set(voxTracks.map((x) => x[0]))].sort(), ['boss3', 'final'], 'only Flawless and the Gloss use vox in a score');
  t.ok(voxTracks.every((x) => x[1].notes.every((n) => n.robot) && x[1].human === 0), 'and it is always the robot lip-sync, machine tight');
  t.eq(A.SONGS.step.v, 'vox', 'a walked step is a vox');
  t.ok(A.RANGES.vox[0] < A.RANGES.vox[1], 'vox has a range');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});

// ------------------------------------------------------------------------------------------------ S. the sample hook (HV_ART_AUDIO 11.7)
// A spy replaces fetch on one boot's page global (the loader's own fetch throws: any unplanned request would fail), Audio is a probe
// that can play m4a (audio/mp4) only, and DATA.SAMPLES is replaced by a fake manifest before init. Decoded buffers are tagged with the
// file they came from, so a test can tell a sample from the synth's own noise buffers.
function sampleBoot(manifest, o) {
  o = o || {};
  const gg = fresh();
  gg._run(`globalThis.__fetches = []; globalThis.__fetchMode = ${JSON.stringify(o.mode || 'ok')}; globalThis.__hold = [];
    window.fetch = function (url, init) {
      __fetches.push({ url: String(url), init: init || null });
      const body = () => { const ab = new ArrayBuffer(64); ab._name = String(url); return Promise.resolve(ab); };
      if (__fetchMode === 'reject') return Promise.reject(new Error('offline'));
      if (__fetchMode === '404') return Promise.resolve({ ok: false, status: 404, arrayBuffer: body });
      if (__fetchMode === 'hold') return new Promise((res) => { __hold.push(() => res({ ok: true, status: 200, arrayBuffer: body })); });
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: body });
    };
    window.Audio = function () { return { canPlayType: (type) => (/mp4/.test(type) ? 'probably' : '') }; };
    const dec = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (ab, ok, no) {
      if (__fetchMode === 'baddata') { const e = new Error('cannot decode'); if (typeof no === 'function') queueMicrotask(() => no(e)); return Promise.reject(e); }
      return dec.call(this, ab).then((b) => { b._name = ab && ab._name; if (typeof ok === 'function') ok(b); return b; });
    };
    globalThis.__srcs = []; const cb = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () { const s = cb.call(this); __srcs.push(s); return s; };`);
  if (manifest !== undefined) gg._run('DATA.SAMPLES = ' + JSON.stringify(manifest) + ';');
  return gg;
}
const fetches = (gg) => gg._run('__fetches');
const sampleSrcs = (gg) => gg._run('__srcs').filter((s) => s.buffer && s.buffer._name);
const warns = (gg) => gg._console.warn.filter((w) => /AUDIO samples/.test(w));
// The manifest's own contract, restated here from the README (the loader is the other judge: it must accept every entry without a warning).
const SAMPLE_SYLS = ['boots', 'cats', 'ts', 'pf', 'k', 'bwaa', 'ab', 'ra', 'ca', 'tada', 'hey', 'boom', 'oo', 'ah', 'mm'];
const SAMPLE_STINGS = ['victory', 'defeat', 'boss_intro', 'phase_change'];
const SAMPLE_NAME = /^[a-z0-9][a-z0-9_-]*$/;
function manifestProblems(M, gg) {
  const bad = [], D = gg.DATA, heroes = D.LISTS.heroIds || [];
  const inRange = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  if (!M || typeof M !== 'object' || Array.isArray(M)) return ['DATA.SAMPLES is not an object'];
  if (M.version !== 1) bad.push('version is not 1');
  if (typeof M.base !== 'string' || !/^([a-z0-9][a-z0-9_-]*\/)+$/.test(M.base)) bad.push('base is not a plain relative folder: ' + M.base);
  if (!Array.isArray(M.formats) || !M.formats.length || !M.formats.every((f) => typeof f === 'string' && /^[a-z0-9]+$/.test(f))) bad.push('formats is not a list of extensions');
  if (M.preload !== 'idle' && M.preload !== 'lazy') bad.push('preload is neither idle nor lazy');
  if (!inRange(M.maxSeconds, 1, 3600)) bad.push('maxSeconds is not a positive number of seconds');
  if (!inRange(M.gain, 0, 4)) bad.push('gain is not a number from 0 to 4');
  const keyOk = {
    sfx: (k) => { const p = k.split('.'); return D.LISTS.sfx.indexOf(p[0]) >= 0 && (p.length === 1 || (p.length === 2 && heroes.indexOf(p[1]) >= 0)); },
    spells: (k) => Object.prototype.hasOwnProperty.call(D.brushes, k),
    syllables: (k) => SAMPLE_SYLS.indexOf(k) >= 0,
    stingers: (k) => SAMPLE_STINGS.indexOf(k) >= 0,
  };
  for (const group of Object.keys(keyOk)) {
    const tab = M[group];
    if (!tab || typeof tab !== 'object' || Array.isArray(tab)) { bad.push(group + ' is not an object'); continue; }
    for (const k of Object.keys(tab)) {
      const at = group + ':' + k, raw = tab[k];
      if (!keyOk[group](k)) bad.push(at + ': unknown key');
      const ent = typeof raw === 'string' ? { files: [raw] } : Array.isArray(raw) ? { files: raw } : raw;
      if (!ent || typeof ent !== 'object' || !Array.isArray(ent.files) || !ent.files.length || !ent.files.every((f) => typeof f === 'string' && SAMPLE_NAME.test(f))) { bad.push(at + ': files must be names of lowercase letters, digits, _ and -, no extension'); continue; }
      for (const [f, lo, hi] of [['vol', 0, 2], ['midi', 0, 127], ['var', 0, 1200], ['start', 0, 600], ['end', 0, 600]]) if (ent[f] !== undefined && !inRange(ent[f], lo, hi)) bad.push(at + ': ' + f + ' is outside ' + lo + ' to ' + hi);
      if (group === 'syllables' && ent.midi !== undefined && !Number.isInteger(ent.midi)) bad.push(at + ': midi is not a whole note number');
    }
  }
  return bad;
}
const entriesOf = (M) => (M ? ['sfx', 'spells', 'syllables', 'stingers'].reduce((n, k) => n + Object.keys(M[k] || {}).length, 0) : 0);
t.test('S1: the shipped DATA.SAMPLES is a valid manifest (whatever it lists), and it requests only its own folder', async () => {
  t.ok(SHIPPED && typeof SHIPPED === 'object', 'DATA.SAMPLES exists (js/data_samples.js)');
  if (!SHIPPED) return;
  t.ok(SHIPPED_FROZEN, 'and is frozen');
  t.eq(SHIPPED.version, 1, 'version 1');
  t.eq(SHIPPED.base, 'audio/', 'files live in hocus_vocus/audio/');
  t.deep(SHIPPED.formats, ['m4a', 'ogg', 'mp3'], 'the format order');
  t.ok(SHIPPED.preload === 'idle' && SHIPPED.maxSeconds === 120 && SHIPPED.gain === 1, 'idle preload, 120 s budget, unity gain');
  t.deep(Object.keys(SHIPPED).filter((k) => ['sfx', 'spells', 'syllables', 'stingers'].indexOf(k) < 0).sort(), ['base', 'formats', 'gain', 'maxSeconds', 'preload', 'version'], 'six settings and four tables, nothing else');
  t.deep(manifestProblems(SHIPPED, g), [], 'every table and every entry is valid');
  const n = entriesOf(SHIPPED);
  const gg = sampleBoot(SHIPPED);
  t.eq(gg.AUDIO.init({ force: true }), true, 'init');
  await gg._tick(5000, 50);
  t.eq(gg.AUDIO.samples().length, n, 'the loader accepts all ' + n + ' listed keys');
  t.eq(warns(gg).length, 0, 'and has no warning about any of them: ' + warns(gg).join(' | '));
  const f = fetches(gg);
  t.ok(f.every((x) => /^audio\/[a-z0-9_-]+\.(m4a|ogg|mp3)$/.test(x.url)), 'every request stays in audio/: ' + f.map((x) => x.url).join(' '));
  if (n === 0) t.eq(f.length, 0, 'an empty shipped manifest requests nothing');
  else t.ok(f.length >= 1, 'a listed manifest requests its files');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('S1b: an empty manifest requests nothing, ever, and a manifest of the wrong shape never throws', async () => {
  t.deep(manifestProblems(EMPTY_SAMPLES, g), [], 'the empty manifest is itself valid');
  t.ok(manifestProblems({ version: 2, base: 'http://x/', formats: [], preload: 'now', maxSeconds: 0, gain: -1, sfx: [], spells: { nope: 'a' }, syllables: { boots: 'A B' }, stingers: { victory: { files: [] } } }, g).length >= 9, 'the validator itself flags a bad manifest');
  const gg = sampleBoot(EMPTY_SAMPLES);
  t.eq(gg.AUDIO.init({ force: true }), true, 'init');
  for (const id of L.sfx) gg.AUDIO.sfx(id);
  await gg._tick(5000, 50);
  t.eq(fetches(gg).length, 0, 'zero requests after init, every sound played and 5 s');
  t.deep(gg.AUDIO.samples(), [], 'no sample keys');
  t.eq(warns(gg).length, 0, 'and no warnings');
  for (const bad of [null, 0, 'x', [], { version: 1 }]) {
    const g2 = sampleBoot(bad);
    t.eq(g2.AUDIO.init({ force: true }), true, 'init with the manifest ' + JSON.stringify(bad));
    await g2._tick(3000, 50);
    t.eq(fetches(g2).length, 0, 'requests nothing');
    t.eq(g2._uncaught.length, 0, 'and nothing threw');
  }
});
t.test('S2: one listed file is fetched once, after init and the idle delay, from the game\'s own folder', async () => {
  const gg = sampleBoot({ version: 1, base: 'audio/', formats: ['m4a', 'ogg', 'mp3'], preload: 'idle', maxSeconds: 120, gain: 1, sfx: { hit_light: 'kick' } });
  await gg._tick(3000, 50);
  t.eq(fetches(gg).length, 0, 'nothing is fetched before init');
  gg.AUDIO.init({ force: true });
  await gg._tick(1000, 50);
  t.eq(fetches(gg).length, 0, 'nor in the first second after it');
  await gg._tick(1000, 50);
  const f = fetches(gg);
  t.eq(f.length, 1, 'exactly one request after 2 s');
  t.eq(f[0] && f[0].url, 'audio/kick.m4a', 'to audio/kick.<the playable format>');
  t.ok(f[0] && f[0].init && f[0].init.credentials === 'same-origin' && f[0].init.cache === 'force-cache', 'same origin, from the HTTP cache when it can');
  await gg._tick(500, 50);
  t.deep(gg.AUDIO.samples().map((s) => [s.key, s.state, s.files.join()]), [['sfx:hit_light', 'ready', 'kick']], 'and the key is ready');
  t.ok(gg.AUDIO.samples()[0].seconds > 0, 'with its decoded length counted');
  await gg._tick(5000, 100);
  t.eq(fetches(gg).length, 1, 'never fetched again');
});
t.test('S3: while a file loads, the sound plays its synth recipe', async () => {
  const gg = sampleBoot({ sfx: { hit_light: 'kick' } }, { mode: 'hold' });
  const A = gg.AUDIO;
  A.init({ force: true });
  await gg._tick(2000, 50);
  t.eq(A.samples()[0].state, 'loading', 'the file is loading');
  const n0 = gg._run('__srcs').length;
  t.eq(A.sfx('hit_light'), true, 'hit_light plays');
  const made = gg._run('__srcs').slice(n0);
  t.ok(made.length >= 1 && made.every((s) => !(s.buffer && s.buffer._name)), 'its synth recipe (noise only, never a sample buffer)');
  gg._run('__hold.forEach((f) => f())');
  await gg._tick(500, 50);
  t.eq(A.samples()[0].state, 'ready', 'and once it arrives it is ready');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('S4: a ready sample replaces the synth through the sfx bus at the measured level; cooldown, duck and the hero variant apply', async () => {
  const gg = sampleBoot({ gain: 1, sfx: { hit_light: { files: ['kick'], vol: 0.5 }, hit_heavy: 'boom', 'hit_heavy.kuro': ['bk_1', 'bk_2'] } });
  const A = gg.AUDIO;
  A.init({ force: true });
  await gg._tick(3000, 50);
  t.deep(A.samples().map((s) => s.state), ['ready', 'ready', 'ready'], 'all three keys are ready');
  const gr = A.debug().graph;
  let n0 = gg._run('__srcs').length;
  t.eq(A.sfx('hit_light', { vol: 1 }), true, 'hit_light plays');
  let made = gg._run('__srcs').slice(n0);
  t.eq(made.length, 1, 'as exactly one buffer source, no synth layers');
  t.eq(made[0].buffer._name, 'audio/kick.m4a', 'the decoded kick');
  t.ok(reaches(made[0], gr.sfxBus), 'reaching the sfx bus');
  const gn = made[0]._out[0], want = AUDIO.sfxRecipe('hit_light').vol * 0.5;
  t.ok(gn && Math.abs(20 * Math.log10(gn.gain.value / want)) <= 1.25, 'through recipe vol x entry vol x SAMPLES.gain (with the usual 1.2 dB variation): ' + (gn && gn.gain.value.toFixed(3)) + ' vs ' + want.toFixed(3));
  t.eq(A.sfx('hit_light'), false, 'the base id\'s cooldown still applies');
  gg._run(`globalThis.__d = 0; const dg = AUDIO.debug().graph.duck.gain, o = dg.setTargetAtTime.bind(dg); dg.setTargetAtTime = (v, a, b) => { __d++; return o(v, a, b); };`);
  n0 = gg._run('__srcs').length;
  A.sfx('hit_heavy');
  made = gg._run('__srcs').slice(n0);
  t.ok(made.length === 1 && made[0].buffer._name === 'audio/boom.m4a', 'hit_heavy plays its own sample');
  t.eq(gg._run('__d'), 2, 'and still ducks the music');
  await gg._tick(300, 50);
  n0 = gg._run('__srcs').length;
  A.sfx('hit_heavy', { hero: 'kuro' });
  A.sfx('hit_heavy', { hero: 'kuro' });
  made = gg._run('__srcs').slice(n0);
  t.deep(made.map((s) => s.buffer._name), ['audio/bk_1.m4a', 'audio/bk_2.m4a'], 'the .kuro variant wins with {hero: kuro}, its files in turn (round robin)');
  n0 = gg._run('__srcs').length;
  A.sfx('hit_heavy', { hero: 'hanae' });
  t.eq(gg._run('__srcs').slice(n0).map((s) => s.buffer && s.buffer._name).join(), 'audio/boom.m4a', 'another hero falls back to the base sample');
  n0 = gg._run('__srcs').length;
  t.eq(A.preview('hit_heavy', { synth: true }), true, 'preview with {synth: true}');
  t.ok(gg._run('__srcs').slice(n0).every((s) => !(s.buffer && s.buffer._name)), 'plays the synth recipe for an A/B');
  n0 = gg._run('__srcs').length;
  A.preview('hit_heavy');
  t.eq(gg._run('__srcs').slice(n0).length, 1, 'a plain preview plays the sample');
  await gg._tick(5000, 100);
  t.eq(A.debug().live, 0, 'every sample source ended and was counted as one live source');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('S5: a rejected fetch, a missing file and a decode error each mark the key failed, warn once and keep the synth', async () => {
  for (const mode of ['reject', '404', 'baddata']) {
    const gg = sampleBoot({ sfx: { hit_light: 'kick' } }, { mode });
    const A = gg.AUDIO;
    A.init({ force: true });
    await gg._tick(3000, 50);
    t.deep(A.samples().map((s) => s.state), ['failed'], mode + ': the key is failed');
    t.eq(fetches(gg).length, 1, mode + ': m4a was the only playable format, so one request');
    t.eq(warns(gg).length, 1, mode + ': one warning: ' + warns(gg).join(' | '));
    const n0 = gg._run('__srcs').length;
    t.eq(A.sfx('hit_light'), true, mode + ': the sound still plays');
    t.ok(gg._run('__srcs').slice(n0).every((s) => !(s.buffer && s.buffer._name)), mode + ': as its synth recipe');
    await gg._tick(5000, 100);
    t.eq(fetches(gg).length, 1, mode + ': a failed key is never retried this session');
    t.eq(gg._uncaught.length, 0, mode + ': nothing threw');
  }
  // the next playable format is tried before giving up
  const gg = sampleBoot({ formats: ['m4a', 'ogg'], sfx: { hit_light: 'kick' } }, { mode: '404' });
  gg._run("window.Audio = function () { return { canPlayType: () => 'maybe' }; };");
  gg.AUDIO.init({ force: true });
  await gg._tick(3000, 50);
  t.deep(fetches(gg).map((f) => f.url), ['audio/kick.m4a', 'audio/kick.ogg'], 'a failed format tries the next one, then fails');
});
t.test('S6: validation rejects URLs, folder escapes, spaces, dots, unknown ids and a non-hero suffix', async () => {
  const gg = sampleBoot({ base: '../up/', sfx: { ui_click: 'http://x/a', ui_hover: '../a', ui_back: '/a', ui_error: 'a b', ui_open: 'a.ogg', nope_sound: 'a', 'hit_light.bob': 'a', 'hit_light.kuro.x': 'a', hit_heavy: 'good_file-2' }, spells: { wave: 'run_up', nope: 'x' }, syllables: { boots: { files: ['bts'], midi: 50 }, la: 'x' }, stingers: { victory: 'cheer', title: 'x' } });
  const A = gg.AUDIO;
  t.eq(A.init({ force: true }), true, 'init never throws on a bad manifest');
  t.deep(A.samples().map((s) => s.key).sort(), ['sfx:hit_heavy', 'spells:wave', 'stingers:victory', 'syllables:boots'], 'only the valid entries remain');
  t.eq(A.debug().samples.cfg.base, 'audio/', 'a base outside the game folder falls back to audio/');
  t.eq(warns(gg).length, 12, 'every rejected entry warned once: ' + warns(gg).length);
  await gg._tick(3000, 50);
  t.ok(fetches(gg).every((f) => /^audio\/[a-z0-9_-]+\.m4a$/.test(f.url)), 'and every request stays in audio/: ' + fetches(gg).map((f) => f.url).join(' '));
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});
t.test('S7: the only fetch( under hocus_vocus/js is the sample loader\'s, behind its pragma', () => {
  const dir = path.join(DIR, 'js'), hits = [];
  for (const f of fs.readdirSync(dir).filter((n) => /\.js$/.test(n))) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8'), code = stripJs(text);
    for (const m of code.matchAll(/(?<![\w$])fetch\s*\(/g)) hits.push({ f, line: lineOf(text, m.index), text });
  }
  t.eq(hits.length, 1, 'one fetch( in the game code: ' + hits.map((h) => h.f + ':' + h.line).join(' '));
  if (!hits.length) return;
  const h = hits[0], lines = h.text.split('\n');
  t.eq(h.f, 'audio.js', 'in audio.js');
  t.ok(/hygiene-allow\(network\): \S/.test(lines[h.line - 1] + lines[h.line - 2]), 'with the network pragma and its reason');
  const before = h.text.split('\n').slice(0, h.line).join('\n'), fn = before.lastIndexOf('function ');
  t.ok(/^function sampleLoad\b/.test(before.slice(fn)), 'inside the sample loader');
});
t.test('S8: a headless boot with a plain init() never fetches, whatever the manifest says', async () => {
  const gg = sampleBoot({ preload: 'idle', sfx: { hit_light: 'kick', ui_click: 'tk' }, stingers: { victory: 'cheer' } });
  t.eq(gg.AUDIO.init(), false, 'init without force is a no-op headless');
  for (const id of L.sfx) gg.AUDIO.sfx(id);
  await gg._tick(5000, 50);
  t.eq(fetches(gg).length, 0, 'zero requests');
  t.deep(gg.AUDIO.samples(), [], 'and no sample table');
  const g2 = sampleBoot({ preload: 'lazy', sfx: { hit_light: 'kick' } });
  g2.AUDIO.init({ force: true });
  await g2._tick(3000, 50);
  t.eq(fetches(g2).length, 0, 'lazy: nothing is requested until a key is used');
  t.eq(g2.AUDIO.sfx('hit_light'), true, 'its first use plays the synth');
  await g2._tick(500, 50);
  t.eq(fetches(g2).length, 1, 'and starts the load');
  t.eq(g2.AUDIO.samples()[0].state, 'ready', 'so the next play can use it');
  const g3 = sampleBoot({ sfx: { hit_light: 'kick' } });
  g3._run("window.location.protocol = 'file:';");
  g3.AUDIO.init({ force: true });
  await g3._tick(3000, 50);
  t.ok(fetches(g3).length === 0 && g3.AUDIO.samples().every((s) => s.state === 'failed'), 'a file:// page never fetches: everything stays synthesised');
});
t.test('S9: a recorded syllable is re-pitched within 7 semitones; beyond that the synth sings', async () => {
  const gg = sampleBoot({ syllables: { boots: { files: ['bts'], midi: 50 }, oo: { files: ['ooh'], midi: 64 } }, spells: { wave: 'run_up' } });
  const A = gg.AUDIO;
  A.init({ force: true });
  await gg._tick(3000, 50);
  t.deep(A.samples().map((s) => s.state), ['ready', 'ready', 'ready'], 'the syllables and the Spell are ready');
  const ctx = A.debug().ctx, out = A.debug().graph.sfx;
  const play = (n) => { const n0 = gg._run('__srcs').length; A.voice('vox', ctx, out, ctx.currentTime + 0.01, Object.assign({ dur: 0.2, vel: 0.7, r: 0.4 }, n)); return gg._run('__srcs').slice(n0); };
  let made = play({ midi: 55, syl: 'boots' });
  t.ok(made.length === 1 && made[0].buffer._name === 'audio/bts.m4a' && Math.abs(made[0].playbackRate.value - Math.pow(2, 5 / 12)) < 1e-9, 'five semitones up: the recording, re-pitched by playbackRate');
  made = play({ midi: 58, syl: 'boots' });
  t.ok(made.every((s) => !(s.buffer && s.buffer._name)), 'eight semitones up: the synth syllable');
  made = play({ midi: 61, vowel: 'oo' });
  t.ok(made.length === 1 && made[0].buffer._name === 'audio/ooh.m4a', 'a vowel recording ("oo") sings the vowel');
  made = play({ midi: 61, syl: 'cats' });
  t.ok(made.every((s) => !(s.buffer && s.buffer._name)), 'a syllable nobody recorded stays synthesised');
  const W = gg._win, off = new W.OfflineAudioContext(2, 44100, 44100);
  const n0 = gg._run('__srcs').length;
  A.voice('vox', off, off.destination, 0.01, { midi: 52, dur: 0.2, vel: 0.7, r: 0.4, syl: 'boots' });
  t.eq(gg._run('__srcs').length, n0, 'an offline render never uses the live recordings');
  const s0 = gg._run('__srcs').length;
  A.wake(5, 4, { chapter: 1, seed: 3, cols: 21, rows: 13, song: 'wave', i: 0, n: 5, aq: 5, ar: 4 });
  const spell = gg._run('__srcs').slice(s0).filter((s) => s.buffer && s.buffer._name);
  t.deep(spell.map((s) => s.buffer._name), ['audio/run_up.m4a'], 'a recorded Spell replaces the gesture on its first cell (the hex still sings its note)');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});

t.test('S10: on Quality Low the map sings its plain pluck, so Spell and syllable recordings do not play there (README says so)', async () => {
  const gg = sampleBoot({ syllables: { boots: { files: ['bts'], midi: 50 } }, spells: { wave: 'run_up', stroke: 'bc_up' } });
  const A = gg.AUDIO;
  A.init({ force: true });
  await gg._tick(3000, 50);
  t.deep(A.samples().map((s) => s.state), ['ready', 'ready', 'ready'], 'the Spells and the syllable are ready');
  const named = (s0) => gg._run('__srcs').slice(s0).filter((s) => s.buffer && s.buffer._name).map((s) => s.buffer._name);
  let s0 = gg._run('__srcs').length;
  A.wake(5, 4, { chapter: 1, seed: 3, cols: 21, rows: 13, song: 'wave', i: 0, n: 5, aq: 5, ar: 4 });
  t.deep(named(s0), ['audio/run_up.m4a'], 'Quality High: the recorded Spell plays on its first cell');
  await gg._tick(1500, 50);
  A.options({ lite: true });
  s0 = gg._run('__srcs').length;
  t.eq(A.wake(6, 4, { chapter: 1, seed: 3, cols: 21, rows: 13, song: 'wave', i: 0, n: 5, aq: 6, ar: 4 }), true, 'Quality Low: the hex still sings');
  t.deep(named(s0), [], 'but no recording plays: the Spell sample is skipped');
  await gg._tick(1500, 50);
  s0 = gg._run('__srcs').length;
  A.wake(7, 4, { chapter: 1, seed: 3, cols: 21, rows: 13, song: 'stroke', i: 0, n: 5, aq: 7, ar: 4 });
  t.deep(named(s0), [], 'a Boots and Cats recording and the sung syllables are skipped too (the voice is the arp, never vox)');
  t.eq(gg._uncaught.length, 0, 'nothing threw');
});

t.done();
