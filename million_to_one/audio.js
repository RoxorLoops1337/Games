// Million To One: every sound is synthesised in code (no audio files).
// The music is a beatbox crew in a box: B kick, Pf and K snares, t and ts hats, the
// inward K, a hummed bass, "ooh" choir pads made by pushing sawtooth waves through vowel
// (formant) filters, "wah" stabs, a whistled lead and vocal chops when things get wild, and a
// fill every 8 bars. Tempo and key climb zone by zone, and every zone has its own flavour (pad
// vowel, chord progression, one signature sound: see ZONE_FLAVOR); the arrangement grows with
// intensity 0..2 (0.3 is the waiting-room groove for menus; 1.4 is the late-race L=2 groove; the
// whistle lead and wah stabs are saved for FRENZY) and with the player's live combo (A.combo).
//
// Mix (tuned for phone speakers): the music bus gets a +3 dB lift at 250 Hz, +3 dB of presence at 2.5 kHz, a gentle
// -2 dB top shelf and its own glue compressor, and only then the intensity gain (L0 0.85, L1 1, L2 1.12, FRENZY 1.3:
// the race gets louder as it heats up; after the compressor, so the arc is really heard), times RACE_TRIM (0.7, -3 dB)
// whenever the race groove plays (not the waiting room), so the rewards sit on top of it. Sound effects go through a
// soft bus compressor whose automatic makeup gain (about +6 dB) is trimmed back by a 0.7 gain, so the combo blips cut
// through the groove on a phone while stacked hits still leave the limiter some headroom, and the big stingers (frenzy,
// egg, win, finisher, comboBreak, mixed 1.25x hotter) still stand out; both meet in a master gain (1.12: groove peaks
// near -4 dB, only the stingers touch the -2 dB limiter) and a brickwall-ish limiter with a soft clipper. The success
// sounds (link and pass tails, drill taps, close, thread) peak within about 4 dB of the music's 100 ms RMS and the
// failures (bonk) sit at or under a link; the ladder gains weight as it climbs (see _tailVol, _layers). The volume
// sliders are perceptual (gain = v * v). Only real hits (bonk, hit, bump,
// pop, the chain pop, dash) micro-duck the music, and only with a sound a phone speaker can play (opts.duck,
// never under 200 Hz), so the groove never pumps on a sub nobody hears. Music and sfx have their own echoes
// so muting or muffling the music never cuts an sfx tail.
//
// CPU budget: notes are scheduled 300 ms ahead from tick(), which runs from its own 40 ms timer (and from
// every frame too: it is idempotent), so a janky frame never starves the beat. Every source is counted:
// hats and the combo sparkle go first (CAP - 8), then low priority voices (CAP), the bass keeps a reserve
// (CAP + 12) and stingers have the most (CAP + 24). setStage(0 / 1 / 2) sets CAP to 48 / 36 / 28, and stage 2
// (slow phones; setLite(true) is an alias) sings say() vowels without their harmony voices. A say() voice counts
// as 3 sources (its formant filters cost too). The vowel filters for the pads and stabs are shared persistent
// nodes, one 1s noise buffer is reused by every hiss, and the 16th-rate kit (hat, ts shaker, rim) plays 4
// prebaked, prefiltered variants each (see _kit): a BufferSource and a Gain per hit, no filter.
// setMono(true) centres every pan (one earbud) and lifts the cilia 'tell' about 3 dB.
//
// Slow-mo bends the sound effects too: while a slow runs every sfx is built at 0.85x pitch and speed
// (0.72x in a big slow), easing back over 0.15 s when it ends; UI sounds never bend.
//
// Key changes (a new zone, a FRENZY or combo milestone lift, the lift dropping again) never land
// mid-bar: _rekey() only stores the new key in _keyNext and tick() applies it on the next downbeat,
// so the pads sung in the old key finish in tune. A new tempo waits for the same downbeat (_bpmNext), and the
// echoes switch delay time right there behind a 1/16 input dip (never a glide, which would chirp every tail).
// The lifts also get a rising "whoop" on step 12 of the bar before. The combo ladder climbs in scale degrees
// (see ladderDegree), never off the scale, and picks its octave once per run of 10 (never folds mid-run).
// The whistled lead has its own bus (leadBus): over the theme's first 4 bars a combo note dips it for 90 ms and
// the link's tail drops an octave, so the hook and the ladder sit in separate registers.

import { bankGrade } from './core.js';

const VOW = {
  oo: [300, 870, 2240], oh: [570, 840, 2410], ah: [730, 1090, 2440],
  eh: [530, 1840, 2480], ee: [270, 2290, 3010], uh: [520, 1190, 2390],
  ay: [390, 2300, 2800],             // the closing half of "hey": eh glides up into it
};
const FG = [1, 0.5, 0.16];          // formant gains (F1, F2, F3)
const FBW = [90, 110, 150];         // formant bandwidths in Hz
const ZONE_BPM = [96, 104, 110, 116, 120, 128, 136];
const ZONE_KEY = [0, 2, 3, 5, 7, 8, 10];  // semitone lift per zone, every zone climbs
const PROG = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]]; // Am F C G (relative to the key root A)
// one flavour per zone, indexed like zoneOf(bpm): the choir's vowel, an optional chord progression,
// and a signature sound (see _signature): launch rim ostinato, acid bubbles, goo toms, womb-sea waves,
// fork half-time intro, rapids pad tremolo, egg heartbeat kick
const ZONE_FLAVOR = [
  { vowel: 'oo', sig: 'rim' },
  { vowel: 'oh', sig: 'bubble' },
  { vowel: 'ee', sig: 'goo', prog: [[0, 3, 7], [5, 8, 12], [0, 3, 7], [7, 11, 14]] },   // Am Dm Am E
  { vowel: 'uh', sig: 'wave', prog: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-5, -1, 2]] }, // Am F Dm E
  { vowel: 'ah', sig: 'fork', half: 2 },
  { vowel: 'oo', sig: 'trem' },
  { vowel: 'oh', sig: 'heart', prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]] },  // Am F G E
];
const MENU_HOOK = [[4, 3, 2, 0, null, 2, 3, 5], [4, 3, 2, 0, null, null, 0, null]];   // pentatonic degrees on 8ths
// the "Million To One" theme: a 4-bar hook in pentatonic degrees (PENTA index) on 16ths, call and answer.
// Bars 1 and 3 are the call ("one in a mil-lion"), bar 2 answers up in the air on the 5th, bar 4 walks
// home and resolves to degree 0. The menu whistles it every other 8-bar phrase, the race whistles it over
// the first 4 bars of every zone, later phrases play seeded variations of it, the win fanfare quotes bar 1
// in brass and the lose sting starts it on a kazoo and gives up on the 4th note.
const _ = null;
const THEME_CALL = [5, _, _, 4, _, _, 5, _, 7, _, 6, _, 5, _, _, _];
export const THEME = [
  THEME_CALL,
  [7, _, _, 6, _, _, 5, _, 4, _, 5, _, 3, _, _, _],
  THEME_CALL,
  [4, _, 3, _, 2, _, 1, _, 0, _, _, _, _, _, _, _],
];
// how many 16ths each theme note rings: up to the next note, at most 4
const THEME_LEN = THEME.map((b) => b.map((d, s) => { if (d === null) return 0; let n = 1; while (s + n < 16 && n < 4 && b[s + n] === null) n++; return n; }));
// the combo ladder: link n plays this pentatonic degree. It walks a 10-note run (two octaves) and every
// ten links the run starts one scale degree higher (at most 5), so it keeps climbing and never leaves the key
export const ladderDegree = (n) => { n = Math.max(0, n | 0); return n % 10 + Math.min(5, Math.floor(n / 10)); };
// a seeded variation of a theme bar: shift by +-1 or +-2 degrees and drop about 30% of the notes
// (the bar's first note always stays, so the line still starts on the beat). seed: any integer.
export function themeVariation(seed) {
  let a = (seed | 0) ^ 0x2545F491;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const src = THEME[Math.floor(rnd() * 4)], mag = rnd() < 0.5 ? 1 : 2, sh = rnd() < 0.5 ? -mag : mag;
  let first = true;
  return src.map((d) => {
    if (d === null) return null;
    if (!first && rnd() < 0.3) return null;
    first = false;
    return Math.max(0, Math.min(PENTA.length - 1, d + sh));
  });
}
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
const BOOST = new Set(['frenzy', 'egg', 'win', 'finisher', 'trick', 'trickStreak', 'comboBreak']);   // the biggest moments, mixed 1.25x hotter (and a blast of 5+)
// the stingers calm mode holds 4 dB down (the shield hit plays as 'hit'): how long each one keeps the sfx bus capped, in s
const STING = { frenzy: 0.7, second: 1.5, win: 4, lose: 3.5, hit: 0.7, shieldHit: 0.7 };
const CALM_STING = Math.pow(10, -4 / 20);
const CALM_SEND = 0.7;              // calm mode: the stingers' own send (1.25 normally) is capped here
const CALM_SLP = 6000;              // calm mode: the slow-mo / dip lowpass never closes below this
// calm mode's gentle master compressor (in the chain only while calm): -18 dB, ratio 3, and a trim that takes back
// the automatic makeup gain Web Audio adds (0.6 x the full-range gain reduction, here 12 dB, so 7.2 dB)
const CALM_COMP = { threshold: -18, knee: 6, ratio: 3, attack: 0.005, release: 0.2 };
const CALM_TRIM = Math.pow(10, -0.6 * (-CALM_COMP.threshold * (1 - 1 / CALM_COMP.ratio)) / 20);
const FX_TRIM = 0.7;                // the sfx bus trim after its compressor (see unlock)
// the music's loudness per arrangement level (L0, L1, L2) and in FRENZY: a gain in front of the glue compressor
export const INT_GAIN = [0.85, 1, 1.12], FRENZY_GAIN = 1.3;
export const RACE_TRIM = 0.7;      // the race groove (anything but the waiting room) sits 3 dB lower, under the rewards
const AEOL = [0, 2, 3, 5, 7, 8, 10];
const MUSIC_VOL = 0.5;
const MASTER = 1.12;
const CAP = 48;                     // concurrent sources before low priority voices are skipped (see setStage)
const CAP_STAGE = [48, 36, 28];     // the voice cap per quality stage (main.js's 0 full, 1 reduced, 2 lite)
const LOOK = 0.3;                   // how far ahead tick() schedules the beat and the heartbeat, in seconds
// the window in which this.next is trusted as the live grid (it runs up to LOOK + one 16th ahead)
const gridOk = (next, now, spb) => next >= now && next <= now + spb + LOOK + 0.05;
// sounds that never bend in slow-mo (menus and buttons)
const DUCK = { duck: true };       // tone()/hum() opts: this hit micro-ducks the music
const UI_SFX = new Set(['tap', 'buy', 'cards', 'reroll', 'countTick', 'ready', 'draftOn']);
const st = (s) => Math.pow(2, s / 12);
const pen = (i) => PENTA[i % 5] + 12 * Math.floor(i / 5);
const penD = (d) => PENTA[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5);   // pen() for any degree, negative ones included
const clamp01 = (v) => Math.max(0, Math.min(1, +v || 0));
// a diatonic third above semitone s (A natural minor), so harmonies never clash
const third = (s) => { const o = Math.floor(s / 12), r = s - 12 * o, d = AEOL.indexOf(r); if (d < 0) return s + 3; const d2 = d + 2; return AEOL[d2 % 7] + 12 * (o + Math.floor(d2 / 7)); };
const zoneOf = (bpm) => { let b = 0; for (let i = 1; i < ZONE_BPM.length; i++) if (Math.abs(ZONE_BPM[i] - bpm) < Math.abs(ZONE_BPM[b] - bpm)) b = i; return b; };
const P = (s) => [...s].map((ch) => ch === 'x');
const numArg = (k, key) => (k && typeof k === 'object' ? +k[key] || 0 : +k || 0);

// kick patterns by level, two bars each (A then B)
const KICK = [
  [P('x.........x.....'), P('x......x..x.....')],
  [P('x.....x...x..x..'), P('x..x......x...x.')],
  [P('x...x...x...x.x.'), P('x...x...x..xx...')],
];
// bass hum: [step, semitones over the chord root, length in steps]
const BASS = [
  [[0, 0, 3], [3, 0, 1], [6, 0, 2], [10, 0, 2], [14, 7, 2]],
  [[0, 0, 2], [3, 0, 1], [4, 12, 1], [6, 0, 2], [8, 0, 1], [10, 0, 2], [11, 12, 1], [13, 7, 1], [14, 10, 2]],
  [[0, 0, 1], [2, 12, 1], [3, 0, 1], [4, 0, 1], [6, 12, 1], [7, 0, 1], [8, 0, 1], [10, 12, 1], [11, 0, 1], [12, 7, 1], [13, 10, 1], [14, 12, 1], [15, 7, 1]],
];
// fills replace steps 8..15 of the last bar of a phrase. B kick, P Pf snare, K inward K,
// k rim, h/m/l mouth toms, Y a shouted "hey!"
const FILLS = [
  ['BP', 'P', 'P', 'P', 'BP', 'P', 'P', 'PK'],     // snare roll
  ['Bh', '', 'h', 'm', 'B', 'm', 'lK', 'K'],      // toms into inward Ks
  ['BP', '', '', '', 'Y', '', '', 'B'],           // the stop: silence, a "hey!", pickup
  ['h', 'h', 'm', 'm', 'Bl', 'l', 'kK', 'BP'],     // tom run
  ['B', 'k', 'K', 'B', 'k', 'K', 'BP', 'BP'],      // rim and suck
];
// minimum seconds between two plays of the same sfx
const GAP = {
  pass: 0, link: 0.03, drill: 0.025, sugar: 0.03, bonk: 0.08, bump: 0.06, pop: 0.04, spareBite: 0.3, dna: 0.05, tap: 0.025, heart: 0.3,
  close: 0.05, thread: 0.08, blast: 0.1, lockon: 1.2, edge: 0.12, dashPop: 0.08, land: 0.1, milestone: 0.3, event: 0.5, lowE: 0.25,
  comboBank: 0.2, comboBreak: 0.15, record: 0.5, legendary: 0.5, synergy: 0.3, eggClaim: 0.5, bossTaunt: 0.5, drillShove: 0.05,
  clutch: 0.12, finisher: 0.3, style: 0.2, loseClose: 0.5, drillLead: 0.15, rivalShove: 0.08, again: 0.2, ready: 0.15,
  synTease: 0.3, swat: 0.06, tell: 0.25, comboLow: 0.02, comboMilestone: 0.4, gateNear: 0.3, gateNearSlide: 0.3,
  fork: 0.5, backflow: 0.5, finale: 0.5, spot: 0.5,
  dnaTick: 0.03, rivalTell: 0.3, countered: 0.2, factory: 0.6, countTick: 0.04, medal: 0.4,
  go: 0.3, resume: 0.3, wall: 0.12, trick: 0.3, domino: 0.1, whoosh: 0.15,
  trickStreak: 0.3, overtaken: 0.5, gift: 0.1, bounty: 0.3,
  trickTease: 0.3, trickMiss: 0.3, draftOn: 0.06, slingReady: 0.25, goal: 0.4, pastBest: 0.4, grudge: 0.4,
};
// sfx that get a little random detune (+-15 cents) and volume (+-12%) so repeats never sound like a machine gun
const HUMAN = new Set(['sugar', 'dna', 'pop', 'bump', 'bonk', 'dash', 'dashPop']);
const PENTA12 = [0, 3, 5, 7, 10, 12];
const TR_SOFT = [0.14, 0.12], TR_HARD = [0.2, 0.18];   // _transient's two noise ticks: default, and the link / pass
// the prebaked kit voices (see _kit): the same filter, Q, attack and length the live hum() used for each
const KIT = {
  hat: { type: 'highpass', f: 8500, q: 0.7, a: 0.001, dur: 0.022 },
  ts: { type: 'highpass', f: 6000, q: 0.8, a: 0.004, dur: 0.13 },
  rim: { type: 'bandpass', f: 3800, q: 5, a: 0.001, dur: 0.02 },
};
// the nearest A minor pentatonic note (any octave) to a frequency, transposed into key `key`
const inKey = (f, key) => {
  const s = 12 * Math.log2(f / 440) - key, o = Math.floor(s / 12), r = s - 12 * o;
  let b = 0; for (const d of PENTA12) if (Math.abs(r - d) < Math.abs(r - b)) b = d;
  return 440 * st(key + 12 * o + b);
};
const rivalIdx = (k) => { const v = k && typeof k === 'object' ? k.k : k; return typeof v === 'number' && v >= 0 && v <= 4 ? v | 0 : -1; };
// freeze a param where it is at time t (mid-ramp included) before new automation
const hold = (p, t) => { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t); };
const fold = (f, top = 1760) => { while (f > top) f /= 2; return f; };

export class Audio {
  constructor() {
    this.ctx = null; this.muted = false; this.on = false;
    this._bpm = 96; this._int = 0; this.key = 0; this._lift = 0; this._ftier = 0;
    this.next = 0; this.stepI = 0; this.barBase = 0; this.fillBar = -1; this.fillN = 0;
    this.crashBar = -1; this.crashNext = false; this.curFill = -1;
    this.heat = 0; this.heatT = 0; this.live = 0; this.last = {}; this.motif = null; this.lastPass = 0;
    this.combo = 0; this.chord = PROG[0]; this._dryUntil = 0;
    this.musicVol = 1; this.sfxVol = 1; this.musicMuted = false; this.sfxMuted = false;
    this._tension = 0; this._slow = false;
    this._kicks = new Float64Array(8).fill(-99); this._kickI = 0;
    this._slotT = -1; this._slotG = null; this._blipN = 0; this._passF = 440;
    this._mdUntil = -1; this._mdLast = -1;
    this._linkN = 0;                           // last combo link count
    this._keyNext = null; this._keyBar = -1; this._keyCrash = false; this._whoopBar = -1;   // pending key change (lands on a downbeat)
    this._fin = 0; this._rollLen = 4;          // finale tempo push (+bpm), length of the pending _rollAt roll in 16ths
    this._themePend = true; this._themeAt = -99; this._varN = 0; this._themeOn = false;   // the theme's first bar, variation counter
    this.calm = false;                         // calm mode (reduced motion): no gasps, shallow ducks, slow filter moves
    this._thr = null; this._thrK = 0; this._thrPan = 0; this._slurpT = 0;   // proximity threat loop
    this._acid = null; this._acidL = 0; this._crackT = 0;                  // acid sizzle loop
    this._dnaN = 0; this._dnaT = -9;           // DNA streak: arpeggio root in pentatonic degrees
    this._loseV = -1; this._leadN = 0;         // last lose sting variant, drill lead retakes
    this._contest = false; this._hatDuck = -1; // contested drill, hats ducked under a lowE heartbeat until
    this._hd = 0; this._hv = 1;                // humanise: cents and volume factor for the sfx being built
    this._slowBig = false; this._slowOn = false; this._impUntil = -1; // big slow (bent beat), any slow, impact hold until
    this._mlift = 0; this._cTier = 0; this._rollAt = -1;  // combo milestone key lift, combo crash tier, 1-beat fill start step
    this._lowQ = -1; this._clT = -9; this._clQ = -1; this._clN = 0;   // lowE quarter, comboLow last call, slot and tick count
    this._zone = 0; this._zoneBar = 0; this._trem = 0; // current zone flavour, the bar it started, tremolo depth applied
    this._holdUntil = 0; this._softIn = false; // a win/lose stinger owns the stage until then (the groove waits, then counts back in)
    this._bankG = 0; this._bankAt = -9; this._bankPend = -1; this._bankTicks = 0;   // last bank grade, when, cascade fallback due time, helix ticks heard
    this._drillOn = false; this._duelK = null; this._eggK = -1;   // egg duel: drill running, who leads (-1 Kevin, 0..4 a rival, -2 a rival we cannot name)
    this._gaspUntil = -1; this._minA = 0; this._tickSeen = false;     // duelGasp beat cut, minimum attack while a calm stinger is built
    this._cap = CAP; this._lite = false; this._iv = 0;                // voice cap, lite mode (slow phones), the scheduler's own timer
    this._rate = 1; this._rateFrom = 1; this._rateT0 = -9; this._fxR = 1;   // slow-mo bend: target, ease-out start, the rate the sfx being built uses
    this._rematch = false; this._rmClose = false; this._rmOpen = false; this._drone = null; this._closeF = 0; this._closeAt = -9;   // rematch groove
    this._hs = 0;                              // the hat side for the 16th being built (0 left, 1 right)
    this._tlift = 0; this._tliftPend = false; this._tliftEnd = -1;   // a first trick's one-bar key lift: semitones, waiting to land, the bar it drops on
    this._cur = null; this._curK = 0; this._curPan = 0;              // the current (flow) loop
    this._thrZero = -1; this._curZero = -1; this._acidZero = -1;     // when each loop's level last fell to 0 (torn down 1.5 s later)
    this._outK = 0; this._outUntil = 0; this._outAt = 0;             // a win/lose stinger still ringing: its key, until when, its final chord's time
    this._lkPh = 0; this._lkBpm = 0; this._lkAt = -9;                // lockPhase(): the sim's beat phase, its bpm, when it was sampled
    this._lkHold = -1; this._lkSnap = true; this._snapN = 0;          // no hard snaps until (after a slow or hit-stop), a snap allowed (stale lock, new tempo), hard snaps so far (debug)
    this._teaseD = -1; this._teaseF = 0; this._teaseAt = -9; this._frzUntil = -1;   // trickTease's ladder degree and end note; a frenzy stinger playing until
    this._teaseB = 440; this._trickKinds = []; this._trickD = 0; this._trickB = 440; this._trickAt = -9; this._trickEnd = -1;   // trickTease's run base; the last trick's arpeggio (for trickStreak)
    this._bpmNext = null; this._dlyTo = 0;     // a tempo waiting for the next downbeat (see _landKey), the echoes' delay target
    this._popN = 0; this._popT = -9;           // pop chain: how many pops in a row (0..6), the last one's time
    this.igain = null; this._igTo = -1;        // the intensity gain in front of the glue compressor, its target (see _applyInt)
    this._brkN = 0;                            // the chain the last comboBreak destroyed (see 'comboBreak')
    this._capUntil = -1;                       // calm mode: the sfx bus is capped 4 dB down until then (see _calmCap)
    this._calmComp = null; this._calmTrim = null; this._layPan = null;   // calm mode's master compressor and its trim, the ladder layers' panners
    this.mono = false; this._stage = 0; this._pans = []; this._xfeed = []; this._kits = null; this._kitI = 0;   // mono output, quality stage, static panners, prebaked hats
    this._dec = () => { this.live--; };
    this._dec3 = () => { this.live -= 3; };   // a say() voice counts as 3 sources (its formant filters cost too)
  }

