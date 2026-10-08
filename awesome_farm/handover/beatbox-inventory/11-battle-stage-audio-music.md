# 11 - Battle stage, beatbox audio synth, hero sounds, sample storage, background music

Source: `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx`, lines 16420-17875 (read in full).
Line numbers below are file line numbers. "Outside range" notes are context read from other parts of the file only to explain data flow.

## SUMMARY

1. This range is the pixel battle-stage renderer (canvas 200x120 logical px, x3), the procedural sprite renderer `drawBeatboxer` (also used by ~20 cutscene scenes elsewhere), the battle HUD, ALL game audio synthesis, per-slot IndexedDB sample storage, and a 2-track procedural music engine.
2. Every sound is synthesized with raw Web Audio nodes straight into `ctx.destination` (no master bus, no compressor). There are NO audio files. 9 drum/percussion voices, 3 UI/utility sounds (rooster, beep, click), 5 stings, 4 hero keys, 2 music tracks.
3. Sounds are addressed by key: hero keys `B/T/K/Pf` (Kick/Hi-Hat/Rimshot/Snare) or `SOUND_CATALOG` ids (12). `playGameSound(key)` = recorded sample if present, else synth. 16 sample keys per save slot, stored in IndexedDB `beatbox-story-samples` as mono Float32 + sampleRate.
4. Music = lookahead scheduler (25 ms timer, 180 ms lookahead) calling a pure-ish `track.render(ctx,out,step,t,stepDur)` per step. Title: 160 BPM, 64 x 16th-steps (6.000 s loop), C-G-Am-F. Intro: 68 BPM, 32 quarter-steps (28.235 s loop), Am-F-C(m)-Em. Only 3 call sites: TitleScreen (`'title'`), Cutscene `music` prop (`'intro'`).
5. Stage visuals are 100% frame-counter driven (`frameCount++` per rAF, not time) -> animation speed doubles on 120 Hz screens. Port to dt-based or fixed 60 Hz step.
6. Player "perfect streak" drives an aura at streak >= 4 and a charged "ARMED" state at `FINISHER_THRESHOLD = 8`; the finisher splash is a separate full-overlay canvas (`FinisherSplash`, 2.6 s).
7. There are NO per-sound poses. The only pose state is `active` (leg bob + mouth flap). Per-sound feedback is only: floating lesson-name text, one 30-frame ring "sound wave" per round start, and (opp rounds only) random judge hearts.
8. HUD = names, score bars (max 400), 5 sound-category chips, 12 s timer disc, a symmetric hype meter (gap/80, 7 text bands) and a finisher gauge.
9. Confirmed bugs/oddities (details at end): malformed pixel heart, lip-roll LFO never decays, `inward_k` == `psh_snare` sound, open-hat buffer too short, Am bar in title uses a major arp, headphones right ear cup misplaced, FloatingSound re-keyed on every render, samples silently not loaded while muted, frame-rate-dependent animation.
10. Rebuild plan: extract pure data + pure functions (looks, hype bands, finisher math, note data, voice recipes as data) into framework-free TS; render sprite through a `px(x,y,w,h,color)` sink so the same code feeds Phaser Graphics/RenderTexture; keep one AudioContext (Phaser's `sound.context`), add SFX/music buses + limiter, and consider pre-rendering the two music loops with `OfflineAudioContext`.

---

## 0. Index of units (with line ranges)

| # | Unit | Lines |
|---|------|-------|
| 1 | FloatingSound | 16422-16439 |
| 2 | OPP_LOOKS, _defaultOppLook, JUDGE_LOOKS | 16446-16465 |
| 3 | drawBeatboxer | 16467-16559 |
| 4 | drawJudge | 16561-16581 |
| 5 | drawPixelHeart | 16583-16594 |
| 6 | lookFromChar | 16596-16608 |
| 7 | CharacterPortrait | 16610-16641 |
| 8 | FinisherSplash | 16643-16750 |
| 9 | PixelStage (+ its CSS keyframes, combo label) | 16752-17023 |
| 10 | _hypeLabel, FINISHER_THRESHOLD | 17028-17041 |
| 11 | BattleHUD | 17043-17139 |
| 12 | getAudioCtx | 17145-17156 |
| 13 | HERO_SOUNDS, HERO_SAMPLES | 17166-17175 |
| 14 | playRimshot | 17177-17211 |
| 15 | playHeroSound, playGameSound | 17213-17263 |
| 16 | IndexedDB sample storage | 17265-17380 |
| 17 | noiseBuffer + core drum/bass/FX voices | 17382-17501 |
| 18 | playSound (category dispatcher) | 17503-17553 |
| 19 | playRooster, playBeep | 17555-17593 |
| 20 | _blip + stings (level-up, achievement, unlock, win, loss) | 17595-17663 |
| 21 | Music engine primitives (_mtof, _musVoice, drums) | 17665-17735 |
| 22 | _TITLE track | 17737-17778 |
| 23 | _INTRO track | 17780-17823 |
| 24 | startMusic / stopMusic scheduler | 17825-17869 |
| 25 | BattleScreen header (start only) | 17871-17875 |
| 26 | Cross-cutting: colour tables, timing, module split, Phaser mapping | end |

Dependencies from OUTSIDE the range that these units use:
`_px(ctx,x,y,w,h,color)` (line 2263: sets `fillStyle`, `fillRect(Math.floor(x), Math.floor(y), w, h)` - floors x,y only), `ACCESSORIES` (665), `activeOutfitShirt` (681), `SOUND_CATALOG` (6), `getSettings()` (984; `muted` default `false`), `useRef/useEffect` (React), CSS font `"Bebas Neue","Oswald"`, Tailwind classes.

---

## 1. FloatingSound (16422-16439)

- What: HTML overlay (not canvas) that pops the current lesson/move name over the active fighter. Rendered by `PixelStage` when `currentSound && activeSide`.
- Props: `text` (string), `side` ('P'|'O'), `color` (default `'#D4A017'`).
- Visuals: `div.absolute.pointer-events-none`, `left: 15%` if side `'P'` else `55%`, `top: 38%`. Animation `soundFloat 1.2s ease-out forwards` (keyframes defined in PixelStage, see 9.9). Inner text: Tailwind `text-2xl` (24px) `font-black` `tracking-wider` `px-3 py-1`, font `"Bebas Neue","Oswald",sans-serif`, uppercase, fill = `color`, `textShadow: 2px 2px 0 #0c0a09, -1px -1px 0 #0c0a09, 1px -1px 0 #0c0a09, -1px 1px 0 #0c0a09`, `WebkitTextStroke: 0.5px #0c0a09`.
- Phaser: `Text`/`BitmapText` with stroke (#0c0a09, ~2px), tween: y 0 -> -5 -> -30 -> -50 px, scale 0.6 -> 1.1 -> 1 -> 0.9, alpha 0 -> 1 -> 1 -> 0 over 1.2 s (offsets 0 / 15% / 80% / 100%).
- Quirk: called with `key={currentSound + Date.now()}` (16996) -> the key changes on EVERY render of PixelStage, so the element remounts and the 1.2 s animation restarts each time the parent re-renders (timer tick each second, opp score tick every 1.2 s, streak changes). Intended: one pop per sound change. In the rebuild: spawn one tween per "text change" event only.
- What `text` actually is: the lesson name (e.g. `"BOOM BASIC → BACKBEAT"`), set once per round by BattleScreen (18129 / 18184), not per note.

---

## 2. Looks tables (16446-16465)

### OPP_LOOKS (keyed by NPC name) - 16447-16455
Fields: `shirt, skin, hair, style, accessory`.

| Opponent | shirt | skin | hair | style | accessory |
|---|---|---|---|---|---|
| Pig Pen | `#5a4030` | `#d4a87a` | `#1a1a2e` | mohawk | shades |
| Joel Burner | `#84cc16` | `#f5d4a8` | `#5a3a18` | short | none |
| CeDe | `#3b82f6` | `#d4a87a` | `#1a1a2e` | mohawk | shades |
| Sikker | `#a78bfa` | `#8a5a3a` | `#1c1917` | long | none |
| Alim | `#f97316` | `#a87844` | `#1c1917` | short | none |
| Olexinho | `#94a3b8` | `#c8b8a0` | `#9ca3af` | spike | shades |
| FatboxG | `#fbbf24` | `#5a3a20` | `#0c0a09` | fade | none |

`_defaultOppLook` (16456) = `{ shirt:'#CC2200', skin:'#d4a87a', hair:'#1c1917', style:'short', accessory:null }` (fallback for unknown names).
Pig Pen and CeDe differ only by shirt (brown vs blue) - identical hair/shades/skin.

### JUDGE_LOOKS (keyed by bias) - 16459-16465
| bias | hair | shirt |
|---|---|---|
| technicality | `#22d3ee` | `#0e3a4a` |
| musicality | `#a78bfa` | `#3a2a5a` |
| originality | `#fbbf24` | `#5a4030` |
| showmanship | `#fb7185` | `#4a1820` |
| random | `#84cc16` | `#2a3a1a` |

Judges are fixed in this order on the bench (PixelStage 16852): `['technicality','musicality','originality','showmanship','random']`, matching `JUDGES` (line 142: Tek, Mel, Origi, Showtime, Wildcard).

Rebuild: pure data; export as typed records. Skin tone of every judge is hard-coded `#d4a87a` (see drawJudge).

---

## 3. drawBeatboxer(ctx, x, y, look, facing, active, frameCount) (16467-16559)

What: THE shared character renderer. `(x, y)` = feet-centre (y = feet level, sprite grows upward). Used by PixelStage, CharacterPortrait, and ~20 cutscene scenes outside this range (lines 8255-10151, called with various look objects, `facing` 'left'/'right', `active` true/false). Pure function of its args; all draws via `_px` (integer-floored x,y).
Look object: `{ shirt, skin, hair, style: 'short'|'mohawk'|'long'|'spike'|'fade', accessory: null|'shades'|'glasses'|'cap'|'beanie'|'fedora'|'headphones' }`.

Animation derived from `frameCount` (60 fps assumed):
- `bob = active ? floor(fc/6) % 2 : 0` -> leg alternation every 6 frames (0.1 s), full cycle 12 frames (5 Hz).
- `blink = fc % 120 < 4` -> eyes hidden 4 frames every 120 frames (2 s). Affects only the plain eyes and the glasses highlights. Shades never blink.
- `mf = active ? floor(fc/4) % 4 : 0`; mouth open when `active && (mf === 1 || mf === 3)` -> pattern over 16 frames: closed 0-3, open 4-7, closed 8-11, open 12-15 (3.75 Hz flap at 60 fps).
- Idle (`active=false`): completely static except blink.

Draw order and exact rectangles `px(dx, dy, w, h, colour)` (relative to feet-centre; negative dy = up):

| Part | rect | colour |
|---|---|---|
| Shadow | (-7, 0, 14, 1) | `rgba(0,0,0,0.45)` |
| Left leg | (-4, -8 - bob, 3, 8) | `#1a1a2e` |
| Right leg | (1, -8 + bob, 3, 8) | `#1a1a2e` |
| Shoes | (-4,-1,3,1) and (1,-1,3,1) | `#fff` |
| Body/shirt | (-5, -19, 10, 11) | `look.shirt` |
| Collar highlight | (-5, -19, 10, 1) | `#fff` |
| Arms | (-7,-18,2,8) and (5,-18,2,8) | `look.shirt` |
| Hand (mic side) | handX = facing=='right' ? 6 : -8; (handX, -14, 2, 3) | `look.skin` |
| Mic handle | micX = facing=='right' ? 6 : -10; (micX, -19, 2, 3) | `#888` |
| Mic head | (micX - 1, -20, 4, 2) | `#aaa` |
| Head | (-4, -25, 8, 7) | `look.skin` |

Hair (after head):
- `short`: (-4,-27,8,2) hair.
- `mohawk`: (-4,-25,8,1) hair, plus crest (-1,-28,2,3).
- `long`: (-5,-26,10,2) top; side locks (-5,-23,1,5) and (4,-23,1,5).
- `spike`: (-4,-26,8,1); spikes (-3,-28,2,2), (0,-29,2,3), (2,-28,2,2).
- `fade`: (-4,-27,8,2) hair, plus (-4,-25,8,1) `#000` (black hairline row).

Eyes / face accessory (exclusive chain):
- `shades`: (-3,-23,7,1) `#0c0a09`.
- `glasses`: lenses (-3,-23,2,2) and (1,-23,2,2) `#1a1a1a`, bridge (-1,-22,2,1) `#1a1a1a`; if not blinking: white highlights (-2,-22,1,1) and (2,-22,1,1) `#fafafa`.
- otherwise: if not blinking: eyes (-3,-23,1,1) and (1,-23,1,1) `#1a1a2e`.

Hats (layered over hair; additional chain, independent of the above):
- `cap`: crown (-5,-28,10,2) `#dc2626`; band (-5,-28,10,1) `#fbbf24` (overwrites crown's top row); brim `(facing=='right' ? 4 : -8, -27, 4, 1)` `#dc2626`.
- `beanie`: (-4,-29,8,4) `#1a1a1a`; band (-4,-27,8,1) `#fbbf24`; pom (-1,-30,2,1) `#1a1a1a`.
- `fedora`: brim (-6,-29,12,1) `#1a1a1a`; crown (-4,-31,8,2) `#1a1a1a`; band (-3,-28,6,1) `#fbbf24`.
- `headphones`: bands (-5,-27,1,5) and (4,-27,1,5) `#1a1a1a`; top (-4,-28,8,1) `#1a1a1a`; ear cups (-6,-25,1,3) and (4,-25,1,3) `#dc2626`. NOTE: right cup is at x=4 (same column as the right band), left cup at x=-6 (one outside the left band) -> asymmetric; probably meant x=5.

Mouth (last): open -> (-1,-20,3,2) `#3a1010` (overlaps collar row y=-19); closed -> (-1,-20,3,1) `#5a2020`.

Bounding box: x in [-11..+8] (mic side adds width), y in [-31..0]. Standard figure ~26 px tall (head top -25, hat/hair to -31).
Facing only changes: hand/mic side and cap brim side.

Rebuild notes:
- Port as `drawBeatboxer(sink: PixelSink, x, y, look, facing, pose)` where `PixelSink.px(x,y,w,h,color)`; implement the sink for Phaser `Graphics.fillStyle().fillRect()` and for a `CanvasRenderingContext2D`/RenderTexture. Because the output has only 2 (bob) x 2 (mouth) x 2 (blink) x 2 (facing) states per look, bake to a spritesheet per look (8-16 frames) for cheap Phaser use; animate by `time`, not frame counter.
- Pose model to add (original has none): `active`, `bob`, `mouthOpen`, `blink` - keep these as a typed `Pose`.

---

## 4. drawJudge(ctx, x, y, look, vote, revealed, frameCount) (16561-16581)

What: seated judge, drawn at the bench (y=30). `frameCount` is accepted but unused (judges never animate).
Rects (relative to (x,y)):
- Body (-3,-7,6,7) `look.shirt`.
- Head (-3,-12,6,5) `#d4a87a` (all judges same skin).
- Hair (-3,-13,6,2) `look.hair`.
- Eyes (-2,-10,1,1) and (1,-10,1,1) `#1a1a2e`.
- Vote indicator only when `revealed`:
  - `vote === 'P'`: green up-arrow: (-2,-16,4,2) + (-1,-17,2,1), colour `#22c55e`.
  - `vote === 'O'`: red down-arrow: (-2,-16,4,2) + (-1,-15,2,1), colour `#dc2626`.
Judges placed at x = 30 + i*30 (30, 60, 90, 120, 150), y = 30 (bench top). `revealed = i < revealedJudges`.
Rebuild: pure; reveal is driven by BattleScreen (one judge per 700 ms, outside range 18380-18385).

---

## 5. drawPixelHeart(ctx, x, y, alpha=1) (16583-16594)

Sets `globalAlpha = alpha`, fillStyle `#fb7185` and draws 1x1 pixels: (x-1,y), (x+1,y), (x-2,y-1), (x+2,y-1), a 3-wide bar (x-1,y-1,3,1), (x,y+1). Resulting shape (rows top to bottom):
```
y-1: X X X X X      (x-2 .. x+2)
y  : . X . X .      (x-1, x+1)
y+1: . . X . .      (x)
```
This is NOT a heart (a 5 px bar over a V; the comment says "3x3 plus 2 side dots"). Visual bug in the original; in the rebuild draw a proper heart sprite (e.g. `.X.X. / XXXXX / .XXX. / ..X..`) or a heart emoji texture. Resets `globalAlpha = 1` afterwards.

---

## 6. lookFromChar(char) (16596-16608)

Pure: builds a look from a character record.
```
accId  = char?.accessory || 'none'
acc    = ACCESSORIES[accId]
isUnlocked = acc && try { acc.cond(char) } catch { false }
look = {
  shirt: activeOutfitShirt(char),          // outfit shirt if outfit != 'default' && unlocked, else char.color || '#D4A017'
  skin:  char?.skin || '#d4a87a',
  hair:  char?.hairColor || '#1a1a2e',
  style: char?.hairStyle || 'short',
  accessory: isUnlocked ? acc.id : null,   // 'none' has id null
}
```
ACCESSORIES (outside range, 665-673) unlock conditions: cap = openMicCount>=5; beanie = bjarneSessions>=3; shades = followers>=50; glasses = romanceState.pascal=='couple'; fedora = storyFlags.jamCount>=10; headphones = gear.premium_headphones. `activeOutfitShirt`: default shirt `char.color` fallback `'#D4A017'`.
Rebuild: keep as pure function `lookFromChar(char, accessoriesTable, outfitsTable)`.

---

## 7. CharacterPortrait({ look, size=64, active=false, bg='#1c1917', className='' }) (16610-16641)

- What: small animated canvas portrait of a character. Used in character creation (11768, size 140, active) and bar-keeper Rohzel panel (16349, size 64, active, look `{shirt:'#1c1917', skin:'#5a3a20', hair:'#0c0a09', style:'fade', accessory:null}`).
- Drawing: logical canvas 40x40; `PXSCALE = max(1, floor(size/40))` (size 64 -> 1 so the 40x40 canvas is CSS-stretched to 64; size 140 -> 3 -> 120x120 canvas CSS-stretched to 140); fills `bg`, then `drawBeatboxer(ctx, 20, 36, look, 'right', active, frame)`; rAF loop with a local `frame++` counter. CSS: `imageRendering: pixelated`, `width/height: size`, class `block border-2 border-stone-700` (border `#44403c`).
- Effect deps `[look, size, active, bg]` -> if parent passes a fresh `look` object literal each render (Rohzel does), the loop restarts each parent render (frame resets - blink/mouth phase jumps).
- Rebuild: Phaser Image/Sprite from the baked frames; no loop needed.

---

## 8. FinisherSplash({ name, bonus, peak }) (16643-16750)

- What: full overlay on the battle stage when a player round ends with peak streak >= 8 (BattleScreen 18319-18323: `bonus = round(score*0.5 + peak*4)`; shown 2600 ms vs 1500 ms for normal round end; name = `finisherMoveName()`: `'MEGA COMBO'` if no MPC gear or no pad notes in `oriSlots[0]`, else `"<CHAR NAME>'S SIGNATURE"`, fallback `'SIGNATURE COMBO'`).
- Container: `div.absolute.inset-0.flex.items-center.justify-center` with CSS `finisherSlam 0.4s ease-out`: keyframes 0% scale(.6) opacity 0 / 40% scale(1.1) opacity 1 / 70% scale(.98) / 100% scale(1). Canvas `w-full h-full`, `imageRendering: pixelated`.
- Canvas: W=200, H=120, S=3 -> 600x360, `ctx.scale(3,3)`, `imageSmoothingEnabled=false`, rAF loop with frame counter `fc` (effect deps `[name, bonus, peak]`).
- Layers per frame (all in logical px):
  1. Fill `#1a0612` full; overlay fill `rgba(220,38,38, 0.18 + 0.10*sin(fc*0.15))`.
  2. 4 expanding rings centred (100,60): `phase = ((fc + r*12) % 60)/60`, radius `10 + phase*90`, stroke `#fbbf24`, lineWidth 1, alpha `(1-phase)*0.6`.
  3. 14 vertical scrolling bars (comment says diagonal, they are vertical): `lx = ((i*18 + fc*4) % (W+60)) - 30`, rect (lx,0,2,H), `#fef3c7`, alpha 0.18.
  4. 22 rising sparks: init random x in [0,W], y in [0,H], `vx=(rand-0.5)*0.6`, `vy=-0.6-rand*1.2`, `ttl=60+rand*40`, colour random of `['#fef3c7','#fbbf24','#f97316','#dc2626']`. Each frame `life++`, move by v; if `life>ttl || y<-4` respawn at random x, y=H+4, life 0, vy new random in [-1.8,-0.6] (vx/ttl/colour NOT re-randomised; respawn frame is not drawn). Draw 1x1 at floor(x,y), alpha `1 - life/ttl`.
  5. Flame strip: 22 flames, `fx = i*9 + 4`, `fy = H - 14 - floor(sin((fc + i*12)*0.2)*3)`; rects: (fx-1, fy+4, 4, 10) `#dc2626`; (fx, fy+2, 2, 10) `#f97316`; (fx, fy, 1, 6) `#fbbf24`; if `(fc+i) % 4 < 2`: (fx, fy-2, 1, 2) `#fef3c7`.
  6. Title `'FINISHER!'`: `bold 26px monospace`, centred; shadow `#0c0a09` at (W/2+1, 50); fill at (W/2, 49) alternating every 4 frames: `(fc%8)<4 ? '#fef3c7' : '#fbbf24'`.
  7. `★ <name> ★`: `bold 9px monospace`, `#fef3c7`, y=64.
  8. `<peak> PERFECT IN A ROW · BONUS +<bonus>`: `bold 7px monospace`, `#a8a29e`, y=78.
- Phaser: a Container with Graphics/particles; ring/flame/spark effects are simple; use real fonts (monospace -> a bitmap pixel font). Tween: scale 0.6 -> 1.1 -> 0.98 -> 1 + alpha in 0.4 s (offsets 0/40%/70%/100%).
- Audio: none (no finisher sound exists in this range; BeatboxHero plays notes itself). Opportunity: add a stinger.

---

## 9. PixelStage (16752-17023)

### 9.1 Role, props, state in/out
- What: the battle canvas (player left, opponent right, judge bench top, crowd bottom) plus HTML overlays (FloatingSound, comboLabel). Used in BattleScreen: intro (18461: no activeSide), rounds/countdown (18675), judging (18761: judgeVotes + revealedJudges).
- Props: `char`, `opponent`, `activeSide` ('P'|'O'|null), `currentSound` (string|null), `soundColor` (hex), `judgeVotes` (array of `{judge, vote:'P'|'O', pScore, oScore}`; `[]` in rounds), `revealedJudges` (0-5), `judgeHearts` (int[5], default `[0,0,0,0,0]`), `comboLabel` (`{text,key}`|null), `playerStreak` (int, default 0).
- Canvas: W=200, H=120, `PXSCALE=3` -> 600x360 backing store; wrapper `div.relative.w-full.overflow-hidden.border-2.border-stone-800`, `aspectRatio: '5/3'`, background `#0c0a09` (comment: 5:3 instead of old 5:4 - sky cropped).
- Refs: `heartsRef`, `sparksRef`, `lastHeartsRef = [0,0,0,0,0]`, `wavesPlayerRef`, `wavesOppRef`, `propsRef` (latest props for the rAF loop), `activeSideRef`.
- The rAF loop effect has deps `[char.color, opponent.name]` only: player look (`lookFromChar(char)`) and opponent look are computed once per (color, opponent) - outfit/accessory changes mid-battle are not picked up. All other values are read through `propsRef.current`.
- Colour-in: player round colour = `char.color` (BattleScreen 18296), opp round colour `'#CC2200'` (18294) -> used for waves and FloatingSound.

### 9.2 Static scene, back-to-front (logical px)
1. Back wall: (0,0,200,30) `#1a0d2e`; upper (0,0,200,15) `#0f0820`.
2. 12 stars (static): `sx = (i*17 + 9) % 200`, `sy = (i*5 + 4) % 14`, 1x1, colour `i%3==0 ? '#fef3c7' : '#a78bfa'`.
3. Two spotlight cones, fill `rgba(212,160,23,0.10)`: left polygon (20,0) (0,0) (0,60) (80,60); right polygon (180,0) (200,0) (200,60) (120,60).
4. Judges bench: top (18,30,164,4) `#5a4030`; edge (18,34,164,1) `#3a2818`; legs (22,34,2,6) and (176,34,2,6) `#3a2818`.
5. 5 judges at (30+30i, 30), looks from JUDGE_LOOKS by bias order, `vote = judgeVotes?.[i]?.vote`, `revealed = i < revealedJudges`.
6. Stage floor: (0,60,200,40) `#3a2818`; 3 plank lines (0, 65+11i, 200, 1) `#2a1808` at y=65,76,87; top lip (0,60,200,2) `#5a4030`.
7. Crowd: base (0,100,200,20) `#0c0a09`; 25 silhouettes, `cx = 4 + i*8`, `ch = 4 + ((i*7) % 6)` (4-9): body (cx, 100-ch, 6, ch) `#1c1917`, head (cx+1, 98-ch, 4, 3) `#0c0a09`. Static (no bobbing).
8. Crowd raised hands: only when `activeSide` truthy and `frameCount % 30 < 15` (flicker 2 Hz): 6 arms at `cx = 12 + i*30 + ((i*3) % 7)`, rect (cx, 94, 1, 4) `#1c1917`.

### 9.3 Fighters
- Player: `drawBeatboxer(ctx, 60, 95, playerLook, 'right', activeSide==='P', fc)`; Opponent: `drawBeatboxer(ctx, 140, 95, oppLook, 'left', activeSide==='O', fc)`; feet at y=95. Drawn AFTER the aura so they sit on top.
- No sound-specific poses: the only pose variables are `active` (bob legs + mouth flap) and blink. Judges don't animate. The opponent never gets an aura.

### 9.4 Player streak aura (`ps = playerStreak`, only when `ps >= 4`), centre (cx=60, cy=78)
- `auraIntensity = min(1, (ps-4)/6 + 0.4)` (4 -> 0.4, 10 -> 1.0); `auraR = 16 + min(8, ps-4)`.
- Outer halo: circle radius `auraR+4`, `#f97316`, alpha `0.18*I`. Inner glow: circle radius `auraR`, `#fbbf24`, alpha `0.30*I`.
- Flame tongues: count `7 + min(6, ps-4)`; for i: `angle = i/count*2PI + fc*0.04`; `wob = sin((fc + i*11)*0.18)*2`; `dist = auraR - 2 + wob`; `fx = floor(cx + cos(angle)*dist)`, `fy = floor(cy + sin(angle)*dist - 2)`. Layers: (fx-1,fy-4,3,6) `#dc2626`; (fx,fy-5,2,5) `#f97316`; (fx,fy-6,1,4) `#fbbf24`; if `(fc+i)%4<2` tip (fx,fy-7,1,2) `#fef3c7`. (Flame tongues are rectangles all pointing up regardless of angle.)
- 4 embers: `phase = ((fc + i*11) % 30)/30`; `ex = cx + sin((fc + i*17)*0.1)*(12 + phase*6)`; `ey = cy - 8 - phase*22`; alpha `(1-phase)*I`; 1x1; colour `phase<0.4 ? '#fef3c7' : '#fbbf24'`.
- If `ps >= FINISHER_THRESHOLD (8)`:
  - every 12 frames, first 6 on (`fc%12<6`): pale rect (cx-8, cy-14, 16, 28) `#fef3c7` at alpha 0.4 (drawn BEFORE the sprite, so it is a flashing backdrop, not an overlay "on the body" as the comment says).
  - Text `'⚡ ARMED'`: `bold 6px monospace`, `#fef3c7`, centred at (cx, 50 + bob), `bob = floor(sin(fc*0.2))` in {-1, 0}.

### 9.5 Sound waves
- Effect on `[currentSound, soundColor]`: if `currentSound` truthy and `activeSideRef.current` set, push `{life:0, ttl:30, color: soundColor || '#D4A017'}` to the player or opponent wave array. Since `currentSound` is the lesson name set once per round, this fires ONCE per round start (not per note). If a player round has the same lesson name as the previous player round and `currentSound` isn't nulled in between, no wave is emitted.
- Draw: for each wave: `life++`, remove when `life > ttl`; `t = life/ttl`; alpha `(1-t)*0.6`; radius `r = 4 + t*18`; 10 single pixels at `angle = a/10*2PI`, centre `(sx, 78)` with `sx = 60` (player) / `140` (opp); skip out-of-canvas pixels. 1x1 rects, colour `w.color`.

### 9.6 Judge hearts + sparks
- Effect on `[judgeHearts]`: for each judge i, if `judgeHearts[i] > lastHeartsRef[i]`: set last = new value, and spawn ONE heart `{x:30+30i, y:20, vx:(rand-0.5)*0.5, vy:-0.8-rand*0.6, life:0, ttl:60}` plus 5 sparks `{x: judgeX+(rand-0.5)*4, y:20, angle: -PI/2 + (rand-0.5)*PI, vx: cos(angle)*(0.4+rand*0.8), vy: sin(angle)*(0.4+rand*0.8), ttl:16, color: random of ['#fb7185','#fbbf24','#f43f5e']}`.
- Heart update per frame: `life++; x+=vx; y+=vy; vy+=0.02`; `t=life/ttl`; remove if `t>1`; draw `drawPixelHeart(floor x, floor y, 1 - t*0.7)`.
- Spark update: `life++; x+=vx; y+=vy; vy+=0.05`; remove if `life>ttl`; alpha `1 - t`; 1x1.
- Who generates hearts: ONLY the opponent-round routine in BattleScreen (outside range 18136-18150): per pattern note, 30% chance, random judge index, `judgeHearts[i] += 1`, at the note's time. Player rounds never produce hearts; hearts are never reset (state is never zeroed in BattleScreen), and `lastHeartsRef` is a high-water mark - so it only ever spawns when a count exceeds its previous max; `judgeHearts={[0,0,0,0,0]}` is passed during countdown/judging without effect.

### 9.7 Overlays
- FloatingSound: 1 (position left 15% for P / 55% for O, top 38%).
- comboLabel (only when `comboLabel && activeSide === 'P'`): `div.absolute` left 8%, top 12%, anim `comboPop 1.6s ease-out forwards`, keyed by `comboLabel.key`; box `text-base font-black tracking-widest px-2 py-1 border-2 border-amber-500 bg-amber-500/20` (amber-500 = `#f59e0b`, bg 20% alpha), font Bebas Neue/Oswald, colour `#D4A017`, `textShadow: 2px 2px 0 #0c0a09`; text `"🔥 " + comboLabel.text` (= the lesson name, BattleScreen 18187).
- CSS keyframes defined inline (9.9).

### 9.8 Timeline summary (frame-based, 60 fps assumed)
Blink 4/120 frames; leg bob 6 frames; mouth 4 frames; crowd hands 15 on/15 off; aura flame angle +0.04 rad/frame; ARMED flash 6 on/6 off; waves 30 frames; hearts 60 frames; sparks 16 frames.

### 9.9 CSS keyframes (inline `<style>`)
```
soundFloat: 0% translateY(0) scale(.6) op0 | 15% translateY(-5px) scale(1.1) op1 | 80% translateY(-30px) scale(1) op1 | 100% translateY(-50px) scale(.9) op0
comboPop:   0% translateY(8px) scale(.5) rotate(-4deg) op0 | 15% translateY(-2px) scale(1.15) rotate(-2deg) op1 | 85% translateY(-4px) scale(1) rotate(-2deg) op1 | 100% translateY(-12px) scale(.95) rotate(-2deg) op0
```
(`countdownPop` is defined later in BattleScreen, outside range.)

### 9.10 Rebuild notes (stage)
- Pure/data: stage layout constants, star/crowd generators (deterministic by index), look tables, hype + aura parameter functions (`auraParams(streak) -> {intensity, radius, flameCount, armed}`).
- Phaser: bake the static layers (wall, stars, spotlights, bench, floor, crowd silhouettes) once to a RenderTexture at 200x120, display at integer zoom with `pixelArt: true`; dynamic parts via a `Graphics` redrawn per frame or sprites; particles with the built-in emitter or manual arrays. Convert all frame counters to ms-based time (`t = scene.time.now / 16.667`) or run a fixed-step 60 Hz accumulator.
- Add per-note feedback (the original only pulses once per round).

---

## 10. _hypeLabel(gap) and FINISHER_THRESHOLD (17028-17041)

`gap = pScore - oScore` (raw score points). Bands (first match wins):

| gap | text | colour |
|---|---|---|
| >= 60 | `CROWD GOES WILD` | `#fbbf24` |
| >= 25 | `YOU'RE COOKING` | `#fbbf24` |
| >= 8 | `EDGE: YOU` | `#a3e635` |
| > -8 | `NECK AND NECK` | `#a8a29e` |
| > -25 | `OPP HAS THE EDGE` | `#fb923c` |
| > -60 | `SHAKE IT OFF` | `#fb7185` |
| else | `BURIED` | `#dc2626` |

`FINISHER_THRESHOLD = 8` (perfect hits in a row). Defined at module level AFTER PixelStage uses it (fine at runtime, TDZ only matters at first call).
Rebuild: pure functions `hypeLabel(gap)`, `hypePct(gap) = clamp(gap/80*100, -100, 100)`, `finisherFill(streak) = min(100, streak/8*100)`, `isArmed(peak) = peak >= 8`, `finisherBonus(score, peak) = round(score*0.5 + peak*4)` (the last from BattleScreen 18320, outside range).

---

## 11. BattleHUD({ char, opponent, timeLeft, pScore, oScore, streak=0, finisherArmed=false }) (17043-17139)

DOM/Tailwind HUD above the stage (rounds + countdown only; BattleScreen 18669). `div.space-y-1.5.mb-2` with three rows.

Data derivation:
- `playerSounds = char.equipped.slice(0,5).map(id => SOUND_CATALOG[id])`; `oppSounds = opponent.sounds.slice(0,5).map(...)`.
- `gap = pScore - oScore`; `hypePct = clamp(gap/80*100, -100, 100)`; `hype = _hypeLabel(gap)`; `finisherFill = min(100, streak/8*100)`.

Row 1: grid `grid-cols-[1fr_auto_1fr] gap-2 items-center`.
- Left (player): name uppercase, `text-amber-500 text-xs tracking-wider truncate`, font Bebas Neue/Oswald. Streak badge shown if `streak > 0`: `text-[9px] uppercase tracking-widest font-bold`, colour classes: `streak >= 8` -> `text-amber-300 animate-pulse` (`#fcd34d`), `streak >= 4` -> `text-amber-400` (`#fbbf24`), else `text-stone-500` (`#78716c`); text `"🔥 "` prefix when streak>=4, then `"×" + streak`.
  Score bar: `h-1.5 bg-stone-900 border border-stone-800` (stone-900 `#1c1917`, stone-800 `#292524`), fill `bg-amber-500` width `min(100, pScore/400*100)%` with `transition: width 0.3s`.
  Sound chips: 5 boxes `w-5 h-5` (20 px) `border border-stone-700 bg-stone-900` (stone-700 `#44403c`), `text-[8px] text-amber-500`, content `s?.cat?.[0] || '?'` = first letter of category (K=Kicks, H=Hats, S=Snares/Scratch, B=Bass, W=Whistles, L=Liproll, C=Clicks).
- Centre: timer disc `w-12 h-12 rounded-full border-2 border-stone-700 bg-stone-900`, number `text-amber-500 font-mono text-lg font-bold` (= `timeLeft`, 12 -> 0).
- Right (opponent): mirrored; name `text-red-500` (`#ef4444`), bar fill `bg-red-600 ml-auto` (`#dc2626`) width `min(100, oScore/400*100)%`, chips `text-red-500`, `justify-end`.

Row 2: HYPE meter (`px-1`):
- Label row: `flex justify-between text-[9px] uppercase tracking-[0.3em] text-stone-500`: left `OPP`, centre `hype.text` (bold, `hype.color`), right `YOU`.
- Bar `relative h-2 bg-stone-900 border border-stone-800`; centre marker `absolute left-1/2 w-px bg-stone-700`; if `hypePct >= 0`: amber-500 block `left:50%`, `width: hypePct/2 %`, `transition: width .4s`; else red-600 block `left: (50 + hypePct/2)%`, `width: (-hypePct/2)%`, `transition: all .4s`.
- No exact numbers are shown (design intent: hype only).

Row 3: Finisher gauge, shown only if `streak > 0 || finisherArmed`:
- Label: armed -> `'⚡ FINISHER ARMED'` (`text-amber-300 font-bold`), else `'FINISHER'` (`text-stone-500`); right: `"<min(streak,8)>/8 perfects"` (`text-stone-600` `#57534e`).
- Bar `h-1 bg-stone-900 border border-stone-800`; fill `bg-amber-300` if armed (+ `boxShadow: 0 0 8px #fbbf24`), else `bg-amber-600` (`#d97706`); width `finisherFill%`, `transition: width .2s`.
- `finisherArmed` latches true for the rest of the round once streak hits 8 (BattleScreen 18338-18341, reset on round end 18330/countdown 18222), so after a break the label stays "ARMED" while the counter shows 0/8.

Props flow in/out: HUD only reads. BattleScreen passes `timeLeft = isCountdown ? ROUND_SECONDS(12) : timeLeft`, `streak = isCountdown ? 0 : streak`, etc.
Rebuild: pure view-model `hudModel({scores, streak, armed, ...})` -> numbers/colours; Phaser draws with Graphics/Text. Score bars cap at 400 (scores beyond clamp).

---

## 12. getAudioCtx() (17145-17156)

- Returns `null` on server (`window` undefined) or if `getSettings().muted` (this is how mute kills every sound: all helpers early-return when ctx null).
- Lazily creates ONE shared `AudioContext` (`window.AudioContext || window.webkitAudioContext`), try/catch -> null on failure.
- If state is `'suspended'` calls `resume()` (errors swallowed). Called on every sound trigger, so browsers' user-gesture unlock happens on the first tap.
- No master gain, compressor, or bus: every voice connects directly to `ctx.destination`.
- Rebuild: use Phaser's `this.sound.context` (WebAudioSoundManager) as the single context; create `master -> compressor/limiter -> destination`, and `sfxBus`, `musicBus`; keep mute as a gain flag or `sound.mute`. Handle autoplay lock with `this.sound.locked` / `sound.once('unlocked')`.

---

## 13. HERO_SOUNDS and HERO_SAMPLES (17166-17175)

```
HERO_SOUNDS = {
  B:  { name:'Kick',    color:'#CC2200', label:'B',  cat:'Kicks',   defaultSound:'classic_kick' },
  T:  { name:'Hi-Hat',  color:'#22d3ee', label:'T',  cat:'Hats',    defaultSound:'hi_hat'       },
  K:  { name:'Rimshot', color:'#a78bfa', label:'K',  cat:'Rimshot', defaultSound:'rimshot'      },
  Pf: { name:'Snare',   color:'#fbbf24', label:'Pf', cat:'Snares',  defaultSound:'psh_snare'    },
}
HERO_SAMPLES = {}   // key -> AudioBuffer (loaded custom recordings for the CURRENT slot); missing = use synth
```
- These 4 are the "always unlocked" lanes of BeatboxHero (BOOM/HATS/RIM/SNARE styles share the same colours: `STYLE_COLORS` at line 4182 = `{BOOM:'#CC2200', HATS:'#22d3ee', RIM:'#a78bfa', SNARE:'#fbbf24'}`; `STYLE_BEATS = {BOOM:'HATS', HATS:'RIM', RIM:'SNARE', SNARE:'BOOM'}`; `styleMatchup`: 1.5 you counter, 0.7 countered, else 1.0 - outside range).
- Oddities: `defaultSound:'rimshot'` is not a `SOUND_CATALOG` id (harmless; used to filter catalog lists elsewhere: lines 5115, 5684, 15493); category `'Rimshot'` is not handled by `playSound` (would fall to default kick) - rimshot only exists via `playHeroSound('K')`.
- Rebuild: typed const + mutable `Map<string, AudioBuffer>`.

---

## 14. Synth: playRimshot(ctx, t) (17177-17211)

Three layers into `destination`:
- Body: sine, freq `350` at t -> exponential ramp to `180` at t+0.08; gain `0.4` at t -> exp ramp `0.001` at t+0.09; start t, stop t+0.1.
- Click: square, freq `800` at t -> exp `400` at t+0.02; gain `0.2` -> exp `0.001` at t+0.025; stop t+0.03.
- Noise: `noiseBuffer(ctx, 0.05)` -> bandpass `2000 Hz`, Q `1.5` -> gain `0.15` -> exp `0.001` at t+0.04; start t, stop t+0.05.

---

## 15. playHeroSound(key) and playGameSound(soundKey) (17213-17263)

`playHeroSound(key)`:
1. `ctx = getAudioCtx()`; return if null (muted).
2. If `HERO_SAMPLES[key]`: `BufferSource` (buffer = sample) -> `GainNode` value `1.0` -> destination; `src.start(0)` immediately (no pitch/envelope/trim at play time); on any exception falls through to synth.
3. Synth fallback at `t = ctx.currentTime`: `B -> playKick(ctx,t,60)`; `T -> playHat(ctx,t,false)`; `K -> playRimshot`; `Pf -> playSnare`. Unknown key -> return.
- No latency compensation; fires "now" (used from tap handlers, 2643 `LANE_INFO[lane].heroKey`).

`playGameSound(soundKey)` (unified entry point; callers: BeatboxHero tap 4604 when `inputMode !== 'mic'`, auto-play of pattern notes 4872, sequencer cells 5069/15231, record preview 5572/5734, pad press 15523):
1. Falsy -> return. Hero key -> `playHeroSound`.
2. Else `HERO_SAMPLES[soundKey]` sample (same BufferSource+gain 1.0) else `meta = SOUND_CATALOG[soundKey]; playSound(meta.cat, meta.name)`.
Rebuild: `AudioEngine.play(key)`; sample -> synth fallback chain is pure data (`samples.get(key) ?? synthRecipe(key)`).

---

## 16. IndexedDB sample storage (17265-17380)

- DB: `'beatbox-story-samples'`, version `1`; one object store `'samples'` (no keyPath, out-of-line keys).
- Key format: `` `slot${slotN}:sample-${key}` `` with `key` in `ALL_SAMPLE_KEYS() = [...Object.keys(HERO_SOUNDS), ...Object.keys(SOUND_CATALOG)]` = `B, T, K, Pf` + 12 catalog ids (`classic_kick, hi_hat, psh_snare, inward_k, throat_kick, fast_hats, lip_roll, inward_bass, d_low, laser, click_roll, uvular_roll`) = 16 keys per slot.
- Value: `{ float32: Float32Array (or ArrayBuffer), sampleRate: number }` - mono, channel 0 only. `recordToBuffer` accepts either a `Float32Array` or something `new Float32Array(...)`-able, creates a 1-channel `AudioBuffer` at the stored `sampleRate`.
- `openIdb()`: memoised promise; rejects if `indexedDB` undefined; `onupgradeneeded` creates the store if absent.
- `idbGet/idbPut/idbDelete`: each wraps one transaction in try/catch; failure returns `null`/undefined silently (storage unavailable -> samples are session-memory only).
- `loadSamplesForSlot(slotN)`: if `!slotN` -> clears `HERO_SAMPLES`. Else sequentially `await idbGet` for all 16 keys; `recordToBuffer(rec)`; set or delete `HERO_SAMPLES[k]`. Called at: app start for the active slot (11278), on slot select (11346) and on character create/change (11353).
- `saveSampleForSlot(slotN, key, buffer)`: no-op if no slot; copies channel data (`getChannelData(0).slice()`), sets `HERO_SAMPLES[key] = buffer` first (instant availability), then `idbPut`.
- `deleteSampleForSlot` / `deleteAllSamplesForSlot` remove memory + DB entries (all = loop 16 keys).
- Context for how a sample is made (outside range, `processSample` 5596-5629 in the recorder UI): decode the recording (MediaRecorder blob -> `decodeAudioData`), channel 0, trim leading/trailing samples under amplitude `0.02` with 5 ms lead / 30 ms tail safety, cap at 600 ms, reject if < 20 ms, normalise peak to `0.85`.
- Playback: BufferSource (no loop), gain 1.0, straight to destination.
- Fallback to synth: key absent from `HERO_SAMPLES` or an exception in playback.
- Consumers outside range: BeatboxHero mic-input `_profileFromBuffer` uses `HERO_SAMPLES['B','T','K','Pf']` to build detection profiles (4378).
- Gotcha: `recordToBuffer` calls `getAudioCtx()`, which returns null while muted -> all samples are dropped (deleted from `HERO_SAMPLES`, not from IDB) if a slot is loaded while muted; they don't reappear after unmute until the slot is reloaded.
- Rebuild: wrap in an `SampleStore` class (async API), store `Float32Array` + `sampleRate` (or store a WAV Blob), batch with one `getAll` over a key range `slotN:` instead of 16 serial transactions; keep the same DB/store/keys if existing players' saves must survive (the Phaser port runs on a different origin, so migration only matters if hosted on the same origin).

---

## 17. Core synth voices (17382-17501)

All connect straight to `ctx.destination`. Times `t` in AudioContext seconds. "exp ramp" = `exponentialRampToValueAtTime`.

### noiseBuffer(ctx, duration=0.5) (17383-17388)
`createBuffer(1, ctx.sampleRate*duration, ctx.sampleRate)` filled with white noise `Math.random()*2-1`. A fresh buffer is generated for every hit (allocation churn). Rebuild: cache one 1-2 s noise buffer per context and start at random offsets.

### playKick(ctx, t, pitch=60) (17390-17400)
- Sine osc. `freq: pitch*2.5 @ t -> exp ramp pitch*0.6 @ t+0.12`.
- Gain: `0.9 @ t -> exp ramp 0.001 @ t+0.18`. start t, stop t+0.2.
- pitch 60: 150 -> 36 Hz; pitch 70 (uvular roll): 175 -> 42 Hz; pitch 45 (808 throat): 112.5 -> 27 Hz.

### playSnare(ctx, t) (17402-17421)
- Noise `noiseBuffer(0.2)` -> highpass `1500 Hz` -> gain `0.5 @ t -> exp 0.001 @ t+0.13` -> destination; `start(t)` (no stop; buffer ends at 0.2 s).
- Body: triangle, `200 Hz`, gain `0.3 -> exp 0.001 @ t+0.08`; start t, stop t+0.1.

### playHat(ctx, t, open=false) (17423-17434)
- Noise `noiseBuffer(0.1)` -> highpass `7000 Hz` -> gain `0.25 @ t -> exp 0.001 @ t+dur`, `dur = open ? 0.18 : 0.04`; start t, stop `t + dur + 0.05`.
- Bug: the open variant's envelope is 0.18 s but the noise buffer is only 0.1 s, so it is cut at 0.1 s (~ -38 dB by then, so barely audible). `open=true` is never used within this range.

### playBass(ctx, t) (17436-17447)
- Sawtooth `55 Hz` -> lowpass `200 Hz`, Q `8` -> gain `0.4 @ t -> linear 0.5 @ t+0.05 -> exp 0.001 @ t+0.35`; start t, stop t+0.4.

### playScratch(ctx, t) (17449-17460)
- Sawtooth, no filter. `freq: 800 @ t -> exp 200 @ t+0.08 -> exp 1200 @ t+0.16`.
- Gain `0.3 @ t -> exp 0.001 @ t+0.18`; start t, stop t+0.2.

### playWhistle(ctx, t) (17462-17473)
- Sine. `freq: 2000 @ t -> exp 3500 @ t+0.25`.
- Gain `0.001 @ t -> linear 0.2 @ t+0.04 -> exp 0.001 @ t+0.3`; start t, stop t+0.32.

### playLipRoll(ctx, t) (17475-17489)
- Carrier: sawtooth `90 Hz`. LFO: sine (default type) `28 Hz` -> `lfoGain` (value `0.3`) -> connected to `mainGain.gain` (AudioParam, additive).
- `mainGain.gain: 0.25 @ t -> exp 0.001 @ t+0.4`. Both osc start t, stop t+0.42.
- Effective gain = `env(t) + 0.3*sin(2PI*28*t)` -> bipolar (phase flips) ring-mod-like buzz. Because the LFO term is additive and not enveloped, the buzz does NOT fade (only the DC part decays), so the sound ends with a hard cut at 0.42 s at amplitude ~0.3. To replicate 1:1 keep the topology; to improve, put the LFO through the envelope or use `gain.value = 0` base with a decaying LFO depth.

### playClick(ctx, t) (17491-17501)
- Square, `freq 1500 @ t -> exp 400 @ t+0.02`; gain `0.2 @ t -> exp 0.001 @ t+0.04`; start t, stop t+0.05.

Rebuild (all voices): express as data recipes `{layers:[{type:'osc'|'noise', wave, freqPoints:[[t,f,ramp]], filter:{type,freq,Q}, gainPoints, dur}]}` evaluated by one `playRecipe(ctx, bus, t, recipe)`; pure to unit-test (compute envelope values). Improvements to consider after 1:1 parity: shared noise buffer, tiny random pitch/gain jitter per hit, dedicated voices for `inward_k` (see 18) and `rimshot` category, limiter on the master bus (kick peak 0.9 + snare 0.5+0.3 can clip when stacked).

---

## 18. playSound(cat, soundName) (17503-17553)

Dispatcher by SOUND_CATALOG category; `t = ctx.currentTime`; whole switch wrapped in `try/catch {}`.

| cat | rule (regex tests on `soundName`, case-insensitive) | result |
|---|---|---|
| `Kicks` | `/uvular\|roll/` | 4 kicks at `t + i*0.06`, pitch `70` (i=0..3) |
| | `/throat\|808/` | 1 kick, pitch `45` |
| | else | 1 kick, pitch `60` |
| `Snares` | any | `playSnare` (so `psh_snare` == `inward_k`, identical) |
| `Hats` | `/fast/` | 6 closed hats at `t + i*0.05` |
| | else | 1 closed hat |
| `Bass` | any | `playBass` |
| `Scratch` | any | `playScratch` |
| `Whistles` | any | `playWhistle` |
| `Liproll` | any | `playLipRoll` |
| `Clicks` | `/roll/` | 5 clicks at `t + i*0.05` |
| | else | 1 click |
| default | (incl. `'Rimshot'`) | `playKick(ctx, t)` (pitch 60) |

Catalog mapping (SOUND_CATALOG lines 6-19): `classic_kick` 'Classic Kick' -> kick 60; `hi_hat` 'Basic Hi-Hat' -> 1 hat; `psh_snare` 'PSH Snare' -> snare; `inward_k` 'Inward K Snare' -> snare (same); `throat_kick` '808 Throat Kick' -> kick 45; `fast_hats` 'Fast Hi-Hats (TKs)' -> 6 hats; `lip_roll` 'Lip Roll' -> lip roll; `inward_bass` 'Inward Bass' -> bass; `d_low` 'D-Low Scratch' -> scratch; `laser` 'Laser Whistle' -> whistle; `click_roll` 'Click Roll' -> 5 clicks; `uvular_roll` 'Uvular Kick Roll' -> 4 kicks pitch 70.
Rebuild: lookup table `soundId -> recipe` instead of regexes on display names (fragile: renaming a sound changes its audio).

---

## 19. playRooster() and playBeep(high) (17555-17593)

### playRooster() (17557-17578)
- Used at 15455 (wake-up / alarm progress scene: fires once when progress > 0.85). Misplaced comment above it says "Short countdown beep".
- `note(freq, start, dur, type='sawtooth', vol=0.14)`: osc `type`, `freq` constant; gain `0 @ start -> linear vol @ start+0.025 -> exp 0.001 @ start+dur`; osc start `start`, stop `start+dur`. No filter.
- Notes ("ki - ke - ri - kiiiiii"), t0 = now:
  1. 880 Hz @ t0, dur 0.13, vol 0.14
  2. 1100 Hz @ t0+0.16, dur 0.13, vol 0.14
  3. 990 Hz @ t0+0.34, dur 0.16, vol 0.14
  4. 770 Hz @ t0+0.55, dur 0.65, vol 0.16
- Total ~1.2 s.

### playBeep(high=false) (17580-17593)
- Used for the battle countdown (18201-18205): 3, 2, 1 at 0 / 800 / 1600 ms with `playBeep(false)`; "BEATBOX!" at 2400 ms with `playBeep(true)`; the round starts at 3300 ms.
- Sine; freq `high ? 880 : 440`; gain `0.001 @ t -> linear 0.25 @ t+0.01 -> exp 0.001 @ t + (high ? 0.4 : 0.18)`; start t, stop `t + (high ? 0.42 : 0.2)`.

---

## 20. _blip and stings (17595-17663)

### _blip(ctx, t, freq, dur=0.18, gainPeak=0.22, type='sine') (17597-17608)
osc `type`, constant `freq`; gain `0.0001 @ t -> linear gainPeak @ t+0.012 -> exp 0.0001 @ t+dur`; start t, stop `t+dur+0.02`. No filter.

Each sting reads `ctx.currentTime` as t. All straight to destination.

### playLevelUp() (17611-17622) - called in `checkLevelUp` (11390)
Triangle unless noted: `C5 523.25 @0 dur .16 g .22`; `E5 659.25 @0.10 dur .16 g .22`; `G5 783.99 @0.20 dur .16 g .22`; `C6 1046.5 @0.30 dur .55 g .26`; sparkle sine `G6 1568.0 @0.32 dur .40 g .10`.

### playAchievement() (17625-17631) - 11403, delayed 130 ms
Sine: `A5 880 @0 dur .30 g .20`; `E6 1318.5 @0.08 dur .45 g .18`.

### playUnlock() (17634-17640) - 11398, delayed 60 ms
Sine: `E5 659.25 @0 dur .30 g .18`; `B5 987.77 @0.06 dur .45 g .16`.

### playWinSting() (17643-17653) - 18388, 200 ms after the 5th judge is revealed (result screen follows 800 ms after)
Triangle: `C5 523.25 @0 dur .18 g .24`; `E5 659.25 @0.14 dur .18 g .24`; `G5 783.99 @0.28 dur .18 g .24`; `C6 1046.5 @0.42 dur .70 g .28`; `E6 1318.5 @0.42 dur .70 g .18` (comment calls it "3rd above"; it is E6, a major 10th above C5).

### playLossSting() (17656-17663) - 18388
Sine: `A4 440 @0 dur .30 g .22`; `F#4 369.99 @0.20 dur .55 g .20`; `D4 293.66 @0.50 dur .85 g .18` (descending D major triad - the comment "descending minor third" is inaccurate; it sounds sad only due to the slow decay).

Rebuild: one `playSequence([{t,freq,dur,gain,type}])` helper; stings are pure data.

---

## 21. Music engine primitives (17665-17735)

### _mtof(m) (17672)
`440 * 2^((m-69)/12)` (MIDI -> Hz; MIDI 60 = C4, 69 = A4).

### _musVoice(ctx, out, midi, t, dur, opt) (17675-17700)
- osc `type = opt.type || 'square'`, `frequency = _mtof(midi)`, `detune = opt.detune` (cents, if set).
- Gain env: `peak = opt.gain ?? 0.14`, `atk = opt.attack ?? 0.008`, `rel = opt.release ?? 0.09`; `sustainEnd = max(t+atk, t+dur-rel)`; `gain: 0.0001 @ t -> linear peak @ t+atk -> setValue peak @ sustainEnd -> exp 0.0001 @ t+dur`.
- Optional `opt.filter`: lowpass at that frequency (Q default 1) between osc and gain.
- Chain: osc -> [lowpass] -> gain -> `out` (the track master gain). start t, stop `t+dur+0.05`.

### _musKick(ctx,out,t) (17703-17713)
Sine `150 @ t -> exp 45 @ t+0.11`; gain `0.5 @ t -> exp 0.0001 @ t+0.16`; stop t+0.18.

### _musSnare(ctx,out,t) (17714-17724)
Noise 0.16 s -> highpass `1400 Hz` -> gain `0.28 @ t -> exp 0.0001 @ t+0.14`; start t, stop t+0.16. (No tonal body, unlike `playSnare`.)

### _musHat(ctx,out,t,open) (17725-17735)
Noise `open ? 0.12 : 0.04` s -> highpass `7000 Hz` -> gain `open ? 0.12 : 0.16 @ t -> exp 0.0001 @ t + (open ? 0.12 : 0.04)`; start t, stop `t + (open ? 0.12 : 0.05)`.

---

## 22. _TITLE track (17740-17778)

Data model:
```
_TITLE = {
  bpm: 160, stepsPerBeat: 4, steps: 64, volume: 0.32,
  barRoots: [48, 43, 45, 41],          // C3, G2, A2, F2   (bar = floor(step/16))
  triad:    [0, 4, 7, 12],
  lead: [  // one MIDI note per 16th step, 0 = rest (64 entries)
    79,0,0,76, 0,0,79,0, 84,0,0,83, 81,0,79,0,   // bar 1 (C):  G5 . . E5 . . G5 . C6 . . B5 A5 . G5 .
    79,0,0,74, 0,0,79,0, 83,0,0,86, 83,0,79,0,   // bar 2 (G):  G5 . . D5 . . G5 . B5 . . D6 B5 . G5 .
    81,0,0,77, 0,0,81,0, 84,0,0,88, 84,0,81,0,   // bar 3 (Am): A5 . . F5 . . A5 . C6 . . E6 C6 . A5 .
    77,0,0,72, 0,0,77,0, 81,0,84,0, 81,0,79,77,  // bar 4 (F):  F5 . . C5 . . F5 . A5 . C6 . A5 . G5 F5
  ],
  render(ctx, out, step, t, stepDur) { ... }
}
```
Timing: `stepDur = 60/160/4 = 0.09375 s`; bar = 16 steps = 1.5 s; loop = 64 steps = 6.000 s. Master volume `0.32` (fade in 0.8 s).

Per-step render (`bar = floor(step/16)`, `inBar = step % 16`, `root = barRoots[bar]`):
- Kick: `inBar % 4 === 0` (steps 0,4,8,12 - four on the floor) -> `_musKick`.
- Snare: `inBar % 8 === 4` (steps 4, 12) -> `_musSnare`.
- Hat: `inBar % 2 === 0` (8th notes) -> `_musHat(open = inBar % 4 === 2)` (open hat on the off-beat 8ths: steps 2,6,10,14; closed on 0,4,8,12).
- Bass (on `inBar % 2 === 0`): note `root + ((inBar % 4 === 2) ? 12 : 0)` (root, octave, root, octave...), `_musVoice(..., dur = stepDur*1.7 = 0.159 s, {type:'square', gain:0.16, release:0.06, filter:1600})`.
- Arp (every step): note `root + 12 + triad[step % 4]` (root+12, +16, +19, +24 = major triad + octave), `dur = stepDur*0.9 = 0.084 s`, `{type:'square', gain:0.045, attack:0.004, release:0.04}`.
- Lead (if `lead[step] != 0`): `dur = stepDur*3.4 = 0.319 s`; two voices: `{type:'square', gain:0.12, attack:0.006, release:0.12, detune:+4}` and `{type:'triangle', gain:0.07, attack:0.006, release:0.12, detune:-6}`.
- Max ~7 new oscillators per step.

Harmonic notes / gotchas:
- Bar 3 root 45 (A2) with `triad[1] = 4` gives an A MAJOR arpeggio (C#4/E4/A4 region) under an "Am" bar, clashing with the lead's C6/F5. Comments say "Am". Likely a bug (should be minor third 3) - or a happy accident of the "bouncy" sound; confirm by ear before "fixing".
- In bar 4 (F) the lead has notes 2 steps apart (steps 8, 10, 12, 14, 15) and notes are 3.4 steps long -> overlapping tails (fine).

---

## 23. _INTRO track (17783-17823)

Data model:
```
_INTRO = {
  bpm: 68, stepsPerBeat: 1, steps: 32, volume: 0.38,
  barRoots: [45, 41, 48, 40],          // A2, F2, C3, E2   (bar = floor(step/8), 8 quarter-notes per "bar")
  mel: [  // one MIDI note per quarter step, 0 = rest (32 entries)
    0,0,72,0,  0,69,0,0,  0,0,68,0,  0,65,0,0,   // chord 1 (Am): C5 @2, A4 @5   | chord 2 (F): G#4 @10, F4 @13
    0,0,67,0,  0,64,0,0,  0,0,71,0,  0,67,0,0,   // chord 3 (C):  G4 @18, E4 @21 | chord 4 (Em): B4 @26, G4 @29
  ],
  render(ctx, out, step, t, stepDur) { ... }
}
```
Timing: `stepDur = 60/68 = 0.8824 s`; "bar" = 8 steps = 7.059 s (one pad chord); loop = 32 steps = 28.235 s (comment says "8-bar loop": it is 4 pad chords, 8 bars of 4/4 at 68 BPM). Master volume `0.38`.

Per-step render (`bar = floor(step/8)`, `inBar = step % 8`, `root = barRoots[bar]`):
- At `inBar === 0` (steps 0, 8, 16, 24): pad chord + sub.
  - `isF = bar === 1`; `third = isF ? 4 : 3`; `chord = [0, third, 7, 12]`; `barDur = stepDur*8 = 7.059 s`.
  - For each chord offset `off`: two voices at `root + 12 + off`, `dur = barDur*1.02`:
    - triangle `{gain:0.05, attack: barDur*0.35 (2.47 s), release: barDur*0.4 (2.82 s), detune:+7, filter:1200}`
    - sawtooth `{gain:0.022, attack: barDur*0.4 (2.82 s), release: barDur*0.45 (3.18 s), detune:-9, filter:900}`
  - Sub bass: `_musVoice(root - 12, dur = barDur*1.04, {type:'sine', gain:0.16, attack:0.05, release: barDur*0.3})`.
  - Chords actually played: bar0 A minor (A,C,E,A), bar1 F major, bar2 C MINOR (root 48 with third 3 = Eb; comment says "C"), bar3 E minor.
- Melody (if `mel[step] != 0`): triangle at `n` `{dur: stepDur*2.6 = 2.29 s, gain:0.10, attack:0.04, release:0.5, filter:2200}` + sine at `n+12` `{dur: stepDur*2.2 = 1.94 s, gain:0.03, attack:0.06, release:0.5, detune:+10}`.
- Gotchas: G#4 melody over the F chord (comment: "leading tone") and E over a C minor chord produce intentional-sounding or accidental dissonance - decide whether to preserve. Because the pad notes overlap with the next chord (dur 1.02 bars) they crossfade.

---

## 24. Scheduler: startMusic(name) / stopMusic() (17825-17869)

`_MUSIC_TRACKS = { title: _TITLE, intro: _INTRO }`; module-level `_music` = current state or null.

`startMusic(name)`:
1. Unknown track -> return. If `_music && _music.name === name` -> return (already playing; no restart).
2. `stopMusic()` (fades any previous).
3. `ctx = getAudioCtx()`; if null (muted/unsupported) -> return WITHOUT setting `_music` (so unmuting later does not start it; next `startMusic` call - i.e. next screen mount - will).
4. `master = ctx.createGain()`: `0.0001 @ now -> linear track.volume @ now+0.8` (0.8 s fade-in) -> destination.
5. `stepDur = 60 / bpm / stepsPerBeat`; state `{name, ctx, gain: master, step: 0, nextNoteTime: ctx.currentTime + 0.12, stepDur, track}`.
6. `setInterval(25 ms)`: bail if `_music !== state`; if `getSettings().muted` -> `stopMusic()` and return (mute toggled mid-track); while `state.nextNoteTime < c.currentTime + 0.18`: `track.render(c, state.gain, state.step, state.nextNoteTime, state.stepDur)` inside try/catch, `step = (step+1) % track.steps`, `nextNoteTime += stepDur`.
   - Loop is seamless because scheduling is purely time-accumulated; the loop point is `step` wrapping to 0.
   - If the context is suspended (before first user gesture) `currentTime` stays frozen, so only ~1 step is scheduled until the context resumes - music "kicks in" on the first tap.
   - Weakness: `setInterval` is throttled to >= 1 s in background tabs; with only 180 ms lookahead the music stutters/drops when the tab is hidden.

`stopMusic()`:
- `_music = null`; `clearInterval`; `cancelScheduledValues(now)`, `setValueAtTime(current, now)`, `linearRamp 0.0001 @ now+0.5` (0.5 s fade-out); `setTimeout(800 ms)` -> `master.disconnect()`. Already-scheduled oscillators (long pads up to 7.2 s) keep running silently until their `stop` time.

Call sites: `TitleScreen` effect (8635: `startMusic('title')`, cleanup `stopMusic()` -> plays while the title screen is mounted); `Cutscene` effect (6689: `startMusic(music)` when prop `music` set, cleanup `stopMusic()`); only usage of `music` is the new-game intro `playCutscene({ beats: INTRO_BEATS, music: 'intro' }, 'introSeen', ...)` (11354). No music in battles, hood, or other screens.

Rebuild notes:
- Pure: `trackEventsForStep(track, step) -> VoiceEvent[]` (list of `{kind:'osc'|'noise', wave, midi|freq, t offset, dur, gain, attack, release, detune, lowpass}`); then a scheduler consumes them. The render functions are already deterministic except the noise buffers.
- Option A (recommended for Phaser): pre-render each loop into an `AudioBuffer` with `OfflineAudioContext` (title 6.0 s, intro 28.24 s + tail) at boot, then play with `loop=true` through Phaser sound or a BufferSource - gapless, zero CPU, immune to background-tab throttling. Option B: keep the lookahead scheduler but raise lookahead to ~0.3-0.5 s and drive from a `Worker` timer.
- Add a music bus with its own volume slider; the intro/title volumes (0.32/0.38 master x voice gains) sit roughly at -20 dB relative to the 0.5-0.9 SFX peaks.
- Mute handling: original has no pause/resume; add `musicBus.gain` instead of stop/restart.

---

## 25. BattleScreen header (17871-17875)

Only the signature and first comment lines fall in this range: `function BattleScreen({ char, setChar, go, showToast, checkLevelUp, playCutscene })` with phases `intro, tactical, rps, countdown{1..4}, round{1..4}, judging, result`; sequence A,B,A,B (RPS loser goes first); each side plays 2 prepared HERO_LESSONS patterns; player rounds use BeatboxHero in battle mode, opponent rounds auto-play. (Rest of BattleScreen belongs to another range.)

Contract between BattleScreen (outside range) and my components, as observed:
- Constants: `BATTLE_BPM = 115`, `ROUND_SECONDS = 12`, `TOTAL_ROUNDS = 4` (17910-17912).
- State feeding the stage/HUD: `judgeHearts[5]`, `revealedJudges`, `activeSide`, `currentSound` (lesson name), `currentSoundColor`, `liveScore {p,o}`, `timeLeft`, `comboLabel {text,key}`, `streak`, `finisherArmed`, `finisher {name,bonus,peak}`.
- Streak source: BeatboxHero `onStreak(state.streak)` (4634/4637/4645/4860), `handleStreak` sets `streak` and latches `finisherArmed` at >= 8 (18338-18341).
- Timers: countdown 3-2-1-BEATBOX! at 0/800/1600/2400 ms, round at 3300 ms; round end delay 1500 ms (2600 ms with finisher); timeLeft ticks each second from 12; judge reveal every 700 ms; win/loss sting +200 ms after the last reveal; result +800 ms; opp score animated in 10 steps over 12 s; hearts 30% per note at random judge.

---

## 26. Cross-cutting rebuild notes

### 26.1 Colour reference (Tailwind classes used in this range)
| class | hex |
|---|---|
| stone-950 / bg `#0c0a09` | `#0c0a09` |
| stone-900 | `#1c1917` |
| stone-800 | `#292524` |
| stone-700 | `#44403c` |
| stone-600 | `#57534e` |
| stone-500 | `#78716c` |
| amber-300 | `#fcd34d` |
| amber-400 | `#fbbf24` |
| amber-500 | `#f59e0b` |
| amber-600 | `#d97706` |
| red-500 | `#ef4444` |
| red-600 | `#dc2626` |
Brand/gold used in canvas code: `#D4A017` (default text/wave colour), player red `#CC2200`, sound colours B `#CC2200`, T `#22d3ee`, K `#a78bfa`, Pf `#fbbf24`.

### 26.2 Suggested framework-free TS modules
- `stageData.ts`: `OPP_LOOKS`, `JUDGE_LOOKS`, `JUDGE_BIASES`, stage geometry constants, `FINISHER_THRESHOLD`.
- `battleView.ts` (pure): `hypeLabel`, `hypePct`, `finisherFill`, `auraParams`, `finisherBonus`, `lookFromChar`, heart/spark spawn functions with an injectable RNG, particle step functions with `dt`.
- `sprite.ts`: `drawBeatboxer(sink, x, y, look, facing, pose)`, `drawJudge`, `drawPixelHeart` (fixed shape), against a `PixelSink` interface.
- `synthRecipes.ts` (pure data): hero sounds, catalog -> recipe table, stings, rooster, beeps.
- `synth.ts`: `playRecipe(ctx, bus, t, recipe)`, noise-buffer cache, `AudioEngine { play(key), playSting(name), setMuted, setVolumes }`.
- `sampleStore.ts`: IndexedDB wrapper (same names), `SampleBank`.
- `music.ts`: `Track` interface `{bpm, stepsPerBeat, steps, volume, eventsForStep(step)}`, `TITLE`, `INTRO`, offline renderer + (optional) scheduler.

### 26.3 Phaser mapping
- Stage = one Scene with a 200x120 logical camera zoomed x3 (or integer fit), `pixelArt: true`, `roundPixels: true`.
- HUD: DOM overlay or Phaser Text/Graphics in a second camera; keep hype meter and finisher gauge logic from 10/11.
- Particles: Phaser emitters for sparks/embers/flames, but keep the 1x1-pixel look (small square textures, no smoothing).
- Audio: `this.sound.context` for synth; Phaser sound for loops only if rendering music to buffers; user gesture unlock via Phaser.

---

## OPEN QUESTIONS / GOTCHAS

1. Frame-based animation everywhere (`frameCount`, `fc`, per-frame velocities): speeds scale with display refresh rate (2x at 120 Hz). Rebuild must use dt or a fixed 60 Hz step; confirm desired speed (assume 60 fps design).
2. `drawPixelHeart` shape is not a heart (bar + V). Redesign or keep? Visible only as tiny 5x3 px particle.
3. Hearts only appear for opponent notes (random 30% per note, random judge) and never reset; player performance never triggers hearts. Intended? (Probably an oversight; judges' reaction to the player's perfects would be the natural hook.)
4. `FloatingSound` restarts its animation on every PixelStage render because of `key={currentSound + Date.now()}`; the visible effect is a name that keeps re-popping. Decide the intended behaviour (one pop per round? per note?).
5. Sound-wave pulse fires once per round (on lesson-name change), not per note; no per-sound poses exist. If poses by sound/lane are wanted they must be designed (kick = stomp, snare = head snap, hat = hand flick...).
6. `playSound` maps `inward_k` to the same snare as `psh_snare`; category `Rimshot` is not handled (falls to a kick); `K` rimshot only reachable via hero keys.
7. `playHat(open=true)` truncated by a 0.1 s noise buffer; `open` never used here - drop or fix.
8. `playLipRoll` additive LFO never decays -> hard cut at 0.42 s. Replicating "as is" keeps a click; decide parity vs fix.
9. Title track "Am" bar plays a major (A) arpeggio; Intro bar 3 "C" is C minor; G# over F in the intro melody. Verify intent by ear before changing.
10. `playLossSting` is a descending D major arpeggio (A4-F#4-D4), the comment says minor third; the win sting E6 is a 10th above C5 not a "3rd above". Cosmetic.
11. Headphones accessory: right ear cup drawn at x=4 (overlaps band) vs left cup at x=-6; probably should be x=5.
12. `getAudioCtx()` returns null when muted, so (a) unmuting does not restart music (startMusic returned early), (b) `loadSamplesForSlot` while muted drops all samples from memory until reload (recordToBuffer needs the ctx).
13. `setInterval`-based scheduler with 180 ms lookahead will glitch in throttled/background tabs; recommended: pre-render loops or longer lookahead + worker timer.
14. Every hit allocates a fresh noise buffer (`Math.random` fill) - GC churn at 4-6 hits/s; and no master limiter (stacked kick 0.9 + snare 0.8 can clip).
15. `PixelStage` main effect depends only on `[char.color, opponent.name]`: the player's look (outfit/accessory) is frozen for the battle; and opponent `OPP_LOOKS` unknown names fall back to `_defaultOppLook` (red shirt) - crew-battle opponents (Ras-T, Kiko, Klem, ...) are not in this table (they use a different resolution screen, but check if a stage is ever shown for them).
16. `FINISHER_THRESHOLD` is declared after its first textual use inside `PixelStage` (works because it is read at draw time).
17. HUD score bars saturate at 400 points, hype meter at +/-80, hype text bands start at +/-8/25/60: bands and meter are on the same raw gap but different scales (bar is half-full at gap 40; "CROWD GOES WILD" starts at 60 = 75% of a half bar).
18. Original has only a single global `muted` flag (no volume setting, no separate SFX/music volumes). Consider adding in the rebuild; need product decision.
19. Sample storage is keyed by slot number (1..3 save slots); in the Phaser rebuild decide whether to keep slot-keyed samples and the 16-key set, and whether to migrate from the old origin's IDB (not possible cross-origin; offer export/import as WAV if players need to carry samples over).
20. Mic-based input (BeatboxHero) uses `HERO_SAMPLES['B','T','K','Pf']` to build detection profiles - removing/replacing the sample store in the rebuild affects that feature (outside this range, line 4378).
21. Fonts: `"Bebas Neue","Oswald"` (web fonts, presumably loaded globally) and glyphs `🔥 ⚡ ★ · ×` in canvas `monospace` text - need a bitmap pixel font that includes the star/bolt or replace them with sprites.
22. `drawBeatboxer` is shared by ~20 cutscene scenes (lines 8255-10151, 8460-8515, etc.) - any change to it (e.g. new poses) affects all of them; keep the signature stable or version it.
