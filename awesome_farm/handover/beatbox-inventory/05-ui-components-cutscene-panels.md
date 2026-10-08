# Beatbox Story — Feature Inventory 05: UI components, cutscene engine, phone/Foxy/dev/settings/achievement panels

Source: `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx`, **lines 5780-7440** (the range starts inside `JamAnimation`, whose header is at 5776; it ends just before the `MingleEncounter` banner at 7432, which belongs to the next range). All line numbers below are for that file. The jsx renders with React + Tailwind CDN (v3 default palette) + lucide-react icons; fonts "Bebas Neue" + "Oswald" from Google Fonts (`beatbox_story/index.html`, which requests only Oswald 400/700).

## SUMMARY
1. Two park-activity canvas animations (`JamAnimation` cypher, `RunAnimation` jog) drawn at 140x90 logical px, x4 scale, driven by a per-frame counter (60 fps assumed); props `color`, `block`, `rewardKey`, `active`.
2. 17 hand-coded 16x16 pixel icons (`PIXEL_ICONS`) rendered by `PixelIcon`; 12 are actually used, 5 are dead (`fist`, `beer`, `shop`, `home`, `tree`).
3. Small UI kit: `ProgressBar` (5-segment block meter), `Bar` (stat bar w/ lucide icon), `Btn` (4 variants), `Panel` (titled box). Pure presentation.
4. Error handling: `ScreenErrorBoundary` (retry card) + `GlobalErrorOverlay` (red top banner for window errors / promise rejections). Dev-safety only.
5. `PixelScene` = generic 200x130 (x3) animated canvas that calls a `draw(ctx, frameCount)` callback; used by cutscenes, Mingle, nap/sleep/open-mic scenes.
6. `Cutscene` = the narrative engine: props `speaker`, `speakerColor`, `beats[]|lines[]`, `music`, `onComplete`; per beat either a painted image (+ CSS light overlays, Ken-Burns, crossfade) or a `drawScene` canvas; tap arrow to advance, Skip button, optional 2 s auto-advance; pauses the game clock while open; plays looping "intro" music.
7. Overlays: `MessagesPanel` (read-only phone inbox, marks all read on open), `FoxyModal` (3 quips, daily +2 mood wave, one-time $15 loan), `FoxyAvatar` (24x24 face canvas).
8. `DevPanel` (29 controls: jump weekday/day, time slider+presets, cash, restore, fans, XP, +5 stats, lock), unlocked by triple-tapping the day badge + code `808` (or hidden input in Achievements).
9. `SettingsModal` (3 device-wide booleans: `muted`, `reducedMotion`, `fastDialogue`, stored in `localStorage.beatbox_settings`), `AchievementFanfare` (3 s auto-dismiss modal, queued) and `AchievementsPanel` (20 achievements, earned first, "day N").
10. Biggest traps: RunAnimation scenery scrolls away after ~2-6 s (negative JS modulo), everything animated is frame-count based (not time), fanfare auto-dismiss timer resets on parent re-render, Cutscene image mode ignores non-image beats.

---

## 0. Cross-cutting facts used by many units (read once)

- **`_px(ctx,x,y,w,h,color)`** (line 2263): `fillStyle=color; fillRect(floor(x), floor(y), w, h)` - only x,y are floored; w,h are used as given. All pixel scenes use it on a ctx pre-scaled by an integer factor.
- **`_drawDaytimeSky(ctx, W, h=50)`** (2283): per-scanline gradient rows 0..h-1 from rgb(122,192,232) (t=0) to rgb(170,216,248) (t=1); one 1px-high rect per row.
- **`_clampPct(v)`** (2287): clamp to 0..100.
- **Settings store** (964-998): `localStorage['beatbox_settings']` JSON; defaults `{ muted:false, reducedMotion:false, fastDialogue:false }`; module-level cache + listener set; `useSettings()` returns `[settings, updateSettings(patch)]`; `getSettings()` for non-React code. Per device, NOT per save slot.
- **Tailwind palette (v3 CDN)** used in specs below: stone-950 `#0c0a09`, stone-900 `#1c1917`, stone-800 `#292524`, stone-700 `#44403c`, stone-600 `#57534e`, stone-500 `#78716c`, stone-400 `#a8a29e`, stone-300 `#d6d3d1`, stone-200 `#e7e5e4`, stone-100 `#f5f5f4`; amber-300 `#fcd34d`, amber-400 `#fbbf24`, amber-500 `#f59e0b`, amber-600 `#d97706`; lime-500 `#84cc16`; red-900 `#7f1d1d`, red-800 `#991b1b`, red-700 `#b91c1c`. Game "gold" accent is `#D4A017`. Layout column is `max-w-md` (448 px) centred; mobile-first.
- **Fonts**: headings/labels `"Bebas Neue","Oswald",sans-serif`; cutscene body `"Oswald","Bebas Neue"` weight 300 (weight 300 is NOT requested from Google Fonts, so browsers render 400); buttons/panel titles use Tailwind `font-mono` + uppercase + wide tracking.
- **Overlay stacking** (all `fixed inset-0 z-50`; later DOM sibling paints on top), as mounted in `BeatboxStory` (11634-11667): Cutscene < MessagesPanel < AchievementsPanel < SettingsModal < AchievementFanfare < DevPanel < Toast. `GlobalErrorOverlay` is `z-index:9999`. Title screen mounts only `GlobalErrorOverlay` + `SettingsModal`.
- **Frame-count timing**: every canvas in this range increments a counter once per `requestAnimationFrame` and uses constants like `frameCount/4`. Real speed therefore scales with monitor refresh rate (120 Hz = 2x). Specs below give frames and "~seconds @60 fps". A Phaser rebuild should use a fixed 60 Hz step or convert to ms.

---

## JamAnimation  (lines 5776-6019)
**What it is / where opened.** Looping pixel animation of a 4-person beatbox cypher in a daytime park. Rendered by `ParkScreen` (line 15101-15103) inside the "<activity> - IN PROGRESS" panel while the **Jam Session** activity is active (`selected==='jam'`). Mounted only while `activity.active`, so it is re-created (refs reset) for every jam session.

**Props.** `color` (string, default `'#D4A017'`) = player's hoodie colour (`char.color`); `block` (0-4, current progress block - accepted and mirrored into a ref but **never used for drawing**); `rewardKey` (int, `activity.rewardsEarned`, 0 at start, +1 per 5 blocks = every 2.5 s real); `active` (bool, `activity.active`). Props are copied into `propsRef` each render so the rAF loop never restarts.

**Behaviour.**
- Canvas 140x90 logical, `PXSCALE=4` -> 560x360 backing store, `imageSmoothingEnabled=false`, CSS `w-full block border-2 border-stone-800`, `aspect-ratio 140/90`, `image-rendering:pixelated`, fallback background `#7ec0e8`.
- **Turn rotation**: `turnIndex = floor(frameCount/240) % 4` (240 frames = ~4 s @60 fps; source comment wrongly says ~5 s/300 frames). Order of `members[]`: 0 `you` (player, label `YOU`), 1 `left` (`L1`), 2 `right` (`R1`), 3 `back` (`B1`). Starts on `you`.
- Only the active member (`idx===turnIndex && active`) bobs, holds a mic, opens its mouth, and emits sound rings. When `active===false` nobody is highlighted, no rings, no label (scene idles).
- **Reward burst**: when `rewardKey` increases past the last seen value, 8 sparkles spawn at the canvas centre (70,45): angle random 0..2pi, `vx=cos*(1+rand)`, `vy=sin*(1+rand)-0.5`, `ttl=30+rand*20` frames, colour random of `#D4A017 #C8DCEF #fb7185 #a78bfa`. Each frame: `x+=vx; y+=vy; vy+=0.05; alpha=1-life/ttl;` drawn as 2x2 rect; removed when `life>=ttl`.
- No sound, no input, no text except the turn label.

**What is DRAWN** (back to front, logical px; all `px()` unless noted):
1. Sky: `_drawDaytimeSky(W)` rows 0-49.
2. Sun (top-right plus-shape): `(116,6,10,10)`, `(118,4,6,14)`, `(114,8,14,6)` all `#fef3c7`; glow = filled circle centre (121,11) r12 `rgba(254,243,199,0.30)`.
3. Two drifting clouds (shape: `(cx,cy,12,3) #fff`, `(cx+2,cy-2,8,5) #fff`, `(cx+4,cy-3,4,6) #fff`, shadow `(cx+1,cy+3,10,1) #dadada`): cloud A `cx=15+((f*0.04)%160)-30` (-15..145, ~2.4 px/s), y=12; cloud B `cx=70+((f*0.025)%180)-40` (30..210, ~1.5 px/s), y=24. (Cloud B re-enters by popping in at x=30, visible.)
4. 5 background trees at `tx=5+30i` (i=0..4): foliage `(tx-8,38,16,8) #3a7028`, `(tx-6,34,12,4) #4a8030`, `(tx-3,30,6,4) #5a9038`, trunk `(tx-1,46,2,6) #3a2410`.
5. Crowd: 18 spectators i=0..17 at `cx=8i+(i%2)*2`, `crowdY=40`; `headBob=sin(f*0.1+i*0.5)*0.5` (period ~63 frames); head `(cx,Y+bob,4,4) #a87844`; shirt `(cx-1,Y+4+bob,6,8)` colour cycle `[#a04040,#5a7050,#a06030,#4060a0,#a06090][i%5]`; hair `(cx,Y-1+bob,4,1)` cycle `[#5a3020,#6a4030,#3a2818,#5a3a28,#7a5040]`. Every third spectator (i%3==0: 0,3,6,9,12,15) raises both arms when `sin(f*0.15+i)>0` (1x4 shirt-coloured bars at `cx-2` and `cx+5`, y=Y+1+bob).
6. Ground `(0,50,140,40) #6a9a3a` (covers the lower 2 rows of crowd/tree trunks); 18 grass blades `(8i%140, 56+(i%3)*6, 1,2) #5a8a30`.
7. Dirt cypher circle: ellipse centre (70,72) radii 52x17 fill `#a89060`; inner outline ellipse 50x16 stroke `#7a6a48` 1px; 8 speckles `(30+10i, 68+(i%3)*4, 1,1) #7a6a48`.
8. Members, sorted by `y` (back to front: back 50, left 56, right 56, you 64). Table: you (70,64,scale 1.0,player colour), left (30,56,0.85,`#84cc16`), right (110,56,0.85,`#fb7185`), back (70,50,0.75,`#a78bfa`). For each (feet `cy=m.y+12`, `s=scale`):
   - shadow `rgba(0,0,0,.5)` rect `(cx-floor(8s)/2, cy+1, floor(8s), 1)`.
   - `bob = active member ? floor(f/5)%2 : 0` (legs alternate every 5 frames = ~12 Hz).
   - legs `(cx-2,cy-5-bob,1,5)` and `(cx+1,cy-5+bob,1,5)` `#1a1a2e`; shoes `(cx-2,cy-1,1,1)`, `(cx+1,cy-1,1,1)` `#fff`.
   - body `bodyW=floor(6s) x bodyH=floor(7s)` at `(cx-bodyW/2, cy-5-bodyH)` in member colour; hood `floor(4s)` tall rect of same colour directly above; head `headSize=floor(5s)` square `#d4a87a` on top (largely covers the hood).
   - Active only: raised arm `(cx+bodyW/2, top+1, 1,2)` member colour, hand `(.., top-2, 1,2) #d4a87a`, mic `(cx+bodyW/2+2, top-3, 2,2) #888`, mouth `(cx-1, top-1, 2,1) #3a1010` shown when `floor(f/4)%2` (toggles every 4 frames).
