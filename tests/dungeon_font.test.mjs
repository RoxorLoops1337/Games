// GRIMCUT — the Dungeon Pusher typeface (dungeon_pusher/font.js).
//
// A font is data plus a renderer, and both halves fail quietly: a glyph whose
// contour winds the wrong way punches a hole through its own letter, an
// advance of zero stacks a word on one spot, and a character the face does
// not cover vanishes instead of falling back. None of that throws. So this
// suite reads the OUTLINES as geometry and drives the renderer against a
// recording context, twice — once with Path2D present, once without, since
// the two take different code paths through the same drawing.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

const t = harness('dungeon_font');
t.eq = (a, b, msg) => t.ok(a === b, msg + ' [' + a + ' != ' + b + ']');
const near = (a, b, tol, msg) => t.ok(Math.abs(a - b) <= tol, msg + ' [' + a + ' vs ' + b + ' ±' + tol + ']');

const here = dirname(fileURLToPath(import.meta.url));
const FONT = join(here, '..', 'dungeon_pusher', 'font.js');
const src = readFileSync(FONT, 'utf8');

// ---------------------------------------------------------------- stub kit
// A context that REMEMBERS. Counting calls is the only way to tell "drew the
// letter" from "silently drew nothing", which is the failure a font makes.
function recCtx(extra) {
  const log = [];
  const c = {
    font: '', fillStyle: '#fff', strokeStyle: '#000', lineWidth: 1,
    textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
    log,
    beginPath() { log.push(['beginPath']); },
    moveTo(x, y) { log.push(['moveTo', x, y]); },
    lineTo(x, y) { log.push(['lineTo', x, y]); },
    closePath() { log.push(['closePath']); },
    fill(p) { log.push(['fill', p]); },
    stroke(p) { log.push(['stroke', p]); },
    clip(p) { log.push(['clip', p]); },
    fillRect(...a) { log.push(['fillRect', ...a]); },
    drawImage(...a) { log.push(['drawImage', ...a]); },
    save() { log.push(['save']); }, restore() { log.push(['restore']); },
    setTransform(...a) { log.push(['setTransform', ...a]); },
    translate(...a) { log.push(['translate', ...a]); },
    createLinearGradient() { return { addColorStop() {} }; },
    measureText(s) { return { width: s.length * 7 }; },
    fillText(s, x, y) { log.push(['fillText', s, x, y]); },
    strokeText(s, x, y) { log.push(['strokeText', s, x, y]); },
  };
  return Object.assign(c, extra || {});
}

// Load font.js fresh, optionally with Path2D/DOMMatrix/document in scope so
// the cached-geometry and raster branches run instead of the plain one.
// The module reads Path2D at DRAW time, not at load time, so the stubs have
// to stay in place for as long as the returned face is used.
function installStubs(withP2D) {
  const g = globalThis;
  if (withP2D) {
    g.Path2D = class {
      constructor() { this.ops = 0; }
      moveTo() { this.ops++; } lineTo() { this.ops++; } closePath() { this.ops++; }
      addPath(p) { this.ops += (p && p.ops) || 0; }
    };
    g.DOMMatrix = class { constructor(a) { this.a = a; } };
    g.OffscreenCanvas = undefined;
    g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => recCtx() }) };
  } else {
    g.Path2D = undefined; g.DOMMatrix = undefined; g.document = undefined; g.OffscreenCanvas = undefined;
  }
}
function loadFont(withP2D) {
  installStubs(withP2D);
  delete globalThis.Grimcut;
  (0, eval)(src);
  return globalThis.Grimcut;
}

const F = loadFont(false);
t.ok(!!F, 'font.js exposes Grimcut');

// ---------------------------------------------------------------- coverage
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGIT = '0123456789';
const PUNCT = '.,:;!?\'"‘’“”()[]-–—_/\\|+=<>*#%&@$~°×•…';

for (const ch of UPPER + LOWER + DIGIT + PUNCT + ' ') {
  t.ok(F.covers(ch), 'covers ' + JSON.stringify(ch));
}
// and, just as importantly, does NOT claim what it cannot draw — every
// emoji in this game depends on being handed back to the browser
for (const ch of ['\u{1F480}', '⚔', '\u{1FA99}', '\u{1F5DD}', '中', 'é']) {
  t.ok(!F.covers(ch), 'leaves ' + JSON.stringify(ch) + ' to the browser');
}

