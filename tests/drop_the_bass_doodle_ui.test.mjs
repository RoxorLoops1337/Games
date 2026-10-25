// Drop the Bass: the doodle UI art (glyphs, gear, crates, rarity frames), headless on a mock ctx.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawGlyph, drawIcon, drawGear, drawCrate, drawRarityFrame, GLYPH_NAMES, setArtScale } from '../drop_the_bass/js/doodle_ui.js';

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
const chk = (c, m) => { ok(c.__st.saves === c.__st.restores, m + ' balanced'); ok(c.__st.nan === 0, m + ' no NaN'); ok(c.__st.calls > 0, m + ' draws'); };
ok(GLYPH_NAMES.length >= 50, 'glyph names');
ok(drawIcon === drawGlyph, 'icon alias');
for (const g of GLYPH_NAMES) { let c = mock(); drawGlyph(c, g, 50, 50, 32); chk(c, g); c = mock(); drawGlyph(c, g, 50, 50, 32, '#ff0000'); chk(c, g + ' col'); }
for (const s of ['head', 'mic', 'body', 'chain', 'feet']) for (const r of ['common', 'rare', 'epic', 'legendary', 'mythic']) { const c = mock(); drawGear(c, s, 'gear_' + s + '_1', r, 60, 60, 56); chk(c, s + r); }
for (const tier of ['garage', 'studio', 'platinum']) for (const o of [{}, { t: 1, shake: 1 }, { t: 2, open: 0.5 }, { t: 3, open: 1 }]) { const c = mock(); drawCrate(c, tier, 100, 100, 90, o); chk(c, tier); }
for (const r of ['common', 'rare', 'epic', 'legendary', 'mythic']) { const c = mock(); drawRarityFrame(c, r, 80, 80, 100, 130, 1.4); chk(c, 'frame ' + r); }
drawGlyph(mock(), 'nope', 0, 0, 10); drawGear(mock(), 'x', 'y', 'z', 0, 0, 10); drawCrate(mock(), 'x', 0, 0, 10); n += 3;
const a = mock(), b = mock(); drawGear(a, 'mic', 'abc', 'epic', 10, 10, 50); drawGear(b, 'mic', 'abc', 'epic', 10, 10, 50);
ok(a.__st.log.join() === b.__st.log.join(), 'deterministic');
const src = readFileSync(new URL('../drop_the_bass/js/doodle_ui.js', import.meta.url), 'utf8');
ok(!/Math\.random|Date\.now|new Date/.test(src), 'no unseeded randomness or clock'); ok(!src.includes(String.fromCharCode(8212)), 'no em dash');
console.log('drop_the_bass doodle_ui: ' + n + ' checks passed');
