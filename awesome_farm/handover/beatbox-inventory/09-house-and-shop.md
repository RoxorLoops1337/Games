# 09 — HOUSE (apartment) & SHOP — feature inventory

Source: `beatbox_story/beatbox-story.jsx` lines **12624–14695** (HOUSE_LIGHT constants, `HouseScreen`, `ShopScreen`).
Everything below was read directly from the source. Constants that live OUTSIDE my range but drive behaviour inside it
(FOOD, GEAR_CATALOG, APT_UPGRADES, rent, bad-sleep, random events, ...) are copied into section 0 with their line numbers,
so the rebuild can be specified from this file alone. A bare `(NNNN)` is a single source line.

## SUMMARY
1. The HOUSE is a portrait 480x854 painted map (`house-day.png` / `house-night.png`, swapped at 18:00) with FIVE clickable hotspots: PC/Train, Studio, Kitchen, Wardrobe, Couch. Each opens a modal panel. There is NO phone hotspot, NO laundry feature and NO TV hotspot (the phone is an App-header icon; "laundry" exists only as one Foxy quip; TV lives in the Couch modal).
2. Training (PC) = 4 stats (mus/tec/ori/sho) driven by `useActivity`: tick loop (500 ms real = 10 game-min AFK; 2500 ms real = 3 game-min in play mode), 5 ticks per reward; reward = +1 stat and +10 XP, up to +3 (then x gear / BPM / festival multipliers) when the embedded mini-game (PitchTuner, BeatboxHero, Sequencer) reports accuracy/creativity; `sho` has no mini-game.
3. Kitchen = 5 buyable foods ($4-$14), free daily Foxy Soup, free daily Home Espresso (gear), houseplant watering ($5, max 3/day, 4th drowns it, replacement only from the Tuesday after death), plus an automatic once-per-week Foxy "safety net" soup when cash<5 and hunger=0.
4. Couch = Power Nap (real-time-scaled, wake manually), Sleep Till Morning (4 s animation then the huge `_finishSleepImpl` morning transition), Downtime (TV/Games), Move Out (apartment tier 2 $1500 / tier 3 $5000), Yoga-mat meditation.
5. The morning transition (13089-13414) is the economic heart: Sunday rent (50/100/200; 3 strikes = evicted + 3 couch-surf days), song-royalty fans (7-day decay), crew daily cash/fans, 30% random event, 10% bad sleep, 25% flashback, 5% dream (day>=30), daily/weekly challenge re-roll, parent/anon/Rohzel messages, festival invite.
6. Wardrobe = outfit + accessory pickers (cosmetic, milestone-gated). Studio = embeds SoundStudio, SongsLibrary, CrewPanel, LivestreamPanel, BjarneCoachingPanel (last four summarised here because their numbers matter).
7. The SHOP is a hub of 4 day-gated sub-stores (Music d4, Furniture d5, Clothing d7, Pet d10) selling 14 one-time gear items, plus a Sounds Catalog screen (view/equip only; sounds are NOT purchasable any more — they unlock via milestones).
8. A Goals popup (first-week checklist + daily + weekly challenge with CLAIM buttons) and a Foxy roommate panel/modal (context tips, +2 mood wave, one-time $15 loan) sit above the map.
9. Real bugs/oddities to know before porting: Memory-Foam Bed has NO effect (`Math.min(max, max+20)`); apartment-tier "bad sleep less common" and "+25% home recording" are not implemented; the tec BPM multiplier also applies in AFK mode; overlapping morning cutscenes clobber each other; a nap to 2 AM is overwritten by the collapse watcher. See OPEN QUESTIONS / GOTCHAS.
10. Pure-logic extraction is easy: nearly everything is `setChar(c => ...)` over a plain `char` object plus `Math.random()`; a framework-free `house.ts` with an injected RNG can host eat / train-reward / sleep / rent / plant / shop / apartment rules (Appendix A).

---

## 0. CROSS-CUTTING DEFINITIONS (defined outside my range, but required)

### 0.1 Time model (lines 1030-1077)
- `char.minutes` = game minutes since 06:00. `0` = 06:00, `720` = 18:00 (night begins), `1080` = 00:00, `1200` = 02:00 = `DAY_END` (forced collapse).
- Clock string: `((mins+360) % 1440)` -> `HH:MM`. `isDayTime(m) = m < 720`.
- `TICK_MINUTES = 10` game-min per activity tick; `TICK_REAL_MS = 500` real ms per tick (AFK: 1 real s = 20 game-min).
- Day of week: `dayOfWeek(day) = day % 7`, 0=MON, 1=TUE, ..., 6=SUN. **Day 1 is a Tuesday.** Sundays = days 6, 13, 20, ...; Mondays = 7, 14, 21, ... (day%7 == 0).
- `daysToNextTuesday(from)`: `dow == 1 -> 7`, else `((1 - dow) + 7) % 7`.
- `replantAvailableDay(c)`: `0` if `!plantDead`, else `(plantDeathDay || day) + daysToNextTuesday(plantDeathDay || day)` (= first Tuesday strictly after the death day).

### 0.2 Passive mood decay (lines 712-734) — used by almost every action
```
perHour = 0.3  (+0.5 if hunger < 30) (+0.5 if energy < 30) (+1.0 if hunger == 0) (+1.0 if energy == 0)
moodDrain(c, minutes) = minutes / 60 * perHour
passMinutes(c, n)     = { minutes: c.minutes + n, mood: max(0, c.mood - moodDrain(c, n)) }
clampPct(v)           = clamp(v, 0, 100)
```
Pattern used everywhere: `t = passMinutes(c, n); mood = clampPct(t.mood + bonus)` — the bonus is applied AFTER the decay.

### 0.3 FOOD (lines 79-85) — Kitchen menu
| key | name | cost | energy | hunger | mood | kind |
|---|---|---|---|---|---|---|
| banana | Banana | 4 | +12 | +15 | +1 | food |
| smoothie | Green Smoothie | 9 | +25 | +20 | +3 | drink |
| oat_bowl | Oat Bowl | 7 | +18 | +35 | +2 | food |
| espresso | Espresso | 5 | +25 | -15 | +2 | drink |
| buddha_bowl | Buddha Bowl | 14 | +22 | +50 | +4 | food |

### 0.4 GEAR_CATALOG (2039-2100), STORE_META (2103-2108), store gating (1199-1209)
One-time purchases stored as `char.gear[id] = true` (14 items). "Where it really applies" is what the code does, which sometimes differs from the catalog text.

| id | name | store | cost | catalog description | where it really applies |
|---|---|---|---|---|---|
| pc | Studio PC | music | 800 | +25% to Tec & Ori training stat gains | HouseScreen onReward (12804) |
| mpc | Pro MPC (BBX-32) | music | 600 | Doubles your sequencer slots (4 -> 8) | Sequencer `slotCount` (14150); buyGear pads `oriSlots` to 8 (14503) |
| mic | Studio Condenser Mic | music | 500 | +25% to all mic-mode + Mus reward; better PitchTuner accuracy | x1.25 on Mus gain (12805) and x1.15 BeatboxHero `accuracyBoost` (14078); nothing passed to PitchTuner |
| premium_headphones | Premium Headphones | music | 250 | +25% accuracy in BeatboxHero mic-mode | x1.25 BeatboxHero `accuracyBoost` (14078, also Battle 18726); unlocks the 'headphones' accessory |
| studio_monitors | Studio Monitors | music | 300 | +25% to ori sequencer creativity score | creativity x1.25 before thresholds (12793) |
| camera_tripod | Camera + Tripod | music | 200 | Auto-posts your clips · +1 follower/day passively | +1 follower each morning (13189) |
| new_bed | Memory-Foam Bed | furniture | 600 | +20 max-energy boost the morning after a full sleep | **BROKEN — no effect** (13161-13162) |
| houseplant | Houseplant | furniture | 50 | +1 mood every morning if it stays alive (water = $5/3 days) | morning +1 mood (13171); watering (12930) |
| coffee_machine | Coffee Machine | furniture | 120 | One free home espresso per day (+25E, -15H, +2M) | Kitchen row (12874) |
| yoga_mat | Yoga Mat | furniture | 60 | Daily meditate action: +5 mood, 10 game min | Couch button (12916) |
| earplugs | Earplugs | furniture | 30 | Removes "noisy upstairs" + "heating stuck" bad-sleep reasons | `FILTERED_BAD_SLEEP` (line 74) |
| wardrobe_refresh | Wardrobe Refresh | clothing | 200 | +1 sho gain on every battle / open mic / showcase | other screens (15707, 15934, 18422) |
| premium_shoes | Premium Running Shoes | clothing | 150 | +1 extra sho per run reward block | Park (14920) |
| cat | Cat 🐈 | pet | 100 | +2 mood every morning · costs $3/day in food | morning (13184) |

- STORE_META: `music {display:'Music Store', color:'#22d3ee', icon:'🎵'}`, `furniture {'Furniture Store', '#84cc16', '🛋️'}`, `clothing {'Clothing Store', '#fb7185', '👕'}`, `pet {'Pet Store', '#fbbf24', '🐾'}`.
- CONTENT_UNLOCKS: `store_music` day 4 (label 'Day 4'), `store_furniture` day 5, `store_clothing` day 7, `store_pet` day 10. `isUnlocked(c, key) = c.day >= CONTENT_UNLOCKS[key].day`. (The Shop location itself unlocks day 4, bar day 3, mingle day 5 — navigation lives outside my range.)
- Totals per store: music 6, furniture 5, clothing 2, pet 1. Achievement 'Completist (Gear)' expects `Object.keys(gear).length >= 14`.

### 0.5 Apartments & rent (lines 1079-1097, 1217-1230)
- `RENT_BY_TIER = [50, 100, 200]` weekly; `COUCHSURF_DAYS = 3`.
- `APT_UPGRADES[2] = {cost:1500, dayReq:14, fansReq:30, name:'Real apartment', desc:'A bedroom. A kitchen. A door that locks. +5 mood every morning. Bad-sleep events less common.'}`
- `APT_UPGRADES[3] = {cost:5000, dayReq:30, fansReq:200, name:'Loft with home studio', desc:'Skyline view. Mixing desk. +10 mood every morning. +1 mus every full sleep. +25% home recording reward.'}`
- `computeRentEvent(c, newDay)`:
  - returns `null` unless `newDay % 7 === 6` (Sunday) and `c.lastRentPaidDay !== newDay`;
  - `amount = RENT_BY_TIER[tier-1]`;
  - `cash >= amount` -> `{type:'paid', amount, firstTime: !storyFlags.firstRentPaid}`;
  - else `next = rentLate + 1`: `>= 3` -> `'evicted'`, `== 2` -> `'warning'`, else `'missed'`.
  - Always evaluated against cash BEFORE any morning income.

### 0.6 Sounds (lines 6-65)
SOUND_CATALOG (12 sounds; fields `{name, cat, tier, stamina, base, stat}`) and the milestone that unlocks each (`SOUND_UNLOCKS`, shown in the Shop catalog as `label`):

| id | name | cat | tier | stam | base | stat | unlock label (condition) |
|---|---|---|---|---|---|---|---|
| classic_kick | Classic Kick | Kicks | 1 | 8 | 12 | musicality | Start |
| hi_hat | Basic Hi-Hat | Hats | 1 | 4 | 7 | technicality | Start |
| psh_snare | PSH Snare | Snares | 1 | 6 | 10 | musicality | Start |
| inward_k | Inward K Snare | Snares | 2 | 9 | 16 | technicality | Find the cypher · 3 jams (`storyFlags.jamCount >= 3`) |
| throat_kick | 808 Throat Kick | Kicks | 2 | 12 | 20 | musicality | Beat Pig Pen (`pigPenWins >= 1`) |
| fast_hats | Fast Hi-Hats (TKs) | Hats | 2 | 10 | 15 | technicality | 5 open mics performed (`openMicCount >= 5`) |
| lip_roll | Lip Roll | Liproll | 2 | 11 | 17 | originality | Originality stat ≥ 10 |
| inward_bass | Inward Bass | Bass | 3 | 14 | 22 | originality | Beat Sikker (`defeated` includes) |
| d_low | D-Low Scratch | Scratch | 3 | 15 | 25 | originality | 200 followers |
| laser | Laser Whistle | Whistles | 3 | 13 | 23 | originality | Beat Alim |
| click_roll | Click Roll | Clicks | 3 | 16 | 26 | technicality | 500 followers |
| uvular_roll | Uvular Kick Roll | Kicks | 4 | 22 | 38 | technicality | Beat FatboxG |