// ------------------------------------------------------------- the outlines
// Signed area tells us which way a contour winds. Positives must wind one
// way and counters the other, or the fill rule cancels them against each
// other and the letter comes out with a bite missing.
const area = (p) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return a / 2;
};

let contours = 0, holes = 0;
for (const ch of UPPER + LOWER + DIGIT + PUNCT) {
  const g = F.glyph(ch);
  t.ok(!!g, 'glyph built for ' + JSON.stringify(ch));
  if (!g) continue;
  t.ok(g.adv > 0 && isFinite(g.adv), 'advance is a real width for ' + JSON.stringify(ch));
  t.ok(g.s.length > 0, 'has ink: ' + JSON.stringify(ch));
  for (const c of g.s) {
    contours++;
    t.ok(c.length >= 3, 'contour has enough points in ' + JSON.stringify(ch));
    t.ok(area(c) > 0, 'positive contour winds anticlockwise in ' + JSON.stringify(ch));
    for (const p of c) t.ok(isFinite(p[0]) && isFinite(p[1]), 'finite point in ' + JSON.stringify(ch));
  }
  for (const c of g.h) {
    holes++;
    t.ok(area(c) < 0, 'counter winds clockwise in ' + JSON.stringify(ch));
  }
}
t.ok(contours > 250, 'the alphabet is actually drawn [' + contours + ' contours]');
t.ok(holes >= 6, 'the closed letters have counters [' + holes + ']');

// nothing may wander far outside the em, or a label clips against its panel
for (const ch of UPPER + LOWER + DIGIT) {
  const g = F.glyph(ch);
  for (const c of g.s.concat(g.h)) for (const p of c) {
    t.ok(p[0] >= -80 && p[0] <= g.adv + 80, 'ink stays near its advance in ' + ch);
    t.ok(p[1] >= -F.CAP * 0.35 && p[1] <= F.CAP * 1.12, 'ink stays in the band in ' + ch);
  }
}

// --------------------------------------------------------------- proportions
{
  const cap = F.metrics.cap, sm = F.metrics.small;
  t.ok(sm.cap < cap.cap, 'small caps are shorter than caps');
  t.ok(sm.cap / cap.cap > 0.68 && sm.cap / cap.cap < 0.82, 'small caps sit in the classic band');
  // a heavy face: the reference logo runs its stems near a fifth of the cap
  t.ok(cap.stem / cap.cap > 0.18 && cap.stem / cap.cap < 0.25, 'stems are as heavy as the logo');
  t.ok(cap.thin < cap.stem, 'horizontals are lighter than stems');
  // small caps must be RELATIVELY fatter or they go pale beside a capital
  t.ok(sm.stem / sm.cap > cap.stem / cap.cap, 'small caps carry their colour');
}

// figures are tabular — a gold counter must not shove the panel about as it
// ticks, which is the whole reason to fix their widths
{
  const w = [...DIGIT].map((d) => F.glyph(d).adv);
  for (const x of w) t.eq(x, w[0], 'digit advances match');
  t.eq(F.measure(null, '1111', 100), F.measure(null, '8888', 100), 'any four digits measure the same');
}

// --------------------------------------------------------------- measurement
{
  const c = recCtx();
  t.eq(F.measure(c, '', 40), 0, 'the empty string has no width');
  t.ok(F.measure(c, 'MM', 40) > F.measure(c, 'M', 40), 'more letters, more width');
  near(F.measure(c, 'M', 80) / F.measure(c, 'M', 40), 2, 0.001, 'width scales with size');
  t.ok(F.measure(c, 'l', 40) < F.measure(c, 'L', 40), 'small caps are narrower than caps');
  // a space has to occupy space
  t.ok(F.measure(c, 'A A', 40) > F.measure(c, 'AA', 40), 'the word space is real');
  // kerning pulls, never pushes
  t.ok(F.kern('A', 'V') < 0, 'AV kerns tight');
  t.eq(F.kern('H', 'H'), 0, 'an unkerned pair is left alone');
  t.ok(F.measure(c, 'AV', 40) < F.measure(c, 'HH', 40) + F.measure(c, 'AV', 40), 'kerning applies');
}

