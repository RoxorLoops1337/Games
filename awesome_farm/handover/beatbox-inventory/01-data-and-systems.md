# Beatbox Story - Feature inventory 01: data tables and systems

Source: `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx`, **lines 1-1260** (read completely).
Where a unit is consumed outside this range, the consuming line numbers are given as "Used at" so the next engineer knows where to look.
All line numbers refer to the same single JSX file. Range 1262+ starts with `_enc` / `MINGLE_GENERIC` (mingle encounters) which belongs to someone else.

## SUMMARY (10 lines)

1. Lines 1-1260 are almost entirely framework-free data tables + pure helper functions (`char` in, new `char` out). Only four things touch the platform: the document-level key dispatcher (227-257), `window.storage` slot persistence (929-1028), the `localStorage` settings cache + `useSettings` React hook (964-998), and flashback draw functions referenced by string name (1174-1183, canvas code lives at 8412+).
2. Time: 1 day = 6:00 AM (minutes=0) to 2:00 AM (minutes=1200, forced collapse). Activities advance 10 in-game minutes per 500 ms real tick. Day 1 is a **Tuesday**; `dow = day % 7` with 0=Mon..6=Sun. Rent is due on Sunday wake-up (`newDay % 7 === 6`): $50 / $100 / $200 by apartment tier; 3 consecutive misses = eviction (+3 couch-surf days).
3. Progression gates live here: 12 sounds unlocked by milestones (no longer sold), 7 solo NPC opponents + 3 crew (3v3) fights, 5 hireable crew NPCs with passive daily cash/fans, 20 achievements, 11 outfits + 7 accessories, 4 one-shot flashbacks, festival (BBBWC2027) eligibility, content unlock days (bar d3, shop d4, mingle d5, sub-stores d4/5/7/10).
4. Overnight pipeline ingredients are defined here (orchestrated by `finishSleep`, lines 13005-13414): bad-sleep reasons (10 roll), 24 random events (30% roll, weighted), daily challenge (8 defs) and weekly challenge (6 defs), flashbacks (25% roll), rent event, parent/unknown-sender phone texts.
5. Phone messages: one-way inbox on `char.messages` (`{id,sender,text,day,minute,read}`), 8 sender styles (only parents/rohzel/foxy/unknown are ever used), 12 parent lines in 5 trigger pools, 10 hate + 10 fan anonymous lines.
6. Foxy tip engine: 26 prioritized `when(char)` rules (first match wins, random line from its pool) + 8 ambient quips fallback; modal shows top tip + 2 random quips.
7. Passive mood drain formula (`_moodDrainFor`): 0.3/hour base, +0.5 each if hunger<30 / energy<30, +1.0 each if exactly 0. Used by both the activity tick and `passMinutes`.
8. Bar: `BAR_SCHEDULE` (Mon closed, Tue-Thu open mic, Fri paid showcase, Sat battle, Sun karaoke) and `BAR_MENU` (5 items, immediate boost + stacked next-morning debuff via `char.pendingDebuff`).
9. Initial character (`initialChar`, 150-225) has 72 fields; `migrateChar` (11191-11263) adds 6 more that are NOT in `initialChar` (plant/stream fields). Save = whole `char` JSON in 5 slots.
10. Real bugs/oddities found: 3 of 6 weekly challenges can never complete (counters never written to `char.weekly`), `rentBump` event is a no-op, apartment "less bad sleep" and "+25% home recording" are advertised but not implemented, `new_bed` bonus is `Math.min(max, max+20)` (no-op), 2 AM collapse skips almost the whole morning pipeline. See OPEN QUESTIONS / GOTCHAS.

## Conventions

- Stat keys on `char.stats`: `mus` (musicality), `tec` (technicality), `ori` (originality), `sho` (showmanship). Sound/judge tables use the long names (`musicality`, ...). There is no sound with stat `showmanship`.
- Day of week: `dayOfWeek(day) = (day||1) % 7`; 0=MON 1=TUE 2=WED 3=THU 4=FRI 5=SAT 6=SUN. Day 1 = TUE, day 6 = SUN, day 7 = MON.
- `minutes` on `char` = in-game minutes since 06:00.
- `_clampPct(v)` clamps 0..100 (defined at line 2287, used here). `Math.random()` is used everywhere with no seeding (see Rebuild notes: inject an RNG).
- "Pure" = no React/DOM; can be lifted nearly verbatim into TypeScript.

---

## Imports (lines 1-2)
- `react` (useState/useEffect/useRef) and `lucide-react` icons (Home, Music, Trophy, ShoppingBag, TreePine, Beer, Mic, Zap, Star, Coffee, Dumbbell, ArrowLeft, Heart, MessageSquare).
- Rebuild notes: drop both; icons are UI only. React is only needed by `useSettings` (990-998).

## SOUND_CATALOG (lines 6-19)
- What: the 12 beatbox sounds the player can equip in battles/jams. Keyed by id. Schema: `{ name, cat, tier, stamina, base, stat }`.
- `stamina` = energy cost of using the sound in a round, `base` = base score contribution, `stat` = which of mus/tec/ori (as a long name) scales it. Tier 1..4.
- Full table (id | name | cat | tier | stamina | base | stat):
  - classic_kick | Classic Kick | Kicks | 1 | 8 | 12 | musicality
  - hi_hat | Basic Hi-Hat | Hats | 1 | 4 | 7 | technicality
  - psh_snare | PSH Snare | Snares | 1 | 6 | 10 | musicality
  - inward_k | Inward K Snare | Snares | 2 | 9 | 16 | technicality
  - throat_kick | 808 Throat Kick | Kicks | 2 | 12 | 20 | musicality
  - fast_hats | Fast Hi-Hats (TKs) | Hats | 2 | 10 | 15 | technicality
  - lip_roll | Lip Roll | Liproll | 2 | 11 | 17 | originality
  - inward_bass | Inward Bass | Bass | 3 | 14 | 22 | originality
  - d_low | D-Low Scratch | Scratch | 3 | 15 | 25 | originality
  - laser | Laser Whistle | Whistles | 3 | 13 | 23 | originality
  - click_roll | Click Roll | Clicks | 3 | 16 | 26 | technicality
  - uvular_roll | Uvular Kick Roll | Kicks | 4 | 22 | 38 | technicality
- Used at: battle engine (`playOpponentRoundPattern` etc., other range), shop/equip UI, `applySoundUnlocks` (toast names), NPC `sounds` arrays, achievement `sound_master` (`sounds.length >= 12`).
- Rebuild notes: pure data. Category strings (`cat`) are used for UI grouping; the 12-count is hard-wired into the `sound_master` achievement.

## SOUND_UNLOCKS + newlyUnlockedSounds + applySoundUnlocks (lines 21-65)
- What: sounds were once sold in the shop; now milestone-gated. Each entry `{ tier, label, cond(c) }`. `applySoundUnlocks(c)` runs on every `checkLevelUp` (line 11385-11410, which every stat/follower/battle event routes through).
- Table (id: label, condition):
  - classic_kick, hi_hat, psh_snare: "Start" - always true (granted by `initialChar`).
  - inward_k (T2): "Find the cypher - 3 jams" - `storyFlags.jamCount >= 3`
  - throat_kick (T2): "Beat Pig Pen" - `storyFlags.pigPenWins >= 1`
  - fast_hats (T2): "5 open mics performed" - `openMicCount >= 5`
  - lip_roll (T2): "Originality stat >= 10" - `stats.ori >= 10`
  - inward_bass (T3): "Beat Sikker" - `defeated.includes('Sikker')`
  - d_low (T3): "200 followers" - `followers >= 200`
  - laser (T3): "Beat Alim" - `defeated.includes('Alim')`
  - click_roll (T3): "500 followers" - `followers >= 500`
  - uvular_roll (T4): "Beat FatboxG" - `defeated.includes('FatboxG')`
- Rules: `newlyUnlockedSounds` = every id not already in `char.sounds` whose cond passes (order = table order). `applySoundUnlocks` appends them to `char.sounds` and **auto-equips** each into `char.equipped` while `equipped.length < 5` (5-slot equipped bar) and not already equipped. Returns `{ char, unlocked: [display names] }`.
- Player-visible: sound `playUnlock()` after 60 ms, toast `"🔓 Unlocked: <name>"` after 80 ms (type 'win') per sound.
- State: reads `sounds`, `equipped`, `storyFlags.jamCount`, `storyFlags.pigPenWins`, `openMicCount`, `stats.ori`, `defeated`, `followers`; writes `sounds`, `equipped`.
- Rebuild notes: pure, lift verbatim. Edge: `equipped` is only extended, never reordered. Only checked inside `checkLevelUp`, so any new code path that changes these values must call it too.

## Gear effect helpers: hasGear / plantAlive / FILTERED_BAD_SLEEP (lines 67-76)
- `hasGear(c,id) = !!c?.gear?.[id]` (gear is `{ itemId: true }`).
- `plantAlive(c)` = has `houseplant` gear AND `!c.plantDead` AND `(c.day - c.lastPlantWaterDay) < 5` (watered within the last 4 days; "alive" is purely derived, a neglected plant is not flagged dead and revives if watered again).
- `FILTERED_BAD_SLEEP(c)`: if `earplugs` owned, `BAD_SLEEP_REASONS` minus ids `noisy` and `heating`; else all reasons. (Used at 13149.)
- Related plant facts from outside the range (needed for parity): watering costs $5, max 3/day, the 4th watering in a day drowns it (`plantDead=true`, `plantDeathDay=day`, cutscene "blub. blub. ...blub."); replacement available from the first Tuesday strictly after death (`replantAvailableDay`, line 1073). Buying sets `lastPlantWaterDay=day`, `plantDead=false`, water count 0. Plant mood: +1 per morning when `plantAlive` (13171).
- Gear catalog (GEAR_CATALOG, 2039-2100, other range) has 14 items - the `completist_gear` achievement hard-codes `>= 14`.

## FOOD (lines 79-85)
- What: home/city food items. Schema `{ name, cost, energy, hunger, mood, kind }`, kind 'food' | 'drink'.
  - banana | Banana | $4 | energy +12 | hunger +15 | mood +1 | food
  - smoothie | Green Smoothie | $9 | +25 | +20 | +3 | drink
  - oat_bowl | Oat Bowl | $7 | +18 | +35 | +2 | food
  - espresso | Espresso | $5 | +25 | **-15** | +2 | drink
  - buddha_bowl | Buddha Bowl | $14 | +22 | +50 | +4 | food
