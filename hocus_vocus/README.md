# HOCUS VOCUS: A Vocal Magic Adventure

Beatboxing and vocal magic. Two heroes, one country on mute, a deck of gem-socketed cards.

Play: https://games-71g.pages.dev/hocus_vocus/
Art sheets (every sprite, icon and scene the game draws): `hocus_vocus/gallery.html`

In the Soundlands real voices are magic: a sung note opens a blossom, a beatboxed kick makes a whole street bounce. Then the Gloss
arrived, a polite, shimmering filter that only wants everyone to look and sound perfect, and perfect things have nothing left to say.
The Soundlands went on mute. Two real, imperfect voices pack the van and go on tour, unmuting the world hex by hex with Vox: hocus
vocus. You lead two heroes through a shared deck, a hex map and three Acts, and every hex you unmute sings one note of the Act's
hidden tune, so the road you choose becomes a groove. The finale asks one question: are we losing being human?

## The cast

| Hero | Id | Role | Joins |
| --- | --- | --- | --- |
| **Jasmin**, the Blossom Voice | `hanae` | the lead, the attack hero: soft sung runs that land like petals (she never belts) | from the start |
| **RoxorLoops**, the Beatbox Wizard | `kuro` | the backing hero, the support hero: a whole band with one mouth | from the start |
| **RawClaw**, the Sound Alchemist | `suzu` | backing: reverb, delay and filters that wrap the band in sound | when Act I is cleared |
| **Andy**, the Thunder Bass | `raiga` | lead: a bass player whose low end you feel before you hear it | when Act II is cleared |

**Jordan** is not a hero: he runs every Merch Stall, designs every Sticker and gives the tips. The three Acts are **Blossom Bay**
(Headliner: Kraki, the Karaoke Kraken), **Scrollopolis** (Scrollspinner, Queen of the Feed) and **The Perfect Stage** (Flawless, Star
of the Perfect Stage, in three forms, and the finale "Human"). Every creature along the way caught a little of the Gloss. The Gloss is
never evil, only polite, glossy and wrong.

## What is in the box

- **Map**: a hex map on mute. Spend 1 Vox to unmute a hex next to the live ground, or cast a one-use Spell (Boots and Cats `stroke`,
  Vocal Run `wave`, Air Horn `fan`, Abracadabass `splash`, Surround Sound `halo`, Hocus Focus `blot`) to unmute a whole shape. Every
  unmuted hex sings one note, and the map music stays muffled under the Gloss until you unmute it. Landmarks are spotted from afar as
  silhouettes. Face-Offs, Rivals, Gift Boxes, Merch Stalls, Green Rooms, Studios, Detours (events), Tea Stalls, Buskers and the
  Headliner. The camera knows where the HUD is (the Spell tray included): Fit and the minimum zoom show the whole map with no hex
  under a panel, any hex can be dragged clear of the HUD at every zoom, and the party is kept clear of it.
- **Combat**: 3 Breath, draw 5. Heroes stand in the lead or the backing spot and cards change with the spot. One free swap per turn,
  extra swaps cost 1 Breath. Creatures telegraph their intent.
- **Gems**: pink, blue, green, gold and rainbow sockets on cards change how they play.
- **Charms** (relics): bend the rules; Headliner Charms come with a price.
- **Heroes**: four, with a chibi outfit each for three of them (Unicorn Onesie, Monster Onesie, Goat Suit), unlocked by Stickers.
- **Meta**: Cheers buy Tour Bus unlocks, Encores 1 to 10 stack difficulty, the Daily Duet is the same seeded tour for everybody on a
  date, plus Stickers, a Who's Who of creatures, Past Tours and the Tour Diary of story entries.
- **Follow the duo**: a calm panel (title footer, the sixth Tour Bus tab, settings, the victory screen) with the owners' links,
  Share and Support. The URLs are config (`DATA.LINKS` in `js/data.js`), all empty today, so a button with no URL is not drawn.
  Nothing opens by itself and the game never fetches anything: a link opens only on a tap, Share uses the device's share sheet or
  copies the text to the clipboard, and Support stays hidden until the owners fill in its URL (and is never shown after a lost tour).

## Controls

Touch, mouse and keyboard all work. On a phone hold the device sideways (portrait shows a "turn your device sideways" panel with a
Play anyway button).

- **Combat**: tap a card to lift it, tap again (or drag it up) to play, tap a creature for attacks. Keys: 1 to 9 and 0 select a card,
  Left and Right walk cards then targets, Enter plays, E ends the turn, S swaps spots, D and G open the piles, Z toggles animation
  speed, Esc puts a card back.
- **Map**: tap muted ground beside the live ground to unmute it for 1 Vox, tap live ground to walk. Keys: Q E A D Z C move the hex
  cursor, Enter or Space activates it, B or 1 to 9 pick a Spell, Esc backs out.
- **Title**: C continue, N new tour, D Daily Duet, L Tour Bus, S settings, H how to play. In the Tour Bus keys 1 to 6 switch tabs.

## Art and sound

Everything is drawn in canvas code and synthesised with WebAudio. There are no image files and no network access; the only files the
game could ever ask for are the owners' optional recordings in `audio/` (none yet) and links the owners add, which open only on a tap.

