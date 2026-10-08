# Beatbox Story — Inventory 02: Mingle encounters, Gear shop, Clock/palettes, Activity engine

Source: `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx`, lines 1253-2260 (line numbers below are for that file). All code in this range is plain JS data + pure functions, EXCEPT `Clock` (React/DOM) and `useActivity` (React hook + setInterval). Notation: `m+6` = mood +6, `f+2` = followers +2, `aff luca+1` = romanceAffinity.luca +1, `{}` = no effects.

## SUMMARY
1. Range = (a) the bar "MINGLE" encounter registry (39 encounters in `MINGLE_POOL`: 10 generic, 4 Pig Pen, 2 Crystix, 10 sponsor, 6 romance, 6 ask-out, 1 bad), (b) `pickMingleEncounter` weighted picker, (c) `applyMingleEffects` effect applier, (d) GEAR_CATALOG (14 items, 4 stores) + STORE_META, (e) TIME_PALETTES + `Clock`, (f) `useActivity` tick engine + global pause flag.
2. One mingle = pick one eligible encounter by weight; the modal picks ONE RANDOM beat from the encounter's `beats[]` (romance candidates have 4 beats, so "stages" are NOT sequential: they are random draws, repeatable and farmable). Choosing a reply costs +30 game min, -6 energy; leaving before choosing is free.
3. Romance is a single number per candidate (`romanceAffinity[id]`, min 0, no max) and a derived state: `<5 building`, `>=5 romancing` (ask-out encounter becomes eligible), `>=10 couple`. Right answer +1 (a few +2), neutral 0, wrong -1. Ask-out "yes" = +2 and books a park date at day+2, minute 600 (16:00); the date itself (outside range, line 14724) gives +3 and +18 mood.
4. Sponsors: 5 brands, thresholds 50/100/200/500/1000 followers; pre-stage (w2, below threshold) then pitch (w4, at/above); accept = +$50, +10 followers, +8 mood, flags `sponsor_<id>_done` + `_signed`; decline sets only `_done`. Pitch promises (recurring pay, gear, quarterly kit) are NOT implemented.
5. Gear = one-time purchases stored in `char.gear[id] = true`; 14 items totalling $3960. Real effects live in other ranges (training, sleep, runs, open mic/showcase/battle). Several effects are broken/no-ops (new_bed, rounding of PC/mic bonus, mic "PitchTuner" claim) — see GOTCHAS.
6. Stores unlock by day (music 4, furniture 5, clothing 7, pet 10) via `CONTENT_UNLOCKS` (line 1199, outside range).
7. `useActivity`: setInterval tick (500 ms real = 10 game min AFK; 2500 ms = 3 game min in "playMode"); every 5 ticks fires `onReward()`; stops on exhaustion, hunger 0, DAY_END (1200 = 02:00), custom `stopWhen`, or if `char.day` changes. A module-level `_gamePaused` flag (set while a cutscene plays) freezes ticks.
8. Time palettes: 4 keys (dawn/day/dusk/night) -> bg/accent/glow; `Clock` shows ☀️ for dawn/day, 🌙 for dusk/night plus `HH:MM` from `clockString`.
9. Nearly everything here can be lifted verbatim into framework-free TS (encounters are data + `when(c)` predicates). Only `Clock` and the hook's setInterval/useRef plumbing need Phaser equivalents (text object + `time.addEvent`).
10. Dead/unused data to be aware of: flags `jinCollab`, `<id>_dateScheduled`; `metEncounters`, `mingleCount`; effect keys `energy`/`hunger` (supported by applier, used by no encounter).

---

## External dependencies referenced by this range (defined elsewhere — port these first)
- `_clampPct(v)` (line 2287): `v<0?0 : v>100?100 : v`. Used by `applyMingleEffects` and `useActivity`.
- `_moodDrainFor(c, minutes)` (716): `perHour = 0.3; +0.5 if hunger<30; +0.5 if energy<30; +1.0 if hunger===0; +1.0 if energy===0; return minutes/60*perHour`. `decayMood(c,min)=max(0, mood - drain)`; `passMinutes(c,n)={minutes:(c.minutes||0)+n, mood:decayMood(c,n)}` (731).
- Time system (1030-1056): `TICK_MINUTES=10`, `TICK_REAL_MS=500`, `DAY_END=1200` (minutes since 06:00; 1200 = 02:00 forced sleep). `clockString(mins)`: `total=(mins+360)%1440; "HH:MM"` zero-padded. `timeOfDay(mins)`: `<60 'dawn'`, `<720 'day'`, `<780 'dusk'`, else `'night'`. `isDayTime = mins<720`, `isNightTime = mins>=720`. `dayOfWeek(day) = (day||1)%7` (0=Mon..6=Sun; **day 1 = Tuesday**). `DAY_NAMES_SHORT = MON..SUN`.
- `CONTENT_UNLOCKS` (1199): `bar day3, shop day4, mingle day5, store_music day4, store_furniture day5, store_clothing day7, store_pet day10`. `isUnlocked(c,key) = (c.day||0) >= CONTENT_UNLOCKS[key].day`.
- `hasGear(c,id) = !!c?.gear?.[id]` (70); `plantAlive(c)` (72); `replantAvailableDay(c)` (1073).
- Char defaults relevant here (lines 170-225): `day:1, minutes:0, gear:{}, lastCoffeeDay:0, lastPlantWaterDay:0, lastYogaDay:0, mingleCount:0, romanceAffinity:{}, romanceState:{}, dateBooking:null, metEncounters:{}, daily:{}, storyFlags:{}, openMicCount:0, defeated:[], followers`, `maxEnergy` (default 100 via `?? 100`; soft cap 150 grows from running at line 14776).
- `showToast(msg, kind)`, kinds seen: `'win'`, `'bad'`, `'info'`.
- Screen/component homes of the glue code: `BarScreen` (15585), `MingleEncounter` modal (7438), `ParkScreen` (14692; dates + park activities), `HouseScreen` (12675; training, coffee, yoga, plant, TV), `ShopScreen` (14474), root App (11532 palette, 11155 pause hook, 11568 Clock).

## CHAR FIELDS TOUCHED BY THIS RANGE (parity checklist for the save/state schema)
| field | type / default | read by | written by |
|---|---|---|---|
| `mood` `energy` `hunger` | number 0-100 (`energy` max = `maxEnergy ?? 100`) | applier, activity tick | applier, `finish()`, activity tick |
| `maxEnergy` | number, default 100 via `??`, soft cap 150 | applier clamp | run mini-game (outside) |
| `cash`, `followers` | number | applier, sponsors/romance/shy_fan gates | applier (floor 0) |
| `minutes` | number minutes since 06:00 (0..1200) | activity tick, `Clock`, palette | `finish()` +30, activity tick |
| `day` | int, 1 = Tuesday | ask-out booking, store unlocks, activity day-watch | sleep rollover (outside) |
| `storyFlags` | object of booleans/counters | all `when` gates (`pigPenChallenged/Battled/Wins/pennyReveal`, `crystixMet`, `sponsor_<id>_done/_signed`) | applier `flags` merge |
| `romanceAffinity` | `{id:number}`, `{}` | ask-out gate | applier (>=0), date/stand-up code |
| `romanceState` | `{id:'building'\|'romancing'\|'couple'}`, `{}` | ask-out gate, outfits/accessory/achievements | applier, date code |
| `dateBooking` | `{partner,partnerName,partnerColor,day,minute}\|null` | ask-out gate (must be null), park date UI | applier (`bookDate`), date code |
| `mingleCount` | int | (nobody) | `finish()` |
| `metEncounters` | `{encounterId:int}` | (nobody) | `finish()` |
| `daily.mingles` | int (reset each sleep) | daily-challenge system (outside) | `finish()` (direct, not `bumpDaily`) |
| `openMicCount` | int | gates: `open_mic_friend`, jin | open mic (outside) |
| `defeated` | string[] of opponent names | crystix gate | battle (outside) |
| `gear` | `{itemId:true}`, `{}` | `hasGear` everywhere | ShopScreen buy |
| `lastCoffeeDay` / `lastYogaDay` | int day, 0 | coffee/yoga once-per-day | those actions |
| `lastPlantWaterDay`, `plantDead`, `plantDeathDay`, `plantWaterCount`, `plantWaterCountDay` | int / bool / int / int / int | `plantAlive`, shop, watering UI | buy/water |
| `sickDay` | int (0) | `useActivity.start` | sickness event (outside) |
| `oriSlots` | array of patterns (4, or 8 with MPC) | sequencer | mpc purchase pads to 8 |

---

