// Inkwoven -- AUDIO: procedural music and sound effects, all synthesised with WebAudio (no audio files, no network).
// This header is the contract of record for js/audio.js (DESIGN 5.7, ART_BIBLE 9). audio.js loads before combat, run,
// meta and ui, so it references only U and DATA, and never META: UI.applySettings() is the bridge.
//
// PUBLIC API (everything is a silent no-op headless, before init, or when WebAudio is missing; nothing here throws)
//   AUDIO.init(opts?) -> bool      Call from the first user gesture. Creates the AudioContext lazily (try/catch, webkit prefix),
//                                  builds the master chain, resumes the context, starts any remembered music. Safe to call
//                                  repeatedly. While window.__HEADLESS is true it does nothing unless opts.force is true
//                                  (the audio suite forces it to drive the stubbed WebAudio). Returns AUDIO.ready.
//   AUDIO.ready    bool            true once a context exists and the graph is built. AUDIO.current is the requested track id.
//   AUDIO.sfx(id, {vol, pitch, pan, delay}?) -> bool   id in DATA.LISTS.sfx. vol multiplier (0..2), pitch multiplier (1 = as
//                                  written), pan -1..1, delay in MILLISECONDS (a value under 5 is read as seconds).
//                                  Every play gets a small seeded pitch and gain variation (never Math.random). Dropped before init.
//   AUDIO.music(id|null, {fade, restart}?)   id in DATA.LISTS.music; crossfades; null fades out and stops. Asking for the track
//                                  that is already current does nothing. `fade` is seconds (a value above 20 is read as ms).
//                                  Before init the request is remembered and starts inside init().
//   AUDIO.intensity(n)             0..1. Layered tracks (combat1..3, elite, boss1..3, final) fade extra layers in as n rises.
//                                  Calling with no argument returns the current value. Leaving a layered track resets it to 0.
//   AUDIO.setVolume('music'|'sfx', 0..1)   AUDIO.volume(kind) -> the stored slider value
//   AUDIO.duck(ms)                 dip the music under a big moment for ms milliseconds, then swell back
//   AUDIO.suspend() / AUDIO.resume()       explicit suspend; init also listens to visibilitychange (hidden suspends, visible resumes)
//   AUDIO.list(kind?) -> {sfx:[ids], music:[ids]} (or one of the two arrays when kind is 'sfx' or 'music')
//   AUDIO.preview(id) -> bool      plays an sfx id for the settings screen (no random variation, does not touch the music)
//
// COMPOSITION (pure, deterministic, seeded, testable in Node; nothing here touches WebAudio)
//   AUDIO.compose(trackId) -> frozen description (cached, treat as read-only):
//     { id, mood, tempo (bpm), key ('D'), tonic (midi of the key), scale ('in-sen'|'yo'|'miyako-bushi'), scaleIntervals:[semitones],
//       beatsPerBar, bars (introBars + loopBars), introBars, loopBars, beats, loopBeats, introBeats, seconds, loopSeconds,
//       layers (1, or 4 for the intensity tracks), thresholds:[intensity where each layer is fully in], xfade (seconds),
//       tracks:[{voice, role, layer, gain, pan, range:[lo,hi], notes:[{t, dur, midi, vel, hit?, bend?}]}] }
//     t and dur are in BEATS (quarter notes, from the start of the intro), midi is a note number, vel is 0..1. Every note lies
//     inside the declared scale and inside its track's range, every note ends before bars * beatsPerBar (nothing overhangs the
//     loop end; only the synthesised ring of a note crosses the seam), and the loop returns to beat introBeats.
//     Tracks with introBars > 0 (victory, defeat) play a short stinger once and then fall into a soft loop.
//   AUDIO.sfxRecipe(id) -> fresh plain recipe or null:
//     { id, vol, var (random pitch cents), gainVar (dB), pan, duck (ms), cd (cooldown ms), pri (0..3), dur (seconds, tail included),
//       layers:[ {k:'osc', w, f, f2, t, d, a, g, ...} | {k:'noise', n, ft, f, f2, q, t, d, a, g} | {k:'fm', f, ratio, idx, t, d, g}
//              | {k:'voice', v, m, t, d, vel} ] }
//     Layer times are seconds from the start of the sound, g is a linear gain. The synth turns a recipe into WebAudio nodes.
//
// SYNTHESIS (every voice takes any BaseAudioContext, so an OfflineAudioContext renders exactly what the game plays)
//   AUDIO.VOICES  names of the instruments: koto shamisen biwa arp shakuhachi taiko hyoshigi rin pad crackle
//   AUDIO.graph(ctx, {musicVol, sfxVol}?) -> {music, sfx, out, ...}   master chain (soft glue compressor, limiter, soft clip,
//                                  a small temple-hall reverb) with a music bus and an sfx bus to connect voices into
//   AUDIO.render(ctx, dest, desc, {t0, loops, intensity}?) -> {end, notes}   schedule a whole composition (intro plus `loops`
//                                  passes of the loop) into dest, for offline analysis
//   AUDIO.renderSfx(ctx, dest, id, {t0, vol, pitch, seed}?) -> {end}   schedule one sound effect
//   AUDIO.debug() -> {ctx, graph, decks, live, intensity, ...}         inspection hook for the suite
//
// SOUND DESIGN NOTES
//   Instruments: koto and shamisen are damped-wave plucks (custom PeriodicWave, filter envelope, noise pick), biwa is a low
//   slapped string, shakuhachi is a sine with breath noise, vibrato and a pitch scoop, taiko is a pitch-dropped sine with a
//   noise slap, hyoshigi is two resonant noise clacks, rin is inharmonic FM, pad is detuned saws through a low-pass.
//   Levels: the music bus runs at MUSIC_SCALE (0.55) of the sfx bus at equal slider values, both through a v^1.5 taper.
//   Layered tracks: layer 0 is always audible, layers 1..3 fade in at AUDIO.compose(id).thresholds. Boss tracks are
//   already full at intensity 0 and the layers add drama as phases begin (intensity 0.25 per phase entered).
const AUDIO = (() => {
  'use strict';

  const MUSIC_SCALE = 0.55;              // music bus gain relative to the sfx bus at equal slider values (ART_BIBLE 9)
  const LOOKAHEAD = 0.42;                // seconds of music scheduled ahead of the audio clock
  const TICK_MS = 60;                    // scheduler interval
  const MAX_LIVE = 220;                  // live sound sources before low priority sounds are dropped
  const EPS = 0.0001;                    // exponential ramps may not touch 0
  const TAPER = 1.5;                     // slider value to amplitude curve: v ^ TAPER

  const mod = (a, n) => ((a % n) + n) % n;
  const frac = (x) => x - Math.floor(x);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const round3 = (x) => Math.round(x * 1000) / 1000;
  const isNum = (x) => typeof x === 'number' && x === x && x !== Infinity && x !== -Infinity;
  const db = (x) => Math.pow(10, x / 20);
  const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Japanese pentatonic scales as semitone intervals above the key. The ART_BIBLE lists them as pitch sets:
  // in-sen (D E F A B, rooted on E it is E F A B D), yo (D E G A B), miyako-bushi (E F A B C).
  const SCALES = {
    'in-sen': [0, 1, 5, 7, 10],
    'yo': [0, 2, 5, 7, 9],
    'miyako-bushi': [0, 1, 5, 7, 8],
  };

  // Playable range of every instrument in MIDI notes (a track may use a narrower window inside it).
  const RANGES = {
    koto: [43, 96], shamisen: [48, 88], biwa: [31, 64], arp: [48, 100], shakuhachi: [60, 91],
    taiko: [31, 64], hyoshigi: [24, 100], rin: [60, 108], pad: [31, 90], crackle: [24, 100],
  };
  const VOICE_NAMES = Object.keys(RANGES);
  // Wind and breath instruments play one note at a time.
  const MONO = { shakuhachi: true };

  // ==================================================================================================================
  // COMPOSITION: pure and deterministic. A track is a table of sections and roles; each role (melody, pad, arp, bass,
  // ostinato, percussion, clacks, bells, crackle, stabs, runs) is generated from a seeded stream derived from the track id,
  // so adding or retuning one role never changes another.
  // ==================================================================================================================

  // One bar of rhythm per cell, in beats. A negative number is a rest of that length. Every cell sums to the bar length.
  const CELLS4 = {
    long: [[4], [3, 1], [2, 2], [2, 1, 1], [1, 1, 2], [3, 0.5, 0.5], [1.5, 1.5, 1], [-1, 3], [2, 1, 0.5, 0.5]],
    flow: [[1, 1, 2], [1.5, 0.5, 1, 1], [1, 0.5, 0.5, 2], [2, 1, 1], [1, 1, 1, 1], [0.5, 0.5, 1, 2], [1.5, 0.5, 2], [1, 1, 0.5, 0.5, 1], [2, 0.5, 0.5, 1]],
    run: [[0.5, 0.5, 0.5, 0.5, 1, 1], [1, 0.5, 0.5, 1, 0.5, 0.5], [0.5, 0.5, 1, 0.5, 0.5, 1], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1], [0.75, 0.25, 0.5, 0.5, 1, 1], [1, 1, 0.5, 0.5, 0.5, 0.5], [0.5, 1, 0.5, 1, 1]],
    lively: [[0.5, 0.5, 1, 0.5, 0.5, 1], [1, 0.5, 0.5, 1, 1], [0.5, 0.5, 0.5, 0.5, 2], [0.5, 1, 0.5, 2], [1, 0.5, 0.5, 0.5, 0.5, 1]],
    sparse: [[-1, 2, 1], [-2, 2], [3, -1], [-1, 1, 2], [2, -2], [-2, 1, 1], [1, -3], [-1, 3]],
  };
  const CELLS3 = {
    lull: [[3], [2, 1], [1, 2], [1.5, 1.5], [1, 1, 1], [1, 0.5, 0.5, 1], [-1, 2], [2, 0.5, 0.5]],
  };
  // Cadence bars: the last note is long and lands on the target degree.
  const CAD4 = [[1, 1, 2], [2, 2], [1, 3], [0.5, 0.5, 1, 2], [1.5, 0.5, 2]];
  const CAD3 = [[1, 2], [1.5, 1.5], [0.5, 0.5, 2]];
  // Melodic steps in scale degrees with weights: mostly stepwise, an occasional leap.
  const W_GENTLE = [[-3, 0.04], [-2, 0.13], [-1, 0.32], [0, 0.03], [1, 0.32], [2, 0.13], [3, 0.03]];
  const W_LEAPY = [[-3, 0.08], [-2, 0.19], [-1, 0.25], [0, 0.03], [1, 0.25], [2, 0.19], [3, 0.08]];
  // Phrase forms by phrase count: uppercase = new material, lowercase = repeat of it, digit 2 = a varied repeat.
  const FORMS = {
    1: ['A'], 2: ['A', 'a'], 3: ['A', 'B', 'a2'], 4: ['A', 'a2', 'B', 'a'], 8: ['A', 'a', 'B', 'a2', 'a', 'a2', 'C', 'a'],
  };
  // Arpeggio patterns: indexes into the ascending list of chord tones inside the role's range.
  const ARP_PATTERNS = {
    up: [0, 1, 2, 3, 4, 3, 2, 1],
    roll: [0, 2, 1, 2, 0, 2, 1, 2],
    wave: [0, 1, 2, 3, 2, 1, 0, 1],
    pluck3: [0, 2, 3, 2],
    sparkle: [3, 4, 5, 4, 3, 2, 4, 5],
    rise: [0, 1, 2, 3, 4, 5, 4, 3],
  };
  // Percussion grids: 16 steps per 4/4 bar. X accent don, x soft don, D big don, o rim ka, k soft ka.
  const PERC = {
    sparseDon: ['X...............', '................', 'X.......x.......', '................'],
    heartbeat: ['X..x............', '................'],
    march: ['X...x...X...x...', 'X...x...X..xx...'],
    marchHeavy: ['D...x...X..xx...', 'X...x...X...x.x.', 'D...x...X..xx...', 'X..xx...X.x.x.xx'],
    fanfare: ['xxxxxxxxxxxxXXXX', 'X..x..X.X.x.X...', 'D...............'],
    combat: ['X.o.x.o.X.o.x.oo', 'X.o.x.oxX.o.x.o.', 'X..oX.o.x.oox.o.', 'X.o.x.o.X.oxx.ox'],
    combatFast: ['X.ox.o.xX.ox.o.x', 'X.ox.oxxX.o.x.ox', 'X.o.xoxoX.ox.oxo', 'X.oxxoxoX.oxoxxo'],
    combatL3: ['..k...k...k...k.', '.k.k.k.k.k.k.k.k', '..x...x...x...x.', 'k.k.k.k.k.kkkkkk'],
    bossA: ['D...x.o.X...x.o.', 'D..xx.o.X.x.x.oo', 'D...x.o.X.oox.o.', 'D.x.x.oxD.x.x.xx'],
    bossL3: ['..o...o.x.o...o.', 'o.o.o.o.o.o.o.o.', '..x.x.x...x.x.x.', 'oooooooooooooooo'],
  };
  const PERC_FILLS = ['xoxo', 'xxXX', 'x.xX', 'oxoX'];
  // Ostinato templates, one bar of eighths or sixteenths. R root, r root an octave up, 3 and 5 the other chord tones, . rest.
  const OSTINATO = {
    drive: ['R.RR.R5.', 'R.R.R35.', 'RR.R.R3r', 'R.RR.r5R'],
    gallop: ['R.RRR.RR', 'R.RRR.53', 'RRR.R.3r', 'R.R.RR5R'],
    tremolo: ['RRRRRRRRRRRRRRRR', 'RRRRRRRR3535RRRR', 'RRRRRRRRRRRR5555', 'RRRRRR35RRRRRRRR'],
    bounce: ['R.35.35.', 'R.R3.5r.', 'R.53.R3.', 'Rr.3r.5.'],
    silk: ['R..3..5.', 'R.3.5.3.', 'R..5.3..', 'R.3..5r.'],
    staccato: ['R.R.R.R.', 'R.r.R.3.', 'R.R.5.R.', 'r.R.3.R.'],
  };

  // ---- scale and chord arithmetic. S is a section context: {sc, tonic, bpb, bars, chordAt[], blocks[]}
  const pcOfDeg = (S, d) => mod(S.tonic + S.sc[mod(d, S.sc.length)], 12);
  const degMidi = (S, d) => S.tonic + 12 * Math.floor(d / S.sc.length) + S.sc[mod(d, S.sc.length)];
  const chordPcs = (S, root) => [pcOfDeg(S, root), pcOfDeg(S, root + 2), pcOfDeg(S, root + 4)];
  const isChordDeg = (d, root) => { const r = mod(d - root, 5); return r === 0 || r === 2 || r === 4; };
  function tonesFor(S, root, lo, hi) {
    const pcs = chordPcs(S, root), out = [];
    for (let m = lo; m <= hi; m++) if (pcs.indexOf(mod(m, 12)) >= 0) out.push(m);
    return out;
  }
  const lowestPc = (lo, pc) => { let m = lo; while (mod(m, 12) !== pc) m++; return m; };
  const nextPcAbove = (base, pc) => { let m = base + 1; while (mod(m, 12) !== pc) m++; return m; };
  const foldInto = (m, lo, hi) => { while (m > hi) m -= 12; while (m < lo) m += 12; return m; };

  function mkTrack(R, role, notes, extra) {
    return Object.assign({
      voice: R.voice, role, layer: R.layer || 0, gain: R.gain == null ? 1 : R.gain, pan: R.pan || 0,
      range: (R.range || RANGES[R.voice]).slice(), notes,
    }, extra || {});
  }
  const note = (t, dur, midi, vel, extra) => Object.assign({ t: round3(t), dur: round3(dur), midi, vel: round3(clamp(vel, 0.05, 1)) }, extra || {});

  // ---- melody: motif, statement, variation, sequence, cadence
  function roleMelody(rng, S, R) {
    const n = S.sc.length, bpb = S.bpb;
    const lo = R.range[0], hi = R.range[1];
    let dLo = 1e9, dHi = -1e9;
    for (let d = -40; d <= 60; d++) { const m = degMidi(S, d); if (m >= lo && m <= hi) { if (d < dLo) dLo = d; if (d > dHi) dHi = d; } }
    const baseCenter = Math.round((dLo + dHi) / 2 + (R.bias || 0));
    let center = baseCenter;
    const palette = (bpb === 3 ? CELLS3 : CELLS4)[R.cells || (bpb === 3 ? 'lull' : 'flow')];
    const cads = bpb === 3 ? CAD3 : CAD4;
    const W = R.leaps ? W_LEAPY : W_GENTLE;
    const P = R.phrase || 4;
    const nPh = Math.max(1, Math.floor(S.bars / P));
    const form = (R.form && R.form.length === nPh) ? R.form : (FORMS[nPh] || FORMS[4].concat(FORMS[4]).slice(0, nPh));
    const clampDeg = (d) => { while (d > dHi) d -= n; while (d < dLo) d += n; return d; };
    const nearestRes = (res, ref) => { for (const o of [0, 1, -1, 2, -2, 3, -3, 4, -4]) if (mod(ref + o, n) === res) return clampDeg(ref + o); return clampDeg(ref); };
    const chordNear = (root, ref) => { for (const o of [0, 1, -1, 2, -2, 3, -3]) if (isChordDeg(ref + o, root)) return clampDeg(ref + o); return clampDeg(ref); };
    const shapeBias = (shape, x) => (shape === 'arch' ? (x < 0.5 ? 0.35 : -0.35) : shape === 'fall' ? -0.32 : shape === 'rise' ? 0.32 : shape === 'wave' ? Math.sin(x * Math.PI * 2) * 0.3 : 0);
    function step(cur, bias) {
      const pull = clamp((center - cur) * 0.1, -0.6, 0.6) + bias;
      const entries = W.map((e) => [e[0], Math.max(0.02, e[1] * Math.exp(pull * Math.sign(e[0]) * 1.5))]);
      const s = rng.weighted(entries);
      let nd = cur + s;
      if (nd < dLo || nd > dHi) nd = cur - s;
      if (nd < dLo || nd > dHi) nd = cur;
      return nd;
    }
    function makeMotif(cell, start, shape) {
      const out = []; let cur = start, i = 0;
      const cnt = cell.filter((d) => d > 0).length;
      for (const d of cell) {
        if (d < 0) { out.push({ rest: true, dur: -d }); continue; }
        if (i > 0) cur = step(cur, shapeBias(shape, i / Math.max(1, cnt - 1)));
        out.push({ d: cur, dur: d }); i++;
      }
      return out;
    }
    const copyBar = (b) => b.map((x) => Object.assign({}, x));
    function vary(m) {
      const c = copyBar(m);
      const idx = []; c.forEach((x, i) => { if (!x.rest) idx.push(i); });
      const kind = rng.int(0, 3);
      if (kind === 0 && idx.length >= 3) {
        const half = Math.floor(idx.length / 2);
        let cur = c[idx[half - 1]].d;
        for (let k = half; k < idx.length; k++) { cur = step(cur, 0); c[idx[k]].d = cur; }
      } else if (kind === 1) {
        let bi = idx[0];
        for (const i of idx) if (c[i].dur > c[bi].dur) bi = i;
        if (c[bi].dur >= 1) { const h = c[bi].dur / 2; c[bi].dur = h; c.splice(bi + 1, 0, { d: step(c[bi].d, 0), dur: h }); }
      } else if (kind === 2 && idx.length >= 2) {
        const i = idx[1]; c[i].d = clampDeg(c[i].d + (rng() < 0.5 ? 1 : -1));
      } else {
        const i = idx[idx.length - 1]; c[i].d = clampDeg(c[i].d + (rng() < 0.5 ? 2 : -2));
      }
      return c;
    }
    const seq = (m, k) => m.map((x) => (x.rest ? Object.assign({}, x) : { d: clampDeg(x.d + k), dur: x.dur }));
    function cadBar(target, ref) {
      const cell = rng.pick(cads);
      let cur = nearestRes(target, ref);
      const out = [];
      for (let i = cell.length - 1; i >= 0; i--) {
        out.unshift({ d: cur, dur: cell[i] });
        cur = clampDeg(cur + rng.weighted([[-2, 0.15], [-1, 0.35], [1, 0.35], [2, 0.15]]));
      }
      return out;
    }
    const lastDeg = (bar) => { for (let i = bar.length - 1; i >= 0; i--) if (!bar[i].rest) return bar[i].d; return center; };

    const cellA = rng.pick(palette);
    let cellB = rng.pick(palette);
    for (let tries = 0; tries < 6 && cellB === cellA; tries++) cellB = rng.pick(palette);
    const mats = {};
    const cadRes = [3, 1, 2, 3];
    const barsOut = [];
    for (let pi = 0; pi < nPh; pi++) {
      const tok = form[pi], letter = tok[0].toUpperCase();
      const isNew = tok === 'A' || tok === 'B' || tok === 'C';
      center = baseCenter + (letter === 'B' ? 1 : letter === 'C' ? 3 : 0);
      let mat;
      if (isNew) {
        const cell = letter === 'A' ? cellA : letter === 'B' ? cellB : rng.pick(palette);
        const start = chordNear(S.chordAt[pi * P], center + rng.int(-1, 1));
        const first = makeMotif(cell, start, R.shape || (letter === 'A' ? 'arch' : letter === 'B' ? 'wave' : 'rise'));
        mat = [first];
        if (P >= 3) mat.push(vary(first));
        if (P >= 4) mat.push(seq(first, rng.pick([-2, -1, 1, 2])));
        while (mat.length < P - 1) mat.push(vary(first));
        mats[letter] = mat;
      } else if (tok.length === 1 && mats[letter]) {
        mat = mats[letter].map(copyBar);
      } else {
        const src = mats[letter] || mats.A;
        mat = src.map((b, j) => (j === 0 ? copyBar(b) : vary(b)));
        if (!mats[letter]) mats[letter] = src;
      }
      const target = pi === nPh - 1 ? 0 : cadRes[pi % cadRes.length];
      const cad = cadBar(target, lastDeg(mat[mat.length - 1]));
      mat.slice(0, P - 1).forEach((b) => barsOut.push(b));
      barsOut.push(cad);
    }
    center = baseCenter;
    // place notes: snap the first note of every bar to a chord tone, fit each phrase into the register
    const placed = [];
    for (let b = 0; b < S.bars; b++) {
      const bar = barsOut[b] || [], root = S.chordAt[b];
      let t = b * bpb;
      bar.forEach((x, i) => {
        if (!x.rest) {
          let d = x.d;
          if (i === 0) for (const o of [0, 1, -1, 2, -2]) if (isChordDeg(d + o, root)) { d += o; break; }
          placed.push({ t, dur: x.dur, d, bar: b, first: i === 0, last: false });
        }
        t += x.dur;
      });
    }
    for (let pi = 0; pi < nPh; pi++) {
      const grp = placed.filter((p) => p.bar >= pi * P && p.bar < (pi + 1) * P);
      if (!grp.length) continue;
      grp[grp.length - 1].last = true;
      const mean = grp.reduce((s, p) => s + p.d, 0) / grp.length;
      let shift = 0;
      if (Math.abs(mean - n - baseCenter) < Math.abs(mean - baseCenter)) shift = -n;
      else if (Math.abs(mean + n - baseCenter) < Math.abs(mean - baseCenter)) shift = n;
      for (const p of grp) p.d = clampDeg(p.d + shift);
    }
    const out = [];
    const gap = R.gap || 0;
    let peak = -1e9;
    placed.forEach((p) => { if (p.d > peak) peak = p.d; });
    placed.forEach((p, i) => {
      const beat0 = mod(p.t, bpb) === 0;
      let v = 0.64 + (beat0 ? 0.1 : 0) + (p.d === peak ? 0.08 : 0) + (rng() - 0.5) * 0.08;
      if (p.last) v = 0.6;
      const nxt = placed[i + 1];
      const flows = nxt && Math.abs((nxt.t) - (p.t + p.dur)) < 1e-6;
      const dur = gap && flows ? Math.max(0.15, p.dur - gap) : p.dur;
      out.push(note(p.t, dur, degMidi(S, p.d), v * (R.vel == null ? 1 : R.vel)));
    });
    const tracks = [mkTrack(R, 'melody', out)];
    for (const a of R.also || []) {
      const vr = RANGES[a.voice];
      const dn = out.map((x) => Object.assign({}, x, { midi: foldInto(x.midi + 12 * (a.shift || 0), vr[0], vr[1]), vel: round3(clamp(x.vel * (a.vel == null ? 0.8 : a.vel), 0.05, 1)) }));
      tracks.push({ voice: a.voice, role: 'melody-double', layer: a.layer == null ? (R.layer || 0) : a.layer, gain: (R.gain == null ? 1 : R.gain) * (a.gain == null ? 0.6 : a.gain), pan: a.pan == null ? -(R.pan || 0.2) : a.pan, range: vr.slice(), notes: dn });
    }
    return tracks;
  }

  // ---- harmony beds
  function rolePad(rng, S, R) {
    const lo = R.range[0], hi = R.range[1], notes = [];
    for (const b of S.blocks) {
      const pcs = chordPcs(S, b.deg);
      const r0 = lowestPc(lo, pcs[0]);
      const r1 = nextPcAbove(r0, pcs[1]);
      let r2 = nextPcAbove(r1, pcs[2]);
      if (r2 > hi) r2 -= 12;
      const list = R.voicing === 'root' ? [r0] : R.voicing === 'open' ? [r0, r2] : [r0, r1, r2];
      const uniq = list.filter((m, i) => list.indexOf(m) === i && m >= lo && m <= hi);
      for (const m of uniq) notes.push(note(b.bar * S.bpb, b.bars * S.bpb, m, (R.vel == null ? 0.5 : R.vel) * (0.92 + 0.16 * rng())));
    }
    return [mkTrack(R, 'pad', notes)];
  }
  function roleDrone(rng, S, R) {
    const lo = R.range[0], notes = [], span = (R.bars || 4);
    for (let b = 0; b < S.bars; b += span) {
      const len = Math.min(span, S.bars - b);
      for (const off of R.tones || [0, 7]) {
        const m = lowestPc(lo, mod(S.tonic + off, 12));
        notes.push(note(b * S.bpb, len * S.bpb, m, (R.vel == null ? 0.4 : R.vel) * (0.94 + 0.12 * rng())));
      }
    }
    return [mkTrack(R, 'drone', notes)];
  }
  function roleArp(rng, S, R) {
    const lo = R.range[0], hi = R.range[1], stepB = R.step || 0.5, notes = [];
    const pat = ARP_PATTERNS[R.pattern || 'roll'];
    const perBar = Math.round(S.bpb / stepB);
    for (let b = 0; b < S.bars; b++) {
      if (R.every && b % R.every !== 0) continue;
      const tones = tonesFor(S, S.chordAt[b], lo, hi);
      if (!tones.length) continue;
      const start = R.startIdx || 0;
      for (let s = 0; s < perBar; s++) {
        const onBeat = mod(s * stepB, 1) === 0;
        if (R.skip && rng() < R.skip * (s === 0 ? 0.25 : onBeat ? 0.7 : 1)) continue;
        const idx = clamp(start + pat[s % pat.length], 0, tones.length - 1);
        notes.push(note(b * S.bpb + s * stepB, stepB * (R.len || 1), tones[idx], (R.vel == null ? 0.5 : R.vel) * ((onBeat ? 1 : 0.8) + (rng() - 0.5) * 0.12)));
      }
    }
    return [mkTrack(R, 'arp', notes)];
  }
  function roleBass(rng, S, R) {
    const lo = R.range[0], hi = R.range[1], notes = [], bpb = S.bpb;
    const kind = R.pattern || 'root';
    for (let b = 0; b < S.bars; b++) {
      if (R.every && b % R.every !== 0) continue;
      const pcs = chordPcs(S, S.chordAt[b]);
      const root = lowestPc(lo, pcs[0]);
      const third = nextPcAbove(root, pcs[1]);
      const fifth = nextPcAbove(third, pcs[2]);
      const up = (m) => (m + 12 <= hi ? m + 12 : m);
      const fit = (m) => foldInto(m, lo, hi);
      const v = R.vel == null ? 0.7 : R.vel, t0 = b * bpb;
      const jit = () => 0.94 + rng() * 0.12;
      if (kind === 'pedal') notes.push(note(t0, bpb * 0.95, root, v * jit()));
      else if (kind === 'root') {
        notes.push(note(t0, bpb === 3 ? 1.5 : 1.75, root, v * jit()));
        if (bpb === 4) notes.push(note(t0 + 2, 1.5, rng() < 0.5 ? root : fit(fifth), v * 0.7 * jit()));
      } else if (kind === 'half') {
        notes.push(note(t0, 1.9, root, v * jit()));
        if (bpb === 4) notes.push(note(t0 + 2, 1.9, fit(fifth), v * 0.75 * jit()));
      } else if (kind === 'walk') {
        const seqm = [root, third, fifth, third];
        for (let i = 0; i < Math.min(4, bpb); i++) notes.push(note(t0 + i, 0.9, fit(seqm[i]), v * (i === 0 ? 1 : 0.75) * jit()));
      } else if (kind === 'drive') {
        const seqm = [root, root, up(root), root, root, root, fit(fifth), root];
        for (let i = 0; i < 8; i++) notes.push(note(t0 + i * 0.5, 0.45, seqm[i], v * (i % 4 === 0 ? 1 : 0.7) * jit()));
      }
    }
    return [mkTrack(R, 'bass', notes)];
  }
  function roleOstinato(rng, S, R) {
    const lo = R.range[0], hi = R.range[1], notes = [];
    const tmpl = OSTINATO[R.template || 'drive'];
    let cur = tmpl[0];
    for (let b = 0; b < S.bars; b++) {
      if (b % 4 === 0) cur = tmpl[rng.int(0, tmpl.length - 1)];
      const useT = b % 4 === 3 ? tmpl[(tmpl.indexOf(cur) + 1) % tmpl.length] : cur;
      const pcs = chordPcs(S, S.chordAt[b]);
      const root = lowestPc(lo, pcs[0]);
      const third = nextPcAbove(root, pcs[1]);
      const fifth = nextPcAbove(third, pcs[2]);
      const map = { R: root, r: root + 12, 3: third, 5: fifth };
      const stepB = S.bpb / useT.length;
      for (let i = 0; i < useT.length; i++) {
        const ch = useT[i];
        if (ch === '.') continue;
        const m = foldInto(map[ch], lo, hi);
        const strong = i === 0 || ch === 'r';
        notes.push(note(b * S.bpb + i * stepB, stepB * 0.95, m, (R.vel == null ? 0.55 : R.vel) * (strong ? 1 : 0.72) * (0.93 + 0.14 * rng())));
      }
    }
    return [mkTrack(R, 'ostinato', notes)];
  }
  function rolePerc(rng, S, R) {
    const lo = R.range[0], notes = [];
    const pats = Array.isArray(R.pattern) ? R.pattern : PERC[R.pattern || 'march'];
    const tonicPc = mod(S.tonic, 12), fifthPc = mod(S.tonic + 7, 12);
    const low = lowestPc(lo, tonicPc), five = lowestPc(lo, fifthPc), ka = lowestPc(lo + 12, tonicPc);
    const stepsPerBar = S.bpb === 4 ? 16 : 12;
    let fifthFlip = 0;
    for (let b = 0; b < S.bars; b++) {
      if (R.every && b % R.every !== 0) continue;
      let pat = pats[b % pats.length];
      if (R.fill && b % 4 === 3 && stepsPerBar === 16) pat = pat.slice(0, 12) + PERC_FILLS[Math.floor(b / 4) % PERC_FILLS.length];
      for (let s = 0; s < Math.min(pat.length, stepsPerBar); s++) {
        const ch = pat[s];
        if (ch === '.') continue;
        const t = b * S.bpb + s * 0.25;
        const j = 0.94 + rng() * 0.12;
        const vel = R.vel == null ? 0.8 : R.vel;
        if (ch === 'X') notes.push(note(t, 0.25, low, vel * j, { hit: 'don' }));
        else if (ch === 'D') notes.push(note(t, 0.25, low, vel * j, { hit: 'don', big: 1 }));
        else if (ch === 'x') { notes.push(note(t, 0.25, (fifthFlip++ % 3 === 2) ? five : low, vel * 0.72 * j, { hit: 'don' })); }
        else if (ch === 'o') notes.push(note(t, 0.25, ka, vel * 0.62 * j, { hit: 'ka' }));
        else if (ch === 'k') notes.push(note(t, 0.25, ka, vel * 0.4 * j, { hit: 'ka' }));
      }
    }
    return [mkTrack(R, 'perc', notes)];
  }
  function roleClack(rng, S, R) {
    const notes = [], tonic = lowestPc(RANGES.hyoshigi[0] + 24, mod(S.tonic, 12));
    const kind = R.pattern || 'offbeat', v = R.vel == null ? 0.4 : R.vel;
    for (let b = 0; b < S.bars; b++) {
      const t0 = b * S.bpb;
      if (kind === 'offbeat') { for (let i = 0; i < S.bpb; i++) notes.push(note(t0 + i + 0.5, 0.1, tonic, v * (0.85 + 0.3 * rng()))); }
      else if (kind === 'tick') { for (let i = 0; i < S.bpb; i++) notes.push(note(t0 + i, 0.1, tonic, v * (i === 0 ? 1 : 0.6) * (0.9 + 0.2 * rng()))); }
      else if (kind === 'phraseEnd' && b % 4 === 3) { notes.push(note(t0 + S.bpb - 1, 0.1, tonic, v, { double: 1 })); notes.push(note(t0 + S.bpb - 0.5, 0.1, tonic, v * 0.8)); }
      else if (kind === 'sparse' && b % 2 === 1 && rng() < 0.7) notes.push(note(t0 + S.bpb - 1 + (rng() < 0.5 ? 0 : 0.5), 0.1, tonic, v * (0.8 + 0.3 * rng())));
    }
    return [mkTrack(R, 'clack', notes)];
  }
  function roleBell(rng, S, R) {
    const lo = R.range[0], hi = R.range[1], notes = [], p = R.p == null ? 0.6 : R.p;
    S.blocks.forEach((b, bi) => {
      const per = R.perBlock ? b.bars : 1;
      for (let k = 0; k < b.bars; k += per) {
        if (rng() > p && !(bi === 0 && k === 0 && !notes.length && p < 1 && S.blocks.length < 3)) continue;
        const pcs = chordPcs(S, b.deg);
        const pc = pcs[rng() < 0.65 ? 0 : 2];
        const m = foldInto(lowestPc(lo + Math.floor((hi - lo) * 0.3 * rng()), pc), lo, hi);
        notes.push(note((b.bar + k) * S.bpb, Math.min(S.bpb * 2, (S.bars - b.bar - k) * S.bpb), m, (R.vel == null ? 0.5 : R.vel) * (0.9 + 0.2 * rng())));
      }
    });
    if (!notes.length) {                                    // a bell track is never silent: ring once on the first chord
      const pcs = chordPcs(S, S.blocks[0].deg);
      notes.push(note(0, Math.min(S.bpb * 2, S.bars * S.bpb), foldInto(lowestPc(lo + 6, pcs[0]), lo, hi), R.vel == null ? 0.5 : R.vel));
    }
    return [mkTrack(R, 'bell', notes)];
  }
  function roleCrackle(rng, S, R) {
    const notes = [], per = R.perBar || 3, m = lowestPc(RANGES.crackle[0] + 12, mod(S.tonic, 12));
    for (let b = 0; b < S.bars; b++) {
      const cnt = Math.max(0, Math.round(per + (rng() - 0.5) * 2));
      const used = {};
      for (let i = 0; i < cnt; i++) {
        const slot = rng.int(0, S.bpb * 8 - 1);
        if (used[slot]) continue;
        used[slot] = 1;
        notes.push(note(b * S.bpb + slot * 0.125, 0.06, m, (R.vel == null ? 0.5 : R.vel) * (0.3 + 0.7 * rng())));
      }
    }
    notes.sort((a, b2) => a.t - b2.t);
    return [mkTrack(R, 'crackle', notes)];
  }
  // dyads that hold a tritone when the chord has one (the b2 against the 5th of miyako-bushi and in-sen), else root and fifth
  function roleStab(rng, S, R) {
    const lo = R.range[0], hi = R.range[1], notes = [], at = R.at || [0, 2.5];
    for (let b = 0; b < S.bars; b++) {
      const tones = tonesFor(S, S.chordAt[b], lo, hi);
      let pair = null;
      for (let i = 0; i < tones.length && !pair; i++) for (let j = i + 1; j < tones.length; j++) if (tones[j] - tones[i] === 6) { pair = [tones[i], tones[j]]; break; }
      if (!pair && tones.length >= 2) pair = [tones[0], tones[Math.min(2, tones.length - 1)]];
      if (!pair) continue;
      at.forEach((beat, k) => {
        if (beat >= S.bpb) return;
        const v = (R.vel == null ? 0.7 : R.vel) * (k === 0 ? 1 : 0.8) * (0.94 + 0.12 * rng());
        for (const m of pair) notes.push(note(b * S.bpb + beat, R.len || 0.5, m, v));
      });
    }
    return [mkTrack(R, 'stab', notes)];
  }
  // a scale run for fanfares and stingers: {bar, beat, from, to, step}
  function roleRun(rng, S, R) {
    const lo = R.range[0], hi = R.range[1], notes = [];
    for (const r of R.runs || []) {
      const dir = r.to >= r.from ? 1 : -1, stepB = r.step || 0.25;
      let i = 0;
      for (let d = r.from; dir > 0 ? d <= r.to : d >= r.to; d += dir, i++) {
        const t = r.bar * S.bpb + r.beat + i * stepB;
        if (t >= S.bars * S.bpb) break;
        const m = foldInto(degMidi(S, d), lo, hi);
        notes.push(note(t, Math.min(stepB * 2, S.bars * S.bpb - t), m, (R.vel == null ? 0.6 : R.vel) * (0.7 + 0.3 * (i / 8))));
      }
    }
    return [mkTrack(R, 'run', notes)];
  }
  const ROLES = { melody: roleMelody, pad: rolePad, drone: roleDrone, arp: roleArp, bass: roleBass, ostinato: roleOstinato, perc: rolePerc, clack: roleClack, bell: roleBell, crackle: roleCrackle, stab: roleStab, run: roleRun };

  // ---- the score: every id of DATA.LISTS.music. key is the tonic as a MIDI note, prog is [chord root degree, bars] per block.
  const P1 = (list) => list.map((d) => [d, 1]);
  // Intensity layers: 0 rhythm bed, 1 arpeggios and clacks, 2 the melody, 3 the full band. The screens send
  // 1 - living/starting enemies, so thresholds are where each layer is fully in.
  const TH_COMBAT = [0, 0.25, 0.5, 0.75];
  const TH_BOSS = [0, 0.12, 0.35, 0.6];
  const TH_FINAL = [0, 0.05, 0.2, 0.4];

  function combatKit(o) {
    return [
      { role: 'perc', voice: 'taiko', range: [33, 57], pattern: o.perc, fill: true, vel: 0.9, gain: 0.95, layer: 0 },
      { role: 'bass', voice: 'biwa', range: [33, 57], pattern: 'drive', vel: 0.7, gain: 0.8, layer: 0 },
      { role: 'ostinato', voice: 'shamisen', range: [50, 74], template: o.ost, vel: 0.55, gain: 0.7, pan: -0.2, layer: 0 },
      { role: 'arp', voice: 'koto', range: [64, 88], step: 0.25, pattern: 'up', skip: o.skip || 0, vel: 0.36, len: 1.2, gain: 0.7, pan: 0.3, layer: 1 },
      { role: 'clack', voice: 'hyoshigi', pattern: 'offbeat', vel: 0.32, gain: 0.7, layer: 1 },
      { role: 'melody', voice: 'shakuhachi', range: o.mel, cells: o.cells, leaps: true, phrase: 4, vel: 0.8, gap: 0.1, gain: 0.95, pan: 0.1, layer: 2,
        also: [{ voice: 'koto', shift: 0, gain: 0.55 }, { voice: 'shamisen', shift: 1, gain: 0.45, layer: 3 }] },
      { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'combatL3', vel: 0.7, gain: 0.7, layer: 3 },
      { role: 'pad', voice: 'pad', range: [40, 72], voicing: 'full', vel: 0.42, gain: 0.8, layer: 3 },
      { role: 'bell', voice: 'rin', range: [76, 100], p: 0.8, vel: 0.45, gain: 0.55, pan: -0.3, layer: 3 },
    ];
  }

  const TRACKS = {
    // ---- menus
    title: {
      key: 50, scale: 'yo', tempo: 60, bpb: 4, mood: 'grand, slow, moonlit', xfade: 3,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [3, 2], [2, 2], [1, 2], [0, 2], [3, 2], [4, 2], [0, 2]], roles: [
        { role: 'pad', voice: 'pad', range: [38, 76], voicing: 'full', vel: 0.55, gain: 1 },
        { role: 'melody', voice: 'shakuhachi', range: [62, 88], cells: 'long', phrase: 4, form: ['A', 'a2', 'B', 'a'], vel: 0.85, gap: 0.12, gain: 1, pan: 0.1 },
        { role: 'arp', voice: 'koto', range: [50, 76], step: 0.5, pattern: 'pluck3', skip: 0.45, vel: 0.42, len: 2, gain: 0.8, pan: -0.35 },
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'sparseDon', vel: 0.7, gain: 0.8 },
        { role: 'bell', voice: 'rin', range: [74, 98], p: 0.7, perBlock: true, vel: 0.5, gain: 0.7, pan: 0.3 },
      ] }],
    },
    hero_select: {
      key: 57, scale: 'yo', tempo: 84, bpb: 4, mood: 'warm, hopeful, koto', xfade: 1.5,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 3, 2, 4, 0, 3, 1, 4, 0, 2, 3, 1, 3, 4, 3, 0]), roles: [
        { role: 'melody', voice: 'koto', range: [64, 88], cells: 'flow', phrase: 4, form: ['A', 'a2', 'B', 'a'], vel: 0.85, gain: 1, pan: 0.1 },
        { role: 'arp', voice: 'koto', range: [45, 69], step: 0.5, pattern: 'roll', skip: 0.1, vel: 0.42, len: 1.6, gain: 0.7, pan: -0.3 },
        { role: 'pad', voice: 'pad', range: [45, 72], voicing: 'open', vel: 0.36, gain: 0.85 },
        { role: 'bass', voice: 'biwa', range: [36, 56], pattern: 'root', vel: 0.55, gain: 0.8 },
        { role: 'bell', voice: 'rin', range: [76, 100], p: 0.35, perBlock: true, vel: 0.4, gain: 0.6, pan: 0.35 },
      ] }],
    },
    // ---- exploration
    map1: {
      key: 55, scale: 'yo', tempo: 72, bpb: 4, mood: 'calm, golden dusk, pastoral', xfade: 2.5,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [3, 2], [2, 2], [4, 2], [0, 2], [1, 2], [3, 2], [0, 2]], roles: [
        { role: 'melody', voice: 'shakuhachi', range: [60, 86], cells: 'flow', phrase: 4, vel: 0.72, gap: 0.12, gain: 0.95, pan: 0.1 },
        { role: 'arp', voice: 'koto', range: [48, 74], step: 0.5, pattern: 'roll', skip: 0.25, vel: 0.4, len: 1.8, gain: 0.8, pan: -0.3 },
        { role: 'pad', voice: 'pad', range: [43, 70], voicing: 'full', vel: 0.4, gain: 0.9 },
        { role: 'bass', voice: 'biwa', range: [36, 55], pattern: 'half', vel: 0.5, gain: 0.75 },
        { role: 'clack', voice: 'hyoshigi', pattern: 'phraseEnd', vel: 0.35, gain: 0.6 },
        { role: 'bell', voice: 'rin', range: [74, 98], p: 0.3, perBlock: true, vel: 0.4, gain: 0.6, pan: 0.3 },
      ] }],
    },
    map2: {
      key: 57, scale: 'in-sen', tempo: 66, bpb: 4, mood: 'nocturnal, watery, lantern-lit', xfade: 2.5,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [2, 2], [3, 2], [0, 2], [0, 2], [4, 2], [3, 2], [0, 2]], roles: [
        { role: 'arp', voice: 'koto', range: [57, 84], step: 0.5, pattern: 'wave', skip: 0.12, vel: 0.5, len: 2.2, gain: 0.95, pan: -0.25 },
        { role: 'melody', voice: 'shakuhachi', range: [64, 88], cells: 'sparse', phrase: 4, vel: 0.68, gap: 0.12, gain: 0.9, pan: 0.15 },
        { role: 'pad', voice: 'pad', range: [45, 72], voicing: 'open', vel: 0.4, gain: 0.9 },
        { role: 'bell', voice: 'rin', range: [76, 102], p: 0.55, vel: 0.42, gain: 0.65, pan: 0.35 },
        { role: 'bass', voice: 'biwa', range: [36, 55], pattern: 'pedal', vel: 0.42, gain: 0.7, every: 2 },
      ] }],
    },
    map3: {
      key: 50, scale: 'miyako-bushi', tempo: 70, bpb: 4, mood: 'ominous, wide, storm on the horizon', xfade: 3,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 4], [1, 2], [0, 2], [4, 2], [3, 2], [1, 2], [0, 2]], roles: [
        { role: 'drone', voice: 'pad', range: [38, 62], tones: [0, 7], bars: 4, vel: 0.5, gain: 0.95 },
        { role: 'pad', voice: 'pad', range: [50, 74], voicing: 'open', vel: 0.32, gain: 0.8 },
        { role: 'melody', voice: 'shakuhachi', range: [69, 91], cells: 'sparse', phrase: 4, vel: 0.65, gap: 0.12, gain: 0.9, pan: 0.2 },
        { role: 'bass', voice: 'biwa', range: [33, 52], pattern: 'pedal', vel: 0.55, gain: 0.8 },
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'heartbeat', vel: 0.5, gain: 0.7 },
        { role: 'bell', voice: 'rin', range: [74, 100], p: 0.4, perBlock: true, vel: 0.4, gain: 0.6, pan: -0.3 },
      ] }],
    },
    // ---- combat: layered by AUDIO.intensity
    combat1: {
      key: 52, scale: 'yo', tempo: 128, bpb: 4, mood: 'driving, bright, taiko and shamisen', xfade: 0.5, thresholds: TH_COMBAT,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 0, 2, 3, 0, 0, 4, 3, 0, 2, 3, 4, 2, 3, 4, 0]),
        roles: combatKit({ perc: 'combat', ost: 'drive', mel: [64, 88], cells: 'lively' }) }],
    },
    combat2: {
      key: 54, scale: 'in-sen', tempo: 136, bpb: 4, mood: 'tense, nocturnal, relentless', xfade: 0.5, thresholds: TH_COMBAT,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 0, 3, 2, 0, 1, 3, 4, 0, 0, 2, 3, 1, 4, 3, 0]),
        roles: combatKit({ perc: 'combatFast', ost: 'gallop', mel: [66, 90], cells: 'run' }) }],
    },
    combat3: {
      key: 52, scale: 'miyako-bushi', tempo: 146, bpb: 4, mood: 'stormy, urgent, dissonant', xfade: 0.5, thresholds: TH_COMBAT,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 1, 0, 4, 0, 1, 3, 4, 0, 1, 0, 4, 3, 4, 1, 0]),
        roles: combatKit({ perc: 'combatFast', ost: 'gallop', mel: [64, 88], cells: 'run', skip: 0.3 }) }],
    },
    elite: {
      key: 54, scale: 'miyako-bushi', tempo: 120, bpb: 4, mood: 'menacing, heavy, tritone hits', xfade: 0.5, thresholds: TH_COMBAT,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [1, 1], [4, 1], [0, 2], [1, 1], [4, 1], [0, 1], [1, 1], [4, 1], [1, 1], [4, 1], [1, 1], [0, 2]], roles: [
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'marchHeavy', fill: true, vel: 0.95, gain: 1, layer: 0 },
        { role: 'stab', voice: 'shamisen', range: [50, 74], at: [0, 2.5], len: 0.5, vel: 0.75, gain: 0.85, pan: -0.15, layer: 0 },
        { role: 'bass', voice: 'biwa', range: [31, 52], pattern: 'pedal', vel: 0.75, gain: 0.9, layer: 0 },
        { role: 'ostinato', voice: 'shamisen', range: [50, 72], template: 'tremolo', vel: 0.4, gain: 0.6, pan: 0.2, layer: 1 },
        { role: 'clack', voice: 'hyoshigi', pattern: 'tick', vel: 0.35, gain: 0.7, layer: 1 },
        { role: 'melody', voice: 'shakuhachi', range: [72, 91], cells: 'sparse', leaps: true, phrase: 4, vel: 0.8, gap: 0.1, gain: 0.95, pan: 0.15, layer: 2 },
        { role: 'pad', voice: 'pad', range: [40, 70], voicing: 'open', vel: 0.45, gain: 0.85, layer: 2 },
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'bossL3', vel: 0.65, gain: 0.7, layer: 3 },
        { role: 'bell', voice: 'rin', range: [74, 100], p: 0.7, vel: 0.5, gain: 0.55, pan: -0.3, layer: 3 },
      ] }],
    },
    // ---- bosses: already full at intensity 0, more drama per phase
    boss1: {
      key: 50, scale: 'in-sen', tempo: 140, bpb: 4, mood: 'mythic, elegant menace, nine tails', xfade: 0.6, thresholds: TH_BOSS,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [1, 1], [4, 1], [0, 2], [3, 1], [4, 1], [0, 1], [1, 1], [2, 1], [4, 1], [3, 1], [1, 1], [4, 1], [0, 1]], roles: [
        { role: 'pad', voice: 'pad', range: [38, 66], voicing: 'open', vel: 0.5, gain: 0.9, layer: 0 },
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'bossA', fill: true, vel: 1, gain: 1, layer: 0 },
        { role: 'bass', voice: 'biwa', range: [33, 55], pattern: 'drive', vel: 0.75, gain: 0.85, layer: 0 },
        { role: 'ostinato', voice: 'shamisen', range: [50, 74], template: 'gallop', vel: 0.55, gain: 0.7, pan: -0.2, layer: 0 },
        { role: 'melody', voice: 'shakuhachi', range: [64, 90], cells: 'flow', leaps: true, phrase: 4, vel: 0.85, gap: 0.1, gain: 1, pan: 0.1, layer: 0,
          also: [{ voice: 'koto', shift: 0, gain: 0.5, layer: 1 }] },
        { role: 'arp', voice: 'koto', range: [62, 90], step: 0.25, pattern: 'up', skip: 0.25, vel: 0.36, len: 1.2, gain: 0.7, pan: 0.3, layer: 1 },
        { role: 'clack', voice: 'hyoshigi', pattern: 'offbeat', vel: 0.35, gain: 0.7, layer: 1 },
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'bossL3', vel: 0.7, gain: 0.75, layer: 2 },
        { role: 'bell', voice: 'rin', range: [74, 100], p: 0.9, vel: 0.5, gain: 0.6, pan: -0.3, layer: 2 },
        { role: 'stab', voice: 'shamisen', range: [50, 74], at: [0, 2.5], vel: 0.7, gain: 0.7, layer: 3 },
        { role: 'pad', voice: 'pad', range: [55, 84], voicing: 'full', vel: 0.4, gain: 0.8, layer: 3 },
      ] }],
    },
    boss2: {
      key: 57, scale: 'miyako-bushi', tempo: 148, bpb: 4, mood: 'seductive, silken, deadly', xfade: 0.6, thresholds: TH_BOSS,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [1, 2], [0, 2], [4, 2], [0, 2], [3, 1], [1, 1], [4, 2], [0, 2]], roles: [
        { role: 'pad', voice: 'pad', range: [38, 66], voicing: 'open', vel: 0.48, gain: 0.9, layer: 0 },
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'marchHeavy', fill: true, vel: 0.95, gain: 0.95, layer: 0 },
        { role: 'bass', voice: 'biwa', range: [33, 55], pattern: 'drive', vel: 0.7, gain: 0.85, layer: 0 },
        { role: 'ostinato', voice: 'koto', range: [52, 76], template: 'silk', vel: 0.6, gain: 0.75, pan: -0.25, layer: 0 },
        { role: 'melody', voice: 'shamisen', range: [57, 84], cells: 'lively', phrase: 4, vel: 0.9, gain: 1, pan: 0.1, layer: 0,
          also: [{ voice: 'shakuhachi', shift: 1, gain: 0.5, layer: 1 }] },
        { role: 'arp', voice: 'koto', range: [64, 92], step: 0.25, pattern: 'sparkle', skip: 0.25, vel: 0.34, len: 1.2, gain: 0.65, pan: 0.3, layer: 1 },
        { role: 'clack', voice: 'hyoshigi', pattern: 'sparse', vel: 0.4, gain: 0.7, layer: 1 },
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'bossL3', vel: 0.7, gain: 0.75, layer: 2 },
        { role: 'bell', voice: 'rin', range: [76, 102], p: 0.9, vel: 0.5, gain: 0.6, pan: -0.3, layer: 2 },
        { role: 'stab', voice: 'shamisen', range: [50, 74], at: [0, 2.5], vel: 0.7, gain: 0.7, layer: 3 },
        { role: 'pad', voice: 'pad', range: [55, 84], voicing: 'full', vel: 0.4, gain: 0.8, layer: 3 },
      ] }],
    },
    boss3: {
      key: 48, scale: 'yo', tempo: 152, bpb: 4, mood: 'cold, relentless, erased', xfade: 0.6, thresholds: TH_BOSS,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 3, 2, 4, 0, 3, 4, 1, 0, 2, 3, 4, 1, 3, 4, 0]), roles: [
        { role: 'pad', voice: 'pad', range: [36, 66], voicing: 'open', vel: 0.5, gain: 0.9, layer: 0 },
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'bossA', fill: true, vel: 1, gain: 1, layer: 0 },
        { role: 'ostinato', voice: 'koto', range: [48, 74], template: 'staccato', vel: 0.5, gain: 0.7, pan: -0.2, layer: 0 },
        { role: 'bass', voice: 'biwa', range: [33, 52], pattern: 'drive', vel: 0.7, gain: 0.85, layer: 0 },
        { role: 'melody', voice: 'shakuhachi', range: [64, 90], cells: 'flow', leaps: true, phrase: 4, vel: 0.85, gap: 0.1, gain: 1, pan: 0.1, layer: 0 },
        { role: 'arp', voice: 'arp', range: [64, 96], step: 0.25, pattern: 'rise', skip: 0.3, vel: 0.36, len: 1.2, gain: 0.7, pan: 0.3, layer: 1 },
        { role: 'clack', voice: 'hyoshigi', pattern: 'tick', vel: 0.38, gain: 0.7, layer: 1 },
        { role: 'bell', voice: 'rin', range: [76, 102], p: 0.9, vel: 0.5, gain: 0.6, pan: -0.3, layer: 2 },
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'bossL3', vel: 0.7, gain: 0.75, layer: 2 },
        { role: 'stab', voice: 'shamisen', range: [50, 74], at: [0, 1.5, 2.5], vel: 0.7, gain: 0.7, layer: 3 },
        { role: 'pad', voice: 'pad', range: [55, 84], voicing: 'full', vel: 0.4, gain: 0.8, layer: 3 },
      ] }],
    },
    final: {
      key: 47, scale: 'in-sen', tempo: 160, bpb: 4, mood: 'epic, desperate, the last page', xfade: 0.6, thresholds: TH_FINAL,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 1, 4, 1, 0, 1, 3, 4, 0, 1, 4, 1, 3, 4, 1, 0]), roles: [
        { role: 'pad', voice: 'pad', range: [36, 68], voicing: 'full', vel: 0.5, gain: 0.95, layer: 0 },
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'bossA', fill: true, vel: 1, gain: 1, layer: 0 },
        { role: 'bass', voice: 'biwa', range: [31, 52], pattern: 'drive', vel: 0.8, gain: 0.9, layer: 0 },
        { role: 'ostinato', voice: 'shamisen', range: [50, 74], template: 'gallop', vel: 0.6, gain: 0.75, pan: -0.2, layer: 0 },
        { role: 'melody', voice: 'shakuhachi', range: [62, 90], cells: 'flow', leaps: true, phrase: 4, vel: 0.9, gap: 0.1, gain: 1, pan: 0.1, layer: 0,
          also: [{ voice: 'koto', shift: 0, gain: 0.55 }] },
        { role: 'arp', voice: 'koto', range: [62, 92], step: 0.25, pattern: 'up', skip: 0.6, vel: 0.38, len: 1.2, gain: 0.7, pan: 0.3, layer: 1 },
        { role: 'clack', voice: 'hyoshigi', pattern: 'offbeat', vel: 0.38, gain: 0.7, layer: 1 },
        { role: 'stab', voice: 'shamisen', range: [50, 74], at: [0, 2.5], vel: 0.75, gain: 0.75, layer: 1 },
        { role: 'melody', voice: 'shamisen', range: [66, 88], cells: 'flow', leaps: true, phrase: 4, vel: 0.7, gain: 0.7, pan: -0.15, layer: 2 },
        { role: 'bell', voice: 'rin', range: [76, 102], p: 1, vel: 0.55, gain: 0.65, pan: -0.3, layer: 2 },
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'bossL3', vel: 0.75, gain: 0.8, layer: 2 },
        { role: 'pad', voice: 'pad', range: [55, 86], voicing: 'full', vel: 0.42, gain: 0.85, layer: 3 },
        { role: 'arp', voice: 'arp', range: [72, 100], step: 0.25, pattern: 'sparkle', skip: 0.7, vel: 0.34, len: 1.2, gain: 0.6, pan: -0.3, layer: 3 },
      ] }],
    },
    // ---- shop, camp, event
    shop: {
      key: 48, scale: 'yo', tempo: 104, bpb: 4, mood: 'playful, bustling, plucked', xfade: 1.2,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 3, 2, 3, 0, 3, 4, 3, 0, 2, 3, 1, 0, 3, 4, 0]), roles: [
        { role: 'melody', voice: 'shamisen', range: [55, 79], cells: 'lively', phrase: 4, vel: 0.85, gain: 1, pan: 0.1, also: [{ voice: 'koto', shift: 1, gain: 0.45 }] },
        { role: 'bass', voice: 'biwa', range: [36, 55], pattern: 'walk', vel: 0.6, gain: 0.8 },
        { role: 'clack', voice: 'hyoshigi', pattern: 'offbeat', vel: 0.45, gain: 0.7 },
        { role: 'arp', voice: 'arp', range: [72, 96], step: 0.5, pattern: 'sparkle', skip: 0.6, vel: 0.36, len: 1, gain: 0.6, pan: -0.3 },
        { role: 'pad', voice: 'pad', range: [45, 72], voicing: 'open', vel: 0.28, gain: 0.7 },
      ] }],
    },
    camp: {
      key: 53, scale: 'yo', tempo: 54, bpb: 3, mood: 'a lullaby by the fire', xfade: 2.5,
      sections: [{ id: 'loop', bars: 12, loop: true, prog: [[0, 3], [3, 3], [2, 3], [0, 3]], roles: [
        { role: 'melody', voice: 'koto', range: [60, 84], cells: 'lull', phrase: 4, form: ['A', 'B', 'a'], vel: 0.72, gain: 1, pan: 0.1 },
        { role: 'pad', voice: 'pad', range: [41, 69], voicing: 'full', vel: 0.4, gain: 0.9 },
        { role: 'arp', voice: 'arp', range: [53, 77], step: 1, pattern: 'pluck3', skip: 0.35, vel: 0.3, len: 1.5, gain: 0.7, pan: -0.3 },
        { role: 'crackle', voice: 'crackle', perBar: 3, vel: 0.5, gain: 0.8 },
        { role: 'bell', voice: 'rin', range: [76, 98], p: 0.35, perBlock: true, vel: 0.35, gain: 0.55, pan: 0.3 },
      ] }],
    },
    event: {
      key: 47, scale: 'in-sen', tempo: 58, bpb: 4, mood: 'mysterious, sparse, fogbound', xfade: 2.5,
      sections: [{ id: 'loop', bars: 12, loop: true, prog: [[0, 4], [3, 2], [1, 2], [0, 2], [4, 2]], roles: [
        { role: 'drone', voice: 'pad', range: [35, 59], tones: [0, 7], bars: 4, vel: 0.5, gain: 0.95 },
        { role: 'melody', voice: 'shakuhachi', range: [66, 88], cells: 'sparse', phrase: 4, form: ['A', 'B', 'a'], vel: 0.62, gap: 0.12, gain: 0.9, pan: 0.15 },
        { role: 'bell', voice: 'rin', range: [72, 100], p: 0.6, vel: 0.42, gain: 0.65, pan: -0.3 },
        { role: 'bass', voice: 'biwa', range: [33, 52], pattern: 'root', vel: 0.4, gain: 0.7, every: 2 },
        { role: 'clack', voice: 'hyoshigi', pattern: 'sparse', vel: 0.28, gain: 0.6 },
      ] }],
    },
    // ---- rewards and stingers
    reward: {
      key: 50, scale: 'yo', tempo: 116, bpb: 4, mood: 'bright fanfare loop', xfade: 0.4,
      sections: [{ id: 'loop', bars: 8, loop: true, prog: P1([0, 3, 2, 4, 0, 3, 4, 0]), roles: [
        { role: 'run', voice: 'koto', range: [62, 90], runs: [{ bar: 0, beat: 0, from: 0, to: 7, step: 0.25 }, { bar: 4, beat: 0, from: 2, to: 9, step: 0.25 }], vel: 0.6, gain: 0.85, pan: -0.2 },
        { role: 'melody', voice: 'koto', range: [66, 90], cells: 'lively', phrase: 2, vel: 0.9, gain: 1, pan: 0.1, also: [{ voice: 'shamisen', shift: 0, gain: 0.5 }] },
        { role: 'pad', voice: 'pad', range: [43, 72], voicing: 'full', vel: 0.42, gain: 0.85 },
        { role: 'bass', voice: 'biwa', range: [36, 55], pattern: 'half', vel: 0.6, gain: 0.8 },
        { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'march', vel: 0.55, gain: 0.7 },
        { role: 'bell', voice: 'rin', range: [78, 102], p: 1, vel: 0.5, gain: 0.6, pan: 0.3 },
        { role: 'clack', voice: 'hyoshigi', pattern: 'offbeat', vel: 0.3, gain: 0.6 },
      ] }],
    },
    victory: {
      key: 50, scale: 'yo', tempo: 100, bpb: 4, mood: 'triumphant dawn, then a warm rest', xfade: 0.15,
      sections: [
        { id: 'stinger', bars: 3, loop: false, prog: [[0, 1], [3, 1], [0, 1]], roles: [
          { role: 'run', voice: 'koto', range: [62, 93], runs: [{ bar: 0, beat: 0, from: 0, to: 9, step: 0.25 }], vel: 0.75, gain: 0.95, pan: -0.2 },
          { role: 'melody', voice: 'shakuhachi', range: [62, 88], cells: 'flow', phrase: 3, vel: 0.9, gap: 0.1, gain: 1, pan: 0.1, also: [{ voice: 'koto', shift: 1, gain: 0.5 }] },
          { role: 'perc', voice: 'taiko', range: [33, 57], pattern: 'fanfare', vel: 0.85, gain: 0.95 },
          { role: 'pad', voice: 'pad', range: [43, 72], voicing: 'full', vel: 0.5, gain: 0.9 },
          { role: 'bell', voice: 'rin', range: [74, 100], p: 1, vel: 0.6, gain: 0.7, perBlock: true, pan: 0.3 },
        ] },
        { id: 'loop', bars: 8, loop: true, prog: [[0, 2], [3, 2], [2, 2], [0, 2]], roles: [
          { role: 'pad', voice: 'pad', range: [43, 72], voicing: 'full', vel: 0.36, gain: 0.9 },
          { role: 'melody', voice: 'koto', range: [64, 86], cells: 'long', phrase: 4, vel: 0.5, gain: 0.9, pan: 0.1 },
          { role: 'arp', voice: 'arp', range: [62, 86], step: 0.5, pattern: 'pluck3', skip: 0.55, vel: 0.28, len: 1.5, gain: 0.7, pan: -0.3 },
          { role: 'bell', voice: 'rin', range: [76, 100], p: 0.4, perBlock: true, vel: 0.35, gain: 0.55, pan: 0.3 },
        ] },
      ],
    },
    defeat: {
      key: 50, scale: 'miyako-bushi', tempo: 68, bpb: 4, mood: 'ink fading to blank', xfade: 0.15,
      sections: [
        { id: 'stinger', bars: 3, loop: false, prog: [[0, 1], [1, 1], [0, 1]], roles: [
          { role: 'perc', voice: 'taiko', range: [33, 57], pattern: ['X..x............', 'X..x............', 'D...............'], vel: 0.8, gain: 0.9 },
          { role: 'bass', voice: 'biwa', range: [31, 52], pattern: 'pedal', vel: 0.75, gain: 0.85 },
          { role: 'melody', voice: 'shakuhachi', range: [62, 86], cells: 'long', phrase: 3, shape: 'fall', vel: 0.8, gap: 0.12, gain: 1, pan: 0.1 },
          { role: 'pad', voice: 'pad', range: [38, 66], voicing: 'open', vel: 0.45, gain: 0.9 },
          { role: 'bell', voice: 'rin', range: [72, 96], p: 1, perBlock: true, vel: 0.45, gain: 0.6, pan: -0.3 },
        ] },
        { id: 'loop', bars: 8, loop: true, prog: [[0, 4], [1, 2], [0, 2]], roles: [
          { role: 'drone', voice: 'pad', range: [38, 62], tones: [0, 7], bars: 4, vel: 0.3, gain: 0.9 },
          { role: 'bell', voice: 'rin', range: [72, 98], p: 0.35, vel: 0.3, gain: 0.5, pan: 0.25 },
          { role: 'bass', voice: 'biwa', range: [33, 52], pattern: 'pedal', vel: 0.45, gain: 0.6, every: 2 },
        ] },
      ],
    },
  };

  // ---- measured mix trims: a linear gain for each track of each score, generated by the offline loudness calibration
  // (A-weighted momentary loudness per role against a target per role type). Regenerate after changing a score.
  // MIX-BEGIN
  const MIX = {
    title: [0.653, 0.776, 1.334, 1.622, 1.0],
    hero_select: [0.902, 3.236, 1.096, 1.679, 1.738],
    map1: [0.881, 2.042, 0.741, 1.738, 2.754, 1.679],
    map2: [0.61, 1.084, 0.851, 1.462, 2.239],
    map3: [0.933, 1.349, 1.0, 2.213, 1.995, 1.259],
    combat1: [0.495, 1.778, 1.413, 1.862, 2.6, 1.072, 2.188, 1.972, 1.135, 0.912, 1.334],
    combat2: [0.442, 1.479, 1.622, 1.82, 2.541, 0.813, 1.928, 1.928, 1.0, 0.841, 1.531],
    combat3: [0.489, 1.718, 1.603, 1.928, 2.483, 1.0, 2.317, 1.841, 1.0, 0.912, 1.365],
    elite: [0.38, 1.0, 1.109, 3.631, 3.02, 0.813, 0.832, 1.0, 1.148],
    boss1: [0.923, 0.537, 1.841, 1.82, 0.822, 1.622, 2.163, 2.512, 1.096, 1.259, 1.135, 0.661],
    boss2: [1.084, 0.785, 1.841, 1.972, 1.38, 1.274, 2.344, 2.512, 1.084, 1.303, 1.189, 0.631],
    boss3: [1.084, 0.582, 2.754, 2.239, 0.7, 1.641, 2.483, 1.189, 0.841, 1.189, 0.638],
    final: [0.841, 0.668, 1.884, 1.549, 0.861, 1.66, 2.018, 2.541, 1.175, 3.311, 1.175, 0.891, 0.596, 2.065],
    shop: [1.161, 1.514, 1.23, 1.567, 1.334, 1.679],
    camp: [1.059, 0.646, 2.163, 0.841, 1.679],
    event: [1.0, 1.122, 1.148, 3.236, 3.673],
    reward: [1.479, 1.109, 2.138, 1.0, 1.396, 2.344, 1.274, 3.589],
    victory: [1.0, 1.0, 2.163, 0.881, 0.841, 1.135, 1.274, 2.512, 3.388, 2.786],
    defeat: [1.135, 2.041, 1.175, 1.549, 1.95, 2.818, 3.981, 2.4],
  };
  // MIX-END

  // ---- compose(id): build, cache and freeze the description
  const COMPOSED = {};
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach((k) => deepFreeze(o[k])); }
    return o;
  }
  function sectionCtx(T, sec) {
    const chordAt = [], blocks = [];
    let bar = 0;
    for (const pr of sec.prog) { blocks.push({ bar, bars: pr[1], deg: pr[0] }); for (let i = 0; i < pr[1]; i++) chordAt.push(pr[0]); bar += pr[1]; }
    return { sc: SCALES[T.scale], tonic: T.key, bpb: T.bpb, bars: sec.bars, chordAt, blocks };
  }
  function compose(id) {
    if (Object.prototype.hasOwnProperty.call(COMPOSED, id)) return COMPOSED[id];
    const T = Object.prototype.hasOwnProperty.call(TRACKS, id) ? TRACKS[id] : null;
    if (!T) return null;
    const tracks = [];
    let bars = 0, introBars = 0, loopBars = 0;
    T.sections.forEach((sec, si) => {
      const S = sectionCtx(T, sec);
      if (S.chordAt.length !== sec.bars) throw new Error('audio: progression of ' + id + '/' + sec.id + ' covers ' + S.chordAt.length + ' bars, wanted ' + sec.bars);
      const off = bars * T.bpb;
      sec.roles.forEach((R, ri) => {
        const rng = U.rng(U.hash('rb-audio', id, si, ri, R.role));
        const made = ROLES[R.role](rng, S, R.range ? R : Object.assign({}, R, { range: RANGES[R.voice].slice() }));
        const secEnd = off + sec.bars * T.bpb;
        made.forEach((tr) => {
          // nothing rings past the end of its section in the score itself (only the synthesised tail crosses the seam)
          tr.notes = tr.notes.map((n) => Object.assign({}, n, { t: round3(n.t + off) }))
            .map((n) => Object.assign(n, { dur: round3(Math.min(n.dur, secEnd - n.t)) })).filter((n) => n.dur >= 0.04);
          tr.section = sec.id;
          tracks.push(tr);
        });
      });
      bars += sec.bars;
      if (sec.loop) loopBars = sec.bars; else introBars += sec.bars;
    });
    const mix = MIX[id];
    tracks.forEach((tr, i) => { if (mix && mix[i] != null) tr.gain = round3(tr.gain * mix[i]); });
    const layers = 1 + tracks.reduce((m, tr) => Math.max(m, tr.layer), 0);
    const bpb = T.bpb;
    const desc = {
      id, mood: T.mood, tempo: T.tempo, key: NOTE_NAMES[mod(T.key, 12)], tonic: T.key, scale: T.scale, scaleIntervals: SCALES[T.scale].slice(),
      beatsPerBar: bpb, bars, introBars, loopBars, beats: bars * bpb, introBeats: introBars * bpb, loopBeats: loopBars * bpb,
      seconds: round3(bars * bpb * 60 / T.tempo), loopSeconds: round3(loopBars * bpb * 60 / T.tempo),
      layers, thresholds: layers > 1 ? (T.thresholds || TH_COMBAT).slice(0, layers) : [0], xfade: T.xfade == null ? 1 : T.xfade,
      tracks,
    };
    COMPOSED[id] = deepFreeze(desc);
    return COMPOSED[id];
  }

  // ==================================================================================================================
  // SOUND EFFECT RECIPES: plain data, one recipe per id of DATA.LISTS.sfx. Layers are oscillators, filtered noise, FM bells
  // and the same instrument voices the score uses. Times are seconds from the start of the sound; g is linear gain.
  // ==================================================================================================================
  const O = (w, f, f2, t, d, g, x) => Object.assign({ k: 'osc', w, f, f2: f2 || 0, t, d, g }, x);
  const N = (n, t, d, g, ft, f, f2, q, x) => Object.assign({ k: 'noise', n, t, d, g, ft, f, f2: f2 || 0, q: q || 1 }, x);
  const FM = (f, ratio, idx, t, d, g, x) => Object.assign({ k: 'fm', f, ratio, idx, t, d, g }, x);
  const V = (v, m, t, d, vel, x) => Object.assign({ k: 'voice', v, m, t, d, vel }, x);
  const VOICE_TAIL = { koto: 2.4, shamisen: 0.7, biwa: 1.1, arp: 0.7, shakuhachi: 0.25, taiko: 0.7, hyoshigi: 0.12, rin: 3.2, pad: 1.5, crackle: 0.05 };
  const SUSTAINED = { shakuhachi: true, pad: true };
  const SFX_FILTERS = ['lowpass', 'highpass', 'bandpass', 'notch'];
  const SFX_WAVES = ['sine', 'triangle', 'square', 'sawtooth'];

  // a scatter of tiny noise pops (fire, ice, paper) from a fixed seed, so the recipe stays deterministic plain data
  function pops(seed, count, t0, span, g, lo, hi) {
    const r = U.rng(seed), out = [];
    for (let i = 0; i < count; i++) out.push(N('white', t0 + r() * span, 0.006 + r() * 0.014, g * (0.4 + 0.6 * r()), 'bandpass', lo + r() * (hi - lo), 0, 1.3, { a: 0.001 }));
    return out;
  }
  // a rising or falling run of koto notes
  const run = (notes, t0, gap, dur, vel) => notes.map((m, i) => V('koto', m, t0 + i * gap, dur, vel));
  // a few short strikes: hit(t, freq, g)
  const clang = (t, f, g, d) => [N('white', t, 0.03, g * 0.9, 'bandpass', 2600, 0, 1, { a: 0.001 }), FM(f, 2.3, 2.6, t, d || 0.5, g * 0.9), FM(f * 1.48, 3.1, 2.0, t, (d || 0.5) * 0.7, g * 0.5)];
  const shimmer = (t, d, g, lo, hi) => N('white', t, d, g, 'highpass', lo || 5000, hi || 8000, 0.8, { a: d * 0.4 });
  const swell = (t, d, g, lo, hi) => N('white', t, d, g, 'bandpass', lo || 300, hi || 1800, 0.8, { a: d * 0.55 });

  // each entry: [vol, opts, layersFn]. opts: var (pitch cents), gainVar (dB), duck (ms), cd (cooldown ms), pri (0..3), pan
  const SFX_DEFS = {
    // ---- interface: crisp, soft, short
    ui_click: [0.435, { var: 50, cd: 25, pri: 1 }, () => [N('white', 0, 0.014, 0.5, 'bandpass', 3200, 0, 1.4, { a: 0.001 }), O('sine', 900, 620, 0, 0.05, 0.42, { a: 0.001 }), O('triangle', 1800, 1500, 0, 0.03, 0.14, { a: 0.001 })]],
    ui_hover: [0.202, { var: 90, cd: 55, pri: 0 }, () => [O('sine', 2400, 2000, 0, 0.035, 0.3, { a: 0.005 }), N('white', 0, 0.02, 0.12, 'highpass', 5000, 0, 0.7, { a: 0.004 })]],
    ui_back: [0.376, { var: 40, cd: 40 }, () => [O('triangle', 660, 440, 0, 0.1, 0.4, { a: 0.002 }), O('sine', 990, 660, 0, 0.1, 0.16, { a: 0.002 }), N('white', 0, 0.02, 0.25, 'bandpass', 1800, 0, 1.2, { a: 0.001 })]],
    ui_error: [0.507, { var: 15, cd: 90 }, () => [O('square', 150, 140, 0, 0.12, 0.28, { lp: { f: 700 } }), O('square', 120, 110, 0.1, 0.16, 0.28, { lp: { f: 600 } }), N('white', 0, 0.05, 0.25, 'lowpass', 400, 0, 1)]],
    ui_open: [0.447, { var: 40, cd: 60 }, () => [N('white', 0, 0.16, 0.32, 'bandpass', 700, 2600, 1.3, { a: 0.05 }), O('sine', 1568, 0, 0.11, 0.18, 0.25, { a: 0.002 }), O('sine', 2349, 0, 0.14, 0.14, 0.1, { a: 0.002 })]],
    ui_close: [0.435, { var: 40, cd: 60 }, () => [N('white', 0, 0.14, 0.3, 'bandpass', 2400, 650, 1.3, { a: 0.03 }), O('sine', 1175, 880, 0.02, 0.12, 0.22, { a: 0.002 })]],
    ui_toggle: [0.631, { var: 40, cd: 45 }, () => [V('hyoshigi', 60, 0, 0.05, 0.6), O('sine', 1320, 0, 0.015, 0.06, 0.25, { a: 0.002 })]],
    // ---- cards
    card_draw: [0.852, { var: 90, cd: 30 }, () => [N('white', 0, 0.11, 0.42, 'bandpass', 1200, 3400, 0.9, { a: 0.02 }), N('white', 0.07, 0.03, 0.12, 'highpass', 4000, 0, 0.8, { a: 0.001 })]],
    card_hover: [0.23, { var: 120, cd: 60, pri: 0 }, () => [N('white', 0, 0.05, 0.4, 'bandpass', 2600, 3100, 1.1, { a: 0.012 })]],
    card_pick: [0.536, { var: 50, cd: 40 }, () => [N('white', 0, 0.02, 0.4, 'bandpass', 2800, 0, 1.5, { a: 0.001 }), O('triangle', 660, 990, 0, 0.07, 0.32, { a: 0.002 }), O('sine', 1320, 0, 0.03, 0.09, 0.14, { a: 0.002 })]],
    card_play_attack: [0.568, { var: 60, duck: 180, cd: 30 }, () => [N('white', 0, 0.16, 0.7, 'bandpass', 600, 3800, 1.1, { a: 0.05 }), O('sine', 150, 60, 0.06, 0.14, 0.35, { a: 0.002 }), O('sawtooth', 3000, 1800, 0.05, 0.1, 0.1, { lp: { f: 5000 }, a: 0.003 }), N('white', 0.06, 0.06, 0.4, 'bandpass', 1500, 900, 0.9, { a: 0.002 }), O('triangle', 320, 140, 0.05, 0.1, 0.25, { a: 0.002 })]],
    card_play_skill: [0.692, { var: 40, cd: 30 }, () => [O('triangle', 523, 784, 0, 0.28, 0.32, { a: 0.01 }), V('koto', 79, 0.03, 0.4, 0.45), V('koto', 86, 0.11, 0.4, 0.4), N('white', 0, 0.25, 0.12, 'bandpass', 3500, 5000, 0.8, { a: 0.08 })]],
    card_play_power: [0.391, { var: 30, duck: 350, cd: 60, pri: 2 }, () => [V('taiko', 38, 0, 0.6, 0.9), O('sine', 73, 0, 0, 0.55, 0.5, { a: 0.004 }), V('rin', 74, 0.08, 0.5, 0.6), V('koto', 81, 0.14, 0.5, 0.5), swell(0, 0.6, 0.18, 300, 1600)]],
    card_discard: [0.429, { var: 80, cd: 25 }, () => [N('white', 0, 0.09, 0.35, 'bandpass', 3200, 900, 1, { a: 0.01 }), N('white', 0.05, 0.02, 0.15, 'bandpass', 2000, 0, 1.5, { a: 0.001 })]],
    card_exhaust: [0.477, { var: 60, cd: 40 }, () => [N('white', 0, 0.5, 0.5, 'bandpass', 2600, 500, 0.8, { a: 0.02 })].concat(pops(41, 6, 0.04, 0.4, 0.2, 3000, 5500), [O('sine', 420, 120, 0, 0.4, 0.2, { a: 0.01 })])],
    shuffle: [0.55, { var: 40, cd: 120 }, () => [0, 0.045, 0.09, 0.14, 0.19, 0.24, 0.3].map((t, i) => N('white', t, 0.05, 0.35, 'bandpass', [1800, 2600, 2000, 3000, 2300, 3400, 2700][i], 0, 1, { a: 0.004 }))],
    // ---- turn flow
    swap: [0.534, { var: 40, cd: 60 }, () => [N('white', 0, 0.22, 0.4, 'bandpass', 500, 2200, 1, { a: 0.06 }), O('sine', 330, 520, 0, 0.18, 0.3, { a: 0.01 }), O('sine', 180, 90, 0.19, 0.12, 0.4, { a: 0.002 })]],
    energy_gain: [0.573, { var: 40, cd: 60 }, () => [V('rin', 86, 0, 0.4, 0.55), O('sine', 1760, 2637, 0.04, 0.25, 0.2, { a: 0.003 })]],
    turn_start: [0.49, { var: 20, duck: 250, cd: 200, pri: 2 }, () => [V('hyoshigi', 60, 0, 0.05, 0.8, { double: 1 }), V('koto', 74, 0.12, 0.6, 0.6), V('koto', 81, 0.2, 0.6, 0.5)]],
    turn_end: [0.5, { var: 30, cd: 150 }, () => [V('koto', 62, 0, 0.6, 0.4), O('sine', 150, 100, 0, 0.14, 0.3, { a: 0.003 })]],
    enemy_turn: [0.417, { var: 20, duck: 300, cd: 200, pri: 2 }, () => [V('taiko', 38, 0, 0.7, 0.85), V('biwa', 38, 0.12, 0.6, 0.6), N('white', 0, 0.4, 0.16, 'bandpass', 200, 500, 1, { a: 0.15 })]],
    // ---- blows: light, heavy, crit and multi are clearly different
    hit_light: [0.478, { var: 90, cd: 20, pri: 2 }, () => [N('white', 0, 0.05, 0.85, 'bandpass', 1900, 1100, 0.9, { a: 0.001 }), O('sine', 260, 120, 0, 0.09, 0.42, { a: 0.001 }), O('triangle', 480, 220, 0, 0.05, 0.35, { a: 0.001 }), O('sawtooth', 190, 110, 0, 0.07, 0.16, { lp: { f: 1200 }, a: 0.001 })]],
    hit_heavy: [0.647, { var: 70, duck: 260, pri: 3 }, () => [O('sine', 190, 48, 0, 0.34, 0.5, { a: 0.001 }), O('triangle', 330, 110, 0, 0.2, 0.5, { a: 0.001 }), N('white', 0, 0.24, 0.6, 'lowpass', 1700, 400, 0.8, { a: 0.001 }), N('white', 0, 0.06, 0.95, 'bandpass', 2400, 900, 1, { a: 0.001 }), O('sawtooth', 120, 65, 0, 0.2, 0.32, { lp: { f: 900, f2: 300 }, a: 0.001 }), N('white', 0.03, 0.4, 0.2, 'lowpass', 700, 160, 0.7, { a: 0.01 })]],
    hit_crit: [0.76, { var: 40, duck: 350, pri: 3 }, () => [O('sine', 170, 45, 0, 0.36, 0.6, { a: 0.001 }), O('triangle', 360, 120, 0, 0.2, 0.4, { a: 0.001 }), N('white', 0, 0.2, 0.5, 'lowpass', 1800, 350, 0.8, { a: 0.001 }), N('white', 0, 0.05, 0.75, 'bandpass', 3000, 0, 1, { a: 0.001 }), FM(2400, 2.76, 3.5, 0, 0.5, 0.3), O('sine', 1568, 3136, 0.02, 0.22, 0.22, { a: 0.003 }), shimmer(0.02, 0.35, 0.14, 6000, 9000)]],
    hit_multi: [0.338, { var: 60, cd: 60, pri: 2 }, () => [0, 0.075, 0.15].reduce((acc, t, i) => acc.concat([N('white', t, 0.045, 0.8, 'bandpass', 1600 + i * 300, 950, 0.9, { a: 0.001 }), O('sine', 270 + i * 55, 125 + i * 20, t, 0.08, 0.4, { a: 0.001 }), O('triangle', 480 + i * 70, 240 + i * 30, t, 0.05, 0.3, { a: 0.001 })]), [])],
    slash: [0.466, { var: 80, cd: 25 }, () => [N('white', 0, 0.14, 0.5, 'highpass', 1800, 5000, 0.8, { a: 0.008 }), O('sawtooth', 3000, 1000, 0, 0.09, 0.1, { lp: { f: 4500 }, a: 0.003 }), O('sine', 280, 120, 0.03, 0.1, 0.45, { a: 0.002 }), N('white', 0.02, 0.1, 0.3, 'bandpass', 900, 600, 0.9, { a: 0.004 })]],
    thud: [0.5, { var: 60, cd: 40 }, () => [O('sine', 150, 55, 0, 0.24, 0.8, { a: 0.002 }), O('triangle', 300, 130, 0, 0.14, 0.4, { a: 0.001 }), N('white', 0, 0.14, 0.4, 'lowpass', 520, 180, 0.8, { a: 0.001 })]],
    zap: [0.617, { var: 60, cd: 40 }, () => [O('sawtooth', 220, 1800, 0, 0.12, 0.4, { lp: { f: 4000 }, a: 0.001 }), N('white', 0, 0.25, 0.2, 'highpass', 2500, 4000, 0.7, { a: 0.002 }), O('square', 1200, 700, 0.05, 0.03, 0.2, { a: 0.001 }), O('square', 1600, 900, 0.1, 0.03, 0.2, { a: 0.001 }), O('square', 2000, 1100, 0.15, 0.03, 0.18, { a: 0.001 }), N('white', 0.02, 0.08, 0.35, 'bandpass', 3200, 0, 2, { a: 0.001 })]],
    flame: [0.483, { var: 50, duck: 150, cd: 50 }, () => [N('white', 0, 0.5, 0.6, 'bandpass', 350, 1500, 0.8, { a: 0.08 }), N('white', 0.1, 0.45, 0.35, 'highpass', 2000, 0, 0.7, { a: 0.05 }), O('sine', 90, 70, 0, 0.4, 0.4, { a: 0.05 })].concat(pops(52, 5, 0.1, 0.4, 0.22, 2500, 5000))],
    ice: [0.513, { var: 60, cd: 50 }, () => [FM(3136, 2.76, 2.2, 0, 0.35, 0.28), FM(4186, 2.76, 2.0, 0.05, 0.3, 0.22), FM(2349, 3.51, 2.0, 0.1, 0.32, 0.22), N('white', 0, 0.12, 0.25, 'highpass', 6500, 0, 0.8, { a: 0.003 }), O('sine', 1568, 1176, 0, 0.2, 0.15, { a: 0.003 })]],
    poison_tick: [0.45, { var: 90, cd: 40 }, () => [O('sine', 260, 720, 0, 0.07, 0.5, { a: 0.003 }), O('sine', 340, 900, 0.08, 0.06, 0.4, { a: 0.003 }), N('white', 0, 0.22, 0.14, 'bandpass', 3200, 2400, 1.2, { a: 0.05 })]],
    thorn: [0.371, { var: 80, cd: 40 }, () => [N('white', 0, 0.03, 0.55, 'highpass', 3000, 0, 0.8, { a: 0.001 }), O('sawtooth', 700, 300, 0, 0.06, 0.28, { lp: { f: 2500 }, a: 0.001 }), O('sine', 420, 250, 0, 0.05, 0.3, { a: 0.001 }), N('white', 0.055, 0.025, 0.4, 'highpass', 3000, 0, 0.8, { a: 0.001 })]],
    dodge: [0.6, { var: 80, cd: 50 }, () => [N('white', 0, 0.16, 0.4, 'bandpass', 1200, 3000, 1.2, { a: 0.04 }), O('sine', 1568, 2093, 0.06, 0.16, 0.22, { a: 0.004 })]],
    // ---- defence
    block_gain: [0.406, { var: 40, cd: 40 }, () => [FM(660, 2.5, 2.0, 0, 0.3, 0.4), O('sine', 130, 110, 0, 0.2, 0.55, { a: 0.002 }), N('white', 0, 0.02, 0.4, 'bandpass', 2500, 0, 1.2, { a: 0.001 })]],
    block_hit: [0.456, { var: 50, cd: 30, pri: 2 }, () => [N('white', 0, 0.06, 0.6, 'bandpass', 1100, 0, 1.1, { a: 0.001 }), FM(520, 2.3, 1.8, 0, 0.22, 0.35), O('sine', 150, 80, 0, 0.14, 0.6, { a: 0.001 })]],
    block_break: [0.405, { var: 40, duck: 250, pri: 3 }, () => [N('white', 0, 0.35, 0.6, 'highpass', 3000, 1500, 0.8, { a: 0.001 }), FM(2800, 3.4, 2.5, 0, 0.4, 0.2), FM(3520, 3.4, 2.5, 0.06, 0.35, 0.18), O('sine', 110, 50, 0, 0.3, 0.7, { a: 0.001 }), N('white', 0.05, 0.3, 0.4, 'bandpass', 1800, 600, 0.8, { a: 0.005 })]],
    heal: [0.442, { var: 30, cd: 80 }, () => [V('koto', 74, 0, 0.6, 0.5), V('koto', 81, 0.09, 0.6, 0.5), V('koto', 86, 0.18, 0.7, 0.5), shimmer(0, 0.6, 0.1, 4500, 6000), V('rin', 98, 0.2, 0.4, 0.25)]],
    buff: [0.468, { var: 40, cd: 60 }, () => [O('sine', 440, 880, 0, 0.3, 0.4, { a: 0.01 }), O('triangle', 660, 1320, 0.03, 0.28, 0.28, { a: 0.01 }), shimmer(0, 0.3, 0.16, 4500, 7000), V('rin', 93, 0.12, 0.3, 0.3)]],
    debuff: [0.55, { var: 40, cd: 60 }, () => [O('sawtooth', 360, 150, 0, 0.35, 0.35, { lp: { f: 900, f2: 300 }, a: 0.005 }), O('sawtooth', 380, 158, 0, 0.35, 0.25, { lp: { f: 900, f2: 300 }, a: 0.005 }), N('white', 0, 0.3, 0.2, 'lowpass', 500, 200, 0.8, { a: 0.02 })]],
    stun: [0.607, { var: 30, duck: 200, cd: 100 }, () => [O('sine', 320, 200, 0, 0.12, 0.6, { a: 0.001 }), O('sine', 900, 0, 0.02, 0.4, 0.22, { vib: { r: 12, d: 60 }, a: 0.005 }), O('sine', 1130, 0, 0.02, 0.4, 0.16, { vib: { r: 9, d: 60 }, a: 0.005 }), N('white', 0, 0.02, 0.4, 'bandpass', 1500, 0, 1, { a: 0.001 })]],
    // ---- falls and arrivals
    enemy_die: [0.602, { var: 60, duck: 200, pri: 3 }, () => [N('white', 0, 0.4, 0.5, 'bandpass', 3000, 300, 0.9, { a: 0.002 }), O('sine', 320, 70, 0, 0.32, 0.7, { a: 0.001 }), O('triangle', 880, 1760, 0.05, 0.35, 0.16, { a: 0.05 }), N('white', 0, 0.03, 0.5, 'bandpass', 2000, 0, 1, { a: 0.001 })]],
    hero_down: [0.649, { var: 20, duck: 700, pri: 3 }, () => [V('koto', 57, 0, 0.8, 0.55), V('koto', 53, 0.22, 0.9, 0.5), O('sine', 100, 45, 0, 0.4, 0.7, { a: 0.002 }), V('rin', 65, 0.4, 0.6, 0.28)]],
    hero_revive: [0.637, { var: 20, duck: 600, pri: 3 }, () => [V('koto', 62, 0, 0.6, 0.5), V('koto', 69, 0.1, 0.6, 0.5), V('koto', 74, 0.2, 0.6, 0.5), V('koto', 81, 0.3, 0.8, 0.55), V('rin', 93, 0.35, 0.5, 0.3), swell(0, 0.8, 0.18, 400, 1800)]],
    boss_die: [0.36, { var: 15, duck: 1400, pri: 3 }, () => [V('taiko', 38, 0, 0.9, 1.0), V('taiko', 31, 0.28, 1.0, 1.0, { big: 1 }), O('sine', 80, 30, 0, 1.4, 0.9, { a: 0.005 }), N('white', 0, 1.4, 0.55, 'lowpass', 2800, 120, 0.8, { a: 0.005 }), FM(880, 2.76, 3, 0.15, 1.6, 0.25), N('white', 0.05, 1.0, 0.35, 'highpass', 2500, 900, 0.8, { a: 0.005 }), V('rin', 62, 0.5, 0.9, 0.35)]],
    boss_intro: [0.372, { var: 10, duck: 1600, pri: 3 }, () => [V('taiko', 38, 0, 0.6, 0.8), V('taiko', 38, 0.22, 0.6, 0.85), V('taiko', 38, 0.4, 0.6, 0.9), V('taiko', 31, 0.62, 1.0, 1.0, { big: 1 }), swell(0, 1.6, 0.3, 150, 700), V('biwa', 31, 0.7, 1.2, 0.9), V('shakuhachi', 62, 0.8, 1.4, 0.5)]],
    phase_change: [0.328, { var: 10, duck: 900, pri: 3 }, () => [N('white', 0, 0.7, 0.5, 'bandpass', 300, 5000, 1.2, { a: 0.5 }), V('taiko', 38, 0.55, 0.7, 1.0), V('taiko', 38, 0.72, 0.7, 1.0), FM(700, 3.7, 4, 0.55, 1.0, 0.3), N('white', 0.6, 0.5, 0.4, 'highpass', 3000, 800, 0.8, { a: 0.003 })]],
    // ---- the map
    paint: [0.867, { var: 50, cd: 60 }, () => [N('white', 0, 0.3, 0.5, 'bandpass', 600, 2000, 1.1, { a: 0.08 }), N('white', 0.05, 0.25, 0.3, 'lowpass', 900, 300, 0.7, { a: 0.04 }), V('rin', 86, 0.2, 0.35, 0.3), O('sine', 392, 523, 0, 0.18, 0.18, { a: 0.01 })]],
    ink_splash: [0.452, { var: 60, cd: 50 }, () => [N('white', 0, 0.2, 0.6, 'lowpass', 1600, 300, 0.8, { a: 0.002 }), O('sine', 200, 70, 0, 0.18, 0.7, { a: 0.002 }), O('sine', 500, 900, 0.12, 0.06, 0.3, { a: 0.002 }), O('sine', 380, 700, 0.19, 0.06, 0.25, { a: 0.002 }), O('sine', 620, 1000, 0.25, 0.05, 0.2, { a: 0.002 })]],
    brush_pick: [0.55, { var: 50, cd: 60 }, () => [N('white', 0, 0.04, 0.4, 'bandpass', 900, 0, 1.3, { a: 0.002 }), V('koto', 67, 0.03, 0.4, 0.4), N('white', 0.02, 0.12, 0.15, 'bandpass', 2500, 1800, 1, { a: 0.03 })]],
    brush_use: [0.519, { var: 40, cd: 80 }, () => [N('white', 0, 0.32, 0.45, 'bandpass', 900, 3200, 1.1, { a: 0.06 }), V('koto', 74, 0.05, 0.4, 0.45), V('koto', 79, 0.1, 0.4, 0.4), V('koto', 86, 0.16, 0.5, 0.45)]],
    step: [0.439, { var: 120, cd: 70, pri: 0 }, () => [N('white', 0, 0.05, 0.5, 'lowpass', 700, 300, 0.8, { a: 0.002 }), N('white', 0, 0.015, 0.3, 'bandpass', 2000, 0, 1.2, { a: 0.001 })]],
    reveal_landmark: [0.707, { var: 20, duck: 500, pri: 2 }, () => [V('rin', 74, 0, 0.5, 0.5), V('rin', 81, 0.22, 0.5, 0.42), shimmer(0, 0.8, 0.12, 2500, 4500), V('koto', 93, 0.4, 0.7, 0.4)]],
    ink_gain: [0.477, { var: 60, cd: 60 }, () => [O('sine', 600, 1400, 0, 0.09, 0.5, { a: 0.002 }), O('sine', 900, 1800, 0.09, 0.08, 0.3, { a: 0.002 }), N('white', 0, 0.15, 0.12, 'bandpass', 4500, 0, 1, { a: 0.01 })]],
    well: [0.431, { var: 30, cd: 100 }, () => [0, 0.1, 0.17, 0.26].map((t, i) => O('sine', 300 + i * 40, 800 + i * 60, t, 0.07, 0.4, { a: 0.003 })).concat([N('white', 0, 0.6, 0.2, 'lowpass', 1500, 600, 0.8, { a: 0.1 }), V('rin', 86, 0.3, 0.4, 0.3)])],
    // ---- economy and treasure
    gold: [0.479, { var: 120, cd: 40 }, () => [FM(2637, 2.76, 2.5, 0, 0.28, 0.4), FM(3520, 2.76, 2.2, 0.055, 0.3, 0.34), N('white', 0, 0.01, 0.3, 'highpass', 6000, 0, 0.8, { a: 0.001 })]],
    buy: [0.512, { var: 40, cd: 80 }, () => [FM(2637, 2.76, 2.5, 0, 0.26, 0.38), FM(3136, 2.76, 2.5, 0.06, 0.26, 0.34), FM(4186, 2.76, 2.2, 0.12, 0.32, 0.3), V('rin', 88, 0.14, 0.4, 0.3)]],
    chest_open: [0.635, { var: 20, duck: 700, pri: 3 }, () => [O('sawtooth', 90, 180, 0, 0.32, 0.3, { lp: { f: 500, f2: 900 }, vib: { r: 22, d: 120 }, a: 0.05 }), N('white', 0.32, 0.02, 0.6, 'bandpass', 2200, 0, 1.3, { a: 0.001 }), O('sine', 330, 240, 0.32, 0.06, 0.4, { a: 0.002 }), V('koto', 81, 0.42, 0.7, 0.45), V('koto', 86, 0.5, 0.7, 0.45), V('koto', 93, 0.58, 0.8, 0.5), V('rin', 98, 0.6, 0.5, 0.32), shimmer(0.4, 0.8, 0.12, 5000, 8000)]],
    relic_get: [0.623, { var: 15, duck: 1000, pri: 3 }, () => [V('taiko', 38, 0, 0.5, 0.6)].concat(run([62, 69, 74, 81], 0, 0.12, 0.7, 0.55), [V('koto', 86, 0.5, 1.2, 0.65), V('rin', 74, 0.5, 0.8, 0.5), swell(0, 0.8, 0.16, 300, 1600), shimmer(0.5, 0.9, 0.14, 5000, 8000)])],
    gem_socket: [0.575, { var: 30, cd: 60 }, () => [N('white', 0, 0.012, 0.5, 'bandpass', 3200, 0, 1.4, { a: 0.001 }), FM(3136, 2.76, 2.2, 0.02, 0.3, 0.35), FM(4699, 2.76, 2.0, 0.08, 0.4, 0.3), O('sine', 1760, 0, 0.02, 0.2, 0.15, { a: 0.002 })]],
    gem_get: [0.477, { var: 30, cd: 80 }, () => run([93, 86, 93, 98], 0, 0.07, 0.5, 0.45).concat([shimmer(0, 0.5, 0.12, 5500, 8500)])],
    forge_hit: [0.447, { var: 40, duck: 200, cd: 60, pri: 2 }, () => clang(0, 900, 0.5, 0.5).concat([O('sine', 140, 70, 0, 0.16, 0.8, { a: 0.001 }), FM(600, 2.7, 2.0, 0, 0.4, 0.2)])],
    upgrade: [0.528, { var: 20, duck: 600, pri: 3 }, () => clang(0, 900, 0.42, 0.45).concat(run([74, 79, 86, 93], 0.18, 0.09, 0.6, 0.5), [V('rin', 91, 0.4, 0.5, 0.35), shimmer(0.2, 0.7, 0.14, 5000, 8500)])],
    camp_fire: [0.668, { var: 30, cd: 200 }, () => pops(61, 12, 0, 0.85, 0.3, 1800, 5500).concat([N('white', 0, 0.9, 0.25, 'lowpass', 500, 180, 0.8, { a: 0.2 }), N('white', 0, 0.8, 0.18, 'bandpass', 900, 600, 0.8, { a: 0.15 })])],
    rest: [0.75, { var: 20, duck: 900, pri: 2 }, () => [V('koto', 69, 0, 0.6, 0.4), V('koto', 67, 0.35, 0.6, 0.4), V('koto', 62, 0.7, 0.9, 0.4), swell(0, 1.4, 0.12, 800, 2400)]],
    event_open: [0.589, { var: 30, cd: 200 }, () => [V('rin', 86, 0, 0.5, 0.35), V('rin', 91, 0.08, 0.5, 0.3), V('rin', 98, 0.19, 0.5, 0.28), N('white', 0, 0.9, 0.16, 'bandpass', 900, 1500, 0.8, { a: 0.3 }), O('sine', 147, 0, 0, 0.9, 0.18, { a: 0.3 })]],
    choice: [0.554, { var: 40, cd: 60 }, () => [V('hyoshigi', 60, 0, 0.05, 0.5), V('koto', 74, 0.02, 0.5, 0.45)]],
    // ---- fanfares and progress
    page_turn: [0.55, { var: 60, cd: 120 }, () => [N('white', 0, 0.22, 0.5, 'bandpass', 3200, 900, 0.8, { a: 0.05 }), N('white', 0.14, 0.18, 0.35, 'bandpass', 2000, 700, 0.9, { a: 0.02 }), N('white', 0.3, 0.06, 0.2, 'highpass', 4000, 0, 0.8, { a: 0.002 })]],
    level_up: [0.733, { var: 15, duck: 800, pri: 3 }, () => run([62, 69, 74, 81], 0, 0.1, 0.7, 0.55).concat([V('rin', 86, 0.36, 0.6, 0.5), V('taiko', 38, 0, 0.5, 0.7), shimmer(0.3, 0.9, 0.14, 5000, 8500)])],
    victory: [0.461, { var: 10, duck: 1500, pri: 3 }, () => [V('taiko', 38, 0, 0.8, 0.9), V('taiko', 38, 0.2, 0.8, 0.9)].concat(run([62, 69, 74, 79, 86], 0.4, 0.09, 0.7, 0.55), [V('rin', 74, 0.8, 0.8, 0.5), swell(0.2, 0.9, 0.14, 400, 1800)])],
    defeat: [0.661, { var: 10, duck: 1500, pri: 3 }, () => [V('taiko', 33, 0, 1.0, 1.0), V('koto', 62, 0.2, 1.0, 0.5), V('koto', 57, 0.55, 1.0, 0.5), V('koto', 53, 0.95, 1.4, 0.5), V('biwa', 38, 0.3, 1.0, 0.7), swell(0.3, 1.4, 0.1, 200, 800)]],
    achievement: [0.775, { var: 15, duck: 800, pri: 3 }, () => [V('rin', 86, 0, 0.5, 0.5), V('rin', 93, 0.12, 0.5, 0.45), V('koto', 93, 0.24, 0.8, 0.5), shimmer(0.1, 0.8, 0.14, 5000, 8500)]],
    unlock: [0.536, { var: 20, pri: 2 }, () => [N('white', 0, 0.015, 0.5, 'bandpass', 2800, 0, 1.3, { a: 0.001 }), V('koto', 79, 0.05, 0.5, 0.5), V('koto', 91, 0.14, 0.6, 0.5), FM(3136, 2.76, 2, 0.14, 0.4, 0.25), shimmer(0.1, 0.6, 0.12, 5000, 8000)]],
    save: [0.348, { var: 20, cd: 300, pri: 0 }, () => [V('koto', 74, 0, 0.4, 0.35), V('koto', 81, 0.08, 0.5, 0.35), N('white', 0, 0.015, 0.2, 'bandpass', 3000, 0, 1.3, { a: 0.001 })]],
  };

  // ---- recipe finishing: defaults, validation-friendly numbers, total length
  const SFX_CACHE = {};
  function finishLayer(L) {
    const o = Object.assign({}, L);
    if (o.k === 'osc') { o.a = o.a == null ? 0.002 : o.a; o.f2 = o.f2 || 0; }
    else if (o.k === 'noise') { o.a = o.a == null ? 0.002 : o.a; o.f2 = o.f2 || 0; o.q = o.q || 1; o.ft = o.ft || 'bandpass'; o.n = o.n || 'white'; }
    else if (o.k === 'fm') { o.a = o.a == null ? 0.001 : o.a; o.idx2 = o.idx2 == null ? Math.max(0.05, o.idx * 0.08) : o.idx2; }
    else if (o.k === 'voice') { o.vel = o.vel == null ? 0.6 : o.vel; }
    ['t', 'd', 'g', 'a', 'f', 'f2', 'vel'].forEach((key) => { if (o[key] != null) o[key] = round3(o[key]); });
    return o;
  }
  const layerEnd = (L) => (L.k === 'voice'
    ? L.t + (SUSTAINED[L.v] ? L.d + VOICE_TAIL[L.v] : Math.min(VOICE_TAIL[L.v], Math.max(0.35, L.d * 2.2)))
    : L.t + L.d + 0.02);
  function rawRecipe(id) {
    if (!Object.prototype.hasOwnProperty.call(SFX_DEFS, id)) return null;
    if (!SFX_CACHE[id]) {
      const def = SFX_DEFS[id];
      const o = def[1] || {};
      const layers = def[2]().map(finishLayer);
      SFX_CACHE[id] = {
        id, vol: def[0], var: o.var == null ? 40 : o.var, gainVar: o.gainVar == null ? 1.2 : o.gainVar, pan: o.pan || 0,
        duck: o.duck || 0, cd: o.cd || 0, pri: o.pri == null ? 1 : o.pri,
        dur: round3(layers.reduce((m, L) => Math.max(m, layerEnd(L)), 0)), layers,
      };
    }
    return SFX_CACHE[id];
  }
  function sfxRecipe(id) { const r = rawRecipe(id); return r ? U.deepCopy(r) : null; }

  // ==================================================================================================================
  // SYNTHESIS: every voice takes (ctx, out, t, note) for ANY BaseAudioContext, so an OfflineAudioContext renders exactly
  // what the game plays. note = {midi, dur (seconds), vel, r (0..1 random), hit, big, double, bend}.
  // ==================================================================================================================
  const live = { n: 0 };                                   // sources of the live context started and not yet ended (offline renders are not counted)
  const dec = () => { live.n--; };
  function track(node) { if (S.ctx && node.context === S.ctx) { live.n++; node.onended = dec; } }
  function go(node, t, stopT) { node.start(t); node.stop(Math.max(stopT, t + 0.01)); track(node); }
  const vg = (v) => Math.max(0.02, Math.pow(clamp(v == null ? 0.6 : v, 0, 1), 1.35));      // never 0: exponential ramps may not reach it

  const RES = new WeakMap();                               // per-context buffers, so an offline context builds its own
  function resFor(ctx) { let r = RES.get(ctx); if (!r) { r = { noise: {}, wave: {}, ir: null }; RES.set(ctx, r); } return r; }
  function noiseBuffer(ctx, kind) {
    const r = resFor(ctx);
    if (r.noise[kind]) return r.noise[kind];
    const sr = ctx.sampleRate, len = Math.floor(sr * 2);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const rng = U.rng(kind === 'white' ? 0x51a7 : kind === 'pink' ? 0x09e3 : 0x0b0a);
    if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = rng() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    } else if (kind === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (rng() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    } else for (let i = 0; i < len; i++) d[i] = rng() * 2 - 1;
    r.noise[kind] = buf;
    return buf;
  }
  // a noise burst of `dur` seconds starting at t; r (0..1) picks where in the buffer it starts
  function noiseSrc(ctx, kind, t, dur, r) {
    const src = ctx.createBufferSource(), buf = noiseBuffer(ctx, kind);
    src.buffer = buf;
    const total = buf.duration, len = dur + 0.03;
    if (len >= total - 0.05) { src.loop = true; src.start(t); }
    else src.start(t, frac(r == null ? 0.37 : r) * (total - len - 0.02));
    src.stop(t + len);
    track(src);
    return src;
  }

  // harmonic tables (amplitude of harmonic 1, 2, 3 ...) for the plucked and blown timbres
  const HARM = {
    koto: [0, 1, 0.5, 0.34, 0.2, 0.13, 0.09, 0.06, 0.04, 0.03, 0.02],
    shamisen: [0, 1, 0.85, 0.7, 0.55, 0.45, 0.36, 0.28, 0.22, 0.17, 0.13, 0.1, 0.08],
    biwa: [0, 1, 0.6, 0.42, 0.3, 0.2, 0.14, 0.1, 0.07],
    arp: [0, 1, 0.3, 0.1, 0.04],
  };
  function setWave(osc, ctx, name, fallback) {
    const r = resFor(ctx);
    if (r.wave[name] === undefined) {
      let w = null;
      try { const h = HARM[name]; w = ctx.createPeriodicWave(new Float32Array(h.length), Float32Array.from(h)); } catch (e) { w = null; }
      r.wave[name] = w;
    }
    if (r.wave[name]) osc.setPeriodicWave(r.wave[name]); else osc.type = fallback || 'triangle';
  }
  function impulse(ctx) {
    const r = resFor(ctx);
    if (r.ir) return r.ir;
    const sr = ctx.sampleRate, len = Math.floor(sr * 1.9), pre = Math.floor(sr * 0.012);
    const buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c), rng = U.rng(0x7e3 + c * 977);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr;
        lp += ((rng() * 2 - 1) - lp) * (0.55 * Math.exp(-t * 1.6) + 0.06);     // darker as it decays
        d[i] = lp * Math.exp(-t * 3.4) * (1 - Math.exp(-t * 90));
      }
    }
    r.ir = buf;
    return buf;
  }

  // ---- envelopes and small helpers
  function decayEnv(p, t, peak, a, decay) {
    p.setValueAtTime(EPS, t);
    p.linearRampToValueAtTime(Math.max(EPS * 2, peak), t + a);
    p.exponentialRampToValueAtTime(EPS, t + a + decay);
    return t + a + decay;
  }
  function holdEnv(p, t, peak, a, dur, rel) {
    p.setValueAtTime(EPS, t);
    p.linearRampToValueAtTime(Math.max(EPS * 2, peak), t + a);
    const h = Math.max(t + a, t + dur);
    p.setValueAtTime(Math.max(EPS * 2, peak), h);
    p.exponentialRampToValueAtTime(EPS, h + rel);
    return h + rel;
  }
  function filt(ctx, type, f, q) {
    const b = ctx.createBiquadFilter();
    b.type = type; b.frequency.value = clamp(f, 20, ctx.sampleRate * 0.45); b.Q.value = q == null ? 0.7 : q;
    return b;
  }
  const oscAt = (ctx, type, f, t) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); return o; };
  const gainOf = (ctx, v) => { const g = ctx.createGain(); g.gain.value = v; return g; };

  // ---- the instruments
  function vKoto(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel);
    const decay = Math.min(clamp(2.9 * Math.pow(220 / f, 0.35), 0.9, 3.4), Math.max(0.4, n.dur * 2.2));
    const fl = filt(ctx, 'lowpass', Math.min(f * 10, 9000), 0.8);
    fl.frequency.setValueAtTime(Math.min(f * 10, 9000), t);
    fl.frequency.exponentialRampToValueAtTime(Math.max(f * 2.4, 320), t + decay * 0.5);
    const g = ctx.createGain(), end = decayEnv(g.gain, t, 0.5 * v, 0.003, decay);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = gainOf(ctx, 0.4);
    setWave(o1, ctx, 'koto'); setWave(o2, ctx, 'koto');
    o1.frequency.setValueAtTime(f * 1.012, t); o1.frequency.exponentialRampToValueAtTime(f, t + 0.035);
    if (n.bend) { o1.frequency.setValueAtTime(f, t + 0.06); o1.frequency.linearRampToValueAtTime(f * Math.pow(2, n.bend / 12), t + 0.18); }
    o2.frequency.value = f; o2.detune.value = 4;
    o1.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); g.connect(out);
    go(o1, t, end + 0.05); go(o2, t, end + 0.05);
    const nz = noiseSrc(ctx, 'white', t, 0.03, n.r), bp = filt(ctx, 'bandpass', 3000, 1.2), ng = ctx.createGain();
    decayEnv(ng.gain, t, 0.09 * v, 0.001, 0.02);
    nz.connect(bp); bp.connect(ng); ng.connect(out);
  }
  function vShamisen(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel);
    const decay = Math.min(clamp(0.62 * Math.pow(220 / f, 0.2), 0.3, 0.75), Math.max(0.25, n.dur * 2));
    const o = ctx.createOscillator(), fl = filt(ctx, 'lowpass', Math.min(f * 8, 7000), 2.2), g = ctx.createGain();
    setWave(o, ctx, 'shamisen', 'sawtooth');
    o.frequency.setValueAtTime(f, t);
    fl.frequency.setValueAtTime(Math.min(f * 8, 7000), t);
    fl.frequency.exponentialRampToValueAtTime(Math.max(f * 2.6, 360), t + decay * 0.6);
    const end = decayEnv(g.gain, t, 0.5 * v, 0.002, decay);
    o.connect(fl); fl.connect(g); g.connect(out);
    go(o, t, end + 0.05);
    const nz = noiseSrc(ctx, 'white', t, 0.05, n.r), lp = filt(ctx, 'lowpass', 2400, 0.7), ng = ctx.createGain();
    decayEnv(ng.gain, t, 0.3 * v, 0.001, 0.035);
    nz.connect(lp); lp.connect(ng); ng.connect(out);
    const kn = oscAt(ctx, 'sine', 170, t), kg = ctx.createGain();
    kn.frequency.exponentialRampToValueAtTime(110, t + 0.05);
    decayEnv(kg.gain, t, 0.2 * v, 0.001, 0.06);
    kn.connect(kg); kg.connect(out);
    go(kn, t, t + 0.1);
  }
  function vBiwa(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel);
    const decay = Math.min(clamp(1.4 * Math.pow(110 / f, 0.3), 0.6, 1.6), Math.max(0.5, n.dur * 2));
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = gainOf(ctx, 0.6), fl = filt(ctx, 'lowpass', 1800, 1.1), g = ctx.createGain();
    setWave(o1, ctx, 'biwa', 'sawtooth');
    o1.frequency.setValueAtTime(f * 1.03, t); o1.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o2.type = 'sine'; o2.frequency.setValueAtTime(f, t);
    fl.frequency.setValueAtTime(1800, t); fl.frequency.exponentialRampToValueAtTime(320, t + decay * 0.4);
    const end = decayEnv(g.gain, t, 0.75 * v, 0.003, decay);
    o1.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); g.connect(out);
    go(o1, t, end + 0.05); go(o2, t, end + 0.05);
    const nz = noiseSrc(ctx, 'white', t, 0.06, n.r), bp = filt(ctx, 'bandpass', 700, 1.2), ng = ctx.createGain();
    decayEnv(ng.gain, t, 0.18 * v, 0.002, 0.05);
    nz.connect(bp); bp.connect(ng); ng.connect(out);
  }
  function vArp(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel);
    const decay = Math.min(0.6, Math.max(0.3, n.dur * 2));
    const o = ctx.createOscillator(), fl = filt(ctx, 'lowpass', 5500, 0.7), g = ctx.createGain();
    setWave(o, ctx, 'arp', 'sine');
    o.frequency.setValueAtTime(f, t);
    const end = decayEnv(g.gain, t, 0.5 * v, 0.002, decay);
    o.connect(fl); fl.connect(g); g.connect(out);
    go(o, t, end + 0.03);
  }
  function vShakuhachi(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel), dur = Math.max(0.14, n.dur), a = Math.min(0.11, dur * 0.35), rel = 0.16;
    const g = ctx.createGain(), fl = filt(ctx, 'lowpass', Math.min(f * 5, 8000), 0.7);
    const end = holdEnv(g.gain, t, 0.5 * v, a, dur, rel);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
    const g2 = gainOf(ctx, 0.2), g3 = gainOf(ctx, 0.05);
    o1.type = 'sine'; o2.type = 'triangle'; o3.type = 'sine';
    [o1, o2].forEach((o) => { o.frequency.setValueAtTime(f * 0.93, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.085); });
    o3.frequency.setValueAtTime(f * 2 * 0.93, t); o3.frequency.exponentialRampToValueAtTime(f * 2, t + 0.085);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 5.3;
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.4, dur * 0.6 + 0.1));
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    o1.connect(fl); o2.connect(g2); g2.connect(fl); o3.connect(g3); g3.connect(fl); fl.connect(g); g.connect(out);
    go(o1, t, end + 0.05); go(o2, t, end + 0.05); go(o3, t, end + 0.05); go(lfo, t, end + 0.05);
    // breath: pink noise through a band around the pitch, loud in the attack and settling
    const nz = noiseSrc(ctx, 'pink', t, dur + rel, n.r), bp = filt(ctx, 'bandpass', f * 1.6, 3.5), ng = ctx.createGain();
    ng.gain.setValueAtTime(EPS, t); ng.gain.linearRampToValueAtTime(0.3 * v, t + a * 0.6);
    ng.gain.exponentialRampToValueAtTime(0.09 * v, t + a + 0.15);
    const h = Math.max(t + a + 0.16, t + dur);
    ng.gain.setValueAtTime(0.09 * v, h); ng.gain.exponentialRampToValueAtTime(EPS, h + rel);
    nz.connect(bp); bp.connect(ng); ng.connect(out);
  }
  function vTaiko(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel);
    if (n.hit === 'ka') {
      const o = oscAt(ctx, 'sine', f * 4, t), g = ctx.createGain();
      o.frequency.exponentialRampToValueAtTime(f * 2.6, t + 0.035);
      const end = decayEnv(g.gain, t, 0.45 * v, 0.001, 0.14);
      o.connect(g); g.connect(out); go(o, t, end + 0.02);
      const nz = noiseSrc(ctx, 'white', t, 0.09, n.r), bp = filt(ctx, 'bandpass', 2600, 1.5), ng = ctx.createGain();
      decayEnv(ng.gain, t, 0.5 * v, 0.001, 0.07);
      nz.connect(bp); bp.connect(ng); ng.connect(out);
      return;
    }
    const big = !!n.big, decay = big ? 0.95 : 0.55, fb = f * 2;      // the body sits an octave above the written pitch so it carries on small speakers
    const o = oscAt(ctx, 'sine', fb * 2.4, t), g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(fb, t + 0.09);
    const end = decayEnv(g.gain, t, 0.9 * v, 0.002, decay);
    o.connect(g); g.connect(out); go(o, t, end + 0.03);
    if (f >= 45) {
      const s = oscAt(ctx, 'sine', f, t), sg = ctx.createGain();
      const se = decayEnv(sg.gain, t, (big ? 0.5 : 0.32) * v, 0.004, decay * 0.85);
      s.connect(sg); sg.connect(out); go(s, t, se + 0.03);
    }
    const nz = noiseSrc(ctx, 'white', t, 0.09, n.r), bp = filt(ctx, 'bandpass', 1600, 0.9), ng = ctx.createGain();
    decayEnv(ng.gain, t, (big ? 0.6 : 0.45) * v, 0.001, 0.06);
    nz.connect(bp); bp.connect(ng); ng.connect(out);
  }
  function clack(ctx, out, t, v, r) {
    const a = noiseSrc(ctx, 'white', t, 0.05, r), ab = filt(ctx, 'bandpass', 2300, 5), ag = ctx.createGain();
    decayEnv(ag.gain, t, 0.8 * v, 0.0008, 0.028);
    a.connect(ab); ab.connect(ag); ag.connect(out);
    const b = noiseSrc(ctx, 'white', t, 0.04, frac(r + 0.31)), bb = filt(ctx, 'bandpass', 3900, 7), bg = ctx.createGain();
    decayEnv(bg.gain, t, 0.45 * v, 0.0008, 0.02);
    b.connect(bb); bb.connect(bg); bg.connect(out);
    const o = oscAt(ctx, 'sine', 1150, t), og = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(900, t + 0.02);
    const end = decayEnv(og.gain, t, 0.25 * v, 0.0008, 0.03);
    o.connect(og); og.connect(out); go(o, t, end + 0.01);
  }
  function vHyoshigi(ctx, out, t, n) {
    const v = vg(n.vel);
    clack(ctx, out, t, v, n.r);
    if (n.double) clack(ctx, out, t + 0.055, v * 0.8, frac((n.r || 0) + 0.5));
  }
  function vRin(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel);
    const decay = Math.min(clamp(3.4 * Math.pow(440 / f, 0.2), 1.6, 4.0), Math.max(1.0, n.dur * 3));
    const car = ctx.createOscillator(), mod2 = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(), hp = filt(ctx, 'highpass', 140, 0.7);
    car.type = 'sine'; car.frequency.setValueAtTime(f, t);
    mod2.type = 'sine'; mod2.frequency.setValueAtTime(f * 2.76, t);
    mg.gain.setValueAtTime(2.2 * f, t); mg.gain.exponentialRampToValueAtTime(0.12 * f, t + decay * 0.5);
    mod2.connect(mg); mg.connect(car.frequency);
    const end = decayEnv(g.gain, t, 0.38 * v, 0.0015, decay);
    car.connect(g); g.connect(hp); hp.connect(out);
    go(car, t, end + 0.05); go(mod2, t, end + 0.05);
    const p2 = oscAt(ctx, 'sine', f * 2.005, t), g2 = ctx.createGain(), p3 = oscAt(ctx, 'sine', f * 4.11, t), g3 = ctx.createGain();
    const e2 = decayEnv(g2.gain, t, 0.09 * v, 0.001, decay * 0.6), e3 = decayEnv(g3.gain, t, 0.03 * v, 0.001, decay * 0.25);
    p2.connect(g2); g2.connect(hp); p3.connect(g3); g3.connect(hp);
    go(p2, t, e2 + 0.03); go(p3, t, e3 + 0.03);
  }
  function vPad(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel), dur = Math.max(0.5, n.dur), a = Math.min(1.3, dur * 0.42), rel = 1.5;
    const fc = clamp(f * 3.2 + 350, 500, 2600);
    const env = ctx.createGain(), end = holdEnv(env.gain, t, 0.15 * v, a, dur, rel);
    env.connect(out);
    const oa = oscAt(ctx, 'sawtooth', f, t), ob = oscAt(ctx, 'sawtooth', f, t);
    oa.detune.value = -9; ob.detune.value = 9;
    const la = filt(ctx, 'lowpass', fc, 0.6), lb = filt(ctx, 'lowpass', fc, 0.6);
    la.frequency.setValueAtTime(fc * 0.55, t); la.frequency.exponentialRampToValueAtTime(fc, t + a * 1.5);
    lb.frequency.setValueAtTime(fc * 0.55, t); lb.frequency.exponentialRampToValueAtTime(fc, t + a * 1.5);
    oa.connect(la); ob.connect(lb);
    if (f * 0.5 >= 55) { const s = oscAt(ctx, 'triangle', f * 0.5, t), sg = gainOf(ctx, 0.6); s.connect(sg); sg.connect(la); sg.connect(lb); go(s, t, end + 0.05); }
    if (ctx.createStereoPanner) {
      const pa = ctx.createStereoPanner(), pb = ctx.createStereoPanner();
      pa.pan.value = -0.55; pb.pan.value = 0.55;
      la.connect(pa); pa.connect(env); lb.connect(pb); pb.connect(env);
    } else { la.connect(env); lb.connect(env); }
    go(oa, t, end + 0.05); go(ob, t, end + 0.05);
  }
  function vCrackle(ctx, out, t, n) {
    const v = vg(n.vel), r = n.r == null ? 0.5 : n.r;
    const nz = noiseSrc(ctx, 'white', t, 0.03, r), bp = filt(ctx, 'bandpass', 900 + r * 4500, 1.1), hp = filt(ctx, 'highpass', 700, 0.7), g = ctx.createGain();
    decayEnv(g.gain, t, 0.5 * v, 0.0008, 0.012 + r * 0.02);
    nz.connect(bp); bp.connect(hp); hp.connect(g); g.connect(out);
  }
  const VOICES = { koto: vKoto, shamisen: vShamisen, biwa: vBiwa, arp: vArp, shakuhachi: vShakuhachi, taiko: vTaiko, hyoshigi: vHyoshigi, rin: vRin, pad: vPad, crackle: vCrackle };
  // small timing looseness per instrument (seconds, peak to peak) so a loop never sounds machine-perfect
  // per-voice loudness trim for the score, measured with A-weighted momentary loudness so a note at the same velocity is about
  // equally loud on every instrument (the sfx recipes were balanced by ear against the raw voices and do not use it)
  const TRIM = { koto: 0.67, shamisen: 1.4, biwa: 0.78, arp: 0.99, shakuhachi: 0.43, taiko: 0.78, hyoshigi: 1, rin: 0.69, pad: 1.9, crackle: 1 };
  const HUMAN = { koto: 0.012, shamisen: 0.008, biwa: 0.008, arp: 0.01, shakuhachi: 0.02, taiko: 0.008, hyoshigi: 0.006, rin: 0.01, pad: 0.03, crackle: 0 };

  // ---- sound effect layers
  function layerOsc(ctx, out, t, L, pitch, r) {
    const o = ctx.createOscillator();
    o.type = SFX_WAVES.indexOf(L.w) >= 0 ? L.w : 'sine';
    const f = L.f * pitch;
    o.frequency.setValueAtTime(f, t);
    if (L.f2 && L.f2 !== L.f) o.frequency.exponentialRampToValueAtTime(Math.max(20, L.f2 * pitch), t + L.d);
    if (L.det) o.detune.value = L.det;
    const g = ctx.createGain(), end = decayEnv(g.gain, t, L.g, Math.min(L.a, L.d * 0.9), Math.max(0.004, L.d - Math.min(L.a, L.d * 0.9)));
    let head = o;
    if (L.lp) {
      const fl = filt(ctx, 'lowpass', L.lp.f * pitch, L.lp.q == null ? 0.8 : L.lp.q);
      if (L.lp.f2) { fl.frequency.setValueAtTime(L.lp.f * pitch, t); fl.frequency.exponentialRampToValueAtTime(Math.max(40, L.lp.f2 * pitch), t + L.d); }
      head.connect(fl); head = fl;
    }
    head.connect(g); g.connect(out);
    if (L.vib) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = L.vib.r; lg.gain.value = f * (Math.pow(2, L.vib.d / 1200) - 1);
      lfo.connect(lg); lg.connect(o.frequency); go(lfo, t, end + 0.02);
    }
    go(o, t, end + 0.02);
  }
  function layerNoise(ctx, out, t, L, pitch, r) {
    const src = noiseSrc(ctx, L.n, t, L.d, r);
    const fl = filt(ctx, L.ft, L.f * pitch, L.q);
    if (L.f2 && L.f2 !== L.f) { fl.frequency.setValueAtTime(L.f * pitch, t); fl.frequency.exponentialRampToValueAtTime(Math.max(40, L.f2 * pitch), t + L.d); }
    const g = ctx.createGain();
    decayEnv(g.gain, t, L.g, Math.min(L.a, L.d * 0.9), Math.max(0.004, L.d - Math.min(L.a, L.d * 0.9)));
    src.connect(fl); fl.connect(g); g.connect(out);
  }
  function layerFm(ctx, out, t, L, pitch, r) {
    const f = L.f * pitch;
    const car = ctx.createOscillator(), md = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(), hp = filt(ctx, 'highpass', 200, 0.7);
    car.type = 'sine'; car.frequency.setValueAtTime(f, t);
    md.type = 'sine'; md.frequency.setValueAtTime(f * L.ratio, t);
    mg.gain.setValueAtTime(L.idx * f, t); mg.gain.exponentialRampToValueAtTime(Math.max(0.01, L.idx2 * f), t + L.d * 0.6);
    md.connect(mg); mg.connect(car.frequency);
    const end = decayEnv(g.gain, t, L.g, L.a, Math.max(0.01, L.d - L.a));
    car.connect(g); g.connect(hp); hp.connect(out);
    go(car, t, end + 0.03); go(md, t, end + 0.03);
  }
  function playRecipe(ctx, dest, R, t0, o) {
    o = o || {};
    const pitch = o.pitch || 1, rr = U.rng(((o.seed == null ? 1 : o.seed) >>> 0) || 1);
    const bus = ctx.createGain();
    bus.gain.value = R.vol * (o.vol == null ? 1 : o.vol);
    let head = bus;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); bus.connect(p); head = p; }
    head.connect(dest);
    const semis = 12 * Math.log(pitch) / Math.LN2;
    for (const L of R.layers) {
      const t = t0 + L.t, r = rr();
      if (L.k === 'voice') VOICES[L.v](ctx, bus, t, { midi: L.m + semis, dur: L.d, vel: L.vel, r, hit: L.hit, big: L.big, double: L.double, bend: L.bend });
      else if (L.k === 'osc') layerOsc(ctx, bus, t, L, pitch, r);
      else if (L.k === 'noise') layerNoise(ctx, bus, t, L, pitch, r);
      else if (L.k === 'fm') layerFm(ctx, bus, t, L, pitch, r);
    }
    return t0 + R.dur;
  }

  // ---- the master chain: [music bus -> duck] and [sfx bus] -> master -> glue -> limiter -> soft clip -> out, plus a small hall
  const taper = (v) => Math.pow(clamp(v, 0, 1), TAPER);
  // unity gain below the knee, then a tanh shoulder that never passes the ceiling
  function softClipCurve() {
    const n = 2049, c = new Float32Array(n), knee = 0.6, ceil = 0.98;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
      c[i] = Math.sign(x) * (a <= knee ? a : knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee)));
    }
    return c;
  }
  function buildGraph(ctx, o) {
    o = o || {};
    const g = { ctx };
    g.master = ctx.createGain();
    // the chain is glue compressor, limiter, soft clip, out; a missing or failing optional node is simply skipped
    let head = g.master;
    const link = (node) => { head.connect(node); head = node; return node; };
    const opt = (make) => { try { return make(); } catch (e) { return null; } };
    g.glue = opt(() => { const c = ctx.createDynamicsCompressor(); c.threshold.value = -20; c.knee.value = 20; c.ratio.value = 2.5; c.attack.value = 0.012; c.release.value = 0.25; return c; });
    if (g.glue) link(g.glue);
    g.limiter = opt(() => { const c = ctx.createDynamicsCompressor(); c.threshold.value = -5; c.knee.value = 0; c.ratio.value = 20; c.attack.value = 0.002; c.release.value = 0.09; return c; });
    if (g.limiter) link(g.limiter);
    g.shaper = opt(() => { const w = ctx.createWaveShaper(); w.curve = softClipCurve(); w.oversample = '2x'; return w; });
    if (g.shaper) link(g.shaper);
    g.out = gainOf(ctx, 0.92);
    link(g.out); g.out.connect(ctx.destination);
    g.musicBus = ctx.createGain(); g.duck = gainOf(ctx, 1); g.musicOut = gainOf(ctx, 1);
    g.musicBus.connect(g.duck); g.duck.connect(g.musicOut); g.musicOut.connect(g.master);
    g.sfxBus = ctx.createGain(); g.sfxBus.connect(g.master);
    g.verb = null;
    try {
      g.verb = ctx.createConvolver(); g.verb.buffer = impulse(ctx);
      const hp = filt(ctx, 'highpass', 220, 0.7), lp = filt(ctx, 'lowpass', 4500, 0.7), ret = gainOf(ctx, 0.55);
      g.sendM = gainOf(ctx, 0.2); g.sendS = gainOf(ctx, 0.09);
      g.musicOut.connect(g.sendM); g.sendM.connect(g.verb); g.sfxBus.connect(g.sendS); g.sendS.connect(g.verb);
      g.verb.connect(hp); hp.connect(lp); lp.connect(ret); ret.connect(g.master);
    } catch (e) { g.verb = null; }
    g.music = g.musicBus; g.sfx = g.sfxBus;
    applyVolumes(g, o.musicVol == null ? 0.7 : o.musicVol, o.sfxVol == null ? 0.8 : o.sfxVol, true);
    return g;
  }
  function applyVolumes(g, mv, sv, instant) {
    const mt = taper(mv) * MUSIC_SCALE, st = taper(sv), now = g.ctx.currentTime;
    if (instant) { g.musicBus.gain.value = mt; g.sfxBus.gain.value = st; }
    else { g.musicBus.gain.setTargetAtTime(mt, now, 0.04); g.sfxBus.gain.setTargetAtTime(st, now, 0.04); }
  }

  // ==================================================================================================================
  // ENGINE: decks (one per playing track), the lookahead scheduler, sfx playback, ducking, suspend and resume.
  // ==================================================================================================================
  const SD = (DATA && DATA.SETTINGS) || {};
  const S = {
    ctx: null, g: null, ready: false,
    cur: null,                       // requested track id (also while waiting for init)
    pending: null,                   // {id, opts} remembered before init
    intensity: 0,
    vol: { music: SD.musicVol ? SD.musicVol.def : 0.7, sfx: SD.sfxVol ? SD.sfxVol.def : 0.8 },
    decks: [], main: null,
    timer: 0, susp: { user: false, hidden: false }, hooked: false,
    rng: U.rng(0x5fe1), last: {}, duckUntil: 0, lastKick: -1e9,
  };
  const DUCK_LEVEL = 0.42;
  const safe = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); };
  const isSfx = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(SFX_DEFS, id);
  const isTrack = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(TRACKS, id);

  // ---- flattening a description into one time-sorted event list (cached per description)
  const FLAT = new WeakMap();
  function flatten(desc) {
    let f = FLAT.get(desc);
    if (f) return f;
    const ev = [];
    desc.tracks.forEach((tr, ti) => tr.notes.forEach((n, ni) => ev.push({
      t: n.t, dur: n.dur, midi: n.midi, vel: n.vel, hit: n.hit, big: n.big, double: n.double, bend: n.bend,
      voice: tr.voice, ti, layer: tr.layer, r: (U.hash(desc.id, ti, ni) % 100000) / 100000,
    })));
    ev.sort((a, b) => a.t - b.t || a.ti - b.ti);
    let firstLoop = ev.length;
    for (let i = 0; i < ev.length; i++) if (ev[i].t >= desc.introBeats - 1e-9) { firstLoop = i; break; }
    f = { ev, firstLoop };
    FLAT.set(desc, f);
    return f;
  }
  const layerTarget = (desc, k, x) => (k === 0 ? 1 : clamp((x - (desc.thresholds[k] - 0.1)) / 0.2, 0, 1));

  function buildDeck(ctx, dest, desc) {
    const deck = { id: desc.id, desc, out: ctx.createGain(), layerG: [], tr: [], flat: flatten(desc), i: 0, pass: 0, t0: 0, beatSec: 60 / desc.tempo, dying: false, done: false, target: [] };
    deck.out.connect(dest);
    for (let k = 0; k < desc.layers; k++) {
      const lg = ctx.createGain();
      lg.gain.value = k === 0 ? 1 : 0;
      lg.connect(deck.out);
      deck.layerG.push(lg);
      deck.target.push(k === 0 ? 1 : 0);
    }
    desc.tracks.forEach((tr) => {
      const gn = gainOf(ctx, tr.gain * (TRIM[tr.voice] || 1));
      let last = gn;
      if (tr.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(tr.pan, -1, 1); gn.connect(p); last = p; }
      last.connect(deck.layerG[tr.layer]);
      deck.tr.push({ in: gn, fn: VOICES[tr.voice], human: HUMAN[tr.voice] == null ? 0.01 : HUMAN[tr.voice] });
    });
    return deck;
  }
  function applyLayers(deck, instant) {
    const now = S.ctx.currentTime;
    for (let k = 1; k < deck.desc.layers; k++) {
      const v = layerTarget(deck.desc, k, S.intensity);
      deck.target[k] = v;
      if (instant) deck.layerG[k].gain.value = v; else deck.layerG[k].gain.setTargetAtTime(v, now, 0.3);
    }
  }
  function playNote(ctx, deck, e, when, pass, minT, capped) {
    const tr = deck.tr[e.ti];
    const r = frac(e.r + pass * 0.618034);
    if (capped && (live.n > MAX_LIVE * 1.4 || (e.layer > 0 && live.n > MAX_LIVE))) return false;
    let w = when + (r - 0.5) * tr.human;
    if (w < minT) w = minT;
    tr.fn(ctx, tr.in, w, { midi: e.midi, dur: e.dur * deck.beatSec, vel: clamp(e.vel * (0.93 + 0.14 * frac(r * 7.31)), 0.02, 1), hit: e.hit, big: e.big, double: e.double, bend: e.bend, r });
    return true;
  }
  // schedule every note of the deck that starts before `horizon` (ctx seconds)
  function pump(deck, ctx, now, horizon) {
    const f = deck.flat, ev = f.ev, loopB = deck.desc.loopBeats, bs = deck.beatSec;
    if (!ev.length || deck.done) return;
    if (loopB > 0) {                                        // far behind (a throttled timer): skip whole loops instead of replaying them
      const loopSec = loopB * bs, first = ev[deck.i];
      if (first && (deck.pass > 0 || first.t >= deck.desc.introBeats)) {
        const late = now - (deck.t0 + (first.t + deck.pass * loopB) * bs);
        if (late > loopSec * 1.5) deck.pass += Math.floor(late / loopSec);
      }
    }
    for (let guard = 0; guard < 4000; guard++) {
      const e = ev[deck.i], pass = deck.pass;
      const when = deck.t0 + (e.t + pass * loopB) * bs;
      if (when > horizon) return;
      deck.i++;
      if (deck.i >= ev.length) { if (loopB > 0) { deck.pass++; deck.i = f.firstLoop; } else { deck.done = true; return; } }
      if (when < now - 0.1 || deck.target[e.layer] < 0.02) continue;
      playNote(ctx, deck, e, when, pass, now + 0.003, true);
    }
  }

  function fadeSeconds(o, dflt) {
    const f = o && isNum(o.fade) ? o.fade : dflt;
    return clamp(f > 20 ? f / 1000 : f, 0.05, 12);
  }
  function fadeOutDeck(d, fade) {
    d.dying = true;
    const p = d.out.gain, now = S.ctx.currentTime;
    if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(now);
    else { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); }
    p.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => { try { d.out.disconnect(); } catch (e) { /* already gone */ } S.decks = S.decks.filter((x) => x !== d); }, (fade + 0.4) * 1000);
  }
  function startMusic(id, o) {
    const desc = compose(id), ctx = S.ctx, now = ctx.currentTime;
    if (desc.layers <= 1) S.intensity = 0;
    const fade = fadeSeconds(o, desc.xfade);
    for (const d of S.decks) if (!d.dying) fadeOutDeck(d, fade);
    const deck = buildDeck(ctx, S.g.musicBus, desc);
    deck.t0 = now + 0.06;
    applyLayers(deck, true);
    deck.out.gain.setValueAtTime(EPS, now);
    deck.out.gain.linearRampToValueAtTime(1, now + fade);
    S.decks.push(deck);
    S.main = deck;
    startTimer();
    pump(deck, ctx, now, now + LOOKAHEAD);
  }
  function stopMusic(fade) { for (const d of S.decks) if (!d.dying) fadeOutDeck(d, fade); S.main = null; }

  function tick() {
    const ctx = S.ctx;
    if (!ctx || S.susp.user || S.susp.hidden || ctx.state !== 'running') return;
    const now = ctx.currentTime, horizon = now + LOOKAHEAD;
    for (const d of S.decks.slice()) if (!d.dying) pump(d, ctx, now, horizon);
  }
  function startTimer() { if (!S.timer && S.ready && !S.susp.user && !S.susp.hidden) S.timer = setInterval(tick, TICK_MS); }
  function stopTimer() { if (S.timer) { clearInterval(S.timer); S.timer = 0; } }
  function applySuspend() {
    const ctx = S.ctx;
    if (!ctx) return;
    if (S.susp.user || S.susp.hidden) { stopTimer(); if (ctx.state === 'running') safe(ctx.suspend()); }
    else { startTimer(); if (ctx.state !== 'running' && ctx.state !== 'closed') safe(ctx.resume()); }
  }
  // iOS can leave a context 'interrupted'; a later sound or track request nudges it awake (at most once a second)
  function kick() {
    const ctx = S.ctx;
    if (!ctx || S.susp.user || S.susp.hidden || ctx.state === 'running' || ctx.state === 'closed') return;
    const t = typeof performance !== 'undefined' ? performance.now() : 0;
    if (t - S.lastKick < 1000) return;
    S.lastKick = t;
    safe(ctx.resume());
  }

  // ---- public functions
  function init(opts) {
    if (S.ctx) { kick(); return S.ready; }
    const win = typeof window !== 'undefined' ? window : null;
    if (!win || (win.__HEADLESS === true && !(opts && opts.force))) return false;
    const Ctor = win.AudioContext || win.webkitAudioContext;
    if (!Ctor) return false;
    let ctx = null;
    try { ctx = new Ctor({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new Ctor(); } catch (e2) { ctx = null; } }
    if (!ctx) return false;
    try { S.g = buildGraph(ctx, { musicVol: S.vol.music, sfxVol: S.vol.sfx }); }
    catch (e) { try { safe(ctx.close()); } catch (e2) { /* nothing to close */ } S.g = null; return false; }
    S.ctx = ctx; S.ready = true;
    if (!S.hooked && typeof document !== 'undefined' && document.addEventListener) {
      S.hooked = true;
      document.addEventListener('visibilitychange', () => { S.susp.hidden = !!document.hidden; applySuspend(); });
    }
    if (ctx.state !== 'running') safe(ctx.resume());
    startTimer();
    if (S.pending) { const p = S.pending; S.pending = null; startMusic(p.id, p.opts); }
    return true;
  }
  function music(id, opts) {
    if (id == null) {
      S.cur = null; S.pending = null;
      if (S.ready) stopMusic(fadeSeconds(opts, 1));
      return true;
    }
    if (!isTrack(id)) return false;
    const already = S.cur === id && !(opts && opts.restart) && (S.pending ? S.pending.id === id : !!S.main && !S.main.dying);
    if (already) return true;
    S.cur = id;
    if (!S.ready) { S.pending = { id, opts: opts || {} }; return true; }
    kick();
    startMusic(id, opts);
    return true;
  }
  function intensity(n) {
    if (n === undefined) return S.intensity;
    const x = isNum(+n) ? clamp(+n, 0, 1) : 0;
    S.intensity = x;
    if (S.ready) for (const d of S.decks) if (!d.dying) applyLayers(d, false);
    return x;
  }
  function sfx(id, o) {
    if (!S.ready || S.susp.user || S.susp.hidden || !isSfx(id)) return false;
    const R = rawRecipe(id), ctx = S.ctx, now = ctx.currentTime;
    kick();
    if (R.cd && S.last[id] != null && (now - S.last[id]) * 1000 < R.cd) return false;
    if (live.n > MAX_LIVE * [0.55, 0.8, 1, 1.3][clamp(R.pri, 0, 3)]) return false;
    o = o || {};
    S.last[id] = now;
    const rg = S.rng;
    const pitch = (isNum(o.pitch) && o.pitch > 0 ? o.pitch : 1) * Math.pow(2, ((rg() * 2 - 1) * R.var) / 1200);
    const vol = clamp(isNum(o.vol) ? o.vol : 1, 0, 2) * db((rg() * 2 - 1) * R.gainVar);
    const pj = (rg() - 0.5) * 0.12, pan = isNum(o.pan) ? clamp(o.pan, -1, 1) : clamp(R.pan + pj, -1, 1);        // an explicit pan is exact
    const dl = isNum(o.delay) && o.delay > 0 ? (o.delay > 5 ? o.delay / 1000 : o.delay) : 0;
    playRecipe(ctx, S.g.sfxBus, R, now + 0.004 + dl, { pitch, vol, pan, seed: Math.floor(rg() * 4294967295) });
    if (R.duck) duck(R.duck + dl * 1000);
    return true;
  }
  function preview(id) {
    if (!S.ready || S.susp.user || S.susp.hidden || !isSfx(id)) return false;
    const R = rawRecipe(id), ctx = S.ctx;
    playRecipe(ctx, S.g.sfxBus, R, ctx.currentTime + 0.01, { pitch: 1, vol: 1, seed: 7 });
    if (R.duck) duck(R.duck);
    return true;
  }
  function duck(ms) {
    if (!S.ready || !isNum(+ms)) return false;
    const p = S.g.duck.gain, now = S.ctx.currentTime, until = now + clamp(+ms / 1000, 0.05, 4);
    S.duckUntil = Math.max(S.duckUntil, until);
    p.cancelScheduledValues(now);
    p.setTargetAtTime(DUCK_LEVEL, now, 0.02);
    p.setTargetAtTime(1, S.duckUntil, 0.3);
    return true;
  }
  function setVolume(kind, v) {
    if ((kind !== 'music' && kind !== 'sfx') || !isNum(+v)) return false;
    S.vol[kind] = clamp(+v, 0, 1);
    if (S.ready) applyVolumes(S.g, S.vol.music, S.vol.sfx, false);
    return true;
  }
  const volume = (kind) => (kind === 'music' || kind === 'sfx' ? S.vol[kind] : null);
  function suspend() { S.susp.user = true; applySuspend(); }
  function resume() { S.susp.user = false; S.susp.hidden = false; applySuspend(); }
  function list(kind) {
    const L = DATA.LISTS;
    if (kind === 'sfx') return L.sfx.slice();
    if (kind === 'music') return L.music.slice();
    return { sfx: L.sfx.slice(), music: L.music.slice() };
  }

  // ---- offline rendering and inspection (the audio suite and the browser analysis use these)
  function render(ctx, dest, desc, o) {
    o = o || {};
    const t0 = o.t0 || 0, loops = Math.max(1, o.loops == null ? 1 : o.loops), x = o.intensity == null ? 0 : o.intensity;
    const deck = buildDeck(ctx, dest, desc);
    deck.out.gain.value = 1;
    for (let k = 1; k < desc.layers; k++) { deck.target[k] = layerTarget(desc, k, x); deck.layerG[k].gain.value = deck.target[k]; }
    deck.t0 = t0;
    const f = deck.flat, bs = deck.beatSec;
    let count = 0;
    for (let pass = 0; pass < (desc.loopBeats > 0 ? loops : 1); pass++) {
      for (let i = pass === 0 ? 0 : f.firstLoop; i < f.ev.length; i++) {
        const e = f.ev[i];
        if (deck.target[e.layer] < 0.02) continue;
        if (playNote(ctx, deck, e, t0 + (e.t + pass * desc.loopBeats) * bs, pass, 0)) count++;
      }
    }
    const total = desc.loopBeats > 0 ? desc.introBeats + desc.loopBeats * loops : desc.beats;
    return { end: t0 + total * bs, notes: count };
  }
  // id is an sfx id, or a plain recipe object (as returned by sfxRecipe, possibly edited) for experiments and tools
  function renderSfx(ctx, dest, id, o) {
    let R = typeof id === 'string' ? rawRecipe(id) : null;
    if (!R && id && typeof id === 'object' && Array.isArray(id.layers)) {
      const layers = id.layers.map(finishLayer);
      R = Object.assign({ vol: 1 }, id, { layers, dur: round3(layers.reduce((m, L) => Math.max(m, layerEnd(L)), 0)) });
    }
    if (!R) return null;
    o = o || {};
    return { end: playRecipe(ctx, dest, R, o.t0 || 0, { pitch: o.pitch, vol: o.vol, pan: o.pan, seed: o.seed }) };
  }
  function voice(name, ctx, out, t, n) {
    if (!Object.prototype.hasOwnProperty.call(VOICES, name)) return false;
    VOICES[name](ctx, out, t, Object.assign({ midi: 60, dur: 0.5, vel: 0.7, r: 0.5 }, n));
    return true;
  }
  function debug() {
    return {
      ready: S.ready, ctx: S.ctx, graph: S.g, live: live.n, intensity: S.intensity, current: S.cur, pending: S.pending, vol: Object.assign({}, S.vol),
      suspended: Object.assign({}, S.susp), timer: !!S.timer, duckUntil: S.duckUntil,
      decks: S.decks.map((d) => ({ id: d.id, dying: d.dying, pass: d.pass, index: d.i, target: d.target.slice(), out: d.out, layerG: d.layerG.slice(), raw: d })),
      mixLengths: Object.keys(MIX).reduce((o, k) => { o[k] = MIX[k].length; return o; }, {}),
      tick,
    };
  }

  return {
    init, sfx, music, setVolume, volume, duck, suspend, resume, intensity, list, preview,
    compose, sfxRecipe, graph: buildGraph, render, renderSfx, voice, debug,
    get ready() { return S.ready; },
    get current() { return S.cur; },
    VOICES: VOICE_NAMES.slice(), SCALES: JSON.parse(JSON.stringify(SCALES)), RANGES: JSON.parse(JSON.stringify(RANGES)), MUSIC_SCALE,
  };
})();
