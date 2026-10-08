# Beatbox Story — Inventory 03: Activity mini-games, animations, pitch detection

Source: `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx`, lines 2260-4025 (read completely).
Line numbers below are 1-based lines in that file. "Parent" = the screen that mounts a component
(`ParkScreen` L14692 for Busk/RhythmTap/RunTracker; `HouseScreen` L12675 for PitchTuner/VoiceRangePicker).
Those parent snippets are outside this range; they are summarised only where needed to explain what the engine does with the values.

## SUMMARY

1. Range = 6 self-contained units: `BuskAnimation` (pure pixel-art canvas scene), `RhythmTap` (3-lane falling-note canvas game), `RunTracker` (DOM alternate-tap power bar, no canvas), the pitch toolkit (`detectPitch` + note maths + `VOICE_RANGES` + `TUNER_MODES` + `MELODY_TEMPLATES` + `generateChord`), `VoiceRangePicker` (mic hum calibration), and `PitchTuner` (mic singing game with a canvas "pitch ribbon").
2. All mini-games are OPT-IN "play modes" layered on the AFK activity loop (`useActivity`, L2139): the loop ticks and pays out every 5 ticks; the mini-game only feeds a quality number (accuracy / block result) that the parent reads at payout time. No mini-game awards anything itself except `RunTracker.onMaxEnergyTick`.
3. Reporting cadence: RhythmTap `onAccuracyUpdate(acc,hits,total)` every `evaluateEveryMs` (parent passes 2500); RunTracker `onBlockResult({avg,isGood,burnRatio})` every 2500 ms and `onMaxEnergyTick()` every 3 good blocks; PitchTuner `onAccuracyUpdate(avg,count)` every 2500 ms (rolling mean of per-note scores).
4. Parent keeps only the LAST reported value (`accuracyRef.current = acc`); payout tiers are acc >= 0.8 / >= 0.5 (busk x2.0 / ramp to x1.5; mus +3 / +2 stat). So the window just before payout decides the reward.
5. Pitch detection = classic Chris-Wilson-style time-domain autocorrelation on a 2048-sample `AnalyserNode.getFloatTimeDomainData` buffer, RMS gate 0.01, accept 60-1500 Hz, parabolic peak interpolation; run EVERY animation frame (O(n^2) ~2.1M multiply-adds/frame).
6. Singing scoring is octave-invariant and generous: cents folded into (-600,600], "in tune" = |cents| < 50, a note scores `min(1, inTuneMs / (noteDurationMs * 0.4))` (only 40% of the note has to be in tune for 1.0).
7. Three tuner modes: beginner (random major/minor triad, listen-one/sing-one, 2500 ms/note), advanced (DO-RE-MI, listen-all-3 then sing-all-3, 1000 ms/note), karaoke (7 five-note melody templates, listen-all then sing-all, 700 ms/note). Roots come from 2 fixed voice ranges or a calibrated centre note +-4 semitones.
8. All pixel animations are frame-count driven (assume 60 fps; per-frame constants) on a 140x90 logical canvas scaled x4 with `imageRendering: pixelated`; they will run 2x fast on 120 Hz screens unless the rebuild uses a fixed timestep.
9. Many comments contradict the code (RunTracker "5 good bars" vs 3, tuner durations, +-5 vs +-4 semitones, "2 seconds" vs 2.5 s). THIS INVENTORY FOLLOWS THE CODE, not the comments (see GOTCHAS).
10. Dependencies defined OUTSIDE this range: `onGlobalKey` (L248), `playHeroSound` (L17215), `useActivity` (L2139), `TICK_REAL_MS=500` (L1035), `TICK_MINUTES=10` (L1034), `DAY_END=1200` (L1036), char fields `voiceRange` / `voiceRangeMidi` (L172-173, migration L11194-5).

---

## 0. External dependencies this range relies on (not in range, needed for parity)