## Mingle — high-level flow (glue code OUTSIDE the range, needed for parity)
- **Gating** (BarScreen, ~15634 & 16161): bar locked in daytime (`!isNightTime`, doors open from 18:00 = minutes 720). `BAR_SCHEDULE[dayOfWeek(day)]` (1233): Monday = closed (Mingle panel hidden when `activity==='closed'`), Tue-Thu open mic, Fri showcase, Sat battle, Sun karaoke. Mingle panel needs `isUnlocked(char,'mingle')` (day>=5) else shows lock label "You barely know the regulars yet. Day 5."
- **Button**: `MINGLE 🍻 (-6⚡, +30 min)`, disabled and "Need 6 energy" if `char.energy < 6`. `startMingle`: energy<6 -> toast "Too tired to chat"; `pickMingleEncounter(char, MINGLE_POOL)`; null -> toast "The bar is unusually quiet tonight." (cannot happen in practice: `drunk_aggressive` has no gate).
- **Modal `MingleEncounter`** (7438-7578): on mount picks `encounter.beats[floor(random*len)]` (stable per mount). Look = `encounter.look` if present else random generic stranger: `shirt = speaker.color` (always, since colors are truthy), `skin` random of `['#d4a87a','#a87844','#e0b890','#7a5040']`, `hair` random of `['#1a1a2e','#3a2410','#5a2010','#7a3a20','#dadada']` (a shirts array exists but is shadowed by speaker.color). Draws bar scene via `drawMingleScene` (9833). Shows speaker name (colored, Bebas Neue), opener in quotes, 2-3 buttons "-> text". After clicking: shows "you said" + reply line (if `outcome.line` non-null) + an effects readout line (`+N♥ · +N⚡ · +N🍴 · +$N · +N fans` — only mood/energy/hunger/cash/followers, NOT affinity/flags) + button "LEAVE THE BAR CHATTER ->". Footer text `+30 min · -6⚡`; "leave ->" link (before choosing) closes with no cost and no effects.
- **finish()** (7465): `setChar(c => { next = applyMingleEffects(c, effects, outcome); t = passMinutes(c,30); next.minutes = t.minutes; next.energy = max(0, next.energy-6); next.mood = _clampPct(t.mood + (next.mood - c.mood)); next.mingleCount = c.mingleCount+1; next.daily = {...c.daily, mingles: (c.daily.mingles||0)+1}; next.metEncounters[encounter.id] += 1 })`. NOTE mood: effect delta is clamped against the PRE-decay mood, then added to the decayed mood (so a +6 at mood 98 yields +2). No day-end check on minutes (can exceed 1200). Then toasts (use stale render-time `char`): if `outcome.bookDate` -> `win` "Date with <NAME>: <DOW> HH:MM · park" (DOW=`DAY_NAMES_SHORT[(day+daysAhead)%7]`, HH:MM from `(minute+360)`; 600 -> "16:00"); else if `effects.affinity`: for each `[id,delta]`: `newAff = char.romanceAffinity[id]+delta`; if `newAff>=10 && oldState!=='couple'` -> win "You and <ID> are a couple now ❤️"; else if `newAff>=5 && oldState==='building'` -> win "Things with <ID> are getting real"; stop after first match (`break`). `oldState = romanceState[id] || 'building'`.

---

## `_enc` helper + encounter schema  (lines 1253-1262)
- Builds an encounter: `_enc(id, cfg) => ({ id, weight: 1, when: () => true, ...cfg })` (cfg overrides defaults).
- Schema: `{ id:string, weight:number (default 1), when:(char)=>bool (default true), look?:{shirt,skin,hair}, beats:[{ speaker:{name,color}, line:string, options:[{ text, outcome:{ line:string|null, effects:{ mood?, energy?, hunger?, cash?, followers?, flags?:{k:true}, affinity?:{candidateId:delta} }, bookDate?:{partner,partnerName,partnerColor,daysAhead,minute} } }] }] }`.
- Header comment: "One conversation = 30 game minutes + ~6 energy". 3 options per beat (generic: 3; ask-out: 2).
- State: reads nothing itself; every encounter's `when(char)` is evaluated by the picker; `look` is optional (absent = random stranger look generated in the modal).
- Rebuild: lift verbatim. Keep `when` as pure predicate functions of `char`. Inject RNG into picker. Suggested TS types:
  ```ts
  type Effects = { mood?:number; energy?:number; hunger?:number; cash?:number; followers?:number;
                   flags?:Record<string,boolean>; affinity?:Record<string,number> };
  type BookDate = { partner:string; partnerName:string; partnerColor:string; daysAhead:number; minute:number };
  type Outcome = { line:string|null; effects:Effects; bookDate?:BookDate };
  type Option = { text:string; outcome:Outcome };
  type Beat = { speaker:{name:string;color:string}; line:string; options:Option[] };
  type Look = { shirt:string; skin:string; hair:string };
  type Encounter = { id:string; weight:number; when:(c:Char)=>boolean; look?:Look; beats:Beat[] };
  ```

## MINGLE_GENERIC — 10 strangers, fallback pool  (lines 1264-1357)
Header says "all have weight >= 3" but weights are 4,3,3,3,3,2,3,3,2,3 (two are 2). No `look` -> random look (see above). One beat each. Effects only mood/followers.
| id (w) | when | speaker (color) | opener | option -> reply [effects] |
|---|---|---|---|---|
| barfly_old (4) | always | old timer #a8a29e | "you new here? haven't seen your face." | "yeah. just moved this way." -> "well. don't make a fool of yourself." [m+2]; "i've been around. you just don't notice." -> "ha. fair." [m+3]; "(nod. say nothing.)" -> "...alright then." [m+0] |
| hipster_dj (3) | always | someone in a thrifted shirt #a78bfa | "you look like you'd know a good record store." | "i don't really do vinyl." [m+1]; "depends what you're looking for." -> "ok, ok. i see you." [m+3 f+1]; "is this a pickup line?" -> "haha. unfortunately yes." [m+5] |
| shy_fan (3) | `followers>=5` | a quiet kid #22d3ee | "i, um. i think i've seen your clips? sorry. that's weird." | "no, that's nice. thank you." [m+6 f+2]; "oh — what'd you think?" -> "i liked the rolls. you're good." [m+5 f+3]; "yeah that's me." [m+2 f+1] |
| know_it_all (3) | always | guy with strong opinions #fb7185 | "real beatbox died in 2009. fact." | "you might be right actually." [m-1]; "that's a lot to put on 2009." [m-2]; "(walk away)" -> line `null` [m+1] |
| regular_drunk (3) | always | a guy four beers in #f97316 | "i used to play guitar. did i tell you that?" | "what'd you play?" [m+2]; "you should pick it up again." [m+3]; "(let him keep talking)" -> "you're a good listener." [m+1] |
| travel_writer (2) | always | someone with a notebook #84cc16 | "you live here? i'm trying to find the real stuff." | "the real stuff is in your room. trust." [m+2]; "go to the park on a thursday afternoon." [m+3 f+1]; "tourists ruin places. sorry." -> "...damn. ok." [m-1] |
| open_mic_friend (3) | `openMicCount>=1` | someone who saw you tuesday #fbbf24 | "tuesday. you. that thing you did at the end." | "good or bad?" [m+6 f+2]; "thanks. it's been work." [m+5]; "what thing." -> "the rolls. obviously." [m+3] |
| overheard (3) | always | two friends talking #dadada | "(you overhear: 'the thing about beatboxing is anyone can do it now, that's the problem.')" | "actually... no it isn't." [m+1]; "(let it go and order a water)" -> null [m+0]; "anyone CAN do it. that's the point." [m+2] |
| lost_phone (2) | always | someone panicking #fb7185 | "have you seen a phone? black case. screen cracked." | "i'll help you look." [m+5]; "you check the bathroom?" [m+2]; "no, sorry." -> "right. ok." [`{}`] |
| quiet_one (3) | always | someone alone at the bar #a8a29e | "..." | "rough day?" -> "...yeah. yeah a bit." [m+3]; "(sit one stool over)" -> "(they nod, slightly.)" [m+2]; "(walk past)" -> null [`{}`] |
- Weight sum all gates open = 29; without shy_fan/open_mic_friend = 23.
- State read: `followers` (shy_fan), `openMicCount` (open_mic_friend). State written: mood and followers only (via applier). No flags.
- Tone: deadpan, lowercase, awkward-small-talk; most options are +mood, so the generic pool is a cheap mood top-up (+0..+6) with occasional +1..+3 followers (best: shy_fan option 2, m+5 f+3).
- Rebuild notes: `outcome.line === null` means "show no reply box" (the readout button still shows). `effects: {}` / `m+0` both produce no readout (readout skips falsy values).

## MINGLE_PIGPEN — recurring rival, 4 stages by story flags  (lines 1359-1415)
All share `look { shirt:'#1a1a1a', skin:'#d4a87a', hair:'#dc2626' }`, speaker `PIG PEN` color `#fb7185`, one beat, 3 options, mood-only effects. Gates read `storyFlags` set elsewhere (`pigPenChallenged` from the Jam cutscene at line 14858; `pigPenBattled`/`pigPenWins`/`pennyReveal` from battle resolution at 18405-18445; `pennyReveal` fires when wins reaches exactly 2).
| id (w) | when | opener | options [effects] |
|---|---|---|---|
| pigpen_pre (4) | `pigPenChallenged && !pigPenBattled` | "saturday's getting close. you bringing your A or what." | "i'll be there." -> "we'll see." [m+1]; "you sound nervous." -> "ha. nervous. that's cute." [m+2]; "(stay quiet)" -> "...whatever. saturday." [m-1] |
| pigpen_after_loss (4) | `pigPenBattled && (pigPenWins\|\|0)===0` | "i told you. you're not ready." | "i'll be ready next time." -> "yeah, alright. show me." [m+2]; "i was off my A." -> "everyone's off their A. excuses." [m-2]; "(walk past)" -> null [`{}`] |
| pigpen_after_win (4) | `(pigPenWins\|\|0)>=1 && !pennyReveal` | "rematch. this saturday. i'm not letting that one stand." | "anytime." -> "good." [m+3]; "you sure?" -> "i said anytime." [m+2]; "you talk a lot." -> "that's the GAME, brother." [m+1] |
| pigpen_post_penny (3) | `pennyReveal` | "you eat dinner?" | "not yet." -> "kitchen's closed. but the wings here are not bad." [m+5]; "yeah. you?" -> "yeah. i'm good." [m+4]; "what'd you call me?" -> "...nothing. forget it." [m+2] |
- State read: `storyFlags.pigPenChallenged`, `.pigPenBattled`, `.pigPenWins` (number, default 0), `.pennyReveal`. State written: mood only.
- At most one Pig Pen encounter is eligible at a time (conditions are mutually exclusive). No flags are written by these encounters; they are pure flavour. Lines say "saturday" regardless of actual weekday. Repeatable forever; `metEncounters` count is not used to vary text.

