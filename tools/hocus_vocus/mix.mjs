#!/usr/bin/env node
// Mix and level tool for Hocus Vocus audio (headless Chromium, OfflineAudioContext, no sound card, no network).
//
//   node tools/hocus_vocus/mix.mjs                         measure every score role alone, fit each score into its level window, print the new MIX trims
//   node tools/hocus_vocus/mix.mjs --write                 the same, and write the MIX-BEGIN to MIX-END block of js/audio.js
//   node tools/hocus_vocus/mix.mjs --tracks combat1,final  only those scores (with --write only their rows change)
//   node tools/hocus_vocus/mix.mjs --check                 no calibration: measure the live MIX as it stands against the acceptance windows
//   node tools/hocus_vocus/mix.mjs --literal [--offset DB] trims straight from the role targets (plus DB), no window fit
//   node tools/hocus_vocus/mix.mjs --sfx                   render every sfx recipe and variant, print its peak and the vol that hits its target
//   node tools/hocus_vocus/mix.mjs --sfx --ids hit_light,card_play_attack.kuro
//   node tools/hocus_vocus/mix.mjs --samples               measure the owners' files of DATA.SAMPLES against their synth recipe, suggest a vol
//   node tools/hocus_vocus/mix.mjs --selftest              prove the fast chunked renderer agrees with a plain whole-score render
//
// WHAT IT MEASURES (HV_ART_AUDIO 10.9). Everything is rendered at the DEFAULT sliders (AUDIO.volume('music') and ('sfx')) through the
// real master chain (AUDIO.graph: music bus, shelf, glue compressor, limiter, soft clip, hall), so a number here is what a phone plays.
//   Role loudness is A-weighted and gated like a loudness meter: 400 ms blocks every 100 ms, a floor at -70 dBFS and a second floor
//             10 dB under the mean of what remains, so a sparse part (a bell with a few notes) reads "how loud while it sounds". The
//             unit is dBFS RMS: the mean power of the two channels, so a full-scale sine in both channels reads -3.0.
//   Mix level is the PLAIN (unweighted, ungated) RMS of the whole score at full intensity (every layer in, the map fully awake), from its
//             first beat to its last, tail excluded, plus the sample peak at the master output.
//   Trims     one linear factor per track of a score (the MIX row). The page gets a copy of audio.js whose MIX block is emptied, so every
//             track renders at its own `gain`; each track is then rendered alone and trim = 10^((aim - level) / 20), clamped to 0.15 .. 4.
//   Aims      the plan's role targets set the BALANCE of a score: lead and theme -24, bass -26, beat parts -27, pads -30, sparkle -32
//             (the type of a track comes from its role, then its voice, see ROLE_TYPE). Read as levels at the output at the default
//             sliders they would put every score 7 to 14 dB over the acceptance windows (a fight at -14 dBFS RMS, peaks near -2), so the
//             tool keeps their DIFFERENCES and fits the absolute level: every aim is shifted by one offset G per score, so that the mix
//             lands on the middle of its window (fights -26.5, calm scenes -29.5 dBFS RMS) and its peak stays under -3 dBFS (the peak
//             cap wins over the window; the score then reads LOW and is reported). G comes first from the solo levels (role powers
//             add up), then one to three full-mix renders correct it. It is printed per score ("roles aim at target -16 dB"):
//             about -10 dB means the targets were met as levels before the music slider (0.7 taper x MUSIC_SCALE = -9.8 dB), much
//             lower means the score's own voices and gains are hot. --literal skips the fit (trims from the targets plus --offset).
//   Windows   fights (combat*, elite, boss*, final) -25 to -28 dBFS RMS, every other score -28 to -31, peaks under -3 dBFS. A score
//             outside its window after the fit has a role stuck on a trim clamp (marked * in the table), a gain that is far off, or a
//             peak that is too high: that needs its voices, gains or layers changed (8A), not a bigger trim. The A-weighted gated
//             loudness of the mix is printed alongside (and, with --layer0, the level of layer 0 alone).
//   Sfx       one render per recipe (and per hero variant id.hero) at the default Effects slider; the sample peak at the master
//             output is placed on the target of its class: hover -30, click -24, card -20, hits -16, crits -12, Headliner moments
//             -10 dBFS (SFX_CLASS below). The suggested vol is the recipe's vol times the factor that lands the peak (a short
//             secant search, because the glue compressor bends big sounds). --sfx prints only, the recipes are edited by hand, and it
//             exits 1 while any recipe is more than 1.5 dB from its target.
//   Samples   each file the manifest names is decoded, played through the sfx bus at the recipe's vol and compared with the synth
//             version of the same key (the sfx recipe, the vox voice for syllables, brush_use for Spells, the matching sfx for
//             stingers): vol is the loudness match, never more than 3 dB over the peak match. .m4a needs a codec some Chromium builds
//             lack; the tool says so and you can measure an .ogg or .wav copy instead.
//
// SPEED. The offline renderer costs about (notes x seconds), so a score is cut into ~4 s windows at bar lines, each window is rendered in
// its own context (long notes get the room they need, plus a 4 s tail so rings finish) and the windows are added together before the
// master chain runs once over the sum; a solo role skips the hall. That is several times faster than one big render (all 19 scores take
// about 4 minutes on 4 cores); --exact renders each score whole instead (the engine's own path). The engine's humanising seeds are
// keyed on note order, so the two differ by that noise only (up to about 0.5 dB on a track, more on a score of a handful of notes;
// the shipped loops differ from each other by as much, pass to pass); --selftest and the automatic guard (a dense score, both ways,
// tolerance 0.75 dB) measure it.
//
// WRITING. --write only ever replaces the text between the MIX-BEGIN and MIX-END marker lines (the block must be exactly `const MIX = {...};`),
// refuses when the rest of audio.js changed while it was measuring (8A edits the file too), and writes through a temporary file. Without
// --write nothing in the repo is touched. Run it after the scores are final, the trims depend on every note.
//
// OPTIONS
//   --file F          the audio.js to measure and (with --write) update (default hocus_vocus/js/audio.js)
//   --tracks a,b      limit to these score ids (also --track)       --jobs N     parallel browser pages (default min(4, cpus))
//   --music-vol V     --sfx-vol V   override the default sliders (0..1) for the measurement
//   --literal         no window fit: trims from the role targets plus --offset (default 0)       --offset DB   see --literal
//   --exact           render each score whole      --no-guard   skip the automatic chunk-versus-exact guard
//   --layer0          also render each layered score at intensity 0 (layer 0 only, the still bed of a map) for the table
//   --json            print one JSON document instead of tables      --no-fail   always exit 0      --quiet   no progress lines on stderr
//   --ids a,b         (--sfx) only these recipe ids      --manifest F.json   (--samples) use this manifest instead of DATA.SAMPLES
//   --audio-dir DIR   (--samples) where the sample files live (default hocus_vocus/audio next to the audio.js folder)
// EXIT CODE  0 clean, 1 a measured score or sound is outside its window or target (or --write refused), 2 the tool could not run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');

