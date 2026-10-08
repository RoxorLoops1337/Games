# 07 - Scenes B: Weekend Tour, Pig Pen, Penny, Date, Mingle, Open Mic, Sleep, Training x4, Dancer, Intro Story, Tutorials, Save Slots

Source: `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx`, lines 9124-10880 (read completely).
`SlotsScreen` was read to its real end (line 11106) because it starts at 10880. Callers, `PixelScene`, `Cutscene`, `drawBeatboxer`, `drawPigPen`,
`lookFromChar`, the 7 intro PNGs and the storage layer were also read (line numbers are cited wherever they matter).
All line numbers refer to the .jsx file above. "fc" = frame counter. All coordinates are logical pixels on a 200x130 canvas unless stated.

## SUMMARY

1. The range holds 13 procedural canvas scenes (3 tour beats, Pig Pen challenge, Penny reveal, park date, bar mingle, open-mic stage, sleep, 4 training scenes) plus two figure helpers (`_drawSeatedAtBar`, `drawDancer`); every scene is built only from `fillRect` calls (`_px`), no sprite assets at all.
2. Every scene is 200x130 logical px, hosted by `PixelScene` (line 6632): canvas = 600x390 (scale 3), CSS `width:100%`, 200:130 aspect, `image-rendering:pixelated`, driven by `requestAnimationFrame` with a bare `fc++` counter, so animation speed silently depends on monitor refresh (60 Hz assumed everywhere).
3. Six scenes are story cutscenes played through the generic `Cutscene` component (tour x3, Pig Pen challenge, Penny reveal, date): `{speaker, speakerColor, beats:[{drawScene, lines[]}]}`; the other seven are embedded in gameplay panels/overlays (mingle modal, open-mic performance, sleep overlay, 4 AFK training panels).
4. The player's `look` = `{shirt, skin, hair, style, accessory}` (from `lookFromChar`, line 16597) is applied INCONSISTENTLY: only the Tour Stage, Open Mic and Musicality scenes use `drawBeatboxer` (full hair styles + accessories); the rest hand-draw the player with colours only, Technicality supports 4 hair styles, the dancer supports 5 styles but no accessories, Originality ignores `look`.
5. INTRO_BEATS is the opening story: 8 beats, 24 lines, 7 painted 480x270 PNGs (`intro-1-office.png` ... `intro-7-couch.png`, bar image reused for a blurred "wild night" beat), lit by CSS radial-gradient "lights" (percent boxes, `mix-blend-mode:screen`, named keyframes) over a 14 s Ken-Burns drift, with the procedural `intro` music track (68 BPM Am-F-C-Em); it plays when an EMPTY save slot is chosen, before character creation.
6. TUTORIALS = 11 one-shot "FOXY · TIP" pop-ups (speaker colour `#84cc16`) fired by predicates on char state, first match in array order, one per effect pass, only when no cutscene is up; each sets `storyFlags['tut_<id>']`. Code-reading bugs: `start_busk` never fires on a fresh char (cash starts at exactly 30, predicate wants `< 30`), `_sleepingNow` is never set anywhere, old saves would replay all tips.
7. SlotsScreen = 5 save slots (localStorage keys `bbs:character:slotN`, pointer `bbs:active_slot`): card per slot (colour badge, name, ACTIVE tag, Lvl/Day/$/fans, 4 stats), switch/create on tap, export-to-JSON, import-from-JSON (empty slots only), delete behind a type-DELETE confirm (CSS `uppercase` input but case-SENSITIVE compare = lowercase typing can never confirm).
8. Deleting or exporting a slot does NOT touch the per-slot recorded samples held in IndexedDB (`slotN:sample-*`): exports omit them and a new character created in a deleted slot inherits the old samples (`deleteAllSamplesForSlot` is only called from the sample-reset UI at line 5642).
9. The tour/training/date/Penny/sleep/mingle scenes have no sound of their own; the only audio cues in range are the `intro` music track (started/stopped by `Cutscene`), `playRooster()` at 85% of the sleep animation (caller, line 15455), and the open-mic performance playing the player's own sequencer patterns (caller, line 15227).
10. Rebuild strategy: bake each scene's static layers into painted backdrops (suggested 960x540, i.e. 2x the intro art), keep animated bits as small tweened sprites/particles, build ONE layered paper-doll character (body/hair styles/accessories/poses: stand+bob, dance x4, seated-at-bar, bench-sit, couch-lie, bed-sit+headphones, desk-profile, point) and drive everything by delta-time at a 60 Hz reference instead of `fc`.

---

## 0. Index of scenes in this range

| # | Scene / component | Lines | Shown by (caller) | Host |
|---|---|---|---|---|
| 1 | `drawTourRoadScene` | 9128-9252 | BarScreen "Weekend Tour" panel, cutscene beat 1 (16108) | Cutscene -> PixelScene |
| 2 | `drawTourMotelScene` | 9254-9410 | same, beat 2 (16115) | Cutscene |
| 3 | `drawTourStageScene` | 9412-9527 | same, beat 3 (16122) | Cutscene |
| 4 | `drawPigPenChallengeScene` | 9529-9606 | ParkScreen, Jam reward (14863) | Cutscene |
| 5 | `_drawSeatedAtBar` (helper) | 9608-9658 | Penny reveal, Mingle | - |
| 6 | `drawPennyRevealScene` | 9660-9722 | BattleScreen.finishBattle after 2nd Pig Pen win (18436) | Cutscene |
| 7 | `drawDateScene` | 9724-9827 | ParkScreen "MEET <PARTNER>" (14736) | Cutscene |
| 8 | `drawMingleScene` | 9829-9884 | `MingleEncounter` modal (7509) | PixelScene in a modal |
| 9 | `drawOpenMicStage` | 9886-9939 | `OpenMicPerformance` (15268) | PixelScene in fullscreen overlay |
| 10 | `drawSleepScene` | 9941-10029 | `SleepAnimation` (15472) | PixelScene in fullscreen overlay |
| 11 | `drawMusicalityScene` | 10034-10178 | HouseScreen training panel, stat `mus` (13874) | PixelScene in panel |
| 12 | `drawTechnicalityScene` | 10180-10373 | same, stat `tec` | same |
| 13 | `drawOriginalityScene` | 10375-10493 | same, stat `ori` | same |
| 14 | `drawShowmanshipScene` | 10495-10611 | same, stat `sho` | same |
| 15 | `drawDancer` (helper) | 10613-10686 | Showmanship scene only | - |
| 16 | `INTRO_BEATS` | 10688-10789 | `switchToSlot` on an empty slot (11354) | `Cutscene` image mode |
| 17 | `TUTORIALS` | 10791-10875 | App-level effect (11173-11188) | `Cutscene` text mode |
| 18 | `SlotsScreen` | 10877-11106 | App `screen==='slots'` (11517, 11676) | React/Tailwind DOM |

### 0.1 Where these scenes sit in a playthrough (trigger order and gates)

Calendar facts (lines 1060-1062, 1199-1209, 1233-1241): `dayOfWeek(day) = day % 7`, so DAY 1 = TUESDAY, day 6 = Sunday (rent day), day 7 = Monday (bar closed). Clock: `minutes` 0 = 06:00, 720 = 18:00 (bar opens at night), 1080 = 00:00, 1200 = 02:00 forced sleep. Content unlocks: bar day 3, shop day 4, mingle day 5.

1. Title screen -> SlotsScreen (section 18) -> tap an EMPTY slot -> INTRO_BEATS (section 16, 8 beats, music `intro`) -> CreateScreen -> HOOD. Foxy tutorials start as soon as the character exists and no cutscene is up (section 17).
2. Home (HouseScreen): couch tab -> Sleep scene (section 11, 4 s) / power-nap (separate scene); PC/Train tab -> the four training scenes (sections 12-15) while an AFK training block is running.
3. Park (ParkScreen): Jam Session rewards -> first-jam text beat, then PIG PEN CHALLENGE (section 5) after 3 jams or `sho >= 8`; a booked romance date turns the park into "MEET <PARTNER>" and plays the Date scene (section 8).
4. Bar (BarScreen, night only, from day 3): Tue/Wed/Thu open mic -> Open-Mic stage (section 10); Mingle (from day 5) -> bar conversation backdrop (section 9); Fri showcase / Sat battle / Sun karaoke are other scenes (not in this range). Weekend Tour panel is ALSO in the bar screen and unlocks at 50 followers with a 7-day cooldown (sections 2-4).
5. Battle (BattleScreen): winning against Pig Pen a 2nd time -> back to the bar -> PENNY REVEAL (section 7, 600 ms later).
6. Romance: certain mingle encounters (affinity >= 5, no current booking) offer a park date 2 days later "at 16:00" (`bookDate {daysAhead:2, minute:600}`, line 1741); only the DAY is checked when the park decides to show "MEET" (line 14707), the 16:00 is only mentioned in a toast.

---

## 1. Shared conventions and helpers (needed to read every scene)

### 1.1 Canvas contract
- `_px(ctx,x,y,w,h,color)` (line 2263): `fillStyle=color; fillRect(floor(x), floor(y), w, h)`. Note only x,y are floored; w/h are not (all callers pass ints, except sunR*2 in sleep). EVERY solid shape in this range is this call.
- `_drawSky(ctx,W,h,fromR,fromG,fromB,toR,toG,toB)` (2272): per-scanline linear RGB gradient, 1 px tall bands, rows 0..h-1, clamped to 255.
- `_drawDaytimeSky(ctx,W,h=50)` (2283): `_drawSky(...,0x7a,0xc0,0xe8 -> 0xaa,0xd8,0xf8)` i.e. `#7ac0e8` (top) to `#aad8f8` (y=50). Used by the Pig Pen and Date scenes; the sky occupies only y 0-50; grass starts at y 50.
- `PixelScene` (6632): `w=200,h=130,scale=3`. Each rAF: `fc++`, `ctx.save(); ctx.scale(3,3); fillRect(0,0,w,h,'#0c0a09'); draw(ctx,fc); ctx.restore()`. Draw errors are caught once per message. Because the context is saved/restored each frame, `textAlign`/`globalAlpha` leaks do not persist between frames, but they DO persist within one frame (several scenes rely on or suffer from that).
- Canvas element: `block border-2 border-stone-800`, `width:100%; aspect-ratio:200/130`, so it displays at up to the width of its container (`max-w-md` = 448 px in cutscenes, i.e. ~2.2x scale; the 600 px backing store is therefore slightly oversampled).
- Text on canvas always uses `bold Npx monospace` (sizes 4-9 px): 'TOUR', 'MOTEL', '1:47', 'LIVE', 'TOUR · NIGHT 2', '!', 'z', 'BBX-16', 'BEATBOX', Discord labels.
- Common overlay: a "vignette" = two dark bands (top 6-8 px, bottom 8-10 px) of `rgba(0,0,0,0.18-0.30)`; bar scenes use a full-frame `rgba(0,0,0,0.20)` instead.
- Timing reference: assume 60 fps. 1 frame = 16.7 ms. All `% N` loops below can be converted to seconds as N/60.

### 1.2 The `look` object and who applies what
`lookFromChar(char)` (16597) returns `{ shirt: activeOutfitShirt(char) /* outfit colour if unlocked+selected else char.color, default #D4A017 */, skin, hair, style, accessory }`.
Creation palettes (CreateScreen 11738-11747): shirt/colour `#D4A017 #CC2200 #C8DCEF #84cc16 #a78bfa #fb7185 #22d3ee #f97316`; skin `#f5d4a8 #d4a87a #a87844 #8a5a3a #5a3a20`; hair `#1a1a2e #5a3a18 #a87044 #fbbf24 #9ca3af #a78bfa`; styles `short, fade, mohawk, spike, long`; accessories (unlock-gated) `cap, beanie, shades, glasses, fedora, headphones` (ACCESSORIES 665-673).

