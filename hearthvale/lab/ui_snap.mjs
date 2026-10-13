// Snapshot the REAL interface markup into static scenes so styles can be designed and compared without WebGL:
//   node hearthvale/lab/ui_snap.mjs        (static server on :8123 serving hearthvale/; global playwright)
// Writes lab/ui_scenes/<scene>.html (body markup without canvases), bg.jpg (the 3D world without interface, phone size) and index.json.
// Re-run after changing HUD markup. Scenes: banner, hud, build, building, valley, villagers, inventory, settings, levelup.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const out = new URL('./ui_scenes/', import.meta.url).pathname; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8123/index.html?solo&q=low&ui=classic'); await p.waitForTimeout(4000);
await p.evaluate(async () => {
  const m = await import('/shared/sim.js'), D = await import('/shared/data.js'); const W = __hv.link.world, P = W.players.me, v = __hv.view;
  P.level = 9; P.xp = 1400; for (const k of Object.keys(P.res)) P.res[k] = 12 + ((k.length * 7) % 60); P.res.soup = 0; P.coins = 1240; P.tech.milling = true; P.tech.trade = true; P.tech.husbandry = true;
  for (const t of ['house', 'house', 'farm', 'kitchen', 'sawmill', 'kiln', 'storehouse', 'study', 'mill', 'bakery', 'market', 'fountain', 'flowers', 'coop', 'barn']) { const d = D.BUILDINGS[t]; if (!d) continue; const s = m.findSpot(P, d.w, d.h, 1); if (s) { for (const k of Object.keys(d.cost)) { if (k === 'coins') P.coins += 99; else P.res[k] += d.cost[k]; } m.command(W, 'me', { op: 'place', type: t, ...s }); } }
  for (let i = 0; i < 400; i++) m.tick(W, 0.1);
  for (const bl of P.buildings) { bl.built = true; bl.progress = 1; if (bl.type === 'house') bl.lvl = 2; } for (const vi of P.villagers) { vi.task = null; vi.hunger = 40; }
  v.weatherAt = () => 0; W.t = 0; v.worldT = 130; v.goal.dist = 24; __hv.S.view.cancelIntro && __hv.S.view.cancelIntro();
});
await p.waitForTimeout(3500);
const hideUi = async (on) => p.evaluate((on) => { for (const s of ['#hud', '#sheet', '#scrim', '#banners', '#over', '#popups', '#toasts', '#tour', '#fxl', '#confetti', '#title']) { const e = document.querySelector(s); if (e) e.style.visibility = on ? 'hidden' : ''; } }, on);
await hideUi(true); await p.screenshot({ path: out + 'bg.jpg', type: 'jpeg', quality: 82 }); await hideUi(false);
const grab = async (name) => { const html = await p.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('canvas,script').forEach((e) => e.remove()); const t = c.querySelector('#title'); if (t) t.remove(); return c.innerHTML; }); writeFileSync(out + name + '.html', html); return html.length; };
const closeAll = async () => { await p.evaluate(() => { const x = document.querySelector('#sheet .x'); if (x && !document.querySelector('#sheet').hidden) x.click(); const o = document.querySelector('#over'); if (o) o.innerHTML = ''; }); await p.waitForTimeout(700); };
const fx = async (js) => p.evaluate(js);
const sizes = {};
// toasts and attention so the HUD scene shows every kind of element
await p.evaluate(async () => { const f = await import('/js/ui/fx.js'); f.toast('Kitchen is ready!', { icon: 'house', type: 'good' }); f.toast('Out of soup!', { icon: 'soup', type: 'warn' }); f.toast('+12 wood', { icon: 'wood', type: 'info' }); });
await p.waitForTimeout(900); sizes.banner = await grab('banner');
await p.evaluate(() => { const b = document.querySelector('#banners'); if (b) b.innerHTML = ''; }); await p.waitForTimeout(400); sizes.hud = await grab('hud');
await p.evaluate(() => document.querySelector('#bBuild').click()); await p.waitForTimeout(1600); sizes.build = await grab('build'); await closeAll();
await p.evaluate(() => { const P = __hv.link.world.players.me; const k = P.buildings.find((x) => x.type === 'kitchen') || P.buildings[0]; __hv.ui.open('building', { id: k.id }); });
await p.waitForTimeout(1500); sizes.building = await grab('building'); await closeAll();
await p.evaluate(() => document.querySelector('#bValley').click()); await p.waitForTimeout(1500);
await p.evaluate(() => { const t = [...document.querySelectorAll('#sheet .sh-tabs button')].find((x) => /project/i.test(x.textContent)); if (t) t.click(); }); await p.waitForTimeout(1200); sizes.valley = await grab('valley'); await closeAll();
await p.evaluate(() => document.querySelector('#bVil').click()); await p.waitForTimeout(1500); sizes.villagers = await grab('villagers'); await closeAll();
await p.evaluate(() => { const c = document.querySelector('#strip .chip, #strip button'); if (c) c.click(); }); await p.waitForTimeout(1400); sizes.inventory = await grab('inventory'); await closeAll();
await p.evaluate(() => { const t = document.querySelector('#tools button:last-child'); if (t) t.click(); }); await p.waitForTimeout(1400); sizes.settings = await grab('settings'); await closeAll();
await p.evaluate(async () => { const c = await import('/js/ui/celebrate.js'); c.showLevelUp(10); }); await p.waitForTimeout(2200); sizes.levelup = await grab('levelup');
writeFileSync(out + 'index.json', JSON.stringify({ scenes: Object.keys(sizes), sizes }, null, 1));
console.log(JSON.stringify(sizes), errs.join('\n') || 'no errors'); await b.close();
