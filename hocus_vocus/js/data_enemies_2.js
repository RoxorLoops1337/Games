// Hocus Vocus: Act II roster (chapter 2): Scrollopolis, the neon city of screens where it is always 2 am and nobody looks up.
// Owner: the Act II enemy designer. Pure data: DATA.add('enemies', ...) and DATA.addEncounters(2, ...).
// Schema and AI rules: DESIGN.md 4.5. Numbers: CONTENT_SPEC.md 4.2 (no encore, chapter 2). No functions, no dashes,
// no randomness of its own. Ids, names, tiers and sizes are the fixed roster (DATA.ROSTER). Nothing here reads a clock or the DOM.
// Every name, title, move name, bark, phase line, lore line and tag is copied from hocus_vocus/plan/HV_ENEMIES.md section 3; ids, numbers,
// ops and AI never change for the re-theme. Tags are display only (the Who's Who chips).
//
// THEME. The city's answer to "the lead hero takes everything" is the Feed: Tangled pins the party in its spots, Starstruck takes a
// hero's whole turn, and half the cast reaches past the lead hero to the backing spot or hits both heroes at once. Every answer is a
// SPOT decision: swap the debuffed hero out of the lead (Filter Fairy), put the hero you can afford to lose in the lead before a
// Starstruck lands (Clickbait Goblin, Trendsetter, Doomscroll Moth), aim your Block at the backing hero (Autoplay Snake, Selfie Stick),
// or untangle with status_tangle before the finisher arrives (Scrollspinner). Intent numbers are live: Touch Up, Big Squeeze, World
// Wide Web and Scroll Wave re-read the board, so the answer is visible on the intent bubble the moment you play it.
//
// THE ROSTER (pattern the player learns, and the answer). "Beat" = one intent; turn counts are the enemy's own turns.
//   chochin          Flamebait. Spicy Opinion (Sizzle), Pile On (Crescendo to EVERY enemy) on its second beat, Flame War on both heroes.
//                    Two turns to win it over before anyone is lit. Sizzle proof; leaves Sizzle 2 behind when it is won over.
//   karakuri_puppet  Clickbait Goblin. Fixed combo Teaser Jab, Thumbnail Flurry, SHOCK REVEAL (heavy, Starstruck on the lead hero).
//                    Win it over in two turns or choose who is starstruck. All Caps once (Volume 3) when cracked below half HP,
//                    which delays the reveal a turn.
//   nopperabo        Filter Fairy. Beauty Filter (Muffled 2, Wobbly 1 on the lead hero) then two Touch Ups that hit harder per debuff
//                    on the LEAD hero. Swap the debuffed hero out and Touch Up falls back to its base. A tangler beside it takes that
//                    answer away.
//   drowned_samurai  Unskippable Ad. Sequins 4 every turn, Jingle Jab, Skip in Five (Block: do not pour damage into it), then a
//                    telegraphed Final Offer. Offers early once if cornered below 40 percent.
//   koi_spirit       Hug Emoji. Weighted: Heart Splash on BOTH heroes, Thumbs Down. Every other turn a Big Hug heals the weakest enemy
//                    if an ally is hurt, and it heals its friends once more when it is won over. The priority target of any group it
//                    stands in.
//   tsukumogami      Notification Imp. Ping Storm first (2 status_blot cards into the draw pile), Pocket Buzz, Push Alert (a junk card
//                    on TOP of the draw pile), and a heavy Ninety-Nine Plus on turns 3, 6, 9. Clogs the hand, then crushes.
//   silk_weaver      Algo Rhythm. Keep Watching first (Tangled 1 and a status_tangle card on top of the draw pile), Spawn a Bot on
//                    turns 2, 5, 8 while fewer than 2 Sidekicks live, Suggested Post. Win it over before the bots pile up.
//   nure_onna        Autoplay Snake. Autoplay Bite (BACKING spot, Earworm), Endless Coil (heavy on the LEAD hero), Swipe Lash
//                    (backing). Block the backing hero or use the Spotlight.
//   rokurokubi       Selfie Stick. Over the Shoulder (two hits on the BACKING spot), Photobomb (heavy, backing), Over the Shoulder,
//                    Fold Away. Never touches the lead hero. Pairs cruelly with any tangler.
//   ittan_momen      Phone Charger. Weighted: Cord Wrap (a hit and Tangled 1), Full Battery, Flap About (Block and Shimmy 1: open with
//                    a cheap poke).
//   drowned_general  Comment Troll. Start a Thread (a Grumble Cloud and Crescendo 1), then Who Asked?, Reply All (both heroes), Who
//                    Asked?; one more cloud on turns 3, 6, 9 when none is left. The moment it drops below half HP the phase gives Volume
//                    and Block and re-rolls its intent to the Ratio (heavy, Muffled on both). The build-around threat: Crescendo
//                    snowballs, so win it over fast.
//   puppet_master    Trendsetter. Start a Trend (2 Copycat Cutouts), Hashtag Lash (3 random hits), Boost Post (Volume to a cutout),
//                    Trending Now (heavy, STARSTRUCK on the lead hero). Reposts a cutout below half HP (pokes are wasted: win them over
//                    outright) and starts a New Challenge with one more on turns 3, 6, 9.
//   umibozu          Doomscroll Moth. Scroll Wave on BOTH heroes that grows with its own turn count (6 + turn, cap 12): stalling is
//                    punished. Blue Light (Muffled and Wobbly on both), Screen Glare (heavy, STARSTRUCK) on turns 3 and 7, and one
//                    Infinite Scroll below 40 percent HP.
//   spiderling       Botling. Auto Like twice (Earworm), then Skitter (Shimmy). Harmless alone, an earworm in a swarm.
//   paper_puppet     Copycat Cutout. Copy Dance, Copy Clap on the backing spot. Ten HP: gone in a hit.
//   lantern_wisp     Grumble Cloud. Snarky Reply (Sizzle 2), then Agree Loudly (Block for an ally). A lone cloud only snarks.
//                    Sizzle proof.
//   boss_jorogumo    Scrollspinner, Queen of the Feed. Form 1, the Avatar (Sequins 4, the perfect filter): Hatch Botlings (2
//                    Botlings), Keep Scrolling (Tangled 1 on both heroes and a status_tangle card on top of the draw pile), then Big
//                    Squeeze (heavy, lead) which reads the Tangled on its victim: 12 untangled, 20 tangled. Selfie Flurry and Air Kiss
//                    (backing spot Earworm) between, Keep Scrolling again on turns 6 and 10, One More Bot when the brood is gone.
//                    Below half HP she drops the filter (Sequins gone, Volume 2, say line) and re-rolls at once to Form 2, the Spinner:
//                    Spin the Feed (Tangled 2 on both, another status_tangle card), World Wide Web (heavy on BOTH heroes, 7
//                    untangled, 12 with Tangled 2), Eight-Leg Swipe, Air Kiss, and a once-only Refresh Frenzy below 20 percent.
//                    The lesson never changes: the Feed is the setup, the finisher scales with it, and status_tangle (Untangle, 1
//                    Breath) cuts it.
//
// GROUPS. Smallest enemy first and tallest last, so tall sprites stand in the back lanes. Pairs are built on purpose: Flamebait lights
// up an Unskippable Ad, Tangled pins a backing-spot target (charger and selfie stick), Tangled takes away the swap that answers Touch Up
// (filter fairy and charger), the Hug Emoji heals behind a backing-spot earworm. Big groups are gated to the late map; the four-enemy
// group is a bot farm (2 seeded Botlings and an Algo Rhythm).
//
// SUMMON CAP. A summoner never has more than 2 living Sidekicks: every summon that is not an opener is gated by minions:{lt:3-n}, and a
// group never holds two summoners or seeds a Sidekick next to an opener that would pass 2.
//
// BALANCE. HP sits in the upper half of each CONTENT_SPEC band so an enemy usually acts three times before it is won over, which is what
// lets a signature show. tests/hocus_vocus_enemies_2.test.mjs measures the rest with REAL combats (COMBAT.simulate, synthetic hero
// decks): turns per group, HP lost, the win rate, how often each signature move lands, and that the counter-play above really pays.
// RB_ENEMIES2_REPORT=1 prints the tables; RB_ENEMIES2_TRACE=boss_jorogumo prints one fight turn by turn. Numbers are a first tuning
// for the balance wave, not gospel.
//
// BALANCE PASS 1 (balance bot report 1, about 22,000 runs, greedy party). Chapter 2 was the soft act: its Rivals cost 8 percent of party
// HP per fight (Act I: 14, Act III: 12) and its Headliner 14 percent (Act I Headliner: 22), and the greedy party cleared 82 percent of
// chapters 1 to 2 where the spec asks for 60 to 80. The pass is shaped, not flat: normals about x1.2 in threat (HP and hits about x1.1
// each), Rivals about x1.55 (HP to the top of the band, hits about x1.25 to x1.3), the Headliner HP 240 to 246 up to 258 to 264 with
// its big hits (embrace, kiss, web) about x1.1. The Headliner is the one knob that moves the chapter clear rate: with its HP at the band
// top (274 to 280) and the same hits it cost the greedy party 22 percent of attempts (7 before the pass) and chapter 2 sat at 65 percent
// clear; the setting here (HP 258 to 264, same hits) is estimated at about 18 percent of attempts and about 67 percent clear (refights
// at the recorded entry HP; not run end to end). The knob: one point of Headliner loss rate is about 0.8 points of chapter 2 clear.
// Inside the normals the spread was evened out by measurement, enemy by enemy and group by group: the soft ones were raised
// (ittan_momen, tsukumogami, silk_weaver, karakuri_puppet, nopperabo, chochin) and the hard ones trimmed (drowned_samurai HP 46 to 54
// down to 40 to 46, nure_onna HP 50 to 58 down to 46 to 54 and Coil 15 to 14, Lash 7 to 6; rokurokubi only +1 on the Lunge). The
// enemies that never stand alone in a group (silk_weaver, tsukumogami, koi_spirit, ittan_momen, rokurokubi) are judged by what they add
// to their groups, not by a solo fight: their openers (snare, discord, brood) are slow burns that a lone fight ends before they land.
// The ch2_flooded_bridge group (the two trimmed hard enemies) moved from min 0.6 to 0.5 so the late map keeps its level.
// ART NOTES for art_enemies_2.js: the look of each creature is in HV_ENEMIES.md 3.1 and 3.4 (the lore lines carry it too). Every
// creature has a screen and looks down; won over, it looks up at the moon. Scrollspinner: phase 0 the Avatar, a filtered influencer in
// a ring-light halo; phase 1 the Spinner, the gown torn open on a spider's body with eight phone-screen eyes.
(() => {
  DATA.add('enemies', {
    // ==================================================================================================================
    // CREATURES (normal)
    // ==================================================================================================================
    chochin: {
      id: 'chochin', name: 'Flamebait', chapter: 2, tier: 'normal', size: 'm',
      hp: [33, 39],
      moves: {
        kindle: { name: 'Pile On', kind: 'buff', say: 'Everybody pile on! Louder!', fx: [{ op: 'status', s: 'ritual', n: 1, tgt: 'allEnemies' }] },
        scorch: { name: 'Spicy Opinion', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front', el: 'fire' }, { op: 'status', s: 'burn', n: 3, tgt: 'front' }] },
        cinders: { name: 'Flame War', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'both', el: 'fire' }, { op: 'status', s: 'burn', n: 3, tgt: 'both' }] },
      },
      ai: { seq: ['scorch', 'kindle', 'cinders'] },
      hooks: [{ on: 'onDeath', fx: [{ op: 'status', s: 'burn', n: 2, tgt: 'front' }] }],
      immune: ['burn'],
      art: { id: 'chochin' },
      lore: 'A matchstick with a flaming head and an opinion about everything, served piping hot. It lights up every thread it touches, and leaves one last spark on its way out.',
      tags: ['construct', 'spirit'],
    },

    karakuri_puppet: {
      id: 'karakuri_puppet', name: 'Clickbait Goblin', chapter: 2, tier: 'normal', size: 'm',
      hp: [47, 55],
      moves: {
        jab: { name: 'Teaser Jab', kind: 'attack', fx: [{ op: 'dmg', n: 9, tgt: 'front' }] },
        flurry: { name: 'Thumbnail Flurry', kind: 'multi', fx: [{ op: 'dmg', n: 5, hits: 2, tgt: 'front' }] },
        smash: { name: 'Shock Reveal', kind: 'heavy', say: 'YOU WILL NOT BELIEVE THIS.', fx: [{ op: 'dmg', n: 10, tgt: 'front' }, { op: 'status', s: 'stun', n: 1, tgt: 'front' }] },
        overwind: { name: 'All Caps', kind: 'buff', say: 'MUST. CLICK. NOW.', fx: [{ op: 'status', s: 'might', n: 3, tgt: 'self' }] },
      },
      ai: { seq: ['jab', 'flurry', 'smash'], rules: [{ if: { hpLt: 0.5 }, do: 'overwind', once: true }] },
      art: { id: 'karakuri_puppet' },
      lore: 'A wind-up goblin made of thumbnails and big red arrows, with exactly three tricks. The first two are fine, it swears the third will shock you, and it always does.',
      tags: ['construct', 'spirit'],
    },

    nopperabo: {
      id: 'nopperabo', name: 'Filter Fairy', chapter: 2, tier: 'normal', size: 'm',
      hp: [43, 51],
      moves: {
        stare: { name: 'Beauty Filter', kind: 'debuff', fx: [{ op: 'status', s: 'weak', n: 2, tgt: 'front' }, { op: 'status', s: 'frail', n: 1, tgt: 'front' }] },
        grasp: { name: 'Touch Up', kind: 'attack', fx: [{ op: 'dmg', n: { base: 6, per: 'debuffs', who: 'target', mul: 3, cap: 14 }, tgt: 'front' }] },
      },
      ai: { seq: ['stare', 'grasp', 'grasp'] },
      art: { id: 'nopperabo' },
      lore: 'A tiny fairy with a ring-light halo and no face of its own, which is why it keeps fixing everyone else\'s. The more filters it puts on you, the harder it pokes.',
      tags: ['spirit', 'void'],
    },

    drowned_samurai: {
      id: 'drowned_samurai', name: 'Unskippable Ad', chapter: 2, tier: 'normal', size: 'l',
      hp: [40, 46],
      start: [{ op: 'status', s: 'plating', n: 4, tgt: 'self' }],
      moves: {
        cut: { name: 'Jingle Jab', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }] },
        stance: { name: 'Skip in Five', kind: 'defend', say: 'Skip in five... four...', fx: [{ op: 'block', n: 8, tgt: 'self' }] },
        iai: { name: 'Final Offer', kind: 'heavy', say: 'BUY NOW!', fx: [{ op: 'dmg', n: 14, tgt: 'front' }] },
      },
      ai: { seq: ['cut', 'stance', 'iai'], rules: [{ if: { hpLt: 0.4 }, do: 'iai', once: true }] },
      art: { id: 'drowned_samurai' },
      lore: 'An advert that was told to keep playing until somebody watched it to the end. Nobody ever has, so it is still playing, very politely, in the middle of the street.',
      tags: ['construct'],
    },

    koi_spirit: {
      id: 'koi_spirit', name: 'Hug Emoji', chapter: 2, tier: 'normal', size: 'm',
      hp: [35, 41],
      moves: {
        splash: { name: 'Heart Splash', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'both' }] },
        slap: { name: 'Thumbs Down', kind: 'attack', fx: [{ op: 'dmg', n: 9, tgt: 'front' }] },
        mend: { name: 'Big Hug', kind: 'heal', say: 'Aww. Sending hugs.', fx: [{ op: 'heal', n: 12, tgt: 'lowestEnemy' }] },
      },
      ai: { weighted: [['splash', 3], ['slap', 2]], noRepeat: 2, rules: [{ if: { allyHpLt: 0.7, turnEvery: [2, 1] }, do: 'mend' }] },
      hooks: [{ on: 'onDeath', fx: [{ op: 'heal', n: 6, tgt: 'allEnemies' }] }],
      art: { id: 'koi_spirit' },
      lore: 'A round yellow emoji with its arms out, sent to cheer up anyone in the thread who is losing. It hugs its friends better and splashes everyone else with tiny hearts.',
      tags: ['spirit'],
    },

    tsukumogami: {
      id: 'tsukumogami', name: 'Notification Imp', chapter: 2, tier: 'normal', size: 'm',
      hp: [35, 42],
      moves: {
        discord: { name: 'Ping Storm', kind: 'debuff', say: 'DING! DING!', fx: [{ op: 'add', card: 'status_blot', n: 2, to: 'draw' }] },
        clatter: { name: 'Pocket Buzz', kind: 'attack', fx: [{ op: 'dmg', n: 9, tgt: 'front' }] },
        strum: { name: 'Push Alert', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }, { op: 'add', card: 'status_blot', n: 1, to: 'draw', top: true }] },
        crescendo: { name: 'Ninety-Nine Plus', kind: 'heavy', say: 'DING! DING! DING!', fx: [{ op: 'dmg', n: 12, tgt: 'front' }, { op: 'add', card: 'status_blot', n: 1, to: 'draw', top: true }] },
      },
      ai: { open: ['discord'], seq: ['clatter', 'strum'], rules: [{ if: { turnEvery: [3, 2] }, do: 'crescendo' }] },
      art: { id: 'tsukumogami' },
      lore: 'A red-dot imp that lives in the corner of every screen in the city and taps you on the shoulder about nothing. It piles up pings until you cannot see your own hand.',
      tags: ['spirit', 'construct'],
    },

    silk_weaver: {
      id: 'silk_weaver', name: 'Algo Rhythm', chapter: 2, tier: 'normal', size: 'm',
      hp: [33, 40],
      moves: {
        snare: { name: 'Keep Watching', kind: 'debuff', say: 'Stay put, dear. One more.', fx: [{ op: 'status', s: 'bind', n: 1, tgt: 'front' }, { op: 'add', card: 'status_tangle', n: 1, to: 'draw', top: true }] },
        fang: { name: 'Suggested Post', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'front', el: 'poison' }] },
        hatch: { name: 'Spawn a Bot', kind: 'summon', fx: [{ op: 'summon', enemy: 'spiderling', n: 1 }] },
      },
      ai: { open: ['snare'], seq: ['fang', 'fang', 'snare'], rules: [{ if: { minions: { lt: 2 }, turnEvery: [3, 1] }, do: 'hatch' }] },
      art: { id: 'silk_weaver' },
      lore: 'A clicking little machine that learns what you like and serves you more of it until you cannot move. It means well, and it has never once let anybody go to bed.',
      tags: ['construct', 'insect'],
    },

    nure_onna: {
      id: 'nure_onna', name: 'Autoplay Snake', chapter: 2, tier: 'normal', size: 'l',
      hp: [46, 54],
      moves: {
        fang: { name: 'Autoplay Bite', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'back', el: 'poison' }, { op: 'status', s: 'poison', n: 2, tgt: 'back' }] },
        lash: { name: 'Swipe Lash', kind: 'attack', fx: [{ op: 'dmg', n: 6, tgt: 'back' }] },
        coil: { name: 'Endless Coil', kind: 'heavy', say: 'Just one more, dear.', fx: [{ op: 'dmg', n: 14, tgt: 'front' }] },
      },
      ai: { seq: ['fang', 'coil', 'lash'] },
      art: { id: 'nure_onna' },
      lore: 'A long snake whose body is an endless feed: the more you look, the longer it gets. It nips whoever stands at the back, and wraps the rest in just one more.',
      tags: ['beast'],
    },

    rokurokubi: {
      id: 'rokurokubi', name: 'Selfie Stick', chapter: 2, tier: 'normal', size: 'm',
      hp: [34, 41],
      moves: {
        reach: { name: 'Over the Shoulder', kind: 'multi', fx: [{ op: 'dmg', n: 4, hits: 2, tgt: 'back' }] },
        lunge: { name: 'Photobomb', kind: 'heavy', fx: [{ op: 'dmg', n: 12, tgt: 'back' }] },
        coil: { name: 'Fold Away', kind: 'defend', fx: [{ op: 'block', n: 8, tgt: 'self' }] },
      },
      ai: { seq: ['reach', 'lunge', 'reach', 'coil'] },
      art: { id: 'rokurokubi' },
      lore: 'By day, a quiet phone on a cafe table. By night, a very long selfie stick that reaches right over your shoulder to get the backing hero in the shot.',
      tags: ['construct'],
    },

    ittan_momen: {
      id: 'ittan_momen', name: 'Phone Charger', chapter: 2, tier: 'normal', size: 'm',
      hp: [34, 41],
      moves: {
        wrap: { name: 'Cord Wrap', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }, { op: 'status', s: 'bind', n: 1, tgt: 'front' }] },
        squeeze: { name: 'Full Battery', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
        billow: { name: 'Flap About', kind: 'defend', fx: [{ op: 'block', n: 8, tgt: 'self' }, { op: 'status', s: 'dodge', n: 1, tgt: 'self' }] },
      },
      ai: { weighted: [['wrap', 2], ['squeeze', 2], ['billow', 1]], noRepeat: 1 },
      art: { id: 'ittan_momen' },
      lore: 'A charging cable that went looking for a phone at 2 am and now wraps around anything warm. It only lets go at one hundred percent.',
      tags: ['construct'],
    },

    // ==================================================================================================================
    // RIVALS (elite)
    // ==================================================================================================================
    drowned_general: {
      id: 'drowned_general', name: 'Comment Troll', chapter: 2, tier: 'elite', size: 'l',
      hp: [102, 114],
      moves: {
        muster: { name: 'Start a Thread', kind: 'summon', say: 'First! Everybody, pile on.', fx: [{ op: 'summon', enemy: 'lantern_wisp', n: 1 }, { op: 'status', s: 'ritual', n: 1, tgt: 'self' }] },
        saber: { name: 'Who Asked?', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
        sweep: { name: 'Reply All', kind: 'attack', fx: [{ op: 'dmg', n: 8, tgt: 'both' }] },
        call: { name: 'More Replies', kind: 'summon', fx: [{ op: 'summon', enemy: 'lantern_wisp', n: 1 }] },
        crest: { name: 'Ratio', kind: 'heavy', say: 'RATIO.', fx: [{ op: 'dmg', n: 21, tgt: 'front' }, { op: 'status', s: 'weak', n: 1, tgt: 'both' }] },
      },
      ai: {
        open: ['muster'],
        seq: ['saber', 'sweep', 'saber'],
        rules: [{ if: { minions: { lt: 1 }, turnEvery: [3, 2] }, do: 'call' }],
      },
      phases: [{
        at: 0.5,
        say: 'I will NOT be scrolled past!',
        fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }, { op: 'block', n: 8, tgt: 'self' }],
        ai: {
          open: ['crest'],
          seq: ['saber', 'sweep', 'saber'],
          rules: [{ if: { minions: { lt: 1 }, turnEvery: [3, 2] }, do: 'call' }],
        },
      }],
      art: { id: 'drowned_general' },
      lore: 'It has never finished a song in its life, but it has a lot to say about yours. Deep down, it just wants a reply.',
      tags: ['spirit'],
    },

    puppet_master: {
      id: 'puppet_master', name: 'Trendsetter', chapter: 2, tier: 'elite', size: 'l',
      hp: [110, 120],
      moves: {
        strings: { name: 'Start a Trend', kind: 'summon', say: 'Everyone, do the dance. Now.', fx: [{ op: 'summon', enemy: 'paper_puppet', n: 2 }] },
        restock: { name: 'New Challenge', kind: 'summon', say: 'One more for the challenge.', fx: [{ op: 'summon', enemy: 'paper_puppet', n: 1 }] },
        lash: { name: 'Hashtag Lash', kind: 'multi', fx: [{ op: 'dmg', n: 10, hits: 3, tgt: 'random' }] },
        tighten: { name: 'Boost Post', kind: 'attack', fx: [{ op: 'dmg', n: 14, tgt: 'front' }, { op: 'status', s: 'might', n: 2, tgt: 'otherEnemy' }] },
        marionette: { name: 'Trending Now', kind: 'heavy', say: 'Not you. YOU.', fx: [{ op: 'dmg', n: 16, tgt: 'front' }, { op: 'status', s: 'stun', n: 1, tgt: 'front' }] },
        mend: { name: 'Repost', kind: 'heal', fx: [{ op: 'heal', n: 12, tgt: 'lowestEnemy' }] },
      },
      ai: {
        open: ['strings'],
        seq: ['lash', 'tighten', 'marionette'],
        rules: [
          { if: { allyHpLt: 0.5 }, do: 'mend' },
          { if: { minions: { lt: 2 }, turnEvery: [3, 2] }, do: 'restock' },
        ],
      },
      art: { id: 'puppet_master' },
      lore: 'A glittering puppeteer who decides what the whole city dances to this week, and next week, and the week after. Its strings run to every phone in town, and it has not had a new idea in years.',
      tags: ['folk', 'void'],
    },

    umibozu: {
      id: 'umibozu', name: 'Doomscroll Moth', chapter: 2, tier: 'elite', size: 'l',
      hp: [112, 124],
      moves: {
        slam: { name: 'Scroll Wave', kind: 'attack', fx: [{ op: 'dmg', n: { base: 8, per: 'turn', mul: 1, cap: 14 }, tgt: 'both' }] },
        brine: { name: 'Blue Light', kind: 'debuff', say: 'Shhh. Just one more.', fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'both' }, { op: 'status', s: 'frail', n: 1, tgt: 'both' }] },
        toll: { name: 'Screen Glare', kind: 'heavy', say: 'LOOK AT THIS ONE.', fx: [{ op: 'dmg', n: 15, tgt: 'front' }, { op: 'status', s: 'stun', n: 1, tgt: 'front' }] },
        maelstrom: { name: 'Infinite Scroll', kind: 'heavy', say: 'The scroll never ends.', fx: [{ op: 'dmg', n: 16, tgt: 'both' }] },
      },
      ai: {
        seq: ['slam', 'brine', 'slam'],
        rules: [
          { if: { hpLt: 0.4 }, do: 'maelstrom', once: true },
          { if: { turnEvery: [4, 2] }, do: 'toll' },
        ],
      },
      art: { id: 'umibozu' },
      lore: 'A giant sleepy moth drawn to the glow of every screen in the city, its wings scrolling and scrolling. It wants nothing but one more swipe, and the quiet comes with it.',
      tags: ['insect'],
    },

    // ==================================================================================================================
    // SIDEKICKS (minion: size s, simple, one accent each)
    // ==================================================================================================================
    spiderling: {
      id: 'spiderling', name: 'Botling', chapter: 2, tier: 'minion', size: 's',
      hp: [10, 12],
      moves: {
        nip: { name: 'Auto Like', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'front', el: 'poison' }, { op: 'status', s: 'poison', n: 1, tgt: 'front' }] },
        skitter: { name: 'Skitter', kind: 'buff', fx: [{ op: 'status', s: 'dodge', n: 1, tgt: 'self' }] },
      },
      ai: { seq: ['nip', 'nip', 'skitter'] },
      art: { id: 'spiderling' },
      lore: 'A tiny spider-shaped bot no bigger than a coin, which likes everything instantly and without looking. It nips first and never reads the post.',
      tags: ['insect', 'construct'],
    },

    paper_puppet: {
      id: 'paper_puppet', name: 'Copycat Cutout', chapter: 2, tier: 'minion', size: 's',
      hp: [10, 12],
      moves: {
        flail: { name: 'Copy Dance', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }] },
        clap: { name: 'Copy Clap', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'back' }] },
      },
      ai: { seq: ['flail', 'clap'] },
      art: { id: 'paper_puppet' },
      lore: 'Cut out of last week\'s trend and hung on someone else\'s strings. It knows exactly one dance, and the strings do the dancing.',
      tags: ['construct', 'folk'],
    },

    lantern_wisp: {
      id: 'lantern_wisp', name: 'Grumble Cloud', chapter: 2, tier: 'minion', size: 's',
      hp: [10, 13],
      moves: {
        singe: { name: 'Snarky Reply', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'front', el: 'fire' }, { op: 'status', s: 'burn', n: 2, tgt: 'front' }] },
        warm: { name: 'Agree Loudly', kind: 'defend', fx: [{ op: 'block', n: 5, tgt: 'otherEnemy' }] },
      },
      ai: { seq: ['singe', 'warm'], rules: [{ if: { alone: true }, do: 'singe' }] },
      immune: ['burn'],
      art: { id: 'lantern_wisp' },
      lore: 'A small grey cloud that drifted off a comment thread, muttering at everyone. Sing to it kindly and it rains a tiny rainbow, but until then it agrees with every grump nearby.',
      tags: ['spirit'],
    },

    // ==================================================================================================================
    // HEADLINER (boss): Scrollspinner, Queen of the Feed. Form 1 = the Avatar (control, Sequins). Form 2 = the Spinner (offence, no Sequins).
    // ==================================================================================================================
    boss_jorogumo: {
      id: 'boss_jorogumo', name: 'Scrollspinner', title: 'Queen of the Feed', chapter: 2, tier: 'boss', size: 'xl',
      hp: [258, 264],
      start: [{ op: 'status', s: 'plating', n: 4, tgt: 'self' }],
      moves: {
        // form 1: the Avatar
        brood: { name: 'Hatch Botlings', kind: 'summon', say: 'Welcome, little ones. Like everything!', fx: [{ op: 'summon', enemy: 'spiderling', n: 2 }] },
        hatch: { name: 'One More Bot', kind: 'summon', say: 'One more for the feed, little one.', fx: [{ op: 'summon', enemy: 'spiderling', n: 1 }] },
        snare: { name: 'Keep Scrolling', kind: 'debuff', say: 'Stay, sweetie. Nobody leaves the feed.', fx: [{ op: 'status', s: 'bind', n: 1, tgt: 'both' }, { op: 'add', card: 'status_tangle', n: 1, to: 'draw', top: true }] },
        embrace: { name: 'Big Squeeze', kind: 'heavy', say: 'Group hug! Nobody scrolls alone.', fx: [{ op: 'dmg', n: { base: 13, per: 'status', s: 'bind', who: 'target', mul: 9, cap: 22 }, tgt: 'front' }] },
        kiss: { name: 'Air Kiss', kind: 'attack', fx: [{ op: 'dmg', n: 12, tgt: 'back', el: 'poison' }, { op: 'status', s: 'poison', n: 3, tgt: 'back' }] },
        fan: { name: 'Selfie Flurry', kind: 'multi', fx: [{ op: 'dmg', n: 5, hits: 3, tgt: 'random' }] },
        // form 2: the Spinner
        legs: { name: 'Eight-Leg Swipe', kind: 'multi', say: 'Swipe. Swipe. SWIPE.', fx: [{ op: 'dmg', n: 4, hits: 4, tgt: 'random' }] },
        spin: { name: 'Spin the Feed', kind: 'debuff', say: 'One post. A thousand. Hold still.', fx: [{ op: 'status', s: 'bind', n: 2, tgt: 'both' }, { op: 'add', card: 'status_tangle', n: 1, to: 'draw', top: true }] },
        web: { name: 'World Wide Web', kind: 'heavy', say: 'Everyone, all at once, forever.', fx: [{ op: 'dmg', n: { base: 8, per: 'status', s: 'bind', who: 'target', mul: 4, cap: 14 }, tgt: 'both' }] },
        frenzy: { name: 'Refresh Frenzy', kind: 'multi', say: 'Refresh! Refresh! Do not look away!', fx: [{ op: 'dmg', n: 3, hits: 6, tgt: 'random' }] },
      },
      ai: {
        open: ['brood', 'snare'],
        seq: ['fan', 'kiss'],
        rules: [
          { if: { heroStatus: { s: 'bind' } }, do: 'embrace' },
          { if: { minions: { lt: 1 }, turnEvery: [4, 3] }, do: 'hatch' },
          { if: { turnEvery: [4, 1] }, do: 'snare' },
        ],
      },
      phases: [{
        at: 0.5,
        say: 'Enough of this filter. Look at me properly!',
        fx: [{ op: 'removeStatus', s: 'plating', tgt: 'self' }, { op: 'status', s: 'might', n: 2, tgt: 'self' }],
        ai: {
          open: ['spin'],
          seq: ['legs', 'kiss', 'spin'],
          rules: [
            { if: { hpLt: 0.2 }, do: 'frenzy', once: true },
            { if: { heroStatus: { s: 'bind', gte: 2 } }, do: 'web' },
          ],
        },
      }],
      immune: ['stun'],
      art: { id: 'boss_jorogumo' },
      lore: 'A glamorous giant spider who spins the endless feed over Scrollopolis, so that nobody in the city is ever lonely or bored. Under her perfect filter she has eight bright screens for eyes, and she has not looked up in years.',
      tags: ['insect', 'folk', 'void'],
    },
  });

  // ====================================================================================================================
  // ENCOUNTERS. id, enemies (smallest first, tallest last: lanes fill from the right), w = weight, min = lowest tile.diff.
  // Pairs are built on purpose: Flamebait lights up an Unskippable Ad, Tangled pins a backing-spot target, Filter Fairy punishes a stuck lead hero.
  // ====================================================================================================================
  DATA.addEncounters(2, {
    normal: [
      { id: 'ch2_lone_lantern', enemies: ['chochin'], w: 3, min: 0 },
      { id: 'ch2_wind_up_toy', enemies: ['karakuri_puppet'], w: 3, min: 0 },
      { id: 'ch2_faceless_wanderer', enemies: ['nopperabo'], w: 3, min: 0 },
      { id: 'ch2_pond_and_cloth', enemies: ['koi_spirit', 'ittan_momen'], w: 3, min: 0.1 },
      { id: 'ch2_old_shamisen', enemies: ['chochin', 'tsukumogami'], w: 3, min: 0.1 },
      { id: 'ch2_river_lady', enemies: ['nure_onna'], w: 2, min: 0.15 },
      { id: 'ch2_weavers_corner', enemies: ['ittan_momen', 'silk_weaver'], w: 3, min: 0.25 },
      { id: 'ch2_shroud_and_cloth', enemies: ['nopperabo', 'ittan_momen'], w: 2, min: 0.3 },
      { id: 'ch2_river_song', enemies: ['koi_spirit', 'nure_onna'], w: 3, min: 0.3 },
      { id: 'ch2_long_necks', enemies: ['ittan_momen', 'rokurokubi'], w: 2, min: 0.35 },
      { id: 'ch2_theatre_troupe', enemies: ['tsukumogami', 'karakuri_puppet'], w: 3, min: 0.35 },
      { id: 'ch2_clockwork_neck', enemies: ['karakuri_puppet', 'rokurokubi'], w: 2, min: 0.4 },
      { id: 'ch2_bridge_guard', enemies: ['chochin', 'drowned_samurai'], w: 3, min: 0.4 },
      { id: 'ch2_faceless_choir', enemies: ['nopperabo', 'nopperabo'], w: 2, min: 0.5 },
      { id: 'ch2_night_market', enemies: ['chochin', 'koi_spirit', 'tsukumogami'], w: 3, min: 0.5 },
      { id: 'ch2_flooded_bridge', enemies: ['nure_onna', 'drowned_samurai'], w: 2, min: 0.5 },
      { id: 'ch2_lantern_parade', enemies: ['chochin', 'rokurokubi', 'silk_weaver'], w: 2, min: 0.65 },
      { id: 'ch2_drowned_procession', enemies: ['koi_spirit', 'rokurokubi', 'drowned_samurai'], w: 2, min: 0.7 },
      { id: 'ch2_mistress_court', enemies: ['spiderling', 'spiderling', 'silk_weaver', 'nure_onna'], w: 2, min: 0.8 },
    ],
    elite: [
      { id: 'ch2_sunken_fleet', enemies: ['lantern_wisp', 'drowned_general'], w: 3, min: 0 },
      { id: 'ch2_last_show', enemies: ['puppet_master'], w: 3, min: 0.15 },
      { id: 'ch2_bridge_monk', enemies: ['umibozu'], w: 3, min: 0.3 },
    ],
    boss: 'boss_jorogumo',
  });
})();
