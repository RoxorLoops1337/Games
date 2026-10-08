# Beatbox Story - Feature Inventory 06: Mingle modal, Rent arc, Foxy / Pig Pen / BeeAmGee, Bjarne scenes, Flashbacks, Title, Dream, Apartments, Plant

Source: `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx`, lines 7432-9130 (read completely, every line).
Callers, data tables and shared helpers outside the range were read only to name triggers, text and helper behaviour; they are cited as "L####".
Conventions used below:
- `(x,y,w,h)` is a `_px` rectangle in the 200x130 logical canvas; `(cx,cy) rN` is a circle.
- `fc` is the frame counter, +1 per requestAnimationFrame (about 60 per second on a 60 Hz display).
- "N on / M period" means the element is visible while `fc % M < N`.
- Hex colours are exactly those in the source.

## SUMMARY
1. Range = 1 React modal (MingleEncounter), 1 title-screen component, 3 character sprites (Foxy, Pig Pen, BeeAmGee) and 21 canvas scene painters; everything is procedural `fillRect` pixel art on a 200x130 canvas scaled x3 (PixelScene), the only image asset is `title.png`.
2. The Title screen does NOT use `drawTitleScene` (dead code); it shows the painted `title.png` (1376x768 key art) + HTML buttons and the chiptune `title` track (160 BPM, C-G-Am-F). The dead painter is still documented because its motifs show the original intent.
3. The shared player renderer `drawBeatboxer(ctx,x,y,look,facing,active,fc)` (L16468, outside range) is used by 10 scenes here; 6 scenes instead hand-draw a simplified player (colours only, no hair style / accessory) - these must be unified in the rebuild.
4. Story arcs covered: weekly RENT (paid / missed / final warning / evicted -> couch surf -> back on feet), Foxy's first soup rescue, BeeAmGee (cypher sighting -> bar meeting -> studio coaching), crew battle, 4 one-time sleep flashbacks, a 5% dream, apartment tier 2/3 move-ins, houseplant drown / replacement.
5. All scenes are shown through the generic `Cutscene` component (tap-to-advance lines, Skip, progress bar, 0.5 s fade-in); the Mingle modal has its own UI; no scene in this range plays music or SFX (only the Title screen has audio).
6. Mingle flow: random beat of the encounter -> 2-3 reply buttons -> response + effect readout -> "LEAVE THE BAR CHATTER" applies effects, +30 min, -6 energy, counters, date / couple toasts; "leave" before replying is free.
7. Characters: Foxy = soft, lowercase, plant-and-soup roommate (they/them, green oversized sweater, auburn hair, gold earring); Pig Pen = cocky rival (red Big-Ben clock cap, black/red track jacket, smirk, goatee); BeeAmGee = weathered grey-bearded Danish OG in a black leather jacket, called "Bjarne" inside the code.
8. Visual bugs to fix on rebuild: BeeAmGee's face is overpainted by a crowd silhouette in the meeting scene; crew-battle opponent #3 is the player's own face in red; Pig Pen's `sad` pose is unused and duplicated elsewhere; the parent flashback draws the player standing though intended seated; the rent "LATE" notice hard-codes "-50$".
9. Frame-counter animation is refresh-rate dependent (2x faster on 120 Hz) and the canvases are scaled by a fluid, non-integer CSS factor (about 2.2x) - the Phaser port should drive `fc` from time at 60 Hz and use integer scaling or higher-resolution art.
10. Recommended path: Phase A port the draw functions verbatim onto a Phaser CanvasTexture (instant parity), Phase B replace scene by scene with painted plates + sprite-sheet overlays, using the parity checklist at the end of this file.

---

## Shared rendering model: PixelScene and `_px` helpers  (PixelScene L6632-6678, `_px` L2263, `_drawSky` L2272, `_drawDaytimeSky` L2283; outside range)
- Every scene painter has the signature `(ctx, fc, look?)` and a logical canvas `W=200, H=130` (aspect 20:13).
- `PixelScene` sets the canvas to 600x390 (scale 3) with `imageSmoothingEnabled=false`.
- Each frame it fills `#0c0a09`, calls the painter inside try/catch (an exception draws a blank frame and is logged once), then schedules the next rAF.
- CSS: `width:100%`, `aspect-ratio:200/130`, `image-rendering:pixelated`, 2px stone-800 (`#292524`) border. In a 448px column the real scale is about 2.2x (non-integer).
- `_px(ctx,x,y,w,h,color)` = `fillRect(floor(x),floor(y),w,h)` - x,y floored, w,h NOT floored.
- `_drawSky(ctx,W,h,r0,g0,b0,r1,g1,b1)` = one 1px row per scanline, linear gradient, channels clamped to 255.
- `_drawDaytimeSky(ctx,W,h=50)` = `rgb(122,192,232) -> rgb(170,216,248)`.
- Idioms reused everywhere (build each once in Phaser):
  - soft glow: filled circle `rgba(254,243,199,0.08-0.30)`;
  - light cone: filled triangle/quad `rgba(254,243,199,0.10)`;
  - vignette: black bars at top / bottom `rgba(0,0,0,0.18-0.30)`;
  - twinkle: `(fc+i*k) % M < N`;
  - steam / hearts / sparkles: 1-3px rects with `globalAlpha = 1 - phase`;
  - pulsing rings: stroked `arc`, radius `6 + phase*28`, alpha `0.45*(1-phase)`.

## Shared presentation: the Cutscene wrapper  (Cutscene L6680-6850; outside range)
- Used for every scene in this file except the Title screen and the Mingle modal.
- Overlay `fixed inset-0`, background `radial-gradient(circle at center,#1c1917,#0c0a09)`, content column `max-w-md` (448px).
- "Skip ->" button top-right (10px, uppercase, stone-500, amber on hover).
- Each beat shows its scene, re-mounted per beat with a 0.5 s `cutFade` (opacity 0->1, translateY 8px->0).
- Optional speaker label: 11px, uppercase, 0.4em tracking, Bebas Neue/Oswald, coloured by `speakerColor`.
- Current line: Oswald 300, 20px, `#f5f5f4`, 0.4 s fade per line.
- Amber "->" advance button (text "OK" on the final line of the final beat).
- Beat progress bar of thin segments: done `#D4A017`, current `#a8740a`, future `#3a3530`.
- `fastDialogue` setting auto-advances every 2 s; `reducedMotion` removes fades.
- Game time is paused while a cutscene is open (`setGamePaused`).
- `playCutscene(props, flagKey)` (L11157) writes `storyFlags[flagKey]=true` when the cutscene completes (used for once-only scenes).
- An optional `music` prop calls `startMusic(name)`; NO scene in this range passes it.

## Shared player renderer `drawBeatboxer` and the `look` object  (L16468-16559, `lookFromChar` L16597; outside range, used by 10 scenes here)
- `look = { shirt, skin, hair, style, accessory }`.
- `lookFromChar(char)`:
  - shirt = active outfit colour, default `char.color`, fallback `#D4A017`;
  - skin = `char.skin || '#d4a87a'`; hair = `char.hairColor || '#1a1a2e'`; style = `char.hairStyle || 'short'`;
  - accessory only if its unlock condition holds (snapback cap 5 open mics, studio beanie 3 coaching sessions, shades 50 fans, round glasses = Pascal couple, fedora 10 jams, headphones = premium headphones bought).
- Geometry (feet at (x,y); about 16 wide x 30 tall):
  - shadow (-7,0,14,1) `rgba(0,0,0,.45)`;
  - legs (-4,-8-bob,3,8) and (1,-8+bob,3,8) `#1a1a2e`, shoes (-4,-1,3,1) and (1,-1,3,1) white;
  - torso (-5,-19,10,11) in `look.shirt` plus a white collar line (-5,-19,10,1);
  - arms (-7,-18,2,8) and (5,-18,2,8) in shirt colour; mic-side hand (6 or -8,-14,2,3) in skin; mic (grey `#888` / `#aaa`) on the facing side;
  - head (-4,-25,8,7) skin; eyes 1x1 `#1a1a2e` (blink = 4 frames in every 120); mouth (-1,-20,3,1) `#5a2020`.
- Hair styles: `short`, `mohawk`, `long`, `spike`, `fade` (each a few rects in `look.hair`).
- Accessories: `shades` (7x1 black bar), `glasses` (two round lenses), `cap` (red `#dc2626` + gold band + brim toward facing), `beanie`, `fedora`, `headphones` (black arc + red cups).
- Animation only when `active=true`: `bob = floor(fc/6)%2` swaps the leg heights every 0.1 s; the mouth alternates closed / open (3x2 `#3a1010`) when `floor(fc/4)%4` is 1 or 3. `active=false` = static pose with blinking only.
- Used here by: cypher, meeting, studio, crew battle (two figures), parent flashback, comment flashback, song flashback, dream, apartment 2, apartment 3.
- Hand-rolled player copies (shirt / skin / hair colours only): couch surf, soup, back-on-feet (fixed colours, ignores `look`), plant drown, plant arrived, childhood (kid).

---

## Scene index (scene -> where it is triggered -> speaker -> once-flag)
| Scene (painter) | Lines | Caller | Trigger | Speaker / colour | Once flag |
|---|---|---|---|---|---|
| MingleEncounter modal | 7438-7581 | BarScreen L16184, startMingle L15634 | bar "MINGLE" button (day>=5, night, energy>=6) | the stranger | metEncounters[id]++ |
| drawRentPaidScene | 7771 | L13347 | Sunday sleep, rent affordable, FIRST time only | none | firstRentPaid |
| drawRentMissedScene | 7773 | L13360 | Sunday, can't pay, rentLate becomes 1 | none | - |
| drawEvictionWarningScene | 7775 | L13372 | Sunday, can't pay, rentLate becomes 2 | none | - |
| drawEvictedScene, drawCouchSurfScene, drawBackOnFeetScene | 7777, 7780, 7863 | L13384-13400 | Sunday, can't pay, rentLate>=3 (3 beats) | none | - |
| drawFoxySoupScene | 7984 | L12721 | first "safety net": cash<5 and hunger==0, 7-day cooldown | FOXY `#84cc16` | foxyFirstSafetyNet |
| drawBjarneCypherScene | 8226 | L14878 | next jam after >=1 battle win | none | bjarneCypherSighting |
| drawBjarneMeetingScene | 8266 | L15755 | after an open mic, once the cypher sighting happened | BEEAMGEE `#a3a3a3` | bjarneIntroduced |
| drawBjarneStudioScene | 8308 | L12583 | each paid coaching session ($50, 3-day cooldown) | BEEAMGEE `#a3a3a3` | - |
| drawCrewBattleScene | 8362 | L15797 | doCrewBattle (30 energy, 90 min) | CREW BATTLE - WIN `#84cc16` / LOSS `#dc2626` | - |
| 4 flashbacks | 8412-8529 | L13313-13320 via `_flashbackDrawFn` L1176 | sleep, 25% roll, first unseen eligible | none | flashbacksSeen[id] |
| drawDreamScene | 8701 | L13329 | sleep, day>=30, 5% | none | - |
| TitleScreen (+ dead drawTitleScene) | 8630 / 8535 | L11500 | cold start | - | - |
| drawApt2Scene / drawApt3Scene | 8793 / 8835 | L13029-13049 | buying apartment tier 2 / 3 | none | apt2MovedIn / apt3MovedIn |
| drawPlantDrownScene | 8876 | L12950 | 4th watering the same day | "the houseplant" `#a08030` | - |
| drawPlantArrivedScene | 8992 | L14519 | buying a replacement plant (from the Tuesday after the death) | none | - |