9. Sound rings from the active member's `(m.x, m.y-4)`: 3 concentric circles, `phase=(f*0.04+i*0.33)%1`, radius `phase*25`, stroke `rgba(212,160,23, (1-phase)*0.6)` 1px; one ring cycle = 25 frames (~0.42 s).
10. Sparkles (above) drawn on top.
11. Turn label bottom-left `(4,87)`: `"▶ YOU"/"▶ L1"/"▶ R1"/"▶ B1"`, `bold 6px monospace`, `#D4A017`, only when `active`.

**Rebuild notes.** Easiest parity: a 140x90 CanvasTexture redrawn each fixed step in a Phaser Scene, shown with nearest-neighbour at x4. Better-art version: layers (sky, sun, clouds, trees, crowd loop, ground, dirt ring) + 4 character sprites with idle/active (bob, mic, mouth) states, a turn-order timer (4 s per member, order YOU, L1, R1, B1) and a reward particle burst (8 particles, 0.5-0.83 s life, gravity 0.05/frame). The random NPC colours are fixed (not randomized despite the comment). DOM overlay not needed. Pure logic: turn rotation, sparkle spawn on `rewardKey` increase.

---

## RunAnimation  (lines 6021-6245)
**What it is / where opened.** Side-view jogging character with scrolling parallax scenery at dusk. `ParkScreen` line 15104-15106, shown in the IN PROGRESS panel while the **Go Running** activity is active in AFK mode (`selected==='run' && !playMode`; in play ("Sprint") mode `RunTracker` is shown instead). Re-created per session.

**Props.** `color` (default `'#D4A017'`, shirt/arms), `block` (0-4, used only for the km readout), `rewardKey` (int), `active` (bool). Same prop-mirroring pattern as Jam. Canvas 140x90 / x4, fallback background `#fde8a8`.

**Behaviour.**
- `speed = active ? 1.5 : 0` px/frame; scroll offsets `scrollX -= speed`, `scrollX2 -= speed*0.3` each frame (when inactive scenery freezes).
- 4-pose run cycle: `runFrame = active ? floor(f/4)%4 : 0` (each pose 4 frames; full cycle 16 frames, ~3.75 Hz). `bob = active ? (runFrame odd ? -1 : 0) : 0` (whole upper body shifts up 1 px on poses 1 and 3).
- Reward effect is a **no-op** (`rewardKey` increase only updates `lastRewardRef`; the "+1!" floating text mentioned in a comment is not implemented).
- Distance label while active: `km = (lastRewardRef*0.5 + block*0.1).toFixed(1)` -> text `"{km}KM"`; i.e. 0.5 km per completed reward + 0.1 km per block (0.0-0.4) - purely cosmetic.
- Sweat: when active and `f%30===0` spawn `{x:runX-6,y:runY-14,vx:-0.3,vy:0.1}`; each frame `x+=vx,y+=vy,vy+=0.05`, drawn `(x,y,1,2) #88c0d0`, life 30 frames.
- Motion lines while active: 3 strokes `rgba(255,255,255,0.4)` 1px, `lineX = runX-12-4i-(f%8)`, from `(lineX, runY-5+3i)` to `(lineX-5, same y)` (slide back 1 px/frame, snap every 8 frames).

**What is DRAWN** (back to front). Runner anchor `runX=50, runY=70`.
1. Sky bands: `(0,0,140,25) #fde8a8`, `(0,25,140,15) #f5b070`, `(0,40,140,15) #9b6a8e`.
2. Sun at (95,20): nested squares 12/10/8/6 px centred, colours `#fde0b0 #fef3c7 #ffd070 #ffb050`.
3. Mountains (far parallax, 0.45 px/frame): 6 triangles fill `#5a4868`, `mx=((30i+scrollX2)%170)-15`, base y=48, peak y=38, width 30.
4. Mid trees (1.5 px/frame): x offsets `[0,28,55,82,110,140,168]`, `tx=((tp+scrollX)%168)-14`, `ty=48`: trunk `(tx+4,ty+8,3,8) #3a2818`; leaves `(tx,ty-2,11,11)`, `(tx+1,ty-4,9,4)`, `(tx-1,ty+1,13,5)` all `#2a5028`; highlight `(tx+2,ty-1,3,3) #3a6a38`.
5. Path `(0,60,140,30) #7a5a30` + top edge `(0,60,140,1) #9a7a48`; 6 path dashes `(floor(lx),80,4,2) #5a4020`, `lx=((12i+scrollX)%72)-4`, drawn only if `-4<lx<140`.
6. Foreground grass tufts at x `[10,35,55,80,100,125,145]`, `gx=((gp+scrollX*1.5)%160)-10`, `gy=86`: blades `(gx,gy,1,3)`, `(gx+1,gy+1,1,2)`, `(gx-1,gy+1,1,2)` `#4a7028`, `(gx+2,gy+1,1,2) #5a8038`.
7. Runner shadow `(runX-5,runY+8,10,1)` alpha 0.4 (poses 0/2) or 0.5 (poses 1/3).
8. Legs (navy `#1a1a2e`, shoes `#fff`): poses 0 and 2 identical: legs `(runX-3,runY,2,6)`,`(runX+1,runY,2,6)`, shoes `(runX-3,runY+6,2,1)`,`(runX+1,runY+6,2,1)`. Pose 1: `(runX-4,runY,3,5)`,`(runX+2,runY,3,4)`, shoes `(runX-4,runY+5,3,1)`,`(runX+2,runY+4,3,1)`. Pose 3: `(runX-4,runY,3,4)`,`(runX+2,runY,3,5)`, shoes `(runX-4,runY+4,3,1)`,`(runX+2,runY+5,3,1)`. (So only 3 distinct leg poses: stance, A, stance, B.)
9. Torso `(runX-4,runY-8+bob,8,8) color` + white top row `(.., 8,1) #fff`.
10. Arms (colour = shirt, hands `#d4a87a`): poses 0-1: `(runX+4,runY-7+bob,2,5)`, hand `(runX+5,runY-3+bob,2,1)`; `(runX-6,runY-5+bob,2,4)`, hand `(runX-6,runY-1+bob,2,1)`. Poses 2-3: `(runX-6,runY-7+bob,2,5)`, hand `(runX-7,runY-3+bob,2,1)`; `(runX+4,runY-5+bob,2,4)`, hand `(runX+4,runY-1+bob,2,1)`.
11. Head `(runX-3,runY-14+bob,6,6) #d4a87a`; cap/hair `(runX-3,runY-15+bob,6,2) #1a1a2e`, wind tuft `(runX+2,runY-14+bob,2,1) #1a1a2e`; eyes `(runX-1,runY-12+bob,1,1)`, `(runX+1,runY-12+bob,1,1)` navy; mouth `(runX,runY-10+bob,1,1) #5a2020`.
12. Sweat drops, motion lines, `"{km}KM"` label `(4,9)` `bold 6px monospace #fff` (active only).

**Rebuild notes.** Intended parallax = continuous wrap. **The original is broken**: the modulo expressions `((value+scrollX) % period)` use a negative `scrollX`, and JS `%` keeps the sign, so after `|scrollX| > tp` each tree/mountain/dash/tuft slides off the left edge and never returns (all 7 trees gone after ~112 frames ~1.9 s; mountains after ~6 s; grass/dashes similarly). Rebuild with a positive modulo (`((v%p)+p)%p`) or tileSprite scrolling at: mountains 0.45 px/f (27 px/s), trees + path dashes 1.5 px/f (90 px/s), grass 2.25 px/f (135 px/s) at 140-px logical width. Runner = 4-pose loop at 15 fps frame-rate (3.75 cycles/s) with 1-px bob; add real sprite art freely. km counter is pure derived text: `0.5*rewards + 0.1*block`.

---

## PIXEL_ICONS  (lines 6247-6455)
**What it is.** Dictionary `name -> (px)=>void` of 17 hand-coded 16x16 sprites (menu / hotspot / stat icons). Coordinates are in a 16x16 grid; each entry is a list of filled rects `x,y,w,h colour`. A parity port can convert them to `Record<string, [x,y,w,h,color][]>` verbatim (`home` has one loop, noted).

**Where used (call sites).** `mic` busk activity (14787) + Studio hotspot/tab; `jam` jam activity (14823); `shoe` run activity (14907); `pc` PC/Train hotspot + tab; `fridge` Kitchen hotspot + tab; `couch` Couch hotspot + tab; `star` Wardrobe hotspot + tab and non-drink FOOD rows (14292); `coffee` drink FOOD rows (14292) and drink shop items (16395); stat-training rows (13820): `music`=MUS, `zap`=TEC, `sparkle`=ORI, `crown`=SHO. **Defined but never referenced: `fist`, `beer`, `shop`, `home`, `tree`.**

