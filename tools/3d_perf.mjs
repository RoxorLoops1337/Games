// Performance probe for the 3D view. Stages rich scenes in the real game and reports what a frame costs.
//   node tools/3d_perf.mjs [--q high|medium|low] [--w 412] [--h 860] [--frames 90]
// Draw calls / triangles come from three's renderer.info (identical on any GPU). JS ms per module are measured around each update().
// Software GL makes absolute frame times meaningless, so judge: calls, triangles, geometries, textures, module ms, heap growth per frame.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const q = opt('q', 'high'), W = +opt('w', 412), H = +opt('h', 860), frames = +opt('frames', 90);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message.slice(0, 300)));
await page.addInitScript((qq) => localStorage.setItem('encore_island_view_v1', JSON.stringify({ mode: '3d', q: qq })), q);
await page.goto(opt('url', 'http://127.0.0.1:8790/encore_island/index.html'));
await page.waitForFunction(() => window.EI && window.EI.VIEW.status === 'ready', null, { timeout: 180000 });
const rows = await page.evaluate(async ({ frames }) => {
  window.requestAnimationFrame = () => 0; const EI = window.EI; let S = EI.S; S.started = true;
  try { EI.FEATS.find((f) => f.id === 'tutorial').api.finish(); S.feat.tutorial.off = true; } catch (e) { /* optional */ }
  S.wallet = 5e6; S.gems = 50; S.houses = 4; EI.seedMain(11);
  for (let i = 0; i < 6; i++) EI.addLand(); for (let i = 0; i < 30; i++) EI.recruit(); S.forge = { queue: [{ k: 3 }], tray: [1, 2, 3, 4], smeltT: 0.5 }; S.forgeLvl = 2;
  const out = [];
  const stage = (name, setup) => { setup(); for (let i = 0; i < 30; i++) { EI.tick(1 / 30); EI.draw(1 / 30); } if (window.gc) window.gc(); const h0 = performance.memory ? performance.memory.usedJSHeapSize : 0; const t0 = performance.now(); for (let i = 0; i < frames; i++) { EI.tick(1 / 30); EI.draw(1 / 30); } const dt = (performance.now() - t0) / frames; const h1 = performance.memory ? performance.memory.usedJSHeapSize : 0; const st = EI.VIEW.api.stats(), bd = EI.VIEW.api.breakdown(); out.push({ bd: Object.entries(bd).map(([k, v]) => k.replace('3d', '') + ' ' + v.calls + '/' + Math.round(v.tris / 1000) + 'k').join('  '), name, ms: +dt.toFixed(1), calls: st.calls, tris: Math.round(st.tris / 1000) + 'k', geos: st.geos, tex: st.tex, tier: st.tier, heapKBperFrame: +((h1 - h0) / 1024 / frames).toFixed(1), mods: st.mods }); };
  stage('hub', () => { S.player.x = 0; S.player.y = 60; });
  stage('land1 + 20 foes', () => { const z = S.lands[0]; for (let i = 0; i < 20; i++) EI.spawnEnemy(z); for (const e of S.enemies) e.born = 1; S.player.x = z.g.x; S.player.y = z.g.y; for (let i = 0; i < 60; i++) EI.dropItem(z.g.x + (i % 10) * 24 - 100, z.g.y + (i / 10 | 0) * 24, i % 9 === 0 ? { gem: true } : { k: 1 + (i % 12), bar: i % 6 === 0 }); });
  stage('boss fight', () => { const z = S.lands[1]; EI.spawnEnemy(z, { boss: true }); for (let i = 0; i < 8; i++) EI.spawnEnemy(z); for (const e of S.enemies) e.born = 1; S.player.x = z.g.x; S.player.y = z.g.y; });
  stage('backstage', () => { S.bsPlate.built = true; EI.enterBackstage && EI.enterBackstage(); });
  return out;
}, { frames });
console.log('tier ' + q + ', viewport ' + W + 'x' + H); for (const r of rows) console.log(JSON.stringify(r));
await browser.close();