Out-of-range note: lines 9124-9130 open the "WEEKEND TOUR" block (`drawTourRoadScene` at L9130; motel and stage scenes follow, tour cutscene text at L16103-16129). It belongs to the next reader.

---

## MingleEncounter modal  (lines 7432-7581)
- **What it is:** a single-beat bar conversation UI (opener -> reply choice -> response). Header comment: the whole conversation costs 30 game minutes and 6 energy regardless of outcome.
- **Trigger:** BarScreen's "Mingle" panel (L16161), visible on every bar night except the closed Monday and only once `day>=5` (`CONTENT_UNLOCKS.mingle`). Button label `MINGLE (-6 energy, +30 min)`, disabled below 6 energy.
- `startMingle` (L15634): energy<6 -> toast "Too tired to chat"; `pickMingleEncounter(char, MINGLE_POOL)` = weighted random among encounters whose `when(char)` passes; none -> toast "The bar is unusually quiet tonight."; otherwise the encounter is stored and the modal mounts.
- **Props:** `char, setChar, encounter, showToast, onClose`.
- **State / refs:**
  - `picked` (selected reply option or null);
  - `beat` = random element of `encounter.beats`, fixed per mount (romance candidates have 4 beats so repeat meetings vary, everyone else 1);
  - `look` = `encounter.look` if the encounter defines one (Pig Pen, Crystix, sponsors, romance, drunk), otherwise a random stranger:
    - shirt = `speaker.color` or one of `#a04040 #5a7050 #a06030 #4060a0 #a06090 #7a3a40 #5a3a18 #3a5a6a`;
    - skin one of `#d4a87a #a87844 #e0b890 #7a5040`; hair one of `#1a1a2e #3a2410 #5a2010 #7a3a20 #dadada`.
- **Layout, top to bottom** (overlay `fixed inset-0 z-50`, background `radial-gradient(circle at center,#1c1917,#0c0a09)`, card `max-w-md bg-stone-950 border-2 border-stone-800`):
  1. `PixelScene` running `drawMingleScene` (L9833, outside range):
     - back wall `#1c1825` with dot wallpaper, two bottle shelves with glinting bottles, bar counter at y=96, warm hanging lamp;
     - the stranger seated at the counter at x=116 (head/torso/arms only, coloured by `look`, via `_drawSeatedAtBar`);
     - the stranger's drink (colour = `encounter.id.length % 4`), and the player's own cyan drink on the left; the player is NOT drawn.
  2. Speaker name: 11px, uppercase, 0.4em tracking, Bebas Neue, in `speaker.color`.
  3. Opener line in quotation marks: Oswald 300, 16px, `#f5f5f4`.
  4. Reply buttons before picking: one per option, full width, left-aligned, text `-> {option.text}` (Oswald 14px `#d6d3d1`), 2px stone-800 border, bg `stone-900/40`, border becomes `amber-500/50` on hover. 2-3 options.
  5. After picking (replies vanish; the choice is final, there is no confirm and no back):
     - "you said" box (border `amber-500/40`, bg `amber-500/5`, 9px label `amber-500/60`, italic quote of the reply);
     - response box if `outcome.line` is not null (speaker name label in `speaker.color` + quoted line, Oswald 300 16px);
     - effect readout, 10px uppercase amber-500 centred, only non-zero fields: `+N mood-heart`, `+N energy-bolt`, `+N hunger-fork`, `+$N`, `+N fans`, joined with " . ". Affinity, flags and bookDate effects are applied silently and are NOT listed;
     - primary `Btn` (amber-500 fill, black mono 12px uppercase text) "LEAVE THE BAR CHATTER ->".
  6. Footer: left "+30 min . -6 energy" (10px stone-600); right text button "leave ->" shown only before a reply is picked.
- **Buttons and outcomes:**
  - reply button: sets `picked`, no immediate effect;
  - "LEAVE THE BAR CHATTER" (`finish`): applies everything below and closes;
  - "leave ->": `onClose()` only - NO effects, no time, no counters (the cost reminder is misleading).
- **`finish` transaction (single `setChar`):**
  - `applyMingleEffects(c, effects, outcome)` (L1995): mood clamped 0-100, energy clamped 0..maxEnergy, hunger clamped 0-100, cash >= 0, followers >= 0;
  - `effects.flags` merged into `storyFlags` (e.g. `crystixMet`, `sponsor_<brand>_signed`, `sponsor_<brand>_done`, `<id>_dateScheduled`, `jinCollab`);
  - `effects.affinity` deltas added per candidate (floor 0) and `romanceState` recomputed: below 5 building, 5+ romancing, 10+ couple;
  - `outcome.bookDate` sets `dateBooking {partner, partnerName, partnerColor, day: day+daysAhead(2), minute: 600}`;
  - then `passMinutes(c,30)`: minutes +30 plus passive mood decay (0.3 per hour base, +0.5 if hunger<30, +0.5 if energy<30, +1.0 at hunger 0, +1.0 at energy 0);
  - energy = max(0, energy - 6) AFTER the option's own energy delta; mood = decayed mood + the option's mood delta;
  - `mingleCount+1`, `daily.mingles+1`, `metEncounters[encounter.id]+1`.
- **Toasts after the transaction:**
  - if `bookDate`: `Date with {partnerName}: {DAY} HH:MM . park` (day = `DAY_NAMES_SHORT[(day+daysAhead)%7]`, clock = `minute+360` so 600 shows 16:00);
  - else if affinity effects: the first candidate crossing a threshold gets `You and ID are a couple now (heart)` (new affinity >=10, previous state not couple) or `Things with ID are getting real` (>=5 and previous state building);
  - then `onClose()`.
- **Encounter data consumed (L1262-1975)**, option = `{text, outcome:{line|null, effects:{mood,energy,hunger,cash,followers,flags,affinity}, bookDate?}}`:
  - generic strangers (10, weights 2-4): old timer, thrifted-shirt record-store guy, shy fan (needs 5 fans), "real beatbox died in 2009", guy four beers in, notebook travel writer, someone who saw you Tuesday (needs 1 open mic), two friends overheard, panicking phone-loser, quiet one at the bar; effects are mood nudges (-2..+6) and a few +1..+3 fans;
  - Pig Pen (4 variants, weight 3-4; look: black shirt, red hair `#dc2626`): before the Saturday battle, after a loss, after a win (rematch), after the "Penny reveal" ("you eat dinner?"); colour `#fb7185`;
  - Crystix (2, weight 1): first meeting after 2 battle wins (+12 mood, +3 fans, flag), then occasional re-meets; colour `#22d3ee`;
  - sponsors (10 = 5 brands x pre / pitch): Snort-VPN 50 fans, Redfull 100, Sure 200, Adipas 500, Samsong 1000; accept = +$50, +10 fans, +8 mood and a signed flag, decline sets `_done`;
  - romance (6 candidates: Luca `#22d3ee`, Mira `#fb7185`, Sky `#84cc16`, Pascal `#fbbf24`, Jin `#a78bfa`, Roo `#fb7185` needing 80 fans): 4 conversation beats each, replies are right (+1 affinity, +mood), neutral (0) or wrong (-1, mood penalty); plus 6 "ask-out" encounters (affinity>=5, not couple, no pending date) whose "yes" gives +12 mood, +2 affinity and a park date 2 days later at 16:00;
  - bad (1, weight 2): "???" drunk in `#dc2626`; every reply costs mood (-8, -10, -3).
- **Sound / music:** none (no click SFX, no track change).
- **Rebuild notes:**
  - build as a Phaser UI scene or DOM panel: backdrop scene, speaker + line, N option buttons, result view with the effect readout, a single finish transaction;
  - keep: random beat fixed per mount, `look` fallback logic, readout whitelist, free exit before replying;
  - repaint the stranger as portrait/bust variants (4 skins x 5 hairs x 8 shirts or a small portrait set) plus named-NPC portraits;
  - consider surfacing affinity / flag consequences and keyboard selection (neither exists today).

---

## Rent scenes - shared painter `_drawRentScene(ctx, fc, state)`  (lines 7584-7777)
- **What it is:** a Sunday-morning establishing shot of the walk-up apartment "14"; one painter with four states `paid`, `missed`, `warning`, `evicted`. Wrappers (L7771-7777) `drawRentPaidScene`, `drawRentMissedScene`, `drawEvictionWarningScene`, `drawEvictedScene` take no `look`.
- **Trigger:** `computeRentEvent` (L1217) on the Sunday-morning sleep transition (`newDay%7===6`). Rent by apartment tier = `[50,100,200]`.
  - cash >= rent -> `paid` (cutscene only on the first payment, otherwise just the toast `Rent paid . -$X`);
  - else `rentLate+1`: 1 -> `missed` (toast "Rent late . week 1. Mood -10"), 2 -> `warning` (toast "Rent late . final warning. Mood -15"), 3+ -> `evicted` (toast "Evicted. Couch-surfing for 3 days.").
