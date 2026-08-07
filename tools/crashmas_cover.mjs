/* Records the games-index cover for Merry Crashmas.
 *
 * Every other entry on the index has a cover.webp poster and a cover.webm clip
 * that plays on hover; this one had neither, so its card showed a broken image
 * on the front page of the site. There is no ffmpeg in this environment, so the
 * clip is recorded out of the browser itself: captureStream on the game canvas
 * into a MediaRecorder, VP9, pulled back as base64. The poster is one frame of
 * the same run, written through sharp.
 *
 *   node tools/crashmas_cover.mjs
 *
 * Rerun it after anything that changes how the game looks.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const GAME = path.join(REPO, 'merry_crashmas', 'index.html');
const OUT = path.join(REPO, 'merry_crashmas');

const W = 480, H = 270;          // what every other cover on the index is
/* Three seconds, because that is how long the run is: launch, plough, stop. At
   five the clip spent its last two seconds back on the wide aim camera with
   nothing happening, which on a card that loops is most of what you see.

   The other clips on the index run 70-150KB. Left at the browser default this
   came out at half a megabyte, four times the biggest cover on the page; VP9
   at 480x270 lands inside the range at a little over half a megabit. */
const SECONDS = 3.2;
const BITRATE = 480000;

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errs = [];
pg.on('pageerror', (e) => errs.push(String(e)));

/* Each pass gets a fresh page. The first version reused one and stubbed
   window.update out to freeze the poster; the clip pass then restored `update`
   from the global it had already replaced, so the recording ran for three
   seconds with the simulation frozen on the wide aim camera. Every frame of
   that clip was the market sitting still. */
async function fresh(){
  await pg.goto('file://' + GAME);
  await pg.waitForTimeout(800);
  await pg.evaluate(() => {
    // a cover is the game, not the furniture
    for (const id of ['hint', 'back', 'mute', 'menu', 'brief', 'results', 'finale']){
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    window.drawHUD = () => {};
    G.unlocked = 21;
    startLevel(20);
    beginLevel();
    aim.active = true; aim.x = ANCHOR.x - MAX_PULL; aim.y = ANCHOR.y + 40;
    aimCar(); camSnap();
  });
}

/* The poster, frozen mid-plough. Taken at the end of the recording instead it
   caught whatever the game had moved on to — which turned out to be a replay,
   letterboxed, with its caption running off a 480px frame. */
await fresh();
const poster = await pg.evaluate(() => new Promise((res) => {
  car.x = ANCHOR.x - MAX_PULL; car.y = ANCHOR.y + 40;
  launch(-MAX_PULL, 40);
  let n = 0;
  const f = () => {
    if (++n < 46 && G.phase === 'drive') return requestAnimationFrame(f);
    window.update = () => {};
    draw();
    setTimeout(() => res({ frames: n, phase: G.phase, kills: G.runKills }), 40);
  };
  requestAnimationFrame(f);
}));
const shot = await pg.screenshot({ type: 'png' });
await sharp(shot).resize(W, H).webp({ quality: 74 }).toFile(path.join(OUT, 'cover.webp'));

// the clip, on a page that has never been frozen
await fresh();
const clip = await pg.evaluate(({ secs, bitrate }) => new Promise((res) => {
  const cv = document.getElementById('c');
  const rec = new MediaRecorder(cv.captureStream(30), {
    mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: bitrate,
  });
  // a hover clip is the market being flattened, not the replay afterwards
  const guard = setInterval(() => { if (G.phase === 'replay') skipReplay(); }, 60);
  const parts = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  rec.onstop = async () => {
    clearInterval(guard);
    const buf = await new Blob(parts, { type: 'video/webm' }).arrayBuffer();
    let s = '';
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < u8.length; i += 0x8000){
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    res({ b64: btoa(s), bytes: u8.length, phase: G.phase, kills: G.runKills });
  };
  rec.start();
  // a beat on the pulled-back sling, then let it go
  setTimeout(() => { launch(-MAX_PULL, 40); }, 300);
  setTimeout(() => rec.stop(), secs * 1000);
}), { secs: SECONDS, bitrate: BITRATE });

fs.writeFileSync(path.join(OUT, 'cover.webm'), Buffer.from(clip.b64, 'base64'));

const size = (f) => fs.statSync(path.join(OUT, f)).size;
console.log('cover.webp ' + size('cover.webp') + ' bytes — poster frozen at frame ' +
  poster.frames + ' with ' + poster.kills + ' down');
console.log('cover.webm ' + size('cover.webm') + ' bytes — clip ran to ' + clip.phase +
  ' with ' + clip.kills + ' down');
console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no page errors');
await b.close();