// ---------------------------------------------------------------- the rules of 10.9 (edit here, nowhere else)
const TARGET_DB = { lead: -24, bass: -26, beat: -27, pad: -30, sparkle: -32 };          // dBFS RMS of one role alone, at the default sliders
const TRIM_MIN = 0.15, TRIM_MAX = 4;
// role -> type. A role this table does not know falls back to its voice (VOICE_TYPE), then to lead, and the report says so.
const ROLE_TYPE = {
  melody: 'lead', 'melody-double': 'lead', theme: 'lead', run: 'lead',
  bass: 'bass',
  beat: 'beat', perc: 'beat', clack: 'beat', clap: 'beat', ostinato: 'beat', stab: 'beat',
  pad: 'pad', drone: 'pad', crackle: 'pad',
  arp: 'sparkle', bell: 'sparkle',
};
const VOICE_TYPE = { kick: 'beat', snare: 'beat', hat: 'beat', scratch: 'beat', clap: 'beat', throat: 'bass', ebass: 'bass', pad: 'pad', crackle: 'pad', glock: 'sparkle', arp: 'sparkle' };
const WINDOW_DB = { fight: [-28, -25], calm: [-31, -28] };                                // full mix at the default sliders
const PEAK_MAX_DB = -3;
const FIGHT = /^(combat\d*|elite|boss\d*|final)$/;
const FIT_STEPS = 5;                                                                       // most full-mix renders per score while fitting its level offset G
const GUARD_DB = 0.75;                                                                     // how far the chunked renderer may stray from the exact one before the tool complains
const SFX_TARGET_DB = { hover: -30, click: -24, card: -20, hit: -16, crit: -12, headliner: -10 };
const SFX_TOLERANCE_DB = 1.5;                                                             // --sfx exits 1 when a recipe is further than this from its target
// sfx id -> class (ranked hover < click < card < hit < crit < headliner). A variant id.hero takes the class of its base id.
const SFX_CLASS = {
  hover: ['ui_hover', 'card_hover', 'step'],
  click: ['ui_click', 'ui_back', 'ui_error', 'ui_open', 'ui_close', 'ui_toggle', 'card_pick', 'choice', 'save', 'gem_socket', 'paint', 'ink_splash', 'page_turn', 'ink_gain', 'camp_fire'],
  card: ['card_draw', 'card_play_attack', 'card_play_skill', 'card_play_power', 'card_discard', 'card_exhaust', 'shuffle', 'swap', 'energy_gain', 'turn_start', 'turn_end', 'enemy_turn',
    'block_gain', 'dodge', 'buff', 'debuff', 'heal', 'brush_pick', 'brush_use', 'reveal_landmark', 'well', 'gold', 'buy', 'gem_get', 'forge_hit', 'rest', 'event_open'],
  hit: ['hit_light', 'hit_heavy', 'hit_multi', 'slash', 'thud', 'zap', 'flame', 'ice', 'poison_tick', 'thorn', 'block_hit', 'block_break', 'stun', 'enemy_die', 'hero_down'],
  crit: ['hit_crit', 'hero_revive', 'chest_open', 'relic_get', 'level_up', 'upgrade', 'achievement', 'unlock'],
  headliner: ['boss_die', 'boss_intro', 'phase_change', 'victory', 'defeat'],
};
const SFX_OF = {};
for (const k of Object.keys(SFX_CLASS)) for (const id of SFX_CLASS[k]) SFX_OF[id] = k;
const STINGER_SFX = { victory: 'victory', defeat: 'defeat', boss_intro: 'boss_intro', phase_change: 'phase_change' };

// ---------------------------------------------------------------- arguments
const BOOL = new Set(['help', 'write', 'literal', 'layer0', 'check', 'sfx', 'samples', 'selftest', 'exact', 'no-guard', 'json', 'no-fail', 'quiet']);
const VALUE = new Set(['file', 'tracks', 'track', 'jobs', 'music-vol', 'sfx-vol', 'ids', 'manifest', 'audio-dir', 'offset']);
function usageError(msg) { console.error('mix: ' + msg + '\n(see the header of tools/hocus_vocus/mix.mjs, or --help)'); process.exit(2); }
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    let k = argv[i], v;
    if (!k.startsWith('--')) usageError(`unexpected argument "${k}"`);
    k = k.slice(2);
    const eq = k.indexOf('=');
    if (eq > 0) { v = k.slice(eq + 1); k = k.slice(0, eq); }
    if (!BOOL.has(k) && !VALUE.has(k)) usageError(`unknown option --${k}`);
    if (BOOL.has(k)) { a[k] = true; continue; }
    if (v === undefined) v = argv[++i];
    if (v === undefined) usageError(`--${k} needs a value`);
    a[k] = v;
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
if (args.help) {
  const lines = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1);
  const end = lines.findIndex((l) => !l.startsWith('//'));
  console.log(lines.slice(0, end).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}
const modes = ['check', 'sfx', 'samples', 'selftest'].filter((m) => args[m]);
if (modes.length > 1) usageError('pick one of --check, --sfx, --samples, --selftest');
if (args.write && modes.length) usageError('--write belongs to the plain run (it writes the MIX block)');
const AUDIO_FILE = path.resolve(args.file || path.join(REPO, 'hocus_vocus', 'js', 'audio.js'));
const JOBS = Math.max(1, Math.min(8, +(args.jobs || Math.min(4, os.cpus().length))));
const say = (...m) => { if (!args.json) console.log(...m); };
const note = (...m) => { if (!args.quiet) console.error(...m); };

// ---------------------------------------------------------------- the page: scripts, the patched audio.js, the browser
function readText(f) { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } }
const MIX_RE = /^([ \t]*)(\/\/ MIX-BEGIN[^\n]*)\n([\s\S]*?)^([ \t]*)(\/\/ MIX-END[^\n]*)/m;       // 1 indent, 2 begin marker, 3 body, 4 indent, 5 end marker
const sourceText = readText(AUDIO_FILE);
if (sourceText === null) usageError('cannot read ' + AUDIO_FILE);
const mixMatch = MIX_RE.exec(sourceText);
if (!mixMatch) usageError(AUDIO_FILE + ' has no "// MIX-BEGIN" and "// MIX-END" marker lines');
const withoutMix = (text) => text.replace(MIX_RE, '$1$2\n$4$5');
const patchedAudio = sourceText.replace(MIX_RE, '$1const MIX = {};');

/* The MIX block as the file holds it now: {id: [trims]}. Parsed by line, never evaluated. */
function parseMix(block) {
  const out = {};
  for (const line of block.split('\n')) {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:\s*\[([^\]]*)\]\s*,?\s*$/.exec(line.replace(/\/\/.*$/, ''));
    if (m) out[m[1]] = m[2].split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  }
  return out;
}
const LIVE_MIX = parseMix(mixMatch[3]);

