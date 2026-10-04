# HOCUS VOCUS: the art and audio plan (agent E)

Status: ART-AUDIO rev 1. This file says how every picture and every sound of the fork changes: the owners' chibi cast replacing
`ART.hero`, the outfits (skins), the logo and title, all 14 scene ids and the screens that paint their own art, the redraw of all 51
enemies, the 59 card motifs, every icon kind, the map, the 24 fx, the UI skin, the cover and the site card, the 19 music tracks, the 73
sfx ids, the Spells' voices, and the sample hook for the owners' real beatbox and vocal recordings.

Authority: `HV_BIBLE.md` wins on every word and every name; `HV_ENEMIES.md` wins on every enemy design; `HV_HEROES.md` on card names
and concepts; `HV_WORLD_DATA.md` on Charm icon looks. Where this plan needs one of them to change, section 13 says so. Internal ids never
change (bible H1): only pixels, sound and the comments that describe them.

How to read it: 0 decisions; 1 rules for every task; 2 the cast and the outfits; 3 logo, title, scenes and painted screens; 4 the 51
enemies; 5 card motifs; 6 icons; 7 the map; 8 fx and the combat look tables; 9 UI skin, cover and site card; 10 audio; 11 the sample
hook; 12 phases and work split; 13 conflicts and open questions.

## 0. Decisions at a glance

| # | Decision | Choice | Why |
|---|---|---|---|
| E-D1 | Cast art | The owners-approved chibi kit (`kit.js`, `roxor.js`, `jasmin.js`, `crew.js`, committed to `tools/hocus_vocus/rj_art/` by HV_PHASES P0 step 0a) is ported into the fork as `js/art_cast_kit.js` and `js/art_cast.js`. `js/art_heroes.js` (the Echowake anime heroes) is deleted from the fork only. | The owners' chibi cards are the style authority, and these figures are already drawn, reviewed and liked ("looks awesome already"). |
| E-D2 | `ART.hero` contract | The whole API stays (`draw portrait medallion bounds poseMs pointAt keyPt warm audit expressions ids`), now an adapter over the kit. The kit's five poses (`idle sing attack hurt cheer`) plus five new pose tables per figure (`windup strike block down walk`) cover the eight engine poses with the same lengths and key moments. | Screens, SCENE, cards and the map keep working without a change of call. |
| E-D3 | Namespace | The kit lives on `ART.rj` (never `window.RJ`); `ART.cast` is the small public wrapper for Jordan, outfits, story art and gallery sheets. | Hygiene: an art file is one IIFE and adds no global. |
| E-D4 | Outfits (skins) | Exactly bible 7.1: per-viewer key `hv_skins_v1` holding `{heroId: 'skin' or 'stage'}`, unlock read from the three Stickers at draw time, an `Outfit` row in the hero select detail panel. Card illustrations always wear stage clothes (`HV_HEROES.md` 1.5). | No save field changes; the bot, RUN and COMBAT never see it. |
| E-D5 | Line colours | Heroes and crew: the kit's warm brown `#2d170f`. Act I and Act II creatures: deep navy `#22264a`. Act III creatures: cool slate `#5a5f7a` (`HV_ENEMIES.md` 4.4). | Friends and foes share one chibi style but read apart at a glance; the Perfect Stage reads too clean. |
| E-D6 | Enemies | Redraw all 51 in code. Keep every rig (bones, chains, pose timings, telegraphs, size class, part baking, phase structure) and replace every part painter, using one shared foe kit plus one helper set per Act. | The Echowake enemies are anime ink (tapered indigo lines, halftone, washi grain); a re-skin would leave that line under the new paint. The rigs carry the tested behaviour. |
| E-D7 | Logo | Two stacked chunky rounded words, HOCUS (pink) over VOCUS (green), cream inner rim, thick warm outline; the O of HOCUS is a cherry blossom, the O of VOCUS is a green mic grille; a mic-wand with a star crosses behind; the owners' RJ monogram is the emblem (favicon, card back, share card). | Bible 1.2 plus the owners' own logo (pink and green lettering, blossom, loop). See 13.1 for the letter colour. |
| E-D8 | Title | A little round stage under a huge moon: Jasmin and RoxorLoops either side of a vintage mic on a stand. Before the first win the mic is shrink-wrapped in the Gloss (`opts.rung` false); after it the mic is live (`rung` true). The three Acts sit on the horizon. | The owners' chibis are the stars; the Gloss and the "Human" theme are told in one picture. |
| E-D9 | Palette | Every existing palette key and value stays (tests pin `pal.*` and CSS tokens are ids). New keys and tokens are added (`hv*`, `gloss*`); the UI moves from vermilion lacquer and gold leaf to candy pink and green stickers on the deep indigo night. | No regressions; owners asked for green and pink on an indigo base. |
| E-D10 | Instruments | Replace the Japanese instruments with a vocal and beatbox band: `kick snare hat throat scratch croon choir synth keys ebass glock uke whistle clap`; keep `pad arp vox crackle`. | The duo's sound: beats, bass lines, throat bass, scratch, soft sung runs, RawClaw's synths, Andy's bass. |
| E-D11 | Scales | Diatonic keys for the score (`major mixolydian dorian minor lydian`); the melodic reveal sings on the pentatonic subset of the same key (`penta`, `pentaMinor`). | Real pop harmony in the score, and a wake note can still never clash. |
| E-D12 | The Gloss in sound | The map low-pass mute stays (muted ground sounds muffled). New: Act III and the last two fights start dead on the grid (no swing, no human timing) and gain swing and human timing as the act is unmuted or the fight turns. | Bible 2.3: "Music starts perfectly quantised with no swing at all, and gains swing and human timing as the Act is unmuted." |
| E-D13 | Sample hook | `js/data_samples.js` holds `DATA.SAMPLES` (ships empty); files go in `hocus_vocus/audio/`; same-origin lazy load after the first gesture, decoded once, synth fallback always. | Bible 7.3: today's build makes no file request at all. |
| E-D14 | sfx ids | All 73 ids stay. Per-hero voicing comes from an option, `AUDIO.sfx(id, {hero})`, and recipe keys `id.hero` (for example `card_play_attack.kuro`), never from new ids. | `LISTS.sfx` is closed and the hygiene suite checks every literal. |

## 1. Rules for every art and audio task

Hard rules (bible section 6, CLAUDE.md, repeated because every agent reads this section first):

1. Ids never change (H1): hero, card, enemy, relic, gem, status, tile, brush, scene, motif, relic icon, stat icon, fx, sfx, music id,
   palette key, CSS class, custom property, sheet name and API member names all stay. Only pixels, sound and descriptive comments change.
2. Engine mechanics never change (H2): no art or audio task touches combat, run, map or meta logic. The bot's records stay byte-identical
   through every art and audio phase.
3. Never an em dash or an en dash anywhere (code, data, docs, tests, commits). British spelling in comments and copy (colour, centre,
   grey, favourite). Printable ASCII in every DATA string.
4. All art is canvas code (no image files); all sound is WebAudio synthesis (the only files ever loaded are the owners' optional samples,
   section 11). No network: no remote font, script or image.
5. No animal products drawn or named anywhere (H5): no leather, fur, wool, felt, fleece, silk, down, feathers as material, pearl, coral,
   ivory, bone, horn as material, shell as material. Velvet-looking stage curtains are just "curtains"; the goat suit is "cosy fabric".
   Animal-like characters (Kraki, gulls, the goat suit, Botlings) are fine; their bodies are just bodies. Food drawn is always
   plant-based (fruit, oats, noodles, beans, rice, tea, smoothies) and never labelled as such.
6. No real people beyond the handles (H3): no judges, presenters, venues, platform logos, platform colour pairings or interface copies.
   Hearts, thumbs, red dots and play triangles are generic.
7. Text painted by art code is limited to: the logo `HOCUS VOCUS`, the RJ monogram (a drawn emblem, not a word), the bible's hit words
   (`LA! BOOM! SIZZ! TING! WOMP! PKAH! NANANA! TA-DA!`), the enemy art words `APPLAUSE`, `SKIP`, `FLAWLESS!`, the Notification Imp's
   number, `ON AIR` on the Studio stamp, `ALL AREAS` and `CREW` on two Charm icons, the three Scrollopolis graffiti words of bible 2.3
   (`first!`, `mid`, `who asked`), the handle `@roxorloopsandjasmin` on the share card, and the score digits of the share card. Nothing
   else.
8. Everything stays deterministic: no clock, no banned random call, every variation seeded (`tk.rng`, `U.rng`, `tk.vary`). Every draw
   is wrapped, never throws, keeps save and restore balanced, and survives NaN, negative sizes and unknown ids.
9. Reduce motion (`tk.motion()` 0.3) and low quality (`tk.lowQ()`) keep working everywhere; they may only remove calls, never add.
10. Iterate by eye: render every changed sheet with `node tools/hocus_vocus/shot.mjs --sheet <name> --out <scratchpad>/x.png`, look at
    the PNG with the Read tool, and fix what looks wrong, at least three rounds per drawing. PNGs go to the scratchpad, never the repo.
11. Before every push: `npm run check` green (the bar is your own work; follow CLAUDE.md for red suites in other games).