Unlocks are applied inside `checkLevelUp` (11385) via `applySoundUnlocks` (auto-equips while `equipped.length < 5`), with toast `🔓 Unlocked: <name>`.

### 0.7 Beatbox Hero lessons (4190-4213) — Technicality play-mode lesson list (12)
| # | name | desc | tier | style | requires (sound owned) |
|---|---|---|---|---|---|
| 1 | BOOM BASIC | Kick on every beat | 1 | BOOM | — |
| 2 | BACKBEAT | Kick on 1 & 3, snare on 2 & 4 | 1 | SNARE | — |
| 3 | HI-HAT 8THS | Hat on every 8th note | 1 | HATS | — |
| 4 | KIT GROOVE | Boom + snare + 8th hats | 2 | SNARE | — |
| 5 | WITH RIMSHOT | Kit groove + rim accents | 2 | RIM | — |
| 6 | LIP ROLL DRILL | Lip rolls on the offbeats | 2 | HATS | lip_roll |
| 7 | 808 THROAT | Heavy throat-kick groove | 2 | BOOM | throat_kick |
| 8 | FAST HATS | TKs doubling the hi-hat lane | 2 | HATS | fast_hats |
| 9 | INWARD SNARE | Alternate snare voice | 2 | SNARE | inward_k |
| 10 | INWARD BASS | Deep inward bass kick | 3 | BOOM | inward_bass |
| 11 | CLICK ROLL | Click roll fills | 3 | RIM | click_roll |
| 12 | UVULAR FINALE | All four advanced sounds | 4 | BOOM | uvular_roll |

### 0.8 Sequencer constants (4968-5004)
- `SEQ_STEPS = 16`, `SEQ_SLOTS = 4`, `SEQ_SLOTS_MPC = 8`.
- Pattern = `{ name, tracks: [{ key, cells: bool[16] }] }`, keys B, Pf, T, K.
- `_seqStarter(i)`: 0 'Boom Bap' (B@0,8; Pf@4,12; T@0,2,...,14), 1 '4 on Floor' (B@0,4,8,12; Pf@4,12; T@2,6,10,14), 2 'Half-Time' (B@0,6; Pf@8; T even steps; K@10,14), otherwise 'Empty'. `_seqDefaultSlots()` = starters 0..3.

### 0.9 Outfits & accessories (644-678) — Wardrobe tab data
OUTFITS (11; `shirt` = swatch colour):
| id | name | shirt | unlock text | condition |
|---|---|---|---|---|
| default | Default | char.color | Your everyday color | always |
| tracksuit | Track Suit | #1a1a1a | After signing Adipas | `storyFlags.sponsor_adipas_signed` |
| stage_gold | Stage Gold | #fbbf24 | 100 followers | followers >= 100 |
| red_devil | Red Devil | #dc2626 | Beat Pig Pen twice | `pigPenWins >= 2` |
| champion_white | Champion White | #dadada | Win BBBWC2027 | `storyFlags.festivalWon` |
| romance_pink | Mira's Hand-Stitched | #fb7185 | Mira couple | `romanceState.mira == 'couple'` |
| romance_lime | Sky's Joke Shirt | #84cc16 | Sky couple | sky couple |
| romance_cyan | Luca's Studio Tee | #22d3ee | Luca couple | luca couple |
| romance_amber | Pascal's Press Tee | #fbbf24 | Pascal couple | pascal couple |
| romance_violet | Jin's Studio Wrap | #a78bfa | Jin couple | jin couple |
| romance_rose | Roo's Festival Pass | #fb7185 | Roo couple | roo couple |

ACCESSORIES (7):
| id | name | unlock text | condition |
|---|---|---|---|
| none | None | — | always |
| cap | Snapback | 5 open mics done | openMicCount >= 5 |
| beanie | Studio Beanie | Train with BeeAmGee 3x | bjarneSessions >= 3 |
| shades | Shades | 50 followers | followers >= 50 |
| glasses | Round Glasses | Pascal couple | romanceState.pascal == 'couple' |
| fedora | Fedora | 10 jams done | storyFlags.jamCount >= 10 |
| headphones | Headphones | Buy premium headphones | gear.premium_headphones |

### 0.10 `useActivity` engine (2139-2258) — drives AFK training
- Returns `{ active, block, rewardsEarned, start, stop }`. Config: `{ blocksPerReward, tickEnergyCost, tickHungerCost, tickMoodDelta, tickRealMs?, tickMinutes?, onReward, stopWhen? }`.
- Each tick (reads latest char via ref; **skipped while a cutscene is up** via `_gamePaused`):
```
tickMins  = cfg.tickMinutes ?? 10
newMins   = c.minutes + tickMins
newEnergy = max(0, c.energy - cfg.tickEnergyCost)
newHunger = max(0, c.hunger - cfg.tickHungerCost)
newMood   = clampPct(c.mood + (cfg.tickMoodDelta || 0) - moodDrain(c, tickMins))
stopReason (first match):
   newEnergy < cfg.tickEnergyCost                 -> 'You collapsed from exhaustion'
   newHunger <= 0 && cfg.tickHungerCost > 0       -> 'Too hungry to keep going'
   newMins >= 1200                                -> 'It got too late — heading home'
   cfg.stopWhen(probe)                            -> cfg.stopReason || 'Activity ended'
apply state; block++; if block >= blocksPerReward: block = 0, rewardsEarned++, cfg.onReward()
if stopReason: stop interval, toast(stopReason, 'bad')
```
- `start()`: no-op if already active; `energy < tickEnergyCost` -> toast 'Too tired to start!'; `sickDay === day` -> toast 'Too sick to do anything today'; else interval of `cfg.tickRealMs || 500` ms. The interval is re-created if `tickRealMs` changes mid-activity.
- Force-stops if `char.day` changes under it (2 AM collapse). `stop(reason)` toasts reason (`'bad'` if it contains '!', else `'info'`). Unmounting the screen clears the interval.

### 0.11 Misc helpers used by this range
- `checkLevelUp(c)` (11385): `need = level * 100`; if `xp >= need` -> `level+1`, `xp -= need` (only ONE level per call), toast `LEVEL UP! → N`; then applies sound unlocks + achievements.
- `playCutscene(props, flagKey?, after?)` (11157): ONE global cutscene slot (a second call replaces the first); on completion sets `storyFlags[flagKey] = true`. Cutscene props: `{ speaker, speakerColor, beats: [{ drawScene?(ctx, fc), lines[] }] }`.
- `showToast(msg, type)` (11368): types `'win' | 'bad' | 'info'`; single slot, 2.2 s.
- `bumpDaily(c, counter)` (535) bumps BOTH `daily` and `weekly` counters.
- UI atoms: `PixelIcon(name,size)`, `PixelScene({draw, w=200, h=130, scale=3})`, `ProgressBar({block, total=5, label, color})`, `Btn({variant: default|primary|danger|ghost})`, `Panel({title})`, `FoxyAvatar({size, animate})`.

---

## 1. HOUSE LIGHTS — `HOUSE_LIGHT_KINDS`, `HOUSE_LIGHTS`  (12626-12673)
- What: data-driven soft-glow overlays drawn between the painted map and the hotspot buttons (`pointer-events:none`, `mix-blend-mode: screen`). Positions come from a separate `tools/light-editor.html` (Map -> Apartment).
- Entry fields: `id, kind, t, l, w, h` (percent of the map box), optional `dayOnly`, `nightOnly`, `opacityDay`, `opacityNight` (scale opacity per time of day; no current entry sets them -> 1). `edge` colours in KINDS are not used by the renderer.
- Visibility: `dayOnly && !isDay -> hidden`; `nightOnly && isDay -> hidden`; `isDay = minutes < 720`.

Kinds:
| kind | name | gradient | CSS animation |
|---|---|---|---|
| sun | Window sun-shaft | `radial-gradient(ellipse at 30% 20%, rgba(255,220,150,0.35), rgba(255,220,150,0) 65%)` | `houseSun 8s ease-in-out infinite`: opacity .85 -> 1 (50%) -> .85 |
| monitor | PC monitor | `radial-gradient(ellipse at center, rgba(150,210,255,0.55), rgba(150,210,255,0) 75%)` | `houseMonitor 1.6s ease-in-out infinite`: 0% .85, 40% 1, 42% .55, 44% 1, 60% .95, 100% .85 (glitch flicker at 40-44%) |
| rec | Studio rec light | `radial-gradient(circle at center, rgba(255,80,80,0.9), rgba(255,80,80,0) 70%)` | `houseRecLight 2.4s ease-in-out infinite`: .8 -> .4 (50%) -> .8 |
| ceiling | Kitchen ceiling | `radial-gradient(ellipse at 50% 0%, rgba(255,205,120,0.35), rgba(255,205,120,0) 75%)` | `houseKitchen 5s ease-in-out infinite`: .85 <-> 1 |
| tv | TV glow | `radial-gradient(ellipse at center, rgba(120,180,255,0.6), rgba(120,180,255,0) 75%)` | `houseTv 1.2s steps(6) infinite`: 0% .6, 16% .95, 33% .7, 50% 1, 66% .75, 83% .9, 100% .6 (`steps(6)` applies per keyframe segment => choppy ~30 fps flicker) |

Instances (percent of map; px at 480x854 = x, y, w, h):
| id | kind | top | left | w | h | gate | sits over |
|---|---|---|---|---|---|---|---|
| sun1 | sun | 4.81 | 5.78 | 26.31 | 23.65 | **dayOnly** | window above PC area (27, 41, 126, 202) |
| monitor1 | monitor | 14.25 | 29.31 | 10.79 | 7.25 | always | PC monitor (141, 122, 52, 62) |
| rec1 | rec | 16.43 | 79.4 | 4 | 3 | **nightOnly** | studio REC light (381, 140, 19, 26) |
| ceiling1 | ceiling | 34 | 54 | 44.23 | 17.77 | always | kitchen ceiling (259, 290, 212, 152) |
| tv1 | tv | 64.91 | 4.51 | 21.49 | 14.46 | always | TV at left of lounge (22, 554, 103, 124) — not inside any hotspot |
| ceilingmp5m8rk1 | ceiling | 5.01 | 53.02 | 40.48 | 11.09 | always | studio ceiling (254, 43, 194, 95) |
| ceilingmp5m9jrv | ceiling | 68.56 | 72.86 | 20.31 | 16 | always | couch-corner ceiling (350, 586, 98, 137) |

- State: none (pure presentation, reads `minutes`).
- Rebuild: pre-render each gradient as a radial alpha texture, add as Image with `blendMode = SCREEN` (or ADD), tween `alpha` per keyframe table (yoyo/timeline); TV = 6-sub-step stepped timeline per segment. Show/hide sun1 and rec1 on the `minutes < 720` boundary. Light data can be moved to JSON.

---

## 2. HouseScreen — shell, props, state, layout  (12675-12689, 13415-13459)
- Signature: `HouseScreen({ char, setChar, passTime, showToast, checkLevelUp, go, activeSlot, playCutscene })` (App also passes `update`, `updateStats`; ignored). `passTime` and `go` are unused. `activeSlot` is forwarded only to `SoundStudio`.
- Local state:
  - `tab`: null | 'train' | 'studio' | 'eat' | 'wardrobe' | 'rest' (null = only the map).
  - `trainStat`: null | 'mus' | 'tec' | 'ori' | 'sho'; `pendingStart`; `playMode` (false = AFK, true = mini-game).
  - `tecInputMode`: 'tap' | 'mic' (default 'tap'); `tunerMode`: 'beginner' | 'advanced' | 'karaoke' (default 'beginner'); `showRangePicker`.
  - `sleeping`, `napping`, `foxyOpen`, `challengesOpen`.
