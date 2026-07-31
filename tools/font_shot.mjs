// Screenshot a page from the repo in Chromium, for looking at art with eyes
// instead of guessing. Used by the Grimcut type work:
//
//   node tools/font_shot.mjs dungeon_pusher/font.html out.png [w] [h]
//
// Serves the repo root over http so relative <script src> and art resolve the
// same way Cloudflare Pages will serve them.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const [page, out, W = '1240', H = '1720'] = process.argv.slice(2);
if (!page || !out) { console.error('usage: font_shot.mjs <page> <out.png> [w] [h]'); process.exit(1); }

const ROOT = process.cwd();
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  try {
    const p = join(ROOT, normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 2 });
const errs = [];
pg.on('pageerror', (e) => errs.push(String(e)));
pg.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text()); });
pg.on('requestfailed', (r) => { if (!/favicon/.test(r.url())) errs.push('failed ' + r.url()); });
pg.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(r.status() + ' ' + r.url()); });
await pg.goto(`http://127.0.0.1:${port}/${page}`, { waitUntil: 'load' });
await pg.waitForTimeout(600);
await pg.screenshot({ path: out, fullPage: true });
await browser.close();
server.close();
if (errs.length) { console.error('PAGE ERRORS:\n' + errs.join('\n')); process.exit(2); }
console.log('wrote ' + out);