Style rules (the chibi house style, from the kit header and the owners' cards):

- Even outline of almost constant width with a slight taper (kit `RJ.LINE {main 2.0, mid 1.6, fine 1.15}` at the figure scale; enemies
  scale it by size class: s 2.0, m 2.4, l 2.8, xl 3.2), one warm hard cel shadow (`RJ.shade`), one thin highlight, big flat-cel eyes with
  a big catchlight and a small one, small blush hatch marks, round bouncy shapes, stubby limbs, big heads.
- No halftone screen-tone, no washi grain, no tapered calligraphic ink, no gold leaf on characters and creatures (they were the
  Echowake look). Backgrounds may keep soft gradients, glows and bokeh. Sparkles (4-point stars) and small music notes are the magic.
- Light comes from the upper right of the screen (the kit keeps it there for flipped figures too).
- Colour: saturated candy colours on the deep indigo night; the Gloss is the opposite: opalescent pastel, airbrushed, symmetrical, never
  dark, never scary (bible 3.6 tokens `#f4f1fb #e6d9ff #d9fff4 #ffe3f1`).

Shared visual vocabulary (use everywhere so the game reads as one world):

| Motif | Shape | Colours | Used by |
|---|---|---|---|
| Sparkle | 4-point star, a smaller one beside it | cream `#fff8ec`, gold `#ffd84d`, or the hero colour | magic, rare things, Spells, the logo wand |
| Sound rings | 2 or 3 concentric arcs, alpha falling outward (`tk.soundRings` kept) | hero colour or cream | live hexes, the reveal, RoxorLoops's beats, speakers |
| Note glyphs | eighth, beamed pair, quarter (`tk.note` kept) | cream, gold, or the 7-step hue ramp | the reveal, title drift, card grounds, Jasmin's runs |
| Cherry petals | five-petal blossom and loose petals (`tk.petal`) | `#ff7eb6`, `#ffc2dc`, cream centre | Jasmin, the logo O, Act I, the Bloom resource |
| The Gloss | an opalescent film with a diagonal highlight sweep like a phone screen catching light, airbrushed soft edges, the one shared Gloss smile (a small closed-mouth curve) | `#f4f1fb`, `#e6d9ff`, `#d9fff4`, `#ffe3f1`, chrome `#c9cbd6` | muted hexes, the title mic wrap, Act I Gloss patches, Act III everything, the defeat scene |
| Stage | a round stage with a cream lip, spotlights (soft cones with dust motes), curtains with gathered folds, fairy lights, bunting | curtain `#c8264f` and `#8f1838`, light `#fff4d6` | title, victory, defeat, shop, Green Room, boss scenes |
| Sticker | a die-cut cream rim (2 to 3 px) and a soft drop shadow round any drawn object | cream `#fff8ec`, shadow `rgba(20,10,40,.35)` | map tile stamps, card hero art, Stickers tab, Charm plates |
| RJ monogram | one chunky rounded stroke: the stem of an R, its bowl, and the bowl's tail running down into the hook of a J; two short bars inside the bowl | cream on a disc split diagonally pink `#ff7eb6` and green `#3fcf6a` | favicon, card back, share card, boot splash, the Merch Stall flag |

## 2. The cast: the chibi figures replace `ART.hero`

### 2.1 Files and load order

| File | From | Contents | Load slot |
|---|---|---|---|
| `js/art_cast_kit.js` | `tools/hocus_vocus/rj_art/kit.js` | the chibi kit on `ART.rj` (palette, cel and ink helpers, faces, hands, arms, legs, mic, fx, pose system, rig, bust, bake) plus the new pose machinery of 2.2 and the shared foe kit of 4.2 | right after `js/art.js` |
| `js/art_cast.js` | `roxor.js`, `jasmin.js`, `crew.js` | the eight figures (`roxor roxor_monster jasmin jasmin_unicorn rawclaw rawclaw_goat andy jordan`), their new pose tables (2.5), the `ART.hero` adapter (2.3), `ART.cast` (2.10), and the gallery sheets | the slot `js/art_heroes.js` held (before `art_enemies_1.js`) |
| `js/art_heroes.js` | | deleted from the fork (Echowake's own copy under `rogue_book/` is untouched) | |

The same change lands in `index.html`, `gallery.html` (its scripts are the prefix of index.html's up to the last art file), `DESIGN.md`
section 3 (the script list) and every test that boots a partial script list naming `art_heroes`: `tests/hocus_vocus_art_cards`,
`art_core`, `art_enemies_1`, `art_fx`, `art_map`, `data`, `lib` and `lib.test` (replace `'art_heroes'` with `'art_cast_kit', 'art_cast'`).

### 2.2 Porting the kit (what changes in `kit.js` on the way in)

1. `const RJ = (ART.rj = ART.rj || { chars: {}, ids: [] });` and every figure file starts `const RJ = ART.rj;`. No `window` writes, one
   IIFE per file, no `var` or function leaking out (hygiene `names`).
2. `RJ.bake` is rebuilt on `ART.sprite` (key `'rj|' + id + '|' + pose + '|' + (expr or '') + '|' + flip + '|' + t.toFixed(2) + '|' + q`,
   same bake box `{x0 -170, x1 150, y0 -345, y1 24}`), so the global sprite LRU owns the memory and no file touches `document`.
3. `RJ.POSES` becomes `['idle', 'sing', 'attack', 'hurt', 'cheer', 'windup', 'strike', 'block', 'down', 'walk']`. A figure without a
   table for a pose falls back: `windup` to `sing`, `strike` to `attack`, `block` to `idle`, `down` to `hurt`, `walk` to `idle`.
4. `RJ.LIFE` gains `windup {bob 0.6, per 1.2, head 0.01}`, `strike {bob 0.8, per 1.2, beat 1, beatHz 2.6}`, `block {bob 0.5, per 2.4}`,
   `down {bob 0.4, per 4.0, head 0.008}` and `walk {bob 2.4, per 0.5, step: {hz 2, stride 9, lift 5}}`; `RJ.resolve` applies `step` by
   moving `fFoot` and `bFoot` in opposite phase (x plus or minus stride, y lifted on the forward half) and bobbing the body twice a cycle.
5. `RJ.blend(Pa, Pb, k)`: numbers and number arrays lerp; strings, booleans and `fx` lists switch at k = 0.5. When the two poses use
   different `mic` modes (`mouth` and `hand`), `RJ.layout` computes the hand and the mic head for both and lerps the two points, so a mic
   travelling from the chest to the mouth slides and never pops. `RJ.draw(ctx, id, o)` accepts `o.mix = {pose, k}`.
6. `RJ.draw` accepts `o.noShadow` (skip the ground shadow) and `o.noFx`.
7. New `RJ.fxDraw` names: `mute` (a small grey speech bubble with three dots over the head: the voiceless look), `rings` (two sound
   rings in the accent colour in front of the chest: block), `petals` (three cherry petals off the mic: Jasmin's strike),
   `wave` (an orange low-frequency wave along the ground from the feet: Andy's strike), `pad` (the violet pad flashing: RawClaw's strike).
8. `RJ.ACCENT` holds an entry for every cast id (`roxor jasmin rawclaw andy jordan`, skins share their base id's accent).
9. Header comment rewritten as the manual it already is, minus the scratchpad paths; no em or en dash.

### 2.3 The `ART.hero` adapter, member by member

| Member | Behaviour |
|---|---|
| `draw(ctx, heroId, {x, y, s, pose, t, pt, flip, alpha, glow, shadow, skin?, gloss?, cache?})` | Resolves the cast id (2.4) from `o.skin` or the viewer's outfit (2.11), the engine pose to a kit pose or blend through the timelines of 2.5 using `pt`, and draws with `RJ.draw` at `s * CAST_K` (`CAST_K = 0.9`, so the head centre lands at about y -184 to -194 like the old heroes). `flip` mirrors (the kit keeps the key light on the upper right). `alpha` multiplies `globalAlpha`. `glow` (0..1 or a hex) draws an additive hero-coloured aura behind the chest (`tk.glow`, radius 72 * s). `shadow: false` sets `noShadow`. New optional `gloss` (0..1): the Filter form's pastel wash (section 4.4): the figure is drawn from a cached frame with a pastel source-atop pass of strength `0.2 * gloss`. New optional `cache: true`: draw a cached frame (2.8). An unknown id draws `ART.placeholder` with the id as its label. Every call is wrapped (warn once, never throw) and balanced. |
| `portrait(ctx, heroId, {x, y, w, h, expr, t, skin?})` | Draws the backdrop of 2.7, then `RJ.chars[castId].bust(ctx, w, h, {t, expr})` translated to (x, y), clipped to the rectangle. 3:4 is the design ratio; other ratios cover and crop keeping the face (the kit's bust already guarantees the face rectangle). |
| `medallion(ctx, heroId, x, y, r, skin?)` | A cached round face (2.7). The optional sixth argument is new and backwards compatible. |
| `bounds(heroId)` | `{w, h, head, hand, feet, weapon, top}` in engine px at s = 1 (table 2.4): `w = (x1 - x0) * CAST_K`, `h = 250` (the nominal height the contract and the combat layout use), `top` (new) the highest point of the hair in the idle pose. Returns a copy; unknown ids get the old default box. |
| `poseMs(pose)` | Unchanged: `attack 420, cast 500, hurt 260, block 300, down 500, cheer 800, idle 0, walk 0`. |
| `pointAt(heroId, name, o)` | `head` = kit `head`; `hand` = kit `hand`; `tip` = the striking point of 2.4 (mic head, pad, bass headstock); `bladeMid` = midway between `hand` and `tip`; `chest` = kit `chest`; `feet` = kit `feet`; `weapon` = `tip` at rest. All live for the resolved pose and blend, scaled by `s * CAST_K`, mirrored by `flip`. |
| `keyPt(pose)` | Unchanged formula and `KEYT {attack 0.36, cast 0.75, hurt 0.28, block 1, down 1, cheer 0.45}`, so card art and stills freeze on the strike. |
| `warm(heroId, s)` | Bakes the cached frames the first fight needs (the eight poses at their key moment, the medallion at 19, 24 and 44, the walk cycle at the token scale) and returns how many it baked (at least 12). |
| `audit(heroId)` | Bakes every pose of the hero and both outfits at its key moment into the bake box and reports `[{part: castId + ' ' + pose, edges, size, alpha}]` for any frame whose paint touches the box edge. Reads pixels: dev and tests only. |
| `expressions()` | `['neutral', 'smile', 'angry', 'hurt', 'determined']` (unchanged). |
| `ids()` | `['hanae', 'kuro', 'suzu', 'raiga']`. |
| `outfits(map?)` (new) | Sets or reads the viewer's outfit map `{hanae, kuro, suzu, raiga: 'skin' or 'stage'}` (the UI calls it, 2.11). Unknown keys and values are ignored. |
| `skins(heroId)` (new) | `[{id: 'stage', cast}, {id: 'skin', cast}]`, or only the stage entry for Andy. |
| `castId(heroId, skin)` (new) | The cast id that would be drawn. |

### 2.4 Who is who: cast ids, scale, anchors

| Hero id | Name | Stage cast id | Outfit cast id (name) | Unlocked by Sticker | Kit bounds (x0, x1, h) | Engine `w` | Head centre (engine px) | `tip` (what strikes) | Colours (bible 4.8) |
|---|---|---|---|---|---|---|---|---|---|
| `hanae` | Jasmin | `jasmin` | `jasmin_unicorn` (Unicorn Onesie) | `petal_and_steel` (In Full Bloom) | -158, 80, 322 (unicorn -164, 92, 336) | 214 | about (2, -184) | the mic head (pink band) | `#ff7eb6 #fff4f8 #b0245c` |
| `kuro` | RoxorLoops | `roxor` | `roxor_monster` (Monster Onesie) | `ink_and_insight` (Party at the Back) | -122, 90, 332 (monster -150, 90, 318) | 191 | about (2, -194) | the mic head (green band) | `#3fcf6a #c6ff3d #0f3a1e` |
| `suzu` | RawClaw | `rawclaw` | `rawclaw_goat` (Goat Suit) | `moonlit_vigil` (Not a Costume) | -131, 137, 336 (goat -150, 143, 337) | 241 | about (2, -187) | the centre of the pad sampler's lit pad | `#a77bff #e9ddff #3b2470` |
| `raiga` | Andy | `andy` | none (bible 7.1) | none | -130, 130, 316 | 234 | about (2, -184) | the bass headstock (fretting hand plus 70 kit px along the neck) | `#ff9a2e #ffe45e #5a2a0a` |
| (none) | Jordan | `jordan` | none | none | -126, 129, 293 | (not a hero) | | the tablet | teal `#2ec4b6 #e6fffb #0d4f4a` |

The `hand`, `weapon` and `top` anchors are computed once at load from the kit's idle pose at t = 0 (`RJ.point`), scaled by `CAST_K` and
rounded; nobody types them. The bounds width uses the stage outfit (skins keep the same box and hit areas, bible 7.1).

### 2.5 Poses: the eight engine poses on the kit

Timelines (engine time in seconds from the pose start; "A to B at u" means the blend reaches B at time u with `tk.ease.inOutSine`; one-shot
poses hold their last state for any larger `pt`; loops ignore `pt`):

| Engine pose | Length | Timeline | Key moment (`keyPt`) | Effects |
|---|---|---|---|---|
| `idle` | loop | kit `idle` with its idle life | 0 | per figure (notes, prop glow) |
| `walk` | loop | kit `walk` (2 steps a second) | 0 | none |
| `attack` | 420 ms | `idle` to `windup` at 0.07, to `strike` at 0.15, hold `strike` to 0.26, back to `idle` at 0.42 | 0.151 (the strike) | the strike's fx (2.6) |
| `cast` | 500 ms | `idle` to `sing` at 0.12, hold to 0.38, to `idle` at 0.5 | 0.375 | `notes` in the hero colour |
| `hurt` | 260 ms | `idle` to `hurt` at 0.04, hold to 0.12, to `idle` at 0.26 | 0.073 | the kit's sweat drop and dizzy sparkles |
| `block` | 300 ms | `idle` to `block` at 0.12, hold | 0.3 | `rings` in the hero colour |
| `down` | 500 ms | `idle` to `hurt` at 0.08, to `down` at 0.5, hold | 0.5 | `mute` (the grey "..." bubble) |
| `cheer` | 800 ms | `idle` to `cheer` at 0.1, hold (its jump life runs on `t`) | 0.36 | hearts (Jasmin), stars (others) |

New pose tables each figure needs (numbers are tuned by eye in the hero_anim sheet; the description is binding):

| Figure | `windup` | `strike` | `block` | `down` | `walk` |
|---|---|---|---|---|---|
| `jasmin` (and `jasmin_unicorn`) | eyes closed, a small inhale (torso rises 2 px), mic drawn to the chest, back hand lifts open like a conductor's breath, lean back 0.04 | the kit `attack` (mic thrust towards the enemy, sparkles) plus `petals`; mouth `sing` | back hand raised palm forward (a soft shield), mic held to the mouth, eyes `determined`, mouth `sing` (a held "ooh"), `rings` pink | sitting on the stage floor with both knees to one side, mic in her lap, head bowed, eyes closed, ponytail resting on the floor, `mute` | idle plus the step cycle, ponytail swinging; scrunchie never moves |
| `roxor` (and `roxor_monster`) | a crouch (squash 0.97, torso down 6 px), both hands cupped round the mic at the mouth, eyes `half`, mouth `beat` | the kit `attack` (green burst at the mic) with a 0.06 forward lean | arms crossed over the smiley, mic tucked under one arm, chin up, expression `smirk`, `rings` green | sitting cross-legged, mic dangling from one hand, shoulders slumped, eyes closed, `mute` | a bouncy strut (bob 3 px), free hand clicking fingers |
| `rawclaw` (and `rawclaw_goat`) | both hands lifted above the pad (front hand about [18, -6], back hand [10, -4]), lean back 0.05 | the kit `attack` (hands slam the pad) plus `pad` and violet `arcs` | the pad hugged to the chest like a shield, eyes calm (`open`, brow -0.1), `rings` violet | sitting, pad on his knees, headphones slipped down, eyes closed, `mute` | a slow, laid-back walk (bob 1.6 px) |
| `andy` | the bass neck raised (fretting hand up 24 px), lean back 0.06, eyes closed, mouth `flat` (the famous bass face) | the kit `attack` (a big strum) plus `bassnotes` and `wave` | the bass body turned forward like a shield, feet planted wide, eyes `determined` | sitting on the floor with the bass across his knees, head tipped back against nothing, eyes closed, `mute` | a heavy, relaxed walk with the bass bouncing |
| `jordan` | (not needed: Jordan is never in a fight) | | | | |

### 2.6 Expressions

| Engine expression | Kit expression | Notes |
|---|---|---|
| `neutral` | `neutral` | |
| `smile` | `happy` | |
| `angry` | `angry` (Jasmin's own `angry` is a determined frown, already in jasmin.js) | never scary: a pout or a determined frown |
| `hurt` | `hurt` | sweat drop |
| `determined` | `smirk` (RoxorLoops `smirkTeeth`, RawClaw and Andy their `smirk`) | |

Hero select already drives the portrait expression from hover and selection; nothing else changes.

### 2.7 Portraits and medallions

- Portrait backdrop (replaces the sumi enso): a stage spotlight in the hero colour: a radial gradient from the hero's light tint at the
  upper centre to the hero's dark at the corners, a soft cone of light from the top edge, 6 to 10 bokeh dots, two sparkles; Jasmin adds
  three drifting cherry petals, RoxorLoops two small sound rings that pulse every 1.6 s, RawClaw a faint violet waveform line across the
  lower third, Andy two slow orange waves along the bottom. The static part is cached per (hero, outfit, w, h); the moving touches follow `t`.
  Locked heroes in hero select keep today's treatment (dimmed figure behind the lock note).
- Medallion: a cached sprite per (hero, outfit, radius): a disc in the hero colour with a soft lighter centre, the kit bust cropped to
  the face (`bust(ctx, 2r, 2r, {pose: 'bust'})`, face rectangle filling 88 percent), an inner cream rim (`#fff8ec`, width r * 0.09) and
  the warm outline outside it (`#2d170f`, width r * 0.08). Readable at r 9 (the map strip) and r 44.

### 2.8 Performance and caching

- Live drawing (`RJ.draw` every frame) where the figure is big and moving: combat (two heroes), hero select stage and cards, the title
  duo, story pages, end screens. Budget: at most 1.2 ms of script per live figure on the reference machine (measured by a perf sheet,
  `cast_perf`, drawing each figure 200 times into the no-op context).
- Cached frames everywhere else: the map token (the walk cycle at 8 frames a cycle, idle at 4 frames a second over a 4 s loop),
  medallions, list portraits, card illustrations (already cached per card by art_cards), and, under quality `low`, everything
  (`t` quantised to 1/8 s modulo 4 s, `pt` to 1/30 s). Frames use `ART.sprite` keys starting `'cast|'`.
- `ART.hero.warm` is still called by SCENE before a fight; it now bakes the frames the first fight blits (key moments, medallions).

### 2.9 Card illustrations that draw the hero (`art.hero: true`, 31 cards)

`art_cards.js` `heroSprite` keeps its composition (the hero on the side away from the motif, faded into the ground at the bottom) with
three changes: it always passes `skin: 'stage'` (HV_HEROES 1.5); the glow-coloured silhouette rim becomes a die-cut sticker edge (the
silhouette in cream `#fff8ec` blitted at 8 offsets of radius 2.4 px, then a soft dark drop shadow offset (2, 3) at alpha 0.35 under it);
and the halo behind is the hero colour, not the palette glow. The pose follows today's rule (attack cards: `attack` at its key moment;
skills: `cast` or `block`). The 31 cards:

| Hero | Cards (id, new name, pose) |
|---|---|
| Jasmin (11) | `hanae_slash` Petal Note (attack), `hanae_parry` Soft Shield (block), `hanae_petal_flick` Little Trill (attack), `hanae_twin_petals` Sweet Thirds (attack), `hanae_blossom_burst` Blossom Pop (attack), `hanae_riposte` Sing It Back (attack), `hanae_hit_and_vanish` Curtsy and Go (attack), `hanae_iai_draw` Out of Nowhere (attack), `hanae_sway` Gentle Sway (cast), `hanae_thousand_petals` The High Note (attack), `hanae_hundred_cuts` Melisma (attack) |
| RoxorLoops (7) | `kuro_ink_bolt` Kick Drum, `kuro_first_stroke` Drop the Beat, `kuro_viper_nib` Click Clack, `kuro_ink_flood` Throat Bass, `kuro_inkblot_verdict` Scratch Combo, `kuro_rain_of_strokes` Snare Roll, `kuro_grand_flourish` Wait For It (all attack) |
| RawClaw (6) | `suzu_ofuda` Synth Zap, `suzu_hamaya_shot` Laser Synth, `suzu_banishing_seal` Sidechain Pump, `suzu_gohei_sweep` Phaser, `suzu_moonlit_verdict` Final Mixdown, `suzu_thousand_ofuda` Arpeggiator (all attack) |
| Andy (7) | `raiga_jab` Slap Bass, `raiga_static_fist` Thunder Thumb, `raiga_hard_knock` String Pop, `raiga_stilling_palm` Jaw Dropper, `raiga_cornered_tiger` Dig Deep, `raiga_drumroll` Loop Pedal, `raiga_heavens_answer` Octave Down (all attack) |

Acceptance (motifs sheet with `hero=1`): every one of the 31 shows the right figure in stage clothes, mid-strike, with a cream sticker
edge, readable at 120 px wide, and no two neighbours share a composition.

### 2.10 Jordan and `ART.cast`

`ART.cast = { draw(ctx, castId, o), bust(ctx, castId, w, h, o), medallion(ctx, castId, x, y, r), point(castId, name, o), bake(castId, o),
ids() }`, thin wrappers over the kit with the same sanitising as `ART.hero`. Uses:

- The Merch Stall (`screen_node.js` `drawPeddler`, kept as the function name): Jordan stands in the peddler slot of the `SHOP` geometry
  (same posts, planks and x, so the DOM laid over it does not move), at the peddler's scale, drawn with `ART.cast.draw(ctx, 'jordan', ...)`.
  Moods map to poses: `hello` = `sing` (waving, tablet up, expr `happy`), `buy` = `cheer`, `poor` = `hurt` with expr `shy` (an "oops",
  never sad), `sold` = `attack` (shows the tablet: a big sparkle on the screen), `leave` = `sing`, `empty` = `idle` with expr `sleepy`.
- The tip labels (`Jordan's tip` on the title, `A tip from Jordan` in pause) may show `ART.cast.medallion(ctx, 'jordan', ...)` at r 14
  beside the label (the menu screens owner decides; the art is ready).
- Detours that feature Jordan (`peddler_silver_bell`, Jordan's New Design) may show him on the Detour board plate as a bust.

### 2.11 Outfits (skins): storage, unlock, picker, drawing, saves

| Piece | Exact behaviour |
|---|---|
| Names | `DATA.outfits = Object.freeze({ hanae: { name: 'Unicorn Onesie', sticker: 'petal_and_steel' }, kuro: { name: 'Monster Onesie', sticker: 'ink_and_insight' }, suzu: { name: 'Goat Suit', sticker: 'moonlit_vigil' } })`, a plain presentation table set in `js/data_meta.js` (never read by RUN, COMBAT, MAP, META or the bot). Andy has no entry. |
| Storage | `localStorage['hv_skins_v1']` = JSON `{hanae: 'skin' or 'stage', kuro: ..., suzu: ...}`; read and written only by `js/ui.js` inside try/catch; missing, unreadable or garbled means stage clothes for everyone. Not in `hv_profile_v1`, not in `hv_run_v1`, never in the daily seed. |
| Unlock | `unlocked(heroId) = !!DATA.outfits[heroId] && META.achievements().some((a) => a.id === DATA.outfits[heroId].sticker && a.done)`, evaluated when a screen enters (title, hero select, end screens) and after `META.check`. Nothing new is stored. |
| Effective outfit | `'skin'` only when stored `'skin'` AND unlocked; otherwise `'stage'`. UI pushes the effective map with `ART.hero.outfits(map)` at boot, after any pick, and when a Sticker unlocks an outfit. |
| Picker | Hero select detail panel, after the passive lines and before the starting deck: a row `mn-d-line mn-d-outfit` with the label `Outfit` and two swatch buttons (`Stage clothes` and the outfit name), each a 56 px canvas showing `ART.hero.medallion(..., skin)`; the chosen swatch has a 3 px ring in the hero colour and `aria-pressed="true"`; a locked swatch is dimmed with a padlock badge and the line `Win 3 tours with <name> to unlock.` (name from `DATA.heroes`). Tapping a swatch stores the choice, plays `ui_toggle`, and the hero card and the stage preview redraw at once. Keyboard: both swatches are buttons in tab order. Andy shows no row. |
| Drawing | Everywhere `ART.hero` draws (combat in all eight poses, hero select cards and stage, the map token, medallions, story portraits, end screens, the share card, the title duo): the adapter reads the effective map. Card illustrations pass `skin: 'stage'`. A failed outfit draw falls back to stage clothes (wrapped). Same anchors, same bounds, same hit areas. |
| End screen | When a tour's results earn one of the three Stickers, the unlock list adds a card `New outfit: Unicorn Onesie` (or the other two) in the existing unlock-card style, its art `ART.hero.portrait(..., {skin: 'skin', expr: 'smile'})`. |
| Sound | Outfits never change a name, a bark or a sound (HV_HEROES 1.5). |

### 2.12 Tests that change (art_core hero section) and the new cast suite

`tests/hocus_vocus_art_core.test.mjs`, hero section: keep every contract test; change only what assumed sprite-part heroes:
- "issues sprite draws (n >= 12 drawImage)" becomes "issues real paths (fill plus stroke calls >= 40) or blits a cached frame".
- "flip mirrors with a negative x scale" accepts any `scale(-a,a)` (the kit scales by `s * CAST_K`).
- "warm bakes 20+ sprites" becomes "warm bakes 12 or more frames".
- "the audit finds no clipped part" stays and now covers every pose of both outfits.
New `tests/hocus_vocus_art_cast.test.mjs`: the kit loads into `ART.rj` with no global; all eight cast ids register; every cast id draws
every kit pose and every engine pose at several `t` and `pt` without a canvas issue; blends are continuous (a mic never jumps more than
6 px between two frames 1/60 s apart in any one-shot pose); outfits resolve (`castId` per hero and skin, Andy has none); the outfit map
ignores junk; `gloss` and `cache` draw; `ART.cast.draw('jordan')` in all six moods; determinism; perf smoke (the 1.2 ms budget on the
no-op context).

### 2.13 Acceptance by eye (sheets `heroes`, `hero_anim`, `portraits`, `hero_lineup`, new `cast_skins`, `cast_jordan`, `cast_perf`)

1. Each of the four heroes in all eight poses reads as the owners' character at combat scale: RoxorLoops's mohawk-into-mullet and smiley
   tee, Jasmin's high ponytail with the pink scrunchie, clip, hoop and heart necklace, RawClaw's headphones and pad, Andy's orange bass
   and loop pedal. Nobody holds a sword, a staff or a flute.
2. `attack` freezes mid-strike at `keyPt('attack')`; `down` reads as "lost their voice for a moment" (sitting, eyes closed, the grey
   "..." bubble), never hurt or fallen.
3. The three outfits read as onesies or a costume at a glance in every pose (horns, hood, mane, goat ears) and keep the face.
4. Portraits show five clearly different expressions; medallions read at r 9 and r 44.
5. In a real fight (`GAME.debug.open('combat', {heroes: ['hanae', 'kuro'], enemies: ['kappa']})`) both figures stand on the ground line,
   nothing is cropped, the HP and status panels do not cover a face.

## 3. Logo, title, scenes and the screens that paint their own art

### 3.1 The logo (`ART.scene.logo(ctx, x, y, w, t, opts?)`, `js/art_scenes.js` THE LOGO block)

- Layout: stacked by default, HOCUS over VOCUS, centred on (x, y), `w` wide, about `0.40 * w` tall; `opts.line: true` gives the one-line
  form (`HOCUS VOCUS`, about `0.14 * w` tall) for wide strips. The header comment's "about 0.15 * w tall" becomes these two figures.
- Letters: new chunky rounded skeletons (`LOGO_LETTERS` gains H, C, U, S, V; O is drawn as a picture, see below), each letter a fat
  rounded stroke filled flat (HOCUS `#ff7eb6` with a lighter top band `#ffc2dc`; VOCUS `#3fcf6a` with a lighter top band `#c6ff3d`), a
  cream inner rim `#fff8ec` (2 px at w 740), a thick warm outline `#2d170f` (5 px at w 740) and a soft drop shadow down and to the left.
  Letters lean alternately by plus or minus 3 degrees (bouncy, like the owners' logo).
- The O of HOCUS is a pink cherry blossom (five round petals `#ff5fa2` to `#ffc2dc`, a cream centre with five stamen dots); the O of
  VOCUS is a round green mic grille (a ball `#3fcf6a` with a lime highlight and a cross-hatch mesh in dark green, a short black handle
  peeking below the word line with a lime band).
- Behind both words, crossing diagonally from lower left to upper right, a mic-wand: a black mic body with a pink band, a gold
  five-point star where the grille would be, and a trail of sparkles.
- Animation (pure functions of t; the static letters are cached per width): each letter bobs 2 px on a 0.8 s cycle with a phase offset
  per letter (a wave runs through the word); the blossom O turns slowly (one turn per 9 s) and lets a petal drift off every 5.2 s;
  the mic-grille O sends a sound ring out every 7.3 s; the wand star twinkles every 6.1 s and its sparkle trail shimmers. Reduce motion:
  the bob stops, the rings and the petal stay (slowed).
- Placement: the title screen draws it at `ART.scene.logo(ctx, 640, 150, 540, t)` (y 42 to 258); `screen_menu.js` line 579 and the
  fallback `drawLogoFallback` (stacked text in the same colours with `tk.inkText`) change with it, and `css/menu.css` `.mn-tag` moves to
  `top: 262px`. The art_scenes logo test (at least 7 distinct frames over t 0.2 to 5.1, cached per width, deterministic, NaN and
  negative width absorbed) holds as written.
- The RJ monogram (`ART.scene.monogram(ctx, x, y, r, o)`, new): the vocabulary row of section 1, drawn as one rounded stroke with the
  warm outline and the cream fill on the pink and green split disc. Uses: favicon (an inline `data:` SVG of the same shape in both
  pages, hygiene requires both), card back, share card corner, the boot splash dot, the Merch Stall flag.

### 3.2 The title scene (`'title'`, layers inside `TITLE_FOCUS`)

Composition on the 1280 x 720 stage (the menu column starts at x 998, the logo spans y 42 to 258, the tagline y 262 to 290).
`TITLE_FOCUS` becomes `{x0 360, x1 920, y0 292, y1 570, k 0.1}`: x0, x1 and k stay, so the menu column check of
`tests/hocus_vocus_screen_menu.test.mjs` (it reads only x and k) holds; y moves down so nothing of the stage sits under the logo or the
tagline:

| Layer | Content |
|---|---|
| Sky | deep indigo night `#070516` to `#2b1f6e` to a violet horizon `#59399a`; stars; a huge cream moon high at left of centre (x 470, y 150, r 96, partly behind the logo), an ordinary night moon (the song nod lives only in its bible 2.9 placements) |
| Far horizon (parallax 0.05) | left: Blossom Bay's candy houses climbing a hill with lit windows and a harbour with fairy-lit boats; right: Scrollopolis's phone-tower skyline with tiny glowing screens and a web of cables; centre, floating far above the sea: the Perfect Stage as a faint opalescent ring of light |
| Mid (0.3) | a gentle hill of cherry trees (pink canopies) at left, the tour van parked at x 300 to 380 with Jordan's poster in its window (a tiny star and blossom on it), bunting strung from the van to a lamppost |
| Stage (0.1) | inside the focus box: a round stage with a cream lip (x 430 to 850, top y 530, lip down to y 566), red curtains gathered at both sides (x 370 to 430 and 850 to 910, from y 296), a string of fairy lights along the top (y 300 to 314), and at the centre (x 640) a vintage chrome mic on a stand (mic head at y 390). Before the first win (`rung` false) the mic and its stand are shrink-wrapped in the Gloss: an opalescent film with a diagonal highlight sweep, a tiny polite Gloss smile sparkle, and every 10.5 s the mic sends out a ring that breaks into soft pastel blobs at r 160 (muffled). After the first win (`rung` true): no wrap, the mic glows warm, the ring stays whole and clear to r 260, and small notes and hearts rise from it |
| The duo (live) | RoxorLoops at x 560 facing right and Jasmin at x 720 flipped to face left (as on the owners' duo card), feet on the stage (y 530), s 0.7 (the tallest hair, the mohawk, tops out near y 320, clear of the tagline), in the viewer's chosen outfits. `rung` false: both `idle`, looking at the wrapped mic. `rung` true: both loop the `cast` pose's sing frame, swaying on the beat. Always these two (the owners), whatever the last party was |
| Foreground | a cherry blossom branch from the top left corner, a second string of bunting across the top right (clear of the menu column's plaque area), drifting petals, green sparkle motes, rising cream notes |
| The Gloss at the corners | opalescent pastel sheen creeping in from the four corners (airbrushed blobs reusing `tornBlob` outlines, filled with the Gloss gradient, no outline, a soft feather), perfectly still; with `rung` they shrink to half |

Mood `'moonlit stage'`. The title layer cache key keeps `rung`. Story pages draw the title scene behind the page, so the prologue gets it
too. Acceptance: at 1280 x 720, 844 x 390 and 390 x 844, nothing of the stage, mic or duo lies under the menu column; the logo reads; the
wrapped and the live mic are obviously different.

### 3.3 Every scene id (`ART.scene.draw`, `DATA.LISTS.scenes`)

Combat scenes keep the contract: ground (feet) at y 520, heroes on the left third, five enemy lanes across the right two thirds, the band
below 520 darkened for the HUD, mid-tone hazy backdrops behind the lanes. Boss versions are the Act scene pushed to its most dramatic
moment with a hard vignette and a colour shift.

| Scene id | Where it shows | New picture | Palette | Animation |
|---|---|---|---|---|
| `title` | title, story backdrop | 3.2 | indigo night, cream moon, candy horizon | 3.2 |
| `ch1` | Act I fights, 7 Detours | Blossom Bay at golden hour: the harbour quay as the ground, candy houses (tomato `#e8553f`, mint `#8fe3c0`, lemon `#ffd84d`, sky `#7cc6ff`) stacked up the hill behind, bunting between balconies, cherry trees along the quay, a little pier stage with a mic stand far right, boats with fairy lights, two or three house fronts gone opalescent and flat (the Gloss starting) with lip-syncing busker silhouettes | warm light `#ffcf8a`, sea teal `#2bb3b1`, cherry `#ff9fc6` | petals drifting, bunting swaying, water shimmer strips, gulls gliding far off, fairy lights twinkling |
| `boss1` | Kraki | the end-of-pier stage grown to the size of the harbour at sunset: eight mic stands along the pier, a sky of orange and bubblegum pink, speakers stacked on crates, the bay's water churning with sound bubbles | sunset `#ff8a5b`, `#ff5fa2`, teal `#2bb3b1` | sound bubbles rising, stage lights sweeping, petals in a stronger wind |
| `ch2` | Act II fights, 7 Detours | Scrollopolis at 2 am: a street of buildings that are giant lit phone screens, comment graffiti in silly words only (`first!`, `mid`, `who asked`, sprayed in chunky rounded letters, rule 7), notification bubbles drifting up like balloons, heart and thumb icons falling like snow, the Feed's glowing cables strung across the sky, and a huge moon over the rooftops that nobody looks at | midnight `#141a3a`, screen blue `#3d7bff`, cyan `#3ff0ff`, heart pink `#ff6fb5`, moon cream `#fff2c4` | screens flicker to new content every few seconds (seeded), balloons rise, icons fall, the street's screens light faces from below |
| `boss2` | Scrollspinner | the rooftop of the tallest phone-tower under the moon (the Night Noodle Market's string lights below at the edge), the Feed's web of glowing cables filling the sky behind, a ring light halo at centre back | violet `#2a1660`, glitter gold `#ffd84d`, cyan | the web pulses along its strands, the moon glows brighter as the fight goes on (by t only), glitter falls |
| `ch3` | Act III fights, 5 Detours | the Perfect Stage: a colossal arena floating above a sea of phone lights, opal white and pastel chrome, a mirror floor that reflects the lanes, ring lights like halos, rows of identical mannequin fans holding phones up in the stands, three identical empty judges' chairs far back, confetti falling in a perfect grid | Gloss tokens, chrome `#c9cbd6`, one mirror gradient | the grid confetti falls in lockstep, ring lights breathe in unison, phone lights in the sea twinkle in a perfect pattern |
| `boss3` | Flawless (and the `final` music) | the centre of the Perfect Stage: the APPLAUSE sign blazing above (the art word `APPLAUSE`), a giant ring-light halo, the mirror floor, the mannequin crowd's phones raised; colours too clean | opal, lilac, mint, blush, one warm red bulb row | the sign's bulbs chase, the ring light pulses, confetti falls in a grid; no darkness |
| `camp` | Green Room, 3 Detours | a cosy backstage green room: a sofa with a patchwork throw, a mirror ringed by warm bulbs, a little table with a kettle, a teapot and a bowl of clementines, a potted plant, set lists taped to the wall, a fairy-light string, a door with a star | warm `#ffcf8a`, plant green `#3fcf6a`, wall teal `#1f5f63` | the kettle steams, bulbs breathe, a tiny vinyl record spins on a player |
| `shop` | 7 Detour plates (the shop screen paints its own stall) | Jordan's Merch Stall from the front with nobody behind it: a teal canopy, T-shirts on a line, tote bags, sticker sheets, a tablet on a stand showing a sparkle, a little RJ monogram flag | teal `#2ec4b6`, cream, pink and green accents | the canopy's fringe sways, the tablet sparkles |
| `event` | 9 Detour plates, the Detour board | a street corner at dusk: a bent arrow signpost with a question mark, a lamppost, a bench, string lights between two trees, a poster wall | dusk violet `#5b3fa8` to peach `#ffb38a` | string lights twinkle, a leaf or a petal drifts |
| `treasure` | 1 Detour plate | a gift box on a small round stage under a spotlight, a ribbon and a heart tag, sparkles | indigo, gold, pink ribbon | the spotlight's dust motes drift, the box gives a little hop every 4 s |
| `victory` | the victory screen, boss reward backdrop | dawn over the open stage: the curtains wide, the crowd's silhouettes singing with arms up (generic shapes, no faces), the sky going from violet to peach, the Gloss softened into ordinary stage shine (warm sparkles, not pastel film), the moon setting, cherry petals and confetti that falls NOT in a grid | peach `#ffb38a`, gold `#ffd84d`, pink, green | confetti, petals, light sweeps, a gentle crowd sway |
| `defeat` | game over, 3 Detour plates | an empty stage with the curtain half closed, one mic stand in a single soft spotlight, pastel Gloss sheen settling over the floor like dust, and under the curtain's hem a thin warm line of light (the curtain twitches every 6 s: the show goes on) | indigo, pastel Gloss, one warm line `#ffcf8a` | the curtain twitch, the sheen drifting, dust in the spotlight; never broken, never dark red |
| `paper` | 5 Detour plates, panels | a gig poster texture: cream card stock with a faint two-colour print grain (pink and green halftone specks, kept as a texture), soft printed edges, a strip of tape at two corners on request (`opts.edge`); still, seeded by `opts.seed`, cached | cream `#fff4e6`, pink and green specks | none (it is a texture) |

### 3.4 The screens that paint their own art (presentation files)

| File, function | Echowake look | Hocus Vocus look | Notes |
|---|---|---|---|
| `screen_node.js` `paintShop`, `drawPeddler` | lantern-lit peddler stall, the peddler | Jordan's Merch Stall: teal canopy with a scalloped fringe, two planks of merch (T-shirts, totes, sticker sheets, a mug), a string of fairy lights, Jordan (2.10) in the peddler slot; the `SHOP` geometry table (posts, planks, peddler) is unchanged | DOM placement reads the same custom properties |
| `screen_node.js` `paintCamp`, `paintFire` | a bonfire under a sakura | the Green Room (the `camp` scene look) with the kettle on a hot plate as the "fire": `paintFire` draws the kettle's glow and steam (same function, same anchor); the fire meter (actions left) becomes three teacups that empty | the heroes stand where they stood |
| `screen_node.js` `paintForge`, `drawHammer` | anvil, three hammer blows, sparks | The Studio: a mixing desk, a mic in a pop filter, an `ON AIR` light that switches on; `drawHammer` draws a drumstick and the three blows are three hits on a big drum pad, each sending sound rings and cream sparkles instead of sparks | button copy `Hit it!` is the UI plan's |
| `screen_node.js` `paintChest`, `drawChest` | a chest whose lid lifts | the Gift Box: a box in the act colour with a big ribbon bow and a heart tag; opening unties the bow (the ribbon ends fly), the lid pops up with confetti and a "ta-da" sparkle | same timings |
| `screen_node.js` `paintCache` | three plinths in a cave | the Sparkle Booth: a little photo-booth canopy with a lightbulb frame, three cushions on pedestals with a glow under each gem; the `CACHE` geometry table is unchanged | |
| `screen_node.js` `paintRewardBack`, `paintTable` | a table under lantern light | the goodie bag: a backstage table with a pool of warm light, a striped goodie bag, a few stickers and a setlist; the `RW` axis (x 796) is unchanged | |
| `screen_node.js` `paintDesk` | a storybook page desk | the Detour board: the scene plate as a big instant photo clipped to a string of fairy lights, the text panel as a gig poster, choices as ticket stubs (bible 4.1); every `.ev-*` class and the 1136 x 592 geometry stay | |
| `screen_menu.js` `drawBackdrop` (variants) | moonlit ink washes | the deep indigo night with soft pink and green spotlights from the top corners, bokeh, a few drifting petals and sparkles, a faint stage floor at the bottom; each variant shifts the spotlight colours | menus, hero select, Tour Bus |
| `screen_menu.js` `drawTitleFallback`, `drawLogoFallback` | bell and ECHOWAKE text | a flat version of 3.2 (moon, stage, mic) and the stacked logo text in pink and green | used only when the art is missing |
| `screen_menu.js` `paintBeast` | bestiary card | the Who's Who photo wall: the enemy drawn as an instant photo (cream frame, slight tilt, a strip of tape); unknown entries show the Gloss blur with a polite smile sparkle | |
| `screen_menu.js` `paintBook`, `paintMapDiagram`, `paintRows`, `paintCards`, `drawMiniCard` | How to Play diagrams on paper | the same diagrams on cream gig-poster panels: a mini hex map with muted and live hexes, the lead and backing spots as two mic stands, mini cards in the new frame colours | |
| `screen_end.js` `paintStory` | lacquer plaque story page | a cream poster panel with a pink and green top stripe over the title scene; seals become round stickers (`ONCE`, roman numerals, `BRAVO`, `PAUSE`, the hero initial) | paddings and `--pg-x` kept |
| `screen_end.js` `paintClear`, `drawGhost` | chapter clear | Act clear: the act's scene, the two heroes cheering, the act number on a big round sticker, confetti | |
| `screen_end.js` `paintOver` | defeat | the `defeat` scene with the two heroes in `down` at the stage edge, then standing again as the curtain twitches | |
| `screen_end.js` `paintVictory` | victory | the `victory` scene with the two heroes in `cheer`, the crowd singing | |
| `screen_end.js` `drawCard` (share card) | ECHOWAKE card | a 3:4 card like the owners' duo card: background split diagonally light green and pink, the stacked logo, the two heroes of the tour in `cheer` (their outfits), the score digits, the RJ monogram in a corner, and `@roxorloopsandjasmin` in small cream letters along the bottom (the only handle text drawn) | `spaced(ctx, 'ECHOWAKE', ...)` becomes the logo |
| `ui.js` transitions `'ink'`, `'page'` | ink blot wipe, page turn | `'ink'` = sparkle swirl (pink and green sparkles spiral in to the centre and burst, "ta-da"), `'page'` = stage curtain (two curtains close and open); kind ids stay | bible 4.1 |
| `ui.js` rotate panel | phone with sound arcs | a phone turning sideways with a small mic and two sparkles | copy is the UI plan's |
| `ui.js` card back (`.back-drop`, `.back-ring`, `.back-word`) | indigo with an echo ping and ECHOWAKE | the deep indigo back with a diagonal pink and green split band, the RJ monogram in a cream ring at the centre, and the stacked `HOCUS VOCUS` word in the logo colours | CSS and the inline SVG only |
| `index.html` `#boot`, favicon | ECHOWAKE splash, echo ping | `HOCUS VOCUS` in the display font in pink and green with a cream outline; the pulse dot becomes the RJ monogram disc pulsing; favicon = the monogram disc | both pages' favicons match (hygiene) |
| `scene.js` particles (death notes, pops) | ink death notes | win-over confetti per Act (I petals and bunting triangles, II hearts and dimming pixels, III square confetti that falls out of the grid) and cream notes | colours from 8.2 |

## 4. The 51 enemies

### 4.1 Decision: redraw every one, keep every rig

Each of the 51 ids is redrawn in code in the chibi style, following `HV_ENEMIES.md` 2.1, 3.1, 4.1 (what it is, silhouette, materials,
palette), 2.4, 3.4, 4.4 (Act art direction), 2.5, 3.5, 4.5 (which Echowake rig each one starts from), 5 (the Headliners' forms) and 6
(art rules shared by all 51). Kept from Echowake per id: the registration and contract (`ART.enemy.register(id, {draw, bounds})`, facing
LEFT, feet at the origin, the size class, the seven poses with today's timings and holds, the telegraph tremble, the cached part sprites
and chains, the boss phase structure). Replaced: every part painter (outline, fills, faces, props), the effects drawn by the parts, and
the `die` pose's content (now the win-over, ending with nothing of the body drawn, so the tests hold).

Style transform (every file): even outlines from the foe kit instead of `inkPath` tapers; no halftone, no `paperGrain`, no gold leaf on
bodies; one warm hard shadow and one highlight; faces from the foe kit (big flat-cel eyes, the shared Gloss smile, cute even when grumpy);
the Act's line colour (E-D5).

### 4.2 The shared foe kit (`ART.rj.foe`, in `js/art_cast_kit.js`, built first)

| Helper | Signature | Draws |
|---|---|---|
| `foe.ink(act)` | `-> {color, main, mid, fine}` | the Act's line colour and widths per size class |
| `foe.cel(g, pts, base, o)` | like `RJ.cel` | flat fill, one warm hard shadow, one highlight, the Act line |
| `foe.limb(g, a, b, w, color, o)` | | a stubby capsule limb with one outline and a round end |
| `foe.eyes(g, x, y, w, o)` | `o.kind` `round sleepy glare dot heart screen needle lens`, `o.open` (blink), `o.look` | big chibi eyes with a big and a small catchlight; `screen` eyes glow from inside (Act II), `lens` eyes are chrome rings (Act III) |
| `foe.mouth(g, x, y, w, kind, o)` | kinds of `RJ.mouth` plus `glossSmile`, `squeal`, `O`, `grumble` | |
| `foe.glossSmile(g, x, y, w)` | | THE Gloss smile: one small closed-mouth curve with two tiny upturned ends, identical everywhere (`HV_ENEMIES.md` 8) |
| `foe.glossSheen(g, box, strength, o)` | strength 0..1 | the Gloss: pastel highlight sweep, airbrushed edge, a faint polite sparkle (`HV_ENEMIES.md` 6.3; one drawing for all three files) |
| `foe.winOver(g, S, p, o)` | p 0..1, `o.confetti` `petals hearts grid broken` | the `die` pose: Gloss flakes off as sparkles (0 to 0.35), one happy hop with real colours (0.35 to 0.6), a pop into the Act's confetti (0.6 to 1), nothing of the body after 0.62 |
| `foe.hurtFlash(g, S, k)` | | the fresh-hit white silhouettes the Act II and III tests look for |
| `foe.sparkles`, `foe.notes`, `foe.rings` | | wrappers over the kit fx in the Act colours |

### 4.3 Per-Act helper sets (defined at the top of each file, used by every creature of the Act)

| Act and file | Helper set | Functions | Line, palette |
|---|---|---|---|
| I, `js/art_enemies_1.js` | `SEA` (seaside things that caught a little Gloss) | `brassBell(g, cx, cy, r, o)` (foghorn bell, jukebox horns), `bunting(g, pts, colours, t)` (a sagging string of triangle flags), `crate(g, x, y, w, h, o)` (fruit crates), `produce(g, shape, base, o)` (glossy fruit and vegetable skin with one shine and freckles: chilli, peas, melon), `stripes(g, shape, cols, o)` (melon, awning, bandstand roof), `rope(g, pts, o)` (rope-coil arms), `glossPatch(g, shape, o)` (the ONE airbrushed pastel panel each creature carries; it flakes off in `winOver`), `fairyBulbs(g, pts, t)` | navy `#22264a`; tomato, mint, lemon, sky, cherry, sea teal, warm light (`HV_ENEMIES.md` 2.4) |
| II, `js/art_enemies_2.js` | `FEED` (the feed as a zoo) | `screen(g, x, y, w, h, o)` (a rounded glass screen playing a tiny loop: `heart thumb play spinner dot number`, lighting the face above it in blue), `icon(g, kind, x, y, s)` (generic hearts, thumbs, play triangles, red dots, bells, spinners; never a platform's look), `cable(g, pts, o)` (a glowing charging cable with plug ends), `lookDown(S)` and `lookUp(S)` (every creature looks down; won over, it looks up at the moon), `glitter(g, shape, t)`, `balloons(g, x, y, t)` (notification bubbles drifting up) | navy `#22264a`; midnight, screen blue, cyan, notification red, heart pink, neon green, moon cream (3.4) |
| III, `js/art_enemies_3.js` | `POLISH` (the Polished) | `chrome(g, shape, o)` (two-band chrome with one mirror streak), `mirror(g, shape, o)` (reflective panel; Flawless's phase 2 shows the two simplified hero silhouettes in pastel with no motion lines), `sequins(g, shape, o)` (aligned sequin discs that flick off as `o.k` rises), `ringLight(g, x, y, r, o)`, `crack(g, shape, k, seed)` (the hurt gag: a hairline of saturated warm colour through the polish), `confettiGrid(g, box, p, broken)`, `reflection(g, drawFn, floorY, alpha)` (the cheap mirror-floor copy) | slate `#5a5f7a`; Gloss tokens, chrome, one accent per creature (4.4) |

### 4.4 Work split (files, agents, order) and every id

Order: the foe kit (4.2) lands with the cast (phase A1) or as its own small task before any enemy agent starts. Then the three Acts run in
parallel, each in three tasks: the creatures task writes the Act helper set first and the 10 Creatures; the rivals task the 3 Rivals and
the 3 Sidekicks; the headliner task the Headliner's forms. Nine enemy tasks in all, at most three at once (one per file at a time).

| Task | File | Ids (all keep their rig from the `HV_ENEMIES.md` rig map) |
|---|---|---|
| E1a Act I creatures | `js/art_enemies_1.js` | `kappa` Fussy Foghorn, `tanuki_bandit` Coin Crab, `kodama` Tuning Forkling, `karakasa` Squeezebox, `hitodama` Hot Chilli, `oni_cub` Jitterbug, `crow_tengu` Pitch-Perfect Gull, `bamboo_sprite` Pea Pod, `mushroom_folk` Jingle Machine, `bamboo_boar` Runaway Melon |
| E1b Act I rivals and sidekicks | `js/art_enemies_1.js` | `oni_brute` One-Hit Jukebox, `tengu_duelist` Dance-Off Heron, `moss_guardian` Old Bandstand, `ember_wisp` Chilli Flake, `leaf_imp` Kazoo Imp, `paper_kodama` Mic Squeal |
| E1c Act I headliner | `js/art_enemies_1.js` | `boss_kuzunoha` Kraki: phase 0 Masked (seated low in the water, eight arms in a loose fan, the glossy smiling mask), phase 1 Unmasked (mask halves drifting apart with warm light between, eight arms in a peacock wheel of gold mics, three turning sound rings) |
| E2a Act II creatures | `js/art_enemies_2.js` | `chochin` Flamebait, `karakuri_puppet` Clickbait Goblin, `nopperabo` Filter Fairy, `drowned_samurai` Unskippable Ad (art word `SKIP`), `koi_spirit` Hug Emoji, `tsukumogami` Notification Imp (the number), `silk_weaver` Algo Rhythm, `nure_onna` Autoplay Snake, `rokurokubi` Selfie Stick, `ittan_momen` Phone Charger |
| E2b Act II rivals and sidekicks | `js/art_enemies_2.js` | `drowned_general` Comment Troll, `puppet_master` Trendsetter, `umibozu` Doomscroll Moth, `spiderling` Botling, `paper_puppet` Copycat Cutout, `lantern_wisp` Grumble Cloud |
| E2c Act II headliner | `js/art_enemies_2.js` | `boss_jorogumo` Scrollspinner: phase 0 the Avatar (glittering bell gown, filtered face in a ring-light halo, selfie phone, four spider feet under the hem, Feed cables behind), phase 1 the Spinner (gown split on a spider body, eight phone-screen eyes, eight legs, the web of glowing cables); no kimono, no silk |
| E3a Act III creatures | `js/art_enemies_3.js` | `storm_drone` Tuner Drone, `komainu_guardian` VIP Bouncer, `redaction_knight` Clapperboard Knight, `void_scribe` Chrome Siren, `blank_soldier` Synchro Dancer, `sky_serpent` Streamer Dragon, `eraser_wraith` Airbrush Wraith, `thunder_crow` Ring Light Sentinel, `paper_golem` Sequin Golem, `margin_imp` Glitch Gremlin |
| E3b Act III rivals and sidekicks | `js/art_enemies_3.js` | `censor_golem` Big Mute Button, `storm_whelp` Applause Sign (art word `APPLAUSE`), `black_bar_inquisitor` Mannequin Judge (generic, never a real judge), `blank_page` Lip-Sync Clone, `spark_mote` Confetti Popper, `typo_sprite` Pitch Glitch |
| E3c Act III headliner | `js/art_enemies_3.js` | `boss_editor` Flawless: phase 0 Flawless (slender pastel-chrome idol, mirror mic, the Gloss smile), phase 1 the Filter (head folded into a ring-light lens, selfie-stick arms, the art word `FLAWLESS!` across the chest band), phase 2 the Gloss (a sky-filling smooth oval mirror face showing the two simplified pastel hero silhouettes); win-over: the mirror crazes into soft sparkles and a tiny shy lens with a nervous smile sings one crooked note |

Hand-offs outside the enemy files: when `boss_editor` is in phase 1, `scene.js` passes `gloss: 1` to `ART.hero.draw` for both heroes
(the 20 percent pastel wash of `HV_ENEMIES.md` 5.3), and `0` otherwise. Gallery sheet titles change to `Act I, Blossom Bay`, `Act II,
Scrollopolis`, `Act III, the Perfect Stage`, `Kraki, both forms`, `Scrollspinner, both forms`, `Flawless, all three forms`.

### 4.5 Material rules for enemies (on top of section 1)

Brass, chrome, walnut, plastic, glass, painted wood, cardboard, striped canvas, bunting cloth, glossy produce skins, sequins, light bulbs,
pastel streamers, mirror, mannequin gloss: yes. Leather, fur, feathers as a material, wool, felt, silk, pearl, shell, bone, horn as a
material: never. Kraki is a kraken (a body, not seafood); the gull and the heron have bodies, not plumage "material". No enemy draws text
except the four art words of rule 7.

### 4.6 Acceptance and tests

Every existing enemy suite stays green unchanged (rosters, bounds per size class, every pose and phase draws, deterministic, idle
animates, poses differ, one-shots ease and hold, telegraph trembles, the `die` pose ends with almost nothing, bosses change per phase,
elites and bosses carry the shell's ornament, sheets register, perf smoke, the encounter fits the sprite cache, steady state bakes
nothing). By eye (sheets `enemies1 enemies2 enemies3 boss1 boss2 boss3`): every creature matches its `HV_ENEMIES.md` description at
120 px; the three Acts read as three worlds (seaside candy, neon night, pastel chrome); every face is cute; every Act I creature has
exactly one Gloss patch; every Act II creature has a screen and looks down; every Act III creature is symmetric until hurt; the win-over
ends in the Act's confetti.

## 5. Card art: grounds and the 59 motifs (`js/art_cards.js`)

### 5.1 The card illustration composition

The five-step composition of the art_cards header stays (ground, secondary stamp, the hero, the motif, foreground) and everything stays
seeded from the card id. What each step now paints:

| Step | Echowake | Hocus Vocus |
|---|---|---|
| Grounds (six layouts) | dusk, wash, burst, split, night, ring | `dusk` becomes a stage at golden hour (warm sky, a stage lip, one spotlight); `wash` a pastel gig-poster wash with a ring of sparkles; `burst` comic focus rays (kept); `split` the owners' duo-card split (a hard diagonal between two of the palette's tones); `night` a starry night with a big moon; `ring` a spotlight circle on a stage floor |
| Patterns | seigaiha, asanoha, shippo | halftone-free patterns only: polka dots, a checker stage floor, a field of tiny stars |
| Scenery | bamboo, birds, pine bough, far torii | bunting, gulls, a fairy-light string, a far stage arch |
| Secondary stamp | a tone-on-tone motif silhouette | the same, from the new motifs |
| Hero | the anime hero cut in | the chibi hero as a sticker (2.9) |
| Foreground (`kind` ids kept) | dark leaves, petals, bokeh, falling notes (`drips`), embers | leaves become blossom sprigs, `petals` stay, `bokeh` stays, `drips` stays falling notes, `embers` become warm sparkles |
| Curses (`curse_*`) | torn, blotched, black-violet | a grumpy grey-violet jinx: the colour drained to lilac-grey, a pastel Gloss smear across it, a small frowny sticker in a corner; never torn paper, never a skull |
| Status cards (`status_*`) | worn cards with stains and ash | a card buffed too smooth by the Gloss: pastel sheen bands, a polite smile sparkle, a little static of glitter |

### 5.2 The 59 motifs (ids stay; every one redrawn in the chibi style; one drawing serves every card that names it)

| Motif id | Cards that use it (new names) | New drawing |
|---|---|---|
| `slash` | Petal Note | a pink sung arc: a crescent ribbon of sound with one eighth note head riding it and a cherry petal at the tip |
| `cross_slash` | Sweet Thirds, Sample Chop | two sound arcs crossing (one pink, one lime) with a sparkle where they meet |
| `thrust` | Find Your Voice, Palm Mute | a straight beam of sound leaving a mic grille: a cone of three rings and a bright note at its end |
| `crescent` | Sing It Back, Centre Stage, Curtsy and Go, Filter Sweep | a curved sweep: a crescent of petals and sparkles following an arc (reads as a filter curve too) |
| `iai` | Out of Nowhere | a single spotlight beam dropping onto one bright note, everything else dark |
| `petals` | Take the Lead, Little Trill, Shimmer Trail, Out of Breath | a swirl of loose cherry petals with two sparkles |
| `bloom` | Blossom Pop, Blossom Blanket, Cherry Lane | one big five-petal cherry blossom opening, cream centre, sparkles |
| `petal_storm` | The High Note, Blossom Blizzard | a spiral blizzard of petals round one high note |
| `wind` | Climbing Scale, Stage Waltz, Nod Along, Phaser, Bass Trap | three curling sound-wave ribbons |
| `shield` | Soft Shield, Sing Along, Stadium Reverb, Amp Stack | a round shield whose face is a speaker grille with a heart boss |
| `barrier` | Petal Curtain, Hi-Hat Guard, Reverb Wall, Big Shoulders | a dome of nested sound arcs, soft as a soap bubble |
| `talisman` | Got Your Back, Synth Zap, Finger Drumming | a glowing star-shaped sticker tag with one corner peeling |
| `lotus` | Bud by Bud, Imperfect Harmony, Noise Gate, Tape Warmth, Unbothered | a spinning vinyl record with a soft halo and two calm notes |
| `moon` | Warm Pad, Long Sustain, Mixing Desk | a crescent moon with a sound ring round it (a plain moon, not the song nod) |
| `sun` | Triplet Feel | a round stage light with rays and three beat dots |
| `star` | Run It Again, Push the Fader | a chunky five-point star with a cream rim and sparkles |
| `lightning` | Thunder Thumb, Crank It, Twin Amps, Live Wire | a thick orange zigzag bolt leaving a plucked bass string |
| `thunder_fist` | Slap Bass, Loop Pedal, Octave Down | a chibi thumb slapping a fat bass string, an orange shockwave |
| `chain_lightning` | Walking Bass | a bouncing orange note line hopping across three dots |
| `fire` | Heatwave, Slow Jam, Crowd Goes Wild, Sweat and Thunder, Overdrive, Hot Mic | round cartoon flames in three tones with a hot core |
| `flame_orb` | Spicy Snare, Fuzz Pedal | a glowing orange ball with flame tips and a snare-head ring |
| `ice` | (no card; gallery and icon) | a glassy bell-shaped crystal with a "ting" sparkle |
| `ink_splash` | Kick Drum, Pitchy, Glossed Over | a green beat burst: a starburst with sound rings and two note heads flying off (PKAH!) |
| `ink_wave` | Throat Bass | one big rolling low sound wave in green, a deep curl at the crest |
| `brush_stroke` | Drop the Beat | the drop: a downward arrow of stacked sound rings landing in a burst on a floor line |
| `calligraphy` | Count It In, Wait For It | a rising stack of equaliser bars (a crescendo) |
| `scroll` | La La La, Crate Digging, Low Pass | three records fanned out of a crate |
| `eye` | Lean In, Wee Woo, Final Mixdown, Floor Shaker, Got Your Number, Calm Centre, Stage Fright | a big chibi eye with a star catchlight and a sound-ring iris |
| `mask` | Beat Box, Back and Forth, Tape Stop, Over Here | a pair of theatre masks, one grinning, one singing |
| `fan` | Oohs and Aahs, Slow Swell, Shoulder to Shoulder, Crossfade | three sound waves (pink, violet, lime) spreading like an open fan |
| `bell` | Solo Button, Ping Pong Delay, Hold That Note, Bass Drop | a big speaker cone with pulsing rings |
| `lantern` | Second Wind, Save the Session | a warm fairy-light bulb with a heart-shaped filament |
| `koi` | Blossom Breath, Layer Upon Layer, Comfort Noise | a puffy breath cloud swirling with small bubbles |
| `dragon` | Bass Boost | a chunky boombox with two bouncing cones |
| `tiger` | Stage Monitors, Dig Deep | a stage wedge monitor on the floor with sound lines |
| `crane` | Gentle Sway, Answer Phrase, Build-Up, Mastering, Shuffle Step | a pair of dancing shoes mid-step with motion arcs |
| `fox` | Undo | a circular undo arrow made of a tape loop |
| `web` | Word of Mouth, Dry Signal, Untangle | a friendly knot of glowing mic cables with three plug ends |
| `thorns` | Bend the Note, Click Clack, Distortion, Howlround, Fret Buzz, Speaker Quake | a mic with jagged lime feedback squiggles radiating from it |
| `poison_bloom` | Chart Topper, On Repeat, Screen Time | a cute earworm: a little worm made of music notes curling round an ear |
| `skull` | Catchy Hook, Double Time | a music note shaped like a fishing hook (a catchy hook), never a skull |
| `heal_light` | Chill Mix | a steaming mug of warm tea, a heart in the steam |
| `spirit_orb` | Dance Break, Slapback, Voice Memo, Lock In | a glowing bubble with a tiny sound wave inside (a voice memo) |
| `torii` | Calling of the Moon, Acoustic Foam, Bedrock | a stage arch with fairy lights round it and a moon inside the arch |
| `mirror` | Mirror Ball, Heartbeat, Play It Back, Cringe Replay | a disco mirror ball throwing light spots |
| `sword_rain` | Melisma, Snare Roll, Arpeggiator | a diagonal rain of tiny notes |
| `meteor` | Monster Solo, Thunder From Below | a big glowing sound blast falling like a comet with a sparkle tail |
| `wave` | Slippery Riff, Change Strings | a smooth sine ribbon with a bright head |
| `tornado` | Arabic Impro, Petal Twirl, Rolling Low End | a whirl of notes and petals spiralling upward (the improvisation) |
| `quake` | Bounce Back, Wall of Sound, Drop D, The Lowest Note | a stage floor cracking under a big low shock ring |
| `fist` | String Pop, Jaw Dropper | a chibi fist bump with an impact star |
| `kick` | (no card; gallery and icon) | a lime trainer mid-kick (RoxorLoops's shoes) |
| `arrow` | Laser Synth | a laser beam with a starry tip |
| `coin` | Preset | a big glowing knob dial with a numbered ring of dots |
| `key` | (no card; gallery and icon) | a backstage key on a star key ring |
| `book` | Pass the Mic, Loop Station | a mic riding a looping arrow |
| `quill` | Rimshot, Flip It | a drumstick tapping a rim with a spark |
| `void` | Excess Baggage, Airbrushed | the Gloss: an opalescent blur blob with the polite Gloss smile |
| `sigil` | Corsage, Scratch Combo, Sidechain Pump, Hot Take | a magic circle of music: a sparkly ring with a looping flourish and three stars (hocus vocus) |

Acceptance (sheets `motifs`, `cards_hanae`, `cards_kuro`, `cards_suzu`, `cards_raiga`, `cards_junk`): every motif is a distinct standalone
icon at 40 px (the art_icons motif test), recognisable at 120 px on a card, no Japanese folklore object, no book, quill, brush, scroll
paper, skull or blade anywhere; the art_cards suite stays green (distinct, deterministic, cached per id, upgrade and size).

## 6. Icons (`js/art_icons.js`)

Every icon keeps its id, its 100 x 100 design box, its three levels of detail and its cached body. The house look changes from a
calligraphic stamp to a chunky sticker: even warm or navy outline, flat fills, one highlight, a cream die-cut rim where an icon sits on a
plate. Colour is never the only signal (the colour-blind rules stay).

### 6.1 Statuses (20 ids; discs: buffs warm or blue, debuffs red-violet, resources the hero colour)

| Status id | Name | Disc | Glyph |
|---|---|---|---|
| `might` | Volume | warm orange `#ff7a3a` | a volume knob turned to the top with three sound arcs |
| `bulwark` | Soundproof | blue `#5fb4ff` | a panel of acoustic foam wedges |
| `regen` | Warm Tea | mint `#7dffb0` | a mug with a heart in its steam |
| `thorns` | Feedback | lime `#c6ff3d` | a mic with jagged squeal lines |
| `dodge` | Shimmy | cyan `#5ff5ff` | hips mid-shimmy: two motion arcs either side of a small figure |
| `taunt` | Spotlight | gold `#ffd84d` | a spotlight cone from the top onto a dot |
| `ritual` | Crescendo | violet `#c49bff` | an opening hairpin with rising bars |
| `plating` | Sequins | silver lilac `#d9d4ff` | a cluster of round sequins with a glint |
| `bloom` | Bloom | Jasmin pink `#ff7eb6` | a cherry blossom |
| `sumi` | Groove | RoxorLoops green `#3fcf6a` | three stacked sound rings with a beat dot (a layer of groove) |
| `ward` | Reverb | RawClaw violet `#a77bff` | a small room outline with rings bouncing inside it |
| `charge` | Rumble | Andy orange `#ff9a2e` | a low wave under a floor line |
| `vulnerable` | Exposed | red-violet `#ff5a7a` | a target ring with a crack |
| `weak` | Muffled | grey-violet `#9a96b8` | a mic with a soft cushion pressed over its grille |
| `frail` | Wobbly | lilac `#c4a0ff` | a shield drawn in wobbly jelly lines |
| `poison` | Earworm | mint `#7cf2c8` | a cute note-worm curling round an ear |
| `burn` | Sizzle | orange `#ff8a3d` | a chilli with a flame on top |
| `stun` | Starstruck | gold `#ffd84d` | three dizzy stars circling a dot |
| `bind` | Tangled | cable violet `#b9a6ff` | a knot of cable with a plug end |
| `mark` | Tag | gold `#ffd84d` | a sticker tag with a star punched in it |

### 6.2 Charm icons (relics: 58 icon ids, 66 Charms)

The Echowake reuse of ten card motifs on relic plates (`SHARED` in art_icons, and the art_icons test "the ten motifs shared with the card
illustrator are drawn by ART.card.motif") ends: a Charm's plate always shows its own drawing (the motif of the same id now means
something else on a card). Each relic icon id gets the look of the Charm that uses it (`HV_WORLD_DATA.md` 2); where two Charms share one
icon id, the second gets a per-relic override (`RELIC_OWN[relicId]`), so all 66 Charms look different. Plate rims by rarity stay.

| Icon id | Charm (id, name) | Drawing (`HV_WORLD_DATA.md`) | Override for the second Charm |
|---|---|---|---|
| `lantern` | `brass_lantern` Tour Poster | a rolled poster, half open, a star and a dotted route on it | |
| `mask` | `fox_mask` Goat Mask | a cream goat mask with curled ears and a beard tassel | |
| `fan` | `hundred_petal_fan` Hoop Earring | a single gold hoop swinging, two petals in its arc | |
| `bell` | `silver_bell` Triangle | a silver triangle with its beater and a ring of ting lines | |
| `key` | `jade_key` Backstage Pass | a laminated pass on a teal lanyard, a big star and the art words `ALL AREAS` | |
| `scroll` | `bounty_scroll` Battle Trophy | a small gold cup topped with a mic | `formation_scroll` Stage Markers: two crosses of coloured tape, one pink, one green |
| `coin` | `fortune_coin` Busking Hat | an upturned straw boater with three gold coins inside | |
| `jar` | `ink_jar` Jar of Giggles | a corked jar of bouncing pink and green sparkles | `apothecary_jar` Post-Show Smoothie: a tall orange smoothie with a stripy straw |
| `geta` | `dancer_geta` Roller Skates | one pastel roller skate with spinning wheels | |
| `kasa` | `well_kasa` Tour Kettle | a round kettle with a sticker on it, steam curling | |
| `incense` | `burnt_offering` Glow Stick | a bent glow stick in pink, glowing softly | |
| `mirror` | `facet_lens` Rhinestone Mic | a mic studded with coloured stones, coins bouncing off | `mirror_of_two_faces` Twin Mic Stand: one stand with a pink mic and a green mic on a Y bar |
| `comb` | `wooden_comb` Mixtape | a cassette with a hand-written label and two spinning reels | |
| `dice` | `loaded_dice` Lucky Plectrum | a gold plectrum with a four-leaf sparkle | |
| `drum` | `battle_drum` Floor Tom | a deep floor tom on three legs, a stick mid-hit | |
| `flute` | `flute_of_changing_tunes` Wireless Mic | a handheld mic with a tiny aerial and motion lines | |
| `brush` | `sable_brush` Mic-Wand Keyring | a key ring with a little mic-wand, a star and sparkles | |
| `inkstone` | `inkstone_weight` Giant Water Bottle | a tall bottle with a flip straw and a column of stickers | `nightlong_inkwell` Green Mic: a round green mic in two cupped hands, sound rings popping out |
| `seal` | `merchants_seal` Sticker Sheet | a sheet of stickers (blossom, smiley, goat, star), one peeling | |
| `umbrella` | `paper_umbrella` Pop Filter | a round mesh disc on a bendy gooseneck clip | |
| `charm` | `mizuhiki_cord` Spare Headphones | violet over-ear headphones looped on a hook | |
| `riceball` | `rice_ball` Warm Oat Bar | a golden oat bar snapped in two, a wisp of warmth | |
| `teacup` | `steaming_teacup` Travel Mug | a lidded travel mug covered in little stickers, a curl of steam | |
| `koi` | `koi_pouch` Tote Bag | a teal tote bag printed with a tiny tote bag, a gem peeking out | |
| `feather` | `phoenix_feather` Spare Mic | a second mic with a heart sticker, a small sparkle | |
| `crown` | `prism_crown` Unicorn Headband | a pastel headband with a rainbow mane and a little gold cone on top | `tyrants_crown` Pitch Fixer: an opalescent pastel box with one perfect sine wave on its screen |
| `hourglass` | `sands_of_patience` Three-Bar Loop | a small pedal with one big footswitch and a three-dot loop ring | |
| `compass` | `pilgrim_compass` Pitch Pipe | a round chrome pitch pipe with a ring of little holes | |
| `candle` | `remembrance_candle` Fairy Lights | a mic stand wrapped in a string of warm bulbs | |
| `ribbon` | `branching_bookmark` The Viral Clip | a phone showing a play button, little hearts floating up (no numbers, no logo) | |
| `sword` | `whetstone` Practice Pad | a round drum practice pad with two crossed sticks | |
| `katana_guard` | `spring_tsuba` Heart Necklace | a fine chain with a small gold heart, a pink glow | `ironclad_tsuba` Flight Case: a black flight case with silver corners and sticker patches |
| `bow` | `longbow_of_reach` Megaphone | a white and orange megaphone with three sound arcs | |
| `beads` | `juzu_beads` Heavy Strings | a coiled set of four bass strings in an orange packet | |
| `gourd` | `bottomless_gourd` Extra Spicy Noodles | a steaming red noodle bowl with chopsticks and three little flames | |
| `lotus` | `lotus_sanctuary` Spring Reverb | a long violet tank with a coiled spring inside, wavy lines | |
| `moon` | `crescent_kanzashi` Sampler Pad | a square drum pad with nine pads, one lit blue | `blood_moon_vow` Stage Pyro: two stage flame jets in orange and gold |
| `sun` | `war_banner` Stage Light | a stage can light throwing a warm cone downward | |
| `star` | `jewelers_loupe` Glitter Glasses | heart-shaped sunglasses with glittery frames | |
| `dragon` | `dragon_pearl` Gold Record | a gold disc in a frame with a little star label | |
| `tiger` | `stormtiger_sash` Bass Cabinet | a tall cabinet of eight speaker cones, orange rumble lines on the floor | |
| `crane` | `paper_crane` Trumpet Mute | a cone-shaped brass mute with a cork band | |
| `fox` | `fox_haggler_token` Crew Lanyard | a teal lanyard with a card reading `CREW` and a tiny star | |
| `skull` | `hungry_skull` Bag of Grapes | a paper bag spilling a bunch of purple grapes | |
| `eye` | `scholars_spectacles` Smiley Tee | a folded black tee with a big orange smiley | |
| `heart` | `heart_charm` Cosy Onesie | a folded green onesie, a black smiley on the front | |
| `tooth` | `wolf_fang` Foam Finger | a big lime foam hand pointing up, a little star | |
| `shell` | `sturdy_shell` Gig Bag | a padded soft case with a patched corner and a zip | `pearl_satchel` Mystery Pin: a little envelope with a question mark and a sparkle |
| `bamboo` | `green_bamboo` Smoke Machine | a small box with a nozzle puffing a soft cloud | |
| `plum` | `plum_pendant` Blossom Badge | a round pin badge with a pink five-petal blossom | |
| `maple` | `book_of_falling_leaves` Glowing Phone | a phone glowing blue, a feed of little cards sliding up | |
| `shrine` | `shrine_box` Fruit Bowl | a bowl of grapes, two clementines and a banana | |
| `bridge` | `toll_bridge` Golden Ticket | a shiny gold ticket stub with a star punched through | |
| `petal` | `pressed_petal` Pink Scrunchie | a pink scrunchie with a blossom tucked in it | |
| `flame` | `ember_charm` Spark Fountain | a little stage cone spraying a fan of gold sparks | |
| `snowflake` | `wintry_bell` Instant Camera | a chunky instant camera with a photo sliding out, a flash star | |
| `bolt` | `thunder_wheel` Subwoofer | a boxy speaker with one huge cone and orange ripples | |
| `ink_drop` | `vial_of_spare_ink` Lime Shoes | a pair of lime trainers, one mid-tap | |

UI pictograms that borrowed relic icon ids move to ids whose new drawing fits (presentation edits): `screen_map.js` (no Charms yet
button) `('relic', 'lantern')` becomes `('relic', 'plum')` (the Blossom Badge); `screen_end.js` score rows: Headliners `('relic',
'crown')` becomes `('tile', 'boss')`, Rivals `('relic', 'skull')` becomes `('tile', 'elite')`; Acts `('motif', 'bell')` (now a speaker)
and Turns `('relic', 'hourglass')` (now the loop pedal) stay.

### 6.3 Gems (24 ids, 5 cuts, 4 colours plus the rainbow slot)

Cuts (`round oval square drop star`) and tiers (more facets, more glint, tier 3's orbiting sparkle) stay. Colour ids stay (`red blue
green gold any`); the drawn colours become pink `#ff5fa2` (for `red`), blue `#5fb4ff`, green `#3fcf6a`, gold `#ffd84d`, and a rainbow ring
for `any`. Stones read as rose quartz, aquamarine, jade or peridot, citrine (never pearl or coral, H5). Engraved glyph names stay (the
colour-blind test pins them) but `sword` is now drawn as an eighth note (pink: attack, a sung hit), `shield` a round shield, `leaf` a leaf,
`star` a star, `ring` the rainbow ring. Sockets on cards keep their colour-independent glyph.

### 6.4 Map tile stamps (14 tile ids; a round sticker with a cream rim instead of the vermilion seal)

| Tile id | Name | Stamp (bible 4.4) | Sticker colour |
|---|---|---|---|
| `start` | Soundcheck | the little tour van with a mic stand beside it | lemon `#ffd84d` |
| `empty` | Path | a trail of three small footprints in dots | cream |
| `block` | Blur | an opalescent blurred-out hole with soft edges (no stamp to recolour: the test exempts it) | Gloss opal |
| `enemy` | Face-Off | two crossed mics | tomato `#e8553f` |
| `elite` | Rival | a star with a frown | magenta `#ff4fa0` |
| `boss` | Headliner | a big marquee star with light bulbs | gold `#ffd84d` on indigo |
| `chest` | Gift Box | a ribboned box with a heart tag | pink `#ff7eb6` |
| `shop` | Merch Stall | a teal stall with a tote bag and a T-shirt | teal `#2ec4b6` |
| `camp` | Green Room | a green backstage tent with a star on the door | green `#3fcf6a` |
| `event` | Detour | a bent arrow sign with a question mark | violet `#a77bff` |
| `well` | Tea Stall | a steaming cup on a little cart | mint `#8fe3c0` |
| `brush` | Busker | an open hat with a sparkle | sky `#7cc6ff` |
| `gemcache` | Sparkle Booth | a booth of glittering stones | lilac `#c49bff` |
| `forge` | Studio | a door with an `ON AIR` light | orange `#ff9a2e` |

### 6.5 Intents (11), stats (7), Spells (6), card types (5), rows (2)

| Kind | Id | Drawing |
|---|---|---|
| intent | `attack` | a red sound burst with an arrow head (room for the number) |
| intent | `multi` | three small bursts in a row |
| intent | `heavy` | one big burst with a heavy downward arrow |
| intent | `defend` | a blue bubble shield |
| intent | `buff` | an up arrow with sparkles (Hype up) |
| intent | `debuff` | a violet swirl with a down arrow (Jinx) |
| intent | `summon` | a plus sign with a tiny creature silhouette popping out |
| intent | `heal` | a heart with a plus |
| intent | `special` | a big sparkle star with a question curl |
| intent | `flee` | running trainers with dash lines |
| intent | `none` | a grey speech bubble with three dots |
| stat | `gold` | a gold coin with a star |
| stat | `ink` | Vox: a round voice orb, pink to mint, with a white waveform across it; `on` glowing, off an outline |
| stat | `hp` | a heart |
| stat | `energy` | Breath: a puff of breath curling in a sky-blue orb; `on` and off as today |
| stat | `brush` | Spell: a mic-wand with a star on top |
| stat | `inkstone` | Cheers: two clapping hands with three spark lines |
| stat | `block` | a round shield |
| brush | `stroke` | Boots and Cats: a line of 3 hexes, badge glyph a kick-drum circle with two beat ticks (strokes, arcs only) |
| brush | `wave` | Vocal Run: a line of 5 hexes, badge a rising wavy line with two dot heads |
| brush | `fan` | Air Horn: a wedge of 3, badge a horn cone outline with two arcs |
| brush | `splash` | Abracadabass: a blob of 7, badge a wand star outline over a low wave |
| brush | `halo` | Surround Sound: a ring of 6, badge six small arcs round a dot |
| brush | `blot` | Hocus Focus: one hex, badge a four-point sparkle round a dot |
| type | `attack` | two crossed mics |
| type | `skill` | a magic wand with a star |
| type | `power` | a rising star with a trail |
| type | `curse` | a frowny sticker |
| type | `status` | a pastel Gloss smudge |
| row | `front` | Lead: a mic stand in front of a small speaker |
| row | `back` | Backing: a speaker in front of a small mic stand |

The Spell icons keep the art_icons test rules: at least 4 `closePath` hexagons for the shape, badge glyphs drawn with strokes, `arc` and
`ellipse` only (never `closePath`), and the size order splash > blot, wave > blot, wave > stroke.

Acceptance (sheets `icons_status icons_relics icons_gems icons_tiles icons_ui icons_motifs icons_zoom`): every icon reads at its smallest
use size (statuses 22, relics 20, gems 16, types 14), no two icons of a kind look alike, nothing Japanese, nothing from a book, every
Charm matches its `HV_WORLD_DATA.md` look.

## 7. The map (`js/art_map.js`): muted ground and live hexes

Public API, geometry, caching ladders, `frameMetrics`, the `clearRect` window and every map test stay. The read: **muted** ground is the
Gloss (opalescent, smooth, airbrushed, perfectly still); **live** ground is loud candy colour that moves a little near the party.

| Function | New look |
|---|---|
| `WASH` (per-tile pigment and decor ids; keys stay) | candy pigments: `start` lemon, `empty` sand `#f6d9a6` (Act I), `enemy` tomato, `elite` magenta, `boss` gold, `chest` pink, `shop` teal, `camp` green, `event` violet, `well` mint (decor `rings`), `brush` sky (decor `notes`), `gemcache` lilac, `forge` orange, `block` Gloss opal (decor `void` kept as the id) |
| fog (`fogSprite`, muted) | opal `#ece9f4` with a soft diagonal highlight sweep (a screen catching the light), an airbrushed inner shadow, a dotted outline `#b9b3cc` (a rest), faint smoothed-over sketches of what is underneath in `#d8d3e6`; baked, still (the "fog is still" test) |
| known (spotted landmark) | the landmark's sticker as a faint pastel silhouette under the opal film |
| painted (live) | the tile pigment filled flat with an even warm outline, one hard shadow on the lower left edge, a bounce highlight top right, the tile sticker on top, a faint sound ring |
| `liveTile` near the party | Act I bunting sways and petals tumble, Act II a tiny screen flickers, Act III fairy bulbs twinkle; a faint sound ring every 4 to 6 s, seeded per hex |
| edge (muted beside live) | a lit seam of pink to lime dashes (the next hex you can unmute) |
| block (Blur) | an opalescent blurred hole: soft radial rings, no outline, one polite sparkle |
| `paintBloom` (the reveal) | the Gloss film peels away from a circular wavefront (an opalescent edge curling back, like the film off a new phone), pink and green sparkles ride the wavefront, three sound rings escape and a note rises (`opts.note` hue ramp `#ff7eb6 #ff9a2e #f5c96a #3fd6b0 #5fb4ff #7a6bff #c49bff` kept); p 0 draws nothing, p 1 equals the live hex |
| `paper` (world ground) | under the muted film a sketchy world in pastel: a tour van, a sleeping mic stand, gulls (Act I), phone screens (Act II), ring lights (Act III), loose notes; new optional `opts.chapter` (1 to 3, default 1) picks the doodle set and the live ground tone (Act I sand and cobbles, Act II midnight asphalt with neon reflections, Act III mirror-white stage tiles); `screen_map.js` passes `M.chapter` |
| `frame` | a tour poster frame: deep indigo enamel with rounded corners, a pink to green pinstripe, a row of marquee bulbs along the top edge that chase slowly, four corner stickers (blossom, smiley, star, music note), and a pastel Gloss haze creeping in from the edges; the window stays `frameInner(1280, 720) = {x 44, y 36, w 1192, h 648}` |
| `token` | the two chibi heroes (cached walk and idle frames, 2.8), the leader in front; the ring under them in the leader's colour |
| `route` | a dotted path of small note heads in cream with a pink outline; the cost pill is a Vox capsule (pink to mint) with the Vox icon and the number; unaffordable stays red and shaking |
| `brushPreview` | the Spell's shape with marching sparkle dashes; valid mint, invalid soft red with an X |
| `fogEdge` | where live meets muted, a glowing seam of sparkles and the curled edge of the Gloss film; a darker opalescent rim at the Blur |

Acceptance (sheets `map_page map_kinds map_frame map_bloom map_paper map_doodles map_token`, and `GAME.debug.open('map', {painted:
0.3})`): muted ground reads opalescent and still, live ground reads colourful and alive, a reveal reads as a film peeling off with sparkles
and a rising note, the frame window is exactly 44, 36, 1192, 648, and the two tokens are the chosen outfits.

## 8. Fx (`js/art_fx.js`) and the combat look tables (`js/scene.js`)

### 8.1 The 24 fx (ids, signatures, default durations and every art_fx test stay)

| Fx | New look |
|---|---|
| `slash` | a sung arc: a fat ribbon of light with a cream core swept along an arc, two note heads and a petal flung off the head (default pink; SCENE colours it by the attacker, 8.2) |
| `cross` | two sung arcs making an X, a sparkle where they cross |
| `thrust` | a projected beam of sound from (x, y): a cone of rings that snaps to its end, a bright note at the tip |
| `burst` | a comic starburst impact (kept), even outline, no halftone |
| `ring` | an expanding sound ring with a trailing second ring (kept) |
| `inkSplash` | the beat burst (PKAH!): a green and lime starburst with a waveform rim, three expanding rings and note heads flying off; also the summon and win-over pop |
| `petals` | a swirling cherry petal storm (kept, petals redrawn chibi) |
| `lightning` | Andy's bass bolt (WOMP!): a thick orange zigzag with a wobbling low wave along it and a floor shock at the end |
| `chain` | a walking bass line: orange note heads bouncing along an arc between the points |
| `flame` | Sizzle: round cartoon flames in three tones and chilli-red sparks |
| `frost` | TING!: a glassy crystal sparkle burst with a bell ring |
| `poison` | Earworm: little note-worms wriggling up in mint and violet with bubbles |
| `shield` | a sound wall: a speaker-grille dot mesh that lights up along a ripple from the hit, a soft bubble rim |
| `heal` | Warm Tea: rising hearts and plus signs, a curl of steam, a warm light column |
| `buff` | rising equaliser bars and up chevrons, a ring sweeping feet to head |
| `debuff` | falling bars and down chevrons, a pastel Gloss drip falling |
| `sparkle` | four-point stars and a lens-flare star (kept) |
| `speedLines` | manga speed lines (kept) |
| `impactFrame` | the impact frame as a pink and green duotone flash with rays (reduce motion: a soft tint, kept) |
| `sfxText` | the hit words in the logo's chunky rounded letters: cream fill, warm outline, the element colour as a shadow |
| `vignette` | kept |
| `chromatic` | kept (now reads as a Gloss glitch) |
| `brushDrag` | a Spell cast: a mic-wand sparkle trail sweeping across the screen with notes |
| `numberPop` | chunky rounded digits: cream fill, thick warm outline; red for big hits, green for heals, blue for Block |

### 8.2 `scene.js` look tables (presentation only)

Element looks `EL` (colours; the word comes from the bible's hit words; element ids stay): `slash` `#ffd1e6`/`#ff7eb6` `LA!` (heavy
`BOOM!`), `fire` `#ff8a3d`/`#ffd84d` `SIZZ!`, `ice` `#bfefff`/`#ffffff` `TING!`, `lightning` `#ff9a2e`/`#ffe45e` `WOMP!`, `ink`
`#3fcf6a`/`#c6ff3d` `PKAH!`, `poison` `#7cf2c8`/`#e9ddff` `NANANA!`, `holy` `#fff4c2`/`#ffffff` `TA-DA!`. New: when a hero attacks with the
default `slash` element, the fx colour is the attacker's hero colour (pink, green, violet, orange), the word stays the element's.
Status colours `ST_COL` follow 6.1, so the resources match their heroes: `bloom` pink `#ff7eb6`, `sumi` green `#3fcf6a`, `ward`
violet `#a77bff`, `charge` orange `#ff9a2e` (Echowake had violet, pale blue and yellow for the last three).

## 9. UI skin, cover and site card

### 9.1 Tokens (`css/base.css` `:root`, mirrored in `ART.tk.pal` as new keys)

Every existing token and value stays (ids, and `pal` is test-pinned). New tokens:

| Token (CSS) | `pal` key | Value | Use |
|---|---|---|---|
| `--hv-pink` | `hvPink` | `#ff7eb6` | Jasmin, HOCUS, primary buttons |
| `--hv-pink-d` | `hvPinkD` | `#c93f78` | pressed, outlines on pink |
| `--hv-pink-l` | `hvPinkL` | `#ffc9de` | highlights |
| `--hv-green` | `hvGreen` | `#3fcf6a` | RoxorLoops, VOCUS, secondary buttons |
| `--hv-green-d` | `hvGreenD` | `#1f7a3a` | pressed |
| `--hv-lime` | `hvLime` | `#c6ff3d` | accents, focus glints |
| `--hv-violet` | `hvViolet` | `#a77bff` | RawClaw |
| `--hv-orange` | `hvOrange` | `#ff9a2e` | Andy |
| `--hv-teal` | `hvTeal` | `#2ec4b6` | Jordan, the Merch Stall |
| `--hv-cream` | `hvCream` | `#fff4e6` | light panels, sticker rims |
| `--hv-line` | `hvLine` | `#2d170f` | the warm chibi outline |
| `--gloss`, `--gloss-lilac`, `--gloss-mint`, `--gloss-blush` | `gloss`, `glossLilac`, `glossMint`, `glossBlush` | `#f4f1fb #e6d9ff #d9fff4 #ffe3f1` | the Gloss |
| `--vox` | `vox` | an inline SVG of the Vox orb (replaces the use of `--echo` for the meter; `--echo` stays defined) | the Vox meter pips and fly-ins |

`--font-display` (value only) becomes a rounded heavy stack with no web font: `"Arial Rounded MT Bold", "Nunito", "Quicksand", "Varela
Round", "Trebuchet MS", system-ui, sans-serif` (weight 800 to 900); `--font-ui` a clean system stack `"Segoe UI", "Helvetica Neue",
system-ui, sans-serif`; `--font-num` stays.

### 9.2 Components

| Piece | Echowake | Hocus Vocus |
|---|---|---|
| Primary button | vermilion lacquer, gold trim, shine sweep | a candy pink pill (`--hv-pink`), cream inner rim, warm outline, a 3 px drop "sticker" shadow, a soft shine; pressed sinks 3 px |
| Secondary button | silk | a green pill (`--hv-green`) with the same build |
| Ghost button | line only | cream outline only |
| Dark panels | lacquered indigo, fine gold line | deep indigo stage panels with rounded 16 px corners and a thin pink to green top stripe |
| Light panels | washi paper, fibre, torn edges | cream gig-poster card (`--hv-cream`) with soft printed edges; `--grain`, `--fibre`, `--torn-*` stop being used on panels (the tokens stay defined) |
| Badges (`UI.hanko`) | vermilion seal | a round sticker in the act or hero colour with a cream rim |
| Tooltips | manga speech bubbles | kept (rounded, warm outline) |
| Rarity | silver leaf, gold leaf shimmer | uncommon: a lilac sparkle edge; rare: a gold edge with a slow sparkle sweep |
| Cards (`UI.card`) | lacquer body, gold bevel | the deep indigo body, a header band in the hero colour, the cost orb as a Breath puff orb (sky blue), a cream illustration bevel, gem sockets as small rounded cut-outs, the upgraded `+` with a warm glow and sparkle corners |
| Meters | equaliser of echo pings | the Vox meter as an equaliser row of Vox orbs |
| Focus | 3 px gold ring | 3 px lime ring with a dark outer edge (contrast on pink and green) |

Acceptance (the shot tool at 1280 x 720, 844 x 390, 390 x 844 and `textScale` 1.3 on title, hero select, map, combat, shop, Green Room,
Detour, end screens): no gold leaf or vermilion lacquer left on any button or panel; text contrast at least 4.5:1 on every new fill;
nothing clips at 1.3.

### 9.3 Cover and site card

- `tools/hocus_vocus/cover.mjs` (header comment says Hocus Vocus): the poster (480 x 270) is the title with the logo, the stage and the duo
  in stage clothes; the clip is the title (1.5 s), a fight with Jasmin and RoxorLoops against the Fussy Foghorn (Jasmin's attack and
  RoxorLoops's beat burst land), then the map unmuting a chain of hexes. Writes `hocus_vocus/cover.webp` and `hocus_vocus/cover.webm`.
- The site index (`/home/user/Games/index.html`, the `GAMES` list) gains one entry next to Echowake's (which stays as it is):
  `{ id:'hocus_vocus', href:'/hocus_vocus/', title:'Hocus Vocus', ac:'#ff7eb6', desc:'A vocal magic adventure with RoxorLoops and Jasmin.
  The Gloss has put the Soundlands on mute: unmute the world hex by hex with Vox, fight with beatboxing and soft sung magic from one
  shared deck, and choose to stay human. Three acts, three headliners, four heroes, ten Encores and a Daily Duet.', tags:['cards',
  'strategy','music'] }` (the id matches the folder; HV_PHASES 10C builds it from this text). No dash in it; the card reads `cover.webp` and `cover.webm` from the folder like every other game.

## 10. Audio (`js/audio.js`)

### 10.1 What changes and what stays

Stays: the public API (`init sfx music setVolume volume duck suspend resume intensity list preview compose sfxRecipe graph render
renderSfx voice debug wake awake options hexNote songDegrees wakeDegree`), every music id (19) and sfx id (73), the scheduler, the master
chain (`MUSIC_SCALE` 0.55, compressor, limiter, soft clip), ducking, suspend, the voice cap, the iOS wake hooks, `AUDIO.intensity`
(fights) and `AUDIO.awake` (the map), the melodic reveal machinery (every unmuted hex sings one note of a seeded tune), the token bucket,
the echo send, the calm and lite options, the note marks on the map. The header comment is rewritten for Hocus Vocus.

Changes: the instruments (10.2), the scales (10.3), two new composition roles (`beat`, `theme`), swing and the Gloss quantise (10.3), all
19 scores (10.5), the Spells' gestures (10.7), all 73 sfx recipes plus per-hero variants (10.8), the `MIX` table and the sfx `vol`
values (re-measured, 10.9), and the sample hook (section 11).

### 10.2 The band (voices; internal names, not player text)

| Voice | Who | Synthesis | Range (MIDI) |
|---|---|---|---|
| `kick` | RoxorLoops | beatbox kick "b": a sine dropping 160 to 48 Hz over 60 ms, a 4 ms lip click (band-passed noise at 1.2 kHz), a touch of the vox `u` formant for 40 ms; `hit: 'boots'` adds the "oo" tail | 30 to 60 |
| `snare` | RoxorLoops | beatbox snare: `hit: 'pf'` lip snare (pink noise band-passed at 1.4 kHz, 90 ms, with a 200 Hz body), `hit: 'k'` (a sharp 3.5 kHz click and a short hiss), `hit: 'cats'` ("k" plus a short `a` formant and a "ts" tail) | 40 to 80 |
| `hat` | RoxorLoops | "ts": high-passed noise at 7 kHz, 25 ms; `hit: 'open'` 140 ms "tsss" | n/a (pitch ignored) |
| `throat` | RoxorLoops | throat bass: a sawtooth and a sine an octave below through a 600 Hz low-pass and an `o` formant band at 450 Hz; above vel 0.7 a 28 Hz growl wobble | 28 to 55 |
| `scratch` | RoxorLoops | vocal scratch "wikka": band-passed noise plus a vox formant with fast up and down pitch sweeps (forward and back strokes) | 48 to 84 |
| `croon` | Jasmin | the soft sung lead: the vox formant engine on `oo` opening to `ah` on long notes, 60 ms attack, a scoop up from 30 cents flat, vibrato 5.2 Hz and 18 cents after 200 ms, a little breath noise; always sends 0.35 to the echo and the hall (her reverb and delay) | 55 to 84 |
| `choir` | the crowd | three detuned `ah` voices (plus and minus 7 cents), slow attack | 48 to 79 |
| `synth` | RawClaw | saw plus square, detuned, through a low-pass with an envelope sweep (`hit: 'zap'` a fast downward pitch sweep, `hit: 'laser'` a rising one) | 48 to 96 |
| `keys` | warm chords | electric-piano tine: FM (ratio 1, index 1.4 decaying) over a sine body, a slow tremolo | 40 to 88 |
| `ebass` | Andy | electric bass: triangle plus saw through a 900 Hz low-pass envelope and a pluck noise; `hit: 'slap'` adds a thumb click and an octave pop | 28 to 60 |
| `glock` | sparkle | glockenspiel: a short bright FM bell (ratio 3.5) | 72 to 108 |
| `uke` | Blossom Bay | ukulele pluck: a damped plucked string (the old koto engine retuned bright and short) | 60 to 84 |
| `whistle` | Act I hook | a sine with breath noise and a light vibrato | 72 to 96 |
| `clap` | hands | three noise bursts 10 ms apart band-passed at 1.2 kHz with a short room; `hit: 'snap'` a finger snap | n/a |
| `pad` | kept | detuned saws through a low-pass | 31 to 90 |
| `arp` | kept | the generic pluck (lite mode's voice) | 48 to 100 |
| `vox` | kept, extended | the formant voice: vowels `a o u e m`; syllables become `boots cats ts pf k bwaa ab ra ca tada hey boom` (`don`, `ka`, `tsu` go: they were Japanese drum syllables); `robot: true` removes vibrato and scoop and snaps pitch (the Gloss's lip-sync) | 45 to 84 |
| `crackle` | kept, re-voiced | vinyl crackle and a soft kettle hiss | n/a |

Removed from the fork: `koto shamisen biwa shakuhachi taiko hyoshigi rin` (and their `TRIM`, `HUMAN`, `VOICE_TAIL`, `RANGES` rows). Every
new voice gets a `TRIM`, `HUMAN`, `VOICE_TAIL` and `RANGES` row; `SUSTAINED` lists `croon choir pad vox whistle`; `MONO` lists `croon
whistle throat`.

### 10.3 Scales, the composer, swing and the Gloss quantise

- `SCALES` becomes `major [0,2,4,5,7,9,11]`, `mixolydian [0,2,4,5,7,9,10]`, `dorian [0,2,3,5,7,9,10]`, `minor [0,2,3,5,7,8,10]`,
  `lydian [0,2,4,6,7,9,11]`, `penta [0,2,4,7,9]`, `pentaMinor [0,3,5,7,10]`. The three Japanese scales are removed from the fork.
- The composer is generalised to any scale length: `isChordDeg` uses `mod(d - root, S.sc.length)` (today it hard-codes 5), so chord
  tones are triads in a seven-note key and every other degree in a five-note one; the audio agent greps the composition and ECHO sections
  for any other `5` that means "degrees per octave" and replaces it with the scale length.
- The melodic reveal sings on the pentatonic subset of the map track's key: `echoKey(chapter)` returns `{tonic: map tonic + 12, sc:
  pentaOf(scale)}` with `pentaOf` = `penta` for major, mixolydian and lydian and `pentaMinor` for dorian and minor. So `hexNote`, the
  contour, `songDegrees`, `snapRoot` and `CHORD_ROOTS` stay five-note, and `CHORD_ROOTS` gains `'0,2,4,7,9': [0,1,2,3,4]` and
  `'0,3,5,7,10': [0,1,2,3,4]` (neither scale has a semitone or a tritone, so every root is consonant; test A12 checks it).
- New role `beat`: a 16-step grid per bar with letters `B` kick (accent), `b` kick (soft), `K` snare (accent, "cats" or "pf"), `k` snare
  (soft or rim), `t` closed hat, `T` open hat, `s` scratch, `c` clap, `.` rest. One `beat` role expands into one track per voice it
  uses (kick, snare, hat, scratch, clap), each with its own `MIX` row. Grids (bars, cycled):
  `bootsCats` (`B.t.K.t.B.t.K.t.`, `B.tBK.t..BtBK.tK`), `boomBap` (`B...t.K.b.t.K.t.`, `B..bt.K.b.tBK.t.`), `combat`
  (`B.tkK.tbB.tkK.tk`, `B.tkK.tBb.tkKktk`), `hats16` (`tttttttttttttttt`), `fills` (`........s...T.s.`, `....s.s.T...sssK`), `showdown`
  (`B..BK..bB.bBK..K`), `shanty` (`B..cB..cB..cBccc`), `fourFloor` (`B.t.B.tKB.t.B.tK`), `crisp` (`B.t.K.t.B.t.K.t.` with human 0),
  `march` (`B.c.B.c.B.c.Bcc.`), `fanfare` (`cccccccccccccBBB`, `B..c..B.B.c.B...`), `shop` (`b.c.b.c.b.c.b.cc`), `clicks` (`..k...k...k..k.k`).
- New role `theme`: plays a fixed motif from the `MOTIFS` table (10.4) in the track's key, so the Human theme and Jasmin's theme are
  quoted note for note.
- Swing: a track may set `swing` (share of a 16th by which every odd 16th is late, 0 to 0.2). New drive `quant` (used by `map3`, `boss3`,
  `combat3` and `final`): swing and the human timing spread start at 0 (dead on the grid, the Gloss) and rise with the drive value
  (`map3`: the wake level; fights: the intensity) to the track's `swing.to` and `human.to`. Applied in the scheduler when a note is
  placed (cheap, read each tick). Layers keep working as before.

### 10.4 Motifs (the musical identities; scale degrees from 0 = the tonic, in the track's key)

| Motif | Notes | Where it plays |
|---|---|---|
| Jasmin's theme (arp pattern `jasmin`) | eighths, legato: 0 2 4 7 9 7 4 2 (up the arpeggio to the tenth and home), `croon` on `oo` with her delay, doubled an octave up by `glock` at low velocity | title (arp and croon), victory loop, defeat loop (as a music box), her card sounds (first three notes), hero select when she is picked |
| RoxorLoops's beat | the `bootsCats` grid, with a throat-bass slide on the last eighth of every fourth bar | title (soft `boomBap` cousin), combat tracks, his card sounds, `final` layer 1 |
| RawClaw's figure | eighths 4 2 0 on `synth`, panned left, right, centre (a ping-pong delay throw) over a filter sweep | map2, boss2 accents, his card sounds |
| Andy's riff | `ebass`, mixolydian: 0 . 0 7 6 . 4 5 (slap on the first note, pop on the octave) | hero select bass, Act III bass, his card sounds |
| The Human theme | an ORIGINAL four-bar tune (the game never transcribes the owners' song "Human", bible H17): bar 1: 4 (dotted half), 5 (quarter); bar 2: 4 (half), 2 (half); bar 3: 1, 2, 4, 7 (quarters; the 7 gets a 40-cent scoop and a breath: the voice cracks on the high note); bar 4: 6 (half), 4 (half, tied over). The kick under bar 3 lands one 32nd late (a kick a hair late). | `final` layer 2 (croon) and layer 3 (choir in unison, then thirds), the victory stinger (croon plus choir), the first bar on glock inside the `boss_die` sfx |
| The Gloss | a pastel drone plus perfectly even glock eighths, the `vox` voice with `robot: true` lip-syncing | map3 at low wake, boss3, the intro of `final`, the `defeat` stinger's last chord |

### 10.5 The 19 tracks

| Track | Key (MIDI), scale | Tempo, metre | Drive | Mood (the `mood` string) | Roles (voice, layer) |
|---|---|---|---|---|---|
| `title` | 50 D major | 84, 4/4 | single | `moonlit and warm, the duo warm up under the moon` | pad `keys`; arp `glock` (pattern `jasmin`); melody `croon` (form A a2 B a, cells long); beat `boomBap` (soft); bass `throat` (half notes); bell `glock` sparkles |
| `hero_select` | 55 G major | 100, 4/4 | single | `bouncy and friendly, pick your duo` | melody `whistle`; ostinato `uke` (strum); bass `ebass` (walk, Andy's riff shape); beat `bootsCats` (light); clap on 2 and 4; pad `keys` (open) |
| `map1` Blossom Bay | 55 G major | 100, 4/4 | awake, hush lo 900 floor 0.85 | `sunny harbour pop, handclaps and a whistled hook` | L0 pad `keys`, bell `glock`; L1 bass `ebass`, clap; L2 arp `uke` (roll); L3 melody `whistle` (also `croon` at 0.4) |
| `map2` Scrollopolis | 57 A dorian | 104, 4/4 | awake, hush lo 750 floor 0.8 | `two in the morning in blue light, a minor electro bounce and a call to the moon` | L0 pad, bell `synth` (sparse plucks); L1 bass `throat` (pedal); L2 arp `synth` (stutter sixteenths, skip 0.3, RawClaw's figure every 4 bars); L3 melody `croon` (sparse, a long rising call answered a bar later) |
| `map3` the Perfect Stage | 52 E lydian | 96, 4/4 | awake and quant, hush lo 600 floor 0.75, swing 0 to 0.14, human 0 to 1 | `too clean, glass pop dead on the grid that learns to swing as it is unmuted` | L0 drone pad, bell `glock` (even eighths); L1 bass `keys` (roots); L2 arp `keys`; L3 melody `croon` (the real voice returns) |
| `combat1` | 52 E major | 124, 4/4 | intensity, TH_COMBAT | `bright beatbox pop, boots and cats with a ukulele hook` | L0 beat `combat`, bass `throat` (drive), ostinato `uke` (drive); L1 arp `glock` (up, sixteenths), beat `hats16`, clap offbeats; L2 melody `whistle` (also `keys` 0.55, `croon` L3 0.45); L3 beat `fills`, pad `keys`, bell `glock` |
| `combat2` | 57 A minor | 130, 4/4 | intensity, TH_COMBAT | `neon electro, syncopated, glitchy and scratched` | as combat1 with ostinato `synth` (gallop), melody `synth` (also `croon`), arp `synth`, more `s` in the fills |
| `combat3` | 52 E lydian | 136, 4/4 | intensity and quant (swing 0 to 0.1) | `polished and relentless, it loosens and swings as the Polished fall` | as combat1 with ostinato `keys` (staccato), melody `croon` (also `glock`), arp `keys`, beat `crisp` at L0 |
| `elite` | 50 D minor | 118, 4/4 | intensity, TH_COMBAT | `a showdown, heavy stabs and a big beatbox breakdown` | L0 beat `showdown`, stab `synth`, bass `throat` (pedal); L1 ostinato `synth` (tremolo), beat `fills`; L2 melody `croon` (sparse, leaps), pad; L3 beat `hats16`, bell `glock` |
| `boss1` Kraki | 50 D mixolydian | 126, 4/4 | intensity, TH_BOSS | `karaoke chaos by the sea, a stomping shanty and eight mics at once` | L0 pad, beat `shanty`, bass `ebass` (drive), ostinato `uke` (gallop), melody `croon` (also `whistle` L1); L1 arp `glock`, clap; L2 beat `fills`, bell `glock`; L3 stab `keys`, choir (every voice at once) |
| `boss2` Scrollspinner | 54 F# dorian | 134, 4/4 | intensity, TH_BOSS | `glam electro diva, glittering arps and a feed that never stops` | L0 pad, beat `fourFloor`, bass `throat` (drive), ostinato `synth` (template `silk`, id kept), melody `synth` (also `croon` L1); L1 arp `synth` (sparkle), beat `hats16`; L2 beat `fills`, bell `glock`; L3 stab `synth`, choir |
| `boss3` Flawless (forms 0 and 1) | 48 C lydian | 140, 4/4 | intensity and quant (swing 0 to 0.06), TH_BOSS | `cold perfect pop, chrome and glass and not one wrong note` | L0 pad, beat `crisp`, ostinato `keys` (staccato), bass `ebass` (drive, perfectly even), melody `vox` (`robot`, the lip-sync); L1 arp `glock` (rise), beat `hats16`; L2 bell `glock`; L3 stab `keys`, pad (full) |
| `final` the Gloss (form 2) | 50 D major | 92, 4/4 (half-time feel) | intensity and quant (swing 0 to 0.12, human 0 to 1.2), thresholds `[0, 0.5, 0.62, 0.75]` (tunable: the layers arrive as the Gloss's HP falls inside its last form) | `the Gloss fills the sky, one real voice, then two, then the whole crowd` | intro 4 bars (not looped): the Gloss alone (drone pad, even glock, robot `vox`); loop 16 bars: L0 drone pad, bell `glock` (the Gloss); L1 beat `bootsCats` with human timing, bass `throat` (RoxorLoops comes in); L2 theme `human` on `croon`, `keys` (Jasmin sings); L3 theme `human` on `choir`, arp `glock` (the crowd sings along) |
| `shop` Jordan's Merch Stall | 60 C major | 108, 4/4 | single | `cheeky and bouncy, ukulele, whistle and finger snaps` | melody `whistle` (also `glock` shift 1); bass `ebass` (walk); beat `shop` (clap voice as snaps); arp `glock` (sparkle); pad `keys` (open) |
| `camp` Green Room | 53 F major | 60, 3/4 | single | `a backstage lullaby on warm keys with vinyl crackle` | melody `keys` (lull, form A B a); pad; arp `glock` (pluck3); crackle (vinyl and kettle); bell `glock` |
| `event` Detour | 57 A dorian | 76, 4/4 | single | `curious and sparse, finger clicks, a walking bass and a question in the tune` | drone pad; melody `croon` (sparse, phrases end on a rising step); bell `glock`; bass `ebass` (walk, every 2); beat `clicks` |
| `reward` the goodie bag | 62 D major | 120, 4/4 | single | `a bright little fanfare loop, glockenspiel runs, claps and a beat` | run `glock`; melody `whistle` (also `uke`); pad `keys`; bass `ebass` (half); beat `march`; bell `glock`; clap |
| `victory` | 50 D major | 92, 4/4 | single | `the whole crowd sings the last line, then a warm loop` | stinger 3 bars: theme `human` (bars 1 and 2) on `croon` with `choir`, run `glock`, beat `fanfare`, pad `keys`; loop 8 bars: pad `keys`, theme `jasmin` on `croon` (soft), arp `glock`, bell `glock` |
| `defeat` the intermission | 50 D dorian | 68, 4/4 | single | `intermission, the lights go down and a music box keeps the tune` | stinger 3 bars: melody `keys` (shape fall), beat (one soft kick per bar), pad, bell `glock`; loop 8 bars: theme `jasmin` on `glock` slowed (a music box), crackle, pad drone; never ominous |

Every track keeps the suite's structure rules (loop length 14 to 70 s, at least three tracks, every note inside its scale, register and
loop, cadences on the tonic, `xfade` values as today).

### 10.6 The melodic reveal and the Gloss on the map

- Every unmuted hex still sings its note (`AUDIO.wake`), now in the pentatonic subset of the Act's key (10.3). The single-note voice
  per Act: Act I `glock` (sunny), Act II `synth` pluck (neon), Act III `glock` played dry and short at first, with a soft `croon` double
  (vel 0.18) once the wake level passes 0.5 (the real voice coming back).
- A walk still hums (`step`: vox `m`, thinned as today); calm and lite behave as today.
- The map mute is the Gloss: the per-deck low-pass and gain floor stay (Act I lightly muffled, Act III the most), the first unmuted hex
  still lifts the filter for 2 s, and Act III also starts dead on the grid and swings as it is unmuted (`quant`).
- `paint` (one hex) and the reveal sounds are re-voiced in 10.8.

### 10.7 The Spells (table `SONGS`, keys are the `DATA.brushes` ids and stay)

| Key | Spell | Voice and gesture (bible 4.5) |
|---|---|---|
| `single` | one unmuted hex or a chain | per Act: `glock`, `synth`, `glock` (10.6); echo 1, 1, 0.4 |
| `step` | a walked hex | vox `m` (kept) |
| `stroke` | Boots and Cats | each cell its own hex note on `glock` (vel 0.4) plus the classic pattern spoken by the vox and the kit: cell 0 `boots` with a kick, then `ts` with a hat, `cats` with a snare, `ts`, repeating |
| `wave` | Vocal Run | a five-note sung run upward on `croon` (`oo`, a rising run from the anchor's note) doubled softly by `glock` |
| `fan` | Air Horn | the strummed triad on `synth` (snapped root) and, on the first cell, a beatboxed air horn: vox `bwaa` (a buzzy formant with a pitch fall) three times, short short long |
| `splash` | Abracadabass | the chord stack (`[-5, 0, 2, 4, 5, 7, 9]` in five-note degrees); on the first cell "a-bra-ca" sung on three chord tones 0.09 s apart (vox `ab`, `ra`, `ca`), then a `boom` throat-bass drop and a deep kick, then the ring of glock notes rises |
| `halo` | Surround Sound | six stacked `oo` voices on `choir`, each cell's voice panned round a circle (pan = sin of its angle), a soft pad on the first cell |
| `blot` | Hocus Focus | one bright `glock` "ting" and a whispered vox `tada` |

### 10.8 The 73 sfx (ids and categories stay; every recipe re-voiced, then re-measured)

| Sfx id | When | New sound |
|---|---|---|
| `ui_click` | any button | a tongue click "tk" with a tiny blip |
| `ui_hover` | hover | a soft breathy "ts" tick, very quiet |
| `ui_back` | back | a lip pop sliding down |
| `ui_error` | refused action | a gentle "uh-uh": two low vox `u` notes falling a tone |
| `ui_open` | panel opens | a whispered rising "fwip" and a glock ting |
| `ui_close` | panel closes | a falling "fwoop" |
| `ui_toggle` | toggles, outfit swatch | a finger snap |
| `card_draw` | a card is drawn | a short open hi-hat swish "tss" |
| `card_hover` | hover a card | a soft breath "hh" |
| `card_pick` | pick a card | a tongue click and a glock blip |
| `card_play_attack` | an Attack is played | a beatbox "pkah" (kick into snare); hero variants below |
| `card_play_skill` | a Skill | a whoosh and a three-note glock arpeggio; variants below |
| `card_play_power` | a Power | a throat-bass drop, a choir swell and a glock sparkle; variants below |
| `card_discard` | discard | a soft lip "pff" |
| `card_exhaust` | Fade | a fading "shhh" with a reverse swell and sparkle pops |
| `shuffle` | reshuffle | a vocal scratch "wikka wikka" |
| `swap` | swap spots | a vox glide up and down "whoop"; variants below (the new lead's sting) |
| `energy_gain` | gain Breath | a quick inhale and a glock ting |
| `turn_start` | your turn | a count-in: two mouth clicks and a glock pair |
| `turn_end` | end turn | a settling hum "mm" over a soft kick |
| `enemy_turn` | enemy turn | two throat-bass notes "dun dun" and a short reverse swell |
| `hit_light` | a light hit | a punchy "puh": a kick with mouth noise |
| `hit_heavy` | a heavy hit | a big "BOOM": a deep kick, throat bass and noise |
| `hit_crit` | a critical hit | the BOOM plus a glass ting, a short crowd "ooh" (choir) and sparkle |
| `hit_multi` | a multi-hit | three quick snares "k k k" |
| `slash` | element slash (most hero hits) | a sung "la" swish: a short croon note with a whoosh |
| `thud` | a body bump | a soft low "dumf" |
| `zap` | element lightning | Andy's WOMP: a wobbling sub bass note falling with a crackle |
| `flame` | element fire, Sizzle ticks | a sizzle "tssss" with crackle pops |
| `ice` | element ice | TING: a glassy high glock with a shimmer |
| `poison_tick` | Earworm ticks | a tiny cartoon "na-na-na" (three short vox `a` notes) |
| `thorn` | Feedback hits back | a short, quiet mic squeal (a 2.8 kHz swell for 120 ms with a click) |
| `dodge` | Shimmy | "fwip fwip" with a glock flick |
| `block_gain` | gain Block | a padded speaker "thoomp" and a glock ring |
| `block_hit` | a hit on Block | a "bonk" off a bubble (a quick pitch drop) |
| `block_break` | Block breaks | a bubble "pop!" and a glass sparkle |
| `heal` | heal, Warm Tea | a warm choir "aah" chord and a glock run up |
| `buff` | Hype up, Volume | a rising "hey!" over a short riser |
| `debuff` | Jinx | a gentle falling "wah-wah" (a sad trombone made of vox, kind not mocking) |
| `stun` | Starstruck | a vox "wow" and glock stars swirling |
| `enemy_die` | a creature is won over | a happy "pop!", a tiny "yay" and confetti sparkle |
| `hero_down` | a hero loses their voice | a soft falling "ooh" that cracks, then a breath; variants below |
| `hero_revive` | a hero gets their voice back | a rising "ahh", a glock arpeggio and a throat-bass lift; variants below |
| `boss_die` | a Headliner is won over | a big crowd cheer (layered noise swells and choir), the first bar of the Human theme on glock, a kick |
| `boss_intro` | Headliner reveal | three big stage-light switches "chunk chunk chunk", a riser and a crowd "ooh" |
| `phase_change` | a Headliner's new form | a record scratch, a reverse swell and a boom |
| `paint` | one hex unmuted (when no note plays) | a soft sung "ta" and a sparkle |
| `ink_splash` | a find on the map | two finger clicks and a glock answer |
| `brush_pick` | learn a Spell | a whispered "ooh" and a three-note glock motif (4, 2, 7: the Hocus Vocus jingle) |
| `brush_use` | cast a Spell | a quick inhale, a sung "abra", a downbeat kick |
| `step` | a step on the map | a soft mouth click footstep |
| `reveal_landmark` | a landmark is spotted | a spotlight switch "chunk" and a glock sparkle |
| `ink_gain` | gain Vox | a rising "ooh" with a delay echo |
| `well` | a Tea Stall | a cup clink and a gentle kettle whistle, tuned to the map key (`tune: 55` kept) |
| `gold` | gold | coins clinking (bright FM) |
| `buy` | a purchase | two glock dings and a bag rustle |
| `chest_open` | a Gift Box | a ribbon zip, a lid pop and a glock "ta-da" |
| `relic_get` | a Charm | a vox "ta-da!", a glock arpeggio (at least 4 notes) and a kick |
| `gem_socket` | set a gem | a click-in snap and a crystal ting |
| `gem_get` | get a gem | a crystal glock sparkle run |
| `forge_hit` | the Studio's "Hit it!" | a drum pad hit: kick plus clap "thwack" |
| `upgrade` | Rehearse | a pad hit, a rising glock run and a soft vox "yeah" |
| `camp_fire` | Green Room ambience | a kettle hiss and vinyl crackle |
| `rest` | Rest | a sleepy three-note hum and a sofa "flump" |
| `event_open` | a Detour opens | a curious vox "hmm?" and a rising glock question figure |
| `choice` | pick a Detour choice | a finger snap and a glock note |
| `page_turn` | Detour plate change, segues | a camera shutter and a beatboxed click (bible 4.1) |
| `level_up` | progress fanfare | a glock run up (at least 4 notes), a vox "yeah!" and a kick |
| `victory` | victory sting | a crowd cheer and the first two notes of the Human theme on croon over a glock run |
| `defeat` | defeat sting | a stage-lights-down "chunk", a soft falling keys phrase and a curtain swish |
| `achievement` | a Sticker | a sticker peel and a pat ("fwip, pat") and a glock sparkle |
| `unlock` | an unlock | a glock "ta-da" and sparkles |
| `save` | saved | a soft double click and a tiny glock note |

Per-hero variants (recipe keys `id.hero`; `AUDIO.sfx(id, {hero})` uses the variant when it exists, else the base recipe; the cooldown,
priority and duck are the base id's). `scene.js` passes `hero` for `play` events (the card's hero), `swap` (the new lead), `hero_down`
and `hero_revive` (the hero):

| Base id | `.hanae` (Jasmin) | `.kuro` (RoxorLoops) | `.suzu` (RawClaw) | `.raiga` (Andy) |
|---|---|---|---|---|
| `card_play_attack` | a soft sung "la" run (three croon notes, Jasmin's theme opening) and a petal glock | "B-K": kick into snare | a synth "pew" zap | a slap-bass "thwack" |
| `card_play_skill` | a held "ooh" chord | a hi-hat roll "ts-ts-ts" | a filter sweep with a reverb tail | a long warm bass note with a hum |
| `card_play_power` | a rising "aah" with a shimmer | a beat drop: "boots cats" and a throat-bass drop | a synth riser into a sub thump | a deep bass swell and an amp hum |
| `swap` | a sung "la" | a lip snare "pff" | a "vwip" filter blip | a low "bwom" |
| `hero_down` | a soft "ooh" that cracks and fades | a beatbox that deflates "pfffft" | a tape stop winding down | a bass note detuning down |
| `hero_revive` | a rising "ahh" into a trill | a "boots and cats" restart | a tape start winding up | a slap and a rising slide |

### 10.9 Mixing (re-measured, never guessed)

New tool `tools/hocus_vocus/mix.mjs` (Playwright, the same browser the shot tool uses): renders every track through an
`OfflineAudioContext` with `AUDIO.render`, solo per track, measures A-weighted momentary loudness and writes the trims between
`MIX-BEGIN` and `MIX-END` (target per role type: lead and theme -24, bass -26, beat parts -27, pads -30, sparkle -32 dBFS RMS at default
sliders, trims clamped 0.15 to 4); with `--sfx` it renders every recipe and variant and prints the `vol` that puts its peak on the ranked
target (hover -30, click -24, card -20, hits -16, crits -12, Headliner moments -10 dBFS); with `--samples` it measures the owners' files
against their synth recipe and prints the suggested manifest `vol` (section 11). Acceptance: at the default sliders the score sits at -25
to -28 dBFS RMS in a fight and -28 to -31 in calm scenes, peaks under -3 dBFS, big sfx duck it, the Human theme is clearly the loudest line
of `final` layer 2.

### 10.10 Audio tests that change (`tests/hocus_vocus_audio.test.mjs`)

- Helpers: `SCALE` becomes the seven scales of 10.3; voice and scale lists (lines about 43 and 44) assert the new band and scale names.
- "the camp track has a crackle bed" stays; "title has a slow grand shakuhachi over a pad" becomes "title has a croon melody over a keys
  pad"; "hero select: warm koto melody" becomes "hero select: a whistle melody".
- Recipe checks: `relic_get` has at least 4 `glock` layers and a `vox` layer; `level_up` rises with at least 4 `glock` notes; `chest_open`
  has a zip (noise sweep) and at least 3 `glock` layers; `brush_pick` is a three-note glock motif with a whispered vox (replaces the
  shakuhachi check); `vox` is still a voice; new: every variant key `id.hero` names a `LISTS.sfx` id and a `LISTS.heroIds` id.
- A12 (consonance) runs over `penta` and `pentaMinor`; new checks: `beat` grids are 16 steps and expand into one track per used voice;
  `theme` tracks play the motif exactly; `quant` decks start with swing 0 and reach `swing.to` at drive 1; the Human theme's scoop and the
  late kick are present in `final`.
- The MIX length check stays (regenerate with 10.9).

## 11. The sample hook: the owners' real beatbox and vocal recordings

### 11.1 Folder and manifest

- Files go in `hocus_vocus/audio/` (the build copies the whole `hocus_vocus` folder, so `dist/hocus_vocus/audio/` exists after
  `node build.js`; verify once). File names: lowercase letters, digits, `_` and `-`, for example `kick_soft.m4a`. Give a replaced file a
  new name (`kick_soft_v2`) so no cache serves the old one.
- The manifest is one data file, `js/data_samples.js` (a `data_*` extension file: one IIFE, loaded after `js/data_meta.js` and before
  `js/art.js`; added to `index.html`, `gallery.html` and `DESIGN.md` section 3). It ships empty, so today's build fetches nothing:

```js
// js/data_samples.js: the owners' optional recordings. Empty means every sound is synthesised (and no file is ever requested).
(() => {
  'use strict';
  DATA.SAMPLES = Object.freeze({
    version: 1,
    base: 'audio/',                 // relative to hocus_vocus/index.html; never a URL
    formats: ['m4a', 'ogg', 'mp3'], // the loader picks the first one this browser can decode, and tries the next on failure
    preload: 'idle',                // 'idle': load in the background just after the first tap; 'lazy': load on first use
    maxSeconds: 120,                // decoded audio budget for all files together
    gain: 1,                        // one trim for every sample
    sfx: {
      // 'hit_light': 'kick_soft',                                   // a file name without extension: audio/kick_soft.m4a
      // 'card_play_attack.kuro': { files: ['bk_1', 'bk_2', 'bk_3'], vol: 0.9 },   // round robin, a per-hero variant
    },
    spells: {},                     // DATA.brushes ids: plays on the first cell instead of the synthesised gesture
    syllables: {},                  // vox syllables: boots cats ts pf k bwaa ab ra ca tada hey boom, vowels oo ah mm
    stingers: {},                   // victory, defeat, boss_intro, phase_change: played over the music, which ducks under them
  });
})();
```

- Entry: a file name, or `{files: [names], vol (0 to 2, default 1), midi (the note a sung syllable was recorded at), var (cents of
  random pitch per play, default 0), start, end (seconds, to trim)}`.
- Keys: `sfx` keys are `LISTS.sfx` ids or `id.heroId` (a variant); `spells` keys are `DATA.brushes` ids (`stroke wave fan splash halo
  blot`); `syllables` keys are the vox syllables and vowels listed; `stingers` keys `victory defeat boss_intro phase_change`.
- Validation (in AUDIO at init, `js/audio.js`, owned by HV_PHASES 8A; `DATA.audit` in `js/data.js` is not touched): a name matches `^[a-z0-9][a-z0-9_-]*$` (no dot, slash, colon or space, so no
  URL, no folder escape); unknown keys, a bad hero suffix and a bad name are reported and skipped, never thrown.

### 11.2 The loader

- Nothing happens before a real `AUDIO.init` (the first tap or key), and nothing at all when the manifest is empty. The loader runs
  only after an init that actually started audio: a plain headless boot (`window.__HEADLESS`, where `init()` returns false) never
  fetches (S8), while `AUDIO.init({force: true})` in a headless boot (the existing switch the audio suite already uses) enables it, which
  is how block S drives it.
- `preload: 'idle'`: 1.5 s after init, load every listed file in the order ui, cards, hits, map, the rest, at most 2 at a time;
  `'lazy'`: a key loads the first time it is asked for (that play uses the synth).
- Each file: `fetch(base + name + '.' + format, {credentials: 'same-origin', cache: 'force-cache'})` (the only `fetch` in the fork, with
  `// hygiene-allow(network): same-origin sample files the owners list in DATA.SAMPLES, never a URL`), check `ok`, `arrayBuffer()`,
  `ctx.decodeAudioData` (promise form, with the callback form for older Safari). The format is the first in `formats` for which `new
  Audio().canPlayType` says `probably` or `maybe` (the element is created only to probe the format; nothing ever plays through it); a failed fetch or decode tries the next format, then marks the key `failed`.
- State per key in a `Map`: `loading`, `ready` (with its `AudioBuffer` list and a round-robin index), or `failed` (never retried this
  session, one `console.warn` per key). Decoded seconds are added up; past `maxSeconds` the remaining keys stay synth and one warning says so.
- `file://` pages cannot fetch: everything stays synth (owners test samples through a local server or the deployed site).

### 11.3 Playback and fallback

- `AUDIO.sfx(id, o)`: the key is `id + '.' + o.hero` when that variant is ready, else `id` when ready, else the synth recipe exactly as
  today. A sample plays through an `AudioBufferSourceNode`, a gain of `R.vol * entry.vol * SAMPLES.gain * o.vol` (the measured recipe level,
  so a sample sits where its synth sat), and the panner, into the sfx bus. The base id's cooldown, priority, voice cap and duck all apply,
  and a sample counts as one live source. `playbackRate` carries `o.pitch` and the entry's `var` (0 by default: recordings are not detuned).
- Syllables: the vox voice plays a ready syllable sample re-pitched by `playbackRate = 2^((midi - entry.midi) / 12)` when that is within
  7 semitones; outside it, or without `midi`, the synth syllable plays.
- Spells: on the first cell, a ready `spells` sample replaces the synthesised gesture (the per-cell melody notes still play, so the map
  still sings).
- Stingers: a ready stinger plays with the matching sfx and ducks the music for its length.
- New `AUDIO.samples()` lists `{key, state, files, seconds}`; `AUDIO.preview(id, {synth: true})` plays the synth version for an A/B.

### 11.4 Volume

The Effects slider governs every sample (they all run on the sfx bus, stingers included). Owners export each file peak-normalised to
-1 dBFS, trimmed tight at the start (no silence before the sound), mono unless the stereo matters; the engine then scales by the recipe's
measured level, the entry's `vol` and `SAMPLES.gain`. `node tools/hocus_vocus/mix.mjs --samples` prints a suggested `vol` per entry.

### 11.5 Mobile autoplay

Samples never play through an `HTMLAudioElement` (one is created only to probe `canPlayType`, 11.2): everything goes through the one
`AudioContext`, which is created on the first gesture and woken
by the existing click, keydown and pointerup hooks (iOS). Decoding works while the context is suspended, so a file can be ready before the
first sound; nothing is fetched before that first gesture, which also keeps the page from downloading audio a visitor never hears.

### 11.6 Caching and memory

HTTP caching does the disk side (`force-cache`, and versioned names); decoded buffers stay in memory for the session and are never
decoded twice; a failed key is not retried until the next page load; `maxSeconds` (120 s, about 20 MB at 44.1 kHz mono float) caps memory.

### 11.7 Headless tests

A new block S in `tests/hocus_vocus_audio.test.mjs`. The lib's WebAudio stub already has `createBufferSource` and `decodeAudioData`, and
its `fetch` throws (banned), which S1 and S8 rely on: any request would fail the test. S2 to S5 boot headless, call `AUDIO.init({force:
true})`, replace `fetch` on that one boot's page global with a recording spy that resolves or rejects on demand, and override the page's
`Audio.prototype.canPlayType` (the lib stub returns `''`, so no format would ever be chosen) to return `'probably'` for `audio/mp4`
(m4a) and `''` otherwise.

| Test | Asserts |
|---|---|
| S1 | the shipped `DATA.SAMPLES` is valid and empty; init on the stub makes zero `fetch` calls |
| S2 | with a fake manifest `{sfx: {hit_light: 'kick'}}`, nothing is fetched before init; after init and 2 s of virtual time exactly one fetch to `audio/kick.<format>` |
| S3 | while loading, `AUDIO.sfx('hit_light')` schedules the synth recipe, never a buffer source |
| S4 | after the stubbed decode resolves, `AUDIO.sfx('hit_light')` creates one buffer source reaching the sfx bus through the expected gain; cooldown and duck still apply; a `.kuro` variant wins when `{hero: 'kuro'}` is passed |
| S5 | a rejected fetch and a decode error each mark the key `failed`, warn once, keep the synth, never throw |
| S6 | validation rejects `http://x/a`, `../a`, `/a`, `a b`, `a.ogg` (a dot), an unknown sfx id and a non-hero suffix |
| S7 | hygiene: the only `fetch(` under `hocus_vocus/js` is in audio.js with the pragma, reached only from the sample loader |
| S8 | a `__HEADLESS` boot with a plain `init()` (no `force`) never fetches, whatever the manifest says |
| S9 | syllable re-pitching beyond 7 semitones falls back to the synth |

### 11.8 For the owners (a short `hocus_vocus/audio/README.md`, written in the same phase)

1. Record each sound dry (no reverb), trim the silence at the start, export as `.m4a` (best on iPhone) or `.ogg`, peak at -1 dBFS.
2. Put the files in `hocus_vocus/audio/`.
3. List them in `js/data_samples.js`, for example `sfx: { hit_light: 'my_kick' }`; a list of names plays them in turn.
4. Run `npm run check`, then open the game through a local server and play: anything missing or broken simply stays synthesised.
5. The full key list (73 sound ids, the variants, the Spells, the syllables, the stingers) is in this plan, 10.7, 10.8 and 11.1.

## 12. Phases and work split (art and audio)

The overall phase order belongs to the master plan; these are the art and audio units, each one PR, each green on `npm run check`, each
with its acceptance shots looked at. Data-only phases elsewhere are unaffected (no art or audio unit changes DATA mechanics).

| Unit | Agents | Files | Depends on | Gate (besides the suites) |
|---|---|---|---|---|
| A1 the cast | 1 (main session: it swaps a contract) | `js/art_cast_kit.js`, `js/art_cast.js` (new), delete `js/art_heroes.js`, `index.html`, `gallery.html`, `DESIGN.md` 3 and 5.6, the 8 tests that list `art_heroes`, `tests/hocus_vocus_art_core.test.mjs` hero section, new `tests/hocus_vocus_art_cast.test.mjs` | none | 2.13 |
| A1b the foe kit | 1 | `js/art_cast_kit.js` (4.2) | A1 | `foe_kit` sheet: eyes, mouths, Gloss smile, sheen, win-over strip |
| A2 outfits | 1 | `js/data_meta.js` (`DATA.outfits`), `js/ui.js` (load, store, push), `js/screen_menu.js` (picker), `js/screen_end.js` (new outfit card), `css/menu.css`, `css/end.css` | A1 | picker at 3 viewports; outfit visible in combat, map, title, share card |
| A3a logo, title, end scenes | 1 | `js/art_scenes.js` (logo, monogram, `title`, `victory`, `defeat`, `paper`), `js/screen_menu.js` logo call and fallbacks, `css/menu.css` tag | A1 | 3.1, 3.2 |
| A3b Act and node scenes | 1 | `js/art_scenes.js` (`ch1 ch2 ch3 boss1 boss2 boss3 camp shop event treasure`) | none | 3.3 |
| A4a node painters | 1 | `js/screen_node.js` painters (3.4), `css/node.css` | A1 (Jordan) | shop, Green Room, Studio, Gift Box, Sparkle Booth, goodie bag, Detour board at 3 viewports |
| A4b menu and end painters | 1 | `js/screen_menu.js`, `js/screen_end.js`, `js/ui.js` transitions, rotate panel, card back | A3a | 3.4 rows |
| A5 map | 1 | `js/art_map.js`, `js/screen_map.js` (`opts.chapter`, UI picto) | A1 | section 7 |
| A6a icons: statuses, gems, tiles, intents, stats, Spells, types, rows | 1 | `js/art_icons.js` | none | 6.1, 6.3 to 6.5 |
| A6b icons: the 66 Charms | 1 | `js/art_icons.js` (relic section), `tests/hocus_vocus_art_icons.test.mjs` (the shared-motif test becomes "every Charm draws its own picture") | A6a | 6.2 |
| A7a motifs 1 to 30 | 1 | `js/art_cards.js` (grounds, foreground, curse and status looks, the first 30 motifs in `LISTS.motifs` order: `slash` to `fan`) | A1 | 5.2 |
| A7b motifs 31 to 59 | 1 | `js/art_cards.js` (the other 29: `bell` to `sigil`), `heroSprite` sticker edge | A7a | 5.2, 2.9 |
| A8 fx and combat look | 1 | `js/art_fx.js`, `js/scene.js` (`EL`, `ST_COL`, hero-tinted slash, `gloss` hand-off, particles) | A1 | section 8 |
| E1a to E3c enemies | 9 (at most 3 at once, one per file) | `js/art_enemies_1.js`, `_2.js`, `_3.js` | A1b | 4.6 |
| A9 UI skin | 1 | `css/*.css`, `index.html` boot and favicon, `gallery.html` favicon, `js/art.js` new `pal` keys | none | 9.2 |
| A10 cover and site card | 1 | `tools/hocus_vocus/cover.mjs`, `hocus_vocus/cover.webp`, `hocus_vocus/cover.webm`, root `index.html` | every art unit | the poster and clip look right on the index |
| S1 voices, scales, composer | 1 (main session: audio engine) | `js/audio.js` (10.2, 10.3) | none | audio suite green with the new voice and scale checks |
| S2 scores and mix | 1 | `js/audio.js` (`TRACKS`, `MOTIFS`, `MIX`), `tools/hocus_vocus/mix.mjs` | S1 | listen to every track in the browser (the gallery music page or `AUDIO.music` from the console); 10.9 levels |
| S3 sfx | 1 | `js/audio.js` (`SFX_DEFS`, variants), `js/scene.js` (`hero` option) | S1 | `--sfx` levels; every id previewed by ear |
| S4 the map voice and Spells | 1 | `js/audio.js` (`SONGS`, echo key, single voice per Act) | S1 | map shot with sound: a chain sings, each Spell's gesture is recognisable |
| S5 the sample hook | 1 | `js/data_samples.js` (new), `js/audio.js` loader and playback, `hocus_vocus/audio/README.md`, `index.html`, `gallery.html`, `DESIGN.md` 3, `tests/hocus_vocus_audio.test.mjs` block S, the lib stub | S3 | 11.7 green; a hand test with one real file through a local server |

## 13. Conflicts with the other plan files, and open questions

1. Logo letter colour. Bible 1.2 says "cream letters with a thick dark outline". This plan draws HOCUS in pink and VOCUS in green with a
   cream inner rim, as on the owners' own logo and as the art brief asks ("chunky playful lettering in pink and green"). The blossom O,
   the mic-grille O and the mic-wand are exactly the bible's. Owner or bible owner to confirm; if cream is kept, only the fill colours
   in 3.1 change.
2. RawClaw's look. Bible 3.3 describes a violet hoodie with a waveform print and a little synth keyboard on a strap; the approved
   drawing (`crew.js`) is a light grey jacket over a navy hoodie, violet headphones round the neck and a violet pad sampler on a strap,
   no keytar. Art follows the approved drawing. Resolved by the plan editor: bible 3.3 and 7.1 and `HV_HEROES.md` (Synth Zap, Finger
   Drumming, the Goat Suit line) now describe the pad sampler on a strap. Card motifs never draw a keytar.
3. RoxorLoops's pants are olive green `#7fa631` and his smiley is orange in the approved drawing; the bible says green pants and a
   smiley tee: consistent, no change needed.
4. Jasmin's mic. The bible calls it a pink mic-wand; the approved drawing is a black mic with a pink band. The mic-wand (with a star)
   lives in the logo, the Spell icon and the Mic-Wand Keyring Charm; her sprite keeps the approved mic and may add one small sparkle on
   the mic head while casting. Resolved by the plan editor: bible 3.1 and `HV_HEROES.md` (Petal Note, Lean In, the Unicorn Onesie line)
   now say "pink-banded mic".
5. Hit words. The bible fixes hit words per element; most hero attacks use `slash`, so RoxorLoops's hits will read `LA!`. This plan only
   tints the fx by hero (8.2). Optional bible amendment: a RoxorLoops `slash` hit reads `PKAH!` (a word already in the bible's list).
6. Act II creature outline colour is not set in `HV_ENEMIES.md`; this plan uses the Act I navy `#22264a`.
7. The title always shows Jasmin and RoxorLoops (the owners), whatever party was last played; RawClaw and Andy appear on hero select,
   in fights and on the share card.
8. The Human theme is an original tune named after the theme of the song; it is not the owners' melody. When the owners send a recording,
   it can replace the victory stinger through the sample hook (`stingers.victory`).
9. `HV_ENEMIES.md` 5.3 asks for the heroes to fade towards pastel during the Filter form; this plan provides `ART.hero.draw(..., {gloss})`
   and the `scene.js` hand-off (4.4).
10. Andy has no outfit (bible 7.1). If the owners ask for one, it is one more cast id in `art_cast.js`, one more `DATA.outfits` entry
    (unlocked by `thunder_and_laughter`, Just Andy) and nothing else.
11. The 31 hero card illustrations wear stage clothes in every outfit (`HV_HEROES.md` 1.5), so a deck looks the same to every viewer.

