// Switches for the round 2 performance work. All ON in the shipped game. They exist so the profiling harness can A/B each lever in ONE tree
// (`node tools/graftwork_profile.mjs --flags smooth=0,faceLod=0` sets window.__gwFlags before the page loads) and so tests can pin legacy behaviour.
// Anything not mentioned keeps its default; values are read once at module load.
const G = (typeof globalThis !== 'undefined' && globalThis.__gwFlags) || {};
export const FLAGS = Object.assign({
  smooth: 1, // imageSmoothingQuality policy (ui/smoothing.js); 0 = the old 'high' on every draw of the full tier
  faceLod: 1, // card faces baked at a device-resolution bucket (art/face_lod.js); 0 = one 1.5x size for every draw
  layers: 1, // multi-bucket Ward room layer cache (ui/layer_cache.js); 0 = one bucket per room, rebuilt on every change
  smoothUp: 1.15, // magnification above which a big source (512 px+) keeps 'high' (bicubic); 0 = bilinear for every upscale
  bloomShift: 0, // bloom base resolution: 0 = auto (half res, quarter above 1800 px wide), 1 = half, 2 = quarter
  bloomFloat: 1, // 0 = RGBA8 bloom buffers even where half float renders (much cheaper on software GL)
  metrics: 1, // text width cache (ui/text_metrics.js); 0 = measureText every time
  skip: 1, // static frame skipping (ui/frame_state.js)
}, G);
