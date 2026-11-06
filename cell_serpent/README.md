# Cell Serpent

A Cell Survivor - Shoot Defense style game, with RoxorLoops & Jasmin as the cell.

## How a run works

- One run is one **stage**: one long serpent crawls down a winding lane toward the membrane at the bottom. Each
  stage has its own lane shape (`PATH_KINDS`) and now and then the snake **surges** for a second (with a warning).
- The cell only **slides left and right** along its row. It fires notes **straight up**, so where you stand is your aim.
  Every cell takes about 10 to 20 shots at the start (numbers are shown x10 so they read big).
- The snake is **one connected chain**. A destroyed cell is removed and the cells in front slide back to close the gap,
  so it just gets shorter and every kill pushes the face away from the membrane.
- The **face is shielded** (no HP, cannot be targeted) until every other cell is gone, then it pops and the stage is cleared.
  **There are no hit points**: RoxorLoops and Jasmin stand below the line. The moment the face touches the line the run is over, and you can
  spend Sparkles to revive (it knocks the snake back). Stamina, Warm Up and Ear Plugs became slowing and push-back effects: Stamina and
  Calm Down slow the snake, Door Stopper and the Lamb push it back, the Turtle and the hush pickup slow it for a while.
- Snakes are long (32 cells in stage 1, growing by 4 per stage, 150 max). Lane shapes include tall hairpins, big lobes and castle steps.
- About one cell in 15 carries a **chest** (at least two): aim for them first. Chests give Beats and a skill fragment.
- Upgrades come only from the **yellow upgrade cells** (a star on a yellow cell, about one per 7 cells, at least 4 per
  snake). Pop one, then pick 1 of 3 with 4 **Free Refreshes** per run. The first two picks are capsule upgrades only
  (attack speed, extra note, extra burst, damage); skills and passives join after that. Each card has a **rarity** (speed and damage cards are common kinds, extra notes are at least rare, extra bursts at least epic) (Common, Rare, Epic, Legendary, Mythic, Godlike) that scales its effect. One of the three is always
  common, and every pick raises your luck so better rarities slowly become likelier. Cards show the numbers
  (for example "Notes per shot: 2 -> 3") and the HUD shows what the capsule does right now.
- **Groove**: every note that lands builds the groove meter (+1.5% damage per point, up to 20). Stop hitting and it fades.
  The cell glows when the groove is high.
- **Boss shield wave**: on boss stages a wave of shields rolls down the snake like a beat. Cells inside it cannot be hit, so
  time your shots.
- Every stage has its own **species** (colour, cell style, face and headgear): Love-Struck, Rustic, Sneezy, Grumpy, Sleepy,
  Disco, Sour, Mighty, Frosty, Gloomy. Only the head has a face. Bomb cells are red with a fuse, armor cells have a plate.

## Between runs (the hub)

- **Battle**: stage select. Clear a stage to unlock the next. The first run starts straight in stage 1.
- **Skills**: nine pieces of music gear. Beat Pad (a drum pad under the snake), Spinning Vinyl (orbiting records), Speaker Stack
  (bass thumps), Autotune (homing winged notes), Treble Pins (piercing fan), Drumsticks (sweeping sticks), Hum Bubbles
  (slowing bubbles), Spotlight Storm (percent-HP beams), Bass Drop (executes weak cells). Five are owned from the start, the rest
  unlock with fragments. Skills level up with **fragments only** (permanent damage bonus).
  You choose a **loadout of 5 skills** to take into battle; a run always starts with just your notes and only loadout skills show up as picks. Internal ids (`swab`, `daggers`, ...)
  are save keys and never change.
- **Stats**: Volume, Pitch, Tempo, Stamina, Fame and Encore, bought with Beats.
- **Daily gigs**: three new goals every day (pop cells, clear stages, collect chests, reach a groove, pick upgrades) that pay Beats or Sparkles.
- **Shop**: Beat Box (Beats) and Spark Box (Sparkles) hold skill fragments.
- Two currencies: **Beats** (gold music-note coins, from cells and clears) and **Sparkles** (pink star gems, from clearing
  a stage for the first time).

## Files

`sim.js` (pure simulation and the whole meta economy), `art_draw.js` (all art, drawn in code in the Hocus Vocus chibi
candy style), `render.js`, `audio.js`, `main.js` (input, hub, screens, save), `assets/` (the duo PNGs, baked from the
Hocus Vocus kit). Tests: `npm run test:serpent`.

