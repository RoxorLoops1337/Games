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
* **Progress**: 30 levels, 20 achievements, 5 judges (Tek, Mel, Origi, Showtime, Wildcard) who each favour a skill.
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

## Not yet built (from the rebuild handover)

Mic beatbox detection and pitch tuner, Sound Studio sample recording, the sequencer and songs, crew, livestream, sponsors,
the festival story arc, tour, and the long flashback/dream story scenes. The core loop, creator, shop, battles and world are in.
