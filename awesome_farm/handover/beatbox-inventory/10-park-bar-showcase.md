# Beatbox Story — Inventory 10: Park, Rohzel, Showcase, Open Mic, Nap/Sleep, Bar
Source: `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx`, lines 14690-16445 (read completely).
External helpers I had to read to get exact numbers are cited as `[ext Lnnn]`; they belong to other inventory files.

## SUMMARY
1. Range = `ParkScreen` (3 AFK/mini-game daytime activities + romance-date meet-up), Rohzel dialogue data + Friday showcase slot scheduling, 4 full-screen/modal performance components, and `BarScreen` (everything that happens 18:00-02:00).
2. Park is open 06:00-18:00 only (`minutes < 720`), every day; activities run on the shared `useActivity` loop: one tick = 10 game-min / 500 ms real (AFK) and a reward every 5 ticks. Busk = cash+fans, Jam = +1 random stat (mus/tec/ori) + 1-3 fans, Run = +1 Showmanship (+maxEnergy in sprint mode).
3. Bar is open 18:00-02:00 and its content is driven by weekday: Mon closed, Tue/Wed/Thu open mic, Fri paid showcase (booked via Rohzel), Sat battle night (+3v3 crew battles), Sun karaoke. Day 1 = Tuesday (`dayOfWeek = day % 7`, 0=Mon). Bar unlocks day 3 (hood gate), Mingle day 5.
4. Always-available bar panels (not weekday gated): Rohzel (Friday-gig booking + 6 greeting lines), Bar Menu (5 items, immediate boost + stacked next-sleep "hangover" debuff in `char.pendingDebuff`), Mingle (day >= 5), Weekend Tour (>= 50 fans), BBBWC2027 festival arc panels (state machine on `char.festivalState`).
5. Open mic is NOT skill-scored: the sequencer replay is cosmetic; fans = clamp(floor(max(0,totalSkills-20)/25) + floor(sho/8) + rand0..2, 1, 20), +8 xp, -10 energy, +60 game-min (label says 30).
6. Showcase (Fri 20:00-00:30 slot, needs 50 fans + 5 open mics, 7-day cooldown) is a 20 s free-play pad grid; reward = round((30+3*sho+mus+tec) * max(.5,min(2,taps/30)) * max(.7,min(1.5,distinct/4))), fans = max(2, floor(sho/2+distinct)), +60 xp, -25 energy, +18 mood.
7. Nap (real-time, 12 energy per game-hour, 1.5 s real = 1 game-hour, forced wake 02:00) and Sleep (4 s dusk->night->dawn cutscene + rooster) are pure presentation shells; the numbers live in `finishNap`/`finishSleep` [ext L13058-13289].
8. Many latent bugs/oddities (hooks after early return in BarScreen, tour = energy refill and skips sleep/rent, weekly counters never bumped by open mic/mingle, `firstShowcase` flag never set, `heat` write-only, XP without `checkLevelUp` in open mic/karaoke/festival, duplicate cutscenes overwrite each other) — see GOTCHAS.
9. All scenes are 200x130 logical pixel canvases drawn with `_px` rects at scale 3 (PixelScene) or 140x90 at scale 4 (park animations); no sprites/images are used by anything in this range.
10. Rebuild: put all rules in a pure `park.ts` / `bar.ts` / `showcase.ts` (rng injected); Phaser scenes = ParkScene (picker + 3 activity sub-scenes), BarScene (weekday-driven panel list), OpenMicScene, ShowcaseScene, NapScene, SleepScene.

---------------------------------------------------------------------------------------------------

# RANGE MAP (line -> unit)
| lines | unit |
|---|---|
| 14690-14699 | `ParkScreen` signature + state/refs |
| 14701-14760 | date arrival / stand-up / `goOnDate` |
| 14762-14779 | RhythmTap accuracy handler, RunTracker block + max-energy handlers |
| 14782-14818 | `activities.busk` |
| 14819-14902 | `activities.jam` (+ 4 story cutscenes) |
| 14903-14938 | `activities.run` |
| 14941-14974 | `useActivity` wiring, pending start, mode reset |
| 14976-14986 | night lock |
| 14988-15128 | Park render (date panel, activity list, in-progress panel) |
| 15131-15164 | ROHZEL dialogue sets |
| 15166-15190 | `SHOWCASE_SLOTS`, `daysToNextFriday`, `pickShowcaseSlot` |
| 15196-15275 | `OpenMicPerformance` |
| 15277-15366 | `PowerNapAnimation` |
| 15368-15440 | `drawNapScene` |
| 15442-15480 | `SleepAnimation` |
| 15482-15581 | `ShowcasePerformance` |
| 15585-15660 | `BarScreen` state, `runFestival`, `startMingle`, day lock |
| 15653-15683 | schedule lookup, `orderItem` |
| 15685-15767 | `doOpenMic`, `finishOpenMic` |
| 15768-15812 | `doCrewBattle` |
| 15813-15859 | `doKaraoke`, `doKaraokeChallenge` |
| 15861-15896 | Rohzel booking constants + `askRohzel`, `chatRohzel` |
| 15898-15953 | gig window, missed-gig effect, `startShowcaseGig`, `finishShowcaseGig` |
| 15955-15971 | battle cooldown, performance takeovers |
| 15973-16078 | header + festival panels |
| 16080-16149 | tour panel |
| 16151-16188 | closed / mingle panels + modal mount |
| 16190-16343 | open mic / showcase / battle / crew / karaoke panels |
| 16345-16416 | Rohzel panel + Bar Menu |
| 16422-16439 | `FloatingSound` (battle UI) |
| 16441-16445 | comment header of the battle stage section (code starts 16447, other inventory) |

---------------------------------------------------------------------------------------------------

# 0. Shared concepts used by everything in this range (reference, from outside the range)

## Time system  [ext L1030-1062]
- `char.minutes` = game minutes since 06:00. 0 = 06:00, 720 = 18:00 (night begins, `isNightTime`), 1080 = 00:00, 1200 = 02:00 (`DAY_END`, forced collapse).
- `clockString(m)` = `((m+360) % 1440)` -> `HH:MM`.
- `isDayTime(m) = m < 720`; `isNightTime(m) = m >= 720`.
- `dayOfWeek(day) = (day||1) % 7`, 0=Mon 1=Tue 2=Wed 3=Thu 4=Fri 5=Sat 6=Sun. **Day 1 = Tuesday.** So Fridays are days 4, 11, 18, ...; Saturdays 5, 12, ...; Sundays 6, 13, ...; Mondays 7, 14, ... (Sunday->Monday rollover day %7==0 resets weekly challenges; rent on `newDay % 7 == 6`).
- `TICK_MINUTES = 10`, `TICK_REAL_MS = 500` -> 1 real second = 20 game minutes in AFK activity loops (comment at L14781 and L1031 are stale: "10 real seconds"/"1 real sec = 10 min").
- `passMinutes(c, n)` [ext L731] = `{ minutes: c.minutes + n, mood: decayMood(c, n) }`. Mood decay per game-hour = 0.3 + 0.5 (hunger<30) + 0.5 (energy<30) + 1.0 (hunger==0) + 1.0 (energy==0). Everything on the Bar screen that "takes time" uses this, then adds its own mood bonus on top of the decayed value (`t.mood + bonus`).

## Content gating [ext L1199-1209]
`CONTENT_UNLOCKS`: bar day 3 ("You're not ready for the cypher yet. Take a few days."), shop day 4, **mingle day 5** ("You barely know the regulars yet. Day 5."). Hood (map) locks the Bar hotspot when `day < 3` OR `minutes < 720` ("Opens at 6 PM"), and the Park hotspot when `minutes >= 720` ("Empty at night · come back at sunrise (6 AM)") [ext L11901-11910]. Both screens also re-check time themselves.

## Level up [ext L11385]
`checkLevelUp(c)`: need = `c.level*100`; if `c.xp >= need` -> level+1, xp -= need (only ONE level per call, remainder carries). The same checkpoint also runs sound unlocks (e.g. `fast_hats` at `openMicCount >= 5`, `inward_k` at `jamCount >= 3`) and achievements. Screens in this range that add XP **without** calling it are flagged below.

## Daily/weekly counters [ext L535-559, L512-559]
`bumpDaily(c, counter)` increments both `c.daily[counter]` and `c.weekly[counter]`. Park uses it (`busks`,`jams`,`runs`). Bar open mic / mingle / showcase write `c.daily[...]` directly (weekly NOT bumped — bug for weekly `openMics` & `mingles`). Daily challenges referencing this range: `busks_2`, `jams_3`, `runs_1`, `openmic_1` (`openMics`), `mingle_2` (`mingles`), `showcase` (`showcases`); weekly: `wk_openmic_5`, `wk_jams_15`, `wk_busks_10`, `wk_mingles_8`, `wk_runs_4`.

## Standard char fields touched (defaults from `initialChar` [ext L152-219])
`energy 100 / maxEnergy 100 (soft cap 150) / hunger 70 / mood 70 / cash 30 / followers 0 / xp 0 / level 1 / stats {mus,tec,ori,sho}=5 / sounds [classic_kick,hi_hat,psh_snare] / equipped (same) / defeated [] / day 1 / minutes 0`; plus `pendingDebuff null, showcaseBooking null, lastShowcaseDay null, lastBattleDay null, openMicCount 0, mingleCount 0, romanceAffinity {}, romanceState {}, dateBooking null, metEncounters {}, daily {}, weekly {}, lastTourDay 0, festivalState null, festivalAcceptedDay 0, festivalPath null, festivalResult null, sickDay 0, gear {}, oriSlots null, oriBpm 100, storyFlags {}`. `heat` is not in `initialChar` (created on first `+`).

## Gear used in this range [ext L2087-2094, L70]
`hasGear(c,id) = !!c.gear?.[id]`. `wardrobe_refresh` ("+1 sho gain on every battle / open mic / showcase", $200): open mic +1 sho, showcase +1 sho. `premium_shoes` ("+1 extra sho per run reward block", $150): run reward +1 sho.

## `playCutscene(props, flagPath)` [ext L11157]
Sets one global cutscene; on completion sets `storyFlags[flagPath] = true`. While a cutscene is up `_gamePaused` freezes the activity loop [ext L11155, L2136]. Calling it twice in a row replaces the first cutscene (its flag is never set) — see GOTCHAS.

---------------------------------------------------------------------------------------------------

# 1. PARK

## ParkScreen — overview and wiring  (lines 14690-14699, 14941-14986, 15127-15129)
- Component `ParkScreen({ char, setChar, passTime, showToast, go, checkLevelUp, playCutscene })` (`passTime` is never used). Mounted by App when `screen === 'park'` [ext L11698]. Reached from the Hood map "Park" hotspot (desc "Jam, busk, run"); hotspot locked at night.
- Local state: `selected` ('busk'|'jam'|'run'|null), `pendingStart` (bool), `playMode` (false = AFK pixel art, true = skill mini-game). Refs: `charRef` (mirrors latest `char` via effect — stale by up to one render inside `onReward`), `accuracyRef` (RhythmTap), `runBlockRef` ({avg,isGood,burnRatio}).
- Hook order: all hooks (incl. `useActivity`) run BEFORE the night-lock early return, so no hook-order problem here.
- `cfg = activities[selected || 'busk']`; `useActivity({char,setChar,checkLevelUp,showToast, config})` with config:
  - `blocksPerReward: 5`
  - `tickEnergyCost = playMode ? cfg.tickEnergyCost*0.4 : cfg.tickEnergyCost`
  - `tickHungerCost = playMode ? cfg.tickHungerCost*0.5 : cfg.tickHungerCost`
  - `tickMoodDelta = cfg.tickMoodDelta` (NOT scaled in play mode)
  - `tickRealMs = playMode ? 2500 : undefined (=500)`, `tickMinutes = playMode ? 3 : undefined (=10)`
  - `onReward = cfg.onReward`
  - `stopWhen = (c) => !isDayTime(c.minutes)`, `stopReason = 'The sun is setting — park is emptying out'`
- `pendingStart` effect (14961-14966): after `selected` is committed, when not already active it clears the flag and calls `activity.start()`.
- Reset effect (14969-14974): whenever `activity.active` becomes false -> `playMode=false`, `accuracyRef=0`.
- Night lock (14976-14986): if `!isDayTime(char.minutes ?? 0)` renders 🌙 "THE PARK IS QUIET" / "Beatboxers don't gather here at night. Come back at sunrise — or head to the bar where the cypher lives after dark." + button "← BACK TO HOOD" (`go('hood')`).
- Header (14990-14993): "THE PARK" / "Tap an activity to commit".

## Generic activity engine `useActivity` (reference; drives every Park activity)  [ext L2139-2258]
Per tick (every `tickRealMs`, skipped while `_gamePaused`):
- `minutes += tickMinutes (default 10)`; `energy = max(0, energy - tickEnergyCost)`; `hunger = max(0, hunger - tickHungerCost)`;
- `mood = clamp(mood + tickMoodDelta - passiveDrain(tickMinutes))` (`passiveDrain` = `_moodDrainFor`, see section 0).
- Stop conditions evaluated on the post-tick values (the reward for that tick still fires first):
  1. `newEnergy < tickEnergyCost` -> toast 'You collapsed from exhaustion' (bad)
  2. `newHunger <= 0 && tickHungerCost > 0` -> 'Too hungry to keep going'
  3. `newMins >= 1200` -> 'It got too late — heading home'
  4. `stopWhen` (park: minutes >= 720) -> 'The sun is setting — park is emptying out'
  5. `char.day` changes while active -> silent stop.
- Every 5th tick (`blockRef >= blocksPerReward`) `onReward()` is called and `rewardsEarned++`; `block` (0-4) drives the progress bar.
- `start()` refuses if `energy < tickEnergyCost` ('Too tired to start!') or `sickDay === day` ('Too sick to do anything today').
- `stop(reason)` toast type is 'bad' when the reason contains '!' else 'info'.
- Numbers per reward: AFK = 5 ticks x 500 ms = **2.5 s real, 50 game-min**; play mode = 5 x 2500 ms = **12.5 s real, 15 game-min**.

## Activity table (the three activities)  (lines 14782-14939)
| key | name / desc | icon (PixelIcon / lucide) | energy/tick (AFK -> play) | hunger/tick | mood/tick | start gate energy (=3 ticks) |
|---|---|---|---|---|---|---|
| busk | "Busk" — Perform on the street for tips | `mic` / Mic | 2 -> 0.8 | 0 -> 0 | 0 | 6 |
| jam | "Jam Session" — Cypher with other beatboxers | `jam` / Music | 2 (no play mode) | 1 | +1 | 6 |
| run | "Go Running" — Build stamina and clear your head | `shoe` / Dumbbell | 3 -> 1.2 | 2 -> 1 | +0.5 | 9 |
Labels shown in the in-progress panel: busk '5 blocks → cash + maybe a fan'; jam '5 blocks → random stat +1, mood up, fans'; run '5 blocks → +1 Showmanship, mood up'.
Full AFK day budget from 100 energy: busk 50 ticks = 10 rewards (500 game-min); jam 50 ticks = 10 rewards (also -50 hunger); run 33 ticks = 6 rewards (-66 hunger).

## Activity picker panel + entry gates  (lines 15013-15076)
Shown when `!activity.active`. Panel title "Activities". One full-width button per activity: pixel icon (opacity .4 when blocked), name, desc, right side either "START ▶ / -N⚡/tick" or "🔒 reason / hint". `N` is the base `tickEnergyCost` (2/2/3). Blocked buttons have rose styling and `cursor-not-allowed`, tooltip `reason — hint`; clicking shows toast `reason · hint` (bad) and does nothing; otherwise `setSelected(key); setPendingStart(true)`.

`blockReason(key, cost)` in order:
1. `(char.sickDay||0) === char.day` -> "Too sick" / hint "Rest until tomorrow"
2. `energy < cost*3` -> "Too tired" / "Power nap on the couch"
3. key === 'busk' -> null (busk is the safety net: no hunger/mood requirement)
4. `hunger < 15` -> "Too hungry" / "Eat in the kitchen"
5. `mood < 15` -> "Too grumpy" / "Watch TV or take a walk"
Thresholds are strict `<`.