## Performance notes

Static art is baked once: cells, skills, glows, HUD text and the stage background are all cached canvases that are blitted.
Cells off screen are skipped, the hub stops rendering the game behind it, and the game lowers its resolution (down to 1x) by
itself when frames run slow, then raises it again when it runs fast.

## Animals, pets and the Piggy Bank Parade

- The skills are cute animals (ids unchanged, they are save keys): Kitty Paws (`swab`), Chick Circle (`daggers`), Cow Choir (`tower`),
  Dove Squad (`dragon`), Hedgehog Quills (`needles`), Bunny Thump (`stick`), Duckling Splash (`bubble`), Owl Spotlight (`satellite`),
  Bulldog Chomp (`maw`). Their art is drawn in code by `critter()` in `art_draw.js`.
- **Pets** (Kitten, Puppy, Piglet, Lamb, Hamster, Turtle) come from eggs. Every star gives a permanent bonus whether the pet is equipped
  or not; two can walk with you and help in runs. Eggs come from a fresh day, first stage clears and the Piggy Bank Parade.
- **Piggy Bank Parade**: a daily side stage (3 tries a day) with a parade of piggy banks that pays a lot of Beats. A win raises its tier.
- **Checkpoint chests** drop at 25% and 50% progress and pay Beats even if the run is lost.
- The shop has a cheap Spark Box and a Grand Spark Box (ten in one with a star prize). The hub deliberately explains very little.

## The hub, round three (from the reference screenshots)

- Tabs: Shop, Stats, Battle, Skills, Pets, Gear. Code split: `hub2.js` holds the shop, keepsake collection, character page and panels.
- **Voice** (energy): a stage costs 5, it refills slowly (cap 32, rewards may overflow it), the 50% chest gives 10 back. The Piggy Bank Parade is free.
- **Normal / Hard** per stage, with a recommended power. Hard has 2.4x cell HP and pays double.
- **Gear**: keepsakes (Fine to Legendary) with fragments, levels and set bonuses, found in Keepsake Chests.
- **Stats** is the character page: power, account level with Sparkle milestones, Volume / Pitch / Tempo cards.
- **Shop**: daily treats with discounts and a refresh, a one-time Welcome Chest, a shop level that sweetens chests, a Beats store.
- Battle side buttons: Sign in (7 days), Fan Fund (free stage rewards), Backstage tip jar (idle Beats), Fragment Swap.
- In a run: speed readout, per-source damage panel (tap the bars icon), 25/50/100% chests on the bar, and Revive for Sparkles (3 times, knocks the snake back).
- Balance: cells have about 8 shots of HP near the face and over 40 near the tail in stage 1 (the first cells are soft, then it gets tougher and tougher) and the snake crawls fast (the lane is not drawn) and capsule upgrades are small (common +8% speed, +12% damage).

## Round four: wardrobe, events, instances, shops

- **Wardrobe**: outfits (a hat and a perk for one animal skill) bought with Ribbons, which stage wins and the seasonal event hand out. The worn outfit shows above the duo in runs.
- **Seasonal event** (Blossom Bash, Sunny Fair, Harvest Hootenanny, Snowy Sing-Along, by month): ribbon milestones, an exclusive outfit, and the Exchange Shop.
- **Giant Serpent Gig**: a boss instance, two tries a day, pays Ribbons, an egg and pet fragments (the solo stand-in for the co-op boss mode).
- **Fan Club Pass**, **Limit Shop** (weekly stock, Beats), **Exchange Shop** (Ribbons), **Weapon Exchange** (Sparkles skip the fragment grind, stage gate still applies).
- **Preview** shows every serpent species; **Trophy Shelf** holds one-time rewards for milestones.

- Dance Shoes became **Sharp Notes** (your notes pierce more cells); moving faster was never worth a card. The Hamster and Wheel Speaker now add singing speed.
- Cells grow toward the tail (the tougher cells are the biggest) and the numbers are bigger, so they stay readable. The snake crawls faster from the start.

## Fifty stages