**Icon list - depiction and exact rects** (colour hex follows each group):
- `mic` (grey studio microphone: capsule + stand): `7,2,4,1 #999; 6,3,6,5 #bbb; 7,3,4,5 #888; 7,4,1,1 #fff; 8,8,2,1 #666; 8,9,2,4 #999; 6,13,6,1 #666`
- `jam` (two figures with a sound burst between them, cypher): `3,5,3,4 #D4A017; 4,3,1,2 #d4a87a; 3,9,1,3 #1a1a2e; 5,9,1,3 #1a1a2e; 10,5,3,4 #fb7185; 11,3,1,2 #d4a87a; 10,9,1,3 #1a1a2e; 12,9,1,3 #1a1a2e; 7,6,2,2 #fef3c7; 7,5,1,1 #D4A017; 8,5,1,1 #D4A017; 7,8,1,1 #D4A017; 8,8,1,1 #D4A017; 2,12,12,1 #3a3a3a`
- `shoe` (gold running shoe, white upper, dark sole): `2,9,12,3 #D4A017; 3,8,8,1 #fff; 4,7,6,1 #fff; 11,9,1,1 #888; 2,12,12,1 #444; 5,9,1,1 #666; 7,9,1,1 #666; 9,9,1,1 #666`
- `fridge` (two-door fridge with handles + gold sticker): `4,2,8,12 #e5e5e5; 4,7,8,1 #888; 10,4,1,2 #666; 10,9,1,3 #666; 5,3,2,1 #D4A017`
- `pc` (monitor showing a gold waveform, stand+base): `2,3,12,8 #1a1a2e; 3,4,10,6 #3a5a8a; 4,5,2,1 #D4A017; 7,5,1,2 #D4A017; 10,5,2,1 #D4A017; 7,11,2,1 #666; 5,13,6,1 #666`
- `couch` (maroon sofa, side view, arm rest, legs): `2,7,12,5 #7a3030; 2,6,12,1 #9a4040; 3,8,3,3 #5a2020; 7,8,3,3 #5a2020; 11,8,2,3 #5a2020; 2,12,1,1 #3a1010; 13,12,1,1 #3a1010; 2,4,2,4 #5a2020`
- `star` (4-point star, gold with cream core): `7,2,2,12 #D4A017; 2,7,12,2 #D4A017; 6,3,4,10 #fef3c7; 3,6,10,4 #fef3c7; 7,7,2,2 #D4A017`
- `fist` (raised fist, skin tones; UNUSED): `5,4,6,4 #d4a87a; 5,3,6,1 #a87858; 4,5,1,3 #a87858; 11,5,1,3 #a87858; 5,8,6,6 #d4a87a; 5,8,6,1 #a87858; 5,9,1,1 #a87858; 7,6,1,1 #1a1a2e; 9,6,1,1 #1a1a2e`
- `music` (gold eighth note): all `#D4A017`: `8,2,1,9; 9,2,3,1; 11,3,1,4; 5,9,4,4; 4,10,1,2`
- `sparkle` (purple faceted gem/diamond with white shine): `7,2,2,1 #a78bfa; 6,3,4,1 #c4b5fd; 5,4,6,1 #c4b5fd; 4,5,8,1 #a78bfa; 3,6,10,4 #a78bfa; 4,10,8,1 #a78bfa; 5,11,6,1 #7c3aed; 6,12,4,1 #7c3aed; 7,13,2,1 #5b21b6; 7,5,1,1 #fff; 7,6,1,1 #fff`
- `crown` (gold crown with red/cyan/red gems): `2,6,12,5 #D4A017; 2,5,1,1 #D4A017; 7,4,2,2 #D4A017; 13,5,1,1 #D4A017; 2,11,12,1 #a87800; 2,4,1,1 #fef3c7; 7,3,2,1 #fef3c7; 13,4,1,1 #fef3c7; 4,8,1,1 #CC2200; 7,8,2,1 #22d3ee; 11,8,1,1 #CC2200`
- `zap` (gold lightning bolt): `8,2,3,3 #D4A017; 7,5,3,2 #D4A017; 6,7,4,1 #fef3c7; 5,8,4,2 #D4A017; 4,10,4,1 #D4A017; 3,11,3,3 #D4A017`
- `beer` (foam-topped beer mug with handle; UNUSED): `3,4,8,1 #fef3c7; 3,3,8,1 #fef3c7; 2,4,1,1 #fef3c7; 11,4,1,1 #fef3c7; 3,5,8,8 #f5b070; 3,5,1,8 #aa7050; 11,5,1,1 #aa7050; 11,12,1,1 #aa7050; 11,6,2,6 #aa7050; 13,7,1,4 #aa7050; 11,7,1,4 #f5b070; 3,13,8,1 #aa7050`
- `shop` (pale-blue shopping bag with handles + gold tag; UNUSED): `4,5,8,9 #C8DCEF; 4,5,8,1 #88abd0; 3,6,1,7 #88abd0; 12,6,1,7 #88abd0; 5,3,1,2 #88abd0; 10,3,1,2 #88abd0; 5,2,6,1 #88abd0; 7,8,2,3 #D4A017`
- `home` (house: chimney, outline A-frame roof, gold body, door, 2 windows; UNUSED): `7,2,2,1 #888; 7,3,2,2 #666; 7,3,1,6 #7a3030; 8,3,1,1 #7a3030; for i=0..6: (7-i,3+i,1,1) and (8+i,3+i,1,1) #7a3030; 3,9,10,5 #D4A017; 3,9,10,1 #a87800; 7,11,2,3 #3a2818; 5,11,1,1 #88abd0; 11,11,1,1 #88abd0`
- `tree` (green tree with brown trunk; UNUSED): `7,8,2,6 #3a2818; 4,4,8,5 #2a5028; 5,3,6,1 #2a5028; 3,5,1,3 #2a5028; 12,5,1,3 #2a5028; 5,5,2,2 #3a6a38; 8,6,1,1 #3a6a38`
- `coffee` (cup with steam, saucer): `4,4,7,1 #fff; 5,3,1,1 #aaa; 8,3,1,1 #aaa; 4,5,7,8 #a87858; 4,5,7,1 #3a1810; 4,5,1,8 #7a4830; 10,5,1,8 #7a4830; 11,7,2,4 #a87858; 12,8,1,2 #a87858; 11,7,1,1 #7a4830; 11,10,1,1 #7a4830; 4,13,7,1 #3a1810`

**Rebuild notes.** Pure data; replace with painted icons keyed by the same 17 names (only 12 needed). Source `PixelIcon` for an unknown name draws a grey square (see next unit). Colours are the game palette (gold `#D4A017`, cream `#fef3c7`, blue-grey `#C8DCEF`, skin `#d4a87a`).

---

## PixelIcon  (lines 6457-6487)
- **What.** React canvas wrapper that draws one `PIXEL_ICONS[name]` into a `size x size` canvas (default 16, className optional).
- **Behaviour.** Effect on `[name,size]`: set canvas width/height = `size`, `pixelSize=size/16`, clear, call `drawer(px)` where `px(x,y,w,h,c)` = `fillRect(x*pixelSize, y*pixelSize, w*pixelSize, h*pixelSize)`. Unknown `name` -> grey `#666` square `fillRect(2,2,12,12)` in raw canvas px (NOT scaled by `size`).
- **Sizes in use**: 12 (apartment hotspot labels), 16 (tab title), 20 (food rows), 28 (stat training rows), 32 (activity list). Only 16/32 are integer multiples, so 12/20/28 render with soft (anti-aliased) rect edges despite `image-rendering:pixelated`.
- **Props:** `name:string`, `size:number=16`, `className:string=''`.
- **Rebuild:** pre-render each icon once to a 16x16 texture and scale nearest-neighbour (fixes the blur); fallback = skip icon.

---

## ProgressBar  (lines 6489-6501)
- **What / where.** 5-cell segmented "block" meter. Used in `HouseScreen` training panel (14182, `label="Block {b}/5"`, colour = trainConfig stat colour) and in `ParkScreen` IN PROGRESS panel (15116, `label="Block {b}/5"`, default gold).
- **Props:** `block:number` (0..total-1 = current block index), `total:number=5`, `label?:string`, `color:string='#D4A017'`.
- **Behaviour.** Cell `i` fill width: `100%` if `i<block`, `50%` if `i===block`, else `0%`. (So the current block always shows half-filled, even at `block=0` right at start; there is no sub-tick progress.) Fill has `transition-all`.
- **Drawn.** Optional label above (10px uppercase, tracking-widest, stone-500). Row of `total` flex cells with 4 px gaps; each cell `h-3` (12 px), 1 px stone-700 border, stone-900 background, `overflow-hidden`; fill = `color`.
- **Rebuild:** a Phaser Graphics row of 5 rects; or DOM. Pure presentation of `activity.block`.

---

## Bar  (lines 6506-6519)
- **What / where.** Labelled stat bar with icon; used 3x in the sticky header (11621-11623): Energy (`#D4A017`, lucide `Zap`, `max=char.maxEnergy ?? 100`), Fed (`#84cc16`, `Coffee`, max 100), Mood (`#C8DCEF`, `Heart`, max 100), laid out in a 3-column grid.
- **Props:** `value:number`, `max:number`, `color:string`, `icon?:LucideComponent`, `label:string`.
- **Behaviour.** Text right = `Math.round(value)/max`; fill width = `_clampPct(value/max*100)%` with `transition-all` (CSS default 150 ms).
- **Drawn.** `[icon 14px, stone-400] [label left | "v/max" right, 10px uppercase tracking-widest stone-500]` over a `h-2` (8 px) track (stone-900 bg, 1 px stone-800 border) with a solid colour fill.
- **Rebuild:** HUD top bar; tween the fill (150 ms) when values change.

---

## Btn  (lines 6521-6534)
- **Props:** `children`, `onClick`, `disabled`, `variant:'default'|'primary'|'danger'|'ghost'='default'`, `className`.
- **Drawn.** Base: `px-3 py-2 border-2 font-mono text-xs uppercase tracking-wider`, `transition-all`, disabled = 30% opacity + not-allowed cursor. Variants: default `bg stone-900 / border stone-700 / hover border amber-500 / text stone-200`; primary `bg amber-500 / border amber-600 / hover bg amber-400 / text stone-950`; danger `bg red-900 / border red-700 / hover bg red-800 / text red-100`; ghost `transparent / border stone-800 / hover border stone-600 / text stone-400`.
- **Use:** shop/food/plant buttons, STOP button (`variant="danger"`, "STOP ■" at 15121 calls `activity.stop('Stopped early')`).
- **Rebuild:** one reusable 9-slice button class with the 4 colour sets + disabled alpha 0.3.

---

## Panel  (lines 6536-6543)
- **Props:** `children`, `title?:string`, `className`.
- **Drawn.** Box `bg stone-950 @80%` (rgba(12,10,9,.8)), `border-2 stone-800`. Optional header bar: `px-3 py-2`, `border-b-2 stone-800`, `bg stone-900 @50%`, title in `text-amber-500 font-mono text-xs uppercase tracking-[0.2em]`. Body `p-3`.
- **Rebuild:** shared panel frame (9-slice) with title strip.

