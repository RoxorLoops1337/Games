// Spotlight Storm beams, drawn into ONE shared half-resolution additive layer and blitted once.
// With 2+ bolts alive this replaces N save/restore pairs, N big alpha trapezoids at full resolution
// and N ellipses with a single drawImage of the dirty rectangle (a quarter of the fill cost).
import { W, H } from './sim.js';

const TAU = Math.PI * 2;
const HALF = 0.5;
export const BOLT_LIFE = 0.28;

// the moving pose of one bolt: sweep, rig position, fade
export function boltPose(b, out) {
  const a = Math.min(1, b.life * 5), age = 1 - b.life / BOLT_LIFE, sw = Math.sin(age * 9 + b.seed) * 46 * (1 - age);
  out.a = a; out.age = age; out.sw = sw; out.ox = b.x + sw * 0.4; out.oy = 36 - Math.max(0, 1 - age * 6) * 60;
  return out;
}

// the light of one bolt (beam cone, pool, rising motes), additive; c is already scaled to game units
export function paintBolt(c, b, p) {
  const { a, age, sw, ox, oy } = p;
  c.globalAlpha = 0.45 * a; c.beginPath(); c.moveTo(ox - 10, oy + 30); c.lineTo(ox + 10, oy + 30); c.lineTo(b.x + 62 + sw, b.y); c.lineTo(b.x - 62 + sw, b.y); c.closePath(); c.fill();
  c.globalAlpha = 0.8 * a; c.beginPath(); c.ellipse(b.x + sw, b.y, 58, 22, 0, 0, TAU); c.fill();
  for (let j = 0; j < 4; j++) { const f = (age * 2 + j / 4) % 1; c.globalAlpha = 0.6 * a * (1 - f); c.beginPath(); c.arc(b.x + sw + Math.sin(j * 4 + b.seed) * 40, b.y - f * 40, 3, 0, TAU); c.fill(); }
}

export function createBoltLayer(kit) {
  let cv = null, g = null, tried = false;
  const pose = { a: 0, age: 0, sw: 0, ox: 0, oy: 0 };
  const lw = Math.ceil(W * HALF), lh = Math.ceil(H * HALF);
  function ensure() {
    if (tried) return !!g;
    tried = true;
    cv = kit && kit.makeCanvas ? kit.makeCanvas(lw, lh) : null;
    g = cv && cv.getContext ? cv.getContext('2d') : null;
    if (g) { g.scale(HALF, HALF); g.globalCompositeOperation = 'lighter'; g.fillStyle = '#fff1a8'; }
    return !!g;
  }
  // draws the lit part of every bolt in one go; returns false when the layer is unavailable (caller draws directly)
  function draw(ctx, bolts) {
    if (!ensure()) return false;
    let x0 = W, x1 = 0, y1 = 0;
    for (let i = 0; i < bolts.length; i++) { const b = bolts[i]; if (b.x - 150 < x0) x0 = b.x - 150; if (b.x + 150 > x1) x1 = b.x + 150; if (b.y + 40 > y1) y1 = b.y + 40; }
    x0 = Math.max(0, Math.floor(x0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
    if (x1 <= x0 || y1 <= 0) return true;
    g.clearRect(x0, 0, x1 - x0, y1);   // only the dirty rectangle
    for (let i = 0; i < bolts.length; i++) paintBolt(g, bolts[i], boltPose(bolts[i], pose));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
    ctx.drawImage(cv, x0 * HALF, 0, (x1 - x0) * HALF, y1 * HALF, x0, 0, x1 - x0, y1);
    ctx.restore();
    return true;
  }
  return { draw };
}