- **MAX_STAGE = 50.** `stageKind(n)`: every 6th stage is a **circle** stage (the duo stands in the middle, inside a ring, the snake spirals in and the run ends when it reaches the ring); stages 7, 8, 14, 21, 28, 35, 38 and 49 have **two snakes** (the second one is mirrored and enters later); the rest are one snake and the line.
- Early stages are deliberately harsh: cell HP grows quickly for the first ten stages, the snake is fast, and upgrade cards are weak at first (they reach full strength around stage ten; extra notes unlock at stage 3, pierce at 4, bursts at 6, and luck is poor early on). With no menu upgrades, stage 3 is out of reach.
- Every stage the snakes crawl a bit faster (`speedMul`, +3.5% per stage) and cell HP keeps climbing; bosses have about 2.4x cell HP and crawl a bit faster than their neighbours.

## The 50 improvements (round five)

Run feel: danger pulse and beep as the face nears the line; haptics; an animal voice for every skill and pet; reduce motion, low quality and bigger numbers options; a boss and twist banner; **stage twists** (Swift, Thick, Fragile, Armored, Boomy, Rich); **mender cells** (stage 9+) that heal their neighbours; skipping an upgrade card for Beats; bomb counter; surge warning mark; chest radar; hot-groove coin bonus; settings and stats from the pause screen.
Progression: **three stars per stage** (clear, no revive, never let the face past 80% of the lane) with Sparkle bonuses every 10 stars; login streak bonus; claim-all for gigs, fund and trophies; level-up-all for keepsakes, pets and skills; hatch-all eggs; Continue button; the game remembers your last stage and difficulty; three new daily gigs (bombs, bosses, stars); a richer result screen (stars, time, groove, bombs, top damage dealers, new-best callout).
UI and tech: red-dot badges on tabs; stars and stage-kind icons on the stage chips; a settings screen with sound, music, vibration and quality toggles, a copy-and-paste **backup code** (save export and import), keyboard help and an about line; title screen stats; toasts; an error guard; no pull-to-refresh or zoom; an install manifest; rarity shapes next to the colours for colour-blind players; labels on icon buttons; automatic low-quality mode on slow phones.

## Dev team batch 1 (20 specialists)

Enemy art (stitched mender pillows, sunburst upgrade cells, steel armor, curly fuse bombs, jeweled boss crowns, head idle variety); animal art (pet moods, accessories, hop and squash, duo breathing, paw trails, dove feathers); a themed world per species with a concert floor and crowd (`bg_world.js`); hit juice (shaped pops, merged damage numbers, kill chains, coin arcs); screen feel (stage and boss title cards, surge pulses, slow-mo punch, confetti, game-over fade; `screenfx.js`); a new in-run HUD (`hud.js`); a dramatic card pick screen; a redesigned Battle tab, Skills and Pets tabs, Shop, Gear and Stats (`icons.js`); a one-screen result screen with revive countdown (`result_fx.js`); a new title screen and first-run guide (`title_fx.js`, `hints.js`); a rewritten audio engine (limiter, sectioned music that follows groove and danger, boss track); three new mechanics (Encore beam, gold cell, close call); balance harness; retention (Goals panel, lucky spin, weekly challenge, mastery, collection book, comeback gift; `addict_ui.js`); accessibility (`access.js`: colour-blind marks, high contrast, slide bar, left-handed, pause guard); motion and button feel (`motion.js`); and a QA pass (soft-lock on Escape over cards, give-up result, 320px layouts).
Extra tests live in `tests/cell_serpent_ext/` and run as part of `npm run test:serpent`.

## Dev team batch 2

Round 2 of the 20 specialists, merged:
- Art: sharper enemy and animal sprites, richer weather, crowd and lightning backgrounds (`bg_world.js`).
- Juice: hit-stop, kill-chain flourish, upgrade orbs, muzzle flash, note trails (`hitjuice.js`); stage clear star card, beat edge pulse, close call flash (`screenfx.js`, `clock.js`).
- HUD and cards: new card UI with luck box and build strip (`cards_ui.js`), notch-safe HUD zones.
- Hub: Battle tab dock with START outside the scroll area, fun fact card, twist badge and event banner (`battle_ui.js`); skill and pet bottom sheets with filters (`skill_sheet.js`); shop deal bursts, loot reveal, set bonus panel, wardrobe hats; staggered list entrances and currency combo flash (`motion.js`).
- Retention and onboarding: `retain_ui.js`, `onboard12.js`, revive timer setting.
- Audio: UI sounds everywhere, per-species bell motifs, new mix, volume slider.
- Gameplay: rhythm beat clock (on-beat shots crit more), Standing Ovation passive, brighter Encore beam.
- Accessibility: thumb zone, keyboard nav, live region announcements, stronger high contrast and colour-blind badges.

