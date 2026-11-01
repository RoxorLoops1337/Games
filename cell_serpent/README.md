# Cell Serpent

A Cell Survivor - Shoot Defense style game, with RoxorLoops & Jasmin as the cell.

## How a run works

- One run is one **stage**: one long virus snake crawls down a winding lane toward the membrane at the bottom. Each
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
- **Preview** shows every virus species; **Trophy Shelf** holds one-time rewards for milestones.
