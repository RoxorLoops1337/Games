// Audio batch 12 (agent i): shot panning by aim angle in ring stages, a quiet aim sweep tick every 15 degrees,
// the boss kill crown clink, a milestone sting, ambient bed side-chain breathing on the beat clock and fewer
// voices in big chain bursts. Pure helpers (checked offline) plus one registrar at the end of the sfx table.

export const PAN_MAX = 0.65;
// Stereo pan from an aim angle (radians, -PI/2 is straight up): right is +, left is -, up and down are centred.
export const panOf = a => (Number.isFinite(a) ? Math.max(-PAN_MAX, Math.min(PAN_MAX, Math.cos(a) * PAN_MAX)) : 0);

// Aim sweep: one tick whenever the aim crosses a 15 degree line, at most one per TICK_GAP ms. st = { b: bucket, t: last ms }.
export const TICK_STEP = Math.PI / 12, TICK_GAP = 70;
export function sweepTick(st, a, ms) {
  if (!Number.isFinite(a)) return false;
  const b = Math.floor(a / TICK_STEP);
  if (st.b === undefined) { st.b = b; st.t = -1e9; return false; }
  if (b === st.b) return false;
  st.b = b;
  if (ms - st.t < TICK_GAP) return false;
  st.t = ms; return true;
}

// Side-chain breath for the ambient bed: gain points [seconds after the beat, level] for one beat of length spb.
export const SIDE_DEPTH = 0.45;
export const dipPts = (spb, depth = SIDE_DEPTH) => [[0, 1 - depth], [Math.min(0.06, spb * 0.2), 1 - depth], [spb * 0.85, 1]];
export function dipBed(gainParam, t, spb, depth) {
  if (!gainParam || !(spb > 0)) return;
  try { const p = dipPts(spb, depth); gainParam.setValueAtTime(p[0][1], t + p[0][0]); gainParam.linearRampToValueAtTime(p[1][1], t + p[1][0]); gainParam.linearRampToValueAtTime(p[2][1], t + p[2][0]); } catch (e) { /* ignore */ }
}

// Big chain bursts: past BURST_FREE kills inside BURST_MS every other plain kill is dropped (heads and boss cells always sound).
export const BURST_MS = 260, BURST_FREE = 6;
export function burstKeep(st, ms, special) {
  if (ms - st.t > BURST_MS) st.n = 0;
  st.t = ms; st.n++;
  return !!special || st.n <= BURST_FREE || (st.n & 1) === 0;
}
// Milestone stages (every 10th, plus the finale) answer a win with an extra sting.
export const isMilestone = stage => stage > 0 && stage % 10 === 0;

export function registerB12i(sfx, tone, noise, duck, gate, now) {
  // quiet aim tick: a tiny dry click
  sfx.aimtick = () => { if (!gate('aimtick', 60)) return; tone(2600, 0.016, 'sine', 0.012, -600); };
  // boss kill crown: a gold clink that rings on top of the head death
  sfx.bosscrown = () => {
    if (!gate('bosscrown', 800)) return;
    [2093, 3136, 4186].forEach((f, i) => tone(f, 0.5 - i * 0.1, 'sine', 0.04 - i * 0.008, 0, 0.12 + i * 0.03));
    tone(1568, 0.1, 'triangle', 0.05, 0, 0.1); noise(0.06, 0.03, 7000, 5000, 'highpass', 0.1);
  };
  // milestone: a short brass-like fanfare, then a held fifth
  sfx.milestone = () => {
    if (!gate('milestone', 1500)) return;
    [392, 523, 659, 784].forEach((f, i) => { tone(f, 0.16, 'sawtooth', 0.035, 0, 0.5 + i * 0.1); tone(f * 2, 0.16, 'sine', 0.02, 0, 0.5 + i * 0.1); });
    [523, 784, 1047].forEach(f => tone(f, 0.8, 'triangle', 0.04, 0, 0.95));
    noise(0.3, 0.02, 6000, 9000, 'highpass', 0.95); duck(0.3, 1);
  };
  const baseKill = sfx.kill, bst = { n: 0, t: -1e9 };
  sfx.kill = e => { if (!burstKeep(bst, now(), !!(e && (e.head || e.boss)))) return; baseKill(e); };
  sfx.pop = e => sfx.kill(e);
}
