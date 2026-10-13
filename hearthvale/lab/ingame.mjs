// Screenshot the REAL game with a rich demo village.  node hearthvale/lab/ingame.mjs <out.png> [preset] [width] [height]
// presets: village (default, game camera), close (dist 14), valley (whole valley), night, rain, build (build menu open), board (valley board open),
//          quests, players, sheet (hall sheet), phone (390x800 village)
// Needs the static server on :8123 (python3 -m http.server 8123 --directory hearthvale) and global playwright.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const [, , out, preset = 'village', w0, h0] = process.argv; const phone = preset === 'phone';
const W = +(w0 || (phone ? 390 : 1280)), H = +(h0 || (phone ? 800 : 800));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: phone, isMobile: phone }); const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
await p.goto('http://localhost:8123/index.html?solo'); await p.waitForTimeout(3500);
await p.evaluate(async (preset) => {
  const m = await import('/shared/sim.js'), D = await import('/shared/data.js'); const W = __hv.link.world, P = W.players.me, v = __hv.view;
  P.level = 8; P.xp = 1100; Object.keys(P.res).forEach((k) => (P.res[k] = 90)); P.tech.milling = true; P.tech.trade = true;
  for (const t of ['house', 'house', 'house', 'farm', 'kitchen', 'sawmill', 'kiln', 'storehouse', 'study', 'mill', 'bakery', 'market', 'fountain', 'flowers', 'banner', 'lantern']) { const d = D.BUILDINGS[t]; const s = m.findSpot(P, d.w, d.h, 1); if (s) m.command(W, 'me', { op: 'place', type: t, ...s }); }
  for (let i = 0; i < 300; i++) m.tick(W, 0.1);
  for (const b of P.buildings) { b.built = true; b.progress = 1; if (b.type === 'house' || b.type === 'kitchen') b.lvl = 2; if (b.type === 'hall') b.lvl = 3; }
  for (const vi of P.villagers) vi.task = null; for (let i = 0; i < 3; i++) { const n = P.nodes.filter((n) => n.type === 'tree')[i]; if (n) m.command(W, 'me', { op: 'assign', k: 'node', id: n.id }); }
  for (let i = 0; i < 30; i++) m.tick(W, 0.1);
  const target = preset === 'night' ? 300 : 130; W.t = target - 130; v.worldT = target; v.weatherAt = () => (preset === 'rain' ? 1 : 0); v.rainGoal = preset === 'rain' ? 1 : 0; if (preset === 'rain') v.rainAmt = 1;
  v.goal.dist = preset === 'close' ? 14 : preset === 'valley' ? 70 : 26; if (preset === 'valley') { v.goal.x = 0; v.goal.z = 0; v.goal.pitch = 0.95; }
}, preset);
const click = async (sel) => { try { await p.evaluate((s) => document.querySelector(s).click(), sel); } catch {} };
if (preset === 'build') await click('#bBuild'); if (preset === 'board') await click('#bValley'); if (preset === 'quests') await click('[data-p=quests]'); if (preset === 'players') await click('[data-p=players]');
if (preset === 'sheet') await p.evaluate(() => { const v = __hv.view, V = v.villages.get('me'), s = v.project(V.group.position.x, 1.2, V.group.position.z); const e = new PointerEvent('pointerdown', { clientX: s.x, clientY: s.y, pointerId: 9, bubbles: true }); const c = document.querySelector('#gl'); c.dispatchEvent(e); c.dispatchEvent(new PointerEvent('pointerup', { clientX: s.x, clientY: s.y, pointerId: 9, bubbles: true })); });
await p.waitForTimeout(3500); await p.screenshot({ path: out }); console.log(errs.join('\n') || 'ok'); await b.close();
