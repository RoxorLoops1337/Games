# TRAINING_PLAN: training, skill games, metronome, sound unlocks

Owner brief (RoxorLoops): during the sound games the music is OFF. Rhythm games only get a small shaker as a metronome. Every skill can be
trained two ways: IDLE (time runs on the day clock, skill points tick up in a satisfying way, no input needed) or PLAY (an active mini game:
less in-game time, about DOUBLE the gain). Ear training has levels with clear lessons a musical beginner understands. Rhythm training uses real,
known beatbox patterns that level up. Originality = make your own beats. Showmanship = a pose Simon Says (PaRappa style). The recording studio
lets you record your own sounds, and new sounds (lip roll, throat bass, ...) unlock as you progress and meet other beatboxers.
Works in 3D (`?r=3d`) first; the 2D game must keep working (it may offer IDLE only for the new games). No em dashes anywhere.

## 1. Core contract (core.js, owner CORE; everyone else codes against exactly these names)
* `Core.TRAIN = { mus:{game:'ear', alt:'tune'}, tech:{game:'beat'}, ori:{game:'make'}, show:{game:'pose'} }` plus tuning constants `TRAIN_CFG`
  `{ idleRatePerHour, idleMinStep:15, idleMaxMinutes:240, playMul:2, playMinutes:{ear:20,tune:20,beat:20,make:25,pose:20}, levelMax:8 }`.
* `{t:'trainIdle', stat, minutes}`: advances the clock by `minutes` (15 min steps, respects collapse/closing rules like `spend`), drains energy,
  gains `idleGain(ch, stat, minutes)` (diminishing with current stat like today's `train`), XP too. Emits `fx` `{t:'trainTick', stat, gain, minute}`
  every 15 min of the session so the UI can pop "+0.4" numbers one by one. Studio location keeps its x1.4 bonus and fee.
* `{t:'trainGame', stat, game, level, q, minutes?}`: q 0..1 from the mini game; gain = `idleGain` for `playMinutes[game]` x `playMul` x
  `levelMul(level)` x (0.4 + 0.6 q); spends only `playMinutes[game]` (or a.minutes); unlocks the next level when q >= 0.7:
  `ch.trainLv = { ear:1, beat:1, pose:1, make:1, tune:1 }` (new save field, defaulted on load), returns fx `{t:'levelUp', game, level}`.
  `levelMul(l) = 1 + 0.18 (l - 1)`. Old actions `train`, `tune`, `seqtrain` keep working unchanged (2D game, tests).
* `Core.EAR_LEVELS` (8): `{ level, id, name, ask, lesson:{title, text, examples:[{label, notes:[midi...], chord?:bool}]}, rounds, choices:[...] }`
  1 higher or lower (two notes), 2 same or different, 3 step or leap, 4 major or minor chord, 5 octave or fifth, 6 major third or minor third,
  7 fourth or fifth, 8 name the interval (minor 3rd, major 3rd, 4th, 5th, octave). Each lesson explains in plain words for beginners,
  e.g. "A major third sounds bright and happy, like the start of 'Oh When the Saints'. A minor third sounds sad."; examples are playable.
* `Core.BEAT_LEVELS` (8), real known beatbox patterns, as lane strings over 8 or 16 steps (B kick, t hat, K snare, P pf/clap, . rest):
  1 "B t K t" boots and cats, 2 "B t t B K t" ("boots ti ti boots cats ti"), 3 "B t t t K t t t", 4 boom bap "B . t B K . t .",
  5 "B t K B B t K t", 6 add Pf "B t K t B P K t", 7 drum and bass "B . K . . B K .", 8 double time 16 steps mix. Each with `name`, `bpm`, `tip`.
* `Core.POSE_LEVELS` (8): `{ level, len (3..8), moves:[...], bpm }` moves from `['left','right','duck','jump','point','spin','freeze','clap']`.
* Sounds: `Core.SOUNDS = [{ id, name, lane?, blurb, unlock:{ k:'start'|'level'|'npc'|'win'|'ach'|'day', v } }]` starting set B, t, K, Pf;
  unlockables at least LR lip roll (meet BeeAmGee coaching or level 4), TB throat bass (beat an opponent), IK inward K snare (level 6),
  CR click roll (Sound Lab day 4), ZP zipper (win a battle night), SI siren (level 10), WB water drop (meet Miro), RIM rimshot (level 3).
  `Core.soundUnlocked(ch, id)`, `Core.soundsFor(ch)`, new save field `ch.sounds` (ids), unlock checked in `Core.apply` after relevant
  actions (meeting NPCs, wins, level ups), emits fx `{t:'soundUnlocked', id}` and a toast "New sound: Lip roll". Recorder can record any
  unlocked sound id (slots keyed by id), Beat Maker gets extra rows for unlocked sounds.
* Tests: extend tests/beatbox_heroes_core.test.mjs for all of the above (idle gain monotonic and diminishing, play gives about 2x for less
  time, level unlocks, save migration of old saves without trainLv/sounds, every SOUNDS unlock rule reachable).

## 2. Audio contract (audio.js, owner AUDIO)
* `Audio.gameMode(on, {metronome: bpm | 0})`: on = stop/duck the scene music completely; metronome = a soft shaker tick (quarter notes,
  accent on 1) at bpm until gameMode(false). `Audio.shaker(accent)` single tick.
* `Audio.note(midi, dur, {timbre:'keys'})`, `Audio.chord([midi...], dur)`, `Audio.interval(a, b, {melodic:true})` clean piano-like tones for ear training.
* Synth voices for every `Core.SOUNDS` id (`Audio.drum(id)` / `Audio.beatbox(id)`), recorded samples override them like today.

## 3. Owners
| role | files |
|---|---|
| CORE | core.js, tests/beatbox_heroes_core.test.mjs |
| AUDIO | audio.js, tests/beatbox_heroes_audio.test.mjs |
| TRAIN (training menu, idle training, ear training, singing) | r3/scenes_train.js (new), park3d/mg_ear*.js (new), park3d/mg_tuner*.js, r3/scenes_mini.js (tuner/run parts), r3/spotmap.js (training spots), places.js (trainRows hook lines) |
| BEAT (rhythm training levels + metronome in all rhythm games) | park3d/mg_rhythm*.js, r3/scenes_rhythm.js, rhythm.js (hook lines) |
| POSE (showmanship game) | park3d/mg_pose*.js (new), r3/scenes_pose.js (new) |
| STUDIO (recorder with unlockable sounds, Beat Maker originality with idle/play, unlock moments) | minigames.js (seq + studio parts), samples.js, r3/scenes_mini.js (seq/studio parts only) |
Shared files (scenes_mini.js, minigames.js, mg_index.js, index.html, package.json): use small Edit operations only, never rewrite the whole file.
mg_index.js: add your one registry line. index.html: add your one script tag.
