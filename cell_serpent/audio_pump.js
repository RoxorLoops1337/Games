// Kick sidechain pump (round 5): long held notes (the pad, the boss drone) dip on every kick and swell back between
// them, the classic "breathing" dance-music pump. Pure helpers so the offline tests can check the shape without ears.

// How deep the dip is (the gain at the bottom): more groove pumps harder, bosses pump a bit deeper.
export const pumpDepth = (lvl, boss) => Math.max(0.2, Math.min(0.6, 0.55 - 0.3 * Math.max(0, Math.min(1, lvl || 0)) - (boss ? 0.08 : 0)));

// Envelope points [timeFromStart, gain] for a held note of `dur` seconds peaking at `vol`, with a dip on t = 0 and on every
// `beat` seconds after. All segments are linear ramps, so they can be scheduled with linearRampToValueAtTime.
export function pumpEnv(vol, dur, beat, depth) {
  const rel = Math.min(0.2, beat * 0.55), pts = [[0, 0.0001], [0.004, vol * depth], [rel, vol]];
  for (let b = beat; b < dur - rel - 0.02; b += beat) pts.push([b - 0.002, vol], [b + 0.012, vol * depth], [b + rel, vol]);
  pts.push([Math.max(dur, rel + 0.03), 0.0008]);
  return pts;
}

// Pump setting: 0 off, 1 soft (pad only, half as deep), 2 full (default: pad plus a light dip on arp and lead).
export const PUMP_LEVELS = ['Off', 'Soft', 'Full'];
export const pumpLevel = v => { v = Number(v); return v === 0 || v === 1 ? v : 2; };
// Depth the pad uses at a pump level: off never dips, soft only goes half way down.
export const padDepth = (lvl, boss, setting) => { const s = pumpLevel(setting), d = pumpDepth(lvl, boss); return s === 0 ? 1 : s === 1 ? 1 - (1 - d) * 0.5 : d; };
// Volume multiplier for short arp and lead notes: the kick (step 0 of every beat) knocks them down a little, the next
// 16th is half way back, then they are free. Lightly, so it reads as groove and not as stutter. Only at level 2.
export function lightPump(step, lvl, boss, setting) {
  if (pumpLevel(setting) < 2) return 1;
  const k = step & 3, cut = (1 - pumpDepth(lvl, boss)) * 0.3;
  return k === 0 ? 1 - cut : k === 1 ? 1 - cut * 0.4 : 1;
}
// Soft falling sigh when a long kill chain runs out: true once per chain, when it was at least 6 long and went quiet.
export function chainBroke(chain, quietMs) { return chain >= 6 && quietMs > 900; }
