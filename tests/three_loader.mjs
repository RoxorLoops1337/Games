// Node module-resolution hook: maps the browser importmap ('three', 'three/addons/') onto the vendored files so 3D modules import headless.
//   import { register } from 'node:module'; register('./three_loader.mjs', import.meta.url);
export async function resolve(specifier, context, nextResolve) {
  const vendor = new URL('../encore_island_3d/vendor/', import.meta.url);
  if (specifier === 'three') return { url: new URL('three.module.min.js', vendor).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('jsm/' + specifier.slice('three/addons/'.length), vendor).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
