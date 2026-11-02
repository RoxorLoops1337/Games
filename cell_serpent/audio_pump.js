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