- Used at: the food/eat UI (other range). Rebuild: pure data; apply with clamping (energy to maxEnergy, hunger/mood 0..100) and `passMinutes` for time (check eat code).

## NPCS - solo battle opponents (lines 87-97)
- What: 7 solo opponents, strictly ascending. Schema `{ name, stats{mus,tec,ori,sho}, sounds[], reward (cash), level, counterSkill (0-1) }`. Comment: rewards halved + opps tougher (see `playOpponentRoundPattern`); `counterSkill` = probability the opponent re-rolls its pick to counter the player after the player wins RPS.
  - Pig Pen | 7/7/5/6 (sum 25) | classic_kick, hi_hat, psh_snare | $20 | L1 | 0.20
  - Joel Burner | 8/8/6/7 (29) | classic_kick, hi_hat, psh_snare | $25 | L1 | 0.30
  - CeDe | 12/11/9/10 (42) | classic_kick, hi_hat, psh_snare, lip_roll | $50 | L3 | 0.40
  - Sikker | 15/15/14/12 (56) | classic_kick, inward_k, fast_hats, lip_roll | $100 | L5 | 0.55
  - Alim | 19/18/17/15 (69) | throat_kick, inward_bass, fast_hats, lip_roll | $175 | L7 | 0.70
  - Olexinho | 24/22/22/19 (87) | throat_kick, click_roll, d_low, laser, inward_bass | $350 | L9 | 0.80
  - FatboxG | 30/32/28/28 (118) | uvular_roll, click_roll, d_low, inward_bass, laser, throat_kick | $750 | L12 | 0.95
- `char.defeated` is an array of NPC **names**; sound unlocks and achievements match on name (`'Sikker'`, `'Alim'`, `'FatboxG'`), `the_crew` = `defeated.length >= 7`.
- Rebuild notes: pure data; the `level` field is used for display/gating by battle UI (other range). Names are used as ids - keep exact spelling.

## CREWS - 3v3 crew battles (lines 99-140) + resolveCrewBattle (lines 1150-1172)
- What: 3 crew showdowns on Saturday battle night (best of 3 rounds). Schema `{ id, name, desc, minDefeated, members[3]{name,stats}, reward{cash,followers,flag?} }`.
  - pen_pals "PEN PALS" - "Pig Pen + 2 friends from his crew. Easy money if you survive." - minDefeated 3 - members Pig Pen 7/7/5/6, Ras-T 9/8/7/6, Kiko 8/7/9/7 - reward $80 + 15 fans (no flag)
  - vpn_vets "VPN VETS" - "Three veterans of the regional scene. Watch the throat kicks." - minDefeated 5 - Klem 14/14/12/13, Niko-1 13/15/14/12, Boomer 15/12/13/14 - reward $200 + 35 fans, flag `crewVpn`
  - world_champs "WORLD CHAMPS" - "Three names from the global circuit. Win this and you move continents." - minDefeated 7 - Vex 26/27/24/25, Mir 28/24/26/26, TK-9 27/28/25/27 - reward $800 + 120 fans, flag `crewChamps`
- `resolveCrewBattle(c, crew)` formula (pure, RNG):
  - `ourTotal = mus+tec+ori+sho`; `moodMod = ((mood||50) - 50) / 4` (range -12.5..+12.5; note `mood||50` means mood 0 is treated as 50).
  - `allyBoost = 5 + min(2, defeated.length) * 3` (so 5, 8 or 11; always 11 when crews are unlocked at >=3).
  - `ourPerRound = floor(ourTotal*0.6) + allyBoost`.
  - 3 rounds, member i faces `crew.members[i]`: `ourRoll = ourPerRound + moodMod + rand(-10,+10)`; `theirRoll = floor(theirTotal*0.7) + rand(-10,+10)`; player wins the round if `ourRoll >= theirRoll` (ties go to player). Win = more rounds won (3 rounds so no ties).
  - Returns `{ rounds:[{our,their,win,theirMember}] (our/their rounded), won, ourScore, theirScore }`. (Header comment mentions `ourMember` and "avg(playerStat)" - neither exists; ignore the comment.)
  - Opponent base roll (`floor(total*0.7)`): Pig Pen 17, Ras-T 21, Kiko 21, Klem 37, Niko-1 37, Boomer 37, Vex 71, Mir 72, TK-9 74.
- Outcome handling (consumer `doCrewBattle`, 15768-15812): needs 30 energy and not sick; +90 min via `passMinutes`; energy -30; heat +4; sets `lastBattleDay`. WIN: mood +12, cash +reward.cash, followers +reward.followers, xp +30, flags `crew_<id>_won` and the reward `flag`, then `checkLevelUp`. LOSS: mood -10, cash +floor(reward.cash*0.2), followers -3 (min 0), xp +12, flag `crew_<id>_lost`. UI panel shows only on battle night, if not on the 7-day battle cooldown, and `defeated.length >= 3`; each crew locked until `defeated.length >= minDefeated`.
- Rebuild notes: pure; lift verbatim. `crewVpn`/`crewChamps` flags are set but I found no reader in my range (check other ranges before deleting).

## JUDGES (lines 142-148)
- 5 judges, schema `{ name, bias, emoji }`: Tek (technicality, gear emoji), Mel (musicality), Origi (originality), Showtime (showmanship), Wildcard (random, dice emoji). Consumed by the battle scoring UI (other range).
- Rebuild: pure data; `bias` strings are long stat names plus the literal `'random'`.

## initialChar (lines 150-225)
- What: factory returning a fresh character; stored per slot as JSON. Fields with defaults (comments from source in parentheses):
  - Identity/look: `name ''`, `color '#D4A017'` (shirt), `skin '#d4a87a'`, `hairColor '#1a1a2e'`, `hairStyle 'short'`.
  - Core: `level 1`, `xp 0` (level-up needs `level*100` xp, see `checkLevelUp` 11385), `cash 30`, `followers 0`, `energy 100`, `maxEnergy 100` (grows +1 per 5 good run-minigame bars), `hunger 70`, `mood 70`.
  - `stats {mus 5, tec 5, ori 5, sho 5}`.
  - `sounds ['classic_kick','hi_hat','psh_snare']`, `equipped` same three (max 5), `defeated []`.
  - Time: `day 1`, `minutes 0` (0=6am, 720=6pm, 1080=midnight, 1200=2am forced sleep).
  - Voice/training: `voiceRange null` ('higher'|'lower'|'auto'), `voiceRangeMidi null`, `tecLessonsCompleted 0` (lesson N unlocked when N-1 <= completed), `tecCurrentLesson 0`, `tecBpm 90`, `oriBpm 100`, `oriPattern null` (legacy, migrated to slot 0), `oriSlots null` (array of 4; 8 with MPC), `oriSlotIdx 0`.
  - Economy/home: `songs []` ({id,name,releasedDay,activeCells,lifetimeFans}), `crew []` ({id,joinedDay,lifetimeCash,lifetimeFans}), `pendingDebuff null` ({energy?,mood?,hunger?} applied next sleep), `apartmentTier 1`, `rentLate 0` (0..2; 3rd miss evicts), `lastRentPaidDay null`, `evictionRecoveryDay null` (unused in my range), `apartmentMovedInDay 0`.
  - Bar/battle: `showcaseBooking null` ({day,minute}), `lastShowcaseDay null` (7-day cooldown), `lastBattleDay null` (7-day cooldown), `openMicCount 0`.
  - Messages/Foxy: `messages []`, `lastParentMsgDay 0` (parent text cooldown), `lastFoxySafetyNetDay 0` (one free feed per week), `lastFoxySoupDay 0` (daily free soup), `foxyLoanTaken false` ($15 one-time loan).
  - Social: `mingleCount 0`, `romanceAffinity {}`, `romanceState {}`, `dateBooking null` ({partner,day,minute}), `metEncounters {}`.
  - Challenges: `daily {}`, `dailyChallenge null` ({id,claimed}), `weekly {}`, `weeklyChallenge null`.
  - Meta: `achievements {}` ({id: dayEarned}), `lastTourDay 0` (7-day cooldown), `festivalState null` ('invited'|'prepping'|'done' per comment; code also uses 'choosing'), `festivalAcceptedDay 0`, `festivalPath null` ('A'|'B'|'C'), `festivalResult null` ('win'|'lose').
  - Cosmetic/coaching: `outfit 'default'`, `accessory 'none'`, `bjarneSessions 0`, `lastBjarneDay 0` (3-day cooldown), `sickDay 0` (the day you are sick), `flashbacksSeen {}`, `gear {}`, `lastCoffeeDay 0`, `lastPlantWaterDay 0`, `lastYogaDay 0`, `storyFlags {}`, `created false`.
- Fields NOT in `initialChar` but present at runtime (from `migrateChar`, 11190-11263, and elsewhere): `lastStreamDay 0`, `lastStreamViewers 0`, `plantWaterCount 0`, `plantWaterCountDay 0`, `plantDead false`, `plantDeathDay 0`; also written ad hoc: `heat` (+2/+4/+8 on shows; never read in my range), `rentBumped` (set by an event, never read), `_opponent` (transient, set on `char` at 16281 and so leaks into saves).
- `storyFlags` keys used inside my range: `firstJam`, `jamCount`, `pigPenChallenged`, `pigPenBattled`, `pigPenWins`, `pennyReveal`, `crystixMet`, `firstShowcase`, `rohzelFridayOffer`, `firstRentPaid`, `festivalInviteSent`, `festivalWon`, `evictedOnce`, `seenChallengesHint`, `foxyFirstSafetyNet`, `lastFoxyWaveDay`, `sponsor_<brand>_signed` (brands snortvpn, redfull, sure, adipas, samsong), `crew_<id>_won/_lost`, `crewVpn`, `crewChamps`, tutorial flags `tut_<id>`.
- Rebuild notes: define a `Character` interface + `makeInitialChar()` + a `migrate(char)` that applies all defaults above (load must tolerate old saves). Keep `created` gating (the char-creation screen sets it).

