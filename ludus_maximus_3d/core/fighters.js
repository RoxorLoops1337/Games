// Ludus Maximus 3D: depth wave 10, module "fighters" (no DOM). Loaded after arena.js (index.html script tag; in Node arena.js requires it at its tail).
// Pure functions on LM and data on the save object S. Wrap earlier LM functions the same way core/ext.js does (keep the old behaviour when your state is absent).
// Rules: optional save fields only (old saves must load), no rnd() draws that change an existing stream order, never add unit fields (core/arena.js blankUnit owns that).
(function (G) {
  const D = G.LM_D, L = G.LM;
  if (!D || !L || L.fighters) return;
  L.fighters = { ver: 1 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
