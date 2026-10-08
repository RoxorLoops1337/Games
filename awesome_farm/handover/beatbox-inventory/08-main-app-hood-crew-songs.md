# Beatbox Story — Inventory 08: Main App, Slots, Create, Hood, Crew, Songs, Livestream, BeeAmGee

Source: `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx`, lines 10877-12680 (read completely).
Helper constants/functions defined OUTSIDE this range but needed to understand it (initialChar, passMinutes,
CONTENT_UNLOCKS, CREW_NPCS, computeRentEvent, finishSleep, TUTORIALS, DevPanel, ...) were also read and are quoted
with their own line numbers, marked "(outside range)".

## SUMMARY

1. The whole game is ONE React component `BeatboxStory` (11110-11732) holding `char` (the entire save), `screen` (a string router) and a handful of overlay flags. There is NO central reducer: every screen receives the raw `setChar` and mutates `char` with inline updater functions. The rebuild must introduce a real reducer/event layer.
2. Time model: `char.minutes` = minutes since 06:00 (0 = 6 AM, 720 = 6 PM, 1080 = midnight, 1200 = 02:00 hard cap). A real-time activity tick (outside range) adds 10 game-min every 500 ms. Instant actions call `passMinutes(c, n)` which also applies passive mood decay.
3. A day ends in exactly two ways: (a) voluntary sleep -> `finishSleep` in HouseScreen (full morning rollover: song/crew payouts, rent, random events, challenges, messages) and (b) the App's 2 AM watcher (11418-11459) which forces a MUCH thinner rollover (day+1, 60% energy, -25 hunger, -12 mood, rent only). There is no "game over"; the worst state is eviction (3 couch-surf days + penalties).
4. Autosave: whole `char` JSON to `window.storage` (polyfilled to `localStorage['bbs:character:slot<N>']`), throttled to 1 write / 2000 ms with trailing edge, plus flush on `beforeunload` and tab-hidden. 5 slots + `active_slot` pointer; JSON export/import per slot.
5. Cutscenes are a SINGLE slot (`cutscene` state), not a queue; a new `playCutscene` silently replaces the current one (and its completion flag never fires). Pauses all activity ticking via the module flag `_gamePaused`. Foxy tutorial tips (11 one-shots, `tut_<id>` flags) ride the same mechanism.
6. Level-ups are cosmetic (need = level x 100 XP, one level per call, no cap, no reward); `checkLevelUp` is also the single hook that grants sound unlocks and achievements.
7. HoodScreen = 480x860 painted map (day image before 18:00, night image from 18:00) with 4 percentage-rectangle hotspots (house/park/bar/shop), day-only/night-only/day-count locks, a one-shot walking cat (5 s, 6-waypoint path) and a day-only 8-frame beatboxer sprite; night adds ~35 animated light elements (windows, neon, awning, lamps, vapor, twinkles).
8. Studio-tab panels (House): SongsLibrary (release MPC pattern; 7-day decay table sums to exactly 1.00; payouts are in finishSleep), CrewPanel (5 recruitable NPCs, flat daily cash+fans), LivestreamPanel (>=20 fans, 1/day, 60 min, formula in its own section), BeeAmGee coaching ($50, 3-day cooldown, +1 stat).
9. CreateScreen: name (2-16 chars), 8 shirt colours, 5 skins, 6 hair colours, 5 hair styles; seeds a parent text message on completion.
10. Biggest rebuild hazards: single-slot cutscene overwrite, thin 2 AM collapse path, day-gates enforced only on the hood map (footer nav bypasses them), side effects inside setState updaters, write-only/dead fields (`heat`, `_sleepingNow`, tier-3 coaching bonus). See OPEN QUESTIONS / GOTCHAS at the end.

---

## 0. Map of the range

| Lines | Unit |
|---|---|
| 10877-11106 | SlotsScreen |
| 11108-11732 | MAIN APP `BeatboxStory` (state, load/save, clock, collapse, level-up, cutscene, toasts, overlays, router, header, footer) |
| 11734-11824 | CreateScreen |
| 11826-12242 | HoodScreen (+ CAT_PATH, CAT_DUR, CHARACTERS, buildCatKeyframe) |
| 12244-12340 | CrewPanel |
| 12342-12473 | SONG_DECAY + SongsLibrary |
| 12475-12537 | LivestreamPanel |
| 12539-12622 | BJARNE_LINES + BjarneCoachingPanel |
| 12624-12680 | HOUSE_LIGHT_KINDS, HOUSE_LIGHTS, first lines of HouseScreen (state hooks only) |

---

## SlotsScreen  (lines 10877-11106)

- What it is: the "BEATBOXERS" save-slot picker. Reached from (a) TitleScreen buttons "Play"(no active char) / "Beatboxers", (b) header profile button (the second "⚙", 11611-11617), (c) App renders it standalone when `screen==='slots' && !char` (11513-11526), otherwise inside the normal layout (11675-11682). Header text "BEATBOXERS", subtitle "Pick a character or start fresh".
- Props: `activeSlot, onSwitch(n), onDelete(n), onBack|null`. `onBack` ("← Back to game" -> `setScreen('hood')`) only exists when an active created char is loaded.
- Local state: `slots` (array of 5: char|null), `confirmDelete` (slot number), `confirmText`, `refreshKey`, `importStatus {slot,msg,kind}`, hidden `<input type=file>` per slot (refs).
- Data: `loadAllSlots()` -> reads `character:slot1..5` (NUM_SLOTS=5, outside range 933-1028). Re-queried whenever `refreshKey` changes.
- Slot card (filled): number badge coloured by `slot.color` (default `#D4A017`), name (`UNNAMED` fallback), "ACTIVE" tag if `activeSlot===n`, line 1 `Lvl {level||1} · Day {day||1} · ${cash||0} · {followers||0} fans`, line 2 `Mus x · Tec x · Ori x · Sho x` (from `slot.stats`). Right label: "Switch ->" (inactive) / "Continue ->" (active). Tapping the card calls `onSwitch(n)`.
- Slot card (empty): dashed border, "EMPTY SLOT / Tap to create new character", "+" icon; tap -> `onSwitch(n)` which starts the intro + creator (see Main App "Slot switching").
- Footer of filled card: "📤 Export save" and "🗑 Delete".
  - Export: only if `slot.created`. Filename `beatbox-${safeName}-slot${n}-day${day||1}.json` where safeName = name with `[^a-z0-9_-]` -> `_`, lower-cased (fallback "character"). Blob = `JSON.stringify(slot,null,2)`, download via temporary `<a download>`. Export = the raw `char` only (does NOT include recorded samples, which live in IndexedDB `slot<N>:sample-<key>`).
  - Delete: swaps the card into a confirm state: red text "⚠ Delete {name}?", must type exactly `DELETE` (case-sensitive; input is CSS-uppercased only) to enable "Delete forever"; "Cancel" resets. On confirm -> `await onDelete(n)`, clear confirm, bump `refreshKey`.
- Footer of EMPTY card: "📥 Import save (.json)" (import is only offered on empty slots). Parse JSON; reject unless object with truthy `created` ("That doesn't look like a Beatbox save."); else `saveSlot(n, parsed)` -> status "Imported {name} ✓" (kind `win`), refresh. Errors: "Import failed: {msg}". No schema validation; `migrateChar` repairs the object on next load.
- State read/written: reads slot summaries only; writes `character:slotN` (import) / deletes (via App).
- Rebuild notes: pure module `saves.ts` (`listSlots`, `exportSlot`, `importSlot(parse+validate)`, `deleteSlot`). In Phaser this is a list scene (5 cards) with DOM `<input type=file>` and a DOM text input for the DELETE confirm. Deleting a slot should also wipe that slot's IndexedDB samples (original does not -> a new character in that slot inherits old samples; and export does not carry samples).

---

## MAIN APP  `BeatboxStory`  (lines 11108-11732)

### A. Architecture diagram (in words)

```
index.html  ── polyfills window.storage -> localStorage('bbs:'+key); loads bundle
main.jsx    ── createRoot().render(<BeatboxStory/>)   (no StrictMode)

BeatboxStory  (single component; owns EVERYTHING)
 ├─ React state: char | screen | loaded | toast | activeSlot | cutscene | showMessages
 │               | showAchievements | showSettings | achievementQueue[] | devUnlocked | showDevPanel
 ├─ Refs: devTapsRef, lastSaveTimeRef, pendingSaveRef, latestCharRef
 ├─ Module globals read by the shell: _gamePaused (set from `cutscene`), _settingsCache (muted/reducedMotion/fastDialogue),
 │               HERO_SAMPLES (audio buffers per slot), localStorage 'beatbox_dev', 'beatbox_settings'
 ├─ Mutators handed to children:
 │     setChar(raw React setter)  update(patch)  updateStats(patch)  passTime(energyCost)
 │     checkLevelUp(c)->c'  showToast(msg,type)  go(=setScreen)  playCutscene(props,flag,after)
 ├─ Effects (in source order):
 │     1. _gamePaused <- !!cutscene                               (11155)
 │     2. Tutorial watcher (Foxy tips)                            (11173-11188)
 │     3. Boot: migrateLegacy -> getActiveSlot -> loadSlot -> migrateChar -> samples -> screen='title' (11269-11284)
 │     4. Throttled autosave on [char, loaded, activeSlot]        (11296-11314)
 │     5. Flush on beforeunload / visibilitychange(hidden)        (11317-11337)
 │     6. 2 AM hard cap watcher on [char.minutes]                 (11418-11459)
 └─ Render branches (early returns, in order):
       !loaded -> splash "BEATBOX STORY loading..."
       screen==='title' -> TitleScreen (+SettingsModal)           (11495)
       screen==='slots' && !char -> SlotsScreen standalone         (11513)
       !char -> "LOADING..."
       else main layout: palette bg + sticky HEADER + overlays + SCREEN (keyed, fade) + FOOTER NAV

Screens (separate components, own local UI state, mutate char via setChar):
   Create  Hood  House  Shop  Park  Bar  Battle  Slots     (Title is a pre-game screen)
House's Studio tab hosts: SoundStudio, SongsLibrary, CrewPanel, LivestreamPanel, BjarneCoachingPanel (outside range 14196-14206).
```

Data flow of one gameplay action: child component computes a new `char` inside `setChar(c => ...)` (often calling `passMinutes`, `checkLevelUp`, `addMessage` helpers) -> React re-renders -> autosave effect schedules a write -> 2 AM watcher checks `minutes` -> tutorial watcher checks predicates.

### B. State shape

React state in `BeatboxStory` (11111-11131):

| name | init | meaning |
|---|---|---|
| `char` | `null` | the entire save game (see schema below) |
| `screen` | `'loading'` | router: `loading`, `title`, `slots`, `create`, `hood`, `house`, `shop`, `park`, `bar`, `battle` (`intro` is tested but never set) |
| `loaded` | `false` | boot finished (true even when no char exists) |
| `toast` | `null` | `{msg,type:'info'|'win'|'bad'}` single slot |
| `activeSlot` | `null` | 1..5 |
| `cutscene` | `null` | `{speaker, speakerColor, lines|beats, music, onComplete}` |
| `showMessages/showAchievements/showSettings/showDevPanel` | `false` | overlay flags |
| `achievementQueue` | `[]` | earned achievements awaiting fanfare modal (one shown at a time, keyed by id) |
| `devUnlocked` | `localStorage.beatbox_dev==='1'` | hidden dev mode |

`char` schema = `initialChar()` (outside range, lines 152-225), reproduced here because it IS the state shape:

```
name:'' color:'#D4A017' skin:'#d4a87a' hairColor:'#1a1a2e' hairStyle:'short'
level:1 xp:0 cash:30 followers:0 energy:100 maxEnergy:100 hunger:70 mood:70
stats:{mus:5,tec:5,ori:5,sho:5}  sounds:['classic_kick','hi_hat','psh_snare']  equipped:(same 3)  defeated:[]
day:1 minutes:0                       (0 = 06:00)
voiceRange:null voiceRangeMidi:null
tecLessonsCompleted:0 tecCurrentLesson:0 tecBpm:90 oriBpm:100 oriPattern:null(legacy) oriSlots:null oriSlotIdx:0
songs:[] crew:[]
pendingDebuff:null showcaseBooking:null lastShowcaseDay:null lastBattleDay:null openMicCount:0
apartmentTier:1 rentLate:0 lastRentPaidDay:null evictionRecoveryDay:null apartmentMovedInDay:0
messages:[] lastParentMsgDay:0 lastFoxySafetyNetDay:0 lastFoxySoupDay:0 foxyLoanTaken:false
mingleCount:0 romanceAffinity:{} romanceState:{} dateBooking:null metEncounters:{}
daily:{} dailyChallenge:null weekly:{} weeklyChallenge:null achievements:{}
lastTourDay:0 festivalState:null festivalAcceptedDay:0 festivalPath:null festivalResult:null
outfit:'default' accessory:'none' bjarneSessions:0 lastBjarneDay:0 sickDay:0 flashbacksSeen:{} gear:{}
lastCoffeeDay:0 lastPlantWaterDay:0 lastYogaDay:0 storyFlags:{} created:false
```

