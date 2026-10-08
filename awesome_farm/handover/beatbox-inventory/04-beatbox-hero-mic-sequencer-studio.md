# Beatbox Story — Inventory 04: Beatbox Hero, Mic Detector, Sequencer, Sound Studio

Source: `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx`, lines 4020-5785 (range ends where `JamAnimation` begins at 5776; that belongs to the next inventory). Every claim below was read from the code; line numbers are exact for the file as of this inventory. Where a unit depends on code outside the range, the dependency is listed in "Shared dependencies" with its own line numbers.

## SUMMARY (10 lines)

1. BEATBOX HERO is a 4-lane falling-note rhythm trainer (lanes B/T/K/Pf by default; 12 hard-coded lessons, 5 base + 7 that swap in unlocked catalog sounds). Used for Technicality training in the House, and (in `battle` / `spectate` modes) for the battle rounds.
2. Notes fall 1400 ms to a strike line. Tap windows: PERFECT 110 ms / GOOD 180 ms; mic mode 200 / 350 ms; both multiplied by `accuracyBoost` (up to x1.4375 in training). Accuracy = (perfect+good) / (perfect+good+misses), where stray taps also count as misses.
3. Practice mode = 4 repetitions of an 8-beat pattern: DEMO, YOU, DEMO, YOU. Battle = 1 player rep of a 16-beat "combo" lesson injected via `lessonOverride`. Spectate = demo only (opponent turn).
4. Comments say "4-bar / 16-beat patterns" but the code plays only beats 0-7.99 of each lesson (`patternBeats` default 8); the second half of every lesson generator is dead data.
5. MIC DETECTOR: RMS-threshold onset (floor 0.04, dynamic = 2x moving average, 80 ms cooldown), then a 2048-pt Hann FFT -> 5 normalised band powers -> cosine similarity vs 4 profiles (B/T/K/Pf). Profiles default to hard-coded vectors, or are learned from the player's Sound Studio recordings. It can ONLY emit B/T/K/Pf, so catalog-sound lanes (lessons 6-12) are mostly unhittable by mic.
6. ORIGINALITY SEQUENCER: 16-step (16th-note) grid, per-track boolean cells, 4 save slots (8 with the Pro MPC gear), 4 starter patterns, BPM 60-180. "Creativity" score = 0.5*min(1, usedSounds/4) + 0.5*min(1, activeCells/24), reported every 2.5 s; it only measures variety and density, not musicality.
7. SOUND STUDIO: per-save-slot custom samples for the 4 hero sounds + every owned catalog sound. REC auto-detects onset (RMS 0.04) and silence (RMS 0.015 for 120 ms), trims, caps to 600 ms, peak-normalises to 0.85, stores `{float32, sampleRate}` in IndexedDB `beatbox-story-samples` under `slot{N}:sample-{key}`.
8. All audio plays through one global `playGameSound(key)` (custom sample if present, else Web Audio synth). Mute setting kills the AudioContext getter, which also silently breaks mic and sample loading.
9. Rewards live in the host (`HouseScreen`, lines 12733-12826): accuracy >= 0.8 -> +3 stat, >= 0.5 -> +2, else +1 (0 if accuracy is exactly 0), then x BPM bonus, x1.25 gear, x2 festival prep. Lesson completion unlocks the next lesson regardless of accuracy.
10. Many real bugs/oddities (stale closures, Stop button saves, HUD miss count lags, label never clears, mic cannot reach catalog lanes, orphan samples) are catalogued in "OPEN QUESTIONS / GOTCHAS".

---

## 0. Range map (what lives where)

| Lines | Unit |
|---|---|
| 4023-4026 | Header comment for Beatbox Hero |
| 4028-4029 | `HERO_LANES` |
| 4031-4175 | 11 pattern generators `_patBoom` ... `_patL12` |
| 4177-4188 | Style cycle: `STYLE_BEATS`, `STYLE_COLORS`, `styleMatchup` |
| 4190-4213 | `HERO_LESSONS` (12 lessons) |
| 4215-4317 | Mic DSP: `_fftMag`, `_bandProfile`, `_profileFromBuffer`, `_DEFAULT_PROFILES` |
| 4319-4487 | `MicBeatboxDetector` component |
| 4489-4959 | `BeatboxHero` component (state machine, judging, canvas, DOM) |
| 4961-5241 | Originality `Sequencer`: constants, starters, component |
| 5243-5284 | `CAT_COLORS`, `_abbrevFromName`, `getSoundDisplay` |
| 5286-5773 | `SoundStudio` component |

## 0b. Shared dependencies OUTSIDE the range (needed to rebuild; owned by other inventories)

| Symbol | Line | What the range relies on |
|---|---|---|
| `SOUND_CATALOG` | 6-19 | 12 catalog sounds `{name, cat, tier, stamina, base, stat}`. Cats: Kicks, Hats, Snares, Liproll, Bass, Scratch, Whistles, Clicks |
| `SOUND_UNLOCKS` | 27-44 | Milestone conditions that put a sound in `char.sounds` (gates lessons 6-12, see lesson table) |
| `initialChar` fields | 174-179, 182 | `tecLessonsCompleted:0`, `tecCurrentLesson:0`, `tecBpm:90`, `oriBpm:100`, `oriPattern:null` (legacy), `oriSlots:null`, `oriSlotIdx:0` |
| `onGlobalKey` | 233-257 | Capture-phase keydown dispatcher; ignores `e.repeat`, meta/ctrl/alt, and focus inside INPUT/TEXTAREA/contentEditable |
| `Panel` | 6536-6543 | Titled box used by Sound Studio |
| `getSettings().muted` | 970-989 | If muted, `getAudioCtx()` returns null |
| `getAudioCtx` | 17146-17156 | Lazy shared `AudioContext`; resumes if suspended; returns null if muted or unsupported |
| `HERO_SOUNDS` | 17166-17171 | B `{name:'Kick', color:'#CC2200', label:'B', cat:'Kicks', defaultSound:'classic_kick'}`, T `{Hi-Hat, '#22d3ee', 'T', Hats, 'hi_hat'}`, K `{Rimshot, '#a78bfa', 'K', Rimshot, 'rimshot'}`, Pf `{Snare, '#fbbf24', 'Pf', Snares, 'psh_snare'}` |
| `HERO_SAMPLES` | 17175 | Global mutable dict `key -> AudioBuffer` of the current slot's custom samples |
| `playHeroSound` / `playGameSound` | 17215-17263 | Custom sample (BufferSource, gain 1.0, `start(0)`, polyphonic) else synth. `playGameSound` = hero keys -> `playHeroSound`; other keys -> sample else `playSound(cat, name)` |
| Synths | 17178-17553 | `playKick(pitch)`, `playSnare`, `playHat`, `playRimshot`, `playBass`, `playScratch`, `playWhistle`, `playLipRoll`, `playClick`, `playSound(cat,name)` (category dispatch; "roll"/"uvular" = 4 kicks 60 ms apart; "throat/808" = kick pitch 45; "fast" hats = 6 hats 50 ms apart; "Click Roll" = 5 clicks 50 ms apart) |
| IndexedDB layer | 17270-17380 | `openIdb`, `idbGet/Put/Delete`, `recordToBuffer`, `ALL_SAMPLE_KEYS`, `loadSamplesForSlot`, `saveSampleForSlot`, `deleteSampleForSlot`, `deleteAllSamplesForSlot` |
| `playBeep`, `playWinSting` | 17580, 17643 | Used by battle countdown (not by range) |
| `FINISHER_THRESHOLD` | 17041 | = 8 (peak perfect streak that arms the battle finisher) |
| Gear | 2039-2060 | `pc` (+25% Tec/Ori), `mpc` (sequencer slots 4->8), `mic` (+25% mic mode/Mus), `premium_headphones` (+25% hit windows), `studio_monitors` (+25% creativity) |
| Host: Technicality training | 12733-12826, 13973-14123 | Lesson picker, input toggle, BPM +/-5, reward formula |
| Host: Originality training | 14124-14180 | Sequencer wiring and MPC slot padding |
| Host: Studio tab | 14196-14198 | Mounts `<SoundStudio activeSlot showToast char/>` |
| Host: battle | 17876-18110, 18283-18341, 18711-18745 | `combineLessons`, scoring, style counters, `<BeatboxHero mode="battle|spectate">` |
| Other `oriSlots` consumers | 12350 (SongsLibrary, release needs >= 4 hits), 15198 (OpenMicPerformance plays 2 non-empty slots, 2 reps each, at `oriBpm + 20`), 18303 (battle finisher name uses slot 0 if MPC owned), 11200-11210 (migration), 14503-14511 (MPC purchase pads to 8) |

Save-slot facts used by the Studio: `NUM_SLOTS = 5` (line 933); character JSON is stored via `window.storage` under `character:slot{n}` (lines 934-962); custom samples are in IndexedDB, NOT in the character JSON.

---

## Lane constants  (lines 4028-4029)
- **What:** `HERO_LANES = ['B','T','K','Pf']`, left-to-right default lanes = Kick (B), Hi-Hat (T), Rimshot (K), Snare (Pf).
- **Mechanics:** lessons may override with their own 4-element `lanes` array (catalog sound ids in place of some slots). Lane index = `lanes.indexOf(sound)`; keyboard and pad order follow the same array.
- **Drawn:** colours/labels from `getSoundDisplay` (see that section). Hero colours: B `#CC2200`, T `#22d3ee`, K `#a78bfa`, Pf `#fbbf24`.
- **Rebuild:** plain constant. Beware: the lane list is the only link between a note's `sound` and its column; a note whose sound is not in `lanes` silently falls into lane 0 (`lane >= 0 ? lane : 0`, line 4555). Currently no shipped pattern triggers that (verified by script: 0 out-of-lane notes in all 12 lessons and in `combineLessons`, which filters B-half notes by A's lanes).

---

## Pattern generators  (lines 4031-4175)
- **What:** Pure functions returning `{beat:number, sound:string}[]`. `beat` is in quarter-note units (0.5 = an 8th, 0.25 = a 16th, 0.75 = "a" of the beat). Arrays are NOT sorted; order is irrelevant because notes are matched by time.
- **Mechanics (important):** every generator writes 16 beats (4 bars) but `BeatboxHero` keeps only `beat < patternBeats` with `patternBeats = lesson.patternBeats ?? 8` (line 4540-4542), and `combineLessons` (host, 17925-17953) also slices at `beat < 8`. So effectively every lesson is **2 bars / 8 beats** and beats 8-15 are dead. A rebuild can store 8-beat patterns directly. Note counts below are for the first 8 beats (counted by script).