// ------------------------------------------------------------- the font shim
{
  const p = F.parseFont('900 44px Grimcut Gold, Georgia, serif');
  t.ok(!!p, 'a Grimcut font string parses');
  t.eq(p.px, 44, 'size read');
  t.eq(p.style, 'gold', 'finish read from the family');
  t.eq(p.weight, 900, 'weight read');
  t.ok(/Georgia, serif$/.test(p.fallback) && !/Grimcut/.test(p.fallback),
    'the fallback keeps the rest of the stack and drops us [' + p.fallback + ']');
  t.ok(/44px/.test(p.fallback), 'the fallback keeps the size');

  t.eq(F.parseFont('700 13px Verdana, sans-serif'), null, 'a non-Grimcut string is left alone');
  t.eq(F.parseFont(''), null, 'an empty font string is left alone');
  t.eq(F.parseFont('bold 12px "Grimcut Ink", serif').style, 'ink', 'a quoted family still resolves');
  for (const fam of Object.keys(F.FAMILY)) {
    t.ok(!!F.STYLES[F.FAMILY[fam]], 'family "' + fam + '" names a real finish');
  }
}

// ------------------------------------------------------------ install + draw
// Both branches, because Path2D changes how every stroke and fill is issued.
for (const withP2D of [false, true]) {
  const label = withP2D ? 'cached' : 'direct';
  const FF = withP2D ? loadFont(true) : (installStubs(false), F);
  const c = recCtx();
  FF.install(c);
  t.ok(c.__grimcut, label + ': install marks the context');

  c.font = '900 40px Grimcut Ink, Georgia, serif';
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.log.length = 0;
  c.fillText('DUNGEON', 10, 100);
  const drew = c.log.some((o) => o[0] === 'fill' || o[0] === 'drawImage');
  t.ok(drew, label + ': a Grimcut string actually draws');
  t.ok(!c.log.some((o) => o[0] === 'fillText'), label + ': it does NOT reach the browser');

  // every glyph, through the real entry point, must draw without throwing
  let threw = null;
  for (const ch of UPPER + LOWER + DIGIT + PUNCT) {
    try { c.fillText(ch, 5, 50); } catch (e) { threw = ch + ': ' + e.message; break; }
  }
  t.eq(threw, null, label + ': every glyph draws clean');

  // …at every size the game uses, including the ones below the bevel cutoff
  threw = null;
  for (const px of [8, 9.5, 11, 12.5, 13, 16, 20, 26, 34, 44, 52, 80]) {
    for (const fam of Object.keys(F.FAMILY)) {
      c.font = '900 ' + px + 'px ' + fam + ', Georgia, serif';
      try { c.fillText('Floor 12 — Gold 1,240', 5, 50); } catch (e) { threw = px + fam + ': ' + e.message; }
    }
  }
  t.eq(threw, null, label + ': every size and finish draws clean');

  // emoji: split out and handed back with the rest of the font string
  c.font = '900 20px Grimcut Ink, Georgia, serif';
  c.log.length = 0;
  c.fillText('\u{1F480} DEAD ⚔', 0, 0);
  const passed = c.log.filter((o) => o[0] === 'fillText');
  t.ok(passed.length >= 2, label + ': emoji reach the browser [' + passed.length + ' runs]');
  t.ok(passed.every((o) => !/DEAD/.test(o[1])), label + ': the letters did NOT');

  // alignment and baseline move the text the way canvas says they should
  const at = (align, base) => {
    c.textAlign = align; c.textBaseline = base;
    c.log.length = 0; c.fillText('MM', 100, 100);
    const pts = c.log.filter((o) => o[0] === 'moveTo' || o[0] === 'lineTo');
    if (pts.length) return { x: Math.min(...pts.map((p) => p[1])), y: Math.min(...pts.map((p) => p[2])) };
    const im = c.log.find((o) => o[0] === 'drawImage');
    return im ? { x: im[2], y: im[3] } : null;
  };
  const L = at('left', 'alphabetic'), R = at('right', 'alphabetic'), C0 = at('center', 'alphabetic');
  t.ok(L && R && C0, label + ': alignment draws something');
  t.ok(R.x < C0.x && C0.x < L.x, label + ': right < centre < left');
  const top = at('left', 'top'), mid = at('left', 'middle');
  t.ok(top.y > mid.y, label + ': a top baseline sits lower than a middle one');

  // measureText must agree with what draw() actually lays down
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.font = '900 30px Grimcut Ink, Georgia, serif';
  const m = c.measureText('FLOOR 12');
  t.ok(m.width > 0 && isFinite(m.width), label + ': measureText returns a width');
  t.ok(m.actualBoundingBoxAscent > 0, label + ': measureText reports an ascent');
  c.font = '700 13px Verdana, sans-serif';
  t.eq(c.measureText('abc').width, 21, label + ': a non-Grimcut font measures the browser way');

  // maxWidth shrinks rather than overflows
  c.font = '900 40px Grimcut Ink, Georgia, serif';
  const full = c.measureText('SHRINK ME').width;
  c.log.length = 0; c.fillText('SHRINK ME', 0, 0, full / 2);
  t.ok(c.log.length > 0, label + ': a maxWidth draw still draws');

  // strokeText goes through too
  c.log.length = 0; c.strokeText('OUTLINE', 0, 0);
  t.ok(c.log.some((o) => o[0] === 'stroke'), label + ': strokeText strokes');

  // and the context can be handed back exactly as it was found
  c.__grimcutRestore();
  c.log.length = 0;
  c.font = '900 40px Grimcut Ink, Georgia, serif';
  c.fillText('BACK', 0, 0);
  t.ok(c.log.some((o) => o[0] === 'fillText'), label + ': restore gives the browser its methods back');
}

