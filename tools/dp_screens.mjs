// Walk Dungeon Pusher through its screens in Chromium and shoot each one, so
// a type change can be judged where it actually lives instead of on a
// specimen sheet. Drives the game through window.DP, not through pixels.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const OUT = process.argv[2] || '.';
const ROOT = process.cwd();
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
            '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    const p = join(ROOT, normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''));
    const b = await readFile(p);
    res.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end(''); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await browser.newPage({ viewport: { width: 480, height: 840 }, deviceScaleFactor: 2 });
const errs = [];
pg.on('pageerror', (e) => errs.push(String(e)));
await pg.goto(`http://127.0.0.1:${port}/dungeon_pusher/index.html`, { waitUntil: 'load' });
await pg.waitForFunction(() => window.DP && window.DP.S, null, { timeout: 15000 });

const shots = [['title', null]];
await pg.screenshot({ path: join(OUT, 'dp_title.png') });

// into a run: start, then land on the crawl and a fight
await pg.evaluate(() => { const D = window.DP; D.newRun && D.newRun('knight'); });
await pg.waitForTimeout(900);
await pg.screenshot({ path: join(OUT, 'dp_crawl.png') });

const screen = await pg.evaluate(() => window.DP.S.screen);
await pg.evaluate(() => { const D = window.DP; D.startBattle && D.startBattle(D.mkEnemy('orc')); });
await pg.waitForTimeout(700);
await pg.screenshot({ path: join(OUT, 'dp_battle.png') });

console.log('screen after start:', screen);
await browser.close(); server.close();
if (errs.length) { console.error('PAGE ERRORS:\n' + errs.slice(0, 5).join('\n')); process.exit(2); }
