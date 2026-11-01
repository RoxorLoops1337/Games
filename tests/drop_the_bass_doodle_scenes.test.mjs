// Drop the Bass: the doodle cutscene and title art, headless. Every scene and the title draw on a mock ctx without throwing, balanced, deterministic, no unseeded randomness.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENE_IDS, drawScene, drawTitle, setArtScale } from '../drop_the_bass/js/doodle_scenes.js';

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
const chk = (c, m) => { ok(c.__st.saves === c.__st.restores, m + ' balanced'); ok(c.__st.nan === 0, m + ' no NaN'); ok(c.__st.calls > 5, m + ' draws'); };
ok(SCENE_IDS.length === 19, '19 scene ids');
for (const id of SCENE_IDS) for (const [t, p] of [[0.4, 0], [3.1, 0.5], [7, 1]]) { const c = mock(); drawScene(c, id, 540, 960, t, { progress: p }); chk(c, id + p); }
for (const [w, h] of [[540, 960], [390, 844], [1280, 720]]) { const c = mock(); drawScene(c, 'garage_day', w, h, 1, { progress: 0.5 }); chk(c, 'size ' + w); }
for (const beat of [0, 0.5, 1]) { const c = mock(); drawTitle(c, 540, 960, 2.2, { beat }); chk(c, 'title ' + beat); }
drawScene(mock(), 'nope', 540, 960, 0); drawScene(mock(), 'build', 540, 960, 1); drawTitle(mock(), 540, 960, 0); n += 3;
for (const id of ['victory_stage', 'boss_playback']) {
  const a = mock(), b = mock(); drawScene(a, id, 540, 960, 2, { progress: 0.6 }); drawScene(b, id, 540, 960, 2, { progress: 0.6 });
  ok(a.__st.log.join() === b.__st.log.join(), id + ' deterministic');
}
const src = readFileSync(new URL('../drop_the_bass/js/doodle_scenes.js', import.meta.url), 'utf8');
ok(!/Math\.random|Date\.now|new Date/.test(src), 'no unseeded randomness or clock'); ok(!src.includes(String.fromCharCode(8212)), 'no em dash');
console.log('drop_the_bass doodle_scenes: ' + n + ' checks passed');
