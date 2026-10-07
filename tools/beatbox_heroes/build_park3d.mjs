// Bundle beatbox_heroes/park3d (three.js + the park modules).
//   node tools/beatbox_heroes/build_park3d.mjs [--dev] [--out some/path.js]
//       IIFE: park3d/main.js -> beatbox_heroes/park3d.bundle.js (dev pages, file:// fallback). build.js also emits it into dist/.
//   node tools/beatbox_heroes/build_park3d.mjs --esm [--dev] [--out some/dir]
//       ESM splitting build for the real game: park3d/entry.js -> <dir>/entry.js + <dir>/p3-<chunk>-<hash>.js (default dir beatbox_heroes/r3).
//       Stale entry.js / p3-*.js in the directory are removed first. Prints "esm-entry-hash <10 hex>" (sha256 of entry.js; build.js stamps it into index.html).
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const esbuild = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'esbuild'));
const dev = process.argv.includes('--dev'); const esm = process.argv.includes('--esm'); const oi = process.argv.indexOf('--out');
const common = { bundle: true, target: ['es2020'], minify: !dev, sourcemap: dev ? 'inline' : false, legalComments: 'none', logLevel: 'info' };
if (esm) {
  const OUT = oi >= 0 ? path.resolve(process.argv[oi + 1]) : path.join(REPO, 'beatbox_heroes', 'r3');
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f === 'entry.js' || /^p3-.*\.js$/.test(f)) fs.rmSync(path.join(OUT, f));
  await esbuild.build({ ...common, entryPoints: { entry: path.join(REPO, 'beatbox_heroes', 'park3d', 'entry.js') }, outdir: OUT, format: 'esm', splitting: true, entryNames: '[name]', chunkNames: 'p3-[name]-[hash]' });
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT, 'entry.js'))).digest('hex').slice(0, 10);
  console.log('esm-entry-hash ' + hash);
} else {
  const OUT = oi >= 0 ? path.resolve(process.argv[oi + 1]) : path.join(REPO, 'beatbox_heroes', 'park3d.bundle.js');
  await esbuild.build({ ...common, entryPoints: [path.join(REPO, 'beatbox_heroes', 'park3d', 'main.js')], outfile: OUT, format: 'iife' });
}
