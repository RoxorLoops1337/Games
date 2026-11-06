// GRAFTWORK line weights: ONE shared stroke system (design/ART_BIBLE.md "Line weights").
// Engraved-plate ideal: fine ink contours, hairline rules, faint hatching. Every stroke width in art/*.js and the UI chrome goes through lw().
//
//   lw('ink')          a named weight (LW below)
//   lw(3)              a LEGACY design width in logical px (what the code used to draw): thinned by LINE_SCALE, see thin()
//   lw(k, scale, unit) scale multiplies the result; unit = logical px per drawing unit (glyph space, scaled contexts): result is in drawing units
//
// Floors: a line never drops under 1 device pixel (0.7 for deliberate hatch widths, which are also drawn at low alpha), using the
// device density that ui/core.js reports through setLineDevice(). On small screens (app.scale < SNAP_BELOW) widths snap to whole device pixels
// (rounded, never under 1) so a hairline lands crisp on a phone instead of smearing across two pixel rows.
// Pure arithmetic: no allocation, safe to call from per-frame draw code.
export const LINE_SCALE = 0.6; // main outlines come out ~40 percent thinner (3 -> 1.8, 2 -> 1.2)
export const LW = { hatch: 0.7, hair: 1, fine: 1.2, ink: 1.8, bold: 2.6 }; // hatch / hairline rules / inner detail / main contour / heavy contour
export const CAP = 8; // widest stroke a baked outline may use (ropes, chains and arches are bodies, not outlines)
export const SNAP_BELOW = 0.8;

const dev = { px: 1, scale: 1, line: LINE_SCALE };
export function setLineDevice(px, scale) { dev.px = px > 0 ? px : 1; dev.scale = scale > 0 ? scale : 1; }
export function setLineScale(s) { dev.line = s > 0 ? s : LINE_SCALE; } // tests only (1 = the legacy look)
export function lineDevice() { return dev; }

// legacy width -> new width. <= 1 stays (hatch and hairlines are already fine), 1..2 eases down to 2 -> 1.2, >= 2 is scaled.
export function thin(w) {
  const s = dev.line;
  if (w <= 1) return w;
  if (w >= 2) return w * s;
  return 1 + (w - 1) * (2 * s - 1);
}

export function lw(k, scale = 1, unit = 1) {
  let w = typeof k === 'string' ? (LW[k] || LW.ink) * (dev.line / LINE_SCALE) : thin(k);
  w *= scale;
  const px = dev.px, lo = (w <= 0.8 ? 0.7 : 1) / px; // floor in logical px
  if (w < lo) w = lo;
  if (dev.scale < SNAP_BELOW) { const d = Math.round(w * px); w = (d < 1 ? 1 : d) / px; }
  return w / unit;
}
export const lnw = lw; // import alias: files with a local variable called lw use this name
