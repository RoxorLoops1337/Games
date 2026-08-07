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
//   node tools/emberkin/shot.mjs --at 45 deck        # a screen's entry, 45ms in
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
  // The plaque that names where you just walked in. Nothing is assembled here —
  // enterMap raises it for real. Shot at the Emberwood because that is the
  // biggest change of scene in the game and where the silence was loudest.
  //
  // FILM THIS ONE, do not still it: the plaque lives 2.4s and the still path
  // waits 900ms after `go()` plus 1200ms before the shutter, so a still always
  // arrives after it has gone — which is exactly what the first attempt caught,
  // a picture of the Emberwood with an empty corner and a status line that said
  // no plaque was up. `--film placecard 9 300` walks the whole life; PLACE_IN is
  // .3s, so 300ms is the coarsest interval that still shows the slide arriving.
  placecard: {
    w: 700, h: 620,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.enterMap('emberwood', 8, 12, 'up');
      EK.G.mode = 'world';
      if (!EK.G.place) throw new Error('placecard: entering the Emberwood raised no plaque');
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
  // The XP bar one frame before a level lands. The bar chases `dispXp`, and the
  // renderer draws it against the level that value is IN rather than the level
  // the creature has already reached — so parking dispXp just under the
  // boundary must read as a nearly-full bar of the old level, not as a sliver
  // of the new one. That walk-back is the half of the fix the headless suite
  // cannot see, because it lives in a closure inside renderHUD.
  levelbar: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'emberwood';
      const me = EK.G.party[0];
      EK.startBattle({ foe: EK.mkMon('kindlark', 12), wild: true });
      // The kin has reached level 6; the bar is still finishing level 5. Every
      // end is parked on the same value on purpose — the chase runs each frame
      // in updateBattle, so any gap here would close during the still's settle
      // time and photograph the settled bar instead of the one this scene came
      // for. `barLv` stays 5 because that is the level the playback is on.
      me.lvl = 6; EK.refresh(me); me.xp = EK.xpFor(6) - 1;
      const b = EK.B();
      b.dispXp = b.tgtXp = me.xp; b.barLv = 5;
    },
  },
  // The moment the starter is chosen, which now takes the same road as a catch:
  // a celebration, then the kin's papers with the name still yours to set.
  starterjoy: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.openScreen('starter', { done: () => {} });
      EK.screenSelect();                    // take the first of the three
    },
  },
  // The genuine first fight: a Lv5 starter against what Route One actually
  // holds (Lv3-6), with the starting deck and nothing else. The `battle` scene
  // shows a Lv12 foe, which is not what anybody's first fight looks like.
  firstfight: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      EK.startBattle({ foe: EK.mkMon('zaplet', 4), wild: true });
    },
  },
  // The first hand a player is ever dealt: the Lv5 starter, the ten-card
  // starting deck, and a real Route One foe. `turn` shows a Lv24 kin with a
  // banked shield, which is a mid-game hand and reads nothing like this one.
  firsthand: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      EK.startBattle({ foe: EK.mkMon('zaplet', 4), wild: true });
      EK.G.wipe = 0;
      EK.G.battleMsg = null;          // the intro holds the screen until dismissed
      EK.readIntent();
    },
  },
  // A chest coming open. Film it at ~90ms: the burst is .35s, and the sampling
  // has to match the shortest sub-beat rather than the 1.6s whole.
  chestopen: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.G.gems = 4000;
      EK.openScreen('chests');
      EK.G.screen.i = 3;                  // the Prism, whose colour is the thing being checked
      EK.screenSelect();
    },
  },
  // A trainer's ambush. ALERT is spot .55, walk .55, land .25 — film it at
  // ~80ms against the LAND, not the 1.35s whole. Six passes have had this next
  // in line and nobody has ever looked at it.
  //
  // Pass 94 filmed this and reported the trainer never walking. That was the
  // scene, not the game: `stop` was parked one tile from `from`, so the slide
  // was a single tile and invisible at this zoom. `alertStep` moves the npc by
  // (stop - from) * TILE in pixels, and it always did. Written down because a
  // false alarm caught is worth as much as a bug caught, and the next person to
  // film this should know it has already been doubted once.
  ambush: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.mode = 'world'; EK.enterMap('route_one', 9, 12, 'up');
      const n = (EK.G.map.npcs || []).find((x) => x.trainer);
      if (!n) return;
      const p = EK.G.player;
      p.x = n.x; p.y = n.y + 3; p.px = p.x; p.py = p.y; p.dir = 'up';
      // `stop` is computed the way `trainerSight()` computes it: p + the step
      // direction from npc to player. The first version of this scene parked it
      // one tile from `from`, so the npc slid a single tile over 550ms and the
      // film looked as though the walk phase were dead. It is not — `alertStep`
      // moves `npc.ox/oy` by (stop - from) * TILE — the scene was short.
      const dy = 1;                       // the npc is above, facing down the line
      EK.G.alert = { npc: n, t: 0, i: 0, from: { x: n.x, y: n.y },
        stop: { x: p.x, y: p.y - dy },     // one tile short, as trainerSight now does
        beats: [['spot', .55], ['walk', .55], ['land', .25]] };
    },
  },
  // Hour two. Everything in this file until now has photographed the first
  // fifteen minutes — a Lv5 starter, a ten-card deck, one kin in the party. The
  // screens were designed against that and have only ever been seen that way.
  // Six kin, a full deck, and a dex with most of the valley in it.
  midparty: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.mode = 'world';
      const roster = ['pyrelynx', 'brookite', 'bramblor', 'gargolem', 'frillamb'];
      EK.G.party = [EK.mkMon('kindlark', 31)];
      roster.forEach((id, i) => EK.G.party.push(EK.mkMon(id, 24 + i * 3)));
      EK.G.party.forEach((m) => { EK.seeMon(m.species); EK.catchMon(m.species); });
      EK.G.party[2].hp = Math.round(EK.G.party[2].max * .28);
      EK.G.party[4].status = 'burn';
      EK.openScreen('party');
    },
  },
  // Noted from the first `midparty` shot and NOT acted on: the detail panel's
  // stat bars carry almost nothing at this scale. ATK 42, GUARD 29, SPD 58
  // against STAT_CEIL 130 are three stubs in a ~45px track, and at that width
  // 29 and 42 are indistinguishable — the numbers do all the work. Whether the
  // bars want a shorter ceiling, a longer track, or to go away is a design call
  // that wants its own pass rather than a guess at the end of this one.
  // The dex with the valley nearly filled in. It has only ever been shot sparse
  // — a handful of entries in a grid built for nineteen — so the state a player
  // spends most of the game looking at has never been seen.
  middex: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.mode = 'world';
      // Most of it caught, a few only seen, two never met — which is the mix a
      // real dex holds and the one the grid has to tell apart.
      EK.DEX_ORDER.forEach((id, i) => {
        if (i % 7 === 3) return;                 // never met
        EK.seeMon(id);
        if (i % 5 !== 2) EK.catchMon(id);        // the rest only seen
      });
      EK.openScreen('dex');
    },
  },
  // A full twelve-card deck. The deck screen is where a deck-builder lives and
  // it had only ever been shot at ten starter commons — no rare, no epic, no
  // legendary, no duplicates worth counting, and none of the long rules text
  // the good cards carry. This is what the screen holds once somebody has been
  // buying chests for an hour.
  middeck: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.mode = 'world';
      EK.G.cards = []; EK.G.deck = []; EK.G.nextUid = 0;
      // Every rarity, a stack of the same common to see duplicates counted, and
      // the wordiest legendaries — the ones most likely to overrun a card.
      ['edge', 'edge', 'edge', 'guard', 'focus',
        'whetstone', 'venomcoat', 'berserk', 'bloodedge',
        'overkill', 'dragonheart', 'eternal'].forEach((id) => EK.grantCard(id));
      EK.openScreen('deck');
    },
  },
  // The legendary, with a party that can actually stand in front of it.
  //
  // Vespyr is Lv26 with the highest base attack in the game. It was once
  // photographed against a Lv5 starter, which it one-shot, and the pass that
  // followed spent itself deciding the creature looked "drained" — it was at
  // 0 HP. The harness prints MINE-DOWN / FOE-DOWN for exactly this. Read that
  // line before forming any opinion about how the fight looks.
  legendaryfight: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.mode = 'world'; EK.G.mapId = 'crown_hollow';
      EK.G.party = [EK.mkMon('pyrelynx', 30), EK.mkMon('gargolem', 28)];
      EK.STARTER_DECK.forEach(EK.grantCard);
      EK.startBattle({ foe: EK.mkMon('vespyr', 26), wild: true, legendary: true,
        plan: ['sharpen', 'swing', 'aim', 'swing', 'brace', 'swing'] });
      EK.G.wipe = 0;
      EK.G.battleMsg = null;
      EK.readIntent();
    },
  },
  // The box with enough in it to scroll. It had only ever been shot holding a
  // party of one and a handful boxed, which is the state of a game half an hour
  // old — the screen exists for the other case, where you have caught more than
  // you can carry and have to choose.
  midbox: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.mode = 'world';
      EK.G.party = ['pyrelynx', 'brookite', 'bramblor', 'gargolem', 'frillamb', 'kindlark']
        .map((id, i) => EK.mkMon(id, 22 + i * 2));
      // Two of everything the valley holds, boxed, which is what an hour of
      // throwing orbs actually leaves behind.
      EK.G.box = [];
      EK.DEX_ORDER.forEach((id, i) => {
        EK.G.box.push(EK.mkMon(id, 12 + (i % 9) * 2));
        if (i % 3 === 0) EK.G.box.push(EK.mkMon(id, 8 + (i % 5) * 3));
      });
      EK.G.party.concat(EK.G.box).forEach((m) => { EK.seeMon(m.species); EK.catchMon(m.species); });
      EK.openScreen('box');
    },
  },
  // That fold problem is FIXED (#1700): the party now takes `.cards.slim`, three
  // columns instead of two, so the BOX heading and two rows of boxed kin land on
  // the first screenful. Kept as a note because the scene exists to guard it —
  // if the party ever goes back to three tall rows here, this shot is where it
  // shows. Narrower rather than reordered, because `monCard` indexes party
  // 0..n-1 then box n+i and the foot-of-screen help describes that order.
  // An evolution, at the moment the shape changes.
  //
  // EVO is hold .9, build 1.5, burst .45, settle 1.0, quiet .6 — 4.45s whole,
  // and the burst is the shortest sub-beat AND the one that matters, because
  // the swap happens under its white-out. Filming all 4.45s at any interval
  // that fits a tile would alias the burst exactly the way a 260ms sample once
  // made a 500ms orb wobble look like a dot sitting still.
  //
  // So the beat is built by the game (`checkEvolve` -> `runEvolution`) and only
  // its CLOCK is wound forward to the end of `build`. That is a fast-forward of
  // real state, not hand-assembled state — the distinction that cost two passes
  // on the trainer ambush.
  evolve2: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.G.mode = 'world'; EK.enterMap('route_one', 9, 10, 'down');
      const m = EK.mkMon('cindercub', 15);
      EK.G.party = [m];
      m.lvl = 16; EK.refresh(m);
      // `checkEvolve` ASKS who can evolve and returns the mon; `runEvolution`
      // is what starts the beat. Calling the query and expecting the command
      // filmed a quiet stretch of Route One, and the `if (a)` guard below
      // swallowed it without a word — the same shape as a `||` default hiding
      // a field that does not exist.
      EK.runEvolution(m);
      const a = EK.G.evoAnim;
      if (!a) throw new Error('no evoAnim — runEvolution did not start the beat');
      a.i = 1; a.t = 1.42;                 // the last breath of `build`
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
      // Banked, so the intent line has something to subtract.
      b.shield = 14; b.mods.def = 3; b.foeShield = 26; EK.readIntent();
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
  // The last thing Rowan says at the hand-over, which is now the errand rather
  // than the chest shop. Driven through the real screens — starter, gotcha,
  // papers — because the speech only exists as the tail of that chain.
  handover: {
    w: 700, h: 480,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.enterMap('lab', 5, 4, 'up');
      EK.G.mode = 'world';
      EK.openScreen('starter');
      EK.screenSelect();
      EK.step(3);                       // the celebration runs itself out
      EK.closeScreen();                 // a fresh set of papers has one way out
      const d = EK.G.dialogue;
      if (!d) throw new Error('handover: Rowan never spoke — the chain broke before the say');
      d.i = d.lines.length - 1; d.hold = 0;   // hold on the closing line
      EK.renderDialogue();
    },
  },
  // Warden Hale in the neck of the pass. Worth a picture because everything
  // about him rests on the geometry: the way up to Crown Hollow is two tiles
  // wide and closes to one at (8,2), which is his tile, and npcs are
  // impassable. He is the gate itself, not a doorman stood beside one.
  warden: {
    w: 700, h: 620,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.G.flags = { gotStarter: 1, t_wick1: 1 };
      const h = EK.MAPS.emberwood.npcs.find((n) => n.id === 't_hale');
      if (!h) throw new Error('warden: no Warden Hale on the Emberwood');
      if (!EK.npcActive(h)) throw new Error('warden: he is not on the map to be photographed');
      EK.enterMap('emberwood', h.x, h.y + 2, 'up');
      EK.G.mode = 'world'; EK.G.place = null;
    },
  },
  // The end of the game. Rowan's flags are set for real and the speech is then
  // produced by the real rowanScript — nothing here writes a line. Held on the
  // no-ceremony line, which is the one the whole ending turns on.
  ending: {
    w: 700, h: 480,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null;
      for (const [id] of EK.AIM_ORDER) EK.G.flags[id] = 1;
      EK.G.flags.beatVespyr = 1;
      for (const id of EK.DEX_ORDER) EK.G.dex[id] = 2;      // the full-dex branch
      EK.enterMap('lab', 5, 4, 'up');
      EK.G.mode = 'world'; EK.G.place = null;
      EK.rowanScript();
      const d = EK.G.dialogue;
      if (!d) throw new Error('ending: Rowan said nothing with every flag set');
      if (!/ceremony/i.test(d.lines.join(' '))) throw new Error('ending: this is not the closing speech');
      d.i = d.lines.findIndex((l) => /ceremony/i.test(l)); d.hold = 0;
      EK.renderDialogue();
    },
  },
  // The longest line of the speech, held on its own, because a count of
  // trainers and a clause about Wick is the one that can outgrow the box.
  handoveraim: {
    w: 700, h: 480,
    // Scene bodies are serialised into the page, so this cannot call the one
    // above — SCENES does not exist in there. It repeats the drive instead.
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.enterMap('lab', 5, 4, 'up');
      EK.G.mode = 'world';
      EK.openScreen('starter');
      EK.screenSelect();
      EK.step(3);
      EK.closeScreen();
      const d = EK.G.dialogue;
      if (!d) throw new Error('handoveraim: Rowan never spoke — the chain broke before the say');
      d.i = d.lines.length - 3; d.hold = 0;
      EK.renderDialogue();
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
  // The shop's buying screen and the dex — two screens never photographed. The
  // shop is where money goes between fights; the dex is the collection payoff
  // of a creature collector, and the one screen whose whole job is to look good
  // full, so it is shot with the roster seen rather than empty.
  shopping: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      EK.G.money = 900;   // enough to afford some of it and not all of it
      EK.openScreen('shop');
    },
  },
  dex: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      // Most of the roster caught, a few only seen, the rest still blank —
      // which is what a dex looks like in the middle of a run and the only
      // state in which its three tiers of entry can be judged against each
      // other at all.
      EK.DEX_ORDER.forEach((id, i) => {
        if (i % 4 === 3) return;                 // leave some unfound
        EK.seeMon(id);
        if (i % 3 !== 2) EK.catchMon(id);        // and some only seen
      });
      EK.openScreen('dex');
    },
  },
  // Three creatures and one irreversible choice — the third thing a new player
  // sees, and no picture of it existed.
  starter: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null; EK.G.mode = 'world';
      EK.openScreen('starter');
    },
  },
  // The Wayhouse heal. Talked into rather than triggered, so the beat runs the
  // way it does in play: Sable's line, the light, then "right as rain".
  mend: {
    w: 300, h: 260,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      EK.enterMap('wayhouse', 5, 3, 'up');
      EK.G.party.forEach((m) => { m.hp = 1; });
      const n = (EK.G.map.npcs || []).find((m) => m.heal);
      setTimeout(() => {
        EK.talkTo(n);
        // Past Sable's offer the way a player taps through it; the light is
        // what comes next.
        for (let i = 0; i < 12 && EK.G.dialogue; i++) { EK.G.dialogue.hold = 0; EK.advanceDialogue(); }
      }, 140);
    },
  },
  // The chest shop — where gems go, and the only purchase in the game that is a
  // gamble. Never shot. The cursor is driven DOWN rather than set, so the shot
  // shows whether up/down agrees with the grid the player can see.
  chests: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      EK.G.gems = 260;
      EK.openScreen('chests');
      EK.pressKey('down'); EK.step(.02); EK.releaseKey('down'); EK.fired.clear();
    },
  },
  // Going down. Driven through a real loss so the beat runs the way it does in
  // play: the last kin falls, the two lines, the dark closing, the Wayhouse.
  wipe: {
    w: 300, h: 260,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      EK.startBattle({ foe: EK.mkMon('bramblor', 45), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      const b = EK.B();
      void b;
      // Fought out, not assigned. `over` is decided inside the damage path, so
      // a kin set to 1 HP and then hit still does not lose — three films and a
      // test discovered that separately. Ending turns against something far too
      // strong is what actually loses, and the defeat lines then come from a
      // callback the frame loop drives, so they need tapping through as they
      // arrive rather than all at once.
      const beat = () => {
        const cur = EK.B();
        if (cur && !cur.over && !cur.log) EK.submitLog(EK.endTurn());
        const d = EK.G.dialogue || EK.liveBattleMsg();
        if (d) { d.hold = 0; EK.advanceDialogue(); }
      };
      for (let t = 100; t <= 4000; t += 130) setTimeout(beat, t);
    },
  },
  // A level-up. Won outright against something far too weak, so the win, the
  // XP and the level all land in one played-back log — the way it happens after
  // most fights.
  levelup: {
    w: 300, h: 260,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      EK.G.party = [EK.mkMon('pyrelynx', 24)];
      // One point short of the next level, so the win tips it over. A Lv24
      // against a Lv3 gains almost nothing — the first film of this recorded a
      // fight with no level-up in it at all.
      EK.G.party[0].xp = EK.xpFor(EK.G.party[0].lvl + 1) - 1;
      EK.STARTER_DECK.forEach(EK.grantCard);
      EK.startBattle({ foe: EK.mkMon('dewdrip', 3), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      // A real win, driven properly. Two earlier attempts filmed fights that
      // never finished: a Lv3 Dewdrip still has 64 HP under the wild multiplier
      // and survives one swing, and the beat loop's "not while a log is
      // playing" guard then skipped most of its windows. The foe's HP CAN be
      // set directly — only the player's kin going down is decided inside the
      // damage path — so one ended turn wins, the XP lands, and the level fires
      // in among the win lines, which is where it has to be judged.
      EK.B().foe.hp = 1;
      const beat = () => {
        const cur = EK.B();
        if (cur && !cur.over && !cur.log) EK.submitLog(EK.endTurn());
        const d = EK.G.dialogue || EK.liveBattleMsg();
        if (d) { d.hold = 0; EK.advanceDialogue(); }
      };
      for (let t = 100; t <= 3000; t += 160) setTimeout(beat, t);
    },
  },
  // The bag mid-fight, seen full rather than with the two items a fresh run
  // carries, and the swap screen — the one screen that asks you to give
  // something up. Neither had ever been shot.
  bagfight: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'emberwood';
      Object.keys(EK.ITEMS).forEach((k, i) => { EK.G.bag[k] = 2 + i; });
      EK.startBattle({ foe: EK.mkMon('kindlark', 12), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      EK.B().mine.hp = Math.round(EK.B().mine.max * .38);   // hurt enough for the choice to matter
      EK.B().foe.hp = Math.round(EK.B().foe.max * .22);     // and the foe soft enough to be worth an orb
      EK.openScreen('bag');
    },
  },
  // The deck-limit screen: twelve cards in, one has to come out. It is about
  // CARDS, not kin — the first version of this scene assumed a full party
  // meeting a new catch and passed `mon`, so `ownedCard(s.opt.newCard)` came
  // back empty and the screen rendered its no-incoming-card fallback: a wall of
  // twelve cards asking which to discard, with nothing shown to discard them
  // FOR. That looked like a real design fault and was entirely my own doing.
  // Third time a scene has photographed a fallback path and had it read as
  // finished work.
  swap: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      EK.STARTER_DECK.forEach(EK.grantCard);
      const fresh = EK.grantCard('warcry') || EK.G.cards[EK.G.cards.length - 1];
      EK.openScreen('swap', { newCard: fresh && fresh.u, done: () => {} });
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
      // Edge is in the deck three times; a fourth is set aside where it can
      // never be drawn — the case the old "you own 4" hid completely.
      EK.grantCard('edge');
      EK.G.deck = EK.G.deck.filter((u) => u !== EK.G.cards[EK.G.cards.length - 1].u);
      EK.openScreen('reward', { offer: ['edge', 'ironhide', 'warcry'], done: () => {} });
      // The worst case for the keyword glosses: Chain, Retain and Exhaust all on
      // offer at once, so the paragraph is as long as it can ever get.
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
let AT = null;
const wi = argv.indexOf('--at');
if (wi >= 0) { AT = Number(argv[wi + 1]); argv.splice(wi, 2); }

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
    // Make the dialogue panel agree with the dialogue state.
    //
    // Advancing the monologue before `go()` (above) fixed the opening only.
    // Nearly every scene then sets `EK.G.dialogue = null` itself to clear
    // whatever it walked into — and that is the same bug the comment above
    // warns about, thirty times over: the panel is a DOM overlay that only
    // redraws on a dialogue event, so nulling the state from outside leaves the
    // box up with its last line still in it. Elder Rowan was sitting behind
    // every screen shot at "Cindercub. Of course." and only turned up when the
    // entry animation was seeked to t=0 and the screen was transparent.
    // `renderDialogue` reads the state and shows or hides the box accordingly,
    // so calling it unconditionally is right whether the scene wanted a line on
    // screen or not.
    await page.evaluate(() => window.EK.renderDialogue());
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
    //
    // `--at ms` instead photographs the screen's entry animation AT a point in
    // its own timeline. A DOM entry animation is the one thing this tool could
    // not photograph at all: a film grabs the canvas, which has no panels on
    // it, and a still waits 1200ms by which time every screen has arrived.
    //
    // Two attempts at this were wall-clock waits and both measured nothing.
    // Waiting from `go()` cannot compare two screens, because scenes do
    // different amounts of work after opening one — the reward scene grants a
    // card and edits the deck first, the papers scene opens last. Waiting for
    // the `.rising`/`.landing` class to appear looks like it fixes that and
    // does not: the class is never removed when the animation ends, only when
    // the next screen replaces it (index.html, screenEntry), so on an already
    // open screen the wait resolves instantly and `--at 45` and `--at 110`
    // returned the same settled picture. A signal that is still true long
    // after the event is not a signal.
    //
    // So: don't race it. `getAnimations()` hands back the running CSSAnimation;
    // pause it and set `currentTime`. That is the frame at 45ms, not a frame
    // taken 45ms after something. If there is no animation to seek, say so
    // rather than quietly shoot a settled screen — that silence is the whole
    // bug being fixed here.
    if (FILM) await page.waitForTimeout(60);
    else if (AT !== null) {
      const seeked = await page.evaluate((ms) => {
        const el = document.getElementById('screen');
        const an = el && el.getAnimations ? el.getAnimations() : [];
        an.forEach((a) => { a.pause(); a.currentTime = ms; });
        return an.map((a) => `${a.animationName}@${a.currentTime}/${a.effect.getTiming().duration}`);
      }, AT);
      if (!seeked.length) console.error(`  !! ${name}: nothing to seek — no animation on #screen`);
      else console.error(`  ${name}: ${seeked.join(' ')}`);
    } else await page.waitForTimeout(1200);
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
      // The place card is not a beat and owns nothing, but it is 17px of plaque
      // in the top-left corner and every scene that calls enterMap now raises
      // one. If it is on screen the print has to say so.
      EK.G.place && `place:${EK.G.place.name}`,
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
