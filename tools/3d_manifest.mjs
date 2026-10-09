// The 3D view's module list. view.js preloads every file in parallel (modulepreload) before importing the engine, which flattens the
// import waterfall (one round trip instead of one per dependency level). The list is the import closure of engine.js plus the modules it
// loads by name; tests/encore_island_view3d.test.mjs fails when encore_island/view3d/modules.json drifts from it.
//   node tools/3d_manifest.mjs --write     regenerate the file
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), v3 = join(root, 'encore_island', 'view3d'), vendor = join(root, 'encore_island_3d', 'vendor');
const NAMED = ['fx3d', 'env3d', 'loot3d', 'heroes3d', 'foes3d', 'hub3d', 'lands3d', 'backstage3d', 'foes_a', 'foes_b', 'foes_c'];
export function computeManifest() {
  const seen = new Set(), walk = (abs) => {
    if (seen.has(abs) || !existsSync(abs)) return; seen.add(abs); const s = readFileSync(abs, 'utf8');
    for (const m of s.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) { const sp = m[1]; let t = null;
      if (sp === 'three') t = join(vendor, 'three.module.min.js'); else if (sp.startsWith('three/addons/')) t = join(vendor, 'jsm', sp.slice(13)); else if (sp.startsWith('.') && sp !== '.') t = resolve(dirname(abs), sp);
      if (t && /\.js$/.test(t)) walk(t); }
  };
  walk(join(v3, 'engine.js')); for (const n of NAMED) walk(join(v3, n + '.js'));
  return [...seen].map((f) => relative(v3, f).split('\\').join('/')).sort();
}
if (process.argv[1] && process.argv[1].endsWith('3d_manifest.mjs') && process.argv.includes('--write')) { const list = computeManifest(); writeFileSync(join(v3, 'modules.json'), JSON.stringify(list, null, 1) + '\n'); console.log('wrote modules.json', list.length, 'files'); }
