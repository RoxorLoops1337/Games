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
const { execFileSync, execSync } = require('child_process');

const watch = process.argv.includes('--watch');

const REPO = __dirname;
const DIST = path.join(REPO, 'dist');

// Static files/dirs that should be mirrored into dist/ as-is.
// Anything not in this list (node_modules, build.js, package.json, .git, etc.)
// stays out of the deploy.
const STATIC_PATHS = [
  'index.html',
  'beatborne',
  'README.md',
  '_redirects',
  '_headers',
  'beatbox_story',
  'decktest',
  'pitchdeck',
  'DhauwieSurvival',
  'Carnegiendon',
  'loop_jam',
  'gamedevloop',
  'verb_collector',
  'thieu_excuses_app',
  'mazekeep',
  'ralpherizer',
  'cutie_merge',
  'evolve_and_conquer',
  'tower-defense-sprites',
  'night_shift',
  'no_room_for_heroes',
  'chase_hq',
  'messenger',
  'kingshot_endless',
  'encore_island',
  'encore_island_3d',
  'headliner',
  'horde_runner',
  'spijker_master',
  'nineties_cars',
  'frietkot_tycoon',
  'horse_ranch',
  'wildwalk',
  'the_collection',
  'ballistic',
  'coin_pusher',
  'cell_survivor',
  'leviathan_press',
  'dungeon_pusher',
  'grimhold',
  'ironbridge',
  'blacksite',
  'carmanager',
  'flipper_crawl',
  'duck_fishing',
  'emberkin',
  'frostfell',
  'birds_and_beasts',
  'joske_de_flosser',
  'donut_patrol',
  'merry_crashmas',
  'world_choir_games',
  'grudge_draft',
  'clawspire',
  'claw_crawl',
  'rogue_book',
  'hocus_vocus',
  'LoopDoku',
  'beatbox_heroes',
  'pixel_colony',
  'tools',
];

// JSX/TSX entry points to bundle. Output paths are relative to dist/.
const BUNDLES = [
  {
    entryPoints: [path.join('beatbox_story', 'main.jsx')],
    outfile: path.join(DIST, 'beatbox_story', 'beatbox-story.bundle.js'),
  },
  {
    entryPoints: [path.join('beatbox_heroes', 'park3d', 'main.js')],
    outfile: path.join(DIST, 'beatbox_heroes', 'park3d.bundle.js'),
  },
  {
    entryPoints: [path.join('verb_collector', 'main.tsx')],
    outfile: path.join(DIST, 'verb_collector', 'verb-collector.bundle.js'),
  },
];

const buildOpts = (target) => ({
  entryPoints: target.entryPoints,
  outfile: target.outfile,
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  loader: { '.jsx': 'jsx', '.js': 'jsx', '.ts': 'ts', '.tsx': 'tsx' },
  jsx: 'transform',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  legalComments: 'none',
  logLevel: 'info',
});

// Awesome Farm is a Vite + TypeScript project with its own package.json (awesome_farm/). The site serves the repo as it
// is, so its build is kept in git in awesome_farm/play/ (like the mirrored bundles above); awesome_farm/index.html is
// the Vite source page and forwards there. FARM=1 rebuilds play/ (then commit it); otherwise the committed build is
// copied, so `npm run check` for the other games never waits for it. Its tests: `npm run test:farm`.
const FARM = path.join(REPO, 'awesome_farm');
const buildAwesomeFarm = () => {
  const play = path.join(FARM, 'play');
  try {
    if (process.env.FARM === '1') {
      execSync('npm ci --include=dev --no-audit --no-fund', { cwd: FARM, stdio: 'inherit' });
      execSync('npm run build:pages', { cwd: FARM, stdio: 'inherit' });
      console.log('mirrored        → awesome_farm/play (commit it)');
    }
    if (!fs.existsSync(path.join(play, 'index.html'))) { console.log('awesome_farm: no build in awesome_farm/play (FARM=1 makes one)'); return; }
    fs.cpSync(play, path.join(DIST, 'awesome_farm', 'play'), { recursive: true });
    fs.copyFileSync(path.join(FARM, 'index.html'), path.join(DIST, 'awesome_farm', 'index.html'));
    console.log('copied awesome_farm/play → dist/awesome_farm/play');
    // the player wiki: one generated page (awesome_farm/scripts/wiki.ts, `npm run wiki` there), committed like play/
    const wiki = path.join(FARM, 'wiki');
    if (fs.existsSync(path.join(wiki, 'index.html'))) {
      fs.cpSync(wiki, path.join(DIST, 'awesome_farm', 'wiki'), { recursive: true });
      console.log('copied awesome_farm/wiki → dist/awesome_farm/wiki');
    }
  } catch (err) {
    console.error(`!! awesome_farm did not build (${err.message}); the rest of the site is unaffected`);
  }
};

