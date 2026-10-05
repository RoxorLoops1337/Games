#!/usr/bin/env node
// Records the games-index cover for Hocus Vocus: hocus_vocus/cover.webp (480x270 poster) and hocus_vocus/cover.webm (a short looping hover clip).
//
//   node tools/hocus_vocus/cover.mjs                   writes both files into hocus_vocus/ (the lead runs this once per art change, nobody hand-edits them)
//   node tools/hocus_vocus/cover.mjs --out DIR         writes them into DIR instead (a scratch folder, to look at the result first)
//   node tools/hocus_vocus/cover.mjs --out DIR --poster-only     the poster and a contact sheet of the clip's key frames, no video (fast, for iterating on the look)
//   node tools/hocus_vocus/cover.mjs --out DIR --sheet           the full run, plus clip_sheet.png (every 4th frame of the clip) in DIR
//   node tools/hocus_vocus/cover.mjs --out DIR --dump            the full run, plus every frame of the clip as DIR/frames/NNN.png
//
// THE POSTER (HV_ART_AUDIO 9.3, unit A10) is the title screen as a promotional still: the HOCUS VOCUS logo with its cherry blossom O, its microphone
// O and the wand-and-star behind it, the tagline under it (enlarged a little so it reads at 480x270), the candy stage with its red curtains, and
// Jasmin and RoxorLoops in the middle in their stage clothes. It is the game's own title, framed tight on the logo, the stage and the duo (the tap
// prompt, the fullscreen button and the footer are hidden) and given a little lift in the shadows and the colour so it holds up beside the other
// covers on the index.
//
// THE CLIP is the same three beats the game opens with, joined by short cross-fades so it loops without a jump:
//   1. the title, 1.5 s, with the logo shimmer running;
//   2. a fight on the Blossom Bay promenade: Jasmin and RoxorLoops against the Fussy Foghorn. Jasmin's Blossom Pop lands, then RoxorLoops's
//      Drop the Beat lands (the beat burst), with the hand dealt in front of them;
//   3. the map: the fog is muted and a chain of five hexes is unmuted in one tap, each hex blooming and ringing in turn.
// There is no ffmpeg here, so the clip is built in the browser: the game is driven on its own virtual clock (GAME.debug.tick), one screenshot per
// frame, and the frames are replayed onto a canvas that a MediaRecorder captures. The result is the same every run. Needs sharp, playwright-core
// and a Chromium (CHROMIUM_PATH, or /opt/pw-browsers/chromium). Rerun it after anything that changes how the title, combat or map look.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const argOf = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const POSTER_ONLY = argv.includes('--poster-only');
const OUT = path.resolve(argOf('--out') || path.join(REPO, 'hocus_vocus'));
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(REPO, 'node_modules', 'playwright-core'));
const sharp = require(path.join(REPO, 'node_modules', 'sharp'));

const W = 480, H = 270;                 // what every cover on the index is
const FPS = 12, STEP = Math.round(1000 / FPS);
const BITRATE = 480000;
// Where each beat is cut from the 1280x720 stage (16:9 each, so a frame is a clean 2.0x to 2.7x downscale). Title: tight on the logo, the stage and
// the duo. Fight and map: nearly the whole screen, trimmed a little so the heroes, the foe and the cards stay big enough to read.
const CROP = {
  title: { left: 150, top: 22, width: 980, height: 551 },
  fight: { left: 40, top: 22, width: 1200, height: 675 },
  map: { left: 40, top: 22, width: 1200, height: 675 },
};
// A touch more light and colour than the screen has: the title is a night scene and the index is a wall of thumbnails, so the poster lifts its
// shadows (gamma) and its colour; the fight is already bright; the map keeps its own colours (its fog is nearly white and blows out if lifted).
const GRADE = {
  title: { gamma: 1.3, brightness: 1.04, saturation: 1.2 },
  fight: { gamma: 1, brightness: 1.02, saturation: 1.08 },
  map: { gamma: 1, brightness: 1, saturation: 1.05 },
};
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
pg.on('pageerror', (e) => errs.push(String(e)));
pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await pg.goto('file://' + path.join(REPO, 'hocus_vocus', 'index.html') + '?debug=1&notutorial=1');
await pg.waitForTimeout(700);
// a cover is the game, not the furniture: no tap prompt, no fullscreen button, no footer on the title
// (and the tagline a little larger, the map's hex info chip hidden: it is a paragraph of small print)
await pg.addStyleTag({ content: '.mn-gate-text,.mn-gate-sub,.mn-fs,.mn-foot,.mp-info{opacity:0 !important} .s-title .mn-tag{transform:scale(1.18);transform-origin:50% 0}' });
await pg.evaluate(() => GAME.debug.freeze(true));
const tick = (ms) => pg.evaluate((m) => GAME.debug.tick(m, 16), ms);
const grab = async (beat) => {
  const crop = CROP[beat], g = GRADE[beat];
  let img = sharp(await pg.screenshot({ type: 'png', clip: { x: crop.left, y: crop.top, width: crop.width, height: crop.height } })).resize(W, H, { kernel: 'lanczos3' });
  if (g.gamma !== 1) img = img.gamma(g.gamma);
  return img.modulate({ brightness: g.brightness, saturation: g.saturation }).sharpen({ sigma: 0.7, m1: 0.6, m2: 1.2 }).png().toBuffer();
};

