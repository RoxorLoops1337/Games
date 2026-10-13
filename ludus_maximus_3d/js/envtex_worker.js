// Module worker: bakes procedural textures off the main thread. Protocol: { id, spec } in, { id, w, h, color, bump } out (buffers transferred), { id, err } on failure.
import { generate } from './envtex_gen.js';
self.onmessage = (e) => {
  const { id, spec } = e.data;
  try {
    const t0 = performance.now(), r = generate(spec);
    self.postMessage({ id, w: r.w, h: r.h, color: r.color.buffer, bump: r.bump.buffer, ms: performance.now() - t0 }, [r.color.buffer, r.bump.buffer]);
  } catch (err) { self.postMessage({ id, err: String((err && err.message) || err) }); }
};