## MINGLE_CRYSTIX — online friend, rare in person  (lines 1417-1450)
`look { shirt:'#22d3ee', skin:'#e0b890', hair:'#3a2410' }`, speaker `CRYSTIX` `#22d3ee`. Both weight 1 (rare; ~2% of picks in mid-game).
- **crystix_first_meet** — `when: defeated.length>=2 && !storyFlags.crystixMet`. Opener: "yo. yo wait. you're— you're the kid. from the discord. the one that posts the rolls."
  - "crystix?? in the flesh??" -> "BRO. yes. i'm passing through. clip we doing — your tunes are nuts." [m+12 f+3 flag crystixMet]
  - "you're a real person." -> "haha — i've been told. yeah. yeah it's me." [m+10 f+2 flag crystixMet]
  - "do i know you?" -> "...crystix? from the forum? bro it's been YEARS." [m+6 flag crystixMet]
- **crystix_remeet** — `when: storyFlags.crystixMet`. Opener: "you again! i'm in town for like another week. wild we keep crossing." Options: "we should do something." -> "for real. text me." [m+6]; "good to see you." -> "you too man." [m+5]; "still here? thought you'd left." -> "ha — soon. soon." [m+3].
- Writes `storyFlags.crystixMet = true`. Consumers (outside range): achievement `crystix` (621), festival path B "Collab with Crystix" requires it (16053), random event `crystix_viral` (392).
- Gotcha: `defeated` is an array of beaten opponent NAMES (`char.defeated.includes(name)`); gate uses `.length`.
- State read: `defeated.length`, `storyFlags.crystixMet`. Written: mood, followers, `storyFlags.crystixMet`. Edge: first-meet stays at w1 forever until picked; once met, remeet (w1) can repeat with no cooldown.

## Sponsors — `_sponsorEncounter` factory + 5 brands  (lines 1452-1519)
Factory `_sponsorEncounter(id, brand, color, threshold, intro, pitchLine, accept, decline)` returns 2 encounters. Both use `look { shirt: color, skin:'#d4a87a', hair:'#3a2410' }`.
- **`sponsor_<id>_pre`** (w2): `when: followers < threshold && !storyFlags['sponsor_<id>_done']`. Speaker "a guy in a logo polo" (brand color), opener = `intro`. Options: "yeah, i do music." -> "interesting. interesting." [m+2]; "what do you do?" -> "i'm in marketing. boring." [m+1]; "(nod)" -> "...alright then." [`{}`].
- **`sponsor_<id>_pitch`** (w4): `when: followers >= threshold && !done`. Speaker `"<BRAND UPPERCASE> REP"`, opener = `pitchLine`. Options:
  - `accept the <Brand> deal` -> `accept` line [**cash+50, f+10, m+8, flags {sponsor_<id>_done:true, sponsor_<id>_signed:true}**]
  - "i'll think about it." -> "no rush. we'll be around." [m+1] (no flag; pitch can recur)
  - "not interested." -> `decline` line [flags {sponsor_<id>_done:true}] (no mood change)
- Any `_done` flag removes BOTH stages of that brand permanently.
| id | brand | color | threshold | intro | pitch | accept | decline |
|---|---|---|---|---|---|---|---|
| snortvpn | Snort-VPN | #a78bfa | 50 | "*sniff* — yeah. *sniff* — i'm in cybersecurity. *sniff* — privacy stuff." | "*sniff sniff* — SNORT-VPN — best on the *sniff* market. $50 to mention us once a show. *sniff* deal?" | "yeah! *sniff* — yeah! you won't regret this *sniff*." | "your call. *sniff* — your CALL." |
| redfull | Redfull | #dc2626 | 100 | "those wings are NUTS huh. anyway — what do you do, you a musician?" | "we love your energy. we'd love to put REDFULL on your stage. $50 sign-on, our cans at every show. you in?" | "energy drink companies — sign every kid with a follower count. let's go." | "your loss. literally." |
| sure | Sure | #fbbf24 | 200 | "the bar mics here are SO bad. you ever record clean?" | "SURE microphones. we want one of our SM-class on every show you play. fifty bucks up front, the gear's yours to keep." | "the rolls deserve better than a bar mic. signed." | "fair. when you change your mind we're here." |
| adipas | Adipas | #a8a29e | 500 | "love your fit. did you get those at the thrift on søndergade?" | "ADIPAS culture. we want to drop some kit on you. you wear the stripes, we wire $50 + a fresh tracksuit every quarter." | "stripes. shoes. tracksuit. you'll look the part for the festival." | "you sure? thought you'd love the kit." |
| samsong | Samsong | #22d3ee | 1000 | "i'm in tech. boring conference here this week. you're way more interesting." | "SAMSONG ELECTRONICS. our new headphones, your sets. fifty up front, swag for life. tasteful integration. you in?" | "welcome to the family. tasteful. understated. samsong." | "alright. small loss for us, big loss for you. kidding." |
- Pitch speaker names: `SNORT-VPN REP`, `REDFULL REP`, `SURE REP`, `ADIPAS REP`, `SAMSONG REP`.
- Consumers of `sponsor_*_signed` (outside range): achievements `sponsored` (622, any), `all_sponsors` (623, all 5); Adipas unlocks the `tracksuit` outfit (646). **No recurring income, gear or quarterly kit is implemented** despite pitch text.
- Pool effect: at game start (followers 0) ALL five `_pre` encounters are eligible simultaneously (5 x w2 = 10 weight).
- State read: `followers`, `storyFlags['sponsor_<id>_done']`. Written (accept only): `cash +50`, `followers +10`, mood +8, flags `_done` and `_signed`. Decline writes only `_done`.
- Edge cases: the pitch becomes eligible the moment `followers >= threshold`, so a player past 1000 followers who never mingled sees pitches for all five (5 x w4 = 20 weight, dominating the pool) until each is accepted/declined; "i'll think about it" keeps it alive. Accepting is strictly positive (no cost), so the "choice" is only flavour/identity.
- Rebuild: factory is pure — port as is; keep flag naming (`sponsor_<id>_done/_signed`) for save-compat.

---

## Romance system overview  (lines 1521-1532, 1936-1949, 1992-2030)
- Six candidates: **luca** (he/him sound engineer), **mira** (she/her visual artist), **sky** (they/them dancer), **pascal** (he/him music critic), **jin** (they/them dancer/choreographer), **roo** (she/her festival promoter). Header says "Three to start" — all six are live.
- Per-candidate state on `char`: `romanceAffinity[id]: number` (default absent=0; clamped >=0 in applier, no upper clamp) and `romanceState[id]: 'building'|'romancing'|'couple'` (absent treated as 'building'; the char-defaults comment says 'none' but code never writes 'none').
- Thresholds, recomputed in `applyMingleEffects` ONLY when the outcome carries `effects.affinity`, for EVERY key in `romanceAffinity`: `>=10 couple`, `>=5 romancing`, else `building`. (So a couple whose affinity falls to 9 is DEMOTED to romancing.)
- Each romance encounter has 4 beats; the modal picks one at random every time -> "stage" = just your affinity. Same beat can repeat; no "seen" tracking. Max affinity gained per conversation: +1 normally, +2 on the marked beats.
- Each beat has 3 options: right (+1 aff, mood +5..+10), neutral (0 aff, mood small +), wrong (-1 aff, mood -2..-4). Exceptions (no wrong option or two right options) are noted per candidate.
- Eligibility of base romance encounters: weight 2 each; luca/mira/sky always; pascal `followers>=30`; jin `openMicCount>=3`; roo `followers>=80`. They stay eligible after couple status (no cap, can keep farming affinity or lose it).
- Ask-out encounters (w3) appear when affinity>=5, not couple, and no `dateBooking`. "Yes" books a date and +2 aff; the date (park, outside range) gives +3 and +18 mood -> from 5, yes(+2)=7, date(+3)=10 = couple. No exclusivity: multiple couples possible; only ONE `dateBooking` at a time.
- Couple perks implemented elsewhere: outfits `romance_*` (646-655: `romanceState[id]==='couple'`), accessory `glasses` (Pascal couple, 670), achievement `in_love` (619). No in-range "ending" scene exists; the end state is simply `couple`.
- Looks / speaker colors:
| id | look (shirt, skin, hair) | speaker color |
|---|---|---|
| luca | #3a5060, #d4a87a, #1a1a2e | #22d3ee |
| mira | #a06090, #e0b890, #5a2010 | #fb7185 |
| sky | #fbbf24, #a87844, #dadada | #84cc16 |
| pascal | #fbbf24, #c89878, #3a2010 | #fbbf24 |
| jin | #a78bfa, #e4b890, #1a1a1a | #a78bfa |
| roo | #fb7185, #d4a87a, #fbbf24 | #fb7185 |

- State read by all six base romance encounters: `followers` (pascal, roo), `openMicCount` (jin); written: mood and `romanceAffinity[id]` (+ derived `romanceState`), plus `storyFlags.jinCollab` (jin beat 4 option 1 only).
- Worked progression (best case): 5 right answers -> 5 (romancing, ask-out eligible, w3) -> ask-out "yes" +2 = 7 and a booking at day+2 16:00 -> date +3 = 10 = couple. Fastest with +2 beats: pascal b4, jin b4, roo b4 (each +2). Worst case: ask-out "let me think about it" costs -1; a stand-up costs -2 and -10 mood.