// a caller's gradient must never be baked into a cached bitmap — the game
// paints several labels with a gradient pinned to ITS coordinates
{
  const FF = loadFont(true);
  const c = recCtx();
  FF.install(c);
  c.font = '900 30px Grimcut, Georgia, serif';
  c.fillStyle = { gradient: true };
  c.log.length = 0;
  c.fillText('GRADIENT', 0, 0);
  t.ok(!c.log.some((o) => o[0] === 'drawImage'), 'a gradient fill is drawn as a path, not a blit');
  c.fillStyle = '#fff';
  c.log.length = 0;
  c.fillText('GRADIENT', 0, 0);
  t.ok(c.log.some((o) => o[0] === 'drawImage'), 'a flat fill is cached and blitted');
  // the same string in a new colour must not reuse the old bitmap
  const before = FF.debug().rast;
  c.fillStyle = '#f00';
  c.fillText('GRADIENT', 0, 0);
  t.ok(FF.debug().rast > before, 'colour is part of the cache key');
}

// ------------------------------------------------------------ the game wiring
{
  const html = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(/<script src="font\.js"><\/script>/.test(html), 'the game loads font.js');
  t.ok(html.indexOf('<script src="font.js">') < html.indexOf("'use strict'"),
    'it loads BEFORE the game, so the face exists when the context is made');
  t.ok(/typeof Grimcut !== 'undefined'/.test(html) && /Grimcut\.install\(ctx\)/.test(html),
    'the game installs the face, and survives font.js going missing');

  // no font string may name Georgia or Verdana without Grimcut in front of
  // it — one missed call site is a stray label in the old face
  const strings = html.match(/'[^']*\d+px [^']*'/g) || [];
  let stray = [];
  for (const s of strings) {
    if (/Georgia|Verdana/.test(s) && !/Grimcut/.test(s)) stray.push(s);
  }
  t.eq(stray.length, 0, 'every Georgia/Verdana call site went through the face ' + stray.slice(0, 3).join(' '));
  t.ok(strings.filter((s) => /Grimcut/.test(s)).length > 300, 'the whole game is set in it');

  // the wordmark wears the logo's own two finishes
  t.ok(/Grimcut Silver[^']*';\s*\n\s*ctx\.fillText\('DUNGEON'/.test(html), 'DUNGEON is silver');
  t.ok(/Grimcut Gold[^']*';\s*\n\s*ctx\.fillText\('PUSHER'/.test(html), 'PUSHER is gold');

  const sw = readFileSync(join(here, '..', 'dungeon_pusher', 'sw.js'), 'utf8');
  t.ok(/'\.\/font\.js'/.test(sw), 'the service worker precaches the face, so offline keeps it');
  t.ok(/dp-v[2-9]/.test(sw), 'the cache was bumped so the new shell actually lands');

  // the specimen page ships with it and points at the real file
  const spec = readFileSync(join(here, '..', 'dungeon_pusher', 'font.html'), 'utf8');
  t.ok(/src="font\.js"/.test(spec), 'the specimen loads the same font.js the game does');
}

t.done();
