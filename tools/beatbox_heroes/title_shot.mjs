// Screenshot the REAL game title (index.html?r=3d) with its HUD, at phone and desktop sizes, via the r3 test harness.
//   node tools/beatbox_heroes/title_shot.mjs <outDir> [--q high] [--wait 4000] [--sizes 360x780,412x915,1280x720] [--then slots]
import fs from 'node:fs'; import path from 'node:path'; import { r3env } from '../../tests/beatbox_heroes_r3lib.mjs';
const [outDir, ...rest] = process.argv.slice(2); const opt = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
fs.mkdirSync(outDir, { recursive: true }); process.env.BBH_BROWSER = '1';
const env = await r3env('title_shot'); const q = opt('q', 'high'), wait = +opt('wait', 4000);
for (const s of opt('sizes', '360x780,412x915,1280x720').split(',')) {
  const [w, h] = s.split('x').map(Number); const { page, errs } = await env.newPage({ viewport: { width: w, height: h } });
  await page.goto(env.url('index.html?r=3d&q=' + q + '&preserve=1'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && BBH.R3.status === 'ready', null, { timeout: 40000 }).catch(() => errs.push('never ready'));
  await page.waitForFunction(() => window.__park && __park.ctx && __park.ctx.title, null, { timeout: 30000 }).catch(() => errs.push('no title world')); await page.evaluate(() => __park.ctx.title.skip(6)).catch(() => {});
  await page.waitForTimeout(wait); await page.screenshot({ path: path.join(outDir, 'title_' + s + '.png') });
  if (opt('then', '')) { await page.evaluate(opt('then')).catch((e) => errs.push(String(e))); await page.waitForTimeout(2500); await page.screenshot({ path: path.join(outDir, 'then_' + s + '.png') }); }
  console.log(s, errs.length ? errs.slice(0, 5).join(' | ') : 'ok'); await page.context().close();
}
await env.stop();
