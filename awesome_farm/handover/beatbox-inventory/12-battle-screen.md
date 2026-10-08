# 12 - BattleScreen inventory (beatbox-story.jsx lines 17865-18800, plus the data/helpers it depends on)

All line numbers refer to `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx` (18,800 lines, CRLF).

## SUMMARY

1. `BattleScreen` (17873-18800, the LAST thing in the file; there is NO default export in my range - the root `export default function BeatboxStory()` is at line 11110 and mounts `<BattleScreen char setChar go=setScreen showToast checkLevelUp playCutscene/>` at line 11700 when `screen === 'battle'`).
2. A battle is a fixed 4-round exhibition: player and opponent each perform TWICE (A,B,A,B). Each round is a 16-beat "combo" glued from two HERO_LESSONS patterns (first 8 beats of A + first 8 beats of B). Player plays it on the 4-lane rhythm game (BeatboxHero, `mode="battle"`, ~9.75 s); opponent rounds are auto-played (12 s) and just add a pre-computed score. There is NO sound picking any more - the "sound matchup" is the 4-style RPS cycle BOOM>HATS>RIM>SNARE>BOOM (x1.5 / x0.7 on each pattern pair).
3. Flow: intro -> Rock-Paper-Scissors (loser performs first; winner SEES the opponent's pattern styles; loser gets COUNTERED by an opponent re-roll weighted by `counterSkill`) -> tactical prep (pick 2 patterns x 2 turns from 12 lessons) -> [oppReveal] -> 4 x (3.3 s countdown + round) -> judging (5 judges, 700 ms each) -> result -> `finishBattle`.
4. Round score: `player = round(lessonValue * accuracy * (1+(tec+mus)/80) * counterMult)`; `opp = round(lessonValue * (0.7+tec/60*0.3) * (1+(tec+mus)/80) * counterMult)`; `lessonValue = round(noteCount * (1 + 0.4*tier))`. Opponent is fully deterministic given its picks (no accuracy roll). `ori` stat, equipped sounds, mood, energy and level do NOT affect battle at all.
5. Finisher: >= 8 consecutive PERFECT taps in a player round -> bonus `round(roundScore*0.5 + peakStreak*4)` + 2.6 s "FINISHER!" splash (no sound). Perfect window 110 ms, good 180 ms (x1.25 with `premium_headphones`).
6. Judging: 5 fixed judges (Tek/tec, Mel/mus, Origi/#distinct sounds, Showtime/sho, Wildcard/random +-15%) each multiply BOTH raw totals by a per-side bias and vote for the larger (ties -> opponent). Player wins with >= 3 of 5 votes. Raw totals are the sum of the two rounds per side (+ finisher bonuses).
7. Outcomes: win = +reward cash, +floor(reward/10) fans, +60 xp, mood +15, record in `defeated`; loss = +floor(reward*0.1) cash, +1 fan, +20 xp, mood -10. Both: energy -30, +90 game-minutes, `lastBattleDay = day` (7-day cooldown, shared with crew battles), `sho +1` with `wardrobe_refresh` gear. Pig Pen has a story arc (2nd win -> Penny reveal cutscene).
8. Crew battles (3v3) and festival "battles" are NOT in BattleScreen: crew = `resolveCrewBattle` (line 1152) + `doCrewBattle` (15768) pure stat check; festival = `runFestival` (15594) one RNG roll. Both documented briefly in section 22 for completeness.
9. Bugs/oddities worth fixing in the rebuild: `weekly.battleWins` is never incremented (weekly challenge "Win 3 battles" unreachable); judge hearts only fire during OPPONENT rounds and are cosmetic; NPC comment about `counterSkill` is inverted vs code; hooks declared after an early `return null`; `checkLevelUp`/toasts called inside a `setChar` updater.
10. Rebuild: lift ~15 pure functions (section 24) into `battle.ts`; Phaser needs a `BattleScene` state machine + a reusable 4-lane `RhythmLane` (shared with Technicality training) + stage/HUD/finisher-splash/judge-reveal widgets.

---

## 0. FILE MAP (what lives where)

| Thing | Lines | Notes |
|---|---|---|
| `NPCS` (7 opponents) | 87-97 | stats, sounds, reward, level, counterSkill |
| `CREWS` (3 crews) | 103-140 | used only by BarScreen crew battle |
| `JUDGES` | 142-148 | 5 judges |
| `STYLE_BEATS`, `STYLE_COLORS`, `styleMatchup` | 4181-4188 | the style RPS |
| `HERO_LESSONS` + `_patXxx` generators | 4029-4213 | 12 lessons, 16-beat patterns |
| `BeatboxHero` (rhythm game, battle/spectate modes) | 4489-4959 | hit windows, streak, accuracy |
| `PixelStage` (canvas stage, judges, aura, hearts) | 16752-17023 | |
| `FinisherSplash` | 16645-16750 | |
| `OPP_LOOKS`, `JUDGE_LOOKS`, `drawBeatboxer`, `drawJudge`, `drawPixelHeart`, `lookFromChar` | 16447-16608 | |
| `FINISHER_THRESHOLD = 8`, `_hypeLabel`, `BattleHUD` | 17030-17139 | |
| `playBeep`, `playWinSting`, `playLossSting` | 17580-17663 | |
| BarScreen opponent select / START BATTLE / cooldown | 15955-15959, 16237-16323 | entry point |
| `BattleScreen` | 17873-18800 | THIS inventory |
| Root app + wiring | 11110 (`export default`), 11700 (mount), 11707 (footer nav hidden on `battle`) | |

---

## 1. ENTRY / GATING (outside BattleScreen, lines 15955-15959, 16237-16288)

- Battle is the bar's Saturday activity (`BAR_SCHEDULE[5]` = `BATTLE NIGHT`, "The cypher fires up. Pick a challenger."). Bar is open only at night (`isNightTime = minutes >= 720`) and is unlocked from day 3.
- Cooldown: `battleCooldownDaysLeft = lastBattleDay ? max(0, 7 - (day - lastBattleDay)) : 0`. While > 0 the panel shows "You already battled this week. Come back in N day(s)." Crew battles set `lastBattleDay` too (shared cooldown).
- Opponent list = `NPCS` in order. Opponent `i` is locked unless `defeated` includes `NPCS[i-1].name` (Pig Pen always open). Beaten opponents stay selectable (rematches allowed, full rewards again). Shows `LVL n`, `M/T/O/S` stats and `$reward`.
- Selected opponent panel: "Sounds: <catalog names>" and button `START BATTLE 🎤 (-30⚡)`; disabled if `energy < 30` or `equipped.length === 0` ("Need 30 energy" / "No sounds equipped! Visit Shop"). No sick-day check for solo battles (crew battles do check `sickDay`).
- Click handler: `go('battle') || setChar(c => ({...c, _opponent: selected}))` -> the whole NPC object is stored on `char._opponent` (it gets saved with the char if autosave fires mid-battle; harmless leftover).
- Energy is NOT deducted at start; it is deducted in `finishBattle`. Forfeiting is therefore free (no cooldown, no energy, no time).
- 3+ defeated -> a separate "Crew Battle (3v3)" panel (section 22).

---

## 2. DATA THE BATTLE USES

### 2a. NPCS (87-97). `counterSkill` = prob. per pattern that the opponent picks the counter style when it re-rolls (only when player LOST the RPS).

| # | Name | mus | tec | ori | sho | reward $ | level | counterSkill | pick pool (lesson idx 0..max) |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Pig Pen | 7 | 7 | 5 | 6 | 20 | 1 | 0.20 | 0-2 |
| 1 | Joel Burner | 8 | 8 | 6 | 7 | 25 | 1 | 0.30 | 0-2 |
| 2 | CeDe | 12 | 11 | 9 | 10 | 50 | 3 | 0.40 | 0-4 |
| 3 | Sikker | 15 | 15 | 14 | 12 | 100 | 5 | 0.55 | 0-6 |
| 4 | Alim | 19 | 18 | 17 | 15 | 175 | 7 | 0.70 | 0-8 |
| 5 | Olexinho | 24 | 22 | 22 | 19 | 350 | 9 | 0.80 | 0-10 |
| 6 | FatboxG | 30 | 32 | 28 | 28 | 750 | 12 | 0.95 | 0-11 |

Pool max index = `max(0, min(11, level + 1))`. `sounds[]` arrays (e.g. Pig Pen `classic_kick,hi_hat,psh_snare`; FatboxG `uvular_roll,click_roll,d_low,inward_bass,laser,throat_kick`) are display-only in battle (HUD icons + "Sounds:" line). `ori` of both sides is never read by BattleScreen.

Derived opponent numbers (my computation, counter x1.0): focus `0.7+tec/60*0.3` and statMult `1+(tec+mus)/80`:

| Opp | focus | statMult | E[combo value] | E[round score] | E[2-round total] | min..max round |
|---|---|---|---|---|---|---|
| Pig Pen | 0.735 | 1.175 | 29.9 | 25.8 | 51.6 | 19..39 |
| Joel | 0.740 | 1.200 | 29.9 | 26.5 | 53.1 | 20..40 |
| CeDe | 0.755 | 1.288 | 44.5 | 43.2 | 86.5 | 21..63 |
| Sikker | 0.775 | 1.375 | 46.7 | 49.8 | 99.6 | 23..69 |
| Alim | 0.790 | 1.462 | 51.9 | 59.9 | 119.8 | 25..117 |
| Olexinho | 0.810 | 1.575 | 62.5 | 79.7 | 159.4 | 28..145 |
| FatboxG | 0.860 | 1.775 | 64.1 | 97.9 | 195.8 | 32..238 |

### 2b. HERO_LESSONS (4190-4213) as battle patterns. Notes `beat` in quarter notes; only beats `< 8` are used in combos. Lane keys: `B`=Kick, `T`=Hi-Hat, `K`=Rimshot, `Pf`=Snare (HERO_SOUNDS 17166). Battle UI shows lessons as `#1..#12` (idx+1).

| idx | name | tier | style | requires (owned sound) | lanes | notes in beats<8 | combo value if A=B=this |
|---|---|---|---|---|---|---|---|
| 0 | BOOM BASIC | 1 | BOOM | - | B T K Pf | 8 | 22 |
| 1 | BACKBEAT | 1 | SNARE | - | B T K Pf | 8 | 22 |
| 2 | HI-HAT 8THS | 1 | HATS | - | B T K Pf | 16 | 45 |
| 3 | KIT GROOVE | 2 | SNARE | - | B T K Pf | 16 | 58 |
| 4 | WITH RIMSHOT | 2 | RIM | - | B T K Pf | 18 | 65 |
| 5 | LIP ROLL DRILL | 2 | HATS | lip_roll | B T lip_roll Pf | 16 | 58 |
| 6 | 808 THROAT | 2 | BOOM | throat_kick | throat_kick T K Pf | 18 | 65 |
| 7 | FAST HATS | 2 | HATS | fast_hats | B fast_hats K Pf | 24 | 86 |
| 8 | INWARD SNARE | 2 | SNARE | inward_k | B T K inward_k | 28 | 101 |
| 9 | INWARD BASS | 3 | BOOM | inward_bass | inward_bass T K Pf | 26 | 114 |
| 10 | CLICK ROLL | 3 | RIM | click_roll | B T click_roll Pf | 26 | 114 |
| 11 | UVULAR FINALE | 4 | BOOM | uvular_roll | uvular_roll fast_hats click_roll inward_bass | 30 | 156 |

Style counts: BOOM {0,6,9,11}, SNARE {1,3,8}, HATS {2,5,7}, RIM {4,10}. Dead code: `_patSyncoKick`, `_patOffbeatHat` (4050-4074) are not referenced by HERO_LESSONS.

### 2c. Style cycle (4177-4188)
`STYLE_BEATS = { BOOM:'HATS', HATS:'RIM', RIM:'SNARE', SNARE:'BOOM' }` (key beats value). `STYLE_COLORS = BOOM #CC2200, HATS #22d3ee, RIM #a78bfa, SNARE #fbbf24`.
`styleMatchup(you, them)`: either style missing -> 1; `STYLE_BEATS[you]===them` -> **1.5**; `STYLE_BEATS[them]===you` -> **0.7**; else (mirror / two steps away) **1.0**.
`counterStyleOf(s)` (18079) = key `k` with `STYLE_BEATS[k]===s`: to counter BOOM use SNARE; HATS<-BOOM; RIM<-HATS; SNARE<-RIM.

### 2d. JUDGES (142-148) in fixed order
| i | name | bias | emoji | visual hair/shirt (JUDGE_LOOKS 16459) |
|---|---|---|---|---|
| 0 | Tek | technicality | ⚙️ | #22d3ee / #0e3a4a |
| 1 | Mel | musicality | 🎵 | #a78bfa / #3a2a5a |
| 2 | Origi | originality | ✨ | #fbbf24 / #5a4030 |
| 3 | Showtime | showmanship | 🎭 | #fb7185 / #4a1820 |
| 4 | Wildcard | random | 🎲 | #84cc16 / #2a3a1a |

### 2e. Constants (17910-17912, 17041)
`BATTLE_BPM = 115` (beat = 521.74 ms), `ROUND_SECONDS = 12`, `TOTAL_ROUNDS = 4`, `FINISHER_THRESHOLD = 8`.

---

## 3. COMPONENT STATE (17878-17909)

`phase` ('intro'), `countdownVal` (3 | 2 | 1 | 'BEATBOX!'), `judgeHearts[5]` (cosmetic), `rps` ({player,opp,outcome}|null), `result` ({won, finalP, finalO, judgeVotes[], playerVotes}|null), `revealedJudges` (0..5), `activeSide` ('P'|'O'|null), `playerFirst` (true = player LOST RPS and performs rounds 1,3), `currentSound` (lesson name shown as floating text), `currentSoundColor`, `liveScore {p,o}`, `timeLeft` (HUD timer, visual only), `comboLabel {text,key}`, `streak`, `finisherArmed`, `finisher {name,bonus,peak}|null`, `playerPatternIdxs` / `oppPatternIdxs` = `[[a,b],[c,d]]` (lesson indexes; first index = turn slot, second = half A/B).
Refs: `eventTimers[]` (all setTimeouts; cleared on every round start and on unmount), `playerScoreRef`, `oppScoreRef` (true running totals; `liveScore` mirrors them), `playerHeroRef` (DOM ref for scroll).
`opponent = char._opponent`; if missing: effect `go('bar')` and render `null` (18032-18041).

## 4. PHASE STATE MACHINE (phase strings)

```
intro --START BATTLE--> rps --(tie: replay)--> rps
rps --win/lose--> tactical
tactical --LOCK IN--> [player won RPS] countdown1
                  \-> [player lost RPS] oppReveal --BRACE YOURSELF--> countdown1
countdownN (3.3 s) -> roundN -> countdown(N+1) ... round4 -> judging -> result -> (CONTINUE) finishBattle -> go('bar')
```
Any time: top-left `Forfeit` button -> clear timers, delete `char._opponent`, `go('bar')` (no penalty).
`phase` regexes: `^countdown[1-4]$`, `^round[1-4]$`.

---

## 5. ROUND STRUCTURE & COMBO BUILDING (17914-17984)

**sideForRound(n)** (n=1..4): `isA = n odd`; if `playerFirst`: A=Player, B=Opponent; else A=Opponent, B=Player. So the RPS LOSER is "A" and performs rounds 1 and 3; the RPS WINNER performs rounds 2 and 4 (last word).
**turnSlotForRound(n)** = `n <= 2 ? 0 : 1`. Each side's picks `[[a,b],[c,d]]` index = slot, i.e. rounds 1-2 use slot 0 for both sides, rounds 3-4 use slot 1.
(UI labels "Your turn #1/#2" in tactical = slot 0/1, NOT chronological round, for the RPS winner turn #1 is round 2.)

**combineLessons(idxA, idxB)** (17925-17953): `a = HERO_LESSONS[idxA]` (null -> null); `lanes = a.lanes || HERO_LANES`.
1. `aHalf` = a.pattern notes with `beat < 8` (unchanged, beats 0..7.x).
2. If `idxB != null && idxB !== idxA`: `bHalf` = b.pattern notes with `beat < 8` **and `b-note.sound` in A's lane set**, shifted to `beat + 8`; name `"${a.name} → ${b.name}"`. Notes of B whose sound is not one of A's 4 lanes are DROPPED silently.
3. Else (same index twice): `bHalf` = A's own `beat<8` notes shifted +8; name = a.name.
4. Result `{ name, desc: a.desc, tier: max(a.tier||1, b?.tier||1), requires: a.requires, lanes, pattern: aHalf+bHalf, patternBeats: 16 }`.
Note the tier takes the max of both even if all of B's notes were dropped (see section 14 oddities).

**lessonForRound(n)** = `combineLessons(...ids)` where `ids = (side==='P' ? playerPatternIdxs : oppPatternIdxs)[slot]`.

**lessonValue(lesson)** = `round(lesson.pattern.length * (1 + tier*0.4))` (note count INCLUDING both halves). Range over all 144 (A,B) combos: 21..156; note count 8..60. Full A x B value matrix (rows A, cols B; idx 0-11):
```
A\B  0   1   2   3   4   5   6   7   8   9  10  11
 0  22  22  34  43  47  36  36  29  58  62  70  21
 1  22  22  34  43  47  36  36  29  58  62  70  21
 2  34  34  45  58  61  50  50  43  72  79  88  42
 3  43  43  58  58  61  50  50  43  72  79  88  42
 4  47  47  61  61  65  54  54  47  76  84  92  47
 5  43  43  58  58  58  58  50  43  65  79  88  42
 6  32  40  61  54  58  47  65  40  68  84  84  47
 7  58  58  43  58  61  58  50  86  58  62  70 104
 8  65  58  79  72  76  65  65  58 101  97 106  73
 9  57  66  92  84  88  75  84  66 101 114 101  78
10  75  75  92  92  92  84  84  75 101 101 114  83
11  78  78  78  78  78  78  78 120  78  94  83 156
```

**styleMatchupForRound(n, asPlayer)** (17972-17984): `me = (asPlayer ? playerIdxs : oppIdxs)[slot]`, `them = (asPlayer ? oppIdxs : playerIdxs)[slot]`; `sum_i styleMatchup(HERO_LESSONS[me[i]].style, HERO_LESSONS[them[i]].style)` over the 2 halves / 2. Pairing is A-with-A and B-with-B of the SAME slot (so slot 0 of each side faces the other side's slot 0 regardless of who performs first). Possible values {0.7, 0.85, 1.0, 1.1, 1.25, 1.5}. Returns 1 if picks missing.

---

## 6. WHICH PATTERNS THE PLAYER MAY PICK (18003-18030)

- `isPlayableForPlayer(i)`: `i <= (char.tecLessonsCompleted||0)` (progression; index == completed is allowed, i.e. the NEXT unlearned lesson is usable) AND (`!lesson.requires` OR `char.sounds` includes `lesson.requires`) - uses OWNED sounds (`char.sounds`), not equipped. Same gating as Technicality training. In training a lesson unlocks by merely FINISHING it at any accuracy (line 14079-14090: `tecLessonsCompleted = max(.., idx+1)`).
- A fresh char (completed 0) can only play lesson 0.
- **computeDefaultPlayerPicks**: `p = playable list`; `a=p[0]??0, b=p[1]??a, c=p[2]??b, d=p[3]??c`; returns `[[a,b],[c,d]]` (lowest-index lessons => weak defaults; the player is expected to change them).
- **computeOppPicks** (called in `startBattle`): pool `[0..maxIdx]` where `maxIdx = max(0, min(11, opp.level+1))`; four independent uniform picks `[[r,r],[r,r]]`. NOTE: opponent ignores `requires`/ownership.

## 7. OPPONENT COUNTER RE-ROLL (18079-18117)

`oppCounterReroll(playerPicks, opp)`: `skill = typeof opp.counterSkill === 'number' ? it : 0.5`; for each of the 4 player picks (`[0][0],[0][1],[1][0],[1][1]` -> output positions in same layout): `desired = counterStyleOf(HERO_LESSONS[playerIdx].style)`; with probability `skill` AND `desired` exists, choose uniformly among pool lessons whose style === desired (if none exist in the pool, fall through); otherwise uniform random from the pool.
Pool limitations: Pig Pen/Joel (0-2) have no RIM, so they can never counter a SNARE pick; BOOM pick->SNARE idx1; HATS pick->BOOM idx0; RIM pick->HATS idx2.
`lockInTactical` (18108): `if (playerFirst)` (player LOST RPS) -> `setOppPatternIdxs(oppCounterReroll(playerPatternIdxs, opponent))`, phase `oppReveal`; else straight to `countdown1` with the opponent's ORIGINAL random picks (the player already saw and countered them). The comment in NPCS (line 89: "when player wins RPS, opponent re-rolls...") is inverted vs the code.

---

## 8. INTRO PHASE (18456-18475)

- Title `BATTLE TIME` (Bebas Neue, amber, 3xl). `PixelStage` idle (no sound, no judges' votes).
- Two stat cards: `<NAME>` amber / `<OPP>` red, with `M{mus} T{tec} O{ori} S{sho}`.
- Button `START BATTLE ▶` -> `startBattle` (18071): `getAudioCtx()` (unlocks/resumes audio on the user gesture), set default player picks, opp random picks, phase `rps`.

## 9. ROCK-PAPER-SCISSORS PHASE (18043-18068, 18584-18613)

- Title `ROCK PAPER SCISSORS`, subtitle `Winner sees opponent's plan · loser gets countered`. Three big buttons ✊ ✋ ✌️ with corner numerals 1/2/3; keyboard 1/2/3 (or Digit1-3) active only while `phase==='rps' && !rps` (via `onGlobalKey`: ignored while typing in inputs, with modifiers, or on key repeat).
- `playRps(choice)`: opponent choice uniform random of rock/paper/scissors (no stat influence, P(win)=P(lose)=1/3, P(tie)=1/3). Outcome win/lose/tie. Shows both emojis + `vs`, and text: win `YOU WIN! READ THEIR PLAN` (amber), lose `YOU LOSE — THEY'LL COUNTER` (red), tie `TIE — REPLAY` (grey).
- After 1400 ms: tie -> `setRps(null)` (choose again); else `setPlayerFirst(outcome === 'lose')`, phase `tactical`. (No sound.)

## 10. TACTICAL / "PREP YOUR SET" PHASE (18477-18582)

Shown only when both pick arrays exist. Header `PREP YOUR SET`; sub-header: won RPS -> `You won RPS — opponent's plan revealed · counter their style`; lost -> `You lost RPS — opponent will counter your plan`.
- Cycle legend row: `BOOM › HATS › RIM › SNARE › BOOM(dim)` in style colors.
- For each turn slot 0 and 1 a card `Your turn #1/#2` with `vs <badgeA> + <badgeB>` = opponent's style badges if `revealOpp = !playerFirst` (player won RPS) else `?? + ??`.
- For each half A/B: label `Pattern A: <lesson name> [style badge]` and tag: hidden -> `· hidden` (grey); revealed -> `✓ counters` (green #22c55e, matchup>1), `✗ countered` (red #ef4444, <1), `· neutral` (grey). A horizontally scrollable row of 12 buttons `#1..#12`: locked ones disabled with `🔒`, selected = amber highlight, when revealed unselected playable buttons get a green/red border by the matchup of THAT lesson's style vs the opponent's same-slot same-half style (opp half index `oppPatternIdxs[turn][half]`). Only the selected lesson's name is shown; no per-lesson score/value is displayed.
- Picks change `playerPatternIdxs[turn][half]` via `setPick`. Same lesson twice in a turn is allowed (plays the same 8 beats twice).
- Button `LOCK IN ▶` -> `lockInTactical` (section 7).

## 11. oppReveal PHASE (only if player lost RPS) (18615-18656)

Title `<OPP NAME> ADAPTS` (red); sub `Counter skill {round(counterSkill*100)}% · they re-picked to counter your set`. For turn 1/2 a card with `You: [style]+[style]` and `Them: [style]+[style]`. Button `BRACE YOURSELF ▶` -> `countdown1`. (The player cannot change picks anymore; opponent saw them.)

## 12. COUNTDOWN (18196-18225, 18686-18704)

- On entering `countdownN`: `countdownVal=3` + `playBeep(false)` (440 Hz sine 0.2 s); t=800 ms -> 2 + low beep; 1600 ms -> 1 + low beep; 2400 ms -> `'BEATBOX!'` + `playBeep(true)` (880 Hz, 0.42 s); 3300 ms -> `setPhase('round'+N)`. Total 3.3 s. Timers cleaned on phase change.
- Overlay over the stage (bg stone-950/70 + blur): `Round N / 4`, big number (stone-100 8xl; the BEATBOX! word amber 6xl) with `countdownPop` 0.7 s scale animation; once BEATBOX! shows: `<NAME>'s turn` (the performer of that round: player's name or opponent's).
- Reset logic (18212-18225): at `countdown1` zero `playerScoreRef`, `oppScoreRef`, `liveScore`. At EVERY countdown: `streak=0`, `finisherArmed=false`, `finisher=null`.
- HUD during countdown shows timer = 12, streak 0, no hearts, no combo label, no currentSound.
- During a countdown that precedes a PLAYER round the BeatboxHero is already mounted (inactive, "GET READY" banner) so lanes + pads are visible; during an opponent round's countdown nothing but the stage is shown.

## 13. PLAYER ROUND (18178-18193, 18311-18341, 18713-18732; BeatboxHero 4489+)

Setup `startPlayerRound(lesson, char.color)`: clears all `eventTimers`; `activeSide='P'`; `currentSound = lesson.name`; `timeLeft=12`; `comboLabel={text: lesson.name, key: Date.now()}` -> a "🔥 <combo name>" tag pops over the stage for 1.6 s (e.g. `BOOM BASIC → BACKBEAT`); starts 12 one-second `timeLeft` ticks (12->0). **`timeLeft` has NO gameplay effect** - the round ends only when BeatboxHero finishes (see below), which happens ~9.75 s after round start, so the HUD clock reads ~3 when the round completes, keeps ticking (2, 1) during the 1.5 s end-of-round hold (the 1 s ticks are only cleared when the next round starts) and is reset to 12 by the next countdown.
Rendered `BeatboxHero` props: `key=p-r{N}`, `mode="battle"`, `active={!isCountdown}`, `bpm=115`, `lessonOverride=<combo>`, `accuracyBoost = hasGear('premium_headphones') ? 1.25 : 1` (the `mic` gear's x1.15 used in training is NOT applied in battle), `inputMode` default `'tap'` (no mic mode in battle), `onStreak=handleStreak`, `onLessonComplete=(idx, accuracy, info)=>handlePlayerRoundComplete(N, accuracy, info)`.

BeatboxHero battle-mode rules (outside my range but the core of the player's skill; lines 4517-4650, 4805-4880):
- 4 lanes = `lesson.lanes` (= A's lanes), pads show sound label + key hint A S D F; tap = pointer-down on pad or keys A/S/D/F (ignores repeats). Tap also plays that sound (`playGameSound`).
- Timeline: `startTime = now + 1400 ms` (note lookahead), `beatMs = 60000/115 = 521.74`, pattern 16 beats = **8347.8 ms**; notes at `note.beat * beatMs`; `totalMs = 8347.8`. Round completes when `songT >= totalMs` i.e. **~9.75 s after the round starts**.
- Tap judging: among UNJUDGED notes in the tapped lane pick the one with minimal `|note.time - songT|`; must be `<= HIT_GOOD_MS` (180 ms, x boost). `<= HIT_PERFECT_MS` (110 ms, x boost) = **perfect**, else **good**. With headphones: 137.5 / 225 ms. A tap with no eligible note = **stray tap = miss** (+ breaks streak). A note with `time + HIT_GOOD_MS < songT` still unjudged is **auto-missed**.
- Streak: perfect -> `streak++` (`bestStreak=max`), `onStreak(streak)`; a good hit, stray tap or missed note -> `streak=0`, `onStreak(0)`.
- `hits` = perfect+good, `misses` = strays + missed notes; **accuracy = hits/(hits+misses)** (0 if no taps), reported once via `onLessonComplete(idx, accuracy, {bestStreak, perfects})` (`completionFired` guard; `perfects` unused by BattleScreen).
- No fail state: accuracy 0 is allowed and gives a score of 0 for that round.
- Canvas 320x220, bottom strike line; BeatboxHero HUD under the pads shows `HITS n · MISS n · ACC xx%`.

**handlePlayerRoundComplete(roundN, accuracy, info)** (18311-18335):
1. `lesson = lessonForRound(roundN)`; `score = playerRoundScore(lesson, accuracy, roundN)`; `total = playerScoreRef + score`.
2. `peak = info.bestStreak || 0`; `armed = peak >= 8` -> `bonus = round(score*0.5 + peak*4)`; `total += bonus`; `setFinisher({name: finisherMoveName(), bonus, peak})`.
3. `playerScoreRef = total`, `liveScore.p = total` (the HUD bar jumps in ONE step at the end of the round; opponent bars tick progressively).
4. After **2600 ms if armed else 1500 ms**: `activeSide=null`, clear combo/finisher/armed/streak, `phase = roundN<4 ? 'countdown'+(N+1) : 'judging'`.

## 14. SCORING FORMULAS (17964-18001) - exact

```
statMult(side)  = 1 + (side.tec + side.mus) / 80            // ori & sho NOT used here
base            = lessonValue(combo)                         // round(noteCount*(1+0.4*tier))
counter         = styleMatchupForRound(n, asPlayer)          // mean of 2 half-matchups
playerRound     = round( base * accuracy * statMult(char) * counter )
oppRound        = round( base * focus * statMult(opp) * counter ),  focus = 0.7 + (opp.tec/60)*0.3
finisherBonus   = round( playerRound*0.5 + peakStreak*4 )    // only if peakStreak >= 8
finalP = sum(player round scores + bonuses) over 2 rounds ; finalO = sum(opp round scores) over 2 rounds
```
Notes/oddities:
- Player `ori`/`sho`, opponent `ori`/`sho`, `char.level/mood/energy/hunger`, equipped sounds and `SOUND_CATALOG.stamina/base/stat` are not used in round scoring. `sho` and distinct-sound-count enter only through judges.
- Opponent has NO accuracy roll: its performance varies only through its random picks and the style counter factor. `focus` comment says "(was 0.55-0.95)"; with tec 7..32 focus is 0.735..0.86 and can exceed 1 only for tec > 60.
- Opponent score accrues linearly: 10 ticks at every 1200 ms of the 12 s round (`start + (final-start)*pct/10`, rounded each tick); the final tick equals `start + final`.
- **Combo lane filtering oddity**: B's notes outside A's lanes are dropped (e.g. A=11 UVULAR with B=0..6 keeps nothing of B -> value 78 not 156, and note count falls), but the `tier` still maxes with B (A=0,B=11 gives value 21: 8 notes x 2.6). Using A with a rich lane set is not obvious to the player.
- Worked examples: fresh 5/5 char, picks idx 0/0, 100% acc -> `round(22*1.125)=25` per round (50 total) vs Pig Pen average 51.6. 20/20 char, lesson 11/11 (156), 90% -> `round(156*.9*1.5)=211`. Finisher at score 100 & peak 8 -> +82 (peak 20 -> +130).

## 15. OPPONENT ROUND (18119-18176, 18735-18745)

`playOpponentRoundPattern(lesson, '#CC2200', onDone, roundN)`: clear timers; `activeSide='O'`; `timeLeft=12`; `comboLabel=null`; `currentSound=lesson.name` (floating text over the opponent, red).
- **Judge hearts (cosmetic)**: for every note of the combo (beat*521.74 ms < 11 900 ms - always true) a 30 % chance schedules a `setTimeout` at the note's time that adds +1 to a random judge (`floor(random*5)`) in `judgeHearts` -> PixelStage emits a floating pixel heart + 5 sparks at that judge's seat (x=30+i*30, y=20). Hearts are never read by the judging logic. They are not delayed by BeatboxHero's 1.4 s lookahead, so they run ~1.4 s ahead of the audible notes. No hearts are produced for player rounds at all.
- **Score**: `final = oppRoundScore(lesson, roundN)`; 10 ticks, one per 1.2 s, update `oppScoreRef` and `liveScore.o`.
- **Timer**: `timeLeft` ticks 12 -> 0 each second; at 12 000 ms `currentSound=null; activeSide=null; comboLabel=null; onDone()` -> next phase (`countdown N+1` or `judging`).
- Visual/audio: a spectate-mode `BeatboxHero` (`key=o-r{N}`, `active`, `bpm=115`, `lessonOverride`) renders ghost notes scrolling (outlined, "OPPONENT · WATCH") and plays each note's sound at the strike line (`playGameSound`); no pads, no HUD, no input. Its pattern lasts ~9.75 s of the 12 s round.

## 16. STREAK / FINISHER (state 17891-17899, 18337-18341, HUD 17122-17136, stage 16884-16937)

- Streak = live consecutive perfect hits of the current player round (resets to 0 at every countdown and at round end).
- `handleStreak(current)`: `setStreak(current); if (current >= 8) setFinisherArmed(true)` - armed LATCHES until the end of the round even if the streak breaks. The bonus itself keys off `info.bestStreak >= 8` at completion (equivalent).
- HUD (BattleHUD): `×N` next to the player name; `🔥 ×N` and amber-400 from 4+, amber-300 pulsing from 8+. Finisher gauge row (visible while `streak>0 || armed`): `FINISHER` / `⚡ FINISHER ARMED`, right label `min(streak,8)/8 perfects`, bar width `min(100, streak/8*100)%`, glow when armed.
- Stage aura (PixelStage), player side only: from streak 4: intensity `min(1,(ps-4)/6+0.4)`, radius `16+min(8,ps-4)`, halo `#f97316` @0.18 and `#fbbf24` @0.30, `7+min(6,ps-4)` pixel flame tongues orbiting + 4 rising embers; from 8: white flash rect pulse (every 12 frames half) and floating text `⚡ ARMED`.
- Finisher splash (`FinisherSplash` over the stage, 2.6 s): red/orange canvas with pulsing rings, scrolling speed lines, rising sparks, flame strip; texts `FINISHER!` (flickering), `★ <MOVE NAME> ★`, `<peak> PERFECT IN A ROW · BONUS +<bonus>`; CSS `finisherSlam` 0.4 s.
- **finisherMoveName()** (18303): `slot0 = char.oriSlots?.[0]`; `hasNotes = slot0.tracks.some(t => t.cells.some(Boolean))`; if `!hasGear(char,'mpc') || !hasNotes` -> `'MEGA COMBO'`; else `char.name ? NAME.toUpperCase()+"'S SIGNATURE" : 'SIGNATURE COMBO'`. Cosmetic only (the numeric bonus does not depend on it).
- No sound effect is played for the finisher.

## 17. BATTLE HUD (BattleHUD 17043-17139; used in round/countdown phases)

- Row: player name + streak | circular timer (`timeLeft`) | opponent name; below each, a score bar (`min(100, score/400*100)%`, transition 0.3 s; amber for player, red-600 for opp, no numbers) and up to 5 small boxes with the first letter of the category of `char.equipped.slice(0,5)` / `opponent.sounds.slice(0,5)` (cat of SOUND_CATALOG: Kicks, Hats, Snares, Liproll, Bass, Scratch, Whistles, Clicks) - purely decorative.
- HYPE meter (symmetric bar from center): `gap = pScore - oScore`; `hypePct = clamp(gap/80*100, -100, 100)`; fill amber to the right if >=0 (width `hypePct/2 %`), red to the left otherwise. Label `_hypeLabel(gap)`:
  gap>=60 `CROWD GOES WILD` (#fbbf24); >=25 `YOU'RE COOKING` (#fbbf24); >=8 `EDGE: YOU` (#a3e635); >-8 `NECK AND NECK` (#a8a29e); >-25 `OPP HAS THE EDGE` (#fb923c); >-60 `SHAKE IT OFF` (#fb7185); else `BURIED` (#dc2626).
- Because the opponent's score ticks gradually and the player's arrives in one lump at round end, the hype meter swings accordingly (and the very first round shows the first performer 0-vs-X).
- Round caption under the stage (non-countdown): `ROUND {N}/4 · {performer name} · {combo name}`.

## 18. STAGE VISUALS (PixelStage 16752-17023) used by BattleScreen

Canvas 200x120 logical, x3. Back wall + stars, 2 corner spotlights, a judges' bench at y=30 with 5 judges at x=30+i*30, stage floor, crowd silhouette (hands raised when `activeSide` set, every 15 frames), player at (60,95) facing right, opponent at (140,95) facing left (look from `OPP_LOOKS[name]` - Pig Pen mohawk+shades brown shirt `#5a4030`; Joel `#84cc16` short; CeDe `#3b82f6` mohawk+shades; Sikker `#a78bfa` long; Alim `#f97316`; Olexinho `#94a3b8` spike+shades; FatboxG `#fbbf24` fade; default `#CC2200`). Active performer bobs and mouth animates; each new `currentSound` emits 10-dot expanding rings in the sound color from the active side. `FloatingSound` shows the combo name in caps above the active side (soundFloat 1.2 s). Judges show a vote marker when revealed (green up-chevron for P, red down for O).

---

## 19. JUDGING (18344-18393, 18758-18777)

Triggered once when `phase==='judging'` (guard `result` null). Inputs: `finalP = playerScoreRef`, `finalO = oppScoreRef`.
- `uniqueSounds(side)` = size of the Set of `note.sound` over ALL notes (all 16 beats, not just beats<8 and not lane-filtered) of EACH of the side's 4 picked lessons (`oppPatternIdxs.flat()`, `playerPatternIdxs.flat()`), i.e. the distinct sound keys among the 4 picks (max 11 across the 12 lessons: B,T,K,Pf,lip_roll,throat_kick,fast_hats,inward_k,inward_bass,click_roll,uvular_roll).
- For each judge, with `p=finalP`, `o=finalO`:
  - technicality: `p *= 1 + char.tec/60`; `o *= 1 + opp.tec/60`
  - musicality: `p *= 1 + char.mus/60`; `o *= 1 + opp.mus/60`
  - originality: `p *= 1 + uniqueSounds(player)/8`; `o *= 1 + uniqueSounds(opp)/8` (**uses the count of distinct sounds in the picked patterns, NOT the `ori` stat**)
  - showmanship: `p *= 1 + char.sho/50`; `o *= 1 + opp.sho/50`
  - random (Wildcard): `p *= 0.85 + rand*0.3`; `o *= 0.85 + rand*0.3` (two independent rolls, +-15 %)
  - `vote = p > o ? 'P' : 'O'` (**exact tie -> opponent**); stores `{judge, vote, pScore: round(p), oScore: round(o)}` (the scaled scores are never displayed).
- `playerVotes` = number of 'P'; `won = playerVotes >= 3`. `result = {won, finalP, finalO, judgeVotes, playerVotes}`.
- Because bias multipliers differ per side, the player can win the raw total yet lose the vote count and vice versa; a low-stat player with a big raw lead is carried by tec/mus/sho judges only to the extent of the ratio of multipliers (e.g. 1+7/60 = 1.117 for Pig Pen vs 1.083 for a 5-stat player).
- Reveal: stage `PixelStage` with `judgeVotes` and `revealedJudges`; a 5-box row (emoji, judge name, `YOU`/`OPP`) fills one box per **700 ms** (border amber for YOU, red-700 for OPP); when `revealedJudges === 5`: +200 ms `playWinSting()`/`playLossSting()`, +800 ms phase `result`. Total judging screen time = 5*700 + 800 = **4.3 s**. Header `JUDGES VOTE`.

## 20. RESULT SCREEN (18779-18797)

Giant `VICTORY` (amber) / `DEFEAT` (red), `{playerVotes} - {5-playerVotes}`, Panel "Breakdown": `Your score` (finalP), `Opponent` (finalO), `Reward $<win: opp.reward | loss: floor(opp.reward*0.1)>`, `XP gained +60/+20`. Fans are not listed. Button `CONTINUE →` -> `finishBattle`.
Sounds: win sting (triangle C5-E5-G5-C6+E6 hold 0.7 s) or loss sting (sine A4 -> F#4 -> D4, 0.3/0.55/0.85 s), see section 21.

## 21. finishBattle - REWARDS, PENALTIES, STATE WRITES (18395-18447)

Inside one `setChar(c => ...)`:
```
won     = result.won
reward  = won ? opp.reward : floor(opp.reward * 0.1)
fans    = won ? floor(opp.reward / 10) : 1
xp      = won ? 60 : 20
t       = passMinutes(c, 90)                    // minutes += 90; mood decays passively (_moodDrainFor: 0.3/h, +0.5 if hunger<30, +0.5 if energy<30, +1 each at 0)
cash        += reward
followers   += fans
energy       = max(0, energy - 30)              // paid here, win or lose
mood         = clamp(t.mood + (won ? +15 : -10), 0, 100)
xp          += xp
defeated     = won && !includes(opp.name) ? [...defeated, opp.name] : defeated
lastBattleDay= c.day                            // 7-day cooldown (win or loss)
stats.sho   += hasGear('wardrobe_refresh') ? 1 : 0   // every battle, win OR lose
daily.battleWins += won ? 1 : 0                 // NOT weekly (see gotchas)
storyFlags: Pig Pen only: win -> pigPenWins++ and pigPenBattled=true; loss -> pigPenBattled=true
delete _opponent
-> checkLevelUp(newC)  (xp need = level*100, one level per call; applySoundUnlocks; applyAchievements)
```
Reward table (win/loss): Pig Pen $20 +2 fans / $2 +1; Joel $25 +2 / $2 +1; CeDe $50 +5 / $5 +1; Sikker $100 +10 / $10 +1; Alim $175 +17 / $17 +1; Olexinho $350 +35 / $35 +1; FatboxG $750 +75 / $75 +1. XP 60 win / 20 loss (crew battle gives only 30/12).
Then: `showToast(won ? "🏆 WIN! +$"+opp.reward : "You lost. Train harder!", won ? 'win' : 'bad')` and `go('bar')`.
Not changed by solo battles: hunger, `heat`, stats other than sho, `followers` never lost, no cash penalty, no equipment loss. Mood/energy/hunger do not influence battle performance.

Side effects fired from `checkLevelUp` (outside range, 11385): toast `LEVEL UP! → n` + `playLevelUp()`; sound unlocks (toasts `🔓 Unlocked: <name>`, `playUnlock`), achievements (fanfare modal + `playAchievement`). Battle-driven ones:
- Sounds: `throat_kick` (pigPenWins>=1), `inward_bass` (defeated Sikker), `laser` (defeated Alim), `uvular_roll` (defeated FatboxG) - auto-equip if fewer than 5 equipped. Owning `throat_kick`, `inward_bass`, `uvular_roll` is exactly the `requires` of lessons idx 6 (808 THROAT), 9 (INWARD BASS) and 11 (UVULAR FINALE), so battle wins widen the player's pattern pool (`laser`/`d_low` have no lesson; `inward_k` idx 8, `lip_roll` idx 5, `fast_hats` idx 7, `click_roll` idx 10 unlock from jams / ori>=10 / open mics / 500 followers instead).
- Achievements: `first_saturday` ("Show up to your first battle" - only triggered by a Pig Pen battle via `pigPenBattled`), `first_blood` (>=1 defeated), `pen_to_penny` (pigPenWins>=2), `the_crew` (7 defeated), `penny_revealed`.
- Other unlocks keyed off battle state: outfit `red_devil` (pigPenWins>=2), festival eligibility (>=3 defeated, + other conditions), Crystix meet (>=2 defeated), crew battle gates (3/5/7 defeated), daily challenge `battle_win` (Saturday, +$30, claimed manually), bad-sleep reasons `battle`/`replay_loss`.

**Penny reveal** (18404-18446): `flags.pigPenWins === 2 && !flags.pennyReveal` sets `triggerPennyReveal`; after the bar transition, `setTimeout(600 ms)` -> `playCutscene({speaker:'PIG PEN', speakerColor:'#fb7185', beats:[{drawScene: drawPennyRevealScene(ctx,fc,lookFromChar(char)), lines:[ "you again. sit down.", "...", "y'know my mum used to call me Penny.", "...don't tell anyone that.", "call me Penny too if you want. just... not in front of the others." ]}]}, 'pennyReveal')` (the key sets `storyFlags.pennyReveal = true` when the cutscene ends). Fires only on the exact 2nd win, so if missed it never replays. The flag is read from a closure variable assigned INSIDE the setState updater - works only when React runs the updater eagerly (see gotchas).

## 22. ADJACENT SYSTEMS (NOT in BattleScreen - listed so the rebuild does not look for them here)

**Crew battle (3v3)** - `CREWS` (103-140), `resolveCrewBattle` (1152), `doCrewBattle` (BarScreen 15768). No BattleScreen, no rhythm game; a stat check shown as a cutscene (`drawCrewBattleScene`, speaker `CREW BATTLE — WIN/LOSS`, lines `Round i: WON/LOST vs <name> · our–their`, `Final: a–b.`, "You took the building. Your crew is howling. Drinks tonight are free." / "You held your own. Not enough. Next round, next month."). Unlock: panel appears at >=3 defeated; crew gates `minDefeated` 3 (PEN PALS, Pig Pen+Ras-T+Kiko, $80/15 fans), 5 (VPN VETS: Klem, Niko-1, Boomer, $200/35 fans, flag `crewVpn`), 7 (WORLD CHAMPS: Vex, Mir, TK-9, $800/120 fans, flag `crewChamps`). Resolve: `ourTotal = mus+tec+ori+sho`; `moodMod=(mood-50)/4`; `allyBoost = 5 + min(2,defeated)*3`; `ourPerRound = floor(ourTotal*0.6)+allyBoost`; 3 rounds: `ourRoll = ourPerRound + moodMod + (rand*20-10)` vs `theirRoll = floor(theirTotal*0.7) + (rand*20-10)`; round won if `ourRoll >= theirRoll`; best of 3 (`ourScore > theirScore`). Needs energy>=30 and not sick. Win: energy-30, +90 min, mood+12, cash+reward.cash, followers+reward.followers, xp+30, heat+4, flag `crew_<id>_won` (+ reward.flag), lastBattleDay=day; loss: mood-10, cash floor(0.2*reward), followers-3 (floored at 0), xp+12, `crew_<id>_lost`. Toast `Crew win! +F fans, +$C` / `Crew loss · -3 fans, mood -10`.
**Festival (BBBWC2027)** - `runFestival(path)` (15594): path A "Solo Battle Gauntlet" ("3 escalating opponents · highest cash · classic battle UI"), B "Collab with Crystix" (requires `crystixMet`), C "Solo Showcase". All three call the same RNG: `winOdds = min(0.95, 0.25 + (mus+tec+ori+sho)/120)`; win cash 600/350/450 (A/B/C), fans 100/200/130, loss $80 / 25 fans; energy -50, mood +30/-10, xp +200/+80, `festivalState='done'`, flags `festivalPlayed`, `festivalWon`. **Path A never actually uses BattleScreen despite its description.** Eligibility `festivalEligible` (690): >=3 defeated, openMicCount(+showcase)>=5, all four stats>=8, day>=25.

## 23. LIFECYCLE, CLEANUP, MOBILE LOCKS

- All round timers live in `eventTimers`; cleared when a new round starts, on Forfeit, and on unmount (18037-18039). Countdown timers are cleaned by their effect.
- Forfeit (18451): `Forfeit` text button with ArrowLeft icon (top-left, every phase incl. result): clears timers, deletes `_opponent`, `go('bar')`. No cost/penalty/cooldown.
- Footer nav is hidden while `screen==='battle'` (11707).
- Scroll lock for player rounds (18232-18281): on a player round start `requestAnimationFrame` -> `playerHeroRef.scrollIntoView({smooth, block:'center'})`; sets `html`/`body` overflow hidden, overscroll none, `html.height=100%`, body `touch-action:none`, and a non-passive `touchmove preventDefault` on the player-hero wrapper; restored on cleanup. Wrapper style `touchAction:none; scrollMarginTop:12; overscrollBehavior:none`. (DOM-only concern; irrelevant in Phaser except for preventing page scroll/pull-to-refresh on touch.)
- Hooks after an early `return null` (18041) violate the rules of hooks; works only because `opponent` never changes during the component's lifetime.

## 24. SOUNDS / TEXT INVENTORY

Sounds (WebAudio, no files): `playBeep(false)` 440 Hz sine ~0.2 s x3 at countdown 3/2/1; `playBeep(true)` 880 Hz 0.4 s at BEATBOX!; pad taps/opponent notes via `playGameSound` (HERO_SOUNDS B/T/K/Pf with optional per-slot recorded samples, else synth; catalog sounds for lip_roll etc.); `playWinSting` (17643: triangle C5 523.25 @0, E5 659.25 @0.14, G5 783.99 @0.28, C6 1046.5 + E6 1318.5 @0.42 for 0.7 s); `playLossSting` (17656: sine 440 @0 /0.30 s, 369.99 @0.20 /0.55 s, 293.66 @0.50 /0.85 s). `getAudioCtx()` honors the global mute setting (returns null when muted). No finisher/RPS/hit-grade/judge-reveal/vote sounds; no music change.
Notable strings: `BATTLE TIME`, `START BATTLE ▶`, `ROCK PAPER SCISSORS`, `Winner sees opponent's plan · loser gets countered`, `YOU WIN! READ THEIR PLAN`, `YOU LOSE — THEY'LL COUNTER`, `TIE — REPLAY`, `PREP YOUR SET`, `LOCK IN ▶`, `<NAME> ADAPTS`, `BRACE YOURSELF ▶`, `Round N / 4`, `BEATBOX!`, `<name>'s turn`, `OPPONENT · WATCH`, `YOUR TURN`, `GET READY`, `FINISHER!`, `⚡ FINISHER ARMED`, `JUDGES VOTE`, `VICTORY`/`DEFEAT`, `CONTINUE →`, toasts `🏆 WIN! +$N` / `You lost. Train harder!`.
Tutorials: BattleScreen has no tutorial/tooltip system. Rules are explained only by the phase subtitles above. Foxy tips and the `TUTORIALS` table (10796) mention only "sat = battle"; Pig Pen story lines (817-830, 1362-1415, mingle encounters) are driven by `pigPenChallenged/pigPenBattled/pigPenWins/pennyReveal`.

---

## 25. REBUILD NOTES - pure logic for a framework-free `battle.ts`

Constants: `BPM=115, ROUND_SECONDS=12, TOTAL_ROUNDS=4, LEAD_IN_MS=1400, FINISHER_THRESHOLD=8, PERFECT_MS=110, GOOD_MS=180, HP_BOOST=1.25`. Inject an `rng: () => number` everywhere for tests.

```ts
type Style = 'BOOM'|'HATS'|'RIM'|'SNARE';
interface Note { beat:number; sound:string }
interface Lesson { name:string; desc:string; tier:1|2|3|4; style:Style; requires?:string; lanes?:string[]; pattern:Note[] }
interface Combo  { name:string; tier:number; lanes:string[]; pattern:Note[]; patternBeats:16 }
type Picks = [[number,number],[number,number]];            // [slot][half]
const STYLE_BEATS: Record<Style,Style> = { BOOM:'HATS', HATS:'RIM', RIM:'SNARE', SNARE:'BOOM' };
const styleMatchup = (a?:Style,b?:Style)=> !a||!b ? 1 : STYLE_BEATS[a]===b ? 1.5 : STYLE_BEATS[b]===a ? 0.7 : 1;

function combine(L:Lesson[], iA:number, iB:number|null): Combo|null {
  const a=L[iA]; if(!a) return null; const lanes=a.lanes??['B','T','K','Pf'];
  const aHalf=a.pattern.filter(n=>n.beat<8).map(n=>({...n}));
  const b = iB!=null && iB!==iA ? L[iB] : null; let bHalf:Note[]; let name:string;
  if (b){ const set=new Set(lanes); bHalf=b.pattern.filter(n=>n.beat<8 && set.has(n.sound)).map(n=>({beat:n.beat+8,sound:n.sound})); name=`${a.name} → ${b.name}`; }
  else  { bHalf=a.pattern.filter(n=>n.beat<8).map(n=>({beat:n.beat+8,sound:n.sound})); name=a.name; }
  return { name, tier:Math.max(a.tier||1,b?.tier||1), lanes, pattern:[...aHalf,...bHalf], patternBeats:16 };
}
const lessonValue = (c:Combo|null)=> c ? Math.round(c.pattern.length*(1+c.tier*0.4)) : 0;
const sideForRound = (n:number, playerFirst:boolean)=> (n%2===1) === playerFirst ? 'P' : 'O';   // loser(A) performs 1,3
const slotForRound = (n:number)=> n<=2 ? 0 : 1;
function slotMatchup(L:Lesson[], me:Picks, them:Picks, slot:0|1){ let s=0; for(let h=0;h<2;h++) s+=styleMatchup(L[me[slot][h]]?.style, L[them[slot][h]]?.style); return s/2; }
const playerRound = (val:number, acc:number, tec:number, mus:number, counter:number)=> Math.round(val*acc*(1+(tec+mus)/80)*counter);
const oppRound    = (val:number, o:{tec:number;mus:number}, counter:number)=> Math.round(val*(0.7+(o.tec/60)*0.3)*(1+(o.tec+o.mus)/80)*counter);
const finisherBonus = (score:number, peak:number)=> peak>=8 ? Math.round(score*0.5+peak*4) : 0;
```
Step-by-step battle algorithm:
1. **Start**: require `energy>=30`, `equipped.length>0`, not on cooldown, opponent unlocked. `playerPicks = defaultPicks(playable)`, `oppPicks = rollOppPicks(rng, opp)` where pool = lessons `0..max(0,min(11,opp.level+1))`.
2. **RPS**: `ch = rng()*3|0`; tie -> repeat; `playerFirst = (player lost)`.
3. **Prep**: player edits `playerPicks[slot][half]` over playable lessons (`i<=tecLessonsCompleted && (!requires || sounds.includes(requires))`). If player WON RPS the UI may show `oppPicks` styles. On lock-in: if `playerFirst` -> `oppPicks = counterReroll(rng, playerPicks, opp)`; show oppReveal.
4. **Rounds n=1..4**: `side=sideForRound(n,playerFirst)`, `slot=slotForRound(n)`, `combo=combine(L, ...picks[side][slot])`, `val=lessonValue(combo)`. Opp: score fixed at start via `oppRound`, revealed gradually over 12 s. Player: run the rhythm lane for `16*60000/115 ms` (+1.4 s lead-in), compute `accuracy=hits/(hits+misses)` and `bestStreak`; `score=playerRound(...)`, `+finisherBonus`.
5. **Judging**: `votes = JUDGES.map(j => bias multipliers (section 19) -> p>o?'P':'O')`; `won = votes.filter(P).length>=3`.
6. **Outcome**: apply `battleOutcome(char, opp, won)` (section 21) as a PURE patch; then run level/unlock/achievement checks outside the updater.

```ts
function counterReroll(rng:()=>number, L:Lesson[], player:Picks, opp:{level:number;counterSkill?:number}): Picks {
  const max=Math.max(0,Math.min(L.length-1,opp.level+1)), pool=[...Array(max+1).keys()], skill=opp.counterSkill ?? 0.5;
  const pick=(pi:number)=>{ const want=Object.keys(STYLE_BEATS).find(k=>STYLE_BEATS[k as Style]===L[pi]?.style) as Style|undefined;
    if(want && rng()<skill){ const c=pool.filter(i=>L[i].style===want); if(c.length) return c[Math.floor(rng()*c.length)]; }
    return pool[Math.floor(rng()*pool.length)]; };
  return [[pick(player[0][0]),pick(player[0][1])],[pick(player[1][0]),pick(player[1][1])]];
}
function judge(L:Lesson[], finalP:number, finalO:number, P:Stats, O:Stats, pPicks:Picks, oPicks:Picks, rng:()=>number){
  const uniq=(pk:Picks)=>new Set(pk.flat().flatMap(i=>L[i].pattern.map(n=>n.sound))).size;
  const up=uniq(pPicks), uo=uniq(oPicks);
  const votes=['tec','mus','ori','sho','rnd'].map(b=>{ let p=finalP,o=finalO;
    if(b==='tec'){p*=1+P.tec/60;o*=1+O.tec/60} else if(b==='mus'){p*=1+P.mus/60;o*=1+O.mus/60}
    else if(b==='ori'){p*=1+up/8;o*=1+uo/8} else if(b==='sho'){p*=1+P.sho/50;o*=1+O.sho/50}
    else {p*=0.85+rng()*0.3;o*=0.85+rng()*0.3}
    return p>o?'P':'O'; });                       // tie -> 'O'
  return { votes, won: votes.filter(v=>v==='P').length>=3 };
}
const rewards=(opp:{reward:number}, won:boolean)=>({ cash: won?opp.reward:Math.floor(opp.reward*0.1), fans: won?Math.floor(opp.reward/10):1, xp: won?60:20, mood: won?15:-10, energy:-30, minutes:90 });
```
Hit judging (shared with training): `delta=|note.time - t|`; `delta<=GOOD*boost` hit (perfect if `<=PERFECT*boost`); else stray miss; missed when `t > note.time+GOOD*boost`; streak resets on non-perfect.

Phaser mapping:
- `BattleScene` with a small state machine (`intro | rps | prep | oppReveal | countdown(n) | round(n) | judging | result`) driven by `time.delayedCall`; keep one `timers[]` list cleared on `shutdown`.
- Reusable `RhythmLane` game object (4 lanes, scroll speed `STRIKE_Y / 1.4 s`, strike line, perfect/good flash, pads + A/S/D/F, keyboard repeat ignored, pointer-down on pads) in two modes: `play` (returns `{accuracy, bestStreak}`) and `spectate` (ghost notes + audio at strike). Same component as Technicality training.
- Widgets: `BattleHud` (names, score bars max 400, timer, hype bar with the 7 labels, finisher gauge 8 pips), `Stage` (judges bench of 5 with vote markers, two beatboxers, crowd, aura at streak>=4, hearts), `PrepPanel` (2 slots x 2 halves x 12 lesson chips with lock/outcome tint), `RpsPanel`, `FinisherSplash` (2.6 s), `JudgeReveal` (5 cards, 700 ms each), `ResultPanel`.
- Audio: 3 low beeps + 1 high beep for countdown, win/loss stings, pad sounds (reuse the beatbox synth).
- Persist via a plain `applyBattleOutcome(char, opp, won): CharPatch` + central `checkProgression(char)`; do toasts/cutscenes after the state commit (avoid side effects inside reducers).

## 26. BALANCE BENCHMARKS (my Monte-Carlo of the exact logic above, 20 000 runs each; no finisher, constant accuracy, RPS 1/3 each, player does NOT counter-pick; "default" = `[[p0,p1],[p2,p3]]` first four playable; "best" = highest-value (A,B) pair used for both turns)

| Player (tec=mus=sho, lessons unlocked) | acc | vs | win% default picks | win% best pair | avg raw P / O (best) |
|---|---|---|---|---|---|
| 5, lesson 0 only | 0.90 | Pig Pen | 14 % | 14 % | 46 / 53 |
| 5, lesson 0 only | 1.00 | Pig Pen | 35 % | 36 % | 51 / 53 |
| 8, lessons 0-3 | 0.90 | Pig Pen | ~100 % | ~100 % | 128 / 53 |
| 8, lessons 0-3 | 0.90 | Joel | 98 % | 100 % | 128 / 55 |
| 10, lessons 0-4 | 0.90 | CeDe | 33 % | 90 % | 154 / 95 |
| 12, lessons 0-4 | 0.90 | Sikker | 25 % | 61 % | 146 / 123 |
| 16, lessons 0-8 | 0.90 | Alim | 16 % | 74 % | 241 / 156 |
| 20, lessons 0-10 | 0.90 | Olexinho | 8 % | 77 % | 282 / 190 |
| 25, all 12 | 0.95 | FatboxG | 6 % | 90 % | 427 / 235 |
| 30, all 12 | 0.95 | FatboxG | 10 % | 94 % | 459 / 235 |

Take-aways: default (lowest-index) picks lose almost everywhere past Pig Pen, so the pick screen is the real difficulty lever; best-pair play wins most fights if unlocked lessons keep pace; a fresh char with only lesson 0 is a coin-flip underdog vs Pig Pen even at 100% accuracy (the story expects Pig Pen to beat you first: `pigPenBattled && pigPenWins===0` dialogue).

---

## 27. TIMING TABLE (ms from phase start)

| Phase | Duration | Notes |
|---|---|---|
| RPS result display | 1400 | tie -> choose again |
| Countdown | 0 "3" + beep(440) / 800 "2" / 1600 "1" / 2400 "BEATBOX!" + beep(880) / 3300 -> round | pop animation 700 ms per number |
| Player round | lead-in 1400 + 16 beats x 521.74 = 8347.8 -> ~9748 until `onLessonComplete` | HUD clock 12->0 is cosmetic; no failure on time |
| Player end hold | 1500 (2600 if finisher armed) | splash visible during the 2600 |
| Opponent round | 12 000 exactly | score ticks every 1200 ms (10 ticks); hearts at 30 %/note |
| Judge reveal | 5 x 700, +200 sting, +800 -> result | 4.3 s |
| Toast / cutscene | Penny cutscene 600 ms after `go('bar')` | |

## 28. `char` FIELDS READ / WRITTEN BY BATTLE

Read: `name`, `color` (round-start combo label color), `stats.{mus,tec,sho}` (ori displayed only on intro card), `sounds` (lesson gating), `equipped` (HUD icons), `tecLessonsCompleted`, `defeated`, `day`, `minutes`, `mood`, `energy`, `cash`, `followers`, `xp`, `level` (via checkLevelUp), `gear.premium_headphones | mpc | wardrobe_refresh`, `oriSlots[0].tracks[].cells` (finisher name), `storyFlags.{pigPenWins,pigPenBattled,pennyReveal}`, `skin/hairColor/hairStyle/outfit/accessory` (stage look via `lookFromChar`), `_opponent`.
Written (only in `finishBattle`): `minutes`, `mood`, `cash`, `followers`, `energy`, `xp` (+ possible `level`), `defeated`, `lastBattleDay`, `storyFlags.pigPenWins/pigPenBattled`, `stats.sho` (gear), `daily.battleWins`, `sounds/equipped/achievements` (via checkLevelUp), `_opponent` deleted. Forfeit writes only `_opponent` delete.

## 29. TEST VECTORS (exact, for unit tests of the lifted module)

- `combine(L,0,0).pattern.length=16, tier=1, value=22`; `combine(L,11,11)` value 156; `combine(L,0,11)` value 21 (B notes dropped, tier 4); `combine(L,11,0)` value 78; `combine(L,7,2)` value 43 (B half empty because `T` is not one of FAST HATS' lanes; 24 notes x 1.8 = 43.2).
- `styleMatchup('BOOM','HATS')=1.5`, `('HATS','BOOM')=0.7`, `('BOOM','RIM')=1`, `('BOOM','BOOM')=1`, `('BOOM',undefined)=1`; `counterStyleOf('SNARE')='RIM'`.
- Sides: `playerFirst=true` -> rounds P,O,P,O; `playerFirst=false` -> O,P,O,P; slots 0,0,1,1.
- Worked battle: player tec12 mus10 ori9 sho8, lost RPS (`playerFirst=true`), picks `[[4,4],[3,4]]`; opp CeDe (tec11 mus12 ori9 sho10), picks `[[3,2],[1,4]]`; accuracies R1=0.90 (peak streak 9), R3=0.85 (peak 3).
  - R1 (P, slot0): combo(4,4) value 65, counter (RIM vs SNARE 1.5 + RIM vs HATS 0.7)/2 = 1.1 -> `round(65*0.9*1.275*1.1)=82`; finisher (peak 9>=8) `round(82*0.5+9*4)=77` -> 159.
  - R2 (O, slot0): combo(3,2) value 58, counter (SNARE vs RIM 0.7 + HATS vs RIM 1.5)/2 = 1.1, focus `0.7+11/60*0.3=0.755`, statMult `1+23/80=1.2875` -> `round(58*0.755*1.2875*1.1)=62`.
  - R3 (P, slot1): combo(3,4) value 61, counter 1.0 -> `round(61*0.85*1.275)=66`, no finisher.
  - R4 (O, slot1): combo(1,4) value 47, counter 1.0 -> `round(47*0.755*1.2875)=46`.
  - `finalP=82+77+66=225`, `finalO=62+46=108`; unique sounds 4 vs 4 (B,Pf,T,K).
  - Judges: Tek 225*1.2=270 vs 108*1.183=127.8 -> P; Mel 262.5 vs 129.6 -> P; Origi 225*1.5=337.5 vs 162 -> P; Showtime 225*1.16=261 vs 129.6 -> P; Wildcard random (always P here) -> 5-0, won. Rewards: +$50, +5 fans, +60 xp, mood +15, energy -30, +90 min, `defeated += 'CeDe'`.
- Rewards table and outcome patch per section 21; judge tie -> 'O'.
- Monte-Carlo sanity bounds in section 26 (use a seeded rng and +-2 % tolerance).

---

## OPEN QUESTIONS / GOTCHAS

1. **Weekly challenge bug**: `finishBattle` writes `daily.battleWins` directly instead of `bumpDaily(c,'battleWins')` (535), so `weekly.battleWins` never increments and `wk_battles_3` ("Win 3 battles this week", +$100 +20 fans) is unreachable. Decide whether to fix (recommended).
2. **Hearts**: `judgeHearts` only fire during OPPONENT rounds, 30 % per note, purely cosmetic and ~1.4 s ahead of the audible notes (lookahead not compensated). Player rounds produce none. Keep as cosmetic or tie to perfect hits.
3. **Inverted comment**: `NPCS` comment (line 89) says the opponent re-rolls when the PLAYER WINS the RPS; code re-rolls when the player LOSES (`playerFirst`). The UI text and code agree with each other, so treat the code as authoritative.
4. **Stats not used**: `ori` (both sides) is never used in battle; originality judge uses distinct-sound count of the picked patterns. `char.equipped`, `opp.sounds`, `SOUND_CATALOG.stamina/base/stat`, mood, energy, hunger, level do nothing in battle (only the pre-check `energy>=30`, `equipped.length>0`). Likely remnants of the earlier sound-picking system; decide whether to resurrect (e.g. ori -> a judge) or keep.
5. **Opponent is deterministic**: no accuracy roll, no per-round variance except pick randomness, counter factor and the Wildcard judge. Difficulty = `focus`/`statMult`/pool size/`counterSkill`.
6. **Combo-building quirks**: B-half notes outside A's lane set are dropped but tier takes `max(A,B)`; the picker UI shows no pattern value, so players cannot see these effects. Optimal play = repeat the highest-value lesson you can play (A=B), counter-pick only on RPS wins.
7. **Lesson gating** uses `tecLessonsCompleted` (index == completed is allowed) + owned sounds; training unlocks a lesson on ANY completion regardless of accuracy. Battle passes only `premium_headphones` boost (1.25); training also applies `mic` (x1.15). No mic input in battle.
8. **Timer semantics**: `ROUND_SECONDS=12` is only a visual countdown (and the hard length of opponent rounds). Player rounds end when BeatboxHero finishes (~9.75 s) - the HUD clock is ~3 at that moment and the leftover 1 s ticks keep running through the 1.5 s / 2.6 s hold (a 2.6 s finisher hold lets it reach 0 on screen); harmless.
9. **Finisher**: no SFX; bonus counted in `finalP` and thus in every judge; `perfects` count unused; armed flag only cosmetic.
10. **Ties**: judge ties go to the opponent; raw ties are irrelevant (decided only by votes). 3/5 wins.
11. **Impure `setChar` updater**: `finishBattle` calls `checkLevelUp` (toasts, sounds, queue modals) and assigns `triggerPennyReveal` inside the updater; with React batching/StrictMode the penny cutscene check right after `setChar` can read a stale `false` (updater run lazily) and be skipped forever (fires only on exactly the 2nd Pig Pen win). Rebuild: compute the patch purely, then emit events.
12. **Rules-of-hooks violation** (hooks after `if (!opponent) return null`) - irrelevant to Phaser.
13. **No sickness check** for solo battles (crew battles have one); **energy paid at the end** only (Forfeit = free); `_opponent` is saved into the save file if autosave fires mid-battle. Decide whether forfeit should cost anything / lock the week.
14. **Festival path A** is advertised as "3 escalating opponents · classic battle UI" but implemented as one RNG roll (section 22); crew battles are also pure RNG with no UI like BattleScreen. Possible improvement: route them through the new BattleScene.
15. `Pig Pen` flags: `pigPenBattled` is set only by Pig Pen fights, but the `first_saturday` achievement ("Show up to your first battle") keys off it, so skipping Pig Pen skips that achievement.
16. Real-time length of a battle: 4 countdowns (13.2 s) + 2 player rounds (2 x (9.75 + 1.5) = 22.5 s, +1.1 s per finisher) + 2 opponent rounds (2 x 12 = 24 s) + judging 4.3 s = ~64 s after the menus (RPS result delay 1.4 s). Game-clock cost is fixed at 90 minutes regardless.
17. Open design call: the opponent preview in tactical (win-RPS side) shows only STYLES of the opponent's four picks (not lesson names/values); the player's own picker shows only `#N` plus the selected name. Rebuild UI should surface name/tier/value/notes if desired, but doing so changes difficulty (see benchmarks).
