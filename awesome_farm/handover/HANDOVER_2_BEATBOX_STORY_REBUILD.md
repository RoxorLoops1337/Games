# Handover 2 — Rebuild "Beatbox Story" in Phaser: the same game, every bug fixed, fresh neon-noir graphics

> Written 2026-10-06, updated the same day with the owner's decisions (section 12, FINAL). This is the brief for a **new Claude session** whose job is:
> *take the existing Beatbox Story game (React/JSX, one 18,800-line file) and rebuild it from scratch in Phaser 4 + TypeScript — keeping the whole
> game's functionality, fixing every bug, optimising it, and giving it fresh neon-noir pixel art with a painted street-storybook finish, in the same style and
> vibe as the old art, the way Awesome Farm was done.*
> Read `HANDOVER_1_AWESOME_FARM_PHASER_AND_ART.md` first (same folder): it explains the Phaser 4 gotchas, the 2×
> painted-art pipeline, the UI kit, the juice rule and the working method that this plan reuses.

## 0. Paste-ready starter prompt for the new session

```
You are going to REBUILD the game "Beatbox Story" from this repo as a brand-new Phaser 4 + TypeScript game, with
fresh graphics in the same style and vibe, every old bug fixed, and everything brought up to date.

Read, in this order, completely:
 1. C:\Users\danhi\Games-awesome-farm\awesome_farm\handover\HANDOVER_1_AWESOME_FARM_PHASER_AND_ART.md
 2. C:\Users\danhi\Games-awesome-farm\awesome_farm\handover\HANDOVER_2_BEATBOX_STORY_REBUILD.md   (this brief; section 12
    holds the owner's decisions, which are FINAL)
 3. The feature inventories in C:\Users\danhi\Games-awesome-farm\awesome_farm\handover\beatbox-inventory\ (12 files; read
    each file's SUMMARY and "OPEN QUESTIONS / GOTCHAS" now, the rest while you build that part)
 4. C:\Users\danhi\Games-awesome-farm\awesome_farm\CLAUDE.md and DESIGN.md (the reference implementation of the
    architecture and art pipeline you must reuse)

The old game (reference only): C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx. Do NOT edit or delete it
or its PNGs; they are style references and the source of truth for rules. The new game goes in a NEW folder
(beatbox_story_phaser/). Work only in the worktree C:\Users\danhi\Games-awesome-farm (branch awesome-farm, or a new
branch from it). Never touch the main checkout C:\Users\danhi\Games.

Decisions already made by the owner (do not ask again): neon-noir pixel art with a painted street-storybook finish;
portrait only; FIX EVERYTHING that is wrong in the old game and use up-to-date techniques (section 14); fresh graphics
in the same style and vibe (no reuse of the old PNGs in the shipped game); no old save exists, so the in-game
DEVELOPER MENU is how the owner tests (section 13) and must be rebuilt, bigger.

Do this first: (a) summarise your understanding in 15 lines; (b) make a style test (3 key images in the chosen
direction: a street at dusk, the apartment, the main character) and show me screenshots; (c) list only the questions
in section 12 under "Still open" that you cannot resolve yourself, with your recommendation. Then build in stages I can
follow on my phone (screenshots for each stage), keep `npm run check` green, keep PARITY.md and CHANGES.md up to date,
and use sub-agents in parallel for independent screens/scenes.
```

---

## 1. Mission, success criteria, and what must not change

**Mission.** Rebuild Beatbox Story from scratch as a Phaser 4 + TypeScript game: the same game (content, rules, story,
mini-games, the microphone features), with **every old bug fixed**, a clean testable core, a fast Phaser client, **fresh
graphics in the same style and vibe** as the old art, and modern (2026) techniques throughout (section 14). The owner follows
progress on his phone and judges by feel.

