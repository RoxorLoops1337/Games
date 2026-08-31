/* ============================================================================
   cardsheet.mjs — photograph FROSTFELL's cards, and only the cards.

     node tools/frostfell/cardsheet.mjs                  # → /tmp/frostfell-cards
     node tools/frostfell/cardsheet.mjs --out DIR
     node tools/frostfell/cardsheet.mjs --scale 3        # bigger pixels to judge

   `shots.mjs` walks the game and photographs screens; a card is 126x168 units
   inside those, which is too small to judge a bevel by. This draws the cast
   straight onto a bare canvas through the game's own `drawCard`, at the three
   sizes a card is actually seen at — hand, reward, and the fold-size cover
   where the text drops out — so a change to the card face can be looked at
   rather than argued about.

   Nothing here is a test. It leaves PNGs; a person (or an agent with eyes)
   decides whether they are any good.
   ========================================================================== */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const GAME = join(REPO, 'frostfell', 'index.html');

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const OUT = arg('out', '/tmp/frostfell-cards');
const SCALE = Number(arg('scale', 3));

mkdirSync(OUT, { recursive: true });

/* Find the preinstalled Chromium rather than downloading one — same lookup
   `shots.mjs` uses, and for the same reason: this container has browsers under
   /opt/pw-browsers and no network to fetch another. */
function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root).filter((d) => d.startsWith('chromium') && !d.includes('headless_shell'));
  for (const d of dirs.sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = join(root, d, rel);
      if (existsSync(p)) return p;
    }
  }
  const direct = join(root, 'chromium');
  return existsSync(direct) ? direct : undefined;
}

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(pathToFileURL(GAME).href, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.FF, null, { timeout: 20000 });
// the fonts the card face uses have to be loaded or every measurement is wrong
await page.evaluate(() => document.fonts.ready);

/* One sheet = one size. Cards are laid out in a grid on a canvas the tool
   builds itself, on the game's own backdrop colour so the contrast being
   judged is the contrast a player sees. */
async function sheet(name, ids, cardW, cols, opts) {
  opts = opts || {};
  const shot = await page.evaluate(async ({ ids, cardW, cols, SCALE, opts }) => {
    const FF = window.FF;
    const CARD_RATIO = 168 / 126;
    const w = cardW, h = Math.round(cardW * CARD_RATIO);
    const pad = Math.round(cardW * 0.16);
    const rows = Math.ceil(ids.length / cols);
    const labelH = 22;
    const W = cols * w + (cols + 1) * pad;
    const H = rows * (h + labelH) + (rows + 1) * pad;
    const cv = document.createElement('canvas');
    cv.width = W * SCALE; cv.height = H * SCALE;
    const c = cv.getContext('2d');
    c.scale(SCALE, SCALE);
    // the game's own ground, so nothing is judged against white
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1526');
    bg.addColorStop(1, '#16233b');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);

    ids.forEach((spec, i) => {
      const id = typeof spec === 'string' ? spec : spec.id;
      const card = FF.mkCard(id);
      if (typeof spec === 'object') Object.assign(card, spec.set || {});
      const cx = pad + (i % cols) * (w + pad);
      const cy = pad + Math.floor(i / cols) * (h + labelH + pad);
      FF.drawCard(c, card, cx, cy, w, h, { t: opts.t || 0 });
      c.save();
      c.fillStyle = '#7f9bc0';
      c.font = '12px ui-monospace, monospace';
      c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(id, cx + w / 2, cy + h + 5);
      c.restore();
    });
    return cv.toDataURL('image/png');
  }, { ids, cardW, cols, SCALE, opts });
  const file = join(OUT, name + '.png');
  writeFileSync(file, Buffer.from(shot.split(',')[1], 'base64'));
  console.log('  ' + file);
  return file;
}

/* A representative cast rather than all of them: one of each tribe, both
   rarities that change the frame, a leader, gear, a charm, and the long names
   that were breaking the band. */
const CAST = await page.evaluate(() => {
  const FF = window.FF;
  const all = Object.keys(FF.CARDS);
  const by = (f) => all.filter((id) => f(FF.CARDS[id]));
  const take = (list, n) => list.slice(0, n);
  return {
    leaders: by((d) => d.leader),
    units: take(by((d) => d.type === 'unit' && !d.leader), 40),
    gear: take(by((d) => d.type !== 'unit'), 20),
    rare: take(by((d) => (d.rare || 1) >= 3), 12),
    uncommon: take(by((d) => (d.rare || 1) === 2), 12),
    longest: all.slice().sort((a, b) => FF.CARDS[b].name.length - FF.CARDS[a].name.length).slice(0, 8),
  };
});

console.log('card sheets →', OUT);
await sheet('01-hand-units', CAST.units.slice(0, 12), 126, 6);
await sheet('02-hand-units-b', CAST.units.slice(12, 24), 126, 6);
await sheet('03-leaders', CAST.leaders, 126, 6);
await sheet('04-gear', CAST.gear.slice(0, 12), 126, 6);
await sheet('05-rarity', CAST.uncommon.slice(0, 6).concat(CAST.rare.slice(0, 6)), 126, 6);
await sheet('06-long-names', CAST.longest, 126, 4);
await sheet('07-reward-size', CAST.units.slice(0, 4).concat(CAST.gear.slice(0, 2)), 172, 3);
await sheet('08-fold-size', CAST.units.slice(0, 8), 64, 8);
await sheet('09-big', CAST.units.slice(0, 3).concat(CAST.gear.slice(0, 1)), 300, 4);

if (errs.length) { console.log('PAGE ERRORS:'); errs.forEach((e) => console.log('  ' + e)); }
await browser.close();
console.log(errs.length ? 'done (with page errors)' : 'done');
