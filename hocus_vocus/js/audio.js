// Hocus Vocus: AUDIO, the band. Procedural music and sound effects, all synthesised with WebAudio (beatbox, sung voices, synths and
// bass), plus an optional hook that plays the owners' own recordings instead (DATA.SAMPLES, ships empty, so nothing is ever fetched).
// This header is the contract of record for js/audio.js (DESIGN 5.7, plan HV_ART_AUDIO 10 and 11). audio.js loads before combat,
// run, meta and ui, so it references only U and DATA, and never META: UI.applySettings() is the bridge.
//
// PUBLIC API (everything is a silent no-op headless, before init, or when WebAudio is missing; nothing here throws)
//   AUDIO.init(opts?) -> bool      Call from the first user gesture. Creates the AudioContext lazily (try/catch, webkit prefix),
//                                  builds the master chain, resumes the context, starts any remembered music. Safe to call
//                                  repeatedly. A context the browser leaves suspended (iOS Safari ignores pointerdown) is woken by
//                                  the next click, key press or pointerup. While window.__HEADLESS is true it does nothing
//                                  unless opts.force is true (the audio suite forces it to drive the stubbed WebAudio). An init
//                                  that really started audio also reads DATA.SAMPLES (validated here, never in DATA.audit).
//   AUDIO.ready    bool            true once a context exists and the graph is built. AUDIO.current is the requested track id.
//   AUDIO.sfx(id, {vol, pitch, pan, delay, hero}?) -> bool   id in DATA.LISTS.sfx. vol multiplier (0..2), pitch multiplier (1 = as
//                                  written), pan -1..1 (exact when given), delay in MILLISECONDS (a value under 5 is read as
//                                  seconds), hero a DATA.LISTS.heroIds id: the per-hero variant `id.hero` plays when it exists (its
//                                  cooldown, priority and duck are the base id's). Every play gets a small seeded pitch, gain and pan
//                                  variation (a local seeded stream, never the banned random call), rapid ids have a cooldown, and the
//                                  voice cap sheds low priority sounds. A ready sample (DATA.SAMPLES) replaces the synth recipe.
//   AUDIO.music(id|null, {fade, restart}?)   id in DATA.LISTS.music; crossfades; null fades out and stops. Asking for the track
//                                  that is already current does nothing. `fade` is seconds (a value above 20 is read as ms).
//                                  Before init the request is remembered and starts inside init(). Unknown ids are ignored.
//   AUDIO.intensity(n)             0..1. Layered fight tracks (combat1..3, elite, boss1..3, final: drive 'intensity') fade extra layers
//                                  in as n rises; the Perfect Stage fights (combat3, boss3, final) also gain swing and human timing
//                                  with it (the quant drive: dead on the grid at 0, the Gloss). No argument returns the value. Leaving
//                                  a track that is not intensity-driven resets it to 0; a value set just before a layered fight track
//                                  starts is kept. The map tracks ignore it: they follow AUDIO.awake.
//   AUDIO.awake(frac?)             the live share of the map (MAP.progress(M).frac, 0..1), default 1. The map tracks (map1..3, drive
//                                  'awake') are muted by the Gloss until it rises: a per-deck low-pass and gain (the track's `hush`
//                                  {lo, floor}) and layers 1..3 that fade in at wakeLevel = clamp((frac - HUSH.from) / HUSH.span, 0, 1)
//                                  (layer k fully in at HUSH.th[k] + 0.1; level 0 plays the still bed only); map3 also swings more as
//                                  it is unmuted. Never touches the music bus, so a fight is never muffled. No argument returns it.
//   AUDIO.wake(q, r, o?) -> bool   one unmuted hex sings its note of the Act's hidden tune. o = {chapter, seed, cols, rows (the map's),
//                                  song? (a DATA.brushes id: the Spell), i?, n?, aq?, ar? (the Spell's anchor hex), last? (the held
//                                  cadence), soft? (a walked hex), pan?}. false when dropped (before init, suspended, Effects at 0,
//                                  over the note budget).
//   AUDIO.hexNote(q, r, info) -> {deg, midi}      info = {chapter, seed, cols, rows}. Pure: the same map always has the same tune.
//   AUDIO.songDegrees(song, n, root, chapter?) -> [deg] | null   the degrees a Spell's n cells sing (null: each cell its own hexNote;
//                                  chord and run Spells reach about -11..21, octave folded into the voice's range when sung). The
//                                  reveal sings on the pentatonic subset of the Act's key, so these are five-note degrees.
//   AUDIO.wakeDegree(q, r, o) -> deg              the degree AUDIO.wake will sing for that cell (pure, works with sound off)
//   AUDIO.options({calm, lite}?) -> {calm, lite}  from UI.applySettings: calm = reduced motion (no delay throw, no hummed steps), lite =
//                                  quality low (arp voice only, no vox, no extras, smaller note budget, no delay). No argument reads.
//   AUDIO.HUSH -> {from, span, th}  the calibrated unmute curve (read only). AUDIO.SONGS, AUDIO.CHORD_ROOTS, AUDIO.MOTIFS and
//                                  AUDIO.VARIANTS (the per-hero sfx keys `id.hero`) are plain data copies.
//   AUDIO.setVolume('music'|'sfx', 0..1)   AUDIO.volume(kind) -> the stored slider value (remembered before init)
//   AUDIO.duck(ms)                 dip the music under a big moment for ms milliseconds, then swell back. Big sfx do it themselves.
//   AUDIO.suspend() / AUDIO.resume()       explicit suspend; init also listens to visibilitychange (hidden suspends, visible resumes,
//                                  but never against an explicit suspend). resume() clears every reason.
//   AUDIO.list(kind?) -> {sfx:[ids], music:[ids]} (or one of the two arrays when kind is 'sfx' or 'music')
//   AUDIO.preview(id, {synth}?) -> bool   plays an sfx id for the settings screen (no random variation, does not touch the music);
//                                  {synth: true} plays the synth recipe even when a sample is ready (an A/B for the owners)
//   AUDIO.samples() -> [{key, state, files, seconds}]   the owners' sample table: key 'sfx:hit_light', 'sfx:card_play_attack.kuro',
//                                  'spells:wave', 'syllables:boots' or 'stingers:victory'; state 'idle' | 'loading' | 'ready' |
//                                  'failed' | 'over' (past the decoded-seconds budget). Empty before an init that started audio.
//
// COMPOSITION (pure, deterministic, seeded, testable in Node; nothing here touches WebAudio)
//   AUDIO.compose(trackId) -> frozen description (cached, treat as read-only) or null:
//     { id, mood, tempo (bpm), key ('D'), tonic (midi of the key), scale ('major'|'mixolydian'|'dorian'|'minor'|'lydian'),
//       scaleIntervals:[semitones], beatsPerBar, bars (introBars + loopBars), introBars, loopBars, beats, loopBeats, introBeats,
//       seconds, loopSeconds, layers (1, or 4 for the layered tracks), thresholds:[drive value where each layer is fully in],
//       xfade (seconds), drive ('intensity' fight tracks | 'awake' map tracks | null single bed), hush ({lo, floor} for 'awake'
//       tracks, else null), swing (share of a 16th by which every odd 16th is late), quant (null, or {swing, human, full}: swing and
//       the human timing rise from 0 at drive 0 to these values at drive `full` and above),
//       tracks:[{voice, role, layer, gain, pan, range:[lo,hi], section, human?, grid?, notes:[{t, dur, midi, vel, hit?, big?,
//       double?, bend?, vowel?, robot?, scoop?, crack?, pan?}]}] }
//     t and dur are in BEATS (quarter notes, from the start of the intro), midi is a note number, vel is 0..1. Every note lies
//     inside the declared scale and inside its track's range, every note ends before bars * beatsPerBar (nothing overhangs the
//     loop end; only the synthesised ring of a note crosses the seam), and the loop returns to beat introBeats. A track's `human`
//     replaces its voice's timing spread (0 = machine tight); `grid` tracks never swing (the Gloss's own parts).
//     Roles: melody (a seeded motif walk: statement, variation, sequence, cadence; forms like A a2 B a, ending on the tonic), pad,
//     drone, arp, bass, ostinato, bell, crackle, stab, run, beat (a 16-step grid: B b kick, K k snare, t T hat, s scratch, c clap;
//     one beat role expands into one track per voice it uses) and theme (a fixed motif of MOTIFS quoted note for note in the key:
//     Jasmin's theme, RawClaw's figure, the Human theme). Tracks with introBars > 0 play their intro once and then loop.
//   AUDIO.sfxRecipe(id) -> fresh plain recipe or null (id may also be a variant key `id.hero`):
//     { id, vol, var (random pitch cents), gainVar (dB), pan, duck (ms), cd (cooldown ms), pri (0..3), tune (midi note the recipe is
//       written in: 0 = never transposed; the Tea Stall has 55 and rings in the key of the playing track), dur (seconds, tail included),
//       layers:[ {k:'osc', w, f, f2, t, d, a, g, ...} | {k:'noise', n, ft, f, f2, q, t, d, a, g} | {k:'fm', f, ratio, idx, t, d, g}
//              | {k:'voice', v, m, t, d, vel, hit?, vowel?, syl?, ...} ] }
//     Layer times are seconds from the start of the sound, g is a linear gain, a is the attack and d the whole length (the
//     envelope decays exponentially to silence over d). f2 sweeps the frequency over the layer. The synth turns a recipe into nodes.
//
// SYNTHESIS (every voice takes any BaseAudioContext, so an OfflineAudioContext renders exactly what the game plays)
//   AUDIO.VOICES  the band: kick snare hat throat scratch (RoxorLoops), croon (Jasmin), choir (the crowd), synth (RawClaw), keys,
//                 ebass (Andy), glock, uke, whistle, clap, pad, arp, vox, crackle
//   AUDIO.voice(name, ctx, out, t, note) -> bool   one note of one instrument, note = {midi, dur (s), vel, r, hit?, big?, bend?,
//                                  vowel? ('a' 'o' 'u' 'e' 'm', or 'oo' 'ah' 'mm'), syl? ('boots' 'cats' 'ts' 'pf' 'k' 'bwaa' 'ab' 'ra'
//                                  'ca' 'tada' 'hey' 'boom'), robot?, whisper?, scoop? (cents), crack?, detune? (cents)}
//   AUDIO.graph(ctx, {musicVol, sfxVol}?) -> {music, sfx, out, ...}   master chain: music bus (high-pass 55 Hz, gentle high shelf,
//                                  duck) and sfx bus into glue compressor, limiter, soft clip (unity below 0.6, squeezes
//                                  overshoots up to +6 dB) and a small hall reverb; missing optional nodes are skipped
//   AUDIO.render(ctx, dest, desc, {t0, loops, intensity}?) -> {end, notes}   schedule a whole composition (intro plus `loops`
//                                  passes of the loop) into dest, for offline analysis (no voice cap). For 'awake' tracks `intensity`
//                                  is the wake level and defaults to 1 (fully live); it also drives the quant groove
//   AUDIO.renderSfx(ctx, dest, idOrRecipe, {t0, vol, pitch, pan, seed}?) -> {end}   schedule one sound effect (a variant key or a
//                                  plain recipe object as returned by sfxRecipe also works, for experiments and tools/hocus_vocus/mix.mjs)
//   AUDIO.debug() -> inspection hook for the suite: ctx, graph nodes, live source count, decks (with raw deck, swing and human),
//                    tick(), mixLengths, samples
//   AUDIO.SCALES  AUDIO.RANGES  AUDIO.MUSIC_SCALE   plain data copies
//
// SOUND DESIGN NOTES
//   The band: RoxorLoops is the beatbox kit (a sine-drop kick with a lip click and an "oo" touch, lip and "cats" snares, "ts" hats,
//   throat bass with a growl, vocal scratches), Jasmin is `croon` (a formant voice that opens from "oo" to "ah", scoops up into the
//   note and blooms into vibrato, with her own delay throw in the deck), RawClaw is `synth` (saw and square through a swept low-pass,
//   zaps and lasers), Andy is `ebass` (a plucked and slapped electric bass). Around them: electric-piano `keys`, a bright FM `glock`,
//   a ukulele `uke`, a breathy `whistle`, hand `clap`s and finger snaps, the crowd's `choir`, the kept `pad`, `arp` and `crackle`, and
//   `vox`, the formant voice that speaks the beatbox syllables and, with `robot`, is the Gloss's lip-sync.
//   The melodic reveal: every hex of a map owns one note of a seeded tune (columns carry a stepwise contour, rows bend it) on the
//   pentatonic subset of that Act's map key an octave up, so a chain, a Spell or a walk plays a phrase that can never clash. Each
//   Spell has a gesture (table SONGS, keys are DATA.brushes ids). A shared half-beat delay (one delay, built once, off when calm or
//   lite) answers wake notes. The map tracks are muted by the Gloss until the Act is unmuted (AUDIO.awake).
//   The Gloss in sound: the map mute (a low-pass and a gain floor); and the quant drive of map3, combat3, boss3 and final: dead on the
//   grid with no swing at drive 0, gaining swing and human timing as the Act is unmuted or the fight turns.
//   Layered tracks: layer 0 is always audible, layers 1..3 fade in at AUDIO.compose(id).thresholds. Boss tracks are already full at
//   intensity 0 and the layers add drama as phases begin (intensity 0.25 per phase entered). `final` starts at the Gloss's last form
//   (intensity 0.5): four bars of the Gloss alone, then RoxorLoops, Jasmin singing the Human theme, and the whole crowd.
//   Scheduling: a setInterval lookahead (60 ms tick, 0.42 s ahead) on the AudioContext clock, never rAF or Date. A deck that
//   falls far behind (a throttled timer) skips whole loops instead of replaying them. Every envelope gain starts at zero: a
//   source can begin one sample before its first automation event, which would otherwise click.
//   Levels: the music bus runs at MUSIC_SCALE (0.55) of the sfx bus at equal slider values, both through a v^1.5 taper. The sfx
//   `vol` values and the MIX table below are measured offline with tools/hocus_vocus/mix.mjs (peak per sfx against a target that
//   ranks hover < click < card sounds < hits < crits < Headliner moments; A-weighted loudness per score role against a target per
//   role type), with the master chain in the path, in a real browser. At the default sliders the score sits about -25 to -28 dBFS
//   RMS in a fight and -28 to -31 in calm scenes, peaks under -3 dBFS, and big sfx duck it. The suite fails if a score is edited
//   without regenerating its MIX row (row lengths); remeasure after changing a role.
//   Samples (HV_ART_AUDIO 11): DATA.SAMPLES lists optional same-origin files per sfx id, variant, Spell, vox syllable and stinger.
//   Nothing is requested before an init that started audio, nothing at all while the manifest is empty, and a file:// page never
//   fetches. Files load 1.5 s after init ('idle') or on first use ('lazy'), are decoded once, play through the sfx bus at the
//   recipe's measured level, and any missing or broken file simply leaves the synth recipe playing.
const AUDIO = (() => {
  'use strict';

  const MUSIC_SCALE = 0.55;              // music bus gain relative to the sfx bus at equal slider values (ART_BIBLE 9)
  const LOOKAHEAD = 0.42;                // seconds of music scheduled ahead of the audio clock
  const TICK_MS = 60;                    // scheduler interval
  const MAX_LIVE = 220;                  // live sound sources before low priority sounds are dropped
  const EPS = 0.0001;                    // exponential ramps may not touch 0
  const TAPER = 1.5;                     // slider value to amplitude curve: v ^ TAPER

  // The melodic reveal and the map mute: see the REVEAL section below and DESIGN 5.7
  // WAKE_SPAN is CALIBRATED (plan 7.2.4): the bot's median live share of the map at the Headliner was m = 0.19, so WAKE_SPAN = 0.19 - WAKE_FROM
  const WAKE_FROM = 0.06, WAKE_SPAN = 0.13;
  const HUSH_HI = 16000;                                    // a fully live map deck's low-pass (transparent)
  const DEG_LO = -4, DEG_HI = 9;                            // wake notes, in five-note degrees above the Act tonic + 12
  const NOTE_CAP = { rate: 14, burst: 8, ring: 12 };        // wake notes: per second, bucket size, notes still ringing
  const NOTE_CAP_LITE = { rate: 8, burst: 5, ring: 6 };
  const WAKE_GAIN = 0.8;                                    // bus gain of one wake note (checked by ear against card_hover and card_pick)
  const ECHO = { send: 0.3, feedback: 0.32, lp: 2200, ret: 0.55, beats: 0.5 };
  const CROON_FX = { send: 0.35, beats: 0.75, feedback: 0.28, lp: 3200 };   // Jasmin's own delay throw inside a music deck (dotted eighth)

  const mod = (a, n) => ((a % n) + n) % n;
  const frac = (x) => x - Math.floor(x);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const round3 = (x) => Math.round(x * 1000) / 1000;
  const isNum = (x) => typeof x === 'number' && x === x && x !== Infinity && x !== -Infinity;
  const db = (x) => Math.pow(10, x / 20);
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Diatonic keys for the score; the melodic reveal sings on the pentatonic subset of the same key (pentaOf), so a wake note can never clash.
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    minor: [0, 2, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    penta: [0, 2, 4, 7, 9],
    pentaMinor: [0, 3, 5, 7, 10],
  };
  const pentaOf = (name) => (name === 'dorian' || name === 'minor' || name === 'pentaMinor' ? SCALES.pentaMinor : SCALES.penta);

  // Playable range of every instrument in MIDI notes (a track may use a narrower window inside it). hat and clap ignore pitch.
  const RANGES = {
    kick: [30, 60], snare: [40, 80], hat: [24, 100], throat: [28, 55], scratch: [48, 84],
    croon: [55, 84], choir: [48, 79], synth: [48, 96], keys: [40, 88], ebass: [28, 60], glock: [72, 108], uke: [60, 84], whistle: [72, 96],
    clap: [24, 100], pad: [31, 90], arp: [48, 100], vox: [45, 84], crackle: [24, 100],
  };
  const VOICE_NAMES = Object.keys(RANGES);
  // Sung and blown voices play one note at a time.
  const MONO = { croon: true, whistle: true, throat: true };

  // ==================================================================================================================
  // COMPOSITION: pure and deterministic. A track is a table of sections and roles; each role (melody, pad, drone, arp, bass,
  // ostinato, beat, theme, bell, crackle, stab, run) is generated from a seeded stream derived from the track id, so adding or
  // retuning one role never changes another.
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
  // Arpeggio patterns: indexes into the ascending list of chord tones inside the role's range. `jasmin` is her theme's shape
  // (root, third, fifth, octave, tenth and home) and `stutter` is RawClaw's doubled sixteenths.
  const ARP_PATTERNS = {
    up: [0, 1, 2, 3, 4, 3, 2, 1],
    jasmin: [0, 1, 2, 3, 4, 3, 2, 1],
    roll: [0, 2, 1, 2, 0, 2, 1, 2],
    wave: [0, 1, 2, 3, 2, 1, 0, 1],
    pluck3: [0, 2, 3, 2],
    sparkle: [3, 4, 5, 4, 3, 2, 4, 5],
    rise: [0, 1, 2, 3, 4, 5, 4, 3],
    stutter: [0, 0, 2, 2, 1, 1, 3, 3, 2, 2, 4, 4, 3, 3, 1, 1],
  };
  // Beat grids, 16 steps per 4/4 bar, cycled bar by bar (HV_ART_AUDIO 10.3). B kick (accent), b kick (soft), K snare (accent, "cats"
  // or "pf"), k snare (soft rim "k"), t closed hat, T open hat, s scratch, c clap (or a finger snap), . rest.
  const BEATS = {
    bootsCats: ['B.t.K.t.B.t.K.t.', 'B.tBK.t..BtBK.tK'],
    boomBap: ['B...t.K.b.t.K.t.', 'B..bt.K.b.tBK.t.'],
    combat: ['B.tkK.tbB.tkK.tk', 'B.tkK.tBb.tkKktk'],
    hats16: ['tttttttttttttttt'],
    fills: ['........s...T.s.', '....s.s.T...sssK'],
    glitch: ['....s.s.s...T.s.', 's.s...s.T.s.sssK'],
    showdown: ['B..BK..bB.bBK..K'],
    shanty: ['B..cB..cB..cBccc'],
    fourFloor: ['B.t.B.tKB.t.B.tK'],
    crisp: ['B.t.K.t.B.t.K.t.'],
    march: ['B.c.B.c.B.c.Bcc.'],
    fanfare: ['cccccccccccccBBB', 'B..c..B.B.c.B...'],
    shop: ['b.c.b.c.b.c.b.cc'],
    clicks: ['..k...k...k..k.k'],
    backbeat: ['....c.......c...'],
    offbeat: ['..c...c...c...c.'],
    softKick: ['b...............'],
  };
  const BEAT_VOICE = { B: 'kick', b: 'kick', K: 'snare', k: 'snare', t: 'hat', T: 'hat', s: 'scratch', c: 'clap' };
  const BEAT_ORDER = ['kick', 'snare', 'hat', 'scratch', 'clap'];
  // Ostinato templates, one bar of eighths or sixteenths. R root, r root an octave up, 3 and 5 the other chord tones, C the whole
  // chord at once (a strum: the voices' human timing spreads it like fingers over strings), . rest.
  const OSTINATO = {
    drive: ['R.RR.R5.', 'R.R.R35.', 'RR.R.R3r', 'R.RR.r5R'],
    gallop: ['R.RRR.RR', 'R.RRR.53', 'RRR.R.3r', 'R.R.RR5R'],
    tremolo: ['RRRRRRRRRRRRRRRR', 'RRRRRRRR3535RRRR', 'RRRRRRRRRRRR5555', 'RRRRRR35RRRRRRRR'],
    bounce: ['R.35.35.', 'R.R3.5r.', 'R.53.R3.', 'Rr.3r.5.'],
    silk: ['R..3..5.', 'R.3.5.3.', 'R..5.3..', 'R.3..5r.'],
    staccato: ['R.R.R.R.', 'R.r.R.3.', 'R.R.5.R.', 'r.R.3.R.'],
    strum: ['C.C.C.CC', 'C.CC.C.C', 'C..CC.C.', 'C.C.CC.C'],
  };

  // ---- scale and chord arithmetic. S is a section context: {sc, tonic, bpb, bars, chordAt[], blocks[]}
  const pcOfDeg = (S, d) => mod(S.tonic + S.sc[mod(d, S.sc.length)], 12);
  const degMidi = (S, d) => S.tonic + 12 * Math.floor(d / S.sc.length) + S.sc[mod(d, S.sc.length)];
  const chordPcs = (S, root) => [pcOfDeg(S, root), pcOfDeg(S, root + 2), pcOfDeg(S, root + 4)];
  // chord tones are every other degree from the root: triads in a seven-note key, the whole stack in a five-note one
  const isChordDeg = (d, root, n) => { const r = mod(d - root, n); return r === 0 || r === 2 || r === 4; };
  function tonesFor(S, root, lo, hi) {
    const pcs = chordPcs(S, root), out = [];
    for (let m = lo; m <= hi; m++) if (pcs.indexOf(mod(m, 12)) >= 0) out.push(m);
    return out;
  }
  const lowestPc = (lo, pc) => { let m = lo; while (mod(m, 12) !== pc) m++; return m; };
  const nextPcAbove = (base, pc) => { let m = base + 1; while (mod(m, 12) !== pc) m++; return m; };
  const foldInto = (m, lo, hi) => { while (m > hi) m -= 12; while (m < lo) m += 12; return m; };

  function mkTrack(R, role, notes, extra) {
    const tr = Object.assign({
      voice: R.voice, role, layer: R.layer || 0, gain: R.gain == null ? 1 : R.gain, pan: R.pan || 0,
      range: (R.range || RANGES[R.voice]).slice(), notes,
    }, extra || {});
    if (R.human != null && tr.human == null) tr.human = R.human;
    if (R.grid) tr.grid = true;
    return tr;
  }
  const note = (t, dur, midi, vel, extra) => Object.assign({ t: round3(t), dur: round3(dur), midi, vel: round3(clamp(vel, 0.05, 1)) }, extra || {});

  // ---- melody: motif, statement, variation, sequence, cadence
  function roleMelody(rng, S, R) {
    const n = S.sc.length, bpb = S.bpb;
    const lo = R.range[0], hi = R.range[1];
    let dLo = 1e9, dHi = -1e9;
    for (let d = -60; d <= 80; d++) { const m = degMidi(S, d); if (m >= lo && m <= hi) { if (d < dLo) dLo = d; if (d > dHi) dHi = d; } }
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
    const chordNear = (root, ref) => { for (const o of [0, 1, -1, 2, -2, 3, -3]) if (isChordDeg(ref + o, root, n)) return clampDeg(ref + o); return clampDeg(ref); };
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
    // a cadence bar; `rise` approaches the target from one step below (a phrase that ends on a question, rising)
    function cadBar(target, ref) {
      const cell = rng.pick(cads);
      let cur = nearestRes(target, ref);
      const out = [];
      for (let i = cell.length - 1; i >= 0; i--) {
        out.unshift({ d: cur, dur: cell[i] });
        cur = clampDeg(cur + (R.cadRise && i === cell.length - 1 ? -1 : rng.weighted([[-2, 0.15], [-1, 0.35], [1, 0.35], [2, 0.15]])));
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
          if (i === 0) for (const o of [0, 1, -1, 2, -2]) if (isChordDeg(d + o, root, n)) { d += o; break; }
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
    const vowels = R.vowels || null;
    let peak = -1e9;
    placed.forEach((p) => { if (p.d > peak) peak = p.d; });
    placed.forEach((p, i) => {
      const beat0 = mod(p.t, bpb) === 0;
      let v = 0.64 + (beat0 ? 0.1 : 0) + (p.d === peak ? 0.08 : 0) + (rng() - 0.5) * 0.08;
      if (p.last) v = 0.6;
      const nxt = placed[i + 1];
      const flows = nxt && Math.abs((nxt.t) - (p.t + p.dur)) < 1e-6;
      const dur = gap && flows ? Math.max(0.15, p.dur - gap) : p.dur;
      out.push(note(p.t, dur, degMidi(S, p.d), v * (R.vel == null ? 1 : R.vel), vowels ? { vowel: vowels[i % vowels.length] } : null));
    });
    const tracks = [mkTrack(R, 'melody', out)];
    for (const a of R.also || []) {
      const vr = RANGES[a.voice];
      const dn = out.map((x) => {
        const y = Object.assign({}, x, { midi: foldInto(x.midi + 12 * (a.shift || 0), vr[0], vr[1]), vel: round3(clamp(x.vel * (a.vel == null ? 0.8 : a.vel), 0.05, 1)) });
        delete y.vowel;
        return y;
      });
      tracks.push({ voice: a.voice, role: 'melody-double', layer: a.layer == null ? (R.layer || 0) : a.layer, gain: (R.gain == null ? 1 : R.gain) * (a.gain == null ? 0.6 : a.gain), pan: a.pan == null ? -(R.pan || 0.2) : a.pan, range: vr.slice(), notes: dn });
    }
    return tracks;
  }

  // ---- harmony beds. `hit` (beats) re-strikes a decaying instrument (keys) inside a long chord.
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
      const len = b.bars * S.bpb, step = R.hit ? Math.min(R.hit, len) : len;
      for (let k = 0; k + 1e-9 < len; k += step) {
        const v = (R.vel == null ? 0.5 : R.vel) * (k === 0 ? 1 : 0.82);
        for (const m of uniq) notes.push(note(b.bar * S.bpb + k, Math.min(step, len - k), m, v * (0.92 + 0.16 * rng())));
      }
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
        const even = R.even ? 1 : (onBeat ? 1 : 0.8) + (rng() - 0.5) * 0.12;
        notes.push(note(b * S.bpb + s * stepB, stepB * (R.len || 1), tones[idx], (R.vel == null ? 0.5 : R.vel) * even));
      }
    }
    return [mkTrack(R, 'arp', notes)];
  }
  // Andy's riff (MOTIFS.andy) as a bass line: scale degrees above each bar's chord root, eighths, a slap on the first note and a pop
  // on the octave. `slide` adds RoxorLoops's throat-bass slide on the last eighth of every fourth bar.
  function roleBass(rng, S, R) {
    const lo = R.range[0], hi = R.range[1], notes = [], bpb = S.bpb;
    const kind = R.pattern || 'root';
    for (let b = 0; b < S.bars; b++) {
      if (R.every && b % R.every !== 0) continue;
      const cr = S.chordAt[b];
      const pcs = chordPcs(S, cr);
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
      } else if (kind === 'riff') {
        const base = degMidi(S, cr), at = lowestPc(lo, mod(base, 12));
        MOTIFS.andy.notes.forEach((x, i) => {
          if (x[0] == null || i * 0.5 >= bpb) return;
          let m = at + degMidi(S, cr + x[0]) - base;
          while (m > hi) m -= 12;
          const hit = i === 0 ? 'slap' : x[0] === 7 ? 'pop' : undefined;
          notes.push(note(t0 + i * 0.5, 0.45, m, v * (i === 0 ? 1 : 0.72) * jit(), hit ? { hit } : null));
        });
      }
      if (R.slide && b % 4 === 3 && bpb === 4) {
        const last = notes.length ? notes[notes.length - 1] : null;
        const t = t0 + bpb - 0.5;
        if (last && last.t + last.dur > t + 1e-6) last.dur = round3(Math.max(0.1, t - last.t));
        notes.push(note(t, 0.45, root, v * 0.85, { bend: -5 }));
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
        const strong = i === 0 || ch === 'r';
        const v = (R.vel == null ? 0.55 : R.vel) * (strong ? 1 : 0.72) * (0.93 + 0.14 * rng());
        const list = ch === 'C' ? [root, third, fifth] : [map[ch]];
        const ms = list.map((m) => foldInto(m, lo, hi)).filter((m, k, a) => a.indexOf(m) === k).sort((x, y) => x - y);
        for (const m of ms) notes.push(note(b * S.bpb + i * stepB, stepB * 0.95, m, ch === 'C' ? v * 0.8 : v));
      }
    }
    return [mkTrack(R, 'ostinato', notes)];
  }
  // a beat: one 16-step grid per bar (BEATS, cycled), expanded into one track per voice it uses. Pitched voices sit on the tonic.
  // R.kick 'boots' gives every accented kick the "oo" tail; R.snare 'cats' | 'pf' voices the accented snare; R.clap 'snap'; R.late
  // {bars, by} plays the kick on the first step of those bars late by `by` beats (the human kick a hair late under the Human theme);
  // R.snapK turns the soft "k" into finger snaps (the Detour's clicks).
  function roleBeat(rng, S, R) {
    const pats = Array.isArray(R.grid) ? R.grid : BEATS[R.grid || 'bootsCats'];
    const tpc = mod(S.tonic, 12);
    const pitch = { kick: lowestPc(36, tpc), snare: lowestPc(52, tpc), hat: lowestPc(72, tpc), scratch: lowestPc(60, tpc), clap: lowestPc(60, tpc) };
    const by = {};
    const steps = S.bpb === 4 ? 16 : 12, v0 = R.vel == null ? 0.8 : R.vel;
    for (let b = 0; b < S.bars; b++) {
      if (R.every && b % R.every !== 0) continue;
      const pat = pats[b % pats.length];
      for (let s = 0; s < Math.min(pat.length, steps); s++) {
        const ch = pat[s], voice = ch === 'k' && R.snapK ? 'clap' : BEAT_VOICE[ch];
        if (!voice) continue;
        let t = b * S.bpb + s * 0.25;
        const j = 0.94 + rng() * 0.12, accent = ch === 'B' || ch === 'K' || ch === 'T';
        let ex = null, v = v0 * j * (accent ? 1 : 0.68);
        if (ch === 'B' && R.kick) ex = { hit: R.kick };
        else if (ch === 'K') ex = { hit: R.snare || 'pf' };
        else if (ch === 'k') { ex = { hit: R.snapK ? 'snap' : 'k' }; v = v0 * j * (R.snapK ? 0.8 : 0.55); }
        else if (ch === 'T') ex = { hit: 'open' };
        else if (ch === 't') v = v0 * j * (s % 4 === 2 ? 0.62 : 0.48);
        else if (ch === 'c' && R.clap) ex = { hit: R.clap };
        if (voice === 'kick' && s === 0 && R.late && R.late.bars.indexOf(b) >= 0) t += R.late.by;
        (by[voice] = by[voice] || []).push(note(t, 0.25, pitch[voice], v, ex));
      }
    }
    return BEAT_ORDER.filter((vc) => by[vc]).map((vc) => mkTrack(Object.assign({}, R, { voice: vc, range: RANGES[vc] }), 'beat', by[vc]));
  }
  // a fixed motif from MOTIFS, quoted note for note in the key: one statement starts at each bar of R.at (beat R.beat), the whole
  // motif folded into the register as one piece. R.len cuts it after that many bars, R.stretch slows it (the music box), R.harm[k]
  // (scale steps, 0 = none) adds a harmony track to statement k (the crowd in thirds), R.also doubles it like a melody.
  function roleTheme(rng, S, R) {
    const M = MOTIFS[R.motif], n = S.sc.length, lo = R.range[0], hi = R.range[1];
    const st = R.stretch || 1, v0 = R.vel == null ? 0.7 : R.vel;
    const degs = M.notes.filter((x) => x[0] != null).map((x) => x[0]);
    const span = (o) => degs.map((d) => degMidi(S, d + o));
    let oct = 0;
    for (let k = -4; k <= 4; k++) { const ms = span(k * n); if (Math.min(...ms) >= lo && Math.max(...ms) <= hi) { oct = k * n; break; } }
    const main = [], harm = [];
    (R.at || [0]).forEach((bar, si) => {
      let t = bar * S.bpb + (R.beat || 0);
      const end = R.len ? bar * S.bpb + R.len * S.bpb : S.bars * S.bpb;
      const h = R.harm ? R.harm[si] || 0 : 0;
      M.notes.forEach((x, i) => {
        const dur = x[1] * st;
        if (x[0] != null && t + 1e-9 < end && t + 1e-9 < S.bars * S.bpb) {
          const ex = Object.assign({}, x[2] || {});
          if (M.pan) ex.pan = M.pan[i];
          const len = Math.min(dur, end - t, S.bars * S.bpb - t);
          const v = v0 * (i === 0 ? 1 : 0.9) * (0.96 + 0.08 * rng());
          main.push(note(t, len, degMidi(S, x[0] + oct), v, ex));
          if (h) { let m = degMidi(S, x[0] + oct + h); if (m > hi) m -= 12; harm.push(note(t, len, m, v * 0.85)); }
        }
        t += dur;
      });
    });
    main.sort((a, b) => a.t - b.t); harm.sort((a, b) => a.t - b.t);
    const tracks = [mkTrack(R, 'theme', main, { motif: R.motif })];
    if (harm.length) tracks.push(mkTrack(R, 'theme-harmony', harm, { gain: (R.gain == null ? 1 : R.gain) * 0.8 }));
    for (const a of R.also || []) {
      const vr = RANGES[a.voice];
      const dn = main.map((x) => ({ t: x.t, dur: x.dur, midi: foldInto(x.midi + 12 * (a.shift || 0), vr[0], vr[1]), vel: round3(clamp(x.vel * (a.vel == null ? 0.6 : a.vel), 0.05, 1)) }));
      tracks.push({ voice: a.voice, role: 'theme-double', layer: a.layer == null ? (R.layer || 0) : a.layer, gain: (R.gain == null ? 1 : R.gain) * (a.gain == null ? 0.5 : a.gain), pan: a.pan == null ? -(R.pan || 0.2) : a.pan, range: vr.slice(), notes: dn });
    }
    return tracks;
  }
  function roleBell(rng, S, R) {
    const lo = R.range[0], hi = R.range[1], notes = [], p = R.p == null ? 0.6 : R.p;
    S.blocks.forEach((b) => {
      const per = R.perBlock ? b.bars : 1;
      for (let k = 0; k < b.bars; k += per) {
        if (rng() > p) continue;
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
  // vinyl crackle pops, and now and then a soft kettle hiss (hit 'hiss') on the first beat of every fourth bar
  function roleCrackle(rng, S, R) {
    const notes = [], per = R.perBar || 3, m = lowestPc(RANGES.crackle[0] + 12, mod(S.tonic, 12));
    for (let b = 0; b < S.bars; b++) {
      const cnt = Math.max(0, Math.round(per + (rng() - 0.5) * 2));
      const used = {};
      if (R.kettle && b % 4 === 1) { used[0] = 1; notes.push(note(b * S.bpb, S.bpb * 1.5, m, (R.vel == null ? 0.5 : R.vel) * 0.6, { hit: 'hiss' })); }
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
  // dyads that hold a tritone when the chord has one (the diminished chord of the key), else two outer chord tones
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
  const ROLES = { melody: roleMelody, pad: rolePad, drone: roleDrone, arp: roleArp, bass: roleBass, ostinato: roleOstinato, beat: roleBeat, theme: roleTheme, bell: roleBell, crackle: roleCrackle, stab: roleStab, run: roleRun };

  // ---- the musical identities (HV_ART_AUDIO 10.4): scale degrees from 0 = the tonic in the track's key, durations in beats, null a
  // rest; a third entry carries per-note extras (scoop in cents, crack: the voice cracks on the high note); pan is per note.
  // The Human theme is an ORIGINAL tune written for the game: it never transcribes the owners' song.
  const MOTIFS = {
    jasmin: { notes: [[0, 0.5], [2, 0.5], [4, 0.5], [7, 0.5], [9, 0.5], [7, 0.5], [4, 0.5], [2, 0.5]] },
    rawclaw: { notes: [[4, 0.5], [2, 0.5], [0, 0.5]], pan: [-0.7, 0.7, 0] },
    andy: { notes: [[0, 0.5], [null, 0.5], [0, 0.5], [7, 0.5], [6, 0.5], [null, 0.5], [4, 0.5], [5, 0.5]] },
    human: { notes: [[4, 3], [5, 1], [4, 2], [2, 2], [1, 1], [2, 1], [4, 1], [7, 1, { scoop: 40, crack: 1 }], [6, 2], [4, 2]] },
    jingle: { notes: [[4, 0.5], [2, 0.5], [7, 1]] },
  };

  // ---- the score: every id of DATA.LISTS.music. key is the tonic as a MIDI note, prog is [chord root degree, bars] per block.
  const P1 = (list) => list.map((d) => [d, 1]);
  // Intensity layers: 0 the groove, 1 arpeggios and hats, 2 the melody, 3 the full band. The screens send 1 - living/starting
  // enemies plus 0.25 per Headliner phase, so thresholds are where each layer is fully in. `final` only starts at the Gloss's last
  // form (intensity 0.5 or more), so its layers are all in there and its story is told in time (intro, then the loop's entries).
  const TH_COMBAT = [0, 0.25, 0.5, 0.75];
  const TH_BOSS = [0, 0.12, 0.35, 0.6];
  const TH_FINAL = [0, 0.05, 0.2, 0.4];
  // the map tracks are unmuted with the Act: layer k is fully in at wakeLevel th[k] + 0.1 (AUDIO.awake, not AUDIO.intensity).
  // Calibrated with WAKE_SPAN from m = 0.19: T3 = clamp((0.6 * m - WAKE_FROM) / WAKE_SPAN - 0.1, 0.15, 0.65) = 0.32, th = [0, 0.23 T3, 0.62 T3, T3]
  const TH_WAKE = [0, 0.07, 0.2, 0.32];

  // the fight band: RoxorLoops's kit and throat bass under a hook, layered by intensity
  function combatKit(o) {
    return [
      { role: 'beat', grid: o.beat || 'combat', snare: o.snare || 'cats', kick: o.kick, human: o.human, vel: 0.85, gain: 1, layer: 0 },
      { role: 'bass', voice: 'throat', range: [33, 50], pattern: 'drive', vel: 0.72, gain: 0.85, layer: 0 },
      { role: 'ostinato', voice: o.ost, range: o.ostRange, template: o.tmpl, hit: o.ostHit, vel: 0.5, gain: 0.7, pan: -0.25, layer: 0 },
      { role: 'arp', voice: o.arp, range: o.arpRange, step: 0.25, pattern: 'up', skip: o.skip || 0.3, hit: o.arpHit, vel: 0.3, len: 1.1, gain: 0.6, pan: 0.3, layer: 1 },
      { role: 'beat', grid: 'hats16', human: o.human, vel: 0.45, gain: 0.6, pan: 0.15, layer: 1 },
      { role: 'beat', grid: 'offbeat', vel: 0.5, gain: 0.6, pan: -0.1, layer: 1 },
      { role: 'melody', voice: o.mel, range: o.melRange, cells: o.cells, leaps: true, phrase: 4, vel: 0.8, gap: 0.06, gain: 0.95, pan: 0.1, layer: 2, also: o.also },
      { role: 'beat', grid: o.fills || 'fills', vel: 0.6, gain: 0.7, layer: 3 },
      { role: 'pad', voice: 'keys', range: [52, 74], voicing: 'full', hit: 4, vel: 0.34, gain: 0.7, layer: 3 },
      { role: 'bell', voice: 'glock', range: [79, 101], p: 0.8, vel: 0.35, gain: 0.5, pan: -0.3, layer: 3 },
    ];
  }

  const TRACKS = {
    // ---- menus
    title: {
      key: 50, scale: 'major', tempo: 84, bpb: 4, mood: 'moonlit and warm, the duo warm up under the moon', xfade: 3,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [5, 2], [3, 2], [4, 2], [0, 2], [5, 2], [3, 2], [4, 1], [0, 1]], roles: [
        { role: 'pad', voice: 'keys', range: [50, 74], voicing: 'full', hit: 4, vel: 0.42, gain: 1 },
        { role: 'arp', voice: 'glock', range: [74, 98], step: 0.5, pattern: 'jasmin', skip: 0.35, vel: 0.3, len: 2, gain: 0.7, pan: -0.35 },
        { role: 'melody', voice: 'croon', range: [62, 81], cells: 'long', phrase: 4, form: ['A', 'a2', 'B', 'a'], vel: 0.8, gap: 0.08, gain: 1, pan: 0.1 },
        { role: 'beat', grid: 'boomBap', snare: 'pf', vel: 0.55, gain: 0.8 },
        { role: 'bass', voice: 'throat', range: [33, 50], pattern: 'half', vel: 0.55, gain: 0.85 },
        { role: 'bell', voice: 'glock', range: [79, 103], p: 0.5, perBlock: true, vel: 0.32, gain: 0.6, pan: 0.3 },
      ] }],
    },
    hero_select: {
      key: 55, scale: 'major', tempo: 100, bpb: 4, mood: 'bouncy and friendly, pick your duo', xfade: 1.5,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 3, 4, 0, 5, 3, 1, 4, 0, 3, 4, 5, 3, 4, 0, 0]), roles: [
        { role: 'melody', voice: 'whistle', range: [74, 93], cells: 'flow', phrase: 4, form: ['A', 'a2', 'B', 'a'], vel: 0.8, gap: 0.06, gain: 1, pan: 0.1 },
        { role: 'ostinato', voice: 'uke', range: [60, 79], template: 'strum', vel: 0.45, gain: 0.75, pan: -0.25 },
        { role: 'bass', voice: 'ebass', range: [33, 52], pattern: 'riff', vel: 0.7, gain: 0.85 },
        { role: 'beat', grid: 'bootsCats', kick: 'boots', snare: 'cats', vel: 0.5, gain: 0.75 },
        { role: 'beat', grid: 'backbeat', vel: 0.5, gain: 0.7, pan: 0.15 },
        { role: 'pad', voice: 'keys', range: [52, 72], voicing: 'open', hit: 4, vel: 0.32, gain: 0.7 },
      ] }],
    },
    // ---- exploration: muted by the Gloss until the Act is unmuted (AUDIO.awake)
    map1: {
      key: 55, scale: 'major', tempo: 100, bpb: 4, mood: 'sunny harbour pop, handclaps and a whistled hook', xfade: 2.5, drive: 'awake', thresholds: TH_WAKE, hush: { lo: 900, floor: 0.85 },
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [3, 2], [5, 2], [4, 2], [0, 2], [3, 2], [4, 2], [0, 2]], roles: [
        { role: 'pad', voice: 'keys', range: [50, 74], voicing: 'full', hit: 4, vel: 0.38, gain: 0.9, layer: 0 },
        { role: 'bell', voice: 'glock', range: [79, 100], p: 0.4, perBlock: true, vel: 0.32, gain: 0.6, pan: 0.3, layer: 0 },
        { role: 'bass', voice: 'ebass', range: [36, 55], pattern: 'half', vel: 0.55, gain: 0.75, layer: 1 },
        { role: 'beat', grid: 'backbeat', vel: 0.45, gain: 0.65, pan: -0.15, layer: 1 },
        { role: 'arp', voice: 'uke', range: [60, 79], step: 0.5, pattern: 'roll', skip: 0.2, vel: 0.4, len: 1.6, gain: 0.8, pan: -0.3, layer: 2 },
        { role: 'melody', voice: 'whistle', range: [74, 93], cells: 'flow', phrase: 4, vel: 0.72, gap: 0.06, gain: 0.95, pan: 0.1, layer: 3, also: [{ voice: 'croon', shift: -1, gain: 0.4 }] },
      ] }],
    },
    map2: {
      key: 57, scale: 'dorian', tempo: 104, bpb: 4, mood: 'two in the morning in blue light, a minor electro bounce and a call to the moon', xfade: 2.5, drive: 'awake', thresholds: TH_WAKE, hush: { lo: 750, floor: 0.8 },
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [3, 2], [0, 2], [6, 2], [0, 2], [3, 2], [2, 2], [0, 2]], roles: [
        { role: 'pad', voice: 'pad', range: [48, 72], voicing: 'open', vel: 0.38, gain: 0.9, layer: 0 },
        { role: 'bell', voice: 'synth', range: [69, 93], p: 0.45, hit: 'pluck', vel: 0.34, gain: 0.6, pan: 0.35, layer: 0 },
        { role: 'bass', voice: 'throat', range: [33, 50], pattern: 'pedal', vel: 0.5, gain: 0.75, layer: 1 },
        { role: 'arp', voice: 'synth', range: [60, 84], step: 0.25, pattern: 'stutter', skip: 0.3, hit: 'pluck', vel: 0.3, len: 1, gain: 0.65, pan: -0.25, layer: 2 },
        { role: 'theme', motif: 'rawclaw', voice: 'synth', range: [64, 88], at: [3, 7, 11, 15], beat: 2.5, hit: 'pluck', vel: 0.42, gain: 0.7, layer: 2 },
        { role: 'melody', voice: 'croon', range: [62, 81], cells: 'sparse', phrase: 4, shape: 'rise', vel: 0.66, gap: 0.08, gain: 0.9, pan: 0.15, layer: 3 },
      ] }],
    },
    map3: {
      key: 52, scale: 'lydian', tempo: 96, bpb: 4, mood: 'too clean, glass pop dead on the grid that learns to swing as it is unmuted', xfade: 3, drive: 'awake', thresholds: TH_WAKE, hush: { lo: 600, floor: 0.75 },
      quant: { swing: 0.14, human: 1, full: 1 },
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [1, 2], [0, 2], [1, 2], [5, 2], [1, 2], [4, 2], [0, 2]], roles: [
        { role: 'drone', voice: 'pad', range: [40, 64], tones: [0, 7], bars: 4, vel: 0.42, gain: 0.95, layer: 0, grid: true },
        { role: 'arp', voice: 'glock', range: [76, 95], step: 0.5, pattern: 'wave', even: true, human: 0, vel: 0.26, len: 1, gain: 0.55, pan: -0.25, layer: 0 },
        { role: 'bass', voice: 'keys', range: [40, 55], pattern: 'root', vel: 0.5, gain: 0.8, layer: 1 },
        { role: 'arp', voice: 'keys', range: [55, 76], step: 0.5, pattern: 'roll', skip: 0.25, vel: 0.34, len: 1.5, gain: 0.7, pan: 0.25, layer: 2 },
        { role: 'melody', voice: 'croon', range: [64, 83], cells: 'flow', phrase: 4, vel: 0.68, gap: 0.08, gain: 0.95, pan: 0.1, layer: 3 },
      ] }],
    },
    // ---- fights: layered by AUDIO.intensity
    combat1: {
      key: 52, scale: 'major', tempo: 124, bpb: 4, mood: 'bright beatbox pop, boots and cats with a ukulele hook', xfade: 0.5, thresholds: TH_COMBAT,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 0, 3, 4, 5, 3, 4, 4, 0, 0, 3, 4, 5, 3, 4, 0]),
        roles: combatKit({ ost: 'uke', ostRange: [60, 79], tmpl: 'drive', arp: 'glock', arpRange: [76, 98], mel: 'whistle', melRange: [74, 93], cells: 'lively',
          also: [{ voice: 'keys', shift: -1, gain: 0.55 }, { voice: 'croon', shift: -1, gain: 0.45, layer: 3 }] }) }],
    },
    combat2: {
      key: 57, scale: 'minor', tempo: 130, bpb: 4, mood: 'neon electro, syncopated, glitchy and scratched', xfade: 0.5, thresholds: TH_COMBAT,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 5, 2, 6, 0, 5, 3, 4, 0, 5, 2, 6, 3, 4, 0, 0]),
        roles: combatKit({ snare: 'pf', ost: 'synth', ostRange: [55, 76], tmpl: 'gallop', ostHit: 'pluck', arp: 'synth', arpRange: [67, 91], arpHit: 'pluck', mel: 'synth', melRange: [67, 88], cells: 'run', fills: 'glitch',
          also: [{ voice: 'croon', shift: -1, gain: 0.45 }] }) }],
    },
    combat3: {
      key: 52, scale: 'lydian', tempo: 136, bpb: 4, mood: 'polished and relentless, it loosens and swings as the Polished fall', xfade: 0.5, thresholds: TH_COMBAT,
      quant: { swing: 0.1, human: 1, full: 1 },
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 1, 0, 4, 5, 1, 4, 4, 0, 1, 0, 4, 5, 1, 4, 0]),
        roles: combatKit({ beat: 'crisp', human: 0, ost: 'keys', ostRange: [52, 76], tmpl: 'staccato', arp: 'keys', arpRange: [64, 88], mel: 'croon', melRange: [64, 83], cells: 'flow',
          also: [{ voice: 'glock', shift: 1, gain: 0.4 }] }) }],
    },
    elite: {
      key: 50, scale: 'minor', tempo: 118, bpb: 4, mood: 'a showdown, heavy stabs and a big beatbox breakdown', xfade: 0.5, thresholds: TH_COMBAT,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [1, 1], [4, 1], [0, 2], [1, 1], [4, 1], [0, 1], [1, 1], [4, 1], [1, 1], [4, 1], [1, 1], [0, 2]], roles: [
        { role: 'beat', grid: 'showdown', snare: 'pf', vel: 0.9, gain: 1, layer: 0 },
        { role: 'stab', voice: 'synth', range: [50, 74], at: [0, 2.5], len: 0.5, vel: 0.7, gain: 0.8, pan: -0.15, layer: 0 },
        { role: 'bass', voice: 'throat', range: [33, 50], pattern: 'pedal', vel: 0.75, gain: 0.9, layer: 0 },
        { role: 'ostinato', voice: 'synth', range: [57, 79], template: 'tremolo', hit: 'pluck', vel: 0.34, gain: 0.55, pan: 0.2, layer: 1 },
        { role: 'beat', grid: 'fills', vel: 0.6, gain: 0.7, layer: 1 },
        { role: 'melody', voice: 'croon', range: [64, 83], cells: 'sparse', leaps: true, phrase: 4, vel: 0.8, gap: 0.08, gain: 0.95, pan: 0.1, layer: 2 },
        { role: 'pad', voice: 'pad', range: [45, 72], voicing: 'open', vel: 0.42, gain: 0.8, layer: 2 },
        { role: 'beat', grid: 'hats16', vel: 0.45, gain: 0.6, pan: 0.15, layer: 3 },
        { role: 'bell', voice: 'glock', range: [77, 100], p: 0.7, vel: 0.35, gain: 0.5, pan: -0.3, layer: 3 },
      ] }],
    },
    // ---- Headliners: already full at intensity 0, more drama per phase
    boss1: {
      key: 50, scale: 'mixolydian', tempo: 126, bpb: 4, mood: 'karaoke chaos by the sea, a stomping shanty and eight mics at once', xfade: 0.6, thresholds: TH_BOSS,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [6, 1], [3, 1], [0, 2], [6, 1], [3, 1], [0, 1], [4, 1], [6, 1], [3, 1], [0, 1], [6, 1], [3, 1], [0, 1]], roles: [
        { role: 'pad', voice: 'pad', range: [45, 72], voicing: 'open', vel: 0.45, gain: 0.85, layer: 0 },
        { role: 'beat', grid: 'shanty', kick: 'boots', vel: 0.9, gain: 1, layer: 0 },
        { role: 'bass', voice: 'ebass', range: [33, 55], pattern: 'drive', vel: 0.72, gain: 0.85, layer: 0 },
        { role: 'ostinato', voice: 'uke', range: [60, 79], template: 'gallop', vel: 0.5, gain: 0.7, pan: -0.25, layer: 0 },
        { role: 'melody', voice: 'croon', range: [62, 81], cells: 'flow', leaps: true, phrase: 4, vel: 0.85, gap: 0.06, gain: 1, pan: 0.1, layer: 0,
          also: [{ voice: 'whistle', shift: 1, gain: 0.45, layer: 1 }] },
        { role: 'arp', voice: 'glock', range: [76, 98], step: 0.25, pattern: 'up', skip: 0.35, vel: 0.3, len: 1.1, gain: 0.6, pan: 0.3, layer: 1 },
        { role: 'beat', grid: 'offbeat', vel: 0.5, gain: 0.6, pan: 0.1, layer: 1 },
        { role: 'beat', grid: 'fills', vel: 0.6, gain: 0.7, layer: 2 },
        { role: 'bell', voice: 'glock', range: [79, 101], p: 0.9, vel: 0.35, gain: 0.5, pan: -0.3, layer: 2 },
        { role: 'stab', voice: 'keys', range: [52, 74], at: [0, 2.5], vel: 0.6, gain: 0.65, layer: 3 },
        { role: 'pad', voice: 'choir', range: [55, 76], voicing: 'full', vowel: 'a', vel: 0.4, gain: 0.7, layer: 3 },
      ] }],
    },
    boss2: {
      key: 54, scale: 'dorian', tempo: 134, bpb: 4, mood: 'glam electro diva, glittering arps and a feed that never stops', xfade: 0.6, thresholds: TH_BOSS,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [[0, 2], [3, 2], [0, 2], [6, 2], [0, 2], [3, 1], [2, 1], [4, 2], [0, 2]], roles: [
        { role: 'pad', voice: 'pad', range: [45, 72], voicing: 'open', vel: 0.45, gain: 0.85, layer: 0 },
        { role: 'beat', grid: 'fourFloor', snare: 'cats', vel: 0.9, gain: 1, layer: 0 },
        { role: 'bass', voice: 'throat', range: [33, 50], pattern: 'drive', vel: 0.7, gain: 0.85, layer: 0 },
        { role: 'ostinato', voice: 'synth', range: [57, 79], template: 'silk', hit: 'pluck', vel: 0.5, gain: 0.7, pan: -0.25, layer: 0 },
        { role: 'melody', voice: 'synth', range: [66, 88], cells: 'lively', phrase: 4, vel: 0.85, gap: 0.06, gain: 1, pan: 0.1, layer: 0,
          also: [{ voice: 'croon', shift: -1, gain: 0.5, layer: 1 }] },
        { role: 'arp', voice: 'synth', range: [66, 90], step: 0.25, pattern: 'sparkle', skip: 0.3, hit: 'pluck', vel: 0.28, len: 1.1, gain: 0.6, pan: 0.3, layer: 1 },
        { role: 'beat', grid: 'hats16', vel: 0.45, gain: 0.6, pan: 0.15, layer: 1 },
        { role: 'beat', grid: 'fills', vel: 0.6, gain: 0.7, layer: 2 },
        { role: 'bell', voice: 'glock', range: [79, 102], p: 0.9, vel: 0.35, gain: 0.5, pan: -0.3, layer: 2 },
        { role: 'theme', motif: 'rawclaw', voice: 'synth', range: [66, 90], at: [3, 7, 11, 15], beat: 2.5, hit: 'pluck', vel: 0.5, gain: 0.7, layer: 2 },
        { role: 'stab', voice: 'synth', range: [54, 78], at: [0, 2.5], vel: 0.6, gain: 0.65, layer: 3 },
        { role: 'pad', voice: 'choir', range: [54, 76], voicing: 'full', vowel: 'a', vel: 0.4, gain: 0.7, layer: 3 },
      ] }],
    },
    boss3: {
      key: 48, scale: 'lydian', tempo: 140, bpb: 4, mood: 'cold perfect pop, chrome and glass and not one wrong note', xfade: 0.6, thresholds: TH_BOSS,
      quant: { swing: 0.06, human: 1, full: 1 },
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 1, 0, 4, 0, 1, 5, 4, 0, 1, 0, 4, 5, 1, 4, 0]), roles: [
        { role: 'pad', voice: 'pad', range: [45, 72], voicing: 'open', vel: 0.45, gain: 0.85, layer: 0 },
        { role: 'beat', grid: 'crisp', snare: 'pf', human: 0, vel: 0.9, gain: 1, layer: 0 },
        { role: 'ostinato', voice: 'keys', range: [52, 76], template: 'staccato', vel: 0.5, gain: 0.7, pan: -0.2, layer: 0 },
        { role: 'bass', voice: 'ebass', range: [33, 52], pattern: 'drive', human: 0, vel: 0.7, gain: 0.85, layer: 0 },
        { role: 'melody', voice: 'vox', range: [57, 76], cells: 'flow', phrase: 4, vel: 0.8, gap: 0.06, gain: 0.95, pan: 0.1, layer: 0, robot: true, human: 0, vowels: ['a', 'o', 'e', 'a', 'u', 'o'] },
        { role: 'arp', voice: 'glock', range: [76, 98], step: 0.25, pattern: 'rise', skip: 0.3, vel: 0.3, len: 1.1, gain: 0.6, pan: 0.3, layer: 1 },
        { role: 'beat', grid: 'hats16', human: 0, vel: 0.45, gain: 0.6, pan: 0.15, layer: 1 },
        { role: 'bell', voice: 'glock', range: [79, 102], p: 0.9, vel: 0.35, gain: 0.5, pan: -0.3, layer: 2 },
        { role: 'stab', voice: 'keys', range: [52, 74], at: [0, 1.5, 2.5], vel: 0.6, gain: 0.65, layer: 3 },
        { role: 'pad', voice: 'pad', range: [55, 84], voicing: 'full', vel: 0.4, gain: 0.8, layer: 3 },
      ] }],
    },
    // the Gloss's last form: four bars of the Gloss alone (dead on the grid), then RoxorLoops comes in, Jasmin sings the Human theme,
    // and the crowd sings along (in unison, then in thirds). The kick under the theme's high note lands a 32nd late.
    final: {
      key: 50, scale: 'major', tempo: 92, bpb: 4, mood: 'the Gloss fills the sky, one real voice, then two, then the whole crowd', xfade: 0.6, thresholds: TH_FINAL,
      quant: { swing: 0.12, human: 1.2, full: 0.5 },
      sections: [
        { id: 'intro', bars: 4, loop: false, grid: true, prog: [[0, 4]], roles: [
          { role: 'drone', voice: 'pad', range: [40, 62], tones: [0, 7], bars: 4, vel: 0.4, gain: 0.95, layer: 0 },
          { role: 'arp', voice: 'glock', range: [76, 95], step: 0.5, pattern: 'wave', even: true, human: 0, vel: 0.24, len: 1, gain: 0.55, pan: -0.25, layer: 0 },
          { role: 'melody', voice: 'vox', range: [57, 74], cells: 'flow', phrase: 4, vel: 0.6, gap: 0.06, gain: 0.9, pan: 0.1, layer: 0, robot: true, human: 0, vowels: ['o', 'a', 'e', 'o'] },
        ] },
        { id: 'loop', bars: 16, loop: true, prog: P1([0, 5, 3, 4, 0, 5, 3, 4, 0, 5, 3, 4, 0, 5, 3, 4]), roles: [
          { role: 'drone', voice: 'pad', range: [40, 62], tones: [0, 7], bars: 4, vel: 0.34, gain: 0.9, layer: 0, grid: true },
          { role: 'arp', voice: 'glock', range: [76, 95], step: 0.5, pattern: 'wave', even: true, human: 0, grid: true, vel: 0.2, len: 1, gain: 0.5, pan: -0.25, layer: 0 },
          { role: 'beat', grid: 'bootsCats', kick: 'boots', snare: 'cats', late: { bars: [2, 6, 10, 14], by: 0.125 }, vel: 0.75, gain: 0.9, layer: 1 },
          { role: 'bass', voice: 'throat', range: [33, 50], pattern: 'half', slide: true, vel: 0.62, gain: 0.85, layer: 1 },
          { role: 'theme', motif: 'human', voice: 'croon', range: [57, 79], at: [0, 4, 8, 12], vel: 0.82, gain: 1.1, pan: 0.05, layer: 2 },
          { role: 'pad', voice: 'keys', range: [50, 72], voicing: 'full', hit: 4, vel: 0.34, gain: 0.7, layer: 2 },
          { role: 'theme', motif: 'human', voice: 'choir', vowel: 'a', range: [50, 74], at: [8, 12], harm: [0, 2], vel: 0.55, gain: 0.8, layer: 3 },
          { role: 'arp', voice: 'glock', range: [74, 98], step: 0.5, pattern: 'sparkle', skip: 0.4, vel: 0.24, len: 1.2, gain: 0.5, pan: 0.3, layer: 3 },
        ] },
      ],
    },
    // ---- the Merch Stall, the Green Room, a Detour
    shop: {
      key: 60, scale: 'major', tempo: 108, bpb: 4, mood: 'cheeky and bouncy, ukulele, whistle and finger snaps', xfade: 1.2,
      sections: [{ id: 'loop', bars: 16, loop: true, prog: P1([0, 3, 4, 0, 0, 3, 1, 4, 0, 3, 4, 5, 3, 4, 0, 0]), roles: [
        { role: 'melody', voice: 'whistle', range: [74, 93], cells: 'lively', phrase: 4, vel: 0.82, gap: 0.06, gain: 1, pan: 0.1, also: [{ voice: 'glock', shift: 1, gain: 0.4 }] },
        { role: 'bass', voice: 'ebass', range: [36, 55], pattern: 'walk', vel: 0.6, gain: 0.8 },
        { role: 'beat', grid: 'shop', clap: 'snap', vel: 0.55, gain: 0.75 },
        { role: 'arp', voice: 'glock', range: [76, 98], step: 0.5, pattern: 'sparkle', skip: 0.6, vel: 0.28, len: 1, gain: 0.55, pan: -0.3 },
        { role: 'pad', voice: 'keys', range: [52, 72], voicing: 'open', hit: 4, vel: 0.3, gain: 0.7 },
      ] }],
    },
    camp: {
      key: 53, scale: 'major', tempo: 60, bpb: 3, mood: 'a backstage lullaby on warm keys with vinyl crackle', xfade: 2.5,
      sections: [{ id: 'loop', bars: 12, loop: true, prog: [[0, 3], [3, 3], [4, 3], [0, 3]], roles: [
        { role: 'melody', voice: 'keys', range: [60, 81], cells: 'lull', phrase: 4, form: ['A', 'B', 'a'], vel: 0.65, gain: 1, pan: 0.1 },
        { role: 'pad', voice: 'pad', range: [45, 72], voicing: 'full', vel: 0.36, gain: 0.9 },
        { role: 'arp', voice: 'glock', range: [77, 98], step: 1, pattern: 'pluck3', skip: 0.35, vel: 0.22, len: 1.5, gain: 0.55, pan: -0.3 },
        { role: 'crackle', voice: 'crackle', perBar: 3, kettle: true, vel: 0.5, gain: 0.8 },
        { role: 'bell', voice: 'glock', range: [79, 101], p: 0.35, perBlock: true, vel: 0.3, gain: 0.5, pan: 0.3 },
      ] }],
    },
    event: {
      key: 57, scale: 'dorian', tempo: 76, bpb: 4, mood: 'curious and sparse, finger clicks, a walking bass and a question in the tune', xfade: 2.5,
      sections: [{ id: 'loop', bars: 12, loop: true, prog: [[0, 4], [3, 2], [6, 2], [4, 2], [0, 2]], roles: [
        { role: 'drone', voice: 'pad', range: [43, 64], tones: [0, 7], bars: 4, vel: 0.42, gain: 0.95 },
        { role: 'melody', voice: 'croon', range: [62, 81], cells: 'sparse', phrase: 4, form: ['A', 'B', 'a'], cadRise: true, vel: 0.62, gap: 0.08, gain: 0.9, pan: 0.15 },
        { role: 'bell', voice: 'glock', range: [76, 100], p: 0.5, vel: 0.3, gain: 0.55, pan: -0.3 },
        { role: 'bass', voice: 'ebass', range: [36, 55], pattern: 'walk', every: 2, vel: 0.45, gain: 0.7 },
        { role: 'beat', grid: 'clicks', snapK: true, vel: 0.5, gain: 0.6, pan: 0.2 },
      ] }],
    },
    // ---- the goodie bag and the two stingers
    reward: {
      key: 62, scale: 'major', tempo: 120, bpb: 4, mood: 'a bright little fanfare loop, glockenspiel runs, claps and a beat', xfade: 0.4,
      sections: [{ id: 'loop', bars: 8, loop: true, prog: P1([0, 3, 4, 0, 5, 3, 4, 0]), roles: [
        { role: 'run', voice: 'glock', range: [74, 100], runs: [{ bar: 0, beat: 0, from: 0, to: 7, step: 0.25 }, { bar: 4, beat: 0, from: 2, to: 9, step: 0.25 }], vel: 0.5, gain: 0.7, pan: -0.2 },
        { role: 'melody', voice: 'whistle', range: [74, 93], cells: 'lively', phrase: 2, vel: 0.85, gap: 0.06, gain: 1, pan: 0.1, also: [{ voice: 'uke', shift: -1, gain: 0.5 }] },
        { role: 'pad', voice: 'keys', range: [52, 74], voicing: 'full', hit: 4, vel: 0.38, gain: 0.8 },
        { role: 'bass', voice: 'ebass', range: [36, 55], pattern: 'half', vel: 0.6, gain: 0.8 },
        { role: 'beat', grid: 'march', vel: 0.6, gain: 0.75 },
        { role: 'bell', voice: 'glock', range: [79, 103], p: 1, vel: 0.32, gain: 0.5, pan: 0.3 },
      ] }],
    },
    victory: {
      key: 50, scale: 'major', tempo: 92, bpb: 4, mood: 'the whole crowd sings the last line, then a warm loop', xfade: 0.15,
      sections: [
        { id: 'stinger', bars: 3, loop: false, prog: [[0, 1], [5, 1], [0, 1]], roles: [
          { role: 'theme', motif: 'human', voice: 'croon', range: [57, 79], at: [0], len: 2, vel: 0.85, gain: 1.1, pan: 0.05 },
          { role: 'theme', motif: 'human', voice: 'choir', vowel: 'a', range: [50, 74], at: [0], len: 2, vel: 0.6, gain: 0.8 },
          { role: 'run', voice: 'glock', range: [74, 100], runs: [{ bar: 2, beat: 0, from: 0, to: 9, step: 0.25 }], vel: 0.6, gain: 0.75, pan: -0.2 },
          { role: 'beat', grid: 'fanfare', vel: 0.75, gain: 0.85 },
          { role: 'pad', voice: 'keys', range: [50, 74], voicing: 'full', hit: 4, vel: 0.55, gain: 0.85 },
        ] },
        { id: 'loop', bars: 8, loop: true, prog: [[0, 1], [5, 1], [3, 1], [4, 1], [0, 1], [5, 1], [3, 1], [0, 1]], roles: [
          { role: 'pad', voice: 'keys', range: [50, 72], voicing: 'full', hit: 4, vel: 0.3, gain: 0.85 },
          { role: 'theme', motif: 'jasmin', voice: 'croon', range: [60, 81], at: [0, 4], vel: 0.45, gain: 0.9, pan: 0.1, also: [{ voice: 'glock', shift: 1, vel: 0.7, gain: 1 }] },
          { role: 'arp', voice: 'glock', range: [74, 98], step: 1, pattern: 'pluck3', skip: 0.5, vel: 0.2, len: 1.5, gain: 0.55, pan: -0.3 },
          { role: 'bell', voice: 'glock', range: [79, 101], p: 0.4, perBlock: true, vel: 0.24, gain: 0.5, pan: 0.3 },
        ] },
      ],
    },
    defeat: {
      key: 50, scale: 'dorian', tempo: 68, bpb: 4, mood: 'intermission, the lights go down and a music box keeps the tune', xfade: 0.15,
      sections: [
        { id: 'stinger', bars: 3, loop: false, prog: [[0, 1], [6, 1], [0, 1]], roles: [
          { role: 'melody', voice: 'keys', range: [57, 79], cells: 'long', phrase: 3, shape: 'fall', vel: 0.75, gain: 1, pan: 0.1 },
          { role: 'beat', grid: 'softKick', vel: 0.9, gain: 2 },
          { role: 'pad', voice: 'pad', range: [45, 72], voicing: 'open', vel: 0.42, gain: 0.9 },
          { role: 'bell', voice: 'glock', range: [74, 98], p: 1, perBlock: true, vel: 0.34, gain: 0.55, pan: -0.3 },
        ] },
        { id: 'loop', bars: 8, loop: true, prog: [[0, 4], [3, 2], [0, 2]], roles: [
          { role: 'theme', motif: 'jasmin', voice: 'glock', range: [74, 96], at: [0, 6], stretch: 2, vel: 0.32, gain: 0.7, pan: 0.15 },
          { role: 'crackle', voice: 'crackle', perBar: 3, vel: 0.4, gain: 0.7 },
          { role: 'drone', voice: 'pad', range: [43, 64], tones: [0, 7], bars: 4, vel: 0.3, gain: 0.85 },
        ] },
      ],
    },
  };

  // ---- measured mix trims: a linear gain for each track of each score, generated by tools/hocus_vocus/mix.mjs (A-weighted
  // loudness per role against a target per role type). Regenerate after changing a score.
  // MIX-BEGIN
  const MIX = {
    title: [0.271, 0.418, 0.267, 2.157, 1.371, 1.481, 0.545, 0.503],
    hero_select: [0.225, 0.539, 1.05, 1.195, 0.335, 1.325, 1.264, 0.412],
    map1: [0.323, 0.364, 1.45, 1.5, 0.277, 0.291, 1.015],
    map2: [0.328, 0.9, 0.858, 1.498, 1.841, 0.641],
    map3: [0.303, 0.512, 1.626, 0.725, 0.32],
    combat1: [0.959, 0.268, 0.986, 0.685, 1.063, 0.744, 3.4, 2.515, 0.418, 1.511, 1.53, 1.964, 0.583, 1.191, 0.539, 0.658],
    combat2: [0.655, 0.8, 0.859, 0.603, 1.907, 1.275, 3.12, 2.488, 0.414, 1.801, 1.926, 0.582, 0.978, 0.491, 0.67],
    combat3: [0.941, 0.232, 0.871, 0.604, 1.698, 0.825, 3.125, 2.355, 0.373, 1.446, 1.49, 0.582, 1.15, 0.497, 0.662],
    elite: [0.782, 0.662, 0.468, 0.464, 2.973, 1.543, 0.482, 1.116, 0.431, 0.358, 2.909, 0.557],
    boss1: [0.207, 0.468, 0.248, 1.218, 0.628, 0.208, 0.623, 0.462, 1.488, 0.951, 0.345, 0.777, 0.409, 0.529, 0.259],
    boss2: [0.306, 0.682, 0.202, 0.785, 0.565, 1.564, 0.318, 1.257, 1.171, 2.761, 1.507, 0.546, 0.998, 0.585, 1.49, 0.494, 0.4],
    boss3: [0.191, 0.634, 0.419, 0.432, 0.803, 1.231, 0.223, 0.367, 1.456, 0.36, 0.475, 0.154],
    final: [0.44, 0.9, 0.931, 0.6, 1.234, 1.197, 0.286, 1.317, 0.63, 0.293, 0.547, 1.395, 1.782, 1.009],
    shop: [0.191, 0.661, 1.129, 2.389, 0.348, 0.411, 0.358],
    camp: [1.487, 0.621, 2.102, 2.131, 1.479],
    event: [0.324, 0.711, 0.603, 2.58, 1.027],
    reward: [0.423, 0.205, 0.794, 0.251, 0.946, 1.356, 0.658, 0.474],
    victory: [0.461, 1.863, 0.822, 2.127, 0.869, 0.571, 0.869, 1.737, 1.831, 2.137, 1.807],
    defeat: [1.297, 1.189, 0.592, 1.157, 2.465, 2.831, 1.099],
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
  const NOTE_FLAGS = ['hit', 'vowel', 'robot'];
  function compose(id) {
    if (has(COMPOSED, id)) return COMPOSED[id];
    const T = has(TRACKS, id) ? TRACKS[id] : null;
    if (!T) return null;
    const tracks = [];
    let bars = 0, introBars = 0, loopBars = 0;
    T.sections.forEach((sec, si) => {
      const S = sectionCtx(T, sec);
      if (S.chordAt.length !== sec.bars) throw new Error('audio: progression of ' + id + '/' + sec.id + ' covers ' + S.chordAt.length + ' bars, wanted ' + sec.bars);
      const off = bars * T.bpb;
      sec.roles.forEach((R, ri) => {
        const rng = U.rng(U.hash('rb-audio', id, si, ri, R.role));
        const R2 = Object.assign({}, R, { range: (R.range || RANGES[R.voice || 'arp']).slice() }, sec.grid ? { grid: true, human: 0 } : null);
        const made = ROLES[R.role](rng, S, R2);
        const secEnd = off + sec.bars * T.bpb;
        made.forEach((tr) => {
          // nothing rings past the end of its section in the score itself (only the synthesised tail crosses the seam)
          const flags = tr.role === R.role ? NOTE_FLAGS.filter((k) => R[k] != null) : [];
          tr.notes = tr.notes.map((n) => {
            const x = Object.assign({}, n, { t: round3(n.t + off) });
            for (const k of flags) if (x[k] == null) x[k] = R[k] === true ? 1 : R[k];
            return x;
          }).map((n) => Object.assign(n, { dur: round3(Math.min(n.dur, secEnd - n.t)) })).filter((n) => n.dur >= 0.04);
          tr.section = sec.id;
          tracks.push(tr);
        });
      });
      bars += sec.bars;
      if (sec.loop) loopBars = sec.bars; else introBars += sec.bars;
    });
    const mix = has(MIX, id) ? MIX[id] : null;
    tracks.forEach((tr, i) => { if (mix && mix[i] != null) tr.gain = round3(tr.gain * mix[i]); });
    const layers = 1 + tracks.reduce((m, tr) => Math.max(m, tr.layer), 0);
    const bpb = T.bpb;
    const desc = {
      id, mood: T.mood, tempo: T.tempo, key: NOTE_NAMES[mod(T.key, 12)], tonic: T.key, scale: T.scale, scaleIntervals: SCALES[T.scale].slice(),
      beatsPerBar: bpb, bars, introBars, loopBars, beats: bars * bpb, introBeats: introBars * bpb, loopBeats: loopBars * bpb,
      seconds: round3(bars * bpb * 60 / T.tempo), loopSeconds: round3(loopBars * bpb * 60 / T.tempo),
      layers, thresholds: layers > 1 ? (T.thresholds || TH_COMBAT).slice(0, layers) : [0], xfade: T.xfade == null ? 1 : T.xfade,
      drive: T.drive || (layers > 1 ? 'intensity' : null), hush: T.hush ? { lo: T.hush.lo, floor: T.hush.floor } : null,
      swing: T.swing || 0, quant: T.quant ? { swing: T.quant.swing, human: T.quant.human, full: T.quant.full || 1 } : null,
      tracks,
    };
    COMPOSED[id] = deepFreeze(desc);
    return COMPOSED[id];
  }
  // the groove of a deck at drive value x: a quant track goes from dead on the grid (0) to its swing and human timing at `full`
  function groove(desc, x) {
    if (!desc.quant) return { swing: desc.swing || 0, human: 1 };
    const k = clamp((isNum(x) ? x : 0) / desc.quant.full, 0, 1);
    return { swing: desc.quant.swing * k, human: desc.quant.human * k };
  }

  // ==================================================================================================================
  // REVEAL: every hex of a map owns one note of the Act's hidden tune, so a chain, a Spell or a walk plays a phrase.
  // Pure and deterministic (seeded by the map seed and chapter), on the pentatonic subset of that Act's map key an octave up.
  // ==================================================================================================================
  // How each Spell sounds (HV_ART_AUDIO 10.7). Keys are DATA.brushes ids (save data: never renamed) plus 'single' (one hex or a
  // chain) and 'step' (a walk). deg: 'hex' every cell its own note, 'run' a rising run from the anchor's note, 'chord' offsets
  // (five-note degrees) above the anchor's note. The gesture flags are sung and spoken layers (never in lite mode).
  const SONGS = {
    single: { v: 'glock', byVerse: ['glock', 'synth', 'glock'], echoByVerse: [1, 1, 0.4], dur: 0.3, vel: 0.5, deg: 'hex', echo: 1 },
    step: { v: 'vox', vowel: 'm', dur: 0.14, vel: 0.18, deg: 'hex', echo: 0 },
    stroke: { v: 'glock', dur: 0.16, vel: 0.4, deg: 'hex', kit: ['boots', 'ts', 'cats', 'ts'], echo: 1 },
    wave: { v: 'croon', vowel: 'u', dur: 0.22, vel: 0.5, deg: 'run', dbl: 'glock', echo: 1 },
    fan: { v: 'synth', hit: 'pluck', dur: 0.34, vel: 0.55, deg: 'chord', offs: [0, 2, 4], horn: true, echo: 1 },
    splash: { v: 'glock', dur: 0.3, vel: 0.5, deg: 'chord', offs: [-5, 0, 2, 4, 5, 7, 9], abra: true, echo: 1 },
    halo: { v: 'choir', vowel: 'u', dur: 0.7, vel: 0.3, deg: 'chord', offs: [0, 2, 4, 5, 7, 9], circle: true, pad: true, echo: 0.6 },
    blot: { v: 'glock', dur: 0.6, vel: 0.56, deg: 'hex', tada: true, echo: 1 },
  };
  // five-note indices whose stacked chords hold no 1, 6 or 11 semitone interval, keyed by the scale's intervals (checked by test A12).
  // The two pentatonic scales have no semitone and no tritone at all, so every root is consonant.
  const CHORD_ROOTS = { '0,2,4,7,9': [0, 1, 2, 3, 4], '0,3,5,7,10': [0, 1, 2, 3, 4] };
  function snapRoot(root, sc) {
    const n = sc.length, ok = CHORD_ROOTS[sc.join(',')] || [0, 1, 2, 3, 4], i = mod(root, n);
    if (ok.indexOf(i) >= 0) return root;
    for (let d = 1; d < n; d++) {
      if (ok.indexOf(mod(i - d, n)) >= 0) return root - d;
      if (ok.indexOf(mod(i + d, n)) >= 0) return root + d;
    }
    return root;
  }
  const W_STEP = [[-2, 0.1], [-1, 0.36], [0, 0.08], [1, 0.36], [2, 0.1]];      // the hidden tune moves by step, now and then by a skip, never further
  const CONTOURS = new Map();
  function contour(seed, chapter, cols) {
    const key = seed + '|' + chapter + '|' + cols;
    let c = CONTOURS.get(key);
    if (c) return c;
    const rng = U.rng(U.hash('rb-echo', seed, chapter));
    c = [];
    let d = 2;
    for (let i = 0; i < cols; i++) {
      if (i > 0) {
        const pull = clamp((2 - d) * 0.15, -0.6, 0.6);
        d = clamp(d + rng.weighted(W_STEP.map((e) => [e[0], Math.max(0.02, e[1] * Math.exp(pull * Math.sign(e[0]) * 1.5))])), -2, 6);
      }
      c.push(d);
    }
    if (CONTOURS.size > 24) CONTOURS.clear();
    CONTOURS.set(key, c);
    return c;
  }
  // the key the reveal sings in: the Act's map tonic an octave up, on the pentatonic subset of the map track's scale
  function echoKey(chapter) {
    const d = compose('map' + clamp((chapter | 0) || 1, 1, 3));
    return { tonic: d.tonic + 12, sc: pentaOf(d.scale) };
  }
  const degToMidi = (k, d) => k.tonic + 12 * Math.floor(d / k.sc.length) + k.sc[mod(d, k.sc.length)];
  // info = {chapter, seed, cols, rows}: the map's own fields (M.chapter, M.seed, M.cols, M.rows)
  function hexNote(q, r, info) {
    const o = info || {}, rows = o.rows > 0 ? o.rows : 13, cols = o.cols > 0 ? o.cols : 21, ch = clamp((o.chapter | 0) || 1, 1, 3);
    const col = clamp(Math.round(q) + Math.floor(Math.round(r) / 2), 0, cols - 1);
    const lift = Math.round(((rows - 1) / 2 - r) / 3);
    const deg = clamp(contour((o.seed >>> 0) || 0, ch, cols)[col] + lift, DEG_LO, DEG_HI);
    return { deg, midi: degToMidi(echoKey(ch), deg) };
  }
  // the degrees a Spell's cells sing in reveal order (nearest the anchor first); null when every cell sings its own hexNote
  // chapter (optional): chord Spells snap their root to a consonant degree of that Act's scale (without it, no snap: test A4)
  function songDegrees(song, n, root, chapter) {
    const st = has(SONGS, song) ? SONGS[song] : null;
    if (!st || st.deg === 'hex') return null;
    const r0 = st.deg === 'chord' && chapter ? snapRoot(root, echoKey(chapter).sc) : root;
    const out = [];
    for (let i = 0; i < n; i++) out.push(clamp(st.deg === 'run' ? r0 + i : r0 + st.offs[Math.min(i, st.offs.length - 1)], DEG_LO - 10, DEG_HI + 12));
    return out;
  }
  // the degree AUDIO.wake will sing for this cell (the screens draw the same contour with it)
  function wakeDegree(q, r, o) {
    o = o || {};
    const own = hexNote(q, r, o).deg;
    if (o.aq == null || o.ar == null || !isNum(+o.aq) || !isNum(+o.ar)) return own;
    const i = Math.max(0, o.i | 0), list = songDegrees(o.song, i + 1, hexNote(+o.aq, +o.ar, o).deg, clamp((o.chapter | 0) || 1, 1, 3));
    return list ? list[i] : own;
  }

  // ==================================================================================================================
  // SOUND EFFECT RECIPES: plain data, one recipe per id of DATA.LISTS.sfx (HV_ART_AUDIO 10.8), plus per-hero variants keyed
  // `id.hero`. Layers are oscillators, filtered noise, FM bells and the same band the score uses. Times are seconds from the
  // start of the sound; g is linear gain.
  // ==================================================================================================================
  const O = (w, f, f2, t, d, g, x) => Object.assign({ k: 'osc', w, f, f2: f2 || 0, t, d, g }, x);
  const N = (n, t, d, g, ft, f, f2, q, x) => Object.assign({ k: 'noise', n, t, d, g, ft, f, f2: f2 || 0, q: q || 1 }, x);
  const FM = (f, ratio, idx, t, d, g, x) => Object.assign({ k: 'fm', f, ratio, idx, t, d, g }, x);
  const V = (v, m, t, d, vel, x) => Object.assign({ k: 'voice', v, m, t, d, vel }, x);
  const VOICE_TAIL = {
    kick: 0.45, snare: 0.2, hat: 0.16, throat: 0.12, scratch: 0.2, croon: 0.25, choir: 0.45, synth: 0.95, keys: 3.0, ebass: 1.4,
    glock: 1.7, uke: 1.2, whistle: 0.1, clap: 0.14, pad: 1.5, arp: 0.7, vox: 0.3, crackle: 0.05,
  };
  const SUSTAINED = { croon: true, choir: true, pad: true, vox: true, whistle: true };
  const SFX_FILTERS = ['lowpass', 'highpass', 'bandpass', 'notch'];
  const SFX_WAVES = ['sine', 'triangle', 'square', 'sawtooth'];

  // a scatter of tiny noise pops (sizzle, sparkle, crackle) from a fixed seed, so the recipe stays deterministic plain data
  function pops(seed, count, t0, span, g, lo, hi) {
    const r = U.rng(seed), out = [];
    for (let i = 0; i < count; i++) out.push(N('white', t0 + r() * span, 0.006 + r() * 0.014, g * (0.4 + 0.6 * r()), 'bandpass', lo + r() * (hi - lo), 0, 1.3, { a: 0.001 }));
    return out;
  }
  // a run of glock notes, or of any voice
  const run = (notes, t0, gap, dur, vel, v) => notes.map((m, i) => V(v || 'glock', m, t0 + i * gap, dur, vel));
  const shimmer = (t, d, g, lo, hi) => N('white', t, d, g, 'highpass', lo || 5000, hi || 8000, 0.8, { a: d * 0.4 });
  const swell = (t, d, g, lo, hi) => N('white', t, d, g, 'bandpass', lo || 300, hi || 1800, 0.8, { a: d * 0.55 });
  // a stage-light switch: a heavy thud, a switch click and a low knock
  const chunk = (t, g) => [N('pink', t, 0.06, 0.7 * g, 'lowpass', 900, 500, 0.8, { a: 0.001 }), N('white', t, 0.012, 0.5 * g, 'bandpass', 2500, 0, 1.3, { a: 0.001 }), O('sine', 90, 58, t, 0.13, 0.5 * g, { a: 0.001 })];
  // a mouth click (the tongue "tk")
  const click = (t, g, f) => N('white', t, 0.01, g, 'bandpass', f || 3500, 0, 1.8, { a: 0.0008 });

  // each entry: [vol, opts, layersFn]. opts: var (pitch cents), gainVar (dB), duck (ms), cd (cooldown ms), pri (0..3), pan, tune
  const SFX_DEFS = {
    // ---- interface: crisp, soft, short
    ui_click: [0.243, { var: 50, cd: 25, pri: 1 }, () => [click(0, 0.55), O('sine', 1400, 900, 0, 0.04, 0.32, { a: 0.001 }), O('triangle', 2800, 2200, 0, 0.022, 0.1, { a: 0.001 })]],
    ui_hover: [0.108, { var: 90, cd: 55, pri: 0 }, () => [N('white', 0, 0.03, 0.32, 'highpass', 6500, 0, 0.7, { a: 0.004 }), O('sine', 2600, 2300, 0, 0.025, 0.12, { a: 0.004 })]],
    ui_back: [0.186, { var: 40, cd: 40 }, () => [O('sine', 520, 260, 0, 0.09, 0.45, { a: 0.002 }), N('white', 0, 0.012, 0.35, 'bandpass', 1600, 0, 1.2, { a: 0.001 }), O('triangle', 780, 390, 0, 0.07, 0.12, { a: 0.002 })]],
    ui_error: [0.152, { var: 15, cd: 90 }, () => [V('vox', 57, 0, 0.12, 0.6, { vowel: 'u' }), V('vox', 55, 0.16, 0.16, 0.6, { vowel: 'u' }), N('pink', 0, 0.04, 0.15, 'lowpass', 400, 0, 1)]],
    ui_open: [0.409, { var: 40, cd: 60 }, () => [N('pink', 0, 0.14, 0.32, 'bandpass', 700, 3000, 1.3, { a: 0.05 }), V('glock', 91, 0.11, 0.2, 0.45)]],
    ui_close: [0.285, { var: 40, cd: 60 }, () => [N('pink', 0, 0.14, 0.3, 'bandpass', 2600, 600, 1.3, { a: 0.03 }), O('sine', 700, 350, 0.02, 0.12, 0.2, { a: 0.01 })]],
    ui_toggle: [0.273, { var: 40, cd: 45 }, () => [V('clap', 60, 0, 0.05, 0.7, { hit: 'snap' }), O('sine', 300, 220, 0, 0.03, 0.2, { a: 0.001 })]],
    // ---- cards
    card_draw: [0.221, { var: 90, cd: 30 }, () => [N('white', 0, 0.12, 0.4, 'highpass', 6000, 8000, 0.8, { a: 0.01 }), N('white', 0.01, 0.08, 0.15, 'bandpass', 3000, 5000, 0.9, { a: 0.02 })]],
    card_hover: [0.719, { var: 120, cd: 60, pri: 0 }, () => [N('pink', 0, 0.06, 0.4, 'bandpass', 1800, 2400, 1.1, { a: 0.015 })]],
    card_pick: [0.398, { var: 50, cd: 40 }, () => [click(0, 0.5), V('glock', 88, 0.01, 0.12, 0.4)]],
    card_play_attack: [0.173, { var: 60, duck: 180, cd: 30 }, () => [V('kick', 36, 0, 0.12, 0.85), V('snare', 55, 0.07, 0.12, 0.8, { hit: 'k' }), V('vox', 60, 0.08, 0.06, 0.5, { vowel: 'a' }), N('white', 0.05, 0.08, 0.15, 'highpass', 3000, 5000, 0.8, { a: 0.01 })]],
    card_play_skill: [0.587, { var: 40, cd: 30 }, () => [N('pink', 0, 0.22, 0.35, 'bandpass', 600, 2800, 1, { a: 0.08 })].concat(run([84, 88, 91], 0.05, 0.06, 0.2, 0.4))],
    card_play_power: [0.104, { var: 30, duck: 350, cd: 60, pri: 2 }, () => [V('throat', 40, 0, 0.45, 0.85, { bend: -7 }), V('choir', 62, 0.05, 0.5, 0.5, { vowel: 'a' }), V('choir', 69, 0.05, 0.5, 0.45, { vowel: 'a' }), V('glock', 93, 0.25, 0.3, 0.4), shimmer(0.2, 0.5, 0.12, 5000, 8000)]],
    card_discard: [1.381, { var: 80, cd: 25 }, () => [N('pink', 0, 0.09, 0.4, 'bandpass', 1400, 900, 1, { a: 0.006 }), N('white', 0, 0.01, 0.15, 'bandpass', 2200, 0, 1.5, { a: 0.001 })]],
    card_exhaust: [0.111, { var: 60, cd: 40 }, () => [N('white', 0, 0.45, 0.45, 'highpass', 3000, 5000, 0.8, { a: 0.25 })].concat(pops(41, 5, 0.3, 0.2, 0.22, 5000, 8000), [O('sine', 1200, 1800, 0, 0.4, 0.06, { a: 0.3 })])],
    shuffle: [0.569, { var: 40, cd: 120 }, () => [V('scratch', 62, 0, 0.13, 0.7), V('scratch', 65, 0.14, 0.13, 0.65), click(0.28, 0.3, 2600)]],
    // ---- turn flow
    swap: [0.28, { var: 40, cd: 60 }, () => [V('vox', 60, 0, 0.1, 0.5, { vowel: 'u', glide: 0.75 }), V('vox', 64, 0.1, 0.12, 0.45, { vowel: 'o', glide: 1.3 }), N('pink', 0, 0.2, 0.15, 'bandpass', 500, 2000, 1, { a: 0.06 })]],
    energy_gain: [0.479, { var: 40, cd: 60 }, () => [N('pink', 0, 0.18, 0.35, 'bandpass', 1200, 2600, 1.2, { a: 0.14 }), V('glock', 93, 0.17, 0.3, 0.55)]],
    turn_start: [0.441, { var: 20, duck: 250, cd: 200, pri: 2 }, () => [V('snare', 60, 0, 0.05, 0.6, { hit: 'k' }), V('snare', 61, 0.14, 0.05, 0.6, { hit: 'k' }), V('glock', 86, 0.28, 0.4, 0.5), V('glock', 93, 0.35, 0.5, 0.45)]],
    turn_end: [0.244, { var: 30, cd: 150 }, () => [V('vox', 57, 0, 0.35, 0.45, { vowel: 'm' }), V('kick', 38, 0, 0.15, 0.5)]],
    enemy_turn: [0.102, { var: 20, duck: 300, cd: 200, pri: 2 }, () => [V('throat', 38, 0, 0.16, 0.85), V('throat', 38, 0.2, 0.22, 0.9), N('pink', 0, 0.35, 0.16, 'bandpass', 200, 600, 1, { a: 0.3 })]],
    // ---- blows: light, heavy, crit and multi are clearly different
    hit_light: [0.314, { var: 90, cd: 20, pri: 2 }, () => [O('sine', 260, 110, 0, 0.09, 0.5, { a: 0.001 }), O('triangle', 480, 200, 0, 0.05, 0.25, { a: 0.001 }), N('white', 0, 0.05, 0.7, 'bandpass', 1900, 1100, 0.9, { a: 0.001 }), N('pink', 0, 0.04, 0.35, 'lowpass', 900, 0, 0.8, { a: 0.002 })]],
    hit_heavy: [0.209, { var: 70, duck: 260, pri: 3 }, () => [O('sine', 190, 45, 0, 0.34, 0.55, { a: 0.001 }), O('sawtooth', 110, 55, 0, 0.25, 0.3, { lp: { f: 700, f2: 250 }, a: 0.002 }), N('white', 0, 0.06, 0.85, 'bandpass', 2400, 900, 1, { a: 0.001 }), N('white', 0, 0.24, 0.55, 'lowpass', 1700, 400, 0.8, { a: 0.001 }), O('triangle', 330, 110, 0, 0.2, 0.4, { a: 0.001 }), N('pink', 0.03, 0.4, 0.2, 'lowpass', 700, 160, 0.7, { a: 0.01 })]],
    hit_crit: [0.274, { var: 40, duck: 350, pri: 3 }, () => [O('sine', 170, 45, 0, 0.36, 0.6, { a: 0.001 }), O('triangle', 360, 120, 0, 0.2, 0.4, { a: 0.001 }), N('white', 0, 0.2, 0.5, 'lowpass', 1800, 350, 0.8, { a: 0.001 }), N('white', 0, 0.05, 0.75, 'bandpass', 3000, 0, 1, { a: 0.001 }), FM(2400, 2.76, 3.5, 0, 0.5, 0.3), V('choir', 64, 0.08, 0.35, 0.45, { vowel: 'u' }), shimmer(0.02, 0.35, 0.14, 6000, 9000)]],
    hit_multi: [0.228, { var: 60, cd: 60, pri: 2 }, () => [0, 0.075, 0.15].reduce((acc, t, i) => acc.concat([click(t, 0.8, 3300 + i * 250), N('white', t + 0.004, 0.04, 0.3, 'highpass', 6000, 0, 0.7, { a: 0.002 }), O('sine', 220 + i * 30, 150, t, 0.05, 0.3, { a: 0.001 })]), [])],
    slash: [0.342, { var: 80, cd: 25 }, () => [N('white', 0, 0.14, 0.45, 'highpass', 1800, 5000, 0.8, { a: 0.008 }), V('croon', 69, 0.02, 0.12, 0.6, { vowel: 'a' }), N('white', 0.02, 0.1, 0.25, 'bandpass', 900, 600, 0.9, { a: 0.004 })]],
    thud: [0.272, { var: 60, cd: 40 }, () => [O('sine', 140, 52, 0, 0.24, 0.8, { a: 0.002 }), N('pink', 0, 0.14, 0.4, 'lowpass', 520, 160, 0.8, { a: 0.001 }), V('vox', 45, 0, 0.08, 0.3, { vowel: 'u' })]],
    zap: [0.243, { var: 60, cd: 40 }, () => [O('sawtooth', 140, 55, 0, 0.32, 0.45, { lp: { f: 900, f2: 200 }, vib: { r: 9, d: 80 }, a: 0.002 }), O('sine', 110, 45, 0, 0.3, 0.5, { vib: { r: 9, d: 60 }, a: 0.002 }), N('white', 0, 0.2, 0.12, 'highpass', 3000, 0, 0.7, { a: 0.002 })].concat(pops(71, 5, 0, 0.3, 0.25, 2500, 6000))],
    flame: [0.185, { var: 50, duck: 150, cd: 50 }, () => [N('white', 0, 0.5, 0.5, 'highpass', 4000, 6500, 0.8, { a: 0.06 }), N('white', 0.05, 0.4, 0.25, 'bandpass', 2500, 4000, 0.8, { a: 0.05 })].concat(pops(52, 6, 0.05, 0.4, 0.22, 2500, 5000))],
    ice: [0.346, { var: 60, cd: 50 }, () => [V('glock', 100, 0, 0.3, 0.55), FM(3136, 3.5, 2.0, 0, 0.4, 0.3), FM(4186, 3.5, 1.8, 0.04, 0.35, 0.22), FM(2637, 2.76, 2.0, 0.08, 0.32, 0.2), shimmer(0, 0.35, 0.14, 6500, 9500)]],
    poison_tick: [0.43, { var: 90, cd: 40 }, () => [V('vox', 72, 0, 0.07, 0.5, { vowel: 'a' }), V('vox', 72, 0.09, 0.07, 0.45, { vowel: 'a' }), V('vox', 69, 0.18, 0.09, 0.5, { vowel: 'a' })]],
    thorn: [0.438, { var: 80, cd: 40 }, () => [O('sine', 2800, 2900, 0, 0.12, 0.3, { a: 0.08 }), O('sine', 5600, 5800, 0, 0.1, 0.05, { a: 0.07 }), N('white', 0, 0.008, 0.4, 'bandpass', 2500, 0, 1.4, { a: 0.0008 })]],
    dodge: [0.797, { var: 80, cd: 50 }, () => [N('pink', 0, 0.07, 0.4, 'bandpass', 1200, 3200, 1.2, { a: 0.02 }), N('pink', 0.09, 0.07, 0.35, 'bandpass', 1400, 3600, 1.2, { a: 0.02 }), V('glock', 95, 0.15, 0.15, 0.4)]],
    // ---- defence
    block_gain: [0.242, { var: 40, cd: 40 }, () => [O('sine', 120, 80, 0, 0.2, 0.6, { a: 0.002 }), N('pink', 0, 0.06, 0.35, 'lowpass', 400, 0, 0.8, { a: 0.001 }), V('glock', 84, 0.03, 0.35, 0.45)]],
    block_hit: [0.336, { var: 50, cd: 30, pri: 2 }, () => [O('sine', 700, 350, 0, 0.09, 0.45, { a: 0.001 }), O('triangle', 1400, 700, 0, 0.05, 0.15, { a: 0.001 }), O('sine', 150, 90, 0, 0.12, 0.4, { a: 0.001 }), N('white', 0, 0.03, 0.3, 'bandpass', 1000, 0, 1.1, { a: 0.001 })]],
    block_break: [0.226, { var: 40, duck: 250, pri: 3 }, () => [O('sine', 400, 1600, 0, 0.05, 0.5, { a: 0.001 }), N('white', 0, 0.01, 0.5, 'bandpass', 1800, 0, 1.3, { a: 0.001 }), N('white', 0, 0.3, 0.5, 'highpass', 3000, 1500, 0.8, { a: 0.001 }), FM(2800, 3.4, 2.5, 0.02, 0.4, 0.2), FM(3520, 3.4, 2.5, 0.08, 0.35, 0.18)]],
    heal: [0.177, { var: 30, cd: 80 }, () => [V('choir', 62, 0, 0.6, 0.45, { vowel: 'a' }), V('choir', 66, 0, 0.6, 0.4, { vowel: 'a' }), V('choir', 69, 0, 0.6, 0.4, { vowel: 'a' })].concat(run([86, 90, 93, 98], 0.1, 0.07, 0.3, 0.35))],
    buff: [0.189, { var: 40, cd: 60 }, () => [N('white', 0, 0.3, 0.3, 'bandpass', 400, 2400, 0.9, { a: 0.25 }), O('sine', 440, 880, 0, 0.3, 0.15, { a: 0.2 }), V('vox', 64, 0.24, 0.2, 0.7, { syl: 'hey' })]],
    debuff: [0.18, { var: 40, cd: 60 }, () => [V('vox', 59, 0, 0.18, 0.5, { vowel: 'o' }), V('vox', 57, 0.24, 0.32, 0.5, { vowel: 'o', glide: 1.05 }), N('pink', 0, 0.3, 0.12, 'lowpass', 500, 200, 0.8, { a: 0.02 })]],
    stun: [0.321, { var: 30, duck: 200, cd: 100 }, () => [V('vox', 62, 0, 0.3, 0.6, { vowel: 'o', glide: 0.8 })].concat(run([96, 100, 98, 103], 0.1, 0.06, 0.15, 0.35))],
    // ---- falls and arrivals (nobody falls: a creature is won over, a hero loses their voice and gets it back)
    enemy_die: [0.433, { var: 60, duck: 200, pri: 3 }, () => [N('white', 0, 0.012, 0.6, 'bandpass', 1500, 0, 1.3, { a: 0.001 }), O('sine', 500, 1400, 0, 0.05, 0.45, { a: 0.001 }), V('vox', 72, 0.06, 0.18, 0.55, { vowel: 'e', glide: 0.9 })].concat(pops(81, 6, 0.08, 0.35, 0.22, 5000, 8000))],
    hero_down: [0.445, { var: 20, duck: 700, pri: 3 }, () => [V('croon', 64, 0, 0.55, 0.55, { vowel: 'u', bend: -4, crack: 1 }), N('pink', 0.6, 0.4, 0.2, 'bandpass', 1500, 0, 1, { a: 0.15 }), O('sine', 100, 50, 0, 0.4, 0.3, { a: 0.01 })]],
    hero_revive: [0.307, { var: 20, duck: 600, pri: 3 }, () => [V('croon', 62, 0, 0.5, 0.55, { vowel: 'a', bend: 5 }), V('throat', 38, 0, 0.4, 0.7, { bend: 12 })].concat(run([86, 90, 93, 98], 0.2, 0.08, 0.4, 0.4))],
    boss_die: [0.331, { var: 15, duck: 1400, pri: 3 }, () => [V('kick', 33, 0, 0.4, 1, { big: 1 }), N('white', 0, 2.0, 0.4, 'bandpass', 800, 1800, 0.8, { a: 0.4 }), N('white', 0.1, 1.0, 0.3, 'bandpass', 1600, 3000, 0.8, { a: 0.25 }), V('choir', 62, 0.1, 1.0, 0.5, { vowel: 'a' }), V('choir', 69, 0.1, 1.0, 0.45, { vowel: 'a' }), V('glock', 81, 0.35, 0.6, 0.55), V('glock', 83, 0.95, 0.4, 0.5), O('sine', 80, 35, 0, 0.9, 0.5, { a: 0.005 })]],
    boss_intro: [0.436, { var: 10, duck: 1600, pri: 3 }, () => chunk(0, 1).concat(chunk(0.28, 1), chunk(0.56, 1.1), [N('white', 0.6, 1.2, 0.25, 'bandpass', 300, 2500, 0.9, { a: 1.0 }), V('choir', 57, 1.2, 0.6, 0.5, { vowel: 'u' }), V('choir', 62, 1.2, 0.6, 0.45, { vowel: 'u' })])],
    phase_change: [0.233, { var: 10, duck: 900, pri: 3 }, () => [V('scratch', 60, 0, 0.3, 0.8), N('white', 0.2, 0.6, 0.45, 'bandpass', 300, 5000, 1.2, { a: 0.5 }), V('kick', 31, 0.8, 0.4, 1, { big: 1 }), O('sine', 80, 35, 0.8, 0.8, 0.5, { a: 0.003 })]],
    // ---- the map (ids are internal and kept: paint = one hex unmuted, ink_splash = a find, brush_* = Spells, ink_gain = Vox,
    // well = a Tea Stall, page_turn = a segue)
    paint: [0.135, { var: 50, cd: 60 }, () => [click(0, 0.4, 4000), V('vox', 67, 0.006, 0.14, 0.45, { vowel: 'a' }), V('glock', 91, 0.12, 0.25, 0.25)]],
    ink_splash: [0.297, { var: 40, cd: 50 }, () => [V('clap', 60, 0, 0.05, 0.6, { hit: 'snap' }), V('clap', 62, 0.12, 0.05, 0.55, { hit: 'snap' }), V('glock', 88, 0.26, 0.3, 0.42), V('glock', 93, 0.33, 0.4, 0.4)]],
    brush_pick: [0.399, { var: 30, cd: 60 }, () => [V('vox', 64, 0, 0.35, 0.4, { vowel: 'u', whisper: 1 })].concat(run([91, 88, 96], 0.12, 0.12, 0.3, 0.45))],
    brush_use: [0.098, { var: 30, cd: 80, duck: 250 }, () => [N('pink', 0, 0.22, 0.35, 'bandpass', 600, 1800, 2.5, { a: 0.18 }), V('vox', 64, 0.2, 0.08, 0.55, { syl: 'ab' }), V('vox', 67, 0.29, 0.1, 0.55, { syl: 'ra' }), V('kick', 36, 0.4, 0.2, 0.8)]],
    step: [0.34, { var: 120, cd: 70, pri: 0 }, () => [click(0, 0.4, 1800), N('pink', 0, 0.04, 0.35, 'lowpass', 600, 300, 0.8, { a: 0.002 })]],
    reveal_landmark: [0.209, { var: 20, duck: 500, pri: 2 }, () => chunk(0, 0.9).concat(run([86, 93, 98], 0.12, 0.08, 0.35, 0.4), [shimmer(0.1, 0.7, 0.12, 4500, 8000)])],
    ink_gain: [0.114, { var: 60, cd: 60 }, () => [V('vox', 62, 0, 0.18, 0.5, { vowel: 'u', glide: 0.85 }), V('vox', 62, 0.2, 0.18, 0.25, { vowel: 'u', glide: 0.85 }), V('vox', 62, 0.4, 0.18, 0.12, { vowel: 'u', glide: 0.85 })]],
    well: [0.285, { var: 12, cd: 300, duck: 600, pri: 2, tune: 55 }, () => [FM(2637, 2.76, 2.0, 0, 0.3, 0.3), FM(3520, 2.76, 1.8, 0.05, 0.25, 0.2), O('sine', 760, 784, 0.25, 1.6, 0.18, { a: 0.4, vib: { r: 5, d: 15 } }), N('white', 0.25, 1.4, 0.12, 'bandpass', 784, 0, 8, { a: 0.4 }), N('pink', 0.1, 0.6, 0.1, 'bandpass', 3500, 4200, 1.2, { a: 0.3 })]],
    // ---- the Merch Stall, Gift Boxes, Charms and gems
    gold: [0.172, { var: 120, cd: 40 }, () => [FM(2637, 2.76, 2.5, 0, 0.28, 0.4), FM(3520, 2.76, 2.2, 0.055, 0.3, 0.34), FM(3136, 2.76, 2.0, 0.11, 0.25, 0.22), N('white', 0, 0.01, 0.3, 'highpass', 6000, 0, 0.8, { a: 0.001 })]],
    buy: [0.492, { var: 40, cd: 80 }, () => [V('glock', 93, 0, 0.25, 0.5), V('glock', 98, 0.08, 0.3, 0.45), N('pink', 0, 0.18, 0.25, 'bandpass', 2500, 1500, 1, { a: 0.03 }), N('white', 0.05, 0.12, 0.1, 'highpass', 4000, 0, 0.8, { a: 0.01 })]],
    chest_open: [0.479, { var: 20, duck: 700, pri: 3 }, () => [N('white', 0, 0.25, 0.4, 'bandpass', 1500, 5000, 1.2, { a: 0.05 }), O('sine', 300, 900, 0.28, 0.05, 0.45, { a: 0.001 }), click(0.28, 0.5, 1800)].concat(run([86, 90, 93, 98], 0.38, 0.06, 0.5, 0.45), [shimmer(0.4, 0.8, 0.12, 5000, 8000)])],
    relic_get: [0.406, { var: 15, duck: 1000, pri: 3 }, () => [V('kick', 36, 0, 0.2, 0.7), V('vox', 67, 0.02, 0.3, 0.7, { syl: 'tada' })].concat(run([86, 90, 93, 98], 0.1, 0.1, 0.5, 0.45), [V('glock', 102, 0.5, 0.6, 0.5), swell(0, 0.8, 0.14, 300, 1600), shimmer(0.5, 0.9, 0.14, 5000, 8000)])],
    gem_socket: [0.141, { var: 30, cd: 60 }, () => [click(0, 0.5, 3200), V('clap', 60, 0.005, 0.05, 0.5, { hit: 'snap' }), FM(3136, 2.76, 2.2, 0.02, 0.3, 0.35), FM(4699, 2.76, 2.0, 0.08, 0.4, 0.3)]],
    gem_get: [0.263, { var: 30, cd: 80 }, () => run([93, 98, 100, 105], 0, 0.07, 0.3, 0.45).concat([FM(4186, 2.76, 2.0, 0.25, 0.35, 0.15), shimmer(0, 0.5, 0.12, 5500, 8500)])],
    forge_hit: [0.104, { var: 40, duck: 200, cd: 60, pri: 2 }, () => [V('kick', 36, 0, 0.2, 0.9), V('clap', 60, 0.005, 0.08, 0.8), N('pink', 0, 0.08, 0.3, 'lowpass', 1200, 0, 0.8, { a: 0.001 }), O('sine', 140, 70, 0, 0.16, 0.5, { a: 0.001 })]],
    upgrade: [0.492, { var: 20, duck: 600, pri: 3 }, () => [V('clap', 60, 0, 0.08, 0.6), O('sine', 150, 80, 0, 0.14, 0.4, { a: 0.001 })].concat(run([86, 90, 93, 98], 0.16, 0.08, 0.4, 0.45), [V('vox', 64, 0.45, 0.25, 0.45, { vowel: 'e', glide: 0.95 }), shimmer(0.2, 0.7, 0.14, 5000, 8500)])],
    // ---- the Green Room and Detours
    camp_fire: [0.327, { var: 30, cd: 200 }, () => pops(61, 12, 0, 0.85, 0.3, 1800, 5500).concat([N('pink', 0, 0.9, 0.18, 'bandpass', 3500, 4200, 2, { a: 0.3 }), N('white', 0, 0.9, 0.12, 'lowpass', 500, 200, 0.8, { a: 0.2 })])],
    rest: [0.15, { var: 20, duck: 900, pri: 2 }, () => [V('vox', 64, 0, 0.3, 0.4, { vowel: 'm' }), V('vox', 62, 0.35, 0.3, 0.4, { vowel: 'm' }), V('vox', 57, 0.7, 0.5, 0.4, { vowel: 'm' }), N('pink', 1.15, 0.25, 0.5, 'lowpass', 400, 150, 0.8, { a: 0.01 }), O('sine', 90, 50, 1.15, 0.2, 0.4, { a: 0.003 })]],
    event_open: [0.214, { var: 30, cd: 200 }, () => [V('vox', 57, 0, 0.3, 0.5, { vowel: 'm', glide: 0.92 })].concat(run([86, 88, 93], 0.32, 0.09, 0.4, 0.4))],
    choice: [0.426, { var: 40, cd: 60 }, () => [V('clap', 60, 0, 0.05, 0.6, { hit: 'snap' }), V('glock', 88, 0.02, 0.3, 0.45)]],
    page_turn: [0.354, { var: 30, cd: 120 }, () => [click(0, 0.6, 3000), N('white', 0.01, 0.04, 0.15, 'highpass', 5000, 0, 0.8, { a: 0.002 }), click(0.06, 0.5, 2200), V('snare', 60, 0.14, 0.05, 0.6, { hit: 'k' })]],
    // ---- fanfares and progress
    level_up: [0.236, { var: 15, duck: 800, pri: 3 }, () => [V('kick', 36, 0, 0.2, 0.7)].concat(run([86, 90, 93, 98], 0, 0.1, 0.5, 0.5), [V('vox', 67, 0.36, 0.3, 0.6, { vowel: 'e', glide: 0.9 }), shimmer(0.3, 0.9, 0.14, 5000, 8500)])],
    victory: [0.527, { var: 10, duck: 1500, pri: 3 }, () => [V('kick', 38, 0, 0.3, 0.8), N('white', 0, 1.4, 0.35, 'bandpass', 800, 2000, 0.8, { a: 0.3 })].concat(run([79, 83, 86, 91, 95], 0, 0.05, 0.4, 0.4), [V('croon', 69, 0.35, 0.7, 0.7, { vowel: 'a' }), V('croon', 71, 1.05, 0.4, 0.65, { vowel: 'a' })])],
    defeat: [0.605, { var: 10, duck: 1500, pri: 3 }, () => chunk(0, 1).concat([V('keys', 74, 0.25, 0.4, 0.45), V('keys', 72, 0.6, 0.4, 0.42), V('keys', 69, 0.95, 0.4, 0.4), V('keys', 62, 1.3, 0.9, 0.4), N('pink', 0.4, 0.8, 0.18, 'bandpass', 2000, 600, 1, { a: 0.3 })])],
    achievement: [0.786, { var: 15, duck: 800, pri: 3 }, () => [N('white', 0, 0.12, 0.35, 'bandpass', 2000, 5000, 1.2, { a: 0.08 }), N('pink', 0.16, 0.03, 0.5, 'lowpass', 900, 0, 0.8, { a: 0.001 }), O('sine', 180, 120, 0.16, 0.05, 0.3, { a: 0.001 }), V('glock', 93, 0.25, 0.4, 0.5), V('glock', 98, 0.32, 0.5, 0.45), shimmer(0.25, 0.6, 0.12, 5000, 8500)]],
    unlock: [0.554, { var: 20, pri: 2 }, () => [click(0, 0.5, 2800), V('glock', 86, 0.05, 0.12, 0.5), V('glock', 93, 0.15, 0.5, 0.55), FM(3136, 2.76, 2, 0.15, 0.4, 0.2), shimmer(0.1, 0.6, 0.12, 5000, 8000)]],
    save: [0.529, { var: 20, cd: 300, pri: 0 }, () => [click(0, 0.35, 3000), click(0.07, 0.3, 3000), V('glock', 93, 0.1, 0.2, 0.3)]],
  };
  // per-hero variants (HV_ART_AUDIO 10.8): [vol, layersFn]; AUDIO.sfx(id, {hero}) uses one when it exists, with the base id's cooldown,
  // priority and duck. Jasmin sings (croon), RoxorLoops beatboxes (the kit and vox syllables), RawClaw is the synth, Andy the bass.
  const SFX_VARIANTS = {
    'card_play_attack.hanae': [0.358, () => [V('croon', 62, 0, 0.09, 0.6, { vowel: 'a' }), V('croon', 66, 0.09, 0.09, 0.6, { vowel: 'a' }), V('croon', 69, 0.18, 0.18, 0.62, { vowel: 'a' }), V('glock', 93, 0.18, 0.3, 0.35), N('white', 0, 0.08, 0.12, 'highpass', 4000, 0, 0.8, { a: 0.01 })]],
    'card_play_attack.kuro': [0.159, () => [V('kick', 36, 0, 0.12, 0.9, { hit: 'boots' }), V('snare', 55, 0.08, 0.12, 0.85, { hit: 'k' }), click(0, 0.3, 1200)]],
    'card_play_attack.suzu': [0.244, () => [V('synth', 84, 0, 0.12, 0.7, { hit: 'zap' }), O('square', 2400, 600, 0, 0.1, 0.12, { a: 0.001 }), N('white', 0, 0.05, 0.15, 'highpass', 3000, 0, 0.8, { a: 0.002 })]],
    'card_play_attack.raiga': [0.147, () => [V('ebass', 36, 0, 0.2, 0.9, { hit: 'slap' }), click(0, 0.4, 2500), O('sine', 120, 60, 0, 0.1, 0.3, { a: 0.001 })]],
    'card_play_skill.hanae': [0.318, () => [V('croon', 66, 0, 0.35, 0.5, { vowel: 'u' }), V('choir', 62, 0, 0.35, 0.35, { vowel: 'u' }), V('choir', 69, 0, 0.35, 0.35, { vowel: 'u' })]],
    'card_play_skill.kuro': [0.217, () => [V('hat', 72, 0, 0.04, 0.55), V('hat', 72, 0.05, 0.04, 0.6), V('hat', 72, 0.1, 0.04, 0.65), V('hat', 72, 0.15, 0.04, 0.7), V('hat', 72, 0.2, 0.12, 0.6, { hit: 'open' })]],
    'card_play_skill.suzu': [0.429, () => [N('white', 0, 0.4, 0.35, 'bandpass', 300, 4000, 4, { a: 0.2 }), O('sawtooth', 220, 0, 0, 0.4, 0.2, { lp: { f: 300, f2: 4000 }, a: 0.1 }), N('white', 0.35, 0.5, 0.06, 'highpass', 3000, 0, 0.7, { a: 0.05 })]],
    'card_play_skill.raiga': [0.251, () => [V('ebass', 40, 0, 0.6, 0.7), V('vox', 52, 0.05, 0.5, 0.3, { vowel: 'm' })]],
    'card_play_power.hanae': [0.272, () => [V('croon', 62, 0, 0.5, 0.6, { vowel: 'a', bend: 5 }), shimmer(0.1, 0.6, 0.14, 5000, 8500), V('glock', 98, 0.4, 0.4, 0.4)]],
    'card_play_power.kuro': [0.118, () => [V('vox', 50, 0, 0.14, 0.7, { syl: 'boots' }), V('kick', 36, 0, 0.14, 0.85), V('vox', 55, 0.18, 0.12, 0.7, { syl: 'cats' }), V('snare', 55, 0.18, 0.12, 0.8, { hit: 'cats' }), V('throat', 40, 0.36, 0.4, 0.9, { bend: -7 })]],
    'card_play_power.suzu': [0.066, () => [V('synth', 60, 0, 0.4, 0.6, { hit: 'laser' }), N('white', 0, 0.4, 0.2, 'bandpass', 400, 4000, 1, { a: 0.35 }), O('sine', 70, 40, 0.42, 0.3, 0.6, { a: 0.002 }), V('kick', 31, 0.42, 0.3, 0.9)]],
    'card_play_power.raiga': [0.197, () => [V('ebass', 31, 0, 0.8, 0.8), O('sawtooth', 55, 0, 0, 0.8, 0.12, { lp: { f: 300 }, a: 0.3 }), O('sine', 110, 0, 0.05, 0.7, 0.08, { a: 0.3 }), N('pink', 0, 0.6, 0.1, 'lowpass', 200, 0, 0.8, { a: 0.3 })]],
    'swap.hanae': [0.615, () => [V('croon', 69, 0, 0.18, 0.55, { vowel: 'a' })]],
    'swap.kuro': [0.411, () => [V('snare', 55, 0, 0.1, 0.8, { hit: 'pf' })]],
    'swap.suzu': [0.573, () => [O('sawtooth', 330, 0, 0, 0.1, 0.3, { lp: { f: 400, f2: 3500 }, a: 0.003 }), O('sine', 660, 1320, 0, 0.06, 0.1, { a: 0.002 })]],
    'swap.raiga': [0.243, () => [V('ebass', 33, 0, 0.3, 0.75), V('vox', 45, 0, 0.18, 0.3, { vowel: 'o' })]],
    'hero_down.hanae': [0.534, () => [V('croon', 66, 0, 0.6, 0.5, { vowel: 'u', bend: -3, crack: 1 }), N('pink', 0.55, 0.5, 0.12, 'bandpass', 1500, 0, 1, { a: 0.2 })]],
    'hero_down.kuro': [0.351, () => [N('pink', 0, 0.6, 0.45, 'bandpass', 1400, 500, 1.2, { a: 0.01 }), O('sine', 200, 60, 0, 0.5, 0.25, { a: 0.002 }), V('kick', 36, 0, 0.15, 0.5)]],
    'hero_down.suzu': [0.568, () => [O('sawtooth', 440, 40, 0, 0.6, 0.25, { lp: { f: 3000, f2: 200 }, a: 0.003 }), O('square', 220, 25, 0, 0.6, 0.1, { a: 0.003 }), N('white', 0, 0.5, 0.1, 'lowpass', 2000, 150, 0.8, { a: 0.01 })]],
    'hero_down.raiga': [0.249, () => [V('ebass', 40, 0, 0.7, 0.8, { bend: -5 }), O('sine', 82, 60, 0, 0.7, 0.2, { a: 0.003 })]],
    'hero_revive.hanae': [1.17, () => [V('croon', 62, 0, 0.4, 0.55, { vowel: 'a', bend: 5 })].concat(run([93, 95, 93, 95, 93], 0.45, 0.05, 0.12, 0.35))],
    'hero_revive.kuro': [0.327, () => [V('vox', 50, 0, 0.14, 0.7, { syl: 'boots' }), V('kick', 36, 0, 0.14, 0.85), V('hat', 72, 0.15, 0.04, 0.6), V('vox', 55, 0.3, 0.12, 0.7, { syl: 'cats' }), V('snare', 55, 0.3, 0.12, 0.8, { hit: 'cats' }), V('hat', 72, 0.45, 0.04, 0.6)]],
    'hero_revive.suzu': [1.067, () => [O('sawtooth', 40, 440, 0, 0.5, 0.25, { lp: { f: 200, f2: 3000 }, a: 0.003 }), O('square', 25, 220, 0, 0.5, 0.1, { a: 0.003 }), N('white', 0, 0.5, 0.1, 'lowpass', 150, 2000, 0.8, { a: 0.01 })]],
    'hero_revive.raiga': [0.335, () => [V('ebass', 36, 0, 0.5, 0.85, { hit: 'slap', bend: 12 }), O('sine', 60, 120, 0, 0.4, 0.2, { a: 0.003 })]],
  };
  const VARIANT_KEYS = Object.keys(SFX_VARIANTS);

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
    ? L.t + (SUSTAINED[L.v] ? L.d + (VOICE_TAIL[L.v] || 0.3) : Math.min(VOICE_TAIL[L.v] || 0.5, Math.max(0.35, L.d * 2.2)))
    : L.t + L.d + 0.02);
  // a base id, or a variant key `id.hero` (the variant borrows the base's options)
  function rawRecipe(id) {
    if (typeof id !== 'string') return null;
    const isVar = has(SFX_VARIANTS, id);
    if (!isVar && !has(SFX_DEFS, id)) return null;
    if (!SFX_CACHE[id]) {
      const base = SFX_DEFS[isVar ? id.split('.')[0] : id];
      const o = base[1] || {};
      const layers = (isVar ? SFX_VARIANTS[id][1] : base[2])().map(finishLayer);
      SFX_CACHE[id] = {
        id, vol: isVar ? SFX_VARIANTS[id][0] : base[0], var: o.var == null ? 40 : o.var, gainVar: o.gainVar == null ? 1.2 : o.gainVar, pan: o.pan || 0,
        duck: o.duck || 0, cd: o.cd || 0, pri: o.pri == null ? 1 : o.pri, tune: o.tune || 0,
        dur: round3(layers.reduce((m, L) => Math.max(m, layerEnd(L)), 0)), layers,
      };
    }
    return SFX_CACHE[id];
  }
  function sfxRecipe(id) { const r = rawRecipe(id); return r ? U.deepCopy(r) : null; }

  // ==================================================================================================================
  // SYNTHESIS: every voice takes (ctx, out, t, note) for ANY BaseAudioContext, so an OfflineAudioContext renders exactly
  // what the game plays. note = {midi, dur (seconds), vel, r (0..1 random), hit, big, double, bend, vowel, syl, ...}.
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

  // harmonic tables (amplitude of harmonic 1, 2, 3 ...) for the plucked timbres
  const HARM = {
    uke: [0, 1, 0.75, 0.5, 0.32, 0.2, 0.12, 0.08, 0.05, 0.03],
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
  // Envelope gains start at 0, not at the node default of 1: a source may begin one sample before its first automation event
  // (float rounding of the start time), and that sample would otherwise play at full scale as a click.
  function decayEnv(p, t, peak, a, decay) {
    p.setValueAtTime(0, 0);
    p.setValueAtTime(EPS, t);
    p.linearRampToValueAtTime(Math.max(EPS * 2, peak), t + a);
    p.exponentialRampToValueAtTime(EPS, t + a + decay);
    return t + a + decay;
  }
  function holdEnv(p, t, peak, a, dur, rel) {
    p.setValueAtTime(0, 0);
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
  const oscAt = (ctx, type, f, t) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(clamp(f, 1, 22000), t); return o; };
  const gainOf = (ctx, v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  // a short filtered noise hit through its own decaying gain
  function voxNoise(ctx, out, t, dur, peak, type, f, q, kind, r) {
    const nz = noiseSrc(ctx, kind, t, dur, r), fl = filt(ctx, type, f, q), g = ctx.createGain();
    decayEnv(g.gain, t, peak, 0.001, Math.max(0.004, dur));
    nz.connect(fl); fl.connect(g); g.connect(out);
  }
  // a pitched sine thump: f0 falling to f1 over `fall` seconds, decaying over `decay`
  function thump(ctx, out, t, f0, f1, fall, peak, decay) {
    const o = oscAt(ctx, 'sine', f0, t), g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + fall);
    const end = decayEnv(g.gain, t, peak, 0.002, decay);
    o.connect(g); g.connect(out); go(o, t, end + 0.02);
  }

  // ---- the formant voice (vox, the beatbox syllables, the kick's "oo"): a sawtooth (plus a quiet square an octave down for body)
  // through two or three formant band-passes, a gentle vibrato and breath noise. 'm' is a closed-mouth hum.
  const FORMANTS = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2530], e: [400, 1700, 2600], m: [250, 0, 0] };
  const VOWEL_ALIAS = { oo: 'u', ah: 'a', mm: 'm' };
  const vowelOf = (x, dflt) => (has(FORMANTS, x) ? x : has(VOWEL_ALIAS, x) ? VOWEL_ALIAS[x] : dflt);
  const SYLLABLES = { boots: true, cats: true, ts: true, pf: true, k: true, bwaa: true, ab: true, ra: true, ca: true, tada: true, hey: true, boom: true };
  // one sung vowel; o = {glide: [from multiplier, seconds], detune: cents, a, rel, breath (0: none), vib (false: none, the robot),
  // whisper (formants over breath noise instead of a voice), buzz (a louder square: the air horn)}
  function voxVowel(ctx, out, t, f, dur, v, vowel, o) {
    o = o || {};
    const fm = FORMANTS[vowel] || FORMANTS.a, closed = fm === FORMANTS.m;
    const a = Math.min(o.a == null ? (closed ? 0.08 : 0.04) : o.a, Math.max(0.005, dur * 0.6)), rel = o.rel == null ? 0.12 : o.rel;
    const env = ctx.createGain(), end = holdEnv(env.gain, t, (closed ? 0.78 : 1.1) * v * (o.whisper ? 1.8 : 1), a, dur, rel);
    env.connect(out);
    const mix = gainOf(ctx, 1);
    if (o.whisper) {
      const nz = noiseSrc(ctx, 'pink', t, dur + rel, 0.41);
      nz.connect(mix);
    } else {
      const src = oscAt(ctx, 'sawtooth', f, t), low = oscAt(ctx, 'square', f * 0.5, t), lg = gainOf(ctx, o.buzz ? 0.4 : 0.14);
      if (o.glide) { src.frequency.setValueAtTime(f * o.glide[0], t); src.frequency.exponentialRampToValueAtTime(f, t + o.glide[1]); low.frequency.setValueAtTime(f * 0.5 * o.glide[0], t); low.frequency.exponentialRampToValueAtTime(f * 0.5, t + o.glide[1]); }
      if (o.detune) { src.detune.value = o.detune; low.detune.value = o.detune; }
      if (o.vib !== false) {                                        // vibrato: 0 -> 0.6 percent of the pitch over 0.3 s
        const lfo = oscAt(ctx, 'sine', 5.5, t), vg2 = ctx.createGain();
        vg2.gain.setValueAtTime(0, t); vg2.gain.linearRampToValueAtTime(f * 0.006, t + 0.3);
        lfo.connect(vg2); vg2.connect(src.frequency); vg2.connect(low.frequency);
        go(lfo, t, end + 0.05);
      }
      src.connect(mix); low.connect(lg); lg.connect(mix);
      go(src, t, end + 0.05); go(low, t, end + 0.05);
    }
    if (closed) {
      const lp = filt(ctx, 'lowpass', 400, 0.7), bp = filt(ctx, 'bandpass', 250, 4), bg = gainOf(ctx, 0.9);
      mix.connect(lp); lp.connect(env); mix.connect(bp); bp.connect(bg); bg.connect(env);
    } else {
      [1, 0.5, 0.25].forEach((gn, i) => {
        if (!fm[i]) return;
        const bp = filt(ctx, 'bandpass', fm[i], [6, 8, 10][i]), fg = gainOf(ctx, gn * 2.2);
        mix.connect(bp); bp.connect(fg); fg.connect(env);
      });
      if (o.breath !== 0 && !o.whisper) {                           // pink breath noise, band-passed at 1800 Hz, at 0.08 of the level
        const nz = noiseSrc(ctx, 'pink', t, dur + rel, 0.3), nb = filt(ctx, 'bandpass', 1800, 1.2), ng = gainOf(ctx, 0.08 * 2.2);
        nz.connect(nb); nb.connect(ng); ng.connect(env);
      }
    }
  }
  // vox: the spoken and sung syllables. n.vowel 'a' | 'o' | 'u' | 'e' | 'm' (or 'oo' 'ah' 'mm'); n.syl overrides it: the beatbox
  // 'boots' 'cats' 'ts' 'pf' 'k', the air horn 'bwaa', the sung 'ab' 'ra' 'ca' (abracadabass), 'tada', 'hey' and 'boom' (a beatbox
  // kick: a sine falling 150 -> 45 Hz). n.robot (the Gloss's lip-sync) removes vibrato and scoop and snaps the pitch; n.whisper
  // breathes it; n.glide starts that many times the pitch and slides to it. Unknown vowels and syllables fall back to 'a'.
  function vVox(ctx, out, t, n) {
    const robot = !!n.robot, midi = robot ? Math.round(n.midi) : n.midi;
    const f = mtof(midi), v = vg(n.vel), dur = Math.max(0.05, n.dur), syl = SYLLABLES[n.syl] === true ? n.syl : null;
    const r = n.r == null ? 0.5 : n.r, detune = isNum(n.detune) ? n.detune : 0;
    if (sampleSyllable(ctx, out, t, n, syl)) return;
    const base = { detune, whisper: !!n.whisper, vib: robot ? false : undefined };
    const vo = (x) => Object.assign({}, base, x);
    if (syl === 'boots') {
      voxNoise(ctx, out, t, 0.004, 0.55 * v, 'bandpass', 1200, 1.2, 'white', r);
      thump(ctx, out, t, 140, 60, 0.07, 0.5 * v, 0.1);
      voxVowel(ctx, out, t + 0.01, f, 0.11, v * 0.6, 'u', vo({ glide: [1.3, 0.04], rel: 0.05, breath: 0 }));
      voxNoise(ctx, out, t + 0.13, 0.05, 0.4 * v, 'highpass', 6500, 0.7, 'white', frac(r + 0.4));
    } else if (syl === 'cats') {
      voxNoise(ctx, out, t, 0.012, 0.9 * v, 'bandpass', 3500, 2, 'white', r);
      voxVowel(ctx, out, t + 0.012, f, 0.07, v * 0.6, 'a', vo({ a: 0.006, rel: 0.03, breath: 0 }));
      voxNoise(ctx, out, t + 0.09, 0.07, 0.5 * v, 'highpass', 7000, 0.7, 'white', frac(r + 0.6));
    } else if (syl === 'ts') {
      voxNoise(ctx, out, t, 0.06, 0.8 * v, 'highpass', 7000, 0.7, 'white', r);
    } else if (syl === 'pf') {
      voxNoise(ctx, out, t, 0.09, 0.85 * v, 'bandpass', 1400, 1.1, 'pink', r);
      thump(ctx, out, t, 210, 160, 0.05, 0.35 * v, 0.06);
    } else if (syl === 'k') {
      voxNoise(ctx, out, t, 0.012, 0.9 * v, 'bandpass', 3500, 2, 'white', r);
      voxNoise(ctx, out, t + 0.004, 0.035, 0.3 * v, 'highpass', 6000, 0.7, 'white', frac(r + 0.5));
    } else if (syl === 'bwaa') {
      voxNoise(ctx, out, t, 0.005, 0.5 * v, 'bandpass', 1000, 1, 'white', r);
      voxVowel(ctx, out, t, f * 0.9, dur, v * 0.85, 'a', vo({ glide: [1.25, dur * 0.8], a: 0.01, rel: 0.05, buzz: true }));
    } else if (syl === 'ab' || syl === 'ra' || syl === 'ca') {
      if (syl === 'ra') voxNoise(ctx, out, t, 0.012, 0.3 * v, 'bandpass', 1600, 2, 'white', r);
      if (syl === 'ca') voxNoise(ctx, out, t, 0.012, 0.8 * v, 'bandpass', 3500, 2, 'white', r);
      const d0 = syl === 'ab' ? Math.max(0.05, dur * 0.8) : dur;
      voxVowel(ctx, out, t + (syl === 'ab' ? 0 : 0.012), f, d0, v * 0.75, 'a', vo({ a: 0.01, rel: syl === 'ab' ? 0.02 : 0.08 }));
      if (syl === 'ab') voxNoise(ctx, out, t + d0, 0.004, 0.4 * v, 'bandpass', 1100, 1.2, 'white', frac(r + 0.2));
    } else if (syl === 'tada') {
      voxNoise(ctx, out, t, 0.008, 0.6 * v, 'bandpass', 4000, 1.5, 'white', r);
      voxVowel(ctx, out, t + 0.008, f, 0.1, v * 0.7, 'a', vo({ a: 0.008, rel: 0.03 }));
      voxNoise(ctx, out, t + 0.13, 0.006, 0.4 * v, 'bandpass', 2500, 1.4, 'white', frac(r + 0.3));
      voxVowel(ctx, out, t + 0.136, f * 1.335, Math.max(0.18, dur - 0.13), v * 0.8, 'a', vo({ a: 0.01 }));
    } else if (syl === 'hey') {
      voxNoise(ctx, out, t, 0.03, 0.5 * v, 'highpass', 2000, 0.8, 'pink', r);
      voxVowel(ctx, out, t + 0.03, f, Math.max(0.15, dur), v * 0.75, 'e', vo({ glide: [1.06, 0.12], a: 0.015 }));
    } else if (syl === 'boom') {
      thump(ctx, out, t, 150, 45, 0.25, 0.7 * v, 0.35);
      voxNoise(ctx, out, t, 0.004, 0.6 * v, 'highpass', 1500, 0.7, 'white', r);
    } else {
      const gl = isNum(n.glide) && n.glide > 0 && !robot ? [n.glide, Math.max(0.03, dur * 0.6)] : null;
      voxVowel(ctx, out, t, f, dur, v, vowelOf(n.vowel, 'a'), vo(gl ? { glide: gl } : null));
    }
  }

  // ---- the band: RoxorLoops (kick, snare, hat, throat, scratch)
  // kick: the beatbox "b", a sine dropping from about 160 Hz to the note over 60 ms, a 4 ms lip click and a touch of "u";
  // hit 'boots' adds the "oo" tail; big rings longer
  function vKick(ctx, out, t, n) {
    const v = vg(n.vel), r = n.r == null ? 0.5 : n.r;
    const fe = clamp(mtof(n.midi), 40, 160), f0 = Math.max(160, fe * 2.6), decay = n.big ? 0.45 : 0.28;
    thump(ctx, out, t, f0, fe, 0.06, 0.95 * v, decay);
    voxNoise(ctx, out, t, 0.004, 0.5 * v, 'bandpass', 1200, 1.2, 'white', r);
    const u = oscAt(ctx, 'sawtooth', fe * 2, t), uf = filt(ctx, 'bandpass', 350, 5), ug = ctx.createGain();
    const ue = decayEnv(ug.gain, t, 0.3 * v, 0.003, 0.04);
    u.connect(uf); uf.connect(ug); ug.connect(out); go(u, t, ue + 0.02);
    if (n.hit === 'boots') voxVowel(ctx, out, t + 0.03, fe * 2, 0.1, v * 0.35, 'u', { rel: 0.06, a: 0.02, breath: 0, vib: false });
  }
  // snare: hit 'pf' a lip snare (pink noise at 1.4 kHz with a 200 Hz body), 'k' a sharp click and a short hiss, 'cats' the "k" with
  // a short "a" and a "ts" tail
  function vSnare(ctx, out, t, n) {
    const v = vg(n.vel), r = n.r == null ? 0.5 : n.r, hit = n.hit === 'k' || n.hit === 'cats' ? n.hit : 'pf';
    if (hit === 'pf') {
      voxNoise(ctx, out, t, 0.09, 0.85 * v, 'bandpass', 1400, 1.1, 'pink', r);
      voxNoise(ctx, out, t, 0.004, 0.4 * v, 'bandpass', 2200, 1.4, 'white', frac(r + 0.3));
      thump(ctx, out, t, 210, 160, 0.05, 0.4 * v, 0.06);
      return;
    }
    voxNoise(ctx, out, t, 0.012, 0.9 * v, 'bandpass', 3500, 2, 'white', r);
    voxNoise(ctx, out, t + 0.004, 0.04, 0.35 * v, 'highpass', 6000, 0.7, 'white', frac(r + 0.5));
    if (hit === 'cats') {
      voxVowel(ctx, out, t + 0.012, clamp(mtof(n.midi), 120, 400), 0.05, v * 0.5, 'a', { a: 0.006, rel: 0.03, breath: 0, vib: false });
      voxNoise(ctx, out, t + 0.07, 0.07, 0.45 * v, 'highpass', 7000, 0.7, 'white', frac(r + 0.7));
    }
  }
  // hat: "ts", high-passed noise at 7 kHz, 25 ms; hit 'open' a 140 ms "tsss"
  function vHat(ctx, out, t, n) {
    const v = vg(n.vel), open = n.hit === 'open', r = n.r == null ? 0.5 : n.r;
    voxNoise(ctx, out, t, open ? 0.14 : 0.025, (open ? 0.5 : 0.6) * v, 'highpass', 7000, 0.7, 'white', r);
    if (open) voxNoise(ctx, out, t, 0.1, 0.18 * v, 'bandpass', 9500, 1.5, 'white', frac(r + 0.4));
  }
  // throat bass: a sawtooth and a sine an octave below through a 600 Hz low-pass and an "o" formant band at 450 Hz; above vel 0.7
  // a 28 Hz growl wobble; n.bend slides it (the throat-bass slide and drop)
  function vThroat(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel), dur = Math.max(0.06, n.dur), rel = 0.08;
    const env = ctx.createGain(), end = holdEnv(env.gain, t, 0.4 * v, 0.012, dur, rel);
    env.connect(out);
    const saw = oscAt(ctx, 'sawtooth', f, t), sub = oscAt(ctx, 'sine', f / 2, t), sg = gainOf(ctx, 0.9);
    if (isNum(n.bend) && n.bend) {
      const k = Math.pow(2, n.bend / 12), tb = t + Math.min(0.08, dur * 0.3);
      for (const [o, b] of [[saw, f], [sub, f / 2]]) { o.frequency.setValueAtTime(b, tb); o.frequency.exponentialRampToValueAtTime(clamp(b * k, 20, 20000), t + dur); }
    }
    const lp = filt(ctx, 'lowpass', 600, 0.9), fo = filt(ctx, 'bandpass', 450, 3), fg = gainOf(ctx, 1.4);
    let head = env;
    if (n.vel > 0.7) {
      const wob = gainOf(ctx, 0.72), lfo = oscAt(ctx, 'sine', 28, t), lg = gainOf(ctx, 0.28);
      lfo.connect(lg); lg.connect(wob.gain); wob.connect(env); head = wob;
      go(lfo, t, end + 0.03);
    }
    saw.connect(lp); sub.connect(sg); sg.connect(lp); lp.connect(head); saw.connect(fo); fo.connect(fg); fg.connect(head);
    go(saw, t, end + 0.03); go(sub, t, end + 0.03);
  }
  // scratch: a vocal "wikka", band-passed noise and a formant voice sweeping up (forward stroke) and back down; two strokes when long
  function vScratch(ctx, out, t, n) {
    const v = vg(n.vel), f = mtof(n.midi), r = n.r == null ? 0.5 : n.r, sl = 0.06, strokes = n.dur >= 0.24 || n.double ? 2 : 1;
    for (let s = 0; s < strokes; s++) {
      const t0 = t + s * sl * 2;
      const nz = noiseSrc(ctx, 'white', t0, sl * 2, frac(r + s * 0.37)), bp = filt(ctx, 'bandpass', 700, 4), g = ctx.createGain();
      bp.frequency.setValueAtTime(700, t0); bp.frequency.exponentialRampToValueAtTime(2600, t0 + sl); bp.frequency.exponentialRampToValueAtTime(800, t0 + sl * 2);
      decayEnv(g.gain, t0, 0.55 * v, 0.008, sl * 2);
      nz.connect(bp); bp.connect(g); g.connect(out);
      const o = oscAt(ctx, 'sawtooth', f, t0), fo = filt(ctx, 'bandpass', 1150, 5), og = ctx.createGain();
      o.frequency.exponentialRampToValueAtTime(f * 2.2, t0 + sl); o.frequency.exponentialRampToValueAtTime(f * 0.9, t0 + sl * 2);
      const oe = decayEnv(og.gain, t0, 0.7 * v, 0.006, sl * 2);
      o.connect(fo); fo.connect(og); og.connect(out); go(o, t0, oe + 0.02);
    }
  }
  // ---- Jasmin: croon, the soft sung lead. The formant voice on "oo", opening to "ah" on long notes; a 60 ms attack, a scoop up
  // from 30 cents flat (n.scoop), vibrato 5.2 Hz and 18 cents after 200 ms, a little breath. n.crack: the voice cracks on the high
  // note (a quick flip and a breath); n.bend slides the note. Her delay throw lives in the deck (CROON_FX) and the sfx send.
  function vCroon(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel), dur = Math.max(0.08, n.dur), a = Math.min(0.06, dur * 0.5), rel = 0.16;
    const env = ctx.createGain(), end = holdEnv(env.gain, t, 0.32 * v, a, dur, rel);
    env.connect(out);
    const sc = Math.pow(2, -(isNum(n.scoop) ? n.scoop : 30) / 1200);
    const src = oscAt(ctx, 'sawtooth', f * sc, t), fund = oscAt(ctx, 'sine', f * sc, t), fg = gainOf(ctx, 0.3), mix = gainOf(ctx, 1);
    const bend = isNum(n.bend) && n.bend ? Math.pow(2, n.bend / 12) : 1;
    for (const o of [src, fund]) {
      o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.09, dur * 0.5));
      if (n.crack) { o.frequency.setValueAtTime(f, t + 0.14); o.frequency.linearRampToValueAtTime(f * 1.042, t + 0.165); o.frequency.linearRampToValueAtTime(f, t + 0.21); }
      if (bend !== 1) { const tb = t + Math.max(n.crack ? 0.22 : 0.1, dur * 0.35); if (tb < t + dur) { o.frequency.setValueAtTime(f, tb); o.frequency.exponentialRampToValueAtTime(clamp(f * bend, 20, 20000), t + dur); } }
    }
    const lfo = oscAt(ctx, 'sine', 5.2, t), lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + 0.2); lg.gain.linearRampToValueAtTime(f * 0.0104, t + 0.45);
    lfo.connect(lg); lg.connect(src.frequency); lg.connect(fund.frequency);
    const v0 = vowelOf(n.vowel, 'u'), fm0 = FORMANTS[v0] === FORMANTS.m ? FORMANTS.u : FORMANTS[v0], open = v0 === 'u' && dur > 0.35;
    src.connect(mix);
    [1, 0.5, 0.25].forEach((gn, i) => {
      const bp = filt(ctx, 'bandpass', fm0[i], [6, 8, 10][i]), g2 = gainOf(ctx, gn * 2.2);
      if (open) { bp.frequency.setValueAtTime(fm0[i], t + 0.1); bp.frequency.linearRampToValueAtTime(FORMANTS.a[i], t + Math.min(0.6, dur * 0.7)); }
      mix.connect(bp); bp.connect(g2); g2.connect(env);
    });
    fund.connect(fg); fg.connect(env);
    const nz = noiseSrc(ctx, 'pink', t, dur + rel, n.r), nb = filt(ctx, 'bandpass', 1800, 1.2), ng = gainOf(ctx, 0.12);
    nz.connect(nb); nb.connect(ng); ng.connect(env);
    if (n.crack) voxNoise(ctx, out, t + 0.14, 0.14, 0.18 * v, 'bandpass', 2200, 1, 'pink', frac((n.r || 0) + 0.5));
    go(src, t, end + 0.05); go(fund, t, end + 0.05); go(lfo, t, end + 0.05);
  }
  // ---- the crowd: choir, three detuned "ah" voices (plus and minus 7 cents) through one set of formants, slow attack
  function vChoir(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel), dur = Math.max(0.2, n.dur), a = Math.min(0.3, dur * 0.45), rel = 0.35;
    const env = ctx.createGain(), end = holdEnv(env.gain, t, 0.55 * v, a, dur, rel);
    env.connect(out);
    const mix = gainOf(ctx, 0.5), lfo = oscAt(ctx, 'sine', 4.6, t), lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.004, t + 0.4);
    lfo.connect(lg);
    const oscs = [-7, 0, 7].map((c) => { const o = oscAt(ctx, 'sawtooth', f, t); o.detune.value = c; lg.connect(o.frequency); o.connect(mix); return o; });
    const fm = FORMANTS[vowelOf(n.vowel, 'a')];
    if (fm === FORMANTS.m) { const lp = filt(ctx, 'lowpass', 450, 0.7); mix.connect(lp); lp.connect(env); }
    else {
      [1, 0.5, 0.25].forEach((gn, i) => {
        const bp = filt(ctx, 'bandpass', fm[i], [5, 7, 9][i]), g2 = gainOf(ctx, gn * 2.4);
        mix.connect(bp); bp.connect(g2); g2.connect(env);
      });
    }
    for (const o of oscs) go(o, t, end + 0.05);
    go(lfo, t, end + 0.05);
  }
  // ---- RawClaw: synth, saw plus square, detuned, through a low-pass with an envelope sweep. hit 'pluck' decays like a pluck,
  // 'zap' adds a fast downward pitch sweep, 'laser' a rising one; otherwise it holds for the note
  function vSynth(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel), dur = Math.max(0.05, n.dur), hit = n.hit;
    const pluck = hit === 'pluck' || hit === 'zap' || hit === 'laser';
    const env = ctx.createGain();
    const end = pluck ? decayEnv(env.gain, t, 0.42 * v, 0.003, Math.min(0.9, Math.max(0.16, dur * 1.6))) : holdEnv(env.gain, t, 0.32 * v, 0.008, dur, 0.12);
    env.connect(out);
    const f0 = hit === 'zap' ? f * 4 : hit === 'laser' ? f * 0.5 : f;
    const a = oscAt(ctx, 'sawtooth', f0, t), b = oscAt(ctx, 'square', f0, t), bg = gainOf(ctx, 0.45);
    a.detune.value = -7; b.detune.value = 7;
    if (hit === 'zap' || hit === 'laser') {
      const f1 = hit === 'zap' ? f : f * 2, te = t + (hit === 'zap' ? 0.09 : Math.min(0.3, dur));
      a.frequency.exponentialRampToValueAtTime(clamp(f1, 20, 20000), te); b.frequency.exponentialRampToValueAtTime(clamp(f1, 20, 20000), te);
    }
    const fc = Math.min(f * 12, 9000), lp = filt(ctx, 'lowpass', fc, 1.4);
    lp.frequency.setValueAtTime(fc, t); lp.frequency.exponentialRampToValueAtTime(Math.max(f * (pluck ? 2 : 4), 400), t + Math.min(0.4, dur * 0.8 + 0.08));
    a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(env);
    go(a, t, end + 0.03); go(b, t, end + 0.03);
  }
  // ---- warm chords: keys, an electric-piano tine (FM ratio 1, index 1.4 decaying) over a sine body, a little tine and a slow tremolo
  function vKeys(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel), dur = Math.max(0.08, n.dur);
    const decay = Math.min(clamp(2.6 * Math.pow(220 / f, 0.3), 0.8, 3.2), Math.max(0.45, dur * 1.4 + 0.3));
    const g = ctx.createGain(), end = decayEnv(g.gain, t, 0.38 * v, 0.003, decay);
    const trem = gainOf(ctx, 0.88), lfo = oscAt(ctx, 'sine', 4.2, t), lg = gainOf(ctx, 0.12);
    lfo.connect(lg); lg.connect(trem.gain); g.connect(trem); trem.connect(out);
    const car = oscAt(ctx, 'sine', f, t), md = oscAt(ctx, 'sine', f, t), mg = ctx.createGain();
    mg.gain.setValueAtTime(1.4 * f, t); mg.gain.exponentialRampToValueAtTime(Math.max(0.05 * f, 1), t + Math.min(0.6, decay * 0.4));
    md.connect(mg); mg.connect(car.frequency); car.connect(g);
    const body = oscAt(ctx, 'sine', f, t), bg = gainOf(ctx, 0.6);
    body.connect(bg); bg.connect(g);
    const tine = oscAt(ctx, 'sine', Math.min(f * 7, 16000), t), tg = ctx.createGain();
    const te = decayEnv(tg.gain, t, 0.05 * v, 0.001, 0.09);
    tine.connect(tg); tg.connect(out);
    go(car, t, end + 0.03); go(md, t, end + 0.03); go(body, t, end + 0.03); go(lfo, t, end + 0.03); go(tine, t, te + 0.02);
  }
  // ---- Andy: ebass, an electric bass, triangle plus saw through a 900 Hz low-pass envelope and a pluck; hit 'slap' adds a thumb
  // click and an octave pop, 'pop' a bright string snap; n.bend slides it
  function vEbass(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel), dur = Math.max(0.06, n.dur), slap = n.hit === 'slap', pop = n.hit === 'pop', r = n.r == null ? 0.5 : n.r;
    const decay = Math.min(clamp(1.3 * Math.pow(110 / f, 0.25), 0.4, 1.6), Math.max(0.22, dur * 1.5));
    const tri = oscAt(ctx, 'triangle', f, t), saw = oscAt(ctx, 'sawtooth', f, t), sg = gainOf(ctx, slap || pop ? 0.6 : 0.35);
    if (isNum(n.bend) && n.bend) {
      const k2 = Math.pow(2, n.bend / 12), tb = t + Math.min(0.06, dur * 0.3), te = Math.max(tb + 0.05, t + Math.min(dur, 0.35));
      for (const o of [tri, saw]) { o.frequency.setValueAtTime(f, tb); o.frequency.exponentialRampToValueAtTime(clamp(f * k2, 20, 20000), te); }
    }
    const f1 = slap || pop ? 2600 : 900, lp = filt(ctx, 'lowpass', f1, 1.1);
    lp.frequency.setValueAtTime(f1, t); lp.frequency.exponentialRampToValueAtTime(Math.max(f * 2.2, 220), t + decay * 0.5);
    const g = ctx.createGain(), end = decayEnv(g.gain, t, 0.72 * v, 0.004, decay);
    tri.connect(lp); saw.connect(sg); sg.connect(lp); lp.connect(g); g.connect(out);
    go(tri, t, end + 0.03); go(saw, t, end + 0.03);
    voxNoise(ctx, out, t, 0.02, 0.22 * v, 'bandpass', 900, 1, 'white', r);
    if (slap) {
      voxNoise(ctx, out, t, 0.008, 0.6 * v, 'bandpass', 2500, 1.4, 'white', frac(r + 0.3));
      thump(ctx, out, t, f * 2, f * 2, 0.01, 0.28 * v, 0.12);
    }
    if (pop) voxNoise(ctx, out, t, 0.006, 0.5 * v, 'bandpass', 3200, 1.4, 'white', frac(r + 0.6));
  }
  // ---- sparkle: glock, a short bright FM bell (ratio 3.5) with a tiny strike
  function vGlock(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel);
    const decay = Math.min(clamp(1.3 * Math.pow(880 / f, 0.3), 0.45, 1.6), Math.max(0.35, n.dur * 2.5));
    const car = oscAt(ctx, 'sine', f, t), md = oscAt(ctx, 'sine', Math.min(f * 3.5, 20000), t), mg = ctx.createGain(), g = ctx.createGain(), hp = filt(ctx, 'highpass', 300, 0.7);
    mg.gain.setValueAtTime(1.6 * f, t); mg.gain.exponentialRampToValueAtTime(Math.max(0.04 * f, 1), t + decay * 0.3);
    md.connect(mg); mg.connect(car.frequency);
    const end = decayEnv(g.gain, t, 0.3 * v, 0.001, decay);
    car.connect(g); g.connect(hp); hp.connect(out);
    go(car, t, end + 0.03); go(md, t, end + 0.03);
    voxNoise(ctx, out, t, 0.004, 0.1 * v, 'highpass', 5000, 0.7, 'white', n.r);
  }
  // ---- Blossom Bay: uke, a damped plucked string, bright and short
  function vUke(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel);
    const decay = Math.min(clamp(0.95 * Math.pow(330 / f, 0.3), 0.35, 1.1), Math.max(0.28, n.dur * 1.8));
    const fc = Math.min(f * 9, 9000), fl = filt(ctx, 'lowpass', fc, 0.9);
    fl.frequency.setValueAtTime(fc, t); fl.frequency.exponentialRampToValueAtTime(Math.max(f * 2.2, 500), t + decay * 0.5);
    const g = ctx.createGain(), end = decayEnv(g.gain, t, 0.45 * v, 0.002, decay);
    const o1 = ctx.createOscillator();
    setWave(o1, ctx, 'uke');
    o1.frequency.setValueAtTime(clamp(f * 1.008, 1, 22000), t); o1.frequency.exponentialRampToValueAtTime(clamp(f, 1, 22000), t + 0.025);
    o1.connect(fl); fl.connect(g); g.connect(out);
    go(o1, t, end + 0.04);
    voxNoise(ctx, out, t, 0.02, 0.12 * v, 'bandpass', 3200, 1.2, 'white', n.r);
  }
  // ---- the Act I hook: whistle, a sine with breath noise and a light vibrato
  function vWhistle(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel), dur = Math.max(0.06, n.dur), a = Math.min(0.035, dur * 0.3), rel = 0.07;
    const env = ctx.createGain(), end = holdEnv(env.gain, t, 0.34 * v, a, dur, rel);
    env.connect(out);
    const o1 = oscAt(ctx, 'sine', f * 0.985, t), o2 = oscAt(ctx, 'sine', Math.min(f * 2 * 0.985, 20000), t), g2 = gainOf(ctx, 0.06);
    o1.frequency.exponentialRampToValueAtTime(f, t + 0.05); o2.frequency.exponentialRampToValueAtTime(Math.min(f * 2, 20000), t + 0.05);
    const lfo = oscAt(ctx, 'sine', 5.6, t), lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + Math.min(0.15, dur * 0.5)); lg.gain.linearRampToValueAtTime(f * 0.0045, t + Math.min(0.4, dur * 0.8 + 0.05));
    lfo.connect(lg); lg.connect(o1.frequency);
    o1.connect(env); o2.connect(g2); g2.connect(env);
    const nz = noiseSrc(ctx, 'pink', t, dur + rel, n.r), bp = filt(ctx, 'bandpass', Math.min(f, 9000), 6), ng = gainOf(ctx, 0.5);
    nz.connect(bp); bp.connect(ng); ng.connect(env);
    go(o1, t, end + 0.03); go(o2, t, end + 0.03); go(lfo, t, end + 0.03);
  }
  // ---- hands: clap, three noise bursts 10 ms apart band-passed at 1.2 kHz with a short room; hit 'snap' is a finger snap
  function vClap(ctx, out, t, n) {
    const v = vg(n.vel), r = n.r == null ? 0.5 : n.r;
    if (n.hit === 'snap') {
      voxNoise(ctx, out, t, 0.012, 0.9 * v, 'bandpass', 2600, 1.6, 'white', r);
      thump(ctx, out, t, 1900, 1300, 0.02, 0.25 * v, 0.03);
      return;
    }
    [0, 0.01, 0.021].forEach((d, i) => voxNoise(ctx, out, t + d, 0.011, (0.75 - 0.12 * i) * v, 'bandpass', 1200, 1.1, 'white', frac(r + i * 0.29)));
    voxNoise(ctx, out, t + 0.028, 0.09, 0.32 * v, 'bandpass', 1300, 0.8, 'white', frac(r + 0.9));
  }
  // ---- kept: pad (detuned saws through a low-pass), arp (the generic pluck, lite mode's voice), crackle (vinyl pops, and a soft
  // kettle hiss with hit 'hiss')
  function vArp(ctx, out, t, n) {
    const f = mtof(n.midi), v = vg(n.vel);
    const decay = Math.min(0.6, Math.max(0.3, n.dur * 2));
    const o = ctx.createOscillator(), fl = filt(ctx, 'lowpass', 5500, 0.7), g = ctx.createGain();
    setWave(o, ctx, 'arp', 'sine');
    o.frequency.setValueAtTime(clamp(f, 1, 22000), t);
    const end = decayEnv(g.gain, t, 0.5 * v, 0.002, decay);
    o.connect(fl); fl.connect(g); g.connect(out);
    go(o, t, end + 0.03);
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
    if (n.hit === 'hiss') {
      const dur = Math.max(0.3, n.dur), nz = noiseSrc(ctx, 'pink', t, dur + 0.3, r), bp = filt(ctx, 'bandpass', 3800, 2), g = ctx.createGain();
      holdEnv(g.gain, t, 0.12 * v, dur * 0.5, dur, 0.3);
      nz.connect(bp); bp.connect(g); g.connect(out);
      return;
    }
    const nz = noiseSrc(ctx, 'white', t, 0.03, r), bp = filt(ctx, 'bandpass', 900 + r * 4500, 1.1), hp = filt(ctx, 'highpass', 700, 0.7), g = ctx.createGain();
    decayEnv(g.gain, t, 0.5 * v, 0.0008, 0.012 + r * 0.02);
    nz.connect(bp); bp.connect(hp); hp.connect(g); g.connect(out);
  }
  const VOICES = {
    kick: vKick, snare: vSnare, hat: vHat, throat: vThroat, scratch: vScratch, croon: vCroon, choir: vChoir, synth: vSynth, keys: vKeys,
    ebass: vEbass, glock: vGlock, uke: vUke, whistle: vWhistle, clap: vClap, pad: vPad, arp: vArp, vox: vVox, crackle: vCrackle,
  };
  // per-voice loudness trim for the score, measured with A-weighted loudness so a note at the same velocity is about equally loud on
  // every instrument (the sfx recipes were balanced against the raw voices and do not use it)
  const TRIM = {
    kick: 0.5, snare: 1.6, hat: 2, throat: 0.8, scratch: 3, croon: 1.05, choir: 0.4, synth: 0.8, keys: 1.1, ebass: 0.8, glock: 1.5, uke: 1.5,
    whistle: 0.67, clap: 4, pad: 1.9, arp: 0.99, vox: 0.5, crackle: 4,
  };
  // small timing looseness per instrument (seconds, peak to peak) so a loop never sounds machine-perfect (the Gloss's parts set 0)
  const HUMAN = {
    kick: 0.006, snare: 0.008, hat: 0.006, throat: 0.01, scratch: 0.01, croon: 0.022, choir: 0.03, synth: 0.006, keys: 0.012,
    ebass: 0.01, glock: 0.008, uke: 0.012, whistle: 0.016, clap: 0.008, pad: 0.03, arp: 0.01, vox: 0.015, crackle: 0,
  };

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
  const VOICE_FIELDS = ['hit', 'big', 'double', 'bend', 'vowel', 'syl', 'glide', 'robot', 'whisper', 'scoop', 'crack', 'detune'];
  // o = {pitch, vol, pan, seed, echo (a node: Jasmin's croon layers throw into it)}
  function playRecipe(ctx, dest, R, t0, o) {
    o = o || {};
    const pitch = o.pitch || 1, rr = U.rng(((o.seed == null ? 1 : o.seed) >>> 0) || 1);
    const bus = ctx.createGain();
    bus.gain.value = R.vol * (o.vol == null ? 1 : o.vol);
    let head = bus;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); bus.connect(p); head = p; }
    head.connect(dest);
    if (o.echo && R.layers.some((L) => L.v === 'croon')) { const send = gainOf(ctx, CROON_FX.send); head.connect(send); send.connect(o.echo); }
    const semis = 12 * Math.log(pitch) / Math.LN2;
    for (const L of R.layers) {
      const t = t0 + L.t, r = rr();
      if (L.k === 'voice') {
        const nn = { midi: L.m + semis, dur: L.d, vel: L.vel, r };
        for (const k of VOICE_FIELDS) if (L[k] != null) nn[k] = L[k];
        VOICES[L.v](ctx, bus, t, nn);
      } else if (L.k === 'osc') layerOsc(ctx, bus, t, L, pitch, r);
      else if (L.k === 'noise') layerNoise(ctx, bus, t, L, pitch, r);
      else if (L.k === 'fm') layerFm(ctx, bus, t, L, pitch, r);
    }
    return t0 + R.dur;
  }

  // ---- the master chain: [music bus -> duck] and [sfx bus] -> master -> glue -> limiter -> soft clip -> out, plus a small hall
  const taper = (v) => Math.pow(clamp(v, 0, 1), TAPER);
  // Unity gain below the knee, then a tanh shoulder that saturates towards the ceiling. The shaper sits between a x0.5 and a x2
  // gain, so its curve (defined on -1..1) describes the signal range -2..+2: an overshoot is squeezed, not chopped at full scale.
  function softClipCurve() {
    const n = 2049, c = new Float32Array(n), knee = 0.6, ceil = 0.98;
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * 2, a = Math.abs(x);
      c[i] = Math.sign(x) * (a <= knee ? a : knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee))) / 2;
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
    if (g.shaper) { g.clipIn = link(gainOf(ctx, 0.5)); link(g.shaper); g.clipOut = link(gainOf(ctx, 2)); }
    g.out = gainOf(ctx, 0.92);
    link(g.out); g.out.connect(ctx.destination);
    g.musicBus = ctx.createGain(); g.duck = gainOf(ctx, 1); g.musicOut = gainOf(ctx, 1);
    // the score is high-passed below 55 Hz (nothing there is audible, it only eats headroom) and given a gentle shelf for clarity
    let mh = g.musicBus;
    g.musicHp = opt(() => filt(ctx, 'highpass', 55, 0.7));
    if (g.musicHp) { mh.connect(g.musicHp); mh = g.musicHp; }
    g.musicShelf = opt(() => { const f = filt(ctx, 'highshelf', 3000, 0.7); f.gain.value = 2.5; return f; });
    if (g.musicShelf) { mh.connect(g.musicShelf); mh = g.musicShelf; }
    mh.connect(g.duck); g.duck.connect(g.musicOut); g.musicOut.connect(g.master);
    g.sfxBus = ctx.createGain(); g.sfxBus.connect(g.master);
    g.verb = null;
    try {
      g.verb = ctx.createConvolver(); g.verb.buffer = impulse(ctx);
      const hp = filt(ctx, 'highpass', 220, 0.7), lp = filt(ctx, 'lowpass', 4500, 0.7), ret = gainOf(ctx, 0.55);
      g.sendM = gainOf(ctx, 0.2); g.sendS = gainOf(ctx, 0.09);
      g.musicOut.connect(g.sendM); g.sendM.connect(g.verb); g.sfxBus.connect(g.sendS); g.sendS.connect(g.verb);
      g.verb.connect(hp); hp.connect(lp); lp.connect(ret); ret.connect(g.master);
    } catch (e) { g.verb = null; }
    // the delay of a wake note (and of Jasmin's sung sfx): half a beat of the map track, darker on every repeat, returned into the
    // sfx bus (optional, like the hall)
    g.echoIn = null; g.echoDelay = null;
    try {
      const dl = ctx.createDelay(1.5), fb = gainOf(ctx, ECHO.feedback), lp = filt(ctx, 'lowpass', ECHO.lp, 0.7), ret = gainOf(ctx, ECHO.ret);
      dl.delayTime.value = 0.42;
      g.echoIn = gainOf(ctx, 1);
      g.echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(ret); ret.connect(g.sfxBus);
      g.echoDelay = dl;
    } catch (e) { g.echoIn = null; g.echoDelay = null; }
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
    awake: 1, opt: { calm: false, lite: false }, notes: [], tokens: NOTE_CAP.burst, tokT: 0, liftKey: null,
  };
  const DUCK_LEVEL = 0.42;
  const safe = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); };
  const isSfx = (id) => typeof id === 'string' && has(SFX_DEFS, id);
  const isTrack = (id) => typeof id === 'string' && has(TRACKS, id);
  const heroIds = () => ((DATA && DATA.LISTS && DATA.LISTS.heroIds) || []);

  // ---- flattening a description into one time-sorted event list (cached per description)
  const FLAT = new WeakMap();
  const EV_FIELDS = ['hit', 'big', 'double', 'bend', 'vowel', 'robot', 'scoop', 'crack', 'pan'];
  function flatten(desc) {
    let f = FLAT.get(desc);
    if (f) return f;
    const ev = [];
    desc.tracks.forEach((tr, ti) => tr.notes.forEach((n, ni) => {
      const e = { t: n.t, dur: n.dur, midi: n.midi, vel: n.vel, voice: tr.voice, ti, layer: tr.layer, r: (U.hash(desc.id, ti, ni) % 100000) / 100000 };
      for (const k of EV_FIELDS) if (n[k] != null) e[k] = n[k];
      ev.push(e);
    }));
    ev.sort((a, b) => a.t - b.t || a.ti - b.ti);
    let firstLoop = ev.length;
    for (let i = 0; i < ev.length; i++) if (ev[i].t >= desc.introBeats - 1e-9) { firstLoop = i; break; }
    f = { ev, firstLoop };
    FLAT.set(desc, f);
    return f;
  }
  // layer k ramps in over 0.2 of the drive value, fully in at thresholds[k] + 0.1. A map track (drive 'awake') never starts a ramp below
  // wake level 0, so a muted Act (level 0) plays its still bed only, whatever the calibrated thresholds are.
  const layerTarget = (desc, k, x) => {
    if (k === 0) return 1;
    const lo = desc.drive === 'awake' ? Math.max(0, desc.thresholds[k] - 0.1) : desc.thresholds[k] - 0.1;
    return clamp((x - lo) / (desc.thresholds[k] + 0.1 - lo), 0, 1);
  };

  function buildDeck(ctx, dest, desc) {
    const deck = { id: desc.id, desc, out: ctx.createGain(), layerG: [], tr: [], flat: flatten(desc), i: 0, pass: 0, t0: 0, beatSec: 60 / desc.tempo, dying: false, done: false, target: [], swing: 0, human: 1 };
    deck.out.connect(dest);
    let into = deck.out;
    if (desc.drive === 'awake' && desc.hush) {                // the Gloss's mute: a low-pass and a gain on the DECK, never on the music bus
      deck.lp = filt(ctx, 'lowpass', Math.min(HUSH_HI, ctx.sampleRate * 0.45), 0.5);
      deck.hg = gainOf(ctx, 1);
      deck.lp.connect(deck.hg); deck.hg.connect(deck.out); into = deck.lp;
    }
    for (let k = 0; k < desc.layers; k++) {
      const lg = ctx.createGain();
      lg.gain.value = k === 0 ? 1 : 0;
      lg.connect(into);
      deck.layerG.push(lg);
      deck.target.push(k === 0 ? 1 : 0);
    }
    // Jasmin's delay throw: a dotted eighth of this track, darker on every repeat (only when a croon part plays)
    let fx = null;
    if (desc.tracks.some((tr) => tr.voice === 'croon')) {
      try {
        const dl = ctx.createDelay(1.5), fb = gainOf(ctx, CROON_FX.feedback), lp = filt(ctx, 'lowpass', CROON_FX.lp, 0.7);
        dl.delayTime.value = clamp(CROON_FX.beats * 60 / desc.tempo, 0.15, 1);
        fx = gainOf(ctx, CROON_FX.send);
        fx.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(into);
      } catch (e) { fx = null; }
    }
    desc.tracks.forEach((tr) => {
      const gn = gainOf(ctx, tr.gain * (TRIM[tr.voice] || 1));
      let last = gn;
      if (tr.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(tr.pan, -1, 1); gn.connect(p); last = p; }
      last.connect(deck.layerG[tr.layer]);
      if (fx && tr.voice === 'croon') last.connect(fx);
      deck.tr.push({ in: gn, out: deck.layerG[tr.layer], fn: VOICES[tr.voice], human: tr.human != null ? tr.human : (HUMAN[tr.voice] == null ? 0.01 : HUMAN[tr.voice]), grid: !!tr.grid });
    });
    return deck;
  }
  // the value that drives a deck's layers and groove: the wake level (map tracks) or the fight intensity (everything else)
  const driveOf = (desc) => (desc.drive === 'awake' ? wakeLevel(S.awake) : S.intensity);
  function applyGroove(deck, x) { const gr = groove(deck.desc, x); deck.swing = gr.swing; deck.human = gr.human; }
  function applyLayers(deck, instant) {
    const now = S.ctx.currentTime, x = driveOf(deck.desc), tc = deck.desc.drive === 'awake' ? 0.6 : 0.3;
    for (let k = 1; k < deck.desc.layers; k++) {
      const v = layerTarget(deck.desc, k, x);
      deck.target[k] = v;
      if (instant) deck.layerG[k].gain.value = v; else deck.layerG[k].gain.setTargetAtTime(v, now, tc);
    }
    applyGroove(deck, x);
    applyHush(deck, instant, deck.desc.drive === 'awake' ? x : 1);
  }
  // w = 0 (muted: low cut-off, floor gain) .. 1 (live: transparent)
  function applyHush(deck, instant, w) {
    if (!deck.lp) return;
    const h = deck.desc.hush, ctx = deck.lp.context, hi = Math.min(HUSH_HI, ctx.sampleRate * 0.45);
    const f = h.lo * Math.pow(hi / h.lo, w), gv = h.floor + (1 - h.floor) * w;
    if (instant) { deck.lp.frequency.value = f; deck.hg.gain.value = gv; }
    else { const now = ctx.currentTime; deck.lp.frequency.setTargetAtTime(f, now, 0.8); deck.hg.gain.setTargetAtTime(gv, now, 0.8); }
  }
  // swing: every odd sixteenth is late by deck.swing of a sixteenth; human: the voice's timing spread times deck.human (0 for the Gloss)
  function grooveOffset(deck, tr, e, r) {
    if (tr.grid) return 0;
    let d = (r - 0.5) * tr.human * deck.human;
    if (deck.swing > 0) { const s16 = e.t * 4, k = Math.round(s16); if (Math.abs(s16 - k) < 1e-6 && (k & 1)) d += deck.swing * 0.25 * deck.beatSec; }
    return d;
  }
  function playNote(ctx, deck, e, when, pass, minT, capped) {
    const tr = deck.tr[e.ti];
    const r = frac(e.r + pass * 0.618034);
    if (capped && (live.n > MAX_LIVE * 1.4 || (e.layer > 0 && live.n > MAX_LIVE))) return false;
    let w = when + grooveOffset(deck, tr, e, r);
    if (w < minT) w = minT;
    const n = { midi: e.midi, dur: e.dur * deck.beatSec, vel: clamp(e.vel * (0.93 + 0.14 * frac(r * 7.31)), 0.02, 1), r };
    for (const k of EV_FIELDS) if (e[k] != null) n[k] = e[k];
    let out = tr.in;
    if (isNum(e.pan) && ctx.createStereoPanner) {                 // a per-note pan (RawClaw's ping-pong figure) on its own short path
      const g = gainOf(ctx, tr.in.gain.value), p = ctx.createStereoPanner();
      p.pan.value = clamp(e.pan, -1, 1); g.connect(p); p.connect(tr.out); out = g;
    }
    tr.fn(ctx, out, w, n);
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
    if (desc.drive !== 'intensity') S.intensity = 0;
    const fade = fadeSeconds(o, desc.xfade);
    for (const d of S.decks) if (!d.dying) fadeOutDeck(d, fade);
    const deck = buildDeck(ctx, S.g.musicBus, desc);
    deck.t0 = now + 0.06;
    applyLayers(deck, true);
    deck.out.gain.setValueAtTime(EPS, now);
    deck.out.gain.linearRampToValueAtTime(1, now + fade);
    S.decks.push(deck);
    S.main = deck;
    if (desc.drive === 'awake' && S.g.echoDelay) { try { S.g.echoDelay.delayTime.setTargetAtTime(clamp(ECHO.beats * 60 / desc.tempo, 0.2, 0.6), now, 0.05); } catch (e) { /* the delay keeps its time */ } }
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

  // ==================================================================================================================
  // SAMPLES (HV_ART_AUDIO 11): the owners' optional recordings. DATA.SAMPLES ships empty, so nothing is ever requested. The manifest
  // is validated here (never in DATA.audit); a bad entry is reported once and skipped, never thrown. Files are fetched from the
  // game's own folder only (a name is ^[a-z0-9][a-z0-9_-]*$: no dot, slash, colon or space, so no URL and no folder escape),
  // decoded once into the one AudioContext and played through the sfx bus. Anything missing or broken leaves the synth recipe.
  // ==================================================================================================================
  const SAMPLE_NAME = /^[a-z0-9][a-z0-9_-]*$/;
  const SAMPLE_MIME = { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg; codecs=opus', mp3: 'audio/mpeg', wav: 'audio/wav', webm: 'audio/webm', flac: 'audio/flac' };
  const SAMPLE_SYLLABLES = ['boots', 'cats', 'ts', 'pf', 'k', 'bwaa', 'ab', 'ra', 'ca', 'tada', 'hey', 'boom', 'oo', 'ah', 'mm'];
  const SAMPLE_STINGERS = ['victory', 'defeat', 'boss_intro', 'phase_change'];
  const SAMPLE_GROUPS = ['sfx', 'spells', 'syllables', 'stingers'];
  const SMP = { cfg: null, map: new Map(), queue: [], active: 0, seconds: 0, over: false, fmt: undefined, timer: 0, warned: {} };
  const warnOnce = (key, msg) => {
    if (SMP.warned[key]) return;
    SMP.warned[key] = true;
    try { if (typeof console !== 'undefined' && console.warn) console.warn('AUDIO samples: ' + msg); } catch (e) { /* no console */ }
  };
  // the load order of 'idle': ui, cards, hits, map, the rest
  function sampleRank(key) {
    const g = key.split(':')[0], id = key.slice(g.length + 1).split('.')[0];
    if (g === 'sfx') {
      if (/^ui_/.test(id)) return 0;
      if (/^card_|^shuffle$|^swap$/.test(id)) return 1;
      if (/^hit_|^slash$|^thud$|^zap$|^flame$|^ice$|^poison_tick$|^thorn$|^dodge$|^block_/.test(id)) return 2;
      if (/^paint$|^ink_|^brush_|^step$|^reveal_landmark$|^well$/.test(id)) return 3;
      return 4;
    }
    return g === 'spells' || g === 'syllables' ? 3 : 4;
  }
  // read and validate DATA.SAMPLES into SMP (at an init that started audio)
  function samplesSetup() {
    SMP.map = new Map(); SMP.queue = []; SMP.cfg = null;
    const M = typeof DATA !== 'undefined' && DATA ? DATA.SAMPLES : null;
    if (!M || typeof M !== 'object') return;
    const base = typeof M.base === 'string' && /^([a-z0-9][a-z0-9_-]*\/)+$/.test(M.base) ? M.base : 'audio/';
    if (M.base != null && base !== M.base) warnOnce('base', 'base "' + M.base + '" is not a plain relative folder; using audio/');
    const formats = (Array.isArray(M.formats) ? M.formats : ['m4a', 'ogg', 'mp3']).filter((f) => {
      const ok = typeof f === 'string' && has(SAMPLE_MIME, f);
      if (!ok) warnOnce('format:' + f, 'unknown format "' + f + '" skipped');
      return ok;
    });
    SMP.cfg = {
      base, formats, preload: M.preload === 'lazy' ? 'lazy' : 'idle',
      maxSeconds: isNum(M.maxSeconds) && M.maxSeconds > 0 ? M.maxSeconds : 120,
      gain: isNum(M.gain) && M.gain >= 0 ? clamp(M.gain, 0, 4) : 1,
    };
    const brushes = (DATA && DATA.brushes) || {};
    const heroes = heroIds();
    const keyOk = (group, k) => {
      if (group === 'sfx') {
        const parts = k.split('.');
        if (parts.length === 1) return isSfx(k);
        return parts.length === 2 && isSfx(parts[0]) && heroes.indexOf(parts[1]) >= 0;
      }
      if (group === 'spells') return has(brushes, k);
      if (group === 'syllables') return SAMPLE_SYLLABLES.indexOf(k) >= 0;
      return SAMPLE_STINGERS.indexOf(k) >= 0;
    };
    for (const group of SAMPLE_GROUPS) {
      const tab = M[group];
      if (tab == null) continue;
      if (typeof tab !== 'object') { warnOnce('group:' + group, group + ' must be an object'); continue; }
      for (const k of Object.keys(tab)) {
        const key = group + ':' + k;
        if (!keyOk(group, k)) { warnOnce('key:' + key, 'unknown key ' + key + ' skipped'); continue; }
        const raw = tab[k], ent = typeof raw === 'string' ? { files: [raw] } : Array.isArray(raw) ? { files: raw } : raw && typeof raw === 'object' ? raw : null;
        const files = ent && Array.isArray(ent.files) ? ent.files : ent && typeof ent.file === 'string' ? [ent.file] : null;
        if (!files || !files.length || !files.every((f) => typeof f === 'string' && SAMPLE_NAME.test(f))) { warnOnce('name:' + key, 'bad file name for ' + key + ' (lowercase letters, digits, _ and -, no extension) skipped'); continue; }
        const num = (x, lo, hi, d) => (isNum(x) ? clamp(x, lo, hi) : d);
        SMP.map.set(key, {
          key, group, id: k, files: files.slice(), state: 'idle', bufs: [], rr: 0, seconds: 0,
          vol: num(ent.vol, 0, 2, 1), midi: isNum(ent.midi) ? ent.midi : null, var: num(ent.var, 0, 1200, 0),
          start: num(ent.start, 0, 600, 0), end: isNum(ent.end) && ent.end > 0 ? ent.end : null,
        });
      }
    }
    if (!SMP.map.size) return;
    const proto = typeof window !== 'undefined' && window.location ? window.location.protocol : '';
    if (proto === 'file:') { warnOnce('file', 'a file:// page cannot load samples; everything stays synthesised'); SMP.map.forEach((e) => { e.state = 'failed'; }); return; }
    if (SMP.cfg.preload === 'idle') {
      SMP.queue = Array.from(SMP.map.keys()).sort((a, b) => sampleRank(a) - sampleRank(b));
      SMP.timer = setTimeout(() => { SMP.timer = 0; samplePump(); }, 1500);
    }
  }
  // the first format this browser can decode, from the manifest's order; null when none (then nothing is ever fetched)
  function sampleFormats() {
    if (SMP.fmt !== undefined) return SMP.fmt;
    let el = null;
    try { el = typeof window !== 'undefined' && typeof window.Audio === 'function' ? new window.Audio() : null; } catch (e) { el = null; }
    const can = (f) => { try { const v = el && typeof el.canPlayType === 'function' ? el.canPlayType(SAMPLE_MIME[f]) : ''; return v === 'probably' || v === 'maybe'; } catch (e) { return false; } };
    SMP.fmt = SMP.cfg.formats.filter(can);
    return SMP.fmt;
  }
  function samplePump() {
    while (SMP.active < 2 && SMP.queue.length) {
      const e = SMP.map.get(SMP.queue.shift());
      if (e && e.state === 'idle') sampleLoad(e);
    }
  }
  function sampleFail(e, why) {
    e.state = 'failed'; e.bufs = [];
    warnOnce('fail:' + e.key, e.key + ' stays synthesised (' + why + ')');
  }
  function decode(ctx, ab) {
    return new Promise((res, rej) => {
      let done = false;
      const ok = (b) => { if (!done) { done = true; res(b); } }, no = (x) => { if (!done) { done = true; rej(x || new Error('decode')); } };
      try { const p = ctx.decodeAudioData(ab, ok, no); if (p && typeof p.then === 'function') p.then(ok, no); } catch (x) { no(x); }
    });
  }
  // fetch and decode every file of one entry (round robin list), trying the next playable format when one fails
  function sampleLoad(e) {
    const fmts = sampleFormats(), ctx = S.ctx;
    if (!ctx || !fmts.length) { sampleFail(e, 'no playable format'); return; }
    if (SMP.over) { e.state = 'over'; return; }
    e.state = 'loading'; SMP.active++;
    const one = (name, fi) => {
      if (fi >= fmts.length) return Promise.reject(new Error('no format of ' + name + ' loaded'));
      const url = SMP.cfg.base + name + '.' + fmts[fi];
      let p;
      // hygiene-allow(network): same-origin sample files the owners list in DATA.SAMPLES, never a URL
      try { p = window.fetch(url, { credentials: 'same-origin', cache: 'force-cache' }); } catch (x) { p = Promise.reject(x); }
      return Promise.resolve(p).then((r) => { if (!r || !r.ok) throw new Error('HTTP ' + (r ? r.status : '?')); return r.arrayBuffer(); })
        .then((ab) => decode(ctx, ab)).catch(() => one(name, fi + 1));
    };
    let chain = Promise.resolve([]);
    e.files.forEach((name) => { chain = chain.then((list) => one(name, 0).then((b) => list.concat([b]))); });
    chain.then((bufs) => {
      const secs = bufs.reduce((s, b) => s + Math.max(0, Math.min(b.duration, e.end || b.duration) - e.start), 0);
      if (SMP.seconds + secs > SMP.cfg.maxSeconds) { SMP.over = true; e.state = 'over'; warnOnce('over', 'past maxSeconds (' + SMP.cfg.maxSeconds + ' s of decoded audio): the remaining keys stay synthesised'); return; }
      SMP.seconds += secs; e.seconds = round3(secs); e.bufs = bufs; e.state = 'ready';
    }).catch((x) => sampleFail(e, (x && x.message) || 'load error')).then(() => { SMP.active--; samplePump(); });
  }
  // a ready entry by key; 'lazy' starts loading a listed key on its first request (that play still uses the synth)
  function sampleReady(key) {
    const e = SMP.map.get(key);
    if (!e) return null;
    if (e.state === 'ready') return e;
    if (e.state === 'idle' && SMP.cfg && SMP.cfg.preload === 'lazy') { SMP.queue.push(key); samplePump(); }
    return null;
  }
  // play one buffer of a ready entry: rate (pitch multiplier), gain, pan into `dest` at time t; counts as one live source
  function samplePlay(ctx, dest, e, t, rate, gain, pan) {
    const b = e.bufs[e.rr++ % e.bufs.length];
    const src = ctx.createBufferSource(), g = gainOf(ctx, gain);
    src.buffer = b;
    src.playbackRate.value = clamp(rate * (e.var ? Math.pow(2, ((S.rng() * 2 - 1) * e.var) / 1200) : 1), 0.25, 4);
    let head = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); head = p; }
    src.connect(g); head.connect(dest);
    const len = Math.max(0.01, (e.end || b.duration) - e.start);
    src.start(t, e.start, len);
    track(src);
    return len / src.playbackRate.value;
  }
  // a vox syllable (or vowel) the owners recorded: live only, re-pitched by playbackRate within 7 semitones of its `midi`
  function sampleSyllable(ctx, out, t, n, syl) {
    if (!S.ctx || ctx !== S.ctx || !SMP.map.size) return false;
    const name = syl || ({ u: 'oo', a: 'ah', m: 'mm' })[vowelOf(n.vowel, 'a')];
    const e = name ? sampleReady('syllables:' + name) : null;
    if (!e || e.midi == null || !isNum(n.midi) || Math.abs(n.midi - e.midi) > 7) return false;
    samplePlay(ctx, out, e, t, Math.pow(2, (n.midi - e.midi) / 12), vg(n.vel) * e.vol * SMP.cfg.gain, 0);
    return true;
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
      // iOS Safari only lets a click, key press or pointerup wake a context (not pointerdown): keep nudging it until it runs
      const wake = () => { const c = S.ctx; if (c && !S.susp.user && !S.susp.hidden && c.state !== 'running' && c.state !== 'closed') safe(c.resume()); };
      for (const ev of ['click', 'keydown', 'pointerup']) document.addEventListener(ev, wake, true);
    }
    if (ctx.state !== 'running') safe(ctx.resume());
    startTimer();
    try { samplesSetup(); } catch (e) { SMP.map = new Map(); SMP.queue = []; }
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
    if (S.ready) for (const d of S.decks) if (!d.dying && d.desc.drive === 'intensity') applyLayers(d, false);
    return x;
  }
  // ---- the reveal, live. How much of the map is unmuted drives the map tracks.
  const wakeLevel = (frac) => clamp((frac - WAKE_FROM) / WAKE_SPAN, 0, 1);
  function awake(frac) {
    if (frac === undefined) return S.awake;
    const x = isNum(+frac) ? clamp(+frac, 0, 1) : 1;
    S.awake = x;
    if (S.ready) for (const d of S.decks) if (!d.dying && d.desc.drive === 'awake') applyLayers(d, false);
    return x;
  }
  function options(o) {
    if (o && typeof o === 'object') {
      if (has(o, 'calm')) S.opt.calm = !!o.calm;
      if (has(o, 'lite')) S.opt.lite = !!o.lite;
    }
    return Object.assign({}, S.opt);
  }
  // one unmuted hex sings. o = {chapter, seed, cols, rows, song?, i?, n?, aq?, ar?, last?, soft?, pan?}. false when dropped.
  function wake(q, r, o) {
    o = o || {};
    if (!S.ready || S.susp.user || S.susp.hidden || S.vol.sfx <= 0.001 || !isNum(+q) || !isNum(+r)) return false;
    if (o.soft && S.opt.calm) return false;
    try {
      firstLift(o);                                            // the first unmuted hex of a map opens the muted map deck for 2 s (music side)
      const ctx = S.ctx, now = ctx.currentTime, lite = S.opt.lite, cap = lite ? NOTE_CAP_LITE : NOTE_CAP;
      kick();
      if (live.n > MAX_LIVE * 0.8) return false;
      S.notes = S.notes.filter((e) => e > now);
      S.tokens = Math.min(cap.burst, S.tokens + Math.max(0, now - S.tokT) * cap.rate);
      S.tokT = now;
      if (!o.last && (S.tokens < 1 || S.notes.length >= cap.ring)) return false;
      S.tokens = Math.max(0, S.tokens - 1);
      const song = has(SONGS, o.song) ? o.song : (o.soft ? 'step' : 'single');
      const st = SONGS[song];
      const ch = clamp((o.chapter | 0) || 1, 1, 3), k = echoKey(ch), deg = wakeDegree(+q, +r, o), i = Math.max(0, o.i | 0);
      const v = lite ? 'arp' : (st.byVerse ? st.byVerse[ch - 1] : st.v), rg = RANGES[v];
      const dry = song === 'single' && ch === 3;                // the Perfect Stage: dry and short at first
      const echoAmt = st.echoByVerse ? st.echoByVerse[ch - 1] : st.echo;
      const midi = foldInto(degToMidi(k, deg), rg[0], rg[1]);
      const cad = o.last && st.deg !== 'chord';
      const dur = st.dur * (cad ? 2 : 1) * (dry ? 0.6 : 1);
      const vel = clamp(st.vel * (o.last ? 1.15 : 1) / Math.sqrt(1 + 0.15 * S.notes.length), 0.05, 1);
      const t = now + 0.004, rr = S.rng();
      const pan = st.circle ? Math.sin(2 * Math.PI * (i + 0.5) / 6) * 0.8 : (isNum(o.pan) ? o.pan : 0);   // round the circle: pan = sin of the cell's angle
      const bus = gainOf(ctx, WAKE_GAIN);
      let head = bus;
      if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); bus.connect(p); head = p; }
      head.connect(S.g.sfxBus);
      if (echoAmt && S.g.echoIn && !S.opt.calm && !lite) { const send = gainOf(ctx, ECHO.send * echoAmt); head.connect(send); send.connect(S.g.echoIn); }
      VOICES[v](ctx, bus, t, { midi, dur, vel, r: rr, vowel: st.vowel, hit: v === 'synth' ? (st.hit || 'pluck') : undefined });
      if (!lite) {
        if (dry && wakeLevel(S.awake) > 0.5) VOICES.croon(ctx, bus, t, { midi: foldInto(degToMidi(k, deg), RANGES.croon[0], RANGES.croon[1]), dur: 0.3, vel: 0.18, r: rr, vowel: 'u' });
        const spell = i === 0 && has(DATA && DATA.brushes, song) ? sampleReady('spells:' + song) : null;
        if (spell) samplePlay(ctx, bus, spell, t, 1, spell.vol * SMP.cfg.gain, 0);
        else wakeExtras(ctx, bus, t, st, i, k, deg, rr);
      }
      S.notes.push(t + Math.max(0.4, dur * 2.2));
      return true;
    } catch (e) { return false; }
  }
  // the sung and spoken layers of a Spell (never in lite mode)
  function wakeExtras(ctx, bus, t, st, i, k, deg, rr) {
    const low = foldInto(k.tonic - 24, 33, 45), sung = foldInto(degToMidi(k, deg), RANGES.vox[0], RANGES.vox[1]);
    const voxLow = foldInto(low + 12, RANGES.vox[0], RANGES.vox[1]);
    if (st.kit) {                                               // Boots and Cats: boots with a kick, ts with a hat, cats with a snare, ts
      const syl = st.kit[i % st.kit.length];
      VOICES.vox(ctx, bus, t, { midi: voxLow, dur: 0.12, vel: 0.55, syl, r: rr });
      if (syl === 'boots') VOICES.kick(ctx, bus, t, { midi: low, dur: 0.15, vel: 0.7, r: rr });
      else if (syl === 'cats') VOICES.snare(ctx, bus, t, { midi: low + 19, dur: 0.12, vel: 0.6, hit: 'k', r: rr });
      else VOICES.hat(ctx, bus, t, { midi: 72, dur: 0.05, vel: 0.5, r: rr });
    }
    if (st.dbl) VOICES[st.dbl](ctx, bus, t, { midi: foldInto(degToMidi(k, deg), RANGES[st.dbl][0], RANGES[st.dbl][1]), dur: 0.25, vel: 0.2, r: rr });
    if (st.horn && i === 0) [[0, 0.09], [0.13, 0.09], [0.26, 0.32]].forEach((x) => VOICES.vox(ctx, bus, t + x[0], { midi: sung, dur: x[1], vel: 0.6, syl: 'bwaa', r: rr }));
    if (st.abra && i === 0) {                                   // Abracadabass: "a-bra-ca" on three chord tones, then the bass drops
      ['ab', 'ra', 'ca'].forEach((syl, j) => VOICES.vox(ctx, bus, t + j * 0.09, { midi: foldInto(degToMidi(k, deg + j * 2), RANGES.vox[0], RANGES.vox[1]), dur: 0.08, vel: 0.6, syl, r: rr }));
      VOICES.throat(ctx, bus, t + 0.3, { midi: foldInto(degToMidi(k, deg) - 12, 36, 48), dur: 0.5, vel: 0.85, bend: -7, r: rr });
      VOICES.kick(ctx, bus, t + 0.3, { midi: 31, dur: 0.3, vel: 0.9, big: 1, r: rr });
    }
    if (st.pad && i === 0) VOICES.pad(ctx, bus, t, { midi: foldInto(degToMidi(k, deg), 45, 72), dur: 1.6, vel: 0.32, r: rr });
    if (st.tada) VOICES.vox(ctx, bus, t + 0.05, { midi: sung, dur: 0.3, vel: 0.4, syl: 'tada', whisper: 1, r: rr });
  }
  // the first unmuted hex of each map (chapter and seed) opens every muted map deck to 1.5 times its cut-off for 2 s, then back
  function firstLift(o) {
    const key = ((o.chapter | 0) || 1) + '|' + ((o.seed >>> 0) || 0);
    if (S.liftKey === key) return;
    S.liftKey = key;
    const now = S.ctx.currentTime;
    for (const d of S.decks) {
      if (d.dying || !d.lp) continue;
      const hi = Math.min(HUSH_HI, S.ctx.sampleRate * 0.45), f = d.lp.frequency.value;
      d.lp.frequency.setTargetAtTime(Math.min(hi, f * 1.5), now, 0.15);
      d.lp.frequency.setTargetAtTime(f, now + 2, 0.8);
    }
  }
  // the recipe key a play uses: the hero's variant when one exists
  const variantKey = (id, hero) => (typeof hero === 'string' && has(SFX_VARIANTS, id + '.' + hero) ? id + '.' + hero : id);
  function sfx(id, o) {
    if (!S.ready || S.susp.user || S.susp.hidden || !isSfx(id)) return false;
    o = o || {};
    const base = rawRecipe(id), key = variantKey(id, o.hero), R = rawRecipe(key), ctx = S.ctx, now = ctx.currentTime;
    kick();
    if (base.cd && S.last[id] != null && (now - S.last[id]) * 1000 < base.cd) return false;
    if (live.n > MAX_LIVE * [0.55, 0.8, 1, 1.3][clamp(base.pri, 0, 3)]) return false;
    S.last[id] = now;
    const rg = S.rng;
    let keyMul = 1;                                                // a tuned recipe (the Tea Stall) rings in the key of the deck that is playing
    if (base.tune && S.main && !S.main.dying && S.main.desc) keyMul = Math.pow(2, (mod(S.main.desc.tonic - base.tune + 6, 12) - 6) / 12);
    const pitch = (isNum(o.pitch) && o.pitch > 0 ? o.pitch : 1) * keyMul * Math.pow(2, ((rg() * 2 - 1) * base.var) / 1200);
    const vol = clamp(isNum(o.vol) ? o.vol : 1, 0, 2) * db((rg() * 2 - 1) * base.gainVar);
    const pj = (rg() - 0.5) * 0.12, pan = isNum(o.pan) ? clamp(o.pan, -1, 1) : clamp(base.pan + pj, -1, 1);        // an explicit pan is exact
    const dl = isNum(o.delay) && o.delay > 0 ? (o.delay > 5 ? o.delay / 1000 : o.delay) : 0;
    const t = now + 0.004 + dl, seed = Math.floor(rg() * 4294967295);
    let duckMs = base.duck;
    const hk = typeof o.hero === 'string' && heroIds().indexOf(o.hero) >= 0 ? id + '.' + o.hero : null;     // a recorded variant, with or without a synth one
    const smp = SMP.map.size ? (hk ? sampleReady('sfx:' + hk) : null) || sampleReady('sfx:' + id) : null;
    if (smp) samplePlay(ctx, S.g.sfxBus, smp, t, isNum(o.pitch) && o.pitch > 0 ? o.pitch : 1, R.vol * smp.vol * SMP.cfg.gain * vol, pan);
    else playRecipe(ctx, S.g.sfxBus, R, t, { pitch, vol, pan, seed, echo: !S.opt.calm && !S.opt.lite ? S.g.echoIn : null });
    const sting = SMP.map.size && SAMPLE_STINGERS.indexOf(id) >= 0 ? sampleReady('stingers:' + id) : null;
    if (sting) { const len = samplePlay(ctx, S.g.sfxBus, sting, t, 1, base.vol * sting.vol * SMP.cfg.gain, 0); duckMs = Math.max(duckMs, len * 1000); }
    if (duckMs) duck(duckMs + dl * 1000);
    return true;
  }
  // the settings screen's preview: no variation, the sample when one is ready (o.synth: true plays the synth recipe for an A/B)
  function preview(id, o) {
    if (!S.ready || S.susp.user || S.susp.hidden || !isSfx(id)) return false;
    const R = rawRecipe(id), ctx = S.ctx, smp = !(o && o.synth) && SMP.map.size ? sampleReady('sfx:' + id) : null;
    if (smp) samplePlay(ctx, S.g.sfxBus, smp, ctx.currentTime + 0.01, 1, R.vol * smp.vol * SMP.cfg.gain, 0);
    else playRecipe(ctx, S.g.sfxBus, R, ctx.currentTime + 0.01, { pitch: 1, vol: 1, seed: 7 });
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
  function samples() {
    return Array.from(SMP.map.values()).map((e) => ({ key: e.key, state: e.state, files: e.files.slice(), seconds: e.seconds }));
  }

  // ---- offline rendering and inspection (the audio suite and tools/hocus_vocus/mix.mjs use these)
  function render(ctx, dest, desc, o) {
    o = o || {};
    const t0 = o.t0 || 0, loops = Math.max(1, o.loops == null ? 1 : o.loops), x = o.intensity == null ? (desc.drive === 'awake' ? 1 : 0) : o.intensity;     // for awake tracks o.intensity is the wake level
    const deck = buildDeck(ctx, dest, desc);
    deck.out.gain.value = 1;
    for (let k = 1; k < desc.layers; k++) { deck.target[k] = layerTarget(desc, k, x); deck.layerG[k].gain.value = deck.target[k]; }
    applyGroove(deck, x);
    applyHush(deck, true, desc.drive === 'awake' ? x : 1);
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
  // id is an sfx id or a variant key `id.hero`, or a plain recipe object (as returned by sfxRecipe, possibly edited) for experiments and tools
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
    if (!has(VOICES, name)) return false;
    VOICES[name](ctx, out, t, Object.assign({ midi: 60, dur: 0.5, vel: 0.7, r: 0.5 }, n));
    return true;
  }
  function debug() {
    return {
      ready: S.ready, ctx: S.ctx, graph: S.g, live: live.n, intensity: S.intensity, current: S.cur, pending: S.pending, vol: Object.assign({}, S.vol),
      suspended: Object.assign({}, S.susp), timer: !!S.timer, duckUntil: S.duckUntil,
      awake: S.awake, wake: wakeLevel(S.awake), opt: Object.assign({}, S.opt), notes: S.notes.length, liftKey: S.liftKey,
      decks: S.decks.map((d) => ({ id: d.id, dying: d.dying, pass: d.pass, index: d.i, target: d.target.slice(), swing: d.swing, human: d.human, out: d.out, layerG: d.layerG.slice(), drive: d.desc.drive, lp: d.lp || null, hg: d.hg || null, raw: d })),
      mixLengths: Object.keys(MIX).reduce((o, k) => { o[k] = MIX[k].length; return o; }, {}),
      samples: { cfg: SMP.cfg ? Object.assign({}, SMP.cfg) : null, seconds: SMP.seconds, active: SMP.active, queued: SMP.queue.length, formats: SMP.fmt === undefined ? null : SMP.fmt },
      tick,
    };
  }

  return {
    init, sfx, music, setVolume, volume, duck, suspend, resume, intensity, list, preview, samples,
    wake, awake, options, hexNote, songDegrees, wakeDegree,
    compose, sfxRecipe, graph: buildGraph, render, renderSfx, voice, debug,
    get ready() { return S.ready; },
    get current() { return S.cur; },
    VOICES: VOICE_NAMES.slice(), SCALES: JSON.parse(JSON.stringify(SCALES)), RANGES: JSON.parse(JSON.stringify(RANGES)), MUSIC_SCALE,
    SONGS: JSON.parse(JSON.stringify(SONGS)),
    CHORD_ROOTS: JSON.parse(JSON.stringify(CHORD_ROOTS)),
    MOTIFS: JSON.parse(JSON.stringify(MOTIFS)),
    VARIANTS: VARIANT_KEYS.slice(),
    HUSH: { from: WAKE_FROM, span: WAKE_SPAN, th: TH_WAKE.slice() },
  };
})();
