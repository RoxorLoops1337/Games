// Baked colour grade (graftwork/art/grade.js): the battle grade of the procedural figures is arithmetic on the colours they paint with, never a canvas filter.
//  1. the colour maths against values computed here from the CSS Filter Effects definitions of sepia, saturate, contrast and brightness
//  2. colour strings, the switch and its cache, whole-layer grading
//  3. every enemy and every hero, in every state: each colour set while graded is the grade of the colour set ungraded (nothing bypasses it,
//     nothing is graded twice), and baked layers are painted ungraded and graded once as a whole
//  4. real Chromium (skipped when it is missing): a fill under ctx.filter = GRADE_CSS gives the colour gradeRGB computes
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fakeCtx } from './graftwork_lib.mjs';

let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };

// ---- a recording canvas world, installed before the art modules load: every context logs the colours it is given
const LOG = { main: [], off: [], get: 0, put: 0 };
function recCtx(kind) {
  const ctx = fakeCtx(), log = (v) => { LOG[kind].push(v); };
  for (const p of ['fillStyle', 'strokeStyle']) { let cur = '#000'; Object.defineProperty(ctx, p, { get: () => cur, set(v) { cur = v; log(v); } }); }
  const grad = () => ({ addColorStop(o, c) { log(c); } });
  ctx.createLinearGradient = ctx.createRadialGradient = grad;
  ctx.createPattern = () => ({ pattern: true });
  ctx.getImageData = () => { LOG.get++; return { data: new Uint8ClampedArray([200, 100, 50, 255, 0, 0, 0, 0]) }; };
  ctx.putImageData = (im) => { LOG.put++; LOG.lastPut = im; };
  let filter = 'none'; Object.defineProperty(ctx, 'filter', { get: () => filter, set(v) { filter = v; LOG.filters = (LOG.filters || 0) + 1; } });
  return ctx;
}
globalThis.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
globalThis.requestAnimationFrame = () => 0;
globalThis.document = { createElement: () => { let c = null; return { width: 0, height: 0, style: {}, getContext() { return c || (c = recCtx('off')); } }; } };
// a clock that always moves: the enemy bake throttle (14 ms) then never borrows a neighbour layer, so both passes bake the same things
let clock = 0; Object.defineProperty(globalThis, 'performance', { value: { now: () => (clock += 100) }, configurable: true, writable: true });
globalThis.__GW_ART_THROW = true; // a painter that throws fails the test instead of drawing the grey fallback

const GR = await import('../graftwork/art/grade.js');
const { drawEnemy } = await import('../graftwork/art/enemies.js');
const { drawHero, setHeroTint } = await import('../graftwork/art/heroes.js');
const ENEMY_LIST = Object.values((await import('../graftwork/data/index.js')).ENEMIES);

// ---- the four CSS filter functions, written out from the Filter Effects spec (channels 0..1, clamped after each function)
const AM = Object.fromEntries([...GR.GRADE_CSS.matchAll(/(\w+)\(([\d.]+)\)/g)].map((m) => [m[1], +m[2]]));
const cl01 = (v) => Math.min(1, Math.max(0, v));
const sepia = (a) => { const s = 1 - a; return [[0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s], [0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s], [0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s]]; };
const saturate = (s) => [[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]];
const mul = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
// clamp: the real filter (true) or the plain affine composition (false)
function cssGrade(rgb, clamp = true) {
  const c = clamp ? cl01 : (v) => v;
  let v = rgb.map((x) => x / 255);
  v = mul(sepia(AM.sepia), v).map(c);
  v = mul(saturate(AM.saturate), v).map(c);
  v = v.map((x) => c(x * AM.contrast + 0.5 - 0.5 * AM.contrast));
  v = v.map((x) => c(x * AM.brightness));
  return v.map((x) => x * 255);
}