#### Reply value matrix (mood / affinity) — right | neutral | wrong, per beat 1-4
| candidate | beat 1 | beat 2 | beat 3 | beat 4 |
|---|---|---|---|---|
| luca | +6/+1 · +2/0 · -3/-1 | +6/+1 · +2/0 · -2/-1 | +8/+1 · +3/0 · -2/-1 | +6/+1 · +2/0 · -3/-1 |
| mira | +6/+1 · +1/0 · -3/-1 | +6/+1 · +1/0 · -3/-1 | +8/+1 · +3/0 · -2/-1 | +8/+1 · +4/0 · -3/-1 |
| sky | +6/+1 · +3/0 · -2/-1 | +6/+1 · +3/0 · -3/-1 | +8/+1 · +3/0 · +1/0 (no wrong) | +8/+1 · +3/0 · -1/-1 |
| pascal | +6/+1 · +3/0 · -3/-1 | +6/+1 · +5/+1 · +1/0 (two right) | +8/+1 · -2/0 · -4/-1 | +10/+2 · +3/0 · +2/0 (no wrong) |
| jin | +6/+1 · +1/0 · -3/-1 | +6/+1 · +3/0 · +1/0 (no wrong) | +6/+1 · +2/0 · -3/-1 | +10/+2 (+flag jinCollab) · +3/0 · -3/-1 |
| roo | +6/+1 · +3/0 · +2/0 (no wrong) | +6/+1 · +5/+1 · -3/-1 | +8/+1 · +1/0 · -2/0 | +10/+2 · +2/0 · -2/0 |
(Cells list the three options in SOURCE ORDER; in every beat the first option is the intended "right" answer. "Wrong"/penalty options that cost mood but not affinity: Pascal b3 option 2, Roo b3 option 3, Roo b4 option 3. Affinity per conversation is therefore in {-1, 0, +1, +2}.)

### ROMANCE_LUCA  (lines 1534-1594) — w2, gate: always (`when: () => true`)
Right answers: curious about gear/craft. Wrong: dismissive/rude.
- Beat 1 "you're the beatboxer right? what mic you using on stage?"
  - "honestly? whatever rohzel hands me. is that bad?" -> "haha — yeah, kinda. dynamic mics eat your highs. i'll dm you a list." [m+6, aff luca+1]
  - "i don't really think about it." -> "you should. it's half the sound." [m+2]
  - "is this a sales pitch?" -> "...no. forget i asked." [m-3, luca-1]
- Beat 2 "the room here is so dead. the bass just vanishes."
  - "yeah, the back wall eats it. the curtains don't help." -> "EXACTLY. someone said it. someone finally said it." [m+6, +1]
  - "i hadn't noticed." -> "now you'll never un-hear it. sorry." [m+2]
  - "it's fine." -> "...sure." [m-2, -1]
- Beat 3 "i'm engineering a session sunday. wanna come watch?"
  - "i'd actually love that." -> "ok. cool. i'll text you the address." [m+8, +1]
  - "depends. who's it for?" -> "a band. local. they're alright." [m+3]
  - "i don't really do studios." -> "huh. ok." [m-2, -1]
- Beat 4 "what do you listen to when you're not beatboxing?"
  - "honestly a lot of weird minimal stuff. you?" -> "minimal heads UNITE. i'll send you a playlist." [m+6, +1]
  - "depends on the day." -> "yeah, fair, fair." [m+2]
  - "i don't really listen to music." -> "...wait what." [m-3, -1]
- The promised "text me the address / playlist / dm list" never happens (flavour only).

### ROMANCE_MIRA  (lines 1596-1656) — w2, gate: always
Right: thoughtful, curious, low-key. Wrong: cocky/dismissive of art.
- Beat 1 "i'm trying to draw the bar but i can't get the lights right."
  - "can i see? — without judgement." -> "...yeah. ok. just for a sec." [m+6, mira+1]
  - "you should add more red." -> "thanks. helpful." [m+1]
  - "drawing in a bar is a bit much." -> "...alright." [m-3, -1]
- Beat 2 "i feel like everyone here is performing. you too. but it's nice."
  - "you noticed. i think about that all the time." -> "yeah. yeah you would." [m+6, +1]
  - "i'm not performing. this is just me." -> "okay. sure." [m+1]
  - "everyone's performing all the time. it's not deep." -> "right. ok." [m-3, -1]
- Beat 3 "i saw a video of you. you really focus when you're in it."
  - "thank you. that's the only place i'm not in my head." -> "i could tell. that's why i kept watching." [m+8, +1]
  - "haha thanks." -> "(soft smile.)" [m+3]
  - "you watched me a lot then?" -> "...not — not like that." [m-2, -1]
- Beat 4 "when did you know you wanted to do this?"
  - "fourteen. i watched a video nine times in a row." -> "that's a real answer. most people give a fake one." [m+8, +1]
  - "i don't know. it just kept being there." -> "yeah. yeah it goes like that." [m+4]
  - "it's just for cash, honestly." -> "oh. okay." [m-3, -1]

### ROMANCE_SKY  (lines 1658-1718) — w2, gate: always
Right: playful, honest, can take a joke. Wrong: too earnest/try-hard.
- Beat 1 "ok don't beatbox at me. everyone does. it's exhausting."
  - "i wasn't going to. i'm trying to drink in peace." -> "OKAY thank you. that's the energy." [m+6, sky+1]
  - "deal." -> "deal." [m+3]
  - "*does a small beat anyway*" -> "...you couldn't help yourself." [m-2, -1]
- Beat 2 "i dance. badly. on purpose. it's a whole thing."
  - "show me sometime?" -> "absolutely not. you have to earn it." [m+6, +1]
  - "what does that mean." -> "you'll see one day. or you won't." [m+3]
  - "you should take it more seriously." -> "ok dad." [m-3, -1]
- Beat 3 "rohzel said you're new-ish. how's the city treating you?"  (NO wrong option)
  - "broke. tired. weirdly happy." -> "iconic. that's literally the trifecta." [m+8, +1]
  - "it's fine. it's a city." -> "ok mr. relatable." [m+3]
  - "not how i pictured it." -> "yeah well, nothing is." [m+1]
- Beat 4 "if you HAD to dance to one song forever — what's it."
  - "something stupid. i'd want it to be stupid." -> "STOP. i love this answer. i love this person." [m+8, +1]
  - "i don't really dance." -> "everyone dances. some of us just lie about it." [m+3]
  - "something profound. classical maybe." -> "...sure, mozart. mozart for life." [m-1, -1]

### ROMANCE_PASCAL  (lines 1750-1810) — w2, gate: `followers >= 30` ("shows up once you're on the radar")
Right: confident but humble, real. Wrong: defensive/name-dropping.
- Beat 1 "i write about music. i was at your last open mic. i had thoughts."
  - "go on. i can take it." -> "the third pattern needed more space. the second was perfect. you knew it was perfect." [m+6, pascal+1]
  - "good ones?" -> "some good. some honest. you want both?" [m+3]
  - "everyone has thoughts." -> "...yeah. ok." [m-3, -1]
- Beat 2 "i used to play. trumpet. i was never very good. that's why i write."  (TWO right answers, no wrong)
  - "i bet you were better than you remember." -> "...maybe. nobody's said that to me." [m+6, +1]
  - "writing's its own thing. it counts." -> "thanks. i needed that." [m+5, +1]
  - "trumpet's hard." -> "yeah. it is." [m+1]
- Beat 3 "what's the worst review you've ever gotten?"
  - "honestly? something my dad said in 2018. still in my head." -> "those are the only ones that count, aren't they." [m+8, +1]
  - "i don't read reviews." -> "everyone reads them. don't lie." [m-2, no aff change]
  - "i don't get bad ones." -> "...alright, mozart." [m-4, -1]
- Beat 4 "i'm trying to write a long-form piece about why this scene matters. why does it matter to you?"  (no wrong option)
  - "it's the only place i'm in my body and not my head." -> "i'm putting that in. with your name. is that ok?" [m+10, **+2**]
  - "it's just fun." -> "fun's an underrated reason." [m+3]
  - "i don't really think about it." -> "you should. now you'll have to." [m+2]

### ROMANCE_JIN  (lines 1812-1872) — w2, gate: `openMicCount >= 3`
Right: respectful of craft, willing to be wrong, curious.
- Beat 1 "i choreograph for the underground. i've been watching you. you have rhythm but no body."
  - "i'd love to learn what you mean by that." -> "...yeah. ok. that's the right answer." [m+6, jin+1]
  - "people pay to hear me. body's optional." -> "they'll pay more if you give them both." [m+1]
  - "what's that even supposed to mean." -> "if you have to ask. yeah." [m-3, -1]
- Beat 2 "every great performer i've worked with stops thinking eventually. how close are you?"  (no wrong)
  - "honestly? not close. i'm in my head a lot." -> "good. that's the first step. admitting it." [m+6, +1]
  - "i'm there sometimes. depends on the night." -> "yeah. depends. always depends." [m+3]
  - "i don't think while i perform." -> "everyone thinks. you just notice or you don't." [m+1]
- Beat 3 "i work with my body for a living. mine hates me by 30. yours will too."
  - "what helps?" -> "stretching every morning. your jaw, your neck. listen to your throat." [m+6, +1]
  - "i'm careful." -> "everyone says that until they aren't." [m+2]
  - "i'll worry about that later." -> "famous last words." [m-3, -1]
