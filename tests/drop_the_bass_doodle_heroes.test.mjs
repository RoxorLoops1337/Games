// Drop the Bass: the doodle hero art, headless. Heroes, busts, Loopy and the logo draw on a mock ctx without throwing, keeps save/restore balanced,
// stays deterministic, and never touches Math.random or Date.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawHero, drawBust, drawLoopy, drawLogo, setArtScale } from '../drop_the_bass/js/doodle_heroes.js';

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
const poses = ['idle', 'cheer', 'sing', 'beat', 'sad', 'shock', 'talk', 'point', 'hype'];
const chk = (c, m) => { ok(c.__st.saves === c.__st.restores, m + ' balanced'); ok(c.__st.nan === 0, m + ' no NaN'); ok(c.__st.calls > 5, m + ' draws'); };
for (const who of ['roxor', 'jasmin']) for (const outfit of ['default', 'onesie']) for (const pose of poses) for (const extra of [{}, { flip: true, talk: 1 }]) {
  const o = Object.assign({ t: 1.3, outfit, pose }, extra);
  let c = mock(); drawHero(c, who, 200, 300, 118, o); chk(c, who + pose);
  c = mock(); drawBust(c, who, 200, 300, 100, o); chk(c, 'bust ' + who + pose);
}
for (const mood of ['happy', 'excited', 'worried', 'sleepy']) for (const talk of [0, 1]) { const c = mock(); drawLoopy(c, 50, 50, 80, { t: 2, mood, talk }); chk(c, 'loopy ' + mood); }
for (const w of [200, 360, 480, 700]) { const c = mock(); drawLogo(c, 270, 200, w, 1.7); chk(c, 'logo ' + w); }
drawHero(mock(), 'nope', 0, 0, 50); drawBust(mock(), 'nope', 0, 0, 50, null); drawLoopy(mock(), 0, 0, 40); n += 3;
const a = mock(), b = mock(); drawHero(a, 'jasmin', 10, 10, 118, { t: 2, pose: 'sing' }); drawHero(b, 'jasmin', 10, 10, 118, { t: 2, pose: 'sing' });
ok(a.__st.log.join() === b.__st.log.join(), 'deterministic');
const src = readFileSync(new URL('../drop_the_bass/js/doodle_heroes.js', import.meta.url), 'utf8');
ok(!/Math\.random|Date\.now|new Date/.test(src), 'no unseeded randomness or clock'); ok(!src.includes(String.fromCharCode(8212)), 'no em dash');
console.log('drop_the_bass doodle_heroes: ' + n + ' checks passed');
