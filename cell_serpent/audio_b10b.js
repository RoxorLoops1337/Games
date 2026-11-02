// Audio round 10 (agent 13): a tom fill and a key lift when a boss changes phase, the BRING THEM pack sound, sticker book
// sounds (page, tap, new sticker), a voice for every pet when a snake head gets close, and a quiet ambient bed per world
// that sits under the music while you play. Tables and helpers are pure (checked offline); one registrar adds the sfx.
// Everything new lives at the end of the sfx table. Midi notes where noted, otherwise Hz.
import { breathOf } from './audio_b11b.js';

// Key lift: semitones added to the boss root per phase (0 = unchanged). Phase 1 a whole step, phase 2 a minor third.
export const KEY_LIFT = [0, 2, 3];
export const keyLift = bp => KEY_LIFT[Math.max(0, Math.min(2, bp | 0))];

// Tom fill: [hz, delay] per hit, falling around the kit; phase 2 is longer and ends on a crash.
export const FILL = {
  1: [[220, 0.3], [185, 0.37], [147, 0.44]],
  2: [[247, 0.28], [220, 0.34], [185, 0.4], [147, 0.46], [110, 0.52]],
};
export const fillOf = n => FILL[n >= 2 ? 2 : 1];

// Pet voices when a head gets close: w = wave, f = start hz, s = slide, d = duration, v = volume, x = colour.
export const PET_VOICE = {
  kitten: { w: 'sawtooth', f: 1400, s: -500, d: 0.18, v: 0.03, x: 'hiss' },
  puppy: { w: 'sawtooth', f: 130, s: -30, d: 0.28, v: 0.06, x: 'growl' },
  piglet: { w: 'square', f: 420, s: -140, d: 0.1, v: 0.04, x: 'oink' },
  lamb: { w: 'sawtooth', f: 520, s: -60, d: 0.34, v: 0.04, x: 'baa' },
  hamster: { w: 'sine', f: 1900, s: 700, d: 0.1, v: 0.05, x: 'eek' },
  turtle: { w: 'sine', f: 180, s: -90, d: 0.12, v: 0.06, x: 'tuck' },
};
export const petVoice = id => PET_VOICE[id] || PET_VOICE.kitten;

// Sticker tap: a got sticker rings a bell from a pentatonic ladder by its place in the book, a locked one thunks.
export const stickerPitch = i => 784 * Math.pow(2, ([0, 2, 4, 7, 9][Math.max(0, i | 0) % 5] + 12 * (Math.floor(Math.max(0, i | 0) / 5) % 2)) / 12);

// Ambient bed per world: filtered noise on the music bus. t = filter type, f = centre hz, q, v = gain.
export const AMBIENT = {
  love:   { t: 'bandpass', f: 1800, q: 0.5, v: 0.007 },
  rust:   { t: 'lowpass',  f: 320,  q: 0.7, v: 0.012 },
  sneezy: { t: 'highpass', f: 4200, q: 0.7, v: 0.004 },
  grumpy: { t: 'lowpass',  f: 170,  q: 0.7, v: 0.016 },
  sleepy: { t: 'lowpass',  f: 520,  q: 0.7, v: 0.01,  r: 0.08 },
  disco:  { t: 'bandpass', f: 6000, q: 0.8, v: 0.004 },
  sour:   { t: 'bandpass', f: 2500, q: 1.2, v: 0.005 },
  mighty: { t: 'lowpass',  f: 130,  q: 0.7, v: 0.018 },
  frosty: { t: 'bandpass', f: 5000, q: 0.6, v: 0.006 },
  gloomy: { t: 'bandpass', f: 420,  q: 0.9, v: 0.012 },
};
export const ambientOf = skin => AMBIENT[skin] || AMBIENT.love;

