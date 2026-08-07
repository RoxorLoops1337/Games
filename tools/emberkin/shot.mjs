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
//   node tools/emberkin/shot.mjs --size 390x760 title  # at somebody else's window
//
// `--size` matters because the stage picks an integer scale from the window and
// then lays the touch controls out around it, so a screen can be right at one
// size and broken at another — the title screen was composed at 900x800 and had
// never been seen at a phone's aspect, where a different scale applies.
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
  // AIR gives eight maps eight different lights — tint, grade, vignette, mote
  // count and drift. Three of the eight had ever been looked at. These are the
  // other five, each stood somewhere the map's own light has something to do:
  // by a window indoors, at the water, under the pass.
  wayhouse: {
    w: 700, h: 620,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.enterMap('wayhouse', 5, 5, 'up');
      EK.G.mode = 'world';
    },
  },
  shop: {
    w: 700, h: 620,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.enterMap('shop', 6, 5, 'up');
      EK.G.mode = 'world';
    },
  },
  route: {
    w: 700, h: 620,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.enterMap('route_one', 5, 7, 'down');
      EK.G.mode = 'world';
    },
  },
  shore: {
    w: 700, h: 620,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.enterMap('stillmere', 12, 7, 'right');   // at the sand, facing the water
      EK.G.mode = 'world';
    },
  },
  hollow: {
    w: 700, h: 620,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.enterMap('crown_hollow', 9, 7, 'up');
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
  // A trainer calling you out: the look, the frame closing in, the walk over.
  // Walked into rather than triggered, so the beat runs the way it does in play.
  sight: {
    w: 300, h: 260,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      EK.enterMap('route_one', 5, 20, 'up');
      // Stand in the first trainer's line of sight and let the game notice.
      const n = (EK.G.map.npcs || []).find((m) => m.trainer);
      if (n) {
        const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[n.dir] || [0, 1];
        EK.G.player.x = n.x + dx * 2; EK.G.player.y = n.y + dy * 2;
        EK.G.player.px = EK.G.player.x; EK.G.player.py = EK.G.player.y;
        EK.trainerSight();
      }
    },
  },
  // Something coming out of the tall grass: the step in, the trigger, the wipe,
  // the fight. Driven through the real step handler with the encounter rate
  // forced, so the beat runs exactly as it does in play. Film this one.
  grass: {
    w: 300, h: 260,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      EK.enterMap('route_one', 13, 11, 'down');
      EK.G.map.enc.rate = 1;                  // the next step into grass lands one
      // A tick later, not in the same one. Arriving in the same evaluate as
      // enterMap fires the beat before the camera has followed, and the whole
      // rustle then plays at the bottom edge of the frame, half clipped — which
      // read as "it is not drawing at all" for three films.
      setTimeout(() => EK.onArrive(), 140);
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
const argv = process.argv.slice(2);
let SIZE = null;
const si = argv.indexOf('--size');
if (si >= 0) {
  const m = /^(\d+)x(\d+)$/.exec(argv[si + 1] || '');
  if (!m) { console.error('--size wants WxH, e.g. 390x760'); process.exit(1); }
  SIZE = { w: Number(m[1]), h: Number(m[2]) };
  argv.splice(si, 2);
}

const STATS = argv.includes('--stats');
if (STATS) argv.splice(argv.indexOf('--stats'), 1);

const FILM = argv[0] === '--film';
const want = FILM ? argv[1] : argv[0];
const out = FILM ? null : argv[1];
const FRAMES = FILM ? Number(argv[2] || 9) : 0;
const EVERY = FILM ? Number(argv[3] || 450) : 0;
const list = want ? [want] : Object.keys(SCENES);
if (want && !SCENES[want]) {
  console.error(`no scene "${want}". try: ${Object.keys(SCENES).join(', ')}`);
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: EXE });
for (const name of list) {
  const sc = SCENES[name];
  const page = await browser.newPage({
    viewport: { width: SIZE ? SIZE.w : sc.w, height: SIZE ? SIZE.h : sc.h },
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
    // Dismiss the opening monologue the way a player does, before the scene
    // runs. Setting `G.dialogue = null` is NOT the same thing: the panel is a
    // DOM overlay hidden by `renderDialogue`, which only runs on a dialogue
    // event, so clearing the state from outside leaves the box on screen with
    // its last line still in it. Three shots of the shore came back with Elder
    // Rowan talking over the water, and the state print said no dialogue —
    // which is how it was found at all.
    await page.evaluate(() => {
      for (let i = 0; i < 40 && EK.G.dialogue; i++) {
        EK.G.dialogue.hold = 0;
        EK.advanceDialogue();
      }
    });
    await page.evaluate(`(${sc.go.toString()})(window.EK)`);
    // A still wants the entry animation over; a film wants to start at the
    // trigger, or the beat it came to record has already finished.
    await page.waitForTimeout(FILM ? 60 : 1200);
  }
  // `--stats` reads the frame back and reports what range it actually occupies.
  // Crown Hollow looked like fog and two plausible culprits — the AIR grade and
  // the map's hue push — each changed almost nothing when dialled back. Guessing
  // which of five stacked wash layers flattened a map does not work; measuring
  // the frame and comparing it against a map that reads well does.
  if (STATS) {
    const s = await page.evaluate(() => {
      const c = document.getElementById('view');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let lo = 255, hi = 0, sum = 0, n = 0, sat = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g2 = d[i + 1], b = d[i + 2];
        const l = .2126 * r + .7152 * g2 + .0722 * b;
        lo = Math.min(lo, l); hi = Math.max(hi, l); sum += l; n++;
        sat += (Math.max(r, g2, b) - Math.min(r, g2, b)) / 255;
      }
      const mean = sum / n;
      let vr = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
        vr += (l - mean) ** 2;
      }
      return { lo: lo | 0, hi: hi | 0, mean: mean | 0,
        sd: Math.sqrt(vr / n).toFixed(1), sat: (sat / n).toFixed(3) };
    });
    console.log(`${name.padEnd(10)} lum ${String(s.lo).padStart(3)}..${String(s.hi).padStart(3)}`
      + `  mean ${String(s.mean).padStart(3)}  sd ${String(s.sd).padStart(5)}  sat ${s.sat}`);
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
    // 384-wide tiles, not 256. At 1x the canvas the frames are legible as
    // composition and useless as detail: a rustle in the grass and a player
    // standing in it were both invisible in a strip, and the beat looked like
    // it was not drawing at all. It was. The picture was too small to show it.
    const COL = 384, ROWS = Math.ceil(shots.length / 3);
    const strip = await browser.newPage({
      viewport: { width: COL * 3 + 16, height: Math.round(COL * 208 / 256 + 8) * ROWS } });
    await strip.setContent(`<body style="margin:0;background:#0a070e;display:grid;`
      + `grid-template-columns:repeat(3,${COL}px);gap:4px;image-rendering:pixelated">`
      + shots.map((u, i) => `<div style="position:relative"><img src="${u}" width="${COL}">`
        + `<span style="position:absolute;left:4px;top:2px;color:#ffc94d;`
        + `font:13px monospace;text-shadow:0 1px 2px #000">${i}</span></div>`).join('') + '</body>');
    await strip.screenshot({ path: file });
    await strip.close();
  } else {
    await page.screenshot({ path: file });
  }
  // Say what is actually on screen, not just what was asked for. Two shots of
  // the shore were wasted on a starter dialogue the scene thought it had
  // cleared, and the picture is the only place that showed up.
  const where = await page.evaluate(() => {
    if (!window.EK) return '?';
    const over = [
      EK.G.dialogue && `dialogue:${EK.G.dialogue.who}`,
      EK.G.screen && `screen:${EK.G.screen.kind || EK.G.screen}`,
      EK.G.gotcha && 'gotcha', EK.G.evoAnim && 'evo',
      EK.G.wipe > 0 && 'wipe',
    ].filter(Boolean);
    return `${EK.G.mode}/${EK.G.mapId}${over.length ? ` +${over.join('+')}` : ''}`;
  });
  console.log(`${name.padEnd(10)} ${where.padEnd(34)} ${file}`);
  await page.close();
}
await browser.close();