- Refs: `charRef` (latest char for `onReward`), `accuracyRef` (latest mini-game accuracy/creativity 0..1; `handleAccuracy(acc)` just stores it), `foxyTipRef` / `foxyTipKeyRef`.
- Early returns (after ALL hooks):
  - `sleeping` -> `<SleepAnimation char onComplete={finishSleep} />` — full-screen, `durationMs = 4000`, `drawSleepScene(progress)`, rooster sound at 85%, labels 'Drifting off…' (<40%), 'Sleeping' (<85%), '🐓 Cock-a-doodle-doo'.
  - `napping` -> `<PowerNapAnimation char onWake={finishNap} />` (see 10.1).
- Layout top to bottom: header `THE HOUSE` (Bebas Neue 2xl, tracking-widest) + `Your home base`; Foxy panel (+ modal); Goals button (+ popup); the map; the tab modal.
- Rebuild: Phaser `HouseScene` + overlay UI; `SleepScene` and `NapScene` as separate scenes started from the Couch.

---

## 3. FOXY SAFETY-NET (automatic soup)  (12691-12731)
- Trigger: `useEffect` on `[day, cash, hunger, lastFoxySafetyNetDay]` — runs whenever the HouseScreen is mounted/updated (i.e. you walk into the house).
- Conditions (all): `cooled = (day - lastFoxySafetyNetDay) >= 7 || lastFoxySafetyNetDay === 0`; `cash < 5`; `hunger <= 0`.
- Effect (`setChar`): `hunger = max(hunger, 40)`; `mood = min(100, mood + 5)`; `lastFoxySafetyNetDay = day`; `storyFlags.foxyFirstSafetyNet = true`; phone message from `'foxy'` = random `FOXY_QUIPS` (8 ambient lines: "the plant's still alive. barely.", "i made too much soup again.", "the kettle's still warm if you want tea.", "i'm at work till seven. don't burn anything.", "the heating's making that noise again.", "matcha?", "you've been weird this week. you good?", "post comes around four. i'll grab yours.").
- First time only (`!storyFlags.foxyFirstSafetyNet`): after 50 ms `playCutscene({speaker:'FOXY', speakerColor:'#84cc16', beats:[{drawScene: drawFoxySoupScene(look), lines:["i made too much.", "eat."]}]}, 'foxyFirstSafetyNet')`.
- Later times: toast `Foxy left soup on the counter (+40 hunger)` ('win'), no cutscene.
- Cost: none. State: `hunger, mood, lastFoxySafetyNetDay, storyFlags.foxyFirstSafetyNet, messages`.
- Notes: this is the soft-lock escape (Sleep is blocked at hunger 0). The toast says "+40" but the effect is "raise to at least 40".
- Rebuild: `foxySafetyNet(c, rng): Result | null`, called on House scene entry (`create()`) and after any cash/hunger change while the scene is active.

---

## 4. APARTMENT MAP + HOTSPOTS  (13664-13770)
- Container: `relative w-full max-w-md mx-auto`, `aspect-ratio: 480 / 854`, background `#0c0a09`, 2px stone border.
- Background image: `house-day.png` if `isDay` else `house-night.png` (both 480x854 PNG, `image-rendering: pixelated`). **Rule: `minutes < 720` day, else night — binary swap, no dusk/dawn variant.** Alt text "The apartment".
- Lights overlay (section 1) is rendered under the hotspot buttons.

Hotspots (`houseHotspots`, 13670-13676; percent of the map box; px at 480x854):
| id | label | top | left | width | height | px (x, y, w, h) | icon | opens |
|---|---|---|---|---|---|---|---|---|
| train | PC | 4.06 | 9.07 | 38.53 | 29.77 | 44, 35, 185, 254 | pc | tab 'train' — modal title 'PC / Train' |
| studio | Studio | 3.46 | 52.27 | 42.67 | 29.87 | 251, 30, 205, 255 | mic | tab 'studio' — 'Studio' |
| eat | Kitchen | 35.37 | 59.07 | 37.6 | 28.44 | 284, 302, 181, 243 | fridge | tab 'eat' — 'Kitchen' (panel 'Fridge — wholefood plant-based') |
| wardrobe | Wardrobe | 35.67 | 3.6 | 51.87 | 22.67 | 17, 305, 249, 194 | star | tab 'wardrobe' — 'Wardrobe' |
| rest | Couch | 68.27 | 41.47 | 50.93 | 22.9 | 199, 583, 245, 196 | couch | tab 'rest' — 'Couch' (panel 'The Couch') |

- Rectangles do not overlap. The painted TV (see `tv1`) is not clickable.
- Button behaviour: transparent, `aria-label` and `title` = label; `onClick -> setTab(id)`; `disabled = trainActivity.active` (then `opacity-30 cursor-not-allowed`; otherwise hover `scale 1.02`, active `scale .95`).
- Label pill: horizontally centred at `bottom: 4px` of its rectangle; `PixelIcon(icon, 12)` + label, Bebas Neue 10px uppercase tracking-widest. When `tab === id`: `bg-amber-500 text-stone-950 font-bold`; otherwise `bg-stone-950/80 text-stone-200 border border-stone-700`.
- Availability: ALWAYS available (no day, time-of-day or stat gating) except disabled while a training activity is running.
- Rebuild (Phaser): `HouseScene` at 480x854 (scale-fit), 5 interactive `Zone`s with the rects above, pill labels as small containers, texture swap by `minutes < 720`, lights per section 1; disable zones while the training loop runs.

---

## 5. TAB MODAL CHROME  (13772-13794, 12828-12837)
- `fixed inset-0 z-50` overlay, centred card `max-w-md`, `max-h-[92vh]` (88vh on sm+), amber-500/40 border, sticky header = `PixelIcon + title` + × button.
- Header title/icon: train 'PC / Train' (pc), studio 'Studio' (mic), eat 'Kitchen' (fridge), wardrobe 'Wardrobe' (star), rest 'Couch' (couch).
- Close methods: backdrop click, × button, Escape key (`keydown` listener). All three are IGNORED/disabled while `trainActivity.active` — the modal is locked open until you press STOP.
- `tab` is part of Foxy's tip-cache key, so opening/closing a modal can re-roll the roommate quote.
- Rebuild: generic `ModalPanel(title, icon, content)`.

---

## 6. PC / TRAIN TAB  (13796-14194) + training config (12733-12853)

### 6.1 Stat config (`trainConfig`, 12733-12738)
| key | name | description | tickEnergyCost | colour | icon | AFK scene |
|---|---|---|---|---|---|---|
| mus | Musicality | Watch beatbox vids on YouTube | 1.5 | #D4A017 | music | drawMusicalityScene (10036) |
| tec | Technicality | Drill on Discord with the squad | 2 | #C8DCEF | zap | drawTechnicalityScene (10181) |
| ori | Originality | Experiment, record loops | 2.5 | #a78bfa | sparkle | drawOriginalityScene (10377) |
| sho | Showmanship | Stream live, work the camera | 1 | #CC2200 | crown | drawShowmanshipScene (10497) |

Scenes are `PixelScene` 200x130 scaled x3, drawn with `lookFromChar(char)` = `{shirt: activeOutfitShirt(char), skin, hair, style, accessory (only if still unlocked)}` (16597).

### 6.2 Entry check / stat list (13798-13863)
- Shown while `!trainActivity.active`. Panel title "Tap a stat to start training". One row per stat: icon, `{Name} · {current stat}`, description, and either `START ▶` + `-{cost}⚡/tick` or a locked state.
- `blockReason(cost)` — first match wins:
  1. `sickDay === day` -> 'Too sick to train' (hint 'Rest until tomorrow')
  2. `energy < cost * 3` -> 'Too tired' (hint 'Power nap on the couch') — thresholds: mus 4.5, tec 6, ori 7.5, sho 3
  3. `hunger < 15` -> 'Too hungry' (hint 'Eat in the kitchen')
  4. `mood < 15` -> 'Too grumpy' (hint 'Watch TV or take a walk')
- Locked row: rose styling, `🔒 {reason}` + hint; click toasts `"{reason} · {hint}"` ('bad'). Unlocked click: `setTrainStat(key); setPendingStart(true)`.
- `pendingStart` effect (12839-12845): when `pendingStart && trainStat && !active` -> `setPendingStart(false); trainActivity.start()` (so the per-stat config is in the ref first).
- Reset effect (12847-12853): whenever `!trainActivity.active` -> `playMode = false`, `accuracyRef = 0`.

### 6.3 Activity config (12742-12756)
```
blocksPerReward: 5
tickEnergyCost : playMode ? cost * 0.3 : cost        // play mode: mus .45, tec .6, ori .75, sho .3
tickHungerCost : playMode ? 0.5 : 1
tickMoodDelta  : playMode ? -0.15 : -0.3             // plus passive drain (0.05/tick AFK, 0.015/tick play; more when hungry/tired)
tickRealMs     : playMode ? 2500 : (default 500)
tickMinutes    : playMode ? 3 : (default 10)
```
Per +1 reward (5 ticks):
- AFK: 50 game-min, 2.5 s real; energy mus 7.5 / tec 10 / ori 12.5 / sho 5; hunger 5; mood about -1.75.
- Play mode: 15 game-min, 12.5 s real; energy mus 2.25 / tec 3 / ori 3.75; hunger 2.5; mood about -0.83.
- Stops per the `useActivity` rules (0.10): collapse, hunger 0, 02:00.

### 6.4 `onReward` — stat gain formula (12758-12824)
Reads `charRef.current` and `accuracyRef.current` (`acc`).
```
statGain = 1; bonusText = ''
mus : acc >= 0.8 -> 3 ' (perfect pitch!)' ; acc >= 0.5 -> 2 ' (+1 bonus)' ; else 1
tec : if !playMode -> 1
      else acc <= 0 -> 0 ; acc >= 0.8 -> 3 ' (locked in!)' ; acc >= 0.5 -> 2 ' (+1 bonus)' ; else 1
      if statGain > 0: bpmMult = max(1, (tecBpm || 90) / 90)
                       if bpmMult > 1: statGain = round(statGain * bpmMult); if increased bonusText += ` (×${bpmMult.toFixed(2)} BPM)`
      // NOTE: BPM multiplier is applied in AFK mode too, using the persisted tecBpm
ori : cv = acc; if studio_monitors: cv *= 1.25
      cv >= 0.8 -> 3 ' (creative!)' ; cv >= 0.5 -> 2 ' (+1 bonus)' ; else 1
      if studio_monitors: bonusText += ' · 🎚️'      // appended even when it changed nothing
sho : 1 always
if statGain > 0:
    gearMult = 1
    (tec or ori) && gear.pc          -> gearMult *= 1.25
    mus && gear.mic                  -> gearMult *= 1.25
    festivalState === 'prepping'     -> gearMult *= 2
    if gearMult > 1: statGain = round(statGain * gearMult); if increased bonusText += (prepping ? ' · 🌟 prep' : ' · 🎛️')
if statGain > 0: xp += 10; stats[trainStat] += statGain; checkLevelUp; toast `+${statGain} ${StatName}${bonusText}` ('win')
else: toast `Block ended — no ${StatName} gain. Keep playing!` ('info')   // only tec play mode with acc <= 0; no XP
```
- JS `Math.round` rounds .5 up. With gear x1.25: base 1 -> 1 (no benefit), 2 -> 3, 3 -> 4. With festival prep (x2): 1 -> 2, 2 -> 4, 3 -> 6. With prep + gear (x2.5): 1 -> 3, 2 -> 5, 3 -> 8. BPM x1.556 at 140 BPM: 3 -> 5.
- `rewardsEarned` increments on every block including zero-gain ones.

### 6.5 In-progress panel (13865-14192) — title "Training {Name} — IN PROGRESS"
Pixel scene is shown when `!playMode || trainStat === 'sho'`.

