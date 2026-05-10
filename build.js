// Bundles each game's entry JSX into a self-contained IIFE and assembles a
// clean `dist/` directory for Cloudflare Pages to deploy. Stamps each
// bundle's URL with a content-hash query string so browsers re-fetch when
// the code actually changes (avoids stale-cache after deploys).
//
// Run: `npm run build` (one-shot) or `npm run watch` (rebuild JSX only).
//
// Pages configuration:
//   Build command:           npm install && npm run build
//   Build output directory:  dist

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const watch = process.argv.includes('--watch');

const REPO = __dirname;
const DIST = path.join(REPO, 'dist');

// Static files/dirs that should be mirrored into dist/ as-is.
// Anything not in this list (node_modules, build.js, package.json, .git, etc.)
// stays out of the deploy.
const STATIC_PATHS = [
  'index.html',
  'README.md',
  'beatbox_story',
  'decktest',
  'pitchdeck',
  'DhauwieSurvival',
];

// JSX entry points to bundle. Output paths are relative to dist/.
const BUNDLES = [
  {
    entryPoints: [path.join('beatbox_story', 'main.jsx')],
    outfile: path.join(DIST, 'beatbox_story', 'beatbox-story.bundle.js'),
  },
];

const buildOpts = (target) => ({
  entryPoints: target.entryPoints,
  outfile: target.outfile,
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  loader: { '.jsx': 'jsx', '.js': 'jsx' },
  jsx: 'transform',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  legalComments: 'none',
  logLevel: 'info',
});

const wipeDist = () => {
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
};

const copyStatic = () => {
  for (const rel of STATIC_PATHS) {
    const src = path.join(REPO, rel);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(DIST, rel);
    fs.cpSync(src, dst, { recursive: true });
  }
  console.log(`copied ${STATIC_PATHS.length} static paths → dist/`);
};

(async () => {
  if (watch) {
    // In watch mode we just rebuild bundles in place (no dist copy) so the
    // dev can serve from the source folders directly.
    for (const t of BUNDLES) {
      const opts = buildOpts({
        ...t,
        outfile: t.outfile.replace(`${DIST}${path.sep}`, ''),
      });
      const ctx = await esbuild.context(opts);
      await ctx.watch();
      console.log(`watching ${t.entryPoints[0]} → ${opts.outfile}`);
    }
    return;
  }

  wipeDist();
  copyStatic();

  for (const t of BUNDLES) {
    await esbuild.build(buildOpts(t));
    console.log(`built ${t.entryPoints[0]} → ${path.relative(REPO, t.outfile)}`);
    // Compute a content hash so the served HTML can cache-bust the bundle
    // automatically on every deploy.
    const bundleBytes = fs.readFileSync(t.outfile);
    const hash = crypto.createHash('sha256').update(bundleBytes).digest('hex').slice(0, 10);
    const bundleBaseName = path.basename(t.outfile);
    const distGameDir = path.dirname(t.outfile);
    const distIndexPath = path.join(distGameDir, 'index.html');
    const sourceGameDir = path.basename(distGameDir); // e.g. 'beatbox_story'
    const sourceIndexPath = path.join(REPO, sourceGameDir, 'index.html');
    const sourceCopyPath = path.join(REPO, sourceGameDir, bundleBaseName);
    // Mirror bundle into the source folder so the site works without a
    // Pages build step (e.g. file:// previews).
    fs.copyFileSync(t.outfile, sourceCopyPath);
    console.log(`mirrored        → ${path.relative(REPO, sourceCopyPath)}`);
    // Rewrite both index.html copies (dist + source) to pin the hash.
    const stamp = (htmlPath) => {
      if (!fs.existsSync(htmlPath)) return;
      const before = fs.readFileSync(htmlPath, 'utf8');
      const re = new RegExp(`(${bundleBaseName.replace(/\./g, '\\.')})(\\?v=[^"]+)?`, 'g');
      const after = before.replace(re, `$1?v=${hash}`);
      if (before !== after) fs.writeFileSync(htmlPath, after);
    };
    stamp(distIndexPath);
    stamp(sourceIndexPath);
    console.log(`hash-stamped    → ${bundleBaseName}?v=${hash}`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