- **Shared layers, back to front** (canvas 200x130):
  - sky: `_drawSky` rows 0-59, `rgb(74,64,106) -> rgb(138,128,130)` (dusty violet-grey dawn);
  - sun: block (28,24,12,12) `#fef3c7` + halo (34,30) r16 `rgba(254,243,199,.25)`;
  - building: (60,6,84,90) brick `#7a4030`, roofline (60,6,84,2) `#a06040`; mortar rows every 6px from y=10 to 96 `#5a2810`, plus 1px vertical mortar every 24px with a half-brick offset on alternate rows;
  - two upstairs windows (76,16,18,16) and (110,16,18,16) `#3a3a4a`, 1px `#1a1a1a` frame with cross mullions (vertical at +8, horizontal at +7); curtain (77,17,8,14) `#5a4a30` on the left window unless evicted;
  - door frame (88,50,28,46) `#3a1a14`; door (90,52,24,44) `#a02a20` with top highlight `#c84030`; inset panels (94,56,16,16) and (94,76,16,16) `#7a1a14` with `#c84030` top lines; brass knob (109,75,2,2) `#fbbf24`;
  - house number "14": bold 5px monospace `#fef3c7`, centred at (102,49);
  - stoop (80,96,40,4) `#5a4030` with `#7a5a40` lip; sidewalk (0,100,200,30) `#7a7a7a` with `#a8a8a8` top line;
  - mailbox on a post: body (144,80,12,14) `#3a3a3a`, lid (144,80,12,2) `#5a5a5a`, slot line (144,90,12,1) `#1a1a1a`, post (148,94,4,6) `#1a1a1a`; flag (156,82,4,1)+(156,82,1,4) green `#22c55e` when paid else red `#dc2626`.
- **Look usage:** none. **Sound:** none.

## Rent paid  (state `paid`; lines 7656-7668, wrapper 7771)
- **Moment:** the first Sunday rent payment only; a small celebratory intro to the rent mechanic.
- **Extra drawing:**
  - coin (152,70+drop,3,3) `#fbbf24` with a 1px `#fef3c7` highlight, falling 10px (70 -> 80, onto the mailbox lid) over 30 frames then hidden 20 frames (loop 50);
  - big green check on the door: stroked polyline (96,66)->(100,70)->(108,60), `#22c55e`, 2px;
  - green mailbox flag.
- **Text** (no speaker, one beat): "Sunday. Rent's paid." / "-$[amount]. The apartment's still yours." / "Another week to make it work."
- **Rebuild:** static plate + coin sprite + check stamp (pop-in); warm morning light.

## Rent missed  (state `missed`; lines 7669-7691, wrapper 7773)
- **Moment:** week 1 late.
- **Extra drawing:**
  - yellow notice (94,60,16,14) `#fbbf24` with `#fef3c7` top line, taped over the upper door panel; text "LATE" (bold 4px `#7a1a14`) and "-50$" (bold 4px `#3a1a10`) - the amount is hard-coded 50 even for tier 2/3 rent;
  - mailbox overflowing: envelopes (145,74,10,6) and (146,73,8,1) `#f0e4c8`, red stamp line (147,75,6,1) `#dc2626`;
  - pulsing flag: extra block (156,80,4,3) `#fb7185`, 18 on / 30 period;
  - small grey rain cloud (130,12,14,6) + (132,10,10,4) `#5a5060`; a single cyan tear (137,18,1,2) `#22d3ee`, 40 on / 60 period.
- **Text:** "You didn't make rent this week." / "The notice is taped to your door." / "You've got till next Sunday."

## Eviction warning  (state `warning`; lines 7692-7725, wrapper 7775)
- **Moment:** week 2 late, "final warning".
- **Extra drawing:**
  - big red notice (90,56,24,24) `#dc2626` with `#fb7185` top strip and inner panel (91,57,22,22) `#7a1a14`; text "FINAL" and "WARNING" (bold 5px `#fef3c7`), "PAY OR LEAVE" (bold 4px);
  - flashing red border overlay (88,54,28,28) `rgba(255,0,0,.20)`, 10 on / 20 period;
  - dark storm cloud `#3a3540` = (100,4,30,8) + (95,6,8,6) + (130,6,8,6), overlapping the roofline;
  - lightning polygon (118,12)(114,22)(118,22)(112,32)(120,18)(116,18)(120,12) `#fef3c7` for 4 frames every 70 (about every 1.2 s, labelled "rare" in the source);
  - mailbox stuffed with unopened bills: (145,72,10,8) `#f0e4c8`, red lines at (144,71,12,1), (146,74,8,1), (146,76,8,1).
- **Text:** "Final warning, in red ink." / "Pay by Sunday or you're out." / "Your phone hasn't stopped buzzing."
- **Sound opportunity (not in source):** thunder; none exists today.

## Evicted  (state `evicted`; lines 7726-7767, wrapper 7777; beat 1 of 3)
- **Moment:** week 3 late -> eviction.
- **Changes to the shared layers:** door darkened (door `#3a2820`, highlight `#5a3a30`, panels `#2a1a10`, panel highlights `#4a3020`), curtain removed.
- **Extra drawing:**
  - two planks (86,60,32,4) and (86,76,32,4) `#7a5030` with `#5a3010` shadow lines (y=64 and y=80) and four 2x2 `#1a1a1a` nail heads each;
  - paper notice (94,60,16,12) `#dadada` with white top line, red "EVICTED" (bold 4px) and "NO ENTRY" (bold 3px `#1c1917`);
  - cardboard boxes on the stoop (56,86,18,12) and (124,88,20,10) `#a87844` with `#c89a64` lid line and `#5a3a18` tape line; a green `#3a7028` plant sticking out of the left box;
  - black silhouette of the player at far left: head (6,96,6,6), torso (4,102,6,14), legs (4,116,2,4) and (10,116,2,4), dragged bag (12,110,6,6) `#3a2818`; it is STATIC - "walking off-screen" is only implied;
  - grey overlay `rgba(0,0,0,.30)` over the sky band (0,0,200,60).
- **Text:** "Boards on the door." / "Your stuff in two cardboard boxes." / "Nowhere to go but Foxy's friend's couch."

## Couch surf scene  (lines 7779-7860; `drawCouchSurfScene(ctx,fc,look)`; beat 2 of 3)
- **Moment:** 3 nights (`COUCHSURF_DAYS=3`) on the couch of a friend of Foxy's. Setting: cool dim living room at night.
- **Layers, back to front:**
  - wall `#252a35` (0,0,200,95) with a 14px dot grid `#2a3040`; floor (0,95,200,35) `#2a1a10` with `#3a2818` top line;
  - window (130,14,50,36) `#0c0a18`, `#1a1a1a` frame, a single vertical mullion at x=154;
  - 12 stars `#fef3c7` at `(132+(i*4)%46, 16+(i*7)%32)`, visible 50 of 60 frames with a per-star offset;
  - someone else's grey couch (24,78,110,28) `#3a4040` with `#5a6060` top, arm blocks (18,76,12,18) and (128,76,12,18); spare blanket (36,78,80,12) `#7a5040` with `#a07050` top; pillow (30,78,14,3) `#a8a29e`;
  - the player lying awake: head (33,72,12,9) `look.skin`, hair strip (33,70,12,3) `look.hair`, OPEN eyes (37,76) and (41,76) `#0c0a09`, frown (38,79,4,1) `#3a1010`, body (45,73,32,8) `look.shirt` with a white top line, legs (77,75,22,6) `#1a1a1a`, feet (99,72,5,3) white;
  - wall calendar (80,16,36,28) `#f0e4c8` with red header `#7a1a14` and "THIS WEEK" (bold 4px `#fef3c7`); a 2x4 grid of white 6x6 cells at (84+8c, 25+8r);
  - lamp: shade (4,64,12,4) `#fbbf24`, stem (8,68,4,12) `#1a1a1a`, base (4,80,12,2) `#5a3a18`, soft glow (10,70) r24 `rgba(254,243,199,.10)`.
- **Animation:** calendar cells gain a red `#dc2626` X (two strokes) one per 60 frames (1 s) up to 3; stars twinkle.
- **Look usage:** skin, hair colour, shirt colour (no style, no accessory).
- **Text:** "[3] nights on a stranger's couch." / "You don't sleep much." / "The plant's probably dead by now."
- **Rebuild:** a "lying awake" player pose; tie the X count to `COUCHSURF_DAYS` (hard-coded 3 in the painter).

## Back on your feet scene  (lines 7862-7937; `drawBackOnFeetScene(ctx,fc)`; beat 3 of 3)
- **Moment:** end of the eviction arc - a new key, rent counter reset. Setting: bright sunrise outside the restored building.
- **Layers, back to front:**
  - sky `_drawSky` rows 0-89 `rgb(255,192,96) -> rgb(204,224,224)` (peach to pale blue);
  - cross-shaped pixel sun: block (88,50,24,24) `#fef3c7` plus four nubs: top (92,46,16,4), bottom (92,74,16,4), left (84,54,4,16), right (112,54,4,16);
  - 12 ray pixels `#fef3c7` orbiting (100,62): angle `i/12*2pi + fc*0.01`, radius `22 + ((fc+5i)%40)*0.4`;
  - building without boards (60,30,84,70) `#7a4030`, roof line `#a06040`, horizontal mortar rows only (every 6px from y=34);
  - warm lit windows (76,38,18,14) and (110,38,18,14) `#fbbf24` with black top / bottom lines;
  - restored red door: frame (88,60,28,40) `#3a1a14`, door (90,62,24,38) `#a02a20`, panels (94,66,16,12) and (94,80,16,14) `#7a1a14`, gold knob (109,80,2,2);
  - gold "HOME" welcome mat (80,100,40,4) `#fbbf24` with bold 4px `#3a1a10` text at (100,104); sidewalk (0,104,200,26) `#a89060` with `#cba880` top line;
  - the player from behind: coat (32,110,12,14) `#5a3a40`, head (34,100,8,10) `#d4a87a`, hair (34,98,8,4) `#1a1a2e`, shoes (32,124,4,4) and (38,124,4,4) `#1a1a2e`;
  - keys (44,112,2,2) and (46,113,2,2) `#fbbf24` with a `#fef3c7` glint (47,110,1,4) 8 on / 16 period;
  - 3 birds drawn as 'v' strokes `#1a1a2e` drifting right 0.3 px/frame with a sine bob.
- **Animation:** the player bobs 1px, toggling every 12 frames (stationary "walking up"), rays orbit, birds fly.
- **Look usage:** NONE - the only story scene where the player is not customised (fixed coat, skin, hair colours).
- **Text:** "A new key. A fresh start." / "Rent counter back to zero." / "Don't miss it again."
- **Sound:** none (opportunity: keys jingle).

---