---

## ScreenErrorBoundary  (lines 6549-6582)
(The "CUTSCENE" banner comment at 6545-6547 is an orphan header; the real `Cutscene` component is further down.)
- **What.** React class error boundary around the whole app tree (title screen 11498 and main shell 11535) and again around the screen area (11671). Dev-safety net so a render exception shows a card instead of a black page.
- **Behaviour.** `getDerivedStateFromError` stores `{err}`; `componentDidCatch` logs `console.error('ScreenErrorBoundary caught:', err, info?.componentStack)`. **Retry** button sets `err:null` (re-renders children). Save data is untouched.
- **Drawn.** Padding 16, min-height 60vh, text `#e7e5e4`; heading `"⚠ Render crashed"` (11px, uppercase, letter-spacing .3em, `#f87171`); line "Something threw while drawing the screen. Your save is fine - tap Retry to re-render." (12px); `<pre>` with message + blank line + stack (10px, `#fbbf24` on `#1c1917`, padding 8, max-height 40vh, scroll, pre-wrap); Retry button (bg `#fbbf24`, text `#0c0a09`, padding 8x16, 11px uppercase, tracking .2em).
- **Rebuild:** not a gameplay feature. In Phaser: top-level try/catch around scene update + a DOM overlay; optional.

## GlobalErrorOverlay  (lines 6584-6630)
- **What.** Fixed top banner listing uncaught JS errors (`window 'error'`) and `'unhandledrejection'` events (which the boundary cannot catch). Mounted next to every `ScreenErrorBoundary`.
- **Behaviour.** State `errors[]` of `{msg, src, t}`; **dedupes by message**; error src = `"{filename}:{lineno}:{colno}"` (becomes empty when it equals `"::"`), rejection src = `'promise'`. `dismiss` button clears the list. Hidden when empty.
- **Drawn.** `position:fixed; top:0; left:0; right:0; z-index:9999; padding 8; bg #7f1d1d; text #fef2f2; monospace 11px/1.4; max-height 40vh; overflow auto`. Header row `"⚠ JS ERROR · {n}"` (bold, tracking .2em) + `dismiss` (transparent, 1px `#fef2f2` border, 10px). Each entry: message (break-word), optional src (10px, 60% opacity), separated by 1px `#991b1b` rules.
- **Rebuild:** keep as a dev-mode DOM overlay (or drop).

---

## PixelScene  (lines 6632-6678)
- **What / where.** Generic pixel-art animation host. Used by `Cutscene` (per-beat `drawScene`), `MingleEncounter` (7509), the apartment hotspot interaction scenes (13878), open-mic stage (15268), nap (15339) and sleep (15472) scenes. The actual scene painters (`drawFoxy`, `drawMingleScene`, `drawSleepScene`...) live later in the file (from ~7945) and are other people's ranges.
- **Props:** `draw:(ctx, frameCount)=>void` (identity changes each render; mirrored to a ref so the loop is not rebuilt), `w:number=200`, `h:number=130`, `scale:number=3`.
- **Behaviour.** Effect on `[w,h,scale]`: canvas = `w*scale x h*scale` (600x390 default), `imageSmoothingEnabled=false`. Loop (called once immediately, then each rAF): `fc++`, `save`, `scale(scale,scale)`, fill `#0c0a09` over `0,0,w,h`, `try{ draw(ctx,fc) }catch{ log once per unique message }`, `restore`. Frame counter increments per frame (60 fps assumption).
- **Drawn.** CSS: `width:100%`, `aspect-ratio w/h`, `image-rendering:pixelated`, `block border-2 border-stone-800`. Black (`#0c0a09`) clear each frame.
- **Rebuild:** a Phaser `RenderTexture`/`CanvasTexture` of 200x130 shown at x3 (or replace scene by scene with painted art/animated sprites). Keep the `(ctx, frameCount)` contract if porting scene painters verbatim.

---

## Cutscene  (lines 6680-6879)
**What it is / where opened.** Full-screen narrative cinematic. Opened through `playCutscene(props, flagPath, after)` in `BeatboxStory` (11157): sets `cutscene` state (`{...props, onComplete}`) and renders `<Cutscene {...cutscene}/>` (11635). Triggers seen: new-slot intro (`beats: INTRO_BEATS, music:'intro'`, flag `introSeen`, `after` -> go to Create screen, 11354); Foxy tutorials (`speaker:'FOXY · TIP'`, `speakerColor:'#84cc16'`, `lines`, flag `tut_<id>`, 11181); story beats from screens (first jam, Pig Pen challenge, rent, eviction, sleep, dream, dates, tour, battles, Penny reveal; ~30 call sites). While a cutscene exists the App calls `setGamePaused(true)` (11155) so activity ticks (time/energy/hunger/rewards) freeze.

**Props.** `speaker?:string|null` (one label for the WHOLE cutscene; per-beat speaker is NOT supported here), `speakerColor:string='#D4A017'`, `beats?:Beat[]`, `lines?:string[]` (shorthand = single beat `[{lines}]`), `music?:string|null` (track name `'title'|'intro'`; unknown names are ignored), `onComplete?:()=>void`.

**Beat schema** (`Beat`):
| field | type | meaning |
|---|---|---|
| `lines` | `string[]` | text shown one at a time (required for text; may be empty) |
| `image` | `string` URL | painted still, relative to the page (`intro-1-office.png` ...); 16:9 (box aspect 480/270), `object-cover`, `image-rendering:pixelated` |
| `filter` | CSS filter string | applied to the `<img>` (e.g. blur/brightness) |
| `imageAnim` | CSS `animation` shorthand | animates the `<img>` (used with `filter`, e.g. `introNightStrobe 1.6s ease-in-out infinite`) |
| `lights` | `Light[]` | overlay glows: `{t,l,w,h (percent of the image box), bg (CSS background, usually radial-gradient), anim (CSS animation shorthand or 'none')}`; blend `mix-blend-mode: screen`, `pointer-events:none` |
| `drawScene` | `(ctx,fc)=>void` | pixel-art painter run inside `PixelScene` (200x130 x3), used when no beat in the cutscene has an `image` |

**Flow / state.** `beatIdx`, `lineIdx` start at 0. `isLastLine = lineIdx+1 >= beat.lines.length`; `isLastBeat = beatIdx+1 >= allBeats.length`; `isFinal = both`.
- `advance()`: if `isFinal` -> `onComplete()`; else if `isLastLine` -> `beatIdx+1, lineIdx=0`; else `lineIdx+1`.
- **Advance control** = the big amber arrow button under the text (`→`, or `OK` on the final line; `text-3xl`, `active:scale-90`). Tapping the text/background does nothing. **No keyboard shortcuts** (no Enter/Space/Esc).
- **Skip** = "Skip →" button (top-right, 10px uppercase, stone-500 -> amber-500 hover) calls `onComplete()` directly (so the story flag / `after()` still run exactly as if finished).
- **Fast dialogue** (`settings.fastDialogue`): effect on `[beatIdx,lineIdx,fastDialogue,isFinal]` starts a 2000 ms timeout that calls `advance()` (including completing the cutscene on the last line); manual taps still work.
- **Empty cutscene** (no beats, no lines): `isFinal` is true immediately; shows `OK`.
- **onComplete** (from `playCutscene`): `setCutscene(null)`; if `flagPath`: `char.storyFlags[flagPath]=true`; then `after?.()`.
- **Music**: effect on `[music]`: `startMusic(music)` on mount, `stopMusic()` on cleanup (0.5 s linear fade-out). `startMusic` no-ops if the same track is already playing or the track is unknown; honours `settings.muted` (new contexts blocked in `getAudioCtx`, running loops stop within 25 ms of toggling). Only music cue in the engine is the single cutscene-wide `music` prop (no per-beat cues, no SFX). Track `'intro'` (17783): 68 BPM, Am-F-C-Em, 32 steps (8 bars) looping, volume 0.38 with 0.8 s fade-in, sustained triangle+saw pads, sine sub-bass, sparse triangle melody. Track `'title'` (`_TITLE`) is used by `TitleScreen`, not here.
- **Preload**: on mount every unique `beat.image` is loaded via `new Image().src`.
- **Reduce motion** (`settings.reducedMotion`): disables the line/scene fade, the crossfade transition and the Ken-Burns animation (all `'none'`).

**Layout / what is DRAWN.**
- Root: `fixed inset-0 z-50 flex center p-5`, background `radial-gradient(circle at center, #1c1917 0%, #0c0a09 100%)`. Content column `max-w-md w-full space-y-4`.
- **Art area (two mutually exclusive modes):**
  - *Image mode* (if `beats.some(b=>b.image)`; checks the prop `beats`, not `allBeats`): one container `relative w-full overflow-hidden border border-stone-800 bg-black`, `aspect-ratio 480/270`. One absolutely-filled layer per beat that has an image; current layer `opacity:1`, others `0`, `transition: opacity 1.1s ease-in-out` (crossfade). Inside each layer a **Ken-Burns wrapper** `animation: introKenBurns 14s ease-in-out infinite alternate` (scale 1 -> 1.05 with translate(-1%,-0.5%), reversing; shared by image AND its lights so lights stay registered), containing `<img>` (filter + imageAnim) and the light divs. All layers' animations run from mount (not restarted per beat). Beats **without** an image render nothing in this mode (blank black box); `drawScene` is ignored.
  - *Scene mode* (no image anywhere, `beat.drawScene` present): `<PixelScene draw={beat.drawScene}/>` wrapped in a div keyed by `beatIdx` with fade-in `cutFade 0.5s ease-out`. Beats without `drawScene` show no art (text only).
- **Speaker label** (if `speaker`): 11px uppercase, tracking .4em, `speakerColor`, Bebas Neue.
- **Line text**: `text-xl` (20px), `leading-snug`, `min-h 3em`, `text-stone-100`, Oswald weight 300 (renders 400), letter-spacing .02em; remounts per `(beatIdx,lineIdx)` with `cutFade 0.4s ease-out`.
- **Advance button** (arrow / OK, amber-500, 30px).
- **Beat progress strip**: one 2 px-tall flex segment per beat: done `#D4A017`, current `#a8740a`, upcoming `#3a3530` (per beat, not per line).