- Beat 4 "i'm putting together a piece. dance + beatbox. live. would you ever do that?"
  - "yes. immediately. tell me when." -> "ok. friday. i'll send you the studio address." [m+10, **jin+2**, flag `jinCollab:true`]
  - "tell me more first." -> "fair. i'll write up the brief." [m+3]
  - "not really my thing." -> "ok. fine. won't ask twice." [m-3, -1]
- `jinCollab` is written but NEVER read anywhere in the file (dead flag; "friday collab" never materialises).

### ROMANCE_ROO  (lines 1874-1934) — w2, gate: `followers >= 80`
Right: ambitious without being transactional, says no when it's no.
- Beat 1 "i book stages. nothing big yet. i'm watching everybody right now. don't be normal."  (one right, rest 0 aff)
  - "no promises. but i'll try not to be boring." -> "good answer. that's the only one i'll remember tomorrow." [m+6, roo+1]
  - "i'm normal. that's why i beatbox." -> "haha. ok. you have a sense of humor at least." [m+3]
  - "what kind of stages?" -> "the kind you'd want to be on." [m+2]
- Beat 2 "everyone wants to be on a festival stage. nobody wants to do the work to deserve one."  (two right)
  - "i'm doing the work. you'll see." -> "i hope so. i'm rooting for somebody this year." [m+6, +1]
  - "what's the work look like to you?" -> "twenty minutes you'd watch sober. that's it." [m+5, +1]
  - "i deserve one." -> "...do you? we'll see." [m-3, -1]
- Beat 3 "what would you do if i offered you a slot, no questions, just yes or no?"  (wrong costs mood only)
  - "i'd ask what slot. i'd want to know what i'm walking into." -> "good. people who say yes too fast disappoint me." [m+8, +1]
  - "yes. obviously." -> "...obviously." [m+1]
  - "depends on the bag." -> "ok. i hear you. i don't love it. but i hear you." [m-2, no aff change]
- Beat 4 "people in this scene get burned out fast. how do you keep showing up?"  (wrong costs mood only)
  - "i don't always. some weeks are bad. i just don't quit." -> "that's the answer. that's the only answer." [m+10, **roo+2**]
  - "i love it." -> "everyone says that. then they leave." [m+2]
  - "i'm not burned out." -> "give it a year." [m-2, no aff change]

### Ask-out encounters `_askOutEnc(id, name, color, look)`  (lines 1720-1748; instantiated 1943-1948)
- Id `romance_<id>_askout`, weight 3, `look` = candidate look. `when: (romanceAffinity[id]||0)>=5 && (romanceState[id]||'building') !== 'couple' && !c.dateBooking`.
- Speaker `{name, color}`: LUCA #22d3ee, MIRA #fb7185, SKY #84cc16, PASCAL #fbbf24, JIN #a78bfa, ROO #fb7185.
- Opener by id: sky "ok. listen. i'm gonna do something weird. you free saturday?"; mira "i was thinking — would you wanna meet at the park sometime? not weird."; others (luca/pascal/jin/roo) "i'm at the park sunday afternoon. you should come. we can just talk."
- Option 1 "yes. let's do it." -> reply by id: sky "OK ok ok ok. saturday. park. you better show."; mira "ok. let's say sunday at four."; others "i'll be at the park bench by the trees. you'll find me." Effects: **m+12, aff[id]+2, flag `<id>_dateScheduled:true`**, `bookDate {partner:id, partnerName:name, partnerColor:color, daysAhead:2, minute:600}`.
- Option 2 "let me think about it." -> "...yeah. ok. sure." [m-1, aff[id]-1] (can drop below the threshold and cancel the ask-out until re-earned).
- Dialogue names a weekday (saturday/sunday) but the booking is ALWAYS `day+2` at `minute 600` (= 16:00). Flag `<id>_dateScheduled` never read.
- Date resolution (outside range, ParkScreen 14700-14760): on `dateBooking.day === char.day` a "MEET <NAME> (+1 hr)" button appears: clears booking, +3 affinity (state recomputed only if >=10 couple / >=5 romancing), +18 mood (cap 100), +60 minutes, plays a cutscene ("you came." / "i wasn't sure if you would." / "...this is nice."). If `dateBooking.day < char.day`: stand-up penalty once: booking cleared, mood -10, affinity -2 (clamped 0), toast "You stood <NAME> up. -10 mood." (romanceState NOT recomputed there). Partner look map for the date scene only knows luca/mira/sky; pascal/jin/roo fall back to `{shirt:'#a78bfa'}` (missing skin/hair).

### MINGLE_ROMANCE composition  (lines 1936-1949)
Array order: LUCA, MIRA, SKY, PASCAL, JIN, ROO, then ask-outs luca, mira, sky, pascal, jin, roo = 12 encounters.

## MINGLE_BAD  (lines 1951-1965)
- 1 encounter: `drunk_aggressive` (w2), no `when` (always eligible), look `{shirt:'#7a3a40', skin:'#a87844', hair:'#1a1a1a'}`, speaker `???` #dc2626, opener "what're you LOOKIN at???".
- Options: "nothing man, sorry." -> "yeah, you better be sorry. PUNK." [m-8]; "you alright?" -> "i'm GREAT. fuck off." [m-10]; "(walk away fast)" -> null [m-3]. (Profanity present in source.)
- It costs the same 30 min + 6 energy as any chat if the player clicks through. At game start it is 2 of ~41 weight (~4.9%).
- State read: none. Written: mood only (-3 to -10). Worst case -10 mood for the "you alright?" option; "walk away fast" is the damage-limiting choice. There is no "good" option by design.

## MINGLE_POOL  (lines 1967-1975)
`[...GENERIC (10), ...PIGPEN (4), ...CRYSTIX (2), ...SPONSORS (10), ...ROMANCE (12), ...BAD (1)]` = 39 encounters.
Eligible weight snapshots (computed from the tables):
- Day 5, fresh char (followers 0, no open mics): generic 23 + sponsor pre x5 = 10 + luca/mira/sky 6 + bad 2 = **41** (sponsor "pre" chat ~24%, drunk ~4.9%).
- Late, everything unlocked and unsigned: generic 29, pigpen 3-4, crystix 1, sponsor pitches/pre variable, romance base 12, askouts 3 each (when eligible), bad 2.

## `pickMingleEncounter(char, pool)`  (lines 1977-1990)
- `eligible = pool.filter(e => try e.when(char) catch false)`; none -> `null`. `total = sum(e.weight||1)`; `r = Math.random()*total`; iterate subtracting weights, return first with `r <= 0`; fall back to last eligible.
- Uses global `Math.random` (no seed). Rebuild: accept an `rng: () => number` param for deterministic tests. Note a `weight: 0` would become 1 (`||1`).

## `applyMingleEffects(c, effects, outcome)`  (lines 1992-2030)
Pure function returning a new char (shallow copy):
- `max = c.maxEnergy ?? 100`.
- `mood`: `_clampPct(c.mood+e.mood)`; `energy`: clamp `[0,max]`; `hunger`: `_clampPct`; `cash`: `max(0, cash+e.cash)`; `followers`: `max(0, followers+e.followers)` (each only if `typeof e.X === 'number'`).
- `flags`: `next.storyFlags = {...(c.storyFlags||{}), ...e.flags}` (shallow merge).
- `affinity`: `aff = {...romanceAffinity}`; for each `[k,v]`: `aff[k] = max(0, (aff[k]||0)+v)`. Then for EVERY id in `aff` recompute `romanceState[id]` (>=10 couple, >=5 romancing, else building) — can demote.
- `outcome.bookDate`: `next.dateBooking = { partner, partnerName, partnerColor, day: (c.day||1)+(bd.daysAhead||2), minute: bd.minute||600 }`.
- Does NOT touch minutes/energy cost/`mingleCount`/`metEncounters`/`daily` (done in `finish()`).
- Rebuild: lift verbatim to TS; type `Effects` and `Outcome` interfaces.
- Pseudocode for the whole "finish a mingle" transaction (merge of `finish()` + applier, with the stale-toast bug removed):
  ```ts
  function finishMingle(c: Char, enc: Encounter, picked: Option): { char: Char; toasts: Toast[] } {
    let next = applyMingleEffects(c, picked.outcome.effects, picked.outcome);
    const t = passMinutes(c, 30);                       // {minutes: c.minutes+30, mood: decayed}
    next.minutes = t.minutes;
    next.energy  = Math.max(0, next.energy - 6);
    next.mood    = clampPct(t.mood + (next.mood - (c.mood || 0)));   // effect delta (pre-decay clamp) + decayed mood
    next.mingleCount = (c.mingleCount||0) + 1;
    next.daily = { ...(c.daily||{}), mingles: (c.daily?.mingles||0) + 1 };
    next.metEncounters = { ...(c.metEncounters||{}), [enc.id]: (c.metEncounters?.[enc.id]||0) + 1 };
    // toasts: bookDate -> "Date with NAME: DOW HH:MM · park"; else first affinity entry crossing 10 (couple) / 5 (romancing from 'building')
    return { char: next, toasts };
  }
  ```

---