## Dev team batch 3 and 4

Batch 3: boss collars and head moods, drawn hats, clouds and stage footlights, per-weapon hit marks and dash telegraph, milestone ribbons and GO pop, new card icons and synergy lines, Battle tab dock with swipe, skill and pet sheets, ward and lullaby cells, beat-synced audio, retention panels, compact currency numbers, text size slider.
Batch 4: baked HUD chrome and beat streak chip, far parallax skylines per species and boss phase 2 look, pets cheer on kill streaks and animated hats, gold cell and boss ornaments, kill chain visuals, close call, perfect clear and READY/GO moments, card stat deltas and band sheet, result next-goal teaser and close-call titles, loadout swap sheet, shop chest drama, tab icons and hub swipe, colour-blind preview and beat tick, audio muffle and boss phase stingers, Final Chorus boss phase, Drummer cell, Collection Book with real art, Season stamp fly, balance harness (boss HP ramp, ring speed).

## Dev team batch 5

Hold-to-charge chests that predict the best drop, keepsake detail panel with set strip, gold cell fade-out and boss phase 2 silhouettes with animated ornaments, per-weapon crit badges and a digit atlas, power pickup fly animation, Rewards filter and gig collect fly on the Battle tab, beat-synced 3-2-1 count-in and card pick flourish, HUD stats and groove baking and beat streak milestones, ghost bars and icon rings on cards, pet happiness and loadout builds with drag reorder, pet emotes and a duo that cheers with its hat, kick pump and metronome without music, Quartet and Choir cells with a telegraphed boss dash lane, streak shield and book confetti, rubber-band tab swipe and modal springs, title snake and real-art tutorial, text size preview and 44px tap targets, result stat grid, perf baking of head bodies, QA force hook and ribbon fix.

## Dev team batch 6

Species stage floors and ring discs, skyline windows and sun/moon, disco and love floor tiles on the beat, boss crack phase 2, dash spikes and new cell patterns, choir and quartet links, per-pet cheer poses and result dances, pet joy emotes, loadout build rename, overwrite confirm, auto-suggest and sorts, card foil plates per rarity and band-strip tick, HUD skill level badges and boss HP bar polish, danger heartbeat, revive return, boss defeat chain and new-best ribbon, per-weapon kill pops and chain-break slump, gig collect fly and Hard rewards filter, hold-to-confirm give up, reward chips fly to the hub, shop and radar polish, keepsake NEW star fly, harvest progress track, swipe over chip rows, tab bar indicator, baked side icons, 44px targets, reduce flashing setting, modal swap sheet, title snake taps, welcome back, tutorial face pop, achievement card, weekly hero card, kick pump setting, sigh, count-in bar, quartet streak, Soundcheck and Crescendo cards, sleepy and gloomy boss behaviours, balance round 3 (late HP growth, late ring and hairpin crawl, higher meta caps).

## Dev team batch 7

Yelling, hurt, dazed faces and wagging tails with species surge colours, pet slump variants and a baked duo cheer frame with idle sway, mist banks and wind gusts, stone slab floor cracks on boss dashes, finishing-blow badge and kill-chain pitch ladder, chest and bomb juice, crit tiers, wipeout bridge, per-species stage card intros, count-in beat flash, danger panic face and resume ease-in, level pip and cooldown ring baking, NEW SKILL caption, chest milestone captions and coin roll, card-wide foil, synergy pulse, new card icons and reroll feel, ready-gigs chip and START flash, Skills best build per species with pet reactions and pet nicknames, 44px pills and focus traps and reduce-flashing preview, tab fill slide and press sweep and SVG glyphs, loot foil and stacked chest tiles, reward hold on MENU and RETRY fly, title squeak and offline gains chip, Goals panel fit and today strip, species late traits and Bell cell and Fan Club and Bridge cards, choir hum and danger beat and hub bed sounds, memoised sprite keys and pooled events.

## Dev team batch 8

Belly stripes and back ridges on every snake cell per species, crowned dazed bosses, species sting for each stage card, boss intro and head death, a 3-2-1 resume count-in with pet reactions, a hit juice ladder (finishing blow per weapon, longest chain and best moment on the result), night stars and shooting stars, snow squalls and petal storms on head kills, mist that parts around heads, boss floor lamps, bell tethers, trait chips on stage cards and two counter cards (Ice Breaker, Heart Mender), a claim row and best % flag on the Battle tab, a hidden snake tune on the title with a sticker, ribbons that fly to a hub counter, SVG settings icons, inert hub behind sheets with named slots, colour-blind rarity colours and a contrast pass, plus fixed cell and snake shapes in the sim. Tests: 165 groups.