await t('the grade is the four CSS filter functions the battle screen used to set', () => {
  assert.equal(GR.GRADE_CSS, 'sepia(0.2) saturate(0.82) contrast(1.06) brightness(0.96)');
  assert.deepEqual(AM, { sepia: 0.2, saturate: 0.82, contrast: 1.06, brightness: 0.96 });
});
await t('GRADE_MATRIX is the composition of the four functions (computed here from their definitions)', () => {
  const o = cssGrade([0, 0, 0], false), cols = [[255, 0, 0], [0, 255, 0], [0, 0, 255]].map((e) => cssGrade(e, false).map((x, i) => (x - o[i]) / 255));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(GR.GRADE_MATRIX[r * 4 + c] - cols[c][r]) < 1e-12, `row ${r} col ${c}: ${GR.GRADE_MATRIX[r * 4 + c]} vs ${cols[c][r]}`);
    assert.ok(Math.abs(GR.GRADE_MATRIX[r * 4 + 3] - o[r] / 255) < 1e-12, 'offset');
  }
  assert.equal(GR.GRADE_MATRIX.length, 12);
  // one known row, by hand: red out = 1.06 * 0.96 * (sat row r . sepia columns)
  assert.ok(Math.abs(GR.GRADE_MATRIX[3] - 0.96 * (0.5 - 0.53)) < 1e-12 && Math.abs(GR.GRADE_MATRIX[3] + 0.0288) < 1e-12, 'offset is brightness * (0.5 - 0.5 contrast)');
  // where nothing clips, the single matrix IS the filter chain
  let checked = 0;
  for (let r = 16; r < 240; r += 28) for (let g = 16; g < 240; g += 28) for (let b = 16; b < 240; b += 28) {
    const f = cssGrade([r, g, b], true), a = cssGrade([r, g, b], false);
    if (f.some((x, i) => Math.abs(x - a[i]) > 1e-9)) continue; // a stage clipped this one
    const M = GR.GRADE_MATRIX, m = [0, 1, 2].map((k) => (M[k * 4] * r + M[k * 4 + 1] * g + M[k * 4 + 2] * b) + M[k * 4 + 3] * 255);
    m.forEach((x, i) => assert.ok(Math.abs(x - f[i]) < 1e-9)); checked++;
  }
  assert.ok(checked > 300, 'most mid colours never clip: ' + checked);
});
await t('gradeRGB is the CSS filter within rounding: never above it, at most 2 levels under (Chromium truncates its 8 bit tables)', () => {
  let max = 0, sum = 0, cnt = 0;
  for (let r = 0; r <= 255; r += 15) for (let g = 0; g <= 255; g += 15) for (let b = 0; b <= 255; b += 15) {
    const got = GR.gradeRGB(r, g, b), want = cssGrade([r, g, b]);
    for (let k = 0; k < 3; k++) {
      const d = want[k] - got[k]; cnt++; sum += d; if (d > max) max = d;
      assert.ok(d > -0.5001 && d < 2.5, `rgb(${r},${g},${b}) channel ${k}: css ${want[k].toFixed(2)} graded ${got[k]}`);
      assert.ok(Number.isInteger(got[k]) && got[k] >= 0 && got[k] <= 255);
    }
  }
  assert.ok(sum / cnt > 0.4 && sum / cnt < 1.6, 'mean distance under the exact filter: ' + (sum / cnt).toFixed(3));
});
await t('gradeRGB gives the values Chromium gave for a fill under the filter (measured once, 16 colours)', () => {
  const MEASURED = [[[255, 255, 255], [244, 244, 244]], [[0, 0, 0], [0, 0, 0]], [[22, 17, 15], [14, 10, 8]], [[214, 58, 58], [176, 69, 65]], [[255, 233, 176], [244, 238, 189]], [[138, 154, 122], [144, 151, 124]], [[43, 24, 16], [32, 19, 12]], [[201, 162, 39], [192, 162, 73]],
    [[127, 207, 138], [150, 199, 146]], [[8, 4, 2], [0, 0, 0]], [[243, 236, 216], [244, 241, 217]], [[58, 34, 20], [47, 29, 18]], [[128, 128, 128], [130, 127, 122]], [[255, 0, 0], [191, 18, 14]], [[0, 255, 0], [58, 225, 48]], [[0, 0, 255], [4, 3, 171]]];
  for (const [c, want] of MEASURED) assert.deepEqual(GR.gradeRGB(...c), want, 'rgb(' + c + ')');
  assert.equal(GR.gradePacked(255, 0, 0), (191 << 16) | (18 << 8) | 14);
});
await t('gradeCss: hex and rgb()/rgba() strings are graded, alpha is kept, anything else passes through', () => {
  assert.equal(GR.gradeCss('#ffffff'), 'rgb(244,244,244)'); assert.equal(GR.gradeCss('#fff'), 'rgb(244,244,244)'); assert.equal(GR.gradeCss('#FFF'), 'rgb(244,244,244)');
  assert.equal(GR.gradeCss('rgb(214,58,58)'), 'rgb(176,69,65)'); assert.equal(GR.gradeCss('rgb(214, 58, 58)'), 'rgb(176,69,65)');
  assert.equal(GR.gradeCss('rgba(255,252,240,0.6)'), 'rgba(244,244,238,0.6)'); assert.equal(GR.gradeCss('rgba(214,58,58,0)'), 'rgba(176,69,65,0)'); assert.equal(GR.gradeCss('rgba(214,58,58,1e-7)'), 'rgba(176,69,65,1e-7)');
  assert.equal(GR.gradeCss('#d63a3a80'), 'rgba(176,69,65,0.502)'); assert.equal(GR.gradeCss('#f008'), 'rgba(191,18,14,0.533)');
  const pat = { pattern: true };
  for (const v of ['red', 'hsl(10,50%,50%)', '#12', '#12345', 'rgb(1,2)', '', null, undefined, pat, 7]) assert.equal(GR.gradeCss(v), v);
});
await t('gc is the identity while no grade is set, the grade while one is, and its cache stays bounded', () => {
  GR.setGrade(false); assert.equal(GR.gradeKey(), 0);
  const s = 'rgb(214,58,58)'; assert.equal(GR.gc(s), s); assert.equal(GR.gc(null), null);
  GR.setGrade(true); assert.equal(GR.gradeKey(), 1);
  assert.equal(GR.gc(s), 'rgb(176,69,65)'); assert.equal(GR.gc(s), 'rgb(176,69,65)'); assert.equal(GR.gc('#fff'), 'rgb(244,244,244)');
  const pat = { pattern: true }; assert.equal(GR.gc(pat), pat); assert.equal(GR.gc(undefined), undefined); assert.equal(GR.gc('gold'), 'gold');
  for (let i = 0; i < 20000; i++) assert.equal(GR.gc(`rgba(214,58,58,${i / 20000})`), `rgba(176,69,65,${i / 20000})`); // an alpha sweep: new strings without end
  GR.setGrade(false); assert.equal(GR.gc('#fff'), '#fff');
});
await t('gradePixels grades a finished layer in place and leaves transparent pixels alone', () => {
  const d = new Uint8ClampedArray([255, 255, 255, 255, 214, 58, 58, 128, 214, 58, 58, 3, 9, 9, 9, 0, 0, 0, 0, 255]);
  assert.equal(GR.gradePixels(d), d);
  assert.deepEqual([...d], [244, 244, 244, 255, 176, 69, 65, 128, 176, 69, 65, 3, 9, 9, 9, 0, 0, 0, 0, 255]);
  assert.deepEqual([...GR.gradePixels(new Uint8ClampedArray(0))], []);
});

