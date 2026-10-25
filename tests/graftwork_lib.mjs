// Headless app harness for UI smoke tests: a recording fake canvas, no DOM needed.
export function fakeCtx() {
  const grad = { addColorStop() {} };
  const state = { calls: 0 };
  const target = { canvas: null };
  return new Proxy(target, {
    get(o, k) {
      if (k === '__calls') return state.calls;
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return (...a) => { state.calls++; return undefined; };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
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
