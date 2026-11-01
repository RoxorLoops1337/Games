// Drop the Bass: the doodle environment (backdrops, board, stage base), headless with a mock 2D context.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawBackdrop, drawBoard, drawStageBase, setArtScale, makeCanvas } from '../drop_the_bass/js/doodle_env.js';
import * as W from '../drop_the_bass/js/art_world.js';
import { setStyle } from '../drop_the_bass/js/style.js';
import { WORLDS, MAPS } from '../drop_the_bass/js/data_core.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
function mockCtx() {
  const st = { saves: 0, restores: 0, calls: 0, bad: 0 };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === '__st') return st;
      if (k === 'save') return () => { st.saves++; };
      if (k === 'restore') return () => { st.restores++; };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k in t) return t[k];
      return (...a) => { st.calls++; for (const v of a) if (typeof v === 'number' && !isFinite(v)) st.bad++; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}
ok(makeCanvas(10, 10) === null, 'no canvas in node');
const ids = ['title', 'hub', 'garage', 'busk', 'club', 'festival', 'arena'];
const sizes = [[540, 960], [390, 844], [1280, 720], [2560, 1440]];
for (const sc of [1, 2, 3]) {
  setArtScale(sc);
  for (const id of ids) for (const [w, h] of sizes) for (const o of [{}, { beat: 1, staticAmt: 1 }, { beat: 0.3, staticAmt: 0.4 }]) {
    const c = mockCtx(); drawBackdrop(c, id, w, h, 1.7, o);
    ok(c.__st.saves === c.__st.restores, 'backdrop balanced ' + id); ok(c.__st.calls > 5 && c.__st.bad === 0, 'backdrop draws ' + id);
  }
  ok(drawBackdrop(mockCtx(), 'nope', 540, 960, 0) === undefined, 'unknown id falls back');
}
for (const w of WORLDS) for (const t of [0, 0.9, 7.3]) for (const o of [undefined, {}, { beat: 1, slotHint: [[0, 0], [3, 3]], hoverSlot: [2, 2], dropSlot: [4, 5] }]) {
  const c = mockCtx(); drawBoard(c, w.map, w.id, t, o);
  ok(c.__st.saves === c.__st.restores && c.__st.calls > 50 && c.__st.bad === 0, 'board ' + w.id);
}
for (const id of Object.keys(MAPS)) { const c = mockCtx(); drawBoard(c, id, 'garage', 1, {}); ok(c.__st.saves === c.__st.restores, 'every map draws ' + id); }
for (const w of WORLDS) for (const [hp, hit] of [[1, 0], [0.7, 0], [0.55, 0.5], [0.4, 1], [0.2, 0], [0, 1]]) {
  const c = mockCtx(); drawStageBase(c, w.id, 450, 760, { t: 2.2, hp, hit, beat: 0.5 }); ok(c.__st.saves === c.__st.restores && c.__st.bad === 0 && c.__st.calls > 20, 'stage ' + w.id + ' ' + hp);
}
drawStageBase(mockCtx(), 'garage', 0, 0); drawStageBase(mockCtx(), 'zzz', 0, 0, {}); n += 2;
// determinism: the same inputs make the same number of calls
for (const id of ids) { const a = mockCtx(), b = mockCtx(); drawBackdrop(a, id, 540, 960, 3.3, { beat: 0.5, staticAmt: 0.5 }); drawBackdrop(b, id, 540, 960, 3.3, { beat: 0.5, staticAmt: 0.5 }); ok(a.__st.calls === b.__st.calls, 'deterministic ' + id); }
// the facade routes to this module in the doodle style and (a classic request is ignored)
setStyle('doodle'); { const c = mockCtx(); W.drawBackdrop(c, 'club', 540, 960, 1, {}); ok(c.__st.calls > 5, 'facade doodle'); }
setStyle('classic'); { const c = mockCtx(); W.drawBackdrop(c, 'club', 540, 960, 1, {}); ok(c.__st.calls > 5, 'a stored classic style is ignored (always doodle)'); }
setStyle('doodle');
// house rules
const src = readFileSync(new URL('../drop_the_bass/js/doodle_env.js', import.meta.url), 'utf8');
ok(!/Math\.random|Date\.now|performance\.now/.test(src), 'no randomness or clock in draw code'); ok(!src.includes(String.fromCharCode(8212)), 'no em dash');
console.log('drop_the_bass doodle_env: ' + n + ' checks passed');
