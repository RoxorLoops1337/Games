// Audio batch 11: Mirror cell glance and shatter, the Beat Run chime and the boss phase 2 twists. Registered at the end of the sfx table.
export function registerB11(sfx, tone, noise, gate) {
  sfx.mirror = e => { if (!gate('mirror', e && e.brk ? 120 : 160)) return; if (e && e.brk) { tone(1568, 0.1, 'triangle', 0.045, 0); tone(2093, 0.16, 'sine', 0.035, 0, 0.05); noise(0.08, 0.035, 5000, 7000, 'highpass'); } else tone(2349, 0.05, 'sine', 0.025, -300); };
  sfx.beatrun = () => { if (!gate('beatrun', 250)) return; [523, 659, 784].forEach((f, i) => tone(f, 0.09, 'triangle', 0.04, 0, i * 0.05)); };
  sfx.btwist = e => {
    if (!gate('btwist', 200)) return;
    if (!e) return;
    if (e.k === 'drop') { if (e.warn) tone(180, 0.1, 'sine', 0.04, 0); else { tone(70, 0.28, 'sine', 0.09, -40); noise(0.1, 0.04, 900, 300, 'lowpass'); } }
    else if (e.k === 'hold') { tone(392, 0.2, 'triangle', 0.04, 0); tone(494, 0.2, 'triangle', 0.03, 0, 0.04); }
    else { [330, 415, 523].forEach((f, i) => tone(f, 0.12, 'sine', 0.035, 0, i * 0.06)); }
  };
}
