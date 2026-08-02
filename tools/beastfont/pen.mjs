/* ============================================================================
   pen.mjs — the drawing kit both typefaces are cut with.

   Everything is a polygon in a y-up em with the baseline at 0. A letter is a
   pile of OVERLAPPING positive shapes plus, where it genuinely encloses white,
   an explicit counter: the non-zero fill rule unions the first and punches the
   second, so no boolean geometry is ever needed to author a glyph.

   The one idea worth knowing: `arc()` is a SUPERELLIPSE, not a circle. Its
   exponent squares the curve off toward the extremes, and that single number
   is most of the distance between the two faces — 0.64 gives Beastcut its
   chiselled, flat-sided bowls, 0.80 gives Beakwork a bowl that is round enough
   to read at 11px but still sits square next to the display face.
   ========================================================================== */
const D2R = Math.PI / 180;

export const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/* A superelliptic arc, a0→a1 in degrees, y-up. */
export function arc(cx, cy, rx, ry, a0, a1, n, e) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * D2R, c = Math.cos(a), s = Math.sin(a);
    p.push([cx + rx * Math.sign(c) * Math.pow(Math.abs(c), e),
            cy + ry * Math.sign(s) * Math.pow(Math.abs(s), e)]);
  }
  return p;
}

/* The closed band between two superelliptic arcs: one positive contour, so a
   C or a D needs no counter at all. */
export function band(cx, cy, rox, roy, rix, riy, a0, a1, n, e) {
  return [...arc(cx, cy, rox, roy, a0, a1, n, e), ...arc(cx, cy, rix, riy, a1, a0, n, e)];
}

/* A full ring: outer contour + counter. */
export function ring(cx, cy, rox, roy, rix, riy, n, e) {
  return { pos: arc(cx, cy, rox, roy, 0, 360, n * 4, e), cut: arc(cx, cy, rix, riy, 0, 360, n * 4, e) };
}

/* A vertical stem. `ch` knocks the corners off — the cut that gives Beastcut
   its hewn-plate look. Corners are named from the reader's side. */
export function stem(x0, x1, y0, y1, ch, which) {
  if (!ch) return rect(x0, y0, x1, y1);
  const w = which || 'tl br';
  const tl = w.includes('tl'), tr = w.includes('tr'), bl = w.includes('bl'), br = w.includes('br');
  const c = Math.min(ch, (x1 - x0) * 0.85, (y1 - y0) * 0.5);
  const p = [];
  bl ? p.push([x0 + c, y0], [x0, y0 + c]) : p.push([x0, y0]);
  tl ? p.push([x0, y1 - c], [x0 + c, y1]) : p.push([x0, y1]);
  tr ? p.push([x1 - c, y1], [x1, y1 - c]) : p.push([x1, y1]);
  br ? p.push([x1, y0 + c], [x1 - c, y0]) : p.push([x1, y0]);
  return p;
}

/* A diagonal stroke whose ends are cut FLAT (horizontal) — the shape you
   want wherever a stroke lands on the cap line or the baseline.
   `t` is the perpendicular thickness you want; the horizontal half-width is
   derived from the angle, which is what keeps an A's legs the same weight as
   its stems no matter how wide the letter gets. */
export function diagCutH(x0, y0, x1, y1, t) {
  const dx = x1 - x0, dy = y1 - y0;
  const hw = Math.abs(dy) < 1e-6 ? t / 2 : (t / 2) * Math.hypot(dx, dy) / Math.abs(dy);
  return [[x0 - hw, y0], [x0 + hw, y0], [x1 + hw, y1], [x1 - hw, y1]];
}

/* A diagonal whose ends are cut VERTICAL — for an arm that stops at a
   sidebearing rather than at a horizontal edge (K's arms, Z's spine). */
export function diagCutV(x0, y0, x1, y1, t) {
  const dx = x1 - x0, dy = y1 - y0;
  const hh = Math.abs(dx) < 1e-6 ? t / 2 : (t / 2) * Math.hypot(dx, dy) / Math.abs(dx);
  return [[x0, y0 - hh], [x0, y0 + hh], [x1, y1 + hh], [x1, y1 - hh]];
}

/* ---------------------------------------------------------------- shaping --- */
export const shift = (p, dx, dy) => p.map(([x, y]) => [x + dx, y + dy]);

/* Trim every point of a contour that falls beyond a vertical line, replacing
   the crossing with a clean cut. Used to square off arcs where a terminal has
   to land flat (the C, the S, the lowercase c/e/s). */
export function cutX(p, x, keepLeft) {
  const inside = ([px]) => (keepLeft ? px <= x : px >= x);
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const ai = inside(a), bi = inside(b);
    if (ai) out.push(a);
    if (ai !== bi) {
      const t = (x - a[0]) / (b[0] - a[0]);
      out.push([x, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/* Same, against a horizontal line. */
export function cutY(p, y, keepBelow) {
  const inside = ([, py]) => (keepBelow ? py <= y : py >= y);
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const ai = inside(a), bi = inside(b);
    if (ai) out.push(a);
    if (ai !== bi) {
      const t = (y - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, y]);
    }
  }
  return out;
}

/* A single point on the same superellipse `arc()` walks — used where one shape
   has to start exactly where another one ended (the question mark's tail). */
export function sePt(cx, cy, rx, ry, a, e) {
  const r = a * D2R, c = Math.cos(r), s = Math.sin(r);
  return [cx + rx * Math.sign(c) * Math.pow(Math.abs(c), e),
          cy + ry * Math.sign(s) * Math.pow(Math.abs(s), e)];
}

/* A straight stroke between two points, capped square and perpendicular to its
   own run. Unlike diagCutH/diagCutV this never blows up as the stroke
   approaches horizontal or vertical, which is what the ampersand's joins need. */
export function seg(p0, p1, t) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * (t / 2), ny = (dx / L) * (t / 2);
  return [[p0[0] + nx, p0[1] + ny], [p1[0] + nx, p1[1] + ny],
          [p1[0] - nx, p1[1] - ny], [p0[0] - nx, p0[1] - ny]];
}
