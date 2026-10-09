// Frame grabber for the action vignettes (r3/vig.js, park3d/vig_<world>.js): plays vignettes in the REAL game (index.html?r=3d) and saves PNGs at chosen moments.
//   node tools/beatbox_heroes/vig_shot.mjs <outDir> --vig p1.eat.banana,p1.nap [--form first] [--at 0.5,1.5,3] [--sizes 390x844,1280x720] [--q high] [--hour 13] [--place home]
//   --morning oats      the morning event for p1.wake (oats five drums rain streamed mum dream pipes)      --slot hat   the changed slot for p1.wardrobe
//   --opts '{"fx":[...],"action":{...}}'   extra play options merged into every play (the result rank of an outro, the action of an intro)    --tag x   a suffix for the file names   --flags '{"bmgMet":1}'   save flags
//   --sheet             also writes <outDir>/contact_<size>.png: every frame of the run on one page (needs nothing but the browser)
// Each vignette is frozen (cine.pause) and moved with cine.seek(T) (simulation only), then real frames render for a moment with the world almost stopped (host.timeScale 0.05).
// Prints each vignette's info and the console errors.
import fs from 'node:fs'; import path from 'node:path'; import { r3env } from '../../tests/beatbox_heroes_r3lib.mjs';
const [outDir, ...rest] = process.argv.slice(2); const opt = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
if (!outDir) { console.log('usage: vig_shot.mjs <outDir> --vig id[,id] [--form first] [--at 0.5,1.5]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true }); process.env.BBH_BROWSER = '1';
const ids = opt('vig', 'p1.eat.banana').split(','), form = opt('form', 'first'), q = opt('q', 'high'), sizes = opt('sizes', '390x844').split(','), hour = +opt('hour', 13), place = opt('place', 'home');
const at = opt('at', '') ? opt('at').split(',').map(Number) : null, sheet = rest.includes('--sheet');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = await r3env('vig_shot');
for (const s of sizes) {
  const [w, h] = s.split('x').map(Number); const { page, errs } = await env.newPage({ viewport: { width: w, height: h } });
  await page.goto(env.url('index.html?r=3d&q=' + q + '&preserve=1'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && BBH.R3.status === 'ready' && BBH.Eng.sceneName === 'title', null, { timeout: 120000 }).catch(() => errs.push('never ready'));
  await page.evaluate(([hour, place, flags]) => {
    const C = BBH.Core, ch = C.newChar(BBH.CATALOG.DEFAULT_LOOK); ch.name = 'Nova'; ch.look.name = 'Nova'; BBH.G.slot = 1; ch.flags.intro = 1; ch.day = 3; ch.minutes = hour * 60 - 360; ch.cash = 120; ch.fans = 64; ch.energy = 60; ch.hunger = 40;
    for (const p of ['home', 'park', 'shop', 'studio', 'bar']) ch.flags['visited_' + p] = 1; if (flags) Object.assign(ch.flags, JSON.parse(flags)); BBH.G.setChar(ch); if (place === 'hood') BBH.Eng.go('map'); else BBH.Eng.go('place', { id: place });
  }, [hour, place, opt('flags', '')]);
  await page.waitForFunction(() => (BBH.Eng.sceneName === 'place' || BBH.Eng.sceneName === 'map') && BBH.Eng.scene.w && BBH.R3.world === BBH.Eng.scene.w && !BBH.Eng.pendingSwitch, null, { timeout: 120000 });
  await page.evaluate(() => Promise.all([BBH.R3Vig.load(BBH.R3.world.id), BBH.R3Cine.load()]));
  await sleep(1200);
  const shots = [];
  for (const id of ids) {
    await page.evaluate(([form]) => { BBH.R3Vig.force = form; BBH.R3Vig.onReel = (c) => { c.pause(true); window.__vc = c; }; window.__vc = null; }, [form]);
    await page.evaluate(([id, mo, slot, xo]) => {
      const o = {}; if (id === 'p1.wake') { o.morning = { t: 'morning', day: 4, name: 'Thursday', lines: ['You slept well.'], cause: 'sleep', event: mo || null }; o.anyScene = true; }
      if (id === 'p1.wardrobe') o.extra = { slot: slot || 'hat' }; if (id === 'p1.train.quick') o.action = { t: 'train', stat: 'tech', q: 0.4 };
      if (xo) Object.assign(o, JSON.parse(xo)); if (/^p1\.(travel|door\.in)/.test(id)) o.anyScene = true;
      window.__vp = BBH.R3Vig.play(id, o).then((i) => { window.__vi = i; });
    }, [id, opt('morning', ''), opt('slot', ''), opt('opts', '')]);
    await page.waitForFunction(() => window.__vc || (window.__vi && !window.__vi.ok), null, { timeout: 30000 }).catch(() => {});
    const has = await page.evaluate(() => !!window.__vc);
    if (!has) { console.log(id, 'did not play', JSON.stringify(await page.evaluate(() => window.__vi))); continue; }
    const len = await page.evaluate(() => { const c = window.__vc; let t = 0; const ev = c.state().n; return ev; });
    const moments = at || [0.3, 1.0, 1.8, 2.6, 3.4, 4.2, 5.0];
    for (const T of moments) {
      const st = await page.evaluate((T) => { const c = window.__vc; if (!c || c.state().done) return null; BBH.R3.host.timeScale = 1; c.seek(T); BBH.R3.host.timeScale = 0.05; return c.state(); }, T);
      if (!st || st.done) break;
      await sleep(+opt("wait", 1800)); const file = path.join(outDir, id.replace(/\./g, '_') + opt('tag', '') + '_' + form + '_' + String(T.toFixed(1)).replace('.', 's') + '_' + s + '.png');
      await page.screenshot({ path: file }); shots.push({ file, id, T });
    }
    await page.evaluate(() => { BBH.R3.host.timeScale = 1; const c = window.__vc; if (c) { c.pause(false); c.skip(); } });
    await page.waitForFunction(() => !BBH.R3Vig.playing && window.__vi, null, { timeout: 20000 }).catch(() => {});
    console.log(s, id, JSON.stringify(await page.evaluate(() => window.__vi)), 'events', len);
    await sleep(500);
  }
  if (sheet && shots.length) {
    const html = '<html><body style="margin:0;background:#111;display:flex;flex-wrap:wrap;gap:4px;padding:4px;font:12px sans-serif;color:#ccc">' + shots.map((x) => '<figure style="margin:0;width:' + (w > h ? 320 : 180) + 'px"><img src="file://' + path.resolve(x.file) + '" style="width:100%"><figcaption>' + x.id + ' ' + x.T + 's</figcaption></figure>').join('') + '</body></html>';
    const hf = path.join(outDir, 'contact_' + s + '.html'); fs.writeFileSync(hf, html);
    const p2 = await page.context().newPage(); await p2.setViewportSize({ width: 1400, height: 900 }); await p2.goto('file://' + path.resolve(hf)); await sleep(800); await p2.screenshot({ path: path.join(outDir, 'contact_' + s + '.png'), fullPage: true }); await p2.close();
  }
  console.log(errs.length ? 'ERRORS ' + errs.slice(0, 8).join(' | ') : 'no console errors');
  await page.context().close();
}
await env.stop();
