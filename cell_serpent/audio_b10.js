// Audio batch 10: gameplay cues for the Snack cell, the phase 2 startle and the ring stage record skip. Registered at the end of the sfx table.
export function registerB10(sfx, tone, noise, gate) {
  sfx.snackdrop = () => { if (!gate('snackdrop', 120)) return; tone(659, 0.1, 'triangle', 0.05, 0); tone(988, 0.14, 'sine', 0.04, 0, 0.06); };
  sfx.snackget = () => { if (!gate('snackget', 100)) return; [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, 'square', 0.035, 0, i * 0.045)); noise(0.05, 0.03, 4000, 6000, 'highpass'); };
  sfx.snackgone = () => { if (!gate('snackgone', 200)) return; tone(392, 0.16, 'sine', 0.03, -120); };
  sfx.ringskip = e => { if (!gate('ringskip', 200)) return; noise(0.12, 0.05, 3000, 900, 'bandpass'); if (!(e && e.warn)) tone(147, 0.18, 'sawtooth', 0.05, -60); };
  sfx.startle = () => { if (!gate('startle', 300)) return; tone(110, 0.2, 'sawtooth', 0.05, 80); noise(0.08, 0.04, 2000, 800, 'bandpass'); };
}