## Busk  (lines 14783-14818; UI 15083-15100)
- What: street performance; cash + maybe a fan every reward block. Two modes toggled by a button above the mini-game: AFK pixel animation (default) or rhythm-tap mini-game for bonus tips.
- Costs: 2 energy/tick (0.8 in play), 0 hunger, 0 mood. Time 50 (AFK) / 15 (play) game-min per reward.
- Reward formula per block:
  - `totalSkills = mus+tec+ori+sho`
  - `baseEarned = floor(totalSkills/6) + floor(rand*3)` (0..2)
  - `acc = accuracyRef.current || 0` (0 in AFK mode, otherwise the **last** 2.5 s RhythmTap window's hit ratio)
  - `bonusMult = acc >= 0.8 ? 2.0 : acc >= 0.5 ? 1 + (acc-0.5)/0.3*0.5 : 1` (note: at acc=0.8 the middle branch would give 1.5 but jumps to 2.0 — discontinuity)
  - `earned = floor(baseEarned * bonusMult)`
  - `fans = (rand < 0.4 || acc >= 0.8) ? 1 : 0`
  - Examples: stats 5/5/5/5 (total 20) -> base 3..5 -> $3-5 AFK, $6-10 at acc>=.8. Total 60 -> 10..12. Total 120 -> 20..22.
- Writes (via `bumpDaily(...,'busks')` then `checkLevelUp`): `cash += earned`, `followers += fans`, `xp += 6`, `storyFlags.firstBusk = true`, `daily.busks++`, `weekly.busks++`.
- Toast (win): `+$${earned}${fans?' +1 fan':''}${bonusMult>1?` (${round((mult-1)*100)}% bonus!)`:''}`.
- Button text: `▶ PLAY RHYTHM (bonus tips)` / `◀ AFK MODE`; toggling sets `accuracyRef = 0`.
- Embeds: AFK -> `<BuskAnimation color={char.color} block={activity.block} rewardKey={activity.rewardsEarned} active={activity.active} />`; play -> `<RhythmTap onAccuracyUpdate={handleAccuracy} evaluateEveryMs={2500} active={activity.active} />`.
- Foxy references it: her $15 broke-loan message says "this is a one-time thing. go busk in the park. seriously." [ext L13000]; Foxy tip "no one knows you exist yet. park, jar on the ground, go." [ext L856].

## Jam Session  (lines 14819-14902; UI 15101-15103)
- What: cypher with other beatboxers. AFK only (no play mode toggle). Main early-game stat + fan source and the trigger for three story cutscenes.
- Costs: 2 energy/tick, 1 hunger/tick, +1 mood/tick (net ~+0.95 after passive decay). Time 50 game-min per reward.
- Reward per block: `stat = random of ['mus','tec','ori']` (Showmanship never), `fans = 1 + floor(rand*3)` (1..3), `xp += 8`, `stats[stat] += 1`, `followers += fans`, `storyFlags.jamCount += 1`, `daily.jams++`, `weekly.jams++`, `checkLevelUp`.
- Toast: `+1 Musicality|Technicality|Originality, +N fans`.
- Story beats, evaluated with the (possibly one-render-stale) `charRef` `c` AFTER the setChar:
  1. **First jam** (`!storyFlags.firstJam`): `playCutscene({speaker:null, lines:[ 'You stand in the circle.', "Strangers, all of them. None of them care where you slept last night.", 'Maybe this is what you needed.' ]}, 'firstJam')` then **return** (no other cutscene in this reward).
  2. **Pig Pen's challenge** — if `!flags.pigPenChallenged && (jamCount+1 >= 3 || sho >= 8)`: speaker 'PIG PEN' color `#fb7185`, scene `drawPigPenChallengeScene(ctx,fc,lookFromChar(c))`, lines: "yo. you. new face." / "you sound like you been practicing in a closet." / "saturday. bar. you and me." / "don't bring a friend. you'll need 'em on the way home." flag `pigPenChallenged`.
  3. **BeeAmGee cypher sighting** — if `defeated.length >= 1 && !flags.bjarneCypherSighting`: speaker null, scene `drawBjarneCypherScene`, lines: "Someone's standing at the back of the cypher." / "Gray beard. Leather jacket. Doesn't perform." / "He nods once when you finish your round. Then he's gone." / "...who was that?" flag `bjarneCypherSighting`.
  4. **Famous beatboxer crashes the cypher** — if `jamCount+1 >= 5 && followers >= 30 && !flags.fatboxgVisit`: no scene, lines: "The circle goes quiet mid-round." / "Heads turn. Someone you know from the videos just stepped into the cypher." / "They throw a 30-second flurry that nobody can answer. Then they're gone, walking off with two friends." / "Someone whispers their name. You pretend you weren't watching." / "There's a long way to go." flag `fatboxgVisit`.
  Beats 2-4 are independent `if`s (not else-if): if more than one qualifies in the same reward, only the LAST `playCutscene` call survives (earlier ones never display, their flags never set -> they retrigger on the next reward).
- Embeds: `<JamAnimation color block rewardKey active />`.
- Unlock hooks: `jamCount >= 3` unlocks sound `inward_k` [ext L33].

## Go Running  (lines 14903-14938; UI 15089-15114)
- What: runs build Showmanship. AFK mode = scrolling pixel runner; "SPRINT MODE" = alternating-tap stamina mini-game that can also grow max energy.
- Costs: 3 energy/tick (1.2 sprint), 2 hunger/tick (1.0 sprint), +0.5 mood/tick (not scaled in sprint). Time 50 / 15 game-min per reward.
- Reward per block (`isPlayMode = playMode && selected==='run'`; `result = runBlockRef.current`):
  - `burnEnergy = isPlayMode ? round(8 * burnRatio) : 0` (extra energy loss, 0..8)
  - `shoesBonus = hasGear('premium_shoes') ? 1 : 0`
  - `shoGain = ((isPlayMode && result.isGood) ? 2 : 1) + shoesBonus`
  - Writes (bumpDaily 'runs'): `xp += 5`, `mood = min(100, mood+4)`, `energy = max(0, energy - burnEnergy)`, `stats.sho += shoGain`, `daily.runs++`, `weekly.runs++`, `checkLevelUp`.
  - Toasts (win): `+${shoGain} Showmanship · 🔥 -${burnEnergy} energy (burnout)` or `+${shoGain} Showmanship${isPlayMode && isGood ? ' (+1 bonus)' : ''}`.
- `handleMaxEnergyTick()` (called by RunTracker): `maxEnergy = min(150, (maxEnergy ?? 100) + 1)`, toast '💪 Max Energy +1' (win). Does not refill energy. Comment at L14773 says "every 5 good bars" but RunTracker actually fires every **3** good bars [ext L2929].
- Toggle button text `▶ SPRINT MODE (build max ⚡ energy)` / `◀ AFK MODE`; toggling resets `runBlockRef = {avg:0,isGood:false,burnRatio:0}`.
- Embeds: AFK -> `<RunAnimation color block rewardKey active />`; sprint -> `<RunTracker onBlockResult={handleRunBlock} onMaxEnergyTick={handleMaxEnergyTick} evaluateEveryMs={2500} active />`.
- Note `runBlockRef` holds only the LAST 2.5 s evaluation window when the reward fires (reward every 12.5 s covers 5 windows) — i.e. only 1/5 of the performance counts toward the reward; good-bar counting for max energy is independent of rewards.

## Date arrival / stand-up (romance hook)  (lines 14701-14760, 14995-15011)
- Data: `char.dateBooking = {partner, partnerName, partnerColor, day, minute}` created by Mingle ask-out encounters [ext L1720-1748, L2019-2027]: `day = c.day + 2`, `minute = 600` (16:00). Six candidates can book: luca (#22d3ee), mira (#fb7185), sky (#84cc16), pascal (#fbbf24), jin (#a78bfa), roo (#fb7185) [ext L1943-1948].
- `onDateDay = booking.day === char.day`; `dateMissed = booking.day < char.day`.
- **Stand-up effect** (14711-14722): runs on ParkScreen mount/when `dateMissed` flips true (even if the park is night-locked, because it is above the early return): `dateBooking = null`, `mood = max(0, mood-10)`, `romanceAffinity[partner] = max(0, aff-2)`, toast `You stood ${partnerName} up. -10 mood.` (bad). Only fires when the player opens the Park screen after the date day; otherwise the booking lingers.
- **Date panel** (14996-15011): when `onDateDay && !activity.active` show Panel "Date": line `${partnerName} is on the bench by the trees.` (partner color, Bebas Neue), hint "Skip and you'll stand them up. Mood + affinity penalty.", primary button `💕 MEET ${NAME} (+1 hr)`. The booked `minute` (16:00) is NOT enforced — any daytime visit that day works.
- `goOnDate()`: `partnerLook` = `_LUCA_LOOK {shirt:#3a5060,skin:#d4a87a,hair:#1a1a2e}` / `_MIRA_LOOK {#a06090,#e0b890,#5a2010}` / `_SKY_LOOK {#fbbf24,#a87844,#dadada}` else fallback `{shirt:'#a78bfa'}` (pascal/jin/roo always get the fallback look). Plays cutscene speaker `partnerName` (color `partnerColor`), one beat with `drawDateScene(ctx,fc,playerLook,partnerLook)`, lines "you came." / "i wasn't sure if you would." / "...this is nice." (no flag).
- Applied state: `dateBooking=null`, `minutes += 60` (plain add, no mood decay, not clamped to the 18:00 closing), `mood = min(100, mood+18)`, `romanceAffinity[partner] += 3`, `romanceState[partner] = aff>=10 ? 'couple' : aff>=5 ? 'romancing' : unchanged` (never writes 'building' here, unlike `applyMingleEffects`). No energy cost.
- Drawn (`drawDateScene` [ext L9727-9827]): daytime sky, sun top-left, cloud, grass, tree left, wooden bench centre-right, two seated figures (player left, partner right) with shirt/skin/hair colors, 3 drifting pink hearts, 6 background crowd dots, twinkling sparkles.

## Park activity lifecycle (state machine, for the Phaser ParkScene)
```
IDLE (picker visible)
  -- tap card, gate ok --> STARTING (selected=key, pendingStart) --> RUNNING (activity.active)
RUNNING
  every tickMs: apply tick (minutes/energy/hunger/mood) -> block++ ; if block==5: REWARD(onReward), rewards++
  stop conditions (checked after the tick+reward): exhaustion / hunger 0 (jam,run) / minutes>=1200 / minutes>=720 (sunset) / day changed / STOP button
  cutscene up -> ticks paused (_gamePaused) but timers keep running
  mode toggle (busk, run): flips playMode; tickMs/tickMinutes/energy/hunger scale immediately; block counter is NOT reset
RUNNING -- stop --> toast(reason) -> IDLE (playMode=false, accuracy=0)
```
Notes: the picker re-checks gates every render, so after a stop with low energy the cards show their lock reasons; the start gate (3 ticks of energy) is stricter than the engine's own start check (1 tick).

## Park in-progress panel UI  (lines 15078-15126)
Panel title `${cfg.name} — IN PROGRESS`. Vertical order: mode toggle (busk/run only) -> animation or mini-game -> label (cfg.label) -> `ProgressBar block/5 "Block n/5"` -> row "Rewards earned: N" + static text "1 block = 10 game min (0.5s)" (wrong in play mode: 3 min / 2.5 s) -> red `STOP ■` button (`activity.stop('Stopped early')`, toast type 'info'). The mode toggle is deliberately at the top so it is away from the bottom tap buttons.

## Embedded park components (external; props used here)
- `BuskAnimation({color, block, rewardKey, active})` [ext L2290-2530]: 140x90 canvas at scale 4. Drawn: sunny gradient sky, sun, 2 drifting clouds, 6 grey buildings with window glints, grass strip with 2 trees, sidewalk with speckles, unlit lamp post, a passerby walking left-to-right (random shirt color from lime/violet/rose/cyan/orange, 2-frame walk), tip jar (coins piled up to 8, tied to `rewardKey`) with "sign", the player (shirt = `char.color`, 2-frame bob, mouth 4-frame cycle, blink every 120 frames), gold sound-wave arcs, floating "BOOM/TSS/KSH" text when `block>0`, 3 flying coins on each reward (`rewardKey` increase).
- `RhythmTap({onAccuracyUpdate, evaluateEveryMs=2500, active})` [ext L2537+]: 3-lane falling-note game (BOOM=kick `B`, TSS=hat `T`, KSH=snare `Pf`), 100 BPM, one 8-note bar pattern (kick, hat, snare, hat, kick, hat, snare, hat on 8ths), note speed 175 px/s, hit windows PERFECT <80 ms, GOOD <180 ms, mis-tap = MISS & combo reset; every 2.5 s reports `accuracy = hits/(hits+misses)` (missed-by-passing notes count as misses) via `onAccuracyUpdate(acc, hits, total)`; plays the hero sample for the lane.
- `JamAnimation({color, block, rewardKey, active})` [ext L5779-6019]: 140x90 at scale 4: daylight park, trees, 18-person crowd silhouette bobbing with raised arms, sunlit grass, dirt cypher circle (ellipse), 4 beatboxers (player front-centre in `char.color`; left #84cc16, right #fb7185, back #a78bfa), the "turn" rotates every 240 frames (active one bobs, holds a mic, gold ring soundwaves, label `▶ YOU/L1/R1/B1`), 8 colored sparkles per reward.
- `RunAnimation({color, block, rewardKey, active})` [ext L6023-6245]: 140x90 at scale 4: peach->amber->purple sunset sky, sun, slow-parallax mountains, mid trees, brown path with moving dashes, fast grass tufts, centred runner with 4-frame run cycle, sweat drops every 30 frames, motion lines, distance counter `X.XKM` (= 0.5 per reward + 0.1 per block).
- `RunTracker({onBlockResult, onMaxEnergyTick, evaluateEveryMs=2500, active})` [ext L2852+]: alternating LEFT/RIGHT tap (also A/D or arrow keys) fills a bar +12 per valid alternating tap, drains 25/s; zones: slow <60, target 60-85, burn >85. Every 2.5 s: `avg` of samples, `isGood = avg >= 60`, `burnRatio = samples>85 / samples`; reports `onBlockResult({avg,isGood,burnRatio})`; every 3 good bars -> `onMaxEnergyTick()`.
  - Same finger twice = ignored + brief red flash (100 ms); valid tap flashes amber (80 ms). Layout: vertical bar gauge (burn zone top 15 % red-tinted "🔥 burning out", target band 60-85 % amber "target", "too slow" label at bottom, numeric % readout), sidebar "Good bars n / 3 to next +max⚡" and "Gained +N max energy", two big LEFT 👈 / RIGHT 👉 pads (hint letters A / D), footer "Same finger twice = doesn't count · stay in TARGET zone — burning out costs extra ⚡".
  - Sprint-mode effective cost: AFK run needs ~0 skill; sprint mode only improves the reward via the last window's `isGood` (+1 sho) and burn surcharge (-0..8 energy) and the max-energy trickle.
- RhythmTap details: canvas 300x300; target line at y=245; notes (28x28 coloured squares with glow) fall at 175 px/s from the top (lead time 1.4 s); lane letters under the canvas: A=BOOM(kick, #CC2200), S=TSS(hat, #22d3ee), D=KSH(snare, #D4A017) plus on-screen pad buttons; judgment text PERFECT (gold)/GOOD (cyan)/MISS (red) rises above the hit line; "N x COMBO" from 3+. `HIT_PERFECT_MS=80`, `HIT_GOOD_MS=180`. PERFECT vs GOOD makes no difference to the park reward (only hits/(hits+misses)).

---------------------------------------------------------------------------------------------------

# 2. ROHZEL + SHOWCASE SLOT DATA

## ROHZEL dialogue line sets  (lines 15131-15164)
Rohzel = cyan (`#22d3ee`) bar keeper [ext L266]. Picker is `_pick(arr)` uniform random.
- `ROHZEL_GREETINGS` (6) — initial line on every BarScreen mount and the "Just chatting" button:
  1. "Yo, lil homie! What you sippin' on tonight?"
  2. "Aaayy, the people's champion in the building."
  3. "Look who decided to show up — you smell like ambition."
  4. "Welcome back. Try not to scare my regulars."
  5. "Ay, this ain't no daycare. You here to spit or what?"
  6. "I run this bar, the cypher, and your hopes & dreams. What's good?"
- `ROHZEL_NEED_FANS` (3) — fans < 50:
  1. "Ten fans? Ten?? My DOG got more followers than that. Build a buzz, then we talk."
  2. "Lil bro come back when more than your mama is screaming your name."
  3. "I need a crowd that pays my electric bill. Not a Spotify playlist of three."
- `ROHZEL_NEED_OPEN_MICS` (3) — open mics < 5:
  1. "I haven't even seen you on my open mic stage. Earn your reps first."
  2. "Five open mics. That's the bar. Literally."
  3. "Friday's a privilege. Tue, Wed, Thu — the work's there. Show up."
- `ROHZEL_COOLDOWN` (2) — showcase done within the last 7 days:
  1. "Already had your slot this week, hotshot. Let the people miss you."
  2. "One show a week. That's the rule. Even Beyoncé gotta breathe."
- `ROHZEL_BOOKED_OK(timeStr, day)` (3; `day` unused):
  1. `Aight, I see you. Friday ${timeStr}. Don't be late or I give the slot to a 14-year-old TikTok kid.`
  2. `Cool. Friday at ${timeStr}. Be sober, be loud, be there.`
  3. `Locked in: Friday, ${timeStr}. Mess this up and you're banned from karaoke too.`
- `ROHZEL_REMINDER(timeStr)` (2) — already booked:
  1. `You're already on the list, Friday ${timeStr}. Don't make me regret it.`
  2. `Booked, kid. Friday ${timeStr}. Show up or shut up.`
- Other Rohzel text elsewhere: festival invite phone text "festival people called.\nthey want you.\nsit down. let's talk." [ext L13271]; festival cutscene lines (see Festival section); Foxy hints "the bartender's been asking about you. go see him." etc. [ext L838-843]; toasts "Missed your showcase. Rohzel ain't happy." and "Rohzel: come back when you decide.".
- Static copy lines (NEED_FANS #1 says "Ten fans" but the real requirement is 50).

## Showcase slot scheduling  (lines 15166-15190)
- `SHOWCASE_SLOTS`: `for m = 840; m <= 1110; m += 30` -> **10 slots**: 840, 870, 900, 930, 960, 990, 1020, 1050, 1080, 1110 = **20:00, 20:30, 21:00, 21:30, 22:00, 22:30, 23:00, 23:30, 00:00, 00:30** (the comment says "8 PM .. 0:30 AM"). Slot value = `minutes` (since 06:00) at which the gig starts.
- `daysToNextFriday(currentDay, currentMinutes)`: `dow<4 -> 4-dow` (Tue 3, Wed 2, Thu 1; Mon 4); `dow==4 (Friday) -> currentMinutes < 840 ? 0 : 7`; `dow>4 -> 11-dow` (Sat 6, Sun 5).
- `pickShowcaseSlot(currentDay, bookingDay, currentMinutes)`: candidates = same-day booking ? slots with `m > currentMinutes + 30` : all slots; returns a uniform random one (undefined if empty — cannot occur given the 840 guard).
- Booking is made at `askRohzel` (Bar section) and stored as `showcaseBooking = { day, minute }`.

---------------------------------------------------------------------------------------------------

# 3. PERFORMANCE / ANIMATION COMPONENTS

## OpenMicPerformance  (lines 15196-15275)
- What: full-screen (`fixed inset-0 z-50`, radial gradient #1c1917->#0c0a09) modal shown by BarScreen while `performingOpenMic`. It is a pure replay of the player's sequencer patterns — **no input, no scoring, no skip**; `onComplete()` fires after the playback ends + 700 ms.
- Props: `{char, onComplete}` (BarScreen passes `finishOpenMic`).
- Pattern choice (once, via ref): `slots = char.oriSlots.filter(s => s.tracks.some(t => t.cells.some(Boolean)))`; 0 slots -> `[_seqStarter(0), _seqStarter(1)]` ("Boom Bap", "4 on Floor" [ext L4977-4989]); 1 slot -> `[s, s]`; else random shuffle, take first two.
- Playback timing: `bpm = (char.oriBpm || 100) + 20`; `stepMs = 60000 / max(40,bpm) / 4` (16th notes); `STEPS=16`, `REPS_PER_PATTERN=2`. Every step, for each track with `cells[step]` -> `playGameSound(track.key)` (hero keys B/T/K/Pf or SOUND_CATALOG ids). Sequence: pattern 0 x2, pattern 1 x2 = 64 steps (at default 120 BPM = 8.0 s). Audio context resumed on mount.
- UI: title "🎤 OPEN MIC NIGHT" (amber, Bebas Neue), subtitle `${NAME} · the room is yours`, `<PixelScene draw={drawOpenMicStage(ctx,fc,look)}/>`, footer `ROUTINE n / 2 · {pattern.name || 'CUSTOM'}` (n advances when pattern index changes).
- DRAWN (`drawOpenMicStage` [ext L9888-9939], 200x130 virtual px, canvas scale 3): dark bar back wall (#1c1825) + top trim; 7 blinking string lights (amber/rose alternating); wooden stage platform x30-170,y86-104 with highlight/shadow lines; mic stand (pole, base, mic head); soft spotlight trapezoid (rgba 254,243,199,.07); the player via `drawBeatboxer(ctx,100,86,look,'right',active=true)` (bobbing legs, animating mouth, mic in hand); expanding ring of 8 dots in the shirt color every 4th frame; 14 crowd silhouettes along the bottom (heights 14/18/22, heads bob with sin, raised hands on every 3rd person). No sprites. `look = lookFromChar(char)` = {shirt: active outfit shirt, skin, hairColor, hairStyle, accessory if unlocked} [ext L16597].
- Rebuild: Phaser OpenMicScene with a step scheduler (use audio-clock, not `setInterval`); the "cleanup return inside setInterval" (L15243) is a no-op bug — the 700 ms timeout is never cancelled on unmount.
- State: reads `char.oriSlots`, `char.oriBpm`, `char.name`; writes nothing.

## PowerNapAnimation (+ `drawNapScene`)  (lines 15277-15440)
- What: full-screen real-time nap modal. Reached from the House screen's nap button (`startNap`: blocked with toast 'Too hungry to nap — eat something first!' if `hunger <= 0`) [ext L13051-13057]. Rendered when `napping` [ext L13451].
- Props: `{char, onWake(finalMinutes, forced)}`.
- Mechanics: `REAL_MS_PER_GAME_HOUR = 1500` (1.5 s real = 1 game hour = 60 game-min), `DAY_LIMIT = 1200` (02:00). rAF loop: `napMinutes = min(1200, startMinutes + realElapsed/1500*60)`; when it reaches 1200 -> `onWake(1200, true)` (forced); button "WAKE UP ☀️" -> `onWake(napMinutes, false)`.
- HUD: title "POWER NAP", subtitle `Slept Xh MMm`; two boxes: "In-game time" (24 h clock of `napMinutes+360`) and "Energy" `predicted/maxEnergy` with an amber bar, where `predicted = round(min(maxEnergy, energy + floor(slept/60*12)))` (matches `finishNap`).
- Outcome `finishNap` [ext L13058-13073]: `hours = slept/60`; `minutes = round(min(1200, final))`; `energy += floor(hours*12)` (clamped to maxEnergy); `hunger -= floor(hours*3)` (min 0); `mood += floor(hours*2)` (clamped 100). Toast: forced '2 AM — got booted off the couch' (info) else 'Napped — feeling sharper' (win). Does NOT consume `pendingDebuff`, does not roll sleep events/rent/daily reset.
- Real-time rates: 12 energy per game-hour = 8 energy per real second; 3 hunger and 2 mood per game-hour (applied only on wake); a 06:00 -> 02:00 nap (20 game-hours) is 30 s real and would give +240 energy (clamped to max).
- DRAWN (`drawNapScene(ctx,fc,look,currentMinutes)` L15370-15440, 200x130): grey-purple dim wall (#3a3540, y0-95) + brown floor (#3a2818, y95-130); couch (seat 110x28 + two arms, #5a4030 with #7a5a40 highlight); player lying: pillow, head (skin), hair strip, closed eyes (2 px), small smile, torso in shirt color with white collar line, dark pants, white feet; floating lowercase "z" (bold 9px monospace, `fc%30<24`, rising/drifting by `(fc/30)%3`); analog wall clock upper-right (centre 158,32, r 22): dark rim, light face, 12 tick marks (bigger every 3rd), hour & minute hands from `(napMinutes+360)`, centre pin. Artist notes: no night/day tint, no window, no hunger/energy visuals; the player is flat rects.
- Rebuild: NapScene; tick = `dt` accumulation, same constants; send `{minutes, forced}` to a pure `finishNap(char, finalMinutes)` function.

## SleepAnimation (+ `drawSleepScene`)  (lines 15442-15480; scene [ext L9942-10029])
- What: 4 s non-interactive full-screen cutscene shown while `sleeping`; calls `onComplete()` -> `finishSleep` [ext L13074+] (all real morning logic: rent, debuff, events, challenges, songs yield...). Triggered from House `sleep()` (blocked if `hunger <= 0`: 'Too hungry to sleep — eat something first!') [ext L13008-13014].
- Props: `{char, durationMs=4000, onComplete}`.
- Behaviour: rAF progress 0..1 = elapsed/durationMs; at `progress > 0.85` plays `playRooster()` once [ext L17557]; at 1 -> onComplete. Caption (Bebas Neue, stone-300): `<0.4 'Drifting off…'`, `<0.85 'Sleeping'`, else '🐓 Cock-a-doodle-doo'.
- DRAWN (`drawSleepScene(ctx,fc,look,progress)`, 200x130): ambient bg colour piecewise: progress<0.3 dusk (rgb 50,40,70 -> 14,10,20), 0.3-0.7 deep night (14,10,20), >0.7 dawn (14,10,20 -> 104,70,50); floor strip; window (130,18, 50x42) coloured purple-grey -> near-black -> amber (#3a2840 / #0a0a14 / #fbbf24) with cross mullions; 10 twinkling stars in the window during 0.3-0.7; growing sun square after 0.85; same couch+sleeping player as the nap scene; two "z" glyphs (8px & 6px) during 0.05-0.85, 3-phase rise every 24 frames; extra black darkness overlay (alpha up to .45) during 0.3-0.75.
- State: reads `char` only for look.
- Rebuild: SleepScene with tweened background colour (use the same keyframes) -> then call pure `finishSleep(char, rng)`.

## ShowcasePerformance  (lines 15482-15581)
- What: the Friday showcase mini-game, 20 s free-play MPC pad grid. No target pattern; reward depends only on **how many taps** and **how many distinct sounds** were hit.
- Props from BarScreen: `<ShowcasePerformance char={char} durationMs={20000} onComplete={finishShowcaseGig} />`, wrapped in a `div.space-y-3.pt-2` (NOT a full-screen overlay; the bar's normal header is replaced).
- Pads: `[...Object.keys(HERO_SOUNDS) = ['B','T','K','Pf'], ...char.sounds.filter(id => SOUND_CATALOG[id] && !HERO_SOUNDS[id] && !heroDefaultSounds.has(id))]` where hero defaults = {classic_kick, hi_hat, rimshot, psh_snare} [ext L17166-17171]. So 4 base pads + each owned unlock among inward_k, throat_kick, fast_hats, lip_roll, inward_bass, d_low, laser, click_roll, uvular_roll (max 13 pads). Columns = `pads.length <= 4 ? pads.length : 4`.
- Pad visuals: square (`aspect-square`) 2 px border in the sound colour; label (hero: B/T/K/Pf; catalog: initials of first two words via `_abbrevFromName` e.g. "Inward K Snare" -> "IK", colour from `CAT_COLORS[cat]`) at 22 px Bebas Neue + name (9 px, uppercase). Flash (fill the full colour, text dark) for 150 ms after a tap. `onPointerDown` (prevent default) so it fires on press; `active:scale-95`.
- Tap handler: ignored after finish; `playGameSound(key)`; `tapsRef++`; `distinct.add(key)`; update HUD.
- HUD: title "🔥 LIVE — {NAME}", subtitle "Free play · go off"; progress bar (gold `#D4A017`, switches to red `#ef4444` after 85 %); footer `HITS n · SOUNDS distinct/pads · TIME Ns` (countdown).
- Completion: at `elapsed >= durationMs` (once) -> `onComplete({ totalTaps, distinctSounds, durationMs })`.
- Hero sound colours: B kick #CC2200, T hi-hat #22d3ee, K rimshot #a78bfa, Pf snare #fbbf24.
- Scoring/outcome is applied in `finishShowcaseGig` (see Friday Showcase gig section).
- DRAWN: only DOM/CSS (no canvas): pad buttons + progress bar. An artist can add a stage backdrop, crowd, and per-tap particle/visual feedback; currently there is none and no combo/rhythm feedback.
- Rebuild: ShowcaseScene with large touch pads, keyboard shortcuts, 20 s countdown; keep scoring in pure `scoreShowcase({taps, distinct}, stats)`.

---------------------------------------------------------------------------------------------------

# 4. BAR SCREEN  (lines 15583-16419)

## BarScreen — overview, state, lock, header  (lines 15583-15660, 15961-15979)
- Signature `BarScreen({ char, setChar, go, showToast, checkLevelUp, playCutscene })`. Mounted when `screen === 'bar'` [ext L11699]; reached from Hood "Bar" hotspot (desc `Tonight: ${schedule.title}`), unlocked from day 3 and only at night.
- State: `selected` (opponent NPC for battle), `rohzelLine` (init `_pick(ROHZEL_GREETINGS)`), `performingShowcase`, `performingOpenMic`, `mingleEncounter`.
- **Day lock** (15642-15651): `!isNightTime(minutes)` -> 🍺 "THE BAR IS CLOSED" / "Doors open at 6 PM. Come back tonight." + "← BACK TO HOOD".
- `dow = dayOfWeek(char.day)`, `schedule = BAR_SCHEDULE[dow]`, `dayName = DAY_NAMES[dow]`.
- Takeovers (15961-15971): `performingOpenMic` -> `<OpenMicPerformance char onComplete={finishOpenMic}/>`; `performingShowcase` -> `<ShowcasePerformance .../>`. Both replace the whole bar render.
- Header: "THE BAR"; `{dayName} · {schedule.title}` (amber); `{schedule.tagline}`.
- Panel order on screen: Festival panel(s) -> Weekend Tour -> Closed (Mon) -> Mingle (or locked) -> [MingleEncounter modal] -> weekday panel(s) (Open Mic Sign-Up / Friday Showcase / Battle opponents + Crew Battle / Karaoke) -> Rohzel -> Bar Menu.
- **Hooks-after-early-return bug**: the `useEffect` for `missedGig` (L15906) is declared after the daytime early return (L15642), so hook count differs between day/night renders (see GOTCHAS).

## Bar schedule  (data [ext L1233-1241]; rendering 15973-15979, panels as below)
| dow | day | `activity` | title | tagline |
|---|---|---|---|---|
| 0 | Monday | closed | CLOSED | Bar is dark — the doors stay shut on Mondays. |
| 1 | Tuesday | openmic | OPEN MIC NIGHT | Take the mic. Free slot — build heat + maybe fans. |
| 2 | Wednesday | openmic | OPEN MIC NIGHT | (same) |
| 3 | Thursday | openmic | OPEN MIC NIGHT | (same) |
| 4 | Friday | showcase | PAID SHOWCASE | Headline if you're good enough — better pay. |
| 5 | Saturday | battle | BATTLE NIGHT | The cypher fires up. Pick a challenger. |
| 6 | Sunday | karaoke | KARAOKE NIGHT | Sing along. Sharpen your musicality. |
Day numbering example: day 3 (first bar day) = Thursday open mic; day 4 Fri; 5 Sat; 6 Sun (rent due next sleep); 7 Mon closed; 8 Tue ...

## Bar Menu (drinks & snacks)  (lines 15657-15683, 16380-16416; data [ext L1245-1251])
- Shown whenever `schedule.activity !== 'closed'` (so Tue-Sun nights). Panel "Bar Menu". Each row: pixel icon (`coffee` for drinks, `star` for snacks), name, amber immediate effects `+Xe/+Ym/+Zh` formatted as `+N⚡`, `+N♥`, `+N🍴`, red `hangover: ...`, and a `$cost` button (disabled if `cash < cost`).
- Items:
| id | name | kind | cost | immediate | next-sleep debuff |
|---|---|---|---|---|---|
| spicy_wings | Spicy Wings | snack | $8 | mood +12, hunger +18 | hunger -10 |
| energy_drink | Energy Drink | drink | $6 | energy +45, mood +4 | energy -25 |
| cocktail | Tropical Cocktail | drink | $12 | mood +30, energy +12 | mood -18, energy -8 |
| whiskey | Whiskey Shot | drink | $10 | mood +22, energy +8 | mood -22 |
| loaded_fries | Loaded Fries | snack | $9 | hunger +28, mood +6, energy +6 | hunger -12 |
- `orderItem(id)`: guard `cash < cost` -> toast 'Not enough cash' (bad). Else `setChar`: `cash -= cost`; `passMinutes(c, 5)` (**5 game-min**, mood decay applied); `energy = clamp(0..maxEnergy, energy + im.energy)`; `hunger = clamp(0..100, hunger + im.hunger)`; `mood = clamp(decayedMood + im.mood)`; `pendingDebuff = { energy, mood, hunger }` = **sum** of previous pending + this item's debuff (stacks across any number of items). Toast `Drank|Ate ${name}` (win). No sickness/energy/time gates, unlimited purchases.
- Warning text under the list when `char.pendingDebuff` is truthy: "⚠ already feeling a hangover building for tomorrow".
- `pendingDebuff` is applied in `finishSleep`: `energy = clamp(energy + d.energy)`, `hunger`/`mood` clamp +d, then set `null` [ext L13213-13221]. A nap does not apply it. A foxy sleep-quality rule uses `pendingDebuff.energy <= -10` ("That late espresso came back to bite.") [ext L346-347].
- Hunger interplay: House sleep/nap refuse at `hunger <= 0`.

## Open Mic (Tue/Wed/Thu)  (lines 15685-15767, 16190-16202; performance 15196-15275)
- Panel "Open Mic Sign-Up" (only when `schedule.activity === 'openmic'`): text "Quick set, friendly crowd. Unpaid — you're here for the heat (and maybe a new fan)."; primary button `TAKE THE MIC 🎤 (-10⚡, +30 min)` (disabled `energy < 10`; red "Need 10 energy" below). **Label says +30 min; code spends 60 min.**
- `doOpenMic()`: `energy < 10` -> toast 'Too tired to perform'; `sickDay === day` -> 'Too sick to perform tonight' (both bad); else `performingOpenMic = true`.
- After the performance, `finishOpenMic()` (closure over the `char` from when the modal mounted):
  - `totalSkills = mus+tec+ori+sho`; `base = floor(max(0, totalSkills-20)/25)`; `showBonus = floor(sho/8)`; `lucky = floor(rand*3)` (0,1,2); **`fanGain = clamp(base + showBonus + lucky, 1, 20)`** (rolled once up front so toast matches). Examples: 5/5/5/5 -> 1-2; total 60/sho 15 -> 2-4; total 120/sho 30 -> 7-9; cap 20.
  - `setChar`: `wardrobe = hasGear('wardrobe_refresh') ? 1 : 0`; `t = passMinutes(c, 60)`; `energy -= 10` (min 0); `mood = min(100, t.mood + 5)`; `minutes = t.minutes`; `heat += 2` (write-only stat); `followers += fanGain`; `openMicCount += 1`; `xp += 8` (**no `checkLevelUp`**); `stats.sho += wardrobe`; `daily.openMics += 1` (weekly not bumped).
  - Phone message triggers (inside the same setChar): if `day - lastParentMsgDay >= 3 && fanGain >= 5 && rand < 0.35` -> parents message `_pick(PARENT_MESSAGES.goodShow)` [ext L289: "saw your show on insta lol look at you" / "the auntie is asking who taught you to do that. what do i tell her"] and `lastParentMsgDay = day`; then independently `fanGain >= 5 && rand < 0.35` -> 'unknown' fan message (10 lines [ext L316-327], e.g. "saw your clip — fire 🔥"), else `fanGain <= 1 && rand < 0.30` -> 'unknown' hate message (10 lines [ext L304-315], e.g. "you peaked at the open mic lmao").
  - `setPerformingOpenMic(false)`; `setTimeout(0)` cutscenes using `cBefore` flags:
    1. first time (`!storyFlags.firstOpenMicDone`): speaker null, lines 'Hot lights. A mic. Forty strangers staring back.' / 'The room exhales when you do. Whatever happens here, it counts.' / 'You held the room. Even just for a minute.' flag `firstOpenMicDone`.
    2. BeeAmGee intro (`bjarneCypherSighting && !bjarneIntroduced`): speaker 'BEEAMGEE' color `#a3a3a3`, scene `drawBjarneMeetingScene`, lines "saw you in the cypher last week." / "you've got something. raw. unfinished. but something." / "name's BeeAmGee. been at this thirty years." / "come find me when you're ready. studio. fifty bucks. i'll show you what i know." flag `bjarneIntroduced`. If both qualify, only #2 shows (it replaces #1).
  - Toast (win): `Open mic done · +${fanGain} new fans 🎤`.
- Unlocks tied to `openMicCount`: sound `fast_hats` at 5, outfit/accessory `cap` (Snapback) at 5, achievements open_mic_newcomer (1) & mic_veteran (10) [ext L35, L667, L607-608] — these only update on the next `checkLevelUp` call (open mic doesn't call it). Rohzel's Friday gate needs 5.
- No cooldown: can repeat open mic every night until energy/time run out (60 min each, 480 min of bar time = up to 8 per night).
- Rebuild notes: keep as pure `openMicFans(stats, rng)`; consider making sequencer quality matter (currently ignored).

## Karaoke (Sunday)  (lines 15813-15859, 16325-16343)
Panel "Karaoke Night": "Sing along — sharpen your musicality."
- **GRAB THE MIC 🎶 (-8⚡, +30 min)** (disabled `energy < 8`): `doKaraoke`: guards: energy < 8 'Too tired to sing'; sick 'Lost your voice — call it a night'. `earn = 4 + floor(rand*5)` ($4-8); `musGain = 1 + (rand < 0.25 ? 1 : 0)`; `passMinutes(30)`; `cash += earn`; `energy -= 8`; `mood = min(100, t.mood+6)`; `stats.mus += musGain`; `xp += 5` (no checkLevelUp). Toast `Karaoke: +${musGain} musicality, +$${earn}`.
- **KARAOKE CHALLENGE 🏆 (-24⚡)** (disabled `energy < 24`; intro text "Or try the 3-song streak — bigger reward, harder each round."): `doKaraokeChallenge`: guards 'Need 24 energy for the challenge', sick check. `skill = mus + floor(sho/2)`; 3 rounds i=0..2 with `target = 5 + 6i` (5, 11, 17); `roll = skill + floor(rand*12) - 4` (skill-4..skill+7); success if `roll >= target`, first failure breaks. `rounds` = successes (0-3). `baseEarn = rounds*14 + floor(rand*8)`; `fanGain = rounds>=3 ? 5 : rounds>=1 ? 1 : 0`; `musGain = 1 + floor(rounds/2)`; time `30 + rounds*10` game-min; `energy -= 24`; `mood = t.mood + (rounds>=3 ? 14 : rounds>=1 ? 6 : -4)`; `mus += musGain`, `sho += 1` always; `xp += 8 + rounds*4`; `checkLevelUp`. Per-round success P = clamp((12 - max(0, target - skill + 4))/12, 0, 1) (skill 7: 83 %, 33 %, 0 %; a round is certain once `skill >= target + 4`, so all three rounds are certain at skill >= 21).
  Toasts: 3 rounds `Karaoke 3-streak! +$${baseEarn}, +${fanGain} fans` (win); 1-2 `Karaoke ${rounds}/3 · +$${baseEarn}` (win); 0 'Choked on round 1' (bad). A `log` of per-round strings is built but never shown.
- The only red hint shown is "Need 8 energy" (for energy < 8).

## Battle Night (Saturday) + opponent select  (lines 15955-15959, 16237-16288)
- `battleCooldownDaysLeft = lastBattleDay ? max(0, 7 - (day - lastBattleDay)) : 0`. Cooldown is shared by solo battle, crew battle (sets `lastBattleDay`), and BattleScreen [ext L18420].
- On cooldown: Panel "Battle Night" 🥊 "You already battled this week. Come back in N day(s)."
- Else Panel "Choose your opponent": `NPCS` list [ext L87-97]; per row: NAME (Bebas Neue amber), 🏆 if `defeated.includes(name)`, 🔒 if `i>0 && !defeated.includes(NPCS[i-1].name)` (sequential unlock), `LVL n`, `M{mus} · T{tec} · O{ori} · S{sho} · ${reward}`. Selecting sets `selected`. Roster: Pig Pen L1 7/7/5/6 $20; Joel Burner L1 8/8/6/7 $25; CeDe L3 12/11/9/10 $50; Sikker L5 15/15/14/12 $100; Alim L7 19/18/17/15 $175; Olexinho L9 24/22/22/19 $350; FatboxG L12 30/32/28/28 $750 (details in battle inventory).
- Panel `vs ${selected.name}`: "Sounds: …" (display names from `SOUND_CATALOG`); `START BATTLE 🎤 (-30⚡)` disabled when `energy < 30 || equipped.length === 0`; red hints "Need 30 energy" / "No sounds equipped! Visit Shop". onClick: `go('battle') || setChar(c => ({...c, _opponent: selected}))` (`go` returns undefined so the setChar runs; BattleScreen reads `char._opponent`, falls back to `go('bar')` if missing) [ext L18033]. Energy is actually spent by BattleScreen, not here.

## Crew Battle (3v3)  (lines 15768-15812, 16290-16323; resolution [ext L1152-1172], data [ext L103-140])
- Panel "Crew Battle (3v3)": visible on Saturday when `!battleOnCooldown && defeated.length >= 3`; text "Bring two friends. Best of 3 rounds. Bigger wins, longer night." One button per crew: name, 🏆 when `storyFlags.crew_{id}_won`, `🔒 beat N solo` when `defeated.length < minDefeated`, right side `+$cash · +N fans`, desc. Disabled when locked or `energy < 30`.
| crew | members (mus/tec/ori/sho) | minDefeated | reward | flag on win |
|---|---|---|---|---|
| PEN PALS — "Pig Pen + 2 friends from his crew. Easy money if you survive." | Pig Pen 7/7/5/6, Ras-T 9/8/7/6, Kiko 8/7/9/7 | 3 | $80, 15 fans | — |
| VPN VETS — "Three veterans of the regional scene. Watch the throat kicks." | Klem 14/14/12/13, Niko-1 13/15/14/12, Boomer 15/12/13/14 | 5 | $200, 35 fans | `crewVpn` |
| WORLD CHAMPS — "Three names from the global circuit. Win this and you move continents." | Vex 26/27/24/25, Mir 28/24/26/26, TK-9 27/28/25/27 | 7 | $800, 120 fans | `crewChamps` |
- `resolveCrewBattle(c, crew)`: `ourTotal = mus+tec+ori+sho`; `moodMod = ((mood||50)-50)/4` (-12.5..+12.5; note mood 0 is treated as 50); `allyBoost = 5 + min(2, defeated.length)*3` (5, 8, 11); `ourPerRound = floor(ourTotal*0.6) + allyBoost`; per round i (member i): `ourRoll = ourPerRound + moodMod + (rand*20-10)`, `theirRoll = floor(theirTotal*0.7) + (rand*20-10)`, win if `ourRoll >= theirRoll`; **won = ourScore > theirScore** (3 rounds, majority). Returns `{rounds:[{our,their,win,theirMember}], won, ourScore, theirScore}`.
- `doCrewBattle(crew)`: guards 'Need 30 energy', sick 'Too sick to battle'. Effects: `passMinutes(90)`; `energy -= 30`; `mood = min(100, t.mood + (won ? +12 : -10))` (upper clamp only: a loss can push mood below 0); `cash += won ? reward.cash : floor(reward.cash*0.2)`; `followers = max(0, followers + (won ? reward.followers : -3))`; `xp += won ? 30 : 12`; `heat += 4`; `lastBattleDay = day`; `storyFlags[crew_${id}_won|lost] = true` and, on win, `reward.flag = true`; `checkLevelUp` only on win. Rewards are repeatable every week (flags never block).
- Cutscene (after 50 ms): speaker 'CREW BATTLE — WIN' (`#84cc16`) / 'CREW BATTLE — LOSS' (`#dc2626`); scene `drawCrewBattleScene(ctx,fc,lookFromChar(char),crew.name)`; lines `vs ${name}.`, then per round `Round i: WON|LOST vs ${member} · ${our}–${their}`, `Final: a–b.`, then win 'You took the building. Your crew is howling. Drinks tonight are free.' (no free drinks implemented) or loss 'You held your own. Not enough. Next round, next month.'
- Toast: win `Crew win! +${fans} fans, +$${cash}` (win); loss 'Crew loss · -3 fans, mood -10' (bad). Does not bump `battleWins`.
- DRAWN (`drawCrewBattleScene` [ext L8362-8408]): purple dim bar gradient, 5 amber stage lights with pulsing glow, dark stage edge, player (drawBeatboxer) + two generic coloured block allies on the left, three block/beatboxer opponents (red shirt) on the right, blinking amber "VS" bar, black banner with crew name in amber 8 px monospace.

## Rohzel panel + Friday booking (askRohzel)  (lines 15861-15896, 16345-16378)
- Panel "Rohzel · Bar Keeper" (every open night): `CharacterPortrait look={shirt:'#1c1917', skin:'#5a3a20', hair:'#0c0a09', style:'fade', accessory:null} size=64 active` (draws `drawBeatboxer` at 40x40 canvas, bobbing + mouth animating). Beside it: current line in quotes (italic, amber left border), two buttons "Friday gig?" (`askRohzel`) and "Just chatting" (`chatRohzel` -> random greeting), helper text "Need 50+ fans · 5+ open mics done · 1 show / week", and when booked a "✓ booked: friday HH:MM" line (amber). A `display:none` "Rohzel" name label is dead markup.
- Constants (inside component): `SHOWCASE_FANS_REQ = 50`, `SHOWCASE_OPEN_MICS_REQ = 5`, `FRIDAY_DOW = 4` (unused), `showcaseCooldownDaysLeft = lastShowcaseDay ? max(0, 7 - (day - lastShowcaseDay)) : 0`, `meetsBookingReqs` (computed, never used).
- `askRohzel()` order of checks (first match wins; only changes `rohzelLine` unless booking):
  1. `showcaseBooking` exists -> `ROHZEL_REMINDER(clockString(booking.minute))`
  2. on cooldown -> `ROHZEL_COOLDOWN`
  3. `followers < 50` -> `ROHZEL_NEED_FANS`
  4. `openMicCount < 5` -> `ROHZEL_NEED_OPEN_MICS`
  5. else book: `days = daysToNextFriday(day, minutes)`, `bookingDay = day + days`, `slot = pickShowcaseSlot(day, bookingDay, minutes)`, `showcaseBooking = {day: bookingDay, minute: slot}`, Rohzel says `ROHZEL_BOOKED_OK(clockString(slot))`, toast `Booked: Friday ${HH:MM}` (win).
- Cooldown timing: a showcase on Friday day D blocks booking until `day - D >= 7`, i.e. next Friday itself is allowed (and books *today* if asked before 20:00 (minutes < 840), else a week later).
- State: reads `followers, openMicCount, lastShowcaseDay, showcaseBooking, day, minutes`; writes `showcaseBooking`.

## Friday Showcase gig  (lines 15898-15953, 16204-16235; component 15482-15581)
- Panel "Friday Showcase" (only when `schedule.activity === 'showcase'`):
  - no booking: "No booking. Talk to Rohzel below — he runs the slot list."
  - booking on a later Friday: "You're booked Friday at HH:MM. Come back then."
  - booking day today, `minutesToGig > 30`: `Gig at HH:MM · ${ceil(minutesToGig/10)*10} game-min to go. Hang tight.` (the bar has no wait button — time must be passed by mingling, buying items, or leaving to do activities)
  - `inGigWindow = isBookingDay && -60 <= minutesToGig <= 30`: "⭐ ON DECK — HH:MM" + primary `READY FOR THE GIG 🔥 (-25⚡)` (disabled `energy < 25`, red "Need 25 energy").
- `missedGig = booking && (day > booking.day || (isBookingDay && minutesToGig < -60))` -> effect clears `showcaseBooking` and toast "Missed your showcase. Rohzel ain't happy." (bad). No other penalty; `lastShowcaseDay` is not set so you can re-book immediately.
- `startShowcaseGig()`: `minutes = booking.minute` (**time-skip forward up to 30 min or rewind up to 60 min**, no decay), `performingShowcase = true`. No sick check, no energy deduction until the end.
- `finishShowcaseGig({ totalTaps, distinctSounds })` scoring:
  - `baseReward = 30 + 3*sho + mus + tec`
  - `engagement = min(2, totalTaps/30)` (60+ taps = max, i.e. 3 taps/s over 20 s)
  - `variety = min(1.5, distinctSounds/4)` (needs 6 distinct sounds for max; only 4 hero pads at start -> variety 1.0)
  - `reward = round(baseReward * max(0.5, engagement) * max(0.7, variety))` — multiplier range 0.35 .. 3.0
  - `fans = max(2, floor(sho/2 + distinctSounds))`
  - Examples (sho,mus,tec = 5,5,5): base 55 -> $19 (idle: 0 taps, 0 sounds) .. $55 (4 sounds, 30 taps) .. $83 (4 sounds, 45 taps) .. $110 (4 sounds, 60 taps) .. $165 (6 sounds, 60 taps). (15,15,15): base 105 -> max $315. (25,25,25): base 155 -> max $465 (source comment claims ~$360 / ~$435 — comment is stale).
  - `setChar`: `wardrobe` +1 sho if gear; `t = passMinutes(c, 30)`; `cash += reward`, `followers += fans`, `energy -= 25` (min 0), `mood = min(100, t.mood + 18)`, `heat += 8`, `xp += 60`, `showcaseBooking = null`, `lastShowcaseDay = c.day`, `stats.sho += wardrobe`, `daily.showcases += 1`; `checkLevelUp(updated)`.
  - Toast (win): `Showcase: +$${reward} · +${fans} fans 🔥`; `setPerformingShowcase(false)`.
  - No cutscene, no phone messages, `storyFlags.firstShowcase` is **never set** (but read by festival eligibility and flashback `the_song`).
- Foxy hints keyed on the booking [ext L833-843]; bad-sleep reason 'showcase' (energyCap .65) when a booking is within a day [ext L342-343].

## Weekend Tour  (lines 16080-16149)
- Panel "Weekend Tour" shown when `followers >= 50` on **any** open or closed bar night (e.g. also Monday). Text "Two cities, one weekend. Bigger crowds. Bigger payday." Button `🚐 GO ON TOUR (-30⚡, +2 days)` (primary, disabled when on cooldown or `energy < 30`); on cooldown `🚐 ON THE ROAD COOLDOWN · ${daysLeft}d`; red "Need 30 energy" under it.
- Cooldown: `cooled = (day - (lastTourDay||0)) >= 7` (so with `lastTourDay=0` the first tour cannot happen before day 7); `daysLeft = max(0, 7 - (day - lastTourDay))`.
- `goTour`: `sho = stats.sho`; `fans = 6 + floor(sho/2) + floor(rand*6)` (6..); `cash = 60 + sho*4 + floor(rand*30)`. `setChar`: `day += 2`, `minutes = 0`, `cash += cash`, `followers += fans`, **`energy = floor(maxEnergy*0.7)`** (set, not subtract — a refill when below 70 %), `hunger = max(0, hunger-30)`, `mood = clamp(mood+8)`, `lastTourDay = c.day` (the departure day). `go('hood')`; after 100 ms a 3-beat cutscene: speaker 'WEEKEND TOUR' (`#fbbf24`):
  1. `drawTourRoadScene`: "Two days on the road. Two cities, two crowds." / "Sun going down behind the skyline. Speakers strapped tight."
  2. `drawTourMotelScene`: "Bus seats. Cheap motel. Better sound system than home." / "1:47am. Headphones on. Going through tomorrow's set one more time."
  3. `drawTourStageScene`: "Lights. Confetti. People who came just for you." / `+$${cash} · +${fans} fans · two days gone.`
- Skipped by the tour (since no sleep transition runs): daily counter reset/new daily challenge, weekly reset, `pendingDebuff` (carries over), rent on a skipped Sunday, morning random events, song/crew passive income, sickDay, apartment mood bonus, festival invite check, flashbacks. Also no `checkLevelUp`, no XP.
- DRAWN: road scene [ext L9130-9252]: sunset gradient sky, half-set sun, 16-building skyline silhouette with lit windows, asphalt with perspective lane stripes scrolling, telephone poles, a red tour van (cab, 3 windows) bouncing; motel scene [ext L9256-9410]: striped mustard wall, green carpet, window with night sky/stars and flickering neon "MOTEL" sign, gig gear; stage scene [ext L9414-9527]: truss + spotlights, 3 sweeping coloured cones (pink/amber/cyan), haze bands, headlining player, crowd with raised hands; each with 6-10 px black letterbox bars.

## Festival arc — BBBWC2027  (lines 15592-15633, 15981-16078)
State machine on `char.festivalState`: `null -> 'invited' -> 'prepping' -> 'choosing' -> 'done'`.
- Trigger (outside range): at the end of `finishSleep`, if `festivalEligible(next)` and not `storyFlags.festivalInviteSent` -> phone message from rohzel "festival people called.\nthey want you.\nsit down. let's talk." and `festivalState='invited'` [ext L13268-13274]. `festivalEligible`: `!festivalState && defeated.length >= 3 && (openMicCount + count of storyFlags key 'firstShowcase') >= 5 && mus,tec,ori,sho all >= 8 && day >= 25` [ext L690-695]. `FESTIVAL_PREP_DAYS = 14`. During 'prepping' training stat gains are x2 [ext L12806].
- **invited** panel "🌟 BBBWC2027": quote "Rohzel slides paperwork across the bar. / World championship. Three weeks to prepare. They want you." (note: says three weeks, game uses 14 days). Buttons: `ACCEPT THE INVITE ✓` -> `festivalState='prepping'`, `festivalAcceptedDay=day`; after 100 ms cutscene speaker 'ROHZEL' (`#22d3ee`) lines "good. fourteen days from today." / "training gives double the gains till then." / "don't waste it."; `NOT YET` -> toast 'Rohzel: come back when you decide.' (info).
- **prepping** panel "🌟 BBBWC2027 PREP": `daysIn = day - (festivalAcceptedDay||day)`, `daysLeft = max(0, 14 - daysIn)`; label `${daysLeft} day(s) to go · 2× training gains` or 'TONIGHT IS THE NIGHT' when 0; at 0 shows `GO TO BBBWC →` -> cutscene (speaker 'BBBWC2027', `#fbbf24`) "The room is bigger than anything you've played." / "Crew on the side. Sound check. Pick your path." and `festivalState='choosing'`.
- **choosing** panel "🌟 BBBWC2027 — PICK YOUR PATH": "Each path: one big show. Win or lose, the arc closes." Three buttons (disabled/locked ones greyed with 🔒):
  - A "Solo Battle Gauntlet" — "3 escalating opponents · highest cash · classic battle UI"
  - B "Collab with Crystix" — "duet showcase · highest fan gain"; requires `storyFlags.crystixMet` else lock text "Need to have met Crystix"
  - C "Solo Showcase" — "judges, no opponents · balanced reward"
  Clicking calls `runFestival(path)` — **no minigame, pure stat roll** (the descriptions overpromise).
- `runFestival(path)`: `total = mus+tec+ori+sho`; `winOdds = min(0.95, 0.25 + total/120)` (total 32 -> 52 %, 60 -> 75 %, >=84 -> 95 %); `won = rand < winOdds`; rewards: win cash A $600 / B $350 / C $450, lose $80; win fans A 100 / B 200 / C 130, lose 25; `energy = max(0, energy-50)`; `mood = clamp(mood + (won ? 30 : -10))`; `xp += won ? 200 : 80` (**no checkLevelUp**); `festivalState='done'`, `festivalPath=path`, `festivalResult='win'|'lose'`; `storyFlags.festivalPlayed = true` and (win) `festivalWon = true` (unlocks 'Champion White' outfit [ext L649]). Then `go('hood')` and after 100 ms cutscene: speaker `won ? 'YOU MADE IT' : 'YOU PLAYED'` (`#fbbf24` / `#a8a29e`); lines win: `You won ${pathName}.` / "The room held its breath. The room let it out as you finished." / `+$${cash} · +${fans} fans · the rest of your life feels different now.`; lose: `You played ${pathName}. The crowd was kind.` / "Some things you carry home aren't trophies." / `+$${cash} · +${fans} fans · you'll be back.` where pathName = 'the gauntlet'|'the collab'|'the showcase'. No time passes, no energy gate, no sick check.
- **done** panel "🌟 BBBWC2027 — done": "you played the festival. and you won." / "and you came home."
- Note: `'choosing'` is not in the `initialChar` comment's allowed list ('null | invited | prepping | done'), and the panel persists across visits.

## Mingle  (lines 15634-15639, 16161-16188; modal [ext L7438-7550], data [ext L1253-2030])
- Panel "Mingle" (non-Monday nights, day >= 5): "Read the room. Strike up a conversation. Sometimes you meet someone who matters." primary `MINGLE 🍻 (-6⚡, +30 min)` (disabled `energy < 6`; red "Need 6 energy"). Locked variant (day < 5): Panel "Mingle 🔒" with `CONTENT_UNLOCKS.mingle.label` = "You barely know the regulars yet. Day 5.".
- `startMingle`: `energy < 6` -> toast 'Too tired to chat'; `pickMingleEncounter(char, MINGLE_POOL)` (filter by each encounter's `when(char)`, then weighted-random by `weight`); `null` -> toast 'The bar is unusually quiet tonight.' (info); else `mingleEncounter = enc`.
- Modal `<MingleEncounter char setChar encounter showToast onClose />`: random beat of the encounter, stranger look, `drawMingleScene`, 2-3 reply options; on finishing: `applyMingleEffects` (mood/energy/hunger/cash/followers/flags/affinity -> auto `romanceState`: >=10 couple, >=5 romancing, else building; `bookDate` -> `dateBooking`), plus `passMinutes(30)`, `energy -= 6`, `mingleCount++`, `daily.mingles++`, `metEncounters[id]++`. Toasts for dates (`Date with ${name}: ${DAY} HH:MM · park`) and couple/getting-real.
- Pool = `MINGLE_GENERIC + MINGLE_PIGPEN + MINGLE_CRYSTIX + MINGLE_SPONSORS + MINGLE_ROMANCE + MINGLE_BAD` (see mingle inventory).
- No sick check.

## Closed (Monday)  (lines 16151-16159)
Panel "Closed": 🚪 + "No show tonight. Sleep it off and come back tomorrow." On Monday the Mingle, Rohzel and Bar Menu panels are hidden; the festival and tour panels still show.

## FloatingSound + range tail  (lines 16421-16445)
`FloatingSound({text, side, color='#D4A017'})`: absolutely positioned (left 15% for side 'P' else 55%, top 38%) uppercase Bebas Neue 2xl text with black outline, CSS animation `soundFloat 1.2s ease-out forwards`. Used by the battle screen (other inventory). Lines 16441-16445 are only the header comment of the "PIXEL BATTLE STAGE" section whose code (OPP_LOOKS etc.) starts at 16447.

---------------------------------------------------------------------------------------------------

# 5. DRAW SPECS (for artists) — everything is rectangles; no sprites/images in this range

Conventions: `_px(ctx,x,y,w,h,color)` = `fillRect(floor(x),floor(y),w,h)`. `fc` = frame counter at 60 fps. `PixelScene` canvases are 200x130 logical px drawn at scale 3 (600x390), `imageRendering: pixelated`, background cleared to #0c0a09 every frame; scene errors are caught once per message. Park animations are 140x90 logical at scale 4 (560x360). The player body used everywhere is `drawBeatboxer(ctx,x,feetY,look,facing,active,fc)` [ext L16468] — about 14x29 px: shadow, 2 legs (3x8, #1a1a2e, alternate bob when active), white shoes, 10x11 shirt with white collar line, 2x8 arms, hand+mic (#888/#aaa) on the facing side, 8x7 head, hair styles `short/mohawk/long/spike/fade`, blink every 120 frames, accessories `shades/glasses/cap/beanie/fedora/headphones`, 4-frame mouth cycle when active.

**Important artist/design finding:** the three park AFK animations (Busk/Jam/Run) take only `color` (= `char.color`, the shirt/hoodie colour) — skin is hard-coded `#d4a87a`, hair/hat/outfit/accessory are not shown. OpenMic/Nap/Sleep/cutscenes use `lookFromChar(char)` (outfit shirt, skin, hairColor, hairStyle, unlocked accessory).

## 5.1 BuskAnimation (140x90) [ext L2290-2530]
- Sky `_drawDaytimeSky(W, h=50)`: per-scanline gradient rgb(122,192,232) -> rgb(170,216,248).
- Sun top-right: three overlapping rects (118,8,10,10), (120,6,6,14), (116,10,14,6) in #fef3c7 + translucent glow circle r12 at (123,13).
- 2 clouds (blob of 12x3, 8x5, 4x6 whites + grey underside) drifting at 0.05 and 0.03 px/frame.
- 6 distant buildings (y30-60, greys #a8a4b8/#bcb8c8/#9ea0b8) with 5 window glints.
- Grass strip y56-64 (#5a8a3a, highlight row), trees at x=8 and x=132; sidewalk y64-90 (#b0a890) with edge stones and 4 speckles; unlit lamp post at x=15.
- Passerby: ~6x20 figure, 2-frame walk, 0.4 px/frame left->right, random shirt (#84cc16/#a78bfa/#fb7185/#22d3ee/#f97316), respawns when `frameCount > spawned*300`.
- Tip jar (88,70) 12x14, coins accumulate (max 8) with `rewardKey`, blinking "sign" above it every 30 frames.
- Busker at (60,78): bobbing legs, 10x11 shirt in `color`, 10x7 hood, arms, mic, 8x7 head (#d4a87a), blink, 4-frame mouth; 3 gold arc soundwaves marching right from x=74; "BOOM/TSS/KSH" 7 px monospace pop-ups every 25 frames while `block>0`; 3 coins arc into the jar per reward (gravity 0.08, ttl 60).
## 5.2 JamAnimation (140x90) [ext L5779-6019]
- Same sky/sun/clouds; 5 background trees; 18-person daytime crowd at y=40 (shirt colours red/green/orange/blue/pink, bobbing heads, every 3rd person raises arms); sunlit grass from y=50; elliptical dirt cypher circle centred (70,72) rx 52 ry 17 with outline and speckles.
- 4 members depth-sorted by y: player (70,64,scale 1.0, `color`), left (30,56,.85,#84cc16), right (110,56,.85,#fb7185), back (70,50,.75,#a78bfa). Each: legs, shoes, body 6s x 7s, hood 4s, head 5s (s = scale).
- Turn rotates every 240 frames (4 s): the active member bobs, raises a mic arm, mouth toggles, 3 gold expanding ring soundwaves; bottom-left label `▶ YOU|L1|R1|B1`; 8 coloured sparkles (gold, ice-blue, rose, violet) burst from the centre on reward.
## 5.3 RunAnimation (140x90) [ext L6023-6245]
- Three flat sky bands (#fde8a8 / #f5b070 / #9b6a8e), 4-layer sun at (95,20), purple mountains (slow parallax 0.3x), 7 mid trees (1x), brown path y60-90 with moving dashes at y=80, grass tufts (1.5x speed); `speed = active ? 1.5 : 0`.
- Runner at (50,70): 4-frame leg cycle every 4 frames, body bob, swinging arms, cap/hair, forward eyes, "o" mouth, sweat drops every 30 frames, 3 white motion lines behind; HUD text `X.XKM` at (4,9) = `rewards*0.5 + block*0.1`.
## 5.4 drawOpenMicStage (200x130) [ext L9888-9939]
Back wall (0,0,200,90) #1c1825 + top stripe #2a1f1a; 7 string lights at x=12+28i, y=6 (3x3, alternate #fbbf24/#fb7185, blink `(fc+11i)%60<50`); stage platform (30,86,140,18) #5a4030 with highlight row #7a5a40 and shadow row #3a2818; mic stand: pole (99,60,2,25), base (95,84,10,1), head (96,56,6,5); spotlight trapezoid polygon (80,0)-(120,0)-(140,86)-(60,86) alpha .07; `drawBeatboxer(100,86,'right',active)`; every 4th frame (2 on/2 off) a ring of 8 dots (radius 4+phase*1.6, shirt colour) around (100,70) fading with `wavePhase=(fc*0.35)%12`; 14 crowd silhouettes (10 wide, heights 14/18/22 cycling, dark head blocks, hands raised on i%3==1 intermittently). No vignette.
## 5.5 drawNapScene / drawSleepScene (200x130)
Documented in the PowerNap and SleepAnimation sections (couch 110x28 at (24,80); pillow (30,78,18,3); head (33,72,12,9); torso (45,73,32,8); pants (77,75,22,6); feet (99,72,5,3)). Shared body layout, so one reusable "sleeping on couch" prop covers both.
## 5.6 Cutscene backdrops fired from this range (all 200x130)
- `drawDateScene` [ext L9727]: daytime sky, sun top-left (18,8), cloud (100,12), grass from y=50, big tree (24-68,30-60) trunk (44,60,4,24), wooden bench (60-140, y78-106), player at x=84 and partner at x=116 sitting at seatY=92 (10x12 torso, 8x7 head, hair strip, eyes, small smile), 3 rising pink hearts (from (100,80), 60-frame life), 6 background crowd dots, 6 twinkling sparkles.
- `drawPigPenChallengeScene` [ext L9530]: daytime park, sun, 5 trees, 14-person crowd, dirt circle ellipse (100,106) rx80 ry18; `drawPigPen(ctx,138,110,fc,'smug')` on the right; the player is drawn with raw rects at x=60 (NOT `drawBeatboxer`): shirt 12x14, arms, head (62,89,8x11), hair, eyes, mouth, legs; red "!" shout marks blink every 30 frames at (122,76)/(119,70) and gold "heat lines" every 12 frames.
- `drawBjarneCypherScene` [ext L8226]: daytime park, sun top-left, trees, 14-person crowd (y=60), dirt circle (100,106) rx80 ry18, player centre (100,110) via `drawBeatboxer`, BeeAmGee (`drawBeeAmGee(ctx,168,88,fc)`) in the back with a pulsing grey halo circle (168,70) r18 when `fc%30<18`.
- `drawBjarneMeetingScene` [ext L8266]: dim bar wall (#1c1825) with dotted wallpaper, floor from y=95, stage edge (4,86,80,4) with mic stand at x=43, spotlight trapezoid left, player at (44,86) idle, BeeAmGee approaching at (138,110), two blinking amber "approach" dashes, 8 far crowd silhouettes.
- `drawCrewBattleScene` [ext L8362]: purple gradient wall, stage edge y=90, 5 pulsing stage lights (x=16+42i), player + 2 coloured block allies (lime #84cc16 and violet #a78bfa shirts) left, 2 block opponents (red #dc2626, rose #fb7185) + one red-shirt `drawBeatboxer` right, blinking gold "VS" bar at (96,70), black name banner (60,14,80,14) with the crew name in gold 8 px monospace.
- `drawTourRoadScene` [ext L9130]: sunset sky gradient (orange->violet, 70 px), half-set sun (144,56), 16-building skyline (heights 10-35, a few lit windows), asphalt y=72-130 with perspective lane stripes scrolling (`fc*4 % 28`), 4 telephone poles scrolling, red tour van (76x26 body, cab slope, 3 windows with the player's head bobbing in the middle, driver in cab, "TOUR" decal, headlight cone, tail light, spinning-spoke wheels, roof speaker case + duffel + mic case with strap, 3 exhaust puffs), top/bottom letterbox bars alpha .2.
- `drawTourMotelScene` [ext L9256]: mustard-brown striped wall, ugly green carpet, window with night sky, stars, rooftops and a flickering pink neon "MOTEL" sign (flicker 1.0 / 0.4 every 90 frames) casting a pink glow into the room; bed with tan blanket and open suitcase (red/green shirts, gold headphones); bedside table with lit lamp (glow circle r28); TV with random-pixel static + antennas on a dresser; player sitting on the bed edge with headphones, closed eyes, smirk; 3 gold music notes drifting up; wall clock reading "1:47"; letterbox alpha .3.
- `drawTourStageScene` [ext L9414]: dark venue, ceiling truss, 5 hanging spots, 3 sweeping coloured cones (pink/amber/cyan, `sin(fc*0.04)*14` sweep), haze bands, stage platform with 24 chasing front-lip lights, speaker stacks both sides, banner "LIVE / TOUR · NIGHT 2", 4 rows of crowd silhouettes with raised hands + 6 phone-screen dots, mic stand at (99,70), headlining `drawBeatboxer(86,92)`, 18 pieces of falling confetti (5 colours), pulsing lens flare circle (100,60) r28.
- `drawMingleScene` [ext L9833]: bar interior: two bottle shelves (top shelf 10 bottles 4 colours with glints, second shelf 8 bottles), bar counter y=96 with 3 tone rows, hanging amber lamp at (110,0) with glow r36, the stranger seated at x=116 (uses the shared `_drawSeatedAtBar(...,'player')` torso-only pose with the encounter's look), their drink (colour = `[amber,cyan,rose,lime][encounter.id.length % 4]`), the player's blue drink at x=60, vignette .2.

---------------------------------------------------------------------------------------------------

# 6. WORKED NUMBER TABLES (for balance parity tests)

## 6.1 Busk cash per reward (AFK, no bonus)
`floor(total/6) + {0,1,2}`: total 20 -> $3-5; 40 -> $6-8; 60 -> $10-12; 100 -> $16-18; 120 -> $20-22. Play mode with accuracy >= 0.8 doubles `floor(base*2)` (e.g. total 20: $6-10). Accuracy .5-.8: multiplier 1.0..1.5 linear. One reward = 50 AFK game-min; a day of 100 energy = 10 rewards.
## 6.2 Open mic fans (`clamp(floor(max(0,T-20)/25) + floor(S/8) + {0,1,2}, 1, 20)`, T = total of 4 stats, S = sho)
| T | S | fans |
|---|---|---|
| 20 | 5 | 1 (67 %) or 2 (33 %) |
| 40 | 10 | 1-3 |
| 60 | 15 | 2-4 |
| 80 | 20 | 4-6 |
| 100 | 25 | 6-8 |
| 120 | 30 | 7-9 |
| 160 | 40 | 10-12 |
| 300 | 75 | 20 (cap; raw 20-22) |
"Good show" (parent/unknown-fan texts) needs fans >= 5; "bad show" (hate text) fans <= 1.
## 6.3 Showcase cash (`base * max(.5,min(2,taps/30)) * max(.7,min(1.5,distinct/4))`, base = 30+3*sho+mus+tec)
| stats (sho=mus=tec) | base | idle 0/0 | casual 20 taps/4 snd | 30 taps/4 snd | 45 taps/5 snd | 60 taps/6 snd (max) |
|---|---|---|---|---|---|---|
| 5 | 55 | 19 | 37 | 55 | 103 | 165 |
| 10 | 80 | 28 | 53 | 80 | 150 | 240 |
| 15 | 105 | 37 | 70 | 105 | 197 | 315 |
| 25 | 155 | 54 | 103 | 155 | 291 | 465 |
Fans = `max(2, floor(sho/2 + distinct))` (sho 5, 4 sounds = 6; sho 10, 6 sounds = 11; sho 25, 8 sounds = 20). XP is a flat 60, heat +8, mood +18, energy -25, time +30.
## 6.4 Karaoke challenge (`skill = mus + floor(sho/2)`, per-round P = clamp((12 - max(0, target - skill + 4))/12, 0, 1), targets 5/11/17)
| skill | P(r1) | P(r2) | P(r3) | P(0 rounds) | P(1) | P(2) | P(3) |
|---|---|---|---|---|---|---|---|
| 7 (start 5/5) | .83 | .33 | 0 | .17 | .56 | .28 | 0 |
| 12 | 1.0 | .75 | .25 | 0 | .25 | .56 | .19 |
| 17 | 1.0 | 1.0 | .67 | 0 | 0 | .33 | .67 |
| 21+ | 1 | 1 | 1 | 0 | 0 | 0 | 1 |
Payouts by rounds won (0/1/2/3): cash `14*rounds + 0..7` (0-7 / 14-21 / 28-35 / 42-49); fans 0/1/1/5; mus +1/+1/+2/+2 (and +1 sho always); time 30/40/50/60 min; xp 8/12/16/20; mood -4/+6/+6/+14; energy -24 flat.
## 6.5 Crew battle round odds
Per round: `our = floor(0.6*T) + allyBoost + moodMod`, `their = floor(0.7*theirTotal)`; both get U(-10,10). With `s = our - their`: P(win round) = `1 - (20-s)^2/800` for `0<=s<=20`, `(20+s)^2/800` for `-20<=s<0`, 1 if `s>20`, 0 if `s<-20`. Match won with >= 2 of 3 rounds. `allyBoost` = 5 / 8 / 11 for 0 / 1 / >=2 defeated (crews need >= 3 so 11 in practice). `moodMod = (mood-50)/4`.
Example T=40, defeated>=3, mood 70 (+5): our = 24+11+5 = 40. PEN PALS (their 17/21/21) ~ certain; VPN VETS (their 37/37/37) s=3 -> .64/round -> .70 match; WORLD CHAMPS (their 71/72/74) -> 0 (impossible until `our >= ~52`, i.e. T >= ~60 at ally 11 / mood 70).
Theirs: PEN PALS total 25/30/31 -> 17/21/21; VPN VETS 53/54/54 -> 37/37/37; WORLD CHAMPS 102/104/107 -> 71/72/74.
## 6.6 Festival win odds (`min(.95, .25 + T/120)`)
T 20 -> 42 %; 32 -> 52 %; 40 -> 58 %; 60 -> 75 %; 80 -> 92 %; >= 84 -> 95 %. Eligibility requires all four stats >= 8 (T >= 32), so the minimum possible odds are ~52 %. Payouts: win A $600/100 fans, B $350/200 fans, C $450/130 fans (xp 200, mood +30); loss $80/25 fans (xp 80, mood -10); energy -50 either way.
## 6.7 Tour payouts
Fans `6 + floor(sho/2) + {0..5}`; cash `60 + 4*sho + {0..29}`. sho 5: 8-13 fans, $80-109; sho 15: 13-18 fans, $120-149; sho 30: 21-26 fans, $180-209.
## 6.8 Bar-menu net effect examples (immediate, then hangover at next sleep)
Energy drink: +45 energy now, -25 next morning (net +20 energy, 3 drinks = +135 now, -75 tomorrow, energy clamp at maxEnergy). Cocktail: +30 mood/+12 energy now; -18 mood/-8 energy tomorrow. Whiskey: +22/+8 now, -22 mood tomorrow. Wings: +18 hunger/+12 mood, -10 hunger tomorrow. Fries: +28 hunger/+6 mood/+6 energy, -12 hunger tomorrow. Each order costs 5 game-min and applies mood decay for those 5 min.

---------------------------------------------------------------------------------------------------

# 7. INDEXES (what is visible when; every button; every toast)

## 7.1 Bar panels by weekday (rows = panel, `x` = rendered)
| panel | Mon | Tue | Wed | Thu | Fri | Sat | Sun | extra gate |
|---|---|---|---|---|---|---|---|---|
| Festival invite / prep / choose / done | x | x | x | x | x | x | x | `festivalState` |
| Weekend Tour | x | x | x | x | x | x | x | followers >= 50 |
| Closed | x | | | | | | | — |
| Mingle (or locked 🔒) | | x | x | x | x | x | x | day >= 5 to be usable |
| Open Mic Sign-Up | | x | x | x | | | | — |
| Friday Showcase | | | | | x | | | booking state |
| Battle cooldown / Choose opponent / vs panel | | | | | | x | | `lastBattleDay` |
| Crew Battle (3v3) | | | | | | x | | defeated >= 3, no cooldown |
| Karaoke Night | | | | | | | x | — |
| Rohzel · Bar Keeper | | x | x | x | x | x | x | — |
| Bar Menu | | x | x | x | x | x | x | — |
Bar nights (all) require `minutes >= 720` and (via Hood) `day >= 3`.
## 7.2 Park screen buttons
| button | where | enabled when | effect |
|---|---|---|---|
| 💕 MEET {NAME} (+1 hr) | Date panel | `dateBooking.day === day` and no activity running | goOnDate |
| Busk / Jam Session / Go Running card | Activities panel | gate table above | `selected=key; pendingStart=true` -> `activity.start()` |
| ▶ PLAY RHYTHM (bonus tips) / ◀ AFK MODE | busk in-progress | always while busking | toggle `playMode`; `accuracyRef=0` |
| ▶ SPRINT MODE (build max ⚡ energy) / ◀ AFK MODE | run in-progress | always while running | toggle `playMode`; reset `runBlockRef` |
| STOP ■ | in-progress | always | `activity.stop('Stopped early')` |
| ← BACK TO HOOD | night lock | always | `go('hood')` |
RhythmTap has its own 3 lane buttons (BOOM/TSS/KSH) and RunTracker its LEFT/RIGHT pads (A/D or arrow keys also work).
## 7.3 Bar screen buttons
| button label | panel | enabled | effect |
|---|---|---|---|
| ← BACK TO HOOD | day lock | — | `go('hood')` |
| ACCEPT THE INVITE ✓ | festival invited | — | prepping + cutscene |
| NOT YET | festival invited | — | info toast |
| GO TO BBBWC → | festival prep, daysLeft==0 | — | cutscene + `festivalState='choosing'` |
| A / B / C path buttons | festival choosing | B needs `crystixMet` | `runFestival(path)` |
| 🚐 GO ON TOUR (-30⚡, +2 days) | tour | `!onCooldown && energy >= 30` | `goTour` |
| MINGLE 🍻 (-6⚡, +30 min) | mingle | `energy >= 6` | `startMingle` |
| TAKE THE MIC 🎤 (-10⚡, +30 min) | open mic | `energy >= 10` | `doOpenMic` |
| READY FOR THE GIG 🔥 (-25⚡) | showcase on deck | `energy >= 25` | `startShowcaseGig` |
| opponent rows (7) | battle | unlocked sequentially | `setSelected(n)` |
| START BATTLE 🎤 (-30⚡) | vs panel | `energy >= 30 && equipped.length > 0` | `go('battle')` + `_opponent` |
| crew rows (3) | crew | `defeated >= minDefeated && energy >= 30` | `doCrewBattle(crew)` |
| GRAB THE MIC 🎶 (-8⚡, +30 min) | karaoke | `energy >= 8` | `doKaraoke` |
| KARAOKE CHALLENGE 🏆 (-24⚡) | karaoke | `energy >= 24` | `doKaraokeChallenge` |
| Friday gig? | Rohzel | always | `askRohzel` |
| Just chatting | Rohzel | always | new greeting |
| $N (per menu item, 5) | Bar Menu | `cash >= cost` | `orderItem(id)` |
| (MingleEncounter reply options) | modal | — | see mingle inventory |
## 7.4 Toast catalogue (text, type)
Park: `+$N[ +1 fan][ (X% bonus!)]` win; `+1 Musicality|Technicality|Originality, +N fans` win; `+N Showmanship[ (+1 bonus)]` / `+N Showmanship · 🔥 -N energy (burnout)` win; '💪 Max Energy +1' win; `You stood X up. -10 mood.` bad; blocked-activity `Too sick · Rest until tomorrow`, `Too tired · Power nap on the couch`, `Too hungry · Eat in the kitchen`, `Too grumpy · Watch TV or take a walk` (bad); engine: 'Too tired to start!', 'Too sick to do anything today', 'You collapsed from exhaustion', 'Too hungry to keep going', 'It got too late — heading home', 'The sun is setting — park is emptying out', 'Stopped early'.
Bar: 'Too tired to chat'; 'The bar is unusually quiet tonight.' (info); 'Not enough cash'; `Drank|Ate ${name}` (win); 'Too tired to perform'; 'Too sick to perform tonight'; `Open mic done · +N new fans 🎤` (win); 'Need 30 energy'; 'Too sick to battle'; `Crew win! +N fans, +$N` (win) / 'Crew loss · -3 fans, mood -10' (bad); 'Too tired to sing'; 'Lost your voice — call it a night'; `Karaoke: +N musicality, +$N` (win); 'Need 24 energy for the challenge'; `Karaoke 3-streak! +$N, +5 fans` (win) / `Karaoke N/3 · +$N` (win) / 'Choked on round 1' (bad); `Booked: Friday HH:MM` (win); "Missed your showcase. Rohzel ain't happy." (bad); `Showcase: +$N · +N fans 🔥` (win); 'Rohzel: come back when you decide.' (info).
Nap/sleep (outside range): 'Too hungry to nap — eat something first!', 'Too hungry to sleep — eat something first!', '2 AM — got booted off the couch' (info), 'Napped — feeling sharper' (win).
## 7.5 Worked evening timelines
**Friday showcase night (day 11, followers 80, openMics 6, no cooldown):** 18:00 arrive (minutes 720) -> "Friday gig?" -> `daysToNextFriday(11, 720)` = 0 (since 720 < 840) -> `bookingDay = 11`, slot random among slots `> 750` -> e.g. 22:00 (960). Panel says `Gig at 22:00 · 240 game-min to go. Hang tight.` Player mingles twice (+60 min, -12 energy), buys wings (+5), waits... At minutes >= 930 (21:30, 30 min before) the READY button appears. Tap -> clock jumps to 960 (22:00) -> 20 s pad session -> `+30 min` -> 22:30.
**Asking after 20:00 on Friday (minutes >= 840):** books next Friday (day 18): `Booked: Friday HH:MM` where the slot is random over all 10. Between, the Friday Showcase panel on day 11 shows "You're booked Friday at HH:MM. Come back then."
**Missed gig:** booking day 11, arrive at 23:45 for a 22:00 slot (minutesToGig -105 < -60) -> `missedGig` -> booking cleared + bad toast; Rohzel must be asked again (cooldown unaffected).
**Open mic night (Thursday day 3, 100 energy, stats 5/5/5/5):** TAKE THE MIC -> ~8 s sequencer playback ("ROUTINE 1/2 · Boom Bap", "ROUTINE 2/2 · 4 on Floor" if no saved beats) -> +1-2 fans, +8 xp, -10 energy, 19:00 -> 20:00, first-ever: cutscene "Hot lights. A mic. Forty strangers staring back."
**Date:** Mingle ask-out (affinity >= 5) sets `dateBooking{day: today+2, minute: 600}`; visit Park on that day (daytime) -> Date panel -> 3-line cutscene on the bench -> +3 affinity, +18 mood, +1 h.

---------------------------------------------------------------------------------------------------

# 8. State read/written cheat-sheet (fields on `char`)
| field | read by | written by |
|---|---|---|
| minutes | everything (locks, gig window) | useActivity tick (+10/+3), passMinutes callers (+5 order, +30/+60/+90/…), goOnDate +60, startShowcaseGig (set), tour (0), nap |
| energy / maxEnergy | all gates | tick drains, burn surcharge, bar actions, maxEnergy +1 (cap 150) |
| hunger | park gates, tick stop, nap/sleep refusal | tick, menu, tour -30 |
| mood | park gates, crew battle | tick, rewards, menu, performances |
| cash | menu, tour | busk, menu, karaoke, crew, showcase, tour, festival |
| followers | tour gate, Rohzel gate, fan gains | busk, jam, open mic, showcase, crew, karaoke challenge, tour, festival |
| xp / level | – | rewards (some without checkLevelUp) |
| stats.mus/tec/ori/sho | formulas | jam (+1 random of mus/tec/ori), run (+sho), karaoke (+mus/+sho), wardrobe +sho |
| storyFlags | cutscene gates | firstBusk, jamCount, firstJam, pigPenChallenged, bjarneCypherSighting, fatboxgVisit, firstOpenMicDone, bjarneIntroduced, crew_{id}_won/lost, crewVpn, crewChamps, festivalPlayed, festivalWon |
| sickDay | all gates | (elsewhere) |
| dateBooking / romanceAffinity / romanceState | park date | park date, mingle |
| showcaseBooking / lastShowcaseDay / openMicCount | Rohzel, gig | askRohzel, gig, open mic |
| pendingDebuff | menu warning | menu (stack), sleep (consume) |
| lastBattleDay / defeated | battle panels | crew battle, BattleScreen |
| lastTourDay | tour | tour |
| festivalState / festivalAcceptedDay / festivalPath / festivalResult | festival panels | invite accept, GO TO BBBWC, runFestival |
| heat | – (never read) | open mic +2, crew +4, showcase +8, [ext L12504 +2] |
| daily.* | challenges | busks/jams/runs (bumpDaily), openMics, showcases, mingles (direct) |
| oriSlots / oriBpm / name / sounds | OpenMicPerformance, ShowcasePerformance | – |
| gear.wardrobe_refresh / premium_shoes | open mic, showcase / run | – |
| messages | – | open mic (parents, unknown) via `addMessage` [ext L914] |

---------------------------------------------------------------------------------------------------

# 9. Constants quick reference
- Park: blocksPerReward 5; AFK tick 500 ms / 10 game-min; play tick 2500 ms / 3 game-min; play energy x0.4, hunger x0.5; gates: energy >= 3 ticks of cost (6/6/9), hunger >= 15 and mood >= 15 (jam/run); park closes at minutes 720; busk base `floor(total/6)+0..2`, mult 1..2 at acc .5/.8, fan 40 % (100 % at acc >= .8), xp 6; jam xp 8, fans 1-3, +1 random of mus/tec/ori; run xp 5, mood +4, sho +1 (+1 sprint good block, +1 premium_shoes), burn energy = round(8*burnRatio); maxEnergy +1 per 3 good sprint bars, cap 150; date: +3 affinity, +18 mood, +60 min; stand-up -10 mood, -2 affinity.
- Open mic: -10 energy, +60 min, +5 mood, +8 xp, +2 heat, fans = clamp(floor(max(0,total-20)/25)+floor(sho/8)+rand0..2, 1, 20), replay 2 patterns x2 reps @ (oriBpm+20) BPM.
- Karaoke: easy $4-8, mus +1 (25 % +2), -8 energy, +30 min, +6 mood, +5 xp; challenge targets 5/11/17, roll skill-4..skill+7, -24 energy, 30+10*rounds min.
- Crew battle: -30 energy, +90 min, win +12 mood/+30 xp, lose -10 mood/+12 xp/-3 fans/20 % cash; shared 7-day battle cooldown.
- Showcase: 50 fans, 5 open mics, slots 20:00-00:30 / 30 min, window [-60,+30] min, 20 s pads, -25 energy, +30 min, +18 mood, +60 xp, +8 heat, 7-day cooldown.
- Festival: 14 prep days, odds min(.95, .25+total/120), -50 energy, rewards by path above.
- Tour: >= 50 fans, 7-day cooldown, +2 days, energy set to 70 % of max, -30 hunger, +8 mood, cash 60+4*sho+0..29, fans 6+floor(sho/2)+0..5.
- Bar menu: see table; each order +5 min; debuffs stack until next sleep.
- Nap: 1500 ms real per game-hour, +12 energy/h, -3 hunger/h, +2 mood/h, max 02:00. Sleep animation 4000 ms.

---------------------------------------------------------------------------------------------------

# 10. REBUILD NOTES (Phaser + TypeScript)

## Pure logic modules (no DOM/React)
- `time.ts`: `clockString`, `isDay/isNight`, `dayOfWeek`, `passMinutes`, mood-drain function.
- `activity.ts`: generic `tickActivity(char, cfg, rng) -> {char, rewardDue, stopReason}` replicating `useActivity` (energy/hunger/mood/stop rules). Keep `tickMinutes`/`tickRealMs` as config so Phaser can run it from a scene timer or accumulate `dt`.
- `park.ts`: `ACTIVITIES` table, `entryGate(char,key)`, `buskReward(char, acc, rng)`, `jamReward(char, rng)` (+ `jamCutsceneTriggers(char, nextJamCount)` returning an ordered LIST so several can queue instead of overwriting), `runReward(char, block, isPlayMode, gear)`, `dateArrive(char)`, `dateStandUp(char)`.
- `bar.ts`: `BAR_SCHEDULE`, `BAR_MENU`, `orderItem(char,id)`, `openMicFans(stats,rng)`, `finishOpenMic`, `karaoke`, `karaokeChallenge(char, rng)` (return per-round log for the UI — the original never shows it), `resolveCrewBattle`, `crewBattle`, `tourEligible/goTour`, `festival` state machine + `runFestival`, `askRohzel(char, rng)` -> `{lineKey, booking?}`.
- `showcase.ts`: `SHOWCASE_SLOTS`, `daysToNextFriday`, `pickShowcaseSlot`, `showcaseWindow(booking, minutes)`, `scoreShowcase(taps, distinct, stats)`, `finishShowcase`.
- `rohzelLines.ts`: the six arrays above.
- `nap.ts`/`sleep.ts`: `finishNap(char, finalMinutes)` and the morning pipeline (owned by another inventory).
- All RNG injected (`rng: () => number`) so tests can pin outcomes. All randomness in this range: `Math.random()` only.

## Phaser scene equivalents
- `ParkScene`: HUD + 3 big activity cards (gate text identical) + optional date card; on start swap to `ParkActivityScene(key, mode)`. AFK variants = animated backdrops (Busk/Jam/Run) drawn with the ported `_px` routines to a RenderTexture (or replace with art), `RhythmTap` -> Phaser lane game, `RunTracker` -> alternating tap gauge.
- `OpenMicScene`: stage backdrop + step scheduler on the AudioContext clock; emit `complete` ~700 ms after the 64 steps.
- `ShowcaseScene`: 20 s pad grid (up to 13 pads, 4 columns) with press flashes.
- `BarScene`: render the panel list from a function `barPanels(char) -> Panel[]` (pure) so weekday logic is testable; modal sub-scenes for MingleEncounter and cutscenes.
- `NapScene` / `SleepScene`: use scene timers with the constants above.
- Cutscene driver must support a QUEUE (open mic first-time + BeeAmGee, jam pig pen + bjarne + fatboxg) instead of overwriting.

## Data to port verbatim
Rohzel lines (section 2), BAR_SCHEDULE, BAR_MENU, SHOWCASE_SLOTS, cutscene line sets, CREWS (data in `[ext L103-140]`), toast strings.

## Cross-system hooks fired by this range (what else the rebuild must provide)
- **Sound unlocks** (via `checkLevelUp`): `inward_k` at `storyFlags.jamCount >= 3`; `fast_hats` at `openMicCount >= 5`; (not in range but fed by it) `throat_kick` needs Pig Pen win after the park challenge cutscene.
- **Cosmetic unlock:** accessory `cap` "Snapback" at 5 open mics [ext L667]; outfit 'Champion White' at `festivalWon` [ext L649].
- **Achievements fed:** open_mic_newcomer (1 open mic), mic_veteran (10), crystix ("Bro from the Forum") indirectly via mingle.
- **Foxy tips** react to: `showcaseBooking`, `openMicCount` 0 / 1-2, `followers < 5`, `followers >= 30 && openMicCount >= 5 && !rohzelFridayOffer` ("the bartender's been asking about you. go see him.").
- **Sleep quality** reacts to: booked showcase within a day (energy cap .65), big night debuffs (`pendingDebuff.energy <= -10`).
- **Challenges:** daily `busks_2`, `jams_3`, `runs_1`, `openmic_1`, `mingle_2`, `showcase`; weekly `wk_busks_10`, `wk_jams_15`, `wk_runs_4` (only these three get weekly credit from this range).
- **Training elsewhere** doubles gains while `festivalState === 'prepping'` [ext L12806].
- **Phone/messages** (`addMessage`): parents (`goodShow`), 'unknown' fan/hate, rohzel festival text.
- **Battle screen contract:** `char._opponent = NPC` + `go('battle')`; BattleScreen sets `lastBattleDay` and returns to 'bar' [ext L18420-18451].

## Cutscene / dialogue strings to port (single table; speaker | color | scene | lines)
```
firstJam            | —            | none                       | You stand in the circle. / Strangers, all of them. None of them care where you slept last night. / Maybe this is what you needed.
pigPenChallenged    | PIG PEN #fb7185 | drawPigPenChallengeScene | yo. you. new face. / you sound like you been practicing in a closet. / saturday. bar. you and me. / don't bring a friend. you'll need 'em on the way home.
bjarneCypherSighting| —            | drawBjarneCypherScene      | Someone's standing at the back of the cypher. / Gray beard. Leather jacket. Doesn't perform. / He nods once when you finish your round. Then he's gone. / ...who was that?
fatboxgVisit        | —            | none                       | The circle goes quiet mid-round. / Heads turn. Someone you know from the videos just stepped into the cypher. / They throw a 30-second flurry that nobody can answer. Then they're gone, walking off with two friends. / Someone whispers their name. You pretend you weren't watching. / There's a long way to go.
(date, no flag)     | {partner} {color} | drawDateScene          | you came. / i wasn't sure if you would. / ...this is nice.
firstOpenMicDone    | —            | none                       | Hot lights. A mic. Forty strangers staring back. / The room exhales when you do. Whatever happens here, it counts. / You held the room. Even just for a minute.
bjarneIntroduced    | BEEAMGEE #a3a3a3 | drawBjarneMeetingScene | saw you in the cypher last week. / you've got something. raw. unfinished. but something. / name's BeeAmGee. been at this thirty years. / come find me when you're ready. studio. fifty bucks. i'll show you what i know.
(crew result)       | CREW BATTLE — WIN #84cc16 / LOSS #dc2626 | drawCrewBattleScene | vs {crew}. / Round i: WON|LOST vs {member} · {our}–{their} (x3) / Final: a–b. / [win] You took the building. Your crew is howling. Drinks tonight are free. [loss] You held your own. Not enough. Next round, next month.
(festival accept)   | ROHZEL #22d3ee | none                     | good. fourteen days from today. / training gives double the gains till then. / don't waste it.
(festival go)       | BBBWC2027 #fbbf24 | none                    | The room is bigger than anything you've played. / Crew on the side. Sound check. Pick your path.
(festival result W) | YOU MADE IT #fbbf24 | none                  | You won {the gauntlet|the collab|the showcase}. / The room held its breath. The room let it out as you finished. / +${cash} · +{fans} fans · the rest of your life feels different now.
(festival result L) | YOU PLAYED #a8a29e | none                   | You played {path}. The crowd was kind. / Some things you carry home aren't trophies. / +${cash} · +{fans} fans · you'll be back.
(tour beat 1)       | WEEKEND TOUR #fbbf24 | drawTourRoadScene    | Two days on the road. Two cities, two crowds. / Sun going down behind the skyline. Speakers strapped tight.
(tour beat 2)       | WEEKEND TOUR | drawTourMotelScene           | Bus seats. Cheap motel. Better sound system than home. / 1:47am. Headphones on. Going through tomorrow's set one more time.
(tour beat 3)       | WEEKEND TOUR | drawTourStageScene           | Lights. Confetti. People who came just for you. / +${cash} · +{fans} fans · two days gone.
```
Other literal UI strings: park night lock, bar day lock, Closed panel, panel titles/hints already quoted in their sections; festival invite quote "Rohzel slides paperwork across the bar. / World championship. Three weeks to prepare. They want you."

## Suggested TypeScript surface (framework-free)
```ts
// core types
export type Rng = () => number;                       // inject Math.random / seeded
export interface Stats { mus: number; tec: number; ori: number; sho: number }
export interface Char { day: number; minutes: number; energy: number; maxEnergy: number; hunger: number;
  mood: number; cash: number; followers: number; xp: number; level: number; stats: Stats; sickDay: number;
  gear: Record<string, boolean>; storyFlags: Record<string, boolean | number>;
  daily: Record<string, number>; weekly: Record<string, number>;
  defeated: string[]; equipped: string[]; sounds: string[]; oriSlots: Pattern[] | null; oriBpm: number;
  openMicCount: number; mingleCount: number; heat?: number;
  showcaseBooking: { day: number; minute: number } | null; lastShowcaseDay: number | null;
  lastBattleDay: number | null; lastTourDay: number;
  pendingDebuff: { energy?: number; mood?: number; hunger?: number } | null;
  dateBooking: { partner: string; partnerName: string; partnerColor: string; day: number; minute: number } | null;
  romanceAffinity: Record<string, number>; romanceState: Record<string, 'building' | 'romancing' | 'couple'>;
  festivalState: null | 'invited' | 'prepping' | 'choosing' | 'done'; festivalAcceptedDay: number;
  festivalPath: 'A' | 'B' | 'C' | null; festivalResult: 'win' | 'lose' | null; }
export type CutsceneRef = { id: string; flag?: string; speaker?: string | null; color?: string; scene?: SceneId; lines: string[] };
export interface Outcome { char: Char; toasts: { text: string; kind: 'win' | 'bad' | 'info' }[]; cutscenes: CutsceneRef[]; }

// time.ts
clockString(m: number): string; isDay(m: number): boolean; isNight(m: number): boolean; dayOfWeek(day: number): 0|1|2|3|4|5|6;
passMinutes(c: Char, n: number): { minutes: number; mood: number };

// park.ts
type ParkKey = 'busk' | 'jam' | 'run';
parkGate(c: Char, key: ParkKey): { reason: string; hint: string } | null;
parkTickConfig(key: ParkKey, playMode: boolean): { energy: number; hunger: number; mood: number; tickMs: number; tickMin: number };
tickActivity(c: Char, cfg, stopWhenNight: boolean): { char: Char; rewardDue: boolean; stop?: string };  // 5 ticks => reward
buskReward(c: Char, accuracy: number, rng: Rng): Outcome;
jamReward(c: Char, rng: Rng): Outcome;                // returns ALL qualifying story cutscenes in order
runReward(c: Char, last: { avg: number; isGood: boolean; burnRatio: number } | null, sprint: boolean): Outcome;
dateMeet(c: Char): Outcome;  dateStandUp(c: Char): Outcome | null;

// bar.ts
BAR_SCHEDULE; BAR_MENU;
barPanels(c: Char): PanelModel[];                     // pure, weekday-driven list of what to render
orderItem(c: Char, id: string): Outcome;
openMicFans(stats: Stats, rng: Rng): number;  finishOpenMic(c: Char, rng: Rng): Outcome;
karaoke(c: Char, rng: Rng): Outcome;  karaokeChallenge(c: Char, rng: Rng): Outcome & { rounds: { target: number; roll: number; ok: boolean }[] };
resolveCrewBattle(c: Char, crew: Crew, rng: Rng): CrewResult;  crewBattle(c: Char, crew: Crew, rng: Rng): Outcome;
goTour(c: Char, rng: Rng): Outcome;  tourStatus(c: Char): { available: boolean; daysLeft: number };
festivalAccept(c: Char): Outcome; festivalGo(c: Char): Outcome; runFestival(c: Char, path: 'A'|'B'|'C', rng: Rng): Outcome;
askRohzel(c: Char, rng: Rng): { lineSet: 'reminder'|'cooldown'|'needFans'|'needOpenMics'|'booked'; line: string; booking?: {day:number;minute:number}; toast?: string };

// showcase.ts
SHOWCASE_SLOTS: number[]; daysToNextFriday(day: number, minutes: number): number; pickShowcaseSlot(day: number, bookingDay: number, minutes: number, rng: Rng): number;
showcaseWindow(b: {day:number;minute:number}, c: Char): 'none'|'later'|'waiting'|'onDeck'|'missed';
scoreShowcase(stats: Stats, taps: number, distinct: number): { cash: number; fans: number };
finishShowcase(c: Char, taps: number, distinct: number): Outcome;
buildPads(sounds: string[]): string[];                // 4 hero + unlocked non-default catalog sounds
```
## Suggested unit tests (deterministic with injected rng; values from the tables above)
- `daysToNextFriday`: (day 1 Tue,*) = 3; (day 3 Thu) = 1; (day 4 Fri, 839) = 0; (4, 840) = 7; (day 5 Sat) = 6; (day 6 Sun) = 5; (day 7 Mon) = 4.
- `pickShowcaseSlot` same-day: minutes 700 -> any of 10; minutes 830 -> excludes 840 (840 > 860 false) so 870..1110 only.
- `scoreShowcase`: stats 5/5/5, taps 0, distinct 0 -> cash 19, fans 2; taps 60, distinct 6 -> cash 165, fans max(2, floor(2.5+6)) = 8.
- `openMicFans`: T=20,S=5 with rng .0/.5/.99 -> 1/1/2; T=300,S=75 -> 20 (cap).
- `karaokeChallenge`: skill 7 with rolls pinned to the maximum (r=11 -> roll 14) -> round1 ok (14>=5), round2 ok (14>=11), round3 fail (14<17) => 2 rounds, cash 28+x, fans 1, mus +2, sho +1, time 50.
- `resolveCrewBattle`: pin both noises to 0 -> deterministic comparison of `floor(.6T)+ally+moodMod` vs `floor(.7*theirTotal)` for each crew.
- `runFestival`: odds boundaries 0.4167 (T=20) .. 0.95; win payout table per path; `festivalState === 'done'`.
- `buskReward`: acc .49 -> mult 1; acc .5 -> 1; acc .65 -> 1.25; acc .79 -> 1.483; acc .80 -> 2.0; fans always 1 at acc >= .8.
- `orderItem`: two energy drinks -> `pendingDebuff.energy = -50`; clamp immediate energy at maxEnergy; cash check.
- `parkGate`: energy 5 -> 'Too tired' for busk/jam (cost 2 -> need 6); energy 8 -> run 'Too tired' (need 9); hunger 14 blocks jam/run only; mood 14 blocks jam/run only; sick beats everything.
- `tickActivity`: busk AFK from energy 1 -> stops with 'You collapsed from exhaustion' only when `energy - 2 < 2`; minutes crossing 720 stops with the sun message; reward after exactly 5 ticks.
- `dateStandUp`: `booking.day < day` -> mood -10, affinity -2 (floored 0), booking cleared.

## Art/asset shopping list for the Phaser rebuild (derived from the draw specs)
1. Park backdrop (day) with busker spot, jar, cypher circle, running path (parallax layers: sky, mountains, trees, path, grass).
2. Player busk/jam/run sprites that honour skin/hair/outfit (the current AFK scenes ignore them).
3. Stage backdrop for open mic + showcase (platform, string lights, spotlight cone, crowd rows); currently showcase has none.
4. Couch/apartment sleep & nap scene with day-night window and a wall clock (shared by two scenes).
5. Bar interior (bottle shelves, counter, lamp) reused by mingle and several cutscenes.
6. Rohzel portrait/sprite: fade haircut (`hair #0c0a09`, fade stripe), skin `#5a3a20`, black tee `#1c1917`, no accessory, cyan UI colour `#22d3ee`.
7. Tour: van, motel room, big stage; date: bench + tree; crew battle line-up; cypher sighting + BeeAmGee/Pig Pen figures.
8. Showcase pad skins: 13 pad slots, hero colours (#CC2200 / #22d3ee / #a78bfa / #fbbf24) and category colours for unlocks (`CAT_COLORS` [ext L5249]).
9. SFX: pad hits use `playGameSound` (hero samples or catalog synth); rooster crow for wake; level-up/unlock jingles are triggered via `checkLevelUp`.

---------------------------------------------------------------------------------------------------

# OPEN QUESTIONS / GOTCHAS
1. **Conditional hook in BarScreen**: `useEffect` (missedGig, L15906) is after `if (!isNightTime) return` (L15642). If the clock flips night->day while mounted (2 AM collapse resets minutes) React would throw "Rendered fewer hooks". The app probably routes away first; verify before porting, irrelevant in Phaser.
2. **Tour ≠ "-30 energy"**: it sets energy to `floor(maxEnergy*0.7)` — a refill for anyone below 70 %. Also skips the whole sleep transition (no rent on a skipped Sunday, no daily/weekly reset, `pendingDebuff` kept, no morning events, no passive song/crew income). Decide if intended.
3. **Open-mic label vs code**: button says "+30 min" but `passMinutes(c, 60)` (the comment above `finishOpenMic` says "a full hour"). Mingle/karaoke labels (+30) are correct.
4. **XP without `checkLevelUp`** in open mic (+8), basic karaoke (+5), tour (none), festival (+200/+80), non-win crew battle (+12). Level-ups, sound unlocks (`fast_hats` at 5 open mics) and achievements are delayed to the next call of `checkLevelUp` elsewhere.
5. **Weekly counters**: open mic, mingle and showcase update `daily.*` directly; `bumpDaily` (daily+weekly) is only used by busk/jam/run. Weekly challenges `wk_openmic_5` and `wk_mingles_8` therefore can never progress from this range (and crew battles don't bump `battleWins`).
6. **Dead flags**: `storyFlags.firstShowcase` is never set (festival eligibility + flashback `the_song` read it; flashback falls back to day>=20, festival to openMicCount>=5). `rohzelFridayOffer` is only read. `heat` is write-only. `meetsBookingReqs`, `FRIDAY_DOW`, `passTime`, `log` in karaoke challenge, `ROHZEL_BOOKED_OK`'s `day` param, the hidden "Rohzel" label are unused.
7. **Rohzel NEED_FANS line #1 says "Ten fans"**; gate is 50 followers.
8. **Showcase time-skip**: `startShowcaseGig` sets `minutes = booking.minute` even if that rewinds up to 60 minutes (late arrival) — free time travel; also skips decay/hunger up to 30 min forward. After the gig +30 min.
9. **Showcase has no sick check** and energy only checked at the button (>=25). Open mic and karaoke do check sick; mingle and menu don't.
10. **No waiting mechanic** for Friday gigs booked later the same night (must burn time with mingle/menu/other places). A booking made at 18:00 with the earliest slot 20:00 means 2 h of dead time.
11. **Showcase cooldown quirk**: `7 - (day - lastShowcaseDay)`; on the next Friday it hits 0, so asking before 20:00 books the same night, otherwise next week. Booking is single (no queue).
12. **Open-mic farming**: no cooldown, ~10 energy each, fan formula unaffected by prior shows; also performance quality (sequencer content) is completely ignored.
13. **Jam is the dominant grind**: per 100 energy = 10 rewards = +10 stat points (never Sho) and 10-30 fans, +1 mood/tick, -50 hunger. Run (Sho) = 6 rewards/100 energy. Consider rebalancing when porting; also note jam needs hunger>=15 and mood>=15 while busk doesn't.
14. **RhythmTap/RunTracker only sample the LAST 2.5 s window** when the 12.5 s reward fires (`accuracyRef`, `runBlockRef` are overwritten each window), so play-mode performance in the first 10 s of a block is discarded for the reward. Busk bonus curve has a jump (acc .8 -> x1.5 branch value vs x2.0).
15. **Max-energy rate** mismatch: comment/code in ParkScreen says every 5 good bars, `RunTracker` fires every 3; ParkScreen caps at 150.
16. **Park play-mode UI text**: "1 block = 10 game min (0.5s)" is static and wrong for play mode (3 game-min / 2.5 s).
17. **Cutscene collisions**: multiple `playCutscene` calls in one tick overwrite each other (jam: pigPen/bjarne/fatboxg; open mic: firstOpenMicDone + bjarneIntroduced). Overwritten cutscenes never set their story flag -> they re-fire on the next reward. A queue is needed in the rebuild.
18. **Date edge cases**: stand-up penalty only fires when ParkScreen mounts after the date day; the booked 16:00 isn't enforced; `goOnDate` adds 60 min without clamp or decay; three of six romance partners (pascal, jin, roo) use the generic fallback look `{shirt:'#a78bfa'}`; ask-out dialogue promises "saturday"/"sunday" but `daysAhead` is always 2.
19. **OpenMicPerformance cleanup bug**: `return () => clearTimeout(t)` inside the interval callback does nothing; unmounting early leaves the timer to call `onComplete` and fire the reward even if the screen was left. Also `finishOpenMic` is captured at mount (stale `char`), harmless since nothing mutates during the modal.
20. **Stale `charRef`** in ParkScreen `onReward` (updated only after render): jam story conditions can lag one reward behind; jam story uses `jamCount+1` computed from the stale char.
21. **Crew battle mood** is clamped only at 100 (not 0): loss can push mood negative. `resolveCrewBattle` treats mood 0 as 50 via `|| 50`. Source description string says "avg(playerStat)+ally bump" but the code uses `0.6 * totalStats + allyBoost`.
22. **Crew win text** "Drinks tonight are free" — not implemented; `crew_*_won` flags don't block re-rewards each week.
23. **Festival**: descriptions promise battle gauntlet / duet / judges, implementation is a single RNG roll with no minigame; "Three weeks to prepare" vs 14 days; no energy/sick gate; `festivalState` can sit at 'choosing' indefinitely; locked path B copy "Need to have met Crystix".
24. **Bar menu**: cocktails/whiskey only differ by numbers; no age/sickness/cash-floor gate; `pendingDebuff` stacking is unbounded (energy debuff -25 per energy drink; could drop morning energy to 0). Hangover is not applied by a nap.
25. **PowerNap/Sleep** numbers sit in `finishNap`/`finishSleep` [ext]; I only verified `finishNap`. The sleep animation is not skippable and always 4 s.
26. "Park map/characters": there is no walkable map or NPC set in this range — the park is a menu; characters are the generic cypher members (colours `#84cc16`, `#fb7185`, `#a78bfa`), Pig Pen/BeeAmGee only appear in cutscenes, and the date partner on the bench. If the rebuild wants a real park scene, that is new design work.
27. `PixelScene` fixed size 200x130 (scale 3 -> 600x390); the park animations are 140x90 (scale 4). Phaser should keep these logical resolutions or re-art them.
28. Rohzel's line state is local (`rohzelLine`) and resets to a random greeting on every BarScreen mount; the reminder/cooldown lines are not persisted.