- **House style: chibi candy.** The owners' own chibi cards are the style authority: an even warm brown outline, one hard cel shadow
  and a thin highlight, big flat-cel eyes with a big catchlight, round bouncy shapes and stubby limbs, saturated candy colours on a
  deep indigo night, with sparkles and small music notes as the magic. The Gloss is the opposite: an opalescent pastel film, airbrushed,
  symmetrical and never dark. The cast ports the owners' approved drawing kit (`js/art_cast_kit.js`, `js/art_cast.js`; the source
  drawings live in `tools/hocus_vocus/rj_art/`). All 51 creatures, 59 card motifs, 58 Charm icons, the map and the 24 effects are
  redrawn in the same style. `ART_BIBLE.md` has the rules.
- **The band.** A vocal and beatbox band replaces every instrument: RoxorLoops is the beatbox kit (kick, snare, hat, throat bass,
  vocal scratch), Jasmin a soft sung lead, RawClaw the synths, Andy the electric bass, with a choir, keys, glockenspiel, ukulele,
  whistle and claps around them. Scores use real keys (major, mixolydian, dorian, minor, lydian), and the unmuting hexes sing on the
  pentatonic subset of the same key, so a chain of them can never clash. 19 tracks and the 73 sound effects keep their ids; six
  of them have a variant per hero. The Gloss is heard too: the map music is muffled until you unmute the Act, and the Perfect
  Stage starts dead on the beat grid and learns to swing as it is unmuted.
- **Your own recordings.** `js/data_samples.js` (`DATA.SAMPLES`, empty today) lets RoxorLoops and Jasmin drop real beatbox and vocal
  recordings into `audio/` to replace the synthesised sounds one at a time. `audio/README.md` is the walkthrough.

## Layout

| Path | What |
| --- | --- |
| `index.html`, `css/` | the shell, the stage (1280x720, scaled by CSS) and per-screen styles |
| `js/util.js`, `data*.js` | deterministic RNG, closed vocabularies, the effect DSL, validators, all content |
| `js/data_samples.js`, `audio/` | the owners' optional recordings: the manifest (ships empty) and the folder they go in |
| `js/combat.js`, `map.js`, `run.js`, `meta.js` | pure logic: no DOM, no timers |
| `js/art*.js` | the canvas art toolkit, the chibi cast kit and cast, 51 creatures, cards, icons, scenes, map tiles, effects |
| `js/audio.js` | synthesised music and sound effects, and the sample hook |
| `js/ui.js`, `scene.js`, `screen_*.js`, `tutorial.js`, `main.js` | the presentation layer and screens |
| `gallery.html` | the art sheet viewer |
| `DESIGN.md` | the design bible, the table of player-facing names versus internal ids, and every module contract |
| `CONTENT_SPEC.md` | the content quotas, fixed ids and the 51-creature roster |
| `ART_BIBLE.md` | the art, UI and audio direction |
| `plan/` | the Hocus Vocus plan (bible, content plans, phases) |
| `cover.webp`, `cover.webm` | the games index cover, recorded by `tools/hocus_vocus/cover.mjs` (never edited by hand) |

All scripts are classic scripts in one global scope. Each file owns one `const` namespace
(`U`, `DATA`, `ART`, `AUDIO`, `COMBAT`, `MAP`, `RUN`, `META`, `UI`, `SCENE`, `GAME`) or is one IIFE
that extends one. There is no unseeded random call anywhere; every roll goes through `U.rng`.

## Develop

    npm run test:hocus_vocus                  all suites, in parallel
    node tests/hocus_vocus_all.mjs --strict   also demands every script and fixed id exists
    node tests/hocus_vocus_all.mjs data hygiene   only the suites whose file name contains one of the words
    node tests/hocus_vocus_<name>.test.mjs    one suite
    npm run check                            the repo gate: build plus every game's tests

The theme suite (`tests/hocus_vocus_theme.test.mjs`) fails whenever a retired word comes back into player-facing text, and the
hygiene suite checks the house rules and these docs.

Tools:

    node tools/hocus_vocus/shot.mjs ...       headless Chromium screenshots and a UI-driving QA player
    node tools/hocus_vocus/bot.mjs --help     the balance bot: plays complete tours through the real RUN, COMBAT and MAP
    node tools/hocus_vocus/mix.mjs --check   the audio mix tool: renders scores and sounds offline, measures loudness (its header lists every option)
    node tools/hocus_vocus/cover.mjs          records the cover (needs sharp, playwright-core and a Chromium)

The balance targets (the bot at Encore 0): Act I clear 85 to 97%, Act II 60 to 80%, full clear 15 to 35%, every hero pair within
8 to 45%. They are written in `CONTENT_SPEC.md` section 7.

Saves live in `localStorage` under keys that start with `hv_` (`hv_profile_v1`, `hv_run_v1`, and `hv_skins_v1` for the outfit
choice). Never rename them. Internal ids keep their original names (DESIGN 1.1).

House rules (enforced by `tests/hocus_vocus_hygiene.test.mjs`): no em or en dashes anywhere, pointer
events only, no network (the sample loader and the owners' links are the two pragma-marked exceptions), no `eval`, ES2020 only, ids
in code must exist in the closed lists.