## GEAR_CATALOG — upgraded shop  (lines 2032-2100)
Header: one-time purchases; `char.gear[id] = true`. Fields per entry: `{ name, store, cost, desc }` (no unlock field). **Unlock condition for every item = its store being unlocked** (`isUnlocked(char,'store_<store>')` in ShopScreen 14656): music day 4, furniture day 5, clothing day 7, pet day 10. Purchase code (ShopScreen.buyGear, 14478): blocks if already owned (except dead houseplant), `cash < cost` -> toast "Not enough cash"; else `cash -= cost; gear[id] = true`; toast `Bought <name>!`. Special init: houseplant sets `lastPlantWaterDay=day, plantDead=false, plantWaterCount=0, plantWaterCountDay=day`; mpc pads `oriSlots` to 8 slots (`SEQ_SLOTS_MPC`) using `existing[i] || _seqStarter(i % 4)`.

| id | name | store | price | catalog desc (verbatim) |
|---|---|---|---|---|
| pc | Studio PC | music | $800 | +25% to Tec & Ori training stat gains |
| mpc | Pro MPC (BBX-32) | music | $600 | Doubles your sequencer slots (4 → 8) |
| mic | Studio Condenser Mic | music | $500 | +25% to all mic-mode + Mus reward; better PitchTuner accuracy |
| premium_headphones | Premium Headphones | music | $250 | +25% accuracy in BeatboxHero mic-mode |
| studio_monitors | Studio Monitors | music | $300 | +25% to ori sequencer creativity score |
| camera_tripod | Camera + Tripod | music | $200 | Auto-posts your clips · +1 follower/day passively |
| new_bed | Memory-Foam Bed | furniture | $600 | +20 max-energy boost the morning after a full sleep |
| houseplant | Houseplant | furniture | $50 | +1 mood every morning if it stays alive (water = $5/3 days) |
| coffee_machine | Coffee Machine | furniture | $120 | One free home espresso per day (+25⚡, -15🍴, +2♥) |
| yoga_mat | Yoga Mat | furniture | $60 | Daily meditate action: +5 mood, 10 game min |
| earplugs | Earplugs | furniture | $30 | Removes "noisy upstairs" + "heating stuck" bad-sleep reasons |
| wardrobe_refresh | Wardrobe Refresh | clothing | $200 | +1 sho gain on every battle / open mic / showcase |
| premium_shoes | Premium Running Shoes | clothing | $150 | +1 extra sho per run reward block |
| cat | Cat 🐈 | pet | $100 | +2 mood every morning · costs $3/day in food |
- Counts: 14 items; music 6 ($2650), furniture 5 ($860), clothing 2 ($350), pet 1 ($100); grand total $3960. Display order in store view = `Object.entries` order above. Hub tile shows `owned/total`.

### What each item ACTUALLY does in code (consumer sites are outside range)
- **pc** (12804): training `onReward`: if stat is `tec` or `ori`: `gearMult *= 1.25`. Applied as `statGain = Math.round(statGain * gearMult)`; toast suffix " · 🎛️". **Rounding means base gain 1 stays 1** (1.25 -> 1); only gains of 2+ benefit (2->3 since Math.round(2.5)=3; 3->4). AFK tec/ori training gives 1 per block, so PC helps only in playMode with accuracy >= 0.5 or BPM multiplier. Stacks with festival prep (`festivalState==='prepping'` => x2; combined 2.5x).
- **mpc** (14150-14153, 14507, 18306): sequencer slot count 4 -> 8 (`SEQ_SLOTS=4`, `SEQ_SLOTS_MPC=8`, line 4969); buy-time padding of `oriSlots` described above; battle finisher name becomes `"<NAME>'S SIGNATURE"` instead of "MEGA COMBO" when the MPC is owned and slot 0 has notes.
- **mic** (12805, 14078): training `mus` gains: `gearMult *= 1.25` (same Math.round caveat: 1 stays 1; 2->3; 3->4). Also BeatboxHero `accuracyBoost` multiplier x1.15 (combined multiplicatively with headphones x1.25: `(hp?1.25:1)*(mic?1.15:1)`). The "better PitchTuner accuracy" claim: no `hasGear(...,'mic')` hit near the PitchTuner in a grep — appears unimplemented.
- **premium_headphones** (14078, 18726, 672): `accuracyBoost` x1.25 on BeatboxHero (training tec screen and battle). Also unlocks accessory `headphones` (cond `!!gear.premium_headphones`). Applied regardless of input mode (the "mic-mode" wording is only in the desc).
- **studio_monitors** (12793-12796): ori training: `cv = accuracy(creativity)*1.25` before thresholds (`>=0.8` -> +3 stat, `>=0.5` -> +2, else 1); toast suffix " · 🎚️".
- **camera_tripod** (13189, 13224): on the sleep transition, `followers += 1` per night.
- **new_bed** (13161-13162): `bedBonus = 20` but `energy = Math.min(max, max + bedBonus)` = `max` — **NO EFFECT** (bug). Waking energy is `max` with or without the bed.
- **houseplant** (72, 13171, 12930-12967, 14231, 14478-14527): alive iff owned && !plantDead && `(day - lastPlantWaterDay) < 5`; alive => +1 mood each morning (sleep). Water button costs $5, resets `lastPlantWaterDay`, max 3 waterings per day (`plantWaterCount` / `plantWaterCountDay`); a 4th watering the same day drowns it (`plantDead=true, plantDeathDay=day`, cash -5, cutscene). A merely neglected (>=5 days) plant is "wilting": no bonus, can be watered back. Replacement: shop shows "drowned · replace?"; allowed only on/after `replantAvailableDay = deathDay + daysToNextTuesday(deathDay)` ("nursery restocks Tuesday"; if death day is Tuesday the wait is 7 days); costs $50 again. Desc "$5/3 days" does not match code (5-day window, 3/day cap).
- **coffee_machine** (12874-12885): once per day (`lastCoffeeDay === day`): 5 game min via passMinutes; energy +25 (cap `maxEnergy`), hunger -15 (floor 0), mood +2; free; button "BREW" -> "TODAY".
- **yoga_mat** (12916-12926): `meditate`: once per day (`lastYogaDay === day`), 10 game min, mood +5.
- **earplugs** (74-76): `FILTERED_BAD_SLEEP(c)` removes reason ids `noisy` and `heating` from `BAD_SLEEP_REASONS` (332-348).
- **wardrobe_refresh** (15707, 15934, 18422): `stats.sho += 1` (a +1 stat point) at the end of each open mic, showcase and battle (not a multiplier).
- **premium_shoes** (14920): run block reward `shoGain = (playMode&&isGood ? 2 : 1) + 1`.
- **cat** (13184-13187): on sleep, if `cash >= 3`: mood +2 and cash -3; if broke, silently no bonus and no charge.
- Rebuild: port `GEAR_CATALOG` as typed data (`id, name, store, cost, desc`) plus a `gearEffects` module (multipliers/booleans) used by training/sleep/run/perform code; fix `new_bed` and rounding intentionally or document parity bugs.

## STORE_META  (lines 2102-2108)
| store | display | color | icon |
|---|---|---|---|
| music | Music Store | #22d3ee | 🎵 |
| furniture | Furniture Store | #84cc16 | 🛋️ |
| clothing | Clothing Store | #fb7185 | 👕 |
| pet | Pet Store | #fbbf24 | 🐾 |
- Hub order `['music','furniture','clothing','pet']`; locked tile shows 🔒 greyed (colour `#5a5046`). Titles uppercased, "tap an item to buy".

## TIME_PALETTES  (lines 2110-2116)
| key | bg | accent | glow |
|---|---|---|---|
| dawn | #1c1815 | #f59e0b | rgba(245,158,11,0.06) |
| day | #1a1a1f | #fbbf24 | rgba(251,191,36,0.04) |
| dusk | #1c1418 | #f97316 | rgba(249,115,22,0.06) |
| night | #0c0a18 | #818cf8 | rgba(129,140,248,0.06) |
- Keyed by `timeOfDay(minutes)`: dawn 0-59 (06:00-06:59), day 60-719 (07:00-17:59), dusk 720-779 (18:00-18:59), night 780+ (19:00-02:00). Used only in the root App (line 11532): page background = `palette.bg` with CSS `transition-colors duration-1000`, plus `radial-gradient(circle at 20% 10%, glow, transparent 50%)`, `radial-gradient(circle at 80% 80%, rgba(204,34,0,0.06), transparent 50%)` and a 2px scanline `repeating-linear-gradient`. `accent` is defined but (in the usage seen) not consumed. Rebuild: Phaser camera background colour tween (1000 ms) + overlay.

## Clock component  (lines 2118-2128)
- `Clock({minutes, day})` renders `☀️` if `timeOfDay` is `'day'` or `'dawn'` else `🌙` (so dusk shows the moon), followed by `clockString(minutes)` in mono small stone-300. `day` prop is unused. Used in the sticky header (line 11568) with `char.minutes ?? 0`.
- Rebuild: a Phaser Text/Icon in the HUD updated from game state; reuse `clockString`/`timeOfDay` verbatim.

---

## ACTIVITY ENGINE — `useActivity`  (lines 2130-2258)
**What it is:** a React hook that runs a real-time loop for "blocks" of an activity (training, busking, jamming, running). Header comment says "ticks every 2 seconds ... 5-block sets" (stale; actual default tick is `TICK_REAL_MS = 500`).

### Global pause flag (2134-2137)
`let _gamePaused=false; setGamePaused(v){ _gamePaused = !!v }`. Root App sets it from `useEffect(() => setGamePaused(!!cutscene), [cutscene])` (line 11155). While true, `tickHandler` returns immediately (interval keeps firing but nothing advances; no time/energy/hunger/mood change, no reward counting).