// ---- 3. the painters
const reset = () => { LOG.main.length = 0; LOG.off.length = 0; LOG.get = 0; LOG.put = 0; LOG.filters = 0; };
const ST = { burn: 6, bleed: 2, stun: 1, vulnerable: 2, marked: 1, regen: 2, charge: 1, hidden: 1, poison: 4, stitchedup: 1, weightofdebt: 6, strength: 2 };
// every look an enemy has in a fight: idle, statuses, hit flash, wounds, the attack rig, the unstitching death, mirrored, and the no-canvas path
function enemyTake(def, graded, tBase) {
  const main = recCtx('main'), state = {};
  reset();
  const draw = (o) => { GR.setGrade(graded); try { drawEnemy(main, def, 600, 400, { scale: 1, state, ...o }); } finally { GR.setGrade(false); } };
  let tt = tBase;
  const step = (o) => { tt += 0.05; draw({ t: tt, ...o }); };
  step({}); step({});
  step({ st: ST }); step({ st: ST, hpFrac: 0.5 });
  step({ hurt: 0.8, hpFrac: 0.35 }); step({ hurt: 0.4, hpFrac: 0.3 }); for (let i = 0; i < 6; i++) step({ hpFrac: 0.12 });
  for (const phase of ['tell', 'act', 'rec']) for (const k of [0.2, 0.8]) step({ atk: { phase, k }, attack: 0.5 });
  step({ flip: true }); step({ scale: 0.7 });
  step({ dying: 0.3 }); step({ dying: 0.75 });
  globalThis.__GW_LEGACY = true; try { step({ st: ST }); step({ hurt: 0.5 }); } finally { globalThis.__GW_LEGACY = false; }
  return { main: LOG.main.slice(), off: LOG.off.slice(), get: LOG.get, put: LOG.put, filters: LOG.filters };
}
await t('every enemy: each colour painted while graded is the grade of the ungraded colour; layers are baked ungraded and graded once each', () => {
  assert.ok(ENEMY_LIST.length >= 60, 'all enemies: ' + ENEMY_LIST.length);
  let colours = 0, changed = 0, layers = 0;
  ENEMY_LIST.forEach((def, i) => {
    const tBase = 3 + i * 0.37, plain = enemyTake(def, false, tBase), graded = enemyTake(def, true, tBase);
    assert.ok(plain.main.length > 40, def.id + ' paints: ' + plain.main.length);
    assert.equal(graded.main.length, plain.main.length, def.id + ': same number of colours');
    for (let k = 0; k < plain.main.length; k++) {
      if (typeof plain.main[k] !== 'string') { assert.equal(typeof graded.main[k], typeof plain.main[k]); continue; }
      const want = GR.gradeCss(plain.main[k]);
      if (graded.main[k] !== want) assert.fail(`${def.id}: colour ${k} is ${String(graded.main[k])}, the grade of ${String(plain.main[k])} is ${String(want)}`);
      colours++; if (want !== plain.main[k]) changed++;
    }
    // offscreen contexts (the silhouette mask, the hatch tile, the baked layers, the floor shadow sprite): painted exactly as when ungraded ...
    const plainOff = new Set(plain.off);
    for (const c of graded.off) if (typeof c === 'string') assert.ok(plainOff.has(c), `${def.id}: a bake painted ${String(c)}, which the ungraded bake never does`);
    // ... and the finished layers are graded as a whole: one read and one write per new layer, none when ungraded
    assert.equal(plain.put, 0, def.id + ': an ungraded bake never touches pixels'); assert.equal(plain.get, 0);
    assert.ok(graded.put >= 2, def.id + ': back and front layers graded: ' + graded.put); assert.equal(graded.get, graded.put);
    assert.deepEqual([...LOG.lastPut.data], [...GR.gradeRGB(200, 100, 50), 255, 0, 0, 0, 0], 'the pixels written back are graded');
    layers += graded.put;
    assert.equal(plain.filters + graded.filters, 0, def.id + ': no canvas filter');
  });
  assert.ok(changed / colours > 0.97, `almost every colour moves under the grade (black stays black): ${changed}/${colours}`);
  console.log(`   ${ENEMY_LIST.length} enemies, ${colours} colours compared, ${layers} layers graded`);
});
function heroTake(id, graded) {
  const main = recCtx('main'); reset();
  const draw = (o) => { GR.setGrade(graded); try { drawHero(main, id, 300, 500, { scale: 1.2, ...o }); } finally { GR.setGrade(false); } };
  let tt = 7;
  for (const o of [{}, { hurt: 0.7 }, { attack: 0.8 }, { attack: -0.6 }, { dying: 0.4 }, { dying: 0.95 }, { lowHp: 0.8 }, { state: 'cast', p: 0.5 }, { state: 'victory', p: 0.5 }, { state: 'attack', p: 0.5 }, { flip: true }]) { tt += 0.05; draw({ t: tt, ...o }); }
  setHeroTint('#3a6ea5'); tt += 0.05; draw({ t: tt, hurt: 0.3 }); setHeroTint(null);
  return { main: LOG.main.slice(), off: LOG.off.slice(), put: LOG.put, filters: LOG.filters };
}
await t('every hero (the fallback figure): main canvas and scratch layers are painted with graded colours, the outfit tint included', () => {
  for (const id of ['marrow', 'wick', 'odile']) {
    heroTake(id, false); heroTake(id, true); // first takes make the scratch canvases and one hatch sheet per grade
    const plain = heroTake(id, false), graded = heroTake(id, true);
    for (const k of ['main', 'off']) {
      assert.ok(plain[k].length > 30, `${id} ${k}: ${plain[k].length}`); assert.equal(graded[k].length, plain[k].length, `${id} ${k}`);
      plain[k].forEach((c, i) => {
        if (typeof c !== 'string') { assert.equal(typeof graded[k][i], typeof c, 'a gradient stays a gradient'); return; }
        const want = GR.gradeCss(c); if (graded[k][i] !== want) assert.fail(`${id} ${k}: colour ${i} is ${String(graded[k][i])}, the grade of ${String(c)} is ${String(want)}`);
      });
    }
    assert.ok(graded.off.includes(GR.gradeCss('#3a6ea5')), 'the tint wash is graded too');
    assert.equal(plain.filters + graded.filters, 0, 'no canvas filter');
  }
});
await t('the switch is off again after every figure (nothing outside the battle figures is graded)', () => { assert.equal(GR.gradeKey(), 0); });

