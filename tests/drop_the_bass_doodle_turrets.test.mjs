// Drop the Bass: the doodle turret art, headless. Every turret x level x state and every projectile draws on a mock ctx without throwing, keeps save/restore balanced,
// stays deterministic, and never touches Math.random or Date.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawTurret, drawTurretIconFlat, drawProjectile, setArtScale } from '../drop_the_bass/js/doodle_turrets.js';
import { TURRET_IDS } from '../drop_the_bass/js/data_core.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
function mock() {
  const st = { saves: 0, restores: 0, calls: 0, nan: 0, log: [] };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === '__st') return st;
      if (k === 'save') return () => { st.saves++; };
      if (k === 'restore') return () => { st.restores++; };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k in t) return t[k];
      return (...a) => { st.calls++; for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) st.nan++; st.log.push(k + a.length); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}
setArtScale(2);
const states = [{}, { fire: 1 }, { fire: 0.4, ang: 2.5 }, { jammed: true }, { buff: 'rate' }, { buff: 'dmg' }, { selected: true }, { spawn: 0.5 }, { alpha: 0.4, scale: 1.3 }, { t: 12.34, ang: -3 }];
for (const id of TURRET_IDS) for (let L = 1; L <= 7; L++) for (const o of states) {
  const c = mock(); drawTurret(c, id, L, 100, 100, Object.assign({ t: 1 }, o));
  ok(c.__st.saves === c.__st.restores, id + ' L' + L + ' balanced'); ok(c.__st.nan === 0, id + ' no NaN'); ok(c.__st.calls > 5, id + ' draws something');
}
for (const id of TURRET_IDS) { const c = mock(); drawTurretIconFlat(c, id, 30, 30, 56); ok(c.__st.saves === c.__st.restores && c.__st.nan === 0, 'icon ' + id); }
for (const k of ['kick', 'snare', 'hat', 'scratch', 'cowbell', 'orb', 'vocal', 'synth', 'unknown']) for (const o of [{}, { t: 3, ang: 1 }, { scale: 0.7 }]) { const c = mock(); drawProjectile(c, k, 5, 5, o); ok(c.__st.saves === c.__st.restores && c.__st.nan === 0, 'projectile ' + k); }
// unknown ids and missing options never throw
drawTurret(mock(), 'nope', 1, 0, 0); drawTurret(mock(), 'kick', 99, 0, 0); drawTurret(mock(), 'kick', -3, 0, 0, null); drawTurretIconFlat(mock(), 'nope', 0, 0, 10); n += 4;
// determinism: the same call draws the same sequence of operations
const a = mock(), b = mock(); drawTurret(a, 'synth', 5, 10, 10, { t: 2, ang: 1, fire: 0.5 }); drawTurret(b, 'synth', 5, 10, 10, { t: 2, ang: 1, fire: 0.5 });
ok(a.__st.log.join() === b.__st.log.join(), 'deterministic');
const src = readFileSync(new URL('../drop_the_bass/js/doodle_turrets.js', import.meta.url), 'utf8');
ok(!/Math\.random|Date\.now|new Date/.test(src), 'no unseeded randomness or clock'); ok(!src.includes(String.fromCharCode(8212)), 'no em dash');
console.log('drop_the_bass doodle_turrets: ' + n + ' checks passed');
