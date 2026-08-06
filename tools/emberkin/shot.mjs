// EMBERKIN — look at it.
//
// The playthrough probe answers "is this any good to play". This answers "is
// this any good to look at", and it exists because the two questions have
// nothing to do with each other. The dead margin around every interior map —
// most rooms are smaller than the viewport, and the surround was a flat fill —
// was invisible in the source and obvious the first time anybody took a picture.
//
//   node tools/emberkin/shot.mjs                    # every scene, into /tmp
//   node tools/emberkin/shot.mjs battle out.png     # one scene, somewhere
//
// Scenes: title, study, town, battle, legendary.
//
// Chromium is pre-installed at /opt/pw-browsers/chromium in this environment.
// playwright-core is a dependency of the repo rather than of this script.
import pw from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { chromium } = pw;
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GAME = `file://${join(REPO, 'emberkin', 'index.html')}`;
const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium';

/** Each scene says how big to shoot it and how to get the game into that state. */
const SCENES = {
  title: { w: 900, h: 800, go: null },
  study: { w: 700, h: 620, go: (EK) => { EK.G.dialogue = null; EK.G.mode = 'world'; } },
  town: {
    w: 700, h: 620,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.enterMap('hollowbrook', 12, 10, 'down');
      EK.G.mode = 'world';
    },
  },
  battle: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'emberwood';
      EK.startBattle({ foe: EK.mkMon('kindlark', 12), wild: true });
    },
  },
  legendary: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'crown_hollow';
      EK.startBattle({ foe: EK.mkMon('vespyr', 26), wild: true, legendary: true });
    },
  },
};

const want = process.argv[2];
const out = process.argv[3];
const list = want ? [want] : Object.keys(SCENES);
if (want && !SCENES[want]) {
  console.error(`no scene "${want}". try: ${Object.keys(SCENES).join(', ')}`);
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: EXE });
for (const name of list) {
  const sc = SCENES[name];
  const page = await browser.newPage({
    viewport: { width: sc.w, height: sc.h },
    deviceScaleFactor: 2,                       // the art is 1x pixels; shoot it at 2x
  });
  await page.goto(GAME);
  await page.waitForTimeout(900);
  if (sc.go) {
    // Past the title the same way a player gets past it, then straight to the
    // state we want rather than walking there.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button,.btn')].find((e) => /journey/i.test(e.textContent));
      if (b) b.click();
    });
    await page.waitForTimeout(700);
    await page.evaluate(`(${sc.go.toString()})(window.EK)`);
    await page.waitForTimeout(1200);            // let the entry animation settle
  }
  const file = out || `/tmp/emberkin_${name}.png`;
  await page.screenshot({ path: file });
  const where = await page.evaluate(() => (window.EK ? `${EK.G.mode}/${EK.G.mapId}` : '?'));
  console.log(`${name.padEnd(10)} ${where.padEnd(22)} ${file}`);
  await page.close();
}
await browser.close();
