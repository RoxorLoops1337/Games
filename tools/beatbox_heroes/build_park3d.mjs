// Bundle beatbox_heroes/park3d/main.js (three.js + the park modules) into one IIFE: beatbox_heroes/park3d.bundle.js
//   node tools/beatbox_heroes/build_park3d.mjs [--dev] [--out some/path.js]        (build.js also emits it into dist/)
import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const esbuild = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'esbuild'));
const dev = process.argv.includes('--dev'); const oi = process.argv.indexOf('--out'); const OUT = oi >= 0 ? path.resolve(process.argv[oi + 1]) : path.join(REPO, 'beatbox_heroes', 'park3d.bundle.js');
await esbuild.build({ entryPoints: [path.join(REPO, 'beatbox_heroes', 'park3d', 'main.js')], outfile: OUT, bundle: true, format: 'iife', target: ['es2020'], minify: !dev, sourcemap: dev ? 'inline' : false, legalComments: 'none', logLevel: 'info' });