/* Scripts the page needs: every script of index.html that comes before audio.js and is util or data (plus art only when audio.js reads ART). */
function pageScripts() {
  const jsDir = path.dirname(AUDIO_FILE);
  const html = readText(path.join(jsDir, '..', 'index.html')) || '';
  let names = [...html.matchAll(/<script[^>]*\ssrc=["']js\/([\w.-]+\.js)["']/g)].map((m) => m[1]);
  if (!names.length) names = ['util.js'].concat(fs.readdirSync(jsDir).filter((n) => /^data.*\.js$/.test(n)).sort());
  const self = path.basename(AUDIO_FILE);
  const at = names.indexOf(self);
  if (at >= 0) names = names.slice(0, at);
  const wantsArt = /\bART\s*\./.test(sourceText.replace(/\/\/[^\n]*/g, ''));
  names = names.filter((n) => n === 'util.js' || /^data.*\.js$/.test(n) || (wantsArt && /^art/.test(n)));
  const scripts = [];
  for (const n of names) { const t = readText(path.join(jsDir, n)); if (t === null) usageError('missing script ' + path.join(jsDir, n)); scripts.push({ name: n, text: t }); }
  scripts.push({ name: self + ' (MIX emptied)', text: patchedAudio });
  return scripts;
}

let chromium;
try { chromium = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { usageError('playwright-core is not installed (npm install): ' + e.message); }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const LAUNCH = { executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] };

// ---------------------------------------------------------------- everything below runs INSIDE the page (stringified, so it must be self-contained)
function pageLib() {
  'use strict';
  const SR = 44100, TAIL = 4.2;
  const db = (p) => (p > 1e-20 ? 10 * Math.log10(p) : -200);
  const round3 = (x) => Math.round(x * 1000) / 1000;

  // ---- A-weighting: three biquads (a double high-pass at 20.6 Hz, a high-pass pair at 107.7 and 737.9 Hz, a double low-pass at 12.2 kHz)
  function coef(type, f0, q) {
    const w = 2 * Math.PI * f0 / SR, cw = Math.cos(w), al = Math.sin(w) / (2 * q);
    const a0 = 1 + al;
    const hp = type === 'hp';
    const b0 = hp ? (1 + cw) / 2 : (1 - cw) / 2, b1 = hp ? -(1 + cw) : 1 - cw;
    return [b0 / a0, b1 / a0, b0 / a0, (-2 * cw) / a0, (1 - al) / a0];
  }
  const F1 = 20.598997, F2 = 107.65265, F3 = 737.86223, F4 = 12194.217;
  const SECTIONS = [coef('hp', F1, 0.5), coef('hp', Math.sqrt(F2 * F3), Math.sqrt(F2 * F3) / (F2 + F3)), coef('lp', F4, 0.5)];
  function biquad(x, c) {
    const y = new Float64Array(x.length);
    const b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4];
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const xi = x[i], yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = xi; y2 = y1; y1 = yi; y[i] = yi;
    }
    return y;
  }
  function weigh(x) { let y = x; for (const c of SECTIONS) y = biquad(y, c); return y; }
  const K2 = (() => {                                                           // unity (0 dB) at 1 kHz, found by measurement
    const n = SR * 2, s = new Float64Array(n);
    for (let i = 0; i < n; i++) s[i] = Math.sin(2 * Math.PI * 1000 * i / SR);
    const y = weigh(s);
    let a = 0, b = 0;
    for (let i = SR; i < n; i++) { a += s[i] * s[i]; b += y[i] * y[i]; }
    return a / b;
  })();

  // ---- gated A-weighted loudness of a stereo buffer (dBFS RMS, mean channel power), plus the unweighted sample peak and RMS
  function gate(blocks) {                                                        // the loudness-meter gate: -70 dBFS, then 10 dB under the mean of the rest
    const abs = blocks.filter((p) => p > 1e-7);
    if (!abs.length) return { lvl: -200, used: 0 };
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const rel = abs.filter((p) => p > mean(abs) * 0.1);
    const use = rel.length ? rel : abs;
    return { lvl: db(mean(use)), used: use.length };
  }
  function loudness(L, R, o) {
    o = o || {};
    const n = L.length;
    const from = Math.max(0, Math.floor((o.from || 0) * SR)), to = Math.min(n, o.to == null ? n : Math.ceil(o.to * SR));
    let peak = 0;
    for (let i = from; i < to; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > peak) peak = a; if (b > peak) peak = b; }
    const wl = weigh(L), wr = weigh(R);
    const pl = new Float64Array(n + 1), pr = new Float64Array(n + 1), ul = new Float64Array(n + 1), ur = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { pl[i + 1] = pl[i] + wl[i] * wl[i]; pr[i + 1] = pr[i] + wr[i] * wr[i]; ul[i + 1] = ul[i] + L[i] * L[i]; ur[i + 1] = ur[i] + R[i] * R[i]; }
    const win = Math.round(0.4 * SR), hop = Math.round(0.1 * SR), blocks = [], flat = [];
    const power = (s, e) => K2 * ((pl[e] - pl[s]) + (pr[e] - pr[s])) / (2 * (e - s));
    const raw = (s, e) => ((ul[e] - ul[s]) + (ur[e] - ur[s])) / (2 * (e - s));
    for (let s = from; s + win <= to; s += hop) { blocks.push(power(s, s + win)); flat.push(raw(s, s + win)); }
    if (!blocks.length && to > from) { blocks.push(power(from, to)); flat.push(raw(from, to)); }
    const g = gate(blocks), f = gate(flat);
    const all = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const rmsEnd = o.rmsTo == null ? to : Math.min(to, Math.ceil(o.rmsTo * SR));        // the plain RMS can stop at the score's own end (no tail)
    return {
      lvl: g.lvl, ungated: db(all(blocks)), maxM: db(blocks.length ? Math.max.apply(null, blocks) : 0), peak: db(peak * peak),
      rms: db(rmsEnd > from ? raw(from, rmsEnd) : 0), rmsGated: f.lvl, blocks: blocks.length, used: g.used,
    };
  }

  // ---- offline rendering
  function describe(id) {
    const d = AUDIO.compose(id);
    if (!d) throw new Error('AUDIO.compose(' + id + ') returned null for an id of AUDIO.list(\'music\')');
    return {
      id, tempo: d.tempo, bpb: d.beatsPerBar, seconds: d.seconds, introBars: d.introBars, loopBars: d.loopBars, layers: d.layers, drive: d.drive,
      tracks: d.tracks.map((t, i) => ({ i, voice: t.voice, role: t.role, layer: t.layer, gain: t.gain, section: t.section, notes: t.notes.length })),
    };
  }
  function windows(desc, o) {
    const bs = 60 / desc.tempo, totalBeats = desc.loopBeats > 0 ? desc.introBeats + desc.loopBeats : desc.beats;
    if (o.exact) return { bs, totalBeats, chunks: [[0, totalBeats]] };
    const cb = Math.max(desc.beatsPerBar, Math.round(o.chunk / bs / desc.beatsPerBar) * desc.beatsPerBar), chunks = [];
    for (let a = 0; a < totalBeats - 1e-9; a += cb) chunks.push([a, Math.min(totalBeats, a + cb)]);
    return { bs, totalBeats, chunks };
  }
  async function renderDry(desc, x, o) {
    const plan = windows(desc, o), bs = plan.bs;
    const total = plan.totalBeats * bs, N = Math.ceil((total + TAIL) * SR);
    const L = new Float32Array(N), R = new Float32Array(N);
    for (const ch of plan.chunks) {
      const a = ch[0], b = ch[1];
      let d = desc;
      if (!o.exact) {
        const tracks = desc.tracks.map((t) => Object.assign({}, t, { notes: t.notes.filter((n) => n.t >= a - 1e-9 && n.t < b - 1e-9).map((n) => Object.assign({}, n, { t: n.t - a })) }));
        if (!tracks.some((t) => t.notes.length)) continue;
        d = Object.assign({}, desc, { tracks, introBeats: 0, loopBeats: b - a, beats: b - a });
      }
      const span = o.exact ? total : Math.max(b - a, d.tracks.reduce((m, t) => t.notes.reduce((mm, n) => Math.max(mm, n.t + n.dur), m), 0)) * bs;   // a long drone note outlives its window
      const frames = Math.ceil((span + TAIL) * SR);
      const ctx = new OfflineAudioContext(2, frames, SR);
      const dest = ctx.createGain();
      dest.connect(ctx.destination);
      AUDIO.render(ctx, dest, d, { intensity: x, loops: 1 });
      const buf = await ctx.startRendering();
      const off = o.exact ? 0 : Math.round(a * bs * SR), cl = buf.getChannelData(0), cr = buf.getChannelData(1);
      for (let i = 0; i < cl.length && off + i < N; i++) { L[off + i] += cl[i]; R[off + i] += cr[i]; }
    }
    return { L, R, total };
  }
  async function throughChain(L, R, o, bus) {                                    // the summed score into the music bus: shelf, duck, master chain, hall
    const ctx = new OfflineAudioContext(2, L.length, SR);
    const gr = AUDIO.graph(ctx, { musicVol: o.musicVol, sfxVol: o.sfxVol });
    if (o.hall === false) { for (const k of ['sendM', 'sendS']) if (gr[k] && gr[k].disconnect) gr[k].disconnect(); }   // a solo role needs no hall (it costs a long convolution)
    const buf = ctx.createBuffer(2, L.length, SR);
    buf.getChannelData(0).set(L); buf.getChannelData(1).set(R);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(bus === 'sfx' ? gr.sfx : gr.music);
    src.start(0);
    const out = await ctx.startRendering();
    return { L: out.getChannelData(0), R: out.getChannelData(1) };
  }
  async function trackLevel(id, ti, x, o) {                                     // one track alone, trim 1
    const d = AUDIO.compose(id);
    const tracks = d.tracks.map((t, k) => (k === ti ? t : Object.assign({}, t, { notes: [] })));
    const dry = await renderDry(Object.assign({}, d, { tracks }), x, o);
    const out = await throughChain(dry.L, dry.R, Object.assign({}, o, { hall: false }), 'music');
    return loudness(out.L, out.R, { rmsTo: dry.total });
  }
  async function mixLevel(id, trims, x, o) {                                    // the whole score with these trims
    const d = AUDIO.compose(id);
    const tracks = d.tracks.map((t, k) => Object.assign({}, t, { gain: round3(t.gain * (trims && trims[k] != null ? trims[k] : 1)) }));
    const dry = await renderDry(Object.assign({}, d, { tracks }), x, o);
    const out = await throughChain(dry.L, dry.R, o, 'music');
    return loudness(out.L, out.R, { rmsTo: dry.total });
  }

  // ---- sound effects
  async function sfxPeak(what, mult, o) {
    const R = typeof what === 'string' ? AUDIO.sfxRecipe(what) : what;
    const ctx = new OfflineAudioContext(2, Math.ceil(((R.dur || 1) + 0.7) * SR), SR);
    const gr = AUDIO.graph(ctx, { musicVol: o.musicVol, sfxVol: o.sfxVol });
    AUDIO.renderSfx(ctx, gr.sfx, what, { t0: 0.05, vol: mult, pitch: 1, pan: 0, seed: 7 });
    const buf = await ctx.startRendering();
    const l = buf.getChannelData(0), r = buf.getChannelData(1);
    let pk = 0;
    for (let i = 0; i < l.length; i++) { const a = Math.abs(l[i]), b = Math.abs(r[i]); if (a > pk) pk = a; if (b > pk) pk = b; }
    return db(pk * pk);
  }
  async function sfxSolve(id, target, o) {
    const R = AUDIO.sfxRecipe(id);
    if (!R) return null;
    const p0 = await sfxPeak(id, 1, o);
    if (p0 < -150) return { id, vol: R.vol, peak: p0, vol1: R.vol, dur: R.dur, silent: true };
    let m = Math.pow(10, (target - p0) / 20), p = await sfxPeak(id, m, o), best = { m, p }, prevM = 1, prevP = p0;
    for (let i = 0; i < 5 && Math.abs(target - p) > 0.08; i++) {
      const dl = 20 * Math.log10(m / prevM);
      let slope = Math.abs(dl) > 0.05 ? (p - prevP) / dl : 1;
      if (!(slope > 0.1 && slope < 1.5)) slope = 1;
      prevM = m; prevP = p;
      m = m * Math.pow(10, (target - p) / (20 * slope));
      p = await sfxPeak(id, m, o);
      if (Math.abs(target - p) < Math.abs(target - best.p)) best = { m, p };
    }
    return { id, vol: R.vol, peak: p0, vol1: round3(R.vol * best.m), peak1: best.p, dur: R.dur, pri: R.pri, duck: R.duck };
  }

  // ---- samples: decoded files against their synth reference, both through the sfx bus at the recipe's vol
  async function sampleLevel(b64, o) {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ctx0 = new OfflineAudioContext(2, SR, SR);
    let buf;
    try { buf = await ctx0.decodeAudioData(bytes.buffer); } catch (e) { return { error: String((e && e.message) || e) }; }
    const s0 = Math.floor((o.start || 0) * buf.sampleRate), s1 = o.end ? Math.min(buf.length, Math.floor(o.end * buf.sampleRate)) : buf.length;
    const len = Math.max(1, s1 - s0);
    const frames = Math.ceil((len / buf.sampleRate + 0.7) * SR), ctx = new OfflineAudioContext(2, frames, SR);
    const gr = AUDIO.graph(ctx, { musicVol: o.musicVol, sfxVol: o.sfxVol });
    const cut = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) cut.getChannelData(c).set(buf.getChannelData(c).subarray(s0, s1));
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = cut; g.gain.value = o.gain;
    src.connect(g); g.connect(gr.sfx);
    src.start(0.05);
    const out = await ctx.startRendering();
    const m = loudness(out.getChannelData(0), out.getChannelData(1));
    return { lvl: m.lvl, peak: m.peak, seconds: len / buf.sampleRate, channels: buf.numberOfChannels, rate: buf.sampleRate };
  }
  async function referenceLevel(ref, o) {                                      // the synth version of a sample key
    const ctx = new OfflineAudioContext(2, Math.ceil(((ref.dur || 1.5) + 0.9) * SR), SR);
    const gr = AUDIO.graph(ctx, { musicVol: o.musicVol, sfxVol: o.sfxVol });
    if (ref.sfx) { const R = AUDIO.sfxRecipe(ref.sfx); if (!R) return null; AUDIO.renderSfx(ctx, gr.sfx, ref.sfx, { t0: 0.05, vol: 1, pitch: 1, pan: 0, seed: 7 }); ref.vol = R.vol; }
    else {
      const bus = ctx.createGain(); bus.gain.value = ref.vol; bus.connect(gr.sfx);
      if (!AUDIO.voice('vox', ctx, bus, 0.05, { midi: ref.midi || 60, dur: 0.3, vel: 0.8, syl: ref.syl, vowel: ref.vowel })) return null;
    }
    const out = await ctx.startRendering();
    const m = loudness(out.getChannelData(0), out.getChannelData(1));
    return { lvl: m.lvl, peak: m.peak, vol: ref.vol };
  }

  return {
    sr: SR, describe, trackLevel, mixLevel, sfxPeak, sfxSolve, sampleLevel, referenceLevel, renderDry, throughChain, loudness,
    defaults: () => ({ musicVol: AUDIO.volume('music'), sfxVol: AUDIO.volume('sfx') }),
    ids: () => AUDIO.list('music'),
    sfxIds: () => AUDIO.list('sfx'),
    heroIds: () => ((typeof DATA !== 'undefined' && DATA.LISTS && DATA.LISTS.heroIds) || []).slice(),
    hasRecipe: (id) => !!AUDIO.sfxRecipe(id),
    samples: () => ((typeof DATA !== 'undefined' && DATA.SAMPLES) ? JSON.parse(JSON.stringify(DATA.SAMPLES)) : null),
    selftestNote: () => 'weighting normalisation K2=' + K2.toFixed(4),
  };
}

