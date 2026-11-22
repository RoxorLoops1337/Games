// Million To One: every sound is synthesised in code (no audio files).
// The music is a beatbox crew in a box: B kick, Pf and K snares, t and ts hats, the
// inward K, a hummed bass, "ooh" choir pads made by pushing sawtooth waves through vowel
// (formant) filters, "wah" stabs, a whistled lead and vocal chops when things get wild, and a
// fill every 8 bars. Tempo and key climb zone by zone, and every zone has its own flavour (pad
// vowel, chord progression, one signature sound: see ZONE_FLAVOR); the arrangement grows with
// intensity 0..2 (0.3 is the waiting-room groove for menus; 1.4 is the late-race L=2 groove; the
// whistle lead and wah stabs are saved for FRENZY) and with the player's live combo (A.combo).
//
// Mix (tuned for phone speakers): the music bus gets a +1.5 dB lift at 250 Hz, +5 dB of presence at 3 kHz (Q 0.8), a
// gentle -2 dB top shelf and its own glue compressor, and only then the intensity gain (L0 0.85, L1 1, L2 1.12, FRENZY
// 1.2: the race gets louder as it heats up; after the compressor, so the arc is really heard), times RACE_TRIM whenever
// the race groove plays (not the waiting room): 0.95 / 0.85 / 0.78 for L0 / L1 / L2 and 0.78 in FRENZY (L0 0.81, L1
// 0.85, L2 0.87, FRENZY 0.94 in all: the L1 race groove's RMS near -17 dBFS), and the rewards still sit on top of the
// hot groove (a FRENZY link dips the whistle and the 3 kHz presence peak: _leadDip, _presDip). Sound effects go through a
// soft bus compressor whose automatic makeup gain (about +6 dB) is trimmed back by a 0.75 gain, so the combo blips cut
// through the groove on a phone while stacked hits still leave the limiter some headroom, and the big stingers (frenzy,
// egg, win, finisher, trick, trickStreak, mixed 1.25x hotter) still stand out (comboBreak is a failure: under a link); both meet in a master gain (1.12: the L1
// groove peaks near -4.7 dB with an RMS near -18 (the glue MC, a 14 dB crest, so a phone at a sane volume never gets blasted
// by a stinger), only the stingers and FRENZY touch the -2 dB limiter) and a brickwall-ish limiter with a soft clipper. The success
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
// setMono(true) centres every pan (one earbud) and lifts the cilia 'tell' about 3 dB. setGentle(true) adds calm mode, a soft
// master compressor and 4 dB off the stingers and impacts (60 ms attacks). story(1 | 2) plays the theme on a 72 bpm music box
// over a ducked groove (see story).
//
// Harmony: the zone progressions' E major chords hold G#, so while one sounds every pentatonic G (the ladder, the whistle,
// thirds, the in-key sfx) moves up to G# (_chordFix); the ladder still climbs inside every run (_ladderCheck).
//
// Muffle budget: the slow-mo lowpass (slp) sits under 5 kHz for at most about 4% of a race. A small slow only rounds the
// top off (5 kHz), a big one (the first FRENZY, the egg drill) closes to 1400 Hz, an impact() dips to 4 kHz, and once the
// filter has been under 5 kHz in the last 4 s (_shutAt) a small slow or an impact only ducks the volume. Every release
// snaps back with a 12 ms time constant; an impact() holds until main.js calls impactRelease(), which plays the "snap".
//
// Slow-mo bends the sound effects too: while a slow runs every sfx is built at 0.85x speed (0.72x in a big slow),
// easing back over 0.15 s when it ends. Unpitched sources (noise, the kit, sweeps like bonk, swat, whoosh) bend all
// the way down; a pitched tone() note starts at f * rate and glides home to f within 60 ms, so it still lands in
// key over a music bus that never bends. UI sounds and the TONAL set (the combo ladder, rival motifs, coins) never bend.
//
// Key changes (a new zone, a FRENZY or combo milestone lift, the lift dropping again) never land
// mid-bar: _rekey() only stores the new key in _keyNext and tick() applies it on the next downbeat,
// so the pads sung in the old key finish in tune. A new tempo waits for the same downbeat (_bpmNext), and the
// echoes switch delay time right there behind a 1/16 input dip (never a glide, which would chirp every tail).
// The lifts also get a rising "whoop" on step 12 of the bar before. The combo ladder climbs in scale degrees
// (see ladderDegree), never off the scale, and picks its octave once per run of 10 (never folds mid-run).
// The whistled lead has its own bus (leadBus): over the theme's first 4 bars a combo note dips it for 90 ms and
// the link's tail drops an octave, so the hook and the ladder sit in separate registers.

import { bankGrade, TRICK_STREAK_T, comboMilestoneAt } from './core.js';

const VOW = {
  oo: [300, 870, 2240], oh: [570, 840, 2410], ah: [730, 1090, 2440],
  eh: [530, 1840, 2480], ee: [270, 2290, 3010], uh: [520, 1190, 2390],
  ay: [390, 2300, 2800],             // the closing half of "hey": eh glides up into it
};
const FG = [1, 0.5, 0.16];          // formant gains (F1, F2, F3)
const FBW = [90, 110, 150];         // formant bandwidths in Hz
const ZONE_BPM = [96, 104, 110, 116, 120, 128, 136];
const ZONE_KEY = [0, 1, 2, 3, 4, 5, 7];   // semitone lift per zone, every zone climbs (small steps: the lifts stack on top)
const KEY_TOP = 12;                        // keyTarget never goes past this (zone key plus every lift): one octave of climb
// the climb's registers, anchored once per run (no per-note wrap, so a key that rises is heard rising, see _climbCheck):
// the bass root is 110 * st(chord root) folded into BROOT_LO..BROOT_HI at key 0 and then transposed with the key; the pads are
// voice-led (each voice to the octave nearest the same voice of the previous chord) inside PAD_LO..PAD_MID while the key
// holds; a rise of up to 5 semitones voice-leads in the old key and lifts the whole voicing, so it lands in PAD_LO..PAD_HI
const BROOT_LO = 73, BROOT_HI = 196, PAD_LO = 196, PAD_HI = 523.25, PAD_MID = 392;
const PROG = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]]; // Am F C G (relative to the key root A)
// one flavour per zone, indexed like zoneOf(bpm): the choir's vowel, its own chord progression (Am F C G, PROG, is the launch
// tube's alone, and the egg's MAJ_PROG win room: acid Am Em F G, goo Am Dm Am E, the sea Am F Dm E, the fork Dm Am F G, the
// rapids Am G F G, the egg Am F G E),
// and a signature sound (see _signature): launch rim ostinato, acid bubbles, goo toms, womb-sea waves,
// fork half-time intro, rapids pad tremolo, egg heartbeat kick
// Each zone also has its own groove at L1 and L2 (L0 and the menus keep the shared one): kick, an optional snare
// pattern (default the backbeat on steps 4 and 12), a ts shaker on the off-8ths (ts8) and its own swing (see ZONE_SWING).
// Fills and the combo stem ladder stay shared, so the zones differ in feel, never in how the rewards sound
const ZONE_FLAVOR = [
  { vowel: 'oo', sig: 'rim' },
  { vowel: 'oh', sig: 'bubble', prog: [[0, 3, 7], [7, 10, 14], [-4, 0, 3], [-2, 2, 5]], kick: 'x..x..x...x..x..' },   // Am Em F G (Em: E G B, G natural)
  { vowel: 'ee', sig: 'goo', prog: [[0, 3, 7], [5, 8, 12], [0, 3, 7], [7, 11, 14]], kick: 'x.....x.x.......', snare: '........x.......' },   // Am Dm Am E
  { vowel: 'uh', sig: 'wave', prog: [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-5, -1, 2]], kick: 'x.......x..x....' }, // Am F Dm E (Dm: D F A, never F#)
  { vowel: 'ah', sig: 'fork', half: 2, prog: [[5, 8, 12], [0, 3, 7], [-4, 0, 3], [-2, 2, 5]], kick: 'x..x...x..x...x.' },   // Dm Am F G
  { vowel: 'oo', sig: 'trem', prog: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-2, 2, 5]], kick: 'x...x...x...x...', ts8: true },   // Am G F G
  { vowel: 'oh', sig: 'heart', prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], kick: 'xx......xx......' },  // Am F G E
];
for (const z of ZONE_FLAVOR) { if (z.kick) z.kickP = [...z.kick].map((ch) => ch === 'x'); if (z.snare) z.snareP = [...z.snare].map((ch) => ch === 'x'); }
// the off-16th swing per zone at L1 (times 0.35 at L2, the tight late-race groove); L0 and the menus keep 0.15
const ZONE_SWING = [0.15, 0.12, 0.18, 0.24, 0.10, 0.06, 0.12], SWING_L2 = 0.35;
const MENU_HOOK = [[4, 3, 2, 0, null, 2, 3, 5], [4, 3, 2, 0, null, null, 0, null]];   // pentatonic degrees on 8ths
// the "Million To One" theme: a 4-bar hook in pentatonic degrees (PENTA index) on 16ths, call and answer.
// Bars 1 and 3 are the call ("one in a mil-lion"), bar 2 answers up in the air on the 5th, bar 4 walks
// home and resolves to degree 0. It is rationed so it stays special: the menu whistles it every 4th 8-bar phrase, the race
// whistles it over the first 4 bars of the launch, the sea and the egg only (the other zones open with the answer bar
// alone), later phrases play seeded variations of it, the win fanfare quotes bar 1
// in brass and the lose sting starts it on a kazoo and gives up on the 4th note.
const _ = null;
const THEME_ZONES = [0, 3, 6];      // the zones whose first 4 bars whistle the whole theme (launch, sea, egg); see _step
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
// ten links the run starts one scale degree higher (at most 5, and at most 7 from link 65 on), so it keeps climbing
// and never leaves the key. _runBase picks each run's octave from the run's top note, so it stays under 1760 Hz
export const ladderDegree = (n) => { n = Math.max(0, n | 0); return n % 10 + Math.min(n >= 65 ? 7 : 5, Math.floor(n / 10)); };
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
const BOOST = new Set(['frenzy', 'egg', 'win', 'finisher', 'trick', 'trickStreak']);   // the biggest moments, mixed 1.25x hotter (and a blast of 5+)
// comboBreak's level: a failure, so its peak sits more than 5 dB under a link's (measureMix: breakOverLinkDb); the moment
// itself comes from the band dropping out around it (the duck, the dry beat, the 900 Hz dip), not from being loud
const BRK_V = 0.2, BRK_RUN = 0.45;   // the scratch, and the falling run (a 0.1 triangle against the link tail's 0.42)
// the stingers calm mode holds 4 dB down (the shield hit plays as 'hit'): how long each one keeps the sfx bus capped, in s
const STING = { frenzy: 0.7, second: 1.5, win: 4, lose: 3.5, hit: 0.7, shieldHit: 0.7, buzzer: 0.8, perk: 0.6 };
const CALM_STING = Math.pow(10, -4 / 20);
// the lose sting's rationing (see _loseSting): deaths 1..LOSE_FULL of a session (reset when the title's waiting room plays)
// keep the full sting, later ones the short one (the groove back after LOSE_SHORT s); every LOSE_EVERY-th death and a close
// loss (rematchMusic(true), or sfx('lose', { k, close: true })) still get the full one
const LOSE_FULL = 3, LOSE_EVERY = 5, LOSE_SHORT = 1.2;
// A.birth: the membrane pop on the white flash, the music box's theme call (a 1.2 s bar on 75 ms 16ths, so the first birth's
// kazoo answers it at BIRTH_ANS), the baby's "goo-ga" over the name reveal; the stage stays held until BIRTH_HOLD s (first: +1)
const BIRTH_POP = 0.6, BIRTH_BOX = 1.2, BIRTH_GOO = 1.6, BIRTH_ANS = 2.4, BIRTH_SQ = 0.075, BIRTH_HOLD = 2.8;
// the win's door slam ('doorShut' inside 'win'): this long after the win (render's seal ring sweeps 0.3..1.05 s)
const DOOR_AT = 0.3;
// the card draft (setMuffle(true, 'draft')): its lowpass (Hz) and time constant, the "oo" choir's level and length
const DRAFT_LP = 2200, DRAFT_TC = 0.08, DRAFT_OO = 0.05, DRAFT_OO_LEN = 1.5;
// the opening (A.openingCue): the lounge lick's tempo, and the count-in: 4 beats of the launch tube's tempo, the first OPEN_LEAD
// s after the call, so the race groove's first downbeat lands OPENING_COUNT_S s after openingCue(2)
const OPEN_BPM = 80, OPEN_LEAD = 0.06;
export const OPENING_COUNT_S = OPEN_LEAD + 4 * 60 / ZONE_BPM[0];
// tailFlick: at most one per FLICK_GAP s, snapped to the next 16th when that is FLICK_SNAP s away or less, FLICK_V its level
const FLICK_GAP = 0.11, FLICK_SNAP = 0.03, FLICK_V = 0.17;
// stinger arbitration (see sfx): a BOOST or STING stinger (or a zone arrival, or a blast of 5+) under STING_WIN s after
// another loses its kick, crash and duck layers, sings in the first one's key and lands on the next 8th, unless it
// outranks the first (SPRI, the rest 0). finisher, egg and trickStreak keep their own timing (main.js syncs visuals to them)
const STING_WIN = 0.4;
const SPRI = { egg: 6, win: 5, finisher: 4, frenzy: 3, zone: 2, trick: 1 };
const STING_KEEP_T = new Set(['finisher', 'egg', 'trickStreak']);
// gentle sound (setGentle): calm mode, a master compressor in front of the destination (GENTLE_COMP, its makeup gain taken
// back by GENTLE_TRIM like CALM_TRIM), and the stingers and impacts below built 4 dB down with a 60 ms minimum attack
const GENTLE_COMP = { threshold: -20, knee: 10, ratio: 6, attack: 0.003, release: 0.25 };
const GENTLE_TRIM = Math.pow(10, -0.6 * (-GENTLE_COMP.threshold * (1 - 1 / GENTLE_COMP.ratio)) / 20);
const GENTLE_DB = Math.pow(10, -4 / 20), GENTLE_A = 0.06;
const IMPACTS = new Set(['hit', 'bonk', 'bump', 'pop', 'blast', 'wall', 'rivalShove', 'drillShove', 'dash', 'dashPop', 'spareBite',
  'swatBonk', 'boop', 'gooIn', 'rivalSplat', 'comboBreak', 'second', 'lose', 'buzzer', 'perk', 'comboMilestone', 'boss', 'eggClaim', 'medal', 'record']);
// afford's level: its three voices at their peaks (the 0.12 triangle, its 0.03 square edge and its 0.03 sixteenth echo)
// add up to 0.18; _cue4Facts records the real build against it
export const CUE_VOL = { afford: 0.18 };
// afford: a second call within AFFORD_WIN s steps a whole tone up (at most AFFORD_TOP steps)
const AFFORD_WIN = 0.6, AFFORD_TOP = 4;
// the waiting room's trim (asked for: 4 to 6 dB down, to sit near the race). measureMix, before it: the title groove's RMS
// 3.3 dB under the L1 race groove and 2.5 under L0 (the same in the 300..6000 Hz phone band), so this is the gentle end of
// the ask; see MIX_MEASURED.menuOverRaceDb for where it lands. -2.9 (was -4) since the race trim rose 1.1 dB (RACE_TRIM
// 0.75 -> 0.85 at L1): the menus keep their place about 7 dB under the race
const MENU_TRIM_DB = -2.9, MENU_TRIM = Math.pow(10, MENU_TRIM_DB / 20);
// story cues (A.story): a 72 bpm half-time music box (and a kazoo in the finale) playing the theme on its own bus, the
// groove ducked STORY_DUCK under it while a story stage runs
const STORY_BPM = 72, STORY_V = 0.55, STORY_DUCK = Math.pow(10, -9 / 20);
const CALM_SEND = 0.7;              // calm mode: the stingers' own send (1.25 normally) is capped here
const CALM_SLP = 6000;              // calm mode: the slow-mo / dip lowpass never closes below this
// calm mode's gentle master compressor (in the chain only while calm): -18 dB, ratio 3, and a trim that takes back
// the automatic makeup gain Web Audio adds (0.6 x the full-range gain reduction, here 12 dB, so 7.2 dB)
const CALM_COMP = { threshold: -18, knee: 6, ratio: 3, attack: 0.005, release: 0.2 };
const CALM_TRIM = Math.pow(10, -0.6 * (-CALM_COMP.threshold * (1 - 1 / CALM_COMP.ratio)) / 20);
// the sfx bus trim after its compressor (see unlock). 0.75 (was 0.7) since the louder glue (MC): a link(5)'s 100 ms RMS
// measured 4.3 dB under the L1 groove's median 100 ms RMS at 0.7, 3.7 dB at 0.75 (the header's "within about 4 dB")
const FX_TRIM = 0.75;
// the music's glue compressor and its makeup trim. Phone loudness: the L1 groove used to peak at -4.9 dBFS with an RMS of
// -22 (a 17 dB crest), so players turned the phone up and the stingers then blasted them. A lower threshold, a firmer
// ratio and a fast attack bring the groove's RMS up toward -18 under the same -2 dB limiter ceiling
const MC = { threshold: -22, knee: 6, ratio: 4, attack: 0.003, release: 0.15 }, MC_TRIM = 1.1;
// lite (stage 2): the glue compressor's stand-in gain (the L1 groove's RMS about 1.5 dB under the compressed one; its
// peaks meet the limiter instead), and the music lowpasses count as idle at LP_OPEN Hz or above, LP_HOLD s after their
// last move (see _liteRoute)
const MC_BYPASS = 1.6, LP_OPEN = 17900, LP_HOLD = 1.5;
const KICK_BODY = 0.6;              // the kick body's level into its tanh shaper (see B(); the shaper adds the harmonics)
// the music's loudness per arrangement level (L0, L1, L2) and in FRENZY: a gain in front of the glue compressor
// FRENZY 1.2 (was 1.3) on the raised race trim below: the busy FRENZY groove still peaks at or under -1 dBFS and the combo
// ladder sits on top of it (MIX_MEASURED.frenzyLinkOverMedianDb)
export const INT_GAIN = [0.85, 1, 1.12], FRENZY_GAIN = 1.2;
// the music bus's 3 kHz presence peak (dB), and how far a FRENZY link at combo 10+ dips it for 70 ms (see _presDip)
const PRES_DB = 5, PRES_DIP = 2.5;
// the ladder lane's gain (see fxLad): a link(5)'s 50 ms max about 1 dB over what it measured through the sfx compressor
// (at 1.05 it matched, but the uncompressed tail decays faster, so a bonk's energy came out over a link's)
const LAD_K = 1.2;
// the dash's lift over its last measured build: +2.5 dB in, about +1.5 out of the sfx compressor (dash50Db -16.6 -> -14.8..-15.7)
const DASH_UP = Math.pow(10, 2.5 / 20);
// a link's pitched tail on top of _tailVol: times 1 + LINK_BODY * (n - 12) / 18 up to link 30 (held from there), never over
// LINK_TOP, and it rings LINK_RING s longer by link 30 (0.11 -> 0.145 s): the peak meets the limiter, so the extra weight has to
// come from the length. A lone link 30 then stands about 3 dB over the FRENZY groove's median (it measured 0.5 dB)
const LINK_BODY = 0.3, LINK_TOP = 0.8, LINK_RING = 0.035;
// the race groove's trim (anything but the waiting room), indexed like INT_GAIN (L0, L1, L2); FRENZY uses the last one.
// 0.95 / 0.85 / 0.78 (was 0.85 / 0.75 / 0.7): the L1 race groove's RMS near -17 dBFS on a phone (it sat near -18), and the
// waiting room's trim (MENU_TRIM_DB) rises with it so the menus still sit about 7 dB under the race (menuOverRaceDb)
export const RACE_TRIM = [0.95, 0.85, 0.78];
const MENU_TLP = { title: 7000, shop: 4500, result: 3200 };   // the waiting room's lowpass per menu (main.js sets A.menuKind)
// after a win the result screen opens up: its lowpass glides 3200 -> WIN_TLP over WIN_OPEN s from the fanfare's last chord
// (_outAt), and its groove plays the relative major (MAJ_PROG: C G Am F, the chords 'second' and 'synergy' already sing)
const WIN_TLP = 9000, WIN_OPEN = 0.8;
const MAJ_PROG = [[3, 7, 10], [-2, 2, 5], [0, 3, 7], [-4, 0, 3]];
// the iOS audio session: 'playback' (the default: iPhones hear the game's music) takes over; 'ambient' (the player opted
// in to "Play over my music") mixes with the player's own music and mutes ours
const SESSIONS = ['ambient', 'playback'];
// the persistent water loops' own noise: LOOP_NOISE s of independent left and right noise (the 1 s mono noiseBuf
// stays for one-shots), each loop starting at a random offset up to LOOP_OFS s in, so no two loops line up
const LOOP_NOISE = 4, LOOP_OFS = 3;
// the combo timer's alarm (comboLow): at most this many semitones up; a lowE heartbeat within CL_HEART s takes the low end
const CL_TOP = 7, CL_HEART = 0.1;
// one vocal identity per milestone: a 'combo' shout within MS_SOLO s after a comboMilestone stays quiet, a milestone within
// MS_SOLO s after a shout chokes it, and rung 100's every-5th "yeah" chop sits out within MS_SOLO s of a milestone
const MS_SOLO = 0.4;
// the dodge and pop links' "aww": at most one per AWW_GAP s, none from link AWW_MAX on; one within AWW_RUN s of the last
// sings 2 pentatonic degrees lower (down to AWW_DEEP steps), so a run of them deflates instead of looping
const AWW_GAP = 0.3, AWW_MAX = 20, AWW_RUN = 1, AWW_DEEP = 2;
// 'medley' ({ n, mk }): its run climbs one extra semitone per medley number mk, and the drop lands that many semitones up
// (at most MK_TOP; keyTarget still never passes KEY_TOP)
const MK_TOP = 5;
// the story (setStoryStage): from generation MHUM_GEN a Big Macro near Kevin hums the theme's call through an "mm"
// (a lowpass at MHUM_F Hz, Q MHUM_Q, level MHUM_V), at most once per MHUM_GAP s, 1.4x the tempo when hunting, 0.6x dozing
const MHUM_GEN = 31, MHUM_F = 400, MHUM_Q = 5, MHUM_V = 0.08, MHUM_GAP = 6;
// the fruit streak: a sugar within SUG_WIN s of the last one sings a pentatonic degree higher, at most SUG_TOP; from
// SUG_SPARK up a soft octave sparkle joins on the echo
const SUG_WIN = 0.9, SUG_TOP = 7, SUG_SPARK = 5;
const TITLE_OPEN = 1.5;             // the title opens 3200 -> 7000 Hz over this long after unlock()
const SHUT_F = 5000, SHUT_HOLD = 4; // the muffle budget: under SHUT_F is "closed"; after a closure, SHUT_HOLD s of volume-only dips
const SLOW_SMALL_F = 5000, SLOW_BIG_F = 1400, IMPACT_F = 4000, REL_TC = 0.012;
// hit-stop sync: impact() only gasps; main.js's hitRelease calls impactRelease(ms) when the world moves again, and the
// release snap and the REL_TC recovery start there. If no release ever comes, a safety recovery runs IMP_SAFE s after the hold
const IMP_SAFE = 0.25, REL_LEAD = 0.003;
// impactRelease(ms, kind): which hitHold kinds release as a hurt, a payoff or metal (any other kind: the plain snap)
const REL_HURT = new Set(['bonk', 'bump', 'player', 'death', 'shove']);
const REL_PAY = new Set(['frenzy', 'milestone', 'bank', 'finisher', 'trick', 'kevin', 'pass']);
const REL_METAL = new Set(['shield', 'wing']);
// the beat lock only nudges (no hard snaps) for this long after a slow-mo or a hit-stop ends (see _lockStep)
export const LOCK_HOLD = 2.5;
// calm mode: duck() never goes under this (the slow-mo lowpass floor is CALM_SLP)
const CALM_DUCK = 0.8;
// trick streak layers (see _streakLayers): held this long after the last trickStreak, then a TS_STOP s tape stop
const TS_HOLD = +TRICK_STREAK_T > 0 ? +TRICK_STREAK_T : 10, TS_STOP = 0.18;
// the swim bed (A.speed 0..1): a bandpassed noise loop, 350 -> 1600 Hz and 0.015 -> 0.05 with speed, time constant 0.08 s
const SWIM_F = [350, 1600], SWIM_G = [0.015, 0.05], SWIM_TC = 0.08;
// the steering voice (A.steer): silent under STEER_MIN, STEER_G (-24 dB) at full speed, attack and release in s
const STEER_MIN = 0.26, STEER_G = Math.pow(10, -24 / 20), STEER_A = 0.04, STEER_R = 0.16;
// steerLevel(vx): silent under STEER_VX[0] px/s, full from STEER_VX[1], with a 120 ms release
const STEER_VX = [150, 700], STEER_R2 = 0.12;
// hype(): the pass rate that starts and tops the hat lift; the gold sting's edgeGold threshold and its gap in s
const HYPE_PR = [2, 8], GOLD_EDGE = 0.1, GOLD_GAP = 4;
// the Lunger's crouch, LUNGE_CROUCH in core.js: 'pounce' winds up for this long by default
const POUNCE_DUR = 0.45;
// rival voices for 'babble' and 'rivalOuch' (RIVALS index): base pitch, the two vowels it alternates, syllable length,
// and a level trim so the five come out about equally loud (a low voice puts less into the formant filters)
const BABBLE = [
  { f: 330, v: ['eh', 'ee'], len: [0.07, 0.09], g: 1 },       // Steve: bouncy
  { f: 110, v: ['uh', 'oh'], len: [0.12, 0.12], g: 1.5 },     // Brock: slow and heavy
  { f: 520, v: ['ee', 'ay'], len: [0.07, 0.09], g: 1.3 },     // Tiffany: bright, rising at the end
  { f: 185, v: ['ah', 'oo'], len: [0.09, 0.11], g: 1.1 },     // Gunther: a 6 Hz vibrato
  { f: 150, v: ['oh', 'ah'], len: [0.09, 0.11], g: 1.5 },     // Chad: doubled a fifth up, holds the last syllable
];
// the hummed bass's mids: a -9 dB cut at 650 Hz (Q 0.9, about 370..1150 Hz) after its shaper, and the octave-up saw at
// 0.2x (was 0.35x), so the L1 groove's 2..5 kHz presence band sits 8.5 dB under its 400 Hz..2 kHz mids (was 14.8 dB; L2
// 10.6, was 17; see measureMix). The fundamentals and the resonant "hum" (lowpass Q 5) are untouched
const BASS_MID_F = 650, BASS_MID_CUT = -9, BASS_MID_Q = 0.9, BASS_HI = 0.2, BASS_Q = 5;
// what measureMix() gave in headless Chromium for this mix (L1 race groove, 8 s; three runs, the hats are random), re-run
// after the harmony fix, the stinger arbitration and the menu trim: presence 10.6..11 dB under the mids (it read 8.5..9.1
// when this table was last written: the mix has moved on since), a comboBreak (n 12) peaking 6.9..7.6 dB under a link (5.7..6
// dB on the 50 ms RMS), dashReady 13.5 dB under the groove's RMS (10.5 before), and the title groove's RMS 7.1 dB under the
// L1 race groove and 6.3 under L0 with the -4 dB MENU_TRIM (3.3 and 2.5 dB under without it; the 300..6000 Hz phone band
// agrees within 0.6 dB). mixFacts() returns these
// Re-run after the key climb fix and the phone-speaker bonk (three runs): presence 10.6..11.1 dB under the mids, comboBreak
// 6.9 dB under a link, dashReady 13.5..13.6, the menus unchanged; the bonk peaks 3.2..3.5 dB under a link (old bonk 3.6..4.7)
// with its 300..6000 Hz phone-band energy 1.3..1.7 dB under a link's (old 4.5..4.8: 3 dB more of it now reaches a phone).
// BONK_HUM stays 0.34: at 0.28 the peak measured no lower (1.9..3.1 dB under; the noise peaks are random)
// Re-run after the FRENZY mix pass (FRENZY_GAIN 1.2, RACE_TRIM 0.95 / 0.85 / 0.78, MENU_TRIM_DB -2.9, the ladder lane
// fxLad, _tailVol to link 60, _leadDip and _presDip in FRENZY) and the dash punch (three runs): the L1 race groove's RMS
// -17.2 dBFS (was -18.3), the menus 7.1 dB under it (unchanged); in the busy FRENZY render (L2 groove, tier 1, a link 30
// every 0.75 s) the 150 ms after each link reaches 3.2..3.7 dB over the FRENZY groove's median 50 ms RMS (a lone link 30
// measures 0.5 over it, a lone link 5 1.7 under: it sat 2.8 under), the busy and burst (12 links in 1 s) peaks -1.2 dBFS;
// link 60's 50 ms max 4.5..4.6 dB over link 5's (was 1.8) and 4 dB over the groove's RMS; dash's 50 ms max -16..-17.1 dBFS
// (was -20.6) and its peak 2..4 dB under a link's; the steering swish at full tilt 18.7 dB under the groove's RMS; hype(8)'s
// hat lift +2.3..+2.7 dB in 5..12 kHz; the gold sting's peak 10..11 dB under a link's; comboBreak 7.4..7.9 under a link,
// bonk 2.8..4.9 under (its 50 ms RMS 0.2..1.1 under, its phone band -0.9..+0.3)
// Re-run after round 8 (two runs): dash50Db -14.8..-15.7 (DASH_UP) with its peak 2.6..4.1 dB under a link's; a lone link 30
// 3.5 dB over the FRENZY median (LINK_BODY, LINK_RING; was 0.5), link 60 5.7 over link 5, the busy FRENZY links 4.1..4.3 over
// the median, the peaks still -1.2 dBFS; tailFlick's 50 ms max 18.4 dB under the L1 groove's RMS; frenzyEnd's peak 13.6 dB under
// the frenzy stinger's; a 'lose' cut by 'again' 1.5 s in leaves the 190..202 and 227..240 Hz bands after 1.6 s within 0.1 dB of
// the 'again' alone (the trombone's 196 / 233 Hz: 22 dB down with the sting uncut)
export const MIX_MEASURED = { presUnderMidsDb: 10.5, breakOverLinkDb: -7.7, breakOverLinkRmsDb: -6.8, dashReadyUnderMusicDb: 14.6, menuOverRaceDb: -7.1, menuOverL0Db: -6.2,
  bonkOverLinkDb: -4.1, bonkPhoneOverLinkDb: -0.2, grooveRmsDb: -17.2, frenzyBusyPeakDb: -1.2, frenzyBurstPeakDb: -1.2, busyLinkOverFrenzyDb: 4.2,
  link30OverFrenzyDb: 3.5, link60OverLink5Db: 5.7, link60OverMusicRmsDb: 5.2, dash50Db: -15.2, dashUnderLinkPeakDb: 3.3, steerUnderMusicDb: 18.7,
  hypeHatLiftDb: 2.5, goldUnderLinkPeakDb: 10.2, tailFlickUnderMusicDb: 18.4, frenzyEndUnderFrenzyDb: 13.6, loseCutLeakDb: 0.1 };
// the stem ladder's rungs: crossing each rolls a 1-beat snare fill into a crash (see _step). 45: off-beat claps and a pad
// sidechain; 65: the bass doubles up an octave on the off-16ths through a filter opening over the bar; 100: an ad-lib chop
// every 2 bars and +1.5 dB on the whole mix
export const RUNGS = [10, 20, 30, 45, 65, 100];
export const rungOf = (n) => { let r = 0; while (r < RUNGS.length && n >= RUNGS[r]) r++; return r; };
const BOOST100 = Math.pow(10, 1.5 / 20);
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
const UI_SFX = new Set(['tap', 'buy', 'cards', 'reroll', 'countTick', 'ready', 'draftOn', 'count', 'nudge', 'afford', 'deal', 'perk', 'storyReveal', 'doorbell', 'rankTick', 'rankLand']);
// in-key sounds that never bend in slow-mo either: the combo ladder, the drill, the rival motifs, coins and fanfares
// play over a music bus that never bends, so a bent note would land out of tune with the band (and with itself)
const TONAL = new Set(['link', 'pass', 'clutch', 'drill', 'drillLead', 'drillShove', 'boss', 'dna', 'sugar', 'shield', 'style',
  'combo', 'comboBank', 'comboMilestone', 'tally', 'maxed', 'quit', 'overclock', 'medley', 'birth']);
// every sfx is built this long after the call (t = now + SFX_T)
const SFX_T = 0.005;
// the finisher's reversed cymbal swells this long (FIN_SW + FIN_SW_G * grade) before its mic-drop thud: finisherLead()
const FIN_SW = 0.2, FIN_SW_G = 0.05;
const gradeOf = (k) => Math.max(0, Math.min(4, numArg(k, 'grade') | 0));
// seconds from sfx('finisher', g) to its mic-drop thud. main.js schedules the visual payoff (shake, flash, BANKED pop)
// at this lead, and 'finisher' itself uses the same constants, so the two cannot drift
export const finisherLead = (g) => SFX_T + FIN_SW + FIN_SW_G * gradeOf(g);
// the comboMilestone index for a link count n (40 -> 0, 60 -> 1, 80 -> 2, 100 -> 3, 150 -> 4, 200 -> 5, 300 -> 6...)
export const milestoneIndex = (n) => { n = +n || 0; let m = 0; while (m < 200 && comboMilestoneAt(m) < n) m++; return m; };
// the waiting room's tempo for the furthest zone of the last run (see menuZone)
export const menuBpm = (z) => Math.max(96, ZONE_BPM[Math.max(0, Math.min(ZONE_BPM.length - 1, z | 0))] - 10);
// the waiting room's pad vowels rotate through these on every 4th 8-bar phrase (the breakdown with no bass)
const MENU_VOWELS = ['oo', 'oh', 'ah', 'uh', 'ee'];
// 'swerve': at most one per this long
const SWERVE_GAP = 0.16;
// sfx() names that never play on menus: 'babble' and 'rivalOuch' are race-only (so they bend in slow-mo, not in UI_SFX)
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
  close: 0.05, thread: 0.08, blast: 0.1, lockon: 1.2, edge: 0.12, dashPop: 0.08, milestone: 0.3, event: 0.5, lowE: 0.25,
  comboBank: 0.2, comboBreak: 0.15, record: 0.5, legendary: 0.5, synergy: 0.3, eggClaim: 0.5, bossTaunt: 0.5, drillShove: 0.05,
  clutch: 0.12, finisher: 0.3, style: 0.2, loseClose: 0.5, drillLead: 0.15, rivalShove: 0.08, again: 0.2, ready: 0.15,
  synTease: 0.3, swat: 0.06, swatBonk: 0.12, tell: 0.25, comboLow: 0.02, comboMilestone: 0.4, gateNear: 0.3, gateNearSlide: 0.3,
  fork: 0.5, backflow: 0.5, finale: 0.5, spot: 0.5,
  dnaTick: 0.03, rivalTell: 0.3, countered: 0.2, factory: 0.6, countTick: 0.04, medal: 0.4,
  go: 0.3, resume: 0.3, lesson: 0.15, wall: 0.12, trick: 0.3, domino: 0.1, whoosh: 0.15,
  trickStreak: 0.3, overtaken: 0.5, gift: 0.1, bounty: 0.3,
  trickTease: 0.3, trickMiss: 0.3, draftOn: 0.06, slingReady: 0.25, goal: 0.4, pastBest: 0.4, grudge: 0.4,
  pounce: 0.15, babble: 0.35, rivalOuch: 0.3, dashReady: 0.3, count: 0.1, nudge: 0.3,
  swerve: SWERVE_GAP, gooIn: 0.1, boop: 0.06, acidIn: 0.15, maxed: 0.3, tally: 0.02, quit: 0.5,
  afford: 0.05, overclock: 0.1, medley: 0.2, buzzer: 0.5, perk: 0.3, deal: 0.3, storyReveal: 0.25, doorbell: 2,
  dripTell: 0.3, dripDrop: 0.06, streakEnd: 0.1, rivalSplat: 0.1,
  rankTick: 0.03, rankLand: 0.3, tailFlick: FLICK_GAP, birth: 1,
};
// sfx that get a little random detune (+-15 cents) and volume (+-12%) so repeats never sound like a machine gun
const HUMAN = new Set(['sugar', 'dna', 'pop', 'bump', 'boop', 'bonk', 'dash', 'dashPop', 'dripDrop', 'rivalSplat']);
const PENTA12 = [0, 3, 5, 7, 10, 12];
const TR_SOFT = [0.14, 0.12], TR_HARD = [0.2, 0.18];   // _transient's two noise ticks: default, and the link / pass
// the prebaked kit voices (see _kit): the same filter, Q, attack and length the live hum() used for each
const KIT = {
  hat: { type: 'highpass', f: 7000, q: 0.7, a: 0.001, dur: 0.03 },
  ts: { type: 'highpass', f: 6000, q: 0.8, a: 0.004, dur: 0.13 },
  rim: { type: 'bandpass', f: 3800, q: 5, a: 0.001, dur: 0.02 },
};
// the nearest A minor pentatonic note (any octave) to a frequency, transposed into key `key`
const inKey = (f, key) => {
  const s = 12 * Math.log2(f / 440) - key, o = Math.floor(s / 12), r = s - 12 * o;
  let b = 0; for (const d of PENTA12) if (Math.abs(r - d) < Math.abs(r - b)) b = d;
  return 440 * st(key + 12 * o + b);
};
const of4 = (list, type) => list.filter((o) => o.type === type);   // the recorded oscillators of one type (_cue4Facts)
const rivalIdx = (k) => { const v = k && typeof k === 'object' ? k.k : k; return typeof v === 'number' && v >= 0 && v <= 4 ? v | 0 : -1; };
// freeze a param where it is at time t (mid-ramp included) before new automation
const hold = (p, t) => { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t); };
const fold = (f, top = 1760) => { while (f > top) f /= 2; return f; };
// the theme's octave, picked once for the whole line (never per note, which broke the hook apart): the base under which
// the line's highest note (hi semitones over the key root, PENTA[7] = 17 for THEME) lands in (top / 2, top]. Play every
// note as themeBase(key) * st(PENTA[d]): the melody keeps its shape in every key
export const themeBase = (key, top = 1500, hi = 17) => { let b = 880 * st(key); while (b * st(hi) > top) b /= 2; while (b * st(hi) < top / 2) b *= 2; return b; };
// the race's lines (the whistled theme, the phrase variations, the B-section pluck) pick their octave once, at key 0, and then
// only transpose: themeBase folded at every key, so a lift of 2 from key 4 fell 10 semitones. The theme's base is A4 (440 Hz)
// at key 0 and climbs with the key (A5 at key 12): its top note (degree 7, 17 semitones) runs 1175 -> 2349 Hz
export const themeAnchor = (key, top = 1500, hi = 17) => themeBase(0, top, hi) * st(key);
// the bass root for a chord root c (semitones over the key root) in key `key`: folded once at key 0, then transposed
export const bassRoot = (key, c) => { let f = 110 * st(c); while (f > BROOT_HI) f /= 2; while (f < BROOT_LO) f *= 2; return f * st(key); };
// pad voice leading: chord (semitones over the key root) in `key`, each voice to the octave nearest ref[j] (the previous
// chord's same voice, already transposed by any lift) inside lo..hi; with no ref, the octave nearest 290 Hz
export const padVoices = (chord, key, ref, hi = PAD_MID, lo = PAD_LO) => chord.map((c, j) => {
  let f = 220 * st(key + c); while (f > hi * 1.0001) f /= 2; while (f < lo * 0.9999) f *= 2;
  const r = ref && ref[j] > 0 ? ref[j] : 290; let best = f;
  for (let g = f; g <= hi * 1.0001; g *= 2) if (Math.abs(Math.log(g / r)) < Math.abs(Math.log(best / r))) best = g;
  return best;
});
// the highest PENTA semitone a degree line reaches (nulls skipped), for themeBase's hi
const lineHi = (line) => { let m = 0; for (const d of line) if (d !== null && PENTA[d] > m) m = PENTA[d]; return m; };
const HOOK_HI = Math.max(...MENU_HOOK.map(lineHi));
// the win fanfare quotes the call in brass with its top note (degree 7) at or under this
const WIN_TOP = 1100;
// the win's heartbeat (see _winHeart): this long after the win, at this tempo, its first thump's level, the fanfare under it
const WIN_HEART_AT = 1.6, WIN_HEART_BPM = 72, WIN_HEART_V = 0.32, WIN_HEART_DUCK = Math.pow(10, -4 / 20);
// Kevin's own voice (see _kevin): base pitch, his two vowels, and his level, about 3 dB under the rival babble's 0.09
const KEVIN = { f: 300, v: ['ee', 'ah'], g: 0.09 * Math.pow(10, -3 / 20) };
const KEV_GAP = 0.35;               // one Kevin line per this long, shared by every kind but the giggle (see _hehe)
// Kevin's big-moment lines (see _kevin): [from vowel, to vowel, start Hz, end Hz, length s, vibrato Hz, vibrato cents]
const KEV_LINES = {
  nooo: ['oh', 'oo', 360, 200, 0.6, 5, 40],   // a 25+ chain breaking, inside the dry bar it books
  yay: ['ah', 'ee', 300, 520, 0.35, 6, 30],   // a grade 3+ bank, and the win (after the brass call)
  huh: ['uh', 'ah', 260, 340, 0.18, 0, 0],    // the lose, before the kazoo
  wooo: ['oo', 'ah', 260, 700, 0.55, 6, 30],  // the run's first FRENZY (lower and longer than the 'wheee')
  sigh: ['ah', 'oo', 300, 220, 0.3, 0, 0],    // FRENZY is over (frenzyEnd), at the 'huh' level
};
const KEV_BIG = new Set(Object.keys(KEV_LINES)), KEV_BIG_G = Math.pow(10, 3 / 20);
// the giggle: the HEHE_N-th pass within HEHE_WIN s, then HEHE_CD s of cooldown; after HEHE_FREE giggles a run, one per zone
const HEHE_N = 6, HEHE_WIN = 1.5, HEHE_CD = 6, HEHE_FREE = 3;
const KEV_WOB = 1200 * Math.log2(340 / 300);   // the dazed "uhh": +-40 Hz around 300 Hz, in cents (about 217)
const POP_WIN = 0.7;
// linkLift: at most LL_MAX semitones, the lifted note never over LL_TOP Hz, gliding up in LL_UP s and down in LL_DOWN s
const LL_MAX = 12, LL_TOP = 2640, LL_UP = 0.08, LL_DOWN = 0.3;
// the bonk's resonant "squelch" level (was 0.34): measureMix's bonkOverLinkDb keeps the bonk's peak under a link's
const BONK_HUM = 0.34;
const PASS_ROLL = 0.022;            // 'pass': a coalesced overtake's grace notes, this far apart (25 ms each)                // 'pop' with no chain number: pops this close together count as a chain
// FRENZY's riser: 6 saw blips up the A minor pentatonic from degree tier - 1 (one degree higher per tier), in key `key`.
// It folds by whole octaves under 4 kHz, so no tier and no key ever leaves the scale (mixFacts checks it)
export const riserFreqs = (tier, key) => { const x = Math.max(0, (tier | 0) - 1), out = []; for (let j = 0; j < 6; j++) out.push(fold(440 * st(key + pen(x + j)), 4000)); return out; };
// true when frequency f is a note of the A minor pentatonic transposed into `key` (within 2 cents)
const inPenta = (f, key) => { const s = 12 * Math.log2(f / 440) - key, r = ((s % 12) + 12) % 12; return PENTA12.some((d) => Math.abs(r - d) < 0.02 || Math.abs(r - d - 12) < 0.02 || Math.abs(r - d + 12) < 0.02); };

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
    this._themePend = true; this._themeAt = -99; this._varN = 0; this._themeOn = false; this._hookBar = 0;   // the theme's first bar, variation counter
    this.calm = false;                         // calm mode (reduced motion): no gasps, shallow ducks, slow filter moves
    this._thr = null; this._thrK = 0; this._thrPan = 0; this._slurpT = 0;   // proximity threat loop
    this._acid = null; this._acidL = 0; this._crackT = 0; this._acidLow = false;   // acid sizzle loop, GAS under 30% (see acidLow)
    this._steer = null; this._steerL = 0; this._steerS = 0; this._steerP = 0;     // the steering voice (see steer)
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
    this._shutAt = -99; this._impFUntil = -1; this._slowOpen = false; this._unlockAt = -99; this._menuKind = undefined;   // muffle budget: slp last under 5 kHz until; unlock time; which menu
    this._mixUp = false; this.padSc = null; this.bassHi = null; this.bassUp = null;   // rung 100's +1.5 dB, the pad sidechain, the bass octave filters
    this._impPend = false; this._impShut = false; this._lkHoldPre = -1; this._shutPre = -99;   // a hit-stop waiting for impactRelease()
    this._speed = 0; this._swim = null; this._swimL = 0; this._swimF = 0; this._swimZero = -1; this._muffled = false;   // the swim bed
    this._tsLvl = 0; this._tsUntil = -1; this._tsStopAt = -1; this.tsBus = null; this.tsLp = null; this.tsBassLp = null;   // trick streak layers
    this._menuZ = 0; this._menuV = 0;          // the waiting room's zone (the furthest zone of the last run), its vowel rotation
    this._snapLead = 0;                        // how far after its call the last grid-snapped comboBank / comboMilestone lands (s)
    this._session = 'playback';                // the iOS audio session type (see setSessionType): the full game by default
    this._wonAt = -1; this._winGlide = -1;     // when the last outro was a win (-1: a loss, or a new title / race since), the glide it started
    this._kevT = -9; this._kevPass = 0;        // Kevin's voice: when he last spoke, passes since his last "hehe" check
    this._lastPassN = -1; this._eggHit = -1; this._eggLead = 0; this._elift = 0;   // the last pass count, the egg's downbeat, its lead, its key lift
    this._sugN = 0; this._sugT = -9;           // fruit streak: pentatonic steps up (0..SUG_TOP), the last sugar's time
    this.loopBuf = null;                       // the 4 s stereo noise of the persistent loops (see _build)
    this._stingAt = -9; this._stingK = 0; this._stingP = -1; this._demo = false;   // stinger arbitration: the last one's time, key, rank; a demoted build
    this.gentle = false; this._calmReq = false; this._gComp = null; this._gTrim = null; this._gIn = false;   // gentle sound (setGentle)
    this._affN = 0; this._affT = -9;           // afford: whole steps up within AFFORD_WIN s
    this._story = 0; this._sNext = 0; this._sStep = 0; this.storyBus = null;   // story cues: stage, the music box's next 8th and step
    this._padV = null; this._padK = 0; this._rankLead = 0;         // the pads' last voicing (Hz per voice) and the key it was sung in (see _padChord)
    this._olV = 0; this._olAt = -9;            // output latency (see outLat): the last reading and when it was taken
    this._pT = []; this._heheT = -99; this._heheN = 0; this._heheZ = -1; this._heheG = null; this._heheEnd = -1;   // Kevin's giggle (see _hehe)
    this._llTo = 0; this._llFrom = 0; this._llAt = -9; this._llTier = 0;   // linkLift: target semitones, where the glide started, when, FRENZY tier
    this._msAt = -9; this._shoutG = null; this._shoutAt = -9;   // the last comboMilestone, the last combo shout's output gain and when (MS_SOLO)
    this._awwT = -9; this._awwV = 0; this._awwN = 0;            // the dodge / pop "aww": last one, which vowel pair is next, steps deflated
    this._gapFrom = -1; this._gapTo = -1; this._dropOn = false; this._dlift = 0; this._dropT = -1; this._dropBar = -1;   // the medley drop (see _medleyDrop)
    this._storyGen = 0; this._act4 = false; this._mhumT = -99;  // setStoryStage: the story stage, act 4 seen, the last Macro hum
    this._presT = -9;                          // the last FRENZY link's presence dip (one per 16th, see _presDip)
    this._kevFrz = false; this._winBox = null; // Kevin's first-FRENZY "wooo" this run; the win heartbeat's music-box gate (see 'win')
    this._hypeX = 0; this._hypeG = 1; this._hypeGNow = 1; this._goldHi = false; this._goldT = -99;   // hype(): pass-rate lift, hat bus gain, the gold sting's edge
    this._loseBox = null; this._loseBag = []; this._loseArgs = null; this._deaths = 0; this._loseFull = true;   // the lose sting's gate, ending bag, last build, deaths this session
    this._draft = false; this._draftBar = -1; this._pickOpen = -1; this._hatIn = null; this._hatSkip = null;   // the card draft muffle (setMuffle(true, 'draft'))
    this._openBox = null; this._openAt = -1; this._frzTier = 1;   // the opening's lick gate, its count-in downbeat; the last FRENZY tier
    this._dec = () => { this.live--; };
    this._dec3 = () => { this.live -= 3; };   // a say() voice counts as 3 sources (its formant filters cost too)
  }

  // ------------------------------------------------------------------ public knobs
  // the link ladder escalates with power: main.js calls linkLift(p.tier, overclock stacks) whenever either changes (and
  // linkLift(0, 0) on 'frenzyEnd'). +2 semitones per FRENZY tier and +1 per overclock stack (12 at most) ride on top of
  // _scaleF for the link's pitched tail and its every-4th chord note, snapped up onto the key's pentatonic (never off the
  // scale, never under the plain note) and held under LL_TOP Hz. The lift glides in over 80 ms and back down over 300 ms
  // (a link reads where the glide is at its grid time). From tier 4 the tail gets a sub-octave sine at f/2 (0.03)
  linkLift(tier, oc) {
    const ti = Math.max(0, Math.min(9, +tier | 0)), o = Math.max(0, Math.min(9, +oc | 0)), to = Math.min(LL_MAX, 2 * ti + o);
    const now = this.ctx ? this.ctx.currentTime : 0;
    this._llTier = ti;
    if (to === this._llTo) return;
    this._llFrom = this._llAt > -9 ? this._llNow(now) : 0; this._llAt = now; this._llTo = to;
  }
  get linkLiftNow() { return this._llNow(this.ctx ? this.ctx.currentTime : 0); }
  // the link lift in semitones at time q (the 80 ms up / 300 ms down glide)
  _llNow(q) {
    const d = this._llTo - this._llFrom; if (!d) return this._llTo;
    const x = (q - this._llAt) / (d > 0 ? LL_UP : LL_DOWN);
    return x >= 1 ? this._llTo : this._llFrom + d * Math.max(0, x);
  }
  // a ladder note f (in key K) lifted by the link lift at time q: the lowest pentatonic note at or over f * st(S - 0.5)
  // (G# under an E chord, like every tonal note), never under f, never over LL_TOP (unless f already is)
  _llF(f, K, q) {
    let S = this._llNow(q); if (!(S > 0.01) || !(f > 0)) return f;
    S = Math.min(S, 12 * Math.log2(Math.max(f, LL_TOP) / f));
    const s0 = 12 * Math.log2(f / 440) - K + S - 0.5, o = Math.floor(s0 / 12);
    let best = f;
    for (let oo = o; oo <= o + 1 && best === f; oo++) for (const p of PENTA12) {
      const semi = 12 * oo + p; if (semi < s0) continue;
      let g = 440 * st(K + semi); if (this._fixRel(semi)) g *= st(1);
      if (g > f * 1.0001 && g <= Math.max(f, LL_TOP) * 1.0001) { best = g; break; }
    }
    return best;
  }
  // the waiting room remembers the run: main.js calls menuZone(race.zoneReached) from showResult, and the menu groove
  // then plays in that zone's key, at its tempo minus 10 (never under 96), with its vowel and its signature at half
  // volume. 0 (the launch tube) until it is ever set. It lands on the menu's next downbeat
  menuZone(z) { this._menuZ = Math.max(0, Math.min(ZONE_BPM.length - 1, +z | 0)); this._applyTrem(); }
  // story cues. story(stage): 0 off, 1 a chapter, 2 the finale. While a stage runs a soft 72 bpm half-time take of the theme
  // plays on its own bus (storyBus, the music's volume: a music box, one theme 16th per 8th; the finale adds a kazoo two
  // octaves down and a held "boots-and-cats" heartbeat), and the groove underneath ducks STORY_DUCK (9 dB). A new stage
  // from 0 starts the melody from its first note; 1 -> 2 carries on. Safe before unlock()
  story(stage) {
    const s = Math.max(0, Math.min(2, +stage | 0)); if (s === this._story) return;
    const was = this._story; this._story = s;
    if (this.ctx && s > 0 && was === 0) { this._sNext = this.ctx.currentTime + 0.08; this._sStep = 0; }
    this._applyInt();
  }
  get storyStage() { return this._story; }
  // a story reveal line: a 3-note rising stinger (sfx 'storyReveal'); Kevin at the egg from generation 20 on: 'doorbell'
  storyReveal() { this.sfx('storyReveal'); }
  doorbell() { this.sfx('doorbell'); }
  // the birth beat (main.js calls it right next to R.birth in goResult; first: the run's very first baby): a membrane pop on
  // the white flash (0.6 s) with a reversed cymbal swelling into it, the theme's call on the story music box (1.2 s, with the
  // name reveal), the baby's "goo-ga" (1.6 s), and on the first birth a kazoo answering the call (2.4 s) and a small crowd
  // "awww". Never bent by slow-mo (TONAL). It keeps the stage held (the win's _holdUntil) until BIRTH_HOLD s (+1 on the first)
  birth(o) { this.sfx('birth', o && typeof o === 'object' ? o : { first: !!o }); }
  // the opening story's own cues (swim 1's INTRO only; main.js calls it from intro()'s next() instead of the 'tap' blips):
  //   0 "Somewhere, a candlelit dinner...": the waiting room groove stops and a lounge Rhodes lick plays (OPEN_BPM, 2 bars of 2/4)
  //   1 "Dead last.": a record scratch stops the lick dead, then one sad trombone "wah"
  //   2 "Pass them ALL": a 4-beat beatbox count-in at the launch tube's tempo; the race groove's first downbeat lands
  //     OPENING_COUNT_S s after this call (openingGoIn() says how long is left), and the groove's bars are phased to it. A
  //     'go' that comes earlier (ui did not sync its countdown) cuts the count-in and lands the downbeat on its own beat instead.
  // Safe before unlock() (it does nothing then). Returns true when it played
  openingCue(step) {
    const c = this.ctx; if (!c) return false;
    const n = Math.max(0, Math.min(2, +step | 0)), now = c.currentTime, t = now + SFX_T;
    const quiet = this.muted || this.sfxMuted || c.state !== 'running';
    if (n === 0) this._holdUntil = Math.max(this._holdUntil, now + 8);   // the band stops for the story (newRun ends the hold)
    this._openCut(now);
    if (n === 2) this._openCount(now);
    if (quiet) return false;
    const fx = this.fx, g = this._gain(1, fx), srcs = [];
    this._openBox = { g, until: now + (n === 0 ? 3.4 : n === 1 ? 1.6 : OPENING_COUNT_S + 0.1), srcs };
    this.fx = g;
    try {
      if (n === 0) this._lounge(t, g, srcs);
      else if (n === 1) {   // the needle drags back and forth, then "wah" (A, sagging a semitone, with a vibrato)
        this._scratch(t, 1500, 320, 0.09, 0.24, g); this._scratch(t + 0.09, 320, 1200, 0.07, 0.2, g); this._scratch(t + 0.16, 1000, 110, 0.2, 0.22, g);
        this.tone('sine', 120, 40, t + 0.16, 0.16, 0.25, g, 0.003);   // the platter thumps to a stop
        const m = st(this.key), tw = t + 0.5;
        this._brass(tw, 220 * m, 0.8, 0.13, true, true, 207.65 * m, 0.8);
        this.tone('sine', 110 * m, 0, tw, 0.75, 0.1, g, 0.05);
      } else {
        const beat = 60 / ZONE_BPM[0], sp = beat / 4, b0 = now + OPEN_LEAD, D = this._openAt, K = ZONE_KEY[0];
        const goF = fold(440 * st(K + PENTA[5]), 900);
        for (let j = 0; j < 4; j++) {
          const bj = b0 + j * beat;
          if (j & 1) this.Pf(bj, 0.6 + 0.12 * j, g); else this.B(bj, 0.7 + 0.1 * j, g);
          this.ts(bj + 2 * sp, 0.5 + 0.1 * j, g);
          if (j < 3) this._brass(bj, goF * st(PENTA[2 * j] - 12), 0.18, 0.07);   // degrees 0, 2, 4: the count climbs into GO's note
        }
        const b3 = b0 + 3 * beat;
        this.Pf(b3 + 2 * sp, 0.7, g); this.Kin(b3 + 3 * sp, 0.8, g);   // the pickup into the downbeat
        this._revCym(b3, D, 0.2, g);
      }
    } finally { this.fx = fx; }
    return true;
  }
  get OPENING_COUNT_S() { return OPENING_COUNT_S; }
  // seconds until the opening count-in's downbeat is heard (0 when none is pending)
  openingGoIn() { const c = this.ctx; if (!c || !(this._openAt > c.currentTime)) return 0; return this._openAt - c.currentTime + this.outLat; }
  // shut the opening cue's gate (and stop its booked notes: the lick is 2 bars long and a tap moves the story on sooner)
  _openCut(now) {
    const b = this._openBox; this._openBox = null;
    if (!b || now >= b.until) return null;
    hold(b.g.gain, now); b.g.gain.setTargetAtTime(0, now, 0.012);
    for (const o of b.srcs) { try { o.stop(now + 0.06); } catch (e) { /* already stopped */ } }
    return b;
  }
  // the count-in's downbeat: OPENING_COUNT_S s from now, at the launch tube's tempo; the groove waits for it (_holdUntil) and
  // its bars are phased so that step is a bar's first 16th (newRun keeps both while it is pending)
  _openCount(now) {
    const D = now + OPENING_COUNT_S;
    this._openAt = D;
    if (this._bpm !== ZONE_BPM[0] || this._bpmNext !== null) { this._bpm = ZONE_BPM[0]; this._bpmNext = null; this._syncDelay(); }
    this._openPhase(D, false);
  }
  // phase the step clock so the step at time D (or, rewind: the clock restarts at D, which the held groove allows) opens a bar,
  // and hold the groove until D: returns that bar, or -1 when the clock cannot reach D
  _openPhase(D, rewind) {
    const c = this.ctx; if (!c) return -1;
    const now = c.currentTime, spb = 60 / this._bpm / 4;
    if (this.next < now - 0.25 || this.next > now + 1.5 || !this.next) this.next = now + 0.06;   // what tick() would do
    let j;
    if (rewind && D >= now) { this.next = D; j = 0; }
    else { j = Math.floor((D - this.next) / spb + 1e-9); if (j < 0) return -1; this.next = D - j * spb; }
    const idx = this.stepI + j; this.stepI += (16 - (idx & 15)) & 15;
    const bar = (this.stepI + j) >> 4;
    this._holdUntil = D - 0.01; this.barBase = bar; this.crashBar = bar; this.fillBar = -1; this._zoneBar = bar;
    return bar;
  }
  // the lounge lick (openingCue(0)): Rhodes chords (Am9 then Fmaj7, A minor all the way), a little melody on top, a soft bass
  // and brushes on 2 and 4, two bars of 2/4 at OPEN_BPM, every source listed in srcs so the scratch can stop it early
  _lounge(t, dest, srcs) {
    const b = 60 / OPEN_BPM, e = b / 2, m = st(this.key);
    const bars = [
      { ch: [220, 330, 392, 494], bass: 110, mel: [[1, 659], [1.5, 784], [2.5, 880], [3, 784], [3.5, 659]] },
      { ch: [175, 262, 330, 440], bass: 87.31, mel: [[1, 587], [1.5, 523], [2, 440]] },
    ];
    bars.forEach((B, bi) => {
      const tb = t + bi * 2 * b;
      B.ch.forEach((f, j) => this._rhodes(tb + j * 0.012, f * m, 2 * b, 0.05, dest, srcs));
      this._rhodes(tb, B.bass * m / 2, 2 * b * 0.9, 0.07, dest, srcs, 0.3);
      for (const [at, f] of B.mel) this._rhodes(tb + at * e, f * m, at === B.mel[B.mel.length - 1][0] ? 1.2 : e * 1.1, 0.06, dest, srcs);
      for (const at of [1, 3]) this.hum(tb + at * e, 0.12, 0.05, 'highpass', 5000, 0.7, dest, 0, 0.02, 0);   // the brushes
    });
  }
  // one electric piano note: a sine carrier with a sine modulator at the same frequency whose depth dies in 0.25 s (the tine's
  // bark), then a mellow sine decaying over dur. bark: the modulation depth (times f)
  _rhodes(t, f, dur, vol, dest, srcs, bark = 1.4) {
    if (this._busy(1, 2)) return;
    const c = this.ctx, o = c.createOscillator(), mo = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f; mo.type = 'sine'; mo.frequency.value = f;
    mg.gain.setValueAtTime(f * bark, t); mg.gain.exponentialRampToValueAtTime(Math.max(0.01, f * 0.03), t + 0.25);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, t + Math.min(0.5, dur * 0.6)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    mo.connect(mg); mg.connect(o.frequency); o.connect(g); g.connect(dest);
    this._go(o, t, t + dur + 0.03); this._go(mo, t, t + dur + 0.03);
    if (srcs) srcs.push(o, mo);
  }
  // the saga's stage, once per race (main.js): stage = the generation, act4Seen = the act 4 chapter has been read. From
  // stage MHUM_GEN a Big Macro near Kevin hums the theme (macroHum); once act 4 is seen the win fanfare gets a low "ooh"
  // Macro choir under its brass quote. Never called: neither happens (stage 0, act 4 unseen)
  setStoryStage(stage, act4Seen) { this._storyGen = Math.max(0, +stage || 0); this._act4 = !!act4Seen; }
  // a Big Macro within the spot radius (main.js, any frame; hunting: it is hunting, else dozing; pan -1..1): it hums the
  // theme's call (THEME bar 1) through an "mm", 1.4x the tempo when hunting, 0.6x when dozing, from the next beat. Only from
  // story stage MHUM_GEN, at most once per MHUM_GAP s, never on a menu or muted, one oscillator (low priority). True if it hums
  macroHum(hunting, pan = 0) {
    const c = this.ctx;
    // (main.js calls it every frame: the two cheapest checks go first, so a frame before stage MHUM_GEN or inside the gap
    // costs two compares and allocates nothing)
    if (!c || !(this._storyGen >= MHUM_GEN)) return false;
    const now = c.currentTime; if (now - this._mhumT < MHUM_GAP) return false;
    if (this.muted || this.sfxMuted || c.state !== 'running' || this._muffled || this._menu(this._int) || this._busy(0, 1)) return false;
    this._mhumT = now;
    const sq = 60 / this._bpm / 4 / (hunting ? 1.4 : 0.6), t0 = this._grid(now, 4), b = themeBase(this.key, 300);   // one octave: degree 7 under 300 Hz
    const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    const dest = this._panned(Math.max(-1, Math.min(1, +pan || 0)) * 0.7, this.fx);
    o.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = MHUM_F; lp.Q.value = MHUM_Q;
    g.gain.setValueAtTime(0.0001, t0);
    let end = t0, first = true;
    THEME_CALL.forEach((d, s) => {
      if (d === null) return;
      const ts = t0 + s * sq, len = THEME_LEN[0][s] * sq, f = b * st(PENTA[d]);
      if (first) { o.frequency.setValueAtTime(f, ts); first = false; } else o.frequency.setTargetAtTime(f, ts, 0.02);   // a lazy legato
      g.gain.setTargetAtTime(MHUM_V, ts, 0.02); g.gain.setTargetAtTime(MHUM_V * 0.35, ts + len * 0.75, 0.03);   // each note re-breathed
      end = ts + len;
    });
    g.gain.setTargetAtTime(0.0001, end, 0.06);
    o.connect(lp); lp.connect(g); g.connect(dest); this._go(o, t0, end + 0.4);
    return true;
  }
  // seconds from sfx('finisher', g) to its mic-drop thud (see the module's finisherLead)
  // (plus outLat: the instance's leads are when the hit is HEARD, the module's finisherLead when it is scheduled)
  finisherLead(g) { return finisherLead(g) + this.outLat; }
  // how far after its sfx() call the last comboBank (grade 2+) or comboMilestone hit lands on the 16th grid (0.005..0.045 s),
  // plus outLat (when it is heard)
  get lastSnapLead() { return this._snapLead + this.outLat; }
  // seconds from the last sfx('egg') call to its big hit on the downbeat (FIN_SW 0.2 s at least, at most a bar more), plus
  // outLat: main.js can land the arrival's shake and flash on it
  get eggLead() { return this._eggLead + this.outLat; }
  // seconds from the last sfx('rankLand') call to its hit on the rematch groove's beat, plus outLat (ui can stamp the rank on it)
  get rankLead() { return this._rankLead + this.outLat; }
  // the output latency in seconds (0..0.25): how long after its scheduled time a sound leaves the speaker. Bluetooth
  // headphones add 0.1..0.2 s, so it is re-read about once a second (they come and go mid-race). 0 with no context or
  // when the browser reports neither outputLatency nor baseLatency. pulse, beatPhase(), the leads above and the beat lock
  // all use it, so the eye, the ear and the sim's beat agree. Shared name: A.outLat
  get outLat() {
    const c = this.ctx; if (!c) return 0;
    const now = +c.currentTime || 0;
    if (now - this._olAt >= 1 || now < this._olAt) {
      this._olAt = now;
      let v = 0; try { v = +c.outputLatency || +c.baseLatency || 0; } catch (e) { v = 0; }
      this._olV = Number.isFinite(v) ? Math.max(0, Math.min(0.25, v)) : 0;
    }
    return this._olV;
  }
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
  get keyTarget() { return Math.min(KEY_TOP, ZONE_KEY[this._zone] + this._lift + this._mlift + this._tlift + this._elift + this._dlift); }
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
    const menu = this._menu(this._int), sig = ZONE_FLAVOR[menu ? this._menuZ : this._zone].sig;
    const d = sig === 'trem' && !this.calm ? (menu ? 0.22 : 0.45) : 0;   // calm: no 6 Hz throb; the waiting room: half as deep
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
  _intGain() { const I = this._dropOn ? Math.max(1.4, this._int) : this._int; return this._ftier > 0 ? FRENZY_GAIN : INT_GAIN[I < 0.5 ? 0 : I < 1.3 ? 1 : 2]; }
  // what the intensity gain node really plays: _intGain(), times RACE_TRIM[level] while the race groove plays (not the
  // menus; FRENZY takes the L2 trim, 0.7)
  // menus: MENU_TRIM (the waiting room sits near the race's level); any story stage ducks the whole groove STORY_DUCK
  _igainV() {
    const sd = this._story > 0 ? STORY_DUCK : 1;
    if (this._menu(this._int)) return this._intGain() * MENU_TRIM * sd;
    const I = this._dropOn ? Math.max(1.4, this._int) : this._int, li = this._ftier > 0 ? 2 : I < 0.5 ? 0 : I < 1.3 ? 1 : 2;
    return this._intGain() * RACE_TRIM[li] * sd;
  }
  // which waiting room plays: 'title' (lowpass about 7 kHz, opening up over 1.5 s after unlock), 'shop' or 'result'
  // (3200 Hz). main.js sets it before menuMusic() sets intensity 0.3; undefined means 3200 Hz
  get menuKind() { return this._menuKind; }
  set menuKind(v) { const o = this._menuKind; this._menuKind = v; if (v === 'title') { this._wonAt = -1; this._deaths = 0; } if (o !== v && this.ctx && this._menu(this._int)) this._applyTlp(); }
  // the result screen after a win (cleared by a loss, the title or a new race): brighter lowpass, relative-major groove
  _winRoom() { return this._menuKind === 'result' && this._wonAt >= 0; }
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
    const real = c.currentTime, now = real - this.outLat, spb = 60 / this._bpm / 4;   // the phase of what is heard right now
    if (this.on && this.next && this.next >= real - 0.01 && this.next <= real + spb + LOOK + 0.05) {
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
    // sim phase minus music phase, in beats, at the moment this step is HEARD (outLat after it is scheduled): the groove
    // is scheduled outLat early so the kick a player hears lands on the sim's beat
    let e = this._lkPh + (this.next + this.outLat - this._lkAt) * b / 60 - (this.stepI & 3) / 4;
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
  // 0..1: the player is in acid, and how bad it is (old callers pass 0 or 1). A bandpassed noise sizzle and a crackle
  // tick from tick(). Its level is 0.06 at a touch, rising with v to 0.08 at 1 (today's level); with A.acidLow (GAS under
  // 30%) it rises to 0.12 instead, its band glides 3000 -> 4200 Hz and the crackle ticks every 0.06 s instead of 0.12.
  // Same rules as threat(): built on first use, cheap every frame, never clicks, torn down after 1.5 s at 0.
  get acid() { return this._acidL; }
  get acidLow() { return this._acidLow; }
  set acidLow(b) {
    b = !!b; if (b === this._acidLow) return;
    this._acidLow = b;
    if (this._acid && this.ctx) { const L = this._acidL; this._acidL = -1; this.acid = L; }   // re-level and re-tune now
  }
  _acidG(v) { return v > 0 ? 0.06 + v * (this._acidLow ? 0.06 : 0.02) : 0; }
  set acid(v) {
    v = this.muted || this.sfxMuted ? 0 : clamp01(v);
    if (!this.ctx) { this._acidL = v; return; }
    const now = this.ctx.currentTime;
    if (v > 0) this._acidZero = -1; else if (this._acidZero < 0) this._acidZero = now;
    if (!this._acid) {
      if (v <= 0) return;
      const c = this.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this._loopNoise(); s.loop = true; bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 1.4; g.gain.value = 0;
      s.connect(bp); bp.connect(g); g.connect(this.fx); s.start(0, Math.random() * LOOP_OFS);
      this._acid = { g, bp, f: 3000, src: [s], nodes: [bp, g] }; this._acidL = 0;
    }
    if (Math.abs(v - this._acidL) > 0.004 || (v === 0 && this._acidL !== 0)) { this._acid.g.gain.setTargetAtTime(this._acidG(v), now, 0.02); this._acidL = v; }
    const F = this._acidLow ? 4200 : 3000;
    if (this._acid.bp && this._acid.f !== F) { this._acid.bp.frequency.setTargetAtTime(F, now, 0.15); this._acid.f = F; }
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
    s.buffer = this._loopNoise(); s.loop = true;
    bp.type = 'bandpass'; bp.frequency.value = 735; bp.Q.value = 2.4;          // about 600..900 Hz
    lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 1.2;
    const lfo = c.createOscillator(), ld = c.createGain(); lfo.frequency.value = 0.3; ld.gain.value = 400;   // 1100 +- 400 Hz
    lfo.connect(ld); ld.connect(lp.frequency); lfo.start();
    g.gain.value = 0; s.connect(bp); bp.connect(lp); lp.connect(g);
    let p = null;
    if (c.createStereoPanner) { p = c.createStereoPanner(); p.pan.value = this._panV(this._curPan * 0.6); g.connect(p); p.connect(this.fx); } else g.connect(this.fx);
    s.start(0, Math.random() * LOOP_OFS);
    return { g, p, src: [s, lfo], nodes: p ? [bp, lp, ld, g, p] : [bp, lp, ld, g] };
  }
  // 0..1: how fast Kevin swims (main.js sets it every frame). A looped noise through a bandpass that rises 350 -> 1600 Hz
  // with speed, at 0.015 -> 0.05 (time constant 0.08 s): the water rushing past. Only in the race: silent on the menus, the
  // rematch groove, a card deal or pause (setMuffle), and with sound effects off. Built on first use only when the voice
  // cap has room for a low priority voice, torn down after 1.5 s at 0; a call per frame costs a few compares
  get speed() { return this._speed; }
  set speed(v) { this._speed = clamp01(v); if (this.ctx) this._swimApply(this.ctx.currentTime); }
  _swimOn() { return this.on && !this.muted && !this.sfxMuted && this.sfxVol > 0 && !this._muffled && !this._rematch && !this._menu(this._int); }
  _swimApply(now) {
    const s = this._speed, L = this._swimOn() ? SWIM_G[0] + (SWIM_G[1] - SWIM_G[0]) * s : 0;
    if (L > 0) this._swimZero = -1; else if (this._swimZero < 0) this._swimZero = now;
    if (!this._swim) { if (L <= 0 || this._busy(0)) return; this._swim = this._loopSwim(); this._swimL = 0; this._swimF = 0; }
    const n = this._swim;
    if (Math.abs(L - this._swimL) > 0.0005 || (L === 0 && this._swimL !== 0)) { n.g.gain.setTargetAtTime(L, now, SWIM_TC); this._swimL = L; }
    const F = SWIM_F[0] * Math.pow(SWIM_F[1] / SWIM_F[0], s);
    if (Math.abs(F - this._swimF) > this._swimF * 0.01) { n.bp.frequency.setTargetAtTime(F, now, SWIM_TC); this._swimF = F; }
  }
  _loopSwim() {
    const c = this.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this._loopNoise(); s.loop = true; bp.type = 'bandpass'; bp.frequency.value = SWIM_F[0]; bp.Q.value = 1.2; g.gain.value = 0;
    s.connect(bp); bp.connect(g); g.connect(this.fx); s.start(0, Math.random() * LOOP_OFS);
    return { g, bp, src: [s], nodes: [bp, g] };
  }
  // steer(speed01, pan): the steering voice (iPhones get no vibration buzz, so the sideways swim is heard instead). main.js
  // calls it every frame with |vx| / 460 clamped to 0..1 and the sign of vx, and steer(0, 0) on pause and the result.
  // A looped noise bed through a bandpass that rises 700 -> 1600 Hz with speed01 (Q 1.2), plus a faint beatbox "fff"
  // (a 2.6 -> 4.4 kHz band whose pitch bends on a slow wobble). Silent under STEER_MIN, up to -24 dB at 1, panned pan * 0.5,
  // a 40 ms attack and a 160 ms release, and it breathes under every groove kick (the music's sidechain, see B()).
  // Built once on first use (when the voice cap has room) and kept; a call per frame costs a few compares. Silent when
  // muted, with sound effects off, on the menus, the rematch groove and while muffled (the swim bed's rules)
  steer(speed01, pan = 0) {
    const sp = clamp01(speed01), pn = Math.max(-1, Math.min(1, +pan || 0));
    this._steerS = sp; this._steerP = pn;
    const x = sp <= STEER_MIN ? 0 : (sp - STEER_MIN) / (1 - STEER_MIN);
    this._steerSet(x, 700 * Math.pow(1600 / 700, sp), pn * 0.5, STEER_R);
  }
  // steerLevel(vx): the same steering swish driven straight by Kevin's sideways speed in px/s (main.js, every frame; it
  // replaces steer()): silent under STEER_VX[0] (150 px/s), up to -24 dB from STEER_VX[1] (700) on, the band's centre
  // rising 600 -> 1400 Hz with it (Q 1.2), a 40 ms attack and a 120 ms release, panned sign(vx) * 0.4, breathing under the
  // groove's kick like the music duck. No node is built per call (the bed is built once, on first use), and it is silent
  // while paused, muffled, on the menus or muted (the swim bed's rules). The 'swerve' one-shot still plays on top
  steerLevel(vx) {
    const v = +vx || 0, a = Math.abs(v), x = a <= STEER_VX[0] ? 0 : Math.min(1, (a - STEER_VX[0]) / (STEER_VX[1] - STEER_VX[0]));
    this._steerS = x; this._steerP = Math.sign(v);
    this._steerSet(x, 600 * Math.pow(1400 / 600, x), Math.sign(v) * 0.4, STEER_R2);
  }
  // the steering bed's level from x (0..1: STEER_G * x^1.5), its band centre F (Hz), its pan (already scaled) and release (s)
  _steerSet(x, F, pan, rel) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, L = this._swimOn() ? STEER_G * Math.pow(x, 1.5) : 0;
    if (!this._steer) { if (L <= 0 || this._busy(0)) return; this._steer = this._loopSteer(); }
    const n = this._steer;
    if (Math.abs(L - this._steerL) > 0.0004 || (L === 0 && this._steerL !== 0)) {
      n.g.gain.cancelScheduledValues(now); n.g.gain.setTargetAtTime(L, now, L > this._steerL ? STEER_A / 3 : rel / 3); this._steerL = L;
    }
    if (L <= 0) return;   // a silent bed keeps its last tone and pan: nothing to move
    if (Math.abs(F - n.f) > n.f * 0.01) { n.bp.frequency.setTargetAtTime(F, now, 0.03); n.fff.frequency.setTargetAtTime(F * 2.75, now, 0.03); n.f = F; }
    if (n.p && Math.abs(pan - n.pan) > 0.01) { n.p.pan.setTargetAtTime(this._panV(pan), now, 0.03); n.pan = pan; }
  }
  // hype(passRate, edgeGold): the carried hype layer (main.js, every frame, with the renderer's R.passRate and R.edgeGold).
  // passRate HYPE_PR[0]..HYPE_PR[1] (2..8) lifts the groove's hat bus +0..+3 dB (applied on the next 16th the scheduler
  // builds, never mid-note) and, past 30% of that, adds a soft rising "ts" shaker on the off-16ths (see _step). edgeGold
  // (0..0.15) crossing GOLD_EDGE upward plays the gold sting (_goldSting: two bright pentatonic notes in this.key on the
  // grid), at most once per GOLD_GAP s. A call costs a few compares and allocates nothing; safe before unlock()
  hype(passRate, edgeGold) {
    const x = Math.max(0, Math.min(1, ((+passRate || 0) - HYPE_PR[0]) / (HYPE_PR[1] - HYPE_PR[0])));
    this._hypeX = x; this._hypeG = Math.pow(10, Math.round(12 * x) / 4 / 20);   // 0.25 dB steps: no churn on a jittery rate
    const hi = (+edgeGold || 0) >= GOLD_EDGE;
    if (hi && !this._goldHi) this._goldSting();
    this._goldHi = hi;
  }
  _goldSting() {
    const c = this.ctx;
    if (!c || this.muted || this.sfxMuted || this.sfxVol <= 0 || c.state !== 'running' || this._muffled || this._menu(this._int)) return false;
    const now = c.currentTime; if (now - this._goldT < GOLD_GAP || this._busy(1, 3)) return false;
    this._goldT = now;
    const K = this.key, q = this._quantCap(now); let r = 880 * st(K); while (r > 1320) r /= 2;
    const f1 = r * st(this._chordFix(K + pen(3), K) - K), f2 = r * st(this._chordFix(K + pen(5), K) - K);
    this.tone('triangle', f1, 0, q, 0.07, 0.11, this.fx, 0.002, 0, 1);
    this.tone('triangle', f2, 0, q + 0.07, 0.14, 0.12, this.fx, 0.002, 0, 1);
    this.tone('sine', fold(f2 * 2, 3600), 0, q + 0.07, 0.16, 0.025, this.fxEcho, 0.002, 0, 0);   // a glint in the echo
    return true;
  }
  _loopSteer() {
    const c = this.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), fff = c.createBiquadFilter(), fg = c.createGain(), g = c.createGain(), sc = c.createGain();
    s.buffer = this._loopNoise(); s.loop = true;
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.2;
    fff.type = 'bandpass'; fff.frequency.value = 1925; fff.Q.value = 2.2; fg.gain.value = 0.35;   // the "fff", about 9 dB under the bed
    const lfo = c.createOscillator(), ld = c.createGain(); lfo.frequency.value = 2.3; ld.gain.value = 60;   // +-60 cents: the bent pitch
    lfo.connect(ld); ld.connect(fff.detune); lfo.start();
    g.gain.value = 0; sc.gain.value = 1;
    s.connect(bp); bp.connect(g); s.connect(fff); fff.connect(fg); fg.connect(g); g.connect(sc);
    let p = null;
    if (c.createStereoPanner) { p = c.createStereoPanner(); p.pan.value = 0; sc.connect(p); p.connect(this.fx); } else sc.connect(this.fx);
    s.start(0, Math.random() * LOOP_OFS);
    this._steerL = 0;
    return { g, sc, bp, fff, p, f: 700, pan: 0 };
  }
  // the noise a persistent loop plays: the wide 4 s stereo bake (the mono 1 s noiseBuf in mono output, or before the bake)
  _loopNoise() { return !this.mono && this.loopBuf ? this.loopBuf : this.noiseBuf; }
  // a loop whose level has sat at 0 for 1.5 s stops its sources and lets go of its nodes (called from the setters
  // and from tick(), since main.js sets a loop to 0 once and then stops calling)
  _reapLoops(now) {
    if (this._thr && this._thrK === 0 && this._thrZero >= 0 && now - this._thrZero >= 1.5) this._killLoop('_thr');
    if (this._cur && this._curK === 0 && this._curZero >= 0 && now - this._curZero >= 1.5) this._killLoop('_cur');
    if (this._acid && this._acidL === 0 && this._acidZero >= 0 && now - this._acidZero >= 1.5) this._killLoop('_acid');
    if (this._swim && this._swimL === 0 && this._swimZero >= 0 && now - this._swimZero >= 1.5) this._killLoop('_swim');
  }
  // tear one loop down now: a 10 ms fade, the sources stop 60 ms later and the chain is disconnected when they end
  _killLoop(key) {
    const n = this[key]; this[key] = null;
    if (key === '_thr') { this._thrK = 0; this._thrZero = -1; } else if (key === '_cur') { this._curK = 0; this._curZero = -1; }
    else if (key === '_swim') { this._swimL = 0; this._swimF = 0; this._swimZero = -1; } else { this._acidL = 0; this._acidZero = -1; }
    if (!n || !this.ctx) return;
    const now = this.ctx.currentTime, end = now + 0.06;
    hold(n.g.gain, now); n.g.gain.setTargetAtTime(0, now, 0.01);
    const off = () => { for (const x of n.src) { try { x.disconnect(); } catch (e) { /* ignore */ } } for (const x of n.nodes) { try { x.disconnect(); } catch (e) { /* ignore */ } } };
    if (n.src[0]) n.src[0].onended = off;
    for (const x of n.src) { try { x.stop(end); } catch (e) { /* ignore */ } }
  }
  // all three loops down at once (the title, a muffled card deal or pause, a new run): they rebuild on the next k > 0
  _killLoops() { if (this._thr) this._killLoop('_thr'); if (this._cur) this._killLoop('_cur'); if (this._acid) this._killLoop('_acid'); if (this._swim) this._killLoop('_swim'); }
  // the one-shot parts of the loops, scheduled from tick()
  _loops(now) {
    if (this._thr && this._thrK > 0.03 && now >= this._slurpT) {   // a wet slurp: a resonant filter gulping up and back
      const k = this._thrK, t = now + 0.01;
      this._slurpT = now + (this.calm ? 0.9 : k > 0.7 ? 0.4 : 0.6);
      this.hum(t, 0.14, 0.12 * k, 'bandpass', 280, 7, this._thr.out, 900, 0.01, 0);
      this.tone('sine', 160, 90, t + 0.04, 0.08, 0.1 * k, this._thr.out, 0.004, 0, 0);
    }
    if (this._acid && this._acidL > 0.03 && now >= this._crackT) {   // a crackle tick
      this._crackT = now + (this._acidLow ? 0.06 : 0.12); const t = now + 0.005 + Math.random() * 0.03;
      this.hum(t, 0.004, 0.06 * this._acidL + 0.02, 'bandpass', 2500 + Math.random() * 3500, 3, this.fx, 0, 0.0008, 0);
    }
  }

  // 0..1, how hard the last kick still pushes (render.js can pulse the screen on the beat)
  get pulse() {
    if (!this.ctx) return 0;
    const now = this.ctx.currentTime - this.outLat; let best = -99;   // the last kick that has been HEARD
    for (let i = 0; i < 8; i++) { const k = this._kicks[i]; if (k <= now && k > best) best = k; }
    return best < 0 ? 0 : Math.exp(-(now - best) * 9);
  }

  unlock() {
    if (this.ctx) {
      if (!this._suspended) { this._startClock(); if (this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) { /* ignore */ } } }
      return;
    }
    // iOS: the session type is set before the context exists. 'playback' (the default) is the full game, music included,
    // and it ignores the silent switch; 'ambient' (opt-in) never pauses the player's own music (our music bus stays
    // silent, the sfx play over theirs). See setSessionType
    this._applySession();
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!AC) return;
    let c; try { c = new AC(); } catch (e) { return; }
    this._build(c);
    // a phone call, Siri or an alarm suspends (iOS: 'interrupted') the context behind our back: take it back as soon as
    // it lets go, unless the app itself is hidden or suspend() asked for the quiet
    c.onstatechange = () => {
      if (this._suspended || c.state === 'running' || c.state === 'closed') return;
      if (typeof document !== 'undefined' && document.hidden) return;
      try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    };
    this._startClock();
  }
  // the whole graph on context c (unlock() on the live context; measureMix() on an OfflineAudioContext)
  _build(c) {
    this.ctx = c; this._unlockAt = c.currentTime;
    // master: gain, a 70 Hz highpass (a phone speaker cannot play below it, so that energy only eats
    // headroom and makes the limiter pump), then a soft-kneed limiter so a pile of hits never clips
    this.master = c.createGain(); this.master.gain.value = this._masterV();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70; hp.Q.value = 0.7;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.15;
    // the compressor node adds its own makeup gain, so a soft clipper after it holds true peaks under -1 dBFS
    const clip = c.createWaveShaper(), cn = 2048, cc = new Float32Array(cn), knee = 0.7, ceil = 0.88;
    for (let i = 0; i < cn; i++) {
      const x = i / (cn - 1) * 2 - 1, a = Math.abs(x);
      cc[i] = Math.sign(x) * (a <= knee ? a : knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee)));
    }
    clip.curve = cc; clip.oversample = this._stage >= 1 ? 'none' : '2x'; this.clip = clip;
    this.master.connect(hp); hp.connect(lim); lim.connect(clip); clip.connect(c.destination); this.limiter = lim; this.hp = hp;
    // calm mode's gentle master compressor and its makeup trim: built now, patched in between master and hp only while
    // calm (see _calmRoute), so the normal chain stays exactly as it is
    const cc2 = c.createDynamicsCompressor();
    for (const key of Object.keys(CALM_COMP)) cc2[key].value = CALM_COMP[key];
    const ctr = c.createGain(); ctr.gain.value = CALM_TRIM; cc2.connect(ctr);
    this._calmComp = cc2; this._calmTrim = ctr; this._calmIn = false;
    // gentle sound's compressor in front of the destination and its makeup trim (patched in by _gentleRoute)
    const gc = c.createDynamicsCompressor();
    for (const key of Object.keys(GENTLE_COMP)) gc[key].value = GENTLE_COMP[key];
    const gt = c.createGain(); gt.gain.value = GENTLE_TRIM; gc.connect(gt);
    this._gComp = gc; this._gTrim = gt; this._gIn = false;
    // the story cues' own bus (A.story): the music box, the kazoo and the finale's heartbeat, at the music's volume, straight
    // into the master (so the groove's duck under a story never touches it)
    this.storyBus = c.createGain(); this.storyBus.gain.value = this._storyLv(); this.storyBus.connect(this.master);
    // sound effects: own volume, then a soft bus compressor so stacked hits stay even. The compressor
    // adds about +6 dB of automatic makeup gain, so a 0.75 trim (FX_TRIM) after it keeps stacked hits off the limiter
    // (not less: the combo blips have to cut through the music on a phone speaker)
    this.fx = c.createGain(); this.fx.gain.value = this._fxLevel();
    const fc = c.createDynamicsCompressor();
    fc.threshold.value = -14; fc.knee.value = 6; fc.ratio.value = 4; fc.attack.value = 0.003; fc.release.value = 0.12;
    const ft = c.createGain(); ft.gain.value = FX_TRIM;
    this.fx.connect(fc); fc.connect(ft); ft.connect(this.master); this.fxComp = fc; this.fxTrim = ft;
    // the ladder's own lane (see _ladDest): a link's pitched tail skips the sfx compressor, at the sfx volume times LAD_K
    // (the compressed path's level for a link at its 0.42 start), so the climb's growth (_tailVol) is heard, not squashed
    this.fxLad = c.createGain(); this.fxLad.gain.value = this._fxLevel() * LAD_K; this.fxLad.connect(this.master);
    // music bus: gain (volume and ducking) -> micro duck -> muffle lp -> slowmo lp -> tension/menu lp
    //            -> 250 Hz lift -> 3 kHz presence -> top shelf -> glue compressor -> trim -> intensity gain -> master
    this.music = c.createGain(); this.music.gain.value = this._mLevel();
    this.mduck = c.createGain(); this.mduck.gain.value = 1;
    // the whistled lead's own gain (see _whistle, _leadDip): a combo note can make room for the theme hook
    this.leadBus = c.createGain(); this.leadBus.gain.value = 1; this.leadBus.connect(this.music);
    const lp = (f) => { const b = c.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = 0.6; return b; };
    this.mlp = lp(18000); this.slp = lp(18000); this.tlp = lp(18000);
    // a gentle +1.5 dB lift at 250 Hz (the lowest band a phone speaker really plays) and a +5 dB presence band at 3 kHz
    // (Q 0.8, about 2..5 kHz) that carries the snares, hats and the choir's consonants on a phone speaker
    const peak = c.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 250; peak.Q.value = 0.9; peak.gain.value = 1.5;
    const pres = c.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3000; pres.Q.value = 0.8; pres.gain.value = PRES_DB; this._mPres = pres;   // (_presDip)
    const shelf = c.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 9000; shelf.gain.value = -2;
    // the intensity arc: L0 0.85, L1 1, L2 1.12, FRENZY 1.3 (times RACE_TRIM in the race), after the glue compressor so
    // it is heard as a real level change, not squashed back (see _applyInt)
    this.igain = c.createGain(); this.igain.gain.value = this._igainV(); this._igTo = this.igain.gain.value;
    const mc = c.createDynamicsCompressor();
    mc.threshold.value = MC.threshold; mc.knee.value = MC.knee; mc.ratio.value = MC.ratio; mc.attack.value = MC.attack; mc.release.value = MC.release;
    this.music.connect(this.mduck); this.mduck.connect(this.mlp); this.mlp.connect(this.slp); this.slp.connect(this.tlp);
    this.tlp.connect(peak); peak.connect(pres); pres.connect(shelf); shelf.connect(mc); this.mcomp = mc;
    // the glue compressor's automatic makeup gain is about +8 dB: trim it back so the music alone stays clear of the limiter
    const mt = c.createGain(); mt.gain.value = MC_TRIM; mc.connect(mt); mt.connect(this.igain); this.igain.connect(this.master);
    // lite (stage 2): the glue compressor's bypass, a plain gain standing in for its average level (see _liteRoute)
    this._mcByG = c.createGain(); this._mcByG.gain.value = MC_BYPASS; this._mcByG.connect(this.igain);
    this._mPeak = peak; this._mShelf = shelf; this._mcBy = false; this._lpOut = false; this._lpHold = -1; this._lpChk = -1;
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
    // the hats and the ts shaker sit on their own bus (hatBus) in front of the music, so hype() can lift them +0..+3 dB
    this.hatBus = c.createGain(); this.hatBus.gain.value = 1; this._hypeGNow = 1;
    // ...and two routes out of it: the music bus (_hatIn), or straight into the slow-mo lowpass past the muffle (_hatSkip,
    // 0 unless a card draft muffles the band: see setMuffle(true, 'draft'))
    this._hatIn = this._gain(1, this.music); this._hatSkip = this._gain(0, this.slp); this.hatBus.connect(this._hatIn); this.hatBus.connect(this._hatSkip);
    const hpan = (v) => { if (!c.createStereoPanner) return this.hatBus; const p = c.createStereoPanner(); p.pan.value = this._panV(v); p.connect(this.hatBus); this._pans.push([p, v]); return p; };
    this.hatPan = [hpan(-0.25), hpan(0.25)]; this.rimPan = pan(0.35);
    // the ladder's octave layer splits to -0.4 / +0.4 from link 20 (see _layers): two persistent panners on the fx bus
    if (c.createStereoPanner) {
      this._layPan = [-0.4, 0.4].map((v) => { const p = c.createStereoPanner(); p.pan.value = this._panV(v); p.connect(this.fx); this._pans.push([p, v]); return p; });
    }
    // shared noise
    const len = c.sampleRate; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // the persistent loops' water (swim, current, acid): LOOP_NOISE s with independent left and right, baked once, so the
    // bed is wide and never audibly repeats once a second (filters keep both channels; one-shots keep the mono noiseBuf)
    const ll = Math.round(LOOP_NOISE * c.sampleRate); this.loopBuf = c.createBuffer(2, ll, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const x = this.loopBuf.getChannelData(ch); for (let i = 0; i < ll; i++) x[i] = Math.random() * 2 - 1; }
    this.noise = this.noiseBuf; // legacy name
    this._bakeKits();
    // the choir: two persistent vowel filter banks (pads sing "ooh", stabs go "wah")
    // the pads pass a tremolo gain: a persistent 6 Hz LFO whose depth is 0 except in the rapids
    // the pads sing through two banks, one panned -0.4 and one +0.4, each voice detuned -7 / +7 cents (see _pad)
    this.padBank = this._bank('oo', 2.4); this.padBankR = this._bank('oo', 2.4); this.padTrem = c.createGain(); this.padTrem.gain.value = 1;
    for (const [b, pv] of [[this.padBank, -0.4], [this.padBankR, 0.4]]) {
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = this._panV(pv); b.out.connect(p); p.connect(this.padTrem); this._pans.push([p, pv]); } else b.out.connect(this.padTrem);
    }
    // rung 4 (combo 45+): the pads duck to 0.5 on every kick through this gain (see _step)
    this.padSc = c.createGain(); this.padSc.gain.value = 1; this.padTrem.connect(this.padSc); this.padSc.connect(this.music);
    this.tremD = c.createGain(); this.tremD.gain.value = 0; this._trem = 0;
    const lfo = c.createOscillator(); lfo.frequency.value = 6; lfo.connect(this.tremD); this.tremD.connect(this.padTrem.gain); lfo.start();
    const ps = c.createGain(); ps.gain.value = 0.35; this.padBank.out.connect(ps); this.padBankR.out.connect(ps); ps.connect(this.echo);
    // the kick's body goes through a tanh shaper (drive 3, out 0.6): 2nd and 3rd harmonics around 200..400 Hz,
    // where a phone speaker can actually play the kick (see B())
    const kc = new Float32Array(1024); for (let i = 0; i < 1024; i++) kc[i] = Math.tanh(3 * (i / 1023 * 2 - 1));
    this._kickCurve = kc; this._kickSh = new WeakMap();
    this.stabBank = this._bank('ah', 2.8); this.stabBank.out.connect(this.music);
    // the hummed bass shares one lowpass and one soft-clip shaper (harmonics a phone can play)
    this.bassLp = c.createBiquadFilter(); this.bassLp.type = 'lowpass'; this.bassLp.frequency.value = 500; this.bassLp.Q.value = BASS_Q;
    const sh = c.createWaveShaper(), n = 1024, curve = new Float32Array(n), dr = 2.5, nrm = Math.tanh(dr);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(dr * x) / nrm; }
    sh.curve = curve; sh.oversample = '2x';
    const bo = c.createGain(); bo.gain.value = 0.7;
    // thin the hum's mids (the shaper's harmonics pile up around 400..1100 Hz and mask the 2..5 kHz presence band)
    const bm = c.createBiquadFilter(); bm.type = 'peaking'; bm.frequency.value = BASS_MID_F; bm.Q.value = BASS_MID_Q; bm.gain.value = BASS_MID_CUT;
    this.bassLp.connect(sh); sh.connect(bm); bm.connect(bo); bo.connect(this.music); this.shaper = sh; this.bassMid = bm;
    // the bass's octave-up saw partial: its own fixed 1.2 kHz lowpass, past the bass filter, so a phone speaker hears the line
    this.bassHi = c.createBiquadFilter(); this.bassHi.type = 'lowpass'; this.bassHi.frequency.value = 1200; this.bassHi.Q.value = 0.7; this.bassHi.connect(this.music);
    // rung 5 (combo 65+): the off-16th octave bass, through a lowpass that opens 800 -> 3000 Hz over every bar (see _step)
    this.bassUp = c.createBiquadFilter(); this.bassUp.type = 'lowpass'; this.bassUp.frequency.value = 800; this.bassUp.Q.value = 4; this.bassUp.connect(this.music);
    // the trick streak's stem bus (see _streakLayers): its own gain and lowpass, so a 180 ms tape stop or the comboBreak
    // shatter can take every layer out at once; the octave-up bass layer has its own fixed 1.4 kHz lowpass in front of it
    this.tsBus = c.createGain(); this.tsBus.gain.value = 1;
    this.tsLp = c.createBiquadFilter(); this.tsLp.type = 'lowpass'; this.tsLp.frequency.value = 18000; this.tsLp.Q.value = 0.7;
    this.tsBus.connect(this.tsLp); this.tsLp.connect(this.music);
    this.tsBassLp = c.createBiquadFilter(); this.tsBassLp.type = 'lowpass'; this.tsBassLp.frequency.value = 1400; this.tsBassLp.Q.value = 0.8; this.tsBassLp.connect(this.tsBus);
    this._applyTlp(); this._applyTrem(); this._calmRoute(); this._gentleRoute(); this._liteRoute(c.currentTime);
  }
  // the scheduler's own clock: tick() every 40 ms, so the beat keeps its lookahead even when frames stall
  // (main.js still calls tick() every frame; tick() is idempotent, a second call in the same ms does nothing)
  _startClock() {
    if (this._iv || typeof setInterval !== 'function') return;
    this._iv = setInterval(() => { try { this.tick(); } catch (e) { /* never let a sound break the clock */ } }, 40);
  }
  _stopClock() { if (this._iv) { clearInterval(this._iv); this._iv = 0; } }

  // ------------------------------------------------------------------ volume, mute, lifecycle
  // the sliders are perceptual: the stored 0..1 value v plays at gain v * v (half way is about -12 dB, not -6).
  // An 'ambient' iOS session also holds the music bus at 0 (the player's own music is playing; see setSessionType)
  _mLevel() { const v = this.musicVol; return this.musicMuted || v <= 0 || this._ambientMute() ? 0 : MUSIC_VOL * v * v; }
  // the iOS audio session. mode 'playback' (the default): the full game with its music; iOS pauses the player's own
  // music and the silent switch is ignored. 'ambient' (opt-in, "Play over my music"): the game never pauses the player's
  // own music (Spotify, a podcast) and our music bus is muted, so only the sfx play over theirs (the silent switch mutes
  // them too, as iOS does for any ambient app).
  // Safe before unlock() (the type is set then). Browsers without navigator.audioSession (everything but Safari 17+)
  // keep their music either way: the mute only exists where the session does. Any other mode is ignored
  setSessionType(mode) {
    if (!SESSIONS.includes(mode)) return;
    this._session = mode;
    this._applySession();
    if (this.music) this._setG(this.music.gain, this._mLevel());
    if (this.storyBus) this._setG(this.storyBus.gain, this._storyLv());
  }
  get sessionType() { return this._session; }
  _hasSession() { return typeof navigator !== 'undefined' && !!navigator && !!navigator.audioSession; }
  _ambientMute() { return this._session === 'ambient' && this._hasSession(); }
  _applySession() { try { if (this._hasSession()) navigator.audioSession.type = this._session; } catch (e) { /* ignore */ } }
  // seconds per beat of the groove right now (or of the tempo landing on the next downbeat): ui counts 3, 2, 1 on it
  countBeat() { return 60 / (this._bpmNext !== null ? this._bpmNext : this._bpm); }
  _fxLevel() { const v = this.sfxVol; return this.sfxMuted || v <= 0 ? 0 : v * v; }
  _setG(param, v) { if (!this.ctx) return; const t = this.ctx.currentTime; param.cancelScheduledValues(t); param.setTargetAtTime(v, t, 0.05); }
  setMusicVol(v) {
    this.musicVol = clamp01(v); if (this.music) this._setG(this.music.gain, this._mLevel()); if (this.storyBus) this._setG(this.storyBus.gain, this._storyLv());
    if (this._draft && this._hatSkip) this._setG(this._hatSkip.gain, this._mLevel());   // the draft's hats follow the slider too
  }
  _storyLv() { return this._mLevel() * (STORY_V / MUSIC_VOL); }   // the story bus follows the music slider, mute and session
  setSfxVol(v) { this.sfxVol = clamp01(v); if (this.fx) this._setG(this.fx.gain, this._fxLevel()); if (this.fxLad) this._setG(this.fxLad.gain, this._fxLevel() * LAD_K); }
  // where a link's pitched tail goes: the ladder lane (fxLad) when the sfx is built on the plain bus, else fx itself
  _ladDest(fx) { return this.fxLad && fx === this._sfxBase ? this.fxLad : fx; }
  setMusicMuted(m) { this.musicMuted = !!m; this.setMusicVol(this.musicVol); }
  setSfxMuted(m) { this.sfxMuted = !!m; this.setSfxVol(this.sfxVol); }
  setMuted(m) {             // master mute: everything, internal stingers included
    this.muted = !!m;
    if (this.master) { const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this._masterV(), t); }
  }
  // the master gain: MASTER, +1.5 dB while the combo sits on the top rung (100+), 0 when muted
  _masterV() { return this.muted ? 0 : MASTER * (this._mixUp ? BOOST100 : 1); }
  // rung 100's lift on and off at time t (a 50 ms glide, never a jump)
  _boostTo(on, t) {
    if (on === this._mixUp) return; this._mixUp = on;
    if (!this.master || this.muted) return;
    const g = this.master.gain; g.cancelScheduledValues(t); g.setTargetAtTime(this._masterV(), t, 0.05);
  }
  // app hidden / shown: stop the clock, and on return restart the grid so queued notes do not burst
  suspend() {
    this._suspended = true; this._stopClock(); this._winBoxCut(); this._loseBoxCut(); if (this.ctx) this._openCut(this.ctx.currentTime);
    if (this.ctx && this.ctx.state === 'running') { try { this.ctx.suspend(); } catch (e) { /* ignore */ } }
  }
  resume() {
    this._suspended = false; const c = this.ctx; if (!c) return;
    const reset = () => { this.next = c.currentTime + 0.05; this._slotT = -1; };
    reset(); this._startClock();
    try { const p = c.resume(); if (p && p.then) p.then(reset, () => {}); } catch (e) { /* ignore */ }
  }
  // dull the music (pause menu, mutation cards). Optional: the game works without calling it.
  // A muffle (pause, any call without why) closes the music to 650 Hz and tears the proximity loops down; they rebuild when
  // main.js sets them again. why 'draft' (the cards dealing: setMuffle(true, 'draft')) is lighter, so the draft never sounds
  // like the pause menu: the lowpass only goes to DRAFT_LP (2200 Hz, time constant 0.08 s), the hats and the ts shaker skip it
  // (hatBus -> _hatSkip -> slp), the loops play on, and a quiet "oo" choir swells on the chord every 2 bars (see _step).
  // sfx('pick') then books the reopen to 18 kHz with a crash on the next downbeat, and the setMuffle(false) right after it
  // leaves that booking alone. Any muffle on (draft included) shuts the win and lose boxes
  setMuffle(on, why) {
    const draft = !!on && why === 'draft';
    this._muffled = !!on && !draft;
    if (!this.ctx) { this._draft = draft; return; }
    const t = this.ctx.currentTime, p = this.mlp.frequency;
    this._lpWake();
    if (on) { this._winBoxCut(); this._loseBoxCut(); if (!draft) this._killLoops(); }
    if (draft) {
      if (!this._draft) this._draftBar = -1;   // the choir's first swell on the next downbeat
      this._draft = true; this._pickOpen = -1; this._hatRoute(true, t);
      p.cancelScheduledValues(t); p.setTargetAtTime(DRAFT_LP, t, this._ftc(DRAFT_TC));
      return;
    }
    if (!on && this._draft && this._pickOpen > t) return;   // a pick's reopen is booked on its downbeat
    if (this._draft) { this._draft = false; this._pickOpen = -1; this._hatRoute(false, t); }
    p.cancelScheduledValues(t); p.setTargetAtTime(on ? 650 : 18000, t, this._ftc(on ? 0.06 : 0.15));
  }
  get draftMuffle() { return this._draft; }
  // the hats' route at time t: through the music's lowpasses (draft off), or past the muffle into the slow-mo lowpass at the
  // music's volume (a card draft: they keep ticking over the closed band)
  _hatRoute(skip, t) {
    if (!this._hatIn || !this._hatSkip) return;
    const a = this._hatIn.gain, b = this._hatSkip.gain;
    hold(a, t); hold(b, t);
    a.setTargetAtTime(skip ? 0 : 1, t, 0.015); b.setTargetAtTime(skip ? this._mLevel() : 0, t, 0.015);
  }
  // calm mode (main.js passes S.reduced): no hit-stop gasps or micro ducks, ducks never below 0.8, filter
  // moves take about 0.4 s, and the proximity growl is softer and steadier (see threat()). It tames peaks too: the
  // stingers (frenzy, second, win, the shield hit) play 4 dB lower, every heartbeat (the duel bed included) loses
  // 6 dB under 80 Hz, and the music drops its fast throbs (the rapids' 6 Hz pad tremolo, a long roll's 32nds).
  // Calm also caps the stingers' own send at 0.7 (CALM_SEND, frenzy / second / shield hit / win / lose), keeps the slow-mo
  // lowpass at 6 kHz or above (CALM_SLP), and patches a gentle master compressor (-18 dB, ratio 3) into the chain.
  // setCalm(false) puts all of it back.
  setCalm(b) { this._calmReq = !!b; this._calmSet(this._calmReq || this.gentle); }
  // gentle sound (main.js's own toggle; reduced motion still calls setCalm only): calm mode on top of whatever setCalm
  // asked, a master compressor (GENTLE_COMP: -20 dB, knee 10, ratio 6, 3 ms / 250 ms) patched in right before the
  // destination with its makeup gain taken back (GENTLE_TRIM), and the stingers and impacts built 4 dB down with a 60 ms
  // minimum attack (see sfx). setMono's +3 dB on the cilia tell stays (the tell is neither). Safe before unlock()
  setGentle(b) { this.gentle = !!b; this._gentleRoute(); this._calmSet(this._calmReq || this.gentle); }
  _gentleRoute() {
    if (!this.ctx || !this._gComp || !this.clip || this._gIn === this.gentle) return;
    const d = this.ctx.destination;
    try {   // the disconnect goes first, as in _calmRoute
      if (this.gentle) { this.clip.disconnect(d); this.clip.connect(this._gComp); this._gTrim.connect(d); }
      else { this.clip.disconnect(this._gComp); this._gTrim.disconnect(d); this.clip.connect(d); }
      this._gIn = this.gentle;
    } catch (e) { /* an old browser without selective disconnect: keep the chain as it is */ }
  }
  _calmSet(b) {
    const was = this.calm; this.calm = !!b; if (was === this.calm) return;
    this._thrStyle(); this._applyTrem(); this._calmRoute();
    if (this.ctx && this.slp && (this._slowOn || this.ctx.currentTime < this._impUntil)) this._slpTo(this._slowF(), 0.05);   // a slow running now moves to the new floor
    if (!this.calm && this.fxTrim && this.ctx) { const now = this.ctx.currentTime; this._capUntil = -1; hold(this.fxTrim.gain, now); this.fxTrim.gain.setTargetAtTime(FX_TRIM, now, 0.02); }
    if (this._thr && this._thrK > 0) { const k = this._thrK; this._thrK = -1; this.threat(k, this._thrPan); }   // re-level the growl now
  }
  // quality stage (main.js's 0 full, 1 reduced, 2 lite): the voice cap drops 48 / 36 / 28, and stage 2 (lite) also
  // sings say() vowels without their harmony voices. Safe before unlock() (it only sets numbers).
  // From stage 1 the master's soft clipper runs without oversampling, and stage 2 also takes the music's glue compressor
  // out (a plain gain stands in for it) and splices the three music lowpasses (muffle, slow-mo, tension) out of the chain
  // while all three sit wide open at 18 kHz; any muffle, slow-mo, impact or tension move patches them back in first
  // (_lpWake), the same hot swap as _calmRoute. The limiter always stays.
  setStage(st) {
    st = Math.max(0, Math.min(2, (+st || 0) | 0));
    this._stage = st; this._cap = CAP_STAGE[st]; this._lite = st >= 2;
    if (this.clip) { try { this.clip.oversample = st >= 1 ? 'none' : '2x'; } catch (e) { /* ignore */ } }
    if (this.ctx) this._liteRoute(this.ctx.currentTime);
  }
  // stage 2's routing (see setStage): the glue compressor in or out, and the idle lowpasses spliced out (mduck -> the
  // 250 Hz lift directly) or back in. Disconnect first, as in _calmRoute: a browser that cannot disconnect one
  // destination throws before anything changed, and the chain stays as it is
  _liteRoute(now) {
    if (!this._mPeak || !this.mduck) return;
    const lite = this._stage >= 2;
    if (lite !== this._mcBy) {
      try {
        if (lite) { this._mShelf.disconnect(this.mcomp); this._mShelf.connect(this._mcByG); }
        else { this._mShelf.disconnect(this._mcByG); this._mShelf.connect(this.mcomp); }
        this._mcBy = lite;
      } catch (e) { /* keep the chain as it is */ }
    }
    const out = lite && this._lpIdle(now);
    if (out !== this._lpOut) {
      try {
        if (out) { this.mduck.disconnect(this.mlp); this.mduck.connect(this._mPeak); }
        else { this.mduck.disconnect(this._mPeak); this.mduck.connect(this.mlp); }
        this._lpOut = out;
      } catch (e) { /* keep the chain as it is */ }
    }
  }
  // the three music lowpasses are idle: nothing wants them (no muffle, slow-mo, impact, tension, menu or rematch filter),
  // the last move is LP_HOLD s old, and all three read wide open
  _lpIdle(now) {
    if (this._muffled || this._slowOn || this._impPend || now < this._impUntil || now < this._lpHold || this._rematch) return false;
    for (const f of [this.mlp, this.slp, this.tlp]) if (!f || !(f.frequency.value >= LP_OPEN)) return false;
    return true;
  }
  // a muffle, slow-mo, impact or tension / menu filter move is about to start: lowpasses back in now, kept LP_HOLD s
  _lpWake() {
    if (!this.ctx) return;
    this._lpHold = this.ctx.currentTime + LP_HOLD;
    if (this._lpOut) this._liteRoute(this.ctx.currentTime);
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
    if (this._steer && this._steer.p) this._steer.p.pan.setTargetAtTime(this._panV(this._steer.pan), now, 0.03);
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
  // bullet time. slowmo(on, big): a small slow rounds the music's top off (5 kHz lowpass, time constant 0.03 s, so it
  // never clicks), or, when the filter was under 5 kHz in the last 4 s, only ducks it for 0.2 s (the muffle budget). Only big ones (first FRENZY, egg drill start, zone-end crawl) also play a tape stop on
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
      // a small slow right after a closure keeps the filter open (_slowOpen) and only ducks the volume
      if (!this._slowOn) this._slowOpen = !big && this._shut(now);
      this._slowOn = true; this._slowBig = this._slowBig || big; this._slow = this._slowBig;
      this._rate = this._slowBig ? 0.72 : 0.85; this._rateT0 = -9;
      this._slpTo(this._slowF(), 0.03);
      if (this._slowOpen && !this._slowBig && !this.calm && now >= this._impUntil) { const g = this.mduck.gain; hold(g, now); g.setTargetAtTime(0.75, now, 0.01); g.setTargetAtTime(1, now + 0.2, REL_TC); this._mdUntil = Math.max(this._mdUntil, now + 0.2); }
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
    if (this._slowF() < SHUT_F) this._shutAt = Math.max(this._shutAt, now + 3 * REL_TC);   // a big slow was a closure: the budget's 4 s start now
    this._slowOn = false; this._slowBig = false; this._slow = false; this._slowOpen = false;
    this._lkHold = Math.max(this._lkHold, now + LOCK_HOLD);   // the beat lock only nudges for LOCK_HOLD s (see _lockStep)
    this._slpTo(18000, REL_TC);
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
  // where the slow-mo lowpass sits: 1400 Hz in a big slow, 5 kHz in a small one (wide open when the budget says so)
  _slowF() { return this._slowOn ? this._slpMin(this._slowBig ? SLOW_BIG_F : this._slowOpen ? 18000 : SLOW_SMALL_F) : 18000; }
  // the muffle budget: true while the slow-mo lowpass is under 5 kHz, or was within the last 4 s
  _shut(now) { return (this._slowOn && this._slowF() < SHUT_F) || now - this._shutAt < SHUT_HOLD; }
  // calm mode never closes the slow-mo lowpass below CALM_SLP (6 kHz)
  _slpMin(f) { return this.calm ? Math.max(CALM_SLP, f) : f; }
  // move the slowmo lowpass, unless an impact() is holding it; the impact's release then lands on _slowF()
  _slpTo(f, tc) {
    this._lpWake();
    const now = this.ctx.currentTime, p = this.slp.frequency;
    if (now < this._impFUntil) { p.cancelScheduledValues(this._impFUntil); p.setTargetAtTime(f, this._impFUntil, REL_TC); return; }
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
    this._lpWake();
    const p = this.slp.frequency, to = this._slpMin(Math.min(f, this._slowF()));
    hold(p, now); p.setTargetAtTime(to, now, this._ftc(0.02)); p.setTargetAtTime(this._slowF(), now + dur, this._ftc(0.06));
    if (to < SHUT_F) this._shutAt = Math.max(this._shutAt, now + dur + 0.15);
  }
  // pause: drop every slow-mo state at once, no swell, no crash, no tape stop
  slowmoReset() {
    this._rematchOff();   // title and shop come through here (main.js menuMusic): the rematch groove ends
    this._streakReset(true);   // a medley drop ends too, and its key comes back down
    this._slowReset();
    this._killLoops();    // the title, shop, result and pause: no growl, current or sizzle left running
  }
  _slowReset() {
    // a reset that cuts a running slow or hit-stop short still gets the lock's 2.5 s no-snap window (see _lockStep)
    const tn = this.ctx ? this.ctx.currentTime : 0;
    this._lkHold = this.ctx && (this._slowOn || tn < this._impUntil) ? tn + LOCK_HOLD : -1;
    this._impPend = false;
    this._slowOn = false; this._slowBig = false; this._slow = false; this._slowOpen = false; this._impUntil = -1; this._impFUntil = -1;
    this._rate = 1; this._rateFrom = 1; this._rateT0 = -9;
    if (!this.ctx) return; const now = this.ctx.currentTime;
    for (const [p, v] of [[this.slp.frequency, 18000], [this.mfb.gain, 0.33], [this.mfb2.gain, 0.33], [this.mduck.gain, 1]]) { p.cancelScheduledValues(now); p.setValueAtTime(v, now); }
    this._mdUntil = -1;
  }
  // hit stop: the music gasps (micro duck to `depth`, lowpass dip to 4 kHz) under a 40 ms sub thump, and HOLDS there:
  // main.js's hitRelease calls impactRelease(ms) on the frame the world moves again, and the snap back (time constant
  // 12 ms) starts there, so the music lets go exactly when the picture does. In case no release ever comes (a pause, a
  // page hidden mid-hold), a safety recovery runs IMP_SAFE (0.25 s) after the planned end. Within 4 s of the last
  // closure (the muffle budget) only the volume ducks. Calm: nothing.
  impact(ms, depth = 0.5) {
    if (!this.ctx || !this.mduck || this.calm || this._demo) return;
    const c = this.ctx, now = c.currentTime, msv = +ms || 0, sec = Math.max(0.02, Math.min(0.5, msv / 1000)), end = now + sec, safe = end + IMP_SAFE;
    const dv = Math.max(0.05, Math.min(1, +depth || 0.5));
    const g = this.mduck.gain, f = this.slp.frequency, shut = this._shut(now);
    this._lpWake();
    if (!this._impPend) { this._lkHoldPre = this._lkHold; this._shutPre = this._shutAt; }   // what the release falls back to
    g.cancelScheduledValues(now); g.setTargetAtTime(dv, now, 0.006); g.setTargetAtTime(1, safe, REL_TC);
    this._mdUntil = Math.max(this._mdUntil, safe); this._mdLast = now;
    if (!shut) {
      const to = this._slpMin(Math.min(IMPACT_F, this._slowF()));
      f.cancelScheduledValues(now); f.setTargetAtTime(to, now, 0.008); f.setTargetAtTime(this._slowF(), safe, REL_TC);
      if (to < SHUT_F) this._shutAt = Math.max(this._shutAt, safe + 3 * REL_TC);
      this._impFUntil = safe;
    }                                                   // else the filter stays where slow-mo wants it
    this._impUntil = safe; this._impPend = true; this._impShut = !shut;
    this._lkHold = Math.max(this._lkHold, safe + LOCK_HOLD);   // no hard beat snap for LOCK_HOLD s after it
    if (this.muted || c.state !== 'running') return;
    this.tone('sine', 90, 45, now + 0.003, 0.04, 0.35, this.fx, 0.002);
    this._thudUp(now + 0.003, 90, 45, 0.04, 0.35, this.fx);
  }
  // the hit-stop is over (main.js hitRelease, for holds of 60 ms+): at currentTime + 3 ms the music snaps back (REL_TC)
  // from wherever impact() left it, and the release snap plays right there: a 25 ms bandpassed noise crack (2.8 kHz) and a
  // quick 1 kHz -> 300 Hz chirp (full for a 90 ms+ hold, 0.6x for 60..89 ms). Nothing to release (impact() was rate
  // limited, calm mode, the safety already ran): nothing happens.
  // kind (optional: main.js passes hitHold.kind; none keeps the plain snap above) says what the hit MEANT:
  //   hurt (REL_HURT: bonk, bump, player, death, shove): a wet low "thup" (180 -> 90 Hz under a gulping 500 -> 220 Hz
  //     bandpass), no high crack
  //   payoff (REL_PAY: frenzy, milestone, bank, finisher, trick, kevin, pass): the crack plus a 2-note rising pentatonic
  //     blip in this.key on the grid (_quantCap)
  //   shield, wing (REL_METAL): a 1.8 kHz metallic ping ringing 0.25 s
  impactRelease(ms = 90, kind) {
    if (!this.ctx || !this.mduck || !this._impPend) return;
    const c = this.ctx, now = c.currentTime;
    this._impPend = false;
    if (now >= this._impUntil) return;                  // the safety recovery got there first
    const t = now + REL_LEAD, g = this.mduck.gain;
    hold(g, t); g.setTargetAtTime(1, t, REL_TC);
    this._mdUntil = t;
    if (this._impShut && now < this._impFUntil) {
      const f = this.slp.frequency; hold(f, t); f.setTargetAtTime(this._slowF(), t, REL_TC);
      this._shutAt = Math.max(this._shutPre ?? -99, t + 3 * REL_TC);
    }
    this._impFUntil = t; this._impUntil = t;
    this._lkHold = Math.max(this._lkHoldPre ?? -1, t + LOCK_HOLD);
    const msv = +ms || 0;
    if (this.muted || c.state !== 'running' || this.sfxMuted || this.sfxVol <= 0 || msv < 60) return;
    const v = msv >= 90 ? 1 : 0.6, kd = typeof kind === 'string' ? kind : '';
    if (REL_HURT.has(kd)) {
      this.tone('sine', 180, 90, t, 0.08, 0.22 * v, this.fx, 0.003, 0.06);
      this.hum(t, 0.07, 0.12 * v, 'bandpass', 500, 4, this.fx, 220, 0.003);
      return;
    }
    if (REL_METAL.has(kd)) {
      this.tone('sine', 1800, 0, t, 0.25, 0.08 * v, this.fx, 0.001);
      this.tone('sine', 1800 * 2.76, 0, t, 0.12, 0.025 * v, this.fx, 0.001, 0, 0);   // an inharmonic partial: metal, not a bell
      return;
    }
    this.hum(t, 0.025, 0.16 * v, 'bandpass', 2800, 1.2, this.fx, 0, 0.001);
    this.tone('sine', 1000, 300, t, 0.05, 0.12 * v, this.fx, 0.002, 0.04);
    if (REL_PAY.has(kd)) {
      const K = this.key, q = this._quantCap(now); let r = 440 * st(K); while (r > 660) r /= 2;
      const f1 = r * st(this._chordFix(K + pen(5), K) - K), f2 = r * st(this._chordFix(K + pen(7), K) - K);
      this.tone('triangle', f1, 0, q, 0.06, 0.08 * v, this.fx, 0.002, 0, 0);
      this.tone('triangle', f2, 0, q + 0.06, 0.09, 0.08 * v, this.fx, 0.002, 0, 0);
    }
  }
  _menu(I) { return !this._rematch && I > 0.2 && I < 0.45; }   // the rematch groove is the race loop, whatever the intensity
  // the tension / menu lowpass: tension above 0.5 closes it toward 1200 Hz, the rematch groove sits at 400 Hz, and the
  // waiting room at MENU_TLP[menuKind] (the title brighter, about 7 kHz, opening up from 3200 Hz over the first 1.5 s
  // after unlock; shop, result and an unknown menu 3200 Hz)
  _applyTlp() {
    if (!this.ctx) return;
    const T = this._tension, tc = T <= 0.5 ? 18000 : 18000 * Math.pow(1200 / 18000, (T - 0.5) / 0.5);
    const menu = this._menu(this._int), win = menu && this._winRoom(), ml = win ? WIN_TLP : MENU_TLP[this._menuKind] || 3200;
    const lim = this._rematch && !this._rmOpen ? 400 : menu ? ml : 18000;
    const f = Math.min(tc, lim), t = this.ctx.currentTime, p = this.tlp.frequency, open = this._unlockAt + TITLE_OPEN;
    if (f < LP_OPEN || !(p.value >= LP_OPEN)) this._lpWake();   // closing (or not yet open): the lowpasses belong in the chain
    if (win && f > 3200 && t < this._outAt + WIN_OPEN) {   // a win: 3200 Hz until the fanfare's last chord, then open over WIN_OPEN s
      if (this._winGlide === this._outAt) return;          // already gliding there (a repeat call must not restart it)
      this._winGlide = this._outAt;
      const s0 = Math.max(t, this._outAt), v0 = Math.max(400, Math.min(3200, +p.value || 3200));
      p.cancelScheduledValues(t); p.setValueAtTime(v0, t); if (s0 > t) p.setValueAtTime(v0, s0); p.exponentialRampToValueAtTime(f, s0 + WIN_OPEN);
      return;
    }
    p.cancelScheduledValues(t);
    if (menu && !this._rematch && f > 3200 && t < open - 0.1 && !this.calm) { p.setValueAtTime(3200, t); p.exponentialRampToValueAtTime(f, open); return; }
    p.setTargetAtTime(f, t, this._ftc(0.15));
  }
  // drop the music for a moment so a big sound effect can shine
  // (no duck when sfx are off: there is nothing to make room for. Calm mode never ducks below 0.8.)
  duck(amount = 0.35, sec = 0.6) {
    if (!this.ctx || this._demo) return;   // a demoted stinger (see sfx) never ducks
    if (amount < 1 && (this.sfxMuted || this.sfxVol < 0.05)) return;
    if (this.calm) amount = Math.max(CALM_DUCK, amount);
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
    this._linkN = 0; this._dnaN = 0; this._sugN = 0; this._wonAt = -1; this._leadN = 0; this._contest = false; this._cTier = 0; this._rollAt = -1; this._rollLen = 4; this._clN = 0;
    this._zone = 0; this._zoneBar = (this.stepI >> 4) + 1; this._fin = 0;
    this._keyNext = null; this._keyCrash = false; this._whoopBar = -1; this._themePend = true; this._themeAt = -99;
    this._tlift = 0; this._tliftPend = false; this._tliftEnd = -1; this._streakReset();
    this._lastPassN = -1; this._elift = 0; this._eggHit = -1; this._kevPass = 0; this._acidLow = false;
    this._kevFrz = false; this._hypeX = 0; this._hypeG = 1; this._goldHi = false;
    this._padV = null; this._pT.length = 0; this._heheN = 0; this._heheZ = -1; this._llTo = 0; this._llFrom = 0; this._llAt = -9; this._llTier = 0;
    const seeded = seed !== undefined && seed !== null && seed !== '' && Number.isFinite(+seed), sv = seeded ? Math.abs(+seed | 0) : 0;
    this._varN = seeded ? sv % 1000000 : (Math.random() * 1e6) | 0;
    this.fillN = seeded ? (sv >>> 3) % FILLS.length : this.fillN + Math.floor(Math.random() * 5);
    this._rematchOff(); this._rate = 1; this._rateT0 = -9;
    this._holdUntil = 0; this._softIn = false; this._outUntil = 0; this._gaspUntil = -1; this._duelK = null; this._eggK = -1; this._bankPend = -1; this._themeOn = false;
    if (!this.ctx) return;
    this._syncDelay(); this._applyTlp(); this._applyTrem(); this._applyInt();
    this.setMuffle(false); this.duck(1, 0); this._killLoops(); this._winBoxCut(); this._loseBoxCut();
    if (this._slowOn) this.slowmoReset();
    const bar = (this.stepI >> 4) + 1; this.barBase = bar; this.crashBar = bar; this.fillBar = -1;
    // the opening's count-in is still counting (openingCue(2) just before start()): its downbeat stays the first race bar
    if (this._openAt > this.ctx.currentTime + 0.02) this._openPhase(this._openAt, false); else this._openAt = -1;
  }

  // after a loss (ui calls this from showResult instead of menuMusic): the race loop at race tempo, kick and hats
  // behind a 400 Hz lowpass, already itching to go again. sfx('ready') opens the filter over 600 ms onto a beat,
  // where its pluck lands. close (lost by a whisker): loseClose's top note, the leading tone, keeps hanging as a
  // quiet drone until sfx('again') resolves it to the tonic. Ends with newRun(), slowmoReset() (main.js's
  // menuMusic on the title and shop) or rematchOff().
  rematchMusic(close = false) {
    if (close) this._loseUpgrade();   // a near miss: the short lose sting just booked becomes the full one
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
    this._rmOpen = true; this._lpWake();
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
  // Inside sfx() a slow-mo bends it: length and glide divided by _fxR; a sweep's pitch times _fxR, while a note (f1 0, or a
  // scoop of 2 semitones or less) starts at f * _fxR and glides home to its pitch within 0.06 s (see the TONAL set).
  tone(type, f0, f1, t, dur, vol, dest, a = 0.004, glide = 0, pri = 1, opts = null) {
    if (this._busy(pri)) return null;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; dest = dest || this.fx;
    if (a < this._minA) a = this._minA;
    const r = this._fxR;
    if (r !== 1) {
      dur /= r; glide /= r;
      // a note (no slide, or a scoop of 2 semitones or less onto its pitch) starts bent and glides home, so it ends in key;
      // a real sweep (bonk, swat, a whoosh) bends all the way
      if (!f1) { f1 = f0; glide = Math.min(dur, 0.06); f0 *= r; }
      else if (f1 < f0 * 1.13 && f0 < f1 * 1.13) f0 *= r;
      else { f0 *= r; f1 *= r; }
    }
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
  // vib (optional): a vibrato rate in Hz (vibD cents deep, default 30) shared by every voice
  // fm (optional): every formant times fm (2: an octave up, a baby's tiny mouth), the Q kept
  say(t, freqs, v0, v1, dur, vol, glide = 0.15, bend = 1, dest, pri = 1, vib = 0, vibD = 30, fm = 1) {
    if (this._lite && freqs.length > 1) freqs = [freqs[0]];   // lite: the lead voice only, no harmony
    if (this._busy(pri, 3 * freqs.length + (vib ? 1 : 0))) return null;   // every voice counts 3 (its share of the formant filters)
    const c = this.ctx, out = c.createGain(); out.connect(dest || this.fx);
    if (this._hd) vol *= this._hv;
    const sa = this._minA > 0.03 ? Math.min(this._minA, dur * 0.5) : 0.03;   // gentle sound's 60 ms minimum attack reaches the voices too
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vol, t + sa);
    out.gain.setValueAtTime(vol, t + (sa > 0.03 ? Math.max(sa, dur * 0.6) : dur * 0.6)); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const mix = c.createGain(); mix.gain.value = 1 / Math.sqrt(freqs.length);
    for (let k = 0; k < 2; k++) {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = VOW[v0][k] / FBW[k] * 0.8;
      f.frequency.setValueAtTime(VOW[v0][k] * fm, t); f.frequency.setTargetAtTime(VOW[v1][k] * fm, t + 0.03, glide / 3);
      const g = c.createGain(); g.gain.value = FG[k] * 3.2; mix.connect(f); f.connect(g); g.connect(out);
    }
    let vd = null;
    if (vib) { const lfo = c.createOscillator(); vd = c.createGain(); lfo.frequency.value = vib; vd.gain.value = vibD; lfo.connect(vd); this._go(lfo, t, t + dur + 0.03); }
    for (const fr of freqs) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(fr, t);
      if (bend !== 1) o.frequency.exponentialRampToValueAtTime(fr * bend, t + dur);
      o.detune.value = (Math.random() - 0.5) * 12 + this._hd; o.connect(mix); if (vd) vd.connect(o.detune);
      this.live += 3; o.onended = this._dec3; o.start(t); o.stop(t + dur + 0.03);
    }
    return out;   // its output gain (Kevin's giggle keeps it, so an "oof" can cut it short)
  }
  // brass-ish note for fanfares: two detuned saws through a lowpass that opens and closes ("wah").
  // f1/glide bend the pitch (a sad slide for a beaten rival)
  _brass(t, f, dur, vol, wah = false, vib = false, f1 = 0, glide = 0) {
    if (this._busy(1)) return;
    const c = this.ctx, lp = c.createBiquadFilter(), g = c.createGain(); lp.type = 'lowpass'; lp.Q.value = wah ? 6 : 2;
    const top = wah ? 1300 : Math.min(5000, f * 7);
    lp.frequency.setValueAtTime(wah ? 350 : f * 1.5, t); lp.frequency.exponentialRampToValueAtTime(top, t + Math.min(0.12, dur * 0.4));
    lp.frequency.exponentialRampToValueAtTime(wah ? 420 : f * 2.5, t + dur);
    const ba = this._minA > 0.03 ? Math.min(this._minA, dur * 0.5) : 0.03;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + ba);
    g.gain.setValueAtTime(vol, t + (ba > 0.03 ? Math.max(ba, dur * 0.7) : dur * 0.7)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
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
    if (this._demo) return;   // a demoted stinger (see sfx) keeps no kick
    this.tone('sine', 185, 46, t, 0.22, 0.35 * v, dest, 0.002, 0.09);
    this.tone('sine', 160, 95, t, 0.12, KICK_BODY * v, this._shaped(dest), 0.002, 0.09);
    this.tone('triangle', 330, 190, t, 0.06, 0.22 * v, dest, 0.002, 0.04);
    this.hum(t, 0.008, 0.35 * v, 'bandpass', 1200, 1.2, dest, 0, 0.001);
    this._kicks[this._kickI] = t; this._kickI = (this._kickI + 1) & 7;
    if (this._steer && this._steerL > 0 && dest === this.music) {   // the steering voice breathes under the groove's kick
      const g = this._steer.sc.gain; g.setTargetAtTime(this.calm ? 0.8 : 0.5, t, 0.004); g.setTargetAtTime(1, t + 0.05, 0.08);
    }
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
  hat(t, v = 1, dest = this.music, side = this._hs) { if (this.live > this._cap - 8) return; if (t < this._hatDuck && dest === this.music) v *= 0.85; this._kit('hat', t, 0.24 * v, this._mpan(dest, side)); }
  ts(t, v = 1, dest = this.music, side = this._hs) { if (this.live > this._cap - 8) return; if (t < this._hatDuck && dest === this.music) v *= 0.85; this._kit('ts', t, 0.192 * v, this._mpan(dest, side)); }
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
    if (this._demo) return;   // ...and no crash
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
    if (this._story) this._storyTick(now);   // the story music box keeps its own clock, beat or no beat
    if (this._draft && this._pickOpen > 0 && now > this._pickOpen + 0.05) { this._draft = false; this._pickOpen = -1; }   // (muted: no _step saw the downbeat)
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
    if (this._swim) this._swimApply(now);   // a menu, the muffle or a mute silences the bed even when main.js stops setting speed
    if (this._steer && this._steerL > 0 && !this._swimOn()) this._steerSet(0, this._steer.f, this._steer.pan, STEER_R2);   // the same for the steering voice
    if (this._tsLvl && silent && now > this._tsUntil) this._streakReset(true);   // muted past its hold: no stale tape stop later
    if (this._thr || this._cur || this._acid || this._swim) this._reapLoops(now);
    if (this._stage >= 2 && now >= this._lpChk) { this._lpChk = now + 0.25; this._liteRoute(now); }   // lite: splice idle lowpasses out
  }
  // the story's own scheduler: one theme 16th per 8th at STORY_BPM, LOOK s ahead (never more than 8 steps a call)
  _storyTick(now) {
    const sp = 30 / STORY_BPM;
    if (this._sNext < now - 0.25 || this._sNext > now + 2) this._sNext = now + 0.05;   // woke from a sleep or a clock jump
    const silent = this.muted || this.ctx.state !== 'running';
    let g = 0;
    while (this._sNext < now + LOOK && g++ < 8) { if (!silent) this._storyStep(this._sNext, this._sStep, sp); this._sNext += sp; this._sStep++; }
  }
  // one story 8th: the music box on the theme's note (THEME, 4 bars), the finale's kazoo and its boots-and-cats heartbeat
  // ("boots" lub-dub on every quarter, "cats" on the 8th between)
  _storyStep(t, n, sp) {
    const SB = this.storyBus; if (!SB) return;
    const bar = (n >> 4) & 3, i = n & 15, d = THEME[bar][i];
    if (d !== null) {
      const f = themeBase(this.key, 1800) * st(PENTA[d]), len = THEME_LEN[bar][i] * sp;
      this.tone('sine', f, 0, t, Math.min(1.2, len + 0.3), 0.09, SB, 0.002, 0, 1);   // the tine
      this.tone('sine', f * 4, 0, t, 0.08, 0.02, SB, 0.001, 0, 0);                    // its ping
      if (this._story >= 2) this.say(t, [f / 4], 'ee', 'eh', Math.min(0.9, len * 0.9), 0.045, 0.05, 1, SB, 0, this.calm ? 0 : 5, 15);
    }
    if (this._story >= 2) {
      if ((i & 1) === 0 && (i & 2) === 0) { this.B(t, 0.3, SB); this.B(t + 0.16, 0.18, SB); }
      else if ((i & 3) === 2) this.ts(t, 0.45, SB);
    }
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
  _deflate() {             // frenzy over: a falling "fwoomp", and the key comes back down (a medley drop ends with it)
    this._dropEnd(true);
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
    if (this.hatBus) {                              // hype(): the hat bus lift lands on this 16th (the race only)
      const hg = this._menu(I) || this._rematch ? 1 : this._hypeG;
      if (hg !== this._hypeGNow) { this.hatBus.gain.setTargetAtTime(hg, t0, 0.02); this._hypeGNow = hg; }
    }
    // a win/lose stinger owns the stage: the groove waits for it to finish and for the next downbeat, then
    // counts back in on a soft crash (it never clashes with the fanfare's key)
    if (this._holdUntil) {
      if (t0 < this._holdUntil || i !== 0) return;
      this._holdUntil = 0; this.crashBar = bar; this._softIn = true;
    }
    // the waiting room remembers the run: on a downbeat it takes the key and tempo of the last run's furthest zone
    // (menuZone), so the bar it starts plays in them (the race's newRun() puts zone 1 back)
    if (i === 0 && this._menu(I)) {
      const mz = this._menuZ, mk = ZONE_KEY[mz], mb = menuBpm(mz);
      if (this.key !== mk && this._keyNext === null) this.key = mk;
      if (this._bpm !== mb && this._bpmNext === null) { this._bpm = mb; this._syncDelay(t0); this._lkSnap = true; }
    }
    const drop = this._dropOn && !this._menu(I);   // a medley drop: the full L2 band with the FRENZY lead, up a key
    const L = drop ? 2 : I < 0.5 ? 0 : I < 1.3 ? 1 : 2, spb = 60 / this._bpm / 4, M = this.music;
    const fz = this._ftier > 0 || drop;             // FRENZY: the whistle lead and the wah stabs join in
    const Z = ZONE_FLAVOR[this._zone] || ZONE_FLAVOR[0];
    const cmb = Math.max(this.combo | 0, this.heat);
    const hot = cmb >= 12, blazing = cmb >= 25;
    // swing the off sixteenths: 0.15 at L0 and on the menus, the zone's own swing at L1, 0.35 of it at L2 (ZONE_SWING)
    const sw = L === 0 || this._menu(I) ? 0.15 : (ZONE_SWING[this._zone] ?? 0.15) * (L === 2 ? SWING_L2 : 1);
    const t = t0 + ((i & 1) ? spb * sw : 0);
    const pb = (((bar - this.barBase) % 8) + 8) % 8;
    const menu = this._menu(I), prog = menu ? (this._winRoom() ? MAJ_PROG : PROG) : Z.prog || PROG;   // a won result: the relative major
    const chord = prog[pb & 3];
    // the bass root is anchored at key 0 (73..196 Hz) and climbs with the key, like the pads and the whistle: never a fold
    const root = bassRoot(this.key, chord[0]);
    this.chord = chord;
    // the card draft: a quiet "oo" choir swells on the chord every 2 bars, until a pick's downbeat ends the draft
    if (this._draft && i === 0) {
      if (this._pickOpen > 0 && t0 >= this._pickOpen - 0.002) { this._draft = false; this._pickOpen = -1; }
      else if (this._pickOpen < 0 && !menu) {
        if (this._draftBar < 0) this._draftBar = bar;
        if (((bar - this._draftBar) & 1) === 0 && !this._busy(0, 9)) {
          const sw = this._gain(0, M); sw.gain.setValueAtTime(0, t0); sw.gain.linearRampToValueAtTime(1, t0 + 0.5);
          this.say(t0, padVoices(chord, this.key), 'oo', 'oo', DRAFT_OO_LEN, DRAFT_OO, 0.15, 1, sw, 0);
        }
      }
    }
    // a lift is coming on the next downbeat: a 1-beat rising "whoop" from the crew
    if (i === 12 && bar === this._whoopBar && !menu) {
      this._whoopBar = -1;
      this.say(t, [fold(330 * st(this.key), 500)], 'oo', 'ee', spb * 4, 0.14, spb * 3, 1.12, this.music, 1);
    }
    // waiting room (title, shop, result): hats, a soft bass, a pad on each bar in the remembered zone's vowel, that
    // zone's signature at half volume, and every other 4-bar phrase a whistled 2-bar hook. Every 4th 8-bar phrase is a
    // breakdown: no bass, and the pads sing the next vowel of MENU_VOWELS (a new one each time)
    if (menu) {
      const MZ = ZONE_FLAVOR[this._menuZ] || ZONE_FLAVOR[0], brk = ((bar >> 3) & 3) === 3;
      if (i === 0 && this._softIn) { this._softIn = false; this.crash(t, 0.45); }
      if (i === 0 && (bar & 7) === 0 && brk) this._menuV++;
      if (i % 2 === 0) this.hat(t, (i % 4 === 2 ? 0.9 : 0.55) * (0.85 + Math.random() * 0.3) * 0.8);
      if (i === 14 && (bar & 1)) this.ts(t, 0.64);
      if (!brk) for (const [s, semi, len] of BASS[0]) if (s === i) this._bass(t, root * st(semi), spb * len * 0.95, 0, 0.55);
      this._signature(MZ.sig, t, i, bar, spb, 0, 0.5);
      if (i === 0) {
        let v = MZ.vowel;
        if (brk) { const j = MENU_VOWELS.indexOf(v); v = MENU_VOWELS[(Math.max(0, j) + 1 + (this._menuV % (MENU_VOWELS.length - 1))) % MENU_VOWELS.length]; }
        this._padVowel(v, t, 0.25);
        this._padChord(chord).forEach((f, j) => this._pad(f, t, spb * 16 * 0.98, 0.02, 0.2, j));
      }
      // every 4th 8-bar phrase: the theme (bars 0..3); odd ones: the old 2-bar waiting-room hook; the rest stay open
      const hb = bar & 7;
      if (((bar >> 3) & 3) === 0) {
        if (hb < 4 && THEME[hb][i] !== null) this._whistle(t, themeBase(this.key) * st(PENTA[THEME[hb][i]]), spb * (THEME_LEN[hb][i] - 0.3), null, 0.05);
      } else if (((bar >> 3) & 1) === 1 && hb < 2 && i % 2 === 0) {
        const d = MENU_HOOK[hb][i >> 1];
        if (d !== null) this._whistle(t, themeBase(this.key, 1500, HOOK_HI) * st(PENTA[d]), spb * 1.7, null, 0.05);
      }
      this._cTier = 0; this._boostTo(false, t);
      return;
    }
    if (i === 0 && this._softIn) { this._softIn = false; if (this.crashBar !== bar) this.crash(t, 0.6); }
    // the medley drop: one bar of silence (only the medley run and a reversed cymbal over it), then the band slams back in
    // on the downbeat, a key up, with a kick, a crash and a "hey!"
    if (this._gapTo >= 0) {
      if (this.stepI >= this._gapFrom && this.stepI < this._gapTo) { this._cTier = rungOf(cmb); if (i === 0) this._themeOn = false; return; }
      if (this.stepI === this._gapTo) { this.crashNext = true; this.B(t, 1.25); this.hey(t + 0.01, 1.1); }
      this._gapTo = -1;
    }
    // the egg duel's gasp: one beat of nothing at all, then a crash brings the band back
    if (this._gaspUntil > 0) {
      if (t0 < this._gaspUntil - 0.002) { this._cTier = rungOf(cmb); if (i === 0) this._themeOn = false; return; }
      this._gaspUntil = -1; if (!(i === 0 && (this.crashBar === bar || this.crashNext))) this.crash(t, 0.8);
    }
    // combo broken (or a FINISHER's drop): dry kick, everything else holds its breath
    if (t0 < this._dryUntil) { if (i % 4 === 0) this.B(t, 1.1); this._cTier = 0; this._rollAt = -1; this._boostTo(false, t); return; }
    // stem ladder: crossing a rung (combo 10, 20, 30, 45, 65, 100) rolls a 1-beat snare fill into a crash on the next beat
    const ct = rungOf(cmb);
    if (ct > this._cTier && this._rollAt < 0) { this._rollAt = this.stepI + ((4 - (i & 3)) & 3); this._rollLen = 4; }
    this._cTier = ct;
    this._boostTo(ct >= 6, t);   // rung 100: +1.5 dB on the whole mix
    if (i === 0) {
      if (this.crashBar === bar || this.crashNext) { this.crash(t, 1); this.crashNext = false; }
      this.curFill = -1;
      if (this.fillBar === bar || (this.fillBar < bar && (pb === 7 || (L === 2 && pb === 3)))) {
        this.curFill = this.fillN++ % FILLS.length;
        if (this.fillBar === bar) this.barBase = bar + 1;
        this.crashBar = bar + 1; this.fillBar = -1;
      }
      // the theme is rationed so it stays special: the full 4 bars open only the launch, the sea and the egg (THEME_ZONES,
      // from the first phrase start after the zone began); every other zone opens with the answer bar alone (THEME[1]),
      // then seeded variations of it, a new one every phrase
      if (pb === 0 && this._themePend) { this._themePend = false; this._themeAt = bar; }
      const tb = bar - this._themeAt, full = THEME_ZONES.includes(this._zone);
      this._themeOn = Audio.hookBar(this._zone, tb) >= 0;
      this._hookBar = full ? tb : 1;
      if (this._themeOn) { this.motif = THEME[this._hookBar]; this._hatDuck = Math.max(this._hatDuck, t0 + 16 * spb - 0.005); }   // the hats sit back under the hook
      else if (pb === 0 || !this.motif || tb === 4 || (!full && tb === 1)) this._newMotif();
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
      // L1 and L2 play the zone's own kick (and snare) pattern when it has one (ZONE_FLAVOR.kick); L0 keeps the shared one
      const zg = L >= 1 && Z.kickP ? Z : null;
      if (zg ? zg.kickP[i] : KICK[L][bar & 1][i]) { this.B(t, i === 0 ? 1 : zg && zg.sig === 'heart' && (i & 7) === 1 ? 0.7 : 0.85); if (ct >= 4) this._padPump(t); }   // the egg's "lub-DUB"
      else if (zg && L === 2 && (bar & 1) && i === 14 && !zg.kickP[15]) this.B(t, 0.7);   // L2: a pickup into every other bar
      else if (!zg && Z.sig === 'heart' && i % 4 === 0 && this._bedT() <= 0.02) this.B(t, 0.75);   // the egg: a heartbeat kick on every quarter (the tension bed replaces it)
      if (zg && zg.snareP ? zg.snareP[i] : i === 4 || i === 12) this.Pf(t, 1);
      if (L >= 1 && (bar & 1) && i === 14) this.Kin(t, 0.8);
      if (L === 2 && i === 6 && (bar & 1) === 0) this.Kin(t, 0.6);
      if (L === 2 && i === 15 && (bar & 3) === 3) this.Pf(t, 0.5);
      if (L === 1 && (i === 7 || i === 9) && ((bar + i) & 1)) this.rim(t, 0.6);
      if (L === 2 && (i === 3 || i === 7 || i === 11)) this.rim(t, 0.5);
      // hats
      const acc = (i % 4 === 2) ? 1.3 : (i % 2 === 0 ? 1 : 0.6);
      const hv = acc * (0.85 + Math.random() * 0.3);
      if (L === 0) { if (i % 2 === 0) this.hat(t, hv); if (i === 14 && (bar & 1)) this.ts(t, 1); }
      else if (L === 1) { if (i === 2 || i === 10 || (Z.ts8 && (i & 3) === 2)) this.ts(t, 1); else this.hat(t, hv); }   // the rapids: ts on every off-8th
      else { if (i % 4 === 2) this.ts(t, 1.1); else this.hat(t, hv * 1.1); }
      if (hot && L < 2 && i === 6) this.ts(t, 0.8);
      // stem ladder 1 (combo 6): hats double up into 32nds
      if (cmb >= 6) { if (L === 0 && (i & 1)) this.hat(t, 0.6); else if (i % 2 === 0) this.hat(t + spb * 0.5, 0.6, M, 1); }
      if (this._hypeX > 0.3 && L >= 1 && (i & 1)) this.ts(t, 0.15 + 0.35 * this._hypeX);   // hype(): a passing spree's shaker
      this._signature(Z.sig, t, i, bar, spb, L);
      if (ct >= 4 && i % 4 === 2) this._clap(t, i === 6 || i === 14 ? 1 : 0.8);   // rung 45: off-beat clap stabs
    }
    // bass hum (stem ladder 2, combo 15: the busier bass line)
    if (!stop && !half) {
      const bl = cmb >= 15 ? Math.min(2, L + 1) : L;
      for (const [s, semi, len] of BASS[bl]) if (s === i) this._bass(t, root * st(semi), spb * len * 0.95, bl);
      if (ct >= 5 && !this._slow) this._bassUp(t, i, root, spb);   // rung 65: the octave bass on the off-16ths
    } else if (half && i === 0) this._bass(t, root, spb * 7, 0);
    if (this._tsLvl || drop) this._streakLayers(t, t0, i, spb, root, cmb >= 15 ? Math.min(2, L + 1) : L, stop || half);
    // choir pads on the downbeat in the zone's vowel (the 4th bar opens up), wah stabs on the offbeats in FRENZY
    if (i === 0 && this.curFill !== 2) {
      const vol = L === 0 ? 0.028 : L === 1 ? 0.04 : 0.032;
      this._padVowel((pb & 3) === 3 ? (Z.vowel === 'ah' ? 'oh' : 'ah') : Z.vowel, t, 0.25);
      this._padChord(chord).forEach((f, j) => this._pad(f, t, spb * 16 * 0.98, vol, 0.12, j));
    }
    if (!stop && fz && ((L === 2 && (i === 6 || i === 14)) || (L === 1 && hot && i === 14))) {
      this._vowel(this.stabBank, 'oo', t, 0.004); this._vowel(this.stabBank, 'ah', t + 0.03, 0.08);
      for (let k = 1; k < 3; k++) { let f = 220 * st(this.key + chord[k]); while (f > 520) f /= 2; while (f < 260) f *= 2; this._sing(this.stabBank, f, t, 0.16, 0.06, 0.01); }
    }
    // the whistled lead in frenzy; stem ladder 3 (combo 25): a chopped vocal lead
    if (!stop && this.motif && this.motif[i] !== null) {
      // one octave for the whole line: the theme's own (degree 7 under 1500 Hz), a variation's from its own top degree
      const s = PENTA[this.motif[i]], hi = this._motifHi();
      const tl = this._themeOn ? THEME_LEN[this._hookBar] : null;
      if (tl) { const ln = tl[i]; this._whistle(t, themeAnchor(this.key) * st(s), spb * (ln - 0.3), s, 0.08, true, ln >= 2); }
      else if (fz && L === 2) this._whistle(t, themeAnchor(this.key, 1500, hi) * st(s), spb * 1.7, s);
      if (bNote && !stop) this._pluck(t, themeAnchor(this.key, 1100, hi) * st(s), 0.05, M, 0);
      if (blazing && i % 2 === 0) {
        let f = 220 * st(this.key + s); while (f > 440) f /= 2;
        this.say(t, [f], 'ah', i % 4 ? 'eh' : 'oh', spb * 1.3, 0.16, 0.05, 1, M, 0);
      }
    }
    if (ct >= 6 && !stop && !this._slow && (bar & 1) === 1) this._adlib(t, i, spb);   // rung 100: an ad-lib chop every 2 bars
  }
  // the pads' voicing for this bar (see padVoices): voice-led from the last bar's, transposed by the key change first, so a
  // lift (or a new zone) moves every voice up by exactly its semitones; a held key settles the voices back under PAD_MID
  _padChord(chord) {
    const k = this.key, prev = this._padV, d = prev ? k - this._padK : 0;
    let v;
    if (d > 0 && d <= 5) v = padVoices(chord, this._padK, prev).map((f) => f * st(d));   // voice-led in the old key, then lifted whole
    else v = padVoices(chord, k, prev ? prev.map((f) => f * st(d)) : null, d > 0 ? PAD_HI : PAD_MID);
    this._padV = v; this._padK = k;
    return v;
  }
  // rung 45: the pads duck to 0.5 on a kick and swell back (0.8 in calm mode, no pumping)
  _padPump(t) {
    if (!this.padSc) return;
    const g = this.padSc.gain;
    g.setTargetAtTime(this.calm ? 0.8 : 0.5, t, 0.004); g.setTargetAtTime(1, t + 0.04, 0.07);
  }
  // ------------------------------------------------------------------ trick streak layers
  // a trickStreak (ev.n) builds the groove toward a drop through tsBus, one layer per streak step: streak 1 a hi-hat 16th
  // roll (each beat swelling into the next), 2 adds the bass an octave up through a lowpass rising 300 -> 3200 Hz over
  // every bar, 3+ adds a clap and a "hey!" on beats 2 and 4. A 'medley' (see _medleyDrop) pays it off: one bar of silence,
  // then the whole band a key up, every layer on, until FRENZY ends or the streak resets. Each trickStreak holds the layers
  // TS_HOLD s (TRICK_STREAK_T, 13 s); with no new trick by then a TS_STOP (180 ms) tape stop takes the stem bus down.
  // comboBreak cuts them at once (_streakCut: the scratch is the shatter); sfx('streakEnd') fades them over 400 ms
  // (_streakFade). Every voice here is low priority (the voice cap drops them first)
  _streakOn(n, now) {
    this._tsLvl = Math.min(3, Math.max(1, n | 0)); this._tsUntil = now + TS_HOLD;
    if (this._tsStopAt >= 0 || (this.tsBus && this.tsBus.gain.value < 0.99)) this._tsOpen(now);
  }
  // the stem bus back to full, now (cancels a tape stop or a cut still running)
  _tsOpen(now) {
    this._tsStopAt = -1; if (!this.tsBus) return;
    const g = this.tsBus.gain, f = this.tsLp.frequency;
    g.cancelScheduledValues(now); g.setValueAtTime(1, now); f.cancelScheduledValues(now); f.setValueAtTime(18000, now);
  }
  _streakCut(now) {
    this._dropEnd(true);
    if (!this._tsLvl && this._tsStopAt < 0) return;
    this._tsLvl = 0; this._tsUntil = -1; this._tsStopAt = -1;
    if (!this.tsBus) return;
    // whatever the scheduler already built (up to LOOK ahead) is muted with the rest, then the bus comes back silently
    const g = this.tsBus.gain; hold(g, now); g.setTargetAtTime(0, now, 0.008); g.setValueAtTime(0, now + LOOK + 0.08); g.setValueAtTime(1, now + LOOK + 0.1);
  }
  // sfx('streakEnd'): the streak is over (main.js says so): the layers (and a medley drop) fade out over 400 ms
  _streakFade(now) {
    this._dropEnd(true);
    if (!this._tsLvl) return;
    this._tsLvl = 0; this._tsUntil = -1; this._tsStopAt = -1;
    if (!this.tsBus) return;
    const g = this.tsBus.gain, e = now + 0.4, back = Math.max(e, now + LOOK) + 0.05;
    hold(g, now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, e);
    g.setValueAtTime(0.0001, back); g.setValueAtTime(1, back + 0.02);   // the bus comes back silently for the next streak
  }
  // rekey: also bring the key back down (callers that reset the whole song, like newRun, do that themselves)
  _streakReset(rekey = false) {
    this._tsLvl = 0; this._tsUntil = -1;
    if (rekey) this._dropEnd(true); else { this._dropOn = false; this._dlift = 0; this._gapFrom = -1; this._gapTo = -1; this._dropT = -1; }
    if (this.ctx) this._tsOpen(this.ctx.currentTime); else this._tsStopAt = -1;
  }
  // a 'medley' (mk: the medley number, 1, 2, 3...): one bar of silence from the first 16th not yet scheduled (at least 12
  // sixteenths, to the downbeat after them), then the drop: the full L2 band with the FRENZY lead and every streak layer,
  // up mk semitones (1..MK_TOP: the medley's own run sings in that key over the silence). A second medley during a drop only
  // lifts it. Returns false when the beat is not running (nothing to drop)
  _medleyDrop(now, mk) {
    const up = Math.max(1, Math.min(MK_TOP, (+mk | 0) || 1)), sp = 60 / this._bpm / 4;
    if (!this.ctx || !this.on || this._menu(this._int) || this._holdUntil || !gridOk(this.next, now, sp)) return false;
    if (this._dropOn) { const ch = up > this._dlift; if (ch) this._dlift = up; this._rekey(ch); return true; }
    const s0 = this.stepI, to = Math.ceil((s0 + 12) / 16) * 16;
    this._gapFrom = s0; this._gapTo = to; this._dropT = this.next + (to - s0) * sp;
    this._dropOn = true; this._dlift = up; this._dropBar = to >> 4;
    this._rekey(); if (this._keyNext !== null) this._keyBar = this._dropBar;   // the new key lands with the drop
    this._applyInt();
    return true;
  }
  // the drop is over (FRENZY ended, the streak reset or was cut): the key comes back down on the next downbeat
  _dropEnd(rekey) {
    const was = this._dropOn;
    this._dropOn = false; this._gapFrom = -1; this._gapTo = -1; this._dropT = -1;
    if (this._dlift) { this._dlift = 0; if (rekey) this._rekey(); }
    if (was) this._applyInt();
  }
  _streakLayers(t, t0, i, spb, root, bl, quiet) {
    const B = this.tsBus; if (!B) return;
    if (this._tsLvl && t0 >= this._tsUntil) { this._tapeStop(t0, root); return; }
    if (quiet || this._slow) return;
    const lv = this._dropOn ? 3 : this._tsLvl;
    // 1: the 16th hat roll, every beat swelling into the next
    this.hat(t, 0.3 + 0.12 * (i & 3) + (lv >= 3 ? 0.08 : 0), B, i & 1);
    // 2: the bass an octave up through a lowpass that rises over the bar
    if (lv >= 2) {
      if (i === 0 && this.tsBassLp) { const p = this.tsBassLp.frequency; hold(p, t); p.setValueAtTime(300, t); p.exponentialRampToValueAtTime(3200, t + 16 * spb - 0.01); }
      for (const [s, semi, len] of BASS[bl]) {
        if (s !== i || this.live > this._cap) continue;
        const c = this.ctx, o = c.createOscillator(), g = c.createGain(), d = spb * len * 0.9;
        o.type = 'sawtooth'; o.frequency.value = root * st(semi) * 2;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.008); g.gain.setValueAtTime(0.07, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(this.tsBassLp); this._go(o, t, t + d + 0.02);
      }
    }
    // 3: a clap and a "hey!" on beats 2 and 4
    if (lv >= 3 && (i === 4 || i === 12)) {
      this._clap(t, 0.9, B);
      if (this.live <= this._cap - 8) this.say(t + 0.01, [196 * st(this.key)], 'eh', 'ay', 0.2, 0.16, 0.1, 0.88, B, 0);
    }
  }
  // the hold ran out: a 180 ms tape stop from t0 (the stem bus's lowpass falls to 150 Hz and its gain to 0, under a
  // sagging whirr and a hiss that wind down with it), then the bus resets silently for the next streak
  _tapeStop(t0, root) {
    const B = this.tsBus; this._tsLvl = 0; this._tsUntil = -1; this._tsStopAt = t0;
    this._dropEnd(true);
    const g = B.gain, f = this.tsLp.frequency, e = t0 + TS_STOP;
    g.cancelScheduledValues(t0); g.setValueAtTime(1, t0); g.linearRampToValueAtTime(0.0001, e);
    f.cancelScheduledValues(t0); f.setValueAtTime(18000, t0); f.exponentialRampToValueAtTime(150, e);
    g.setValueAtTime(1, e + 0.02); f.setValueAtTime(18000, e + 0.02);
    this.tone('sawtooth', root * 2, root / 4, t0, TS_STOP, 0.07, B, 0.003, 0, 0);
    this.hum(t0, TS_STOP, 0.08, 'bandpass', 2400, 1.4, B, 200, 0.003, 0);
  }
  // a mouth clap: three tight bandpassed noise bursts (the hands) and a short tail, low priority
  _clap(t, v, M = this.music) {
    if (this.live > this._cap - 8) return;
    for (let j = 0; j < 3; j++) this.hum(t + j * 0.009, 0.006, 0.16 * v, 'bandpass', 1300 + 250 * j, 1.6, M, 0, 0.001, 0);
    this.hum(t + 0.027, 0.07, 0.12 * v, 'bandpass', 1600, 1.2, M, 0, 0.002, 0);
  }
  // rung 65: the bass an octave up on every off-16th, through a lowpass that opens 800 -> 3000 Hz over the bar
  _bassUp(t, i, root, spb) {
    const lp = this.bassUp; if (!lp) return;
    if (i === 0) { const p = lp.frequency; p.setValueAtTime(800, t); p.exponentialRampToValueAtTime(3000, t + 16 * spb - 0.01); }
    if (!(i & 1) || this.live > this._cap) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), d = spb * 0.8;
    o.type = 'sawtooth'; o.frequency.value = root * 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(lp); this._go(o, t, t + d + 0.02);
  }
  // rung 100: a beatboxed ad-lib on odd bars: "yeah" on beat 3, chopped into a stutter "ya-ya" on its last 8th
  _adlib(t, i, spb) {
    if (i !== 8 && i !== 14 && i !== 15) return;
    let f = 220 * st(this.key); while (f > 330) f /= 2;
    const M = this.music;
    if (i === 8) this.say(t, [f * 1.5], 'eh', 'ay', spb * 2.2, 0.14, 0.06, 0.92, M, 0);
    else this.say(t, [f * (i === 14 ? 1.5 : 2)], 'ah', 'ah', spb * 0.7, 0.11, 0.02, 1, M, 0);
  }
  // one signature sound per zone, on top of the groove (all low priority, all on the music bus)
  // v: a level for the whole signature (the waiting room plays it at 0.5)
  _signature(sig, t, i, bar, spb, L, v = 1) {
    const M = this.music;
    switch (sig) {
      case 'rim': if (i === 3 || i === 11) this.rim(t, 0.55 * v); break;   // launch tube: a rim ostinato
      case 'bubble':                                                   // acid lagoon: a bloop rising out of the puddle
        if (i === 10 || (L >= 1 && i === 13 && (bar & 1))) { const f = fold(440 * st(this.key + pen(3 + ((bar * 3 + i) % 5))), 1200); this.tone('sine', f * 0.6, f, t, 0.06, 0.05 * v, M, 0.004, 0.04, 0); }
        break;
      case 'goo': if (i === 15 && (bar & 1) === 0) this.tom(t, 98 * st(this.key % 12), 0.5 * v); break;   // gate of goo: a sticky low tom pickup
      case 'wave': if (i === 0 && (bar & 1) === 0) this.hum(t, spb * 14, 0.05 * v, 'lowpass', 260, 1.5, M, 1300, spb * 7, 0); break;   // womb sea: a wave washes in
      case 'heart': if (i % 4 === 0 && this._tension <= 0.02) this.tone('triangle', 300, 180, t + spb * 0.75, 0.05, 0.12 * v, M, 0.003, 0, 0); break;   // egg: the "dub"
      // the fork (half time) and the rapids (pad tremolo, see _applyTrem) live in the groove itself; in the waiting room
      // the fork's walk-in becomes a soft tom pickup into every other bar
      case 'fork': if (v < 1 && i === 14 && (bar & 1)) this.tom(t, 130 * st(this.key % 12), 0.6 * v); break;
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
    // the octave-up saw (0.35x the hum, 1.2 kHz lowpass, past the bass filter): the bass line a phone speaker can play
    if (this.bassHi && this.live <= this._cap) {
      const o3 = c.createOscillator(), g3 = c.createGain(), v3 = v * BASS_HI;
      o3.type = 'sawtooth'; o3.frequency.value = f * 2;
      g3.gain.setValueAtTime(0.0001, t); g3.gain.exponentialRampToValueAtTime(v3, t + 0.012);
      g3.gain.setValueAtTime(v3, t + dur * 0.7); g3.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
      o3.connect(g3); g3.connect(this.bassHi); this._go(o3, t, t + dur + 0.06);
    }
  }
  // hook: the theme's whistle (louder, a triangle partial an octave up at 0.25x, and on notes of 2+ sixteenths a
  // 5.5 Hz +-12 cent vibrato fading in after 0.12 s), so the theme is the loudest melodic moment of each zone
  _whistle(t, f, dur, s = null, vol = 0.07, hook = false, vib = false) {
    const L = this.leadBus || this.music;
    if (s !== null && this._fixRel(s)) { f *= st(1); s += 1; }   // G to G# under an E chord (see _chordFix)
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
    if (o && this._ftier >= 2 && s !== null) { const f2 = f * st(this._third(s) - s); this.tone('sine', f2 * 0.94, f2, t, dur, 0.045, L, 0.015, 0.04, 0); }
  }
  // the current motif's highest PENTA semitone (cached per motif), so a variation gets one octave for all of its notes
  _motifHi() {
    const m = this.motif; if (!m) return 17;
    if (this._mhiOf !== m) { this._mhiOf = m; this._mhi = lineHi(m) || 17; }
    return this._mhi;
  }
  // a combo note over the theme's first 4 bars: the whistle dips to 0.55 for 90 ms at q so the ladder never masks the hook.
  // In FRENZY (any tier) the whistled lead shares the ladder's register too, so it dips to 0.5 for the same 90 ms
  _leadDip(q) {
    if (!this.leadBus || (!this._themeOn && !(this._ftier > 0))) return;
    const g = this.leadBus.gain;
    g.cancelScheduledValues(q); g.setTargetAtTime(this._themeOn ? 0.55 : 0.5, q, 0.004); g.setTargetAtTime(1, q + 0.09, 0.03);
  }
  // FRENZY with a combo of 10+: each link carves a 70 ms, 2.5 dB dip into the music bus's 3 kHz presence peak (5 -> 2.5 dB)
  // at its grid time q, at most once per 16th, so the ladder's attack is not buried under the hottest groove
  _presDip(q, n) {
    if (!(this._ftier > 0) || n < 10 || !this._mPres) return;
    const spb = 60 / this._bpm / 4; if (q - this._presT < spb * 0.9 && q >= this._presT) return;
    this._presT = q; const g = this._mPres.gain;
    g.cancelScheduledValues(q); g.setTargetAtTime(PRES_DB - PRES_DIP, q, 0.006); g.setTargetAtTime(PRES_DB, q + 0.07, 0.02);
  }
  // the egg duel's ostinato on each bar's downbeat, on the music bus: a leading rival's motif at 0.35x, or, when
  // Kevin leads, the theme's first 4 notes in brass, one pentatonic step higher on every retake
  _duelBar(t, spb) {
    const k = this._duelK, base = this.fx, g = this._gain(1, this.music);
    this.fx = g;
    try {
      if (k === -1) {
        const up = Math.max(0, this._leadN - 1), db = themeBase(this.key, 900, pen(7 + up)); let j = 0;   // one octave for the 4 notes
        for (let s = 0; s < 16 && j < 4; s++) {
          const d = THEME[0][s]; if (d === null) continue;
          const f = db * st(pen(d + up));
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
  _scaleF(n, base, key = this.key) { return this._runBase(n, base, key) * st(this._chordFix(key + pen(ladderDegree(n)), key)); }
  // the E major chords (zones 3, 4 and 7: a chord holding pitch class 11, G#) clash with the pentatonic's G natural. While
  // one sounds, a note on G (10 semitones over the key root) moves up to G#. The ladder still climbs (E, G#, A: see
  // _ladderCheck). rel: semitones over the key root; this.chord is the chord the groove is singing
  _fixRel(rel) {
    const ch = this.chord; if (!ch || (((rel % 12) + 12) % 12) !== 10) return false;
    for (let j = 0; j < ch.length; j++) if (((ch[j] % 12) + 12) % 12 === 11) return true;
    return false;
  }
  _chordFix(semi, key = this.key) { return this._fixRel(semi - key) ? semi + 1 : semi; }
  // the next pentatonic note above f in key K (G# under an E chord, like every tonal note): a weave's second step
  _penNext(f, K = this.key) {
    const s0 = 12 * Math.log2(f / 440) - K, o = Math.floor(s0 / 12);
    for (let oo = o; oo <= o + 1; oo++) for (const p of PENTA12) {
      const semi = 12 * oo + p; if (semi <= s0 + 0.6) continue;
      return 440 * st(K + semi) * (this._fixRel(semi) ? st(1) : 1);
    }
    return f;
  }
  // a diatonic third above s (semitones over the key root), moved onto G# under an E chord like _chordFix
  _third(s) { const r = third(s); return this._fixRel(r) ? r + 1 : r; }
  // inKey (the nearest pentatonic note in key), moved onto G# under an E chord: every tonal sfx picks its pitch here
  _inKey(f, key = this.key) { const g = inKey(f, key), s = Math.round(12 * Math.log2(g / 440)); return this._fixRel(s - key) ? g * st(1) : g; }
  // the base frequency for link n's run of 10: halved until the run's top note (its 10th link: the start degree can step
  // up inside the run at link 65) fits under 1760 Hz
  _runBase(n, base, key = this.key) {
    n = Math.max(0, n | 0);
    // the run's top note one semitone higher when it sits on G: an E chord may move it to G# (_chordFix), and the octave
    // must not depend on the chord, or a run could fold mid-way when the chord changes under it
    let top = pen(ladderDegree(n - (n % 10) + 9)); if (top % 12 === 10) top++;
    let b = base; while (b * st(key + top) > 1760 && b > 20) b /= 2;
    return b;
  }
  // every climbing figure picks its octave once, from its top note (like themeBase and _runBase), and then plays each note
  // as base * st(step): a per-note fold dropped the figure an octave mid-climb in the high keys (see _figureCheck)
  _clBase(K) { let b = 880 * st(K); while (b * st(CL_TOP) > 1760) b /= 2; return b; }                 // comboLow's alarm
  _shoutBase(K) { let b = 220 * st(K); while (b * st(12) > 660) b /= 2; return b; }                   // 'combo''s shout
  _trickBase(base, K, d0) { let b = base; while (b * st(K + pen(d0 + 4)) > 1760 && b > 20) b /= 2; return b; }   // a trick arpeggio
  _dominoBase(f0, m) { let b = f0; while (b * st(pen(Math.max(0, m - 1))) > 2400 && b > 20) b /= 2; return b; }   // domino pins
  _rerollBase(K) { let b = 880 * st(K); while (b * st(12) > 1800) b /= 2; return b; }                // reroll's ticks
  // dev-only self-check: inside every run of 10 the ladder strictly climbs, for keys 0..14 and both bases the game
  // uses (220 pass/drill, 440 link). Returns the failures ([] when the ladder is sound). Run by hand in node:
  //   node -e "import('./million_to_one/audio.js').then(m => console.log(m.Audio._ladderCheck()))"
  static _ladderCheck() {
    const a = new Audio(), bad = [];
    for (const ch of [PROG[0], [7, 11, 14], [-5, -1, 2]]) for (let key = 0; key <= 14; key++) {
      a.chord = ch;   // Am, and the two E major voicings (_chordFix moves G to G# under them)
      for (const base of [220, 440]) {
        for (let n = 0; n < 99; n++) {
          if (n % 10 === 9) continue;   // the end of a run: the ladder resets there on purpose
          const f0 = a._scaleF(n, base, key), f1 = a._scaleF(n + 1, base, key);
          if (!(f1 > f0) || f1 > 1760 * 1.0001) bad.push({ key, base, n, f0, f1, ch });
        }
      }
    }
    return bad;
  }
  // dev-only self-check, like _ladderCheck: every climbing figure (comboLow's alarm, the combo shout, a trick's arpeggio and
  // its trickStreak replay, the domino pins, the reroll ticks) rises strictly and stays under its ceiling for keys 0..12,
  // under the Am and the E major chords. Returns the failures ([] when every figure climbs). Run by hand in node:
  //   node -e "import('./million_to_one/audio.js').then(m => console.log(m.Audio._figureCheck()))"
  static _figureCheck() {
    const a = new Audio(), bad = [], up = (fs) => fs.every((f, j) => j === 0 || f > fs[j - 1] * 1.0001);
    const chk = (tag, key, fs, top) => { if (!up(fs) || Math.max(...fs) > top * 1.0001) bad.push({ tag, key, fs: fs.map((f) => Math.round(f)) }); };
    const seq = (n, fn) => Array.from({ length: n }, (_, j) => fn(j));
    for (const ch of [PROG[0], [7, 11, 14]]) for (let key = 0; key <= 12; key++) {
      a.chord = ch;
      chk('comboLow', key, seq(7, (n) => a._clBase(key) * st(n <= 4 ? n : Math.min(CL_TOP, penD(n - 3)))), 1760);
      chk('combo', key, seq(6, (d) => a._shoutBase(key) * st(pen(d))), 660);
      chk('reroll', key, seq(6, (j) => a._rerollBase(key) * st(a._chordFix(key + pen(j), key) - key)), 1800);
      for (let n = 0; n < 100; n++) {
        const d0 = ladderDegree(n), b = a._trickBase(a._runBase(n, 440, key), key, d0);
        chk('trick', key, seq(3, (j) => b * st(key + pen(d0 + 2 * j))), 1760);
        for (let s = 1; s <= 8; s++) { const sb = a._trickBase(b * st(5 * s), key, d0); chk('trickStreak', key, seq(3, (j) => sb * st(key + pen(d0 + 2 * j))), 1760); }
        for (let m = 2; m <= 6; m++) { const f0 = a._dominoBase(a._scaleF(n, 440, key), m); chk('domino', key, seq(m, (j) => f0 * st(pen(j))), 2400); }
      }
    }
    return bad;
  }
  // the key climb is heard climbing: for every key 0..12 and every rise the song makes (a zone, n -> n + 1, with the next
  // zone's progression, and every lift of 1..5 semitones), the theme's base, the bass root of every chord root the
  // progressions use and the mean pad pitch (voice-led from a real voicing: two passes of a progression first) never go
  // down; keyTarget stays at or under KEY_TOP and never falls zone to zone. Returns { ok, fails } (fails: short strings).
  //   node -e "import('./million_to_one/audio.js').then(m => console.log(m.Audio._climbCheck()))"
  static _climbCheck() {
    const fails = [], E = 1e-6, mean = (v) => v.reduce((x, y) => x + y, 0) / v.length;
    const progs = [PROG, MAJ_PROG, ...ZONE_FLAVOR.map((z) => z.prog || PROG)];
    const roots = [...new Set(progs.flat().map((ch) => ch[0]))];
    const a = new Audio();
    const warm = (P, k) => { a._padV = null; a.key = k; for (let r = 0; r < 2; r++) for (const ch of P) a._padChord(ch); return { v: a._padV, k }; };
    const lifted = (S, ch, k) => { a._padV = S.v; a._padK = S.k; a.key = k; return mean(a._padChord(ch)); };
    const rise = (k0, d, Pfrom, Pto, tag) => {
      const k1 = k0 + d;
      if (!(themeAnchor(k1) >= themeAnchor(k0) - E)) fails.push(tag + ' theme ' + k0 + '->' + k1);
      for (const c of roots) if (!(bassRoot(k1, c) >= bassRoot(k0, c) - E)) fails.push(tag + ' bass ' + c + ' ' + k0 + '->' + k1);
      const S = warm(Pfrom, k0);
      for (const ch of Pto) {
        const lo = lifted(S, ch, k0), hi = lifted(S, ch, k1);
        if (!(hi >= lo - E)) fails.push(tag + ' pads ' + ch.join('/') + ' ' + k0 + '->' + k1 + ' (' + lo.toFixed(1) + ' > ' + hi.toFixed(1) + ')');
        const v = a._padV; if (v.some((f) => f < PAD_LO * 0.999 || f > PAD_HI * 1.001)) fails.push(tag + ' pads out of range ' + v.map((f) => f.toFixed(0)).join('/'));
      }
    };
    for (let k = 0; k <= KEY_TOP; k++) for (let d = 1; d <= 5 && k + d <= KEY_TOP; d++) for (const P of progs) rise(k, d, P, P, 'lift');
    for (let z = 0; z + 1 < ZONE_KEY.length; z++) {
      const d = ZONE_KEY[z + 1] - ZONE_KEY[z], P0 = ZONE_FLAVOR[z].prog || PROG, P1 = ZONE_FLAVOR[z + 1].prog || PROG;
      if (!(d >= 0)) fails.push('zone key ' + z + '->' + (z + 1));
      for (let k = ZONE_KEY[z]; k + d <= KEY_TOP; k++) rise(k, d, P0, P1, 'zone ' + z);
    }
    for (const lifts of [[0, 0, 0, 0], [1, 5, 2, 2], [1, 2, 0, 0], [0, 5, 0, 2]]) {
      let last = -1;
      for (let z = 0; z < ZONE_KEY.length; z++) {
        a._zone = z; [a._lift, a._mlift, a._tlift, a._elift] = lifts; const kt = a.keyTarget;
        if (kt > KEY_TOP || kt < last) fails.push('keyTarget zone ' + z + ' lifts ' + lifts.join('/') + ': ' + kt);
        last = kt;
      }
    }
    return { ok: fails.length === 0, fails: fails.slice(0, 40) };
  }
  // round 5's audio rules, on a recording stand-in for an AudioContext (node, no audio). Returns:
  //   climb: _climbCheck().ok; zoneKey: ZONE_KEY joined ('0,1,2,3,4,5,7'); keyTop: keyTarget with every lift piled on (12)
  //   outLat: { read, base, clamp, cached, leads, pulse, lock }: 0.1 read from outputLatency, 0.02 from baseLatency alone,
  //     0.6 clamped to 0.25, a change ignored for under 1 s then read, eggLead / lastSnapLead / finisherLead(0) each 0.1 over
  //     their scheduled values, a kick 50 ms ago not yet heard (pulse 0) with 0.1 s of latency, and the beat lock scheduling the
  //     next 16th earlier with latency than without (lock > 0: seconds earlier)
  //   hehe: { fifth, sixth, cooldown, after, zoneCap, newZone, sylls, bases, oofCuts }: the 5th quick pass quiet, the 6th
  //     giggles, 6 more within the 6 s cooldown quiet, a burst after it giggles, the 4th giggle of a run quiet in the same
  //     zone and heard in the next, syllable counts and base pitches seen over 40 giggles, an 'oof' cutting a pending giggle
  //   bonk: { sineEnd, triStart, triEnd, vowel }: 110, 560, 220, 190; bumpTri / swatTri: their octave-up triangles (Hz)
  //   lift: { plain, up, mid, down, inKey, sub, frenzyEnd }: a link tail with no lift, with linkLift(2, 1) after 0.1 s (higher),
  //     40 ms into the glide (between), 0.15 s into the 0.3 s glide back down (between), every lifted tail in key, the
  //     tier 4 sub-octave sine (f / 2), and sfx('frenzyEnd') clearing the lift
  //   groove: { kicks, snares, l0, swing }: per zone at L1 the kick steps (as an 'x.' string), the goo's snare steps, zone 1
  //     at L0 (the shared pattern), and the fork's swing at L1 / L2 in 16ths (0.10, 0.035)
  //   rank: { tick, land }: rankTick k 0 / 1 pluck pitches (220, 880), rankLand tiers 3..0: [saws, kicks] built
  static _round5Facts() {
    const oscs = [], srcs = [], gains = [], filt = [];
    const param = (v) => ({ value: v, ev: [], setValueAtTime(x, t) { this.ev.push([t, x]); }, exponentialRampToValueAtTime(x, t) { this.ev.push([t, x]); },
      linearRampToValueAtTime(x, t) { this.ev.push([t, x]); }, setTargetAtTime(x, t) { this.ev.push([t, x]); this.value = x; }, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(1), frequency: param(440), Q: param(1), detune: param(0), playbackRate: param(1), pan: param(0), type: '' });
    const ctx = { currentTime: 1, state: 'running', sampleRate: 44100, createStereoPanner: node,
      createGain: () => { const g = node(); gains.push(g); return g; }, createBiquadFilter: () => { const f = node(); filt.push(f); return f; },
      createBufferSource: () => { const b = node(); srcs.push(b); return b; }, createOscillator: () => { const o = node(); oscs.push(o); return o; } };
    const mk = () => { const a = new Audio(); a._hasSession = () => false; a.ctx = ctx; a._cap = 1e9; a.fx = node(); a.fxEcho = node(); a.music = node(); a.tlp = node(); a.mlp = node(); a.slp = node(); a.mduck = node(); a.echo = node(); return a; };
    const clear = () => { oscs.length = 0; srcs.length = 0; gains.length = 0; filt.length = 0; };
    const run = (a, name, k, dt = 1) => { ctx.currentTime += dt; clear(); a.sfx(name, k); return oscs.slice(); };
    const first = (p) => (p.ev.length ? p.ev[0][1] : p.value), last = (p) => (p.ev.length ? p.ev[p.ev.length - 1][1] : p.value);
    const saws = (list) => list.filter((o) => o.type === 'sawtooth').length;
    const r1 = (x) => Math.round(x * 10) / 10, r3 = (x) => Math.round(x * 1000) / 1000;
    // the climb
    const kt = mk(); kt._zone = 6; kt._lift = 1; kt._mlift = 5; kt._tlift = 2; kt._elift = 2;
    const climb = Audio._climbCheck().ok, zoneKey = ZONE_KEY.join(), keyTop = kt.keyTarget;
    // output latency
    const L = mk(), lc = { ...ctx, outputLatency: 0.1, baseLatency: 0.01 }; L.ctx = lc;
    const read = L.outLat;
    const B2 = mk(); B2.ctx = { ...ctx, baseLatency: 0.02 }; const base = B2.outLat;
    const C2 = mk(); C2.ctx = { ...ctx, outputLatency: 0.6 }; const clamp = C2.outLat;
    lc.outputLatency = 0.2; const held = L.outLat; lc.currentTime += 1.01; const cached = held === 0.1 && L.outLat === 0.2;
    lc.outputLatency = 0.1; lc.currentTime += 1.01;
    L._eggLead = 0.3; L._snapLead = 0.02;
    const leads = Math.abs(L.eggLead - 0.4) < 1e-9 && Math.abs(L.lastSnapLead - 0.12) < 1e-9 && Math.abs(L.finisherLead(0) - finisherLead(0) - 0.1) < 1e-9;
    L._kicks.fill(-99); L._kicks[0] = lc.currentTime - 0.05; const pulseLate = L.pulse;
    const Z0 = mk(); Z0._kicks.fill(-99); Z0._kicks[0] = ctx.currentTime - 0.05; const pulse = pulseLate === 0 && Z0.pulse > 0;
    const lockAt = (a, c) => { a.ctx = c; a.on = true; a._bpm = 120; a.stepI = 0; a.next = c.currentTime + 0.1; a.lockPhase(0, 120); a._lkSnap = false; a._lkHold = -1; const n0 = a.next; a._lockStep(c.currentTime); return n0 - a.next; };
    const lock = r3(lockAt(mk(), lc) - lockAt(mk(), { ...ctx, currentTime: lc.currentTime }));
    const outLat = { read, base, clamp, cached, leads, pulse, lock };
    // Kevin's giggle
    const giggled = (o) => o.some((x) => x.type === 'sawtooth');
    const burst = (a, n = 6, dt = 0.1) => { let g = false; for (let j = 0; j < n; j++) g = giggled(run(a, 'pass', 1, j ? dt : 1)) || g; return g; };
    const H = mk();
    for (let j = 0; j < 4; j++) run(H, 'pass', 1, j ? 0.1 : 1);
    const fifth = giggled(run(H, 'pass', 1, 0.1)), sixth = giggled(run(H, 'pass', 1, 0.1));
    const cooldown = burst(H), after = (ctx.currentTime += 6, burst(H));   // giggle 2
    ctx.currentTime += 7; burst(H);                                       // giggle 3: the last free one
    ctx.currentTime += 7; const zoneCap = burst(H); H._zone = 1; ctx.currentTime += 7; const newZone = burst(H);
    const sylls = new Set(), bases = new Set();
    for (let j = 0; j < 40; j++) { const G = mk(); clear(); ctx.currentTime += 1; G._kevin('hehe', ctx.currentTime, ctx.currentTime, G.fx); const sw = oscs.filter((o) => o.type === 'sawtooth'); sylls.add(sw.length); if (sw[0]) bases.add(Math.round(first(sw[0].frequency))); }
    const O = mk(); ctx.currentTime += 1; for (let j = 0; j < 5; j++) run(O, 'pass', 1, j ? 0.1 : 1);
    ctx.currentTime += 0.1; clear(); O.sfx('pass', 1); const gg = O._heheG; ctx.currentTime += 0.02; O._kevin('oof', ctx.currentTime, ctx.currentTime, O.fx);
    const oofCuts = !!gg && gg.gain.ev.some((x) => x[1] === 0) && O._heheG === null;
    const hehe = { fifth, sixth, cooldown, after, zoneCap, newZone, sylls: [...sylls].sort().join(), bases: [...bases].sort().join(), oofCuts };
    // the bonk
    const bk = run(mk(), 'bonk'), bs = bk.find((o) => o.type === 'sine'), bt = bk.find((o) => o.type === 'triangle'), bv = bk.find((o) => o.type === 'sawtooth');
    const bp = run(mk(), 'bump').find((o) => o.type === 'triangle'), sb = run(mk(), 'swatBonk').find((o) => o.type === 'triangle');
    const bonk = { sineEnd: bs ? r1(last(bs.frequency)) : 0, triStart: bt ? r1(first(bt.frequency)) : 0, triEnd: bt ? r1(last(bt.frequency)) : 0, vowel: bv ? r1(first(bv.frequency)) : 0,
      bumpTri: bp ? first(bp.frequency) : 0, swatTri: sb ? first(sb.frequency) : 0 };
    // the link lift (n 5, a pass link; the tail is the triangle that ends on its note)
    const tail = (a) => { const o = run(a, 'link', { n: 5, kind: 'pass' }, 0.001).filter((x) => x.type === 'triangle').pop(); return o ? last(o.frequency) : 0; };
    const LL = mk(); const plain = tail(LL);
    LL.linkLift(2, 1); ctx.currentTime += 0.1; const up = tail(LL);
    ctx.currentTime += 0.2; LL.linkLift(0, 0); ctx.currentTime += 0.15; const down = tail(LL);
    const LM = mk(); LM.linkLift(2, 1); ctx.currentTime += 0.039; const mid = tail(LM);   // 40 ms into the 80 ms glide: 2.5 st
    const L4 = mk(); L4.linkLift(4, 0); ctx.currentTime += 0.2; const lo = run(L4, 'link', { n: 5, kind: 'pass' }, 0.001), t4 = lo.filter((x) => x.type === 'triangle').pop();
    const sub = !!t4 && lo.some((x) => x.type === 'sine' && Math.abs(first(x.frequency) - last(t4.frequency) / 2) < 0.01);
    run(L4, 'frenzyEnd'); const frenzyEnd = L4._llTo === 0;
    const lift = { plain: r1(plain), up: r1(up), mid: r1(mid), down: r1(down), inKey: [up, mid, down].every((f) => inPenta(f, 0)) && up > plain, sub, frenzyEnd };
    // the per-zone grooves: one bar of _step with the voices recorded instead of built
    const bar = (z, I) => {
      const a = mk(), K = [], S = [], T = []; a.on = true; a._int = I; a._zone = z; a._zoneBar = -99; a.stepI = 16; a.barBase = 1; a.crashBar = -1;
      a.B = (t) => { K.push(t); }; a.Pf = (t) => { S.push(t); };
      for (const f of ['_pad', '_padVowel', '_bass', '_signature', 'hat', 'ts', 'rim', 'Kin', 'crash', '_whistle', '_pluck', 'say', '_clap', '_bassUp', '_vowel', '_sing', '_streakLayers', '_newMotif', '_duelBar']) a[f] = () => null;
      a.motif = null; a._themePend = false; a._themeAt = -99;
      const spb = 60 / a._bpm / 4, t0 = 10;
      for (let i = 0; i < 16; i++) { T.push(t0 + i * spb); a._step(t0 + i * spb); a.stepI++; }
      const steps = (L2) => T.map((t, i) => (L2.some((x) => Math.abs(x - t) < spb * 0.4) ? 'x' : '.')).join('');
      return { k: steps(K), s: steps(S), K, T, spb };
    };
    const kicks = ZONE_FLAVOR.map((_, z) => bar(z, 1).k), l0 = bar(1, 0.2).k, snares = bar(2, 1).s;
    const swingOf = (I) => { const b = bar(4, I), j = b.K.findIndex((t) => Math.abs(t - b.T[3]) < b.spb * 0.4); return j >= 0 ? r3((b.K[j] - b.T[3]) / b.spb) : -1; };
    const groove = { kicks, snares, l0, swing: [swingOf(1), swingOf(1.4)] };
    // the rank
    const rt = (k) => { const o = run(mk(), 'rankTick', k).find((x) => x.type === 'sawtooth'); return o ? r1(first(o.frequency)) : 0; };
    const land = [3, 2, 1, 0].map((k) => { const a = mk(); const o = run(a, 'rankLand', k); return [saws(o), o.filter((x) => x.type === 'sine' && first(x.frequency) === 185).length]; });
    const rank = { tick: [rt(0), rt(1)], land };
    return { climb, zoneKey, keyTop, outLat, hehe, bonk, lift, groove, rank };
  }
  // round 7's audio rules, on a recording stand-in for an AudioContext (node, no audio). Returns:
  //   tailVol: _tailVol for links 5, 12, 30, 60, 100 ([0.42, 0.42, 0.528, 0.708, 0.72])
  //   leadDip: { frenzy, plain }: the lead bus's dip level in FRENZY (0.5) and with no FRENZY and no theme (0: no dip)
  //   presDip: { two, low, calm }: presence dips from two FRENZY links (n 12) in one 16th (1), from a FRENZY link 5 (0),
  //     and outside FRENZY (0)
  //   kevin: { normalCapped, bigSpeaks, bigLouder, gap }: at CAP - 8 live sources on a stage-2 cap a 'hup' stays quiet
  //     (true) and a 'yay' speaks (true), the big line is 3 dB over the plain level, and a second big line inside KEV_GAP is quiet
  //   nooo: { sung, inDry }: comboBreak 30 sings the 360 Hz "nooo", and it starts and ends inside the dry bar
  //   yay: [bank grade 2, bank grade 3]: the 300 Hz "yay" saws (0, 1); lose: a 260 Hz "huh?" before the kazoo (true)
  //   wooo: [first frenzy, second frenzy]: 260 Hz "wooo" saws ([1, 0]: the second one says "wheee")
  //   heart: { thumps, at, box, muffledBox }: 90 Hz thumps after a win (8), the first one 1.6 s after it, the music box
  //     note (1, or 0 when muffled)
  //   release: { hurt, pay, metal, plain }: [crack sines at 1 kHz, 180 Hz thups, triangles, 1.8 kHz pings] per kind
  //   timbre: { sling, weave, snipe }: a slingshot's 0.75x -> 1.5x glide, a weave's two extra triangles (the 2nd higher,
  //     in key), a snipe's octave sine (all true)
  //   dash: { transient, sweep }: the square tick and the 220 -> 660 Hz sine (true, true)
  //   steer: { quiet, full, pan, built, rebuilt }: silent at 100 px/s, STEER_G at 800, pan 0.4 * sign, one bed, none rebuilt
  //   hype: { lift, none, gold, again, later }: hat bus gain at a pass rate of 8 (+3 dB) and 2 (1), the gold sting on a rising
  //     edge (2 triangles), none inside 4 s, one again after
  //   hum: macroHum before stage MHUM_GEN builds nothing (true)
  static _round7Facts() {
    const oscs = [], srcs = [];
    const param = (v) => ({ value: v, ev: [], setValueAtTime(x, t) { this.ev.push([t, x]); }, exponentialRampToValueAtTime(x, t) { this.ev.push([t, x]); },
      linearRampToValueAtTime(x, t) { this.ev.push([t, x]); }, setTargetAtTime(x, t) { this.ev.push([t, x]); this.value = x; }, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(1), frequency: param(440), Q: param(1), detune: param(0), playbackRate: param(1), pan: param(0), type: '' });
    const ctx = { currentTime: 1, state: 'running', sampleRate: 44100, createStereoPanner: node, createGain: node, createBiquadFilter: node,
      createBufferSource: () => { const b = node(); srcs.push(b); return b; }, createOscillator: () => { const o = node(); oscs.push(o); return o; } };
    const mk = () => { const a = new Audio(); a._hasSession = () => false; a.ctx = ctx; a._cap = 1e9; a.fx = node(); a.fxEcho = node(); a.music = node(); a.tlp = node(); a.mlp = node(); a.slp = node(); a.mduck = node(); a.echo = node(); a.leadBus = node(); a._mPres = node(); return a; };
    const clear = () => { oscs.length = 0; srcs.length = 0; };
    const run = (a, name, k, dt = 1) => { ctx.currentTime += dt; clear(); a.sfx(name, k); return oscs.slice(); };
    const first = (p) => (p.ev.length ? p.ev[0][1] : p.value), last = (p) => (p.ev.length ? p.ev[p.ev.length - 1][1] : p.value);
    const near = (x, y) => Math.abs(x - y) < 0.01 * Math.max(1, Math.abs(y));
    const sawsAt = (list, f) => list.filter((o) => o.type === 'sawtooth' && near(first(o.frequency), f)).length;
    const tailVol = [5, 12, 30, 60, 100].map((n) => Math.round(new Audio()._tailVol(n) * 1000) / 1000);
    // the lead dip and the presence dip
    const LD = mk(); LD._ftier = 1; LD._leadDip(5); const L0 = mk(); L0._leadDip(5);
    const leadDip = { frenzy: LD.leadBus.gain.ev.length ? LD.leadBus.gain.ev[0][1] : 0, plain: L0.leadBus.gain.ev.length ? L0.leadBus.gain.ev[0][1] : 0 };
    const dips = (a) => a._mPres.gain.ev.filter((e) => near(e[1], PRES_DB - PRES_DIP)).length;
    const PD = mk(); PD._ftier = 1; run(PD, 'link', { n: 12, kind: 'pass' }); ctx.currentTime += 0.02; PD.sfx('link', { n: 13, kind: 'pass' });
    const PL = mk(); PL._ftier = 1; run(PL, 'link', { n: 5, kind: 'pass' }); const PC = mk(); run(PC, 'link', { n: 12, kind: 'pass' });
    const presDip = { two: dips(PD), low: dips(PL), calm: dips(PC) };
    // Kevin's big lines
    const KC = mk(); KC.setStage(2); KC.live = KC._cap - 7; ctx.currentTime += 1; clear();
    const normalCapped = !KC._kevin('hup', ctx.currentTime, ctx.currentTime, KC.fx); ctx.currentTime += 1; clear();
    const bigSpeaks = KC._kevin('yay', ctx.currentTime, ctx.currentTime, KC.fx), bigSaws = oscs.filter((o) => o.type === 'sawtooth').length;
    ctx.currentTime += 0.1; const gap = !KC._kevin('huh', ctx.currentTime, ctx.currentTime, KC.fx);
    const kevin = { normalCapped, bigSpeaks: bigSpeaks && bigSaws === 1, bigLouder: near(KEV_BIG_G, Math.pow(10, 3 / 20)), gap };
    // nooo in the dry bar (the beat running, so the bar is really booked)
    const NB = mk(); NB.on = true; ctx.currentTime += 1; NB.next = ctx.currentTime + 0.05; NB.stepI = 16; clear(); NB.sfx('comboBreak', 30);
    const no = oscs.find((o) => o.type === 'sawtooth' && near(first(o.frequency), 360));
    const noAt = no ? no.frequency.ev[0][0] : -1, dryFrom = NB._dryUntil - 16 * 60 / NB._bpm / 4;
    const nooo = { sung: !!no, inDry: !!no && noAt >= dryFrom - 1e-6 && noAt + 0.6 <= NB._dryUntil + 1e-6 };
    const yay = [2, 3].map((g) => sawsAt(run(mk(), 'comboBank', { grade: g }), 300));
    const LS = mk(), lo = run(LS, 'lose'), huhO = lo.find((o) => o.type === 'sawtooth' && near(first(o.frequency), 260));
    const kaz = lo.filter((o) => o.type === 'sawtooth' && !near(first(o.frequency), 260)).map((o) => o.frequency.ev[0][0]);
    const lose = !!huhO && kaz.length > 0 && huhO.frequency.ev[0][0] + 0.18 <= Math.min(...kaz) + 1e-6;
    const FR = mk(), w1 = sawsAt(run(FR, 'frenzy', { tier: 1 }), 260), w2 = sawsAt(run(FR, 'frenzy', { tier: 1 }), 260);
    // the win heartbeat
    const W = mk(); ctx.currentTime += 10; const w0 = ctx.currentTime; const wo = run(W, 'win', undefined, 0), th = wo.filter((o) => o.type === 'sine' && near(first(o.frequency), 90));
    const boxF = wo.filter((o) => o.type === 'sine' && o.frequency.ev.length === 1 && first(o.frequency) > 1000 && first(o.frequency) < 4000 && o.frequency.ev[0][0] > w0 + 3).length;
    const WM = mk(); WM._muffled = true; ctx.currentTime += 10; const wm0 = ctx.currentTime; const wmo = run(WM, 'win', undefined, 0);
    const muffledBox = wmo.filter((o) => o.type === 'sine' && o.frequency.ev.length === 1 && first(o.frequency) > 1000 && first(o.frequency) < 4000 && o.frequency.ev[0][0] > wm0 + 3).length;
    const heart = { thumps: th.length, at: th.length ? Math.round((th[0].frequency.ev[0][0] - w0 - SFX_T) * 100) / 100 : -1, box: boxF, muffledBox };
    // the impact release by kind
    const rel = (kind) => { const a = mk(); ctx.currentTime += 1; a.impact(120); ctx.currentTime += 0.05; clear(); a.impactRelease(120, kind);
      return [oscs.filter((o) => o.type === 'sine' && near(first(o.frequency), 1000)).length, oscs.filter((o) => near(first(o.frequency), 180)).length,
        oscs.filter((o) => o.type === 'triangle').length, oscs.filter((o) => near(first(o.frequency), 1800)).length]; };
    const release = { hurt: rel('bonk'), pay: rel('frenzy'), metal: rel('shield'), plain: rel() };
    // the link timbres
    const lk = (kind) => run(mk(), 'link', { n: 5, kind });
    const pl = lk('pass'), tailF = last(pl.filter((o) => o.type === 'triangle').pop().frequency);
    const sl = lk('slingshot').filter((o) => o.type === 'triangle' && near(first(o.frequency), tailF * 0.75) && near(last(o.frequency), tailF * 1.5)).length === 1;
    const wv = lk('weave').filter((o) => o.type === 'triangle').map((o) => first(o.frequency)).slice(-2);
    const weave = wv.length === 2 && near(wv[0], tailF) && wv[1] > wv[0] && inPenta(wv[1], 0);
    const snipe = lk('snipe').some((o) => o.type === 'sine' && near(first(o.frequency), tailF * 2));
    const timbre = { sling: sl, weave, snipe };
    const dz = run(mk(), 'dash'), dash = { transient: dz.some((o) => o.type === 'square'), sweep: dz.some((o) => o.type === 'sine' && near(first(o.frequency), 220) && near(last(o.frequency), 660)) };
    // steerLevel
    const S = mk(); S.on = true; S._int = 1; clear(); S.steerLevel(100); const quiet = srcs.length === 0 && !S._steer;
    S.steerLevel(-800); const built = srcs.length, full = near(S._steerL, STEER_G), pan = S._steer ? S._steer.pan : 0;
    for (let j = 0; j < 60; j++) { ctx.currentTime += 0.016; S.steerLevel((j & 1 ? 1 : -1) * 40 * j); }
    const steer = { quiet, full, pan, built, rebuilt: srcs.length - built };
    // hype
    const H = mk(); H.on = true; H._int = 1; H.hype(8, 0); const lift = Math.round(20 * Math.log10(H._hypeG) * 100) / 100; H.hype(2, 0); const none = H._hypeG;
    ctx.currentTime += 1; clear(); H.hype(2, 0.15); const gold = oscs.filter((o) => o.type === 'triangle').length;
    H.hype(2, 0.05); ctx.currentTime += 1; clear(); H.hype(2, 0.15); const again = oscs.length;
    H.hype(2, 0.05); ctx.currentTime += 4; clear(); H.hype(2, 0.15); const later = oscs.filter((o) => o.type === 'triangle').length;
    const hype = { lift, none, gold, again, later };
    const MH = mk(); MH.on = true; clear(); const hum = MH.macroHum(true, 0) === false && oscs.length === 0;
    return { tailVol, leadDip, presDip, kevin, nooo, yay, lose, wooo: [w1, w2], heart, release, timbre, dash, steer, hype, hum };
  }
  // round 8's audio rules, on a recording stand-in for an AudioContext (node, no audio). Returns:
  //   loseBox: { built, cut, quitBox, newRunCut, muffleCut }: 'lose' opens _loseBox, 'again' shuts it (its gain set toward 0),
  //     'quit' gets one too, and newRun() and setMuffle(true) shut it as well
  //   deaths: { holds, reset, upgrade, bagOk }: the stage hold (s) after deaths 1..7 (full ones about 2+, the 4th, 6th and 7th
  //     1.2), deaths counted again from 1 after menuKind = 'title' (true), rematchMusic(true) right after a short sting
  //     upgrading it to the full one (true), and 30 full stings drawing every ending once per bag of 3, never twice in a row
  //   birth: { pop, box, goo, gooFm, kazoo, aww, firstKazoo, hold }: the pop's 240 Hz sine at 0.6 s, the music box's first tine at
  //     1.2 s, the "goo" saw at 1.6 s, its formants an octave up (600 Hz for 'oo'), no kazoo / awww on a later birth and both on the
  //     first, and a running win hold stretched to the birth's end (s after the birth call)
  //   door: { thwump, rivals }: the 92 Hz thwump sine 0.3 s after a win, and the arrived losers' motifs (oscillators built behind it)
  //   progs: the 7 zones' progressions as chord-root strings; climb: _climbCheck().ok
  //   draft: { lp, loops, hats, pause, pickOpen, keep, crash }: the draft's lowpass target (2200), the proximity loop kept,
  //     the hats routed past the muffle, a plain muffle still 650 Hz, 'pick' booking 18 kHz on the next downbeat, a
  //     setMuffle(false) right after it leaving that booking alone, and the pick's crash
  //   open: { lead, downbeat, count, held, newRunKeeps, goEarly }: OPENING_COUNT_S, the step at the count-in's end opening a bar,
  //     sfx('count') silent while it counts, the groove held until then, newRun() keeping the phase, an early 'go' moving the
  //     downbeat onto itself
  //   frenzyEnd: { run, sigh, sweep }: the 3 falling triangles (Hz, riserFreqs reversed), Kevin's 300 Hz sigh, the 2500 Hz dip
  //   flick: { f, rate, snap }: the blip's pitch at vx 350 / 700, a second flick inside 110 ms silent, snapped onto the grid
  static _round8Facts() {
    const oscs = [], srcs = [], filt = [];
    const param = (v) => ({ value: v, ev: [], setValueAtTime(x, t) { this.ev.push([t, x]); }, exponentialRampToValueAtTime(x, t) { this.ev.push([t, x]); },
      linearRampToValueAtTime(x, t) { this.ev.push([t, x]); }, setTargetAtTime(x, t) { this.ev.push([t, x]); this.value = x; }, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(1), frequency: param(440), Q: param(1), detune: param(0), playbackRate: param(1), pan: param(0), type: '' });
    const ctx = { currentTime: 1, state: 'running', sampleRate: 44100, createStereoPanner: node, createGain: node, createBiquadFilter: () => { const f = node(); filt.push(f); return f; },
      createBufferSource: () => { const b = node(); srcs.push(b); return b; }, createOscillator: () => { const o = node(); oscs.push(o); return o; } };
    const mk = () => { const a = new Audio(); a._hasSession = () => false; a.ctx = ctx; a._cap = 1e9; for (const f of ['fx', 'fxEcho', 'music', 'tlp', 'mlp', 'slp', 'mduck', 'echo', 'leadBus', '_mPres', 'storyBus', '_hatIn', '_hatSkip', 'mfb', 'mfb2', 'tsBus', 'tsLp', 'hatBus']) a[f] = node(); a.mlp.frequency.value = 18000; return a; };
    const clear = () => { oscs.length = 0; srcs.length = 0; filt.length = 0; };
    const run = (a, name, k, dt = 1) => { ctx.currentTime += dt; clear(); a.sfx(name, k); return oscs.slice(); };
    const first = (p) => (p.ev.length ? p.ev[0][1] : p.value), at0 = (o) => (o.frequency.ev.length ? o.frequency.ev[0][0] : -1);
    const near = (x, y, e = 0.01) => Math.abs(x - y) < e * Math.max(1, Math.abs(y));
    const r2 = (x) => Math.round(x * 100) / 100;
    const shut = (b) => !!b && b.g.gain.ev.some((e) => e[1] === 0);
    // the lose box
    const LB = mk(); run(LB, 'lose', 1); const b1 = LB._loseBox; run(LB, 'again', undefined, 1.5);
    const QB = mk(); run(QB, 'quit'); const qb = QB._loseBox;
    const NB = mk(); run(NB, 'lose'); const nb = NB._loseBox; NB.newRun(); const MB = mk(); run(MB, 'lose'); const mb = MB._loseBox; ctx.currentTime += 0.5; MB.setMuffle(true);
    const loseBox = { built: !!b1, cut: shut(b1) && LB._loseBox === null, quitBox: !!qb, newRunCut: shut(nb), muffleCut: shut(mb) };
    // deaths
    const D = mk(), holds = [];
    for (let i = 0; i < 7; i++) { run(D, 'lose', undefined, 6); holds.push(r2(D._holdUntil - ctx.currentTime - SFX_T)); }
    D.menuKind = 'title'; const reset = D._deaths === 0;
    const U = mk(); for (let i = 0; i < 3; i++) run(U, 'lose', 2, 6);
    run(U, 'lose', 2, 6); const shortHold = U._holdUntil - ctx.currentTime; U.rematchMusic(true);
    const upgrade = shortHold < 1.3 && U._holdUntil - ctx.currentTime > 2 && U._loseArgs.full === true;
    const BG = mk(), seq = []; for (let i = 0; i < 30; i++) { BG._loseFull = true; BG._loseBag.length || 0; seq.push(BG._losePick()); }
    let bagOk = true; for (let i = 0; i + 3 <= 30; i += 3) if (new Set(seq.slice(i, i + 3)).size !== 3) bagOk = false;
    for (let i = 1; i < 30; i++) if (seq[i] === seq[i - 1]) bagOk = false;
    const deaths = { holds, reset, upgrade, bagOk };
    // the birth
    const BI = mk(); ctx.currentTime += 1; const b0 = ctx.currentTime + SFX_T; clear(); BI.birth({ first: false }); const bo = oscs.slice();
    const gooFm = filt.some((f) => f.frequency.ev.length && near(f.frequency.ev[0][1], VOW.oo[0] * 2) && near(f.frequency.ev[0][0], b0 + BIRTH_GOO, 0.001));
    const atS = (list, type, f) => list.filter((o) => o.type === type && near(first(o.frequency), f)).map((o) => r2(at0(o) - b0));
    const sawsAfter = (list, s0) => list.filter((o) => o.type === 'sawtooth' && at0(o) - b0 >= s0 - 1e-6).length;
    const gooSaw = bo.find((o) => o.type === 'sawtooth' && near(at0(o) - b0, BIRTH_GOO, 0.001));
    const FI = mk(); FI._holdUntil = ctx.currentTime + 3; FI._outUntil = FI._holdUntil; ctx.currentTime += 0.5; clear(); const f0 = ctx.currentTime + SFX_T; FI.birth({ first: true }); const fo = oscs.slice();
    const birth = { pop: atS(bo, 'sine', 240)[0], box: Math.min(...bo.filter((o) => o.type === 'sine' && at0(o) - b0 > 1).map((o) => r2(at0(o) - b0))),
      goo: gooSaw ? r2(at0(gooSaw) - b0) : -1, gooFm, kazoo: sawsAfter(bo, BIRTH_ANS), aww: sawsAfter(bo, 2), firstKazoo: fo.filter((o) => o.type === 'sawtooth' && at0(o) - f0 >= BIRTH_ANS - 1e-6).length,
      hold: r2(FI._holdUntil - f0) };
    // the door slam
    const W = mk(); ctx.currentTime += 10; const w0 = ctx.currentTime + SFX_T; const wo = run(W, 'win', { k: 1, arrived: [0, 2, 0] }, 0);
    const th = wo.filter((o) => o.type === 'sine' && near(first(o.frequency), 92)).map((o) => r2(at0(o) - w0));
    const wp = run(mk(), 'win', { k: 1, arrived: [] }, 10);
    const door = { thwump: th.filter((x) => Math.abs(x - DOOR_AT) < 0.01).length, rivals: wo.length - wp.length };
    const progs = ZONE_FLAVOR.map((z) => (z.prog || PROG).map((ch) => ch[0]).join(','));
    // the card draft
    const DR = mk(); DR._thr = { fake: true }; ctx.currentTime += 1; DR.setMuffle(true, 'draft');
    const lp = DR.mlp.frequency.value, loops = !!DR._thr, hats = DR._hatIn.gain.value === 0 && DR._hatSkip.gain.value > 0;
    DR.on = true; DR.next = ctx.currentTime + 0.05; DR.stepI = 21; ctx.currentTime += 0.01; clear(); DR.sfx('pick');
    const q = DR._pickOpen, pickOpen = q > ctx.currentTime && DR.mlp.frequency.ev.some((e) => e[1] === 18000 && e[0] >= q - 0.03);
    const crash = srcs.length > 0;
    const evN = DR.mlp.frequency.ev.length; DR.setMuffle(false); const keep = DR.mlp.frequency.ev.length === evN && DR._draft === true;
    const PA = mk(); ctx.currentTime += 1; PA.setMuffle(true); const pause = PA.mlp.frequency.value;
    const draft = { lp, loops, hats, pause, pickOpen, keep, crash };
    // the opening count-in
    const OP = mk(); OP.on = true; ctx.currentTime += 1; OP.next = ctx.currentTime + 0.07; OP.stepI = 37; clear();
    OP.openingCue(2); const Dn = OP._openAt, spb = 60 / OP._bpm / 4, j = Math.round((Dn - OP.next) / spb);
    const downbeat = Math.abs(OP.next + j * spb - Dn) < 1e-6 && ((OP.stepI + j) & 15) === 0;
    const held = OP._holdUntil > ctx.currentTime && OP._holdUntil < Dn;
    clear(); OP.sfx('count', { n: 1 }); const count = oscs.length === 0 && srcs.length === 0;
    OP.newRun(); const j2 = Math.round((Dn - OP.next) / spb), newRunKeeps = ((OP.stepI + j2) & 15) === 0 && OP._holdUntil > ctx.currentTime && OP.crashBar === (OP.stepI + j2) >> 4;
    const OG = mk(); OG.on = true; ctx.currentTime += 1; OG.next = ctx.currentTime + 0.07; OG.stepI = 5; OG.openingCue(2); ctx.currentTime += 0.65; OG.sfx('go');
    const goEarly = OG._openAt < 0 && Math.abs(OG.next - ctx.currentTime - 0.01) < 1e-6 && (OG.stepI & 15) === 0;
    const open = { lead: r2(OPENING_COUNT_S), downbeat, count, held, newRunKeeps, goEarly };
    // frenzyEnd
    const FE = mk(); run(FE, 'frenzy', { tier: 2 }); FE._ftier = 0; FE._kevT = -9; const fe = run(FE, 'frenzyEnd');
    const feRun = fe.filter((o) => o.type === 'triangle').map((o) => Math.round(first(o.frequency)));
    const frenzyEnd = { run: feRun, want: riserFreqs(2, 0).reverse().slice(0, 3).map(Math.round), sigh: fe.some((o) => o.type === 'sawtooth' && near(first(o.frequency), 300)),
      sweep: FE.mlp.frequency.ev.some((e) => e[1] === 2500) };
    // tailFlick
    const FL = mk(), fA = run(FL, 'tailFlick', { vx: 350, dir: 1 }), fB = run(FL, 'tailFlick', { vx: -700, dir: -1 }, 0.05), fC = run(FL, 'tailFlick', { vx: -700, dir: -1 }, 0.1);
    const fq = (l) => { const o = l.find((x) => x.type === 'sine'); return o ? Math.round(o.frequency.ev[o.frequency.ev.length - 1][1]) : 0; };
    const SN = mk(); SN.on = true; ctx.currentTime += 1; SN.next = ctx.currentTime + 0.02; SN.stepI = 3; const sn = run(SN, 'tailFlick', { vx: 500, dir: 1 }, 0);
    const flick = { f: [fq(fA), fq(fC)], rate: fB.length === 0, snap: sn.length > 0 && Math.abs(at0(sn[0]) - SN.next) < 1e-6 };
    return { loseBox, deaths, birth, door, progs, climb: Audio._climbCheck().ok, draft, open, frenzyEnd, flick };
  }
  // the mix's rules as plain numbers, for a test to assert without an AudioContext: the intensity gains, the race trim,
  // the beat lock's no-snap hold, calm mode's floors, the perceptual sliders (gain = v * v) and the FRENZY riser staying
  // in key for every tier and every key the song reaches (0..15), the theme keeping its shape in every key (themeShape,
  // winShape: see _themeFacts), plus the last measureMix() numbers (MIX_MEASURED)
  static mixFacts() {
    const a = new Audio(), slider = [];
    const { slowLinkInKey, slowNoteHome } = Audio._bendFacts();
    for (const v of [0, 0.25, 0.5, 0.75, 1]) { a.musicVol = v; a.sfxVol = v; slider.push({ v, music: a._mLevel() / MUSIC_VOL, sfx: a._fxLevel() }); }
    let riserInKey = true;
    for (let tier = 1; tier <= 5; tier++) for (let key = 0; key <= 15; key++) if (!riserFreqs(tier, key).every((f) => inPenta(f, key) && f <= 4000)) riserInKey = false;
    const { themeShape, winShape } = Audio._themeFacts();
    return {
      themeShape, winShape,
      intGain: INT_GAIN.slice(), frenzyGain: FRENZY_GAIN, raceTrim: RACE_TRIM.slice(), lockHold: LOCK_HOLD,
      calmSlp: CALM_SLP, calmDuck: CALM_DUCK, slider, riserInKey, tsHold: TS_HOLD, measured: { ...MIX_MEASURED },
      slowLinkInKey, slowNoteHome,
    };
  }
  // the theme keeps its shape (one octave per line, never a note folded on its own), in keys 0..15:
  //   themeShape: every bar of THEME (top 1500 Hz), MENU_HOOK (its own top degree), the duel's 4 notes and the lose kazoo:
  //     each note-to-note step goes the way THEME's degrees go, and no note passes the line's top
  //   winShape: the win fanfare's call as it is really built (its brass, recorded): the same directions, degree 7 <= 1100 Hz
  static _themeFacts() {
    const sgn = (x) => (Math.abs(x) < 1e-9 ? 0 : x > 0 ? 1 : -1);
    const same = (fs, ds) => fs.length === ds.length && fs.every((f, j) => j === 0 || sgn(f - fs[j - 1]) === sgn(ds[j] - ds[j - 1]));
    const nn = (line) => line.filter((d) => d !== null);
    let themeShape = true;
    for (let key = 0; key <= 15; key++) {
      for (const bar of THEME) { const ds = nn(bar), fs = ds.map((d) => themeBase(key) * st(PENTA[d])); if (!same(fs, ds) || Math.max(...fs) > 1500 * 1.0001) themeShape = false; }
      for (const bar of MENU_HOOK) { const ds = nn(bar), fs = ds.map((d) => themeBase(key, 1500, HOOK_HI) * st(PENTA[d])); if (!same(fs, ds) || Math.max(...fs) > 1500 * 1.0001) themeShape = false; }
      const call = nn(THEME[0]).slice(0, 4);
      for (let up = 0; up <= 5; up++) { const ds = call.map((d) => d + up), fs = ds.map((d) => themeBase(key, 900, pen(7 + up)) * st(pen(d))); if (!same(fs, ds) || Math.max(...fs) > 900 * 1.0001) themeShape = false; }
      { const fs = call.map((d) => themeBase(key, 700) * st(PENTA[d])); if (!same(fs, call)) themeShape = false; }
    }
    // the win fanfare, recorded: each call note is two detuned saws, in order
    const oscs = [];
    const param = (v) => ({ value: v, ev: [], setValueAtTime(x, t) { this.ev.push([t, x]); }, exponentialRampToValueAtTime(x, t) { this.ev.push([t, x]); },
      linearRampToValueAtTime(x, t) { this.ev.push([t, x]); }, setTargetAtTime(x, t) { this.ev.push([t, x]); }, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(1), frequency: param(440), Q: param(1), detune: param(0), playbackRate: param(1), pan: param(0), type: '' });
    const ctx = { currentTime: 1, state: 'running', sampleRate: 44100, createGain: node, createBiquadFilter: node, createBufferSource: node, createStereoPanner: node,
      createOscillator: () => { const o = node(); oscs.push(o); return o; } };
    const ds = nn(THEME[0]);
    let winShape = true;
    for (let key = 0; key <= 15 && winShape; key++) {
      const a = new Audio(); a._hasSession = () => false; a.ctx = ctx; a._cap = 1e9; a.fx = node(); a.fxEcho = node(); a.music = node(); a.tlp = node(); a.mlp = node(); a.slp = node(); a.mduck = node(); a.echo = node();
      a.key = key; oscs.length = 0; ctx.currentTime += 10; a.sfx('win');
      const saws = oscs.filter((o) => o.type === 'sawtooth').slice(0, 2 * ds.length).filter((o, j) => (j & 1) === 0).map((o) => o.frequency.ev[0][1]);
      if (!same(saws, ds) || Math.max(...saws) > WIN_TOP * 1.0001 || Math.max(...saws) <= WIN_TOP / 2) winShape = false;
    }
    return { themeShape, winShape };
  }
  // which THEME bar the race whistles in zone z, tb bars after the zone's theme start: -1 for none. The launch, the sea
  // and the egg (THEME_ZONES) get all 4 bars; every other zone opens with the answer bar (1) alone
  static hookBar(z, tb) { return THEME_ZONES.includes(z) ? (tb >= 0 && tb < 4 ? tb : -1) : tb === 0 ? 1 : -1; }
  // round 3's audio rules, on a recording stand-in for an AudioContext (node, no audio). Returns:
  //   boop / acidIn: oscillators built (> 0), and nothing at all when muted (mutedSilent)
  //   comboEndLen: the triangle's glide length for n 5, 15 and 40 (0.25, 0.4, 0.6); comboEndKazoo: sawtooth voices for
  //     n 15 and 40 (0 and > 0: only 30+ gets the kazoo); comboEndBare: a bare comboEnd() does not throw
  //   dnaOctave: the second square note over the first for a streak step 0 and step 3 (under 2x, then over 2x)
  //   hooks: hookBar for zones 0..6 at tb 0, 1, 2 (full theme in 0, 3, 6, the answer bar alone elsewhere)
  //   acidG: the sizzle's level for [v 1, v 1 with acidLow, a touch] ([0.08, 0.12, ~0.06]); acidLowF: its band with acidLow
  //   steer: { mutedNone, slowNone, built, rebuilt }: nothing built when muted or under STEER_MIN, one bed at full speed,
  //     and no new source on 30 more calls
  static _round3Facts() {
    const oscs = [], srcs = [], filt = [];
    const param = (v) => ({ value: v, ev: [], setValueAtTime(x, t) { this.ev.push([t, x]); }, exponentialRampToValueAtTime(x, t) { this.ev.push([t, x]); },
      linearRampToValueAtTime(x, t) { this.ev.push([t, x]); }, setTargetAtTime(x, t) { this.ev.push([t, x]); this.value = x; }, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(1), frequency: param(440), Q: param(1), detune: param(0), playbackRate: param(1), pan: param(0), type: '' });
    const ctx = { currentTime: 1, state: 'running', sampleRate: 44100, createGain: node, createStereoPanner: node,
      createBiquadFilter: () => { const f = node(); filt.push(f); return f; }, createBufferSource: () => { const b = node(); srcs.push(b); return b; },
      createOscillator: () => { const o = node(); oscs.push(o); return o; } };
    const mk = () => { const a = new Audio(); a._hasSession = () => false; a.ctx = ctx; a._cap = 1e9; a.fx = node(); a.fxEcho = node(); a.music = node(); a.tlp = node(); a.mlp = node(); a.slp = node(); a.mduck = node(); a.echo = node(); return a; };
    const run = (a, name, k) => { ctx.currentTime += 1; oscs.length = 0; srcs.length = 0; a.sfx(name, k); return { o: oscs.slice(), s: srcs.length }; };
    const a = mk();
    const boop = run(a, 'boop').o.length, acidIn = run(a, 'acidIn').o.length;
    const mu = mk(); mu.muted = true; const ms = run(mu, 'boop'), ma = run(mu, 'acidIn');
    const mutedSilent = ms.o.length + ms.s + ma.o.length + ma.s === 0;
    const comboEndLen = [], comboEndKazoo = [];
    for (const n of [5, 15, 40]) {
      a._passF = a._scaleF(n, 440); const o = run(a, 'comboEnd', { n }).o, tri = o.find((x) => x.type === 'triangle');
      comboEndLen.push(tri ? Math.round(100 * (tri.frequency.ev[1][0] - tri.frequency.ev[0][0])) / 100 : 0);
      if (n > 5) comboEndKazoo.push(o.filter((x) => x.type === 'sawtooth').length);
    }
    let comboEndBare = true; try { run(a, 'comboEnd'); run(a, 'boop'); run(a, 'acidIn'); } catch (e) { comboEndBare = false; }
    const dnaOctave = [0, 3].map((n) => { const d = mk(); d._dnaN = n - 1; d._dnaT = ctx.currentTime + 1; if (n === 0) d._dnaT = -9; const sq = run(d, 'dna').o.filter((x) => x.type === 'square'); return sq.length === 2 ? Math.round(100 * sq[1].frequency.ev[0][1] / sq[0].frequency.ev[0][1]) / 100 : 0; });
    const hooks = [0, 1, 2, 3, 4, 5, 6].map((z) => [0, 1, 2].map((tb) => Audio.hookBar(z, tb)));
    const ac = mk(), acidG = [ac._acidG(1)]; ac.acidLow = true; acidG.push(ac._acidG(1)); ac.acidLow = false; acidG.push(Math.round(1000 * ac._acidG(0.01)) / 1000);
    const al = mk(); al.acid = 1; al.acidLow = true; const acidLowF = al._acid ? al._acid.f : 0;
    const sm = mk(); sm.on = true; sm._int = 1; sm.muted = true; srcs.length = 0; sm.steer(1, 1); const mutedNone = srcs.length === 0 && !sm._steer;
    const ss = mk(); ss.on = true; ss._int = 1; srcs.length = 0; ss.steer(0.2, 1); const slowNone = srcs.length === 0 && !ss._steer;
    ss.steer(1, 1); const built = srcs.length;
    for (let j = 0; j < 30; j++) { ctx.currentTime += 0.016; ss.steer(j / 30, j & 1 ? 1 : -1); }
    const rebuilt = srcs.length - built;
    return { boop, acidIn, mutedSilent, comboEndLen, comboEndKazoo, comboEndBare, dnaOctave, hooks, acidG, acidLowF, steer: { mutedNone, slowNone, built, rebuilt } };
  }
  // this round's cue rules, on a recording stand-in for an AudioContext (node, no audio). Returns:
  //   popChain: [_popN after pop(3), then a bare pop 0.5 s later, then one 0.75 s later, then pop({ chain: 1 })] = [2, 3, 0, 0]
  //   maxed: brass saws for { capstone: true }, for { id } (0: a two-note coin sting, squares), and for no argument
  //   kevin: { dash, again, pass3, capped }: dash speaks (true), a second dash 0.2 s later stays quiet (the shared 0.35 s
  //     limit), the 6th of six quick passes giggles and the 5th does not (pass3, true), and nothing at CAP - 8 live sources
  //   passRoll: triangles built by pass 3 then pass 7 (3 grace notes and the tail: 4), and by a drop to pass 2 (1); rollUp:
  //     the grace notes climb into the tail
  //   comboEnd: [level, falls] for n 5, 12 and 30 ([0.05, true], [0.09, true], [0.12, true])
  //   egg: { lead, lift, hold, callShape }: beat stopped, the hit FIN_SW after the call, the key 2 st up, the music held at
  //     0.7 of its level, and the choir's call going the way THEME's degrees go
  static _roundFacts() {
    const oscs = [], made = [];
    const param = (v) => ({ value: v, ev: [], setValueAtTime(x, t) { this.ev.push([t, x]); }, exponentialRampToValueAtTime(x, t) { this.ev.push([t, x]); },
      linearRampToValueAtTime(x, t) { this.ev.push([t, x]); }, setTargetAtTime(x, t) { this.ev.push([t, x]); }, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(1), frequency: param(440), Q: param(1), detune: param(0), playbackRate: param(1), pan: param(0), type: '' });
    const ctx = { currentTime: 1, state: 'running', sampleRate: 44100, createGain: () => { const g = node(); made.push(g); return g; }, createBiquadFilter: node,
      createBufferSource: node, createStereoPanner: node, createOscillator: () => { const o = node(); oscs.push(o); made.push(o); return o; } };
    const mk = () => { const a = new Audio(); a._hasSession = () => false; a.ctx = ctx; a._cap = 1e9; a.fx = node(); a.fxEcho = node(); a.music = node(); a.tlp = node(); a.mlp = node(); a.slp = node(); a.mduck = node(); a.echo = node(); return a; };
    const run = (a, name, k, dt = 1) => { ctx.currentTime += dt; oscs.length = 0; a.sfx(name, k); return oscs.slice(); };
    const of = (list, type) => list.filter((o) => o.type === type);
    // pop
    const p = mk(), popChain = [];
    run(p, 'pop', 3); popChain.push(p._popN); run(p, 'pop', undefined, 0.5); popChain.push(p._popN);
    run(p, 'pop', undefined, 0.75); popChain.push(p._popN); run(p, 'pop', { chain: 1 }, 0.1); popChain.push(p._popN);
    // maxed
    const m = mk(), cap = of(run(m, 'maxed', { id: 'x', capstone: true }), 'sawtooth').length;
    const small = run(m, 'maxed', { id: 'x' }), old = of(run(m, 'maxed'), 'sawtooth').length;
    const maxed = { capstone: cap, plain: of(small, 'sawtooth').length, plainSquares: of(small, 'square').length, bare: old };
    // Kevin
    const kv = mk();
    const dash = of(run(kv, 'dash'), 'sawtooth').length > 0, again = of(run(kv, 'dash', undefined, 0.2), 'sawtooth').length > 0;
    // the giggle needs a burst now (see _hehe): the 6th of six passes 0.1 s apart giggles, the 5th does not (pass3 keeps its name)
    run(kv, 'pass', 1); for (let j = 0; j < 3; j++) run(kv, 'pass', 1, 0.1);
    const fifth = of(run(kv, 'pass', 1, 0.1), 'sawtooth').length > 0, pass3 = !fifth && of(run(kv, 'pass', 1, 0.1), 'sawtooth').length > 0;
    kv.live = kv._cap - 8; const capped = of(run(kv, 'dash'), 'sawtooth').length > 0; kv.live = 0;
    // the pass roll
    const pr = mk(); run(pr, 'pass', 3);
    const roll = of(run(pr, 'pass', 7), 'triangle'), drop = of(run(pr, 'pass', 2), 'triangle').length;
    const rf = roll.map((o) => o.frequency.ev[o.frequency.ev.length - 1][1]);
    const passRoll = [roll.length, drop], rollUp = rf.length === 4 && rf.every((f, j) => j === 0 || f > rf[j - 1]);
    // comboEnd
    const ce = mk(), comboEnd = [5, 12, 30].map((n) => {
      ce._passF = ce._scaleF(n, 440); const tri = of(run(ce, 'comboEnd', n), 'triangle')[0];
      if (!tri) return [0, false];
      const ev = tri.frequency.ev, g = made[made.indexOf(tri) + 1], peak = g ? Math.max(...g.gain.ev.map((x) => x[1])) : 0;   // tone(): its gain comes next
      return [Math.round(1000 * peak) / 1000, ev.length === 2 && ev[1][1] < ev[0][1]];
    });
    // the egg
    const e = mk(), k0 = e.keyTarget, L = e._mLevel(), eo = run(e, 'egg'), callF = [];
    const ds = THEME_CALL.filter((d) => d !== null), sgn = (x) => (x > 1e-9 ? 1 : x < -1e-9 ? -1 : 0);
    of(eo, 'sawtooth').slice(0, 2 * ds.length).forEach((o, j) => { if (j & 1) callF.push(o.frequency.ev[0][1]); });   // each note: f / 2, then f
    const call = callF;
    const egg = {
      lead: e.eggLead, lift: e.keyTarget - k0, hold: e.music.gain.ev.some((x) => Math.abs(x[1] - 0.7 * L) < 1e-9),
      callShape: call.length === ds.length && call.every((f, j) => j === 0 || sgn(f - call[j - 1]) === sgn(ds[j] - ds[j - 1])),
    };
    return { popChain, maxed, kevin: { dash, again, pass3, capped }, passRoll, rollUp, comboEnd, egg };
  }
  // the slow-mo bend, checked on a recording stand-in for an AudioContext (every oscillator's last scheduled frequency):
  //   slowLinkInKey: in a big slow (rate 0.72) every frequency a link n = 0..60 ends on (kinds pass, gate, bump; close adds a
  //   bell's inharmonic 3.01x partial, dodge and pop an "aww" sliding down, both on purpose) is a note of the A minor pentatonic in keys 0..15 (TONAL: no bend)
  //   slowNoteHome: a plain tone() note built at _fxR 0.72 starts at 0.72 f and ends on f within 0.06 s
  static _bendFacts() {
    const oscs = [];
    const param = (v) => ({ value: v, ev: [], setValueAtTime(x, t) { this.ev.push([t, x]); }, exponentialRampToValueAtTime(x, t) { this.ev.push([t, x]); },
      linearRampToValueAtTime(x, t) { this.ev.push([t, x]); }, setTargetAtTime() {}, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(1), frequency: param(440), Q: param(1), detune: param(0), playbackRate: param(1), pan: param(0) });
    const ctx = { currentTime: 0, state: 'running', sampleRate: 44100, createGain: node, createBiquadFilter: node, createBufferSource: node, createStereoPanner: node,
      createOscillator: () => { const o = node(); oscs.push(o); return o; } };
    const last = (p) => { if (!p.ev.length) return p.value; let b = p.ev[0]; for (const e of p.ev) if (e[0] >= b[0]) b = e; return b[1]; };
    const a = new Audio(); a.ctx = ctx; a._cap = 1e9; a.fx = node(); a.fxEcho = node(); a.music = node();
    a._slowOn = true; a._slowBig = true; a._rate = 0.72;
    let slowLinkInKey = true;
    for (let key = 0; key <= 15 && slowLinkInKey; key++) {
      a.key = key;
      for (let n = 0; n <= 60 && slowLinkInKey; n++) {
        for (const kind of ['pass', 'gate', 'bump']) {
          oscs.length = 0; a.last = {}; a.sfx('link', { n, kind });
          if (!oscs.length || !oscs.every((o) => inPenta(last(o.frequency), key))) { slowLinkInKey = false; break; }
        }
      }
    }
    oscs.length = 0; a._fxR = 0.72; const o = a.tone('triangle', 440, 0, 1, 0.2, 0.1, a.fx); a._fxR = 1;
    const ev = o ? o.frequency.ev : [];
    const slowNoteHome = ev.length === 2 && Math.abs(ev[0][1] - 440 * 0.72) < 1e-6 && ev[1][1] === 440 && ev[1][0] - 1 <= 0.06 + 1e-9;
    return { slowLinkInKey, slowNoteHome };
  }
  // round 6's audio rules, on a recording stand-in for an AudioContext (node, no audio). Returns:
  //   figures: _figureCheck().length (0); comboLow12: comboLow's 7 ticks in key 12 strictly rising (true)
  //   solo: { choked, quiet, later, yeahQuiet, yeahLater }: a milestone 0.1 s after a shout chokes it (its gain heads to 0.0001), a
  //     shout 0.2 s after a milestone builds nothing, one 0.5 s after plays; link 100's "yeah" chop sits out 0.1 s after a
  //     milestone and sings 1 s after
  //   aww: { first, gap, deflate, inKey, vowels, long }: a dodge link's aww sings, one 0.1 s later does not (0.3 s), one 0.35 s
  //     after the first sings lower, in key, the vowels alternate ('ah' then 'oh': F1 730, 570), and link 25 has none
  //   cues: dripTell, dripDrop, rivalSplat, streakEnd and doorbell never throw, the first three and doorbell build sound, none
  //     when muted (mutedSilent); dripRises: dripTell's sine rises; doorbell: { dms, shape }: 6 "dm" triangles in THEME_CALL's shape
  //   drop: { on, gap, lift, keyBar, fade, off, frenzyOff, mkStep }: a medley ({ n: 2, mk: 1 }) on a running beat at step 20
  //     drops: silence for steps 20..31, the key target 1 + 2 (the streak's lift) up, landing on bar 2; streakEnd fades the stem
  //     bus to 0.0001 in 0.4 s and ends the drop; frenzyEnd ends a drop too; mk 2's run 2 semitones over mk 0's
  //   hum: { off, on, again, later, ratio }: macroHum is silent before setStoryStage(31), hums at 31, not again within 6 s,
  //     again after; a dozing call spans 1.4 / 0.6 of a hunting one (ratio ~2.33)
  //   choir: the win fanfare's extra sawtooth voices once act 4 is seen (3); chomp: the "nom" square's start (220 Hz)
  static _round6Facts() {
    const oscs = [], filt = [], gains = [];
    const param = (v) => ({ value: v, ev: [], setValueAtTime(x, t) { this.ev.push([t, x]); }, exponentialRampToValueAtTime(x, t) { this.ev.push([t, x]); },
      linearRampToValueAtTime(x, t) { this.ev.push([t, x]); }, setTargetAtTime(x, t) { this.ev.push([t, x]); }, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(1), frequency: param(440), Q: param(1), detune: param(0), playbackRate: param(1), pan: param(0), type: '' });
    const ctx = { currentTime: 1, state: 'running', sampleRate: 44100, createStereoPanner: node, createBufferSource: node,
      createGain: () => { const g = node(); gains.push(g); return g; }, createBiquadFilter: () => { const f = node(); filt.push(f); return f; },
      createOscillator: () => { const o = node(); oscs.push(o); return o; } };
    const mk = () => { const a = new Audio(); a._hasSession = () => false; a.ctx = ctx; a._cap = 1e9; a.fx = node(); a.fxEcho = node(); a.music = node(); a.tlp = node(); a.mlp = node(); a.slp = node(); a.mduck = node(); a.echo = node(); a.tsBus = node(); a.tsLp = node(); a.tsBassLp = node(); return a; };
    const clear = () => { oscs.length = 0; filt.length = 0; gains.length = 0; };
    const run = (a, name, k, dt = 1) => { ctx.currentTime += dt; clear(); a.sfx(name, k); return oscs.slice(); };
    const first = (p) => (p.ev.length ? p.ev[0][1] : p.value), last = (p) => (p.ev.length ? p.ev[p.ev.length - 1][1] : p.value);
    const saws = (list) => list.filter((o) => o.type === 'sawtooth');
    const up = (fs) => fs.length > 1 && fs.every((f, j) => j === 0 || f > fs[j - 1] * 1.0001);
    const sgn = (x) => (Math.abs(x) < 1e-9 ? 0 : x > 0 ? 1 : -1);
    // figures
    const figures = Audio._figureCheck().length;
    const cl = mk(); cl.key = 12; const clF = [];
    for (let j = 0; j < 7; j++) { const tr = run(cl, 'comboLow', undefined, j ? 0.1 : 1).filter((o) => o.type === 'triangle'); clF.push(tr.length ? first(tr[tr.length - 1].frequency) : 0); }
    const comboLow12 = up(clF) && Math.max(...clF) <= 1760.01;
    // one vocal identity per milestone
    const s1 = mk(); run(s1, 'combo', 30); const sg = s1._shoutG; run(s1, 'comboMilestone', { n: 40 }, 0.1);
    const choked = !!sg && last(sg.gain) === 0.0001;
    const s2 = mk(); run(s2, 'comboMilestone', { n: 40 }); const quiet = run(s2, 'combo', 30, 0.2).length === 0, later = saws(run(s2, 'combo', 30, 0.5)).length > 0;
    const s3 = mk(); run(s3, 'comboMilestone', { n: 100 }); const yeahQuiet = saws(run(s3, 'link', { n: 100, kind: 'pass' }, 0.1)).length === 0;
    const yeahLater = saws(run(s3, 'link', { n: 100, kind: 'pass' }, 1)).length > 0;
    const solo = { choked, quiet, later, yeahQuiet, yeahLater };
    // the aww
    const aw = mk(), sayF = (o) => { const w = saws(o); return w.length ? first(w[0].frequency) : 0; };
    const o1 = run(aw, 'link', { n: 5, kind: 'dodge' }), f1 = sayF(o1), v1 = filt.filter((f) => f.type === 'bandpass').map((f) => first(f.frequency));
    const gap = sayF(run(aw, 'link', { n: 6, kind: 'dodge' }, 0.1)) === 0;
    const o3 = run(aw, 'link', { n: 5, kind: 'dodge' }, 0.25), f3 = sayF(o3), v3 = filt.filter((f) => f.type === 'bandpass').map((f) => first(f.frequency));
    const long = sayF(run(mk(), 'link', { n: 25, kind: 'pop' })) === 0;
    const aww = { first: f1 > 0, gap, deflate: f3 > 0 && f3 < f1, inKey: f3 > 0 && inPenta(f3, 0), vowels: v1.includes(730) && v3.includes(570), long };
    // the new cues
    const names = ['dripTell', 'dripDrop', 'rivalSplat', 'doorbell'];
    let throws = false; const cm = mk(); let cues = true;
    try { for (const n of names) { run(cm, n, { pan: 0.5 }, 3); if (!oscs.length) cues = false; } run(cm, 'streakEnd'); } catch (e) { throws = true; }
    const mu = mk(); mu.muted = true; const mutedSilent = names.every((n) => run(mu, n, { pan: 0 }, 3).length === 0);
    const dt = run(mk(), 'dripTell', { pan: -1 }).find((o) => o.type === 'sine'), dripRises = !!dt && last(dt.frequency) > first(dt.frequency);
    const dmT = run(mk(), 'doorbell').filter((o) => o.type === 'triangle').map((o) => last(o.frequency)), call = THEME_CALL.filter((d) => d !== null).slice(0, 6);
    const doorbell = { dms: dmT.length, shape: dmT.length === 6 && dmT.every((f, j) => j === 0 || sgn(f - dmT[j - 1]) === sgn(call[j] - call[j - 1])) };
    // the medley drop
    const beat = () => { const a = mk(); a.on = true; a._int = 1; a._bpm = 120; a.stepI = 20; a.next = ctx.currentTime + 1.05; return a; };
    const D = beat(); const k0 = D.keyTarget; run(D, 'medley', { n: 2, mk: 1 });
    const dOn = D._dropOn, dGap = D._gapFrom === 20 && D._gapTo === 32, lift = D.keyTarget - k0, keyBar = D._keyNext !== null ? D._keyBar : -1;
    run(D, 'streakEnd', undefined, 0.1);
    const fade = last(D.tsBus.gain) === 1 && D.tsBus.gain.ev.some((x) => x[1] === 0.0001), off = !D._dropOn && D._dlift === 0 && D._tsLvl === 0;
    const F = beat(); run(F, 'medley', { n: 1, mk: 1 }); const fOn = F._dropOn; run(F, 'frenzyEnd', undefined, 0.1); const frenzyOff = fOn && !F._dropOn && F._dlift === 0;
    const mf = (m) => { const tr = run(mk(), 'medley', { n: 1, mk: m }).filter((o) => o.type === 'triangle'); return tr.length ? first(tr[0].frequency) : 0; };
    const mkStep = Math.round(12 * Math.log2(mf(2) / mf(0)) * 100) / 100;
    const drop = { on: dOn, gap: dGap, lift, keyBar, fade, off, frenzyOff, mkStep };
    // the Macro's hum
    const H = mk(); ctx.currentTime += 1; const hOff = !H.macroHum(true, 0);
    H.setStoryStage(31, false); ctx.currentTime += 1; clear(); const hOn = H.macroHum(true, 0.5);
    const span = (o) => { const ev = o.frequency.ev; return ev[ev.length - 1][0] - ev[0][0]; };
    const hunt = oscs.length ? span(oscs[0]) : 0;
    ctx.currentTime += 1; const again = H.macroHum(false, 0);
    ctx.currentTime += 6; clear(); const hLater = H.macroHum(false, 0); const doze = oscs.length ? span(oscs[0]) : 0;
    const hum = { off: hOff, on: hOn, again, later: hLater, ratio: hunt > 0 ? Math.round(100 * doze / hunt) / 100 : 0 };
    // the act 4 choir, the chomp
    const W0 = mk(); ctx.currentTime += 10; const w0 = saws(run(W0, 'win')).length;
    const W1 = mk(); W1.setStoryStage(39, true); ctx.currentTime += 10; const w1 = saws(run(W1, 'win')).length;
    const ch = run(mk(), 'spareBite').find((o) => o.type === 'square');
    return { figures, comboLow12, solo, aww, cues: cues && !throws, mutedSilent, dripRises, doorbell, drop, hum, choir: w1 - w0, chomp: ch ? first(ch.frequency) : 0 };
  }
  // the cue rules of this pass, checked on a recording stand-in for an AudioContext (node, no audio). Returns:
  //   session: { def, defPlays, ambientMutes, playbackPlays, noSessionPlays, badIgnored }: 'playback' by default (the music
  //     plays on iPhones); with a session (navigator.audioSession) an opted-in ambient holds the music bus at 0 and playback
  //     brings it back; without one the music plays
  //   countBeat: 60 / bpm at the zone 1 tempo (0.625); countClimb: the count's brass notes (3, 2, 1) then go's, rising, all in key
  //   comboLowSemis: the alarm's semitones over 10 ticks (0..CL_TOP, the last 3 in the pentatonic); comboLowHeartSkip: with a
  //     lowE heartbeat on the same tick the 150 Hz sine is gone and the ping stays
  //   dashReadyF: the first blip's frequency in keys 0..15 (all in key, 1320..2640 Hz)
  //   sugarSteps: the streak's main note in semitones over the key for 10 fruit 0.2 s apart (climbing, capped at SUG_TOP
  //     degrees), and sugarReset: the step after a 1 s gap (0)
  //   winRoom: [after 'win' + menuKind 'result', after menuKind 'title'] (true, false); loseRoom: after 'lose' (false)
  //   nudge: its two notes' frequencies in A, both in key
  static _cueFacts() {
    const oscs = [];
    const param = (v) => ({ value: v, ev: [], setValueAtTime(x, t) { this.ev.push([t, x]); }, exponentialRampToValueAtTime(x, t) { this.ev.push([t, x]); },
      linearRampToValueAtTime(x, t) { this.ev.push([t, x]); }, setTargetAtTime(x, t) { this.ev.push([t, x]); }, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(1), frequency: param(440), Q: param(1), detune: param(0), playbackRate: param(1), pan: param(0), type: '' });
    const ctx = { currentTime: 1, state: 'running', sampleRate: 44100, createGain: node, createBiquadFilter: node, createBufferSource: node, createStereoPanner: node,
      createOscillator: () => { const o = node(); oscs.push(o); return o; } };
    const first = (p) => (p.ev.length ? p.ev[0][1] : p.value);
    const mk = (sess) => { const a = new Audio(); a._hasSession = () => sess; a.ctx = ctx; a._cap = 1e9; a.fx = node(); a.fxEcho = node(); a.music = node(); a.tlp = node(); a.mlp = node(); a.slp = node(); a.mduck = node(); a.echo = node(); return a; };
    // session
    const s1 = mk(true), s0 = mk(false), def = s1.sessionType, defPlays = s1._mLevel() > 0;
    s1.setSessionType('ambient'); const amb = s1._mLevel(); s1.setSessionType('playback'); const pb = s1._mLevel(); s1.setSessionType('loud');
    s0.setSessionType('ambient');
    const session = { def, defPlays, ambientMutes: amb === 0, playbackPlays: pb > 0, noSessionPlays: s0._mLevel() > 0, badIgnored: s1.sessionType === 'playback' };
    // the count climbs into go
    const a = mk(false), climb = [];
    const brassF = (name, k) => { oscs.length = 0; ctx.currentTime += 1; a.sfx(name, k); const saws = oscs.filter((o) => o.type === 'sawtooth'); return saws.length ? first(saws[0].frequency) : 0; };
    for (const n of [3, 2, 1]) climb.push(brassF('count', { n }));
    climb.push(brassF('go'));
    const countClimb = climb.every((f, j) => f > 0 && inPenta(f, a.key) && (j === 0 || f > climb[j - 1]));
    // comboLow
    const semis = []; let heartSkip = false;
    a.combo = 0;
    for (let j = 0; j < 10; j++) {
      oscs.length = 0; ctx.currentTime += 0.3; a.sfx('comboLow', { grade: 0 });
      const tri = oscs.find((o) => o.type === 'triangle' && first(o.frequency) > 600);
      if (tri) { let f = first(tri.frequency); semis.push(Math.round(12 * Math.log2(f / 880))); }
    }
    { oscs.length = 0; ctx.currentTime += 0.3; a._lowQ = ctx.currentTime + 0.005; a.sfx('comboLow', { grade: 0 });
      heartSkip = !oscs.some((o) => o.type === 'sine' && first(o.frequency) === 150) && oscs.some((o) => o.type === 'triangle' && first(o.frequency) > 600); }
    // dashReady
    const dashReadyF = [];
    for (let key = 0; key <= 15; key++) { a.key = key; oscs.length = 0; ctx.currentTime += 1; a.sfx('dashReady'); dashReadyF.push(oscs.length ? first(oscs[0].frequency) : 0); }
    a.key = 0;
    // sugar
    const sugarSteps = [];
    for (let j = 0; j < 10; j++) { oscs.length = 0; ctx.currentTime += 0.2; a.sfx('sugar'); const o = oscs[0]; sugarSteps.push(o ? Math.round(12 * Math.log2(o.frequency.ev[o.frequency.ev.length - 1][1] / 440)) : -99); }
    ctx.currentTime += 1; oscs.length = 0; a.sfx('sugar'); const sugarReset = a._sugN;
    // the won result room
    const w = mk(false); w.sfx('win'); w.menuKind = 'result'; const r1 = w._winRoom(); w.menuKind = 'title'; const r2 = w._winRoom();
    const l = mk(false); l.sfx('win'); ctx.currentTime += 1; l.sfx('lose'); l.menuKind = 'result';
    // nudge
    oscs.length = 0; ctx.currentTime += 1; a.sfx('nudge'); const nudge = oscs.filter((o) => o.type === 'sine').map((o) => first(o.frequency));
    return { session, countBeat: a.countBeat(), countClimb, climb, comboLowSemis: semis, comboLowHeartSkip: heartSkip, dashReadyF, sugarSteps, sugarReset,
      winRoom: [r1, r2], loseRoom: l._winRoom(), nudge, nudgeInKey: nudge.length === 2 && nudge.every((f) => inPenta(f, 0)) && nudge[1] > nudge[0] };
  }
  // round 4's audio rules, on a recording stand-in for an AudioContext (node, no audio). Returns:
  //   dm: zone 4's Dm chord ([-7, -4, 0]); fixG: the ladder's G (link 4, key 0) under Am and under E ([10, 11] semitones);
  //     whistleFix: a whistled G under E lands on G# (true); ladderOk: _ladderCheck() is empty
  //   arb: { alone, demoted, outranks, later, frenzyTier }: crashes built by a trick alone (> 0), by a trick 0.1 s after a
  //     frenzy (0), by an egg 0.1 s after a frenzy (> 0), by a trick 0.5 s after one (> 0); the second frenzy's tier still books (2)
  //   zoneVowel: the zone choir's F1 target in zone 3 (the goo: 'ee', 270 Hz); deal: its tag's 3 notes rising, in key, 90 ms apart
  //   afford: { f, peak, sum, step }: E6 and G#6 in A, the triangle's 0.12 peak, the voices summing to CUE_VOL.afford, and a
  //     second call within AFFORD_WIN a whole step up (2 semitones)
  //   overclock / medley: the rev's end notes for n 1..4 and the run's 4 notes, each rising and in key
  //   tight: a { tight: 1 } close builds a 4 kHz+ edge filter the plain one does not
  //   story: { duck, built, off }: the groove's gain under a story stage (STORY_DUCK x), music-box tines built on the story bus,
  //     and the duck gone after story(0); menuTrim: the waiting room's intensity gain (0.85 x MENU_TRIM)
  //   gentle: { calm, keep, off, attack }: setGentle(true) turns calm on, setCalm(false) keeps it while gentle, setGentle(false)
  //     lets go, and a 'hit' under gentle attacks in 60 ms or more
  //   cues: every new cue builds sound, and nothing when muted (mutedSilent)
  static _cue4Facts() {
    const oscs = [], srcs = [], filt = [], gains = [];
    const param = (v) => ({ value: v, ev: [], setValueAtTime(x, t) { this.ev.push([t, x]); }, exponentialRampToValueAtTime(x, t) { this.ev.push([t, x]); },
      linearRampToValueAtTime(x, t) { this.ev.push([t, x]); }, setTargetAtTime(x, t) { this.ev.push([t, x]); this.value = x; }, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(1), frequency: param(440), Q: param(1), detune: param(0), playbackRate: param(1), pan: param(0), type: '' });
    const ctx = { currentTime: 1, state: 'running', sampleRate: 44100, createStereoPanner: node,
      createGain: () => { const g = node(); gains.push(g); return g; },
      createBiquadFilter: () => { const f = node(); filt.push(f); return f; }, createBufferSource: () => { const b = node(); srcs.push(b); return b; },
      createOscillator: () => { const o = node(); oscs.push(o); return o; } };
    const mk = () => { const a = new Audio(); a._hasSession = () => false; a.ctx = ctx; a._cap = 1e9; a.fx = node(); a.fxEcho = node(); a.music = node(); a.tlp = node(); a.mlp = node(); a.slp = node(); a.mduck = node(); a.echo = node(); return a; };
    const clear = () => { oscs.length = 0; srcs.length = 0; filt.length = 0; gains.length = 0; };
    const run = (a, name, k, dt = 1) => { ctx.currentTime += dt; clear(); a.sfx(name, k); return oscs.slice(); };
    const first = (p) => (p.ev.length ? p.ev[0][1] : p.value);
    const crashes = () => filt.filter((f) => f.type === 'highpass' && first(f.frequency) === 4500).length;
    const rising = (fs) => fs.length > 1 && fs.every((f, j) => j === 0 || f > fs[j - 1]);
    // harmony
    const h = mk(); h.chord = PROG[0]; const g0 = Math.round(12 * Math.log2(h._scaleF(4, 440, 0) / h._runBase(4, 440, 0)));
    h.chord = [7, 11, 14]; const g1 = Math.round(12 * Math.log2(h._scaleF(4, 440, 0) / h._runBase(4, 440, 0)));
    clear(); h._whistle(1, 440 * st(10), 0.2, 10); const whistleFix = oscs.length > 0 && Math.abs(first(oscs[0].frequency) / 0.94 - 440 * st(11)) < 0.01;
    // stinger arbitration
    const arb = {};
    { const a = mk(); run(a, 'trick', { kinds: [] }); arb.alone = crashes(); }
    { const a = mk(); run(a, 'frenzy', 1); run(a, 'trick', { kinds: [] }, 0.1); arb.demoted = crashes(); arb.demotedSings = oscs.length > 0; }
    { const a = mk(); run(a, 'frenzy', 1); run(a, 'egg', undefined, 0.1); arb.outranks = crashes(); }
    { const a = mk(); run(a, 'frenzy', 1); run(a, 'trick', { kinds: [] }, 0.5); arb.later = crashes(); }
    { const a = mk(); run(a, 'frenzy', 1); run(a, 'frenzy', 2, 0.1); arb.frenzyTier = a._ftier; }
    // zone vowel and deal
    const z = mk(); z._zone = 2; run(z, 'zone'); const zoneVowel = Math.min(...filt.filter((f) => f.type === 'bandpass').map((f) => f.frequency.ev.length > 1 ? f.frequency.ev[1][1] : 1e9));
    const dl = mk(), dt = of4(run(dl, 'deal'), 'triangle'), df = dt.map((o) => first(o.frequency)), dts = dt.map((o) => o.frequency.ev[0][0]);
    const deal = { notes: df.length, rising: rising(df), inKey: df.every((f) => inPenta(f, 0)), gap: dts.length === 3 && Math.abs(dts[1] - dts[0] - 0.09) < 1e-6, cym: srcs.length > 0 };
    // afford
    const af = mk(), at = run(af, 'afford'), tri = of4(at, 'triangle');
    const lv = (o) => { const g = gains[oscs.indexOf(o)]; return g ? Math.max(...g.gain.ev.map((x) => x[1])) : 0; };   // tone(): one gain per oscillator, in order
    const pairLv = at.slice(0, 3).map(lv), affF = [first(tri[0].frequency), first(tri[2].frequency)];
    const a2 = of4(run(af, 'afford', undefined, 0.2), 'triangle');
    const afford = { f: affF.map((f) => Math.round(f * 10) / 10), peak: Math.round(1000 * pairLv[0]) / 1000, sum: Math.round(1000 * pairLv.reduce((x, y) => x + y, 0)) / 1000,
      step: Math.round(12 * Math.log2(first(a2[0].frequency) / affF[0])) };
    // overclock, medley
    const oc = mk(), overclock = [1, 2, 3, 4].map((n) => { const tr = of4(run(oc, 'overclock', { n }), 'triangle'); return tr.length ? first(tr[0].frequency) / 2 : 0; });
    const md = mk(), medley = of4(run(md, 'medley'), 'triangle').map((o) => first(o.frequency));
    // close tight
    const cl = mk(); run(cl, 'close'); const plainEdge = filt.some((f) => first(f.frequency) >= 4000); run(cl, 'close', { tight: 1 }); const tightEdge = filt.some((f) => first(f.frequency) >= 4000);
    // story and the menu trim
    const sy = mk(); sy.igain = node(); sy.storyBus = node(); sy._int = 1; const g1v = sy._igainV(); sy.story(1); const duck = sy._igainV() / g1v;
    clear(); ctx.currentTime += 1; sy._sNext = ctx.currentTime; sy.tick(); const built = oscs.length; sy.story(0); const off = sy._igainV() === g1v;
    const mt = mk(); mt._int = 0.3; const menuTrim = mt._igainV();
    // gentle
    const ge = mk(); ge.setGentle(true); const gCalm = ge.calm; ge.setCalm(false); const keep = ge.calm; ge.setGentle(false); const gOff = !ge.calm;
    ge.setGentle(true); run(ge, 'hit');
    const hg = gains.filter((g) => g.gain.ev.length > 1 && g.gain.ev[0][1] === 0.0001).map((g) => g.gain.ev[1][0] - g.gain.ev[0][0]);   // every enveloped voice's attack
    const gentle = { calm: gCalm, keep, off: gOff, attack: hg.length ? Math.round(1000 * Math.min(...hg)) / 1000 : 0 };
    // every new cue sounds, and is silent when muted
    const names = ['deal', 'afford', 'overclock', 'medley', 'buzzer', 'perk', 'storyReveal', 'doorbell'];
    const cm = mk(), cues = names.every((n) => { run(cm, n, { n: 2 }); return oscs.length + srcs.length > 0; });
    const mu = mk(); mu.muted = true; const mutedSilent = names.every((n) => { run(mu, n); return oscs.length + srcs.length === 0; });
    return { dm: ZONE_FLAVOR[3].prog[2].slice(), fixG: [g0, g1], whistleFix, ladderOk: Audio._ladderCheck().length === 0, arb, zoneVowel, deal, afford,
      overclock: { rising: rising(overclock), inKey: overclock.every((f) => f > 0 && inPenta(f, 0)) }, medley: { n: medley.length, rising: rising(medley), inKey: medley.every((f) => inPenta(f, 0)) },
      tight: tightEdge && !plainEdge, story: { duck: Math.round(1000 * duck) / 1000, built: built > 0, off }, menuTrim: Math.round(1000 * menuTrim) / 1000, gentle, cues, mutedSilent };
  }
  // render the mix offline and measure it (browsers only: needs OfflineAudioContext; node returns null). Returns dB values:
  //   mids / pres / low: the L1 race groove's energy in 250..2000, 2000..5000 and 70..250 Hz; presUnderMidsDb = mids - pres
  //   linkPeakDb / breakPeakDb: the sample peak of a link (n 5) and of a comboBreak (n 12) alone; breakOverLinkDb their
  //   difference (also on the 50 ms RMS: breakOverLinkRmsDb)
  //   dashReadyUnderMusicDb: the groove's RMS minus dashReady's 50 ms RMS peak
  //   menuOverRaceDb / menuOverL0Db: the waiting room's groove (opts.menuKind, 'title' by default) RMS over the L1 / L0 race
  //   groove's; menuPhoneOverRaceDb / menuPhoneOverL0Db: the same in the 300..6000 Hz band a phone speaker plays
  //   grooveRmsDb: the L1 race groove's RMS in dBFS. FRENZY (the L2 groove at tier 1): frenzyMedianDb (its median 50 ms
  //   RMS), frenzyBusyPeakDb / frenzyBurstPeakDb (with a link 30 every 0.75 s / 12 links in 1 s), busyLinkOverFrenzyDb (the
  //   150 ms after each link in the busy render over the median), link5OverFrenzyDb / link30OverFrenzyDb (a lone link's 50 ms
  //   max over the median), link60OverLink5Db; dash50Db / dashUnderLinkPeakDb; steerUnderMusicDb (steerLevel(800));
  //   hypeHatLiftDb (hype(8, 0)'s 5..12 kHz over the plain groove's); goldUnderLinkPeakDb (the gold sting)
  // opts: { secs: 8, I: 1 } for the groove. Each render builds a fresh graph with no voice cap.
  static async measureMix(opts = {}) {
    const OAC = typeof globalThis !== 'undefined' && (globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext);
    if (!OAC) return null;
    const sr = 44100, db = (x) => 20 * Math.log10(Math.max(1e-9, x));
    // the compressors start cold (their envelopes need about 0.2 s), so everything is built at AT s, from a suspend, and
    // only what follows is measured
    const AT = 0.3;
    // later: [[s after AT, fn(a)], ...] run at those render times (each on its own suspend), so a sfx can land mid-groove.
    // The context reads 'running' inside every callback (the live game's checks: gold sting, macroHum, the swim bed)
    const render = async (secs, setup, later = []) => {
      const c = new OAC(2, Math.ceil((secs + AT) * sr), sr), a = new Audio(); a._build(c); a._cap = 1e9;
      try { Object.defineProperty(c, 'state', { get: () => 'running' }); } catch (e) { /* keep the real one */ }
      if (c.suspend) {
        c.suspend(AT).then(() => { setup(a); c.resume(); });
        for (const [at, fn] of later) c.suspend(AT + Math.round(at * sr / 128) * 128 / sr).then(() => { fn(a); c.resume(); });
      } else setup(a);
      const b = await c.startRendering(), L = b.getChannelData(0), R = b.numberOfChannels > 1 ? b.getChannelData(1) : L, i0 = Math.round(AT * sr), m = new Float32Array(L.length - i0);
      for (let i = 0; i < m.length; i++) m[i] = (L[i + i0] + R[i + i0]) / 2;
      return m;
    };
    const peak = (m) => { let p = 0; for (let i = 0; i < m.length; i++) p = Math.max(p, Math.abs(m[i])); return p; };
    const rmsMax = (m, w = Math.round(0.05 * sr)) => { let s = 0, best = 0; for (let i = 0; i < m.length; i++) { s += m[i] * m[i]; if (i >= w) s -= m[i - w] * m[i - w]; if (i >= w - 1) best = Math.max(best, s / w); } return Math.sqrt(best); };
    const rms = (m) => { let s = 0; for (let i = 0; i < m.length; i++) s += m[i] * m[i]; return Math.sqrt(s / m.length); };
    // band energies from Hann-windowed 4096-point FFT frames
    const bands = (m, edges) => {
      const N = 4096, out = edges.map(() => 0), re = new Float64Array(N), im = new Float64Array(N);
      for (let o = 0; o + N <= m.length; o += N / 2) {
        for (let i = 0; i < N; i++) { re[i] = m[o + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))); im[i] = 0; }
        for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
        for (let len = 2; len <= N; len <<= 1) {
          const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
          for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
        }
        for (let k = 1; k < N / 2; k++) { const f = k * sr / N, p = re[k] * re[k] + im[k] * im[k]; edges.forEach(([lo, hi], j) => { if (f >= lo && f < hi) out[j] += p; }); }
      }
      return out.map((p) => 10 * Math.log10(Math.max(1e-20, p)));
    };
    const secs = +opts.secs || 8, I = opts.I != null ? +opts.I : 1;
    // pre: an optional fn(a) after newRun and before the steps are built (FRENZY, hype); later: see render
    const grooveAt = (lv, kind, pre = null, later = []) => render(secs, (a) => {
      if (kind) a.menuKind = kind;
      a.stepI = 0; a.newRun(1); a.on = true; a.intensity = lv; a.barBase = 0; a.crashBar = 0;
      if (pre) pre(a);
      a.next = a.ctx.currentTime + 0.02; const end = a.next + secs - 0.3;
      while (a.next < end) { a._landKey(a.next); a._step(a.next); a.next += 60 / a._bpm / 4; a.stepI++; }
    }, later);
    const groove = await grooveAt(I);
    const [low, mids, pres] = bands(groove, [[70, 250], opts.midBand || [400, 2000], opts.presBand || [2000, 5000]]);
    if (opts.grooveOnly) return { low, mids, pres, presUnderMidsDb: Math.round((mids - pres) * 10) / 10 };
    // the waiting room against the race: the title groove's RMS over the L1 race groove's, and over the L0 race groove's
    const menu = await grooveAt(0.3, opts.menuKind || 'title'), l0 = await grooveAt(0.2);
    // ...and as a phone speaker hears them (only 300..6000 Hz)
    const PH = [[300, 6000]], [menuPh] = bands(menu, PH), [racePh] = bands(groove, PH), [l0Ph] = bands(l0, PH);
    const one = (name, k) => render(1.2, (a) => a.sfx(name, k));
    const link = await one('link', { n: 5, kind: 'pass' }), brk = await one('comboBreak', 12), dr = await one('dashReady'), bonk = await one('bonk');
    const [bonkPh] = bands(bonk, PH), [linkPh] = bands(link, PH);
    const r = (x) => Math.round(x * 10) / 10;
    // the 50 ms RMS's median over a render (25 ms hops): what the groove "usually" sounds like under a link
    const median50 = (m) => { const w = Math.round(0.05 * sr), h = w >> 1, v = []; for (let o = 0; o + w <= m.length; o += h) { let q = 0; for (let i = o; i < o + w; i++) q += m[i] * m[i]; v.push(q / w); } v.sort((x, y) => x - y); return Math.sqrt(v[v.length >> 1] || 0); };
    // FRENZY (tier 1 on the L2 groove) alone, and with a link (30) on every 0.75 s from 0.5 s (the busy case: dips, peak)
    const frz = (a) => { a._ftier = 1; a._applyInt(); a.combo = 30; };
    const LT = []; for (let x = 0.5; x < secs - 0.6; x += 0.75) LT.push(x);
    const frenzy = await grooveAt(1.4, null, frz), busy = await grooveAt(1.4, null, frz, LT.map((x) => [x, (a) => a.sfx('link', { n: 30, kind: 'pass' })]));
    // ...and a burst: links 50..61 every 90 ms from 1 s (a slingshot run through a pack), its peak
    const burst = await grooveAt(1.4, null, frz, Array.from({ length: 12 }, (_, j) => [1 + 0.09 * j, (a) => a.sfx('link', { n: 50 + j, kind: j & 1 ? 'weave' : 'slingshot' })]));
    const link30 = await one('link', { n: 30, kind: 'pass' }), link60 = await one('link', { n: 60, kind: 'pass' }), dash = await one('dash');
    const fMed = median50(frenzy), atLinks = LT.map((x) => { const i0 = Math.round(x * sr); return rmsMax(busy.subarray(i0, i0 + Math.round(0.15 * sr))); }).sort((x, y) => x - y);
    // the steering swish at full sideways speed (steerLevel(800) for 1.2 s, in the race) against the L1 groove
    const steer = await render(1.2, (a) => { a.on = true; a._int = 1; a.steerLevel(800); });
    // hype: the L1 groove with hype(8, 0) held (the hat bus +3 dB and the shaker), its 5..12 kHz band over the plain groove's;
    // and the gold sting alone (hype(0, 0) then hype(0, 0.15): one rising edge)
    const hyped = await grooveAt(1, null, (a) => a.hype(8, 0));
    const [gHi] = bands(groove, [[5000, 12000]]), [hHi] = bands(hyped, [[5000, 12000]]);
    const gold = await render(1.2, (a) => { a.on = true; a._int = 1; a.hype(0, 0); a.hype(0, 0.15); });
    return {
      grooveRmsDb: r(db(rms(groove))), frenzyRmsDb: r(db(rms(frenzy))), frenzyMedianDb: r(db(fMed)), frenzyBusyPeakDb: r(db(peak(busy))), frenzyBurstPeakDb: r(db(peak(burst))),
      link5OverFrenzyDb: r(db(rmsMax(link)) - db(fMed)), link30OverFrenzyDb: r(db(rmsMax(link30)) - db(fMed)), link60OverLink5Db: r(db(rmsMax(link60)) - db(rmsMax(link))),
      busyLinkOverFrenzyDb: r(db(atLinks[atLinks.length >> 1]) - db(fMed)),
      linkPeak30Db: r(db(peak(link30))), linkPeak60Db: r(db(peak(link60))), link60OverMusicRmsDb: r(db(rmsMax(link60)) - db(rms(groove))),
      dash50Db: r(db(rmsMax(dash))), dashPeakDb: r(db(peak(dash))), dashUnderLinkPeakDb: r(db(peak(link)) - db(peak(dash))),
      steerRmsDb: r(db(rms(steer.subarray(Math.round(0.3 * sr))))), steerUnderMusicDb: r(db(rms(groove)) - db(rms(steer.subarray(Math.round(0.3 * sr))))),
      hypeHatLiftDb: r(hHi - gHi), goldPeakDb: r(db(peak(gold))), goldUnderLinkPeakDb: r(db(peak(link)) - db(peak(gold))),
      low: r(low), mids: r(mids), pres: r(pres), presUnderMidsDb: r(mids - pres),
      linkPeakDb: r(db(peak(link))), breakPeakDb: r(db(peak(brk))), breakOverLinkDb: r(db(peak(brk)) - db(peak(link))),
      breakOverLinkRmsDb: r(db(rmsMax(brk)) - db(rmsMax(link))),
      dashReadyUnderMusicDb: r(db(rms(groove)) - db(rmsMax(dr))),
      menuOverRaceDb: r(db(rms(menu)) - db(rms(groove))), menuOverL0Db: r(db(rms(menu)) - db(rms(l0))),
      menuPhoneOverRaceDb: r(menuPh - racePh), menuPhoneOverL0Db: r(menuPh - l0Ph),
      bonkPeakDb: r(db(peak(bonk))), bonkOverLinkDb: r(db(peak(bonk)) - db(peak(link))), bonkOverLinkRmsDb: r(db(rmsMax(bonk)) - db(rmsMax(link))),
      bonkPhoneOverLinkDb: r(bonkPh - linkPh),
    };
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
      this.tone('triangle', f * 1.02, f, q + j * 0.04, last && n >= 25 ? 0.3 : 0.07, (0.22 - 0.01 * j) * BRK_RUN, fx, 0.003, 0.015);
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
  // the dodge / pop link's "aww" (f: the link's note): rationed so a burst of them never loops. At most one per AWW_GAP s
  // and none from link AWW_MAX on (the ladder layers own a long chain); the vowel pairs alternate ('ah' -> 'oo', then
  // 'oh' -> 'uh'), and one within AWW_RUN s of the last sings 2 pentatonic degrees lower (AWW_DEEP steps at most): it deflates
  _aww(now, q, f, n, K, fx) {
    if (n >= AWW_MAX || now - this._awwT < AWW_GAP) return;
    this._awwN = now - this._awwT < AWW_RUN ? Math.min(AWW_DEEP, this._awwN + 1) : 0;
    this._awwT = now;
    let af = f / 2; while (af > 420) af /= 2; while (af < 200) af *= 2;
    if (this._awwN) {         // the nearest pentatonic degree of af, then 2 degrees down per step
      const r = 440 * st(K), s = 12 * Math.log2(af / r); let D = 0, be = 1e9;
      for (let d = -12; d <= 20; d++) { const e = Math.abs(penD(d) - s); if (e < be) { be = e; D = d; } }
      af = r * st(penD(D - 2 * this._awwN));
    }
    const v = this._awwV; this._awwV ^= 1;
    this.say(q, [af], v ? 'oh' : 'ah', v ? 'uh' : 'oo', 0.16, 0.06, 0.08, 0.84, fx, 0);
  }
  // the pitched tail of a pass or link: the ladder gains weight as it climbs, 0.42 up to link 12, then 0.006 more per link,
  // up to 0.72 (link 62): it keeps growing all the way to link 60, so a 60 chain stands 4+ dB over a 5 (MIX_MEASURED)
  _tailVol(n) { return Math.min(0.72, 0.42 + 0.006 * Math.max(0, n - 12)); }
  // a link's tail level: _tailVol with the long chain's extra body (LINK_BODY, LINK_TOP)
  _linkVol(n) { return Math.min(LINK_TOP, this._tailVol(n) * (1 + LINK_BODY * this._linkX(n))); }
  _linkX(n) { return Math.max(0, Math.min(1, (n - 12) / 18)); }   // 0 up to link 12, 1 from link 30
  // the layers a long combo earns on every blip: 10+ an octave, 20+ three pentatonic steps up (a fifth, or a minor sixth
  // on the 4th degree: never out of the scale) and the octave splits to -0.4 / +0.4, two voices at 0.6x each, 30+ a
  // sparkle, 40+ a detuned unison, 65+ a whistled octave on every 2nd link, 100+ a vocal "yeah" chop on every 5th.
  // All low priority (the first voices the cap drops).
  _layers(q, f, n, dest) {
    if (n >= 20 && this._layPan && !this.mono) { for (const p of this._layPan) this.tone('sine', fold(f * 2), 0, q + 0.005, 0.06, 0.09 * 0.6, p, 0.003, 0, 0); }
    else if (n >= 10) this.tone('sine', fold(f * 2), 0, q + 0.005, 0.06, 0.09, dest, 0.003, 0, 0);
    if (n >= 20) { const d = ladderDegree(n), k = this.key, up = this._chordFix(k + pen(d + 3), k) - this._chordFix(k + pen(d), k); this.tone('sine', fold(f * st(up)), 0, q + 0.005, 0.06, 0.07, dest, 0.003, 0, 0); }
    if (n >= 30 && this.live <= this._cap - 8) this.hum(q, 0.015, 0.05, 'highpass', 7000, 0.7, dest, 0, 0.001, 0);
    if (n >= 40) for (const c of [-8, 8]) { const o = this.tone('triangle', f, 0, q, 0.07, 0.05, dest, 0.003, 0, 0); if (o) o.detune.value = c; }
    if (n >= 65 && (n & 1) === 0) { const w = fold(f * 2, 3000); this.tone('sine', w * 0.97, w, q, 0.09, 0.04, dest, 0.008, 0.03, 0); }
    if (n >= 100 && n % 5 === 0 && !(this.ctx && this.ctx.currentTime - this._msAt < MS_SOLO)) { let v = f; while (v > 440) v /= 2; while (v < 220) v *= 2; this.say(q, [v], 'eh', 'ay', 0.13, 0.06, 0.04, 1, dest, 0); }
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
  // names: pass (k = combo), link ({ n, kind }), sugar, dna, shield, alkali, dash, bonk, bump, hit,
  // pop, frenzy (k = tier), frenzyEnd, second, zone, egg, pick, cards, reroll, drill (k = taps),
  // win (k = rival index when you beat a drilling rival), lose, tap (k = 0..1), buy, combo (k = combo),
  // comboEnd (k = combo, or { n }: longer and lower for a bigger chain), comboBreak (k = the combo it destroyed: <10 a scratch, 10+ a falling run and a dry beat,
  // 25+ a longer run, a 900 Hz dip and a dry bar), comboBank (k = grade 0..4), boss (k = rival index), bossTaunt (k),
  // eggClaim, drillShove, surf, heart, synergy (k = fresh), close, thread, blast (k = count),
  // record, legendary, milestone, event, lowE, lockon (k = pan -1..1), clutch, finisher (k = grade 0..4),
  // style (k = level 3..6), loseClose, drillLead (k = +1 you lead, -1 a rival does), rivalShove, again, ready,
  // synTease, swat, tell (k = wall side -1..1), comboLow (k = comboT / comboMax, or { f, grade }),
  // comboMilestone (k = { n }: 40, 60, 80, 100, 150, 200, then every 100; each one louder and lifting the key higher). lose (k) and eggClaim (k) take the rival index to play the
  // thief's motif; lowE (k = 1 when critical). drillLead also takes core's event { k, kevin } (k = rival index,
  // -1 Kevin), which names the rival for the duel ostinato. dnaTick ({ i, n, grade? }: helix i of n lands),
  // rivalTell (k = rival index), countered, factory (k = 0..3 fill level), countTick (k = 0..1), medal (k = tier 1..3),
  // spot (k = { pan }: one gap per side), trick ({ id, first, kinds }), domino (k = chain length), whoosh ({ pan }). comboBank (k = grade, or { grade, cascade: true } for the whole coin run).
  // trickTease ({ step: 2, id }: two links of a trick in), trickMiss (its window lapsed), draftOn (a draft pick locks in),
  // lesson (k = 0.33 / 0.66 / 1: a tutorial step learned, a rising arpeggio that ends on the tonic at 1),
// slingReady, goal (a goal reached), pastBest (swam past your best distance), grudge (k = the beaten grudge rival's index).
  // trickStreak (k = { n }: tricks back to back, n 1..; n >= 2 also lifts the key until the chain banks or breaks),
  // overtaken ({ k, pan }: a rival swims past you), gift (a free sugar), bounty (the bounty stamp), spareBite (the
  // spare life takes a bite), gateNear / gateNearSlide (k = pan -1..1: a gate coming up, a sliding one sings a fourth
  // higher). pop (k = the chain number 1, 2, 3...; without one, pops under 0.7 s apart climb). edge (k = side -1..1: grazing the tube's edge, a click fully
  // on that side, throttled to 120 ms; 'wall' stays the body bounce), dashPop (k = pan: a dash pops something).
  // pounce ({ pan, dur }: a Lunger's crouch, the snap lands at dur), babble ({ k, n, pan }: a rival talks, n syllables),
  // rivalOuch (k = rival index), dashReady (the dash is charged), quit (a quit or a sim fault: a tape stop and one soft pluck,
  // never a jeer), swerve ({ pan, v }: a quick steer, rate-limited here), gooIn ({ surf }: into the goo), maxed ({ id,
  // capstone }: a mutation maxed out; only a capstone gets the brass), tally ({ i, n }: one cash-in multiplier step).
  // boop (bumping a dozing popcorn Macro: a soft boing under a bump), acidIn (the first touch of an acid puddle: a "tss").
  // deal (the card reveal: a reversed cymbal into a 3-note tag in key; 'zone' then follows the pick), afford (a price in
  // reach, on the next 8th; repeats within 0.6 s climb a whole step), overclock ({ n } 1..4: a rev a degree higher per step),
  // medley (a 4-note run up), buzzer (a crowd "ooh" into a bright hit), close ({ tight: 1 }: a RAZOR miss's sharper edge),
  // perk (a habit perk's gold sparkle), storyReveal and doorbell (also A.storyReveal(), A.doorbell()).
  // tailFlick ({ vx, dir }: the tail whips the other way, vx px/s and dir -1 / +1; a 25..35 ms flick 18 dB under the beat, at
  // most one per 110 ms), birth ({ first }: also A.birth()), win ({ k, arrived: [rival indices] } also works: the door slam
  // plays every arrived loser's motif behind the door), lose ({ k, close: true } also works: a close loss gets the full sting).
  // Stingers under 0.4 s apart are arbitrated (see the end of sfx()): the lower ranked one plays without kick, crash and duck.
  // record is the true NEW RECORD only. While a win/lose stinger rings, record and medal answer it (see _outAnswer).
  // A medal within 0.5 s of a record plays 0.5 s after the record instead of on top of it.
  sfx(name, k) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime, t = now + SFX_T;
    // 'swerve' is only flavour: silent while the egg drill runs (and not even rate-limited then)
    if (name === 'swerve' && this._drillOn) return;
    if (name === 'count' && this._openAt > now) return;   // the opening's count-in is the count (see openingCue)
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
        this._streakCut(now);   // the shatter takes every trick streak layer with it
        endCombo(); break;
      }
      case 'finisher': {        // a drop: every stem but the kick cuts out for one beat, then a crash on the next downbeat
        endCombo();
        if (this.on) { this._dryUntil = Math.max(this._dryUntil, this._unsched(now) + 4 * (60 / this._bpm / 4)); this.crashNext = true; }
        break;
      }
      case 'comboEnd': endCombo(); break;
      case 'comboMilestone': {  // k = { n } (or the bare link count): milestone m lifts the key 2 + m semitones (at most 5)
        this._msAt = now;
        const lift = Math.min(2 + milestoneIndex(numArg(k, 'n')), 5);
        if (lift > this._mlift) { this._mlift = lift; this._rekey(true); }
        break;
      }
      // a streak of 2+ lifts the key like a combo milestone, until the chain banks or breaks (endCombo drops it)
      // and every streak step stacks a stem layer on the groove for TS_HOLD s (see _streakLayers)
      case 'trickStreak': { const n = numArg(k, 'n') | 0; if (n >= 2 && !this._mlift) { this._mlift = 2; this._rekey(true); } this._streakOn(Math.max(1, n), now); break; }
      case 'dna': this._dnaN = now - this._dnaT <= 1.2 ? Math.min(8, this._dnaN + 1) : 0; this._dnaT = now; break;
      case 'sugar': this._sugN = now - this._sugT <= SUG_WIN ? Math.min(SUG_TOP, this._sugN + 1) : 0; this._sugT = now; break;
      case 'win': this._wonAt = now; this._winGlide = -1; break;   // the result screen opens up after it (see _applyTlp)
      case 'lose': {            // one more death this session: deaths 1..LOSE_FULL, every LOSE_EVERY-th and a close loss get the
        // full sting, the rest the short one (see _loseSting; rematchMusic(true) right after upgrades a short one)
        this._wonAt = -1; this._deaths++;
        this._loseFull = this._deaths <= LOSE_FULL || this._deaths % LOSE_EVERY === 0 || !!(k && typeof k === 'object' && k.close);
        break;
      }
      case 'quit': this._wonAt = -1; break;
      case 'pop': {             // k = the chain number main.js shows (1, 2, 3...; or { chain }): the chirp follows the picture.
        // With none, pops under POP_WIN s apart count as a chain
        const ch = numArg(k, 'chain');
        this._popN = ch >= 1 ? Math.min(6, Math.floor(ch) - 1) : now - this._popT <= POP_WIN ? Math.min(6, this._popN + 1) : 0;
        this._popT = now; break;
      }
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
      case 'frenzyEnd': this.linkLift(0, 0); this._dropEnd(true); break;   // main.js calls linkLift(0, 0) too; this keeps a stale lift from outliving FRENZY (a medley drop ends here too)
      // a medley ({ n, mk }) is a trickStreak step too (main.js plays it instead of 'trickStreak'): the layers step up, a streak
      // of 2+ lifts the key like trickStreak, and the band drops out for a bar and slams back a key up (see _medleyDrop)
      case 'medley': {
        const n = Math.max(1, numArg(k, 'n') | 0), lift = n >= 2 && !this._mlift;
        if (lift) this._mlift = 2;
        this._streakOn(n, now);
        if (!this._medleyDrop(now, k && typeof k === 'object' ? +k.mk || 0 : 0) && lift) this._rekey(true);
        break;
      }
      case 'streakEnd': this._streakFade(now); break;
      // GO before the opening's count-in is done (ui did not wait for openingGoIn()): the count-in stops and the groove's
      // first downbeat moves onto GO's own beat
      case 'go': if (this._openAt > now + 0.1 && this.on) { this._openCut(now); this._openPhase(now + 0.01, true); this._openAt = -1; } break;
      // the card draft's pick: the band drops back in on the next downbeat (the muffle opens to 18 kHz right there, the hats
      // go back through the band, a crash), even while muted (the filter is the music's)
      case 'pick': if (this._draft && this.mlp && this._pickOpen < 0) {
        const q = this._grid(now, 16), p = this.mlp.frequency;
        this._pickOpen = q; hold(p, now); p.setTargetAtTime(18000, Math.max(now, q - 0.02), this._ftc(0.012)); this._hatRoute(false, q);
        if (!this.muted && c.state === 'running') this.crash(q, 0.9, this.music, 1);
      } break;
      case 'frenzy': { const tier = Math.max(1, numArg(k, 'tier') | 0); this._ftier = tier; this._frzTier = tier; this._applyInt(); if (tier >= 3 && !this._lift) { this._lift = 1; this._rekey(true); } break; }
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
      case 'egg': {             // the biggest beat: the hit waits for the next downbeat at least FIN_SW away (eggLead), and the
        // key lifts 2 semitones right on it (a whoop on the bar before when there is still room for it)
        const sp = 60 / this._bpm / 4;
        let hit = t + FIN_SW, bar = -1;
        if (this.on && c.state === 'running' && this.next && gridOk(this.next, now, sp)) {
          hit = this._grid(now, 16); while (hit < t + FIN_SW - 1e-4) hit += 16 * sp;
          bar = (this.stepI + Math.round((hit - this.next) / sp)) >> 4;
        }
        if (!this._elift) {
          this._elift = 2; this._rekey(true);
          if (bar >= 0 && this._keyNext !== null) { this._keyBar = bar; this._whoopBar = bar - 1; }
        }
        this._eggHit = hit; this._eggLead = hit - now;
        break;
      }
    }
    if (this.muted) {
      // the same bookkeeping as the audible path: a jingle right after a muted win or lose still knows the finishing key
      if (name === 'win' || name === 'lose') { this._outK = this.key; this._outAt = now + (name === 'win' ? 2.3 : 1.6); this._outUntil = now + (name === 'win' ? 3.8 : 3); this._resetSong(); }
      if (name === 'quit') { this._outK = this.key; this._outAt = now + 0.3; this._outUntil = now + 1; this._resetSong(); }
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
    const blast5 = name === 'blast' && numArg(k, 'n') >= 5;
    const big = BOOST.has(name) || blast5 || name === 'buzzer', base = this.fx, rescue = this.sfxMuted && (name === 'win' || name === 'lose' || name === 'quit');
    const sting = this.calm && STING[name] > 0;
    let fx = rescue ? this._gain(0.8 * this._mLevel(), this.slp) : sting ? this._gain(CALM_SEND, base) : big ? this._gain(this.calm ? 0.8 : 1.25, base) : base;
    if ((big || rescue || sting) && this.calm) this._minA = 0.015;
    // gentle sound: the stingers and the impacts 4 dB down, nothing attacking faster than 60 ms
    if (this.gentle && (big || STING[name] > 0 || name === 'zone' || IMPACTS.has(name))) { fx = this._gain(GENTLE_DB, fx); this._minA = GENTLE_A; }
    this.fx = fx; this._sfxBase = base;
    if (sting) this._calmCap(now, STING[name]);
    this._fxR = UI_SFX.has(name) || TONAL.has(name) ? 1 : this._rateNow(now);   // slow-mo bends every other effect built below
    // a win/lose stinger still ringing: everything plays in the key it finished in, not the reset song's key 0
    let K = now < this._outUntil ? this._outK : this.key, sNow = now, sT = t;
    // stinger arbitration: a stinger under STING_WIN s after another drops its kick, crash and duck layers (_demo), sings
    // its choir and riser in the first one's key and lands on the next 8th, unless it outranks the first (SPRI). The state
    // above (_ftier, the lifts, the holds) is already booked either way
    if (name !== 'buzzer' && name !== 'perk' && (BOOST.has(name) || STING[name] > 0 || name === 'zone' || blast5)) {
      const pr = SPRI[name] || 0;
      if (now - this._stingAt < STING_WIN && pr <= this._stingP) {
        this._demo = true; K = this._stingK;
        if (!STING_KEEP_T.has(name)) { sT = this._grid(now, 2); sNow = sT - SFX_T; }
      } else { this._stingP = pr; this._stingK = name === 'zone' || name === 'egg' ? this.keyTarget : name === 'frenzy' ? this.key : K; }
      this._stingAt = now;
    }
    try { this._sfx(name, k, sNow, sT, K, fx); } finally { this._hd = 0; this._hv = 1; this.fx = base; this._minA = 0; this._fxR = 1; this._demo = false; }
  }
  _sfx(name, k, now, t, K, fx) {
    const c = this.ctx, kf = (f) => this._inKey(f * st(K), K);   // a pickup pitch, moved into the song's key (G# under an E chord)
    switch (name) {
      case 'pass': {            // a blip that climbs the pentatonic scale: a tick right now, the pitched tail on the beat
        let q = this._quantCap(now);
        const n = +k || 0, prev = this._lastPassN; this._lastPassN = n;   // a drop (a break, a bank) just starts over from n
        this._hehe(now, t + 0.06, fx);   // Kevin giggles at a burst of overtakes (rationed: see _hehe), just after the blip
        // the same overtake already rang as a combo link: just a dry tick, so it never sounds doubled
        if (now - (this.last.link ?? -9) < 0.06) { this.hum(t, 0.006, 0.05, 'highpass', 5000, 0.7, fx, 0, 0.001); break; }
        const f = this._scaleF(n, 220);
        this._passF = f;
        if (n === prev && this._slotG && Math.abs(q - this._slotT) < 0.02) {   // the same n in the same 32nd: that blip a bit louder
          this._slotG.gain.value = Math.min(1.45, this._slotG.gain.value + 0.12);
          break;
        }
        // coalesced overtakes (n jumped by more than 1): the skipped degrees as a grace-note roll that climbs into the note
        const gap = prev >= 0 && n > prev + 1 ? Math.min(4, n - prev - 1) : 0;
        if (gap) {
          const need = t + gap * PASS_ROLL, sp = 60 / this._bpm / 4;
          if (q < need) { if (q > t + 0.002) { while (q < need) q += sp / 2; } else q = need; }   // room for the roll, still on the grid
        }
        this._transient(t, f, fx, TR_HARD); this._leadDip(q);
        const sg = this._gain(1, fx); this._slotG = sg; this._slotT = q; this._blipN++;
        for (let j = 0; j < gap; j++) {
          const gf = this._scaleF(n - gap + j, 220);
          this.tone('triangle', gf, 0, q - (gap - j) * PASS_ROLL, 0.025, 0.5 * this._tailVol(n), sg, 0.002, 0, 0);
        }
        this.tone('triangle', f * 0.97, f, q, 0.11, this._tailVol(n), sg, 0.003, 0.02);   // it has to cut through the music on a phone
        this._layers(q, f, n, sg);
        break;
      }
      case 'link': {            // a combo link: the next note of the climb, a timbre for each kind of trick
        const n = numArg(k, 'n'), kind = (k && k.kind) || 'pass', q = this._quantCap(now), f = this._scaleF(n, 440);
        this._passF = f; this._linkN = n; this._blipN++;
        this._transient(t, f, fx, TR_HARD);   // the hit lands now; only the pitched tail waits for the grid
        this._layers(q, f, n, this._ladDest(fx)); this._leadDip(q); this._presDip(q, n);
        if (this._blipN % 4 === 0) {        // every 4th link sings a note of the pad chord (lifted with the link lift)
          const ch = this.chord || PROG[0]; let cf = 440 * st(K + ch[(this._blipN >> 2) % 3]); while (cf > 880) cf /= 2; while (cf < 440) cf *= 2;
          this.tone('sine', this._llF(cf, K, q), 0, q, 0.16, 0.04, fx, 0.01);
        }
        if (kind === 'close') { this.tone('sine', f, 0, q, 0.14, 0.11, fx, 0.002); this.tone('sine', f * 2, 0, q, 0.2, 0.04, fx, 0.002); this.tone('sine', f * 3.01, 0, q, 0.1, 0.02, this.fxEcho, 0.002); }
        else if (kind === 'gate') this._pluck(q, f / 2, 0.14);
        else if (kind === 'dodge') this.tone('sine', f * 0.9, f, q, 0.12, 0.09, fx, 0.01, 0.05);
        else if (kind === 'pop' || kind === 'bump') { const p = kind === 'pop' ? f : f / 2; this.tone('square', p, p * 0.5, q, 0.04, 0.05, fx, 0.001); this.hum(q, 0.012, 0.12, 'bandpass', 2200, 2, fx); }
        if (kind === 'dodge' || kind === 'pop') {   // a little "aww" from the thing you just beat, sliding down
          this._aww(now, q + 0.07, f, n, K, fx);
        }
        else {                  // the pitched tail; under the theme hook (880..1500 Hz) it drops an octave, out of its register
          let tf = this._llF(f, K, q); if (this._themeOn) { tf /= 2; while (tf < 330) tf *= 2; }
          this.tone('triangle', tf * 0.97, tf, q, 0.11 + LINK_RING * this._linkX(n), this._linkVol(n), this._ladDest(fx), 0.003, 0.02);
          if (this._llTier >= 4) this.tone('sine', tf / 2, 0, q, 0.12, 0.03, fx, 0.003, 0, 0);   // tier 4+: the sub-octave
          // the overtake kinds get their own colour on top of the ladder note (which stays, so the climb is continuous):
          // a slingshot whips up (a triangle glide 0.75x -> 1.5x over 90 ms and a 40 ms 2 kHz noise flick), a weave steps
          // left then right (the note, then the next pentatonic degree 45 ms later), a snipe pings an octave up into the echo
          if (kind === 'slingshot') {
            this.tone('triangle', tf * 0.75, tf * 1.5, q, 0.09, 0.09, fx, 0.003, 0.09, 0);
            this.hum(q, 0.04, 0.12, 'bandpass', 2000, 1.4, fx, 0, 0.002, 0);
          } else if (kind === 'weave') {
            this.tone('triangle', tf, 0, q, 0.06, 0.08, this._panned(-0.35, fx), 0.003, 0, 0);
            this.tone('triangle', this._penNext(tf, K), 0, q + 0.045, 0.07, 0.08, this._panned(0.35, fx), 0.003, 0, 0);
          } else if (kind === 'snipe') this.tone('sine', fold(tf * 2, 3600), 0, q, 0.12, 0.05, this.fxEcho, 0.002, 0, 0);
        }
        break;
      }
      case 'sugar': {           // a fruit: a sine swoop right now and a triangle note a degree up on the grid; a streak (each
        // within SUG_WIN s) sings one pentatonic degree higher per fruit, up to SUG_TOP, with an octave sparkle from SUG_SPARK
        const n = this._sugN, a = fold(440 * st(K), 440), f = a * st(penD(8 + n)), f2 = a * st(penD(9 + n)), q = this._quantCap(now + 0.03);
        this.tone('sine', f * 0.38, f, t, 0.07, 0.2, fx);
        this.tone('triangle', f2, 0, q, 0.12, 0.1, fx);
        if (n >= SUG_SPARK) this.tone('sine', f * 2, 0, q, 0.16, 0.04, this.fxEcho, 0.003);
        break;
      }
      case 'dna': {             // coin arpeggio in key; a streak walks its root up the pentatonic
        let b0 = 440 * st(K); while (b0 > 880) b0 /= 2;
        // a 5 kHz "chink" on top as the transient; from the 4th of a streak the second note jumps an octave, above the pads
        // (the bass's octave saw and the pads live in 440..880 Hz, where the coin used to hide)
        const n = this._dnaN, b = b0 * st(pen(n)), b2 = b0 * st(pen(n + 2)) * (n >= 3 ? 2 : 1);
        this.hum(t, 0.006, 0.08, 'highpass', 5000, 0.7, fx, 0, 0.001);
        this.tone('square', b, 0, t, 0.05, 0.14, fx, 0.002);
        this.tone('square', b2, 0, t + 0.055, 0.22, 0.14, fx, 0.002);
        this.tone('sine', b * 2, 0, t + 0.11, 0.18, 0.09, fx);
        this.tone('sine', b2 * 2, 0, t + 0.15, 0.25, 0.06, this.fxEcho);
        break;
      }
      case 'shield': {          // shiny up arpeggio with a metallic ping
        [0, 4, 7, 12].forEach((s, j) => this.tone('triangle', kf(1047 * st(s)), 0, t + j * 0.045, 0.14, 0.12, fx));
        this.clang(t + 0.18, 0.5, 1600);
        break;
      }
      case 'alkali':
        this.hum(t, 0.25, 0.15, 'highpass', 5000, 0.7, fx);
        for (let j = 0; j < 6; j++) this.tone('sine', kf(1760 * st(PENTA[j % 5])), 0, t + j * 0.03, 0.03, 0.08, fx);   // sparkles up the pentatonic, in key
        break;
      case 'dash':              // Kevin's "hup!", then the whoosh with a doppler sweep and a lip "pff"
        this._kevin('hup', now, t, fx);
        // DASH PUNCH: the whoosh 0.7 (was 0.45) and wider (Q 1.0, was 1.4), a transient on the attack, the doppler sine
        // 220 -> 660 Hz at 0.22 (was 180 -> 520 at 0.16): its 50 ms max near -15 dBFS, still peaking under a link (measureMix)
        // DASH_UP on every layer: its 50 ms max reaches about -15 dBFS, its peak still 2.5..4 dB under a link's
        this._transient(t, 1200, fx, [0.14 * DASH_UP, 0.12 * DASH_UP]);
        this.hum(t, 0.32, 0.7 * DASH_UP, 'bandpass', 380, 1.0, fx, 2800, 0.04, 1, DUCK);
        this.hum(t + 0.12, 0.2, 0.2 * DASH_UP, 'bandpass', 2600, 1.2, fx, 700);
        this.tone('sine', 220, 660, t, 0.18, 0.22 * DASH_UP, fx);
        this.hum(t, 0.03, 0.3 * DASH_UP, 'bandpass', 1200, 1, fx);
        break;
      case 'bonk': {            // squelchy goo: a resonant filter sliding down and a wobbling plop
        // a failure: never louder than a link. Short (0.2 s) and the low plop (the RMS) light: in headless Chromium its RMS
        // sits within 1 dB of a link(5)'s and its peak about 3.5 dB under (it rang 0.28 s and measured 5..7 dB hotter)
        // Phone speakers: the wobble stops at 110 Hz (it fell to 55, where no phone plays), a triangle wobbles along an octave
        // up (560 -> 220 Hz, the band a phone does play) and the "oo-uh" sits at 190 Hz (was 150). BONK_HUM: see MIX_MEASURED
        this.hum(t, 0.2, BONK_HUM, 'bandpass', 1500, 7, fx, 170, 0.004, 1, DUCK);
        const o = this.tone('sine', 280, 0, t, 0.2, 0.18, fx, 0.003), W = [[150, 0.04], [210, 0.07], [110, 0.12], [130, 0.15], [110, 0.2]];
        if (o) this._wob(o, t, 280, W);
        const o2 = this.tone('triangle', 560, 0, t, 0.2, 0.08, fx, 0.003, 0, 0);
        if (o2) this._wob(o2, t, 560, W.map(([f, at]) => [f * 2, at]));
        this.say(t + 0.02, [190], 'oo', 'uh', 0.18, 0.06, 0.1, 0.7);
        break;
      }
      case 'bump': {            // springy boing off a rival
        const o = this.tone('sine', 220, 0, t, 0.22, 0.3, fx, 0.003, 0, 1, DUCK), W = [[480, 0.04], [300, 0.1], [380, 0.14], [260, 0.22]];
        if (o) this._wob(o, t, 220, W);
        const o2 = this.tone('triangle', 440, 0, t, 0.22, 0.08, fx, 0.003, 0, 0);   // its 220 Hz start an octave up, for a phone
        if (o2) this._wob(o2, t, 440, W.map(([f, at]) => [f * 2, at]));
        this.hum(t, 0.03, 0.2, 'lowpass', 1200, 1, fx);
        break;
      }
      case 'boop': {            // bumped a dozing popcorn Macro: a soft rubbery boing, 300 -> 520 Hz with a little wobble, under a bump
        const o = this.tone('sine', 300, 520, t, 0.12, 0.22, fx, 0.004);
        if (o) this._wob(o, t, 300, [[460, 0.03], [400, 0.055], [540, 0.085], [520, 0.12]]);
        this.hum(t, 0.015, 0.08, 'lowpass', 1500, 1, fx);
        break;
      }
      case 'acidIn': {          // the first touch of an acid puddle: a bright 90 ms "tss" (4.5 kHz noise) over a 600 -> 200 Hz sine drop
        this.hum(t, 0.09, 0.18, 'bandpass', 4500, 1.6, fx, 3200, 0.002);
        this.tone('sine', 600, 200, t, 0.09, 0.18, fx, 0.003);
        break;
      }
      case 'hit':               // something big hit your shield: clang plus a thud (and Kevin's "oof")
        this._kevin('oof', now, t + 0.02, fx);
        this.clang(t, 1, 420); this.tone('sine', 130, 45, t, 0.25, 0.5, fx); this.hum(t, 0.2, 0.3, 'lowpass', 900, 1, fx, 0, 0.002, 1, DUCK);
        this.duck(0.5, 0.3);
        break;
      case 'pop': {             // a kill: the bubble pop's chirp over a wet "splorp" and a kick locked to the groove
        // a chain (k = main.js's chain number, or pops under POP_WIN s apart; up to 6) walks the chirp's end note up the pentatonic, one degree a pop from
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
      case 'spareBite':         // the spare life takes the bite: a squashed "oof", the hit's thud, then the chomp (damage, not a snack)
        this.say(t, [220, 140], 'oh', 'uh', 0.14, 0.18);
        this._kevin('oof', now, t + 0.05, fx);
        this.tone('sine', 130, 45, t, 0.25, 0.5, fx); this.hum(t, 0.2, 0.3, 'lowpass', 900, 1, fx, 0, 0.002, 1, DUCK);
        this._chomp(t + 0.12, fx);
        this.duck(0.5, 0.4);
        break;
      case 'birth': {           // the baby (see birth()): every voice on a fixed grid from t, never bent (TONAL)
        const first = !!(k && k.first), m = st(K), tp = t + BIRTH_POP;
        this._revCym(tp - 0.45, tp, 0.2, fx);                                   // the swell into the white flash
        this.tone('sine', 240, 820, tp, 0.05, 0.28, fx, 0.002, 0.045);          // the membrane's soft "plp"
        this.tone('triangle', 480, 1300, tp, 0.03, 0.06, fx, 0.002, 0.03);
        this.hum(tp, 0.06, 0.2, 'lowpass', 1600, 2, fx, 500, 0.002);
        this.tone('sine', 110, 60, tp, 0.14, 0.2, fx, 0.004);
        const SB = this.storyBus || fx, bb = themeBase(K, 1800), tb = t + BIRTH_BOX;   // the music box, as in _storyStep
        THEME[0].forEach((d, s2) => {
          if (d === null) return;
          const f = bb * st(PENTA[d]), at = tb + s2 * BIRTH_SQ, len = THEME_LEN[0][s2] * BIRTH_SQ;
          this.tone('sine', f, 0, at, Math.min(1.2, len + 0.3), 0.09, SB, 0.002, 0, 1);
          this.tone('sine', f * 4, 0, at, 0.08, 0.02, SB, 0.001, 0, 0);
        });
        let gf = 440 * m; while (gf > 560) gf /= 2; while (gf < 380) gf *= 2;   // the baby's pitch, in key
        const tg = t + BIRTH_GOO;
        this.hum(tg, 0.012, 0.06, 'bandpass', 1500, 2, fx, 0, 0.001);           // "g"
        this.say(tg, [gf], 'oo', 'oo', 0.17, 0.1, 0.05, 1.12, fx, 1, 0, 30, 2);  // "goo", formants an octave up
        this.hum(tg + 0.22, 0.012, 0.06, 'bandpass', 1700, 2, fx, 0, 0.001);
        this.say(tg + 0.22, [gf * st(3)], 'oo', 'ah', 0.24, 0.11, 0.06, 0.84, fx, 1, 0, 30, 2);   // "GA", opening up and falling
        let hold = t + BIRTH_HOLD;
        if (first) {            // the first baby ever: a kazoo answers the call, and the crowd melts
          const lb = themeBase(K, 700), ta = t + BIRTH_ANS;
          THEME[0].forEach((d, s2) => {
            if (d === null) return;
            const f = lb * st(PENTA[d]), last = s2 === 12;
            this.say(ta + s2 * BIRTH_SQ, [f], 'ee', last ? 'oo' : 'eh', last ? 0.5 : THEME_LEN[0][s2] * BIRTH_SQ * 0.9, 0.08, 0.04, 1);
          });
          let af = 330 * m; while (af > 420) af /= 2;
          this.say(t + 2.0, [af * 0.992, af, af * 1.009], 'ah', 'oo', 0.6, 0.08, 0.35, 0.82, fx, 1);   // "awww"
          hold += 1;
        }
        // the stage stays the baby's: a win hold still running waits for the birth too (the jingles keep the win's key)
        if (this._holdUntil > now && hold > this._holdUntil) { this._holdUntil = hold; if (this._outUntil > now) this._outUntil = hold; }
        break;
      }
      case 'tailFlick': {       // the tail whips the other way ({ vx, dir }: px/s, -1 left / +1 right): a 25..35 ms filtered noise
        // flick and a blip at 600..1400 Hz (2 Hz per px/s), from that side, on the next 16th when it is 30 ms away or less
        const vx = Math.abs(numArg(k, 'vx')), x = Math.min(1, vx / 700), dir = Math.max(-1, Math.min(1, numArg(k, 'dir')));
        const g16 = this._next16(now), q = g16 - now <= FLICK_SNAP ? g16 : t, dest = this._panned(dir * 0.6, fx);
        const f = Math.max(600, Math.min(1400, 2 * vx)), d = 0.025 + 0.01 * x;
        this.hum(q, d, FLICK_V, 'bandpass', 2200 + 2200 * x, 1.3, dest, 0, 0.001, 0);
        this.tone('sine', f * 0.85, f, q, 0.03, FLICK_V * 0.5, dest, 0.002, 0.02, 0);
        break;
      }
      case 'frenzy': {          // impact on the frame the screen flashes, then an upward whoosh tail
        const tier = this._ftier || 1, KK = this._demo ? K : this.key, h = now + 0.01, x = tier - 1;
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
        riserFreqs(tier, KK).forEach((f, j) => this.tone('sawtooth', f, 0, now + 0.02 + j * wd / 6, 0.05, 0.045, fx));
        // and Kevin enjoys the ride: the run's first FRENZY gets his big "wooo" (_kevFrz, reset by newRun), later ones a "wheee"
        const first = !this._kevFrz; this._kevFrz = true;
        if (!(first && this._kevin('wooo', now, h + 0.05, fx))) this._kevin('wheee', now, h + 0.05, fx);
        break;
      }
      case 'frenzyEnd': {       // the power down, on the next 8th: the band's muffle sweeps 18 kHz -> 2500 Hz and back over one beat,
        // the riser's top 3 notes fall back down (riserFreqs reversed, 60 ms apart) and Kevin sighs. Outside BOOST, its peak
        // well under the frenzy stinger's (mixFacts: frenzyEndUnderFrenzyDb)
        const q = this._grid(now, 2), beat = 60 / this._bpm;
        if (this.mlp && !this._muffled && !this._draft && this.mlp.frequency.value >= LP_OPEN) {
          const p = this.mlp.frequency; this._lpWake();
          hold(p, q); p.setValueAtTime(18000, q); p.exponentialRampToValueAtTime(2500, q + beat * 0.45); p.exponentialRampToValueAtTime(18000, q + beat);
        }
        riserFreqs(this._frzTier, K).reverse().slice(0, 3).forEach((f, j) => this.tone('triangle', f, 0, q + j * 0.06, 0.09, 0.06, fx, 0.003));
        this._kevin('sigh', now, q + 0.2, fx);
        break;
      }
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
        // the choir opens onto the zone's own vowel (ZONE_FLAVOR), and the landing plays the zone's signature hit (_zoneHit);
        // the egg also gets a 5th voice (+19) and a bigger crash
        // (a demoted arrival sings in the first stinger's key, unless it lands a key change: then the new key wins, or the
        // choir would clash with the band on the downbeat)
        const KT = this._demo && this._keyNext === null ? K : this.keyTarget, Z = ZONE_FLAVOR[this._zone] || ZONE_FLAVOR[0], egg = Z.sig === 'heart';
        const ch = (egg ? [0, 3, 7, 12, 19] : [0, 3, 7, 12]).map((s) => 220 * st(KT + s));
        let land = t;
        const spb = 60 / this._bpm / 4;
        if (this._keyNext !== null && this.on && c.state === 'running' && gridOk(this.next, now, spb)) {
          const s16 = Math.max(this._keyBar * 16, (this.stepI + 15) & ~15);   // the step the key lands on
          land = Math.max(t, this.next + (s16 - this.stepI) * spb);
        }
        const st0 = Math.max(t, land - 0.25), lead = land - st0;
        this.say(st0, ch, 'oo', Z.vowel, 0.7 + lead, 0.24, Math.max(0.05, lead - 0.03), 1);
        this.B(land, 0.9, fx); this.crash(land, egg ? 1.1 : 0.7, fx);
        this._zoneHit(Z.sig, land, spb, KT, fx);
        break;
      }
      case 'go': case 'resume': {   // GO! (race start) and back from pause: "B-Pf" on the grid and a crash
        const q = this._next16(now), sp = 60 / this._bpm / 4;
        this.B(q, 1, fx); this.Pf(q + 2 * sp, 0.9, fx); this.crash(q, 0.6, fx);
        if (name === 'go') this._brass(q, fold(440 * st(K + PENTA[5]), 900), 0.25, 0.1);   // the theme's first note
        else this.hum(t, Math.max(0.12, q - t + 0.1), 0.2, 'bandpass', 300, 1.5, fx, 2400, Math.max(0.03, q - t));   // whoosh back in
        break;
      }
      case 'count': {           // the opening count ({ n } 3, 2, 1) on the next quarter note: 3 a kick, 2 a "Pf", 1 an inward K,
        // each with a low brass note on pentatonic degree 0, 2, 4 an octave under GO's PENTA[5], so the count climbs into 'go'
        const n = Math.max(1, Math.min(3, numArg(k, 'n') | 0 || 3)), q = this._grid(now, 4), d = (3 - n) * 2;
        const goF = fold(440 * st(K + PENTA[5]), 900), f = goF * st(PENTA[d] - 12);
        if (n === 3) this.B(q, 0.75, fx); else if (n === 2) this.Pf(q, 0.7, fx); else this.Kin(q, 0.8, fx);
        this._brass(q, f, 0.2, 0.08);
        break;
      }
      case 'nudge': {           // "psst!": an idle re-prompt (the DASH ring): a lip click, then two rising sines (about 660 then
        // 990 Hz, in key, 90 ms each) 6 dB under 'lesson', and the music steps back 3 dB for 400 ms
        this.hum(t, 0.006, 0.1, 'bandpass', 2600, 2.5, fx, 1400, 0.001);
        this.tone('sine', kf(660), 0, t + 0.012, 0.09, 0.06, fx, 0.004);
        this.tone('sine', kf(990), 0, t + 0.102, 0.09, 0.06, fx, 0.004);
        this.hum(t + 0.1, 0.03, 0.03, 'bandpass', 5000, 1.5, fx, 0, 0.004);   // the "s" of psst
        this.duck(Math.pow(10, -3 / 20), 0.4);
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
      case 'egg': {             // arrived at the egg, the biggest beat in the game: a soft touch now, a 1-beat reversed cymbal into
        // the next downbeat (see the state switch: eggLead), and on it the big drum, the key 2 st up and the choir singing the
        // theme's call an octave over its pads for one bar (0.3, over a 0.12 heavenly chord). The band holds at 0.7, not
        // ducked, and the B kick lands on beats 1 and 3 of the bar after
        const sp = 60 / this._bpm / 4, hit = this._eggHit > t ? this._eggHit : t + FIN_SW, sw = Math.min(4 * sp, hit - t);
        const KT = this._elift ? this.keyTarget : K, cb = themeBase(KT) / 2;   // the call's top note at 375..750 Hz
        this.tom(t, 130, 0.6, fx);
        this._revCym(hit - sw, hit, 0.2, fx);
        this.B(hit, 1.3, fx); this.crash(hit, 1, fx); this.tom(hit + 0.2, 130, 1, fx);
        THEME_CALL.forEach((d, s) => {
          if (d === null) return;
          const f = cb * st(PENTA[d]), last = s === 12, len = last ? (16 - s) * sp : THEME_LEN[0][s] * sp * 0.95;
          this.say(hit + s * sp, [f / 2, f], 'oh', 'ah', len, 0.3, 0.04, 1, fx, 1);
        });
        this.say(hit + 0.1, [262, 330, 392, 523].map((f) => f * st(KT)), 'oh', 'ah', 16 * sp, 0.12, 0.5, 1);
        this.duck(0.7, hit - now + 16 * sp);
        this.B(hit + 16 * sp, 1.1); this.B(hit + 24 * sp, 1);
        break;
      }
      case 'pick': {   // the 5th sliding up to the tonic (both through kf), its octave and the tonic's octave
        const f = fold(kf(660), 900), f1 = f * kf(880) / kf(660);
        this.tone('triangle', f, f1, t, 0.12, 0.28, fx); this.tone('sine', f * 2, 0, t + 0.08, 0.2, 0.1, fx); this.tone('sine', f1 * 2, 0, t + 0.12, 0.2, 0.05, this.fxEcho);
        break;
      }
      case 'lesson': {          // a tutorial step learned (k 0.33 / 0.66 / 1): a bright 3-note rising arpeggio in key, about
        // 180 ms, its root a third higher per step (A, C, E in A minor); the last step walks home to the tonic with a hat roll.
        // Kept under 'pick' (a 0.12 triangle against its 0.28)
        const x = clamp01(k), step = x >= 0.95 ? 2 : x >= 0.5 ? 1 : 0;
        const notes = step === 2 ? [7, 10, 12] : step === 1 ? [3, 7, 10] : [0, 3, 7];
        let b = 440 * st(K); while (b > 620) b /= 2; while (b < 310) b *= 2;
        notes.forEach((s, j) => {
          const f = b * st(s), tj = t + j * 0.06, last = j === 2;
          this.tone('triangle', f, 0, tj, last ? 0.09 : 0.05, 0.12, fx, 0.003);
          this.tone('square', f * 2, 0, tj, 0.03, 0.022, fx, 0.002);   // the bright edge a phone speaker hears
        });
        if (step === 2) {
          this.tone('sine', b * 4, 0, t + 0.12, 0.14, 0.025, this.fxEcho, 0.003);
          for (let j = 0; j < 4; j++) this.hat(t + 0.12 + j * 0.03, 0.35 + 0.1 * j, fx, j & 1);
        }
        break;
      }
      case 'cards':             // the deal's whoosh: a swept hiss and a sine rising in key, from the 4th up to the tonic
        this.hum(t, 0.3, 0.25, 'bandpass', 300, 1.5, fx, 3000, 0.2); this.tone('sine', kf(300), kf(880), t, 0.25, 0.08, fx); break;
      case 'reroll': {          // a shuffle: six riffled clicks, each with a soft tick climbing the pentatonic in key (one octave)
        const rb = this._rerollBase(K);
        for (let j = 0; j < 6; j++) {
          const tj = t + j * 0.04 + Math.random() * 0.02;
          this.hum(tj, 0.025, 0.3, 'bandpass', 1800 + Math.random() * 1500, 3, fx);
          this.tone('triangle', rb * st(this._chordFix(K + pen(j), K) - K), 0, tj, 0.025, 0.05, fx, 0.002);
        }
        break;
      }
      case 'deal': {            // the card reveal: a 0.5 s reversed cymbal into a rising 3-note pentatonic tag (degrees 0, 2, 4),
        // triangles 90 ms apart in the current key. main.js plays 'zone' after the pick, when the key really changes
        const h = t + 0.5; this._revCym(t, h, 0.35, fx);
        let b = 440 * st(K); while (b * st(pen(4)) > 1500) b /= 2; while (b < 380) b *= 2;
        [0, 2, 4].forEach((d, j) => this.tone('triangle', b * st(this._chordFix(K + pen(d), K) - K), 0, h + j * 0.09, j === 2 ? 0.18 : 0.07, 0.12, fx, 0.003));
        break;
      }
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
        const wb = themeBase(K, WIN_TOP);   // one octave for the whole call: degree 7 at or under 1100 Hz, the shape intact
        THEME[0].forEach((d, s) => {
          if (d === null) return;
          const f = wb * st(PENTA[d]), len = THEME_LEN[0][s];
          this._brass(t + s * sq, f, sq * len * 0.85, 0.1);
        });
        // act 4 seen (setStoryStage): the Macros sing along, a low "ooh" (root, fifth, octave) under the brass quote
        if (this._act4) { const lo = wb / 2; this.say(t, [lo, lo * st(7), wb], 'oo', 'oh', 16 * sq * 0.95, 0.1, 0.6, 1, fx, 1); }
        const tw = t;
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
        const wk = rivalIdx(k); if (wk >= 0) this._rival(t + 2.2, wk, 0.8, 0, 0.8, K);   // the beaten rival deflates
        this._doorShut(tw + DOOR_AT, k, K, fx);   // the egg seals behind you, on the seal ring (0.3..1.05 s)
        this._kevin('yay', now, tw + 1.2, fx);                   // Kevin cheers, right after the brass call
        this._winHeart(tw + WIN_HEART_AT, wb * st(PENTA[THEME[0][0]] + 24), fx);   // the baby-to-be's heartbeat (render.js fades it in)
        this._outK = K; this._outUntil = this._holdUntil; this._outAt = t2;   // later jingles answer this chord, in this key
        this._resetSong();
        break;
      }
      case 'lose': {            // the thief gloats, Kevin says "huh?", a kazoo tries the theme and gives up: see _loseSting
        this.setMuffle(true);   // first: a muffle shuts any older lose box, and this one opens after it
        const full = this._loseFull;
        this._loseArgs = { now, t, K, k, fx, full };
        this._loseSting(now, t, K, k, fx, full);
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
        this._loseBoxCut();     // a quick SWIM AGAIN: the lose sting stops right here, never over the rev-up and the count
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
        // chromatic up to 4 semitones, then the last 3 ticks fold onto the pentatonic (5, 7, 7): it ends in key, CL_TOP at most
        // one octave for the whole alarm (picked from its top note, CL_TOP), so it never folds down mid-climb in a high key
        const v = 0.55 + 0.15 * gr, n = Math.min(CL_TOP, this._clN++), semi = n <= 4 ? n : Math.min(CL_TOP, penD(n - 3)), f = this._clBase(K) * st(semi);
        // danger first: a lowE heartbeat within CL_HEART s owns the low end, so the tick keeps only its ping and its click
        if (!(Math.abs(q - this._lowQ) <= CL_HEART)) { this.tone('sine', 150, 55, q, 0.05, 0.28 * v, fx, 0.002); this._thudUp(q, 150, 55, 0.05, 0.28 * v, fx); }
        this.tone('triangle', f, 0, q, 0.03, 0.07 * v, fx, 0.001);
        this.hum(q, 0.008, 0.12 * v, 'bandpass', 3000, 2, fx, 0, 0.001);
        break;
      }
      case 'comboMilestone': {  // 40, 60, 80, 100, 150, 200, then every 100 (k = { n }): the crowd goes wild, louder every
        // milestone (m = its index), and the key lifts 2 + m semitones (at most 5) until the combo ends. The roar keeps its
        // transient right now; the rest lands on the 16th grid (q, lastSnapLead) with a kick
        const mi = milestoneIndex(numArg(k, 'n')), q = this._quantCap(now), m = st(this.key);
        // one vocal identity: a combo shout still ringing from under MS_SOLO s ago is choked, the crowd takes over
        if (this._shoutG && now - this._shoutAt < MS_SOLO) { const g = this._shoutG.gain; hold(g, now); g.setTargetAtTime(0.0001, now, 0.02); }
        this._shoutG = null;
        this._snapLead = Math.max(0, Math.min(0.045, q - now));
        for (const [f, v, d] of [[700, 0.16, 0.9], [1500, 0.12, 0.8], [3200, 0.07, 0.6]]) this.hum(t, d, v, 'bandpass', f, 0.9, fx, f * 1.3, 0.08);
        this._gridKick(q, 0.6, fx);
        // the choir: C major (in key), one more voice per milestone up the octave
        this.say(q + 0.03, [262, 330, 392, ...[523, 659, 784, 1047].slice(0, 1 + Math.min(4, mi))].map((f) => f * m), 'eh', 'ah', 0.6, 0.18, 0.15, 1.04);
        this.hey(q + 0.12, mi >= 3 ? 1.2 : 1, fx);
        const nc = Math.min(20, 8 + 4 * mi);
        for (let j = 0; j < nc; j++) this.hum(q + 0.05 + j * 0.06 * 8 / Math.max(8, nc) + Math.random() * 0.03, 0.02, 0.18, 'bandpass', 1200 + Math.random() * 900, 2, fx);   // claps
        if (mi >= 2) {          // the theme's call ("one in a mil-lion"): its first 3 notes in brass, on the grid
          const sq = 60 / this._bpm / 4; let j = 0, b = 440 * m; while (b * st(PENTA[5]) > 900) b /= 2;   // one octave for the whole call
          for (let s = 0; s < 16 && j < 3; s++) {
            const d = THEME[0][s]; if (d === null) continue;
            this._brass(q + s * sq, b * st(PENTA[d]), sq * THEME_LEN[0][s] * (j === 2 ? 1.6 : 0.85), 0.1);
            j++;
          }
        }
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
      case 'rankTick': {        // the result's rank counting down (k 0..1, 1 = arrived): a short pluck climbing the pentatonic,
        // 220 -> 880 Hz (in key) as k rises, and a quiet hat tick
        const d = Math.round(clamp01(numArg(k, 'k')) * 10); let b = 220 * st(K); while (b > 311) b /= 2;
        const sd = pen(d); this._pluck(t, b * st(this._fixRel(sd) ? sd + 1 : sd), 0.06, fx);
        this.hat(t, 0.35, fx);
        break;
      }
      case 'rankLand': {        // the rank lands, on the rematch groove's next beat (rankLead): k = tier, 3 a top 3 (a brass stab
        // and a crash), 2 the top 1000 (kick, snare and bass), 1 any other, 0 over 100k (a comic "wah wah")
        const tier = Math.max(0, Math.min(3, numArg(k, 'k') | 0)), sp = 60 / this._bpm / 4;
        let q = this._grid(now, 4); if (q < t) q = t;
        this._rankLead = q - now;
        if (tier === 3) {
          let r = 220 * st(K + 3); while (r > 330) r /= 2;   // the relative major (C in A minor): the chord 'second' sings
          for (const semi of [0, 4, 7, 12]) this._brass(q, r * st(semi), 0.42, 0.06);
          this._gridKick(q, 1, fx); this.crash(q, 0.9, fx);
        } else if (tier === 2) {
          let f = 110 * st(K); while (f > 147) f /= 2; while (f < 73) f *= 2;
          this._gridKick(q, 1, fx); this.Pf(q + 2 * sp, 0.95, fx);
          this.tone('sawtooth', f, 0, q, 0.32, 0.12, fx, 0.006); this._thudUp(q, f, f * 0.98, 0.3, 0.2, fx);
        } else if (tier === 1) {
          const f = fold(this._inKey(440 * st(K), K), 700);
          this._pluck(q, f, 0.07, fx); this._pluck(q + sp, f * st(7), 0.05, fx); this.rim(q, 0.8, fx);
        } else {                // the sad trombone, played for laughs: two falling "wahs", the last one sagging with a wobble
          let f = 330 * st(K); while (f > 370) f /= 2;
          this._brass(q, f, 0.24, 0.07, true);
          this._brass(q + 0.28, f * st(-1), 0.55, 0.07, true, true, f * st(-2), 0.55);
        }
        break;
      }
      case 'swat': this.tone('sine', 1200, 300, t, 0.09, 0.22, fx, 0.002); this.hum(t, 0.02, 0.12, 'highpass', 3000, 0.7, fx); break;
      case 'swatBonk': {        // Kevin bonks a stunned Lunger aside: a rubbery boing, a falling sine with a short wobble
        const o = this.tone('sine', 520, 180, t, 0.16, 0.2, fx, 0.002), W = [[300, 0.04], [420, 0.08], [220, 0.12], [180, 0.16]];
        if (o) this._wob(o, t, 520, W);
        const o2 = this.tone('triangle', 1040, 0, t, 0.16, 0.08, fx, 0.002, 0, 0);   // its tail under 220 Hz an octave up, for a phone
        if (o2) this._wob(o2, t, 1040, W.map(([f, at]) => [f * 2, at]));
        this.hum(t, 0.03, 0.1, 'bandpass', 1800, 4, fx);
        this._kevin('uhh', now, t + 0.08, fx);   // a little dazed himself
        break;
      }
      case 'clutch': {          // a tight 4-hit snare roll that lands on the next combo note
        const sp = 60 / this._bpm / 4, d = Math.min(0.035, sp / 3);
        let q = this._quant(now); while (q < t + 3 * d + 0.01) q += sp / 2;
        for (let j = 0; j < 4; j++) this.Pf(q - (3 - j) * d, 0.35 + 0.15 * j, fx);
        const f = this._scaleF(this._linkN + 1, 440);
        this.tone('triangle', f * 0.97, f, q, 0.08, 0.1, fx, 0.003, 0.02);
        break;
      }
      case 'finisher': {        // mic drop: a reversed cymbal sucked into a heavy thud, then the coins
        const g = gradeOf(k), h = now + finisherLead(g), sw = h - t;   // the thud lands exactly finisherLead(g) after the call
        this._revCym(t, h, 0.16 + 0.04 * g, fx);   // the reversed cymbal: swelling up to the drop, cut dead on it
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
        let s0 = [7, 8, 10, 12][lv - 3]; if (this._fixRel(s0)) s0++;
        const s1 = this._third(s0);   // E-G, F-A, G-B, A-C: always in A minor (E-G#, G#-B under an E chord)
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
          let f = this._inKey(Math.min(1100, 400 * Math.pow(4, x)), K);
          if (f > 1100) f = this._inKey(f * st(-2.6), K);   // snapped up past the cap: take the scale note below
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
        // one vocal identity per milestone: a shout under 0.4 s after a comboMilestone stays quiet (the milestone owns it)
        if (now - this._msAt < MS_SOLO) break;
        const p = this._shoutBase(K) * st(pen(Math.min(5, Math.floor((+k || 0) / 10))));   // climbs the pentatonic, in key, one octave
        this._shoutG = this.say(t, [p, p * 1.5], 'ee', 'ah', 0.28, 0.24, 0.12, 0.85); this._shoutAt = now;   // the voice right away
        this._gridKick(this._quantCap(now), 0.6, fx);                      // its kick on the groove
        break;
      }
      case 'comboEnd': {        // combo dropped (k = the chain, or { n }): a deflating slide in key, from the last link (_passF, or
        // the run's base) down to two pentatonic degrees under the chain's first note in 0.3 s, a triangle with a lip "pff"
        const n = Math.max(0, numArg(k, 'n')), b0 = this._runBase(0, 440, K) * st(K), f0 = this._passF > 0 ? this._passF : b0;
        let fE = b0 * st(penD(-2)); while (fE >= f0 * 0.94) fE /= 2;   // always a fall, whatever octave the chain ended in
        // the bigger the chain, the longer and lower the deflate: under 10 a 0.25 s slide, 10..29 0.4 s and an octave lower
        // at the end, 30+ 0.6 s and a deflating kazoo "pfft" when it runs out of air
        const v = n >= 25 ? 0.12 : n >= 10 ? 0.09 : 0.05, len = n >= 30 ? 0.6 : n >= 10 ? 0.4 : 0.25;
        if (n >= 10 && fE / 2 >= 140) fE /= 2;   // lower, but never under what a phone speaker still plays
        this.hum(t, 0.03, 0.5 * v + 0.04, 'bandpass', 1200, 1.5, fx, 0, 0.002);
        this.tone('triangle', f0, fE, t, len + 0.06, v, fx, 0.006, len);
        if (n >= 30) {
          this.say(t + len * 0.45, [fE * 2, fE * 2.01], 'ee', 'oo', len * 0.6, 0.03, len * 0.5, 0.6, fx, 0);
          this.hum(t + len + 0.02, 0.1, 0.08, 'bandpass', 900, 1.2, fx, 300, 0.008);
        }
        break;
      }
      case 'comboBreak': {      // a record scratch; a 10+ chain also falls down the ladder it climbed (see _breakRun)
        const n = this._brkN, sp = 60 / this._bpm / 4;
        // "wikka-wikka-wikk": back, forward, back. Each stroke is the needle hiss (a swept bandpass) over the vinyl itself,
        // a held, pitched saw (see _scratch), since noise alone is too thin to beat the music on a phone speaker
        const V = BRK_V;
        this.hum(t, 0.1, 0.8 * V, 'bandpass', 3200, 2, fx, 500);
        this.hum(t + 0.1, 0.08, 0.6 * V, 'bandpass', 500, 2, fx, 2200);
        this.hum(t + 0.19, 0.17, 0.6 * V, 'bandpass', 2800, 2, fx, 400);
        this._scratch(t, 900, 160, 0.1, 0.6 * V, fx); this._scratch(t + 0.1, 180, 700, 0.09, 0.48 * V, fx); this._scratch(t + 0.19, 800, 110, 0.2, 0.55 * V, fx);
        if (n >= 10) this._breakRun(now, n, K, fx);
        this.duck(n >= 10 ? 0.35 : 0.6, (n >= 25 ? 16 : n >= 10 ? 4 : 2) * sp);
        if (n >= 25) {          // Kevin's "nooo" (0.6 s) inside the dry bar the break booked (_dryUntil): after the scratch, ending in it
          const d0 = this._dryUntil - 16 * sp, at = Math.max(t + 0.2, Math.min(Math.max(t + 0.4, d0 + 4 * sp), this._dryUntil - 0.62));
          this._kevin('nooo', now, at, fx);
        }
        break;
      }
      case 'comboBank': {       // combo cashed in: the first coin and a crowd "ohhh"; the rest of the coins land with the helices (dnaTick)
        // grade 2+ snaps to the 16th grid (q, at most 45 ms away: lastSnapLead) behind a transient right now, and grade 3+
        // also kicks on that 16th (skipped when the groove already kicks there)
        const g = this._bankG, q = g >= 2 ? this._quantCap(now) : t;
        this._snapLead = Math.max(0, Math.min(0.045, q - now));
        if (q > t + 0.002) this._transient(t, this._coinBase(K) * 2, fx);
        if (g >= 3) this._gridKick(q, 0.6, fx);
        // calm mode, or a caller with no helices (k.cascade): the whole cascade right here. Until the first dnaTick
        // ever arrives, tick() plays the rest of the cascade 0.6 s later unless a helix lands first.
        if (this.calm || (k && typeof k === 'object' && k.cascade)) this._coins(q, g, K, fx);
        else { this._coins(q, g, K, fx, 0, 1); if (!this._tickSeen && g > 0) this._bankPend = now + 0.6; }
        if (g >= 3) this._kevin('yay', now, q + 0.05, fx);   // and Kevin cheers a big one
        if (g >= 1) {           // and a crowd "ohhh" that grows with the grade
          const m = st(K), d = 0.3 + 0.225 * g, vs = [196, 247, 294, 330, 392].slice(0, 2 + Math.ceil(g / 2)).map((f) => f * m);
          this.say(q + 0.14, vs, 'oh', 'oo', d, 0.1 + 0.03 * g, d * 0.5, 0.97);
          this.hum(q + 0.14, d, 0.06 + 0.02 * g, 'bandpass', 700, 1.2, fx, 0, d * 0.3);
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
      case 'close': {           // a near miss: just a whoosh (the combo link already played the note). { tight: 1 }, a RAZOR miss:
        // the whoosh sweeps higher (900 -> 3600 Hz) under a sharp filtered edge, a 70 ms 4 -> 8 kHz zip (Q 3) and a tick
        if (k && typeof k === 'object' && k.tight) {
          this.hum(t, 0.16, 0.45, 'bandpass', 900, 1.8, fx, 3600, 0.012);
          this.hum(t + 0.03, 0.07, 0.22, 'bandpass', 4000, 3, fx, 8000, 0.004);
          this.hum(t + 0.09, 0.01, 0.12, 'highpass', 6000, 0.7, fx, 0, 0.001);
        } else this.hum(t, 0.18, 0.5, 'bandpass', 600, 1.5, fx, 2400, 0.02);
        break;
      }
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
        // the same octave as the link ladder's run, then halved once for the whole arpeggio so its top note (+4 degrees)
        // fits under 1760 Hz: the three notes always climb (a per-note fold dropped the last one an octave in high keys)
        const base = this._trickBase(teased ? this._teaseB : this._runBase(this._linkN, 440, K), K, d0);
        this._teaseD = -1;
        this._trickKinds = kinds.slice(0, 3); this._trickD = d0; this._trickB = base;   // a trickStreak replays this arpeggio
        for (let j = 0; j < 3; j++) {
          const f = base * st(K + pen(d0 + 2 * j)), qj = q + j * sp;
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
        const n = Math.max(0, numArg(k, 'n') | 0), m = Math.min(n, 6), f0 = this._dominoBase(this._passF || 440, m);   // one octave for the run
        for (let j = 0; j < m; j++) {
          const tj = t + j * 0.035, f = f0 * st(pen(j));
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
        o.type = 'sawtooth'; o.frequency.setValueAtTime(fE * r / 2, q); o.frequency.exponentialRampToValueAtTime(fE, end);   // bent start, in-key end
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
        const kinds = this._trickKinds || [], sb = this._trickBase(this._trickB * up, K, this._trickD);   // one octave for the replay too
        for (let j = 0; j < 3; j++) {
          const f = sb * st(K + pen(this._trickD + 2 * j)), qj = q + j * sp;
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
      case 'pounce': {          // a Lunger crouches ({ pan, dur }): a growl winding up over dur (LUNGE_CROUCH, 0.45 s) that ends exactly at
        // the launch on a snap from the cell's side, so the snap is the cue to sidestep. Saw 110 -> 330 Hz through a lowpass
        // opening 400 -> 2400 Hz, a 14 Hz tremolo; the snap is 8 ms of noise through a 1800 Hz bandpass. The launch is sim
        // time, so the wind-up is never bent in slow-mo (main.js can pass dur already divided by its time scale)
        const pan = Math.max(-1, Math.min(1, numArg(k, 'pan'))), dur = Math.max(0.1, Math.min(1.5, (k && typeof k === 'object' && +k.dur) || POUNCE_DUR));
        const dest = this._panned(pan, fx), r = this._fxR, end = t + dur;
        if (!this._busy(1, 2)) {
          const o = c.createOscillator(), lp = c.createBiquadFilter(), tr = c.createGain(), g = c.createGain(), lfo = c.createOscillator(), ld = c.createGain();
          o.type = 'sawtooth'; o.frequency.setValueAtTime(110 * r, t); o.frequency.exponentialRampToValueAtTime(330 * r, end);
          lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(2400, end);
          tr.gain.value = 0.7; lfo.frequency.value = 14; ld.gain.value = 0.3; lfo.connect(ld); ld.connect(tr.gain);   // 0.4..1
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.16, end - 0.01); g.gain.linearRampToValueAtTime(0.0001, end + 0.01);
          o.connect(lp); lp.connect(tr); tr.connect(g); g.connect(dest);
          this._go(o, t, end + 0.03); this._go(lfo, t, end + 0.03);
        }
        const sd = this._panned(pan < 0 ? -0.9 : pan > 0 ? 0.9 : 0, fx);   // the snap sits hard on the cell's side
        this.hum(end, 0.008, 0.34, 'bandpass', 1800, 1.4, sd, 0, 0.001);
        this.tone('triangle', 520, 260, end, 0.03, 0.08, sd, 0.001);       // a tick of body a phone speaker can play
        break;
      }
      case 'babble': {          // a rival talks ({ k: rival index, n: syllables, pan }): n syllables of 70..110 ms, 15 ms apart, on the
        // pentatonic around that rival's own pitch (see BABBLE). Low priority and quiet (0.09): it is flavour, the first voice dropped
        const rv = rivalIdx(k), B = BABBLE[rv >= 0 ? rv : 0], n = Math.max(1, Math.min(6, numArg(k, 'n') | 0 || 3));
        const dest = this._panned(Math.max(-1, Math.min(1, numArg(k, 'pan'))) * 0.6, fx), r = this._fxR;
        let at = t;
        for (let j = 0; j < n; j++) {
          const last = j === n - 1, ln = (B.len[0] + Math.random() * (B.len[1] - B.len[0])) / r;
          // the jitter: Steve bounces up and down, Tiffany climbs at the end, the rest wander a little
          const jit = rv === 0 ? (j & 1 ? 4 : -2) : rv === 2 && last ? 5 : (Math.random() * 2 - 1) * 3;
          const f = this._inKey(B.f * st(jit), K) * r, v0 = B.v[j & 1], v1 = B.v[(j + 1) & 1];
          const hold = rv === 4 && last ? 0.24 / r : ln;                         // Chad holds his last word
          const fr = rv === 4 ? [f, f * 1.5] : [f];                              // ...and doubles himself a fifth up
          const bend = rv === 2 && last ? 1.2 : rv === 0 ? 1.04 : 1;
          this.say(at, fr, v0, v1, hold, 0.09 * B.g, 0.03, bend, dest, 0, rv === 3 ? 6 : 0, 35);
          at += hold + 0.015;
        }
        break;
      }
      case 'rivalOuch': {       // a rival gets hurt (k = rival index): a 0.15..0.3 s yelp in its own voice
        const rv = rivalIdx(k), r = this._fxR, kp = (f) => this._inKey(f, K) * r;
        if (rv === 1) {         // Brock: "HNG" and a 55 Hz thud (with its phone-audible half)
          this.say(t, [kp(110)], 'uh', 'uh', 0.18, 0.14, 0.02, 0.92, fx, 0);
          this.tone('sine', 55, 40, t, 0.16, 0.3, fx, 0.003); this._thudUp(t, 55, 40, 0.16, 0.3, fx);
        } else if (rv === 2) {  // Tiffany: "eek!", a squeal sliding up over the vowel (a voice that high misses the formants)
          const f = kp(880); this.say(t, [f / 2], 'eh', 'ee', 0.15, 0.14, 0.03, 1.2, fx, 0);
          this.tone('sine', f, f * 1.25, t, 0.13, 0.09, fx, 0.006, 0.1, 0);
        }
        else if (rv === 3) this.say(t, [kp(185)], 'oh', 'ah', 0.3, 0.13, 0.1, 0.8, fx, 0, 6, 40);           // Gunther: "whoaa", wobbling
        else if (rv === 4) {    // Chad: "hey!" and an indignant brass blip
          const f = kp(150); this.say(t, [f, f * 1.5], 'eh', 'ay', 0.2, 0.13, 0.06, 1.05, fx, 0);
          this._brass(t + 0.06, fold(f * 2, 600), 0.08, 0.06);
        } else this.say(t, [kp(330)], 'oo', 'uh', 0.15, 0.12, 0.04, 0.8, fx, 0);                            // Steve (and anyone): "oop"
        break;
      }
      case 'dashReady': {       // the dash is charged: two triangle blips, root then fifth (1760 -> 2640 Hz in A, in key, over the
        // whistled lead), 35 ms each, with a 15 ms bright "shk" on the first; snapped to the next 16th when that is within 60 ms
        const q16 = this._next16(now), q = q16 - now <= 0.06 ? q16 : t, f = fold(1760 * st(K), 2640);
        this.tone('triangle', f, 0, q, 0.045, 0.1, fx, 0.003, 0, 0);
        this.hum(q, 0.015, 0.08, 'highpass', 6000, 0.7, fx, 0, 0.001, 0);
        this.tone('triangle', f * 1.5, 0, q + 0.055, 0.045, 0.1, fx, 0.003, 0, 0);
        break;
      }
      case 'swerve': {          // a quick steer ({ pan, v }): 45 ms of bandpassed noise sweeping 900 -> 2400 Hz (Q 1.2), from that
        // side, up to 4 semitones higher with v 0..1, about 20 dB under 'dash'. GAP keeps it to one per 160 ms; half as loud in
        // FRENZY, silent in the drill (see sfx())
        const pan = Math.max(-1, Math.min(1, numArg(k, 'pan'))), p = st(4 * clamp01(numArg(k, 'v')));
        const vol = 0.045 * (this._ftier > 0 ? 0.5 : 1);
        this.hum(t, 0.042, vol, 'bandpass', 900 * p, 1.2, this._panned(pan, fx), 2400 * p, 0.003, 0);
        break;
      }
      case 'gooIn': {           // into the goo ({ surf }): a wet squelch, a lowpassed noise blip over a 180 -> 90 Hz sine drop (with
        // its octave, what a phone plays); surfing across it is lighter: softer and higher
        const sf = !!(k && typeof k === 'object' ? k.surf : k), p = sf ? 1.5 : 1, v = sf ? 0.55 : 1;
        this.hum(t, 0.07, 0.22 * v, 'lowpass', 900 * p, 2.5, fx, 300 * p, 0.003);
        this.tone('sine', 180 * p, 90 * p, t + 0.01, 0.12, 0.26 * v, fx, 0.003);
        this.tone('triangle', 360 * p, 180 * p, t + 0.01, 0.08, 0.1 * v, fx, 0.003);
        this.hum(t + 0.05, 0.02, 0.08 * v, 'bandpass', 1400 * p, 3, fx, 0, 0.001);   // the little "plip" as it closes
        break;
      }
      case 'maxed': {           // a mutation maxed out ({ id, capstone }): root, fifth, octave in brass, rising, then a coin.
        // The event also fires for one-level and max-1 cards: only a capstone gets the brass; the rest a short two-note coin
        // sting at half level. A caller that passes no object (older main.js) keeps the full brass
        if (k && typeof k === 'object' && !k.capstone) {
          const cb = this._coinBase(K);
          this.tone('square', fold(cb * st(pen(3)), 2400), 0, t, 0.05, 0.04, fx, 0.002);
          this.tone('square', fold(cb * st(pen(5)), 2400), 0, t + 0.06, 0.14, 0.04, fx, 0.002);
          break;
        }
        let b = 220 * st(K); while (b * 2 > 1000) b /= 2; while (b < 250) b *= 2;
        [[1, 0, 0.08], [st(7), 0.08, 0.08], [2, 0.16, 0.34]].forEach(([r, at, d]) => this._brass(t + at, b * r, d, 0.1));
        this._coin(t + 0.2, 5, K, true, fx);
        this.crash(t + 0.16, 0.35, fx, 0.4);
        break;
      }
      case 'tally': {           // one cash-in multiplier step ({ i, n }): a coin a pentatonic step above the last, on the grid; the
        // last step (i = n - 1) rings a doubled octave chord. Every voice under 0.06
        const n = Math.max(1, numArg(k, 'n') | 0), i = Math.max(0, Math.min(n - 1, numArg(k, 'i') | 0)), q = this._quantCap(now);
        let b = this._coinBase(K); while (b * st(pen(n - 1)) > 2000) b /= 2;   // the whole tally climbs, none folds back down
        const f = b * st(pen(i));
        this.tone('square', f, 0, q, 0.05, 0.05, fx, 0.002);
        this.tone('sine', f * 2, 0, q, 0.04, 0.02, fx, 0.002);
        if (i === n - 1) {
          for (const r of [1, 2]) { this.tone('triangle', f * r, 0, q + 0.06, 0.32, 0.05, fx, 0.003); this.tone('square', f * r, 0, q + 0.06, 0.2, 0.025, fx, 0.003); }
          this.tone('sine', f * 2, 0, q + 0.08, 0.3, 0.03, this.fxEcho, 0.003);
        }
        break;
      }
      case 'quit': {            // a quit (or our own sim fault, 'crash'): never mocked. Just a short tape stop, then one soft pluck
        // in key; the groove waits about 1 s, then counts the waiting room back in. Through the lose box (_loseBoxCut)
        this._loseBoxCut();
        const box = this._gain(1, fx), g = this._gain(0.25, box);
        this.tone('sawtooth', 900, 120, t, 0.18, 0.5, g, 0.004);
        this.hum(t, 0.18, 0.6, 'bandpass', 900, 1.4, g, 120, 0.004);
        this.duck(0.3, 0.6);
        this._pluck(t + 0.3, fold(440 * st(K), 600), 0.06, box);
        this._loseBox = { g: box, until: t + 0.6 };
        this._holdUntil = t + 1;
        this._outK = K; this._outUntil = this._holdUntil; this._outAt = t + 0.3;
        this._resetSong();
        break;
      }
      case 'afford': {          // a price comes within reach: a rising major third (E6 then G#6 in A, triangles 70 ms each, 0.12) on the
        // next 8th, a square edge and a light echo one 16th later; another call within AFFORD_WIN s climbs a whole step
        this._affN = now - this._affT < AFFORD_WIN ? Math.min(AFFORD_TOP, this._affN + 1) : 0; this._affT = now;
        const q = this._grid(now, 2), sp = 60 / this._bpm / 4;
        let f = 1318.5 * st(K + 2 * this._affN); while (f > 2100) f /= 2;
        [f, f * st(4)].forEach((x, j) => {
          const tj = q + j * 0.07;
          this.tone('triangle', x, 0, tj, 0.07, 0.12, fx, 0.003);
          this.tone('square', x * 2, 0, tj, 0.012, 0.03, fx, 0.001);
          this.tone('triangle', x, 0, tj + sp, 0.06, 0.03, fx, 0.003);   // the 1/16 echo
        });
        break;
      }
      case 'overclock': {       // an overclock step (k = { n } 1..4): a short engine rev, a saw sliding up an octave onto pentatonic
        // degree 2 + n in key (E, G, A, C in A) through an opening lowpass, a hiss under it and a tick on the note
        const n = Math.max(1, Math.min(4, numArg(k, 'n') | 0 || 1)), d = 0.2;
        let b = 220 * st(K); while (b > 260) b /= 2; while (b < 130) b *= 2;
        const f1 = b * st(this._chordFix(K + pen(2 + n), K) - K);
        if (!this._busy(1)) {
          const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(), a = Math.max(0.02, this._minA);
          o.type = 'sawtooth'; o.frequency.setValueAtTime(f1 / 2, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
          lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(1500 + 500 * n, t + d);
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + a); g.gain.setValueAtTime(0.08, t + d * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.04);
          o.connect(lp); lp.connect(g); g.connect(fx); this._go(o, t, t + d + 0.06);
        }
        this.hum(t, d, 0.04, 'bandpass', 800, 1.5, fx, 3000 + 600 * n, d * 0.7);
        this.tone('triangle', f1 * 2, 0, t + d, 0.06, 0.08, fx, 0.002);
        break;
      }
      case 'medley': {          // a medley: a 4-note pentatonic run up (degrees 0..3, root to 5th) on the next 16th, 55 ms apart
        // { mk }: one extra semitone per medley number (the key the drop lands in), over the drop's reversed cymbal
        const mk = k && typeof k === 'object' ? Math.max(0, Math.min(MK_TOP, +k.mk | 0)) : 0;
        const q = this._next16(now); let b = 440 * st(K); while (b > 1000) b /= 2; while (b < 500) b *= 2;
        b *= st(mk);
        if (this._dropOn && this._dropT > t + 0.1) this._revCym(Math.max(t, this._dropT - 1.2), this._dropT, 0.3, fx);
        for (let j = 0; j < 4; j++) {
          const f = b * st(pen(j)), tj = q + j * 0.055, last = j === 3;
          this.tone('triangle', f, 0, tj, last ? 0.16 : 0.05, 0.12, fx, 0.003);
          this.tone('square', f * 2, 0, tj, 0.02, 0.025, fx, 0.001);
          if (last) this.tone('sine', f * 2, 0, tj, 0.2, 0.04, this.fxEcho, 0.003);
        }
        break;
      }
      case 'buzzer': {          // a buzzer beater: the crowd draws an "ooh" (G B D G, in key) for 0.35 s, then a bright hit on the grid:
        // a relative-major brass stab, a kick, a crash, a clap burst and a high ping, on its own 1.25x send (louder than the
        // finisher's coin tail). Never arbitrated: it rides along with a finisher
        const m = st(K), h = this._snapAt(t + 0.35);
        this.say(t, [196, 247, 294, 392].map((f) => fold(f * m, 900)), 'oo', 'oh', h - t + 0.15, 0.16, 0.25, 1.06);
        this.hum(t, h - t, 0.08, 'bandpass', 600, 1, fx, 1400, (h - t) * 0.8);
        [523, 659, 784].forEach((f) => this._brass(h, fold(f * m, 1400), 0.3, 0.1));
        this.B(h, 1, fx); this.crash(h, 1, fx, 0.6);
        for (let j = 0; j < 8; j++) this.hum(h + 0.02 + j * 0.035 + Math.random() * 0.02, 0.02, 0.16, 'bandpass', 1200 + Math.random() * 900, 2, fx);
        this.tone('sine', fold(2093 * m, 2800), 0, h, 0.25, 0.06, fx, 0.002);
        break;
      }
      case 'perk': {            // a habit perk unlocks: a gold sparkle. A shimmer swells for 0.22 s, then a bell chord of the relative
        // major (C E G C over the key: in key) rings with bell partials, a twinkle run up on the echo and a soft choir "aah"
        let b = 262 * st(K); while (b > 400) b /= 2;
        this.hum(t, 0.25, 0.08, 'highpass', 6000, 0.7, fx, 0, 0.22);
        const h = t + 0.22;
        [0, 4, 7, 12].forEach((s, j) => { const f = b * 2 * st(s); this.tone('sine', f, 0, h + j * 0.03, 0.6, 0.07, fx, 0.002); this.tone('sine', f * 2.76, 0, h + j * 0.03, 0.2, 0.015, fx, 0.001); });
        [12, 16, 19, 24, 28].forEach((s, j) => this.tone('triangle', fold(b * 2 * st(s), 3200), 0, h + 0.1 + j * 0.045, 0.12, 0.04, this.fxEcho, 0.002));
        this.say(h, [b, b * st(4), b * st(7)], 'ah', 'ah', 0.6, 0.08, 0.2, 1);
        break;
      }
      case 'storyReveal': {     // a story reveal line (A.storyReveal): three rising notes (degrees 2, 4, 5: D G A in A, home on the
        // tonic), a bell octave on the last, under a soft breath of hiss
        let b = 440 * st(K); while (b > 620) b /= 2; while (b < 310) b *= 2;
        this.hum(t, 0.3, 0.04, 'highpass', 5000, 0.7, fx, 0, 0.25);
        [2, 4, 5].forEach((d, j) => {
          const f = b * st(pen(d)), tj = t + j * 0.11, last = j === 2;
          this.tone('triangle', f, 0, tj, last ? 0.35 : 0.09, 0.12, fx, 0.004);
          if (last) this.tone('sine', f * 2, 0, tj, 0.4, 0.04, this.fxEcho, 0.004);
        });
        break;
      }
      case 'doorbell': {        // Kevin reaches the egg (generation 20 on, A.doorbell): the theme's call beatboxed, "dm dm dm dm dm
        // dm" on the 8ths from the next one (its first 6 notes, degrees 5 4 5 7 6 5, as pitched mouth percussion), then DING:
        // a bell on the tonic with an inharmonic partial and an echo. About 1.5 s, on the grid
        const e = 2 * (60 / this._bpm / 4), q = this._grid(now, 2), b = themeBase(K, 700);   // one octave: degree 7 under 700 Hz
        THEME_CALL.filter((d) => d !== null).slice(0, 6).forEach((d, j) => this._dm(q + j * e, b * st(PENTA[d]), j, fx));
        let f = b * 8; while (f > 2100) f /= 2;   // the tonic, bright
        const h = q + 6 * e;
        this.tone('sine', f, 0, h, 0.8, 0.14, fx, 0.002); this.tone('sine', f * 2.76, 0, h, 0.3, 0.04, fx, 0.001);
        this.tone('sine', f, 0, h + 0.02, 0.6, 0.04, this.fxEcho, 0.002);
        break;
      }
      case 'dripTell': {        // a drip about to fall ({ pan }): a rising wet "bloo-" over 0.5 s, gooIn's squelch turned inside out
        // (its lowpass opening 300 -> 1100 Hz on a resonant Q, the sine and its octave rising 90 -> 200 Hz instead of falling)
        const dest = this._panned(Math.max(-1, Math.min(1, numArg(k, 'pan'))) * 0.7, fx);
        this.hum(t, 0.5, 0.16, 'lowpass', 300, 6, dest, 1100, 0.12);
        this.tone('sine', 90, 200, t, 0.5, 0.16, dest, 0.08, 0.5);
        this.tone('triangle', 180, 400, t, 0.48, 0.07, dest, 0.08, 0.48);
        break;
      }
      case 'dripDrop': {        // the drip lands ({ pan }): a short "plip", a sine falling 1500 -> 520 Hz over a little plop
        const dest = this._panned(Math.max(-1, Math.min(1, numArg(k, 'pan'))) * 0.7, fx);
        this.tone('sine', 1500, 520, t, 0.05, 0.14, dest, 0.002);
        this.tone('sine', 320, 160, t + 0.012, 0.05, 0.1, dest, 0.002);
        this.hum(t, 0.008, 0.06, 'highpass', 5000, 0.7, dest, 0, 0.001);
        break;
      }
      case 'rivalSplat': {      // a rival goes splat ({ pan }): a soft squelch, gooIn's shape, lighter and shorter
        const dest = this._panned(Math.max(-1, Math.min(1, numArg(k, 'pan'))) * 0.6, fx);
        this.hum(t, 0.08, 0.14, 'lowpass', 800, 3, dest, 250, 0.004);
        this.tone('sine', 170, 85, t + 0.01, 0.1, 0.15, dest, 0.004);
        this.tone('triangle', 340, 170, t + 0.01, 0.07, 0.06, dest, 0.004);
        break;
      }
    }
  }
  // a wobbling pitch path on oscillator o (a sweep, so slow-mo bends all of it): f0 at t, then each [f, at] in turn
  _wob(o, t, f0, pts) {
    const F = o.frequency, r = this._fxR;
    F.cancelScheduledValues(t); F.setValueAtTime(f0 * r, t);
    for (const [f, at] of pts) F.exponentialRampToValueAtTime(f * r, t + at / r);
  }
  // the win's heartbeat from t (WIN_HEART_AT s after the win: render.js fades the baby-to-be in at 1.6..2.0 s): a lub-dub
  // (two thumps 0.28 s apart: a 55 Hz sine dropping fast from 90 Hz, 120 ms, its octave-up triangle for a phone, and a -18 dB
  // 2 kHz click on the first) at 72 bpm for 4 beats, fading out, with the fanfare's tail (fx, the stinger's own send) ducked
  // 4 dB under it. On the 4th beat one music-box note (fb: THEME's first note two octaves over the brass call), through a
  // gate that a muffle (pause, a card deal), a suspend or a new run shuts (_winBoxCut); skipped if already muffled
  _winHeart(t, fb, fx) {
    const base = this._sfxBase || this.fx, dest = this.sfxMuted ? fx : base, bt = 60 / WIN_HEART_BPM, n = 4;
    const end = t + (n - 1) * bt + 0.28 + 0.15;
    if (fx !== base && !this.sfxMuted && fx.gain) {
      const g = fx.gain, v = g.value;
      g.setValueAtTime(v, t - 0.08); g.linearRampToValueAtTime(v * WIN_HEART_DUCK, t); g.setValueAtTime(v * WIN_HEART_DUCK, end); g.linearRampToValueAtTime(v, end + 0.4);
    }
    for (let j = 0; j < n; j++) {
      const tb = t + j * bt, v = WIN_HEART_V * (1 - 0.22 * j);
      for (const [dt, w] of [[0, 1], [0.28, 0.7]]) {
        this.tone('sine', 90, 55, tb + dt, 0.12, v * w, dest, 0.003, 0.025);
        this.tone('triangle', 180, 110, tb + dt, 0.06, 0.35 * v * w, dest, 0.003, 0.025);
      }
      this.hum(tb, 0.006, v * Math.pow(10, -18 / 20), 'bandpass', 2000, 1.5, dest, 0, 0.001);
    }
    if (this._muffled || this._suspended) return;
    const gate = this._gain(1, dest), tb = t + (n - 1) * bt;
    this.tone('sine', fb, 0, tb, 1.1, 0.07, gate, 0.002, 0, 1);       // the tine
    this.tone('sine', fb * 4, 0, tb, 0.08, 0.015, gate, 0.001, 0, 0); // its ping
    this._winBox = { g: gate, until: tb + 1.2 };
  }
  _winBoxCut() {
    const b = this._winBox; this._winBox = null;
    if (!b || !this.ctx) return;
    const now = this.ctx.currentTime; if (now >= b.until) return;
    hold(b.g.gain, now); b.g.gain.setTargetAtTime(0, now, 0.01);
  }
  // 'doorShut' (inside 'win', DOOR_AT s after it): the egg's door slams on everyone else. A 90 Hz thwump (and its octave for a
  // phone), a bright two-part lock click, then each arrived loser's motif from behind the door (a 1.1 kHz lowpass), bent down
  // a minor third over 0.3 s, 0.12 s apart. k: the win's rival index (that rival), or { k, arrived: [rival indices] }
  _doorShut(td, k, K, fx) {
    // (92 Hz, not exactly 90: the win's 90 Hz heartbeat thumps stay countable on their own, _round7Facts)
    this.tone('sine', 92, 48, td, 0.22, 0.42, fx, 0.003, 0.15);
    this._thudUp(td, 92, 48, 0.16, 0.35, fx);
    this.hum(td, 0.12, 0.18, 'lowpass', 500, 1.2, fx, 150, 0.003);   // the air the door pushes out
    this.hum(td + 0.07, 0.008, 0.2, 'bandpass', 4200, 3, fx, 0, 0.001);   // the lock: "click"...
    this.tone('square', 2400, 0, td + 0.07, 0.006, 0.05, fx, 0.001);
    this.hum(td + 0.11, 0.012, 0.16, 'bandpass', 3000, 3, fx, 0, 0.001);  // ..."clack"
    const arr = k && typeof k === 'object' && Array.isArray(k.arrived) ? k.arrived : [k], seen = new Set();
    const who = arr.map((x) => rivalIdx(x)).filter((x) => x >= 0 && !seen.has(x) && seen.add(x)).slice(0, 5);
    if (!who.length) return;
    const c = this.ctx, lp = c.createBiquadFilter(), base = this.fx;
    lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.7; lp.connect(fx);
    this.fx = lp;
    try { who.forEach((r, j) => this._rival(td + 0.2 + j * 0.12, r, 0.5, 0, 0.3, K, st(-3))); } finally { this.fx = base; }
  }
  // the lose (and quit) sting's gate, built like _winBox: { g, until }. A quick SWIM AGAIN ('again'), a new run, a muffle and a
  // suspend shut it in about 45 ms, so the gloat, the "huh?", the kazoo and the trombone never ring over the rev-up and the count
  _loseBoxCut() {
    const b = this._loseBox; this._loseBox = null;
    if (!b || !this.ctx) return;
    const now = this.ctx.currentTime; if (now >= b.until) return;
    hold(b.g.gain, now); b.g.gain.setTargetAtTime(0, now, 0.015);
  }
  // the lose sting's ending, from a shuffled bag of 3 (0 the sad trombone, 1 the deflating kazoo, 2 the beatboxer giving up):
  // every ending plays once before the bag refills, and a new bag never opens on the ending that just played
  _losePick() {
    if (!this._loseBag.length) {
      const b = [0, 1, 2];
      for (let i = 2; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = b[i]; b[i] = b[j]; b[j] = x; }
      if (b[2] === this._loseV) { const x = b[0]; b[0] = b[2]; b[2] = x; }   // pop() takes b[2] first
      this._loseBag = b;
    }
    const v = this._loseBag.pop(); this._loseV = v; return v;
  }
  // the lose sting from t in key K (k: the thief's rival index, or { k }), every voice through one gate (_loseBox, see
  // _loseBoxCut). full: the thief gloats with its own motif, Kevin's "huh?" (0.18 s) comes just before a kazoo that tries the
  // theme's first 4 notes and gives up on the 4th, then one ending from the bag (_losePick). Short (deaths 4 and on, see the
  // state switch): the gloat cut to 0.35 s, the "huh?", then one sagging brass note (the trombone's last, 196 Hz in A, 0.6 s),
  // no kazoo, and the groove back after LOSE_SHORT s. The caller has already muffled the band (setMuffle(true))
  _loseSting(now, t, K, k, fx, full) {
    this._loseBoxCut();
    const m = st(K), rv = rivalIdx(k), g = this._gain(1, fx), base = this.fx;
    this.fx = g;
    try {
      if (!full) {
        const tk = rv >= 0 ? t + 0.42 : t + 0.12, tb = tk + 0.22;
        if (rv >= 0) {   // the gloat, faded out over 50 ms at 0.35 s
          const rg = this._gain(1, g); rg.gain.setValueAtTime(1, t + 0.3); rg.gain.linearRampToValueAtTime(0, t + 0.35);
          this.fx = rg; this._rival(t, rv, 1, 7, 0.6, K, 1); this.fx = g;
        }
        this._kevin('huh', now, tk, g);
        this._brass(tb, 196 * m, 0.6, 0.13, true, true);
        this.tone('sine', 98 * m, 0, tb, 0.55, 0.12, g, 0.05);
        this._holdUntil = t + LOSE_SHORT;   // rematchMusic's groove is back almost at once
        this.duck(0.2, LOSE_SHORT); this.mlp.frequency.setTargetAtTime(18000, t + LOSE_SHORT - 0.1, this._ftc(0.3));
        this._outK = K; this._outUntil = this._holdUntil; this._outAt = tb;
        this._loseBox = { g, until: tb + 0.8 };
        return;
      }
      const tk = rv >= 0 ? t + 0.9 : t + 0.22, t0 = tk + 0.95;
      if (rv >= 0) this._rival(t, rv, 1, 7, 0.6, K, 1);
      this._kevin('huh', now, tk - 0.22, g);
      let j = 0; const lb = themeBase(K, 700);   // one octave for the 4 notes (never folded one by one)
      for (let s = 0; s < 16 && j < 4; s++) {   // the first 4 notes of the theme; the 4th hangs on and sags, unresolved
        const d = THEME[0][s]; if (d === null) continue;
        const last = j === 3, f = lb * st(PENTA[d]);
        this.say(tk + j * 0.17, [f, f * 1.006], 'ee', last ? 'oo' : 'eh', last ? 0.6 : 0.15, 0.11, 0.05, last ? 0.94 : 1);
        j++;
      }
      const v = this._losePick(), sp = 60 / this._bpm / 4;
      this._holdUntil = v === 2 ? t0 + 16 * sp + 0.9 : t0 + 2.0;   // the groove waits for the sting
      this.duck(0.2, 3.2 + t0 - t); this.mlp.frequency.setTargetAtTime(18000, t0 + 3.2, this._ftc(0.4));
      let end = t0 + 2.8;
      if (v === 0) {          // sad trombone: wah wah wah waaaah
        [233, 220, 208].forEach((f, i) => this._brass(t0 + i * 0.42, f * m, 0.38, 0.13, true));
        this._brass(t0 + 1.26, 196 * m, 1.4, 0.13, true, true);
        this.tone('sine', 98 * m, 0, t0 + 1.26, 1.3, 0.12, g, 0.05);
      } else if (v === 1) {   // a kazoo deflating like a party balloon, and a last little "pfft"
        this.say(t0, [466 * m, 470 * m], 'ee', 'oo', 1.5, 0.2, 0.6, 0.33);
        this.tone('triangle', 233 * m, 78 * m, t0, 1.45, 0.05, g, 0.04);
        this.hum(t0 + 1.5, 0.12, 0.2, 'bandpass', 900, 1.2, g, 300, 0.01);
      } else {                // the beatboxer loses heart: "boots-n-cats-n-boots-n..." and stops
        this.B(t0, 1, g); this.ts(t0 + 2 * sp, 0.9, g); this.Pf(t0 + 4 * sp, 1, g); this.ts(t0 + 6 * sp, 0.9, g);
        this.B(t0 + 8 * sp, 0.9, g); this.ts(t0 + 10 * sp, 0.6, g);
        this.say(t0 + 16 * sp, [196 * m], 'uh', 'oh', 0.25, 0.16, 0.1, 0.92);
        this.say(t0 + 16 * sp + 0.3, [165 * m], 'oh', 'oo', 0.6, 0.16, 0.2, 0.75);
        end = t0 + 16 * sp + 1;
      }
      this._outK = K; this._outUntil = this._holdUntil; this._outAt = v === 0 ? t0 + 1.26 : v === 1 ? t0 + 1.5 : t0 + 16 * sp;
      this._loseBox = { g, until: end };
    } finally { this.fx = base; }
  }
  // a close loss (rematchMusic(true)) right after a short sting: the short one is shut before it sounds and the full sting is
  // built at the same start, so a near miss always gets the whole drama
  _loseUpgrade() {
    const L = this._loseArgs, c = this.ctx;
    if (!L || L.full || !c || c.currentTime - L.now > 0.1 || this.muted) return false;
    L.full = true; this._kevT = -9;   // the short build's "huh?" booked Kevin's line gap: the full one says it instead
    const b = this._loseBox; this._loseBox = null;
    if (b) { const now = c.currentTime; hold(b.g.gain, now); b.g.gain.setValueAtTime(0, now); }   // silent before it ever sounded
    this.setMuffle(true);
    const fxR = this._fxR; this._fxR = 1;
    try { this._loseSting(L.now, L.t, L.K, L.k, L.fx, true); } finally { this._fxR = fxR; }
    return true;
  }
  // Kevin's own voice, layered into existing sfx (no wiring in main.js). kind: 'hup' (dash), 'oof' (hit, spareBite),
  // 'hehe' (a burst of passes, see _hehe), 'wheee' (frenzy), 'uhh' (swatBonk). One line per KEV_GAP s across every kind but the giggle
  // (its own cooldown; an 'oof' or a 'wheee' cuts a giggle short, the others wait for it to end); the lowest
  // priority voice of all (skipped from CAP - 8 live sources, with the hats), and it bends in slow-mo like the babble
  // (pitch times the rate, lengths over it), even inside a TONAL sfx. Returns true when it spoke
  // The big moments (KEV_BIG: 'nooo' a 25+ chain breaking, 'yay' a grade 3+ bank and the win, 'huh' the lose, 'wooo' the
  // run's first FRENZY) sing KEV_BIG_DB (+3 dB) over his other lines, still one per KEV_GAP s, but on the stinger budget
  // (CAP + 24) instead of the CAP - 8 early-out, so a stage-2 phone never mutes them
  _kevin(kind, now, t, fx) {
    const big = KEV_BIG.has(kind);
    if (big ? this._busy(1, 4) : this.live + 3 > this._cap - 8) return false;
    const giggling = now < this._heheEnd;
    if (kind === 'hehe') { if (giggling || now - this._kevT < KEV_GAP) return false; }   // never over another line
    else {
      if (now - this._kevT < KEV_GAP) return false;
      if (giggling) {   // 'oof' and 'wheee' cut a giggle still to come (or still ringing); the others wait their turn
        if (kind !== 'oof' && kind !== 'wheee' && !big) return false;
        this._heheCut(now);
      }
      this._kevT = now;
    }
    const r = this._rateNow(now), V = KEVIN.g, f = (x) => x * r, d = (x) => x / r;
    if (kind === 'hup') this.say(t, [f(280)], 'ah', 'ah', d(0.07), V, 0.02, 440 / 280, fx, 0);
    else if (kind === 'oof') this.say(t, [f(320)], 'uh', 'uh', d(0.12), V, 0.03, 180 / 320, fx, 0);
    else if (kind === 'hehe') {   // 2 or 3 syllables on a base of 400, 440 or 480 Hz, 0.05..0.07 s apart: never the same giggle twice
      const n = Math.random() < 0.5 ? 2 : 3, b = [400, 440, 480][(Math.random() * 3) | 0], gap = 0.05 + Math.random() * 0.02;
      const G = this._gain(1, fx), up = [1, 1.095, 1.045];
      let tt = t;
      for (let j = 0; j < n; j++) { this.say(tt, [f(b * up[j])], 'ee', j === n - 1 ? 'eh' : 'ee', d(0.045), V, 0.01, 1, G, 0); tt += d(gap); }
      this._heheG = G; this._heheEnd = tt + d(0.05);
    }
    else if (kind === 'wheee') this.say(t, [f(KEVIN.f)], 'oo', KEVIN.v[0], d(0.45), V, 0.1, 640 / 300, fx, 0, 6, 25);
    else if (kind === 'uhh') this.say(t, [f(KEVIN.f)], 'uh', 'uh', d(0.2), V, 0.05, 1, fx, 0, 8, KEV_WOB);
    else if (big) {   // say(): oh -> oo sagging 360 -> 200 Hz, ah -> ee 300 -> 520, uh -> ah 260 -> 340, oo -> ah 300 -> 640
      const [v0, v1, f0, f1, dur, vib, vd] = KEV_LINES[kind], B = V * KEV_BIG_G;
      this.say(t, [f(f0)], v0, v1, d(dur), B, Math.min(0.2, dur * 0.5), f1 / f0, fx, 1, this.calm ? 0 : vib, vd);
    }
    return true;
  }
  // Kevin's giggle, rationed (it used to fire on every 3rd overtake and turned into spam): it needs a burst, the 6th pass
  // within HEHE_WIN s; then HEHE_CD s of quiet; the first HEHE_FREE of a run are free, after that at most one per zone.
  // Called by 'pass' with t = when it would start (just after the blip), so an 'oof' or a 'wheee' can still cut it
  _hehe(now, t, fx) {
    const P = this._pT; P.push(now);
    while (P.length && now - P[0] > HEHE_WIN) P.shift();
    if (P.length > HEHE_N) P.shift();
    if (P.length < HEHE_N || now - this._heheT < HEHE_CD) return false;
    if (this._heheN >= HEHE_FREE && this._heheZ === this._zone) return false;
    if (!this._kevin('hehe', now, t, fx)) return false;
    P.length = 0; this._heheT = now; this._heheN++; this._heheZ = this._zone;
    return true;
  }
  // cut a giggle that has not finished: its gain falls to nothing in about 15 ms
  _heheCut(now) {
    const G = this._heheG; this._heheG = null; this._heheEnd = -1;
    if (!G || !G.gain) return;
    hold(G.gain, now); G.gain.setTargetAtTime(0, now, 0.005);
  }
  // a zone arrival's signature hit on its landing t (see 'zone'), in key KT: launch a rim triplet across the first beat, acid
  // three rising bubbles, goo a tom dropping 260 -> 130 Hz, the sea a wave swelling in, the fork a half-time "Pf" on beat 3,
  // the rapids a pad with a 6 Hz tremolo (calm: held still), the egg a double heartbeat
  _zoneHit(sig, t, sp, KT, fx) {
    switch (sig) {
      case 'rim': for (let j = 0; j < 3; j++) this.rim(t + j * sp * 4 / 3, 0.9 + 0.15 * j, fx); break;
      case 'bubble': {
        let b = 440 * st(KT); while (b * st(pen(7)) > 1600) b /= 2;
        for (let j = 0; j < 3; j++) { const f = b * st(pen(3 + 2 * j)); this.tone('sine', f * 0.6, f, t + j * 0.08, 0.07, 0.12, fx, 0.004, 0.05); }
        break;
      }
      case 'goo':
        this.tone('sine', 260, 130, t, 0.32, 0.5, fx, 0.003, 0.22); this.tone('triangle', 520, 260, t, 0.06, 0.14, fx, 0.002);
        this.hum(t, 0.06, 0.12, 'lowpass', 700, 3, fx, 250, 0.002);
        break;
      case 'wave': this.hum(t, 1.1, 0.14, 'lowpass', 260, 1.5, fx, 1300, 0.5); break;
      case 'fork': this.Pf(t + 8 * sp, 1.05, fx); break;
      case 'trem': {
        if (this._busy(1, 3)) break;
        const c = this.ctx, g = c.createGain(), tr = c.createGain(), lfo = c.createOscillator(), ld = c.createGain(), d = 0.9;
        let b = 220 * st(KT); while (b > 330) b /= 2; while (b < 165) b *= 2;
        tr.gain.value = this.calm ? 1 : 0.6; ld.gain.value = this.calm ? 0 : 0.4; lfo.frequency.value = 6; lfo.connect(ld); ld.connect(tr.gain);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + Math.max(0.08, this._minA)); g.gain.setValueAtTime(0.09, t + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        tr.connect(g); g.connect(fx);
        for (const s of [0, 7]) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = b * 2 * st(s); o.connect(tr); this._go(o, t, t + d + 0.02); }
        this._go(lfo, t, t + d + 0.02);
        break;
      }
      case 'heart': this._lub(t, 0.7, fx); this.heart(t + 2 * sp, 1, fx); break;
    }
  }
  // a reversed cymbal from t0 to the hit h: highpassed noise (9 -> 3 kHz) swelling to peak, cut dead on h (finisher, egg)
  _revCym(t0, h, peak, fx) {
    if (this._busy(1) || h - t0 < 0.02) return;
    const c = this.ctx, s = c.createBufferSource(), hp = c.createBiquadFilter(), gg = c.createGain();
    s.buffer = this.noiseBuf; if (h - t0 > 0.9) s.loop = true; hp.type = 'highpass'; hp.Q.value = 0.7;
    hp.frequency.setValueAtTime(9000, t0); hp.frequency.exponentialRampToValueAtTime(3000, h);
    gg.gain.setValueAtTime(0.0001, t0); gg.gain.exponentialRampToValueAtTime(peak, h - 0.005); gg.gain.linearRampToValueAtTime(0.0001, h + 0.01);
    s.connect(hp); hp.connect(gg); gg.connect(fx); this.live++; s.onended = this._dec; s.start(t0, Math.random() * 0.4); s.stop(h + 0.03);
  }
  // one pitched beatbox "dm" (the doorbell): a lip "d" click, a triangle scooping onto f, its "m" hum, a soft kick on the beats
  _dm(t, f, j, fx) {
    this.hum(t, 0.01, 0.16, 'bandpass', 1100, 1.5, fx, 0, 0.001);
    this.tone('triangle', f * 1.12, f, t, 0.1, 0.15, fx, 0.003, 0.03);
    this.tone('sine', f, 0, t + 0.02, 0.12, 0.06, fx, 0.01);
    if ((j & 1) === 0) { this.tone('sine', 150, 60, t, 0.06, 0.16, fx, 0.002); this._knock(t, 900, 0.01, 0.1, fx); }
  }
  // a Big Mac takes two bites: "nom nom", then "mmm" (spareBite). Each "nom" is a 220 -> 140 Hz square (it was 95 -> 50,
  // under anything a phone speaker plays) with a triangle an octave up at 0.08, so the bite carries on a phone
  _chomp(t, fx) {
    for (const d of [0, 0.14]) {
      this.hum(t + d, 0.07, 0.5, 'lowpass', 900, 3, fx);
      this.tone('square', 220, 140, t + d, 0.08, 0.12, fx, 0.002);
      this.tone('triangle', 440, 280, t + d, 0.07, 0.08, fx, 0.002);
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
    this._tlift = 0; this._tliftPend = false; this._tliftEnd = -1; this._streakReset();
    this._elift = 0; this._eggHit = -1; this._lastPassN = -1; this._padV = null;
    this._gaspUntil = -1; this._duelK = null; this._bankPend = -1;
    // the stinger's echoes keep the old tempo until it has rung out, then switch with the waiting-room groove
    this._syncDelay(this.ctx && this._holdUntil > this.ctx.currentTime ? this._holdUntil : undefined); this._applyTrem(); this._applyInt(); this._killLoops();
  }
}
