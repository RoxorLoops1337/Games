// Audio batch 16a (rhythm core): the PERFECT ping that climbs with the streak, THE DROP (a riser tail, a sub hit and a bright chord),
// the chorus stab on every beat while the drop lasts, and the soft fall when it ends. Registered at the end of the sfx table.
const PENT = [0, 2, 4, 7, 9];
export const pentHz16 = (n, base = 523.25) => base * Math.pow(2, (PENT[n % 5] + 12 * Math.floor(n / 5)) / 12);   // n steps up a pentatonic ladder
export const CHORUS_ROOTS = [0, -3, -7, -5];   // the stab walks I, vi, IV, V (semitones from C)
export function registerB16a(sfx, tone, noise, duck, gate) {
  sfx.rhy = e => {
    if (!e || e.j !== 2 || !gate('rperfect', 90)) return;
    const f = pentHz16(Math.min(9, Math.max(0, (e.n || 1) - 1)));
    tone(f, 0.09, 'sine', 0.06, 0); tone(f * 2, 0.07, 'triangle', 0.025, 0, 0.012);
  };
  sfx.rdrop = () => {
    if (!gate('rdrop', 800)) return;
    duck(0.45, 0.5);
    tone(58, 0.4, 'sine', 0.18, -30); noise(0.35, 0.09, 1800, 200, 'lowpass');
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.5, i % 2 ? 'triangle' : 'sawtooth', 0.045, 0, 0.04 + i * 0.03));
    noise(0.25, 0.04, 3000, 9000, 'highpass');
  };
  sfx.rchorus = e => {
    if (!gate('rchorus', 120)) return;
    const r = CHORUS_ROOTS[((e && e.n) || 0) & 3], k = Math.pow(2, r / 12);
    tone(261.63 * k, 0.16, 'triangle', 0.045, 0); tone(329.63 * k, 0.16, 'triangle', 0.035, 0); tone(392 * k, 0.16, 'triangle', 0.035, 0);
    tone(1046.5 * k, 0.05, 'sine', 0.02, 0, 0.02);
  };
  sfx.rdropend = () => { if (!gate('rdropend', 400)) return; tone(659.25, 0.18, 'sine', 0.04, -80); tone(440, 0.3, 'sine', 0.035, -60, 0.1); };
}