// ---------------------------------------------------------------- browser pool
async function openPages(browser, n) {
  const scripts = pageScripts(), pages = [];
  for (let i = 0; i < n; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String((e && e.message) || e)));
    await page.goto('about:blank');
    for (const s of scripts) {
      await page.addScriptTag({ content: s.text });
      if (errs.length) throw new Error(`${s.name} threw while loading: ${errs[0]}`);
    }
    const ok = await page.evaluate(() => typeof AUDIO === 'object' && AUDIO && typeof AUDIO.compose === 'function' && typeof AUDIO.render === 'function' && typeof AUDIO.renderSfx === 'function' && typeof AUDIO.graph === 'function');
    if (!ok) throw new Error('AUDIO is missing compose, render, renderSfx or graph after loading ' + scripts.map((s) => s.name).join(', '));
    await page.evaluate('window.__mix = (' + pageLib.toString() + ')();');
    pages.push(page);
  }
  return pages;
}
/* Run async worker(item, page) over items with one worker loop per page; results come back in item order. */
async function pool(pages, items, worker) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(pages.map(async (page) => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], page, i);
      done++;
      if (!args.quiet && !args.json && process.stderr.isTTY) process.stderr.write(`\r  ${done}/${items.length}   `);
    }
  }));
  if (!args.quiet && !args.json && process.stderr.isTTY) process.stderr.write('\r' + ' '.repeat(24) + '\r');
  return results;
}
const call = (page, fn, ...a) => page.evaluate(({ fn: f, a: x }) => window.__mix[f](...x), { fn, a }).catch((e) => {
  const what = a.filter((x) => typeof x === 'string' || typeof x === 'number').join(' ');
  throw new Error(`${fn}(${what}) failed in the page: ${String((e && e.message) || e).split('\n')[0]}`);
});

