// Screenshot the REAL game in 3D (software GL). The page's own loop is stopped; we step tick()+draw() ourselves so shots are deterministic.
//   node tools/3d_game_shot.mjs <out.png> [--url http://127.0.0.1:8790/encore_island/index.html] [--w 412] [--h 860] [--dpr 1] [--frames 40]
//        [--state "js"] [--after "js"] [--q low|medium|high] [--mode 3d|2d] [--fps 1]   (state/after run in the page with EI, S in scope)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const a = process.argv.slice(2), out = a[0], opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const url = opt('url', 'http://127.0.0.1:8790/encore_island/index.html'), W = +opt('w', 412), H = +opt('h', 860), frames = +opt('frames', 40), mode = opt('mode', '3d'), q = opt('q', 'auto');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: +opt('dpr', 1) });
let errs = 0; page.on('pageerror', (e) => { errs++; console.log('PAGE ERROR', e.message.slice(0, 500)); });
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) { errs++; console.log('CONSOLE', t.slice(0, 300)); } else if (/\[3d\]/.test(t)) console.log(t.slice(0, 400)); });
await page.addInitScript(([m, qq]) => { try { localStorage.setItem('encore_island_view_v1', JSON.stringify({ mode: m, q: qq })); } catch (e) { /* ignore */ } }, [mode, q]);
await page.goto(url);
await page.waitForFunction(() => typeof ART !== 'undefined' && ART.ready, null, { timeout: 20000 }).catch(() => console.log('art did not load'));
if (mode === '3d') await page.waitForFunction(() => window.EI && (window.EI.VIEW.status === 'ready' || window.EI.VIEW.status === 'failed'), null, { timeout: 120000 }).catch(() => console.log('3D did not become ready'));
const info = await page.evaluate(async ({ state, after, frames, fps }) => {
  window.requestAnimationFrame = () => 0; await new Promise((r) => setTimeout(r, 150));
  const EI = window.EI; let S = EI.S; S.started = true;
  try { const T = EI.FEATS.find((f) => f.id === 'tutorial').api; S.feat.tutorial.off = true; T.finish(); } catch (e) { /* optional */ }
  S.wallet = 123456; S.pallet = 777; S.gems = 9;
  if (state) new Function('EI', 'S', state)(EI, S);
  S = EI.S;
  for (let i = 0; i < frames; i++) { EI.tick(1 / 30); EI.draw(1 / 30); }
  if (after) new Function('EI', 'S', after)(EI, S);
  EI.draw(1 / 60);
  const V = EI.VIEW; return { view: V.mode + '/' + V.status + (V.err ? ' ' + V.err : ''), stats: V.api ? V.api.stats() : null, place: EI.S.place };
}, { state: opt('state', ''), after: opt('after', ''), frames, fps: 1 });
await page.screenshot({ path: out, timeout: 240000 }); console.log('shot', out, JSON.stringify(info), errs ? errs + ' errors' : 'ok');
await browser.close();