## Global key dispatcher: onGlobalKey (lines 227-257)
- What: single document-level capture-phase `keydown` listener lazily attached on first subscription; components subscribe with `onGlobalKey(handler)` and get an unsubscribe function. Used by rhythm minigames and pads at lines 2809, 2894, 4657, 18062.
- Rules: stash `_lastGlobalKey = "<key>/<code>"` and timestamp (for a debug overlay; I found no reader of these two variables outside the range = dead debug stash). Then ignore the event if the focused element is INPUT/TEXTAREA/contentEditable, or `e.repeat`, or meta/ctrl/alt held. Otherwise call every registered handler with the raw event inside try/catch (errors swallowed).
- Rebuild notes: replace with Phaser's `this.input.keyboard` events; preserve (a) no key-repeat, (b) no handling while a DOM text input is focused (name entry), (c) modifier-held keys ignored (don't steal browser shortcuts), (d) one failing handler must not break others. Handlers receive a DOM `KeyboardEvent` (`e.key`, `e.code`) - the Phaser handlers will want the same two fields.

## SENDER_META (lines 264-273)
- Phone sender display styles `{ display, color }`: parents PARENTS #fbbf24; rohzel ROHZEL #22d3ee; pigpen PIG PEN #fb7185; penny PENNY #a78bfa; foxy FOXY #84cc16; crystix CRYSTIX #22d3ee; beeamgee BEEAMGEE #D4A017; unknown UNKNOWN #a8a29e.
- Used at 6934 (messages panel; fallback `SENDER_META.unknown`). Only parents, rohzel, foxy and unknown are ever passed to `addMessage` (grep of whole file); pigpen/penny/crystix/beeamgee are defined but unused.

## PARENT_MESSAGES (lines 275-299)
- Pools keyed by trigger reason (all lowercase, texting tone). 12 lines total.
  - hungerLow (2): "are you eating? we're not mad about the job but call your mother" / "did you eat today? please eat something"
  - rentPaid (2): "rent paid this month? we can help if you need" / "we saw a couple thousand in our account if you need it"
  - rentMissed (2): "are you doing okay? the door's always open here" / "your father said let us help you. text back"
  - goodShow (2): "saw your show on insta lol look at you" / "the auntie is asking who taught you to do that. what do i tell her"
  - random (4): "just thinking of you ❤️", "dad found your high school yearbook 😂", "your cousin asked when you're coming home", "the dog misses you. i miss you too but the dog more"
- Trigger logic (in `finishSleep`, 13249-13261): needs `newDay - lastParentMsgDay >= 3`. Then first matching branch (note `else if` chain, each with its own probability): rent paid this wake-up 45% -> rentPaid; rent missed or warning 75% -> rentMissed; hunger (after morning update) < 30 50% -> hungerLow; Sunday (`newDay%7===6`) 30% -> random. On send: add message from 'parents' and set `lastParentMsgDay = newDay`. Also after open mic: `fanGain >= 5` + 35% + 3-day cooldown -> goodShow (15720-15725). One extra scripted parent text at 11688 (post-move-in: "you settled in? we're not mad about the job. come over for sunday dinner anytime ❤️").

## UNKNOWN_MESSAGES_HATE / UNKNOWN_MESSAGES_FAN (lines 301-327)
- Anonymous "internet" texts from sender 'unknown'; 10 hate + 10 fan lines.
  - Hate examples: "your beats are wack.", "delete your account.", "you peaked at the open mic lmao", "0 talent. confirmed.", "could literally be replaced by a drum machine.", "this is why people miss real beatboxers."
  - Fan examples: "saw your clip - fire 🔥" (source uses an em dash), "bro you're underrated. keep going.", "from a stranger: keep doing what you're doing.", "i wait for your posts. please don't stop.", "you remind me why i started."
- Triggers: nightly (only if `followers > 0`): independent 5% fan roll and 4% hate roll (13264-13267). After an open mic: `fanGain >= 5` -> 35% fan; else `fanGain <= 1` -> 30% hate (15726-15732).
- Rebuild: pure data; copy the arrays verbatim from lines 304-327.

## addMessage / unreadMessageCount (lines 913-927)
- `addMessage(c, sender, text)` returns a new char with `{ id: Date.now()+rand(0..999), sender, text, day: c.day, minute: c.minutes ?? 0, read:false }` appended (newest last). `unreadMessageCount(c)` = count of `!read`. The Messages panel (6885+) displays newest first and marks ALL read on open; header badge uses the count (11580).
- No cap on the array length (saves grow forever). IDs are not guaranteed unique (timestamp + 0..999). Multi-line text uses `\n` (festival invite text). Other `addMessage` call sites: 7072/13000 Foxy loan text "this is a one-time thing. go busk in the park. seriously.", 12712 Foxy safety net (random `FOXY_QUIPS`), 13271 Rohzel festival invite.

## BAD_SLEEP_REASONS (lines 329-348)
- What: rough-night narrative reasons; each `{ id, energyCap, line, when?(c,newDay) }`. `energyCap` = fraction of `maxEnergy` the player wakes with (instead of full).
  - nightmare 0.70 "Bad dream. You woke up rattled." (ambient, no `when`)
  - lonely 0.75 "The apartment was too quiet for sleeping." (ambient)
  - noisy 0.70 "Upstairs neighbor played speed garage at 3am." (ambient; removed by earplugs)
  - heating 0.80 "Couldn't get comfortable. The heating is stuck on high." (ambient; removed by earplugs)
  - layoff 0.60 "You woke up at 4am thinking about the job. Again." (ambient)
  - rent 0.60 "You couldn't stop thinking about the rent." when `rentLate >= 1`
  - battle 0.65 "Your brain ran the next battle on a loop." when `newDay%7` is 5 or 4 (waking on Saturday or Friday)
  - showcase 0.65 "Friday's set looped in your head all night." when `showcaseBooking.day` exists, `>= newDay` and `showcaseBooking.day - newDay <= 1`
  - replay_loss 0.70 "You replayed the battle you lost. Every move." when `lastBattleDay` set, `day - lastBattleDay <= 2`, `storyFlags.pigPenWins === 0` (falsy) and `storyFlags.pigPenBattled`
  - caffeine 0.70 "That late espresso came back to bite." when `pendingDebuff.energy <= -10`
- Selection (in `finishSleep`, 13143-13155): 10% chance per sleep (not when evicted). `eligible` = filtered by `when(c0,newDay)` on the pre-sleep char; state reasons (those with `when`) are chosen with 60% probability if any exist, otherwise uniformly from all eligible. Effect (13166-13169): energy = `floor(maxEnergy * energyCap)` (the pendingDebuff is then added), mood = `max(0, mood-10)` after the normal +10; toast `"Bad sleep · <line>"` (type 'bad') 100 ms after waking.
- Rebuild notes: pure, lift verbatim. Whole-array filter for earplugs. Note the `showcase` and `battle` reasons use `newDay`, the others use `c`.