Per-bar content (bars 1-2 identical; bar offset = 4 beats):

| Gen | Lesson | Per 4-beat bar (beat:sound) | Notes in 8 beats |
|---|---|---|---|
| `_patBoom` | 1 | B on 0,1,2,3 (quarter notes) | 8 (B 8) |
| `_patBackbeat` | 2 | B on 0,2 ; Pf on 1,3 | 8 (B4 Pf4) |
| `_patHat8ths` | 3 | T on every 0.5 step (8 per bar) | 16 (T16) |
| `_patKitGroove` | 4 | per beat b: B (even b) / Pf (odd b) at b, T at b+0.5 | 16 (B4 T8 Pf4) |
| `_patWithRim` | 5 | KitGroove + K at 3.75 (and 7.75) | 18 (B4 T8 Pf4 K2) |
| `_patSyncoKick` | (unused) | B 0, Pf 1, B 1.75, B 2.5, Pf 3 | not in any lesson |
| `_patOffbeatHat` | (unused) | B0 Pf1 B2 Pf3 + T on 0.5,1.5,2.5,3.5 | not in any lesson |
| `_patL6` | 6 LIP ROLL | B0 T0.5 Pf1 lip_roll1.5 B2 T2.5 Pf3 lip_roll3.5 | 16 (B4 T4 Pf4 lip_roll4) |
| `_patL7` | 7 808 THROAT | throat_kick 0, T0.5, Pf1, T1.5, throat_kick 1.75, throat_kick 2, T2.5, Pf3, T3.5 | 18 (throat_kick6 T8 Pf4) |
| `_patL8` | 8 FAST HATS | B0 Pf1 B2 Pf3 + fast_hats on every 0.5 (8/bar) | 24 (B4 Pf4 fast_hats16) |
| `_patL9` | 9 INWARD SNARE | B0 inward_k1 B2 inward_k3 + T every 0.5 + K at 0.75 and 2.75 | 28 (B4 inward_k4 T16 K4) |
| `_patL10` | 10 INWARD BASS | inward_bass 0, Pf1, inward_bass 1.75, inward_bass 2, Pf3 + T every 0.5 | 26 (inward_bass6 Pf4 T16) |
| `_patL11` | 11 CLICK ROLL | B0 Pf1 B2 Pf3 + T every 0.5 + click_roll 3.5 | 26 (B4 Pf4 T16 click_roll2) |
| `_patL12` | 12 UVULAR FINALE | uvular_roll 0, inward_bass 1, click_roll 1.75, uvular_roll 2, click_roll 2.5, inward_bass 3, click_roll 3.75 + fast_hats every 0.5 | 30 (uvular4 inward_bass4 click_roll6 fast_hats16) |

- `_patSyncoKick` and `_patOffbeatHat` are defined but referenced by nothing (dead code; candidate extra lessons).
- **Drawn:** n/a (data).
- **Rebuild:** lift verbatim into `heroPatterns.ts`; store as data. Preserve exact beat values; same-lane near-collision exists only in lesson 7 (`throat_kick` at 1.75 and 2.0 = 0.25 beat apart; 166.7 ms at 90 BPM, and 24 px apart which equals the note height, so notes touch; they overlap at BPM > 90).

---

## Style cycle (counter matchup)  (lines 4177-4188)
- **What:** Each lesson has a `style` tag; battle uses it as a rock-paper-scissors-like multiplier on round score.
- **Mechanics:** `STYLE_BEATS = { BOOM:'HATS', HATS:'RIM', RIM:'SNARE', SNARE:'BOOM' }` (key beats value). `styleMatchup(you, them)`: if either missing -> 1; `STYLE_BEATS[you] === them` -> **1.5**; `STYLE_BEATS[them] === you` -> **0.7**; else **1.0** (mirror or non-adjacent). It is a 4-cycle, not 3: opposite styles are neutral (BOOM vs RIM, HATS vs SNARE). Full matrix (row = you):

| you \ them | BOOM | HATS | RIM | SNARE |
|---|---|---|---|---|
| BOOM | 1 | 1.5 | 1 | 0.7 |
| HATS | 0.7 | 1 | 1.5 | 1 |
| RIM | 1 | 0.7 | 1 | 1.5 |
| SNARE | 1.5 | 1 | 0.7 | 1 |