Fields that appear in code but NOT in `initialChar` (created lazily): `lastStreamDay`, `lastStreamViewers`, `heat`, `plantWaterCount`, `plantWaterCountDay`, `plantDead`, `plantDeathDay`, `rentBumped`, `_opponent` (ephemeral battle target that leaks into the saved JSON until cleared).

`migrateChar` (11190-11264, mutates the loaded object in place and returns it) fills these defaults for old saves:

- Time/voice/training: `minutes=0`, `voiceRange=null`, `voiceRangeMidi=null`, `maxEnergy=100`, `tecLessonsCompleted=0`, `tecCurrentLesson=0`, `tecBpm=90`, `oriBpm=100`, `oriPattern=null`.
- Sequencer slots: `oriSlots` missing -> `_seqDefaultSlots()` (4 starter patterns "Boom Bap", "4 on Floor", "Half-Time", "Empty"); a legacy `oriPattern` with tracks becomes slot 0 named `oriPattern.name || 'Custom'`. `oriSlotIdx` reset to 0 if not a number, `<0` or `>= SEQ_SLOTS (4)` (this also wipes valid MPC slots 4-7).
- Appearance: `skin='#d4a87a'`, `hairColor='#1a1a2e'`, `hairStyle='short'`, `outfit='default'`, `accessory='none'`.
- Booking/cooldowns: `pendingDebuff=null`, `showcaseBooking=null`, `lastShowcaseDay=null`, `lastBattleDay=null`, `dateBooking=null`, `lastTourDay=0`, `openMicCount=0`.
- Housing/rent: `apartmentTier=1`, `rentLate=0`, `lastRentPaidDay=null`, `evictionRecoveryDay=null`, `apartmentMovedInDay=0`.
- Social: `messages=[]`, `lastParentMsgDay=0`, `lastFoxySafetyNetDay=0`, `lastFoxySoupDay=0`, `foxyLoanTaken=false`, `mingleCount=0`, `romanceAffinity={}`, `romanceState={}`, `metEncounters={}`.
- Progress/meta: `daily={}`, `weekly={}`, `dailyChallenge=null`, `weeklyChallenge=null`, `achievements={}`, `flashbacksSeen={}`, `gear={}`, `storyFlags={}`, `songs=[]`, `crew=[]`.
- Festival: `festivalState=null`, `festivalAcceptedDay=0`, `festivalPath=null`, `festivalResult=null`.
- Stream/coach/health: `lastStreamDay=0`, `lastStreamViewers=0`, `sickDay=0`, `bjarneSessions=0`, `lastBjarneDay=0`.
- Home gear: `lastCoffeeDay=0`, `lastPlantWaterDay=0`, `plantWaterCount=0`, `plantWaterCountDay=0`, `plantDead=false`, `plantDeathDay=0`, `lastYogaDay=0`.
- NOT migrated (assumed present in every save): `sounds, equipped, defeated, stats, level, xp, cash, followers, day, created, color, name, hunger, mood, energy`.

Mutator helpers (11368-11383):
- `showToast(msg,type='info')`: `setToast({msg,type}); setTimeout(()=>setToast(null), 2200)`. The timer is never cancelled, so a second toast within 2.2 s is wiped early by the first toast's timer.
- `update(patch)`: `char = {...char, ...patch}`. `updateStats(patch)`: merges into `char.stats`.
- `passTime(energyCost=0)`: energy -= cost (floor 0), hunger -= 5 (floor 0), mood -= 2 (floor 0). Does NOT advance `minutes`. Handed to HouseScreen and ParkScreen only.

### C. Boot / load sequence  (11269-11284)

1. `migrateLegacy()` (outside range 1005-1019): if slot 1 empty and legacy key `character:main` has `created` char -> copy to slot 1 and set active slot 1 (legacy key kept as backup).
2. `getActiveSlot()` reads `active_slot` (valid 1..5).
3. If a slot is active and `loadSlot` returns a `created` char: `setChar(migrateChar(c))`, `setActiveSlotState(slot)`, `await loadSamplesForSlot(slot)` (IndexedDB recorded samples -> `HERO_SAMPLES`).
4. ALWAYS land on `screen='title'`, `loaded=true`. TitleScreen: "Play" label is `Continue as <NAME>` if an active created char exists else `New Game`; `onPlay -> hasActiveSlot ? 'hood' : 'slots'`; buttons "👥 Beatboxers" -> slots, "⚙ Settings" -> SettingsModal; looping `title` music.
5. If boot throws mid-way the splash would hang (no try/catch around the IIFE except inside storage helpers which swallow).

### D. Autosave  (11286-11337)

- `SAVE_THROTTLE_MS = 2000`. Effect on `[char, loaded, activeSlot]`; only when `char && char.created && loaded && activeSlot` (so a half-created character is never persisted).
- If `now - lastSaveTime >= 2000` -> save immediately (`saveSlot(activeSlot,char)` = `JSON.stringify(char)` into `window.storage.set('character:slot<N>')`, i.e. `localStorage['bbs:character:slot<N>']`).
- Else clear any pending timer and set a trailing timer for `2000 - elapsed` which saves `latestCharRef.current` (latest value). During continuous activity ticks (500 ms) this yields ~1 write per 2 s.
- Flush function (cancel pending, save now) bound to `window beforeunload` and `document visibilitychange` when `hidden`. The visibilitychange listener is anonymous and never removed, and a new one is added every time `loaded`/`activeSlot` changes (harmless duplicates).
- Save errors are swallowed (`try/catch {}` in `saveSlot`) -> quota failure is silent.
- Other persisted stores: `localStorage['beatbox_settings']` (`muted`, `reducedMotion`, `fastDialogue`), `localStorage['beatbox_dev']='1'`, IndexedDB `slot<N>:sample-<soundKey>` (recorded audio).
- Rebuild: keep the key names if existing saves must load (`bbs:character:slotN`, `bbs:active_slot`). Make the saver a pure `SaveScheduler` (leading+trailing 2 s, flush on `pagehide`/`visibilitychange`), and explicitly flush the OLD slot before switching slots (original drops the trailing save when `char`/`activeSlot` change within 2 s because the effect cleans the pending timer, and "Continue" re-reads storage which can be up to 2 s stale).

### E. Slot switching, new character, delete  (11339-11366)

- `switchToSlot(n)`: `loadSlot(n)`.
  - If `created` char exists: `setChar(migrateChar(c))`, `setActiveSlotState(n)`, persist `active_slot`, `loadSamplesForSlot(n)`, `screen='hood'`.
  - Else (empty slot): `setChar(initialChar())`, set active slot, load samples (`slotN:sample-*` - may belong to a previously deleted character), then `playCutscene({beats: INTRO_BEATS, music:'intro'}, 'introSeen', () => setScreen('create'))`. The 7 painted INTRO_BEATS (outside range 10688-10789) show: office layoff -> bedroom/rent -> phone (312 followers, half bots) -> mirror (parents would take you back) -> door (practice, busk, cypher tonight) -> bar LIVE sign -> blurred strobing bar ("you don't remember saying yes") -> couch morning ("tonight you go again"). Skipping also sets `storyFlags.introSeen=true`.
- `deleteSlotAt(n)`: `deleteSlot(n)` (removes `character:slotN` only). If it was the active slot: `char=null`, `activeSlot=null`, `screen='slots'`.
- After Create finishes (11683-11694): `created=true`; if `messages` empty -> `addMessage(next,'parents',"you settled in? we're not mad about the job. come over for sunday dinner anytime ❤️")` and `lastParentMsgDay = c.day||1`; then `screen='hood'`.

### F. Time model and the ordering of a day

Constants (outside range 1034-1062, 1080-1081): `TICK_MINUTES=10`, `TICK_REAL_MS=500`, `DAY_END=1200`, `RENT_BY_TIER=[50,100,200]`, `COUCHSURF_DAYS=3`. NOTE the header comment says "1 real sec = 10 in-game min"; the constants actually give 10 game-min per 0.5 s = 20 game-min per real second = 3 real seconds per game hour. A full 06:00->02:00 day of pure activity is 120 ticks = 60 s. Mini-game modes override tick length (e.g. "2s · slow" per 10-min block, `cfg.tickMinutes/tickRealMs`).

Clock helpers: `clockString(m)=((m+360)%1440) -> HH:MM`; `timeOfDay(m)`: `<60 dawn`, `<720 day`, `<780 dusk`, else `night`; `isDayTime = m<720`; `isNightTime = m>=720`. `dayOfWeek(day) = day % 7` with 0=MON..6=SUN, so **day 1 = Tuesday**, day 6 = Sunday, day 7 = Monday (`DAY_NAMES_SHORT`). Header Clock: ☀️ for dawn/day, 🌙 for dusk/night.

Passive mood decay (outside range 716-734): `_moodDrainFor(c, minutes) = (minutes/60) * (0.3 + 0.5·[hunger<30] + 0.5·[energy<30] + 1.0·[hunger==0] + 1.0·[energy==0])`. `passMinutes(c,n) -> {minutes: c.minutes+n, mood: max(0, mood - drain)}` (callers add their own positive bumps on top). The activity tick uses the same drain per tick.

Activity tick (`useActivity`, outside range 2139-2258) per tick unless `_gamePaused`: `minutes += tickMins`; `energy -= tickEnergyCost`; `hunger -= tickHungerCost`; `mood = clamp(mood + tickMoodDelta - drain)`; every `blocksPerReward` ticks (5 for training) call `onReward`. Stops with toast: `energy_after < tickEnergyCost` -> "You collapsed from exhaustion"; `hunger<=0 && cost>0` -> "Too hungry to keep going"; `minutes>=1200` -> "It got too late — heading home"; custom `stopWhen` (park stops when `!isDayTime`). Start refused if energy < tickEnergyCost ("Too tired to start!") or `sickDay===day` ("Too sick to do anything today"). The hook also self-stops if `char.day` changes under it (collapse).

Typical ordering of one in-game day:
1. Morning (minutes=0, 06:00): `finishSleep` has already applied overnight effects (Section G). Day 1 starts with the first-money Foxy tip (see tutorials).
2. 06:00-18:00 (`minutes<720`): hood shows DAY art; park open; shop open if day>=4; bar locked.
3. 18:00 (`minutes>=720`): hood switches to NIGHT art + neon; park locks (screen shows "THE PARK IS QUIET"); bar opens (bar screen shows "THE BAR IS CLOSED" before 18:00); app background palette goes dawn `#1c1815` (<07:00) / day `#1a1a1f` / dusk `#1c1418` (18:00-19:00) / night `#0c0a18`.
4. Tutorial `late_night` at `minutes>=1080` (midnight).
5. `minutes>=1200` (02:00) -> hard cap collapse (Section G.2) unless the player already slept.
6. Weekly beats keyed on `day%7`: Monday (0) = bar CLOSED + weekly challenge reset; Tue/Wed/Thu = open mic; Fri(4) = paid showcase; Sat(5) = battle; Sun(6) = karaoke + RENT collected when a sleep/collapse lands on newDay with `newDay%7===6`.

### G. Daily rollover — the two paths

#### G.1 Voluntary sleep (`finishSleep`, HouseScreen, outside range 13074-13414) — summarised because songs/crew payouts and rent hang off it
Order of operations:

1. Precompute song fans + crew cash/fans from the PRE-sleep char `c0` (so wake-up toasts can quote them).
2. `rentEvent = computeRentEvent(c0, c0.day+1)`.
3. `dayAdvance = rentEvent is 'evicted' ? 1 + COUCHSURF_DAYS(3) : 1`; `newDay = c0.day + dayAdvance`.
4. 30% random overnight event (`pickRandomEvent`), skipped if evicted.
5. 10% bad-sleep roll, skipped if evicted; earplugs gear removes the 'noisy' and 'heating' reasons; state-relevant reasons preferred 60% of the time.
6. One `setChar` applying, in this order:
   - `energy = min(max, max + bedBonus)` (new_bed bonus 20 is a no-op because of the `min`); `hunger -= 30` (floor 0); `mood += 10` (cap 100).
   - Bad sleep: `energy = floor(max * (badSleep.energyCap ?? 0.7))`, `mood -= 10`.
   - Houseplant alive: `mood += 1`. Apartment tier 2: `mood += 5`; tier 3: `mood += 10` and `stats.mus += 1`.
   - Cat gear: `mood += 2` and `cash -= 3` if `cash >= 3`. Camera+tripod gear: `followers += 1`.
   - Rent result: paid -> `cash -= amount`, `rentLate=0`, `lastRentPaidDay=newDayBase`, flag `firstRentPaid`; missed -> `rentLate=1`, mood -10; warning -> `rentLate=2`, mood -15; evicted -> `energy=floor(max*0.5)`, `hunger -= 20`, `mood -= 30`, `rentLate=0`, flag `evictedOnce`.
   - `pendingDebuff` (bar-item hangover `{energy?,hunger?,mood?}`) added then cleared.
   - `day = newDay`, `minutes = 0`; random-event effects (`applyRandomEvent`).
   - `daily = {}`; `dailyChallenge = {id, claimed:false}` from `pickDailyChallenge(newDay % 7)`.
   - Songs replaced by updated array; `followers += songFans`. Crew replaced by updated array; `cash += crewCash`; `followers += crewFans`.
   - Weekly challenge reset when `newDay % 7 === 0` (Monday) or none exists; `weekly = {}`.
   - Parent text if `newDay - lastParentMsgDay >= 3`: rentPaid 45%, rentMissed/warning 75%, hunger<30 50%, Sunday (`newDay%7===6`) 30% generic; first match wins; sets `lastParentMsgDay`.
   - If `followers > 0`: 5% anonymous fan text, 4% anonymous hater text.
   - Festival: once `festivalEligible(next)` and no `festivalInviteSent`, Rohzel texts "festival people called.\nthey want you.\nsit down. let's talk.", `festivalState='invited'`.