## Foxy sprite `drawFoxy(ctx, x, y, fc)`  (lines 7939-7979)
- **Who:** the roommate. Non-binary (UI: "roommate . they/them"), soft-spoken plant person who "made too much soup". Speech style: short lowercase, caring by instruction ("eat.", "go to bed. seriously.", "matcha?", "i'm at work till seven. don't burn anything."). Colour tag `#84cc16` (lime) for all speech ("FOXY" in the soup scene, "FOXY . TIP" for text-only tutorial cutscenes at L11182). Expression always neutral / sleepy. (Code comments sometimes say "her"; the UI says they/them - use they/them.)
- **Sprite construction** (centre x, feet y; about 16 wide x 31 tall):
  - shadow (x-7,y,14,1) `rgba(0,0,0,.45)`;
  - legs (x-4,y-9,3,9) and (x+1,y-9,3,9) `#1a1a1a`; felt slip-on shoes (x-5,y-1,4,1) and (x+1,y-1,4,1) `#5a3a40`;
  - oversized boxy sweater (x-6,y-22,12,13) `#5a8030`, collar highlight `#7aa040` (top row), shadow side `#3a6020` (left column);
  - sleeves reaching past the wrists (x-8,y-21,2,10) and (x+6,y-21,2,10) with darker cuffs at y-12 `#3a6020`; one visible hand (x+7,y-11,1,2) `#d4a87a`;
  - head (x-4,y-28,8,7) soft skin `#e0b890`;
  - soft layered auburn hair `#7a3a20`: top (x-5,y-30,10,3) and sideburns (x-5,y-27,1,3), (x+4,y-27,1,3);
  - closed-crescent sleepy eyes (x-3,y-25,2,1) and (x+1,y-25,2,1) `#3a2010`; neutral mouth (x-1,y-22,3,1) `#5a2020`;
  - tiny gold earring (x+4,y-24,1,1) `#fbbf24`.
- **Animation:** the earring glints `#fef3c7` for 4 frames every 90. Nothing else moves.
- **Expressions / poses available:** one only (standing, neutral).
- **Related outside range:** `FoxyAvatar` (L6965) is a 24x24 head portrait copied from these pixels on a `#1a3018` tile with a lime glow; `FoxyModal` (L7016) shows it with quips and a "wave hi" (+2 mood per day); quips `FOXY_QUIPS` L700, context tips `FOXY_TIPS` L744; the one-time $15 loan line "this is a one-time thing. go busk in the park. seriously." (L13000).
- **Rebuild notes:** needs a painted full-body and a bust portrait; expression set: neutral/sleepy, gentle smile, concerned, serving soup; 2-3 frame idle (breath, blink, earring glint). Palette anchors: sweater `#5a8030 / #7aa040 / #3a6020`, hair `#7a3a20`, skin `#e0b890`, gold earring.

## Foxy soup scene  (lines 7981-8105; `drawFoxySoupScene(ctx,fc,look)`)
- **Moment:** the first time the player is broke and starving (cash<5, hunger==0, 7+ days since the last safety net). Effects (L12703): hunger raised to at least 40, +5 mood, a quip text message from Foxy. Later safety nets show only the toast "Foxy left soup on the counter (+40 hunger)".
- **Setting:** warm apartment kitchen, daytime.
- **Layers, back to front:**
  - wall `#3a2a30` (0,0,200,95) with 12px dot wallpaper `#5a3a40` and a trim line at y=94; floor (0,95,200,35) `#3a2010`, `#5a3018` top line, vertical plank lines every 40px `#2a1808`;
  - window (6,8,30,24) `#7ec0e8` with black frame and cross mullions; cream sun/cloud (26,12,6,3) `#fef3c7` and white cloud (10,22,8,2);
  - window-sill plant: pot (4,32,12,6) `#3a2410`, leaves (6,24,8,8) `#3a7028`, (4,26,4,4), (14,26,4,4), (8,22,4,4) `#4a8038`;
  - back cabinets (60,30,84,50) `#5a3a28` with `#7a5a40` top; four doors (64+20i,32,18,22) `#3a2418` with handles (72+20i,42,2,1) `#a07050`; counter top (60,54,84,4) `#7a5040`; toaster (116,46,14,8) `#a8a29e` with a dark slot;
  - kitchen island at (70,92): top 60x4 `#7a5040` (lip `#a07050`), front 60x22 `#5a3a28`, legs `#1a1a1a`;
  - soup bowl at (88,86): tan bowl `#a87844` with `#c89a64` rim, green soup `#5a8030` (`#7aa040` top row), carrot bits `#f97316`, spoon `#a8a29e` / `#dadada`;
  - Foxy standing right of the island at (156,126) via `drawFoxy`;
  - the player on the left at x=28 (hand-drawn, shirt / skin / hair colours only): legs `#1a1a2e`, white shoes, torso `look.shirt` with white collar, arms with skin hands, head `look.skin`, hair `look.hair`, tired eyes with dark circles `#3a2010`, slight frown `#3a1010`.
- **Animation:**
  - three steam plumes (1x2 `#dadada`) rise 16px over 40 frames of a 50-frame loop with a sine wobble, fading, staggered by 18 frames;
  - a pink `#fb7185` heart-ish particle drifts from (80,70) up to (80,20) during 60 of every 80 frames while fading (the shape is a 3x2 block with two feet, not a true heart);
  - Foxy's earring glint.
- **Look usage:** shirt, skin, hair colours only.
- **Text** (speaker FOXY `#84cc16`): "i made too much." / "eat."
- **Sound:** none.
- **Rebuild:** the beat is Foxy silently providing. Paint Foxy offering the bowl; keep steam, heart float, tired player pose; swap the crude heart for the real pixel-heart helper `drawPixelHeart` (L16584).

---

## Pig Pen sprite `drawPigPen(ctx, x, y, fc, pose='smug')`  (lines 8107-8173)
- **Who:** stocky local beatboxer, the cocky rival who challenges the player ("yo. you. new face. ... don't bring a friend. you'll need 'em on the way home." - challenge scene `drawPigPenChallengeScene` L9530, outside range, shown after 3 jams or sho>=8). His stage name is a Big Ben pun (clock face on his cap). Permasmirk, trash-talker ("that's the GAME, brother."), warms up after the "Penny reveal" ("you eat dinner?"). Colour tag `#fb7185`. Speech: short lowercase.
- **Sprite construction** (centre x, feet y; about 18 wide x 33 tall - bigger than the player):
  - shadow (x-9,y,18,1) `rgba(0,0,0,.5)`; legs (x-6,y-9,4,9) and (x+2,y-9,4,9) `#1a1a1a`;
  - trainers: white soles (x-7,y-1,5,1) and (x+2,y-1,5,1), red tops `#dc2626` one pixel above;
  - black track jacket (x-7,y-22,14,13) `#1a1a1a` with `#3a3a3a` top row, red side stripes `#dc2626` (x-7,y-18,1,8) and (x+6,y-18,1,8), zipper (x,y-20,1,10) `#5a5a5a`;
  - long arms (x-9,y-21,2,10) and (x+7,y-21,2,10) `#1a1a1a` with skin hands `#d4a87a` (y-12, 2x2);
  - head (x-5,y-30,10,8) `#d4a87a`;
  - red cap: crown (x-6,y-33,12,4) `#dc2626` with `#fb7185` highlight, band shadow `#7a1a14` (y-29), black brim (x+5,y-31,4,1); clock face (x-1,y-32,3,3) `#fbbf24` with two 1px `#1a1a1a` hands (x,y-31) and (x+1,y-30);
  - goatee (x,y-21,2,1) `#1a1a2e`.
- **Poses:**
  - `smug` (default): narrowed eyes (x-3,y-25,2,1) and (x+1,y-25,2,1) `#1a1a2e`; smirk mouth (x-1,y-22,4,1) `#5a2020` plus an upturned corner (x+2,y-23,1,1); pointing finger (x+9,y-18,4,1) skin;
  - `sad`: small down-cast pupils at y-24 (x-3 and x+2), flat mouth `#3a1010`, no pointing finger. Never called: the only call site is `drawPigPen(...,'smug')` at L9575; the slumped-at-the-bar version is a separate duplicate drawer `_drawSeatedAtBar(...,'pigpen')` (L9610) used by the Penny reveal scene.
- **Animation:** none (fully static).
- **Inconsistent depictions elsewhere:** here a red clock cap + black/red jacket; `OPP_LOOKS['Pig Pen']` (L16448, battle stage) a brown shirt, mohawk and shades; the mingle encounter look a black shirt with red hair `#dc2626`. A canonical design is needed.
- **Rebuild notes:** full-body + seated-slumped variants; poses: smug point, shouting (the challenge scene adds red "!" marks and gold heat lines), sad/down-cast, soft/neutral (post-Penny). Keep the clock-cap silhouette as his identity.

---

## BeeAmGee sprite `drawBeeAmGee(ctx, x, y, fc)`  (lines 8175-8222)
- **Who:** the OG mentor. 50-something Danish veteran ("been at this thirty years"), grey beard, black leather jacket, quiet posture; "always shows up exactly when needed"; doesn't perform any more, just watches; flat mouth ("doesn't smile easy").
- **Naming:** internally "Bjarne" (functions `drawBjarne*`, flags `bjarneCypherSighting`, `bjarneIntroduced`, counters `bjarneSessions`, `lastBjarneDay`), but every player-facing label is BEEAMGEE with speaker colour `#a3a3a3`.
- **Backstory** dripped by 10 coaching lines (`BJARNE_LINES` L12541): lost ugly in '92 and cried in the bathroom; reached the world finals three times, never won; "i had a daughter. she'd be your age now." / "she didn't beatbox. she liked the violin."; "don't end up like me, kid. find someone to come home to." Training with him 3 times unlocks the Studio Beanie accessory.
- **Sprite construction** (about 16 wide x 33 tall):
  - shadow (x-7,y,14,1) `rgba(0,0,0,.5)`; legs (x-4,y-9,3,9) and (x+1,y-9,3,9) `#1c1c1c`; boots (x-5,y-1,4,1) and (x+1,y-1,4,1) `#2a2a2a`;
  - black leather jacket (x-6,y-22,12,14) `#1a1a1a`: collar highlight `#3a3a3a`, hem shadow `#0a0a0a` (y-8), lapels (x-4,y-21,2,8) and (x+2,y-21,2,8) `#3a3a3a`;
  - arms (x-8,y-21,2,12) and (x+6,y-21,2,12) `#1a1a1a`; weathered hands (x-8,y-9,2,2) and (x+6,y-9,2,2) `#a87844`;
  - head (x-4,y-30,8,8) ruddy `#c89065`;
  - grey hair `#a8a29e`: top (x-4,y-32,8,2) and sideburns (x-4,y-30,1,6), (x+3,y-30,1,6);
  - beard: chin patch (x-3,y-24,6,2) `#dadada` with `#a8a29e` flecks at (x-4,y-25) and (x+4,y-25);
  - eyes (x-3,y-28) and (x+2,y-28) 1x1 `#1a1a2e`; crow's feet (x-4,y-27) and (x+3,y-27) `#7a5040`; flat mouth (x-1,y-26,3,1) `#5a3010`.
