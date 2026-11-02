// Audio batch 13 (agent h): variety and mix. Shots rotate through a four note figure instead of one buzzing pitch,
// the silent events (gloom, nap, pillow, shell, metro, soundcheck) get their own small sounds, the song form changes
// with the stage inside one key, and every section ends in a drum fill that alternates between a snare roll and a tom run.
// Pure helpers (checked offline) plus one registrar at the end of the sfx table.

// Shot figure: each shot steps the figure, a little detune keeps it alive. n is the running shot count.
export const SHOOT_STEPS = [0, 3, 5, 3];   // semitones over the base, minor-ish so a long burst never sounds sour
export const shootHz = (n, rnd = 0) => 520 * Math.pow(2, SHOOT_STEPS[((n % 4) + 4) % 4] / 12) * (1 + (rnd - 0.5) * 0.04);

// Song form: each stage inside a key block starts one section later in the progression cycle, so stages 6, 7, 8 ... do not
// open on the same four chords. Bosses keep their own progression.
export const progShift = stage => (Math.max(0, (stage | 0) - 1) % 5) % 4;

// Section fill, played on the last beat of the last bar. Returns null or { k: 'snare' | 'tom', v, hz }.
// Odd sections end on a snare roll (two hits), even sections on a falling tom run (three hits).
export function fillOf(sec, bar, s, lvl) {
  if (bar !== 3 || s < 13 || lvl <= 0.3) return null;
  if (sec & 1) return s >= 14 ? { k: 'snare', v: 0.04 + (s - 14) * 0.035 } : null;
  return { k: 'tom', v: 0.1 + (s - 13) * 0.02, hz: [196, 165, 131][s - 13] };
}

export function registerB13h(sfx, tone, noise, duck, gate) {
  let shots = 0;
  sfx.shoot = () => { if (!gate('shoot', 70)) return; shots++; tone(shootHz(shots, Math.random()), 0.07, 'square', 0.04, -200); };
  // a snake dozes off: a slow falling sigh with a soft breath
  sfx.nap = () => { if (!gate('nap', 800)) return; tone(330, 0.7, 'sine', 0.07, -140); tone(247, 0.9, 'sine', 0.05, -90, 0.35); noise(0.6, 0.015, 900, 250, 'lowpass', 0.05); };
  // gloom shade: a dark minor third that drops
  sfx.gloom = () => { if (!gate('gloom', 600)) return; tone(185, 0.5, 'triangle', 0.08, -60); tone(220, 0.5, 'triangle', 0.06, -70, 0.06); noise(0.3, 0.02, 500, 120, 'lowpass'); };
  // pillow bonk: a soft low thump with a fluffy puff
  sfx.pillow = () => { if (!gate('pillow', 300)) return; tone(120, 0.18, 'sine', 0.13, -60); noise(0.16, 0.05, 1400, 300, 'lowpass', 0.01); tone(523, 0.14, 'sine', 0.03, 120, 0.05); };
  // shell shut: a tiny glassy tick
  sfx.shell = () => { if (!gate('shell', 160)) return; tone(1500, 0.05, 'triangle', 0.05, -500); tone(900, 0.08, 'sine', 0.04, -200, 0.03); };
  // metronome gear: only a hit on the beat rings (a woodblock and a coin shimmer)
  sfx.metro = e => { if (!(e && e.hit) || !gate('metro', 120)) return; tone(988, 0.05, 'triangle', 0.08); tone(1976, 0.18, 'sine', 0.05, 0, 0.04); tone(2637, 0.14, 'sine', 0.025, 0, 0.07); };
  // sound check: two bright pings, the second a fifth up
  sfx.soundcheck = () => { if (!gate('soundcheck', 250)) return; tone(1175, 0.1, 'sine', 0.05); tone(1760, 0.2, 'sine', 0.05, 0, 0.08); };
}