| Scene | shirt | skin | hair colour | hair STYLE | accessory | Figure code |
|---|---|---|---|---|---|---|
| Tour road (van window) | no | yes | yes | no | no | inline 6x6 head |
| Tour motel | yes | yes | yes | no | fixed headphones (not the player's accessory) | inline |
| Tour stage | yes | yes | yes | yes (5) | yes (6) | `drawBeatboxer` |
| Pig Pen challenge | yes | yes | yes | no | no | inline |
| Penny reveal | yes | yes | yes | no | no | `_drawSeatedAtBar('player')` |
| Date (player + partner) | yes | yes | yes | no | no | inline x2 |
| Mingle (stranger, not the player) | yes | yes | yes | no | no | `_drawSeatedAtBar('player')` |
| Open mic | yes (+ sound-ring colour) | yes | yes | yes | yes | `drawBeatboxer` |
| Sleep | yes | yes | yes | no | no | inline |
| Musicality | yes | yes | yes | yes | yes | `drawBeatboxer` |
| Technicality | yes | yes | yes | short/long/mohawk/spike (fade falls back to short) | fixed headphones | inline |
| Originality | - | - | - | - | - | NO character drawn (`look` unused) |
| Showmanship | yes | yes | yes | short/mohawk/long/spike/fade | no | `drawDancer` x2 |

### 1.3 `drawBeatboxer(ctx,x,y,look,facing,active,fc)` (16468-16559) - the standing performer, reused 17 times in the file
(x = centre, y = feet.) Shadow `rgba(0,0,0,.45)` 14x1; legs `#1a1a2e` 3x8 each, alternate 1 px bob every 6 frames when active; shoes white 3x1; body `look.shirt` 10x11 (y-19..-8) with white 1 px collar; arms 2x8 shirt colour; mic-side hand (skin 2x3) at x+6 (facing right) or x-8; mic `#888`/`#aaa`; head skin 8x7; hair styles: short (8x2), mohawk (2x3 spike), long (10x2 + two 1x5 side locks), spike (3 spikes), fade (8x2 + black 1 px line); eyes `#1a1a2e` 1x1 with blink 4 frames of every 120; `shades` = 7x1 black bar, `glasses` = two 2x2 + bridge; hats: cap (red `#dc2626` + gold band + brim toward facing), beanie (black + gold band + pom), fedora, headphones (black band + red cups); mouth `#5a2020` 3x1 resting, or 3x2 `#3a1010` open on 2 of every 4 mouth frames (frame/4 %4 in {1,3}) when active. Total height about 31 px.

### 1.4 `drawPigPen(ctx,x,y,fc,pose)` (8113-8173, outside range but used by scene 4)
Stocky rival, 18 px wide x 33 tall. Black track jacket `#1a1a1a` with red side stripes `#dc2626` and grey zipper; white-soled trainers with red tops; skin `#d4a87a`; RED CAP `#dc2626` with a yellow clock face (`#fbbf24` 3x3 + two black hands = the "Big Ben" joke behind the stage name); black brim sticking out to the right; goatee `#1a1a2e`; 'smug' = squinting eyes (2x1), smirk with raised right corner, and a 4x1 skin "pointing finger" to the right; 'sad' pose exists but is NOT used by this range. `fc` is accepted but unused (no idle animation).

### 1.5 `Cutscene` (6680-6879) - the host of every story scene and the intro/tutorials
Props `{speaker, speakerColor='#D4A017', beats[], lines[], music, onComplete}`. Beats: `{drawScene?, image?, lights?, filter?, imageAnim?, lines[]}`.
- Layout: full-screen `radial-gradient(circle at center,#1c1917,#0c0a09)`, `max-w-md` column. "Skip →" top right (calls `onComplete` = ends the whole cutscene and sets the flag).
- Art: if ANY beat has `image` -> image stack mode (all images stacked absolutely in a 480:270 box, cross-fade `opacity 1.1s ease-in-out`, each wrapped in a Ken-Burns layer `introKenBurns 14s ease-in-out infinite alternate` = `scale(1)->scale(1.05) translate(-1%,-0.5%)`, lights inside the same layer so they move with the picture). Otherwise `drawScene` mode: `<PixelScene>` re-mounted per beat with a `cutFade 0.5s` (opacity 0->1 + 8 px rise).
- Speaker label: 11 px uppercase, `tracking .4em`, Bebas Neue, in `speakerColor`. Line text: Oswald 300, 20 px, `min-h 3em`, `cutFade 0.4s` per line. Button: amber "→", "OK" on the last line of the last beat. Segmented progress bar (one 2 px segment per BEAT: past `#D4A017`, current `#a8740a`, future `#3a3530`).
- Settings: `reducedMotion` removes fades/Ken-Burns/cross-fade; `fastDialogue` auto-advances every 2000 ms.
- `music` prop: `startMusic(name)` on mount, `stopMusic()` (0.5 s fade) on unmount.
- The App pauses the game clock while a cutscene exists (`setGamePaused(!!cutscene)`, 11155) and `playCutscene(props, flagPath, after)` (11157) writes `storyFlags[flagPath]=true` on completion OR skip.

### 1.6 Palette cheat-sheet (recurring colours across the range)
amber `#fbbf24` (lights, mic, notes), cream `#fef3c7` (sun, lamp, sparkle), rose `#fb7185` (neon, hearts, MOTEL), cyan `#22d3ee`, violet `#a78bfa` (default shirt), lime `#84cc16` (Foxy, driver, Sky), red `#dc2626` (van, Pig Pen), ink `#1a1a1a/#0a0a0a/#0c0a09`, navy `#1a1a2e` (hair, trousers), mouth `#3a1010`, default skin `#d4a87a`, default hair `#1a1a2e`, default shirt `#a78bfa`, wood browns `#3a2418 #5a3a28 #7a5040 #7a5030 #5a4030`, grass `#6a9a3a/#5a8a30`, tree `#3a7028/#4a8038`, bar wall `#1c1825`.

---

## 2. drawTourRoadScene - Weekend Tour beat 1 "the road"  (lines 9128-9252)

**What / when.** First of three beats of the out-of-town Weekend Tour cutscene. Triggered from BarScreen "Weekend Tour" panel (16081-16149): gated by `followers >= 50`, 7-day cooldown (`lastTourDay`), `energy >= 30`; button `'🚐 GO ON TOUR (-30⚡, +2 days)'` (cooldown label `'🚐 ON THE ROAD COOLDOWN · Nd'`; red "Need 30 energy"). The state change is applied BEFORE the cutscene (day+2, minutes=0, cash `60+sho*4+rand(0..29)`, fans `6+floor(sho/2)+rand(0..5)`, energy set to `floor(maxEnergy*0.7)`, hunger-30, mood+8, `lastTourDay=c.day`), then `go('hood')` and the cutscene fires 100 ms later. `tourLook = lookFromChar(char)`.

**Story intent.** Golden-hour road trip: tour van with gear on the roof heading toward a distant skyline; the player is a silhouette in the middle window.

**What is drawn (back to front).**
- Sky: `_drawSky` y0-70, top `#ff9040` -> bottom `#603080` (orange to violet).
- Sun: `#fef3c7` 22x14 at (144,56) + halo circle r22 at (155,60) `rgba(254,243,199,.30)`; half hidden by skyline.
- Skyline: 16 slabs, x=13*i, width 11, heights `10+((7i+3)%26)` = 13,20,27,34,15,22,29,10,17,24,31,12,19,26,33,14, colour `#1a1a25`, bottom at y=70; 1x1 lit windows `#fbbf24` where `(i+w)%3===0` (w=0..2 at x+2+3w, y=top+4+6*(w%2)).
- Ground: haze strip `#3a2a30` y70 h2; asphalt `#1a1a20` y72-130; shoulder line `#5a5050` y72, kerb `#3a3030` y128 h2.
- Lane stripes: 14 cream `#fef3c7` dashes, `x=28i - ((fc*4)%28)` (scroll left 4 px/frame = 240 px/s), width `12+16*(i/14)`, height `1+floor(3*i/14)`, y `80+floor(38*i/14)`. Only i=0..7 are on screen (y 80-99, 12-20 px wide); the "perspective" is a diagonal fake, not a vanishing point.
- Telephone poles `#3a2818` 2x30 at y50 + 10x1 cross-arm at y52; x = `60i - ((fc*3)%60) + 180` (scroll left 3 px/frame, 60 px spacing, 1-2 visible on the right).
- Van (fixed at vx=50, vy=86+bob; bob = 1 px down for half of every 21-frame cycle `sin(fc*.3)>0?0:1`):
  - body `#dc2626` 76x26, 3 px top and bottom shade bands `#7a1010`; stepped cab nose to the right (8x22 at +76, 4x18 at +84, 2x14 at +88) for a sloped hood.
  - 3 side windows `#1a2030` 18x10 at +6/+26/+46 (y+4) with 1 px `#3a4050` top reflections and `#1a1a1a` 2 px mullions at +24/+44.
  - Player silhouette in the middle window: head skin 6x6 at (+32, +6+hbob), hair 6x3 above, two 1x1 eyes `#0c0a09`; hbob = `sin(fc*.18)>0?0:1` (about 1.1 s cycle).
  - Driver in cab window: head `#84cc16` 5x5 at (+78,+10), hair `#1a1a2e` 5x2.
  - Decal text 'TOUR' `#fef3c7` bold 7px monospace centred at (+38,+22).
  - Headlight: cream 2x4 at (+88,+16) and a translucent triangle cone `rgba(254,243,199,.20)` to (+130,+6)/(+130,+30).
  - Tail light 2x4 `#dc2626` at (+0,+16): INVISIBLE (same colour as the body).
  - Wheels `#0a0a0a` 12x8 at (+8,+22) and (+64,+22), 6x4 hub toggling `#3a3a3a`/`#5a5a5a` every 4 frames to fake spin.
  - Roof gear: speaker case `#1a1a1a` 18x8 with amber cone `#fbbf24` 6x4; duffel `#3a2818` 24x6 with `#5a3828` top edge; mic case `#1a1a1a` 14x8; strap `#5a5a5a` 64x1 along the top plus two anchor dots.
  - Exhaust: 3 puffs `#a8a29e` 4x3 at (vx-6-4i, vy+22), alpha `0.5*(1-ph/30)` with `ph=(fc+12i)%36`, hidden for ph>=30 (they fade in place, they do not drift).
- Vignette `rgba(0,0,0,.20)` top 6 / bottom 8.

**Text** (speaker `WEEKEND TOUR`, colour `#fbbf24`): "Two days on the road. Two cities, two crowds." / "Sun going down behind the skyline. Speakers strapped tight." **Sound**: none.

**Rebuild notes.** Paint a layered backdrop: sky+sun+skyline (static), road (scrolling tile), poles (parallax layer, repeating), van (single sprite with 2-frame bounce + wheel-spin + exhaust particle emitter + the player-in-window as an overlay sprite so the look can be composited). Fix the invisible tail light and the fake-perspective stripes (use a tiled dashed line moving at 240 px/s equivalent). The text says "bus" in beat 2 while the art is a van - pick one.

---

## 3. drawTourMotelScene - Weekend Tour beat 2 "the motel"  (lines 9254-9410)

**What / when.** Beat 2 of the tour cutscene (caller 16115). Night, cheap motel room, 1:47 am, player practising the set with headphones.

**What is drawn.**
- Wall `#3a2a18` y0-95 with wallpaper lines every 6 px alternating `#4a3520`/`#2a1a08`; trim `#5a3a20` at y94; carpet `#3a4828` y95-130 with 24 flecks `#2a3818` (2x1) at x=`(9i+3)%200`, y=`96+8*(i%4)`.
- Window (110,14) 70x50, sky `#0a0a18`, frame `#1a1a1a` 1 px with a cross at x=144 and y=38; 8 distant rooftops `#1a1525` (7 wide, heights 4-13); 8 stars `#fef3c7` blinking `((fc+7i)%100)<60`.
- Neon "MOTEL" across the street: post `#3a3a3a` 2x14 at (150,50); frame `#1a1a1a` 30x24 at (138,26), inner `#3a1010`; text 'MOTEL' `#fb7185` bold 8px monospace centred (153,41); glow circle r24 alpha `.3*flick`; flicker = alpha 1.0 for 80 of every 90 frames, else 0.4 (applies to sign, post, glow). Pink room tint `rgba(251,113,133,0.10*flick)` rect (80,50,100,50).
- Bed (bx=6, by=76): frame `#5a3a28` 80x22 + `#7a5040` top; mattress `#fafafa` 72x14; blanket `#a87a48` (highlight `#c89a68`); pillow `#fafafa` 18x8; headboard `#3a2418` 80x8 above.
- Nightstand `#3a2418` 14x14 at (92,84); lamp base `#3a3a3a`, shade lit `#fef3c7` 10x8 at (94,68); glow circle r28 `rgba(254,243,199,.18)` at (99,74).
- Dresser `#3a2418` 60x14 at (124,100); TV `#1a1a1a` 48x16 at (130,84) with screen `#0a0a0a`; static = 28 single-pixel specks moving each frame (`x=tvX+3+((13i+3fc)%42)`, `y=tvY+3+((7i+fc)%10)`, colours cycle `#fafafa/#7a7a7a/#3a3a3a`); two rabbit-ear antennas `#3a3a3a` 1x8 at +14/+34.
- Open suitcase on the bed `#1a1a1a` 32x6 at (30,72) with a red shirt `#dc2626`, lime shirt `#84cc16`, amber headphones `#fbbf24`.
- Player (ppx=28, ppy=72) sitting on the bed edge: legs `#1a1a2e` 3x12 hanging down to y=102 with white shoe lines; torso `look.shirt` 10x11 with white collar; one arm down (2x10 + skin hand), one arm raised to the ear (2x6 + 4x2 + skin hand); head skin 8x7, hair colour 8x3 on top (no style); BLACK headphones (cups 1x4 each ear, headband 10x1 + gold `#fbbf24` 10x1); closed eyes 2x1 `#0c0a09`; smirk 3x1 `#3a1010`.
- Music notes: 3 amber 2x2 heads + 1x2 stems, `ph=(fc+24i)%90<70`, alpha `1-ph/70`, rise `ph*0.5` px from (ppx+8+6i, ppy-6) with horizontal wobble `sin((fc+20i)*.1)*2`.
- Wall clock above TV: `#1a1a1a` 16x8 at (154,70), inner `#0a0a0a`, text '1:47' `#fb7185` bold 5px.
- Vignette `rgba(0,0,0,.30)` top 8 / bottom 10.

**Text**: "Bus seats. Cheap motel. Better sound system than home." / "1:47am. Headphones on. Going through tomorrow's set one more time." **Sound**: none.

**Rebuild notes.** Static room painting; animated: neon (opacity flicker + glow), TV static (small shader/tiled 3-frame noise), stars, notes particle emitter. The player here should be the shared paper-doll "sit on edge of bed, headphones, hand to ear" pose (apply hair style and let the headphones accessory art be reused; today hair style is ignored).

---

## 4. drawTourStageScene - Weekend Tour beat 3 "payday stage"  (lines 9412-9527)

**What / when.** Beat 3 (caller 16122): headline night on a bigger stage; the reward line shows the rolled payout.

**What is drawn.**
- Back wall `#0a0612` y0-90. Ceiling truss `#1a1a1a` (4,6) 192x4 with 16 cross ticks `#2a2a2a` (2x4 at 6+12i); 5 hanging spot housings `#3a3a3a` 6x4 + lens `#1a1a1a` 4x2 at x=16+40i.
- 3 spotlight cones (triangles from y14 to y92, +-26 wide at the base) at apex x 36 pink `rgba(251,113,133,.16)`, 100 amber `rgba(251,191,36,.18)`, 164 cyan `rgba(34,211,238,.16)`; all sway together `sin(fc*.04)*14` px (about 2.6 s cycle).
- Haze: 8 horizontal 2 px white bands, alpha .10, y60-88 every 4 px.
- Stage deck `#1a1a1a` y90-96 with `#3a3a3a` top edge; 24 front-lip lights 4x2 at x=4+8i, y91, amber `#fbbf24` when `((fc+4i)%30)<18` else `#3a2818` (chasing pattern).
- Speaker stacks at x=4 and x=180 (16x22 `#1a1a1a`, two `#3a3a3a` 12x8 cones, amber 8x2 labels).
- Banner (60,18) 80x18 `#1a0d28` with `#3a2058` lines; text 'LIVE' `#fbbf24` bold 9px at (100,30) and 'TOUR · NIGHT 2' `#a78bfa` bold 4px at (100,35).
- Crowd: 4 rows, row r at baseY=100+6r, alpha `1-0.15r`, `22+2r` head-blocks `#0a0510` of size `5+(r%2)` at x=`(9i+4r)%200-2` (no bodies, heads only); in rows 0-1, when `sin((fc+11i+6r)*.07)>0.3`, two 1x4 raised arms on the sides of the head (about 1.5 s wave).
- 6 phone screens, white 1x2, drifting right 1 px / 10 frames (`x=20+((30i+(fc/10|0))%160)`, y=92+4(i%3)), visible `((fc+15i)%80)<60`.
- Mic stand centre: pole `#1a1a1a` 2x22 at (99,70), mic head `#2a2a2a` 8x6 + amber `#fbbf24` 6x4 grille.
- Player: `drawBeatboxer(ctx,86,92,look,'right',true,fc)` (standing on the deck, just left of the mic; full look incl. style + accessory; active = leg bob + mouth animation).
- Confetti: 18 pieces 2x2 in `#fbbf24 #fb7185 #22d3ee #a78bfa #84cc16`, x=`(13i+4)%200` fixed, falls linearly y=6->106 over 180 frames then loops.
- Lens flare: circle r28 at (100,60), `rgba(254,243,199, 0.20+0.15*sin(fc*.12))` DRAWN OVER the mic and the player's head (washes them out up to 35 %).
- Vignette `rgba(0,0,0,.30)` top 6 / bottom 8.

**Text**: "Lights. Confetti. People who came just for you." / "`+$<cash> · +<fans> fans · two days gone.`" **Sound**: none (no crowd cheer).

**Rebuild notes.** Hero shot: painted venue with a cheering crowd (2-3 depth layers with a looping hand-wave animation), animated light cones as additive sprites, confetti as a particle emitter, banner text editable ("TOUR · NIGHT 2" is hard-coded although the tour is "two cities" and there is only ever this one stage image). Put the player at the exact stage position and let the flare sit BEHIND the player.

---

## 5. drawPigPenChallengeScene - Pig Pen's challenge at the cypher  (lines 9529-9606)

**What / when.** Rival intro cutscene. Fires from ParkScreen `Jam Session` `onReward` (14854-14872) once (`storyFlags.pigPenChallenged`) when `jamCount+1 >= 3` OR `sho >= 8`, after the first-jam beat has been seen.

**What is drawn.**
- Daytime park: `_drawDaytimeSky(W)` (y0-50), sun `#fef3c7` 10x10 at (16,8) + halo circle r14 at (21,13) alpha .30, grass `#6a9a3a` y50-130 with 24 blades `#5a8a30` (1x2) at x=9i, y=52+4(i%4).
- 5 background trees every 38 px from x=5: canopy `#3a7028` 16x8 at y38, `#4a8030` 12x4, `#5a9038` 6x4, trunk `#3a2410` 2x6 (blocky, 3 tiers).
- Cypher crowd silhouettes: 14 people at x=4+14i+(i%2)*4: head `#a87844` 4x4 at y60, torso 6x8 in one of `#a04040 #5a7050 #a06030 #4060a0 #a06090`, hair cap `#3a2410/#1a1a2e/#5a3010` 4x1; 1 px head bob (`sin(fc*.1+.5i)*.5`, 63-frame cycle).
- Dirt circle: ellipse `#a89060` centre (100,106) rx80 ry18, rim stroke `#7a6a48`, 8 speckles.
- Pig Pen `drawPigPen(ctx,138,110,fc,'smug')` on the right (cap, pointing finger toward the player).
- Player on the left (inline, NOT drawBeatboxer), facing him: body `look.shirt` 12x14 at (60,100) w/ white collar, arms 2x8 at x58 and x72 with skin hands, head skin 8x11 at (62,89), hair colour 8x3 on top, eyes 1x1, mouth 4x1 `#3a1010`, legs `#1a1a2e` 4x8 + white shoe lines at y114-122.
- Shouting marks: two red `#dc2626` bold-8px '!' (right-aligned at (122,76) and (119,70)), visible `fc%30<22`.
- Heat lines: two amber 1x3 ticks at (134,70) and (142,68), visible `fc%12<6`.

**Text** (speaker `PIG PEN`, `#fb7185`, flag `pigPenChallenged`): "yo. you. new face." / "you sound like you been practicing in a closet." / "saturday. bar. you and me." / "don't bring a friend. you'll need 'em on the way home." **Sound**: none.

**Rebuild notes.** Reuse a shared "park" background kit (also used by the Date scene and `drawBjarneCypherScene`, which is outside this range). Pig Pen is a real character art asset (also needed seated at the bar). The scene is a static "face-off": give Pig Pen an idle (head tilt/finger jab) loop and a player idle; the '!' marks should become comic-style SFX bubbles.

---

## 6. _drawSeatedAtBar (shared figure helper)  (lines 9608-9658)

`_drawSeatedAtBar(ctx, x, counterY, look, fc, who)` draws head+torso+hands ONLY (counter hides the legs); `fc` is unused (static).
- `who==='pigpen'` (the Penny reveal): slumped, 14x16 black jacket `#1a1a1a` (top `#3a3a3a`), red side stripes `#dc2626` x+-7, grey zipper `#5a5a5a`; arms resting on the counter 4x4 `#1a1a1a` with 2x1 skin hands; head `#d4a87a` 10x8 low (counterY-26); red cap `#dc2626` 12x4 with highlight `#fb7185`, shadow `#7a1a14`, brim `#1a1a1a` 4x1, gold clock `#fbbf24` 3x3 + two black pixels; eyes cast down (2 dots at counterY-21) `#1a1a2e`; flat mouth `#3a1010` 3x1; goatee `#1a1a2e` 2x1. Pose = "sad, head down".
- else (player, and ALSO every mingle stranger): torso `look.shirt` 10x16 with white collar, small arms 3x4 + skin hands, head skin 8x8 at counterY-25, hair 8x3 on top, 2 eyes, 3x1 mouth. Neutral.

Rebuild: two seated half-figures (bust above a counter) with at least neutral/listening/talking variants; Pig Pen needs a "sad into the whiskey" pose.

---

## 7. drawPennyRevealScene - Pig Pen at the bar after losing  (lines 9660-9722)

**What / when.** Emotional beat after the player beats Pig Pen for the 2nd time (`pigPenWins===2 && !pennyReveal`): BattleScreen.`finishBattle` (18395-18447) goes to the bar then fires the cutscene 600 ms later (flag `pennyReveal`).

**What is drawn.**
- Bar back wall `#1c1825` y0-60 with a dot pattern `#2a1f1a` (1x1 every 14x12).
- Shelf 1 `#3a2418` y14-28 (top `#5a3818`, bottom line `#1a1408`) with 10 bottles x=8+18i, 4x9, colours cycle `#a04040 #5a8030 #fbbf24 #22d3ee`, black caps; a white 1x1 glint on each bottle for 4 frames of every `40+3i`.
- Shelf 2 y28-42 with 8 bottles x=14+22i (4x10, `#5a3a40 #3a5060 #7a3a20`).
- Counter: top `#7a5030` y96-100 (edge `#a07050`), face `#5a3a18` y100-104, front `#3a2010` y104-126; 6 glints `#a07050` on the top.
- Hanging bar lamp x=110: cord `#1a1a1a`, shade `#3a2818` 11x4, bulb `#fbbf24` 9x2; warm halo circle r36 `rgba(254,243,199,.12)` at (110,22).
- Player seated at x=60 (`_drawSeatedAtBar` player), Pig Pen seated at x=116 (pigpen / sad).
- Drinks: player glass (56,88) `#3a3a40` with cyan `#22d3ee` liquid; Pig Pen glass at (124,88) half-empty amber `#fbbf24`; an extra empty glass at (132,90); coaster ring `#5a3a18` at (134,97).
- Full-frame dim `rgba(0,0,0,.20)`.

**Text** (speaker `PIG PEN`, `#fb7185`): "you again. sit down." / "..." / "y'know my mum used to call me Penny." / "...don't tell anyone that." / "call me Penny too if you want. just... not in front of the others." **Sound**: none. (The second line, "...", is a deliberate silent beat - keep it as its own tap.)

**Rebuild notes.** This is the same bar backdrop as the Mingle scene (section 9): paint once, reuse. Quiet, intimate: consider a slow camera push-in and one subtle motion (lamp sway/bottle glint). The Pig Pen "sad" bust is the emotional core; the line "Penny" implies the NPC is renamed afterwards.

---

## 8. drawDateScene - the park-bench date  (lines 9724-9827)

**What / when.** ParkScreen: if `char.dateBooking.day === char.day` a "MEET <PARTNER>" button appears; `goOnDate` (14724-14760) plays the cutscene and applies +3 affinity (>=5 -> 'romancing', >=10 -> 'couple'), +18 mood, +60 minutes, clears the booking. A missed date (`booking.day < day`) is auto-cleared with -10 mood, -2 affinity and a toast "You stood <name> up. -10 mood.".

**What is drawn.**
- Daytime sky `_drawDaytimeSky`, sun `#fef3c7` at (18,8) 10x10 + halo r14, a blocky white cloud at (100-122, 7-16) with a `#dadada` underline, grass `#6a9a3a` y50-130 with 24 blades at y=56+6(i%3).
- Tree on the left: canopy `#3a7028` stacked rects (32,30,28x30), (28,36,36x18), (24,40,44x12), lighter patch `#4a8038` 18x8 at (36,46), trunk `#3a2410` 4x24 at (44,60).
- Bench centre-right: seat plank `#7a5040` 80x4 at (60,90) (highlight `#a07050`), back rail 80x2 at y78, arms `#5a3a18` 4x12 at x60 and x136, legs `#3a2410` 4x12 at x64 and x132.
- Two seated figures facing the viewer: player at x=84, partner at x=116, seat y=92: legs `#1a1a2e` 3x8 + white shoe lines, torso 10x12 shirt (white collar), arms 2x8 either side + skin hands, head 8x7, hair 8x3, 2 eyes, 3x1 smile. Player defaults (`#a78bfa`, `#d4a87a`, `#1a1a2e`); partner defaults (`#fb7185`, `#e0b890`, `#5a2010`).
- Three hearts (`#fb7185`, 3x2 + two 1x1 tips) rising from (100, 80) at 0.36 px/frame with sway `sin(fc*.05+i)*4`, alpha fade, `phase=(0.6fc+28i)%80<60`.
- 6 far crowd silhouettes at x=4+32i, y60-69 (head `#a87844` 3x3, body in `#a04040/#5a7050/#a06030`) with a 1 px bob; drawn AFTER the hearts (can overlap them).
- 6 cream sparkle pixels at x=60+12i, y=30+8(i%3) for 30 of 60 frames.

**Text** (speaker = `dateBooking.partnerName`, colour `partnerColor`): "you came." / "i wasn't sure if you would." / "...this is nice." **Sound**: none.

**Partner looks in use**: `_LUCA_LOOK {shirt:'#3a5060',skin:'#d4a87a',hair:'#1a1a2e'}`, `_MIRA_LOOK {'#a06090','#e0b890','#5a2010'}`, `_SKY_LOOK {'#fbbf24','#a87844','#dadada'}`; ParkScreen maps ONLY luca/mira/sky (14727-14730), every other partner (pascal, jin, roo exist as romance options, lines 1943-1948) falls back to `{shirt:'#a78bfa'}` = default skin/hair.

**Rebuild notes.** Needs a two-person bench pose (player + any of 6 partners, ideally a partner-look system with hair/skin variations and the PASCAL/JIN/ROO looks added). Keep the soft ambience: floating hearts, sparkles, drifting cloud. Park kit shared with scene 5.

---

## 9. drawMingleScene - bar conversation backdrop  (lines 9829-9884)

**What / when.** Backdrop of the `MingleEncounter` modal (7438-7581), opened by BarScreen's "MINGLE 🍻 (-6⚡, +30 min)" (unlocks day 5; `startMingle` 15634 picks an encounter from `MINGLE_POOL`). The modal shows the scene, the speaker's name + opener line, 2-3 reply buttons, then a "you said" box + response + effects readout + "LEAVE THE BAR CHATTER →". Text content lives in the encounter pool (outside this range).

**What is drawn.** Identical bar interior to the Penny scene (wall, 2 shelves + glinting bottles, counter at y96, hanging lamp at x=110 with shade at 105-116 and halo r36 alpha .10, full-frame dim .20) except:
- ONE seated figure (the stranger) at x=116 via `_drawSeatedAtBar(...,'player')` using the encounter look (`encounter.look` for named NPCs, else random from shirts `#a04040 #5a7050 #a06030 #4060a0 #a06090 #7a3a40 #5a3a18 #3a5a6a`, hairs `#1a1a2e #3a2410 #5a2010 #7a3a20 #dadada`, skins `#d4a87a #a87844 #e0b890 #7a5040`; shirt prefers `speaker.color`).
- Stranger's drink at (x-9,counterY-7) 5x7 `#3a3a40`, liquid colour = `['#fbbf24','#22d3ee','#fb7185','#84cc16'][encounter.id.length % 4]`.
- The player's own drink on the left (60,89) cyan; NO player figure is drawn (the player is the camera).
- No animation except the bottle glints.

**Rebuild notes.** One backdrop + one "bust at bar" character slot driven by a procedural NPC generator (shirt/skin/hair, named NPCs have fixed looks). The drink colour is an easy per-encounter prop. Consider portrait art per named NPC (Luca, Mira, Sky, Pascal, Jin, Roo, Pig Pen, Crystix, sponsors) since this is the only place they are seen at conversation time.

---

## 10. drawOpenMicStage - open-mic performance  (lines 9886-9939)

**What / when.** `OpenMicPerformance` (15198-15275), shown full-screen when BarScreen `doOpenMic` is pressed (Tue/Wed/Thu bar nights; -10 energy, +60 min). Header "🎤 OPEN MIC NIGHT" / "<NAME> · the room is yours"; footer "ROUTINE n / 2 · <pattern name>". It plays 2 random saved sequencer patterns x2 repeats each (bpm = `oriBpm+20`), through `playGameSound(track.key)`; then 700 ms later `finishOpenMic` (fans/xp/heat rewards + first-open-mic cutscene "Hot lights. A mic. Forty strangers staring back." ...).

**What is drawn.**
- Back wall `#1c1825` y0-90 with top stripe `#2a1f1a`; 7 string lights at x=12+28i, y6, 3x3 alternating `#fbbf24`/`#fb7185`, off for 10 of every 60 frames (`(fc+11i)%60<50`).
- Stage platform `#5a4030` (30,86) 140x18 with lit edge `#7a5a40`, shadow `#3a2818`.
- Mic stand: pole `#1a1a1a` 2x25 at (99,60), foot 10x1, mic head `#aaa` 6x5 with `#dadada` rim.
- Spotlight cone `rgba(254,243,199,.07)` trapezoid (80,0)-(120,0)-(140,86)-(60,86).
- Player `drawBeatboxer(ctx,100,86,look,'right',true,fc)` centre stage (full look).
- Sound rings: on `fc%4<2`, 8 single-pixel dots on a circle centred (100,70), radius `4+1.6*((0.35fc)%12)`, colour `look.shirt`, alpha `(1-phase/12)*.7` (very subtle).
- Crowd silhouettes in front: 14 columns at x=4+14i, width 10, height `14+4(i%3)`, `#1c1917` body + head `#0c0a09` 6x5, 1 px bob `floor(sin((fc+7i)*.18))`, and every 3rd person (i%3==1) raises a 1x4 hand for 12 of every 30 frames.

**Sound**: the performance audio is the player's own pattern playback (not part of the scene). **Rebuild notes**: painted bar stage + crowd layer with idle bobbing/hands-up; the performer is the shared standing performer sprite; add a per-beat reaction (the crowd could pulse to the actual step). Today the visual is not synchronised to the notes.

---

## 11. drawSleepScene - "sleep till morning"  (lines 9941-10029)

**What / when.** `SleepAnimation` (15442-15480), full-screen from HouseScreen couch tab `sleep()` (13008; refused with a toast when hunger<=0). Lasts `durationMs=4000` by wall clock; `progress` 0..1 is passed to the scene. Caption below the canvas: progress<0.4 "Drifting off…", <0.85 "Sleeping", then "🐓 Cock-a-doodle-doo" (the rooster `playRooster()` fires once when progress>0.85). On completion `finishSleep` applies the day rollover (rent, debuffs, etc.).

**What is drawn (all values are functions of `progress`).**
- Background fill (no gradient): <0.3 lerp `rgb(50,40,70)` -> `rgb(14,10,20)` (dusk to night); 0.3-0.7 `rgb(14,10,20)`; >0.7 lerp to `rgb(104,70,50)` (dawn).
- Floor `#3a2818` y100-130.
- Window (130,18) 50x42, frame `#1a1a1a` with centre bar x=154: fill `#3a2840` (<0.3), `#0a0a14` (0.3-0.7), `#fbbf24` (>=0.7, a hard colour snap to bright amber); 10 twinkling stars `#fef3c7` only 0.3-0.7 (`(fc+5i)%60<45`); rising sun square `#fbbf24` for progress>0.85, half-size `4+8t` (square drawn from x=152, top 50-sunR; not centred).
- Couch `#5a4030` 110x28 at (24,80) with lighter top `#7a5a40`, arms `#5a4030` 12x18 at x18 and x128.
- Sleeping player lying head-left: pillow `#a8a29e` 18x3, head skin 12x9 at (33,72) + hair 12x3, closed eyes 2x1 x2, smile 4x1, torso `look.shirt` 32x8 with white edge, trousers `#1a1a2e` 22x6, white feet 5x3 sticking up (chunky "log" proportions).
- Z's for 0.05<progress<0.85: 'z' `#dac0a0` bold 8px at (50+5*phase, 65-8*phase), `phase=floor(fc/24)%3`, shown 36 of 48 frames; a second smaller 'z' `#aaa` 6px at (60, zY-4) for 18 of 48 frames.
- Night darkness overlay black alpha `0.45*d` where d ramps 0->1 over progress 0.3-0.5 and 1->0 over 0.5-0.75.

**Sound**: rooster crow (caller). **Rebuild notes**: drive a time-of-day colour grade (use a Phaser tint/pipeline rather than 4 separate fills), cross-fade the window instead of snapping, ship a lying-on-couch pose (skin/hair/shirt composited), Z particle emitter, sunrise. NOTE: `PowerNapAnimation` (15280) uses a separate near-identical `drawNapScene` (outside this range) with a spinning wall clock; share the couch layer.

---

## 12. drawMusicalityScene - training "Musicality": living-room singing  (lines 10034-10178)

**What / when.** HouseScreen training panel "Training Musicality - IN PROGRESS" (13865-13879) while `trainActivity.active` and `trainStat==='mus'`, shown above the tuner UI; hidden while the pitch-tuner mini-game (`playMode`) is open. Config text: "Watch beatbox vids on YouTube" (but the scene shows singing at a mic, not YouTube).

**What is drawn.**
- Wall `#5a4848` y0-95, 1 px vertical stripes `#4a3838` every 12 px; floor `#5a3a20` y95-130 with a 1 px top `#7a5a30` and plank seams `#3a2410` every 40 px.
- Framed picture (138,14) 38x28 `#3a2410` frame / `#7a5a40` mat with three abstract bars amber `#fbbf24`, cyan `#22d3ee`, rose `#fb7185`.
- Window (16,14) 38x30 sky `#7ec0e8`, frame/mullions `#1a1a1a`, a cream sun block and a small white cloud.
- Rug `#7a3a40` (60,110) 80x16, edges `#a05060`/`#5a2a30`, 4 diamonds `#a05060` 8x8 with amber centres.
- Couch left: seat `#5a3a40` (4,78) 50x30, top lip `#7a5060`, base `#3a2030`, armrests 8x30 at x0 and x50, 2 cushions `#7a5060`, an amber throw pillow `#fbbf24` 10x6, legs `#1a1a1a`.
- Potted plant right: pot `#3a2410` 14x10 (168,92), foliage `#3a7028`/`#4a8038`; floor lamp: pole `#1a1a1a`, base 12x2, shade amber `#fbbf24` 16x6 + bottom `#a87a30`, glow circle r26 `rgba(254,243,199,.08)` at (154,88).
- TV (64,56) 60x24 `#1a1a1a`, screen `#0c0a18`; animated content: 3 concentric stroked circles (rose/cyan/amber) expanding r 2->20 with fading alpha, period 30 frames, phase offset 12 frames each, centred (94,68); TV stand `#3a2410` 32x6.
- Mic stand on the rug: disc base, pole 2x36 `#1a1a1a` (highlight `#3a3a3a`), clamp, ball mic ~6x7 `#2a2a2a` with grille lines `#444`.
- Player `drawBeatboxer(ctx,112,110,look,'left',true,fc)` facing the mic (full look).
- "Singing" waves: when `floor(fc/6)%4>=2`, 3 horizontal amber bars (width `4+phase+3i`, centred x=105, y=87..89), alpha `(1-phase/14)*.85`, `phase=(0.3fc)%14`.
- 3 cream music notes (3x2 head + 1x5 stem + 2x1 flag) rising `0.5 px/f` with sway; phase `(0.6fc+28i)%80<60`; alpha fade.

**Rebuild notes**: cosy home room painting (layers: room, TV (animated screen), lamp glow, rug), the standing performer facing a mic, particle emitters for notes/waves. The same living-room kit is probably needed by other house scenes (apt tiers) outside this range.

---

## 13. drawTechnicalityScene - training "Technicality": Discord drilling  (lines 10180-10373)

**What / when.** Same panel for `trainStat==='tec'` (config text "Drill on Discord with the squad"); hidden during the Beatbox Hero mini-game.

**What is drawn.**
- Wall `#1a1d2a` y0-95, floor `#2a1a14` y95-130 (line `#5a3a28`). Two posters: rose `#fb7185` 22x16 on `#5a3030` at (12,16) with a white stripe; cyan `#22d3ee` 24x18 on `#2a3a5a` at (162,12) with two white lines.
- Desk: top `#7a5030` (22,80) 156x4 + highlight `#a0703f`, apron `#5a3825` 156x12, legs `#3a2410` 4x24 at x26 and x170.
- PC tower `#1a1a1a` 16x32 at (152,86) with trim lines and 3 vent slits; LEDs: green `#22c55e` 1x1 at (165,100) on for 20 of 30 frames, amber `#fbbf24` at (162,100) on for 4 of 12 frames.
- Monitor: stand base `#1a1a1a` 22x2, neck 4x18, bezel `#0c0a09` 64x38 at (86,26), screen `#2b2d31` (88,28) 60x34, power LED green at (144,62) on 40 of 50 frames. SCREEN = Discord UI: left server rail `#1e1f22` 8 wide with white active pill and 4 server squares `#5865f2 #fbbf24 #23a55a #f23f42`; channel column `#2b2d31` 14 wide, white bold 4px 'BBX', channels `#gen #beat #tec #clip` (active `#beat` highlighted `#404249`, white; others `#80848e`); message pane `#313338` with header bar `#1e1f22` text '# beat' + grey '· 12 on'; 3 messages (avatar square + name + text): `crystix` `#fb7185` "sick triplet!", `rohzel` `#22d3ee` "friday is on", `alim` `#fbbf24` "roll practice" (text `#dbdee1`); a red `#f23f42` 3x2 unread badge hops to the next message every 90 frames; a 3-dot "typing" indicator (one dot brightens every 12 frames, 4-step cycle) + grey 'typing' text.
- Keyboard `#2a2a2a` 60x3 with 14 key ticks, mouse 6x4 at (130,78); coffee mug `#a8a29e` 8x6 + handle at (30,74) with 2 steam wisps (alpha `.5*(1-s)`, rise 6-8 px, 30 of 40 frames).
- Player seated at the desk facing right: tall padded chair back `#2a1a14` 14x42 (highlight `#3a2820`, seat `#1a1a1a`, stem + 5-star base); torso `look.shirt` 12x16 with white collar/left highlight; right arm 8x3 + skin hand reaching to the keyboard; head skin 10x10 bobbing 1 px every 12 frames (`floor(fc/12)%2`); hair by style (short / long / mohawk / spike; `fade` and unknown use the "short" fallback); always-on black chunky headphones (band, side wrap, ear cup 4x7 with highlight); single eye + mouth; headphone cable drawn as a 1 px `#1a1a1a` polyline from the cup to the PC tower (63,60)->(70,78)->(155,90).

**Rebuild notes**: the Discord screen is an in-world UI; paint a real monitor with an animated texture (scrolling chat), keep the names (crystix, rohzel, alim are NPC names), keep PC LEDs/steam as small loops. Player in profile at a desk with headphones is a new pose (profile, 4+ hair styles, bob).

---

## 14. drawOriginalityScene - training "Originality": the BBX-16 drum machine  (lines 10375-10493)

**What / when.** Same panel for `trainStat==='ori'` (config "Experiment, record loops"); hidden during the sequencer mini-game. `look` is accepted but NOT used (no character in this scene).

**What is drawn.** Top-down/front view of a drum machine on a dark wooden table.
- Table `#1c1410` full frame with 1 px grain lines `#2a1f18` every 12 px and a faint warm glow circle r90 `rgba(212,160,23,.05)` at (100,0).
- MPC body (24,12) 152x110 `#2a2a2a`, edges `#4a4a4a` top / `#3a3a3a` left / `#1a1a1a` right+bottom, drop shadow `#0a0a08` 4 px.
- Top plate `#1a1a1a` (28,16) 144x16; brand 'BBX-16' `#D4A017` bold 5px at (32,25); LCD (62,18) 50x12 `#0a3a14` with `#1a5a24`/`#062a0a` edges and steady text 'BEATBOX' `#22c55e` bold 7px; 3 knobs 7x7 `#4a4a4a` at x=146,155,164, y=19 with an amber 1 px pointer circling the knob (`angle=0.04fc+0.7i`, radius 2.5).
- 4x4 pad grid: pad 14x14, gap 3, grid centred in the body, y from 38. Shell `#0c0a09`/`#1a1a1a`. Row colours: row0 rose `#fb7185`, row1 amber `#fbbf24`, row2 cyan `#22d3ee`, row3 violet `#a78bfa`. A step head sweeps all 16 pads row-major at 1 step per 4 frames (`floor(fc/4)%16`, 16 steps per about 1.07 s). Fixed lit pattern (row0 `[1,0,1,0]`, row1 `[0,1,0,0]`, row2 `[1,1,1,1]`, row3 `[0,0,0,1]`): lit pads steady in their colour (alpha-.3 halo), the pad under the head flashes bright with a white top streak if it is a hit, or a 50 % dim fill if not; unlit pads show a 15 % glow.
- Step LED row at y=114: 16 LEDs 4x3 spaced 8 px from x=32, `#fbbf24` + cream top on the current step, else `#3a2810`; tiny 'STEPS' label `#5a4a30` bold 4px at (32,113).

**Rebuild notes**: a hero close-up of the in-game sequencer instrument; paint the box once, animate pad flashes + step LEDs + knob turning. It is purely decorative (not the real pattern). Note the story hook: the machine is branded "BBX-16" / "BEATBOX".

---

## 15. drawShowmanshipScene + drawDancer - training "Showmanship": dancing in front of the mirror  (lines 10495-10611, 10613-10686)

**What / when.** Same panel for `trainStat==='sho'` (config text "Stream live, work the camera"; the scene shows rehearsing in front of a mirror). This is the ONLY training scene shown even in play mode (no mini-game for sho).

**Scene.**
- Wall `#2a2335` y0-95 with dot wallpaper `#3a3045` (1 px every 12); floor `#3a2818` with seams `#2a1a10`.
- Disco ball top-centre: `#aaa` 8x8 at (96,6), highlights `#dadada`/`#888`, cord `#1a1a1a` 1x6; 6 cream glint pixels flicker (12 of 24 frames); 12 sparkle pixels (amber/cream alternating) orbit outward from (100,10) at radius `14+0.5*((fc+5i)%30)`, rotating `0.02 rad/frame`, visible 35 of 60 frames.
- Tall ornate mirror: gold frame `#7a540a` (18,26) 58x86 with `#fbbf24` top/left highlight, `#3a2410` right/bottom shadow, 3 knobs on top; glass = vertical gradient `rgb(68,74,106)`->`rgb(74,80,90)` over 78 rows; 4 faint diagonal glints `rgba(255,255,255,.10)`; reflection floor strip `rgba(58,40,24,.4)`.
- Reflection: a mirrored `drawDancer` at the mirror centre (x=47, feet y=102), alpha .85, CLIPPED to the mirror rectangle (22,30,50x78).
- Real dancer: `drawDancer(ctx,138,112,look,danceFrame,false,1)`. `danceFrame=floor(fc/8)%4` (about 7.5 fps pose change).
- 4 music notes (rose/amber alternating, same note glyph as the other scenes) rising from the dancer (`phase=(0.5fc+22i)%80<60`, y from 100 up).
- Speaker box on the floor `#1a1a1a` 18x22 at (162,100) with two woofer cones `#0a0a0a`/`#2a2a2a`, pulsing amber `#fbbf24` outline (alpha .4) for 8 of every 16 frames.

**drawDancer (10615-10686)** - `(ctx,x,y,look,frame,mirrored,scaleHint)`; `scaleHint` unused; x = centre, y = feet; `mirrored` flips every x offset. Poses by `frame` (comment vs code):
| frame | left arm | right arm | legs |
|---|---|---|---|
| 0 | up (2x6 + hand) | up | together |
| 1 | up | out/down (2x8 at +-7..9 + hand at +-9..11) | split (3 wide each, 5 apart) |
| 2 | out/down | out/down | together (comment says "arms down" - code = both arms out) |
| 3 | out/down | up | split |
Parts: shadow `rgba(0,0,0,.45)` 14x1, legs `#1a1a2e` 3x8, white shoes, torso `look.shirt` 10x11 with white collar, arms shirt colour + skin hands, head skin 8x7, hair by style (short 8x2; mohawk; long = a 10x2 band only; spike; fade), 2 eyes `#1a1a2e`, constant smile `#3a1010`. No accessories.

**Rebuild notes**: needs a 4-pose dance cycle (plus mirror) as sprite frames or a short skeletal animation; the mirror = a masked second render of the same sprite. Keep the disco ball/sparkles/speaker pulse. Make accessories show on the dancer.

---

## 16. INTRO_BEATS - the opening story  (lines 10688-10789)

**What / when.** Played by `switchToSlot` when the player taps an EMPTY slot (11349-11355): `playCutscene({ beats: INTRO_BEATS, music:'intro' }, 'introSeen', () => setScreen('create'))`. There is no speaker label. Flow: Title -> Slots -> tap empty slot -> intro -> CreateScreen (name, colour, skin, hair, style; 11736+) -> HOOD. Skipping with "Skip →" also ends it (flag set, goes to create).

**Audio**: `startMusic('intro')` (17783-17823): 68 BPM, quarter-note grid, 32-step (8-bar) loop, master volume .38 with 0.8 s fade-in; Am / F / C / Em; each bar retriggers a long slow-attack chord pad (two detuned triangle + sawtooth layers, lowpassed 900-1200 Hz) and a long sine sub bass; a sparse triangle melody (+ quiet octave-up sine) on steps `72,69,68,65,67,64,71,67` (MIDI). "Slow, gloomy, futuristic." Stopped with a 0.5 s fade when the cutscene ends.

**Presentation**: 480x270 PNG (16:9) per beat, `object-cover`, `image-rendering:pixelated`; Ken-Burns drift; cross-fade 1.1 s between beats; per-beat light overlays positioned in PERCENT of the image box (`t`=top %, `l`=left %, `w`,`h` %), each a CSS gradient with `mix-blend-mode:screen`, `pointer-events:none`, and a named keyframe animation:
- `introBreathe` opacity .78<->1 (period set per light);
- `introCyanPulse` .85<->1;
- `introMonitor` .9, 1 at 40 %, .5 at 42 %, 1 at 44 % (a sharp flicker);
- `introTvFlicker` stepped (.6,.95,.7,1,.75,.9,.6) with `steps(6)`;
- `introNeonLive` 1 with dips to .35 at 4 %/8 %, .85 at 50 %, .4 at 52 %, .85 at 54 %;
- `introNightStrobe` (on the image itself) filter `blur(4px) brightness(1.4) saturate(1.6) contrast(1.1)` <-> `blur(6px) brightness(1.8) saturate(2.0) contrast(1.2)`;
- `introStrobeA` opacity 0,0@60%,1@30% (0.4 s `steps(3)`), `introStrobeB` 0,1@50%,0 (0.5 s `steps(3)`).

Each beat = 3 lines; the 8 beats = 24 lines. Player taps "→"/OK per line (fast-dialogue auto-advances at 2 s). All text is lowercase noir narration in second person.

### Beat 1 - Office (image `intro-1-office.png`)
Art (viewed): dark blue open-plan office at night, skyline through windows left; the hooded, brown-capped protagonist stands head bowed holding a cardboard box (small plant, framed photo of two people, coffee mug), a desk lamp and cubicles around; a giant wall screen on the right shows a cyan robot-face AI chat. Cold, corporate dread.
Light: `{t:4.86,l:48.76,w:41.12,h:41.26}` radial-gradient ellipse cyan `rgba(120,190,255,.55)->0 @65%`, `introCyanPulse 2.6s ease-in-out infinite` (= the wall screen).
Lines: 1. "three years at the desk." 2. "one HR meeting. one cardboard box." 3. "they said the AI's just faster."

### Beat 2 - Bedroom (image `intro-2-bedroom.png`)
Art: sunset through venetian blinds on the right; protagonist sits hunched on the bed edge looking at a phone, cap on, hoodie, cargo trousers; the cardboard box (from beat 1) sits on the desk on the left; posters, bin, clothes on floor.
Lights: (a) `{t:1.23,l:69.12,w:26.5,h:31.5}` radial at 30% 30% orange `rgba(255,160,80,.45)->0 @70%`, `introBreathe 6s ease-in-out infinite` (the window); (b) `{t:41.26,l:40.41,w:11.3,h:10.08}` radial blue `rgba(150,210,255,.55)->0 @75%`, `introMonitor 1.6s ease-in-out infinite` (the phone).
Lines: 1. "rent's due sunday." 2. "the savings ran out tuesday." 3. "you do the math twice. it doesn't get better."

### Beat 3 - Phone close-up (image `intro-3-phone.png`)
Art: first-person hand holding a phone with a profile page (mic avatar; three small counters, roughly 312 / 1600 / 320 - partly illegible at 480 px, the line says "312 followers"; grid of video thumbnails incl. a waveform), bedroom blurred behind (window, desk with box, bin).
Light: `{t:0.43,l:26.08,w:42.15,h:94.92}` radial blue `rgba(150,210,255,.55)->0 @75%`, `introMonitor 1.6s ease-in-out infinite` (the phone screen).
Lines: 1. "you've been beatboxing in your bedroom since you were fourteen." 2. "never on a stage. never for money." 3. "312 followers. half of them bots."

### Beat 4 - Mirror (image `intro-4-mirror.png`)
Art: bathroom, the protagonist seen from behind at the sink; cracked mirror with his tired reflection (cap, hoodie); a warm bulb above the mirror; a framed family photo on the right wall; towels.
Light: `{t:-0.12,l:39.7,w:42.71,h:49.6}` radial at 50% 0% warm `rgba(255,225,170,.55)->0 @75%`, `introBreathe 4s ease-in-out infinite` (the bulb cone).
Lines: 1. "the parents would take you back." 2. "that's the worst part — they would." 3. "so you tell yourself: not yet."

### Beat 5 - Door (image `intro-5-door.png`)
Art: the bedroom at night; TV showing static on a dresser, bed left, city window; the protagonist (backpack on) opens the door to a lit hallway and stairs, hand on the knob; the box sits on the desk at right.
Lights: (a) `{t:29.57,l:26.44,w:21.59,h:23.74}` radial blue `rgba(120,180,255,.7)->0 @75%`, `introTvFlicker 1.2s steps(6) infinite` (TV); (b) `{t:3.6,l:55.4,w:22.65,h:79.38}` radial at 50% 30% warm `rgba(255,230,180,.30)->0 @70%`, `introBreathe 5s ease-in-out infinite` (hallway light through the door).
Lines: 1. "practice every day." 2. "busk till the jar fills up." 3. "and tonight — tonight you go to the cypher."

### Beat 6 - Bar exterior (image `intro-6-bar.png`)
Art: wet night street; brick bar with a big red neon "LIVE" sign, small "OPEN" sign, a vertical neon "LIVE" on the left, striped awning, silhouettes in the lit window, hydrant, car, dumpster, lamps; the protagonist stands outside, back to us, backpack, looking at the door.
Lights (10 entries, in order): 
1. `{t:73.09,l:27.9,w:53.07,h:23.13}` red `rgba(255,60,90,.55)->0 @70%` radial 50/50, `introNeonLive 1.8s ease-in-out infinite` (neon reflection on the wet pavement);
2. `{t:0.14,l:-0.04,w:100,h:100}` full-frame `linear-gradient(180deg, rgba(80,110,160,.18), rgba(40,60,100,.10))`, `anim:none` (cool street tint);
3. `{t:14.86,l:34.62,w:28.85,h:22.16}` red radial, `introNeonLive 2.4s ease-in-out -0.9s infinite` (big LIVE sign);
4. `{t:5.63,l:24.92,w:6.72,h:34.86}` red radial, `introNeonLive 1.5s ease-in-out -1.7s infinite` (vertical LIVE sign);
5. `{t:60.97,l:-0.44,w:3.79,h:3.99}` red radial `introNeonLive 1.8s` (car light, left edge);
6. `{t:55.8,l:2.76,w:5.77,h:3.68}` red radial, same;
7. `{t:60.86,l:5.9,w:3.85,h:4.61}` red radial, same;
8. `{t:33.39,l:79.57,w:8.38,h:24.65}` warm `rgba(255,225,170,.55)->0 @75%` radial 50% 0%, `introBreathe 4s` (wall lamp, right);
9. `{t:48.47,l:34.77,w:6.23,h:6.26}` red radial `introNeonLive 1.8s` (OPEN sign);
10. `{t:46.92,l:58.18,w:12.39,h:6.78}` warm radial 50% 0%, `introBreathe 4s` (lit window).
(The three "LIVE" glows run on different durations and NEGATIVE delays so they flicker out of sync - preserve that.)
Lines: 1. "the LIVE sign hums." 2. "you stand on the wet pavement a second too long." 3. "the door's right there."

### Beat 7 - "the wild blur" (SAME image `intro-6-bar.png`, filtered)
`filter: 'blur(4px) brightness(1.4) saturate(1.6) contrast(1.1)'`, `imageAnim: 'introNightStrobe 1.6s ease-in-out infinite'`. Lights: (a) `{t:0,l:0,w:60,h:100}` pink `radial-gradient(circle at 30% 50%, rgba(255,60,120,.45), 0 @60%)`, `introStrobeA 0.4s steps(3) infinite`; (b) `{t:0,l:40,w:60,h:100}` blue `radial-gradient(circle at 70% 50%, rgba(100,140,255,.45), 0 @60%)`, `introStrobeB 0.5s steps(3) infinite`.
Lines: 1. "inside is louder than you expected." 2. "cyphers. beers. cheers. someone hands you the mic." 3. "you don't remember saying yes."
(No interior painting exists: the story "inside the bar" is told with a blurred exterior. An artist could replace this with a proper interior montage.)

### Beat 8 - Couch morning (image `intro-7-couch.png`)
Art: bright morning apartment; protagonist (no cap, messy hair) slumped on an orange sofa under a green blanket, rubbing his face; cluttered coffee table (cans, takeaway), TV on the left, plant, floor lamp, posters, hallway behind.
Lights: (a) `{t:-0.48,l:37.01,w:16.47,h:48.01}` radial at 50% 30% warm `rgba(255,210,140,.40)->0 @75%`, `introBreathe 7s`; (b) `{t:16.24,l:1.11,w:18.81,h:32.38}` blue `rgba(120,180,255,.7)->0 @75%`, `introTvFlicker 1.2s steps(6)` (TV); (c) `{t:21.19,l:82.29,w:17.15,h:34.06}` warm 50% 0% `rgba(255,225,170,.55)->0 @75%`, `introBreathe 4s` (floor lamp).
Lines: 1. "morning. couch. head pounding." 2. "the cypher was real." 3. "and tonight... you go again."

**Rebuild notes**: the 7 PNGs are final art already (480x270, pixel-art-style paintings) and can be used as-is or repainted at 2x. Keep the light layers as separate additive sprites keyed to the same percent boxes (or bake with a Phaser `Light2D`/additive blend + tweens). The protagonist in the intro is a fixed generic character (cap + hoodie), NOT the customised player (creation happens after).

---

## 17. TUTORIALS - Foxy tip pop-ups  (lines 10791-10875)

**What / when.** 11 one-shot tips by Foxy (the roommate, "soft-spoken, plant person, makes too much soup", line 698). Watcher in `App` (11167-11188): runs on changes of `day`, hour bucket, `energy`, `hunger`, `mood`, `cash`, `created`, `storyFlags`, `cutscene`, `screen`; returns early if no char / not `created` / a cutscene is open / `screen` is `loading|slots|create|intro`; scans `TUTORIALS` IN ORDER, skips ids whose `storyFlags['tut_<id>']` is set, runs `when(char)` in a try/catch, and plays the FIRST match as a text `Cutscene` (`speaker:'FOXY · TIP'`, `speakerColor:'#84cc16'`, no art, no music) with flag `tut_<id>` (set on completion OR skip), then `break`s. Remaining matches fire one at a time after each closes. Day/time reminders: day 1 = Tuesday (`dayOfWeek = day % 7`), `minutes` 0 = 6 AM, 720 = 6 PM, 1080 = midnight, 1200 = 2 AM forced sleep.

| # | id | Trigger (`c` = char) | Text (line by line) |
|---|---|---|---|
| 1 | `start_busk` | `(day\|\|1)===1 && (minutes\|\|0)<600 && (cash\|\|0)<30` | "first up — head to the park and busk for an hour." / "you'll get a few bucks and bump your showmanship. it's how everyone starts here." |
| 2 | `low_energy` | `(energy\|\|0)<=30 && !c._sleepingNow` | "you're getting tired. when energy's low, head home." / "couch tab in your apartment — power nap to top up, or sleep till morning." |
| 3 | `low_hunger` | `(hunger\|\|0)<=30` | "stomach's rumbling. swing by your kitchen and eat something." / "tip: i drop a free Foxy Soup in your fridge every day. take it." |
| 4 | `low_mood` | `(mood\|\|100)<=30` | "you're in a slump. mood drains your training rewards if it stays low." / "talk to people at the bar, take a walk, or play a song to get back up." |
| 5 | `first_money` | `(cash\|\|0)>=25 && (day\|\|1)<=4` | "nice — pocket money. don't spend it all on snacks." / "sunday rent is $50 a week to start. budget around that." |
| 6 | `try_jam` | `(day\|\|1)>=2 && (cash\|\|0)>=5 && !storyFlags?.firstJam` | "once you've got busking down, try Jam in the park." / "5 cycles → +1 random stat + a few followers. that's how you get on the radar." |
| 7 | `bar_open` | `(day\|\|1)>=3` | "the bar opens today. tap the bar tile in the city." / "tue/wed/thu = open mic — free shot at fans. fri = paid showcase, sat = battle, sun = karaoke." |
| 8 | `late_night` | `(minutes\|\|0)>=1080` | "heads up — it's getting late." / "the day cuts off at 2 AM. sleep before then or you'll collapse and lose half your morning." |
| 9 | `rent_warning` | `((day\|\|1)%7)===5 && (cash\|\|0)<50 && !storyFlags?.firstRentPaid` | "saturday already. rent's $50 tomorrow." / "if you're short — busk hard, hit the karaoke bar tonight, or skip a meal. don't miss it." |
| 10 | `shop_open` | `(day\|\|1)>=4` | "the shop opens today. four sub-stores: music, furniture, clothing, pet." / "music gear boosts training; furniture buffs your home; clothing affects shows; pet's a daily mood bump." |
| 11 | `routines` | `(openMicCount\|\|0)>=1` | "now you've done a mic — about your routines." / "head home → PC/Train tab → train Originality. that's where the MPC lives — build your own loops there." / "your saved patterns are what gets played at open mics. better originality = better routines = better shows." |

Notes: Foxy pop-ups use the standard cutscene frame (Oswald 20 px, "FOXY · TIP" Bebas label in lime). Foxy's tips are the only "tutorial" system; mini-game-specific tutorials are not in this range. Content-unlock days used in the text: bar day 3, shop day 4 (sub-stores music 4 / furniture 5 / clothing 7 / pet 10), mingle day 5 (`CONTENT_UNLOCKS`, 1199).

**Rebuild notes**: port as a data table with TS predicate functions; keep the same dispatch rules (first match, one at a time, never during cutscenes/menus, `tut_<id>` flag in story flags). Fix the bugs listed in the gotchas section before copying the predicates.

---

## 18. SlotsScreen - character save slots  (lines 10877-11106)

**What / when.** React/Tailwind DOM screen (not canvas). Reached from the Title screen ("Play" when no active slot / "Slots" button) and from the in-game header's second gear button ("Profiles & save slots", 11611-11617), or automatically after the active slot is deleted. Props `{activeSlot, onSwitch, onDelete, onBack}`. `onBack` is passed only when a created character is active (then a "← Back to game" button is shown; the footer/header of the game are hidden while on this screen).

**Data/storage layer (lines 929-1028)**: `NUM_SLOTS=5`; slot record = the whole character object (`initialChar()` 152-225 + `migrateChar` fix-ups at load); keys `character:slot1..5` and `active_slot` through `window.storage` (polyfilled in `index.html` to `localStorage` with prefix `bbs:`, so `bbs:character:slot3`, `bbs:active_slot`); legacy `character:main` is migrated into slot 1 once. `loadAllSlots()` loads all 5 sequentially (parse failure => null). A slot counts as "filled" only if `slot.created` is truthy.

**Layout (top to bottom)**
1. Title "BEATBOXERS" (Bebas Neue/Oswald, 30 px, `tracking-widest`, amber-500) and subtitle "Pick a character or start fresh" (10 px, uppercase, `tracking .3em`, stone-500). While loading: centred "Loading…".
2. Five cards (`space-y-3`), each `border-2`: ACTIVE slot = amber-500 border + `bg-amber-500/5`; filled = `border-stone-700 bg-stone-900/40`; empty = `border-stone-800 border-dashed bg-stone-950/40`.
3. Optional "← Back to game" button (full width, `border-stone-800`).

**Slot card, filled (main button = tap to switch)**: 40x40 number badge (slot number, mono, border + 13 % tinted background + text in the character's colour `slot.color`, default `#D4A017`); name in Bebas (`slot.name || 'UNNAMED'`) with an amber "ACTIVE" pill on the active slot; line 1 `Lvl {level} · Day {day} · ${cash} · {followers} fans` (stone-500); line 2 `Mus {stats.mus} · Tec {stats.tec} · Ori {stats.ori} · Sho {stats.sho}` (stone-600); right label "Switch →" (stone-600) or "Continue →" (amber, on the active slot). Footer row of two ghost buttons: "📤 Export save" (left) and "🗑 Delete" (right), hover amber / red.
**Slot card, empty**: badge in grey, "EMPTY SLOT" + "Tap to create new character", big "+" on the right; footer "📥 Import save (.json)" (hidden `<input type=file accept="application/json,.json">`) and an inline status line (text-amber "Imported <name> ✓" / red / grey).

**Flows**
- Tap filled card -> `switchToSlot(n)` (11340): load char, `migrateChar`, set `activeSlot`, `loadSamplesForSlot(n)` (IndexedDB recordings), go to `hood`.
- Tap empty card -> `initialChar()`, active slot = n, load samples, play INTRO_BEATS (section 16), then `create` screen.
- Export: builds a `Blob` of `JSON.stringify(slot,null,2)` and clicks a temporary `<a download>`; file name `beatbox-<name lowercased, non [a-z0-9_-] -> _>-slot<N>-day<D>.json` (name default `character`); the URL is revoked after 100 ms. Disabled for non-created slots.
- Import (only offered on EMPTY slots): status "Reading file..." -> parse; rejects non-objects or objects without `created` ("That doesn't look like a Beatbox save."); on success `saveSlot(n,parsed)` and "Imported <name> ✓" (the slot is NOT auto-opened; it refreshes the list); errors -> "Import failed: <message>". No schema/version check, no size limit; `migrateChar` runs later at load.
- Delete: the card body is replaced by a red confirm panel: "⚠ Delete <name>?", "This will permanently erase this character. Type **DELETE** below to confirm:", autofocused input (placeholder "Type DELETE", mono, uppercase via CSS), buttons "Cancel" and "Delete forever" (disabled until `confirmText === 'DELETE'` EXACTLY). Confirm -> `onDelete(n)` (`deleteSlotAt`, 11359: `deleteSlot(n)`; if it was the active slot: char cleared, active slot null, screen `slots`) -> list refreshes. The export/delete footer is hidden while confirming.
- No rename, duplicate, reorder, cloud sync or per-slot play-time. State: `slots, confirmDelete, confirmText, refreshKey, importStatus` + a ref map of hidden file inputs.

**Rebuild notes**: port as Phaser DOM overlay or native scenes; keep the 5-slot model and `bbs:` storage keys so existing saves keep working; replace the browser Blob/`<input file>` flow with whatever the new shell supports; fix the delete-confirm case rule and sample orphaning (see gotchas). Fonts: Bebas Neue + Oswald (Google Fonts); palette = Tailwind stone-800/900/950 with amber-500 accent, red-400/700/900 for danger.

---

## 19. Rebuild plan (cross-cutting)

### 19.1 Assets the artist needs to deliver (parity checklist, grouped)
- [ ] **Painted backdrops** (recommended 960x540 or 600x390-compatible 1000x650; keep the 200:130 crop OR switch everything to the 16:9 the intro already uses): tour road, tour motel (with neon sign overlay), tour stage (with crowd layers), park face-off (shared "park" kit with date + cypher), bar interior (shared by Penny + Mingle, with hanging lamp), park bench date, open-mic bar stage (+ crowd), living-room (couch/TV/rug/lamp/plant/mic), desk/PC (monitor with scrolling chat texture), BBX-16 drum machine (pad/LED/knob layers), mirror room (disco ball, gold mirror, speaker), couch/apartment sleeping room (day/night/dawn variants or a grade).
- [ ] **Animated overlay sprites**: van wobble + wheel spin + exhaust, road dashes + poles scroll, neon MOTEL flicker, TV static, stars twinkle, light cones sweep, lip-light chase, crowd head-bob + hands-up waves, confetti, lens flare, hearts, sparkles, music notes, sound rings, steam, Z's, shout '!' marks, heat ticks, disco sparkles, speaker pulse, pad flashes + step LEDs, knob rotation, TV concentric-ring content, Discord typing/unread badge, PC LEDs.
- [ ] **Characters (shared paper-doll, customisable by shirt/skin/hair colour, 5 hair styles, 6 accessories)**: standing performer (idle bob + 4 mouth frames + mic hand, facing L/R), dance (4 poses + mirror), bust-at-bar (neutral/listening + sad Pig Pen variant), bench-sit (player + partner), couch-lie (sleep), bed-edge sit with headphones + hand to ear, desk profile with headphones + head-bob, van-window silhouette, pointing-finger pose (Pig Pen, smug).
- [ ] **NPC art**: Pig Pen (smug standing + seated sad), driver (tour van), partners (Luca, Mira, Sky, Pascal, Jin, Roo looks; Pascal/Jin/Roo currently missing in the date scene), generic bar strangers + named mingle NPCs, Foxy (tutorial speaker, today text only).
- [ ] **UI**: intro letterbox + line text style, tutorial Foxy tip frame, slot cards, delete confirm.
- [ ] **Audio**: `intro` music track (procedural today), rooster crow, optional crowd cheer for the tour stage, optional ambient loops per scene (none today).

### 19.2 Technical advice
- Fastest parity path: a TS `drawXxx(ctx, frame, look)` port rendered into a `CanvasTexture` at 200x130 scaled x3-x5 with `NEAREST`. Real "proper asset" path: bake the static rect lists to PNG layers (a script can run each function once with `fc=0` and layers masked out - the code is deterministic and has no `Math.random`, except the mingle encounter look and the tour payout), then re-add the moving parts as separate GameObjects.
- Move from frame counts to a delta-time clock: `fc = floor(elapsedMs/16.667)`; every loop length above is expressed in 60 Hz frames.
- Make the figure rendering ONE module with poses (stand/dance/sit-bar/sit-bench/lie/bed-sit/desk) so look-application is consistent (hair style + accessory everywhere).
- Backdrop kits to reuse: park (sky+sun+grass+trees+crowd) x3 scenes; bar interior x2; living-room/apartment x several; `crowd rows`, `floating note/heart emitter`, `spotlight cones`, `neon flicker`, `vignette`.
- `Cutscene` contract to reproduce in Phaser: image-or-scene art, speaker label, per-line tap-to-advance, auto-advance 2 s mode, skip, segmented beat bar, reduced-motion, music start/stop, flag-on-complete, game clock pause.

### 19.3 Suggested data contracts (derived from the code; all fields exist in the original)

```ts
type HairStyle = 'short' | 'fade' | 'mohawk' | 'spike' | 'long';
type Accessory = null | 'cap' | 'beanie' | 'shades' | 'glasses' | 'fedora' | 'headphones';
interface Look { shirt: string; skin: string; hair: string; style: HairStyle; accessory: Accessory }

// Scene entry points (all draw into 200x130, frame = 60 Hz tick)
type SceneParams =
  | { id: 'tourRoad' | 'tourMotel' | 'tourStage' | 'pigPenChallenge' | 'pennyReveal' | 'openMic'
        | 'musicality' | 'technicality' | 'originality' | 'showmanship'; look: Look }
  | { id: 'date'; playerLook: Look; partnerLook: Partial<Look> }          // partner missing fields default skin #e0b890 hair #5a2010
  | { id: 'mingle'; look: Partial<Look>; encounterId: string }             // drink colour = [#fbbf24,#22d3ee,#fb7185,#84cc16][id.length % 4]
  | { id: 'sleep'; look: Look; progress: number };                         // 0..1 over 4000 ms

interface CutsceneLight { t: number; l: number; w: number; h: number; bg: string; anim?: string } // % of 480x270 frame
interface CutsceneBeat {
  image?: string; filter?: string; imageAnim?: string; lights?: CutsceneLight[];  // image mode
  scene?: SceneParams;                                                           // procedural mode
  lines: string[];
}
interface CutscenePlay {
  speaker?: string | null; speakerColor?: string;        // default '#D4A017'
  beats: CutsceneBeat[]; music?: 'title' | 'intro' | null;
  completeFlag?: string;                                  // written to storyFlags on finish OR skip
  after?: () => void;
}
interface Tutorial { id: string; when: (c: Char) => boolean; lines: string[] }  // played as { speaker:'FOXY · TIP', speakerColor:'#84cc16' }, flag `tut_${id}`
interface SlotView { n: 1|2|3|4|5; filled: boolean; active: boolean;
                     name?: string; color?: string; level?: number; day?: number; cash?: number; followers?: number;
                     stats?: { mus: number; tec: number; ori: number; sho: number } }
```

### 19.4 Consolidated animation timing (60 Hz frames; seconds = frames / 60)

| Scene | Element | Rule | Real time |
|---|---|---|---|
| Tour road | lane dashes | scroll `4 px/frame`, repeat 28 px | 240 px/s |
| Tour road | poles | scroll `3 px/frame`, repeat 60 px | 180 px/s |
| Tour road | van bounce | 1 px down half of each 21-frame cycle | 0.35 s |
| Tour road | passenger head bob | `sin(0.18 fc)` sign flips every 17.5 f (35 f cycle) | 0.58 s cycle |
| Tour road | wheel hub | toggles every 4 f | 7.5 Hz |
| Tour road | exhaust puffs | 36 f cycle, visible 30 f | 0.6 s |
| Tour motel | neon flicker | dim 10 f of every 90 | 1.5 s |
| Tour motel | stars | 60 on / 40 off, offset 7 f each | 1.67 s |
| Tour motel | TV static | every pixel moves each frame | 60 Hz |
| Tour motel | notes | 90 f cycle, visible 70 f | 1.5 s |
| Tour stage | spot sweep | `sin(0.04 fc)` | 2.6 s period |
| Tour stage | lip lights | 30 f chase, 18 on | 0.5 s |
| Tour stage | crowd wave | `sin(0.07 fc)` | 1.5 s |
| Tour stage | confetti | fall 100 px in 180 f | 3 s |
| Tour stage | flare pulse | `sin(0.12 fc)` | 0.87 s |
| Pig Pen | crowd bob | `sin(0.1 fc)` | 1.05 s |
| Pig Pen | '!' marks / heat ticks | on 22/30 f, on 6/12 f | 0.5 s / 0.2 s |
| Penny / Mingle | bottle glints | 4 f every `40+3i` | ~0.7 s |
| Date | hearts | 0.6 phase/f, 80 f cycle | 2.2 s rise |
| Date | sparkles | 30 on / 30 off | 1 s |
| Open mic | string lights | 50 on / 10 off | 1 s |
| Open mic | crowd bob / hands | `sin(0.18 fc)`, hands 12 of 30 f | 0.58 s / 0.5 s |
| Open mic | sound rings | on 2 of 4 f, radius grows 0.56 px/f | fast |
| Sleep | whole scene | `progress = elapsed / 4000 ms` | 4 s |
| Sleep | Z's | 24 f per step, 48 f cycle | 0.8 s |
| Musicality | TV rings | 30 f cycle, 12 f offset | 0.5 s |
| Musicality | singing bars | on 2 of 4 6-frame blocks | 0.4 s |
| Technicality | unread badge hop | every 90 f | 1.5 s |
| Technicality | typing dots | 12 f per dot | 0.2 s |
| Technicality | head bob | toggle every 12 f | 0.2 s |
| Originality | step head | 4 f per step, 16 steps | 1.07 s loop |
| Originality | knobs | 0.04 rad/f | 2.6 s / turn |
| Showmanship | dancer pose | 8 f per pose, 4 poses | 0.53 s loop |
| Showmanship | speaker pulse | 8 on / 8 off | 0.27 s |
| Showmanship | disco sparkles | 60 f cycle, 35 visible | 1 s |

### 19.5 QA parity checklist (what to compare side by side in the rebuild)

- [ ] Tour: three beats in order road -> motel -> stage, caption lines identical, last line shows the real rolled cash/fans, cutscene starts after the hood transition, state already applied.
- [ ] Tour road: sunset sky, half-set sun behind skyline, scrolling road, van with 3 windows, passenger silhouette with the PLAYER'S skin/hair, driver in lime, roof gear, exhaust.
- [ ] Tour motel: neon MOTEL flicker + pink spill on the room, lamp glow, TV static, suitcase, player with headphones + closed eyes + notes, clock reads 1:47.
- [ ] Tour stage: three coloured cones swaying, lip-light chase, speaker stacks, 'LIVE / TOUR · NIGHT 2' banner, 4-row crowd with raised hands + phone lights, performer on stage with full look, confetti, flare.
- [ ] Pig Pen challenge: park + cypher ring + crowd, Pig Pen (cap clock, pointing) vs the player, red '!' bursts and heat ticks, 4 lines, fires once.
- [ ] Penny reveal: bar at night, two seated figures (player neutral, Pig Pen slumped), amber whiskey half-empty + spare glass + coaster, 5 lines incl. the "..." beat, fires once after the 2nd win.
- [ ] Date: bench under a tree, both figures with their own looks, hearts + sparkles, partner name/colour as speaker, 3 lines, effects (+3 affinity, +18 mood, +60 min).
- [ ] Mingle: same bar with a seated stranger, per-encounter drink colour, player's cyan drink on the left.
- [ ] Open mic: stage + string lights + spotlight + crowd silhouettes, performer centre with ring pulses, routine counter synced to the pattern playback.
- [ ] Sleep: dusk -> night (stars, darkness) -> dawn (amber window, sun), Z's, caption changes at 40 % / 85 %, rooster at 85 %, 4 s total.
- [ ] Training scenes: correct scene per stat, hidden during the matching mini-game (not for `sho`), AFK animations running; Technicality shows crystix/rohzel/alim chat and `#beat` channel; Originality has no character.
- [ ] Intro: 8 beats / 24 lines verbatim, correct image per beat (bar reused), per-beat lights in the same places, 1.1 s cross-fade, Ken-Burns drift, `intro` music loop, Skip works, flag `introSeen`, then Create screen.
- [ ] Tutorials: 11 tips verbatim, predicates identical (or deliberately fixed), one-at-a-time, never during cutscenes or on slots/create/intro/loading, `tut_<id>` flags persisted.
- [ ] Slots: exactly 5 slots, card contents, ACTIVE tag, Switch/Continue labels, create-on-empty -> intro, export file name pattern, import (empty slots only), DELETE confirm, back button only when a char is active, legacy-key migration.

---

## OPEN QUESTIONS / GOTCHAS

1. **Frame-rate coupling.** All animation is `fc`-based on `requestAnimationFrame`; on 120/144 Hz screens every scene runs 2-2.4x faster. Decide the reference rate (60 Hz) for the rebuild and keep durations in ms.
2. **Inconsistent `look` use** (table 1.2): most scenes ignore hair style/accessories; Technicality ignores 'fade'; the dancer ignores accessories; Originality has no player at all. Decide whether to unify (recommended) - it changes visuals from the original.
3. **Date partners**: `goOnDate` only maps luca/mira/sky; pascal/jin/roo dates use the fallback look (default skin `#e0b890`, hair `#5a2010`, shirt `#a78bfa`). Looks `_PASCAL_LOOK`, `_JIN_LOOK`, `_ROO_LOOK` exist (referenced at 1946-1948) but are not wired.
4. **Tutorial bugs by code-reading** (verify in play): (a) `start_busk` needs `cash<30` but `initialChar().cash` is exactly 30 (line 160), so it does not fire at game start - the first tip a new player probably sees is `first_money`; (b) `c._sleepingNow` is never set anywhere (only read), so `low_energy` ignores it; (c) all predicates are state-only, so an old save loaded after this feature shipped replays every applicable tip, one per cutscene cycle; (d) Skip marks a tip as seen; (e) text "5 cycles → +1 random stat" for Jam relies on `blocksPerReward:5` elsewhere; (f) `rent_warning` hard-codes $50 although later apartments cost more (tier 2 $100, tier 3 $200).
5. **Delete-slot confirm** is a trap: `<input class="uppercase">` only DISPLAYS capitals; the value is compared with `=== 'DELETE'`, so typing lowercase shows "DELETE" but the button stays disabled. Decide: replicate or make case-insensitive.
6. **Slot data not in the JSON**: recorded custom samples live in IndexedDB `beatbox-story-samples` keys `slotN:sample-<soundKey>` (17270-17380) and are neither exported nor imported; and slot deletion does not clear them, so a new character in that slot inherits them (`deleteAllSamplesForSlot` only called at 5642). Settings (`beatbox_settings`) and dev flag (`beatbox_dev`) are per-browser, not per-slot.
7. **Export/import** relies on browser Blob downloads and file inputs and on `window.storage` (an artifact-runtime API polyfilled in `index.html`); the Phaser shell needs its own abstraction (also note `loadSlot` swallows JSON parse errors and returns null => a corrupt slot looks empty and can be overwritten).
8. **Import does not run `migrateChar` and does not validate**: any JSON with truthy `created` overwrites an empty slot; migrations happen on the next `switchToSlot` (11343).
9. **Art/text mismatches**: tour beat 2 says "Bus seats" over a van; stage banner "TOUR · NIGHT 2" while the tour is "two cities" with a single stage image; Musicality config says "Watch beatbox vids on YouTube" but the scene is singing at a mic; Showmanship config says "Stream live, work the camera" but the scene is mirror-dancing; the intro "inside the bar" beat has no interior art (blurred exterior).
10. **Visual bugs in the originals**: the tour van's tail light is invisible (same colour as the body); the tour stage lens flare is drawn over the performer/mic; Date-scene crowd is drawn after the hearts (can cover them); sleep window colour snaps to amber at progress 0.7 (and the dawn sun is a square anchored to its left edge); the road lane stripes form a diagonal line rather than a perspective; `drawPigPen` 'sad' pose is unused (the Penny scene uses `_drawSeatedAtBar('pigpen')` instead); `drawDancer` pose comments disagree with the code (frame 2 = both arms out, not down); `_px` floors x/y but not w/h.
11. **Intro art**: the 7 PNGs are not procedural and are the only raster story art in this range; `intro-6-bar.png` is used twice (beat 6 clean, beat 7 blurred + strobed). The light boxes are tuned to those exact 480x270 images (percent coordinates) - if the art is repainted, re-measure them (there is a `tools/intro-light-editor.html` in the repo that appears to be the tool used to place them).
12. **Audio ownership**: only the intro music (and rooster in the caller) is attached to this range's scenes; everything else is silent. Confirm with the audio owner whether tour/stage/date/open-mic should get ambience in the rebuild.
13. **Timing owned by callers** (not in this range): tour cutscene opens 100 ms after `go('hood')`; Penny cutscene 600 ms after `go('bar')`; Sleep scene length 4000 ms; open-mic length = 2 patterns x 2 reps x 16 steps at `oriBpm+20` (+700 ms tail); dates cost +60 game minutes; mingle costs 30 min / 6 energy.
14. **Who calls the generic helpers**: `drawBeatboxer` is used 17x across the whole file, `drawPigPen` once; any change to the shared character renderer affects scenes in other people's ranges (battle stage, cypher, shop, house scenes).
15. **Unknown/unverified**: exact on-screen position of each intro "light" relative to the painted image was inferred by viewing the PNGs (listed labels like "TV", "phone", "LIVE sign" are my best reading - verify against the live game); frame timings assume 60 fps; the `MINGLE_POOL` dialogue content and the BeeAmGee/other NPC scenes live outside this range and are not inventoried here.
