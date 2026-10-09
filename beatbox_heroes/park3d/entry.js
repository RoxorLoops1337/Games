// Park3D ESM ENTRY (owner PLAT): the module the real game imports lazily (index.html `window.BBH_R3`, hash-stamped by build.js).
// Built by `node tools/beatbox_heroes/build_park3d.mjs --esm` as an esbuild ESM splitting build: this file plus ONE shared core chunk (three.js, host, characters, lighting, controls, spots)
// and one lazy chunk per world module (worlds.js registers them as dynamic imports, so a world's code is only fetched when host.load(id) first needs it).
// The IIFE bundle (main.js -> park3d.bundle.js) stays for the dev pages and as the file:// fallback; this entry does NOT pull in main.js or the mini game index.
//   const { createHost, WORLDS } = await import(url);   createHost(canvas, { embedded:true, quality, preserve, onLost }) -> host   (see host.js for the full API)
export { createHost, createRenderer, DEFAULT_LOOK, BUDGETS } from './host.js';
export { WORLDS, WORLD_IDS, MINI_IDS } from './worlds.js';
export { playTape } from './tape.js';   // WATCH A BEATBOX TAPE: the couch / TV sequence in the flat (the game calls R3.lib.playTape(world, opts))
export const PARK3D_ESM = 1;