const frames = [];
const seq = async (n, beat) => { for (let i = 0; i < n; i++) { await tick(STEP); frames.push(await grab(beat)); } };

// ------------------------------------------------------------------------------------------------ beat 1: the title (the poster)
await tick(1500);
const poster = await grab('title');
await sharp(poster).webp({ quality: 82, effort: 6 }).toFile(path.join(OUT, 'cover.webp'));

if (POSTER_ONLY) {
  // a contact sheet of the key frames of the other two beats, so the look can be checked without encoding anything
  await pg.evaluate(() => { GAME.debug.open('combat', { heroes: ['hanae', 'kuro'], enemies: ['kappa'], hand: ['hanae_blossom_burst', 'kuro_first_stroke', 'hanae_parry', 'kuro_ink_ward', 'hanae_slash'] }); });
  await tick(1800);
  const f1 = await grab('fight');
  await pg.evaluate(() => { const d = GAME.debug.combat(); if (d) d.play(0, 0); });
  await tick(420);
  const f2 = await grab('fight');
  await pg.evaluate(() => { GAME.debug.open('map', { painted: 0.3 }); });
  await tick(4800);
  const f3 = await grab('map');
  const sheet = await sharp({ create: { width: W * 2, height: H * 2, channels: 3, background: '#000' } })
    .composite([{ input: poster, left: 0, top: 0 }, { input: f1, left: W, top: 0 }, { input: f2, left: 0, top: H }, { input: f3, left: W, top: H }]).png().toFile(path.join(OUT, 'contact.png'));
  console.log('cover.webp ' + fs.statSync(path.join(OUT, 'cover.webp')).size + ' bytes');
  console.log('contact.png ' + sheet.size + ' bytes (poster, fight, hit, map)');
  console.log(errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(0);
}

// the title keeps moving (the logo shimmers, the petals fall): 1.5 s of it, the poster frame first
frames.push(poster);
await seq(Math.round(1.5 * FPS) - 1, 'title');

// ------------------------------------------------------------------------------------------------ beat 2: the fight
// resolves with the clock, so the open call is not awaited; the hand is set so the two attacks that land are the ones the clip is about
const fightFrom = frames.length;
await pg.evaluate(() => { GAME.debug.open('combat', { heroes: ['hanae', 'kuro'], enemies: ['kappa'], hand: ['hanae_blossom_burst', 'kuro_first_stroke', 'hanae_parry', 'kuro_ink_ward', 'hanae_slash'] }); });
await seq(8, 'fight');                                                                      // the hand finishes dealing in
const played = [];
for (const idx of [0, 0]) {                                                                     // Jasmin's Blossom Pop, then RoxorLoops's Drop the Beat (it slides into slot 0)
  played.push(await pg.evaluate((i) => { try { const d = GAME.debug.combat(); return d ? d.play(i, 0) !== false : false; } catch (e) { return String(e); } }, idx));
  await seq(idx === 0 ? 8 : 9, 'fight');
}
await seq(3, 'fight');

// ------------------------------------------------------------------------------------------------ beat 3: the map, a chain of hexes unmuted
const mapFrom = frames.length;
await pg.evaluate(() => { GAME.debug.open('map', { painted: 0.3 }); });
await tick(4800);                                                                               // the act banner and the opening swoop pass out of frame
const target = await pg.evaluate(() => {
  const R = UI.run, M = R.map, D = UI.screens.map.mapDebug;
  let best = null;
  Object.keys(M.tiles).forEach((k) => {                                                         // the muted hex five steps out that sits nearest the middle of the fog
    const t = M.tiles[k];
    if (t.painted || t.type === 'block') return;
    const pv = RUN.paintPreview(R, t.q, t.r);
    if (!pv || !pv.ok || !pv.affordable || pv.path.length !== 5) return;
    const p = D.screenOf(t.q, t.r);
    if (p.x < 760 || p.x > 1120 || p.y < 170 || p.y > 520) return;
    const d = Math.abs(p.x - 900) + Math.abs(p.y - 340);
    if (!best || d < best.d) best = { q: t.q, r: t.r, x: p.x, y: p.y, d };
  });
  return best;
});
frames.push(await grab('map'));
await seq(5, 'map');                                                                         // a beat of the live page first
if (target) {
  await pg.mouse.click(target.x, target.y);                                                     // the first tap previews the chain and its cost
  await seq(4, 'map');
  await pg.mouse.click(target.x, target.y);                                                     // the second paints it, hex by hex
}
await seq(18, 'map');

// ------------------------------------------------------------------------------------------------ cross-fades, so the clip loops without a jump
// three blended frames at each seam, made in node: title -> fight, fight -> map, and map -> title (the loop point)
const raw = (png) => sharp(png).removeAlpha().raw().toBuffer();
const mix = async (a, c, t) => {
  const [x, y] = await Promise.all([raw(a), raw(c)]);
  const out = Buffer.alloc(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.round(x[i] * (1 - t) + y[i] * t);
  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
};
const fade = (a, c) => Promise.all([0.25, 0.5, 0.75].map((t) => mix(a, c, t)));
const order = [].concat(
  frames.slice(0, fightFrom), await fade(frames[fightFrom - 1], frames[fightFrom]),
  frames.slice(fightFrom, mapFrom), await fade(frames[mapFrom - 1], frames[mapFrom]),
  frames.slice(mapFrom), await fade(frames[frames.length - 1], frames[0]));

if (argv.includes('--dump')) {                                                                   // every frame of the clip as frames/NNN.png in DIR, for looking at one closely
  fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
  order.forEach((f, i) => fs.writeFileSync(path.join(OUT, 'frames', String(i).padStart(3, '0') + '.png'), f));
}
if (argv.includes('--sheet')) {                                                                  // a contact sheet of the whole clip (every 4th frame), for looking at it
  const cols = 6, every = 4, pick = order.filter((_, i) => i % every === 0);
  const rows = Math.ceil(pick.length / cols), tw = Math.round(W * 0.6), th = Math.round(H * 0.6);
  const tiles = await Promise.all(pick.map(async (f, i) => ({ input: await sharp(f).resize(tw, th).png().toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * th })));
  await sharp({ create: { width: cols * tw, height: rows * th, channels: 3, background: '#000' } }).composite(tiles).png().toFile(path.join(OUT, 'clip_sheet.png'));
}

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
}), { list: order.map((f) => f.toString('base64')), w: W, h: H, fps: FPS, bitrate: BITRATE });

fs.writeFileSync(path.join(OUT, 'cover.webm'), Buffer.from(clip.b64, 'base64'));
const size = (f) => fs.statSync(path.join(OUT, f)).size;
console.log('cover.webp ' + size('cover.webp') + ' bytes');
console.log('cover.webm ' + size('cover.webm') + ' bytes, ' + order.length + ' frames at ' + FPS + ' fps; cards played: ' + played.join(',') + '; chain target: ' + (target ? target.q + ',' + target.r : 'none'));
console.log(errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : 'no page errors');
await b.close();
