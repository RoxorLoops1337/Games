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
// `--size` and `--film` do not combine. A still screenshots the page, so it sees
// the canvas AND the DOM panels laid out around it; a film grabs the 256x208
// canvas, which is the same pixels at every window size and contains none of the
// panels. So: anything drawn on the canvas needs no size check, and anything in
// a panel can only be checked with a still. Filming the grass rustle at a
// phone's aspect returned a picture identical to the desktop one, which is the
// correct answer and not an obvious one.
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
  // A whole turn, end to end. Every beat in a fight has been filmed on its own
  // — the walk-on, the catch, the evolution, the rustle — and the turn they all
  // live inside never had been. Card played, wind-up, lunge, burst, the number
  // off the bar, the bar sliding, the foe's answer, the intent for next turn.
  // Driven through playCard and endTurn, the two things a player actually does.
  turn: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'emberwood';
      EK.G.party = [EK.mkMon('pyrelynx', 24)];
      EK.STARTER_DECK.forEach(EK.grantCard);
      EK.startBattle({ foe: EK.mkMon('bramblor', 22), wild: true });
      EK.G.wipe = 0;
      EK.G.battleMsg = null;          // the intro holds the screen until dismissed
      const b = EK.B();
      // Play whatever the hand can afford, then end the turn — the log that
      // comes back is the whole exchange, and submitLog is what plays it.
      // playCard resolves and animates on its own; endTurn returns ONLY the
      // foe's answer. Calling both in the same tick threw the player's half of
      // the exchange away — the first film of this showed a number leaving the
      // player's kin and nothing ever leaving the foe, which reads as "my
      // attack has no beat" and is really "my attack was never in the log".
      // A player plays a card, watches it land, and then ends the turn.
      const i = b.hand.findIndex((c) => EK.playableNow(b, c));
      if (i >= 0) EK.playCard(i);
      setTimeout(() => EK.submitLog(EK.endTurn()), 1500);
    },
  },
  // The field menu — the most-opened screen after the hand — and the box, which
  // is the other long screen and has never been seen against the scroll cue.
  menu: {
    w: 700, h: 620,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.enterMap('hollowbrook', 12, 10, 'down');
      EK.G.mode = 'world';
      // Open it the way a player does. Setting G.mode = 'menu' sets the state
      // and leaves the DOM overlay unrendered — the menu is drawn by the code
      // that opens it, not by the frame loop, so the first shot of this scene
      // was a picture of the town with nothing on it.
      EK.pressKey('b'); EK.step(.02); EK.releaseKey('b'); EK.fired.clear();
    },
  },
  box: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      // A box worth scrolling: the whole roster that has art, so the screen is
      // seen full rather than with the three kin a fresh run happens to hold.
      EK.G.box = EK.DEX_ORDER.filter((id) => EK.ART_CREATURES[id])
        .map((id, i) => EK.mkMon(id, 8 + i));
      EK.openScreen('box');
    },
  },
  gotcha: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      // 'mistspray' is a MOVE. This scene passed it as a species from the day
      // it was written, and the screen dutifully drew the graceful fallback —
      // a purple lozenge with two eyes — which is exactly what a real creature
      // with no art would look like. It read as a finished design for four
      // passes. The check below is why it does not happen again.
      EK.G.gotcha = { t: .9, species: 'dewdrip', name: 'Dewdrip',
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
  // The papers a catch hands you — the one screen where the name is yours, and
  // the only one in the game with a text input. Never photographed at all.
  // `fresh: true` is the state that follows the gotcha; `back: 'party'` is the
  // same screen reached later from the menu, which has a way out and a title.
  papers: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      const m = EK.mkMon('vespyr', 26);
      EK.G.party.push(m);
      EK.openScreen('profile', { mon: m, fresh: true, legendary: true, done: () => {} });
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
      // A party that can survive the opening. The scene used to send the Lv5
      // starter, and a Lv26 legendary moves first and one-shots it before the
      // player ever acts — so every photograph of the climax of the game for
      // five passes was of a corpse: dropped ten pixels and faded to 30%, which
      // reads exactly like a creature drained of its colour by the foe's
      // element. That reading was argued three separate times.
      EK.G.party = [EK.mkMon('pyrelynx', 30)];
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

// `--stats` optionally takes a box: `--stats 35,100,55,45` measures only that
// rectangle of the 256x208 canvas. Whole-frame numbers answer "is this frame
// flat"; they cannot answer "is this creature drained", because the creature is
// a few hundred pixels out of fifty thousand. Three separate times an argument
// about one sprite has been had with a number describing the whole picture.
let STATS = argv.includes('--stats');
let BOX = null;
if (STATS) {
  const i = argv.indexOf('--stats');
  const m = /^(\d+),(\d+),(\d+),(\d+)$/.exec(argv[i + 1] || '');
  argv.splice(i, m ? 2 : 1);
  if (m) BOX = m.slice(1).map(Number);
}

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
    // Check the scene names real creatures, NOW — a beat with its own clock has
    // expired by the time the shot is taken, so this cannot wait for the status
    // line. A species the dex does not have draws as a graceful fallback: a
    // coloured lozenge with two eyes, indistinguishable from a real creature
    // whose art is not in yet. The gotcha scene passed a MOVE id as a species
    // for four passes and the screen looked like a finished design the whole
    // time. Nothing else was ever going to catch it.
    const bad = await page.evaluate(() => {
      const b = window.EK.B && EK.B();
      return [EK.G.gotcha?.species, EK.G.evoAnim?.from, EK.G.evoAnim?.to,
        b?.foe?.species, b?.mine?.species, ...(EK.G.party || []).map((m) => m.species)]
        .filter((sp) => sp && !EK.DEX[sp]);
    });
    if (bad.length) console.error(`  !! ${name}: no such species — ${[...new Set(bad)].join(', ')}`);
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
    const s = await page.evaluate((box) => {
      const c = document.getElementById('view');
      const [bx, by, bw, bh] = box || [0, 0, c.width, c.height];
      const d = c.getContext('2d').getImageData(bx, by, bw, bh).data;
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
    }, BOX);
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
      // A fainted kin is drawn dropped and at 30% alpha, which is easy to read
      // as a lighting problem. Say it out loud instead.
      EK.B?.()?.mine?.hp === 0 && 'MINE-DOWN',
      EK.B?.()?.foe?.hp === 0 && 'FOE-DOWN',
    ].filter(Boolean);
    return `${EK.G.mode}/${EK.G.mapId}${over.length ? ` +${over.join('+')}` : ''}`;
  });
  console.log(`${name.padEnd(10)} ${where.padEnd(34)} ${file}`);
  await page.close();
}
await browser.close();
