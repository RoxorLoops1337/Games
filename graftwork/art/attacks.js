// Enemy attack rigs: pure pose math, no drawing (design/JUICE.md). STUB: the rig animator implements the 51 signature attacks.
// timing(id, body)  -> { tell, act, hold, rec, impactMs }   all in ms; contact (the damage event) lands at tell + act
// pose(id, body, phase, k) -> { dx, dy, sx, sy, rot, glow, extra } or null; phase is 'tell'|'act'|'hold'|'rec', k 0..1 inside the phase
export function timing(id, body) { return { tell: 120, act: 60, hold: 40, rec: 180, impactMs: 180 }; }
export function pose(id, body, phase, k) { return null; }
