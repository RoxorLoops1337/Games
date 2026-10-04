// Run the layout checker over every frame (geometry only, no pixels).
//   node tools/clawspire_trailer/layout_check.mjs [from] [to] [step]    (CLAW_FMT=v for the vertical cut)
// Prints the violation counts per rule and per element, and writes the full list
// to <out>/layout_report.json.
import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
let chromium;
try { ({ chromium } = createRequire(REPO + '/')('playwright-core')); } catch (e) { ({ chromium } = createRequire('/opt/node22/lib/node_modules/playwright/')('playwright-core')); }
const SCRATCH = process.env.CLAW_SCRATCH || '/tmp/claude-0/-home-user-Games/81b8cd0d-4b44-5ff7-8915-74ba3cb2ca84/scratchpad';
const FOOTAGE = process.env.CLAW_FOOTAGE || join(SCRATCH, 'clawtrailer', 'footage');
const FMT = process.env.CLAW_FMT || 'h';
const OUT = process.env.CLAW_OUT || join(REPO, 'trailer_out', 'clawspire' + (FMT === 'v' ? '_v' : ''));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.png': 'image/png' };
const srv = await new Promise(res => { const s = createServer((q, r) => {
  const url = decodeURIComponent(q.url.split('?')[0]); let root = REPO, rel = url;
  if (url.startsWith('/__footage/')) { root = FOOTAGE; rel = url.slice(10); } else if (url.startsWith('/__scratch/')) { root = SCRATCH; rel = url.slice(10); }
  const p = join(root, rel);
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); r.end(readFileSync(p)); }); s.listen(0, '127.0.0.1', () => res(s)); });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/tools/clawspire_trailer/trailer.html?fmt=${FMT}&scale=0.1&layout=1#render`);
await page.waitForFunction(() => window.trailerReady === true, null, { timeout: 120000 });
const [from, to, step] = [+(process.argv[2] || 0), +(process.argv[3] || 1500), +(process.argv[4] || 1)];
const v = await page.evaluate(([a, b, c]) => window.layoutCheck(a, b, c), [from, to, step]);
await browser.close(); srv.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'layout_report.json'), JSON.stringify(v, null, 1));
const frames = new Set(v.map(x => Math.round(x.t * 60)));
console.log(`checked frames ${from}..${to - 1} step ${step}: ${v.length} violations in ${frames.size} frames`);
const byRule = {}; for (const x of v) byRule[x.rule] = (byRule[x.rule] || 0) + 1;
console.log('by rule:', JSON.stringify(byRule));
const byEl = {};
for (const x of v) { const k = `${x.rule} | ${x.id}${x.with ? ' x ' + x.with : ''}`; const e = byEl[k] || (byEl[k] = { n: 0, max: 0, t0: x.t, t1: x.t }); e.n++; e.max = Math.max(e.max, x.px); e.t0 = Math.min(e.t0, x.t); e.t1 = Math.max(e.t1, x.t); }
for (const [k, e] of Object.entries(byEl).sort((a, b) => a[1].t0 - b[1].t0)) console.log(`  ${k}: ${e.n} frames, ${e.t0.toFixed(2)}-${e.t1.toFixed(2)} s, worst ${e.max.toFixed(1)} px`);
