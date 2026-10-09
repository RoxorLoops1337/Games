// Frame grabber for the Beatbox Heroes cutscenes (park3d/cine.js, r3/cine.js): plays a film in the REAL game (index.html?r=3d) and saves a PNG at chosen moments.
//   node tools/beatbox_heroes/cine_shot.mjs <outDir> --film opening [--at 'office:3,office:9,street:6'] [--sizes 390x844,1280x720] [--q high]
//   --only office,dream  plays just those reels (the others end at once)
//   --at  reelSuffix:T pairs (the reel id ends with the suffix, T = real seconds into that reel; the film is frozen there with cine.pause + cine.seek). Default: every 3 s of every reel.
//   Story films (firstJam, sightJam, meet, pigpen, famous, firstWin, ...) are started in their place with a save that fits the beat. Prints the cine states and console errors.
import fs from 'node:fs'; import path from 'node:path'; import { r3env } from '../../tests/beatbox_heroes_r3lib.mjs';
const [outDir, ...rest] = process.argv.slice(2); const opt = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
fs.mkdirSync(outDir, { recursive: true }); process.env.BBH_BROWSER = '1';
const film = opt('film', 'opening'), q = opt('q', 'high'), sizes = opt('sizes', '390x844').split(',');
const only = opt('only', '') ? opt('only').split(',') : null;
const at = opt('at', '') ? opt('at').split(',').map((s) => { const [r, t] = s.split(':'); return { r, t: +t }; }) : null;
const PLACE = { firstJam: 'park', sightJam: 'park', sightBusk: 'park', meet: 'park', pigpen: 'park', famous: 'park', firstWin: 'bar', firstLoss: 'bar', firstShowcase: 'bar', champion: 'bar', morning1: 'home', collapse: 'home' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = await r3env('cine_shot');
for (const s of sizes) {
  const [w, h] = s.split('x').map(Number); const { page, errs } = await env.newPage({ viewport: { width: w, height: h } });
  await page.goto(env.url('index.html?r=3d&q=' + q + '&preserve=1'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && BBH.R3.status === 'ready' && BBH.Eng.sceneName === 'title', null, { timeout: 60000 }).catch(() => errs.push('never ready'));
  await page.evaluate((o) => { window.__only = o; }, only);
  await page.evaluate(([film, place]) => {
    const C = BBH.Core, ch = C.newChar(BBH.CATALOG.DEFAULT_LOOK); ch.name = 'Nova'; ch.look.name = 'Nova'; BBH.G.slot = 1; ch.flags.intro = 1; ch.day = 3; ch.minutes = 13 * 60 - 360; ch.n.jams = 3; ch.flags.visited_park = 1; ch.flags.visited_bar = 1; ch.flags.visited_home = 1;
    if (film === 'meet') { ch.flags.bmgSighted = 2; ch.flags.bmgVia = 'jam'; }
    if (place === 'bar') { ch.day = 6; ch.minutes = 21 * 60 - 360; }
    BBH.G.setChar(ch);
    BBH.R3Cine.onReel = (c) => { if (window.__only && !window.__only.some((k) => c.id.endsWith(k))) { setTimeout(() => c.end(), 50); return; } c.pause(true); };
    if (film === 'opening') { BBH.Eng.go('intro', { next: 'new' }); return; }
    const L = (C.STORY[film] || []).map((l) => Object.assign({}, l));
    if (place === 'home') { BBH.G.pendingMorning = { t: 'morning', day: film === 'morning1' ? 2 : 4, name: 'Tuesday', lines: ['You slept well.'], cause: film === 'collapse' ? 'collapse' : 'sleep' }; BBH.Eng.go('place', { id: 'home' }); return; }
    if (film !== 'meet') BBH.G.storyQ.push({ t: 'story', id: film, lines: L });
    BBH.Eng.go('place', { id: place });
  }, [film, PLACE[film] || null]);
  const states = [];
  const grab = async (name) => { await page.screenshot({ path: path.join(outDir, film + '_' + name + '_' + s + '.png') }); };
  const deadline = Date.now() + 240000; let lastReel = '', shotN = 0, started = false;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => { const c = BBH.R3Cine.cur; return { playing: BBH.R3Cine.playing, cur: c ? c.state() : null, scene: BBH.Eng.sceneName, world: BBH.R3.world && BBH.R3.world.id }; }).catch(() => null);
    if (!st) break;
    if (st.playing) started = true; else if (started) break;
    if (st.cur && st.cur.id !== lastReel) {
      lastReel = st.cur.id; states.push(st.cur.id + (await page.evaluate(() => { const c = BBH.R3Cine.cur; return c && c.camera && c.camera.position ? '' : '(no camera)'; }).catch(() => '?')));
      if (only && !only.some((k) => lastReel.endsWith(k))) continue;
      const moments = at ? at.filter((m) => lastReel.endsWith(m.r)).map((m) => m.t) : [1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 34, 38];
      for (const T of moments) {
        const r = await page.evaluate((T) => { const c = BBH.R3Cine.cur; if (!c) return null; c.pause(true); c.seek(T); return c.state(); }, T).catch((e) => ({ err: String(e) }));
        if (!r || r.done || r.err) { console.log('stop at', lastReel, T, JSON.stringify(r)); break; }
        await sleep(900); await grab(lastReel.replace(/^.*\./, '') + '_' + String(T).padStart(2, '0') + 's');
        shotN++;
      }
      await page.evaluate(() => { const c = BBH.R3Cine.cur; if (c) { c.pause(false); c.end(); } }).catch(() => {});
    }
    await sleep(250);
  }
  const fin = await page.evaluate(() => ({ last: BBH.R3Cine.last, scene: BBH.Eng.sceneName, world: BBH.R3.world && BBH.R3.world.id, log: BBH.R3Cine.log })).catch(() => null);
  console.log(s, 'reels', states.join(','), 'shots', shotN, 'end', JSON.stringify(fin)); console.log(errs.length ? 'ERRORS ' + errs.slice(0, 8).join(' | ') : 'no console errors');
  await page.context().close();
}
await env.stop();