// ---------------------------------------------------------------- shared helpers
const fmt = (x, d = 1) => (x <= -150 ? '-inf' : (x >= 0 ? ' ' : '') + x.toFixed(d));
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
function roleType(tr) {
  if (ROLE_TYPE[tr.role]) return { type: ROLE_TYPE[tr.role], guessed: false };
  const base = String(tr.role).replace(/-(double|low|high)$/, '');
  if (ROLE_TYPE[base]) return { type: ROLE_TYPE[base], guessed: false };
  if (VOICE_TYPE[tr.voice]) return { type: VOICE_TYPE[tr.voice], guessed: true };
  return { type: 'lead', guessed: true };
}
const roundTrim = (x) => Math.round(x * 1000) / 1000;
const trimText = (x) => { const s = String(roundTrim(x)); return /^-?\d+$/.test(s) ? s + '.0' : s; };
const optsFor = (defaults) => ({
  musicVol: args['music-vol'] !== undefined ? +args['music-vol'] : defaults.musicVol,
  sfxVol: args['sfx-vol'] !== undefined ? +args['sfx-vol'] : defaults.sfxVol,
  chunk: 4, exact: !!args.exact,
});
function pickTracks(all) {
  const want = args.tracks || args.track;
  if (!want) return all;
  const ids = String(want).split(',').map((s) => s.trim()).filter(Boolean);
  const bad = ids.filter((i) => !all.includes(i));
  if (bad.length) usageError('unknown score id(s): ' + bad.join(', ') + ' (known: ' + all.join(' ') + ')');
  return all.filter((i) => ids.includes(i));
}
async function describeAll(page, ids) {
  const out = {};
  for (const id of ids) out[id] = await call(page, 'describe', id);
  return out;
}

// ---------------------------------------------------------------- the MIX block
function formatBlock(indent, rows) {
  const lines = [indent + 'const MIX = {'];
  for (const id of Object.keys(rows)) lines.push(`${indent}  ${id}: [${rows[id].map(trimText).join(', ')}],`);
  lines.push(indent + '};');
  return lines.join('\n');
}
function writeMix(rows, measuredFrom) {
  const nowText = readText(AUDIO_FILE);
  if (nowText === null) return 'cannot re-read ' + AUDIO_FILE;
  if (withoutMix(nowText) !== withoutMix(measuredFrom)) return AUDIO_FILE + ' changed (outside the MIX block) while this tool was measuring: nothing written, run it again';
  const m = MIX_RE.exec(nowText);
  const next = nowText.replace(MIX_RE, () => `${m[1]}${m[2]}\n${formatBlock(m[1], rows)}\n${m[4]}${m[5]}`);
  const tmp = AUDIO_FILE + '.mix-tmp';
  fs.writeFileSync(tmp, next);
  fs.renameSync(tmp, AUDIO_FILE);
  return null;
}