// One looping noise bed. start(skin) fades it in, stop() fades it out and frees the nodes. Never throws.
export function createAmbient(ac, bus, buf) {
  let cur = null;
  const stop = () => {
    const n = cur; if (!n) return; cur = null;
    try { n.lfo && n.lfo.stop(ac.currentTime + 0.7); } catch (e) { /* ignore */ }
    try { const t = ac.currentTime; n.out.gain.cancelScheduledValues && n.out.gain.cancelScheduledValues(t); n.out.gain.setValueAtTime(Math.max(0.0001, n.v), t); n.out.gain.linearRampToValueAtTime(0.0001, t + 0.6); n.src.stop(t + 0.7); } catch (e) { /* ignore */ }
  };
  const start = skin => {
    if (cur && cur.skin === skin) return;
    stop();
    try {
      const a = ambientOf(skin), t = ac.currentTime, src = ac.createBufferSource(), fl = ac.createBiquadFilter(), out = ac.createGain();
      src.buffer = buf; src.loop = true; fl.type = a.t; fl.frequency.value = a.f; if (fl.Q) fl.Q.value = a.q;
      out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(a.v, t + 2);
      src.connect(fl); fl.connect(out); out.connect(bus); src.start(t);
      let lfo = null;   // r11: the bed breathes, a slow sine adds to its level (rate per world)
      try { const br = breathOf(skin), lg = ac.createGain(); lfo = ac.createOscillator(); lfo.frequency.value = br.hz; lg.gain.value = a.v * br.depth; lfo.connect(lg); lg.connect(out.gain); lfo.start(t); } catch (e) { lfo = null; }
      cur = { skin, src, out, v: a.v, lfo };
    } catch (e) { cur = null; }
  };
  return { start, stop, get skin() { return cur ? cur.skin : null; } };
}

export function registerA10(sfx, tone, noise, duck, gate) {
  const base = sfx.bossphase;
  // boss phase: the old hit and siren, then a tom fill that falls into the new key (phase 2 ends on a crash)
  sfx.bossphase = e => {
    if (base) base(e);
    const n = e && e.n >= 2 ? 2 : 1;
    for (const [f, d] of fillOf(n)) { tone(f, 0.22, 'sine', 0.05, -f * 0.45, d); noise(0.04, 0.012, 1800, 500, 'bandpass', d); }
    if (n === 2) noise(0.7, 0.03, 9000, 3000, 'highpass', 0.58);
  };
  // BRING THEM: a clasp snaps shut and three pings climb, packed
  sfx.bringpack = () => {
    if (!gate('bringpack', 150)) return;
    tone(300, 0.05, 'square', 0.04, -120); noise(0.03, 0.03, 3500, 900, 'bandpass');
    [660, 880, 1175].forEach((f, i) => tone(f, 0.14, 'triangle', 0.045, 0, 0.07 + i * 0.07));
  };
  // UNDO of the packed build: two soft notes falling
  sfx.bringundo = () => { if (!gate('bringundo', 150)) return; tone(880, 0.09, 'triangle', 0.04); tone(587, 0.14, 'triangle', 0.04, 0, 0.07); };
  // sticker book: tap = bell (got) or dull thunk (locked); a page rustle with a glitter when new stickers appear
  sfx.stickertap = e => {
    if (!gate('stickertap', 60)) return;
    if (e && e.got) { const f = stickerPitch(e.i); tone(f, 0.22, 'sine', 0.05); tone(f * 2, 0.12, 'sine', 0.015, 0, 0.01); }
    else tone(170, 0.06, 'triangle', 0.05, -50);
  };
  sfx.stickernew = e => {
    if (!gate('stickernew', 400)) return;
    noise(0.22, 0.03, 1500, 5000, 'bandpass');
    const k = Math.min(4, Math.max(1, (e && e.n) | 0 || 1));
    for (let i = 0; i < k; i++) tone(1047 * Math.pow(2, [0, 4, 7, 12][i] / 12), 0.18, 'sine', 0.04, 0, 0.16 + i * 0.07);
    tone(3136, 0.3, 'sine', 0.012, 0, 0.3);
  };
  // a pet answers a close snake head in its own voice (see PET_VOICE)
  sfx.petcall = e => {
    if (!gate('petcall', 90)) return;
    const v = petVoice(e && e.id);
    if (v.x === 'hiss') { noise(v.d, v.v, 7000, 3000, 'highpass'); tone(v.f, v.d * 0.6, v.w, v.v * 0.4, v.s); }
    else if (v.x === 'growl') { tone(v.f, v.d, v.w, v.v, v.s); tone(v.f * 1.5, v.d * 0.8, 'square', v.v * 0.3, v.s, 0.03); noise(v.d, 0.02, 400, 150, 'lowpass'); }
    else if (v.x === 'oink') { tone(v.f, v.d, v.w, v.v, v.s); tone(v.f * 0.85, v.d, v.w, v.v, v.s, 0.11); }
    else if (v.x === 'baa') { tone(v.f, v.d, v.w, v.v, v.s); tone(v.f * 1.04, v.d, 'triangle', v.v * 0.8, v.s, 0.02); }
    else if (v.x === 'eek') { tone(v.f, v.d, v.w, v.v, v.s); tone(v.f * 1.3, 0.06, 'sine', v.v * 0.5, 0, 0.09); }
    else { tone(v.f, v.d, v.w, v.v, v.s); noise(0.05, 0.02, 600, 200, 'lowpass'); }   // turtle: a shell thup
  };
}
