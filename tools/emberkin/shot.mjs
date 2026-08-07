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
//   node tools/emberkin/shot.mjs --film evolve 9 450 # a scene as it plays, tiled
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
  // A wild pair, which pass 38 added and nobody has ever looked at.
  pair: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'stillmere';
      EK.startBattle({ foe: EK.mkMon('dewdrip', 12), wild: true, pair: EK.mkMon('zaplet', 12) });
    },
  },
  // A trainer duel: two bodies, a bench, and a plan.
  duel: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      EK.startBattle({
        foe: EK.mkMon('pebblet', 12), wild: false,
        team: [['pebblet', 12], ['frillamb', 12]],
        npc: { id: 'shot', name: 'Dorn', trainer: { prize: 300, plan: ['sharpen', 'swing', 'brace', 'swing'] } },
      });
    },
  },
  // The three payoff screens, each held at the frame worth looking at.
  evolve: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      const m = EK.G.party[0];
      EK.G.evoAnim = { mon: m, from: m.species, to: EK.DEX[m.species].evo[0],
        beats: [['hold', .5], ['build', .9], ['burst', .5], ['settle', .6], ['quiet', .7]],
        i: 2, t: .22, swapped: false, res: null };
    },
  },
  // The throw itself, end to end: out of the hand, the suck, the fall, three
  // wobbles with dead air between them, and the click. Film this one.
  catching: {
    w: 300, h: 260,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      EK.startBattle({ foe: EK.mkMon('dewdrip', 6), wild: true });
      EK.G.wipe = 0;
      const b = EK.B();
      b.foe.hp = Math.max(1, Math.round(b.foe.max * .12));   // softened up, as you would
      EK.G.bag.bloomorb = 5;
      EK.G.battleMsg = null;      // the intro line holds the screen until dismissed
      // doAction only builds the log; submitLog is what plays it back, and the
      // orb animation lives in the playback. Filming the return value of
      // doAction films two kin standing still, which is what the first attempt
      // at this scene recorded.
      EK.submitLog(EK.doAction({ kind: 'item', id: 'bloomorb', target: 'foe' }));
    },
  },
  gotcha: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      EK.G.gotcha = { t: .9, species: 'mistspray', name: 'Mistspray',
        where: 'joined your party', done: () => { EK.G.gotcha = null; } };
    },
  },
  reward: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      EK.openScreen('reward', { offer: ['reaper', 'bulwark', 'warcry'], done: () => {} });
    },
  },
  // A long screen, to check that centring short ones did not break tall ones.
  deck: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      EK.openScreen('deck');
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

// `--film <scene> [frames] [ms]` captures a scene as it actually plays and tiles
// the frames into one picture.
//
// This exists because a frozen frame lies about anything keyed to the clock.
// Stepping the evolution animation by hand made its light-wheel look painted on;
// it turns, and accelerates as the beat builds, and none of that is visible if
// you drive the animation's own timer while holding G.t still. If a beat has a
// timeline, film it.
const FILM = process.argv[2] === '--film';
const want = FILM ? process.argv[3] : process.argv[2];
const out = FILM ? null : process.argv[3];
const FRAMES = FILM ? Number(process.argv[4] || 9) : 0;
const EVERY = FILM ? Number(process.argv[5] || 450) : 0;
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
    // A still wants the entry animation over; a film wants to start at the
    // trigger, or the beat it came to record has already finished.
    await page.waitForTimeout(FILM ? 60 : 1200);
  }
  const file = out || `/tmp/emberkin_${name}${FILM ? '_film' : ''}.png`;
  if (FILM) {
    const shots = [];
    for (let i = 0; i < FRAMES; i++) {
      await page.waitForTimeout(EVERY);
      shots.push(await page.evaluate(() => {
        const c = document.getElementById('view');
        const cv = document.createElement('canvas');
        cv.width = c.width; cv.height = c.height;
        cv.getContext('2d').drawImage(c, 0, 0);
        return cv.toDataURL();
      }));
    }
    const strip = await browser.newPage({ viewport: { width: 788, height: 220 * Math.ceil(shots.length / 3) } });
    await strip.setContent(`<body style="margin:0;background:#0a070e;display:grid;`
      + `grid-template-columns:repeat(3,256px);gap:4px">`
      + shots.map((u, i) => `<div style="position:relative"><img src="${u}" width="256">`
        + `<span style="position:absolute;left:4px;top:2px;color:#ffc94d;`
        + `font:11px monospace">${i}</span></div>`).join('') + '</body>');
    await strip.screenshot({ path: file });
    await strip.close();
  } else {
    await page.screenshot({ path: file });
  }
  const where = await page.evaluate(() => (window.EK ? `${EK.G.mode}/${EK.G.mapId}` : '?'));
  console.log(`${name.padEnd(10)} ${where.padEnd(22)} ${file}`);
  await page.close();
}
await browser.close();