// ---- 4. real Chromium: the filter and the arithmetic agree
let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch (e) { console.log('grade: playwright not available, skipping the browser check'); }
if (chromium) {
  let browser = null;
  // Playwright's own limits are 30 s, tuned to an idle machine; a busy one needs longer. A browser that never starts or a page that never loads still fails, later.
  try { browser = await chromium.launch({ timeout: 120000 }); } catch (e) { console.log('grade: chromium unavailable (' + String(e.message).split('\n')[0] + '), skipping the browser check'); }
  if (browser) {
    await t('Chromium: a fill under ctx.filter = GRADE_CSS has the colour gradeRGB computes (within 2 levels, in practice exactly)', async () => {
      const page = await browser.newPage();
      await page.setContent('<canvas id="c" width="256" height="8"></canvas>', { timeout: 120000 });
      const cols = []; let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s >> 8) & 255; };
      for (let i = 0; i < 240; i++) cols.push([rnd(), rnd(), rnd()]);
      cols.push([255, 255, 255], [0, 0, 0], [255, 233, 176], [22, 17, 15]);
      const got = await page.evaluate(([css, cols]) => {
        const x = document.getElementById('c').getContext('2d'); if (!('filter' in x)) return null;
        x.filter = css; cols.forEach((c, i) => { x.fillStyle = `rgb(${c})`; x.fillRect(i, 0, 1, 8); }); x.filter = 'none';
        const d = x.getImageData(0, 4, cols.length, 1).data; return cols.map((c, i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
      }, [GR.GRADE_CSS, cols]);
      await page.close();
      if (!got) { console.log('   this browser has no canvas filter: nothing to compare'); return; }
      let exact = 0, max = 0;
      cols.forEach((c, i) => { const g = GR.gradeRGB(...c); let m = 0; for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(g[k] - got[i][k])); if (!m) exact++; max = Math.max(max, m); assert.ok(m <= 2, `rgb(${c}): filter ${got[i]} arithmetic ${g}`); });
      console.log(`   ${exact}/${cols.length} colours identical, max difference ${max}`);
    });
    await browser.close();
  }
}
console.log(`graftwork grade: ${n} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