// ---------------------------------------------------------------- modes
async function runTracks(pages, defaults) {
  const isCheck = modes[0] === 'check', literal = !!args.literal;
  const o = optsFor(defaults);
  const allIds = await call(pages[0], 'ids');
  const ids = pickTracks(allIds);
  const desc = await describeAll(pages[0], ids);
  const problems = [];
  const noteCount = (d) => d.tracks.reduce((s, t) => s + t.notes, 0);
  // the guard: the chunked renderer against the engine's own whole render, on a mid-sized score (a sparse one is dominated by a few random velocities)
  if (!args.exact && !args['no-guard'] && !isCheck) {
    const dense = ids.filter((id) => noteCount(desc[id]) >= 250);
    const cost = (id) => noteCount(desc[id]) * desc[id].seconds;
    const probe = (dense.length ? dense : ids).slice().sort((a, b) => cost(a) - cost(b))[dense.length ? 0 : ids.length - 1];
    const [fast, exact] = await Promise.all([
      call(pages[0], 'mixLevel', probe, null, 1, o),
      call(pages[Math.min(1, pages.length - 1)], 'mixLevel', probe, null, 1, Object.assign({}, o, { exact: true })),
    ]);
    const delta = fast.rms - exact.rms;
    note(`guard: ${probe} whole mix, chunked ${fmt(fast.rms, 2)} vs exact ${fmt(exact.rms, 2)} dBFS RMS (${delta >= 0 ? '+' : ''}${delta.toFixed(2)} dB)`);
    if (Math.abs(delta) > GUARD_DB) problems.push(`the chunked renderer disagrees with the exact one by ${delta.toFixed(2)} dB on ${probe}: rerun with --exact`);
  }
  const result = { defaults: { musicVol: o.musicVol, sfxVol: o.sfxVol }, mode: isCheck ? 'check' : literal ? 'literal' : 'fit', scores: {} };
  const liveRow = (id) => desc[id].tracks.map((t) => (LIVE_MIX[id] && LIVE_MIX[id][t.i] != null ? LIVE_MIX[id][t.i] : 1));
  // 1. every role alone, trim 1
  const solo = {};
  if (!isCheck) {
    const jobs = [];
    for (const id of ids) for (const t of desc[id].tracks) if (t.notes > 0) jobs.push({ id, ti: t.i, cost: t.notes * desc[id].seconds });
    jobs.sort((a, b) => b.cost - a.cost);
    note(`measuring ${jobs.length} roles of ${ids.length} scores on ${pages.length} page(s) ...`);
    const levels = await pool(pages, jobs, (j, page) => call(page, 'trackLevel', j.id, j.ti, 1, o));
    jobs.forEach((j, k) => { (solo[j.id] = solo[j.id] || {})[j.ti] = levels[k]; });
  }
  // the trims that put every role at its type's target plus G (G shifts a whole score, so the balance between roles never changes)
  const trimsAt = (id, G) => desc[id].tracks.map((t) => {
    const m = solo[id] && solo[id][t.i], live = LIVE_MIX[id] && LIVE_MIX[id][t.i] != null ? LIVE_MIX[id][t.i] : 1;
    const rt = roleType(t);
    t.type = rt.type; t.guessed = rt.guessed; t.live = LIVE_MIX[id] ? LIVE_MIX[id][t.i] : undefined;
    if (!m || m.lvl < -150) { t.m = null; return live; }
    const want = Math.pow(10, (TARGET_DB[rt.type] + G - m.lvl) / 20), trim = Math.min(TRIM_MAX, Math.max(TRIM_MIN, want));
    t.m = m; t.target = TARGET_DB[rt.type] + G; t.trim = roundTrim(trim); t.clamped = trim !== want; t.after = m.lvl + 20 * Math.log10(t.trim);
    return t.trim;
  });
  // a first guess for G from the solo levels alone: the roles are uncorrelated enough that their powers add, so the mix RMS follows
  // from the solo RMS values and the trims (the master chain and the overlaps move it by a dB or so; the renders below correct that)
  const predictRms = (id, G) => {
    const trims = trimsAt(id, G);
    let p = 0;
    desc[id].tracks.forEach((t) => { if (t.m && t.m.rms > -150) p += Math.pow(10, (t.m.rms + 20 * Math.log10(trims[t.i])) / 10); });
    return p > 0 ? 10 * Math.log10(p) : -200;
  };
  const predictG = (id) => {
    let lo = -60, hi = 20;
    for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (predictRms(id, mid) < centreOf(id)) lo = mid; else hi = mid; }
    return Math.round((lo + hi) / 2 * 10) / 10;
  };
  const centreOf = (id) => { const w = WINDOW_DB[FIGHT.test(id) ? 'fight' : 'calm']; return (w[0] + w[1]) / 2; };
  // 2. one fit per score: the level of the whole score at full intensity decides G (a few full-mix renders), the peak limit caps it
  const fits = {};
  {
    note(`${isCheck ? 'measuring' : literal ? 'checking' : 'fitting'} ${ids.length} full mixes ...`);
    const order = ids.slice().sort((a, b) => desc[b].seconds * noteCount(desc[b]) - desc[a].seconds * noteCount(desc[a]));
    const done = await pool(pages, order, async (id, page) => {
      if (isCheck) return { G: null, trims: liveRow(id), mix: await call(page, 'mixLevel', id, liveRow(id), 1, o), steps: 1 };
      if (literal) {
        const G = +args.offset || 0, trims = trimsAt(id, G);
        return { G, trims, mix: await call(page, 'mixLevel', id, trims, 1, o), steps: 1 };
      }
      let G = predictG(id), last = null;
      for (let k = 0; k < FIT_STEPS; k++) {
        const trims = trimsAt(id, G), r = await call(page, 'mixLevel', id, trims, 1, o);
        let dG = centreOf(id) - r.rms;
        if (r.peak + dG > PEAK_MAX_DB - 0.5) dG = Math.min(dG, PEAK_MAX_DB - 0.5 - r.peak);
        last = { G, trims, mix: r, steps: k + 1 };
        if (Math.abs(dG) < 0.35) break;
        G += dG;
      }
      return last;
    });
    order.forEach((id, k) => { fits[id] = done[k]; });
  }
  const rows = {};
  for (const id of ids) {
    const d = desc[id], f = fits[id];
    if (f && f.G !== null) rows[id] = trimsAt(id, f.G);        // also leaves the table fields (target, trim, after) of the measured G on the tracks
    else rows[id] = liveRow(id);
    if (isCheck && LIVE_MIX[id] && LIVE_MIX[id].length !== d.tracks.length) problems.push(`${id}: the MIX row has ${LIVE_MIX[id].length} entries but the score has ${d.tracks.length} tracks (the suite fails on this)`);
    if (isCheck && !LIVE_MIX[id]) problems.push(`${id}: no MIX row in ${path.relative(REPO, AUDIO_FILE)}`);
    for (const t of d.tracks) if (t.notes > 0 && !isCheck && !t.m) problems.push(`${id} track ${t.i} (${t.voice} ${t.role}) is silent: its trim stays ${rows[id][t.i]}`);
    result.scores[id] = {
      tempo: d.tempo, seconds: d.seconds, drive: d.drive, layers: d.layers, levelOffsetDb: f && f.G !== null ? round1(f.G) : null, fitSteps: f ? f.steps : 0,
      tracks: d.tracks.map((t) => ({ i: t.i, voice: t.voice, role: t.role, layer: t.layer, section: t.section, gain: t.gain, type: t.type, targetDb: t.target === undefined ? null : round1(t.target), soloDb: t.m ? round1(t.m.lvl) : null, trim: rows[id][t.i], live: t.live, clamped: !!t.clamped })),
      trims: rows[id],
    };
    if (f && f.mix) result.scores[id].mix = { 1: f.mix };
  }
  // 3. the quiet end: layer 0 alone (fights) or the still bed (maps), for the table
  {
    const lay = args.layer0 ? ids.filter((id) => (desc[id].layers > 1 || desc[id].drive) && fits[id] && fits[id].mix) : [];
    if (lay.length) {
      note(`measuring ${lay.length} scores at intensity 0 ...`);
      const quiet = await pool(pages, lay, (id, page) => call(page, 'mixLevel', id, rows[id], 0, o));
      lay.forEach((id, k) => { result.scores[id].mix[0] = quiet[k]; });
    }
    for (const id of ids) {
      const m = result.scores[id].mix;
      if (!m || !m[1]) continue;
      for (const x of Object.keys(m)) { const q = m[x]; m[x] = { lvl: round1(q.lvl), rms: round1(q.rms), rmsGated: round1(q.rmsGated), peak: round1(q.peak), maxM: round1(q.maxM) }; }
      const full = m[1], kind = FIGHT.test(id) ? 'fight' : 'calm', w = WINDOW_DB[kind];
      full.kind = kind; full.window = w;
      full.status = full.rms < w[0] ? 'LOW' : full.rms > w[1] ? 'HIGH' : 'ok';
      if (full.peak >= PEAK_MAX_DB) full.status += ' PEAK';
      if (full.status !== 'ok') problems.push(`${id}: full mix ${fmt(full.rms)} dBFS RMS (window ${w[0]} to ${w[1]}), peak ${fmt(full.peak)} dBFS (limit ${PEAK_MAX_DB}): ${full.status}`);
    }
  }
  // the whole block in audio.js order: measured rows, and the file's own rows for scores that were not measured
  const merged = {};
  for (const id of allIds) if (rows[id] || LIVE_MIX[id]) merged[id] = rows[id] || LIVE_MIX[id];
  if (!args.json) {
    if (!isCheck) {
      for (const id of ids) {
        const d = desc[id], r = result.scores[id];
        say(`\n${id}  (${d.tempo} bpm, ${d.seconds} s, ${d.tracks.length} tracks, ${d.layers} layer${d.layers > 1 ? 's' : ''}, drive ${d.drive || 'none'}${r.levelOffsetDb === null ? '' : `, roles aim at target ${r.levelOffsetDb >= 0 ? '+' : ''}${r.levelOffsetDb} dB (${r.fitSteps} mix render${r.fitSteps > 1 ? 's' : ''})`})`);
        say('  #  voice       role            type     layer  gain   solo dB  aim dB  trim   live  after');
        for (const t of d.tracks) {
          if (!t.m) { say(`  ${lpad(t.i, 2)}  ${pad(t.voice, 10)}  ${pad(t.role, 14)}  (no notes)`); continue; }
          say(`  ${lpad(t.i, 2)}  ${pad(t.voice, 10)}  ${pad(t.role, 14)}  ${pad(t.type + (t.guessed ? '?' : ''), 8)} ${lpad(t.layer, 4)}  ${lpad(roundTrim(t.gain), 5)}  ${lpad(fmt(t.m.lvl), 7)}  ${lpad(fmt(t.target), 6)}  ${lpad(trimText(t.trim), 5)}${t.clamped ? '*' : ' '} ${lpad(t.live != null ? trimText(t.live) : '-', 5)}  ${lpad(fmt(t.after), 5)}`);
        }
      }
      say('\n* trim clamped to ' + TRIM_MIN + ' .. ' + TRIM_MAX + ' (the role cannot reach its aim); "aim dB" is the A-weighted gated level of the role alone at the default sliders, "after" is what the trim gives.');
    }
    if (Object.keys(fits).length) {
      say('\nfull mixes at the default sliders (music ' + o.musicVol + ', effects ' + o.sfxVol + '), dBFS: plain RMS of the score, A-weighted gated loudness, sample peak:');
      say('  score        kind    RMS      window      A-gated   peak    status      layer 0 only (RMS / peak)');
      for (const id of ids) {
        const m = result.scores[id].mix;
        if (!m || !m[1]) continue;
        const f = m[1], z = m[0];
        say(`  ${pad(id, 12)} ${pad(f.kind, 6)}  ${lpad(fmt(f.rms), 6)}   ${pad(f.window[0] + '..' + f.window[1], 9)}   ${lpad(fmt(f.lvl), 7)}   ${lpad(fmt(f.peak), 5)}   ${pad(f.status, 10)}  ${z ? fmt(z.rms) + ' / ' + fmt(z.peak) : ''}`);
      }
    }
    if (!isCheck) {
      say('\n// MIX-BEGIN');
      say(formatBlock('  ', merged));
      say('// MIX-END');
    }
  }
  let wrote = false;
  if (args.write) {
    const missing = allIds.filter((id) => !merged[id]);
    if (missing.length) problems.push(`not written: no trims for ${missing.join(', ')} (run without --tracks first)`);
    else {
      const err = writeMix(merged, sourceText);
      if (err) problems.push(err);
      else { wrote = true; note(`wrote the MIX block of ${path.relative(REPO, AUDIO_FILE)} (${ids.length} score${ids.length > 1 ? 's' : ''} measured)`); }
    }
  } else if (!isCheck) note('nothing written (add --write to update the MIX block of ' + path.relative(REPO, AUDIO_FILE) + ')');
  result.problems = problems; result.wrote = wrote;
  if (args.json) console.log(JSON.stringify(result));
  else if (problems.length) { console.log('\nproblems:'); problems.forEach((p) => console.log('  ' + p)); }
  return problems.length;
}
const round1 = (x) => Math.round(x * 10) / 10;