// Beatbox Heroes ESM splitting build (park3d/entry.js -> r3/entry.js + r3/p3-*.js): one tool owns the esbuild options (tools/beatbox_heroes/build_park3d.mjs --esm).
// Output is mirrored into the source tree like the other bundles, and the entry URL is stamped into index.html as window.BBH_R3.
const R3_SRC = path.join(REPO, 'beatbox_heroes', 'r3');
const isR3Out = (f) => f === 'entry.js' || /^p3-.*\.js$/.test(f);
const cleanR3Mirror = () => { if (fs.existsSync(R3_SRC)) for (const f of fs.readdirSync(R3_SRC)) if (isR3Out(f)) fs.rmSync(path.join(R3_SRC, f)); };
const buildBeatboxR3 = () => {
  const outDir = path.join(DIST, 'beatbox_heroes', 'r3');
  execFileSync(process.execPath, [path.join(REPO, 'tools', 'beatbox_heroes', 'build_park3d.mjs'), '--esm', '--out', outDir], { stdio: 'inherit' });
  const entry = fs.readFileSync(path.join(outDir, 'entry.js'));
  const hash = crypto.createHash('sha256').update(entry).digest('hex').slice(0, 10);
  for (const f of fs.readdirSync(outDir)) if (isR3Out(f)) fs.copyFileSync(path.join(outDir, f), path.join(R3_SRC, f));
  console.log(`mirrored        → beatbox_heroes/r3/entry.js + chunks`);
  for (const html of [path.join(DIST, 'beatbox_heroes', 'index.html'), path.join(REPO, 'beatbox_heroes', 'index.html')]) {
    if (!fs.existsSync(html)) continue;
    const before = fs.readFileSync(html, 'utf8');
    const after = before.replace(/(r3\/entry\.js)(\?v=[^"]+)?/g, `$1?v=${hash}`);
    if (before !== after) fs.writeFileSync(html, after);
  }
  console.log(`hash-stamped    → r3/entry.js?v=${hash}`);
};

const wipeDist = () => {
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
};

// Files kept in the repo but left out of a game's deploy (relative to the game
// folder). Clawspire: the old pre-rendered intro (js/intro.js draws it live, no
// code requests these) and the design docs.
// Encore Island 3D keeps its preview/lab pages and notes next to the code; none of it is part of the site
const DEV_ONLY = /^(encore_island\/view3d\/(lab[\w]*\.html|[\w]*lab[\w]*\.js|README\.md)|encore_island_3d\/(preview_\w+\.html|DESIGN\.md))$/;
const SKIP_IN_DIST = {
  clawspire: new Set(['intro.mp4', 'intro.webm', 'intro_poster.jpg', 'DESIGN.md', 'ART_PROMPTS.md']),
  // Hocus Vocus: the re-theme plan (hundreds of KB of design notes) is never deployed
  hocus_vocus: new Set(['plan']),
};

const copyStatic = () => {
  for (const rel of STATIC_PATHS) {
    const src = path.join(REPO, rel);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(DIST, rel);
    const skip = SKIP_IN_DIST[rel] || new Set();
    // A game's CLAUDE.md is notes for coding sessions, never part of the site.
    const opts = { recursive: true, filter: (p) => {
      const r = path.relative(src, p).split(path.sep).join('/');
      return !skip.has(r) && r !== 'CLAUDE.md' && !DEV_ONLY.test(rel + '/' + r);
    } };
    fs.cpSync(src, dst, opts);
  }
  console.log(`copied ${STATIC_PATHS.length} static paths → dist/`);
};

// Clawspire's optional illustrations live under clawspire/art/. The game's
// loader reads art/manifest.json (every PNG present, relative to art/) so a
// deployed page only requests files that exist; without the manifest it
// probes every path. Written into dist/ only, never into the source tree.
const writeArtManifest = () => {
  const root = path.join(DIST, 'clawspire', 'art');
  if (!fs.existsSync(root)) return;
  const out = [];
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name), r = rel ? rel + '/' + name : name;
      if (fs.statSync(p).isDirectory()) walk(p, r);
      else if (/\.png$/i.test(name)) out.push(r);
    }
  };
  walk(root, '');
  out.sort();
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(out));
  console.log(`clawspire art manifest: ${out.length} file(s)`);
};