- **Animation:** one gold glint on his watch (x+6,y-11,1,1) `#fbbf24` for 4 frames every 60. Otherwise static. One pose (standing, arms down).
- **Rebuild notes:** needs a still-presence character: slow breath/blink idle, a nod (the studio text says "He nods, twice"), an arms-crossed watching variant. Keep the silhouette: bigger than the player, grey hair + beard, black leather.

## Bjarne cypher scene  (lines 8224-8263; `drawBjarneCypherScene(ctx,fc,look)`)
- **Moment:** the daytime park jam; fires once on the next jam after the player has beaten at least one opponent (the code comment says "first Saturday battle win"). BeeAmGee is an unnamed observer at the back; the player does not yet know him.
- **Layers, back to front:**
  - `_drawDaytimeSky` (50 rows); sun (16,8,10,10) `#fef3c7` with halo (21,13) r14 `rgba(254,243,199,.30)`;
  - grass field (0,50,200,80) `#6a9a3a` with 24 blade ticks (`(i*9)%200`, y=52+(i%3)*4, 1x2) `#5a8a30`;
  - five trees at x=5+38i: canopy (tx-8,38,16,8) `#3a7028`, top (tx-6,34,12,4) `#4a8030`, trunk (tx-1,46,2,6) `#3a2410`;
  - 14 crowd silhouettes: head (cx,60,4,4) `#a87844` (all the same skin), body (cx-1,64,6,8) cycling `#a04040 #5a7050 #a06030 #4060a0 #a06090`, cx = 4+14i+(i%2)*4;
  - dirt cypher ellipse (100,106) rx80 ry18 `#a89060` with a `#7a6a48` outline;
  - the player in the middle: `drawBeatboxer(100,110,look,'right',active)`;
  - BeeAmGee standing at (168,88);
  - eye-line glow: circle (168,70) r18 `rgba(168,162,158,.18)`, 18 on / 30 period.
- **Animation:** crowd heads bob about 0.5px on a sine (visually a 1px flicker because `_px` floors); the player sings (leg bob + mouth); the glow pulses.
- **Note:** BeeAmGee is painted AFTER the crowd, so he is not actually "half-hidden" as the comment intends.
- **Text** (no speaker): "Someone's standing at the back of the cypher." / "Gray beard. Leather jacket. Doesn't perform." / "He nods once when you finish your round. Then he's gone." / "...who was that?"

## Bjarne meeting scene  (lines 8265-8304; `drawBjarneMeetingScene(ctx,fc,look)`)
- **Moment:** after an open mic, once the cypher sighting has happened, BeeAmGee walks up and introduces himself (flag `bjarneIntroduced`, unlocks the paid coaching panel).
- **Layers, back to front:**
  - dim bar wall `#1c1825` (0,0,200,95) with a 14px dot grid `#2a1f1a`; floor (0,95,200,35) `#3a2818` with `#5a4030` top line;
  - stage edge (4,86,80,4) `#5a4030` with `#7a5a40` lip; mic stand on the stage (base (38,84,12,2), pole (43,60,2,24), head (41,56,6,4) `#2a2a2a`);
  - spotlight quad (30,0)-(56,0)-(70,86)-(16,86) `rgba(254,243,199,.10)`;
  - the player just off the stage: `drawBeatboxer(44,86,look,'right',inactive)`;
  - BeeAmGee approaching from the right at (138,110);
  - two gold dashes (90,100,6,1) and (100,102,6,1) blinking 12 on / 24 period (a "walking toward you" hint);
  - eight background crowd silhouettes at x=80+14i: head (cx,76,4,4) `#0c0a09`, body (cx-1,80,6,8) `#1a1a1a`.
- **BUG:** the crowd silhouettes are painted after BeeAmGee, and the one at cx=136 covers x135-141, y76-88 - almost exactly his face. In the rebuild draw the crowd first.
- **Text** (speaker BEEAMGEE `#a3a3a3`): "saw you in the cypher last week." / "you've got something. raw. unfinished. but something." / "name's BeeAmGee. been at this thirty years." / "come find me when you're ready. studio. fifty bucks. i'll show you what i know."

## Bjarne studio scene  (lines 8306-8359; `drawBjarneStudioScene(ctx,fc,look)`)
- **Moment:** every paid coaching session ($50, 90 min, -10 energy, +1 chosen stat, 3-day cooldown, panel L12555). One scene reused for all sessions.
- **Layers, back to front:**
  - warm dark wood wall `#3a2818` (0,0,200,95) with 8px grooves `#2a1a10`; floor (0,95,200,35) `#1a1410` with `#3a2818` top line;
  - acoustic foam grid: 8x8 `#2a1a10` tiles with a 4x4 `#5a3818` centre every 14px (5 rows x 14 columns, y 8-70);
  - mixing desk on the left (0,78,70,16) `#1a1a1a` with `#3a3a3a` lip; 8 faders (rail (6+7i,80,1,12) `#4a4a4a`, gold `#fbbf24` 3x2 knobs at staggered heights);
  - 4 VU columns at x=60..63: background `#1c1917`, level `|sin(fc*0.3+i)|*8`, each lit pixel green `#22c55e`, above 3 yellow `#fbbf24`, above 5 red `#dc2626`;
  - BeeAmGee standing at the desk (30,110), overlapping the desk;
  - mic stand on the right: base (130,108,16,2), pole (137,70,2,38), two head blocks (134,68,8,4) and (134,64,8,4) `#2a2a2a`;
  - the player at the mic: `drawBeatboxer(156,110,look,'left',active)`;
  - gold "sound wave" bars (146,78,2,1), (146,80,4,1), (146,82,2,1), 4 on / 8 period;
  - hanging lamp: cord (100,0,1,12) `#1a1a1a`, shade (96,11,9,4) `#3a2818`, bulb (97,15,7,2) `#fbbf24`, glow (100,18) r32 `rgba(254,243,199,.08)`.
- **Text** (speaker BEEAMGEE `#a3a3a3`, one beat): line 1 = `BJARNE_LINES[sessionNumber]` (sessions 1-10 drip the backstory, afterwards "keep working. show me next week."); then "You run drills until your jaw aches. He nods, twice." / "\"that's enough for today. same time next week.\""
- **Rebuild:** BeeAmGee should visibly nod; the sound waves should travel from the player's mouth to the mic.

---

