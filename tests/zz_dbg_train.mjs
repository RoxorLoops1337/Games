import { r3env } from './beatbox_heroes_r3lib.mjs';
import { seed, sleep } from './beatbox_heroes_r3gamelib.mjs';
const D = '/tmp/claude-0/-home-user-Games/ce3779c9-bd7b-52ac-b7a0-ea410b3b9a69/scratchpad/dbg/';
const env = await r3env('dbg');
try {
  const p2 = await env.newPage({ viewport: { width: 360, height: 640 } });
  await p2.page.goto(env.url('index.html?r=2d'));
  await p2.page.waitForFunction(() => window.BBH && BBH.Eng && BBH.G && BBH.G.trainMenu && BBH.Eng.sceneName === 'title', null, { timeout: 90000 });
  await seed(p2.page, { day: 3, minutes: 13 * 60 - 360, energy: 90 });
  await p2.page.evaluate(() => BBH.Eng.go('place', { id: 'home' })); await p2.page.waitForFunction(() => BBH.Eng.sceneName === 'place' && !BBH.Eng.pendingSwitch, null, { timeout: 30000 }); await sleep(400);
  await p2.page.evaluate(() => BBH.G.places.ACTIONS.home.booth(BBH.Eng.scene));
  await sleep(600); await p2.page.evaluate(() => document.querySelector('.trn [data-act=play]').click());
  for (let i = 0; i < 4; i++) { await sleep(150 + i * 150); console.log(await p2.page.evaluate(() => { const s = document.querySelector('#ui .sheet'); if (!s) return 'nosheet'; const r = s.getBoundingClientRect(); return [r.x, r.y, r.width, r.height, getComputedStyle(s).display, getComputedStyle(s).visibility, getComputedStyle(document.getElementById('ui')).display, BBH.Eng.sceneName, document.getElementById('ui').children.length]; })); await p2.page.screenshot({ path: D + 'd' + i + '.png' }); }
  console.log(p2.errs);
} finally { await env.stop(); }
