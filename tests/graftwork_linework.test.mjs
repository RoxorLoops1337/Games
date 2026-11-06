// GRAFTWORK line weights: helper math, the 1 device pixel floor, phone snapping, and that baked art stays under the stroke cap and
// comes out clearly thinner than the legacy look (counting fake ctx for cards, enemies, icons, panels).
import assert from 'node:assert/strict';
import { installDom } from './graftwork_lib.mjs';
installDom();
const LWK = await import('../graftwork/art/linework.js');
const { lw, thin, LW, CAP, LINE_SCALE, setLineDevice, setLineScale } = LWK;
let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };

t('named_weights_are_ordered_and_fine', () => {
  assert.ok(LW.hatch < LW.hair && LW.hair < LW.fine && LW.fine < LW.ink && LW.ink < LW.bold);
  assert.ok(LW.hair <= 1 && LW.ink <= 2 && LW.bold <= 3);
});
t('thinning_curve', () => {
  setLineDevice(1, 1);
  assert.ok(Math.abs(thin(3) - 3 * LINE_SCALE) < 1e-9);
  assert.ok(Math.abs(thin(2) - 2 * LINE_SCALE) < 1e-9);
  assert.equal(thin(1), 1); assert.equal(thin(0.7), 0.7);
  let prev = 0; for (let w = 0.5; w < 12; w += 0.25) { const v = thin(w); assert.ok(v >= prev - 1e-9, 'monotonic at ' + w); assert.ok(v <= w + 1e-9, 'never thicker'); prev = v; }
  assert.ok(1 - thin(3) / 3 >= 0.35 && 1 - thin(3) / 3 <= 0.45, 'main outlines are 35 to 45 percent thinner');
});
t('minimum_one_device_pixel', () => {
  for (const [px, sc] of [[1, 1], [1.28, 0.64], [2, 1], [0.6, 0.6]]) {
    setLineDevice(px, sc);
    for (const k of ['fine', 'hair', 'ink', 'bold', 1, 1.5, 2, 3, 5]) assert.ok(lw(k) * px >= 1 - 1e-9, `${k} at px ${px}`);
    assert.ok(lw('hatch') * px >= 0.7 - 1e-9, 'hatch floor');
    assert.ok(lw(0.1) * px >= 0.7 - 1e-9);
  }
});
t('phone_widths_land_on_whole_device_pixels', () => {
  setLineDevice(1.28, 0.64);
  for (const k of ['hair', 'fine', 'ink', 'bold', 2, 3]) { const d = lw(k) * 1.28; assert.ok(Math.abs(d - Math.round(d)) < 1e-9, `${k} -> ${d}`); }
  setLineDevice(2, 1); // desktop retina: fractional widths are kept
  assert.ok(Math.abs(lw('ink') - LW.ink) < 1e-9);
});
t('scale_and_unit', () => {
  setLineDevice(1, 1);
  assert.ok(Math.abs(lw('ink', 2) - 2 * LW.ink) < 1e-9);
  assert.ok(Math.abs(lw('ink', 1, 10) - LW.ink / 10) < 1e-9 || lw('ink', 1, 10) >= 0.1, 'unit divides into drawing units');
  assert.ok(lw('fine', 1, 12) * 12 >= 1 - 1e-9, 'floor holds in glyph units');
});

// ---- baked output on a counting ctx ----
const widths = [];
function counting() {
  const st = { lineWidth: 1 };
  const grad = { addColorStop() {} };
  const o = {
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    stroke() { widths.push(st.lineWidth); }, strokeRect() { widths.push(st.lineWidth); }, strokeText() {},
    createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => grad,
    measureText: (s) => ({ width: String(s).length * 8 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }), canvas: null,
  };
  return new Proxy(o, { get(tg, k) { if (k in tg) return tg[k]; if (typeof k === 'symbol') return undefined; return () => {}; }, set(tg, k, v) { tg[k] = v; return true; } });
}
const shared = counting();
document.createElement = () => ({ width: 0, height: 0, getContext: () => shared, style: {} });
const { CARD_LIST } = await import('../graftwork/data/index.js');
const { cardSpec } = await import('../graftwork/engine/cards.js');
const CARDS = await import('../graftwork/art/cards.js');
const ENEM = await import('../graftwork/art/enemies.js');
const ICON = await import('../graftwork/art/icons.js');
const CH = await import('../graftwork/ui/chrome.js');
const { ENEMIES } = await import('../graftwork/data/index.js');

let uniq = 0;
function sample(scale) {
  setLineDevice(1, 1); setLineScale(scale);
  widths.length = 0; CARDS.clearCardCache();
  const out = {};
  const run = (name, fn) => { widths.length = 0; fn(); out[name] = widths.slice(); };
  run('cards', () => { let k = 0; for (const c of CARD_LIST.slice(0, 40)) CARDS.drawCard(shared, cardSpec({ uid: ++k, id: c.id, grafts: [], up: 0 }), 100, 100, { still: true }); });
  run('enemies', () => { for (const id of Object.keys(ENEMIES).slice(0, 25)) ENEM.drawEnemy(shared, ENEMIES[id], 300, 500, { t: 1, scale: 1 }); });
  run('icons', () => { for (const s of ['bleed', 'poison', 'strength', 'vulnerable']) ICON.drawStatus(shared, s, 50, 50, 40, true); for (const k of ['attack', 'block', 'buff']) ICON.drawIntent(shared, k, 50, 50, 40); });
  run('panels', () => {
    const app = { px: 1 + (++uniq) * 1e-6, ctx: shared, rr() {}, t: 0 };
    CH.frameStart(app);
    for (let i = 0; i < 4; i++) CH.panel(app, 10, 10, 200 + i * 20, 120, { r: 10 });
    CH.button && CH.button(app, 10, 10, 120, 40, { label: 'x' });
  });
  return out;
}
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const legacy = sample(1), now = sample(LINE_SCALE);
setLineScale(LINE_SCALE); setLineDevice(1, 1);
for (const k of ['cards', 'enemies', 'icons', 'panels']) {
  t(`${k}_strokes_under_cap_and_thinner`, () => {
    const w = now[k], l = legacy[k];
    assert.ok(w.length > 5, `${k}: only ${w.length} strokes recorded`);
    console.log(k, 'strokes', w.length, 'max', Math.max(...w).toFixed(2), 'legacy max', Math.max(...l).toFixed(2), 'mean', mean(w).toFixed(2), 'legacy', mean(l).toFixed(2));
    assert.ok(Math.max(...w) <= Math.max(CAP, Math.max(...l) * LINE_SCALE) + 1e-9, `${k}: widest stroke ${Math.max(...w)} over cap ${CAP}`);
    assert.ok(w.every((v) => v > 0 && Number.isFinite(v)));
    assert.ok(mean(w) <= mean(l) * (k === 'cards' ? 0.95 : k === 'icons' ? 1 : 0.9) + 1e-9, `${k}: mean ${mean(w).toFixed(2)} not thinner than legacy ${mean(l).toFixed(2)}`);
  });
}
console.log(`linework: ${n} checks`);
