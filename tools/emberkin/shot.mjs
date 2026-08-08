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
//   node tools/emberkin/shot.mjs --touch --size 390x760 midbox  # as a phone
//
// `--size` matters because the stage picks an integer scale from the window and
// then lays the touch controls out around it, so a screen can be right at one
// size and broken at another — the title screen was composed at 900x800 and had
// never been seen at a phone's aspect, where a different scale applies.
//
// `--touch` is NOT the same as a narrow `--size`, and this took the whole
// project to notice. The game picks its layout from `pointer: coarse` /
// maxTouchPoints, and a plain page has neither, so every narrow shot ever taken
// was the desktop branch: stage centred, dead margins, no control band. The real
// phone layout — stage top-aligned, dpad and buttons filling the space below —
// had never been photographed once, and the first picture of it showed the box
// screen telling the player to press A and X. Use --touch for anything about how
// the game reads on a phone.
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

/**
 * Each scene says how big to shoot it and how to get the game into that state.
 *
 * Optional per scene:
 *   wait   ms to hold before a still's shutter (default 1200). A beat with its
 *          own clock needs the shutter opened when the beat is on screen — the
 *          orb throw runs ~3.5s and 1200ms photographs the middle of it.
 *   needs  (EK) => boolean, checked AT the shutter. If it comes back false the
 *          tool says so loudly instead of handing back a picture of an empty
 *          room. See the note at the call site: three scenes have done exactly
 *          that and two of them were believed.
 */
