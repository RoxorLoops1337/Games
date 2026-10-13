// Screenshot a lab page headlessly:  node hearthvale/lab/shot.mjs <page.html> <out.png> [query] [width] [height] [waitMs]
// e.g.  node hearthvale/lab/shot.mjs characters.html /tmp/c.png "yaw=0.3&dist=7" 1000 700
// Needs a static server on :8123 serving hearthvale/ (python3 -m http.server 8123 --directory hearthvale) and global playwright.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const [, , page, out, query = '', w = '1000', h = '700', wait = '1500'] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } }); const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:8123/lab/${page}?${query}`); try { await p.waitForFunction('window.__ready === true', null, { timeout: 15000 }); } catch { errs.push('never became ready'); }
await p.waitForTimeout(+wait); await p.screenshot({ path: out }); console.log(errs.join('\n') || 'ok'); await b.close();