7. Cutscenes/toasts fire from `setTimeout`s: rent cutscene 50 ms, bad-sleep toast 100 ms, random-event cutscene 200 ms, flashback (25% chance, first eligible unseen) 320 ms, dream (newDay>=30, 5%) 400 ms, songs toast 500 ms, crew toast 800 ms.

Rent rule (outside range 1217-1230): due only when `newDay % 7 === 6` (Sunday) and `lastRentPaidDay !== newDay`; paid iff `cash >= RENT_BY_TIER[tier-1]` (50/100/200, all-or-nothing); else next lateness = `rentLate + 1`: 1 -> `missed`, 2 -> `warning`, >=3 -> `evicted`.

#### G.2 2 AM hard cap (inside range, 11412-11459)
- Trigger: `useEffect` on `[char?.minutes]`; if `char.created && minutes >= DAY_END(1200)`.
- Applies (inside `setChar`, with a race-guard `if minutes<DAY_END return c`):
  - `day = day+1`, `minutes = 0` (overshoot discarded)
  - `energy = floor(maxEnergy * 0.6)`; `hunger = max(0, hunger-25)`; `mood = max(0, mood-12)`
  - `pendingDebuff = null` (bar-item hangovers are DISCARDED)
  - Rent via `computeRentEvent(c,newDay)`: `paid` -> cash -= amount, `rentLate=0`, `lastRentPaidDay=newDay`, `storyFlags.firstRentPaid=true` (silent: no toast, no cutscene); `missed` -> `rentLate=1`; `warning` -> `rentLate=2`; `evicted` -> downgraded to `rentLate=2` ("keep it at warning so the next real sleep handles it properly").
- Then (outside the updater): `setScreen('house')`, after 80 ms toast `"You collapsed at 2 AM. Got home somehow."` (type `bad`).
- NOT applied vs finishSleep: song payouts, crew payouts, daily/dailyChallenge reset, weekly rollover, random event, bad-sleep roll, flashback/dream, apartment mood bonuses, cat/camera effects, parent/unknown/festival messages, mood +10, hunger -30 instead of -25, no rent cutscenes. A collapse therefore skips a whole day of passive income (songs age by calendar day so that payout is lost forever) and leaves yesterday's `daily` counters in place.
- Also fires when a nap hits the cap: `finishNap` clamps `minutes` to 1200 and toasts "2 AM — got booted off the couch" (outside range 13058-13073), then this watcher immediately collapses again.
- Rebuild: single `endDay(char, cause:'sleep'|'collapse'|'nap')` pure function with one rollover pipeline and cause-specific modifiers (energy 100%/60%, hunger -30/-25, mood +10/-12, debuff applied vs dropped). Decide deliberately whether collapse should pay songs/crew/reset challenges.

### H. Level-up / progression hook: `checkLevelUp(c)`  (11385-11410)

- XP rule: `need = c.level * 100`; if `xp >= need`: toast `LEVEL UP! → {level+1}` (type win), `playLevelUp()`, `level+1`, `xp -= need`. Only ONE level per call (excess XP carries; it chains on later calls). No cap. Cumulative XP to reach level n = 50·n·(n-1): L2 100, L3 300, L4 600, L5 1000, L6 1500, L7 2100, L8 2800, L9 3600, L10 4500, L20 19000.
- Level has no gameplay effect: used only for header ("LVL n"), slot card, achievement `level_10`, DevPanel. (Opponent `level` is an NPC field, unrelated.)
- XP bar in header: width = `xp / (level*100)`.
- Then `applySoundUnlocks(next)` (outside range 56-65): any sound whose `SOUND_UNLOCKS[id].cond(c)` is true and isn't owned is appended to `sounds`; auto-equipped while `equipped.length<5`. If any: `playUnlock()` after 60 ms and toasts `🔓 Unlocked: {name}` after 80 ms.
- Then `applyAchievements(...)` (outside range 628-638): newly satisfied achievements are stamped `achievements[id]=c.day`; `playAchievement()` after 130 ms; pushed to `achievementQueue` (fanfare modal, auto-closes after 3 s or tap) and toasts `🏆 Achievement: {label}` after 140 ms.
- Called by: activity rewards, battles, livestream, coaching, etc. — NOT by passive payouts (songs/crew/sleep), so overnight fan gains only trigger unlocks/achievements at the next `checkLevelUp` call.
- SOUND_UNLOCKS (outside range 27-44; sound ids from `SOUND_CATALOG` at 6-19):

| sound id | name | tier | unlock condition |
|---|---|---|---|
| classic_kick, hi_hat, psh_snare | Classic Kick / Basic Hi-Hat / PSH Snare | 1 | always (start sounds) |
| inward_k | Inward K Snare | 2 | `storyFlags.jamCount >= 3` |
| throat_kick | 808 Throat Kick | 2 | `storyFlags.pigPenWins >= 1` |
| fast_hats | Fast Hi-Hats (TKs) | 2 | `openMicCount >= 5` |
| lip_roll | Lip Roll | 2 | `stats.ori >= 10` |
| inward_bass | Inward Bass | 3 | `defeated` includes 'Sikker' |
| d_low | D-Low Scratch | 3 | `followers >= 200` |
| laser | Laser Whistle | 3 | `defeated` includes 'Alim' |
| click_roll | Click Roll | 3 | `followers >= 500` |
| uvular_roll | Uvular Kick Roll | 4 | `defeated` includes 'FatboxG' |

- ACHIEVEMENTS (outside range 604-625; tier b=bronze `#a8a29e`, s=silver `#dadada`, g=gold `#fbbf24`):

| id | label | tier | condition |
|---|---|---|---|
| first_steps | First Steps | b | `storyFlags.firstJam` |
| cypher_regular | Cypher Regular | b | `storyFlags.jamCount >= 10` |
| open_mic_newcomer | Open Mic Newcomer | b | `openMicCount >= 1` |
| mic_veteran | Mic Veteran | s | `openMicCount >= 10` |
| first_saturday | First Saturday | b | `storyFlags.pigPenBattled` |
| first_blood | First Blood | s | `defeated.length >= 1` |
| pen_to_penny | Pen to Penny | s | `storyFlags.pigPenWins >= 2` |
| the_crew | The Crew | g | `defeated.length >= 7` |
| one_hundred | One Hundred | b | `followers >= 100` |
| thousand_strong | Thousand Strong | s | `followers >= 1000` |
| ten_k | Ten Thousand | g | `followers >= 10000` |
| gear_hoarder | Gear Hoarder | b | 5 gear items owned |
| completist_gear | Completist (Gear) | g | 14 gear items owned |
| sound_master | Sound Master | g | 12 sounds owned |
| in_love | In Love | s | any `romanceState` == 'couple' |
| penny_revealed | Real Name Penny | s | `storyFlags.pennyReveal` |
| crystix | Bro from the Forum | s | `storyFlags.crystixMet` |
| sponsored | Sponsored | b | any `sponsor_*_signed` flag |
| all_sponsors | Five-Brand Athlete | g | snortvpn, redfull, sure, adipas, samsong all signed |
| level_10 | Level Ten | b | `level >= 10` |

- Side-effect warning: `checkLevelUp` is invoked INSIDE `setChar` updaters by children and itself calls `showToast`, audio and `setAchievementQueue`. It is only safe because the app doesn't use StrictMode.
- Rebuild: `applyProgression(char): {char, events[]}` returning `LevelUp | SoundUnlocked | AchievementEarned` events consumed by the UI layer; loop level-ups (`while xp>=need`) or keep the one-per-call quirk deliberately.

### I. Cutscene player, pause, tutorials

- State: `cutscene = {speaker, speakerColor, lines|beats, music, onComplete}`; rendered as `<Cutscene {...cutscene}/>` (component at 6680-6830, outside range): `beats` = array of `{image?, filter?, imageAnim?, lights?[{t,l,w,h,bg,anim}], drawScene?(ctx,fc), lines[]}`; plain `lines` become one beat. Tap arrow advances line -> next beat -> `onComplete`; "Skip ->" top-right calls `onComplete` immediately; setting `fastDialogue` auto-advances after 2000 ms; `reducedMotion` disables fades/ken-burns; optional looping `music` (`startMusic(name)` / `stopMusic()` on unmount); progress dashes per beat; image beats cross-fade (1.1 s) with a 14 s ken-burns zoom (scale 1->1.05, translate -1%/-0.5%).
- `useEffect(() => setGamePaused(!!cutscene), [cutscene])` sets module flag `_gamePaused`; the activity tick returns early while paused (time, energy, rewards freeze). Instant actions are unaffected.
- `playCutscene(props, flagPath, after)` (11157-11165): `setCutscene({...props, onComplete})` where `onComplete` = clear cutscene; if `flagPath`: `storyFlags[flagPath]=true` (set ONLY on completion/skip; app closed mid-scene => flag unset, scene replays); then `after?.()`.
- ONE slot: a second `playCutscene` replaces the first; the replaced cutscene's flag and `after` callbacks are lost. finishSleep fires up to 4 cutscenes at 50/200/320/400 ms -> only the last survives.
- Tutorial watcher (11167-11188): deps `[day, floor(minutes/60), energy, hunger, mood, cash, created, storyFlags, cutscene, screen]`. Skips if no char/not created/cutscene up/screen in `loading|slots|create|intro` (NOT `title`, so a tip can be queued invisibly under the title screen). Scans `TUTORIALS` in order, picks the FIRST whose flag `tut_<id>` is unset and whose `when(char)` is true, plays `{speaker:'FOXY · TIP', speakerColor:'#84cc16', lines}` with flag `tut_<id>`, then stops scanning.
- TUTORIALS table (outside range 10796-10875), in priority order:

| id | when | lines |
|---|---|---|
| start_busk | day==1 && minutes<600 && cash<30 | "first up — head to the park and busk for an hour." / "you'll get a few bucks and bump your showmanship. it's how everyone starts here." (NEVER fires on a new game: starting cash is exactly 30) |
| low_energy | energy<=30 && !c._sleepingNow | "you're getting tired. when energy's low, head home." / "couch tab in your apartment — power nap to top up, or sleep till morning." |
| low_hunger | hunger<=30 | "stomach's rumbling. swing by your kitchen and eat something." / "tip: i drop a free Foxy Soup in your fridge every day. take it." |
| low_mood | (mood\|\|100)<=30 | "you're in a slump. mood drains your training rewards if it stays low." / "talk to people at the bar, take a walk, or play a song to get back up." |
| first_money | cash>=25 && day<=4 | "nice — pocket money. don't spend it all on snacks." / "sunday rent is $50 a week to start. budget around that." (this is the first tip a new player sees) |
| try_jam | day>=2 && cash>=5 && !firstJam | "once you've got busking down, try Jam in the park." / "5 cycles → +1 random stat + a few followers. that's how you get on the radar." |
| bar_open | day>=3 | "the bar opens today. tap the bar tile in the city." / "tue/wed/thu = open mic — free shot at fans. fri = paid showcase, sat = battle, sun = karaoke." |
| late_night | minutes>=1080 | "heads up — it's getting late." / "the day cuts off at 2 AM. sleep before then or you'll collapse and lose half your morning." |
| rent_warning | day%7==5 && cash<50 && !firstRentPaid | "saturday already. rent's $50 tomorrow." / "if you're short — busk hard, hit the karaoke bar tonight, or skip a meal. don't miss it." |
| shop_open | day>=4 | "the shop opens today. four sub-stores: music, furniture, clothing, pet." / "music gear boosts training; furniture buffs your home; clothing affects shows; pet's a daily mood bump." |
| routines | openMicCount>=1 | "now you've done a mic — about your routines." / "head home → PC/Train tab → train Originality. that's where the MPC lives — build your own loops there." / "your saved patterns are what gets played at open mics. better originality = better routines = better shows." |

  (Predicates swallow exceptions. `low_mood` misses mood exactly 0 because `0||100`.)

### J. Toasts, overlays, error handling, dev mode, settings