async function runSelftest(pages, defaults) {
  const o = optsFor(defaults);
  const ids = pickTracks(await call(pages[0], 'ids'));
  const desc = await describeAll(pages[0], ids);
  const cost = (d) => d.tracks.reduce((s, t) => s + t.notes, 0) * d.seconds;
  const pick = args.tracks || args.track ? ids : ids.slice().sort((a, b) => cost(desc[a]) - cost(desc[b])).slice(0, 2);
  let bad = 0;
  for (const id of pick) {
    const trims = LIVE_MIX[id] || null;
    const [fast, exact] = await Promise.all([
      call(pages[0], 'mixLevel', id, trims, 1, o),
      call(pages[Math.min(1, pages.length - 1)], 'mixLevel', id, trims, 1, Object.assign({}, o, { exact: true })),
    ]);
    const dl = fast.rms - exact.rms, dp = fast.peak - exact.peak, ok = Math.abs(dl) <= GUARD_DB && Math.abs(dp) <= 2;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${pad(id, 12)} chunked ${fmt(fast.rms, 2)} dBFS RMS, peak ${fmt(fast.peak, 2)}   exact ${fmt(exact.rms, 2)} dBFS RMS, peak ${fmt(exact.peak, 2)}   delta ${dl >= 0 ? '+' : ''}${dl.toFixed(2)} dB, peak ${dp >= 0 ? '+' : ''}${dp.toFixed(2)} dB`);
  }
  console.log(await call(pages[0], 'selftestNote'));
  return bad;
}

async function runSfx(pages, defaults) {
  const o = optsFor(defaults);
  const base = await call(pages[0], 'sfxIds'), heroes = await call(pages[0], 'heroIds');
  const all = base.slice();
  for (const id of base) for (const h of heroes) if (await call(pages[0], 'hasRecipe', id + '.' + h)) all.push(id + '.' + h);
  let ids = all;
  if (args.ids) {
    const want = String(args.ids).split(',').map((s) => s.trim()).filter(Boolean);
    const bad = want.filter((i) => !all.includes(i));
    if (bad.length) usageError('unknown sfx id(s): ' + bad.join(', '));
    ids = all.filter((i) => want.includes(i));
  }
  const klass = (id) => SFX_OF[id.split('.')[0]] || null;
  note(`rendering ${ids.length} recipes (${ids.filter((i) => i.includes('.')).length} hero variants) ...`);
  const rows = await pool(pages, ids, (id, page) => {
    const k = klass(id);
    return call(page, 'sfxSolve', id, k ? SFX_TARGET_DB[k] : -20, o);
  });
  const problems = [];
  const out = [];
  ids.forEach((id, i) => {
    const r = rows[i], k = klass(id), target = k ? SFX_TARGET_DB[k] : null;
    if (!r) { problems.push(`${id}: no recipe`); return; }
    const off = target === null ? null : r.peak - target;
    const status = !k ? 'NO CLASS' : r.silent ? 'SILENT' : Math.abs(off) <= SFX_TOLERANCE_DB ? 'ok' : off > 0 ? 'LOUD' : 'QUIET';
    if (status !== 'ok') problems.push(`${id}: ${status}${k ? ` (peak ${fmt(r.peak)} dBFS, target ${target}, suggested vol ${r.vol1})` : ' (add it to SFX_CLASS in tools/hocus_vocus/mix.mjs)'}`);
    out.push({ id, class: k, target, vol: r.vol, peak: round1(r.peak), suggested: r.vol1, peakAfter: r.peak1 == null ? null : round1(r.peak1), dur: r.dur, status });
  });
  if (args.json) console.log(JSON.stringify({ defaults: { musicVol: o.musicVol, sfxVol: o.sfxVol }, sfx: out, problems }));
  else {
    say(`\nsfx peaks at the master output, Effects slider ${o.sfxVol} (the recipe's own vol, no random variation):`);
    say('  id                         class      target   vol      peak    off     suggested vol  (peak after)   status');
    for (const r of out) say(`  ${pad(r.id, 26)} ${pad(r.class || '?', 9)} ${lpad(r.target === null ? '-' : r.target, 6)}  ${lpad(r.vol, 6)}  ${lpad(fmt(r.peak), 6)}  ${lpad(r.target === null ? '-' : fmt(r.peak - r.target), 5)}   ${lpad(r.suggested, 8)}        ${lpad(r.peakAfter === null ? '-' : fmt(r.peakAfter), 6)}      ${r.status}`);
    say('\npaste-ready (suggested vol per id):');
    say('  ' + out.map((r) => `${/^[A-Za-z_$][\w$]*$/.test(r.id) ? r.id : "'" + r.id + "'"}: ${r.suggested}`).join(', '));
    if (problems.length) { console.log('\nproblems:'); problems.forEach((p) => console.log('  ' + p)); }
  }
  return problems.length;
}

async function runSamples(pages, defaults) {
  const o = optsFor(defaults);
  let manifest = null;
  if (args.manifest) { try { manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8')); } catch (e) { usageError('--manifest: ' + e.message); } }
  else manifest = await call(pages[0], 'samples');
  const audioDir = path.resolve(args['audio-dir'] || path.join(path.dirname(AUDIO_FILE), '..', 'audio'));
  if (!manifest) { console.log('no DATA.SAMPLES in this build (js/data_samples.js is not there yet): nothing to measure'); return 0; }
  const formats = Array.isArray(manifest.formats) && manifest.formats.length ? manifest.formats : ['m4a', 'ogg', 'mp3', 'wav'];
  const groups = ['sfx', 'spells', 'syllables', 'stingers'];
  const entries = [];
  for (const g of groups) for (const key of Object.keys(manifest[g] || {})) {
    const e = manifest[g][key], spec = typeof e === 'string' ? { files: [e] } : Array.isArray(e) ? { files: e } : Object.assign({}, e);
    entries.push({ group: g, key, spec, files: spec.files || (spec.file ? [spec.file] : []) });
  }
  if (!entries.length) { console.log('DATA.SAMPLES lists no sounds (the shipped state): nothing to measure'); return 0; }
  const gain = manifest.gain == null ? 1 : +manifest.gain;
  const problems = [], out = [];
  for (const en of entries) {
    const row = { group: en.group, key: en.key, files: [], vol: en.spec.vol == null ? 1 : en.spec.vol };
    // the synth version this key stands for
    let ref;
    if (en.group === 'sfx') ref = { sfx: en.key };
    else if (en.group === 'stingers') ref = { sfx: STINGER_SFX[en.key] || en.key };
    else if (en.group === 'spells') ref = { sfx: 'brush_use' };
    else ref = { vol: 0.5, syl: /^(oo|ah|mm)$/.test(en.key) ? undefined : en.key, vowel: en.key === 'oo' ? 'u' : en.key === 'ah' ? 'a' : en.key === 'mm' ? 'm' : undefined, midi: en.spec.midi, dur: 0.4 };
    const refLvl = await call(pages[0], 'referenceLevel', ref, o);
    if (!refLvl) { problems.push(`${en.group}.${en.key}: no synth reference to compare with (${ref.sfx || 'vox ' + ref.syl})`); out.push(row); continue; }
    row.reference = ref.sfx || 'vox ' + (ref.syl || ref.vowel || 'a');
    row.refLvl = round1(refLvl.lvl); row.refPeak = round1(refLvl.peak);
    const lv = [];
    for (const name of en.files) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) { problems.push(`${en.group}.${en.key}: "${name}" is not a legal sample name`); continue; }
      const f = formats.map((x) => path.join(audioDir, name + '.' + x)).find((p) => fs.existsSync(p));
      if (!f) { problems.push(`${en.group}.${en.key}: no file ${name}.(${formats.join('|')}) in ${path.relative(REPO, audioDir) || audioDir}`); continue; }
      const m = await call(pages[0], 'sampleLevel', fs.readFileSync(f).toString('base64'), { start: en.spec.start, end: en.spec.end, gain: refLvl.vol * gain, musicVol: o.musicVol, sfxVol: o.sfxVol });
      if (m.error) { problems.push(`${en.group}.${en.key}: ${path.basename(f)} did not decode here (${m.error}); this Chromium may lack that codec, measure an .ogg or .wav copy`); continue; }
      row.files.push({ name: path.basename(f), lvl: round1(m.lvl), peak: round1(m.peak), seconds: +m.seconds.toFixed(2), channels: m.channels });
      lv.push(m);
    }
    if (lv.length) {
      const meanPow = lv.reduce((s, m) => s + Math.pow(10, m.lvl / 10), 0) / lv.length;
      const lvlDb = 10 * Math.log10(meanPow), pk = Math.max.apply(null, lv.map((m) => m.peak));
      const byLoud = Math.pow(10, (refLvl.lvl - lvlDb) / 20), byPeak = Math.pow(10, (refLvl.peak - pk) / 20);
      row.vol_loudness = roundTrim(byLoud); row.vol_peak = roundTrim(byPeak);
      row.suggested = roundTrim(Math.min(2, Math.max(0.05, Math.min(byLoud, byPeak * Math.pow(10, 3 / 20)))));
      if (lv.length > 1) { const sp = Math.max.apply(null, lv.map((m) => m.lvl)) - Math.min.apply(null, lv.map((m) => m.lvl)); row.spread = round1(sp); if (sp > 3) problems.push(`${en.group}.${en.key}: its files differ by ${sp.toFixed(1)} dB in loudness (round robin would jump)`); }
    }
    out.push(row);
  }
  if (args.json) console.log(JSON.stringify({ samples: out, problems }));
  else {
    say('\nsamples against their synth versions (sfx bus, Effects slider ' + o.sfxVol + ', manifest gain ' + gain + '):');
    say('  key                          files  sample dB  synth dB  vol by loudness  vol by peak  suggested vol  (manifest vol)');
    for (const r of out) {
      if (!r.files.length) { say(`  ${pad(r.group + '.' + r.key, 28)} (nothing measured)`); continue; }
      const lvl = 10 * Math.log10(r.files.reduce((s, f) => s + Math.pow(10, f.lvl / 10), 0) / r.files.length);
      say(`  ${pad(r.group + '.' + r.key, 28)} ${lpad(r.files.length, 5)}  ${lpad(fmt(lvl), 9)}  ${lpad(fmt(r.refLvl), 8)}  ${lpad(r.vol_loudness, 15)}  ${lpad(r.vol_peak, 11)}  ${lpad(r.suggested, 13)}  ${lpad(r.vol, 8)}`);
    }
    say('\nput the suggested vol in the manifest entry, for example  hit_light: { files: [\'kick_soft\'], vol: 0.9 }');
    if (problems.length) { console.log('\nproblems:'); problems.forEach((p) => console.log('  ' + p)); }
  }
  return problems.length;
}

// ---------------------------------------------------------------- main
let browser;
try {
  browser = await chromium.launch(LAUNCH);
  const mode = modes[0] || 'tracks';
  const nPages = mode === 'selftest' ? Math.min(2, JOBS) : mode === 'samples' ? 1 : JOBS;
  const pages = await openPages(browser, nPages);
  const defaults = await call(pages[0], 'defaults');
  const problems = mode === 'sfx' ? await runSfx(pages, defaults) : mode === 'samples' ? await runSamples(pages, defaults) : mode === 'selftest' ? await runSelftest(pages, defaults) : await runTracks(pages, defaults);
  await browser.close();
  process.exit(problems && !args['no-fail'] ? 1 : 0);
} catch (e) {
  console.error('mix: ' + (e && e.message ? e.message : e));
  if (browser) await browser.close().catch(() => {});
  process.exit(2);
}