**Keyframes defined in the Cutscene `<style>` (re-create as tweens):**
| name | definition | used by |
|---|---|---|
| `cutFade` | opacity 0, translateY(8px) -> opacity 1, translateY(0) | line text (0.4 s), drawScene wrapper (0.5 s), also App `screenFade` |
| `introKenBurns` | scale(1) translate(0,0) -> scale(1.05) translate(-1%,-0.5%), 14 s, alternate, infinite | every image layer |
| `introBreathe` | opacity .78 @0/100%, 1 @50% | warm bulbs / sun shafts / window light |
| `introCyanPulse` | .85 @0/100%, 1 @50% | office screen |
| `introMonitor` | .9 @0/100%, 1 @40%, .5 @42%, 1 @44% (brief dip flicker) | phone / monitor glow |
| `introTvFlicker` | .6 @0, .95 @16, .7 @33, 1 @50, .75 @66, .9 @83, .6 @100 (used with `steps(6)`) | blue TV light |
| `introNeonLive` | 1 @0/6/10/100%, .35 @4 and 8%, .85 @50%, .4 @52%, .85 @54% | red LIVE neon |
| `introNightStrobe` | filter `blur(4px) brightness(1.4) saturate(1.6) contrast(1.1)` @0/100% <-> `blur(6px) brightness(1.8) saturate(2.0) contrast(1.2)` @50% | the "blur" bar beat image |
| `introStrobeA` | opacity 0 @0/60/100%, 1 @30% (steps(3)) | pink strobe |
| `introStrobeB` | 0 @0/100%, 1 @50% (steps(3)) | blue strobe |