**Done means:**
1. **Feature parity**: every behaviour in the 12 inventory files is reproduced, or fixed, or listed in `CHANGES.md` with a
   reason (see §9: the owner's rule is *fix everything*, but keep the game recognisably the same game).
2. **No known bug left from §9**; each fix has a test.
3. **Looks like a new game in the same world**: painted neon-noir pixel art at 2× density, layered characters, real animation,
   lighting, particles, juice (sound + burst + shake on every key action), polished portrait UI.
4. **Fast and smooth**: 60 fps on a mid-range phone, no refresh-rate-dependent animation, small download (a single-file build
   must work), low input-to-sound latency with a calibration screen.
5. **Tested**: pure core covered by unit tests; differential tests against the old code for formulas (§7); bots that play weeks
   and months; signal tests for the audio detectors; `npm run check` green.
6. **Testable by the owner without a save**: a full developer menu (section 13).

**Keep (identity):** the story and its text and tone (lowercase, wry, a bit sad: "you don't remember saying yes"), the cast and
their names (BeeAmGee, Foxy, Pig Pen, Rohzel, Penny, the judges, opponents, crews, romance candidates), the day structure
(06:00 → 02:00, Day 1 = Tuesday, weekday programme), the four stats, the 12 sounds and their unlock ladder, the 5 save slots,
the mic mini-games, gold `#D4A017` as the signature accent, and the "gritty-warm urban beatbox career" mood.

**Free to change:** all rendering, UI layout, code structure, animation, art (**all new**), audio mixing (keeping the sound
design), performance, accessibility, and any number or rule that a §9 fix requires (log it in `CHANGES.md`).

---

## 2. The old game in one page

**What it is.** A mobile-portrait (480 px wide) life-sim about an unemployed young beatboxer. You manage **energy, hunger,
mood, cash, followers**, train **four stats** (Musicality, Technicality, Originality, Showmanship), earn money busking, jam,
run, play open mics and a Friday showcase, **battle** a ladder of 7 beatboxers (plus 3 crews), **mingle** at the bar (39
encounters, 6 romance candidates, 10 sponsors), pay **rent** every Sunday (miss it three times and you are evicted to a
couch for three days), earn **songs** that pay royalties for a week, hire a **crew**, livestream, get coached by an old OG,
unlock **12 beatbox sounds** by milestones, collect **20 achievements**, buy **14 pieces of gear**, change **outfits**, tour,
and finally enter the **BBBWC2027 festival** (a 14-day prep arc with three paths). Story beats: a layoff intro, the roommate
Foxy (soup, plant, tips), the rival Pig Pen (and the Penny reveal), the mentor BeeAmGee ("Bjarne"), bar-keeper Rohzel,
flashbacks, dreams, rent scenes.

**Mini-games (some use the microphone):** Busk RhythmTap, Run tracker (alternating taps), **Pitch Tuner** (sing notes;
autocorrelation pitch detection), **Beatbox Hero** (4-lane rhythm game; taps *or* mic beatbox detection), **Originality
Sequencer** (16-step pattern maker), **Sound Studio** (record your own samples per sound, stored in IndexedDB).

**Tech.** One React 18 component tree in `beatbox_story/beatbox-story.jsx` (18,800 lines; `main.jsx` mounts it), Tailwind
via CDN, lucide-react icons, Google fonts (Bebas Neue, Oswald), `window.storage` polyfilled onto `localStorage['bbs:'+key]`
(`index.html`), IndexedDB `beatbox-story-samples` for recorded sounds, Web Audio **synthesis** for every sound and the two
music tracks, and **21+13 procedural canvas "scenes"** (`drawXxxScene(ctx, frame, look)`, 200×130 logical px at ×3, built from
`fillRect`) plus the player's beatboxer renderer `drawBeatboxer`. Painted PNG art exists only for: the title key art, the 7 intro
images (480×270), the hood map day/night (480×860), the apartment cutaway day/night (480×860), the park beatboxer sheet and a
cat-walk strip. Built by the repo's root `build.js` (esbuild IIFE) and deployed with Cloudflare Pages (`/beatbox_story/`).

**Structure problem to solve.** There is no reducer: the single `BeatboxStory` component owns `char` (the whole save) and every
screen mutates it through `setChar(c => ...)` with side effects inside the updaters. Scenes/overlays are driven by `requestAnimationFrame`
frame counters (animation speed depends on monitor Hz). A cutscene is a *single slot* (a new one silently replaces the old one).
Time, rent, challenges and morning events are spread over `HouseScreen.finishSleep`, an App-level "2 AM" watcher and activity hooks.

---

## 3. Where the old code and assets are

| What | Where |
|---|---|
| Game source | `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx` (18,800 lines), `main.jsx`, `index.html` |
| Built bundle (ignore) | `beatbox_story/beatbox-story.bundle.js` (595 KB; built by root `build.js`) |
| Art (PNG/WebP/WebM) | `beatbox_story/title.png` (1376×768 key art), `intro-1-office … intro-7-couch.png` (480×270), `hood-day/night.png`, `house-day/night.png` (480×860), `beatboxer-park.png`, `cat-walk.png`, `cover.webp/.webm` |
| Layout editors | `tools/hotspot-editor.html` (hotspot rectangles on the hood/house maps), `tools/light-editor.html` (night window/lamp glows), `tools/cat-path-editor.html`, `tools/character-editor.html`, `tools/character-color-editor.html`, `tools/intro-light-editor.html`, `tools/index.html` ("Beatbox Story · Editor Tools"); they output percentage coordinates to paste into the JSX |
| Possibly reusable character art | `tools/hocus_vocus/rj_art/` (`roxor.js`, `jasmin.js`, `kit.js`, `crew.js`, `sheet.js`, `render.mjs`, README): a code-drawn character kit for RoxorLoops / Jasmin used by another game in the repo — look at it before designing the character renderer |
| Repo workflow rules | root `C:\Users\danhi\Games-awesome-farm\CLAUDE.md` (applies to the old games; the new folder follows Awesome Farm's own `CLAUDE.md` until the owner wires it into the root build) |
| Git history | the old game has ~185 commits touching `beatbox_story` (e.g. `a23d26ee` "vertical busk rhythm game", `b17e2751`, `d93a2840`); branch `origin/claude/beatbox-story-development-UUf9s` holds earlier dev history; `origin/claude/beatbox-festival-webpage-3tofA` is a related branch (look before assuming it is irrelevant) |
| Not this game | BattleScore (`C:\Users\danhi\battlescore`, a live beatbox *judging* platform) and `beatborne/` are different projects |

**Storage keys to preserve (old game):** `localStorage['bbs:character:slot1..5']`, `bbs:active_slot`, legacy `bbs:character:main`
(migrated to slot 1 on first run), `localStorage['beatbox_settings']` (`muted`, `reducedMotion`, `fastDialogue`),
`localStorage['beatbox_dev']='1'` (dev panel unlocked: triple-tap the day badge + code `808`), IndexedDB db `beatbox-story-samples`,
store `samples`, keys `slot{N}:sample-{soundKey}` (mono `{float32, sampleRate}`; 16 keys per slot: B, T, K, Pf + the 12 catalog ids).

---

## 4. The feature inventories (your parity checklist)

Twelve files in `awesome_farm/handover/beatbox-inventory/`, one per section of the 18,800-line file. Each starts with a 10-line
SUMMARY, lists every unit with *exact rules, numbers, state fields, text, what is drawn, and rebuild notes*, and ends with
OPEN QUESTIONS / GOTCHAS (bugs and oddities). They were written by reading the code, so **they follow the code, not the comments**
(comments often disagree with the code; the files say where).

| File | Covers (old-file lines) |
|---|---|
| `01-data-and-systems.md` | 1–1260: sound catalog + unlock rules, food, 7 NPC opponents, 3 crews, judges, **`initialChar` (the save)**, global key dispatcher, phone messages, **24 random events**, daily (8) / weekly (6) challenges, crew NPCs, **20 achievements**, 11 outfits + 7 accessories, festival arc, mood drain/time passing, Foxy tips, storage slots, settings, **time system**, flashbacks/dreams, content gating, **rent/eviction**, bar schedule/menu |
| `02-mingle-gear-activity-engine.md` | 1253–2260: **39 bar encounters** (generic, Pig Pen, Crystix, sponsors, 6 romance arcs, ask-outs, bad), the picker and effect applier, **14 gear items**, stores, clock, **`useActivity` (the tick engine)** |
| `03-activity-minigames-pitch.md` | 2260–4025: Busk animation, **RhythmTap**, **RunTracker**, **pitch detection**, voice ranges/calibration, tuner modes, melody templates, VoiceRangePicker, **PitchTuner** |
| `04-beatbox-hero-mic-sequencer-studio.md` | 4020–5785: **Beatbox Hero** (12 lessons, windows), **mic beatbox detector** (FFT band profiles), **Originality Sequencer**, **Sound Studio** (record/trim/assign samples) |
| `05-ui-components-cutscene-panels.md` | 5780–7440: Jam/Run animations, pixel icons, bars/buttons, error boundary, **Cutscene engine**, Messages, Foxy modal, **DevPanel (29 cheats)**, Settings, Achievements |
| `06-scenes-characters-title-a.md` | 7432–9130: Mingle modal, rent scenes, **Foxy / Pig Pen / BeeAmGee** sprites + scenes, flashbacks, title, dream, apartments, plant scenes |
| `07-scenes-tour-training-intro-b.md` | 9124–10880: tour, Pig Pen challenge, Penny reveal, date, mingle, open-mic stage, sleep, 4 training scenes, dancer, **intro story (full transcript)**, **11 tutorials**, Slots screen |
| `08-main-app-hood-crew-songs.md` | 10877–12680: **the main app (architecture, boot, autosave, 2 AM collapse, level-up)**, Create screen, **Hood map**, Crew, Songs library, Livestream, BeeAmGee coaching |
| `09-house-and-shop.md` | 12624–14695: **House** (training, kitchen, couch, nap/sleep, **the morning transition**, wardrobe, studio, goals, Foxy panel) and **Shop** (4 day-gated stores, sounds catalog) |
| `10-park-bar-showcase.md` | 14690–16445: **Park** (busk/jam/run + dates), Rohzel, showcase scheduling, open mic, nap/sleep presentation, **Bar** (weekday programme, menu, mingle, tour, festival panels) |
| `11-battle-stage-audio-music.md` | 16420–17875: pixel battle stage, HUD, **every synthesized sound (exact recipes)**, sample storage, **music engine (2 tracks)** |
| `12-battle-screen.md` | 17865–18800: **battle** (4 rounds, RPS, scoring, judges, finisher, outcomes), crew/festival resolution, worked test vectors, Monte-Carlo win rates |

How to use them: treat each `##` heading as a checklist item. Generate `PARITY.md` from the headings (a 10-line script), tick items
as they are rebuilt *and tested*, and keep a "decided differently" table at the bottom. When an inventory says "Rebuild notes:
pure logic that can be lifted", lift it into the core first.

---

## 5. Target architecture (mirror Awesome Farm)

New folder `beatbox_story_phaser/` (name is a suggestion). Same toolchain as Awesome Farm: **Phaser 4.0.0, TypeScript strict,
Vite 6 for dev/build, `tsx --test` for tests, `build:single` for a one-file build**. (The repo's root `build.js` bundles with esbuild
into `dist/<game>/…`; esbuild can bundle Phaser into one IIFE, so wiring the new game in later is a small change — but that is the
owner's call, see §12.)

```
beatbox_story_phaser/
  CLAUDE.md, DESIGN.md, PARITY.md, README.md
  src/
    shared/              ← NO Phaser, NO DOM, NO localStorage; runs in node tests
      config.ts          dials: tick sizes, caps, prices (every constant the inventories list)
      rng.ts             injectable seeded RNG (the old game uses Math.random everywhere)
      char.ts            Char type, initialChar(), CURRENT_VERSION, migrate() (versioned; optional old-format importer)
      time.ts            clock, day-of-week, time-of-day, day gates
      data/              sounds, npcs, crews, judges, food, gear, outfits, achievements, challenges, events,
                         mingle encounters (+romance), flashbacks, tutorials, intro beats, messages, rohzel/bjarne lines
      sim/               pure `(char, args, rng) -> { char, effects[] }` modules:
                         endDay.ts (ONE rollover pipeline: sleep / collapse / nap), rent.ts, activity.ts (tick/reward),
                         training.ts, battle.ts, crewBattle.ts, mingle.ts, romance.ts, bar.ts, park.ts, showcase.ts,
                         shop.ts, house.ts (food, plant, coffee, yoga), crew.ts, songs.ts, livestream.ts, festival.ts,
                         tour.ts, achievements.ts, unlocks.ts, challenges.ts, messages.ts
      saves.ts           slot IO against an injected `Storage`-like interface, export/import, scheduler (leading+trailing 2 s)
      effects.ts         the Effect union: toast | sfx | cutscene | achievement | unlock | levelUp | navigate | …
    client/              ← Phaser
      main.ts, res.ts (SS density), settings.ts
      store.ts           the Game store: dispatch(action) → run sim → apply effects (toasts, sounds, cutscene queue…)
      art/               painter (copy awesome_farm/src/client/art/paint.ts), character renderer, NPC sprites,
                         scene plates, props, icons, UI theme
      audio/             synth.ts (the recipes), music.ts, samples.ts (IndexedDB), mic/{pitch,onset,bands}.ts
      ui/                kit (Win/button/Slot/label/tooltip/Baked) re-skinned for this game, Cutscene player, Toasts, panels
      scenes/            Boot, Title, Slots, Create, Hood, House, Shop, Park, Bar, Battle, Cutscene, + mini-game scenes
      juice/             fx table (action → sfx + burst + shake), sfx, music
    dev/harness.ts       __solo/__step/__key/__shot/__gallery like Awesome Farm
  tests/                 unit (per sim module), differential (vs old code), scenario bots, saves, audio-signal tests
```

Design rules (all from hard-won experience in Awesome Farm / the old game's problems):
- **Reducer + effects, not `setChar` spaghetti.** UI never mutates the save. It dispatches an action (`{t:'eat', food:'banana'}`);
  the core returns the new char and a list of *effects*; the client plays the effects. This removes the old bugs where toasts, level-ups
  and cutscenes fired from inside state updaters (and got lost or doubled).
- **One day-rollover pipeline** (`endDay(char, cause, rng)` with `cause = sleep | collapse | nap`), deliberately deciding what a 2 AM
  collapse still pays (the old one skips songs, crew, challenges, weekly reset, events — resolved in §9 #4; see inventory 08 §G).
- **Cutscene queue**, not a single slot (old: a second cutscene silently replaced the first and its completion callback never fired).
- **Time is simulation-driven**, never frame-driven: a fixed-step ticker for game minutes and `dt`-based animation (the old scenes use
  `fc++` per `requestAnimationFrame` and run twice as fast at 120 Hz).
- **Determinism**: inject the RNG (a seeded one in tests, `Math.random` or a seeded-per-day one in the game).
- Keep `char` plain JSON, versioned (`version` field, `migrate` steps), so saves are portable.
- Everything content-like is a data table with a content test (every achievement has art/text, every gear item has an icon, every
  encounter has valid effects…).

---

## 6. Rendering and graphics plan (this is where it becomes "awesome")

### 6.1 Canvas and scaling
The old game is a **portrait 480-wide frame**. Recommended: logical **480×854 (≈9:16) with `SS = 2`** (1920… no: **960×1708** canvas),
`Scale.FIT` + centred, letterboxed on desktop, using Awesome Farm's `res.ts` (`hudCamera`, `logical`, `addDense`). The old hood/house
PNGs (480×860) are the size reference; the new art is painted at 2× (960×1720). **Portrait only (decided, §12)** — no landscape layout; on a wide desktop
window the portrait canvas is letterboxed and centred.

### 6.2 The look (decided): neon-noir pixel art with a painted street-storybook finish — fresh art, same style and vibe

The owner chose **neon-noir pixel art** *and* **a painted street-storybook look**, portrait only, and wants **fresh graphics in the same
style and vibe as the existing art**. So: *do not ship the old PNGs*; use them as **style references** (open them: `beatbox_story/title.png`,
`hood-day.png`, `hood-night.png`, `house-day.png`, `house-night.png`, `intro-1…7-*.png`, `beatboxer-park.png`, `cat-walk.png`) and repaint everything.

**What the existing art feels like (keep this vibe):**
- *Cinematic low-res night streets*: a purple-to-orange dusk sky over a dark city skyline; brick tenements with **warm lit windows** against cool violet shadow; wet cracked asphalt reflecting light; street lamps throwing amber cones; **a red neon "LIVE" sign** and a vertical neon; manhole steam, graffiti on park walls, litter, hydrants, AC units, fire escapes; a corner shop with orange striped awning ("CORNER SHOP", "NEWS").
- *Interiors are lived-in and warm*: the apartment is a cutaway of small rooms (bedroom with desk + monitors + window blinds, a vocal booth with foam panels, a kitchen, a hallway, a living room with couch/TV/plant), clutter everywhere, string lights, posters ("BEAT BOX", "DROP BASS NOT BOMBS"), a low amber sunset through blinds.
- *The protagonist*: a young man in a **red cap and hoodie** (red hoodie + olive cargo trousers on the title art; grey hoodie + red cap in the park sprite sheet), holding a mic, with cyan-yellow-green **sound-wave rings** around him. Expressive, slightly moody, never cartoonish. Customisable (5 skins, 6 hair colours, 5 hair styles, 8 shirt colours, 11 outfits, 7 accessories) so the renderer must be layered (§6.3).
- *Mood*: melancholy but hopeful; neon and warm window light are the "hope" colours against indigo/purple "noir".

**How to make it (techniques to combine):**
1. **Neon-noir pixel art**: a locked ~32-colour palette (indigo/violet shadows, brick browns, warm amber, hot red/pink neon, cyan and lime accents, cool grey asphalt); strong rim light; **additive glow/bloom on neon and windows**; rain, steam, dust and light-cone particles; wet-street reflections (a flipped, faded, rippled copy of lit sprites under a mask); a colour-grade + vignette pass. In Phaser 4 use the WebGL filters/FX and lights (check the v4 docs/types in `node_modules/phaser`, do not rely on v3 memory), plus small custom shaders where needed.
2. **Painted street-storybook finish** (the Awesome Farm technique, re-tuned for night): painted banded shading from a clear light direction, **coloured outlines taken from the material** (never pure black), warm ink as the darkest tone, hand-placed grime/specks/graffiti, soft contact shadows added by the game, and *storybook* composition: each scene is a deliberate little illustration (clear silhouette, one focal light, readable props).
3. **Density**: author at **2×** (`SS = 2`) like Awesome Farm so the pixel art stays crisp and detailed; portrait logical size 480×854 (canvas 960×1708); backgrounds as plates ≈960×1720 (maps) or ≈960×540 (scene plates), characters ≈2× the old sprite sizes, with 8–12 frame animations.
4. **Production pipeline**: the painter library (`awesome_farm/src/client/art/paint.ts`) for characters, props, icons, UI; for large backdrops combine painter-built layers with the local **ComfyUI** pipeline (`tools/comfyui/make_sprite.py`, SDXL + Pixel Art XL + palette snapping; only from a session on the owner's PC with a reachable ComfyUI) — generate, then **hand-correct and palette-snap**, never ship raw generations. Keep every generated/painted asset reproducible (script + seed + palette) so it can be redone at another density.
5. **Look at every asset after making it** (`__gallery`, `__shot`, Playwright). First deliverable: a **style test** of three images (dusk street, apartment cutaway, the hero with a beatbox pose + glow rings) for the owner to approve, then build the rest.

### 6.3 What has to be (re)made
- **One layered paper-doll character** (the biggest win, because the old game redraws the player differently in every scene and 6 scenes
  ignore hair/accessory): body/skin (5 skins), shirt colour (8) and **11 outfits**, **5 hair styles × 6 colours**, **7 accessories**,
  poses: idle-bob, beatbox (mouth/leg anim), dance ×4, seated at bar, bench sit, couch lie, bed sit with headphones, desk profile,
  point, battle stance/finisher. Painted with the painter library at SS density as frames, driven by `dt`. Look first at
  `tools/hocus_vocus/rj_art/` for ideas (a code-drawn character kit); everything is repainted in the new style (§6.2).
- **Named characters with portraits and expressions**: Foxy (roommate: green oversized sweater, auburn hair, gold earring; they/them),
  Pig Pen (rival: red clock cap, black/red track jacket, goatee), BeeAmGee (grey-bearded Danish OG, black leather jacket; code name Bjarne),
  Rohzel (bar keeper), Penny, the 5 judges (Tek, Mel, Origi, Showtime, Wildcard), the 7 solo opponents + 3 crews (3 members each),
  5 hireable crew NPCs, sponsors, the 6 romance candidates (Luca, Mira, Sky, Pascal, Jin, Roo), parents (texts only).
- **Scene plates for ~34 scenes** (inventories 06 and 07 describe every one: setting, elements, poses, animation, colours; keep each scene's *story content*, repaint it): replace each
  procedural canvas with a painted plate + a few animated sprites/particles/lights. Suggested plate size 960×540 (2× the intro art).
  Bake static layers into textures; animate small things only.
- **Maps**: hood (day/night, 4 hotspots, walking cat, ~40 night light overlays) and apartment (day/night, 5 hotspots): upgrade to layered
  maps with parallax, animated lights/neon/smoke, a day-night cross-fade, and tappable props with hover glow; keep the hotspot semantics (§8.2).
- **UI re-skin**: a new theme in the Awesome Farm UI kit (panels, buttons, bars, tooltips, toasts, modals); icons replace the 17 hand-drawn
  pixel icons and lucide icons; achievements fanfare; level-up; the battle HUD (hype meter, hearts, judge reveal, FINISHER splash).
- **Intro story**: 8 beats / 24 lines (all repainted in the new style; the old images in `beatbox_story/intro-*.png` are the reference) — keep the beat structure (image, lines, CSS-like light overlays, Ken-Burns
  drift 14 s, crossfade 1.1 s, `intro` music) but implement with Phaser tweens, additive "screen" blend lights and particles.
- **Particles and juice**: apply the **juice rule** (sound + burst + shake for every key action: reward ticks, level-up, unlock, perfect/good/miss,
  finisher, purchase, cash/fans gains, achievement). The old game has `FloatingSound` words, hearts, sparks and waves: keep and improve.
- **Animation timing**: reference everything to ms, never frames (the inventories give frame→ms tables for the scenes).

### 6.4 Tools for making the art
- The **painter library** (`awesome_farm/src/client/art/paint.ts`) for characters, props, icons, UI — copy it, keep the rules in Handover 1 §5.2.
- **ComfyUI** pipeline for backdrops/props (documented in the root `CLAUDE.md`: `python tools/comfyui/make_sprite.py "<subject>" --name n --palette
  awesome_farm/palette.gpl`); only works from a session on the owner's PC with a reachable local ComfyUI. The existing PNGs look AI-generated + pixel-snapped, so this
  matches the established look. Snap outputs to the game's palette.
- Dev helpers: `__gallery` to review sprites, `__shot` + Playwright to look at every scene (Handover 1 §8). **Look at every asset after making it.**

### 6.5 Saves (no old save exists; keep the new format clean)

The owner has **no save file** from the old game, and tests with the old game's developer menu, so **backwards compatibility is not a requirement**.
Therefore: design a clean, **versioned** save (`version` field, migration steps with tests, plain JSON, a 5-slot store, export/import to
a `.json` file, autosave leading + trailing 2 s with flush on `pagehide`/`visibilitychange`, and flush of the *old* slot before switching).
Use new internal ids (e.g. `beeamgee`, not `bjarne`) and new storage keys (suggest the prefix `bbs2:`). *Optional, low priority:* a best-effort importer for the
old format (`bbs:character:slotN`, the shape is in inventory 01/08) in case friends of the owner still have old saves — cheap to add because `migrateChar`
is fully documented. Recorded samples (IndexedDB) are per slot, deleted with their slot, and exported with the save (fixing old bug 15).

---

## 7. Parity strategy and testing (how to be sure nothing is lost)

1. **Lift pure logic first** (inventories mark it): data tables → `shared/data`, functions → `shared/sim`. Do it mechanically, keep names.
2. **Differential tests against the old code.** Most old logic is pure (`char → char` or numbers in/out). Build a small harness that loads
   *functions from the old JSX* (esbuild a tiny entry that re-exports them, or evaluate extracted snippets) with a seeded `Math.random`, and assert the
   new TypeScript gives the same numbers for many inputs: `resolveCrewBattle`, `computeRentEvent`, `pickMingleEncounter`/`applyMingleEffects`,
   `applyRandomEvent`, `pickDailyChallenge`, the battle score formulas (`12-battle-screen.md` has a worked test vector and Monte-Carlo win rates),
   open-mic/showcase payouts, `finishSleep`'s arithmetic, `applyAchievements`, `applySoundUnlocks`, `_moodDrainFor`, `festivalEligible`, song decay.
3. **Scenario bots** (like `awesome_farm/tests/botlib.ts`): scripted players that play a week and a month through the real dispatcher: pay rent, miss rent
   three times (eviction → couch → back on feet), win/lose battles, unlock sounds, get all achievements, reach the festival.
4. **Signal tests for audio**: synthesised sine/noise buffers into the pitch detector and onset/band classifier; assert detected Hz/cents and hit types.
5. **Save tests**: versioned migrations; export/import round-trips (including recorded samples); autosave scheduler (leading + trailing 2 s, flush on page hide); every developer-menu action.
6. **Visual checks**: Playwright screenshots of every scene/screen at phone size, reviewed by eye; compare the *story content* of each scene with the old game (it can still be run from `beatbox_story/`), not its pixels.
7. **`PARITY.md`** generated from the inventories' headings; the stage is not done until its boxes are ticked or moved to "decided differently".

---

## 8. Key mechanics the new core must get exactly right (pointers into the inventories)

(Numbers below are headlines; the inventories have every constant.)

### 8.1 Time, energy, rent, the day
- `char.minutes` = minutes since 06:00 (0 = 06:00, 720 = 18:00 night starts, 1080 = 00:00, **1200 = 02:00 forced collapse**). Day 1 = **Tuesday** (`dow = day % 7`, 0 = Monday).
- Activity tick: **10 game-minutes per 500 ms** (AFK) or 3 game-minutes per 2500 ms in "play" mode; a reward every 5 ticks; stop reasons in order:
  exhaustion, hunger 0, 02:00, custom stop, day change (`02-…md` §useActivity has pseudocode for a pure `activityTick`). Passive mood drain formula in `01-…md`.
- Rent: collected when waking into a **Sunday**: $50/$100/$200 by apartment tier; third consecutive miss → eviction (3 couch-surf days, penalties); **no game over**.
- Sleep rollover and the 2 AM collapse: `08-…md` §G (two paths) and `09-…md` (the huge morning transition). Build ONE `endDay`.
- Overnight chances: bad sleep 10 %, random event 30 % (24 weighted events), flashback 25 % (4, once each), dream 5 % from day 30, parent/anonymous texts.

### 8.2 The map screens and gating
- Hood: 4 percentage-rectangle hotspots (house, park, bar, shop) over the day/night map; **park daytime only, bar from 18:00, shop from day 4**, bar from day 3,
  mingle from day 5; stores in the shop unlock by day (music 4, furniture 5, clothing 7, pet 10). The old game enforces some gates *only on the hood map* (the footer
  nav bypasses them) — fixed by one `canEnter(location, char)` (§9 #14).
- Apartment: 5 hotspots (PC/Train, Studio, Kitchen, Wardrobe, Couch). Weekday programme at the bar: Mon closed, Tue–Thu open mic, **Fri paid showcase**
  (needs 50 fans + 5 open mics, booked through Rohzel, 7-day cooldown), **Sat battle night**, Sun karaoke.

### 8.3 Training and mini-games
Four stats via the activity engine; the embedded mini-game reports a quality number every 2.5 s, the parent keeps only the last one and reads it at the reward tick
(busk/musicality/technicality/originality thresholds 0.5 / 0.8). Beatbox Hero: 4 lanes (B/T/K/Pf), notes fall 1400 ms, windows 110/180 ms (taps) and 200/350 ms (mic),
12 lessons. Pitch Tuner: 3 modes (beginner/advanced/karaoke), autocorrelation on 2048-sample buffers, in tune = |cents| < 50, octave-forgiving. Sequencer: 16 steps, 4 slots (8 with the MPC),
BPM 60–180. Sound Studio: onset 0.04 RMS, 120 ms silence stop, 600 ms cap, normalise 0.85.

### 8.4 Battles
Fixed 4 rounds (A,B,A,B), rock-paper-scissors over four *styles* (BOOM > HATS > RIM > SNARE > BOOM, ×1.5/×0.7), score formulas, 8-perfect **finisher**, **5 judges** with
biases and ties to the opponent, win ≥ 3 judges, rewards/penalties, 7-day cooldown shared with crew battles. Crew (3v3) and festival are separate pure resolutions. `12-battle-screen.md` is a full spec.

### 8.5 Social, money, meta
Mingle (weighted pool, effect applier, romance affinity ≥5 romancing / ≥10 couple, dates), sponsors by follower thresholds (50/100/200/500/1000), songs (release a sequencer
pattern; 7-day decay table summing to 1.00), crew (5 NPCs, flat daily cash+fans), livestream, coaching, gear (14 items, $3,960 total), outfits/accessories unlock rules,
daily/weekly challenges, 20 achievements, 12 sound unlocks, festival (14 prep days, 3 paths). The inventories give every number.

### 8.6 Audio
Every sound is synthesised (recipes in `11-…md`: oscillator types, frequencies, envelopes, filters, noise, gains): kick, snare, hat (open/closed), bass, scratch, whistle, lip roll,
click, rimshot, rooster, beeps, level-up/achievement/unlock/win/loss stings; two music tracks run by a 25 ms timer with 180 ms lookahead: **Title** (160 BPM, 64 sixteenths,
C–G–Am–F) and **Intro** (68 BPM, 28 s loop, Am–F–C–Em). A player's recorded sample for a sound overrides the synth. Port 1:1 first (they are the identity of the game), then route through a
master bus with a limiter and the Music/Effects sliders; consider pre-rendering the loops with `OfflineAudioContext`. Fix: private `AudioContext`s that never `resume()` and ignore the mute setting;
mic left open after cancel.

---

## 9. Known bugs and oddities in the old game — the owner's rule is: FIX EVERYTHING

Collected from the inventories' summaries (each file's GOTCHAS lists more; read them and fix those too). Every fix gets a test and a line in
`CHANGES.md` (what was wrong → what it does now → numbers touched). Where the old behaviour was *advertised but missing*, implement it as advertised. Where code and
comments disagree, follow the **code's numbers** (that is what players experienced) unless the text clearly promised something else. After the fixes, run a **balance
bot** over the first 60 in-game days to confirm the economy still feels like the old one (rent affordable, 7 opponents beatable in order, festival reachable).

| # | Oddity in the old game | Resolution in the rebuild |
|---|---|---|
| 1 | Weekly challenges `battleWins`, `openMic`, `mingles` can **never complete** (only busks/jams/runs write `char.weekly`) | All counters wired through one `bump(counter)`; every challenge completable; test per challenge |
| 2 | `new_bed` gear: `Math.min(max, max+20)` is a **no-op** | Implements what its shop text says (read the gear text in inventory 02) |
| 3 | Advertised effects missing: rent-increase event, apartment tier-2 "less bad sleep", tier-3 "+25% home recording", mic "better PitchTuner accuracy", sponsor recurring pay/gear | Implement each as advertised (or, where the text is vague, pick a sensible small effect and log it) |
| 4 | **2 AM collapse** skips songs, crew pay, challenges, weekly reset, events, bad-sleep roll | One `endDay(cause)` pipeline: a collapse pays the same passive income and rolls the same events, but keeps its penalties (60 % energy, −25 hunger, −12 mood), drops nothing silently |
| 5 | Single-slot cutscene overwrites the current one (completion never fires) | Cutscene **queue**; completions always fire |
| 6 | Side effects (`checkLevelUp`, toasts, `triggerPennyReveal`) inside `setChar` updaters; the Penny cutscene can be skipped | Pure reducers return an **effects list**; the Penny reveal is a guaranteed queued effect |
| 7 | Tutorial `start_busk` never fires on a fresh char; `_sleepingNow` never set; old saves replay all tips | Predicates fixed and tested; tips flagged once per save |
| 8 | Houseplant: text (“$5 / 3 days”) ≠ code (5-day window, 3 waterings/day, 4th drowns it, replacement only after next Tuesday) | Keep the code's rule, make every text/scene say the same thing |
| 9 | Comments disagree with code (1 real s = 10 vs 20 game min; 3 vs 5 good bars for +1 max energy; tuner durations; ±4 vs ±5 semitones) | Code's numbers win; no misleading comments/UI text |
| 10 | Beatbox Hero lessons 6–12 need catalog-sound lanes the mic detector can never emit; lesson 12 unplayable by mic; only beats 0–7.99 of each 16-beat pattern are played; lesson completion ignores accuracy | Mic classifier covers all 12 sounds (per-player learned profiles, §14); full 16 beats; completion needs a minimum accuracy; every lesson playable by tap and by mic |
| 11 | Open mic fans/payout **not skill-scored** (sequencer replay is cosmetic); label says 30 min, code spends 60 | Score uses the sequencer pattern's quality + showmanship; label and cost agree (60 min) |
| 12 | Romance "stages" are random beats, affinity farmable without cap; sponsor chats eligible too early (~24 % of early picks) | Sequential beats per candidate, per-day cap on affinity, sponsor chats gated by their thresholds |
| 13 | Dead data/code: `drawTitleScene`, `jinCollab`, `<id>_dateScheduled`, `heat`, tier-3 coaching bonus, unused icons (fist, beer, shop, home, tree), `intro` screen, `metEncounters`, `takeFoxyLoan` | Dropped (or wired up where it was clearly meant to exist, e.g. the Foxy loan) |
| 14 | Hood gates enforced only on the map; footer nav bypasses them | One `canEnter(location, char)` used by every entry point |
| 15 | Deleting/exporting a save slot ignores its recorded samples; a new character inherits old ones | Samples live with their slot: deleted with it, included in export |
| 16 | Visual bugs: BeeAmGee's face overpainted by the crowd; crew opponent #3 is the player's face in red, #1–2 have no eyes; parent flashback shows the player standing; Run scenery stops scrolling; malformed pixel heart; headphone ear cup misplaced; tour van tail light invisible; stage lens flare covers the performer | New art (all scenes repainted); each scene checked by screenshot |
| 17 | Audio: lip-roll buzz never decays; `inward_k` identical to `psh_snare`; open hat cut short; samples dropped when a slot loads while muted; no master bus/limiter; private `AudioContext`s never resumed and ignoring mute; mic left open after cancel | Fixed: distinct sounds, proper envelopes, master bus + limiter, one shared `AudioContext`, mic always released |
| 18 | Every canvas animation depends on refresh rate (2× at 120 Hz) | All animation `dt`-based |
| 19 | DELETE confirm is case-sensitive but the input shows capitals | Case-insensitive confirm |
| 20 | `finishBattle`: forfeit costs nothing; no sickness check for solo battles; `counterSkill` comment inverted vs code; judge hearts cosmetic | Forfeit costs energy and starts the cooldown; sickness blocks battles; hearts reflect the judges; comments true |
| 21 | `finishSleep` fires up to 4 cutscenes, only the last survives; a nap to 2 AM is overwritten by the collapse watcher | Queue + single pipeline (see 4, 5) |
| 22 | Songs can be released repeatedly without a cap (fan farming); open-mic/karaoke/festival grant XP without level-up checks; `firstShowcase` never set | Diminishing returns/limit on active songs; XP always through the central level-up; flags set |
| 23 | Date scene only maps Luca/Mira/Sky looks; Pig Pen has three conflicting looks and an unused `sad` pose; | All six partners have looks; one canonical Pig Pen with all poses |
| 24 | "BeeAmGee" in UI but "Bjarne" in code, flags and save keys | Everything is `beeamgee` |
| 25 | Text that disagrees with art/rules: plant-arrived "every three days, a small drink"; rent "LATE" notice hard-codes "-50$"; festival invite says three weeks but the constant is 14 days; scene captions (Musicality, Showmanship, "Bus seats" over a van) | All text generated from the real constants / rewritten to match |
| 26 | **Weekend tour** refills energy to 70 % and skips rent/daily resets; a showcase can rewind the clock by up to 60 min; festival paths A/B/C are a **single RNG roll**, not what the UI promises; park AFK animations ignore the player's look; bar-menu hangover debuffs stack unbounded | Tour goes through `endDay`; the clock never goes backwards; festival paths become short playable sequences built from the existing mini-games/battles (design them from the UI text and `10-park-bar-showcase.md`); the player's look appears in every scene; debuffs capped |

---

## 10. Performance plan (what "optimized" means here)

- **One Phaser game**, one canvas, scenes — instead of ~10 simultaneous `requestAnimationFrame` canvases + a React tree. Bake static layers into textures; animate small sprites; use texture atlases for characters.
- Reuse Awesome Farm's tricks: `Baked` panels (no per-frame `Graphics`), one quad per static frame, object pools for particles, `dt`-based timers, SS=2 density only where it matters.
- Mic DSP off the hot path: the old pitch detector does ~2.1 M multiply-adds per call every frame → run it at ≤ 30 Hz in a reused `Float32Array`, consider a faster algorithm (YIN/McLeod/FFT-based autocorrelation); throttle the onset/FFT classifier; avoid allocations per frame.
- Audio: schedule with the Web Audio clock; a shared master bus + limiter; pre-render music loops; decode recorded samples once.
- Storage: debounce autosave exactly like the old rule (leading + trailing, 2 s) but flush the *old* slot before switching; flush on `pagehide`/`visibilitychange`.
- Size: painted art generated at boot (as in Awesome Farm) keeps the single-file build small; embed only the fonts used.
- Mobile: portrait, touch targets ≥ 44 px logical, no hover-only UI, `activePointers: 3`, safe-area padding, pause when the tab is hidden, respect `reducedMotion`.

---

## 11. Work plan (stages the owner can follow; screenshots at each)

Use sub-agents in parallel wherever the work is independent (one per scene/screen/mini-game); you integrate, review screenshots, and own the core.

0. **Setup + style test**: scaffold `beatbox_story_phaser/` from `awesome_farm` (config, Vite, tests, harness, painter, UI kit); write `CLAUDE.md`/`DESIGN.md`/`CHANGES.md`; generate `PARITY.md` from the inventories; update dependencies and read the current Phaser 4 docs (§14); produce the **three-image style test** (§6.2) → owner approves.
1. **Core** (no Phaser): `char.ts` (versioned), time, data tables, injectable RNG, the single `endDay` pipeline, rent, the activity engine, achievements/unlocks/challenges, effects list. Differential tests against the old code as each piece lands (§7).
2. **Shell + dev menu**: Boot, Title, Slots, Create, the cutscene player (queue) with the **intro story**, autosave, settings, and the **developer menu** (§13) — from here on the owner can test anything.
3. **Hood + House + day loop**: layered night/day maps with hotspots, kitchen/food, nap/sleep, the morning transition (events, messages, rent scenes), wardrobe, goals, Foxy panel.
4. **Training + mini-games**: RhythmTap, RunTracker, PitchTuner (+ voice range), Beatbox Hero (tap and mic, all 12 lessons), Sequencer, Sound Studio, songs/crew/livestream/coaching. The audio worklet/mic pipeline lands here with its signal tests.
5. **Park, Bar, Shop**: busk/jam/run, dates; open mic, showcase, mingle + romance, sponsors, menu, tour; stores and gear.
6. **Battles**: stage, HUD, judges, finisher, crews, the festival arc (with its real playable paths), Penny reveal.
7. **Story scenes + characters**: all ~34 scenes as painted plates + layered animation; every named NPC with portraits/expressions; flashbacks/dreams.
8. **Audio**: synth recipes (fixed), music, samples, master bus, latency calibration; mic polish and permission UX.
9. **Art passes** (stage by stage, owner-approved): maps → characters → scenes → UI → lighting/FX.
10. **Perf, mobile and QA**: 60 fps on a phone, long bots (60+ days), balance check after the §9 fixes, parity sign-off, PWA/offline.
11. **Cutover**: only when the owner approves: wire into the repo's build (root `build.js` + Cloudflare Pages, root `npm run check`), keep the old game reachable until then, and follow the root `CLAUDE.md` PR workflow *only when the owner asks you to push*.

Keep each stage shippable (artifact or the dev URL), commit per stage (message ends with the harness co-author line), and report in short plain language.

---

## 12. Decisions

### Made by the owner on 2026-10-06 (FINAL — do not ask again)
1. **Art direction**: *neon-noir pixel art* **and** *a painted street-storybook look*; **fresh graphics in the same style and vibe** as the existing art (the old PNGs are references, not shipped assets).
2. **Layout**: **portrait only**.
3. **Bugs**: **fix everything** (§9) and **make it up to date with the latest models and knowledge** (§14).
4. **Saves**: there is **no save file**; the owner tests with the in-game **developer menu** → rebuild it, bigger (§13). Old-save compatibility is therefore not required (§6.5).
5. **It is a full rebuild in Phaser** (not a port of the React code): new architecture, new graphics, same game.

### Defaults chosen in this brief (change only if the owner objects)
- New folder `beatbox_story_phaser/`, beside the old game; the old game stays untouched and reachable; wiring into the root build/Pages only at cutover with the owner's approval; nothing is pushed unless asked.
- Mic mini-games and the beatbox detector are kept and *improved* (they are a headline feature).
- Single-player/local only, no online features. English text as written (Danish names stay). No new content beyond what the fixes require.
- The old layout editors in `tools/` are replaced by in-game dev overlays (hotspots, lights, cat path) in the developer menu.
- The old title/intro/map PNGs are style references only; provenance of the old art is therefore moot (note: `title.png` has a four-point sparkle mark in a corner that looks like an image-generator watermark; the new art must be original and generated/painted reproducibly).

### Still open (ask only what you cannot decide yourself; give a recommendation)
- Final game title treatment/logo wording on the new title screen (keep "Beatbox Story").
- Whether the festival paths should be longer set-pieces than the existing UI text implies (recommendation: short playable sequences, 2–4 minutes each).
- Whether to ship as a PWA (installable/offline) at cutover (recommendation: yes).

---

## 13. The developer menu (the owner's way to test; first-class feature, build it in stage 2)

The old game has a hidden **DevPanel** (old file lines 7093–7242; spec in `05-ui-components-cutscene-panels.md` §DevPanel): unlocked by triple-tapping the day
badge and entering code `808` (stored in `localStorage['beatbox_dev']`), with **29 controls**: jump weekday/day, time slider + presets, cash, restore
(energy/hunger/mood), fans, XP, +5 to each stat, lock. It is crude (jumping days skips rollover logic, "fill XP" does not level, the time slider cannot reach 02:00).
Rebuild it properly, because **the owner has no save file and tests everything through it**. Keep the unlock gesture and code (configurable, stored under the new key prefix); make it a
portrait bottom-sheet that never blocks the game view, with sections:

- **State**: set/add day (running the real `endDay` rollover N times, or "set without rollover"), weekday, time (any minute incl. 01:59), energy/hunger/mood/cash/fans/XP/level, the four stats, max energy; instant restore; god mode for battles.
- **Unlocks**: unlock all/one of: sounds (12), gear (14), outfits (11) and accessories (7), achievements (20), stores, locations, crew members, songs; reset any of them; set apartment tier; set rent state (late 1/2, evicted, couch-surf).
- **Triggers**: force any random event, flashback, dream, tutorial tip, message, daily/weekly challenge, festival state (invited/prepping/done, path), romance state/affinity per candidate, date booking, showcase booking, bad-sleep, sickness.
- **Teleport & play**: open any screen/location ignoring gates; start any mini-game or battle (pick opponent, crew, lesson, BPM); start any cutscene.
- **Scene gallery**: browse every scene plate, character, pose, expression, outfit/accessory combination and map at day/night (this is also the art-review tool).
- **Time & RNG**: time scale (×1 / ×4 / ×16), pause, step; fixed RNG seed; log of every roll.
- **Audio & mic**: sound board (every synth sound and music track with parameters), master/latency calibration, **live mic analyser** (waveform, detected pitch/cents, onset events, classifier scores per sound) to tune and debug the DSP on the actual phone.
- **Saves**: export/import JSON of the current slot, duplicate slot, reset slot, "new game at day N preset" (e.g. day 1, day 5, first rent, post-eviction, festival-ready, end-game).
- **Perf**: FPS/frame-time/draw-call/memory overlay, texture list, toggle filters/lights.

It must use the same dispatcher/effects pipeline as the game (no state poking from the UI), so using it also exercises the real code. Tests: each dev action has a unit test.

---

## 14. Up to date with the latest models and knowledge (2026) — what that means concretely

The owner asked for the rebuild to be "up to date with the latest models and knowledge". Concretely:

- **Run the session on the most capable current Claude model** (at the time of writing the IDs are `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`; check what is available) and use sub-agents for parallel, independent work. Treat your memory of library APIs as possibly stale: **read the installed versions' docs/types** (`node_modules/phaser`, `npm view <pkg> version`) before using an API.
- **Dependencies**: start by upgrading to the current stable Phaser 4.x, TypeScript, Vite, Node LTS and Playwright; pin them; keep `npm run check` green after each upgrade.
- **Audio DSP (this is where the old code is most dated):**
  - Move the microphone pipeline into an **`AudioWorklet`** (off the main thread, no `ScriptProcessor`/per-frame `AnalyserNode` polling), with a ring buffer and ≤ 30 Hz analysis messages.
  - **Pitch**: replace the naive autocorrelation (≈2.1 M multiply-adds per call, octave errors) with **YIN or the McLeod Pitch Method** (FFT-based), with a clarity/confidence output, hysteresis, and median smoothing.
  - **Beatbox classification**: replace the hand-written 5-band cosine-similarity profiles with **spectral-flux onset detection + a small learned classifier** (MFCC/log-mel features, k-NN or a tiny neural net) **trained on the player's own Sound Studio recordings** (each recording is a labelled example; ship sensible default profiles). This makes all 12 sounds usable by mic (fixes lessons 6–12) and adapts to each voice/phone mic. Run it in the worklet or a worker.
  - **Mic capture settings**: request `echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1` (beatboxing is destroyed by speech-oriented processing); handle permission denial gracefully; always release the track.
  - **Latency**: a **tap/audio calibration screen** (play clicks, measure offset), use `AudioContext.baseLatency/outputLatency` where available, schedule on the audio clock; judge hits against the calibrated offset. iOS/Safari audio unlock and `resume()` on first gesture.
  - Master bus with a limiter/compressor, shared single `AudioContext`, pre-rendered music loops (`OfflineAudioContext`), recorded samples decoded once.
- **Rendering**: Phaser 4's WebGL filters/FX and lights for neon bloom, vignette, colour grade, rain, wet reflections, light cones; texture atlases; object pools; baked UI frames (`Baked`); integer-friendly scaling; high-DPI aware; `dt`-based everything.
- **Art generation**: the painter library + the ComfyUI/SDXL-pixel-art pipeline snapped to a locked palette (§6.2), always hand-corrected and reproducible; keep a style bible (palette, light direction, outline rules, sizes) in the new folder.
- **Modern mobile web**: PWA manifest + service worker (offline), `100dvh`/`visualViewport`, safe-area insets, `navigator.vibrate` haptics (respect a setting), Screen Wake Lock while a mini-game runs, `prefers-reduced-motion`, pointer events (no 300 ms delay), pause on `visibilitychange`, store saves robustly (handle quota errors visibly, ask for persistent storage).
- **Accessibility**: large touch targets (≥ 44 px logical), colour-blind-safe lane colours + shapes, captions/visual cues for audio events, reduced-motion mode, readable text sizes, no hover-only UI.
- **Engineering**: strict TS, a reducer + effects core with injectable RNG, data-driven content with content tests, **text in JSON** (ready for localisation), property-based tests for the sim where useful, Playwright screenshot regression using the deterministic harness, a **balance bot** for the economy after the §9 fixes, and `npm run check` as the single gate.

---

## 15. Working agreements (carried over from Awesome Farm)

- Work autonomously in coherent stages; look at screenshots of everything you make (do not trust the type-checker for visuals).
- Never push, open PRs, or modify the main checkout unless asked. Never kill the owner's processes. Keep the old game untouched.
- `npm run check` (typecheck + tests + build) green before each commit. Tests must not touch the DOM in `shared/` (the server-style typecheck has no DOM types).
- Patch scripts: write them with the Write tool and run them; avoid heredoc backslash escapes; never commit scratch scripts.
- Memory: when you learn something durable (the owner's taste, gotchas), save it in `C:\Users\danhi\.claude\projects\C--Users-danhi\memory\` (see `project_awesome_farm*.md` for the style) and keep `MEMORY.md` as a one-line index.
- Owner's taste: quiet looping SFX, brief accents, goals reachable on a casual playthrough, gentle failure, short plain-language reports.