## Dev team batch 9

Per-species head death animations and belly stripes on armor, bomb and mender cells, springy pet leash with scare calls and duo foot dust, species lamp sweeps, Encore beam reactions and sky creatures per world, hit looks for five more weapons with chip debris and chain shockwaves, a music-synced resume count-in and species stings on the hub preview, bigger in-run HUD text with MAX pills, counter cards (Oil Can, Sweet Tooth, Tissue Box) plus Metronome and Pillow cells and trait cues, combo-driven music layers and per-world bells, BRING THEM and claim row reward flights, a sticker book on Stats and a quest chest streak with a stage sticker album, pause menu build chips, title tune hints and secrets, real button names for tiles with mastery medals, a drawn glyph set replacing emoji and toned toasts, plus a repo contrast audit and a wider hit-test sweep. Tests: 184 groups.

## Dev team batch 10

Boss crown that tosses, bounces and rolls away, baked Metronome and Pillow badges drawn on top of neighbours, a Snack cell with a timed oat cookie pickup, late species traits from stage 41, boss phase twists and the ring record skip, duo and pet reactions (dizzy on game over, revive hop, pet glance, kitten pounce, puppy bark, visible foot dust), crit and finish slow-mo with per-class mark budgets and a chain clear cascade, creatures and clear flourishes per world, NEW BEST TIME and PHEW near-miss pills with species milestone chords, combo tier tags and bigger HUD tiles, chain pills and card locking, a power gap meter and world progress strip, pet treats and skill upgrade ceremony, personal bests, gear set strip and sticker book prize, pause build stats and a sticker unlock popup, title secrets counter with a keyboard tune path, boss fills and key lifts with ambient beds and pet voices, streak tokens and weekly badges, tab count badges and drawn Gear icons with a stage curtain, a deeper contrast audit, and corrupt save hardening. Tests: 205 groups.

## Dev team batch 11

Ring (circle) stages now keep the duo fixed in the centre and you aim 360 degrees by dragging (smaller duo and circle, aim line, bot aims too). Phone full screen: web manifest with real PNG icons, Fullscreen API on the first tap, orientation lock, an iPhone Add to Home Screen hint, 100dvh layout, rotate overlay. A phone pass over every button, card and icon (44 px targets, 12 px text, icons baked at the phone pixel density, bigger pause hit area, card lock). Gameplay: Mirror cell, boss phase 2 twists for stages 10 to 30, Beat Run, bell fix, shop refresh exploit closed (the free gift is once a day, refresh costs rise), counter cards Heart Ward and Honey Jar, sibling head reactions, armor wear, duo boss kill cheer, ACT pills and a stage 50 finale, game over cause hints, the weekly badge shelf, buff timer chips, a tile sprite memo, per-weapon damage number styles, a text size ladder cutting canvases, and keyboard and speech access for card lock and results. Tests: 229 groups.

## Dev team batch 12

Ring stage polish: the duo visibly aims (leans, holds out a microphone, recoils on each volley), pets slide off the aim line and their eyes follow the nearest head, two aim modes (arena touch aims at the finger, a floating stick for thumb-zone drags), an optional Aim assist setting, an aim line under the snake with a muzzle cone, shots and hit effects that leave along the aim, shots panned by aim direction, keyboard and screen reader aiming, left-handed slide bar aiming, the ring intro flourish and tap to skip on long cards. In-run HUD text raised to at least 13 CSS px with plates rebalanced and a pixel-based contrast audit. Gameplay: Mirror tether, Beat Run pips, Pocket Mirror, Chamomile Tea and Ear Muffs counter cards, boss twists for stages 35 to 50, the Shutter cell in ring stages, distinct crown and aura per boss stage. Balance: ring pace tuned with a human-like aiming bot and Gold Records, a late game Beats sink. Perf: far fewer canvases per frame and about 57 percent less sim garbage. QA: real touch aim tests, corrupt save sweep over 16 keys, the stage 50 result line fixed. Title: an install button when the browser offers it and PLAY lower for thumb reach. Tests: 250 plus groups.
