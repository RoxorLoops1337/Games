// World registry (owner PLAT). Each entry is a LAZY loader returning a module whose default export is  create(ctx, args) -> world spec:
//   { terrain, flora?, npcSpecs?: [id | {id, look, ...createNPC opts}], profile:'out'|'in'|'club'|'studio'|'stage', camera?: {fov,near,far}, update?(dt,t), dispose?() }
//   terrain keeps the existing contract: { group, bounds, blocked(x,z), heightAt, anchors:{start,...}, spotDefs, camera, lights, windows, interior, update? }.
//   ctx = { THREE, kit, PAL, scene, camera, renderer, events, rng, quality, canvas, worldId, sceneName, profile, shared, timeName }. Build into ctx.scene or return groups, never touch the renderer.
//   Mini games return { mini } instead of terrain (see world_mini.js).
// Dynamic import() is inlined by the esbuild IIFE build (page bundle keeps working) and becomes a real lazy chunk in the ESM build (P2).
// To replace a stub: point its line at your own file, for example  title: () => import('./w_title.js').  Ask PLAT, or edit only your own line.
export const WORLDS = {
  // built worlds
  park: () => import('./world_park.js'),
  flat: () => import('./world_flat.js'),
  // mini games (own scene, own camera, own render)
  rhythm: () => import('./world_mini.js'),
  run: () => import('./world_mini.js'),
  tuner: () => import('./world_mini.js'),
  // STUBS (ground plane, label, ambient light, anchors.start, no spots): title SHELL, creator SHELL, street W-STREET, shop INT-A, lab INT-A, bar INT-B, hood W-STREET, office SHELL, arena INT-B
  title: () => import('./w_title.js'),
  creator: () => import('./w_creator.js'),
  street: () => import('./street.js'),
  shop: () => import('./shop_world.js'),
  lab: () => import('./world_stub.js'),
  bar: () => import('./world_bar.js'),
  hood: () => import('./world_stub.js'),
  office: () => import('./world_stub.js'),
  arena: () => import('./world_stub.js'),
};
export const WORLD_IDS = Object.keys(WORLDS);
export const MINI_IDS = ['rhythm', 'run', 'tuner'];
