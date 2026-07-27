// Shared plumbing for the DOM layer.
//
// Two ideas run through this file. The first is that a HUD which runs at 144 Hz
// must never hand the browser work it has already done: every write here is
// guarded by the last value it wrote, cached on the node itself rather than in a
// Map, because a property lookup on an element is the cheapest memo there is.
// The second is import-time purity — nothing below touches `document` until it
// is called, so the headless suite can import the UI modules without a page.

export function injectCSS(doc, id, css) {
  if (!doc || doc.getElementById(id)) return null;
  const s = doc.createElement('style');
  s.id = id;
  s.textContent = css;
  (doc.head || doc.documentElement).appendChild(s);
  return s;
}

export function el(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function svg(doc, tag, attrs) {
  const n = doc.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

// ── guarded writes ───────────────────────────────────────────────────────────
// Every one of these is a no-op when the value has not moved. The alternative —
// assigning textContent or style every frame — invalidates layout on each write
// even when the string is identical, which is the single easiest way to turn a
// free HUD into a 4 ms one.

export function txt(node, v) {
  if (!node) return;
  if (node.__txt !== v) { node.__txt = v; node.textContent = v; }
}

export function css(node, prop, v) {
  if (!node) return;
  const k = '__c_' + prop;
  if (node[k] !== v) { node[k] = v; node.style[prop] = v; }
}

export function attr(node, name, v) {
  if (!node) return;
  const k = '__a_' + name;
  if (node[k] !== v) { node[k] = v; node.setAttribute(name, v); }
}

export function cls(node, name, on) {
  if (!node) return;
  const k = '__k_' + name;
  on = !!on;
  if (node[k] !== on) { node[k] = on; node.classList.toggle(name, on); }
}

// Numbers get quantised before they reach the DOM. A crosshair gap that changes
// by a fiftieth of a pixel is a write the player cannot see, so round to the
// step at which the change becomes visible and let the guard above drop the rest.
export function quant(v, step) { return Math.round(v / step) * step; }

// ── motion ───────────────────────────────────────────────────────────────────

export function reducedMotion(win) {
  try { return !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch { return false; }
}

// Thin wrapper over the Web Animations API. WAAPI is used for every one-shot
// flourish in the HUD because it runs off the main thread and costs nothing per
// frame — a hitmarker driven by JS would be forty timer callbacks for a third of
// a second of animation.
export function play(node, frames, opts, reduce) {
  if (!node || !node.animate) return null;
  if (reduce) {
    // Reduced motion keeps the information and drops the movement: the element
    // still appears and still fades, it simply does not travel or scale.
    frames = frames.map((f) => {
      const g = Object.assign({}, f);
      delete g.transform;
      return g;
    });
    opts = Object.assign({}, opts, { duration: Math.min(opts.duration || 200, 200) });
  }
  try { return node.animate(frames, opts); } catch { return null; }
}

// ── maths the UI needs and the sim does not ──────────────────────────────────

export const TAU = Math.PI * 2;
export const DEG = 180 / Math.PI;

// Shortest signed difference between two angles, in degrees. Every bearing on
// the compass and every damage arc is this function wearing a different hat.
export function wrapDeg(d) {
  d %= 360;
  if (d > 180) d -= 360; else if (d < -180) d += 360;
  return d;
}

// Bearing of a world point from the player, in compass degrees (0 = north = −Z,
// 90 = east = +X), matching the coordinate convention in ARCHITECTURE.md.
export function bearingOf(from, to) {
  return Math.atan2(to.x - from.x, -(to.z - from.z)) * DEG;
}

// Camera projection without importing Three. The UI is allowed to *read* the
// camera for damage numbers, but pulling a 600 KB module into the HUD to
// multiply one vector by two matrices would be absurd, and it would break the
// rule that ui/ stays importable in Node.
export function project(cam, p, out, w, h) {
  if (!cam || !cam.matrixWorldInverse || !cam.projectionMatrix) return false;
  const e = cam.matrixWorldInverse.elements, q = cam.projectionMatrix.elements;
  const vx = e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12];
  const vy = e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13];
  const vz = e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14];
  const cw = q[3] * vx + q[7] * vy + q[11] * vz + q[15];
  if (!(cw > 1e-4)) return false;              // behind the lens, or degenerate
  out.x = ((q[0] * vx + q[4] * vy + q[8] * vz + q[12]) / cw * 0.5 + 0.5) * w;
  out.y = (0.5 - (q[1] * vx + q[5] * vy + q[9] * vz + q[13]) / cw * 0.5) * h;
  return Number.isFinite(out.x) && Number.isFinite(out.y);
}

// A world position out of whatever an event happened to carry. Every producer in
// this codebase is a different agent's module, so the HUD reads shapes rather
// than trusting one: `pos`, `point`, `origin`, or an object holding one of them.
export function posOf(v) {
  if (!v || typeof v !== 'object') return null;
  if (typeof v.x === 'number' && typeof v.z === 'number') return v;
  return posOf(v.pos) || posOf(v.point) || posOf(v.origin) || posOf(v.from) || null;
}

// Same tolerance for names: an enemy may be a string, an id, or a record.
export function nameOf(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') return v;
  return v.name || v.label || v.kind || v.type || v.id || fallback;
}