**MUS, AFK (13880-13925)**
- 3 mode cards from `TUNER_MODES`: `beginner` label 'Beginner' tag 'echo each note' (triads, alternating listen/sing, 2500 ms per note); `advanced` 'Advanced' / '3 in a row' (do-re-mi, demo-then-sing, 1000 ms); `karaoke` 'Karaoke' / '5-note melody' (demo-then-sing, 700 ms). Selected = amber.
- Big button "🎤 SING ALONG · TAP TO START" with sub-text per mode: beginner 'Full triads · echo each note one at a time'; advanced 'Do-re-mi · listen to all 3, then sing all 3 back'; karaoke '5-note melody · listen, then sing the whole phrase back'.
- Click: `accuracyRef = 0`; if `!char.voiceRange` -> `showRangePicker = true`, else `playMode = true`.

**VoiceRangePicker (13926-13936)**
- `<VoiceRangePicker currentRange={char.voiceRange} onSet={({voiceRange, voiceRangeMidi}) => { setChar(voiceRange, voiceRangeMidi); showRangePicker = false; playMode = true }} onCancel={() => showRangePicker = false} />`. `voiceRange` ∈ 'higher' | 'lower' | 'auto' (auto = mic calibration -> a midi note).

**MUS, play mode (13937-13972)**
- `<PitchTuner onAccuracyUpdate={handleAccuracy} evaluateEveryMs={2500} active={trainActivity.active} voiceRange={char.voiceRange || 'higher'} voiceRangeMidi={char.voiceRangeMidi} mode={tunerMode} />`.
- Inline 3-button mode toggle (`{label} · {tag}`).
- Buttons: `🎤 Range: Lower|Auto|Higher (change)` (-> `playMode=false; showRangePicker=true`) and `◀ Back to AFK` (-> `playMode=false; accuracyRef=0`).
- The reward uses the most recent PitchTuner evaluation (every 2.5 s) at the moment the 5th tick completes.

**TEC, AFK (13973-13989)**
- Big button "🎮 BEATBOX HERO · TAP TO START" ("Hit the notes in time → up to ×3 stat gain") -> `accuracyRef=0; playMode=true`.

**TEC, play mode (13990-14123)**
- Lesson strip: 12 buttons `#1..#12`; lesson `i` is playable iff `i <= (tecLessonsCompleted||0)` AND (no `requires` OR the sound is in `char.sounds`). Locked ones show `🔒 #n`, disabled, 40% opacity.
- Selected index = `min(tecCurrentLesson || 0, 11)`; if not playable, walk downwards to the highest playable one.
- Header `#{n} {lesson.name}` + `lesson.desc`; requirement line green `✓ uses {SoundName}` or amber `🔒 needs {SoundName} (buy in shop)` (stale wording: sounds are milestone unlocks).
- Input toggle `Tap pads` / `🎤 Mic` (`tecInputMode`). Mic mode hint: "Tip: headphones recommended · mic pauses during the demo".
- `<BeatboxHero onAccuracyUpdate={handleAccuracy} inputMode={tecInputMode} accuracyBoost={(premium_headphones ? 1.25 : 1) * (mic ? 1.15 : 1)} onLessonComplete={(idx, accuracy) => ...} evaluateEveryMs={2500} active={trainActivity.active} bpm={char.tecBpm || 90} lessonIdx={currentIdx} />` (mode defaults to 'practice').
- `onLessonComplete(idx)`: if `idx >= tecLessonsCompleted` -> `tecLessonsCompleted = min(12, idx + 1)`; if `idx + 1 < 12` -> `tecCurrentLesson = idx + 1` (auto-advance).
- BPM control: `−` / `+` (pointer-down) step ±5, clamped **60..140**, default 90; label `{bpm} BPM` and `×{bpmMult.toFixed(2)} bonus` (if >1) or 'normal pace'. Then `◀ Back to AFK`.

**ORI, AFK (14124-14140)**
- Big button "🥁 BEAT SEQUENCER · TAP TO START" ("Program your beats → up to ×3 stat gain").

**ORI, play mode (14141-14180)**
- `<Sequencer onCreativityUpdate={handleAccuracy} evaluateEveryMs={2500} active={trainActivity.active} bpm={char.oriBpm || 100} slots={char.oriSlots} slotIdx={char.oriSlotIdx || 0} slotCount={mpc ? 8 : 4} ownedSounds={char.sounds || []} onPatternChange onSlotChange onBpmChange />`.
- `onPatternChange(p)`: `target = mpc ? 8 : 4`; if `oriSlots` is an array of length `target` copy it; else rebuild = `_seqDefaultSlots()` padded with `_seqStarter(i % 4)` up to `target`, then overlay any existing slots; `slots[oriSlotIdx] = {...p, name: slots[idx]?.name || p.name}`.
- `onSlotChange(idx)` -> `oriSlotIdx`; `onBpmChange(b)` -> `oriBpm`. Then `◀ Back to AFK`.

**SHO**
- No play mode; only the pixel scene.

**Footer (14181-14190)**
- Hint `5 blocks → +1 {Name}` + `(up to +3 with tuner)` (mus) / `(up to +3 with Beatbox Hero, ×BPM bonus)` (tec) / `(up to +3 with creative beats)` (ori).
- `ProgressBar block total=5 label="Block n/5" color={cfg.color}`.
- `Stat increases: {rewardsEarned}` and `1 block = 10 game min (2s · slow | 0.5s)` (play-mode label says "2s"/"10 min" but the real values are 2.5 s and 3 min).
- Red `STOP ■` -> `trainActivity.stop('Training stopped')` (toast 'info').

**State and embeds**
- State written: `stats[stat]`, `xp`, `level`, `minutes`, `energy`, `hunger`, `mood`, `voiceRange`, `voiceRangeMidi`, `tecLessonsCompleted`, `tecCurrentLesson`, `tecBpm`, `oriSlots`, `oriSlotIdx`, `oriBpm`.
- Embedded: `PitchTuner`, `VoiceRangePicker`, `BeatboxHero`, `Sequencer`, `PixelScene`, `ProgressBar` (no RhythmTap/RunTracker here — those are Park).
- Rebuild: pure `canStartTraining(char, stat)`, `trainTickDelta(stat, playMode)`, `trainReward(char, stat, {playMode, accuracy}) -> {gain, xp, bonusText}`. Phaser: `TrainingScene` with a `TimerEvent` (500 ms AFK / 2500 ms play, recreated when `playMode` toggles), paused while a cutscene is active, stopped on day change; mini-games as sub-scenes publishing a 0..1 score to a shared accuracy variable.

---

## 7. STUDIO TAB  (14196-14206)
Vertical stack of five panels inside the modal.

### 7.1 SoundStudio (5286)
- `<SoundStudio activeSlot={activeSlot} showToast={showToast} char={char} />` — mic-based recording of custom hero sounds per save slot (auto onset/silence detection, `ONSET_THRESHOLD 0.04`, `SILENCE_THRESHOLD 0.015`; samples kept in IndexedDB `beatbox-story-samples`). Owned by another inventory file; mentioned for completeness.

### 7.2 SongsLibrary (12350-12473)
- Button "🎙 Release a new song": pick one of `oriSlots` (shows `{cells} hits`), optional name (max 28 chars, default slot name / `Track {n}`).
- Needs >= 4 active cells, else toast 'Pattern is too sparse — at least 4 hits to release' ('bad').
- Creates `songs.push({ id: 'song_<timestamp>', name, releasedDay: day, activeCells: cells, lifetimeFans: 0 })`; toast `🎵 Released "<name>" — earnings start tomorrow`.
- List (newest first): `{n}d left` or 'archived'; `Released day X · N hits · +F fans earned`.
- Payout: during the sleep transition (12.2), `SONG_DECAY = [0.32, 0.24, 0.18, 0.12, 0.08, 0.04, 0.02]` by song age in days (the same array is duplicated locally at 13097).

### 7.3 CrewPanel (12249-12340)
- Title `Crew · {n}/5`. Recruit once if `followers >= recruitMinFans` and `cash >= recruitCost`. Toasts: `{NAME} needs {N} fans first`, `Need ${N} to recruit {NAME}`, `👥 {NAME} joined the crew`. State `crew[{ id, joinedDay, lifetimeCash, lifetimeFans }]`.
- Crew NPCs (paid every morning, no upkeep): 
| id | name | cost | fans needed | daily cash | daily fans |
|---|---|---|---|---|---|
| jaxx | JAXX | 80 | 25 | 6 | 1 |
| noor | NOOR | 200 | 75 | 12 | 2 |
| duo_t | DUO-T | 400 | 200 | 22 | 4 |
| glaze | GLAZE | 800 | 500 | 38 | 7 |
| mira | MIRA | 1500 | 1200 | 60 | 12 |
- Footer: `Crew yield: +${X}/day · +{Y} fan(s)/day`.

### 7.4 LivestreamPanel (12477-12537)
- Gate: `followers >= 20` (else 'Need 20 followers to go live'); once per game day (`lastStreamDay === day`); `energy >= 15`.
```
fanCap     = max(8, floor(followers * 0.15))
tierBoost  = tier 3 ? 1.4 : tier 2 ? 1.2 : 1.0
skillFactor= min(1.5, 0.5 + (mus+tec+ori+sho) / 80)
viewers    = floor((10 + rand * fanCap) * skillFactor * tierBoost)
tips       = floor(viewers * (0.3 + rand * 0.4))
fanGain    = floor(viewers / 6)
```
- Costs/gives: 60 game-min (passMinutes), -15 energy; +tips cash, +fanGain followers, mood +4 (after decay), xp +6, `heat +2`, `lastStreamDay`, `lastStreamViewers` (then `checkLevelUp`).
- Button text: 'STREAMED TODAY' / 'TOO TIRED' / '🔴 GO LIVE — 60 min'; toast 'Stream done — check the panel for tonight's numbers'.

