#!/usr/bin/env node
// Records the games-index cover for Echowake: hocus_vocus/cover.webp (480x270 poster) and hocus_vocus/cover.webm (a short looping hover clip).
//
//   node tools/hocus_vocus/cover.mjs
//
// Like every other cover on the index the poster is 480x270 and the clip is a small VP9 WebM. There is no ffmpeg here, so the clip is built in
// the browser: the game is driven on its own virtual clock (GAME.debug.tick), one screenshot per frame, and the frames are replayed onto a canvas
// that a MediaRecorder captures. The result is the same every run. Rerun it after anything that changes how the title or combat look.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(REPO, 'hocus_vocus');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(REPO, 'node_modules', 'playwright-core'));
const sharp = require(path.join(REPO, 'node_modules', 'sharp'));

const W = 480, H = 270;                 // what every cover on the index is
const FPS = 12, STEP = Math.round(1000 / FPS);
const BITRATE = 520000;
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
pg.on('pageerror', (e) => errs.push(String(e)));
pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await pg.goto('file://' + path.join(OUT, 'index.html') + '?debug=1&notutorial=1');
await pg.waitForTimeout(700);
// a cover is the game, not the furniture: no tap prompt, no fullscreen button, no footer on the title
await pg.addStyleTag({ content: '.mn-gate-text,.mn-gate-sub,.mn-fs,.mn-foot{opacity:0 !important}' });
await pg.evaluate(() => GAME.debug.freeze(true));
const tick = (ms) => pg.evaluate((m) => GAME.debug.tick(m, 16), ms);
const grab = async () => sharp(await pg.screenshot({ type: 'png' })).resize(W, H, { kernel: 'lanczos3' }).png().toBuffer();

const frames = [];
// the poster: the title card, the temple bell under the moon
await tick(1500);
const poster = await grab();
await sharp(poster).webp({ quality: 80 }).toFile(path.join(OUT, 'cover.webp'));

// a beat of the title, then the fight, then one card played
frames.push(poster);
for (let i = 0; i < 9; i++) { await tick(STEP); frames.push(await grab()); }
await pg.evaluate(() => { GAME.debug.open('combat', { enemies: ['kappa', 'kodama'] }); });   // resolves with the clock, so not awaited
for (let i = 0; i < 16; i++) { await tick(STEP); frames.push(await grab()); }
await tick(900);                                                                                // let the hand finish dealing
const played = await pg.evaluate(() => { try { const d = GAME.debug.combat(); return d ? (d.play(1, 0), true) : false; } catch (e) { return String(e); } });
for (let i = 0; i < 18; i++) { await tick(STEP); frames.push(await grab()); }

// encode: replay the frames onto a canvas at FPS and record it
const clip = await pg.evaluate(({ list, w, h, fps, bitrate }) => new Promise((res, rej) => {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999';
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  const rec = new MediaRecorder(cv.captureStream(fps), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: bitrate });
  const parts = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  rec.onstop = async () => {
    const u8 = new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer());
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    res({ b64: btoa(s), bytes: u8.length });
  };
  Promise.all(list.map((b64) => createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' })))).then((bmps) => {
    g.drawImage(bmps[0], 0, 0);
    rec.start();
    let i = 0;
    const next = () => {
      if (i >= bmps.length) { setTimeout(() => rec.stop(), 120); return; }
      g.drawImage(bmps[i++], 0, 0);
      setTimeout(next, 1000 / fps);
    };
    setTimeout(next, 80);
  }, rej);
}), { list: frames.map((f) => f.toString('base64')), w: W, h: H, fps: FPS, bitrate: BITRATE });

fs.writeFileSync(path.join(OUT, 'cover.webm'), Buffer.from(clip.b64, 'base64'));
const size = (f) => fs.statSync(path.join(OUT, f)).size;
console.log('cover.webp ' + size('cover.webp') + ' bytes');
console.log('cover.webm ' + size('cover.webm') + ' bytes, ' + frames.length + ' frames at ' + FPS + ' fps; card played: ' + played);
console.log(errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : 'no page errors');
await b.close();