- `STYLE_COLORS = { BOOM:'#CC2200', HATS:'#22d3ee', RIM:'#a78bfa', SNARE:'#fbbf24' }` (drawn by the battle UI as style badges, lines 18490/18618; not in range).
- Consumers (outside range): `styleMatchupForRound` (17972, average over a round's two picks), `counterStyleOf` (18079: the style that beats `s` = key whose value is `s`), `oppCounterReroll` (18086, probability `counterSkill` per pick).
- **Rebuild:** pure; lift as-is.

---

## HERO_LESSONS (curriculum)  (lines 4190-4213)
- **What:** The 12-entry curriculum. Selected in the House (Technicality training) and drawn from by battle pattern picking.
- **Shape:** `{ name, desc, tier, style, pattern, requires?, lanes? }`.
- **Table:**

| # (idx) | name | desc | tier | style | requires (sound id) | lanes (left->right) |
|---|---|---|---|---|---|---|
| 1 (0) | BOOM BASIC | Kick on every beat | 1 | BOOM | - | B T K Pf |
| 2 (1) | BACKBEAT | Kick on 1 & 3, snare on 2 & 4 | 1 | SNARE | - | B T K Pf |
| 3 (2) | HI-HAT 8THS | Hat on every 8th note | 1 | HATS | - | B T K Pf |
| 4 (3) | KIT GROOVE | Boom + snare + 8th hats | 2 | SNARE | - | B T K Pf |
| 5 (4) | WITH RIMSHOT | Kit groove + rim accents | 2 | RIM | - | B T K Pf |
| 6 (5) | LIP ROLL DRILL | Lip rolls on the offbeats | 2 | HATS | lip_roll | B T lip_roll Pf |
| 7 (6) | 808 THROAT | Heavy throat-kick groove | 2 | BOOM | throat_kick | throat_kick T K Pf |
| 8 (7) | FAST HATS | TKs doubling the hi-hat lane | 2 | HATS | fast_hats | B fast_hats K Pf |
| 9 (8) | INWARD SNARE | Alternate snare voice | 2 | SNARE | inward_k | B T K inward_k |
| 10 (9) | INWARD BASS | Deep inward bass kick | 3 | BOOM | inward_bass | inward_bass T K Pf |
| 11 (10) | CLICK ROLL | Click roll fills | 3 | RIM | click_roll | B T click_roll Pf |
| 12 (11) | UVULAR FINALE | All four advanced sounds | 4 | BOOM | uvular_roll | uvular_roll fast_hats click_roll inward_bass |

- Lessons 7, 8, 10 contain no K notes, so their "K" lane is an empty decoy column (lessons 1-4: also empty T/K/Pf lanes as listed in the pattern table). Lesson 9 has no Pf lane at all.
- **Unlock rules (host, 13990-14005 and 18003-18012):** lesson `i` is playable iff `i <= char.tecLessonsCompleted` AND (`lesson.requires` is absent OR is in `char.sounds`). Initially `tecLessonsCompleted = 0` so only lesson #1 is playable. Completing lesson `idx` (see completion rule below) sets `tecLessonsCompleted = min(12, idx+1)` if `idx >= tecLessonsCompleted`, and sets `tecCurrentLesson = idx+1`. So the chain is strictly linear and also gated by sound ownership.
- Sound ownership comes from `SOUND_UNLOCKS` (lines 27-44): lip_roll = Originality stat >= 10; throat_kick = beat Pig Pen (`storyFlags.pigPenWins >= 1`); fast_hats = 5 open mics; inward_k = 3 jams (`storyFlags.jamCount >= 3`); inward_bass = defeat Sikker; click_roll = 500 followers; uvular_roll = defeat FatboxG. The picker text "(buy in shop)" (line 14044) is stale: sounds are milestone-unlocked now.
- Picker UI states: locked buttons show a lock emoji then `#n`, are disabled and at 40% opacity; if the stored current lesson is not playable the host walks downward to the highest playable index at or below it.
- `tier` is used only by battle (`lessonValue = round(pattern.length * (1 + tier*0.4))`, line 17965); `style` only by battle matchups.
- **Rebuild:** lift data as JSON/TS. Note the `lanes` override quirk: lessons that use `inward_k` etc. need those sounds to exist as lane ids; keep ids identical to `SOUND_CATALOG` keys.

---

## Mic DSP helpers  (lines 4215-4317)
### `_fftMag(input)` (4222-4264)
- In-place iterative radix-2 Cooley-Tukey FFT on a real input; length must be a power of 2 (2048 in use).
- **Mechanics:** copies to `re` (Float32Array) multiplying by a Hann window `0.5*(1-cos(2*pi*i/(N-1)))`; `im` zeros; bit-reversal permutation; butterflies with incremental twiddle (`ang = -2*pi/len`); returns `Float32Array(N/2)` of magnitudes `sqrt(re^2+im^2)` (unnormalised, no scaling by N).
- **Rebuild:** lift verbatim (framework-free).

### `_bandProfile(timeData, sampleRate)` (4267-4288)
- 5-band normalised spectral profile. `binHz = sampleRate / N`. For band [lo,hi): bins `a = max(0, floor(lo/binHz))` to `b = min(mag.length, ceil(hi/binHz))` (exclusive upper), summing `mag[i]^2`.
- **Bands (Hz):** 0: 40-150 (sub-bass/kick), 1: 150-500 (low-mid), 2: 500-2000 (mid), 3: 2000-6000 (high/snare), 4: 6000-14000 (very high/hat).
- Returns each band's power divided by the 5-band total; returns `null` if total < 1e-6 (silence), in which case no hit is emitted.
- At 48 kHz and N=2048 a bin is 23.44 Hz (band 0 = bins 1-6).

### `_profileFromBuffer(audioBuffer, fftSize=2048)` (4293-4309)
- Builds a profile from a recorded Studio sample: channel 0; finds the index of the largest `|sample|`; window starts at `max(0, peakIdx - (fftSize>>2))` (= 512 samples before the peak, ~10.7 ms at 48 kHz) and is zero-padded if the buffer ends early; runs `_bandProfile`. Returns null if the buffer is null (or if silent).

### `_DEFAULT_PROFILES` (4312-4317) - used when no recorded sample for that key
| key | band0 | band1 | band2 | band3 | band4 |
|---|---|---|---|---|---|
| B  | 0.46 | 0.34 | 0.15 | 0.04 | 0.01 |
| K  | 0.05 | 0.18 | 0.45 | 0.22 | 0.10 |
| Pf | 0.04 | 0.10 | 0.22 | 0.46 | 0.18 |
| T  | 0.03 | 0.07 | 0.16 | 0.30 | 0.44 |

- **Rebuild:** these four functions + table are pure and should be one module `micDsp.ts`. They use no DOM, only typed arrays; `AudioBuffer` can be replaced by `{data: Float32Array, sampleRate}`.

---

## MicBeatboxDetector component  (lines 4319-4487)
- **What:** Invisible-ish input device for `BeatboxHero` when `inputMode === 'mic'`. Listens to the microphone, detects loud onsets, classifies each as B/T/K/Pf and calls `onHit(key)`, which is `BeatboxHero.handleTap`. Renders a small panel with status text, level meter and a per-key "learned" indicator. Replaces the drum pads in mic mode; mounted only when `mode !== 'spectate' && inputMode === 'mic'` (line 4916).
- **Props:** `active: boolean` (effect restarts only when this changes), `paused = false` (set by parent to `state.phase !== 'player'`, so the mic is ignored during demos and after completion), `onHit(key: 'B'|'T'|'K'|'Pf')`.
- **Internal state:** `permission: 'idle'|'requesting'|'granted'|'denied'|'insecure'`, `errorDetail: string`, `level: number` (RMS), `lastDetected: key|null`, `profileSources: {B,T,K,Pf: boolean}` (true = profile learned from a recording). Refs `pausedRef`, `onHitRef`, `lastDetectedAtRef`.
- **Setup sequence (effect on `[active]`, 4331-4441):**
  1. If `window.isSecureContext === false` -> `permission='insecure'`, detail "Mic requires HTTPS."; abort.
  2. If `navigator.mediaDevices.getUserMedia` missing -> `'denied'`, "Mic API unavailable."
  3. `getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}})`; on error -> `'denied'` with `e.message` or "Mic permission denied."
  4. `getAudioCtx()` (null when muted -> `'denied'`, "No audio context.").
  5. `MediaStreamSource -> AnalyserNode` with `fftSize=2048`, `smoothingTimeConstant=0`. The mic is NOT connected to the destination (no monitoring/feedback). `permission='granted'`.
  6. Build profiles once: for each of `['B','T','K','Pf']`, `HERO_SAMPLES[k] ? _profileFromBuffer(HERO_SAMPLES[k], 2048) : null`; fall back to `_DEFAULT_PROFILES[k]`; record `profileSources[k] = !!learned`.
  7. Start a `requestAnimationFrame` loop. Cleanup: cancel rAF, stop all mic tracks.
- **Per-frame algorithm (4385-4431):**
  ```
  analyser.getFloatTimeDomainData(timeBuf[2048])       // most recent 2048 samples
  rms = sqrt( sum(x^2) / 2048 )
  setLevel(rms)                                        // meter, every frame
  recentRms = recentRms*0.95 + rms*0.05                // EMA incl. current frame
  dynThresh = max(0.04, recentRms * 2)                 // onsetFloor = 0.04
  if (paused) { next frame; return }                   // EMA still updates while paused
  if (rms > dynThresh && now - lastOnsetMs > 80) {     // cooldownMs = 80
      lastOnsetMs = now
      obs = _bandProfile(timeBuf, sampleRate)          // Hann FFT 2048, 5 bands
      if (obs) {
         bestKey='K', bestSim=-inf
         for k in profiles: sim = cosine(obs, profiles[k]) = dot/(|a||b|+1e-9)
                            if sim > bestSim: best = k
         setLastDetected(bestKey); onHit(bestKey)
      }
  }
  ```
- **Constants:** FFT/analyser size 2048 (~43 ms @ 48 kHz), onset floor 0.04 RMS, dynamic factor 2x moving average (EMA alpha 0.05, per-frame, so time constant depends on display refresh), cooldown 80 ms, bands as above, no minimum-similarity threshold (every onset becomes one of the four keys), no peak-picking or spectral-flux (it is a level threshold, not true onset detection).
- **Calibration / storage:** there is no calibration UI and no profile storage of its own. "Calibration" = record the 4 hero sounds in Sound Studio; profiles are recomputed from `HERO_SAMPLES` every time the mic effect starts (so re-record, then restart the lesson). The panel shows one indicator per key: `"✓ B"` in the key's colour when learned from a recording, `"· B"` in `#57534e` (grey) when the default profile is used.
- **False-positive handling:** only the RMS floor/dynamic threshold, the 80 ms cooldown, the `paused` flag, and disabling echo cancel/noise suppression/AGC. Speaker bleed is avoided by not playing back the matched sound in mic mode (`handleTap` skips `playGameSound` when `inputMode==='mic'`) and by pausing during the demo. No other rejection.
- **Drawn (DOM, Tailwind):** a bordered box (`border-2 border-stone-800 bg-stone-900/40 p-2`). Header row: left `"🎤 " + status` in 10 px uppercase tracking-widest stone-500; status strings: granted -> `"listening"` or `"paused — demo playing"` (when `paused`), requesting -> `"requesting mic…"`, denied -> `"mic denied"`, insecure -> `"needs https"`, else `"idle"`. Right: last detected key `"<label> · <NAME>"` coloured with the key colour. When granted: level bar 8 px high, width `min(100, level*250)%`, colour `#84cc16` if level < 0.04, `#fbbf24` if < 0.15, else `#ef4444`, with 75 ms width transition; then four tiny labels (learned indicators). If denied/insecure and `errorDetail`: red `text-red-400` message.
- **Callbacks out:** `onHit(key)` only. In `BeatboxHero` this is `handleTap`, so the detector behaves exactly like tapping that key's pad (see lane caveat below).
- **Rebuild notes:** DSP is pure and liftable. The permission / `getUserMedia` / `AnalyserNode` parts are browser APIs that Phaser does not provide, so keep them as a small non-Phaser service (`MicInput`) polled once per Phaser update. Recommended fixes: use time-based EMA, add spectral-flux or peak onset detection, add a similarity floor, and take the FFT a few ms AFTER the onset instead of at first threshold crossing (the live window at the moment of crossing contains mostly pre-onset silence, while the learned profile is taken ~10 ms before the sample's peak).
- **Bugs/oddities:** (a) the "detected" label clear (`if (lastDetected && now - lastDetectedAtRef.current > 400)`, line 4426) reads `lastDetected` from the stale closure (always null), so the label never clears; it only changes on the next hit. (b) `setLevel(rms)` every frame re-renders the React tree 60 times a second. (c) Because the detector only ever returns B/T/K/Pf, it cannot hit lanes with catalog ids (see BeatboxHero caveat).

---

## BeatboxHero component  (lines 4489-4959)
- **What:** A Guitar-Hero style canvas rhythm trainer. Three call modes: `practice` (House training: demo / you alternation, loops forever), `battle` (single rep, player turn, results reported once), `spectate` (single rep, demo only, used to show the opponent's round). Input is tap/keyboard or mic.

### Props (4489-4501)
| Prop | Type / default | Meaning |
|---|---|---|
| `onAccuracyUpdate(acc, hits, total)` | fn | Called every `evaluateEveryMs` while active and `total > 0`; `acc = hits/(hits+misses)` cumulative since the run/state started |
| `onLessonComplete(lessonIdx, finalAcc, {bestStreak, perfects})` | fn | Fires once when `songT >= totalMs` |
| `onStreak(current)` | fn | Called on every perfect hit with the new streak, and with 0 whenever a non-zero streak breaks |
| `evaluateEveryMs` | 2500 | Accuracy report period |
| `active` | true | Gate: false = paints "GET READY"/"STARTING SOON", no clock advance, no auto-miss, no demo audio |
| `bpm` | 90 | Read via ref at lesson (re)start only; changing it mid-lesson takes effect on next restart |
| `lessonIdx` | 0 | Index into `HERO_LESSONS`; changing it re-runs the main effect (full reset) |
| `mode` | `'practice'` \| `'battle'` \| `'spectate'` | See above |
| `inputMode` | `'tap'` \| `'mic'` | Mic mode widens windows, hides pads, mounts the detector |
| `accuracyBoost` | 1 | Multiplier on BOTH windows |
| `lessonOverride` | null | A synthesized lesson (battle combos) with `patternBeats: 16`, replaces `HERO_LESSONS[lessonIdx]` |

### Timing constants (4517-4531)
- `HIT_PERFECT_MS = (mic ? 200 : 110) * accuracyBoost`; `HIT_GOOD_MS = (mic ? 350 : 180) * accuracyBoost`. Windows are symmetric (early or late) and measured against `performance.now()` at call time (no latency compensation).
- Host `accuracyBoost` in training: `(premium_headphones ? 1.25 : 1) * (mic gear ? 1.15 : 1)`, up to 1.4375, and it applies to tap mode too (although the gear text says mic mode). Tap windows then 158 / 259 ms; mic windows 287 / 503 ms. Battle: `premium_headphones ? 1.25 : 1`.
- `LOOKAHEAD_MS = 1400` (note spawn-to-strike travel; also the lead-in before song time 0).
- `REPS_TOTAL = (battle|spectate) ? 1 : 4`. `COMPLETE_HOLD_MS = 1800`.
- Beat grid: `beatMs = 60000 / bpm`; `patternBeats = lesson.patternBeats ?? 8`; `patternMs = patternBeats * beatMs`; `totalMs = REPS_TOTAL * patternMs`. Examples: 60 BPM: rep 8000 ms, practice total 32 s; 90 BPM (default): beat 666.7 ms, rep 5333 ms, total 21.33 s; 140 BPM (max): rep 3429 ms, total 13.7 s; battle 115 BPM: beat 521.7 ms, 16-beat rep = 8348 ms. The host clamps training BPM to 60-140, step 5.
- Canvas geometry: `TRACK_W = 320`, `TRACK_H = practice ? 260 : 220`, `STRIKE_Y = TRACK_H - 56` (204 or 164), `LANE_W = 80`, `PIXELS_PER_SEC = STRIKE_Y / 1.4` (145.7 px/s practice, 117.1 px/s battle/spectate). A note at time `t` is at `y = STRIKE_Y - (t - songT) * PPS/1000`; it enters at `y=0` 1.4 s before it is due.

### State initialisation (`initState`, 4533-4593)
- `lesson = lessonOverride || HERO_LESSONS[lessonIdx] || HERO_LESSONS[0]`; `lanes = lesson.lanes || HERO_LANES`; pattern filtered to `beat < patternBeats`.
- Builds `notes[]` for each rep: `{id:'r{rep}n{i}', time: rep*patternMs + beat*beatMs, sound, lane: lanes.indexOf(sound) (else 0), isDemo, rep, hit:false, judged:false, hitTime:0, hitGrade:null}`. `isDemo = (mode==='practice' && rep%2===0) || mode==='spectate'`. So in practice: rep0 DEMO, rep1 PLAYER, rep2 DEMO, rep3 PLAYER; battle: all player; spectate: all demo.
- Other state: `hits, misses, perfects, streak, bestStreak`, `laneFlash{sound:timestamp}`, `audioScheduled:Set`, `phase` (`'player'` in battle, else `'demo'`), `completeAt`, `completionFired`, `startTime = performance.now() + 1400` (song time starts at -1400 ms).
- State lives in a ref (`stateRef`); React re-renders only through `rerender()` on taps/phase changes.

### Lifecycle (4672-4899)
- Mount / `lessonIdx` change: effect creates a fresh state and starts the rAF loop plus the `evaluateEveryMs` interval; cleanup cancels both. Effect deps are `[lessonIdx]` ONLY (see stale-closure gotchas).
- `active` false->true (e.g. battle countdown finished): resets `startTime = now+1400`, all counters, `audioScheduled`, `completionFired`, `completeAt`, every note (`hit/judged/hitTime/hitGrade`), phase = `demo` (practice/spectate) or `player` (battle).
- Tick when `!active`: only draws (banner "GET READY" / "STARTING SOON").
- Tick when active (4817-4879), in order:
  1. `songT = now - startTime`.
  2. **Completion:** if `songT >= totalMs` and phase not complete: `phase='complete'`, `completeAt=now`, `finalAcc = hits/(hits+misses)` (0 if none), fire `onLessonComplete(lessonIdx, finalAcc, {bestStreak, perfects})` once; rerender.
  3. Otherwise **phase from rep index:** `repIdx = floor(songT/patternMs)`; battle -> `'player'`; spectate -> `'demo'`; practice -> `repIdx%2===0 ? 'demo' : 'player'`. NOTE during the lead-in `songT<0` so `repIdx=-1` and `-1%2 === -1` -> practice phase becomes `'player'` for the first 1.4 s (banner says "YOUR TURN", then flips to demo at t=0). Taps during that lead-in count as stray misses (no player notes exist yet).
  4. **Auto-restart (practice only):** if complete and `now - completeAt > 1800`, `stateRef = initState(...)` with `bpmRef`, `lessonIdxRef`, `lessonOverrideRef` current values; rerender; continue. (Practice therefore loops endlessly; battle/spectate stay on 'complete'.)
  5. **Auto-miss:** every non-demo, un-judged note with `n.time + HIT_GOOD_MS < songT` -> `judged=true`, `misses++`, streak reset (+ `onStreak(0)` if streak was > 0). No visual feedback; the note simply disappears (~180 ms after its time).
  6. **Demo audio:** for each demo note not yet in `audioScheduled` with `n.time <= songT`: if `songT - n.time < 200` -> `playGameSound(n.sound)` and flash its lane; always add to `audioScheduled` (so a >200 ms stall silently skips). Audio is triggered from rAF, not scheduled on the audio clock, so jitter is up to one frame.
  7. `drawCanvas()`.
- Accuracy interval: every `evaluateEveryMs` while `active` and `hits+misses > 0` -> `onAccuracyUpdate(hits/total, hits, total)`. NOTE this is cumulative over the whole run (all player reps so far), not a rolling window, and is reset only on a state re-init.

### Input handling
- **Pads (tap mode):** `<button onPointerDown>` per lane calls `handleTap(sound)`; `e.preventDefault()`.
- **Keyboard:** `A S D F` -> lanes 0..3 (accepts `e.code` KeyA..F or `e.key` a/A etc.), registered through `onGlobalKey` on mount for the component's whole life (even when `active` is false). Disabled in `spectate` and `mic` modes; ignored if `idx >= lanes.length`.
- **Mic:** `MicBeatboxDetector.onHit(key)` -> `handleTap(key)`.
- **`handleTap(sound)` (4595-4649):**
  1. `songT = now - startTime`; `lane = lanes.indexOf(sound)` (-1 if the sound is not a lane).
  2. If not mic mode, `playGameSound(sound)` (custom sample or synth). Mic mode skips playback to avoid feedback.
  3. `laneFlash[sound] = now` (flash happens in every phase, including demo).
  4. If `phase !== 'player'` -> rerender and return (no scoring during demos or completion).
  5. Find the best candidate: among notes with `!judged && !isDemo && n.lane === lane`, minimum `|n.time - songT|` subject to `<= HIT_GOOD_MS`.
  6. Found -> `hit=true, judged=true, hitTime=now`; `isPerfect = delta <= HIT_PERFECT_MS`; grade `'perfect'|'good'`; `hits++`. Perfect: `perfects++`, `streak++`, update `bestStreak`, `onStreak(streak)`. Good: if `streak>0` reset to 0 and `onStreak(0)`.
  7. Not found -> **stray tap counts as a miss** (`misses++`, streak reset). This includes taps on a lane with nothing near the strike line, repeat taps on an already-judged note, and (mic) key ids that are not in `lanes`. Spamming pads drops accuracy.
  8. `rerender()`.
- There is no scoring weight difference between perfect and good for ACCURACY (both count as one hit); the perfect/good distinction only feeds streaks, the hit-splash colour, and `perfects` in the completion payload.

### Scoring / combo rules summary
- Accuracy = `hits / (hits + misses)`; hits = perfect + good; misses = auto-misses + stray taps. Demo notes are never counted.
- Streak = consecutive PERFECT hits; broken by good hit, auto-miss or stray tap. `bestStreak` is reported on completion; battle arms its "finisher" when `bestStreak >= 8` (`FINISHER_THRESHOLD`, line 17041).
- Final accuracy excludes notes within ~180 ms of the end of the song: the completion check runs at `songT >= totalMs`, before trailing notes (e.g. the K note at 7.75 in the last rep) reach their auto-miss time, so un-played final notes are not penalised in `finalAcc`.
- No points are computed here; battle computes score from `accuracy` (host lines 17986-18001 `playerRoundScore`).

### Host integration (training, practice mode)
- Stat reward every 5 "blocks" (`blocksPerReward: 5`, play-mode tick 2.5 s => ~12.5 s per reward) from the LAST reported accuracy: `acc <= 0` -> +0 (toast "Block ended — no ... gain. Keep playing!"), `>= 0.8` -> +3 ("locked in!"), `>= 0.5` -> +2, else +1; then `x max(1, tecBpm/90)` rounded, then `x1.25` with `pc` gear, `x2` while `festivalState==='prepping'`; +10 XP per reward (lines 12768-12821).
- `onLessonComplete(idx, accuracy)`: IGNORES accuracy. If `idx >= tecLessonsCompleted` -> `tecLessonsCompleted = min(12, idx+1)`; if `idx+1 < 12` -> `tecCurrentLesson = idx+1`. If that next lesson is playable (progression + required sound owned) the `lessonIdx` prop changes at the next render and the main effect re-runs, so a fresh state for the next lesson replaces the "LESSON COMPLETE" screen almost immediately. If the next lesson is not playable (needs an unowned sound) or this was lesson 12, the host's picker falls back to the same index, `lessonIdx` does not change, and the 1.8 s hold + auto-restart replays the same lesson.
- Energy drain while playing is cut to 30% (`tickEnergyCost*0.3`), hunger 0.5, mood -0.15 (lines 12750-12752).
- Battle: `<BeatboxHero key={'p-r'+roundN} mode="battle" active={!isCountdown} bpm={115} lessonOverride={combo} accuracyBoost onStreak onLessonComplete(...)>` (18720-18730) and `mode="spectate"` for opponent turns (18736-18744).

### What is DRAWN (canvas 320 x 260/220 + DOM)
Canvas `drawCanvas` (4705-4803), every frame, in this order:
1. Background fill `#0c0a09` (Tailwind stone-950).
2. Lane backgrounds: four 80 px columns; even columns `rgba(255,255,255,0.02)`, odd `rgba(255,255,255,0.04)`. Separators: 1 px `#1c1917` at x=80,160,240. (Always draws 4 lanes.)
3. Lane flash: for each lane with age < 120 ms since its last tap/demo hit: full-height column filled with the sound's colour at alpha `(1 - age/120) * 0.30`.
4. Strike line: band `rgba(212,160,23,0.12)` from `STRIKE_Y-14`, 28 px high; solid gold `#D4A017` bar 4 px high at `STRIKE_Y-2`.
5. Notes (culled when `y < -40` or `y > TRACK_H + 40`), rect 72 x 24 px (`pad=4`, `noteH=24`, `LANE_W-8` wide) centred at `y`:
   - **Hit splash** (judged hit within 260 ms): rect `(x+2, STRIKE_Y-16, 76, 32)` at alpha `1 - age/260`, `#D4A017` for perfect, `#22d3ee` (cyan) for good; the note itself is not drawn.
   - **Judged miss:** not drawn (disappears).
   - **Demo note (ghost):** fill sound colour alpha 0.18 plus 2 px outline alpha 0.8.
   - **Player note:** solid colour fill, 4 px high white highlight strip `rgba(255,255,255,0.30)` at top, label (sound label, `bold 11px monospace`, `rgba(0,0,0,0.65)`, centred, baseline y+4).
   - Colour/label come from `getSoundDisplay(sound)` with fallback `{color:'#D4A017', label:'?'}`.
6. Phase banner at (160, 22), `bold 14px "Bebas Neue","Oswald",sans-serif`, centred: inactive -> `"GET READY"` (or `"STARTING SOON"` in spectate) `#a8a29e`; complete -> `"LESSON COMPLETE"` only in practice (`#22c55e`), none in battle/spectate; demo -> `"DEMO · LISTEN"` (spectate: `"OPPONENT · WATCH"`) `#22d3ee`; player -> `"YOUR TURN"` `#D4A017`.

DOM around the canvas (Tailwind): canvas `w-full block border-2 border-stone-800` with `aspect-ratio 320/h`; four pads (`grid grid-cols-4 gap-1`, `py-5`, `border-2` in the sound colour, background `colour + "1f"` alpha, text colour = sound colour, font Bebas Neue/Oswald 22 px, letter-spacing .15em, `active:scale-95`, key hint `A S D F` 9 px at top-right, 60% opacity), hidden in spectate and mic modes; a HUD line (hidden in spectate): left `DEMO | YOUR TURN | COMPLETE` (amber), centre `HITS n · MISS n` (amber / red-500), right `ACC n%` (rounded).
Note: HUD numbers are React state read from the ref at render time, and re-render only on taps and phase changes, so auto-misses do not update the HUD "MISS" until the next tap/phase change.

### Rebuild notes
- **Liftable pure logic** (`heroEngine.ts`): `buildNotes(lesson, bpm, mode)`, `phaseAt(songT, mode)`, `judgeTap(notes, lane, songT, windows)` (nearest un-judged player note in lane within good window; perfect if within perfect window), `tickAutoMiss`, `demoAudioDue`, accuracy, streak, completion. Make time an injectable clock so Phaser's `update(time, delta)` or the audio clock can drive it.
- **Phaser equivalents:** the canvas drawing becomes game objects (graphics/sprites); notes as sprites with `y = STRIKE_Y - dt*PPS`; lane flash and hit splash as tweens; pads as interactive containers with pointer-down; keyboard via Phaser input; HUD as text objects.
- **Fix candidates:** subtract output/input latency (add calibration), add miss feedback (the original has none), judge on the audio clock, show the 1.4 s lead-in correctly, make mic lanes work for catalog sounds (or drop mic mode from lessons 6-12), only grade completion after trailing misses are counted, make HUD live.

---

## Originality Sequencer  (lines 4961-5241)
- **What:** A 16-step beat maker used for Originality training (host 14124-14180), with save slots persisted on the character. While `active` (training running) it loops the pattern audibly and reports a creativity score that drives stat gain.

### Constants and data model (4968-5004)
- `SEQ_STEPS = 16` (16th notes = exactly 1 bar of 4/4), `SEQ_SLOTS = 4`, `SEQ_SLOTS_MPC = 8` (when `hasGear(char,'mpc')`, bought for $600, and purchase pads `oriSlots` to 8 with `_seqStarter(i % 4)`, i.e. slots 5-8 duplicate the starter names).
- **Pattern** = `{ name: string, tracks: Track[] }`; **Track** = `{ key: string, cells: boolean[16] }` where `key` is a hero key (`B|T|K|Pf`) or a `SOUND_CATALOG` id. Saved format (inside the character JSON): `char.oriSlots: Pattern[4|8]`, `char.oriSlotIdx: number`, `char.oriBpm: number`, legacy `char.oriPattern`. Migration (11200-11210): missing `oriSlots` -> starters, legacy `oriPattern` -> slot 0 named `oriPattern.name || 'Custom'`; `oriSlotIdx` reset to 0 if not in `[0, SEQ_SLOTS)`.
- `_cells(idxArr)` makes a 16-boolean array with `true` at the listed steps.
- **Starter patterns** (`_seqStarter(i)`, track order always B, Pf, T, K):

| i | name | B | Pf | T | K |
|---|---|---|---|---|---|
| 0 | Boom Bap | 0, 8 | 4, 12 | 0,2,4,6,8,10,12,14 | - |
| 1 | 4 on Floor | 0,4,8,12 | 4, 12 | 2,6,10,14 | - |
| 2 | Half-Time | 0, 6 | 8 | 0,2,...,14 | 10, 14 |
| 3 (default) | Empty | - | - | - | - |

  `_seqDefault()` = starter 0 (legacy single pattern); `_seqDefaultSlots()` = starters 0-3.
- Slot name is preserved on edit: host writes `slots[idx] = {...p, name: slots[idx]?.name || p.name}`; there is no rename UI, so names are only the starter names (the picker falls back to `"Slot n"` if a slot has no name).

### Props (5006-5019)
| Prop | Meaning |
|---|---|
| `onCreativityUpdate(score 0..1)` | Called every `evaluateEveryMs` (default 2500) while `active` |
| `active` (true) | If false: interval cleared, step reset to -1, no audio |
| `bpm` (100) | Playback tempo (parent-owned) |
| `pattern` | Legacy single pattern (used only if `slots` is absent/empty) |
| `slots` | `Pattern[]`; the slot picker renders only if truthy |
| `slotIdx` | Selected slot |
| `slotCount` | Tabs to show (4 or 8) |
| `ownedSounds` | `char.sounds`, to offer catalog sounds as extra tracks |
| `onPatternChange(pattern)` | Fired on every edit (toggle, add, remove, clear); host writes to `oriSlots[oriSlotIdx]` |
| `onSlotChange(idx)` | Tab switch |
| `onBpmChange(bpm)` | BPM step buttons |

### Behaviour
- **Active pattern:** `slots[slotIdx]`, else legacy `pattern` (if it has tracks), else starter 0. Held in local `workPattern` state, re-synced only when `slotIdx` changes.
- **Playback (5054-5075):** `setInterval(tick, stepMs)` with `stepMs = 60000 / max(40, bpm) / 4` (16th notes; 100 BPM -> 150 ms; one 16-step loop = 2.4 s). Each tick: `step = (step+1) % 16` (starts at -1, so step 0 sounds one stepMs after start), highlight current step, and for every track with `cells[step]` call `playGameSound(track.key)`. Reads the pattern from a ref, so edits are heard on the next step. The interval is rebuilt when `active` or `bpm` changes (step counter is kept across bpm changes, reset on stop).
- **Editing:** cell click (`onPointerDown`) toggles; "+ Add track" lists `availableSounds` (not already a track): all hero keys plus owned catalog sounds that are in `SOUND_CATALOG`, not hero keys, and not hero defaults (`classic_kick`, `hi_hat`, `rimshot`, `psh_snare`); "x" on the row removes a track (any track, even the last); "Clear" empties all cells but keeps tracks; BPM `-`/`+` buttons call `onBpmChange(max(60, bpm-5))` / `min(180, bpm+5)` (so the sequencer BPM range is 60-180, step 5, default `oriBpm` 100). Tracks whose key has no display metadata are skipped (not rendered, but still played if in the pattern).
- **Creativity score (5040-5051):**
  ```
  usedSounds  = number of tracks with >= 1 active cell
  activeCells = total active cells over all tracks
  creativity  = min(1, usedSounds/4)*0.5 + min(1, activeCells/24)*0.5
  ```
  Starter values: Boom Bap 3 sounds / 12 cells = 0.625; 4 on Floor 3 / 10 = 0.583; Half-Time 4 / 13 = 0.771; Empty = 0. Maximum (1.0) needs 4+ used sounds and 24+ hits (any rhythm). It does not look at rhythmic quality, uniqueness, or variation between slots.
- **Host reward mapping (12789-12797):** `cv = creativity`, `x1.25` if `studio_monitors` (not capped); `cv >= 0.8` -> +3 ("creative!"), `>= 0.5` -> +2, else +1 (there is no zero case; the first 2.5 s report has not happened so `accuracyRef` is 0 -> +1); then gear (`pc` x1.25) and festival (x2) multipliers as for Technicality.

### What is DRAWN (DOM, Tailwind)
- **Slot picker row** (if `slots`): label "Slot" (9 px uppercase stone-500) then `slotCount` flex-1 buttons; each shows `#n` (amber/70, 9 px) over the slot name (truncated, uppercase 9 px); selected = `border-amber-500 bg-amber-500/10 text-amber-500`, others `border-stone-700 text-stone-400`.
- **Step grid:** one row per track: left block (w-14): `x` remove button (stone-600, hover red) + 28 px tall label box (`border` in the sound colour, text = label in the sound colour, background `colour + "15"`, tooltip = sound name); then 16 flex-1 cells (28 px tall, 2 px gaps). Off cell: border `#44403c` and bg `#1c1917` on beat boundaries (`step % 4 == 0`), otherwise border `#292524` and bg `#0c0a09`. On cell: border and fill = sound colour. Current step gets `ring-1 ring-amber-500`. Colours via `getSoundDisplay`.
- **Add-track:** dashed button "+ Add track" (stone-500); expands to a box "Pick a sound:" with chips `"<label> · <name>"` coloured by sound plus a "cancel" chip.
- **Footer:** `-` / centre `"<bpm> BPM"` (Bebas Neue, amber, 18 px) with caption `"<n> hits · <m> sounds"` (9 px) / `+`; "Clear" button (red on hover).

### Rebuild notes
- Pure module `sequencer.ts`: `Pattern`/`Track` types, `_cells`, starters, `computeCreativity`, `padSlots(slots, target)` (MPC), `migrate(oriPattern -> oriSlots)`, `availableSounds(owned)`.
- Playback should be scheduled on the audio clock (look-ahead) in a rebuild; the original `setInterval` drifts and is throttled when the tab is hidden.
- Phaser: grid as a container of rectangles (rows x 16) with beat-boundary shading, a moving playhead highlight, slot tabs and BPM buttons as interactive objects.
- Gotchas: `onPatternChange` is invoked inside a `setState` updater (side effect in a reducer; harmless but would double-fire in React StrictMode); `migrateChar` clamps `oriSlotIdx` to `< SEQ_SLOTS` (4), so an MPC owner who last used slots 5-8 is reset to slot 0 on every load; slots 5-8 are copies of starters.

---

## Sound display helpers  (lines 5248-5284)
- `CAT_COLORS` (by `SOUND_CATALOG.cat`): Kicks `#CC2200`, Hats `#22d3ee`, Snares `#fbbf24`, Rimshot `#a78bfa`, Liproll `#f97316`, Bass `#7f1d1d`, Scratch `#84cc16`, Whistles `#67e8f9`, Clicks `#fb7185`; unknown category -> `#a78bfa`.
- `_abbrevFromName(name)`: strips `(` `)`, splits on whitespace; if >= 2 words -> first letters of the first two words uppercased; else first 2 chars uppercased.
- `getSoundDisplay(key)` -> `{key, label, color, name, isHero}` (+`cat` for catalog) or `null` for unknown keys. Hero keys use `HERO_SOUNDS` label/colour/name; catalog ids use abbreviation + category colour.
- Resulting catalog labels / colours: classic_kick `CK` red; hi_hat `BH` cyan; psh_snare `PS` yellow; inward_k `IK` yellow; throat_kick `8T` red; fast_hats `FH` cyan (parentheses stripped from "Fast Hi-Hats (TKs)"); lip_roll `LR` orange; inward_bass `IB` dark red `#7f1d1d` (low contrast on the near-black background); d_low `DS` green; laser `LW` light cyan; click_roll `CR` pink; uvular_roll `UK` red.
- Used by: BeatboxHero (notes, pads, flash), Sequencer (rows, chips), Sound Studio (cards, toasts), and a later screen at line 15549.
- **Rebuild:** pure; lift to `soundDisplay.ts`. Artists: Kick, Throat Kick, Uvular roll share one red; Hi-Hat and Fast Hats share cyan; Snare/Inward-K share yellow, which is intentional category colouring but means lanes of the same category are hard to tell apart.

---

## Sound Studio  (lines 5286-5773)
- **What:** House "Studio" tab panel (host 14196-14198) where the player records their own beatbox sounds. A sample replaces the synth for that sound everywhere in the game (any call to `playGameSound(key)`: Beatbox Hero demo and taps, sequencer, battle, open mic), and the 4 hero samples also become the mic detector's classification profiles.
- **Props:** `activeSlot: number (1..5)` (save slot; samples are per slot), `showToast(msg, type)`, `char` (for `char.sounds`).
- **Sound list (5679-5749):** the 4 hero sounds B/T/K/Pf, then each owned catalog id (`char.sounds`) that exists in `SOUND_CATALOG`, is not a hero key, and is not a hero default (so `classic_kick`, `hi_hat`, `psh_snare` are hidden because they are covered by B/T/Pf; `rimshot` is not a catalog id). Locked/unowned catalog sounds never appear, but any stored sample for them is still loaded at slot load.

### Recording constants (5313-5318, 5596-5603)
| Name | Value | Use |
|---|---|---|
| Analyser `fftSize` | 1024 | RMS over the last 1024 samples (~21 ms @ 48 kHz) |
| `ONSET_THRESHOLD` | 0.04 RMS | Waiting -> recording |
| `SILENCE_THRESHOLD` | 0.015 RMS | Silence detection |
| `SILENCE_DURATION_MS` | 120 | Continuous silence needed to auto-stop |
| `MAX_AFTER_ONSET_MS` | 1500 | Hard stop after onset |
| `MAX_TOTAL_WAIT_MS` | 4000 | Abort if no onset |
| `TRIM_THRESHOLD` | 0.02 (abs sample) | Edge trim |
| `SAFETY_LEAD_MS` / `SAFETY_TAIL_MS` | 5 / 30 | Kept around the trimmed region |
| `MAX_LEN_MS` | 600 | Final sample cap |
| Min length | 20 ms | Shorter = failure |
| Peak normalise target | 0.85 | Gain = 0.85 / peak |

### Flows
- **Mic setup (`ensureMicReady`, 5335-5382):** reuses stream+analyser if present; else permission states as in the detector: `'insecure'` ("Mic requires HTTPS. Use a hosted URL."), `'denied'` ("Mic API not available in this browser."), `getUserMedia` with the same three processing flags disabled; error mapping: `NotAllowedError` -> "Mic permission denied.", `NotFoundError` -> "No mic found.", `SecurityError` -> "Browser blocked mic. Need HTTPS."; detail shown as `"<name>: <msg>"`. Stream, analyser and the meter loop stay alive until the panel unmounts (the browser mic indicator stays on while the tab is open).
- **Meter loop (`ensureMeterLoopRunning`, 5385-5433):** one rAF loop, idempotent; each frame: RMS of the 1024-sample time-domain buffer -> `micLevel` -> meter (same colour thresholds 0.04 / 0.15 and `level*250 %` as the detector) and drives the auto-record state machine below; never breaks the loop.
- **Record (`recordSound(key)`, 5494-5592):** needs `activeSlot` (else toast "Need an active character first"); aborts any current recording; `ensureMicReady`; sets `recordingKey=key`, status `'waiting'` ("WAITING FOR SOUND…"); creates `new MediaRecorder(stream)` (browser-default mime, typically webm/opus) and calls `start()` IMMEDIATELY (it records the waiting period too; no timeslice, so a single chunk is delivered on stop). Auto state machine each frame: not yet onset: `rms > 0.04` -> onset recorded, status `'recording'` ("RECORDING…", card turns red); or `elapsed > 4000` -> `stopRecorder('no-onset')` + toast "No sound detected — try again". After onset: `rms < 0.015` continuously for 120 ms -> stop (`'silence'`); `sinceOnset > 1500` -> stop (`'max-duration'`).
- **On stop (`recorder.onstop`, 5530-5581):** blob from chunks -> `arrayBuffer` -> `ctx.decodeAudioData` -> `processSample` -> if null: toast "Recording too short — try again"; else `saveSampleForSlot(activeSlot, key, buffer)`, refresh UI, toast `"✓ <name> recorded"` (win), and `setTimeout(() => playGameSound(key), 200)` as a preview. Decode/other errors -> toast "Recording failed — try again". Other toasts: "Recording not supported on this browser", "Recorder error", "Recorder failed to start".
- **`processSample(ctx, buf)` (5596-5629):** mono channel 0 only; trim leading samples with `|x| < 0.02` then back off 5 ms; trim trailing similarly then add 30 ms; cap length to 600 ms; reject if < 20 ms; normalise peak to 0.85; returns a new mono `AudioBuffer` at the source sample rate. No fades, filtering, pitch or noise gate.
- **Preview:** "Play" button -> `playGameSound(key)` (custom sample or synth); disabled while that key is recording.
- **Stop button (`abortRecording`, 5472-5491):** while recording; stops the recorder, clears chunks and UI state (but see gotcha: the sample may still be saved).
- **Delete / assign:** "Reset" (only when a custom sample exists) -> `deleteSampleForSlot` + toast `"<name> reset to default"` (info). "Reset all sounds to default" (shown if any sample exists across all 16 keys) -> `deleteAllSamplesForSlot` + toast "All sounds reset to default". "Assigning" is implicit: a recording saved under card X replaces the sound X everywhere; there is no multi-assign, no rename, no waveform/trim editor, no import, no per-sample volume or pitch.
- **Recovery:** "Stuck? Tap to reset recording state" (shown while `recordingKey` is set) calls `abortRecording()` + `resetRecordingState()`.
- **Storage:** IndexedDB database `beatbox-story-samples` v1, object store `samples` (out-of-line keys), key `slot{N}:sample-{key}` where `key` is one of B, T, K, Pf or a catalog id; value `{ float32: Float32Array (copy of channel 0), sampleRate }`. In memory: `HERO_SAMPLES[key] = AudioBuffer` (set before the IDB write, so a session still works if IDB fails; IDB errors are swallowed). `loadSamplesForSlot(n)` loads all 16 keys (4 hero + 12 catalog) sequentially at app start (11278), slot switch (11346) and new-slot creation (11353). Playback of a sample: `BufferSource -> Gain(1.0) -> destination`, `start(0)`, fully polyphonic, no choke.
- **Not stored in the character save:** the character JSON has no sample data; deleting a character slot does not delete its samples (see gotchas).

### What is DRAWN (DOM, Tailwind; `Panel title="Sound Studio"`)
- Intro line (10 px uppercase stone-500): "Record your own beatbox sounds. They'll replace the defaults across the game."
- Live mic meter (only when granted): label `"🎤 Mic level"` + `"<n>%"` (mono), 8 px bar as above.
- Error box when denied (`border-red-900 bg-red-950/30`): header "Mic unavailable" + `errorDetail`.
- One card per sound (`border-2 p-3 flex gap-3`): 48 x 48 tile with label (mono 18 px, colour border/tint `colour + "15"`), name in Bebas Neue uppercase, status line (10 px): waiting/recording -> red `#ef4444` and card `border-red-500 bg-red-950/30`; custom -> `"✓ CUSTOM SAMPLE"` amber `#D4A017`, card `border-amber-500 bg-amber-500/5`; default -> `"DEFAULT SYNTH"` (hero) or `"CATALOG SYNTH"` (catalog) grey `#78716c`. Right column of buttons: `REC` (red) / `✕ Stop`, `▶ Play`, `Reset`. Other cards' REC is disabled while one is recording.
- Footer: "Reset all sounds to default" full-width, "Stuck?..." recovery, tip text "Tip: tap REC, wait for 'WAITING FOR SOUND', then make the sound clearly. Recording auto-stops on silence."

### Rebuild notes
- Pure/liftable: `processSample` (as a function over `Float32Array`+`sampleRate`), the onset/silence/timeout state machine (as `step(rms, now) -> 'idle'|'waiting'|'recording'|'stop:{reason}'`), `getSoundDisplay`, key naming, IndexedDB wrapper (`idbGet/Put/Delete`, `slot{N}:sample-{key}`; keep the key scheme to read existing players' data), `recordToBuffer`.
- Needs a browser-API wrapper outside Phaser: `getUserMedia`, `MediaRecorder`, `decodeAudioData`, `AudioContext` (use the Phaser Web Audio context via `this.sound.context` to avoid two contexts). The panel UI becomes a Phaser scene or DOM overlay; React `Panel`/Tailwind styling needs an equivalent.
- Better design: record straight from an AudioWorklet/ScriptProcessor into a Float32Array (no MediaRecorder + decode round-trip, no opus coloration), add waveform preview and manual trim, and skip normalising pure noise.

---

## Suggested module split for the TypeScript rebuild

| Module | Contents (source lines) | Framework-free? |
|---|---|---|
| `heroLessons.ts` | `HERO_LANES`, generators (4031-4175), `HERO_LESSONS` (4190-4213), `STYLE_BEATS`/`STYLE_COLORS`/`styleMatchup` (4177-4188) | yes |
| `heroEngine.ts` | `initState` note building, phase-by-time, `judgeTap`, auto-miss, demo-audio due check, accuracy/streak, completion (4533-4880 logic only) | yes (inject clock + `playSound`) |
| `heroScene.ts` (Phaser) | `drawCanvas` visuals (4705-4803), pads, HUD, keyboard A/S/D/F | no (Phaser) |
| `micDsp.ts` | `_fftMag`, `_bandProfile`, `_profileFromBuffer`, `_DEFAULT_PROFILES`, cosine classify, onset tracker (4222-4317, 4385-4431) | yes |
| `micInput.ts` | `getUserMedia` + `AnalyserNode` + permission states (4341-4383) | browser API wrapper |
| `sequencer.ts` | constants, `_cells`, starters, `computeCreativity`, slot padding/migration, available-sound filter (4968-5004, 5040-5051, 5114-5119) | yes |
| `sequencerScene.ts` (Phaser) | slot tabs, 16 x N grid, playhead, BPM buttons, add-track picker (5126-5238) | no |
| `soundDisplay.ts` | `CAT_COLORS`, `_abbrevFromName`, `getSoundDisplay` (5249-5284) | yes |
| `sampleProcessing.ts` | `processSample` (5596-5629), onset/silence/timeout state machine (5399-5428) | yes |
| `sampleStore.ts` | IndexedDB wrapper and `slot{N}:sample-{key}` scheme (17270-17380, outside range) | browser API wrapper |
| `studioScene.ts` (Phaser/DOM) | cards, REC/Play/Reset buttons, mic meter, toasts (5651-5772) | no |

Keep one shared `AudioContext` (Phaser's `this.sound.context`) for synth, sample playback and mic analysis; the original shares a single lazy context and honours the `muted` setting by returning null from its getter.

---

## Appendix A. Exact note lists per lesson (generated by running the real generators)

Format `beat:sound`, sorted by beat, **bar 1 only (beats 0-3.99)**. Bar 2 (beats 4-7.99) is the same list with +4 on every beat. Lane = index of the sound in that lesson's `lanes` (0-3 left to right).

| # | Lesson | Bar 1 notes |
|---|---|---|
| 1 | BOOM BASIC | 0:B 1:B 2:B 3:B |
| 2 | BACKBEAT | 0:B 1:Pf 2:B 3:Pf |
| 3 | HI-HAT 8THS | 0:T 0.5:T 1:T 1.5:T 2:T 2.5:T 3:T 3.5:T |
| 4 | KIT GROOVE | 0:B 0.5:T 1:Pf 1.5:T 2:B 2.5:T 3:Pf 3.5:T |
| 5 | WITH RIMSHOT | as KIT GROOVE + 3.75:K (bar 2 adds 7.75:K) |
| 6 | LIP ROLL DRILL | 0:B 0.5:T 1:Pf 1.5:lip_roll 2:B 2.5:T 3:Pf 3.5:lip_roll |
| 7 | 808 THROAT | 0:throat_kick 0.5:T 1:Pf 1.5:T 1.75:throat_kick 2:throat_kick 2.5:T 3:Pf 3.5:T |
| 8 | FAST HATS | 0:B 0:fast_hats 0.5:fast_hats 1:Pf 1:fast_hats 1.5:fast_hats 2:B 2:fast_hats 2.5:fast_hats 3:Pf 3:fast_hats 3.5:fast_hats |
| 9 | INWARD SNARE | 0:B 0:T 0.5:T 0.75:K 1:inward_k 1:T 1.5:T 2:B 2:T 2.5:T 2.75:K 3:inward_k 3:T 3.5:T |
| 10 | INWARD BASS | 0:inward_bass 0:T 0.5:T 1:Pf 1:T 1.5:T 1.75:inward_bass 2:inward_bass 2:T 2.5:T 3:Pf 3:T 3.5:T |
| 11 | CLICK ROLL | 0:B 0:T 0.5:T 1:Pf 1:T 1.5:T 2:B 2:T 2.5:T 3:Pf 3:T 3.5:T 3.5:click_roll |
| 12 | UVULAR FINALE | 0:uvular_roll 0:fast_hats 0.5:fast_hats 1:inward_bass 1:fast_hats 1.5:fast_hats 1.75:click_roll 2:uvular_roll 2:fast_hats 2.5:click_roll 2.5:fast_hats 3:inward_bass 3:fast_hats 3.5:fast_hats 3.75:click_roll |

Simultaneous notes (same beat, different lane) are normal (lessons 8-12): the player must hit two lanes at once; with taps that means two fingers/keys, with mic it is impossible (one onset = one key).

Typical millisecond spacing at the default 90 BPM: quarter 666.7, 8th 333.3, 16th 166.7. At 140 BPM: 428.6 / 214.3 / 107.1.

---

## Appendix B. Suggested TypeScript shapes (derived from the code, not in the source)

```ts
type HeroKey = 'B' | 'T' | 'K' | 'Pf';
type CatalogId = 'classic_kick'|'hi_hat'|'psh_snare'|'inward_k'|'throat_kick'|'fast_hats'
               | 'lip_roll'|'inward_bass'|'d_low'|'laser'|'click_roll'|'uvular_roll';
type SoundKey = HeroKey | CatalogId;
type StyleTag = 'BOOM' | 'HATS' | 'RIM' | 'SNARE';

interface HeroNoteDef { beat: number; sound: SoundKey }            // beat in quarter notes
interface HeroLesson {
  name: string; desc: string; tier: 1|2|3|4; style: StyleTag;
  pattern: HeroNoteDef[];
  requires?: CatalogId;                                            // sound must be owned
  lanes?: [SoundKey, SoundKey, SoundKey, SoundKey];                // default ['B','T','K','Pf']
  patternBeats?: number;                                           // default 8; battle combos use 16
}
type HeroMode = 'practice' | 'battle' | 'spectate';
type HeroPhase = 'demo' | 'player' | 'complete';
interface HeroNote {
  id: string; time: number; sound: SoundKey; lane: number; isDemo: boolean; rep: number;
  hit: boolean; judged: boolean; hitTime: number; hitGrade: 'perfect' | 'good' | null;
}
interface HeroRunState {
  lesson: HeroLesson; lessonIdx: number; bpm: number; lanes: SoundKey[];
  beatMs: number; patternMs: number; totalMs: number; notes: HeroNote[];
  startTime: number;                                               // now + 1400
  hits: number; misses: number; perfects: number; streak: number; bestStreak: number;
  laneFlash: Record<string, number>; audioScheduled: Set<string>;
  phase: HeroPhase; completeAt: number; completionFired: boolean; mode: HeroMode;
}
interface HeroCompletion { lessonIdx: number; accuracy: number; bestStreak: number; perfects: number }

interface SeqTrack { key: SoundKey; cells: boolean[] }              // length 16
interface SeqPattern { name: string; tracks: SeqTrack[] }
// character fields: oriSlots: SeqPattern[] (4 or 8), oriSlotIdx: number, oriBpm: number

interface StoredSample { float32: Float32Array; sampleRate: number } // IDB key `slot${n}:sample-${key}`
type MicProfile = [number, number, number, number, number];         // 5 band fractions, sum = 1
```

---

## Appendix C. Strings and toasts (for localisation / parity)

- Hero: `GET READY`, `STARTING SOON`, `OPPONENT · WATCH`, `DEMO · LISTEN`, `YOUR TURN`, `LESSON COMPLETE`; HUD `DEMO | YOUR TURN | COMPLETE`, `HITS`, `MISS`, `ACC`.
- Mic panel: `listening`, `paused — demo playing`, `requesting mic…`, `mic denied`, `needs https`, `idle`; errors `Mic requires HTTPS.`, `Mic API unavailable.`, `No audio context.`, `Mic permission denied.` (fallback to the browser message).
- Sequencer: `Slot`, `Slot n` (fallback label), `+ Add track`, `Pick a sound:`, `cancel`, `<bpm> BPM`, `<n> hits · <m> sounds`, `Clear`.
- Studio: `Sound Studio`; `Record your own beatbox sounds. They'll replace the defaults across the game.`; `Mic level`; `Mic unavailable`; `WAITING FOR SOUND…`; `RECORDING…`; `✓ CUSTOM SAMPLE`; `DEFAULT SYNTH`; `CATALOG SYNTH`; `REC`; `✕ Stop`; `▶ Play`; `Reset`; `Reset all sounds to default`; `Stuck? Tap to reset recording state`; tip line; toasts: `Need an active character first` (bad), `No sound detected — try again` (bad), `Recording too short — try again` (bad), `Recording failed — try again` (bad), `Recording not supported on this browser` (bad), `Recorder error` (bad), `Recorder failed to start` (bad), `✓ <name> recorded` (win), `<name> reset to default` (info), `All sounds reset to default` (info). Errors (settings): `Mic requires HTTPS. Use a hosted URL.`, `Mic API not available in this browser.`, `Mic permission denied.`, `No mic found.`, `Browser blocked mic. Need HTTPS.`, `<ErrorName>: <message>`.
- Host training text referencing this range: `BEATBOX HERO · TAP TO START` / `Hit the notes in time → up to ×3 stat gain`, `BEAT SEQUENCER · TAP TO START` / `Program your beats → up to ×3 stat gain`, `Tip: headphones recommended · mic pauses during the demo`, `×<mult> bonus` / `normal pace`, `+<n> Technicality (locked in!)` etc.

---

## Appendix D. Mount sites (exact prop values)

| Where | Component | Props |
|---|---|---|
| House > Technicality play mode (13990-14095) | `BeatboxHero` | `mode` default practice, `inputMode={tecInputMode}` ('tap' default, toggle 'mic'), `accuracyBoost = (premium_headphones?1.25:1) * (mic gear?1.15:1)`, `bpm = char.tecBpm \|\| 90` (60-140 step 5), `lessonIdx = currentIdx`, `evaluateEveryMs=2500`, `active = trainActivity.active`, `onAccuracyUpdate=handleAccuracy` (stores to ref), `onLessonComplete` as described |
| Battle player round (18720-18730) | `BeatboxHero` | `key=p-r{n}`, `mode="battle"`, `active={!isCountdown}`, `bpm=115`, `lessonOverride=combo`, `accuracyBoost = premium_headphones ? 1.25 : 1`, `onAccuracyUpdate` no-op, `onStreak=handleStreak`, `onLessonComplete=(_, acc, info) => handlePlayerRoundComplete(n, acc, info)` |
| Battle opponent round (18736-18744) | `BeatboxHero` | `key=o-r{n}`, `mode="spectate"`, `active`, `bpm=115`, `lessonOverride=combo`, no-op callbacks |
| House > Originality play mode (14143-14174) | `Sequencer` | `bpm = char.oriBpm \|\| 100`, `slots=char.oriSlots`, `slotIdx = char.oriSlotIdx \|\| 0`, `slotCount = mpc ? 8 : 4`, `ownedSounds = char.sounds`, `evaluateEveryMs=2500`, `active = trainActivity.active`, `onCreativityUpdate=handleAccuracy`, `onPatternChange` writes the active slot (rebuilding/padding `oriSlots` to the target length), `onSlotChange` -> `oriSlotIdx`, `onBpmChange` -> `oriBpm` |
| House > Studio tab (14196-14198) | `SoundStudio` | `activeSlot` (1..5), `showToast`, `char` |

---

## Appendix E. Parity checklist (tick each when the rebuild matches)

Beatbox Hero
- [ ] 12 lessons with the exact names, descs, tiers, styles, `requires`, lanes and beat lists (Appendix A), using only beats 0-7.99 for normal lessons
- [ ] Unlock chain: lesson i playable iff `i <= tecLessonsCompleted` and required sound owned; selector falls back to the highest playable index at or below the stored one
- [ ] Practice = 4 reps x 8 beats, DEMO/YOU/DEMO/YOU, demo notes drawn as ghosts and played through audio; player notes solid with label
- [ ] 1400 ms lead-in, 1400 ms lookahead, strike line at `TRACK_H - 56`
- [ ] Windows 110/180 ms (tap) and 200/350 ms (mic) x `accuracyBoost`; nearest-note-in-lane matching; perfect/good grade; auto-miss at `time + goodWindow`
- [ ] Stray tap = miss; streak = consecutive perfects; reset on good/miss/stray; `onStreak` semantics
- [ ] Accuracy = hits / (hits + misses), reported every 2.5 s cumulatively; HUD hits/miss/acc
- [ ] Completion payload `(lessonIdx, finalAcc, {bestStreak, perfects})`; practice auto-restart after 1.8 s; battle/spectate stop at complete
- [ ] Modes: practice, battle (1 rep, 16-beat combos via `lessonOverride`, 115 BPM, canvas 220 high), spectate (demo only, no pads/HUD, "OPPONENT · WATCH")
- [ ] Keyboard A S D F, pads with key hints, lane flash 120 ms @ 30% alpha, hit splash 260 ms (gold perfect / cyan good)
- [ ] Taps play the sound (not in mic mode); demo notes play at the strike line
- [ ] BPM control in host 60-140 step 5 with `x max(1,bpm/90)` reward bonus; stat reward thresholds 0.8 / 0.5 and zero-accuracy = 0
- [ ] Style cycle and `styleMatchup` 1.5 / 0.7 / 1.0 (Appendix matrix) wired into battle scoring

Mic detector
- [ ] getUserMedia with echoCancellation / noiseSuppression / autoGainControl all false; HTTPS and permission error states and texts
- [ ] 2048-sample window, RMS onset: floor 0.04, 2x EMA(0.95/0.05), 80 ms cooldown, paused during demo/complete
- [ ] Hann FFT -> 5 band fractions (40-150-500-2000-6000-14000 Hz) -> cosine similarity vs 4 profiles; default profile table; learned profile from recorded samples (peak - 512 samples window)
- [ ] Meter (level x250 %, thresholds 0.04 / 0.15), per-key learned indicator, last-detected label
- [ ] Decide and document the mic-vs-catalog-lane behaviour (gotcha 3)

Sequencer
- [ ] 16 steps at 16th-note resolution, `stepMs = 60000 / max(40,bpm) / 4`; tracks B/Pf/T/K by default plus owned catalog sounds; add / remove / clear; BPM 60-180 step 5
- [ ] 4 slots (8 with MPC); starter patterns Boom Bap / 4 on Floor / Half-Time / Empty; name preserved; migration from legacy `oriPattern`; MPC purchase pads slots to 8
- [ ] Creativity formula `0.5*min(1,sounds/4) + 0.5*min(1,cells/24)`; reported every 2.5 s; host thresholds 0.8 / 0.5 (+25% studio monitors)
- [ ] Cell, beat-boundary and playhead visuals; slot tabs `#n` + name

Sound Studio
- [ ] Cards for B/T/K/Pf + owned catalog sounds (excluding hero defaults); status text, REC / Stop / Play / Reset, Reset all, Stuck recovery
- [ ] Auto-record state machine (0.04 onset, 0.015 silence for 120 ms, 1500 ms max after onset, 4000 ms no-onset abort)
- [ ] `processSample` (trim 0.02, lead 5 ms, tail 30 ms, cap 600 ms, min 20 ms, normalise 0.85, mono)
- [ ] IndexedDB `beatbox-story-samples` / `samples` / key `slot{N}:sample-{key}` / `{float32, sampleRate}`; load all 16 keys on slot load; per-slot isolation (and decide about orphan samples when a slot is deleted)
- [ ] Custom samples used by every `playGameSound` path and by mic profiles; synth fallback otherwise; mute disables audio and mic

---

## OPEN QUESTIONS / GOTCHAS

**Design/spec questions**
1. Is the intended lesson length 8 beats or 16? Comments say 4-bar/16-beat; code uses 8 (`patternBeats ?? 8`); half of every generator is unused. Pick one for the rebuild (the 8-beat rule is what players experience).
2. Should lesson completion require accuracy? Today `onLessonComplete` ignores accuracy: doing nothing for a whole run still unlocks the next lesson (the host only checks `idx >= tecLessonsCompleted`). Likely unintended.
3. Mic mode and lessons 6-12: `MicBeatboxDetector` only emits B/T/K/Pf, so catalog lanes (lip_roll, throat_kick, fast_hats, inward_k, inward_bass, click_roll, uvular_roll) can never be hit by mic. Any detection whose key is not one of the lesson's lanes is a stray miss (`lanes.indexOf` = -1): B is absent from lanes in lessons 7, 10, 12; T in 8, 12; K in 6, 11, 12; Pf in 9, 12. Lesson 12 has no hero lane at all, so it is unplayable by mic. Also, because the classifier always picks one of four keys and notes in lessons 1-3 sit in only 1-3 of them, wrong classifications are common misses. Decide: restrict mic mode to lessons 1-5 or extend the classifier to catalog sounds.
4. Does the "premium headphones / mic gear" boost intentionally apply to tap mode too? Gear text says mic mode, code applies to both.
5. `SOUND_UNLOCKS` makes sounds milestone-gated, but lesson text still says "(buy in shop)" (line 14044).
6. Creativity formula only rewards variety + density (4 tracks x 6 hits = max). Intended? Should uniqueness vs earlier loops/duplicated slots matter ("originality")?
7. MPC slots 5-8 duplicate starters (names repeat); slot rename is impossible.

**Bugs / oddities (confirm before copying behaviour)**
8. Stale closures: the main loop effect depends only on `[lessonIdx]`, so `HIT_GOOD_MS` used by auto-miss and `REPS_TOTAL` are frozen at mount. Toggling tap<->mic or buying headphones mid-lesson changes `handleTap`'s windows but not the auto-miss window, so e.g. in mic mode notes are auto-missed 180 ms (not 350 ms) after their time while a tap would still be accepted until 350 ms.
9. Practice lead-in: phase flips to `'player'` for the first 1.4 s (`floor(negative)%2`), taps then are stray misses; banner flashes "YOUR TURN" before "DEMO".
10. HUD "MISS"/"ACC" do not update on auto-misses (only on taps/phase changes); the accuracy reported to the host is still correct.
11. Final accuracy omits trailing notes inside the last ~180 ms (completion fires before their auto-miss), e.g. the 7.75 K note.
12. Keyboard A/S/D/F is registered while the component is mounted even when `active` is false (battle pre-countdown): presses play sounds and flash lanes, and since the song clock runs from mount time and battle phase starts as `'player'` they can even be judged; the state is fully reset when `active` turns true, so it is harmless except for the extra sound.
13. Mic detector: "detected" label never clears (stale `lastDetected`); the EMA is per frame (display-refresh dependent); the FFT is taken at first threshold crossing (window mostly pre-attack); no similarity floor (every onset is assigned a key, so coughs/ambient peaks register); onset floor 0.04 RMS with AGC disabled can miss quiet mics; `permission==='denied'` has no fallback to pads except toggling input mode in the host.
14. Studio "Stop" does not discard: `abortRecording` clears `recordedChunksRef` synchronously right after `recorder.stop()`, but `ondataavailable` (single chunk, because `start()` is called without a timeslice) fires after the clear, so `onstop` sees a non-empty chunk list and processes + saves the sample (or toasts "too short" if it was silence). Likely behaves as "stop and keep".
15. Studio "no onset" path: `stopRecorder('no-onset')` also lets `onstop` run (chunks are not cleared), so you may get two toasts ("No sound detected" then "Recording too short"), and if room noise exceeds the trim threshold 0.02 peak (but stays under the 0.04 RMS onset floor), a 600 ms normalised-to-0.85 noise sample can be SAVED as the custom sound.
16. Mute interaction: `getAudioCtx()` returns null when muted. Recording then fails with a cryptic `TypeError` (`createMediaStreamSource` of null) and shows "Mic unavailable"; `loadSamplesForSlot` while muted deletes every in-memory sample (`recordToBuffer` returns null) until the next slot load.
17. Orphan samples: `deleteSlotAt` (11359) never deletes IndexedDB samples; creating a new character in that slot reloads the old character's custom sounds via `loadSamplesForSlot(n)` (11353).
18. `mountedRef` in SoundStudio is set false in effect cleanup and never reset, so React StrictMode double-mount would permanently disable the Studio's async paths in dev. The panel re-renders ~60x per second (`setMicLevel` each frame) and so does the detector.
19. Saved-slot index guard: `migrateChar` clamps `oriSlotIdx` to `< 4` even for MPC owners (see Sequencer notes).
20. `STYLE_BEATS` comment calls it rock-paper-scissors but it is a 4-cycle; opposite styles are neutral (matrix above).
21. `_patSyncoKick` and `_patOffbeatHat` are unused; `HERO_SOUNDS.K.defaultSound = 'rimshot'` is not a `SOUND_CATALOG` id (harmless but explains why no catalog Rimshot colour is ever used).
22. Hero-sound custom samples are stored under B/T/K/Pf, but catalog ids `classic_kick/hi_hat/psh_snare` (hidden in the Studio) are separate keys that can never have a sample. `playGameSound` call sites: BeatboxHero (4604, 4872), Sequencer (5069), Studio (5572, 5734), OpenMicPerformance (15231) and the Showcase MPC pad grid (15523, which iterates owned sound ids, so pressing the `classic_kick` pad plays the synth, not the player's recorded Kick). The busk `RhythmTap` (2643) calls `playHeroSound` directly with hero keys.

**Timing facts to keep for parity**
- Windows: tap 110/180 ms, mic 200/350 ms, x`accuracyBoost`; lookahead 1400 ms; practice 4 reps x 8 beats; battle 1 rep x 16 beats at 115 BPM; auto-restart 1800 ms after completion (practice only); demo audio fires when the note reaches the strike line if within 200 ms; hit splash 260 ms; lane flash 120 ms; accuracy report every 2500 ms; training BPM 60-140 step 5 (default 90); sequencer BPM 60-180 step 5 (default 100); mic cooldown 80 ms; mic onset floor 0.04; dynamic threshold 2x EMA(0.95/0.05); Studio onset 0.04 / silence 0.015 for 120 ms / max 1500 ms after onset / 4000 ms wait / 600 ms cap / normalise 0.85.
