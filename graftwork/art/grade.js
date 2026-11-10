// GRAFTWORK colour grade for the procedural battle figures, baked into the colours they are painted with (design/PERF.md "Baked grade").
// The battle screen used to wrap drawEnemy / drawHero in ctx.filter = GRADE_CSS. A canvas filter runs once per DRAW CALL and a figure is hundreds
// of calls, so one Act 2 fight cost about fifty times an ungraded one. The filter is gone: while a grade is set (setGrade), every fillStyle,
// strokeStyle and gradient stop of art/enemies.js and art/heroes.js goes through gc(), and their cached layers are keyed by gradeKey().
// Why that is the same picture: the four filter functions are a colour matrix on unpremultiplied sRGB with alpha untouched, applied to each
// draw call on its own, so grading the call's colour is what the filter did to it. gradeRGB follows Chromium's arithmetic (sepia and saturate in
// float, then contrast and brightness as 8 bit tables that truncate), so an opaque fill gets the very value the filter gave; the exact CSS
// definition sits at most 2 levels above it. Pure module: no canvas, safe in node.

const SEPIA = 0.2, SATURATE = 0.82, CONTRAST = 1.06, BRIGHTNESS = 0.96;
// the filter this module replaces. Documentation and tests only: it is never set on a context.
export const GRADE_CSS = `sepia(${SEPIA}) saturate(${SATURATE}) contrast(${CONTRAST}) brightness(${BRIGHTNESS})`;

// CSS Filter Effects 1: sepia(a) and saturate(s) as 3 x 3 matrices (row major)
const sepiaM = (a) => { const s = 1 - a; return [0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s]; };
const saturateM = (s) => [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
const A = sepiaM(SEPIA), B = saturateM(SATURATE);
// contrast(c): v * c + (0.5 - 0.5 c); brightness(b): v * b. Chromium builds one 256 entry table per function and truncates each entry.
const c8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) TABLE[i] = Math.floor(c8(BRIGHTNESS * Math.floor(c8(CONTRAST * i + 255 * (0.5 - 0.5 * CONTRAST)))));

// The four functions as ONE affine colour matrix on 0..1 channels: rows r g b, columns r g b offset. Exact wherever no stage clips
// (sepia pushes near-white reds and greens past 1, contrast pushes near-black below 0), and before the 8 bit rounding.
export const GRADE_MATRIX = (() => {
  const k = CONTRAST * BRIGHTNESS, off = BRIGHTNESS * (0.5 - 0.5 * CONTRAST), M = [];
  for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) M.push(k * (B[r * 3] * A[c] + B[r * 3 + 1] * A[3 + c] + B[r * 3 + 2] * A[6 + c])); M.push(off); }
  return M;
})();

// graded colour of an 8 bit sRGB colour, packed 0xRRGGBB
export function gradePacked(r, g, b) {
  const r1 = c8(A[0] * r + A[1] * g + A[2] * b), g1 = c8(A[3] * r + A[4] * g + A[5] * b), b1 = c8(A[6] * r + A[7] * g + A[8] * b);
  const r2 = c8(B[0] * r1 + B[1] * g1 + B[2] * b1), g2 = c8(B[3] * r1 + B[4] * g1 + B[5] * b1), b2 = c8(B[6] * r1 + B[7] * g1 + B[8] * b1);
  return (TABLE[Math.round(r2)] << 16) | (TABLE[Math.round(g2)] << 8) | TABLE[Math.round(b2)];
}
export function gradeRGB(r, g, b) { const p = gradePacked(r, g, b); return [(p >> 16) & 255, (p >> 8) & 255, p & 255]; }

// A finished layer (ImageData.data: unpremultiplied RGBA) graded in place, the way the filter graded a layer when it was drawn. Transparent pixels are skipped.
export function gradePixels(d) {
  let last = -1, out = 0;
  for (let i = 0, n = d.length - 3; i < n; i += 4) {
    if (d[i + 3] === 0) continue;
    const p = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    if (p !== last) { last = p; out = gradePacked(d[i], d[i + 1], d[i + 2]); }
    d[i] = out >> 16; d[i + 1] = (out >> 8) & 255; d[i + 2] = out & 255;
  }
  return d;
}

// ---- CSS colour strings. The painters use #rgb, #rrggbb and rgb()/rgba() with plain numbers; anything else (a named colour, a gradient,
// a pattern, null) passes through untouched.
const RGB_RE = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.eE+-]+)\s*)?\)$/;
const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const h2 = (s, i) => parseInt(s.slice(i, i + 2), 16), h1 = (s, i) => parseInt(s[i], 16) * 17;
export function gradeCss(s) {
  if (typeof s !== 'string') return s;
  let r, g, b, a = null;
  if (s[0] === '#') {
    if (!HEX_RE.test(s)) return s;
    if (s.length < 6) { r = h1(s, 1); g = h1(s, 2); b = h1(s, 3); if (s.length === 5) a = h1(s, 4); }
    else { r = h2(s, 1); g = h2(s, 3); b = h2(s, 5); if (s.length === 9) a = h2(s, 7); }
    if (a !== null) a = String(Math.round(a / 255 * 1000) / 1000);
  } else {
    const m = RGB_RE.exec(s);
    if (!m) return s;
    r = Math.round(c8(+m[1])); g = Math.round(c8(+m[2])); b = Math.round(c8(+m[3])); if (m[4] !== undefined) a = m[4];
  }
  const p = gradePacked(r, g, b);
  return a === null ? `rgb(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255})` : `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${a})`;
}

// ---- the switch and its cache. One grade exists (the battle grade): the key is 0 (none) or 1.
let ON = 0;
const CACHE = new Map(); // colour string -> graded colour string
export function setGrade(on) { ON = on ? 1 : 0; }
export function gradeKey() { return ON; }
// gc(colour): the colour to hand to the canvas. Identity while no grade is set.
export function gc(s) {
  if (ON === 0) return s;
  let v = CACHE.get(s);
  if (v === undefined) {
    if (typeof s !== 'string') return s;
    if (CACHE.size > 6000) CACHE.clear(); // bounded: alpha sweeps make new strings without end
    v = gradeCss(s); CACHE.set(s, v);
  }
  return v;
}