## Crew battle scene  (lines 8361-8408; `drawCrewBattleScene(ctx,fc,look,crewName)`)
- **Moment:** `doCrewBattle(crew)` at the bar (needs 30 energy and not sick; `resolveCrewBattle` L1152 rolls 3 rounds vs three named opponents). Win: crew cash + fans, +30 xp, mood +12; loss: 20% cash, -3 fans, mood -10. Setting: a dark bar stage with a 3v3 lineup.
- **Layers, back to front:**
  - sky strip `_drawSky` rows 0-49 `rgb(42,24,64) -> rgb(74,32,96)`; bar floor (0,50,200,80) `#1a1018`; stage edge (0,90,200,4) `#3a2818`; under-stage (0,94,200,36) `#0d0608`;
  - five stage lights at x=16+42i: 4x8 `#fbbf24` at the top, each with a glow circle r24, alpha `0.10 + 0.06*sin(fc*0.2+i)`;
  - LEFT crew (player's side): the player at (18,110) via `drawBeatboxer(look,'right',active)`; ally 1 = block figure head (50,88,12,12) `#f4c098` with eye pixels, torso (50,100,12,10) `#84cc16`, legs (50,110,12,10) `#1a1a1a`; ally 2 = head (70,90,12,12) `#d4a87a` with eyes, torso (70,102,12,10) `#a78bfa`, legs (70,112,12,8);
  - RIGHT crew: opponent 1 head (110,88,12,12) `#d4a87a` (no eyes), torso (110,100,12,10) `#dc2626`, legs (110,110,12,10); opponent 2 head (130,86,14,14) `#c89878` (no eyes), torso (130,100,14,12) `#fb7185`, legs (130,112,14,8); opponent 3 = `drawBeatboxer(156,110,{...look, shirt:'#dc2626'},'left',active)` - the PLAYER'S OWN face and hair in a red shirt (placeholder);
  - "VS" marker: a gold bar (96,70,4,8), 18 on / 30 period (no letters);
  - crew-name banner (60,14,80,14) `#0a0a0a` with `crewName` (default "CREW") in 8px monospace `#fbbf24`, centred at (100,24); fits about 16 characters.
- **Look usage:** full look for the two beatboxers; allies / opponents are fixed colour blocks.
- **Text** (speaker "CREW BATTLE - WIN" `#84cc16` or "CREW BATTLE - LOSS" `#dc2626`, one beat): "vs [crew name]." / one line per round "Round N: WON|LOST vs [opponent] . ours-theirs" / "Final: a-b." / win: "You took the building. Your crew is howling. Drinks tonight are free." or loss: "You held your own. Not enough. Next round, next month."
- **Rebuild:** needs three distinct opponent portraits (data in `crew.members`, not in this range), two named allies (the comment in `resolveCrewBattle` mentions Foxy and defeated NPCs as ally boosts), a real VS card and per-round win/loss feedback.

---

## Flashback: Childhood  (lines 8412-8443; `drawFlashbackChildhoodScene(ctx,fc,look)`)
- **Moment:** one-time memory at sleep (needs `storyFlags.firstJam` and day>=5). The player, aged 12, records beats at the bedroom mirror. Speaker none. Setting: sepia-toned childhood bedroom.
- **Layers, back to front:**
  - wall `#3a2a18` (0,0,200,90) with 8px grooves `#2a1a08`; floor (0,90,200,40) `#5a3a18`;
  - two posters of "childhood beatbox heroes": (18,14,24,32) `#dc2626` with inner (20,16,20,26) `#fbbf24`, and (50,18,22,28) `#22d3ee` with inner (52,20,18,22) `#a78bfa`;
  - standing mirror: frame (130,30,30,50) `#5a4838`, glass (132,32,26,46) `#1a2030`, five diagonal glints (134+4i,35+8i,6,2) `rgba(255,255,255,.10)`;
  - bed corner (0,70,30,30) `#5a4040`;
  - the kid at (100,110): bald head (104,88,8,8) `#f4c098` with two eye pixels, shirt (104,96,8,6) = `look.shirt`, pants (104,102,8,8) `#3a2818`, tiny black mic (114,92,5,4); no legs below the pants, no hair, skin NOT from `look`;
  - red "REC" light (134,35,6,4) `#dc2626` on the mirror (the phone propped on books), 18 on / 30 period;
  - vignette: top 12px and bottom 16px `rgba(0,0,0,.20)`.
- **Note:** reads `look.shirt` without optional chaining (throws if `look` is undefined).
- **Text:** "Before bed, a memory you hadn't pulled up in years." / "Twelve years old. Your bedroom mirror. A little phone propped on a stack of books." / "Three minutes of beats nobody would ever see. You said the bass kicks were 'sick'." / "It's still the same circuit. Just with better gear."

## Flashback: Parent voice  (lines 8444-8466; `drawFlashbackParentScene(ctx,fc,look)`)
- **Moment:** needs `rentLate>=1` or day>=12. A 1 AM kitchen and an old voicemail from the player's parents. Speaker none.
- **Layers:**
  - dark kitchen `#1a1818` (0,0,200,90); floor (0,90,200,40) `#2a2418`;
  - five cabinet silhouettes (8+36i,14,30,36) `#251f1c`;
  - phone glow circle (100,100) r40 `rgba(180,200,255, 0.4+0.2*sin(fc*0.1))` (pulsing blue);
  - phone on the counter (95,96,12,6) `#1a1a1a` with screen (96,97,10,4) `#2a3050`;
  - the player: `drawBeatboxer(60,116,look,'right',inactive)` - the comment says "sitting on the floor against a wall" but he STANDS;
  - wall clock (160,16,18,18) `#1a1a1a` with face (162,18,14,14) `#3a3530` and gold hands (169,19,1,6), (169,25,4,1) - the late hour.
- **Text:** "1 AM in the kitchen. The phone glows on the counter." / "An old voicemail you saved and kept saving." / "\"call when you get this. don't worry about waking us. we love you.\"" / "You haven't called this week."

## Flashback: YouTube comment  (lines 8467-8492; `drawFlashbackCommentScene(ctx,fc,look)`)
- **Moment:** needs `followers>=100`. A late-night laptop screen showing a comment the player wrote in 2017. Speaker none.
- **Layers:**
  - near-black room `#0a0d12` (0,0,200,90); floor (0,90,200,40) `#1a1818`;
  - laptop outer (50,30,100,60) `#1a1a1a`, screen (52,32,96,56) `#0d0d0d`; base (44,90,112,6) `#2a2a2a`;
  - white comment card (56,38,88,24) `#fafafa` with a `#e5e5e5` header strip (58,41,84,2); three pseudo-text bars `#0a0a0a` at (60,45,60,1), (60,48,80,1), (60,51,70,1); highlighted red line (60,56,30,2) `#dc2626`;
  - reaction row: red heart block (60,64,8,6) `#dc2626`, grey count bar (70,65,14,4) `#7a7a7a`;
  - blinking text cursor (144,56,1,4) `#0a0a0a`, 16 on / 30 period;
  - the player far left: `drawBeatboxer(16,116,look,'right',inactive)`; no screen glow is actually cast on him.
- **Text:** "Down a YouTube rabbit hole. Your old channel." / "A comment from 2017 you forgot you wrote." / "\"one day i'll do this on a real stage. saving this for when i'm 30.\"" / "Not 30 yet. But not nothing, either."

## Flashback: The song  (lines 8493-8529; `drawFlashbackSongScene(ctx,fc,look)`)
- **Moment:** needs the `firstShowcase` flag or day>=20. The last bus home at night, earbuds in. Speaker none.
- **Layers:**
  - bus interior `#15181f` (0,0,200,90); floor (0,90,200,40) `#0a0d10`;
  - four windows (10+48i,18,38,30) `#0a0d18` with `#3a3a40` frame lines; five gold light streaks per window (6x1 `#fbbf24` moving 2px per frame to the right, wrapping every 30px) = passing city lights;
  - the player: `drawBeatboxer(80,110+bob,look,'right',inactive)`, `bob = floor(sin(fc*0.15))` (-1 or 0);
  - white earbud-cord polyline (94,92)->(96,102)->(94,110) - it floats about 6px right of the player rather than at his ear;
  - three gold music notes (2x2 head + 1x2 stem) drifting up 18px over 36 frames from (110+6i,84).
- **Text:** "Last bus home. Window cold against your forehead." / "Earbuds in. The track that started everything plays again." / "Bus driver glances back. You realize you've been beatboxing under your breath." / "You're not the same person who first heard this."
- **Delivery of all four flashbacks:**
  - during the sleep transition, if the rent event is not an eviction, `Math.random()<0.25` picks the first unseen eligible entry of the `FLASHBACKS` table (order: childhood, parent_voice, yt_comment, the_song; L1103);
  - it records `flashbacksSeen[id]=newDay` and plays the cutscene 320 ms later; no speaker, no music.
- **Rebuild (all four):** keep the "dim, one light source, one object telling the story" composition; give the childhood scene a proper kid pose (hair from `look`), make the seated poses actually seated, and attach the cord to the ear.

---

## Title scene art `drawTitleScene`  (lines 8531-8624; DEAD CODE)
- **Status:** defined but referenced nowhere; the live title screen uses `title.png` (below). Documented for its motifs.
- **Layers:**
  - sky `_drawSky` rows 0-75 `rgb(255,128,64) -> rgb(64,24,96)` (orange at the TOP, purple at the horizon - inverted compared with a real sunset); sun (130,38,30,30) `#fef3c7` with halo (145,53) r26 `rgba(254,243,199,.30)`;
  - back skyline: 22 buildings, 8px wide, heights 10-37, bx=9i-4, `#1a0d2e`, with 1px gold windows that twinkle (`(fc+3i+7w)%90<40`);
  - front row of 7 towers, 24px wide, heights 30-43, `#0c0820` with a `#1a1530` left edge, 2x2 windows (on `#fbbf24`, off `#3a3020`) flickering on a 70-frame cycle;
  - four steam plumes from sidewalk grates at x=30, 75, 120, 165 (6x2 `#a8a29e` plus 4x2 puff, fading as they rise 30px over 50 of every 60 frames);
  - stage floor (0,80,200,50) `#0a0612`; 20 crowd silhouettes at y=108-116 (`#1c1917` body, `#0c0a09` head);
  - centre-stage mic: pole (100,92,2,18) `#2a2a2a`, base (99,90,4,4), head (97,84,8,8) `#2a2a2a`, glowing grille (98,85,6,6) `#fbbf24`;
  - four expanding gold rings from the mic (radius 6-34, 56-frame period, alpha `.45*(1-phase)`);
  - eight rising ember pixels (`#fef3c7` for the first 30 frames of life, then `#fbbf24`) swaying on a sine, fading over 110 frames;
  - vignette top 6px, bottom 8px `rgba(0,0,0,.30)`.
- No player character in the scene.

## TitleScreen component  (lines 8626-8698)
- **What it is:** the main-menu splash on every cold start (`screen==='title'`, L11495).
- **Props:** `char, hasActiveSlot, onPlay, onSlots, onSettings`. `hasActiveSlot = char.created && activeSlot`.
- **Buttons / flow:**
  - primary "> Continue as NAME" (name uppercased, when an active slot exists) or "> New Game" -> `onPlay` = go to `'hood'` when there is an active slot, else `'slots'`;
  - "Beatboxers" (people emoji) -> slots screen;
  - "Settings" (gear) -> opens `SettingsModal` (the screen also hosts `ScreenErrorBoundary` and `GlobalErrorOverlay`).
- **Layout** (mobile column, `min-h-screen`, items centred, justify-between, padding 24/12):
  - background `linear-gradient(180deg,#1a0d2e 0%,#0c0a09 50%,#0c0a09 100%)`; the whole screen fades in with `screenFade 0.45s` (opacity + 8px slide) unless `reducedMotion`;
  - small tag "A LIFE-SIM": 10px, uppercase, 0.5em tracking, amber-500/70;
  - title "BEATBOX / STORY" on two lines, 56px (72px at the `sm` breakpoint), Bebas Neue / Oswald, `#fbbf24` (amber-400), tight tracking, text-shadow `4px 4px 0 #0c0a09, 8px 8px 24px rgba(212,160,23,.30)`;
  - tagline "the cypher is calling": 11px, uppercase, 0.4em tracking, stone-400;
  - key art frame: `title.png`, 2px stone-800 border, gold glow `0 0 32px rgba(212,160,23,.18)`, `image-rendering:pixelated`, aspect 1376/768, max width 448px;
  - primary button: full width, 2px amber-500 border, gradient `amber-950/40 -> amber-900/30`, text amber-400, 16px, uppercase, 0.3em tracking, Bebas Neue, brighter on hover, `scale(.98)` on press;
  - secondary buttons: 2-column grid, 2px stone-700 border, 11px stone-300 text, uppercase, 0.3em tracking, border `amber-500/50` on hover;
  - footer "v . built with (heart)": 9px, stone-600 (the version string is empty).
- **`title.png` content** (viewed): 1376x768, 1.05 MB painted pixel art:
  - dusk city street, purple-to-orange sky with a pixel sun low on the left;
  - dark brownstones with orange lit windows and fire-escape balconies, a radio-tower silhouette, a red neon "LIVE" sign on the right;
  - steam venting from two manholes, a wooden stage at the bottom with four footlights, dithered rounded-corner border;
  - centre: a boy MC in a backwards red-brown snapback, maroon hoodie, olive cargo pants and red sneakers, holding a mic, outlined in cyan, with concentric cyan / yellow / green sound-wave arcs around him;
  - a small four-point sparkle mark in the bottom-right corner (it looks like an image-generator watermark - check provenance and crop).
- **Audio:**
  - `startMusic('title')` on mount, `stopMusic()` (0.5 s fade) on unmount; the audio context only unlocks after the first tap and the track respects the mute setting;
  - title track `_TITLE` (L17740): 160 BPM, 16th-note grid, 64 steps (4 bars), C - G - Am - F; four-on-the-floor sine kick, noise snare on beats 2 and 4, 8th-note hats (open on off-beats), bouncy square-wave bass (root / octave), a fast 16th-note triad arpeggio, a detuned square + triangle lead melody; master volume 0.32, 0.8 s fade-in; "Sonic / TMNT energy".
- **Rebuild:** use the key art as the Phaser title background (16:9, not the 20:13 of scenes); rebuild the buttons in Phaser UI; optionally animate the painted layers (steam, sound rings, flickering windows, LIVE neon) with motifs from the dead painter; port the chiptune (or render it to audio).

---

## Dream scene  (lines 8700-8790; `drawDreamScene(ctx,fc,look)`)
- **Moment:** a rare surreal beat at sleep (day>=30, 5% chance per sleep, never after an eviction). Speaker none. Setting: an endless stage floating in a violet void.
- **Layers, back to front:**
  - sky `_drawSky` rows 0-85 `rgb(18,8,48) -> rgb(106,32,138)`;
  - 20 stars (cream `#fef3c7` then pink `#fbcfe8`, drifting right 0.25 px/frame, twinkle 50 on / 80);
  - glowing horizon band, rows 80-89, blending `rgb(106,32,138)` toward `rgb(170,56,74)`;
  - receding checkerboard stage floor (0,90,200,40) `#0a0820` with 5 rows of `#1a0d3a` tiles whose width grows (6, 9, 12, 15, 18 px), scrolling sideways at different speeds;
  - 8 floating blocks (sizes 5, 8, 11) in `#fbbf24 #22d3ee #fb7185 #a78bfa #84cc16 #f97316 #fde68a`, each with a white highlight and a 25%-alpha echo trail, drifting right 0.5 px/frame with a sine bob;
  - 18 black crowd silhouettes (head (cx,100-108,6,6) `#0a0510`) whose arms go up when `sin>0.4` and half-up when `>0`;
  - stage platform (60,86,80,4) `#1a1a1a` with `#3a3a3a` lip;
  - mic: pole (99,60,2,26) `#1a1a1a`, head (96,56,8,6) `#2a2a2a`, grille (97,57,6,4) `#fbbf24`;
  - spotlight triangle (100,0)-(60,90)-(140,90) `rgba(254,243,199,.10)`;
  - four expanding gold echo rings around the mic (centre (100,60), radius 6-36, 72-frame period, alpha `.5*(1-phase)`);
  - the player FLOATING above the mic: `drawBeatboxer(92, 46+3*sin(fc*0.12), look,'right',active)` (singing animation; x is 8px left of the mic);
  - vignette top 8px, bottom 10px `rgba(0,0,0,.30)`.
- **Text:** "You're on a stage that goes forever in every direction." / "Faces in the crowd you don't recognize. They know your name." / "The mic in your hand is too heavy. Then weightless." / "You wake before the round ends."
- **Rebuild:** the most "painterly" candidate; keep the arms-in-the-crowd wave, drifting blocks with trails and the levitating performer.

## Apartment tier 2 move-in  (lines 8792-8832; `drawApt2Scene(ctx,fc,look)`)
- **Moment:** the player pays $1500 (needs day>=14 and 30 fans) to move to a "real apartment"; +15 mood immediately, +5 mood each morning afterwards, rent 100/week. One-time cutscene `apt2MovedIn` (50 ms after the toast "Moved in . -$1500").
- **Layers, back to front:**
  - warm wall `#3a2a1a` (0,0,200,90) with grooves every 16px `#2a1a10`; hardwood floor (0,90,200,40) `#4a3018` with 14px plank lines `#3a2010`;
  - window (130,16,50,36) `#1a2030` with `#5a4830` frame: top 2px, left, right, bottom, a vertical mullion at x=154 and a horizontal one at y=32;
  - 8 twinkling gold city-light pixels in the window, sliding slowly right (`(i*6 + fc/10) % 44`), `(fc+3i)%30<18`;
  - couch (16,70,60,22) `#7a3a3a` with lighter top `#9a4a4a`, dark base (16,92,60,4) `#3a1a1a`, two back cushions (22,64,16,8) and (54,64,16,8) `#9a4a4a`;
  - framed art (30,14,30,22): black frame, yellow `#fbbf24` field (32,16,26,18), red `#dc2626` shape (36,20,18,10);
  - plant: pot (88,70,12,22) `#3a2010`, leaves (86,60,16,12) `#3a7028` and (88,56,12,8) `#4a8030`;
  - the player standing centre: `drawBeatboxer(110,110,look,'right',active)` "looking around";
  - two moving boxes (80,100,14,12) `#7a5a30` with `#5a3a20` top.
- **Text** (no speaker): "You sign the lease. Hand over the deposit. The keys feel light." / "It's small. But it's yours. With a real bedroom and a window." / "You sit on the floor for a minute, just listening. The traffic. Somebody laughing in the hall." / "This is what it sounds like to be doing okay."

## Apartment tier 3 move-in  (lines 8834-8872; `drawApt3Scene(ctx,fc,look)`)
- **Moment:** the player pays $5000 (day>=30, 200 fans) for a loft with a home studio (+10 mood each morning, +1 mus per full sleep, +25% home recording reward, rent 200). One-time cutscene `apt3MovedIn`.
- **Layers, back to front:**
  - dark loft wall `#1a1a20` (0,0,200,92) with staggered 5x5 brick-texture blocks `#2a2025`; polished concrete floor (0,92,200,38) `#2a2018`;
  - huge window (10,8,110,60) `#0a1020` with `#5a4830` frame (top, bottom, left, right);
  - 12-building skyline silhouette `#1a1525` (bx=12+9i, heights 12-33) with 2 twinkling gold windows per building (`(fc+5i)%50<30`, `(fc+7i)%50<30`); moon (100,16,8,8) `#fef3c7`;
  - signature mixing desk (130,70,60,20) `#0a0a0a` with `#3a3a3a` top; 8 faders (134+7i,74,1,14) `#4a4a4a` with gold knobs;
  - twin monitors (132,56,12,14) and (176,56,12,14) `#1a1a1a` with lit gold `#fbbf24` screens (8x4);
  - the player standing at (70,110): `drawBeatboxer(look,'right',active)` "taking it in".
- **Text** (no speaker, 5 lines): "The freight elevator groans up to the top floor." / "Concrete. Brick. Skyline through twelve feet of glass." / "You set the mixing desk up by the window. Plug in the monitors. Press play." / "It rings. The whole loft rings. Your loft." / "You earned this."
- **Rebuild (both apartments):** match the new-room look to the home-screen house art (`house-day.png`, `house-night.png` live next to the game).

---

## Plant drown scene  (lines 8874-8988; `drawPlantDrownScene(ctx,fc,look)`)
- **Moment:** the 4th watering in one in-game day (max 3 per day, $5 each; `waterPlant` L12930) drowns the houseplant (`plantDead`; replacement only from the next Tuesday). Speaker "the houseplant" in `#a08030`. Tone: comic-melancholic; a blue-shifted night version of the soup kitchen.
- **Layers, back to front:**
  - wall `#2a1f30` (0,0,200,95) with 12px dot paper `#3a2540` and trim at y=94; floor `#251510` with plank lines `#1a0808`;
  - moonlit window (6,8,30,24) `#0a1530` with black frame and cross mullions, moon (26,12,4,4) `#fef3c7`, two white star pixels;
  - counter top (60,64,110,4) `#7a5040` with `#a07050` lip; front (60,68,110,22) `#3a2418`;
  - sickly pendant lamp: cord (108,0,4,14), shade (102,14,16,4) `#3a3a3a`, bulb (104,18,12,4) `#fbbf24`, faint glow (110,50) r36 `rgba(254,243,199,.10)`;
  - THE POT at (100,44): body (100,58,22,6) `#5a3018`, rim (99,56,24,2) `#6a3820`, highlight `#8a5030`, soaked soil (101,55,20,2) `#1a0a05` overflowing;
  - slumped plant: stalk (109,42,2,14) `#4a5028`, bent tip (111,45,2,4); leaves (104,46,6,2) `#a08030`, (103,48,4,2) `#7a5028`, (113,45,6,2) `#8a6028`, (116,47,5,2) `#6a4828`;
  - tipped green watering can (152,56,18,8) `#5a8038` with spout (168,52,6,4) and handle (148,57,4,5) `#3a5028`;
  - the player on the left (x=30, hand-drawn): legs `#1a1a2e`, white shoes, torso `look.shirt` with white collar, right arm hanging, LEFT ARM RAISED with the hand on his forehead, head `look.skin`, hair `look.hair`, sad eyes (2x1) and frown;
  - vignette top 8px / bottom 10px `rgba(0,0,0,.25)`.
- **Animation:**
  - one leaf falls 30px (90-frame loop, sine sway, 90% alpha);
  - 8 water streaks (1x3 `#7ec0e8`) run down the pot's sides (50-frame loop);
  - a puddle (`#3a6080` with `#7ec0e8` top row) widens from 6 to 28 px over about 3 s;
  - 4 drips fall off the counter edge to the floor (60-frame loop);
  - the can drips from its spout every 36 frames;
  - a cyan sweat drop above the player's head, 40 on / 60 period.
- **Text:** "blub. blub. ...blub." / "(it tipped over slow, like it knew.)" / "Nursery only restocks plants on Tuesdays."
- **Rebuild:** a good place for a squash-and-tip animation and rippling puddle; build one plant sprite with three states (healthy, drooping, dead) shared with the home screen and the arrived scene.

## Plant arrived scene  (lines 8990-9122; `drawPlantArrivedScene(ctx,fc,look)`)
- **Moment:** the bright counterpart; fires when the player buys a replacement houseplant (allowed from the first Tuesday after it died; caller L14515). Speaker none.
- **Layers, back to front:**
  - warm wall `#5a4a48` (0,0,200,95) with dot paper `#7a6a68` and a trim line; floor `#5a3018` with `#8a5028` top line and plank lines `#3a1808`;
  - big window (110,8,60,44) `#bfe0f0` with black frame and cross mullions; sun (152,14,12,12) `#fef3c7` with halo (158,20) r18; six distant rooftops (112+10i, height 6-13) `#3a4050`;
  - counter (0,64,90,4) `#a07050` with `#c08070` lip; front (0,68,90,22) `#5a3a28`;
  - diagonal sunbeam quad (132,8)-(160,8)-(80,95)-(50,95) `rgba(254,243,199,.16)` with 8 drifting dust motes (1x1 `#fef3c7`, 120-frame loop);
  - paper shopping bag (12,50,24,14) `#c0a070` with handle blocks (16,54,4,8) and (28,54,4,8) `#a08050` and a white receipt (38,52,6,12) with three tiny black text lines;
  - THE NEW PLANT at (56,40): terracotta pot (56,54,22,8) `#a04020` with rim `#c05030`, highlight `#d06040`, shadow line `#7a3018`; soil (57,51,20,2) `#3a1f10`; stalk `#3a7028` and layered leaves `#3a7028 / #5a9038 / #4a8030 / #6aa040`;
  - lime new shoot `#84cc16` / `#a3e635` wiggling on a sine at the top;
  - white "TUE" price sticker (69,57,8,4) with bold 3px `#0a0a0a` text;
  - the player on the right (x=150, hand-drawn): standing figure with smiling face (eye pixels, upturned mouth) in `look` colours, facing the plant;
  - vignette top 6px / bottom 8px `rgba(0,0,0,.18)`.
- **Animation:** four sparkle crosses (`#fef3c7`) bob and fade over 60 of every 96 frames; a pink heart-ish particle `#fb7185` arcs from the player (140,96) to the plant (about 70,96) over 70 of every 90 frames, fading; dust motes drift.
- **Text:** "Tuesday. The nursery had one left." / "You set it on the counter, careful this time." / "(every three days, a small drink. that's it.)" - flavour that disagrees with the real rule (max 3 waterings per day, 5-day timer in code comments).
- **Rebuild:** reuse the plant sprite; sunbeam + dust motes + sparkles carry the mood.

---

## Rebuild plan - cross-cutting (Phaser + TypeScript)
- **Render model.**
  - Treat each painter as a `SceneArt { id, size: 200x130 logical, layers }`.
  - Phase A (parity in days): create a `Phaser.Textures.CanvasTexture` (200x130 or 600x390), port `_px`, `_drawSky`, `_drawDaytimeSky` to TS, call the ported painter every update with `fc = Math.floor(timeMs/16.667)`, display with `NEAREST` filtering and an integer scale.
  - Phase B (art): replace scene by scene with a painted plate (suggest 4x = 800x520, same 20:13 aspect) plus small sprite sheets for the animated parts, keeping composition and the timing table below.
- **Characters (artist deliverables).**
  - `player` paper-doll sheet: idle, singing (mouth open/closed + leg bob), walking away, from behind with keys, lying awake, tired, regretful hand-on-forehead, smiling, floating, kid variant. Layers: body, shirt (tintable), skin (tintable), hair by style (short, mohawk, long, spike, fade; tintable), accessory (shades, glasses, snapback, beanie, fedora, headphones).
  - Every scene in this range should call ONE factory instead of the 6 hand-rolled copies.
  - `foxy` (full body + bust; neutral/sleepy, smile, concerned, serving), `pigpen` (smug-point, shouting, sad/slumped, soft), `beeamgee` (idle, nod, arms-crossed). Each currently has exactly one static pose.
  - Background characters: crowd silhouettes (bobbing, arms-up wave), kid, 2 crew allies, 3 crew opponents, bar strangers.
- **Shared FX atlas (build once).** Glow disc, light cone, vignette, twinkle star / window, steam plume, water streak / drip, sparkle cross, real pixel heart, expanding sound ring, ember, dust mote, music note, coin, paper notices (LATE, FINAL WARNING, EVICTED).
- **Timing table to preserve** (frames at 60 Hz):
  - coin drop 30 + 20; red mail flag 18 on / 30; lightning 4 / 70; warning border flash 10 / 20; couch X marks 1 per 60 (max 3); star twinkle 50 / 60;
  - Foxy earring glint 4 / 90; BeeAmGee watch glint 4 / 60; soup steam 40 of 50; soup heart 60 of 80; studio waves 4 / 8; VU `|sin(0.3 fc)|`;
  - sound rings 56 (title) and 72 (dream); player bobs 1px per 12 (back-on-feet), `sin(0.15 fc)` (bus), `3 sin(0.12 fc)` (dream); REC light 18 / 30; cursor 16 / 30.
- **Audio plan.** The scenes here have none; only the Title screen has music. Adding SFX (coin, thunder, keys, door, water drip, page flip) would be new work, not parity.
- **Text.** All dialogue quoted in this file is literal game text; keep casing and punctuation (lowercase for Foxy, Pig Pen, BeeAmGee; sentence-case narration).

## Parity checklist (artist + engineer)
- [ ] MingleEncounter: random beat fixed per mount; random stranger look unless defined; 2-3 reply buttons; "you said" + response + readout (mood / energy / hunger / cash / fans only); finish applies effects, +30 min, -6 energy, counters, date / couple / "getting real" toasts; free "leave" before replying.
- [ ] Rent paid: coin into mailbox, green check on door, green flag (first rent only).
- [ ] Rent missed: yellow LATE notice, overflowing mailbox, pulsing flag, rain cloud and tear.
- [ ] Eviction warning: red FINAL WARNING notice flashing, storm cloud, lightning, stuffed mailbox.
- [ ] Evicted: boarded door, EVICTED notice, two boxes with a plant on the stoop, shadow figure leaving left.
- [ ] Couch surf: sleepless player with open eyes, calendar with X marks per day, night window stars, lamp.
- [ ] Back on feet: sunrise, restored lit building, HOME mat, player from behind with jingling keys, birds.
- [ ] Foxy sprite (green sweater, auburn hair, earring glint) and soup scene (steam, heart, tired player).
- [ ] Pig Pen sprite (red Big-Ben cap, track jacket, smirk, pointing; sad pose).
- [ ] BeeAmGee sprite (grey beard, leather jacket, watch glint) and cypher / meeting / studio scenes (fix the overdrawn face).
- [ ] Crew battle: 3v3 lineup, pulsing stage lights, crew-name banner, real VS marker (replace faceless blocks).
- [ ] Four flashbacks: childhood mirror + REC light, parent voicemail glow, YouTube comment laptop, bus earbuds.
- [ ] Title screen: key art, title text, play / slots / settings buttons, title chiptune.
- [ ] Dream: violet void stage, floating performer, scrolling checker floor, crowd arms wave, floating blocks.
- [ ] Apartment 2 (couch, art, plant, boxes, window) and apartment 3 (loft, skyline, mixing desk, monitors).
- [ ] Plant drown (pot overflow, falling leaf, puddle, can, regretful player) and arrived (sunbeam, new plant, bag, sparkles, TUE sticker, heart).

---

## OPEN QUESTIONS / GOTCHAS
1. `drawTitleScene` is dead code; the live title uses `title.png`. Decide between keeping the painted PNG (preferred) and reviving the procedural scene. The PNG's bottom-right sparkle mark looks like an image-generator watermark - confirm provenance / licensing and crop.
2. Frame-counter timing is per-rAF (`fc++`), so animations run 2x on 120 Hz screens; the Phaser port must use a fixed 60 Hz logical tick.
3. Canvas scale is CSS-fluid (width 100% of a <=448px column over a 200px canvas, about 2.2x, non-integer), so on-screen pixels vary in size; pick an integer scale or author higher-resolution art.
4. Player rendering is split: 10 scenes use `drawBeatboxer` (full look incl. hair style + accessory), 6 hand-draw a cheaper copy (soup, couch surf, plant drown, plant arrived, back-on-feet with fixed colours, childhood kid). Hair style / accessory disappear in those today. Unify.
5. Draw-order / placement bugs: meeting scene crowd silhouette (cx=136) paints over BeeAmGee's face; cypher scene claims "half-hidden" but is not; parent flashback is meant to be seated but is drawn standing; song flashback earbud cord floats 6px off the head; dream player is 8px left of the mic.
6. Crew battle: opponent 3 reuses the player's face (red shirt), opponents 1-2 have no eyes, "VS" is just a bar, crew roster and names live elsewhere (`crew.members`, not in this range). The identity of the two allies is unspecified (the `resolveCrewBattle` comment hints Foxy plus defeated NPCs).
7. Pig Pen has three conflicting looks (clock-cap jacket here, mohawk + shades in the battle stage, black shirt + red hair in mingle) and an unused `sad` pose duplicated by `_drawSeatedAtBar`. Pick one canonical design. He is also central to the "Penny reveal" (`drawPennyRevealScene` L9661, outside range) - check what that reveal means for his portrayal.
8. Naming: "Bjarne" in code, flags and save keys (`bjarneIntroduced`, `bjarneCypherSighting`, `bjarneSessions`, `lastBjarneDay`) vs "BeeAmGee" in all UI text. Preserve save-key compatibility if saves are migrated.
9. Foxy pronouns: they/them in UI, "her/she" in some code comments. Foxy's friend (the couch owner) never appears on screen.
10. Rent scenes always show the same walk-up "14" regardless of apartment tier, and "LATE -50$" is hard-coded although rent is 50 / 100 / 200 by tier. The couch scene hard-codes 3 X marks instead of reading `COUCHSURF_DAYS`.
11. The plant-arrived line "(every three days, a small drink. that's it.)" does not match the mechanic (max 3 waterings per day, 5-day timer in comments). Confirm the intended copy.
12. Mingle modal: affinity and flag effects are invisible to the player; the footer shows a cost although "leave" is free; there is no keyboard selection; replies cannot be changed after clicking. Mingle is gated by `CONTENT_UNLOCKS.mingle` (day 5) and bar night hours; weights decide which encounter appears (generic dominates until story flags unlock the named NPCs).
13. The "hearts" in the soup and arrived scenes are 3x2 blocks with two feet, not hearts; a proper `drawPixelHeart` helper exists at L16584.
14. The evicted scene's "walking away" figure is a static silhouette; Foxy, Pig Pen and BeeAmGee have no idle animation beyond a 1-pixel glint, so any extra life is new work, not parity.
15. `drawFlashbackChildhoodScene` reads `look.shirt` without optional chaining (throws on undefined `look`); other scenes use `look?.shirt || fallback`. Keep fallbacks in the port.
16. Sound: no scene in this range specifies music or SFX; `Cutscene` supports a `music` prop (used elsewhere for the intro). `_MUSIC_TRACKS` (L17825) contains only `title` and `intro`.
17. Callers outside the range that were read only for triggers: sleep transition `_finishSleepImpl` (about L13100-13414), jam handler (about L14830-14900), BarScreen (L15585+), shop buy handler (about L14490-14528), coaching panel (L12541-12592), Foxy safety-net effect (about L12695-12731).