### 7.5 BjarneCoachingPanel (12555-12622) — rendered only if `storyFlags.bjarneIntroduced`
- Costs $50, 90 game-min, -10 energy; gives +4 mood, +10 xp, +1 chosen stat (4 buttons: Musicality / Technicality / Originality / Showmanship); needs `energy >= 10` and `cash >= 50`.
- Cooldown 3 days: `cooldownLeft = max(0, 3 - (day - lastBjarneDay))`, applies when `lastBjarneDay > 0`; shows 'Resting · N day(s) until next session'.
- After training: `bjarneSessions++`, `lastBjarneDay = day`, toast `Trained with BeeAmGee · +1 {Stat}`, cutscene (speaker 'BEEAMGEE' #a3a3a3, `drawBjarneStudioScene`) with line `BJARNE_LINES[session]` (ten quotes, e.g. 1 "first time i battled was '92. lost ugly. cried in the bathroom. came back the next week.", 6 "i had a daughter. she'd be your age now.", 10 "don't end up like me, kid. find someone to come home to."; beyond 10: "keep working. show me next week."), then 'You run drills until your jaw aches. He nods, twice.' and '"that's enough for today. same time next week."'. 3 sessions unlock the Studio Beanie.

- Apartment note: the tier-3 text "+25% home recording reward" is NOT applied to coaching or the sequencer (only Livestream uses tier).
- Rebuild: each panel is independent pure logic (`recruitCrew`, `releaseSong`, `goLive`, `bjarneSession`); in Phaser they are separate UI panels inside one "Studio" modal.

---

## 8. KITCHEN TAB  (14208-14310) + actions (12855-12886, 12928-12986)
Panel title "Fridge — wholefood plant-based". Row order: Home Espresso (if gear), Houseplant (if gear), Foxy Soup, then the 5 FOOD items.

### 8.1 FOOD purchase `eat(key)` (12855-12871)
- Button shows `${cost}`; `disabled = cash < cost`; also toast 'Not enough cash' ('bad') if triggered anyway.
- Effect: `t = passMinutes(c, 5)`; `cash -= cost`; `energy = clamp(energy + f.energy, 0, maxEnergy || 100)`; `hunger = clampPct(hunger + f.hunger)`; `mood = clampPct(t.mood + f.mood)`; `storyFlags.firstAte = true`.
- Toast `Ate {name}` / `Drank {name}` ('win'; 'Drank' iff `kind === 'drink'`).
- Row UI: icon `coffee` if drink else `star`; name; `+E⚡ +H🍴 +M♥` (zero fields omitted; '+' printed for >= 0, negatives print their own '-').
- No cooldown, no stock, no time-of-day rule. Can push `minutes` past 1200 (the App collapse watcher handles it).
- State: `cash, energy, hunger, mood, minutes, storyFlags.firstAte`.

### 8.2 Home Espresso `drinkHomeCoffee` (12873-12886; row only if `gear.coffee_machine`)
- Free, once per game day (`day === lastCoffeeDay` -> button 'TODAY' disabled; sub-label `+25⚡ -15🍴 +2♥ · free, today | tomorrow`). Button 'BREW'.
- Effect: 5 game-min; `energy +25` (cap max); `hunger -15` (floor 0); `mood +2` (after decay); `lastCoffeeDay = day`. Toast 'Home espresso · +25⚡ -15🍴 +2♥'.

### 8.3 Houseplant `waterPlant` (12928-12967; row only if `gear.houseplant`)
- State: `plantDead`, `plantDeathDay`, `lastPlantWaterDay`, `plantWaterCount`, `plantWaterCountDay`. `plantAlive = owned && !plantDead && (day - lastPlantWaterDay) < 5`.
- Row visuals: dead -> '💀' red border 'Houseplant (drowned)'; alive -> '🌿' green 'Houseplant (alive)'; otherwise '🥀' 'Houseplant (wilting)' (>= 5 days since watering, not dead).
- Sub-text alive/wilting: `+1♥ each morning · last watered {N} day(s) ago · {todayCount}/3 today`. Dead: `overwatered · nursery restocks tuesday ({N}d)` or `overwatered · nursery has plants today — buy one`.
- Button: dead -> '💀' (disabled); else `💧 $5` (`💧 $5 ⚠️` once `todayCount >= 3`); disabled if `cash < 5`.
- Logic: dead -> toast 'The plant is dead. Buy a new one.'; `cash < 5` -> toast 'Need $5 for water can refill'.
- `count = (plantWaterCountDay === day) ? plantWaterCount : 0`.
  - If `count >= 3` -> the **4th watering drowns it**: `cash -= 5`, `plantDead = true`, `plantDeathDay = day`, `plantWaterCount = 4`, `plantWaterCountDay = day`; toast 'You overwatered it. The plant drowned. 🥀 Replacement next Tuesday.' ('bad'); after 200 ms cutscene (speaker 'the houseplant', colour #a08030, `drawPlantDrownScene`): "blub. blub. ...blub." / "(it tipped over slow, like it knew.)" / "Nursery only restocks plants on Tuesdays."
  - Else `cash -= 5`, `lastPlantWaterDay = day`, `plantWaterCount = count + 1`, `plantWaterCountDay = day`; toast `Watered the plant ({n}/3 today). +mood every morning while alive.`
- No game-time cost. Watering a wilting plant revives it (it just resets `lastPlantWaterDay`). Replacement: Shop (13.3 / 13.4).

### 8.4 Foxy Soup `eatFoxySoup` (12969-12986)
- Free, once per game day (`lastFoxySoupDay`). Row: lime border (grey once claimed), animated `FoxyAvatar(20)`, 'FOXY SOUP · free, today | tomorrow', '+10⚡ +30🍴 +2♥'; button 'TAKE' / 'EATEN'.
- Effect: 5 game-min; `energy +10` (cap), `hunger +30`, `mood +2` (after decay); `lastFoxySoupDay = day`; `storyFlags.firstAte = true`. Toast 'Ate Foxy Soup. +30🍴 +10⚡ +2♥'.

### 8.5 Foxy loan `takeFoxyLoan` (12988-13004)
- **Dead code** in HouseScreen (never referenced). The live copy is in `FoxyModal` (11.2).

- Rebuild: `eatFood`, `homeEspresso`, `foxySoup`, `waterPlant` pure functions; Phaser: simple list UI (Kitchen modal) with disabled states derived from the same functions.

---

## 9. WARDROBE TAB  (14312-14378)
- Panel 'Wardrobe'. Section `STAGE WARDROBE`: 4-column grid of all 11 `OUTFITS` (data in 0.9). Tile = 28px swatch (`char.color` for 'default', else `o.shirt || '#a78bfa'`) + name (truncated) or '🔒' if locked; tooltip `{name} · {desc}` / `🔒 {desc}`. Click (if unlocked) -> `char.outfit = id`. Active tile = amber border (`(char.outfit || 'default') === id`). Caption "applied to all on-stage performances".
- Section `ACCESSORIES`: 4-column grid of the 7 `ACCESSORIES` (text-only tiles); click if unlocked -> `char.accessory = id`; locked tile shows '🔒' with tooltip `🔒 {desc}`. Active = amber border (`(char.accessory || 'none') === id`).
- State: `outfit`, `accessory` (consumed by `lookFromChar` -> `activeOutfitShirt`; an accessory is drawn only while its `cond` still holds).
- Cost/time: none.
- Rebuild: pure `outfitUnlocked(c,id)` / `accessoryUnlocked(c,id)`; Phaser grid of tiles.

---

## 10. COUCH TAB  (14380-14462) + actions

### 10.1 Power Nap (13051-13073; `PowerNapAnimation` 15280-15366)
- Button '😴 POWER NAP' (primary), caption "wake whenever · ~+12⚡ / hour, –3🍴 / hour".
- `startNap`: `hunger <= 0` -> toast 'Too hungry to nap — eat something first!'; else `napping = true` (full-screen takeover).
- `PowerNapAnimation`: starts at the current `minutes`; **1 game-hour per 1500 ms real** (40 game-min per real second) via rAF; auto-wakes at 1200 with `forced = true`. UI: title 'POWER NAP', `Slept {h}h {mm}m`, `drawNapScene` (couch scene with analog clock following the game clock, drifting 'z'), HUD "In-game time HH:MM" and "Energy {predicted}/{max}" with bar (`predicted = round(min(max, energy + floor(slept/60 * 12)))`), button 'WAKE UP ☀️' -> `onWake(napMinutes, false)`.
- `finishNap(finalMinutes, forced)`:
  - `slept = max(0, finalMinutes - c.minutes)`; `hours = slept / 60`.
  - `minutes = round(min(1200, finalMinutes))`.
  - `energy = round(clamp(energy + floor(hours * 12), 0, maxEnergy))`; `hunger = round(max(0, hunger - floor(hours * 3)))`; `mood = round(clampPct(mood + floor(hours * 2)))`. No passive mood decay applied.
  - Toast: forced -> '2 AM — got booted off the couch' ('info'); else 'Napped — feeling sharper' ('win').
- A nap to 02:00 leaves `minutes = 1200`, which instantly triggers the App collapse watcher (12.9) — the nap's energy is overwritten by the 60% collapse reset.

### 10.2 Sleep Till Morning (13006-13014, 13074-13414; button 14389-14395)
- Button '🌙 SLEEP TILL MORNING', caption "full energy · advances 1 day". If `char.minutes < 720` an amber line adds "It's still daytime — are you sure?" (text only; no confirm).
- `sleep()`: `hunger <= 0` -> toast 'Too hungry to sleep — eat something first!'; else `sleeping = true`. No energy or time-of-day requirement. Full resolution: section 12.

### 10.3 Downtime (12888-12913; 14396-14410)
- '📺 WATCH TV (+10♥, 30 min, –3⚡)': disabled if `energy < 3` (toast 'Too tired to focus' 'bad'). Effect: `passMinutes(30)`, `mood +10` (after decay), `energy -3`, `hunger -4`. Toast 'Watched TV · +10 mood'.
- '🎮 PLAY GAMES (+14♥, 45 min, –5⚡, sometimes +1 ori)': disabled if `energy < 5`. Effect: `passMinutes(45)`, `mood +14`, `energy -5`, `hunger -6`, `stats.ori += (Math.random() < 0.40 ? 1 : 0)` (no XP, no level check). Toast 'Played a few rounds · +14 mood'.
- No cooldown; limited only by the clock. Caption 'kill some time, get your head right'.

### 10.4 Move Out / apartment upgrade (13015-13050; 14412-14444)
- Visible while `apartmentTier < 3`; lists tiers `[2, 3]` greater than the current tier. Card: `u.name`, `tier {t}`, `u.desc`, `${cost} · day {dayReq}+ · {fansReq} fans · rent ${RENT_BY_TIER[t-1]}/wk`.
- Button label priority: `Wait til day {dayReq}` (day < dayReq) > `Need {fansReq} fans` > `Need ${cost}` > `MOVE IN — ${cost}`; disabled if any lock. From tier 1 you may jump straight to tier 3 for $5000 (tier-2 cost not credited).
- `moveToApt(t)`: re-checks cash (toast `Need ${cost}`), day (`Wait until day {N}`), fans (`Need {N} fans`). Then `cash -= cost`, `apartmentTier = t`, `apartmentMovedInDay = day`, `mood = min(100, mood + 15)`; toast `Moved in · -${cost}`; after 50 ms a cutscene (no speaker; `drawApt2Scene` or `drawApt3Scene`; flag key `apt{t}MovedIn`):
  - Tier 2 lines: "You sign the lease. Hand over the deposit. The keys feel light." / "It's small. But it's yours. With a real bedroom and a window." / "You sit on the floor for a minute, just listening. The traffic. Somebody laughing in the hall." / "This is what it sounds like to be doing okay."
  - Tier 3 lines: "The freight elevator groans up to the top floor." / "Concrete. Brick. Skyline through twelve feet of glass." / "You set the mixing desk up by the window. Plug in the monitors. Press play." / "It rings. The whole loft rings. Your loft." / "You earned this."
- Tier effects that really exist: weekly rent (0.5); +5 mood each full sleep (T2); +10 mood and +1 mus each full sleep (T3); Livestream x1.2 / x1.4; Foxy's "tomorrow's sunday" tip and the 'rent_increase_letter' event apply only to tier 1. The painted house never changes with tier.

### 10.5 Yoga Mat meditation (12915-12926; 14446-14459; only if `gear.yoga_mat`)
- Button '🧘 MEDITATE (+5♥, 10 min)' / '🧘 ALREADY MEDITATED TODAY'; caption 'on the yoga mat · once per in-game day'.
- Effect: 10 game-min, `mood +5` (after decay), `lastYogaDay = day`. Toast 'Meditated. +5 mood'. Once per game day.

- State (whole tab): `hunger, energy, mood, minutes, day, cash, apartmentTier, apartmentMovedInDay, stats.ori, lastYogaDay, storyFlags.apt{2,3}MovedIn`, plus everything in section 12.
- Rebuild: `napResult`, `watchTv`, `playGames`, `meditate`, `moveToApartment`, `computeMorning` (Appendix A). Phaser: `NapScene` (timer-driven clock), `SleepScene` (4 s fade + rooster), Couch modal list.

---

## 11. FOXY PANEL, FOXY MODAL, GOALS POPUP  (13415-13662)

### 11.1 Foxy roommate panel (13415-13479)
- Full-width button: `FoxyAvatar(36)`, label 'FOXY · roommate', 'tap →', and an italic quote `"{foxyTip}"`. Click -> `FoxyModal`.
- `foxyTip = pickFoxyTip(char)` (744-899): first matching rule below (priority order), then a random line of that rule's pool; fallback a random `FOXY_QUIPS`. Cache key (recomputed only when it changes): `[day, floor(energy/25), floor(hunger/25), floor(mood/25), rentLate, floor(cash/25), floor(followers/10), openMicCount, showcaseBooking?.day, firstJam, jamCount, pigPenChallenged, pigPenBattled, pigPenWins, pennyReveal, rohzelFridayOffer, tab]`.

| # | condition | sample line |
|---|---|---|
| 1 | energy <= 5 | "stop. sleep. you can't beatbox like this." |
| 2 | hunger <= 5 | "eat. now." |
| 3 | mood <= 10 | "go for a run. i'm not joking." |
| 4 | energy < 25 | "you should take a nap. couch's right there." |
| 5 | hunger < 25 | "you look hungry. there's leftovers in the fridge." |
| 6 | mood < 30 | "the park is free. fresh air, free." |
| 7 | rentLate >= 2 | "look. i don't know your business. but pay the rent." |
| 8 | rentLate == 1 | "did you pay rent? i swear i heard them knock." |
| 9 | Saturday (day%7==5) && cash < 60 && tier 1 | "rent's $50 every sunday. you got that?" |
| 10 | cash < 5 && !foxyLoanTaken | "you're broke huh. tap me. i'll lend you something. once." |
| 11 | cash < 5 && foxyLoanTaken | "i already lent you fifteen. busk. the park." |
| 12 | !firstJam | "i heard there's jams in the park. that's where the beatboxers go right?" |
| 13 | firstJam && !pigPenChallenged && jamCount < 3 | "still going to the jams? keep at it." |
| 14 | pigPenChallenged && !pigPenBattled | "battle night is saturday at the bar. that's all i know." |
| 15 | pigPenBattled && pigPenWins == 0 | "battles once a week. train, go again." |
| 16 | pigPenWins == 1 && !pennyReveal | "you've been smiling more this week." |
| 17 | showcaseBooking.day set | "friday show. don't bomb. eat first." |
| 18 | followers >= 30 && no booking && openMicCount >= 5 && !rohzelFridayOffer | "you should talk to rohzel. friday slots are a thing." |
| 19 | openMicCount == 0 && firstJam | "the bar has open mics tue/wed/thu. small crowd, free slot." |
| 20 | openMicCount in 1..2 | "more open mics this week. it adds up." |
| 21 | followers < 5 && firstJam | "you've got like four followers. busk. people will see you." |
| 22 | dow Monday | "the bar's closed mondays. don't bother." |
| 23 | dow Tue-Thu | "open mic tonight if you've got the energy." |
| 24 | dow Friday | "friday's a show night if you've got the slot." |
| 25 | dow Saturday | "battle night. you ready?" |
| 26 | dow Sunday | "sunday. rent day. the long day." |
| — | fallback | random `FOXY_QUIPS` |

### 11.2 FoxyModal (7016-7091; opened by the panel)
- Shows three tips (top-priority tip + 2 random quips), stable while open. Header `FoxyAvatar(48)`, 'FOXY', 'roommate · they/them'.
- Button "👋 say hi to Foxy · +2 mood", once per game day (`storyFlags.lastFoxyWaveDay`; else shows 'already said hi today'): `mood +2` (no passive decay call), `daily.foxyHi += 1` (daily challenge 'foxy_hi' counter; NOT added to `weekly`), toast 'Foxy waved back. +2 mood' ('info').
- If `cash < 5 && !foxyLoanTaken`: "💸 ask Foxy for $15 · one-time": `cash += 15`, `foxyLoanTaken = true`, `mood +3`, phone message from Foxy "this is a one-time thing. go busk in the park. seriously."; toast 'Foxy lent you $15. Go busk.'; closes the modal. If the loan was taken and `cash < 5`: "you already borrowed once. busk in the park."

### 11.3 Goals button + popup (13481-13662)
- Button '🎯 Goals' (amber when a CLAIM is ready). Right-hand status: `{N} ready to claim →` | `first week {done}/6 →` (when the checklist is visible) | `daily {p}/{t} · weekly {p}/{t}`. The whole block returns `null` when the checklist is hidden AND there is no daily AND no weekly challenge.
- Hint under the button until `storyFlags.seenChallengesHint` (set when the popup is first opened): "Your goals & challenges live here — tap for tasks and bonus cash."
- Popup: sticky header '🎯 Goals', × button, backdrop click closes.

**First-week checklist** (6 items; visible unless `(all done && day > 2) || day > 7`; header `FIRST WEEK · n/6`, status '✓ tutorial complete' / 'getting started'):
| key | label | done when | hint |
|---|---|---|---|
| busk | Busk in the park | `storyFlags.firstBusk` | 🎤 Park · Busk |
| eat | Eat from the kitchen | `firstAte || foxyFirstSafetyNet` | 🍽 House · Kitchen |
| sleep | Sleep till morning | `day > 1` | 🛋 House · Couch |
| jam | Jam with the cypher | `storyFlags.firstJam` | 🎶 Park · Jam |
| openmic | Play your first open mic | `openMicCount >= 1` | 🎙 Bar · Tue/Wed/Thu |
| shop | Buy your first gear/sound | `Object.keys(gear).length >= 1` | 🛒 City · Shop |

**Daily challenge** (`dailyChallenge = {id, claimed}`; counters in `char.daily`; defs 511-524; picked uniformly among those allowed for the new day's `dow` at each sleep):
| id | label | target | counter | reward | allowed |
|---|---|---|---|---|---|
| jams_3 | Do 3 cypher jams | 3 | jams | $15 | any |
| openmic_1 | Play 1 open mic | 1 | openMics | $15 | Tue/Wed/Thu |
| mingle_2 | Have 2 bar conversations | 2 | mingles | $10 | not Monday |
| busks_2 | Busk twice in the park | 2 | busks | $12 | any |
| runs_1 | Complete a run session | 1 | runs | $8 + 5 mood | any |
| battle_win | Win a battle tonight | 1 | battleWins | $30 | Saturday |
| showcase | Play the Friday showcase | 1 | showcases | $30 | Friday |
| foxy_hi | Say hi to Foxy | 1 | foxyHi | +6 mood | any |

**Weekly challenge** (`weeklyChallenge = {id, claimed}`; counters in `char.weekly`, reset on the Monday-morning sleep; defs 553-560):
| id | label | target | counter | reward |
|---|---|---|---|---|
| wk_battles_3 | Win 3 battles this week | 3 | battleWins | $100 + 20 fans |
| wk_openmic_5 | Play 5 open mics this week | 5 | openMics | $80 + 15 fans |
| wk_jams_15 | Do 15 cypher jams this week | 15 | jams | $60 + 10 fans |
| wk_busks_10 | Busk 10 times this week | 10 | busks | $70 + 8 fans |
| wk_mingles_8 | Mingle 8 nights this week | 8 | mingles | $50 + 10 mood |
| wk_runs_4 | Run 4 sessions this week | 4 | runs | $40 + 15 mood |

- Card UI: title (daily amber 'DAILY CHALLENGE', weekly fuchsia 'WEEKLY CHALLENGE'), `progress/target` (+ ' · claimed', weekly adds `· {daysToMonday}d left` where `dow = day % 7; daysToMonday = dow === 0 ? 7 : 7 - dow`), label, `Reward: $X +N♥ +N fans`, button `IN PROGRESS` / `CLAIM →` / `CLAIMED`.
- Claim (`claimDaily` / `claimWeekly`): adds `cash`, `followers`, `mood` (clamped) and sets `claimed: true`; toast `Daily: {reward}` / `Weekly: {reward}` ('win'). No XP. Eligibility is not re-checked inside `setChar` (a fast double-click could double-pay).
- With neither challenge: "Daily & weekly challenges unlock after your first sleep."
- State read/written: `dailyChallenge`, `weeklyChallenge`, `daily`, `weekly`, `storyFlags.seenChallengesHint`, `cash`, `followers`, `mood`.
- Rebuild: `claimChallenge(c, kind)`, `checklist(c)` pure; Phaser: a Goals modal with 6 rows + 2 cards.

---

## 12. MORNING TRANSITION — `finishSleep` / `_finishSleepImpl`  (13074-13414)
Wrapper `finishSleep` (13074-13088): try/catch; on a throw it dispatches a window `ErrorEvent`, sets `sleeping=false`, toast `Sleep failed: ...`. Everything below uses `c0 = char` (char at the moment the animation completed) and one set of `Math.random()` rolls made OUTSIDE the `setChar` updater.

### 12.1 Rent day (13129-13133)
- `newDayBase = day + 1`; `rentEvent = computeRentEvent(c0, newDayBase)` (rules 0.5; Sunday = `newDay % 7 == 6`).
- `dayAdvance = (evicted ? 1 + COUCHSURF_DAYS (=4) : 1)`; `newDay = day + dayAdvance`.

### 12.2 Pre-computed income (13096-13128)
- **Songs**: for each song in `c0.songs`:
  - `age = (day + 1) - releasedDay` (uses `day+1` even when evicted); `age <= 0 || age > 7` -> unchanged.
  - `decay = [0.32, 0.24, 0.18, 0.12, 0.08, 0.04, 0.02][age - 1]`.
  - `pool = max(5, floor(totalStats / 4 + activeCells * 1.5))`, `totalStats = mus + tec + ori + sho`.
  - `earned = max(0, round(pool * decay))`; `lifetimeFans += earned`; the sum goes to `followers`. Toast at 500 ms `🎵 Your songs earned +{N} new fan(s)`.
  - Example: stats total 40, 20 active cells -> pool 40 -> fans 13, 10, 7, 5, 3, 2, 1 on days +1..+7.
- **Crew**: for each recruited member: `cash += npc.dailyCash`, `fans += npc.dailyFans`, `lifetimeCash/Fans` updated. Toast at 800 ms `👥 Crew brought in +${X} / +{N} fan(s)`. Crew cash is added after rent is resolved (it cannot pay that morning's rent).

### 12.3 Random rolls (13135-13155)
- **Random event**: `if (!evicted && rand < 0.30) randomEvent = pickRandomEvent({...c0, day: newDay})` — weighted pick among `RANDOM_EVENTS` whose `when(c)` passes (table 12.6).
- **Bad sleep**: `if (rand < 0.10 && !evicted)`:
  - `pool = FILTERED_BAD_SLEEP(c0)` (earplugs remove 'noisy' + 'heating');
  - `eligible` = no `when` or `when(c0, newDay)`; `stateReasons` = eligible with `when`; `ambient` = eligible without;
  - `chosenPool = (stateReasons.length && rand < 0.6) ? stateReasons : (eligible.length ? eligible : ambient)`; uniform pick (table 12.7).

### 12.4 State updater (13157-13289) — exact order
```
max    = maxEnergy ?? 100
energy = min(max, max + (new_bed ? 20 : 0))     // == max ; the bed bonus is dead code
hunger = max(0, hunger - 30)
mood   = min(100, mood + 10)
badSleep:  energy = floor(max * (reason.energyCap ?? 0.7)) ; mood = max(0, mood - 10)
plantAlive(c) [uses OLD day]: mood = min(100, mood + 1)
tier 2: mood = min(100, mood + 5)
tier 3: mood = min(100, mood + 10) ; stats.mus += 1
cat && cash >= 3: mood = min(100, mood + 2) ; cash = max(0, cash - 3)
camera_tripod: followers += 1
rent:
   paid    -> cash = max(0, c.cash - amount)  [overwrites the cat deduction], rentLate = 0, lastRentPaidDay = newDayBase, flags.firstRentPaid = true
   missed  -> rentLate = 1, mood = max(0, mood - 10)
   warning -> rentLate = 2, mood = max(0, mood - 15)
   evicted -> energy = floor(max * 0.5), hunger = max(0, hunger - 20), mood = max(0, mood - 30), rentLate = 0, flags.evictedOnce = true   (tier, cash, gear unchanged)
pendingDebuff d (from bar items): energy += d.energy (clamp 0..max), hunger += d.hunger, mood += d.mood (clampPct)
set: day = newDay, minutes = 0, pendingDebuff = null
randomEvent -> applyRandomEvent(next, ev)   (clamped; 'sick' => sickDay = newDay; 'rentBump' => rentBumped = true, unused)
daily = {} ; dailyChallenge = { id: pickDailyChallenge(newDay % 7).id, claimed: false }
songs = updated ; crew = updated ; followers += songFans + crewFans ; cash += crewCash
weekly: if (newDay % 7 === 0 /* Monday */ || !weeklyChallenge) { weekly = {}; weeklyChallenge = random(WEEKLY_CHALLENGES), claimed:false }
parent text: if (newDay - lastParentMsgDay >= 3):
     reason = first of: (rent paid && rand < .45) 'rentPaid' | ((missed|warning) && rand < .75) 'rentMissed' | (hunger < 30 && rand < .50) 'hungerLow' | (newDay % 7 === 6 && rand < .30) 'random'
     if reason: addMessage('parents', pick(PARENT_MESSAGES[reason])) ; lastParentMsgDay = newDay
anon DMs: if followers > 0: rand < .05 -> 'unknown' fan message ; rand < .04 -> 'unknown' hate message
festival: if festivalEligible(next) && !storyFlags.festivalInviteSent:
     addMessage('rohzel', "festival people called.\nthey want you.\nsit down. let's talk.") ; flag festivalInviteSent ; festivalState = 'invited'
```
- `festivalEligible(c)`: `!festivalState`, `defeated.length >= 3`, `openMicCount + (storyFlags has key 'firstShowcase' ? 1 : 0) >= 5`, all four stats >= 8, `day >= 25`.
- PARENT_MESSAGES (276-299): hungerLow ("are you eating? we're not mad about the job but call your mother", "did you eat today? please eat something"); rentPaid ("rent paid this month? we can help if you need", "we saw a couple thousand in our account if you need it"); rentMissed ("are you doing okay? the door's always open here", "your father said let us help you. text back"); random (4 lines, e.g. "just thinking of you ❤️", "dad found your high school yearbook 😂", "your cousin asked when you're coming home", "the dog misses you. i miss you too but the dog more").
- Anonymous DMs: 10 fan lines (e.g. "saw your clip — fire 🔥", "bro you're underrated. keep going.") and 10 hate lines (e.g. "your beats are wack.", "delete your account.").
- The updater has its own try/catch: on error it dispatches an ErrorEvent and returns `c` unchanged.

### 12.5 Post-update toasts and cutscenes (13290-13413)
Immediately: `sleeping = false` (House UI returns).

| delay | what |
|---|---|
| 50 ms | rent cutscene (below), if any |
| 100 ms | toast `Bad sleep · {line}` ('bad') if `badSleep` and not evicted |
| 200 ms | random-event cutscene `{speaker: ev.title, speakerColor: ev.color \|\| '#D4A017', beats: [{lines: ev.lines}]}` (no art) |
| 320 ms | flashback: if `!evicted && rand < 0.25 && pickFlashback({...c0, day:newDay})` -> `flashbacksSeen[id] = newDay`; cutscene with `_flashbackDrawFn(fb.drawFn)` and `fb.lines` |
| 400 ms | dream: if `!evicted && newDay >= 30 && rand < 0.05` -> cutscene `drawDreamScene` (lines below) |
| 500 ms | songs toast (12.2) |
| 800 ms | crew toast (12.2) |

Dream lines: "You're on a stage that goes forever in every direction." / "Faces in the crowd you don't recognize. They know your name." / "The mic in your hand is too heavy. Then weightless." / "You wake before the round ends."

Rent toasts + cutscenes (immediate toast; cutscene at 50 ms):
- paid: toast `Rent paid · -${amount}` ('info'). If `firstTime`: cutscene `drawRentPaidScene` (flag 'firstRentPaid'): "Sunday. Rent's paid." / "-${amount}. The apartment's still yours." / "Another week to make it work."
- missed: toast `Rent late · week 1. Mood -10` ('bad'); cutscene `drawRentMissedScene`: "You didn't make rent this week." / "The notice is taped to your door." / "You've got till next Sunday."
- warning: toast `Rent late · final warning. Mood -15` ('bad'); cutscene `drawEvictionWarningScene`: "Final warning, in red ink." / "Pay by Sunday or you're out." / "Your phone hasn't stopped buzzing."
- evicted: toast `Evicted. Couch-surfing for 3 days.` ('bad'); 3-beat cutscene:
  1. `drawEvictedScene`: "Boards on the door." / "Your stuff in two cardboard boxes." / "Nowhere to go but Foxy's friend's couch."
  2. `drawCouchSurfScene`: "3 nights on a stranger's couch." / "You don't sleep much." / "The plant's probably dead by now."
  3. `drawBackOnFeetScene`: "A new key. A fresh start." / "Rent counter back to zero." / "Don't miss it again."
- no rent event: toast `Slept till morning` ('win'), or `Slept it off — feeling rough` ('info') if `char.pendingDebuff` was set.

Because `playCutscene` holds a SINGLE slot, whichever timer fires last wins (rent 50 < event 200 < flashback 320 < dream 400); earlier cutscenes are replaced and their completion flags never get set.

### 12.6 RANDOM_EVENTS (lines 355-469) — id (weight) [condition] title — effects
| id (w) | condition | title | effects |
|---|---|---|---|
| bird_poop (3) | — | A SEAGULL JUST BLESSED YOU | mood -3 |
| street_compliment (4) | — | STREET COMPLIMENT | mood +5, followers +1 |
| lost_tenner (2) | — | TEN BUCKS ON THE GROUND | cash +10, mood +4 |
| song_on_radio (3) | day >= 10 | THE SONG | mood +12 |
| old_yt_comment (2) | day >= 14 | A NOTIFICATION FROM 2017 | mood +8 |
| birthday_gig (2) | firstJam | BIRTHDAY GIG | cash +30, followers +3, mood +5 |
| journalist_dm (2) | followers >= 20 | A JOURNALIST WROTE | sho +1, mood +6 |
| crystix_viral (1) | crystixMet | CRYSTIX TAGGED YOU | followers +50, mood +10 |
| bike_stolen (2) | day >= 5 | YOUR BIKE IS GONE | cash -25, mood -8 |
| phone_died (2) | day >= 4 | PHONE FROZE AT 3% | mood -5; marks all messages read |
| algorithm_dud (2) | followers >= 30 | POST FLOPPED | mood -8 |
| free_coffee (2) | followers >= 50 | FREE COFFEE | energy +15, mood +6 |
| og_invite (1) | day >= 20 | AN OLDER VOICE LEFT A VOICEMEMO | tec +1, mood +8 |
| rent_help (1) | rentLate >= 1 | PARENTS WIRED MONEY | cash +40, mood +3 |
| good_dream (2) | day >= 8 | A GOOD DREAM | mood +10, energy +5 |
| sick_day (2) | day >= 6 && sickDay != day | YOU'RE SICK | mood -8, energy -25, `sickDay = newDay` (no training/activities that day) |
| parking_ticket (2) | day >= 7 | PARKING TICKET | cash -40, mood -6 |
| dentist (1) | day >= 12 | DENTIST EMERGENCY | cash -80, mood -10 |
| broken_phone (1) | day >= 8 | CRACKED SCREEN | cash -60, mood -4 |
| food_poisoning (1) | day >= 10 | BAD TAKEOUT | hunger -30, mood -8, energy -15 |
| tax_letter (1) | day >= 18 | A LETTER FROM THE COUNCIL | cash -120, mood -10 |
| bombed_set (2) | openMicCount >= 2 && day >= 5 | YOU BOMBED LAST NIGHT | mood -15, followers -3 |
| rivalry_clip (1) | followers >= 80 && pigPenWins | SOMEONE DISSED YOU ONLINE | mood -12, followers +8 |
| rent_increase_letter (1) | day >= 25 && tier 1 | NOTICE FROM THE LANDLORD | mood -8; `rentBumped = true` (flag only; rent unchanged) |
Cash and followers floor at 0; hunger/mood clamp 0..100; energy clamps 0..max. Sick event: also read by training (`sickDay === day`) and `useActivity.start`.

### 12.7 BAD_SLEEP_REASONS (332-348) — energyCap, wake energy = floor(max × cap)
| id | cap | condition | line |
|---|---|---|---|
| nightmare | .70 | — | "Bad dream. You woke up rattled." |
| lonely | .75 | — | "The apartment was too quiet for sleeping." |
| noisy | .70 | removed by earplugs | "Upstairs neighbor played speed garage at 3am." |
| heating | .80 | removed by earplugs | "Couldn't get comfortable. The heating is stuck on high." |
| layoff | .60 | — | "You woke up at 4am thinking about the job. Again." |
| rent | .60 | rentLate >= 1 | "You couldn't stop thinking about the rent." |
| battle | .65 | newDay % 7 in {4, 5} | "Your brain ran the next battle on a loop." |
| showcase | .65 | `showcaseBooking.day` set, `booking.day - newDay <= 1`, `booking.day >= newDay` | "Friday's set looped in your head all night." |
| replay_loss | .70 | `lastBattleDay` within 2 days, `pigPenWins == 0`, `pigPenBattled` | "You replayed the battle you lost. Every move." |
| caffeine | .70 | `pendingDebuff.energy <= -10` | "That late espresso came back to bite." |

### 12.8 FLASHBACKS (1103-1148) — first unseen whose `when` holds (4 lines each + own scene)
| id | condition | first line |
|---|---|---|
| childhood | `firstJam && day >= 5` | "Before bed, a memory you hadn't pulled up in years." |
| parent_voice | `rentLate >= 1 \|\| day >= 12` | "1 AM in the kitchen. The phone glows on the counter." |
| yt_comment | `followers >= 100` | "Down a YouTube rabbit hole. Your old channel." |
| the_song | `firstShowcase \|\| day >= 20` | "Last bus home. Window cold against your forehead." |

### 12.9 App-level 2 AM collapse (11418-11459 — outside my range, but House-relevant)
- If `minutes >= 1200` anywhere: `day+1`, `minutes = 0`, `energy = floor(max * 0.6)`, `hunger -= 25`, `mood -= 12`, rent processed (eviction downgraded to `rentLate = 2`), `pendingDebuff = null`, `setScreen('house')`, toast 'You collapsed at 2 AM. Got home somehow.'.
- It does NOT apply song/crew income, bed/plant/pet/tier bonuses, challenge rerolls, random events or messages.

- Rebuild: `computeMorning(char, rng) -> { char, toasts[], cutscenes[] }` as one pure function (with the rolls up front); Phaser `SleepScene` (4 s, rooster at 85%) calls it on completion and then enqueues cutscenes through a queue (not a single slot).

---

## 13. SHOP SCREEN  (14472-14688)
`ShopScreen({ char, setChar, showToast, go, playCutscene })` (`go` unused). State: `branch` (null = hub, else store key), `showSounds`.

### 13.1 Hub (14643-14687)
- Header `THE SHOP` / 'pick a branch'. 2x2 grid of square tiles for `['music', 'furniture', 'clothing', 'pet']`: icon (🔒 when locked), `display` name in the store colour, subtext `{owned}/{total} owned` or `unlocks {label.toLowerCase()}` (e.g. 'unlocks day 5').
- Locked = `!isUnlocked(char, 'store_' + s)` (day gate 4 / 5 / 7 / 10): disabled, 50% opacity.
- Below: full-width button `🎚️ Sounds catalog` with `{owned}/{12} unlocked · view & equip` -> `showSounds = true`.
- No opening hours, no stock, no discounts, no mood/time cost for shopping.

### 13.2 Sub-store (14585-14641)
- `← Back to shop`; title `{icon} {DISPLAY}` coloured by store; 'tap an item to buy'; Panel `{N} items`.
- Item card: name; `OWNED` (amber) or `Btn ${cost}` (disabled if `cash < cost`); description. Owned cards get an amber border.

### 13.3 `buyGear(id)` rules (14478-14528)
1. Unknown id -> ignore.
2. Already owned and not a dead-plant replacement -> silently return.
3. Replacement of a dead plant: `ready = replantAvailableDay(char)`; if `day < ready` -> toast `Plant nursery restocks Tuesday — {N} day(s) to go.` ('bad'), no purchase.
4. `cash < cost` -> toast 'Not enough cash' ('bad').
5. Otherwise `cash -= cost; gear[id] = true;` plus special init:
   - `houseplant`: `lastPlantWaterDay = day; plantDead = false; plantWaterCount = 0; plantWaterCountDay = day` (`plantDeathDay` left stale, harmless).
   - `mpc`: `oriSlots` = 8 slots, each `existing[i] || _seqStarter(i % 4)` (new slots 4-7 get Boom Bap / 4 on Floor / Half-Time / Empty).
6. Toast `Bought {name}!` ('win').
7. A replacement plant also fires (200 ms) a cutscene (no speaker, `drawPlantArrivedScene`, no flag key so it replays every time): "Tuesday. The nursery had one left." / "You set it on the counter, careful this time." / "(every three days, a small drink. that's it.)"
- Purchases never expire and cannot be refunded; one copy of each. Effects: table 0.4.

### 13.4 Houseplant replacement presentation
- With `plantDead`, the houseplant card is shown as NOT owned.
- If `day < replantAvailableDay`: name suffix 'restocks tuesday', right side `{wait}d` instead of a button, description 'Nursery only restocks houseplants on Tuesdays. Try again then.'
- Once available: red suffix 'drowned · replace?' and the buy button returns ($50 again).

### 13.5 Sounds catalog screen (14530-14583)
- `← Back to shop`; title 'SOUNDS CATALOG' / 'Locked sounds unlock as you grow'; Panel `Owned ({n}/12)`.
- Row (60% opacity when not owned): `🔒 ` prefix when locked; name; tier stars (`tier` amber stars); meta `{cat} · {base}pts · {stamina}⚡ · {stat}`; then either `unlocked · {SOUND_UNLOCKS[id].label}` + EQUIP/EQUIPPED toggle, or `🔒 {unlock label}`.
- Equip logic (inside `setChar`): if equipped -> remove (no minimum); else if `equipped.length >= 5` -> toast 'Max 5 sounds' ('bad'), no change; else append.
- State: reads `sounds`, `equipped`; writes `equipped`, `cash`, `gear`, `oriSlots`, plant fields.
- Rebuild: pure `buyGear(c, id) -> {ok, char, toast, cutscene?}`, `equipToggle(c, id)`, `storeUnlocked(c, store)`; Phaser `ShopScene` with hub grid, sub-store list, catalog list.

---

## APPENDIX A — proposed framework-free TypeScript surface (`house.ts`)
```ts
type Rng = () => number;                                   // inject; default Math.random
interface Toast { msg: string; kind: 'win'|'bad'|'info'; delayMs?: number }
interface CutsceneReq { flag?: string; speaker?: string|null; color?: string; delayMs: number;
                        beats: { scene?: string; lines: string[] }[] }
type Result = { ok: boolean; char: Char; toasts: Toast[]; cutscenes?: CutsceneReq[] }

// time & needs
moodDrain(c, minutes): number;  passMinutes(c, n): { minutes; mood };  isDay(minutes): boolean;  dayOfWeek(day): 0..6
// kitchen / couch / gear
eatFood(c, key): Result;  homeEspresso(c): Result;  foxySoup(c): Result;  foxySafetyNet(c, rng): Result | null
watchTv(c): Result;  playGames(c, rng): Result;  meditate(c): Result
waterPlant(c): Result;  plantAlive(c): boolean;  replantAvailableDay(c): number
buyGear(c, id): Result;  storeUnlocked(c, store): boolean;  equipToggle(c, id): Result
moveToApartment(c, tier): Result
napResult(c, finalMinutes, forced): Result              // +floor(h*12) energy, -floor(h*3) hunger, +floor(h*2) mood
computeMorning(c, rng): { char: Char; toasts: Toast[]; cutscenes: CutsceneReq[] }   // section 12
// training
canStartTraining(c, stat): { ok: true } | { ok: false; reason: string; hint: string }
trainTick(c, stat, playMode): { char: Char; stopReason?: string; rewardDue: boolean }   // every 5th tick -> reward
trainReward(c, stat, ctx: { playMode: boolean; accuracy: number }): { gain: number; xp: number; bonusText: string }
claimChallenge(c, kind: 'daily'|'weekly'): Result
```
Use the exact constants of sections 0 and 6.3-6.4. ALL randomness (30% event, 10% bad sleep, 25% flashback, 5% dream, 40% ori on Games, parent / anon-DM rolls, random picks) goes through `rng` so tests are deterministic.

## APPENDIX B — `char` fields touched by this range
- Read/write (core): `cash, energy, maxEnergy, hunger, mood, minutes, day, xp, level, followers, stats{mus,tec,ori,sho}, gear{}, sounds[], equipped[], outfit, accessory, apartmentTier, apartmentMovedInDay, rentLate, lastRentPaidDay, pendingDebuff`.
- Daily cooldowns: `lastCoffeeDay, lastYogaDay, lastFoxySoupDay, lastFoxySafetyNetDay, foxyLoanTaken, lastStreamDay, lastStreamViewers, lastBjarneDay, bjarneSessions, heat`.
- Plant: `lastPlantWaterDay, plantDead, plantDeathDay, plantWaterCount, plantWaterCountDay`.
- Training/studio: `tecBpm, tecLessonsCompleted, tecCurrentLesson, oriBpm, oriSlots, oriSlotIdx, voiceRange, voiceRangeMidi, songs[], crew[]`.
- Daily/weekly: `daily{}, weekly{}, dailyChallenge{id,claimed}, weeklyChallenge{id,claimed}, flashbacksSeen{}, messages[], lastParentMsgDay, festivalState, sickDay (read; set by event), rentBumped (written, unused)`.
- `storyFlags` written: `firstAte, foxyFirstSafetyNet, firstRentPaid, evictedOnce, festivalInviteSent, seenChallengesHint, lastFoxyWaveDay, apt2MovedIn, apt3MovedIn`. Read-only conditions: `bjarneIntroduced, firstBusk, firstJam, jamCount, pigPenChallenged, pigPenBattled, pigPenWins, pennyReveal, rohzelFridayOffer, firstShowcase, crystixMet, festivalWon, sponsor_*_signed`.
- Other read-only: `showcaseBooking, openMicCount, defeated, lastBattleDay, romanceState`.
- Assets: `house-day.png`, `house-night.png` (480x854). Pixel scene functions used: `draw{Musicality,Technicality,Originality,Showmanship}Scene`, `drawFoxySoupScene`, `drawPlantDrownScene`, `drawPlantArrivedScene`, `drawApt2Scene`, `drawApt3Scene`, `draw{RentPaid,RentMissed,EvictionWarning,Evicted,CouchSurf,BackOnFeet}Scene`, `drawDreamScene`, `drawFlashback{Childhood,Parent,Comment,Song}Scene`, `drawNapScene`, `drawSleepScene`, `drawBjarneStudioScene`. PIXEL_ICONS used: pc, mic, fridge, star, couch, music, zap, sparkle, crown, coffee.

---

## OPEN QUESTIONS / GOTCHAS
1. **Memory-Foam Bed does nothing.** `energy = Math.min(max, max + bedBonus)` always equals `max` (13161-13162). Decide: fix (e.g. temporary over-max energy or +maxEnergy) or drop the $600 item. Catalog text promises "+20 max-energy boost".
2. **Apartment promises not implemented.** Tier 2 "Bad-sleep events less common" (bad sleep stays 10%); tier 3 "+25% home recording reward" (no code multiplies coaching/sequencer; only Livestream `tierBoost` 1.2/1.4 uses tier). Real effects: rent, +5 / +10 mood (+1 mus) each full sleep, livestream. The house art never changes with tier.
3. **Training reward quirks.** The BPM multiplier uses persisted `tecBpm` even in AFK mode (default 90 = x1; leaving it at 140 pays round(1 × 1.556) = 2 per AFK block). PC / Mic x1.25 only helps when base gain >= 2 (round(1.25) = 1). Ori + Studio Monitors always appends ' · 🎚️'. `rewardsEarned` counts 0-gain tec blocks. XP (+10) only when gain > 0.
4. **UI text drift.** Play-mode footer says `1 block = 10 game min (2s · slow)` but play mode is 3 game-min / 2500 ms. Beatbox Hero lock text says "(buy in shop)" although sounds are milestone unlocks. Houseplant text says "water = $5/3 days" and the replant cutscene "every three days", but code keeps the plant alive 5 days (`< 5`).
5. **Mic text vs code.** "+25% to all mic-mode + Mus reward; better PitchTuner accuracy" is really x1.25 Mus gain and x1.15 BeatboxHero `accuracyBoost`; PitchTuner receives nothing. Premium headphones x1.25 `accuracyBoost`; both stack (1.4375).
6. **Overlapping cutscenes clobber each other** (single `cutscene` slot). Morning timers 50/200/320/400 ms mean a rent cutscene is usually replaced by an event/flashback/dream, and its completion flag (e.g. 'firstRentPaid' story beat) never fires (the state flag itself is set in the updater, so only the beat is lost). The rebuild should use a queue.
7. **Rent ignores same-morning income.** Crew cash and song fans arrive after `computeRentEvent` (computed from pre-sleep cash). Paying rent also overwrites the cat's $3 deduction (`cash = max(0, c.cash - amount)`). Eviction leaves tier, cash and gear unchanged, resets `rentLate` to 0, and jumps the day by +4, so the Monday weekly-reset check (`newDay % 7 === 0`) can be skipped and songs age by only one day.
8. **Sleep has almost no gating.** Only `hunger > 0` is required; "It's still daytime — are you sure?" is text only. Each sleep = +1 day, full energy, +10 mood, -30 hunger, so days can be skipped freely (Sunday rent still triggers).
9. **Nap to 02:00** hits the App collapse watcher (energy reset to 60%, mood -12, hunger -25) so the nap's gains are overwritten. Naps also skip passive mood decay and give an unconditional +2 mood/hour.
10. **Downtime is an exploit.** TV/Games have no cooldown (+10 / +14 mood for 30 / 45 game-min and 3 / 5 energy); only the clock limits it. Games' 40% +1 ori skips XP and level checks.
11. **Foxy safety net** only fires while the House is mounted and `hunger <= 0 && cash < 5`; its toast says "+40" but it sets hunger to at least 40. `takeFoxyLoan` in HouseScreen is dead code (FoxyModal has the live copy).
12. **Phone & laundry.** The brief mentioned them for the house; neither exists in this range. Messages are appended via `addMessage` (Foxy, parents, 'unknown', Rohzel) and read in `MessagesPanel` (6885) from an App-header icon; "laundry" is a single Foxy Monday quip ("mondays are for laundry. fyi.").
13. **Leaving mid-training.** Hotspots and the modal are locked while training, but nothing in this range stops App-level navigation; unmounting HouseScreen clears the interval (training silently ends). Confirm the App nav behaviour (outside range).
14. **Equip toggle** allows an empty `equipped` list (no minimum) and its 'Max 5 sounds' toast fires inside a state updater (double-fire under StrictMode).
15. **Stale closure by design.** `finishSleep` uses the `char` captured when `SleepAnimation` mounted (its effect has `[]` deps); fine while nothing mutates char during the 4 s animation, but a Phaser rewrite should read live state.
16. **Vestigial bits:** `HOUSE_LIGHT_KINDS[*].edge`, `opacityDay/opacityNight` (supported, never set), `passTime` and `go` props, `takeFoxyLoan`, a duplicated local `SONG_DECAY` (13097 vs 12348), stale `plantDeathDay` after replacement, `rentBumped`.
17. **Day/night is binary** (`minutes < 720`); the global `timeOfDay()` has dawn/dusk phases that the house ignores.
18. **Daily-challenge counters** touched by this screen: only `foxyHi` (FoxyModal wave), and it is bumped on `daily` only (not `weekly`), unlike `bumpDaily`. Claim buttons do not re-validate inside `setChar` (fast double-click could double-pay).
19. **Shop:** no stock/hours; `houseplant` is the only re-buyable item (only when drowned, on/after the Tuesday following the death day, $50 again). Achievement 'Completist (Gear)' expects exactly 14 gear items.
20. **Design question:** keep the mus/ori accuracy "snapshot" semantics (latest evaluation, every 2.5 s, sampled at reward time) or average over the 5 ticks? Current behaviour can pay +3 from one lucky snapshot.
