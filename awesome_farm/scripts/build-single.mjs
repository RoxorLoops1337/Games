// Builds the whole game into ONE html file (script, style and font inlined) so it can be opened
// from a phone, a chat, a USB stick or any static host with no server and no extra requests:
//   dist-single/awesome-farm.html     (solo play: the world lives in the browser)
// Run via `npm run build:single`. Online play needs the dedicated server, so it is not in here.
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = join(root, 'dist-single', '.build');
rmSync(join(root, 'dist-single'), { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

await build({
    root,
    configFile: false,
    base: './',
    logLevel: 'warning',
    build: {
        outDir: tmp,
        emptyOutDir: true,
        cssCodeSplit: false,
        assetsInlineLimit: 0,
        modulePreload: false,
        rollupOptions: { output: { inlineDynamicImports: true } },
        minify: 'terser',
        terserOptions: { compress: { passes: 2 }, mangle: true, format: { comments: false } },
    },
});

const js = readdirSync(join(tmp, 'assets')).find((f) => f.endsWith('.js'));
if (!js) throw new Error('no script was built');
const code = readFileSync(join(tmp, 'assets', js), 'utf8').replace(/<\/script/gi, '<\\/script');
const embed = (file) => readFileSync(join(root, 'public', 'fonts', file)).toString('base64');
const css = readFileSync(join(root, 'public', 'style.css'), 'utf8')
    .replace("url('fonts/PixelifySans.ttf')", `url(data:font/ttf;base64,${embed('PixelifySans.ttf')})`)
    .replace("url('fonts/Jersey15.ttf')", `url(data:font/ttf;base64,${embed('Jersey15.ttf')})`)
    .replace("url('fonts/Fredoka.ttf')", `url(data:font/ttf;base64,${embed('Fredoka.ttf')})`);

// the fragment is the same page without the document wrapper, for hosts that add their own
const fragment = `<title>Awesome Farm</title>
<style>${css}</style>
<div id="app"><div id="game-container"></div></div>
<script type="module">${code}</script>
`;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="theme-color" content="#2a1d2c" />
<title>Awesome Farm</title>
<style>${css}</style>
</head>
<body>
<div id="app"><div id="game-container"></div></div>
<script type="module">${code}</script>
</body>
</html>
`;
writeFileSync(join(root, 'dist-single', 'awesome-farm.html'), html);
writeFileSync(join(root, 'dist-single', 'awesome-farm.fragment.html'), fragment);
rmSync(tmp, { recursive: true, force: true });
console.log(`dist-single/awesome-farm.html  ${(html.length / 1e6).toFixed(2)} MB`);
