// Clawspire 2.0 trailer: the text-fit layer and the layout checker.
//
// Every text draw registers its on-screen box (design px, after the full canvas
// transform, including stroke, glow and the 3D extrude), the plate it must sit
// inside, and the shot's keep-clear rects (game UI that must stay readable).
// With ?layout the page skips the footage pixels and window.layoutCheck(from,
// to, step) paints every frame's geometry and reports each rule it breaks:
//   plate     the text is not inside its plate minus LAY_PAD
//   overlap   two text elements intersect (same `layer` excepted)
//   keep      a text element intersects a keep-clear rect
//   safe      a text element leaves the safe zone
//   foreign   a text element touches a plate that is not its own
//   wide      a plate is wider than the frame minus the side margins
'use strict';

const LAY_ON = QS.get('layout') != null;
const LAY_PAD = 14;                                        // min clearance text -> plate edge (px at 1080 wide)
const SAFE = VERT ? [65, 230, 1015, 1536] : [96, 54, 1824, 1026];
const LAY = { els: [], plates: [], keep: [], grp: null, plate: null, layer: null };

function _xbox(g, x0, y0, x1, y1) {
  const m = g.getTransform();
  let a = Infinity, b_ = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
    const X = (m.a * x + m.c * y + m.e) / SCALE, Y = (m.b * x + m.d * y + m.f) / SCALE;
    a = Math.min(a, X); b_ = Math.min(b_, Y); c = Math.max(c, X); d = Math.max(d, Y);
  }
  return [a, b_, c, d];
}
const _union = (p, q) => p ? [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])] : q.slice();
// register a text box given in the current local coordinates
function layText(g, id, x0, y0, x1, y1) {
  if (!LAY_ON || g.globalAlpha < .06) return;
  const box = _xbox(g, x0, y0, x1, y1);
  if (LAY.grp) { LAY.grp.box = _union(LAY.grp.box, box); return; }
  LAY.els.push({ id, box, plate: LAY.plate, layer: LAY.layer });
}
// a group: everything drawn inside is one element (a word's letters, a drip line)
function layBegin(id) { if (LAY_ON && !LAY.grp) LAY.grp = { id, box: null, plate: LAY.plate, layer: LAY.layer, depth: 0 }; else if (LAY.grp) LAY.grp.depth++; }
function layEnd() {
  if (!LAY_ON || !LAY.grp) return;
  if (LAY.grp.depth > 0) { LAY.grp.depth--; return; }
  if (LAY.grp.box) LAY.els.push({ id: LAY.grp.id, box: LAY.grp.box, plate: LAY.grp.plate, layer: LAY.grp.layer });
  LAY.grp = null;
}
// a plate in local coords; returns its design-space box. Texts drawn while it is
// the current plate (layWith) must sit inside it.
function layPlate(g, id, x0, y0, x1, y1) {
  const box = _xbox(g, x0, y0, x1, y1);
  if (LAY_ON && g.globalAlpha >= .06) LAY.plates.push({ id, box });
  return { id, box };
}
function layWith(plate, fn) { const p = LAY.plate; LAY.plate = plate; try { fn(); } finally { LAY.plate = p; } }
function layLayer(layer, fn) { const p = LAY.layer; LAY.layer = layer; try { fn(); } finally { LAY.layer = p; } }
// keep-clear rect in design coords
function keepClear(id, box) { if (LAY_ON) LAY.keep.push({ id, box }); }

const _inter = (p, q) => Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1]));
// how far box p sticks out of box q (px, 0 when inside)
const _out = (p, q) => Math.max(0, q[0] - p[0], q[1] - p[1], p[2] - q[2], p[3] - q[3]);
const _grow = (p, d) => [p[0] - d, p[1] - d, p[2] + d, p[3] + d];

function layViolations(t) {
  const v = [];
  const els = LAY.els;
  for (const e of els) {
    if (e.plate) { const o = _out(e.box, _grow(e.plate.box, -LAY_PAD)); if (o > .5) v.push({ t, rule: 'plate', id: e.id, px: o, with: e.plate.id }); }
    const so = _out(e.box, SAFE); if (so > .5) v.push({ t, rule: 'safe', id: e.id, px: so });
    for (const k of LAY.keep) { const a = _inter(e.box, k.box); if (a > 0) v.push({ t, rule: 'keep', id: e.id, px: Math.sqrt(a), with: k.id }); }
    for (const p of LAY.plates) {
      if (e.plate && e.plate.id === p.id) continue;
      const a = _inter(e.box, _grow(p.box, 6)); if (a > 0) v.push({ t, rule: 'foreign', id: e.id, px: Math.sqrt(a), with: p.id });
    }
  }
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], c = els[j];
    if (a.layer && a.layer === c.layer) continue;
    const ar = _inter(a.box, c.box); if (ar > 0) v.push({ t, rule: 'overlap', id: a.id, px: Math.sqrt(ar), with: c.id });
  }
  for (const p of LAY.plates) {
    const w = p.box[2] - p.box[0];
    if (w > W - 2 * SAFE[0] + .5) v.push({ t, rule: 'wide', id: p.id, px: w - (W - 2 * SAFE[0]) });
  }
  return v;
}
