# Beatbox Heroes

A 16-bit neon-noir beatbox life-sim for phones (portrait, 360x640 logical pixels, integer scaled).
Play: `https://games-71g.pages.dev/beatbox_heroes/`

You were laid off on a Tuesday. You have a roommate (Foxy), rent on Sunday, $40, and a mouth that makes drums.
Busk the park, play open mics at the bar, train four skills, rhythm-battle five judges, go on dates, shop for
style, and climb the ladder to the Beatbox Heroes World Cup.

## The star: the character creator

* Three bodies (boy, girl, neutral), mix any look with any body.
* 40 natural skin presets, a Light / Warmth / Richness fine tuner, fantasy tones (neon, chrome, gold) and an any-colour wheel (level 8).
* 27 hair styles, 28 hair colours, dyed tips, any colour from level 8.
* 8 eye styles, 10 eye colours, brows, facial hair, face marks (freckles, blush, scars, war paint...).
* 20 tops, 12 bottoms, 9 shoes: every colour, with a free colour picker and an accent colour.
* 20 hats, 15 pairs of glasses (shades, aviators, the 8-bit "Deal With It" pixel shades, VR visor...), 25 accessories in 5 slots.
* Locked items can be previewed (they show what you are working towards) but are removed when you confirm.
* Unlocks come from: level, fans, day, achievements, beating opponents, or buying in the Thrift Shop.
* Change look any time in the wardrobe at home.

## Playing

* **Street**: tap to walk, tap a door to go in. Park (all day), Home, Thrift Shop (day 3+), Sound Lab (day 2+), The Bar (evenings, not Mondays).
* **Rhythm game**: 4 lanes (B, T, K, Pf). Tap the lane, or use keys D F J K (also arrows and 1 2 3 4). Your hits ARE the beatbox sounds.
* **Bar programme**: Tue to Thu open mic, Fri paid showcase (50 fans + 5 open mics), Sat battle night (7 opponents + the World Cup), Sun karaoke.
* **Needs**: energy, hunger, mood. Sleep after 20:00, nap earlier. Rent is $60 every Sunday. You pass out at 02:00.
* **Skills**: Musicality (wider timing), Technicality, Originality (fans, judges), Showmanship (tips, fans).
* **Progress**: 30 levels, 26 achievements, 5 judges (Tek, Mel, Origi, Showtime, Wildcard) who each favour a skill.
* Saves: 3 slots in `localStorage` (`bbh:slot1..3`), autosave (leading + trailing 2 s, flushed when the page hides).

## Developer menu

Triple-tap the clock in the top bar, enter `808`. Cash, fans, XP, levels, time, days (runs the real rollover), unlock all cosmetics,
no gates, beat the ladder, jump to any place, start any battle or rhythm test, jukebox + sound board, cast gallery, FPS, save export/import.
Every action goes through `Core.dev` / `Core.apply`, the same reducer the game uses.

## Code map (plain scripts, no build step, no dependencies)

| file | what |
|---|---|
| `pix.js` | `Pix` software pixel buffer, colour ramps, the noir palette. Runs in node. |
| `font.js` | 5x7 pixel capitals for text inside scenes |
| `catalog.js` | every cosmetic and its unlock rule (data only) |
| `chars*.js` | the paper-doll character renderer (poses, hair, clothes, accessories, portraits, thumbs) |
| `world_a.js`, `world_b.js` | painted scenes: title, logo, street (parallax, day/dusk/night), park, intro plates, interiors, stage, icons, fx |
| `audio.js` | Web Audio synth: beatbox drums, sfx, 12 music tracks, a groove engine that drives the rhythm game |
| `core.js` | pure rules: save object, time, needs, XP, unlocks, achievements, scoring, battle judging, saves |
| `engine.js` | scaling, input, scenes, particles, UI kit |
| `screens.js`, `creator.js`, `places.js`, `rhythm.js`, `dev.js`, `game.js` | the screens |

Design notes and module contracts: `DESIGN.md`. Tests: `tests/beatbox_heroes_*.test.mjs` (`npm run test:heroes`).

## Mini games and systems (ported from Beatbox Story)

* **Rhythm game** with standard beatbox patterns (easy is mostly B t K t), battle style orders (BOOM > HATS > RIM > SNARE > BOOM) and **MIC MODE**: beatbox into your microphone and each detected sound hits its lane.
* **Run tracker** (park): alternate left and right taps to stay in the green zone. Every 3 good bars adds +1 max energy.
* **Pitch Tuner** (vocal booth or Sound Lab): sing the target notes into your mic (pitch detection), or play ear training without a mic. Trains Musicality.
* **Beat Maker** (16 step sequencer, 4 slots): build patterns, train Originality, and RELEASE songs that pay fans for 7 days (3 at a time).
* **Sound Recorder** (Sound Lab): record your own B, T, K and Pf sounds. They replace the synth drums everywhere and train the mic detector. Stored per save slot in IndexedDB.
* **Crew** (bar counter), **Livestream** (desk at home), **private coaching** with BeeAmGee, odd jobs, beatbox tapes on the couch, a hood map and a full flat.

## Still to come

The long story arc (festival path, flashbacks, dreams), tour, sponsors, and Beatbox Hero lesson mode.