  // ------------------------------------------------------------------ public knobs
  get bpm() { return this._bpm; }
  // a new tempo never lands mid-bar either: while the beat runs it waits in _bpmNext and _landKey() applies it on the
  // next downbeat, together with the key (the echoes switch over there too, see _landBpm)
  set bpm(v) {
    v = +v || 96; const to = v + this._fin;
    if (to === (this._bpmNext !== null ? this._bpmNext : this._bpm)) return;
    const z = zoneOf(v);
    if (z !== this._zone) { this._zone = z; this._zoneBar = (this.stepI >> 4) + 1; this._themePend = true; }
    this._rekey();
    if (this.ctx && this.on) { this._queueFill(); this._bpmNext = to === this._bpm ? null : to; }
    else { this._bpm = to; this._bpmNext = null; this._syncDelay(); }
    this._applyTrem();
  }
  // the key the song is heading to (now, or on the next downbeat)
  get keyTarget() { return ZONE_KEY[this._zone] + this._lift + this._mlift + this._tlift; }
  // a key change waits for a downbeat (tick() lands it), so pads sung in the old key never clash with the
  // new one. whoop: a lift (FRENZY tier 3, combo milestone) also gets a rising "whoop" on step 12 of the
  // bar before and a crash on the landing.
  _rekey(whoop = false) {
    const k = this.keyTarget;
    if (!this.ctx || !this.on) { this.key = k; this._keyNext = null; this._whoopBar = -1; return; }
    const i = this.stepI & 15, bar = this.stepI >> 4;
    let nb = i === 0 ? bar : bar + 1;
    if (whoop) { const wb = i <= 12 ? bar : bar + 1; this._whoopBar = wb; nb = wb + 1; this._keyCrash = true; }
    this._keyBar = this._keyNext !== null ? Math.max(this._keyBar, nb) : nb;
    this._keyNext = k;
    if (k === this.key && !whoop) { this._keyNext = null; this._keyCrash = false; }
  }
  // called by tick() before each step: a pending key lands on its downbeat
  _landKey(t = this.next) {
    if ((this.stepI & 15) !== 0) return;
    const bar = this.stepI >> 4;
    if (this._bpmNext !== null) { this._bpm = this._bpmNext; this._bpmNext = null; this._syncDelay(t); this._lkSnap = true; }
    if (this._tliftEnd >= 0 && bar >= this._tliftEnd) {   // a trick's one-bar lift is over: straight back down on this downbeat
      this._tlift = 0; this._tliftEnd = -1;
      if (this._keyNext !== null) this._keyNext = this.keyTarget; else this.key = this.keyTarget;
    }
    if (this._keyNext === null || bar < this._keyBar) return;
    this.key = this._keyNext; this._keyNext = null;
    if (this._tliftPend && this._tlift) { this._tliftPend = false; this._tliftEnd = bar + 1; }
    if (this._keyCrash) { this.crashNext = true; this._keyCrash = false; }
  }
  _applyTrem() {           // the rapids' 6 Hz pad tremolo (a persistent LFO, its depth set per zone)
    if (!this.ctx || !this.tremD) return;
    const d = ZONE_FLAVOR[this._zone].sig === 'trem' && !this._menu(this._int) && !this.calm ? 0.45 : 0;   // calm: no 6 Hz throb
    if (d === this._trem) return; this._trem = d; this._setG(this.tremD.gain, d);
  }
  get intensity() { return this._int; }
  set intensity(v) {
    const old = this._int; this._int = +v || 0;
    if (!this.ctx) return;
    if (this._menu(old) !== this._menu(this._int)) { this._applyTlp(); this._applyTrem(); }
    if (this.on) {
      if (this._int >= 1.5 && old < 1.5) this.crashNext = true;
      if (this._int < 1.5 && old >= 1.5) this._deflate();
    }
    this._applyInt();
  }
  // the music's loudness for the current arrangement: L0 (and the menus) 0.85, L1 1, L2 1.12, any FRENZY tier 1.3
  _intGain() { const I = this._int; return this._ftier > 0 ? FRENZY_GAIN : INT_GAIN[I < 0.5 ? 0 : I < 1.3 ? 1 : 2]; }
  // what the intensity gain node really plays: _intGain(), times RACE_TRIM while the race groove plays (not the menus)
  _igainV() { return this._intGain() * (this._menu(this._int) ? 1 : RACE_TRIM); }
  // glide the intensity gain there (time constant 0.2 s); a call with nothing to change costs one compare
  _applyInt() {
    if (!this.ctx || !this.igain) return;
    const v = this._igainV(); if (v === this._igTo) return;
    this._igTo = v; const p = this.igain.gain, now = this.ctx.currentTime;
    p.cancelScheduledValues(now); p.setTargetAtTime(v, now, 0.2);
  }
  // 0..1 drama: a heartbeat bed on the groove's grid (half notes, quarters, then quarters with a pickup lub: see
  // _heartStep), and above 0.5 the music closes down to 1200 Hz
  get tension() { return this._tension; }
  set tension(v) {
    this._tension = clamp01(v);
    this._applyTlp();
  }
  // the egg drill: pass every drilling agent's progress 0..1 (yours included), or [] / null when no drill.
  // Two or more rings within 15% of each other is a contested drill: the heartbeat never drops below 0.6.
  drillRings(list) {
    let on = false;
    if (list && list.length > 1) {
      const a = [...list].map((x) => +x || 0).sort((x, y) => x - y);
      for (let i = 1; i < a.length && !on; i++) if (a[i] - a[i - 1] <= 0.15) on = true;
    }
    this._contest = on;
    this._drillOn = !!(list && list.length);
    if (!this._drillOn) this._duelK = null;
    return on;
  }
  // the egg duel's breath: main.js calls it once when the leading drill passes 0.9. The band cuts out for one
  // beat from the next 16th (a quick inhale on the fx bus, skipped in calm mode), then crashes back in.
  duelGasp() {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime, spb = 60 / this._bpm / 4, q = this._unsched(now);
    this._gaspUntil = q + 4 * spb;
    if (this.muted || this.calm || c.state !== 'running') return;
    this.hum(Math.max(now + 0.005, q - 0.16), 0.16, 0.12, 'bandpass', 900, 1.6, this.fx, 3200, 0.12);   // the inhale, just before the cut
  }
  // 0..1: where the music is inside the current beat (0 on the beat). Uses the step clock while the beat runs,
  // else the audio clock at the current bpm, else 0. render.js and main.js can pulse in time with it.
  beatPhase() {
    const c = this.ctx; if (!c) return 0;
    const now = c.currentTime, spb = 60 / this._bpm / 4;
    if (this.on && this.next && this.next >= now - 0.01 && this.next <= now + spb + LOOK + 0.05) {
      const j = Math.ceil((this.next - now) / spb - 1e-6), idx = this.stepI - j, ts = this.next - j * spb;
      const ph = ((((idx & 3) + 4) & 3) + Math.max(0, Math.min(1, (now - ts) / spb))) / 4;
      return Math.max(0, Math.min(0.9999, ph));
    }
    const b = now / (spb * 4); return b - Math.floor(b);
  }
  // lock the music to the sim's beat, so the hairs that swat "on the beat" really do, by ear. main.js calls it once
  // per live frame with ((race.t * z.beat / 60) % 1, z.beat): the sim's phase 0..1 inside its current beat and its
  // bpm. Only the sample is stored here (no allocation, safe every frame); tick() does the pulling in _lockStep().
  // The music follows the sim, never the reverse.
  lockPhase(simPhase, bpm) {
    const c = this.ctx; if (!c || this.muted) return;
    const ph = +simPhase, b = +bpm; if (!(ph >= 0) || !(b > 0)) return;
    const now = c.currentTime;
    if (now - this._lkAt > 0.25 || Math.abs(b - this._lkBpm) > 0.5) this._lkSnap = true;   // back from a gap, or a new tempo: one snap allowed
    this._lkPh = ph - Math.floor(ph); this._lkBpm = b; this._lkAt = now;
  }
  // before each 16th is built: where is the sim's beat at this step's start time? Pull the step toward it by at most
  // 4 ms (8 ms when it is more than a quarter beat off). A hard snap (whole 16ths at once) is allowed only once after
  // the lock went stale (over 0.25 s without a sample: a draft card, pause, the menus) or after a tempo / zone change
  // (_lkSnap), and never within 2.5 s after a slow-mo or a hit-stop ends (_lkHold): the sim's clock crawled on purpose
  // there, and snapping by whole 16ths right after it made the beat skip. In that window it only nudges, 8 ms a 16th
  // at most. Skipped when the sample is stale, during a slow-mo or hit-stop, and when the tempos differ (the finale's
  // +6 bpm push is meant to run ahead). _snapN counts the hard snaps (debug).
  _lockStep(now) {
    const b = this._lkBpm, spb = 60 / this._bpm / 4;
    if (!(b > 0) || now - this._lkAt > 0.25 || this._slowOn || now < this._impUntil) return;
    if (Math.abs(b - this._bpm) > 0.5) { this._lkSnap = true; return; }   // a tempo change is on its way: snap once it lands
    let e = this._lkPh + (this.next - this._lkAt) * b / 60 - (this.stepI & 3) / 4;   // sim phase minus music phase, in beats
    e -= Math.round(e);                                                               // wrapped to -0.5..0.5
    const far = Math.abs(e) > 0.25;
    if (far && this._lkSnap && now >= this._lkHold) {   // snap: move the step index by whole 16ths, then the start time by what is left
      const n = e * 4, ni = Math.round(n);
      this.stepI += ni; if (this.stepI < 0) this.stepI += 16; this.next -= (n - ni) * spb;
      this._snapN++;
    } else { const m = far || now < this._lkHold ? 0.008 : 0.004; this.next -= Math.max(-m, Math.min(m, e * 4 * spb)); }
    if (now >= this._lkHold) this._lkSnap = false;   // a snap still owed (a zone change inside the hold) waits for the hold to end
    if (this.next < now) this.next = now;
  }
  // ------------------------------------------------------------------ proximity loops (main.js sets both every frame)
  // threat(k, pan): something nasty is close. k 0..1 (0 = nothing near), pan -1..1. A looped growl: three saws
  // (55 Hz twice, detuned, and 110 Hz) through a lowpass that wobbles 180..320 Hz at 3 Hz, plus, at 0.6x, the
  // same saws through a 520 Hz bandpass (Q 3) that the same LFO sweeps +-120 Hz: the band a phone speaker can
  // actually play. A 9 Hz flutter (depth 0.35) makes it a growl, not a hum. Level (0.2 calm 0.12) * k^1.5,
  // plus a wet slurp from tick() every 0.6 s (0.4 s above k 0.7). Nodes are built on first use; only the gain
  // and pan move (20 ms time constants), so a call per frame costs two compares. Once k has sat at 0 for 1.5 s
  // the loop is torn down (_reapLoops) and rebuilt on the next k > 0. Silent when muted or sfx are off. Calm
  // mode keeps the warning (it is information, not juice) but softens it: the filters held still, no flutter,
  // and a slurp every 0.9 s.
  threat(k, pan = 0) {
    k = this.muted || this.sfxMuted ? 0 : clamp01(k); pan = Math.max(-1, Math.min(1, +pan || 0));
    if (!this.ctx) { this._thrK = k; return; }
    const now = this.ctx.currentTime;
    if (k > 0) this._thrZero = -1; else if (this._thrZero < 0) this._thrZero = now;
    if (!this._thr) { if (k <= 0) return; this._thr = this._loopThreat(); this._thrK = 0; this._thrStyle(); }
    const n = this._thr;
    if (Math.abs(k - this._thrK) > 0.004 || (k === 0 && this._thrK !== 0)) { n.g.gain.setTargetAtTime((this.calm ? 0.12 : 0.2) * Math.pow(k, 1.5), now, 0.02); this._thrK = k; }
    if (n.p && Math.abs(pan - this._thrPan) > 0.02) { n.p.pan.setTargetAtTime(this._panV(pan), now, 0.02); this._thrPan = pan; }
    this._reapLoops(now);
  }
  _loopThreat() {
    const c = this.ctx, g = c.createGain(); g.gain.value = 0;
    const fl = c.createGain(); fl.gain.value = 1;                     // the 9 Hz flutter rides on this gain
    let out = g; const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { p.pan.value = this._panV(this._thrPan); g.connect(p); p.connect(this.fx); out = p; } else g.connect(this.fx);
    fl.connect(g);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 250; lp.Q.value = 4;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 3;
    const bg = c.createGain(); bg.gain.value = 0.6;
    const lfo = c.createOscillator(), ld = c.createGain(), bd = c.createGain(); lfo.frequency.value = 3;
    ld.gain.value = 70; bd.gain.value = 120;                          // lowpass 250 +- 70 Hz, bandpass 520 +- 120 Hz
    lfo.connect(ld); ld.connect(lp.frequency); lfo.connect(bd); bd.connect(bp.frequency);
    const fo = c.createOscillator(), fd = c.createGain(); fo.frequency.value = 9; fd.gain.value = 0.35;
    fo.connect(fd); fd.connect(fl.gain);
    const src = [lfo, fo], nodes = [g, fl, lp, bp, bg, ld, bd, fd];
    if (p) nodes.push(p);
    for (const [f, det] of [[55, -7], [55, 7], [110, 0]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.connect(bp); src.push(o);
    }
    lp.connect(fl); bp.connect(bg); bg.connect(fl);
    for (const s of src) s.start();
    return { g, p, out, lp, ld, bp, bd, fd, src, nodes };
  }
  // calm mode holds the growl's filters still (lowpass 240 Hz, bandpass 520 Hz) and drops the flutter
  _thrStyle() {
    const n = this._thr; if (!n || !this.ctx) return;
    const now = this.ctx.currentTime;
    n.ld.gain.setTargetAtTime(this.calm ? 0 : 70, now, 0.05); n.lp.frequency.setTargetAtTime(this.calm ? 240 : 250, now, 0.05);
    n.bd.gain.setTargetAtTime(this.calm ? 0 : 120, now, 0.05); n.fd.gain.setTargetAtTime(this.calm ? 0 : 0.35, now, 0.05);
  }
  // 0..1: the player is in acid. A 3000 Hz bandpassed noise sizzle at 0.08 * level, and a crackle tick every
  // 0.12 s from tick(). Same rules as threat(): built on first use, cheap every frame, never clicks, torn down
  // after 1.5 s at 0.
  get acid() { return this._acidL; }
  set acid(v) {
    v = this.muted || this.sfxMuted ? 0 : clamp01(v);
    if (!this.ctx) { this._acidL = v; return; }
    const now = this.ctx.currentTime;
    if (v > 0) this._acidZero = -1; else if (this._acidZero < 0) this._acidZero = now;
    if (!this._acid) {
      if (v <= 0) return;
      const c = this.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noiseBuf; s.loop = true; bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 1.4; g.gain.value = 0;
      s.connect(bp); bp.connect(g); g.connect(this.fx); s.start();
      this._acid = { g, src: [s], nodes: [bp, g] }; this._acidL = 0;
    }
    if (Math.abs(v - this._acidL) > 0.004 || (v === 0 && this._acidL !== 0)) { this._acid.g.gain.setTargetAtTime(0.08 * v, now, 0.02); this._acidL = v; }
    this._reapLoops(now);
  }
  // current(k, pan): the player rides a flow current. k 0..1 (0 = out of it), pan -1..1 (the current's direction).
  // A looped noise through a 600..900 Hz bandpass, then a lowpass sweeping 700..1500 Hz at 0.3 Hz (the water
  // breathing), at 0.05 * k, panned pan * 0.6. In over 0.15 s, out over 0.3 s. Built on the first entry, torn
  // down after 1.5 s at 0; a call per frame only compares two numbers. Silent when muted or sfx are off.
  current(k, pan = 0) {
    k = this.muted || this.sfxMuted ? 0 : clamp01(k); pan = Math.max(-1, Math.min(1, +pan || 0));
    if (!this.ctx) { this._curK = k; return; }
    const now = this.ctx.currentTime;
    if (k > 0) this._curZero = -1; else if (this._curZero < 0) this._curZero = now;
    if (!this._cur) { if (k <= 0) return; this._cur = this._loopCurrent(); this._curK = 0; }
    const n = this._cur;
    if (Math.abs(k - this._curK) > 0.004 || (k === 0 && this._curK !== 0)) {
      n.g.gain.cancelScheduledValues(now); n.g.gain.setTargetAtTime(0.05 * k, now, k > this._curK ? 0.05 : 0.1); this._curK = k;
    }
    if (n.p && Math.abs(pan - this._curPan) > 0.02) { n.p.pan.setTargetAtTime(this._panV(pan * 0.6), now, 0.05); this._curPan = pan; }
    this._reapLoops(now);
  }
  _loopCurrent() {
    const c = this.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    bp.type = 'bandpass'; bp.frequency.value = 735; bp.Q.value = 2.4;          // about 600..900 Hz
    lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 1.2;
    const lfo = c.createOscillator(), ld = c.createGain(); lfo.frequency.value = 0.3; ld.gain.value = 400;   // 1100 +- 400 Hz
    lfo.connect(ld); ld.connect(lp.frequency); lfo.start();
    g.gain.value = 0; s.connect(bp); bp.connect(lp); lp.connect(g);
    let p = null;
    if (c.createStereoPanner) { p = c.createStereoPanner(); p.pan.value = this._panV(this._curPan * 0.6); g.connect(p); p.connect(this.fx); } else g.connect(this.fx);
    s.start();
    return { g, p, src: [s, lfo], nodes: p ? [bp, lp, ld, g, p] : [bp, lp, ld, g] };
  }
  // a loop whose level has sat at 0 for 1.5 s stops its sources and lets go of its nodes (called from the setters
  // and from tick(), since main.js sets a loop to 0 once and then stops calling)
  _reapLoops(now) {
    if (this._thr && this._thrK === 0 && this._thrZero >= 0 && now - this._thrZero >= 1.5) this._killLoop('_thr');
    if (this._cur && this._curK === 0 && this._curZero >= 0 && now - this._curZero >= 1.5) this._killLoop('_cur');
    if (this._acid && this._acidL === 0 && this._acidZero >= 0 && now - this._acidZero >= 1.5) this._killLoop('_acid');
  }
  // tear one loop down now: a 10 ms fade, the sources stop 60 ms later and the chain is disconnected when they end
  _killLoop(key) {
    const n = this[key]; this[key] = null;
    if (key === '_thr') { this._thrK = 0; this._thrZero = -1; } else if (key === '_cur') { this._curK = 0; this._curZero = -1; } else { this._acidL = 0; this._acidZero = -1; }
    if (!n || !this.ctx) return;
    const now = this.ctx.currentTime, end = now + 0.06;
    hold(n.g.gain, now); n.g.gain.setTargetAtTime(0, now, 0.01);
    const off = () => { for (const x of n.src) { try { x.disconnect(); } catch (e) { /* ignore */ } } for (const x of n.nodes) { try { x.disconnect(); } catch (e) { /* ignore */ } } };
    if (n.src[0]) n.src[0].onended = off;
    for (const x of n.src) { try { x.stop(end); } catch (e) { /* ignore */ } }
  }
  // all three loops down at once (the title, a muffled card deal or pause, a new run): they rebuild on the next k > 0
  _killLoops() { if (this._thr) this._killLoop('_thr'); if (this._cur) this._killLoop('_cur'); if (this._acid) this._killLoop('_acid'); }
  // the one-shot parts of the loops, scheduled from tick()
  _loops(now) {
    if (this._thr && this._thrK > 0.03 && now >= this._slurpT) {   // a wet slurp: a resonant filter gulping up and back
      const k = this._thrK, t = now + 0.01;
      this._slurpT = now + (this.calm ? 0.9 : k > 0.7 ? 0.4 : 0.6);
      this.hum(t, 0.14, 0.12 * k, 'bandpass', 280, 7, this._thr.out, 900, 0.01, 0);
      this.tone('sine', 160, 90, t + 0.04, 0.08, 0.1 * k, this._thr.out, 0.004, 0, 0);
    }
    if (this._acid && this._acidL > 0.03 && now >= this._crackT) {   // a crackle tick
      this._crackT = now + 0.12; const t = now + 0.005 + Math.random() * 0.03;
      this.hum(t, 0.004, 0.06 * this._acidL + 0.02, 'bandpass', 2500 + Math.random() * 3500, 3, this.fx, 0, 0.0008, 0);
    }
  }

  // 0..1, how hard the last kick still pushes (render.js can pulse the screen on the beat)
  get pulse() {
    if (!this.ctx) return 0;
    const now = this.ctx.currentTime; let best = -99;
    for (let i = 0; i < 8; i++) { const k = this._kicks[i]; if (k <= now && k > best) best = k; }
    return best < 0 ? 0 : Math.exp(-(now - best) * 9);
  }

  unlock() {
    if (this.ctx) {
      if (!this._suspended) { this._startClock(); if (this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) { /* ignore */ } } }
      return;
    }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!AC) return;
    let c; try { c = new AC(); } catch (e) { return; }
    this.ctx = c;
    // master: gain, a 70 Hz highpass (a phone speaker cannot play below it, so that energy only eats
    // headroom and makes the limiter pump), then a soft-kneed limiter so a pile of hits never clips
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : MASTER;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70; hp.Q.value = 0.7;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.15;
    // the compressor node adds its own makeup gain, so a soft clipper after it holds true peaks under -1 dBFS
    const clip = c.createWaveShaper(), cn = 2048, cc = new Float32Array(cn), knee = 0.7, ceil = 0.88;
    for (let i = 0; i < cn; i++) {
      const x = i / (cn - 1) * 2 - 1, a = Math.abs(x);
      cc[i] = Math.sign(x) * (a <= knee ? a : knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee)));
    }
    clip.curve = cc; clip.oversample = '2x';
    this.master.connect(hp); hp.connect(lim); lim.connect(clip); clip.connect(c.destination); this.limiter = lim; this.hp = hp;
    // calm mode's gentle master compressor and its makeup trim: built now, patched in between master and hp only while
    // calm (see _calmRoute), so the normal chain stays exactly as it is
    const cc2 = c.createDynamicsCompressor();
    for (const key of Object.keys(CALM_COMP)) cc2[key].value = CALM_COMP[key];
    const ctr = c.createGain(); ctr.gain.value = CALM_TRIM; cc2.connect(ctr);
    this._calmComp = cc2; this._calmTrim = ctr; this._calmIn = false;
    // sound effects: own volume, then a soft bus compressor so stacked hits stay even. The compressor
    // adds about +6 dB of automatic makeup gain, so a 0.7 trim after it keeps stacked hits off the limiter
    // (0.7, not less: the combo blips have to cut through the music on a phone speaker)
    this.fx = c.createGain(); this.fx.gain.value = this._fxLevel();
    const fc = c.createDynamicsCompressor();
    fc.threshold.value = -14; fc.knee.value = 6; fc.ratio.value = 4; fc.attack.value = 0.003; fc.release.value = 0.12;
    const ft = c.createGain(); ft.gain.value = FX_TRIM;
    this.fx.connect(fc); fc.connect(ft); ft.connect(this.master); this.fxComp = fc; this.fxTrim = ft;
    // music bus: gain (volume and ducking) -> micro duck -> muffle lp -> slowmo lp -> tension/menu lp
    //            -> 250 Hz lift -> 2.5 kHz presence -> top shelf -> glue compressor -> trim -> intensity gain -> master
    this.music = c.createGain(); this.music.gain.value = this._mLevel();
    this.mduck = c.createGain(); this.mduck.gain.value = 1;
    // the whistled lead's own gain (see _whistle, _leadDip): a combo note can make room for the theme hook
    this.leadBus = c.createGain(); this.leadBus.gain.value = 1; this.leadBus.connect(this.music);
    const lp = (f) => { const b = c.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = 0.6; return b; };
    this.mlp = lp(18000); this.slp = lp(18000); this.tlp = lp(18000);
    // the lift sits at 250 Hz (the lowest band a phone speaker really plays) and a +3 dB presence band at 2.5 kHz
    // carries the snares, hats and the choir's consonants
    const peak = c.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 250; peak.Q.value = 0.9; peak.gain.value = 3;
    const pres = c.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2500; pres.Q.value = 1; pres.gain.value = 3;
    const shelf = c.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 9000; shelf.gain.value = -2;
    // the intensity arc: L0 0.85, L1 1, L2 1.12, FRENZY 1.3 (times RACE_TRIM in the race), after the glue compressor so
    // it is heard as a real level change, not squashed back (see _applyInt)
    this.igain = c.createGain(); this.igain.gain.value = this._igainV(); this._igTo = this.igain.gain.value;
    const mc = c.createDynamicsCompressor();
    mc.threshold.value = -16; mc.knee.value = 6; mc.ratio.value = 3; mc.attack.value = 0.01; mc.release.value = 0.25;
    this.music.connect(this.mduck); this.mduck.connect(this.mlp); this.mlp.connect(this.slp); this.slp.connect(this.tlp);
    this.tlp.connect(peak); peak.connect(pres); pres.connect(shelf); shelf.connect(mc); this.mcomp = mc;
    // the glue compressor's automatic makeup gain is about +8 dB: trim it back so the music alone stays clear of the limiter
    const mt = c.createGain(); mt.gain.value = 0.8; mc.connect(mt); mt.connect(this.igain); this.igain.connect(this.master);
    // a dotted-eighth echo, the beatboxer's favourite pedal: one for the music, one for the fx
    const mkEcho = (dest, fbv, wetv) => {
      const inp = c.createGain(), d = c.createDelay(1.5), dl = c.createBiquadFilter(), fb = c.createGain(), wet = c.createGain();
      d.delayTime.value = 3 * 60 / this._bpm / 4; dl.type = 'lowpass'; dl.frequency.value = 2400; fb.gain.value = fbv; wet.gain.value = wetv;
      inp.connect(d); d.connect(dl); dl.connect(fb); fb.connect(d); dl.connect(wet); wet.connect(dest);
      return { inp, d, fb };
    };
    // the music's echo ping-pongs: tap 1 leans left, tap 2 right, and so on. Each side keeps a 0.33 crossfeed into
    // the other channel (about pan 0.6), so a mono phone speaker still hears every tap
    this._xfeed = [];   // the ping-pong's crossfeed gains (1 in mono: every tap in both ears)
    const pingPong = (dest, fbv, wetv) => {
      const inp = c.createGain(), dL = c.createDelay(1.5), dR = c.createDelay(1.5), lpL = c.createBiquadFilter(), lpR = c.createBiquadFilter();
      const fbL = c.createGain(), fbR = c.createGain(), wet = c.createGain(), dt = 3 * 60 / this._bpm / 4;
      dL.delayTime.value = dt; dR.delayTime.value = dt; wet.gain.value = wetv; fbL.gain.value = fbv; fbR.gain.value = fbv;
      for (const f of [lpL, lpR]) { f.type = 'lowpass'; f.frequency.value = 2400; }
      inp.connect(dL); dL.connect(lpL); lpL.connect(fbL); fbL.connect(dR); dR.connect(lpR); lpR.connect(fbR); fbR.connect(dL);
      let mg = null;
      if (c.createChannelMerger) {
        mg = c.createChannelMerger(2);
        const side = (src, own, other) => { src.connect(mg, 0, own); const x = c.createGain(); x.gain.value = this.mono ? 1 : 0.33; src.connect(x); x.connect(mg, 0, other); this._xfeed.push(x); };
        side(lpL, 0, 1); side(lpR, 1, 0); mg.connect(wet);
      } else { lpL.connect(wet); lpR.connect(wet); }
      wet.connect(dest);
      return { inp, d: dL, d2: dR, fb: fbL, fb2: fbR };
    };
    const me = pingPong(this.music, 0.33, 0.25), fe = mkEcho(this.fx, 0.3, 0.25);
    this._dlyTo = Math.min(1.4, 3 * 60 / this._bpm / 4);
    this.echo = me.inp; this.delay = me.d; this.delayR = me.d2; this.mfb = me.fb; this.mfb2 = me.fb2;
    this.fxEcho = fe.inp; this.fxDelay = fe.d; this.ffb = fe.fb;
    // stereo width on the music bus, never wider than |pan| 0.6: hats alternate -0.25 / +0.25 on even and odd
    // 16ths, the rim sits at +0.35 (see hat(), ts(), rim()); pads are double voiced (see _pad())
    const pan = (v) => { if (!c.createStereoPanner) return this.music; const p = c.createStereoPanner(); p.pan.value = this._panV(v); p.connect(this.music); this._pans.push([p, v]); return p; };
    this.hatPan = [pan(-0.25), pan(0.25)]; this.rimPan = pan(0.35);
    // the ladder's octave layer splits to -0.4 / +0.4 from link 20 (see _layers): two persistent panners on the fx bus
    if (c.createStereoPanner) {
      this._layPan = [-0.4, 0.4].map((v) => { const p = c.createStereoPanner(); p.pan.value = this._panV(v); p.connect(this.fx); this._pans.push([p, v]); return p; });
    }
    // shared noise
    const len = c.sampleRate; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = this.noiseBuf; // legacy name
    this._bakeKits();
    // the choir: two persistent vowel filter banks (pads sing "ooh", stabs go "wah")
    // the pads pass a tremolo gain: a persistent 6 Hz LFO whose depth is 0 except in the rapids
    // the pads sing through two banks, one panned -0.4 and one +0.4, each voice detuned -7 / +7 cents (see _pad)
    this.padBank = this._bank('oo', 2.4); this.padBankR = this._bank('oo', 2.4); this.padTrem = c.createGain(); this.padTrem.gain.value = 1;
    for (const [b, pv] of [[this.padBank, -0.4], [this.padBankR, 0.4]]) {
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = this._panV(pv); b.out.connect(p); p.connect(this.padTrem); this._pans.push([p, pv]); } else b.out.connect(this.padTrem);
    }
    this.padTrem.connect(this.music);
    this.tremD = c.createGain(); this.tremD.gain.value = 0; this._trem = 0;
    const lfo = c.createOscillator(); lfo.frequency.value = 6; lfo.connect(this.tremD); this.tremD.connect(this.padTrem.gain); lfo.start();
    const ps = c.createGain(); ps.gain.value = 0.35; this.padBank.out.connect(ps); this.padBankR.out.connect(ps); ps.connect(this.echo);
    // the kick's body goes through a tanh shaper (drive 3, out 0.6): 2nd and 3rd harmonics around 200..400 Hz,
    // where a phone speaker can actually play the kick (see B())
    const kc = new Float32Array(1024); for (let i = 0; i < 1024; i++) kc[i] = Math.tanh(3 * (i / 1023 * 2 - 1));
    this._kickCurve = kc; this._kickSh = new WeakMap();
    this.stabBank = this._bank('ah', 2.8); this.stabBank.out.connect(this.music);
    // the hummed bass shares one lowpass and one soft-clip shaper (harmonics a phone can play)
    this.bassLp = c.createBiquadFilter(); this.bassLp.type = 'lowpass'; this.bassLp.frequency.value = 500; this.bassLp.Q.value = 5;
    const sh = c.createWaveShaper(), n = 1024, curve = new Float32Array(n), dr = 2.5, nrm = Math.tanh(dr);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(dr * x) / nrm; }
    sh.curve = curve; sh.oversample = '2x';
    const bo = c.createGain(); bo.gain.value = 0.7;
    this.bassLp.connect(sh); sh.connect(bo); bo.connect(this.music); this.shaper = sh;
    this._applyTlp(); this._applyTrem(); this._calmRoute();
    this._startClock();
  }
  // the scheduler's own clock: tick() every 40 ms, so the beat keeps its lookahead even when frames stall
  // (main.js still calls tick() every frame; tick() is idempotent, a second call in the same ms does nothing)
  _startClock() {
    if (this._iv || typeof setInterval !== 'function') return;
    this._iv = setInterval(() => { try { this.tick(); } catch (e) { /* never let a sound break the clock */ } }, 40);
  }
  _stopClock() { if (this._iv) { clearInterval(this._iv); this._iv = 0; } }

  // ------------------------------------------------------------------ volume, mute, lifecycle
  // the sliders are perceptual: the stored 0..1 value v plays at gain v * v (half way is about -12 dB, not -6)
  _mLevel() { const v = this.musicVol; return this.musicMuted || v <= 0 ? 0 : MUSIC_VOL * v * v; }
  _fxLevel() { const v = this.sfxVol; return this.sfxMuted || v <= 0 ? 0 : v * v; }
  _setG(param, v) { if (!this.ctx) return; const t = this.ctx.currentTime; param.cancelScheduledValues(t); param.setTargetAtTime(v, t, 0.05); }
  setMusicVol(v) { this.musicVol = clamp01(v); if (this.music) this._setG(this.music.gain, this._mLevel()); }
  setSfxVol(v) { this.sfxVol = clamp01(v); if (this.fx) this._setG(this.fx.gain, this._fxLevel()); }
  setMusicMuted(m) { this.musicMuted = !!m; this.setMusicVol(this.musicVol); }
  setSfxMuted(m) { this.sfxMuted = !!m; this.setSfxVol(this.sfxVol); }
  setMuted(m) {             // master mute: everything, internal stingers included
    this.muted = !!m;
    if (this.master) { const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.muted ? 0 : MASTER, t); }
  }
  // app hidden / shown: stop the clock, and on return restart the grid so queued notes do not burst
  suspend() {
    this._suspended = true; this._stopClock();
    if (this.ctx && this.ctx.state === 'running') { try { this.ctx.suspend(); } catch (e) { /* ignore */ } }
  }
  resume() {
    this._suspended = false; const c = this.ctx; if (!c) return;
    const reset = () => { this.next = c.currentTime + 0.05; this._slotT = -1; };
    reset(); this._startClock();
    try { const p = c.resume(); if (p && p.then) p.then(reset, () => {}); } catch (e) { /* ignore */ }
  }
  // dull the music (pause menu, mutation cards). Optional: the game works without calling it.
  // A muffle (a card deal, pause) also tears the proximity loops down; they rebuild when main.js sets them again.
  setMuffle(on) { if (!this.ctx) return; if (on) this._killLoops(); const t = this.ctx.currentTime; this.mlp.frequency.cancelScheduledValues(t); this.mlp.frequency.setTargetAtTime(on ? 650 : 18000, t, this._ftc(on ? 0.06 : 0.15)); }
  // calm mode (main.js passes S.reduced): no hit-stop gasps or micro ducks, ducks never below 0.8, filter
  // moves take about 0.4 s, and the proximity growl is softer and steadier (see threat()). It tames peaks too: the
  // stingers (frenzy, second, win, the shield hit) play 4 dB lower, every heartbeat (the duel bed included) loses
  // 6 dB under 80 Hz, and the music drops its fast throbs (the rapids' 6 Hz pad tremolo, a long roll's 32nds).
  // Calm also caps the stingers' own send at 0.7 (CALM_SEND, frenzy / second / shield hit / win / lose), keeps the slow-mo
  // lowpass at 6 kHz or above (CALM_SLP), and patches a gentle master compressor (-18 dB, ratio 3) into the chain.
  // setCalm(false) puts all of it back.
  setCalm(b) {
    const was = this.calm; this.calm = !!b; if (was === this.calm) return;
    this._thrStyle(); this._applyTrem(); this._calmRoute();
    if (this.ctx && this.slp && (this._slowOn || this.ctx.currentTime < this._impUntil)) this._slpTo(this._slowF(), 0.05);   // a slow running now moves to the new floor
    if (!this.calm && this.fxTrim && this.ctx) { const now = this.ctx.currentTime; this._capUntil = -1; hold(this.fxTrim.gain, now); this.fxTrim.gain.setTargetAtTime(FX_TRIM, now, 0.02); }
    if (this._thr && this._thrK > 0) { const k = this._thrK; this._thrK = -1; this.threat(k, this._thrPan); }   // re-level the growl now
  }
  // quality stage (main.js's 0 full, 1 reduced, 2 lite): the voice cap drops 48 / 36 / 28, and stage 2 (lite) also
  // sings say() vowels without their harmony voices. Safe before unlock() (it only sets numbers).
  setStage(st) {
    st = Math.max(0, Math.min(2, (+st || 0) | 0));
    this._stage = st; this._cap = CAP_STAGE[st]; this._lite = st >= 2;
  }
  // the old switch, kept as an alias: setLite(true) is stage 2; setLite(false) leaves a stage 1 alone
  setLite(on) { if (on) this.setStage(2); else if (this._stage >= 2) this.setStage(0); }
  // mono output (one earbud, a phone held sideways): every pan goes to the centre, the ping-pong echo feeds both ears,
  // and the cilia 'tell' fizz plays about 3 dB hotter so it still cuts through. Safe before unlock().
  setMono(b) {
    this.mono = !!b;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [p, v] of this._pans) { p.pan.cancelScheduledValues(now); p.pan.setValueAtTime(this._panV(v), now); }
    for (const x of this._xfeed || []) { x.gain.cancelScheduledValues(now); x.gain.setValueAtTime(this.mono ? 1 : 0.33, now); }
    if (this._thr && this._thr.p) this._thr.p.pan.setTargetAtTime(this._panV(this._thrPan), now, 0.02);
    if (this._cur && this._cur.p) this._cur.p.pan.setTargetAtTime(this._panV(this._curPan * 0.6), now, 0.05);
  }
  _panV(v) { return this.mono ? 0 : v; }
  // calm on: master -> calm compressor -> trim -> hp; calm off: master -> hp, exactly as unlock() built it
  _calmRoute() {
    if (!this.ctx || !this._calmComp || !this.hp || this._calmIn === this.calm) return;
    try {
      // the disconnect goes first: a browser that cannot disconnect one destination throws before anything changed
      if (this.calm) { this.master.disconnect(this.hp); this.master.connect(this._calmComp); this._calmTrim.connect(this.hp); }
      else { this.master.disconnect(this._calmComp); this._calmTrim.disconnect(this.hp); this.master.connect(this.hp); }
      this._calmIn = this.calm;
    } catch (e) { /* an old browser without selective disconnect: keep the chain as it is */ }
  }
  // a one-shot sound's panner in front of dest (none at all in mono, or when the browser has no StereoPanner)
  _panned(v, dest = this.fx) {
    const c = this.ctx; v = this._panV(v);
    if (!v || !c.createStereoPanner) return dest;
    const p = c.createStereoPanner(); p.pan.value = v; p.connect(dest); return p;
  }
  _ftc(tc) { return this.calm ? Math.max(tc, 0.4 / 3) : tc; }   // filter time constant (3 tc is about the full move)
  // bullet time. slowmo(on, big): every slow pulls the music behind a lowpass (time constant 0.03 s, so it
  // never clicks). Only big ones (first FRENZY, egg drill start, zone-end crawl) also play a tape stop on
  // the way in, bend the beat to a half-time kick, let the echo hang on, and come out with a reversed
  // swell that lands on the grid with a soft crash. Idempotent: repeat calls with the same value do
  // nothing, and a big call during a small slow upgrades it. slowmo(true) alone is a small slow.
  slowmo(on, big = false) {
    if (!this.ctx) return; on = !!on; big = !!big;
    if (on && this._slowOn && (!big || this._slowBig)) return;
    if (!on && !this._slowOn) return;
    const c = this.ctx, now = c.currentTime, t = now + 0.005, fx = this.fx;
    const wasBig = this._slowBig, play = !this.muted && c.state === 'running';
    if (on) {
      this._slowOn = true; this._slowBig = this._slowBig || big; this._slow = this._slowBig;
      this._rate = this._slowBig ? 0.72 : 0.85; this._rateT0 = -9;
      this._slpTo(this._slowF(), 0.03);
      if (big && !wasBig) {
        this._setG(this.mfb.gain, 0.45); this._setG(this.mfb2.gain, 0.45);
        if (play) {           // tape stop: a saw and a hiss both sag from 900 to 120 Hz
          const g = this._gain(0.25, fx);
          this.tone('sawtooth', 900, 120, t, 0.18, 0.5, g, 0.004);
          this.hum(t, 0.18, 0.6, 'bandpass', 900, 1.4, g, 120, 0.004);
        }
      }
      return;
    }
    this._rateFrom = this._rateNow(now); this._rateT0 = now; this._rate = 1;   // the sfx bend eases back over 0.15 s
    this._slowOn = false; this._slowBig = false; this._slow = false;
    this._lkHold = Math.max(this._lkHold, now + 2.5);   // the beat lock only nudges for 2.5 s (see _lockStep)
    this._slpTo(18000, 0.08);
    if (!wasBig && !big) return;
    this._setG(this.mfb.gain, 0.33); this._setG(this.mfb2.gain, 0.33);
    if (!play) return;
    // reverse swell peaking on a 16th, then a soft crash
    const spb = 60 / this._bpm / 4; let pk = this._quant(now);
    while (pk - now < 0.15) pk += spb;
    const st0 = Math.max(t, pk - 0.22), d = pk - st0;
    if (!this._busy(1)) {
      const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noiseBuf; bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, st0); bp.frequency.exponentialRampToValueAtTime(5000, pk);
      g.gain.setValueAtTime(0.0001, st0); g.gain.exponentialRampToValueAtTime(0.22, pk); g.gain.linearRampToValueAtTime(0.0001, pk + 0.02);
      s.connect(bp); bp.connect(g); g.connect(fx); this.live++; s.onended = this._dec; s.start(st0, Math.random() * 0.5); s.stop(pk + 0.05);
    }
    if (d > 0) this.crash(pk, 0.5, fx, 0.6);
  }
  // the pitch and speed factor for a sound effect built right now: _rate in a slow, easing back to 1 over 0.15 s after one
  _rateNow(now) {
    if (this._slowOn) return this._rate;
    const x = (now - this._rateT0) / 0.15;
    return x >= 0 && x < 1 ? this._rateFrom + (1 - this._rateFrom) * x : 1;
  }
  _slowF() { return this._slowOn ? this._slpMin(this._slowBig ? 1400 : 2200) : 18000; }
  // calm mode never closes the slow-mo lowpass below CALM_SLP (6 kHz)
  _slpMin(f) { return this.calm ? Math.max(CALM_SLP, f) : f; }
  // move the slowmo lowpass, unless an impact() is holding it; the impact's release then lands on _slowF()
  _slpTo(f, tc) {
    const now = this.ctx.currentTime, p = this.slp.frequency;
    if (now < this._impUntil) { p.cancelScheduledValues(this._impUntil); p.setTargetAtTime(f, this._impUntil, 0.04); return; }
    p.cancelScheduledValues(now); p.setTargetAtTime(f, now, this._ftc(tc));
  }
  // calm mode: a stinger holds the sfx bus trim 4 dB down for len seconds (10 ms in, 0.1 s back out). A second stinger
  // on top just pushes the release later. setCalm(false) lets go at once.
  _calmCap(now, len) {
    if (!this.fxTrim) return;
    const g = this.fxTrim.gain;
    hold(g, now); g.setTargetAtTime(FX_TRIM * CALM_STING, now, 0.01);
    this._capUntil = Math.max(this._capUntil, now + len); g.setTargetAtTime(FX_TRIM, this._capUntil, 0.1);
  }
  // a broken 25+ chain: the slow-mo lowpass dips to f for dur, then back to where slow-mo wants it
  _slpDip(now, f, dur) {
    if (!this.ctx || !this.slp) return;
    const p = this.slp.frequency;
    hold(p, now); p.setTargetAtTime(this._slpMin(Math.min(f, this._slowF())), now, this._ftc(0.02)); p.setTargetAtTime(this._slowF(), now + dur, this._ftc(0.06));
  }
  // pause: drop every slow-mo state at once, no swell, no crash, no tape stop
  slowmoReset() {
    this._rematchOff();   // title and shop come through here (main.js menuMusic): the rematch groove ends
    this._slowReset();
    this._killLoops();    // the title, shop, result and pause: no growl, current or sizzle left running
  }
  _slowReset() {
    // a reset that cuts a running slow or hit-stop short still gets the lock's 2.5 s no-snap window (see _lockStep)
    const tn = this.ctx ? this.ctx.currentTime : 0;
    this._lkHold = this.ctx && (this._slowOn || tn < this._impUntil) ? tn + 2.5 : -1;
    this._slowOn = false; this._slowBig = false; this._slow = false; this._impUntil = -1;
    this._rate = 1; this._rateFrom = 1; this._rateT0 = -9;
    if (!this.ctx) return; const now = this.ctx.currentTime;
    for (const [p, v] of [[this.slp.frequency, 18000], [this.mfb.gain, 0.33], [this.mfb2.gain, 0.33], [this.mduck.gain, 1]]) { p.cancelScheduledValues(now); p.setValueAtTime(v, now); }
    this._mdUntil = -1;
  }
  // hit stop: the music gasps (micro duck to `depth`, lowpass to 2500 Hz) for `ms`, then breathes out
  // (time constant 0.04), under a 40 ms sub thump
  impact(ms, depth = 0.5) {
    if (!this.ctx || !this.mduck || this.calm) return;
    const c = this.ctx, now = c.currentTime, sec = Math.max(0.02, Math.min(0.5, (+ms || 0) / 1000)), end = now + sec;
    const dv = Math.max(0.05, Math.min(1, +depth || 0.5));
    const g = this.mduck.gain, f = this.slp.frequency;
    g.cancelScheduledValues(now); g.setTargetAtTime(dv, now, 0.006); g.setTargetAtTime(1, end, 0.04);
    this._mdUntil = Math.max(this._mdUntil, end); this._mdLast = now;
    f.cancelScheduledValues(now); f.setTargetAtTime(this._slpMin(Math.min(2500, this._slowF())), now, 0.008); f.setTargetAtTime(this._slowF(), end, 0.04);
    this._impUntil = end; this._lkHold = Math.max(this._lkHold, end + 2.5);   // no hard beat snap for 2.5 s after it
    if (this.muted || c.state !== 'running') return;
    this.tone('sine', 90, 45, now + 0.003, 0.04, 0.35, this.fx, 0.002);
    this._thudUp(now + 0.003, 90, 45, 0.04, 0.35, this.fx);
  }
  _menu(I) { return !this._rematch && I > 0.2 && I < 0.45; }   // the rematch groove is the race loop, whatever the intensity
  _applyTlp() {
    if (!this.ctx) return;
    const T = this._tension, tc = T <= 0.5 ? 18000 : 18000 * Math.pow(1200 / 18000, (T - 0.5) / 0.5);
    const lim = this._rematch && !this._rmOpen ? 400 : this._menu(this._int) ? 3200 : 18000;
    const f = Math.min(tc, lim), t = this.ctx.currentTime;
    this.tlp.frequency.cancelScheduledValues(t); this.tlp.frequency.setTargetAtTime(f, t, this._ftc(0.15));
  }
  // drop the music for a moment so a big sound effect can shine
  // (no duck when sfx are off: there is nothing to make room for. Calm mode never ducks below 0.8.)
  duck(amount = 0.35, sec = 0.6) {
    if (!this.ctx) return;
    if (amount < 1 && (this.sfxMuted || this.sfxVol < 0.05)) return;
    if (this.calm) amount = Math.max(0.8, amount);
    const g = this.music.gain, t = this.ctx.currentTime, L = this._mLevel();
    g.cancelScheduledValues(t); g.setTargetAtTime(L * amount, t, 0.03); g.setTargetAtTime(L, t + sec, 0.25);
  }
  // micro duck: a real hit (opts.duck on its tone() or hum()) pulls the music to 0.7 for 120 ms
  _mduck(t) {
    if (!this.mduck || this.calm || this.sfxMuted || this.sfxVol < 0.05 || t - this._mdLast < 0.03 || t < this._impUntil) return;
    this._mdLast = t; const g = this.mduck.gain;
    if (t < this._mdUntil) g.cancelScheduledValues(t);
    g.setTargetAtTime(0.7, t, 0.006); g.setTargetAtTime(1, t + 0.12, 0.04); this._mdUntil = t + 0.12;
  }
  // the echoes follow the tempo (a dotted eighth). delayTime is never ramped: gliding it while the lines hold sound
  // pitch-shifts every tail like tape. Instead, at time t (a downbeat, see _landKey) each echo's input dips to 0 over
  // 10 ms, the new delayTime is set outright one 16th later, and the input comes back over 20 ms.
  _syncDelay(t) {
    if (!this.ctx || !this.delay) return;
    const c = this.ctx, now = c.currentTime, dt = Math.min(1.4, 3 * 60 / this._bpm / 4);
    if (dt === this._dlyTo) return;   // already there (or switching there): never dip the echoes for nothing
    this._dlyTo = dt;
    if (t === undefined || t < now) t = now;
    const sw = t + Math.max(0.03, 60 / this._bpm / 4);
    for (const inp of [this.echo, this.fxEcho]) {
      const g = inp.gain; g.cancelScheduledValues(t); g.setValueAtTime(1, t); g.linearRampToValueAtTime(0, t + 0.01);
      g.setValueAtTime(0, sw); g.linearRampToValueAtTime(1, sw + 0.02);
    }
    for (const d of [this.delay, this.delayR, this.fxDelay]) { d.delayTime.cancelScheduledValues(t); d.delayTime.setValueAtTime(dt, sw); }
  }
  // a fresh race: back to zone 1 tempo and key, and land the first beat on a crash. seed (optional, the daily's
  // seed) makes the phrase variations and the fill order repeatable; without one every run gets new ones
  newRun(seed) {
    this._bpm = ZONE_BPM[0]; this._bpmNext = null; this.key = 0; this._lift = 0; this._mlift = 0; this._ftier = 0; this._int = 0; this.heat = 0; this.combo = 0; this._dryUntil = 0;
    this._linkN = 0; this._dnaN = 0; this._leadN = 0; this._contest = false; this._cTier = 0; this._rollAt = -1; this._rollLen = 4; this._clN = 0;
    this._zone = 0; this._zoneBar = (this.stepI >> 4) + 1; this._fin = 0;
    this._keyNext = null; this._keyCrash = false; this._whoopBar = -1; this._themePend = true; this._themeAt = -99;
    this._tlift = 0; this._tliftPend = false; this._tliftEnd = -1;
    const seeded = seed !== undefined && seed !== null && seed !== '' && Number.isFinite(+seed), sv = seeded ? Math.abs(+seed | 0) : 0;
    this._varN = seeded ? sv % 1000000 : (Math.random() * 1e6) | 0;
    this.fillN = seeded ? (sv >>> 3) % FILLS.length : this.fillN + Math.floor(Math.random() * 5);
    this._rematchOff(); this._rate = 1; this._rateT0 = -9;
    this._holdUntil = 0; this._softIn = false; this._outUntil = 0; this._gaspUntil = -1; this._duelK = null; this._eggK = -1; this._bankPend = -1; this._themeOn = false;
    if (!this.ctx) return;
    this._syncDelay(); this._applyTlp(); this._applyTrem(); this._applyInt();
    this.setMuffle(false); this.duck(1, 0); this._killLoops();
    if (this._slowOn) this.slowmoReset();
    const bar = (this.stepI >> 4) + 1; this.barBase = bar; this.crashBar = bar; this.fillBar = -1;
  }

  // after a loss (ui calls this from showResult instead of menuMusic): the race loop at race tempo, kick and hats
  // behind a 400 Hz lowpass, already itching to go again. sfx('ready') opens the filter over 600 ms onto a beat,
  // where its pluck lands. close (lost by a whisker): loseClose's top note, the leading tone, keeps hanging as a
  // quiet drone until sfx('again') resolves it to the tonic. Ends with newRun(), slowmoReset() (main.js's
  // menuMusic on the title and shop) or rematchOff().
  rematchMusic(close = false) {
    this._rematch = true; this._rmOpen = false; this._rmClose = !!close;
    this._int = 0.3; this._tension = 0; this._contest = false; this._slowReset();   // the plain L=0 loop, no heartbeat bed, no slow-mo
    if (this._bpm !== ZONE_BPM[0] || this._zone !== 0 || this._bpmNext !== null) { this._bpm = ZONE_BPM[0]; this._bpmNext = null; this._fin = 0; this._zone = 0; this._themePend = true; }
    if (!this.ctx) return;
    this._syncDelay(); this._applyTrem(); this._applyTlp(); this._applyInt();
    if (this._rmClose && this._closeF && this.ctx.currentTime - this._closeAt < 3) this._droneOn(this._closeF, this.ctx.currentTime + 0.02);
  }
  rematchOff() { this._rematchOff(); }
  _rematchOff() {
    if (!this._rematch && !this._drone) return;
    const was = this._rematch; this._rematch = false; this._rmOpen = false; this._rmClose = false;
    this._droneOff(0.12);
    if (was) { this._applyTlp(); this._applyTrem(); this._applyInt(); }
  }
  // open the rematch lowpass over 600 ms so it is wide open on the first beat at least 0.6 s away; returns that beat's time
  _rematchOpen(now) {
    const spb = 60 / this._bpm / 4;
    let q = this._grid(now, 4); while (q < now + 0.6) q += 4 * spb;
    this._rmOpen = true;
    const p = this.tlp.frequency, f = this._tension > 0.5 ? 18000 * Math.pow(1200 / 18000, (this._tension - 0.5) / 0.5) : 18000;
    p.cancelScheduledValues(now); p.setValueAtTime(400, now); p.setValueAtTime(400, q - 0.6); p.exponentialRampToValueAtTime(f, q);
    return q;
  }
  // the so-close drone: one soft triangle on the fx bus (it belongs to loseClose), 0.05
  _droneOn(f, t) {
    if (!this.ctx || this.muted) return;
    if (this._drone) { this._drone.o.frequency.setTargetAtTime(f, t, 0.05); this._drone.f = f; return; }
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = f * 3; lp.Q.value = 0.5;
    g.gain.value = 0.0001; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
    o.connect(lp); lp.connect(g); g.connect(this.fx); this.live++; o.onended = this._dec; o.start(t);
    this._drone = { o, g, f };
  }
  _droneOff(fade) {
    const d = this._drone; if (!d || !this.ctx) { this._drone = null; return; }
    this._drone = null; const now = this.ctx.currentTime;
    hold(d.g.gain, now); d.g.gain.setTargetAtTime(0.0001, now, fade / 3); d.o.stop(now + fade + 0.05);
  }
  // sfx('again'): the leading tone steps up a semitone to the tonic, swells a little, and lets go
  _droneResolve(t) {
    const d = this._drone; if (!d) return;
    this._drone = null;
    const g = d.g.gain, F = d.o.frequency;
    F.cancelScheduledValues(t); F.setValueAtTime(d.f, t); F.exponentialRampToValueAtTime(d.f * st(1), t + 0.12);
    hold(g, t); g.setTargetAtTime(0.07, t, 0.04); g.setTargetAtTime(0.0001, t + 0.35, 0.2);
    d.o.stop(t + 1.4);
  }

  // ------------------------------------------------------------------ voice helpers
  _go(node, t, end) { this.live++; node.onended = this._dec; node.start(t); node.stop(end); }
  // n: how many voices the caller is about to add (so a many-voice sound cannot push the graph past the cap)
  _busy(pri, n = 0) { return this.live + n > (pri ? this._cap + 24 : this._cap); }
  _gain(v, dest) { const g = this.ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  // exponential attack then decay
  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  // a pitched blip; f1 is the target pitch reached after `glide` seconds (defaults to dur).
  // opts.duck: a real hit, micro-duck the music (only on the fx bus and only from 200 Hz up, where a phone can hear it).
  // Inside sfx() a slow-mo bends it: pitch times _fxR, length and glide divided by it.
  tone(type, f0, f1, t, dur, vol, dest, a = 0.004, glide = 0, pri = 1, opts = null) {
    if (this._busy(pri)) return null;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; dest = dest || this.fx;
    if (a < this._minA) a = this._minA;
    const r = this._fxR; if (r !== 1) { f0 *= r; f1 *= r; dur /= r; glide /= r; }
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || dur));
    if (this._hd) { o.detune.value = this._hd; vol *= this._hv; }
    this.env(g, t, a, vol, dur); o.connect(g); g.connect(dest); this._go(o, t, t + a + dur + 0.03);
    if (opts && opts.duck && f0 >= 200 && dest === this.fx) this._mduck(t);
    return o;
  }
  // filtered noise; f1 sweeps the filter over the whole sound (opts and the slow-mo bend: see tone())
  hum(t, dur, vol, type, f0, q, dest, f1 = 0, a = 0.002, pri = 1, opts = null) {
    if (this._busy(pri)) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); dest = dest || this.fx;
    if (a < this._minA) a = this._minA;
    const r = this._fxR; if (r !== 1) { f0 *= r; f1 *= r; dur /= r; }
    s.buffer = this.noiseBuf; if (dur > 0.9) s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q; if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (this._hd) { f.detune.value = this._hd; vol *= this._hv; }
    this.env(g, t, a, vol, dur); s.connect(f); f.connect(g); g.connect(dest);
    this.live++; s.onended = this._dec; s.start(t, Math.random() * Math.max(0, 0.95 - dur)); s.stop(t + a + dur + 0.03);
    if (opts && opts.duck && f0 >= 200 && dest === this.fx) this._mduck(t);
  }
  // legacy helpers kept for compatibility
  osc(type, f0, f1, t, dur, vol, dest) { return this.tone(type, f0, f1, t, dur, vol, dest); }
  hiss(t, dur, vol, freq, type = 'highpass', dest, q = 1) { this.hum(t, dur, vol, type, freq, q, dest); }

  _bank(vowel, makeup) {
    const c = this.ctx, inp = c.createGain(), out = c.createGain(); out.gain.value = makeup; const fs = [];
    VOW[vowel].forEach((fr, k) => {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fr; f.Q.value = fr / FBW[k];
      const g = c.createGain(); g.gain.value = FG[k]; inp.connect(f); f.connect(g); g.connect(out); fs.push(f);
    });
    return { in: inp, out, fs };
  }
  // the pad choir: every note double voiced, -7 cents in the left bank (pan -0.4) and +7 in the right (+0.4).
  // Lite mode sings each chord note once, alternating sides (j = the note's index in the chord)
  _pad(f, t, dur, vol, att, j) {
    if (this._lite || !this.padBankR) { this._sing(j & 1 && this.padBankR ? this.padBankR : this.padBank, f, t, dur, vol, att); return; }
    this._sing(this.padBank, f, t, dur, vol * 0.72, att, 0, 1, -7);
    this._sing(this.padBankR, f, t, dur, vol * 0.72, att, 0, 1, 7);
  }
  _padVowel(v, t, glide) { this._vowel(this.padBank, v, t, glide); if (this.padBankR) this._vowel(this.padBankR, v, t, glide); }
  _vowel(bank, v, t, glide) { VOW[v].forEach((fr, k) => { const f = bank.fs[k].frequency; f.setTargetAtTime(fr, t, Math.max(0.002, glide / 3)); }); }
  // one sung note into a vowel bank (sawtooth, gentle attack, held, released)
  _sing(bank, f, t, dur, vol, att = 0.1, pri = 0, scoop = 1, det = null) {
    if (this._busy(pri)) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * scoop, t); if (scoop !== 1) o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.08, dur * 0.4));
    o.detune.value = det !== null ? det : (Math.random() - 0.5) * 14;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol, t + Math.max(att, dur * 0.75)); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(bank.in); this._go(o, t, t + dur + 0.02);
  }
  // a one-off sung or shouted vowel (own little formant filters): "ooh-AH", "hey!", "yeah"
  say(t, freqs, v0, v1, dur, vol, glide = 0.15, bend = 1, dest, pri = 1) {
    if (this._lite && freqs.length > 1) freqs = [freqs[0]];   // lite: the lead voice only, no harmony
    if (this._busy(pri, 3 * freqs.length)) return;              // every voice counts 3 (its share of the formant filters)
    const c = this.ctx, out = c.createGain(); out.connect(dest || this.fx);
    if (this._hd) vol *= this._hv;
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    out.gain.setValueAtTime(vol, t + dur * 0.6); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const mix = c.createGain(); mix.gain.value = 1 / Math.sqrt(freqs.length);
    for (let k = 0; k < 2; k++) {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = VOW[v0][k] / FBW[k] * 0.8;
      f.frequency.setValueAtTime(VOW[v0][k], t); f.frequency.setTargetAtTime(VOW[v1][k], t + 0.03, glide / 3);
      const g = c.createGain(); g.gain.value = FG[k] * 3.2; mix.connect(f); f.connect(g); g.connect(out);
    }
    for (const fr of freqs) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(fr, t);
      if (bend !== 1) o.frequency.exponentialRampToValueAtTime(fr * bend, t + dur);
      o.detune.value = (Math.random() - 0.5) * 12 + this._hd; o.connect(mix);
      this.live += 3; o.onended = this._dec3; o.start(t); o.stop(t + dur + 0.03);
    }
  }
  // brass-ish note for fanfares: two detuned saws through a lowpass that opens and closes ("wah").
  // f1/glide bend the pitch (a sad slide for a beaten rival)
  _brass(t, f, dur, vol, wah = false, vib = false, f1 = 0, glide = 0) {
    if (this._busy(1)) return;
    const c = this.ctx, lp = c.createBiquadFilter(), g = c.createGain(); lp.type = 'lowpass'; lp.Q.value = wah ? 6 : 2;
    const top = wah ? 1300 : Math.min(5000, f * 7);
    lp.frequency.setValueAtTime(wah ? 350 : f * 1.5, t); lp.frequency.exponentialRampToValueAtTime(top, t + Math.min(0.12, dur * 0.4));
    lp.frequency.exponentialRampToValueAtTime(wah ? 420 : f * 2.5, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(this.fx);
    let lfo = null;
    if (vib) { lfo = c.createOscillator(); lfo.frequency.value = 5.5; const d = this._gain(32); lfo.connect(d); lfo._d = d; }
    for (const det of [-9, 9]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.detune.value = det;
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || dur));
      if (lfo) lfo._d.connect(o.detune);
      o.connect(lp); this._go(o, t, t + dur + 0.03);
    }
    if (lfo) this._go(lfo, t + dur * 0.25, t + dur + 0.03);
  }
  // a plucked string: saw through a lowpass that snaps shut
  _pluck(t, f, vol, dest = this.fx, pri = 1) {
    if (this._busy(pri)) return;
    const c = this.ctx, o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(Math.min(9000, f * 8), t); lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.12);
    this.env(g, t, 0.002, vol, 0.2); o.connect(lp); lp.connect(g); g.connect(dest); this._go(o, t, t + 0.25);
  }

  // ------------------------------------------------------------------ the kit (all mouth noises)
  // kick: a sub thump (kept low: no phone plays it), a body pushed through the tanh shaper so its 2nd and 3rd
  // harmonics (200..400 Hz) carry the kick on a phone speaker, a 330 Hz triangle knock and a lip click
  B(t, v = 1, dest = this.music) {
    this.tone('sine', 185, 46, t, 0.22, 0.35 * v, dest, 0.002, 0.09);
    this.tone('sine', 160, 95, t, 0.12, 0.75 * v, this._shaped(dest), 0.002, 0.09);
    this.tone('triangle', 330, 190, t, 0.06, 0.22 * v, dest, 0.002, 0.04);
    this.hum(t, 0.008, 0.35 * v, 'bandpass', 1200, 1.2, dest, 0, 0.001);
    this._kicks[this._kickI] = t; this._kickI = (this._kickI + 1) & 7;
  }
  Pf(t, v = 1, dest = this.music) {        // the classic "Pf" snare
    this.hum(t, 0.13, 0.5 * v, 'bandpass', 2100, 0.7, dest);
    this.hum(t, 0.05, 0.12 * v, 'highpass', 6500, 0.7, dest);
    this.tone('sine', 420, 140, t, 0.035, 0.3 * v, dest, 0.002);
    if (this._int >= 0.5 && dest === this.music) this.hum(t, 0.08, 0.12 * v, 'bandpass', 2400, 0.8, this.echo, 0, 0.002, 0);
  }
  Kin(t, v = 1, dest = this.music) {       // inward K: a sucked-in snare that swells then snaps shut
    if (this._busy(0)) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(5200, t + 0.08);
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.42 * v, t + 0.07); g.gain.linearRampToValueAtTime(0.0001, t + 0.085);
    s.connect(f); f.connect(g); g.connect(dest); this.live++; s.onended = this._dec; s.start(t, Math.random() * 0.8); s.stop(t + 0.1);
  }
  // the kick body's shaper in front of `dest` (one per destination, built on first use and kept while dest lives)
  _shaped(dest) {
    if (!this._kickSh || !dest) return dest;
    let s = this._kickSh.get(dest);
    if (!s) {
      const c = this.ctx, w = c.createWaveShaper(), o = c.createGain(); w.curve = this._kickCurve; o.gain.value = 0.6;
      w.connect(o); o.connect(dest); s = w; this._kickSh.set(dest, s);
    }
    return s;
  }
  // music-bus hats and rims go through their panners (hats: side 0 = left on even 16ths, 1 = right on odd ones)
  _mpan(dest, side) { return dest === this.music && this.hatPan ? this.hatPan[side & 1] : dest; }
  rim(t, v = 1, dest = this.music) { this._kit('rim', t, 0.24 * v, dest === this.music && this.rimPan ? this.rimPan : dest); }
  hat(t, v = 1, dest = this.music, side = this._hs) { if (this.live > this._cap - 8) return; if (t < this._hatDuck && dest === this.music) v *= 0.85; this._kit('hat', t, 0.15 * v, this._mpan(dest, side)); }
  ts(t, v = 1, dest = this.music, side = this._hs) { if (this.live > this._cap - 8) return; if (t < this._hatDuck && dest === this.music) v *= 0.85; this._kit('ts', t, 0.12 * v, this._mpan(dest, side)); }
  // the 16th-rate kit voices (hat, the "ts" shaker, rim): 4 prebaked variants each, filtered and enveloped once at
  // unlock, so every hit is just a BufferSource and a Gain (no BiquadFilter per hit). Humanise detune and the
  // slow-mo bend map to playbackRate. Falls back to a live hum() before the bake or under a calm minimum attack.
  _kit(name, t, vol, dest) {
    const K = KIT[name], set = this._kits && this._kits[name];
    if (!set || this._minA > K.a) { this.hum(t, K.dur, vol, K.type, K.f, K.q, dest, 0, K.a, 0); return; }
    if (this._busy(0)) return;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = set[(this._kitI = (this._kitI + 1) & 3)];
    const r = this._fxR * (this._hd ? st(this._hd / 100) : 1); if (r !== 1) s.playbackRate.value = r;
    if (this._hd) vol *= this._hv;
    g.gain.value = vol; s.connect(g); g.connect(dest || this.music);
    this.live++; s.onended = this._dec; s.start(t); s.stop(t + s.buffer.length / c.sampleRate / r + 0.01);
  }
  // bake KIT's voices: white noise through a biquad (Web Audio's own formulas: Q in dB for highpass) and the same
  // exponential envelope hum() uses, peak 1 (the Gain sets the level)
  _bakeKits() {
    const c = this.ctx, sr = c.sampleRate, out = {};
    for (const name of Object.keys(KIT)) {
      const { type, f, q, a, dur } = KIT[name], len = Math.ceil((a + dur + 0.03) * sr), w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr;
      const cw = Math.cos(w), sw = Math.sin(w);
      const al = type === 'bandpass' ? sw / (2 * q) : sw / (2 * Math.pow(10, q / 20));
      let b0, b1, b2;
      if (type === 'bandpass') { b0 = al; b1 = 0; b2 = -al; } else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
      const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
      out[name] = [];
      for (let v = 0; v < 4; v++) {
        const buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < len; i++) {
          const x = Math.random() * 2 - 1, y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
          x2 = x1; x1 = x; y2 = y1; y1 = y;
          const tt = i / sr, e = tt < a ? Math.pow(1e-4, 1 - tt / a) : Math.pow(1e-4, Math.min(1, (tt - a) / dur));
          d[i] = y * (tt <= a + dur ? e : 0);
        }
        out[name].push(buf);
      }
    }
    this._kits = out; this._kitI = 0;
  }
  tom(t, f, v = 1, dest = this.music) {    // mouth toms: "doon"
    this.tone('sine', f, f * 0.55, t, 0.2, 0.55 * v, dest, 0.003);
    this.tone('triangle', f * 2, f, t, 0.03, 0.14 * v, dest, 0.002);
  }
  crash(t, v = 1, dest = this.music, len = 0.8) {     // "kssshh"
    this.hum(t, len, 0.2 * v, 'highpass', 4500, 0.7, dest, 0, 0.003);
    this.hum(t, len * 0.44, 0.1 * v, 'bandpass', 9000, 0.6, dest, 0, 0.003);
    this.hum(t, len * 0.38, 0.08 * v, 'highpass', 5000, 0.7, dest === this.music ? this.echo : this.fxEcho, 0, 0.003, 0);
  }
  hey(t, v = 1, dest = this.music) { this.say(t, [196 * st(this.key)], 'eh', 'ee', 0.22, 0.3 * v, 0.12, 0.85, dest); }

  // ------------------------------------------------------------------ the beat
  tick() {
    const c = this.ctx; if (!c) return;
    const now = c.currentTime;
    // a bank whose helices never reported in (dnaTick not wired yet): play the rest of the coin cascade instead
    if (this._bankPend > 0 && now >= this._bankPend) {
      this._bankPend = -1;
      if (!this._tickSeen && !this.muted && c.state === 'running') this._coins(now + 0.01, this._bankG, this.key, this.fx, 1);
    }
    if (!this.on) return;
    if (this.heat && now - this.heatT > 2.4) this.heat = 0;
    if (this.next < now - 0.25 || this.next > now + 1.5) this.next = now + 0.06;   // woke from a sleep or clock jump
    const silent = this.muted || c.state !== 'running';
    let guard = 0;
    const lock = !this.muted && now - this._lkAt <= 0.25;
    while (this.next < now + LOOK && guard++ < 32) {
      if (lock) this._lockStep(now);
      this._landKey(this.next);
      if (!silent) { this._step(this.next); this._heartStep(this.next, this.stepI); }
      this.next += 60 / this._bpm / 4; this.stepI++;
    }
    if (!silent) this._loops(now);
    if (this._thr || this._cur || this._acid) this._reapLoops(now);
  }
  // the tension level the heartbeat bed plays at (never below 0.6 in a contested drill); 0.02 or less: no bed
  _bedT() { return this._contest ? Math.max(0.6, this._tension) : this._tension; }
  // the tension bed rides the groove's own grid (like lowE), so it never flams against the egg's kick: under T 0.45 a
  // heartbeat every half note, up to 0.85 every quarter, above that every quarter plus a soft lub on the 8th before.
  // On the fx bus: it survives music off, duck() and the tension lowpass.
  _heartStep(t, idx) {
    const T = this._bedT(); if (T <= 0.02) return;
    const v = 0.35 + 0.45 * T;
    if (T < 0.45 ? (idx & 7) === 0 : (idx & 3) === 0) this.heart(t, v, this.fx);
    else if (T > 0.85 && (idx & 3) === 2) this._lub(t, 0.5 * v, this.fx);
  }
  _queueFill() { const i = this.stepI & 15, bar = this.stepI >> 4; this.fillBar = i < 6 ? bar : bar + 1; }
  _deflate() {             // frenzy over: a falling "fwoomp", and the key comes back down
    if (this._lift) { this._lift = 0; this._rekey(); }
    this._ftier = 0; this._applyInt();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    this.hum(t, 0.5, 0.22, 'bandpass', 3000, 2, this.music, 300);
    this.tone('sawtooth', 300, 80, t, 0.45, 0.06, this.music);
  }
  _step(t0) {
    const i = this.stepI & 15, bar = this.stepI >> 4, I = this._int;
    this._hs = i & 1;                               // which side this 16th's hats sit on (even left, odd right)
    // a win/lose stinger owns the stage: the groove waits for it to finish and for the next downbeat, then
    // counts back in on a soft crash (it never clashes with the fanfare's key)
    if (this._holdUntil) {
      if (t0 < this._holdUntil || i !== 0) return;
      this._holdUntil = 0; this.crashBar = bar; this._softIn = true;
    }
    const L = I < 0.5 ? 0 : I < 1.3 ? 1 : 2, spb = 60 / this._bpm / 4, M = this.music;
    const fz = this._ftier > 0;                     // FRENZY: the whistle lead and the wah stabs join in
    const Z = ZONE_FLAVOR[this._zone] || ZONE_FLAVOR[0];
    const cmb = Math.max(this.combo | 0, this.heat);
    const hot = cmb >= 12, blazing = cmb >= 25;
    const t = t0 + ((i & 1) ? spb * (L === 2 ? 0.05 : 0.15) : 0);   // swing the off sixteenths
    const pb = (((bar - this.barBase) % 8) + 8) % 8;
    const menu = this._menu(I), prog = (!menu && Z.prog) || PROG;
    const chord = prog[pb & 3];
    // the bass root folds into one octave (65..131 Hz) so late zones keep their bottom; pads and whistle carry the key lift
    let root = 110 * st(this.key + chord[0]); while (root > 131) root /= 2; while (root < 65) root *= 2;
    this.chord = chord;
    // a lift is coming on the next downbeat: a 1-beat rising "whoop" from the crew
    if (i === 12 && bar === this._whoopBar && !menu) {
      this._whoopBar = -1;
      this.say(t, [fold(330 * st(this.key), 500)], 'oo', 'ee', spb * 4, 0.14, spb * 3, 1.12, this.music, 1);
    }
    // waiting room (title, shop, result): hats, a soft bass, an "oo" pad on each bar, and every other
    // 4-bar phrase a whistled 2-bar hook
    if (menu) {
      if (i === 0 && this._softIn) { this._softIn = false; this.crash(t, 0.45); }
      if (i % 2 === 0) this.hat(t, (i % 4 === 2 ? 0.9 : 0.55) * (0.85 + Math.random() * 0.3) * 0.8);
      if (i === 14 && (bar & 1)) this.ts(t, 0.64);
      for (const [s, semi, len] of BASS[0]) if (s === i) this._bass(t, root * st(semi), spb * len * 0.95, 0, 0.55);
      if (i === 0) {
        this._padVowel('oo', t, 0.25);
        chord.forEach((s, j) => { let f = 220 * st(this.key + s); while (f > 420) f /= 2; while (f < 190) f *= 2; this._pad(f, t, spb * 16 * 0.98, 0.02, 0.2, j); });
      }
      // even 8-bar phrases: the theme (bars 0..3); odd ones: the old 2-bar waiting-room hook
      const hb = bar & 7;
      if (((bar >> 3) & 1) === 0) {
        if (hb < 4 && THEME[hb][i] !== null) { let f = 880 * st(this.key + PENTA[THEME[hb][i]]); while (f > 1500) f /= 2; this._whistle(t, f, spb * (THEME_LEN[hb][i] - 0.3), null, 0.05); }
      } else if (hb < 2 && i % 2 === 0) {
        const d = MENU_HOOK[hb][i >> 1];
        if (d !== null) { let f = 880 * st(this.key + PENTA[d]); while (f > 1500) f /= 2; this._whistle(t, f, spb * 1.7, null, 0.05); }
      }
      this._cTier = 0;
      return;
    }
    if (i === 0 && this._softIn) { this._softIn = false; if (this.crashBar !== bar) this.crash(t, 0.6); }
    // the egg duel's gasp: one beat of nothing at all, then a crash brings the band back
    if (this._gaspUntil > 0) {
      if (t0 < this._gaspUntil - 0.002) { this._cTier = Math.min(3, Math.floor(cmb / 10)); if (i === 0) this._themeOn = false; return; }
      this._gaspUntil = -1; if (!(i === 0 && (this.crashBar === bar || this.crashNext))) this.crash(t, 0.8);
    }
    // combo broken: one beat of dry kick, everything else holds its breath
    if (t0 < this._dryUntil) { if (i % 4 === 0) this.B(t, 1.1); this._cTier = 0; this._rollAt = -1; return; }
    // stem ladder: crossing combo 10, 20 or 30 rolls a 1-beat snare fill into a crash on the next beat
    const ct = Math.min(3, Math.floor(cmb / 10));
    if (ct > this._cTier && this._rollAt < 0) { this._rollAt = this.stepI + ((4 - (i & 3)) & 3); this._rollLen = 4; }
    this._cTier = ct;
    if (i === 0) {
      if (this.crashBar === bar || this.crashNext) { this.crash(t, 1); this.crashNext = false; }
      this.curFill = -1;
      if (this.fillBar === bar || (this.fillBar < bar && (pb === 7 || (L === 2 && pb === 3)))) {
        this.curFill = this.fillN++ % FILLS.length;
        if (this.fillBar === bar) this.barBase = bar + 1;
        this.crashBar = bar + 1; this.fillBar = -1;
      }
      // the theme over the first 4 bars of every zone (from the first phrase start after the zone began),
      // then seeded variations of it, a new one every phrase
      if (pb === 0 && this._themePend) { this._themePend = false; this._themeAt = bar; }
      const tb = bar - this._themeAt;
      this._themeOn = tb >= 0 && tb < 4;
      if (this._themeOn) { this.motif = THEME[tb]; this._hatDuck = Math.max(this._hatDuck, t0 + 16 * spb - 0.005); }   // the hats sit back under the hook
      else if (pb === 0 || !this.motif || tb === 4) this._newMotif();
      if (this._drillOn && this._duelK !== null && !this._slow) this._duelBar(t, spb);
    }
    // the B section: odd 8-bar phrases outside FRENZY (and outside the theme and the egg duel) pluck the phrase's
    // motif, so the hook carries the whole race; even phrases stay open for the pass and link blips
    const bsec = !fz && !this._themeOn && !this._drillOn && this.motif && bar >= this.barBase && (((bar - this.barBase) >> 3) & 1) === 1;
    let bNote = false;
    if (bsec && this.motif[i] !== null) {
      if (L >= 1) bNote = true;
      else { let j = 0; while (j < 16 && this.motif[j] === null) j++; bNote = i === j; }   // L 0: just the bar's first note
    }
    if (bsec && i === 0 && L >= 1) this._hatDuck = Math.max(this._hatDuck, t0 + 16 * spb - 0.005);   // the hats sit back under it
    else if (bNote && L === 0) this._hatDuck = Math.max(this._hatDuck, t0 + 2 * spb);
    if (this._rollAt >= 0) {
      const r = this.stepI - this._rollAt;
      const n = this._rollLen;
      if (r >= 0 && r < n) {
        this.Pf(t, 0.45 + 0.6 * r / n);
        if (n > 4 && r >= n - 4 && !this.calm) this.Pf(t + spb * 0.5, 0.4 + 0.5 * r / n);   // a long roll doubles up into 32nds for its last beat (calm: no stutter)
        if (r === n - 1) this.Kin(t + spb * 0.5, 0.7);
      } else if (r === n) { if (!(i === 0 && (this.crashBar === bar || this.crashNext))) this.crash(t, n > 4 ? 1.1 : 0.9); this._rollAt = -1; this._rollLen = 4; }
    }
    const fill = this.curFill >= 0 && i >= 8 && !this._slow ? FILLS[this.curFill][i - 8] : null;
    const stop = this.curFill === 2 && i >= 9;
    // the fork walks in at half time for its first 2 bars
    const half = Z.half && bar >= this._zoneBar && bar < this._zoneBar + Z.half;
    if (fill !== null) {
      const v = 0.6 + (i - 8) * 0.06;
      for (const ch of fill) {
        if (ch === 'B') this.B(t, 1); else if (ch === 'P') this.Pf(t, v); else if (ch === 'K') this.Kin(t, v);
        else if (ch === 'k') this.rim(t, v * 1.2); else if (ch === 'h') this.tom(t, 260, v); else if (ch === 'm') this.tom(t, 185, v);
        else if (ch === 'l') this.tom(t, 130, v); else if (ch === 'Y') this.hey(t, 1);
      }
      if (!stop && i % 2 === 0) this.hat(t, 0.7);
    } else if (this._slow) {
      // bent time: no hats or rims, just a half-time kick under the snares
      if (i === 0 || i === 8) this.B(t, i === 0 ? 1 : 0.85);
      if (i === 4 || i === 12) this.Pf(t, 0.9);
    } else if (half) {
      // half time: kick on 1, snare on 3, hats on the quarters, a "ts" pickup into bar 2
      if (i === 0 || (i === 10 && (bar & 1))) this.B(t, i === 0 ? 1.05 : 0.7);
      if (i === 8) this.Pf(t, 1.1);
      if (i % 4 === 0) this.hat(t, 0.9);
      if (i === 14) this.ts(t, 0.8);
    } else {
      // drums
      if (KICK[L][bar & 1][i]) this.B(t, i === 0 ? 1 : 0.85);
      else if (Z.sig === 'heart' && i % 4 === 0 && this._bedT() <= 0.02) this.B(t, 0.75);   // the egg: a heartbeat kick on every quarter (the tension bed replaces it)
      if (i === 4 || i === 12) this.Pf(t, 1);
      if (L >= 1 && (bar & 1) && i === 14) this.Kin(t, 0.8);
      if (L === 2 && i === 6 && (bar & 1) === 0) this.Kin(t, 0.6);
      if (L === 2 && i === 15 && (bar & 3) === 3) this.Pf(t, 0.5);
      if (L === 1 && (i === 7 || i === 9) && ((bar + i) & 1)) this.rim(t, 0.6);
      if (L === 2 && (i === 3 || i === 7 || i === 11)) this.rim(t, 0.5);
      // hats
      const acc = (i % 4 === 2) ? 1.3 : (i % 2 === 0 ? 1 : 0.6);
      const hv = acc * (0.85 + Math.random() * 0.3);
      if (L === 0) { if (i % 2 === 0) this.hat(t, hv); if (i === 14 && (bar & 1)) this.ts(t, 1); }
      else if (L === 1) { if (i === 2 || i === 10) this.ts(t, 1); else this.hat(t, hv); }
      else { if (i % 4 === 2) this.ts(t, 1.1); else this.hat(t, hv * 1.1); }
      if (hot && L < 2 && i === 6) this.ts(t, 0.8);
      // stem ladder 1 (combo 6): hats double up into 32nds
      if (cmb >= 6) { if (L === 0 && (i & 1)) this.hat(t, 0.6); else if (i % 2 === 0) this.hat(t + spb * 0.5, 0.6, M, 1); }
      this._signature(Z.sig, t, i, bar, spb, L);
    }
    // bass hum (stem ladder 2, combo 15: the busier bass line)
    if (!stop && !half) {
      const bl = cmb >= 15 ? Math.min(2, L + 1) : L;
      for (const [s, semi, len] of BASS[bl]) if (s === i) this._bass(t, root * st(semi), spb * len * 0.95, bl);
    } else if (half && i === 0) this._bass(t, root, spb * 7, 0);
    // choir pads on the downbeat in the zone's vowel (the 4th bar opens up), wah stabs on the offbeats in FRENZY
    if (i === 0 && this.curFill !== 2) {
      const vol = L === 0 ? 0.028 : L === 1 ? 0.04 : 0.032;
      this._padVowel((pb & 3) === 3 ? (Z.vowel === 'ah' ? 'oh' : 'ah') : Z.vowel, t, 0.25);
      chord.forEach((s, j) => { let f = 220 * st(this.key + s); while (f > 420) f /= 2; while (f < 190) f *= 2; this._pad(f, t, spb * 16 * 0.98, vol, 0.12, j); });
    }
    if (!stop && fz && ((L === 2 && (i === 6 || i === 14)) || (L === 1 && hot && i === 14))) {
      this._vowel(this.stabBank, 'oo', t, 0.004); this._vowel(this.stabBank, 'ah', t + 0.03, 0.08);
      for (let k = 1; k < 3; k++) { let f = 220 * st(this.key + chord[k]); while (f > 520) f /= 2; while (f < 260) f *= 2; this._sing(this.stabBank, f, t, 0.16, 0.06, 0.01); }
    }
    // the whistled lead in frenzy; stem ladder 3 (combo 25): a chopped vocal lead
    if (!stop && this.motif && this.motif[i] !== null) {
      const s = PENTA[this.motif[i]];
      const tl = this._themeOn ? THEME_LEN[bar - this._themeAt] : null;
      if (tl) { let f = 880 * st(this.key + s); while (f > 1500) f /= 2; const ln = tl[i]; this._whistle(t, f, spb * (ln - 0.3), s, 0.08, true, ln >= 2); }
      else if (fz && L === 2) { let f = 880 * st(this.key + s); while (f > 1500) f /= 2; this._whistle(t, f, spb * 1.7, s); }
      if (bNote && !stop) this._pluck(t, fold(440 * st(this.key + s), 1100), 0.05, M, 0);
      if (blazing && i % 2 === 0) {
        let f = 220 * st(this.key + s); while (f > 440) f /= 2;
        this.say(t, [f], 'ah', i % 4 ? 'eh' : 'oh', spb * 1.3, 0.16, 0.05, 1, M, 0);
      }
    }
  }
  // one signature sound per zone, on top of the groove (all low priority, all on the music bus)
  _signature(sig, t, i, bar, spb, L) {
    const M = this.music;
    switch (sig) {
      case 'rim': if (i === 3 || i === 11) this.rim(t, 0.55); break;   // launch tube: a rim ostinato
      case 'bubble':                                                   // acid lagoon: a bloop rising out of the puddle
        if (i === 10 || (L >= 1 && i === 13 && (bar & 1))) { const f = fold(440 * st(this.key + pen(3 + ((bar * 3 + i) % 5))), 1200); this.tone('sine', f * 0.6, f, t, 0.06, 0.05, M, 0.004, 0.04, 0); }
        break;
      case 'goo': if (i === 15 && (bar & 1) === 0) this.tom(t, 98 * st(this.key % 12), 0.5); break;   // gate of goo: a sticky low tom pickup
      case 'wave': if (i === 0 && (bar & 1) === 0) this.hum(t, spb * 14, 0.05, 'lowpass', 260, 1.5, M, 1300, spb * 7, 0); break;   // womb sea: a wave washes in
      case 'heart': if (i % 4 === 0 && this._tension <= 0.02) this.tone('triangle', 300, 180, t + spb * 0.75, 0.05, 0.12, M, 0.003, 0, 0); break;   // egg: the "dub"
    }
  }
  // a new lead line for the phrase: a seeded variation of a theme bar (so the race keeps humming the theme)
  _newMotif() { this.motif = themeVariation(this._varN++ * 7919 + this._zone * 131); }
  // the hummed bass keeps its own reserve over the low priority voices (CAP + 12): the groove's floor goes last
  _bass(t, f, dur, L, scale = 1) {
    if (this.live > this._cap + 12) return;
    const c = this.ctx, lp = this.bassLp, g = c.createGain(), o = c.createOscillator(), o2 = c.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2;
    lp.frequency.setValueAtTime(L === 2 ? 1600 : 1100, t); lp.frequency.setTargetAtTime(L === 0 ? 500 : 700, t + 0.01, 0.05);
    const v = (L === 2 ? 0.16 : 0.14) * scale;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    // the octave triangle also carries the old sub's level (a sine at f/2, 33..65 Hz, that no phone could play)
    const g2 = this._gain(0.35 + 0.06 / (L === 2 ? 0.16 : 0.14)); o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp);
    this._go(o, t, t + dur + 0.06); this._go(o2, t, t + dur + 0.06);
  }
  // hook: the theme's whistle (louder, a triangle partial an octave up at 0.25x, and on notes of 2+ sixteenths a
  // 5.5 Hz +-12 cent vibrato fading in after 0.12 s), so the theme is the loudest melodic moment of each zone
  _whistle(t, f, dur, s = null, vol = 0.07, hook = false, vib = false) {
    const L = this.leadBus || this.music;
    const o = this.tone('sine', f * 0.94, f, t, dur, vol, L, 0.015, 0.04, 0);
    if (o) this.tone('sine', f * 0.94, f, t, dur * 0.8, vol * 0.36, this.echo, 0.015, 0.04, 0);
    if (o && hook) {
      const o2 = this.tone('triangle', f * 2 * 0.94, f * 2, t, dur, vol * 0.25, L, 0.015, 0.04, 0);
      if (vib && dur > 0.16 && !this._busy(0)) {
        const c = this.ctx, lfo = c.createOscillator(), d = c.createGain(); lfo.frequency.value = 5.5;
        d.gain.setValueAtTime(0, t); d.gain.setValueAtTime(0, t + 0.12); d.gain.linearRampToValueAtTime(12, t + Math.min(dur, 0.12 + 0.15));
        lfo.connect(d); d.connect(o.detune); if (o2) d.connect(o2.detune);
        this._go(lfo, t, t + dur + 0.05);
      }
    }
    if (o && this._ftier >= 2 && s !== null) { const f2 = f * st(third(s) - s); this.tone('sine', f2 * 0.94, f2, t, dur, 0.045, L, 0.015, 0.04, 0); }
  }
  // a combo note over the theme's first 4 bars: the whistle dips to 0.55 for 90 ms at q so the ladder never masks the hook
  _leadDip(q) {
    if (!this._themeOn || !this.leadBus) return;
    const g = this.leadBus.gain;
    g.cancelScheduledValues(q); g.setTargetAtTime(0.55, q, 0.004); g.setTargetAtTime(1, q + 0.09, 0.03);
  }
  // the egg duel's ostinato on each bar's downbeat, on the music bus: a leading rival's motif at 0.35x, or, when
  // Kevin leads, the theme's first 4 notes in brass, one pentatonic step higher on every retake
  _duelBar(t, spb) {
    const k = this._duelK, base = this.fx, g = this._gain(1, this.music);
    this.fx = g;
    try {
      if (k === -1) {
        const up = Math.max(0, this._leadN - 1); let j = 0;
        for (let s = 0; s < 16 && j < 4; s++) {
          const d = THEME[0][s]; if (d === null) continue;
          const f = fold(440 * st(this.key + pen(d + up)), 900);
          this._brass(t + s * spb, f, spb * (j === 3 ? 3 : THEME_LEN[0][s]) * 0.85, 0.1 * 0.35);
          j++;
        }
      } else if (k >= 0) this._rival(t, k, 0.35);
      else { const f = fold(165 * st(this.key), 220); this._brass(t, f, spb * 3, 0.035); this._brass(t + spb * 3, f * st(1), spb * 2, 0.03); }   // an unnamed rival: a low "dun-dun"
    } finally { this.fx = base; }
  }

  // ------------------------------------------------------------------ quantised combo notes
  // the time of the next grid slot: the next 16th if it is within 0.07 s, else the next 32nd
  _quant(now) {
    const fb = now + 0.005;
    if (!this.on || !this.ctx || this.ctx.state !== 'running' || !this.next) return fb;
    const spb = 60 / this._bpm / 4;
    if (!gridOk(this.next, now, spb)) return fb;
    const g = this.next - Math.floor((this.next - now) / spb) * spb;   // next 16th, in [now, now + spb)
    if (g - now <= 0.07) return Math.max(fb, g);
    return Math.max(fb, g - spb / 2 >= now ? g - spb / 2 : g);
  }
  // like _quant, but a combo note never waits more than 45 ms for the grid (it plays right away instead)
  _quantCap(now) { const g = this._quant(now); return g - now > 0.045 ? now + 0.005 : g; }
  // true when a kick (groove or sfx) already sits within `w` seconds of time q
  _kickNear(q, w = 0.03) { for (let j = 0; j < 8; j++) if (Math.abs(this._kicks[j] - q) < w) return true; return false; }
  // an sfx's kick layer at grid time q, skipped when the groove already kicks within 30 ms of it (no flams)
  _gridKick(q, v, dest) { if (!this._kickNear(q)) this.B(q, v, dest); }
  // the grid slot at or after time tw (a 16th, else a 32nd) when it is at most 45 ms away, else tw itself
  _snapAt(tw) {
    const c = this.ctx;
    if (!this.on || !c || c.state !== 'running' || !this.next) return tw;
    const now = c.currentTime, spb = 60 / this._bpm / 4;
    if (!gridOk(this.next, now, spb)) return tw;
    const g16 = this.next + Math.ceil((tw - this.next) / spb - 1e-6) * spb;
    if (g16 - tw <= 0.045) return g16;
    const g32 = this.next + Math.ceil((tw - this.next) / (spb / 2) - 1e-6) * spb / 2;
    return g32 - tw <= 0.045 ? g32 : tw;
  }
  // the first 16th the scheduler has not built yet (the beat runs LOOK ahead): where a cut in the groove can start
  _unsched(now) { const q = this._next16(now); return this.on && this.next > q && gridOk(this.next, now, 60 / this._bpm / 4) ? this.next : q; }
  // the next 16th on the grid (not a 32nd), or right now when the beat is not running
  _next16(now) {
    const fb = now + 0.005;
    if (!this.on || !this.ctx || this.ctx.state !== 'running' || !this.next) return fb;
    const spb = 60 / this._bpm / 4;
    if (!gridOk(this.next, now, spb)) return fb;
    return Math.max(fb, this.next - Math.floor((this.next - now) / spb) * spb);
  }
  // the combo ladder: link n plays pentatonic degree ladderDegree(n) (a two-octave run, and every ten links
  // the run starts a degree higher, at most 5), with a new layer on top every ten (see _layers), so it
  // always feels like it is still climbing and every note stays in the key. Used by pass, link, clutch and drill.
  // The octave is picked once per run of 10 (so the run's top note stays under 1760 Hz), never per note: a note
  // never folds down mid-run, and the octave can only change where the ladder resets on purpose (see _ladderCheck).
  _scaleF(n, base, key = this.key) { return this._runBase(n, base, key) * st(key + pen(ladderDegree(n))); }
  // the base frequency for link n's run of 10: halved until the run's top degree fits under 1760 Hz (never below 110)
  _runBase(n, base, key = this.key) {
    n = Math.max(0, n | 0);
    const top = pen(ladderDegree(n) - (n % 10) + 9);
    let b = base; while (b * st(key + top) > 1760 && b > 110) b /= 2;
    return b;
  }
  // dev-only self-check: inside every run of 10 the ladder strictly climbs, for keys 0..14 and both bases the game
  // uses (220 pass/drill, 440 link). Returns the failures ([] when the ladder is sound). Run by hand in node:
  //   node -e "import('./million_to_one/audio.js').then(m => console.log(m.Audio._ladderCheck()))"
  static _ladderCheck() {
    const a = new Audio(), bad = [];
    for (let key = 0; key <= 14; key++) {
      for (const base of [220, 440]) {
        for (let n = 0; n < 99; n++) {
          if (n % 10 === 9) continue;   // the end of a run: the ladder resets there on purpose
          const f0 = a._scaleF(n, base, key), f1 = a._scaleF(n + 1, base, key);
          if (!(f1 > f0)) bad.push({ key, base, n, f0, f1 });
        }
      }
    }
    return bad;
  }
  // the unquantised front of a combo note: a click, an 8 ms 3.5 -> 2.5 kHz bandpassed tick (Q 1.5, the band a phone
  // speaker plays loudest) and a 1 ms square tick, right now, so the hit never feels late
  // (v: the two noise ticks' levels, [0.14, 0.12] by default; the link and the pass hit harder, [0.2, 0.18])
  _transient(t, f, dest, v = TR_SOFT) {
    this.hum(t, 0.012, v[0], 'highpass', 3500, 0.7, dest, 0, 0.001);
    this.hum(t, 0.008, v[1], 'bandpass', 3500, 1.5, dest, 2500, 0.001);
    this.tone('square', fold(f * 2, 3600), 0, t, 0.001, 0.06, dest, 0.001);
  }
  // a broken chain falls back down its own ladder: triangles 40 ms apart from the first grid slot after the scratch's
  // first half (_quantCap), on the same pentatonic as _scaleF. n 10..24: 4 notes down from the last link (_passF);
  // n 25+: 8 notes that end one octave under the chain's first note, the last one held
  _breakRun(now, n, K, fx) {
    const b0 = this._runBase(0, 440, K) * st(K), s = 12 * Math.log2((this._passF > 0 ? this._passF : b0) / b0);
    let D = 0, be = 1e9; for (let d = -10; d <= 30; d++) { const e = Math.abs(penD(d) - s); if (e < be) { be = e; D = d; } }
    const degs = [];
    if (n < 25) for (let j = 1; j <= 4; j++) degs.push(D - j);
    else {
      const end = -5, top = Math.max(D - 1, end + 7);   // too short a fall (a low last link): start higher, still end on the octave
      for (let j = 0; j < 8; j++) degs.push(Math.round(top - (top - end) * j / 7));
    }
    const q = this._quantCap(now + 0.09);
    degs.forEach((d, j) => {
      let f = b0 * st(penD(d)); while (f > 1760) f /= 2;
      const last = j === degs.length - 1;
      this.tone('triangle', f * 1.02, f, q + j * 0.04, last && n >= 25 ? 0.3 : 0.07, 0.22 - 0.01 * j, fx, 0.003, 0.015);
    });
  }
  // one scratch stroke: a saw sliding f0 -> f1 through a 1.8 kHz bandpass (Q 0.8: the needle's bark, not its sub),
  // held at vol for 75% of dur, then let go (slow-mo bends it like tone())
  _scratch(t, f0, f1, dur, vol, dest) {
    if (this._busy(1)) return;
    const c = this.ctx, o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain(), r = this._fxR;
    if (r !== 1) { f0 *= r; f1 *= r; dur /= r; }
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const a = Math.max(0.004, this._minA);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp); bp.connect(g); g.connect(dest); this._go(o, t, t + dur + 0.02);
  }
  // the pitched tail of a pass or link: the ladder gains weight as it climbs, 0.42 up to link 12, then 0.3 + 0.01 n
  // (0.6 from link 30 on)
  _tailVol(n) { return Math.max(0.42, 0.3 + 0.01 * Math.min(Math.max(0, n), 30)); }
  // the layers a long combo earns on every blip: 10+ an octave, 20+ a fifth (and the octave splits to -0.4 / +0.4,
  // two voices at 0.6x each), 30+ a sparkle, 40+ a detuned unison. All low priority (the first voices the cap drops).
  _layers(q, f, n, dest) {
    if (n >= 20 && this._layPan && !this.mono) { for (const p of this._layPan) this.tone('sine', fold(f * 2), 0, q + 0.005, 0.06, 0.09 * 0.6, p, 0.003, 0, 0); }
    else if (n >= 10) this.tone('sine', fold(f * 2), 0, q + 0.005, 0.06, 0.09, dest, 0.003, 0, 0);
    if (n >= 20) this.tone('sine', fold(f * st(7)), 0, q + 0.005, 0.06, 0.07, dest, 0.003, 0, 0);
    if (n >= 30 && this.live <= this._cap - 8) this.hum(q, 0.015, 0.05, 'highpass', 7000, 0.7, dest, 0, 0.001, 0);
    if (n >= 40) for (const c of [-8, 8]) { const o = this.tone('triangle', f, 0, q, 0.07, 0.05, dest, 0.003, 0, 0); if (o) o.detune.value = c; }
  }

  // ------------------------------------------------------------------ rival voices
  // per-rival motif by RIVALS index. vol 1 = passed, 0.5 = taunt. semi transposes. hold > 0 sustains
  // every note to `hold` seconds and slides it by `drop` (0.5: down an octave, a rival deflating at your
  // win; 1: no slide, a rival gloating as it takes your egg).
  // lim: play only the motif's first `lim` notes (a chord counts as one)
  _rival(t, k, vol = 1, semi = 0, hold = 0, key = this.key, drop = 0.5, lim = 99) {
    const m = st(key + semi), fx = this.fx, dr = drop === 1 ? 0 : drop;
    const n = (type, f, at, dur, v, a = 0.005, f1 = 0, gl = 0) => {
      f *= m;
      if (hold) { const d = Math.max(dur, hold - at); this.tone(type, f, f * dr, t + at, d, v * vol, fx, a, d); }
      else this.tone(type, f, f1 ? f1 * m : 0, t + at, dur, v * vol, fx, a, gl);
    };
    const br = (f, at, dur, v) => { f *= m; if (hold) { const d = Math.max(dur, hold - at); this._brass(t + at, f, d, v * vol, false, false, f * dr, d); } else this._brass(t + at, f, dur, v * vol); };
    switch (k | 0) {
      case 0:   // Steve: a goofy kazoo that climbs, very pleased with itself
        [523, 587, 659, 784].slice(0, lim).forEach((f, j) => { n('triangle', f, j * 0.07, j === 3 ? 0.2 : 0.07, 0.16, 0.01, f * 1.03, 0.05); n('square', f, j * 0.07, j === 3 ? 0.18 : 0.06, 0.035); });
        break;
      case 1:   // Brock: a heavy square power chord
        [98, 147, 196].forEach((f) => n('square', f, 0, 0.35, 0.07, 0.004));
        n('sine', 49, 0, 0.3, 0.25);
        break;
      case 2:   // Tiffany: a prim little harp run
        [1047, 1319, 1568].slice(0, lim).forEach((f, j) => { n('sine', f, j * 0.06, 0.35, 0.12, 0.002); if (!hold) this.tone('sine', f * m, 0, t + j * 0.06, 0.25, 0.04 * vol, this.fxEcho); });
        break;
      case 3:   // Gunther: a saw that bends up like a stunt jump
        n('sawtooth', 330, 0, 0.32, 0.1, 0.01, 440, 0.22);
        n('sawtooth', 165, 0, 0.32, 0.05, 0.01, 220, 0.22);
        break;
      case 4:   // Chad Thundertail: a pompous four-note fanfare
        [[392, 0, 0.07, 0.1], [392, 0.09, 0.07, 0.1], [523, 0.18, 0.1, 0.11], [659, 0.3, 0.35, 0.12]].slice(0, lim).forEach((a) => br(...a));
        break;
    }
  }

  // ------------------------------------------------------------------ sound effects
  // names: pass (k = combo), link ({ n, kind }), sugar, dna, shield, alkali/fizz, dash, bonk, bump, hit,
  // clang, pop, chomp, frenzy (k = tier), frenzyEnd, second, zone, egg, pick, cards, reroll, drill (k = taps),
  // win (k = rival index when you beat a drilling rival), lose, tap (k = 0..1), buy, combo (k = combo),
  // comboEnd (k = combo), comboBreak (k = the combo it destroyed: <10 a scratch, 10+ a falling run and a dry beat,
  // 25+ a longer run, a 900 Hz dip and a dry bar), comboBank (k = grade 0..4), boss (k = rival index), bossTaunt (k),
  // eggClaim, drillShove, surf, heart, mutation, synergy (k = fresh), close, thread, blast (k = count),
  // record, legendary, milestone, event, lowE, lockon (k = pan -1..1), land, clutch, finisher (k = grade 0..4),
  // style (k = level 3..6), loseClose, drillLead (k = +1 you lead, -1 a rival does), rivalShove, again, ready,
  // synTease, swat, tell (k = wall side -1..1), comboLow (k = comboT / comboMax, or { f, grade }),
  // comboMilestone (k = combo 100, 150, ...). lose (k) and eggClaim (k) take the rival index to play the
  // thief's motif; lowE (k = 1 when critical). drillLead also takes core's event { k, kevin } (k = rival index,
  // -1 Kevin), which names the rival for the duel ostinato. dnaTick ({ i, n, grade? }: helix i of n lands),
  // rivalTell (k = rival index), countered, factory (k = 0..3 fill level), countTick (k = 0..1), medal (k = tier 1..3),
  // spot (k = { pan }: one gap per side), trick ({ id, first, kinds }), domino (k = chain length), whoosh ({ pan }). comboBank (k = grade, or { grade, cascade: true } for the whole coin run).
  // trickTease ({ step: 2, id }: two links of a trick in), trickMiss (its window lapsed), draftOn (a draft pick locks in),
  // slingReady, goal (a goal reached), pastBest (swam past your best distance), grudge (k = the beaten grudge rival's index).
  // trickStreak (k = { n }: tricks back to back, n 1..; n >= 2 also lifts the key until the chain banks or breaks),
  // overtaken ({ k, pan }: a rival swims past you), gift (a free sugar), bounty (the bounty stamp), spareBite (the
  // spare life takes a bite), gateNear / gateNearSlide (k = pan -1..1: a gate coming up, a sliding one sings a fourth
  // higher). pop chains itself (pops under 0.8 s apart climb). edge (k = side -1..1: grazing the tube's edge, a click fully
  // on that side, throttled to 120 ms; 'wall' stays the body bounce), dashPop (k = pan: a dash pops something).
  // record is the true NEW RECORD only. While a win/lose stinger rings, record and medal answer it (see _outAnswer).
  // A medal within 0.5 s of a record plays 0.5 s after the record instead of on top of it.
  sfx(name, k) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime, t = now + 0.005;
    // 'spot' keeps one gap per side, so two Macros spotting you at once each get their own "eep eep";
    // the last DNA helix tick always plays (it carries the closing echo and the bell)
    let gk = name;
    if (name === 'spot') { const pn = numArg(k, 'pan'); gk = pn < -0.2 ? 'spotL' : pn > 0.2 ? 'spotR' : 'spotC'; }
    const gap = GAP[gk] ?? GAP[name] ?? 0.015;
    const lastTick = name === 'dnaTick' && k && typeof k === 'object' && (k.i | 0) >= (k.n | 0) - 1;
    if (!lastTick && now - (this.last[gk] ?? -9) < gap) return;
    this.last[gk] = now;
    // state that must change even when the sound is muted
    const endCombo = () => { this._clN = 0; if (this._mlift) { this._mlift = 0; this._rekey(); } };
    switch (name) {
      case 'pass': this.heat = Math.max(this.heat, +k || 0); this.heatT = now; break;
      case 'comboBreak': {      // k = the chain it destroyed (older callers pass nothing: 0). The band's reaction scales with it:
        // under 10 it plays on, 10..24 it holds its breath for 4 sixteenths, 25+ for a whole bar behind a 900 Hz dip
        const n = Math.max(0, numArg(k, 'n') | 0), sp = 60 / this._bpm / 4;
        this._brkN = n; this.heat = 0;
        if (n >= 10) this._dryUntil = Math.max(this._dryUntil, this._unsched(now) + (n >= 25 ? 16 : 4) * sp);
        if (n >= 25) this._slpDip(now, 900, 0.35);
        endCombo(); break;
      }
      case 'finisher': endCombo(); break;
      case 'comboEnd': endCombo(); break;
      case 'comboMilestone': if (!this._mlift) { this._mlift = 2; this._rekey(true); } break;
      // a streak of 2+ lifts the key like a combo milestone, until the chain banks or breaks (endCombo drops it)
      case 'trickStreak': if ((numArg(k, 'n') | 0) >= 2 && !this._mlift) { this._mlift = 2; this._rekey(true); } break;
      case 'dna': this._dnaN = now - this._dnaT <= 1.2 ? Math.min(8, this._dnaN + 1) : 0; this._dnaT = now; break;
      case 'pop': this._popN = now - this._popT <= 0.8 ? Math.min(6, this._popN + 1) : 0; this._popT = now; break;
      case 'drillLead': {
        // two shapes: core's event { k, kevin } (k = rival index, -1 Kevin), or main.js's number (+1 Kevin, -1 a rival)
        const obj = k && typeof k === 'object', kev = obj ? (k.kevin != null ? !!k.kevin : (k.k | 0) < 0) : (+k || 0) > 0;
        if (kev) this._leadN = Math.min(6, this._leadN + 1);
        const rv = obj && !kev ? rivalIdx(k) : -1;
        if (rv >= 0) this._eggK = rv;
        this._duelK = kev ? -1 : rv >= 0 ? rv : this._eggK >= 0 ? this._eggK : -2;
        break;
      }
      case 'eggClaim': case 'rivalTell': { const rv = rivalIdx(k); if (rv >= 0) this._eggK = rv; break; }
      case 'comboBank': endCombo(); this._bankG = Math.max(0, Math.min(4, numArg(k, 'grade') | 0)); this._bankAt = now; this._bankTicks = 0; break;
      case 'dnaTick': this._bankTicks++; this._bankPend = -1; this._tickSeen = true; break;
      case 'frenzy': { const tier = Math.max(1, numArg(k, 'tier') | 0); this._ftier = tier; this._applyInt(); if (tier >= 3 && !this._lift) { this._lift = 1; this._rekey(true); } break; }
      case 'backflow': this._dryUntil = this._unsched(now) + 60 / this._bpm; break;   // the band rewinds: one dry beat
      case 'finale':            // the last sprint: a 1-bar snare roll from the next downbeat into a crash, and +6 bpm to the end
        if (this.on) { const i = this.stepI & 15; this._rollAt = this.stepI + ((16 - i) & 15); this._rollLen = 16; }
        if (!this._fin) {   // +6 bpm, landing on the roll's downbeat (with the echoes) while the beat runs
          this._fin = 6;
          if (this.ctx && this.on) this._bpmNext = (this._bpmNext !== null ? this._bpmNext : this._bpm) + 6;
          else { this._bpm += 6; this._syncDelay(); }
        }
        break;
      case 'synergy': if ((k === true || (k && k.fresh)) && this.on) this._queueFill(); break;
    }
    if (this.muted) {
      // the same bookkeeping as the audible path: a jingle right after a muted win or lose still knows the finishing key
      if (name === 'win' || name === 'lose') { this._outK = this.key; this._outAt = now + (name === 'win' ? 2.3 : 1.6); this._outUntil = now + (name === 'win' ? 3.8 : 3); this._resetSong(); }
      return;
    }
    if (HUMAN.has(name)) { this._hd = (Math.random() * 2 - 1) * 15 || 0.01; this._hv = 1 + (Math.random() * 2 - 1) * 0.12; }
    // the biggest moments get their own 1.25x send, swapped in as this.fx while they are built
    // (calm mode: that send drops to 0.8 and every attack is at least 15 ms, so nothing snaps at the player)
    // Sound effects off but music on: win and lose still stop the groove for their stinger (_holdUntil), so the
    // stinger plays on the music side instead (0.8x, at the music's volume, after the muffle so lose's
    // setMuffle(true) dulls the band and not its own sad trombone). Music-only players hear the fanfare.
    // Calm mode also caps the stingers (STING: frenzy, second, win, the shield hit) 4 dB down, after the sfx compressor
    // (in front of it, the compressor would win most of it back): see _calmCap
    const big = BOOST.has(name) || (name === 'blast' && numArg(k, 'n') >= 5), base = this.fx, rescue = this.sfxMuted && (name === 'win' || name === 'lose');
    const sting = this.calm && STING[name] > 0;
    const fx = rescue ? this._gain(0.8 * this._mLevel(), this.slp) : sting ? this._gain(CALM_SEND, base) : big ? this._gain(this.calm ? 0.8 : 1.25, base) : base;
    this.fx = fx; if ((big || rescue || sting) && this.calm) this._minA = 0.015;
    if (sting) this._calmCap(now, STING[name]);
    this._fxR = UI_SFX.has(name) ? 1 : this._rateNow(now);   // slow-mo bends every non-UI effect built below
    // a win/lose stinger still ringing: everything plays in the key it finished in, not the reset song's key 0
    const K = now < this._outUntil ? this._outK : this.key;
    try { this._sfx(name, k, now, t, K, fx); } finally { this._hd = 0; this._hv = 1; this.fx = base; this._minA = 0; this._fxR = 1; }
  }
  _sfx(name, k, now, t, K, fx) {
    const c = this.ctx, kf = (f) => inKey(f * st(K), K);   // a pickup pitch, moved into the song's key
    switch (name) {
      case 'pass': {            // a blip that climbs the pentatonic scale: a tick right now, the pitched tail on the beat
        const q = this._quantCap(now);
        // the same overtake already rang as a combo link: just a dry tick, so it never sounds doubled
        if (now - (this.last.link ?? -9) < 0.06) { this.hum(t, 0.006, 0.05, 'highpass', 5000, 0.7, fx, 0, 0.001); break; }
        const n = +k || 0, f = this._scaleF(n, 220);
        this._passF = f;
        if (this._slotG && Math.abs(q - this._slotT) < 0.02) {   // same 32nd: make that blip a bit louder instead
          this._slotG.gain.value = Math.min(1.45, this._slotG.gain.value + 0.12);
          break;
        }
        this._transient(t, f, fx, TR_HARD); this._leadDip(q);
        const sg = this._gain(1, fx); this._slotG = sg; this._slotT = q; this._blipN++;
        this.tone('triangle', f * 0.97, f, q, 0.11, this._tailVol(n), sg, 0.003, 0.02);   // it has to cut through the music on a phone
        this._layers(q, f, n, sg);
        break;
      }
      case 'link': {            // a combo link: the next note of the climb, a timbre for each kind of trick
        const n = numArg(k, 'n'), kind = (k && k.kind) || 'pass', q = this._quantCap(now), f = this._scaleF(n, 440);
        this._passF = f; this._linkN = n; this._blipN++;
        this._transient(t, f, fx, TR_HARD);   // the hit lands now; only the pitched tail waits for the grid
        this._layers(q, f, n, fx); this._leadDip(q);
        if (this._blipN % 4 === 0) {        // every 4th link sings a note of the pad chord
          const ch = this.chord || PROG[0]; let cf = 440 * st(K + ch[(this._blipN >> 2) % 3]); while (cf > 880) cf /= 2; while (cf < 440) cf *= 2;
          this.tone('sine', cf, 0, q, 0.16, 0.04, fx, 0.01);
        }
        if (kind === 'close') { this.tone('sine', f, 0, q, 0.14, 0.11, fx, 0.002); this.tone('sine', f * 2, 0, q, 0.2, 0.04, fx, 0.002); this.tone('sine', f * 3.01, 0, q, 0.1, 0.02, this.fxEcho, 0.002); }
        else if (kind === 'gate') this._pluck(q, f / 2, 0.14);
        else if (kind === 'dodge') this.tone('sine', f * 0.9, f, q, 0.12, 0.09, fx, 0.01, 0.05);
        else if (kind === 'pop' || kind === 'bump') { const p = kind === 'pop' ? f : f / 2; this.tone('square', p, p * 0.5, q, 0.04, 0.05, fx, 0.001); this.hum(q, 0.012, 0.12, 'bandpass', 2200, 2, fx); }
        if (kind === 'dodge' || kind === 'pop') {   // a little "aww" from the thing you just beat, sliding down
          let af = f / 2; while (af > 420) af /= 2; while (af < 200) af *= 2;
          this.say(q + 0.07, [af], 'ah', 'oo', 0.16, 0.06, 0.08, 0.84, fx, 0);
        }
        else {                  // the pitched tail; under the theme hook (880..1500 Hz) it drops an octave, out of its register
          let tf = f; if (this._themeOn) { tf = f / 2; while (tf < 330) tf *= 2; }
          this.tone('triangle', tf * 0.97, tf, q, 0.11, this._tailVol(n), fx, 0.003, 0.02);
        }
        break;
      }
      case 'sugar': { const f = kf(1320); this.tone('sine', f * 0.38, f, t, 0.07, 0.2, fx); this.tone('triangle', fold(kf(1568), 2000), 0, t + 0.05, 0.12, 0.1, fx); break; }
      case 'dna': {             // coin arpeggio in key; a streak walks its root up the pentatonic
        let b0 = 440 * st(K); while (b0 > 880) b0 /= 2;
        const n = this._dnaN, b = b0 * st(pen(n)), b2 = b0 * st(pen(n + 2));
        this.tone('square', b, 0, t, 0.05, 0.09, fx, 0.002);
        this.tone('square', b2, 0, t + 0.055, 0.22, 0.09, fx, 0.002);
        this.tone('sine', b * 2, 0, t + 0.11, 0.18, 0.06, fx);
        this.tone('sine', b2 * 2, 0, t + 0.15, 0.25, 0.04, this.fxEcho);
        break;
      }
      case 'shield': {          // shiny up arpeggio with a metallic ping
        [0, 4, 7, 12].forEach((s, j) => this.tone('triangle', kf(1047 * st(s)), 0, t + j * 0.045, 0.14, 0.12, fx));
        this.clang(t + 0.18, 0.5, 1600);
        break;
      }
      case 'alkali': case 'fizz':
        this.hum(t, 0.25, 0.15, 'highpass', 5000, 0.7, fx);
        for (let j = 0; j < 6; j++) this.tone('sine', kf(1760 * st(PENTA[j % 5])), 0, t + j * 0.03, 0.03, 0.08, fx);   // sparkles up the pentatonic, in key
        break;
      case 'dash':              // whoosh with a doppler sweep and a lip "pff"
        this.hum(t, 0.32, 0.45, 'bandpass', 380, 1.4, fx, 2800, 0.04, 1, DUCK);
        this.hum(t + 0.12, 0.2, 0.2, 'bandpass', 2600, 1.2, fx, 700);
        this.tone('sine', 180, 520, t, 0.18, 0.16, fx);
        this.hum(t, 0.03, 0.3, 'bandpass', 1200, 1, fx);
        break;
      case 'bonk': {            // squelchy goo: a resonant filter sliding down and a wobbling plop
        // a failure: never louder than a link (0.36 / 0.34, about 1 dB under it, so the +-12% humanise stays under too)
        this.hum(t, 0.28, 0.36, 'bandpass', 1500, 7, fx, 170, 0.004, 1, DUCK);
        const o = this.tone('sine', 280, 0, t, 0.26, 0.34, fx, 0.003);
        if (o) { const F = o.frequency; F.setValueAtTime(280, t); F.exponentialRampToValueAtTime(150, t + 0.05); F.exponentialRampToValueAtTime(210, t + 0.09); F.exponentialRampToValueAtTime(110, t + 0.15); F.exponentialRampToValueAtTime(130, t + 0.19); F.exponentialRampToValueAtTime(55, t + 0.26); }
        this.say(t + 0.02, [150], 'oo', 'uh', 0.18, 0.1, 0.1, 0.7);
        break;
      }
      case 'bump': {            // springy boing off a rival
        const o = this.tone('sine', 220, 0, t, 0.22, 0.3, fx, 0.003, 0, 1, DUCK);
        if (o) { const F = o.frequency; F.setValueAtTime(220, t); F.exponentialRampToValueAtTime(480, t + 0.04); F.exponentialRampToValueAtTime(300, t + 0.1); F.exponentialRampToValueAtTime(380, t + 0.14); F.exponentialRampToValueAtTime(260, t + 0.22); }
        this.hum(t, 0.03, 0.2, 'lowpass', 1200, 1, fx);
        break;
      }
      case 'hit':               // something big hit your shield: clang plus a thud
        this.clang(t, 1, 420); this.tone('sine', 130, 45, t, 0.25, 0.5, fx); this.hum(t, 0.2, 0.3, 'lowpass', 900, 1, fx, 0, 0.002, 1, DUCK);
        this.duck(0.5, 0.3);
        break;
      case 'clang': this.clang(t, 1, 420); break;
      case 'pop': {             // a kill: the bubble pop's chirp over a wet "splorp" and a kick locked to the groove
        // a chain (pops under 0.8 s apart, up to 6) walks the chirp's end note up the pentatonic, one degree a pop from
        // degree 3 to 9 (the top of the ladder's first run, under 1760 Hz), so all 7 steps climb and none folds back down
        const pn = this._popN, f1 = this._scaleF(3 + pn, 880, K);
        this.tone('sine', Math.max(300, f1 * 0.25), f1, t, 0.06, 0.38, fx, 0.002, 0, 1, DUCK);
        this.hum(t, 0.04, 0.3, 'highpass', 3000, 0.7, fx);
        this.tone('sine', fold(f1 * 1.3, 2600), 0, t + 0.04, 0.03, 0.08, fx);
        this.tone('sine', 110, 42, t, 0.07, 0.32, fx);                       // the splorp's body
        this.hum(t, 0.05, 0.22, 'lowpass', 500, 1.5, fx, 0, 0.002);         // its wet hum
        this._gridKick(this._quantCap(now), 0.5, fx);                         // the thump on the groove, like blast
        if (pn >= 2) this.crash(t, 0.25, fx, 0.3);                            // the 3rd pop on: a short bright crash
        break;
      }
      case 'chomp': this._chomp(t, fx); break;
      case 'spareBite':         // the spare life takes the bite: a squashed "oof", the hit's thud, then the chomp (damage, not a snack)
        this.say(t, [220, 140], 'oh', 'uh', 0.14, 0.18);
        this.tone('sine', 130, 45, t, 0.25, 0.5, fx); this.hum(t, 0.2, 0.3, 'lowpass', 900, 1, fx, 0, 0.002, 1, DUCK);
        this._chomp(t + 0.12, fx);
        this.duck(0.5, 0.4);
        break;
      case 'frenzy': {          // impact on the frame the screen flashes, then an upward whoosh tail
        const tier = this._ftier || 1, KK = this.key, h = now + 0.01, x = tier - 1;
        this._frzUntil = now + 0.6;   // a trickTease never rides on top of this stinger
        this.B(h, 1.2, fx); this.crash(h, 1.2, fx);
        const voices = [220, 330], extra = [440, 262, 523, 660];   // A minor all the way up: C natural, never C#
        for (let j = 0; j < Math.min(tier, 4); j++) voices.push(extra[j]);
        this.say(h, voices.map((f) => f * st(KK)), 'ee', 'ah', 0.45, 0.32, 0.12, 0.8);
        if (tier >= 3) this.hey(h + 0.14, 1.1, fx);
        this.duck(0.4, 0.5);
        const wd = 0.25 + 0.05 * x;
        this.hum(now + 0.02, wd, 0.3, 'bandpass', 300, 2, fx, 7000, 0.02);
        // the riser climbs the A minor pentatonic from degree x (one degree higher per tier), so no tier leaves the key
        for (let j = 0; j < 6; j++) this.tone('sawtooth', Math.min(4000, 440 * st(KK + pen(x + j))), 0, now + 0.02 + j * wd / 6, 0.05, 0.045, fx);
        break;
      }
      case 'frenzyEnd': this.hum(t, 0.4, 0.2, 'bandpass', 3000, 2, fx, 300); break;
      case 'second': {          // heartbeat, then a choir rises you from the dead (C major, the relative major: in key)
        this.heart(t, 1.2); this.heart(t + 0.32, 1.3);
        this.say(t + 0.55, [262 * st(K), 330 * st(K), 392 * st(K)], 'oo', 'ah', 0.8, 0.26, 0.4, 1.5);
        this.hum(t + 0.55, 0.6, 0.2, 'bandpass', 600, 2, fx, 6000, 0.4);
        this.duck(0.3, 1.2);
        break;
      }
      case 'zone': {            // choir "ooh-AH" plus a crash, sung in the new zone's key and landing with it
        // the new key waits for the next downbeat (_rekey): the "oo" starts 0.25 s before it, opens to "AH" on it,
        // and the kick and crash hit it, so the arrival and the key change are one moment
        const KT = this.keyTarget, ch = [0, 3, 7, 12].map((s) => 220 * st(KT + s));
        let land = t;
        const spb = 60 / this._bpm / 4;
        if (this._keyNext !== null && this.on && c.state === 'running' && gridOk(this.next, now, spb)) {
          const s16 = Math.max(this._keyBar * 16, (this.stepI + 15) & ~15);   // the step the key lands on
          land = Math.max(t, this.next + (s16 - this.stepI) * spb);
        }
        const st0 = Math.max(t, land - 0.25), lead = land - st0;
        this.say(st0, ch, 'oo', 'ah', 0.7 + lead, 0.24, Math.max(0.05, lead - 0.03), 1);
        this.B(land, 0.9, fx); this.crash(land, 0.7, fx);
        break;
      }
      case 'go': case 'resume': {   // GO! (race start) and back from pause: "B-Pf" on the grid and a crash
        const q = this._next16(now), sp = 60 / this._bpm / 4;
        this.B(q, 1, fx); this.Pf(q + 2 * sp, 0.9, fx); this.crash(q, 0.6, fx);
        if (name === 'go') this._brass(q, fold(440 * st(K + PENTA[5]), 900), 0.25, 0.1);   // the theme's first note
        else this.hum(t, Math.max(0.12, q - t + 0.1), 0.2, 'bandpass', 300, 1.5, fx, 2400, Math.max(0.03, q - t));   // whoosh back in
        break;
      }
      case 'wall': {            // bounced off the wall: a short rubbery "bwomp" from that side
        const side = Math.max(-1, Math.min(1, numArg(k, 'side'))), r = st((Math.random() * 2 - 1) * 1.5), d = 0.06 + Math.random() * 0.03;
        const dest = this._panned(side * 0.7, fx);
        const o = this.tone('sine', 180 * r, 110 * r, t, d, 0.2, dest, 0.003);
        if (o && !this._busy(0)) {   // an 18 Hz wobble: the rubber
          const lfo = c.createOscillator(), dg = c.createGain(); lfo.frequency.value = 18; dg.gain.value = 60;
          lfo.connect(dg); dg.connect(o.detune); this._go(lfo, t, t + d / this._fxR + 0.04);
        }
        this.tone('triangle', 360 * r, 220 * r, t, d * 0.8, 0.06, dest, 0.003);   // the octave a phone speaker can play
        this.hum(t, 0.05, 0.1, 'lowpass', 1100, 2, dest, 350, 0.002);               // the squish
        break;
      }
      case 'egg':               // arrived at the egg: big drum, heavenly chord
        this.B(t, 1.3, fx); this.crash(t, 1, fx); this.tom(t + 0.2, 130, 1, fx);
        this.say(t + 0.1, [262, 330, 392, 523].map((f) => f * st(K)), 'oh', 'ah', 1.4, 0.24, 0.5, 1);
        this.duck(0.4, 1.2);
        break;
      case 'mutation': case 'pick': {
        const f = fold(kf(660), 900);
        this.tone('triangle', f, f * 1.5, t, 0.12, 0.28, fx); this.tone('sine', f * 2, 0, t + 0.08, 0.2, 0.1, fx); this.tone('sine', f * 3, 0, t + 0.12, 0.2, 0.05, this.fxEcho);
        break;
      }
      case 'cards': this.hum(t, 0.3, 0.25, 'bandpass', 300, 1.5, fx, 3000, 0.2); this.tone('sine', 300, 900, t, 0.25, 0.1, fx); break;
      case 'reroll': for (let j = 0; j < 6; j++) this.hum(t + j * 0.04 + Math.random() * 0.02, 0.025, 0.3, 'bandpass', 1800 + Math.random() * 1500, 3, fx); break;
      case 'drill': {           // the egg drill: every tap the next note of the pentatonic climb, in key
        const n = Math.max(0, numArg(k, 'n') | 0), f = this._scaleF(n, 220);
        this.tone('triangle', f, 0, t, 0.07, 0.26, fx, 0.003);
        this.hum(t, 0.05, 0.28, 'bandpass', Math.min(6000, f * 3), 4, fx);
        if (n > 0 && n % 10 === 0) {   // every 10 taps the choir's chord answers
          const ch = this.chord || PROG[0]; let cf = 440 * st(K + ch[(n / 10) % 3]); while (cf > 880) cf /= 2; while (cf < 440) cf *= 2;
          this.tone('sine', cf, 0, t + 0.01, 0.22, 0.12, fx, 0.01); this.tone('sine', cf * 2, 0, t + 0.03, 0.2, 0.025, this.fxEcho, 0.01);
        }
        if (n >= 50) this._layers(t, f, n, fx);
        break;
      }
      case 'win': {             // the theme's call in brass, then the fanfare "da da da DAAA, da da DAAAAA", in the key you finished in
        this.duck(0.15, 3.9);
        const m = st(K), r = 392 * m, sq = 0.075;
        this._holdUntil = t + 16 * sq + 2.6;   // the waiting-room groove waits for the fanfare to ring out
        THEME[0].forEach((d, s) => {
          if (d === null) return;
          const f = fold(440 * m * st(PENTA[d]), 900), len = THEME_LEN[0][s];
          this._brass(t + s * sq, f, sq * len * 0.85, 0.1);
        });
        t += 16 * sq;
        for (let j = 0; j < 9; j++) this.Pf(t + j * 0.04, 0.25 + j * 0.06, fx);
        [0, 0.12, 0.24].forEach((d) => this._brass(t + d, r, 0.1, 0.12));
        const t1 = t + 0.36, t2 = t + 1.14;
        [523, 659, 784].forEach((f) => this._brass(t1, f * m, 0.48, 0.09));
        this.B(t1, 1.1, fx); this.crash(t1, 0.8, fx);
        this._brass(t + 0.86, 587 * m, 0.12, 0.11); this._brass(t + 1.0, 659 * m, 0.12, 0.11);
        [523, 659, 784, 1047].forEach((f) => this._brass(t2, f * m, 1.2, 0.08));
        this.B(t2, 1.2, fx); this.crash(t2, 1.2, fx);
        this.say(t2, [262, 330, 392].map((f) => f * m), 'oh', 'ah', 1.4, 0.2, 0.4, 1);
        [0, 4, 7, 12, 16, 19, 24].forEach((s, j) => this.tone('triangle', 1047 * m * st(s), 0, t2 + 0.3 + j * 0.06, 0.2, 0.06, this.fxEcho));
        if (typeof k === 'number' && k >= 0 && k <= 4) this._rival(t + 2.2, k, 0.8, 0, 0.8, K);   // the beaten rival deflates
        this._outK = K; this._outUntil = this._holdUntil; this._outAt = t2;   // later jingles answer this chord, in this key
        this._resetSong();
        break;
      }
      case 'lose': {            // the thief gloats with its own motif, a kazoo tries the theme and gives up, then one of three sad stings
        const m = st(K), rv = rivalIdx(k), tk = rv >= 0 ? t + 0.9 : t, t0 = tk + 0.95;
        if (rv >= 0) this._rival(t, rv, 1, 7, 0.6, K, 1);
        let j = 0;
        for (let s = 0; s < 16 && j < 4; s++) {   // the first 4 notes of the theme; the 4th hangs on and sags, unresolved
          const d = THEME[0][s]; if (d === null) continue;
          const last = j === 3, f = fold(440 * m * st(PENTA[d]), 700);
          this.say(tk + j * 0.17, [f, f * 1.006], 'ee', last ? 'oo' : 'eh', last ? 0.6 : 0.15, 0.11, 0.05, last ? 0.94 : 1);
          j++;
        }
        let v = Math.floor(Math.random() * 3); if (v === this._loseV) v = (v + 1 + Math.floor(Math.random() * 2)) % 3;
        this._loseV = v;
        this._holdUntil = v === 2 ? t0 + 16 * (60 / this._bpm / 4) + 0.9 : t0 + 2.0;   // the groove waits for the sting
        this.duck(0.2, 3.2 + t0 - t); this.setMuffle(true); this.mlp.frequency.setTargetAtTime(18000, t0 + 3.2, this._ftc(0.4));
        if (v === 0) {          // sad trombone: wah wah wah waaaah
          [233, 220, 208].forEach((f, j) => this._brass(t0 + j * 0.42, f * m, 0.38, 0.13, true));
          this._brass(t0 + 1.26, 196 * m, 1.4, 0.13, true, true);
          this.tone('sine', 98 * m, 0, t0 + 1.26, 1.3, 0.12, fx, 0.05);
        } else if (v === 1) {   // a kazoo deflating like a party balloon, and a last little "pfft"
          this.say(t0, [466 * m, 470 * m], 'ee', 'oo', 1.5, 0.2, 0.6, 0.33);
          this.tone('triangle', 233 * m, 78 * m, t0, 1.45, 0.05, fx, 0.04);
          this.hum(t0 + 1.5, 0.12, 0.2, 'bandpass', 900, 1.2, fx, 300, 0.01);
        } else {                // the beatboxer loses heart: "boots-n-cats-n-boots-n..." and stops
          const sp = 60 / this._bpm / 4;
          this.B(t0, 1, fx); this.ts(t0 + 2 * sp, 0.9, fx); this.Pf(t0 + 4 * sp, 1, fx); this.ts(t0 + 6 * sp, 0.9, fx);
          this.B(t0 + 8 * sp, 0.9, fx); this.ts(t0 + 10 * sp, 0.6, fx);
          this.say(t0 + 16 * sp, [196 * m], 'uh', 'oh', 0.25, 0.16, 0.1, 0.92);
          this.say(t0 + 16 * sp + 0.3, [165 * m], 'oh', 'oo', 0.6, 0.16, 0.2, 0.75);
        }
        this._outK = K; this._outUntil = this._holdUntil; this._outAt = v === 0 ? t0 + 1.26 : v === 1 ? t0 + 1.5 : t0 + 16 * (60 / this._bpm / 4);
        this._resetSong();
        break;
      }
      case 'loseClose': {       // so close: an arpeggio that climbs and hangs on the leading note, unresolved
        const r = fold(220 * st(K), 330);
        [0, 3, 7, 11].forEach((s, j) => {
          const last = j === 3, f = r * 2 * st(s);
          this.tone('triangle', f, 0, t + j * 0.11, last ? 0.5 : 0.1, 0.11, fx, 0.004);
          if (last) this.tone('sine', f, 0, t + j * 0.11, 0.45, 0.04, this.fxEcho, 0.01);
        });
        this._closeF = r * 2 * st(11); this._closeAt = now;
        if (this._rematch && this._rmClose) this._droneOn(this._closeF, t + 0.33);   // and it keeps hanging there
        break;
      }
      case 'drillLead': {       // +1: you took the lead (a brass stab, 2 st higher each retake); -1: a rival did
        const up = numArg(k, 'k') > 0;
        if (up) { const f = fold(392 * st(K + 2 * Math.max(0, this._leadN - 1)), 900); [0, 4, 7].forEach((s, j) => this._brass(t + j * 0.06, f * st(s), j === 2 ? 0.2 : 0.06, 0.1)); }
        else { const f = fold(330 * st(K), 500); this._brass(t, f, 0.32, 0.1, false, false, f * st(-3), 0.26); }
        break;
      }
      case 'rivalShove':        // a rival barges you: "hmpf"
        this.tone('sine', 160, 55, t, 0.1, 0.4, fx, 0.002); this._thudUp(t, 160, 55, 0.1, 0.4, fx);
        this.say(t, [110], 'uh', 'uh', 0.1, 0.12, 0.05, 0.8);
        break;
      case 'again': {           // retry: a 0.5 s rev-up, whoosh 300 to 3000 Hz, "ba-DUM", zip
        this._droneResolve(t);  // a so-close loss's hanging note finally steps up to the tonic
        const g = this._gain(0.45, fx);
        this.hum(t, 0.36, 0.6, 'bandpass', 300, 1.6, g, 3000, 0.25);
        this.B(t + 0.3, 0.7, g); this.B(t + 0.42, 1, g); this.Pf(t + 0.42, 1, g);
        this.tone('sine', 500, 2600, t + 0.44, 0.06, 0.3, g, 0.002);
        break;
      }
      case 'tell': {            // the cilia are about to swat: a rising fizz from their wall, on the next 16th
        const side = Math.max(-1, Math.min(1, numArg(k, 'side'))), q = this._next16(now);
        if (this._busy(1)) break;
        const dest = this._panned(side * 0.8, fx), pk = this.mono ? 0.07 : 0.05;   // mono: about +3 dB, so it cuts through on one earbud
        const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
        s.buffer = this.noiseBuf; bp.type = 'bandpass'; bp.Q.value = 4;
        bp.frequency.setValueAtTime(600, q); bp.frequency.exponentialRampToValueAtTime(1800, q + 0.4);
        g.gain.setValueAtTime(0.0001, q); g.gain.exponentialRampToValueAtTime(pk, q + 0.34); g.gain.linearRampToValueAtTime(0.0001, q + 0.4);
        s.connect(bp); bp.connect(g); g.connect(dest); this.live++; s.onended = this._dec; s.start(q, Math.random() * 0.5); s.stop(q + 0.42);
        break;
      }
      case 'comboLow': {        // the combo timer is running out: a kick-tick on every 8th, a semitone higher each tick
        const q = this._grid(now, 2);
        if (Math.abs(q - this._clQ) < 0.02) break;
        if (now - this._clT > 0.6) this._clN = 0;
        this._clT = now; this._clQ = q;
        const gr = k && typeof k === 'object' && k.grade != null ? Math.max(0, Math.min(4, k.grade | 0)) : bankGrade(this.combo);
        const v = 0.55 + 0.15 * gr, n = Math.min(12, this._clN++), f = fold(880 * st(K + n), 1760);
        this.tone('sine', 150, 55, q, 0.05, 0.28 * v, fx, 0.002); this._thudUp(q, 150, 55, 0.05, 0.28 * v, fx);
        this.tone('triangle', f, 0, q, 0.03, 0.07 * v, fx, 0.001);
        this.hum(q, 0.008, 0.12 * v, 'bandpass', 3000, 2, fx, 0, 0.001);
        break;
      }
      case 'comboMilestone': {  // 100, 150, 200...: the crowd goes wild and the key lifts until the combo ends
        const m = st(this.key);
        for (const [f, v, d] of [[700, 0.16, 0.9], [1500, 0.12, 0.8], [3200, 0.07, 0.6]]) this.hum(t, d, v, 'bandpass', f, 0.9, fx, f * 1.3, 0.08);
        this.say(t + 0.03, [262, 330, 392, 523].map((f) => f * m), 'eh', 'ah', 0.6, 0.18, 0.15, 1.04);   // C major: in key
        this.hey(t + 0.12, 1, fx);
        for (let j = 0; j < 8; j++) this.hum(t + 0.05 + j * 0.06 + Math.random() * 0.03, 0.02, 0.18, 'bandpass', 1200 + Math.random() * 900, 2, fx);   // claps
        this.duck(0.5, 0.6);
        break;
      }
      case 'ready': {
        // the rematch groove: the band's lowpass opens over 600 ms and the pluck lands on the beat it opens onto
        const q = this._rematch && !this._rmOpen ? this._rematchOpen(now) : t;
        const f = fold(kf(440), 600); this._pluck(q, f, 0.08); this._pluck(q + 0.07, f * 1.5, 0.08);
        break;
      }
      case 'synTease': {        // two mutations are one card away from a synergy: a shimmer, fifth to octave
        const r = fold(440 * st(K), 700);
        this.tone('triangle', r * 1.5, 0, t, 0.12, 0.25, fx, 0.006);
        this.tone('triangle', r * 2, 0, t + 0.1, 0.15, 0.25, fx, 0.006);
        this.tone('sine', r * 4, 0, t + 0.1, 0.12, 0.03, this.fxEcho, 0.006);
        break;
      }
      case 'swat': this.tone('sine', 1200, 300, t, 0.09, 0.22, fx, 0.002); this.hum(t, 0.02, 0.12, 'highpass', 3000, 0.7, fx); break;
      case 'clutch': {          // a tight 4-hit snare roll that lands on the next combo note
        const sp = 60 / this._bpm / 4, d = Math.min(0.035, sp / 3);
        let q = this._quant(now); while (q < t + 3 * d + 0.01) q += sp / 2;
        for (let j = 0; j < 4; j++) this.Pf(q - (3 - j) * d, 0.35 + 0.15 * j, fx);
        const f = this._scaleF(this._linkN + 1, 440);
        this.tone('triangle', f * 0.97, f, q, 0.08, 0.1, fx, 0.003, 0.02);
        break;
      }
      case 'finisher': {        // mic drop: a reversed cymbal sucked into a heavy thud, then the coins
        const g = Math.max(0, Math.min(4, numArg(k, 'grade') | 0)), sw = 0.2 + 0.05 * g, h = t + sw;
        if (!this._busy(1)) {   // the reversed cymbal: highpassed noise swelling up to the drop, cut dead on it
          const s = c.createBufferSource(), hp = c.createBiquadFilter(), gg = c.createGain();
          s.buffer = this.noiseBuf; hp.type = 'highpass'; hp.Q.value = 0.7;
          hp.frequency.setValueAtTime(9000, t); hp.frequency.exponentialRampToValueAtTime(3000, h);
          gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.16 + 0.04 * g, h - 0.005); gg.gain.linearRampToValueAtTime(0.0001, h + 0.01);
          s.connect(hp); hp.connect(gg); gg.connect(fx); this.live++; s.onended = this._dec; s.start(t, Math.random() * 0.4); s.stop(h + 0.03);
        }
        this.tone('sine', 140, 38, h, 0.32, 0.55 + 0.05 * g, fx, 0.002, 0.2);     // the thud
        this._thudUp(h, 140, 38, 0.2, 0.55 + 0.05 * g, fx);
        this.tone('triangle', 260, 90, h, 0.06, 0.25, fx, 0.001);                // the mic body knocking the floor
        this.hum(h, 0.09, 0.4, 'lowpass', 700, 1.5, fx, 200, 0.001);
        this.tone('sine', fold(1760 * st(K), 2400), 0, h + 0.07, 0.35, 0.025, this.fxEcho, 0.02);   // a whisper of feedback
        this._coins(h + 0.08, g, K, fx);
        this.duck(0.4, 0.5);
        break;
      }
      case 'style': {           // style level up: a rising diatonic third on the next 16th, a scale step higher per level
        const lv = Math.max(3, Math.min(6, numArg(k, 'lv') | 0)), sp = 60 / this._bpm / 4, g = this._next16(now);
        const s0 = [7, 8, 10, 12][lv - 3], s1 = third(s0);   // E-G, F-A, G-B, A-C: always in A minor
        let o = 1; while (440 * st(K + s1) * o > 1400) o /= 2;
        const f = 440 * st(K + s0) * o, f2 = 440 * st(K + s1) * o;
        this.tone('triangle', f, 0, g, 0.09, 0.12, fx, 0.003);
        this.tone('triangle', f2, 0, g + sp, 0.16, 0.12, fx, 0.003);
        this.tone('sine', f2 * 2, 0, g + sp, 0.12, 0.03, this.fxEcho, 0.003);
        break;
      }
      case 'tap': {             // k 0..1 climbs for the rank count-up (in key, a soft triangle, never above 1100 Hz); plain buttons use 0
        const x = clamp01(k);
        if (x > 0) {
          let f = inKey(Math.min(1100, 400 * Math.pow(4, x)), K);
          if (f > 1100) f = inKey(f * st(-2.6), K);   // snapped up past the cap: take the scale note below
          const hv = now < this._outUntil ? 0.5 : 1;   // under the fanfare: the count-up ticks sit back
          this.tone('triangle', f * 1.06, f, t, 0.04, (0.1 + 0.08 * x) * hv, fx, 0.002, 0.015);
        } else this.tone('sine', 700, 400, t, 0.04, 0.15, fx, 0.002);
        this.hum(t, 0.01, 0.12, 'highpass', 4000, 0.7, fx);
        break;
      }
      case 'buy': {             // ka-ching
        const f = fold(kf(1047), 1400);
        this.hum(t, 0.05, 0.35, 'bandpass', 2500, 1, fx);
        this.tone('square', f, 0, t + 0.04, 0.06, 0.09, fx); this.tone('square', f * 1.5, 0, t + 0.1, 0.25, 0.09, fx);
        this.hum(t + 0.1, 0.3, 0.1, 'highpass', 7000, 0.7, fx);
        break;
      }
      case 'combo': {           // a crew member shouts "yeah!", higher for bigger combos
        const p = fold(220 * st(K + pen(Math.min(5, Math.floor((+k || 0) / 10)))), 440);   // climbs the pentatonic, in key
        this.say(t, [p, p * 1.5], 'ee', 'ah', 0.28, 0.24, 0.12, 0.85);   // the voice right away
        this._gridKick(this._quantCap(now), 0.6, fx);                      // its kick on the groove
        break;
      }
      case 'comboEnd':          // combo dropped: a deflating slide whistle
        this.tone('sine', 900, 180, t, 0.35, k >= 10 ? 0.12 : 0.06, fx, 0.01);
        break;
      case 'comboBreak': {      // a record scratch; a 10+ chain also falls down the ladder it climbed (see _breakRun)
        const n = this._brkN, sp = 60 / this._bpm / 4;
        // "wikka-wikka-wikk": back, forward, back. Each stroke is the needle hiss (a swept bandpass) over the vinyl itself,
        // a held, pitched saw (see _scratch), since noise alone is too thin to beat the music on a phone speaker
        this.hum(t, 0.1, 0.8, 'bandpass', 3200, 2, fx, 500);
        this.hum(t + 0.1, 0.08, 0.6, 'bandpass', 500, 2, fx, 2200);
        this.hum(t + 0.19, 0.17, 0.6, 'bandpass', 2800, 2, fx, 400);
        this._scratch(t, 900, 160, 0.1, 0.6, fx); this._scratch(t + 0.1, 180, 700, 0.09, 0.48, fx); this._scratch(t + 0.19, 800, 110, 0.2, 0.55, fx);
        if (n >= 10) this._breakRun(now, n, K, fx);
        this.duck(n >= 10 ? 0.35 : 0.6, (n >= 25 ? 16 : n >= 10 ? 4 : 2) * sp);
        break;
      }
      case 'comboBank': {       // combo cashed in: the first coin and a crowd "ohhh"; the rest of the coins land with the helices (dnaTick)
        const g = this._bankG;
        // calm mode, or a caller with no helices (k.cascade): the whole cascade right here. Until the first dnaTick
        // ever arrives, tick() plays the rest of the cascade 0.6 s later unless a helix lands first.
        if (this.calm || (k && typeof k === 'object' && k.cascade)) this._coins(t, g, K, fx);
        else { this._coins(t, g, K, fx, 0, 1); if (!this._tickSeen && g > 0) this._bankPend = now + 0.6; }
        if (g >= 1) {           // and a crowd "ohhh" that grows with the grade
          const m = st(K), d = 0.3 + 0.225 * g, vs = [196, 247, 294, 330, 392].slice(0, 2 + Math.ceil(g / 2)).map((f) => f * m);
          this.say(t + 0.14, vs, 'oh', 'oo', d, 0.1 + 0.03 * g, d * 0.5, 0.97);
          this.hum(t + 0.14, d, 0.06 + 0.02 * g, 'bandpass', 700, 1.2, fx, 0, d * 0.3);
        }
        break;
      }
      case 'boss': {            // passed a named rival: their own motif, a kick and a crash
        if (typeof k === 'number' && k >= 0 && k <= 4) this._rival(t, k, 1);
        else [0, 4, 7].forEach((s) => this._brass(t, 392 * st(K + s), 0.25, 0.08));
        const q = this._quantCap(now); this._gridKick(q, 1, fx); this.crash(q, 0.8, fx);
        break;
      }
      case 'bossTaunt': this._rival(t, +k || 0, 0.5, -5); break;
      case 'eggClaim': {        // a rival is drilling YOUR egg: "dun DUN", then its motif, smug
        this._brass(t, 196, 0.16, 0.14); this.tone('sine', 98, 0, t, 0.16, 0.2, fx, 0.005);
        this._brass(t + 0.22, 185, 0.5, 0.18); this.tone('sine', 92.5, 0, t + 0.22, 0.5, 0.25, fx, 0.005);
        this.B(t + 0.22, 0.8, fx);
        const rv = rivalIdx(k); if (rv >= 0) this._rival(t + 0.5, rv, 0.9, 0, 0.3, K, 1);
        break;
      }
      case 'drillShove': this.tone('sine', 300, 120, t, 0.08, 0.35, fx, 0.002); this._thudUp(t, 300, 120, 0.08, 0.35, fx); break;
      case 'surf': this.hum(t, 0.4, 0.3, 'lowpass', 400, 2, fx, 2500, 0.1); this.tone('sine', 400, 800, t, 0.3, 0.08, fx); break;
      case 'heart': this.heart(t, 1); break;
      case 'lowE': {            // low energy: a heartbeat on the next quarter note, never on top of the egg bed
        if (this._tension > 0.02 || this._contest) break;
        let tq = t;
        if (this.on && c.state === 'running' && this.next >= now && this.next < now + 1) {
          const sp = 60 / this._bpm / 4; tq = this.next + ((4 - (this.stepI & 3)) & 3) * sp;
        }
        if (Math.abs(tq - this._lowQ) < 0.05) break;   // that quarter already has its heartbeat
        this._lowQ = tq; this._hatDuck = tq + 0.32;
        if (numArg(k, 'k') >= 1) {   // critical: louder, and a bright tick on the "dub" a phone can play
          this.heart(tq, 0.85); this.tone('sine', 2000, 0, tq + 0.14, 0.04, 0.06, fx, 0.001);
        } else this.heart(tq, 0.7);
        break;
      }
      // ---------------- stingers for the rare moments (each under 0.6 s, in the song's key)
      case 'synergy': {         // slides into C maj7 (C E G B, the relative major: all in key), the crowd goes WOAH, a cymbal swells
        const r = 262 * st(K), fresh = k === true || (k && k.fresh);
        this.tone('triangle', r * st(-1), r, t, 0.45, 0.1, fx, 0.01, 0.12);          // B up to C
        this.tone('triangle', r * st(5), r * st(7), t, 0.45, 0.08, fx, 0.01, 0.12);  // F up to G
        this.tone('sine', r * st(4), 0, t + 0.12, 0.34, 0.06, fx, 0.02);              // E
        this.tone('sine', r * st(11), 0, t + 0.12, 0.34, 0.05, this.fxEcho, 0.02);    // the maj7, B
        this.say(t + 0.05, [262, 330, 392].map((f) => f * st(K)), 'oo', 'ah', 0.5, 0.16, 0.2, 1.06);
        this.hum(t, 0.5, 0.12, 'highpass', 5000, 0.7, fx, 0, 0.38);
        if (fresh) this.duck(0.5, 0.6);
        break;
      }
      case 'close':             // a near miss: just a whoosh (the combo link already played the note)
        this.hum(t, 0.18, 0.5, 'bandpass', 600, 1.5, fx, 2400, 0.02);
        break;
      case 'thread':            // threaded a gate: a little whistle (the link's pluck is the hit)
        this.tone('sine', 1175 * st(K) * 0.94, 1175 * st(K), t + 0.02, 0.16, 0.18, fx, 0.01, 0.04);
        this.tone('sine', 1175 * st(K), 0, t + 0.06, 0.12, 0.06, this.fxEcho, 0.01);
        break;
      case 'blast': {           // chain pop: one kick and a rising ladder of pops
        const n = Math.max(0, numArg(k, 'n') | 0), q = this._quantCap(now);
        this._gridKick(q, Math.min(1.8, 1 + 0.1 * n), fx);
        for (let j = 0; j < Math.min(n, 8); j++) { const f = 380 * st(K + j * 2); this.tone('sine', f, f * 4, t + 0.03 + j * 0.04, 0.05, 0.22, fx, 0.002, 0, 1, j === 0 ? DUCK : null); }
        if (n >= 5) { this.crash(Math.max(q, t + 0.03), 0.6, fx, 0.3); this.impact(90); }   // a big chain: a crash and a hit-stop gasp (and the BOOST send)
        break;
      }
      case 'record': case 'medal':
        if (now < this._outUntil) { this._outAnswer(t, K); break; }   // the fanfare is still ringing: answer it, never a second fanfare
        if (name === 'medal') {   // a medal right after a record waits its turn: 0.5 s after the record, never on top of it
          const lr = this.last.record ?? -9;
          this._medal(now - lr < 0.5 ? Math.max(t, lr + 0.5) : t, k, K, fx); break;
        }
        this._record(now, t, K, fx);
        break;
      case 'legendary': {       // a rising hiss, then a bell
        const f = 1568 * st(K);
        this.hum(t, 0.28, 0.16, 'highpass', 800, 1, fx, 8000, 0.26);
        this.tone('sine', f, 0, t + 0.28, 0.3, 0.14, fx, 0.001);
        this.tone('sine', f * 2.76, 0, t + 0.28, 0.15, 0.04, fx, 0.001);
        this.tone('sine', f, 0, t + 0.3, 0.25, 0.05, this.fxEcho, 0.001);
        break;
      }
      case 'milestone':         // "hey!" and a hat roll
        this.hey(t, 1.1, fx);
        for (let j = 0; j < 6; j++) this.hat(t + j * 0.045, 0.6 + j * 0.15, fx);
        break;
      case 'event': {           // a wobbly cartoon siren
        const o = this.tone('sine', 600 * st(K), 0, t, 0.5, 0.12, fx, 0.01);
        if (o) { const F = o.frequency, b = 600 * st(K); F.cancelScheduledValues(t); F.setValueAtTime(b, t); for (let j = 1; j <= 4; j++) F.linearRampToValueAtTime(j & 1 ? b * 1.5 : b, t + j * 0.12); }
        this.tone('triangle', 300 * st(K), 450 * st(K), t, 0.5, 0.05, fx, 0.01, 0.25);
        break;
      }
      case 'spot': {            // a WBC has spotted you: a curious two-note "huh?" (330 then 495 Hz, 60 ms each), from its side
        const dest = this._panned(Math.max(-1, Math.min(1, numArg(k, 'pan'))), fx);
        [330, 495].forEach((f, j) => {
          const tj = t + j * 0.07;
          this.tone('sine', f * (j ? 0.96 : 1), f, tj, 0.06, 0.16, dest, 0.006, 0.03);   // the second note scoops up, like a question
          this.tone('sine', f * 2, 0, tj, 0.05, 0.05, dest, 0.006);                      // its octave: what a phone speaker plays
        });
        break;
      }
      case 'lockon': {          // something locks on: a low growl (saw 90 Hz, lowpass 600 Q 4, 0.28 s, 8 Hz tremolo), then a marimba knock
        const pan = Math.max(-1, Math.min(1, numArg(k, 'pan'))), m = st(K), dest = this._panned(pan, fx), r = this._fxR;
        if (!this._busy(1, 2)) {
          const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), ld = c.createGain(), d = 0.28 / r;
          o.type = 'sawtooth'; o.frequency.value = 90 * r; lp.type = 'lowpass'; lp.frequency.value = 600 * r; lp.Q.value = 4;
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.03); g.gain.setValueAtTime(0.2, t + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
          const tr = c.createGain(); tr.gain.value = 0.65; lfo.frequency.value = 8; ld.gain.value = 0.35; lfo.connect(ld); ld.connect(tr.gain);   // 8 Hz tremolo, 0.3..1
          o.connect(lp); lp.connect(tr); tr.connect(g); g.connect(dest);
          this._go(o, t, t + d + 0.02); this._go(lfo, t, t + d + 0.02);
        }
        [110, 130.81].forEach((f, j) => { const tj = t + 0.12 + j * 0.09; this.tone('sine', f * m, 0, tj, 0.16, 0.22, dest, 0.001); this.tone('sine', f * m * 4, 0, tj, 0.04, 0.05, dest, 0.001); });
        break;
      }
      case 'edge': {            // grazing the tube's edge: a 10..15 ms click at 1.8..2.4 kHz, fully on that side, over a 60 ms 90 Hz sub
        // (GAP throttles it to one every 120 ms; 'wall' stays the body bounce)
        const side = Math.max(-1, Math.min(1, numArg(k, 'side'))), dest = this._panned(side < 0 ? -1 : side > 0 ? 1 : 0, fx);
        this.hum(t, 0.01 + Math.random() * 0.005, 0.16, 'bandpass', 1800 + Math.random() * 600, 3, dest, 0, 0.001);
        this.tone('sine', 90, 0, t, 0.06, 0.08, fx, 0.003);
        break;
      }
      case 'dashPop': {         // a dash pops something: a pop transient right now, then a short swoosh up (k = pan)
        const dest = this._panned(Math.max(-1, Math.min(1, numArg(k, 'pan'))) * 0.6, fx);
        this.hum(t, 0.012, 0.3, 'highpass', 2500, 0.7, dest, 0, 0.001);                    // the pop's crack
        this.tone('sine', 420, 1400, t, 0.04, 0.3, dest, 0.001, 0.025, 1, DUCK);             // its chirp (a real hit: micro duck)
        this.tone('square', 210, 105, t, 0.03, 0.06, dest, 0.001);                          // a wet knock under it
        this.hum(t + 0.025, 0.14, 0.24, 'bandpass', 700, 1.6, dest, 4200, 0.03);            // the swoosh, up
        this._gridKick(this._quantCap(now), 0.45, fx);                                      // its thump on the groove
        break;
      }
      case 'fork': {            // the fork: k.right true = a happy pluck run and a crowd "ooh"; false = sad brass and a "huh?"
        const right = k === true || !!(k && k.right);
        if (right) {
          const r = fold(kf(523), 700);
          [0, 4, 7, 12].forEach((s, j) => this._pluck(t + j * 0.05, r * st(s), 0.11));
          this.say(t + 0.1, [262, 330, 392].map((f) => f * st(K)), 'oo', 'oh', 0.42, 0.12, 0.15, 1.03);   // C major: in key
        } else {
          const r = fold(330 * st(K), 420);
          this._brass(t, r, 0.18, 0.11, true); this._brass(t + 0.2, r * st(-2), 0.3, 0.11, true, false, r * st(-3), 0.3);
          this.say(t + 0.3, [fold(196 * st(K), 260)], 'uh', 'eh', 0.22, 0.14, 0.06, 1.25);   // "huh?", rising like a question
        }
        break;
      }
      case 'backflow': {        // swimming the wrong way: a tape rewind (the band also drops out for a dry beat)
        if (!this._busy(1)) {
          const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
          o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(1400, t + 0.35);
          lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 1;
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.04); g.gain.setValueAtTime(0.09, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
          o.connect(lp); lp.connect(g); g.connect(fx); this._go(o, t, t + 0.4);
        }
        this.hum(t, 0.35, 0.2, 'bandpass', 500, 2.5, fx, 4500, 0.03);
        for (let j = 0; j < 5; j++) this.hum(t + j * 0.07, 0.012, 0.1, 'bandpass', 2500 + j * 400, 3, fx);   // the tape flutter
        break;
      }
      case 'finale': {          // the final sprint: a riser and a "hey!" (the music rolls into a crash and speeds up)
        if (!this._busy(1)) {   // a noise riser that swells to the "hey!"
          const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
          s.buffer = this.noiseBuf; bp.type = 'bandpass'; bp.Q.value = 1.5;
          bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(5000, t + 0.36);
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.34); g.gain.linearRampToValueAtTime(0.0001, t + 0.38);
          s.connect(bp); bp.connect(g); g.connect(fx); this.live++; s.onended = this._dec; s.start(t, Math.random() * 0.5); s.stop(t + 0.4);
        }
        this.tone('sawtooth', 220 * st(K), 440 * st(K), t, 0.06, 0.04, fx, 0.3, 0.34);
        this.hey(t + 0.36, 1, fx);
        break;
      }
      case 'dnaTick': {         // one DNA helix lands in the counter: the next coin up the pentatonic; the last one closes the bank
        const n = Math.max(1, numArg(k, 'n') | 0), i = Math.max(0, Math.min(n - 1, numArg(k, 'i') | 0)), last = i === n - 1;
        const g = k && typeof k === 'object' && k.grade != null ? Math.max(0, Math.min(4, k.grade | 0)) : this._bankG;
        this._coin(t, i, K, last, fx);
        if (last) this._coinEnd(t, Math.max(n, i + 1), g, K, fx);
        break;
      }
      case 'rivalTell': {       // a rival winds up a move at the egg: its own motif, every note held and bent up a fourth over 0.5 s
        const rv = rivalIdx(k);
        if (rv >= 0) this._rival(t, rv, 0.6, 0, 0.5, K, st(5));
        else { const f = fold(220 * st(K), 330); this._brass(t, f, 0.5, 0.1, false, false, f * st(5), 0.45); }
        this.hum(t, 0.5, 0.05, 'bandpass', 500, 2, fx, 1600, 0.4);   // a breath drawn in under it
        break;
      }
      case 'countered': {       // you turned a rival's move around: a record scratch, then a gold ping
        this.hum(t, 0.08, 0.32, 'bandpass', 3200, 4, fx, 600);
        this.hum(t + 0.08, 0.07, 0.24, 'bandpass', 600, 4, fx, 2400);
        this.tone('sawtooth', 700, 160, t, 0.12, 0.05, fx, 0.003);
        const f = fold(kf(1568), 2100), pt = t + 0.17;
        this.tone('triangle', f, 0, pt, 0.3, 0.16, fx, 0.002);
        this.tone('sine', f * 2.76, 0, pt, 0.12, 0.04, fx, 0.002);
        this.tone('sine', f, 0, pt + 0.03, 0.3, 0.05, this.fxEcho, 0.002);
        break;
      }
      case 'factory': {         // Dad's factory pays out (k 0..3: bank under 25%, 25-60%, 60-99%, full)
        const lv = Math.max(0, Math.min(3, numArg(k, 'k') | 0)), m = st(K);
        this.duck(0.5, 0.8);    // -6 dB on the menu music for 0.8 s
        // a two-note steam whistle: a sine chord (root and a minor third) on a breathy hiss, the second note a 4th up
        [[0, 0, 0.16], [5, 0.2, 0.32 + 0.06 * lv]].forEach(([s, d, len]) => {
          const f = fold(587 * m * st(s), 1100);
          for (const r of [1, st(3)]) this.tone('sine', f * r * 0.97, f * r, t + d, len, 0.07, fx, 0.025, 0.05);
          this.hum(t + d, len, 0.04, 'bandpass', f * 2, 3, fx, 0, 0.02);
        });
        // the ka-ching: a noise burst and a 2.4 kHz bell
        const kt = t + 0.6 + 0.06 * lv;
        this.hum(kt, 0.05, 0.3, 'bandpass', 2500, 1, fx);
        [1, 2.76].forEach((r, j) => this.tone('sine', 2400 * r, 0, kt + 0.03, j ? 0.12 : 0.4, j ? 0.03 : 0.1, fx, 0.001));
        this.tone('sine', 2400, 0, kt + 0.05, 0.3, 0.03, this.fxEcho, 0.001);
        if (lv >= 2) {          // a 3-note beatbox fill in key: mouth toms walking down the pentatonic, then a kick
          const sp = 0.07, tb = fold(220 * m, 300);
          [4, 2, 0].forEach((d, j) => { let f = tb * st(pen(d)); while (f > 300) f /= 2; while (f < 110) f *= 2; this.tom(kt + 0.12 + j * sp, f, 0.7, fx); });
          this.B(kt + 0.12 + 3 * sp, 0.8, fx);
          if (lv >= 3) this.hey(kt + 0.12 + 3 * sp, 0.9, fx);   // full: the crew cheers
        }
        break;
      }
      case 'countTick': {       // the welcome count-up: p 0..1 climbs from the root to an octave up, on the pentatonic
        const p = clamp01(numArg(k, 'p')), f = fold(440 * st(K), 700) * st(pen(Math.round(p * 5)));
        this.tone('triangle', f * 1.04, f, t, 0.045, 0.08 + 0.05 * p, fx, 0.002, 0.012);
        this.hum(t, 0.008, 0.06, 'highpass', 5000, 0.7, fx);
        break;
      }
      case 'trick': {           // a named trick: its 3 links replayed as a quantised arpeggio, a wah chord and a crash
        // k = { id, first, kinds: [k1, k2, k3] }. Each kind keeps its own link timbre on ladder degrees +0 / +2 / +4
        // from the live combo's degree, 1/16 apart from the next 16th. first: the first time this trick is landed
        // this run, so the band also lifts the key for one bar (like comboMilestone, but it drops back after the bar)
        const kinds = k && Array.isArray(k.kinds) ? k.kinds : [];
        // after a trickTease, the trick's first note lands one semitone above the riser's end note
        const teased = this._teaseD >= 0 && now - this._teaseAt < 2;
        const sp = 60 / this._bpm / 4, q = this._next16(now), d0 = teased ? this._teaseD : ladderDegree(this._linkN);
        const base = teased ? this._teaseB : this._runBase(this._linkN, 440, K);   // the same octave as the link ladder's run
        this._teaseD = -1;
        this._trickKinds = kinds.slice(0, 3); this._trickD = d0; this._trickB = base;   // a trickStreak replays this arpeggio
        for (let j = 0; j < 3; j++) {
          const f = fold(base * st(K + pen(d0 + 2 * j))), qj = q + j * sp;
          if (j === 0) this._transient(t, f, fx);
          this._kindVoice(qj, f, typeof kinds[j] === 'string' ? kinds[j] : 'pass', fx);
        }
        const tc = q + 3 * sp, ch = this.chord || PROG[0];
        this._trickAt = now; this._trickEnd = tc;
        if (this.stabBank) {    // the stab bank's "wah" (music bus), sung in the current chord
          this._vowel(this.stabBank, 'oo', tc, 0.004); this._vowel(this.stabBank, 'ah', tc + 0.03, 0.08);
          for (const s of ch) { let f = 220 * st(K + s); while (f > 520) f /= 2; while (f < 260) f *= 2; this._sing(this.stabBank, f, tc, 0.22, 0.07, 0.01, 1); }
        }
        this.say(tc, [fold(330 * st(K + ch[0]), 520)], 'oo', 'ah', 0.2, 0.08, 0.06, 1, fx, 0);   // the wah on the fx side too (music off still hears it)
        this.crash(tc, 0.8, fx, 0.5);
        if (k && k.first && !this._tlift && this.on) { this._tlift = 2; this._tliftPend = true; this._rekey(true); }
        break;
      }
      case 'domino': {          // a domino chain: bowling pins clacking up the scale, and an "oooh" for 3+
        const n = Math.max(0, numArg(k, 'n') | 0), m = Math.min(n, 6), f0 = this._passF || 440;
        for (let j = 0; j < m; j++) {
          const tj = t + j * 0.035, f = fold(f0 * st(pen(j)), 2400);
          this.hum(tj, 0.025, 0.12, 'bandpass', 1800, 4, fx, 2600, 0.001, 1, j === 0 ? DUCK : null);   // the clack
          this.tone('triangle', f, f * 0.92, tj, 0.025, 0.07, fx, 0.001);                            // the pin's knock, in key
          this.tone('sine', fold(f * 2.3, 4000), 0, tj, 0.018, 0.025, fx, 0.001);                     // a woody overtone
        }
        if (n >= 3) {
          const r = fold(262 * st(K), 392);   // C E G, the relative major: in key
          this.say(t + m * 0.035 + 0.05, [r, r * st(4), r * 1.5], 'oo', 'oh', 0.45, 0.12, 0.18, 1.05, fx, 0);
        }
        break;
      }
      case 'whoosh': {          // swept into a current: a 0.25 s noise sweep 400 -> 2000 Hz from its side
        const pan = Math.max(-1, Math.min(1, numArg(k, 'pan')));
        const dest = this._panned(pan * 0.6, fx);
        this.hum(t, 0.25, 0.22, 'bandpass', 400, 1.6, dest, 2000, 0.06);
        break;
      }
      case 'trickTease': {      // two links of a trick in: a 0.35 s filtered riser from the next 16th, a soft open hat on the beat
        if (now < this._frzUntil) break;   // never on top of a FRENZY stinger
        const sp = 60 / this._bpm / 4, q = this._next16(now), d0 = ladderDegree(this._linkN), r = this._fxR;
        const base = this._runBase(this._linkN, 440, K);   // the trick's own octave (see 'trick')
        const fE = fold(base * st(K + pen(d0))) * st(-1), end = q + 0.35 / r;      // ends a semitone under the trick's first note
        this._teaseD = d0; this._teaseB = base; this._teaseF = fE; this._teaseAt = now;
        let hb = this._grid(now, 4); while (hb < q + 0.2) hb += 4 * sp;
        this.ts(hb, 0.5, fx);
        if (this._busy(1, 3)) break;
        const o = c.createOscillator(), s = c.createBufferSource(), ng = c.createGain(), lp = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(fE * r / 2, q); o.frequency.exponentialRampToValueAtTime(fE * r, end);
        lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.setValueAtTime(600, q); lp.frequency.exponentialRampToValueAtTime(3000, end);
        g.gain.setValueAtTime(0.0001, q); g.gain.exponentialRampToValueAtTime(0.14, end - 0.02); g.gain.linearRampToValueAtTime(0.0001, end + 0.02);
        s.buffer = this.noiseBuf; ng.gain.value = 0.5;
        o.connect(lp); s.connect(ng); ng.connect(lp); lp.connect(g); g.connect(fx);
        this._go(o, q, end + 0.04); this.live++; s.onended = this._dec; s.start(q, Math.random() * 0.5); s.stop(end + 0.04);
        break;
      }
      case 'trickMiss': {       // the trick window lapsed: a tiny "aww" sliding down from where the tease left off
        let af = this._teaseF || fold(440 * st(K), 520); while (af > 520) af /= 2; while (af < 260) af *= 2;
        this._teaseD = -1;
        this.say(t, [af], 'ah', 'oo', 0.24, 0.07, 0.1, 0.75, fx, 0);
        this.tone('triangle', af, af * 0.75, t, 0.2, 0.035, fx, 0.01);
        break;
      }
      case 'draftOn':           // a draft pick locks in: a soft 40 ms click
        this.tone('sine', 1500, 1100, t, 0.03, 0.08, fx, 0.001);
        this.hum(t, 0.006, 0.04, 'highpass', 5000, 0.7, fx, 0, 0.001);
        break;
      case 'slingReady': {      // the sling is charged: a short rising chirp, root to octave, in key
        const f = fold(kf(660), 900);
        this.tone('triangle', f, f * 2, t, 0.18, 0.1, fx, 0.005, 0.15);
        this.tone('sine', f * 2, 0, t + 0.15, 0.08, 0.03, this.fxEcho, 0.003);
        break;
      }
      case 'goal': {            // a goal reached: the ka-ching an octave up, then two coins
        const f = fold(kf(1047), 1400) * 2;
        this.hum(t, 0.05, 0.3, 'bandpass', 5000, 1, fx);
        this.tone('square', f, 0, t + 0.04, 0.06, 0.07, fx); this.tone('square', f * 1.5, 0, t + 0.1, 0.25, 0.07, fx);
        this.hum(t + 0.1, 0.3, 0.08, 'highpass', 9000, 0.7, fx);
        this._coins(t + 0.22, 1, K, fx, 0, 2);
        break;
      }
      case 'pastBest':          // swam past your best: a 0.25 s rising whoosh into a "hey!"
        this.hum(t, 0.25, 0.22, 'bandpass', 400, 1.6, fx, 3500, 0.2);
        this.hey(t + 0.25, 0.8, fx);
        break;
      case 'grudge': {          // beat the rival you hold a grudge against: its motif sliding down an octave, then a rim
        const rv = rivalIdx(k);
        if (rv >= 0) this._rival(t, rv, 0.8, 0, 0.45, K, 0.5);
        else { const f = fold(330 * st(K), 500); this._brass(t, f, 0.4, 0.1, false, false, f / 2, 0.4); }
        this.rim(t + 0.55, 1.2, fx);
        break;
      }
      case 'trickStreak': {     // tricks back to back: the last trick's arpeggio again, a fourth higher per streak step, the
        // trick crash and the crew stacking up a "hey!" (one more voice per level), with the fx echo held on
        const n = Math.max(1, Math.min(8, numArg(k, 'n') | 0)), sp = 60 / this._bpm / 4, up = st(5 * n);
        // right behind a trick (same frame): start where its arpeggio ends, so the two run on as one phrase
        let q = this._next16(now); if (now - (this._trickAt ?? -9) < 0.2 && this._trickEnd > q) q = this._trickEnd;
        const kinds = this._trickKinds || [];
        for (let j = 0; j < 3; j++) {
          const f = fold(this._trickB * st(K + pen(this._trickD + 2 * j)) * up, 1760), qj = q + j * sp;
          if (j === 0) this._transient(t, f, fx);
          this._kindVoice(qj, f, typeof kinds[j] === 'string' ? kinds[j] : 'pass', fx);
        }
        const tc = q + 3 * sp, nv = Math.min(4, n);
        this.crash(tc, 0.9, fx, 0.5);
        const rel = (((2 * n - 2) % 12) + 12) % 12, r = fold(196 * st(K + 2 * n), 520);   // hey()'s G, 2 st higher per step
        const voices = [r, r * st(third(rel) - rel), r * 1.5, r * 2].slice(0, nv);
        const hg = this._gain(1, fx); hg.connect(this.fxEcho);
        this.say(tc, voices, 'eh', 'ay', 0.25, 0.12 * Math.sqrt(this._lite ? 1 : nv), 0.12, 1, hg);
        if (this.ffb) { const g = this.ffb.gain; g.cancelScheduledValues(tc); g.setTargetAtTime(0.55, tc, 0.01); g.setTargetAtTime(0.3, tc + 0.3, 0.08); }   // a 0.3 s echo hold
        this.duck(0.45, 0.5);
        break;
      }
      case 'overtaken': {       // a rival swims past you: a Doppler whoosh from its side, then the first 2 notes of its motif, low
        const pan = Math.max(-1, Math.min(1, numArg(k, 'pan')));
        this.hum(t, 0.3, 0.18, 'bandpass', 2600, 2, this._panned(pan, fx), 500, 0.03);
        const rv = rivalIdx(k);
        if (rv >= 0) { const base = this.fx; this.fx = this._panned(pan * 0.5, base); try { this._rival(t + 0.2, rv, 0.35, -5, 0, K, 0.5, 2); } finally { this.fx = base; } }
        break;
      }
      case 'gift': {            // a free sugar: two in-key pings an octave apart
        const f = fold(kf(1320), 1400);
        this.tone('sine', f / 2, 0, t, 0.12, 0.08, fx, 0.003);
        this.tone('sine', f, 0, t + 0.07, 0.2, 0.08, fx, 0.003);
        break;
      }
      case 'bounty': {          // the bounty stamp: a cash register "k-ching", a hat roll, the drawer, two square plucks a fifth apart
        for (let j = 0; j < 4; j++) this.hat(t + j * 0.025, 0.5 + 0.2 * j, fx, j & 1);
        const f = fold(kf(1175), 1400);
        this.hum(t + 0.1, 0.04, 0.3, 'bandpass', 3000, 1.2, fx);
        this.tone('square', f, 0, t + 0.12, 0.05, 0.08, fx, 0.002);
        this.tone('square', f * 1.5, 0, t + 0.18, 0.4, 0.08, fx, 0.002);
        this.tone('sine', f * 3, 0, t + 0.18, 0.3, 0.03, this.fxEcho, 0.002);
        break;
      }
      case 'gateNear': case 'gateNearSlide': {   // a gate coming up (k = pan -1..1): a soft wet "bloop-bloop" on the next 8th,
        // root then a minor third, in key; a sliding gate sings it a fourth higher. Low priority: the first thing the cap drops
        if (this._busy(0, 4)) break;
        const pan = Math.max(-1, Math.min(1, numArg(k, 'pan'))), q = this._grid(now, 2), sp = 60 / this._bpm / 4;
        const dest = this._panned(pan * 0.7, fx), r = fold(440 * st(K), 660) * (name === 'gateNearSlide' ? st(5) : 1);
        [r, r * st(3)].forEach((f, j) => {
          const qj = q + j * sp;
          this.tone('sine', f * 0.6, f, qj, 0.08, 0.1, dest, 0.004, 0.035, 0);
          this.tone('sine', f * 0.6, f, qj, 0.06, 0.035, this.fxEcho, 0.004, 0.035, 0);   // the wet half
        });
        break;
      }
      case 'land':              // a heavy landing: low kick and a short cymbal
        this.B(t, 0.8, fx); this.tone('sine', 90, 40, t, 0.12, 0.3, fx, 0.002);
        this.hum(t, 0.12, 0.14, 'highpass', 6000, 0.7, fx);
        break;
    }
  }
  // a Big Mac takes two bites: "nom nom", then "mmm"
  _chomp(t, fx) {
    for (const d of [0, 0.14]) {
      this.hum(t + d, 0.07, 0.5, 'lowpass', 900, 3, fx);
      this.tone('square', 95, 50, t + d, 0.08, 0.16, fx, 0.002);
      this.say(t + d, [130], 'oh', 'oo', 0.12, 0.16, 0.08, 0.8);
    }
    this.say(t + 0.3, [120, 180], 'oo', 'oo', 0.3, 0.1, 0.1, 0.9);   // "mmm"
  }
  // one trick link's timbre at time q and pitch f (see 'trick'): close a bell, gate a pluck, dodge a slide, pop or
  // bump a square, anything else (pass, unknown) the pass blip
  _kindVoice(q, f, kind, fx) {
    if (kind === 'close') { this.tone('sine', f, 0, q, 0.14, 0.11, fx, 0.002); this.tone('sine', f * 2, 0, q, 0.2, 0.04, fx, 0.002); this.tone('sine', f * 3.01, 0, q, 0.1, 0.02, this.fxEcho, 0.002); }
    else if (kind === 'gate') this._pluck(q, f / 2, 0.14, fx);
    else if (kind === 'dodge') this.tone('sine', f * 0.9, f, q, 0.12, 0.09, fx, 0.01, 0.05);
    else if (kind === 'pop' || kind === 'bump') { const p = kind === 'pop' ? f : f / 2; this.tone('square', p, p * 0.5, q, 0.04, 0.05, fx, 0.001); this.hum(q, 0.012, 0.12, 'bandpass', 2200, 2, fx); }
    else this.tone('triangle', f * 0.97, f, q, 0.07, 0.15, fx, 0.003, 0.02);
  }
  // new personal best (the true NEW RECORD only): da-da-DAA plus a crash (the whole sting slides so the DAA lands on the grid)
  _record(now, t, K, fx) {
    const m = st(K), tg = this._snapAt(t + 0.2); t = tg - 0.2;
    this._brass(t, 523 * m, 0.08, 0.11); this._brass(t + 0.1, 523 * m, 0.08, 0.11);
    [523, 659, 784].forEach((f) => this._brass(t + 0.2, f * m, 0.36, 0.08));
    this._gridKick(tg, 0.9, fx); this.crash(tg, 0.8, fx, 0.4);
  }
  // a daily medal (k = tier 1 bronze, 2 silver, 3 gold): a brass fanfare, one more note per tier
  _medal(t, k, K, fx) {
    const tier = Math.max(1, Math.min(3, numArg(k, 'tier') | 0)), m = st(K), sp = 0.11;
    const notes = [392, 523, 659, 784].slice(0, tier + 1);
    notes.forEach((f, j) => { const last = j === notes.length - 1; this._brass(t + j * sp, fold(f * m, 1000), last ? 0.42 + 0.08 * tier : 0.09, last ? 0.12 : 0.1); });
    const lt = t + (notes.length - 1) * sp;
    this.B(lt, 0.7 + 0.1 * tier, fx);
    if (tier >= 2) this.crash(lt, 0.4 + 0.2 * tier, fx, 0.5);
    if (tier >= 3) [0, 4, 7, 12].forEach((s, j) => this.tone('triangle', fold(1047 * m, 1400) * st(s), 0, lt + 0.08 + j * 0.05, 0.16, 0.05, this.fxEcho));
  }
  // a record or medal while the win/lose stinger still rings: one bright 3-note brass answer, the fanfare's final chord
  // (C E G of the finishing key) an octave up, starting on that chord (or right away once it has sounded)
  _outAnswer(t, K) {
    let m = st(K); while (1568 * m > 2400) m /= 2;   // the whole chord folds together, so the answer always climbs
    const a = Math.max(t, this._outAt + 0.05);
    [1047, 1319, 1568].forEach((f, j) => this._brass(a + j * 0.09, f * m, j === 2 ? 0.45 : 0.08, 0.07));
  }
  // coins climbing the pentatonic: grade 0 one coin, grade 4 twelve over 0.8 s, grades 3 and 4 end in a bell.
  // from/to pick a slice of the cascade (comboBank plays coin 0 alone, the fallback plays the rest, starting now);
  // the closing echo and the bell come with the slice that holds the last coin
  _coins(t, g, K, fx, from = 0, to = 99) {
    const n = [1, 3, 5, 8, 12][g], span = [0, 0.14, 0.3, 0.5, 0.8][g];
    to = Math.min(n, to); if (from >= to) return;
    const at0 = n > 1 ? span * Math.pow(from / (n - 1), 0.85) : 0;
    for (let j = from; j < to; j++) {
      const at = t + (n > 1 ? span * Math.pow(j / (n - 1), 0.85) : 0) - at0, last = j === n - 1;
      this._coin(at, j, K, last, fx);
    }
    if (to === n) this._coinEnd(t + span - at0, n, g, K, fx);
  }
  _coinBase(K) { let b = 988 * st(K) / 2; while (b > 700) b /= 2; return b; }
  _coin(t, j, K, last, fx = this.fx) { this.tone('square', fold(this._coinBase(K) * st(pen(j)), 2400), 0, t, last ? 0.2 : 0.05, 0.08, fx, 0.002); }
  // the closing echo sine one step over the top coin, and for grade 3+ the bell (inharmonic partials, long tail)
  _coinEnd(t, n, g, K, fx = this.fx) {
    this.tone('sine', fold(this._coinBase(K) * st(pen(n + 1)) * 2, 2600), 0, t + 0.06, 0.25, 0.04, this.fxEcho);
    if (g >= 3) {
      const bt = t + 0.05, f = fold(1568 * st(K), 2000);
      [1, 2.76, 5.4].forEach((r, j) => this.tone('sine', f * r, 0, bt, 0.9 / (1 + j), (g === 4 ? 0.12 : 0.08) / (1 + j * 1.5), fx, 0.001));
      this.tone('sine', f, 0, bt + 0.02, 0.6, 0.04, this.fxEcho, 0.001);
    }
  }
  // the next step on the beat grid that is a multiple of `div` sixteenths (2: 8ths, 4: quarters)
  _grid(now, div) {
    const fb = now + 0.005;
    if (!this.on || !this.ctx || this.ctx.state !== 'running' || !this.next) return fb;
    const spb = 60 / this._bpm / 4;
    if (!gridOk(this.next, now, spb)) return fb;
    const j = Math.floor((this.next - now) / spb), idx = this.stepI - j;
    return Math.max(fb, this.next - j * spb + (((div - (idx % div)) % div + div) % div) * spb);
  }
  clang(t, v, f) {             // inharmonic metal partials: a shield taking the hit
    [1, 2.76, 5.4, 8.93].forEach((m, j) => this.tone(j % 2 ? 'square' : 'sine', f * m, 0, t, 0.6 / (1 + j * 0.6), 0.14 * v / (1 + j * 0.5), this.fx, 0.001));
    this.hum(t, 0.02, 0.4 * v, 'highpass', 3000, 0.7, this.fx);
    this.tone('sine', f * 2.76, 0, t + 0.01, 0.4, 0.04 * v, this.fxEcho);
  }
  // "lub-dub": a low thump, plus triangles about 2x up (lub 280 -> 160 Hz, dub 340 -> 220 Hz, both at 0.3x, a bit
  // over the 0.25x / 0.2x minimum the phone mix needs) and a 12 ms knock at 1100 Hz, the band a phone speaker can
  // actually play (the sub alone vanishes on a phone)
  // Calm mode: the two sub thumps (70 and 85 Hz, everything under 80 Hz) play 6 dB softer, a low shelf without a node.
  heart(t, v, dest = this.fx) {
    this._lub(t, v, dest);
    this.tone('sine', 85, 45, t + 0.14, 0.12, 0.45 * v * (this.calm ? 0.5 : 1), dest, 0.005);
    this.tone('sine', 170, 110, t + 0.14, 0.05, 0.28 * v, dest, 0.003);
    this.tone('triangle', 340, 220, t + 0.14, 0.05, 0.3 * v, dest, 0.003);
    this._knock(t + 0.14, 1100, 0.012, 0.15 * v, dest);
  }
  // the "lub" alone (the tension bed's soft pickup on the 8th before a beat). The 70 Hz sine is at 0.45v: at 0.6v it
  // was the hottest peak in the mix
  _lub(t, v, dest = this.fx) {
    this.tone('sine', 70, 40, t, 0.14, 0.45 * v * (this.calm ? 0.5 : 1), dest, 0.005);
    this.tone('sine', 140, 90, t, 0.06, 0.35 * v, dest, 0.003);
    this.tone('triangle', 280, 160, t, 0.06, 0.3 * v, dest, 0.003);
    this._knock(t, 1100, 0.012, 0.15 * v, dest);
  }
  // a short bandpassed noise knock (Q 2): the click that tells a phone speaker "something heavy landed"
  _knock(t, f, dur, vol, dest = this.fx) { this.hum(t, dur, vol, 'bandpass', f, 2, dest, 0, 0.001); }
  // the phone-audible half of a low thud (sine f0 -> f1 at vol): a triangle an octave up at 0.4x and a 900 Hz knock
  _thudUp(t, f0, f1, dur, vol, dest = this.fx) {
    this.tone('triangle', f0 * 2, f1 * 2, t, dur, 0.4 * vol, dest, 0.002);
    this._knock(t, 900, 0.01, 0.2, dest);
  }
  _resetSong() {
    this._bpm = ZONE_BPM[0]; this._bpmNext = null; this.key = 0; this._lift = 0; this._mlift = 0; this._ftier = 0; this.heat = 0;
    this._zone = 0; this._cTier = 0; this._rollAt = -1; this._rollLen = 4; this._fin = 0;
    this._keyNext = null; this._keyCrash = false; this._whoopBar = -1;
    this._tlift = 0; this._tliftPend = false; this._tliftEnd = -1;
    this._gaspUntil = -1; this._duelK = null; this._bankPend = -1;
    // the stinger's echoes keep the old tempo until it has rung out, then switch with the waiting-room groove
    this._syncDelay(this.ctx && this._holdUntil > this.ctx.currentTime ? this._holdUntil : undefined); this._applyTrem(); this._applyInt(); this._killLoops();
  }
}
