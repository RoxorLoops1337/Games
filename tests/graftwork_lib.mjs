// Headless app harness for UI smoke tests: a recording fake canvas, no DOM needed.
// Fast path: the common Canvas2D methods are plain own no-ops (no Proxy trap per call); any other name still resolves
// through a Proxy prototype, so unknown methods and unread properties behave exactly as before.
const CTX_METHODS = ['arc', 'arcTo', 'beginPath', 'bezierCurveTo', 'clearRect', 'clip', 'closePath', 'drawImage', 'ellipse', 'fill', 'fillRect', 'fillText', 'lineTo', 'moveTo', 'putImageData', 'quadraticCurveTo', 'rect', 'resetTransform', 'restore', 'rotate', 'roundRect', 'save', 'scale', 'setLineDash', 'setTransform', 'stroke', 'strokeRect', 'strokeText', 'transform', 'translate'];
export function fakeCtx() {
  const grad = { addColorStop() {} };
  const state = { calls: 0 };
  const fallback = new Proxy({}, {
    get(o, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof k === 'symbol') return undefined;
      return (...a) => { state.calls++; return undefined; };
    },
  });
  const ctx = Object.create(fallback);
  ctx.canvas = null;
  const noop = () => { state.calls++; };
  for (const m of CTX_METHODS) ctx[m] = noop;
  ctx.createLinearGradient = ctx.createRadialGradient = ctx.createPattern = () => grad;
  ctx.measureText = (s) => ({ width: String(s).length * 8 });
  Object.defineProperty(ctx, '__calls', { get: () => state.calls });
  return ctx;
}
export function installDom() {
  globalThis.window = globalThis.window || { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (() => 0);
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  globalThis.document = globalThis.document || { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx(), style: {} }) };
  globalThis.Path2D = globalThis.Path2D || class { constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); } };
}
export async function makeApp(shared = {}) {
  installDom();
  const { createApp } = await import('../graftwork/ui/core.js');
  const canvas = { getContext: () => fakeCtx(), addEventListener() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), width: 1280, height: 720, setPointerCapture() {} };
  const app = createApp(canvas, { shared });
  app.resize();
  return app;
}
export function frames(app, n = 3, dt = 1 / 60) { for (let i = 0; i < n; i++) app.tick(dt); }
export function click(app, x, y) {
  app.mouse.x = x; app.mouse.y = y; app.mouse.pressed = true; app.mouse.down = true; app.tick(1 / 60);
  app.mouse.released = true; app.mouse.down = false; app.tick(1 / 60);
}
export function key(app, k) { app.pressedKeys.push({ key: k, preventDefault() {} }); app.tick(1 / 60); }