// Clawspire (round 18): minify and version the deployed copy only. The source
// in clawspire/ stays readable and the tests keep loading it.
// - Each js/*.js is minified on its own. They are classic scripts sharing
//   globals (const GAME, RENDER, U...): a transform without a format never
//   renames top-level names, and target es2020 matches the source's syntax, so
//   nothing is lowered (no helper temporaries added at the top level).
// - The lazy Dutch tables are hash-stamped inside i18n.js, then every script
//   src in the HTML pages gets ?v=<content hash>, so the root _headers file can
//   cache /clawspire/js/* for a year while index.html stays revalidated.
// - index.html: every <style> is minified as CSS, the loader's inline script as
//   ES5 (it runs before anything else), and the loader's byte weights (WT) are
//   rewritten from the built files' gzip sizes.
// Reads and writes dist/clawspire only; no other game is touched.
const minifyClawspire = () => {
  const root = path.join(DIST, 'clawspire');
  const jsDir = path.join(root, 'js');
  if (!fs.existsSync(jsDir)) return;
  const zlib = require('zlib');
  const hashOf = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
  let rawIn = 0, rawOut = 0;
  const files = fs.readdirSync(jsDir).filter((f) => /\.js$/.test(f)).sort();
  for (const f of files) {
    const p = path.join(jsDir, f);
    const src = fs.readFileSync(p, 'utf8');
    const out = esbuild.transformSync(src, {
      minify: true, target: 'es2020', legalComments: 'none', charset: 'utf8', sourcefile: 'clawspire/js/' + f,
    }).code;
    fs.writeFileSync(p, out);
    rawIn += Buffer.byteLength(src); rawOut += Buffer.byteLength(out);
  }
  // i18n.js names the Dutch tables it loads lazily; stamp them before i18n.js is hashed
  const i18nPath = path.join(jsDir, 'i18n.js');
  if (fs.existsSync(i18nPath)) {
    let code = fs.readFileSync(i18nPath, 'utf8');
    for (const f of files.filter((n) => /^lang_\w+\.js$/.test(n))) {
      const re = new RegExp(`(["'\`])js/${f.replace('.', '\\.')}\\1`, 'g');
      const v = hashOf(fs.readFileSync(path.join(jsDir, f)));
      let n = 0;
      code = code.replace(re, (m, q) => { n++; return `${q}js/${f}?v=${v}${q}`; });
      if (!n) throw new Error(`clawspire: js/i18n.js no longer names js/${f}; update minifyClawspire in build.js`);
    }
    fs.writeFileSync(i18nPath, code);
  }
  const hash = {}, gzKB = {};
  for (const f of files) {
    const buf = fs.readFileSync(path.join(jsDir, f));
    hash[f] = hashOf(buf);
    gzKB[f.replace(/\.js$/, '')] = Math.max(1, Math.round(zlib.gzipSync(buf, { level: 9 }).length / 1024));
  }
  for (const page of fs.readdirSync(root).filter((n) => /\.html$/.test(n))) {
    const htmlPath = path.join(root, page);
    let html = fs.readFileSync(htmlPath, 'utf8');
    const before = html.length;
    html = html.replace(/(<script\b[^>]*\bsrc=")js\/([\w.-]+\.js)(")/g, (m, a, f, b) => {
      if (!hash[f]) throw new Error(`clawspire/${page}: js/${f} is not in clawspire/js`);
      return `${a}js/${f}?v=${hash[f]}${b}`;
    });
    // (round 24) the head's <link rel="preload" as="script"> get the same stamp, or the browser would fetch
    // each script twice (the preloaded URL and the stamped one)
    html = html.replace(/(<link\b[^>]*\bhref=")js\/([\w.-]+\.js)(")/g, (m, a, f, b) => {
      if (!hash[f]) throw new Error(`clawspire/${page}: a preload names js/${f}, which is not in clawspire/js`);
      return `${a}js/${f}?v=${hash[f]}${b}`;
    });
    if (page === 'index.html') {
      // the loader's weights: one per script tag, its gzip KB as built
      const wt = [...html.matchAll(/<script\b[^>]*\bsrc="js\/(\w+)\.js\?v=/g)].map((m) => `${m[1]}: ${gzKB[m[1]]}`);
      let nWt = 0;
      html = html.replace(/var WT = \{[^}]*\};/, () => { nWt++; return `var WT = { ${wt.join(', ')} };`; });
      if (!nWt) console.warn('clawspire: the loader weights (var WT) were not found in index.html; the bar keeps the source numbers');
      html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g, (m, a, css, b) =>
        a + esbuild.transformSync(css, { loader: 'css', minify: true, sourcefile: 'clawspire/index.html <style>' }).code.trim() + b);
      // inline scripts (no src); the loader (csBootJs) is plain ES5 on purpose and stays ES5
      html = html.replace(/(<script\b(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/g, (m, a, js, b) => !js.trim() ? m : a + esbuild.transformSync(js, {
        minify: true, target: /id="csBootJs"/.test(a) ? 'es5' : 'es2020', legalComments: 'none', charset: 'utf8', sourcefile: 'clawspire/index.html <script>',
      }).code.trim() + b);
    }
    fs.writeFileSync(htmlPath, html);
    rawIn += before; rawOut += html.length;
  }
  console.log(`clawspire minified: ${(rawIn / 1024).toFixed(0)} KB -> ${(rawOut / 1024).toFixed(0)} KB (js + html), scripts hash-stamped`);
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
  cleanR3Mirror(); // stale ESM entry/chunks mirrored into the source tree by an earlier build must not be copied into dist/
  copyStatic();
  writeArtManifest();
  minifyClawspire();
  buildAwesomeFarm();

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
    // the Park3D bundle is also loaded by standalone pages (park, flat, mini games): pin their hash too, or phones keep a stale bundle
    if (bundleBaseName === 'park3d.bundle.js') for (const page of ['park3d.html', 'flat3d.html', 'minigames3d.html', 'world3d.html']) { stamp(path.join(distGameDir, page)); stamp(path.join(REPO, sourceGameDir, page)); }
    console.log(`hash-stamped    → ${bundleBaseName}?v=${hash}`);
  }
  buildBeatboxR3();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