### Signature
`useActivity({ char, setChar, checkLevelUp, showToast, config })` -> `{ active, block, rewardsEarned, start, stop }`. (`checkLevelUp` is accepted but never used inside.)
`config` fields: `blocksPerReward` (5 everywhere), `tickEnergyCost` (number, may be fractional), `tickHungerCost`, `tickMoodDelta` (per-tick mood change, +/-), `onReward()` (called with NO arguments, despite the comment saying `(setChar)`), `stopWhen(probeChar)?`, `stopReason?`, `tickMinutes?` (default `TICK_MINUTES`=10), `tickRealMs?` (default `TICK_REAL_MS`=500).
State: `active` (bool), `block` (0..blocksPerReward-1 progress), `rewardsEarned` (count since `start`). Refs: `blockRef`, `activeRef`, `intervalRef`, `configRef`/`charRef` (always latest), `startDayRef`.

### `start()` (2234-2244)
1. If `active` return.
2. `charRef.current.energy < cfg.tickEnergyCost` -> toast `'Too tired to start!'` ('bad'), return.
3. `(char.sickDay||0) === char.day` -> toast `'Too sick to do anything today'` ('bad'), return.
4. Set active, `block=0`, `blockRef=0`, `rewardsEarned=0`; `setInterval(tick, cfg.tickRealMs || TICK_REAL_MS)`.

### Tick body (2186-2232) — exact order
1. If `_gamePaused` return.
2. `tickMins = cfg.tickMinutes ?? 10`.
3. `newMins = c.minutes + tickMins`; `newEnergy = max(0, c.energy - tickEnergyCost)`; `newHunger = max(0, c.hunger - tickHungerCost)`.
4. `passiveDrain = _moodDrainFor(c, tickMins)` (computed from PRE-tick hunger/energy); `newMood = _clampPct(c.mood + (tickMoodDelta||0) - passiveDrain)`. At 10 min: base drain 0.05/tick; up to 0.55/tick when hunger and energy are both 0.
5. Stop reason evaluation (first match wins; all shown as toast kind `'bad'`):
   - `newEnergy < tickEnergyCost` -> `'You collapsed from exhaustion'` (checked after the deduction: stops once the remaining energy cannot pay the next tick)
   - `newHunger <= 0 && tickHungerCost > 0` -> `'Too hungry to keep going'`
   - `newMins >= DAY_END (1200)` -> `'It got too late — heading home'`
   - `cfg.stopWhen(probe={...c, minutes:newMins, energy:newEnergy, hunger:newHunger, mood:newMood})` true -> `cfg.stopReason || 'Activity ended'`
6. Commit: `charRef.current = next`; `setChar(prev => ({...prev, minutes:newMins, energy:newEnergy, hunger:newHunger, mood:newMood}))` (absolute values, not deltas).
7. `blockRef++`; if `>= blocksPerReward`: reset to 0, `setBlock(0)`, `rewardsEarned++`, call `cfg.onReward()`; else `setBlock(blockRef)`. NOTE: the reward still fires on the final (stopping) tick.
8. If `stopReason`: clear active + interval, toast the reason ('bad').

### `stop(reason?)` (2177-2182)
Clears active/interval; if `reason` toasts it (`'bad'` if the string contains `'!'`, else `'info'`). Returned to UI (manual STOP button).

### Day-rollover watcher (2161-2175)
Effect on `[char.day, active]`: when active, remembers `startDayRef = char.day` on the first run; if `char.day` later differs, silently stops (no toast) and clears the interval. Prevents ticking across a forced-sleep day change.

### Interval re-sync (2246-2252)
When `config.tickRealMs` changes while active (user toggles playMode), the interval is recreated with the new period. Unmount clears the interval (does not reset `active`).

### Timing numbers (game vs real)
- AFK default: 500 ms real = 10 game min per tick; 5 ticks per reward = 50 game min = 2.5 s real. (Comment at line 14781 says "10 real seconds" — stale from the old 2 s tick.)
- playMode (mini-game engaged): `tickRealMs 2500`, `tickMinutes 3`: 3 game min per 2.5 s tick; reward every 15 game min / 12.5 s.

### Pseudocode for a framework-free port
```ts
interface ActivityCfg { blocksPerReward:number; tickEnergyCost:number; tickHungerCost:number; tickMoodDelta?:number;
                        tickMinutes?:number; tickRealMs?:number; stopWhen?:(c:Char)=>boolean; stopReason?:string; onReward:()=>void }
function activityTick(c: Char, cfg: ActivityCfg, blockCounter: {n:number}): { char:Char; stopReason:string|null; rewardFired:boolean } {
  const tickMins = cfg.tickMinutes ?? 10;
  const minutes = c.minutes + tickMins;
  const energy  = Math.max(0, c.energy - cfg.tickEnergyCost);
  const hunger  = Math.max(0, c.hunger - cfg.tickHungerCost);
  const mood    = clampPct(c.mood + (cfg.tickMoodDelta||0) - moodDrainFor(c, tickMins));   // drain from PRE-tick c
  let stopReason: string|null = null;
  if (energy < cfg.tickEnergyCost) stopReason = 'You collapsed from exhaustion';
  else if (hunger <= 0 && cfg.tickHungerCost > 0) stopReason = 'Too hungry to keep going';
  else if (minutes >= 1200) stopReason = 'It got too late — heading home';
  else if (cfg.stopWhen?.({ ...c, minutes, energy, hunger, mood })) stopReason = cfg.stopReason || 'Activity ended';
  const char = { ...c, minutes, energy, hunger, mood };
  blockCounter.n += 1;
  const rewardFired = blockCounter.n >= cfg.blocksPerReward;
  if (rewardFired) blockCounter.n = 0;       // caller then runs cfg.onReward() AFTER committing `char`
  return { char, stopReason, rewardFired };   // reward fires even when stopReason is set
}
// Runner (Phaser): timer every (cfg.tickRealMs ?? 500) ms; skip body while paused (cutscene); stop silently if char.day != startDay;
// start() refuses when energy < tickEnergyCost ("Too tired to start!") or sickDay === day ("Too sick to do anything today").
```

### Callers' configs (outside range, needed to rebuild the reward tables)
1. **Training** (`trainActivity`, line 12742): `blocksPerReward 5`; `tickEnergyCost` per stat: mus 1.5, tec 2, ori 2.5, sho 1 (x0.3 in playMode => 0.45/0.6/0.75/0.3); `tickHungerCost` 1 (playMode 0.5); `tickMoodDelta` -0.3 (playMode -0.15); no `stopWhen` (can run into the night until energy/hunger/DAY_END). `onReward` logic: base gain 1; mus accuracy `>=0.8` -> 3 ("perfect pitch!"), `>=0.5` -> 2; tec: AFK 1, playMode accuracy `<=0` -> 0, `>=0.8` -> 3, `>=0.5` -> 2, else 1, then x`max(1, tecBpm/90)` rounded; ori: creativity (x1.25 with monitors) `>=0.8` -> 3, `>=0.5` -> 2; then `gearMult` (pc/mic 1.25, festival prepping x2) with `Math.round`; reward = `xp +10`, `stats[stat] += gain`, `checkLevelUp`; toast `+N <Stat> <bonus text>` or "Block ended — no <Stat> gain. Keep playing!" if 0.
2. **Park activities** (`activity`, line 14943): `blocksPerReward 5`; energy/hunger x0.4/x0.5 in playMode; `tickMoodDelta` from the activity; same tickRealMs/tickMinutes playMode override; `stopWhen: c => !isDayTime(c.minutes)` (minutes >= 720), `stopReason: 'The sun is setting — park is emptying out'`.
   - busk: energy 2, hunger 0, mood 0. Reward: `baseEarned = floor(totalSkills/6) + floor(rand*3)` (totalSkills = mus+tec+ori+sho); accuracy bonus `acc>=0.8 -> x2.0`, `0.5..0.8 -> x(1 + (acc-0.5)/0.3*0.5)`; `cash += floor(base*mult)`; fan +1 with prob 0.4 or if acc>=0.8; xp +6; flag `firstBusk`; `bumpDaily 'busks'`.
   - jam: energy 2, hunger 1, mood +1. Reward: random stat of mus/tec/ori +1, followers +1..3 (`1+floor(rand*3)`), xp +8, `storyFlags.jamCount++`, `bumpDaily 'jams'`; triggers story cutscenes (firstJam; Pig Pen challenge at jamCount>=3 or sho>=8; BeeAmGee sighting after first win; FatboxG visit at jamCount>=5 && followers>=30).
   - run: energy 3, hunger 2, mood +0.5. Reward: `shoGain = ((playMode&&isGood)?2:1) + (premium_shoes?1:0)`; xp +5, mood +4 (cap 100), energy -`round(8*burnRatio)` in playMode; `bumpDaily 'runs'`.
- Rebuild: split into `activityTick(char, cfg): {char, stopReason, rewardFired}` (pure, lift ~verbatim incl. `_moodDrainFor`), and a Phaser scene-level runner using `this.time.addEvent({delay: tickRealMs, loop:true, callback})`; honour a global `paused` flag (cutscene scene) and re-create the timer when `tickRealMs` changes; call `onReward` after state commit; stop when day changes. Use delta applications (not absolute) once there is a single state store.

---

