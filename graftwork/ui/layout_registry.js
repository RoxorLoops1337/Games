// Layout registry: every HUD widget reports its rectangle each frame so tests can prove nothing overlaps (design/UX_SPEC.md).
//   app.reg(id, x, y, w, h, { layer: 'hud'|'world'|'overlay', group: 'hand', overlay: false })
// Rules the tests enforce: rects of layer 'hud' never intersect unless they share a group or one is flagged overlay
// (tooltips, modals, the hovered-card layer); every rect lies inside the 1280x720 stage.
const items = [];
export function clear() { items.length = 0; }
export function register(id, x, y, w, h, o = {}) { items.push({ id, x, y, w, h, layer: o.layer || 'hud', group: o.group || id, overlay: !!o.overlay }); }
export function getAll() { return items.slice(); }
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
export function findOverlaps(minArea = 4) {
  const hud = items.filter((r) => r.layer === 'hud' && !r.overlay), out = [];
  for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) {
    if (hud[i].group === hud[j].group) continue;
    const a = inter(hud[i], hud[j]); if (a >= minArea) out.push({ a: hud[i].id, b: hud[j].id, area: Math.round(a) });
  }
  return out;
}
export function findOutOfBounds(W = 1280, H = 720, slack = 1) {
  return items.filter((r) => r.layer !== 'world' && (r.x < -slack || r.y < -slack || r.x + r.w > W + slack || r.y + r.h > H + slack)).map((r) => r.id);
}