## RANDOM_EVENTS + pickRandomEvent + applyRandomEvent (lines 350-505)
- What: 24 overnight surprises. Schema `{ id, weight (default 1), when?(c), color, title, lines[], effects{ mood, energy, hunger, cash, followers, stats{k:+n}, flags{}, special } }`.
- Roll: once per full sleep, 30% chance, never when evicted (13139). `pickRandomEvent(c)`: eligible = events whose `when(c)` is true (exceptions treated as false); weighted pick `r = rand*total; subtract weights`. Called with `{...c0, day:newDay}` (new day, old other state).
- `applyRandomEvent(c, ev)` clamps: mood and hunger via `_clampPct`; energy to `0..maxEnergy`; cash and followers floored at 0; stats additive with no clamp; `flags` merged into `storyFlags` (no event uses `flags`). Specials: `markAllRead` (all messages read), `sick` (sets `sickDay = c.day`; since applied after the day rolls this makes the NEW day a sick day), `rentBump` (sets `rentBumped = true`; **never read anywhere, no mechanical effect** though text says rent rises $10/week).
- Applied inline into the morning state, then a cutscene (speaker = title, color = event.color, one beat with `lines`) 200 ms after waking (13298-13305).
- Full table (id | weight | requires | effects | title). Lines are 1-3 short sentences each at the cited source lines.
  1. bird_poop | 3 | - | mood -3 | A SEAGULL JUST BLESSED YOU ("Right on the jacket. New jacket too.")
  2. street_compliment | 4 | - | mood +5, followers +1 | STREET COMPLIMENT
  3. lost_tenner | 2 | - | cash +10, mood +4 | TEN BUCKS ON THE GROUND
  4. song_on_radio | 3 | day>=10 | mood +12 | THE SONG
  5. old_yt_comment | 2 | day>=14 | mood +8 | A NOTIFICATION FROM 2017
  6. birthday_gig | 2 | storyFlags.firstJam | cash +30, followers +3, mood +5 | BIRTHDAY GIG
  7. journalist_dm | 2 | followers>=20 | stats.sho +1, mood +6 | A JOURNALIST WROTE
  8. crystix_viral | 1 | storyFlags.crystixMet | followers +50, mood +10 | CRYSTIX TAGGED YOU
  9. bike_stolen | 2 | day>=5 | cash -25, mood -8 | YOUR BIKE IS GONE
  10. phone_died | 2 | day>=4 | mood -5, special markAllRead | PHONE FROZE AT 3%
  11. algorithm_dud | 2 | followers>=30 | mood -8 | POST FLOPPED
  12. free_coffee | 2 | followers>=50 | energy +15, mood +6 | FREE COFFEE
  13. og_invite | 1 | day>=20 | stats.tec +1, mood +8 | AN OLDER VOICE LEFT A VOICEMEMO
  14. rent_help | 1 | rentLate>=1 | cash +40, mood +3 | PARENTS WIRED MONEY
  15. good_dream | 2 | day>=8 | mood +10, energy +5 | A GOOD DREAM
  16. sick_day | 2 | day>=6 and sickDay !== day | mood -8, energy -25, special sick | YOU'RE SICK ("No drills today. No mic. No bar.")
  17. parking_ticket | 2 | day>=7 | cash -40, mood -6 | PARKING TICKET
  18. dentist | 1 | day>=12 | cash -80, mood -10 | DENTIST EMERGENCY
  19. broken_phone | 1 | day>=8 | cash -60, mood -4 | CRACKED SCREEN
  20. food_poisoning | 1 | day>=10 | hunger -30, mood -8, energy -15 | BAD TAKEOUT
  21. tax_letter | 1 | day>=18 | cash -120, mood -10 | A LETTER FROM THE COUNCIL ("Pay this month or it triples.", nothing triples)
  22. bombed_set | 2 | openMicCount>=2 and day>=5 | mood -15, followers -3 | YOU BOMBED LAST NIGHT
  23. rivalry_clip | 1 | followers>=80 and pigPenWins truthy | mood -12, followers +8 | SOMEONE DISSED YOU ONLINE
  24. rent_increase_letter | 1 | day>=25 and apartmentTier===1 | mood -8, special rentBump | NOTICE FROM THE LANDLORD
  - Total weight when everything eligible = 43 (15 pleasant/neutral events = 31, 9 setbacks = 12).
  - Event colors (hex) are per-event in source (e.g. sick_day #84cc16, bike_stolen #dc2626, crystix_viral #22d3ee).
- Notable lines: "Right on the jacket. New jacket too." / `"that's actually sick. keep it up."` / "You're not the same person who first heard this." (song_on_radio, same sentence reused in the `the_song` flashback) / "Wrong key. Wrong rhythm. The crowd just stared."
- Rebuild notes: pure data + two pure functions (take an injected RNG). Lines for each event are at 355-469; copy verbatim. Effects can drive money below 0 only through the floor (cash can't go negative; e.g. tax -120 with $30 just zeroes).

## DAILY_CHALLENGES + pickDailyChallenge + bumpDaily + dailyChallengeMet (lines 507-547)
- What: one challenge per in-game day, chosen at wake-up from the entries valid for that day-of-week; progress counters live in `char.daily` (reset to `{}` every full sleep). Schema `{ id, label, target, counter, reward{cash?,mood?,followers?}, when?(dow) }`.
  - jams_3: "Do 3 cypher jams", target 3, counter `jams`, reward $15 - any day
  - openmic_1: "Play 1 open mic", 1, `openMics`, $15 - when dow 1..3 (Tue/Wed/Thu)
  - mingle_2: "Have 2 bar conversations", 2, `mingles`, $10 - when dow !== 0 (not Monday)
  - busks_2: "Busk twice in the park", 2, `busks`, $12 - any day
  - runs_1: "Complete a run session", 1, `runs`, $8 + mood 5 - any day
  - battle_win: "Win a battle tonight", 1, `battleWins`, $30 - when dow === 5 (Saturday)
  - showcase: "Play the Friday showcase", 1, `showcases`, $30 - when dow === 4 (Friday)
  - foxy_hi: "Say hi to Foxy", 1, `foxyHi`, mood +6 - any day
- `pickDailyChallenge(dow, c)`: uniform random over the eligible entries (the `c` param is unused). `dow = newDay % 7` (13229). Stored as `dailyChallenge = { id, claimed:false }`.
- `bumpDaily(c, counter, by=1)`: increments `daily[counter]` AND `weekly[counter]`. Used only for counters `busks` (14806), `jams` (14836) and `runs` (14924). All other counters are written directly to `daily` only (see bug below): `foxyHi` 7029, `mingles` 7475, `openMics` 15718, `showcases` 15947, `battleWins` 18423 (adds 1 only if won).
- `dailyChallengeMet(c)` = counter >= target; **defined but never used** (the UI computes it inline at 13506).
- Claiming is manual (13517-13528): cash/followers added, mood added with `_clampPct`, `dailyChallenge.claimed=true`, toast `"Daily: $15"` etc. Challenges UI only appears after the first sleep (no challenge exists on day 1).
- Rebuild notes: pure; keep counter names identical because they are written from many places. **Fix the weekly bug** (see gotchas): route all counters through one `bump(counter)`.

## WEEKLY_CHALLENGES + pickWeeklyChallenge (lines 549-563)
- 6 entries, uniform random pick (no `when`). Schema as daily. Counters read from `char.weekly`.
  - wk_battles_3 "Win 3 battles this week" target 3 counter `battleWins` reward $100 + 20 followers
  - wk_openmic_5 "Play 5 open mics this week" 5 `openMics` $80 + 15 followers
  - wk_jams_15 "Do 15 cypher jams this week" 15 `jams` $60 + 10 followers
  - wk_busks_10 "Busk 10 times this week" 10 `busks` $70 + 8 followers
  - wk_mingles_8 "Mingle 8 nights this week" 8 `mingles` $50 + mood 10
  - wk_runs_4 "Run 4 sessions this week" 4 `runs` $40 + mood 15
- Reset rule (13243-13248): on the wake-up where `newDay % 7 === 0` (Monday) OR when no weekly challenge exists, `weekly = {}` and a new one is picked with `claimed:false`. First sleep of a new save therefore also wipes `weekly` (kickstart).
- **Bug:** `weekly` counters are only incremented by `bumpDaily`, and only `busks`, `jams`, `runs` go through it. `wk_battles_3`, `wk_openmic_5`, `wk_mingles_8` (3 of 6) can never complete.
- Claim: 13529-13540, same as daily; UI shows "daily x/y . weekly x/y" and a days-to-Monday countdown (`dow===0 ? 7 : 7-dow`).

## CREW_NPCS - hireable crew + helpers (lines 565-599)
- What: 5 recruitable beatboxers; each gives a passive nightly cash + fans payout, no upkeep. Schema `{ id, name, blurb, look{skin,hair,shirt}, recruitCost, recruitMinFans, dailyCash, dailyFans }`.
  - jaxx JAXX "Local cypher regular · loves a 4-on-floor" - cost $80, min fans 25, +$6/day, +1 fan/day - look skin #d4a87a hair #3a2410 shirt #a04040
  - noor NOOR "YouTube tutorial nerd · sharp ear" - $200, 75 fans, +$12, +2 - #c08070 / #5a2010 / #5a7050
  - duo_t DUO-T "Twin brothers — one mic, two voices" - $400, 200 fans, +$22, +4 - #a87844 / #1a1a2e / #7a5a30
  - glaze GLAZE "Producer / hat specialist · ex-radio host" - $800, 500 fans, +$38, +7 - #e0b890 / #dadada / #3a5a6a
  - mira MIRA "Choir-trained ringer · perfect pitch" - $1500, 1200 fans, +$60, +12 - #d4a87a / #7a3a20 / #a06090
- `crewIsRecruited(c,id)` = `c.crew.some(m => m.id===id)`; `crewIsAvailable(c,npc)` = `followers >= recruitMinFans`.
- Payout (13112-13128, 13235-13236): each morning for every recruited member, add `dailyCash` and `dailyFans` to `cash`/`followers`, and add to the member's `lifetimeCash`/`lifetimeFans`. Toast `"👥 Crew brought in +$X / +N fans"` at 800 ms. Recruit UI at 12246-12330 (spends cash, pushes `{id,joinedDay,lifetimeCash:0,lifetimeFans:0}`).
- Payouts do NOT happen on the 2 AM collapse path. Mira's `id: 'mira'` collides with the romance candidate `mira` (romanceState.mira, outfit `romance_pink`) - different systems, same string; do not merge them.
- Rebuild: pure data + 2 predicates; trivially portable.

## ACHIEVEMENTS (lines 601-638)
- What: 20 auto-checked achievements, evaluated in `checkLevelUp` (11401) right after sound unlocks. Schema `{ id, label, desc, tier ('b'|'s'|'g'), cond(c) }`. `TIER_COLOR = { b:'#a8a29e', s:'#dadada', g:'#fbbf24' }`.
- Table (id | label | desc | tier | condition):
  - first_steps | First Steps | Stand in the cypher for the first time | b | `storyFlags.firstJam`
  - cypher_regular | Cypher Regular | Do 10 jams | b | `jamCount >= 10`
  - open_mic_newcomer | Open Mic Newcomer | Play your first open mic | b | `openMicCount >= 1`
  - mic_veteran | Mic Veteran | Play 10 open mics | s | `openMicCount >= 10`
  - first_saturday | First Saturday | Show up to your first battle | b | `storyFlags.pigPenBattled`
  - first_blood | First Blood | Win your first battle | s | `defeated.length >= 1`
  - pen_to_penny | Pen to Penny | Beat Pig Pen twice | s | `pigPenWins >= 2`
  - the_crew | The Crew | Defeat all 7 opponents | g | `defeated.length >= 7`
  - one_hundred | One Hundred | Reach 100 followers | b | `followers >= 100`
  - thousand_strong | Thousand Strong | Reach 1,000 followers | s | `followers >= 1000`
  - ten_k | Ten Thousand | Reach 10,000 followers | g | `followers >= 10000`
  - gear_hoarder | Gear Hoarder | Own 5 pieces of gear | b | `Object.keys(gear).length >= 5`
  - completist_gear | Completist (Gear) | Own every shop item | g | `Object.keys(gear).length >= 14`
  - sound_master | Sound Master | Unlock every sound | g | `sounds.length >= 12`
  - in_love | In Love | Become a couple with someone | s | any `romanceState` value === 'couple'
  - penny_revealed | Real Name Penny | Earn the Penny reveal | s | `storyFlags.pennyReveal`
  - crystix | Bro from the Forum | Meet Crystix in person | s | `storyFlags.crystixMet`
  - sponsored | Sponsored | Sign your first sponsorship | b | any storyFlags key starting `sponsor_` and ending `_signed`
  - all_sponsors | Five-Brand Athlete | Sign all 5 sponsorships | g | flags `sponsor_{snortvpn,redfull,sure,adipas,samsong}_signed` all truthy
  - level_10 | Level Ten | Reach level 10 | b | `level >= 10`
- `newlyEarnedAchievements(c)` = not yet in `c.achievements` and cond true. `applyAchievements(c)` writes `achievements[id] = c.day` for each and returns `{ char, earned:[defs] }`. Consumer plays `playAchievement()` after 130 ms, queues `earned` into `achievementQueue` (modal fanfare), and toasts `"🏆 Achievement: <label>"` at 140 ms.
- Edge: an achievement-triggering state change is only noticed at the next `checkLevelUp` call. Gear counts include gear flags only (not the plant being dead).
- Rebuild notes: pure; lift verbatim. Cond functions reference `storyFlags` keys set by other ranges (sponsor and Penny/Crystix beats) - confirm exact key spelling there.

## OUTFITS / ACCESSORIES / activeOutfitShirt (lines 640-685)
- What: cosmetic shirt-colour overrides (OUTFITS) and hat/glasses (ACCESSORIES), milestone auto-unlocked. `outfitUnlocked(c,id)`/`accessoryUnlocked(c,id)` = entry exists AND cond true (try/catch -> false).
- OUTFITS (id | name | unlock text | shirt | cond):
  - default | Default | "Your everyday color" | null | always
  - tracksuit | Track Suit | After signing Adipas | #1a1a1a | `sponsor_adipas_signed`
  - stage_gold | Stage Gold | 100 followers | #fbbf24 | `followers >= 100`
  - red_devil | Red Devil | Beat Pig Pen twice | #dc2626 | `pigPenWins >= 2`
  - champion_white | Champion White | Win BBBWC2027 | #dadada | `storyFlags.festivalWon`
  - romance_pink | Mira's Hand-Stitched | Mira couple | #fb7185 | `romanceState.mira === 'couple'`
  - romance_lime | Sky's Joke Shirt | Sky couple | #84cc16 | `.sky`
  - romance_cyan | Luca's Studio Tee | Luca couple | #22d3ee | `.luca`
  - romance_amber | Pascal's Press Tee | Pascal couple | #fbbf24 | `.pascal`
  - romance_violet | Jin's Studio Wrap | Jin couple | #a78bfa | `.jin`
  - romance_rose | Roo's Festival Pass | Roo couple | #fb7185 | `.roo`
- ACCESSORIES (id | name | unlock text | cond):
  - none | None | (blank) | always
  - cap | Snapback | 5 open mics done | `openMicCount >= 5`
  - beanie | Studio Beanie | Train with BeeAmGee 3x | `bjarneSessions >= 3`
  - shades | Shades | 50 followers | `followers >= 50`
  - glasses | Round Glasses | Pascal couple | `romanceState.pascal === 'couple'`
  - fedora | Fedora | 10 jams done | `jamCount >= 10`
  - headphones | Headphones | Buy premium headphones | `gear.premium_headphones`
  - Each accessory has an `id` field (`null` for none, otherwise equal to the key) used by the avatar renderer.
- `activeOutfitShirt(c)`: if `c.outfit !== 'default'` AND unlocked AND has a shirt colour, return it; else `c.color || '#D4A017'`. Used at 16602 (performance avatar) and the home avatar.
- UI at 14322 (outfits) / 14355 (accessories).
- Rebuild notes: pure. Romance candidate ids implied by this table: mira, sky, luca, pascal, jin, roo (six; confirm in the romance/mingle range). Outfit is a shirt colour tint only; accessory drawing is in the character renderer (other range) - Phaser needs layers for the 7 accessories.

## Festival arc: festivalEligible + FESTIVAL_PREP_DAYS (lines 687-696)
- `festivalEligible(c)` = ALL of: `festivalState` falsy; `defeated.length >= 3`; `openMicCount + (1 if storyFlags has the exact key 'firstShowcase') >= 5`; `stats.mus,tec,ori,sho` each `>= 8`; `day >= 25`. (The `+ Object.keys(...).filter(k=>k==='firstShowcase').length` is just "+1 if firstShowcase flag exists".) Comment says the thresholds are intentionally loose for testing and should be ratcheted up.
- Checked once per full sleep (13270): if eligible and `!storyFlags.festivalInviteSent` -> Rohzel text `"festival people called.\nthey want you.\nsit down. let's talk."`, `festivalInviteSent=true`, `festivalState='invited'`.
- `FESTIVAL_PREP_DAYS = 14`. After accepting at the bar (`festivalState='prepping'`, `festivalAcceptedDay=day`): countdown `daysLeft = max(0, 14 - (day - festivalAcceptedDay))`; training gains are doubled while `prepping` (12806); at 0 days the "GO TO BBBWC" button sets `festivalState='choosing'` and a path picker (A/B/C) resolves to `festivalState='done'`, `festivalPath`, `festivalResult`, `storyFlags.festivalWon` (15593-15613). Invite text in the panel says "Three weeks to prepare" but the constant and Rohzel's line say 14 days.
- Rebuild notes: pure; the state machine is `null -> invited -> prepping -> choosing -> done` (the `choosing` state is missing from the initialChar comment).

## FOXY_QUIPS, _pick (lines 698-710)
- Foxy = roommate (modal tagline "roommate · they/them"), soft-spoken plant person who makes too much soup. 8 ambient quips: "the plant's still alive. barely.", "i made too much soup again.", "the kettle's still warm if you want tea.", "i'm at work till seven. don't burn anything.", "the heating's making that noise again.", "matcha?", "you've been weird this week. you good?", "post comes around four. i'll grab yours."
- `_pick(arr)` = uniform random element. Used throughout for message/tip choice.

## Passive mood decay: _moodDrainFor, decayMood, passMinutes (lines 712-734)
- `_moodDrainFor(c, minutes)`: `perHour = 0.3`; `+0.5` if `hunger < 30`; `+0.5` if `energy < 30`; `+1.0` if `hunger === 0`; `+1.0` if `energy === 0`; returns `(minutes/60) * perHour`. (Header comment says "~1 mood per hour" - the code is 0.3/h baseline; worst case 3.3/h.)
  - Examples per 10-min tick: baseline 0.05; hungry (<30) 0.133; hungry+tired 0.217; both at 0: 0.55.
- `decayMood(c, minutes) = max(0, mood - drain)` (no upper clamp, fractional mood allowed).
- `passMinutes(c, n)` returns `{ minutes: minutes+n, mood: decayMood(c,n) }`; callers spread it into the char and then add their own mood gains, e.g. open mic: `passMinutes(c,60)` then `mood + 5`; crew battle 90 min; bar item 5 min; karaoke 30 min.
- The in-game activity tick (2186-2232) applies the same drain per tick plus `tickMoodDelta`.
- State: reads `hunger, energy, mood, minutes`. Rebuild: pure; keep mood as a float internally, display rounded.

## FOXY_TIPS + pickFoxyTip + pickFoxyTipsForModal (lines 736-911)
- What: context-aware tip engine for the Foxy character. 26 rules in an array; `pickFoxyTip(char)` returns a random line from the FIRST rule whose `when(char)` is true (try/catch per rule), else a random `FOXY_QUIPS` entry. `pickFoxyTipsForModal(char, n=3)` = `[pickFoxyTip]` + random extra quips from a shuffled copy of `FOXY_QUIPS` (shuffle is `sort(() => rand-0.5)`, biased) skipping duplicates.
- Used at: hub tip bubble (13445, recomputed when binned inputs change, key at 13423) and the Foxy modal (7020, stable while open). Also see the one-shot tutorials (`TUTORIALS`, other range) that use Foxy cutscenes.
- Rules in priority order (rule | line count | sample line):
  1. energy <= 5 | 3 | "stop. sleep. you can't beatbox like this."
  2. hunger <= 5 | 3 | "eat. now."
  3. mood <= 10 | 3 | "you've been quiet for two days. talk to me."
  4. energy < 25 | 3 | "you should take a nap. couch's right there."
  5. hunger < 25 | 3 | "you look hungry. there's leftovers in the fridge."
  6. mood < 30 | 3 | "go for a run or something. you've been weird all day."
  7. rentLate >= 2 | 3 | "look. i don't know your business. but pay the rent."
  8. rentLate === 1 | 3 | "did you pay rent? i swear i heard them knock."
  9. dow===5 (Saturday) and cash < 60 and apartmentTier===1 | 3 | "tomorrow's sunday. just saying." (hard-codes "$50 every sunday")
  10. cash < 5 and not foxyLoanTaken | 3 | "you're broke huh. tap me. i'll lend you something. once."
  11. cash < 5 and foxyLoanTaken | 3 | "i already lent you fifteen. busk. the park."
  12. no `firstJam` flag | 3 | "i heard there's jams in the park. that's where the beatboxers go right?"
  13. firstJam and not pigPenChallenged and jamCount < 3 | 4 | "still going to the jams? keep at it."
  14. pigPenChallenged and not pigPenBattled | 3 | "battle night is saturday at the bar. that's all i know."
  15. pigPenBattled and pigPenWins === 0 | 3 | "you'll get him next time. i don't know what that even means but yeah."
  16. pigPenWins === 1 and not pennyReveal | 3 | "you've been smiling more this week."
  17. showcaseBooking.day exists | 3 | "friday show. don't bomb. eat first."
  18. followers >= 30 and no booking and openMicCount >= 5 and not rohzelFridayOffer | 3 | "you should talk to rohzel. friday slots are a thing."
  19. openMicCount === 0 and firstJam | 3 | "if the cypher's the gym, the open mic's the test."
  20. openMicCount in 1..2 | 2 | "more open mics this week. it adds up."
  21. followers < 5 and firstJam | 3 | "you've got like four followers. busk. people will see you."
  22. dow===0 Monday | 3 | "the bar's closed mondays. don't bother."
  23. dow in 1..3 | 3 | "open mic tonight if you've got the energy."
  24. dow===4 Friday | 3 | "friday. weekend's basically here."
  25. dow===5 Saturday | 3 | "battle night. you ready?"
  26. dow===6 Sunday | 3 | "sunday. rent day. the long day."
- Rebuild notes: pure (rules are data + predicates; copy the line pools verbatim from 744-889). The ordering is the logic - keep the array order. In practice rules 12-21 (story arc) mask the day-of-week tips until the player has progressed past them; rules 22-26 only fire in mid/late game. Rule 9 says "$50" even though only tier 1 reaches it.

## STORAGE: slots, active slot, legacy migration (lines 929-1028)
- Constants: `NUM_SLOTS = 5`; keys `character:slot1`..`character:slot5`; `ACTIVE_SLOT_KEY = 'active_slot'`; `LEGACY_KEY = 'character:main'`.
- API is `window.storage` (async key/value: `get(key) -> {value}`, `set(key, string)`, `delete(key)`; Claude-artifact style persistent storage). All helpers swallow errors:
  - `getActiveSlot()` -> int 1..5 or null (parses string).
  - `setActiveSlot(n)` stores `String(n)`.
  - `loadSlot(n)` -> `JSON.parse(value)` or null on any error/missing.
  - `saveSlot(n, c)` -> `JSON.stringify(c)` (whole char, including transient fields).
  - `deleteSlot(n)`.
  - `loadAllSlots()` -> array of length 5 (sequential awaits) for the slot picker.
  - `migrateLegacy()`: if slot 1 is empty AND `character:main` exists and parses with `created === true`, copy it into slot 1 and set active slot 1; the legacy key is NOT deleted.
- App-level usage (outside range): on mount `migrateLegacy -> getActiveSlot -> loadSlot -> migrateChar` then always lands on the title screen (11269-11284); autosave of the active slot is throttled to one save per 2000 ms (`SAVE_THROTTLE_MS`) with a trailing save and a `beforeunload` flush (11286+); switching to an empty slot plays the intro cutscene then character creation (11340-11356); deleting the active slot returns to the slot picker (11359-11366).
- Rebuild notes: replace `window.storage` with `localStorage` (or IndexedDB) behind a small async interface; keep the same key names so existing saves import. Keep `migrate(char)` (defaults list under `initialChar`). The settings cache below is a separate store.

## USER SETTINGS (lines 964-998)
- Player-level prefs, NOT per-save. Key `beatbox_settings` in `localStorage` (sync, unlike slot storage). `DEFAULT_SETTINGS = { muted:false (kill all WebAudio), reducedMotion:false (skip cutscene fade + achievement modal pop), fastDialogue:false (cutscene lines auto-advance after 2000 ms; tap still advances) }`.
- Module-level cache `_settingsCache` (merged over defaults at load, try/catch). `getSettings()` sync read (used by audio at 17150 / 17846 and screen fades at 11673); `updateSettings(patch)` merges, writes to localStorage (try/catch), notifies listeners; `useSettings()` React hook returns `[settings, updateSettings]` and re-renders on change. Settings UI at 7247.
- Where each flag acts: `muted` -> music/sfx gating (17846 stops music, 17150 returns null); `reducedMotion` -> `cutFade`/`introKenBurns`/`screenFade` animations disabled (6724-6760, 8645, 11673), achievement modal (7297); `fastDialogue` -> 2 s auto-advance (6718-6723).
- Rebuild notes: pure data + tiny pub/sub. In Phaser: keep a `Settings` singleton with `get/update/subscribe`; Phaser's audio manager `mute` and tween skipping implement muted/reducedMotion; fastDialogue is a timer in the dialogue scene.

## TIME SYSTEM (lines 1030-1077)
- Constants: `TICK_MINUTES = 10` (in-game minutes per progress block), `TICK_REAL_MS = 500` (real ms per tick), `DAY_END = 1200` (02:00 forced sleep). So an activity advances 20 in-game minutes per real second (3 real seconds per in-game hour; 06:00-02:00 = 20 h = 60 s of continuous activity). The section header comment ("1 real sec = 10 in-game minutes. 6 real sec = 1 in-game hour") contradicts the constants; the constants win. Mini-games override via `cfg.tickMinutes` / `cfg.tickRealMs` (2194, 2243).
- `clockString(mins)`: `total = (mins+360) % 1440`; `HH:MM` zero-padded 24 h (mins 0 -> "06:00", 720 -> "18:00", 1080 -> "00:00", 1200 -> "02:00").
- `timeOfDay(mins)`: `< 60` 'dawn' (6-7 AM); `< 720` 'day' (7 AM-6 PM); `< 780` 'dusk' (6-7 PM); else 'night' (7 PM-2 AM). `isDayTime(m) = m < 720`; `isNightTime(m) = m >= 720`. Palettes per tod live in `TIME_PALETTES` (2111-2116: dawn bg #1c1815 accent #f59e0b; day #1a1a1f/#fbbf24; dusk #1c1418/#f97316; night #0c0a18/#818cf8).
- `DAY_NAMES` = MONDAY..SUNDAY; `DAY_NAMES_SHORT` = MON..SUN; `dayOfWeek(day) = (day||1) % 7`.
- `daysToNextTuesday(fromDay)`: dow 1 returns 7, else `((1 - dow) + 7) % 7`. `replantAvailableDay(c)`: 0 if `!plantDead`, else `(plantDeathDay || day || 0) + daysToNextTuesday(plantDeathDay)` (first Tuesday strictly after the death day).
- Activity tick rules from the hook (2186-2232, outside range but part of the time system): each tick adds `tickMins`, subtracts `tickEnergyCost`/`tickHungerCost`, applies mood = `clamp(mood + tickMoodDelta - passiveDrain)`; stop reasons in priority: `newEnergy < tickEnergyCost` -> "You collapsed from exhaustion"; `hunger<=0 && hungerCost>0` -> "Too hungry to keep going"; `newMins >= DAY_END` -> "It got too late - heading home"; custom `stopWhen`. The 2 AM watcher (11418-11459) force-collapses the player when `minutes >= 1200`.
- Rebuild notes: pure functions, lift verbatim. In Phaser run the tick from a scene timer/`time.addEvent`; honor the global pause while a cutscene plays (`_gamePaused`, 2187). `day` is an ever-increasing integer, no calendar.

## RENT, COUCH-SURF, APARTMENT UPGRADES (lines 1079-1097) + computeRentEvent (lines 1211-1230)
- `RENT_BY_TIER = [50, 100, 200]` weekly rent for tier 1/2/3; `COUCHSURF_DAYS = 3`.
- `computeRentEvent(c, newDay)` (pure): returns null unless `newDay % 7 === 6` (Sunday) and `c.lastRentPaidDay !== newDay`. `amount = RENT_BY_TIER[tier-1] || 50`. If `cash >= amount` -> `{type:'paid', amount, firstTime: !storyFlags.firstRentPaid}`. Else `next = rentLate + 1`: `>= 3` -> `{type:'evicted', amount, weeks}`; `=== 2` -> `{type:'warning', amount}`; else `{type:'missed', amount}`. No partial payments.
- Effects (applied in `finishSleep`, 13192-13212, with `newDayBase = day+1` passed to the function): paid -> cash -= amount, `rentLate=0`, `lastRentPaidDay=newDayBase`, flag `firstRentPaid`, toast `"Rent paid · -$X"`, first time a cutscene ("Sunday. Rent's paid." / "-$X. The apartment's still yours." / "Another week to make it work."). missed -> `rentLate=1`, mood -10, toast "Rent late · week 1. Mood -10", cutscene ("You didn't make rent this week." / "The notice is taped to your door." / "You've got till next Sunday."). warning -> `rentLate=2`, mood -15, toast "Rent late · final warning. Mood -15", cutscene ("Final warning, in red ink." / "Pay by Sunday or you're out." / "Your phone hasn't stopped buzzing."). evicted -> day advances `1 + COUCHSURF_DAYS` (4 days), energy = `floor(maxEnergy*0.5)`, hunger -20 more (after the usual -30), mood -30, `rentLate=0`, flag `evictedOnce`; random events, bad-sleep, flashbacks and dreams are suppressed; a 3-beat cutscene ("Boards on the door." ... "A new key. A fresh start." / "Rent counter back to zero." / "Don't miss it again."). Apartment tier is NOT reset on eviction, nor is cash taken.
- 2 AM collapse path (11425-11441) calls `computeRentEvent` too: paid/missed/warning are applied (no mood penalties, no cutscenes), and `evicted` is downgraded to `rentLate=2` without eviction.
- `APT_UPGRADES` (purchasable tiers; consumer `moveToApt`, 13015-13050):
  - tier 2 "Real apartment": cost $1500, dayReq 14, fansReq 30, "A bedroom. A kitchen. A door that locks. +5 mood every morning. Bad-sleep events less common."
  - tier 3 "Loft with home studio": cost $5000, dayReq 30, fansReq 200, "Skyline view. Mixing desk. +10 mood every morning. +1 mus every full sleep. +25% home recording reward."
  - Purchase requires cash, day and followers; sets `apartmentTier`, `apartmentMovedInDay=day`, mood +15 (cap 100), cash -= cost, cutscene (flag `apt<tier>MovedIn`). The UI lists both tiers above the current one so tier 3 can be bought from tier 1.
  - Implemented effects: morning mood +5 (tier 2) / +10 and +1 `stats.mus` (tier 3) at 13173-13176; livestream viewer multiplier 1.0/1.2/1.4 (12491). **Not implemented anywhere**: "bad-sleep events less common" (bad-sleep roll is a flat 10%) and "+25% home recording reward" (no other `apartmentTier` reads exist).
- Rebuild notes: pure data + one pure function. Keep the Sunday rule `newDay % 7 === 6` and the guard on `lastRentPaidDay`.

## FLASHBACKS + DREAM (lines 1099-1148, 1174-1194)
- What: 4 one-time memory cutscenes shown after waking. Schema `{ id, when(c), speaker:null, drawFn (string name), lines[4] }`. Seen state in `char.flashbacksSeen[id] = dayShown`.
  - childhood: when `firstJam` flag and `day >= 5`; draw `drawFlashbackChildhoodScene`; lines: "Before bed, a memory you hadn't pulled up in years." / "Twelve years old. Your bedroom mirror. A little phone propped on a stack of books." / "Three minutes of beats nobody would ever see. You said the bass kicks were 'sick'." / "It's still the same circuit. Just with better gear."
  - parent_voice: when `rentLate >= 1` or `day >= 12`; `drawFlashbackParentScene`; "1 AM in the kitchen. The phone glows on the counter." / "An old voicemail you saved and kept saving." / `"call when you get this. don't worry about waking us. we love you."` / "You haven't called this week."
  - yt_comment: when `followers >= 100`; `drawFlashbackCommentScene`; "Down a YouTube rabbit hole. Your old channel." / "A comment from 2017 you forgot you wrote." / `"one day i'll do this on a real stage. saving this for when i'm 30."` / "Not 30 yet. But not nothing, either."
  - the_song: when `firstShowcase` flag or `day >= 20`; `drawFlashbackSongScene`; "Last bus home. Window cold against your forehead." / "Earbuds in. The track that started everything plays again." / "Bus driver glances back. You realize you've been beatboxing under your breath." / "You're not the same person who first heard this."
- `pickFlashback(c)`: first entry in table order not in `flashbacksSeen` whose `when` is true (try/catch), else null. `_flashbackDrawFn(name)` maps the string to the canvas function (also knows `drawDreamScene`).
- Trigger (13307-13322, 13324-13338): per full sleep, not when evicted: 25% roll, `pickFlashback({...c0, day:newDay})`; on hit set `flashbacksSeen[id]=newDay` and play a cutscene 320 ms after waking with `drawScene` = the draw function (called `(ctx, frameCount, lookFromChar(c0))`). Separately a **dream** (not in the table): when `newDay >= 30`, 5% roll, 400 ms delay, `drawDreamScene`, lines: "You're on a stage that goes forever in every direction." / "Faces in the crowd you don't recognize. They know your name." / "The mic in your hand is too heavy. Then weightless." / "You wake before the round ends."
- Rebuild notes: lines + conditions are pure data. The 5 canvas draw functions (8412, 8445, 8468, 8494, 8701) are procedural pixel-art scenes needing Phaser equivalents (a scene with a 'look' = character appearance) - owned by another range. The flashback only displays when the 25% roll hits; `flashbacksSeen` is recorded as soon as it is picked even if the cutscene is skipped.

## CONTENT GATING (lines 1196-1209)
- `CONTENT_UNLOCKS = { bar:{day:3, label:"You're not ready for the cypher yet. Take a few days."}, shop:{day:4, label:'Shops open day 4. Save your cash.'}, mingle:{day:5, label:'You barely know the regulars yet. Day 5.'}, store_music:{day:4,label:'Day 4'}, store_furniture:{day:5,label:'Day 5'}, store_clothing:{day:7,label:'Day 7'}, store_pet:{day:10,label:'Day 10'} }`.
- `isUnlocked(c, key) = (c.day||0) >= (CONTENT_UNLOCKS[key]?.day || 0)` (unknown key = unlocked).
- Used at 11891-11914 (hub locations; bar lock reason also says 'Opens at 6 PM' once past the day gate), 14656-14668 (sub-store tabs, text `unlocks day N`), 16162-16178 (mingle button).
- Rebuild: pure.

## BAR_SCHEDULE (lines 1232-1241)
- Indexed by `dayOfWeek`: 0 Mon `{closed, 'CLOSED', 'Bar is dark — the doors stay shut on Mondays.'}`; 1/2/3 Tue-Thu `{openmic, 'OPEN MIC NIGHT', 'Take the mic. Free slot — build heat + maybe fans.'}`; 4 Fri `{showcase, 'PAID SHOWCASE', "Headline if you're good enough — better pay."}`; 5 Sat `{battle, 'BATTLE NIGHT', 'The cypher fires up. Pick a challenger.'}`; 6 Sun `{karaoke, 'KARAOKE NIGHT', 'Sing along. Sharpen your musicality.'}`.
- Consumers: bar screen (15653-15655), hub label `"Tonight: <title>"` (11910). The bar opens at 6 PM (`minutes >= 720`, 15645 closed screen: "Doors open at 6 PM. Come back tonight.").
- Activity mechanics that go with each night (other range, for parity): open mic (needs 10 energy, 60 min, -10 energy, +5 mood, `fanGain = clamp(floor(max(0,total-20)/25) + floor(sho/8) + rand(0..2), 1, 20)`, xp +8, heat +2, `openMicCount++`, daily `openMics++`); karaoke 8 energy / 30 min / earn `4 + rand(0..4)`; battle 30 energy; showcase booked via Rohzel.

## BAR_MENU (lines 1243-1251)
- Items `{ name, kind, cost, immediate{...}, debuff{...} }` where `debuff` is added to `pendingDebuff` and applied at the next full sleep (stacked per item, 15674-15679):
  - spicy_wings | Spicy Wings | snack | $8 | immediate mood +12, hunger +18 | debuff hunger -10
  - energy_drink | Energy Drink | drink | $6 | energy +45, mood +4 | debuff energy -25
  - cocktail | Tropical Cocktail | drink | $12 | mood +30, energy +12 | debuff mood -18, energy -8
  - whiskey | Whiskey Shot | drink | $10 | mood +22, energy +8 | debuff mood -22
  - loaded_fries | Loaded Fries | snack | $9 | hunger +28, mood +6, energy +6 | debuff hunger -12
- Order handling (15658-15683): cost deducted; `passMinutes(c,5)`; energy clamped to `0..maxEnergy`, hunger clamped 0..100, mood = clamp(t.mood + immediate.mood); `pendingDebuff` energy/mood/hunger summed; toast `"Drank <name>"` (drink) or `"Ate <name>"`.
- Debuff resolution at sleep (13213-13218): `energy = clamp(energy + d.energy, 0..max)`, hunger/mood via `_clampPct`; then `pendingDebuff=null`. Strongly interacts with the `caffeine` bad-sleep reason (`pendingDebuff.energy <= -10`). The 2 AM collapse sets `pendingDebuff:null` (drinking until collapse dodges the hangover).
- Rebuild: pure data.

## Next section boundary (lines 1253-1260)
- Header comment for MINGLE (bar conversations): one conversation = 30 game minutes + ~6 energy; each encounter has opener + 2-3 replies with small effects (mood/cash/followers/flags/affinity). Defined by `_enc(id, cfg) = { id, weight:1, when:()=>true, ...cfg }` (1262) and `MINGLE_GENERIC` (1266+), covered by the next inventory range.

---

## Appendix A - random event copy, verbatim (lines 355-469)

Each event: title, colour, then the `lines` array (one cutscene beat, lines shown in order).

- bird_poop #a8a29e - "A SEAGULL JUST BLESSED YOU": "Right on the jacket. New jacket too."
- street_compliment #fbbf24 - "STREET COMPLIMENT": "A stranger heard you in the park." / "that's actually sick. keep it up." (in quotes)
- lost_tenner #22c55e - "TEN BUCKS ON THE GROUND": "Wadded up next to the bus stop." / "Nobody else around. Yours now."
- song_on_radio #fb7185 - "THE SONG": "A track came on. The one that made you start." / "You're standing in the kitchen at 1 AM." / "You're not the same person who first heard this."
- old_yt_comment #fb7185 - "A NOTIFICATION FROM 2017": "YouTube reminded you of a comment." / "'one day i'll do this on a real stage.'" / "You'd forgotten you wrote it."
- birthday_gig #fbbf24 - "BIRTHDAY GIG": "Someone DM'd you: birthday party tonight, $30 cash." / "Twenty minutes. Done. Easy money."
- journalist_dm #22d3ee - "A JOURNALIST WROTE": "Local mag wants 200 words about the scene." / "You answered. Thoughtfully."
- crystix_viral #22d3ee - "CRYSTIX TAGGED YOU": "Their clip blew up. Your face is in the duet panel." / "Notifications won't stop."
- bike_stolen #dc2626 - "YOUR BIKE IS GONE": "You locked it. They cut the lock." / "Walking everywhere now."
- phone_died #a8a29e - "PHONE FROZE AT 3%": "Then died completely. You missed every text."
- algorithm_dud #5a5046 - "POST FLOPPED": "12 likes in 6 hours. The algorithm forgot you."
- free_coffee #fbbf24 - "FREE COFFEE": `Barista recognized you. "this one's on the house."` / "You almost cried."
- og_invite #D4A017 - "AN OLDER VOICE LEFT A VOICEMEMO": `"come by the studio next week. bring patterns."` / "You don't recognize the number."
- rent_help #84cc16 - "PARENTS WIRED MONEY": "$40 in your account. No note." / "You'll call your mum later. Maybe."
- good_dream #a78bfa - "A GOOD DREAM": "You woke up smiling for once." / "Couldn't tell anyone what it was about."
- sick_day #84cc16 - "YOU'RE SICK": "Sore throat. Headache. The kind of tired sleep can't fix." / "No drills today. No mic. No bar." / "Soup, water, bed. The rest will wait."
- parking_ticket #dc2626 - "PARKING TICKET": "$40 stuck under the wiper." / `"Expired permit." You forgot.`
- dentist #dc2626 - "DENTIST EMERGENCY": "Molar split on a piece of granola." / "$80 to numb it. $200 you don't have for the crown." / "You'll deal with it later."
- broken_phone #5a5046 - "CRACKED SCREEN": "Drop. Spider web. The repair guy charges $60." / "It still works. Mostly."
- food_poisoning #84cc16 - "BAD TAKEOUT": "Bathroom floor for two hours. The bin nearby just in case." / "Whatever was in that container, it's not in you anymore."
- tax_letter #a8a29e - "A LETTER FROM THE COUNCIL": `"Outstanding balance: $120."` / "You don't fully understand it. But you owe it." / "Pay this month or it triples."
- bombed_set #dc2626 - "YOU BOMBED LAST NIGHT": "Wrong key. Wrong rhythm. The crowd just stared." / "A clip's already up. Twelve angry comments." / "Tomorrow's another day. Probably."
- rivalry_clip #fb7185 - "SOMEONE DISSED YOU ONLINE": "A reply video. Your name. Your face. Forty thousand views and climbing." / "The comments are split. Some defend you." / "It feels like a fight you didn't pick."
- rent_increase_letter #dc2626 - "NOTICE FROM THE LANDLORD": "Rent goes up $10/week starting next month." / `"Market conditions." That's all the letter says.`
- Note: several lines state exact dollar amounts that match the effects (parking -$40, dentist -$80, broken phone -$60, tax -$120, rent_help +$40, gig +$30, tenner +$10) - keep copy and numbers in sync if rebalancing.

## Appendix B - Foxy tip line pools, verbatim (lines 746-888)

Rule numbers match the priority table in the FOXY_TIPS section (all text lowercase, as in the source).

1. energy<=5: "stop. sleep. you can't beatbox like this." / "go to bed. seriously." / "you're zombie-walking. couch. now."
2. hunger<=5: "eat. now." / "i made too much soup. it's in the fridge. eat it." / "the fridge is right there. you are not running on vibes."
3. mood<=10: "you've been quiet for two days. talk to me." / "go for a run. i'm not joking." / "we don't have to talk. just don't sit there."
4. energy<25: "you should take a nap. couch's right there." / "you look like shit. lie down." / "power nap. then we'll talk."
5. hunger<25: "you look hungry. there's leftovers in the fridge." / "the kitchen is fifteen feet from you. use it." / "soup's in the pot. don't wait for me."
6. mood<30: "go for a run or something. you've been weird all day." / "the park is free. fresh air, free." / "stream a movie. anything. unclench."
7. rentLate>=2: "look. i don't know your business. but pay the rent." / "the landlord came by. twice." / "if you get evicted i'm not telling your mum."
8. rentLate===1: "did you pay rent? i swear i heard them knock." / "the rent thing. you're handling it, right?" / "i'm not bringing it up. i'm just saying."
9. Saturday + cash<60 + tier 1: "tomorrow's sunday. just saying." / "rent's $50 every sunday. you got that?" / "you're cutting it close again."
10. cash<5, no loan yet: "you're broke huh. tap me. i'll lend you something. once." / "i can spot you fifteen bucks. tap. just this once." / "you got cash for groceries? tap me. i'll figure it out."
11. cash<5, loan taken: "i already lent you fifteen. busk. the park." / "no more loans. busk. you're good at it." / "you're broke again. that's fine. eat the soup."
12. no firstJam: "i heard there's jams in the park. that's where the beatboxers go right?" / "if you're going to do this beatbox thing, go where they are. park has a cypher." / "you're not gonna make it sitting in the apartment. there's people in the park."
13. firstJam, no pigPenChallenged, jamCount<3: "still going to the jams? keep at it." / "the cypher again? good. go." / "more practice in the circle. less in the bedroom." / "the park people are your people now i guess."
14. pigPenChallenged, not battled: "some loud guy was asking about you. saturday at the bar?" / "i don't know who 'pig pen' is. doesn't sound like a friend." / "battle night is saturday at the bar. that's all i know."
15. pigPenBattled, 0 wins: "the loud guy still talks shit. ignore him. or beat him. either way." / "battles once a week. train, go again." / "you'll get him next time. i don't know what that even means but yeah."
16. pigPenWins===1, no pennyReveal: "you've been smiling more this week." / "whatever you're doing on saturdays. keep doing it." / "the loud guy hasn't come around as much."
17. showcase booked: "you got a show friday? i'll come. probably." / "friday show. don't bomb. eat first." / "i'll be in the back. don't look for me."
18. rohzel nudge: "the bartender's been asking about you. go see him." / "you should talk to rohzel. friday slots are a thing." / "the bar guy. he doesn't say much. say less back."
19. openMicCount===0 + firstJam: "the bar has open mics tue/wed/thu. small crowd, free slot." / "open mic at the bar. easy way to get reps." / "if the cypher's the gym, the open mic's the test."
20. openMicCount 1-2: "more open mics this week. it adds up." / "the bar still doing open mic? go."
21. followers<5 + firstJam: "you've got like four followers. busk. people will see you." / "no one knows you exist yet. park, jar on the ground, go." / "the algorithm doesn't care if you're shy."
22. Monday: "the bar's closed mondays. don't bother." / "monday. quiet. go train. go run." / "mondays are for laundry. fyi."
23. Tue-Thu: "open mic tonight if you've got the energy." / "the bar's open. open mic night." / "small crowd at the bar tonight. less to bomb in front of."
24. Friday: "friday. weekend's basically here." / "friday's a show night if you've got the slot." / "people get loose on fridays. go play."
25. Saturday: "battle night. you ready?" / "saturday. the bar gets loud tonight." / "saturdays are for war. so they tell me."
26. Sunday: "sunday. rent day. the long day." / "i'm doing groceries. need anything?" / "sundays are slow. take the slow."

Behavioural notes that follow from the pools: rule 10/11 point at the Foxy modal's "ask Foxy for $15" button (one-time; sets `foxyLoanTaken`, +$15, +3 mood, sends Foxy a text); rule 12-16 form the early story nudge chain (jam -> Pig Pen challenge -> Saturday battle -> Penny reveal); rule 18 matches the `rohzelFridayOffer` flag set when Rohzel offers the Friday slot. The modal's wave button (once per day, +2 mood, bumps `daily.foxyHi`) is at 7021-7032.

## Cross-reference map (where consumers live)

| Unit | Consumed at (lines) |
|---|---|
| `applySoundUnlocks`, `applyAchievements` | `checkLevelUp` 11385-11410 |
| `computeRentEvent`, `RENT_BY_TIER`, `COUCHSURF_DAYS` | `finishSleep` 13129-13212 and 13340-13400; collapse watcher 11418-11459 |
| `pickRandomEvent`, `applyRandomEvent`, `BAD_SLEEP_REASONS` | `finishSleep` 13135-13226 |
| `pickDailyChallenge`, `pickWeeklyChallenge` | `finishSleep` 13228-13248; UI 13482-13650 |
| `bumpDaily` | 14806 (busk), 14836 (jam), 14924 (run) |
| `pickFlashback`, `_flashbackDrawFn` | `finishSleep` 13307-13338 |
| `PARENT_MESSAGES`, `UNKNOWN_*` | `finishSleep` 13249-13267; `finishOpenMic` 15720-15732 |
| `CREW_NPCS` | recruit panel 12246-12330; morning yield 13112-13128 |
| `resolveCrewBattle`, `CREWS` | bar battle panel 16290-16322, `doCrewBattle` 15768-15812 |
| `FOXY_TIPS` | hub 13445, `FoxyModal` 7016+ |
| `BAR_SCHEDULE`, `BAR_MENU` | bar screen 15653+, 16384+ |
| `CONTENT_UNLOCKS` | hub 11891-11914, shop 14656, mingle 16162 |
| `OUTFITS`, `ACCESSORIES` | wardrobe UI 14322-14360, performance avatar 16602 |
| `festivalEligible`, `FESTIVAL_PREP_DAYS` | `finishSleep` 13270; bar festival panels 15982-16072; training x2 12806 |
| storage fns | App mount 11269+, slot picker 11340-11366 |

---

## OPEN QUESTIONS / GOTCHAS

1. **Weekly challenges broken (3 of 6):** only `busks`, `jams`, `runs` go through `bumpDaily` (daily + weekly). `mingles`, `openMics`, `showcases`, `battleWins`, `foxyHi` write only `char.daily`. So `wk_battles_3`, `wk_openmic_5`, `wk_mingles_8` can never reach their targets. Decide: fix in the rebuild (single `bumpCounter` that writes both) - recommended - or keep for parity.
2. **Header comment vs constants on time:** comment says 1 real sec = 10 min; constants give 20 min/real sec (10 min per 500 ms tick). Verify against the live feel before locking the Phaser timer. Mini-games change `tickMinutes`/`tickRealMs`.
3. **`new_bed` is a no-op:** `finishSleep` computes `energy = Math.min(max, max + bedBonus)` (13162), which always equals `max`. The shop copy promises "+20 max-energy boost". Decide whether to implement (e.g., wake at max+20 once) or keep the no-op.
4. **Advertised but unimplemented:** apartment tier 2 "Bad-sleep events less common" (roll is a flat 10%); tier 3 "+25% home recording reward"; `rent_increase_letter` event (`rentBump` flag never read, rent stays 50/100/200; also says "Pay this month or it triples" for tax_letter - nothing triples).
5. **2 AM collapse path skips the morning pipeline:** no random event, bad sleep, daily/weekly reset and new challenge (daily counters persist through a collapse day), no crew/song yield, no plant/apartment/cat/camera bonuses, no parent/unknown/festival messages, no flashback/dream; sets energy = floor(max*0.6), hunger -25, mood -12, `pendingDebuff=null`. Eviction downgrades to `rentLate=2` and the next Sunday check is a week away. Confirm whether the rebuild should unify the two paths.
6. **Dead / unused code:** `dailyChallengeMet` (never called; UI recomputes inline at 13506), `_lastGlobalKey` / `_lastGlobalKeyAt` (never read), `SENDER_META` entries pigpen/penny/crystix/beeamgee (no `addMessage` call uses them), the `rentBump` special / `rentBumped` field, `evictionRecoveryDay` (no reader in my range), `heat` (accumulates at 12504/15713/15782/15942, never read in my range), flags `crewVpn` / `crewChamps` (set on crew wins, no reader in my range), `pickDailyChallenge`'s unused `c` parameter, `e.flags` support in `applyRandomEvent` (no event uses it). The `NPCS[].level` field and `JUDGES` are consumed in other ranges - check before dropping.
7. **Festival copy mismatch:** invite panel says "Three weeks to prepare" (15987); `FESTIVAL_PREP_DAYS = 14` and Rohzel says fourteen days. `festivalState` also takes the value `'choosing'` (not in the field comment). Eligibility is deliberately loose (comment: "ratchet up after balancing"): `day >= 25`, stats >= 8 each, >= 3 defeated, >= 5 open-mic-equivalents.
8. **romanceState values:** field comment says `'none'|'romancing'|'couple'`, but affinity code (line ~2012) uses `'building'` (<5), `'romancing'` (>=5), `'couple'` (>=10). Achievements/outfits only test `'couple'`.
9. **Transient state leaks into saves:** `char._opponent` is set at 16281; older builds leaked `_morningSongFans`/`_morningCrewYield` (stripped at 13238-13239). The slot JSON is the whole `char`; port should whitelist fields or strip `_`-prefixed keys.
10. **RNG:** all randomness is `Math.random()` (events, tips, challenges, crew battle, bad sleep, message ids). Consider a seedable RNG for tests; note `pickFoxyTipsForModal`'s shuffle (`sort(() => rand - 0.5)`) is biased (harmless).
11. **Edge cases worth unit tests:** `dayOfWeek(0)=1` (day falsy -> 1); `clockString` for `mins >= 1080` wraps past midnight ("00:00"+); `moodMod` uses `(mood||50)` so mood 0 counts as 50 in crew battles; ties go to the player in crew rounds; `applyRandomEvent` stats have no cap and cash/followers floor at 0 (a -$120 event with $30 only zeroes cash); `sick_day`'s `sickDay !== day` guard is effectively always true because it is evaluated with the new day; `pickFlashback` marks as seen when picked even if skipped; `defeated` stores names (spelling matters); `hasGear` count for `completist_gear` (14) must match the gear catalog size.
12. **Storage API assumption:** `window.storage` is a Claude-artifact-style async KV (strings). A standalone Phaser build has no such API - decide localStorage vs IndexedDB and a save-version number (none exists today; `migrateChar` is the only compat mechanism and runs only at load).
13. **Rent timing nuance:** rent is evaluated on the *wake-up into* a Sunday (`newDay%7===6`), so day 6 is the first rent day (the player may only have ~$30 + earnings by then; `Foxy` tip #9 targets Saturday). A player who sleeps normally on Saturday night pays at wake-up inside `finishSleep`; a player who stays up past 2 AM Saturday collapses into Sunday and is charged by the 2 AM watcher instead (no cutscene, no mood penalty).
14. **Message arrays and `flashbacksSeen`/`achievements` grow monotonically** but are small; `messages` is the only unbounded one (consider a 100-message cap in the rebuild).