**Worked data example: `INTRO_BEATS`** (10688-10789, defined outside this range; 8 beats x 3 lines each; assets in `beatbox_story/`: `intro-1-office.png`, `intro-2-bedroom.png`, `intro-3-phone.png`, `intro-4-mirror.png`, `intro-5-door.png`, `intro-6-bar.png`, `intro-7-couch.png`). Light summary (exact t/l/w/h percentages are in the source at the lines cited):
1. office (10691): 1 cyan glow `rgba(120,190,255,.55)`, `introCyanPulse 2.6s`.
2. bedroom (10701): warm window `rgba(255,160,80,.45)` `introBreathe 6s` + phone glow `rgba(150,210,255,.55)` `introMonitor 1.6s`.
3. phone (10712): tall cyan glow `introMonitor 1.6s`.
4. mirror (10722): warm bulb cone `rgba(255,225,170,.55)` `introBreathe 4s`.
5. door (10732): TV blue `rgba(120,180,255,.7)` `introTvFlicker 1.2s steps(6)` + hallway warm `rgba(255,230,180,.30)` `introBreathe 5s`.
6. bar (10745): 10 lights: 6 red neon glows `rgba(255,60,90,.55)` on `introNeonLive` (durations 1.8 s / 2.4 s with -0.9 s delay / 1.5 s with -1.7 s delay so they don't blink in sync), 2 warm bulbs `introBreathe 4s`, one full-frame cool tint `linear-gradient(180deg, rgba(80,110,160,.18), rgba(40,60,100,.10))` (no anim).
7. "blur" bar (10765): same image with `filter: blur(4px) brightness(1.4) saturate(1.6) contrast(1.1)` + `imageAnim: introNightStrobe 1.6s ease-in-out infinite`, plus pink strobe (`rgba(255,60,120,.45)`, left 60%, `introStrobeA 0.4s steps(3)`) and blue strobe (`rgba(100,140,255,.45)`, right 60%, `introStrobeB 0.5s steps(3)`).
8. couch (10778): window stripe `rgba(255,210,140,.40)` `introBreathe 7s`, TV blue `introTvFlicker 1.2s`, warm bulb `introBreathe 4s`.

**Rebuild notes.** Pure logic: the `(beatIdx,lineIdx)` machine, skip, fast-dialogue timer, flag-on-complete, pause flag. Phaser mapping: a dedicated `CutsceneScene` (launched over the paused game scene) with: black radial vignette, a 16:9 image layer pair for crossfade (1.1 s alpha tween), a slow zoom/pan tween (14 s yoyo, 1.0 -> 1.05), additive-blend sprites (radial-gradient textures) positioned by the `t/l/w/h` percentages inside the image rect with alpha tweens following the keyframes (stepped ones via timed steps), the line text as a Phaser Text/DOM element with a 0.4 s fade+8 px slide, speaker label, arrow/OK, Skip, and a beat-segment progress strip. `drawScene` beats need the 200x130 pixel painters (or new art). Music = `startMusic(name)` / fade-out on close (needs the chiptune synth for `intro`, or replace with a recorded loop). Respect `reducedMotion` (no fades/zoom/crossfade) and `fastDialogue`.

---

## MessagesPanel  (lines 6881-6958)
- **What / where opened.** Read-only phone inbox. Opened from the header message-bubble button (`MessageSquare` icon, 11583) which shows a red unread badge (`unread>9 ? '9+' : n`, from `unreadMessageCount`).
- **Props.** `char` (`char.messages: {id:number, sender:string, text:string, day:number, minute:number, read:boolean}[]`, `char.day`), `setChar` (functional updater), `onClose()`.
- **Behaviour.** Newest first (`[...messages].reverse()`). On mount, if any message is unread, **all** are marked `read:true` via `setChar` (badge clears at once; only runs on mount). Tapping a message does nothing; no replies, no delete, no threads, `minute` is stored but never shown. Close with `x`; clicking the backdrop does NOT close.
- **Stamp text** `formatStamp`: `dayDelta=char.day-m.day`: 0 `TODAY`; 1 `YESTERDAY`; <7 `"{n} DAYS AGO"`; else `"DAY {m.day}"` (negative deltas, possible after dev-panel day rollback, print e.g. "-3 DAYS AGO").
- **Senders** (`SENDER_META`, 264-273): `parents` PARENTS `#fbbf24`; `rohzel` ROHZEL `#22d3ee`; `pigpen` PIG PEN `#fb7185`; `penny` PENNY `#a78bfa`; `foxy` FOXY `#84cc16`; `crystix` CRYSTIX `#22d3ee`; `beeamgee` BEEAMGEE `#D4A017`; `unknown` UNKNOWN `#a8a29e` (fallback for any other id).
- **Drawn.** Backdrop `rgba(12,10,9,.90)`, centred card `max-w-md w-full max-h-full overflow-y-auto bg stone-950 border-2 stone-800`. Sticky header: "MESSAGES" (Bebas, text-xl, tracking-widest, amber-500) + "{n} total" (9px, tracking .3em, stone-500) + `x` (text-2xl). Rows separated by stone-900 dividers, `px-3 py-2`: top line = sender display (11px, bold, tracking .3em, sender colour, Bebas) left and `"· STAMP"` right (9px uppercase stone-600); body = text (stone-300, text-sm, Oswald 300). Empty state: big dim `📭`, "no messages yet." and "your phone is quiet".
- **Rebuild.** DOM overlay or Phaser scrollable list; logic: mark-read-on-open, `formatStamp`. Messages are created elsewhere by `addMessage(c, sender, text)` (914): `{id: Date.now()+rand(0..999), sender, text, day:c.day, minute:c.minutes??0, read:false}`.

---

## FoxyAvatar  (lines 6960-7011)
- **What / where.** Tiny animated portrait of Foxy (roommate): `HouseScreen` Foxy panel (13465, size 36), `FoxyModal` header (7039, size 48), Foxy Soup row in the kitchen (14271, size 20, `animate={!claimed}`).
- **Props:** `size:number=36`, `animate:boolean=true`.
- **Drawn** (24x24 logical grid scaled to `size`, redrawn every rAF; head origin `x=12,y=22`): background `#1a3018`; glow circle centre (12,12) r14 `rgba(132,204,22,.12)`; head `(8,5,8,7) #e0b890`; hair `(7,3,10,3) #7a3a20` + side locks `(7,6,1,3)` and `(16,6,1,3)`; eyes `(9,8,2,1)` and `(13,8,2,1)` `#3a2010`; mouth `(11,11,3,1) #5a2020`; earring `(16,9,1,1) #fbbf24` that flashes `#fef3c7` for 4 frames every 90 frames (~1.5 s) when `animate`; sweater `(7,12,10,4) #5a8030` with highlight row `(7,12,10,1) #7aa040`. Canvas CSS `image-rendering:pixelated`, `display:block`.
- **Rebuild.** One 24x24 sprite (+ 2-frame earring blink); show at 20/36/48. Foxy is they/them (see FoxyModal subtitle).

---

## FoxyModal  (lines 7013-7091)
- **What / where opened.** Roommate interaction modal; opened by tapping the "FOXY - roommate" card in `HouseScreen` (13462; card shows the context tip from `pickFoxyTip`, "tap ->"). `HouseScreen` owns `foxyOpen`.
- **Props.** `char`, `setChar` (functional), `showToast(msg,type)`, `onClose()`.
- **Content.** 3 quote lines chosen once per mount (`useRef`): `pickFoxyTipsForModal(char,3)` (903) = [top-priority matching `FOXY_TIPS` rule's random line, else random `FOXY_QUIPS`] + 2 random distinct `FOXY_QUIPS` (8 ambient lines, shuffled by `sort(()=>random-.5)`). Tip rules (744-889), first match wins, in order: energy<=5, hunger<=5, mood<=10, energy<25, hunger<25, mood<30, rentLate>=2, rentLate===1, Saturday & cash<60 & tier-1 flat, cash<5 & no loan ("tap me"), cash<5 & loan taken, narrative (no firstJam; firstJam & no Pig Pen challenge & <3 jams; Pig Pen challenged not battled; battled with 0 wins; 1 win & no Penny reveal), showcase booked, Rohzel Friday offer hint (30+ fans, 5+ open mics), no open mic yet, 1-2 open mics, <5 followers, then day-of-week lines (Mon, Tue-Thu, Fri, Sat, Sun; `dow=day%7`). Each rule has 2-4 lines (text in source).
- **Wave button** ("say hi", daily): `canWave = (char.day - (storyFlags.lastFoxyWaveDay||0)) >= 1 || lastWaveDay===0`. Click (when enabled): `mood = min(100, mood+2)`; `storyFlags.lastFoxyWaveDay = day`; `daily.foxyHi += 1` (feeds daily challenge `foxy_hi` "Say hi to Foxy", target 1, reward mood +6, line 523); toast `'Foxy waved back. +2 mood'` (type `info`). Modal stays open; button then reads "already said hi today" and is disabled.
- **Loan button**: visible iff `cash < 5 && !foxyLoanTaken`. Click: (guarded in the updater) `cash += 15`, `foxyLoanTaken=true`, `mood = min(100, mood+3)`, adds a `foxy` message "this is a one-time thing. go busk in the park. seriously."; toast `'Foxy lent you $15. Go busk.'` (type `win`); closes the modal. If `foxyLoanTaken && cash<5`: dim line "you already borrowed once. busk in the park." (no button). One loan per character, ever (not day-limited). (`HouseScreen` also contains an identical `takeFoxyLoan` at 12990 that is never called - dead code; `FoxyModal` is the only live loan UI.)
- **Close:** `x` only (backdrop click does nothing).
- **Drawn.** Backdrop `rgba(12,10,9,.85)`; card `max-w-md bg stone-950 border-2 stone-800`; header row: avatar 48 + "FOXY" (lime-500, Bebas, text-xl, tracking-widest) + "roommate · they/them" (9px, tracking .3em, stone-500) + `x`; quotes block (italic, stone-300, text-sm, Oswald 300, each wrapped in straight quotes); footer `border-t-2` with full-width buttons: wave = `border-2 lime-500 text lime-500 hover bg lime-500/10` labelled `"👋 say hi to Foxy  ·  +2 mood"`, disabled = stone-800 border/stone-600 text; loan = `border-2 amber-500 text amber-500` labelled `"💸 ask Foxy for $15  ·  one-time"`.
- **State in/out.** Reads `char.day, char.mood, char.cash, char.foxyLoanTaken, char.storyFlags.lastFoxyWaveDay, char.daily.foxyHi`; writes `mood, cash, foxyLoanTaken, storyFlags.lastFoxyWaveDay, daily.foxyHi, messages`.
- **Rebuild.** Modal container with portrait, 3 text lines, 1-2 buttons; pure logic = the wave/loan reducers; tip picker = priority rule table (data outside range).

---

## DevPanel  (lines 7093-7242)
(Its leading comment block at 7093-7097 is mislabelled "ACHIEVEMENTS PANEL"; it describes this panel.)
- **What / where opened.** Hidden cheat panel. Mounted when `showDevPanel && devUnlocked` (11650). Unlock paths (App 11124-11153): (a) **triple-tap the day-of-week badge** in the header (`handleDevBadgeTap`: taps within 800 ms of each other; count resets after >800 ms gap; 3rd tap triggers): if already unlocked -> opens panel; else `window.prompt('Dev code:')` and `tryDevUnlock`; (b) hidden code field at the bottom of the Achievements panel; both accept code `808` (trimmed). Success sets `localStorage['beatbox_dev']='1'` (sticky across sessions), `devUnlocked=true`, opens the panel. When unlocked the badge text gets `*` suffix (e.g. `TUE*`) and amber-300 colour. Wrong code in the Achievements field -> red border + shake 0.4 s for 0.8 s.
- **Props.** `char`, `setChar` (functional updater), `onClose()`, `onLock()`. Returns null if `!char`.
- **ALL controls (29)** - group "Day": title `Day {day} · {DAYNAME} · {HH:MM}`:
  1. **Jump to next... MON TUE WED THU FRI SAT SUN** (7 buttons; current weekday highlighted amber): `setDow(i)`: `cur=day%7`, `delta=(target-cur+7)%7`, if `delta===0` then 7; `day += delta`, **`minutes = 0`**. (Weekday of day d = `DAY_NAMES[d%7]`: day 1 = TUESDAY, day 7 = MONDAY, Sunday/rent day = d%7==6.)
  2. **-7d, -1d, +1d, +7d**: `day = max(1, day+n)` (minutes unchanged).
  Group "Time of day - HH:MM":
  3. **Range slider** `min 0, max DAY_END-30 = 1170, step 30` bound to `char.minutes`; `setMinutes` clamps to [0,1170].
  4. **Presets 06:00 / 12:00 / 18:00 / 23:00** -> minutes 0 / 360 / 720 / 1020. (Clock = `(minutes+360)` mod 24 h; day starts 06:00; max settable shows 01:30.)
  Group "Cash - $x":
  5. **+$50, +$500, +$5k** (adds 50/500/5000) and **$0** (sets 0); `cash = max(0, n)`.
  Group "Stats - {followers} fans - LVL {level}":
  6. **Full restore**: `energy = maxEnergy ?? 100`, `hunger = 100`, `mood = 100`.
  7. **+50 fans**, 8. **+500 fans**: `followers = max(0, followers+n)`.
  9. **Fill XP bar**: `xp = level*100` (header bar -> 100%; does NOT level up until the next `checkLevelUp` call).
  10. **+5 MUS / +5 TEC / +5 ORI / +5 SHO** (4 buttons): `stats[key] = clamp(stats[key]+5, 0, 100)`.
  Footer:
  11. **Lock dev mode (forget code)**: `onLock` -> App removes `localStorage.beatbox_dev`, `devUnlocked=false`, closes panel.
  - **Not present:** level set, gear/sound unlock, story-flag or achievement toggles, rent/eviction controls, maxEnergy edit, cutscene replay, teleport/screen jump.
- **Side-effect caveat.** All edits are raw `setChar` merges; day/time jumps skip the normal sleep/rollover routine (rent, hunger/mood decay, daily/weekly resets, free Foxy soup day-keys) and the sound/achievement unlock check (`checkLevelUp`), which only fires on the next normal event.
- **Drawn.** Backdrop `bg stone-950/85 + backdrop-blur-sm`, click backdrop closes (card stops propagation). Card `w-full max-w-md max-h-[90vh] overflow-y-auto bg stone-950 border-2 amber-500/50 p-3 space-y-3`, glow `box-shadow 0 0 32px rgba(212,160,23,.18)`. Header "⚡ DEV PANEL" (amber-400, Bebas, text-base, tracking-widest) + sub "Hidden - triple-tap day badge to reopen" (10px stone-500) + `x`. Four `Panel`s (titles above) containing 7-col / 4-col / 2-col button grids (`py-1.5`, 10px uppercase, stone-800 border, stone-900/40 bg; "Full restore" tinted amber). Lock button full width with red hover.
- **Rebuild.** Not part of the shipped feel but needed for QA parity: DOM/Phaser debug overlay with the same 29 actions; implement as pure `char` mutators.

---

## SettingsModal  (lines 7244-7290)
- **What / where opened.** Device-level options modal. Opened by the header gear button `⚙ Settings` (11598) and the Title screen's Settings button (`onSettings`, 11505); state `showSettings` in `BeatboxStory`.
- **Props.** `onClose()` (settings come from `useSettings()`, not props).
- **Rows** (checkbox + label + description; `settings[k]` via `update({k:checked})`, persisted immediately to `localStorage.beatbox_settings`):
  | key | label | description text | default | effect |
  |---|---|---|---|---|
  | `muted` | Mute audio | "Silence every game sound - beats, stings, sleep rooster, the lot." | false | `getAudioCtx()` returns null (no new sound), looping music stops within ~25 ms of toggling |
  | `reducedMotion` | Reduce motion | "Skip the cutscene fade and the achievement modal pop-in." | false | Cutscene fades/crossfade/Ken-Burns, Achievement pop-in, App `screenFade` (0.28 s) all off |
  | `fastDialogue` | Fast dialogue | "Cutscene lines auto-advance after ~2s. Still tappable." | false | Cutscene 2000 ms auto-advance |
- **Behaviour.** Changes apply live (module cache + listeners). Close with `x` or backdrop click (card stops propagation). No Esc handling. Footer text: "Preferences are saved on this device."
- **Drawn.** Backdrop `bg stone-950/85 + backdrop-blur-sm`; card `max-w-md border-2 stone-700 p-3`; header "⚙ SETTINGS" (amber-500, Bebas, text-base, tracking-widest) + `x`; each row = `border-2 stone-800 bg stone-900/30` label with checkbox (browser default), title (stone-200, 12px uppercase tracking-widest, Bebas) + 10px stone-500 description.
- **Oddity.** `Row` is declared inside the component body -> a new component type per render (remounts the row each toggle; keyboard focus is lost).
- **Rebuild.** 3-toggle modal + a typed settings store (`muted`, `reducedMotion`, `fastDialogue`, key `beatbox_settings`); keep keys/defaults for save compatibility if the web build shares storage.

---

## AchievementFanfare  (lines 7292-7341)
- **What / where opened.** Celebration modal for a freshly earned achievement. `checkLevelUp` (11385) runs `applyAchievements`; for each newly earned item it queues the item in `achievementQueue` (App state), plays `playAchievement()` (880 Hz then 1318.5 Hz sine chime, 130 ms after) and shows a toast `"🏆 Achievement: {label}"` (140 ms). The App renders only `achievementQueue[0]` (`key=item.id`) and pops it on close, so multiple unlocks show one after another (11644-11649).
- **Props.** `item:{id,label,desc,tier:'b'|'s'|'g'}`, `onClose()`.
- **Behaviour.** Auto-closes after **3000 ms** (`setTimeout(onClose,3000)` in an effect keyed on `onClose`); tap backdrop or "Nice" closes early; card tap does not (stopPropagation). Tier colour `TIER_COLOR[tier]`: bronze `#a8a29e`, silver `#dadada`, gold `#fbbf24` (fallback `#fbbf24`). Reduced motion removes the pop-in animation.
- **Drawn.** Backdrop `rgba(12,10,9,.78)`; card `max-w-sm p-4 text-center border-2` in tier colour, background `linear-gradient(180deg, rgba(28,25,23,.95), rgba(12,10,9,.95))`, glow `box-shadow 0 0 28px {tierColor}44`; animation `achPop 0.5s ease-out` = scale .6 & opacity 0 -> (60%) scale 1.05 & opacity 1 -> scale 1. Contents top to bottom: "Achievement Unlocked" (10px uppercase, tracking .4em, tier colour), `🏆` (48 px emoji, same for every tier), label (text-xl Bebas, tracking-wider, stone-100), description (11px stone-400), "Nice" button (`border-2` tier colour, 10px uppercase, stone-300 -> amber-300 hover).
- **Rebuild.** Phaser modal container with scale-in tween (0.5 s: 0.6 -> 1.05 @0.3 s -> 1), tier-coloured frame/glow, trophy sprite (could differ per tier), queue (FIFO), 3 s auto-dismiss + tap, achievement chime. Fix the timer (see gotchas).

---

## AchievementsPanel  (lines 7343-7430)
- **What / where opened.** Trophy list, opened from the header trophy button (11605) as modal `showAchievements`. Also hosts the hidden dev-code entry.
- **Props.** `char` (`char.achievements: {[id]: dayNumberEarned}`), `onClose()`, `devUnlocked:boolean=false`, `onDevUnlock?:(code)=>boolean` (App `tryDevUnlock`), `onOpenDevPanel?:()=>void` (App closes this panel and opens DevPanel).
- **Behaviour.** `earned = ACHIEVEMENTS.filter(id in char.achievements)`, `locked = rest`; render earned first (definition order), a divider line when both lists non-empty, then locked. Header "ACHIEVEMENTS" + `"{earned}/{total} unlocked"` (total = 20). Close by `x` only (no backdrop close). Earned row: 🏆, label UPPERCASE in tier colour (`TIER_COLOR`, default `#a8a29e`), right-aligned `"day {n}"` (the in-game day earned), description below; border stone-800. Locked row: 🔒, label UPPERCASE in `#5a5046`, 60% opacity, border stone-900, description is still shown (nothing is secret).
- **Hidden dev section** (bottom, after a divider): if `devUnlocked`: full-width button "⚡ Open dev panel" (amber tint) -> `onOpenDevPanel`. Else: tiny "- hidden -" caption (9px, tracking .3em, stone-700) + `<input type="password" placeholder="code">` (uppercase mono, 10px) + "Enter" button; Enter key or button -> `onDevUnlock(code)`; false -> `devCodeBad` true for 800 ms (red border + `shake 0.4s` keyframes `translateX 0,-4,4,-3,3,0`), true -> clears the input (App opens the DevPanel; this panel stays open beneath it).
- **Achievement list** (`ACHIEVEMENTS`, defined at 604-626, outside the range; tier b=bronze, s=silver, g=gold; auto-checked in `checkLevelUp`, stored as `achievements[id]=day`):
  - b: `first_steps` First Steps (stand in the cypher once: `storyFlags.firstJam`); `cypher_regular` Cypher Regular (10 jams); `open_mic_newcomer` Open Mic Newcomer (1 open mic); `first_saturday` First Saturday (`pigPenBattled`); `one_hundred` One Hundred (100 followers); `gear_hoarder` Gear Hoarder (5 gear pieces); `sponsored` Sponsored (any `sponsor_*_signed`); `level_10` Level Ten (level 10).
  - s: `mic_veteran` Mic Veteran (10 open mics); `first_blood` First Blood (1 battle won); `pen_to_penny` Pen to Penny (beat Pig Pen twice); `thousand_strong` Thousand Strong (1,000 followers); `in_love` In Love (any romance state `couple`); `penny_revealed` Real Name Penny (`pennyReveal`); `crystix` Bro from the Forum (`crystixMet`).
  - g: `the_crew` The Crew (defeat all 7 opponents); `ten_k` Ten Thousand (10,000 followers); `completist_gear` Completist (Gear) (14 gear items); `sound_master` Sound Master (12 sounds); `all_sponsors` Five-Brand Athlete (sign snortvpn, redfull, sure, adipas, samsong).
- **Drawn.** Backdrop `rgba(12,10,9,.90)`; card `max-w-md max-h-full overflow-y-auto bg stone-950 border-2 stone-800`; sticky header (Bebas title text-xl amber-500, 9px subtitle, `x`); rows `p-2 border bg stone-900/30`, title line `text-sm` Bebas letter-spacing 1px with emoji `text-lg`, desc 10px uppercase tracking-wider stone-500.
- **Rebuild.** Scrollable list modal bound to `ACHIEVEMENTS` + `char.achievements`; hidden code field is a QA convenience.

---

## Appendix A - external symbols this range depends on
| symbol | defined | role here |
|---|---|---|
| `_px`, `_drawDaytimeSky`, `_clampPct` | 2263 / 2283 / 2287 | pixel drawing + clamp |
| `useSettings`, `getSettings`, `DEFAULT_SETTINGS` | 990 / 984 / 971 | settings store (key `beatbox_settings`) |
| `startMusic`, `stopMusic`, `_MUSIC_TRACKS {title,intro}` | 17829 / 17857 / 17825 | Cutscene music |
| `getAudioCtx` (mute gate), `playAchievement` | 17146 / 17625 | audio |
| `SENDER_META`, `addMessage`, `unreadMessageCount` | 264 / 914 / 927 | inbox |
| `FOXY_QUIPS`, `FOXY_TIPS`, `pickFoxyTip`, `pickFoxyTipsForModal` | 700 / 744 / 893 / 903 | Foxy content |
| `ACHIEVEMENTS`, `TIER_COLOR`, `applyAchievements` | 604 / 626 / 631 | achievements |
| `DAY_END` (1200), `DAY_NAMES`, `DAY_NAMES_SHORT`, `dayOfWeek(d)=d%7` | 1036 / 1060 / 1061 / 1062 | dev panel |
| `setGamePaused` | 2137 | pause flag set by App while a cutscene is up (checked in `useActivity` tick) |
| `drawFoxy` | 7945 | the full-body Foxy painter (avatar copies only the head) |
| lucide icons `Zap`, `Coffee`, `Heart`, `MessageSquare`, `Trophy` | import | used by `Bar`/header |

## Appendix B - how the App wires these (for the Phaser shell)
- State in `BeatboxStory` (11110-11131): `cutscene`, `showMessages`, `showAchievements`, `showSettings`, `achievementQueue[]`, `devUnlocked` (init from `localStorage.beatbox_dev==='1'`), `showDevPanel`.
- Header buttons (11547-11618), left to right: day badge (`MON..SUN` + `*` when dev), `Day N`, clock; right side: cash/fans, Messages (badge), Settings (gear glyph), Achievements (trophy), Profiles/Save slots (second gear glyph).
- Header bars: Energy / Fed / Mood (`Bar`) + 1-px XP strip `width = xp/(level*100)` gradient amber-600 -> amber-400.
- Level-up threshold `level*100` XP (`checkLevelUp` 11385) - relevant to the DevPanel "Fill XP bar".
- Screen content fades `screenFade 0.28s` unless reduced motion; the screen area is wrapped by a second `ScreenErrorBoundary`.

## Appendix C - Phaser mapping cheat-sheet
| Unit | Suggested Phaser form | Logic to keep |
|---|---|---|
| JamAnimation / RunAnimation | Scene layers or CanvasTexture 140x90 x4 in the Park activity panel | turn rotation (240 f), reward burst, run pose cycle, km text, parallax speeds |
| PIXEL_ICONS / PixelIcon | 17 textures (12 used) | name->icon map |
| ProgressBar / Bar / Btn / Panel | reusable UI components (9-slice) | segment fill rule (full/half/empty), clamp, variants |
| Error boundary / overlay | optional dev DOM overlay | - |
| PixelScene | RenderTexture host for `(ctx,frame)` painters | frame counter contract |
| Cutscene | own Scene launched over paused game | beat/line machine, skip, fast mode, flag-on-complete, pause flag, music |
| MessagesPanel, FoxyModal, Settings, Achievements, Fanfare, DevPanel | modal containers (DOM overlay is fine for scroll lists / inputs / range slider) | reducers described above, settings store, achievement queue |

## Appendix C2 - "Where to look" index (all line numbers in `beatbox-story.jsx`)
| Unit | Defined | Mounted / called from |
|---|---|---|
| JamAnimation | 5779-6019 | `ParkScreen` 15101 (activity panel, `selected==='jam'`) |
| RunAnimation | 6023-6245 | `ParkScreen` 15104 (`selected==='run' && !playMode`) |
| PIXEL_ICONS / PixelIcon | 6251-6455 / 6457-6487 | 13763, 13786, 13836 (House hotspots/tabs/stats), 14295 (food), 15051 (park activity list), 16395 (shop items) |
| ProgressBar | 6489-6501 | 14182 (House training), 15116 (Park activity) |
| Bar | 6506-6519 | header 11621-11623 |
| Btn / Panel | 6521-6534 / 6536-6543 | ~167 uses across screens (shop, food, plant, park, bar...) |
| ScreenErrorBoundary / GlobalErrorOverlay | 6553-6582 / 6587-6630 | 11498-11499, 11535-11536, 11671 |
| PixelScene | 6632-6678 | Cutscene 6790; Mingle 7509; House 13878; Park 15268 (open mic), 15339 (nap), 15472 (sleep) |
| Cutscene | 6680-6879 | App 11635 via `playCutscene` (11157); intro 11354; tutorials 11181; ~30 story call sites (e.g. 12583, 12721, 13300-13394, 14844-14899, 15755-15797, 16108-16122, 18436) |
| MessagesPanel | 6885-6958 | App 11636 (opened by header button 11583) |
| FoxyAvatar | 6965-7011 | 7039 (modal), 13465 (House panel), 14271 (Foxy soup row) |
| FoxyModal | 7016-7091 | `HouseScreen` 13479 (`foxyOpen`, card at 13462) |
| DevPanel | 7098-7242 | App 11650; unlock logic 11134-11153 |
| SettingsModal | 7246-7290 | App 11506 (title screen), 11643 (in game) |
| AchievementFanfare | 7295-7341 | App 11644 (queue from `checkLevelUp` 11406) |
| AchievementsPanel | 7343-7430 | App 11637 |

## Appendix D - Timing table (convert frame counts to ms for a Phaser fixed-step; 1 frame = 16.67 ms @60 fps)
| What | Source rule | Real time |
|---|---|---|
| Jam: turn changes member | `floor(f/240)%4` | every 4.0 s (cycle of 4 = 16 s) |
| Jam: active member leg bob | `floor(f/5)%2` | toggles every 83 ms (6 Hz full cycle = 167 ms) |
| Jam: mouth open/close | `floor(f/4)%2` | toggles every 67 ms |
| Jam: sound ring cycle | phase += 0.04/f | 417 ms per ring, 3 rings staggered by 0.33 |
| Jam: crowd head bob | `sin(0.1f + 0.5i)*0.5` | period 1.05 s, amplitude 0.5 px |
| Jam: raised-arm toggle (i%3==0) | `sin(0.15f + i) > 0` | period 0.70 s, 50% duty |
| Jam: cloud A / B speed | 0.04 / 0.025 px per frame | 2.4 / 1.5 px/s |
| Jam: reward sparkle life | ttl 30-50 frames | 0.5-0.83 s, 8 particles |
| Run: pose change | `floor(f/4)%4` | every 67 ms (full stride 267 ms) |
| Run: scroll speeds | 0.45 / 1.5 / 2.25 px per frame (mountains / trees+dashes / grass) | 27 / 90 / 135 px/s |
| Run: sweat spawn / life | every 30 f / 30 f | 0.5 s / 0.5 s |
| Run: motion-line slide | `f%8` | sawtooth every 133 ms |
| FoxyAvatar earring flash | `f%90 < 4` | 67 ms every 1.5 s |
| Cutscene line fade | CSS 0.4 s ease-out | 400 ms (scene wrapper 500 ms) |
| Cutscene image crossfade | CSS 1.1 s ease-in-out | 1100 ms |
| Cutscene Ken-Burns | 14 s ease-in-out alternate | 14 s each direction |
| Cutscene fast-dialogue | `setTimeout(advance, 2000)` | 2000 ms per line |
| Cutscene music fade in / out | 0.8 s ramp-in / 0.5 s ramp-out | - |
| Fanfare auto-dismiss | `setTimeout(onClose, 3000)` | 3000 ms |
| Fanfare pop-in | `achPop 0.5s ease-out` | 500 ms |
| Dev-code shake / red border | 0.4 s / 800 ms | - |
| Dev triple-tap window | gap > 800 ms resets count | - |
| Activity block tick (feeds `block`/`rewardKey`) | `TICK_REAL_MS=500` | 0.5 s per block, reward every 2.5 s |

## Appendix E - TypeScript shapes for the rebuild (derived from usage)
```ts
type Tier = 'b' | 's' | 'g';                         // TIER_COLOR: b #a8a29e, s #dadada, g #fbbf24
interface Settings { muted: boolean; reducedMotion: boolean; fastDialogue: boolean } // localStorage 'beatbox_settings'
interface Light { t: number; l: number; w: number; h: number; bg: string; anim?: string }  // percent of image box
interface Beat {
  lines: string[];
  image?: string; filter?: string; imageAnim?: string; lights?: Light[];   // image mode
  drawScene?: (ctx: CanvasRenderingContext2D, frame: number) => void;      // 200x130 pixel scene mode
}
interface CutsceneProps {
  speaker?: string | null; speakerColor?: string /* '#D4A017' */;
  beats?: Beat[]; lines?: string[];                                         // lines => [{lines}]
  music?: 'intro' | 'title' | null; onComplete?: () => void;
}
// playCutscene(props: CutsceneProps, flagPath?: string, after?: () => void)
//   -> show; on end/skip: hide, storyFlags[flagPath]=true, after()
interface PhoneMessage { id: number; sender: SenderId; text: string; day: number; minute: number; read: boolean }
type SenderId = 'parents'|'rohzel'|'pigpen'|'penny'|'foxy'|'crystix'|'beeamgee'|'unknown';
interface Achievement { id: string; label: string; desc: string; tier: Tier; cond: (c: Char) => boolean }
// char.achievements: Record<string /*id*/, number /*day earned*/>
interface ActivityViewProps { color: string; block: number /*0-4*/; rewardKey: number; active: boolean } // Jam/Run
interface UiBarProps { value: number; max: number; color: string; label: string; icon?: unknown }
interface ProgressBarProps { block: number; total?: number /*5*/; label?: string; color?: string /*'#D4A017'*/ }
type BtnVariant = 'default' | 'primary' | 'danger' | 'ghost';
// Char fields touched by this range: day, minutes, mood, energy, maxEnergy, hunger, cash, followers, xp, level,
//   stats{mus,tec,ori,sho}, messages[], achievements{}, storyFlags{lastFoxyWaveDay,...}, daily{foxyHi,...}, foxyLoanTaken
```

## Appendix F - Parity checklist (tick each when the rebuild matches)
**Park animations**
- [ ] Jam scene shows daytime park, sun, 2 clouds, 5 trees, 18-person crowd (6 raising arms), grass, dirt ellipse, 4 hooded beatboxers at the listed positions/scales/colours (player colour on the front one).
- [ ] Active member rotates YOU -> L1 -> R1 -> B1 every ~4 s; active one bobs, holds a mic, mouth animates, 3 gold sound rings; label `▶ XX` bottom-left.
- [ ] Reward (every 5 blocks) emits 8 gold/blue/pink/violet sparkles from centre; sparkles fall with gravity and fade.
- [ ] Run scene shows dusk sky bands, sun, mountains, trees, path, grass; runner with 4-pose cycle, sweat drops, speed lines, `{km}KM` label (0.5 per reward + 0.1 per block); scenery scrolls CONTINUOUSLY at three parallax speeds (fix the original bug).
- [ ] Both stop animating (idle pose, no scroll, no label) when `active=false`.
**Icons and UI kit**
- [ ] 12 used icons recreated (mic, jam, shoe, fridge, pc, couch, star, music, zap, sparkle, crown, coffee); optional 5 spare (fist, beer, shop, home, tree); crisp scaling at sizes 12/16/20/28/32.
- [ ] ProgressBar: 5 cells, full / half (current) / empty; Bar: label + rounded `v/max` + clamped fill; Btn: 4 variants + disabled 30%; Panel: titled frame.
**Cutscene**
- [ ] Beat/line state machine with arrow (`→`, `OK` on last), Skip, completion callback setting `storyFlags[flag]=true` and running `after`.
- [ ] Image beats crossfade 1.1 s; Ken-Burns 14 s; lights overlay (screen blend) with the 7 light keyframe behaviours (breathe, cyan pulse, monitor flicker, TV stepped flicker, neon live, strobe A/B); filter + strobe on the "blur" beat; scene beats via pixel painter; speaker label + colour; beat progress strip colours.
- [ ] Line fade/slide 0.4 s; fast dialogue 2 s auto-advance (incl. final); reduced motion disables fades/zoom/crossfade.
- [ ] `music` starts on open and fades on close; game clock paused while open; images preloaded.
**Phone / Foxy**
- [ ] Inbox newest-first, sender colours/names, relative stamps, empty state, marks all read on open, header badge with `9+` cap.
- [ ] Foxy: avatar, 3 quotes (1 context-priority + 2 ambient), wave (+2 mood, once per day, sets `lastFoxyWaveDay`, `daily.foxyHi`), loan ($15 once when cash<5; +3 mood; foxy message; closes), toasts with exact wording.
**Dev / settings / achievements**
- [ ] Dev unlock by triple-tap (800 ms) + code 808 (persisted flag); 29 controls exactly as listed; lock removes the flag.
- [ ] Settings: 3 toggles with the quoted labels/descriptions, persisted, applied live (mute kills music + sfx, reduced motion, fast dialogue).
- [ ] Achievement fanfare: tier colour, pop animation, trophy, label+desc, "Nice", 3 s auto-dismiss, tap to dismiss, queue; panel lists 20 achievements, earned first with "day N", locked dimmed with lock icon, `n/20 unlocked`.
**Error handling (optional)**
- [ ] Boundary card with Retry; global banner with dedupe + dismiss.

---

## OPEN QUESTIONS / GOTCHAS
1. **RunAnimation scenery disappears** (negative-number modulo): trees vanish ~1.9 s after the activity starts, mountains/grass/path dashes shortly after, leaving only sky/sun/path/runner. Almost certainly unintended. Decide: reproduce the bug (no) or implement continuous wrap at the speeds given above. Also `rewardKey` does nothing in Run (no "+1!" text); `block` only affects the km label; `JamAnimation.block` is unused.
2. **Frame-rate dependence**: all timings are per-rAF-frame (Jam turns, mouth, bob, clouds, sweat, earring blink, `PixelScene` frame counter). Port with a fixed 60 Hz clock; every `PixelScene` painter shares this assumption.
3. **Jam turn comment mismatch**: comment says ~5 s / 300 frames, code is 240 frames (~4 s). Cloud B pops in at x=30 when it wraps. NPC colours are fixed, not random as the comment says.
4. **Fanfare timer bug**: `onClose` is a fresh inline closure each App render (11648) and is an effect dependency, so the 3 s auto-dismiss restarts on every re-render; during an activity (state updates every 500 ms) the fanfare may never auto-close (tap only). Implement a true 3 s timer in the rebuild.
5. **Cutscene image mode ignores non-image beats and `drawScene`** (mixed cutscenes unsupported; check uses `beats`, not `allBeats`). `speaker` is per-cutscene only. Ken-Burns clocks all start at mount, not per beat.
6. **Cutscene has no keyboard support**, text tap does not advance, and fast-dialogue also auto-closes the final line after 2 s (story text can be missed). Skip fires the same completion (flag set, `after()` run); there is no "seen it" distinction.
7. **Pause coupling**: the global `_gamePaused` flag is set only by the App when `cutscene` is non-null. Other modals (messages, settings, achievements, fanfare, dev panel) do NOT pause activity ticks.
8. **Messages**: negative `dayDelta` prints "-N DAYS AGO"; `minute` unused; marks read only on mount (messages arriving while open stay unread); no backdrop close (also Foxy and Achievements modals; Settings, Dev and Fanfare do close on backdrop).
9. **DevPanel**: code `808` is hard-coded; `window.prompt` entry (awkward on mobile, hence the Achievements backup field); jumping days does not run the end-of-day/rollover logic (rent, decay, dailies) and `-Nd` does not reset minutes; "Fill XP bar" doesn't level; slider cannot reach 02:00 (max 01:30). A misleading comment header ("ACHIEVEMENTS PANEL") sits above `DevPanel`.
10. **Fonts**: Oswald weight 300 is requested in CSS but only 400/700 are loaded from Google Fonts -> body text renders at 400; Bebas Neue is used for most titles. Rebuild should pick/bundle one display + one body font.
11. **PixelIcon**: fallback square ignores `size`; non-multiple-of-16 sizes (12/20/28) get blurry edges; 5 icons (`fist`, `beer`, `shop`, `home`, `tree`) are unused (maybe meant for shop/home/bar menus).
12. **ProgressBar** shows the current block half-full even at block 0 (no real sub-tick progress); `ParkScreen` text says "1 block = 10 game min (0.5s)" while a nearby comment (14781) says 2 s per tick - code constant `TICK_REAL_MS=500` is authoritative.
13. **ScreenErrorBoundary** state is not reset when the screen changes (boundary wraps the keyed div), so after a crash the fallback persists until Retry.
14. **SettingsModal `Row`** is defined inside the component (remounts each toggle).
15. **Day-of-week mapping is non-obvious**: `dayOfWeek(d)=d%7` with `DAY_NAMES[0]=MONDAY`, so Day 1 = TUESDAY; bar open-mic nights Tue-Thu = d%7 1-3, battle Sat = 5, rent Sun = 6. The DevPanel and FOXY_TIPS depend on this.
16. Unverified/outside range: exact copy of `INTRO_BEATS` lines, the apartment-hotspot `PixelScene` painters, `RunTracker`/`RhythmTap` play modes, and the `MingleEncounter` that starts at 7432 belong to other ranges.