## Rebuild checklist (what to lift verbatim vs re-implement)
- Verbatim to a framework-free `mingle.ts`: `_enc`, all encounter arrays + sponsor factory + ask-out factory + romance data (strip `look` into a palette table if desired), `MINGLE_POOL`, `pickMingleEncounter` (inject RNG), `applyMingleEffects` (+ `finishMingle` that wraps the glue in lines 7465-7501 as a pure function returning `{char, toasts[]}` with the fixed non-stale toast logic). Recommended: write a script that evaluates lines 1262-1990 and dumps JSON for the static data, to avoid retyping text.
- Verbatim to `gear.ts`: `GEAR_CATALOG`, `STORE_META`, `CONTENT_UNLOCKS` store entries, `hasGear`, plant helpers, plus a typed list of effect consumers (see per-item table above).
- Phaser needed for: `MingleEncounter` modal (dialogue box, 3 option buttons, bar scene art with the stranger `look`), shop UI, `Clock`/palette background, activity timer loop and progress bar (`block`/`rewardsEarned`).
- Tests worth porting: picker eligibility counts for given chars; affinity/state transitions (4->5->10, demotion at 9); ask-out gating; sponsor flag locking; `activityTick` stop-reason order; mood clamp interplay in `finishMingle`.

---

## PARITY CHECKLIST (tick when the rebuild matches)
Mingle flow
- [ ] Bar closed Mondays and before 18:00; mingle locked until day 5; button needs energy >= 6; "bar unusually quiet" fallback.
- [ ] Weighted pick over `when`-eligible encounters; throwing predicate = ineligible; 39 encounters in pool.
- [ ] Random beat per encounter mount; 3 reply buttons; reply line (or none when `null`); readout shows mood/energy/hunger/cash/followers only.
- [ ] Cost on finish only: +30 min (with passive mood decay), -6 energy (floor 0), `mingleCount`, `daily.mingles`, `metEncounters[id]`.
- [ ] Leaving before choosing is free.
- [ ] Applier clamps: mood/hunger 0-100, energy 0..maxEnergy, cash >= 0, followers >= 0, affinity >= 0.
Encounters
- [ ] 10 generic (weights 4,3,3,3,3,2,3,3,2,3; shy_fan needs followers>=5; open_mic_friend needs openMicCount>=1).
- [ ] 4 Pig Pen stages with the exact flag gates (weights 4,4,4,3).
- [ ] 2 Crystix (w1 each; first meet at defeated>=2; sets `crystixMet`; remeet after).
- [ ] 5 sponsors x (pre w2 / pitch w4) at thresholds 50/100/200/500/1000; accept = +$50 +10 fans +8 mood + `_done` + `_signed`; think = +1 mood; decline = `_done` only.
- [ ] 6 romance candidates x 4 beats with the exact mood/affinity values; gates pascal f>=30, jin openMics>=3, roo f>=80; luca/mira/sky always; weight 2 each.
- [ ] 6 ask-outs (w3): affinity>=5, state != couple, no dateBooking; yes = m+12 aff+2 + booking (day+2, minute 600); no = m-1 aff-1.
- [ ] Romance state thresholds 5 / 10 recomputed for all candidates on any affinity effect; toasts "getting real" / "couple now ❤️" / "Date with X: DOW HH:MM · park".
- [ ] Bad encounter: drunk_aggressive w2, moods -8 / -10 / -3.
Gear (each: purchasable once at its price, store unlocked by day, effect wired)
- [ ] pc $800 (music): Tec/Ori training gain x1.25, rounded
- [ ] mpc $600 (music): 8 sequencer slots, pad `oriSlots`, signature finisher name
- [ ] mic $500 (music): Mus training gain x1.25 rounded, BeatboxHero accuracy x1.15
- [ ] premium_headphones $250 (music): BeatboxHero accuracy x1.25 in training + battle; unlocks `headphones` accessory
- [ ] studio_monitors $300 (music): ori creativity score x1.25 before thresholds
- [ ] camera_tripod $200 (music): +1 follower per night
- [ ] new_bed $600 (furniture): spec says +20 energy morning; code is a no-op — decide
- [ ] houseplant $50 (furniture): +1 mood/morning if watered within 5 days; $5 water; 3/day, 4th drowns; Tuesday restock
- [ ] coffee_machine $120 (furniture): daily +25 energy, -15 hunger, +2 mood, 5 min
- [ ] yoga_mat $60 (furniture): daily +5 mood, 10 min
- [ ] earplugs $30 (furniture): drop `noisy` + `heating` bad-sleep reasons
- [ ] wardrobe_refresh $200 (clothing): +1 sho after open mic / showcase / battle
- [ ] premium_shoes $150 (clothing): +1 sho per run block
- [ ] cat $100 (pet): +2 mood/morning, -$3/day when cash >= 3
- [ ] Shop hub with 4 stores (day 4/5/7/10 unlocks), owned/total counter, STORE_META colours/icons, "OWNED" badge, can't afford disables button.
Clock / palette / engine
- [ ] Background colour by `timeOfDay` (dawn <60, day <720, dusk <780, night), 1 s colour transition, glow overlays; Clock icon + HH:MM.
- [ ] Activity tick 500 ms (playMode 2500 ms / 3 game min), 10 game min per tick, 5 ticks per reward, stop reasons in the documented order, reward fires on the stopping tick.
- [ ] Pause during cutscenes; stop when day changes; refuse start when too tired or sick; interval re-created when `tickRealMs` changes.

---

## OPEN QUESTIONS / GOTCHAS
1. **Romance "stages" are not sequential.** Each candidate has 4 beats chosen at random each mingle (repeats possible, no memory). Affinity can be farmed indefinitely and has no cap. Should the rebuild keep this or add a progression? (Keep for parity.)
2. **`new_bed` is a no-op**: `Math.min(max, max + 20) === max`. Desc promises +20 max-energy boost.
3. **PC/mic rounding**: x1.25 on `Math.round(statGain * 1.25)` means gain 1 stays 1 (AFK training: no benefit); only 2+ gains improve. The `mic` desc "better PitchTuner accuracy" has no code hook found; mic only affects mus gain x1.25 and BeatboxHero accuracy x1.15.
4. Houseplant desc says "$5/3 days" but code uses a 5-day alive window and a 3-per-day watering cap (4th drowns). Replacement only on the Tuesday after death ($50 again).
5. Sponsor pitch text promises recurring income/gear/kit ("$50 to mention us once a show", "fresh tracksuit every quarter", "the gear's yours to keep"); only a one-time +$50 / +10 followers / +8 mood is given; Adipas also unlocks the tracksuit outfit. Decide whether to implement the promises.
5b. At game start all five sponsor `_pre` encounters are eligible (10 weight, ~24% of picks) — probably unintended flood of near-identical "guy in a logo polo" chats.
6. Ask-out lines mention "saturday"/"sunday at four" but the date is always `day+2` at minute 600 (16:00). The park date handler also has an incomplete partner-look map (pascal/jin/roo fall back to `{shirt:'#a78bfa'}`).
7. `romanceState` demotion: any later affinity change recomputes ALL states, so a couple at 10 who gets a -1 becomes 'romancing' again (outfit/glasses unlocks are checked live against `'couple'`, so they can disappear). The stand-up penalty (-2 affinity) and the date code do NOT recompute state the same way. State name `'building'` is used in code, `'none'` in the defaults comment.
8. Dead data/flags: `jinCollab`, `<id>_dateScheduled`, `metEncounters` (counter exists "to vary lines per re-meet" but no reader), `mingleCount`, effect keys `energy`/`hunger` (supported, unused by any encounter), `TIME_PALETTES.accent`.
9. In `finish()` the toasts read stale `char` (render-time) not the updater's `c`; the couple/getting-real toasts may miss or double-fire if state changed. Also `applyMingleEffects` clamps mood on the pre-decay value, then `finish` adds the clamped delta to decayed mood.
10. Time cost not capped: a mingle at 01:40 pushes minutes past `DAY_END` (1200); the global day-end watcher (outside range) presumably handles it.
11. Leaving the modal via "leave ->" before choosing is free; after choosing, the cost applies only when clicking "LEAVE THE BAR CHATTER". Closing differently (if the Phaser UI allows) must not skip the cost.
12. The effects readout in the modal omits affinity and flags (the player is not told affinity changed except via the 5/10 threshold toasts).
13. `MINGLE_GENERIC` header says weights >= 3 but two entries are 2. Pool never empty because `drunk_aggressive` is unconditional.
14. `useActivity`: stale comments (2 s tick, "10 real seconds"); `checkLevelUp` param unused; `onReward` receives no args; `start()` uses the stale `active` closure; day-rollover stop is silent; collapse check compares post-deduction energy to the per-tick cost so fractional costs (1.5, 2.5, 0.45...) can strand a few energy points; reward fires on the stopping tick; passive mood drain uses PRE-tick hunger/energy; the interval is not cancelled by the pause flag (tick no-ops), so pausing for N seconds does not queue catch-up ticks.
15. Activity commits absolute values (`minutes/energy/hunger/mood`) from a ref snapshot, overwriting anything else that changed those fields between ticks. In a single-store rebuild apply deltas instead, and make sure `onReward` effects (xp, stats, cash) apply after the tick commit as in the original.
16. `Clock` shows the moon during dusk (18:00-18:59) because only `day`/`dawn` count as sun; `isDayTime` also cuts at minute 720 (18:00), so icon, park lock and bar opening all agree, but the palette still has a separate `dusk` entry for that hour.
17. `Math.random` is used directly in `pickMingleEncounter` and modal beat selection; port with an injectable RNG for tests/replays.
18. Profanity in `drunk_aggressive` ("fuck off") — check content rating expectations before porting copy.
19. Verify against `drawMingleScene` (line 9833) which `look` fields it consumes (`shirt`, `skin`, `hair`) and whether it varies by `encounter.id`/speaker (not read here; outside range).