| Symbol | Where | Behaviour that matters |
|---|---|---|
| `onGlobalKey(handler)` | L227-257 | One document-level capture-phase `keydown` listener; returns unsubscribe fn. Ignores events when focus is in INPUT/TEXTAREA/contentEditable, when `e.repeat` is true, or when meta/ctrl/alt held. No `preventDefault`. |
| `playHeroSound(key)` | L17215 | Plays player's recorded sample for key `B`/`T`/`K`/`Pf` (`HERO_SAMPLES`, `AudioBuffer`, gain 1.0) else synth fallback: `B`=kick, `T`=hi-hat, `K`=rimshot, `Pf`=snare. Uses the shared `getAudioCtx()` (L17146; returns null when `settings.muted`; auto-resumes a suspended ctx). |
| `HERO_SOUNDS` | L17166 | `B` Kick `#CC2200`, `T` Hi-Hat `#22d3ee`, `K` Rimshot `#a78bfa`, `Pf` Snare `#fbbf24`. (RhythmTap's lane colours differ from these, see below.) |
| `useActivity` | L2139 | Real-time interval (`TICK_REAL_MS` = 500 ms AFK, 2500 ms in play mode), 1 tick = `TICK_MINUTES`(10) game min AFK or 3 in play mode, reward every `blocksPerReward`=5 ticks; exposes `{active, block (0-4), rewardsEarned, start, stop}`. |
| Fonts | CSS | `"Bebas Neue"`, `"Oswald"`, monospace fallbacks. Tailwind utility classes (stone-*, amber-*) used everywhere in DOM UIs. |
| Char fields | L172-173 | `voiceRange: null\|'higher'\|'lower'\|'auto'`, `voiceRangeMidi: number\|null`. Persisted in the character save. |

---

## 1. Pixel helpers  (lines 2260-2287)

- What: three tiny drawing helpers shared by every pixel scene in the file (also used by L5832, L6059, L7593 etc., other people's ranges).
- `_px(ctx,x,y,w,h,color)` (L2263): `fillStyle=color; fillRect(floor(x), floor(y), w, h)`. Only x,y are floored; w,h are used as given.
- `_drawSky(ctx,W,h, fromR,fromG,fromB, toR,toG,toB)` (L2272): for each scanline `y in [0,h)`, `t=y/h`, each channel = `min(255, floor(from + t*(to-from)))`, draws a 1-px-high, W-wide strip `rgb(r,g,b)`. A banded vertical gradient (h bands).
- `_drawDaytimeSky(ctx,W,h=50)` (L2283): `_drawSky` from `(0x7a,0xc0,0xe8)=(122,192,232)` to `(0xaa,0xd8,0xf8)=(170,216,248)`, 50 scanlines by default.
- `_clampPct(v)` (L2287): clamp to 0..100 (used for mood/hunger across the file).
- Rebuild notes: trivially portable to a framework-free module. In Phaser draw the sky as a 50-row `Graphics` or a pre-baked 1xN gradient texture stretched. These helpers assume the context is already `scale(4,4)` for the 140x90 scenes.

---

## 2. BuskAnimation  (lines 2289-2530)

**What it is.** The AFK visual for the park "Busk" activity: a looping daytime pixel-art street scene with the player's beatboxer performing in front of a tip jar, a passer-by walking through, drifting clouds, soundwaves and "BOOM/TSS/KSH" pop-ups. Shown by `ParkScreen` (L15096) while `selected==='busk' && !playMode`. (Sister scenes `JamAnimation` L5779 and `RunAnimation` L6023 are in other ranges.) When the player toggles "PLAY RHYTHM", this is unmounted and `RhythmTap` replaces it.

**Props in** (no callbacks out): `color: string` hex, default `'#D4A017'` (= `char.color`, the player's shirt colour); `block: number` 0-4 (= `activity.block`); `rewardKey: number` (= `activity.rewardsEarned`; a rise triggers coins); `active: boolean` (= `activity.active`).
Props are mirrored into `propsRef` each render so the long-lived rAF loop sees fresh values.

**Canvas.** Logical `W=140, H=90`, `PXSCALE=4` => backing store 560x360, `ctx.scale(4,4)`, `imageSmoothingEnabled=false`. CSS: full width, `2px solid stone-800`, `image-rendering: pixelated`, background `#1c1917`, `aspect-ratio 140/90`. Redrawn every `requestAnimationFrame` (always running, even when `!active`). Frame counter `frameCount` increments once per rAF; ALL timing below is "per frame" (60 fps assumed; seconds given for convenience).

**Draw order and exact contents (logical px, y down).**
1. Sky: `_drawDaytimeSky(ctx,W)` => rows y 0-49 (colours above).
2. Sun (top right): plus-shaped: `(118,8,10x10)`, `(120,6,6x14)`, `(116,10,14x6)` all `#fef3c7`; halo = circle centre (123,13) r 12 filled `rgba(254,243,199,0.30)`.
3. Clouds: `cloud(cx,cy)` = `(cx,cy,12x3 #fff)`, `(cx+2,cy-2,8x5 #fff)`, `(cx+4,cy-3,4x6 #fff)`, shadow `(cx+1,cy+3,10x1 #dadada)`.
   - Cloud A: `x = (frameCount*0.05) % 160` (3 px/s, wraps 160->0 every ~53 s), `y=10`.
   - Cloud B: `x = 40 + (frameCount*0.03) % 160` (1.8 px/s, wraps 200->40 every ~89 s), `y=22`. (Written as `70 + (fc*0.03 % 160) - 30`.) Both pop in/out abruptly (cloud B reappears at x=40 mid-sky; it is off-screen for x in 140..200).
4. Distant buildings (all bottom edge y=60): `(0,36,26x24 #a8a4b8)`, `(26,30,22x30 #bcb8c8)`, `(48,40,18x20 #9ea0b8)`, `(66,32,26x28 #bcb8c8)`, `(92,38,22x22 #a8a4b8)`, `(114,34,26x26 #bcb8c8)`.
5. Window glints: for i 0..4: `x=8+i*24`, `y=42+(i%2)*4`, 3x2 `#dadada`.
6. Park grass strip: `(0,56,W x 8 #5a8a3a)` + top highlight `(0,56,W x 1 #7aaa4a)`.
7. Trees (call `tree(8,60)` and `tree(132,60)`): foliage `(tx-6,ty-12,14x10 #2a6020)`, `(tx-4,ty-16,10x6 #3a7028)`, `(tx-2,ty-18,6x4 #4a8030)`, trunk `(tx-1,ty-2,2x6 #3a2410)`.
8. Pavement/path: `(0,64,W x 26 #b0a890)` + highlight `(0,64,W x1 #c8c0a0)`; edge stones for i 0..6: `(i*22+4, 88, 6x1 #7a7058)`; speckles 1x1 `#7a7058` at (20,72),(45,78),(95,70),(120,80).
9. Lamp post (decorative, unlit): `(15,14,2x50 #3a3530)`, `(11,14,10x2)`, `(8,16,4x5)`, same colour. Comment: "no glow during day".
10. Passer-by (state in `passerbyRef = {x:-20, color:'#84cc16', spawned:0}`):
    - Per frame: if `x > W+10 (150)`: `spawned++`; if `frameCount > spawned*300` then `x=-10` and colour = random of `['#84cc16','#a78bfa','#fb7185','#22d3ee','#f97316']`. Else `x += 0.4` (24 px/s).
    - Effective behaviour: because one crossing takes ~400 frames (>300) the gate `frameCount > spawned*300` is always already true, so the walker respawns immediately: continuous loop, one walker every ~6.7 s, new random colour each lap. (The `spawned*300` delay never actually delays; it was presumably meant as a spawn cooldown.)
    - Drawn only while `-10 < x < 150`. `px_=floor(x)`; walk cycle `floor(frameCount/8)%2` (toggle every 8 frames=133 ms): cycle 0 legs `(px_-2,73,2x5)` & `(px_+1,74,2x4)`; cycle 1 swapped heights (`(px_-2,74,2x4)`, `(px_+1,73,2x5)`); legs `#1a1a2e`. Body `(px_-3,65,6x8, pb.color)`; head `(px_-2,60,4x5 #d4a87a)`; hair `(px_-2,58,4x2 #1a1a2e)`.
11. Tip jar at `jarX=88, jarY=70`: outer `(jarX,jarY,12x14 #5a5048)`, inner glass `(jarX+1,jarY+1,10x12 #a89878)`, lid shade `(jarX+1,jarY+1,10x2 #7a6a50)`, rim `(jarX-1,jarY-1,14x2 #3a322a)`.
    - Coin pile: `coinPile = min(8, lastRewardRef.current)` single `#D4A017` pixels at `(jarX+2+(i%4)*2, jarY+11-floor(i/4)*2)`: 4 per row, 2 rows, pile = number of rewards so far (cap 8).
    - Blinking "TIP" sign: when `frameCount%60 < 30` (0.5 s on / 0.5 s off) draw `(jarX-2,jarY-6,16x4 #fef3c7)` and a dark tick `(jarX+5,jarY-5,1x2 #1c1917)`.
12. Beatboxer (`bx=60, by=78`, feet line):
    - Ground shadow `(bx-6,by,12x1,'rgba(0,0,0,0.5)')`.
    - `bob = active ? floor(frameCount/6)%2 : 0` (toggle every 100 ms). Legs `(bx-4,by-8-bob,3x8 #1a1a2e)` and `(bx+1,by-8+bob,3x8 #1a1a2e)` (alternate up/down), shoes `(bx-4,by-1,3x1 #fff)`, `(bx+1,by-1,3x1 #fff)`.
    - Torso `(bx-5,by-18,10x11, color)`, collar highlight `(bx-5,by-18,10x1 #fff)`, `(bx-5,by-24,10x7, color)` (shoulder block, mostly overdrawn by head).
    - Arms: right sleeve `(bx+5,by-17,2x3,color)`, hand `(bx+6,by-14,2x3 #d4a87a)`, microphone shaft `(bx+7,by-18,2x3 #888)` + head `(bx+6,by-19,4x2 #aaa)`; left arm `(bx-7,by-17,2x8,color)`.
    - Head `(bx-4,by-24,8x7 #d4a87a)` (skin; no hair).
    - Eyes 1x1 at `(bx-3,by-22)` and `(bx+1,by-22)`: normal `#1a1a2e`; "blink" when `frameCount%120 < 4` (4 frames every 2 s) colour `#5a4030` (brown, not actually closed).
    - Mouth at `by-19`: active: 4-frame loop `floor(frameCount/4)%4` (66 ms/frame): 0 `(bx-1,by-19,3x1 #5a2020)`, 1 `(bx-1,by-19,3x2 #3a1010)`, 2 `(bx,by-19,2x1 #5a2020)`, 3 `(bx-1,by-19,3x2 #3a1010)`. Inactive: closed `(bx-1,by-19,3x1 #5a2020)`.
13. Soundwaves (only when `active`): 3 arcs, `phase_i = frameCount*0.3 + i*1.2`, `distance = phase % 12`, `opacity = max(0, 1 - distance/12)`, `waveX = bx+14+distance` (only if `< W`); colour `rgba(212,160,23, opacity*0.8)`; 5 rects forming a ")" shape: `(floor(waveX), by-22, 1x1)`, `(+1, by-21, 1x2)`, `(+2, by-19, 1x1)`, `(+1, by-17, 1x2)`, `(0, by-15, 1x1)`. Speed 18 px/s, lifetime 40 frames (0.67 s); the 3 arcs are only 1.2 px apart so they read as one thick fading arc.
14. Sound-text pops (only when `active && block > 0`): `popKey = floor(frameCount/25)%3` -> `['BOOM','TSS','KSH'][popKey]`; shown only while `frameCount%25 < 10` (10 of every 25 frames); position `x = bx+12 (=72)`, `y = 30 + (frameCount%25)*0.5` (drifts 30 -> 34.5); `#D4A017`, `bold 7px monospace` (text is drawn through `scale(4)` so it renders as 28 px, anti-aliased, not pixel-crisp).
15. Flying coins (`coinsRef`, drawn last): each frame `life++; x+=vx; vy+=0.08; y+=vy;` draw `(x-1,y-1,2x2 #D4A017)` + highlight `(x,y-1,1x1 #fef3c7)`; kept while `y < jarY+8 (=78) && life < 60`.

**Coin spawn rule.** Effect on `[rewardKey]`: when `rewardKey > lastRewardRef.current` -> set `lastRewardRef=rewardKey` and push 3 coins: `x = 64 + (rand-0.5)*6` (61-67), `y=38`, `vx = (rand-0.5)*1.2` (+-0.6), `vy = -1.5 - rand*0.5` (-1.5..-2.0), `life=0, ttl=60`. Parabola: rises ~19 px (apex y~19 after ~22 frames), falls back to ~y=78 at about frame 60, i.e. they basically always die at the ttl. Because `x` starts at 64 and the jar is at 88-100, coins rarely visibly land in the jar (max drift +-36 px) - the effect is "coins pop out of the performer and fall". The jar pile is the real feedback.

**Rebuild notes.**
- Pure logic worth lifting: passer-by state machine, coin physics (frame based), coin-pile count `min(8, rewards)`. Everything else is draw calls.
- Phaser: render to a 140x90 `RenderTexture`/`Graphics` with `pixelArt:true` and integer x4 zoom, or (better, per the brief) replace by sprite-based layers: sky, sun+halo, 2 clouds (parallax), skyline, grass, 2 trees, path, lamp, passer-by sprite (2 walk frames, 5 tint variants), jar (+8 coin sprites + blinking sign), performer (2-frame leg bob, 4-frame mouth, blink, mic arm), 3 soundwave arcs, 3 word pops, 3 coin sprites. Artists need: 140x90 design grid, palette above.
- Convert all per-frame constants to per-second values (or run a fixed 60 Hz accumulator) so 120/144 Hz displays are not 2x speed.
- Oddities: (a) on every (re)mount `lastRewardRef` starts at 0, so mounting with `rewardKey>0` (e.g. returning from RhythmTap with 3 rewards earned) immediately fires a 3-coin burst and shows a pile of `rewardKey`; (b) pile never resets except by remount; (c) the loop never pauses when `!active` (scene keeps animating clouds/passer-by/sign; only performer bob, mouth, waves and text pops stop); (d) `block` only gates the word pops.

---

## 3. RhythmTap mini-game  (lines 2531-2841)

**What it is.** Optional "PLAY RHYTHM (bonus tips)" mode of the Busk activity: a 3-lane falling-note rhythm game (BOOM/TSS/KSH lanes) played with keys A/S/D or three on-screen buttons. It runs while the busk activity is active; its accuracy modifies the cash/fans paid at each 5-block reward. Mounted by `ParkScreen` L15099: `<RhythmTap onAccuracyUpdate={handleAccuracy} evaluateEveryMs={2500} active={activity.active}/>` (component default `evaluateEveryMs` is 5000).

**Controls.** Lane 0 (BOOM) = key `A` (match on `e.code==='KeyA'` or `e.key` `a`/`A`), lane 1 (TSS) = `S`, lane 2 (KSH) = `D`; or `onPointerDown` on the 3 buttons below the canvas (`preventDefault`, so touch fires instantly). Keys come from `onGlobalKey` (ignored while typing, on repeat, or with ctrl/alt/meta). The key listener is registered once on mount and NOT gated by `active` (taps still call `tap()` after the loop stops, but `startTime` is a leftover so it still scores/plays sound; harmless because the component is unmounted when the activity ends).

**Constants.**
| Name | Value | Meaning |
|---|---|---|
| `TRACK_W` x `TRACK_H` | 300 x 300 | logical canvas px (canvas attributes `width/height=300`, CSS scales to full width, `image-rendering:auto`) |
| `TARGET_Y` | 245 | y of the hit line |
| `NOTE_SPEED` | 175 px/s | downward fall speed |
| `LEAD_TIME_MS` | 245/175*1000 = 1400 | spawn-to-target travel time (declared, never used) |
| `HIT_PERFECT_MS` | 80 | |delta| < 80 => PERFECT |
| `HIT_GOOD_MS` | 180 | |delta| < 180 => GOOD (also the "late" cut-off for auto-miss) |
| `BPM` | 100 | `BEAT_MS=600`, `BAR_MS=2400` |
| look-ahead | 4000 ms | notes are pre-generated this far ahead of song time |
| judgement text life | 600 ms | |
| flash life | 300 ms | |

**Pattern (fixed forever, no difficulty scaling).** One 4-beat bar, 8 notes, `[beat, lane]`: `[0,0] [0.5,1] [1,2] [1.5,1] [2,0] [2.5,1] [3,2] [3.5,1]` => times within a bar (ms): 0 kick(L0), 300 hat(L1), 600 snare(L2), 900 hat(L1), 1200 kick(L0), 1500 hat(L1), 1800 snare(L2), 2100 hat(L1). A note every 300 ms (3.33 notes/s); consecutive notes are always in different lanes; same-lane spacing: L1 600 ms, L0/L2 1200 ms. The bar repeats unchanged. No backing track, no metronome, no count-in: the first note (kick at song time 0) is generated already sitting on the hit line the moment the game starts (it will be an auto-miss), and notes with time <= 1400 ms are already on screen at start.

**Lanes.**
| lane | label | colour | `heroKey` sample played on hit |
|---|---|---|---|
| 0 | BOOM | `#CC2200` | `B` (kick) |
| 1 | TSS | `#22d3ee` | `T` (hi-hat) |
| 2 | KSH | `#D4A017` | `Pf` (snare) |
(No sound on a miss or mis-tap.)

**State (`tapStateRef`).** `notes[] {time(ms rel. to start), lane, hit, judged, id}`, `lastSpawn` (ms of next bar start), `startTime`, `hits`, `misses`, `perfects` (window counters, reset every evaluation), `judgments[] {text,born,lane,color}`, `combo`, `maxCombo` (never read). `useState feedback` is only a re-render counter (unused).
Reset on effect start (`active` true): `startTime = performance.now()`, everything zeroed.

**Spawning.** `ensureNotesAhead(now)` each frame: `horizon = now - startTime + 4000`; `while lastSpawn < horizon` push the 8 notes of a bar at `time = lastSpawn + beat*600`, then `lastSpawn += 2400`.

**Tap logic (`tap(lane)`).**
1. `songT = performance.now() - startTime`.
2. Among notes in that lane that are not `hit` and not `judged`, pick the one with minimum `|n.time - songT|` provided that delta `< 180`.
3. If found: `hit=judged=true`; `isPerfect = delta < 80`; `perfects++` (if perfect), `hits++`, `combo++`, `maxCombo=max`; push judgement `PERFECT` (colour `#D4A017`) or `GOOD` (`#22d3ee`); `playHeroSound(laneHeroKey)`.
4. Else (mis-tap or too early/late): `combo=0`, push `MISS` (colour `#CC2200`), `misses++`. (A mis-tap therefore counts as a miss in the accuracy window in addition to the notes the player fails to hit.)
5. `setFeedback(f=>f+1)`.
Notes are judged per-lane; no ordering requirement. Hit window is symmetric (180 ms early to 180 ms late).

**Automatic misses.** Both inside the draw loop (every frame) and inside the evaluation interval: any unjudged note with `n.time + 180 < songT` => `judged=true; misses++; combo=0`. A missed note is not drawn once judged (so it visibly falls 180 ms * 175 px/s = 31.5 px below the hit line, then disappears).

**Accuracy reporting (the "reward back to the engine").** `setInterval(evaluateEveryMs)` (parent: 2500 ms): sweep passed notes as misses; `finalTotal = hits+misses`; `accuracy = finalTotal>0 ? hits/finalTotal : 0` (so mis-taps and missed notes both lower it; perfect vs good does NOT matter, PERFECT is cosmetic); call `onAccuracyUpdate?.(accuracy, hits, finalTotal)`; then reset `hits=misses=perfects=0` (combo kept); garbage-collect notes with `time + 180 <= songT`. Each window is independent (no smoothing). ~8.3 notes per 2.5 s window.
Parent usage (ParkScreen L14762-14817): `accuracyRef.current = acc` (latest window only, reset to 0 on mode toggle/activity end). At each busk reward (every 5 ticks; in play mode a tick is 2500 ms => ~12.5 s): `baseEarned = floor(totalSkills/6) + floor(rand*3)`; `bonusMult = acc>=0.8 ? 2.0 : acc>=0.5 ? 1 + (acc-0.5)/0.3*0.5 : 1` (note jump 1.5 -> 2.0 at 0.8); `earned = floor(baseEarned*bonusMult)`; fan +1 with prob 0.4 or if acc>=0.8; +6 xp. Play mode also scales energy cost x0.4, hunger x0.5, `tickRealMs=2500`, `tickMinutes=3`.

**What is DRAWN (canvas 300x300, redrawn each rAF, order).**
1. Clear `#0c0a09`.
2. Lane columns (laneW=100): fill `rgba(255,255,255,0.02)` (lanes 0 and 2) / `0.04` (lane 1); separators 1-px `#1c1917` at `x=(i+1)*100-1` (full height).
3. Target line: `#D4A017` rect `(0,244,300x2)` + glow `rgba(212,160,23,0.2)` rect `(0,239,300x12)`.
4. Lane labels at y=16: `bold 11px monospace`, centred in the lane, lane colour.
5. Notes: `y = 245 - (note.time - songT)/1000*175`, culled outside [-20, 320]; `x = lane*100+50`. Unjudged note = 28x28 square (`x-14,y-14`) in lane colour with `shadowBlur 10` same colour, plus 24x4 inner highlight `rgba(255,255,255,0.3)` at `(x-12,y-12)`. Hit notes are not drawn as squares; instead a flash: while `age=|songT - n.time| < 300`: filled circle at `(x,245)` radius `18 + age/10`, fill `rgba(212,160,23, 1 - age/300)`. Missed notes: not drawn.
6. Judgement text: for 600 ms rises from `y = 245-26 = 219` upward by 16 px (`y = 245 - 26 - age*16`, age 0..1), alpha `1-age`, `bold 14px monospace`, centred at lane x, colour per judgement.
7. Combo: when `combo >= 3`, `'bold 18px "Bebas Neue", monospace'`, `#D4A017`, right-aligned at `(290, 288)`: `"<n>x COMBO"`.
DOM under the canvas: 3-column button row (`grid-cols-3 gap-1`); each button: 2-px border in lane colour, background lane colour + alpha `22` hex, label font Bebas Neue/Oswald 18 px, letter-spacing 0.15em, `py-3`, `active:scale-95`, tiny 8-px key hint (A/S/D) top-right at 60% opacity.

**Rebuild notes.**
- Pure logic (lift to TS): pattern table, note scheduler, nearest-note hit picker, judgement thresholds, window accuracy `hits/(hits+misses)` with passed-note sweep. Make time injectable (`songT`).
- Phaser: keyboard `A/S/D` keys + 3 pointer-down zones; notes as sprites/rects moved by `y = TARGET_Y - (t - songT)*175/1000`; use `scene.time.now`/`performance.now()`; keep judging in the update loop (not in render). Particles/tween for flash and judgement text. Artist-redo targets: note gems (28 px, 3 colours), hit-line glow, lane backgrounds, COMBO banner, 3 buttons.
- Parity oddities to decide on: no count-in (first note instantly missed), mis-taps counted as misses, PERFECT irrelevant to reward, accuracy reported as 0 when no notes were judged in the window, evaluation interval not aligned to the bar (2500 vs 2400 ms bar).
- Re-created sounds: the lane samples are the player's recorded Beatbox Hero samples; needs the global sample store (outside this range).

---

## 4. RunTracker mini-game  (lines 2843-3057)

**What it is.** Optional "SPRINT MODE (build max energy)" for the park "Go Running" activity: a vertical power bar that drains continuously; the player alternately taps LEFT and RIGHT ("track and field" style) to keep it in the target zone. Every 2.5 s it grades a block; every 3 good blocks it grants +1 max energy. Mounted by `ParkScreen` L15108: `<RunTracker onBlockResult={handleRunBlock} onMaxEnergyTick={handleMaxEnergyTick} evaluateEveryMs={2500} active={activity.active}/>`. Pure DOM/CSS, NO canvas.

**Controls.** Keys `A` or `ArrowLeft` => `'L'`; `D` or `ArrowRight` => `'R'` (via `onGlobalKey`); pointer-down on the two large buttons (`preventDefault`). No `preventDefault` on arrow keys (page may scroll). `handleTap(side)` is ignored if `!active`.
Rule: a tap on the same side as `lastSide` is INVALID (no gain; button flashes red 100 ms). First tap (lastSide null) can be either side. Valid tap: `lastSide=side`, button flashes amber 80 ms, `bar = min(100, bar + TAP_GAIN)`.

**Constants.** `TAP_GAIN=12` bar units/valid tap; `DRAIN_PER_SEC=25` units/s; `TARGET_LO=60`; `TARGET_HI=85`; burn zone = above 85 (85-100); `evaluateEveryMs` default 2500 (parent 2500); good-bar cycle length 3; `maxEnergyGained` is a session counter shown in UI.
Derived: holding the bar steady needs 25/12 = 2.08 valid taps/s; bar is a sawtooth (+12 per tap, -25/s decay).

**Loop (rAF, only while `active`).** Per frame: `dt=(now-lastSampleAt)/1000`; `bar = max(0, bar - 25*dt)`; `setBarLevel(bar)` (React re-render every frame); `samples.push(bar)`; if `bar > 85` `burnTicks++` (counted per frame, i.e. a time-weighted ratio). Block boundary when `now - lastBlockAt >= evaluateEveryMs`:
1. `avg = mean(samples)`; `burnRatio = burnTicks / samples.length`.
2. `isGood = avg >= 60` (so a block spent in the burn zone is still "good"; burning only costs energy at the parent).
3. If good: `goodBars++`; when `goodBars >= 3`: reset to 0, `maxEnergyGained++`, `onMaxEnergyTick?.()`.
4. `onBlockResult?.({ avg, isGood, burnRatio })` (fires every block, good or bad).
5. Clear samples/burnTicks.
Note: `goodBars` counts good blocks and is NOT reset by a bad block (it accumulates; only resets after reaching 3). Header comment/footers in the code say "every 5 good bars" but the code and UI use 3 (UI shows `{goodBars} / 3`).

**Parent usage (ParkScreen L14767-14779, L14912-14937).** `handleRunBlock` stores ONLY the latest block result in `runBlockRef` (`{avg,isGood,burnRatio}`). `handleMaxEnergyTick`: `maxEnergy = min(150, (c.maxEnergy ?? 100) + 1)` + toast "Max Energy +1" (soft cap 150). Run activity's `onReward` (every 5 ticks = 12.5 s in play mode): `burnEnergy = playMode ? round(8*burnRatio) : 0` subtracted from energy; `shoGain = (playMode && isGood ? 2 : 1) + (premium_shoes ? 1 : 0)`; +5 xp; +4 mood. Play mode multipliers: energy x0.4, hunger x0.5, `tickRealMs=2500`, `tickMinutes=3`. So only the block that happens to be last before payout matters for sho/burn; max-energy ticks come from the independent 3-good-block counter.

**What is DRAWN (DOM, Tailwind).**
- Panel `border-2 stone-800, bg stone-900/50, p-3`. Header: tiny "Sprint pace" (10 px, uppercase, wide tracking, stone-500) and "ALTERNATE LEFT · RIGHT · LEFT · RIGHT" (amber-500, Bebas Neue/Oswald, base size).
- Row `h-44` (176 px): left, a vertical gauge `flex-1`, bg stone-950, 2-px border stone-800, overflow hidden; right a 96-px (`w-24`) stats sidebar.
- Gauge layers (bottom to top): (z0) fill, anchored bottom, `height = bar%`, `transition-all 75 ms`, opacity .95, gradient by zone: slow (<60) `#57534e -> #a8a29e` (no glow); target (60-85) `#D4A017 -> #fbbf24 -> #fef3c7` with glow `0 -2px 16px rgba(212,160,23,.6)`; burn (>85, test `>= 85.0001`) `#dc2626 -> #f87171 -> #fca5a5` with glow `0 -2px 16px rgba(239,68,68,.6)`. (z10) overlays: burn zone = top 15% `bg red-900/25`, bottom border red-900/60, label "🔥 burning out" (8 px, red-400, uppercase); target zone = from 15% to 40% from top (i.e. 60-85) `bg amber-500/10`, 2-px top/bottom border amber-500/60, centred label "target" (10 px bold amber-300, dark text-shadow); "too slow" label bottom-left (8 px stone-500); numeric readout top-right `Math.round(bar)%` 10 px mono coloured `#fca5a5` / `#fef3c7` / `#a8a29e` by zone.
- Sidebar: "Good bars" + `{goodBars} / 3` (Bebas Neue 2xl amber) + "to next +max⚡" (9 px); "Gained" + `+{maxEnergyGained}` + "max energy".
- Two big tap buttons `grid-cols-2 gap-3`, `py-6`, `border-4`: "👈 LEFT" (key hint A) and "👉 RIGHT" (key hint D) (emoji 3xl + Bebas label). States: idle `border-amber-600 bg-amber-900/20 active:scale-95`; valid-tap flash `border-amber-300 bg-amber-500/40 scale-95`; invalid flash `border-red-500 bg-red-900/40`. `touch-action: manipulation`, no text select.
- Footer: "Same finger twice = doesn't count · stay in TARGET zone — burning out costs extra ⚡".

**Rebuild notes.**
- Pure logic (lift): `applyTap(state, side)`, `drain(state, dt)`, block evaluator (`avg`, `burnRatio`, `isGood`, 3-good counter). All constants above. Keep sample weighting by frame/time, not by tap.
- Phaser: bar = rectangle + gradient texture masks; zones are fixed overlays at 15% / 25% / 60% of the gauge height. Use a keyboard `A/D/←/→` + two big touch buttons. Needs fixed-step drain (dt based) so it is frame-rate independent; avoid per-frame React-style re-render.
- Oddities: (a) code 3 good bars vs comments 5; (b) `lastSide` is React state so two taps within one render could both pass the same-side check (race); (c) a bad block does not reset `goodBars`; (d) the tab being hidden stops rAF; on return `dt` is large and the bar drains to 0 instantly; (e) `lastSampleAtRef`/`lastBlockAtRef` are initialised at mount, not at activation.

---

## 5. Note maths helpers  (lines 3060-3068)

- `NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']` (sharps only).
- `midiToFreq(m) = 440 * 2^((m-69)/12)`.
- `midiToName(m) = NOTE_NAMES[m % 12] + (floor(m/12) - 1)` (so 60 -> `C4`, 69 -> `A4`; valid for non-negative integer MIDI only).
- `freqToCents(f, target) = 1200 * log2(f/target)`.
- Comment says the working singing range is G3 (MIDI 55) to G5 (79); actual roots span 48-74 and tops reach 83.
- Pure; portable verbatim. Re-used inline (not via a helper) in the tuner: octave folding of cents `while c>600: c-=1200; while c<-600: c+=1200` (appears 3 times: ribbon, loop, render).

---

## 6. detectPitch (autocorrelation)  (lines 3070-3122)

**What it is.** Monophonic fundamental-frequency estimator. Input: `Float32Array` of time-domain samples in [-1,1] (always an `AnalyserNode` with `fftSize=2048`, so exactly 2048 samples, ~46 ms at 44.1 kHz / ~43 ms at 48 kHz) and `sampleRate`. Output: Hz, or `-1` for "no pitch". Used by `VoiceRangePicker` (calibration) and `PitchTuner` (every frame).

**Algorithm, step by step (reimplement exactly for parity).**
1. `SIZE = buffer.length`. `rms = sqrt(sum(buf[i]^2)/SIZE)`. If `rms < 0.01` => return -1 (silence gate; no normalisation, mic runs with echoCancellation/noiseSuppression/autoGainControl all OFF so input level matters).
2. Trim (Chris-Wilson style): `threshold = 0.2`; `r1 = 0, r2 = SIZE-1`. `for i in [0, SIZE/2)`: first `i` with `|buf[i]| < 0.2` => `r1 = i`, break. `for i in [1, SIZE/2)`: first `i` with `|buf[SIZE-i]| < 0.2` => `r2 = SIZE - i`, break. (If no sample in that half is below the threshold the bound stays at the buffer edge.) `trimmed = buffer.slice(r1, r2)`; `T = trimmed.length` (usually ~2047, shorter only when the buffer starts/ends loud).
3. Autocorrelation: `c[i] = sum_{j=0}^{T-i-1} trimmed[j] * trimmed[j+i]` for `i in [0,T)` (un-normalised, biased: later lags have fewer terms). Cost ~T^2/2 = ~2.1 M multiply-adds per call; it is called once per animation frame in PitchTuner (60 Hz) => ~125 M MAC/s on the main thread (JS `Array`, not typed).
4. Skip the zero-lag lobe: `d = 0; while (d < T-1 && c[d] > c[d+1]) d++`.
5. Peak: `maxpos = argmax_{i in [d, T)} c[i]` (global maximum, no first-peak preference, no clarity/threshold test; relies on the triangular bias to favour the shortest period). If `maxpos < 1` => -1.
6. Parabolic interpolation: `x1 = c[T0-1] || 0`, `x2 = c[T0]`, `x3 = c[T0+1] || 0`; `a = (x1 + x3 - 2*x2)/2`; `b = (x3 - x1)/2`; `if (a) T0 = T0 - b/(2a)`.
7. `if T0 < 1` => -1. `freq = sampleRate / T0`. Accept only `60 <= freq <= 1500`, else -1.
Callers add their own extra filters: VoiceRangePicker keeps only `70 < f < 1100`, PitchTuner uses any `freq > 0`.

**Known weaknesses (keep in mind for the rewrite).** Octave errors (sub-/super-harmonic) are common on voice; no voicing confidence; noise above RMS 0.01 can produce arbitrary freqs in 60-1500 Hz (can accidentally score as in-tune); 2048 samples limit low-bass accuracy (60 Hz needs ~735 samples/period at 44.1 kHz). The tuner masks octave errors by scoring octave-invariantly (see PitchTuner).

**Rebuild notes.** Pure function, lift verbatim to `pitch.ts` and unit-test with synthetic sines (e.g. 110/220/440/880 Hz at 44.1k/48k, noise below/above RMS 0.01). For Phaser: reuse the Phaser WebAudio context (`this.sound.context`) if desired and keep the same `AnalyserNode`; consider running detection at 30 Hz or in an `AudioWorklet`/FFT-based autocorrelation (same API, same results within +-1 sample) because the O(n^2) loop is heavy on phones. If the algorithm is replaced (YIN/MPM), keep the same output contract (Hz or -1, 60-1500 Hz gate) and the 50-cent in-tune thresholds.

---

## 7. VOICE_RANGES + rangeFromCalibration  (lines 3124-3148)

- `VOICE_RANGES.higher = { label:'Higher voice', description:'Soprano, alto, kids', roots:[60,62,64,65,67,69,71,72,74] }` (C4 D4 E4 F4 G4 A4 B4 C5 D5; C-major scale tones).
- `VOICE_RANGES.lower  = { label:'Lower voice',  description:'Tenor, baritone, bass', roots:[48,50,52,53,55,57,59,60,62] }` (C3 D3 E3 F3 G3 A3 B3 C4 D4).
- `rangeFromCalibration(midi)`: `center = Math.round(midi)`; `roots = center-4 ... center+4` (9 consecutive semitones, chromatic). Comment says +-5; code is +-4.
- Roots are the BOTTOM note of each exercise; exercise tops reach `root+7` (triad), `root+4` (do-re-mi), `root+7` or `+9` (karaoke). Default fallback pool if `roots` is empty: `[55,57,59,60,62,64,65,67,69,71,72]` (G3..C5).
- Rebuild: pure data + 1 function. Note: no octave folding of the calibration result; a hummed note in a very low/high octave yields unusual roots (calibration is not octave-corrected).

---

## 8. TUNER_MODES, MELODY_TEMPLATES, generateChord  (lines 3150-3219)

**TUNER_MODES (lines 3155-3177).** `durationMs` = length of ONE note in BOTH the listen and the sing phase.
| key | label | tag (UI text) | durationMs | intervals | flow |
|---|---|---|---|---|---|
| `beginner` | Beginner | "echo each note" | 2500 | `'triad'` | `'alternating'` (listen one note -> sing it -> next) |
| `advanced` | Advanced | "3 in a row" | 1000 | `'doremi'` | `'demo-then-sing'` (listen all 3, then sing all 3) |
| `karaoke` | Karaoke | "5-note melody" | 700 | `'melody'` | `'demo-then-sing'` |
Default mode if key unknown: `beginner`. (Stale comments elsewhere say beginner=do-re-mi/800 ms and advanced=triads/2500 ms: the table above is what runs. The HouseScreen button hints agree with the table: beginner "Full triads - echo each note one at a time", advanced "Do-re-mi - listen to all 3, then sing all 3 back", karaoke "5-note melody - listen, then sing the whole phrase back".)

**MELODY_TEMPLATES (lines 3180-3188), karaoke, semitone offsets from root:**
1. `DO-RE-MI-FA-SOL` `[0,2,4,5,7]`
2. `SOL-FA-MI-RE-DO` `[7,5,4,2,0]`
3. `DO-MI-SOL-MI-DO` `[0,4,7,4,0]`
4. `DO-RE-MI-RE-DO` `[0,2,4,2,0]`
5. `MI-RE-DO-RE-MI` `[4,2,0,2,4]`
6. `DO-MI-DO-SOL-DO` `[0,4,0,7,0]`
7. `TWINKLE INTRO` `[0,0,7,7,9]`

**generateChord(roots, mode='beginner') (lines 3190-3219)** returns `{ name: string, notes: [{ midi, freq, name }] }`.
- `cfg = TUNER_MODES[mode] || TUNER_MODES.beginner`; `pool = roots non-empty ? roots : default pool`; `root = pool[floor(random()*len)]` (uniform, repeats allowed, no "different from last" guard).
- `intervals==='melody'`: random template; notes `root + i`; name `"<RootName> <TEMPLATE NAME>"` (e.g. `"C4 DO-RE-MI-FA-SOL"`; the root name is the actual root pitch, "DO" is always the root).
- `intervals==='doremi'`: offsets `[0,2,4]` (always ascending major); name `"<RootName> DO-RE-MI"`.
- else (`'triad'`): `isMajor = random() < 0.5`; offsets `[0,4,7]` or `[0,3,7]`; name `"<RootName> MAJOR"` / `"<RootName> MINOR"`. The triad is sung as an ascending ARPEGGIO of 3 single notes (never simultaneously).
- Each note: `midi`, `freq = midiToFreq(midi)`, `name = midiToName(midi)`.
- Rebuild: pure, accept an injectable RNG for deterministic tests.

---

## 9. VoiceRangePicker  (lines 3221-3385)

**What it is.** Small panel that stores the singer's comfortable range, either by a quick pick (Higher/Lower, no mic) or by humming a note into the mic for 2.5 s (auto-detect). Shown by `HouseScreen` (L13926) when the player first presses "SING ALONG - TAP TO START" while `char.voiceRange` is null, or via the "Range: ... (change)" button inside the tuner. Written value goes to `char.voiceRange`/`char.voiceRangeMidi` (persistent save) and the parent then starts the tuner (`setPlayMode(true)`).

**Props in.** `currentRange: null|'higher'|'lower'|'auto'` (highlights the matching quick-pick button); `onSet({ voiceRange, voiceRangeMidi })`; `onCancel?: () => void` (Cancel link shown in 'choose' mode only if provided).
**Out.** `onSet({voiceRange:'higher'|'lower', voiceRangeMidi:null})` on a quick pick; `onSet({voiceRange:'auto', voiceRangeMidi: detectedNote.midi})` on "Use this".

**Internal state.** `mode: 'choose'|'detecting'`, `detectedNote: {freq,midi,name}|null`, `detectionStatus: string`, `permissionError: string`; refs `audioCtxRef`, `streamRef`, `samplesRef`.

**Calibration flow (`startCalibration`).**
1. `mode='detecting'`, status "Requesting mic…", clear error.
2. If `window.isSecureContext === false` => error "Mic requires HTTPS. Use the Netlify URL on your phone." and back to 'choose'.
3. `getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}})`; new `AudioContext` (webkit fallback); `createMediaStreamSource` -> `AnalyserNode{fftSize:2048}` (not connected to destination); `Float32Array(2048)`; status "Hum any comfortable note for 2 seconds…".
4. rAF loop for 2500 ms (`elapsed < 2500`): `getFloatTimeDomainData`, `freq = detectPitch(buffer, ctx.sampleRate)`; push every `freq > 0`.
5. At 2500 ms: keep `f > 70 && f < 1100`; if fewer than 10 samples => status "Didn't hear enough — try humming louder. Tap to retry." (a Retry button appears only if the status text contains the word "retry"), cleanup, stop. Otherwise sort ascending, `median = samples[floor(n/2)]`, `midi = Math.round(69 + 12*log2(median/440))`, `detectedNote = {freq:median, midi, name:midiToName(midi)}`, status '', cleanup (stop all tracks, close ctx).
6. Errors: `NotAllowedError` => "Mic permission denied. Pick higher/lower instead."; others => `err.message`; mode back to 'choose' and error shown in red.
7. Unmount cleanup closes the stream/ctx; the tick checks `audioCtxRef.current` and exits if disposed.

**What is DRAWN (DOM).** Panel `border-2 amber-500, bg stone-950, p-4`; title "🎤 Pick your singing range" (Bebas Neue/Oswald, amber-500), subtitle "We'll match notes to where your voice sits comfortably." (11 px stone-400).
- 'choose': two buttons (grid-cols-2): "HIGHER VOICE / soprano · alto · kids" and "LOWER VOICE / tenor · baritone · bass" (selected one has `border-amber-500 bg-amber-500/20`); "— or —" divider; wide button "🎙️ Hum a comfortable note / Auto-tune the range to your voice"; red error text; optional "Cancel" underline link.
- 'detecting' & no result: blue-bordered box (`border-blue-500 bg-blue-950/30`), 🎙️ emoji (3xl), status text (blue-300 uppercase), optional "Retry" button, "Cancel" link (just `setMode('choose')`).
- 'detecting' & result: amber box showing "Detected note", note name (Bebas 3xl amber-500), `freq.toFixed(1) Hz`, buttons "Try again" (clears result, restarts) and "Use this".

**Rebuild notes.**
- Pure logic: the median/filter/round calibration reducer (`samples[] -> {freq, midi, name} | null`; thresholds 10 samples, 70-1100 Hz).
- Phaser: needs a mic-capture helper (shared with PitchTuner) returning an `AnalyserNode`; UI as a Phaser panel or DOM overlay. Re-use one mic stream between calibration and tuner if possible.
- Oddities: (a) status says 2 seconds, sampling is 2.5 s (frame-limited to roughly 150 samples at 60 fps, 10 needed); (b) pressing Cancel during detection only flips `mode` - the mic/ctx keep running until the 2.5 s timer ends, and the loop then sets `detectedNote` invisibly; starting a second calibration right away runs two loops on separate streams; (c) the comment promises octave folding but none is done; (d) `AudioContext` is created after an `await` and `resume()` is never called (Safari/iOS may leave it suspended; the shared `getAudioCtx()` does resume); (e) own `AudioContext`, so it ignores the game's mute setting (irrelevant here: no sound is played).

---

## 10. PitchTuner mini-game  (lines 3388-4021)

**What it is.** The Musicality "SING ALONG" training mini-game (microphone required). The game plays reference notes (synthesised organ-like sine tones), the player sings them back, and a SingStar-style canvas ribbon + cents needle + sustain meter show whether the voice is in tune. Accuracy (0..1) is reported up to the parent which converts it into bonus stat gains at each 5-block payout. Mounted by `HouseScreen` (L13939) only when `trainStat==='mus' && playMode`:
`<PitchTuner onAccuracyUpdate={handleAccuracy} evaluateEveryMs={2500} active={trainActivity.active} voiceRange={char.voiceRange||'higher'} voiceRangeMidi={char.voiceRangeMidi} mode={tunerMode}/>` with a Beginner/Advanced/Karaoke toggle row, a "Range: Lower|Auto|Higher (change)" button and "Back to AFK" below it.

**Props in.** `onAccuracyUpdate(avgScore:number /*0..1*/, count:number)`; `evaluateEveryMs` (default 2500); `active:boolean` (activity running; gates scheduler and detection loop); `voiceRange:'higher'|'lower'|'auto'` (default 'higher'); `voiceRangeMidi:number|null`; `mode:'beginner'|'advanced'|'karaoke'`; `onChangeRange` (declared, NEVER used).

### 10.1 State and refs (lines 3391-3460)
- React state: `permission` `'pending'|'granted'|'denied'|'unsupported'|'insecure'`; `errorDetail`; `chord` (`{name, notes[]}`, lazily `generateChord(resolveRoots(), mode)`); `noteIdx` (index in chord); `phase` `'listen'|'sing'`; `demoIdx` (-1 or the note being demoed in listen-all); `detectedFreq` (Hz or -1; set EVERY frame); `sustainFill` 0..1; `noteScores` array (null until scored, then 0..1).
- Refs (read by rAF loops to avoid stale closures): `audioCtxRef`, `analyserRef`, `streamRef`, `bufferRef`, `noteStateRef {inTuneTime, totalTime, DURATION_MS, _lastTick}`, `phaseRef`, `noteIdxRef`, `chordRef`, `detectedFreqRef`, `demoIdxRef`, `noteScoresRef`, `ribbonCanvasRef`, `refTonesRef` (live oscillators), `chordScoresRef` (per-note scores awaiting report).
- `resolveRoots()`: `voiceRange==='auto' && voiceRangeMidi` -> `rangeFromCalibration(voiceRangeMidi)`; `'lower'` -> `VOICE_RANGES.lower.roots`; else `VOICE_RANGES.higher.roots`.
- `noteStateRef.DURATION_MS` follows `TUNER_MODES[mode].durationMs` (effect keeps it in sync).
- Chord regeneration key `voiceRangeKey = "<voiceRange>:<voiceRangeMidi||''>:<mode>"`; when it changes: new chord, `noteIdx=0`, `noteScores` reset to nulls.

### 10.2 Microphone init (lines 3680-3727)
On mount (once): if `window.isSecureContext===false` => permission `'insecure'` ("This page is loaded over an insecure connection. The mic API only works on https:// or localhost."); if no `navigator.mediaDevices?.getUserMedia` => `'unsupported'` (message about file:// on iOS Safari); else `getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}})`; if the component was unmounted meanwhile stop the tracks; create `AudioContext` (`webkitAudioContext` fallback) stored in `audioCtxRef`; `createMediaStreamSource(stream)` -> `AnalyserNode{fftSize:2048}` (NOT connected to destination, so no software feedback); `bufferRef = new Float32Array(2048)`; `permission='granted'`.
Errors -> `permission='denied'`, `errorDetail = "<name>: <detail>"` with details: `NotAllowedError` "Permission denied. Tap the lock icon in the URL bar and allow microphone access, then reload."; `NotFoundError` "No microphone found on this device."; `NotReadableError` "Mic is in use by another app or unavailable."; `SecurityError` "Browser blocked mic access — you might be on http:// instead of https://."; otherwise `err.message`.
Unmount cleanup: `cancelled=true`, stop stream tracks, stop reference oscillators, close the context.
The SAME `AudioContext` is also used to play the reference tones (its own context, NOT the game's shared `getAudioCtx()`, so the player's mute setting is ignored and `resume()` is never called).

### 10.3 Reference tone synthesis (lines 3462-3529)
- `buildRefVoice(ctx, freq, dest, t0, t1)`: three `sine` oscillators at multiples 1x / 2x / 3x of `freq` with gains `1.0 / 0.18 / 0.06` (comment calls the 3x partial a "fifth", it is the 3rd harmonic), each `start(t0)`, `stop(t1+0.05)`; returns the 3 oscillators.
- `playReferenceTone(freq, durationSec=2.0)` (alternating flow; called with `DUR/1000`): stops previous tones; master gain: `0.0001 @ t`, linear ramp to `0.18 @ t+0.05`, hold `0.18 @ t+dur-0.15`, linear ramp to `0.0001 @ t+dur`; connected to `ctx.destination`.
- `playReferenceSequence(notes, durEachSec, gapSec=0.05)` (demo-then-sing flow): stops previous; `base = currentTime + 0.02`; note i: `t0 = base + i*(dur+gap)`, `t1 = t0+dur`; master gain `0.0001 @ t0` -> `0.18 @ t0+0.04`, hold `0.18 @ max(t0+0.05, t1-0.10)`, `-> 0.0001 @ t1`. Scheduled on the WebAudio clock (no setTimeout drift for the audio; the UI highlight uses setTimeout, small mismatch possible).
- Peak amplitude ~ 0.18 * (1+0.18+0.06) = 0.22.
- Rebuild: pure parameters; implement with Phaser's `sound.context` (WebAudio) the same way (3 oscillators + envelope), or pre-render 3 sine+harmonic buffers. Honour the game mute setting (the original does not).

### 10.4 Phase scheduler (lines 3729-3804)
Effect deps `[permission, active, chord, noteIdx, modeCfg.flow]`; does nothing unless `permission==='granted' && active`. `DUR = DURATION_MS` (ms). Timers are cleared (and reference oscillators stopped) in the effect cleanup.
- `startSing()`: `phase='sing'`, `demoIdx=-1`, reset `noteState` (`inTuneTime=0, totalTime=0, _lastTick=now`), schedule `scoreAndAdvance` after `DUR`.
- `scoreAndAdvance()`: `score = min(1, inTuneTime / (DURATION_MS * 0.4))`; write `noteScores[noteIdx]=score`; push to `chordScoresRef`; if more notes remain `noteIdx+1`, else immediately generate a NEW chord (`generateChord(resolveRoots(), mode)`), `noteIdx=0`, `noteScores` = nulls (the last note's score is overwritten and never shown). The loop therefore repeats forever until `active` goes false or the component unmounts.
- Flow `'alternating'` (beginner): per note: `phase='listen'`, `sustainFill=0`, `demoIdx=-1`, `playReferenceTone(note.freq, DUR/1000)`, then `startSing` after `DUR`. Timeline per note: listen 2500 ms + sing 2500 ms = 5 s; per triad 15 s. In-tune needed for full score: 0.4*2500 = 1000 ms.
- Flow `'demo-then-sing'` (advanced, karaoke): only when `noteIdx===0`: `phase='listen'`, `sustainFill=0`, `demoIdx=0`, `playReferenceSequence(allNotes, DUR/1000, 0.05)`, `setTimeout(setDemoIdx(i), i*(DUR+50))` for i>0, `startSing` after `totalDemoMs = n*DUR + (n-1)*50`. For `noteIdx>0` it calls `startSing()` immediately (singing is back-to-back, `DUR` per note, with no gap or cue). Per loop: advanced demo 3*1000+2*50 = 3100 ms + sing 3*1000 = 3000 ms ~ 6.1 s (in-tune needed per note 400 ms); karaoke demo 5*700+4*50 = 3700 ms + sing 3500 ms ~ 7.2 s (in-tune needed per note 280 ms). Plus small React-effect delays between notes.
- Because everything is driven by React effect + `setTimeout`, timings are "about" `DUR`; the audio clock and the score window are not locked together.

### 10.5 Pitch detection + scoring loop (lines 3806-3857)
Effect deps `[permission, active, evaluateEveryMs]`; one rAF loop (60 Hz):
1. `analyser.getFloatTimeDomainData(buffer)`; `freq = detectPitch(buffer, ctx.sampleRate)`; `setDetectedFreq(freq)` (every frame) and mirrored to `detectedFreqRef`.
2. If `phaseRef==='sing'`: `target = chord.notes[noteIdx]`; `dt = now - ns._lastTick; _lastTick = now; totalTime += dt`; if `freq>0 && target`: `cents = freqToCents(freq, target.freq)` folded into (-600, 600] by +-1200 (so any octave of the target counts); if `|cents| < 50` then `inTuneTime += dt`. Then `setSustainFill(min(1, inTuneTime / (DURATION_MS*0.4)))`.
3. Accuracy report: `if (now - lastEval > evaluateEveryMs)` (starts at loop start, 2500 ms): `lastEval=now`; `scores = chordScoresRef`; if non-empty: `avg = mean(scores)`; `onAccuracyUpdate?.(avg, scores.length)`; `chordScoresRef = scores.slice(-6)` => rolling window: the next report averages the last <= 6 already-reported scores plus any new ones. No report is made until at least one note has been scored (so the parent value stays at its previous value / 0). In beginner mode a note finishes only every 5 s, so most reports repeat the same average.
Parent uses it (HouseScreen L12758-12824): `accuracyRef.current = acc` (last report); at each payout (every 5 ticks; play mode tick = 2500 ms, so every 12.5 s): `statGain = acc>=0.8 ? 3 ("perfect pitch!") : acc>=0.5 ? 2 ("+1 bonus") : 1`; then `mic` gear x1.25 (Mus), festival prep x2, rounded; +10 xp. Play mode scales energy x0.3, hunger 0.5/tick, mood -0.15/tick, `tickRealMs=2500`, `tickMinutes=3`. The "better PitchTuner accuracy" text on the Mic gear (L2051) is NOT implemented in this component (see GOTCHAS).

### 10.6 Pitch ribbon canvas (lines 3531-3678)
Created by an effect keyed on `[permission]` (the canvas only exists after 'granted'). `W=360, H=130, S=2` => backing store 720x260, `scale(2,2)`, `imageSmoothingEnabled=false`; CSS: full width, `aspect-ratio 360/130`, pixelated, bg `#0c0a09`, border `amber-700/40`. Own rAF loop reading refs; `fc` frame counter; bails out if no chord.
Layout & drawing, per frame:
1. Clear `#0c0a09`.
2. Vertical pitch range: `yMin = min(chord midis) - 4`, `yMax = max(chord midis) + 4`, `yRange = max(8, yMax-yMin)`; `padX=18, padTop=14, padBottom=22`; `usableH = 130-14-22 = 94`; `midiToY(m) = H - padBottom - ((m-yMin)/yRange)*usableH` (higher pitch = higher on screen).
3. Staff lines: `#1c1917` 1-px rect `(padX, y, W-2*padX, 1)` for `m = ceil(yMin)`, step 2 semitones, while `m < yMax`.
4. Bars: `barCount = notes.length`; `stepX = (W-2*padX)/barCount` (108 for 3 notes, 64.8 for 5); `barWidth = 0.7*stepX`; note i centre `cx = padX + i*stepX + stepX/2`; bar rect `(cx-barWidth/2, y-5, barWidth, 10)`; top highlight `rgba(255,255,255,0.18)` 2 px high. `currentIdx = demoIdx>=0 ? demoIdx : noteIdx`.
   Bar colours: current `#fbbf24`; past (`noteScores[i]!=null || (i<noteIdx && phase==='sing')`) green `#5a8030` if score>=0.7, brown `#7a6028` if >=0.3, red `#7a2828` otherwise; upcoming `#3a3530`.
   Current bar also gets a pulsing 1-px outline `#fef3c7` at `(x-1.5, y-6.5, barWidth+3, 13)` with alpha `0.6+0.4*sin(fc*0.15)`.
   Note-name label under each bar: `bold 9px monospace`, centred, y=`H-6`, colour `#fbbf24` (current) else `#7a7570`.
5. Player marker (ONLY if `detectedFreq>0 && phase==='sing'`): `detectedMidi = 69+12*log2(f/440)` folded by +-12 until within +-8 semitones of the target midi; clamped to `[yMin,yMax]`; `py=midiToY(clamped)`; `targetX` = current bar centre; `cents` folded as above; colour: green `#22c55e` if `|cents|<50`, amber `#fbbf24` if `<100`, red `#dc2626` otherwise. Draw: faint vertical guide `colour+'33'` 2 px wide from marker to the target bar; marker bar `markerW = 0.85*barWidth`, 4 px high, centred on `targetX` at `py`; when in tune an additional glow rect `rgba(34,197,94,0.30)` `(targetX-markerW/2-4, py-5, markerW+8, 10)`; cents readout `bold 8px monospace` left-aligned at `(targetX+markerW/2+4, py+3)` text like `+12¢`/`-30¢` (`toFixed(0)`).
6. Phase label top-left at `(padX, padTop-2)`, `bold 8px monospace`, colour `#88AADD` in listen else `#fbbf24`: `"🔊 LISTEN i/n"` (during demo-all), `"🔊 LISTEN"` (listen one), else `"🎤 SING i/n"`.

### 10.7 DOM UI (lines 3859-4020)
- `pending`: box "Requesting mic..." / "Allow microphone access in your browser".
- `denied|unsupported|insecure`: red box `border-red-900 bg-red-950/30`: "🎤 Mic unavailable", `errorDetail`; for insecure/unsupported also "How to fix:" (mobile browsers block mic on file:// URLs; host the file on https, e.g. drag to netlify.com/drop).
- `granted`: stacked panel `border-2 stone-800 bg stone-900/50 p-3`:
  1. Title lines: flow text `"Listen all N, then sing all N"` (demo-then-sing) or `"Listen, then repeat"` + ` · <mode label>`; chord name (e.g. "D4 MAJOR") in Bebas Neue/Oswald amber-500 text-lg.
  2. Sequence dots (one per note, with note name under, 9 px mono): demo-all: current demo note filled blue-500 pulsing, others outlined stone-700; otherwise notes before `noteIdx` are filled by score (amber-500 >=0.7, amber-700 >=0.3, red-700 else), current note outlined amber-500 pulsing, upcoming outlined stone-700.
  3. "🎯 PITCH TRACK" header + "green = on pitch" + the ribbon canvas (10.6).
  4. Phase panel: border/bg blue (`#88AADD` text) during listen/demo, amber (`#D4A017`) during sing; hint text: demo-all "🔊 Listen — note i / n"; listen-one "🔊 Listen"; sing in demo-then-sing "🎤 Sing back — note i / n"; sing in alternating "🎤 Your turn — sing it back"; big note name (text-4xl Bebas Neue, `--` if none; during demo-all follows `demoIdx`) and its `freq.toFixed(1) Hz`.
  5. Cents needle gauge (`h-16`, opacity 0.3 during listen): tolerance zone = middle 50% (`left:25% right:25%`, amber/15 with amber/40 side borders = +-50 cents of a +-100-cent scale); centre line; labels "flat" / "in tune" / "sharp"; needle (Tailwind `w-1` = 4 px wide, from `top-6` to `bottom-2`) positioned at `(clamp(cents,-100,100)+100)/200` of the width, amber-500 + glow `0 0 12px #D4A017` when |cents|<50 else stone-300, `transition 75 ms`; cents text bottom-centre; "sing now" when sing phase and no pitch; "playing reference tone..." during listen. The needle uses the SING target note (`chord.notes[noteIdx]`), not the demo note.
  6. Sustain meter: label "Hold the note" (sing) / "Get ready..." + `%`; bar width `sustainFill*100%`, colour `#D4A017` if >=0.95, `#aa8000` if >=0.5, else `#5a4030`.

### 10.8 Rebuild notes (PitchTuner)
- Liftable pure logic (framework-free TS): `generateChord`, `resolveRoots`, `TUNER_MODES`, cents/fold maths, `NoteScorer` (accumulate `inTuneMs` when `|cents|<50` during sing; `score=min(1, inTune/(0.4*durationMs))`), timeline planner (`planListen(mode, notes)` returns demo times and sing windows), rolling accuracy reporter (`slice(-6)`), calibration reducer.
- Needs a Phaser/Web Audio equivalent: mic capture (`getUserMedia` w/ the three flags false), `AnalyserNode(fftSize 2048)` read in `update()` (or throttled), reference-tone synth, the ribbon (Graphics or RenderTexture, same layout maths), cents needle, sustain meter, phase banner, dots. All the React `setState`-every-frame traffic should become plain scene fields.
- Drive the phases from a single state machine updated by scene time rather than `setTimeout`s; lock demo audio schedule and sing windows to the same clock (original can drift tens of ms).
- Keep thresholds: RMS 0.01, 60-1500 Hz, +-50 cents in tune, 40% of note duration, octave-folded cents, report every 2.5 s with last-6 rolling window.
- Oddities: (a) mic requested the moment the tuner mounts; (b) detection runs for the whole session even in the listen phase (ref tone leaking into the mic is simply ignored because scoring only counts in sing); (c) last note's score of a chord is never displayed (chord replaced in the same tick); (d) ribbon marker position folds within 8 semitones of the target while colour/label/scoring fold cents to +-600, so at 7-8 semitones off they can visually disagree (see GOTCHAS 11); (e) `chordScoresRef` is not cleared on mode/range change; (f) a note of silence scores 0 and drags the rolling average; random mic noise passing the RMS gate may land near the target by chance; (g) state is updated every frame, 125 M MAC/s detection - throttle in Phaser.

---

## 11. Engine-facing summary (what each unit hands back)

| Unit | Callback / output | Value & cadence | Parent reaction |
|---|---|---|---|
| BuskAnimation | none | consumes `block`, `rewardKey`, `active`, `color` | cosmetic |
| RhythmTap | `onAccuracyUpdate(accuracy, hits, total)` | every `evaluateEveryMs` (2500), window accuracy `hits/(hits+misses)` | `accuracyRef=acc`; busk payout: x1 / ramp 1.0-1.5 for 0.5-0.8 / x2 for >=0.8; +1 fan guaranteed at >=0.8 |
| RunTracker | `onBlockResult({avg,isGood,burnRatio})` | every 2500 ms | stored; at payout: sho +2 if good (+1 shoes), else +1; energy -`round(8*burnRatio)` |
| RunTracker | `onMaxEnergyTick()` | every 3rd good block | `maxEnergy +1` (cap 150), toast |
| VoiceRangePicker | `onSet({voiceRange, voiceRangeMidi})` / `onCancel()` | on user choice | saved to char; tuner starts |
| PitchTuner | `onAccuracyUpdate(avg, count)` | every 2500 ms once >=1 note scored | `accuracyRef=avg`; Mus payout: +3 (>=0.8), +2 (>=0.5), +1 |

---

## 12. Constants cheat-sheet (all numeric/colour constants in range)

**Pitch/audio:** RMS gate `0.01`; trim threshold `0.2`; accept `60-1500 Hz`; analyser `fftSize 2048`; mic flags `echoCancellation/noiseSuppression/autoGainControl = false`; calibration: duration `2500 ms`, filter `70-1100 Hz`, min samples `10`, median; in-tune `< 50 cents`; "close" `< 100 cents`; fold `+-600`; needle scale `+-100`; note score divisor `0.4 * durationMs`; score bands for colouring `>=0.7` / `>=0.3`; accuracy report `2500 ms`, rolling `slice(-6)`; ref-tone partials `1 / 2 / 3` x gains `1.0 / 0.18 / 0.06`, master gain `0.18`, attack `0.05` (sequence `0.04`), release `0.15` (sequence `0.10`), gap `0.05 s`, sequence start `+0.02 s`.
**Voice ranges:** higher roots `60,62,64,65,67,69,71,72,74`; lower roots `48,50,52,53,55,57,59,60,62`; calibration `center-4..center+4`; default fallback pool `55,57,59,60,62,64,65,67,69,71,72`.
**Tuner modes:** beginner 2500 ms triad/alternating; advanced 1000 ms do-re-mi/demo-then-sing; karaoke 700 ms melody/demo-then-sing.
**RhythmTap:** 300x300; `TARGET_Y 245`; speed `175 px/s`; BPM `100`; PERFECT `80 ms`, GOOD `180 ms`; look-ahead `4000 ms`; note 28x28; flash radius `18 + age/10`, life 300 ms; judgement life 600 ms; combo shows at >=3.
**RunTracker:** `TAP_GAIN 12`, `DRAIN 25/s`, target `60-85`, burn `>85`, block `2500 ms`, 3 good blocks per +1 max energy; flash 80/100 ms.
**BuskAnimation:** 140x90 x4; coin ttl 60, gravity 0.08, spawn `(64+-3, 38)`, 3 coins per reward; passer-by speed `0.4 px/frame`, colours `#84cc16 #a78bfa #fb7185 #22d3ee #f97316`; pile cap 8; bob 6 frames, walk 8, mouth 4, blink 4/120, sign 30/60, text 10/25.
**Palette (Busk):** sky `rgb(122,192,232)->rgb(170,216,248)`; sun `#fef3c7`; cloud `#fff/#dadada`; buildings `#a8a4b8 #bcb8c8 #9ea0b8`; grass `#5a8a3a/#7aaa4a`; foliage `#2a6020 #3a7028 #4a8030`, trunk `#3a2410`; path `#b0a890/#c8c0a0`, details `#7a7058`; lamp `#3a3530`; jar `#5a5048 #a89878 #7a6a50 #3a322a`; coin `#D4A017/#fef3c7`; skin `#d4a87a`; outfit `#1a1a2e` + player colour; mouth `#5a2020/#3a1010`; mic `#888/#aaa`.
**Palette (UI):** background `#0c0a09` / `#1c1917`; gold `#D4A017`; amber `#fbbf24`; cyan `#22d3ee`; red `#CC2200` / `#dc2626`; ribbon green `#22c55e`; listen blue `#88AADD`.

---

## 13. Suggested module split for the Phaser/TS rebuild

- `audio/pitch.ts` (pure): `NOTE_NAMES`, `midiToFreq`, `midiToName`, `freqToCents`, `foldCents(c)`, `detectPitch(buf, sr)`, `reduceCalibration(freqs): {freq,midi,name}|null`.
- `audio/tuner.ts` (pure): `VOICE_RANGES`, `rangeFromCalibration`, `TUNER_MODES`, `MELODY_TEMPLATES`, `generateChord(roots, mode, rng)`, `resolveRoots(voiceRange, midi)`, `scoreNote(inTuneMs, durationMs)`, `TunerSession` (state machine: listen/sing, noteIdx, scores, rolling-accuracy report) driven by `update(dtMs, freq)` with injected clock.
- `minigames/rhythmTap.ts` (pure): `PATTERN`, `scheduleNotes(songT)`, `judge(songT, lane)`, `sweepMisses`, `windowAccuracy`.
- `minigames/runTracker.ts` (pure): `TAP_GAIN`, `DRAIN`, `applyTap`, `drain`, `evaluateBlock`.
- `scenes/` (Phaser): `BuskScene` (or Container), `RhythmTapUI`, `RunTrackerUI`, `VoiceRangePickerUI`, `PitchTunerUI`; plus a shared `MicInput` service (getUserMedia + AnalyserNode + cleanup + error mapping).
- Engine contract to preserve: the payout reads "last reported accuracy / last block result" at each 5-tick reward; mini-game must keep calling its report callbacks even when the player does nothing (so accuracy decays to 0 rather than holding a stale high value).

**TypeScript-style contracts derived from the code (for the new module boundaries):**
```ts
type Lane = 0 | 1 | 2;                       // RhythmTap
type Side = 'L' | 'R';                       // RunTracker
type VoiceRange = null | 'higher' | 'lower' | 'auto';
type TunerModeKey = 'beginner' | 'advanced' | 'karaoke';
interface ChordNote { midi: number; freq: number; name: string }
interface Chord { name: string; notes: ChordNote[] }          // 3 notes (beginner/advanced) or 5 (karaoke)
interface TunerMode { label: string; tag: string; durationMs: number;
                      intervals: 'triad' | 'doremi' | 'melody'; flow: 'alternating' | 'demo-then-sing' }

// callbacks handed to the engine
type RhythmReport = (accuracy: number, hits: number, total: number) => void;   // every 2500 ms
type RunBlockReport = (r: { avg: number; isGood: boolean; burnRatio: number }) => void; // every 2500 ms
type MaxEnergyTick = () => void;                                                // every 3rd good block
type TunerReport = (avgScore: number, count: number) => void;                   // every 2500 ms, once >=1 note scored
type RangeSet = (v: { voiceRange: 'higher' | 'lower' | 'auto'; voiceRangeMidi: number | null }) => void;

// props
BuskAnimation   { color?: string='#D4A017'; block?: number=0; rewardKey?: number=0; active?: boolean=true }
RhythmTap       { onAccuracyUpdate?: RhythmReport; evaluateEveryMs?: number=5000; active?: boolean=true }
RunTracker      { onBlockResult?: RunBlockReport; onMaxEnergyTick?: MaxEnergyTick; active?: boolean=true; evaluateEveryMs?: number=2500 }
VoiceRangePicker{ currentRange?: VoiceRange=null; onSet: RangeSet; onCancel?: (() => void) | null }
PitchTuner      { onAccuracyUpdate?: TunerReport; evaluateEveryMs?: number=2500; active?: boolean=true;
                  voiceRange?: VoiceRange='higher'; voiceRangeMidi?: number|null=null; onChangeRange?: null /*unused*/;
                  mode?: TunerModeKey='beginner' }
```

---

## 14. Timelines and worked numbers (for tests and tuning)

**PitchTuner timelines (D = durationMs per note, n = notes).**
| Mode | n | Listen phase | Sing phase | Loop (approx.) | In-tune ms for score 1.0 | Score of 250 ms in tune |
|---|---|---|---|---|---|---|
| beginner (alternating) | 3 | each note: 2500 ms, immediately followed by its own 2500 ms sing window (note1 listen, note1 sing, note2 listen, ...) | 3 x 2500 | 15 000 ms | 1000 | 0.25 |
| advanced (demo-then-sing) | 3 | 3 x 1000 + 2 x 50 = 3100 ms (all notes, `demoIdx` 0,1,2 at t=0,1050,2100) | 3 x 1000 = 3000 ms | ~6100 ms | 400 | 0.625 |
| karaoke (demo-then-sing) | 5 | 5 x 700 + 4 x 50 = 3700 ms (`demoIdx` at 0,750,1500,2250,3000) | 5 x 700 = 3500 ms | ~7200 ms | 280 | 0.893 |
Score bands used for colouring: `>= 0.7` good (green ribbon / amber dot), `>= 0.3` medium (brown / dark amber), `< 0.3` bad (red).
Accuracy that reaches the parent = mean of up to the last 6 (+ new) note scores; payout tiers 0.8 / 0.5.

**RhythmTap schedule (ms from start):** per 2400-ms bar: 0 L0, 300 L1, 600 L2, 900 L1, 1200 L0, 1500 L1, 1800 L2, 2100 L1. Pixel y of a note at time t when song time is s: `245 - (t - s) * 0.175`. Note first appears (y = -20) at `t - s ~ 1514 ms`; reaches the hit line at `t - s = 0`; judged missed at `s - t > 180` (y = 276.5).

**RunTracker examples:** steady 2.08 taps/s holds the bar at a constant average level; empty hands: the bar drains 100 -> 0 in 4 s; one valid tap is worth 0.48 s of drain; a block (2500 ms) needs a mean level >= 60, e.g. a sawtooth between 54 and 66 (about 5.2 valid taps per block); reaching the burn zone (> 85) needs >= ~3 taps/s sustained.

**detectPitch test vectors to build:** sine 110 Hz, 220 Hz, 440 Hz, 880 Hz at amplitude 0.3 (RMS > 0.01) with `sampleRate` 44100 and 48000 => expect result within ~1 % of input (parabolic refine); amplitude 0.01 (RMS ~ 0.007) => -1; 40 Hz and 2000 Hz => -1; white noise at RMS 0.05 => arbitrary / mostly in 60-1500 Hz (documents the weakness); buffer of zeros => -1.

**Cents examples:** target A4 440 Hz: 452.9 Hz = +50 (boundary, NOT in tune because the test is `< 50`), 880 Hz = 0 after folding (octave-invariant), 622.25 Hz (D#5, +6 semitones) = 600 -> folded stays +600 (not in tune), 659.25 Hz (E5, +7 st) = +700 -> folded -500.

---

## 15. PARITY CHECKLIST (tick when the rebuild matches)

**Shared**
- [ ] Park mini-game toggles exist: Busk <-> RhythmTap, Run <-> RunTracker; Mus tuner opens via SING ALONG; mini-game mounted only while the activity is active.
- [ ] Mini-games report to the parent only by the callbacks in section 11; parent reads latest value at payout.
- [ ] Keyboard input ignored when typing / key repeat / ctrl-alt-meta (global dispatcher).

**BuskAnimation**
- [ ] 140x90 grid, x4 pixel scale, nearest-neighbour; all layers in section 2 (sky, sun+halo, 2 clouds, 6 buildings + 5 windows, grass, 2 trees, path + stones + speckles, lamp, passer-by, jar + pile + blinking sign, performer, waves, word pops, coins).
- [ ] Performer uses `char.color` for outfit; bob/mouth/waves/word-pops only when active; word pops only when block > 0.
- [ ] Passer-by continuous loop at 24 px/s with random shirt colour among 5; 2-frame walk at 7.5 Hz.
- [ ] 3 coins per reward (spec in section 2), pile up to 8 in the jar.
- [ ] Time-based (not frame-based) animation constants.

**RhythmTap**
- [ ] 3 lanes A/S/D + 3 buttons, notes fall at 175 px/s, hit line y=245 of 300, BPM 100 pattern of 8 notes/bar.
- [ ] PERFECT < 80 ms, GOOD < 180 ms, nearest unjudged note in the lane; mis-tap = MISS + combo reset + miss counted.
- [ ] Auto-miss when 180 ms late; combo display from 3; judgement popups 600 ms; flash 300 ms.
- [ ] Lane sounds: B / T / Pf via `playHeroSound`.
- [ ] Accuracy = hits/(hits+misses) per 2500 ms window; reported as (accuracy, hits, total); window reset after each report.

**RunTracker**
- [ ] A/D (+ arrows) and two buttons; same-side tap ignored (red flash); first tap free.
- [ ] +12 per valid tap, -25/s drain, clamp 0-100; zones 0-60 slow, 60-85 target, 85-100 burn (gauge visuals per section 4).
- [ ] 2500 ms blocks: avg, burnRatio (fraction of frames > 85), isGood = avg >= 60; `onBlockResult` every block.
- [ ] 3 good blocks -> `onMaxEnergyTick`, counter UI "n / 3" and "+N max energy".

**Pitch toolkit**
- [ ] `detectPitch` identical contract (RMS 0.01, trim 0.2, ACF, skip first lobe, parabolic, 60-1500 Hz).
- [ ] Voice range tables, calibration +-4 semitones, fallback pool.
- [ ] 3 tuner modes with the exact durations / intervals / flows; 7 melody templates; chord naming strings.

**VoiceRangePicker**
- [ ] Quick pick Higher / Lower (stores `voiceRangeMidi: null`); hum calibration 2500 ms, filter 70-1100 Hz, >= 10 samples, median -> MIDI -> "Use this" stores `'auto'` + midi; retry flow; error messages for permission/HTTPS.

**PitchTuner**
- [ ] Mic requested on open with echoCancellation/noiseSuppression/autoGainControl off; states pending/granted/denied/unsupported/insecure with the messages in 10.2.
- [ ] Reference tone: 3-partial sine (1, 0.18, 0.06) with the envelopes in 10.3; sequence scheduled on the audio clock with 50 ms gaps.
- [ ] Phase machine exactly as in 10.4 (alternating vs demo-then-sing; new chord immediately after the last note).
- [ ] Scoring: in-tune = |folded cents| < 50 accumulated while singing; score = min(1, inTune / (0.4 * D)); reports every 2500 ms with last-6 rolling mean.
- [ ] UI: chord title, dots, pitch ribbon (layout maths in 10.6), phase banner, cents needle, sustain meter (colour thresholds 0.5 / 0.95).
- [ ] Changing mode / range regenerates the chord and resets note scores.

---

## OPEN QUESTIONS / GOTCHAS

1. **Comments disagree with code (code wins):** RunTracker says "every 5 good bars" in two comments and in the parent (L14772) but the code and UI use 3. PitchTuner comment says `DURATION_MS` Beginner 800 / Advanced 2500; actual 2500 / 1000 (karaoke 700). Parent comment says beginner = do-re-mi, advanced = full triads; actual is the reverse. `rangeFromCalibration` comment says +-5; code is +-4. Calibration prompt says "2 seconds"; sampling runs 2.5 s. Ref-tone "fifth harmonic" is the 3rd harmonic. `generateChord` header comment about "3-note chords" predates karaoke's 5 notes. Confirm with the designer which numbers they intend (3 vs 5 good bars especially).
2. **Mic gear text vs behaviour:** gear `mic` (L2049-2051) advertises "better PitchTuner accuracy" but `PitchTuner` has no such prop; the only effect is x1.25 on Mus stat gain at payout. The `accuracyBoost` prop at L14078 belongs to another mini-game (Beatbox Hero, other range). Decide whether to implement a tolerance bonus.
3. **Frame-rate dependent animation:** BuskAnimation (and every `frameCount`-driven scene) uses per-frame increments; RunTracker uses dt (OK); RhythmTap uses wall clock (OK). Rebuild with a fixed timestep.
4. **No count-in in RhythmTap:** first kick is spawned at song time 0 sitting on the hit line and the first 5 notes (<=1.2 s) are already on screen - the first bar is partly unplayable. Mis-taps count as misses (accuracy hurt by button mashing). PERFECT vs GOOD has no effect on reward. Accuracy of an empty window is 0.
5. **Latest-value reward semantics:** parent keeps only the last reported accuracy / last run block (blocks every 2.5 s vs payouts every 12.5 s in play mode, 2.5 s in AFK). Mini-game results from the first 10 s of every payout cycle are discarded. Decide if the rebuild should average over the cycle (behaviour change) or keep parity.
6. **PitchTuner reports nothing until a note has been scored** (and in beginner mode that is up to ~5 s); the parent's `accuracyRef` is reset to 0 when the mini-game ends.
7. **Pitch detector performance/accuracy:** O(n^2) autocorrelation every frame; global-max peak picking invites octave errors (masked by octave-invariant scoring); noise just above RMS 0.01 can score as "in tune". Any replacement algorithm must keep the same acceptance behaviour or note that scoring becomes stricter/looser.
8. **Mic/AudioContext handling:** tuner and calibration create private `AudioContext`s after an `await` and never call `resume()` (Safari/iOS suspended-context risk); reference tones ignore the game mute toggle (`getAudioCtx()` is the muted-aware one); `VoiceRangePicker` Cancel does not stop the mic until the 2.5 s loop ends; no re-use of the stream between calibration and tuner; permission prompt appears as soon as PitchTuner mounts.
9. **UI state oddities:** last note's score of a chord is never shown (chord is regenerated in the same tick); `onChangeRange`, `LEAD_TIME_MS`, `maxCombo`, `perfects`, `feedback`, `passedNotes`, `totalTime` are unused; RunTracker's `goodBars` is never reduced by a bad block; same-side tap check uses React state (can race on very fast taps); arrow keys not `preventDefault`ed; global key listeners fire even if the component's `active` is false.
10. **Busk remount behaviour:** coin burst + pile of `rewardKey` appears immediately when BuskAnimation remounts mid-activity (e.g. after toggling Rhythm mode); the passer-by cooldown (`spawned*300`) never actually delays; clouds pop in/out at wrap points.
11. **Ribbon marker position vs cents folding:** the ribbon marker's vertical position is folded by whole octaves until it is within 8 semitones of the target (then clamped to the visible range), while the marker colour, the cents label, the needle and the scoring all use cents folded into (-600, 600]. For a voice 7-8 semitones off, the marker can sit above the target while the label shows a negative value (e.g. +7 st displayed as `-500¢`). Both treat "an octave off" as in tune.
12. **Out-of-range dependencies for the rebuilder:** `playHeroSound`/`HERO_SAMPLES` (player's recorded samples, IndexedDB at L17265+), `useActivity` cadence, `char.color`, `char.voiceRange*` persistence, gear (`mic`, `premium_shoes`), festival prep multiplier. The Beatbox Hero mini-game (L4023+, `HERO_LANES B/T/K/Pf`) is NOT in this range.