- Toast: `fixed top-24 left-1/2 -translate-x-1/2 z-50 max-w-xs`; styles: `win` amber bg `bg-amber-500 border-amber-600 text-stone-950`; `bad` `bg-red-900 border-red-700 text-red-100`; `info` `bg-stone-900 border-stone-700 text-stone-200`; text uppercase mono xs. Visible 2200 ms (see timer bug above). Rendered AFTER all modals so it sits on top.
- Overlay render order (all `z-50`, later = on top): Cutscene, MessagesPanel, AchievementsPanel, SettingsModal, AchievementFanfare (queue head only), DevPanel (needs `devUnlocked`), toast. Header/footer are `z-20`.
- MessagesPanel (outside range 6885): marks every message read on open; newest first; stamp TODAY/YESTERDAY/`n DAYS AGO`/`DAY n`; sender colours from `SENDER_META` (parents #fbbf24, rohzel #22d3ee, pigpen #fb7185, penny #a78bfa, foxy #84cc16, crystix #22d3ee, beeamgee #D4A017, unknown #a8a29e). Header badge = `unreadMessageCount(char)`, shows `9+` above 9. `addMessage(c,sender,text)` pushes `{id: Date.now()+rand(0..999), sender, text, day, minute, read:false}`.
- SettingsModal (7246): checkboxes `muted` ("Mute audio"), `reducedMotion` ("Reduce motion"), `fastDialogue` ("Fast dialogue"); stored in `localStorage['beatbox_settings']`; per-device, not per-save.
- Error handling: `ScreenErrorBoundary` (render crash card with Retry, 6553-6582) wraps the whole app and the screen area; `GlobalErrorOverlay` (6587-6630) is a red top banner listing deduplicated `window.error`/`unhandledrejection` messages with a dismiss button.
- Dev mode: triple-tap the day-of-week badge (<=800 ms between taps) -> `window.prompt('Dev code:')`; code `808` sets `localStorage.beatbox_dev='1'` and opens DevPanel; Achievements panel has an alternate hidden code input. When unlocked the badge shows `*` and amber colour and triple-tap opens the panel. DevPanel (7098-7242): jump to next MON..SUN (`day += (target-cur+7)%7`, +7 if same; `minutes=0`), ±1/±7 days, time slider 0..1170 step 30 + presets 06:00/12:00/18:00/23:00, cash +50/+500/+5000/$0, full restore (energy=max, hunger/mood 100), +50/+500 fans, fill XP bar (`xp = level*100`), +5 to each stat (cap 100), lock dev mode. Dev day jumps do NOT run rollover.
- Page chrome: `max-w-md mx-auto` (448 px), body gradient from palette, `transition-colors duration-1000`; screen area `p-3 pb-20`, keyed by `screen` with `screenFade 0.28s ease-out` (opacity 0->1, translateY 8px->0) unless `reducedMotion`. `index.html` centres a max 480 px frame on desktop and loads Tailwind CDN + Bebas Neue/Oswald fonts.

### K. Screen routing (`go` = `setScreen`)

Screens and who can reach them:

| screen | reached by | notes |
|---|---|---|
| `loading` | initial | splash |
| `title` | boot (always) | TitleScreen; -> `hood` or `slots` |
| `slots` | title buttons; header profile "⚙"; after deleting active slot | SlotsScreen; header hidden here |
| `create` | after intro cutscene on an empty slot | header + footer hidden |
| `hood` | Play; footer HOOD; "Back to game"; every location's "BACK TO HOOD"; after Create; festival path ends with `go('hood')` | HoodScreen |
| `house` | footer HOUSE; hood hotspot; 2 AM collapse forces it | HouseScreen (tabs: train/studio/eat/wardrobe/rest) |
| `shop` | footer SHOP; hood hotspot (day>=4) | |
| `park` | footer PARK; hood hotspot (daytime only) | self-checks `!isDayTime` -> "THE PARK IS QUIET" |
| `bar` | footer BAR; hood hotspot (day>=3 and night) | self-checks `!isNightTime` -> "THE BAR IS CLOSED" |
| `battle` | BarScreen "go('battle')" (`char._opponent` set) | footer hidden; returns `go('bar')` |

Only the hood map enforces the DAY gates (`CONTENT_UNLOCKS.bar.day=3`, `.shop.day=4`); the footer nav calls `setScreen` directly, so a player can open the shop on day 1 and the bar at night on day 1-2. Park/Bar screens re-check time of day only. Sub-store unlocks (day 4/5/7/10) are inside ShopScreen.

Props per screen: Hood `{go,char}`; Create `{char,setChar,onDone}`; House `{char,update,updateStats,passTime,setChar,checkLevelUp,showToast,go,activeSlot,playCutscene}`; Shop `{char,setChar,showToast,go,playCutscene}`; Park `{char,setChar,passTime,showToast,go,checkLevelUp,playCutscene}`; Bar/Battle `{char,setChar,go,showToast,checkLevelUp,playCutscene}`.

Header (sticky, `z-20`, shown when `char.created && screen!=='slots'`, i.e. also during battle): day-of-week badge (dev trigger) + `Day {day}` + `<Clock>`; `NAME · LVL n` (name upper-cased); right side `$cash`, `{followers} fans`, Messages button (MessageSquare icon + red unread badge), Settings "⚙", Achievements trophy, Profiles/slots "⚙" (two identical glyphs); three bars: Energy `energy/maxEnergy` (#D4A017), Fed `hunger/100` (#84cc16), Mood `mood/100` (#C8DCEF); thin XP bar.
Footer nav (fixed bottom, `z-20`, hidden on `battle|create|slots`): 5 tabs HOUSE (Home), PARK (TreePine), HOOD (Music icon), SHOP (ShoppingBag), BAR (Beer); active tab amber on `stone-900/50`.

### L. Game-over / eviction summary
There is no game-over state. Cash can't go negative on rent (all-or-nothing). Lateness ladder: 1st missed Sunday -> `rentLate=1`, mood -10, "notice taped to your door" cutscene; 2nd -> `rentLate=2`, mood -15, "Final warning" cutscene; 3rd -> eviction: day advances 1+3 (couch-surf), energy 50%, hunger -20 (after -30), mood -30, `rentLate` reset to 0, `evictedOnce` flag, 3-beat cutscene (boards on door / couch / "back on feet"). Apartment tier, gear, cash and followers are NOT reset by eviction. Songs/crew payouts for the 3 skipped days are lost (probe uses `c0.day+1`). The 2 AM collapse can postpone an eviction by one week (see G.2).

---

## CreateScreen  (lines 11734-11824)

- What: the character creator. Reached right after the intro cutscene on a new slot (`screen='create'`). Header art text "BEATBOX / STORY", tagline "From bedroom to world champion". Live preview `<CharacterPortrait look={{shirt,skin,hair,style,accessory:null}} size={140} active/>`.
- Options (exact):
  - Stage Name: text input, placeholder "Your beatbox name...", `slice(0,16)`; the "ENTER THE CIRCLE ->" button is disabled while `name.trim().length < 2`; stored as `name.trim()` (mixed case preserved; shown uppercase in the header).
  - Shirt colour (8): `#D4A017`(default), `#CC2200`, `#C8DCEF`, `#84cc16`, `#a78bfa`, `#fb7185`, `#22d3ee`, `#f97316`.
  - Skin tone (5): `#f5d4a8`, `#d4a87a`(default), `#a87844`, `#8a5a3a`, `#5a3a20`.
  - Hair colour (6): `#1a1a2e`(default), `#5a3a18`, `#a87044`, `#fbbf24`, `#9ca3af`, `#a78bfa`.
  - Hair style (5): `short`(default, "Short"), `fade` ("Fade"), `mohawk` ("Mohawk"), `spike` ("Spikes"), `long` ("Long").
  - Selected swatch = white border + `scale-110`; selected style = amber outline.
- Confirm: `setChar(c => ({...c, name: name.trim(), color, skin, hairColor, hairStyle}))` then `onDone()` -> App sets `created:true`, seeds parents' text (see Slot switching), `screen='hood'`.
- State written: `name, color, skin, hairColor, hairStyle, created, messages, lastParentMsgDay`. Nothing else (stats/cash/etc. come from `initialChar`).
- Rebuild notes: pure `createCharacter(opts): char` validating name length 2-16 and palette membership; Phaser/DOM: a DOM text input overlay + swatch buttons + live portrait sprite (portrait is a canvas function `CharacterPortrait` at 16611, outside range). Outfit/accessory (wardrobe) are separate, later systems (`outfit`, `accessory` fields).

---

## HoodScreen  (lines 11826-12242)

- What: the neighbourhood map = the game's hub. Reached via footer HOOD, after Create, after Title "Play", and every location's back button. Title "THE HOOD"; subtitle `☀ daytime · streets are alive` (isDay) or `🌙 nighttime · neon glow`.
- Map box: `w-full max-w-md`, 2 px stone border, `aspectRatio 480/860`, bg `#0c0a09`, `image-rendering: pixelated`. Image `hood-day.png` when `minutes<720` else `hood-night.png` (both 480x860 in `beatbox_story/`). Swap is a hard cut at exactly 18:00 (no dusk art).
- Hotspots (percentages of the map box; pixel equivalents at 480x860 in brackets x,y,w,h):

| id | label | top% | left% | width% | height% | px [x,y,w,h] | unlock/lock rule | lock reason shown | desc / title |
|---|---|---|---|---|---|---|---|---|---|
| house | House | 10.25 | 32.88 | 29.77 | 21.19 | 158,88,143,182 | never locked | — | "Train, eat, rest" |
| park | Park | 48.5 | 19.79 | 33.62 | 18.35 | 95,417,161,158 | locked when `!isDayTime(minutes)` (>=18:00); no day gate | "Empty at night · come back at sunrise (6 AM)" | "Jam, busk, run" |
| bar | Bar | 39.85 | 74.99 | 25.01 | 20.9 | 360,343,120,180 | locked if `day<3` OR `minutes<720` | day gate: "You're not ready for the cypher yet. Take a few days."; else "Opens at 6 PM" | not-day-locked: `Tonight: {BAR_SCHEDULE[day%7].title}` (Mon "CLOSED", Tue-Thu "OPEN MIC NIGHT", Fri "PAID SHOWCASE", Sat "BATTLE NIGHT", Sun "KARAOKE NIGHT") |
| shop | Shop | 71.21 | 64 | 36 | 22.73 | 307,612,173,196 | locked if `day<4`; NOT time-gated (open at night) | "Shops open day 4. Save your cash." | "Gear & food" |

  Monday: the bar hotspot is OPEN at night (only the schedule title says CLOSED).
- Hotspot rendering: transparent absolutely-positioned `<button>`; unlocked: hover `scale-[1.02]`, active `scale-95`; locked: `opacity-60`, `cursor-not-allowed`, `disabled`, click ignored. Label chip centred, 4 px from the bottom edge: unlocked = amber bg `bg-amber-500` stone-950 bold text; locked = `bg-stone-950/90 text-stone-400` with `🔒 ` prefix; Bebas Neue 10 px uppercase. Tooltip (`title`): lockReason when locked else `"{Name} · {desc}"`.
- Below the map: if any hotspot locked, a list `🔒 {Name} · {lockReason}` for each locked hotspot that has a reason (the shop's lockReason is null when unlocked; park/bar reasons always present when locked).
- Click: `go(h.id)` when unlocked.
- NIGHT lighting overlay (only when `!isDay`; `pointer-events:none`, all `mix-blend-mode: screen`; all coordinates are % of the map box):
  - Apartment windows (8 lights; fill `radial-gradient(ellipse at center, rgba(255,196,96,0.55) -> transparent)`; animation `nightWindow`, duration `3.2 + (i%4)*0.45` s, `ease-in-out`, infinite):

    | i | top | left | height | width | delay s | dur s |
    |---|---|---|---|---|---|---|
    | 0 | 21.609 | 35.882 | 3.97 | 3.1 | 0 | 3.20 |
    | 1 | 21.47 | 40.781 | 4.04 | 3.21 | 0.7 | 3.65 |
    | 2 | 21.528 | 45.540 | 4 | 4 | 1.4 | 4.10 |
    | 3 | 20.407 | 52.953 | 3.359 | 4.056 | 0.3 | 4.55 |
    | 4 | 27.077 | 36.443 | 6.92 | 5.08 | 1.1 | 3.20 |
    | 5 | 27.300 | 43.679 | 6.455 | 4.677 | 1.8 | 3.65 |
    | 6 | 23.945 | 53.367 | 5.700 | 3.662 | 2.10 | 4.10 |
    | 7 | 23.473 | 58.782 | 4.756 | 4 | 2.45 | 4.55 |

  - Neon sign (2 lights; fill `radial-gradient(ellipse, rgba(251,56,90,0.85) -> transparent)`; `nightNeon`, ease-in-out infinite):
    - A: top 48.811, left 78.723, w 18.430, h 5.283, dur 1.8 s, delay 0.
    - B: top 45.383, left 72.995, w 4.386, h 6.889, dur 2.3 s, delay 0.5 s.
  - Neon halo: top 54.2, left 77.276, w 22.724, h 17.872; `radial-gradient(circle at 50% 50%, rgba(251,56,90,0.30), transparent 60%)`; `nightNeonHalo 2.2s ease-in-out 0.3s infinite`.
  - Shop awning glow: top 69.230, left 51.614, w 48.386, h 28.608; `radial-gradient(ellipse at 50% 50%, rgba(255,136,40,0.6), transparent 45%)`; `nightShop 4.5s ease-in-out 0.8s infinite`.
  - Street/park lamps (4; fill `radial-gradient(ellipse, rgba(255,176,80,0.45) -> transparent 70%)`; box height = size*0.7; `nightLamp`, dur `4.2+(i%3)*0.7` s, delay `i*0.55` s):
    - L0 top 23.029, left 18.139, size 15.272 (4.2 s, 0 s)
    - L1 top 61.448, left 52.938, size 17.938 (4.9 s, 0.55 s)
    - L2 top 81.022, left 16.747, size 14.945 (5.6 s, 1.1 s)
    - L3 top 78.753, left 40.397, size 17.943 (4.2 s, 1.65 s)
  - Sewer vapor (5 manholes; each box holds 3 sub-puffs; fill `radial-gradient(ellipse at 50% 85%, rgba(220,230,240,0.45), transparent 70%)`; `nightVapor`, linear infinite, dur `3.5+(i%3)*0.6` s, sub-puff j delay = `v.delay - j*(dur/3)`):
    - V0 top 30.959, left 34.718, w 6.993, h 8.133, delay 0.00 (3.5 s)
    - V1 top 34.595, left 82.081, w 7.345, h 8.526, delay 0.70 (4.1 s)
    - V2 top 34.595, left 91.413, w 8.402, h 9.116, delay 1.40 (4.7 s)
    - V3 top 72.626, left 34.542, w 6.641, h 8.133, delay 2.10 (3.5 s)
    - V4 top 60.932, left 77.855, w 6.817, h 8.526, delay 2.80 (4.1 s)
  - Skyline twinkles (14 dots, 2x2 px, `#fef3c7`, `box-shadow 0 0 4px 2px rgba(254,243,199,0.7)`): `top = 1 + (i*13 % 6)` %, `left = 5 + (i*17 % 90)` %, dur `2.5+(i%5)*0.6` s, delay `(i*0.37) % 3` s, `nightTwinkle` ease-in-out infinite.
  - Keyframe opacity profiles (percent of cycle: value):

    | keyframes | profile |
    |---|---|
    | nightWindow | 0/100: .55 scale1; 17: .62; 19: .42; 21: .64; 50: .85 scale1.05; 67: .72; 69: .52; 71: .78 |
    | nightNeon | 0,6,10,100: 1; 4,8: .35; 50: .85; 52: .40; 54: .85 |
    | nightNeonHalo | 0/100: .70; 11: .55; 13: .82; 50: 1; 63: .70; 65: .90 |
    | nightShop | 0/100: .85; 14: .70; 16: .92; 50: 1; 66: .78; 68: .95 |
    | nightLamp | 0/100: .70; 16: .55; 18: .82; 50: 1; 68: .65; 70: .88 |
    | nightTwinkle | 0/100: .2 scale.8; 20: .5; 22: .15; 50: 1 scale1.2; 72: .55; 74: .18 |
    | nightVapor | 0: opacity 0, translateY(20%), scale .5; 15: .55; 85: .50; 100: opacity 0, translateY(-50%), scale 1.6 |
- Walking cat: `<div>` positioned by CSS keyframes `catHoodWalk` generated by `buildCatKeyframe(CAT_PATH)`; sprite `cat-walk.png` (296x64 = 4 frames of 74x64, `background-size 400% 100%`), width 6.5% of map (~31 px), `translate(-50%,-100%)` (feet anchor), `pointer-events:none`, `z-index 3`. Runs on EVERY mount of HoodScreen (day AND night), once, 5 s linear, `forwards` (ends parked at the last waypoint, off-screen right). Leg cycle `catLegs 0.5s steps(4,jump-none) {max(1,round(CAT_DUR/0.5))=10}` iterations then holds.
  - `CAT_DUR = 5` s; `CAT_PATH` waypoints (% of map): `(-5.99,71.73)`, `(26.08,68.91)`, `(30.76,71.99)`, `(38.95,73.30)`, `(58.86,73.31)`, `(114.91,64.29)`.
  - Keyframe stops are distributed by arc length measured in %-space: `0, 26.22, 30.79, 37.54, 53.76, 100` (% of the 5 s). In true pixel space (480x860) the proportions would be `0, 25.67, 31.39, 38.13, 53.87, 100` and speed ~121 px/s; the original's "constant pixel speed" claim is only approximate. Pixel waypoints (x,y): `(-28.8,616.9) (125.2,592.6) (147.6,619.1) (187.0,630.4) (282.5,630.5) (551.6,552.9)`.
  - Fallback keyframe if path < 2 points: left -12% -> 100%, top 54%.
  - Editing tool referenced: `tools/cat-path-editor.html` (not in repo listing).
- Stationary character `CHARACTERS` (daytime only, `isDay && ...`): `{id:'beatboxer1', name:'Beatboxer', x:40.1, y:59.38 (feet anchor, % of map), width:8.61%, sheet:'beatboxer-park.png' (512x128 = 8 frames of 64x128), frames:8, aspect:'64 / 128', loop:1}`; CSS `steps(8, jump-none) infinite` over 1 s (8 fps), `translate(-50%,-100%)`, `z-index 2`, no interaction. Px: feet at (192.5,510.7), ~41 px wide. Editor referenced: `tools/character-editor.html`.
- State read: `char.minutes`, `char.day`. State written: none (navigation only).
- Rebuild notes:
  - Pure `hoodLocks(char): Record<'house'|'park'|'bar'|'shop',{locked,reason,desc}>` using `isDayTime/isNightTime/isUnlocked/BAR_SCHEDULE/CONTENT_UNLOCKS`. Make the SAME lock check authoritative in the destination scenes (original only checks time-of-day at park/bar and nothing for the day gates).
  - Phaser: Scene `Hood` at 480x860 base with `Phaser.Scale.FIT`; background image swap on `minutes` boundary 720; 4 `Zone`s from the % rects + text labels; locked = alpha 0.6 + lock glyph; night lights = SCREEN-blend sprites with generated radial-gradient textures and looping tweens; cat = sprite (frame 74x64, 4 frames @ 8 fps) following a `Phaser.Curves.Path` polyline over 5000 ms with origin (0.5,1) and scale ~0.42; beatboxer = 8-frame 64x128 sprite @ 8 fps, daytime only.
  - Because the screen remounts, the cat replays on every return to the hood; keep that behaviour (cheap charm) or play at most once per N minutes.

---

## CrewPanel  (lines 12244-12340; data CREW_NPCS at 570-596, outside range)

- What: recruit up to 5 beatboxers for passive income. Lives in House -> Studio tab (14200). Panel title `Crew · {recruited}/{total}`. (The comment on line 12244 says "Livestream panel" but belongs to nothing — stray.)
- CREW_NPCS (recruit once for cash; no upkeep; unlock by follower count):

| id | name | blurb | recruitCost | recruitMinFans | dailyCash | dailyFans | payback (days) |
|---|---|---|---|---|---|---|---|
| jaxx | JAXX | Local cypher regular · loves a 4-on-floor | $80 | 25 | $6 | 1 | 13.3 |
| noor | NOOR | YouTube tutorial nerd · sharp ear | $200 | 75 | $12 | 2 | 16.7 |
| duo_t | DUO-T | Twin brothers — one mic, two voices | $400 | 200 | $22 | 4 | 18.2 |
| glaze | GLAZE | Producer / hat specialist · ex-radio host | $800 | 500 | $38 | 7 | 21.1 |
| mira | MIRA | Choir-trained ringer · perfect pitch | $1500 | 1200 | $60 | 12 | 25 |

  Looks (avatar swatch = shirt background, hair-coloured border, skin-coloured 14 px square): jaxx `{skin #d4a87a, hair #3a2410, shirt #a04040}`, noor `{#c08070,#5a2010,#5a7050}`, duo_t `{#a87844,#1a1a2e,#7a5a30}`, glaze `{#e0b890,#dadada,#3a5a6a}`, mira `{#d4a87a,#7a3a20,#a06090}`. All five: $2980 total, +$138/day, +26 fans/day.
- Helpers: `crewIsRecruited(c,id)` = `crew.some(m=>m.id===id)`; `crewIsAvailable(c,npc)` = `followers >= recruitMinFans`.
- Per-row UI: recruited -> amber border, "CREW" tag, `+${dailyCash}/day · +{dailyFans} fan(s)/day · lifetime ${lifetimeCash} / {lifetimeFans} fans`; available -> normal border + gold-bordered price button `${recruitCost}` (disabled/greyed if cash < cost); not available -> 60% opacity, `🔒 unlock at {recruitMinFans} fans`. Footer when >=1 recruited: `Crew yield: +${sumCash}/day · +{sumFans} fan(s)/day`.
- `recruit(npc)`: no-op if already in; toast `{name} needs {minFans} fans first` (bad); toast `Need ${cost} to recruit {name}` (bad); else `cash -= recruitCost`, push `{id, joinedDay: day||1, lifetimeCash:0, lifetimeFans:0}` onto `crew`, toast `👥 {name} joined the crew` (win). Validation reads the rendered `char` and the updater does not re-check (two same-frame clicks could double-charge; React flushes discrete events so unlikely).
- Payout (in finishSleep, 13112-13128, 13235-13236, 13408-13413): every recruited member contributes exactly `dailyCash`/`dailyFans` each voluntary sleep (no randomness, no decay, no skipping), also increments the member's `lifetimeCash/lifetimeFans`. Toast `👥 Crew brought in +$X / +N fan(s)` 800 ms after waking. Not paid on 2 AM collapse or on couch-surf days. No effect on battles/shows (purely economic).
- State read/written: `crew[]`, `cash`, `followers`, `day`.
- Rebuild notes: `core/crew.ts` -> `recruit(char, id): Result`, `dailyCrewYield(char)`; payout hooked into the day-end pipeline. Data-driven NPC table. Phaser: DOM/Container list in the Studio panel.

---

## SongsLibrary  (lines 12342-12473; payout logic in finishSleep 13096-13111, outside range)

- What: "release" an MPC sequencer slot as a named song which trickles fans for 7 days. Panel `Songs · {count}` in House -> Studio. Button "🎙 Release a new song" (opens a draft form).
- Constants: `SONG_DECAY = [0.32, 0.24, 0.18, 0.12, 0.08, 0.04, 0.02]` (sums to exactly 1.00). DUPLICATED as a local const inside finishSleep (13097) — keep one copy.
- Draft form: "Pick a pattern" 2-column grid of the character's `oriSlots` (4 base slots; 8 with MPC gear), each card shows slot name (or `Slot n`) and `{cells} hits`; selecting a card sets `pickSlotIdx` and, if the name field is empty, pre-fills it with the slot's name; default selection = `char.oriSlotIdx`. Name input max 28 chars (placeholder = slot name or "Song name"). Buttons Cancel / "🎵 Release".
- `countCells(slot)` = total truthy cells over `slot.tracks[*].cells` (4 tracks x 16 steps).
- Release rules: need `cells >= 4` else toast "Pattern is too sparse — at least 4 hits to release" (bad). `finalName = (name.trim() || slot.name || "Track {songs.length+1}").slice(0,28)`. Appends `{id:`song_${Date.now()}`, name, releasedDay: day||1, activeCells: cells, lifetimeFans: 0}`. Toast `🎵 Released "{name}" — earnings start tomorrow` (win). No cost, no cooldown, no cap on songs, no uniqueness check (the same pattern can be released repeatedly and each copy earns separately).
- List: newest first. Per song: `age = today - releasedDay`; `remaining = max(0, 7 - age)`; earning style (amber) when `remaining>0` with label `{remaining}d left`, else dimmed `archived`; sub-line `Released day {d} · {activeCells} hits · +{lifetimeFans} fans earned`. Empty state: "No songs released yet · Build a beat in the MPC, then come release it here".
- Payout formula (each voluntary sleep, `nextDay = day+1`): for each song with `age = nextDay - releasedDay` in 1..7: `decay = SONG_DECAY[age-1]`; `totalStats = mus+tec+ori+sho` (current, not at release); `pool = max(5, floor(totalStats/4 + activeCells*1.5))`; `earned = max(0, round(pool*decay))`; `song.lifetimeFans += earned`; `followers += sum(earned)`. First payout is the morning after release (age 1 = 32%). Toast `🎵 Your songs earned +N new fan(s)` 500 ms after waking.
  - Example: total stats 20, 8 hits -> pool 17 -> payouts 5,4,3,2,1,1,0 = 16 fans over 7 days. Example: total stats 80, 16 hits -> pool 44 -> 14,11,8,5,4,2,1 = 45 fans.
  - Total fans per song ~= pool (decay sums to 1) minus rounding. Spamming N releases multiplies the income by N.
- Not paid on collapse / couch-surf days (calendar passes, payout lost).
- State: `songs[]`, `oriSlots`, `oriSlotIdx`, `day`, `followers` (payout).
- Rebuild notes: `core/songs.ts`: `releaseSong(char, slotIdx, name, now)`, `songYield(char, nextDay): {fans, songs}`. Decide whether to add a daily release cap/ cost (dupe-farming is an obvious exploit). The song `id` uses `Date.now()`; use a counter.

---

## LivestreamPanel  (lines 12475-12537)

- What: go live for 60 game-minutes to earn tips + fans. Panel "Livestream" in House -> Studio. Comment says "Unlocked at 20 followers. Once-per-day cooldown. Tier-2/3 apartment buffs viewers."
- Locks / state of the button: locked (text `🔒 Need 20 followers to go live`) when `followers < 20`. When unlocked: info line `60 min · –15⚡ · viewers and tips scale with skill, fans, and apartment tier.`; if `lastStreamViewers>0` shows `last stream · {n} viewers`; primary button label: `STREAMED TODAY` (if `lastStreamDay===day`), `TOO TIRED` (if `energy<15`), else `🔴 GO LIVE — 60 min`. Disabled unless unlocked, not streamed today, energy >= 15.
- Formula on click (one `setChar`):
  - `skill = mus+tec+ori+sho`
  - `fanCap = max(8, floor(followers*0.15))`
  - `tierBoost = tier==3 ? 1.4 : tier==2 ? 1.2 : 1.0` (`apartmentTier`)
  - `skillFactor = min(1.5, 0.5 + skill/80)` (caps at skill 80)
  - `viewers = floor((10 + random()*fanCap) * skillFactor * tierBoost)`
  - `tipDollars = floor(viewers * (0.3 + random()*0.4))` (0.30-0.70 $/viewer)
  - `fanGain = floor(viewers/6)`
  - Effects: `passMinutes(c,60)`; `cash += tip`; `followers += fanGain`; `energy -= 15` (floor 0); `mood = min(100, t.mood + 4)` (after decay); `xp += 6`; `heat += 2` (write-only field); `lastStreamDay = day`; `lastStreamViewers = viewers`; then `checkLevelUp(...)`.
  - Toast: `Stream done — check the panel for tonight's numbers` (win) — tips/fans are NOT reported anywhere except in the header numbers; the panel only shows viewers.
  - Ranges: new player (20 fans, skill 20, tier 1): 7-13 viewers, $2-9 tips, 1-2 fans. 500 fans, skill 60, tier 2: 15-127 viewers. 5000 fans, skill 100, tier 3: 21-1596 viewers, up to ~266 fans.
- Gaps: no hunger cost, ignores `sickDay` (sick players can stream), no 02:00 check (the +60 min can trigger the collapse watcher), "tonight" wording but it is available any time of day.
- State: reads `followers, lastStreamDay, apartmentTier, energy, stats, day, lastStreamViewers`; writes `cash, followers, energy, mood, xp, minutes, heat, lastStreamDay, lastStreamViewers`.
- Rebuild: `core/livestream.ts` `goLive(char, rng): {char, result:{viewers,tips,fans}}` returning a result so the UI can show the numbers (original hides them); inject RNG for deterministic tests.

---

## BjarneCoachingPanel (BeeAmGee studio coaching)  (lines 12539-12622)

- What: paid mentor sessions from the old man "BeeAmGee" (spelled Bjarne in code). Only rendered in House -> Studio when `storyFlags.bjarneIntroduced` (set by the cutscene at the end of a first open mic after `bjarneCypherSighting`: "saw you in the cypher last week... name's BeeAmGee. been at this thirty years... studio. fifty bucks.", outside range 15750-15763).
- Rules: price `$50`; energy needed `>=10`; cooldown 3 days: `cooldownLeft = max(0, 3 - (day - lastBjarneDay))`, `onCooldown = cooldownLeft>0 && lastBjarneDay>0` (so train on day d, next on day d+3); `canTrain = !onCooldown && cash>=50 && energy>=10`.
- UI: description "The old man taught half the city. He'll work with you for $50 a session." + `Sessions completed: n`. On cooldown: amber `Resting · {n} day(s) until next session`. Else `Pick a focus · 90 min · –10⚡ · –$50 · +1 stat` and a 2x2 grid of buttons `Musicality`(mus) / `Technicality`(tec) / `Originality`(ori) / `Showmanship`(sho); red hints `Need $50`, `Too tired`.
- Effect of a session (`train(stat)`): `passMinutes(c,90)`; `cash -= 50`; `energy -= 10`; `mood = min(100, t.mood+4)`; `xp += 10`; `stats[stat] += 1` (no cap); `bjarneSessions += 1`; `lastBjarneDay = day`; `checkLevelUp`. Toast `Trained with BeeAmGee · +1 {Musicality|Technicality|Originality|Showmanship}` (win). Then cutscene (speaker `BEEAMGEE`, colour `#a3a3a3`, scene `drawBjarneStudioScene` with `lookFromChar(char)`; no flag) with lines `[ BJARNE_LINES[session#] , "You run drills until your jaw aches. He nods, twice.", "\"that's enough for today. same time next week.\"" ]`.
- BJARNE_LINES (session number -> opening line of the cutscene; session >10 -> "keep working. show me next week."). He drips a backstory: lost battles, a daughter who played violin, loneliness:

```
 1  "first time i battled was '92. lost ugly. cried in the bathroom. came back the next week."
 2  "every kid who comes through here thinks they invented the bass kick."
 3  "made it to the world finals once. three times, actually. never won."
 4  "your tongue knows more than your brain. trust it."
 5  "it's not the win. it's that you fought for it. nobody remembers second place except second place."
 6  "i had a daughter. she'd be your age now."
 7  "she didn't beatbox. she liked the violin. fancy that."
 8  "you can hear when somebody's afraid of the mic. you can hear when they're not. that's the only difference."
 9  "there's no secret. there's just hours. and somebody who'll sit in the room with you while you do them."
10  "don't end up like me, kid. find someone to come home to."
```
- Side links: 3 sessions unlock the "Studio Beanie" accessory (`bjarneSessions>=3`); BeeAmGee is a `SENDER_META` text sender (`beeamgee`, #D4A017).
- Gaps: APT_UPGRADES tier-3 description promises "+25% home recording reward" / studio-coaching mus bonus (comment above `APT_UPGRADES`) but this panel applies nothing; flavour says "same time next week" but cooldown is 3 days; ignores `sickDay` and the 02:00 cap.
- State: reads `bjarneSessions, lastBjarneDay, cash, energy, day`; writes `cash, energy, mood, xp, minutes, stats[stat], bjarneSessions, lastBjarneDay`.
- Rebuild: `core/coaching.ts` `trainWithBjarne(char, stat): {char, line}`; line selection pure; cutscene triggered by UI layer; consider a stat cap and the tier-3 bonus.

---

## House atmosphere lights + HouseScreen preamble  (lines 12624-12680)

- Content of range end: the House map light definitions and the first state hooks of HouseScreen (the rest of HouseScreen belongs to another reviewer). Tuned with `tools/light-editor.html`.
- `HOUSE_LIGHT_KINDS` (gradient, animation): `sun` "Window sun-shaft" `radial-gradient(ellipse at 30% 20%, rgba(255,220,150,0.35)->0 at 65%)` `houseSun 8s ease-in-out infinite`; `monitor` "PC monitor" `rgba(150,210,255,0.55)->0 at 75%` `houseMonitor 1.6s ease-in-out infinite`; `rec` "Studio rec light" `circle rgba(255,80,80,0.9)->0 at 70%` `houseRecLight 2.4s ease-in-out infinite`; `ceiling` "Kitchen ceiling" `ellipse at 50% 0% rgba(255,205,120,0.35)->0 at 75%` `houseKitchen 5s ease-in-out infinite`; `tv` "TV glow" `rgba(120,180,255,0.6)->0 at 75%` `houseTv 1.2s steps(6) infinite`. (Keyframes defined at 13708+ outside range; e.g. houseMonitor flickers to .55 at 42%.)
- `HOUSE_LIGHTS` (t,l,w,h in % of the 480x854 apartment map): `sun1` sun (4.81,5.78,26.31,23.65) dayOnly; `monitor1` (14.25,29.31,10.79,7.25); `rec1` (16.43,79.4,4,3) nightOnly; `ceiling1` (34,54,44.23,17.77); `tv1` (64.91,4.51,21.49,14.46); `ceilingmp5m8rk1` ceiling (5.01,53.02,40.48,11.09); `ceilingmp5m9jrv` ceiling (68.56,72.86,20.31,16). Optional `opacityDay/opacityNight` multipliers (unused here).
- HouseScreen state declared at 12676-12683: `tab (null|train|studio|eat|wardrobe|rest)`, `trainStat (mus|tec|ori|sho|null)`, `pendingStart`, `playMode` (false=AFK, true=pitch tuner), `tecInputMode ('tap'|'mic')`, `tunerMode ('beginner'|'advanced')`, `showRangePicker`, `charRef`.
- House map hotspots (outside range 13670-13676, relevant to how Studio is reached; 480x854 map, day/night images `house-day.png`/`house-night.png`): train "PC" (4.06,9.07,38.53,29.77); studio "Studio" (3.46,52.27,42.67,29.87); eat "Kitchen" (35.37,59.07,37.6,28.44); wardrobe (35.67,3.6,51.87,22.67); rest "Couch" (68.27,41.47,50.93,22.9).

---

## CALENDAR REFERENCE (derived from `dayOfWeek(day) = day % 7`, day 1 = Tuesday)

| day | dow | name | bar tonight (BAR_SCHEDULE) | hood bar hotspot | shop hotspot | rent |
|---|---|---|---|---|---|---|
| 1 | 1 | TUE | OPEN MIC NIGHT | locked (day<3) | locked (day<4) | — |
| 2 | 2 | WED | OPEN MIC NIGHT | locked (day<3) | locked | — |
| 3 | 3 | THU | OPEN MIC NIGHT | open from 18:00 | locked | — |
| 4 | 4 | FRI | PAID SHOWCASE | open from 18:00 | open (all day) | — |
| 5 | 5 | SAT | BATTLE NIGHT | open from 18:00 | open | tutorial `rent_warning` fires here if cash<50 |
| 6 | 6 | SUN | KARAOKE NIGHT | open from 18:00 | open | FIRST RENT is taken by the sleep/collapse that ENDS day 5 (newDay 6) |
| 7 | 0 | MON | CLOSED (hotspot still unlocks at night) | open from 18:00 | open | weekly challenge resets when newDay%7===0 |
| 8 | 1 | TUE | OPEN MIC NIGHT | ... | ... | ... pattern repeats every 7 days |
| 13 | 6 | SUN | KARAOKE | | | second rent (newDay 13 reached by sleeping on day 12) |

Rent arithmetic: rent for Sunday day `d` (d%7==6) is deducted at the sleep that STARTS day d, using the cash held at that moment. Weekly amounts by `apartmentTier`: 50 / 100 / 200.

---

## MUTATION CATALOGUE (every button in this range and the exact state it changes)

| control (unit) | guard | writes |
|---|---|---|
| Slot card tap (Slots) | none | `setChar(migrated or initialChar)`, `activeSlot`, `active_slot` key, samples reload, `screen='hood'` or intro cutscene -> `create` |
| Export save (Slots) | `slot.created` | none (downloads JSON) |
| Import save (Slots, empty slot only) | JSON object with truthy `created` | `character:slotN` |
| Delete forever (Slots) | typed `DELETE` | removes `character:slotN`; if active: `char=null, activeSlot=null, screen='slots'` |
| ENTER THE CIRCLE (Create) | `name.trim().length>=2` | `name,color,skin,hairColor,hairStyle,created=true`, parent message + `lastParentMsgDay` ; `screen='hood'` |
| Hotspot tap (Hood) | not locked | `screen = house|park|bar|shop` |
| Footer tab | none (no lock checks) | `screen` |
| Header day badge x3 | within 800 ms gaps | dev unlock / DevPanel |
| Messages / Settings / Achievements / Profiles buttons (header) | none | overlay flags / `screen='slots'` |
| Cutscene OK / Skip | none | `cutscene=null`, `storyFlags[flag]=true`, `after()` |
| Recruit `$cost` (Crew) | not recruited, `followers>=minFans`, `cash>=cost` | `cash -= cost`, `crew.push({id,joinedDay,lifetimeCash:0,lifetimeFans:0})` |
| Release (Songs) | `cells>=4` | `songs.push({id,name,releasedDay,activeCells,lifetimeFans:0})` |
| GO LIVE (Livestream) | `followers>=20`, `lastStreamDay!==day`, `energy>=15` | `minutes+60`, mood decay+4, `cash+=tips`, `followers+=floor(viewers/6)`, `energy-15`, `xp+6`, `heat+2`, `lastStreamDay`, `lastStreamViewers`, level check |
| Stat button (BeeAmGee) | not on cooldown, `cash>=50`, `energy>=10` | `minutes+90`, mood decay+4, `cash-50`, `energy-10`, `xp+10`, `stats[stat]+1`, `bjarneSessions+1`, `lastBjarneDay=day`, level check, cutscene |
| 2 AM watcher (automatic) | `created && minutes>=1200` | see G.2 |
| Tutorial watcher (automatic) | see I | `storyFlags.tut_<id>` after the tip is dismissed |
| Autosave (automatic) | `created && loaded && activeSlot` | storage write only |

---

## TEST VECTORS (to validate the TypeScript port)

Clock / calendar
- `clockString(0)="06:00"`, `clockString(720)="18:00"`, `clockString(1080)="00:00"`, `clockString(1200)="02:00"`.
- `timeOfDay`: 0->dawn, 59->dawn, 60->day, 719->day, 720->dusk, 779->dusk, 780->night.
- `dayOfWeek`: 1->1 (TUE), 6->6 (SUN), 7->0 (MON), 14->0 (MON).
- `moodDrain(c,60)` with hunger 70, energy 70 = 0.3; hunger 20 = 0.8; hunger 20 & energy 20 = 1.3; hunger 0 & energy 0 = 3.3 (per hour).

Level
- `xp=100, level=1` -> level 2, xp 0.
- `xp=250, level=1` -> level 2, xp 150; a second call needs 200 and 150 < 200, so no further level.
- `xp=999, level=1` -> level 2, xp 899 after ONE call (a second call then needs 200 -> level 3, xp 699).

Hood locks (`hoodLocks`)
- day 1, minutes 0: house open; park open; bar locked "You're not ready for the cypher yet. Take a few days."; shop locked "Shops open day 4. Save your cash.".
- day 3, minutes 719: park open; bar locked "Opens at 6 PM" (day gate passed, time not); shop locked (day 3<4).
- day 3, minutes 720: park locked "Empty at night · come back at sunrise (6 AM)"; bar open with desc "Tonight: OPEN MIC NIGHT"; shop locked.
- day 7 (Monday), minutes 800: bar open with desc "Tonight: CLOSED". day 4, minutes 800: shop open.

Songs (`songYield(char, nextDay)`)
- stats 5/5/5/5 (total 20), `activeCells` 8, released day 10: pool = max(5, floor(20/4 + 12)) = 17; nextDay 11 -> 5, 12 -> 4, 13 -> 3, 14 -> 2, 15 -> 1, 16 -> 1, 17 -> 0, 18 -> nothing (age 8). Sum 16.
- total 80, 16 hits: pool 44 -> 14, 11, 8, 5, 4, 2, 1 (sum 45).
- total 0, 4 hits: pool = max(5, floor(0 + 6)) = 6 -> 2, 1, 1, 1, 0, 0, 0.
- Display: on release day `remaining = 7` ("7d left"); on day release+7 `remaining = 0` ("archived").

Crew
- Recruit JAXX at 25 fans, cash 80 -> cash 0, crew `[{id:'jaxx',joinedDay:d,lifetimeCash:0,lifetimeFans:0}]`; next sleep: +$6 +1 fan, lifetime 6/1.
- All five recruited: yield +$138/day and +26 fans/day.

Livestream (deterministic bounds, `random()` in [0,1))
- followers 20, stats 5x4 (skill 20), tier 1: viewers 7..13, tips 2..9, fans 1..2.
- followers 500, skill 60, tier 2: viewers 15..127.
- followers 5000, skill 100, tier 3: viewers 21..1596, fans <= 266.
- At skill 80 and above the skill factor is capped at 1.5.

BeeAmGee
- Session 1 on day 5 (cash 120, energy 40): cash 70, energy 30, +1 chosen stat, xp +10, `lastBjarneDay=5`; day 6/7 shows "Resting · 2 days / 1 day until next session"; day 8 allowed again. Line shown: session 1 line, then the two fixed lines.

Rent (`computeRentEvent`)
- newDay 6, tier 1, cash 50 -> paid 50; cash 49, rentLate 0 -> missed; rentLate 1 -> warning; rentLate 2 -> evicted (day advance 4). newDay 7 -> null. `lastRentPaidDay===6` -> null.

2 AM collapse (`collapse(char)` with max energy 100, hunger 80, mood 60, minutes 1210, day 5, cash 60, tier 1)
- -> day 6, minutes 0, energy 60, hunger 55, mood 48, cash 10 (rent paid silently), `rentLate 0`, `lastRentPaidDay 6`, `pendingDebuff null`, `storyFlags.firstRentPaid true`.

Autosave
- t=0 change -> immediate write. changes at 0.5/1.0/1.5 s -> one write at 2.0 s containing the 1.5 s state. Change at 2.1 s -> trailing write at 4.0 s (elapsed 2.1-2.0=0.1 s since last write -> waits 1.9 s). `visibilitychange(hidden)` -> immediate write.

---

## REBUILD PLAN (framework-free core + Phaser shell)

Suggested TypeScript modules (all pure, RNG and clock injected):

```ts
// core/state.ts
export interface Char { /* the schema in section B */ }
export const initialChar = (): Char => ...;
export const migrateChar = (raw: unknown): Char => ...;      // keep every default above; also fix oriSlotIdx for MPC (8 slots)
// core/clock.ts
export const DAY_END = 1200, TICK_MINUTES = 10, TICK_REAL_MS = 500;
export const timeOfDay = (m:number) => ..., dayOfWeek = (d:number) => d % 7, isDay = m<720, isNight = m>=720;
export const moodDrain = (c:Char, minutes:number) => ..., passMinutes = (c:Char, n:number) => ({minutes:c.minutes+n, mood: ...});
// core/progression.ts   applyProgression(c): { char, events: GameEvent[] }   (level, sound unlocks, achievements)
// core/dayEnd.ts        endDay(c, cause:'sleep'|'collapse'|'nap', rng): { char, events: GameEvent[] }   (rent, songs, crew, challenges, messages, events)
// core/songs.ts crew.ts livestream.ts coaching.ts hood.ts  (reducers listed in each section)
// core/saves.ts         SaveScheduler (leading+trailing 2 s, flush), slot CRUD, export/import
type GameEvent =
  | {t:'toast', msg:string, kind:'info'|'win'|'bad', delayMs?:number}
  | {t:'cutscene', spec:CutsceneSpec, flag?:string}
  | {t:'sfx', id:'levelUp'|'unlock'|'achievement'}
  | {t:'achievement', id:string}
  | {t:'navigate', to:ScreenId};
```

Store: single `GameStore` with `dispatch(action)` where actions mirror every inline `setChar` updater (`RecruitCrew`, `ReleaseSong`, `GoLive`, `TrainBjarne`, `Sleep`, `AdvanceMinutes`, ...). Reducers return `{char, events}`; the shell drains `events` into a toast queue, a CUTSCENE QUEUE (FIFO; flag set on completion) and the audio layer. This removes the three structural problems of the original: single-slot cutscene overwrite, side effects inside updaters, and the duplicated/inconsistent day-end paths.

### Reference TypeScript for the pure rules (faithful to the original numbers; RNG injected)

```ts
// ---------- core/clock.ts ----------
export const DAY_END = 1200;                       // 02:00
export const NIGHT_START = 720;                    // 18:00
export const isDayTime = (m: number) => m < NIGHT_START;
export const isNightTime = (m: number) => m >= NIGHT_START;
export const dayOfWeek = (day: number) => (day || 1) % 7;          // 0=MON .. 6=SUN ; day 1 = TUE
export const timeOfDay = (m: number) => m < 60 ? 'dawn' : m < 720 ? 'day' : m < 780 ? 'dusk' : 'night';
export const clockString = (m: number) => {
  const t = (m + 360) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};
export const moodDrain = (c: Pick<Char, 'hunger' | 'energy'>, minutes: number) => {
  let perHour = 0.3;
  if (c.hunger < 30) perHour += 0.5;
  if (c.energy < 30) perHour += 0.5;
  if (c.hunger === 0) perHour += 1.0;
  if (c.energy === 0) perHour += 1.0;
  return (minutes / 60) * perHour;
};
export const passMinutes = (c: Char, n: number) =>
  ({ minutes: c.minutes + n, mood: Math.max(0, c.mood - moodDrain(c, n)) });

// ---------- core/progression.ts ----------
export const xpNeeded = (level: number) => level * 100;
export function applyProgression(c: Char): { char: Char; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let next = c;
  const need = xpNeeded(c.level);
  if (c.xp >= need) {                                   // ONE level per call (original behaviour)
    next = { ...c, level: c.level + 1, xp: c.xp - need };
    events.push({ t: 'toast', msg: `LEVEL UP! → ${c.level + 1}`, kind: 'win' }, { t: 'sfx', id: 'levelUp' });
  }
  const unlocked = newlyUnlockedSounds(next);           // SOUND_UNLOCKS table
  if (unlocked.length) {
    const equipped = [...next.equipped];
    for (const id of unlocked) if (equipped.length < 5 && !equipped.includes(id)) equipped.push(id);
    next = { ...next, sounds: [...next.sounds, ...unlocked], equipped };
    events.push({ t: 'sfx', id: 'unlock' }, ...unlocked.map(id => ({ t: 'toast' as const, msg: `🔓 Unlocked: ${SOUNDS[id].name}`, kind: 'win' as const, delayMs: 80 })));
  }
  const earned = ACHIEVEMENTS.filter(a => !next.achievements[a.id] && a.cond(next));
  if (earned.length) {
    next = { ...next, achievements: { ...next.achievements, ...Object.fromEntries(earned.map(a => [a.id, next.day])) } };
    events.push({ t: 'sfx', id: 'achievement' }, ...earned.flatMap(a => [{ t: 'achievement' as const, id: a.id }, { t: 'toast' as const, msg: `🏆 Achievement: ${a.label}`, kind: 'win' as const, delayMs: 140 }]));
  }
  return { char: next, events };
}

// ---------- core/dayEnd.ts (the unified pipeline the original lacks) ----------
export type DayEndCause = 'sleep' | 'collapse' | 'nap-cap';
export function collapseCurrent(c: Char): Char {         // exactly what the 2 AM watcher does today
  const max = c.maxEnergy ?? 100, newDay = c.day + 1;
  const rent = computeRentEvent(c, newDay);
  let { cash, rentLate, lastRentPaidDay } = c;
  const flags = { ...c.storyFlags };
  if (rent?.type === 'paid') { cash -= rent.amount; rentLate = 0; lastRentPaidDay = newDay; flags.firstRentPaid = true; }
  else if (rent?.type === 'missed') rentLate = 1;
  else if (rent?.type === 'warning' || rent?.type === 'evicted') rentLate = 2;
  return { ...c, day: newDay, minutes: 0, energy: Math.floor(max * 0.6),
           hunger: Math.max(0, c.hunger - 25), mood: Math.max(0, c.mood - 12),
           cash, rentLate, lastRentPaidDay, pendingDebuff: null, storyFlags: flags };
}
export const computeRentEvent = (c: Char, newDay: number) => {
  if (newDay % 7 !== 6 || c.lastRentPaidDay === newDay) return null;
  const amount = [50, 100, 200][(c.apartmentTier || 1) - 1] ?? 50;
  if (c.cash >= amount) return { type: 'paid' as const, amount, firstTime: !c.storyFlags.firstRentPaid };
  const next = (c.rentLate || 0) + 1;
  return next >= 3 ? { type: 'evicted' as const, amount, weeks: next }
       : next === 2 ? { type: 'warning' as const, amount } : { type: 'missed' as const, amount };
};

// ---------- core/songs.ts ----------
export const SONG_DECAY = [0.32, 0.24, 0.18, 0.12, 0.08, 0.04, 0.02] as const;   // sums to 1.00
export const countCells = (slot?: { tracks?: { cells?: boolean[] }[] }) =>
  (slot?.tracks ?? []).reduce((a, t) => a + (t?.cells?.filter(Boolean).length ?? 0), 0);
export function releaseSong(c: Char, slotIdx: number, name: string, id: string): Result<Char> {
  const slot = c.oriSlots?.[slotIdx]; if (!slot) return fail('no slot');
  const cells = countCells(slot);
  if (cells < 4) return fail('Pattern is too sparse — at least 4 hits to release');
  const finalName = (name.trim() || slot.name || `Track ${c.songs.length + 1}`).slice(0, 28);
  return ok({ ...c, songs: [...c.songs, { id, name: finalName, releasedDay: c.day || 1, activeCells: cells, lifetimeFans: 0 }] });
}
export function songYield(c: Char, nextDay: number) {
  const total = c.stats.mus + c.stats.tec + c.stats.ori + c.stats.sho;
  let fans = 0;
  const songs = c.songs.map(s => {
    const age = nextDay - (s.releasedDay || 0);
    if (age <= 0 || age > SONG_DECAY.length) return s;
    const pool = Math.max(5, Math.floor(total / 4 + (s.activeCells || 0) * 1.5));
    const earned = Math.max(0, Math.round(pool * SONG_DECAY[age - 1]));
    fans += earned;
    return { ...s, lifetimeFans: (s.lifetimeFans || 0) + earned };
  });
  return { songs, fans };
}
export const songDaysLeft = (s: Song, today: number) => Math.max(0, SONG_DECAY.length - (today - (s.releasedDay || 0)));

// ---------- core/crew.ts ----------
export function recruitCrew(c: Char, npc: CrewNpc): Result<Char> {
  if (c.crew.some(m => m.id === npc.id)) return fail('already in');
  if (c.followers < npc.recruitMinFans) return fail(`${npc.name} needs ${npc.recruitMinFans} fans first`);
  if (c.cash < npc.recruitCost) return fail(`Need $${npc.recruitCost} to recruit ${npc.name}`);
  return ok({ ...c, cash: c.cash - npc.recruitCost,
              crew: [...c.crew, { id: npc.id, joinedDay: c.day || 1, lifetimeCash: 0, lifetimeFans: 0 }] });
}
export function crewYield(c: Char, table: CrewNpc[]) {
  let cash = 0, fans = 0;
  const crew = c.crew.map(m => {
    const n = table.find(x => x.id === m.id); if (!n) return m;
    cash += n.dailyCash; fans += n.dailyFans;
    return { ...m, lifetimeCash: m.lifetimeCash + n.dailyCash, lifetimeFans: m.lifetimeFans + n.dailyFans };
  });
  return { crew, cash, fans };
}

// ---------- core/livestream.ts ----------
export function goLive(c: Char, rnd: () => number): Result<{ char: Char; viewers: number; tips: number; fans: number }> {
  if (c.followers < 20) return fail('Need 20 followers to go live');
  if (c.lastStreamDay === c.day) return fail('STREAMED TODAY');
  if (c.energy < 15) return fail('TOO TIRED');
  const skill = c.stats.mus + c.stats.tec + c.stats.ori + c.stats.sho;
  const fanCap = Math.max(8, Math.floor(c.followers * 0.15));
  const tierBoost = c.apartmentTier === 3 ? 1.4 : c.apartmentTier === 2 ? 1.2 : 1.0;
  const skillFactor = Math.min(1.5, 0.5 + skill / 80);
  const viewers = Math.floor((10 + rnd() * fanCap) * skillFactor * tierBoost);
  const tips = Math.floor(viewers * (0.3 + rnd() * 0.4));
  const fans = Math.floor(viewers / 6);
  const t = passMinutes(c, 60);
  return ok({ viewers, tips, fans, char: { ...c, minutes: t.minutes, cash: c.cash + tips, followers: c.followers + fans,
    energy: Math.max(0, c.energy - 15), mood: Math.min(100, t.mood + 4), xp: c.xp + 6, heat: (c.heat || 0) + 2,
    lastStreamDay: c.day, lastStreamViewers: viewers } });
}

// ---------- core/coaching.ts ----------
export const BJARNE_LINES: Record<number, string> = { /* the 10 lines in the BJARNE section */ };
export const bjarneCooldownLeft = (c: Char) => Math.max(0, 3 - (c.day - (c.lastBjarneDay || 0)));
export function trainWithBjarne(c: Char, stat: 'mus' | 'tec' | 'ori' | 'sho'): Result<{ char: Char; line: string }> {
  const onCooldown = bjarneCooldownLeft(c) > 0 && (c.lastBjarneDay || 0) > 0;
  if (onCooldown) return fail('Resting'); if (c.cash < 50) return fail('Need $50'); if (c.energy < 10) return fail('Too tired');
  const n = c.bjarneSessions + 1, t = passMinutes(c, 90);
  return ok({ line: BJARNE_LINES[n] ?? 'keep working. show me next week.',
    char: { ...c, minutes: t.minutes, cash: c.cash - 50, energy: Math.max(0, c.energy - 10), mood: Math.min(100, t.mood + 4),
            xp: c.xp + 10, stats: { ...c.stats, [stat]: c.stats[stat] + 1 }, bjarneSessions: n, lastBjarneDay: c.day } });
}

// ---------- core/hood.ts ----------
export interface HotspotDef { id: 'house'|'park'|'bar'|'shop'; name: string; top: number; left: number; width: number; height: number; }
export const HOOD_HOTSPOTS: HotspotDef[] = [
  { id: 'house', name: 'House', top: 10.25, left: 32.88, width: 29.77, height: 21.19 },
  { id: 'park',  name: 'Park',  top: 48.5,  left: 19.79, width: 33.62, height: 18.35 },
  { id: 'bar',   name: 'Bar',   top: 39.85, left: 74.99, width: 25.01, height: 20.9  },
  { id: 'shop',  name: 'Shop',  top: 71.21, left: 64,    width: 36,    height: 22.73 },
];
export function hoodLocks(c: Pick<Char, 'day' | 'minutes'>) {
  const barDay = c.day >= 3, shopDay = c.day >= 4;
  return {
    house: { locked: false, reason: null, desc: 'Train, eat, rest' },
    park:  { locked: !isDayTime(c.minutes), reason: 'Empty at night · come back at sunrise (6 AM)', desc: 'Jam, busk, run' },
    bar:   { locked: !barDay || !isNightTime(c.minutes),
             reason: !barDay ? "You're not ready for the cypher yet. Take a few days." : 'Opens at 6 PM',
             desc: barDay ? `Tonight: ${BAR_SCHEDULE[dayOfWeek(c.day)].title}` : '' },
    shop:  { locked: !shopDay, reason: shopDay ? null : 'Shops open day 4. Save your cash.', desc: 'Gear & food' },
  };
}
export const CAT = { durMs: 5000, frameW: 74, frameH: 64, frames: 4, widthPct: 6.5,
  path: [{x:-5.99,y:71.73},{x:26.08,y:68.91},{x:30.76,y:71.99},{x:38.95,y:73.30},{x:58.86,y:73.31},{x:114.91,y:64.29}] };
export const HOOD_BEATBOXER = { x: 40.1, y: 59.38, widthPct: 8.61, frames: 8, frameW: 64, frameH: 128, loopMs: 1000 };

// ---------- core/saves.ts ----------
export class SaveScheduler {
  private last = 0; private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private write: (c: Char) => void, private now = () => Date.now(), private throttle = 2000) {}
  onChange(c: Char) {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const elapsed = this.now() - this.last;
    if (elapsed >= this.throttle) { this.last = this.now(); this.write(c); }
    else this.timer = setTimeout(() => { this.last = this.now(); this.timer = null; this.write(this.latest ?? c); }, this.throttle - elapsed);
    this.latest = c;
  }
  private latest: Char | null = null;
  flush(c = this.latest) { if (this.timer) { clearTimeout(this.timer); this.timer = null; } if (c) { this.last = this.now(); this.write(c); } }
}
```

Phaser mapping:
- Scene graph: `Boot`, `Title`, `Slots`, `Create`, `Hood`, `House`, `Shop`, `Park`, `Bar`, `Battle`, plus a persistent parallel `HUD` scene (header bars, clock, cash/fans, message/settings/achievements/slots buttons, footer nav, toast stack, cutscene player, achievement fanfare, dev panel).
- Pausing: `HUD` owns `paused = cutsceneActive`; the clock service ignores ticks while paused (replaces `_gamePaused`).
- Palette/background tint from `timeOfDay` with a 1 s tween (dawn `#1c1815`, day `#1a1a1f`, dusk `#1c1418`, night `#0c0a18`; glow colours amber/amber/orange/indigo at 0.04-0.06 alpha).
- Text inputs (name, DELETE confirm, dev code, song name) must be DOM overlays (Phaser has no native input). File import/export = DOM `<input type=file>` + Blob download.
- Screen transitions: replace the 0.28 s fade (opacity + 8 px slide) with a camera fade/slide; honour `reducedMotion`.
- Studio panels (songs, crew, livestream, coaching) are list/panel UIs better done as DOM overlays or Phaser `Container` lists inside the House scene.
- Hood visuals per HoodScreen section (zones, light sprites with SCREEN blend, cat path tween, beatboxer sprite).

---

## OPEN QUESTIONS / GOTCHAS

1. **Cutscene is a single slot.** `finishSleep` schedules up to four cutscenes at 50/200/320/400 ms; each `setCutscene` replaces the previous, losing its flag (`firstRentPaid` is also set directly in state, so that one survives) and its callback. Rebuild needs a queue; decide the intended order and whether to show all.
2. **2 AM collapse != sleep.** Skips songs/crew payouts, challenge reset (`daily` counters carry over), random/bad-sleep rolls, apartment bonuses, parent/festival messages, discards `pendingDebuff` (a hangover vanishes), pays rent SILENTLY (no toast), downgrades eviction to a warning (one-week reprieve, `lastRentPaidDay` untouched). A nap that ends at 02:00 also triggers the collapse (double toast, nap benefits overwritten). Intended or accidental?
3. **Day-gates only on the hood map.** Footer nav lets players open Shop on day 1-3 and Bar at night on day 1-2 (bar day-gate 3, shop day-gate 4). Park/Bar screens check time-of-day only. Monday: hood bar hotspot unlocked at night although BAR_SCHEDULE says CLOSED.
4. **Toast timer bug.** One toast slot, 2200 ms timeout never cleared: a toast shown 1 s after another disappears after 1.2 s. Several systems stack toasts with 60-800 ms setTimeouts expecting a queue.
5. **Side effects inside `setChar` updaters** (`checkLevelUp` toasts/audio/queue; random rolls in LivestreamPanel). Breaks under StrictMode/replay; make reducers pure.
6. **`checkLevelUp` only runs from active rewards.** Passive follower gains (songs/crew/camera tripod) do not fire sound-unlock/achievement checks until the next activity. One level per call even if XP covers several.
7. **Level is meaningless** (no rewards, no gating). Keep as vanity or give it perks?
8. **Autosave edge cases.** Switching slots within 2 s of the last write drops the trailing save of the old char; "Continue" reloads from storage (up to 2 s stale); `beforeunload`/`visibilitychange` listeners are re-added on each slot change; write failures are silent; `created:false` characters are never saved (closing during creation loses the intro/creation but keeps `active_slot` pointing at an empty slot).
9. **Slot deletion leaves IndexedDB samples** (`slotN:sample-*`) so a new character inherits recorded samples; export/import omit samples entirely. Import only works into EMPTY slots and accepts any JSON with truthy `created`.
10. **Dead/odd fields:** `heat` (+2 livestream, +2/+4/+8 elsewhere) is write-only; `_sleepingNow` is tested in the `low_energy` tutorial but never set; `evictionRecoveryDay` initialised/migrated but unused in this range; `screen==='intro'` is excluded in the tutorial watcher but is never a screen; `_opponent` ephemeral key persists into saves while a battle is selected; `rentBumped` flag (random event) is never charged.
11. **Tutorial predicates:** `start_busk` can never fire on a fresh game (needs `cash<30`, start cash is 30); `low_mood` ignores mood 0 (`0||100`); tutorials can queue invisibly while on the title screen (a loaded char qualifies) and then show right after "Play".
12. **Time constants vs comments:** comment says 1 real second = 10 game minutes; code is 10 game-min per 500 ms (20/s). Mini-games override with slower ticks. Pick one canonical rate in the rebuild.
13. **Bed bonus is a no-op** (`energy = min(max, max+20)`), cross-range: new_bed gear promises +20 energy overnight but caps at max. Tier-3 apartment "+25% home recording reward / +25% studio-coaching mus reward" (comment above `APT_UPGRADES`, line ~1083) is not implemented ANYWHERE in the file: `apartmentTier` is read only for rent (`RENT_BY_TIER`), the morning mood bonus (+5/+10, tier 3 also +1 `mus`), the shop upgrade UI, two Foxy/random-event predicates and the livestream `tierBoost`.
14. **Livestream**: no hunger cost, ignores `sickDay`, can push time past 02:00, wording "tonight" but available any hour; toast does not report tips or fan gain (only viewer count is stored). Heat +2 unused.
15. **Songs**: no cap/cost/cooldown -> duplicate-release fan farming; payouts use CURRENT stats not stats at release; `SONG_DECAY` is declared twice (module + inside finishSleep); song ids from `Date.now()`; releasing requires >=4 filled cells across all 4 tracks (not 4 distinct steps).
16. **Crew**: purely economic; recruit validation not re-checked inside the updater; payout only on voluntary sleep; no crew-based effects on battles despite the "crew" word overlapping `CREWS` (3v3 battle crews, a separate system at lines 103-140).
17. **`oriSlotIdx` migration** resets any index >= 4 to 0 on every load even when the player owns the MPC (8 slots).
18. **Header has two identical gear glyphs** ("⚙" for Settings and "⚙" for Profiles/slots); the second should be a profile/slots icon.
19. **Hood cat path** is arc-length-timed in %-space on a 480x860 box, so true pixel speed is uneven (segments in y are "longer" in pixels); starts/ends outside the map (-5.99%, 114.91%) and is clipped by `overflow:hidden`. It plays on every HoodScreen mount including at night. `tools/cat-path-editor.html`, `tools/character-editor.html`, `tools/light-editor.html`, `tools/hotspot-editor.html` are referenced but not in `beatbox_story/` (only in the original repo, if at all).
20. **Hood day/night swap** is binary at 18:00 while the app palette has a separate dusk band (18:00-19:00) and dawn band (06:00-07:00); the hood has no dusk/dawn art.
21. **Eviction semantics:** no tier downgrade, no cash/gear loss, `rentLate` resets to 0, 3 days skipped (songs/crew income lost for those days, `daily` state reset). The cutscene says "stuff in two cardboard boxes" but nothing is taken.
22. **Rent is Sunday only** (`newDay % 7 === 6`) and all-or-nothing; rent paid is detected by `lastRentPaidDay === newDay` to avoid double charge. After a collapse into Sunday the first-time "Rent's paid" cutscene never plays.
23. **Name uniqueness / profanity** not validated; name is trimmed but case preserved; header uppercases.
24. **Unknown from other ranges** (verify with their inventories): exact behaviour of `SleepAnimation` / `PowerNapAnimation`, `pickRandomEvent` weights, `pickDailyChallenge` (daily rewards: jams_3 $15, openmic_1 $15, mingle_2 $10, busks_2 $12, runs_1 $8+5 mood, battle_win $30 (Sat), showcase $30 (Fri), foxy_hi +6 mood; weekly: battles 3 -> $100+20 fans, open mics 5 -> $80+15, jams 15 -> $60+10, busks 10 -> $70+8, mingles 8 -> $50+10 mood, runs 4 -> $40+15 mood), `AchievementsPanel`/`TitleScreen`/`Cutscene` internals, and whether any screen other than House/Studio can call the three studio panels.
