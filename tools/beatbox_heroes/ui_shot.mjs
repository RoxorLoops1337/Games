// Screenshot the r3 UI gallery (beatbox_heroes/r3/ui_gallery.html) in headless Chromium.
//   node tools/beatbox_heroes/ui_shot.mjs <outDir> [--w 390] [--h 844] [--dpr 2] [--only name,name] [--sheet out.png:name,name,...]
// Starts a tiny static server for the repo (the gallery fetch()es index.html) and bundles park3d/ui3d.js for the embed prompt.
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..', '..'), req = createRequire(import.meta.url);
const { chromium } = req(path.join(REPO, 'node_modules', 'playwright-core')), esbuild = req(path.join(REPO, 'node_modules', 'esbuild'));
const [outDir, ...rest] = process.argv.slice(2); const opt = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
const W = +opt('w', 390), H = +opt('h', 844), DPR = +opt('dpr', 2), only = opt('only', '') ? opt('only').split(',') : null;
fs.mkdirSync(outDir, { recursive: true });
const embed = (await esbuild.build({ entryPoints: [path.join(HERE, 'ui_gallery_entry.js')], bundle: true, write: false, format: 'iife', target: 'es2020', minify: true })).outputFiles[0].text;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  if (u === '/__gallery/ui3d_embed.js') { rs.writeHead(200, { 'content-type': 'text/javascript' }); rs.end(embed); return; }
  const f = path.join(REPO, u); if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs);
}).listen(0); const port = server.address().port;
const SHOTS = [
  ['ui_hud_street_day', 'view=hudfull&bg=day'], ['ui_hud_street_night_low', 'view=hudfull&bg=night&low=1'], ['ui_hud_stats', 'view=hud&bg=dusk'],
  ['ui_menu', 'view=menu&bg=day'], ['ui_creator_tops', 'view=creator&bg=day'], ['ui_creator_skin', 'view=skin&bg=dusk'], ['ui_settings', 'view=settings&bg=day'],
  ['ui_stats', 'view=stats&bg=day'], ['ui_ach', 'view=ach&bg=night'], ['ui_help', 'view=help&bg=day'], ['ui_shop', 'view=shop&bg=day'], ['ui_sheet', 'view=sheet&bg=day'],
  ['ui_dialog', 'view=dialog&bg=dusk'], ['ui_narr', 'view=narr&bg=night'], ['ui_modal', 'view=modal&bg=day'], ['ui_banner', 'view=banner&bg=day'], ['ui_result', 'view=result&bg=day'],
  ['ui_dev', 'view=dev&bg=day'], ['ui_devcode', 'view=code&bg=day'], ['ui_title', 'view=title&bg=night'], ['ui_slots', 'view=slots&bg=night'], ['ui_icons', 'view=icons&bg=night'], ['ui_widgets', 'view=widgets&bg=day'],
  ['ui_off_menu', 'view=menu&bg=day&off=1'], ['ui_off_creator', 'view=creator&bg=day&off=1'],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
for (const [name, qs] of SHOTS) {
  if (only && !only.includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(name + ' PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(name + ' ' + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/beatbox_heroes/r3/ui_gallery.html?${qs}`);
  try { await page.waitForFunction('window.__ready||window.__err', null, { timeout: 15000 }); } catch (e) { errs.push(name + ' timeout'); }
  const err = await page.evaluate('window.__err||null'); if (err) errs.push(name + ' ' + err);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, name + '.png') }); await ctx.close();
}
await browser.close(); server.close();
const sh = opt('sheet', ''); if (sh) {
  const sharp = req(path.join(REPO, 'node_modules', 'sharp')); const [o, names] = sh.split(':'); const ims = names.split(',').map((n) => path.join(outDir, n + '.png'));
  const metas = await Promise.all(ims.map((f) => sharp(f).metadata())); const w = metas.reduce((a, m) => a + m.width + 16, 0), hh = Math.max(...metas.map((m) => m.height));
  let x = 0; await sharp({ create: { width: w, height: hh, channels: 3, background: '#0b0814' } }).composite(ims.map((f, i) => { const c = { input: f, left: x, top: 0 }; x += metas[i].width + 16; return c; })).png().toFile(path.join(outDir, o));
}
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