const SCENES = {
  title: { w: 900, h: 800, go: null },
  // The title as a RETURNING player sees it, which had never been photographed:
  // every shot of this screen has been taken from a fresh state, and the
  // Continue button only exists when there is a save to continue. Seeded
  // through saveGame() so the button appears for the reason it appears in play.
  titleback: {
    w: 900, h: 800,
    needs: () => !document.querySelector('#title [data-act="cont"]').classList.contains('hidden'),
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      EK.G.party = [EK.mkMon('pyrelynx', 22), EK.mkMon('brookite', 20)];
      EK.enterMap('emberwood', 8, 10, 'down');
      EK.saveGame();
      // …and then back to the title. `boot()` wires the page and does not
      // return here — the title is a DOM panel, so put it back up and reveal
      // Continue the way boot's own hasSave() branch does.
      EK.G.mode = 'title';
      const t = document.getElementById('title');
      t.classList.remove('hidden');
      if (EK.hasSave()) {
        t.querySelector('[data-act="cont"]').classList.remove('hidden');
        t.classList.add('returning');       // the same flag boot() sets
      }
    },
  },
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
  // The kill, from the blow that lands it. Two beats back to back — the foe's
  // KO fall (KO_FALL .55s) and then the victory flourish (FLOURISH_T 1.35s) —
  // and the question is whether they read as two or as one mush.
  //
  // The dice are pinned: damage rolls, so an unpinned scene can leave the foe
  // on 1 HP and film a fight that does not end. 167 learned this on the throw.
  kill: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      // The DECK IS SHUFFLED, so pinning the damage roll alone is not enough:
      // two probes of the same setup dealt two different hands, and which card
      // is played decides what the frames contain. The pin has to cover
      // `startBattle` as well.
      const roll = Math.random;
      Math.random = () => .999;        // same deal every time, top of every range
      EK.startBattle({ foe: EK.mkMon('dewdrip', 6), wild: true });
      EK.G.wipe = 0;
      const b = EK.B();
      b.foe.hp = 1;                    // one hit from going down
      EK.G.battleMsg = null;
      // The kin card is the creature's own move and is always an attack; the
      // starting deck is skills. `cardText` is a DECK-card function — it reads
      // `CARDS[id].txt`, and a kin card's move lives in MOVES, so asking it for
      // a kin card's text throws. The game branches on `src === 'kin'` at every
      // live call site; this scene did not.
      const i = b.hand.findIndex((c) => c.src === 'kin' && EK.cardCost(c) <= b.energy);
      // `playCard` BUILDS a log and returns it; `submitLog` is what plays it
      // back, and the knockout's fall is set by a `faint` entry DURING that
      // playback. Calling playCard alone put the foe on 0 HP with `downF` never
      // set at all — measured, the flourish began 0.02s after the hit and the
      // fall never happened. The ledger already records this exact trap for the
      // catching scene ("doAction only builds the log"), one scene earlier.
      EK.submitLog(EK.playCard(i >= 0 ? i : 0));
      Math.random = roll;
    },
  },
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
  // The aimed card with the WORDIEST text in the hand. `firsthand` draws at
  // random, and a two-word card proves nothing about a badge that is drawn over
  // the third line — the phone fix has to be checked against the case that
  // actually collided, not against whatever the shuffle happened to deal.
  handlong: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      // The starting deck does not always deal a wordy card, so this deals again
      // rather than throwing on an unlucky shuffle — a scene that fails every
      // other run teaches you to ignore it, which is worse than no guard at all.
      let b = null, best = 0, len = -1;
      for (let tries = 0; tries < 40 && len < 20; tries++) {
        EK.startBattle({ foe: EK.mkMon('zaplet', 4), wild: true });
        b = EK.B();
        if (!b || !b.hand || !b.hand.length) throw new Error('handlong: no hand was dealt');
        len = -1;
        // A hand holds the kin's own moves as well as deck cards, and their ids
        // are MOVES — cardText looks them up in CARDS, finds nothing and throws
        // on `.txt`. renderHand branches on src === 'kin'; reading it any other
        // way is reading it wrongly, which is what the first version did.
        b.hand.forEach((c, i) => {
          const t = String(c.src === 'kin'
            ? EK.moveCardText(c.id)
            : EK.cardText({ id: c.id, plus: 0, bg: c.bg || 0 }) || '');
          if (t.length > len) { len = t.length; best = i; }
        });
      }
      if (len < 20) throw new Error('handlong: forty deals and never a wordy card — nothing to collide with');
      EK.G.wipe = 0; EK.G.battleMsg = null;
      b.sel = best;
      // renderHand only fills the description bar when the battle's own line
      // timer has run out, so whether the bar is up in a still is otherwise a
      // matter of when the shutter fell. Running the timer down is
      // fast-forwarding real state, and it is the whole point of this scene:
      // the aimed card no longer carries its wording at phone size, so the bar
      // is the thing that has to be carrying it.
      b.lineT = 0;
      EK.readIntent();
      EK.renderHand();
      if (!EK.G.dialogue && !(EK.els && EK.els.dialogue)) { /* nothing to assert against */ }
    },
  },
  // A chest coming open. Film it at ~90ms: the burst is .35s, and the sampling
  // has to match the shortest sub-beat rather than the 1.6s whole.
  chestopen: {
    needs: (EK) => !!EK.G.chestOpen,
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
    needs: (EK) => !!EK.G.alert,
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
  // The WHOLE beat, from nothing: hold .9 + build 1.5 + burst .45 + settle 1.0
  // + quiet .6 = 4.45s. `evolve` drives a real battle first, so nineteen frames
  // of any film of it are the fight and the change falls off the end of the
  // strip; `evolve2` seeks to the last breath of `build` for a still. Neither
  // can film the arc. Three questions, three scenes.
  evolving: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.G.mode = 'world'; EK.enterMap('route_one', 9, 10, 'down');
      const m = EK.mkMon('cindercub', 15);
      EK.G.party = [m];
      m.lvl = 16; EK.refresh(m);
      EK.runEvolution(m);
      if (!EK.G.evoAnim) throw new Error('no evoAnim — runEvolution did not start the beat');
      // `enterMap` raises the place plaque, and this scene evolves in the same
      // breath — so every frame of the first film carried a ROUTE ONE card in
      // the corner. That was the scene, not the game… and then it was both: the
      // plaque was genuinely drawing over the evolution. The game is fixed; the
      // scene still has no business photographing a plaque it summoned itself.
      EK.G.place = null;
    },
  },
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
  // The same twelve characters where the room is smallest: a 256px-wide arena.
  // 163 looked at the party screen and the stat block and stopped there; the
  // battle HUD, the foe plate and the forced-switch prompt all take dispName()
  // too and none of them had ever seen a nickname at all.
  nickfight: {
    w: 900, h: 1000,
    needs: (EK) => !!EK.B() && (EK.B().mine.nick || '').length === 12,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'emberwood';
      const mine = EK.mkMon('pyrelynx', 24);
      mine.nick = 'MMMMMMMMMMMM';           // the widest twelve there are
      EK.G.party = [mine, EK.mkMon('brookite', 22)];
      EK.STARTER_DECK.forEach(EK.grantCard);
      EK.startBattle({ foe: EK.mkMon('bramblor', 23), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      EK.G.toast = null; EK.G.dialogue = null; EK.G.battleMsg = null;
      EK.readIntent();
      EK.renderHand();     // draws the HUD, the chip and the hand together
      EK.renderDialogue(); // …and takes the dex toast off the plate
    },
  },
  // The one thing in this game a PLAYER TYPES, at its maximum length, in the
  // three places it is drawn. `maxlength="12"` caps it; nobody had ever looked
  // at what twelve characters do to a kin row beside a 44px sprite, to the
  // battle HUD, or to the box card the same name has to fit in.
  nicklong: {
    w: 760, h: 900,
    needs: (EK) => EK.G.party.every((m) => (m.nick || '').length === 12),
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.mode = 'world';
      EK.G.party = ['pyrelynx', 'brookite', 'bramblor', 'gargolem']
        .map((id, i) => { const m = EK.mkMon(id, 22 + i * 2); m.nick = 'Wwwwwwwwwwww'.slice(0, 12); return m; });
      EK.G.box = ['kindlark', 'magmane'].map((id) => { const m = EK.mkMon(id, 18); m.nick = 'MMMMMMMMMMMM'; return m; });
      EK.G.party[1].nick = 'Ashling the';        // a real one, spaces and all
      EK.G.party[1].nick = 'Ashling them';
      EK.G.party[2].nick = 'MMMMMMMMMMMM';       // the widest twelve there are
      EK.G.party[3].nick = 'iiiiiiiiiiii';       // and the narrowest
      EK.openScreen('box');                // the narrowest card that takes a name
      EK.renderScreen();
    },
  },
  // The three payoff screens, each held at the frame worth looking at.
  // This scene used to hand-build `G.evoAnim` — beat 2, its own durations, and
  // `swapped: false`. That is a state the game cannot produce: `evoStep` flips
  // `swapped` on the way INTO the burst, so every picture ever taken of the
  // evolution showed the OLD creature inside a white-out that exists to reveal
  // the new one, and `res` stayed null so the scene could never reach its own
  // last line. Nobody had photographed the real thing.
  //
  // Driven now: a win that tips a Cindercub over Lv16, the way a player gets
  // here. FILM THIS ONE — the light wheel turns and accelerates across the
  // beats, and a still of it looks painted on.
  evolve: {
    w: 760, h: 760,
    wait: 6400,
    needs: (EK) => !!EK.G.evoAnim || EK.G.party[0].species === 'pyrelynx',
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      EK.G.party = [EK.mkMon('cindercub', 15)];
      EK.G.party[0].xp = EK.xpFor(16) - 1;      // the win is the sixteenth level
      EK.STARTER_DECK.forEach(EK.grantCard);
      EK.startBattle({ foe: EK.mkMon('dewdrip', 3), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      EK.B().foe.hp = 1;
      // Ending the turn is not attacking. The first film of this ran a beat
      // loop of nothing but endTurn against a foe on 1 HP and recorded twelve
      // frames of the Cindercub being chewed on — the fight never resolved,
      // because the player's swing comes out of a CARD. Play one, then end.
      const beat = () => {
        const cur = EK.B();
        if (cur && !cur.over && !cur.log) {
          const i = cur.hand.findIndex((c) => EK.cardCost(c) <= cur.energy);
          if (i >= 0) EK.playCard(i); else EK.submitLog(EK.endTurn());
        }
        // The card offer stands between the win and the evolution: `settle` is
        // the reward screen's `done`, so the scene has to answer it to get
        // there. A film that stopped at "WON +1 gem" was stopping one screen
        // short of its own subject. Decline it — "No thanks" is the last row,
        // and TAKING a card with a full deck opens the swap screen behind it
        // and stalls the film there instead.
        if (EK.G.screen && EK.G.screen.kind === 'reward') {
          EK.G.screen.i = Math.max(0, (EK.G.screen.list || []).length - 1);
          EK.screenSelect();
        }
        const d = EK.G.dialogue || EK.liveBattleMsg();
        if (d) { d.hold = 0; EK.advanceDialogue(); }
      };
      for (let t = 60; t <= 9000; t += 120) setTimeout(beat, t);
    },
  },
  // The throw itself, end to end: out of the hand, the suck, the fall, three
  // wobbles with dead air between them, and the click. Film this one.
  catching: {
    w: 300, h: 260,
    needs: (EK) => !!(EK.B() && EK.B().orb) || !!EK.G.gotcha,
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
      //
      // …and the throw is a DICE ROLL, so this scene posed differently every
      // time it was run: three films taken to judge one change to the wobble
      // came back as a three-shake catch, a three-shake catch and a one-shake
      // break, and the third was not comparable to either. A moment you are
      // photographing to judge a change to it has to pose the same way twice.
      // Pinned to the best case — three holds and a click — because that is the
      // version of the beat the wait exists for; the break is a shorter cut of
      // the same animation.
      const roll = Math.random;
      Math.random = () => .001;
      EK.submitLog(EK.doAction({ kind: 'item', id: 'bloomorb', target: 'foe' }));
      Math.random = roll;
    },
  },
  // The deepest hold, as a still: the last moment before it resolves, with the
  // hush at full and the HUD in frame. `catching` cannot do this job — `wait`
  // delays the FILM's start as well, so a 3s wait there would begin recording
  // after the throw had finished. Two questions, two scenes.
  hush: {
    w: 300, h: 260,
    wait: 3050,      // throw .55 + suck .34 + fall .34 + (wobble .5 + gap .22)x3
    needs: (EK) => !!(EK.B() && EK.B().orb && !EK.B().orb.done),
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      EK.startBattle({ foe: EK.mkMon('dewdrip', 6), wild: true });
      EK.G.wipe = 0;
      const b = EK.B();
      b.foe.hp = Math.max(1, Math.round(b.foe.max * .12));
      EK.G.bag.bloomorb = 5;
      EK.G.battleMsg = null;
      const roll = Math.random;
      Math.random = () => .001;    // three holds and a click, every time
      EK.submitLog(EK.doAction({ kind: 'item', id: 'bloomorb', target: 'foe' }));
      Math.random = roll;
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
  // Wick on the mountain after you have been down and heard Rowan out. His
  // parting line used to be "Go and see Rowan" for ever, including on the walk
  // straight back from having done it. Driven through the real talkTo, so what
  // is on screen is whatever the after-function actually returns.
  wickafter: {
    w: 700, h: 480,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null;
      for (const [id] of EK.AIM_ORDER) EK.G.flags[id] = 1;
      EK.G.flags.beatVespyr = 1;
      EK.G.flags.heardEnding = 1;
      const w = EK.MAPS.crown_hollow.npcs.find((n) => n.id === 't_wick3');
      if (!w) throw new Error('wickafter: no Wick on Crown Hollow');
      EK.enterMap('crown_hollow', w.x, w.y + 1, 'up');
      EK.G.mode = 'world'; EK.G.place = null;
      EK.talkTo(w);
      if (!EK.G.dialogue) throw new Error('wickafter: he said nothing');
      if (/Go and see Rowan/.test(EK.G.dialogue.lines.join(' '))) {
        throw new Error('wickafter: still sending you to a conversation you have had');
      }
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
  // The Wayhouse LANDING, held on Sable's line — the losing beat's one piece of
  // kindness, which no shot had ever contained because `wipe` below mashes A
  // through everything to reach the room. Seeded broke on purpose: the fee is a
  // quarter of your shards floored, so this is the state a player who has just
  // lost everything actually arrives in.
  wipeland: {
    w: 300, h: 260,
    wait: 6000,
    needs: (EK) => EK.G.mapId === 'wayhouse' && !!EK.G.dialogue,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      EK.G.money = 2;                      // broke: a quarter of two is zero
      EK.startBattle({ foe: EK.mkMon('bramblor', 45), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      const beat = () => {
        const cur = EK.B();
        if (cur && !cur.over && !cur.log) EK.submitLog(EK.endTurn());
        // Stop advancing the moment the room comes up — that line is the point.
        if (EK.G.mapId === 'wayhouse') return;
        const d = EK.G.dialogue || EK.liveBattleMsg();
        if (d) { d.hold = 0; EK.advanceDialogue(); }
      };
      for (let t = 100; t <= 5000; t += 130) setTimeout(beat, t);
    },
  },
  // Going down. Driven through a real loss so the beat runs the way it does in
  // play: the last kin falls, the two lines, the dark closing, the Wayhouse.
  // The bars into a fight. WIPE_T is .55s and G.wipe is set by startBattle, so
  // this films the whole of it from zero. The `wipe` scene below is a LOSS —
  // it fights a Lv45 Bramblor and waits 4500ms for the blackout — and cannot
  // film this one.
  // Being spotted: the look, the walk, the pause. ALERT is spot .55 + walk .55
  // + land .25 = 1.35s, and it is the only "somebody noticed you" beat in the
  // game. Never filmed until 175.
  //
  // Wick stands at (12,5) in Hollowbrook facing LEFT, and SIGHT is 4 tiles, so
  // standing at (9,5) puts the player in his line. `trainerSight()` is what
  // walking into it calls; calling it directly is the same entry point.
  spotted: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      EK.enterMap('hollowbrook', 9, 5, 'right');
      EK.G.place = null;
      EK.G.flags.gotStarter = 1;
      if (!EK.trainerSight()) throw new Error('nobody spotted the player at 9,5');
    },
  },
  wipein: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.enterMap('route_one', 9, 10, 'down');
      EK.G.place = null;
      const roll = Math.random;
      Math.random = () => .999;
      EK.startBattle({ foe: EK.mkMon('dewdrip', 6), wild: true });
      Math.random = roll;
      EK.G.battleMsg = null;
    },
  },
  // A door closing and opening again. WARP_SHUT is .17s of curtain, then
  // enterMap and G.fade = .3 on the far side — so the whole beat is about half
  // a second and the film has to be fine-grained to catch it.
  door: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.enterMap('hollowbrook', 12, 10, 'down');
      EK.G.place = null;
      // Walk into the first door this map has, the way a player reaches one.
      const w = (EK.G.map.warps || [])[0];
      if (!w) throw new Error('no warp on hollowbrook to walk through');
      EK.doWarp(w);
    },
  },
  wipe: {
    w: 300, h: 260,
    wait: 4500,
    needs: (EK) => EK.G.wipe > 0 || EK.G.mapId === 'wayhouse',
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
  // The level and the win, in the order a player gets them. `levelup` above is
  // a STILL — `wait: 4500` — and `wait` delays a film's start too, so filming
  // it begins after the beat is over. Measured, the sequence is: fall 1.97s,
  // bar filling 2.53s, level rings 3.50s (LVL_T .8s, so to 4.30), flourish
  // 3.90s. The last 0.4s of the level is drawn underneath the victory.
  levelwin: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      const roll = Math.random;
      Math.random = () => .999;          // same deal, top of every range
      EK.startBattle({ foe: EK.mkMon('dewdrip', 6), wild: true });
      EK.G.wipe = 0;
      const b = EK.B();
      b.foe.hp = 1;
      EK.G.battleMsg = null;
      // One point short, so this win must cross the boundary.
      b.mine.xp = EK.xpFor(b.mine.lvl + 1) - 1;
      b.dispXp = b.tgtXp = b.mine.xp; b.barLv = b.mine.lvl;
      const i = b.hand.findIndex((c) => c.src === 'kin' && EK.cardCost(c) <= b.energy);
      EK.submitLog(EK.playCard(i >= 0 ? i : 0));
      Math.random = roll;
      // Seek to just before the rings. A film cannot be given a start offset —
      // `wait` delays it rather than skipping into it — so the scene walks the
      // simulation forward itself, in sixtieths, to 3.3s. Filming from zero
      // spent all twenty frames on the exchange and reached the beat on none.
      for (let n = 0; n < 198; n++) EK.step(1 / 60);
    },
  },
  levelup: {
    w: 300, h: 260,
    wait: 4500,
    // The level itself, not "some screen is up" — a `needs` with an escape
    // hatch in it is a check that cannot fail. This still proves the level was
    // GAINED; the moment it is gained is a log line, so film that.
    needs: (EK) => EK.G.party[0].lvl > 24,
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
      // A real win. Two earlier attempts filmed fights that never finished: a
      // Lv3 Dewdrip still has 64 HP under the wild multiplier and survives one
      // swing, and the beat loop's "not while a log is playing" guard then
      // skipped most of its windows. The foe's HP CAN be set directly — only
      // the player's kin going down is decided inside the damage path.
      //
      // And a third: this comment used to end "so one ended turn wins", which
      // was never true. ENDING THE TURN IS NOT ATTACKING — the player's swing
      // comes out of a card, so a loop of nothing but endTurn stands there
      // while a foe on 1 HP chews on you. The film was six frames of two
      // creatures doing nothing and the comment said the fix was in.
      EK.B().foe.hp = 1;
      const beat = () => {
        const cur = EK.B();
        if (cur && !cur.over && !cur.log) {
          const i = cur.hand.findIndex((c) => EK.cardCost(c) <= cur.energy);
          if (i >= 0) EK.playCard(i); else EK.submitLog(EK.endTurn());
        }
        // The win lines are played back through the LOG, not through
        // `battleMsg` — an attempt to hold this scene on "grew to level 25" by
        // reading `d.lines[d.i]` never matched anything, because that dialogue
        // is not where the log's text lives. Film it at a tight interval
        // instead; the level line is in among the win lines, which is where it
        // has to be judged anyway.
        const d = EK.G.dialogue || EK.liveBattleMsg();
        if (d) { d.hold = 0; EK.advanceDialogue(); }
      };
      for (let t = 60; t <= 4000; t += 120) setTimeout(beat, t);
    },
  },
  // The foot of a long screen in the overlay layout, scrolled all the way down.
  // The controls sit in the bottom corners there, so the question this answers
  // is whether the last row of a list can be brought clear of them at all — a
  // still of the TOP of the same screen cannot tell you.
  boxfoot: {
    w: 560, h: 390,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.mode = 'world';
      EK.G.party = ['pyrelynx', 'brookite', 'bramblor', 'gargolem', 'frillamb', 'kindlark']
        .map((id, i) => EK.mkMon(id, 22 + i * 2));
      EK.G.box = EK.DEX_ORDER.map((id, i) => EK.mkMon(id, 12 + (i % 9) * 2));
      EK.openScreen('box');
      const el = document.getElementById('screen');
      if (!el) throw new Error('boxfoot: no screen element');
      el.scrollTop = el.scrollHeight;
      if (el.scrollTop <= 0) throw new Error('boxfoot: the panel does not scroll — nothing to test');
    },
  },
  // The wordiest card in the game, scrolled clear of the panel's fold. A card
  // cut off at the bottom of the viewport and a card whose own text overflows
  // look identical in a still of the top of a list, and only one of them is a
  // bug worth chasing.
  deckwordy: {
    w: 390, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.mode = 'world';
      let wordy = null, len = -1;
      for (const id of EK.CARD_IDS) {
        const t = String(EK.cardText({ id, plus: 0, bg: 0 }) || '');
        if (t.length > len) { len = t.length; wordy = id; }
      }
      if (!wordy) throw new Error('deckwordy: no cards to measure');
      for (let i = 0; i < 6; i++) EK.grantCard(wordy);
      EK.openScreen('deck');
      const el = document.getElementById('screen');
      if (!el) throw new Error('deckwordy: no screen element');
      el.scrollTop = Math.round(el.scrollHeight * .35);
      if (el.scrollTop <= 0) throw new Error('deckwordy: the panel does not scroll — the fold is not in play');
    },
  },
  // Does the fan actually escape the stage, or does it only look like it?
  // The outer cards rotate and drop, so at some sizes their corners sit right
  // on the stage's lower edge and a still cannot settle it — a card ending
  // exactly at the boundary and a card clipped by it are the same picture.
  // This measures instead: it reports the worst overhang in pixels, and throws
  // if there is one, so the answer is a number rather than an impression.
  handclip: {
    w: 768, h: 1024,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'route_one';
      EK.startBattle({ foe: EK.mkMon('zaplet', 4), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      EK.readIntent();
      EK.renderHand();
      const stage = document.getElementById('stage');
      const cards = document.querySelectorAll('#hand .cardel');
      if (!stage || !cards.length) throw new Error('handclip: no stage or no hand to measure');
      const sr = stage.getBoundingClientRect();
      let worst = 0, which = -1, side = '';
      cards.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const edges = { bottom: r.bottom - sr.bottom, top: sr.top - r.top,
          right: r.right - sr.right, left: sr.left - r.left };
        for (const k of Object.keys(edges)) {
          if (edges[k] > worst) { worst = edges[k]; which = i; side = k; }
        }
      });
      // The other end matters just as much. Lifting the row to clear the stage's
      // floor pushes the aimed card — which rises on its own — up under the
      // description bar, and swapping a clipped corner for a hidden cost pip is
      // not a fix. Both numbers, every time.
      const bar = document.getElementById('dialogue');
      let under = 0;
      if (bar && !bar.classList.contains('hidden')) {
        const br = bar.getBoundingClientRect();
        cards.forEach((c) => {
          const r = c.getBoundingClientRect();
          if (r.left < br.right && r.right > br.left) under = Math.max(under, br.bottom - r.top);
        });
      }
      // The floor is FIXED — 0px at every size swept — so its ceiling is tight
      // and any return of the clip fails here. The bar is not: it eats 3.4px of
      // the aimed card at 390 and 10.5px at 264, and that has nothing to do
      // with the fan (centring the row changed it by 0.3px). That one is
      // recorded rather than thrown on, because a scene that is red every run
      // is a scene you stop reading — its ceiling is the measured worst plus
      // slack, so it catches a regression without crying every time.
      const report = `floor ${worst > 0 ? worst.toFixed(1) : 0}px ${side || '-'} · under the bar ${under > 0 ? under.toFixed(1) : 0}px`;
      if (worst > 2 || under > 12) throw new Error(`handclip: WORSE than recorded — ${report}`);
      console.log(`handclip: ${report}`);
    },
  },
  // The bag OUT of a fight, which is a different screen doing a different job:
  // in a battle every item acts on the kin that is out, and in the field a
  // salve has to pick somebody. Shot with a party where that choice is real —
  // several hurt, one down — because with one kin it cannot be got wrong.
  bagfield: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world';
      EK.enterMap('route_one', 5, 7, 'down');
      EK.G.mode = 'world'; EK.G.place = null;
      EK.G.party = ['pyrelynx', 'brookite', 'bramblor', 'gargolem']
        .map((id, i) => EK.mkMon(id, 18 + i * 2));
      Object.keys(EK.ITEMS).forEach((k, i) => { EK.G.bag[k] = 2 + i; });
      const p = EK.G.party;
      p[0].hp = Math.round(p[0].max * .30);
      p[1].hp = Math.round(p[1].max * .65);
      p[2].hp = 0;                            // somebody is down, so revive has a job
      EK.openScreen('bag');
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
    // The throw is ~3.5s of deliberate dead air — that is the point of it — so
    // the shutter has to wait for the card rather than for the default 1200ms.
    wait: 5200,
    needs: (EK) => !!EK.G.gotcha && !!EK.DEX[EK.G.gotcha.species],
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      // `G.mapId = 'route_one'` alone does NOT load route_one — `enterMap`
      // does. Set on its own it leaves Rowan's lab drawn behind the card, so
      // the first catch appeared to happen indoors.
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.enterMap('route_one', 9, 12, 'up');
      // 'mistspray' is a MOVE. This scene passed it as a species from the day
      // it was written, and the screen dutifully drew the graceful fallback —
      // a purple lozenge with two eyes — which is exactly what a real creature
      // with no art would look like. It read as a finished design for four
      // passes.
      //
      // …and posing it was the deeper fault, which took two more passes to see.
      // The hand-built object also carried `t: .9`, and a still waits 1200ms
      // after go() while the card dismisses itself at t > 2 — so this scene
      // photographed an empty room. The comment on `dexstarter` below has said
      // exactly that, about exactly this number, for several passes; the scene
      // it describes was never fixed. FIRST CATCH had therefore never been
      // looked at once.
      //
      // Caught for real now: a knocked-down wild kin, an orb with the odds the
      // bag prints, and whatever card the game makes out of that.
      EK.G.party = [EK.mkMon('cindercub', 12)];
      EK.G.bag = { prismorb: 40 };
      EK.STARTER_DECK.forEach(EK.grantCard);
      EK.startBattle({ foe: EK.mkMon('dewdrip', 6), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      const b = EK.B();
      b.foe.hp = 1; b.foe.status = 'shock';   // hurt and held: the shown odds hit 100%
      const beat = () => {
        const cur = EK.B();
        // Through `doAction`, the way the bag throws it — not `tryCatch`
        // directly, or the orb animation that holds the log never runs.
        if (cur && !cur.over && !cur.log) EK.submitLog(EK.doAction({ kind: 'item', id: 'prismorb' }));
        const d = EK.G.dialogue || EK.liveBattleMsg();
        if (d && !EK.G.gotcha) { d.hold = 0; EK.advanceDialogue(); }
      };
      for (let t = 60; t <= 6000; t += 120) setTimeout(beat, t);
    },
  },
  // The errand's counter on the payoff screen, driven through the REAL starter
  // pick — openScreen + screenSelect — so `note` is whatever the game computed,
  // not a string this scene handed it. The gotcha scene two above is the reason
  // that distinction is written down: it fed a move id in as a species and the
  // graceful fallback drew a convincing creature for four passes.
  dexstarter: {
    w: 760, h: 760,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.openScreen('starter');
      EK.screenSelect();
      if (!EK.G.gotcha) throw new Error('the starter pick produced no gotcha');
      if (!EK.G.gotcha.note) throw new Error('the first kin written down carries no tally');
      // t is left at 0 ON PURPOSE. The still waits 1200ms after go(), and the
      // gotcha dismisses itself at t > 2 — so the .9 the scene above sets puts
      // it at 2.1 by the time the shutter opens, i.e. gone. From 0 the wait
      // lands at 1.2s: past the pop (ends .57), short of the fade (starts 1.63).
    },
  },
  // The same line at its widest. A two-digit tally is wider than the "1 OF 19"
  // the starter can ever show, and this is a layout question — so the string
  // still comes from the game's own dexTally(), but the dex behind it is set up
  // rather than played to. It proves the line FITS; whether it appears on the
  // right catches is the suite's job, not this picture's.
  dexcatch: {
    w: 760, h: 760,
    // Posed on purpose, and it says so above — but it still has to come back
    // with a card in it. The scene this one is modelled on posed a card that
    // dismissed itself before the shutter and reported success for passes.
    needs: (EK) => !!EK.G.gotcha && !!EK.DEX[EK.G.gotcha.species] && !!EK.G.gotcha.note,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.DEX_ORDER.slice(0, 12).forEach((id) => EK.catchMon(id));
      EK.G.gotcha = { t: 0, species: 'dewdrip', name: 'Dewdrip',
        where: 'joined your party', note: EK.dexTally(), done: () => { EK.G.gotcha = null; } };
    },
  },
  // A first sighting. Driven through the real startBattle against a kin this
  // save has never met, so the toast is the game's decision — the wipe is .55s
  // and the toast holds 2.2s, which is the whole claim being photographed.
  dexsight: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.mode = 'world'; EK.enterMap('route_one', 9, 12, 'up');
      EK.startBattle({ foe: EK.mkMon('zaplet', 6), wild: true });
      // Walking in raises the place plaque, which is 17px of card sitting over
      // the thing being photographed. The plaque is not what this scene is for.
      EK.G.place = null;
    },
  },
  // The other three sighting sites deliver through the battle LOG, so the mark
  // arrives as a line in the description bar rather than a toast — a different
  // picture from the toast above, and one that had not been looked at.
  //
  // It cannot be filmed: `--film` grabs the canvas and the bar is a DOM overlay,
  // so nine frames of this came back as nine empty arenas. And a plain still
  // lands wherever the 1200ms wait falls, which is somewhere in a queue of lines
  // whose holds are .38s and .55s. So submit the log only as far as the dex
  // entry and play it `instant` — the real machinery, stopped on the real line.
  dexline: {
    w: 760, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      const bench = [EK.mkMon('zaplet', 8), EK.mkMon('dewdrip', 8)];
      EK.startBattle({ foe: bench[0], wild: false, npc: { id: 't_pell', name: 'Forager Pell' } });
      EK.G.dialogue = null;
      // The opening "Forager Pell wants to battle!" is a battleMsg queue that
      // keeps advancing on its own clock through the 1200ms wait, and it writes
      // to the SAME element battleLine does. The first cut of this scene set the
      // dex line and then the queue wrote over it — the shot came back with the
      // opening line and looked, at a glance, like the note had not been made.
      EK.G.battleMsg = null;
      const b = EK.G.battle;
      b.roster = bench; b.teamIdx = 0; bench[0].hp = 0;
      const log = [];
      EK.resolveFoeDown(log);
      const at = log.findIndex((e) => e.fx === 'dex');
      if (at < 0) throw new Error('the send-out log carries no dex note to photograph');
      // The line is the game's — read straight off the entry resolveFoeDown just
      // built — but it goes into the panel through the STATE, not through
      // battleLine. This tool calls renderDialogue() after go() to make the box
      // agree with G, so a string written at the element and not at G.battleMsg
      // is wiped a moment later: the second cut of this scene came back with no
      // description bar at all. Only the delivery is staged; the words are not.
      EK.G.battleMsg = { lines: [log[at].t], i: 0, hold: .12 };
      // And the toast is the other scene's picture. Clearing G.toast alone does
      // nothing — the element keeps its class until toastT runs out, which is
      // the tick's job, not the state's.
      EK.G.toastT = 0; EK.G.toast = '';
      document.getElementById('toast').classList.remove('on');
    },
  },
  // The dex entry for the one kin the game is built toward. Its habitat line
  // used to read "Not found in the wild. Not anywhere, really." — printed about
  // the thing with its own theme, its own opening line, its own reward, and a
  // promise elsewhere that it gathers on the shrine again. Seen-but-not-caught
  // is the state where the player most needs that line to be true.
  dexvespyr: {
    w: 900, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.DEX_ORDER.forEach((id, i) => { EK.seeMon(id); if (i % 3) EK.catchMon(id); });
      EK.G.dex.vespyr = 1;
      EK.openScreen('dex');
      EK.G.screen.i = EK.DEX_ORDER.indexOf('vespyr');
      EK.renderScreen();
      if (!/Waits in/.test(EK.habitat('vespyr'))) throw new Error('the shrine line is not the one on screen');
    },
  },
  // The same person, the same tile, the same shot — before and after the dex
  // knows. Ann exists to warn you about a creature and was still warning people
  // who had one in the party. A dialogue is a DOM panel, so these are stills;
  // the tool calls renderDialogue() after go(), which is what makes talkTo the
  // right way to drive it.
  annfresh: {
    w: 900, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      const ann = EK.MAPS.stillmere.npcs.find((n) => n.name === 'Sheller Ann');
      EK.enterMap('stillmere', ann.x, ann.y - 1, 'up');
      EK.G.place = null; EK.G.mode = 'world';
      EK.talkTo(ann);
    },
  },
  annkin: {
    w: 900, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.party.push(EK.mkMon('lanterneel', 14));
      EK.catchMon('lanterneel');
      const ann = EK.MAPS.stillmere.npcs.find((n) => n.name === 'Sheller Ann');
      EK.enterMap('stillmere', ann.x, ann.y - 1, 'up');
      EK.G.place = null; EK.G.mode = 'world';
      EK.talkTo(ann);
      if (!/Look at your hand/.test(EK.G.dialogue.lines.join(' '))) {
        throw new Error('Ann did not notice the kin in the party');
      }
    },
  },
  // Dorn guards a stretch of Route One. He loses, stays standing on it, and
  // watches you walk past it for the rest of the game — and used to say "Good
  // match. Go on." every single time. Two stills, same tile, same frame.
  // (Written out twice rather than shared: scene bodies are serialised into the
  // page, so there is no outer scope for a helper to live in.)
  dornheld: {
    w: 900, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.flags.t_dorn = 1;
      const dorn = EK.MAPS.route_one.npcs.find((n) => n.id === 't_dorn');
      EK.enterMap('route_one', dorn.x, dorn.y + 1, 'up');
      EK.G.place = null; EK.G.mode = 'world';
      EK.talkTo(dorn);
    },
  },
  dornpast: {
    w: 900, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.flags.t_dorn = 1;
      EK.G.been.emberwood = 1; EK.G.been.crown_hollow = 1;
      const dorn = EK.MAPS.route_one.npcs.find((n) => n.id === 't_dorn');
      EK.enterMap('route_one', dorn.x, dorn.y + 1, 'up');
      EK.G.place = null; EK.G.mode = 'world';
      EK.talkTo(dorn);
      if (!/something else/.test(EK.G.dialogue.lines.join(' '))) {
        throw new Error('Dorn did not notice how far you got');
      }
    },
  },
  // Rowan in the state that used to be wrong. Her one piece of navigation was
  // gated on dexCount(2) >= 8, so somebody who had already stood on the
  // mountain was still being sent "Crown Hollow, past the Warden" — past a man
  // who is not on the map any more.
  rowanback: {
    w: 900, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.DEX_ORDER.slice(0, 9).forEach((id) => EK.catchMon(id));
      EK.G.flags.t_hale = 1;
      EK.G.been.crown_hollow = 1;
      const rowan = EK.MAPS.lab.npcs[0];
      EK.enterMap('lab', rowan.x, rowan.y + 1, 'up');
      EK.G.place = null; EK.G.mode = 'world'; EK.G.dialogue = null;
      EK.talkTo(rowan);
      if (/past the Warden/.test(EK.G.dialogue.lines.join(' '))) {
        throw new Error('Rowan is still sending you past a man who has left');
      }
    },
  },
  // Vane names a price ladder and had never checked which rung you are on.
  vaneprism: {
    w: 900, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.gems = 5000;
      const vane = EK.MAPS.shop.npcs.find((n) => n.name === 'Vane');
      EK.enterMap('shop', vane.x, vane.y + 1, 'up');
      EK.G.place = null; EK.G.mode = 'world'; EK.G.dialogue = null;
      EK.talkTo(vane);
    },
  },
  // Wick's parting line in town is "I am going north. Try to keep up." He then
  // did not go: the Emberwood Wick appears the instant this fight is won, so
  // from that moment there were two of him, and at the end of a run three. Same
  // tile, same frame, before and after — the town has one fewer person in it.
  townwick: {
    w: 900, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      const wick = EK.MAPS.hollowbrook.npcs.find((n) => n.id === 't_wick1');
      EK.enterMap('hollowbrook', wick.x, wick.y + 3, 'up');
      EK.G.place = null; EK.G.mode = 'world';
      if (!EK.npcActive(wick)) throw new Error('Wick is not in town before the fight');
    },
  },
  towngone: {
    w: 900, h: 900,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.flags.t_wick1 = 1;
      const wick = EK.MAPS.hollowbrook.npcs.find((n) => n.id === 't_wick1');
      EK.enterMap('hollowbrook', wick.x, wick.y + 3, 'up');
      EK.G.place = null; EK.G.mode = 'world';
      if (EK.npcActive(wick)) throw new Error('Wick said he was going north and did not');
    },
  },
  // ---- the moment of deciding -------------------------------------------
  // Four states of the same screen, shot to be read side by side. The question
  // is not "does it draw" — it is what a player's eye actually has to collect
  // before choosing a card, and whether the screen weights those things the way
  // the decision does.
  dec_fresh: {
    w: 900, h: 1000,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'emberwood';
      EK.G.party = [EK.mkMon('pyrelynx', 24), EK.mkMon('brookite', 22)];
      EK.STARTER_DECK.forEach(EK.grantCard);
      EK.startBattle({ foe: EK.mkMon('bramblor', 23), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      EK.readIntent();
    },
  },
  dec_hurt: {
    w: 900, h: 1000,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'emberwood';
      EK.G.party = [EK.mkMon('pyrelynx', 24), EK.mkMon('brookite', 22)];
      EK.STARTER_DECK.forEach(EK.grantCard);
      EK.startBattle({ foe: EK.mkMon('bramblor', 23), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      const b = EK.B();
      b.mine.hp = Math.max(1, Math.round(b.mine.max * .14));
      b.mine.status = 'burn';
      b.dispM = b.tgtM = b.mine.hp;
      EK.readIntent();
    },
  },
  dec_broke: {
    w: 900, h: 1000,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'emberwood';
      EK.G.party = [EK.mkMon('pyrelynx', 24)];
      EK.STARTER_DECK.forEach(EK.grantCard);
      EK.startBattle({ foe: EK.mkMon('bramblor', 23), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      const b = EK.B();
      b.energy = 0;                       // spent: nothing in hand is playable
      EK.renderHand();
      EK.readIntent();
    },
  },
  dec_late: {
    w: 900, h: 1000,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'crown_hollow';
      EK.G.party = [EK.mkMon('magmane', 36), EK.mkMon('tsunaga', 34)];
      EK.G.cards = []; EK.G.deck = [];
      ['ember_spit', 'edge', 'whet', 'guard', 'focus', 'quickstep'].forEach((id) => {
        const c = EK.grantCard(id, true);
        if (c) { c.plus = 4; c.plays = 22; }
      });
      EK.startBattle({ foe: EK.mkMon('vespyr', 30), wild: true, legendary: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      EK.readIntent();
    },
  },
  // Sitting in the band the chip used to hide: above the middle of the foe's
  // roll and at or under its top. The old line said "about N coming" and stayed
  // quiet; the swing killed you here 31% of the time.
  dec_band: {
    w: 900, h: 1000,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.mapId = 'emberwood';
      EK.G.party = [EK.mkMon('pyrelynx', 24), EK.mkMon('brookite', 22)];
      EK.STARTER_DECK.forEach(EK.grantCard);
      EK.startBattle({ foe: EK.mkMon('bramblor', 25), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      const b = EK.B();
      const it = EK.readIntent();
      b.mine.hp = Math.max(1, (it.hi != null ? it.hi : it.dmg));
      b.dispM = b.tgtM = b.mine.hp;
      EK.readIntent();
      EK.renderHand();
    },
  },
  // The forced switch: your kin is down, the fight is still running, and you
  // must send somebody out. A decision made under pressure with the arena
  // hidden behind the screen.
  dec_forced: {
    w: 900, h: 1000,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.mapId = 'emberwood';
      EK.G.party = [EK.mkMon('pyrelynx', 24), EK.mkMon('brookite', 22), EK.mkMon('kindlark', 20)];
      EK.STARTER_DECK.forEach(EK.grantCard);
      EK.startBattle({ foe: EK.mkMon('bramblor', 25), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      const b = EK.B();
      b.mine.hp = 0; b.dispM = b.tgtM = 0;
      EK.G.party[1].hp = Math.round(EK.G.party[1].max * .3);
      EK.openScreen('party', { force: true });
    },
  },
  // The bag opened mid-fight, which covers the arena and both HP bars. It has
  // always brought your HP down with it; it had not brought what is coming at
  // it, which is the other half of "will a Salve do, or do I need the big one".
  dec_bag: {
    w: 900, h: 1000,
    go: (EK) => {
      EK.G.dialogue = null; EK.G.screen = null;
      EK.takeStarter('cindercub');
      EK.G.dialogue = null; EK.G.gotcha = null; EK.G.screen = null;
      EK.G.mapId = 'emberwood';
      EK.G.party = [EK.mkMon('pyrelynx', 24)];
      EK.G.bag = { salve: 3, greatsalve: 1, bloomorb: 4, revive: 1 };
      EK.STARTER_DECK.forEach(EK.grantCard);
      EK.startBattle({ foe: EK.mkMon('bramblor', 25), wild: true });
      EK.G.wipe = 0; EK.G.battleMsg = null;
      const b = EK.B();
      b.mine.hp = Math.max(1, Math.round(b.mine.max * .18));
      b.dispM = b.tgtM = b.mine.hp;
      EK.readIntent();
      EK.openScreen('bag');
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

// `--touch` is the difference between a narrow window and a phone, and the two
// are not the same picture. The game decides at boot with `pointer: coarse` or
// `maxTouchPoints > 0`, and a plain Playwright page has neither — so every
// `--size 390x760` shot ever taken was the NON-touch branch of `layoutFor`: the
// stage centred with dead margins above and below, no control band, no
// top-align. The actual phone layout had never been photographed once, not
// because nobody looked but because this tool could not produce it.
const TOUCH = argv.includes('--touch');
if (TOUCH) argv.splice(argv.indexOf('--touch'), 1);

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
    ...(TOUCH ? { hasTouch: true, isMobile: true } : {}),
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
    } else await page.waitForTimeout(sc.wait || 1200);

    // Did the picture end up containing its subject?
    //
    // This is the generalisation of the worst class of fault this tool has
    // produced. Three separate scenes have handed back a photograph of the room
    // the beat happens in, with no beat in it: `gotcha` posed a card carrying
    // `t: .9` and a still waits long enough for it to dismiss itself, `levelup`
    // ran a beat loop that never resolved the fight, and `evolve` built a state
    // the game cannot reach. Every one of them was reported as a successful
    // shot, and two of them were looked at and believed.
    //
    // A scene may now declare what has to be true when the shutter opens. The
    // tool cannot know what a scene is for — but the scene does, and saying so
    // costs one line.
    if (sc.needs) {
      const held = await page.evaluate(`(${sc.needs.toString()})(window.EK)`);
      if (!held) console.error(`  !! ${name}: the shot does not contain its subject — ${sc.needs}`);
    }
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
